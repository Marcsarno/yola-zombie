# Chapter 4, Grammy's peninsula: the helpers build_grammy.py works with (the hood's, pointed at this map).
# The plan's data (design/grandma_map/, the private level-design repo) is copied into src/: grandma_map.json (metres from
# Grandma's door, x east, z south) and sm_water_mask.png (the street map's water, in its pixels).
# Blender (x, y, z) = game (x, -z, y). Collections as the hood's: LIB (the models, hidden), PLACED (their placements),
# GROUND (the map's own meshes), COL (collision), MARKS (named spots).
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'hood'), HERE]
import hoodlib
from hoodlib import kit_material, swap_materials, import_into, col_box, col_circle, prop_collider
ROOT = os.path.dirname(os.path.dirname(HERE)); ASSETS = os.path.join(ROOT, 'assets')
SRC = os.path.join(HERE, 'src')
MAP = json.load(open(os.path.join(SRC, 'grandma_map.json')))
# the street map's pixels to metres (tools/plan/grandma_map.py: 200 ft = 128 px; the origin, her door, at pixel O)
PXM = 128 / 60.96; O = (338.70, 411.07)

def main_scene():
    """the map's own scene (the window shows it): 'Grammy' (the kit builds in 'Villas')"""
    sc = bpy.data.scenes.get('Grammy') or bpy.data.scenes.get('Scene')
    if sc.name != 'Grammy': sc.name = 'Grammy'
    if not bpy.app.background: bpy.context.window_manager.windows[0].scene = sc
    return sc

def coll(name, hidden=False):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c)
        if hidden:
            for v in bpy.context.view_layer.layer_collection.children:
                if v.name == name: v.hide_viewport = True
    return c
def lib():
    c = coll('LIB', True); c.hide_render = True   # (the models' templates sit at the origin; their placements draw them)
    return c
def placed(): return coll('PLACED')
def ground(): return coll('GROUND')
def marks(): return coll('MARKS')

def ensure_model(rel):
    """a model (path under assets/) imported once into LIB as its own collection; again if the file is newer"""
    name = os.path.splitext(os.path.basename(rel))[0]
    c = bpy.data.collections.get(name); path = os.path.join(ASSETS, rel); mt = os.path.getmtime(path)
    if c is not None and c.get('src') == rel and c.all_objects and c.get('mtime', 0) >= mt: return c
    if c is not None:
        for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(name); lib().children.link(c)
    objs = import_into(path, c); swap_materials(objs); c['src'] = rel; c['mtime'] = mt
    hoodlib._bounds.pop(c.name, None)
    return c

def place(rel, x, z, yaw=0.0, s=1.0, sx=None, sz=None, tag=None, collide=True, name=None, part=None, y=0.0):
    """a placement of a model at game x / z, turned yaw (radians, Blender's z: counter-clockwise seen from above); scaled
    s (or sx along the model's x, sz along its front-back)"""
    c = ensure_model(rel)
    e = bpy.data.objects.new(name or c.name, None)
    e.instance_type = 'COLLECTION'; e.instance_collection = c
    e.location = (x, -z, y); e.rotation_euler = (0, 0, yaw); e.scale = (sx or s, sz or s, s)
    e['src'] = rel
    if tag: e['tag'] = tag
    if part: e['part'] = part
    placed().objects.link(e)
    if collide:
        bpy.context.view_layer.update()
        c2 = prop_collider(e)
        if c2 is not None and part: c2['part'] = part
    return e

def wipe(part):
    """everything a part of the build made (a rebuild of that part)"""
    n = 0
    for o in list(bpy.data.objects):
        if o.get('part') == part: bpy.data.objects.remove(o, do_unlink=True); n += 1
    return n

def col(name, cx, cz, hx, hz, yaw, h, tag, part):
    o = col_box(name, cx, cz, hx, hz, yaw, h, tag); o['part'] = part; return o

def mark(name, x, z, yaw=0.0, y=0.0, part=None):
    o = bpy.data.objects.get(name)
    if o is None: o = bpy.data.objects.new(name, None); marks().objects.link(o)
    o.location = (x, -z, y); o.rotation_euler = (0, 0, yaw); o.empty_display_size = 0.6
    if part: o['part'] = part
    return o

def mesh_obj(name, verts, faces, mat, part, uv=None, coll_=None):
    """a mesh from game-space vertices (x, y, z); uv: per-vertex (u, v) or a function of the game vertex"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, -z, y) for x, y, z in verts], [], faces)
    if uv is not None:
        lay = me.uv_layers.new(name='UVMap')
        for li, l in enumerate(me.loops):
            x, y, z = verts[l.vertex_index]
            lay.data[li].uv = uv(x, y, z) if callable(uv) else uv[l.vertex_index]
    me.materials.append(kit_material(mat) if mat.startswith('M_') else bpy.data.materials[mat])
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)     # (flat pieces face up, whichever way their points ran)
    for f in bm.faces:
        if f.normal.z < -1e-6: f.normal_flip()
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    me.update()
    o = bpy.data.objects.new(name, me); (coll_ or ground()).objects.link(o); o['part'] = part
    return o

def world_uv(tile):
    return lambda x, y, z: (x / tile, -z / tile)

# ---- the plan's geometry
def polyline_len(pts): return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
def resample(pts, step):
    """points every `step` m along a polyline (ends kept)"""
    out = [pts[0]]; acc = 0.0
    for a, b in zip(pts, pts[1:]):
        d = math.dist(a, b)
        if d < 1e-9: continue
        t = step - acc
        while t <= d:
            out.append((a[0] + (b[0] - a[0]) * t / d, a[1] + (b[1] - a[1]) * t / d)); t += step
        acc = (acc + d) % step
    if math.dist(out[-1], pts[-1]) > step * 0.3: out.append(tuple(pts[-1]))
    else: out[-1] = tuple(pts[-1])
    return out
def dedupe(pts):
    out = [tuple(pts[0])]
    for p in pts[1:]:
        if math.dist(p, out[-1]) > 0.05: out.append(tuple(p))
    return out
def normals(pts, closed=False):
    """unit left normals (x, z) at each point (the average of the two segments')"""
    n = len(pts); out = []
    for i in range(n):
        a = pts[i - 1] if (i > 0 or closed) else pts[i]; b = pts[(i + 1) % n] if (i < n - 1 or closed) else pts[i]
        dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1
        out.append((-dz / L, dx / L))
    return out
def seg_dist(p, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2))
    return math.hypot(p[0] - ax - t * dx, p[1] - az - t * dz)
def line_dist(p, pts): return min(seg_dist(p, a, b) for a, b in zip(pts, pts[1:]))
def in_poly(P, x, z):
    c = False; j = len(P) - 1
    for i in range(len(P)):
        xi, zi = P[i]; xj, zj = P[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi: c = not c
        j = i
    return c

# the water: the street map's mask, metres to its pixels (outside it: land)
_WM = None
def water_mask():
    global _WM
    if _WM is None:
        im = bpy.data.images.load(os.path.join(SRC, 'sm_water_mask.png'))
        _WM = (np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], -1)[::-1, :, 0] > 0.5).astype(np.float32)
        bpy.data.images.remove(im)
    return _WM
def px(x, z): return (x * PXM + O[0], z * PXM + O[1])
