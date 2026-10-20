# Lists the GROUND collection's meshes with their materials and sizes (a check, prints only).
import bpy
for o in bpy.data.collections['GROUND'].objects:
    if o.type != 'MESH': continue
    d = o.dimensions
    print('%-28s %-40s %6d tris  %5.0f x %5.0f x %4.1f  uv:%s col:%s' % (o.name[:28], ','.join(s.material.name for s in o.material_slots if s.material)[:40],
          sum(len(p.vertices) - 2 for p in o.data.polygons), d.x, d.y, d.z, len(o.data.uv_layers), len(o.data.color_attributes)))
