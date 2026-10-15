# Clean MediaPipe output into a character-space motion for retargeting.
# Character frame C: X = character's left, Y = up, Z = forward (toward the target), metres; origin on the ground under
# the hips at the first frame. Per frame: 33 joint positions (MediaPipe order) + diagnostics.
# usage: python clean.py <pose.json> <out.json> <f0> <f1> <target_dir: -x|+x|...>
import sys, json, math
import numpy as np

src, out, f0, f1, tdir = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
D = json.load(open(src)); fps = D['fps']; W, H = D['w'], D['h']
fr = [r for r in D['frames'] if f0 <= r['f'] <= f1]
n = len(fr)
world = np.array([r['world'] if r['world'] else [[np.nan] * 3] * 33 for r in fr], dtype=float)  # n x 33 x 3
img = np.array([[p[:2] for p in r['img']] if r['img'] else [[np.nan] * 2] * 33 for r in fr], dtype=float)
vis = np.array([[p[3] for p in r['img']] if r['img'] else [0] * 33 for r in fr], dtype=float)
# fill missing frames by linear interpolation
for arr in (world, img):
    flat = arr.reshape(n, -1)
    for j in range(flat.shape[1]):
        col = flat[:, j]; ok = ~np.isnan(col)
        if ok.sum() and (~ok).sum(): col[~ok] = np.interp(np.flatnonzero(~ok), np.flatnonzero(ok), col[ok])
L = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 1, 2, 3, 7, 9]; Rr = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 4, 5, 6, 8, 10]
# optional manual left/right relabel for frame ranges (argv[6] "a-b,c-d"), when a render shows a mirrored labelling
swaps = 0
if len(sys.argv) > 6 and sys.argv[6]:
    for rg in sys.argv[6].split(','):
        x0, x1 = map(int, rg.split('-'))
        for i in range(n):
            if x0 <= fr[i]['f'] <= x1: world[i][L + Rr] = world[i][Rr + L]; img[i][L + Rr] = img[i][Rr + L]; swaps += 1
# despike: a joint that leaves its neighbours (median of +-2 frames) by more than 0.2 m for a frame or two is replaced
spikes = 0
for j in range(33):
    for i in range(2, n - 2):
        med = np.median(world[i - 2:i + 3, j], axis=0)
        if np.linalg.norm(world[i, j] - med) > 0.2: world[i, j] = med; spikes += 1
# MediaPipe world: x right, y down, z away from the camera. Map to C with the target direction given in that frame.
up = np.array([0, -1, 0.0])
fwd = {'-x': [-1, 0, 0], '+x': [1, 0, 0], '-z': [0, 0, -1], '+z': [0, 0, 1]}[tdir]; fwd = np.array(fwd, float)
left = np.cross(up, fwd)
M = np.stack([left, up, fwd])  # rows: C axes in MediaPipe coordinates
pos = world @ M.T  # n x 33 x 3, hip-centred
# side view: the forward/up plane is the image plane, where the footage is directly measurable (lean, crouch, knee and
# elbow bends, arm heights); MediaPipe's 3D guess is kept only for the sideways (depth) component
IMGPLANE = len(sys.argv) > 8 and sys.argv[8] == 'side'
# hip height above the planted foot (the lowest foot point), and forward travel from the hips' image position
feet = [27, 28, 29, 30, 31, 32]
ground = pos[:, feet, 1].min(axis=1)  # (C.Y: up) lowest foot point relative to the hips
hipH = -ground
# metres per pixel from the body (computed before the image-plane replacement): world hip->ankle length vs image hip->ankle length (median over the window)
def seglen_w(a, b): return np.linalg.norm(world[:, a] - world[:, b], axis=1)
def seglen_i(a, b): d = (img[:, a] - img[:, b]) * np.array([W, H]); return np.linalg.norm(d, axis=1)
mpp = np.median((seglen_w(23, 27) + seglen_w(24, 28) + seglen_w(11, 23) + seglen_w(12, 24)) / (seglen_i(23, 27) + seglen_i(24, 28) + seglen_i(11, 23) + seglen_i(12, 24)))
hip_img = (img[:, 23] + img[:, 24]) / 2 * np.array([W, H])
if IMGPLANE:
    hipc = hip_img.copy()
    px = img * np.array([W, H])  # n x 33 x 2 pixels
    rel = (px - hipc[:, None, :]) * mpp
    sgn_x = -1 if tdir == '-x' else 1  # image right = -forward when the target is image-left
    pos[:, :, 2] = rel[:, :, 0] * sgn_x  # forward
    pos[:, :, 1] = -rel[:, :, 1]  # up (image y grows downward)
    ground = pos[:, feet, 1].min(axis=1); hipH = -ground  # (the hip height from the image too)
if len(sys.argv) > 7:
    anc = json.load(open(sys.argv[7]))
    ax = np.array([anc.get(str(r['f']), [np.nan, 0])[0] for r in fr], float); ok = ~np.isnan(ax); ax[~ok] = np.interp(np.flatnonzero(~ok), np.flatnonzero(ok), ax[ok])
    hip_img[:, 0] -= ax * W  # the hips relative to the static anchor
# the image's horizontal axis is MediaPipe x; travel along C = project the image x displacement onto C
dx_img = (hip_img[:, 0] - hip_img[0, 0]) * mpp
travel = np.outer(dx_img, M[:, 0])  # n x 3 (x image axis expressed in C)
travel[:, 1] = 0
# the reference preview teleports the character back after an attack: a jump faster than 0.06 m in one frame (3.6 m/s,
# beyond any step here) is removed, so the advance accumulates the way a real combo does
dz = np.diff(travel, axis=0); jump = np.linalg.norm(dz, axis=1) > 0.06; dz[jump] = 0
travel = np.vstack([travel[:1] * 0, np.cumsum(dz, axis=0)])
print('teleports removed', int(jump.sum()))
root = travel + np.stack([np.zeros(n), hipH, np.zeros(n)], axis=1)
P = pos + root[:, None, :]
# one-euro filter per coordinate (smooth at rest, responsive in fast motion)
def one_euro(x, fps, mincut=2.0, beta=0.05, dcut=1.0):
    y = np.empty_like(x); y[0] = x[0]; dprev = 0.0; te = 1.0 / fps
    a = lambda c: 1.0 / (1.0 + 1.0 / (2 * math.pi * c * te))
    for i in range(1, len(x)):
        dx = (x[i] - y[i - 1]) * fps; ad = a(dcut); dh = ad * dx + (1 - ad) * dprev
        c = mincut + beta * abs(dh); al = a(c); y[i] = al * x[i] + (1 - al) * y[i - 1]; dprev = dh
    return y
Ps = P.copy()
for j in range(33):
    for k in range(3): Ps[:, j, k] = one_euro(P[:, j, k], fps)
# forward/backward pass average removes the filter's lag
Pb = P[::-1].copy()
for j in range(33):
    for k in range(3): Pb[:, j, k] = one_euro(Pb[:, j, k], fps)
Ps = (Ps + Pb[::-1]) / 2
res = {'fps': fps, 'f0': f0, 'f1': f1, 'src': src, 'swaps': swaps, 'mpp': float(mpp),
       'frames': [{'f': fr[i]['f'], 'p': [[round(float(v), 4) for v in Ps[i, j]] for j in range(33)], 'vis': [round(float(v), 2) for v in vis[i]]} for i in range(n)]}
json.dump(res, open(out, 'w'))
tr = root[:, 2]
print('frames', n, 'relabelled', swaps, 'spikes', spikes, 'm/px', round(float(mpp), 5), 'forward travel max', round(float(tr.max()), 2), 'min', round(float(tr.min()), 2), 'hip height range', round(float(hipH.min()), 2), round(float(hipH.max()), 2))
for i in range(0, n, 12): print(fr[i]['f'], 'fwd', round(float(root[i, 2]), 2), 'hipH', round(float(hipH[i]), 2), 'wristR', [round(float(v), 2) for v in Ps[i, 16]], 'wristL', [round(float(v), 2) for v in Ps[i, 15]])
