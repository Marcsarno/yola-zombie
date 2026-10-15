# Grip schedule for holdfit.py from the reference's tracked hand positions along the weapon (tools/track/hands_on_bat.py).
# Outside the listed grip-change spans each hand uses the weapon's normal grip (weapons_hold.json). Inside a span, the
# hands follow the reference's along-weapon positions, smoothed (9-frame window), kept on the grippable length and at
# least a fist apart. Release windows (a hand lets go to regrip on the other side of the other hand) are passed through.
# Frames are the action's (1-based; action frame i+1 = hands.json row i).
# usage: python -I grip_schedule.py <hands.json> <weapon> <out.json> <span f0-f1[,...]> [release Side:f0-f1[,...][;Side:...]]
import sys, json, os
import numpy as np

H = json.load(open(sys.argv[1]))['frames']; W = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'weapons_hold.json')))[sys.argv[2]]
OUT = sys.argv[3]; spans = [tuple(map(int, s.split('-'))) for s in sys.argv[4].split(',')]
rel = {}
if len(sys.argv) > 5:
    for part in sys.argv[5].split(';'):
        side, ws = part.split(':'); rel[side] = [list(map(int, w.split('-'))) for w in ws.split(',')]
L = W['length']; T = len(H); FIST = 0.075  # metres between the two fist centres, at least (the data sheet's normal grip spacing)
raw = {s: np.array([r[s]['s'] for r in H]) * L for s in ('Left', 'Right')}
def smooth(x, n=9):
    k = np.ones(n) / n; return np.convolve(np.pad(x, n // 2, mode='edge'), k, 'valid')
sm = {s: np.clip(smooth(raw[s]), 0.04, 0.7 * L) for s in raw}
grips = {}
for i in range(T):
    f = i + 1; g = {}
    for s in ('Left', 'Right'):
        w = 0.0
        for a, b in spans:
            if a <= f <= b: w = max(w, min(1.0, (f - a) / 4, (b - f) / 4))
        g[s] = float(W['grips'][s] * (1 - w) + sm[s][i] * w)
    lo, hi = sorted(g, key=g.get)
    if g[hi] - g[lo] < FIST and not any(a <= f < b for s in rel for a, b in rel[s]): g[hi] = g[lo] + FIST
    grips[str(f)] = {s: round(v, 4) for s, v in g.items()}
json.dump({'weapon': sys.argv[2], 'release': rel, 'grips': grips, 'spans': spans}, open(OUT, 'w'), indent=0)
for f in range(1, T + 1, 6): print(f, grips[str(f)])
