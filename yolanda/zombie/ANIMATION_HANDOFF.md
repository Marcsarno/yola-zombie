# Animation handoff: state of Yola's animation, holds and checks (2026-10-17)

For the new chat that builds an animation builder / editor in Unity: animations authored and blended in Unity, baked,
exported, and played in the three.js game. Read this first, then `GRIPS_HANDOFF.md` (the long history),
`WEAPON_HOLD_PROCESS.md`, `UAL_PACKS.md`, `ARM_TOOL_PLAN.md` and `ARM_CLIP_REVIEW.md` when you need the detail.

---

## 1. Ground rules (the user's, standing)
- **Shared checkout.** Other chats share this folder and branch (`opening-reveal`): the opening/maps chat
  (OPENING_MAPS_HANDOFF.md) and a sound chat (SOUND_PLAN.md).
  - Stage files by name, never `git add -A` or `commit -a`.
  - Leave `src/opening/*`, `opening.html`, `core/floor3.js`, `core/layout.js`, `core/level.js`, `render/arena.js`,
    `render/screens.js` and `render/looks.js` alone. `src/main.js` is shared: small edits only.
- **Builds.** Commit `dist/*` only through `sh tools/clean_dist.sh`, after the sources are committed.
- **No push or deploy without the user's OK.** A Kevin Iglesias file in git history must be scrubbed, with the user's
  OK, before any push.
- **Licences.**
  - Kevin Iglesias clips may never ship: `assets/moves` stays local and out of deploys.
  - Quaternius UAL 1 and 2 and KayKit are CC0.
  - Mixamo clips are fine in the game.
- **Never decimate Yola's mesh.**
- **Never enter passwords.** The user signs in to services; confirm a spending cap before anything chargeable.
- **The dev server.** `node yolanda/tools/serve.mjs 5173` (launch name "yolanda") is shared: never stop it.
- **Judge by eye, against a reference.** Judge motion beside the reference rig (Mixamo X Bot or the Quaternius
  mannequin), not by numbers alone; never bend a clip toward a self-measured number. Send the user pictures as you go.
- **One viewer.** The Rig Lab (`viewer.html`, `src/viewer.js`). Add features there instead of building new test pages.

## 2. The character and her rig
- **Yola 2** (the game's Yola): `assets/yola2.glb`, a Tripo-made model, one skinned mesh (35,358 vertices), Tripo's
  auto-rig.
  - **Bones:** Mixamo names (`mixamorigHips`, `mixamorigRightHand`, ... with full fingers). Code strips the prefix:
    `bones.RightHand`.
  - **Rest pose:** an A-pose.
  - **Scale:** the file is 1 unit tall; the game and the Rig Lab scale her to 1.62 m (bone world scale 1.62).
  - **Skin weights are soft and messy:** her torso is spread over many bones, so "the bone a vertex mostly follows"
    is unreliable. Use the geometry (the nearest bone segment in the rest pose) instead.
- **The first Yola** (`assets/yola.glb`) still loads, as a reference only.
- **The clips** live in several files:
  - `assets/yola2.glb`: her own clips.
  - `assets/yola2_ual.glb`: add-on clips, skeleton only (UAL, KayKit and one Mixamo clip).
  - `assets/moves/yola2_moves.glb`: the arena's library picks, local only because of the Kevin Iglesias clips.
  - `assets/zombie_moves/*.glb`: the zombies' add-ons.
- **How clips are made:** Blender, headless.
  - `tools/anim/yola2_build.py` retargets every clip from its ORIGINAL source rig (Mixamo X Bot FBX, UAL mannequin,
    KayKit, Kevin Iglesias) with `blender/retarget.py`, which applies each bone's world-space change from rest and
    scales hip travel by leg height.
  - `tools/anim/test_export_clips.py` exports skeleton-only GLBs; `tools/anim/test_zombie_clips.py` does the zombies.
  - Blender 5.2 is at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
- **Hit timing depends on the clips.** The game's hit paths (grips, limbs, hips per frame) are measured from the clips
  (`assets/clipdata_yola2.json`), so a changed clip means re-measuring them.

## 3. How the game plays animation now (three.js, `src/render/clipchars.js` YolaView, ~1,800 lines)
- **One AnimationMixer.** Every bone is put back to rest before each update (`restQ`), so no stale values carry over.
- **Upper and lower body are separate layers** (the `LOWER` regex: Hips, legs, feet). The legs play the gait (run,
  walk, strafe blends); the upper body plays the weapon's hold layer (pistol, shotgun, axe, fists, sword, carry),
  cross-faded on weapon swaps.
- **Attacks** are clips (or slices of clips) played over the hold:
  - the bat's combo strike by strike, with Quaternius' recovery clips (`recCur`);
  - library attacks built frame by frame from a clip with the weapon in her hand (`src/render/libattack.js`);
  - dodge and vault as overlay clips (`OVERLAY_CLIPS`).
- **Done in code on top of the clips, every frame:**
  - the posture fix (`render/posture.js`);
  - hand poses (`assets/hold/hand_poses.json`, `yola_hands.json`) and closed fists;
  - the weapon placed in her fist (`render/holdfit.js` placeOneHanded plus the user's fit, `assets/hold/weapon_fit.json`);
  - the second hand put on a two-handed weapon's second grip (`handOnto`, using `render/armfit.js`);
  - the carry idles for the sledgehammer and chainsaw (`holdfit.js` CARRY);
  - the bat on her back, drawn with Sword_Enter;
  - foot planting (two-bone leg IK);
  - the gun arm aiming;
  - the ragdoll on death.
- **The Rig Lab** (`viewer.html`) plays any clip beside the reference rig, with the same hold code as the game:
  weapon fit sliders, skeleton and hand overlays, contact sheets (`__lab.sheet`), and exports for the Blender hold
  check (`__lab.exportHolds`).

## 4. What works (checked)
- **Holds and fits.** The pistol, shotgun, bat, axe and knife holds, with the user's fits from the Rig Lab. The game
  and the Rig Lab share the hold code, so they match.
- **Moves:**
  - the bat combo with recoveries;
  - the bat on her back;
  - dodge (only during a dodgeable threat);
  - head-on vault;
  - leg strikes and leg shots (the zombie crawls);
  - the floor smash;
  - the zombies' walk styles, flinches and pounce;
  - the guard's and lady's gore stages.
- **Anatomical arm limits** (`render/armfit.js`), for a hand put on a handle:
  - **ranges:** wrist flexion 75°, extension 65°, toward the thumb 20°, toward the pinky 30°; forearm 85° palm-up and
    80° palm-down from thumb-up, measured about the elbow's hinge; the elbow is a one-way hinge to 150°;
  - **the solver** picks how the hand turns around the handle and where the elbow swings;
  - **a hard stop** turns any wrist past its range back to the edge.
  - Lesson: measure the wrist in the FOREARM's frame. Measured along the bent hand's own axes, a 77° sideways bend
    read as 6°, and two broken wrists got through.
- **Carries.** The chainsaw is carried at her waist, both wrists in range (right 50%, left 20%), with the left hand
  on the front hoop's left post. The sledgehammer is carried at port arms. The user approved the new second-hand
  placement.
- **The arm-through-body check** (`render/bodyclip.js`, `__lab.bodyClipScan`): rays through her rest-pose skin. It
  found 49 cases, listed in `ARM_CLIP_REVIEW.md` with sheets `shots/armclip_review_*.png`.

## 5. What doesn't work yet (open)
1. **The second hand's reach drags the arm through her chest.** Her left arm goes about 11 cm into her chest on the
   sledgehammer's attack (`ual_Sword_Heavy_Combo`, 115 of 131 frames) and the chainsaw's attacks; the axe's
   bat_swing and t_chop are similar. The arm solver has anatomy limits but no body collision.
2. **The sledgehammer has no two-handed attack.** Its attack is a one-handed sword combo, so the free hand has to be
   pulled onto the handle (problem 1). It needs a real two-handed attack clip; the user said not to invent custom
   attacks.
3. **Source clips bend wrists past real range.** The UAL sword combos reach about 66° toward the pinky, 2.2 times the
   range, and so does the mannequin's own clip. The user chose between clamping every clip and only weapon clips:
   undecided.
4. **A one-frame snap** in UAL Sword_Heavy_Combo, frames 12→13: a ~70° turn in 1/30 s, in the source too.
5. **Clips with arms inside her body:** 41 of the game's own clips, without weapons (hands into thighs in the
   deaths, rolls, hits and greetings; the gun arm into her belly in the pistol walks). See ARM_CLIP_REVIEW.md;
   awaiting the user's review.
6. **Idle holds for the bat and axe:** the user hasn't picked (sheets `shots/holds_{bat,axe,chainsaw}.png`, letters).
7. **The user's latest axe fit isn't in the game.** The 13:09 fit is in `shots/weapon_fit.json`, not
   `assets/hold/weapon_fit.json`: the Rig Lab's Save writes to shots/ and needs a copy, which is a known gap.
8. **Not built:**
   - the arm tool (ARM_TOOL_PLAN.md: arm fit sliders, drag handles with joint locks, the motion and jump check,
     a cleaner Rig Lab);
   - the guard's jump-slam time-warp (slow at the peak, faster and faster into the slam);
   - wound caps for runtime gore cuts.

## 6. Traps already hit (save yourself the time)
- **"Attached" bind mode:** three.js keeps `bindMatrixInverse = inverse(meshWorld)` now, not at bind time. To carry a
  posed point back to rest: `rest = boneRest · inverse(boneNow) · inverse(bindMatrixInverse) · inverse(meshWorld) ·
  world`.
- **Units:** bone-local frames are in model units, not metres: her bones carry the 1.62 scale.
- **Retarget axes:** retarget by world-space change from rest per bone. A wrong axis convention shows up as twisted
  forearms and hands.
- **Dropped keys:** a mixer only writes the tracks it has; reset to rest every frame, or stale rotations leak in.
- **Slerp into its own input:** `slerpQuaternions` writes into its target first; clone the input.
- **Arm IK:** `render/ik.js` bends in the clip's own plane and can flip. armfit.js replaces it for hands on handles.
- **The armpit:** the armpit and the sleeve's underside always overlap her side. Leave them out of any "inside her
  body" test.

## 7. Opinion on the Unity plan
**Worth doing, as an authoring and baking tool, not as the runtime.** What Unity brings that we lack:
- **Humanoid avatars with muscle limits.** Every joint (wrist up-down, wrist in-out, forearm twist, shoulder) has an
  anatomical range in the avatar. That is exactly the wrist and elbow problem we've been fighting by hand, solved in
  the engine.
- **Humanoid retargeting.** Mixamo, UAL, KayKit and Kevin Iglesias clips map onto one avatar without our custom
  retarget script.
- **Live, layered editing:** the Animation Rigging package (two-bone IK, aim, multi-parent constraints) and Timeline.
  Pose a hand on a weapon, layer a fix over a clip, blend two clips, and see it play immediately.
- **Baking:** the Recorder or GameObjectRecorder turns any blended, layered, IK-driven result into a plain keyframed
  clip.

**What doesn't come across, and needs a plan:**
1. **Only baked clips export.** Blend trees, state machines, IK constraints and muscle limits stay in Unity; three.js
   gets keyframes.
   - So the editor's job is: author or blend in Unity, bake to a Generic clip on Yola's exact skeleton, export.
   - The game keeps its own runtime crossfades and layers; those are simple.
2. **Same skeleton, same rest pose.** Export onto the identical bone names and A-pose rest of `yola2.glb`.
   - A Humanoid clip must be baked back to the Generic rig before export; Humanoid clips are muscle curves, not bones.
   - Keep 30 fps, keyframe reduction off (or tight), and 1 unit = 1 m; the game scales her.
3. **Export path.** Options:
   - Unity FBX Exporter, then Blender (our scripts), then GLB. Proven tools on our side.
   - A Unity glTF exporter (UnityGLTF, or glTFast's export) straight to GLB. Fewer steps; test it first with one clip,
     comparing bone by bone in the Rig Lab.
4. **The weapon holds are runtime today**, from the user's fits plus the second-hand solver. Two choices:
   - **(a) Bake the weapon in.** Animate a weapon bone or socket in Unity per clip, both hands on it, checked there.
     Then three.js just parents the weapon to that bone and the hold code mostly goes away. This is the biggest win
     and also fixes problems 1 and 2 in section 5.
   - **(b) Keep the runtime holds** and bake only the body.
   - I'd go with (a) for melee weapons and keep the runtime aim for guns.
5. **Hit paths:** re-measure `assets/clipdata_yola2.json` from the exported clips. Better: export the weapon socket's
   path, so the hits follow exactly what you see.
6. **Licences don't change in Unity:** Kevin Iglesias clips may be edited locally but never shipped.

**The alternative to weigh: Blender as the editor.** It's already in our pipeline, exports glTF natively, and has
bone constraints with rotation limits, NLA blending and IK. It has no Humanoid muscle system and no game-style
preview, so Unity is the better editor for blending and for fixing hands and arms by eye. Blender stays the better
last step (export, retarget fixes, our existing scripts).

**Suggested first milestone for the Unity chat:**
1. Import `yola2.glb` (via FBX) as a Humanoid with the muscle limits on.
2. Retarget one UAL clip and one Mixamo clip; bake to Generic; export one clip (body plus a weapon socket for the
   sledgehammer).
3. Load it in the Rig Lab beside the reference and compare it bone by bone with today's version.

If that round-trip holds, the rest is content work.
