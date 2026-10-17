# Opening and maps redo: start here (handoff, 2026-10-16)

For a NEW chat that redoes the opening (story intro) and the maps (levels). Another chat works in this same folder at
the same time on animations, weapon grips and the Rig Lab (GRIPS_HANDOFF.md). Read "Sharing the folder" before
touching anything.

## NEWEST (2026-10-17, round 2 of the reveal polish): the home-run burst — read this first, then LATEST below

The user's next pass, built and checked in the browser (NOT yet committed or deployed when written, ask first):
- **Kevin Iglesias file:** `assets/moves/yola_moves.glb` untracked + gitignored (kept on disk for the Move Library and the
  `?mode=arena` test arena, the only places that load it; the game/opening never used it). Its 23 clips: kev_ Human Melee
  + kevs_ Human Soldier; only two were assigned in the Move Library: Attack1H01_L (knife, "maybe") and AttackPolearm01
  (chainsaw, "good"), both arena-only. It is still inside the 70 unpushed commits (from 402d424): rewriting that history
  was blocked by the permission guard and needs the user's explicit OK before any push.
- **Flashes:** speed up (0.15 → 0.09 s), then slow click by click (0.16, 0.27, 0.38 s), a 0.95 s held breath with a
  heartbeat, then the BOOM on Yola 3.0 (rs.flashBoom, camera jolt, fog kicked). `seq` in `reveal()`.
- **Feet:** floor-level lens 17 cm up (lower grazes the floor decals), tilted up, fov 30, slow creep, backlit from the cab;
  each slowed step = bass boom (rs.footstep) + war drum + a camera jolt (`stepShake`). Cue louder (+ sub).
- **Smoke:** sprites anchored low (`center 0.5,0.3`) so the floor no longer cuts them in a hard band, wispier texture with
  a soft edge, 72 puffs with curl, a few taller wisps (a stray `//` had disabled their rotation before).
- **Bat:** a copy of her own bat (Y.batLib.obj) leaning knob-up on the wall right of the doors (REV_BAT), no clipping.
- **The burst (src/opening/burst.js, assets/opening/zombie-patient-burst.glb from tools/opening/make_zombie_burst.py):**
  the modular patient cut further in background Blender (never the user's open Blender: it holds the animation chat's
  file) into head, chest, pelvis, upper arms, forearms, thighs, shins + 3 gut loops + 8 gibs; every cut closed with the
  burgundy tissue and capped both sides by blender/gore_kit.py. All skinned to his skeleton: he walks in on the mod file's
  clips, and at contact each chunk is baked to a still mesh in the exact pose (CPU skinning) and thrown.
  `planHit()` finds the contact from her own clip (the barrel's furthest reach in front of her), places him there, and
  picks a camera across the line between them that stays inside the OR walls. Contact: hit-stop, smash sound, slow motion
  (0.26), pieces to both sides, blood spray/mist/pools; the head flies a tumbling arc and ends face-on 0.62 m from the
  lens, up-right of centre (its face glows a little so it reads); `lensCrack()` draws the cracked glass + smear; the head
  bounces off and drops away; then the freeze cuts to Yola with the pieces hanging in the air, name card + the crack over
  it; the crack fades as the camera rises. The OR's patient zombie is removed from the game (`dropPatient`, only after the
  burst played); his pieces and blood stay on the floor in gameplay. Camera near plane 0.05 during the swing, restored.
- **To tweak with the user:** hit timing (contact = 1.53 s into the clip, late in the swing), how far/fast pieces fly
  (`kick()` in burst.js), the head's flight time (`headSecs`), blood amount, the feet angle, the mix (not heard by me).
  A chapter restart from scratch brings the patient back at the table (no level flag yet).

## LATEST (2026-10-17): the reveal the user signed off on — read this first

The user reviewed the opening over several rounds on 2026-10-17 and said "this is so close… commit it". Everything below is
committed on `opening-reveal` (last commit of this round: see `git log`; rollback tags `checkpoint-pre-brief-2026-10-16`,
`checkpoint-pre-opening-redo`). Production deploy of this round: yola-zombie.vercel.app (see the deploy note at the end).

**Watch it fast:** title screen "Skip to reveal ▸", the "Reveal ▸" button in the opening's top-right controls, the
"↺ Reveal" button that stays top-left after the hand-off, or `combat.html?crisis=1`. All jump (≈0.3 s) to the calm beat
before the flatline (`opening.toReveal()`, mark `handoff-done`) and play live with sound.

**The opening as it stands (src/opening/opening.js):**
- Tour, check-in, office: the office conversation cuts between HELD reverse angles (`headShot()`, no push-in per line;
  Yola's angle looks down between the visitors' heads over her monitor), the speaker's hand gestures (`gesture()`), Yola's
  head dips to the chart on line 10; seated Yola's pelvis is pinned (actors.js applySit: her standing clip's breathing bob
  read as bouncing). Recliners rebuilt by tools/anim/make_recliner.py (backrest hinged, headrest; the old back floated).
- Clean wheelchair (assets/models/wheelchair/Hospital_Wheelchair.glb: its anchors place the seat and pusher; hands IK'd to
  the push grips). Ground-floor lift: the reception wall is opened for the cab, the kit's blood hidden there, the cab's
  1-2-3 panel replaced by a G-7 panel (stage.js liftDisplay). Everyone walks through the doorway centre lines.
- Floor 7 OR (core/chapter.js, OR_TABLE = x -3.4, z -8.75): one table on the west side, head under a bay headwall,
  curtain screens on the lift side. Lines 12/16/26 play clean edits of their takes (content.js from/to). After line 26 Yola
  simply walks out (her trip to six is off screen); the OR lift display is set to 6.
- Crisis (act4): each alarm pulse dims the room; the power dies (sound) to red emergency light and a dying tube; staff
  turn to the patient before line 29 and back away (`backAway()`); hard cut to black after line 31. No head spin.
- Reveal (`reveal()`), the user's approved beat sheet, refined:
  5 the shut doors in the dark, a LINE OF LIGHT SLIDES LEFT→RIGHT UNDER THE DOORS (`doorSweep()`), up to the indicator 6→7;
  6-7 doors open on a black cab; flashes from above-behind (the opening's spotlight re-aimed, `revLight`/`flashOn`) show the
     ORIGINAL TOON YOLA and YOLA 3.0 in the SAME standing pose, same spot, both facing the camera (`standYola()`: her
     tripo_idle on a separate mixer), surfaces flipping clean/outbreak with them; then a beat of dark and a FAST BURST that
     speeds up and lands on Yola 3.0, the last flash fading slowly so she stays (the user asked for exactly this);
     dry-ice smoke pours low out of the cab (`ensureSmoke`), lit only by the flashes and the red;
  8 the patient, red-lit; the outbreak world is committed behind the cut (`revealWorld()`);
  9 FEET ONLY: she walks out through the fog (natural walk, slowed 70%, hands empty), each step a thud + war drum + fog kicked;
  10 the athlete's bat leaning on the lift frame (`revBat()`), nobody picks it up on screen;
  11 a cut to her set in the batter's stance; the MIXAMO HOME RUN plays from its wind-up (HR.stance 0.2 s) with the bat in
     her LEFT hand (`placeHeld` with a left-hand copy of the game's bat hold);
  12 FREEZE on the one-handed follow-through, reframed to hold her and the whole bat; her picture is NOT stylised (the user
     hated the comic filter on her) — only the name card is Borderlands-style ("YOLA", "Anesthesiologist. Off shift.",
     comiccard.js nameCard); the cue's hit;
  13 the music hits, the clip's walk-off plays while the camera rises to the game; her root was placed so the walk-off ends
     exactly on ROOM1.player (no jump at the hand-off).
- Sound: src/opening/revealsound.js (synthesized, nothing recorded or bought): drone bed, power-down, lift motor, door
  hiss, heartbeats, a crack per flash, slow-mo whoosh, footsteps, the walk-out cue (low D-minor chord, war drums, rising
  strings) slamming on the freeze. Not heard by me (the pane cannot listen): the user must judge the mix.
- Her reveal clips: tools/opening/make_reveal_clips.py (Blender, read-only use of blender/retarget.py and
  tools/anim/contacts.py) writes assets/opening/yola2_reveal.glb (reveal_homerun from the X Bot FBX
  assets/mixamo/yola_baseball_homerun.fbx; reveal_walk from Quaternius UAL1 Walk_Loop, CC0). assets/yola2.glb untouched.

**The user's STILL-TO-TWEAK list (they said so explicitly; do these with them, step by step):**
1. The home run: timing of the wind-up into the swing could be tuned more; the left hand / bat may drift on her longer
   arms — the user says they can fix the hand fit in another file; the bat follows her left hand now.
2. Smash the zombie: once they like the exit, the patient (white-gown) zombie should burst on the swing. He is modular only
   into ~6 parts (head, forearms, lower legs, torso; the game's sever/ragdoll can do that today); more pieces need Blender
   cuts. Zombie placement for the swing not built yet (one OR zombie was moved off the lift so it stopped blocking the shot).
3. The shotgun KNEE SLIDE: Tripo's "shoot" clip = `t_shoot` in both Yola files (runs, drops to the knees, kneeling aim,
   9.07 s, root motion stripped — re-add forward travel like the walk-out). The shotgun hold must be fitted to that pose
   (the user wants to do the grip together, Rig Lab side by side as with the animation chat). Not built.
4. Ideas offered, not started: slow-mo first step with fog swirl (partly done), rotating emergency beacon, sound mix
   review, depth of field in close-ups.
5. Older open items: guard's arms do not detach (not modular); ragdoll frame cost with many simultaneous deaths
   (pre-existing, measured in both the chapter and the old wing); no carry pose (the case follows her left hand); the radio
   script for Floors 7/6/5 is unrecorded (captions labelled draft); physical-phone and real desktop-width tests not done.

**Known gotchas:** `opening.card` is the clinical-card method (the freeze overlay is `freezeEl`); opening actors have no
backward walk (use `backAway`); OriginalYola's procedure resets head/right arm each frame (actors.js re-applies adj after
it); in tests set `opening.storyClockLines = true` and use `runTo(mark)` + `game.shot`/`game.sheet`; overlays (the freeze
card) need a real `computer` screenshot, not `game.shot`. Marks: beat1, motion, beat5, beat6, beat9, beat11, beat12,
handoff-done, get-yola-done, room1-playable.

## STATE (2026-10-16 evening): the brief is built

The user's brief arrived: `~/Downloads/Yola_Complete_Claude_Build_Brief_2026-10-16.txt` (the authority) plus the Tiled v3
maps `~/Downloads/Yola_Floors_7_6_5_Tiled_v3.zip` (extracted copy: session scratchpad `maps_v3/`; `source/*_Spatial_Data_v3.json`
holds the exact room polygons and doorways). Rollback tag for this round: `checkpoint-pre-brief-2026-10-16`.
Commits: 9bf7759 (Chapter 1 blockout), c8429d2 (opening + 13-beat reveal), a1a36a5 (furnishing), then the carry/handoff commit.

- **Floors 7, 6, 5 = `src/core/chapter.js`** (data, built from the plans' px: 25 px = 1 m; floors stacked along z: 7 at 0,
  6 at -80, 5 at -160). The renderer builds all three once; the simulation's world is the current floor (`useFloor`).
  `src/core/level.js` = the chapter's state (flags, the case, the lift and its floor picker, the radio/phone lines,
  the partition, saves per floor; save key `zc.chapter1save`, v 2). `src/ui/chapter.js` = radio captions (draft lines,
  labelled "not recorded"), lift picker and ride, the case in her left hand and its off-screen marker, the docket, the end card.
- **Opening**: lift to Floor 7 (display G-7), arrival through the OR's back-wall lift, Yola walks the guard down to six
  after the handoff (her errand), crisis = beats 1-4, `reveal()` = beats 5-13 (silhouettes are a material swap,
  `silhouette()`; Yola 3.0 is posed with the game's own clips via `poseRevealYola`). Lines 12/16/26 play clean edits of
  their takes (`from`/`to` in content.js LINES); 32 omitted. Clean wheelchair `assets/models/wheelchair/Hospital_Wheelchair.glb`
  (anchors: seat, pusher origin, push grips; hands reach the grips with `render/ik.js`).
- **Yola 3.0 is the default hero** (main.js `yolaModel` default '2'); the old toon Yola only in the tour and beat 7.
- Test hooks: `opening.runTo('beat5' | 'beat7' | 'beat9' | 'beat12' | 'errand-done' | 'motion' ...)`, `game.applyLevel(save)`
  with `{ v: 2, floor, flags, case, ... }`; shots prefixed `op_` / `map_` in shots/.
- **Open items**: the guard's arms do not detach (his model is not modular: Blender work); ragdoll frame cost with many
  simultaneous deaths (measured in both the chapter and the old wing, pre-existing); no carry pose in the rig (the case
  follows her left hand through the bat stance); the radio script has no recordings; physical-phone test not done.

(The original instruction below — ask the user first — is done.)

## Rollback point

Tag `checkpoint-pre-opening-redo` = the game exactly as it stood before this redo (all work committed). The older
`checkpoint-pre-opening-v3` is the build before Opening V3.

## Sharing the folder with the animation chat (non-negotiable)

Both chats share one working copy and one branch (`opening-reveal`). Nothing stops one chat from committing the
other's unfinished work, so:

1. **Stage files by name only.** Never `git add -A`, `git add .` or `git commit -a`. Run `git status` first and
   commit only files this chat changed.
2. **This chat owns:** `src/opening/*`, `opening.html`, `src/core/floor3.js`, `src/core/layout.js`,
   `src/core/level.js`, `src/render/arena.js`, `src/render/screens.js`, `src/render/looks.js`, `assets/opening/`,
   `assets/kit/` and the level/prop assets.
3. **The animation chat owns:** `src/render/clipchars.js`, `src/render/hairsway.js`, `src/render/weaponModels.js`,
   `src/render/libattack.js`, `src/viewer.js`, `viewer.html`, `src/inspect.js`, `src/moves.js`, `assets/yola*.glb`,
   `assets/moves/`, `assets/hold/`, `assets/weapons/`, `assets/source/yola_v2/`, the Blender files.
   **Ask the user before editing any of these.** (Changing how Yola animates or holds weapons belongs there.)
4. **Shared, edit with care:** `src/main.js` (game start-up, starts the opening) and `src/core/*` other than the map
   files above. Make small, separate edits; never reformat or reorder these files.
5. **Built bundles (`dist/`, tracked in git):** `node build.mjs` rebuilds every bundle, and `dist/combat.js` contains
   both chats' code. Rebuild right before you commit, and commit `dist/combat.js` only together with your own
   source change. Never commit `dist/viewer.js` or `dist/moves.js` (the animation chat's).
6. **Screenshots:** both chats save into `zombie/shots/`. Prefix your file names (`op_...`, `map_...`) so neither
   overwrites the other's.
7. **The dev server is shared** (`yolanda` in .claude/launch.json, port 5173; preview_start reuses it). Never stop it.
8. Nothing is pushed or deployed without the user's say-so (production: yola-zombie.vercel.app, `vercel deploy
   --prod` from `yolanda/`; GitHub repo is public, mind licensed assets before pushing: see memory).

## What exists now

**Run it:** `http://localhost:5173/zombie/combat.html?intro=1&auto=1` (the whole opening), `?reveal=1` (replay from
the call), `?room1=1` (straight to the hand-off snapshot). The game alone: `combat.html?mode=calm`.

**The opening (Opening V3, about 3:35):** `src/opening/`
- `opening.js` (1121 lines): the acts, story clock, cameras, the hand-off. `finalize()` is the one canonical Room 1
  snapshot (used by the normal end, skip, replay and `?room1=1`).
- `content.js`: all the words: TOUR (driven by the ElevenLabs narration timestamps), LINES / SPEAKER / VOICE_DIR
  (take B voices; take A kept in assets/opening/voice for review), CLINICAL_CARDS, OBJECTIVES, TIME_CARDS.
- `stage.js`: the ground-floor clinic set (reception, assessment office, treatment bays, elevator), props placed by
  hand (x, z, rot, wall).
- `actors.js`: the opening's own characters (it plays the ORIGINAL Yola, `OriginalYola`), `breakthrough.js` (the
  painted breakthrough), `ui.js` (cards, captions), `opaudio.js` (voice + sound).
- Hooked in from `src/main.js`: `startOpening()` (~line 223), the Room 1 hand-off (~232-280), the update loop
  (~385).
- History and decisions: `OVERNIGHT_REPORT.md` (Opening V3), `PROGRESS.md` round 6 and later,
  `COMBAT_POLISH_LOG.md` (newest at top).

**The maps:** Floor 3 / Level 1.
- `src/core/floor3.js`: the floor's data (rooms, walls, doors, LIFT, GROUPS, PICKUPS, SIGNS / ROOM_SIGNS).
- `src/core/layout.js`: switches the practice wing vs Floor 3, ROOM1 (the hand-off room).
- `src/core/level.js`: flags, lift, pickups, checkpoints, braced doors.
- `src/render/arena.js`: builds and draws it (cut-away walls, doors, emergency lighting, the outbreak textures).
- Known open item: the Floor 3 signs (the OPERATING ROOM sign is printed over the shut OR door; the maintenance
  sign sits oddly beside it; never put a sign on a door leaf).

## How the user works (from memory; they confirmed these over many rounds)

- **The camera never turns.** One fixed low, turned diorama view (Zombieville USA 3D look, ~42° down, turned 35°,
  ~7.2 m across a portrait phone). Design every room for that view: low cut-away walls on the camera-facing sides,
  nothing tall between the camera and the play space; check each room from the game camera at phone size.
- **They judge visuals themselves, frame by frame.** Send screenshots as work lands, with a plain explanation; give
  toggles or sliders rather than a single pick. Test in a mobile viewport (resize preset "mobile" first: a hidden
  pane gives empty screenshots). Opening frame tests: `opening.seek / runTo`, `game.shot / sheet` contact sheets;
  set `opening.storyClockLines = true` and force `opening.paused = false` (the pane's blur pauses the story).
- **Step by step, they approve each step.** Show proof before fixing something that may not be broken.
- Never enter passwords (the user logs in); confirm a spending cap before any paid generation (voices, 3D);
  never decimate Yola's mesh; no placeholder characters polished up.
