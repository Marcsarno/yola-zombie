# Render Yola playing an action from fixed views (Workbench, fast) with a proxy bat in the right-hand socket, for
# side-by-side comparison with the reference video frames.
# usage: blender -b work.blend --python render_check.py -- <action> <outdir> <frames "1,5,9"> <views "left,right,top">
import bpy, sys, os, math, json
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
name, out, frames, views = argv[0], argv[1], [int(x) for x in argv[2].split(',')], argv[3].split(',')
MODE = argv[4] if len(argv) > 4 else 'socket'
sc = bpy.context.scene
arm = bpy.data.objects['YOLA']
for o in sc.objects:
    keep = o == arm or o.parent == arm
    o.hide_render = not keep or o.name == 'yola_decimated_old'
    if o.type == 'CAMERA' or o.type == 'LIGHT': o.hide_render = True
ad = arm.animation_data
for t in ad.nla_tracks: t.mute = True
act = bpy.data.actions[name]; ad.action = act
try: ad.action_slot = act.slots[0]
except Exception: pass
P = lambda n: arm.pose.bones['mixamorig:' + n]
# frame of the character in world space (rest), as in the retarget
R = lambda n: arm.matrix_world @ arm.data.bones['mixamorig:' + n].head_local
up = (R('Head') - R('Hips')).normalized(); left = (R('LeftUpLeg') - R('RightUpLeg')); left = (left - up * left.dot(up)).normalized(); fwd = left.cross(up)
H = (R('Head') - R('LeftFoot')).length * 1.15  # world height of the character
# a proxy bat: a thin cylinder rebuilt each frame from the right-hand socket (as the game does)
SOCK = Vector((0.972, 0, -0.233)).normalized()
bpy.ops.mesh.primitive_cylinder_add(radius=H * 0.018, depth=H * 0.48); bat = bpy.context.object; bat.name = 'proxy_bat'
mat = bpy.data.materials.new('batm'); mat.diffuse_color = (0.55, 0.32, 0.12, 1); bat.data.materials.append(mat)
cam_data = bpy.data.cameras.new('cc'); cam = bpy.data.objects.new('cc', cam_data); sc.collection.objects.link(cam); sc.camera = cam
cam_data.type = 'ORTHO'; cam_data.ortho_scale = H * 2.2
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
RES = [int(v) for v in os.environ.get('RC_RES', '360x300').split('x')]  # RC_RES=WxH for bigger renders
sc.render.resolution_x, sc.render.resolution_y = RES; sc.render.film_transparent = False
sc.world.color = (0.55, 0.55, 0.57) if sc.world else None
os.makedirs(out, exist_ok=True)
for f in frames:
    sc.frame_set(f)
    hb = P('RightHand'); hm = arm.matrix_world @ hb.matrix
    gr = (hm.to_translation() + (arm.matrix_world @ P('RightHandMiddle1').head)) / 2
    if MODE == 'path':  # the weapon path the hold fit wrote on the action (knob + direction, armature space)
        wp = json.loads(act['weapon_path'])['frames'][f - int(act.frame_range[0])]
        kn = arm.matrix_world @ Vector(wp['knob']); d = (arm.matrix_world.to_3x3() @ Vector(wp['dir'])).normalized()
        L = (0.84 / 1.62) * arm.matrix_world.to_scale().x
        bat.location = kn + d * L / 2; bat.rotation_mode = 'QUATERNION'; bat.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        bat.scale = (1, 1, L / (H * 0.48))
        hip = arm.matrix_world @ P('Hips').head
        tgt = Vector((hip.x, hip.y, (arm.matrix_world @ P('LeftFoot').head).z)) + up * H * 0.45
        for v in views:
            dirv = {'left': -left, 'right': left, 'front': -fwd, 'top': -up}[v]
            cam.location = tgt - dirv * H * 3; upv = fwd if v == 'top' else up
            z = -dirv; x = upv.cross(z).normalized(); y = z.cross(x)
            cam.matrix_world = Matrix.Translation(cam.location) @ Matrix((x, y, z)).transposed().to_4x4()
            sc.render.filepath = os.path.join(out, f'{v}_{f:04d}.png'); bpy.ops.render.render(write_still=True)
        continue
    if MODE == 'grips':  # the bat runs through both grips: bottom hand (left) -> top hand (right), outward past the top hand
        gl = ((arm.matrix_world @ P('LeftHand').head) + (arm.matrix_world @ P('LeftHandMiddle1').head)) / 2
        d = (gr - gl).normalized() if (gr - gl).length > 1e-4 else Vector((0, 0, 1))
    else:
        d = (hm.to_3x3().normalized() @ SOCK).normalized()
    bat.location = gr + d * H * 0.2; bat.rotation_mode = 'QUATERNION'; bat.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    hip = arm.matrix_world @ P('Hips').head
    tgt = Vector((hip.x, hip.y, (arm.matrix_world @ P('LeftFoot').head).z)) + up * H * 0.45
    for v in views:
        dirv = {'left': -left, 'right': left, 'front': -fwd, 'top': -up}[v]  # direction the camera looks along
        cam.location = tgt - dirv * H * 3
        upv = fwd if v == 'top' else up
        z = -dirv; x = upv.cross(z).normalized(); y = z.cross(x)
        cam.matrix_world = Matrix.Translation(cam.location) @ Matrix((x, y, z)).transposed().to_4x4()
        sc.render.filepath = os.path.join(out, f'{v}_{f:04d}.png'); bpy.ops.render.render(write_still=True)
print('RENDERED', len(frames) * len(views))
