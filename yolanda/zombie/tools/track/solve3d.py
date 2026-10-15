# Two-view 3D reconstruction of the fighter and the rigid bat from synced videos (WEAPON_HOLD_PROCESS.md 0b).
# Cameras: weak perspective, level (both images' vertical = world vertical), view A fixed (world = A's camera axes),
# view B rotated about the vertical by a yaw (plus small pitch/roll, smooth over time), per-frame scale and offset.
# Per frame: 13 body landmarks + bat tip + bat knob in 3D. Constraints: the bat's length is constant, every bone's length
# is constant, motion is smooth (the bat most of all: "the bat never jitters"), robust loss against bad 2D points.
# 2D bat: the tracker's tip/knob, replaced by the user's corrections (shots/batfix_<clip>.json), minus rejected frames.
# usage: python -I solve3d.py <config.json> <out.json>
import sys, json, math, os
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from scipy.spatial.transform import Rotation as Rot

C = json.load(open(sys.argv[1])); OUT = sys.argv[2]
LM = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]           # nose, shoulders, elbows, wrists, hips, knees, ankles
NAMES = ['nose', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'hipL', 'hipR', 'knL', 'knR', 'anL', 'anR', 'tip', 'knob']
BONES = [(1, 3), (3, 5), (2, 4), (4, 6), (7, 9), (9, 11), (8, 10), (10, 12), (1, 2), (7, 8), (1, 7), (2, 8)]
SWAP = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 13, 14]          # left <-> right labels
NP = len(NAMES); TIP, KNOB = 13, 14

def load_view(v):
    P = json.load(open(v['pose'])); W, H = v['size']
    pose = {r['f']: np.array([[r['img'][k][0] * W, r['img'][k][1] * H, r['img'][k][3] if len(r['img'][k]) > 3 else 1] for k in LM]) for r in P['frames'] if r.get('img')}
    tr = json.load(open(v['track']))['frames']; fx = {}
    if os.path.exists(v['fix']): fx = json.load(open(v['fix'])).get('frames', {})
    rej = set(json.load(open(v['reject']))['frames']) if os.path.exists(v['reject']) else set()
    bat = {}
    for f in set(map(int, tr)) | set(map(int, fx)):
        x = fx.get(str(f))
        if x is not None:
            if not x.get('hidden'): bat[f] = (np.array(x['tip']), np.array(x['knob']), C.get('w_user', 2.0))  # the user's: strong, not absolute (blur)
            continue
        t = tr.get(str(f))
        if t and t.get('tip') and f not in rej and t['conf'] > 0.5: bat[f] = (np.array(t['tip']), np.array(t['knob']), 1.0)
    return pose, bat
A = C['A']; B = C['B']
poseA, batA = load_view(A); poseB, batB = load_view(B)
def fix_identity(bat, pose, name):
    """Which end is the barrel, decided by continuity over time (the bat can't turn end-over-end between two frames);
    the first frame of each run by the hands (the knob end is nearer the wrists)."""
    flips = 0; prev = None; pf = None
    for f in sorted(bat):
        tp, kn, w = bat[f]
        if prev is None or f - pf > 3:
            if f in pose:
                wr = (pose[f][5][:2] + pose[f][6][:2]) / 2
                if np.linalg.norm(tp - wr) < np.linalg.norm(kn - wr): tp, kn = kn, tp; flips += 1
        else:
            same = np.linalg.norm(tp - prev[0]) + np.linalg.norm(kn - prev[1]); swap = np.linalg.norm(kn - prev[0]) + np.linalg.norm(tp - prev[1])
            if swap < 0.8 * same: tp, kn = kn, tp; flips += 1
        bat[f] = (tp, kn, w); prev = (tp, kn); pf = f
    print(name, 'bat observations', len(bat), 'ends swapped by continuity', flips)
print('bat observations: A', len(batA), 'B', len(batB))  # (ends: the solve takes whichever assignment fits; see residuals)
def bframe(a):  # the B frame shown at the same moment as A frame a (piecewise linear sync from the contact anchors)
    pts = C['sync']; xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return a + float(np.interp(a, xs, ys))
frames = list(range(C['a0'], C['a1'] + 1)); T = len(frames)
# observations per frame: (view, point, x, y, weight)
def obs_for(pose, bat, f):
    out = []
    if f in pose:
        for j in range(13):
            x, y, vis = pose[f][j]
            if vis > 0.5: out.append((j, x, y, 1.0))
    if f in bat:
        tp, kn, w = bat[f]; out += [(TIP, tp[0], tp[1], 1.5 * w), (KNOB, kn[0], kn[1], 1.5 * w)]
    return out
OBS = []
for i, a in enumerate(frames):
    b = bframe(a); bi = int(round(b))
    OBS.append((obs_for(poseA, batA, a), obs_for(poseB, batB, bi)))
# normalise each view: centre on the median hip point, scale by the median torso length
def norm_view(k):
    hips, tors = [], []
    for oa_ob in OBS:
        o = {j: (x, y) for j, x, y, w in oa_ob[k]}
        if all(j in o for j in (1, 2, 7, 8)):
            sh = (np.array(o[1]) + o[2]) / 2; hp = (np.array(o[7]) + o[8]) / 2; hips.append(hp); tors.append(np.linalg.norm(sh - hp))
    return np.median(hips, 0), np.median(tors)
cA, sA0 = norm_view(0); cB, sB0 = norm_view(1)
for i in range(T):
    OBS[i] = ([(j, (x - cA[0]) / sA0, (y - cA[1]) / sA0, w) for j, x, y, w in OBS[i][0]], [(j, (x - cB[0]) / sB0, (y - cB[1]) / sB0, w) for j, x, y, w in OBS[i][1]])

# ---- initial guess: closed-form depth from a yaw-only camera B, yaw by search, mirror by the nose ----
def init_for(yaw):
    X = np.zeros((T, NP, 3)); ok = np.zeros((T, NP), bool)
    for i in range(T):
        oa = {j: (x, y) for j, x, y, w in OBS[i][0]}; ob = {j: (x, y) for j, x, y, w in OBS[i][1]}
        com = [j for j in oa if j in ob]
        if len(com) < 5: continue
        ya = np.array([oa[j][1] for j in com]); vb = np.array([ob[j][1] for j in com])
        s, tv = np.polyfit(ya, vb, 1)
        if s <= 0.05: continue
        xa = np.array([oa[j][0] for j in com]); ub = np.array([ob[j][0] for j in com])
        sy = math.sin(yaw)
        if abs(sy) < 0.2: continue
        tu = ub.mean() - s * math.cos(yaw) * xa.mean()
        z = ((ub - tu) / s - math.cos(yaw) * xa) / sy
        for n, j in enumerate(com): X[i, j] = (xa[n], ya[n], z[n]); ok[i, j] = True
    return X, ok
def bone_var(X, ok):
    tot = 0; n = 0
    for a_, b_ in BONES:
        m = ok[:, a_] & ok[:, b_]
        if m.sum() < 10: continue
        L = np.linalg.norm(X[m, a_] - X[m, b_], axis=1); tot += np.var(L) / (np.mean(L) ** 2 + 1e-9); n += 1
    return tot / max(1, n)
cands = sorted((bone_var(*init_for(math.radians(yd))), yd) for yd in range(5, 360, 5) if abs(math.sin(math.radians(yd))) > 0.25)
print('yaw search (best 4):', [(round(v, 4), y) for v, y in cands[:4]])
def nose_front(X, ok):  # + if the nose is on the chest's front side (right-handed body frame)
    s = []
    for i in range(T):
        if not (ok[i, [0, 1, 2, 7, 8]].all()): continue
        sh = X[i, 1] - X[i, 2]; up = (X[i, 1] + X[i, 2]) / 2 - (X[i, 7] + X[i, 8]) / 2
        fwd = np.cross(up * np.array([1, -1, 1]), sh * np.array([1, -1, 1]))  # (image y points down: flip to y-up first)
        nose = (X[i, 0] - (X[i, 1] + X[i, 2]) / 2) * np.array([1, -1, 1])
        s.append(np.sign(nose @ fwd))
    return np.mean(s) if s else 0
best = None
for v, yd in cands[:6]:
    X0, ok0 = init_for(math.radians(yd)); nf = nose_front(X0, ok0)
    print('  yaw', yd, 'bone var', round(v, 4), 'nose in front', round(nf, 2))
    if nf > 0.2 and best is None: best = (yd, X0, ok0)
if best is None: yd = cands[0][1]; X0, ok0 = init_for(math.radians(yd)); best = (yd, X0, ok0)
yaw0, X0, ok0 = best
if C.get('yaw_init') is not None and C.get('init_from'):
    # the cameras' real angle (e.g. from MediaPipe's per-view body yaw): near-opposite cameras can't be found by the search,
    # which prefers a mid angle; points start from a previous solve (right in each image, depth to be re-solved)
    yaw0 = C['yaw_init']; prev = json.load(open(C['init_from']))['frames']; pa = {r['a']: np.array(r['X']) for r in prev}
    X0 = np.array([pa[a] for a in frames]); ok0 = np.ones((T, NP), bool)
    X0[:, :, 2] *= C.get('init_depth_scale', 1.0)
print('initial yaw of camera B:', yaw0)
# fill missing initial points by interpolation over time (per point, per axis)
for j in range(NP):
    m = ok0[:, j]
    if m.sum() >= 2:
        for k in range(3): X0[~m, j, k] = np.interp(np.flatnonzero(~m), np.flatnonzero(m), X0[m, j, k])
    elif j in (TIP, KNOB): X0[:, j] = X0[:, 5] if j == KNOB else X0[:, 5] + [0, -1.5, 0]

# ---- full solve ----
# params per frame: X (NP*3), A: s, tx, ty (3), B: rotvec (3), s, tx, ty (3) -> NP*3 + 9; globals: bone lengths, bat length
PF = NP * 3 + 9; NG = len(BONES) + 1; NPAR = T * PF + NG
def unpack(p):
    F = p[:T * PF].reshape(T, PF); G = p[T * PF:]
    return F[:, :NP * 3].reshape(T, NP, 3), F[:, NP * 3:NP * 3 + 3], F[:, NP * 3 + 3:NP * 3 + 6], F[:, NP * 3 + 6:], G
p0 = np.zeros(NPAR); F0 = p0[:T * PF].reshape(T, PF)
F0[:, :NP * 3] = X0.reshape(T, -1); F0[:, NP * 3] = 1.0
rv = Rot.from_euler('y', yaw0, degrees=True).as_rotvec(); F0[:, NP * 3 + 3:NP * 3 + 6] = rv; F0[:, NP * 3 + 6] = 1.0
for i in range(T):  # B scale from the init fit
    pass
G0 = p0[T * PF:]
for k, (a_, b_) in enumerate(BONES): G0[k] = np.median(np.linalg.norm(X0[:, a_] - X0[:, b_], axis=1))
G0[-1] = np.median(np.linalg.norm(X0[:, TIP] - X0[:, KNOB], axis=1)) if ok0[:, TIP].any() else 1.7
HANDS = None
if C.get('hands'):
    hh = json.load(open(C['hands']))['frames']; hs = {r['a']: (r['Left']['s'], r['Right']['s']) for r in hh}
    rel = C.get('release_left', [])  # [a0, a1] clip-A frames where the left hand is off the bat (regrips)
    HANDS = [(hs.get(a, (0.08, 0.17)), any(r0 <= a < r1 for r0, r1 in rel)) for a in frames]
W_HAND = C.get('w_hands', 0.0); W_FRONT = C.get('w_front', 0.0)
W_GRIP = C.get('w_grip', 5.0); W_SM = C.get('w_smooth', 3.0); W_SM_BAT = C.get('w_smooth_bat', 6.0); W_BONE = 8.0; W_BAT = 20.0; W_CAM = 30.0
def residuals(p):
    X, ca, crv, cb, G = unpack(p); R = []
    Rb = Rot.from_rotvec(crv).as_matrix()  # T x 3 x 3
    for i in range(T):
        Y = X[i] @ Rb[i].T
        for v, (obs, pj) in enumerate(((OBS[i][0], lambda j: (ca[i, 0] * X[i, j, 0] + ca[i, 1], ca[i, 0] * X[i, j, 1] + ca[i, 2])),
                                         (OBS[i][1], lambda j: (cb[i, 0] * Y[j, 0] + cb[i, 1], cb[i, 0] * Y[j, 1] + cb[i, 2])))):
            bat = {}
            for j, x, y, w in obs:
                if j >= 13: bat[j] = (x, y, w); continue
                px, py = pj(j); R += [w * (px - x), w * (py - y)]
            if len(bat) == 2:  # tip/knob: whichever end assignment fits (blurred frames' labels can be swapped)
                (tx, ty, w), (kx, ky, _) = bat[TIP], bat[KNOB]; pt, pk = pj(TIP), pj(KNOB)
                same = [pt[0] - tx, pt[1] - ty, pk[0] - kx, pk[1] - ky]; swap = [pt[0] - kx, pt[1] - ky, pk[0] - tx, pk[1] - ty]
                e = same if sum(q * q for q in same) <= sum(q * q for q in swap) else swap
                R += [w * q for q in e]
        for k, (a_, b_) in enumerate(BONES): R.append(W_BONE * (np.linalg.norm(X[i, a_] - X[i, b_]) - G[k]))
        R.append(W_BAT * (np.linalg.norm(X[i, TIP] - X[i, KNOB]) - G[-1]))
        # the bat is in her hands: at least one wrist sits by the handle (the knob-end 40% of the bat), within a hand's reach
        k_, t_ = X[i, KNOB], X[i, TIP]; hd = t_ - k_
        def seg_d(p):
            u = np.clip((p - k_) @ hd / (hd @ hd + 1e-9), 0, 0.4); return np.linalg.norm(p - (k_ + hd * u))
        R.append(W_GRIP * max(0.0, min(seg_d(X[i, 5]), seg_d(X[i, 6])) - 0.15))
        if HANDS is not None:  # each wrist by its own grip point on the bat (a wrist sits ~0.1 bat lengths off the shaft)
            (sl, sr), relL = HANDS[i]
            for j, s_ in ((5, sl), (6, sr)):
                if j == 5 and relL: R.append(0.0); continue
                R.append(W_HAND * max(0.0, np.linalg.norm(X[i, j] - (k_ + hd * min(max(s_, 0.0), 0.9))) - 0.16 * G[-1]))
        if W_FRONT:  # the hands are in front of her chest (picks the side when the depth is ambiguous)
            sh_ = X[i, 1] - X[i, 2]; up_ = (X[i, 1] + X[i, 2] - X[i, 7] - X[i, 8]) / 2 * np.array([1, -1, 1])
            fw_ = np.cross(up_, sh_ * np.array([1, -1, 1])); fw_ = fw_ / (np.linalg.norm(fw_) + 1e-9) * np.array([1, -1, 1])
            mid_ = (X[i, 1] + X[i, 2]) / 2; tl_ = np.linalg.norm(up_)
            for j in (5, 6): R.append(W_FRONT * max(0.0, 0.12 * tl_ - (X[i, j] - mid_) @ fw_))
    acc = X[2:] - 2 * X[1:-1] + X[:-2]
    wsm = np.full(NP, W_SM); wsm[TIP] = wsm[KNOB] = W_SM_BAT
    R += list((acc * wsm[None, :, None]).ravel())
    R += list((W_CAM * (crv[1:] - crv[:-1])).ravel()) + list((W_CAM * (cb[1:, 0] - cb[:-1, 0])).ravel()) + list((W_CAM * (ca[1:, 0] - ca[:-1, 0])).ravel())
    return np.array(R)
# sparsity
def sparsity():
    rows = []; r = 0; S = []
    def add(cols): nonlocal r; S.append((r, cols)); r += 1
    for i in range(T):
        base = i * PF
        for j, x, y, w in OBS[i][0]:
            for c in range(2): add([base + j * 3 + c, base + NP * 3, base + NP * 3 + 1 + c])
        for j, x, y, w in OBS[i][1]:
            for c in range(2): add([base + j * 3 + q for q in range(3)] + [base + NP * 3 + 3 + q for q in range(3)] + [base + NP * 3 + 6, base + NP * 3 + 7 + c])
        for k, (a_, b_) in enumerate(BONES): add([base + a_ * 3 + q for q in range(3)] + [base + b_ * 3 + q for q in range(3)] + [T * PF + k])
        add([base + TIP * 3 + q for q in range(3)] + [base + KNOB * 3 + q for q in range(3)] + [T * PF + NG - 1])
        add([base + j * 3 + q for j in (5, 6, TIP, KNOB) for q in range(3)])
        if HANDS is not None:
            for j in (5, 6): add([base + q for jj in (j, TIP, KNOB) for q in range(jj * 3, jj * 3 + 3)] + [T * PF + NG - 1])
        if W_FRONT:
            for j in (5, 6): add([base + jj * 3 + q for jj in (1, 2, 7, 8, j) for q in range(3)])
    for i in range(1, T - 1):
        for j in range(NP):
            for c in range(3): add([(i + d) * PF + j * 3 + c for d in (-1, 0, 1)])
    for i in range(T - 1):
        for q in range(3): add([i * PF + NP * 3 + 3 + q, (i + 1) * PF + NP * 3 + 3 + q])
    for i in range(T - 1): add([i * PF + NP * 3 + 6, (i + 1) * PF + NP * 3 + 6])
    for i in range(T - 1): add([i * PF + NP * 3, (i + 1) * PF + NP * 3])
    M = lil_matrix((r, NPAR), dtype=int)
    for rr, cols in S:
        for c in cols: M[rr, c] = 1
    return M
J = sparsity()
print('params', NPAR, 'residuals', J.shape[0])
sol = least_squares(residuals, p0, jac_sparsity=J, loss='soft_l1', f_scale=0.05, max_nfev=C.get('iters', 60), x_scale='jac', verbose=1)
X, ca, crv, cb, G = unpack(sol.x)
# report: reprojection error per view (pixels in the 1152-wide frames), per point group
Rb = Rot.from_rotvec(crv).as_matrix()
def reproj(i, view):
    if view == 0: return lambda P: (np.array([ca[i, 0] * P[0] + ca[i, 1], ca[i, 0] * P[1] + ca[i, 2]]) * sA0 + cA)
    return lambda P: (np.array([cb[i, 0] * (Rb[i] @ P)[0] + cb[i, 1], cb[i, 0] * (Rb[i] @ P)[1] + cb[i, 2]]) * sB0 + cB)
errs = {'A_body': [], 'A_bat': [], 'B_body': [], 'B_bat': []}
res = {'frames': [], 'bat_length_torso': float(G[-1]), 'yaw_B': float(np.degrees(np.linalg.norm(crv[0]))), 'names': NAMES}
for i, a in enumerate(frames):
    row = {'a': a, 'b': bframe(a), 'X': X[i].round(4).tolist(), 'proj': {}}
    for v, (lab, obs) in enumerate((('A', OBS[i][0]), ('B', OBS[i][1]))):
        pr = reproj(i, v); row['proj'][lab] = {n: pr(X[i, j]).round(1).tolist() for j, n in enumerate(NAMES)}
        sc_, c_ = (sA0, cA) if v == 0 else (sB0, cB); bo = {}
        for j, x, y, w in obs:
            o = np.array([x, y]) * sc_ + c_
            if j >= 13: bo[j] = o; continue
            errs[lab + '_body'].append(float(np.linalg.norm(pr(X[i, j]) - o)))
        if len(bo) == 2:
            pt, pk = pr(X[i, TIP]), pr(X[i, KNOB])
            e = min(np.linalg.norm(pt - bo[TIP]) + np.linalg.norm(pk - bo[KNOB]), np.linalg.norm(pt - bo[KNOB]) + np.linalg.norm(pk - bo[TIP])) / 2
            errs[lab + '_bat'].append(float(e)); row.setdefault('bat_err', {})[lab] = round(float(e), 1)
    res['frames'].append(row)
for k, e in errs.items(): print('reprojection', k, 'median', round(float(np.median(e)), 1) if e else '-', 'p90', round(float(np.percentile(e, 90)), 1) if e else '-', 'px')
L = np.linalg.norm(X[:, TIP] - X[:, KNOB], axis=1); print('bat length (torso units)', round(float(G[-1]), 3), 'spread', round(float(L.std()), 4))
acc = np.linalg.norm(X[2:, TIP] - 2 * X[1:-1, TIP] + X[:-2, TIP], axis=1); print('tip acceleration p50/p95/max', np.round(np.percentile(acc, [50, 95, 100]), 3))
json.dump(res, open(OUT, 'w'))
print('wrote', OUT)
