# Pistol (Hospital Weapons Core): hold data for switching the game to it

Prepared 2026-10-16. Nothing in `src/` or `dist/` has been changed. Section 4 lists the edits the switch needs.

## Files

- `assets/weapons/pistol_core.glb`: a byte-for-byte copy of `assets/source/weapons_in/core/core/pistol/pistol.glb` (603,448 bytes; 4,704 triangles; 8 primitives). The copy is needed because `.vercelignore` keeps `zombie/assets/source` out of the deploy.
- `tools/measure_pistol_core.mjs`: the measuring script. It is plain Node with no dependencies and reads the GLB's JSON and binary chunks itself. Run `node tools/measure_pistol_core.mjs [file.glb] [--out f.json] [--slices]`. `--slices` also prints the cut tables.
- `tools/hold/pistol_core_hold.json`: the script's output. It has every number below and a few more.

## 1. The model in the GLB's own frame

The GLB frame is glTF: +Y up, barrel +X, +Z on the gun's right side. The origin is GameGrip_R. All marker nodes are direct children of the identity root `Pistol`, so their positions are already world positions.

| | GLB position (m) |
|---|---|
| GameGrip_R | (0, 0, 0), the origin |
| GameGrip_L | (0.020, 0.010, 0) |
| Muzzle | (0.201, 0.101, 0); its +X axis = (1, 0, 0) |
| SightLine | (0.182, 0.123, 0), the top of the front sight |
| bbox | min (-0.0308, -0.043, -0.019), max (0.199, 0.123, 0.019); size 230 x 166 x 38 mm |
| Barrel | +X. The Muzzle node's +X is within 0.56 deg of the slide's PCA axis; the slide's slanted rear face tilts the PCA slightly. |
| Bore | 201 mm ahead of GameGrip_R and 101 mm above it |

## 2. The grip

| | Value |
|---|---|
| Height | from the butt at y -0.043 (magazine baseplate underside) to the top at y 0.0526. The top is the mean of two junctions: the front strap meets the trigger guard at 0.0436, and the back strap meets the tang at 0.0616. That makes 95.6 mm tall, or 100.6 mm along the axis. |
| Fist centre (GLB) | (0.0026, 0.0050, 0) |
| Axis, bottom to top (GLB) | (0.3094, 0.9509, 0) |
| Rake | 18.0 deg from vertical, with the butt swept back. A plain PCA of the grip's 906 vertices gives 20.4 deg; that is a comparison only (see below). |
| Cross-section at the fist, perpendicular to the axis | 36.8 mm wide x 42.5 mm deep. Girth (convex perimeter) is 148.8 mm. |
| Along the clean grip | 34 to 38 mm wide (34 = bare frame above the rubber panels; 38 = baseplate). 38.4 to 43.4 mm deep (it gets deeper toward the top). |
| GameGrip_R | Sits **at the grip's centre, on its axis** (1.0 mm off it), 5.5 mm below the mid-height fist centre. It is ~18 to 22 mm from every surface, so it is **not on the surface**. |
| GameGrip_L | **Inside** the grip, 6.7 mm behind the front strap: 14.9 mm forward of the axis and 10.2 mm above the fist centre. It is not a separate support-hand fist position. |

How it was measured:
1. The barrel is the slide's long axis (Pistol_Slide vertices, PCA), checked against the Muzzle node's +X. Up is +Y made perpendicular to the barrel. Side is barrel x up.
2. The rest of the mesh (Pistol_Body plus Pistol_Magazine_Art) is cut by horizontal planes every 0.5 mm, using the real triangles. The vertices alone are not enough: the extruded straps only have vertices at their ends. In each cut the pieces are grouped along the barrel, with gaps over 1 mm separating them, and the rearmost group is the grip. The grip's top is found where its front edge jumps forward (the trigger guard joins it) and where its back edge turns rearward (the tang).
3. The axis is a PCA line fitted through the centres of the 144 cuts between the baseplate (+2 mm) and the guard (-2 mm). A plain vertex PCA leans about 2.4 deg more, because the vertices bunch at the bevels and panel edges. The pack's build script (`build_pistol.py`) agrees with the fitted line: the front strap is ~20 deg, and the back strap curves from ~12 deg at the butt to ~22 deg under the tang.
4. The fist centre starts on that axis at the grip's mid height and is then centred in the cross-section cut perpendicular to the axis. That cut also gives the width, depth and girth.

I checked a side-view raster of the GLB with these points drawn on it. The axis runs down the middle of the grip, the fist centre sits mid-grip, and GameGrip_L sits just inside the front strap.

## 3. In the game's pistol frame

The game's frame is the one `makePistol` uses: barrel +Z, top +Y, +X = the gun's left.

- **Rotation from GLB to game: a pure Y turn of -90 deg.** In Three.js that is `inner.rotation.y = -Math.PI / 2`. The quaternion (x, y, z, w) is (0, -0.7071, 0, 0.7071), and game = (-z, y, x) of the GLB. The origin stays at GameGrip_R. No scale is needed: both models are in metres at real size.
- `HOLD_DEFS.pistol.grip_primary` = **[0, 0.005, 0.0026]**. This is the fist centre. Using GameGrip_R (the origin) instead would also be within ~6 mm.
- `HOLD_DEFS.pistol.shaft_axis` = **[0, 0.9509, 0.3094]**. This is the grip axis pinky to index (bottom to top), with the top leaning toward the muzzle, the same sense as the current [0, 0.9611, 0.2764].
- `support_point` = [0, 0.010, 0.020], which is GameGrip_L. It is informational only (see caveats).
- `ref_axis` (moves.js / weapons.json `placeHeld` convention) = [0, -0.3094, 0.9509]. `barrel_axis` = [0, 0, 1]. `up_axis` = [0, 1, 0].
- Muzzle = [0, 0.101, 0.201]. SightLine = [0, 0.123, 0.182]. bbox min [-0.019, -0.043, -0.0308], max [0.019, 0.123, 0.199].
- Muzzle relative to the fist centre is [0, 0.096, 0.198]. For makePistol it is [0, 0.088, 0.169], so the muzzle sits **29 mm further forward and 8 mm higher**. This is a full-size pistol, 230 mm long against makePistol's 204 mm.

### Caveats

- **The grip is wider and boxier than makePistol's.** It is 36.8 x 42.5 mm (girth 149 mm) against makePistol's 30 x 46 mm block (girth 131 mm, 12 mm rounding). A real grip is about 30 x 50 mm. The pack grip is ~7 mm wider, because 1.4 mm rubber panels sit on a 34 mm frame. It is ~3.5 mm shallower, and its edges are only bevelled 2.6 mm, so there is ~13% more girth to wrap. The current `palm` and `open` values were fitted to makePistol, so **re-fit them** with `tools/gripcheck.js fitGrip('pistol')`. Expect the fingers to need to open more.
- **The grip top is a judgement call.** Measuring from the back strap's top instead of the mean would raise the fist centre ~5 mm along the axis. A real "high hold", with the web of the hand jammed under the tang, would sit ~1 cm higher than mid height. If the hand looks low in the close-ups, slide `grip_primary` along `shaft_axis`.
- **GameGrip_L is not a support-hand fist centre.** It is a point just inside the front strap. In a two-handed pistol grip the support hand wraps the firing hand's fingers. The game already does it that way: `gripcheck` FIT_HANDS says the pistol's left hand wraps the right fist, and `pistolSupport()` is currently a no-op. Don't IK the left fist onto it as is.
- The simulated muzzle (`PISTOL_HOLD.muzzleForward 0.17 / muzzleUp 0.06` in core/weapons.js, used by `muzzleLocal`) was set for the old gun. If the simulation's muzzle should match the new rendered one, it moves ~+0.029 forward and ~+0.008 up. Verify that against `yola.muzzleWorld` in game rather than trusting this delta.
- The pistol's `shaft_axis` in `src/moves.js` (WEAPONS.pistol: [0, 0.96, -0.28]) and in `assets/moves/weapons.json` ([0, 0.9611, -0.2764]) still carries the old, wrong rake sign from before the 2026-10-16 fix in weaponModels.js. Update both when switching.
- The materials are textured PBR, metal included. The pack's README says they want an environment map. The look under the game's lighting is untested. The slide is its own node (`Pistol_Slide`) if a recoil kick is wanted later: move it along its local -X.

## 4. Code changes the switch needs (NOT made)

1. **`src/render/weaponModels.js`**: add a prep function next to `prepPumpShort`. Keep `makePistol` as the fallback.
   ```js
   // Hospital Weapons Core pistol (assets/weapons/pistol_core.glb; measured: tools/hold/pistol_core_README.md): GLB origin at
   // GameGrip_R (on the grip's axis), barrel +X, +Y up. Wrapped into makePistol's frame: barrel +Z, top +Y, origin still GameGrip_R.
   export function prepPistolCore(gltf) {
     const inner = gltf.scene, g = new THREE.Group();
     inner.rotation.y = -Math.PI / 2;
     inner.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
     g.add(inner);
     g.userData = { muzzle: inner.getObjectByName('Muzzle'), slide: inner.getObjectByName('Pistol_Slide'), gripL: inner.getObjectByName('GameGrip_L') };
     return g;
   }
   ```
2. **`src/main.js`**, the `wpnP` loads: add `loader.loadAsync('assets/weapons/pistol_core.glb')`. Destructure it as `[sgG, axeG, shellG, pistolG]`. Pass it in the YolaView weapons object, e.g. `new YolaView(scene, yg, clipdata, { shotgun: sgG, axe: axeG, shell: shellG, pistol: pistolG })`.
3. **`src/render/clipchars.js`**: import `prepPistolCore`. In the YolaView constructor, replace `this.pistol = makePistol(1);` with `this.pistol = weapons.pistol ? prepPistolCore(weapons.pistol) : makePistol(1);`. `placeWeapons` needs no change: it already places the pistol from `HOLD_DEFS.pistol` and reads `userData.muzzle`.
4. **`src/core/weapons.js` `HOLD_DEFS.pistol`**:
   ```js
   pistol: { grip_primary: [0, 0.005, 0.0026], shaft_axis: [0, 0.9509, 0.3094], support_point: [0, 0.01, 0.02], palm: { Right: 0, Left: 0 },
     open: { Right: { Index: 0.7, Middle: 0.68, Ring: 0.82, Pinky: 0.9 }, Left: 0 } }, // pistol_core.glb (tools/hold/pistol_core_README.md): the fist centre and grip axis (raked 18 deg butt-back); palm/open: re-fit (gripcheck fitGrip)
   ```
   Start from the current `palm` and `open`. Then, in `combat.html?mode=calm`, run `const C = await import('/zombie/tools/gripcheck.js?' + Date.now()); C.fitGrip('pistol')` in the console and paste the result in. Then review `C.sheet('pistol', 'idle')` and `C.sheet('pistol', 'walk')` full size, per WEAPON_HOLD_PROCESS.md. Optionally retune `PISTOL_HOLD.muzzleForward` / `muzzleUp` (caveats).
5. Optional, for the rig lab and the move library:
   - `src/viewer.js` `held.pistol`: load and prep the GLB the same way.
   - `src/moves.js` `WEAPONS.pistol`: change it to `{ label: 'Pistol', file: 'assets/weapons/pistol_core.glb', prep: 'pistolCore', hands: 'one', grip_primary: [0, 0.005, 0.0026], shaft_axis: [0, 0.9509, 0.3094], ref_axis: [0, -0.3094, 0.9509] }`, and give `weaponModel()` a `prep === 'pistolCore'` branch.
   - `assets/moves/weapons.json` pistol entry: it overrides the moves.js defaults, so it needs the same values.
6. Rebuild `dist/` (`npm run build`).
