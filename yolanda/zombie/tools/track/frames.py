# Extract every frame of a video to JPEGs at a given width (OpenCV). usage: python -I frames.py <video> <outdir> <width>
import sys, os, cv2
src, out, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(out, exist_ok=True)
cap = cv2.VideoCapture(src); i = 0
while True:
    ok, im = cap.read()
    if not ok: break
    i += 1; h, w = im.shape[:2]
    cv2.imwrite(os.path.join(out, 'f%04d.jpg' % i), cv2.resize(im, (width, round(h * width / w)), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 92])
print('frames', i, 'size', w, h)
