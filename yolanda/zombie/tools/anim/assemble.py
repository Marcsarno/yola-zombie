# Assemble a combo action on Yola from pieces of other actions (WEAPON_HOLD_PROCESS.md 6.3): each piece is retimed by a
# piecewise time map (source frame -> output frame), consecutive pieces cross-fade over their overlap (smoothstep, per-bone
# quaternion slerp), and the hips' floor travel stays continuous (each piece's travel starts where the last one left it).
# A piece can be turned about the vertical (yaw, degrees) so every strike faces the target.
# Spec (JSON): {"name": "...", "pieces": [{"action": "heavy_swing", "map": [[37, 1], [64, 40]], "yaw": 0}, ...]}
#   map: [[source frame, output frame], ...], at least two; output frames are the combo's (60 fps). Overlapping output
#   ranges of consecutive pieces are the cross-fades.
# usage: blender -b <blend> --python tools/anim/assemble.py -- <spec.json> <out.blend>
import bpy, sys, json, math
from mathutils import Vector, Quaternion, Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
spec = json.load(open(argv[0])); out = argv[1]
arm = bpy.data.objects['YOLA']; sc = bpy.context.scene; ad = arm.animation_data or arm.animation_data_create()
for t in ad.nla_tracks: t.mute = True
HIPS = 'mixamorig:Hips'
bones = [pb.name for pb in arm.pose.bones]
def interp(mp, x):
    for (a0, b0), (a1, b1) in zip(mp, mp[1:]):
        if b0 <= x <= b1: return a0 + (a1 - a0) * (x - b0) / max(1e-9, b1 - b0)
    return mp[0][0] if x < mp[0][1] else mp[-1][0]
cache = {}
def sample(action, f):  # local pose (quaternion per bone) + hips location at a fractional source frame
    key = (action, round(f, 3))
    if key in cache: return cache[key]
    a = bpy.data.actions[action]; ad.action = a
    try: ad.action_slot = a.slots[0]
    except Exception: pass
    fi = math.floor(f); sc.frame_set(int(fi), subframe=f - fi)
    pose = {}
    for pb in arm.pose.bones:
        q = pb.rotation_quaternion.copy() if pb.rotation_mode == 'QUATERNION' else pb.matrix_basis.to_quaternion()
        pose[pb.name] = q
    pose['_loc'] = arm.pose.bones[HIPS].location.copy()
    cache[key] = pose
    return pose
P = spec['pieces']
for p in P:
    p['o0'], p['o1'] = p['map'][0][1], p['map'][-1][1]
    p['yawq'] = Quaternion((0, 0, 1), math.radians(p.get('yaw', 0)))
N = max(p['o1'] for p in P)
# hips travel: each piece's hips location relative to its own first sampled frame, rotated by its yaw, added to where the
# previous piece was at the start of the overlap
REST = arm.data.bones[HIPS].matrix_local.to_3x3()  # hips pose location is in the bone's rest frame
def hips_arm(pose):  # hips location in armature space (offset from rest)
    return REST @ pose['_loc']
base = [None] * len(P)
def piece_hips(k, of):
    p = P[k]; s = sample(p['action'], interp(p['map'], of))
    s0 = sample(p['action'], p['map'][0][0])
    d = hips_arm(s) - hips_arm(s0); d = p['yawq'] @ d
    return base[k] + Vector((d.x, d.y, 0)) + Vector((0, 0, hips_arm(s).z))
base[0] = Vector((hips_arm(sample(P[0]['action'], P[0]['map'][0][0])).x, hips_arm(sample(P[0]['action'], P[0]['map'][0][0])).y, 0))
for k in range(1, len(P)):
    base[k] = Vector()
    hp = piece_hips(k - 1, P[k]['o0']); base[k] = Vector((hp.x, hp.y, 0))
act = bpy.data.actions.get(spec['name'])
if act: bpy.data.actions.remove(act)
act = bpy.data.actions.new(spec['name']); act.use_fake_user = True
frames = {}
for of in range(1, N + 1):
    live = [(k, p) for k, p in enumerate(P) if p['o0'] <= of <= p['o1']]
    if not live: live = [(len(P) - 1, P[-1])]
    poses = []
    for k, p in live:
        s = sample(p['action'], interp(p['map'], of)); q = dict(s)
        q[HIPS] = p['yawq'] @ s[HIPS]  # the piece's turn applies to the whole body through the hips
        poses.append((k, q, piece_hips(k, of)))
    if len(poses) == 1: w = [1.0]
    else:  # cross-fade from the earlier to the later piece across their overlap
        k0, k1 = poses[0][0], poses[-1][0]; a, b = P[k1]['o0'], P[k0]['o1']
        u = (of - a) / max(1, b - a); u = u * u * (3 - 2 * u); w = [1 - u, u]
        poses = [poses[0], poses[-1]]
    pose = {}
    for bn in bones:
        q = poses[0][1][bn].copy()
        if len(poses) > 1:
            q2 = poses[1][1][bn]
            if q.dot(q2) < 0: q2 = -q2
            q = q.slerp(q2, w[1])
        pose[bn] = q
    loc = poses[0][2] * w[0] + (poses[1][2] * w[1] if len(poses) > 1 else Vector())
    frames[of] = (pose, loc)
ad.action = act
try: ad.action_slot = act.slots[0]
except Exception: pass
prev = {}
for of in range(1, N + 1):
    pose, loc = frames[of]
    for bn in bones:
        pb = arm.pose.bones[bn]; pb.rotation_mode = 'QUATERNION'; q = pose[bn]
        if bn in prev and prev[bn].dot(q) < 0: q = -q
        prev[bn] = q; pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=of)
    hb = arm.pose.bones[HIPS]; hb.location = REST.inverted() @ loc; hb.keyframe_insert('location', frame=of)
act['assembled_from'] = json.dumps({'name': spec['name'], 'pieces': [{k: v for k, v in p.items() if k in ('action', 'map', 'yaw')} for p in P]})
print('ASSEMBLED', spec['name'], 'frames', N, 'pieces', [(p['action'], p['o0'], p['o1']) for p in P])
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True); print('SAVED', out)
