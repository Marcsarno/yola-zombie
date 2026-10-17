# A hospital treatment recliner (infusion chair) in three upgrade tiers, for the opening's two-bay treatment room
# (the Opening V3 handoff asks for recliners / treatment chairs in the bays; the kit has none). Same soft, rounded,
# flat-coloured style as the hospital kit: bevelled boxes, no textures. Front = +Y in Blender (= +Z in glTF), metres.
#  starter:  beige vinyl, plain padded arms, a fixed footrest, grey base
#  standard: teal vinyl, padded arms, an extended leg rest, a swing-out side tray
#  advanced: two-tone teal and cream, a head pillow, wide arms with a control pad, the leg rest, the tray, a steel
#            pedestal with a power-base cover
# usage: blender -b --factory-startup --python tools/anim/make_recliner.py -- <out_dir>
import bpy, sys, os, math
from mathutils import Vector

out_dir = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out_dir, exist_ok=True)

def mat(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def lin(h):  # sRGB hex -> linear rgb
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def box(name, size, loc, m, bevel=0.03, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        md = o.modifiers.new('bevel', 'BEVEL'); md.width = min(bevel, min(size) * 0.45); md.segments = 3; md.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier='bevel')
    bpy.ops.object.shade_smooth()
    o.data.materials.append(m)
    if parent: o.parent = parent
    return o

def cyl(name, r, h, loc, m, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name; bpy.ops.object.shade_smooth(); o.data.materials.append(m)
    return o

def build(tier):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    up = {'starter': lin(0xd9c7a5), 'standard': lin(0x2f9fa0), 'advanced': lin(0x2a8f92)}[tier]
    up2 = lin(0xf2ead8)  # cream (advanced seat panels and pillow)
    frame = mat('Frame_' + tier, lin(0x9aa3a6) if tier != 'advanced' else lin(0xc9d0d3), 0.35, 0.6)
    dark = mat('Base_' + tier, lin(0x3a4247), 0.55)
    vin = mat('Vinyl_' + tier, up, 0.42)
    cream = mat('Cream_' + tier, up2, 0.5)
    tray = mat('Tray_' + tier, lin(0xeee8dc), 0.45)
    seat_h = 0.5
    # the base: a low plinth with casters (starter, standard) or a steel pedestal with a power-base cover (advanced)
    if tier == 'advanced':
        box('Pedestal', (0.5, 0.62, 0.08), (0, 0.0, 0.04), frame, 0.03)
        box('PowerBase', (0.34, 0.42, 0.26), (0, -0.02, 0.21), dark, 0.05)
    else:
        box('Plinth', (0.56, 0.7, 0.07), (0, 0.0, 0.08), frame, 0.02)
        for x in (-0.24, 0.24):
            for y in (-0.3, 0.3): cyl('Caster', 0.04, 0.035, (x, y, 0.04), dark, rot=(0, math.pi / 2, 0), verts=12)
        box('Column', (0.16, 0.16, seat_h - 0.2), (0, 0, 0.11 + (seat_h - 0.2) / 2), dark, 0.03)
    # seat
    seatm = cream if tier == 'advanced' else vin
    box('Seat', (0.6, 0.56, 0.14), (0, 0.02, seat_h), seatm, 0.06)
    # backrest: hinged at the back edge of the seat, reclined 15 degrees toward the headwall side (-Y), its foot meeting the
    # seat; a steel support from the column, and a separate padded headrest on every tier (2026-10-16: the old back was
    # rotated against its own placement and floated loose behind the seat, reading as a bent head piece)
    tilt = math.radians(15)
    bh, bt = 0.72, 0.13
    up_dir = Vector((0, -math.sin(tilt), math.cos(tilt)))      # along the back, upward
    fwd_n = Vector((0, math.cos(tilt), math.sin(tilt)))        # the back's front face normal
    hinge = Vector((0, -0.24, seat_h + 0.03))
    back_c = hinge + up_dir * (bh / 2) - fwd_n * (bt / 2)
    box('Back', (0.56, bt, bh), back_c, vin, 0.05, rot=(tilt, 0, 0))
    box('BackSupport', (0.08, 0.05, 0.42), hinge + up_dir * 0.2 - fwd_n * (bt + 0.02), frame, 0.015, rot=(tilt, 0, 0))
    top = hinge + up_dir * bh
    head_c = top + up_dir * 0.07 - fwd_n * (bt / 2 - 0.035)
    box('Headrest', (0.34, 0.13, 0.2), head_c, cream if tier != 'starter' else vin, 0.06, rot=(tilt, 0, 0))
    box('HeadPost', (0.05, 0.03, 0.12), top - fwd_n * (bt / 2 + 0.01), frame, 0.01, rot=(tilt, 0, 0))
    if tier == 'advanced':  # a cream back panel
        box('BackPanel', (0.42, 0.03, bh * 0.68), back_c + fwd_n * (bt / 2 + 0.008), cream, 0.02, rot=(tilt, 0, 0))
    # leg rest: the starter has a short fixed footrest, the others an extended, angled leg rest
    if tier == 'starter':
        box('Footrest', (0.5, 0.26, 0.1), (0, 0.38, seat_h - 0.14), vin, 0.04, rot=(math.radians(-35), 0, 0))
    else:
        lt = math.radians(-18); ll = 0.55
        box('LegRest', (0.54, ll, 0.12), (0, 0.3 + math.cos(lt) * ll / 2, seat_h - 0.02 + math.sin(lt) * ll / 2), vin, 0.05, rot=(lt, 0, 0))
        box('FootPlate', (0.46, 0.06, 0.16), (0, 0.3 + math.cos(lt) * ll + 0.02, seat_h - 0.02 + math.sin(lt) * ll - 0.07), dark, 0.02)
    # arms: posts and padded tops (wider on the advanced tier, with a control pad on the right)
    aw = 0.12 if tier == 'advanced' else 0.09
    for sx in (-1, 1):
        x = sx * (0.3 + aw / 2)
        box('ArmPost', (0.05, 0.05, 0.2), (x, 0.0, seat_h + 0.02), frame, 0.015)
        box('ArmPad', (aw, 0.5, 0.07), (x, 0.0, seat_h + 0.16), vin if tier != 'advanced' else cream, 0.03)
    if tier == 'advanced':
        box('ControlPad', (0.07, 0.1, 0.03), (0.3 + aw / 2, 0.16, seat_h + 0.21), dark, 0.01)
    # the swing-out side tray (standard, advanced) on the left, a cup well on the advanced tray
    if tier != 'starter':
        cyl('TrayArm', 0.015, 0.34, (-0.47, 0.06, seat_h + 0.06), frame)
        box('Tray', (0.3, 0.22, 0.025), (-0.55, 0.12, seat_h + 0.24), tray, 0.012)
        if tier == 'advanced': cyl('Cup', 0.035, 0.09, (-0.62, 0.17, seat_h + 0.3), mat('Cup_' + tier, lin(0xffffff), 0.4), verts=14)
    # join everything into one mesh per material set (one object: simple to place and fade)
    bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active = bpy.data.objects[0]
    bpy.ops.object.join()
    o = bpy.context.object; o.name = 'TreatmentRecliner_' + tier
    # rotate Blender +Y front to glTF +Z (the exporter converts Y-up: Blender -Y becomes glTF +Z, so turn 180)
    o.rotation_euler = (0, 0, math.pi); bpy.ops.object.transform_apply(rotation=True)
    path = os.path.join(out_dir, f'TreatmentRecliner_{tier}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_apply=True)
    dims = o.dimensions
    print('WROTE', path, 'dims', round(dims.x, 3), round(dims.y, 3), round(dims.z, 3), 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons))

for t in ('starter', 'standard', 'advanced'): build(t)
