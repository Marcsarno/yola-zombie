# Body-sense check of a 3D solve (the check the first solve lacked): per frame, how far each wrist is in front of the
# chest and from the bat, the bat's length, and the two cameras' angle. Lengths in torso lengths (shoulders->hips).
# usage: python -I solvecheck.py <solve.json> [every]
import sys, json
import numpy as np
D = json.load(open(sys.argv[1])); every = int(sys.argv[2]) if len(sys.argv) > 2 else 10
N = D['names']; ix = {n: i for i, n in enumerate(N)}
rows = []
for fr in D['frames']:
    X = np.array(fr['X']); fl = np.array([1, -1, 1])
    sh = (X[1] - X[2]) * fl; mid = (X[1] + X[2]) / 2; up = ((X[1] + X[2]) / 2 - (X[7] + X[8]) / 2) * fl; tl = np.linalg.norm(up)
    fw = np.cross(up, sh); fw = fw / np.linalg.norm(fw) * fl
    kn, tp = X[ix['knob']], X[ix['tip']]; d = tp - kn
    def shaft(p):
        u = np.clip((p - kn) @ d / (d @ d), 0, 1); return np.linalg.norm(p - (kn + d * u))
    pr = np.array([fr['proj']['B'][n] for n in N]); M = np.linalg.lstsq(np.c_[X, np.ones(len(X))], pr, rcond=None)[0].T[:, :3]
    ax = np.cross(M[0] / np.linalg.norm(M[0]), M[1] / np.linalg.norm(M[1])); yaw = np.degrees(np.arctan2(ax[0], ax[2]))
    rows.append((fr['a'] - 19, [(X[j] - mid) @ fw / tl for j in (5, 6)], [shaft(X[j]) / tl for j in (5, 6)], np.linalg.norm(d) / tl, yaw,
                 fr.get('bat_err', {})))
fwd = np.array([r[1] for r in rows]); off = np.array([r[2] for r in rows])
print('wrists in front of the chest (torso lengths): median', np.round(np.median(fwd, 0), 2), ' share behind the chest', np.round((fwd < 0).mean(0), 2))
print('wrist to bat: median', np.round(np.median(off, 0), 2), ' p90', np.round(np.percentile(off, 90, 0), 2))
eA = [r[5]['A'] for r in rows if 'A' in r[5]]; eB = [r[5]['B'] for r in rows if 'B' in r[5]]
print('bat vs markers px: A median', round(float(np.median(eA)), 1), 'p90', round(float(np.percentile(eA, 90)), 1), '| B median', round(float(np.median(eB)), 1), 'p90', round(float(np.percentile(eB, 90)), 1))
print('camera angle range', round(min(r[4] for r in rows)), '..', round(max(r[4] for r in rows)))
for r in rows[::every]:
    print(f'Yola {r[0]:3d}  wrists fwd L {r[1][0]:5.2f} R {r[1][1]:5.2f}   to bat L {r[2][0]:4.2f} R {r[2][1]:4.2f}   bat {r[3]:4.2f}   cam {r[4]:6.0f}')
