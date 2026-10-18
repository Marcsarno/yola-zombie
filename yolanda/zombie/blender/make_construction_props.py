# Two construction details for the renovation room (2026-10-18, the user's part 4: "open Blender and actually build the
# missing props or details that would meaningfully improve these rooms"). New pieces, modelled here, not the user's own
# painted construction props (the cable workbench, paint shelf, tool pegboard, renovation pallet and janitor cabinet were
# not found on this machine; they are reported missing, not recreated).
#   blender -b --factory-startup --python blender/make_construction_props.py -- <out dir> [<out.blend>]
# Z-up in Blender, metres; exported Y-up; each prop's origin on the floor at its centre, its front +Y in Blender (+Z glTF).
#  - sawhorse_barrier: two A-frame sawhorses carrying a striped barrier plank (worn safety orange and white), a strip of
#    hazard tape sagging between them
#  - drywall_pallet: a wooden pallet with a stack of plasterboard sheets (one cracked corner hanging), two cement sacks
#    slumped against it, a paint pail with a drip on its lid
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

random.seed(11)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = argv[0] if argv else globals().get('OUT_DIR')
OUT_BLEND = argv[1] if len(argv) > 1 else globals().get('OUT_BLEND')

for o in list(bpy.data.objects):
    if o.name.startswith(('Saw_', 'Pal_', 'Sawhorse', 'DrywallPallet')): bpy.data.objects.remove(o, do_unlink=True)

def mat(name, rgb, rough=0.8, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_WOOD = mat('Con_Wood', (0.47, 0.33, 0.19), 0.85)
M_WOOD2 = mat('Con_WoodPale', (0.62, 0.48, 0.30), 0.85)
M_ORANGE = mat('Con_Orange', (0.80, 0.28, 0.05), 0.6)
M_WHITE = mat('Con_White', (0.86, 0.85, 0.80), 0.6)
M_STEEL = mat('Con_Steel', (0.42, 0.43, 0.44), 0.5, 0.7)
M_TAPE_Y = mat('Con_TapeYellow', (0.88, 0.72, 0.08), 0.5)
M_TAPE_K = mat('Con_TapeBlack', (0.05, 0.05, 0.05), 0.5)
M_BOARD = mat('Con_Plasterboard', (0.66, 0.65, 0.61), 0.95)
M_BOARD_E = mat('Con_PlasterEdge', (0.92, 0.91, 0.88), 0.95)
M_SACK = mat('Con_Sack', (0.55, 0.45, 0.30), 0.95)
M_SACK_P = mat('Con_SackPrint', (0.55, 0.12, 0.09), 0.9)
M_PAIL = mat('Con_Pail', (0.85, 0.85, 0.83), 0.4)
M_PAINT = mat('Con_PaintDrip', (0.22, 0.45, 0.48), 0.3)

def box(bm, c, s, rot=None):
    r = bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(c) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*s, 1))
    bmesh.ops.transform(bm, matrix=M, verts=r['verts'])
    return r['verts']

def make(name, parts):  # parts: [(material, builder(bm))]: one object, one material slot per material
    bm = bmesh.new(); mats = []
    for m, fn in parts:
        before = set(bm.faces); fn(bm)
        if m not in mats: mats.append(m)
        for f in bm.faces:
            if f not in before: f.material_index = mats.index(m)
    me = bpy.data.meshes.new(name); bm.normal_update(); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return o

# ---------------------------------------------------------------- the sawhorse barrier (1.9 m long, 1.0 m tall)
def sawhorse_legs(bm):
    # each stand an A seen from the side: a short top beam across the barrier's depth, two legs splaying out to the front
    # and back from under it (one pair each side of the beam's ends), a brace across each pair at knee height
    for x in (-0.75, 0.75):
        box(bm, Vector((x, 0, 0.8)), (0.09, 0.32, 0.07))
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(bm, Vector((x + sx * 0.05, sy * 0.17, 0.4)), (0.045, 0.045, 0.86), Matrix.Rotation(sy * 0.42, 4, 'X'))
            box(bm, Vector((x + sx * 0.05, 0, 0.3)), (0.03, 0.5, 0.05))
def plank_stripes(bm, material_white):
    # the barrier plank on top: 1.9 x 0.2 x 0.03, standing on edge-ish (tilted 70 deg to face the front), striped diagonally
    n = 9
    for i in range(n):
        x0 = -0.95 + i * (1.9 / n)
        if (i % 2 == 0) != material_white: continue
        box(bm, Vector((x0 + 0.95 / n, 0.0, 0.93)), (1.9 / n, 0.035, 0.22), Matrix.Rotation(-0.15, 4, 'X'))
def tape(bm, black):
    # hazard tape sagging between the beams' front ends, a little below the plank
    seg = 14
    for i in range(seg):
        u0, u1 = i / seg, (i + 1) / seg
        if (i % 2 == 0) != black: continue
        x0, x1 = -0.75 + 1.5 * u0, -0.75 + 1.5 * u1
        z0, z1 = 0.62 - 0.09 * math.sin(math.pi * u0), 0.62 - 0.09 * math.sin(math.pi * u1)
        c = Vector(((x0 + x1) / 2, 0.36, (z0 + z1) / 2)); L = math.hypot(x1 - x0, z1 - z0)
        box(bm, c, (L, 0.004, 0.05), Matrix.Rotation(-math.atan2(z1 - z0, x1 - x0), 4, 'Y'))

saw = make('Sawhorse_Barrier', [(M_WOOD, sawhorse_legs), (M_ORANGE, lambda bm: plank_stripes(bm, False)), (M_WHITE, lambda bm: plank_stripes(bm, True)),
                                 (M_TAPE_Y, lambda bm: tape(bm, False)), (M_TAPE_K, lambda bm: tape(bm, True))])

# ---------------------------------------------------------------- the plasterboard pallet (1.25 x 1.0 m, ~0.9 m tall)
def pallet(bm):
    for x in (-0.55, 0.0, 0.55): box(bm, Vector((x, 0, 0.07)), (0.1, 1.0, 0.09))  # stringers
    for i in range(7): box(bm, Vector((0, -0.45 + i * 0.15, 0.135)), (1.22, 0.1, 0.022))  # deck boards
def pallet_pale(bm):
    for i in range(3): box(bm, Vector((0, -0.45 + i * 0.45, 0.012)), (1.22, 0.1, 0.022))  # bottom boards
def boards(bm):
    z = 0.15
    for i in range(14):
        t = 0.0125; jx, jy = random.uniform(-0.03, 0.03), random.uniform(-0.02, 0.02)
        box(bm, Vector((jx, jy, z + t / 2)), (1.2, 0.9, t), Matrix.Rotation(random.uniform(-0.012, 0.012), 4, 'Z'))
        z += t + 0.001
    # the top sheet's corner, cracked and hanging over the edge
    box(bm, Vector((0.62, 0.38, z - 0.02)), (0.22, 0.2, 0.0125), Matrix.Rotation(0.5, 4, 'Y'))
def board_edges(bm):  # the paper-wrapped long edges, a lighter line on each sheet
    z = 0.15
    for i in range(14):
        box(bm, Vector((0, 0.452, z + 0.006)), (1.2, 0.006, 0.011)); box(bm, Vector((0, -0.452, z + 0.006)), (1.2, 0.006, 0.011))
        z += 0.0135
def sacks(bm):
    for k, (x, y, rz, lean) in enumerate(((-0.35, -0.68, 0.2, 0.55), (0.25, -0.66, -0.15, 0.45))):
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']:
            v.co.x *= 0.62; v.co.y *= 0.16; v.co.z *= 0.42
            v.co.y += 0.04 * (1 - abs(v.co.x) / 0.31) * (1 if v.co.y > 0 else -1)  # (a sack bulges)
        M = Matrix.Translation(Vector((x, y, 0.2))) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(-lean, 4, 'X')
        bmesh.ops.transform(bm, matrix=M, verts=r['verts'])
def sack_print(bm):
    for x, y, rz, lean in ((-0.35, -0.68, 0.2, 0.55), (0.25, -0.66, -0.15, 0.45)):
        M = Matrix.Translation(Vector((x, y, 0.2))) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(-lean, 4, 'X')
        v = box(bm, Vector((0, -0.12, 0.02)), (0.3, 0.004, 0.14)); bmesh.ops.transform(bm, matrix=M, verts=v)
def pail(bm):
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.13, radius2=0.15, depth=0.3)
    bmesh.ops.translate(bm, vec=Vector((0.48, 0.62, 0.15)), verts=r['verts'])
def pail_drip(bm):
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.155, radius2=0.155, depth=0.012)
    bmesh.ops.translate(bm, vec=Vector((0.48, 0.62, 0.306)), verts=r['verts'])
    box(bm, Vector((0.48 + 0.152, 0.62, 0.22)), (0.006, 0.05, 0.16))

pal = make('DrywallPallet', [(M_WOOD, pallet), (M_WOOD2, pallet_pale), (M_BOARD, boards), (M_BOARD_E, board_edges), (M_SACK, sacks), (M_SACK_P, sack_print), (M_PAIL, pail), (M_PAINT, pail_drip)])
pal.location.x = 2.4
for o in (saw, pal): print('PROP', o.name, len(o.data.polygons), 'faces', [round(v, 2) for v in o.dimensions])

if OUT_DIR:
    for o, fn in ((saw, 'sawhorse_barrier.glb'), (pal, 'drywall_pallet.glb')):
        loc = o.location.copy(); o.location = (0, 0, 0)
        for q in bpy.context.view_layer.objects: q.select_set(False)
        o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, fn), use_selection=True, export_format='GLB', export_yup=True, export_apply=True)
        o.location = loc
        print('WROTE', fn)
if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, copy=True)
    print('SAVED', OUT_BLEND)
