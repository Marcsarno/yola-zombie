# Chapter 4, Grammy's peninsula: the map's own props (built in the 'GProps' scene, exported to assets/grammy/props/):
#   grammy_booth.glb     the guard booth on the boulevard's median: white stucco, glass all round, a flat roof
#   grammy_gatebar.glb   a lift bar: its post and motor box, the red and white pole on a node 'Bar' turning about its pivot
#                        (the pole runs along +X from the pivot; the game lifts it by turning 'Bar' about three.js z)
#   grammy_hedge.glb     3 m of low round hedge (the villas' shrubs in a row): the boulevard's far side
#   grammy_landing.glb   the boat landing at the tip: a timber deck on piles, its front toward -Y (the game's +Z) = the water
#   blender blender/grammy/grammy.blend --python blender/grammy/make_gprops.py -- [names] [export]
import bpy, bmesh, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'hood'), HERE]
import propkit as K
from propkit import box, rod, wall, prism, root, finish
import hoodlib
K.M = hoodlib.kit_material
import make_villa as V
import importlib, hoodlib; importlib.reload(hoodlib); importlib.reload(V)   # (Blender keeps modules between runs)
ROOT = os.path.dirname(os.path.dirname(HERE)); OUT = os.path.join(ROOT, 'assets', 'grammy', 'props')
TRIM, WALL, GLASS = 'M_flat__trim', 'M_stucco__villa', 'M_glass'

def booth():
    r = root('grammy_booth'); W, D, H = 2.6, 2.2, 2.55
    box(r, 'base', (W + 0.3, D + 0.3, 0.18), (0, 0, 0.09), 'M_concrete_slab')
    for sx in (-1, 1):
        for sy in (-1, 1): box(r, 'post', (0.16, 0.16, H), (sx * (W / 2 - 0.08), sy * (D / 2 - 0.08), 0.18 + H / 2), WALL)
    for (a, b, L) in (((-W / 2, -D / 2), (W / 2, -D / 2), W), ((W / 2, D / 2), (-W / 2, D / 2), W)):
        wall(r, 'wall', a, b, H, 0.12, WALL, holes=[(0.25, L - 0.5, 0.95, 2.2)], z0=0.18)
    wall(r, 'wall', (W / 2, -D / 2), (W / 2, D / 2), H, 0.12, WALL, holes=[(0.25, D - 0.5, 0.95, 2.2)], z0=0.18)
    wall(r, 'wall', (-W / 2, D / 2), (-W / 2, -D / 2), H, 0.12, WALL, holes=[(0.6, 0.9, 0.0, 2.1)], z0=0.18)   # (the door's side)
    for (cx, cy, sx, sy) in ((0, -D / 2, W - 0.5, 0.03), (0, D / 2, W - 0.5, 0.03), (W / 2, 0, 0.03, D - 0.5)):
        box(r, 'glass', (sx, sy, 1.25), (cx, cy, 0.18 + 1.575), GLASS)
    box(r, 'door', (0.05, 0.9, 2.1), (-W / 2, D / 2 - 1.05, 0.18 + 1.05), 'M_flat__grey')
    box(r, 'roof', (W + 0.9, D + 0.9, 0.22), (0, 0, 0.18 + H + 0.11), TRIM)
    box(r, 'roof', (W + 0.7, D + 0.7, 0.06), (0, 0, 0.18 + H + 0.25), 'M_flat__grey')
    box(r, 'lamp', (0.25, 0.25, 0.15), (0, 0, 0.18 + H + 0.35), 'M_emissive__amber')
    box(r, 'sign', (1.4, 0.05, 0.32), (0, -D / 2 - 0.47, 0.18 + H - 0.05), 'M_flat__navy')
    box(r, 'desk', (W - 0.4, 0.5, 0.9), (0, D / 2 - 0.4, 0.18 + 0.45), 'M_flat__grey')
    return r

def gatebar(L=5.4):
    r = root('grammy_gatebar')
    box(r, 'post', (0.42, 0.34, 1.0), (0, 0, 0.5), 'M_flat__trim')
    box(r, 'post', (0.44, 0.36, 0.08), (0, 0, 1.02), 'M_flat__grey')
    piv = bpy.data.objects.new('Bar', None); K.SC.collection.objects.link(piv); piv.parent = r; piv.location = (0.12, 0, 0.92)
    n = int(L / 0.45)
    for i in range(n):
        box(piv, 'pole', (L / n, 0.07, 0.09), ((i + 0.5) * L / n, 0, 0), 'M_flat__red' if i % 2 == 0 else 'M_flat__trim')
    box(piv, 'tip', (0.06, 0.06, 0.6), (L - 0.05, 0, -0.32), 'M_flat__grey')   # (the drop leg at its far end)
    box(r, 'rest', (0.12, 0.12, 0.9), (L + 0.12, 0, 0.45), 'M_flat__trim')      # (the rest post the bar comes down on)
    return r

def hedge():
    r = root('grammy_hedge')
    for i, x in enumerate((-1.1, -0.35, 0.4, 1.15)): V.shrub(r, x, 0.08 * (i % 2), 0.9 + 0.12 * (i % 3), sub=1)
    return r

def landing():
    """the deck runs out from the shore (y = 0) toward -Y, 2.6 m wide, 8 m long, 0.45 m over the water line"""
    r = root('grammy_landing'); L, W, top = 8.0, 2.6, 0.18
    n = int(L / 0.2)
    for i in range(n): box(r, 'plank', (W, 0.18, 0.05), (0, -0.1 - i * 0.2, top), 'M_wood_raw')
    for s in (-1, 1):
        box(r, 'joist', (0.08, L, 0.18), (s * (W / 2 - 0.15), -L / 2, top - 0.12), 'M_wood_dark')
        for k in range(5): rod(r, 'pile', (s * (W / 2 - 0.05), -k * 1.95 - 0.2, -1.9), (s * (W / 2 - 0.05), -k * 1.95 - 0.2, top + 0.5), 0.1, 'M_wood_dark', 8)
        box(r, 'cleat', (0.25, 0.08, 0.06), (s * (W / 2 - 0.25), -L + 0.5, top + 0.06), 'M_metal_painted__darkgrey')
    return r

def mailbox():
    """the mailbox on the tip roundabout's island (what is really there): a white post, a black arched box, a red flag"""
    r = root('grammy_mailbox')
    box(r, 'post', (0.1, 0.1, 1.05), (0, 0, 0.525), 'M_flat__trim')
    box(r, 'post', (0.3, 0.14, 0.05), (0, 0, 1.03), 'M_flat__trim')
    box(r, 'box', (0.2, 0.48, 0.16), (0, 0, 1.13), 'M_metal_painted__black')
    K.disc(r, 'box', 0.1, 0.48, (0, 0, 1.21), 'M_metal_painted__black', 12, math.pi / 2)
    box(r, 'flag', (0.02, 0.05, 0.22), (0.12, 0.12, 1.25), 'M_flat__red')
    box(r, 'flag', (0.02, 0.14, 0.06), (0.12, 0.17, 1.33), 'M_flat__red')
    return r

BUILD = dict(booth=booth, gatebar=gatebar, hedge=hedge, landing=landing, mailbox=mailbox)
if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    K.use_scene('GProps')
    names = [a for a in args if a in BUILD] or list(BUILD)
    built = {k: BUILD[k]() for k in names}
    if 'export' in args:
        os.makedirs(OUT, exist_ok=True)
        for k, r in built.items(): print(k, K.export(r, os.path.join(OUT, 'grammy_%s.glb' % k)), 'faces')
    for i, r in enumerate(built.values()): r.location.x = i * 8
