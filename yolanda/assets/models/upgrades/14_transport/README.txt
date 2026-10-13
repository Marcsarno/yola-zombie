HOSPITAL UPGRADE BUILD — 14_transport
Actual editable Blender builds from approved concepts. Blender 4.3.2.

RUNTIME
Individual GLB files use meters and glTF +Y up. Most asset roots are ground-centered; lobby shell origin is floor surface (slab extends below it), and wall sign origins are mounting centers. Named component objects and interaction empties remain editable. Read manifest.json for exact dimensions, triangle/material/texture counts, placement anchors and stated clearances. Read clean_reimport_QA.json for measured clean Blender reimport results.

FIT / GAME STATUS
New-tier source files include generic proportion/anchor assumptions for a character approximately 1.65m tall. These are reference fit guides, not verified actual game character rigs. Standard wheelchair preserves its existing reference poses, named moving parts, pivots, and materials. No game edits, functioning upgrade code, animation, controls, physics, accessibility compliance or performance guarantees are claimed.

REUSE
Standard reception counter and waiting chair reuse original geometry and its original embedded atlas. Standard wheelchair runtime is a cleaned derivative of the supplied original, with only near-zero-area faces removed. Its untouched original GLB remains in the Source ZIP. No original Library asset was overwritten. Lobby assembly uses the exact sheet 01 reception assets as instances; it does not introduce duplicate reception builds. Keep sheet 01 alongside sheet 12 for runtime placement dependencies.

SOURCE
The separate Source ZIP contains an editable .blend, build scripts, and their required reused mesh dependencies. Fit proxies, where present, are a separate hidden-render wireframe collection and are excluded from runtime exports. Source build scripts rebuild the assets and actual previews when invoked with Blender --background --python.
