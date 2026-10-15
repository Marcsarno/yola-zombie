# Contact sheet of video frames: python -I sheet.py <framedir> <out.png> <f0> <f1> <step> [cols] [tile_w] [crop x0,y0,x1,y1 as fractions]
import sys, os, cv2, numpy as np
d, out, f0, f1, step = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
cols = int(sys.argv[6]) if len(sys.argv) > 6 else 6; tw = int(sys.argv[7]) if len(sys.argv) > 7 else 380
crop = [float(v) for v in sys.argv[8].split(',')] if len(sys.argv) > 8 else [0, 0, 1, 1]
tiles = []
for f in range(f0, f1 + 1, step):
    p = os.path.join(d, 'f%04d.jpg' % f)
    if not os.path.exists(p): continue
    im = cv2.imread(p); h, w = im.shape[:2]
    im = im[int(crop[1] * h):int(crop[3] * h), int(crop[0] * w):int(crop[2] * w)]
    th = round(im.shape[0] * tw / im.shape[1]); im = cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA)
    cv2.rectangle(im, (0, 0), (110, 22), (0, 0, 0), -1); cv2.putText(im, 'f%d' % f, (5, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 230, 255), 1, cv2.LINE_AA)
    tiles.append(im)
rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
th = tiles[0].shape[0]
grid = np.vstack([np.hstack(r + [np.zeros((th, tw, 3), np.uint8)] * (cols - len(r))) for r in rows])
cv2.imwrite(out, grid); print(out, grid.shape)
