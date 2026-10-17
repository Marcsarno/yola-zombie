# Library clips (Quaternius UAL, CC0) retargeted (blender/retarget.py) onto a game zombie's own skeleton, exported
# skeleton-only: the Rig Lab's test bakes (viewer.html CHARS[].newPacks) and the game's zombie add-on clips
# (assets/zombie_moves/<type>.glb, loaded beside the zombie's own file by main.js ZOMBIE_TYPES[].extra).
# usage: blender -b --factory-startup --python tools/anim/test_zombie_clips.py -- <zombie.glb> <out.glb> <ual.glb>;<prefix>;<Clip,Clip,...> [...]
#   (one group per library: e.g. "UAL2_Full.glb;ual_;Zombie_Bite,Zombie_Idle_Loop" "UAL1_Full.glb;ual1_;Hit_Head")
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget

argv = sys.argv[sys.argv.index('--') + 1:]
zglb, out, groups = argv[0], argv[1], [g.split(';') for g in argv[2:]]
bpy.context.scene.render.fps = 30
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
def imp(path):
    before = set(bpy.data.objects); a0 = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return new, next(o for o in new if o.type == 'ARMATURE'), [a for a in bpy.data.actions if a not in a0]
znew, Z, zacts = imp(zglb)
for a in zacts: bpy.data.actions.remove(a)
for o in znew:
    if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)  # (skeleton only: the Rig Lab adds the clips to the zombie it shows)
Z.name = 'ZOMBIE'
made = []
for lib, prefix, clips in groups:
    snew, src, sacts = imp(lib)
    UE = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
    for s, S in (('l', 'Left'), ('r', 'Right')):
        UE.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
                   f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
        for f, F in (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky')):
            for i in (1, 2, 3): UE[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
    for b in src.data.bones:
        if b.name in UE: b.name = 'mixamorig:' + UE[b.name]
    by = {a.name.split('|')[-1]: a for a in sacts}
    src.animation_data_create()
    for c in clips.split(','):
        a = by.get(c)
        if a is None: print('MISSING', c); continue
        src.animation_data.action = a
        try: src.animation_data.action_slot = a.slots[0]
        except Exception: pass
        act = retarget(src, Z, prefix + c); act.use_fake_user = True; made.append(act)
        print('CLIP', act.name, tuple(int(v) for v in act.frame_range))
    for o in snew: bpy.data.objects.remove(o, do_unlink=True)
    for a in sacts: bpy.data.actions.remove(a)
ad = Z.animation_data or Z.animation_data_create(); ad.action = None
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
for act in made:
    tr = ad.nla_tracks.new(); tr.name = act.name
    st = tr.strips.new(act.name, int(act.frame_range[0]), act)
    try: st.action_slot = act.slots[0]
    except Exception: pass
for p in Z.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
for o in bpy.data.objects: o.select_set(o is Z)
bpy.context.view_layer.objects.active = Z
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_apply=False, export_yup=True,
    export_skins=True, export_def_bones=False, export_optimize_animation_size=True)
print('EXPORTED', out, len(made))
