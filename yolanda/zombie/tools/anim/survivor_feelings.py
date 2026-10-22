# Sophie's feelings (2026-10-22, the user: "start with real animations"): two clips for a survivor, from real ones only.
#   hood_Scared    Tripo's own scared_02 (she hugs herself, knees in), from Tripo's preset on Lilah's download
#                  (assets/source/lilah/lilah_original.glb: a Tripo rig with mixamorig names)
#   hood_KneelCry  a blend of two Quaternius UAL1 clips: Fixing_Kneeling's hips and legs, held on one frame (down on her
#                  knee, steady), under Crying's spine, neck, head, arms and hands (her face in her hand, shoulders going)
# Each source is retargeted by blender/retarget.py (world-space change from rest per bone; hips travel scaled by leg
# height); the UAL rig's bones are renamed to mixamorig first, as tools/anim/import_lib.py does. The two UAL sources are
# also kept (src_Crying, src_Kneel) to compare against.
# usage: blender -b --factory-startup --python tools/anim/survivor_feelings.py -- <survivor.glb> <out.glb> [kneel_frame]
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget

argv = sys.argv[sys.argv.index('--') + 1:]
src_glb, out_glb = argv[0], argv[1]
KNEEL_F = int(argv[2]) if len(argv) > 2 else 0  # (0: the middle of Fixing_Kneeling)
MAIN = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..', '..', 'yolanda', 'zombie', 'assets', 'source'))  # (from the worktree: the main checkout's local-only sources)
if not os.path.isdir(MAIN): MAIN = os.path.join(HERE, '..', '..', 'assets', 'source')
TRIPO = os.path.join(MAIN, 'lilah', 'lilah_original.glb')
UAL1 = os.path.join(MAIN, 'ual', 'UAL1_Full.glb')
FING = (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky'))
UE = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    UE.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
               f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
    for f, F in FING:
        for i in (1, 2, 3): UE[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src_glb)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.name = 'SURVIVOR'
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

def take(path, rename, wants):
    """retarget the named actions of a source file onto the survivor: {source action name: new name}"""
    before = set(bpy.data.objects); acts0 = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    if rename:
        for b in src.data.bones:
            if b.name in rename: b.name = 'mixamorig:' + rename[b.name]
    acts = {a.name: a for a in bpy.data.actions if a not in acts0}
    src.animation_data_create(); made = {}
    for want, name in wants.items():
        a = acts.get(want) or next((v for k, v in acts.items() if k.split('|')[-1] == want), None)
        if a is None: print('MISSING', want, list(acts)[:40]); continue
        src.animation_data.action = a
        try: src.animation_data.action_slot = a.slots[0]
        except Exception: pass
        made[name] = retarget(src, arm, name); made[name].use_fake_user = True
        print('CLIP', name, tuple(int(v) for v in made[name].frame_range))
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    for x in acts.values(): bpy.data.actions.remove(x)
    return made

got = take(TRIPO, None, {'scared_02.001': 'hood_Scared'})
got.update(take(UAL1, UE, {'Crying': 'src_Crying', 'Fixing_Kneeling': 'src_Kneel'}))

# the blend: the kneel's lower body held on one frame, the cry's upper body as it plays
LOWER = ('Hips', 'UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End')
def is_lower(path):
    if not path.startswith('pose.bones["'): return False
    bn = path.split('"')[1].replace('mixamorig:', '')
    return bn == 'Hips' or any(bn.endswith(x) and ('Left' in bn or 'Right' in bn) for x in LOWER[1:])
cry, kn = got['src_Crying'], got['src_Kneel']
k0, k1 = kn.frame_range; hold = KNEEL_F or round((k0 + k1) / 2)
c0, c1 = cry.frame_range
blend = bpy.data.actions.new('hood_KneelCry'); blend.use_fake_user = True
try:
    slot = blend.slots.new(id_type='OBJECT', name='SURVIVOR')
except Exception: slot = None
def fcurves(act):
    try: return [fc for l in act.layers for st in l.strips for cb in st.channelbags for fc in cb.fcurves]
    except Exception: return list(act.fcurves)
def new_fc(act, path, idx, group):
    try: return act.fcurves.new(path, index=idx, action_group=group)
    except Exception:
        lay = act.layers[0] if act.layers else act.layers.new('Layer'); st = lay.strips[0] if lay.strips else lay.strips.new(type='KEYFRAME')
        cb = st.channelbag(slot, ensure=True); return cb.fcurves.new(path, index=idx, group_name=group)
frames = range(int(c0), int(c1) + 1)
for fc in fcurves(cry):
    if is_lower(fc.data_path): continue
    out = new_fc(blend, fc.data_path, fc.array_index, fc.data_path.split('"')[1])
    for f in frames: out.keyframe_points.insert(f - c0 + 1, fc.evaluate(f), options={'FAST'})
for fc in fcurves(kn):
    if not is_lower(fc.data_path): continue
    out = new_fc(blend, fc.data_path, fc.array_index, fc.data_path.split('"')[1])
    v = fc.evaluate(hold)
    for f in (1, int(c1 - c0 + 1)): out.keyframe_points.insert(f, v, options={'FAST'})
print('CLIP hood_KneelCry', (1, int(c1 - c0 + 1)), 'kneel held at', hold, 'of', (k0, k1))

arm.animation_data_create(); arm.animation_data.action = None
for o in bpy.data.objects: o.select_set(o is arm or o in meshes)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                          export_frame_step=1, export_image_format='WEBP', export_jpeg_quality=88)
print('WROTE', out_glb)
