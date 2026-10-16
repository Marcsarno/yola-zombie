# Ponytail plan: the new Yola's hair off her back, one hair bone, a light sway

Status: PLAN ONLY (2026-10-16). Nothing changed yet. To be started in a fresh chat. The user judges every step before the
next one starts.

## What is wrong (measured, read-only)

- The new Yola (the nurse-scrubs Tripo model, "Yola 3.0"; game file `assets/yola2.glb`): her ponytail below the hair tie is
  skinned partly to her upper chest and collarbones (`mixamorig:Spine2`, `mixamorig:RightShoulder`, `mixamorig:LeftShoulder`,
  a few on `mixamorig:RightArm`), up to 78-100%. Her face, skull and hair bun are on her head only.
- Yola 2.0 (the original, `assets/yola.glb`): her ponytail is 58% Head + 42% Neck, 0% chest (corrected 2026-10-16;
  earlier written as "head only"). No chest weight is why her hair never pulled.
- Head-turn test (2026-10-16, only the Head bone turned 45 deg, rest pose): the new Yola's lower ponytail stays put on her
  back while the top twists with the tie; the original's whole ponytail turns with her head. Images: shots/ponytail/step1c_*.
- `mixamorig:HeadTop_End` (the long bone above her head): Mixamo's end-of-chain marker, 0 vertices weighted, no children,
  same on the original. Its drawn length is Blender display only; glTF/three.js bones have no length. Harmless.
- Effect on the new Yola: when her head turns relative to her chest, the ponytail is held half by her head and half by her
  chest, so it twists and crumples at the hair tie. Worst pulls off her head: hit to the head 169 mm, running strafe 164 mm,
  axe stance 161 mm, bat combo 139 mm, pistol idle/walk 56-64 mm.
- Source of the weights: Tripo's automatic rigging (copied unchanged by tools/anim/yola2_build.py).
- Evidence images (session scratchpad, regenerate if gone): colour maps of both Yolas (grey = head only, red = chest /
  collarbones), and the axe stance frame 23 new vs original.

## Files

- Build file: `assets/source/yola_v2/yola2_work.blend` (round 18 state, unchanged).
- Backups made before any edit: `assets/source/yola_v2/yola2_work_before_hair.blend`, `assets/source/yola_v2/yola2_before_hair.glb`.
- Export: `blender -b assets/source/yola_v2/yola2_work.blend --python tools/anim/yola2_export.py -- <ABSOLUTE path to assets>`
  (a relative path breaks the cloth texture load).

## Step 1 result (2026-10-16, waiting for the user's verdict)

- The ponytail is its own mesh island: 1,252 welded positions (2,928 vertices with UV-seam copies), 2,485 faces, no face
  shared with any other part. It is the only island behind her neck. Every one of its vertices has `Spine2` weight; on
  average 60% Spine2, 19% Head, ~17% collarbones. Images: shots/ponytail/step1_*.png (git-ignored).
- Also found: the hair tie + the hair gathered into it (on the hair-cap island, 1,010 vertices) carry 10-30% chest weight.
  If only the ponytail moves to 100% head, the tie would still drift slightly and could open a gap at the tie. The user
  decides whether the tie goes into step 2 too.
- Temporary display objects in the open Blender: `TMP_ponytail` (red), `TMP_nape` (yellow), `TMP_cam`. Delete before saving.
- Hair bones: 3 bones in a chain, not 1 (decided with the user's go-ahead "add more if it makes sense"). One bone swings the
  ponytail like a stiff stick; three let it curve and the tip trail behind. Mobile cost is negligible: skinning cost is per
  vertex (max 4 influences) whatever the bone count, and the spring is a few lines of math per bone per frame.

## Step 2 result (2026-10-16, applied in the open Blender, NOT saved; waiting for the user's verdict)

- Ponytail island (2,928 verts): all Spine/Spine1/Spine2/collarbone/arm weight removed and added to Head (avg 80% moved).
  Head now 92.5-100% (existing Neck <=7.5% on 326 top verts kept). Verified against a full snapshot: 0 other vertices
  changed, every ponytail vertex sums to 1. Images: shots/ponytail/step2_*.
- Good: no more twist/crumple; the ponytail turns with her head like the original.
- New issues seen:
  1. Hair tie gap: the tie (hair-cap island, 5-30% chest) lags ~12 mm (half its 26 mm width) on a 45 deg head turn, and
     the ponytail root slides out of the band. Fix candidate: also remove chest weight from the hair cap (the original
     Yola's hair has 0% chest everywhere).
  2. Tips into her back: in bat_idle f28 the stiff ponytail's tips sink into her back (the original's rest on top). In
     t_hit_head f12 both the new and the original bury the ponytail in her back. Hair bones + gravity/limits (steps 3, 5)
     are the intended fix.

- Step 2b (user: "also take the hair tie / hair cap off her chest like the original Yola"): hair-cap island (8,876 verts,
  5,095 had chest weight, avg 3.4%) -> chest weight added to Head, Neck kept. Now 0 chest weight anywhere in her hair.
  Tie band vs head on a 45 deg turn: 3 mm, the same as the ponytail (was 12 mm apart). Neck edges checked both sides
  with the head turned: no skin through the hair. Images: shots/ponytail/step2t_*. Still not saved; the tips-into-back
  issue (bat_idle f28) remains for steps 3/5.

- SAVED 2026-10-16 (user: "Save it (backups stay)"): yola2_work.blend = step 2 + 2b (weights fingerprint dbfb6a27...).
  Backup yola2_work_before_hair.blend still the original (f912bf86...). Not exported yet.

## Step 3 (2026-10-16, in the open Blender, NOT saved; waiting for the user's verdict)

- Bones `mixamorig:Hair1/2/3` (game sees Hair1-3), chain parented to `mixamorig:Head`, deform on, roll aligned to Head.
  Rest: Hair1 (0.004,0.066,0.895)->(0.012,0.077,0.825), Hair2 ->(-0.010,0.096,0.755), Hair3 ->(-0.003,0.078,0.686);
  ~7 cm each, 22 cm ponytail. Armature now 68 bones (export uses export_def_bones=False, so all go out).
- Weights on the ponytail only, by distance down the hair: 100% head at the tie, blending to Hair1 by 3.6 cm, Hair2 by
  10.9 cm, Hair3 by 18.3 cm (tips 100% Hair3). The Neck weight under the tie (<=7.5%) is kept as is. Max 3 influences.
- Checked: weights sum to 1; non-ponytail weights identical to the saved file (hash 8a610c0a... both); with the hair bones
  unrotated, her shape in 4 clip frames is identical to step 2 (max 0.0002 mm). Images: shots/ponytail/step3_*.
- Bend test (each hair bone 15 deg = tip 45 deg; images shots/ponytail/step3_c/d/e): smooth curve left/right/back, root
  at the tie moves <1 mm, nothing else on her body moves. Outer edge of a sideways bend stretches (worst +58% at 45 deg,
  +19% at 15 deg total, +6% backward at 15 deg): no tearing seen. At 45 deg sideways the tips cut into her shoulder:
  step 5 must keep the sway small (planned ~15-20 deg at the tip) and/or limit sideways more than backward.
- Bone display: armature show_in_front was already True in the saved file (unchanged).

## Step 3 saved + step 4 export (2026-10-16)

- yola2_work.blend saved with the hair bones (68 bones). No clip keys the hair bones.
- Export rewrote 4 files. Compared old vs new (scratchpad cmp_glb.py; old copies in the session scratchpad pre_export/):
  - yola2.glb: +3 bones (Hair1-3 under Head), 0 existing bones changed, inverse binds identical; 50/50 clips, every
    existing track identical (max diff 0); mesh positions/normals/UVs/indices identical; textures + materials identical;
    weights changed on 8,039 vertices, all in the hair, all now 100% head/neck/hair, 0 chest. +104 KB = constant hair
    tracks (rest pose) the exporter adds to all 50 clips. NOTE for step 5: the mixer writes the hair bones' rest pose
    every frame, so the sway must run AFTER mixer.update (as planned); the tracks could also be stripped at load.
  - joint ORDER changed (hair bones inserted mid-list): fine for three.js (bones by name); nothing in src/ indexes bones.
  - yola_sword.glb (first Yola): content identical, 40 bytes of metadata differed -> original bytes restored.
  - clipdata_yola2.json: 19 numbers off by 0.00001 (float noise) -> original restored.
  - moves/yola2_moves.glb (local, untracked): +3 hair bones, all 16 clips' tracks identical.
- Game: loads the new file (68 bones, Hair1-3 parented to Head), no console errors. Rig Lab bat_idle f28 old vs new:
  shots/ponytail/step4_*. Only assets/yola2.glb shows as modified in git.

## Step 5: the sway (2026-10-16, built, NOT committed; waiting for the user's verdict)

- src/render/hairsway.js (shared): damped springs on Hair1-3 tails toward the modelled shape, gravity, drag, length
  + per-bone angle limit, 6 collision spheres (head, neck, spine; bone-local, sized in Blender to just miss the hair at
  rest), fixed 1/120 s sub-steps with the head/colliders interpolated, 1 s settle on (re)start. Defaults k 180/90/60,
  zeta 0.5, g 6, drag 0.4, max 25/35/35 deg. Game: YolaView.update after footLock + die(). Rig Lab: "hair sway"
  checkbox; while playing, the Rig Lab now poses between frames (smooth).
- Fixed on the way: shoulder spheres removed (shoulders rise into the hair when the arms go up: 44 deg shove); the
  first-frame drop (settle before the first frame).
- Jitter (tools/hairjitter.js, run in the Rig Lab console): bat idle tip accel = head's (1 vs 1-2 m/s^2), 30/60/120 fps
  paths within 0.5 mm; strafe tip below head, 0.4 mm; hit head / sword combo tip 1.5-3x head (whip after a jerk),
  reversals 1-2%; violent combo at 30 fps path differs up to 7 cm (contact timing), smooth.
- Look (shots/ponytail/step5_sway_off_vs_on.png): light. Hangs better after a hit (f20) but STILL sticks up at the
  head-thrown-back moment (hit head f12): the angle limits stop gravity. Options: larger limits / more gravity.
- v2 (user: "let it hang more"): k 100/35/20, g 12, limits 60/90/100 (tried 3 sets; this one hangs most: standing
  14/12/10 deg from vertical vs 23/15/22). Hit f12: she is bent far back, the hair now lies on her neck/upper back
  (spheres 1-3; without them it would pass through her). Jitter: standing/strafe smooth (tip 5 vs head 1-2; paths
  within 1-7 mm across fps); hit head tip 3-4x head, reversals 1-4%; sword combo FLAILS (tip 2-3x head, paths up to
  29 cm apart at uneven 60 fps: chaotic, not jittery). Image shots/ponytail/step5b_*. Not committed.

- COMMITTED abe9223 (2026-10-16, user: "lets commit").

## FINAL POLISH PASS (saved for when the game is more complete; user, 2026-10-16)

Hair clipping through her body (light, mobile-safe). Why it clips: only the 3 bone tails are tested (a bone's middle
can cut through), only the centre line (the ponytail is up to 12 cm wide and flat), the spheres leave gaps, and there
is nothing on the shoulders. Plan, one at a time, measured before/after:
1. Measure first: a Blender check counting ponytail vertices inside her body over every clip (no game cost).
2. Capsules along neck -> spine instead of the 6 spheres (no gaps).
3. Test each bone's midpoint too (6 points).
4. Test the ponytail's two edge points at its wide part (the flat sides into the shoulders).
5. Shoulder capsules sized across ALL clips (rest-pose spheres failed: the shoulders rise with the arms).
6. Optional: tame the flailing in attacks (sword combo).
Cost: a few thousand distance checks per frame, well under 0.1 ms on a phone. Mesh-level collision is out (too heavy).

## After the ponytail (user, 2026-10-16)

- Face bend (user spotted in the Rig Lab, bat_idle frame 22): NOT caused by the ponytail work (face weights untouched).
  The clip turns her head 86 deg from her chest (71 deg head-on-neck); Tripo put Neck weight over her whole face
  (~10%, jaw 20-30%), so the jaw lags ~21 deg and flattens into her neck. The original Yola has the same spread but her
  round jaw hides it. Image: shots/ponytail/face_bat_idle_f22_new_vs_original_and_neck_weight.png. Fix candidate (not
  started, the user decides): face above the jawline 100% Head, Neck only on the neck with a soft blend under the jaw;
  judge in motion against X Bot.
- Face fix APPLIED in the open Blender, NOT saved (2026-10-16, user: "face 100% head above the jaw, neck only on the
  neck"; backup yola2_work_before_face.blend). Jawline boundary: z 0.823 at the chin rising to 0.868 at the sides/back
  (0.870 at the back), 1.5 cm blend band below it. Head-region islands only, ponytail excluded. 11,775 verts changed (avg
  9.4% non-head weight moved to Head; chin underside + lower teeth had 40-70% Neck). 0 changed outside the zones, sums 1.
  Images: shots/ponytail/face1-3_*. Blender's dirty flag stays False after scripted weight edits: save explicitly.
- "Neck breaking into pieces" (user, Blender frame 22): pale flat patches only in Blender's viewport when posed, already
  there with the old weights (also on her cheeks). Cause: Tripo's stored custom normals don't follow the pose in Blender's
  display. No real cracks (welded seams 0 mm apart). Recomputed normals: smooth. three.js (temp export in the Rig Lab):
  smooth neck. Images shots/ponytail/face4-5. Textures (asked): source 4096; game file colour 2048, normal + roughness
  1024 WebP, set by yola2_export.py since round 18 (not changed in this work).
- Face fix SAVED (2026-10-16; weights hash a5762910..., verified from disk; backup yola2_work_before_face.blend).
- T-pose audit vs Yola 2.0 (2026-10-16, read-only, images shots/audit/a1-a6):
  - Both: every vertex weighted, sums 1, max 4 bones. No weight on far-away or wrong-side bones worth noting.
  - Sharp jumps (>50% of the weight changing across one edge): new 419 vs original 95. New: fingers 196 (orig 78),
    hip crease Hips/UpLeg 62 (hidden under the shirt hem), Head/Neck 32 under the jaw (MY face fix: edges there are 10-21
    mm, longer than the 15 mm blend -> widen to ~3 cm), ankles 26, wrists 25, back of shoulders 23. Shirt front/back
    has much more 25-50% yellow (big cloth triangles).
  - Stress pose (arms up 70, wrists 45, head 40): back clean on both; wrist: new creases a bit tighter; neck: pale
    patch on both (display normals). MY ERROR: the "kick" rotated the thigh BACKWARD (+X world turns down toward +Y =
    her back) and the knee the wrong way; the user spotted it. That result (original's pocket spike) is void.
  - Corrected knee raise (thigh -70 about world X = forward, knee +90): original's hip smooth; NEW Yola's shirt hem is
    dragged up by the thigh and folds at the hip (shirt bottom too much on UpLeg). Image shots/audit/a7.
  - Jaw shown in the Rig Lab (temp export, bat_idle f31, image shots/audit/a8): face fix = hard folded corner where the
    red (100% head) jaw meets the neck; current game file = smooth but squashed chin (60% head). Plan: keep the jaw 100%
    head and put a wide (~3-4 cm) blend in the NECK below it. Fold metrics were unreliable (collar); judge by eye.
  - Jaw blend v2 APPLIED in Blender, NOT saved (2026-10-16): rebuilt from the pre-face weights; above the jawline 100%
    head, then a 4 cm smoothstep blend DOWN the neck (ponytail excluded). 42 points had 5 bones -> smallest dropped
    (max 6.3%), renormalized: max 4 everywhere. Sharp Head/Neck edges 32 -> 6. Rig Lab f31 (shots/audit/a9): smooth
    gradient; a faint crease line remains on the right side of her neck.
  - v2 REJECTED by the user ("not smooth at all": jagged red teeth, patchy). Cause: blend measured by height; under
    the chin the skin is nearly flat, so it collapsed into one row of big triangles.
  - Jaw blend v3 APPLIED in Blender, NOT saved: core = head skin >=4 mm above the jawline (100% head); blend by
    SURFACE distance (Dijkstra on the welded mesh) over 4.5 cm, smoothstep, then 8 smoothing passes (core fixed);
    ponytail excluded; max 4 bones. Sharp Head/Neck edges 0; biggest single-edge head change 37%. Rig Lab f31: smooth
    gradient, slightly blocky (neck has few big triangles); a diagonal neck line remains at this 86 deg head turn.
    Image shots/audit/a10.
  - v3 SAVED + EXPORTED + COMMITTED (2026-10-16, user: "slightly better ... committed and saved"). Blend weights hash
    96dc214d...; backups yola2_work_before_hair.blend / yola2_work_before_face.blend (git-ignored, on disk). Export check:
    only head/neck weights changed vs the step-4 file; yola_sword.glb + clipdata_yola2.json restored (float noise only).
  - Rig Lab test (shots/audit/b1-b3, BEFORE today | NOW | Yola 2.0, 3/4 eye-height, captured from the renderer via
    POST /__shot): jaw rounder in the head turns, ponytail no longer smeared onto the shoulder. NEW PROBLEM: the
    ponytail is now rigid on the head, so on a head-back hit it sticks UP into the air and in the strafe it points
    straight back like a stiff tube (Yola 2.0's hangs down onto her back). Step 5 (gravity sway on Hair1-3) is the fix.
  - Suggested fixes, in order: (1) widen the jaw blend (mine, v3 above), (2) shirt hem off the thigh (more Hips), (3) smooth
    wrists/fingers/ankles, judging each by bending it. Nothing done yet.
- The user noticed the skeleton sticks out of her fingertips a bit in Blender. Look at it after the ponytail is done
  (check whether it is only the display-only end bones, like HeadTop_End, or real finger joints placed too far out).

## Steps (each ends with images for the user; nothing continues until they say so)

1. **Select the ponytail only.** Find the ponytail vertices: the hair hanging behind her neck below the hair tie, found by
   connectivity from the ponytail tips (vertices merged by position, since the mesh is split at every UV seam), never her
   neck skin, collar or shirt. Show the selection in colour from the back and both sides next to the whole head.
   Gate: the user agrees it is exactly the ponytail.
2. **Weights off her back, 100%.** On the selected vertices only: remove every weight to Spine / Spine1 / Spine2, both
   collarbones and both arms; give it to the head. Nothing else on the mesh is touched (verify: every other vertex's weights
   identical to before). Show the colour map next to Yola 2.0's, plus the axe stance and the hit-to-the-head frames before /
   after. Expect the pull off her head to drop from ~160 mm to ~0.
   Gate: the user approves the look (still and in a short 1x turntable / clip playback in Blender).
3. **One hair bone.** Add one bone (e.g. `mixamorig:HairTail`), parented to `mixamorig:Head`, from the hair tie down the
   ponytail. Weight the ponytail from the head at the tie (100% head) blending smoothly to the hair bone toward the tips,
   so the root never moves and the length can swing. At rest it must look identical to step 2 (the bone not rotated).
   Show the weights in colour, and the bone rotated 15 deg left / right / back in Blender so the bend can be judged.
   Gate: the user approves how it bends.
4. **Export and check nothing else changed.** Re-export yola2.glb. Check: every clip's bones unchanged (only the new bone
   added, not keyed), mesh and textures unchanged, the game loads. Show the game standing still: identical to before except
   the ponytail no longer twists.
5. **The light sway in the game.** A small spring on the hair bone only (render/clipchars.js, after the mixer): it lags
   behind her head's motion, hangs with gravity, settles back, limited to a small angle (start ~15-20 deg). It never moves
   any other bone. Before showing: measure it for jitter frame to frame (it must be as smooth as her head) at 30, 60 and
   120 fps. Show 1x recordings: standing, walking, running, turning, a swing, a hit.
   Gate: the user judges the sway (amount, speed, bounce) and can ask for more / less.
6. **Commit** only after the user approves, with the before/after images.

## Rules for this work (learned the hard way, round 19)

- Change only the ponytail. No animation clip is edited. No other weights are touched.
- One step at a time, with pictures, the user judges before the next step.
- Judge by eye in motion against Yola 2.0, never by a number alone. Measure jitter before showing anything that moves.
- Keep the backups until the user approves the final result.
