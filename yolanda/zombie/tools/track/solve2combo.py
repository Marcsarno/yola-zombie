# The two-view 3D solve (solve3d.py) -> a character-space motion for retarget_mocap.py (same format as clean.py's output).
# Character frame C: X = the character's left when facing the target, Y = up, Z = toward the target, metres; the origin
# on the floor under the hips at the first frame. Per frame: 33 positions in MediaPipe order (the solve's 13 joints; the
# heels, toes and hand points are built from them), the bat direction, and the bat's knob/tip.
#
# Travel: the solve fixes the body's shape but not where it is (every frame's camera offsets are free), so the hips'
# floor path is rebuilt from the feet: a planted foot does not move, so while a foot is down the hips move by minus that
# foot's motion relative to the hips. Up/down: the lowest ankle is on the floor.
# Scale: the reference's straight-knee hip->ankle length is 0.736 m (the same reference fighter, measured in round 11).
# Forward: toward the target, from where the bat's hitting part is at the strikes' contact frames.
# usage: python -I solve2combo.py <bat3d.json> <hands.json> <out.json> [contact frames a:part,...] [side-camera combo.json]
import sys, json, math
import numpy as np

D = json.load(open(sys.argv[1])); HN = json.load(open(sys.argv[2]))['frames']; OUT = sys.argv[3]
CONTACTS = [(int(a), float(p)) for a, p in (c.split(':') for c in (sys.argv[4] if len(sys.argv) > 4 else '43:0.75,99:0.0,148:0.75').split(','))]
N = D['names']; ix = {n: i for i, n in enumerate(N)}
X = np.array([f['X'] for f in D['frames']], float); A = [f['a'] for f in D['frames']]; T = len(X)
up_A = np.array([0.0, -1.0, 0.0])  # camera A is level, image y points down
hip = (X[:, ix['hipL']] + X[:, ix['hipR']]) / 2
hz = lambda v: v - np.outer(v @ up_A, up_A) if v.ndim == 2 else v - up_A * (v @ up_A)
# forward: hips -> the bat's hitting point at each contact, on the floor plane
fw = np.zeros(3)
for a, part in CONTACTS:
    if a not in A: continue
    i = A.index(a); hitp = X[i, ix['knob']] + part * (X[i, ix['tip']] - X[i, ix['knob']])
    v = hz(hitp - hip[i]); fw += v / np.linalg.norm(v); print('contact', a, 'target direction (A axes)', np.round(v / np.linalg.norm(v), 2))
fwd_A = fw / np.linalg.norm(fw); left_A = np.cross(up_A, fwd_A)
Rw = np.stack([left_A, up_A, fwd_A])  # rows: C axes in A coordinates
# scale
def ang(a, b, c):
    u, v = X[:, a] - X[:, b], X[:, c] - X[:, b]
    return np.degrees(np.arccos(np.clip((u * v).sum(1) / np.linalg.norm(u, axis=1) / np.linalg.norm(v, axis=1), -1, 1)))
straight = []
for h, k, an in (('hipL', 'knL', 'anL'), ('hipR', 'knR', 'anR')):
    m = ang(ix[h], ix[k], ix[an]) > 170
    straight += list(np.linalg.norm(X[m, ix[h]] - X[m, ix[an]], axis=1))
leg = float(np.median(straight)) if len(straight) >= 5 else float(np.median(np.linalg.norm(X[:, ix['hipL']] - X[:, ix['knL']], axis=1) + np.linalg.norm(X[:, ix['knL']] - X[:, ix['anL']], axis=1)))
MPU = 0.736 / leg; print('straight-leg samples', len(straight), 'metres per solve unit', round(MPU, 3), 'bat', round(D['bat_length_torso'] * MPU, 3), 'm')
rel = np.einsum('ij,tpj->tpi', Rw, X - hip[:, None, :]) * MPU  # hip-relative, C axes, metres
# feet on the floor: the ankle sits ANK_H above the floor when planted
ANK_H = 0.08
aL, aR = rel[:, ix['anL']], rel[:, ix['anR']]
low = np.minimum(aL[:, 1], aR[:, 1])
for _ in range(2): low = np.convolve(np.pad(low, 2, mode='edge'), np.array([1, 4, 6, 4, 1]) / 16, 'valid')
hip_y = -low + ANK_H
# planted weights by height over the floor (3 cm band, 3 cm ramp)
wt = {}
for s, a_ in (('L', aL), ('R', aR)):
    h = a_[:, 1] - low
    wt[s] = np.clip(1 - (h - 0.03) / 0.03, 0, 1)
hip_w = np.zeros((T, 3)); hip_w[:, 1] = hip_y
vel = np.zeros(3)
for i in range(1, T):
    num = np.zeros(3); den = 0.0
    for s, a_ in (('L', aL), ('R', aR)):
        w = min(wt[s][i], wt[s][i - 1])
        num += -w * (a_[i] - a_[i - 1]); den += w
    if den > 1e-3: vel = num / den
    vel[1] = 0; hip_w[i, [0, 2]] = hip_w[i - 1, [0, 2]] + vel[[0, 2]]
for _ in range(2): hip_w[:, [0, 2]] = np.array([np.convolve(np.pad(hip_w[:, k], 2, mode='edge'), np.array([1, 4, 6, 4, 1]) / 16, 'valid') for k in (0, 2)]).T
print('travel from the feet: start->end', np.round(hip_w[-1] - hip_w[0], 3), 'm; path length', round(float(np.linalg.norm(np.diff(hip_w[:, [0, 2]], axis=0), axis=1).sum()), 3), 'm')
# The feet-based travel backtracks wherever both feet are down but their solved positions drift (blurred ankles at the
# frame's bottom edge). The side camera measures the forward travel directly (round 11's clean.py, camera motion removed
# with background anchors), so when that track covers the same frames it gives the forward distance; sideways stays 0.
zprior = None
if len(sys.argv) > 5:
    S = json.load(open(sys.argv[5])); sf = {f['f']: f for f in S['frames']}
    if all(a in sf for a in A):
        z = np.array([(sf[a]['p'][23][2] + sf[a]['p'][24][2]) / 2 for a in A]); zprior = z - z[0]
        print('side camera travel (' + sys.argv[5].replace('\\', '/').split('/')[-1] + '):', round(float(zprior[-1]), 3), 'm forward')
# Final travel: one least-squares solve for the hips' floor path AND one fixed floor spot per foot plant (a run of 3+
# planted frames): planted feet hold their spot, the path is smooth, and the side camera's forward distance is a soft
# guide. Unknowns: hip (x, z) per frame + (x, z) per plant.
phases = []
for s, a_ in (('L', aL), ('R', aR)):
    i = 0
    while i < T:
        if wt[s][i] < 1: i += 1; continue
        j = i
        while j < T and wt[s][j] >= 1: j += 1
        if j - i >= 3: phases.append((s, i, j))
        i = j
NV = 2 * T + 2 * len(phases); rows = []; rhs = []
def eq(coef, b):
    r = np.zeros(NV)
    for k, c in coef: r[k] += c
    rows.append(r); rhs.append(b)
for k, (s, i0, i1) in enumerate(phases):
    a_ = aL if s == 'L' else aR
    for i in range(i0, i1):
        for c, ax in ((0, 0), (1, 2)):  # hip + rel = spot
            eq([(2 * i + c, 4.0), (2 * T + 2 * k + c, -4.0)], -4.0 * a_[i, ax])
for i in range(1, T - 1):
    for c in (0, 1): eq([(2 * (i - 1) + c, 3.0), (2 * i + c, -6.0), (2 * (i + 1) + c, 3.0)], 0.0)
for c in (0, 1): eq([(c, 10.0)], 0.0)  # start at the origin
if zprior is not None:
    for i in range(T): eq([(2 * i + 1, 0.3)], 0.3 * zprior[i])
sol = np.linalg.lstsq(np.array(rows), np.array(rhs), rcond=None)[0]
hip_w[:, 0] = sol[0:2 * T:2]; hip_w[:, 2] = sol[1:2 * T:2]
slip = []
for k, (s, i0, i1) in enumerate(phases):
    a_ = aL if s == 'L' else aR; sp = sol[2 * T + 2 * k: 2 * T + 2 * k + 2]
    slip += [float(np.hypot(hip_w[i, 0] + a_[i, 0] - sp[0], hip_w[i, 2] + a_[i, 2] - sp[1])) for i in range(i0, i1)]
print('plants', len(phases), '; travel start->end', np.round(hip_w[-1] - hip_w[0], 3), 'm; planted ankle off its spot median',
      round(float(np.median(slip)), 3), 'p95', round(float(np.percentile(slip, 95)), 3), 'm (the legs reach the spot by IK)')
W = rel + hip_w[:, None, :]  # world positions, C axes, metres
for k, (s, i0, i1) in enumerate(phases):  # a planted ankle sits exactly on its spot (eased in/out over 3 frames)
    j = ix['anL' if s == 'L' else 'anR']; sp = sol[2 * T + 2 * k: 2 * T + 2 * k + 2]
    for i in range(max(0, i0 - 3), min(T, i1 + 3)):
        w = 1.0 if i0 <= i < i1 else 1 - (i0 - i) / 4 if i < i0 else 1 - (i - i1 + 1) / 4
        W[i, j, 0] += w * (sp[0] - W[i, j, 0]); W[i, j, 2] += w * (sp[1] - W[i, j, 2])
up = np.array([0.0, 1.0, 0.0])
frames = []
MP = {'nose': 0, 'shL': 11, 'shR': 12, 'elL': 13, 'elR': 14, 'wrL': 15, 'wrR': 16, 'hipL': 23, 'hipR': 24, 'knL': 25, 'knR': 26, 'anL': 27, 'anR': 28}
for i in range(T):
    p = np.zeros((33, 3)); g = lambda n: W[i, ix[n]]
    for n, j in MP.items(): p[j] = g(n)
    for j in range(1, 11): p[j] = g('nose')  # face points: the faceless mannequin has none; the head rides on the chest
    kn, tp = g('knob'), g('tip'); d = (tp - kn) / np.linalg.norm(tp - kn)
    for s, (w, pk, ixf, th) in (('L', (15, 17, 19, 21)), ('R', (16, 18, 20, 22))):
        wr = p[w]; v = wr - kn; to = kn + d * (v @ d) - wr; to = to / max(1e-6, np.linalg.norm(to))
        p[ixf] = wr + to * 0.05 + d * 0.03; p[pk] = wr + to * 0.05 - d * 0.03; p[th] = wr + to * 0.03
    pf = np.cross(g('hipL') - g('hipR'), up); pf = pf - up * (pf @ up); pf /= np.linalg.norm(pf)  # pelvis forward (left x up)
    for s, (h, k, an, he, to) in (('L', ('hipL', 'knL', 'anL', 29, 31)), ('R', ('hipR', 'knR', 'anR', 30, 32))):
        bulge = g(k) - (g(h) + g(an)) / 2; bulge -= up * (bulge @ up)
        fd = pf if np.linalg.norm(bulge) < 0.03 else (pf + bulge / np.linalg.norm(bulge)) / 2
        fd /= np.linalg.norm(fd)
        p[he] = g(an) - fd * 0.05 - up * (ANK_H - 0.01); p[to] = g(an) + fd * 0.14 - up * (ANK_H - 0.01)
    hn = HN[i]
    frames.append({'f': A[i], 'p': p.round(4).tolist(), 'vis': [1.0] * 33, 'bat': d.round(4).tolist(),
                   'knob': kn.round(4).tolist(), 'tip': tp.round(4).tolist(),
                   'hands_s': {'Left': hn['Left']['s'], 'Right': hn['Right']['s']}, 'planted': [round(float(wt['L'][i]), 2), round(float(wt['R'][i]), 2)]})
out = {'fps': 60.0, 'f0': A[0], 'f1': A[-1], 'src': 'solve3d two-view (' + sys.argv[1].replace('\\', '/').split('/')[-1] + ')',
       'metres_per_unit': MPU, 'bat_length_m': D['bat_length_torso'] * MPU, 'frames': frames}
json.dump(out, open(OUT, 'w'))
print('wrote', OUT, 'frames', T)
