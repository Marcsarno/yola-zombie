ASSESSMENT + RECOVERY | CLINICAL IDENTITY KIT
Version 1 | Blender 4.3.2 | 12 October 2026

CONTENTS
25 individual GLBs, two room placement presets, asset measurements and QA records.
Eight new clinical assets: heart, lungs and airway graphic plaques; service headwall
with connection covers and reading light; wall exam set; assessment, recovery and
bay signs. One derived corner closure solves the existing wall-module butt joint.
All furniture, construction walls/floors/doors, freestanding privacy screen, monitor, computer,
and handwash fixtures are reused. They are included so this package is standalone.
No combined room mesh is required. No game code or live game was changed.

PLACEMENT AND SCALE
Units: metres. Existing 1.25 m logical grid; 2.5 m walls; 2.8 m wall height.
Both examples reserve 5 x 5 m (four by four logical cells). These are modular room
presets, not a demand that all rooms have this size. Keep assets at scale 1; add
or remove complete construction modules and move instances to fit room grids.
Do not nonuniformly scale the whole room, furniture, icons or letters.

room_presets.json lists asset path, stable instance ID, scale, translation and
rotation for each object in each room. Both Blender and glTF positions are given.
Blender is Z-up with -Y forward. glTF is Y-up with +Z forward.
Convert position [x,y,z] Blender to [x,z,-y] glTF. A Blender Z rotation maps to the
same positive glTF Y rotation. Use only one coordinate representation.

PIVOTS AND MOUNTING
New Clinical_Art_*, Clinical_Service_Headwall, Clinical_Wall_Exam_Set and
Clinical_Sign_* roots use the existing wall-face-at-floor convention. Back faces
are local Blender Y=0 and the visible depth projects toward -Y. Mounting height
is already baked in; do not add another height to these roots.
Back wall centerline Y=2.50 m, interior face Y=2.42 m.
Left wall fixtures use X=-2.42 m and a +90 degree Blender Z rotation.
Art center: Z=2.13; exam set center: about 1.36; service panel: 1.40;
reading light: 1.86; sign center: 2.38 m.

Reused Clinical_Handwash_Basin, Clinical_Soap_Dispenser and
Clinical_Towel_Dispenser use LOCAL MOUNTING origins, not floor origins.
The preset deliberately adds Z=0.92, 1.35 and 1.82 m respectively.
The handwash cabinet is floor-origin. The reused desktop computer already has
its bottom at Z=.75 m in its file; add only .062 m to rest on the .812 m desk.
Other furniture keeps its original ground-center pivot. The freestanding privacy screen keeps its original ground-center pivot, with
visible posts and floor bases. There are no ceiling-dependent objects or tracks.
Construction_Corner_Closure is a thin derived wall section plus a 6 mm top cap;
its prescribed placement covers only the exposed butt-joint corner. It is not
an independently scalable wall module.

GAME INTEGRATION
Load/cache each GLB once and instance or clone it according to the JSON.
For existing integrated copies, reuse your already-loaded asset with the same
name/hash rather than spawning a second copy. dependency_provenance.json records
source kit and hashes. Signs are mesh text, so no runtime font is needed.
New clinical details have standard glTF PBR solid-color materials, no textures,
no custom shaders and no lights. Reused assets retain embedded original atlases.
All materials and textures travel inside the GLB, with no external file paths.

Use ordinary room-wall collision for shallow wall fixtures. Exclude wall signs,
art, headwall, render camera/light objects from floor navigation
obstacles. Derive simple compound furniture colliders rather than using the
whole-room AABB as a blocker. The privacy screen is a static freestanding asset;
this package does not provide animation, cloth simulation or gameplay logic.
The computer rests on the desk and fixtures deliberately contact their supports.
The bedside cabinet clears the freestanding screen.
Both presets reserve a full 1.25 m tile-wide entry lane and separate interaction
approaches in navigation_reserved_blender_xy. Preserve these clear rectangles
when adding other furniture. The consultation station sits front-right to keep
the left entrance open. These are layout reservations, not a generated navmesh.

VALIDATION
Every GLB was imported into a fresh Blender scene. Exact vertex bounds, triangle
counts, mesh counts, materials, texture counts and SHA-256 values are in
asset_manifest.json. Rendered game, front and side views use exported GLBs.
An independent review checked export structure, placement and outward normals.
These are art/integration checks, not target-device frame-rate measurements,
clinical equipment design, real-building clearance certification or accessibility
approval. The anatomy graphics and equipment are stylized game visuals.

FILES
Runtime ZIP: GLBs, presets, this README, manifests and compact QA JSON.
Preview PNGs: actual Blender renders, not the earlier illustrative concepts.
Source ZIP: editable .blend with Assessment and Recovery scenes, generator,
QA script, and the runtime inputs required for reproducible rebuilding.
Open the source .blend and select the desired scene to inspect each room.
