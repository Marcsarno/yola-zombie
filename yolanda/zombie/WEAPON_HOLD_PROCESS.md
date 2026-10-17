# Weapon hold process (any held weapon: bat first, then axe, pistol, shotgun, new weapons)

Goal: Yola holds every weapon like a person does.
- Fists closed on the handle.
- Wrists and elbows within human limits.
- The weapon and her arms never pass through her body.
- It reads as real at normal speed, from the gameplay camera and close up.

This file is the procedure. Each weapon fills in a data sheet (section 2) and goes through every step and gate below.

Written 2026-10-15, after the tracked-skeleton bat clip failed review: the arms were contorted, the torso faced the camera
instead of the target, and the wrists bent unnaturally. Root causes:
1. **The motion source:** a single side-view video can't show which way the torso faces, or the arm rotations.
2. **IK with no joint limits:** it forced the hands onto the bat any way it could.
3. **Reviewing from thumbnails and numbers** instead of full-size close-ups and motion at normal speed.

## 1. Rules (and where each comes from)

1. **Solve the hold, never tune it by eye.**
   - The weapon's handle passes through the centre of the closed fist, computed in the hand's own space.
   - Stick Fight (Claude-built Three.js game, commit 0d9144f): eyeballed offsets left the shaft 31 mm off the fist centre;
     the solve got 0.5 mm idle and 0.7 mm mid-swing.
2. **One direction of dependency, in this order:**
   1. Body animation.
   2. Small body corrections (aim, turn, foot lock).
   3. The weapon, placed from the primary hand.
   4. The support hand, fitted to the weapon.
   5. Fingers.

   The weapon never follows the support hand: no loops. This is the Watch_Dogs layering (GDC 2015, Therriault): recoil and
   aim layers first, then both hands fitted to the weapon's new position.
3. **IK adjusts a good pose. It never invents one.**
   - Chains keep the source pose's bend plane.
   - The elbow direction comes from a hint (Unity Two Bone IK: target, hint, separate position and rotation weights).
   - Reach is softened near full extension, so the arm never snaps straight (Holden, IK and foot locking: maxExtension from
     the input pose, exponential softening).
   - Every joint the IK moves has human limits (section 4). A pose that needs more than the limits is a FAILED pose:
     fix the animation, don't bend the joint.
4. **The motion must already be human.**
   - Sources: real motion capture (Mixamo clips retargeted with rest-pose compensation, as in three-vrm's
     loadMixamoAnimation and our blender/retarget.py), or poses authored in Blender on Yola's own skeleton.
   - Reference videos give the order, timing, rhythm and key moments only. Never joint angles from a tracker.
5. **Check numerically, then visually, then in motion.**
   - Numbers: every frame of every clip, and the blends between clips.
   - Pictures: frozen frames from 8 angles around the hands (Stick Fight's grip inspector), plus front, side and the gameplay
     camera, at full size.
   - Motion: a recording watched at normal speed (1x) before any slow-motion review.
6. **Fix at the source; runtime is a safety net.**
   - Holds are baked in Blender, where they can be seen and edited.
   - The game's runtime IK only absorbs small differences (blends, aim, the shortened step-in). Each correction is bounded
     and logged by the checker.

## 2. Per-weapon data sheet (one per weapon, in code: `src/core/weapons.js` HOLDS, mirrored in the GLB)

Every weapon model carries named points, the same convention as the weapon packs' `GameGrip_R`/`GameGrip_L`:

| Name | What it is |
|---|---|
| `Grip_Primary` | Where the primary hand's fist centre sits. The weapon's origin. |
| `Grip_Support` | Where the support hand's fist centre sits. None for one-handed weapons. |
| `Shaft` axis | The handle's axis through both grips. Local +Z, pointing toward the business end. |
| `Tip` / `Muzzle` / `Blade` | The working end: for hits, effects and aim. |
| `Knob` / `Butt` | The end behind the hands. |

The data sheet also records:
- **Grip radius:** the handle radius at each grip. It sets how far the fingers close: bat ~15 mm, axe ~16 mm, pistol grip ~14×22 mm.
- **Hands:** which is primary (right by default). For clips that need it (e.g. the left-handed home run), the hands swap.
- **Grip pose:** the finger pose name per hand, e.g. `power_r15`. Each grip pose is authored once per radius in Blender
  and shared by all weapons of that radius.
- **Release windows:** per clip, the frame ranges where the support hand intentionally lets go (a one-handed follow-through,
  a reload). The support constraint fades out over 4 frames and back in over 4.
- **Collision capsules** (section 5): the weapon as 1–3 capsules (start, end, radius), e.g. a bat = handle capsule + barrel capsule.
- **Hit geometry** (already in weapons.js): length, the part that hits, radius.

## 3. Per-character hand calibration (once per character, reused by every weapon)

Computed in Blender from her real hand, stored in `assets/clipdata.json` under `hands`:
- **Fist centre** of each hand, in that hand bone's local space.
  - Close the fingers into the grip pose. The fist centre is the centre of the circle fitted through the middle-finger
    joints (proximal, middle, distal), averaged with the index and ring fingers.
  - Not the wrist, and not "halfway to the knuckle" (Stick Fight's second lesson: "the wrist is not the fist centre").
- **Grip axis** of each hand, in hand-local space: the line through the index → pinky knuckles when closed. The shaft
  lies along it, offset by the grip radius toward the palm.
- **Knuckle direction:** which way the back of the hand faces, to orient the support hand on the handle.
- **Joint limits** (section 4), and the elbow hinge axis from the rest pose.
- **Body collision capsules** (section 5), sized from her skinned mesh.

## 4. Human joint limits (Yola; adjust per character)

| Joint | Limit |
|---|---|
| Wrist, bending palm-down / back | ≤ 70° / ≤ 60° |
| Wrist, side to side (thumb side / little-finger side) | ≤ 20° / ≤ 30° |
| Forearm twist (palm up / palm down) | ≤ 85° each way. Twist belongs here, never in the wrist |
| Elbow | Hinge only, 0–145° bend, no bending backwards. Side bend ≤ 5° |
| Shoulder | Arm raise ≤ 170°. Reach across the chest stops at the far shoulder line. Twist ≤ ±90° |
| Clavicle | ≤ 15° forward, ≤ 20° up. Used only to extend reach |

How they're enforced:
- **In Blender:**
  - Limit Rotation constraints on the arm bones while holds are built.
  - The wrist is split swing/twist: twist moves into the forearm, swing is clamped.
  - The IK uses a pole target (the elbow hint).
- **In the game:** the same limits, in a shared joint-limit module used after any arm IK.
- **The checker:** flags every frame that hits a limit, with the joint and the amount.

## 5. Never through the body: collision checking

**Proxies (not physics):**
- **Yola's capsules:**
  - Pelvis.
  - Abdomen.
  - Chest.
  - Head (sphere).
  - Neck.
  - Upper arms.
  - Forearms.
  - Hands (small boxes).
  - Thighs.
  - Shins.
- **How they're sized:** each fitted to her skinned mesh vertices weighted to that bone, using the bone's own vertices,
  measured once in Blender.
- **The weapon:** its capsules come from the data sheet.

**The checker** (`tools/holdcheck`, runs in Blender headless and in the Rig Lab) tests, for every frame and for blends
sampled at 120 Hz:
- **Weapon vs body:** weapon capsules against every body capsule, except the gripping hands. Then, where capsules come
  close, against her actual skinned vertices.
- **Arms vs body:**
  - Forearm against the chest.
  - Hand against the opposite forearm.
  - Upper arm against the head.
  - The neighbouring segment is ignored.
- **Reported:** penetration depth and the frame.

**Fixing a failure:**
- **First, the pose in Blender:** move the hands, rotate the chest, change the elbow hint.
- **At runtime, a bounded safety net:** if the weapon would enter the chest or abdomen capsule, rotate it about the primary
  fist away from the body (at most 10°), then refit the support hand. Every use is counted by the checker: a weapon that
  needs it often goes back to step 4.

## 6. Pipeline for a weapon's clips

0. **Sync every reference angle.**
   - When a move was filmed from several angles (the bat combo: ScreenRecording …_1, _11, _12, _13), line them all up on one
     shared event: the contact frame, or the first foot plant.
   - Watch them side by side at the same time, next to Yola's skeleton rendered from matching cameras.
   - One angle can't show which way the torso faces, or the arm rotations. Two synced angles can, and with two views the
     joints can be triangulated instead of guessed.
   - Reference footage sets order, timing and key moments, and, through the rigid weapon track and the hands (0b), the
     weapon's path and the grip. Joint angles still never come from a single-view body tracker.
0b. **Track the weapon as one rigid object, from every synced angle** (the user's rule: "the bat will never jitter").
   - **It's a straight object of known length moving smoothly.** Any visible piece of it (the tip, the knob, a stretch of the
     shaft) pins down the rest: mark the tip and the knob in each view and follow them through time.
   - **Motion blur:** a blurred streak is the swept path, and its ends are the endpoints.
   - **Hidden or blurred frames are filled from smooth motion,** never from guessed direction keys.
   - **Two synced angles give 3D:** each view's 2D tip and knob, with the known length and straightness, fixes the weapon
     in space. No jitter is allowed: the solved path must be smooth in position and rotation.
   - **The hands are followed too, not just the arms:**
     - Where each hand sits along the handle, frame by frame.
     - When a hand lets go or regrips (the fingers).
     - How the wrists turn, which comes from the weapon's direction plus the forearm.
   - **Read the move for what it is.** In the bat combo, Yola frames 71–85 are a **butt strike**: the bat is pulled across
     and driven knob-first into the target, both hands on the handle. Not a backhand swing. Follow the reference's actual
     action instead of forcing it into a familiar one.
1. **Pick the motion.** List the candidate mocap clips (`assets/mixamo/*.fbx`, plus new Mixamo downloads; the user signs in).
   For the bat, we already have:
   - Swings: `yola_baseball_single`, `yola_baseball_double`, `yola_baseball_homerun`, `yola_bat_swing`, `yola_heavy_swing`,
     `yola_melee_horizontal`.
   - Idle: `yola_bat_idle`.

   Watch each at 1x in the Rig Lab next to the reference video. Write down which clip covers which beat of the reference
   (wind-up, strike, follow-through, recovery, hand-over to the next strike).
2. **Retarget** with rest-pose compensation (blender/retarget.py), then verify against the Mixamo reference skeleton in the
   Rig Lab (ghost overlay). The pose must match before anything else is touched.
3. **Assemble in Blender (NLA):**
   - Trim and retime each strike to the reference's rhythm.
   - Author the hand-over poses between strikes (pose-to-pose, matching momentum: the end of one strike sets up the next).
   - Mirror only where the reference really changes hands.
   - The combo stays one action, cut into strikes in weapons.js, as now.
4. **Build the hold in Blender** (the hold rig; not baked yet):
   - **The weapon:** an object with its grip empties. A Child Of constraint ties `Grip_Primary` to the primary hand's
     fist centre, aligned to the grip axis.
   - **The support arm:** IK to `Grip_Support`, elbow hint from the source animation's elbow, Limit Rotation on wrist,
     forearm and elbow.
   - **Fingers:** set to the grip pose.
   - **Release windows:** keyed.
5. **Bake.** Bake Action with Visual Keying, then clear the constraints, so the export holds exactly what was seen.
   - The weapon's per-frame transform is written to clipdata as now (bat path), so the game places it identically.
6. **Run the checker** (sections 4–5 and the grip distances below). Fix and re-bake until it's clean.
7. **Export:** a skeleton-only GLB at 60 fps (export_combo.py), plus clipdata. Then the game: weapons.js strike frames and
   hit windows, measured from the baked weapon path.
8. **Check in the game:** grip numbers from tools/labgame.js; foot lock; the simulated weapon against the rendered weapon in
   the damage windows; 30/60/120 fps; tests in tools/tests (hit grid, held combo, crowd, glide).

## 7. Pass marks (every frame unless stated)

| Check | Pass |
|---|---|
| Primary fist centre to the shaft axis | ≤ 3 mm |
| Support fist centre to the shaft axis, while gripping | ≤ 8 mm |
| Hand grip axis vs shaft | ≤ 10° |
| Wrist, forearm, elbow, shoulder, clavicle | Within section 4. Zero frames at a limit for more than 2 frames in a row |
| Weapon vs body capsules and skinned mesh | No penetration |
| Arm vs body | No penetration (≤ 5 mm skin contact allowed: sleeves) |
| Runtime safety-net use | Under 5% of frames in the held-combo test |
| Simulated vs rendered weapon, inside damage windows | ≤ 3 cm |
| Planted feet (foot lock) | Median ≤ 1 cm/frame, max ≤ 2 cm/frame |

## 8. Review gate (before anything is called done)

1. The checker's report is clean (section 7), and it's attached.
2. A **grip sheet** at the key frames of each strike (wind-up, contact, follow-through, hand-over):
   - 8 angles around the hands, full size, close enough to see fingers and wrists.
   - Front, side and the gameplay camera at phone size.
3. A **1x recording** from the side and from the gameplay camera, watched in full at normal speed by me first. Then the
   side-by-side with the reference.
4. Only then is it sent to the user, saying plainly what was and wasn't checked. Desktop tests are never called phone tests.

## 9. Adding a new weapon (checklist)

1. **Model:** made in Blender, with the named points from section 2 at real-world scale. Check the grip radius against her fist.
2. **Data sheet** in weapons.js HOLDS: grips, radius, primary hand, capsules, hit geometry.
3. **Grip pose** for its radius: reuse one if it exists, otherwise author it once.
4. **Clips:** steps 6.1–6.8.
5. **Gates:** sections 7 and 8.

## 10. Order for the bat (the first weapon through this)

1. **Grip foundations:**
   - Hand calibration (fist centres, grip axes), joint limits, body capsules.
   - The checker, in Blender and the Rig Lab.
   - The 8-angle grip sheet.

   Prove all of it on `bat_idle` and one Mixamo swing before building any combo.
2. **The bat model:** rebuild it in Blender with the named points (it's procedural in weaponModels.js now).
3. **The combo** from the Mixamo swings, assembled to the reference's order and rhythm: forehand → backhand → finisher.
4. **The hold rig, bake, check, export.**
5. **The game:** weapons.js strike frames, hit windows; keep the foot lock and the runtime support-hand IK, now with joint
   limits.
6. **Review gate**, then the axe through the same steps.

## 11. Tools (tools/hold, Blender 5.2 headless; see each file's header)

- **`calibrate.py`** writes `assets/hold/yola_hands.json`:
  - Fist centres and grip axes, from circles fitted through the curled fingers.
  - Elbow hinge axes, from 11 clips.
  - Body capsules.
- **`holdcheck.py`** checks every frame of the given actions. It places the weapon by the grip solve and reports:
  - Grip: support fist distance to the shaft, along-shaft offset, axis angle.
  - Every arm angle against the limits.
  - Weapon and arm skin inside her body, tested on her skinned mesh.
- **`gripsheet.py`** renders the 8 views around the hands (anything nearer than 16 cm in front of the hands is clipped
  away), full front and side, skeleton views, and capsule cages.
- **`tools/labcheck.js` `gripSheet(dir, out, {perFrame: true})`** (Rig Lab console) lays them out one page per frame
  with the numbers.
- **Weapon data sheets:** `tools/hold/weapons_hold.json`.

## 12. Step 1 findings (2026-10-15, bat_idle + bat_swing, raw Mixamo motion)

- **The mocap fingers make real fists.** Curl is about 145°, and the joints fit a 2.3 cm circle (handle plus finger
  thickness), so fist centres can be calibrated from them.
- **The bottom (left) hand closes on the handle in every frame.** The top (right) hand opens in bat_swing's follow-through
  (frame 36 on), like a real batter's top hand. For the bat the primary hand is the LEFT; the right hand has a release window.
- **The top hand's fist sits 4.6–6.8 cm off the bat** the bottom hand holds, turned about 16°: Mixamo doesn't model the bat.
- **Mixamo's wrists are not human.** The original X Bot skeleton's `baseball_single` already bends the right wrist sideways
  up to 65°, and the `bat_swing` source up to 96°. Yola's copies inherit this: 84 of 92 held frames are past the side-bend
  limit. So wrists must never be taken from the mocap. Step 4 places the bat along the mocap's bat path, then fits both hands
  to it with the limits applied (the wrist is set by the bat, and the arm adapts).
- **The bat goes through her head** in the stance (up to 7 cm, beside the ear). Yola's head and hair are far bigger than the
  mocap actor's, so the stance needs the hands moved back and out.
- **Arm skin inside her body** is flagged after contact (right forearm up to 4.6 cm). This is not yet visually confirmed:
  add penetration markers to the sheet.

## 13. Reference footage for the bat combo (2026-10-15)

| Clip | Frames | View |
|---|---|---|
| 13 | 1–~185 | Side, following the fighter (target on the left). The previous clip came from this section |
| 13 | ~190–318 | The same combo from behind and to the side (target on the right) |
| 12 | 1–~320 | The same as clip 13 |
| 12 | ~330–494 | A close view from behind |
| 1 and 11 | all | Three-quarter front views of the attacks |

Yola frame = clip 13 video frame − 19.

## 14. Status (2026-10-15, save point)

- **Bat 3D path:** solved from both reference angles for Yola frames 1–165 (forehand, butt strike, low swing). See
  tools/track/README.md. The finisher is still to track.
- **Hold toolkit:** tools/hold works and is proven on the raw Mixamo bat clips. The support-hand fit with limits
  (step 6.4) is next.
- **Next:** build Yola's combo with the 3D bat path as the primary, both hands fitted to it, the body from mocap or
  Blender poses matched to the solve's torso turn, then the checker and grip sheets, then the game.

## 15. Yola 3.0 hold check (2026-10-16, read-only, the user: "her rig is slightly different size")

- **Proportions** (both shown 1.62 m): Yola 3.0 is adult-proportioned, Yola 2.0 chibi. Yola 3.0 vs 2.0: arm reach to the
  grip 52.8 vs 44.1 cm (+20%), upper arm +26%, forearm +12%, hand-to-knuckle +26%, middle finger -10%, thigh +30%,
  shin +18%, shoulders -4%.
- **The game calibrates every socket on whatever skeleton it loads** (clipchars.js calibrate*Socket), so the weapons
  land in her hands on both: bat grip on the fist centre 0 mm (both), shotgun left hand on the pump 0.2 vs 0 cm,
  pistol left hand 5 vs 12 cm from the gun. Yola 3.0's right arm is nearly locked straight on the pistol (12 deg bend,
  99% reach; Yola 2.0 30 deg).
- **Close-ups (game renderer, 4 angles round the hands; shots/grip_*_y20_top_y30_bottom.png, hold_* for wide views):**
  the same on both Yolas. Shotgun is the best (right hand on the grip, left cups the pump). Pistol: left hand an open
  palm beside the gun. Axe: both hands flat open palms either side of the handle ("praying hands"), nothing closes.
  Bat (one-handed): fingers half open, the bat hangs under them. Reads fine from the gameplay camera.
- Not checked yet: attacks, reloads, running, the swaps between weapons.
- **Inspect mode** (combat.html?mode=calm&inspect=1&yola=2|1, src/inspect.js): the real game, Yola standing still with a
  free orbit camera; 1-5 weapons, H hands, B body, P cycles pistol models.
- **Pistol switched to the Hospital Weapons Core pistol** (the user's pick 2026-10-16: "I hate the one she has"):
  assets/weapons/pistol_core.glb (copy of the pack file), prepPistolCore (weaponModels.js: -90 deg about Y, origin
  GameGrip_R), loaded in main.js for both Yolas (makePistol only if the file fails), and in the Rig Lab. Its muzzle is
  4.3 cm higher and 4.4 cm further out than the old one's. The sim's muzzle point (core/weapons.js PISTOL_HOLD, measured
  on Yola 2.0) sits ~20 cm from Yola 3.0's rendered muzzle, mostly her longer arms, not the gun; only the invisible shot
  ray's start uses it (flash and tracer come from the real muzzle). Left as is. Not yet updated: moves.js /
  assets/moves/weapons.json pistol entries (the move library still shows the old one). Images: shots/pistol_*.png.
- Lesson kept from round 19: closing fingers was tried and rejected ("claws"); any finger work goes one weapon at a
  time against the source rig (X Bot / UAL mannequin) in motion.
- **Pistol at 80% size** (the user: "about 20% too large"): PISTOL_CORE_SCALE in weaponModels.js, in the game too.
- **Rig Lab, side by side with the reference rig:** finger bones on both rigs (coloured per finger), the held weapon in
  both rigs' hands, "Yola hands" / "Ref hands" camera buttons. Finding: on pistol_idle her finger curl matches X Bot's
  within a few degrees: the fists are fine, the gun's placement is the problem.
- **Pistol fit panel** (Rig Lab, "pistol grip in the fist"): the grip through the fist centre along the fist's grip line,
  then the user's per-character fit (size, moves in mm along the gun's axes, turns in degrees). Saved fits:
  assets/hold/pistol_fit.json (yola2 and xbot set by the user 2026-10-16). Rig Lab only so far: the game still places
  the pistol the old way (next: use the yola2 fit in clipchars.js placeWeapons).

## 16. Checking a contact: how not to, and how to (2026-10-17, the user's lesson)

**The miss:** in the Quaternius pistol reload I said her left hand "meets the gun like the mannequin's". It passed under
and beyond the grip while the mannequin's cups it (the user's screenshot, 3/4 from her left). I had measured one number,
the distance between the two hands (blind to which side), looked at small whole-body sheets from the front and her right
only, and used the pictures to agree with the number.

**How not to:** one distance as proof of a contact; averages; thumbnails; whole bodies with skeleton lines over the hands;
only angles where her body or the gun hides the support hand; "matches" without saying what was not checked.

**How to:**
1. Write down the reference contact first: what the hand touches, where, and its start / hold / end frames.
2. Measure in the gun hand's own frame (forward-back, up-down, side), 3 components in hand-lengths, every frame, against
   the reference; report the worst frames (flag > ~0.3 hand-lengths).
3. Full-size close-ups of the hands (Rig Lab Yola hands / Ref hands, same zoom, finger bones on) from 4+ angles: her
   left (the support-hand side), below, above, the user's usual 3/4; add any angle that shows what another hides.
   Frames: contact start, middle, end, and the worst one, worst first.
4. Look for the problem. Say exactly what was checked and what was not.

## 17. Rigging and retargeting: what works, what not to do (2026-10-16/17, learned with the user)

**The way to work**
1. One viewer: the Rig Lab (viewer.html), Yola beside the clip's own source rig (Mixamo X Bot or the Quaternius
   mannequin), skeleton and finger bones on. New review features go INTO the Rig Lab; no new viewers or test pages.
   The game is only for confirming the game matches the Rig Lab.
2. Watch the source first and trust your eyes over a clip's name: our "pistol reload" was cut from a walking long-gun
   reload (the user: "it's definitely a rifle reload"). The real one came from Quaternius UAL1 Pistol_Reload.
3. Line the reference up: clips cut from the middle of a source need their offset (REF_OFFSET, e.g. her old reload =
   X Bot frames 38-99); hips pinned to each rig's own rest, not frame 1 (a mid-walk cut stood a step forward).
4. Check contacts per section 16: describe the reference contact, measure in the contacted thing's frame (3 axes),
   worst frame first, close-ups from 4+ angles including her support side and below. Say what was not checked.
5. Test bakes before the game: bake into assets/test_clips (tools/anim/yola2_build.py with YOLA2_ONLY / test env
   switches, tools/anim/test_export_clips.py), view with viewer.html?char=yola2&extra=<glb> (named *_REBAKE_*), and
   only after the user approves swap the action into yola2_work.blend (back it up first), export, check by hash that
   only that clip changed, restore side files that changed by float noise only.
6. Never fix toward a self-measured number (round 19). Fix the cause, then show it against the reference.

**What the retarget does and where it goes wrong** (blender/retarget.py: each of her bones points along the source
bone's own axis)
- If a rig's bone axis is not its real limb line, the error lands on her: X Bot's Neck / Head axes sit 16.9 / 25.8 deg
  off his neck line -> her head ~26 deg back, chin up, in every Mixamo clip; her own Hips / Spine2 / Hands axes are
  4.1 / 1.6 / ~4 deg off -> pelvis tucked ~4 deg. Check axis-vs-line on BOTH rigs before trusting a retarget. (Rig Lab
  "posture fix (preview)" shows the cure; not baked yet.)
- Different proportions break hand placement: scaling the hands' goal by arm length put the gun past her reach (arms
  ~20% longer), so her gun arm locked straight across her chest (the user's "shoulder tucks in"). Do instead: the gun
  hand stays where her own arm puts it, the support hand comes to it (contacts 'gunhand'); for two-hand contacts like a
  reload, place the support hand where the source's is in the gun hand's own frame, scaled by hand size ('support').
- Fingers are the clip's own: Mixamo / Quaternius hands are relaxed or open. Nothing closes them on a weapon unless we
  do it (Rig Lab Hands controls: open / support / closed per hand, her fist from her bat_idle).
- Composite clips (legs of one clip, upper body of another) need the upper layer re-based onto the hips, or the torso
  hunches (the bat run). The regular full run with the arm / wrist partly held toward the stance looked best.

**Props on a rig**
- Use the prop's own markers (the magazines' pistol_seated_translation / HandAttach): they were made to fit.
- A hand holds small things between thumb and index finger, not at the palm centre (a palm-attached magazine floated
  10 cm ahead of her hand).

**Viewer / engine traps (cost hours)**
- three.js AnimationMixer only rewrites a bone whose animated value changed: anything you add on top on a held frame
  stacks. Record and undo (viewer.js postRot / undoPost).
- The X Bot FBX nests a same-named copy inside each bone: rotate the outer, animated one.
- The Quaternius rig is Z-up: never zero "z" on its hips.
- Hidden or background tabs pause requestAnimationFrame: step the game yourself and stop any page loop while capturing.
- Holding a character in place by putting her back each step needs fixed steps (uneven steps = fake 9.5 cm jitter).
- dt = 0 (a paused game) divided by 0 made the hair sway NaN forever: guard zero steps.
