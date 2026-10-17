# The new Yola (2026-10-16, the user's Tripo "nurse scrubs" model, assets/source/yola_v2/nurse_scrubs_tripo.glb): her
# Tripo rig (mixamorig names, A-pose) gets every game clip retargeted onto it (blender/retarget.py: world-space change
# from rest per bone, hips travel scaled by leg height), each from its ORIGINAL source wherever one exists:
#   - Mixamo clips straight from the X Bot FBX files in assets/mixamo (Mixamo's own skeleton, the comparison reference);
#   - library moves straight from the libraries' own rigs (Quaternius UAL mannequin, Kevin Iglesias, KayKit);
#   - clips that only exist as edits made on the first Yola (mirrored or composited strafes, the trimmed reload, the
#     twisted shotgun hold, the levelled swing) and Tripo's own clips (punches, kicks, chop, greets, hits: authored on the
#     Tripo rig itself) are carried over from the first Yola's GLB.
# The first Yola (assets/yola.glb) is untouched. Outputs:
#   assets/yola2.glb          her mesh + every game clip (+ the bat's Sword Regular Combo, CC0)
#   assets/yola_sword.glb     skeleton-only: the Sword Regular Combo on the FIRST Yola (the game's bat, both Yolas)
#   assets/moves/yola2_moves.glb  skeleton-only: the arena's library picks on the new Yola (local only: Kevin clips)
#   assets/clipdata_yola2.json    the hit paths (grips, limbs, hips) re-measured on her
# usage: blender -b --factory-startup --python tools/anim/yola2_build.py -- <assets dir> <ual1.glb> <ual2.glb> <kev_melee dir> <kaykit dir> <out.blend>
import bpy, sys, os, json, math, mathutils
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender')); sys.path.insert(0, HERE)
from retarget import retarget
import contacts, re

argv = sys.argv[sys.argv.index('--') + 1:]
A, UAL1, UAL2, KEVM, KAYKIT, OUT_BLEND = argv[:6]
MX = os.path.join(A, 'mixamo')
sc = bpy.context.scene; sc.render.fps = 30; sc.render.fps_base = 1
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

def set_action(arm, act):
    arm.animation_data_create(); arm.animation_data.action = act
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

# ---- the targets: the new Yola (with her mesh) and the first Yola (for the carried-over clips, and the bat clip) ----
new2, Y2, a = import_any(os.path.join(A, 'source', 'yola_v2', 'nurse_scrubs_tripo.glb')); drop([], a)
Y2.name = 'YOLA2'
for o in new2:
    if o.type == 'MESH': o.name = 'YOLA2_mesh'
new1, Y1, acts1 = import_any(os.path.join(A, 'yola.glb'))
Y1.name = 'YOLA1'; Y1.location.x = -0.8
for o in new1:
    if o.type == 'MESH': o.name = 'YOLA1_mesh'
first = {a.name: a for a in acts1}
for a in acts1: a.name = 'Y1_' + a.name

# ---- skin weights: the scrub top's hem follows the pelvis, not the thighs ----
# (Tripo weighted the hem over the hips to the thigh bones, so a raised knee pulled it into a bulge.) Above the crotch,
# thigh weight fades to the hips: full thigh at the crotch line, none 6 cm (model units) above it.
def fix_hem(arm, me):
    B = arm.data.bones
    crotch = min((arm.matrix_world @ B['mixamorig:LeftUpLeg'].head_local).z, (arm.matrix_world @ B['mixamorig:RightUpLeg'].head_local).z) - 0.035
    vg = {g.name: g for g in me.vertex_groups}
    hips = vg['mixamorig:Hips']
    moved = 0
    for v in me.data.vertices:
        z = (me.matrix_world @ v.co).z
        if z <= crotch: continue
        u = min(1.0, (z - crotch) / 0.06); keep = 1 - u * u * (3 - 2 * u)
        give = 0.0
        for g in v.groups:
            n = me.vertex_groups[g.group].name
            if n.endswith('UpLeg') and g.weight > 0:
                w = g.weight; g.weight = w * keep; give += w - g.weight
        if give > 1e-4:
            moved += 1
            cur = next((g.weight for g in v.groups if g.group == hips.index), 0.0)
            hips.add([v.index], cur + give, 'REPLACE')
    print('HEM', 'crotch z', round(crotch, 3), 'vertices eased', moved)
if os.environ.get('YOLA2_FIX_HEM'): fix_hem(Y2, next(o for o in new2 if o.type == 'MESH'))

made2, made1, lib2 = [], [], []
# ---- the retarget, then the contact fixes (tools/anim/contacts.py) while the source is still loaded ----
LOOP = re.compile(r'run|walk|strafe|idle|_plain|Idle|_Loop')  # looping gaits and idles (library loops: *_Loop): no horizontal foot pin
HOLD = re.compile(r'bat_|baseball|pistol_|rifle|sg_reload|gs_|melee_horizontal|Heavy_Combo|2H|Polearm')  # two-handed weapon holds
SHOES = {}
CLOG = []
# the pistol strafes built from several clips (carried from the first Yola: no single source rig to copy the support hand
# from): her left hand takes X Bot's pistol_idle two-hand grip in the gun hand's frame (contacts.support_rel; before
# 2026-10-17 it hung a hand-width below the gun)
COMPOSITE = {'pistol_strafe_left', 'pistol_strafe_run_left', 'pistol_strafe_run_right'}
_GRIP = {}
def grip_ref():
    if 'rel' not in _GRIP:
        objs, src, acts = import_any(os.path.join(MX, 'yola_pistol_idle.fbx')); set_action(src, acts[0])
        _GRIP['rel'] = contacts.grip_relation(src, int(acts[0].frame_range[0]), int(acts[0].frame_range[1]))
        print('GRIP_REF', {k: (tuple(round(x, 3) for x in v) if hasattr(v, '__iter__') else v) for k, v in _GRIP['rel'].items()})
        drop(objs, acts)
    return _GRIP['rel']
def bake(src, tgt, name):
    sact = src.animation_data.action
    s0 = int(round(sact.frame_range[0]))
    if s0 != 1:  # line the source's frames up with the target's (retarget writes frames from 1)
        for fc in contacts_fcurves(sact):
            for k in fc.keyframe_points: k.co.x -= s0 - 1; k.handle_left.x -= s0 - 1; k.handle_right.x -= s0 - 1
    act = retarget(src, tgt, name); act.use_fake_user = True
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    mesh = next((c for c in tgt.children if c.type == 'MESH'), None)
    if os.environ.get('YOLA2_HANDS') == 'support':  # (test: the support hand placed in the gun hand's frame, any clip)
        contacts.support(src, tgt, act, f0, f1, CLOG, on=float(os.environ.get('YOLA2_SUPPORT_ON', 1.2)), off=float(os.environ.get('YOLA2_SUPPORT_OFF', 2.2)))
    elif name in COMPOSITE and not os.environ.get('YOLA2_NO_HANDS') and 'YOLA2_HANDS' not in os.environ:
        contacts.support_rel(tgt, act, f0, f1, grip_ref(), CLOG)  # (built from several clips: X Bot's pistol_idle grip)
    elif HOLD.search(name) and not name.startswith('kk_') and not os.environ.get('YOLA2_NO_HANDS'):  # (YOLA2_NO_HANDS: test bakes without the hand contacts; KayKit clips have no finger bones)
        # pistol clips: 'gunhand' (2026-10-17: the gun arm bends as X Bot's, no locked shoulder); the other holds as built
        # (the shotgun too: 'support' placed her left hand by X Bot's offset scaled by her bigger hands: out of reach, the
        # left arm locked straight in the hold itself, 99% vs X Bot's 84%; 'gunhand' 91%, never locked, gap within 2-6 cm)
        contacts.hands(src, tgt, act, f0, f1, CLOG, mode=os.environ.get('YOLA2_HANDS', 'gunhand' if name.startswith('pistol_') or name == 'sg_reload' else 'arm'),
                       near=float(os.environ.get('YOLA2_HANDS_NEAR', 0.5)), far=float(os.environ.get('YOLA2_HANDS_FAR', 1.0)))
    if mesh is not None:
        if tgt.name not in SHOES: SHOES[tgt.name] = contacts.shoe_vertices(mesh)
        contacts.feet(src, tgt, mesh, act, f0, f1, SHOES[tgt.name], CLOG, lock=not LOOP.search(name))
    print('CONTACTS', name, CLOG[-2:] if HOLD.search(name) else CLOG[-1:])
    return act
def contacts_fcurves(act):
    try: return list(act.fcurves)
    except Exception: pass
    out = []
    for l in act.layers:
        for st in l.strips:
            for cb in st.channelbags: out += list(cb.fcurves)
    return out
# ---- Mixamo clips: X Bot FBX -> new Yola ----
XBOT = {  # game clip -> X Bot source (matched to the first Yola's clips by motion: every one 0.0 deg apart)
    'bat_idle': 'yola_bat_idle', 'gs_low_slash': 'yola_gs_low_slash', 'p_run_back_plain': 'yola_run_back_plain',
    'p_run_plain': 'yola_run_plain', 'p_run_strafe_left_plain': 'yola_run_strafe_left_plain',
    'p_run_strafe_right_plain': 'yola_run_strafe_right_plain', 'p_walk_strafe_left_plain': 'yola_walk_strafe_left_plain',
    'p_walk_strafe_right_plain': 'yola_walk_strafe_right_plain', 'pistol_hit': 'yola_pistol_hit', 'pistol_idle': 'yola_pistol_idle',
    'pistol_run': 'yola_pistol_run', 'pistol_run_back': 'yola_pistol_run_back', 'pistol_strafe_right': 'yola_pistol_strafe_right',
    'pistol_walk': 'yola_pistol_walk', 'pistol_walk_back': 'yola_pistol_walk_back', 'reload_rifle_stand': 'yola_reload_rifle_stand',
    'rifle_aim_idle': 'yola_rifle_aim_idle', 'yola_knockdown': 'zombie_knockdown', 'yola_getup': 'zombie_standup_stomach',
    'melee_horizontal': 'yola_melee_horizontal',
    # the shotgun: straight from X Bot's rifle reload since 2026-10-17 (it was carried from the first Yola with a hand-made
    # 52 deg spine twist: her chest 51 deg off X Bot's, her gun 37 deg off; the game now keeps this clip's own heading)
    'sg_reload': 'yola_reload_rifle_stand',
}
ONLY = set(filter(None, os.environ.get('YOLA2_ONLY', '').split(',')))
# (test bakes: YOLA2_EXTRA_XBOT="name=fbx,..." adds clips straight from X Bot, e.g. pistol_reload_x=yola_reload_walk)
for pair in filter(None, os.environ.get('YOLA2_EXTRA_XBOT', '').split(',')): k, v = pair.split('='); XBOT[k] = v
for name, fbx in XBOT.items():
    if ONLY and name not in ONLY: continue
    objs, src, acts = import_any(os.path.join(MX, fbx + '.fbx'))
    set_action(src, acts[0])
    act = bake(src, Y2, name)
    (lib2 if name == 'melee_horizontal' else made2).append(act)
    drop(objs, acts)
    print('XBOT', name, tuple(int(x) for x in act.frame_range))

# ---- carried over from the first Yola (edits of Mixamo clips, and Tripo's own clips) ----
for n, src_act in first.items():
    if ONLY and n not in ONLY: continue
    if n in XBOT: continue
    set_action(Y1, src_act)
    act = bake(Y1, Y2, n); made2.append(act)
    print('CARRIED', n, tuple(int(x) for x in act.frame_range))

# ---- library moves from their own rigs (tools/anim/import_lib.py's bone maps) ----
FING = (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky'))
def bone_map(rig):
    M = {}
    if rig == 'ue':
        M = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
        for s, S in (('l', 'Left'), ('r', 'Right')):
            M.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
                      f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
            for f, F in FING:
                for i in (1, 2, 3): M[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
    elif rig == 'kaykit':  # (KayKit Character Animations 1.1, CC0: no neck, no shoulder, no finger bones)
        M = {'hips': 'Hips', 'spine': 'Spine', 'chest': 'Spine2', 'head': 'Head'}
        for s, S in (('l', 'Left'), ('r', 'Right')):
            M.update({f'upperarm.{s}': S + 'Arm', f'lowerarm.{s}': S + 'ForeArm', f'wrist.{s}': S + 'Hand',
                      f'upperleg.{s}': S + 'UpLeg', f'lowerleg.{s}': S + 'Leg', f'foot.{s}': S + 'Foot', f'toes.{s}': S + 'ToeBase'})
    elif rig == 'kevin':
        M = {'B-hips': 'Hips', 'B-spine': 'Spine', 'B-chest': 'Spine2', 'B-neck': 'Neck', 'B-head': 'Head'}
        for s, S in (('L', 'Left'), ('R', 'Right')):
            M.update({f'B-shoulder.{s}': S + 'Shoulder', f'B-upperArm.{s}': S + 'Arm', f'B-forearm.{s}': S + 'ForeArm', f'B-hand.{s}': S + 'Hand',
                      f'B-thigh.{s}': S + 'UpLeg', f'B-shin.{s}': S + 'Leg', f'B-foot.{s}': S + 'Foot', f'B-toe.{s}': S + 'ToeBase'})
            for f, F in (('thumb', 'Thumb'), ('indexFinger', 'Index'), ('middleFinger', 'Middle'), ('ringFinger', 'Ring'), ('pinky', 'Pinky')):
                for i in (1, 2, 3): M[f'B-{f}0{i}.{s}'] = f'{S}Hand{F}{i}'
    return M
def from_library(rig, path, clips, prefix, targets):
    objs, src, acts = import_any(path)
    M = bone_map(rig)
    for b in src.data.bones:
        if b.name in M: b.name = 'mixamorig:' + M[b.name]
    byname = {}
    for a in acts: byname[a.name] = a; byname[a.name.split('|')[-1]] = a
    out = []
    for c in clips:
        a = byname.get(c)
        if a is None: print('MISSING', c); continue
        set_action(src, a)
        for tgt, sink, tag in targets:
            act = bake(src, tgt, tag + prefix + c); sink.append(act)
            print('LIB', tgt.name, act.name, tuple(int(x) for x in act.frame_range))
    drop(objs, acts)
# the bat: Sword Regular Combo (UAL2, CC0) and Sword Idle (UAL1) on both Yolas; the other arena picks on the new one
# (test bakes: YOLA2_EXTRA_UAL1="Pistol_Reload,Pistol_Shoot" retargets those UAL1 clips onto the new Yola, as ual1_<name>)
if os.environ.get('YOLA2_EXTRA_UAL1'): from_library('ue', UAL1, os.environ['YOLA2_EXTRA_UAL1'].split(','), 'ual1_', [(Y2, made2, '')])
# (test bakes: YOLA2_EXTRA_KK="<Rig_Medium_*.glb>:A,B;<file>:C" retargets KayKit clips onto the new Yola, as kk_<name>)
for grp in filter(None, os.environ.get('YOLA2_EXTRA_KK', '').split(';')):
    f, names = grp.rsplit(':', 1); from_library('kaykit', f, names.split(','), 'kk_', [(Y2, made2, '')])
if os.environ.get('YOLA2_EXTRA_UAL2'): from_library('ue', UAL2, os.environ['YOLA2_EXTRA_UAL2'].split(','), 'ual_', [(Y2, made2, '')])  # (the same from UAL2, as ual_<name>)
if not ONLY: from_library('ue', UAL2, ['Sword_Regular_Combo'], 'ual_', [(Y2, made2, ''), (Y1, made1, 'Y1S_')])
if not ONLY: from_library('ue', UAL1, ['Sword_Idle'], 'ual1_', [(Y2, made2, ''), (Y1, made1, 'Y1S_')])  # (the bat's idle: the stance the combo starts from)
if not ONLY: from_library('ue', UAL2, ['Sword_Heavy_Combo', 'Sword_Dash', 'Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B', 'Sword_Regular_C', 'Melee_Hook'], 'ual_', [(Y2, lib2, '')])
if not ONLY: from_library('ue', UAL1, ['Sword_Attack', 'Hit_Chest', 'Hit_Head', 'Roll'], 'ual1_', [(Y2, lib2, '')])
for f in ([] if ONLY else ['Combat/Polearm/HumanF@AttackPolearm01', 'Combat/1H/HumanF@Attack1H01_L', 'Combat/2H/HumanF@Attack2H01', 'Combat/HumanF@CombatDamage01']):
    p = os.path.join(KEVM, 'Animations', 'Female', *f.split('/')) + '.fbx'
    if os.path.exists(p):
        objs, src, acts = import_any(p); M = bone_map('kevin')
        for b in src.data.bones:
            if b.name in M: b.name = 'mixamorig:' + M[b.name]
        set_action(src, acts[0])
        act = bake(src, Y2, 'kev_' + os.path.basename(f).replace('@', '_')); lib2.append(act)
        print('LIB', act.name, tuple(int(x) for x in act.frame_range)); drop(objs, acts)
    else: print('MISSING', p)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('SAVED', OUT_BLEND)
json.dump({'game': [a.name for a in made2], 'first': [a.name for a in made1], 'lib': [a.name for a in lib2]}, open(OUT_BLEND + '.json', 'w'))
print('BUILD_DONE', len(made2), len(made1), len(lib2))
