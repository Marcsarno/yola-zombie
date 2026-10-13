# Original weapon props for the zombie demo, rounded to match the hospital style.
# Conventions (glTF/three space): origin = main grip, +Z = forward (barrel / bat length), +Y = up.
# In Blender: forward = -Y, up = +Z. Sockets are empties: "muzzle", "tip", "grip2".
# usage: python make_weapons.py -- outdir
import bpy,sys,math,io,contextlib
out=sys.argv[sys.argv.index('--')+1:][0]
def mat(name,rgb,rough=0.5,metal=0.0):
  m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
  m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']
  b.inputs['Base Color'].default_value=(*rgb,1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
  return m
def box(name,size,loc,m,bevel=0.01,rot=(0,0,0)):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc,rotation=rot)
  o=bpy.context.object;o.name=name;o.scale=size
  bpy.ops.object.transform_apply(scale=True)
  b=o.modifiers.new('b','BEVEL');b.width=bevel;b.segments=3
  o.data.materials.append(m);return o
def cyl(name,r1,r2,depth,loc,m,rot=(0,0,0),verts=16):
  bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=depth,location=loc,rotation=rot)
  o=bpy.context.object;o.name=name;o.data.materials.append(m)
  b=o.modifiers.new('b','BEVEL');b.width=min(r1,r2)*0.4;b.segments=2
  bpy.ops.object.shade_smooth();return o
def empty(name,loc):
  e=bpy.data.objects.new(name,None);e.location=loc;bpy.context.scene.collection.objects.link(e);return e
def finish(root_name,fname):
  objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
  for o in objs:
    bpy.context.view_layer.objects.active=o
    for md in list(o.modifiers):
      with bpy.context.temp_override(object=o): bpy.ops.object.modifier_apply(modifier=md.name)
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs: o.select_set(True)
  bpy.context.view_layer.objects.active=objs[0]
  bpy.ops.object.join(); j=bpy.context.object; j.name=root_name
  for e in [o for o in bpy.context.scene.objects if o.type=='EMPTY']: e.parent=j
  tris=sum(len(p.vertices)-2 for p in j.data.polygons)
  print(fname,'tris',tris)
  with contextlib.redirect_stdout(io.StringIO()):
    bpy.ops.export_scene.gltf(filepath=out+'/'+fname,export_format='GLB',export_yup=True)
def reset():
  bpy.ops.wm.read_factory_settings(use_empty=True)

dark=lambda: mat('gun_dark',(0.035,0.045,0.07),0.35,0.3)
grip=lambda: mat('gun_grip',(0.06,0.06,0.07),0.8)
steel=lambda: mat('gun_steel',(0.35,0.37,0.42),0.25,0.8)
wood=lambda: mat('bat_wood',(0.42,0.20,0.07),0.55)
tape=lambda: mat('bat_tape',(0.02,0.02,0.025),0.9)
teal=lambda: mat('accent_teal',(0.0,0.35,0.4),0.5)

# ---- pistol
reset()
box('slide',(0.034,0.20,0.042),(0,-0.065,0.068),dark(),0.008)
box('frame',(0.030,0.15,0.026),(0,-0.045,0.035),grip(),0.006)
box('grip',(0.030,0.045,0.11),(0,0.012,-0.02),grip(),0.01,rot=(math.radians(-14),0,0))
cyl('barrel',0.009,0.009,0.03,(0,-0.165,0.07),steel(),rot=(math.radians(90),0,0),verts=12)
box('trigger_guard',(0.008,0.04,0.008),(0,-0.035,0.012),grip(),0.003)
box('sight',(0.006,0.012,0.008),(0,-0.155,0.093),teal(),0.002)
empty('muzzle',(0,-0.182,0.07))
finish('pistol','pistol.glb')

# ---- bat (length along forward axis so it can be posed like the barrel)
reset()
L=0.82
cyl('handle',0.016,0.020,0.30,(0,-0.05,0),tape(),rot=(math.radians(90),0,0))
cyl('taper',0.020,0.036,0.30,(0,-0.35,0),wood(),rot=(math.radians(90),0,0))
cyl('barrel',0.036,0.037,0.20,(0,-0.60,0),wood(),rot=(math.radians(90),0,0))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.037,location=(0,-0.70,0),segments=16,ring_count=8)
cap=bpy.context.object;cap.scale=(1,0.45,1);cap.data.materials.append(wood());bpy.ops.object.shade_smooth()
cyl('knob',0.026,0.026,0.02,(0,0.105,0),tape(),rot=(math.radians(90),0,0))
empty('tip',(0,-0.72,0)); empty('sweet',(0,-0.55,0)); empty('grip2',(0,0.06,0))
finish('bat','bat.glb')

# ---- pump shotgun
reset()
box('receiver',(0.04,0.20,0.06),(0,-0.04,0.03),dark(),0.01)
cyl('barrel',0.012,0.012,0.50,(0,-0.36,0.045),steel(),rot=(math.radians(90),0,0))
cyl('tube',0.011,0.011,0.40,(0,-0.30,0.015),dark(),rot=(math.radians(90),0,0))
box('pump',(0.044,0.13,0.04),(0,-0.30,0.012),wood(),0.012)
box('stock',(0.036,0.24,0.06),(0,0.17,0.0),wood(),0.015,rot=(math.radians(8),0,0))
box('grip',(0.03,0.04,0.08),(0,0.03,-0.03),grip(),0.01,rot=(math.radians(-18),0,0))
empty('muzzle',(0,-0.615,0.045)); empty('grip2',(0,-0.30,0.012))
finish('shotgun','shotgun.glb')
