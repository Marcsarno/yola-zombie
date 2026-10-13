# Zombie combat benchmark: progress notes

Branch `zombie-combat` (baseline tag `baseline-supplied` = the project exactly as supplied).
Hospital game untouched: `yolanda/src`, built with `node tools/build.mjs`.

## Run
```
node yolanda/tools/serve.mjs 5173      # serves yolanda/ (also prints LAN URL for a phone on the same Wi-Fi)
cd yolanda/zombie && npm run build     # bundles src/ -> dist/combat.js
open http://localhost:5173/zombie/combat.html
```
Hospital route: http://localhost:5173/dist/Yolanda-Specialty-Medical-Center.html

## Baseline (2026-10-13)
- Hospital game builds and runs (title, opening day, career). No combat code anywhere.
- Zombie demo stopped at asset stage. zombie-a.glb rejected (childlike mint figure, no animation).
- yola.glb: 12-bone chibi rig, no hands/feet/clavicles, tray baked in -> cannot grip weapons.
- pistol/bat GLBs are primitive placeholders.
- Tripo API: logged in, 0 credits (blocker for final character meshes). Cap agreed: ~200 credits.
- "06 / Sculpted Minimal" concept image was not among the supplied files.

## Architecture
- `src/core/*`: engine-agnostic combat (no Three.js imports). Fixed 60 Hz simulation, deterministic per seed.
  Reusable in another Three.js survival game: world colliders + nav, twin-stick input state, player
  controller + action state machine, weapons (shared bat arc), hit resolution, zombie AI, encounter director.
- `src/render/*`: Three.js presentation. Procedural animation on the 20-bone master skeleton
  (root hips spine chest neck head clavicle/upper_arm/forearm/hand.L/R thigh/shin/foot.L/R).
  Feet are placed by a gait generator + two-bone IK (no skating); hands IK to weapon grips.
  Weapon transform, muzzle and hands come from one aim frame (character space) shared with the sim.
- `src/ui/*`: sticks (pointer-id capture), HUD, tuning panel.

## Characters and animation
- Yola, scrubs zombie, patient zombie: the user's Tripo models (mixamorig skeleton), decimated to 15k / 9k / 9k tris, 1K textures.
- Clips: Mixamo (free, user's Adobe login) - pistol locomotion pack, baseball hit (bat), zombie set. Raw FBX in assets/mixamo/.
- blender/retarget.py: world-space retarget with rest-pose alignment. blender/export_chars.py: GLB export + clip measurements.
- Reference check: Mixamo X Bot (assets/mixamo/reference) played beside Yola in Blender; weapon sockets calibrated on it.
- clipdata.json: bat path (socket direction per frame), hips rest, heights. glTF clip time = Blender frame / 30.

## Log
- 2026-10-13: baseline inspected, git baseline, server, Blender MCP connected, Tripo CLI logged in (0 credits).
- 2026-10-13: combat core + HUD built. Rejected stand-in models dropped. User's Tripo Yola + 2 zombies with Mixamo clips in game.
  Bat fixed via X Bot reference socket; sim/render bat agree within 3 cm. Decimated for phones. See CHECKLIST.md.
