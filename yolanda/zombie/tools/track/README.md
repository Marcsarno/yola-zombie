# Weapon tracking from reference video, in 3D from two synced camera angles

Turns the user's recordings of a move into a 3D path of the weapon, as one rigid object (tip and knob), with the fighter's
body around it. This is WEAPON_HOLD_PROCESS.md step 0b. It was first used for the bat combo: clip 13 (side) + clip 1
(front three-quarter).

**Python:** the mocap venv (mediapipe, opencv, numpy, scipy), run with `python -I`. It was at
`…/scratchpad/mocap/.venv` in session b06f4cec. Re-create it with `uv venv --python 3.12` and
`uv pip install mediapipe opencv-python numpy scipy`.

## Steps

1. **Frames:** `python -I frames.py <video.mov> <dir> 1152` writes every frame as a JPEG, 1152 px wide.
2. **Pose:** MediaPipe landmarks per clip (`tools/mocap/extract.py`). Already done: `tools/mocap/data/pose{1,11,12,13}.json`.
3. **Sync:**
   - Find each strike's contact frame (the bat meets the dummy) by eye in both clips, with frame-by-frame sheets from
     `sheet.py`.
   - Then measure the offset: `syncsearch.py <config> <a0> <a1> <offsets> <workdir>` solves a stretch at each candidate
     offset and keeps the one where both views agree best.
   - Bat combo result: clip 1 frame = clip 13 frame + 70–72 through the forehand, + 80 from the upright hold on
     (`data/solve_bat_combo.json` "sync").
4. **2D tracking:** `track2d.py <frames> <pose.json> <f0> <f1> <out.json> <debugdir>`.
   - The bat is near-black and unsaturated. Below the horizon only the darkest pixels count.
   - It looks for the longest straight dark run through the hands or the previous bat.
   - It ignores the dummy (blue body, pole, pedestal) and runs along her own limbs.
   - The barrel (tip) is the visibly thicker end.
   - Its output is good on clear frames and poor on motion blur and wherever her body hides the bat.
5. **Correction by hand:** `batfix.html` (http://localhost:5173/zombie/batfix.html).
   - Each frame is shown large. Drag the tip and knob dots onto the bat, or mark the bat not visible.
   - Corrections save automatically to `shots/batfix_<clip>.json`.
   - For clip 1, lines start from the 3D solve's guess where tracking failed, and a corner panel shows clip 13 at the same
     moment with the corrected bat.
   - The page reads `shots/batfix/<clip>/fNNNN.jpg` and `shots/batfix/track_<clip>.json` (`shots/` is git-ignored).
   - **Copy the corrections into `data/` after a session** (see below).
6. **3D solve:** `solve3d.py data/solve_bat_combo.json <out.json>`.
   - **Cameras:** weak perspective, level, per-frame scale and offset; the second camera's rotation is smooth over time.
   - **Constraints:** constant bat length, constant bone lengths, smooth motion (bat strongest), a robust loss.
   - **End labels:** whichever end assignment fits is used, because blurred frames' labels can be swapped.
   - **User corrections:** weighted 2× the tracker's. They're strong, but not absolute: blur.
   - The best camera angle between the views comes from a search; the nose-in-front test rejects the mirror solution.
7. **Overlay:** `overlay.py <solve.json> <A frames> <B frames> <outdir> [cropA] [cropB]` draws the solved bat and skeleton
   back over both videos, plus top and side views. Encode with `tools/mocap/seq2mp4.py` (Blender).

## Bat combo data (`data/`)

| File | What it is |
|---|---|
| `batfix_c13.json` | 138 corrected frames from the user |
| `batfix_c1.json` | 169 corrected frames from the user (5 marked not visible). Pixels in the 1152-wide frames |
| `track_c13.json`, `track_c1.json` | The automatic 2D tracks |
| `reject13.json`, `reject1.json` | Frames I checked by eye and found wrong in the tracks |
| `suggest_c1.json` | The pass-2 solve projected into clip 1 (the page's starting guesses) |
| `bat3d_combo.json` | **The current 3D result** |

`bat3d_combo.json` covers clip 13 frames 20–184 (Yola frames 1–165):
- Per frame: `X` = 15 points (nose, both shoulders, elbows, wrists, hips, knees, ankles, then tip and knob), in the solve's
  frame, which is camera A's axes (y down).
- `proj` = each point projected into both clips.

Agreement:
- Clip 13 bat: median 15 px.
- Clip 1 bat: median 12 px (90% of frames within ~30 px).
- Bat length = 1.62 × her torso.

**Not yet covered:** the overhead finisher. Clip 13's side camera cuts away at frame 184. That strike needs clip 13's
close camera (frames ~186–215) or clip 12's back view, paired with clip 1 (~262–300).
