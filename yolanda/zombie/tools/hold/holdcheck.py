# Hold checker (WEAPON_HOLD_PROCESS.md sections 4, 5, 7): for every frame of the given actions, place the weapon by the
# grip solve (shaft through the primary fist centre along its grip axis), then measure:
#   grip     support fist centre -> shaft distance, along-shaft offset from its grip point, grip-axis angle
#   joints   both arms' anatomical angles against the human limits
#   body     weapon surface points inside her body (torso, head, legs) and arm skin inside her body, from her skinned mesh
# usage: blender -b blender/characters.blend --python tools/hold/holdcheck.py -- <hands.json> <weapon> <out.json> <action[:f0-f1]> [...]
import bpy, sys, os, json, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import holdlib as H

argv = sys.argv[sys.argv.index('--') + 1:]
cal = H.load_json(argv[0]); weapon = argv[1]; out_path = argv[2]; specs = argv[3:]
W = H.load_json(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'weapons_hold.json'))[weapon]
U = 1 / H.M  # metres -> model units
arm, body = H.rig(); JF = H.joint_frames(arm, cal)
prim = W['primary']; sup = 'Right' if prim == 'Left' else 'Left'

# body regions by each face's majority bone
gi = {g.index: g.name.replace('mixamorig:', '') for g in body.vertex_groups}
def region(bn):
    if bn is None: return None
    if bn.startswith(('Left', 'Right')):
        s = 'Left' if bn.startswith('Left') else 'Right'; r = bn[len(s):]
        if r.startswith('Hand'): return s + 'Hand'
        if r in ('Arm', 'ForeArm', 'Shoulder'): return s + ('Shoulder' if r == 'Shoulder' else 'Arm')
        return 'legs'
    return 'head' if bn.startswith('Head') else 'torso'
vreg = []
for v in body.data.vertices:
    vreg.append(region(gi.get(max(v.groups, key=lambda e: e.weight).group)) if v.groups else None)
BODY = {'torso', 'head', 'legs', 'LeftShoulder', 'RightShoulder'}
body_faces = [p.index for p in body.data.polygons if sum(vreg[i] in BODY for i in p.vertices) * 2 > len(p.vertices)]
# arm skin that can go through the body: the forearm and the outer 60% of the upper arm (the armpit end of the upper arm
# meets the torso by design and is not a penetration)
def outer_arm(i, s):
    if vreg[i] != s + 'Arm': return False
    bn = gi.get(max(body.data.vertices[i].groups, key=lambda e: e.weight).group)
    if bn == s + 'ForeArm': return True
    p = (arm.matrix_world.inverted() @ body.matrix_world) @ body.data.vertices[i].co
    return H.seg_dist(p, H.rest_head(arm, s + 'Arm'), H.rest_head(arm, s + 'ForeArm'))[1] > 0.4
arm_verts = {s: [i for i in range(len(vreg)) if outer_arm(i, s)] for s in H.SIDES}
print('faces in the body set', len(body_faces), 'arm skin vertices', {s: len(v) for s, v in arm_verts.items()})

def weapon_points(knob, d):  # points on the weapon's surface: rings every 1 cm along the profile
    pr = W['profile']; L = W['length']; pts = []
    a = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0)); e1 = d.cross(a).normalized(); e2 = d.cross(e1)
    s = 0.0
    while s <= L + 1e-6:
        r = next((r0 + (r1 - r0) * (s - s0) / max(1e-9, s1 - s0) for (s0, r0), (s1, r1) in zip(pr, pr[1:]) if s0 <= s <= s1), pr[-1][1])
        c = knob + d * (s * U)
        pts.append((s, c))
        for k in range(8):
            t = k * math.pi / 4; pts.append((s, c + (e1 * math.cos(t) + e2 * math.sin(t)) * (r * U)))
        s += 0.01
    return pts

def inside(bvh, p):  # both tests agree: the nearest surface faces away from p, and an upward ray leaves through a back face
    hit = bvh.find_nearest(p)
    if hit[0] is None or (p - hit[0]).dot(hit[1]) >= 0: return 0.0
    loc, nrm, idx, dist = bvh.ray_cast(p, Vector((0, 0, 1)))
    if loc is None or nrm.dot(Vector((0, 0, 1))) <= 0: return 0.0
    return hit[3]

result = {'weapon': weapon, 'primary': prim, 'frames': []}
dg = bpy.context.evaluated_depsgraph_get()
toA = arm.matrix_world.inverted()
for spec in specs:
    name, _, rng = spec.partition(':'); act = H.use_action(arm, name)
    f0, f1 = (map(int, rng.split('-')) if rng else map(int, act.frame_range))
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
        row = {'action': name, 'f': f}
        # the grip solve: shaft through the primary fist centre along its grip axis
        cP, aP, kP = H.fist_world(arm, prim, cal); d = aP
        knob = cP - d * (W['grips'][prim] * U)
        row['knob'] = list(knob); row['dir'] = list(d)
        curl = {s: H.finger_curl(arm, s) for s in H.SIDES}; row['curl'] = {s: round(c) for s, c in curl.items()}
        row['primary_holding'] = curl[prim] >= W['support_release_curl']
        row['support_holding'] = row['primary_holding'] and curl[sup] >= W['support_release_curl']
        cS, aS, kS = H.fist_world(arm, sup, cal)
        v = cS - knob; along = v.dot(d) * H.M; perp = (v - d * v.dot(d)).length * H.M
        row['support'] = {'off_shaft_cm': round(perp * 100, 2), 'along_err_cm': round((along - W['grips'][sup]) * 100, 2),
                          'axis_deg': round(math.degrees(aS.angle(d)), 1)}
        row['joints'] = {}
        for s in H.SIDES:
            ang = H.measure_arm(arm, s, JF, cal['hinge']); row['joints'][s] = {k: round(x, 1) for k, x in ang.items()}
            row['joints'][s]['faults'] = H.limit_faults(ang)
        # her skinned mesh this frame
        ev = body.evaluated_get(dg); me = ev.to_mesh(); mw = toA @ ev.matrix_world
        V = [mw @ v.co for v in me.vertices]
        bvh = BVHTree.FromPolygons(V, [tuple(me.polygons[i].vertices) for i in body_faces])
        pen = 0.0; pen_at = None
        for s_, p in weapon_points(knob, d):
            dep = inside(bvh, p)
            if dep > pen: pen, pen_at = dep, s_
        row['weapon_in_body_cm'] = round(pen * H.M * 100, 2); row['weapon_in_body_at_m'] = pen_at
        row['arm_in_body_cm'] = {}
        for s in H.SIDES:
            m = 0.0
            for i in arm_verts[s][::2]: m = max(m, inside(bvh, V[i]))
            row['arm_in_body_cm'][s] = round(m * H.M * 100, 2)
        ev.to_mesh_clear()
        result['frames'].append(row)
    print('checked', name, f0, f1)

# summary
allf = result['frames']; fr = [r for r in allf if r['primary_holding']]; hold = [r for r in fr if r['support_holding']]
def mx(xs): return max(xs) if xs else 0
summ = {
    'frames': len(allf), 'weapon_held_frames': len(fr), 'released_frames': [f"{r['action']}:{r['f']}" for r in allf if not r['primary_holding']][:3] + ['...'], 'support_holding_frames': len(hold),
    'support_off_shaft_cm_max': mx([r['support']['off_shaft_cm'] for r in hold]),
    'support_along_err_cm_max': mx([abs(r['support']['along_err_cm']) for r in hold]),
    'support_axis_deg_max': mx([r['support']['axis_deg'] for r in hold]),
    'joint_fault_frames': {s: sum(1 for r in fr if r['joints'][s]['faults']) for s in H.SIDES},
    'joint_faults_worst': {},
    'weapon_in_body_frames': sum(1 for r in fr if r['weapon_in_body_cm'] > 0.2), 'weapon_in_body_cm_max': mx([r['weapon_in_body_cm'] for r in fr]),
    'arm_in_body_frames': {s: sum(1 for r in fr if r['arm_in_body_cm'][s] > 0.5) for s in H.SIDES},
    'arm_in_body_cm_max': {s: mx([r['arm_in_body_cm'][s] for r in fr]) for s in H.SIDES},
}
for s in H.SIDES:
    worst = {}
    for r in fr:
        for k, v in r['joints'][s]['faults']:
            if abs(v) > abs(worst.get(k, (0, 0))[0]): worst[k] = (v, f"{r['action']}:{r['f']}")
    summ['joint_faults_worst'][s] = worst
result['summary'] = summ
json.dump(result, open(out_path, 'w'), indent=1)
print('SUMMARY', json.dumps(summ))
