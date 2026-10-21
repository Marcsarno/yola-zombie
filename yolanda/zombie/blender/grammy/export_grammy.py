# Chapter 4, Grammy's peninsula: exports the map from blender/grammy/grammy.blend for the game (as the hood's
# export_layout.py does for Chapter 2).
#   blender -b blender/grammy/grammy.blend --python blender/grammy/export_grammy.py    (or run in the open Blender)
# Writes assets/grammy/grammy_layout.json:
#   models: [file, ...]                      the model files placed, relative to assets/grammy/ (the hood's: ../neighborhood/)
#   placed: [[model index, m0..m15], ...]    three.js world matrices (column-major), one per placement
#   tags:   {tag: [placement index, ...]}    placements the game draws on their own (the gate's bars, the family car ...)
#   cols:   [[kind, tag, cx, cz, hx|r, hz, yaw, h], ...]   collision: 'b' oriented box / 'c' circle, three.js x / z
#   marks:  {name: [x, y, z, yaw]}           named empties (the landing, her door, the beats, the gate, the blockades ...)
#   zone, routes, roads                      the plan's walkable area, its two routes and the roads' centre lines
# assets/grammy/grammy_ground.glb (the GROUND meshes, material names only) and tools/grammy/water.json (the leak test's water:
# a 1 m grid, 1 = water).
import bpy, json, os, sys, math
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [HERE]
import importlib, gramlib; importlib.reload(gramlib)
import gramlib as G
ROOT = os.path.dirname(os.path.dirname(HERE)); OUT = os.path.join(ROOT, 'assets', 'grammy')
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))); Ci = C.inverted()
r = lambda v, n=4: round(v, n)
sc = G.main_scene()

def rel(src): return src[len('grammy/'):] if src.startswith('grammy/') else '../' + src
models, index, placed, tags = [], {}, [], {}
for e in G.placed().all_objects:
    if e.instance_type != 'COLLECTION' or not e.instance_collection or e.hide_render: continue
    src = e.get('src') or e.instance_collection.get('src')
    if not src: continue
    f = rel(src)
    if f not in index: index[f] = len(models); models.append(f)
    M = Ci @ e.matrix_world @ C
    if e.get('tag'): tags.setdefault(e['tag'], []).append(len(placed))
    placed.append([index[f]] + [r(M[row][col]) for col in range(4) for row in range(4)])

cols = []
for o in bpy.data.collections['COL'].all_objects:
    k = o.get('col'); tag = o.get('tag', '')
    if k is None: continue
    loc, rot, s = o.matrix_world.to_translation(), o.matrix_world.to_euler(), o.matrix_world.to_scale()
    if k == 'box': cols.append(['b', tag, r(loc.x, 3), r(-loc.y, 3), r(s.x / 2, 3), r(s.y / 2, 3), r(rot.z, 4), r(s.z, 3)])
    elif k == 'circle': cols.append(['c', tag, r(loc.x, 3), r(-loc.y, 3), r(max(s.x, s.y) / 2, 3), 0, 0, r(s.z, 3)])

marks = {}
for o in G.marks().all_objects:
    p = o.matrix_world.to_translation()
    marks[o.name] = [r(p.x, 3), r(p.z, 3), r(-p.y, 3), r(o.matrix_world.to_euler().z, 4)]

roads = {k: [[r(x, 2), r(z, 2)] for x, z in v['points']] for k, v in G.MAP['roads'].items()}
out = {'models': models, 'placed': placed, 'tags': tags, 'cols': cols, 'marks': marks, 'zone': G.MAP['zone'],
       'routes': {k: v['points'] for k, v in G.MAP['routes'].items()}, 'roads': roads}
os.makedirs(OUT, exist_ok=True)
json.dump(out, open(os.path.join(OUT, 'grammy_layout.json'), 'w'), separators=(',', ':'))
print('layout: %d models, %d placed, %d colliders, %d marks' % (len(models), len(placed), len(cols), len(marks)))

# the ground meshes alone
vl = sc.view_layers[0]
for o in sc.objects: o.select_set(False, view_layer=vl)
n = 0
for o in G.ground().all_objects:
    if o.type == 'MESH' and not o.hide_render: o.hide_set(False, view_layer=vl); o.select_set(True, view_layer=vl); n += 1
ov = dict(scene=sc, view_layer=vl) if bpy.app.background else dict(window=bpy.context.window_manager.windows[0], scene=sc, view_layer=vl)
with bpy.context.temp_override(**ov):
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'grammy_ground.glb'), export_format='GLB', use_selection=True, use_active_scene=True,
                              export_image_format='NONE', export_apply=True, export_yup=True, export_extras=False)
print('ground meshes', n)

# the leak test's water: 1 m cells over the ground's extents
import build_grammy as B; importlib.reload(B)
xs, zs, free, zone, w = B.raster()
rows = [''.join('1' if v > 0.43 else '0' for v in row) for row in w]
os.makedirs(os.path.join(ROOT, 'tools', 'grammy'), exist_ok=True)
json.dump({'x0': B.X0, 'z0': B.Z0, 'cell': B.RES, 'rows': rows}, open(os.path.join(ROOT, 'tools', 'grammy', 'water.json'), 'w'))
print('water grid', len(rows), 'x', len(rows[0]))
