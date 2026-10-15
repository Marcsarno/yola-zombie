# Track a static scene anchor (the dummy's dark pedestal) per frame, so the character's travel can be measured
# against the world while the camera follows her. Writes <out>.json: {f: [x, y] in normalised image coords}
# usage: python anchor.py <video> <out> <f0> <f1> [debug_dir]
import sys, json, os
import cv2, numpy as np
video, out, f0, f1 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
dbg = sys.argv[5] if len(sys.argv) > 5 else None
cap = cv2.VideoCapture(video); res = {}; i = 0
while True:
    ok, bgr = cap.read()
    if not ok: break
    i += 1
    if i < f0: continue
    if i > f1: break
    h, w = bgr.shape[:2]
    small = cv2.resize(bgr, (w // 4, h // 4)); hh, ww = small.shape[:2]
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    # the pedestal: very dark, low saturation, in the lower half; the floor is darker grey, so use the darkest pixels
    v = hsv[:, :, 2].astype(float); s = hsv[:, :, 1]
    region = np.zeros_like(v, bool); region[int(hh * 0.45):int(hh * 0.95), :] = True
    thr = np.percentile(v[region], 1.5)
    m = (v <= max(thr, 18)) & region & (s < 120)
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, cents = cv2.connectedComponentsWithStats(m)
    if n > 1:
        k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        cx, cy = cents[k]; res[i] = [round(cx / ww, 4), round(cy / hh, 4)]
        if dbg and i % 12 == 0:
            os.makedirs(dbg, exist_ok=True); im = small.copy(); cv2.circle(im, (int(cx), int(cy)), 6, (0, 0, 255), -1)
            cv2.imwrite(os.path.join(dbg, f'a{i:04d}.png'), im)
json.dump(res, open(out, 'w'))
xs = [res[k][0] for k in sorted(res)]
print('tracked', len(res), 'x range', min(xs), max(xs))
