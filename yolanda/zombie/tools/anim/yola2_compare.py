# Frame-by-frame check of the new Yola's clips against their source rig (Mixamo's X Bot: the skeleton the clips were
# captured on, a well-tested reference), every frame:
#   body   angle between each limb / spine bone on her and on the X Bot (world space), degrees
#   hands  each hand's position from its shoulder, in arm lengths (her own vs the X Bot's), and the gap between the hands
#          in shoulder widths (two-handed holds)
#   feet   the lowest point of each shoe above the floor (her skinned mesh), and the slide of a planted foot
#          (cm per frame at her 1.62 m) next to the X Bot's own slide, scaled to her leg length
# usage: blender -b <yola2.blend> --python tools/anim/yola2_compare.py -- <assets dir> <out.json> [clip ...]
import bpy, sys, os, json, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
A, OUT, only = argv[0], argv[1], set(argv[2:])
sc = bpy.context.scene; sc.render.fps = 30
Y = bpy.data.objects['YOLA2']; ME = bpy.data.objects['YOLA2_mesh']
XBOT = {'bat_idle': 'yola_bat_idle', 'gs_low_slash': 'yola_gs_low_slash', 'p_run_back_plain': 'yola_run_back_plain',
    'p_run_plain': 'yola_run_plain', 'p_run_strafe_left_plain': 'yola_run_strafe_left_plain', 'p_run_strafe_right_plain': 'yola_run_strafe_right_plain',
    'p_walk_strafe_left_plain': 'yola_walk_strafe_left_plain', 'p_walk_strafe_right_plain': 'yola_walk_strafe_right_plain',
    'pistol_hit': 'yola_pistol_hit', 'pistol_idle': 'yola_pistol_idle', 'pistol_run': 'yola_pistol_run', 'pistol_run_back': 'yola_pistol_run_back',
    'pistol_strafe_right': 'yola_pistol_strafe_right', 'pistol_walk': 'yola_pistol_walk', 'pistol_walk_back': 'yola_pistol_walk_back',
    'reload_rifle_stand': 'yola_reload_rifle_stand', 'rifle_aim_idle': 'yola_rifle_aim_idle', 'yola_knockdown': 'zombie_knockdown',
    'yola_getup': 'zombie_standup_stomach', 'melee_horizontal': 'yola_melee_horizontal', 'bat_swing': 'yola_baseball_single'}
LIMBS = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm',
         'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftHandMiddle1', 'RightHandMiddle1']

def set_action(arm, act):
    arm.animation_data_create(); arm.animation_data.action = act
    try: arm.animation_data.action_slot = act.slots[0]
    except Exception: pass
def P(arm, n): return arm.matrix_world @ arm.pose.bones['mixamorig:' + n].head
def T(arm, n): return arm.matrix_world @ arm.pose.bones['mixamorig:' + n].tail
def rest_len(arm, *ns): return sum((arm.matrix_world.to_3x3() @ (arm.data.bones['mixamorig:' + n].tail_local - arm.data.bones['mixamorig:' + n].head_local)).length for n in ns)
def rest_h(arm, n): return (arm.matrix_world @ arm.data.bones['mixamorig:' + n].head_local)
H_Y = max((ME.matrix_world @ Vector(v)).z for v in ME.bound_box) - min((ME.matrix_world @ Vector(v)).z for v in ME.bound_box)
M_PER_UNIT = 1.62 / H_Y
# her shoe vertices (weighted mostly to the foot / toe bones), per side
vg = {g.index: g.name for g in ME.vertex_groups}
shoe = {'Left': [], 'Right': []}
for v in ME.data.vertices:
    best = max(v.groups, key=lambda g: g.weight, default=None)
    if best is None: continue
    n = vg[best.group]
    for s in shoe:
        if n in ('mixamorig:%sFoot' % s, 'mixamorig:%sToeBase' % s): shoe[s].append(v.index)
dg = bpy.context.evaluated_depsgraph_get()
def soles():
    ev = ME.evaluated_get(dg); m = ev.to_mesh(); W = ME.matrix_world
    out = {s: min((W @ m.vertices[i].co).z for i in idx) for s, idx in shoe.items()}
    ev.to_mesh_clear(); return out

objs0 = set(bpy.data.objects); a0 = set(bpy.data.actions)
bpy.ops.import_scene.fbx(filepath=os.path.join(A, 'mixamo', 'reference', 'ref_xbot_pistol_idle.fbx'), automatic_bone_orientation=False)
X = next(o for o in bpy.data.objects if o not in objs0 and o.type == 'ARMATURE'); X.name = 'XBOT'
for a in [a for a in bpy.data.actions if a not in a0]: bpy.data.actions.remove(a)
armX = rest_len(X, 'LeftArm', 'LeftForeArm'); armY = rest_len(Y, 'LeftArm', 'LeftForeArm')
shX = (rest_h(X, 'LeftArm') - rest_h(X, 'RightArm')).length; shY = (rest_h(Y, 'LeftArm') - rest_h(Y, 'RightArm')).length
legX = rest_len(X, 'LeftUpLeg', 'LeftLeg'); legY = rest_len(Y, 'LeftUpLeg', 'LeftLeg')
toeX0 = min(rest_h(X, 'LeftToe_End').z, rest_h(X, 'LeftToeBase').z)
report = {}
for clip, fbx in XBOT.items():
    if only and clip not in only: continue
    act = bpy.data.actions.get(clip)
    if not act: continue
    b0 = set(bpy.data.objects); a1 = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(A, 'mixamo', fbx + '.fbx'), automatic_bone_orientation=False)
    tmp = [o for o in bpy.data.objects if o not in b0]; xa = [a for a in bpy.data.actions if a not in a1][0]
    for o in tmp: bpy.data.objects.remove(o, do_unlink=True)
    set_action(X, xa); set_action(Y, act)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    rows = []; prev = None
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        ang = {}
        for n in LIMBS:
            dx = (T(X, n) - P(X, n)).normalized(); dy = (T(Y, n) - P(Y, n)).normalized()
            ang[n] = math.degrees(dx.angle(dy, 0))
        hands = {}
        for s in ('Left', 'Right'):
            hx = (P(X, s + 'Hand') - P(X, s + 'Arm')) / armX; hy = (P(Y, s + 'Hand') - P(Y, s + 'Arm')) / armY
            hands[s] = (hx - hy).length
        gapX = (P(X, 'LeftHand') - P(X, 'RightHand')).length / shX; gapY = (P(Y, 'LeftHand') - P(Y, 'RightHand')).length / shY
        so = soles()
        feet = {s: {'sole': so[s] * M_PER_UNIT * 100, 'y': P(Y, s + 'Foot'), 'x': P(X, s + 'Foot'), 'xt': min(P(X, s + 'ToeBase').z, P(X, s + 'Toe_End').z) - toeX0} for s in ('Left', 'Right')}
        rows.append({'f': f, 'ang': ang, 'hands': hands, 'gap': [gapX, gapY], 'feet': feet})
    # planted-foot slide: frames where the X Bot's foot is down (toe within 2 cm of its rest height, scaled) and slow
    slide = {}
    for s in ('Left', 'Right'):
        sy, sx = [], []
        for i in range(1, len(rows)):
            a, b = rows[i - 1]['feet'][s], rows[i]['feet'][s]
            if b['xt'] > 0.03: continue  # (X Bot world metres: its toe within 3 cm of its rest height)
            vx = (Vector((b['x'].x - a['x'].x, b['x'].y - a['x'].y))).length / legX
            vy = (Vector((b['y'].x - a['y'].x, b['y'].y - a['y'].y))).length / legY
            sx.append(vx); sy.append(vy)
        slide[s] = {'frames': len(sy), 'yola_cm': (sorted(sy)[len(sy) // 2] * legY * M_PER_UNIT * 100) if sy else None,
                    'xbot_cm_scaled': (sorted(sx)[len(sx) // 2] * legY * M_PER_UNIT * 100) if sx else None}
    def stat(vals): vals = sorted(vals); return {'mean': sum(vals) / len(vals), 'p95': vals[int(len(vals) * 0.95)], 'max': vals[-1]}
    worst = {}
    for n in LIMBS:
        st = stat([r['ang'][n] for r in rows]); worst[n] = st
    rep = {
        'frames': len(rows),
        'body_deg': {n: round(v['max'], 2) for n, v in sorted(worst.items(), key=lambda kv: -kv[1]['max'])[:6]},
        'hands_armlen': {s: {k: round(v, 3) for k, v in stat([r['hands'][s] for r in rows]).items()} for s in ('Left', 'Right')},
        'hand_gap_shoulders': {'xbot': [round(min(r['gap'][0] for r in rows), 2), round(max(r['gap'][0] for r in rows), 2)],
                               'yola': [round(min(r['gap'][1] for r in rows), 2), round(max(r['gap'][1] for r in rows), 2)],
                               'max_diff': round(max(abs(r['gap'][0] - r['gap'][1]) for r in rows), 3)},
        'sole_cm': {s: [round(min(r['feet'][s]['sole'] for r in rows), 1), round(max(r['feet'][s]['sole'] for r in rows), 1)] for s in ('Left', 'Right')},
        'slide': {s: {k: (round(v, 2) if isinstance(v, float) else v) for k, v in d.items()} for s, d in slide.items()},
    }
    report[clip] = rep
    print('CMP', clip, json.dumps(rep))
    bpy.data.actions.remove(xa)
json.dump(report, open(OUT, 'w'), indent=1)
print('COMPARE_DONE', len(report))
