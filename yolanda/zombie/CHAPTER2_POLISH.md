# Chapter 2 (Marc's neighbourhood): build and polish log

Start here for the chapter: `combat.html?mode=hood` (from the last checkpoint), `&stop=<home|curve|gate|club|lot|clubhouse|
west|grandma|playground|dock>` (start at a stop), `&hood=free` (walk the map, no story), `&bake=0` (live shadows instead of
the bake, to compare), `&shade=0.42` (how dark the baked shade gets). Code: `src/hood/`. Blender: `blender/hood/`.

Pipeline: `build_hood.py` (the old Survive world -> hood_base.blend) -> `dress_hood.py` (the remake's changes -> hood.blend)
-> `export_layout.py` (-> assets/neighborhood/hood_layout.json + hood_ground.glb) -> `bake_hood.py` (-> hood_light.jpg;
bump LIGHT_VERSION in src/hood/hood.js) -> `node tools/hood/optimize.mjs <old web/ dir>` (compressed copies in opt/). New props: `make_hood_props.py` (-> assets/neighborhood/props/hood_*.glb).
Checks: `node tools/hood/leaktest.mjs` (every stop sealed, every pickup and prompt reachable on foot);
in the page `hood.bot()` (plays the whole chapter) and `hood.sheet({name: [x, z]}, 'out')` (contact sheets in shots/).

## Build (2026-10-19/20)
The old level's 2,004 placements, ground and collision rebuilt in Blender and drawn instanced in the hospital game; the old
eight cars removed and re-placed with purpose; every stop sealed by lines of kit pieces backed by continuous collision (the
old build leaked through one gap by B05's garage and round the whole map); ten stops with waves, the script as subtitles,
pickups, seals the story opens, checkpoints; the ground light baked in Blender (no live shadows); the dock deck lifted and
the damaged rows sunk so no feet go through floors.

## Polish pass 1: environment (2026-10-20)
- Playground rebuilt (the user: "doesn't look very good"): wood-chip pad with a timber border, a play tower (two decks, a
  canopy, a slide, a ladder, a chain bridge, a climbing panel), swings with one seat hanging by a chain, a merry-go-round
  knocked off level, a sandbox, two benches (blender/hood/make_hood_props.py).
- The gate rebuilt: a steel-posted chain-link double gate, chained and padlocked, a NO TRESPASSING plate; the gate line's
  patchwork palisade is chain-link with green privacy slats and barbed wire (the boundary palisades stay).
- The plain chain-link of the lot fence, the roadblock and the dock gate read as bare posts at this camera: slatted panels.
- The vines (the user: "look like shit ... doesn't match the overall theme"): their flat green now varies over each wall in
  large patches (deep green, dusty olive, sun-dried brown runs), darker toward the ground.
- Debris along the whole route: luggage, totes, water jugs, boxes, tyres, fallen palm fronds, dead branches (155 pieces,
  never blocking, kept out of buildings, cars and fences).
- Light rebaked with all of it (the new pieces cast).

## Polish pass 2: gameplay feel (2026-10-20)
- Spawns never in sight: a wave's mark nearer than 11 m to the player (a portrait screen shows ~10 m up) gives way to the
  farthest mark of that stop.
- Supplies at every stop where people would have left them (B05-L's loot room, the garage, the lot's boat trailer and van,
  the clubhouse hall and office, the pavilion, the playground, the dock): pistol rounds, rifle rounds, first aid (taken only
  when hurt). The game's test switches (infinite health and ammo, the user's 2026-10-15 setting) still apply.
- The rifle sounds like one (the pistol's crack, louder, no pump rack): it rides on the shotgun's slot and hold.
- The gas can is seen in his hand: the house cutaway no longer erases anything within ~1 m of him (the can, a pickup at
  his feet); while a stance holds his left hand up it rides at his left side at carrying height.
- Death and retry checked: the death screen, Retry puts him at the stop's checkpoint with the seals, rifle, rounds and the
  gas where they were.

## Polish pass 3: story and presentation (2026-10-20)
- The chapter opens from black on its title (CHAPTER 2 / THE NEIGHBOURHOOD) while the radio call starts under it; every
  later stop announces itself with a banner (The curve, The gate, The parking lot ...).
- A hint only when lost (the brief: discoveries, not arrows): after 35 s on the same objective with its spot more than 10 m
  away, a small pulsing diamond with the distance, pinned to the screen edge when the spot is off screen; none while the
  job is to hold ground. Its target follows the gas can if Marc set it down somewhere.
- Marc carries the user's Hospital Radio ("07") on his belt the whole chapter.
- The ending: Marc fuels the boat (the can is used up), holds the dock, starts the motor; he stands in the boat as it pulls
  away from the dock bow-first with a wake, the last radio lines over it, then the end card.
- The practice room's control notes no longer show in the chapter.

## Polish pass 4: phone performance and robustness (2026-10-20)
Measured at the phone's settings (Medium, 1.5x pixels, 375 x 812), desktop CPU time per frame including the draw:
| stop | draw calls before -> after | triangles | CPU ms |
|---|---|---|---|
| home | 216 -> 185 | 364k | 8.2 -> 7.2 |
| gate | 296 -> 185 | 270k | 8.7 -> 7.1 |
| club | 217 -> 186 | 269k | 8.1 -> 6.6 |
| curve | 201 -> 170 | 314k | 7.9 -> 6.1 |
| lot | 152 -> 130 | 194k | 6.5 -> 6.2 |
| playground | 100 -> 36 | 56k | 6.0 -> 3.8 |
- The new props are merged to one mesh per material (the gate's leaves, chain and padlock kept apart: they move).
- The baked light was a 6.3 MB PNG under a .jpg name: now a real JPEG, 0.36 MB.
- Download diet: `tools/hood/optimize.mjs` writes compressed copies to assets/neighborhood/opt/ (the game loads them; ?opt=0
  the originals): models 58.6 -> 22.7 MB. Embedded textures 1024/512 px WebP, meshopt on positions only. Two traps found
  and avoided: dedup must not merge materials (the kit's placeholders differ only by name, and the name is the paint), and
  quantising UVs or normals breaks the kit (tile UVs rescaled into a transform the swapped materials drop; a floor decal
  went black).
- The clubhouse's roof cut-out widened (its gable's underside showed at the screen's edge inside).
- Regression: the leak test (6 story points sealed, every pickup and prompt reachable), the bot (all 10 stops, complete),
  no console errors.

## Final walk-through (2026-10-20)
Story moments checked in the game (shots/hood_final_moments.png): the rifle glinting on the loop arm after the survivor
goes down; B06-L's garage glowing warm through its broken wall with the cutters inside (the glow made bigger: it did not
read in daylight); the gate swung open and the surge coming from the roundabout; the maintenance pickup with the can; a
looter on the portico aiming; Grandma's door; Marc in the boat leaving the dock.

Still open (the user's): character models for Arianna, Lilah, Grandma, the survivors and the looters (plain markers until
then; the girls are in the lines only); wiring Marc in (Yola stands in); approving the four draft lines (LOOTER w01-w03,
"Not without Lilah"); voices; a test on the iPhone (a deploy needs the user's go).
