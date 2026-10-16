# Extra full-body clips for Yola from Mixamo FBX files (blender/retarget.py onto the YOLA armature in characters.blend),
# exported skeleton-only, like yola_combo.glb; the game adds them to her animations at load (main.js).
# The file is never saved: the retargeted actions only live in this run.
# usage: blender -b blender/characters.blend --python tools/anim/yola_clips.py -- <out.glb> <file.fbx>=<name> [...]
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget
argv = sys.argv[sys.argv.index('--') + 1:]
out, pairs = argv[0], [a.split('=') for a in argv[1:]]
sc = bpy.context.scene; sc.render.fps = 30; sc.render.fps_base = 1
Y = bpy.data.objects['YOLA']
made = []
for path, name in pairs:
    before = set(bpy.data.objects); acts0 = set(bpy.data.actions)
    bpy.context.view_layer.objects.active = Y
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]; src = next(o for o in new if o.type == 'ARMATURE')
    acts = [a for a in bpy.data.actions if a not in acts0]
    src.animation_data_create(); src.animation_data.action = acts[0]
    try: src.animation_data.action_slot = acts[0].slots[0]
    except Exception: pass
    made.append(retarget(src, Y, name))
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    for x in acts: bpy.data.actions.remove(x)
    print('CLIP', name, tuple(int(v) for v in made[-1].frame_range))
# export (as tools/mocap/export_combo.py): the armature alone, one NLA track per new clip
ad = Y.animation_data
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
for act in made:
    tr = ad.nla_tracks.new(); tr.name = act.name; st = tr.strips.new(act.name, int(act.frame_range[0]), act)
    try: st.action_slot = act.slots[0]
    except Exception: pass
ad.action = None
for p in Y.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
for o in bpy.context.view_layer.objects: o.select_set(False)
Y.hide_set(False); Y.select_set(True); bpy.context.view_layer.objects.active = Y
Y.location = (0, 0, 0)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_yup=True, export_skins=True,
    export_def_bones=False, export_optimize_animation_size=True, export_apply=False)
print('EXPORTED', out)
