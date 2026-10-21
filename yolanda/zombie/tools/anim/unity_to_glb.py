# Background Blender: one Unity Asset Store character FBX -> a textured GLB for the Rig Lab (local only).
# Textures come from the package's own .mat files (Unity links them by guid; guids.json maps guid -> path).
# blender -b --factory-startup --python unity_to_glb.py -- <fbx> <package Assets dir parent> <guids.json> <out.glb> [maxtex=1024]
#   default=<mat>  the .mat for meshes / materials with no match      alias=fbxMat:unityMat,...  pick a material by hand
#   rename=biped|ue  3ds Max Biped / Unreal bone names -> Mixamo names   orient=1  FBX automatic bone orientation (UE skeletons)
#   game=1  the input build_zombie.py takes: meshes joined, mixamorig: names, the head bone set upright, 1.0 unit tall
# The package first: unpack_unitypkg.py <pkg> <dir> (models + textures only) and guidmap.py <pkg> <guids.json>.
# (2026-10-20, the Unity Asset Store zombies; the Zombie Male AAB recipe: rename=ue game=1 orient=1, then
#  build_zombie.py ... --extra scratch=ual2:Zombie_Scratch,knockback=ual2:Hit_Knockback --no-normals --opaque ZombieMale_Shirt_MAT_V1)
import bpy, sys, os, re, json

argv = sys.argv[sys.argv.index('--') + 1:]
FBX, ROOT, GUIDS, OUT = argv[:4]
DEFAULT = next((a.split("=",1)[1] for a in argv[4:] if a.startswith("default=")), None)
ALIAS = dict(kv.split(":") for a in argv[4:] if a.startswith("alias=") for kv in a[6:].split(","))
BIPED = any(a == "rename=biped" for a in argv[4:])
MAXTEX = int(next((a.split('=')[1] for a in argv[4:] if a.startswith('maxtex=')), 1024))
guids = json.load(open(GUIDS))

def tex_path(guid):
    p = guids.get(guid)
    return os.path.join(ROOT, *p.split('/')) if p else None

# Every .mat in the package: name -> {albedo, normal, cutout}. Built-in pipeline first, then URP, then HDRP.
mats = {}
for dp, _, fs in os.walk(ROOT):
    for f in fs:
        if not f.endswith('.mat'):
            continue
        txt = open(os.path.join(dp, f), encoding='utf-8', errors='replace').read()
        def slot(*names):
            for n in names:
                m = re.search(r'- ' + n + r':\s*\n\s*m_Texture: \{fileID: \d+, guid: ([0-9a-f]+)', txt)
                if m and tex_path(m.group(1)) and os.path.exists(tex_path(m.group(1))):
                    return tex_path(m.group(1))
        mode = re.search(r'- _Mode: ([\d.]+)', txt)
        rank = 2 if 'HDRP' in dp else 1 if 'URP' in dp else 0
        key = os.path.splitext(f)[0]
        entry = {'albedo': slot('_MainTex', '_BaseMap', '_BaseColorMap'), 'normal': slot('_BumpMap', '_NormalMap'),
                 'emission': slot('_EmissionMap', '_EmissiveColorMap'), 'cutout': bool(mode and float(mode.group(1)) == 1), 'rank': rank, 'file': os.path.join(dp, f)}
        if key not in mats or rank < mats[key]['rank']:
            mats[key] = entry

def norm(s):
    s = re.sub(r'\.\d+$', '', s).lower()
    return re.sub(r'(_?(mat|urp|hdrp|v\d+))+$', '', s.replace(' ', '_'))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=any(a == "orient=1" for a in argv[4:]))
for o in list(bpy.data.objects):
    if o.type in ('CAMERA', 'LIGHT') or (o.type == 'MESH' and not o.find_armature() and not o.parent):
        bpy.data.objects.remove(o)

# Only LOD0: drop LOD1+ meshes. Meshes with no material get one named after the .mat that shares a word with the mesh.
for o in list(bpy.data.objects):
    if o.type == "MESH" and re.search(r"_LOD[1-9]$", o.name):
        bpy.data.objects.remove(o)
for o in bpy.data.objects:
    if o.type == "MESH" and not any(s.material for s in o.material_slots):
        words = re.findall(r"[a-z]+", o.name.lower())
        pick = next((k for k in mats if any(w.rstrip("s") and w.rstrip("s") in k.lower() for w in words)), DEFAULT)
        if pick:
            m = bpy.data.materials.get(pick) or bpy.data.materials.new(pick)
            o.data.materials.clear(); o.data.materials.append(m)
        print("NOMAT", o.name, "->", pick)

loaded = {}
def image(p):
    if p not in loaded:
        im = bpy.data.images.load(p)
        if max(im.size) > MAXTEX:
            k = MAXTEX / max(im.size); im.scale(max(1, int(im.size[0] * k)), max(1, int(im.size[1] * k)))
        loaded[p] = im
    return loaded[p]

report = []
for mat in {s.material for o in bpy.data.objects if o.type == 'MESH' for s in o.material_slots if s.material}:
    n = norm(mat.name)
    if mat.name in ALIAS: n = norm(ALIAS[mat.name])
    hit = mats.get(ALIAS.get(mat.name, mat.name)) or next((v for k, v in mats.items() if norm(k) == n), None) \
        or next((v for k, v in sorted(mats.items(), key=lambda kv: kv[1]['rank']) if norm(k) and (norm(k) in n or n in norm(k))), None)
    if not hit and DEFAULT in mats:
        hit = mats[DEFAULT]
    if not hit and len([v for v in mats.values() if v['albedo']]) == 1:
        hit = next(v for v in mats.values() if v['albedo'])  # one-material packs
    report.append('MATERIAL %s -> %s' % (mat.name, os.path.basename(hit['file']) if hit else 'NO MATCH'))
    if not hit or not hit['albedo']:
        continue
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    for l in list(bsdf.inputs['Base Color'].links): nt.links.remove(l)
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = image(hit['albedo'])
    nt.links.new(ti.outputs['Color'], bsdf.inputs['Base Color'])
    if hit['cutout']:
        nt.links.new(ti.outputs['Alpha'], bsdf.inputs['Alpha'])
        try: mat.blend_method = 'CLIP'
        except Exception: pass
    if hit['normal']:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = image(hit['normal']); tn.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if hit['emission']:
        te = nt.nodes.new('ShaderNodeTexImage'); te.image = image(hit['emission'])
        nt.links.new(te.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.8
    report.append('   albedo %s%s%s' % (os.path.basename(hit['albedo']), ', normal' if hit['normal'] else '', ', cutout' if hit['cutout'] else ''))

arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
if BIPED and arm:  # 3ds Max Biped names -> Mixamo names (the Rig Lab and the game read Mixamo names)
    side = {"L": "Left", "R": "Right"}
    fing = {"1": "Thumb", "2": "Index", "3": "Middle", "4": "Ring", "5": "Pinky"}
    fixed = {"Pelvis": "Hips", "Spine1": "Spine", "Spine2": "Spine1", "Ribcage": "Spine2", "Neck": "Neck", "Head": "Head", "HeadJaw": "Jaw"}
    for b in arm.data.bones:
        k = re.sub(r"^Base ?Human ?", "", b.name); new = fixed.get(k)
        m = re.match(r"^([LR])(?:Arm|Leg)?(Collarbone|Upperarm|Forearm|Palm|Thigh|Calf|Foot|Digit([0-9])([0-9]))$", k)
        if m:
            S, part = side[m.group(1)], m.group(2)
            legs = ("Leg" in k[:4]) or part in ("Thigh", "Calf", "Foot")
            if part.startswith("Digit"):
                new = S + ("ToeBase" if legs or not k[1:].startswith("Arm") else "Hand" + fing[m.group(3)] + m.group(4))
            else:
                new = S + {"Collarbone": "Shoulder", "Upperarm": "Arm", "Forearm": "ForeArm", "Palm": "Hand", "Thigh": "UpLeg", "Calf": "Leg", "Foot": "Foot"}[part]
        if new: print("RENAME", b.name, "->", new); b.name = new
if any(a == "rename=ue" for a in argv[4:]) and arm:  # Unreal mannequin names -> Mixamo names (twist bones keep theirs)
    ue = {"pelvis": "Hips", "spine_01": "Spine", "spine_02": "Spine1", "spine_03": "Spine2", "neck_01": "Neck", "head": "Head"}
    for s, S in (("l", "Left"), ("r", "Right")):
        ue.update({"clavicle_" + s: S + "Shoulder", "upperarm_" + s: S + "Arm", "lowerarm_" + s: S + "ForeArm", "hand_" + s: S + "Hand",
                   "thigh_" + s: S + "UpLeg", "calf_" + s: S + "Leg", "foot_" + s: S + "Foot", "ball_" + s: S + "ToeBase"})
        for f, F in (("thumb", "Thumb"), ("index", "Index"), ("middle", "Middle"), ("ring", "Ring"), ("pinky", "Pinky")):
            for i in (1, 2, 3): ue["%s_0%d_%s" % (f, i, s)] = "%sHand%s%d" % (S, F, i)
    for b in arm.data.bones:
        if b.name in ue: print("RENAME", b.name, "->", ue[b.name]); b.name = ue[b.name]
if any(a == "game=1" for a in argv[4:]) and arm:  # the input build_zombie.py wants: one mesh, mixamorig: names
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    keyed = next((o for o in meshes if o.data.shape_keys), meshes[0])
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = keyed
    bpy.ops.object.join()
    keyed.name = "ZombieMale"
    for b in arm.data.bones:
        if not b.name.startswith("mixamorig:"): b.name = "mixamorig:" + b.name
    print("JOINED", len(meshes), "meshes; bones prefixed")
    # The head bone must point UP like X Bot's (retarget.py lines bone directions up): the importer aims it at its first
    # child (an eye), i.e. forward, and every clip then tipped his head back ~90 deg (the user saw it, 2026-10-20).
    from mathutils import Vector
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for n in ("mixamorig:Head",):
        if n in eb:
            h = eb[n]; L = max((h.tail - h.head).length, 0.12)
            h.tail = h.head + Vector((0, 0, L)); h.roll = 0
            print("HEAD BONE now points up, length", round(L, 3))
    bpy.ops.object.mode_set(mode="OBJECT")
    # 1.0 unit tall like the Tripo zombies: the game scales every zombie by its height (render/clipchars.js
    # model.scale.setScalar(height)); at his real 1.8 m he came out 3.25 m tall in the game (the user saw it, 2026-10-20)
    bpy.context.view_layer.update()
    zs = [(keyed.matrix_world @ v.co).z for v in keyed.data.vertices]; tall = max(zs) - min(zs)
    arm.scale = arm.scale * (1.0 / tall)
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); keyed.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.view_layer.update()
    zs = [(keyed.matrix_world @ v.co).z for v in keyed.data.vertices]
    print("SCALED from %.3f to %.3f tall" % (tall, max(zs) - min(zs)))
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
if arm and arm.animation_data: arm.animation_data_clear()
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', export_animations=False, export_image_format='AUTO',
                          export_skins=True, export_morph=True)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('\n'.join(report))
print('BONES', len(arm.data.bones) if arm else 0, (sorted(b.name for b in arm.data.bones)[:80] if arm else ''))
print('GLB_DONE', OUT, 'tris', tris, 'MB', round(os.path.getsize(os.path.abspath(OUT)) / 1e6, 2))
