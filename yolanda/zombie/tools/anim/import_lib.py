# Bring clips from free animation libraries onto Yola. The source rig's bones are renamed to their mixamorig equivalents,
# then blender/retarget.py transfers each clip (world-space change from rest per bone; hips travel scaled by leg height;
# target bones the source lacks follow their parent).
# Rigs: ue (Quaternius Universal Animation Library: Unreal mannequin names), kevin (Kevin Iglesias packs), kaykit (KayKit
# Character Animations), mixamo (already mixamorig names).
# usage: blender -b blender/characters.blend --python tools/anim/import_lib.py -- <rig> <file.glb|fbx> <clip,clip|*> <prefix> <out.blend>
#   clip names match the source action name or its last '|' part; '*' takes every action in the file.
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget

argv = sys.argv[sys.argv.index('--') + 1:]
rig, path, clips, prefix, out = argv[0], argv[1], argv[2], argv[3], argv[4]
FING = (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky'))
MAP = {}
if rig == 'ue':
    MAP = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
    for s, S in (('l', 'Left'), ('r', 'Right')):
        MAP.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
                    f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
        for f, F in FING:
            for i in (1, 2, 3): MAP[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
elif rig == 'kevin':
    MAP = {'B-hips': 'Hips', 'B-spine': 'Spine', 'B-chest': 'Spine2', 'B-neck': 'Neck', 'B-head': 'Head'}
    for s, S in (('L', 'Left'), ('R', 'Right')):
        MAP.update({f'B-shoulder.{s}': S + 'Shoulder', f'B-upperArm.{s}': S + 'Arm', f'B-forearm.{s}': S + 'ForeArm', f'B-hand.{s}': S + 'Hand',
                    f'B-thigh.{s}': S + 'UpLeg', f'B-shin.{s}': S + 'Leg', f'B-foot.{s}': S + 'Foot', f'B-toe.{s}': S + 'ToeBase'})
        for f, F in (('thumb', 'Thumb'), ('indexFinger', 'Index'), ('middleFinger', 'Middle'), ('ringFinger', 'Ring'), ('pinky', 'Pinky')):
            for i in (1, 2, 3): MAP[f'B-{f}0{i}.{s}'] = f'{S}Hand{F}{i}'
elif rig == 'kaykit':
    MAP = {'hips': 'Hips', 'spine': 'Spine', 'chest': 'Spine2', 'head': 'Head'}
    for s, S in (('l', 'Left'), ('r', 'Right')):
        MAP.update({f'upperarm.{s}': S + 'Arm', f'lowerarm.{s}': S + 'ForeArm', f'wrist.{s}': S + 'Hand',
                    f'upperleg.{s}': S + 'UpLeg', f'lowerleg.{s}': S + 'Leg', f'foot.{s}': S + 'Foot', f'toes.{s}': S + 'ToeBase'})
tgt = bpy.data.objects['YOLA']
before = set(bpy.data.objects); acts0 = set(bpy.data.actions)
if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
else: bpy.ops.import_scene.gltf(filepath=path)
new = [o for o in bpy.data.objects if o not in before]
src = next(o for o in new if o.type == 'ARMATURE')
for b in src.data.bones:
    if b.name in MAP: b.name = 'mixamorig:' + MAP[b.name]
srcacts = {a.name: a for a in bpy.data.actions if a not in acts0}
print('source clips', len(srcacts), list(srcacts)[:50])
src.animation_data_create()
want = list(srcacts) if clips == '*' else clips.split(',')
made = []
for c in want:
    a = srcacts.get(c) or next((v for k, v in srcacts.items() if k.split('|')[-1] == c or c in k.split('|')), None)
    if a is None: print('MISSING', c); continue
    src.animation_data.action = a
    try: src.animation_data.action_slot = a.slots[0]
    except Exception: pass
    short = c if clips != '*' else (a.name.split('|')[1] if a.name.count('|') >= 2 else a.name.split('|')[-1])
    act = retarget(src, tgt, prefix + short.replace('@', '_').replace(' ', '_'))
    act.use_fake_user = True; made.append((act.name, tuple(int(x) for x in act.frame_range)))
for o in new: bpy.data.objects.remove(o, do_unlink=True)
for a in srcacts.values(): bpy.data.actions.remove(a)
print('RETARGETED', made)
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True); print('SAVED', out)
