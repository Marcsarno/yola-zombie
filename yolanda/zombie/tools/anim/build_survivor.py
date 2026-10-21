# Chapter 2's survivors (2026-10-20, the user's Mixamo picks: Remy, David, Eve): a game GLB from a source made by
# mixamo_zombie_prep.py (one mesh, 1.0 tall, ~10k triangles) with the few Mixamo clips a survivor at the house needs,
# retargeted (blender/retarget.py) from the X Bot sources in assets/mixamo: aiming a rifle or a pistol, a flinch, two falls.
# usage: blender -b --factory-startup --python tools/anim/build_survivor.py -- <src.glb> <out.glb>
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget

src_glb, out_glb = sys.argv[sys.argv.index('--') + 1:][:2]
MIX = os.path.join(HERE, '..', '..', 'assets', 'mixamo')
CLIPS = {'rifle_idle': 'yola_rifle_aim_idle', 'pistol_idle': 'yola_pistol_idle', 'hit': 'yola_pistol_hit',
         'death_back': 'zombie_death_back', 'death_forward': 'zombie_death_forward'}

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src_glb)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.name = 'SURVIVOR'
me = next(o for o in bpy.data.objects if o.type == 'MESH')
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for name, f in CLIPS.items():
    before = set(bpy.data.objects); acts0 = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(MIX, f + '.fbx'))
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    acts = [a for a in bpy.data.actions if a not in acts0]
    src.animation_data_create(); src.animation_data.action = acts[0]
    try: src.animation_data.action_slot = acts[0].slots[0]
    except Exception: pass
    act = retarget(src, arm, name); act.use_fake_user = True
    print('CLIP', name, tuple(int(v) for v in act.frame_range))
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    for x in acts: bpy.data.actions.remove(x)
arm.animation_data.action = None
for o in bpy.data.objects: o.select_set(o in (arm, me))
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                          export_frame_step=1, export_image_format='WEBP', export_jpeg_quality=88)  # (WEBP: the hair's alpha survives)
print('WROTE', out_glb, 'height', round(me.dimensions.z, 3))
