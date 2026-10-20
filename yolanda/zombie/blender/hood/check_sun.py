# (check) the bake's sun direction and whether the placed models cast in a render: prints the sun's travel vector and the
# visibility settings of a sample instance.
import bpy
from mathutils import Vector
s = bpy.data.objects.get('BakeSun')
if s: print('sun travels', tuple(round(v, 3) for v in (s.matrix_world.to_3x3() @ Vector((0, 0, -1)))), 'energy', s.data.energy)
e = next((o for o in bpy.data.collections['PLACED'].objects if o.instance_collection), None)
print('instance', e.name, 'hide_render', e.hide_render, 'visible_shadow', e.visible_shadow, 'coll hide_render', e.instance_collection.hide_render)
lib = bpy.data.collections['LIB']; print('LIB hide_render', lib.hide_render)
for o in list(e.instance_collection.all_objects)[:3]: print('  member', o.name, o.hide_render, o.visible_shadow, o.visible_diffuse)
