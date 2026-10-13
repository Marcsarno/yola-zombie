# Close-up face render (front + 3/4) for checking facial edits.  usage: -- out.png file.glb [highlight_material]
import bpy,sys,math,mathutils,io,contextlib
A=sys.argv[sys.argv.index('--')+1:]
out,f=A[0],A[1]; hl=A[2] if len(A)>2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
with contextlib.redirect_stdout(io.StringIO()): bpy.ops.import_scene.gltf(filepath=f)
sc=bpy.context.scene
for o in list(bpy.data.objects):
  if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
if hl:
  for m in bpy.data.materials:
    if m.name==hl and m.node_tree:
      b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(1,0,1,1)
      for l in list(b.inputs['Base Color'].links): m.node_tree.links.remove(l)
zs=[(o.matrix_world@mathutils.Vector(c)).z for o in bpy.data.objects if o.type=='MESH' for c in o.bound_box]
top=max(zs)
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam'));sc.collection.objects.link(cam);sc.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=0.62
cam.location=(0,-3,top-0.27);cam.rotation_euler=(math.radians(90),0,0)
for nm,loc,e in (('k',(-2,-3,top+1),600),('f',(2,-3,top),250)):
  l=bpy.data.lights.new(nm,'AREA');l.energy=e;l.size=3;o=bpy.data.objects.new(nm,l);sc.collection.objects.link(o);o.location=loc
  o.rotation_euler=(mathutils.Vector((0,0,top-0.27))-mathutils.Vector(loc)).to_track_quat('-Z','Y').to_euler()
w=bpy.data.worlds.new('w');sc.world=w;w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(0.85,0.83,0.8,1);w.node_tree.nodes['Background'].inputs[1].default_value=0.5
sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=True
sc.view_settings.view_transform='Khronos PBR Neutral'
sc.render.resolution_x=500;sc.render.resolution_y=500;sc.render.filepath=out
with contextlib.redirect_stdout(io.StringIO()): bpy.ops.render.render(write_still=True)
