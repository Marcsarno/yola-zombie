# Sync two recordings of the same move from different cameras, frame by frame.
# Features that look the same from any roughly level camera: the HEIGHTS (image y) of the wrists, elbows, nose, knees and
# ankles relative to the hips, divided by the torso length. Left/right labels can swap between views, so each pair is
# reduced to its higher and lower member. First a global offset over the whole move, then per-strike windows refined
# around it (each strike's own timing may differ slightly between takes).
# usage: python -I sync.py <poseA.json> <a0> <a1> <poseB.json> <b_search0> <b_search1> <out.json> [windows "a0-a1,a0-a1"]
import sys, json, numpy as np
pa, a0, a1, pb, b0, b1, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], int(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
wins = [tuple(map(int, w.split('-'))) for w in sys.argv[8].split(',')] if len(sys.argv) > 8 else []

def feats(path):
    D = json.load(open(path)); W, H = D['w'], D['h']; F = {}
    for fr in D['frames']:
        if not fr.get('img'): continue
        p = np.array([q[:2] for q in fr['img']]) * [W, H]
        hip = (p[23] + p[24]) / 2; sh = (p[11] + p[12]) / 2; L = np.linalg.norm(sh - hip)
        if L < 1: continue
        y = lambda i: (hip[1] - p[i][1]) / L  # up = positive
        pair = lambda i, j: (max(y(i), y(j)), min(y(i), y(j)))
        F[fr['f']] = np.array([*pair(15, 16), *pair(13, 14), y(0), *pair(25, 26), *pair(27, 28)])
    return F
A, B = feats(pa), feats(pb)
def score(fa, fb, off):  # mean squared difference over frames present in both (lower is better)
    d = [A[f] - B[f + off] for f in range(fa, fb + 1) if f in A and (f + off) in B]
    return (np.mean(np.square(d)), len(d)) if len(d) > 10 else (1e9, 0)
best = min(((score(a0, a1, o)[0], o) for o in range(b0 - a0, b1 - a1 + 1)), key=lambda t: t[0])
print('global offset (B = A + off):', best[1], 'error', round(best[0], 4))
res = {'global': best[1], 'error': best[0], 'windows': []}
for w0, w1 in wins:
    cand = sorted((score(w0, w1, o)[0], o) for o in range(best[1] - 15, best[1] + 16))
    res['windows'].append({'a': [w0, w1], 'offset': cand[0][1], 'error': cand[0][0], 'next_best': cand[1]})
    print('window', w0, w1, 'offset', cand[0][1], 'error', round(cand[0][0], 4), 'second best', cand[1][1], round(cand[1][0], 4))
json.dump(res, open(out, 'w'), indent=1)
