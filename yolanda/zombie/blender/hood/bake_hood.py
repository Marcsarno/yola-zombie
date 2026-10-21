# Chapter 2: bakes the neighbourhood's light onto its ground (the user: "you bake the shadows into Blender. So it's not so
# taxing on the machine"; the old build's live sun "you went to look at the tennis courts ... you couldn't even see it").
#   blender -b blender/hood/hood.blend --python blender/hood/bake_hood.py -- [samples] [px]
# Chapter 4's peninsula bakes with it too (blender/grammy/grammy.blend): BAKE_RECT="x0,x1,z0,z1", BAKE_OUT=<jpg> and
# BAKE_FLOORLIKE="name,..." (more models that take the bake themselves) in the environment.
# A flat plane over the whole map takes the light that reaches the ground (sun + sky, every house, tree, car and fence
# casting, nothing of its own colour); the ground meshes themselves are left out of the render so they do not shade it.
# Output: assets/neighborhood/hood_light.jpg, the light stored at half range (0.5 = full sun on open ground), and the game
# multiplies the ground by it, sampled by world x / z:  u = (x - X0) / (X1 - X0),  v = 1 - (z - Z0) / (Z1 - Z0).
import bpy, os, sys, math
from mathutils import Vector

A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SAMPLES = int(A[0]) if A else 96
PX = int(A[1]) if len(A) > 1 else 2048
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.environ.get('BAKE_OUT') or os.path.join(ROOT, 'assets', 'neighborhood', 'hood_light.jpg')
X0, X1, Z0, Z1 = -70.0, 110.0, -130.0, 96.0         # (game x / z; must match src/hood/cutaway.js CUT.lmRect; Z0: the dock and the shed, ch2_dock.py)
if os.environ.get('BAKE_RECT'): X0, X1, Z0, Z1 = [float(v) for v in os.environ['BAKE_RECT'].split(',')]
SUN_FROM = Vector((-0.55, -0.56, 0.62)).normalized()  # (the game's SUN_FROM (x, y, z) -> Blender (x, -z, y))
sc = bpy.context.scene

# what renders: the placed models only (ground, collision, marks, the old sun and camera out)
for c in ('GROUND', 'COL', 'MARKS', 'LIB'):
    coll = bpy.data.collections.get(c)
    if coll: coll.hide_render = True
for o in list(sc.objects):
    if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o, do_unlink=True)
# floors that take the bake themselves (the game lays it on every near-ground surface): left out, so they don't black out
# the light under them; what stands on them (nets, fences, trees) still casts onto them
FLOORLIKE = ('tennis_court', 'volleyball_court', 'pool_deck', 'curb_', 'playground') + tuple(v for v in os.environ.get('BAKE_FLOORLIKE', '').split(',') if v)
for e in bpy.data.collections['PLACED'].objects:
    if os.path.basename(e.get('src', '')).startswith(FLOORLIKE): e.hide_render = True

sun = bpy.data.objects.new('BakeSun', bpy.data.lights.new('BakeSun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 4.0; sun.data.angle = math.radians(3.5)
sun.data.color = (1.0, 0.94, 0.84)   # (the look pass: a warm key, the sky's cool fill in the shadows; softer edges)
sun.rotation_euler = (-SUN_FROM).to_track_quat('-Z', 'Y').to_euler()
w = sc.world or bpy.data.worlds.new('Sky'); sc.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.62, 0.72, 0.85, 1); bg.inputs['Strength'].default_value = 0.9

# the catcher: a plane over the map, white diffuse, UV = world x / z (game)
me = bpy.data.meshes.new('LightCatcher')
me.from_pydata([(X0, -Z0, 0.002), (X1, -Z0, 0.002), (X1, -Z1, 0.002), (X0, -Z1, 0.002)], [], [(0, 3, 2, 1)]); me.update()  # (wound to face up)
uv = me.uv_layers.new(name='bake')
for poly in me.polygons:
    for li in poly.loop_indices:
        x, by, _ = me.vertices[me.loops[li].vertex_index].co; z = -by
        uv.data[li].uv = ((x - X0) / (X1 - X0), 1 - (z - Z0) / (Z1 - Z0))
cat = bpy.data.objects.new('LightCatcher', me); sc.collection.objects.link(cat)
m = bpy.data.materials.new('Catcher'); m.use_nodes = True
p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); p.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1); p.inputs['Roughness'].default_value = 1
img = bpy.data.images.new('hood_light', PX, int(PX * (Z1 - Z0) / (X1 - X0)), float_buffer=True)
t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img; m.node_tree.nodes.active = t
me.materials.append(m)

try: sc.render.engine = 'CYCLES'
except TypeError: pass
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
        try: prefs.compute_device_type = kind; prefs.get_devices(); break
        except Exception: continue
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception as e: print('gpu?', e)
sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True; sc.render.bake.use_pass_color = False
sc.render.bake.margin = 4
bpy.ops.object.select_all(action='DESELECT'); cat.select_set(True); bpy.context.view_layer.objects.active = cat
print('baking %dx%d at %d samples' % (img.size[0], img.size[1], SAMPLES))
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=4)
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
if os.environ.get('HOOD_RAW'):
    img.filepath_raw = os.environ['HOOD_RAW']; img.file_format = 'OPEN_EXR'; img.save(); print('raw saved')
# stored at half range: 0.5 = this image's open-ground level (the brightest 2% of the map)
px = list(img.pixels)
lum = sorted(0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2] for i in range(0, len(px), 4 * 61))
ref = lum[int(len(lum) * 0.98)] or 1.0
k = 0.5 / ref
for i in range(0, len(px), 4):
    for c in range(3): px[i + c] = min(1.0, px[i + c] * k)
img.pixels = px
img.filepath_raw = OUT; img.file_format = 'JPEG'
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.color_mode = 'RGB'
sc.render.image_settings.quality = 78   # (polish 4: 6 MB at 88 -> about half; the light is soft, the loss does not show)
img.save_render(OUT)
print('saved', OUT, 'ref', ref)
