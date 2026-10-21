# Build a game zombie from a Tripo character (mixamorig skeleton, 1.0 tall): clean the rig, retarget the zombie move set,
# export one GLB for the game (render/clipchars.js ZombieView: clips by name, as NLA-free actions).
# Steps:
#  1. import; drop the importer's stray bone-shape sphere.
#  2. hand weights (--fix-hands): Tripo's auto-weights tie the clothing beside her hanging hands (cargo pockets, shirt hem)
#     to the hand and finger bones, so it stretches out in strips whenever the arms swing. A vertex below the elbow with
#     hand / forearm weight whose rest position lies nearer the thigh or the torso than the hand (each measured in that
#     part's own radius, from the mesh) takes the weights of its nearest clean neighbours instead. (Found and checked by
#     eye in Blender on big+black+lady, 2026-10-15: 105 pocket vertices.)
#  3. texture down to 1024 px (as the other characters).
#  4. retarget (blender/retarget.py) the Mixamo zombie set (assets/mixamo/zombie_*.fbx) plus library clips.
#  5. export GLB with every action.
# usage: blender -b --factory-startup --python tools/anim/build_zombie.py -- <in.glb> <out.glb> <ual1.glb> <ual2.glb> [--fix-hands] [--extra name=src:clip,...]
import bpy, sys, os, re, statistics
from mathutils.geometry import intersect_point_line
from mathutils.kdtree import KDTree
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'blender'))
from retarget import retarget

argv = sys.argv[sys.argv.index('--') + 1:]
src_glb, out_glb, UAL1, UAL2 = argv[:4]
KK = argv[argv.index('--kk') + 1] if '--kk' in argv else None  # KayKit Rig_Medium_CombatMelee.glb (optional)
FIX = '--fix-hands' in argv
extra = {}
if '--extra' in argv:
    for item in argv[argv.index('--extra') + 1].split(','):
        name, rest = item.split('='); lib, clip = rest.split(':'); extra[name] = (lib, clip)
MIX = os.path.join(HERE, '..', '..', 'assets', 'mixamo')
MIXAMO_SET = ['walk', 'idle', 'attack', 'hit_flinch', 'hit_stumble', 'death_back', 'death_forward', 'death_headshot_knees', 'death_chest_back',
              'react_large_front', 'react_large_back', 'react_large_left', 'react_large_right', 'knockdown', 'standup_stomach', 'crawl',
              'stumble_fall', 'standup_back']

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src_glb)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.vertex_groups: bpy.data.objects.remove(o, do_unlink=True)  # the stray sphere
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.name = 'ZOMBIE'
me = next(o for o in bpy.data.objects if o.type == 'MESH')
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

# ---- 2. hand weights ----
if FIX:
    names = {g.index: g.name.replace('mixamorig:', '') for g in me.vertex_groups}
    handlike = lambda n: bool(re.match(r'(Left|Right)(Hand|ForeArm)', n))
    B = lambda n: arm.data.bones['mixamorig:' + n]
    def dseg(p, pts):
        best = 9
        for a, b in zip(pts, pts[1:]):
            q, t = intersect_point_line(p, a, b); t = max(0, min(1, t)); best = min(best, (p - (a + (b - a) * t)).length)
        return best
    CH = {'torso': [B('Hips').head_local, B('Spine2').tail_local]}
    for s in ('Left', 'Right'):
        CH[s + 'hand'] = [B(s + 'ForeArm').head_local, B(s + 'Hand').head_local, B(s + 'HandMiddle4').tail_local]
        CH[s + 'leg'] = [B(s + 'UpLeg').head_local, B(s + 'Leg').head_local]
    V = me.data.vertices
    wsum = lambda v, test: sum(g.weight for g in v.groups if test(names[g.group]))
    def radius(key, test):
        ds = [dseg(v.co, CH[key]) for v in V if wsum(v, test) > 0.6]
        return statistics.median(ds)
    R = {'hand': radius('Lefthand', lambda n: n.startswith('LeftHand') or n == 'LeftForeArm'),
         'leg': radius('Leftleg', lambda n: n == 'LeftUpLeg'), 'torso': radius('torso', lambda n: n in ('Hips', 'Spine', 'Spine1'))}
    elbow = min(B('LeftForeArm').head_local.z, B('RightForeArm').head_local.z)
    bad = []
    for v in V:
        if v.co.z >= elbow or wsum(v, handlike) <= 0: continue
        s = 'Left' if v.co.x > 0 else 'Right'
        dh = dseg(v.co, CH[s + 'hand']) / R['hand']
        if min(dseg(v.co, CH[s + 'leg']) / R['leg'], dseg(v.co, CH['torso']) / R['torso']) < dh * 0.9: bad.append(v.index)
    badset = set(bad)
    don = [v for v in V if v.index not in badset and not any(handlike(names[g.group]) for g in v.groups)]
    kd = KDTree(len(don))
    for k, v in enumerate(don): kd.insert(v.co, k)
    kd.balance()
    for i in bad:
        v = V[i]; acc = {}
        for co, k, d in kd.find_n(v.co, 8):
            w = 1 / max(d, 1e-4)
            for g in don[k].groups: acc[g.group] = acc.get(g.group, 0) + g.weight * w
        tot = sum(acc.values())
        for g in list(v.groups): me.vertex_groups[g.group].remove([i])
        for gi, w in sorted(acc.items(), key=lambda x: -x[1])[:4]: me.vertex_groups[gi].add([i], w / tot, 'REPLACE')
    print('HANDFIX radii', {k: round(v, 3) for k, v in R.items()}, 'reweighted', len(bad))

# ---- 3. texture ----
for m in me.data.materials:
    if m and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > 1024: n.image.scale(1024, 1024)
# slimming for store characters (Zombie Male AAB, 2026-10-20): --no-normals drops the normal maps (the Tripo zombies have
# none, so the game lights them without); --opaque a,b turns those materials' cut-out off (a texture whose alpha is only
# edge padding then exports as JPEG instead of PNG)
OPAQUE = argv[argv.index('--opaque') + 1].split(',') if '--opaque' in argv else []
for m in me.data.materials:
    if not (m and m.node_tree): continue
    if '--no-normals' in argv:
        for n in [n for n in m.node_tree.nodes if n.type == 'NORMAL_MAP']:
            for l in list(n.inputs['Color'].links): m.node_tree.nodes.remove(l.from_node)
            m.node_tree.nodes.remove(n)
    if m.name in OPAQUE:
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            for l in list(bsdf.inputs['Alpha'].links): m.node_tree.links.remove(l)
            bsdf.inputs['Alpha'].default_value = 1.0
        try: m.blend_method = 'OPAQUE'
        except Exception: pass
        for n in m.node_tree.nodes:  # the exporter keeps PNG for an image with alpha: drop the alpha from the copy it writes
            if n.type == 'TEX_IMAGE' and n.image: n.image.alpha_mode = 'NONE'

# ---- 4. moves ----
def kaykit_names(src):
    MAP = {'hips': 'Hips', 'spine': 'Spine', 'chest': 'Spine2', 'head': 'Head'}
    for s, S in (('l', 'Left'), ('r', 'Right')):
        MAP.update({f'upperarm.{s}': S + 'Arm', f'lowerarm.{s}': S + 'ForeArm', f'wrist.{s}': S + 'Hand',
                    f'upperleg.{s}': S + 'UpLeg', f'lowerleg.{s}': S + 'Leg', f'foot.{s}': S + 'Foot', f'toes.{s}': S + 'ToeBase'})
    for b in src.data.bones:
        if b.name in MAP: b.name = 'mixamorig:' + MAP[b.name]
def ue_names(src):
    MAP = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
    for s, S in (('l', 'Left'), ('r', 'Right')):
        MAP.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
                    f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
        for f, F in (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky')):
            for i in (1, 2, 3): MAP[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
    for b in src.data.bones:
        if b.name in MAP: b.name = 'mixamorig:' + MAP[b.name]
def take(path, wanted):  # wanted: {source clip (None = the only one): name}
    before = set(bpy.data.objects); acts0 = set(bpy.data.actions)
    if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
    else: bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    if path == KK: kaykit_names(src)
    elif not path.lower().endswith('.fbx'): ue_names(src)
    acts = [a for a in bpy.data.actions if a not in acts0]
    src.animation_data_create()
    for clip, name in wanted.items():
        a = acts[0] if clip is None else next(x for x in acts if x.name.split('|')[-1] == clip)
        src.animation_data.action = a
        try: src.animation_data.action_slot = a.slots[0]
        except Exception: pass
        act = retarget(src, arm, name); act.use_fake_user = True
        print('CLIP', name, tuple(int(v) for v in act.frame_range))
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    for x in acts: bpy.data.actions.remove(x)
for n in MIXAMO_SET: take(os.path.join(MIX, 'zombie_' + n + '.fbx'), {None: n})
libs = {'ual1': UAL1, 'ual2': UAL2, 'kk': KK}
by = {}
for name, (lib, clip) in extra.items(): by.setdefault(lib, {})[clip] = name
for lib, wanted in by.items(): take(libs[lib], wanted)

# ---- 5. export ----
ad = arm.animation_data; ad.action = None
for o in bpy.data.objects: o.select_set(o in (arm, me))
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                          export_frame_step=1, export_image_format='JPEG', export_jpeg_quality=88)
print('WROTE', out_glb, 'height', round(me.dimensions.z, 3))
