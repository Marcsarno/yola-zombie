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
# up is the WORLD up (armature +Z; the YOLA object is unrotated). Her rest skeleton's hips->head line leans 3 degrees
# forward: using it as up tilted the floor, so moving forward along the combo raised her ~5 cm per metre in the game.
up_a = Vector((0.0, 0.0, 1.0))
left_a = (head('LeftUpLeg') - head('RightUpLeg')); left_a = (left_a - up_a * left_a.dot(up_a)).normalized()
fwd_a = left_a.cross(up_a).normalized()  # (left = up x fwd  =>  fwd = left x up)
foot_min = min((R[b.name].to_translation()).dot(up_a) for b in bones if 'Toe' in b.name or 'Foot' in b.name)
hip_rest = head('Hips')
yola_hip_h = hip_rest.dot(up_a) - foot_min
frames = D['frames']
# scale: Yola's leg length over the reference's (median hip -> knee -> ankle). Scaling by hip HEIGHT instead put her
# hips at standing height while the reference crouches, so her legs could not reach the floor (feet floated, knees locked).
med = lambda xs: sorted(xs)[len(xs) // 2]
dist = lambda a, b: math.dist(a, b)
# The reference's leg length is its hip -> ankle distance in frames where that knee is straight in the image plane
# (forward/up are measured from the side-view image): the thigh + shin sum over all frames came out ~9% long (MediaPipe's
# sideways depth guess adds length), which shrank the motion and over-bent her knees.
def knee2d(p, h, kn, a):  # knee bend (degrees) in the forward/up plane
    u = (p[h][1] - p[kn][1], p[h][2] - p[kn][2]); v = (p[a][1] - p[kn][1], p[a][2] - p[kn][2])
    c = (u[0] * v[0] + u[1] * v[1]) / max(1e-9, math.hypot(*u) * math.hypot(*v))
    return 180 - math.degrees(math.acos(max(-1.0, min(1.0, c))))
straight = [dist(fr['p'][h], fr['p'][a]) for fr in frames for h, kn, a in ((23, 25, 27), (24, 26, 28)) if knee2d(fr['p'], h, kn, a) < 8]
mocap_leg = med(straight) if len(straight) >= 10 else med([(dist(fr['p'][23], fr['p'][25]) + dist(fr['p'][25], fr['p'][27]) + dist(fr['p'][24], fr['p'][26]) + dist(fr['p'][26], fr['p'][28])) / 2 for fr in frames])
print('reference leg', round(mocap_leg, 3), 'm from', len(straight), 'straight-knee samples')
yola_leg = ((head('LeftLeg') - head('LeftUpLeg')).length + (head('LeftFoot') - head('LeftLeg')).length)
k = yola_leg / mocap_leg
# the arms get their own scale (her proportions are not the reference's): hand targets are placed from HER shoulders
mocap_arm = med([(dist(fr['p'][11], fr['p'][13]) + dist(fr['p'][13], fr['p'][15]) + dist(fr['p'][12], fr['p'][14]) + dist(fr['p'][14], fr['p'][16])) / 2 for fr in frames])
yola_arm = (head('LeftForeArm') - head('LeftArm')).length + (head('LeftHand') - head('LeftForeArm')).length
k_arm = yola_arm / mocap_arm
print('scale legs', round(k, 3), 'arms', round(k_arm, 3), '(hip-height scale was', round(yola_hip_h / med([fr['p'][23][1] * 0.5 + fr['p'][24][1] * 0.5 for fr in frames]), 3), ')')
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
# each aimed bone's direction toward its NEXT JOINT, in the bone's own rest frame. (On this Tripo skeleton a bone's Y axis
# does not point exactly at its child joint: aiming the Y axis left the ankles ~8 cm off their IK targets.)
NEXT = {'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand', 'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand',
        'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot', 'LeftFoot': 'LeftToeBase', 'RightFoot': 'RightToeBase'}
CH = {b: (R[P(b)].to_3x3().inverted() @ (head(c) - head(b))).normalized() for b, c in NEXT.items()}
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
            # grip point and elbow pole relative to the reference's shoulder midpoint (placed from Yola's own shoulders
            # at arm scale in the pose loop), and the wrist offset from the grip
            G[sd] = (gt - shmid, Rh @ GRIP_OFF[sd], (J[14] if sd == 'Right' else J[13]) - shmid)
    return J, W, hips_pos, G

act = bpy.data.actions.get(name)
if act: bpy.data.actions.remove(act)
act = bpy.data.actions.new(name); act.use_fake_user = True
ad.action = act
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
# solve every frame first, then smooth the torso and head rotations over time (a 5-frame binomial on quaternions):
# the strikes live in the arms and the bat, the torso should carry them without frame-to-frame wobble
SOLVED = [solve(fr) for fr in frames]
# feet: her SHOE SOLE is grounded, not her ankle. The reference fighter stands on the balls of the feet (heels up, ankle
# ~12 cm high, foot pitched toe-down); planting the ankle at standing height pushed the toes through the floor and
# over-bent the knees. Per frame the foot's orientation is estimated from the reference (rest ankle->ball turned onto
# ankle->toe), the lowest of her shoe vertices under that turn gives the ankle height that puts the sole on the floor.
fps_ = 60.0
ANK = {'Left': 27, 'Right': 28}; HEEL = {'Left': 29, 'Right': 30}; TOE = {'Left': 31, 'Right': 32}
LEGLEN = {sd: ((head(sd + 'Leg') - head(sd + 'UpLeg')).length, (head(sd + 'Foot') - head(sd + 'Leg')).length) for sd in ('Left', 'Right')}
body = next(o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers))
SHOE = {'Left': [], 'Right': []}
gi = {g.index: g.name for g in body.vertex_groups}
for v in body.data.vertices:
    if not v.groups: continue
    g = max(v.groups, key=lambda e: e.weight); nm = gi.get(g.group, '')
    for sd in ('Left', 'Right'):
        if nm in (P(sd + 'Foot'), P(sd + 'ToeBase'), P(sd + 'Toe_End')): SHOE[sd].append(arm.matrix_world.inverted() @ body.matrix_world @ v.co)
SHOE = {sd: vs[::3] for sd, vs in SHOE.items()}
SHOE_MID = {sd: sum(vs, Vector()) / len(vs) for sd, vs in SHOE.items()}
sole_rest = {sd: min((p - ground0).dot(up_a) for p in SHOE[sd]) for sd in SHOE}  # rest pose: lowest shoe point above ground0
print('shoe verts', {sd: len(v) for sd, v in SHOE.items()}, 'rest sole height', {sd: round(v, 4) for sd, v in sole_rest.items()})
def grounded_ankle(sd, fr):  # ankle height (above ground0) that puts the sole on the floor with the reference's foot pitch
    an = head(sd + 'Foot'); c0 = (head(sd + 'ToeBase') - an).normalized()
    d = V([b - a for a, b in zip(fr['p'][ANK[sd]], fr['p'][TOE[sd]])]).normalized()
    q = c0.rotation_difference(d)
    low = min((q @ (p - an)).dot(up_a) for p in SHOE[sd])
    return sole_rest[sd] - low
# Contact frames where the tracker lost a foot in motion blur, judged from the video (clip frames, inclusive). Forehand:
# the rear (left) foot kicks up behind her at f19-21 and lands in the wide stance by f23 (video frames 42-45); the
# tracker put it 44 cm up at f23.
BLUR_PLANTED = {'Left': [(23, 30)]}
PIN = {}
for sd, ji in ANK.items():
    pos = [A(fr['p'][ji]) for fr in frames]
    gnd = [grounded_ankle(sd, fr) for fr in frames]
    # contact: the reference's lowest foot point (heel or toe) within 4 cm of the floor and moving slowly
    low = [min(fr['p'][HEEL[sd]][1], fr['p'][TOE[sd]][1]) for fr in frames]
    lp = [Vector(fr['p'][HEEL[sd]] if fr['p'][HEEL[sd]][1] < fr['p'][TOE[sd]][1] else fr['p'][TOE[sd]]) for fr in frames]
    spd = [0.0] + [math.hypot(lp[i].x - lp[i - 1].x, lp[i].z - lp[i - 1].z) * fps_ for i in range(1, len(lp))]
    contact = [low[i] < 0.04 and spd[i] < 0.7 for i in range(len(pos))]
    for a_, b_ in BLUR_PLANTED.get(sd, ()):  # tracking lost in motion blur; planted per the video
        for q in range(a_ - 1, min(len(contact), b_)): contact[q] = True; low[q] = 0.0
    for i in range(1, len(contact) - 1):  # close gaps of a frame
        if not contact[i] and contact[i - 1] and contact[i + 1]: contact[i] = True
    i = 0; pins = [None] * len(pos); w = [0.0] * len(pos)
    while i < len(contact):  # each contact phase of 5+ frames: one floor spot (its mean), blended in/out over 4 frames
        if not contact[i]: i += 1; continue
        j = i
        while j < len(contact) and contact[j]: j += 1
        if j - i >= 5:
            m = Vector((0, 0, 0))
            for q in range(i, j): m += pos[q]
            m /= (j - i); m = m - up_a * (m - ground0).dot(up_a)  # (height is set per frame from the sole)
            for q in range(max(0, i - 4), min(len(pos), j + 4)):
                pins[q] = m; w[q] = 1.0 if i <= q < j else max(0.0, 1 - (i - q) / 4 if q < i else 1 - (q - j + 1) / 4)
        i = j
    PIN[sd] = (pins, w, pos, gnd, low)
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
# legs: every frame, each ankle goes to the reference's ankle by two-bone IK: on its contact pin while planted (sole on
# the floor), never with the sole under the floor. Where her leg cannot reach with a soft knee, the pelvis is lowered
# (smoothly over time) instead of the leg locking straight and the foot leaving the floor.
REACH = 0.985  # most of the leg's length a reach may use (a straight-locked knee pops)
LT = {}
for sd in ('Left', 'Right'):
    pins, w, pos, gnd, low = PIN[sd]
    ts = []
    for i in range(len(frames)):
        T = pos[i].lerp(pins[i], w[i]) if pins[i] is not None else pos[i].copy()
        hgt = (T - ground0).dot(up_a)
        # planted: the sole on the floor; free: the sole lifted as far as the reference's lowest foot point (heel or toe).
        # (Her ankle at the reference's ankle height floated her: the reference stands on its toes, her feet are shorter.)
        want = gnd[i] + max(0.0, low[i]) * k * (1 - w[i])
        ts.append(T + up_a * (want - hgt))
    # a lifted foot's path is smoothed over time (one-frame tracking blips at the contacts lifted it a few cm for a
    # frame); planted frames keep their exact spot, and the sole never goes under the floor
    sm = ts
    for _ in range(2): sm = [sum((sm[min(len(sm) - 1, max(0, i + o))] * wt for o, wt in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))), Vector()) / 16 for i in range(len(sm))]
    for i in range(len(ts)):
        T = sm[i].lerp(ts[i], w[i]); hgt = (T - ground0).dot(up_a)
        ts[i] = T + up_a * max(0.0, gnd[i] - hgt)
    LT[sd] = ts
drop = [0.0] * len(frames)
for i, S in enumerate(SOLVED):
    J, W, hips_pos, G = S
    for sd in ('Left', 'Right'):
        ul = hips_pos + W[P('Hips')] @ (head(sd + 'UpLeg') - hip_rest)
        v = ul - LT[sd][i]; m = sum(LEGLEN[sd]) * REACH
        vu = v.dot(up_a); hz = (v - up_a * vu).length
        need = vu - math.sqrt(max(0.0, m * m - hz * hz)) if hz < m else vu
        drop[i] = max(drop[i], need)
raw_drop = drop[:]
drop = [max(raw_drop[max(0, i - 4):i + 5]) for i in range(len(raw_drop))]  # widen, then smooth: never less than needed at the peak
for _ in range(2): drop = [sum(drop[min(len(drop) - 1, max(0, i + o))] * wt for o, wt in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))) / 16 for i in range(len(drop))]
drop = [max(d, r) if r > 0 else max(d, 0.0) for d, r in zip(drop, raw_drop)]
for i, S in enumerate(SOLVED): SOLVED[i] = (S[0], S[1], S[2] - up_a * drop[i], S[3])
print('pelvis lowered on', sum(1 for d in drop if d > 1e-4), 'frames, max', round(max(drop) / k, 3), 'm (reference scale)')
def arm_root(Mspine2, side):  # her shoulder joint, from the posed upper chest (the clavicle bones keep their rest pose)
    return (Mspine2 @ (R[P('Spine2')].inverted() @ R[P(side + 'Arm')])).to_translation()
prevq = {}; IKERR = []; BATPULL = []; SOLEPATH = {'Left': [], 'Right': []}
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
            sd = short[:-3]; Sp = base.to_translation()
            if 'ARMT' not in IK:  # both wrist targets at once: a grip beyond her (short) reach moves the whole bat toward her
                roots = {x: arm_root(M[P('Spine2')], x) for x in ('Left', 'Right')}; sm = (roots['Left'] + roots['Right']) / 2
                tg = {x: (sm + G[x][0] * (k_arm / k) - G[x][1], sm + G[x][2] * (k_arm / k)) for x in G}
                shift = Vector()
                for x, (T_, _) in tg.items():
                    over = (T_ - roots[x]).length - sum(LEN[x]) * 0.97
                    if over > 0 and over > shift.length: shift = (roots[x] - T_).normalized() * over
                IK['ARMT'] = {x: (T_ + shift, p_ + shift) for x, (T_, p_) in tg.items()}
                if shift.length > 1e-6: BATPULL.append(shift.length / k_arm)
            T, pole = IK['ARMT'][sd]
            E = two_bone(Sp, T, LEN[sd][0], LEN[sd][1], pole); IK[sd] = (E, T)
            cur = base.to_3x3() @ CH[short]; rot = cur.rotation_difference(E - Sp).to_matrix() @ base.to_3x3()
        elif short in ('LeftForeArm', 'RightForeArm') and short[:-7] in IK:
            E, T = IK[short[:-7]]
            cur = base.to_3x3() @ CH[short]; rot = cur.rotation_difference(T - base.to_translation()).to_matrix() @ base.to_3x3()
        elif short in ('LeftUpLeg', 'RightUpLeg'):
            sd = short[:-5]; Sp = base.to_translation()
            # knee pole: over the toes, between the foot's heading and the pelvis' (the reference's knee depth comes from
            # MediaPipe's sideways guess, which caved the knees inward)
            T = LT[sd][i]; toe = V([b - a for a, b in zip(fr['p'][ANK[sd]], fr['p'][TOE[sd]])]); toe -= up_a * toe.dot(up_a)
            hf = W[P('Hips')] @ fwd_a; hf = hf - up_a * hf.dot(up_a)
            kd = (toe.normalized() if toe.length > 1e-6 else hf.normalized()) + hf.normalized()
            pole = (Sp + T) / 2 + kd.normalized() * 0.3 + up_a * 0.05
            E = two_bone(Sp, T, LEGLEN[sd][0], LEGLEN[sd][1], pole)
            LIK[sd] = (E, T)
            cur = base.to_3x3() @ CH[short]; rot = cur.rotation_difference(E - Sp).to_matrix() @ base.to_3x3()
        elif short in ('LeftLeg', 'RightLeg') and short[:-3] in LIK:
            E, T = LIK[short[:-3]]
            cur = base.to_3x3() @ CH[short]; rot = cur.rotation_difference(T - base.to_translation()).to_matrix() @ base.to_3x3()
        elif short in LIMB:
            a, c = LIMB[short]; d = (J[c] - J[a])
            cur = base.to_3x3() @ CH[short]
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
    for sd in ('Left', 'Right'):  # check: did each ankle and wrist land on its IK target?
        if sd in LIK: IKERR.append(('ankle', (M[P(sd + 'Foot')].to_translation() - LIK[sd][1]).length / k))
        if sd in IK and sd != 'ARMT': IKERR.append(('wrist', (M[P(sd + 'Hand')].to_translation() - IK[sd][1]).length / k_arm))
        # the posed sole (the toes keep their rest pose relative to the foot): planted -> on the floor; never below it
        Mf = M[P(sd + 'Foot')] @ R[P(sd + 'Foot')].inverted()
        sp = min((Mf @ p for p in SHOE[sd]), key=lambda q: (q - ground0).dot(up_a))
        sole = (sp - ground0).dot(up_a) - sole_rest[sd]
        SOLEPATH[sd].append((Mf @ SHOE_MID[sd], sole))  # (speed from the shoe's centre: the lowest vertex hops heel <-> toe)
        if PIN[sd][1][i] >= 1: IKERR.append(('planted sole', abs(sole) / k))
        IKERR.append(('sole below floor', max(0.0, -sole) / k))
        intended = max(0.0, PIN[sd][4][i]) * k * (1 - PIN[sd][1][i])
        IKERR.append(('sole vs intended', abs(sole - intended) / k))
        if i in (73, 79, 109, 139): print('SOLE', sd, 'f', i + 1, 'posed', round(sole / k, 3), 'intended', round(intended / k, 3), 'w', round(PIN[sd][1][i], 2))
for kind in ('ankle', 'wrist', 'planted sole', 'sole below floor', 'sole vs intended'):
    es = sorted(e for kd, e in IKERR if kd == kind)
    if es: print('IK miss', kind, 'median', round(es[len(es) // 2], 3), 'max', round(es[-1], 3), 'm (reference scale)')
# per-frame planted weights (1 = planted, ramps over 4 frames), for the game's foot lock (export_combo.py -> clipdata cL/cR)
# (measured on HER final posed shoes: the sole within 1.5 cm of the floor and moving under 0.3 m/s (armature space, which
# carries the clip's travel), held 4+ frames, ramped over 3 frames)
CONTACT = {}
for sd, path in SOLEPATH.items():
    n = len(path); raw = []
    for i in range(n):
        a_, b_ = path[max(0, i - 1)][0], path[min(n - 1, i + 1)][0]
        v = (b_ - a_); v = (v - up_a * v.dot(up_a)).length / (k * 1.0) * fps_ / max(1, min(n - 1, i + 1) - max(0, i - 1))
        raw.append(path[i][1] / k < 0.015 and v < 0.3)
    i = 0
    while i < n:  # drop planted runs shorter than 4 frames
        if not raw[i]: i += 1; continue
        j = i
        while j < n and raw[j]: j += 1
        if j - i < 4:
            for q in range(i, j): raw[q] = False
        i = j
    wts = [1.0 if raw[i] else max([0.0] + [1 - abs(i - q) / 3 for q in range(max(0, i - 2), min(n, i + 3)) if raw[q]]) for i in range(n)]
    CONTACT[sd] = wts
    print('anim contacts', sd, sum(1 for x in wts if x >= 1), 'of', n, 'frames')
act['contacts'] = json.dumps({'L': [round(x, 2) for x in CONTACT['Left']], 'R': [round(x, 2) for x in CONTACT['Right']]})
# the reference -> armature mapping, for later passes (tools/hold/holdfit.py places the weapon with it)
act['frameC'] = json.dumps({'ground0': list(ground0), 'left': list(left_a), 'up': list(up_a), 'fwd': list(fwd_a), 'k': k, 'k_arm': k_arm,
                            'drop': [d for d in drop], 'src': src})
print('bat pulled into reach on', len(BATPULL), 'frames, max', round(max(BATPULL or [0]), 3), 'm (reference scale)')
print('RETARGETED', name, 'frames', len(frames))
out = argv[4] if len(argv) > 4 else None
if out: bpy.ops.wm.save_as_mainfile(filepath=out, copy=True); print('SAVED', out)
