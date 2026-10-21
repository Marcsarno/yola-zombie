# A Mixamo character (FBX with skin, T-pose, assets/source/refs/<slug>/) made into the source build_zombie.py takes, the
# same shape as a Tripo download: one skinned mesh on a mixamorig skeleton, 1.0 unit tall, standing on the origin, matte,
# base colour only at 1024 px, about `tris` triangles (2026-10-20: Chapter 2's street zombies, Romero and Zombiegirl; the
# hospital zombies are ~10.5k triangles with one 1024 texture).
# Steps: import; the bones' "mixamorigN:" prefix to "mixamorig:"; every transform applied, scaled to 1.0 tall; the meshes
# joined; decimated (collapse, weights carried); specular / gloss maps dropped (matte, roughness 0.8); base colour down to
# `tex` and the normal map (the cloth's folds, seams and stitching: kept since 2026-10-20, the user on the flat clothes) to `ntex`;
# export GLB (no animation). A JSON log beside the output.
# usage: blender [--background] --factory-startup --python tools/anim/mixamo_zombie_prep.py -- <in.fbx> <out.glb> [tris=12000]
import bpy, sys, os, re, json

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
opts = dict(a.split('=') for a in argv[2:] if '=' in a)
TRIS = int(opts.get('tris', 12000))
TEX = int(opts.get('tex', 1024)); NTEX = int(opts.get('ntex', 1024))  # (base colour / normal map size caps)
log = {'src': os.path.basename(src)}

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.vertex_groups]
for o in list(bpy.data.objects):
    if o is not arm and o not in meshes: bpy.data.objects.remove(o, do_unlink=True)
for b in arm.data.bones: b.name = re.sub(r'^mixamorig\d*:', 'mixamorig:', b.name)
for m in meshes:
    for g in m.vertex_groups: g.name = re.sub(r'^mixamorig\d*:', 'mixamorig:', g.name)
log['bones'] = len(arm.data.bones); log['meshes_in'] = [m.name for m in meshes]

def apply_all():
    bpy.ops.object.select_all(action='DESELECT')
    for o in [arm, *meshes]: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
apply_all()
# one mesh
bpy.ops.object.select_all(action='DESELECT')
for m in meshes: m.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
me = bpy.context.view_layer.objects.active; me.name = 'Body'; meshes = [me]
# 1.0 tall, feet on the origin, centred
import mathutils
vs = [me.matrix_world @ v.co for v in me.data.vertices]
zmin, zmax = min(v.z for v in vs), max(v.z for v in vs)
cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
log['height_in'] = round(zmax - zmin, 4)
s = 1.0 / (zmax - zmin)
for o in (arm, me):
    if o.parent in (arm, me): continue  # (the mesh rides on the armature: scaling both scaled it twice)
    o.location = (o.location - mathutils.Vector((cx, cy, zmin))) * s
    o.scale = o.scale * s
bpy.context.view_layer.update(); apply_all()
# fewer triangles (the armature modifier stays; vertex groups are interpolated by the collapse)
tris0 = sum(len(p.vertices) - 2 for p in me.data.polygons)
log['tris_in'] = tris0
if tris0 > TRIS:
    d = me.modifiers.new('dec', 'DECIMATE'); d.decimate_type = 'COLLAPSE'; d.ratio = TRIS / tris0; d.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = me
    # (the decimate must sit before the armature modifier to be applied on the rest shape)
    while me.modifiers[0].name != 'dec': bpy.ops.object.modifier_move_up(modifier='dec')
    bpy.ops.object.modifier_apply(modifier='dec')
log['tris_out'] = sum(len(p.vertices) - 2 for p in me.data.polygons)
# at most 4 weights per vertex, normalised (the game skins with 4)
bpy.ops.object.select_all(action='DESELECT'); me.select_set(True); bpy.context.view_layer.objects.active = me
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
# matte, base colour only, 1024
imgs = set()
for mat in me.data.materials:
    if not mat or not mat.node_tree: continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    for name in ('Specular IOR Level', 'Specular', 'Roughness', 'Metallic', 'Emission Color', 'Emission'):
        inp = bsdf.inputs.get(name)
        if inp: [nt.links.remove(l) for l in list(inp.links)]
    if bsdf.inputs.get('Metallic'): bsdf.inputs['Metallic'].default_value = 0
    if bsdf.inputs.get('Roughness'): bsdf.inputs['Roughness'].default_value = 0.8
    def cap(img, size):
        if max(img.size) > size: img.scale(size, size)
        imgs.add(img.name)
    for l in bsdf.inputs['Base Color'].links:
        if l.from_node.type == 'TEX_IMAGE' and l.from_node.image: cap(l.from_node.image, TEX)
    for l in bsdf.inputs['Normal'].links:
        nm = l.from_node
        if nm.type == 'NORMAL_MAP':
            for l2 in nm.inputs['Color'].links:
                if l2.from_node.type == 'TEX_IMAGE' and l2.from_node.image: l2.from_node.image.colorspace_settings.name = 'Non-Color'; cap(l2.from_node.image, NTEX)
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE' and n.image and n.image.name not in imgs and not n.outputs[0].links: nt.nodes.remove(n)
log['materials'] = [m.name for m in me.data.materials if m]; log['images'] = sorted(imgs)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); me.select_set(True)
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=False, export_image_format='JPEG', export_jpeg_quality=88)
log['out'] = out; log['size_mb'] = round(os.path.getsize(out) / 1e6, 2)
with open(out + '.log.json', 'w') as f: json.dump(log, f, indent=1)
print('PREP', json.dumps(log))
