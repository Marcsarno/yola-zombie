# A Meshy character for the Rig Lab (2026-10-22, the user: "don't add this character to the game.. but add her to the rig
# and get her grip on the baseball bat correct"): Meshy's "Pumpkin Spice Rebel" (assets/source/meshy/rebel_original.glb,
# local only). Her rig has mixamorig names, but each hand has only a thumb and a middle-finger chain, and the fingers are
# one fused block weighted wholly to the hand bone (only the thumb moved). So:
#   - the four-finger block is weighted along the middle-finger chain (ramps across each joint): the fingers curl
#     together, a mitten, round a handle (the thumb keeps Meshy's own weights);
#   - unweighted Index1 / Pinky1 bones are added at the two ends of the knuckle row, so the grip tools (render/holdfit.js:
#     the grip line from index to little finger) can read her hands;
#   - the Mixamo bat clips are retargeted onto her (blender/retarget.py) without their 'yola_' prefix, so the Rig Lab
#     pairs each with X Bot playing the same clip; her own Meshy clips stay.
# usage: blender -b --factory-startup --python tools/anim/build_meshy.py -- <in.glb> <out.glb>
import bpy, sys, os, mathutils
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget
sys.path.insert(0, HERE)
import contacts

def fcurves(act):
    try: return list(act.fcurves)
    except Exception: pass
    return [fc for l in act.layers for st in l.strips for cb in st.channelbags for fc in cb.fcurves]

src_glb, out_glb = sys.argv[sys.argv.index('--') + 1:][:2]
MIX = os.path.join(HERE, '..', '..', 'assets', 'mixamo')
CLIPS = ['bat_idle', 'bat_swing', 'baseball_single', 'baseball_double', 'baseball_homerun']
RAMP = 0.007  # m: each finger joint bends over this much skin either side

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src_glb)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.vertex_groups: bpy.data.objects.remove(o, do_unlink=True)  # (a stray icosphere)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.name = 'REBEL'
me = next(o for o in bpy.data.objects if o.type == 'MESH')
arm.animation_data_create(); keep_acts = list(bpy.data.actions); arm.animation_data.action = None
W = arm.matrix_world

# ---- the finger weights (rest pose, armature space)
def bone(n): return arm.data.bones['mixamorig:' + n]
for S in ('Left', 'Right'):
    H = bone(S + 'Hand'); d = (H.tail_local - H.head_local).normalized()
    joints = [bone(S + 'HandMiddle%d' % i).head_local for i in (1, 2, 3)]
    tj = [(j - H.head_local).dot(d) for j in joints]
    names = ['mixamorig:%sHand' % S] + ['mixamorig:%sHandMiddle%d' % (S, i) for i in (1, 2, 3)]
    vg = {n: me.vertex_groups.get(n) or me.vertex_groups.new(name=n) for n in names}
    thumbs = {g.index for g in me.vertex_groups if g.name.startswith('mixamorig:%sHandThumb' % S)}
    hand_i = vg[names[0]].index
    inv = arm.matrix_world.inverted() @ me.matrix_world
    M1 = bone(S + 'HandMiddle1').head_local
    # across the hand, toward the thumb (square to the hand's line): the knuckle row runs this way
    across = bone(S + 'HandThumb1').head_local - M1; across -= d * across.dot(d); across.normalize()
    moved = 0; a_lo, a_hi = 9.0, -9.0
    for v in me.data.vertices:
        ws = {g.group: g.weight for g in v.groups}
        if ws.get(hand_i, 0) < 0.5 or any(ws.get(t, 0) > 0.05 for t in thumbs): continue
        p = inv @ v.co; t = (p - H.head_local).dot(d)
        if t < tj[0] - RAMP: continue
        # each segment's share, hand -> M1 -> M2 -> M3, a linear ramp across each joint:
        # w0 = 1-u0, w1 = u0 (1-u1), w2 = u0 u1 (1-u2), w3 = u0 u1 u2
        u = [min(1.0, max(0.0, (t - (tj[k] - RAMP)) / (2 * RAMP))) for k in range(3)]
        w = [1 - u[0], u[0] * (1 - u[1]), u[0] * u[1] * (1 - u[2]), u[0] * u[1] * u[2]]
        total = ws.get(hand_i, 0)
        for n, x in zip(names, w):
            if x > 1e-4: vg[n].add([v.index], x * total, 'REPLACE')
            elif n == names[0]: vg[n].remove([v.index])
        moved += 1
        a = (p - M1).dot(across); a_lo = min(a_lo, a); a_hi = max(a_hi, a)   # (the whole finger block's width: its few vertices near the knuckles miss the ends)
    print('FINGERS', S, 'verts', moved, 'knuckle t', [round(x, 3) for x in tj], 'row across', round(a_lo, 3), round(a_hi, 3))
    # ---- the knuckle-row markers (no skin): index at the thumb's end of the row, little finger at the other, a little in
    # from the skin (the fingers' middles, as on a real hand)
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones; h = eb['mixamorig:%sHand' % S]; m1 = eb['mixamorig:%sHandMiddle1' % S]
    for nm, a in (('Index1', a_hi * 0.75), ('Pinky1', a_lo * 0.75)):
        b = eb.new('mixamorig:%sHand%s' % (S, nm)); b.head = m1.head + across * a; b.tail = b.head + d * 0.02
        b.parent = h; b.use_deform = False; b.roll = m1.roll
    bpy.ops.object.mode_set(mode='OBJECT')

# ---- the clips: X Bot's, from assets/mixamo (retarget.py: world-space change from rest; hips by leg height), then the
# contacts (tools/anim/contacts.py, while X Bot is still loaded). MESHY_HANDS: 'support' (her left hand where his is in
# his right hand's own frame, scaled by hand size; her right hand where her arm puts it), 'arm' (Yola's bat setting: the
# hands' midpoint from the shoulders, together-hands kept at hand size), 'gunhand', or 'none'. Her shoe soles go back
# onto the floor while his feet are planted.
HANDS = os.environ.get('MESHY_HANDS', 'support')
SHOES = contacts.shoe_vertices(me); CLOG = []
for name in CLIPS:
    before = set(bpy.data.objects); acts0 = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(MIX, 'yola_' + name + '.fbx'))
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    acts = [a for a in bpy.data.actions if a not in acts0]
    src.animation_data_create(); src.animation_data.action = acts[0]
    try: src.animation_data.action_slot = acts[0].slots[0]
    except Exception: pass
    s0 = int(round(acts[0].frame_range[0]))
    if s0 != 1:  # (line the source's frames up with the target's: retarget writes frames from 1)
        for fc in fcurves(acts[0]):
            for k in fc.keyframe_points: k.co.x -= s0 - 1; k.handle_left.x -= s0 - 1; k.handle_right.x -= s0 - 1
    act = retarget(src, arm, name + os.environ.get('MESHY_SUFFIX', '')); act.use_fake_user = True   # (MESHY_SUFFIX '_REBAKE_<what>': a Rig Lab test bake)
    arm.animation_data.action = act
    try: arm.animation_data.action_slot = act.slots[0]
    except Exception: pass
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    if HANDS == 'support': contacts.support(src, arm, act, f0, f1, CLOG)
    elif HANDS in ('arm', 'gunhand'): contacts.hands(src, arm, act, f0, f1, CLOG, mode=HANDS)
    contacts.feet(src, arm, me, act, f0, f1, SHOES, CLOG, lock=not name.endswith('idle'))
    print('CLIP', name, (f0, f1), 'CONTACTS', CLOG[-2:])
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    for x in acts: bpy.data.actions.remove(x)
# ---- golf_swing (2026-10-22, the user: "have her swing lower to the ground, and not run away after"): only her own
# baseball_homerun frames (as retargeted and contact-fixed above), re-timed, plus one constant lean:
#   address = its impact pose held; takeaway = its downswing played backwards, slowed; a pause at the top; then its real
#   downswing, impact and high finish, the finish held (the bat's drop and the run to first base are left out).
#   The lean: her spine bent forward from its base by GOLF_LEAN degrees about her hip line at address, on every frame,
#   so the swing's plane tips down to the ground (her legs and feet stay as the clip has them).
GOLF_LEAN = float(os.environ.get('MESHY_GOLF_LEAN', 36))   # (36: the club's sole on the ground at address and impact, measured in the Rig Lab)
G_TOP, G_HIT, G_FIN = 33, 43, 50   # homerun frames: top of the backswing, the club head's lowest point, the high finish
def _new_fc(act, slot, path, idx, group):
    try: return act.fcurves.new(path, index=idx, action_group=group)
    except Exception:
        lay = act.layers[0] if act.layers else act.layers.new('Layer'); st = lay.strips[0] if lay.strips else lay.strips.new(type='KEYFRAME')
        return st.channelbag(slot, ensure=True).fcurves.new(path, index=idx, group_name=group)
hr = bpy.data.actions.get('baseball_homerun' + os.environ.get('MESHY_SUFFIX', ''))
if hr and not os.environ.get('MESHY_SUFFIX'):
    seq = [G_HIT] * 15 + [G_HIT + (G_TOP - G_HIT) * i / 25 for i in range(26)] + [G_TOP] * 6 + list(range(G_TOP + 1, G_FIN + 1)) + [G_FIN] * 25
    golf = bpy.data.actions.new('golf_swing'); golf.use_fake_user = True
    try: slot = golf.slots.new(id_type='OBJECT', name=arm.name)
    except Exception: slot = None
    for fc in fcurves(hr):
        out = _new_fc(golf, slot, fc.data_path, fc.array_index, fc.data_path.split('"')[1] if '"' in fc.data_path else 'misc')
        for i, t in enumerate(seq): out.keyframe_points.insert(i + 1, fc.evaluate(t), options={'FAST'})
    arm.animation_data.action = golf
    try: arm.animation_data.action_slot = golf.slots[0]
    except Exception: pass
    sc = bpy.context.scene; sc.frame_set(1)
    pbs = arm.pose.bones
    left = (pbs['mixamorig:LeftUpLeg'].head - pbs['mixamorig:RightUpLeg'].head); left.z = 0; left.normalize()   # (her hip line at address, armature space)
    R = mathutils.Matrix.Rotation(GOLF_LEAN * 3.14159265 / 180, 4, left)
    sp = pbs['mixamorig:Spine']
    for f in range(1, len(seq) + 1):
        sc.frame_set(f)
        h = sp.head.copy()
        sp.matrix = mathutils.Matrix.Translation(h) @ R @ mathutils.Matrix.Translation(-h) @ sp.matrix
        sp.keyframe_insert('rotation_quaternion', frame=f)
    # both hands stay on the club all the way (the baseball finish lets go with the top hand; a golfer doesn't): her left
    # hand held where it is at address in her right hand's own frame (contacts.support_rel, as the composite pistol clips)
    rel = contacts.grip_relation(arm, 1, 1)
    contacts.support_rel(arm, golf, 1, len(seq), rel, CLOG)
    print('CLIP golf_swing', (1, len(seq)), 'lean', GOLF_LEAN, 'from homerun', (G_HIT, G_TOP, G_FIN), 'hands', CLOG[-1])
for a in keep_acts:
    if os.environ.get('MESHY_SUFFIX'): bpy.data.actions.remove(a)   # (a test bake carries only the rebuilt clips)
    else: a.use_fake_user = True
arm.animation_data.action = None
for o in bpy.data.objects: o.select_set(o in (arm, me))
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                          export_frame_step=1, export_image_format='WEBP', export_jpeg_quality=88)
print('WROTE', out_glb, 'height', round(me.dimensions.z, 3))
