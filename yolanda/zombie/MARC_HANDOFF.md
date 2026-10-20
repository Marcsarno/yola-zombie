# Marc (the male hero) — where everything is

First saved 2026-10-19 ("keep him as he is now", commits 4ad219e + f5f4ac7). Updated 2026-10-20: collarbones fixed,
hand match removed. The user: **"the shoulders are fantastic like this"**. Next, the user places the guns in his hands
and adjusts his left arm in the Rig Lab. He is not in the game.

## Look at him
- Rig Lab: http://localhost:5181/zombie/viewer.html?char=male1 (preview server "yolanda-anim"), or pick **Marc** in
  the character buttons.
- He plays every clip Yola 2 has (50 game clips + 39 add-ons), beside the clip's own dummy (X Bot or the mannequin).
- **dummy: clothed** shows Brian (Mixamo) for Mixamo clips and the Quaternius Peasant / Ranger for library clips.
  See CHARACTER_RIG_PLAYBOOK.md 2a.
- **2nd figure** (Body check → Compare): the weight tests below, beside the current Marc.

## What he is now
| Part | State |
|---|---|
| Model | the "adult male figure" Tripo download (zip in Downloads), 1.80 m with cap and boots |
| Skeleton | **his original** (Tripo's mixamorig rig). Only change: the head-top end bone shortened to a nub inside his head (it stuck 27 cm out). |
| Weights | his original, plus: the shoulder line and solid upper arm (the user's drawn lines), forearm cleanup, beard/face 100% head, neck paint up to the beard. **Legs and hips: original.** (`male1_tripo.glb` = weights step 21) |
| Clips | `tools/anim/male1_build.py` (same retarget as Yola, but his **collarbones move from his own rest**: `retarget(..., rest_relative=CLAV)`) → head-angle fix (`tools/anim/male1_posture.py`, the X Bot neck tip, 16.9°). **No hand match** any more. |
| Files the Rig Lab loads | `assets/male1.glb` (mesh + 50 clips), `assets/male1_ual.glb` (39 add-on clips) |
| Weapon fits | **none yet.** The user sets them in the Rig Lab: pistol fit key `male1`, arm adjustments `male1:<clip>`, "This clip only" by default. The Save button writes to shots/; copy the results into assets/hold when the user asks. |

## Files
- `assets/source/male1/male1_tripo_original.glb`: the download as converted, untouched.
- `assets/source/male1/male1_tripo.glb`: the current source (step 21 weights + head nub). The build reads this.
- `assets/source/male1/male1_weights_*.blend`: one Blender file per weight/skeleton step.
  - 0 is the original. **21 is in his files.**
  - Tests, not in his files, each with a skin-only test GLB `assets/test_clips/male1_skin_stepNN.glb` listed in `assets/test_clips/tests.json`:
    - 22: softer elbow (the user: "looks ok", "elbows are fine");
    - 23: neck-to-shoulder ridge on the chest bone, like Brian;
    - 24: 23 plus upper arm on the shoulder cap;
    - 25: Brian's torso and shoulder weights copied onto Marc.
  - Steps 23–25 hardly changed the look.
- `assets/source/male1/male1_work*.blend`: the build (`male1_work`) and the build + head fix (`_posture`, what his files hold now). `male1_work.blend.json` lists the clips.
- Backups:
  - `before_clav_2026-10-20/`: before the collarbone fix.
  - `before_nomatch_2026-10-20/`: with the hand match.
  - `male1_before_weights.glb`, `male1_before_match.glb`, `male1_headfix.glb`.
- Unity Hub test: `C:\Users\marc7\AnimationHub\Export\unity_*.glb`; scripts in `AnimationHub\_marc\`.
- Clothed references: Brian `assets/source/refs/brian/Brian_tpose.fbx` (local only); Quaternius `assets/source/ual/Clothed_Male_*.glb`.
- Pictures: `shots/weights/`, `shots/inspect/`, `shots/match/`, and `shots/marc_*.png`.

## Rebuild him
1. Edit weights/bones in Blender, export `assets/source/male1/male1_tripo.glb` (skeleton + mesh, no animation).
2. `blender -b --factory-startup --python tools/anim/male1_build.py -- assets` (~6 min; `MALE1_CLAV=0` = the old collarbone copy)
3. `blender -b --factory-startup --python tools/anim/male1_posture.py -- assets` (head fix + exports male1.glb / male1_ual.glb)
4. **Don't run** `tools/anim/male1_match.py` any more. It pulled his gun hand onto the dummy's spot and locked his right arm straight on the pistol idle (164° at the elbow, against X Bot's 151°).
5. Reload the Rig Lab (the browser caches GLBs: hard-reload).
- Weight test without a rebuild: export mesh + skeleton only to `assets/test_clips/`, list it in `tests.json`, pick it as the 2nd figure.

## What we learned (so we don't redo it)
- **Balance check** (`tools/anim/balance_check.py`): he stands as balanced as Yola in every clip (within ~1% of height).
- **Moving his joints made it worse:**
  - Hips moved down: the waist pinched (rejected).
  - Spine moved: he hung 7 cm in front of his feet.
- **Collarbones (the user's chest "V", 2026-10-20):**
  - The retarget copied the dummy's collarbone angle, but the dummies' collarbones slope back far more than his. At rest: mannequin 38°, X Bot 12°, Marc 3°.
  - That pulled his shoulders back about 6.5 cm in the Quaternius idle and pinched his shoulder blades.
  - Fix: copy only the dummy's turn from its own rest (`rest_relative`).
- **Hand match (male1_match.py): removed 2026-10-20.** Matching his hands to the dummy's put the gun hand past his reach, because his shoulders sit differently. His gun arm locked straight and "folded in". The plain retarget already bends like X Bot.
- **Clothed references (2026-10-20):**
  - Brian's upper back follows his chest bone, while Tripo's original Marc follows his collarbones.
  - Copying Brian's pattern (steps 23–25) hardly changed the look.
  - The sloped shoulder line in the pistol idle comes from Marc's A-pose sculpt (Brian is modelled in a T-pose), not from the bones or weights.
- **The Rig Lab's pistol "Attack"** keeps firing its shot kick while paused. That's the shake, not his rig.
- Our retarget is faithful. Unity's Humanoid retarget was worse.

## Movement (2026-10-20, in progress)
- The user asked to see every walk / run / turn option on Marc ("basic running, turning, walking, smoothing between them").
  The Rig Lab's Body check list now opens with five "Moving: ..." groups, 56 clips in all:
  - the game's Mixamo gait set today;
  - Quaternius 8-way walks and 8-way jogs (with leans);
  - sprint enter / loop / exit, Turn90 L/R and Turn180 L/R;
  - crouch walks.
  - The groups are `MOVE_GROUPS` in src/viewer.js. **Uncommitted** at the time of writing.
- How the game moves the heroes today (render/clipchars.js locoWeights):
  - Mixamo walk + run per direction (forward, back, left, right), blended by speed and direction, all on one shared stride phase.
  - Weight changes are rate-limited (a full swap takes at least 0.12 s), and the back clips switch in with hysteresis.
  - Facing turns in code (core/player.js, turnRate 16 rad/s), with **no turn animation**.
  - Starts and stops are only the blend to and from the idle.
  - The Quaternius walk / jog / sprint / turns are unused by the heroes.
- Next: the user picks the clips that look best on Marc, then a plan to wire them in (ask before building).

## If we come back
- Mixamo auto-rig of his own mesh (the user uploads), to compare against a native Mixamo skeleton.
- A corrective shoulder shape for raised arms, if the sloped shoulder still bothers the user.
- Clothing-only paint on the open flannel flaps.
- Before he goes in the game: his weapon fits, and the game hook (like `?yola=2`). Ask the user first.
