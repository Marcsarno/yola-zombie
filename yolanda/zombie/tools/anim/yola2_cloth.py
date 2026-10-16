# Matte cotton scrubs for the new Yola (2026-10-16, the user: "I don't like how glossy Yola's scrubs look... without
# ruining it", then option C, plus "depth where the shirt meets the pants and at the pockets, like two pieces of
# clothing"). Only the cloth changes: a soft mask of the blue scrubs from the base colour (skin, hair, badge, shoes keep
# their own values, verified painted on the model). Inputs: her source GLB, and the bakes from her own mesh
# (tools/anim/yola2_bake.py: yola2_ao.png fold / contact shadow, yola2_curv.png curvature). Writes (2048):
#   yola2_basecolor_cotton.png  cloth: 18% less saturated, 7% darker (cotton, not vinyl), times the fold shadow
#                               (under the shirt's hem, inside pockets, in folds), creases darker, edges (hem lip, pocket
#                               flaps) a little lighter: the top reads as its own layer over the pants
#   yola2_rm_matte.png          glTF channels: G roughness (cloth 0.70 -> ~0.90, its variation kept), B metal,
#                               R = how much shine the surface keeps (cloth 0.3, everything else 1; the game reads it)
#   yola2_normal_2048.png       the normal map at 2048 (the 1024 build lost the fabric's weave and fine wrinkles)
#   yola2_cloth_mask.png
# usage: blender -b --factory-startup --python tools/anim/yola2_cloth.py -- <source glb> <dir with the bakes; output dir>
import bpy, sys, os
import numpy as np
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
P = dict(rough_keep=0.27, spec_cloth=0.3, sat=0.18, val=0.07, ao=0.55, ao_gamma=1.4, crease=0.25, edge=0.10, floor=0.62)
TAG = ''
for kv in argv[2:]:
    k, v = kv.split('=')
    if k == 'tag': TAG = '_' + v
    else: P[k] = float(v)  # (e.g. ao=0 crease=0 edge=0: the cotton colour alone; sat=0 val=0: the shadows alone)
bpy.ops.import_scene.gltf(filepath=SRC)
ims = {im.name: im for im in bpy.data.images}
bc_im = next(v for k, v in ims.items() if 'basecolor' in k); rm_im = next(v for k, v in ims.items() if k.endswith('_rm')); nm_im = next(v for k, v in ims.items() if 'normal' in k)
S = 2048
def arr(im, size=S):
    c = im.copy(); c.scale(size, size)
    a = np.array(c.pixels[:], dtype=np.float32).reshape(size, size, 4); bpy.data.images.remove(c); return a
def load(name):
    im = bpy.data.images.load(os.path.join(OUT, name), check_existing=False); im.colorspace_settings.name = 'Non-Color'
    a = arr(im); bpy.data.images.remove(im); return a[..., 0]
def save(a, name, colorspace):
    h, w = a.shape[:2]; im = bpy.data.images.new(name, w, h, alpha=True)
    im.colorspace_settings.name = colorspace; im.pixels = np.clip(a, 0, 1).ravel(); im.filepath_raw = os.path.join(OUT, name + '.png'); im.file_format = 'PNG'; im.save()
    print('SAVED', im.filepath_raw)
bc = arr(bc_im); rm = arr(rm_im)
r, g, b = bc[..., 0], bc[..., 1], bc[..., 2]
# the cloth mask: how far blue leads red, ramped, feathered (9-texel box blur twice) so no seam shows
lead = (b - r) / np.maximum(b, 1e-3)
m = np.clip((lead - 0.25) / 0.25, 0, 1) * np.clip((b - 0.12) / 0.1, 0, 1) * (g > r)
k = np.ones(9, np.float32) / 9
for _ in range(2):
    m = np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 1, m)
    m = np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 0, m)
# fold shadow and curvature (texels the bake did not reach count as open and flat)
ao = load('yola2_ao.png'); cv = load('yola2_curv.png')
ao = np.where(ao <= 0, 1.0, ao); flat = np.median(cv[cv > 0]); cv = np.where(cv <= 0, flat, cv)
# (the bakes' sampling grain read as blotches on the shirt: a light 5-texel blur, twice)
k5 = np.ones(5, np.float32) / 5
for _ in range(2):
    for arr_ in (ao, cv):
        arr_[:] = np.apply_along_axis(lambda v: np.convolve(v, k5, mode='same'), 1, arr_)
        arr_[:] = np.apply_along_axis(lambda v: np.convolve(v, k5, mode='same'), 0, arr_)
shade = 1 - P['ao'] * (1 - ao ** P['ao_gamma'])                              # folds, under the hem, pocket insides
c = cv - flat
shade *= 1 - P['crease'] * np.clip(-c / 0.06, 0, 1)                         # concave creases and seams
shade *= 1 + P['edge'] * np.clip(c / 0.05, 0, 1)                            # convex edges: the hem lip, pocket flaps
# (never near black: the inside of a sleeve opening read as a stain once the arm lifted; a soft floor)
fl = P['floor']; shade = np.where(shade < fl + 0.1, fl + 0.1 * np.exp((shade - fl - 0.1) / 0.1), shade)
# cotton colour (in display space, as painted): less saturated, a little darker
L = 0.3 * r + 0.59 * g + 0.11 * b
out = bc.copy()
for i, ch in enumerate((r, g, b)):
    cotton = (L + (ch - L) * (1 - P['sat'])) * (1 - P['val']) * shade
    out[..., i] = ch + (cotton - ch) * m
print('cloth texels %.1f%%' % (100 * (m > 0.5).mean()), 'shade on cloth p5 %.2f p50 %.2f p95 %.2f' % tuple(np.percentile(shade[m > 0.5], [5, 50, 95])),
      'non-cloth max change %.4f' % np.abs(out[..., :3] - bc[..., :3])[m < 0.01].max())
save(out, 'yola2_basecolor_cotton' + TAG, 'sRGB')
if TAG: print('CLOTH_DONE'); raise SystemExit
G = rm[..., 1]; rmo = rm.copy()
rmo[..., 1] = G + ((1 - (1 - G) * P['rough_keep']) - G) * m
rmo[..., 0] = 1 - (1 - P['spec_cloth']) * m
print('cloth roughness %.2f -> %.2f' % (G[m > 0.5].mean(), rmo[..., 1][m > 0.5].mean()))
save(rmo, 'yola2_rm_matte', 'Non-Color')
save(np.stack([m, m, m, np.ones_like(m)], -1), 'yola2_cloth_mask', 'Non-Color')
save(arr(nm_im), 'yola2_normal_2048', 'Non-Color')
print('CLOTH_DONE')
