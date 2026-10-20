# (check) a three-quarter Eevee render of everything in hood_props.blend, roughly as the game camera sees it.
#   blender -b blender/hood/hood_props.blend --python blender/hood/render_props.py -- <out.png>
import bpy, sys, math
out = sys.argv[sys.argv.index('--') + 1:][0]
sc = bpy.context.scene
cam = bpy.data.objects.new('C', bpy.data.cameras.new('C')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 22
cam.location = (18 + 18, -22, 18); cam.rotation_euler = (math.radians(55), 0, math.radians(40))
sun = bpy.data.objects.new('S', bpy.data.lights.new('S', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 3; sun.rotation_euler = (math.radians(45), 0, math.radians(-40))
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
bpy.ops.mesh.primitive_plane_add(size=60, location=(18, 0, 0))
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1400, 700
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('rendered', out)
