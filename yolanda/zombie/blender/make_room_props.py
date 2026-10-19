# Room-mechanic props (2026-10-19, combat chat; the user: "Don't forget to use Blender ... if you're gonna build anything,
# like the Flood or MRI stuff"). Built in their own scene ("RoomProps") so the open file's other scenes stay as they are;
# each exported to assets/props/room_mechanics/<name>.glb, metres, the origin at the base centre, the front facing
# Blender -Y (the game's +Z). Material names the game drives at run time: MRI_Glow (the bore's ring, lit while the magnet
# is alive), Panel_LampGreen / Panel_LampRed (the flood panel ready / spent), Button_Red (the magnet stop, lit once clear).
#   o2_cylinder   a medical oxygen cylinder (green body, white shoulder, valve, regulator and gauge), 0.95 m
#   o2_trolley    a two-wheeled cylinder trolley, its handle at 1.08 m on its post (the drip-stand hold), the cylinder
#                 leaning back in its cradle behind the post (-Y here: the game's +Z)
#   flood_panel   an electrical distribution box on a strut stand, its door with the hazard sign, lamps, a breaker handle
#                 and a torn cable hanging into the water
#   mri_scanner   the scanner: its gantry with the bore (the glowing ring round it), side covers, the patient table out front
#   magnet_stop   the emergency magnet stop: a striped post, a box, a red mushroom button under a hinged guard
import bpy, bmesh, math, os
from mathutils import Vector

OUT = r'C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie\assets\props\room_mechanics'
os.makedirs(OUT, exist_ok=True)

def scene():
    sc = bpy.data.scenes.get('RoomProps') or bpy.data.scenes.new('RoomProps')
    bpy.context.window.scene = sc
    return sc

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

def srgb(h):  # '#rrggbb' -> linear
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def clear(sc, prefix):
    for o in list(sc.objects):
        if o.name.startswith(prefix): bpy.data.objects.remove(o, do_unlink=True)

def link(sc, ob, parent=None):
    sc.collection.objects.link(ob)
    if parent: ob.parent = parent
    return ob

def mesh_obj(name, bm, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); me.materials.append(m)
    return ob

def cyl(name, r, h, m, seg=32, z0=0.0, r2=None, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, z0 + h / 2))
    return mesh_obj(name, bm, m)

def box(name, sx, sy, sz, m, at=(0, 0, 0), bevel=0.0, segs=2):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segs, affect='EDGES', profile=0.5)
    bmesh.ops.translate(bm, verts=bm.verts, vec=at)
    return mesh_obj(name, bm, m)

def sphere(name, r, m, at=(0, 0, 0), half=False, sz=1.0):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r)
    if half: bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-5], context='VERTS')
    bmesh.ops.scale(bm, vec=(1, 1, sz), verts=bm.verts)
    bmesh.ops.translate(bm, verts=bm.verts, vec=at)
    return mesh_obj(name, bm, m)

def torus(name, R, r, m, at=(0, 0, 0), rot=(0, 0, 0), seg=40):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=12, location=at, rotation=rot)
    ob = bpy.context.active_object; ob.name = name; ob.data.materials.clear(); ob.data.materials.append(m)
    for p in ob.data.polygons: p.use_smooth = True
    bpy.context.scene.collection.objects.unlink(ob) if ob.name in bpy.context.scene.collection.objects else None
    return ob

def text(name, s, size, m, at, rot=(math.radians(90), 0, 0)):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = s; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = 0.0015
    ob = bpy.data.objects.new(name, cu); ob.location = at; ob.rotation_euler = rot; cu.materials.append(m)
    return ob

def root(sc, name):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); return e

def export(sc, rootobj, file):
    for o in sc.objects: o.select_set(False)
    def sel(o):
        if not o.hide_render: o.select_set(True) # (not the bore's cutter)
        for c in o.children: sel(c)
    sel(rootobj); bpy.context.view_layer.objects.active = rootobj
    # text objects become meshes for the export (a copy: the source stays editable)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, file), export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True) # (this scene only: the file's other scenes stay out)
    print('exported', file)

# ---------------------------------------------------------------- the oxygen cylinder
def o2_cylinder(sc, parent=None, at=(0, 0, 0), tilt=0.0, prefix='O2', H=0.95, R=0.095):
    M = dict(body=mat('O2_Body', srgb('#2f7a46'), 0.38, 0.35), collar=mat('O2_Collar', srgb('#e9ece6'), 0.3, 0.15),
             dark=mat('O2_Black', srgb('#1c1e20'), 0.45, 0.6), steel=mat('O2_Steel', srgb('#a3abb0'), 0.28, 0.85),
             label=mat('O2_Label', srgb('#efe6c6'), 0.7), face=mat('O2_GaugeFace', srgb('#f4f4f0'), 0.4), ink=mat('O2_Ink', srgb('#15171a'), 0.6))
    g = bpy.data.objects.new(prefix, None); link(sc, g, parent); g.location = at; g.rotation_euler = (tilt, 0, 0)
    link(sc, cyl(prefix + '_body', R, H * 0.74, M['body'], z0=0.02, cap=False), g)
    link(sc, sphere(prefix + '_foot', R, M['body'], at=(0, 0, 0.02), sz=-0.22, half=True), g)
    link(sc, cyl(prefix + '_label', R * 1.004, H * 0.13, M['label'], z0=H * 0.38, cap=False), g)
    link(sc, text(prefix + '_O2', 'O2', 0.07, M['ink'], (0, -R * 1.02, H * 0.445)), g)
    link(sc, sphere(prefix + '_shoulder', R, M['collar'], at=(0, 0, H * 0.76), half=True, sz=0.7), g)
    link(sc, cyl(prefix + '_neck', R * 0.3, H * 0.06, M['steel'], z0=H * 0.82), g)
    link(sc, box(prefix + '_valve', R * 0.9, R * 0.62, H * 0.07, M['dark'], at=(0, 0, H * 0.905), bevel=0.006), g)
    link(sc, cyl(prefix + '_wheel', R * 0.55, H * 0.022, M['dark'], z0=H * 0.945), g)
    gauge = cyl(prefix + '_gauge', R * 0.38, R * 0.22, M['steel'], z0=-R * 0.11); gauge.rotation_euler = (math.radians(90), 0, 0); gauge.location = (R * 0.25, -R * 0.42, H * 0.905); link(sc, gauge, g)
    dial = cyl(prefix + '_dial', R * 0.32, 0.004, M['face'], z0=-0.002); dial.rotation_euler = (math.radians(90), 0, 0); dial.location = (R * 0.25, -R * 0.53, H * 0.905); link(sc, dial, g)
    needle = box(prefix + '_needle', 0.004, 0.003, R * 0.26, M['ink'], at=(0, 0, R * 0.1)); needle.location = (R * 0.25, -R * 0.545, H * 0.905); needle.rotation_euler = (0, math.radians(35), 0); link(sc, needle, g)
    return g

def rod(name, a, b, r, m, seg=10):  # a cylinder from point a to point b
    d = b - a; c = cyl(name, r, d.length, m, seg=seg, z0=-d.length / 2)
    c.location = (a + b) / 2; c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return c

# ---------------------------------------------------------------- the cylinder trolley
def o2_trolley(sc, prefix='Trolley'):
    S = mat('Trolley_Steel', srgb('#9aa1a6'), 0.32, 0.85); K = mat('Trolley_Rubber', srgb('#151617'), 0.75)
    g = bpy.data.objects.new(prefix, None); link(sc, g)
    for x in (-0.1, 0.1): link(sc, rod(f'{prefix}_up{x:+.1f}', Vector((x, 0, 0.06)), Vector((x, 0, 1.08)), 0.011, S, seg=12), g)
    link(sc, rod(prefix + '_handle', Vector((-0.13, 0, 1.08)), Vector((0.13, 0, 1.08)), 0.012, S, seg=12), g)
    link(sc, rod(prefix + '_grip', Vector((-0.07, 0, 1.08)), Vector((0.07, 0, 1.08)), 0.018, K, seg=14), g)
    link(sc, box(prefix + '_toe', 0.24, 0.24, 0.016, S, at=(0, -0.12, 0.03), bevel=0.004), g)
    link(sc, box(prefix + '_cradle', 0.22, 0.02, 0.02, S, at=(0, -0.02, 0.5)), g)
    for x in (-0.165, 0.165):
        link(sc, rod(f'{prefix}_wheel{x:+.2f}', Vector((x - 0.0175, 0.03, 0.075)), Vector((x + 0.0175, 0.03, 0.075)), 0.075, K, seg=20), g)
        link(sc, rod(f'{prefix}_hub{x:+.2f}', Vector((x - 0.02, 0.03, 0.075)), Vector((x + 0.02, 0.03, 0.075)), 0.03, S, seg=12), g)
    link(sc, rod(prefix + '_axle', Vector((-0.18, 0.03, 0.075)), Vector((0.18, 0.03, 0.075)), 0.01, S, seg=8), g)
    o2_cylinder(sc, parent=g, at=(0, -0.12, 0.04), tilt=math.radians(-7), prefix='TrolleyO2', H=0.9, R=0.09)
    for z in (0.32, 0.72): link(sc, torus(f'{prefix}_strap{z}', 0.097, 0.007, K, at=(0, -0.12 + z * 0.12, z + 0.04), rot=(math.radians(-7), 0, 0)), g)
    return g

# ---------------------------------------------------------------- the flood's electrical panel
def flood_panel(sc, prefix='Panel'):
    S = mat('Panel_Strut', srgb('#7f868a'), 0.4, 0.8); B = mat('Panel_Box', srgb('#8b8e78'), 0.55, 0.35); D = mat('Panel_Dark', srgb('#1d1f21'), 0.5, 0.4)
    Y = mat('Panel_Hazard', srgb('#f4c21a'), 0.5); Cu = mat('Panel_Copper', srgb('#c46a2a'), 0.3, 0.9); Rub = mat('Panel_Cable', srgb('#202224'), 0.7)
    G = mat('Panel_LampGreen', srgb('#38d860'), 0.3, 0, emit=srgb('#38ff60'), emit_k=4.0); R = mat('Panel_LampRed', srgb('#a01810'), 0.3, 0, emit=srgb('#ff3020'), emit_k=0.0)
    g = bpy.data.objects.new(prefix, None); link(sc, g)
    for x in (-0.22, 0.22): link(sc, box(f'{prefix}_strut{x:+.2f}', 0.04, 0.04, 1.75, S, at=(x, 0.04, 0.875)), g)
    for z in (0.02, 1.0): link(sc, box(f'{prefix}_rail{z}', 0.5, 0.04, 0.04, S, at=(0, 0.04, z)), g)
    link(sc, box(prefix + '_box', 0.56, 0.22, 0.76, B, at=(0, -0.08, 1.36), bevel=0.012), g)
    link(sc, box(prefix + '_door', 0.5, 0.012, 0.68, B, at=(0, -0.195, 1.36), bevel=0.004), g)
    link(sc, box(prefix + '_hinge', 0.012, 0.02, 0.6, D, at=(-0.255, -0.2, 1.36)), g)
    link(sc, box(prefix + '_latch', 0.03, 0.03, 0.08, D, at=(0.23, -0.21, 1.36)), g)
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in [(-0.11, 0, -0.09), (0.11, 0, -0.09), (0, 0, 0.1)]]; bm.faces.new(vs) # (the hazard triangle)
    tri = mesh_obj(prefix + '_sign', bm, Y); tri.location = (0, -0.203, 1.42); link(sc, tri, g)
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in [(-0.012, 0, 0.06), (0.028, 0, 0.0), (0.004, 0, 0.0), (0.014, 0, -0.06), (-0.028, 0, 0.008), (-0.004, 0, 0.008)]]; bm.faces.new(vs) # (its bolt)
    bolt = mesh_obj(prefix + '_bolt', bm, D); bolt.location = (0, -0.205, 1.4); link(sc, bolt, g)
    link(sc, text(prefix + '_txt', 'DANGER 415V', 0.032, D, (0, -0.203, 1.18)), g)
    link(sc, sphere(prefix + '_lampG', 0.022, G, at=(-0.12, -0.2, 1.66)), g)
    link(sc, sphere(prefix + '_lampR', 0.022, R, at=(0.12, -0.2, 1.66)), g)
    lever = box(prefix + '_lever', 0.03, 0.03, 0.2, D, at=(0, 0, 0)); lever.location = (0.31, -0.08, 1.4); lever.rotation_euler = (math.radians(-30), 0, 0); link(sc, lever, g)
    link(sc, rod(prefix + '_conduit', Vector((-0.12, -0.02, 0.0)), Vector((-0.12, -0.02, 0.98)), 0.022, S, seg=12), g)
    pts = [Vector((0.1, -0.1, 0.98)), Vector((0.14, -0.2, 0.75)), Vector((0.16, -0.32, 0.5)), Vector((0.15, -0.42, 0.26)), Vector((0.1, -0.52, 0.08)), Vector((0.02, -0.62, 0.03))]
    for i in range(len(pts) - 1): link(sc, rod(f'{prefix}_cable{i}', pts[i], pts[i + 1] + (pts[i + 1] - pts[i]).normalized() * 0.01, 0.014, Rub), g) # (the torn cable, sagging into the water)
    for k in range(3): link(sc, rod(f'{prefix}_wire{k}', Vector((0.02, -0.62, 0.03)), Vector((-0.02 + 0.03 * k, -0.68, 0.045 + 0.01 * k)), 0.004, Cu, seg=6), g) # (frayed copper)
    return g

# ---------------------------------------------------------------- the MRI scanner
def mri_scanner(sc, prefix='MRI'):
    W = mat('MRI_Shell', srgb('#e9ecee'), 0.32, 0.0); L = mat('MRI_Inner', srgb('#cfd5da'), 0.4); Bl = mat('MRI_Accent', srgb('#2d6fa3'), 0.35)
    D = mat('MRI_Dark', srgb('#2a2e33'), 0.5, 0.3); P = mat('MRI_Pad', srgb('#7fa9c8'), 0.6); Y = mat('MRI_Warning', srgb('#f2c018'), 0.5)
    Glow = mat('MRI_Glow', srgb('#55b8ff'), 0.25, 0, emit=srgb('#55b8ff'), emit_k=0.0)
    L.use_backface_culling = False
    g = bpy.data.objects.new(prefix, None); link(sc, g)
    BZ = 1.12  # the bore's centre height
    gant = box(prefix + '_gantry', 2.1, 1.05, 2.1, W, at=(0, 0, 1.05), bevel=0.3, segs=8); link(sc, gant, g)
    cut = rod(prefix + '_cutter', Vector((0, -0.8, BZ)), Vector((0, 0.8, BZ)), 0.37, W, seg=48); link(sc, cut, g); cut.hide_set(True); cut.hide_render = True
    mod = gant.modifiers.new('bore', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cut; mod.solver = 'EXACT'
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=0.37, radius2=0.37, depth=1.04) # (the bore's lining)
    bore = mesh_obj(prefix + '_bore', bm, L); bore.rotation_euler = (math.radians(90), 0, 0); bore.location = (0, 0, BZ); link(sc, bore, g)
    link(sc, torus(prefix + '_glow', 0.4, 0.035, Glow, at=(0, -0.53, BZ), rot=(math.radians(90), 0, 0), seg=56), g)
    link(sc, torus(prefix + '_lip', 0.46, 0.05, L, at=(0, -0.525, BZ), rot=(math.radians(90), 0, 0), seg=56), g)
    link(sc, box(prefix + '_stripe', 2.0, 0.02, 0.07, Bl, at=(0, -0.53, 0.32)), g)
    link(sc, box(prefix + '_ctl', 0.26, 0.04, 0.16, D, at=(0.7, -0.535, 1.25), bevel=0.01), g)
    for i, h in enumerate(('#38d860', '#f2c018', '#e8261a')):
        c = srgb(h); link(sc, rod(f'{prefix}_btn{i}', Vector((0.63 + i * 0.07, -0.55, 1.27)), Vector((0.63 + i * 0.07, -0.562, 1.27)), 0.016, mat(f'MRI_Btn{i}', c, 0.3, 0, emit=c, emit_k=1.5), seg=12), g)
    link(sc, box(prefix + '_warn', 0.26, 0.01, 0.2, Y, at=(-0.72, -0.535, 1.32)), g)
    link(sc, text(prefix + '_warnTxt', 'MAGNET\nALWAYS ON', 0.032, D, (-0.72, -0.542, 1.32)), g)
    link(sc, box(prefix + '_ped', 0.5, 1.1, 0.62, W, at=(0, -1.35, 0.31), bevel=0.05), g) # (the patient table, lined up with the bore)
    link(sc, box(prefix + '_top', 0.6, 2.2, 0.08, W, at=(0, -1.35, 0.7), bevel=0.02), g)
    link(sc, box(prefix + '_pad', 0.5, 2.0, 0.05, P, at=(0, -1.35, 0.765), bevel=0.02), g)
    return g

# ---------------------------------------------------------------- the magnet stop button
def magnet_stop(sc, prefix='Stop'):
    Y = mat('Stop_Yellow', srgb('#f2c018'), 0.5); K = mat('Stop_Black', srgb('#16171a'), 0.5); G = mat('Stop_Grey', srgb('#8e969b'), 0.45, 0.6)
    Red = mat('Button_Red', srgb('#c81e14'), 0.3, 0, emit=srgb('#ff2010'), emit_k=0.0); Wt = mat('Stop_Label', srgb('#f4f4f0'), 0.6)
    g = bpy.data.objects.new(prefix, None); link(sc, g)
    for i in range(8): link(sc, box(f'{prefix}_band{i}', 0.09, 0.09, 0.125, Y if i % 2 == 0 else K, at=(0, 0, 0.0625 + i * 0.125)), g) # (the striped post)
    link(sc, box(prefix + '_foot', 0.26, 0.26, 0.03, G, at=(0, 0, 0.015), bevel=0.006), g)
    link(sc, box(prefix + '_box', 0.22, 0.14, 0.22, Y, at=(0, -0.01, 1.1), bevel=0.012), g)
    link(sc, rod(prefix + '_stem', Vector((0, -0.08, 1.1)), Vector((0, -0.11, 1.1)), 0.028, G, seg=16), g)
    cap = sphere(prefix + '_cap', 0.06, Red, at=(0, 0, 0), half=True, sz=0.55); cap.rotation_euler = (math.radians(90), 0, 0); cap.location = (0, -0.11, 1.1); link(sc, cap, g)
    link(sc, box(prefix + '_guard', 0.2, 0.012, 0.012, Y, at=(0, -0.13, 1.24)), g)
    for x in (-0.095, 0.095): link(sc, box(f'{prefix}_guardSide{x:+.2f}', 0.012, 0.11, 0.012, Y, at=(x, -0.075, 1.24)), g)
    link(sc, box(prefix + '_plate', 0.2, 0.008, 0.1, Wt, at=(0, -0.05, 0.86)), g)
    link(sc, text(prefix + '_txt', 'MAGNET\nSTOP', 0.032, K, (0, -0.055, 0.86)), g)
    return g

BUILDERS = [('o2_cylinder', 'O2', o2_cylinder), ('o2_trolley', 'Trolley', o2_trolley), ('flood_panel', 'Panel', flood_panel), ('mri_scanner', 'MRI', mri_scanner), ('magnet_stop', 'Stop', magnet_stop)]

def build_all(do_export=False):
    sc = scene()
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True) # (the props scene only)
    roots = [(file, f(sc)) for file, pre, f in BUILDERS]
    if do_export:
        for file, r in roots: export(sc, r, file + '.glb')
    for i, (file, r) in enumerate(roots): r.location.x = [0, 0.8, 1.7, 4.0, 6.0][i] # (side by side to look at)
    return roots

build_all(do_export=globals().get('DO_EXPORT', False))
print('built', [o.name for o in bpy.context.scene.objects if o.parent is None])

