# Chapter 2 (Marc's neighbourhood): assembles the base scene in Blender from the old "Survive: The Clubhouse" world.
# Inputs (copied into the game, the old project stays read-only):
#   assets/neighborhood/models|kit/*.glb   the models (placeholder materials M_<key>__<paint>, UVs in texture tiles)
#   assets/neighborhood/tex/*.webp          the shared PBR sets (<key>_albedo|_normal|_orm)
#   blender/hood/src/placements.json        every model the old level placed (file + three.js world matrix)
#   blender/hood/src/generated.glb          the old level's code-built meshes (terrain, roads, curbs, water ...)
# Output: blender/hood/hood_base.blend (one collection per model in 'LIB' (hidden), the placements as collection
# instances in 'PLACED', the generated ground in 'GROUND'), the starting point the remake is dressed from.
#   blender -b --factory-startup --python blender/hood/build_hood.py
import bpy, json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hoodlib import *

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'
lib = bpy.data.collections.new('LIB'); sc.collection.children.link(lib)
placed = bpy.data.collections.new('PLACED'); sc.collection.children.link(placed)
ground = bpy.data.collections.new('GROUND'); sc.collection.children.link(ground)

data = json.load(open(os.path.join(SRC, 'placements.json')))
models = {}
for p in data['placements']:
    rel = p['src'].replace('assets/', '', 1)
    if rel in models: continue
    path = os.path.join(ASSETS, rel)
    if not os.path.exists(path): print('missing', rel); models[rel] = None; continue
    coll = bpy.data.collections.new(os.path.splitext(os.path.basename(rel))[0]); lib.children.link(coll)
    objs = import_into(path, coll)
    swap_materials(objs)
    coll['src'] = rel
    models[rel] = coll
print('models', len(models))

n = 0
for p in data['placements']:
    rel = p['src'].replace('assets/', '', 1); coll = models.get(rel)
    if coll is None: continue
    m = p['m']; M = Matrix([[m[c * 4 + r] for c in range(4)] for r in range(4)])  # three.js toArray() is column-major
    e = bpy.data.objects.new(coll.name, None)
    e.instance_type = 'COLLECTION'; e.instance_collection = coll
    e.matrix_world = C @ M @ Ci
    e['src'] = rel
    if not p.get('visible', True): e.hide_set(True); e.hide_render = True
    placed.objects.link(e); n += 1
print('placed', n)

gen = import_into(os.path.join(SRC, 'generated.glb'), ground)
swap_materials(gen)
print('generated', len(gen))

TERR = terrain_material()
for o in gen:
    if o.type != 'MESH': continue
    nm = o.name.split('.')[0]
    if nm in ('terrain', 'verges'): o.data.materials.clear(); o.data.materials.append(TERR)
    elif nm == 'lake': o.data.materials.clear(); o.data.materials.append(kit_material('M_water'))
    elif nm == 'markings':
        mk = bpy.data.materials.get('HOOD_markings') or bpy.data.materials.new('HOOD_markings'); flat(mk, (0.62, 0.6, 0.55), 0.8)
        o.data.materials.clear(); o.data.materials.append(mk)
    if nm == 'verges': o.location.z += 0.004
    if nm == 'terrain':  # the old 1.8 km plane: keep it to the neighbourhood plus the woods band (the camera never sees further)
        o.scale = (0.17, 0.17, 1); o.location = (20, 0, -0.01)

lib.hide_viewport = True
for v in bpy.context.view_layer.layer_collection.children:
    if v.name == 'LIB': v.exclude = False; v.hide_viewport = True

# ---------------------------------------------------------------- collision (COL): what the game walks against
# Boxes (cubes, scaled) and circles (cylinders), each with 'tag' and 'h' (top height, m; shots pass over anything under
# ~1.25 m). The old level's shapes for buildings, fences, the boundary, the water and trees; props get theirs from their
# own bounds (see prop_collider) so moving or adding one in Blender moves its collision with it.
col = bpy.data.collections.new('COL'); sc.collection.children.link(col)
KEEP_OLD = ('water', 'bld:', 'safehere', 'clubhouse', 'pool', 'tennis', 'volley', 'playground', 'gazebo', 'pavilion', 'dock',
            'fence', 'gatepost', 'gate', 'boundary', 'tree')

old = json.load(open(os.path.join(SRC, 'colliders.json')))
kept = 0
for i, c in enumerate(old):
    tag = c.get('tag') or ''
    if not tag.startswith(KEEP_OLD): continue
    h = min(6.0, max(0.3, (c.get('y1', 3) or 3)))
    if c['type'] == 'box': col_box('COL_%s_%d' % (tag.replace(':', '_'), i), c['cx'], c['cz'], c['hx'], c['hz'], c['angle'], h, tag)
    else: col_circle('COL_%s_%d' % (tag, i), c['cx'], c['cz'], c['r'], h, tag)
    kept += 1
print('old colliders kept', kept)

np_ = 0
for e in placed.objects:
    if e.instance_type == 'COLLECTION' and prop_collider(e): np_ += 1
print('prop colliders', np_)

# sun: low golden-hour key from the west (reviewed later against the fixed game camera)
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(-60))
w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True
bg = next(nd for nd in w.node_tree.nodes if nd.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.55, 0.62, 0.7, 1); bg.inputs['Strength'].default_value = 0.6

# the game's fixed camera (CAMERA_SPEC.md: pitch 42, yaw 35, looking north-west), framing the home row
cam = bpy.data.objects.new('GameCam', bpy.data.cameras.new('GameCam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.angle = math.radians(50); sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
tx, tz, D = 37.5, 39.5, 16.7; yaw, pitch = math.radians(35), math.radians(42)
pos3 = (tx + math.sin(yaw) * math.cos(pitch) * D, math.sin(pitch) * D, tz + math.cos(yaw) * math.cos(pitch) * D)
cam.location = (pos3[0], -pos3[2], pos3[1])
cam.rotation_euler = (math.radians(90 - 40), 0, math.radians(35))
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('saved', OUT)

