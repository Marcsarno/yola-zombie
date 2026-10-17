# Test exports: the new Yola's skeleton with some clips of a yola2_build.py .blend, renamed, as a skeleton-only GLB the
# Rig Lab can load next to her (viewer.html?char=yola2&extra=<glb>). Nothing in the game uses these files.
# usage: blender -b <build.blend> --python tools/anim/test_export_clips.py -- <out.glb> <action>=<new name> [...]
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
out, pairs = argv[0], [a.split('=') for a in argv[1:]]
Y2 = bpy.data.objects['YOLA2']
ad = Y2.animation_data or Y2.animation_data_create()
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
for src, name in pairs:
    act = bpy.data.actions[src]; act.name = name
    tr = ad.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act)
    try: st.action_slot = act.slots[0]
    except Exception: pass
ad.action = None
for p in Y2.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
for o in bpy.context.view_layer.objects: o.select_set(False)
Y2.hide_set(False); Y2.select_set(True); bpy.context.view_layer.objects.active = Y2
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_apply=False, export_yup=True,
    export_skins=True, export_def_bones=False, export_optimize_animation_size=True)
print('EXPORTED', out)
