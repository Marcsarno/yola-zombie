# Zombie "adult" for the outbreak demo, rebuilt from the user-supplied patient rig (see ATTRIBUTIONS).
# Target: concept sheet "ZOMBIE (ADULT)" - big round head, short dark hair (simplified from the concept's curls), pale sage skin with mottling,
# white staring eyes with tiny pupils, open mouth with teeth, mint t-shirt with a chest blood splat, navy jeans.
# Output: one skinned mesh, one material, one baked colour+AO texture (JPEG), rig unchanged (20 bones).
# usage: python build_zombie.py -- patient.glb out.glb [variant]
import bpy, sys, os, math, random, mathutils
sys.path.insert(0, os.path.dirname(__file__))
from common import *

A = sys.argv[sys.argv.index('--') + 1:]
SRC, DST = A[0], A[1]
VARIANT = A[2] if len(A) > 2 else 'mint'
random.seed(7)
SHIRTS = {'mint': (0.50, 0.68, 0.58), 'white': (0.80, 0.80, 0.78), 'red': (0.45, 0.07, 0.06), 'scrub': (0.12, 0.30, 0.65)}
TROUSERS = {'mint': (0.025, 0.04, 0.10), 'white': (0.05, 0.07, 0.13), 'red': (0.13, 0.10, 0.09), 'scrub': (0.12, 0.30, 0.65)}

reset()
import_glb(SRC)
for o in list(bpy.data.objects):
    if o.name.startswith('STAFF_ID'):
        bpy.data.objects.remove(o)
arm = armature()
body = next(o for o in skinned_meshes() if o.name.startswith('BODY'))
head = next(o for o in skinned_meshes() if o.name.startswith('HEAD'))
hair = next(o for o in skinned_meshes() if o.name.startswith('HAIR'))

# ---- 1. proportions: bigger head, shorter chunkier legs, slight hunch baked into rest (reads "zombie" at a glance)
reproportion(arm, {'head': 1.16, 'thigh.L': (1.1, 0.93, 1.1), 'thigh.R': (1.1, 0.93, 1.1), 'chest': (1.06, 1.0, 1.06),
                   'upper_arm.L': (1.25, 1.0, 1.25), 'upper_arm.R': (1.25, 1.0, 1.25)},
             rots={'neck': (math.radians(-10), 0, 0)})
ground(arm)

# ---- 2. hair: the patient's own simple crop, re-tinted in the bake
for m in hair.data.materials:
    m.name = 'Z_HairBase'

# ---- 3. face: staring eyes, open mouth with teeth
def region(name):
    return verts_of_material(head, name)
eye_c = [centroid(head, [i for i in region('PAL_Eye_White') if head.data.vertices[i].co.x * s > 0]) for s in (1, -1)]
# open mouth: a dark oval projected onto the face (follows the curvature like a decal), plus a projected row of
# upper teeth. The original smile line is pushed just under the skin.
mouth_line = [i for i in region('PAL_Mouth') if (head.matrix_world @ head.data.vertices[i].co).z < eye_c[0].z - 0.05]
mc = centroid(head, mouth_line)
for i in mouth_line:
    v = head.data.vertices[i]; w = head.matrix_world @ v.co
    v.co = head.matrix_world.inverted() @ (w + mathutils.Vector((0, 0.006, 0)))
def decal(name, rgb, center, sx, sz, offset, cuts=4, rot=0.0):
    bpy.ops.mesh.primitive_circle_add(vertices=32, radius=1, fill_type='TRIFAN', location=(center.x, center.y - 0.2, center.z),
                                      rotation=(math.radians(90), 0, rot))
    d = bpy.context.object; d.name = name; d.scale = (sx, sz, 1)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.subdivide(number_cuts=cuts); bpy.ops.object.mode_set(mode='OBJECT')
    sw = d.modifiers.new('sw', 'SHRINKWRAP'); sw.target = head; sw.wrap_method = 'PROJECT'
    sw.use_project_y = True; sw.use_negative_direction = True; sw.use_positive_direction = True; sw.offset = offset
    apply_modifier(d, 'sw')
    bpy.ops.object.shade_smooth()
    d.data.materials.append(new_mat(name, rgb, 0.5))
    return d
mouth = decal('Z_MouthIn', (0.06, 0.008, 0.01), mathutils.Vector((mc.x, 0, mc.z - 0.012)), 0.058, 0.048, 0.0025)
teeth = [decal('Z_Teeth', (0.8, 0.76, 0.64), mathutils.Vector((mc.x + dx, 0, mc.z + 0.022 - abs(dx) * 0.12)), 0.0115, 0.011, 0.0035, 2)
         for dx in (-0.033, -0.011, 0.011, 0.033)]
mouth = join([mouth] + teeth, 'MOUTH')
bind_to_bone(mouth, arm, 'head')

# ---- 4. procedural bake materials (object space positions measured on this rig)
chest_front = mathutils.Vector((0.03, -0.17, 0.80))
def skin(mat):
    nb = NodeBuilder(mat)
    base = nb.rgb((0.33, 0.46, 0.29))
    shade = nb.rgb((0.27, 0.39, 0.24))
    n1 = nb.noise(2.2, 2, 0.4)
    c = nb.mix(base, shade, nb.ramp(n1.outputs['Fac'], 0.4, 0.75))
    sock = nb.maxm(nb.blob(tuple(eye_c[0]), 0.07, 0.03, 0.1), nb.blob(tuple(eye_c[1]), 0.07, 0.03, 0.1))
    c = nb.mix(c, nb.rgb((0.20, 0.27, 0.19)), sock)
    nb.set_color(c, 0.65)
def cloth(mat, rgb, blood_spots, rough=0.85, dirt=0.25):
    nb = NodeBuilder(mat)
    base = nb.rgb(rgb)
    n1 = nb.noise(6, 2, 0.5)
    c = nb.mix(base, nb.rgb(tuple(x * 0.85 for x in rgb)), nb.ramp(n1.outputs['Fac'], 0.5, 0.75))
    n2 = nb.noise(4, 2, 0.5)
    c = nb.mix(c, nb.rgb((0.18, 0.16, 0.12)), nb.ramp(n2.outputs['Fac'], 1 - dirt * 0.5, 1.0))
    for (p, r, st) in blood_spots:
        c = nb.mix(c, nb.rgb((0.22, 0.004, 0.006)), nb.blob(p, r, 0.004, 0.9, 34, stretch=st))
    nb.set_color(c, rough)
def flat(mat, rgb, rough=0.6, noise=0.0):
    nb = NodeBuilder(mat)
    c = nb.rgb(rgb)
    if noise:
        n1 = nb.noise(20, 3, 0.6)
        c = nb.mix(c, nb.rgb(tuple(x * (1 - noise) for x in rgb)), n1.outputs['Fac'])
    nb.set_color(c, rough)

shirt_spots = [((0.03, -0.17, 0.83), 0.11, (1.1, 1, 1.2)), ((0.07, -0.17, 0.69), 0.035, (0.6, 1, 2.4)),
               ((-0.1, -0.17, 0.95), 0.025, (1, 1, 1)), ((0.14, -0.16, 0.92), 0.02, (1, 1, 1)), ((-0.04, -0.17, 0.70), 0.018, (1, 1, 1)),
               ((-0.12, -0.15, 0.88), 0.022, (1, 1, 1)), ((0.2, 0.0, 0.93), 0.035, (1, 1, 1)),
               ((-0.05, 0.16, 0.75), 0.04, (1, 1, 1.3))]
pant_spots = [((0.1, -0.1, 0.42), 0.035, (1, 1, 1.6)), ((-0.12, -0.08, 0.2), 0.025, (1, 1, 1))]
for o in (body, head, hair, mouth):
    for m in o.data.materials:
        n = m.name
        if 'Skin' in n or 'Lip' in n: skin(m)
        elif 'Brow' in n: flat(m, (0.05, 0.05, 0.045), 0.8)
        elif 'Shirt' in n: cloth(m, SHIRTS[VARIANT], shirt_spots, 0.85, 0.12)
        elif 'Trousers' in n: cloth(m, TROUSERS[VARIANT], pant_spots, 0.9, 0.4)
        elif 'Shoes' in n: flat(m, (0.3, 0.31, 0.33), 0.7, 0.2)
        elif 'Sole' in n: flat(m, (0.16, 0.16, 0.17), 0.8)
        elif 'Hair' in n: flat(m, (0.07, 0.06, 0.055), 0.85, 0.3)
        elif 'Eye_White' in n: flat(m, (0.84, 0.84, 0.76), 0.35)
        elif 'Iris' in n: flat(m, (0.66, 0.68, 0.6), 0.35)
        elif 'Pupil' in n: flat(m, (0.02, 0.02, 0.02), 0.3)
        elif 'Glint' in n: flat(m, (0.66, 0.68, 0.6), 0.35)
        elif 'Mouth' in n and n != 'Z_MouthIn': flat(m, (0.12, 0.16, 0.1), 0.6)
        elif n == 'Z_MouthIn': flat(m, (0.05, 0.004, 0.006), 0.5)
        elif n == 'Z_Teeth': flat(m, (0.8, 0.76, 0.64), 0.4)
        elif n.startswith('Z_EyeBall'): flat(m, (0.86, 0.85, 0.77), 0.3)
        elif n.startswith('Z_EyePupil'): flat(m, (0.015, 0.015, 0.015), 0.3)

# ---- 5. reduce, join, bake
decimate(body, 0.36); decimate(head, 0.34); decimate(hair, 0.22)
print('part tris', {o.name: tris(o) for o in (body, head, hair, mouth)})
z = join([body, head, hair, mouth], 'ZOMBIE_' + VARIANT.upper())
bpy.context.scene.world = bpy.data.worlds.new('w')
bpy.context.scene.world.light_settings.distance = 0.12
img = bake_atlas(z, 1024, 1024, 0.55)
img.name = 'zombie_' + VARIANT
single_material(z, img, 'zombie_' + VARIANT, 0.72)
print('tris', tris(z), 'bones', len(arm.data.bones))
export_glb(DST)
print('wrote', DST, os.path.getsize(DST))
