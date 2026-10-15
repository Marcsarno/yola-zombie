# Video → Yola mocap pipeline (bat combo)

Turns the reference videos (Downloads/ScreenRecording_10-15-2026 08-42-33_{1,11,12,13}.mov) into the game clip
`bat_combo_mc` (assets/yola_combo.glb, 60 fps, skeleton-only) and its bat path (assets/clipdata.json key `bat_combo_mc`).

**Requirements:**
- Python 3.12 venv with `mediapipe opencv-python numpy`, created with `uv venv --python 3.12` and then `uv pip install ...`.
- `pose_landmarker_heavy.task` from Google: storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/
- Blender 5.2: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe".

**Source clip:** clip 13 is the side view of the combo (the target is on the left of the frame). Frames 20–184 → clip frames 1–165 (clip frame = reference frame − 19).

## Steps (the data/ folder holds the outputs of steps 1–5 for clip 13)

1. **Pose:** `python extract.py ref13.mov pose13` gives 33 landmarks per frame (image and 3D world).
2. **Anchor:** `python anchor.py ref13.mov anchor13.json 20 184` tracks the dummy's static pedestal, because the camera follows her.
3. **Clean:** `python clean.py pose13.json combo13.json 20 184 -x "" anchor13.json side`
   - Puts everything in the character frame: X left, Y up, Z toward the target.
   - In a side view, forward and up come from the image; only the sideways depth comes from MediaPipe's 3D.
   - Travel is measured against the anchor, with the preview's teleports removed.
   - Despike, then a forward + backward One Euro filter.
4. **Bat 2D:** `python bat2d.py ref13.mov pose13.json anchor13.json bat13.json 20 184` casts rays from the hands to dark bat pixels, ignoring the mannequin's own black joint bands.
5. **Bat 3D:** `python bat3d.py combo13.json bat13.json combo13b.json left`
   - Phase keys (KEYS) give the bat's direction and which side of her body it is on.
   - The tracked image angle refines them where it agrees within 60°.
   - Contact frames (BLUR) use the keys only, because the "bat" there is a motion-blur streak.
**Steps 6–7 in one go:** `sh tools/mocap/rebuild.sh <work dir>` (from yolanda/zombie) retargets, exports and installs the clip
and its clipdata, and prints the checks (scale, contacts, pelvis drop, IK misses, soles).

6. **Retarget:** `blender -b characters.blend --python retarget_mocap.py -- combo13b.json bat_combo_mc bat_swing 24 work.blend`
   - Hips, spine and chest get orientation from two vectors each, relative to Yola's rest pose.
   - The head rides the chest, turned toward the target, limited to 55°.
   - Limbs aim at their next joint.
   - Both hands sit on the bat line (top grip and bottom grip), placed by two-bone IK with the video's elbows as poles.
   - Feet are pinned to the floor during contact phases (leg IK).
   - The torso and head get 5-frame quaternion smoothing.
   - Fingers use the grip from `bat_swing`.
   - The result is saved to a copy (work.blend). characters.blend is never overwritten.
   - Round 11 (2026-10-15) changes, each found by measuring the result against the video:
     - **Scale from leg length** (the reference's hip → ankle with a straight knee, 0.736 m), not hip height. The old hip-height
       scale placed her hips at standing height while the reference crouches: legs locked straight, feet floating.
     - **Up is the world's up** (armature +Z). Her rest skeleton leans 3° forward; using it as "up" tilted the floor, so she rose
       ~5 cm per metre travelled.
     - **Arms at their own scale**, placed from her shoulders. When a grip is beyond her (short) reach, the whole bat moves toward
       her, both hands together.
     - **Soles, not ankles, are grounded.** The foot's pitch comes from the reference; the lowest of her shoe vertices under
       that pitch sets the ankle height. Planted: sole on the floor. Lifted: as high as the reference's heel or toe. Lifted
       paths are smoothed; the pelvis drops (smoothly) when a leg can't reach with a soft knee.
     - **Knees point over the toes** (between foot and pelvis heading), not the tracker's sideways guess.
     - **IK aims each bone at its next joint** (the Tripo bones' axes don't point exactly at their children).
     - `BLUR_PLANTED`: frames where the tracker lost a foot in motion blur, planted per the video (forehand landing f23–30).
     - The action stores per-frame planted weights measured on her posed shoes; export writes them to clipdata (`cL`, `cR`)
       for the game's foot lock.
7. **Export:** `blender -b work.blend --python export_combo.py -- bat_combo_mc yola_combo.glb combo_clipdata.json` writes the skeleton-only GLB at 60 fps plus the bat path (r, l, d, hips per frame). Copy the GLB to assets/ and merge the JSON into assets/clipdata.json.
8. **Check renders:** `blender -b work.blend --python render_check.py -- bat_combo_mc <outdir> "11,17,23" left,top grips|socket`.

**Helpers:**
- `vframes.py`: Blender extracts video frames.
- `seq2mp4.py`: Blender encodes a PNG sequence to an H.264 MP4.

## In the game

- `src/core/weapons.js` `BAT_ATTACKS`: three segments of the one clip.
  - Frames 4–40: forehand.
  - 40–97: backhand.
  - 97–165: finisher.
  - Each segment's damage window (hitF0..hitF1) comes from the measured bat path. Chaining hands over on the exact frame, with no cross-fade.
- Root motion follows the clip's own hip travel (`A.ROOT`), scaled so she stops short of the target.
- Left hand: the bat hangs from the right hand. The left hand is put on the handle by two-bone IK after blending (`clipchars.js` `placeWeapons`, batMode).

- **Foot lock** (`clipchars.js` `footLock`, bat only): planted feet (clipdata `cL`/`cR`, and the idle stance) hold their
  spot on the floor while the body moves over them, by leg IK after the blend. A held foot more than 10 cm behind its animated
  spot takes a quick step; a released foot eases back onto the animation. This keeps the feet still when the game shortens the
  clip's advance to stop short of a zombie, during the assist turn, and while blending in from / back out to idle.
- The left clavicle swings up to 15° when the handle is beyond the straight arm (`reachClavicle`).

**Inspection tools:**
- `combat.html?mode=calm&lab=bat`: the real game frame by frame with the synced reference, overlays, action weights and timing sliders.
- `viewer.html` (Rig Lab): the clip with the reference video beside it and a weapon selector.
- Console helpers (no UI): `tools/labcheck.js` in the Rig Lab (feet, knees and lean against the video; reference sheets) and
  `tools/labgame.js` in the combat lab (grip gap, planted-foot slide, sim vs rendered bat, recordings). Their headers explain use.
- `tools/tests/*.mjs` (node): bat hit grid (`battest.mjs bat [wall]`), held combo (`combotest.mjs bat`), 12-zombie crowd
  (`crowdmelee.mjs`), glide/teleport probe (`glidetest.mjs`).
