ASSESSMENT FURNITURE | Approved three-tier builds

Meters. GLB Y-up, front +Z. Ground-center root pivots. No game files changed.
Individual GLBs for each type and tier. Shared PBR colors; no baked lighting.
Actual dimensions, triangle counts, materials, textures, anchors, moving part names and suggested collision/interaction footprints are in runtime/manifest.json.

STARTER: clean utilitarian open metal frames and modest beige/gray surfaces.
STANDARD: cream, teal and blue clinic forms.
ADVANCED: enclosed integrated silhouettes, cantilever IV arm, sculptural console, cocoon chair and crescent desk.

Model parts labelled MOVING are independent static meshes. ANCHOR nodes identify attachment, interaction or hinge positions. No animations, gameplay logic or physics colliders are included. Static geometry is consolidated by material. Estimated draw calls count glTF mesh primitives per scene node; actual engine batching can differ. Suggested collision footprints are advisory; use compound colliders for the crescent desk and reclining chair to preserve usable open space. Leave 0.8 m operator clearance as a starting placement guide.

Assessment items are newly constructed for the approved tier sheet; the supplied clinical furnishings package contained room accessories rather than these exam and consultation furniture models. The source generator also supports the support-equipment sheet and includes its reused inputs. All source textures are packed into the editable Blender file. No prior asset was overwritten.

The overview is composited from actual clean-import GLB Blender renders. GLB dimensions and material counts were verified after reimport. Rendered on CPU with Blender 4.3.2; no target-device frame-rate or engine-integration testing is claimed.

Source ZIP: editable .blend, build_support.py, render_cards.py, manifest and original reused GLBs needed by the generator. To regenerate only this sheet, set BUILD_SHEET=09_assessment_furniture and run blender -b -t 2 -P build_support.py. Then run blender -b -t 2 -P optimize_runtime.py to consolidate static geometry and refresh the source .blend. Generated runtime/ and preview outputs go into the sheet directory next to the script.
