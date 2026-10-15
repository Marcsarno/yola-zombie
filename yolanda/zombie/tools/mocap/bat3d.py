# Lift the tracked 2D bat (bat2d.py) to a 3D direction in the character frame C (X left, Y up, Z forward) and add it to
# the cleaned motion (clean.py). Side view: image right = -forward (the target is image-left), image up = up; the
# bat's depth (along +-left) comes from its foreshortening, the sign from the grip line and continuity.
# usage: python bat3d.py <combo.json> <bat.json> <out.json> <cam_side: left|right>
import sys, json, math
import numpy as np
C = json.load(open(sys.argv[1])); B = json.load(open(sys.argv[2])); out = sys.argv[3]; side = sys.argv[4]
fr = C['frames']; n = len(fr)
conf = np.array([B.get(str(f['f']), {}).get('conf', 0) for f in fr]); ang = np.array([B.get(str(f['f']), {}).get('ang', 0) for f in fr], float)
ln = np.array([B.get(str(f['f']), {}).get('len', 0) for f in fr], float)
good = conf >= 0.6
Lmax = np.percentile(ln[good], 92)  # the bat seen side-on (full visible length)
# image axes in C: the camera looks along -left (it stands on her left): screen right = -forward, screen up = up
sgn = 1 if side == 'left' else -1
d = np.zeros((n, 3)); ok = np.zeros(n, bool)
# phase keys (reference frame -> bat direction in C: left, up, forward), read from the reference sheets: where the bat
# is on her body (its sideways side) and roughly where it points. The tracked image angle refines the in-plane part.
KEYS = [(20, (0.05, 0.7, -0.7)), (30, (0.05, 0.7, -0.7)), (36, (0.0, 0.15, -0.99)), (40, (-0.55, 0.05, -0.8)),
        (43, (0.0, 0.02, 1.0)), (46, (0.85, -0.2, 0.4)), (52, (0.55, -0.35, -0.75)), (60, (0.3, -0.15, -0.95)),
        (68, (0.12, 0.92, -0.35)), (78, (0.1, 0.98, -0.18)), (88, (0.12, 0.98, -0.15)), (92, (0.45, 0.7, -0.55)), (97, (0.3, -0.1, 0.95)),
        (101, (0.0, -0.05, 1.0)), (106, (-0.55, -0.1, 0.8)), (114, (-0.55, 0.6, -0.55)), (122, (-0.3, 0.9, -0.3)),
        (132, (-0.2, 0.8, -0.55)), (139, (-0.15, -0.3, -0.94)), (143, (-0.45, -0.6, 0.45)), (147, (0.0, -0.45, 0.9)),
        (151, (0.6, 0.45, 0.65)), (155, (0.6, 0.75, -0.2)), (170, (0.45, 0.65, -0.6)), (184, (0.25, -0.2, -0.95))]
kf = np.array([k[0] for k in KEYS], float); kv = np.array([k[1] for k in KEYS], float); kv /= np.linalg.norm(kv, axis=1, keepdims=True)
key = np.zeros((n, 3))
for i in range(n):
    f = fr[i]['f']; j = int(np.clip(np.searchsorted(kf, f) - 1, 0, len(kf) - 2)); u = np.clip((f - kf[j]) / (kf[j + 1] - kf[j]), 0, 1); u = u * u * (3 - 2 * u)
    v = kv[j] * (1 - u) + kv[j + 1] * u; key[i] = v / (np.linalg.norm(v) or 1)
used = 0
BLUR = [(39, 47), (84, 90), (137, 152)]  # strike contacts, where the tracked 'bat' is the blur streak
for i in range(n):
    kvi = key[i]; d[i] = kvi; ok[i] = True
    if not good[i]: continue
    if any(a0 <= fr[i]['f'] <= a1 for a0, a1 in BLUR): continue  # contact frames: the bat is a motion-blur streak there
    a_ = math.radians(ang[i]); tf, tu = -math.cos(a_) * sgn, math.sin(a_)  # tracked in-plane direction (forward, up)
    kp = np.array([kvi[2], kvi[1]]); kpl = np.linalg.norm(kp)
    if kpl < 0.25: continue  # the key points mostly sideways: the image angle says little
    if (tf * kp[0] + tu * kp[1]) / kpl < 0.5: continue  # the tracker disagrees by > 60 degrees: a wrong detection
    d[i] = [kvi[0], tu * kpl, tf * kpl]; used += 1
print('tracked angles used', used)
# fill the uncertain frames by interpolating the direction (normalised lerp), then smooth lightly
idx = np.flatnonzero(ok)
for k in range(3): d[:, k] = np.interp(np.arange(n), idx, d[idx, k])
for k in range(3):
    x = d[:, k].copy()
    for _ in range(2): x[1:-1] = 0.25 * x[:-2] + 0.5 * x[1:-1] + 0.25 * x[2:]
    d[:, k] = x
d /= np.linalg.norm(d, axis=1, keepdims=True)
for i in range(n): fr[i]['bat'] = [round(float(v), 4) for v in d[i]]
C['bat_conf'] = [round(float(c), 2) for c in conf]
json.dump(C, open(out, 'w'))
print('bat dirs', n, 'measured', int(ok.sum()), 'Lmax px', round(float(Lmax)))
for i in range(0, n, 10): print(fr[i]['f'], [round(float(v), 2) for v in d[i]], 'conf', conf[i])
