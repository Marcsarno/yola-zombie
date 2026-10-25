# Posture fixes for the male hero's clips (2026-10-19, the user: "fix his head angle first, then reduce the lower-back
# arch a little so he stands straighter"), run on what tools/anim/male1_build.py made (assets/source/male1/male1_work.blend):
#   head  - X Bot clips only: X Bot's neck and head bones point ~17 / ~26 deg off their limb lines, so a rotation retarget
#           leaves his head tipped back. Every frame his Neck is turned so Neck->Head points as X Bot's does, then his Head
#           so Head->HeadTop_End (his face) points as X Bot's does. (Quaternius clips already match: untouched.)
#   arch  - (MALE1_ARCH=<deg>, X Bot clips) a straighter stance: Spine turns <deg> forward and Spine2 the same back, so the
#           lower back arches less while the chest (shoulders, arms, gun) keeps its direction.
# Then exports assets/male1.glb + assets/male1_ual.glb as the build does.
# usage: blender -b --factory-startup --python tools/anim/male1_posture.py -- <assets dir>
import bpy, sys, os, json, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
A = os.path.abspath(argv[0]); MX = os.path.join(A, 'mixamo')
ARCH = float(os.environ.get('MALE1_ARCH', '0'))
HEAD = os.environ.get('MALE1_HEAD', '1') != '0'
blend = os.path.join(A, 'source', 'male1', 'male1_work.blend')
bpy.ops.wm.open_mainfile(filepath=blend)
lists = json.load(open(blend + '.json'))
sc = bpy.context.scene; sc.render.fps = 30
M = bpy.data.objects['MALE1']; mesh = bpy.data.objects['MALE1_mesh']
# the X Bot sources (male1_build.py's map) and the clips carried from Yola that have one (the Rig Lab's YOLA2_REF)
XBOT = {'bat_idle': 'yola_bat_idle', 'gs_low_slash': 'yola_gs_low_slash', 'p_run_back_plain': 'yola_run_back_plain',
    'p_run_plain': 'yola_run_plain', 'p_run_strafe_left_plain': 'yola_run_strafe_left_plain',
    'p_run_strafe_right_plain': 'yola_run_strafe_right_plain', 'p_walk_strafe_left_plain': 'yola_walk_strafe_left_plain',
    'p_walk_strafe_right_plain': 'yola_walk_strafe_right_plain', 'pistol_hit': 'yola_pistol_hit', 'pistol_idle': 'yola_pistol_idle',
    'pistol_run': 'yola_pistol_run', 'pistol_run_back': 'yola_pistol_run_back', 'pistol_strafe_right': 'yola_pistol_strafe_right',
    'pistol_walk': 'yola_pistol_walk', 'pistol_walk_back': 'yola_pistol_walk_back', 'reload_rifle_stand': 'yola_reload_rifle_stand',
    'rifle_aim_idle': 'yola_rifle_aim_idle', 'yola_knockdown': 'zombie_knockdown', 'yola_getup': 'zombie_standup_stomach',
    'melee_horizontal': 'yola_melee_horizontal', 'sg_reload': 'yola_reload_rifle_stand', 'bat_swing': 'yola_baseball_single'}
ONLY = set(filter(None, os.environ.get('MALE1_ONLY', '').split(',')))

def set_action(arm, act):
    arm.animation_data_create(); arm.animation_data.action = act
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
def import_fbx(path):
    before = set(bpy.data.objects); a0 = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    return new, next(o for o in new if o.type == 'ARMATURE'), [a for a in bpy.data.actions if a not in a0]
def wp(arm, n): return arm.matrix_world @ arm.pose.bones[n].head
def turn(arm, n, R):  # turn pose bone n about its head by the world rotation R (a 3x3)
    pb = arm.pose.bones[n]; mw = arm.matrix_world; h = mw @ pb.head
    m = mathutils.Matrix.Translation(h) @ R.to_4x4() @ mathutils.Matrix.Translation(-h) @ (mw @ pb.matrix)
    pb.matrix = mw.inverted() @ m; bpy.context.view_layer.update()
def key(arm, names, f):
    for n in names:
        pb = arm.pose.bones[n]; pb.rotation_mode = 'QUATERNION'; pb.keyframe_insert('rotation_quaternion', frame=f)

def bone_name(arm, short):
    for b in arm.data.bones:
        if b.name.split(':')[-1] == short: return b.name
    return None
log = []
for name, fbx in XBOT.items():
    if ONLY and name not in ONLY: continue
    act = bpy.data.actions.get(name)
    if act is None: print('NO CLIP', name); continue
    objs, src, sacts = import_fbx(os.path.join(MX, fbx + '.fbx'))
    sact = sacts[0]; s0 = int(round(sact.frame_range[0]))
    if s0 != 1:  # (as the build: the source's frames line up with his, which start at 1)
        for fc in fcurves(sact):
            for k in fc.keyframe_points: k.co.x -= s0 - 1; k.handle_left.x -= s0 - 1; k.handle_right.x -= s0 - 1
    set_action(src, sact); set_action(M, act)
    SN, SH, ST = bone_name(src, 'Neck'), bone_name(src, 'Head'), bone_name(src, 'HeadTop_End')
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    worst = 0.0
    for f in range(f0, f1 + 1):
        sc.frame_set(f); bpy.context.view_layer.update()
        if ARCH:
            lat = (M.matrix_world.to_3x3() @ mathutils.Vector((1, 0, 0))).normalized()   # his left: forward tilt about +X (he faces -Y)
            # (the character's own lateral axis, from his hips' current facing)
            hm = (M.matrix_world @ M.pose.bones['mixamorig:Hips'].matrix).to_3x3()
            lat = (hm @ mathutils.Vector((1, 0, 0))).normalized()
            turn(M, 'mixamorig:Spine', mathutils.Matrix.Rotation(math.radians(ARCH), 3, lat))
            turn(M, 'mixamorig:Spine2', mathutils.Matrix.Rotation(math.radians(-ARCH), 3, lat))
            key(M, ['mixamorig:Spine', 'mixamorig:Spine2'], f)
        if HEAD:
            sd = (src.matrix_world @ src.pose.bones[SH].head) - (src.matrix_world @ src.pose.bones[SN].head)
            td = wp(M, 'mixamorig:Head') - wp(M, 'mixamorig:Neck')
            R = td.normalized().rotation_difference(sd.normalized()).to_matrix()
            worst = max(worst, math.degrees(td.angle(sd)))
            turn(M, 'mixamorig:Neck', R)
            if ST:
                sf = (src.matrix_world @ src.pose.bones[ST].head) - (src.matrix_world @ src.pose.bones[SH].head)
                tf = wp(M, 'mixamorig:HeadTop_End') - wp(M, 'mixamorig:Head')
                turn(M, 'mixamorig:Head', tf.normalized().rotation_difference(sf.normalized()).to_matrix())
            key(M, ['mixamorig:Neck', 'mixamorig:Head'], f)
    log.append((name, round(worst, 1)))
    print('POSTURE', name, 'neck was off by up to', round(worst, 1), 'deg')
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)
    for a in sacts: bpy.data.actions.remove(a)
set_action(M, None)
for pb in M.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

def push_tracks(arm, names):
    ad = arm.animation_data or arm.animation_data_create()
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for n in names:
        act = bpy.data.actions[n]; tr = ad.nla_tracks.new(); tr.name = n
        st = tr.strips.new(n, int(act.frame_range[0]), act)
        try: st.action_slot = act.slots[0]
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
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(A, 'source', 'male1', 'male1_work_posture.blend'))
push_tracks(M, lists['game']); export([M, mesh], os.path.join(A, 'male1.glb'))
push_tracks(M, lists['addon']); export([M], os.path.join(A, 'male1_ual.glb'))
print('POSTURE_DONE', log)
