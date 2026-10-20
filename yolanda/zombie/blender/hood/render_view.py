# Renders the neighbourhood from the game's fixed camera (CAMERA_SPEC.md) at a world point, for checks.
#   blender -b <file.blend> --python blender/hood/render_view.py -- <out.png> <x> <z> [width_m] [engine] [w] [h]
# x, z: three.js world (x east, z south). width_m: floor across the frame at the target (7.2 on a phone; larger = wider).
import bpy, sys, math

A = sys.argv[sys.argv.index('--') + 1:]
OUT, TX, TZ = A[0], float(A[1]), float(A[2])
WM = float(A[3]) if len(A) > 3 else 7.2
ENGINE = A[4] if len(A) > 4 else 'EEVEE'
RW, RH = (int(A[5]), int(A[6])) if len(A) > 6 else (540, 960)
sc = bpy.context.scene
cam = sc.camera or bpy.data.objects.new('GameCam', bpy.data.cameras.new('GameCam'))
if cam.name not in sc.objects: sc.collection.objects.link(cam); sc.camera = cam
vfov = math.radians(50); a = RW / RH
hfov = 2 * math.atan(math.tan(vfov / 2) * a)
D = WM / (2 * math.tan(hfov / 2))
yaw, pitch = math.radians(35), math.radians(42)
px, py, pz = TX + math.sin(yaw) * math.cos(pitch) * D, math.sin(pitch) * D, TZ + math.cos(yaw) * math.cos(pitch) * D
cam.location = (px, -pz, py)
# aim at (TX, 0.6, TZ) like main.js updateCamera
dx, dy, dz = TX - px, 0.6 - py, TZ - pz
down = math.atan2(-dy, math.hypot(dx, dz))
cam.rotation_mode = 'XYZ'
cam.rotation_euler = (math.pi / 2 - down, 0, math.atan2(-dx, -dz) if False else math.radians(35))
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = vfov
cam.data.clip_start = 0.1; cam.data.clip_end = 400
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = RW, RH, 100
try: sc.render.engine = 'BLENDER_EEVEE_NEXT' if ENGINE == 'EEVEE' else ENGINE
except TypeError:
    try: sc.render.engine = 'BLENDER_EEVEE'
    except TypeError: pass
if sc.render.engine == 'CYCLES': sc.cycles.samples = 64; sc.cycles.device = 'GPU'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('rendered', OUT, sc.render.engine)
