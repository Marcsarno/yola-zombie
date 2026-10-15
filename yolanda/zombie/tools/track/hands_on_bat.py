# Where each hand sits along the solved bat, frame by frame (WEAPON_HOLD_PROCESS.md 0b: "follow the hands").
# The 3D solve's wrists are loose (blur, a faceless mannequin), but the bat is solid (the user's corrections). So the bat
# is kept as solved and each hand is a point that slides along it: per frame, the along-bat position s (0 = knob end,
# 1 = tip) whose projection lands on that hand in BOTH videos (MediaPipe wrist + index + pinky, per view), with sliding
# made costly so a hand only moves along the bat when both views say it does (the butt strike's staff grip).
# Solved per hand by dynamic programming over a grid of s. Cameras: each frame's weak-perspective projection is
# recovered exactly from the solve's own 3D points and their projections (an affine map).
# usage: python -I hands_on_bat.py <bat3d.json> <config.json (A/B pose files and sizes)> <out.json>
import sys, json
import numpy as np

D = json.load(open(sys.argv[1])); C = json.load(open(sys.argv[2])); OUT = sys.argv[3]
NAMES = D['names']; TIP, KNOB = NAMES.index('tip'), NAMES.index('knob')
HANDS = {'Left': (15, 17, 19, 5), 'Right': (16, 18, 20, 6)}  # MediaPipe wrist, pinky, index; solve wrist index

def load_pose(v):
    P = json.load(open(v['pose'])); W, H = v['size']; out = {}
    for r in P['frames']:
        if not r.get('img'): continue
        out[r['f']] = {s: (np.mean([[r['img'][k][0] * W, r['img'][k][1] * H] for k in idx[:3]], 0),
                           float(np.mean([r['img'][k][3] if len(r['img'][k]) > 3 else 1 for k in idx[:3]])))
                       for s, idx in HANDS.items()}
    return out
pose = {'A': load_pose(C['A']), 'B': load_pose(C['B'])}

def affine(Xf, pr):  # 2x4 weak-perspective map from the frame's 3D points to its projections
    A = np.c_[Xf, np.ones(len(Xf))]; return np.linalg.lstsq(A, pr, rcond=None)[0].T

GRID = np.linspace(-0.02, 1.0, 52)
T = len(D['frames']); cost = {s: np.zeros((T, len(GRID))) for s in HANDS}
used = {s: np.zeros((T, 2)) for s in HANDS}
for i, fr in enumerate(D['frames']):
    X = np.array(fr['X']); kn, tp = X[KNOB], X[TIP]
    pts = kn[None] + GRID[:, None] * (tp - kn)[None]
    for v, f in (('A', fr['a']), ('B', int(round(fr['b'])))):
        pr = np.array([fr['proj'][v][n] for n in NAMES]); M = affine(X, pr)
        p2 = np.c_[pts, np.ones(len(pts))] @ M.T
        ob = pose[v].get(f)
        if not ob: continue
        wr = {s: np.array(fr['proj'][v][NAMES[HANDS[s][3]]]) for s in HANDS}
        for s in HANDS:
            # the observation nearer the solve's wrist for this hand (left/right labels can swap in one view)
            o, vis = min((ob[q] for q in HANDS), key=lambda q: np.linalg.norm(q[0] - wr[s]))
            if vis < 0.3: continue
            e = np.linalg.norm(p2 - o[None], axis=1)
            cost[s][i] += np.where(e < 25, e * e, 25 * (2 * e - 25))  # Huber, 25 px
            used[s][i, 0 if v == 'A' else 1] = 1

def dp(c, lam=200.0):
    n = len(GRID); trans = (lam * (GRID[:, None] - GRID[None, :])) ** 2
    acc = c[0].copy(); back = np.zeros(c.shape, int)
    for t in range(1, len(c)):
        tot = acc[:, None] + trans; back[t] = tot.argmin(0); acc = tot.min(0) + c[t]
    path = [int(acc.argmin())]
    for t in range(len(c) - 1, 0, -1): path.append(back[t][path[-1]])
    return GRID[np.array(path[::-1])]

res = {'frames': [], '_doc': 's = along-bat position of the hand (0 knob, 1 tip, fraction of the bat length); err = pixels'}
S = {s: dp(cost[s]) for s in HANDS}
for i, fr in enumerate(D['frames']):
    row = {'a': fr['a']}
    for s in HANDS:
        j = int(np.argmin(np.abs(GRID - S[s][i]))); nv = used[s][i].sum()
        row[s] = {'s': round(float(S[s][i]), 3), 'err': round(float(np.sqrt(cost[s][i][j] / max(1, nv))), 1), 'views': int(nv)}
    res['frames'].append(row)
json.dump(res, open(OUT, 'w'), indent=0)
for i in range(0, T, 5):
    r = res['frames'][i]; print(r['a'], 'L', r['Left']['s'], r['Left']['err'], ' R', r['Right']['s'], r['Right']['err'])
