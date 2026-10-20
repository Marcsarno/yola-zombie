# Chapter 2: new props for the remake (polish pass 1; the user: "the playground doesn't look very good. The gate that you go
# through doesn't look very good"). Each is built from boxes, tubes and rods with the kit's placeholder materials
# (M_<key>__<paint>: the game's shared textures and paints, UVs in metre tiles), origin at the base centre, front -Y
# (the game's +Z), exported to assets/neighborhood/props/hood_<name>.glb; the scene is saved as blender/hood/hood_props.blend.
#   play_tower   two decks on posts, a canopy, a slide, a ladder, a chain bridge and a climbing panel (4.6 x 3.4 m)
#   swings       an A-frame swing set, one seat hanging by a single chain (3.4 m)
#   merry        a merry-go-round, knocked off level
#   bench        a park bench
#   sandbox      a timber sandbox with a pail
#   gate         the club's chain-link double gate between steel posts, chained and padlocked (leaves GateL_v2 / GateR_v2
#                pivot at their hinges, as the old palisade gate's: the game swings them open; Chain_v2 / Padlock_v2 hide)
#   fence_slat   a 2.4 m chain-link panel with green privacy slats and barbed wire on top
#   blender -b --factory-startup --python blender/hood/make_hood_props.py
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'neighborhood', 'props')
TILE = {'wood_raw': 2, 'wood_dark': 2, 'wood_painted': 2, 'metal_painted': 2, 'metal_rusty': 2, 'rubber': 1, 'sand': 4, 'concrete_rough': 2, 'plastic': 1, 'flat': 1, 'chainlink': 0.5}
rng = random.Random(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def M(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        key = name[2:].split('__')
        col = {'red': (0.5, 0.05, 0.03), 'yellow': (0.8, 0.6, 0.05), 'green': (0.06, 0.2, 0.08), 'teal': (0.05, 0.25, 0.25), 'blue': (0.05, 0.12, 0.4),
               'darkgrey': (0.05, 0.05, 0.05), 'grey': (0.3, 0.3, 0.3), 'white': (0.75, 0.75, 0.7), 'black': (0.02, 0.02, 0.02)}.get(key[1] if len(key) > 1 else '', (0.5, 0.45, 0.35))
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
    key = mat[2:].split('__')[0]
    planar_uv(me, TILE.get(key, 2))
    me.materials.append(M(mat))
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); ob.parent = parent
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

def disc(parent, name, r, h, at, mat, seg=24, tilt=0.0):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ Matrix.Rotation(tilt, 4, 'X'), verts=bm.verts)
    return finish(name, bm, mat, parent, True)

def root(name):
    o = bpy.data.objects.new(name, None); sc.collection.objects.link(o); return o

def merge_by_material(r):
    """(polish 4: draw calls) a prop's parts joined into one mesh per material; parts under a named node the game moves
    (the gate's leaves, its chain and padlock) are merged within that node instead, so they still swing and hide."""
    groups = {}
    for o in r.children_recursive:
        if o.type != 'MESH': continue
        owner = o.parent if o.parent and o.parent.type == 'EMPTY' and o.parent is not r else r
        groups.setdefault((owner.name, o.material_slots[0].material.name if o.material_slots else ''), []).append(o)
    for (owner, _), objs in groups.items():
        if len(objs) < 2: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()

def export(r, file):
    merge_by_material(r)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [r] + list(r.children_recursive): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, file), export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_image_format='NONE')

POST, DECK, ROOF, SLIDE, PANEL = 'M_metal_painted__teal', 'M_wood_raw', 'M_plastic__red', 'M_plastic__yellow', 'M_plastic__blue'

def play_tower(x0=0.0):
    r = root('hood_play_tower'); r.location.x = x0
    # two decks: low (1.0 m) and high (1.5 m), 1.3 m square, joined by a chain bridge
    for (cx, h) in ((-1.4, 1.0), (1.4, 1.5)):
        for sx in (-0.6, 0.6):
            for sy in (-0.6, 0.6): box(r, 'post', (0.1, 0.1, h + 1.1), (cx + sx, sy, (h + 1.1) / 2), POST)
        box(r, 'deck', (1.32, 1.32, 0.08), (cx, 0, h), DECK)
        for sy in (-0.62, 0.62): box(r, 'rail', (1.2, 0.05, 0.05), (cx, sy, h + 0.75), POST)
    # canopy over the high deck: a shallow pyramid
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=1.05, radius2=0.02, depth=0.55)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((1.4, 0, 2.9)) @ Matrix.Rotation(math.pi / 4, 4, 'Z'), verts=bm.verts)
    finish('canopy', bm, ROOF, r)
    # the bridge: planks on two chains
    for i in range(8):
        x = -0.75 + i * 0.21; z = 1.0 + 0.5 * (i / 7) - 0.12 * math.sin(math.pi * i / 7)
        box(r, 'plank', (0.17, 0.6, 0.04), (x, 0, z), 'M_wood_dark')
    for sy in (-0.32, 0.32): rod(r, 'bridge_chain', (-0.8, sy, 1.75), (0.8, sy, 2.2), 0.015, 'M_metal_painted__darkgrey')
    # the slide off the low deck (front, -Y): a chute with side walls down to the ground
    a, b = Vector((-1.4, -0.66, 1.0)), Vector((-1.4, -2.9, 0.15)); d = b - a
    ang = math.atan2(-d.z, -d.y)
    box(r, 'slide_bed', (0.55, d.length, 0.04), (a + b) / 2, SLIDE, rot=(-ang, 0, 0))
    for sx in (-0.3, 0.3): box(r, 'slide_wall', (0.05, d.length, 0.2), (a + b) / 2 + Vector((sx, 0, 0.1)), SLIDE, rot=(-ang, 0, 0))
    # the ladder up the high deck's back (+Y) and the climbing panel on its right
    for sx in (1.15, 1.65): rod(r, 'ladder_side', (sx, 1.2, 0), (sx, 0.68, 1.5), 0.03, POST)
    for k in range(5): z = 0.3 + k * 0.28; y = 1.2 - (0.52 * z / 1.5); rod(r, 'rung', (1.15, y, z), (1.65, y, z), 0.022, POST)
    box(r, 'climb_panel', (0.06, 1.2, 1.4), (2.1, 0, 0.75), PANEL, rot=(0, 0.25, 0))
    for k in range(7): box(r, 'grip', (0.08, 0.1, 0.07), (2.16 + 0.02 * k, -0.4 + (k % 3) * 0.4, 0.25 + k * 0.17), SLIDE)
    return r

def swings(x0=0.0):
    r = root('hood_swings'); r.location.x = x0
    for sx in (-1.7, 1.7):
        for sy in (-0.7, 0.7): rod(r, 'a_leg', (sx, sy, 0), (sx, 0, 2.3), 0.045, 'M_metal_painted__red')
    rod(r, 'top_bar', (-1.75, 0, 2.3), (1.75, 0, 2.3), 0.05, 'M_metal_painted__red')
    for i, sx in enumerate((-0.75, 0.75)):
        broken = i == 1
        sz = 0.5
        if broken:  # hanging by one chain, the seat swung down
            rod(r, 'chain', (sx - 0.22, 0, 2.28), (sx - 0.22, 0, 0.62), 0.008, 'M_metal_painted__grey')
            box(r, 'seat', (0.5, 0.2, 0.03), (sx - 0.05, 0, 0.42), 'M_rubber', rot=(0, 1.2, 0))
        else:
            for ox in (-0.22, 0.22): rod(r, 'chain', (sx + ox, 0, 2.28), (sx + ox, 0, sz), 0.008, 'M_metal_painted__grey')
            box(r, 'seat', (0.5, 0.2, 0.03), (sx, 0, sz), 'M_rubber')
    return r

def merry(x0=0.0):
    r = root('hood_merry'); r.location.x = x0
    disc(r, 'hub', 0.12, 0.25, (0, 0, 0.12), 'M_metal_painted__darkgrey')
    tilt = 0.09
    disc(r, 'plate', 1.0, 0.06, (0, 0, 0.3), 'M_metal_painted__red', tilt=tilt)
    for k in range(4):
        a = k * math.pi / 2; c, s = math.cos(a), math.sin(a)
        z0 = 0.33 + s * 0.08
        rod(r, 'bar', (c * 0.15, s * 0.15, z0 + 0.6), (c * 0.85, s * 0.85, z0 + 0.6), 0.025, 'M_metal_painted__yellow')
        rod(r, 'upright', (c * 0.85, s * 0.85, z0), (c * 0.85, s * 0.85, z0 + 0.6), 0.025, 'M_metal_painted__yellow')
    return r

def bench(x0=0.0):
    r = root('hood_bench'); r.location.x = x0
    for sx in (-0.75, 0.75):
        box(r, 'leg', (0.06, 0.45, 0.45), (sx, 0, 0.22), 'M_metal_painted__darkgrey')
        box(r, 'back_leg', (0.06, 0.06, 0.45), (sx, 0.22, 0.67), 'M_metal_painted__darkgrey', rot=(-0.2, 0, 0))
    for k in range(3): box(r, 'slat', (1.8, 0.11, 0.04), (0, -0.16 + k * 0.13, 0.46), 'M_wood_raw')
    for k in range(2): box(r, 'back_slat', (1.8, 0.03, 0.11), (0, 0.26 + k * 0.03, 0.62 + k * 0.17), 'M_wood_raw', rot=(-0.2, 0, 0))
    return r

def sandbox(x0=0.0):
    r = root('hood_sandbox'); r.location.x = x0
    for sx, sy, w, d in ((0, -1, 2.1, 0.12), (0, 1, 2.1, 0.12), (-1, 0, 0.12, 2.1), (1, 0, 0.12, 2.1)): box(r, 'timber', (w, d, 0.25), (sx, sy, 0.12), 'M_wood_dark')
    box(r, 'sand', (1.9, 1.9, 0.12), (0, 0, 0.1), 'M_sand')
    disc(r, 'pail', 0.09, 0.16, (0.45, -0.3, 0.24), 'M_plastic__blue', seg=12)
    disc(r, 'pail2', 0.08, 0.14, (-0.5, 0.4, 0.2), 'M_plastic__red', seg=12, tilt=1.5)
    return r

def gate(x0=0.0):
    """The club's double gate: steel posts at x = +-1.74 (the old gate's posts), two chain-link leaves of 1.62 m hinged at
    them (node origins at the hinges, as the old gate: GateL_v2 at x -1.65, GateR_v2 at +1.65), the chain round the
    middle uprights and a padlock; a red NO TRESPASSING plate on the left leaf."""
    r = root('hood_gate'); r.location.x = x0
    for sx in (-1.74, 1.74): box(r, 'post', (0.16, 0.16, 2.6), (sx, 0, 1.3), 'M_metal_painted__darkgrey')
    for sx in (-1.74, 1.74): disc(r, 'post_cap', 0.11, 0.06, (sx, 0, 2.63), 'M_metal_painted__darkgrey', seg=10)
    for side, nm in ((-1, 'GateL_v2'), (1, 'GateR_v2')):
        leaf = bpy.data.objects.new(nm, None); sc.collection.objects.link(leaf); leaf.parent = r; leaf.location = (side * 1.65, 0, 0)
        w = 1.6; inner = -side * w  # the leaf runs from its hinge toward the middle
        cx = inner / 2
        for zz in (0.12, 1.1, 2.1): rod(leaf, 'tube', (0, 0, zz), (inner, 0, zz), 0.022, 'M_metal_painted__grey')
        for xx in (0.0, inner): rod(leaf, 'stile', (xx, 0, 0.1), (xx, 0, 2.12), 0.025, 'M_metal_painted__grey')
        rod(leaf, 'brace', (0, 0, 0.14), (inner, 0, 2.08), 0.016, 'M_metal_painted__grey')
        bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
        bmesh.ops.transform(bm, matrix=Matrix.Translation((cx, 0, 1.11)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((abs(inner), 1.98, 1, 1)), verts=bm.verts)
        finish('mesh', bm, 'M_chainlink', leaf)
        if side < 0:
            box(leaf, 'sign', (0.62, 0.02, 0.36), (cx, -0.04, 1.45), 'M_flat__red')
            box(leaf, 'sign_band', (0.56, 0.025, 0.06), (cx, -0.045, 1.45), 'M_flat__white')
    ch = bpy.data.objects.new('Chain_v2', None); sc.collection.objects.link(ch); ch.parent = r; ch.location = (0, 0, 1.1)
    for k in range(9):
        a = k / 9 * math.tau
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=0.035, radius2=0.035, depth=0.012)
        bmesh.ops.transform(bm, matrix=Matrix.Translation((math.cos(a) * 0.09, math.sin(a) * 0.07, 0.03 * math.sin(a * 2))) @ Matrix.Rotation(a + (math.pi / 2 if k % 2 else 0), 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'), verts=bm.verts)
        finish('link', bm, 'M_metal_rusty', ch)
    pl = bpy.data.objects.new('Padlock_v2', None); sc.collection.objects.link(pl); pl.parent = r; pl.location = (0, -0.1, 0.98)
    box(pl, 'body', (0.07, 0.035, 0.08), (0, 0, 0), 'M_metal_painted__yellow')
    rod(pl, 'shackle', (-0.022, 0, 0.04), (-0.022, 0, 0.09), 0.006, 'M_metal_painted__grey'); rod(pl, 'shackle2', (0.022, 0, 0.04), (0.022, 0, 0.09), 0.006, 'M_metal_painted__grey')
    return r

def fence_slat(x0=0.0):
    r = root('hood_fence_slat'); r.location.x = x0
    for sx in (-1.2, 1.2): rod(r, 'post', (sx, 0, 0), (sx, 0, 2.15), 0.035, 'M_metal_painted__grey')
    for zz in (0.08, 2.0): rod(r, 'rail', (-1.2, 0, zz), (1.2, 0, zz), 0.02, 'M_metal_painted__grey')
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, 1.04)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((2.4, 1.92, 1, 1)), verts=bm.verts)
    finish('mesh', bm, 'M_chainlink', r)
    # privacy slats, a few missing and a few cracked
    for k in range(30):
        if rng.random() < 0.12: continue
        x = -1.16 + k * 0.08; h = 1.85 if rng.random() > 0.1 else 1.1 + rng.random() * 0.5
        box(r, 'slat', (0.055, 0.012, h), (x, 0.012, 0.1 + h / 2), 'M_plastic__green')
    for k, zz in enumerate((2.18, 2.3, 2.42)): rod(r, 'barb', (-1.2, 0.06 * k, zz), (1.2, 0.06 * k, zz), 0.006, 'M_metal_rusty')
    for sx in (-1.2, 1.2): rod(r, 'arm', (sx, 0, 2.12), (sx, 0.16, 2.45), 0.018, 'M_metal_painted__grey')
    return r

def play_pad(x0=0.0):
    """The play area's ground: wood chips inside a timber border, 12 x 10 m, worn through to the soil in patches."""
    r = root('hood_play_pad'); r.location.x = x0
    W, D = 12.0, 10.0
    box(r, 'chips', (W, D, 0.06), (0, 0, 0.03), 'M_forest_floor')
    for k in range(5): box(r, 'bare', (1.2 + rng.random() * 1.6, 0.9 + rng.random() * 1.2, 0.02), (rng.uniform(-4.5, 4.5), rng.uniform(-3.5, 3.5), 0.065), 'M_dirt', rot=(0, 0, rng.random() * 3))
    for sx, sy, w, d in ((0, -D / 2, W + 0.3, 0.15), (0, D / 2, W + 0.3, 0.15), (-W / 2, 0, 0.15, D), (W / 2, 0, 0.15, D)): box(r, 'border', (w, d, 0.18), (sx, sy, 0.09), 'M_wood_dark')
    return r

os.makedirs(OUT, exist_ok=True)
TILE['forest_floor'] = 4; TILE['dirt'] = 4
props = [(play_pad, 'hood_play_pad.glb'), (play_tower, 'hood_play_tower.glb'), (swings, 'hood_swings.glb'), (merry, 'hood_merry.glb'), (bench, 'hood_bench.glb'),
         (sandbox, 'hood_sandbox.glb'), (gate, 'hood_gate.glb'), (fence_slat, 'hood_fence_slat.glb')]
x = 0.0
for fn, file in props:
    r = fn(0.0)
    export(r, file)
    r.location.x = x; x += 6.0   # (laid out side by side in the saved scene for review)
    print('exported', file, sum(len(o.data.polygons) for o in r.children_recursive if o.type == 'MESH'), 'faces')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'hood_props.blend'))
print('saved props')
