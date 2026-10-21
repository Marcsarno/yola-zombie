# Chapter 2: Marc's grass texture pack (2026-10-21, grass_texture_pack_v1: house_lawn, playground_worn, neglected_edge base
# colours, 1254 px, not seamless) made into the game's lawn tiles: each blended with itself shifted half a tile near its
# edges (so its opposite edges meet), scaled to 1024 px and written as WebP to assets/neighborhood/tex/lawn_<kind>_albedo.webp
#   blender -b --factory-startup --python blender/hood/make_lawn_tex.py -- <pack folder>
import bpy, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = sys.argv[sys.argv.index('--') + 1]
OUT = os.path.join(ROOT, 'assets', 'neighborhood', 'tex')
KINDS = {'house_lawn': 'lawn_house', 'playground_worn': 'lawn_worn', 'neglected_edge': 'lawn_edge'}
N = 1024
for src, kind in KINDS.items():
    im = bpy.data.images.load(os.path.join(SRC, src + '_basecolor.png')); im.scale(N, N)
    a = np.array(im.pixels[:], dtype=np.float32).reshape(N, N, 4)
    s = np.roll(np.roll(a, N // 2, axis=0), N // 2, axis=1)
    # the shifted copy's weight: 1 at the tile's edges, 0 from 18 % in (a soft bell, so the seam of the blend does not show)
    t = np.minimum(np.arange(N), N - 1 - np.arange(N)) / (N * 0.18); t = np.clip(t, 0, 1); t = t * t * (3 - 2 * t)
    w = 1 - np.minimum(t[:, None], t[None, :])
    b = a * (1 - w[..., None]) + s * w[..., None]; b[..., 3] = 1
    out = bpy.data.images.new(kind, N, N); out.pixels[:] = b.ravel()
    out.filepath_raw = os.path.join(OUT, kind + '_albedo.webp'); out.file_format = 'WEBP'
    sc = bpy.context.scene; sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 90
    out.save_render(out.filepath_raw, scene=sc)
    print('wrote', out.filepath_raw, 'mean sRGB', [round(float(v), 3) for v in b[..., :3].reshape(-1, 3).mean(0)])
