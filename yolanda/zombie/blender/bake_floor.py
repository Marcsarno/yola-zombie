# The chapter floors' baked light (2026-10-19; the lighting lab's upgrade A, blender/bake_wing_floor.py, for Floors 7, 6
# and 5). Input: shots/floor<n>_bake_scene.json, exported in the game by game.lightkit.exportBake(loose, bake, file) with
# the chapter's plan (render/floorlights.js): every static opaque mesh on the floor as world triangles, its bounds, its
# fittings and EXIT signs. Output: assets/hospital/floor<n>_light.jpg, the light falling on the floor (direct + bounced, no
# colour of its own) across the bounds, stored at half range; the game lays it on the floor as a lightMap, uv1 from world
# x / z:   u = (x - x0) / (x1 - x0),  v = 1 - (z - z0) / (z1 - z0)        (game axes: y up; Blender: x, -z, y)
# Run in a background Blender (it starts from an empty file and never touches an open session):
#   blender -b --factory-startup --python blender/bake_floor.py -- <floor> [samples]
import bpy, json, base64, struct, os, sys, math

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['7']
N = int(ARGS[0]); SAMPLES = int(ARGS[1]) if len(ARGS) > 1 else 384
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'shots', 'floor%d_bake_scene.json' % N)
OUT = os.path.join(ROOT, 'assets', 'hospital', 'floor%d_light.jpg' % N)
PX = 0.04                   # metres a pixel (the floors are ~49 x 44 m: ~1230 x 1090)
SMOOTH = 3                  # passes of a 5-tap blur (the grain out; furniture shadows kept)
CEIL = 2.7                  # the chapter's wall height (core/chapter.js WH): a ceiling to hold the bounce in
TUBE_W = 140.0              # watts for a fitting at k 0.55 (the wing's calibration, by eye in the lab)
EXIT_W = 6.0

D = json.load(open(SRC))
B = D['bounds']; x0, x1, z0, z1 = B['x0'], B['x1'], B['z0'], B['z1']
RES = (int(round((x1 - x0) / PX)), int(round((z1 - z0) / PX)))
g2b = lambda x, y, z: (x, -z, y)
sc = bpy.context.scene
for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)

def mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = 0.8
    return m

def mesh_from(name, verts, faces, m):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); me.materials.append(m); return ob

verts, faces = [], []
for M in D['meshes']:
    if M['floor']: continue
    raw = base64.b64decode(M['tris']); f = struct.unpack('<%df' % (len(raw) // 4), raw)
    for t in range(0, len(f), 9):
        i = len(verts)
        for k in range(3): verts.append(g2b(f[t + k * 3], f[t + k * 3 + 1], f[t + k * 3 + 2]))
        faces.append((i, i + 1, i + 2))
occ = mesh_from('Occluders', verts, faces, mat('occluder', (0.28, 0.28, 0.28)))
print('occluders', len(faces))
W, Dp = x1 - x0, z1 - z0
floor = mesh_from('FloorBake', [g2b(x0, 0, z0), g2b(x1, 0, z0), g2b(x1, 0, z1), g2b(x0, 0, z1)], [(0, 3, 2, 1)], mat('floor', (0.45, 0.45, 0.45)))
uvl = floor.data.uv_layers.new(name='bake')
for poly in floor.data.polygons:
    for li in poly.loop_indices:
        x, by, _ = floor.data.vertices[floor.data.loops[li].vertex_index].co; z = -by
        uvl.data[li].uv = ((x - x0) / W, 1 - (z - z0) / Dp)
mesh_from('Ceiling', [g2b(x0, CEIL, z0), g2b(x1, CEIL, z0), g2b(x1, CEIL, z1), g2b(x0, CEIL, z1)], [(0, 1, 2, 3)], mat('ceiling', (0.18, 0.18, 0.18)))

def hexrgb(h): return (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
lit = 0
for i, F in enumerate(D['fixtures'] or []):
    if F.get('state') == 'dead': continue
    L = bpy.data.lights.new('tube%d' % i, 'AREA'); L.shape = 'RECTANGLE'; L.size = 1.25; L.size_y = 0.16
    L.energy = TUBE_W * F['k'] / 0.55 * (0.55 if F.get('state') == 'failing' else 1.0); L.color = hexrgb(F['col']) if F.get('col') is not None else (0.88, 0.92, 1.0)
    o = bpy.data.objects.new('tube%d' % i, L); o.location = g2b(F['x'], 2.6, F['z']); sc.collection.objects.link(o); lit += 1
for i, E in enumerate(D.get('exits') or []):
    L = bpy.data.lights.new('exit%d' % i, 'POINT'); L.energy = EXIT_W; L.color = (0.2, 1.0, 0.45); L.shadow_soft_size = 0.2
    o = bpy.data.objects.new('exit%d' % i, L); o.location = g2b(E['x'], 2.25, E['z']); sc.collection.objects.link(o)
print('lights', lit, 'res', RES)

w = bpy.data.worlds.new('dim'); w.use_nodes = True; sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.006, 0.007, 0.008, 1); bg.inputs[1].default_value = 1

try: sc.render.engine = 'CYCLES'
except TypeError as e: print('engine:', e)
sc.cycles.samples = SAMPLES
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA'):
        try: prefs.compute_device_type = t; prefs.get_devices(); break
        except Exception: continue
    for d in prefs.devices: d.use = d.type != 'CPU'
    if any(d.use for d in prefs.devices): sc.cycles.device = 'GPU'
    print('device', prefs.compute_device_type, sc.cycles.device)
except Exception as e: print('device:', e)
img = bpy.data.images.new('floor_light', RES[0], RES[1], float_buffer=True)
fm = floor.data.materials[0]; nt = fm.node_tree
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
for o in sc.objects: o.select_set(False)
floor.select_set(True); bpy.context.view_layer.objects.active = floor
sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True; sc.render.bake.use_pass_color = False
sc.render.bake.margin = 4
bpy.ops.object.bake(type='DIFFUSE')

import numpy as np
a = np.array(img.pixels[:], dtype=np.float32).reshape(RES[1], RES[0], 4)
k = np.array([1, 4, 6, 4, 1], np.float32) / 16
for _ in range(SMOOTH):
    for ax in (0, 1):
        p = np.pad(a, [(2, 2) if i == ax else (0, 0) for i in range(3)], mode='edge')
        a = sum(k[j] * np.take(p, range(j, j + a.shape[ax]), axis=ax) for j in range(5))
r = np.sort(a[..., 0].ravel()); print('light p50', round(float(r[len(r) // 2]), 3), 'p99', round(float(r[int(len(r) * 0.99)]), 3))
o = np.clip(a * 0.5, 0, 1); o[..., 3] = 1
out = bpy.data.images.new('floor_light_out', RES[0], RES[1], float_buffer=True)
out.pixels = o.ravel().tolist()
st = sc.render.image_settings; st.file_format = 'JPEG'; st.quality = 86; st.color_mode = 'RGB'
try: st.color_management = 'OVERRIDE'; st.view_settings.view_transform = 'Standard'
except Exception as e: print('colour management:', e)
out.save_render(OUT, scene=sc)
print('baked ->', OUT)
