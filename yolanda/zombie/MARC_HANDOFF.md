# Marc (the male hero) — where everything is

Saved 2026-10-19 at the user's word: **"keep him as he is now."** Nothing about Marc is committed and nothing is
in the game. He lives only in the Rig Lab.

## Look at him
- Rig Lab: http://localhost:5181/zombie/viewer.html?char=male1 (preview server "yolanda-anim"), or pick **Marc** in
  the character buttons. The **Show** button reads "Marc" when he's loaded.
- He plays every clip Yola 2 has (50 game clips + 39 add-ons), beside the clip's own dummy (X Bot or the mannequin).

## What he is now (the kept version)
| Part | State |
|---|---|
| Model | the "adult male figure" Tripo download (zip in Downloads), 1.80 m with cap and boots |
| Skeleton | **his original** (Tripo's mixamorig rig). Only change: the head-top end bone shortened to a nub inside his head (it stuck 27 cm out). |
| Weights | his original, plus: the shoulder line and solid upper arm (your drawn lines), forearm cleanup, beard/face 100% head, neck paint up to the beard. **Legs and hips: original.** |
| Clips | built by `tools/anim/male1_build.py` (same retarget as Yola) → head-angle fix (`tools/anim/male1_posture.py`, the X Bot neck tip, 16.9°) → hands matched onto the dummy's on pistol_idle, sg_reload and ual_Sword_Heavy_Combo (`tools/anim/male1_match.py`; changed very little). |
| Files the Rig Lab loads | `assets/male1.glb` (mesh + 50 clips), `assets/male1_ual.glb` (39 add-on clips) |

## Files
- `assets/source/male1/male1_tripo_original.glb`: the download as converted, untouched.
- `assets/source/male1/male1_tripo.glb`: the current source (fixed weights + head nub). The build reads this.
- `assets/source/male1/male1_weights_*.blend`: one Blender file per weight/skeleton step, 0 (original) to 21. The kept
  weights are **21_fixes_original_skeleton** (same as 17_beard_only, with the original skeleton).
- `assets/source/male1/male1_work*.blend`: the build (`male1_work`), + head fix (`_posture`), + hand match (`_match`).
  `male1_work.blend.json` lists the clips.
- Backups of earlier builds: `assets/source/male1/male1_before_weights.glb` (his morning build, all original),
  `male1_before_match.glb`, `male1_headfix.glb`; test versions in `assets/test_clips/male1_*.glb`.
- Unity Hub test: `C:\Users\marc7\AnimationHub\Export\unity_*.glb` (+ `assets/test_clips/hub_unity_*.glb`); scripts in
  `AnimationHub\_marc\`. Marc and the two X Bot clips were added to the Hub's `library.json`.
- Pictures: `shots/weights/` (weight work), `shots/weights_marc_vs_yola/` (all bones vs Yola, skeleton, motion),
  `shots/inspect/` (balance report + overlays, the Unity test), `shots/match/` (the skeleton-on-skeleton test).

## Rebuild him
1. Edit weights/bones in Blender, export `assets/source/male1/male1_tripo.glb` (skeleton + mesh, no animation).
2. `blender -b --factory-startup --python tools/anim/male1_build.py -- assets` (~6 min)
3. `blender -b --factory-startup --python tools/anim/male1_posture.py -- assets` (head fix; `MALE1_ARCH=-6` would
   straighten the lower back 6°, NEGATIVE = straighter; not used now)
4. optional: `blender -b --factory-startup --python tools/anim/male1_match.py -- assets shots/match` (reads
   `male1_work_posture.blend`)
5. Reload the Rig Lab (the browser caches GLBs: hard-reload).

## What we learned (so we don't redo it)
- **Balance check** (`tools/anim/balance_check.py`): his original stands as balanced as Yola in every clip (within
  ~1% of height). His size and proportions are **not** the problem.
- **Moving his joints made it worse.** Hip joints down 10 cm: the waist pinched in splits (rejected). Spine joints moved
  to Yola's / the mannequin's spots: he hung 7 cm in front of his feet ("going to fall over"). All reverted.
- **Weights:** our hand-cut arm paint covers less than Yola's (1.2% vs 3.3% of the body); Yola's paint copied onto him
  changed little in motion. A tighter armpit tore the sleeve. Neck/beard and the shoulder line are good and kept.
- **Our retarget is faithful:** every spine bone matches the dummy to the degree. Unity's Humanoid retarget was worse
  (gun arms dropped, idle leaned back). Laying the dummy over him: hands only 4-6 cm apart; matching them barely changed
  the look.
- So what still looks off is how these dummy poses read on his body (long torso, open flannel), not the rig.
- The shotgun's back arch is in X Bot's own clip.

## If we come back
- Other source clips for the moves that look worst (e.g. Quaternius Pistol_Idle_Loop instead of X Bot's).
- Mixamo auto-rig (the user uploads his mesh) to compare against a native Mixamo skeleton.
- Clothing-only paint on the open flannel flaps.
- Before he goes in the game: his own weapon fits in the Rig Lab, and the game hook (like `?yola=2`). Ask the user first.

## Uncommitted code (mine)
`src/viewer.js` (+ `dist/viewer.js`): CHARS.male1 entry (label "Marc (male hero)", `hero: true`), editStart keeps a
hero, the Show button names the character. New tools: `tools/anim/male1_build.py`, `male1_posture.py`,
`male1_match.py`, `balance_check.py`, `rig_compare.py`. Other chats edit viewer.js/clipchars.js in this checkout:
stage only these hunks if committing.
