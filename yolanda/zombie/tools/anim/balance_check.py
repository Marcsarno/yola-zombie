# Inspection (2026-10-19, Marc "looks like he's going to fall over"): for the same clips and frames, how far each body
# part sits in front of the feet, as a share of the character's height, on every rig that plays the clip:
#   the clip's own source rig (X Bot or the Quaternius mannequin), Marc's original file, Marc's current file, Yola 2.
# Forward = the character's own facing (from the hips' left-right line), so a turned stance does not hide a lean.
# Also renders Marc original (grey) and current (orange) overlaid, side view, per clip.
# usage: blender -b --factory-startup --python tools/anim/balance_check.py -- <assets dir> <out dir> <marc_original.glb> <marc_current.glb>
import bpy, sys, os, json, math, mathutils, re
argv = sys.argv[sys.argv.index('--') + 1:]
A, OUT, ORIG, CUR = [os.path.abspath(x) for x in argv[:4]]
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene; sc.render.fps = 30
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
UE = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    UE.update({f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase', f'upperarm_{s}': S + 'Arm', f'hand_{s}': S + 'Hand'})

def imp(path):
    before = set(bpy.data.objects); a0 = set(bpy.data.actions)
    if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else: bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in [o for o in new if o.name.startswith('Icosphere')]: bpy.data.objects.remove(o, do_unlink=True)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    return new, arm, [a for a in bpy.data.actions if a not in a0]
def bone(arm, short):
    for b in arm.pose.bones:
        n = b.name.split(':')[-1].split('|')[-1]
        if n == short or UE.get(n) == short: return b
    return None
def set_action(arm, act):
    arm.animation_data_create()
    for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
    arm.animation_data.action = act
    try: arm.animation_data.action_slot = act.slots[0]
    except Exception: pass
def height(objs, arm):
    meshes = [o for o in objs if o.type == 'MESH' and o.data.vertices]
    if not meshes:  # (skeleton-only source: head top to toe, from the bones)
        zs = [(arm.matrix_world @ b.head_local).z for b in arm.data.bones]; return max(zs) - min(zs)
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]; return max(zs) - min(zs)
def measure(arm, H):
    W = arm.matrix_world
    P = {n: W @ bone(arm, n).head for n in ('Hips', 'Spine2', 'Neck', 'Head', 'LeftFoot', 'RightFoot', 'LeftUpLeg', 'RightUpLeg')}
    left = P['LeftUpLeg'] - P['RightUpLeg']; left.z = 0; left.normalize()
    fwd = mathutils.Vector((0, 0, 1)).cross(left).normalized()   # up x left = forward (characters face -Y at rest)
    feet = (P['LeftFoot'] + P['RightFoot']) / 2
    return {k: round(100 * (P[k] - feet).dot(fwd) / H, 1) for k in ('Hips', 'Spine2', 'Neck', 'Head')}

# the characters
chars = {}
EXTRA = {'marc_orig': [ORIG.replace('male1_before_weights', 'male1_ual_before_weights')],
         'marc_now': [CUR.replace('male1_current_spine_dummy', 'male1_ual_current_spine_dummy')],
         'yola': [os.path.join(A, 'yola2_ual.glb'), os.path.join(A, 'test_clips', 'ual1_full_yola2.glb'), os.path.join(A, 'test_clips', 'ual2_full_yola2.glb')]}
for key, path in (('marc_orig', ORIG), ('marc_now', CUR), ('yola', os.path.join(A, 'yola2.glb'))):
    objs, arm, acts = imp(path)
    for ex in EXTRA[key]:   # (the add-on clip files: skeleton-only, same bone names: their actions play on this rig)
        if not os.path.exists(ex): continue
        eo, ea, eacts = imp(ex); acts += eacts
        for o in eo: bpy.data.objects.remove(o, do_unlink=True)
    for a in acts: a.use_fake_user = True
    arm.animation_data_create()
    for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
    for pb in arm.pose.bones: pb.matrix_basis = mathutils.Matrix.Identity(4)
    bpy.context.view_layer.update()
    chars[key] = (objs, arm, {re.sub(r'\.\d{3}$', '', a.name.split('|')[-1]): a for a in acts}, height(objs, arm))
    for o in objs: o.name = key + '_' + o.name
CLIPS = [('pistol_idle', 'mixamo/yola_pistol_idle.fbx', None), ('sg_reload', 'mixamo/yola_reload_rifle_stand.fbx', None),
         ('rifle_aim_idle', 'mixamo/yola_rifle_aim_idle.fbx', None), ('bat_idle', 'mixamo/yola_bat_idle.fbx', None),
         ('ual1_Idle_Loop', 'source/ual/UAL1_Full.glb', 'Idle_Loop'), ('ual_Sword_Regular_Combo', 'source/ual/UAL2_Full.glb', 'Sword_Regular_Combo')]
report = {}
for clip, srcpath, srcname in CLIPS:
    objs, src, sacts = imp(os.path.join(A, srcpath))
    sact = next(a for a in sacts if a.name.split('|')[-1] == srcname) if srcname else sacts[0]
    s0 = int(round(sact.frame_range[0])); set_action(src, sact)
    for pb in src.pose.bones: pass
    Hs = height(objs, src)
    rows = []
    for key, (cobjs, arm, acts, H) in chars.items():
        act = acts.get(clip)
        if act is None: continue
        set_action(arm, act)
    f1 = int(chars['marc_orig'][2][clip].frame_range[1])
    for f in sorted(set([1, f1 // 4, f1 // 2, 3 * f1 // 4, f1])):
        row = {'f': f}
        sc.frame_set(f - 1 + s0); bpy.context.view_layer.update(); row['SOURCE'] = measure(src, Hs)
        sc.frame_set(f); bpy.context.view_layer.update()
        for key, (cobjs, arm, acts, H) in chars.items():
            if clip in acts: row[key] = measure(arm, H)
        rows.append(row)
    report[clip] = rows
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)
    for a in sacts: bpy.data.actions.remove(a)
    print('CLIP', clip)
# proportions (rest): share of height
props = {}
for key, (cobjs, arm, acts, H) in chars.items():
    set_action(arm, None) if False else None
json.dump(report, open(os.path.join(OUT, 'balance.json'), 'w'), indent=1)

# overlay renders: Marc original (grey, see-through) and current (orange), side view and front, per clip
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading
sh.light = 'STUDIO'; sh.color_type = 'OBJECT'; sh.show_xray = True; sh.xray_alpha = 0.6
for o in chars['yola'][0]: o.hide_render = True
for o in chars['marc_orig'][0]:
    if o.type == 'MESH': o.color = (0.75, 0.75, 0.8, 1)
for o in chars['marc_now'][0]:
    if o.type == 'MESH': o.color = (1.0, 0.45, 0.1, 1)
cd = bpy.data.cameras.new('C'); cam = bpy.data.objects.new('C', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.lens = 50
sc.render.resolution_x = 520; sc.render.resolution_y = 640
for clip in ('pistol_idle', 'sg_reload', 'ual1_Idle_Loop', 'bat_idle'):
    for key in ('marc_orig', 'marc_now'):
        set_action(chars[key][1], chars[key][2][clip])
    f1 = int(chars['marc_orig'][2][clip].frame_range[1])
    for f in (1, f1 // 2):
        sc.frame_set(f); bpy.context.view_layer.update()
        arm = chars['marc_orig'][1]; W = arm.matrix_world
        hips = W @ bone(arm, 'Hips').head
        l = (W @ bone(arm, 'LeftUpLeg').head) - (W @ bone(arm, 'RightUpLeg').head); l.z = 0; l.normalize()
        fwd = mathutils.Vector((0, 0, 1)).cross(l).normalized()
        for view, d in (('side', -l), ('front', fwd)):
            t = mathutils.Vector((hips.x, hips.y, 0.5))
            cam.location = t + d * 2.6 + mathutils.Vector((0, 0, 0.05))
            cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = os.path.join(OUT, f'overlay_{clip}_f{f}_{view}.png'); bpy.ops.render.render(write_still=True)
print('BALANCE_DONE')
