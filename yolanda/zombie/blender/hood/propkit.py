# Chapter 2: the prop-building helpers of make_hood_props.py as a module, for props built in a scene of their own (in the
# user's open Blender as well as in the background): boxes, tubes, discs and slabs with the kit's placeholder materials
# (M_<key>__<paint>: the game swaps them for its shared textures and paints, UVs in metre tiles), origin at the base
# centre, front -Y (the game's +Z), each prop merged to one mesh per material and exported as a GLB.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

TILE = {'wood_raw': 2, 'wood_dark': 2, 'wood_painted': 2, 'wood_siding': 2, 'wood_floor': 2, 'metal_painted': 2, 'metal_rusty': 2,
        'rubber': 1, 'sand': 4, 'concrete_rough': 2, 'concrete_slab': 3, 'plastic': 1, 'flat': 1, 'chainlink': 0.5, 'roof_shingles': 2,
        'plaster': 3, 'tile_floor': 1.8, 'tile_wall': 1, 'carpet': 1, 'countertop': 1, 'fabric': 1, 'forest_floor': 4, 'dirt': 4}
SC = None  # the scene new objects go into (use_scene)

def use_scene(name, clear=True):
    """The props' own scene (made if missing); clear: its objects removed first (a rebuild)."""
    global SC
    sc = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    if clear:
        for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    SC = sc
    return sc

def M(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        key = name[2:].split('__')
        col = {'red': (0.5, 0.05, 0.03), 'yellow': (0.8, 0.6, 0.05), 'green': (0.06, 0.2, 0.08), 'teal': (0.05, 0.25, 0.25), 'blue': (0.05, 0.12, 0.4),
               'darkgrey': (0.05, 0.05, 0.05), 'grey': (0.3, 0.3, 0.3), 'white': (0.75, 0.75, 0.7), 'black': (0.02, 0.02, 0.02),
               'orange': (0.6, 0.15, 0.02), 'sage': (0.24, 0.3, 0.2), 'cream': (0.58, 0.49, 0.3), 'brown': (0.1, 0.05, 0.02)}.get(key[1] if len(key) > 1 else '', (0.5, 0.45, 0.35))
        b.inputs['Base Color'].default_value = (*col, 1)
    return m

def planar_uv(me, tile):
    """UVs in tiles of `tile` m: each face projected along its main axis (the kit's box_uv convention)."""
    uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    for p in me.polygons:
        n = p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            a, b = [(1, 2), (0, 2), (0, 1)][ax]
            uv.data[li].uv = (v[a] / tile, v[b] / tile)

def finish(name, bm, mat, parent, smooth=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    planar_uv(me, TILE.get(mat[2:].split('__')[0], 2))
    me.materials.append(M(mat))
    ob = bpy.data.objects.new(name, me); SC.collection.objects.link(ob); ob.parent = parent
    return ob

def box(parent, name, size, at, mat, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X'), verts=bm.verts)
    return finish(name, bm, mat, parent)

def rod(parent, name, a, b, r, mat, seg=8):
    a, b = Vector(a), Vector(b); d = b - a; L = d.length
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=L)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4(), verts=bm.verts)
    return finish(name, bm, mat, parent, True)

def disc(parent, name, r, h, at, mat, seg=24, tilt=0.0, r2=None, axis='X'):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ Matrix.Rotation(tilt, 4, axis), verts=bm.verts)
    return finish(name, bm, mat, parent, True)

def prism(parent, name, pts, y0, y1, mat):
    """A slab from an outline in the X-Z plane (pts [(x, z) ...], counter-clockwise seen from -Y) between y0 and y1: gables,
    stair stringers."""
    bm = bmesh.new()
    f = [bm.verts.new((x, y0, z)) for x, z in pts]; b = [bm.verts.new((x, y1, z)) for x, z in pts]
    bm.faces.new(f[::-1]); bm.faces.new(b)
    n = len(pts)
    for i in range(n): bm.faces.new((f[i], f[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, parent)

def wall(parent, name, a, b, h, t, mat, holes=(), z0=0.0):
    """A straight wall from a to b (x, y on the floor), t thick, z0..z0+h, with openings [(along from a, width, sill, top) ...]:
    built as the boxes between them."""
    a, b = Vector((*a, 0)), Vector((*b, 0)); d = b - a; L = d.length; u = d / L; yaw = math.atan2(u.y, u.x)
    cuts = sorted(holes); out = []
    def piece(s0, s1, zz0, zz1):
        if s1 - s0 < 0.005 or zz1 - zz0 < 0.005: return
        c = a + u * ((s0 + s1) / 2)
        out.append(box(parent, name, (s1 - s0, t, zz1 - zz0), (c.x, c.y, z0 + (zz0 + zz1) / 2), mat, rot=(0, 0, yaw)))
    s = 0.0
    for at, w, sill, top in cuts:
        piece(s, at, 0, h); piece(at, at + w, 0, sill); piece(at, at + w, top, h); s = at + w
    piece(s, L, 0, h)
    return out

def root(name):
    o = bpy.data.objects.new(name, None); SC.collection.objects.link(o); return o

def merge_by_material(r):
    """(draw calls) a prop's parts joined into one mesh per material (bmesh, no operators: works from any context); parts
    under a named empty the game moves are merged within that empty instead."""
    groups = {}
    for o in r.children_recursive:
        if o.type != 'MESH': continue
        owner = o.parent if o.parent and o.parent.type == 'EMPTY' and o.parent is not r else r
        groups.setdefault((owner, o.material_slots[0].material.name if o.material_slots else ''), []).append(o)
    for (owner, mname), objs in groups.items():
        if len(objs) < 2: continue
        bm = bmesh.new()
        inv = owner.matrix_world.inverted()
        for o in objs:
            t = bmesh.new(); t.from_mesh(o.data); t.transform(inv @ o.matrix_world)
            me = bpy.data.meshes.new('tmp'); t.to_mesh(me); t.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
        me = bpy.data.meshes.new(objs[0].name); bm.to_mesh(me); bm.free()
        me.materials.append(bpy.data.materials[mname])
        for o in objs: bpy.data.objects.remove(o, do_unlink=True)
        ob = bpy.data.objects.new(me.name, me); SC.collection.objects.link(ob); ob.parent = owner

def export(r, path):
    """The prop alone as a GLB (the window shows the props' scene while it exports)."""
    merge_by_material(r)
    wm = bpy.context.window_manager; win = wm.windows[0]
    prev = win.scene if not bpy.app.background else None
    if prev is not None: win.scene = SC
    vl = SC.view_layers[0]
    for o in SC.objects: o.select_set(False, view_layer=vl)
    for o in [r] + list(r.children_recursive): o.select_set(True, view_layer=vl)
    ov = dict(window=win, scene=SC, view_layer=vl) if prev is not None else dict(scene=SC, view_layer=vl)
    with bpy.context.temp_override(**ov):
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True, export_image_format='NONE')
    return sum(len(o.data.polygons) for o in r.children_recursive if o.type == 'MESH')
