# Weapons and grips: where we are (handoff, 2026-10-16, commit 8e44d9b)

Read this first when continuing the weapon/grip work. Deeper background: WEAPON_HOLD_PROCESS.md (sections 15+ are
today's), PONYTAIL_PLAN.md (Yola 3.0 rig work, done).

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
