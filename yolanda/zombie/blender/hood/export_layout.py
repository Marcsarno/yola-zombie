# Chapter 2: exports the neighbourhood from its Blender file for the game.
#   blender -b blender/hood/hood.blend --python blender/hood/export_layout.py
# Writes assets/neighborhood/hood_layout.json:
#   models: [file, ...]                      the model files placed (assets/neighborhood/<file>)
#   placed: [[model index, m0..m15], ...]    three.js world matrices (column-major), one per placement
#   cols:   [[kind, tag, cx, cz, hx|r, hz, yaw, h], ...]   collision: 'b' oriented box / 'c' circle, three.js x/z
#   marks:  {name: [x, y, z, yaw]}           named empties in MARKS (spawns, pickups, stops ...)
# and assets/neighborhood/hood_ground.glb: every mesh in GROUND (and NEW, the remake's own meshes) with material names
# only (no textures: the game shares one texture set per material key).
import bpy, json, os, math
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'neighborhood')
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))); Ci = C.inverted()
r = lambda v, n=4: round(v, n)

models, index, placed, tags = [], {}, [], {}
for e in bpy.data.collections['PLACED'].all_objects:
    if e.instance_type != 'COLLECTION' or not e.instance_collection or e.hide_render: continue
    src = e.instance_collection.get('src') or e.get('src')
    if not src: continue
    if src not in index: index[src] = len(models); models.append(src)
    M = Ci @ e.matrix_world @ C
    if e.get('tag'): tags.setdefault(e['tag'], []).append(len(placed))   # (seal props: the game draws them on their own, to move them aside)
    placed.append([index[src]] + [r(M[row][col]) for col in range(4) for row in range(4)])

cols = []
for o in bpy.data.collections['COL'].all_objects:
    k = o.get('col'); tag = o.get('tag', '')
    if k is None: continue
    loc, rot, s = o.matrix_world.to_translation(), o.matrix_world.to_euler(), o.matrix_world.to_scale()
    h = r(s.z, 3)
    if k == 'box': cols.append(['b', tag, r(loc.x, 3), r(-loc.y, 3), r(s.x / 2, 3), r(s.y / 2, 3), r(rot.z, 4), h])
    elif k == 'circle': cols.append(['c', tag, r(loc.x, 3), r(-loc.y, 3), r(max(s.x, s.y) / 2, 3), 0, 0, h])

marks = {}
if 'MARKS' in bpy.data.collections:
    for o in bpy.data.collections['MARKS'].all_objects:
        p = o.matrix_world.to_translation()
        marks[o.name] = [r(p.x, 3), r(p.z, 3), r(-p.y, 3), r(o.matrix_world.to_euler().z, 4)]

json.dump({'models': models, 'placed': placed, 'tags': tags, 'cols': cols, 'marks': marks}, open(os.path.join(OUT, 'hood_layout.json'), 'w'), separators=(',', ':'))
print('layout: %d models, %d placed, %d colliders, %d marks' % (len(models), len(placed), len(cols), len(marks)))

# ground meshes: select GROUND (+ NEW) and export them alone
bpy.ops.object.select_all(action='DESELECT')
n = 0
for cname in ('GROUND', 'NEW'):
    if cname not in bpy.data.collections: continue
    for o in bpy.data.collections[cname].all_objects:
        if o.type == 'MESH' and not o.hide_render:
            o.hide_set(False); o.select_set(True); n += 1
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'hood_ground.glb'), export_format='GLB', use_selection=True,
                          export_image_format='NONE', export_apply=True, export_yup=True, export_extras=False)
print('ground meshes', n)
