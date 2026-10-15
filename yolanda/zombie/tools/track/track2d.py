# 2D tracking of a rigid stick weapon (bat) in one video: per frame its two ends (tip, knob) in image pixels.
# The bat is a thin straight object darker than whatever is right around it (wall or floor): a black-hat filter keeps
# thin dark structures, line detection keeps the straight ones, and the bat is the line through the hands (pose
# landmarks) or, when the hands are blurred, through where the previous frame's bat says it should be. The end the
# hands are near is the knob. Frames where the bat can't be seen clearly are marked low-confidence, not guessed: the 3D
# solve fills them from smooth rigid motion.
# usage: python -I track2d.py <framedir> <pose.json> <f0> <f1> <out.json> [debug_dir] [exclude x0,y0,x1,y1 fractions; ...]
import sys, os, json, math
import cv2, numpy as np
fd, posef, f0, f1, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
dbg = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] != '-' else None
P = json.load(open(posef)); PF = {r['f']: r for r in P['frames']}
if dbg: os.makedirs(dbg, exist_ok=True)
K = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (23, 23))
res = {}; prev = None

def hands(r, w, h):
    if not r or not r.get('img'): return None, None
    lm = r['img']; pts = np.array([[lm[k][0] * w, lm[k][1] * h] for k in (15, 16, 19, 20, 17, 18)])
    sh = (np.array(lm[11][:2]) + np.array(lm[12][:2])) / 2 * [w, h]; hp = (np.array(lm[23][:2]) + np.array(lm[24][:2])) / 2 * [w, h]
    return pts.mean(0), float(np.linalg.norm(sh - hp))

def march(mask, p, d, maxlen):  # walk along d from p while the (3 px wide) band stays mostly on the mask; gaps <= 7 px
    h, w = mask.shape; last = 0; gap = 0; nrm = np.array([-d[1], d[0]])
    for s in range(0, int(maxlen)):
        q = p + d * s; hit = False
        for o in (-2, -1, 0, 1, 2):
            x, y = int(round(q[0] + nrm[0] * o)), int(round(q[1] + nrm[1] * o))
            if 0 <= x < w and 0 <= y < h and mask[y, x]: hit = True; break
        if hit: last = s; gap = 0
        else:
            gap += 1
            if gap > 7: break
    return last

for f in range(f0, f1 + 1):
    im = cv2.imread(os.path.join(fd, 'f%04d.jpg' % f))
    if im is None: continue
    h, w = im.shape[:2]; g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    # the bat is near-black and unsaturated; below the horizon the floor is dark too, so there only the darkest pixels count
    gi = g.astype(int); rowm = np.median(gi, axis=1); hz = int(np.argmax(rowm < rowm[:h // 3].mean() * 0.55)) or h
    mask = (hsv[:, :, 1] < 110) & (gi < 58); mask[hz:] &= (gi[hz:] < 28)
    # not the dummy: its blue body, and the dark pole and pedestal below it
    blue = ((hsv[:, :, 0] > 90) & (hsv[:, :, 0] < 135) & (hsv[:, :, 1] > 45) & (hsv[:, :, 2] > 40)).astype(np.uint8)
    nb, lab, st, _ = cv2.connectedComponentsWithStats(blue)
    if nb > 1:
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        if st[k, cv2.CC_STAT_AREA] > 0.002 * w * h:
            x, y, bw, bh2 = st[k, :4]; m = int(0.3 * bw)
            mask[y:, max(0, x - m):min(w, x + bw + m)] = False
    seed, torso = hands(PF.get(f), w, h)
    if torso is None and prev: torso = prev['torso']
    maxlen = 2.1 * torso if torso else 0.3 * w  # the bat is ~1.7 torso lengths; never longer than this on screen
    pred = None
    if prev and prev['conf'] > 0.3: pred = (np.array(prev['knob']), np.array(prev['tip']))
    centre = seed if seed is not None else (pred[0] if pred is not None else None)
    # her own limbs (pose landmarks): a dark run lying along a thigh, shin or forearm is a body band, not the bat
    limbs = []
    r_ = PF.get(f)
    if r_ and r_.get('img'):
        L_ = [np.array(q[:2]) * [w, h] for q in r_['img']]
        for a_, b_ in ((23, 25), (25, 27), (24, 26), (26, 28), (11, 13), (12, 14), (13, 15), (14, 16), (11, 23), (12, 24)): limbs.append((L_[a_], L_[b_]))
    def on_limb(A, B):
        dAB = (B - A) / (np.linalg.norm(B - A) + 1e-6); worst = 0.0
        for a_, b_ in limbs:
            dl = b_ - a_; ll = np.linalg.norm(dl)
            if ll < 5: continue
            dl /= ll; par = abs(float(dAB @ dl))
            if par < math.cos(math.radians(14)): continue
            # how much of the run lies within 9 px of the limb's segment
            ts = np.linspace(0, 1, 9); P_ = A[None] + (B - A)[None] * ts[:, None]
            v = P_ - a_; t2 = np.clip(v @ dl, 0, ll); dist = np.linalg.norm(v - dl[None] * t2[:, None], axis=1)
            worst = max(worst, float((dist < 9).mean()))
        return worst
    best = None
    if centre is not None:
        ys, xs = np.nonzero(mask); pts = np.stack([xs, ys], 1).astype(float)
        near = pts[np.linalg.norm(pts - centre, axis=1) < maxlen * 1.05]
        if pred is not None: pd0 = (pred[1] - pred[0]) / (np.linalg.norm(pred[1] - pred[0]) + 1e-6); pang = math.degrees(math.atan2(pd0[1], pd0[0])) % 180
        for ang in np.arange(0, 180, 1.5):
            if pred is not None and min(abs(ang - pang), 180 - abs(ang - pang)) > 50: continue
            d = np.array([math.cos(math.radians(ang)), math.sin(math.radians(ang))]); n = np.array([-d[1], d[0]])
            off = (near - centre) @ n; along = (near - centre) @ d
            for o0 in np.arange(-0.2 * maxlen, 0.2 * maxlen + 1, 2.0):
                sel = np.abs(off - o0) < 3.5
                if sel.sum() < 15: continue
                t = np.sort(np.unique(np.round(along[sel])))
                # longest run with gaps <= 6 px that comes within 0.25*maxlen of the hands' point on the line
                br = np.nonzero(np.diff(t) > 6)[0]; starts = np.r_[0, br + 1]; ends = np.r_[br, len(t) - 1]
                for i0, i1 in zip(starts, ends):
                    lo, hi = t[i0], t[i1]; L = hi - lo
                    if L < 0.15 * maxlen or lo > 0.25 * maxlen or hi < -0.25 * maxlen: continue
                    score = min(L, maxlen) - 1.2 * abs(o0) - (2.5 * max(0.0, L - maxlen))
                    if pred is not None:
                        a = centre + n * o0 + d * lo; b = centre + n * o0 + d * hi
                        dpk = min(np.linalg.norm(a - pred[0]), np.linalg.norm(b - pred[0])); score -= 0.5 * dpk
                    A_, B_ = centre + n * o0 + d * lo, centre + n * o0 + d * hi
                    ol = on_limb(A_, B_)
                    if ol > 0.5: continue
                    score -= 60 * ol
                    if best is None or score > best[0]: best = (score, A_, B_, L)
    rec = {'f': f, 'torso': torso, 'conf': 0.0}
    if best is not None:
        _, P1, P2, L = best
        def end_width(A, B):  # median mask thickness over the 25% of the run nearest A
            d = (B - A) / (np.linalg.norm(B - A) + 1e-6); n = np.array([-d[1], d[0]]); ws = []
            for t in np.arange(0, 0.25 * np.linalg.norm(B - A), 2.0):
                c = A + d * t; tot = 0
                for sgn in (1, -1):
                    miss = 0
                    for o in range(1, 16):
                        x, y = int(round(c[0] + sgn * n[0] * o)), int(round(c[1] + sgn * n[1] * o))
                        if 0 <= x < w and 0 <= y < h and mask[y, x]: tot += 1; miss = 0
                        else:
                            miss += 1
                            if miss > 1: break
                ws.append(tot)
            return float(np.median(ws)) if ws else 0.0
        w1, w2 = end_width(P1, P2), end_width(P2, P1)
        hs = seed if seed is not None else (pred[0] if pred is not None else P1)
        # which end is the barrel (tip): 1) the visibly thicker end, 2) the end far from the hands (the hands hold near the
        # knob), 3) continuity with the previous frame
        idsrc = 'prev'
        if L > 0.45 * maxlen and max(w1, w2) >= 1.3 * max(1.0, min(w1, w2)) and max(w1, w2) >= 4:
            tip, knob = (P1, P2) if w1 > w2 else (P2, P1); idsrc = 'width'
        elif seed is not None and min(np.linalg.norm(P1 - hs), np.linalg.norm(P2 - hs)) < 0.3 * L and max(np.linalg.norm(P1 - hs), np.linalg.norm(P2 - hs)) > 0.65 * L:
            knob, tip = (P1, P2) if np.linalg.norm(P1 - hs) < np.linalg.norm(P2 - hs) else (P2, P1); idsrc = 'hands'
        elif pred is not None:
            same = np.linalg.norm(P1 - pred[0]) + np.linalg.norm(P2 - pred[1]) < np.linalg.norm(P2 - pred[0]) + np.linalg.norm(P1 - pred[1])
            knob, tip = (P1, P2) if same else (P2, P1)
        else:
            knob, tip = (P1, P2) if np.linalg.norm(P1 - hs) < np.linalg.norm(P2 - hs) else (P2, P1); idsrc = 'hands?'
        rec['idsrc'] = idsrc; rec['widths'] = [round(w1, 1), round(w2, 1)]
        vis = float(np.linalg.norm(tip - knob))
        rec.update({'tip': [round(float(tip[0]), 1), round(float(tip[1]), 1)], 'knob': [round(float(knob[0]), 1), round(float(knob[1]), 1)],
                    'vis': round(vis, 1), 'conf': round(float(min(1.0, vis / (0.6 * maxlen))), 2)})
    if seed is not None: rec['hands'] = [round(float(seed[0]), 1), round(float(seed[1]), 1)]
    res[f] = rec; prev = rec if rec['conf'] > 0 else prev
    if dbg:
        o = im.copy()
        if rec['conf'] > 0:
            c = (0, 220, 0) if rec['conf'] > 0.5 else (0, 160, 255)
            cv2.line(o, tuple(map(int, rec['knob'])), tuple(map(int, rec['tip'])), c, 3)
            cv2.circle(o, tuple(map(int, rec['tip'])), 7, (0, 0, 255), -1); cv2.circle(o, tuple(map(int, rec['knob'])), 7, (255, 120, 0), -1)
        if seed is not None: cv2.circle(o, tuple(map(int, seed)), 4, (255, 0, 255), -1)
        cv2.putText(o, f'f{f} c{rec["conf"]:.2f} {rec.get("idsrc", "")}', (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.imwrite(os.path.join(dbg, 'f%04d.jpg' % f), o)
json.dump({'w': w, 'h': h, 'frames': res}, open(out, 'w'))
print('frames', len(res), 'conf>0.5', sum(1 for r in res.values() if r['conf'] > 0.5), 'none', sum(1 for r in res.values() if r['conf'] == 0))
