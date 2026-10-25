# Skeleton-on-skeleton match (2026-10-19, the user: "put his body on top of the Mixamo body and frame by frame match the
# skeletons ... where the hands are the same, the arms, the elbows"). For the listed clips, the clip's own source rig
# (X Bot / Quaternius mannequin) is scaled to Marc's height and laid over him at the shoulders; every frame his hands
# go exactly where the dummy's hands are (two-bone IK, elbows bending on the dummy's side, wrists keep their turn).
# The retarget already copies every bone's angle; the hands differ only because his arms / shoulders have other lengths.
# Reads assets/source/male1/male1_work_posture.blend (the build + head fix), writes male1_work_match.blend, exports
# assets/male1.glb + male1_ual.glb, and renders overlays (Marc's skeleton orange, the dummy's blue) before / after.
# usage: blender -b --factory-startup --python tools/anim/male1_match.py -- <assets dir> <shots dir>
import bpy, sys, os, json, math, mathutils, re
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import contacts
argv = sys.argv[sys.argv.index('--') + 1:]
A, SHOTS = os.path.abspath(argv[0]), os.path.abspath(argv[1]); os.makedirs(SHOTS, exist_ok=True)
blend = os.path.join(A, 'source', 'male1', 'male1_work_posture.blend')
bpy.ops.wm.open_mainfile(filepath=blend)
lists = json.load(open(os.path.join(A, 'source', 'male1', 'male1_work.blend.json')))
sc = bpy.context.scene; sc.render.fps = 30
M = bpy.data.objects['MALE1']; mesh = bpy.data.objects['MALE1_mesh']
MATCH = {'pistol_idle': ('mixamo/yola_pistol_idle.fbx', None), 'sg_reload': ('mixamo/yola_reload_rifle_stand.fbx', None),
         'ual_Sword_Heavy_Combo': ('source/ual/UAL2_Full.glb', 'Sword_Heavy_Combo')}
ONLY = set(filter(None, os.environ.get('MALE1_ONLY', '').split(',')))
UE = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    UE.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
               f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
    for f, F in (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky')):
        for i in (1, 2, 3): UE[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
BODY = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm',
        'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
LINKS = [('Hips', 'Spine'), ('Spine', 'Spine1'), ('Spine1', 'Spine2'), ('Spine2', 'Neck'), ('Neck', 'Head'), ('Spine2', 'LeftShoulder'), ('LeftShoulder', 'LeftArm'),
         ('LeftArm', 'LeftForeArm'), ('LeftForeArm', 'LeftHand'), ('Spine2', 'RightShoulder'), ('RightShoulder', 'RightArm'), ('RightArm', 'RightForeArm'),
         ('RightForeArm', 'RightHand'), ('Hips', 'LeftUpLeg'), ('LeftUpLeg', 'LeftLeg'), ('LeftLeg', 'LeftFoot'), ('LeftFoot', 'LeftToeBase'),
         ('Hips', 'RightUpLeg'), ('RightUpLeg', 'RightLeg'), ('RightLeg', 'RightFoot'), ('RightFoot', 'RightToeBase')]

def set_action(arm, act):
    arm.animation_data_create()
    for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
    arm.animation_data.action = act
    if act is not None:
        try: arm.animation_data.action_slot = act.slots[0]
        except Exception: pass
def fcurves(act):
    try: return list(act.fcurves)
    except Exception: pass
    out = []
    for l in act.layers:
        for st in l.strips:
            for cb in st.channelbags: out += list(cb.fcurves)
    return out
def imp(path):
    before = set(bpy.data.objects); a0 = set(bpy.data.actions)
    if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else: bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in [o for o in new if o.name.startswith('Icosphere')]: bpy.data.objects.remove(o, do_unlink=True)
    new = [o for o in bpy.data.objects if o not in before]
    return new, next(o for o in new if o.type == 'ARMATURE'), [a for a in bpy.data.actions if a not in a0]
def J(arm, n): return arm.matrix_world @ arm.pose.bones['mixamorig:' + n].head
def rest_height(arm):  # base of the skull above the toes, at rest (the same landmarks on every rig)
    W = arm.matrix_world; d = arm.data.bones
    return (W @ d['mixamorig:Head'].head_local).z - min((W @ d['mixamorig:LeftToeBase'].head_local).z, (W @ d['mixamorig:LeftFoot'].head_local).z)
def joints(arm): return {n: J(arm, n) for n in BODY}
def mapped(dj, s, Ad, Am): return {n: Am + (p - Ad) * s for n, p in dj.items()}

# the overlay pictures: stick figures (a mesh of joint-to-joint edges, thickened)
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'OBJECT'
cd = bpy.data.cameras.new('MC'); cam = bpy.data.objects.new('MC', cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x = 520; sc.render.resolution_y = 620
def sticks(name, P, col, r):
    me = bpy.data.meshes.new(name); names = list(P)
    me.from_pydata([P[n] for n in names], [(names.index(a), names.index(b)) for a, b in LINKS], []); me.update()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    m = o.modifiers.new('w', 'WIREFRAME'); m.thickness = r; m.use_replace = True; o.color = col; return o
def overlay(path, mj, dj, view_dir, target):
    objs = [sticks('MS', mj, (1, 0.45, 0.05, 1), 0.006), sticks('DS', dj, (0.2, 0.6, 1, 1), 0.004)]
    mesh.hide_render = False; mesh.color = (0.8, 0.8, 0.82, 1); sh.show_xray = True; sh.xray_alpha = 0.25
    cam.location = target + view_dir.normalized() * 1.25; cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)

report = {}
Hm = rest_height(M)
for clip, (srcpath, srcname) in MATCH.items():
    if ONLY and clip not in ONLY: continue
    act = bpy.data.actions.get(clip)
    if act is None: print('NO CLIP', clip); continue
    objs, src, sacts = imp(os.path.join(A, srcpath))
    for b in src.data.bones:
        if b.name in UE: b.name = 'mixamorig:' + UE[b.name]
    sact = next(a for a in sacts if a.name.split('|')[-1] == srcname) if srcname else sacts[0]
    s0 = int(round(sact.frame_range[0]))
    if s0 != 1:
        for fc in fcurves(sact):
            for k in fc.keyframe_points: k.co.x -= s0 - 1; k.handle_left.x -= s0 - 1; k.handle_right.x -= s0 - 1
    set_action(src, None)
    for pb in src.pose.bones: pb.matrix_basis = mathutils.Matrix.Identity(4)
    bpy.context.view_layer.update()
    s = Hm / rest_height(src)
    set_action(src, sact); set_action(M, act)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    errs = {'before': [], 'after': []}
    shots = sorted({f0, (f0 + f1) // 2, f1} | ({30, 55, 77, 100} if 'Heavy' in clip else set()))
    for f in range(f0, f1 + 1):
        sc.frame_set(f); bpy.context.view_layer.update()
        dj = joints(src); Ad = (dj['LeftArm'] + dj['RightArm']) / 2
        mj = joints(M); Am = (mj['LeftArm'] + mj['RightArm']) / 2
        tj = mapped(dj, s, Ad, Am)
        e0 = max((mj[n] - tj[n]).length for n in ('LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm'))
        if f in shots:
            for view, d in (('side', (M.matrix_world.to_3x3() @ mathutils.Vector((-1, 0, 0)))), ('front', mathutils.Vector((0.3, -1, 0.1)))):
                overlay(os.path.join(SHOTS, f'{clip}_f{f:03d}_{view}_before.png'), mj, tj, d, Am)
        for side in ('Left', 'Right'):
            contacts.two_bone(M, side + 'Arm', side + 'ForeArm', side + 'Hand', tj[side + 'Hand'], 1.0)
            contacts._key(M, [side + 'Arm', side + 'ForeArm', side + 'Hand'], f)
        mj2 = joints(M)
        e1 = max((mj2[n] - tj[n]).length for n in ('LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm'))
        errs['before'].append(e0); errs['after'].append(e1)
        if f in shots:
            for view, d in (('side', (M.matrix_world.to_3x3() @ mathutils.Vector((-1, 0, 0)))), ('front', mathutils.Vector((0.3, -1, 0.1)))):
                overlay(os.path.join(SHOTS, f'{clip}_f{f:03d}_{view}_after.png'), mj2, tj, d, Am)
    cm = 180.0  # (model units -> cm at 1.80 m)
    report[clip] = {'scale': round(s, 3), 'hands+elbows off before (cm, worst / mean)': [round(max(errs['before']) * cm, 1), round(sum(errs['before']) / len(errs['before']) * cm, 1)],
                    'after': [round(max(errs['after']) * cm, 1), round(sum(errs['after']) / len(errs['after']) * cm, 1)], 'frames': f1 - f0 + 1}
    print('MATCH', clip, report[clip])
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)
    for a in sacts: bpy.data.actions.remove(a)
json.dump(report, open(os.path.join(SHOTS, 'match_report.json'), 'w'), indent=1)
set_action(M, None)
for pb in M.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
sh.show_xray = False
def push_tracks(arm, names):
    ad = arm.animation_data or arm.animation_data_create()
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for n in names:
        a = bpy.data.actions[n]; tr = ad.nla_tracks.new(); tr.name = n
        st = tr.strips.new(n, int(a.frame_range[0]), a)
        try: st.action_slot = a.slots[0]
        except Exception: pass
    ad.action = None
    for p in arm.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
def export(objs, path):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_animations=True,
        export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_image_format='WEBP', export_image_quality=88,
        export_apply=False, export_yup=True, export_skins=True, export_def_bones=False, export_optimize_animation_size=True, export_extras=True)
    print('EXPORTED', path, os.path.getsize(path))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(A, 'source', 'male1', 'male1_work_match.blend'))
push_tracks(M, lists['game']); export([M, mesh], os.path.join(A, 'male1.glb'))
push_tracks(M, lists['addon']); export([M], os.path.join(A, 'male1_ual.glb'))
print('MATCH_DONE')
