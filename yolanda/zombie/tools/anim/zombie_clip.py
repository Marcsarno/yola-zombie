# Put a library clip on the game's zombies: retarget it (blender/retarget.py) onto a zombie GLB's own skeleton and export
# a skeleton-only GLB holding just that clip (the game adds it to the zombie's animations at load, like yola_combo.glb).
# Source rigs as in import_lib.py: ue (Quaternius UAL), mixamo.
# usage: blender -b --factory-startup --python tools/anim/zombie_clip.py -- <rig> <source.glb|fbx> <clip> <name> <zombie.glb> <out.glb>
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget

argv = sys.argv[sys.argv.index('--') + 1:]
rig, path, clip, name, zpath, out = argv
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene.render.fps = 30

# the zombie: its skeleton is the target (meshes are dropped before export)
bpy.ops.import_scene.gltf(filepath=zpath)
tgt = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
tgt.name = 'ZOMBIE'
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

MAP = {}
if rig == 'ue':
    MAP = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
    for s, S in (('l', 'Left'), ('r', 'Right')):
        MAP.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
                    f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
        for f, F in (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky')):
            for i in (1, 2, 3): MAP[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
before = set(bpy.data.objects); acts0 = set(bpy.data.actions)
if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
else: bpy.ops.import_scene.gltf(filepath=path)
new = [o for o in bpy.data.objects if o not in before]
src = next(o for o in new if o.type == 'ARMATURE')
for b in src.data.bones:
    if b.name in MAP: b.name = 'mixamorig:' + MAP[b.name]
srcacts = {a.name: a for a in bpy.data.actions if a not in acts0}
a = srcacts.get(clip) or next((v for k, v in srcacts.items() if k.split('|')[-1] == clip or clip in k.split('|')), None)
if a is None: raise SystemExit('MISSING ' + clip + ' in ' + ', '.join(list(srcacts)[:80]))
src.animation_data_create(); src.animation_data.action = a
try: src.animation_data.action_slot = a.slots[0]
except Exception: pass
act = retarget(src, tgt, name)
print('RETARGETED', act.name, tuple(act.frame_range), 'slots', [s.identifier for s in act.slots])
# sanity: the right upper arm must actually move over the clip
sc = bpy.context.scene; tgt.animation_data.action = act
try: tgt.animation_data.action_slot = act.slots[0]
except Exception: pass
qs = []
for f in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1, 4):
    sc.frame_set(f); qs.append(tgt.pose.bones['mixamorig:RightArm'].matrix.to_quaternion())
print('MOTION deg', round(max(qs[0].rotation_difference(q).angle for q in qs) * 57.3, 1))
for o in new: bpy.data.objects.remove(o, do_unlink=True)
for x in list(bpy.data.actions):
    if x is not act: bpy.data.actions.remove(x)
for o in list(bpy.data.objects):
    if o is not tgt: bpy.data.objects.remove(o, do_unlink=True)
ad = tgt.animation_data
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t) # (the zombie GLB's own clips, emptied above)
ad.action = act
try: ad.action_slot = act.slots[0]
except Exception: pass
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='ACTIVE_ACTIONS', export_skins=False, export_morph=False,
                          export_force_sampling=True, export_frame_step=1, use_selection=False)
print('WROTE', out)
