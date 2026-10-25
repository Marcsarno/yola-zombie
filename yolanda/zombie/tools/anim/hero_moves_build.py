# Movement only, for a new character on a Tripo rig (2026-10-20, the user: "test arianna's walk and run. she does not need
# any weapons ... bring in lilah too. just movement from them"). Same retarget as Yola 2 / Marc (blender/retarget.py,
# collarbones turning from the character's own rest as Marc, tools/anim/contacts.py feet on the floor), each clip from its
# original source:
#   - the game's gait set today: Mixamo X Bot (assets/mixamo yola_run_plain etc. -> p_run_plain ...);
#   - Quaternius UAL1/UAL2 walks, jogs, sprint, idles from the mannequin (assets/source/ual);
#   - tripo_idle carried from Yola 2 (Tripo's own idle, same rig family);
#   - the character's own clips, if its file has any (Lilah: Tripo's walk, run ... kept as t_<name>, untouched).
# No weapons, no hand contacts. Output: assets/<char>.glb (mesh + skeleton + these clips), textures: base colour 2048,
# the rest 1024 (as Yola 2), plus assets/source/<char>/<char>_moves.blend(.json).
# usage: blender -b --factory-startup --python tools/anim/hero_moves_build.py -- <assets dir> <char> <character.glb>
import bpy, sys, os, re, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender')); sys.path.insert(0, HERE)
from retarget import retarget
import contacts

argv = sys.argv[sys.argv.index('--') + 1:]
A, CHAR, SRC = os.path.abspath(argv[0]), argv[1], os.path.abspath(argv[2])
MX = os.path.join(A, 'mixamo'); UAL1 = os.path.join(A, 'source', 'ual', 'UAL1_Full.glb'); UAL2 = os.path.join(A, 'source', 'ual', 'UAL2_Full.glb')
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

# ---- the character, with any clips of its own ----
newM, M, own = import_any(SRC)
M.name = CHAR.upper()
mesh = next(o for o in newM if o.type == 'MESH'); mesh.name = CHAR.upper() + '_mesh'
OWN = []
for a in own:
    a.name = 't_' + re.sub(r'\.\d+$', '', a.name.split('|')[-1]); a.use_fake_user = True; OWN.append(a)
set_action(M, None)
for p in M.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
print('OWN', [a.name for a in OWN])

LOOP = re.compile(r'run|walk|strafe|idle|_plain|Idle|_Loop')
CLAV = ('mixamorig:LeftShoulder', 'mixamorig:RightShoulder')  # (her collarbones turn from her own rest, as Marc's)
SHOES = contacts.shoe_vertices(mesh); CLOG = []
print('SHOES', {k: len(v) for k, v in SHOES.items()})
def bake(src, name):
    sact = src.animation_data.action
    s0 = int(round(sact.frame_range[0]))
    if s0 != 1:
        for fc in fcurves(sact):
            for k in fc.keyframe_points: k.co.x -= s0 - 1; k.handle_left.x -= s0 - 1; k.handle_right.x -= s0 - 1
    act = retarget(src, M, name, rest_relative=CLAV); act.use_fake_user = True
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    contacts.feet(src, M, mesh, act, f0, f1, SHOES, CLOG, lock=not LOOP.search(name))
    print('BAKED', name, CLOG[-1:])
    return act

made = []
# ---- the game's gait set today (Mixamo X Bot) ----
XBOT = {'p_run_plain': 'yola_run_plain', 'p_run_back_plain': 'yola_run_back_plain', 'p_run_strafe_left_plain': 'yola_run_strafe_left_plain',
    'p_run_strafe_right_plain': 'yola_run_strafe_right_plain', 'p_walk_strafe_left_plain': 'yola_walk_strafe_left_plain',
    'p_walk_strafe_right_plain': 'yola_walk_strafe_right_plain'}
for name, fbx in XBOT.items():
    objs, src, acts = import_any(os.path.join(MX, fbx + '.fbx')); set_action(src, acts[0])
    made.append(bake(src, name)); drop(objs, acts)

# ---- Quaternius walks / jogs / sprint / idles (UE names -> mixamorig) ----
FING = (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky'))
UE = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    UE.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
               f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
    for f, F in FING:
        for i in (1, 2, 3): UE[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
def from_ual(path, clips, prefix):
    objs, src, acts = import_any(path)
    for b in src.data.bones:
        if b.name in UE: b.name = 'mixamorig:' + UE[b.name]
    by = {}
    for a in acts: by[a.name] = a; by[a.name.split('|')[-1]] = a
    for c in clips:
        if c not in by: print('MISSING', c); continue
        set_action(src, by[c]); made.append(bake(src, prefix + c))
    drop(objs, acts)
from_ual(UAL1, ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jog_Bwd_Loop', 'Jog_Left_Loop', 'Jog_Right_Loop'], 'ual1_')
from_ual(UAL2, ['Walk_Fwd_Loop'], 'ual_')

# ---- Tripo's own idle, from Yola 2 ----
objs, src, acts = import_any(os.path.join(A, 'yola2.glb'))
by = {a.name: a for a in acts}
if 'tripo_idle' in by: set_action(src, by['tripo_idle']); made.append(bake(src, 'tripo_idle'))
drop(objs, acts)

# ---- textures: base colour 2048, the rest 1024 ----
for m in mesh.data.materials:
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            big = any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links) or re.search(r'basecolor|base_color|albedo|_rgb_', n.image.name, re.I)
            size = 2048 if big else 1024
            if max(n.image.size) > size: n.image.scale(size, size)
            print('TEX', n.image.name, tuple(n.image.size))

ad = M.animation_data or M.animation_data_create()
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
for act in made + OWN:
    tr = ad.nla_tracks.new(); tr.name = act.name
    st = tr.strips.new(act.name, int(act.frame_range[0]), act)
    try: st.action_slot = act.slots[0]
    except Exception: pass
ad.action = None
for p in M.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
M.location = (0, 0, 0)
os.makedirs(os.path.join(A, 'source', CHAR), exist_ok=True)
blend = os.path.join(A, 'source', CHAR, CHAR + '_moves.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend)
json.dump({'clips': [a.name for a in made + OWN], 'contacts': [list(map(str, c)) for c in CLOG]}, open(blend + '.json', 'w'), indent=1)
for o in bpy.context.view_layer.objects: o.select_set(o in (M, mesh))
bpy.context.view_layer.objects.active = M
out = os.path.join(A, CHAR + '.glb')
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_image_format='WEBP', export_image_quality=88,
    export_apply=False, export_yup=True, export_skins=True, export_def_bones=False, export_optimize_animation_size=True, export_extras=True)
print('BUILD_DONE', out, os.path.getsize(out), len(made), len(OWN))
