# (check) a top-down Cycles render of the home area after bake_hood.py's setup, to see the sun's shadows directly.
import bpy, math, sys
out = sys.argv[sys.argv.index('--') + 1:][2] if len(sys.argv[sys.argv.index('--') + 1:]) > 2 else 'C:/tmp/top.png'
sc = bpy.context.scene
cam = bpy.data.objects.new('TopCam', bpy.data.cameras.new('TopCam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 60
cam.location = (35, -20, 60); cam.rotation_euler = (0, 0, 0)
sc.render.resolution_x = sc.render.resolution_y = 512; sc.cycles.samples = 16
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('top render', out)
