# STAND-INS for the user's five painted construction props (2026-10-18). The user's own rebuilt, painted versions (cable
# workbench, paint shelf, tool pegboard, renovation pallet, janitor cabinet) were not found anywhere on this machine; these
# are openly labelled stand-ins (file names standin_*), modelled here so the rooms have them now, to be replaced by the
# user's own files when they turn up (same footprints and facing: front +Y in Blender, +Z glTF; origin on the floor).
#   blender -b --factory-startup --python blender/make_standin_props.py -- <out dir> [<out.blend>]
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

random.seed(5)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = argv[0] if argv else None
OUT_BLEND = argv[1] if len(argv) > 1 else None
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

def mat(name, rgb, rough=0.75, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
WOOD = mat('SI_Wood', (0.45, 0.31, 0.17)); PLY = mat('SI_Plywood', (0.66, 0.52, 0.34)); STEEL = mat('SI_Steel', (0.36, 0.38, 0.40), 0.45, 0.8)
GREY = mat('SI_PaintedGrey', (0.30, 0.33, 0.35), 0.6); BLUE = mat('SI_PaintedBlue', (0.13, 0.24, 0.40), 0.55); ORANGE = mat('SI_Orange', (0.78, 0.30, 0.06), 0.6)
CABLE_Y = mat('SI_CableYellow', (0.85, 0.66, 0.08), 0.5); CABLE_K = mat('SI_CableBlack', (0.04, 0.04, 0.04), 0.5); RED = mat('SI_Red', (0.62, 0.08, 0.06), 0.5)
WHITE = mat('SI_PailWhite', (0.84, 0.84, 0.81), 0.4); TEAL = mat('SI_PaintTeal', (0.16, 0.44, 0.46), 0.3); CREAM = mat('SI_PaintCream', (0.86, 0.79, 0.62), 0.3)
BOARD = mat('SI_Pegboard', (0.62, 0.55, 0.42), 0.85); BAG = mat('SI_Sack', (0.55, 0.45, 0.30), 0.95)

def box(bm, c, s, R=None):
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ (R or Matrix.Identity(4)) @ Matrix.Diagonal((*s, 1)), verts=r['verts'])
def cyl(bm, c, r, h, seg=14, R=None):
    q = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ (R or Matrix.Identity(4)), verts=q['verts'])
def make(name, parts):
    bm = bmesh.new(); mats = []
    for m, fn in parts:
        before = set(bm.faces); fn(bm)
        if m not in mats: mats.append(m)
        for f in bm.faces:
            if f not in before: f.material_index = mats.index(m)
    me = bpy.data.meshes.new(name); bm.normal_update(); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o
RX = Matrix.Rotation(math.pi / 2, 4, 'X')

# 1. cable workbench (1.8 x 0.75 m, top 0.9 m): steel legs, a plywood top, a cable drum on it, coils hanging off the side
def wb_frame(bm):
    for x in (-0.82, 0.82):
        for y in (-0.32, 0.32): box(bm, Vector((x, y, 0.44)), (0.05, 0.05, 0.88))
    for y in (-0.32, 0.32): box(bm, Vector((0, y, 0.18)), (1.64, 0.04, 0.04))
def wb_top(bm): box(bm, Vector((0, 0, 0.9)), (1.8, 0.75, 0.04)); box(bm, Vector((0, 0, 0.2)), (1.6, 0.62, 0.02))
def wb_drum(bm):
    for x in (-0.55, -0.25): cyl(bm, Vector((x, 0.02, 1.12)), 0.2, 0.025, 16, Matrix.Rotation(math.pi / 2, 4, 'Y'))
    cyl(bm, Vector((-0.4, 0.02, 1.12)), 0.07, 0.3, 10, Matrix.Rotation(math.pi / 2, 4, 'Y'))
def wb_cable(bm):
    cyl(bm, Vector((-0.4, 0.02, 1.12)), 0.15, 0.27, 16, Matrix.Rotation(math.pi / 2, 4, 'Y'))
    for i in range(3): box(bm, Vector((0.35 + i * 0.03, -0.38, 0.75 - i * 0.12)), (0.02, 0.02, 0.28), Matrix.Rotation(0.3 * i, 4, 'Y'))
def wb_coil(bm):
    cyl(bm, Vector((0.45, 0.1, 0.94)), 0.17, 0.05, 20); cyl(bm, Vector((0.62, -0.2, 0.95)), 0.07, 0.1, 10)
make('standin_cable_workbench', [(STEEL, wb_frame), (PLY, wb_top), (WOOD, wb_drum), (CABLE_Y, wb_cable), (CABLE_K, wb_coil)])

# 2. paint shelf (1.2 x 0.45 m, 1.8 m tall): a steel shelf unit, paint tins and pails on it, drips down the front
def ps_frame(bm):
    for x in (-0.58, 0.58):
        for y in (-0.2, 0.2): box(bm, Vector((x, y, 0.9)), (0.035, 0.035, 1.8))
def ps_shelves(bm):
    for z in (0.12, 0.62, 1.12, 1.62): box(bm, Vector((0, 0, z)), (1.18, 0.42, 0.025))
def tins(bm, mtl_i):
    for k, z in enumerate((0.135, 0.635, 1.135, 1.635)):
        for i in range(4):
            if (i + k) % 3 != mtl_i: continue
            x = -0.42 + i * 0.28; r = 0.1 if k == 0 else 0.08; h = 0.26 if k == 0 else 0.17
            cyl(bm, Vector((x, 0.02, z + h / 2)), r, h, 14)
def drips(bm):
    for x, z, h in ((-0.3, 0.55, 0.2), (0.1, 1.05, 0.15), (0.4, 0.55, 0.3)): box(bm, Vector((x, -0.212, z - h / 2)), (0.03, 0.004, h))
make('standin_paint_shelf', [(GREY, ps_frame), (STEEL, ps_shelves), (WHITE, lambda bm: tins(bm, 0)), (TEAL, lambda bm: tins(bm, 1)), (CREAM, lambda bm: tins(bm, 2)), (TEAL, drips)])

# 3. tool pegboard (wall: 1.2 m wide, 0.9 m tall, origin at its bottom edge on the wall face, front +Y): board, outlines, tools
def pb_board(bm): box(bm, Vector((0, 0.01, 0.45)), (1.2, 0.02, 0.9))
def pb_frame(bm):
    for z in (0.0, 0.9): box(bm, Vector((0, 0.025, z)), (1.24, 0.03, 0.04))
    for x in (-0.61, 0.61): box(bm, Vector((x, 0.025, 0.45)), (0.04, 0.03, 0.94))
def pb_tools(bm):  # wrenches, a saw blade's handle, hammers: steel parts
    for i in range(4): box(bm, Vector((-0.45 + i * 0.08, 0.04, 0.62)), (0.025, 0.012, 0.22 + i * 0.03))
    box(bm, Vector((0.25, 0.04, 0.35)), (0.42, 0.006, 0.12))
    for x in (0.15, 0.32): box(bm, Vector((x, 0.045, 0.74)), (0.1, 0.03, 0.035))
def pb_handles(bm):
    for x in (0.15, 0.32): box(bm, Vector((x, 0.04, 0.63)), (0.025, 0.025, 0.2))
    box(bm, Vector((0.49, 0.04, 0.35)), (0.08, 0.025, 0.1))
    for i in range(3): box(bm, Vector((-0.1 + i * 0.06, 0.04, 0.3)), (0.02, 0.02, 0.16))
make('standin_tool_pegboard', [(BOARD, pb_board), (WOOD, pb_frame), (STEEL, pb_tools), (RED, pb_handles)])

# 4. renovation pallet (1.2 x 1.0 m): a pallet stacked with bagged material and cut timber, a strap over it
def rp_pallet(bm):
    for x in (-0.5, 0.0, 0.5): box(bm, Vector((x, 0, 0.07)), (0.1, 1.0, 0.09))
    for i in range(7): box(bm, Vector((0, -0.45 + i * 0.15, 0.135)), (1.2, 0.1, 0.022))
def rp_bags(bm):
    for k in range(2):
        for i in range(2):
            for j in range(2):
                box(bm, Vector((-0.28 + i * 0.56 + random.uniform(-0.02, 0.02), -0.22 + j * 0.44, 0.22 + k * 0.17)), (0.54, 0.42, 0.16), Matrix.Rotation(random.uniform(-0.05, 0.05), 4, 'Z'))
def rp_timber(bm):
    for i in range(5): box(bm, Vector((0.0, -0.25 + i * 0.12, 0.6)), (1.25, 0.09, 0.045))
def rp_strap(bm): box(bm, Vector((0.3, 0, 0.42)), (0.04, 1.02, 0.42))
make('standin_renovation_pallet', [(WOOD, rp_pallet), (BAG, rp_bags), (PLY, rp_timber), (ORANGE, rp_strap)])

# 5. janitor cabinet (0.9 x 0.5 m, 1.9 m tall): a painted steel cabinet, two doors (one ajar), handles, a vent, a label
def jc_body(bm):
    box(bm, Vector((0, 0, 0.95)), (0.9, 0.5, 1.9))
def jc_doors(bm):
    box(bm, Vector((-0.225, -0.26, 0.97)), (0.43, 0.02, 1.78))
    box(bm, Vector((0.36, -0.42, 0.97)), (0.43, 0.02, 1.78), Matrix.Rotation(-0.6, 4, 'Z'))  # (ajar)
def jc_metal(bm):
    box(bm, Vector((-0.04, -0.28, 1.0)), (0.02, 0.025, 0.2)); box(bm, Vector((0.17, -0.31, 1.0)), (0.02, 0.025, 0.2))
    for i in range(4): box(bm, Vector((-0.225, -0.272, 1.65 + i * 0.03)), (0.25, 0.006, 0.012))
def jc_inside(bm):  # what shows through the open door: a mop bucket shelf, bottles
    box(bm, Vector((0.2, 0.0, 0.6)), (0.4, 0.42, 0.02)); box(bm, Vector((0.2, 0.0, 1.2)), (0.4, 0.42, 0.02))
    for i in range(3): cyl(bm, Vector((0.08 + i * 0.12, -0.05, 1.32)), 0.04, 0.22, 10)
make('standin_janitor_cabinet', [(BLUE, jc_body), (BLUE, jc_doors), (STEEL, jc_metal), (WHITE, jc_inside)])

for o in bpy.data.objects: print('PROP', o.name, len(o.data.polygons), [round(v, 2) for v in o.dimensions])
if OUT_DIR:
    for o in list(bpy.data.objects):
        for q in bpy.context.scene.objects: q.select_set(False)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, o.name + '.glb'), use_selection=True, export_format='GLB', export_yup=True, export_apply=True)
        print('WROTE', o.name)
if OUT_BLEND: bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, copy=True); print('SAVED', OUT_BLEND)
