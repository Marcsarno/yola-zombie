# 2D track of the training dummy's head top (the static anchor for the multi-view fit). The dummy's blue parts come apart
# in the colour mask (dark navy bands split them), so all blue blobs near the biggest one are taken together and the
# topmost blue pixel is the helmet top. The dummy rocks on a spring after each hit: frames from 2 to 32 after each listed
# contact frame are marked 'rocking' (the fit leaves them out), as are frames where the dummy touches the frame edge.
# usage: python -I dummy2d.py <framedir> <f0> <f1> <out.json> <contact frames "a,b,..."> [debug sheet png]
import sys, os, json
import cv2, numpy as np
fd, f0, f1, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
contacts = [int(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 and sys.argv[5] else []
res = {}
for f in range(f0, f1 + 1):
    p = os.path.join(fd, 'f%04d.jpg' % f)
    if not os.path.exists(p): continue
    im = cv2.imread(p); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); h, w = im.shape[:2]
    blue = ((hsv[:, :, 0] > 90) & (hsv[:, :, 0] < 135) & (hsv[:, :, 1] > 45) & (hsv[:, :, 2] > 40)).astype(np.uint8)
    blue = cv2.morphologyEx(blue, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(blue)
    if n < 2: continue
    j = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); A = st[j, cv2.CC_STAT_AREA]
    if A < 0.0003 * h * w: continue
    x0, y0, bw, bh = st[j, :4]; s = max(bw, bh)
    keep = [q for q in range(1, n) if st[q, cv2.CC_STAT_AREA] > 0.05 * A and abs(cen[q][0] - cen[j][0]) < 1.2 * s and abs(cen[q][1] - cen[j][1]) < 2.0 * s]
    m = np.isin(lab, keep); ys, xs = np.nonzero(m)
    ytop = np.percentile(ys, 0.5); band = ys <= ytop + 0.04 * (ys.max() - ys.min() + 1)
    top = [float(np.median(xs[band])), float(ytop)]
    edge = bool(xs.min() <= 1 or xs.max() >= w - 2 or ys.min() <= 1)
    rock = any(2 <= f - c <= 32 for c in contacts)
    res[f] = {'top': [round(top[0], 1), round(top[1], 1)], 'height': int(ys.max() - ys.min()), 'edge': edge, 'rocking': rock,
              'use': bool(not edge and not rock)}
json.dump({'frames': res, 'contacts': contacts}, open(out, 'w'))
print('dummy found in', len(res), 'frames, usable as a fixed point', sum(r['use'] for r in res.values()))
if len(sys.argv) > 6:
    fs = sorted(res); tiles = []
    for f in fs[::max(1, len(fs) // 24)][:24]:
        im = cv2.imread(os.path.join(fd, 'f%04d.jpg' % f)); r = res[f]; col = (0, 220, 0) if r['use'] else (0, 0, 255)
        cv2.circle(im, tuple(map(int, r['top'])), 9, col, -1); cv2.putText(im, str(f), (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 255), 2)
        tiles.append(cv2.resize(im, (300, round(im.shape[0] * 300 / im.shape[1]))))
    while len(tiles) % 6: tiles.append(np.zeros_like(tiles[0]))
    cv2.imwrite(sys.argv[6], np.vstack([np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)]))
