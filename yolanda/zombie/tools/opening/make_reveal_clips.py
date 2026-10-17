# The reveal's own clips on the new Yola (2026-10-17, the opening chat): the Mixamo home-run swing (X Bot source,
# assets/mixamo/yola_baseball_homerun.fbx: the big two-handed swing that ends one-handed and walks off) and a natural walk
# (Quaternius UAL1 Walk_Loop, CC0) for the walk-out. Retargeted onto her Tripo rig with the same shared tools the game's
# build uses (blender/retarget.py, tools/anim/contacts.py: feet on the floor, the second hand on the bat), read-only.
# Writes a SEPARATE skeleton-only file used by the opening alone; assets/yola2.glb and its build are untouched.
#   assets/opening/yola2_reveal.glb   reveal_homerun, reveal_walk
# usage: blender -b --factory-startup --python tools/opening/make_reveal_clips.py -- <assets dir> <ual1.glb>
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender')); sys.path.insert(0, os.path.join(HERE, '..', 'anim'))
from retarget import retarget
import contacts

argv = sys.argv[sys.argv.index('--') + 1:]
A, UAL1 = argv[:2]
sc = bpy.context.scene; sc.render.fps = 30; sc.render.fps_base = 1
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

def set_action(arm, act):
    arm.animation_data_create(); arm.animation_data.action = act
    try: arm.animation_data.action_slot = act.slots[0]
    except Exception: pass

def import_any(path):
    before = set(bpy.data.objects); a0 = set(bpy.data.actions)
    if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else: bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return new, next(o for o in new if o.type == 'ARMATURE'), [a for a in bpy.data.actions if a not in a0]

def drop(objs, acts):
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)
    for a in acts: bpy.data.actions.remove(a)

# the target: the new Yola's Tripo rig (with her mesh, for the shoe-sole grounding)
new2, Y2, a = import_any(os.path.join(A, 'source', 'yola_v2', 'nurse_scrubs_tripo.glb')); drop([], a)
Y2.name = 'YOLA2'
mesh = next(c for c in Y2.children if c.type == 'MESH' and c.vertex_groups)  # (her skinned body: the GLB also holds a helper Icosphere)
shoes = contacts.shoe_vertices(mesh)
log, made = [], []

def bake(src, name, hands=False, lock=True):
    sact = src.animation_data.action
    s0 = int(round(sact.frame_range[0]))
    act = retarget(src, Y2, name); act.use_fake_user = True
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    if hands: contacts.hands(src, Y2, act, f0, f1, log, mode='arm', near=0.5, far=1.0)
    contacts.feet(src, Y2, mesh, act, f0, f1, shoes, log, lock=lock)
    print('BAKED', name, f0, f1, log[-2:])
    made.append(act); return act

# the home run (X Bot): two hands on the bat for the wind-up and swing (the contact fix keeps the second hand on it)
objs, src, acts = import_any(os.path.join(A, 'mixamo', 'yola_baseball_homerun.fbx'))
set_action(src, acts[0]); bake(src, 'reveal_homerun', hands=True, lock=True); drop(objs, acts)

# the walk (UAL1 mannequin, UE bone names -> mixamorig)
objs, src, acts = import_any(UAL1)
M = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    M.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
              f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
    for f, F in (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky')):
        for i in (1, 2, 3): M[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
for b in src.data.bones:
    if b.name in M: b.name = 'mixamorig:' + M[b.name]
walk = next((x for x in acts if x.name.split('|')[-1] == 'Walk_Loop'), None)
if walk:
    set_action(src, walk); bake(src, 'reveal_walk', hands=False, lock=False)
else: print('MISSING Walk_Loop')
drop(objs, acts)

# export: the skeleton only, one NLA track per clip
ad = Y2.animation_data or Y2.animation_data_create()
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
for act in made:
    tr = ad.nla_tracks.new(); tr.name = act.name
    st = tr.strips.new(act.name, int(act.frame_range[0]), act)
    try: st.action_slot = act.slots[0]
    except Exception: pass
ad.action = None
for p in Y2.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
for o in bpy.context.view_layer.objects: o.select_set(False)
Y2.select_set(True); bpy.context.view_layer.objects.active = Y2
out = os.path.join(A, 'opening', 'yola2_reveal.glb')
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_apply=False, export_yup=True, export_skins=False, export_def_bones=False, export_optimize_animation_size=True)
print('EXPORTED', out, os.path.getsize(out))
