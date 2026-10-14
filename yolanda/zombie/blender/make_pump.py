# Short pump-action shotgun ("shorty") sized for Yola's hands, plus a 12-gauge shell she loads with.
# Built to the hand spacing measured in her rifle ready pose (right-hand grip to left-hand grip ~0.26 m in
# game metres): pistol grip at the right hand, pump forend under the left hand, loading port on the bottom
# of the receiver (the rifle reload clip brings the left hand up to exactly there).
# Conventions (glTF/three space): origin = right-hand grip, barrel along +X, up = +Y.
# In Blender: barrel along +X, up = +Z, side = Y (glTF -Z).
# Gun nodes: Gun > Frame (receiver, barrel, magazine tube, grip) / Pump (forend, slides along X) >
# GameGrip_L (left-hand hold point) ; empties Muzzle, LoadPort.   Shell: one mesh, axis along +X,
# brass head at -X, crimp at +X, origin at the centre.
# Usage in the live scene: exec(open(path).read()); build((4, 0, 0)); export_gun(path); build_shell((4, 0.4, 0)); export_shell(path)
import bpy, math

BARREL_LEN = 0.64   # grip to muzzle: long enough to read as a shotgun at a glance

def mat(name, rgb, rough=0.5, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def _finish(o, m, bevel):
    if bevel:
        b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 3; b.limit_method = 'ANGLE'
    o.data.materials.append(m)
    bpy.context.view_layer.objects.active = o
    if bevel:
        with bpy.context.temp_override(object=o, active_object=o): bpy.ops.object.modifier_apply(modifier='b')
    for p in o.data.polygons: p.use_smooth = True
    return o

def box(name, size, loc, m, bevel=0.004, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m, bevel)

def tube(name, r, length, loc, m, bevel=0.0015, verts=20):
    """Cylinder along +X centred at loc."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=loc, rotation=(0, math.pi / 2, 0))
    o = bpy.context.object; o.name = name
    return _finish(o, m, bevel)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); j = bpy.context.object; j.name = name
    return j

def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); e.location = loc; bpy.context.scene.collection.objects.link(e)
    if parent: e.parent = parent
    return e

def _clear(*names):
    for n in names:
        o = bpy.data.objects.get(n)
        if o:
            for c in list(o.children_recursive): bpy.data.objects.remove(c, do_unlink=True)
            bpy.data.objects.remove(o, do_unlink=True)

def build(origin=(4, 0, 0)):
    _clear('Gun', 'Sawn')
    for n in ('Frame', 'Barrels', 'Pump'):
        o = bpy.data.objects.get(n)
        if o: bpy.data.objects.remove(o, do_unlink=True)
    steel = mat('sg_steel', (0.16, 0.17, 0.19), 0.32, 0.85)
    blued = mat('sg_blued', (0.05, 0.055, 0.065), 0.38, 0.6)
    black = mat('sg_black', (0.015, 0.015, 0.018), 0.7, 0.0)
    wood = mat('sg_wood', (0.30, 0.15, 0.06), 0.55, 0.0)
    brass = mat('sg_brass', (0.75, 0.55, 0.18), 0.35, 0.9)
    # ---- frame: receiver, barrel, magazine tube, grip (stays in the right hand)
    parts = []
    parts.append(box('receiver', (0.140, 0.048, 0.056), (0.032, 0, 0.034), blued, 0.007))
    parts.append(box('port_slot', (0.050, 0.030, 0.006), (0.052, 0, 0.006), black, 0.001))               # loading port, underside
    parts.append(box('eject_slot', (0.052, 0.003, 0.016), (0.040, 0.0225, 0.044), black, 0.0008))         # ejection port, right side
    parts.append(box('grip', (0.036, 0.040, 0.118), (-0.030, 0, -0.030), wood, 0.009, rot=(0, math.radians(-16), 0)))
    parts.append(box('guard_a', (0.062, 0.008, 0.006), (0.012, 0, -0.016), blued, 0.002))                # trigger guard
    parts.append(box('guard_b', (0.006, 0.008, 0.026), (0.041, 0, -0.004), blued, 0.002))
    parts.append(box('trigger', (0.006, 0.006, 0.020), (0.008, 0, -0.004), steel, 0.001, rot=(0, math.radians(20), 0)))
    parts.append(tube('barrel', 0.0185, 0.585, (0.0575 + 0.2925, 0, 0.056), steel, 0.002, 24))                # single barrel
    parts.append(tube('muzzle_ring', 0.0198, 0.010, (BARREL_LEN - 0.005, 0, 0.056), blued, 0.0008, 24))
    parts.append(tube('collar', 0.0205, 0.012, (0.36, 0, 0.056), blued, 0.001, 24))
    parts.append(tube('mag_tube', 0.0125, 0.42, (0.07 + 0.21, 0, 0.0185), blued, 0.0015, 20))            # magazine tube under it
    parts.append(tube('mag_cap', 0.0140, 0.014, (0.485, 0, 0.0185), steel, 0.001))
    parts.append(box('bead', (0.010, 0.006, 0.010), (BARREL_LEN - 0.016, 0, 0.0795), brass, 0.001))      # front sight
    parts.append(box('rear_sight', (0.014, 0.014, 0.006), (0.085, 0, 0.0765), blued, 0.001))
    parts.append(box('rib', (0.50, 0.008, 0.004), (0.33, 0, 0.0755), steel, 0.001))
    frame = join(parts, 'Frame')
    # ---- pump forend (slides along X; the left hand wraps it)
    pp = [box('forend', (0.125, 0.060, 0.046), (0.255, 0, 0.022), wood, 0.014)]
    for i in range(4):                                                                                    # grip grooves
        pp.append(box('groove', (0.004, 0.062, 0.048), (0.222 + i * 0.011, 0, 0.022), blued, 0.001))
    pp.append(box('sleeve', (0.016, 0.042, 0.040), (0.186, 0, 0.022), blued, 0.003))                      # action bar sleeve
    pump = join(pp, 'Pump')
    bpy.context.scene.cursor.location = (0.255, 0, 0.022)
    bpy.ops.object.select_all(action='DESELECT'); pump.select_set(True); bpy.context.view_layer.objects.active = pump
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    root = empty('Gun', (0, 0, 0)); frame.parent = root; pump.parent = root
    empty('GameGrip_L', (0, 0, 0), pump)   # local to the pump: sits at the forend centre
    empty('Muzzle', (BARREL_LEN + 0.006, 0, 0.056), root)
    empty('LoadPort', (0.052, 0, 0.004), root)
    root.location = origin
    return root

def export_gun(path):
    root = bpy.data.objects['Gun']; loc = tuple(root.location); root.location = (0, 0, 0)
    _export([root] + list(root.children_recursive), root, path)
    root.location = loc

def _export(objs, active, path):
    for o in bpy.data.objects: pass
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active = active
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    with bpy.context.temp_override(window=win, area=area, region=area.regions[-1]):
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_yup=True,
                                  export_animations=False, export_apply=False)
    print('exported', path)

def build_shell(origin=(4, 0.4, 0)):
    o = bpy.data.objects.get('Shell')
    if o: bpy.data.objects.remove(o, do_unlink=True)
    red = mat('shell_red', (0.62, 0.05, 0.04), 0.38, 0.0)
    brass = mat('shell_brass', (0.82, 0.60, 0.20), 0.32, 0.95)
    dark = mat('shell_primer', (0.12, 0.10, 0.09), 0.5, 0.6)
    L, R = 0.074, 0.0105                       # a touch larger than life so it reads on screen
    parts = [
        tube('hull', R, 0.050, (0.0 + 0.002, 0, 0), red, 0.0008, verts=24),                    # plastic hull
        tube('head', R * 1.04, 0.020, (-L / 2 + 0.010, 0, 0), brass, 0.0012, verts=24),       # brass head
        tube('rim', R * 1.17, 0.0025, (-L / 2 + 0.00125, 0, 0), brass, 0.0006, verts=24),     # extraction rim
        tube('primer', R * 0.42, 0.0015, (-L / 2 - 0.0002, 0, 0), dark, 0.0003, verts=14),
        tube('crimp', R * 0.82, 0.008, (L / 2 - 0.004, 0, 0), red, 0.0008, verts=24),         # rolled crimp
    ]
    shell = join(parts, 'Shell')
    shell.location = origin
    return shell

def export_shell(path):
    s = bpy.data.objects['Shell']; loc = tuple(s.location); s.location = (0, 0, 0)
    _export([s], s, path)
    s.location = loc
