# Side-by-side review sheets: the new Yola next to the clip's source rig at the same frame (Mixamo's own bot for Mixamo
# clips, Quaternius's own mannequin for UAL clips), both scaled to her height on one floor. One row per frame, three
# columns: front three-quarter, side, and an X-ray of both with their skeletons drawn inside (bones as rods, joints as
# balls; hands and feet marked). Rendered with Workbench (her real textures), labels rendered separately, tiled with numpy.
# usage: blender -b <yola2.blend> --python tools/anim/yola2_sheet.py -- <assets dir> <out.png> <clip> <ref> <f,f,f...> [title]
#   ref: xbot:<fbx name in assets/mixamo>  |  ual:<UAL glb path>:<action name>  |  none
import bpy, sys, os, math, bmesh
import numpy as np
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
A, OUT, CLIP, REF, FRAMES = argv[:5]
TITLE = argv[5] if len(argv) > 5 else CLIP
frames = [int(x) for x in FRAMES.split(',')]
sc = bpy.context.scene; sc.render.fps = 30
for n in ('YOLA1', 'YOLA1_mesh'):
    if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
Y = bpy.data.objects['YOLA2']
def set_action(arm, act):
    arm.animation_data_create(); arm.animation_data.action = act
    if act is not None:
        try: arm.animation_data.action_slot = act.slots[0]
        except Exception: pass
def fcurves(act):
    out = []
    for l in act.layers:
        for st in l.strips:
            for cb in st.channelbags: out += list(cb.fcurves)
    return out
set_action(Y, bpy.data.actions[CLIP])
bpy.context.view_layer.objects.active = Y
def meshes_of(arm): return [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm]
def height(objs):
    bpy.context.view_layer.update()
    zs = [(o.matrix_world @ Vector(c)).z for o in objs if o.type == 'MESH' for c in o.bound_box]
    return max(zs) - min(zs)
X = None; REFNAME = 'no reference'
if REF.startswith('xbot:'):
    b0 = set(bpy.data.objects); a0 = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(A, 'mixamo', 'reference', 'ref_xbot_pistol_idle.fbx'), automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in b0]; X = next(o for o in new if o.type == 'ARMATURE')
    for a in [a for a in bpy.data.actions if a not in a0]: bpy.data.actions.remove(a)
    set_action(X, None); X.data.pose_position = 'REST'; h = height(new); X.data.pose_position = 'POSE'
    b1 = set(bpy.data.objects); a1 = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(A, 'mixamo', REF[5:] + '.fbx'), automatic_bone_orientation=False)
    for o in [o for o in bpy.data.objects if o not in b1]: bpy.data.objects.remove(o, do_unlink=True)
    set_action(X, [a for a in bpy.data.actions if a not in a1][0])
    REFNAME = "Mixamo's own character (source rig)"
elif REF.startswith('ual:'):
    path, act = REF[4:].rsplit(':', 1)
    b0 = set(bpy.data.objects); a0 = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in [o for o in bpy.data.objects if o not in b0 and o.name.startswith('Icosphere')]: bpy.data.objects.remove(o, do_unlink=True)  # (bone-shape helpers)
    new = [o for o in bpy.data.objects if o not in b0]; X = next(o for o in new if o.type == 'ARMATURE')
    acts = [a for a in bpy.data.actions if a not in a0]
    src = next(a for a in acts if a.name == act or a.name.split('|')[-1] == act)
    for a in acts:
        if a is not src: bpy.data.actions.remove(a)
    set_action(X, None); X.data.pose_position = 'REST'; h = height(new); X.data.pose_position = 'POSE'
    off = int(round(src.frame_range[0])) - 1  # (retargeted clips start at frame 1: line the source up with them)
    if off:
        for fc in fcurves(src):
            for k in fc.keyframe_points: k.co.x -= off; k.handle_left.x -= off; k.handle_right.x -= off
    set_action(X, src)
    REFNAME = "Quaternius's own mannequin (source rig)"
if X is not None:
    X.scale = [s / h for s in X.scale]

# ---- skeleton rods: a mesh with one rod per bone, skinned rigidly to that bone, so it follows the pose ----
def skeleton(arm, color, radius):
    bm = bmesh.new(); groups = []
    M = arm.matrix_world
    for b in arm.data.bones:
        if b.name.endswith('_End') or 'Index4' in b.name or 'Middle4' in b.name or 'Ring4' in b.name or 'Pinky4' in b.name or 'Thumb4' in b.name: continue
        hd, tl = b.head_local, b.tail_local
        if (tl - hd).length < 1e-6: continue
        fing = 'Hand' in b.name and b.name not in ('mixamorig:LeftHand', 'mixamorig:RightHand')
        r = radius * (0.35 if fing else 1.0)
        d = (tl - hd); L = d.length; q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        start = len(bm.verts)
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r * 0.55, depth=L,
                              matrix=Matrix.Translation(hd + d * 0.5) @ q.to_matrix().to_4x4())
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r * 1.5, matrix=Matrix.Translation(hd))
        groups.append((b.name, start, len(bm.verts)))
    me = bpy.data.meshes.new('skel'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('skel_' + arm.name, me); sc.collection.objects.link(ob)
    ob.parent = arm; ob.matrix_parent_inverse = Matrix.Identity(4)
    for name, a, b in groups:
        g = ob.vertex_groups.new(name=name); g.add(list(range(a, b)), 1.0, 'REPLACE')
    md = ob.modifiers.new('arm', 'ARMATURE'); md.object = arm
    mat = bpy.data.materials.new('skel'); mat.diffuse_color = color; me.materials.append(mat)
    return ob
# rest-local coordinates are in the armature's space: build at the armature's own scale
skels = [skeleton(Y, (1.0, 0.9, 0.0, 1), 0.009)]
if X is not None: skels.append(skeleton(X, (0.1, 0.9, 1.0, 1), 0.009 / max(X.scale)))  # (radius in its armature space)

# floor
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0)); floor = bpy.context.active_object
fm = bpy.data.materials.new('floor'); fm.diffuse_color = (0.6, 0.62, 0.64, 1); floor.data.materials.append(fm)
r = sc.render
r.engine = 'BLENDER_WORKBENCH'
shd = sc.display.shading; shd.light = 'STUDIO'; shd.color_type = 'TEXTURE'; shd.show_shadows = True
r.resolution_x, r.resolution_y, r.resolution_percentage = 700, 620, 100
r.image_settings.file_format = 'PNG'
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.lens = 50
def aim(loc, tgt):
    cam.location = loc; cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
# views: camera, where the two stand (side by side across the view), x-ray
VIEWS = [('front 3/4', Vector((0.75, -2.2, 0.75)), (Vector((-0.34, 0, 0)), Vector((0.34, 0, 0))), False),
         ('side', Vector((2.35, 0, 0.65)), (Vector((0, -0.34, 0)), Vector((0, 0.34, 0))), False),
         ('x-ray + skeleton', Vector((0.25, -2.0, 0.7)), (Vector((-0.3, 0, 0)), Vector((0.3, 0, 0))), True)]
tmp = os.path.join(os.path.dirname(OUT), '_tile.png')
def grab(path):
    img = bpy.data.images.load(path, check_existing=False)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4); bpy.data.images.remove(img); return px
# ---- labels: white text on dark, rendered in a separate flat scene ----
lab = bpy.data.scenes.new('labels'); lab.render.engine = 'BLENDER_WORKBENCH'; lab.display.shading.light = 'FLAT'
lab.display.shading.color_type = 'MATERIAL'; lab.render.image_settings.file_format = 'PNG'
lw = bpy.data.worlds.new('lw'); lab.world = lw; lw.color = (0.07, 0.08, 0.09)
lcam_d = bpy.data.cameras.new('lcam'); lcam_d.type = 'ORTHO'; lcam = bpy.data.objects.new('lcam', lcam_d); lab.collection.objects.link(lcam); lab.camera = lcam
lcam.location = (0, 0, 5)
txt_d = bpy.data.curves.new('t', 'FONT'); txt = bpy.data.objects.new('t', txt_d); lab.collection.objects.link(txt)
tm = bpy.data.materials.new('tw'); tm.diffuse_color = (1, 1, 1, 1); txt_d.materials.append(tm)
txt_d.align_x = 'CENTER'; txt_d.align_y = 'CENTER'
def text_strip(s, w, h=44):
    txt_d.body = s; lab.render.resolution_x, lab.render.resolution_y = w, h; lab.render.resolution_percentage = 100
    lcam_d.ortho_scale = w / 100.0; txt_d.size = 0.26
    lab.render.filepath = tmp
    bpy.ops.render.render(write_still=True, scene=lab.name)
    return grab(tmp)
rows = []
for f in frames:
    row = []
    for vn, loc, (py, px_), xray in VIEWS:
        Y.location = py
        if X is not None: X.location = px_
        for s_ in skels: s_.hide_render = not xray
        shd.show_xray = xray; shd.xray_alpha = 0.18
        sc.frame_set(f)
        aim(loc, Vector(((py.x + px_.x) / 2, (py.y + px_.y) / 2, 0.5)))
        r.filepath = tmp; bpy.ops.render.render(write_still=True, scene=sc.name)
        tile = grab(tmp)
        lbl = text_strip('%s  ·  frame %d  ·  %s' % (TITLE, f, vn), r.resolution_x, 40)
        row.append(np.concatenate([tile, lbl], axis=0))
    rows.append(np.concatenate(row, axis=1))
W = rows[0].shape[1]
head = text_strip('LEFT: NEW YOLA        RIGHT: %s' % REFNAME, W, 54)
sheet = np.concatenate([np.concatenate(rows[::-1], axis=0), head], axis=0)  # (images are stored bottom-up)
H = sheet.shape[0]
out = bpy.data.images.new('sheet', W, H, alpha=True); out.pixels = sheet.ravel(); out.filepath_raw = OUT; out.file_format = 'PNG'; out.save()
print('SHEET', OUT, W, H)
