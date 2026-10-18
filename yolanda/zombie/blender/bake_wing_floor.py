# The plan's upgrade A (2026-10-18): the combat wing's floor light baked once in Cycles, for the lighting lab.
# Input: shots/wing_bake_scene.json, exported by game.lightkit.exportBake() in combat.html?mode=calm&demo=lighting: every
# static opaque mesh over the wing as world triangles, the floor's bounds and the ceiling fittings (render/lightkit.js
# WING_LIGHTS). Output: assets/hospital/wing_floor_light.jpg, the light falling on the floor (direct + bounced, no
# colour of its own) across the bounds; the game lays it on the floor as a lightMap with uv1 from world x / z.
#   u = (x - x0) / (x1 - x0),  v = 1 - (z - z0) / (z1 - z0)        (game axes: y up; Blender: x, -z, y)
# Run inside Blender: exec(open(r'<this file>').read())
import bpy, json, base64, struct, os, math

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else r'C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie\blender'
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'shots', 'wing_bake_scene.json')
OUT = os.path.join(ROOT, 'assets', 'hospital', 'wing_floor_light.jpg')
RES = (768, 1152)          # (about 2 cm a pixel across the 15.2 x 23.2 m bounds)
SAMPLES = 384               # (about 2.5 min on the GPU)
SMOOTH = 2                  # passes of a 5-tap blur over the result (about 4 cm): the last grain out, the furniture shadows kept
CEIL = 2.7                 # the wing's wall height (arena.js H): a ceiling to hold the bounce in
TUBE_W = 160.0             # watts for a fitting at k 0.55 (scaled by its k); 'dead' ones stay off
EXIT_W = 6.0

D = json.load(open(SRC))
B = D['bounds']; x0, x1, z0, z1 = B['x0'], B['x1'], B['z0'], B['z1']
g2b = lambda x, y, z: (x, -z, y)

bpy.ops.wm.read_homefile(use_empty=True)
sc = bpy.context.scene

def mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = 0.8
    return m

def mesh_from(name, verts, faces, m):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); me.materials.append(m); return ob

# the occluders: everything standing on the floor (walls, beds, desks, lockers), one mesh
verts, faces = [], []
for M in D['meshes']:
    if M['floor']: continue
    raw = base64.b64decode(M['tris']); f = struct.unpack('<%df' % (len(raw) // 4), raw)
    for t in range(0, len(f), 9):
        i = len(verts)
        for k in range(3): verts.append(g2b(f[t + k * 3], f[t + k * 3 + 1], f[t + k * 3 + 2]))
        faces.append((i, i + 1, i + 2))
occ = mesh_from('Occluders', verts, faces, mat('occluder', (0.28, 0.28, 0.28)))
occ.data.validate()

# the floor to bake, its UVs straight from world x / z (the formula above)
W, Dp = x1 - x0, z1 - z0
fv = [g2b(x0, 0, z0), g2b(x1, 0, z0), g2b(x1, 0, z1), g2b(x0, 0, z1)]
floor = mesh_from('FloorBake', fv, [(0, 3, 2, 1)], mat('floor', (0.45, 0.45, 0.45)))
uvl = floor.data.uv_layers.new(name='bake')
for poly in floor.data.polygons:
    for li in poly.loop_indices:
        x, by, _ = floor.data.vertices[floor.data.loops[li].vertex_index].co; z = -by
        uvl.data[li].uv = ((x - x0) / W, 1 - (z - z0) / Dp)
ceil = mesh_from('Ceiling', [g2b(x0, CEIL, z0), g2b(x1, CEIL, z0), g2b(x1, CEIL, z1), g2b(x0, CEIL, z1)], [(0, 1, 2, 3)], mat('ceiling', (0.18, 0.18, 0.18)))  # (dark surfaces: a white room bounces the pools flat)

# the fittings: a 1.25 x 0.16 m tube along x, just under the ceiling, shining down
def hexrgb(h): return (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
for i, F in enumerate(D['fixtures'] or []):
    if F.get('state') == 'dead': continue
    L = bpy.data.lights.new('tube%d' % i, 'AREA'); L.shape = 'RECTANGLE'; L.size = 1.25; L.size_y = 0.16
    L.energy = TUBE_W * F['k'] / 0.55; L.color = hexrgb(F['col']) if F.get('col') is not None else (0.88, 0.92, 1.0)
    o = bpy.data.objects.new('tube%d' % i, L); o.location = g2b(F['x'], 2.6, F['z']); sc.collection.objects.link(o)  # (area lights face -Z: down)
for i, E in enumerate(D.get('exits') or []):
    L = bpy.data.lights.new('exit%d' % i, 'POINT'); L.energy = EXIT_W; L.color = (0.2, 1.0, 0.45); L.shadow_soft_size = 0.2
    o = bpy.data.objects.new('exit%d' % i, L); o.location = g2b(E['x'], 2.25, E['z']); sc.collection.objects.link(o)

# a faint world so the dark corners are not black (the game keeps its own dimmed fill on top)
w = bpy.data.worlds.new('dim'); w.use_nodes = True; sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.006, 0.007, 0.008, 1); bg.inputs[1].default_value = 1

# the bake
try: sc.render.engine = 'CYCLES'
except TypeError as e: print('engine:', e)
sc.cycles.samples = SAMPLES
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.get_devices()
    if any(d.type != 'CPU' for d in prefs.devices): sc.cycles.device = 'GPU'
except Exception as e: print('device:', e)
img = bpy.data.images.new('wing_floor_light', RES[0], RES[1], float_buffer=True)
fm = floor.data.materials[0]; nt = fm.node_tree
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
for o in sc.objects: o.select_set(False)
floor.select_set(True); sc.view_layers[0].objects.active = floor
sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True; sc.render.bake.use_pass_color = False
sc.render.bake.margin = 4
win = bpy.context.window_manager.windows[0]  # (after read_homefile the bake needs its context handed over)
with bpy.context.temp_override(window=win, scene=sc, view_layer=sc.view_layers[0], active_object=floor, object=floor, selected_objects=[floor], selected_editable_objects=[floor]):
    bpy.ops.object.bake(type='DIFFUSE')

# stored at half range (the game's BAKE.k takes it back up) as an 8-bit sRGB JPEG, ~120 KB (a PNG of the noise is 4 MB)
import numpy as np
a = np.array(img.pixels[:], dtype=np.float32).reshape(RES[1], RES[0], 4)
k = np.array([1, 4, 6, 4, 1], np.float32) / 16
for _ in range(SMOOTH):
    for ax in (0, 1):
        p = np.pad(a, [(2, 2) if i == ax else (0, 0) for i in range(3)], mode='edge')
        a = sum(k[j] * np.take(p, range(j, j + a.shape[ax]), axis=ax) for j in range(5))
px = a.ravel().tolist(); r = sorted(px[0::4]); print('light p50', round(r[len(r) // 2], 3), 'p99', round(r[int(len(r) * 0.99)], 3))
out = bpy.data.images.new('wing_floor_light_out', RES[0], RES[1], float_buffer=True)
out.pixels = [min(1.0, v * 0.5) if (i % 4) != 3 else 1.0 for i, v in enumerate(px)]
st = sc.render.image_settings; st.file_format = 'JPEG'; st.quality = 88; st.color_mode = 'RGB'
try: st.color_management = 'OVERRIDE'; st.view_settings.view_transform = 'Standard'
except Exception as e: print('colour management:', e)
out.save_render(OUT, scene=sc)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'props', 'wing_floor_bake.blend'))
print('baked ->', OUT)
