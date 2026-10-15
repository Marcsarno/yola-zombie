# Weapon hold toolkit (Blender side). See WEAPON_HOLD_PROCESS.md. Used by calibrate.py, holdcheck.py, gripsheet.py.
# All positions in the armature's space, in model units (Yola is ~1 unit tall; metres = units * M).
import bpy, math, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion

M = 1.62  # model units -> metres (Yola is exported 1.0 unit tall and scaled to 1.62 m in the game)
SIDES = ('Left', 'Right')

def rig():
    arm = bpy.data.objects['YOLA']
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'yola_decimated_old'
                and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers))
    return arm, body

def use_action(arm, name):
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks: t.mute = True
    a = bpy.data.actions[name]; ad.action = a
    try: ad.action_slot = a.slots[0]
    except Exception: pass
    return a

def PB(arm, n): return arm.pose.bones['mixamorig:' + n]
def B(arm, n): return arm.data.bones['mixamorig:' + n]
def head(arm, n): return PB(arm, n).head.copy()          # posed, armature space
def rest_head(arm, n): return B(arm, n).head_local.copy()
def rot(arm, n): return PB(arm, n).matrix.to_3x3().normalized()       # posed orientation
def rest_rot(arm, n): return B(arm, n).matrix_local.to_3x3().normalized()

# ---------------- hand calibration ----------------
def fit_circle(P):
    P = np.array(P); c0 = P.mean(0); _, _, Vt = np.linalg.svd(P - c0); e1, e2, n = Vt[0], Vt[1], Vt[2]
    q = np.stack([(P - c0) @ e1, (P - c0) @ e2], 1)
    A = np.c_[2 * q, np.ones(len(q))]; b = (q ** 2).sum(1); x = np.linalg.lstsq(A, b, rcond=None)[0]
    r = math.sqrt(max(1e-12, x[2] + x[0] ** 2 + x[1] ** 2))
    return Vector(c0 + x[0] * e1 + x[1] * e2), r

def calibrate_hand(arm, side):
    """With the grip pose applied: the fist centre (where the handle's axis runs), the grip axis (pinky -> index, i.e.
    toward the weapon's working end for an overhand grip), the knuckle side, and the finger-circle radius, all in the
    hand bone's own space. The fist centre is the line through the curled fingers' circle centres, taken at the middle
    finger: not the wrist, not a guessed offset (Stick Fight, commit 0d9144f)."""
    hb = PB(arm, side + 'Hand'); Mi = hb.matrix.inverted()
    loc = lambda n: Mi @ PB(arm, side + 'Hand' + n).head
    cs, rs, ws = {}, [], []
    for f, w in (('Index', 1.0), ('Middle', 1.0), ('Ring', 1.0), ('Pinky', 0.5)):
        c, r = fit_circle([tuple(loc(f + str(i))) for i in (1, 2, 3, 4)]); cs[f] = c; rs.append(r); ws.append(w)
    P = np.array([tuple(cs[f]) for f in cs]); W = np.array(ws); c0 = (P * W[:, None]).sum(0) / W.sum()
    _, _, Vt = np.linalg.svd((P - c0) * np.sqrt(W)[:, None]); axis = Vector(Vt[0])
    if axis.dot(cs['Index'] - cs['Pinky']) < 0: axis.negate()
    mid = cs['Middle']; centre = Vector(c0) + axis * (mid - Vector(c0)).dot(axis)
    knuckle = loc('Middle1') - centre; knuckle = (knuckle - axis * knuckle.dot(axis)).normalized()
    width = (cs['Index'] - cs['Pinky']).length
    return {'centre': list(centre), 'axis': list(axis.normalized()), 'knuckle': list(knuckle), 'radius': sum(rs) / len(rs),
            'width': width}

def fist_world(arm, side, cal):  # posed fist centre + grip axis + knuckle direction (armature space)
    hm = PB(arm, side + 'Hand').matrix; r = hm.to_3x3().normalized()
    c = cal['hands'][side]
    return hm @ Vector(c['centre']), (r @ Vector(c['axis'])).normalized(), (r @ Vector(c['knuckle'])).normalized()

def finger_curl(arm, side):  # mean bend of the middle three fingers (degrees): ~140 closed on a handle, ~30 open
    hb = PB(arm, side + 'Hand'); tot = 0
    for f in ('Index', 'Middle', 'Ring'):
        p = [PB(arm, side + 'Hand' + f + str(i)).head for i in (1, 2, 3, 4)]
        v = [p[i + 1] - p[i] for i in range(3)]
        tot += sum(math.degrees(v[i].angle(v[i + 1])) for i in range(2))
    return tot / 3

# ---------------- joint measurement (anatomical angles, from rest-relative rotations) ----------------
def swing_twist(q, axis):
    """q = swing * twist, twist about `axis`; returns (swing, twist_angle_rad)."""
    v = Vector((q.x, q.y, q.z)); p = axis * v.dot(axis)
    t = Quaternion((q.w, p.x, p.y, p.z));
    if t.magnitude < 1e-9: t = Quaternion()
    t.normalize(); ang = 2 * math.atan2(Vector((t.x, t.y, t.z)).dot(axis), t.w)
    if ang > math.pi: ang -= 2 * math.pi
    if ang < -math.pi: ang += 2 * math.pi
    return q @ t.inverted(), ang

def rel(arm, parent, child, rest=False):  # child orientation in the parent's frame
    g = rest_rot if rest else rot
    return (g(arm, parent).inverted() @ g(arm, child))

def joint_frames(arm, cal):
    """Rest-pose axes used by the angle measurements (all in the PARENT bone's local frame)."""
    out = {}
    for s in SIDES:
        # forearm axis (elbow -> wrist) in the forearm's own frame and in the upper arm's frame
        fa = (rest_rot(arm, s + 'ForeArm').inverted() @ (rest_head(arm, s + 'Hand') - rest_head(arm, s + 'ForeArm'))).normalized()
        ua = (rest_rot(arm, s + 'Arm').inverted() @ (rest_head(arm, s + 'ForeArm') - rest_head(arm, s + 'Arm'))).normalized()
        # palm normal and thumb side at rest, in the forearm frame (palm normal = toward the fist centre from the knuckles)
        hr = rel(arm, s + 'ForeArm', s + 'Hand', rest=True)
        palm = (hr @ (-Vector(cal['hands'][s]['knuckle']))); palm = (palm - fa * palm.dot(fa)).normalized()
        th = rest_rot(arm, s + 'ForeArm').inverted() @ (rest_head(arm, s + 'HandThumb2') - rest_head(arm, s + 'Hand'))
        th = (th - fa * th.dot(fa) - palm * th.dot(palm)).normalized()
        out[s] = {'fa': fa, 'ua': ua, 'palm': palm, 'thumb': th}
    return out

def measure_arm(arm, s, JF, hinge):
    """Anatomical angles of one arm in the current pose (degrees)."""
    F = JF[s]; out = {}
    # elbow: forearm direction in the upper arm's frame vs the upper arm's own axis
    ufr = rot(arm, s + 'Arm'); fdir = ufr.inverted() @ (head(arm, s + 'Hand') - head(arm, s + 'ForeArm')).normalized()
    ua = F['ua']; h = Vector(hinge[s])
    bend = math.degrees(ua.angle(fdir)); sgn = 1 if ua.cross(fdir).dot(h) >= 0 else -1
    out['elbow'] = bend * sgn  # negative: bent backwards (hyperextended)
    out['elbow_side'] = math.degrees(math.asin(max(-1, min(1, fdir.dot(h))))) if bend > 15 else 0.0
    # forearm twist relative to the upper arm (after removing the hinge bend), plus the wrist's own twist
    qf = (rel(arm, s + 'Arm', s + 'ForeArm') @ rel(arm, s + 'Arm', s + 'ForeArm', rest=True).inverted()).to_quaternion()
    fa_u = (rest_rot(arm, s + 'Arm').inverted() @ rest_rot(arm, s + 'ForeArm')) @ F['fa']
    _, tw_f = swing_twist(qf, fa_u.normalized())
    qw = (rel(arm, s + 'ForeArm', s + 'Hand') @ rel(arm, s + 'ForeArm', s + 'Hand', rest=True).inverted()).to_quaternion()
    sw, tw_w = swing_twist(qw, F['fa'])
    out['forearm_twist'] = math.degrees(tw_f + tw_w)  # + = the rotation sense of the rest frame; see limits for sides
    a2 = sw @ F['fa']
    out['wrist_flex'] = math.degrees(math.atan2(a2.dot(F['palm']), a2.dot(F['fa'])))   # + toward the palm
    out['wrist_dev'] = math.degrees(math.atan2(a2.dot(F['thumb']), a2.dot(F['fa'])))   # + toward the thumb
    # shoulder: upper arm direction in the chest frame vs rest
    cr = rot(arm, 'Spine2'); d = (cr.inverted() @ (head(arm, s + 'ForeArm') - head(arm, s + 'Arm'))).normalized()
    up = (rest_rot(arm, 'Spine2').inverted() @ Vector((0, 0, 1))).normalized()
    fwd = (rest_rot(arm, 'Spine2').inverted() @ Vector((0, -1, 0))).normalized()
    lat = (rest_rot(arm, 'Spine2').inverted() @ Vector((1 if s == 'Left' else -1, 0, 0))).normalized()  # outward
    out['shoulder_raise'] = math.degrees((-up).angle(d))
    hz = d - up * d.dot(up)
    out['across_body'] = math.degrees(math.atan2(-d.dot(lat), d.dot(fwd))) if hz.length > 0.5 else 0.0
    qu = (rel(arm, 'Spine2', s + 'Arm') @ rel(arm, 'Spine2', s + 'Arm', rest=True).inverted()).to_quaternion()
    ua_c = (rest_rot(arm, 'Spine2').inverted() @ rest_rot(arm, s + 'Arm')) @ F['ua']
    _, tw_u = swing_twist(qu, ua_c.normalized())
    out['upperarm_twist'] = math.degrees(tw_u)
    qc = (rel(arm, 'Spine2', s + 'Shoulder') @ rel(arm, 'Spine2', s + 'Shoulder', rest=True).inverted()).to_quaternion()
    out['clavicle'] = math.degrees(qc.angle) if qc.angle <= math.pi else math.degrees(2 * math.pi - qc.angle)
    return out

# human limits (degrees). Twist limits are around her rest pose (A-pose, palms toward the thighs = forearm mid-position).
LIMITS = {
    'elbow': (-5, 145), 'elbow_side': (-10, 10), 'forearm_twist': (-85, 85), 'wrist_flex': (-60, 70), 'wrist_dev': (-30, 20),
    'shoulder_raise': (0, 170), 'across_body': (-180, 50), 'upperarm_twist': (-90, 90), 'clavicle': (0, 20),
}
def limit_faults(angles):
    out = []
    for k, (lo, hi) in LIMITS.items():
        v = angles.get(k)
        if v is None: continue
        if v < lo: out.append((k, round(v - lo, 1)))
        elif v > hi: out.append((k, round(v - hi, 1)))
    return out

def elbow_hinges(arm, actions, step=4):
    """The elbow's bend axis in the upper arm's frame, from how the elbow actually bends across many clips."""
    acc = {s: Vector() for s in SIDES}
    for a in actions:
        if a not in bpy.data.actions: continue
        act = use_action(arm, a); f0, f1 = map(int, act.frame_range)
        for f in range(f0, f1 + 1, step):
            bpy.context.scene.frame_set(f)
            for s in SIDES:
                ua = (rest_rot(arm, s + 'Arm').inverted() @ (rest_head(arm, s + 'ForeArm') - rest_head(arm, s + 'Arm'))).normalized()
                fd = (rot(arm, s + 'Arm').inverted() @ (head(arm, s + 'Hand') - head(arm, s + 'ForeArm'))).normalized()
                c = ua.cross(fd)
                if c.length > math.sin(math.radians(30)):
                    c.normalize()
                    if acc[s].length > 0 and c.dot(acc[s]) < 0: c.negate()
                    acc[s] += c
    return {s: list(acc[s].normalized()) for s in SIDES}

# ---------------- body capsules ----------------
CAPSULES = {  # name: (from bone head, to bone head [, to2: average with]) ; radius from the mesh
    'pelvis': ('LeftUpLeg', 'RightUpLeg', ('Hips',)), 'abdomen': ('Spine', 'Spine2', ('Spine', 'Spine1')),
    'chest': ('Spine2', 'Neck', ('Spine2',)), 'neck': ('Neck', 'Head', ('Neck',)), 'head': ('Head', 'HeadTop_End', ('Head',)),
}
for s in SIDES:
    CAPSULES.update({
        s + 'UpperArm': (s + 'Arm', s + 'ForeArm', (s + 'Arm',)), s + 'Forearm': (s + 'ForeArm', s + 'Hand', (s + 'ForeArm',)),
        s + 'Hand': (s + 'Hand', s + 'HandMiddle2', (s + 'Hand', s + 'HandIndex1', s + 'HandMiddle1', s + 'HandRing1', s + 'HandPinky1', s + 'HandThumb1', s + 'HandIndex2', s + 'HandMiddle2', s + 'HandRing2', s + 'HandPinky2', s + 'HandThumb2', s + 'HandIndex3', s + 'HandMiddle3', s + 'HandRing3', s + 'HandPinky3', s + 'HandThumb3')),
        s + 'Thigh': (s + 'UpLeg', s + 'Leg', (s + 'UpLeg',)), s + 'Shin': (s + 'Leg', s + 'Foot', (s + 'Leg',)),
    })

def seg_dist(p, a, b):
    ab = b - a; t = 0.0 if ab.length_squared < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t

def fit_capsules(arm, body, pct=80):
    """Capsule radius per body part = the pct-th percentile distance of the part's skin (vertices whose strongest weight
    is one of the part's bones) from its bone segment, in the rest pose. 80th percentile keeps it inside the skin for
    torso parts (a penetration of the capsule is a real penetration)."""
    gi = {g.index: g.name.replace('mixamorig:', '') for g in body.vertex_groups}
    owner = {}
    for name, (a, b, grp) in CAPSULES.items():
        for g in grp: owner[g] = name
    pts = {n: [] for n in CAPSULES}
    toA = arm.matrix_world.inverted() @ body.matrix_world
    for v in body.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda e: e.weight); n = owner.get(gi.get(g.group))
        if n: pts[n].append(toA @ v.co)
    out = {}
    # the torso's skin weights don't follow the spine bones (the chest bone owns 45 vertices, the neck bone the whole upper
    # chest), so torso parts take every torso-group vertex alongside their segment, and a LOW percentile: the trunk is
    # wider than deep, and a capsule must sit inside the skin front-to-back
    torso_groups = {'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder'}
    torso = []
    for v in body.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda e: e.weight)
        if gi.get(g.group) in torso_groups: torso.append(toA @ v.co)
    for n, (a, b, _) in CAPSULES.items():
        A, Bv = rest_head(arm, a), rest_head(arm, b)
        if n in ('abdomen', 'chest', 'neck'):
            band = [(d, t) for d, t in (seg_dist(p, A, Bv) for p in torso) if 0.0 < t < 1.0 and d < (0.25 if n != 'neck' else 0.08)]
            ds = sorted(d for d, t in band) or [0.0]; k = 0.35 if n != 'neck' else 0.5
            out[n] = {'a': a, 'b': b, 'r': ds[int(len(ds) * k)], 'n': len(ds)}
            continue
        ds = sorted(seg_dist(p, A, Bv)[0] for p in pts[n]) or [0.0]
        q = 40 if n == 'pelvis' else pct  # (the pelvis capsule lies across the hips: same wide-not-deep rule)
        out[n] = {'a': a, 'b': b, 'r': ds[min(len(ds) - 1, int(len(ds) * q / 100))], 'n': len(pts[n])}
    return out

def capsule_world(arm, cap):  # posed endpoints (armature space)
    return head(arm, cap['a']), head(arm, cap['b'])

def seg_seg(p1, q1, p2, q2):  # closest distance between two segments
    d1, d2, r = q1 - p1, q2 - p2, p1 - p2; a, e, f = d1.dot(d1), d2.dot(d2), d2.dot(r)
    if a <= 1e-12 and e <= 1e-12: return r.length
    if a <= 1e-12: s, t = 0.0, max(0.0, min(1.0, f / e))
    else:
        c = d1.dot(r)
        if e <= 1e-12: t, s = 0.0, max(0.0, min(1.0, -c / a))
        else:
            b = d1.dot(d2); den = a * e - b * b
            s = max(0.0, min(1.0, (b * f - c * e) / den)) if den > 1e-12 else 0.0
            t = (b * s + f) / e
            if t < 0: t, s = 0.0, max(0.0, min(1.0, -c / a))
            elif t > 1: t, s = 1.0, max(0.0, min(1.0, (b - c) / a))
    return ((p1 + d1 * s) - (p2 + d2 * t)).length

# ---------------- the weapon ----------------
def load_json(path):
    with open(path) as f: return json.load(f)
