# Weapons and grips: where we are (handoff, updated 2026-10-17)

Read this first when continuing the weapon/grip work. Then WEAPON_HOLD_PROCESS.md sections 16 (how to check a
contact) and 17 (rigging and retargeting: what works, what not to do). PONYTAIL_PLAN.md = Yola 3.0 rig work (done).

## START HERE: the overnight review (2026-10-17, for the user to check)

The user asked Claude to review every grip clip alone, fix what it could against the reference rigs, and leave the Rig
Lab ready for adjustments. Everything below is committed (commits 761161a .. today); screenshots are in shots/rv_*.png.

**Fixed (in the game and the Rig Lab):**
1. **Game bones stuck at rest (the big one).** The game put every bone back to rest before each frame, and three.js's
   mixer only rewrites a bone whose value changed, so any bone a clip held still stayed at REST: open fingers (16-79 deg
   off the clip), a right shoulder 10 deg off, the support hand a hand-width under the gun in the run. Now every bone is
   rewritten each frame (clipchars.js mixerWritesAll). This was most of "the hands don't look closed".
2. **Pistol clips re-baked** with the approved 'gunhand' fix (her gun arm bends like X Bot's, no locked shoulder), and
   the three built strafes (strafe_left, strafe_run_left / right, no X Bot source) now hold X Bot's pistol_idle two-hand
   grip: support hand within 0.07 hand-lengths of X Bot's in every pistol clip.
3. **Pistol aim:** the game turns her chest so the BARREL (not the arms' midline) points at the target, eased ~0.1 s:
   0.0 deg off standing, sways +-3 deg running / ~+-7 backing and strafing as X Bot's gun does. The yola2 fit's tilt 17
   / turn -18 were the Rig Lab's unsaved values (they put her barrel pitch within 3-4 deg of X Bot's); saved them.
4. **Posture** (render/posture.js, in the game): her head was tipped back ~26 deg in every Mixamo clip (chin up, eyes
   on the sky in the run), pelvis tucked 4 deg. Fixed per source rig, hands left alone. `?posture=0` = without it.
5. **Bat / axe / shotgun on one shared hold module** (render/holdfit.js, used by both the game and the Rig Lab): the
   Rig Lab drew the bat between both hands while the game held it one-handed; the axe handle passed 3-12 cm behind her
   fists in the game (now through both fists, 1 cm; no end-over-end flip); the shotgun calibrates the same way in both.
6. **Reload magazine** rises with her fingers along the grip (within 2.4 cm of her pinch; was 3.5 cm ahead).
7. **Fists:** Tripo's jab / cross / kick had flat open hands (palms together in the jab): punching fists now (1.3 =
   tighter than her bat grip, which left a handle-shaped hole), in assets/hold/hand_poses.json (the game reads the Rig
   Lab Hands settings). Also closed: the axe swing (the source's release fingers hung off the handle); the shotgun's
   pump hand at 'support' (it was flat against the pump; X Bot's curls over it).
8. **Shotgun shell:** the user's prop (assets/weapons/shotgun_shell.glb) replaces the stand-in, held in her thumb-index
   pinch pointing at the loading port (the stand-in floated 5-8 cm behind her fingers).
9. **An independent checker agent** (read-only, shots/chk_*.png) re-checked everything: it found the axe handle going
   through her head in the batting idle (2.3 cm from her head's centre; now 12.4, X Bot 13.7: the handle leans toward
   the fists' grip axes), plus items 7's hands; fixed and re-checked.

**Rig Lab controls for the user (viewer.html?char=yola2):** pick a weapon (top bar) and the fit panel on the right
follows it: Pistol / Bat / Axe / Shotgun, each with size, three moves (mm) and three turns (deg), "editing" Yola or the
reference; "save" writes shots/pistol_fit.json + shots/weapon_fit.json (Claude copies them into assets/hold/, which the
game reads). Hands: R / L open / support / closed + a slider, per clip; "save hands" writes shots/hand_poses.json (same).
"posture fix (as the game)" on by default; untick to compare.

**For the user to decide / look at:** (a) the barrel pitch change (tilt 17 / turn -18 from the browser; the saved file
had tilt 3 / turn -14); (b) the posture fix overall; (c) the axe blade turns to lead a swing in the game but faces her
front in the Rig Lab (a still frame has no swing direction); (d) the bat combo "feel"; (e) any clip's hands.
**Not done / small:** the 4-strike bat combo's timing ("feel": ask what); the bat combo frame ~40, the handle slightly
cuts her index / middle fingers (the bat fit's sliders can move it); in the pistol reload's reach to the hip pouch
(frames 5-19) her left hand stays ~1 hand-length higher than the mannequin's; her pistol barrel sits 2-3 deg lower than
X Bot's (the yola2 fit's tilt). Not checked: Yola 2.0 beyond loading cleanly; the shotgun's pump action when firing.

## Another chat shares this folder (from 2026-10-16)

A separate chat redoes the opening and the maps in this same folder and branch (OPENING_MAPS_HANDOFF.md has the
full rules). This chat sticks to animations, grips and the Rig Lab:
- stage files by name only (never `git add -A` / `-a`); commit only files this chat changed
- leave `src/opening/*`, `opening.html`, `core/floor3.js`, `core/layout.js`, `core/level.js`, `render/arena.js`,
  `render/screens.js`, `render/looks.js` alone; `src/main.js` is shared: small separate edits only
- `dist/combat.js` holds both chats' code: commit it only built from committed sources (`sh tools/clean_dist.sh` after committing your sources)
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
