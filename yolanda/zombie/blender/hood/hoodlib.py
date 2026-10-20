# Chapter 2: shared Blender helpers for the neighbourhood scripts (build_hood.py, dress_hood.py): the old Survive kit's
# materials (M_<key>__<paint> -> node materials on the shared textures), model import, the three.js <-> Blender transform,
# collision objects (COL) and per-prop collision from a model's bounds.
import bpy, json, os, sys, math, io, contextlib
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets', 'neighborhood'); TEX = os.path.join(ASSETS, 'tex')
SRC = os.path.join(HERE, 'src'); OUT = os.path.join(HERE, 'hood_base.blend')

# ---------------------------------------------------------------- materials (port of the old web/src/engine/materials.js)
TILE_M = dict(asphalt=4, concrete_slab=3, dirt=4, grass_ground=4, forest_floor=4, rock=4, wood_raw=2, wood_dark=2,
              wood_end=0.4, wood_siding=2, wood_painted=2, brick=2, plaster=3, concrete_rough=2, roof_shingles=2,
              metal_painted=2, metal_rusty=2, rubber=1, fabric=1, bark=2, roof_tile_barrel=2, roof_tile_flat=2, stucco=3,
              pavers=2, sand=4, tile_floor=1.8, tile_wall=1, wood_floor=2, carpet=1, countertop=1, palm_bark=1,
              stucco_ph=2, shingles_ph=3)
P = lambda r, g, b: (r, g, b)
PAINTS = dict(white=P(0.578, 0.552, 0.479), offwhite=P(0.485, 0.440, 0.347), cream=P(0.584, 0.485, 0.296),
  red=P(0.270, 0.027, 0.019), darkred=P(0.112, 0.014, 0.010), blue=P(0.042, 0.102, 0.216), lightblue=P(0.159, 0.275, 0.381),
  green=P(0.048, 0.084, 0.037), olive=P(0.098, 0.102, 0.042), army=P(0.070, 0.082, 0.032), yellow=P(0.58, 0.44, 0.07),
  orange=P(0.468, 0.102, 0.019), grey=P(0.205, 0.205, 0.191), darkgrey=P(0.042, 0.042, 0.041), black=P(0.013, 0.013, 0.013),
  brown=P(0.105, 0.050, 0.023), tan=P(0.305, 0.223, 0.114), teal=P(0.047, 0.127, 0.127), sage=P(0.242, 0.301, 0.195),
  maroon=P(0.102, 0.019, 0.019), navy=P(0.017, 0.028, 0.060), tarpblue=P(0.018, 0.080, 0.254), sand=P(0.392, 0.296, 0.162),
  salmon=P(0.687, 0.352, 0.246), mint=P(0.397, 0.584, 0.434), peach=P(0.761, 0.485, 0.270), paleyellow=P(0.56, 0.35, 0.075),
  seafoam=P(0.332, 0.558, 0.509), coral=P(0.694, 0.262, 0.171), skyblue=P(0.386, 0.552, 0.672), lavender=P(0.479, 0.413, 0.571),
  beige=P(0.672, 0.571, 0.392), courtblue=P(0.95, 1.5, 1.72), courtgrey=P(0.72, 0.84, 0.84), silver=P(0.80, 0.87, 1.02),
  weathered=P(0.60, 1.03, 2.1), terracotta=P(0.2, 0.085, 0.045), roofbrown=P(0.27, 0.235, 0.2), lime=P(0.45, 1.0, 0.25),
  purple=P(0.32, 0.08, 0.42))

_img = {}
def img(name, color):
    key = (name, color)
    if key in _img: return _img[key]
    path = os.path.join(TEX, name)
    if not os.path.exists(path): return None
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    _img[key] = im
    return im

def principled(m):
    m.use_nodes = True
    nt = m.node_tree
    return nt, next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')

def tex_node(nt, im, x, y):
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; t.location = (x, y)
    return t

def standard(m, base, variant):
    nt, bsdf = principled(m)
    alb, nrm, orm = img(base + '_albedo.webp', True), img(base + '_normal.webp', False), img(base + '_orm.webp', False)
    if alb is None:
        bsdf.inputs['Base Color'].default_value = (0.5, 0.5, 0.5, 1); return
    ta = tex_node(nt, alb, -900, 300)
    col = ta.outputs['Color']
    paint = PAINTS.get(variant)
    if paint:  # paint where the texture's alpha says it is painted: mix(alb, alb / 0.62 * paint, alpha)
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.location = (-600, 400)
        mul.inputs['Factor'].default_value = 1.0
        nt.links.new(col, mul.inputs[6]); mul.inputs[7].default_value = (*[c / 0.62 for c in paint], 1)
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.location = (-350, 350)
        nt.links.new(ta.outputs['Alpha'], mix.inputs['Factor']); nt.links.new(col, mix.inputs[6]); nt.links.new(mul.outputs[2], mix.inputs[7])
        col = mix.outputs[2]
    if base == 'bark':
        br = nt.nodes.new('ShaderNodeMix'); br.data_type = 'RGBA'; br.blend_type = 'MULTIPLY'; br.inputs['Factor'].default_value = 1
        nt.links.new(col, br.inputs[6]); br.inputs[7].default_value = (1.9, 1.75, 1.55, 1); col = br.outputs[2]
    nt.links.new(col, bsdf.inputs['Base Color'])
    if orm:
        to = tex_node(nt, orm, -900, -100)
        sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-600, -100)
        nt.links.new(to.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    if nrm:
        tn = tex_node(nt, nrm, -900, -450)
        # three.js read these maps with normalScale (1, -1): green flipped against Blender's convention
        sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-650, -450); nt.links.new(tn.outputs['Color'], sep.inputs['Color'])
        inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; inv.location = (-480, -480)
        nt.links.new(sep.outputs['Green'], inv.inputs[1])
        com = nt.nodes.new('ShaderNodeCombineColor'); com.location = (-330, -450)
        nt.links.new(sep.outputs['Red'], com.inputs['Red']); nt.links.new(inv.outputs[0], com.inputs['Green']); nt.links.new(sep.outputs['Blue'], com.inputs['Blue'])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-180, -450)
        nt.links.new(com.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])

def flat(m, rgb, rough=0.9, metal=0.0, alpha=1.0, emit=None):
    nt, bsdf = principled(m)
    bsdf.inputs['Base Color'].default_value = (*rgb, 1); bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if alpha < 1: bsdf.inputs['Alpha'].default_value = alpha
    if emit: bsdf.inputs['Emission Color'].default_value = (*emit, 1); bsdf.inputs['Emission Strength'].default_value = 1.5

def leaves(m, variant):
    nt, bsdf = principled(m)
    im = img('leaves_%s_albedo.webp' % (variant or 'broad'), True)
    if im:
        t = tex_node(nt, im, -600, 200); nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.85

def special(m, base, variant):
    if base == 'glass': flat(m, (0.035, 0.045, 0.05) if variant == 'car' else (0.06, 0.075, 0.08), 0.1, 0.1, 1.0 if variant == 'car' else 0.62); return True
    if base == 'screen': flat(m, (0.03, 0.03, 0.03), 0.8, 0, 0.32); return True
    if base == 'void': flat(m, (0, 0, 0)); return True
    if base == 'plastic': flat(m, PAINTS.get(variant, (0.03, 0.03, 0.03)), 0.38); return True
    if base == 'paper': flat(m, (0.55, 0.53, 0.48)); return True
    if base == 'flat': flat(m, (0.06, 0.085, 0.032) if variant == 'leafcore' else PAINTS.get(variant, (0.5, 0.5, 0.5)), 0.92); return True
    if base == 'emissive': c = (1, 0.6, 0.1) if variant == 'amber' else PAINTS.get(variant, (1, 0.6, 0.2)); flat(m, c, 0.5, 0, 1, c); return True
    if base == 'water': flat(m, (0.03, 0.09, 0.09), 0.06, 0, 0.88); return True
    if base == 'leaves': leaves(m, variant); return True
    if base == 'chainlink': flat(m, (0.55, 0.55, 0.52), 0.5, 0.7); return True
    if base == 'yard':
        nt, bsdf = principled(m); im = img('yard_foliage_albedo.webp', True)
        if im: t = tex_node(nt, im, -600, 200); nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        return True
    if base in ('decal', 'decal2'):
        nt, bsdf = principled(m); im = img(base + '_atlas.webp', True)
        if im:
            t = tex_node(nt, im, -600, 200); nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
        return True
    return False

def kit_material(name):
    """The shared material for a placeholder name (M_<key> or M_<key>__<paint>), built once."""
    key = name[2:].split('.')[0]
    full = 'M_' + key
    m = bpy.data.materials.get(full)
    if m and m.get('hood_kit'): return m
    m = bpy.data.materials.new(full); m['hood_kit'] = True
    base, variant = (key.split('__') + [''])[:2]
    if not special(m, base, variant):
        if base in TILE_M: standard(m, base, variant)
        else: flat(m, (1, 0, 1))
    return m

def swap_materials(objs):
    for o in objs:
        if o.type != 'MESH': continue
        for s in o.material_slots:
            if s.material and s.material.name.startswith('M_') and not s.material.get('hood_kit'):
                # placeholders only: an M_ material that carries its own texture keeps it
                has_tex = s.material.use_nodes and any(n.type == 'TEX_IMAGE' for n in s.material.node_tree.nodes)
                if not has_tex: s.material = kit_material(s.material.name)

def quiet(): return contextlib.redirect_stdout(io.StringIO())

def import_into(path, coll):
    before = set(bpy.data.objects)
    with quiet(): bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o)
    return new

C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # three.js (x, y, z) -> Blender (x, -z, y)
Ci = C.inverted()


def world_tex(nt, name, color, scale, x, y, rot=0.0, off=0.0):
    """An image sampled in world metres (tile = 1 / scale m), like the game's world-space ground UVs."""
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (x - 600, y)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (x - 400, y)
    mp.inputs['Scale'].default_value = (scale, scale, scale); mp.inputs['Rotation'].default_value = (0, 0, rot)
    mp.inputs['Location'].default_value = (off, off, 0)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    t = tex_node(nt, img(name, color), x, y); nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    return t

def noise(nt, scale, x, y, detail=3.0):
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (x - 300, y)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.location = (x, y)
    nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = detail
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    return nz

def ramp(nt, src, a, b, x, y):
    r = nt.nodes.new('ShaderNodeMapRange'); r.location = (x, y)
    r.inputs['From Min'].default_value = a; r.inputs['From Max'].default_value = b
    nt.links.new(src, r.inputs['Value'])
    return r.outputs['Result']

def mixc(nt, f, a, b, x, y):
    m = nt.nodes.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.location = (x, y)
    nt.links.new(f, m.inputs['Factor'])
    for i, s in ((6, a), (7, b)):
        if isinstance(s, tuple): m.inputs[i].default_value = s
        else: nt.links.new(s, m.inputs[i])
    return m.outputs[2]

def terrain_material():
    """The lawn (Marc's Blender-modelled St. Augustine tile, 5 m) with dry thatch, dirt, sandy soil and leaf litter in
    world-noise patches: the old ground.js terrain look, for the Blender scene and the bake."""
    m = bpy.data.materials.get('HOOD_terrain') or bpy.data.materials.new('HOOD_terrain')
    nt, bsdf = principled(m)
    for n in list(nt.nodes):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'): nt.nodes.remove(n)
    grass = world_tex(nt, 'lawn_bl_albedo.webp', True, 1 / 5, -1400, 600).outputs['Color']
    dirt = world_tex(nt, 'dirt_albedo.webp', True, 1 / 5.3, -1400, 250, 0.64, 0.37).outputs['Color']
    sand = world_tex(nt, 'sandy_soil_albedo.webp', True, 1 / 3.7, -1400, -100, 1.29).outputs['Color']
    lit = world_tex(nt, 'forest_floor_albedo.webp', True, 1 / 4.6, -1400, -450, 1.29, 0.21).outputs['Color']
    big, mid, fine = noise(nt, 0.02, -1100, 900), noise(nt, 0.09, -1100, 700), noise(nt, 0.6, -1100, 500)
    dead = ramp(nt, big.outputs['Fac'], 0.52, 0.62, -800, 900)
    dirtF = ramp(nt, mid.outputs['Fac'], 0.6, 0.7, -800, 700)
    leafF = ramp(nt, fine.outputs['Fac'], 0.58, 0.7, -800, 500)
    col = mixc(nt, dead, grass, sand, -500, 600)
    col = mixc(nt, dirtF, col, dirt, -300, 500)
    lf = nt.nodes.new('ShaderNodeMath'); lf.operation = 'MULTIPLY'; lf.inputs[1].default_value = 0.45; nt.links.new(leafF, lf.inputs[0])
    col = mixc(nt, lf.outputs[0], col, lit, -120, 400)
    br = nt.nodes.new('ShaderNodeMix'); br.data_type = 'RGBA'; br.blend_type = 'MULTIPLY'; br.inputs['Factor'].default_value = 1
    nt.links.new(col, br.inputs[6]); br.inputs[7].default_value = (1.18, 1.18, 1.18, 1)
    nt.links.new(br.outputs[2], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.95
    return m


def col_coll():
    c = bpy.data.collections.get('COL')
    if c is None: c = bpy.data.collections.new('COL'); bpy.context.scene.collection.children.link(c)
    return c

def col_box(name, cx, cz, hx, hz, angle, h, tag):
    """A collision box from the game's terms (three.js centre x/z, half sizes, yaw) as a Blender cube."""
    me = bpy.data.meshes.get('COL_cube')
    if me is None:
        import bmesh
        me = bpy.data.meshes.new('COL_cube'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
        me.update()
    o = bpy.data.objects.new(name, me)
    o.location = (cx, -cz, h / 2); o.rotation_euler = (0, 0, angle); o.scale = (hx * 2, hz * 2, h)
    o['col'] = 'box'; o['tag'] = tag; o['h'] = h
    o.display_type = 'WIRE'; o.hide_render = True
    col_coll().objects.link(o); return o

def col_circle(name, cx, cz, r, h, tag):
    me = bpy.data.meshes.get('COL_cyl')
    if me is None:
        import bmesh
        me = bpy.data.meshes.new('COL_cyl'); bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.5, radius2=0.5, depth=1.0); bm.to_mesh(me); bm.free(); me.update()
    o = bpy.data.objects.new(name, me)
    o.location = (cx, -cz, h / 2); o.scale = (r * 2, r * 2, h)
    o['col'] = 'circle'; o['tag'] = tag; o['h'] = h
    o.display_type = 'WIRE'; o.hide_render = True
    col_coll().objects.link(o); return o

# props that block: cars, yard furniture, crates, barriers ... (ground clutter, foliage, trees and walls are left out:
# trees use the old trunk circles, buildings the old shapes)
PROP_BLOCK = ('hood_play_tower', 'hood_swings', 'hood_merry', 'hood_bench', 'hood_sandbox', 'car3_', 'car_', 'by_ac_unit', 'by_grill', 'by_table', 'by_cooler', 'by_garden_cluster', 'by_planter_dead', 'by_hose_reel',
              'by_trash_bin', 'by_slide', 'patio_cage', 'street_light', 'tire_stack', 'pallet_stack', 'jersey_barrier', 'sandbags',
              'debris_pile', 'dumpster', 'trash_bags', 'barricade', 'wall_corrugated', 'fence_privacy', 'nb_tarp_crates', 'nb_mailboxes',
              'nb_utility_cabinet', 'yardprop_trash_can', 'sofa_dumped', 'barrel', 'utility_box', 'hydrant', 'stop_sign', 'mailbox',
              'shopping_cart', 'wooden_crate', 'military_crate', 'fire_barrel', 'car_tire_pile', 'boat_', 'loot_crate', 'nb_fence_broken')
_bounds = {}
def lib_bounds(coll):
    """The model's footprint in its own frame (Blender x / y, min z, max z) from the library collection's meshes."""
    if coll.name in _bounds: return _bounds[coll.name]
    from mathutils import Vector
    xs, ys, zs = [], [], []
    for o in coll.all_objects:
        if o.type != 'MESH': continue
        for v in o.bound_box:
            w = o.matrix_world @ Vector(v); xs.append(w.x); ys.append(w.y); zs.append(w.z)
    b = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)) if xs else None
    _bounds[coll.name] = b; return b

def prop_collider(e):
    name = os.path.basename(e['src'])
    if not name.startswith(PROP_BLOCK): return None
    b = lib_bounds(e.instance_collection)
    if not b: return None
    from mathutils import Vector
    x0, x1, y0, y1, z0, z1 = b
    shrink = 0.92 if name.startswith(('car3_', 'car_')) else 1.0   # (car bodies taper: a box a touch inside the paint)
    c = e.matrix_world @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
    s = e.matrix_world.to_scale()
    yaw = e.matrix_world.to_euler().z
    h = max(0.3, (z1 - z0) * s.z)
    return col_box('COL_prop_' + e.name, c.x, -c.y, (x1 - x0) * s.x / 2 * shrink, (y1 - y0) * s.y / 2 * shrink, yaw, h, 'prop:' + os.path.splitext(name)[0])

