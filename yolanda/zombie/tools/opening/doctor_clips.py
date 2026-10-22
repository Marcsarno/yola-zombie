# The doctor in Chapter 1's operating room (2026-10-22, the user: Chad hiding scared behind the surgery table, then closing
# the vaccine case, grabbing it and running off with it in one hand). Real clips only, as Sophie's feelings were made
# (tools/anim/survivor_feelings.py on the neighborhood-level branch):
#   doc_Scared      Tripo's free scared_02 (hugging himself, knees in), from Lilah's download (assets/source/lilah)
#   doc_*           Quaternius UAL1 / UAL2 (CC0): the stand from the crouch, the lid shut, the pick-up, the run
# Each source is retargeted by blender/retarget.py onto the model made by mixamo_zombie_prep.py (Chad: tris=20000
# tex=2048 ntex=2048 fmt=WEBP); the UAL rig's bones are renamed to mixamorig first, as tools/anim/import_lib.py does.
# usage: blender -b --factory-startup --python tools/opening/doctor_clips.py -- <chad_src.glb> <out.glb>
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget

argv = sys.argv[sys.argv.index('--') + 1:]
src_glb, out_glb = argv[0], argv[1]
SRC = os.path.join(HERE, '..', '..', 'assets', 'source')
TRIPO = os.path.join(SRC, 'lilah', 'lilah_original.glb')
UAL1 = os.path.join(SRC, 'ual', 'UAL1_Full.glb')
UAL2 = os.path.join(SRC, 'ual', 'UAL2_Full.glb')
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
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.name = 'DOCTOR'
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

def take(path, rename, wants):
    """retarget the named actions of a source file onto the doctor: {source action name: new name}"""
    before = set(bpy.data.objects); acts0 = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    if rename:
        for b in src.data.bones:
            if b.name in rename: b.name = 'mixamorig:' + rename[b.name]
    acts = {a.name: a for a in bpy.data.actions if a not in acts0}
    src.animation_data_create()
    for want, name in wants.items():
        a = acts.get(want) or next((v for k, v in acts.items() if k.split('|')[-1] == want), None)
        if a is None: print('MISSING', want, list(acts)[:40]); continue
        src.animation_data.action = a
        try: src.animation_data.action_slot = a.slots[0]
        except Exception: pass
        act = retarget(src, arm, name); act.use_fake_user = True
        print('CLIP', name, tuple(int(v) for v in act.frame_range))
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    for x in acts.values(): bpy.data.actions.remove(x)

take(TRIPO, None, {'scared_02.001': 'doc_Scared'})
take(UAL1, UE, {'Idle_Loop': 'doc_Idle', 'Crouch_Idle_Loop': 'doc_Crouch', 'Crouch_Exit': 'doc_CrouchExit', 'Interact': 'doc_Interact',
                'PickUp_Table': 'doc_PickUp', 'Sprint_Loop': 'doc_Sprint', 'Jog_Fwd_Loop': 'doc_Jog'})
take(UAL2, UE, {'Chest_Open': 'doc_ChestOpen', 'Surprise': 'doc_Surprise'})

arm.animation_data_create(); arm.animation_data.action = None
for o in bpy.data.objects: o.select_set(o is arm or o in meshes)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                          export_frame_step=1, export_image_format='WEBP', export_jpeg_quality=88)
print('WROTE', out_glb)
