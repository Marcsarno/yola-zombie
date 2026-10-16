# Bake the new Yola's cloth shading helpers from her own mesh (rest pose), on her UV atlas, with Cycles:
#   yola2_ao.png         short-range ambient occlusion: the shadow in folds, under the shirt's hem, inside pockets
#   yola2_curv.png       curvature (Cycles pointiness): concave creases dark, convex edges (hem lip, pocket flaps) light
# tools/anim/yola2_cloth.py combines them into her cloth texture.
# usage: blender -b --factory-startup --python tools/anim/yola2_bake.py -- <source glb> <out dir> [size=2048] [ao distance=0.04]
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
SIZE = int(argv[2]) if len(argv) > 2 else 2048
DIST = float(argv[3]) if len(argv) > 3 else 0.04
os.makedirs(OUT, exist_ok=True)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)  # (the default scene's cube would be baked otherwise)
bpy.ops.import_scene.gltf(filepath=SRC)
me = max((o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Icosphere')), key=lambda o: len(o.data.polygons))
# Her mesh as modelled (rest pose), with two bake-only fixes (2026-10-16, found baking in the open Blender):
# - Tripo left an inner layer under the clothes (~3.5k faces looking at the inside of the outer layer); fully occluded,
#   it bakes black and its texels bled into the visible cloth: those faces are dropped from the bake copy.
# - only this mesh may be visible to the renderer (a hidden copy in the same place made every ray hit at once).
# Her own normals are kept (the mesh is in ~4k pieces split at UV seams: recalculating "outside" per piece flips some).
import bmesh
from mathutils.bvhtree import BVHTree
for md in list(me.modifiers): me.modifiers.remove(md)
for o in bpy.data.objects:
    if o is not me and o.type == 'MESH': o.hide_render = True
bm = bmesh.new(); bm.from_mesh(me.data); bm.faces.ensure_lookup_table(); bm.normal_update()
bvh = BVHTree.FromBMesh(bm); inner = []
for f in bm.faces:
    c = f.calc_center_median(); n = f.normal
    loc, hn, idx, dist = bvh.ray_cast(c + n * 2e-4, n, 0.08)
    if loc is not None and hn.dot(n) > 0.2: inner.append(f)
bmesh.ops.delete(bm, geom=inner, context='FACES'); bm.to_mesh(me.data); bm.free()
print('INNER faces dropped', len(inner))
sc = bpy.context.scene
try: sc.render.engine = 'CYCLES'
except TypeError as e: print('ENGINE', e)
sc.cycles.samples = 128; sc.cycles.use_denoising = False
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try: prefs.compute_device_type = t; prefs.get_devices(); break
        except Exception: pass
    if any(d.use for d in prefs.devices if d.type != 'CPU') and not os.environ.get('BAKE_CPU'): sc.cycles.device = 'GPU'
except Exception as e: print('device', e)
print('DEVICE', sc.cycles.device)
w = sc.world or bpy.data.worlds.new('w'); sc.world = w
w.light_settings.distance = DIST
mat = me.data.materials[0]; nt = mat.node_tree
out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
orig_link = next((l.from_socket for l in nt.links if l.to_node == out and l.to_socket.name == 'Surface'), None)
def target(name):
    im = bpy.data.images.new(name, SIZE, SIZE, alpha=False, float_buffer=True); im.colorspace_settings.name = 'Non-Color'
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = im
    for n in nt.nodes: n.select = False
    tn.select = True; nt.nodes.active = tn
    return im, tn
for o in bpy.context.view_layer.objects: o.select_set(False)
me.select_set(True); bpy.context.view_layer.objects.active = me
def save(im):
    f = os.path.join(OUT, im.name + '.png'); im.save(filepath=f); print('SAVED', f)  # (16-bit PNG from the float bake)
# 1. ambient occlusion
ao, tn = target('yola2_ao')
bpy.ops.object.bake(type='AO', margin=16, use_clear=True)
save(ao); nt.nodes.remove(tn)
# 2. curvature: emission = pointiness (0.5 flat; below concave, above convex)
geo = nt.nodes.new('ShaderNodeNewGeometry'); em = nt.nodes.new('ShaderNodeEmission')
nt.links.new(geo.outputs['Pointiness'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
cv, tn = target('yola2_curv')
bpy.ops.object.bake(type='EMIT', margin=16, use_clear=True)
save(cv)
print('BAKE_DONE')
