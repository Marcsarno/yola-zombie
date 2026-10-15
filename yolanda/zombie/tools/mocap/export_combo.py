# Sample the combo action for the game (bat path in clipdata format + hips travel) and export it as a skeleton-only GLB
# at 60 fps. Runs in Blender on work.blend.
# usage: blender -b work.blend --python export_combo.py -- <action> <out.glb> <clipdata_part.json>
import bpy, sys, json
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
name, out_glb, out_json = argv
sc = bpy.context.scene; arm = bpy.data.objects['YOLA']; ad = arm.animation_data
act = bpy.data.actions[name]
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
ad.action = act
try: ad.action_slot = act.slots[0]
except Exception: pass
f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
SOCK = Vector((0.972, 0, -0.233)).normalized()
conv = lambda v: [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]
pb = lambda n: arm.pose.bones['mixamorig:' + n]
grip = lambda s: (pb(s + 'Hand').head + pb(s + 'HandMiddle1').head) * 0.5
CON = json.loads(act['contacts']) if 'contacts' in act else None  # planted weights per frame (retarget_mocap.py)
samples = []
for f in range(f0, f1 + 1):
    sc.frame_set(f)
    d = pb('RightHand').matrix.to_quaternion() @ SOCK
    samples.append({'f': f, 'r': conv(grip('Right')), 'l': conv(grip('Left')), 'd': conv(d), 'hips': conv(pb('Hips').head)})
    if CON: samples[-1]['cL'] = CON['L'][f - f0]; samples[-1]['cR'] = CON['R'][f - f0]
json.dump({name: samples}, open(out_json, 'w'))
# export: the armature alone (no mesh), this action, sampled at 60 fps
sc.render.fps = 60; sc.render.fps_base = 1; sc.frame_start = f0; sc.frame_end = f1
tr = ad.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, f0, act)
try: st.action_slot = act.slots[0]
except Exception: pass
ad.action = None
for p in arm.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
for o in bpy.context.view_layer.objects: o.select_set(False)
arm.hide_set(False); arm.select_set(True); bpy.context.view_layer.objects.active = arm
loc0 = arm.location.copy(); arm.location = (0, 0, 0)
bpy.ops.export_scene.gltf(filepath=out_glb, use_selection=True, export_format='GLB', export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_yup=True, export_skins=True,
    export_def_bones=False, export_optimize_animation_size=True, export_apply=False)
print('EXPORTED', out_glb, 'frames', f0, f1, 'samples', len(samples))
