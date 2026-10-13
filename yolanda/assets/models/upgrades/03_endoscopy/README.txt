HOSPITAL UPGRADE ASSETS
Meters. GLB Y-up. Front +Z in GLB. Ground-center origins except standard/advanced surgical lights use ceiling-mount origin.
Each GLB includes named parts, articulation pivot empties and interaction anchors. Pivots are an integration starting point, not animated or rigged. Materials are shared simple PBR colors; no textures.
Runtime files contain equipment only. Overview ground/cameras/lights are preview-only and excluded from GLBs. Collision footprints are proposals in manifest, separate from geometry. Cable and articulation clearance should be considered by game integration.
Source .blend preserves editable separated meshes and preview layout. To edit an asset in place, reset its top-level root location to zero; GLBs were exported before layout offsets.
No game files changed. New tier interpretations of the approved visual concepts. Existing CRNA Core Equipment and Endoscopy Tower originals were retrieved and visually compared; those source files are preserved unchanged. Middle-tier colors and rounded housings follow the existing cream, teal and blue design language; these are new meshes, not replacements for the originals.

Runtime optimization: static meshes consolidated under their transform parent. Articulation groups and anchors remain separate. Source .blend intentionally retains separated editable parts. Run optimize_runtime.py after build_core.py to reproduce optimized GLBs. GLB primitive counts approximate draw calls before engine-side batching.

Reproduction order: build_core.py -- 03_endoscopy; run repair_details.py -- 03_endoscopy; then optimize_runtime.py -- 03_endoscopy and refine_previews.py -- 03_endoscopy. Invoke each with Blender background --python. All scripts accept the sheet name after --.
Fictional stylized game assets; no clinical functionality or clinical accuracy claim. Displays are decorative geometry.

Runtime optimization: static meshes consolidated under their transform parent. Articulation groups and anchors remain separate. Source .blend intentionally retains separated editable parts. Run optimize_runtime.py after build_core.py to reproduce optimized GLBs. GLB primitive counts approximate draw calls before engine-side batching.

Runtime optimization: static meshes consolidated under their transform parent. Articulation groups and anchors remain separate. Source .blend intentionally retains separated editable parts. Run optimize_runtime.py after build_core.py to reproduce optimized GLBs. GLB primitive counts approximate draw calls before engine-side batching.
