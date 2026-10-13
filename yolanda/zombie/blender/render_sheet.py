# Turnaround / contact-sheet renderer used to compare assets against the concept art.
# usage: python render_sheet.py -- out.png height_m view1,view2 a.glb [b.glb ...]
#   every model is normalised to height_m and shown in each view (front, side, back, threeq)
import bpy,sys,math,mathutils,io,contextlib
A=sys.argv[sys.argv.index('--')+1:]
out=A[0]; H=float(A[1]); views=A[2].split(','); files=A[3:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene
ang={'front':0,'threeq':-35,'side':-90,'back':180}
x=0; step=1.25
for f in files:
  for v in views:
    with contextlib.redirect_stdout(io.StringIO()):
      bpy.ops.import_scene.gltf(filepath=f)
    objs=list(bpy.context.selected_objects)
    for o in objs:
      if o.name.startswith('Icosphere'): o.hide_render=True
    roots=[o for o in objs if o.parent is None and not o.name.startswith('Icosphere')]
    piv=bpy.data.objects.new('piv',None); sc.collection.objects.link(piv)
    for r in roots: r.parent=piv
    bpy.context.view_layer.update()
    zs=[(o.matrix_world@mathutils.Vector(c)).z for o in objs if o.type=='MESH' and not o.hide_render for c in o.bound_box]
    s=H/max(zs); piv.scale=(s,s,s); piv.rotation_euler=(0,0,math.radians(ang[v])); piv.location.x=x
    x+=step
W=x-step
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam'));sc.collection.objects.link(cam);sc.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=max(W+1.3,2.2)
cam.location=(W/2,-8,H*0.55+0.35);cam.rotation_euler=(math.radians(87),0,0)
def area(name,loc,energy,size,col=(1,1,1)):
  l=bpy.data.lights.new(name,'AREA');l.energy=energy;l.size=size;l.color=col
  o=bpy.data.objects.new(name,l);sc.collection.objects.link(o);o.location=loc
  o.rotation_euler=(mathutils.Vector((W/2,0,0.9))-mathutils.Vector(loc)).to_track_quat('-Z','Y').to_euler()
area('key',(W/2-4,-5,5),500,4,(1,0.97,0.92)); area('fill',(W/2+5,-4,2),200,6,(0.9,0.95,1)); area('rim',(W/2+1,5,4),500,3)
bpy.ops.mesh.primitive_plane_add(size=60,location=(W/2,0,0))
fl=bpy.context.object; m=bpy.data.materials.new('floor'); m.use_nodes=True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.87,0.84,0.78,1); fl.data.materials.append(m)
w=bpy.data.worlds.new('w');sc.world=w;w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(0.9,0.88,0.84,1);w.node_tree.nodes['Background'].inputs[1].default_value=0.6
sc.render.engine='CYCLES';sc.cycles.samples=48;sc.cycles.use_denoising=True
sc.view_settings.view_transform='Khronos PBR Neutral'
sc.render.resolution_x=int(260*(W+1.3)/1.25);sc.render.resolution_y=int(260*cam.data.ortho_scale/((W+1.3)/1.25)) if False else 0
sc.render.resolution_y=int(sc.render.resolution_x*(H+0.8)/cam.data.ortho_scale)
sc.render.filepath=out
with contextlib.redirect_stdout(io.StringIO()):
  bpy.ops.render.render(write_still=True)
print('saved',out)
