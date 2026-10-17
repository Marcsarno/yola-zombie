# Opening and maps redo: start here (handoff, 2026-10-16)

For a NEW chat that redoes the opening (story intro) and the maps (levels). Another chat works in this same folder at
the same time on animations, weapon grips and the Rig Lab (GRIPS_HANDOFF.md). Read "Sharing the folder" before
touching anything.

**First thing to do: ask the user what the redo should be.** The user said "redo the opening and the maps" and gave no
script or layout yet. Do not assume: ask for the new story beats / script and what to change in the maps, and
whether the opening should use the new Yola (Yola 3.0) or keep the original.

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
