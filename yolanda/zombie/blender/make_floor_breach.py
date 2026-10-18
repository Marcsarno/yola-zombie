# The floor breach (2026-10-18, the user's part 3: "a Blender-built floor opening that makes the emergence look convincing.
# The zombie should appear to come through the opening rather than clip through intact floor tiles. Match the hospital's
# damaged/construction setting"). Modelled here, run in Blender (live or headless):
#   blender -b --factory-startup --python blender/make_floor_breach.py -- <out.glb> [<out.blend>]
# or, in a live Blender: exec(open('<this file>').read()) with OUT_GLB / OUT_BLEND set beforehand.
# Z-up in Blender, metres; exported Y-up (glTF). Its origin is the hole's centre on the floor (z = 0).
#  - the pit: a jagged opening ~1.5 m across, its floor a dark void (vertex colour: concrete-grey at the lip to black at the
#    centre); the zombie's body below the floor is hidden by the game's floor, so through this it reads as coming up out of
#    the dark
#  - the broken slab lip: a thin band of raw concrete round the opening, standing a little proud of the tiles
#  - the tiles: shards of the 0.6 m hospital tiles (cream and pale teal, the game's floor palette) heaved up round the rim,
#    some on edge, some lying loose, each a real slab with chipped grey sides
#  - rubble and grit, and three bent reinforcing bars sticking up out of the slab
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix

random.seed(7)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_GLB = argv[0] if argv else globals().get('OUT_GLB')
OUT_BLEND = argv[1] if len(argv) > 1 else globals().get('OUT_BLEND')

for o in list(bpy.data.objects):
    if o.name.startswith('Breach'):
        bpy.data.objects.remove(o, do_unlink=True)

def mat(name, rgb, rough=0.85, metal=0.0, vcol=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    for l in list(bsdf.inputs['Base Color'].links): nt.links.remove(l)
    if vcol:
        a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
        nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    return m

M_VOID = mat('Breach_Void', (0.02, 0.018, 0.016), 1.0, vcol=True)
M_CONC = mat('Breach_Concrete', (0.30, 0.29, 0.27), 0.95)
M_CREAM = mat('Breach_TileCream', (0.70, 0.60, 0.43), 0.45)
M_TEAL = mat('Breach_TileTeal', (0.42, 0.58, 0.53), 0.45)
M_GROUT = mat('Breach_TileEdge', (0.36, 0.34, 0.31), 0.9)
M_REBAR = mat('Breach_Rebar', (0.24, 0.12, 0.06), 0.7, 0.4)
M_DUST = mat('Breach_Dust', (0.62, 0.59, 0.54), 1.0)

def obj(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    return o

# ---- the outline: a jagged ring (radius per angle), shared by the void, the lip and the shards' placement
# (roughly round, broken unevenly: a few low waves and grain of noise, and three square bites where whole tiles came away
# along their grout lines)
N = 40
rad = []
for i in range(N):
    a = 2 * math.pi * i / N
    rad.append(0.64 + 0.06 * math.sin(2 * a + 1) + 0.05 * math.sin(3 * a + 2) + 0.03 * math.sin(5 * a) + random.uniform(-0.025, 0.025))
ring = [Vector((math.cos(2 * math.pi * i / N) * rad[i], math.sin(2 * math.pi * i / N) * rad[i], 0)) for i in range(N)]
for i0 in (5, 19, 31):  # square bites: two points pushed out on a tile's grid (x or y aligned)
    for i in (i0, i0 + 1, i0 + 2):
        p = ring[i % N]
        if abs(p.x) > abs(p.y): p.x = math.copysign(abs(p.x) + 0.14, p.x)
        else: p.y = math.copysign(abs(p.y) + 0.14, p.y)
        rad[i % N] = p.length
# the camera's far side (the game's fixed view looks from +x/+z world, i.e. toward Blender -x/+y): the hole's far inner
# wall is what it would see, so the void shows it there (raw concrete at the lip, falling into the dark)
FAR = Vector((-0.57, 0.82, 0))

# ---- the void: a fan from the centre, vertex colour black in the middle to dark grey at the lip
bm = bmesh.new()
col = bm.loops.layers.color.new('Col')
c = bm.verts.new((0, 0, 0.004))
RINGS = (0.3, 0.55, 0.7, 0.8, 0.88, 0.95, 1.0) # (rings close together at the lip: the far wall's gradient stays smooth)
rows = [[bm.verts.new((p.x * k, p.y * k, 0.004)) for p in ring] for k in RINGS]
for i in range(N):
    j = (i + 1) % N
    fs = [bm.faces.new((c, rows[0][i], rows[0][j]))]
    for a, b in zip(rows, rows[1:]): fs.append(bm.faces.new((a[i], b[i], b[j], a[j])))
    for f in fs:
        for l in f.loops:
            co = l.vert.co.xy; d = co.length / max(0.01, rad[i])
            far = max(0.0, (Vector((co.x, co.y, 0)).normalized().dot(FAR) if co.length > 1e-4 else 0)) ** 1.3
            k = 0.012 + 0.05 * max(0.0, d - 0.6) ** 1.5 + far * 0.32 * max(0.0, (d - 0.62) / 0.38) ** 1.8 # (the far wall: lit concrete at the lip, darkening down into it)
            l[col] = (k, k * 0.95, k * 0.88, 1)
o_void = obj('Breach_Void', bm, [M_VOID])

# ---- the broken slab lip: a band from just inside the opening out over the floor, rough and a little proud
bm = bmesh.new()
inner, outer, top = [], [], []
for i, p in enumerate(ring):
    d = p.normalized()
    w = random.uniform(0.07, 0.15)
    inner.append(bm.verts.new((p.x - d.x * 0.03, p.y - d.y * 0.03, -0.04)))
    top.append(bm.verts.new((p.x + d.x * w * 0.35, p.y + d.y * w * 0.35, random.uniform(0.02, 0.045))))
    outer.append(bm.verts.new((p.x + d.x * w, p.y + d.y * w, 0.002)))
for i in range(N):
    j = (i + 1) % N
    bm.faces.new((inner[i], inner[j], top[j], top[i]))
    bm.faces.new((top[i], top[j], outer[j], outer[i]))
o_lip = obj('Breach_Lip', bm, [M_CONC])

# ---- tile shards: irregular slabs of 1.2 cm tile on a few mm of mortar, heaved round the rim
def shard(size, top_mat_index):
    bm = bmesh.new()
    n = random.choice((4, 5, 5, 6))
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n + random.uniform(-0.35, 0.35)
        rr = size * random.uniform(0.55, 1.0)
        pts.append((math.cos(a) * rr, math.sin(a) * rr))
    t = 0.012
    bot = [bm.verts.new((x, y, -0.006)) for x, y in pts]
    tp = [bm.verts.new((x, y, t)) for x, y in pts]
    ft = bm.faces.new(tp); ft.material_index = top_mat_index
    fb = bm.faces.new(list(reversed(bot))); fb.material_index = 2
    for k in range(n):
        j = (k + 1) % n
        f = bm.faces.new((bot[k], bot[j], tp[j], tp[k])); f.material_index = 2
    return bm

shards = []
for s in range(15):
    i = random.randrange(N)
    p, d = ring[i], ring[i].normalized()
    size = random.uniform(0.11, 0.2)
    bm = shard(size, 0 if random.random() < 0.55 else 1)
    o = obj(f'Breach_Shard_{s:02d}', bm, [M_CREAM, M_TEAL, M_GROUT])
    out = random.uniform(-0.02, 0.22)
    o.location = (p.x + d.x * out, p.y + d.y * out, 0.0)
    # heaved: tipped up away from the hole (its inner edge lifted), some nearly on edge, a few lying loose and flat
    lift = random.choice((random.uniform(0.25, 0.6), random.uniform(0.6, 1.1), random.uniform(0.0, 0.12)))
    ang = math.atan2(d.y, d.x)
    o.rotation_euler = (0, 0, 0)
    o.rotation_mode = 'XYZ'
    R = Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(-lift, 4, 'Y') @ Matrix.Rotation(random.uniform(0, 6.28), 4, 'Z')
    o.matrix_world = Matrix.Translation(o.location) @ R
    o.location.z = math.sin(lift) * size * 0.6 + 0.004
    shards.append(o)

# loose tile pieces thrown further out on the floor
for s in range(7):
    a = random.uniform(0, 2 * math.pi); r = random.uniform(0.85, 1.25)
    bm = shard(random.uniform(0.04, 0.08), 0 if random.random() < 0.6 else 1)
    o = obj(f'Breach_Bit_{s:02d}', bm, [M_CREAM, M_TEAL, M_GROUT])
    o.location = (math.cos(a) * r, math.sin(a) * r, 0.006); o.rotation_euler = (random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), random.uniform(0, 6.28))
    shards.append(o)

# ---- rubble and grit: chunks of concrete and tile round the lip
bm = bmesh.new()
for s in range(34):
    i = random.randrange(N); p, d = ring[i], ring[i].normalized()
    out = random.uniform(-0.05, 0.35)
    r = random.uniform(0.012, 0.045)
    ico = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    for v in ico['verts']:
        v.co.x *= random.uniform(0.7, 1.3); v.co.z *= random.uniform(0.5, 0.9)
        v.co += Vector((p.x + d.x * out + random.uniform(-0.03, 0.03), p.y + d.y * out + random.uniform(-0.03, 0.03), r * 0.4))
o_rub = obj('Breach_Rubble', bm, [M_CONC])

# a dusting of grit (flat, slightly lighter) spread round the opening
bm = bmesh.new()
for s in range(60):
    a = random.uniform(0, 2 * math.pi); r = random.uniform(0.7, 1.4)
    q = random.uniform(0.008, 0.02)
    v = [bm.verts.new((math.cos(a) * r + x, math.sin(a) * r + y, 0.003)) for x, y in ((-q, -q), (q, -q * 0.6), (q * 0.7, q), (-q * 0.8, q * 0.9))]
    bm.faces.new(v)
o_grit = obj('Breach_Grit', bm, [M_DUST])

# ---- rebar: three bent bars out of the slab edge
def rebar(i, h, bend):
    p, d = ring[i], ring[i].normalized()
    cu = bpy.data.curves.new(f'Breach_Rebar_{i}', 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = 0.006; cu.bevel_resolution = 1; cu.resolution_u = 6
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    side = Vector((-d.y, d.x, 0)) * random.uniform(-0.1, 0.1)
    pts = [p - d * 0.05 + Vector((0, 0, -0.02)), p + d * 0.02 + Vector((0, 0, h * 0.55)) + side * 0.5, p - d * bend + Vector((0, 0, h)) + side]
    for bp, co in zip(sp.bezier_points, pts):
        bp.co = co; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(f'Breach_Rebar_{i}', cu); bpy.context.scene.collection.objects.link(o)
    cu.materials.append(M_REBAR)
    return o
bars = [rebar(3, 0.32, 0.18), rebar(15, 0.22, -0.1), rebar(24, 0.38, 0.25)]

# ---- one object, the origin at the hole's centre on the floor: every part's evaluated mesh (the bars' curves as meshes)
# merged in world space with one shared material list (data only: no operators, so it runs the same live and headless)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
parts = [o for o in bpy.data.objects if o.name.startswith('Breach_')]
allm, bm = [], bmesh.new()
col_all = bm.loops.layers.color.new('Col')
for o in parts:
    me_o = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    me_o.transform(o.matrix_world)
    remap = []
    for m in me_o.materials:
        if m not in allm: allm.append(m)
        remap.append(allm.index(m))
    tmp = bmesh.new(); tmp.from_mesh(me_o)
    src_col = tmp.loops.layers.color.get('Col')
    vmap = {v: bm.verts.new(v.co) for v in tmp.verts}
    for f in tmp.faces:
        try: nf = bm.faces.new([vmap[v] for v in f.verts])
        except ValueError: continue
        nf.material_index = remap[f.material_index] if remap else 0
        for l_new, l_old in zip(nf.loops, f.loops): l_new[col_all] = l_old[src_col] if src_col else (1, 1, 1, 1)
    tmp.free(); bpy.data.meshes.remove(me_o)
for o in parts: bpy.data.objects.remove(o, do_unlink=True)
me = bpy.data.meshes.new('Breach_Floor'); bm.normal_update(); bm.to_mesh(me); bm.free()
for m in allm: me.materials.append(m)
ca = me.color_attributes.get('Col')
if ca: me.color_attributes.active_color = ca; me.color_attributes.render_color_index = me.color_attributes.find('Col') # (exported as COLOR_0: the void's depth)
breach = bpy.data.objects.new('Breach_Floor', me); bpy.context.scene.collection.objects.link(breach)
for p in me.polygons: p.use_smooth = False
print('BREACH', len(me.polygons), 'faces', len(me.vertices), 'verts', [m.name for m in me.materials])

if OUT_GLB:
    for o in bpy.context.view_layer.objects: o.select_set(False)
    breach.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=True)
    print('WROTE', OUT_GLB)
if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, copy=True)
    print('SAVED', OUT_BLEND)
