# Fit both hands to a weapon path, within human joint limits (WEAPON_HOLD_PROCESS.md step 6.4, the hold rig, baked).
# Runs in Blender on the retargeted action (retarget_mocap.py), after the body is final:
#   1. The weapon: the reference's tracked weapon (solve2combo.py: knob, direction) placed relative to HER shoulders at her
#      arm scale; moved toward her where her hands can't reach it, and out of her body where it would pass through it
#      (capsule test against her fitted body capsules), both eased over time.
#   2. The grips: each hand's fist centre sits ON the shaft at its scheduled distance from the knob (normal grip, or the
#      reference's own hand positions where it changes grip, e.g. the butt strike's staff grip). Release windows: that
#      hand lets go, travels clear of the shaft (over the other hand) and regrips.
#   3. Each arm: the hand's roll around the shaft and the elbow's swing around the shoulder->wrist line are free; they
#      are chosen per frame by dynamic programming over time (smooth), scoring the human joint limits (holdlib.LIMITS:
#      wrist bend, wrist side bend, forearm twist, elbow, shoulder, upper-arm twist; measured exactly as holdcheck.py
#      measures them), comfort, and her arm skin inside her skinned body (the checker's own skin test, on the candidate
#      pose's skinning). The twist between elbow and hand is carried by the forearm (anatomical); the wrist only bends.
#   3b. Where no arm solution is clean (past a limit, skin in her body, out of reach), the weapon is moved a little
#      (up to HOLD_OFFSET_MAX_M, default 8 cm; never deeper into her body, direction unchanged), smoothly, and the arms
#      refitted (HOLD_REFINE_ROUNDS, default 2).
#   3c. Where an arm still goes into her chest, that shoulder comes forward (clavicle protraction, within the clavicle
#      limit), and the arms are refitted.
#   4. Fingers: the calibrated grip pose while holding, eased open during release windows.
# The weapon path and grip schedule are stored on the action ('weapon_path') for holdcheck.py, gripsheet.py and export.
# usage: blender -b work.blend --python tools/hold/holdfit.py -- <hands.json> <weapon> <combo.json> <action> <out.blend>
#        [schedule.json]   (grip schedule: {"release": {"Left": [[f0, f1], ...]}, "grips": {f: {"Left": m, "Right": m}}})
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import holdlib as H

argv = sys.argv[sys.argv.index('--') + 1:]
cal = H.load_json(argv[0]); weapon = argv[1]; CB = H.load_json(argv[2]) if argv[2] != 'action' else None; name = argv[3]; out = argv[4]
# argv[2] == 'action': the weapon path and grips come from the action itself ('weapon_path', written by weaponpath.py)
SCH = H.load_json(argv[5]) if len(argv) > 5 else {}
WS = H.load_json(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'weapons_hold.json'))[weapon]
U = 1 / H.M
arm, body = H.rig(); sc = bpy.context.scene
act = H.use_action(arm, name)
WP = json.loads(act['weapon_path'])['frames'] if CB is None else None
if CB is not None:
    FC = json.loads(act['frameC'])
    g0, eL, eU, eF, k, k_arm = Vector(FC['ground0']), Vector(FC['left']), Vector(FC['up']), Vector(FC['fwd']), FC['k'], FC['k_arm']
toA = lambda p: g0 + (eL * p[0] + eU * p[1] + eF * p[2]) * k
JF = H.joint_frames(arm, cal); HINGE = {s: Vector(cal['hinge'][s]) for s in H.SIDES}
P = lambda n: 'mixamorig:' + n
Rr = {b.name: b.matrix_local.copy() for b in arm.data.bones}
R3 = lambda n: Rr[P(n)].to_3x3().normalized()
hd = lambda n: Rr[P(n)].to_translation()
frames = CB['frames'] if CB is not None else WP; T = len(frames); f0 = int(act.frame_range[0])
assert T == int(act.frame_range[1]) - f0 + 1, 'combo and action lengths differ'
L1 = {s: (hd(s + 'ForeArm') - hd(s + 'Arm')).length for s in H.SIDES}; L2 = {s: (hd(s + 'Hand') - hd(s + 'ForeArm')).length for s in H.SIDES}
UA = {s: JF[s]['ua'] for s in H.SIDES}; FA = {s: JF[s]['fa'] for s in H.SIDES}
REL_UF = {s: R3(s + 'Arm').transposed() @ R3(s + 'ForeArm') for s in H.SIDES}
REL_FH = {s: R3(s + 'ForeArm').transposed() @ R3(s + 'Hand') for s in H.SIDES}
REL_SA = {s: R3(s + 'Shoulder').transposed() @ R3(s + 'Arm') for s in H.SIDES}
HC = {s: {kk: Vector(v) for kk, v in cal['hands'][s].items() if isinstance(v, list)} for s in H.SIDES}
CAPS = cal['capsules']

# ---- clavicles: library clips shrug far past a human clavicle (up to 86 degrees); each is eased back to at most
# CLAV_MAX from rest before the arms are fitted (the arms then reach from the corrected shoulders) ----
CLAV_MAX = math.radians(18)
nclav = 0
for s in H.SIDES:
    pb = arm.pose.bones[P(s + 'Shoulder')]; pb.rotation_mode = 'QUATERNION'
    for i in range(T):
        sc.frame_set(f0 + i); q = pb.rotation_quaternion.copy(); ang = q.angle if q.angle <= math.pi else 2 * math.pi - q.angle
        if ang > CLAV_MAX:
            pb.rotation_quaternion = Quaternion().slerp(q, CLAV_MAX / ang); pb.keyframe_insert('rotation_quaternion', frame=f0 + i); nclav += 1
print('clavicles eased to', round(math.degrees(CLAV_MAX)), 'deg on', nclav, 'side-frames')
# ---- per frame: her posed torso (the body is final), the reference's shoulders/elbows and weapon ----
def tor_at(i):
    sc.frame_set(f0 + i)
    pb = arm.pose.bones
    t = {'Spine2': pb[P('Spine2')].matrix.to_3x3().normalized(), 'sh': {}, 'shM': {}, 'el': {s: pb[P(s + 'ForeArm')].head.copy() for s in H.SIDES}}
    for s in H.SIDES:
        t['shM'][s] = pb[P(s + 'Shoulder')].matrix.copy()
        t['sh'][s] = (t['shM'][s] @ (Rr[P(s + 'Shoulder')].inverted() @ Rr[P(s + 'Arm')])).to_translation()
    t['caps'] = {n: (pb[P(c['a'])].head.copy(), pb[P(c['b'])].head.copy(), c['r']) for n, c in CAPS.items()
                 if n in ('head', 'neck', 'chest', 'abdomen', 'pelvis', 'LeftThigh', 'RightThigh')}
    return t
TOR = [tor_at(i) for i in range(T)]
LEN_M = WS['length']; prof = WS['profile']
def radius_at(sm): return next((r0 + (r1 - r0) * (sm - s0) / max(1e-9, s1 - s0) for (s0, r0), (s1, r1) in zip(prof, prof[1:]) if s0 <= sm <= s1), prof[-1][1])

# ---- grip schedule (metres from the knob; None = released) ----
REL = {s: [tuple(w) for w in SCH.get('release', {}).get(s, [])] for s in H.SIDES}
if WP is not None:  # release windows = runs of frames where the path says this hand is off the weapon
    for s in H.SIDES:
        i = 0
        while i < T:
            if WP[i]['grips'].get(s) is not None: i += 1; continue
            j = i
            while j < T and WP[j]['grips'].get(s) is None: j += 1
            REL[s].append((f0 + i, f0 + j)); i = j
def grip_at(i, s):
    f = f0 + i
    if WP is not None:
        g = WP[min(T - 1, max(0, i))]['grips'].get(s)
        if g is None:  # released: the nearest held value
            for dj in range(1, T):
                for j in (i - dj, i + dj):
                    if 0 <= j < T and WP[j]['grips'].get(s) is not None: return WP[j]['grips'][s]
        return g if g is not None else WS['grips'][s]
    g = SCH.get('grips', {}).get(str(f), {}).get(s)
    return g if g is not None else WS['grips'][s]
def released(i, s):
    f = f0 + i
    for a, b in REL[s]:
        if a <= f < b: return (f - a + 0.5) / (b - a), a, b
    return None

# ---- 1. weapon placement ----
KN = []; DIR = []
for i, fr in enumerate(frames):
    if WP is not None:
        KN.append(Vector(fr['knob'])); DIR.append(Vector(fr['dir']).normalized()); continue
    t = TOR[i]
    shR = toA(fr['p'][12]); shL = toA(fr['p'][11]); smR = (shR + shL) / 2; smY = (t['sh']['Left'] + t['sh']['Right']) / 2
    d = (eL * fr['bat'][0] + eU * fr['bat'][1] + eF * fr['bat'][2]).normalized()
    # the anchor: the reference's right-hand grip point on its shaft (the hand that holds throughout), at her arm scale
    knr = toA(fr['knob']); sR = fr['hands_s']['Right'] if 0 <= fr['hands_s']['Right'] <= 0.5 else WS['grips']['Right'] / LEN_M
    anc = knr + d * (sR * CB['bat_length_m'] * k)
    ancY = smY + (anc - smR) * (k_arm / k)
    KN.append(ancY - d * (grip_at(i, 'Right') * U)); DIR.append(d)
# reach: a fist target beyond 97% of her arm moves the whole weapon toward her (eased over time)
def fist_targets(i, kn, d):
    out = {}
    for s in H.SIDES:
        r = released(i, s); g = grip_at(i, s)
        out[s] = kn + d * (g * U)
    return out
shift = []
for i in range(T):
    t = TOR[i]; sv = Vector()
    for s, c in fist_targets(i, KN[i], DIR[i]).items():
        over = (c - t['sh'][s]).length - (L1[s] + L2[s] + 0.05 * U) * 0.97
        if over > 0 and over > sv.length: sv = (t['sh'][s] - c).normalized() * over
    shift.append(sv)
def ease_vecs(vs, widen=4):
    n = len(vs); mag = [v.length for v in vs]
    out = []
    for i in range(n):
        j = max(range(max(0, i - widen), min(n, i + widen + 1)), key=lambda q: mag[q])
        out.append(vs[j] * (1.0 if j == i else 0.999))
    for _ in range(3): out = [sum((out[min(n - 1, max(0, i + o))] * w for o, w in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))), Vector()) / 16 for i in range(n)]
    return [o if o.length >= m.length else m for o, m in zip(out, vs)]
shift = ease_vecs(shift)
KN = [kn + sv for kn, sv in zip(KN, shift)]
print('weapon moved into reach on', sum(1 for s in shift if s.length > 1e-5), 'frames, max', round(max(s.length for s in shift) * H.M * 100, 1), 'cm')
# out of her body: weapon capsules (handle + barrel) against her torso/head/thigh capsules
WCAP = [(0.0, 0.42, 0.016), (0.42, LEN_M - 0.01, 0.033)]
def closest_seg(p1, q1, p2, q2):
    d1, d2, r = q1 - p1, q2 - p2, p1 - p2; a, e, f = d1.dot(d1), d2.dot(d2), d2.dot(r); c = d1.dot(r); b = d1.dot(d2); den = a * e - b * b
    s = max(0.0, min(1.0, (b * f - c * e) / den)) if den > 1e-12 else 0.0
    tt = (b * s + f) / e
    if tt < 0: tt, s = 0.0, max(0.0, min(1.0, -c / a))
    elif tt > 1: tt, s = 1.0, max(0.0, min(1.0, (b - c) / a))
    return p1 + d1 * s, p2 + d2 * tt
# Her torso is much deeper than the reference fighter's (a stylised body), so a grip in front of HIS belly lands inside
# hers: the weapon (with fist-sized capsules where the hands hold it) moves straight forward from her chest, by the least
# that clears her body. (Pushing along the nearest-surface normal moved it sideways or down, out of her reach.)
WCAP_P = [(0.0, 0.25, 0.045), (0.25, 0.42, 0.016), (0.42, LEN_M - 0.01, 0.033)]
def pen_at(i, off):
    t = TOR[i]; worst = 0.0
    for a_, b_, wr in WCAP_P:
        A_ = KN[i] + off + DIR[i] * (a_ * U); B_ = KN[i] + off + DIR[i] * (b_ * U)
        for n, (ca, cb, cr) in t['caps'].items():
            pw, pc = closest_seg(A_, B_, ca, cb); worst = max(worst, cr + wr * U + 0.01 * U - (pw - pc).length)
    return worst
push = []
for i in range(T):
    fw = (TOR[i]['Spine2'] @ (R3('Spine2').transposed() @ Vector((0, -1, 0)))); fw = (fw - Vector((0, 0, 1)) * fw.z).normalized()
    off = Vector()
    for step in range(81):
        off = fw * (step * 0.005)
        if pen_at(i, off) <= 0: break
    push.append(off)
push = ease_vecs(push)
KN = [kn + pv for kn, pv in zip(KN, push)]
print('weapon moved out of her body on', sum(1 for p in push if p.length > 1e-5), 'frames, max', round(max(p.length for p in push) * H.M * 100, 1), 'cm')

# ---- 2. fist targets per frame (release windows: off the shaft, over the other hand) ----
def targets(i, kn, d):
    chest = TOR[i]['caps']['chest'][0]; out = {}
    for s in H.SIDES:
        r = released(i, s)
        if r is None:
            out[s] = (kn + d * (grip_at(i, s) * U), 1.0); continue
        u, a, b = r; ga = grip_at(a - 1 - f0, s) if a - 1 - f0 >= 0 else grip_at(0, s); gb = grip_at(min(T - 1, b - f0), s)
        e = u * u * (3 - 2 * u); g = ga + (gb - ga) * e
        c = kn + d * (g * U)
        away = c - chest; away -= d * away.dot(d); away = away.normalized() if away.length > 1e-9 else Vector((0, 0, 1))
        out[s] = (c + away * (0.08 * U * math.sin(math.pi * u)), 0.0)
    return out

# ---- 3. arm fit: hand roll x elbow swing, DP over time ----
ROLLS = [math.radians(a) for a in range(0, 360, 10)]
# the elbow's swing around the shoulder->wrist line, from the clip's own elbow. Wide: a held weapon often needs the elbow
# well away from where the unarmed clip had it (the joint limits and the body test decide; the cost prefers small swings)
SWINGS = [math.radians(a) for a in (-120, -90, -60, -40, -20, 0, 20, 40, 60, 90, 120)]
# grip direction: +1 index toward the working end (a bat grip), -1 reversed (a staff or reverse grip). A change is a
# regrip: costly, and the fingers open and close around it
SIGNS = (1, -1); REGRIP_COST = 2500.0; REVERSED_COST = 6.0  # per frame: a weapon is normally held the bat way
# a reversed grip is only allowed inside the listed staff-move spans (env HOLD_REVERSE_OK="36-112,..."), and only for the
# support hand: the primary hand holds the weapon the normal way through the whole clip (it never lets go)
REV_OK = [tuple(map(int, w.split('-'))) for w in os.environ.get('HOLD_REVERSE_OK', '').split(',') if w]
PRIM = WS['primary']
def rev_cost(i, s): return REVERSED_COST if s != PRIM and any(a <= f0 + i <= b for a, b in REV_OK) else 1e5
FOREARM_TWIST_SHARE = 0.6  # of the elbow->hand twist, carried by the forearm bone (the rest by the hand bone)
def frame_rot(p, s_):
    y = p.normalized(); x = (s_ - y * s_.dot(y)).normalized(); z = x.cross(y); return Matrix((x, y, z)).transposed()
def align(rp, rs, tp, ts): return frame_rot(tp, ts) @ frame_rot(rp, rs).transposed()
def tw(axis, a): return Quaternion(axis, a).to_matrix()
def two_bone(S, Tg, l1, l2, pole):
    dv = Tg - S; Ln = max(1e-6, min(dv.length, (l1 + l2) * 0.999)); u = dv.normalized()
    a = (l1 * l1 - l2 * l2 + Ln * Ln) / (2 * Ln); h = math.sqrt(max(0.0, l1 * l1 - a * a))
    pv = pole - S; pv = pv - u * pv.dot(u); pv = pv.normalized() if pv.length > 1e-9 else Vector((0, 0, -1))
    return S + u * a + pv * h
def arm_solution(i, s, c, d, roll, swing, ref_el, sign=1):
    t = TOR[i]; S = t['sh'][s]; hc = HC[s]
    e1 = d.orthogonal().normalized(); e2 = d.cross(e1)
    kd = e1 * math.cos(roll) + e2 * math.sin(roll)
    Rh = align(hc['axis'] * sign, hc['knuckle'], d, kd)
    W = c - Rh @ hc['centre']
    # elbow pole: the reference's elbow, swung around the shoulder->wrist line
    ax = (W - S).normalized(); pole = S + tw(ax, swing) @ (ref_el - S)
    E = two_bone(S, W, L1[s], L2[s], pole)
    reach = (W - S).length / (L1[s] + L2[s])
    n = (E - S).cross(W - E)
    if n.length < 1e-9: n = (E - S).cross(pole - S)
    Ru = align(UA[s], HINGE[s], E - S, n)
    base = Ru @ REL_UF[s]; fdir = (W - E).normalized()
    Rf0 = (base @ FA[s]).rotation_difference(fdir).to_matrix() @ base
    Q = (Rf0.transposed() @ Rh @ REL_FH[s].transposed()).to_quaternion()
    sw, tau = H.swing_twist(Q, FA[s])
    a2 = sw @ FA[s]
    # the wrist bends about the twisted distal forearm's axes (as holdlib.measure_arm measures it): palm and thumb
    # directions turned by the whole elbow->hand twist before splitting the bend into flex and side bend
    tq = Quaternion(FA[s], tau); palm = tq @ JF[s]['palm']; thumb = tq @ JF[s]['thumb']
    ang = {'wrist_flex': math.degrees(math.atan2(a2.dot(palm), a2.dot(FA[s]))),
           'wrist_dev': math.degrees(math.atan2(a2.dot(thumb), a2.dot(FA[s]))),
           'forearm_twist': math.degrees(tau)}
    ua = UA[s]; fd_u = Ru.transposed() @ fdir; bend = math.degrees(ua.angle(fd_u))
    ang['elbow'] = bend if ua.cross(fd_u).dot(HINGE[s]) >= 0 else -bend
    Rc = t['Spine2']; Rc0 = R3('Spine2'); dd = (Rc.transposed() @ (E - S)).normalized()
    up = (Rc0.transposed() @ Vector((0, 0, 1))).normalized(); fw = (Rc0.transposed() @ Vector((0, -1, 0))).normalized()
    lat = (Rc0.transposed() @ Vector((1 if s == 'Left' else -1, 0, 0))).normalized()
    ang['shoulder_raise'] = math.degrees((-up).angle(dd))
    hzv = dd - up * dd.dot(up); ang['across_body'] = math.degrees(math.atan2(-dd.dot(lat), dd.dot(fw))) if hzv.length > 0.5 else 0.0
    qu = ((Rc.transposed() @ Ru) @ (Rc0.transposed() @ R3(s + 'Arm')).transposed()).to_quaternion()
    _, tu = H.swing_twist(qu, ((Rc0.transposed() @ R3(s + 'Arm')) @ UA[s]).normalized())
    ang['upperarm_twist'] = math.degrees(tu)
    return {'Rh': Rh, 'W': W, 'E': E, 'Ru': Ru, 'Rf0': Rf0, 'tau': tau, 'ang': ang, 'reach': reach, 'sign': sign}
REL_M = {s: {k: Rr[P(s + a)].inverted() @ Rr[P(s + b)] for k, (a, b) in (('AF', ('Arm', 'ForeArm')), ('FH', ('ForeArm', 'Hand')))} for s in H.SIDES}
def arm_mats(i, s, sol):  # the arm's posed bone matrices (armature space), exactly as section 4 keys them
    Mup = Matrix.Translation(TOR[i]['sh'][s]) @ sol['Ru'].to_4x4()
    Mfo = Matrix.Translation((Mup @ REL_M[s]['AF']).to_translation()) @ (sol['Rf0'] @ tw(FA[s], sol['tau'] * FOREARM_TWIST_SHARE)).to_4x4()
    Mh = Matrix.Translation((Mfo @ REL_M[s]['FH']).to_translation()) @ sol['Rh'].to_4x4()
    return Mup, Mfo, Mh

# ---- her skinned body: arm skin inside it, the same skin and test as holdcheck.py (capsules are far too coarse for her
# stylised body: they flagged 5 cm where the skin only touched, and missed her head and hair) ----
VREG, BFACES, AVERTS, AFACES = H.body_sets(arm, body)
BPOLY = [tuple(body.data.polygons[k].vertices) for k in BFACES]  # AFACES: each arm's own shoulder (not counted)
toAr = np.array(arm.matrix_world.inverted() @ body.matrix_world)
_co = np.zeros(len(body.data.vertices) * 3); body.data.vertices.foreach_get('co', _co)
REST = _co.reshape(-1, 3) @ toAr[:3, :3].T + toAr[:3, 3]
_bones = set(arm.data.bones.keys()); _gn = {g.index: g.name for g in body.vertex_groups}
SKIN = {}
for s in H.SIDES:
    rows = AVERTS[s][::4]  # a quarter of the checker's arm skin: ~1-2 cm apart
    P4 = np.c_[REST[rows], np.ones(len(rows))]; wv = {k: np.zeros(len(rows)) for k in 'AFH'}; fixed = {}
    for j, vi in enumerate(rows):
        gs = [(_gn[g.group], g.weight) for g in body.data.vertices[vi].groups if _gn[g.group] in _bones and g.weight > 0]
        tot = sum(w for _, w in gs) or 1.0
        for bn, w in gs:  # LBS weights: this arm's bones vary per candidate (fingers ride with the hand), the rest are fixed
            k = 'A' if bn == P(s + 'Arm') else 'F' if bn == P(s + 'ForeArm') else 'H' if bn.startswith(P(s + 'Hand')) else None
            if k: wv[k][j] += w / tot
            else: fixed.setdefault(bn, ([], []))[0].append(j); fixed[bn][1].append(w / tot)
    rad = max(min(H.seg_dist(Vector(p), hd(s + 'Arm'), hd(s + 'ForeArm'))[0], H.seg_dist(Vector(p), hd(s + 'ForeArm'), hd(s + 'Hand'))[0])
              for p in REST[rows])
    SKIN[s] = {'P4': P4, 'w': wv, 'fixed': {bn: (np.array(a), np.array(b)) for bn, (a, b) in fixed.items()},
               'rinv': {k: np.array(Rr[P(s + b)].inverted()) for k, b in (('A', 'Arm'), ('F', 'ForeArm'), ('H', 'Hand'))},
               'R': rad + 0.02 * U}
_FB = {}
def frame_body(i):
    """Her body this frame (torso, head, legs final; arms not yet fitted): a BVH of its skin and each arm skin sample's
    fixed-bone part of the skinning."""
    if i in _FB: return _FB[i]
    sc.frame_set(f0 + i); dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); me = ev.to_mesh()
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co)
    Mw = np.array(arm.matrix_world.inverted() @ ev.matrix_world); V = co.reshape(-1, 3) @ Mw[:3, :3].T + Mw[:3, 3]
    ev.to_mesh_clear()
    bvh = BVHTree.FromPolygons(V.tolist(), BPOLY)
    pfix = {}
    for s in H.SIDES:
        sk = SKIN[s]; pf = np.zeros((len(sk['P4']), 3))
        for bn, (rows, w) in sk['fixed'].items():
            Sm = np.array(arm.pose.bones[bn].matrix) @ np.array(Rr[bn].inverted())
            pf[rows] += w[:, None] * (sk['P4'][rows] @ Sm.T)[:, :3]
        pfix[s] = pf
    _FB[i] = (bvh, pfix, V if i == 0 else None)
    return _FB[i]
def skin_points(i, s, sol):
    sk = SKIN[s]; Pc = frame_body(i)[1][s].copy()
    for k, Mx in zip('AFH', arm_mats(i, s, sol)):
        Pc += sk['w'][k][:, None] * (sk['P4'] @ (np.array(Mx) @ sk['rinv'][k]).T)[:, :3]
    return Pc
def skin_depth(i, s, sol):  # deepest arm skin sample inside her body (model units)
    bvh = frame_body(i)[0]; S_ = TOR[i]['sh'][s]; E, W = sol['E'], sol['W']
    # quick reject: every point along the arm's bones is outside her body and farther from it than the arm's skin is thick
    near = False
    for p in [S_ + (E - S_) * u for u in (0.45, 0.6, 0.75, 0.9)] + [E + (W - E) * u for u in (0.0, 0.25, 0.5, 0.75, 1.0)]:
        hit = bvh.find_nearest(p)
        if hit[0] is not None and (hit[3] < SKIN[s]['R'] or (p - hit[0]).dot(hit[1]) < 0): near = True; break
    if not near: return 0.0
    return max(H.inside(bvh, Vector(p), AFACES[s]) for p in skin_points(i, s, sol).tolist())
def skin_cost(dep):  # steep from the first millimetre: the pass mark is 5 mm of contact (sleeves)
    cm = dep * H.M * 100; return 40.0 * cm + 60.0 * cm * cm if cm > 0 else 0.0
# the skin model against Blender's own skinning, on the clip's pose (sanity check of the LBS above)
_bv, _pf, _V = frame_body(0); _err = 0.0
for s in H.SIDES:
    sk = SKIN[s]; Pc = _pf[s].copy()
    for k, b in (('A', 'Arm'), ('F', 'ForeArm'), ('H', 'Hand')):
        Pc += sk['w'][k][:, None] * (sk['P4'] @ (np.array(arm.pose.bones[P(s + b)].matrix) @ sk['rinv'][k]).T)[:, :3]
    _err = max(_err, float(np.abs(Pc - _V[AVERTS[s][::4]]).max()))
print('skin model vs Blender skinning: max', round(_err * H.M * 100, 2), 'cm (fingers ride with the hand)')

def lim_excess(sol, s):
    return {kk: max(0.0, lo - sol['ang'][kk], sol['ang'][kk] - hi) for kk, (lo, hi) in H.limits_for(s).items() if kk in sol['ang']}
def cost_of(sol, swing, s):
    c = sum(60.0 * (ex / 2.0) ** 2 for ex in lim_excess(sol, s).values())
    a = sol['ang']
    c += (a['wrist_flex'] / 35) ** 2 + (a['wrist_dev'] / 15) ** 2 + ((a['forearm_twist'] - sum(H.limits_for(s)['forearm_twist']) / 2) / 60) ** 2 + (a['upperarm_twist'] / 60) ** 2
    c += (math.degrees(swing) / 40) ** 2
    if sol['reach'] > 0.995: c += 2000 * (sol['reach'] - 0.995) ** 2 * 1e4
    return c
def ref_elbow(i, s):
    t = TOR[i]
    if WP is not None: return t['el'][s]  # the clip's own elbow
    fr = frames[i]; smR = (toA(fr['p'][11]) + toA(fr['p'][12])) / 2; smY = (t['sh']['Left'] + t['sh']['Right']) / 2
    return smY + (toA(fr['p'][13 if s == 'Left' else 14]) - smR) * (k_arm / k)
def fit_arms(KN):
    """Both arms over the whole clip for weapon knobs KN: per frame every hand roll x elbow swing x grip direction is
    scored (limits, comfort, arm skin in her body), then the smoothest cheapest path through time (DP)."""
    SOL = {}
    NB = len(ROLLS) * len(SWINGS); ns = NB * len(SIGNS)
    C = {s: np.zeros((T, ns)) for s in H.SIDES}; SOLS = {s: [[None] * ns for _ in range(T)] for s in H.SIDES}
    for i in range(T):
        tg = targets(i, KN[i], DIR[i])
        for s in H.SIDES:
            c, hold = tg[s]; ref_el = ref_elbow(i, s)
            for g_, sg in enumerate(SIGNS):
                rc = rev_cost(i, s) if sg < 0 else 0.0
                for a_, roll in enumerate(ROLLS):
                    for b_, sw in enumerate(SWINGS):
                        sol = arm_solution(i, s, c, DIR[i], roll, sw, ref_el, sg); q = g_ * NB + a_ * len(SWINGS) + b_
                        sol['roll'], sol['swing'] = roll, sw
                        C[s][i, q] = cost_of(sol, sw, s) + rc
                        if rc < 1e4: C[s][i, q] += skin_cost(skin_depth(i, s, sol))
                        SOLS[s][i][q] = sol
    ra = np.array([ROLLS[(q % NB) // len(SWINGS)] for q in range(ns)]); sa = np.array([SWINGS[q % len(SWINGS)] for q in range(ns)])
    ga_ = np.array([q // NB for q in range(ns)])
    dr = np.abs((ra[:, None] - ra[None, :] + math.pi) % (2 * math.pi) - math.pi); ds = np.abs(sa[:, None] - sa[None, :])
    flip = ga_[:, None] != ga_[None, :]
    TR = np.where(flip, REGRIP_COST, (np.degrees(dr) / 12.0) ** 2 + (np.degrees(ds) / 20.0) ** 2)
    for s in H.SIDES:
        acc = C[s][0].copy(); back = np.zeros((T, ns), int)
        for i in range(1, T):
            tot = acc[:, None] + TR; back[i] = tot.argmin(0); acc = tot.min(0) + C[s][i]
        path = [int(acc.argmin())]
        for i in range(T - 1, 0, -1): path.append(int(back[i][path[-1]]))
        path = path[::-1]; SOL[s] = [SOLS[s][i][path[i]] for i in range(T)]
    return SOL
def problems(SOL):  # per frame: what is still wrong with the fitted arms (limits in degrees, skin in cm, reach)
    out = []
    for i in range(T):
        p = {}
        for s in H.SIDES:
            sol = SOL[s][i]; ex = sum(lim_excess(sol, s).values()); dep = skin_depth(i, s, sol) * H.M * 100
            if ex > 1.0: p[s + '_limits'] = round(ex, 1)
            if dep > 0.3: p[s + '_skin'] = round(dep, 2)
            if sol['reach'] > 0.996: p[s + '_reach'] = round(sol['reach'], 3)
        out.append(p)
    return out

# ---- 3b. where the arms can't hold the weapon (past a limit, skin in her body, out of reach): move the weapon a little ----
# Per frame near a problem, the weapon is tried at small offsets (26 directions x 3 sizes, up to OFF_MAX) and each try is
# scored by both arms' best solution near the fitted one; a DP over time picks smooth offsets (cost on size and on change),
# which are then eased. The weapon's direction never changes (its path stays the tracked one), and it never moves deeper
# into her body. Then the arms are fitted again.
OFF_MAX = float(os.environ.get('HOLD_OFFSET_MAX_M', 0.08))
DIRS26 = [Vector((x, y, z)).normalized() for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1) if (x, y, z) != (0, 0, 0)]
OFFS = [Vector()] + [dv * (OFF_MAX * U * f) for f in (0.35, 0.65, 1.0) for dv in DIRS26]
def local_cost(i, s, kn, SOLp):  # best cost for one arm with the weapon knob at kn, near the fitted solution
    c, hold = targets(i, kn, DIR[i])[s]; ref_el = ref_elbow(i, s); s0 = SOLp[s][i]; best = 1e12
    k0 = SWINGS.index(s0['swing'])
    for dr in (-20, 0, 20):
        roll = s0['roll'] + math.radians(dr)
        for sw in SWINGS[max(0, k0 - 2):k0 + 3]:
            sol = arm_solution(i, s, c, DIR[i], roll, sw, ref_el, s0['sign'])
            cc = cost_of(sol, sw, s)
            if cc < best: cc += skin_cost(skin_depth(i, s, sol)); best = min(best, cc)
    return best
def weapon_pen(i, kn):  # the weapon's capsules (fist-sized at the grips) against her torso/head/thigh capsules
    t = TOR[i]; worst = 0.0
    for a_, b_, wr in WCAP_P:
        A_ = kn + DIR[i] * (a_ * U); B_ = kn + DIR[i] * (b_ * U)
        for n, (ca, cb, cr) in t['caps'].items():
            pw, pc = closest_seg(A_, B_, ca, cb); worst = max(worst, cr + wr * U + 0.01 * U - (pw - pc).length)
    return worst
def refine_weapon(KN, SOL, rounds=2):
    KN0 = list(KN)  # all rounds together move the weapon at most OFF_MAX
    for rnd in range(rounds):
        prob = problems(SOL); bad = [i for i in range(T) if prob[i]]
        print('round', rnd, 'problem frames', len(bad), {k: sum(1 for p in prob if k in p) for k in sorted({k for p in prob for k in p})})
        if not bad: break
        win = sorted({j for i in bad for j in range(max(0, i - 6), min(T, i + 7))})
        segs = []
        for j in win:
            if segs and j == segs[-1][-1] + 1: segs[-1].append(j)
            else: segs.append([j])
        OFF = [Vector() for _ in range(T)]
        for seg in segs:
            n = len(seg); Cm = np.zeros((n, len(OFFS)))
            for r_, i in enumerate(seg):
                pen0 = weapon_pen(i, KN[i])
                for o_, ov in enumerate(OFFS):
                    kn = KN[i] + ov
                    if o_ and (weapon_pen(i, kn) > max(0.0, pen0) or (kn - KN0[i]).length > OFF_MAX * U * 1.001):
                        Cm[r_, o_] = 1e9; continue  # never deeper into her body, never further than OFF_MAX in all
                    Cm[r_, o_] = sum(local_cost(i, s, kn, SOL) for s in H.SIDES) + 2.0 * (ov.length * H.M * 100) ** 2
                if (r_ == 0 and seg[0] > 0) or (r_ == n - 1 and seg[-1] < T - 1): Cm[r_, 1:] += 1e6  # windows start and end in place
            ov_ = np.array([tuple(o) for o in OFFS]) * H.M * 100
            TRo = 8.0 * ((ov_[:, None, :] - ov_[None, :, :]) ** 2).sum(-1)
            acc = Cm[0].copy(); back = np.zeros((n, len(OFFS)), int)
            for r_ in range(1, n):
                tot = acc[:, None] + TRo; back[r_] = tot.argmin(0); acc = tot.min(0) + Cm[r_]
            pth = [int(acc.argmin())]
            for r_ in range(n - 1, 0, -1): pth.append(int(back[r_][pth[-1]]))
            for r_, o_ in zip(range(n), pth[::-1]): OFF[seg[r_]] = OFFS[o_].copy()
        for _ in range(4): OFF = [sum((OFF[min(T - 1, max(0, i + o))] * w for o, w in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))), Vector()) / 16 for i in range(T)]
        KN = [kn + ov for kn, ov in zip(KN, OFF)]
        print('round', rnd, 'weapon moved on', sum(1 for o in OFF if o.length * H.M > 0.002), 'frames, max', round(max(o.length for o in OFF) * H.M * 100, 1), 'cm',
              '| in all, max', round(max((a - b).length for a, b in zip(KN, KN0)) * H.M * 100, 1), 'cm')
        SOL = fit_arms(KN)
    return KN, SOL

# ---- 3c. where an arm still crosses into her chest: the shoulder comes forward (clavicle protraction, as a person
# reaching across the body does), within the clavicle limit. Options per side-frame are scored like 3b and picked by a DP
# over time; the clavicle keys are changed and the arms fitted again. ----
CLAV_LIMIT = math.radians(H.LIMITS['clavicle'][1])
PROTRACT = [math.radians(a) for a in (0, 5, 10, 15)]
CLAV0 = {s: [None] * T for s in H.SIDES}
def set_clavicle(i, s, a):
    """Key side s's clavicle at frame i rotated a radians forward (about her chest's up axis) from the eased clip pose,
    capped at the clavicle limit; then her torso data for that frame is refreshed."""
    pb = arm.pose.bones[P(s + 'Shoulder')]; sc.frame_set(f0 + i)
    if CLAV0[s][i] is None: CLAV0[s][i] = pb.rotation_quaternion.copy()
    q0 = CLAV0[s][i]; pb.rotation_quaternion = q0; bpy.context.view_layer.update()
    if a > 0:
        Mb = pb.matrix.to_3x3().normalized(); Rbase = Mb @ q0.to_matrix().inverted()
        up = (TOR[i]['Spine2'] @ (R3('Spine2').transposed() @ Vector((0, 0, 1)))).normalized()
        fw = (TOR[i]['Spine2'] @ (R3('Spine2').transposed() @ Vector((0, -1, 0)))).normalized()
        cl = (pb.tail - pb.head); cl = (cl - up * cl.dot(up)).normalized(); ax = cl.cross(fw).normalized()
        q = (Rbase.inverted() @ Quaternion(ax, a).to_matrix() @ Rbase).to_quaternion() @ q0
        ang = q.angle if q.angle <= math.pi else 2 * math.pi - q.angle
        if ang > CLAV_LIMIT: q = Quaternion().slerp(q, CLAV_LIMIT / ang)
        pb.rotation_quaternion = q
    pb.keyframe_insert('rotation_quaternion', frame=f0 + i)
    TOR[i] = tor_at(i); _FB.pop(i, None)
def protract(KN, SOL):
    prob = problems(SOL); changed = 0
    for s in H.SIDES:
        bad = [i for i in range(T) if s + '_skin' in prob[i]]
        if not bad: continue
        win = sorted({j for i in bad for j in range(max(0, i - 5), min(T, i + 6))})
        Cm = {}
        for i in win:
            for o_, a in enumerate(PROTRACT):
                set_clavicle(i, s, a); Cm[i, o_] = local_cost(i, s, KN[i], SOL) + 30.0 * (math.degrees(a) / 10) ** 2
            set_clavicle(i, s, 0.0)
        segs = []
        for j in win:
            if segs and j == segs[-1][-1] + 1: segs[-1].append(j)
            else: segs.append([j])
        A = [0.0] * T
        for seg in segs:
            n = len(seg); no = len(PROTRACT); M_ = np.array([[Cm[i, o] for o in range(no)] for i in seg])
            for r_, i in ((0, seg[0]), (n - 1, seg[-1])):
                if 0 < i < T - 1: M_[r_, 1:] += 1e6  # windows start and end at the clip's clavicle
            pa = np.degrees(np.array(PROTRACT)); TRc = 10.0 * ((pa[:, None] - pa[None, :]) / 5) ** 2
            acc = M_[0].copy(); back = np.zeros((n, no), int)
            for r_ in range(1, n):
                tot = acc[:, None] + TRc; back[r_] = tot.argmin(0); acc = tot.min(0) + M_[r_]
            pth = [int(acc.argmin())]
            for r_ in range(n - 1, 0, -1): pth.append(int(back[r_][pth[-1]]))
            for r_, o_ in zip(range(n), pth[::-1]): A[seg[r_]] = PROTRACT[o_]
        for _ in range(3): A = [sum(A[min(T - 1, max(0, i + o))] * w for o, w in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))) / 16 for i in range(T)]
        for i in range(T):
            if A[i] > 1e-3 or CLAV0[s][i] is not None: set_clavicle(i, s, A[i]); changed += A[i] > math.radians(1)
        print('shoulder', s, 'brought forward on', sum(1 for a in A if a > math.radians(1)), 'frames, max', round(math.degrees(max(A)), 1), 'deg')
    return changed

SOL = fit_arms(KN)
KN, SOL = refine_weapon(KN, SOL, int(os.environ.get('HOLD_REFINE_ROUNDS', 2)))
if protract(KN, SOL): SOL = fit_arms(KN)
TGT = {s: [] for s in H.SIDES}
for i in range(T):
    tg = targets(i, KN[i], DIR[i])
    for s in H.SIDES: TGT[s].append(tg[s])
PROB = problems(SOL); REPORT = {}; REGRIPS = {}
for s in H.SIDES:
    faults = {}
    for i in range(T):
        for kk, (lo, hi) in H.limits_for(s).items():
            v = SOL[s][i]['ang'].get(kk)
            if v is not None and (v < lo - 0.5 or v > hi + 0.5): faults.setdefault(kk, []).append((f0 + i, round(v, 1)))
    REPORT[s] = {kk: (len(v), max(v, key=lambda x: abs(x[1]))) for kk, v in faults.items()}
    REGRIPS[s] = [f0 + i for i in range(1, T) if SOL[s][i]['sign'] != SOL[s][i - 1]['sign']]
    print('REGRIP', s, 'grip direction changes at frames', REGRIPS[s], '| reversed-grip frames', sum(1 for x in SOL[s] if x['sign'] < 0))
    print('ARM', s, 'limit faults (frames, worst):', REPORT[s] or 'none', '| max reach', round(max(x['reach'] for x in SOL[s]), 3))
    sk = [(f0 + i, PROB[i][s + '_skin']) for i in range(T) if s + '_skin' in PROB[i]]
    print('SKIN', s, 'arm skin samples in her body > 3 mm on', len(sk), 'frames', sk[:40])

# ---- 4. pose and key the arms and fingers ----
grip_pose = {}
ga, gf = cal.get('grip_pose', ['bat_idle', 1])
H.use_action(arm, ga); sc.frame_set(gf)
for pb in arm.pose.bones:
    if 'Hand' in pb.name and any(x in pb.name for x in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')):
        grip_pose[pb.name] = pb.rotation_quaternion.copy() if pb.rotation_mode == 'QUATERNION' else pb.matrix_basis.to_quaternion()
H.use_action(arm, name)
def basis_q(base, M):
    return (base.inverted() @ M).to_quaternion()
prevq = {}
def key(bn, q, f):
    pq = prevq.get(bn)
    if pq is not None and pq.dot(q) < 0: q.negate()
    prevq[bn] = q.copy(); pb = arm.pose.bones[bn]; pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=f)
open_w = {s: [] for s in H.SIDES}
for s in H.SIDES:
    for i in range(T):
        r = released(i, s); w = 1.0
        if r is not None: w = 1 - math.sin(math.pi * r[0]) * 0.75  # opens to ~25% of the grip, closes again
        for g in REGRIPS.get(s, []):  # a regrip: the fingers ease open over 4 frames and close over 4
            dd = abs(f0 + i - g)
            if dd < 5: w = min(w, 0.35 + 0.65 * dd / 5)
        open_w[s].append(w)
for i in range(T):
    f = f0 + i; t = TOR[i]
    for s in H.SIDES:
        sol = SOL[s][i]
        Mup = Matrix.Translation(t['sh'][s]) @ sol['Ru'].to_4x4()
        key(P(s + 'Arm'), basis_q(t['shM'][s] @ (Rr[P(s + 'Shoulder')].inverted() @ Rr[P(s + 'Arm')]), Mup), f)
        Rf = sol['Rf0'] @ tw(FA[s], sol['tau'] * FOREARM_TWIST_SHARE)
        Ep = (Mup @ (Rr[P(s + 'Arm')].inverted() @ Rr[P(s + 'ForeArm')])).to_translation()
        Mfo = Matrix.Translation(Ep) @ Rf.to_4x4()
        key(P(s + 'ForeArm'), basis_q(Mup @ (Rr[P(s + 'Arm')].inverted() @ Rr[P(s + 'ForeArm')]), Mfo), f)
        Hp = (Mfo @ (Rr[P(s + 'ForeArm')].inverted() @ Rr[P(s + 'Hand')])).to_translation()
        Mh = Matrix.Translation(Hp) @ sol['Rh'].to_4x4()
        key(P(s + 'Hand'), basis_q(Mfo @ (Rr[P(s + 'ForeArm')].inverted() @ Rr[P(s + 'Hand')]), Mh), f)
        w = open_w[s][i]
        for bn, q in grip_pose.items():
            if bn.startswith(P(s + 'Hand')): key(bn, Quaternion().slerp(q, w), f)
# the weapon path and schedule, for the checker, the sheets and the export
path = []
for i in range(T):
    path.append({'f': f0 + i, 'knob': list(KN[i]), 'dir': list(DIR[i]),
                 'grips': {s: (None if released(i, s) else grip_at(i, s)) for s in H.SIDES},
                 'fist_target': {s: list(TGT[s][i][0]) for s in H.SIDES}})
act['weapon_path'] = json.dumps({'weapon': weapon, 'units': 'armature (model units); grips in metres from the knob', 'frames': path})
act['holdfit'] = json.dumps({'faults': {s: {kk: v[0] for kk, v in REPORT[s].items()} for s in H.SIDES},
                             'problems': {str(f0 + i): p for i, p in enumerate(PROB) if p}})  # what 3b/3c could not clear
# check: did each fist centre land on its target?
miss = {s: [] for s in H.SIDES}
for i in range(T):
    sc.frame_set(f0 + i)
    for s in H.SIDES:
        cF, aF, kF = H.fist_world(arm, s, cal); miss[s].append((cF - TGT[s][i][0]).length * H.M * 100)
for s in H.SIDES: print('FIST', s, 'centre to target: median', round(sorted(miss[s])[T // 2], 2), 'max', round(max(miss[s]), 2), 'cm')
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True); print('SAVED', out)
