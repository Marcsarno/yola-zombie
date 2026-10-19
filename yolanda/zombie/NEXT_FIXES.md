# Next fixes (the user's notes, 2026-10-18, after playing the combat pass)

STATUS 2026-10-19 early morning (combat chat) — START HERE. The big build (BUILD_PLAN.md) is built and committed locally
(81cf8b7..aa593f4). NOT deployed, NOT pushed (the user hasn't asked yet).
- Built, each tested in the practice room (combat.html?mode=calm&demo=...):
  - **The dodge** (FINISHERS_PLAN.md 1): the window opens a fixed 0.45 s before any hit, at half speed; the button grey at
    rest, pulsing yellow in the window, white for perfect, with an arrow the way she'll go; a perfect press pays at once
    (Witch Time: world 0.25, Yola full speed); the spider-sense over her head (demo slam1, charger).
  - **Finishers** (2): the gold mark over an open zombie, the centre button turns gold FINISH; the 5% walker critical
    with its wide arc (melee/shotgun sweep, pistol headshot chain); demo walkers.
  - **The shotgun slide finisher** from the animation chat (render/slidefin.js; needs their uncommitted clips in
    assets/yola2_ual.glb and the stripRoot travel.x line in clipchars.js: until then the old point-blank finisher plays).
  - **The guard** (3): unhurtable but from behind; slam -> stuck -> finisher 1 takes the arm (it flies) -> he takes the
    shield in his other hand (the view mirrors him) -> finisher 2 takes the head; missed: he wrenches it free. The slam
    kills walkers right under it, throws those within 4.2 m. Club / flail / enraged stages gone (demo slam1, tear).
  - **The lady** (4): 7.5 m/s, 10% bigger, bowls walkers like pins, heavy footsteps; a wall crash opens her finisher (head
    off, no acid); her acid otherwise redone (splatter, froth, hiss, burnt stain) (demo charger, ladykip).
  - **Yola getting hurt** (5): the red arc from the hit's side, 0.8 s grace, heavy hits drain colour, low-health heartbeat.
  - **Oxygen cylinders** (Floor 6): o2chair / o2walker zombies, standing cylinders (sim.addTank); shot -> hiss -> burst,
    chains (demo oxygen).
  - **Room mechanics** (core/rooms.js, render/rooms.js): cracked walls (sledgehammer, lady, slam, blast break them; demo
    crack), the flood (wading 55%, the panel's jolt kills everyone in the water; demo flood), the MRI arena (guns pinned,
    metal dragged, the guard's shield ripped off, red button once clear, guns back; demo mri).
  - **Props modelled in Blender** (blender/make_room_props.py -> assets/props/room_mechanics/*.glb, loaded by
    render/roomprops.js): oxygen cylinder, cylinder trolley, flood panel, MRI scanner, magnet stop. The Blender file has
    them in its own scene "RoomProps" (the floor-bake scene untouched).
  - **The user's notes**: bed patients wake at 9 m in sight and rise 1.6x faster, with a camera cut on the first one;
    the zombie eyes now sit on the face mesh (first pass: the user should look at them in the lighting lab).
- NOT done:
  - **The floors**: the maps chat was handed FLOORS_REDESIGN.html + BUILD_PLAN.md, but its session was stopped and is
    gone; no floor work was committed. Floor 7's additions and the new Floors 6 and 5 still need building (placing
    cracked walls, the flood, the MRI, cylinders and the new zombie kinds with the sim.add* calls in core/rooms.js).
  - The guard's shield on the MRI sticks edge-on to the scanner (works, could face it better).
- **FIXED 2026-10-19: the opening scene's characters were missing** (the receptionist, the waiting patients, the original
  Yola, the baseball player, the security guard, the treatment team). Not removed: they were loaded and switched on in
  their rooms on cue, but drawn off in space. The performance pass's visibleMatrixWorld (main.js, PERF_AUDIT.md 1) worked
  out world matrices inline and so skipped three.js's SkinnedMesh step that refreshes the bind inverse when a character
  moves; the opening's actors are placed far from where they were built. It now does that step (and a camera's view
  matrix). Checked: reception, office, treatment room, the visitors' arrival, the reveal, a fight.
- **The zombie eyes still don't look good** (the user, after the mesh-placed pass aa593f4): keep them off in the game;
  rethink before using them (maybe emissive eye patches on the face texture instead of sprites).
- NEXT (the user, 2026-10-19): the user compacts this chat, then the opening fix above, then **the lighting bake**: set up the lighting for the floors
  (the lab's picks into the game; bake per floor once its walls are final). Then deploy for a phone test on the user's word.
- Rules this session added: the animation chat edits src/render/clipchars.js, holdfit.js, hold/*.json, yola2_ual.glb,
  viewer.js in the same checkout: commit only my own hunks of clipchars.js (git diff -U0 + git apply --cached
  --unidiff-zero of my hunks); never theirs. New assets: build them in Blender (the user: "don't just guess").

STATUS 2026-10-18 night (combat chat). Everything committed, deployed and pushed (opening-reveal, last 704645e). Everything committed, deployed and pushed (opening-reveal, last 704645e).
- Done tonight: the lighting lab finished and polished (user's picks are its defaults: A, C with tubes hidden, EXIT, D, muzzle,
  Yola's shadow, character light 0.45; colour by room, shafts, splatter, sparks, haze, impact; the ☀ looks live in its panel);
  performance fixes 1-7 (PERF_AUDIT.md: hidden groups skipped, static frozen, one skeleton per zombie, off-screen zombies
  culled, reveal smoke hidden, textures shared, only the current floor on with the next loaded in the lift, phone settings);
  the speed meter (any link + ?perf=1) with a heartbeat line; on-screen red error / graphics-reset strip; the resolution
  check no longer runs every frame.
- The user's phone (modern iPhone) at High in the wave room: 55-60 fps, slowest 5% 17-19 ms, CPU ~3 ms per frame. Default
  graphics stays Medium (players have older phones); the user tests at High as the stand-in (memory: phone-quality-testing).
- The lighting lab is NOT in the real game yet: the wing modes (wave / practice) can take the user's picks quickly (and the
  Look setting replaces ☀); the story floors each need their own lighting data and a bake, best once their layouts are final.
- NEXT, in order (the user: "continue to push it and clean it up at the same time"):
  1. DONE (2026-10-18, later): body / blood pile-up (PERF_AUDIT.md "Gore pile-up"). NEW, the user's: FINISHERS_PLAN.md
     (finishers Open -> Mark -> Press, the centre button's three looks, the guard's slam finisher, the lady as a bowling
     ball, Yola getting hurt): the next big build (decided: v3). Floors: FLOORS_REDESIGN.html (Floor 7 + additions, new Floors 6 and 5 at
     Floor 7's size), LAYOUT_REVIEW.md (which plans are current).
     The user's notes for the build (2026-10-18 night):
     - The zombie eyes (lighting lab, render/clipchars.js eyeCfg) miss the actual eyes: they float in front of the face.
       Fix their placement before using them anywhere.
     - Bed patients wake far too close: core/chapter.js bed groups have sense 3.0 m (zombies.js wakes a bed at
       dist < sense). The user: they should hear Yola once they're on screen (~8-10 m), and get up faster. The first one
       she meets gets a short camera cut on it sitting up.
     - Floor 7's every-weapon spread stays for testing (not the story's weapon order).
     - No timers anywhere. A Floor 6 "lights out" with a flashlight: rejected.
  2. Merge each zombie's ~12 parts into 1-2 draw calls, dismemberment kept.
  3. The user tests the story floors at High: combat.html?room1=1&perf=1 (36 zombies, the heavier map).
  4. Meter: 'limit gpu' is a guess on iPhones (no GPU timer, capped at 60 fps): label it as unknown there.
  5. Later: compressed textures (KTX2), free the CPU copies of geometry, floor files loaded at the lift too.
  6. Lighting into the game: wing modes first, then per floor after layouts are signed off.
  Still open from before: guard and lady finishers, the ~3x-speed shamble, deaths in chair / bed, the acid rework, the
  pacing plan (mixed beds, objective pressure, WC + janitor rooms, motivated spawns), intake lamp, painted props.

STATUS 2026-10-18 late (combat chat, the lighting test area; committed 9c26e92..c55971b; since deployed and pushed):
- Built: the lighting lab, combat.html?mode=calm&demo=lighting (panel "Plan upgrades"), every upgrade the user picked on its own
  switch: A baked floor light (blender/bake_wing_floor.py, Cycles; re-export with game.lightkit.exportBake()), B room light on
  characters, C light fittings as data (flicker states), D polished floor, E contact shadows, F halos, G floor mood (teal / sodium
  / red), H film finish, muzzle flash light, EXIT signs, zombie eyes (gold / red / green / white). Code: render/lightkit.js,
  looks.js (MoodShader), clipchars.js (eyes). Nothing is on in the real game yet.
- WAITING ON THE USER: they are testing the lab. Next, from their verdict: which upgrades go into the game (and per floor), the
  eyes' size / colour, the bake strength (lightkit.js BAKE.k 2.2, fill 0.3); then deploy on their say-so.

STATUS 2026-10-18 evening (combat chat): deployed at fb7ff11; local commits since (not pushed): finishers (ed954a1..9702184).
- Done: guard walk/turns + elbow-hinged torn arm, per-weapon blood, hospital zombies (IV, wheelchair, surgeon, bed patients with the
  Animation Hub bed rise), solid shovable drip stands/wheelchairs, practice room on real surfaces + emergency light, finishers for
  walkers (combat.html?mode=calm&demo=execute; Tuning > Finishers; no on-screen word "execution").
- Next: guard and lady finishers; the pacing plan (https://claude.ai/artifact/6CPnvBMzobo6qKCQPjWxh7): mixed beds, objective-room
  pressure, WC + janitor rooms, motivated spawns, acid rework, cheap lighting; shamblers at ~3x speed; deaths in chair/bed.

STATUS 2026-10-18 (later the same day, commits fedf28e..3a5131c; pushed to GitHub and deployed to production at 20b51e4):
- DONE 1 (ponytail: the UAL attack clips have no hair tracks; the mixer wrote NaN into Hair1's position: render/hairsway.js
  now restores the hair bones' rest place each frame), 2 (render/clipchars.js YolaView.headLook), 4 + 5 (the guard
  reworked by the user's new brief: the shield planted in the world, his hands IK-held on it, his arm tears off on it, he
  flails one-armed, then clubs with the torn arm; slam launch / impact / smoke / cracks / small shake), 6, 7, 8, 9, 10 (the
  lady: aim, lock, build-up to 6.2 m/s, close smash), 11, 12, 15, 16 (a perfect dodge of a walker's pounce: execute).
- 13, 14: done by another chat (the crowbar's own hub combo, uncommitted in that chat's files).
- OPEN 3: the sledgehammer swings with a one-handed sword combo (its free arm flies off the handle, GRIPS_HANDOFF.md OPEN):
  needs a two-handed heavy attack, picked by the user and checked in the Rig Lab (never KayKit).
- Also new: nurse scrub variations to choose from (combat.html?mode=calm&demo=nurses; main.js SCRUBS).

Context: COMBAT_POLISH_LOG.md round 20 (what was built).

## Yola
1. **Ponytail disappears during many melee attacks.** Find which attack clips / layers hide or collapse the hair bones
   (render/hairsway.js, the attack overlays in render/clipchars.js; check every melee weapon's attacks).
2. **Her head doesn't face where she is looking**: it looks weird. The head should turn toward the aim direction.
3. **She holds the sledgehammer badly**: the user doesn't like the hold (Rig Lab fit / hand placement for the
   sledgehammer; judge against the reference rig, never toward a self-measured number).

## The guard's slam
4. **On impact the shield does not look driven into the floor**: it stays but still sort of moves, which takes away the
   stuck feeling. Tune the stuck pose so the shield is planted solid (no drift from the heave animation; the arms pull
   at a fixed shield).
5. **Visual effects to sell the slam:** an effect when he launches; a STRONG effect when he hits the ground; a small
   screen shake; cracks in the floor around him and around the shield; impact smoke / dust. "Things like that."

## Dodge and threat cues
6. **The Dodge button should be a real action button: larger, and centred on the phone.**
7. **Basic zombies don't need dodge-worthy attacks**: they can have plain basic attacks (no dodge treatment).
8. **The red floor indicator** for the special zombies (lunge, charge, leap) should be **more subtle**.

## The big lady (the charger)
9. She **doesn't run fast enough** and doesn't look like she **builds up speed and charges**.
10. **Like the Butcher in Diablo 3:** she has attacks when you're close, and there is a **moment where she sets up / aims
    the direction of her charge** (the player sees where it's going and has time to react).

## Slow motion and crits
11. **Slow motion doesn't feel good.** Idea: **Yola moves slightly faster than the rest of the world** during slow motion.
12. **Better visual effects for crits** when she hits during slow motion.

## The crowbar
13. **Too long a delay after its 4th attack** before she can attack again. Use the **same timing as the bat**, but the
    crowbar's attacks about **20% faster** than the bat's, so it feels different.
14. If another combo can be built from the animations we have for the crowbar, the user would like to consider it.

## Floor breaches
15. **Zombies crawling out of the ground don't feel good yet** (the emergence needs work: timing, look, readability).

## Idea (the user: "just a thought")
16. A **perfect dodge against a basic zombie** could become more of an **execute**: change the animation slightly and use
    the **full-body explosion kill** (render/gibburst.js, the burst the user loved) for it.
