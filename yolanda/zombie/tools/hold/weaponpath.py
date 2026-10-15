# Weapon path for a two-handed clip, from where the clip's own hands are (WEAPON_HOLD_PROCESS.md step 6.4 input):
# per frame the shaft runs from the primary (knob) hand's fist centre through the support hand's, the knob sits the data
# sheet's grip distance behind the primary fist, and the support hand's grip is wherever the clip put it along the shaft
# (at least a fist apart). Where the fists are too close to give a direction, the fists' own grip axes do. The fist paths
# are smoothed first (the weapon never jitters). Writes the action's 'weapon_path' for holdfit.py ('action' mode).
# Release windows (support hand off the weapon) can be listed: Side:f0-f1,...
# usage: blender -b <blend> --python tools/hold/weaponpath.py -- <hands.json> <weapon> <action> <out.blend> [release]
import bpy, sys, os, json
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import holdlib as H
argv = sys.argv[sys.argv.index('--') + 1:]
cal = H.load_json(argv[0]); weapon = argv[1]; name = argv[2]; out = argv[3]
REL = {}
if len(argv) > 4 and argv[4]:
    for part in argv[4].split(';'):
        s, ws = part.split(':'); REL[s] = [tuple(map(int, w.split('-'))) for w in ws.split(',')]
W = H.load_json(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'weapons_hold.json'))[weapon]
U = 1 / H.M; prim = W['primary']; sup = 'Right' if prim == 'Left' else 'Left'
arm, body = H.rig(); sc = bpy.context.scene
act = H.use_action(arm, name); f0, f1 = map(int, act.frame_range); T = f1 - f0 + 1
C = {s: [] for s in H.SIDES}; AX = {s: [] for s in H.SIDES}
for f in range(f0, f1 + 1):
    sc.frame_set(f)
    for s in H.SIDES:
        c, a, k = H.fist_world(arm, s, cal); C[s].append(c); AX[s].append(a)
def smooth(vs, n=2):
    for _ in range(n): vs = [sum((vs[min(T - 1, max(0, i + o))] * w for o, w in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))), Vector()) / 16 for i in range(T)]
    return vs
for s in H.SIDES: C[s] = smooth(C[s])
frames = []; prev = None
for i in range(T):
    v = C[sup][i] - C[prim][i]; dist = v.length * H.M
    ax = (AX[prim][i] + AX[sup][i]); d = v.normalized() if dist > 0.05 else ax.normalized()
    if dist <= 0.05 and prev is not None and d.dot(prev) < 0: d = -d
    if 0.05 < dist < 0.08 and prev is not None:  # blend toward the axes as the fists close up
        w = (dist - 0.05) / 0.03; a2 = ax.normalized() if ax.dot(v) > 0 else -ax.normalized(); d = (v.normalized() * w + a2 * (1 - w)).normalized()
    prev = d; frames.append({'d': d, 'dist': dist})
ds = smooth([fr['d'] for fr in frames]); ds = [d.normalized() for d in ds]
path = []
for i in range(T):
    f = f0 + i; d = ds[i]
    g_sup = W['grips'][prim] + max(0.075, (C[sup][i] - C[prim][i]).dot(d) * H.M)
    rel = any(a <= f < b for a, b in REL.get(sup, []))
    grips = {prim: W['grips'][prim], sup: None if rel else round(g_sup, 4)}
    knob = C[prim][i] - d * (W['grips'][prim] * U)
    path.append({'f': f, 'knob': list(knob), 'dir': list(d), 'grips': grips})
act['weapon_path'] = json.dumps({'weapon': weapon, 'from': 'clip hands (weaponpath.py)', 'frames': path})
sp = [p['grips'][sup] for p in path if p['grips'][sup] is not None]
print('PATH', name, 'frames', T, 'support grip from the knob: min', round(min(sp), 3), 'max', round(max(sp), 3), 'm')
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True); print('SAVED', out)
