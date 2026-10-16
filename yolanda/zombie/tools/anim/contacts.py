# Contact fixes after a rotation retarget (blender/retarget.py), run while the source rig is still loaded.
# A rotation retarget copies every bone's direction exactly, so on a body with other proportions the hands and feet land
# in other places: two hands on one bat drift apart, shoes sink into the floor or float. These passes put the contacts
# back, frame by frame, with two-bone IK that keeps the source's bend plane (elbow / knee side) and the end bone's world
# orientation (wrist, foot angle), and never straightens a limb past 99.5% of its reach (WEAPON_HOLD_PROCESS.md rule 3).
#   hands(src, tgt, act): each hand where the source's hand is, measured from the shoulders' midpoint and scaled by arm
#     length; hands that are together on the source (a bat grip, a two-handed pistol) keep their spacing scaled by hand
#     size instead, so they stay together.
#   feet(src, tgt, mesh, act): whenever the source's foot is planted (its toe within 3% of leg length of its rest height),
#     her shoe sole (the lowest vertex of the shoe) sits exactly on the floor; in between, the correction fades.
import bpy, math, os
DEBUG = bool(os.environ.get('CONTACTS_DEBUG'))
from mathutils import Vector, Matrix

def _pb(a, n): return a.pose.bones['mixamorig:' + n]
def _wp(a, n): return a.matrix_world @ _pb(a, n).head
def _rest(a, n): return a.matrix_world @ a.data.bones['mixamorig:' + n].head_local
def _len(a, *ns): return sum((_rest(a, n2) - _rest(a, n1)).length for n1, n2 in zip(ns, ns[1:]))
def _ss(x): x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)

def two_bone(a, up, lo, end, goal_w, w, max_bend=None):
    """Move the chain so `end`'s head reaches goal_w (world), weight w. Returns the bend angle (deg) and the reach used."""
    if w <= 1e-4: return None
    M = a.matrix_world; Mi = M.inverted()
    pu, pl, pe = _pb(a, up), _pb(a, lo), _pb(a, end)
    S, E, W = pu.head.copy(), pl.head.copy(), pe.head.copy()  # armature space
    G = Mi @ goal_w
    G = W.lerp(G, w)
    la, lb = (E - S).length, (W - E).length
    d_vec = G - S; d = d_vec.length
    if d < 1e-6: return None
    d = min(max(d, abs(la - lb) + 1e-5), (la + lb) * 0.995)
    u = d_vec.normalized()
    # bend side from the current pose (the source's elbow / knee plane)
    m = (E - S) - u * (E - S).dot(u)
    if m.length < 1e-6:
        m = (E - S) - ((W - S).normalized()) * (E - S).dot((W - S).normalized())
    m.normalize()
    cosA = max(-1.0, min(1.0, (la * la + d * d - lb * lb) / (2 * la * d))); sinA = math.sqrt(max(0.0, 1 - cosA * cosA))
    E2 = S + u * (la * cosA) + m * (la * sinA)
    W2 = S + u * d
    Mu, Ml, Me = pu.matrix.copy(), pl.matrix.copy(), pe.matrix.copy()
    # rotations only: every head stays where its parent puts it (pose locations stay zero: they are never keyed)
    q1 = (E - S).rotation_difference(E2 - S)
    _set_rot(pu, q1.to_matrix() @ Mu.to_3x3())
    E_a = pl.head.copy()
    dir_l = q1 @ (W - E)
    q2 = dir_l.rotation_difference(W2 - E_a)
    _set_rot(pl, (q2 @ q1).to_matrix() @ Ml.to_3x3())
    _set_rot(pe, Me.to_3x3())  # the wrist / foot keeps its orientation
    bend = math.degrees((E_a - S).angle(pe.head - E_a, 0))
    return bend, d / (la + lb)

def _set_rot(pb, R3):
    """Give pose bone pb this armature-space orientation, its head left where its parent puts it."""
    # (orthonormalised: a matrix with any scale in it leaves an unkeyed pose scale behind, which then carries into every
    # later clip; pose location and scale are never keyed, so both are reset)
    pb.matrix = Matrix.Translation(pb.matrix.translation) @ R3.to_quaternion().normalized().to_matrix().to_4x4()
    pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()

def _key(a, names, f):
    for n in names:
        p = _pb(a, n); p.keyframe_insert('rotation_quaternion', frame=f)

def hands(src, tgt, act, f0, f1, log=None):
    sc = bpy.context.scene
    s_arm = _len(tgt, 'LeftArm', 'LeftForeArm', 'LeftHand') / _len(src, 'LeftArm', 'LeftForeArm', 'LeftHand')
    s_hand = (_rest(tgt, 'LeftHandMiddle1') - _rest(tgt, 'LeftHand')).length / (_rest(src, 'LeftHandMiddle1') - _rest(src, 'LeftHand')).length
    sw_src = (_rest(src, 'LeftArm') - _rest(src, 'RightArm')).length
    worst = {'bend': 0, 'reach': 0, 'moved_cm': 0}
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        Os = (_wp(src, 'LeftArm') + _wp(src, 'RightArm')) * 0.5
        Ot = (_wp(tgt, 'LeftArm') + _wp(tgt, 'RightArm')) * 0.5
        HL, HR = _wp(src, 'LeftHand'), _wp(src, 'RightHand')
        mid = (HL + HR) * 0.5
        gap = (HL - HR).length / sw_src
        k = _ss((gap - 0.5) / 0.5)  # 0 = hands together on the source: keep their spacing at her hand size
        s_rel = s_hand + (s_arm - s_hand) * k
        goal_mid = Ot + (mid - Os) * s_arm
        for side, H in (('Left', HL), ('Right', HR)):
            g = goal_mid + (H - mid) * s_rel
            before = _wp(tgt, side + 'Hand')
            r = two_bone(tgt, side + 'Arm', side + 'ForeArm', side + 'Hand', g, 1.0)
            if r:
                worst['bend'] = max(worst['bend'], r[0]); worst['reach'] = max(worst['reach'], r[1])
                worst['moved_cm'] = max(worst['moved_cm'], (before - _wp(tgt, side + 'Hand')).length)
        _key(tgt, ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'], f)
    if log is not None: log.append(('hands', act.name, worst))
    return worst

def shoe_vertices(mesh):
    vg = {g.index: g.name for g in mesh.vertex_groups}
    out = {'Left': [], 'Right': []}
    for v in mesh.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        if best is None: continue
        n = vg[best.group]
        for s in out:
            if n in ('mixamorig:%sFoot' % s, 'mixamorig:%sToeBase' % s): out[s].append(v.index)
    return out

def feet(src, tgt, mesh, act, f0, f1, shoes, log=None, lock=False):
    sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get()
    leg_src = _len(src, 'LeftUpLeg', 'LeftLeg', 'LeftFoot')
    have = lambda n: ('mixamorig:' + n) in src.pose.bones
    TOES = {s: [n for n in (s + 'ToeBase', s + 'Toe_End', s + 'Foot') if have(n)] for s in ('Left', 'Right')}
    toe0 = {s: min(_rest(src, n).z for n in TOES[s]) for s in TOES}
    def sole():
        ev = mesh.evaluated_get(dg); m = ev.to_mesh(); W = mesh.matrix_world
        r = {s: min((W @ m.vertices[i].co).z for i in idx) for s, idx in shoes.items()}
        ev.to_mesh_clear(); return r
    stats = {'fixed_frames': 0, 'max_lift_cm_units': 0.0, 'locked_frames': 0, 'max_pin_units': 0.0}
    # horizontal foot lock (lock=True; not for looping gaits: a lock across the loop seam would pop): while the source's
    # foot is planted and still, her foot stays where it landed; when it lifts, the pin fades out over 5 frames
    pin = {'Left': None, 'Right': None}; fade = {'Left': None, 'Right': None}; prev = {}; W_ = {}
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        so = sole(); changed = False
        for s in ('Left', 'Right'):
            h = min(_wp(src, n).z for n in TOES[s]) - toe0[s]
            w = _ss((0.045 - h / leg_src) / 0.02)  # planted below 2.5% of leg length, free above 4.5%
            fs = _wp(src, s + 'Foot'); v = ((fs - prev[s]).xy.length / leg_src) if s in prev else 0.0; prev[s] = fs.copy()
            here = _wp(tgt, s + 'Foot')
            off = Vector((0, 0, 0))
            if lock:
                still = w > 0.6 and v < 0.006
                if still and pin[s] is None: pin[s] = here.xy.copy(); fade[s] = None
                if not still and pin[s] is not None: fade[s] = [pin[s] - here.xy, 5]; pin[s] = None
                if pin[s] is not None: off.xy = pin[s] - here.xy; stats['locked_frames'] += 1
                elif fade[s] is not None:
                    d, n = fade[s]; n -= 1
                    off.xy = d * (n / 5.0); fade[s] = [d, n] if n > 0 else None
                stats['max_pin_units'] = max(stats['max_pin_units'], off.length)
            lift = -so[s] * w
            if w > 1e-3: off.z = lift
            if off.length < 1e-5: continue
            two_bone(tgt, s + 'UpLeg', s + 'Leg', s + 'Foot', here + off, 1.0)
            stats['max_lift_cm_units'] = max(stats['max_lift_cm_units'], abs(off.z)); changed = True
            W_[s] = w
        # (one IK step can leave part of the sole error: repeat the vertical part until both soles are within 0.3 mm)
        for it in range(4):
            so = sole(); worst = 0.0
            if DEBUG and f == 10: print('DBG', act.name, f, it, {k: round(v * 162, 2) for k, v in so.items()}, W_)
            for s, w in W_.items():
                lift = -so[s] * w
                if abs(lift) < 3e-4: continue
                worst = max(worst, abs(lift))
                two_bone(tgt, s + 'UpLeg', s + 'Leg', s + 'Foot', _wp(tgt, s + 'Foot') + Vector((0, 0, lift)), 1.0)
            if worst < 3e-4: break
        W_.clear()
        if changed:
            stats['fixed_frames'] += 1
            _key(tgt, ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'], f)
    if log is not None: log.append(('feet', act.name, stats))
    return stats
