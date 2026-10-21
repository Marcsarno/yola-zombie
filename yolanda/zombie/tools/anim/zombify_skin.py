# A survivor made into an ordinary-people zombie by its textures alone (2026-10-21, the user: "taking a couple of the
# survivors.. adding green, some decay.. texture their skin and face .. maybe some blood"). Background Blender:
#   blender -b --factory-startup --python zombify_skin.py -- <survivor.glb> <out.glb> [seed=1] [green=1] [decay=1]
#           [blood=1] [grime=1] [prev=<dir>]   (prev: each base-colour texture before and after, as PNG, to look at)
#           [top=<rrggbb>] [bottom=jeans|<rrggbb>]   (new clothes: the top / the trousers recoloured, keeping their folds;
#           which is which from the bones the cloth moves with: arms and spine / hips and legs, never the hands, feet or skin)
# The skin is found by its colour (warm, moderately saturated, red > green > blue; never in a hair or lash material), so
# it works on Mixamo's atlases where skin and clothes share one texture. On the skin: a pale grey-green that keeps the
# texture's own shading, large rotten patches (olive, bruise-purple), a fine blotchy grain. On the clothes and hair: dirt
# and a little fading. Everywhere: blood splats with satellite drops and darker dried rims. The mesh, rig and clips are
# left as they are (the survivor's clips export again).
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[:2]
opt = dict(a.split('=', 1) for a in argv[2:] if '=' in a)
SEED = int(opt.get('seed', 1)); PREV = opt.get('prev')
K_GREEN, K_DECAY, K_BLOOD, K_GRIME = (float(opt.get(k, 1)) for k in ('green', 'decay', 'blood', 'grime'))
TOP, BOTTOM = opt.get('top'), opt.get('bottom')
rng = np.random.default_rng(SEED)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(SRC))

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def noise(h, w, cells, octaves=4):  # fractal value noise over the texture (0..1)
    out = np.zeros((h, w), np.float32); amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = cells * 2 ** o; g = rng.random((c + 1, c + 1)).astype(np.float32)
        ys, xs = np.linspace(0, c, h, dtype=np.float32), np.linspace(0, c, w, dtype=np.float32)
        y0, x0 = np.minimum(ys.astype(int), c - 1), np.minimum(xs.astype(int), c - 1)
        fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]; fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        a, b, cc, d = g[y0][:, x0], g[y0][:, x0 + 1], g[y0 + 1][:, x0], g[y0 + 1][:, x0 + 1]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy); tot += amp; amp *= 0.5
    return out / tot

def blur(m, r):  # box blur, twice (near-gaussian)
    for _ in range(2):
        p = np.pad(m, r, mode='edge'); c = p.cumsum(0); c = np.vstack([np.zeros((1, c.shape[1]), c.dtype), c]); m = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
        c = m.cumsum(1); c = np.hstack([np.zeros((c.shape[0], 1), c.dtype), c]); m = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return m

def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1); d = np.maximum(mx - mn, 1e-5)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return hue, (mx - mn) / np.maximum(mx, 1e-4), mx

def skin_mask(rgb, s):  # warm hues from pink to tan, not grey, not dark (hair), not saturated (red cloth)
    hue, sat, val = hsv(rgb)
    m = ((hue < 48) | (hue > 335)) & (sat > 0.09) & (sat < 0.68) & (val > 0.3)
    return np.clip(blur(m.astype(np.float32), max(1, s // 256)) * 1.4 - 0.2, 0, 1)

def splats(h, w, n):  # blood: smears of a few overlapping lobes with ragged edges, a few fine drops, some runs
    m = np.zeros((h, w), np.float32); rag = noise(h, w, 40, 3)
    for _ in range(n):
        cy, cx, R = rng.random() * h, rng.random() * w, (0.006 + rng.random() ** 2 * 0.022) * w
        a = rng.random() * np.pi
        pts = [(cy + np.sin(a) * t * R * 1.6 + rng.normal() * R * 0.3, cx + np.cos(a) * t * R * 1.6 + rng.normal() * R * 0.3, R * (0.5 + rng.random() * 0.6)) for t in np.linspace(-1, 1, rng.integers(2, 6))]
        pts += [(cy + rng.normal() * R * 2.2, cx + rng.normal() * R * 2.2, R * (0.04 + rng.random() * 0.1)) for _ in range(rng.integers(0, 6))]
        if rng.random() < 0.45:  # a run (along the texture's v: often down the body, not always)
            L = R * (3 + rng.random() * 6); x0r = cx + rng.normal() * R * 0.4
            pts += [(cy + t * L, x0r + np.sin(t * 7) * R * 0.08, R * 0.16 * (1 - t * 0.5)) for t in np.linspace(0, 1, 48)]
            pts.append((cy + L, x0r, R * 0.22))
        for y, x, r in pts:
            y0, y1, x0, x1 = int(max(0, y - r * 1.8)), int(min(h, y + r * 1.8)), int(max(0, x - r * 1.8)), int(min(w, x + r * 1.8))
            if y1 <= y0 or x1 <= x0: continue
            yy, xx = np.mgrid[y0:y1, x0:x1]; d = np.hypot(yy - y, xx - x) / r
            m[y0:y1, x0:x1] = np.maximum(m[y0:y1, x0:x1], smooth(1.25, 0.8, d + (rag[y0:y1, x0:x1] - 0.5) * 1.4))
    return m

# ---- the face, found on the body itself (round 3): the texture alone does not say where the eyes or the mouth are, so
# they are placed in 3D (the nose's tip: the head's most forward point; forward: from the foot to the toes) and painted
# into each texture through the mesh's UVs. Per vertex: 'eye' (dark sunken sockets) and 'gore' (blood round the mouth,
# down the chin, the throat and the front of the shirt in a few runs). Seam-free, unlike the texture-space noise.
def raster(mask, uv, val):  # one triangle's values into a texture mask (max), uv in 0..1 (Blender rows: v up)
    h, w = mask.shape; P = uv * np.array([w, h], np.float32)
    x0, x1 = int(max(0, np.floor(P[:, 0].min()))), int(min(w - 1, np.ceil(P[:, 0].max()))); y0, y1 = int(max(0, np.floor(P[:, 1].min()))), int(min(h - 1, np.ceil(P[:, 1].max())))
    if x1 < x0 or y1 < y0: return
    yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float32); xx += 0.5; yy += 0.5
    (ax, ay), (bx, by), (cx, cy) = P; d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-9: return
    l1 = ((by - cy) * (xx - cx) + (cx - bx) * (yy - cy)) / d; l2 = ((cy - ay) * (xx - cx) + (ax - cx) * (yy - cy)) / d; l3 = 1 - l1 - l2
    ins = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
    v = l1 * val[0] + l2 * val[1] + l3 * val[2]
    sub = mask[y0:y1 + 1, x0:x1 + 1]; np.maximum(sub, np.where(ins, v, 0), out=sub)

def base_image(mat):  # the image on a material's base colour, or None
    if not mat or not mat.node_tree: return None
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    lk = bsdf.inputs['Base Color'].links if bsdf else []
    return lk[0].from_node.image if lk and lk[0].from_node.type == 'TEX_IMAGE' else None

def face_masks():
    out = {}  # image name -> {'eye': mask, 'gore': mask}
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    bones = {b.name.split(':')[-1].replace('mixamorig', ''): b for b in arm.data.bones} if arm else {}
    for ob in [o for o in bpy.data.objects if o.type == 'MESH' and o.data.uv_layers]:
        me = ob.data; n = len(me.vertices); co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(n, 3)
        nr = np.empty(n * 3, np.float32); me.vertices.foreach_get('normal', nr); nr = nr.reshape(n, 3)
        M = np.array(ob.matrix_world, np.float32); co = co @ M[:3, :3].T + M[:3, 3]; nr = nr @ M[:3, :3].T; nr /= np.maximum(np.linalg.norm(nr, axis=1, keepdims=True), 1e-6)
        zmin, zmax = co[:, 2].min(), co[:, 2].max(); s = (zmax - zmin) / 1.75
        A = np.array(arm.matrix_world, np.float32) if arm else np.eye(4, dtype=np.float32)
        wp = lambda b: (A @ np.array([*b.head_local, 1], np.float32))[:3]
        if 'LeftFoot' in bones and 'LeftToeBase' in bones: f = wp(bones['LeftToeBase']) - wp(bones['LeftFoot']); f[2] = 0
        else: f = np.array([0, -1, 0], np.float32)
        fwd = f / max(np.linalg.norm(f), 1e-6); up = np.array([0, 0, 1], np.float32); side = np.cross(fwd, up)
        hz = wp(bones['Head'])[2] if 'Head' in bones else zmax - 0.12 * s
        head = co[:, 2] > hz - 0.02 * s
        if not head.any(): continue
        tip = co[head][np.argmax(co[head] @ fwd)]
        eyes = [tip + up * 0.034 * s - fwd * 0.03 * s + side * k * 0.032 * s for k in (-1, 1)]
        mouth = tip - up * 0.042 * s - fwd * 0.014 * s
        front = np.clip((nr @ fwd + 0.1) / 0.6, 0, 1)
        de = np.minimum(*[np.linalg.norm(co - e, axis=1) for e in eyes])
        eye = smooth(0.048 * s, 0.014 * s, de) * front
        dm = np.linalg.norm(co - mouth, axis=1); gore = smooth(0.036 * s, 0.01 * s, dm)
        rel = co - mouth; down, lat = -(rel @ up), rel @ side; ahead = rel @ fwd
        for k in range(rng.integers(3, 6)):  # runs from the mouth down the chin, the throat, the shirt
            o = rng.normal() * 0.018 * s; wd = (0.006 + rng.random() * 0.012) * s; L = (0.06 + rng.random() ** 1.5 * 0.42) * s
            # (round 4: on David's shirt a straight run under a broad soaked patch read as the figure 7: the runs now taper
            # and wander, and the soak stays on the chin)
            ww = wd * np.clip(1 - 0.6 * down / L, 0.3, 1); wob = (np.sin(down / s * 23 + k * 1.7) * 0.007 + np.sin(down / s * 61 + k) * 0.003) * s
            g = smooth(ww * 1.2, ww * 0.35, np.abs(lat - o - wob)) * (down > -0.005 * s) * smooth(L, L * 0.6, down) * smooth(-0.06 * s, 0.0, ahead + 0.2 * s * (down > 0.12 * s)) * np.clip((nr @ fwd + 0.2) / 0.5, 0, 1)
            gore = np.maximum(gore, g)
        gore = np.maximum(gore, smooth(0.06 * s, 0.025 * s, np.hypot(lat * 1.3, down - 0.03 * s)) * (down > 0) * (down < 0.07 * s) * np.clip((nr @ fwd) / 0.4, 0, 1) * 0.85)  # (the chin soaked)
        # the clothes' parts (top=, bottom=): each vertex by the bone it moves with most
        part = {'top': np.zeros(n, np.float32), 'bottom': np.zeros(n, np.float32)}
        if TOP or BOTTOM:
            # (the hips' cloth is split by height: the shirt's hem moves with the hips too and had gone denim; a hood or
            # collar moves with the head, below the head's joint, where the eyes never are)
            gname = {g.index: g.name.split(':')[-1].replace('mixamorig', '') for g in ob.vertex_groups}
            waist = (wp(bones['Hips'])[2] if 'Hips' in bones else zmin + 0.52 * 1.75 * s) + float(opt.get('waist', 0.1)) * s
            for v in me.vertices:
                if not v.groups: continue
                b, z = gname[max(v.groups, key=lambda g: g.weight).group], co[v.index, 2]
                legs = any(b.startswith(sd + k) for sd in ('Left', 'Right') for k in ('UpLeg', 'Leg')) and 'Foot' not in b and 'Toe' not in b
                if legs or (b == 'Hips' and z < waist): part['bottom'][v.index] = 1
                elif b.startswith('Spine') or b in ('Hips', 'Neck') or (b == 'Head' and z < hz + 0.035 * s) or any(b == sd + k for sd in ('Left', 'Right') for k in ('Shoulder', 'Arm', 'ForeArm')): part['top'][v.index] = 1
            # (round 5: a long top's lower half moves with the hips and thighs and went denim. A garment is usually its own
            # piece of the mesh: each piece (vertices joined by edges or sharing a position, so UV seams do not split it)
            # takes the part most of it has, unless it is clearly both, as a body welded to its clothes is)
            par = list(range(n))
            def find(i):
                while par[i] != i: par[i] = par[par[i]]; i = par[i]
                return i
            for e in me.edges: a, b2 = find(e.vertices[0]), find(e.vertices[1]); par[a] = b2
            seen = {}
            for i, c in enumerate(map(tuple, np.round(co, 4))):
                j = seen.setdefault(c, i)
                if j != i: par[find(i)] = find(j)
            comp = np.array([find(i) for i in range(n)])
            for c in np.unique(comp):
                idx = comp == c; t, bo = part['top'][idx].sum(), part['bottom'][idx].sum()
                if t + bo < 20 or min(t, bo) > 0.25 * (t + bo): continue
                part['top'][idx], part['bottom'][idx] = (t > bo) * (part['top'][idx] + part['bottom'][idx] > 0), (bo >= t) * (part['top'][idx] + part['bottom'][idx] > 0)
            print('PIECES', len(np.unique(comp)))
        uvl = me.uv_layers.active.data; me.calc_loop_triangles()
        mats = [base_image(m) for m in me.materials]
        for t in me.loop_triangles:
            vs = list(t.vertices); vals = {'eye': eye[vs], 'gore': gore[vs], 'top': part['top'][vs], 'bottom': part['bottom'][vs]}
            if max(v.max() for v in vals.values()) < 0.01: continue
            img = mats[t.material_index] if t.material_index < len(mats) else None
            if img is None or any(k in me.materials[t.material_index].name.lower() for k in ('hair', 'lash', 'brow')): continue
            if img.name not in out: out[img.name] = {k: np.zeros((img.size[1], img.size[0]), np.float32) for k in vals}
            uv = np.array([uvl[l].uv[:] for l in t.loops], np.float32)
            for k, v in vals.items():
                if v.max() >= 0.01: raster(out[img.name][k], uv, v)
    return out
FACE = face_masks()

done = {}
report = []
for mat in bpy.data.materials:
    img = base_image(mat)
    if not img or img.name in done: continue
    hairy = any(k in mat.name.lower() for k in ('hair', 'lash', 'brow'))
    w, h = img.size; px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    rgb, alpha = px[..., :3].copy(), px[..., 3]
    if PREV: os.makedirs(PREV, exist_ok=True)
    def save(name, arr):
        if not PREV: return
        im = bpy.data.images.new(name, w, h, alpha=True); im.pixels.foreach_set(np.dstack([arr, alpha]).ravel()); im.filepath_raw = os.path.join(PREV, name + '.png'); im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)
    save(img.name + '_before', rgb)
    skin = np.zeros((h, w), np.float32) if hairy else skin_mask(rgb, w)
    L = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    # the skin: pale grey-green, keeping the texture's own light and dark (pores, creases, the face's shading)
    if skin.max() > 0:
        # (round 2: the first tone and its big patches read as camouflage paint; now a sickly grey with a little green,
        # the rot smaller and darker, brown-grey not green. Round 3: each person's own lightness kept, lifted a little
        # towards the dead pallor: dark skin had all gone the same pale yellow-green and lost who he was)
        Ls = (L * 0.9 + 0.05)[..., None]
        z = np.array([1.0, 1.04, 0.86], np.float32) / 1.012 * Ls
        vein = (1 - smooth(0.0, 0.025, np.abs(noise(h, w, 18, 3) - 0.5)))[..., None] * 0.3 * K_DECAY  # faint dark veins
        z = z * (1 - vein) + z * np.array([0.55, 0.5, 0.62], np.float32) * vein
        rot_n, blot, grain = noise(h, w, 14), noise(h, w, 22), noise(h, w, 64, 2)
        rot = smooth(0.56, 0.74, rot_n)[..., None] * 0.75 * K_DECAY   # rotting patches: dark brown-olive
        z = z * (1 - rot) + z * np.array([0.5, 0.47, 0.34], np.float32) * rot
        bru = smooth(0.62, 0.78, blot)[..., None] * 0.55 * K_DECAY      # bruising: grey-purple
        z = z * (1 - bru) + z * np.array([0.7, 0.6, 0.72], np.float32) * bru
        z *= (0.9 + 0.2 * grain)[..., None]                             # a fine mottled grain
        k = (skin * min(1.0, 0.92 * K_GREEN))[..., None]
        rgb = rgb * (1 - k) + z * k
    # new clothes (top=, bottom=): the cloth's own folds and seams kept, its colour replaced (2026-10-21, the user: David's
    # black jumpsuit "to be different ... lighter color ... maybe blue jeans")
    F = FACE.get(img.name)
    for key, want in (('top', TOP), ('bottom', BOTTOM)):
        if not want or not F or F[key].max() == 0: continue
        # (a hard edge where the bones change over: a soft one washed the denim up a large hem triangle into the shirt)
        m = (smooth(0.4, 0.6, blur(F[key], max(1, w // 1024))) * (1 - skin))[..., None]
        # (the folds from a softened lightness: in dark cloth the fine weave and the compression's blocks, scaled up to a
        # light colour, read as a blocky pattern)
        Lc = blur(rgb @ np.array([0.299, 0.587, 0.114], np.float32), max(1, w // 512)); ref = max(float(np.median(Lc[m[..., 0] > 0.5])), 0.02)
        shade = np.clip(1 + (Lc / ref - 1) * 0.6, 0.6, 1.3)[..., None]
        if want == 'jeans':  # denim: a fine twill, worn paler on the thighs and knees (wherever the noise says)
            base = np.array([0.2, 0.3, 0.47], np.float32) * (0.88 + 0.24 * noise(h, w, 220, 1))[..., None]
            wear = smooth(0.5, 0.82, noise(h, w, 9))[..., None] * 0.45
            base = base * (1 - wear) + np.array([0.5, 0.6, 0.74], np.float32) * wear
        else: base = np.array([int(want[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
        rgb = rgb * (1 - m) + np.clip(base * shade, 0, 1) * m
    # the eyes: a blue, green or grey iris clouded milky white
    hue, sat, val = hsv(rgb)
    iris = (((hue > 150) & (hue < 260) & (sat > 0.18)) & (val > 0.25)).astype(np.float32) * (0 if hairy else 1)
    if iris.any():  # (only small blue spots amid skin: never a pair of jeans or a blue shirt)
        iris *= (blur(iris, max(2, w // 64)) < 0.45) * (blur(skin, max(2, w // 64)) > 0.12)
        iris = blur(iris, max(1, w // 1024))[..., None] * 0.8
        rgb = rgb * (1 - iris) + np.array([0.8, 0.8, 0.74], np.float32) * iris
    # the clothes and hair: faded and dirty
    dirt = smooth(0.42, 0.78, noise(h, w, 6))[..., None] * (1 - skin[..., None]) * 0.55 * K_GRIME
    Lc = (rgb @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    fade = (1 - skin[..., None]) * 0.28 * K_GRIME
    rgb = rgb * (1 - fade) + Lc * fade
    rgb = rgb * (1 - dirt) + rgb * np.array([0.55, 0.47, 0.36], np.float32) * dirt
    # blood: fresh dark red with a darker dried rim
    if K_BLOOD > 0:
        b = splats(h, w, int((20 if not hairy else 5) * K_BLOOD * (w * h) / 2048 ** 2) + 3)
        rim = np.clip(blur(b, max(1, w // 700)) - b * 0.6, 0, 1)
        col = np.array([0.34, 0.02, 0.025], np.float32) * (0.75 + 0.5 * noise(h, w, 30, 2))[..., None]
        rgb = rgb * (1 - b[..., None] * 0.92) + col * b[..., None] * 0.92
        rgb = rgb * (1 - rim[..., None] * 0.5) + np.array([0.14, 0.02, 0.02], np.float32) * rim[..., None] * 0.5
    # the face (face_masks): dark sunken sockets, blood round the mouth and down the chin, throat and shirt
    if F:
        e = blur(F['eye'], max(1, w // 512))[..., None] * 0.7 * K_DECAY
        rgb = rgb * (1 - e) + rgb * np.array([0.32, 0.26, 0.3], np.float32) * e
        gm = np.clip(blur(F['gore'], max(1, w // 1024)) * (0.8 + 0.4 * noise(h, w, 50, 2)), 0, 1)[..., None] * min(1.0, K_BLOOD)
        col = np.array([0.3, 0.015, 0.02], np.float32) * (0.7 + 0.5 * noise(h, w, 36, 2))[..., None]
        rgb = rgb * (1 - gm * 0.95) + col * gm * 0.95
    rgb = np.clip(rgb, 0, 1)
    save(img.name + '_after', rgb)
    img.pixels.foreach_set(np.dstack([rgb, alpha]).ravel()); img.pack()
    done[img.name] = True
    report.append('%s (%s): %dx%d skin %.0f%%' % (img.name, mat.name, w, h, 100 * float((skin > 0.5).mean())))

for a in bpy.data.objects: a.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                          export_frame_step=1, export_image_format='WEBP', export_jpeg_quality=88)
print('\n'.join(report)); print('ZOMBIFIED', OUT, round(os.path.getsize(OUT) / 1e6, 2), 'MB')
