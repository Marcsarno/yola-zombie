# Performance audit (2026-10-18, combat chat)

The user: "the last test didn't run very smooth on the phone ... can you do an audit or test to see what is straining the
system the most". Measured on this PC in the browser pane with the phone viewport (375x812, mobile user agent, so the
game's own phone settings: quality medium, pixel ratio 1.5, MSAA on, PCF soft shadows). Story game: combat.html?room1=1
(Floor 7, 36 zombies). Lab: combat.html?mode=calm&demo=lighting with the user's picks.

## Headline

The frame is spent on the CPU keeping the scene's books, not on drawing pixels. On the PC the GPU needs ~3 ms per frame
(EXT_disjoint_timer_query); the CPU side of a render is ~13 ms. A phone CPU is several times slower, so that is where
the stutter comes from. The game's dynamic resolution (main.js perfSample: drops to 0.6 when frames average > 21 ms)
cannot fix CPU work: on the phone it most likely made the picture softer without making it smoother.

## What was measured (story game, Floor 7, phone settings)

| | now | note |
|---|---|---|
| objects in the scene | 10,889 | 3,490 bones; 6,561 inside hidden groups (pooled zombies, opening sets, hidden floors) |
| per-frame transform update (scene.updateMatrixWorld) | 6.7 ms | three.js walks every object, hidden or not |
| ... skipping hidden groups | 2.2 ms | tested live |
| ... + static room pieces frozen | 0.8 ms | tested live (4,001 static objects) |
| draw calls | 242 | 72 of them the opening's revealSmoke, all at opacity 0 |
| skinned meshes drawn | 59 | 5 zombies + Yola = 6 rigs, but 59 separate skeletons (11-12 per zombie, each recomputing and uploading the same 68 bones) |
| zombies drawn off screen | 3 of 5 | every zombie part has frustumCulled = false |
| GPU per frame | 3.1 ms | half resolution: 1.7 ms |
| GPU: shadows off | -12% | PCF soft filtering on every lit pixel |
| GPU: 3 dead lights removed | -9% | the opening's SpotLight + red PointLight (intensity 0, never removed) and fx.flashLight |
| GPU: see-through layers off | -3% | |
| textures | 315 images, ~566 MB uncompressed | crna_shared_atlas uploaded 30 times, reception_graphics_atlas 10 times, steel/gunmetal/rubber several times: ~200+ MB of copies |
| JS heap | 385 MB | |
| game logic | sim 1.2 ms, zombie views 1.3 ms, Yola 0.8 ms | fine |

Lab (175 calls, GPU 2.2 ms, transforms 0.4 ms): switching any single lab effect off changes the GPU time by noise only;
the lab pays the same base cost as the game. Yola's shadow adds one small shadow pass per frame.

## Fix plan (ranked: biggest win for the least risk; none changes how the game looks)

1. **Skip hidden groups in the per-frame transform update** (6.7 -> 2.2 ms here). A hidden group's children are not
   drawn, so their matrices need not be recomputed; when a group is shown again its own update refreshes them. Check:
   code that reads matrixWorld of hidden objects (weapon tips, muzzles) uses getWorldPosition (unaffected).
2. **Freeze static room pieces** (-> 0.8 ms): matrixAutoUpdate = false on furniture/walls after placement; leave out
   anything animated (door kits, the case, partitions, the lift, screens).
3. **One skeleton per zombie**: the 11-12 parts of a zombie share the same bones; give them one Skeleton object so the
   bones are computed and uploaded once (59 -> 6 skeleton updates per frame here; more in fights).
4. **Do not draw off-screen zombies**: a per-zombie camera check (position + radius) hides the whole view; the parts
   keep frustumCulled = false only for the skinned-bounds reason.
5. **Clear the opening's leftovers after the hand-off**: revealSmoke (72 draw calls), the opening's SpotLight and red
   PointLight (remove from the scene: a light at intensity 0 still costs every pixel ~4%).
6. **Share duplicate textures** at load (same image name + size -> one texture): ~200+ MB less GPU memory; then upload
   every texture during the loading screen (renderer.initTexture) so walking into a new room never hitches on an upload.
7. **Phone settings, after 1-6**: MSAA off when the pixel ratio is 1.5 or more (the density hides the jaggies), PCF
   instead of PCF soft shadows; let dynamic resolution act only when the GPU is the limit.

Later, bigger jobs (each its own session):
- Merge each zombie's parts into one draw (12 -> 1-2 calls per zombie), keeping dismemberment by hiding triangle groups.
- Compressed textures (KTX2: ASTC/ETC2 on phones): 4-6x less texture memory, faster loads.
- Free the CPU copies of static geometry after upload (JS heap).

## Reading the phone itself

There is no on-screen meter yet (?debug=1 draws the collision boxes only). game.perfReport() in a desktop console gives
the frame-time spread, spikes, resolution, render scale and draw calls. Worth adding with the fixes: a small corner
readout (frame ms, render scale, calls) behind a URL flag, so the phone can report what it really does.

## Done (2026-10-18, fixes 1-6; same spots, same phone settings on the PC)

| | before | after |
|---|---|---|
| per-frame transform update | 6.8 ms | 0.4-0.7 ms (main.js visibleMatrixWorld + arena.js freezeStatic: 3,705 static pieces frozen) |
| skeletons computed per frame | 81 | 8 (clipchars.js: one Skeleton per zombie) |
| draw calls at the test spots | 432 | ~340 (off-screen zombies culled; the reveal smoke hidden) |
| texture images on the GPU | 315 (~566 MB) | 189 (~270 MB) (render/texshare.js; uploaded behind the loading screen) |
| whole frame, median (story mode) | 24.4 ms | 7.9 ms |
| shaders | 53 | 53 |

Checked: before/after shots match; dismemberment works; a zombie is drawn at every on-screen spot (141/141) and culled
only off screen; the lab and wave mode run without errors.
Not done, on purpose: removing the opening's two dead lights (half of fix 5). Taking a light out of the scene rebuilds
every shader: measured 2.3 s frozen on the PC at the hand-off (several seconds on a phone), far worse than the ~6% GPU
time they cost. They could be dropped only where a loading moment already hides a rebuild.

## Done (2026-10-18, later): floors in the lift, fix 7, the meter

- Only the floor being played is switched on (arena.js adoptFloors / showFloors: Floor 7 2,018 objects on, Floors 6 and 5
  1,948 off). The lift ride (screen faded) switches the next floor on and uploads its textures a few a frame
  (main.js prepFloor); on arrival only that floor stays on and the textures only the others use leave the GPU
  (settleFloor). Rides 7 -> 6 -> 7 checked: each floor complete on arrival. The floor files still all download at
  the start (loading them at the lift too would mean rebuilding the room builder per floor).
- Fix 7: phones with a sharp screen (1.5x or more) get no MSAA; phones use the plain PCF shadow filter; dynamic
  resolution drops only when the GPU is the limit (its own timer where the phone has one, else the frame's JS time)
  and gives the sharpness back when the CPU is the limit.
- The speed meter: combat.html?perf=1 (any mode): fps, frame time and its slowest 5%, CPU and GPU ms, which is the
  limit, resolution / scale / DPR / quality, AA, shadows, draw calls, triangles, GPU textures, JS memory, zombies, floor.
