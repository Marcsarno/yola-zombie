HOSPITAL UPGRADE ART | 06_prep_airway

Three visual tiers: Starter, Standard, Advanced. These are art assets, not implemented gameplay, upgrade logic, collision code, clinical mechanics, or medical training.

IMPORT
Individual GLBs are self-contained. Units are meters, glTF is Y-up. Model root is at floor height Y=0. Front is +Z in glTF / -Y in Blender. No scene, room, or floor is bundled into the runtime GLBs. Import each asset separately and place using its root. Named mesh parts and ANCHOR nodes are retained. Do not derive object placement from presentation camera positions.

Starter uses exposed clean metal, minimal storage, humble functional shapes. Standard uses cream / teal / blue rounded furniture. Advanced gains integrated storage, larger upper shells, crowns, and additional tool organization. Standard SedaPrep and ThermaNest are adapted copies of original kit assets; source originals remain untouched. Other models are new artwork following the approved v2 direction.

PERFORMANCE / VALIDATION
manifest.json gives measured vertex bounds, glTF and Blender dimensions, triangles, materials, texture count and resolution, file size, SHA-256, named work anchors, collision suggestions, and reuse provenance. validation.json records clean factory-scene reimport checks. New modules use shared color-only PBR materials; two reused Standard assets retain an embedded atlas. See each entry rather than assuming uniform costs. Materials can be merged across instances in a game importer. Runtime static geometry is consolidated by material. Named drawer fronts and nearby pulls, cabinet doors, and work anchors remain separate. The Blender source retains detailed component editability. Actual GLB primitive counts are recorded as an estimate of draw calls.

COLLISION / INTERACTION
Use simple body boxes, compound boxes for desks/bed frames, and optionally trigger-only curtains. Do not mesh-collide small supplies or work anchors. Anchor nodes are placement suggestions, not implemented interactions. UI and labels are fictional decorative art.

SOURCE
The separate source archive contains editable Blender presentation scene, build and validation scripts, and any reused source meshes needed by the procedural workflow. The Blender overview was rendered from the actual models. Runtime archive deliberately excludes large source/render files.
