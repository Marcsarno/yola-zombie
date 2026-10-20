# A possible new hero (2026-10-19): the "adult male figure" Tripo download (flannel shirt, cap, cargo trousers; Tripo's
# mixamorig rig in A-pose, 65 bones with fingers, no clips of his own). Source: assets/source/male1/male1_tripo.glb
# (the FBX converted as-is in Blender). Every clip Yola 2 has is retargeted onto him the way tools/anim/yola2_build.py
# did hers (blender/retarget.py + tools/anim/contacts.py hands/feet), each from its ORIGINAL source wherever one exists:
#   - Mixamo clips straight from the X Bot FBX files in assets/mixamo;
#   - Quaternius UAL1/UAL2 moves straight from the mannequin (assets/source/ual/UAL*_Full.glb), plus UAL locomotion;
#   - clips that only exist on Yola 2 (Tripo's own clips, edits of Mixamo clips, the Animation Hub's hub_* bakes) are
#     carried over from her files (same Tripo rig family).
# Never KayKit (kk_* clips are skipped). Outputs (Rig Lab: viewer.html?char=male1):
#   assets/male1.glb       his mesh (base colour 2048, the rest 1024, WebP) + the game clips (Yola 2's yola2.glb set)
#   assets/male1_ual.glb   skeleton-only: Yola 2's add-on set (yola2_ual.glb) + UAL locomotion
#   assets/source/male1/male1_work.blend (+ .json: the clip lists)
# usage: blender -b --factory-startup --python tools/anim/male1_build.py -- <assets dir>
import bpy, sys, os, json, re
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender')); sys.path.insert(0, HERE)
from retarget import retarget
import contacts

A = os.path.abspath(sys.argv[sys.argv.index('--') + 1:][0])
MX = os.path.join(A, 'mixamo'); UAL1 = os.path.join(A, 'source', 'ual', 'UAL1_Full.glb'); UAL2 = os.path.join(A, 'source', 'ual', 'UAL2_Full.glb')
ONLY = set(filter(None, os.environ.get('MALE1_ONLY', '').split(',')))  # (quick tests: only these clips)
sc = bpy.context.scene; sc.render.fps = 30; sc.render.fps_base = 1
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

def set_action(arm, act):
    arm.animation_data_create(); arm.animation_data.action = act
    if act is not None:
        try: arm.animation_data.action_slot = act.slots[0]
        except Exception: pass
def import_any(path):
    before = set(bpy.data.objects); a0 = set(bpy.data.actions)
    if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else: bpy.ops.import_scene.gltf(filepath=path)
    for o in [o for o in bpy.data.objects if o not in before]:
        if o.name.startswith('Icosphere'): bpy.data.objects.remove(o, do_unlink=True)
    new = [o for o in bpy.data.objects if o not in before]
    return new, next(o for o in new if o.type == 'ARMATURE'), [a for a in bpy.data.actions if a not in a0]
def drop(objs, acts):
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)
    for a in acts: bpy.data.actions.remove(a)
def fcurves(act):
    try: return list(act.fcurves)
    except Exception: pass
    out = []
    for l in act.layers:
        for st in l.strips:
            for cb in st.channelbags: out += list(cb.fcurves)
    return out

# ---- the target ----
newM, M, a = import_any(os.path.join(A, 'source', 'male1', 'male1_tripo.glb')); drop([], a)
M.name = 'MALE1'
mesh = next(o for o in newM if o.type == 'MESH'); mesh.name = 'MALE1_mesh'

# ---- the bake: retarget + contacts, as yola2_build.py ----
LOOP = re.compile(r'run|walk|strafe|idle|_plain|Idle|_Loop')
HOLD = re.compile(r'bat_|baseball|pistol_|rifle|sg_reload|gs_|melee_horizontal|Heavy_Combo|2H|Polearm')
COMPOSITE = {'pistol_strafe_left', 'pistol_strafe_run_left', 'pistol_strafe_run_right'}
# his collarbones move from HIS rest (the user, 2026-10-20: the chest "V"); MALE1_CLAV=0 = the old direction copy
CLAV = () if os.environ.get('MALE1_CLAV') == '0' else ('mixamorig:LeftShoulder', 'mixamorig:RightShoulder')
SHOES = contacts.shoe_vertices(mesh); CLOG = []; _GRIP = {}
print('SHOES', {k: len(v) for k, v in SHOES.items()})
def grip_ref():
    if 'rel' not in _GRIP:
        objs, src, acts = import_any(os.path.join(MX, 'yola_pistol_idle.fbx')); set_action(src, acts[0])
        _GRIP['rel'] = contacts.grip_relation(src, int(acts[0].frame_range[0]), int(acts[0].frame_range[1])); drop(objs, acts)
    return _GRIP['rel']
def bake(src, name):
    sact = src.animation_data.action
    s0 = int(round(sact.frame_range[0]))
    if s0 != 1:
        for fc in fcurves(sact):
            for k in fc.keyframe_points: k.co.x -= s0 - 1; k.handle_left.x -= s0 - 1; k.handle_right.x -= s0 - 1
    act = retarget(src, M, name, rest_relative=CLAV); act.use_fake_user = True
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    if name in COMPOSITE: contacts.support_rel(M, act, f0, f1, grip_ref(), CLOG)
    elif HOLD.search(name):
        contacts.hands(src, M, act, f0, f1, CLOG, mode='gunhand' if name.startswith('pistol_') or name == 'sg_reload' else 'arm')
    contacts.feet(src, M, mesh, act, f0, f1, SHOES, CLOG, lock=not LOOP.search(name))
    print('CONTACTS', name, CLOG[-2:] if HOLD.search(name) else CLOG[-1:])
    return act

game, addon = [], []
# ---- Mixamo clips: X Bot FBX (yola2_build.py's map) ----
XBOT = {'bat_idle': 'yola_bat_idle', 'gs_low_slash': 'yola_gs_low_slash', 'p_run_back_plain': 'yola_run_back_plain',
    'p_run_plain': 'yola_run_plain', 'p_run_strafe_left_plain': 'yola_run_strafe_left_plain',
    'p_run_strafe_right_plain': 'yola_run_strafe_right_plain', 'p_walk_strafe_left_plain': 'yola_walk_strafe_left_plain',
    'p_walk_strafe_right_plain': 'yola_walk_strafe_right_plain', 'pistol_hit': 'yola_pistol_hit', 'pistol_idle': 'yola_pistol_idle',
    'pistol_run': 'yola_pistol_run', 'pistol_run_back': 'yola_pistol_run_back', 'pistol_strafe_right': 'yola_pistol_strafe_right',
    'pistol_walk': 'yola_pistol_walk', 'pistol_walk_back': 'yola_pistol_walk_back', 'reload_rifle_stand': 'yola_reload_rifle_stand',
    'rifle_aim_idle': 'yola_rifle_aim_idle', 'yola_knockdown': 'zombie_knockdown', 'yola_getup': 'zombie_standup_stomach',
    'melee_horizontal': 'yola_melee_horizontal', 'sg_reload': 'yola_reload_rifle_stand'}
for name, fbx in XBOT.items():
    if ONLY and name not in ONLY: continue
    objs, src, acts = import_any(os.path.join(MX, fbx + '.fbx')); set_action(src, acts[0])
    (addon if name == 'melee_horizontal' else game).append(bake(src, name)); drop(objs, acts)
    print('XBOT', name)

# ---- the Quaternius mannequin (UE bone names -> mixamorig) ----
FING = (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky'))
UE = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    UE.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
               f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
    for f, F in FING:
        for i in (1, 2, 3): UE[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
def from_ual(path, clips, prefix, sink):
    clips = [c for c in clips if not ONLY or prefix + c in ONLY]
    if not clips: return
    objs, src, acts = import_any(path)
    for b in src.data.bones:
        if b.name in UE: b.name = 'mixamorig:' + UE[b.name]
    by = {}
    for a in acts: by[a.name] = a; by[a.name.split('|')[-1]] = a
    for c in clips:
        if c not in by: print('MISSING', c); continue
        set_action(src, by[c]); sink.append(bake(src, prefix + c)); print('UAL', prefix + c)
    drop(objs, acts)

# Yola 2's clip lists, read from her files (so he gets exactly her set)
def glb_clips(path):
    import struct
    b = open(path, 'rb').read(); n = struct.unpack_from('<I', b, 12)[0]
    return [x['name'] for x in json.loads(b[20:20 + n]).get('animations', [])]
Y2_GAME = glb_clips(os.path.join(A, 'yola2.glb')); Y2_ADD = glb_clips(os.path.join(A, 'yola2_ual.glb'))
def ual_names(names, prefix): return [n[len(prefix):] for n in names if n.startswith(prefix)]
LOCO1 = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Idle_LookAround_Loop', 'Jog_Bwd_Loop', 'Jog_Left_Loop', 'Jog_Right_Loop']
from_ual(UAL2, ual_names(Y2_GAME, 'ual_'), 'ual_', game)
from_ual(UAL1, ual_names(Y2_GAME, 'ual1_'), 'ual1_', game)
from_ual(UAL2, ual_names(Y2_ADD, 'ual_'), 'ual_', addon)
from_ual(UAL1, ual_names(Y2_ADD, 'ual1_') + [c for c in LOCO1 if 'ual1_' + c not in Y2_ADD], 'ual1_', addon)

# ---- carried from Yola 2 (clips that exist only on her: Tripo's own, edits, the Animation Hub bakes) ----
def carry(path, names, sink):
    names = [n for n in names if not ONLY or n in ONLY]
    if not names: return
    objs, src, acts = import_any(path)
    by = {a.name: a for a in acts}
    for a in acts: a.name = 'SRC_' + a.name  # (his copy takes the clip's own name, not name.001)
    for n in names:
        if n not in by: print('MISSING', n); continue
        set_action(src, by[n]); sink.append(bake(src, n)); print('CARRIED', n)
    drop(objs, acts)
done = {a.name for a in game + addon}
carry(os.path.join(A, 'yola2.glb'), [n for n in Y2_GAME if n not in done and not n.startswith(('ual_', 'ual1_', 'kk_'))], game)
carry(os.path.join(A, 'yola2_ual.glb'), [n for n in Y2_ADD if n not in done and not n.startswith(('ual_', 'ual1_', 'kk_'))], addon)

# ---- textures: base colour 2048, the rest 1024 (as Yola 2) ----
for m in mesh.data.materials:
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            big = any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links)
            size = 2048 if big else 1024
            if max(n.image.size) > size: n.image.scale(size, size)
            print('TEX', n.image.name, tuple(n.image.size))

def push_tracks(arm, acts):
    ad = arm.animation_data or arm.animation_data_create()
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for act in acts:
        tr = ad.nla_tracks.new(); tr.name = act.name
        st = tr.strips.new(act.name, int(act.frame_range[0]), act)
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
blend = os.path.join(A, 'source', 'male1', 'male1_work.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend)
json.dump({'game': [a.name for a in game], 'addon': [a.name for a in addon], 'contacts': [list(map(str, c)) for c in CLOG]}, open(blend + '.json', 'w'), indent=1)
suffix = os.environ.get('MALE1_SUFFIX', '')
push_tracks(M, game); M.location = (0, 0, 0)
export([M, mesh], os.path.join(A, f'male1{suffix}.glb'))
push_tracks(M, addon)
export([M], os.path.join(A, f'male1{suffix}_ual.glb'))
print('BUILD_DONE', len(game), len(addon))
