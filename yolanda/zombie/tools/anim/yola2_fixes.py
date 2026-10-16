# Arm clearance for the new Yola's clips (2026-10-16, the user: "make sure it's not clipping"): her body is wider than the
# rigs the clips were made on (the X Bot, the first Yola: the unarmed idle's hands sank 2-3 cm into her thighs; the axe
# stance's right fist pressed into her cheek). Measured on her posed mesh (the vertices the game draws), frame by frame:
#   scan  every clip: how deep each hand + forearm goes into the rest of her (torso, head, legs; the joints' shared skin and
#         Tripo's inner layer under the clothes left out), and the upper arms into the torso
#   fix   the listed clips: wherever a hand or forearm is in, the hand is moved out along the surface's normal by the
#         depth + 4 mm, with two-bone IK that keeps the elbow's side and the wrist's orientation (tools/anim/contacts.py);
#         the moves are smoothed over neighbouring frames (no pops) and checked again. The .blend is saved.
# usage: blender -b assets/source/yola_v2/yola2_work.blend --python tools/anim/yola2_fixes.py -- scan <out.json> [clip ...]
#        blender -b assets/source/yola_v2/yola2_work.blend --python tools/anim/yola2_fixes.py -- fix <out.json> [clip[:f0-f1] ...]
#        (fix with no clips: GAME_FIXES below; run once on a fresh build: tools/anim/yola2_build.py -> this -> yola2_export.py)
# (then tools/anim/yola2_export.py). Clips: the game's (the .blend.json list) unless named.
import bpy, sys, os, json, math, re
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import contacts

argv = sys.argv[sys.argv.index('--') + 1:]
MODE, OUT, NAMES = argv[0], argv[1], argv[2:]
sc = bpy.context.scene; sc.render.fps = 30
ARM, ME = bpy.data.objects['YOLA2'], bpy.data.objects['YOLA2_mesh']
lists = json.load(open(bpy.data.filepath + '.json'))
# the game's clips that needed it (2026-10-16 scan): arms out at the shoulder for the arms-down ones, the hands moved out
# (capped) within the frames the game plays for the attacks; deaths, knockdowns and t_greet_04 (its hands meet her body on
# purpose) are left as made
GAME_FIXES = ['tripo_idle', 'p_run_plain', 'p_run_back_plain', 'p_walk_strafe_left_plain', 'p_walk_strafe_right_plain', 't_greet_01',
              'bat_idle', 'pistol_reload', 't_box_01:8-38', 't_box_02:44-62', 't_kick_02:14-40', 't_chop:52-74', 'bat_swing:24-40',
              'ual_Sword_Regular_Combo:1-89']
CLIPS = NAMES or (GAME_FIXES if MODE == 'fix' else lists['game'])

# ---- regions: each vertex's strongest bone; a vertex weighted > 5% to two regions is a joint's shared skin ----
REG = [('Hand', 'hand'), ('ForeArm', 'forearm'), ('Arm', 'upperarm'), ('UpLeg', 'thigh'), ('Leg', 'shin'), ('Foot', 'foot'), ('Toe', 'foot')]
def region(n):
    n = n.replace('mixamorig:', '')
    for side in ('Left', 'Right'):
        if n.startswith(side):
            rest = n[len(side):]
            if rest.startswith('Shoulder'): return 'shoulder_' + side[0]  # (the deltoid's top overhangs the upper arm: the arm's own)
            for key, r in REG:
                if rest.startswith(key): return r + '_' + side[0]
    if n.startswith(('Neck', 'Head')): return 'head'
    if n.startswith(('Hips', 'Spine')): return 'torso'
    return 'other'
gname = {g.index: g.name for g in ME.vertex_groups}
V = ME.data.vertices
vreg, vmix, vset = [], [], []
for v in V:
    ws = sorted(((g.weight, gname[g.group]) for g in v.groups if g.group in gname), reverse=True)
    vreg.append(region(ws[0][1]) if ws else 'other')
    rs = {region(n) for w, n in ws if w > 0.05}; vset.append(rs); vmix.append(len(rs) > 1)
polys = [tuple(p.vertices) for p in ME.data.polygons]
preg = [vreg[p[0]] for p in polys]
# a face is left out of an arm's targets when it carries that arm's own skin (the shoulder's blend ring); the hip-thigh blend
# stays (leaving it out opened holes in the thigh, and points beside the holes read as inside)
ARMREG = {s: {'shoulder_' + s, 'upperarm_' + s, 'forearm_' + s, 'hand_' + s} for s in 'LR'}
parm = {s: [any(vset[i] & ARMREG[s] for i in p) for p in polys] for s in 'LR'}
pmix = [any(vmix[i] for i in p) for p in polys]
# Tripo's inner layer (faces looking at the inside of the outer layer: tools/anim/yola2_bake.py's test, at rest)
rest = [ME.matrix_world @ v.co for v in V]
bvh0 = BVHTree.FromPolygons(rest, polys)
H = max(c.z for c in rest) - min(c.z for c in rest)
SCALE = H  # (the bake's distances are for a 1-unit-tall mesh)
inner = []
for i, p in enumerate(polys):
    a = [rest[j] for j in p]; n = (a[1] - a[0]).cross(a[2] - a[0])
    if n.length < 1e-12: inner.append(False); continue
    n.normalize(); c = sum(a, Vector()) / len(a)
    loc, hn, idx, d = bvh0.ray_cast(c + n * 2e-4 * SCALE, n, 0.08 * SCALE)
    inner.append(loc is not None and hn.dot(n) > 0.2)
vinner = [False] * len(V)
for i, p in enumerate(polys):
    if inner[i]:
        for j in p: vinner[j] = True
print('REGIONS', len(V), 'verts', len(polys), 'faces; inner', sum(inner), 'mixed', sum(vmix), 'height', round(H, 3))
MARGIN = 0.004 * H / 1.62  # 4 mm on the 1.62 m Yola (the game's height), in this file's units
TARGET = {s: [i for i, p in enumerate(polys) if not inner[i] and not parm[s][i] and preg[i] in ('torso', 'head', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'shoulder_' + ('R' if s == 'L' else 'L'))] for s in 'LR'}
ARMPTS = {s: [i for i in range(len(V)) if not vinner[i] and not vmix[i] and vreg[i] in ('hand_' + s, 'forearm_' + s)] for s in 'LR'}
UPPTS = {s: [i for i in range(len(V)) if not vinner[i] and not vmix[i] and vreg[i] == 'upperarm_' + s] for s in 'LR'}
TORSO = {s: [i for i, p in enumerate(polys) if not inner[i] and not parm[s][i] and preg[i] == 'torso'] for s in 'LR'}

def set_action(act):
    ARM.animation_data_create(); ARM.animation_data.action = act
    try: ARM.animation_data.action_slot = act.slots[0]
    except Exception: pass
def posed():
    dg = bpy.context.evaluated_depsgraph_get(); ev = ME.evaluated_get(dg); m = ev.to_mesh()
    P = [ME.matrix_world @ v.co for v in m.vertices]; ev.to_mesh_clear(); return P
def bvh_of(P, faces): return BVHTree.FromPolygons(P, [polys[i] for i in faces])
def deepest_in(bvh, pts):
    """the deepest of pts ((index, position) pairs) inside bvh's surface: (depth, point index, outward normal) or (0, None, None)"""
    best = (0.0, None, None)
    for i, p in pts:
        loc, n, idx, d = bvh.find_nearest(p, 0.05 * H / 1.62)
        if loc is None or (p - loc).dot(n) >= 0 and d > 1e-6: continue
        # the closest point on an edge or a corner (Tripo's mesh is cut at every UV seam): the sign from the mean normal of every
        # face sharing it (a pseudo-normal), not the one face find_nearest picked
        nn = Vector()
        for l2, n2, i2, d2 in bvh.find_nearest_range(p, d + 1e-5 * H):
            if d2 <= d + 1e-6 * H: nn += n2
        # inside = straight behind the surface (against its normal); a point beside a hole the left-out skin leaves sees a far
        # face's edge side-on, never from behind
        if nn.length < 1e-9 or d < 1e-9 or (p - loc).normalized().dot(nn.normalized()) > -0.5: continue
        if d > best[0]: best = (d, i, nn.normalized())
    return best
def deepest(P, faces, pts): return deepest_in(bvh_of(P, faces), ((i, P[i]) for i in pts))
def frames(act): return range(int(act.frame_range[0]), int(act.frame_range[1]) + 1)
mm = lambda d: round(d / H * 1.62 * 1000, 1)  # model units -> mm on the 1.62 m Yola

def scan(names, step=2, rng=None):
    rep = {}
    for n in names:
        act = bpy.data.actions.get(n)
        if act is None: print('NO CLIP', n); continue
        set_action(act); worst = {'L': [0, 0], 'R': [0, 0], 'upL': [0, 0], 'upR': [0, 0]}
        for f in [f for f in frames(act) if rng is None or rng[0] <= f <= rng[1]][::step]:
            sc.frame_set(f); P = posed()
            for s in 'LR':
                d = deepest(P, TARGET[s], ARMPTS[s])[0]
                if d > worst[s][0]: worst[s] = [d, f]
                u = deepest(P, TORSO[s], UPPTS[s])[0]
                if u > worst['up' + s][0]: worst['up' + s] = [u, f]
        rep[n] = {k: [mm(v[0]), v[1]] for k, v in worst.items()}
        print('SCAN', n, rep[n], flush=True)
    return rep

LOOPS = re.compile(r'idle|walk|run|strafe|Idle')
ARMS_DOWN = re.compile(r'tripo_idle|_plain|t_greet|t_hit|hit_body')  # arms hanging by her sides: turned out at the shoulder
def smooth_over(vals, F, loop, sigma):
    """Gaussian-smoothed per-frame values (dict frame -> float); looping clips wrap"""
    K = [(k, math.exp(-0.5 * (k / sigma) ** 2)) for k in range(-int(3 * sigma), int(3 * sigma) + 1)]
    out = {}
    for f in F:
        acc = ws = 0.0
        for k, w in K:
            g = f + k
            if g < F[0] or g > F[-1]:
                if not loop: continue
                g = F[0] + (g - F[0]) % len(F)
            acc += vals[g] * w; ws += w
        out[f] = acc / ws
    return out
def side_name(s): return 'Left' if s == 'L' else 'Right'
def out_axis(s):
    """the shoulder joint (world) and the axis that turns this upper arm straight out to the side (away from the other shoulder)"""
    S = ARM.matrix_world @ contacts._pb(ARM, side_name(s) + 'Arm').head
    O = ARM.matrix_world @ contacts._pb(ARM, side_name('R' if s == 'L' else 'L') + 'Arm').head
    E = ARM.matrix_world @ contacts._pb(ARM, side_name(s) + 'ForeArm').head
    return S, (E - S).cross(S - O).normalized()
def abduct(n, step=1):
    """Arms by her sides (her body is wider than the rig they were made on): each upper arm turned out at the shoulder by the
    least angle that clears the hand, forearm and upper arm from her torso and legs (+4 mm), found every `step` frames on her
    posed mesh (the arm moved rigidly), smoothed over time and never less than needed; the forearm and hand keep their own
    rotations. Returns the angles used (degrees)."""
    act = bpy.data.actions[n]; set_action(act); F = list(frames(act)); loop = bool(LOOPS.search(n))
    KF = F[::step] + ([F[-1]] if (F[-1] - F[0]) % step else [])
    raw = {s: {} for s in 'LR'}
    for f in KF:
        sc.frame_set(f); P = posed()
        for s in 'LR':
            S, ax = out_axis(s)
            bT, bU = bvh_of(P, TARGET[s]), bvh_of(P, TORSO[s])
            def pen(t):
                R = Matrix.Rotation(t, 3, ax); tr = lambda i: S + R @ (P[i] - S)
                return max(deepest_in(bT, ((i, tr(i)) for i in ARMPTS[s]))[0], deepest_in(bU, ((i, tr(i)) for i in UPPTS[s]))[0])
            if pen(0) <= 0: raw[s][f] = 0.0; continue
            lo, hi = 0.0, math.radians(30)
            if pen(hi) > 0: print('  still in at 30 deg', n, s, f); raw[s][f] = hi; continue
            for _ in range(8):
                m = (lo + hi) / 2
                if pen(m) > 0: lo = m
                else: hi = m
            reach = max((P[i] - S).length for i in ARMPTS[s][::25])
            raw[s][f] = hi + MARGIN / reach
    th = {}
    for s in 'LR':  # every frame: linear between the measured ones, smoothed, never under the need
        lin = {}
        for a, b in zip(KF, KF[1:]):
            for f in range(a, b + 1): lin[f] = raw[s][a] + (raw[s][b] - raw[s][a]) * (f - a) / (b - a)
        t = smooth_over(lin, F, loop, 3.0); t = {f: max(t[f], lin[f]) for f in F}
        t = smooth_over(t, F, loop, 1.5); th[s] = {f: max(t[f], lin[f]) for f in F}
    Mi = ARM.matrix_world.to_3x3().inverted()
    for f in F:
        sc.frame_set(f)
        for s in 'LR':
            if th[s][f] < 1e-5: continue
            S, ax = out_axis(s); pb = contacts._pb(ARM, side_name(s) + 'Arm')
            contacts._set_rot(pb, Matrix.Rotation(th[s][f], 3, (Mi @ ax).normalized()) @ pb.matrix.to_3x3())
            pb.keyframe_insert('rotation_quaternion', frame=f)
    return {s: round(math.degrees(max(th[s].values())), 1) for s in 'LR'}

CAP = 0.06  # an attack's hand is moved at most 6 cm (game metres): a bigger need is the pose's to fix by hand, and is reported
def fix(names):
    rep = {}
    for spec in names:
        n, _, rng = spec.partition(':')  # clip[:f0-f1]: only the frames the game plays (an attack's own range)
        act = bpy.data.actions.get(n)
        if act is None: print('NO CLIP', n); continue
        if ARMS_DOWN.search(n):
            deg = abduct(n); after = scan([n], step=1)[n]
            rep[n] = {'arms_out_deg': deg, 'after': after}; print('FIXED', n, rep[n], flush=True)
            continue
        set_action(act); F = list(frames(act)); loop = bool(LOOPS.search(n))
        lo, hi = (int(x) for x in rng.split('-')) if rng else (F[0], F[-1])
        cap = CAP * H / 1.62; capped = {s: 0.0 for s in 'LR'}
        need = {s: {f: Vector() for f in F} for s in 'LR'}
        # 1. per frame: the hand's move out of the body (iterated: the forearm moves with it), from the clip's own pose
        for f in range(lo, hi + 1):
            sc.frame_set(f)
            for s in 'LR':
                side = 'Left' if s == 'L' else 'Right'
                tot = Vector()
                for it in range(4):
                    d, i, nrm = deepest(posed(), TARGET[s], ARMPTS[s])
                    if i is None or d < 1e-5: break
                    step = nrm * (d + MARGIN); tot += step
                    goal = ARM.matrix_world @ contacts._pb(ARM, side + 'Hand').head + step
                    contacts.two_bone(ARM, side + 'Arm', side + 'ForeArm', side + 'Hand', goal, 1.0)
                if tot.length > cap: capped[s] = max(capped[s], tot.length); tot = tot * (cap / tot.length)
                need[s][f] = tot
            sc.frame_set(f)  # (back to the clip's pose: nothing keyed yet)
        # 2. smoothed over +-4 frames (looping clips wrap), never less than each frame's own need along its direction
        K = [math.exp(-0.5 * (k / 2.0) ** 2) for k in range(-4, 5)]
        moved = {s: 0.0 for s in 'LR'}
        for f in range(lo, hi + 1):
            sc.frame_set(f)
            for s in 'LR':
                side = 'Left' if s == 'L' else 'Right'
                acc, wsum = Vector(), 0.0
                for k, w in zip(range(-4, 5), K):
                    g = f + k
                    if g < F[0] or g > F[-1]:
                        if not loop: continue
                        g = F[0] + (g - F[0]) % len(F)
                    acc += need[s][g] * w; wsum += w
                o = acc / wsum; own = need[s][f]
                if own.length > 1e-6:
                    u = own.normalized(); short = own.length - o.dot(u)
                    if short > 0: o += u * short
                if o.length < 1e-6: continue
                goal = ARM.matrix_world @ contacts._pb(ARM, side + 'Hand').head + o
                contacts.two_bone(ARM, side + 'Arm', side + 'ForeArm', side + 'Hand', goal, 1.0)
                for b in ('Arm', 'ForeArm', 'Hand'): contacts._pb(ARM, side + b).keyframe_insert('rotation_quaternion', frame=f)
                moved[s] = max(moved[s], o.length)
        # 3. check
        after = scan([n], step=1, rng=(lo, hi))[n]
        rep[n] = {'frames': [lo, hi], 'moved_mm': {s: mm(v) for s, v in moved.items()}, 'wanted_more_mm': {s: mm(v) for s, v in capped.items() if v}, 'after': after}
        print('FIXED', n, rep[n], flush=True)
    bpy.ops.wm.save_mainfile()
    return rep

R = scan(CLIPS) if MODE == 'scan' else fix(CLIPS)
json.dump(R, open(OUT, 'w'), indent=1)
print('FIXES_DONE', MODE, len(R))
