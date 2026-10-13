# Builds a light, single-draw-call zombie from a patient rig (user-supplied patient GLBs, see ATTRIBUTIONS).
#  - decimates meshes (rig + skin weights kept)
#  - joins body/head/hair into ONE skinned mesh with ONE material whose colours come from a palette texture:
#    every source material becomes a cell; faces get that cell's UV. Variants re-colour the palette at runtime.
#  - drops baked clips (all animation is procedural in-game)
# usage: python make_zombie.py -- in.glb out.glb ratio
import bpy,sys,io,contextlib,json,os
a=sys.argv[sys.argv.index('--')+1:]
src,dst,ratio=a[0],a[1],float(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
with contextlib.redirect_stdout(io.StringIO()):
  bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
  if o.name.startswith('Icosphere') or o.name.startswith('STAFF_ID'): bpy.data.objects.remove(o)
for act in list(bpy.data.actions): bpy.data.actions.remove(act)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for o in meshes:
  r=ratio if not o.name.startswith('HEAD') else min(1,ratio*1.3)
  m=o.modifiers.new('dec','DECIMATE'); m.ratio=r; m.use_collapse_triangulate=True
  with bpy.context.temp_override(object=o):
    bpy.ops.object.modifier_move_to_index(modifier='dec',index=0)
    bpy.ops.object.modifier_apply(modifier='dec')
# palette cells (8x8 grid on a 128px texture)
GRID=8
names=[]
for o in meshes:
  for m in o.data.materials:
    if m and m.name not in names: names.append(m.name)
cells={n:i for i,n in enumerate(names)}
colors={}
for n in names:
  b=bpy.data.materials[n].node_tree.nodes.get('Principled BSDF')
  colors[n]=[round(x,4) for x in b.inputs['Base Color'].default_value[:3]]
for o in meshes:
  me=o.data
  if not me.uv_layers: me.uv_layers.new(name='UVMap')
  uv=me.uv_layers.active.data
  for p in me.polygons:
    mat=me.materials[p.material_index].name
    c=cells[mat]; u=(c%GRID+0.5)/GRID; v=1-(c//GRID+0.5)/GRID
    for li in p.loop_indices: uv[li].uv=(u,v)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join()
j=bpy.context.object; j.name='ZOMBIE_MESH'
pal=bpy.data.materials.new('zombie_palette'); pal.use_nodes=True
img=bpy.data.images.new('palette',128,128)
px=[0.0]*(128*128*4)
for n,c in cells.items():
  col=colors[n]; cx=c%GRID; cy=c//GRID
  for y in range(16):
    for x in range(16):
      yy=127-(cy*16+y); i=(yy*128+cx*16+x)*4
      px[i:i+4]=[*col,1]
img.pixels=px
img.file_format='PNG'
tex=pal.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=img; tex.interpolation='Closest'
b=pal.node_tree.nodes['Principled BSDF']; pal.node_tree.links.new(tex.outputs['Color'],b.inputs['Base Color']); b.inputs['Roughness'].default_value=0.7
j.data.materials.clear(); j.data.materials.append(pal)
tris=sum(len(p.vertices)-2 for p in j.data.polygons)
print('total tris',tris,'cells',cells)
with contextlib.redirect_stdout(io.StringIO()):
  bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_animations=False,export_skins=True,export_yup=True,export_image_format='AUTO')
json.dump({'grid':GRID,'cells':cells,'colors':colors,'tris':tris,'source':os.path.basename(src)},open(dst.replace('.glb','.palette.json'),'w'),indent=1)
