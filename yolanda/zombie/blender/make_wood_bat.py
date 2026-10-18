# Wood bat from the hospital pack's aluminum bat: same mesh and grip markers, a procedural ash-wood finish baked to textures
import bpy, sys, os, math
src, out_glb, out_dir = sys.argv[-3], sys.argv[-2], sys.argv[-1]
P_ = dict(ring_off=(0.095, 0.028), ring_lean=0.035, ring_freq=210.0)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
bat = bpy.data.objects['Bat_Body']; root = bpy.data.objects['AluminumBat']; root.name = 'WoodBat'; bat.name = 'Bat_Wood'
me = bat.data
zs = [v.co.z for v in me.vertices]; print('local z', round(min(zs), 3), round(max(zs), 3))
# the old materials as a mask for the shader (R: the rubber grip, G: the teal band), then one material on every face
reg = me.color_attributes.new('region', 'FLOAT_COLOR', 'CORNER')
for p in me.polygons:
    c = (1, 0, 0, 1) if p.material_index == 1 else (0, 1, 0, 1) if p.material_index == 2 else (0, 0, 0, 1)
    for li in p.loop_indices: reg.data[li].color = c
for p in me.polygons: p.material_index = 0
bpy.context.view_layer.objects.active = bat; bat.select_set(True)
while len(bat.material_slots) > 1:
    bat.active_material_index = len(bat.material_slots) - 1; bpy.ops.object.material_slot_remove()
# fresh UVs for the bake (the finish is procedural in object space, so any layout works)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
bpy.ops.uv.select_all(action='SELECT'); bpy.ops.uv.pack_islands(rotate=True, margin=0.006)
bpy.ops.object.mode_set(mode='OBJECT')

mat = bpy.data.materials.new('WoodProc'); mat.use_nodes = True; bat.data.materials[0] = mat
nt = mat.node_tree; N = nt.nodes; Lk = nt.links; N.clear()
def node(t, **kw):
    x = N.new(t)
    for k, v in kw.items(): setattr(x, k, v)
    return x
def M(op, a=None, b=None, v0=None, v1=None):
    m = node('ShaderNodeMath', operation=op)
    if v0 is not None: m.inputs[0].default_value = v0
    if v1 is not None: m.inputs[1].default_value = v1
    if a is not None: Lk.new(a, m.inputs[0])
    if b is not None: Lk.new(b, m.inputs[1])
    return m.outputs[0]
def noise(P, scale_xyz, detail=3, rough=0.5):
    mp = node('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale_xyz; Lk.new(P, mp.inputs[0])
    nz = node('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = detail; nz.inputs['Roughness'].default_value = rough
    Lk.new(mp.outputs[0], nz.inputs['Vector']); return nz.outputs['Fac']
def rng(v, a, b, lo=0.0, hi=1.0, clamp=True):
    r = node('ShaderNodeMapRange', clamp=clamp); r.inputs[1].default_value = a; r.inputs[2].default_value = b; r.inputs[3].default_value = lo; r.inputs[4].default_value = hi
    Lk.new(v, r.inputs[0]); return r.outputs[0]
def mix(fac, c_a, c_b):
    m = node('ShaderNodeMix', data_type='RGBA', blend_type='MIX')
    if isinstance(fac, float): m.inputs['Factor'].default_value = fac
    else: Lk.new(fac, m.inputs['Factor'])
    for i, c in ((6, c_a), (7, c_b)):
        if isinstance(c, tuple): m.inputs[i].default_value = c
        else: Lk.new(c, m.inputs[i])
    return m.outputs[2]

tc = node('ShaderNodeTexCoord'); P = tc.outputs['Object']
sep = node('ShaderNodeSeparateXYZ'); Lk.new(P, sep.inputs[0]); X, Y, Z = sep.outputs
attr = node('ShaderNodeAttribute', attribute_name='region'); asep = node('ShaderNodeSeparateColor'); Lk.new(attr.outputs['Color'], asep.inputs[0])
GRIP, BAND = asep.outputs[0], asep.outputs[1]

# ---- WOOD: ash, ring-porous. Rings around a log axis 4.5 cm off the bat's and leaning, so the face shows cathedral arches
# and the edge straight lines; ring widths irregular; each ring starts with a dark band of open pores (the visible grain
# lines of ash), then smooth light latewood ----
wob = M('MULTIPLY', noise(P, (10, 10, 0.9), 4), v1=0.007)
dx = M('SUBTRACT', X, M('ADD', M('MULTIPLY', Z, v1=0.07), v1=0.045))
dy = M('SUBTRACT', Y, v1=0.012)
r0 = M('SQRT', M('ADD', M('MULTIPLY', dx, dx), M('MULTIPLY', dy, dy)))
r = M('ADD', M('ADD', r0, wob), M('MULTIPLY', M('SINE', M('MULTIPLY', r0, v1=47.0)), v1=0.0022))  # (uneven ring widths)
ring = M('FRACT', M('MULTIPLY', r, v1=165.0))  # ~6 mm per ring, varying
ew = M('MULTIPLY', rng(ring, 0.0, 0.05), rng(ring, 0.24, 0.12))  # earlywood pore band
grad = rng(ring, 0.2, 1.0, 0.0, 1.0)  # latewood darkens a little toward the next ring
streak = M('MAXIMUM', rng(noise(P, (380, 380, 5), 3), 0.50, 0.66), M('MULTIPLY', rng(noise(P, (160, 160, 2.5), 2), 0.58, 0.70), v1=0.6))  # pore streaks along the length
porefield = M('MULTIPLY', streak, M('ADD', M('MULTIPLY', ew, v1=0.8), v1=0.38))
# colour (linear): light honey latewood, darker amber pore band, a warm lacquer over all
c_light, c_late, c_ew, c_pore = (0.44, 0.215, 0.07, 1), (0.33, 0.15, 0.045, 1), (0.19, 0.08, 0.022, 1), (0.075, 0.03, 0.008, 1)
col = mix(M('MULTIPLY', grad, v1=0.6), c_light, c_late)
col = mix(M('MULTIPLY', ew, v1=0.75), col, c_ew)
col = mix(M('MULTIPLY', porefield, v1=0.95), col, c_pore)
tone = rng(noise(P, (6, 6, 2.2), 3), 0.3, 0.7, 0.82, 1.12)  # broad drift along the billet
cv = node('ShaderNodeCombineColor'); [Lk.new(tone, cv.inputs[i]) for i in range(3)]
mul = node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); mul.inputs['Factor'].default_value = 1.0; Lk.new(col, mul.inputs[6]); Lk.new(cv.outputs[0], mul.inputs[7]); col = mul.outputs[2]
# handling: a darker, worn band where the hands leave the tape; scuffs on the barrel's sweet spot
hand = M('MULTIPLY', rng(Z, 0.22, 0.12), rng(noise(P, (50, 50, 10), 5, 0.6), 0.40, 0.65))
col = mix(M('MULTIPLY', hand, v1=0.45), col, (0.12, 0.05, 0.016, 1))
scuff = M('MULTIPLY', M('MULTIPLY', rng(Z, 0.46, 0.54), rng(Z, 0.70, 0.62)), rng(noise(P, (70, 70, 30), 4), 0.68, 0.76))
col = mix(M('MULTIPLY', scuff, v1=0.22), col, (0.30, 0.26, 0.22, 1))
wood_col = col
wood_rough = M('ADD', M('ADD', M('MULTIPLY', porefield, v1=0.18), v1=0.22), M('ADD', M('MULTIPLY', hand, v1=0.2), M('MULTIPLY', scuff, v1=0.25)))
wood_h = M('SUBTRACT', v0=1.0, b=M('ADD', M('MULTIPLY', porefield, v1=0.9), M('MULTIPLY', ew, v1=0.25)))

# ---- GRIP TAPE: black cloth athletic tape on the modelled wrap; a fine weave, a little lighter where it is worn ----
weave = rng(noise(P, (700, 700, 700), 2), 0.35, 0.65)
wear = rng(noise(P, (90, 90, 40), 5, 0.6), 0.55, 0.75)
tape_col = mix(M('ADD', M('MULTIPLY', weave, v1=0.05), M('MULTIPLY', wear, v1=0.35)), (0.016, 0.016, 0.018, 1), (0.08, 0.075, 0.07, 1))
# the end band by the knob: a red stripe of tape
tape_col = mix(M('MULTIPLY', BAND, v1=0.0), tape_col, (0.33, 0.02, 0.018, 1))
tape_rough = M('SUBTRACT', v0=0.86, b=M('MULTIPLY', wear, v1=0.12))
tape_h = M('MULTIPLY', weave, v1=0.15)

tapemask = M('MINIMUM', M('ADD', GRIP, BAND), v1=1.0)
col = mix(tapemask, wood_col, tape_col)
rgh = node('ShaderNodeMix', data_type='FLOAT'); Lk.new(tapemask, rgh.inputs['Factor']); Lk.new(wood_rough, rgh.inputs[2]); Lk.new(tape_rough, rgh.inputs[3])
hgt = node('ShaderNodeMix', data_type='FLOAT'); Lk.new(tapemask, hgt.inputs['Factor']); Lk.new(wood_h, hgt.inputs[2]); Lk.new(tape_h, hgt.inputs[3])
bump = node('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.0005; Lk.new(hgt.outputs[0], bump.inputs['Height'])
bsdf = node('ShaderNodeBsdfPrincipled'); outn = node('ShaderNodeOutputMaterial')
Lk.new(col, bsdf.inputs['Base Color']); Lk.new(rgh.outputs[0], bsdf.inputs['Roughness']); Lk.new(bump.outputs[0], bsdf.inputs['Normal'])
Lk.new(bsdf.outputs[0], outn.inputs[0])


# ---- bake ----
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
def bake(kind, name, size, colorspace, **kw):
    img = bpy.data.images.new(name, size, size, alpha=False); img.colorspace_settings.name = colorspace
    tn = N.new('ShaderNodeTexImage'); tn.image = img
    for x in N: x.select = False
    tn.select = True; N.active = tn
    sc.render.bake.margin = 12
    bpy.ops.object.bake(type=kind, **kw)
    img.filepath_raw = os.path.join(out_dir, name + '.png'); img.file_format = 'PNG'; img.save()
    N.remove(tn); return img
for o in bpy.data.objects: o.select_set(False)
bat.select_set(True); bpy.context.view_layer.objects.active = bat
cimg = bake('DIFFUSE', 'woodbat_color', 2048, 'sRGB', pass_filter={'COLOR'})
rimg = bake('ROUGHNESS', 'woodbat_rough', 1024, 'Non-Color')
nimg = bake('NORMAL', 'woodbat_normal', 1024, 'Non-Color')

me.color_attributes.remove(me.color_attributes['region'])  # (glTF would export it as vertex colours)
# ---- the game material: the baked maps ----
m2 = bpy.data.materials.new('Wood'); m2.use_nodes = True; nt2 = m2.node_tree
b2 = next(x for x in nt2.nodes if x.type == 'BSDF_PRINCIPLED')
def tex(img):
    t = nt2.nodes.new('ShaderNodeTexImage'); t.image = img; return t
nt2.links.new(tex(cimg).outputs[0], b2.inputs['Base Color'])
nt2.links.new(tex(rimg).outputs[0], b2.inputs['Roughness'])
nm = nt2.nodes.new('ShaderNodeNormalMap'); nt2.links.new(tex(nimg).outputs[0], nm.inputs['Color']); nt2.links.new(nm.outputs[0], b2.inputs['Normal'])
b2.inputs['Metallic'].default_value = 0.0
bat.data.materials[0] = m2
bpy.data.materials.remove(mat)
for img in list(bpy.data.images):
    if img not in (cimg, rimg, nimg): bpy.data.images.remove(img)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=90, export_yup=True, export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'wood_bat.blend'))
print('DONE', os.path.getsize(out_glb))
