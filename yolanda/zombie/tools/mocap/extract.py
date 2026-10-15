# Pose extraction: MediaPipe Pose Landmarker (heavy) over every frame of a reference video.
# Output: <out>.json  {fps, w, h, frames: [{f, img: [[x,y,z,vis]*33] | null, world: [[x,y,z]*33] | null}]}
# plus overlay PNGs every `ov` frames (skeleton drawn on the frame) to check the detection.
# usage: python extract.py <video> <out_prefix> [overlay_every] [overlay_dir]
import sys, json, os
import cv2, numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

video, out = sys.argv[1], sys.argv[2]
ov = int(sys.argv[3]) if len(sys.argv) > 3 else 0
ovdir = sys.argv[4] if len(sys.argv) > 4 else None
here = os.path.dirname(os.path.abspath(__file__))
opts = vision.PoseLandmarkerOptions(
    base_options=mpt.BaseOptions(model_asset_path=os.path.join(here, 'pose_landmarker_heavy.task')),
    running_mode=vision.RunningMode.VIDEO, num_poses=2, min_pose_detection_confidence=0.3,
    min_pose_presence_confidence=0.3, min_tracking_confidence=0.3)
lm = vision.PoseLandmarker.create_from_options(opts)
cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 60
W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
EDGES = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(25,27),(24,26),(26,28),(27,31),(28,32),(15,19),(16,20),(0,11),(0,12)]
frames = []; i = 0
if ovdir: os.makedirs(ovdir, exist_ok=True)
while True:
    ok, bgr = cap.read()
    if not ok: break
    i += 1
    small = cv2.resize(bgr, (W // 2, H // 2))
    rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
    res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(i * 1000 / fps))
    rec = {'f': i, 'img': None, 'world': None}
    if res.pose_landmarks:
        # the character, not the training dummy: the pose whose landmarks are most visible / largest
        best = max(range(len(res.pose_landmarks)), key=lambda k: sum(p.visibility or 0 for p in res.pose_landmarks[k]))
        rec['img'] = [[round(p.x, 4), round(p.y, 4), round(p.z, 4), round(p.visibility or 0, 3)] for p in res.pose_landmarks[best]]
        rec['world'] = [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in res.pose_world_landmarks[best]]
    frames.append(rec)
    if ov and ovdir and i % ov == 1:
        img = small.copy()
        if rec['img']:
            P = [(int(p[0] * img.shape[1]), int(p[1] * img.shape[0])) for p in rec['img']]
            for a, b in EDGES: cv2.line(img, P[a], P[b], (0, 255, 0) if a % 2 else (255, 160, 0), 2)
            for k in (15, 16): cv2.circle(img, P[k], 5, (0, 0, 255), -1)
        cv2.putText(img, f'f{i}', (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.imwrite(os.path.join(ovdir, f'o{i:04d}.png'), cv2.resize(img, (420, int(420 * img.shape[0] / img.shape[1]))))
json.dump({'fps': fps, 'w': W, 'h': H, 'frames': frames}, open(out + '.json', 'w'))
det = sum(1 for r in frames if r['img'])
print('DONE', video, 'frames', len(frames), 'detected', det)
