# The gap props for Floors 6 and 5 (2026-10-18, FLOORS_6_5_LAYOUT_PROPOSAL.html, approved by the user): things a hospital floor
# needs that no supplied pack has. Built in the user's live Blender (they asked to see Blender open for any new asset), in the
# Outbreak palette (ivory, teal, navy, satin metal). Front faces -Y in Blender (+Z in glTF, toward the game camera at rot 0);
# origin on the floor at the footprint centre; wall pieces have their back on the wall plane (+Y side), bottom at z 0.
#   live:  exec(open(path).read(), {'ARGS': [out_dir, out_blend]})        headless:  blender -b --python <this> -- <out dir> [<out.blend>]
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

random.seed(11)
try:
    argv = ARGS  # (set when exec'd in the live session)
except NameError:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = argv[0] if argv else None
OUT_BLEND = argv[1] if len(argv) > 1 else None

COL = bpy.data.collections.get('WardGapProps') or bpy.data.collections.new('WardGapProps')
if COL.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(COL)
for o in list(COL.objects): bpy.data.objects.remove(o, do_unlink=True)

def mat(name, rgb, rough=0.6, metal=0.0, alpha=1.0, emit=None, strength=2.0, double=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        if hasattr(m, 'surface_render_method'): m.surface_render_method = 'BLENDED'
        else: m.blend_method = 'BLEND'
    if emit:
        k = 'Emission Color' if 'Emission Color' in b.inputs else 'Emission'
        b.inputs[k].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = strength
    m.use_backface_culling = not double
    return m
IVORY = mat('WG_Ivory', (0.86, 0.84, 0.78), 0.55); TEAL = mat('WG_Teal', (0.10, 0.42, 0.44), 0.5); NAVY = mat('WG_Navy', (0.09, 0.15, 0.28), 0.5)
STEEL = mat('WG_Steel', (0.62, 0.64, 0.66), 0.35, 0.85); DARK = mat('WG_DarkSteel', (0.20, 0.21, 0.23), 0.45, 0.6); RUBBER = mat('WG_Rubber', (0.05, 0.05, 0.05), 0.85)
GLASS = mat('WG_Glass', (0.70, 0.85, 0.90), 0.05, 0.0, alpha=0.28); INTERIOR = mat('WG_FridgeInterior', (0.80, 0.86, 0.88), 0.4)
WHITE = mat('WG_White', (0.93, 0.93, 0.91), 0.45); RED = mat('WG_Red', (0.70, 0.06, 0.05), 0.4); ORANGE = mat('WG_Orange', (0.86, 0.38, 0.05), 0.5)
YELLOW = mat('WG_Yellow', (0.90, 0.72, 0.10), 0.6); BLUE = mat('WG_Blue', (0.15, 0.35, 0.75), 0.5); PURPLE = mat('WG_Purple', (0.45, 0.22, 0.62), 0.5)
MANILA = mat('WG_Manila', (0.82, 0.70, 0.45), 0.8); GREIGE = mat('WG_FilingGreige', (0.66, 0.64, 0.58), 0.45, 0.3)
SCREEN = mat('WG_Screen', (0.05, 0.08, 0.08), 0.3, emit=(0.25, 0.95, 0.75), strength=1.5)
LAMP_AMBER = mat('IntakeLampAmber', (0.9, 0.5, 0.05), 0.3, emit=(1.0, 0.55, 0.05), strength=4.0)   # (the game can swap these two
LAMP_GREEN = mat('IntakeLampGreen', (0.05, 0.25, 0.08), 0.3, emit=(0.05, 0.3, 0.08), strength=0.3)  #  when the case is secured)
SHEET = mat('WG_DustSheet', (0.80, 0.77, 0.70), 0.95, double=True); GALV = mat('WG_Galvanised', (0.72, 0.74, 0.75), 0.4, 0.8)
BOARD = mat('WG_Plasterboard', (0.80, 0.80, 0.78), 0.9); ALU = mat('WG_Aluminium', (0.78, 0.80, 0.82), 0.35, 0.9); PLY = mat('WG_Plywood', (0.66, 0.52, 0.34), 0.8)
LAMINATE = mat('WG_Laminate', (0.72, 0.60, 0.44), 0.5); CREAM = mat('WG_Cream', (0.90, 0.86, 0.74), 0.6); MAROON = mat('WG_Maroon', (0.40, 0.08, 0.10), 0.7)
GREENG = mat('WG_GownGreen', (0.45, 0.70, 0.55), 0.85)

def box(bm, c, s, R=None):
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(c)) @ (R or Matrix.Identity(4)) @ Matrix.Diagonal((*s, 1)), verts=r['verts'])
def cyl(bm, c, r, h, seg=16, R=None, r2=None):
    q = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(c)) @ (R or Matrix.Identity(4)), verts=q['verts'])
def tube(bm, a, b, r, seg=10):  # a cylinder between two points
    a, b = Vector(a), Vector(b); d = b - a
    R = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    cyl(bm, (a + b) / 2, r, d.length, seg, R)
RX, RY, RZ = (lambda t: Matrix.Rotation(t, 4, 'X')), (lambda t: Matrix.Rotation(t, 4, 'Y')), (lambda t: Matrix.Rotation(t, 4, 'Z'))

def make(name, parts, bevel=0.006, smooth=False, loc=(0, 0)):
    bm = bmesh.new(); mats = []
    for m, fn in parts:
        before = set(bm.faces); fn(bm)
        if m not in mats: mats.append(m)
        for f in bm.faces:
            if f not in before: f.material_index = mats.index(m)
    me = bpy.data.meshes.new(name); bm.normal_update(); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    if smooth: me.shade_smooth()
    o = bpy.data.objects.new(name, me); COL.objects.link(o)
    if bevel:
        bv = o.modifiers.new('Bevel', 'BEVEL'); bv.width = bevel; bv.segments = 2; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(40)
    o.location = (loc[0], loc[1], 0)
    return o

X = 0.0  # each prop is built at the origin and spread out along X afterwards for viewing
PROPS = []

# ---------------------------------------------------------------------------------------------- 1. specimen fridge (0.75 x 0.70 x 1.90)
def fr_shell(bm):
    w, d, h = 0.75, 0.70, 1.90
    box(bm, (0, d / 2 - 0.02, h / 2), (w, 0.04, h))                 # back
    for sx in (-1, 1): box(bm, (sx * (w / 2 - 0.02), 0, h / 2), (0.04, d, h))  # sides
    box(bm, (0, 0, h - 0.06), (w, d, 0.12))                           # top (the display panel housing)
    box(bm, (0, 0, 0.08), (w, d, 0.16))                               # plinth
def fr_frame(bm):  # the door frame round the glass
    w, h = 0.75, 1.90; y = -0.35
    box(bm, (0, y, h - 0.15), (w, 0.04, 0.06)); box(bm, (0, y, 0.19), (w, 0.04, 0.06))
    for sx in (-1, 1): box(bm, (sx * (w / 2 - 0.03), y, 1.02), (0.06, 0.04, 1.62))
def fr_glass(bm): box(bm, (0, -0.35, 1.02), (0.63, 0.012, 1.58))
def fr_inside(bm):
    box(bm, (0, 0.32, 1.02), (0.66, 0.01, 1.62))
    for z in (0.32, 0.70, 1.08, 1.46): box(bm, (0, 0.0, z), (0.66, 0.58, 0.012))
def fr_dark(bm):
    box(bm, (0, -0.352, 0.08), (0.75, 0.01, 0.14))                    # kick plate
    box(bm, (0.30, -0.39, 1.05), (0.025, 0.04, 0.55))                 # handle
    box(bm, (-0.2, -0.351, 1.83), (0.18, 0.006, 0.06))                # the display surround
def fr_screen(bm): box(bm, (-0.2, -0.355, 1.83), (0.14, 0.004, 0.04))
def fr_racks(bm, mtl):
    for k, z in enumerate((0.33, 0.71, 1.09, 1.47)):
        for i in range(4):
            if (i + k) % 3 != mtl: continue
            x = -0.24 + i * 0.16
            box(bm, (x, 0.05 + 0.05 * ((i + k) % 2), z + 0.05), (0.13, 0.30, 0.09))  # a rack / bagged specimens
            for t in range(3): cyl(bm, (x - 0.04 + t * 0.04, -0.06, z + 0.13), 0.012, 0.07, 8)  # tube caps poking up
PROPS.append(make('specimen_fridge', [(WHITE, fr_shell), (STEEL, fr_frame), (INTERIOR, fr_inside), (DARK, fr_dark), (SCREEN, fr_screen),
    (RED, lambda bm: fr_racks(bm, 0)), (PURPLE, lambda bm: fr_racks(bm, 1)), (BLUE, lambda bm: fr_racks(bm, 2)), (GLASS, fr_glass)]))

# ---------------------------------------------------------------------------------------------- 2. intake preservation station (1.0 x 0.7 x 1.25 top)
def is_body(bm):
    box(bm, (0, 0.02, 0.6), (1.0, 0.66, 1.08))                        # the cabinet
    box(bm, (0, 0.30, 1.40), (1.0, 0.10, 0.30))                       # the back upstand with the status panel
def is_top(bm):
    box(bm, (0, 0.0, 1.20), (1.04, 0.70, 0.04))                       # worktop (top at 1.22-1.25 with the rim)
    for sx in (-1, 1): box(bm, (sx * 0.505, -0.03, 1.235), (0.03, 0.56, 0.03))
    box(bm, (0, -0.335, 1.235), (1.04, 0.03, 0.03))
def is_doors(bm):
    for sx in (-1, 1): box(bm, (sx * 0.245, -0.315, 0.58), (0.47, 0.02, 0.92))
def is_dark(bm):
    box(bm, (0, -0.02, 1.225), (0.80, 0.46, 0.01))                    # the tray mat where the case sits
    for sx in (-1, 1): box(bm, (sx * 0.05, -0.335, 0.70), (0.02, 0.03, 0.28))  # handles
    box(bm, (0.30, 0.245, 1.42), (0.30, 0.012, 0.18))                 # status panel
    box(bm, (0, 0.02, 0.03), (1.0, 0.66, 0.06))                       # plinth
    box(bm, (-0.25, 0.245, 1.42), (0.30, 0.012, 0.10))                # the label plate surround
def is_teal(bm): box(bm, (-0.25, 0.240, 1.42), (0.26, 0.006, 0.07)); box(bm, (0, -0.33, 1.06), (1.0, 0.012, 0.03))
def is_amber(bm): cyl(bm, (0.24, 0.236, 1.42), 0.035, 0.02, 14, RX(math.pi / 2))
def is_green(bm): cyl(bm, (0.36, 0.236, 1.42), 0.035, 0.02, 14, RX(math.pi / 2))
PROPS.append(make('intake_station', [(STEEL, is_body), (STEEL, is_top), (ALU, is_doors), (DARK, is_dark), (TEAL, is_teal), (LAMP_AMBER, is_amber), (LAMP_GREEN, is_green)]))

# ---------------------------------------------------------------------------------------------- 3. pneumatic tube station (wall, 0.5 x 0.25 x 0.9)
def pt_body(bm):
    box(bm, (0, 0.11, 0.45), (0.50, 0.02, 0.90))                      # back plate on the wall
    box(bm, (0, 0.0, 0.30), (0.44, 0.20, 0.50))                       # housing
def pt_teal(bm): box(bm, (0, -0.101, 0.47), (0.44, 0.006, 0.05))
def pt_dark(bm):
    box(bm, (0, -0.095, 0.30), (0.30, 0.02, 0.26))                    # the send/receive opening
    box(bm, (0.16, -0.103, 0.13), (0.09, 0.006, 0.08))                # keypad
def pt_pipe(bm):
    cyl(bm, (0, 0.03, 0.72), 0.06, 0.40, 16)                          # the pipe up into the ceiling void
    cyl(bm, (0, 0.03, 0.56), 0.075, 0.04, 16)
def pt_carrier(bm): tube(bm, (-0.05, -0.04, 0.22), (0.07, -0.04, 0.22), 0.05, 14)   # a carrier lying in the cradle
def pt_caps(bm):
    cyl(bm, (-0.07, -0.04, 0.22), 0.052, 0.03, 14, RY(math.pi / 2)); cyl(bm, (0.09, -0.04, 0.22), 0.052, 0.03, 14, RY(math.pi / 2))
def pt_lamps(bm):
    for i in range(3): box(bm, (0.13 + i * 0.03, -0.107, 0.14), (0.018, 0.004, 0.018))
PROPS.append(make('pneumatic_tube_station', [(IVORY, pt_body), (TEAL, pt_teal), (DARK, pt_dark), (STEEL, pt_pipe), (GLASS, pt_carrier), (RED, pt_caps), (SCREEN, pt_lamps)]))

# ---------------------------------------------------------------------------------------------- 4. courier coolers (0.6 x 0.42 x 0.95)
CO = [((0, 0, 0.17), (0.60, 0.42, 0.34), 0), ((0.01, 0.0, 0.50), (0.56, 0.40, 0.32), 0.06), ((-0.02, 0.01, 0.80), (0.48, 0.34, 0.28), -0.08)]
def co_body(bm):
    for c, s, r in CO: box(bm, (c[0], c[1], c[2] - 0.02), (s[0], s[1], s[2] - 0.04), RZ(r))
def co_lid(bm):
    for c, s, r in CO: box(bm, (c[0], c[1], c[2] + s[2] / 2 - 0.02), (s[0] + 0.01, s[1] + 0.01, 0.04), RZ(r))
def co_labels(bm):  # a white diamond (UN3373) and a label on each front
    for c, s, r in CO:
        R = RZ(r); f = R @ Matrix.Translation((0, -s[1] / 2 - 0.004, 0))
        m = Matrix.Translation(Vector(c)) @ f @ Matrix.Translation((-s[0] * 0.22, 0, 0)) @ RY(math.pi / 4) @ Matrix.Diagonal((0.10, 0.004, 0.10, 1))
        q = bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.transform(bm, matrix=m, verts=q['verts'])
        m = Matrix.Translation(Vector(c)) @ f @ Matrix.Translation((s[0] * 0.16, 0, 0.01)) @ Matrix.Diagonal((0.16, 0.004, 0.09, 1))
        q = bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.transform(bm, matrix=m, verts=q['verts'])
def co_handles(bm):
    for c, s, r in CO:
        for sx in (-1, 1): box(bm, (c[0] + sx * (s[0] / 2 + 0.01), c[1], c[2] + 0.04), (0.02, 0.12, 0.03), RZ(r))
PROPS.append(make('courier_coolers', [(WHITE, co_body), (BLUE, co_lid), (CREAM, co_labels), (DARK, co_handles)]))

# ---------------------------------------------------------------------------------------------- 5. filing cabinet (0.47 x 0.62 x 1.32, a drawer out)
def fc_body(bm):
    box(bm, (0, 0.02, 0.66), (0.47, 0.58, 1.32))
def fc_fronts(bm):
    for i in range(4):
        z = 0.17 + i * 0.32; out = 0.25 if i == 2 else 0.0
        box(bm, (0, -0.285 - out, z), (0.45, 0.03, 0.30))
        if out: box(bm, (0, -0.12 - out / 2, z - 0.04), (0.41, 0.36 + out, 0.18))  # the open drawer's box
def fc_dark(bm):
    for i in range(4):
        z = 0.17 + i * 0.32; out = 0.25 if i == 2 else 0.0
        box(bm, (0, -0.305 - out, z + 0.05), (0.16, 0.02, 0.025)); box(bm, (0, -0.302 - out, z + 0.10), (0.09, 0.008, 0.04))
def fc_folders(bm):
    for k in range(9): box(bm, (-0.16 + k * 0.04, -0.20, 0.17 + 2 * 0.32 + 0.05 + (k % 3) * 0.01), (0.012, 0.30, 0.22), RX(random.uniform(-0.12, 0.12)))
def fc_tabs(bm):
    for k in (1, 4, 7): box(bm, (-0.16 + k * 0.04, -0.27, 0.17 + 2 * 0.32 + 0.17), (0.014, 0.05, 0.03))
PROPS.append(make('filing_cabinet', [(GREIGE, fc_body), (GREIGE, fc_fronts), (DARK, fc_dark), (MANILA, fc_folders), (RED, fc_tabs)]))

# ---------------------------------------------------------------------------------------------- 6. PPE donning trolley (0.9 x 0.55 x 1.3)
def pp_frame(bm):
    for sx in (-1, 1):
        for sy in (-1, 1): tube(bm, (sx * 0.42, sy * 0.24, 0.08), (sx * 0.42, sy * 0.24, 1.08), 0.014, 8)
    for z in (0.15, 0.55, 0.95):
        box(bm, (0, 0, z), (0.86, 0.50, 0.012))
        for sy in (-1, 1): tube(bm, (-0.42, sy * 0.24, z + 0.06), (0.42, sy * 0.24, z + 0.06), 0.006, 6)
    tube(bm, (-0.42, 0.24, 1.25), (0.42, 0.24, 1.25), 0.012, 8)
    for sx in (-1, 1): tube(bm, (sx * 0.42, 0.24, 1.08), (sx * 0.42, 0.24, 1.25), 0.012, 8)
def pp_wheels(bm):
    for sx in (-1, 1):
        for sy in (-1, 1): cyl(bm, (sx * 0.40, sy * 0.22, 0.04), 0.04, 0.03, 12, RY(math.pi / 2))
def pp_gloves(bm, m):
    for i in range(4):
        if i % 2 != m: continue
        box(bm, (-0.30 + i * 0.2, -0.02, 1.01), (0.18, 0.11, 0.10), RZ(random.uniform(-0.1, 0.1)))
def pp_gowns(bm):
    for i in range(3): box(bm, (-0.26 + i * 0.26, 0.0, 0.61 + 0.01 * i), (0.24, 0.36, 0.10))
def pp_masks(bm):
    for i in range(4): box(bm, (-0.30 + i * 0.2, 0.0, 0.21), (0.17, 0.12, 0.10))
def pp_apron(bm): cyl(bm, (0, 0.24, 1.18), 0.06, 0.70, 18, RY(math.pi / 2))
def pp_visor(bm): box(bm, (0.32, 0.29, 1.08), (0.22, 0.01, 0.16), RX(0.2))
PROPS.append(make('ppe_trolley', [(STEEL, pp_frame), (RUBBER, pp_wheels), (BLUE, lambda bm: pp_gloves(bm, 0)), (PURPLE, lambda bm: pp_gloves(bm, 1)),
    (YELLOW, pp_gowns), (WHITE, pp_masks), (WHITE, pp_apron), (GLASS, pp_visor)], bevel=0.003))

# ---------------------------------------------------------------------------------------------- 7. mobile X-ray (0.8 x 1.3 x 1.8; the arm reaches forward, -Y)
def xr_base(bm):
    box(bm, (0, 0.25, 0.32), (0.66, 0.80, 0.46))                      # the cart body
    box(bm, (0, 0.25, 0.58), (0.60, 0.60, 0.06))                      # its top
def xr_teal(bm): box(bm, (0, 0.25, 0.42), (0.67, 0.81, 0.06))
def xr_dark(bm):
    for sx in (-1, 1):
        for y in (-0.08, 0.58): cyl(bm, (sx * 0.30, y, 0.08), 0.08, 0.06, 16, RY(math.pi / 2))
    box(bm, (0, 0.60, 0.75), (0.30, 0.04, 0.22), RX(-0.4))            # the console screen housing
def xr_screen(bm): box(bm, (0, 0.585, 0.755), (0.24, 0.006, 0.16), RX(-0.4))
def xr_steel(bm):
    tube(bm, (-0.28, 0.66, 0.95), (0.28, 0.66, 0.95), 0.018, 10)      # push handle
    for sx in (-1, 1): tube(bm, (sx * 0.28, 0.66, 0.62), (sx * 0.28, 0.66, 0.95), 0.016, 8)
def xr_column(bm):
    box(bm, (0, 0.05, 1.12), (0.18, 0.18, 1.12))                      # column
    box(bm, (0, -0.25, 1.62), (0.12, 0.70, 0.12))                     # the arm
    box(bm, (0, -0.58, 1.48), (0.30, 0.26, 0.26))                     # tube head
def xr_coll(bm): box(bm, (0, -0.58, 1.30), (0.20, 0.20, 0.12))       # collimator
def xr_warn(bm): box(bm, (0, -0.711, 1.50), (0.10, 0.004, 0.08))
PROPS.append(make('mobile_xray', [(IVORY, xr_base), (TEAL, xr_teal), (DARK, xr_dark), (SCREEN, xr_screen), (STEEL, xr_steel), (IVORY, xr_column), (DARK, xr_coll), (YELLOW, xr_warn)]))

# ---------------------------------------------------------------------------------------------- 8. lead apron rack (wall, 0.9 x 0.2 x 1.0)
def la_rail(bm):
    box(bm, (0, 0.09, 0.93), (0.90, 0.02, 0.10)); tube(bm, (-0.42, 0.0, 0.93), (0.42, 0.0, 0.93), 0.012, 8)
    for i in range(3): tube(bm, (-0.28 + i * 0.28, 0.08, 0.93), (-0.28 + i * 0.28, -0.04, 0.93), 0.01, 6)
def la_apron(bm, i):
    x = -0.28 + i * 0.28
    box(bm, (x, -0.03, 0.55), (0.30, 0.035, 0.72)); box(bm, (x, -0.03, 0.90), (0.14, 0.03, 0.08))
LAC = [NAVY, MAROON, TEAL]
PROPS.append(make('lead_apron_rack', [(STEEL, la_rail)] + [(LAC[i], (lambda bm, i=i: la_apron(bm, i))) for i in range(3)], bevel=0.008))

# ---------------------------------------------------------------------------------------------- 9. fire extinguisher point (wall, 0.3 x 0.18 x 0.8)
def fe_red(bm):
    cyl(bm, (0, -0.02, 0.25), 0.075, 0.46, 18); cyl(bm, (0, -0.02, 0.485), 0.06, 0.03, 18, r2=0.04)
    box(bm, (0, 0.08, 0.70), (0.20, 0.012, 0.20))                     # the fire-point sign
def fe_dark(bm):
    cyl(bm, (0, -0.02, 0.53), 0.02, 0.06, 10); box(bm, (0.02, -0.02, 0.57), (0.10, 0.02, 0.015))
    tube(bm, (0.03, -0.02, 0.54), (0.09, -0.07, 0.40), 0.01, 6); tube(bm, (0.09, -0.07, 0.40), (0.08, -0.08, 0.18), 0.01, 6)
    box(bm, (0, 0.06, 0.30), (0.12, 0.03, 0.04)); box(bm, (0, 0.04, 0.30), (0.04, 0.03, 0.30))   # bracket
def fe_white(bm):
    box(bm, (0, 0.072, 0.70), (0.09, 0.006, 0.11)); box(bm, (-0.05, 0.072, 0.66), (0.04, 0.006, 0.04))
    box(bm, (0, -0.096, 0.28), (0.07, 0.004, 0.10))                   # the label band on the body
PROPS.append(make('fire_extinguisher', [(RED, fe_red), (DARK, fe_dark), (WHITE, fe_white)], bevel=0.004))

# ---------------------------------------------------------------------------------------------- 10. dust-sheeted furniture (a draped sheet over hidden shapes)
def heightfield(shapes):
    def h(x, y):
        v = 0.0
        for (cx, cy, sx, sy, sz) in shapes:
            if abs(x - cx) <= sx / 2 and abs(y - cy) <= sy / 2: v = max(v, sz)
        return v
    return h
def draped(name, size, shapes, nx=60, ny=46):
    # a sheet thrown over the shapes: flat-ish on their tops with soft folds, falling almost straight down their sides,
    # pooling a little on the floor; nothing beyond a short skirt (so its footprint stays the furniture's)
    W, D = size[0] + 0.36, size[1] + 0.36
    def near(x, y):  # (height, distance outside) of the nearest shape
        best = (0.0, 9.0)
        for (cx, cy, sx, sy, sz) in shapes:
            dx = max(abs(x - cx) - sx / 2, 0.0); dy = max(abs(y - cy) - sy / 2, 0.0); d = math.hypot(dx, dy)
            if d < best[1] - 1e-6 or (abs(d - best[1]) < 1e-6 and sz > best[0]): best = (sz, d)
        return best
    top = heightfield(shapes)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=nx, y_segments=ny, size=0.5)
    for v in bm.verts: v.co.x *= W; v.co.y *= D
    drop = []
    for v in bm.verts:
        x, y = v.co.x, v.co.y; h0 = top(x, y)
        if h0 > 0:
            # sag where a lower shape meets a taller one, folds across the top
            z = h0 + 0.02 + 0.015 * math.sin(x * 9.0 + y * 4.0) + 0.01 * math.sin(y * 13.0)
        else:
            hn, d = near(x, y)
            if d < 0.10: z = hn * (1.0 - (d / 0.10) ** 3) + 0.02            # over the edge and down the side
            elif d < 0.17: z = 0.02 + 0.03 * (1 - (d - 0.10) / 0.07)          # the pooled hem
            else: z = 0.0; drop.append(v)
            v.co.x += 0.025 * math.sin(y * 17.0) * min(1, d / 0.1); v.co.y += 0.025 * math.sin(x * 15.0) * min(1, d / 0.1)  # side folds
        v.co.z = max(0.006, z)
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(SHEET); me.shade_smooth()
    o = bpy.data.objects.new(name, me); COL.objects.link(o)
    sm = o.modifiers.new('Smooth', 'SMOOTH'); sm.factor = 0.5; sm.iterations = 2
    return o
PROPS.append(draped('dust_sheet_furniture', (1.6, 1.0), [(-0.45, 0.05, 0.6, 0.55, 1.05), (0.15, -0.05, 0.55, 0.85, 0.62), (0.55, 0.15, 0.45, 0.5, 0.9), (0.62, -0.2, 0.3, 0.3, 0.45)]))
PROPS.append(draped('dust_sheet_small', (1.2, 0.8), [(-0.25, 0.0, 0.5, 0.5, 0.85), (0.3, 0.05, 0.45, 0.55, 0.5), (0.35, 0.22, 0.42, 0.12, 0.92)], nx=36, ny=28))

# ---------------------------------------------------------------------------------------------- 11. metal stud frame (3.6 long along Y x 0.12 x 2.6)
def sw_studs(bm):
    L, H = 3.6, 2.6
    for i in range(7): box(bm, (0, -L / 2 + 0.05 + i * 0.583, H / 2), (0.09, 0.05, H - 0.08))
    box(bm, (0, 0, 0.02), (0.10, L, 0.04)); box(bm, (0, 0, H - 0.02), (0.10, L, 0.04))
    box(bm, (0, 0, 1.25), (0.10, L, 0.03))                            # a noggin row
def sw_board(bm): box(bm, (0.058, -0.6, 1.2), (0.013, 1.2, 2.4))    # one board up on the bay side
def sw_tape(bm): box(bm, (0.066, -1.2, 1.2), (0.004, 0.06, 2.4))
PROPS.append(make('stud_wall_frame', [(GALV, sw_studs), (BOARD, sw_board), (CREAM, sw_tape)], bevel=0.003))

# ---------------------------------------------------------------------------------------------- 12. mobile scaffold tower (1.8 x 0.8 x 2.4)
def sc_frame(bm):
    for sx in (-1, 1):
        for sy in (-1, 1): tube(bm, (sx * 0.85, sy * 0.36, 0.12), (sx * 0.85, sy * 0.36, 2.40), 0.024, 10)
        for z in (0.35, 0.65, 0.95, 1.25, 1.55, 1.85, 2.15): tube(bm, (sx * 0.85, -0.36, z), (sx * 0.85, 0.36, z), 0.016, 8)  # end-frame rungs
    for sy in (-1, 1):
        tube(bm, (-0.85, sy * 0.36, 0.30), (0.85, sy * 0.36, 1.35), 0.016, 8)    # diagonal braces
        for z in (1.90, 2.38): tube(bm, (-0.85, sy * 0.36, z), (0.85, sy * 0.36, z), 0.018, 8)  # guard rails
def sc_deck(bm):
    box(bm, (-0.25, 0, 1.40), (1.25, 0.70, 0.04)); box(bm, (0.6, 0, 1.40), (0.40, 0.70, 0.04))
def sc_toe(bm):
    for sy in (-1, 1): box(bm, (0, sy * 0.36, 1.48), (1.70, 0.02, 0.12))
def sc_wheels(bm):
    for sx in (-1, 1):
        for sy in (-1, 1): cyl(bm, (sx * 0.85, sy * 0.36, 0.06), 0.06, 0.04, 14, RX(math.pi / 2))
PROPS.append(make('scaffold_tower', [(ALU, sc_frame), (PLY, sc_deck), (ORANGE, sc_toe), (RUBBER, sc_wheels)], bevel=0.0))

# ---------------------------------------------------------------------------------------------- 13. over-bed table (0.8 x 0.45 x 0.9)
def ob_base(bm):
    box(bm, (0.30, 0, 0.04), (0.12, 0.44, 0.05)); box(bm, (0.0, 0.17, 0.04), (0.70, 0.08, 0.05))
    box(bm, (0.32, 0.0, 0.45), (0.06, 0.08, 0.80))
def ob_top(bm): box(bm, (0, 0, 0.87), (0.80, 0.42, 0.03))
def ob_edge(bm): box(bm, (0, -0.212, 0.87), (0.80, 0.008, 0.035))
def ob_wheels(bm):
    for x, y in ((-0.32, 0.17), (0.32, 0.17), (0.32, -0.19)): cyl(bm, (x, y, 0.025), 0.025, 0.02, 10, RX(math.pi / 2))
def ob_jug(bm): cyl(bm, (-0.22, 0.05, 0.98), 0.055, 0.19, 16, r2=0.045); cyl(bm, (-0.08, -0.04, 0.93), 0.035, 0.09, 12)
def ob_card(bm): box(bm, (0.15, 0.04, 0.93), (0.13, 0.004, 0.09), RX(0.25) @ RZ(0.3)); box(bm, (0.15, 0.08, 0.93), (0.13, 0.004, 0.09), RX(-0.25) @ RZ(0.3))
PROPS.append(make('over_bed_table', [(WHITE, ob_base), (LAMINATE, ob_top), (TEAL, ob_edge), (RUBBER, ob_wheels), (GLASS, ob_jug), (YELLOW, ob_card)], bevel=0.004))

# spread them along X for viewing (exported from the origin)
x = 0.0
for o in PROPS:
    o.location = (x, 0, 0); x += max(o.dimensions.x, 0.5) + 0.6
for o in PROPS: print('PROP', o.name, [round(v, 2) for v in o.dimensions])

if OUT_DIR:
    os.makedirs(OUT_DIR, exist_ok=True)
    for o in PROPS:
        keep = o.location.copy(); o.location = (0, 0, 0)
        for q in bpy.context.view_layer.objects: q.select_set(False)
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, o.name + '.glb'), use_selection=True, export_format='GLB', export_yup=True, export_apply=True)
        o.location = keep
        print('WROTE', o.name)
if OUT_BLEND: bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, copy=True); print('SAVED', OUT_BLEND)
