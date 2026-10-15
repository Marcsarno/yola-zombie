# Retarget a cleaned MediaPipe motion (clean.py output, character frame C: X left, Y up, Z forward, metres) onto
# Yola's Mixamo rig as a new action. Runs in Blender (background) on characters.blend.
# usage: blender -b characters.blend --python retarget_mocap.py -- <combo.json> <action_name> [grip_action] [grip_frame]
import bpy, sys, json, math
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
src, name = argv[0], argv[1]
grip_action = argv[2] if len(argv) > 2 else 'bat_swing'
grip_frame = int(argv[3]) if len(argv) > 3 else 24
D = json.load(open(src))
arm = bpy.data.objects['YOLA']
P = lambda n: 'mixamorig:' + n
bones = arm.data.bones
R = {b.name: b.matrix_local.copy() for b in bones}  # armature-space rest matrices
head = lambda n: R[P(n)].to_translation()

# ---- the character frame in armature space, from the rest skeleton ----
up_a = (head('Head') - head('Hips')).normalized()
left_a = (head('LeftUpLeg') - head('RightUpLeg')); left_a = (left_a - up_a * left_a.dot(up_a)).normalized()
fwd_a = left_a.cross(up_a).normalized()  # (left = up x fwd  =>  fwd = left x up)
foot_min = min((R[b.name].to_translation()).dot(up_a) for b in bones if 'Toe' in b.name or 'Foot' in b.name)
hip_rest = head('Hips')
yola_hip_h = hip_rest.dot(up_a) - foot_min
frames = D['frames']
mocap_hip_h = sorted(fr['p'][23][1] * 0.5 + fr['p'][24][1] * 0.5 for fr in frames)[len(frames) // 2]
k = yola_hip_h / mocap_hip_h
ground0 = hip_rest - up_a * yola_hip_h  # the floor point under the rest hips
def A(p):  # mocap C position (metres) -> armature space
    return ground0 + (left_a * p[0] + up_a * p[1] + fwd_a * p[2]) * k
print('frame: up', tuple(round(v, 3) for v in up_a), 'fwd', tuple(round(v, 3) for v in fwd_a), 'scale', round(k, 3), 'yola hip', round(yola_hip_h, 3))

def frame_rot(primary, secondary):  # orthonormal basis: Y = primary, X = secondary made perpendicular
    y = primary.normalized(); x = (secondary - y * secondary.dot(y)).normalized(); z = x.cross(y)
    return Matrix((x, y, z)).transposed()
def align(rest_p, rest_s, tgt_p, tgt_s):  # rotation taking the rest pair onto the target pair
    return frame_rot(tgt_p, tgt_s) @ frame_rot(rest_p, rest_s).transposed()

# rest references for the torso, head and hands
mid = lambda a, b: (a + b) / 2
rest_hipmid = mid(head('LeftUpLeg'), head('RightUpLeg')); rest_shmid = mid(head('LeftArm'), head('RightArm'))
rest_up = rest_shmid - rest_hipmid
rest_hiplat = head('LeftUpLeg') - head('RightUpLeg'); rest_shlat = head('LeftArm') - head('RightArm')
rest_headup = head('HeadTop_End') - head('Head') if P('HeadTop_End') in R else up_a
def hand_rest(side):
    return (mid(head(side + 'HandIndex1'), head(side + 'HandPinky1')) - head(side + 'Hand'), head(side + 'HandIndex1') - head(side + 'HandPinky1'))

# the grip: finger poses copied from a bat clip (both hands closed on the handle)
ad = arm.animation_data or arm.animation_data_create()
ga = bpy.data.actions.get(grip_action)
grip = {}
if ga:
    ad.action = ga
    try: ad.action_slot = ga.slots[0]
    except Exception: pass
    bpy.context.scene.frame_set(grip_frame)
    for pb in arm.pose.bones:
        if 'Hand' in pb.name and any(f in pb.name for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')):
            grip[pb.name] = pb.matrix_basis.copy()

order = []  # parents before children
def walk(b):
    order.append(b.name)
    for c in b.children: walk(c)
for b in bones:
    if not b.parent: walk(b)

LIMB = {  # bone -> (from joint, to joint) in MediaPipe indices (Left = subject's left)
    'LeftArm': (11, 13), 'LeftForeArm': (13, 15), 'RightArm': (12, 14), 'RightForeArm': (14, 16),
    'LeftUpLeg': (23, 25), 'LeftLeg': (25, 27), 'RightUpLeg': (24, 26), 'RightLeg': (26, 28),
    'LeftFoot': (27, 31), 'RightFoot': (28, 32),
}
SOCK_R = Vector((0.972, 0, -0.233)).normalized()  # the bat in the right hand's frame (Mixamo X Bot reference, bat_idle)
_rR = R[P('RightHand')].to_3x3().normalized(); dR_rest = _rR @ SOCK_R
dL_rest = dR_rest - left_a * (2 * dR_rest.dot(left_a))  # mirrored across her centre plane
SOCK_L = (R[P('LeftHand')].to_3x3().normalized().transposed() @ dL_rest).normalized()
SOCK = {'Right': SOCK_R, 'Left': SOCK_L}
GRIP_OFF = {sd: (head(sd + 'HandMiddle1') - head(sd + 'Hand')) * 0.5 for sd in ('Left', 'Right')}  # wrist -> palm centre (rest, armature)
HALF = 0.05  # metres between the hands' midpoint and each grip along the bat
def V(c): return (left_a * c[0] + up_a * c[1] + fwd_a * c[2])
def two_bone(Sp, T, l1, l2, pole):
    d = T - Sp; L = max(1e-6, min(d.length, (l1 + l2) * 0.999)); u = d.normalized()
    a = (l1 * l1 - l2 * l2 + L * L) / (2 * L); h = math.sqrt(max(0.0, l1 * l1 - a * a))
    pv = pole - Sp; pv = (pv - u * pv.dot(u)); pv = pv.normalized() if pv.length > 1e-6 else up_a.cross(u).normalized()
    return Sp + u * a + pv * h
LEN = {sd: ((head(sd + 'ForeArm') - head(sd + 'Arm')).length, (head(sd + 'Hand') - head(sd + 'ForeArm')).length) for sd in ('Left', 'Right')}
def solve(fr):
    J = [A(p) for p in fr['p']]
    hipmid = mid(J[23], J[24]); shmid = mid(J[11], J[12])
    R_hips = align(rest_up, rest_hiplat, shmid - hipmid, J[23] - J[24])
    R_chest = align(rest_up, rest_shlat, shmid - hipmid, J[11] - J[12])
    # the head: the faceless reference gives no reliable head landmarks, so it rides on the chest and turns partway
    # toward the strike (eyes on the target, the way a batter watches the ball), kept near level, limited to 55 degrees
    f_c = R_chest @ fwd_a
    look = f_c * 0.45 + fwd_a * 0.55
    look = look - up_a * (look.dot(up_a) * 0.7)  # mostly level: a forward lean of the chest does not drop the gaze to the floor
    q = f_c.rotation_difference(look.normalized())
    if q.angle > 0.96: q = Quaternion(q.axis, 0.96)
    R_head = q.to_matrix() @ R_chest
    W = {}  # bone -> target armature-space rotation (3x3)
    qh, qc = R_hips.to_quaternion(), R_chest.to_quaternion()
    W[P('Hips')] = R_hips
    for nm, t in (('Spine', 0.33), ('Spine1', 0.66), ('Spine2', 1.0)): W[P(nm)] = qh.slerp(qc, t).to_matrix()
    W[P('Neck')] = qc.slerp(R_head.to_quaternion(), 0.4).to_matrix(); W[P('Head')] = R_head
    for side, (w, ix, pk) in (('Left', (15, 19, 17)), ('Right', (16, 20, 18))):
        rp, rs = hand_rest(side)
        W[P(side + 'Hand')] = align(rp, rs, mid(J[ix], J[pk]) - J[w], J[ix] - J[pk])
    hips_pos = hipmid + R_hips @ (hip_rest - rest_hipmid)
    G = {}
    if 'bat' in fr:
        d = V(fr['bat']).normalized(); gm = (J[15] + J[16] + J[19] + J[20]) / 4
        for sd, sgn_ in (('Right', 1), ('Left', -1)):
            gt = gm + d * (HALF * k * sgn_)
            rest_hand = R[P(sd + 'Hand')].to_3x3().normalized(); rest_sock = rest_hand @ SOCK[sd]; rest_knk = rest_hand @ Vector((0, 1, 0))
            sh = J[12] if sd == 'Right' else J[11]
            out = (gt - sh); knk = out - d * out.dot(d)  # knuckles away from the shoulder, across the bat
            Rh = align(rest_sock, rest_knk, d, knk if knk.length > 1e-6 else up_a)
            W[P(sd + 'Hand')] = Rh
            G[sd] = (gt - Rh @ GRIP_OFF[sd], J[14] if sd == 'Right' else J[13])  # wrist target, elbow pole
    return J, W, hips_pos, G

act = bpy.data.actions.get(name)
if act: bpy.data.actions.remove(act)
act = bpy.data.actions.new(name); act.use_fake_user = True
ad.action = act
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
# solve every frame first, then smooth the torso and head rotations over time (a 5-frame binomial on quaternions):
# the strikes live in the arms and the bat, the torso should carry them without frame-to-frame wobble
SOLVED = [solve(fr) for fr in frames]
# foot contact cleanup: per foot, frames where the ankle is near its lowest and moving slowly are contacts; each contact
# phase pins the foot to one floor spot (the phase's mean), blended in/out over 4 frames; the leg reaches it by IK
fps_ = 60.0
ANK = {'Left': 27, 'Right': 28}
ank_rest = {sd: head(sd + 'Foot') for sd in ('Left', 'Right')}
floor_h = {sd: (ank_rest[sd] - ground0).dot(up_a) for sd in ('Left', 'Right')}
LEGLEN = {sd: ((head(sd + 'Leg') - head(sd + 'UpLeg')).length, (head(sd + 'Foot') - head(sd + 'Leg')).length) for sd in ('Left', 'Right')}
PIN = {}
for sd, ji in ANK.items():
    pos = [A(fr['p'][ji]) for fr in frames]
    hgt = [(p - ground0).dot(up_a) for p in pos]; lo = sorted(hgt)[len(hgt) // 10]
    spd = [0.0] + [((pos[i] - pos[i - 1]) - up_a * (pos[i] - pos[i - 1]).dot(up_a)).length * fps_ / k for i in range(1, len(pos))]
    contact = [hgt[i] < lo + 0.10 * k and spd[i] < 0.9 for i in range(len(pos))]
    # close gaps of a frame or two, drop blips shorter than 5 frames
    for i in range(1, len(contact) - 1):
        if not contact[i] and contact[i - 1] and contact[i + 1]: contact[i] = True
    i = 0; pins = [None] * len(pos); w = [0.0] * len(pos)
    while i < len(contact):
        if not contact[i]: i += 1; continue
        j = i
        while j < len(contact) and contact[j]: j += 1
        if j - i >= 5:
            m = Vector((0, 0, 0))
            for q in range(i, j): m += pos[q]
            m /= (j - i); m = m - up_a * (m - ground0).dot(up_a) + up_a * floor_h[sd]  # on the floor, ankle height
            for q in range(max(0, i - 4), min(len(pos), j + 4)):
                pins[q] = m; w[q] = 1.0 if i <= q < j else max(0.0, 1 - (i - q) / 4 if q < i else 1 - (q - j + 1) / 4)
        i = j
    PIN[sd] = (pins, w, pos)
    print('contacts', sd, sum(1 for x in w if x >= 1), 'of', len(w), 'frames')
SMOOTH = [P(n) for n in ('Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head')]
for bn in SMOOTH:
    qs = [S[1][bn].to_quaternion() for S in SOLVED]
    for i in range(1, len(qs)):
        if qs[i].dot(qs[i - 1]) < 0: qs[i].negate()
    out = []
    for i in range(len(qs)):
        acc = Quaternion((0, 0, 0, 0))
        for off, w in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1)):
            j = min(len(qs) - 1, max(0, i + off)); q = qs[j]
            acc = Quaternion((acc.w + q.w * w, acc.x + q.x * w, acc.y + q.y * w, acc.z + q.z * w))
        out.append(acc.normalized())
    for i, S in enumerate(SOLVED): S[1][bn] = out[i].to_matrix()
prevq = {}
for i, fr in enumerate(frames):
    J, W, hips_pos, G = SOLVED[i]
    IK = {}; LIK = {}
    M = {}  # posed armature-space matrices
    for bn in order:
        b = bones[bn]; pb = arm.pose.bones[bn]
        rest = R[bn]
        if b.parent:
            Mp = M[b.parent.name]; rel = R[b.parent.name].inverted() @ rest
            base = Mp @ rel  # this bone with an identity pose
        else:
            base = rest
        short = bn.replace('mixamorig:', '')
        if bn in W:
            rot = W[bn] @ rest.to_3x3()
        elif short in ('LeftArm', 'RightArm') and short[:-3] in G:
            sd = short[:-3]; Sp = base.to_translation(); T, pole = G[sd]
            E = two_bone(Sp, T, LEN[sd][0], LEN[sd][1], pole); IK[sd] = (E, T)
            cur = base.to_3x3() @ Vector((0, 1, 0)); rot = cur.rotation_difference(E - Sp).to_matrix() @ base.to_3x3()
        elif short in ('LeftForeArm', 'RightForeArm') and short[:-7] in IK:
            E, T = IK[short[:-7]]
            cur = base.to_3x3() @ Vector((0, 1, 0)); rot = cur.rotation_difference(T - base.to_translation()).to_matrix() @ base.to_3x3()
        elif short in ('LeftUpLeg', 'RightUpLeg') and PIN[short[:-5]][1][i] > 0:
            sd = short[:-5]; pins, w, pos = PIN[sd]; Sp = base.to_translation()
            T = pos[i].lerp(pins[i], w[i]); E = two_bone(Sp, T, LEGLEN[sd][0], LEGLEN[sd][1], J[25 if sd == 'Left' else 26])
            LIK[sd] = (E, T)
            cur = base.to_3x3() @ Vector((0, 1, 0)); rot = cur.rotation_difference(E - Sp).to_matrix() @ base.to_3x3()
        elif short in ('LeftLeg', 'RightLeg') and short[:-3] in LIK:
            E, T = LIK[short[:-3]]
            cur = base.to_3x3() @ Vector((0, 1, 0)); rot = cur.rotation_difference(T - base.to_translation()).to_matrix() @ base.to_3x3()
        elif short in LIMB:
            a, c = LIMB[short]; d = (J[c] - J[a])
            cur = base.to_3x3() @ Vector((0, 1, 0))
            rot = cur.rotation_difference(d).to_matrix() @ base.to_3x3()
        elif bn in grip:
            Mb = base @ grip[bn]; M[bn] = Mb
            pb.matrix_basis = grip[bn]; pb.keyframe_insert('rotation_quaternion', frame=i + 1); continue
        else:
            rot = base.to_3x3()
        pos = hips_pos if bn == P('Hips') else base.to_translation()
        Mt = Matrix.Translation(pos) @ rot.to_4x4()
        M[bn] = Mt
        basis = (base.inverted() @ Mt) if b.parent else (rest.inverted() @ Mt)
        l, q, s = basis.decompose()
        pq = prevq.get(bn)
        if pq is not None and pq.dot(q) < 0: q.negate()  # quaternion continuity (no flips between neighbouring keys)
        prevq[bn] = q.copy()
        pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=i + 1)
        if not b.parent:
            pb.location = l; pb.keyframe_insert('location', frame=i + 1)
print('RETARGETED', name, 'frames', len(frames))
out = argv[4] if len(argv) > 4 else None
if out: bpy.ops.wm.save_as_mainfile(filepath=out, copy=True); print('SAVED', out)
