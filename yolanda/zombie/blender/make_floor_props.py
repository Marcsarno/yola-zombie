# Props for the rebuilt Floors 6 and 5 (2026-10-19, combat chat; FLOORS_REDESIGN.html; the user: "if you need to build or
# change any assets, launch blender"). Built in the "RoomProps" scene beside the room-mechanic props (make_room_props.py),
# each exported to assets/props/<name>.glb: metres, the origin at the base centre, the front facing Blender -Y (the
# game's +Z).
#   ceiling_collapse      the main corridor's collapsed ceiling (Floor 6): a rubble heap of broken slab and plaster, fallen
#                         ceiling tiles, bent grid bars, a crushed duct, a fluorescent fitting, a cable tray hanging down
#                         from the slab above. 3.0 m across (X), 2.2 m deep (Y), the heap ~1.4 m, the tray to 2.6 m
#   round_reception_desk  the Main Reception's round desk (Floor 5): a counter ring 3.6 m across, its staff opening at the
#                         back (+Y: the camera wall's side), a raised transaction ledge, a teal band and INFORMATION on the
#                         front, the low worktop inside with screens, a chair
#   traction_frame        Bay 6A's orthopaedic traction (Floor 6): a Balkan beam frame over a bed (posts at the head and
#                         foot, the overhead beam, a trapeze, pulleys, the cord down to a weight stack off the foot end);
#                         sized to stand over hospital/recovery_bed.glb (its head at +Y)
# Run inside Blender: exec(open(r'<this file>').read()); build_all(True) exports.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

OUT = r'C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie\assets\props'

def scene():
    sc = bpy.data.scenes.get('RoomProps') or bpy.data.scenes.new('RoomProps')
    bpy.context.window.scene = sc
    return sc

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def mat(name, rgb, rough=0.5, metal=0.0, emit=None, emit_k=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_k
    return m

def clear(sc, prefix):
    for o in list(sc.objects):
        if o.name.startswith(prefix): bpy.data.objects.remove(o, do_unlink=True)

def link(sc, ob, parent=None):
    sc.collection.objects.link(ob)
    if parent: ob.parent = parent
    return ob

def mesh_obj(name, bm, m, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); me.materials.append(m)
    return ob

def box(name, sx, sy, sz, m, at=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, segs=2, smooth=False):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segs, affect='EDGES', profile=0.5)
    ob = mesh_obj(name, bm, m, smooth); ob.location = at; ob.rotation_euler = rot
    return ob

def cyl(name, r, h, m, seg=24, z0=0.0, r2=None, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, z0 + h / 2))
    return mesh_obj(name, bm, m)

def rod(name, a, b, r, m, seg=12):
    a, b = Vector(a), Vector(b); d = b - a
    c = cyl(name, r, d.length, m, seg=seg, z0=-d.length / 2)
    c.location = (a + b) / 2; c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return c

def rock(name, r, m, at, squash=(1, 1, 0.6), seed=0, sub=2):
    rnd = random.Random(seed)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts: v.co *= 0.78 + 0.4 * rnd.random()
    bmesh.ops.scale(bm, vec=squash, verts=bm.verts)
    ob = mesh_obj(name, bm, m, smooth=False); ob.location = at; ob.rotation_euler = (rnd.random() * 0.6, rnd.random() * 0.6, rnd.random() * 6.28)
    return ob

def text(name, s, size, m, at, rot=(math.radians(90), 0, 0)):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = s; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = 0.002
    ob = bpy.data.objects.new(name, cu); ob.location = at; ob.rotation_euler = rot; cu.materials.append(m)
    return ob

def annulus(name, r0, r1, z0, z1, a0, a1, m, seg=48):
    # a solid ring sector between radii r0 < r1, heights z0 < z1, angles a0 -> a1 (radians, 0 = +X, counter-clockwise)
    bm = bmesh.new(); rings = []
    n = max(2, int(seg * abs(a1 - a0) / (2 * math.pi)) + 1)
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n; c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * c, r * s, z)) for (r, z) in ((r0, z0), (r1, z0), (r1, z1), (r0, z1))])
    for i in range(n):
        A, B = rings[i], rings[i + 1]
        for k in range(4): bm.faces.new((A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, m, smooth=True)

def root(sc, name):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); return e

def export(sc, rootobj, file):
    for o in sc.objects: o.select_set(False)
    def sel(o):
        o.select_set(True)
        for c in o.children: sel(c)
    sel(rootobj); bpy.context.view_layer.objects.active = rootobj
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, file), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True)
    print('exported', file)

# ---------------------------------------------------------------- the collapsed ceiling
def ceiling_collapse(sc, at=(0, 0, 0)):
    clear(sc, 'Collapse'); g = root(sc, 'Collapse'); g.location = at
    con = mat('Rubble_Concrete', srgb('#8f8b84'), 0.95); con2 = mat('Rubble_ConcreteDark', srgb('#6c6862'), 0.95)
    plaster = mat('Rubble_Plaster', srgb('#e4e0d6'), 0.9); tile = mat('Rubble_CeilingTile', srgb('#efece4'), 0.85)
    grid = mat('Rubble_GridBar', srgb('#d8dbdc'), 0.4, 0.6); duct = mat('Rubble_Duct', srgb('#b9c0c3'), 0.35, 0.8)
    rebar = mat('Rubble_Rebar', srgb('#5a3e2e'), 0.7, 0.6); tray = mat('Rubble_CableTray', srgb('#9aa3a6'), 0.45, 0.7)
    cable = [mat('Rubble_CableRed', srgb('#a8322a'), 0.5), mat('Rubble_CableBlue', srgb('#2e5a8a'), 0.5), mat('Rubble_CableGrey', srgb('#3a3d40'), 0.5)]
    lamp = mat('Rubble_Fitting', srgb('#f2f2ee'), 0.4, 0.1); dust = mat('Rubble_Dust', srgb('#bdb8ae'), 1.0)
    rnd = random.Random(7)
    # the heap: a low dust skirt, then broken slab and plaster, biggest pieces in the middle
    skirt = rock('Collapse_skirt', 1.0, dust, (0, 0, 0.0), squash=(1.55, 1.15, 0.16), seed=1, sub=3); link(sc, skirt, g)
    link(sc, rock('Collapse_core', 0.95, con2, (0, 0, 0.25), squash=(1.45, 1.0, 0.9), seed=3, sub=3), g) # (the heap's body)
    for i in range(30):
        x = rnd.uniform(-1.3, 1.3); y = rnd.uniform(-0.9, 0.9); d = 1 - min(1, (abs(x) / 1.45) ** 2 + (abs(y) / 1.05) ** 2) ** 0.5
        r = 0.16 + 0.36 * d + rnd.uniform(0, 0.1)
        link(sc, rock(f'Collapse_rock{i}', r, con if i % 3 else con2, (x, y, r * 0.3 + 0.75 * d), squash=(1.2, 1.0, 0.7), seed=10 + i), g)
    for i in range(10):
        x = rnd.uniform(-1.4, 1.4); y = rnd.uniform(-1.0, 1.0)
        link(sc, rock(f'Collapse_bit{i}', rnd.uniform(0.05, 0.1), con2, (x, y, 0.04), seed=40 + i, sub=1), g)
    # slabs: broken concrete plates leaning on the heap
    for i, (x, y, z, rx, ry, rz, sx, sy) in enumerate([(-0.6, 0.1, 0.62, 0.5, 0.25, 0.3, 1.3, 0.9), (0.55, -0.15, 0.55, -0.4, -0.3, -0.5, 1.1, 0.8), (0.1, 0.45, 0.95, 0.15, 0.6, 1.2, 0.9, 0.7)]):
        link(sc, box(f'Collapse_slab{i}', sx, sy, 0.12, con, at=(x, y, z), rot=(rx, ry, rz), bevel=0.02, segs=1), g)
        for k in range(3): link(sc, rod(f'Collapse_rebar{i}_{k}', (x - sx * 0.45 + k * 0.3, y + sy * 0.5, z), (x - sx * 0.45 + k * 0.3 + 0.05, y + sy * 0.5 + 0.3, z + 0.12 + 0.1 * k), 0.008, rebar, seg=6), g)
    # fallen ceiling tiles (600 mm squares, some snapped), plaster sheets
    for i in range(9):
        x = rnd.uniform(-1.3, 1.3); y = rnd.uniform(-0.9, 0.9); w = rnd.choice([0.6, 0.6, 0.45, 0.3])
        link(sc, box(f'Collapse_tile{i}', w, 0.6, 0.016, tile, at=(x, y, 0.05 + rnd.uniform(0, 0.55)), rot=(rnd.uniform(-0.7, 0.7), rnd.uniform(-0.7, 0.7), rnd.uniform(0, 3.1))), g)
    for i in range(3):
        link(sc, box(f'Collapse_plaster{i}', 1.0, 0.7, 0.012, plaster, at=(rnd.uniform(-0.8, 0.8), rnd.uniform(-0.5, 0.5), 0.5 + rnd.uniform(0, 0.4)), rot=(rnd.uniform(-0.9, 0.9), rnd.uniform(-0.6, 0.6), rnd.uniform(0, 3.1))), g)
    # the bent grid: T-bars snapped and hanging
    for i, (a, b) in enumerate([((-1.4, -0.3, 0.2), (-0.2, -0.5, 1.4)), ((1.3, 0.4, 0.3), (0.3, 0.6, 1.7)), ((-1.0, 0.8, 0.5), (0.9, 0.7, 1.25)), ((0.4, -0.9, 0.1), (1.2, -0.2, 0.9))]):
        link(sc, rod(f'Collapse_grid{i}', a, b, 0.012, grid, seg=6), g)
    # a crushed duct section lying across the heap
    d = cyl('Collapse_duct', 0.2, 1.6, duct, seg=20, z0=-0.8); d.location = (0.2, -0.35, 0.9); d.rotation_euler = (math.radians(80), math.radians(12), math.radians(70)); d.scale = (1, 0.75, 1); link(sc, d, g)
    # a fluorescent fitting hanging by one end, its diffuser cracked
    f = box('Collapse_fitting', 1.22, 0.3, 0.07, lamp, at=(-0.75, -0.55, 1.35), rot=(0.2, math.radians(-55), 0.35), bevel=0.01, segs=1); link(sc, f, g)
    link(sc, rod('Collapse_fitWire', (-1.0, -0.6, 2.6), (-1.22, -0.62, 1.82), 0.005, cable[2], seg=5), g)
    # the cable tray: torn from the slab above, one end still up at 2.6 m, cables spilling out of it
    t = box('Collapse_tray', 0.3, 2.0, 0.06, tray, at=(0.75, 0.1, 1.75), rot=(math.radians(-48), 0, math.radians(8)), bevel=0.005, segs=1); link(sc, t, g)
    for k, cm in enumerate(cable):
        pts = [(0.68 + k * 0.06, 0.85, 2.55), (0.66 + k * 0.07, 0.2, 1.95), (0.6 + k * 0.1, -0.35, 1.3), (0.55 + k * 0.14, -0.7, 0.75 - k * 0.12)]
        for j in range(len(pts) - 1): link(sc, rod(f'Collapse_cable{k}_{j}', pts[j], pts[j + 1], 0.012, cm, seg=6), g)
    link(sc, box('Collapse_bracket', 0.36, 0.08, 0.3, tray, at=(0.75, 0.9, 2.55), bevel=0.004, segs=1), g)
    return g

# ---------------------------------------------------------------- the round reception desk
def round_reception_desk(sc, at=(0, 0, 0)):
    clear(sc, 'RoundDesk'); g = root(sc, 'RoundDesk'); g.location = at
    body = mat('Desk_Body', srgb('#e9e2d2'), 0.55); top = mat('Desk_Top', srgb('#f6f3ec'), 0.35)
    band = mat('Desk_Teal', srgb('#1f8f9a'), 0.45); wood = mat('Desk_Wood', srgb('#a67c52'), 0.6); base = mat('Desk_Plinth', srgb('#3a3d40'), 0.6)
    screen = mat('Desk_Screen', srgb('#16191c'), 0.3, 0.2); glow = mat('Desk_ScreenGlow', srgb('#7fc4d8'), 0.4, 0, emit=srgb('#7fc4d8'), emit_k=1.2)
    ink = mat('Desk_Letters', srgb('#ffffff'), 0.4); chairm = mat('Desk_Chair', srgb('#2f5f6a'), 0.6)
    gap0, gap1 = math.radians(60), math.radians(120) # (the staff opening at the back, +Y)
    a0, a1 = gap1, gap0 + 2 * math.pi
    link(sc, annulus('RoundDesk_plinth', 1.4, 1.74, 0.0, 0.1, a0, a1, base), g)
    link(sc, annulus('RoundDesk_body', 1.42, 1.78, 0.1, 1.02, a0, a1, body), g)
    link(sc, annulus('RoundDesk_band', 1.785, 1.80, 0.62, 0.78, a0 + 0.05, a1 - 0.05, band), g)
    link(sc, annulus('RoundDesk_ledge', 1.5, 1.92, 1.02, 1.1, a0, a1, top), g) # (the raised transaction ledge, overhanging the front)
    link(sc, annulus('RoundDesk_worktop', 0.95, 1.42, 0.72, 0.76, a0, a1, wood), g) # (the staff worktop inside, at desk height)
    # INFORMATION on the front (-Y), following the curve as separate letters
    word = 'INFORMATION'; n = len(word)
    for i, ch in enumerate(word):
        a = -math.pi / 2 + (i - (n - 1) / 2) * 0.105
        p = (1.805 * math.cos(a), 1.805 * math.sin(a), 0.70)
        t = text(f'RoundDesk_L{i}', ch, 0.13, ink, (p[0] * 1.002, p[1] * 1.002, p[2]), rot=(math.radians(90), 0, a + math.pi / 2)); link(sc, t, g)
    # screens and a keyboard on the worktop, facing out over the counter's inner edge; a chair inside
    for k, a in enumerate((math.radians(-90), math.radians(-160), math.radians(-20))):
        c, s = math.cos(a), math.sin(a); r = 1.18
        sc_ = box(f'RoundDesk_mon{k}', 0.52, 0.03, 0.32, screen, at=(r * c, r * s, 0.98), rot=(0, 0, a + math.pi / 2), bevel=0.008, segs=1); link(sc, sc_, g)
        gl = box(f'RoundDesk_monGlow{k}', 0.47, 0.004, 0.27, glow, at=((r - 0.018) * c, (r - 0.018) * s, 0.98), rot=(0, 0, a + math.pi / 2)); link(sc, gl, g)
        link(sc, rod(f'RoundDesk_monStem{k}', ((r + 0.02) * c, (r + 0.02) * s, 0.76), ((r + 0.02) * c, (r + 0.02) * s, 0.84), 0.02, base, seg=8), g)
        link(sc, box(f'RoundDesk_kb{k}', 0.42, 0.14, 0.02, base, at=((r - 0.22) * c, (r - 0.22) * s, 0.77), rot=(0, 0, a + math.pi / 2)), g)
    ch = root(sc, 'RoundDesk_chair'); ch.parent = g; ch.location = (0.0, -0.55, 0)
    link(sc, cyl('RoundDesk_chairBase', 0.28, 0.04, base, seg=16), ch)
    link(sc, rod('RoundDesk_chairStem', (0, 0, 0.04), (0, 0, 0.45), 0.025, base, seg=8), ch)
    link(sc, box('RoundDesk_chairSeat', 0.46, 0.44, 0.08, chairm, at=(0, 0, 0.48), bevel=0.03), ch)
    link(sc, box('RoundDesk_chairBack', 0.44, 0.07, 0.45, chairm, at=(0, 0.22, 0.78), bevel=0.03), ch)
    return g

# ---------------------------------------------------------------- the traction frame
def traction_frame(sc, at=(0, 0, 0)):
    clear(sc, 'Traction'); g = root(sc, 'Traction'); g.location = at
    steel = mat('Traction_Steel', srgb('#c9ced1'), 0.25, 0.9); clamp = mat('Traction_Clamp', srgb('#2b2e31'), 0.5, 0.4)
    rope = mat('Traction_Cord', srgb('#e8dcc0'), 0.8); wt = mat('Traction_Weight', srgb('#4a4f54'), 0.5, 0.6); grip = mat('Traction_Trapeze', srgb('#2f6f9a'), 0.5)
    H = 2.05; Yh, Yf = 1.02, -1.02 # (the bed's head and foot rails: recovery_bed.glb is 2.11 m long, its head at +Y)
    for y in (Yh, Yf):
        link(sc, rod(f'Traction_post{y:+.0f}', (0, y, 0.55), (0, y, H), 0.022, steel), g)
        link(sc, box(f'Traction_clamp{y:+.0f}', 0.12, 0.08, 0.12, clamp, at=(0, y, 0.6), bevel=0.01, segs=1), g)
        link(sc, rod(f'Traction_cross{y:+.0f}', (-0.5, y, 0.62), (0.5, y, 0.62), 0.016, steel), g)
    link(sc, rod('Traction_beam', (0, Yh + 0.05, H), (0, Yf - 0.2, H), 0.024, steel), g)
    for y in (Yh, Yf): link(sc, box(f'Traction_joint{y:+.0f}', 0.08, 0.08, 0.08, clamp, at=(0, y, H), bevel=0.01, segs=1), g)
    # the trapeze over the chest
    yt = 0.45
    link(sc, rod('Traction_chainA', (0, yt, H), (-0.12, yt, 1.62), 0.006, steel, seg=6), g)
    link(sc, rod('Traction_chainB', (0, yt, H), (0.12, yt, 1.62), 0.006, steel, seg=6), g)
    link(sc, rod('Traction_bar', (-0.16, yt, 1.62), (0.16, yt, 1.62), 0.018, grip, seg=10), g)
    # the pulleys at the foot end, the cord down to the weight stack hanging past the foot rail
    for k, z in enumerate((H - 0.06, 0.95)):
        p = cyl(f'Traction_pulley{k}', 0.045, 0.025, clamp, seg=16, z0=-0.0125); p.rotation_euler = (0, math.radians(90), 0); p.location = (0, Yf - 0.18, z); link(sc, p, g)
    link(sc, rod('Traction_cord0', (0, Yf - 0.14, H - 0.06), (0, 0.1, 0.95), 0.004, rope, seg=5), g) # (to the leg's sling)
    link(sc, rod('Traction_cord1', (0, Yf - 0.22, H - 0.06), (0, Yf - 0.22, 0.62), 0.004, rope, seg=5), g)
    for k in range(3): link(sc, cyl(f'Traction_weight{k}', 0.07, 0.035, wt, seg=18, z0=0.5 - k * 0.04 - 0.035), g).location = (0, Yf - 0.22, 0)
    link(sc, box('Traction_sling', 0.2, 0.3, 0.05, mat('Traction_Sling', srgb('#d9e4ef'), 0.8), at=(0, 0.1, 0.92), bevel=0.015), g)
    return g

def build_all(do_export=False):
    sc = scene()
    a = ceiling_collapse(sc, (-6, 6, 0)); b = round_reception_desk(sc, (-2, 6, 0)); c = traction_frame(sc, (2, 6, 0))
    if do_export:
        for ob, f in ((a, 'ceiling_collapse.glb'), (b, 'round_reception_desk.glb'), (c, 'traction_frame.glb')):
            loc = ob.location.copy(); ob.location = (0, 0, 0); bpy.context.view_layer.update()
            export(sc, ob, f); ob.location = loc
    return a, b, c
