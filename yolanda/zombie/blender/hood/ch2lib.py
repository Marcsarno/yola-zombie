# Chapter 2 rebuild (2026-10-20): helpers for the ch2_*.py scripts, which change hood.blend after dress_hood.py (in the
# user's open Blender or in the background). The placing helpers are dress_hood.py's; everything a ch2 script adds carries
# ['ch2'] = <script id>, so running a script again first takes away what it added last time (wipe).
# Coordinates are the game's (x east, z south), metres, as in dress_hood.py.
import bpy, bmesh, os, math
import hoodlib
from hoodlib import *

def lib(): return bpy.data.collections['LIB']
def placed(): return bpy.data.collections['PLACED']

def ensure_model(rel):
    name = os.path.splitext(os.path.basename(rel))[0]
    c = bpy.data.collections.get(name)
    path = os.path.join(ASSETS, rel); mt = os.path.getmtime(path) if os.path.exists(path) else 0
    if c is not None and c.get('src') == rel and c.all_objects and c.get('mtime', 0) >= mt: return c   # (a re-exported prop is imported again)
    if c is not None:  # (a re-exported prop: the old import out first)
        for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(name); lib().children.link(c)
    objs = import_into(path, c); swap_materials(objs); c['src'] = rel; c['mtime'] = mt
    hoodlib._bounds.pop(c.name, None)
    for o in objs: o.hide_set(False)
    return c

def place(rel, x, z, yaw=0.0, s=1.0, tag=None, collide=True, name=None, owner=None, y=0.0):
    c = ensure_model(rel)
    e = bpy.data.objects.new(name or c.name, None)
    e.instance_type = 'COLLECTION'; e.instance_collection = c
    e.location = (x, -z, y); e.rotation_euler = (0, 0, yaw); e.scale = (s, s, s)
    e['src'] = rel
    if tag: e['tag'] = tag
    if owner: e['ch2'] = owner
    placed().objects.link(e)
    bpy.context.view_layer.update()
    if collide:
        c2 = prop_collider(e)
        if c2 is not None and owner: c2['ch2'] = owner
    return e

def remove(pred):
    n = 0
    for e in list(placed().objects):
        if e.get('src') and pred(e):
            c = bpy.data.objects.get('COL_prop_' + e.name)
            if c: bpy.data.objects.remove(c, do_unlink=True)
            bpy.data.objects.remove(e, do_unlink=True); n += 1
    return n

def wipe(owner):
    """Everything a ch2 script added on its last run (placements, colliders, meshes, marks)."""
    n = 0
    for o in list(bpy.data.objects):
        if o.get('ch2') == owner: bpy.data.objects.remove(o, do_unlink=True); n += 1
    return n

def size_of(rel):
    b = lib_bounds(ensure_model(rel)); return (b[1] - b[0], b[3] - b[2], b[5] - b[4]) if b else (1, 1, 1)  # (local x, local three-z, height)

def gz(o): return -o.location.y  # an object's game z

def near_seg(x, z, a, b, m):
    dx, dz = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dz * dz or 1e-9
    t = max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / L2))
    return math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)) < m

def near_line(x, z, pts, m): return any(near_seg(x, z, a, b, m) for a, b in zip(pts, pts[1:]))

def in_poly(P, x, z):
    c = False; j = len(P) - 1
    for i in range(len(P)):
        if (P[i][1] > z) != (P[j][1] > z) and x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]: c = not c
        j = i
    return c

# seal and fence lines (dress_hood.py's styles and its seal_line)
FENCE = ([('kit/fence_privacy.glb', 'x', 2, 0.04)], 0.4, 2.0, -0.05)
CHAIN = ([('props/hood_fence_slat.glb', 'x', 1, 0.02)], 0.3, 2.0, -0.02)

def seal_line(lid, pts, style, rng, tag=None, h=None, owner=None):
    props, thick, ch, gap = style
    tag = tag or ('block:' + lid)
    for k, ((ax, az), (bx, bz)) in enumerate(zip(pts, pts[1:])):
        dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz); ux, uz = dx / L, dz / L; nx, nz = -uz, ux
        along_x = math.atan2(-dz, dx)   # yaw that turns a model's local x along the line
        o = col_box('COL_%s_%d' % (tag.replace(':', '_'), k), (ax + bx) / 2, (az + bz) / 2, L / 2 + 0.15, thick / 2, along_x, h or ch, tag)
        if owner: o['ch2'] = owner
        t, i = 0.1, 0
        while t < L - 0.4:
            rel, axis, yj, sj = props[i % len(props)]
            sx, sz, sh = size_of(rel)
            w = sx if axis == 'x' else sz
            c = t + w / 2; off = rng.uniform(-sj, sj)
            x, z = ax + ux * c + nx * off, az + uz * c + nz * off
            yaw = (along_x if axis == 'x' else math.atan2(dx, dz)) + math.radians(rng.uniform(-yj, yj))
            place(rel, x, z, yaw, tag=tag if tag.startswith('seal:') else None, collide=False, name='%s_%s' % (lid, os.path.splitext(os.path.basename(rel))[0]), owner=owner)
            t += w + gap; i += 1

def ground_mesh(name, outline, y, mat, owner, tile=4.0):
    """A flat ground patch (game x / z outline, anticlockwise seen from above) in NEW, the roads' world UVs (tile m)."""
    new = bpy.data.collections.get('NEW')
    if new is None: new = bpy.data.collections.new('NEW'); bpy.context.scene.collection.children.link(new)
    bm = bmesh.new()
    vs = [bm.verts.new((x, -z, y)) for x, z in outline]
    f = bm.faces.new(vs); bmesh.ops.triangulate(bm, faces=[f])
    for f in bm.faces:
        if f.normal.z < 0: f.normal_flip()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new(name='UVMap')
    for li, lp in enumerate(me.loops):
        co = me.vertices[lp.vertex_index].co; uv.data[li].uv = (co.x / tile, co.y / tile + 1)
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me); o['ch2'] = owner; new.objects.link(o)
    return o

def mark(name, x, z, yaw=0.0, y=0.0, owner=None):
    marks = bpy.data.collections['MARKS']
    e = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    e.empty_display_type = 'SINGLE_ARROW'; e.empty_display_size = 0.8
    e.location = (x, -z, y); e.rotation_euler = (0, 0, yaw)
    if owner: e['ch2'] = owner
    if e.name not in marks.objects: marks.objects.link(e)
    return e
