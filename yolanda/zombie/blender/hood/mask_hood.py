# Chapter 2, the look pass (HANDOFF_PC_START.md C3, the user: "too many straight lines and not enough blending" between dirt,
# grass, sidewalk, road and water): the ground's splat mask, made from the map itself.
#   blender -b blender/hood/hood.blend --python blender/hood/mask_hood.py
# Four top-down renders of the scene (Workbench, orthographic, the bake's extents: X0..X1, Z0..Z1 at 0.25 m a pixel):
#   pave    the paved ground (roads, walks, drives, kerbs, the pool's apron)      water  the lake
#   walls   what stands on the ground, cut 0.05 - 0.7 m (houses, fences, cars)  trees  the canopies
# then, in numpy, soft bands round each (box blurs) broken up by noise, into assets/neighborhood/hood_splat.png:
#   r  worn dirt: a ragged strip along every kerb and drive edge, at the foot of walls and fences
#   g  leaf litter: under the trees, thickest under the canopies' middles
#   b  dryness: the lawn going thin and yellow near pavement and walls (heat off the concrete, feet)
#   (alpha 1: a browser drawing a PNG may premultiply it, which would wipe the other channels)
# The game reads it in terrain.js (terrainMaterial splat / rect) and for the grass tufts (src/hood/grass.js: pave and
# walls to keep tufts off, more of them along edges).
import bpy, os, sys, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'neighborhood', 'hood_splat.png')
OUT_MASK = os.path.join(ROOT, 'assets', 'neighborhood', 'hood_paths.png')   # (the grass's keep-off map, and the shore:
#   r pave   g walls on land; in the lake its depth, 0 at the edge to 1 a few metres out (the shallows: materials.js shoreWater)
#   b the shore band on land, highest at the water's edge (wet sand and mud: terrain.js); 1 under the water (mud))
OUT_LAWN = os.path.join(ROOT, 'assets', 'neighborhood', 'hood_lawn.png')   # (the lawn's wear, Marc's goal picture 2026-10-21:
#   r the uncut edge: taller, darker grass in a ragged band along the buildings, fences and walls (and the leaves that gather
#     there); less of it in ragged patches over the open common ground away from the houses (rougher, nobody's yard)
#   g worn: thin grass just outside the patios' doors, fading out along a faint walking route; round the playground's pad
#   b bare soil: round the AC units and at the patios' outer corners)
X0, X1, Z0, Z1 = -70.0, 110.0, -130.0, 96.0    # (as bake_hood.py)
# Chapter 4's peninsula (blender/grammy/grammy.blend) uses it too: MASK_RECT="x0,x1,z0,z1", MASK_OUT / MASK_OUT2 (the two
# pngs) and MASK_WATER=terrain (its water plane runs under the whole map: the water is where the ground dips below it)
if os.environ.get('MASK_RECT'): X0, X1, Z0, Z1 = [float(v) for v in os.environ['MASK_RECT'].split(',')]
OUT = os.environ.get('MASK_OUT') or OUT; OUT_MASK = os.environ.get('MASK_OUT2') or OUT_MASK; OUT_LAWN = os.environ.get('MASK_OUT3') or OUT_LAWN
MPP = 0.25
W, H = int((X1 - X0) / MPP), int((Z1 - Z0) / MPP)
sc = bpy.context.scene
TMP = os.path.join(os.environ.get('TEMP', '/tmp'), 'hood_mask_%d' % os.getpid()); os.makedirs(TMP, exist_ok=True)

PAVE_MATS = ('M_asphalt', 'M_concrete', 'M_pavers', 'HOOD_markings', 'M_wood_raw')
def is_pave(o): return o.type == 'MESH' and any(m and m.name.startswith(PAVE_MATS) for m in o.data.materials) and o.name not in ('terrain', 'verges', 'lake', 'shore')

cam = bpy.data.objects.new('MASKCAM', bpy.data.cameras.new('MASKCAM')); sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(X1 - X0, Z1 - Z0)
cam.location = ((X0 + X1) / 2, -(Z0 + Z1) / 2, 60); cam.rotation_euler = (0, 0, 0)
sc.camera = cam
try: sc.render.engine = 'BLENDER_WORKBENCH'
except TypeError: pass
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.film_transparent = False
sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'SINGLE'; sh.single_color = (1, 1, 1); sh.background_type = 'VIEWPORT'
sc.display.shading.show_shadows = False; sc.display.shading.show_cavity = False
try: sh.background_color = (0, 0, 0)
except Exception: pass
sc.world = sc.world or bpy.data.worlds.new('W'); sc.world.color = (0, 0, 0)
sc.view_settings.view_transform = 'Standard'

LIBSET = set(bpy.data.collections['LIB'].all_objects) if 'LIB' in bpy.data.collections else set()
ALL = [o for o in sc.objects if o.type in ('MESH', 'EMPTY') and o not in LIBSET]   # (the models' own templates stay as they are: the placed copies draw from them)
def render(name, show, clip=(0.05, 200.0)):
    for o in ALL: o.hide_render = not show(o)
    coll = bpy.data.collections.get('LIB')
    if coll: coll.hide_render = True
    cam.data.clip_start, cam.data.clip_end = 60 - clip[1], 60 - clip[0]
    path = os.path.join(TMP, name + '.png'); sc.render.filepath = path; sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(path); a = np.array(im.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1, :, 0]; bpy.data.images.remove(im)
    print(name, 'covers', round(float((a > 0.5).mean()) * 100, 1), '%')
    return (a > 0.5).astype(np.float32)   # (rows from the top: z from Z0 at row 0)

in_coll = lambda o, n: any(c.name == n for c in o.users_collection)
pave = render('pave', lambda o: (in_coll(o, 'GROUND') or in_coll(o, 'NEW')) and is_pave(o), clip=(-1.0, 0.6))
water = render('water', lambda o: o.name.startswith('lake'), clip=(-2.0, 0.5)) if os.environ.get('MASK_WATER') != 'terrain' else         render('water', lambda o: o.name == 'terrain', clip=(-5.0, -0.36))
walls = render('walls', lambda o: in_coll(o, 'PLACED') and not os.path.basename(o.get('src', '')).startswith(('nbt_', 'palm_', 'shrub', 'yard', 'curb_', 'hood_play_pad', 'tennis', 'volleyball', 'pool_deck', 'debris')), clip=(0.08, 0.7))
trees = render('trees', lambda o: in_coll(o, 'PLACED') and os.path.basename(o.get('src', '')).startswith(('nbt_', 'palm_')), clip=(1.0, 40.0))
# the models' own floors near the ground (a garage's concrete, a porch, the courts, the pool deck, the playground's pad): no
# grass on them (the polish brief: tufts were growing on the neighbour's garage floor and the clubhouse porch)
floors = render('floors', lambda o: in_coll(o, 'PLACED') and not os.path.basename(o.get('src', '')).startswith(('nbt_', 'palm_', 'shrub', 'yard', 'debris', 'nb_frond')), clip=(-0.05, 0.2))

def blur(a, r):
    """a box blur of radius r pixels (twice: close to a soft bell), by cumulative sums"""
    for _ in range(2):
        p = np.pad(a, ((r + 1, r), (0, 0)), mode='edge'); c = np.cumsum(p, axis=0); a = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
        p = np.pad(a, ((0, 0), (r + 1, r)), mode='edge'); c = np.cumsum(p, axis=1); a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return a
def noise(scale, seed):
    """value noise at `scale` m, smoothed (several octaves summed by the caller)"""
    rng = np.random.default_rng(seed); n = max(2, int(scale / MPP))
    g = rng.random((H // n + 3, W // n + 3)).astype(np.float32)
    yi = np.arange(H) / n; xi = np.arange(W) / n; y0 = yi.astype(int); x0 = xi.astype(int); fy = (yi - y0)[:, None]; fx = (xi - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
def ss(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

N = noise(1.5, 1) * 0.5 + noise(4, 2) * 0.35 + noise(0.6, 3) * 0.15     # (ragged edges: breaks every 1 - 4 m)
lawn = (1 - pave) * (1 - water)
near_pave = blur(pave, int(1.4 / MPP)); far_pave = blur(pave, int(2.8 / MPP))
near_wall = blur(walls, int(0.7 / MPP))
# r: dirt in a ragged strip along the pavement's edges (0 - ~1.2 m), at the foot of walls and fences
dirt = np.clip(ss(0.03, 0.3, near_pave) * (0.65 + 1.1 * (N - 0.5) + 0.35) + ss(0.05, 0.4, near_wall) * (0.7 + 0.6 * (N - 0.5)), 0, 1) * lawn
dirt = np.where(dirt > 0.06, dirt, 0) * ss(0.15, 0.45, N + 0.12)
# g: leaf litter under the trees
litter = np.clip(ss(0.1, 0.7, blur(trees, int(1.5 / MPP))) * (0.6 + 0.8 * (noise(2, 4) - 0.5)), 0, 1) * lawn
# b: dryness near the pavement and walls
dry = np.clip(ss(0.02, 0.4, far_pave) * 0.8 + ss(0.05, 0.5, blur(walls, int(1.6 / MPP))) * 0.6, 0, 1) * (0.6 + 0.6 * (noise(3, 5) - 0.5)) * lawn
# the shore band: highest at the water's edge, gone a few metres either side (wet sand on land, the shallows in the water)
wb = blur(water, int(1.5 / MPP))
shore = np.clip(ss(0.0, 1.0, 4.0 * wb * (1.0 - wb)) * (0.7 + 0.7 * (N - 0.5)), 0, 1)
shore = np.where(water > 0.5, 1.0, shore * (1 - water))
depth = ss(0.5, 0.97, wb + (N - 0.5) * 0.18) * water   # (ragged, so the straight edges of the lake's mesh don't show)

img = np.stack([dirt, litter, dry, np.ones_like(dirt)], axis=-1)[::-1]          # (back to image rows from the bottom)
out = bpy.data.images.new('hood_splat', W, H, alpha=True); out.pixels[:] = np.clip(img, 0, 1).ravel(); out.filepath_raw = OUT; out.file_format = 'PNG'; out.save()
keep = np.stack([np.maximum(pave, floors), np.where(water > 0.5, depth, walls), shore, np.ones_like(pave)], axis=-1)[::-1]
out2 = bpy.data.images.new('hood_paths', W, H, alpha=True); out2.pixels[:] = keep.ravel(); out2.filepath_raw = OUT_MASK; out2.file_format = 'PNG'; out2.save()
print('saved', OUT, OUT_MASK, W, H)

# ---------------------------------------------------------------- the lawn's wear (OUT_LAWN)
GX = X0 + (np.arange(W) + 0.5) * MPP; GZ = Z0 + (np.arange(H) + 0.5) * MPP   # (game x of each column, game z of each row)
def window(cx, cz, r):
    i0, i1 = max(0, int((cx - r - X0) / MPP)), min(W, int((cx + r - X0) / MPP) + 1); j0, j1 = max(0, int((cz - r - Z0) / MPP)), min(H, int((cz + r - Z0) / MPP) + 1)
    return j0, j1, i0, i1, np.meshgrid(GX[i0:i1], GZ[j0:j1])
def stamp(a, cx, cz, r, k=1.0, soft=0.5):
    """a soft disc of radius r at (cx, cz), the larger value kept"""
    j0, j1, i0, i1, (X, Z) = window(cx, cz, r)
    if j1 <= j0 or i1 <= i0: return
    d = np.hypot(X - cx, Z - cz); a[j0:j1, i0:i1] = np.maximum(a[j0:j1, i0:i1], k * (1 - ss(r * (1 - soft), r, d)))
def route(a, p, u, L, w0, w1, k0, k1):
    """a worn strip from p out along u: L m long, w0 -> w1 wide, k0 -> k1 strong"""
    cx, cz = p[0] + u[0] * L / 2, p[1] + u[1] * L / 2
    j0, j1, i0, i1, (X, Z) = window(cx, cz, L / 2 + w0)
    if j1 <= j0 or i1 <= i0: return
    t = (X - p[0]) * u[0] + (Z - p[1]) * u[1]; s_ = np.abs(-(X - p[0]) * u[1] + (Z - p[1]) * u[0]); f = np.clip(t / L, 0, 1)
    w = w0 + (w1 - w0) * f; v = (k0 + (k1 - k0) * f) * (1 - ss(w * 0.4, w, s_)) * (t > -0.3) * (t < L)
    a[j0:j1, i0:i1] = np.maximum(a[j0:j1, i0:i1], v)
# the buildings, fences and walls as their collision boxes (not cars or props: no tall grass round a car)
solid = np.zeros((H, W), np.float32)
for o in bpy.data.collections['COL'].objects:
    t = o.get('tag') or ''
    if not (t.startswith(('bld:', 'block:', 'seal:')) or t in ('boundary', 'fence')) or o.get('col') != 'box': continue
    cx, cz, hx, hz, a = o.location.x, -o.location.y, o.scale.x / 2, o.scale.y / 2, o.rotation_euler.z
    j0, j1, i0, i1, (X, Z) = window(cx, cz, math.hypot(hx, hz) + 0.3)
    if j1 <= j0 or i1 <= i0: continue
    dx, dz = X - cx, Z - cz; lx = dx * math.cos(a) - dz * math.sin(a); lz = dx * math.sin(a) + dz * math.cos(a)   # (the box's own axes: Blender's turn about z, game z = -y)
    solid[j0:j1, i0:i1] = np.maximum(solid[j0:j1, i0:i1], ((np.abs(lx) <= hx) & (np.abs(lz) <= hz)).astype(np.float32))
Ne = noise(1.2, 11) * 0.6 + noise(3.5, 12) * 0.4
edge = ss(0.03, 0.35, blur(solid, int(1.3 / MPP))) * (1 - solid) * ss(0.28, 0.6, Ne + 0.12) * lawn
worn = np.zeros((H, W), np.float32); soil = np.zeros((H, W), np.float32)
from mathutils import Vector
n_p = n_ac = 0
for e in bpy.data.collections['PLACED'].objects:
    c = e.instance_collection.name if e.instance_collection else ''
    M = e.matrix_world
    if c.startswith('patio_cage'):
        g = lambda lx, ly: (lambda w: (w.x, -w.y))(M @ Vector((lx, ly, 0)))
        door, out = g(0, -4.15), g(0, -5.15); u = (out[0] - door[0], out[1] - door[1]); ul = math.hypot(*u) or 1; u = (u[0] / ul, u[1] / ul)
        stamp(worn, door[0] + u[0] * 0.6, door[1] + u[1] * 0.6, 1.7, 1.0)        # (just outside the door: thin)
        route(worn, door, u, 8.0, 1.4, 0.6, 0.85, 0.0)                             # (and the way people walked off it)
        for sx in (-3.25, 3.25):
            q = g(sx, -4.15); stamp(soil, q[0], q[1], 0.75, 0.9)
        n_p += 1
    elif c.startswith('by_ac_unit'):
        stamp(soil, e.location.x, -e.location.y, 1.15, 1.0, 0.6); n_ac += 1
# the open common ground: little built within ~5 m; ragged patches of it rough
open_ = 1 - ss(0.0, 0.05, blur(solid, int(5.0 / MPP)))
edge = np.maximum(edge, open_ * ss(0.42, 0.7, noise(6.0, 15) * 0.6 + noise(2.0, 16) * 0.4) * 0.65 * lawn)
# the playground: worn in a band round its pad (PAD_C, PAD_YAW, 16 x 12 m: ch2_notes.py), feet coming and going
PC, PY, PH = (-46.5, -7.0), 0.834, (8.0, 6.1)
j0, j1, i0, i1, (X, Z) = window(PC[0], PC[1], 14.0)
dx, dz = X - PC[0], Z - PC[1]; lx = dx * math.cos(PY) - dz * math.sin(PY); lz = dx * math.sin(PY) + dz * math.cos(PY)
dd = np.hypot(np.maximum(np.abs(lx) - PH[0], 0), np.maximum(np.abs(lz) - PH[1], 0))
worn[j0:j1, i0:i1] = np.maximum(worn[j0:j1, i0:i1], 0.75 * (1 - ss(0.3, 3.0, dd)) * (dd > 0))
Nw = noise(0.8, 13) * 0.6 + noise(2.0, 14) * 0.4
worn = np.clip(worn * (0.75 + 0.5 * (Nw - 0.5)), 0, 1) * lawn
soil = np.clip(soil * ss(0.3, 0.55, Nw + 0.1), 0, 1) * lawn
img3 = np.stack([edge, worn, soil, np.ones_like(edge)], axis=-1)[::-1]
out3 = bpy.data.images.new('hood_lawn', W, H, alpha=True); out3.pixels[:] = np.clip(img3, 0, 1).ravel(); out3.filepath_raw = OUT_LAWN; out3.file_format = 'PNG'; out3.save()
print('saved', OUT_LAWN, 'patios', n_p, 'ac units', n_ac, 'edge', round(float((edge > 0.3).mean()) * 100, 1), '%')
