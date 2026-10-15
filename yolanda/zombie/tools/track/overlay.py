# Draw the solved 3D bat (and skeleton) back over both synced videos, plus a 3D view of the solve, one image per frame.
# usage: python -I overlay.py <solve.json> <A framedir> <B framedir> <outdir> [crop fractions for A x0,y0,x1,y1] [for B]
import sys, os, json, cv2, numpy as np
S = json.load(open(sys.argv[1])); fa, fb, out = sys.argv[2], sys.argv[3], sys.argv[4]
cropA = [float(v) for v in sys.argv[5].split(',')] if len(sys.argv) > 5 else [0, 0, 1, 1]
cropB = [float(v) for v in sys.argv[6].split(',')] if len(sys.argv) > 6 else [0, 0, 1, 1]
os.makedirs(out, exist_ok=True)
N = S['names']; ix = {n: i for i, n in enumerate(N)}
BONES = [('shL', 'elL'), ('elL', 'wrL'), ('shR', 'elR'), ('elR', 'wrR'), ('hipL', 'knL'), ('knL', 'anL'), ('hipR', 'knR'), ('knR', 'anR'), ('shL', 'shR'), ('hipL', 'hipR'), ('shL', 'hipL'), ('shR', 'hipR')]
TH = 620
def panel(img, proj, crop, label):
    h, w = img.shape[:2]; o = img.copy()
    P = {n: tuple(int(round(v)) for v in proj[n]) for n in N}
    for a, b in BONES: cv2.line(o, P[a], P[b], (230, 230, 230), 1, cv2.LINE_AA)
    cv2.line(o, P['knob'], P['tip'], (0, 0, 0), 7, cv2.LINE_AA); cv2.line(o, P['knob'], P['tip'], (60, 230, 60), 3, cv2.LINE_AA)
    cv2.circle(o, P['tip'], 7, (40, 40, 255), -1, cv2.LINE_AA); cv2.circle(o, P['knob'], 7, (255, 140, 30), -1, cv2.LINE_AA)
    x0, y0, x1, y1 = int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)
    o = o[y0:y1, x0:x1]; o = cv2.resize(o, (round(o.shape[1] * TH / o.shape[0]), TH), interpolation=cv2.INTER_AREA)
    cv2.rectangle(o, (0, 0), (o.shape[1], 30), (0, 0, 0), -1); cv2.putText(o, label, (8, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
    return o
# 3D view: orthographic from above and from the side of the solve's own frame (y down in the solve = image down in A)
allX = np.array([r['X'] for r in S['frames']]); ctr = np.median(allX[:, [7, 8]].reshape(-1, 3), 0); span = np.percentile(np.abs(allX - ctr), 99) * 1.15
def view3d(X, trail, title, axes):
    s = 300; im = np.full((s, s, 3), 28, np.uint8)
    def pp(p): q = (p - ctr) / span; return (int(s / 2 + q[axes[0]] * s * 0.45), int(s / 2 + q[axes[1]] * s * 0.45 * axes[2]))
    for a, b in BONES: cv2.line(im, pp(np.array(X[ix[a]])), pp(np.array(X[ix[b]])), (170, 170, 170), 1, cv2.LINE_AA)
    for k in range(1, len(trail)): cv2.line(im, pp(trail[k - 1]), pp(trail[k]), (40, 40, 160), 1, cv2.LINE_AA)
    cv2.line(im, pp(np.array(X[ix['knob']])), pp(np.array(X[ix['tip']])), (60, 230, 60), 3, cv2.LINE_AA)
    cv2.circle(im, pp(np.array(X[ix['tip']])), 5, (40, 40, 255), -1); cv2.circle(im, pp(np.array(X[ix['knob']])), 5, (255, 140, 30), -1)
    cv2.putText(im, title, (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1, cv2.LINE_AA)
    return im
n = 0; trail = []
for r in S['frames']:
    a, b = r['a'], int(round(r['b']))
    A = cv2.imread(os.path.join(fa, 'f%04d.jpg' % a)); Bm = cv2.imread(os.path.join(fb, 'f%04d.jpg' % b))
    if A is None or Bm is None: continue
    X = np.array(r['X']); trail.append(X[ix['tip']]); trail = trail[-20:]
    pa = panel(A, r['proj']['A'], cropA, f'clip 13 (side)  frame {a}  = Yola {a - 19}')
    pb = panel(Bm, r['proj']['B'], cropB, f'clip 1 (front 3/4)  frame {b}')
    top = view3d(X, trail, 'solve, from above', (0, 2, 1)); side = view3d(X, trail, 'solve, from the side', (2, 1, 1))
    right = np.vstack([top, side, np.full((TH - 600, 300, 3), 28, np.uint8)]) if TH > 600 else np.vstack([top, side])[:TH]
    frame = np.hstack([pa, pb, right])
    if frame.shape[1] % 2: frame = frame[:, :-1]
    cv2.imwrite(os.path.join(out, 'o%04d.png' % n), frame); n += 1
print('frames', n, 'size', frame.shape[1], frame.shape[0])
