# Weapons and grips: where we are (handoff, updated 2026-10-17)

Read this first when continuing the weapon/grip work. Then WEAPON_HOLD_PROCESS.md sections 16 (how to check a
contact) and 17 (rigging and retargeting: what works, what not to do). PONYTAIL_PLAN.md = Yola 3.0 rig work (done).

## START HERE (2026-10-17, before the chat was compacted)

**Done and in the game:** pistol reload = Quaternius Pistol_Reload with her support hand placed on the gun + the
user's magazines (empty drops, loaded goes in); bat run = 'plain' with the arm / wrist held; the pistol sits in her
fist with the user's Rig Lab fit (79844b7, `?pistolplace=old` = the old way); hair sway survives a pause.
**In the Rig Lab (one viewer, beside X Bot / the Quaternius mannequin):** weapon picker (Idle / Attack), clip list by
weapon and move type, shot kick, posture fix preview, magazines, Hands controls (open / support / closed per hand,
pistol hand, "save hands" -> shots/hand_poses.json), test bakes via &extra=assets/test_clips/<glb>.

**Next, in order (show the user each step in the Rig Lab beside the dummy):**
1. The pistol fit in the game points the barrel 5 deg (idle) to 8 deg (run) off her aim and 6-14 deg up: decide with
   the user (aim correction on the chest / wrist, or adjust the fit), then re-check the reload magazine (it led her
   fingers by 5.7 cm with the old placement; 2.2 cm in the Rig Lab) and the idle / run grips against X Bot.
2. Hands: the user sets open / closed per clip in the Rig Lab; then make the game read assets/hold/hand_poses.json
   (a finger layer in clipchars.js) - only after they have saved some.
3. The gun-hand test bakes for the other pistol clips (assets/test_clips/pistol_gunhand.glb: her gun arm bends like
   X Bot's, no locked shoulder) - approved in the test, NOT in the game yet.
4. Posture fix (neck / head / hips / hands from the retarget's axis errors): preview only, not baked.
5. Open items: the 4-strike bat combo "didn't feel as great" (ask what); the composite pistol strafes measure hands
   apart (look OK); the shotgun shell prop is in assets/weapons, unused; the shotgun / axe / bat fit panels.

## Another chat shares this folder (from 2026-10-16)

A separate chat redoes the opening and the maps in this same folder and branch (OPENING_MAPS_HANDOFF.md has the
full rules). This chat sticks to animations, grips and the Rig Lab:
- stage files by name only (never `git add -A` / `-a`); commit only files this chat changed
- leave `src/opening/*`, `opening.html`, `core/floor3.js`, `core/layout.js`, `core/level.js`, `render/arena.js`,
  `render/screens.js`, `render/looks.js` alone; `src/main.js` is shared: small separate edits only
- `dist/combat.js` holds both chats' code: rebuild right before committing, commit it only with your own source change
- prefix screenshots in `shots/` (`grip_`, `kick_`, ...); never stop the shared dev server

## How the user wants to work (non-negotiable)

1. **Rig Lab, side by side:** Yola on one side, the clip's own source rig on the other (Mixamo X Bot for Mixamo clips,
   Quaternius mannequin for UAL clips). Finger bones on. Never judge against the old Yola, never from metrics alone.
2. **Watch frame by frame, from several angles,** at full size, before saying anything works.
3. **Small adjustments TOGETHER,** one at a time, the user approves each. Order: **first where the weapon sits, then
   the hands.** Never change clips to hit a number (round 19 failed that way: "claws", jitter, flared arms).
4. Send screenshots as work lands; double-check every result (both rigs, before/after).
5. The user adjusts things themselves with sliders when they can: give them controls, not just pictures.

## Characters

- **Yola 3.0** = the new Tripo nurse model = `assets/yola2.glb`, Rig Lab `?char=yola2`, game `?yola=2`.
  Adult proportions: arms ~20% longer than Yola 2.0's, hands bigger. Rig fixed today (ponytail, face, hair bones).
- **Yola 2.0** = the original = `assets/yola.glb`, Rig Lab `?char=yola`, game `?yola=1`.

## Tools (all run on http://localhost:5173, the "yolanda" server: `node yolanda/tools/serve.mjs 5173`)

- **Rig Lab** `zombie/viewer.html?char=yola2`: clip picker, frame stepping (arrows, shift = 10), side by side or ghost.
  Today's additions: **finger bones** on both rigs (thumb red, index yellow, middle green, ring blue, pinky violet;
  checkbox "finger bones"), the held weapon in **both** rigs' hands ("same gun on the reference"), camera buttons
  **Yola hands / Ref hands**, and the **Pistol fit panel** (shown with the pistol and "pistol grip in the fist" on).
  **Weapon picker** (top bar): Pistol / Shotgun / Axe / Bat / None sets what she holds (kept when the clip changes)
  and jumps to that weapon's game idle clip; **Idle / Attack** jump to its clips as the game plays them (pistol
  idle `pistol_idle`, attack = the same idle with the game's shot kick; shotgun idle `sg_reload`, attack not in the
  Rig Lab yet; axe `bat_idle` / `t_chop`; bat `ual1_Sword_Idle` / `ual_Sword_Regular_Combo`). `t_shoot` is the
  knee-slide special, NOT a pistol shot: the game has no pistol shooting clip.
- **Shot section** (bottom of the Pistol fit panel): "shot kick" holds the game's recoil at any % (clipchars.js
  aimPistol: Spine2 -0.09 x kick, both upper arms -0.25 x kick, kick = recoil^2, recoil 1 at the shot, -7/s),
  "fire" plays one shot, "keep firing" every 0.24 s. Both rigs; at the peak the muzzle rises ~22 cm on each and the
  gun stays in both fists. The X Bot FBX nests a same-named copy inside each bone: turn the outer one.
  The Rig Lab runs the bundle `dist/viewer.js`: `node build.mjs` after editing src/viewer.js.
- **Pistol fit panel:** the grip goes through the fist centre (centre of the curled index-pinky joints) along the
  fist's grip line (pinky -> index knuckle), barrel toward the forearm; then per-character size %, move (mm along the
  gun's axes: forward, up the grip, side) and turn (tilt, turn, roll, degrees). "editing:" switches Yola / reference.
  Fits live in the browser; **"save" writes `zombie/shots/pistol_fit.json`**; Claude copies it into
  **`assets/hold/pistol_fit.json`** (committed). Code: `src/viewer.js` pistolInFist / PFIT / buildPistolFit.
- **Inspect mode** `zombie/combat.html?mode=calm&inspect=1&yola=2`: the real game, free camera, keys 1-5 weapons,
  H hands, B body, P pistol models. (The user prefers the Rig Lab with the reference.)
- **Screenshots without the window:** Rig Lab `window.__lab` (setClip, setFrame, camHands, held, heldRef, renderer,
  scene, camera) + `POST /__shot/<name>.png` with the canvas; game `window.game` (tick, cam, shot, sheet,
  sim.player.setLoadout). With the pane hidden, never wait on requestAnimationFrame; render explicitly.
- Blender: `assets/source/yola_v2/yola2_work.blend` (saved, matches the game file); export
  `blender -b <blend> --python tools/anim/yola2_export.py -- <ABSOLUTE assets path>` (restore yola_sword.glb and
  clipdata_yola2.json afterwards if only float noise changed).

## State of each weapon

| Weapon | Model | Where it's placed (game: `src/render/clipchars.js` placeWeapons) | Status |
|---|---|---|---|
| Pistol | Hospital Weapons Core, **80% size** (`assets/weapons/pistol_core.glb`, `prepPistolCore`, `PISTOL_CORE_SCALE`) | At the right grip point, barrel along shoulders -> hands (aimQuat). Left hand not fitted | Rig Lab fit done for **Yola 3.0 and X Bot** (pistol_fit.json). **Game not using it yet** |
| Shotgun | short pump (`pump_short.glb`) | Right-hand socket calibrated in the hold pose; left hand IK on the pump | Best of the four; not yet reviewed against X Bot with finger bones |
| Axe | `fire_axe.glb` | Handle from the right-hand socket (X Bot measured), between both hands | Both hands flat open ("praying hands") on both Yolas |
| Bat | one-handed, Quaternius Sword Regular Combo (`placeHeld`, fist frame) | Grip at the fist centre (0 mm) | Fingers half open, bat hangs under them |

Pistol finding (today): on `pistol_idle` her finger curl matches X Bot's within a few degrees. The fists were fine;
the gun's placement (floating behind the knuckles) was the problem.

Checked 2026-10-16 (screens in shots/grip_idle_*, kick_*): pistol idle frame 1 and the shot kick (0 and 100%) on
Yola 3.0 and X Bot from side / front / top. The user is now spot-checking grips themselves with the picker; wait
for their findings (weapon + clip + frame) before changing anything. Yola's fit stays the saved one (up 7; the
user dropped a stray -1 from the browser).

## Findings 2026-10-16 (late), waiting on the user's pick

- **Posture (all Mixamo clips):** retarget.py matches bone AXES; X Bot's Neck/Head axes are 16.9/25.8 deg off his neck
  line, Yola's Hips/Spine2/Hands 4.1/1.6/~4 deg off hers -> her head ~26 deg back (chin up), pelvis ~4 deg tucked.
  Rig Lab "posture fix (preview)" (top bar, c139565) shows the cure: those lines land 0.0 deg from X Bot, feet 1 mm,
  hands 2-3 mm. Not in the game. Baking it: constant per-bone turn C = Rt^-1 A^-1 A' Rt on those bones (children
  counter-turned), or retarget.py matching joint->child lines; library (UAL mannequin) and carried clips not checked yet.
- **Bat run (game):** no clip of its own: legs = pistol_* `_lower` (the aiming jog), upper = `sword_idle_upper`
  (ual1_Sword_Idle, set in clipchars.js setOneHandedBat) WITHOUT the hip re-base the shotgun/reload layers get
  (rebaseUpper / upperHips), plus the game's Spine1 lean. Result (shots/sheet_game_runs.png): hunched at the waist,
  head down, arms hanging. Options: the unarmed run clips (p_run_plain etc., arms swing) with the bat in hand, or the
  sword idle re-based onto the hips. Quaternius has Jog_Fwd_Loop / Sprint_Loop / Walk_Loop but no sword run.
- **Bat run DECIDED (user):** 'plain' = the regular run clips with the bat in hand (clipchars.js batRun, default),
  bat arm held part-way to the sword stance: batArmHold 0.5 (shoulder..forearm), batWristHold 0.9 (hand + fingers:
  the bat's angle; its tilt over a stride 81 -> 41 deg). The user: plain "100 percent" better; better from the front.
  Options kept: ?batrun=now|rebase|plain|plainlegs, ?batarm=, ?batwrist=. No melee-run reference exists here
  (Quaternius has none; Mixamo's sword packs would need the user to download them).
- **Inspect mode = the game viewer for moves:** combat.html?mode=calm&inspect=1&yola=2&w=bat&move=run&cam=side:
  moves on the spot (walk/run/back/strafes/attack), speed/pause/step, cameras, bat run options + arm/wrist sliders,
  panel folds with U. It steps the game in fixed 1/60 s steps: uneven steps made a fake 9.5 cm forward/back jitter.
  Checked with the full skeleton vs X Bot: her plain run, pistol run and walk match him joint for joint.
- **Rig Lab clip list** is grouped by weapon and move type (GAME_CLIPS in viewer.js); picking a weapon lists its clips first.
- **Right shoulder tucks (pistol_walk_back f27, the user's screenshot):** collarbone matches X Bot (1.5 deg); her
  upper arm swings 10 deg further across the chest (35 vs 25) with a near-straight elbow (12 vs 31 deg bend). Suspect:
  the build's contacts.hands two-hand IK (pistol_ clips). Test before fixing: re-bake pistol_walk_back without it.
- **Shoulder tuck SOLVED in a test (2026-10-16):** contacts.hands ('arm' mode, as built) scales the hands' goal by her
  longer arms -> past her reach -> gun arm locked at 99.5% (elbow 11.6 vs X Bot 30.6 in idle/walk/walk_back). Test mode
  YOLA2_HANDS=gunhand (the gun hand stays where her arm puts it, the support hand comes to it) re-baked all 11 pistol
  clips (assets/test_clips/pistol_gunhand.glb, local; Rig Lab &extra=assets/test_clips/pistol_gunhand.glb, clips
  *_REBAKE_gunhand): gun-arm elbow = X Bot's exactly in all 6 referenced clips, across-chest within 1-3 deg, hands as
  close as now. Sheets: shots/sheet_pg_<clip>.png. NOT in the game yet. To put it in: re-bake those 11 actions into
  yola2_work.blend (keep its weight work), export, then re-check the pistol fit (the gun hand's pose changed).
  Open: the composite strafes (left, run left, run right) measure hands ~0.6 shoulder widths apart (look OK in pictures);
  the reload swings the arm out more than X Bot's (-21 vs -11 deg), before and after.
- **Pistol reload DONE in the game (2026-10-17, 3a2b41b):** the old one was cut from X Bot's walking reload (frames
  38-99) and moved like a long-gun reload (the user). Now Quaternius UAL1 Pistol_Reload with contacts.support (her left
  hand placed where the mannequin's is, in the gun hand's frame: 0.04-0.11 hand-lengths off on frames 22-48, was 0.57).
  Magazines (the user's props, assets/weapons/pistol_mag_*.glb, made for this pistol: MAG_SEAT): empty drops at frame
  6, loaded taken from the hip at 13 (held by its base at her thumb-index pinch), into the grip 23-28. clipchars.js
  placeMags = viewer.js updateMags. Inspect mode "reload" move. Open: the game's pistol placement is the old one (not the
  Rig Lab fit), so the gun sits more upright and the magazine leads her fingers by up to 5.7 cm at the insert; the
  shotgun shell prop (assets/weapons/shotgun_shell.glb) is copied in but not used yet.
- **How to check a contact:** WEAPON_HOLD_PROCESS.md section 16 (the user's lesson after the reload miss).
- **The 4-strike bat combo** (Sword Regular Combo split) "didn't feel as great as hoped": ask what felt off.

## Next steps (in order, each one shown to the user before the next)

0. **The user's spot-check findings** (they were checking many grips with the picker when this was written).
1. **Pistol in the game:** make placeWeapons use the same fist placement + the `yola2` fit (and `yola` for Yola 2.0
   once set). Show game vs Rig Lab, same frame, several angles. Then the walk/strafe/run/reload clips frame by frame
   vs X Bot (the fit was set on pistol_idle frame 1 only).
2. **The support (left) hand on the pistol:** only after the user approves step 1.
3. **Same fit panel for the shotgun, axe and bat** (one per weapon, per character), then their hands.
4. Not checked yet for any weapon: attacks, reloads, running, swaps.

## Parked (late polish pass, do not start unasked)

Hair clipping through her body, shirt hem folding on a knee raise, sharp wrist/finger/ankle weights, fingertip bones
sticking out, faint neck line: PONYTAIL_PLAN.md "FINAL POLISH PASS".
