# Track the bat in the reference video: from the hands, cast rays and find the direction with the longest run of
# dark "bat" pixels. Output per frame: image angle (deg, 0 = image right, 90 = image up), visible length (px at full
# res), and a confidence. Debug overlays every 6 frames.
# usage: python bat2d.py <video> <pose.json> <anchor.json> <out.json> <f0> <f1> [debug_dir]
import sys, json, os, math
import cv2, numpy as np
video, posef, ancf, out, f0, f1 = sys.argv[1:7]; f0, f1 = int(f0), int(f1)
dbg = sys.argv[7] if len(sys.argv) > 7 else None
P = json.load(open(posef)); A = json.load(open(ancf))
cap = cv2.VideoCapture(video); res = {}; i = 0
if dbg: os.makedirs(dbg, exist_ok=True)
while True:
    ok, bgr = cap.read()
    if not ok: break
    i += 1
    if i < f0: continue
    if i > f1: break
    r = P['frames'][i - 1]
    if not r['img']: continue
    H, W = bgr.shape[:2]
    lm = r['img']
    pts = [lm[k] for k in (15, 16, 19, 20)]
    gx = np.mean([p[0] for p in pts]) * W; gy = np.mean([p[1] for p in pts]) * H
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.int16)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    # background brightness near the hands (the wall above, the floor below): the bat is clearly darker than both
    dark = (gray < 62) & (hsv[:, :, 1] < 110)
    # the mannequin's own black joint bands sit inside orange: drop dark pixels with orange body right next to them
    orange = ((hsv[:, :, 0] < 22) | (hsv[:, :, 0] > 170)) & (hsv[:, :, 1] > 110) & (hsv[:, :, 2] > 60)
    near_body = cv2.dilate(orange.astype(np.uint8), np.ones((int(0.012 * W) | 1, int(0.012 * W) | 1), np.uint8)) > 0
    dark &= ~near_body
    # not the dummy's pedestal, not the character's own dark joints right at the hands
    if str(i) in A:
        ax, ay = A[str(i)][0] * W, A[str(i)][1] * H
        dark[int(max(0, ay - 0.25 * H)):, int(max(0, ax - 0.07 * W)):int(min(W, ax + 0.07 * W))] = False
    best = (0, 0, 0)
    L = int(0.20 * W)  # search radius ~ a bat length
    for a in range(0, 360, 2):
        ca, sa = math.cos(math.radians(a)), -math.sin(math.radians(a))
        run = 0; length = 0; miss = 0
        for s in range(int(0.03 * W), L, 3):
            x, y = int(gx + ca * s), int(gy + sa * s)
            if not (0 <= x < W and 0 <= y < H): break
            if dark[y, x] or dark[min(H - 1, y + 1), x] or dark[y, min(W - 1, x + 1)]: run += 1; length = s; miss = 0
            else:
                miss += 1
                if miss > 14: break
        if run > best[0]: best = (run, a, length)
    run, ang, length = best
    conf = min(1.0, run / 30.0)
    res[i] = {'ang': ang, 'len': length, 'conf': round(conf, 2), 'grip': [round(gx / W, 4), round(gy / H, 4)]}
    if dbg and i % 6 == 0:
        im = bgr.copy(); ca, sa = math.cos(math.radians(ang)), -math.sin(math.radians(ang))
        cv2.line(im, (int(gx), int(gy)), (int(gx + ca * length), int(gy + sa * length)), (0, 255, 0) if conf > 0.5 else (0, 0, 255), 8)
        cv2.circle(im, (int(gx), int(gy)), 12, (255, 0, 255), -1)
        cv2.putText(im, f'f{i} a{ang} c{conf:.1f}', (30, 80), cv2.FONT_HERSHEY_SIMPLEX, 2.2, (255, 255, 255), 5)
        cv2.imwrite(os.path.join(dbg, f'b{i:04d}.png'), cv2.resize(im, (420, int(420 * H / W))))
json.dump(res, open(out, 'w'))
print('tracked', len(res), 'confident', sum(1 for v in res.values() if v['conf'] > 0.5))
