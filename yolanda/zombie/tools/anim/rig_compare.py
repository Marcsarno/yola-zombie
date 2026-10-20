# Rest-pose comparison of a character's rig against Yola 2 and the reference rigs (Quaternius mannequin, Mixamo X Bot):
# height, limb lengths as a share of height, the rest pose's arm / leg angles, and how far each bone's own axis is off its
# limb line (the retarget points a bone along the SOURCE bone's axis: WEAPON_HOLD_PROCESS.md section 17).
# usage: blender -b --factory-startup --python tools/anim/rig_compare.py -- <assets dir> <out.json> <label=file> [...]
import bpy, sys, os, json, math
argv = sys.argv[sys.argv.index('--') + 1:]
A, OUT, items = argv[0], argv[1], [x.split('=', 1) for x in argv[2:]]
UE = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    UE.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
               f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase', f'middle_01_{s}': S + 'HandMiddle1'})
res = {}
for label, path in items:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    p = os.path.join(A, path)
    if p.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=p, automatic_bone_orientation=False)
    else: bpy.ops.import_scene.gltf(filepath=p)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    for b in arm.data.bones:
        n = b.name.split(':')[-1]
        b.name = 'mixamorig:' + UE.get(n, n)
    bpy.context.view_layer.update()
    W = arm.matrix_world
    def h(n): return W @ arm.data.bones['mixamorig:' + n].head_local
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Icosphere') and o.find_armature() is not None]
    print('MESHES', label, [(o.name, round(o.dimensions.z, 3)) for o in meshes])
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    H = max(zs) - min(zs); z0 = min(zs)
    d = lambda a, b: (h(b) - h(a)).length
    r = {'height_units': round(H, 4), 'bones': len(arm.data.bones), 'fingers': any('HandIndex' in b.name for b in arm.data.bones)}
    L = {'hips_height': h('Hips').z - z0, 'thigh': d('LeftUpLeg', 'LeftLeg'), 'shin': d('LeftLeg', 'LeftFoot'), 'foot_to_toe': d('LeftFoot', 'LeftToeBase'),
         'upper_arm': d('LeftArm', 'LeftForeArm'), 'forearm': d('LeftForeArm', 'LeftHand'), 'hand_to_mid1': d('LeftHand', 'LeftHandMiddle1'),
         'shoulder_width': d('LeftArm', 'RightArm'), 'hip_width': d('LeftUpLeg', 'RightUpLeg'), 'spine_hips_to_neck': d('Hips', 'Neck'),
         'neck_to_head': d('Neck', 'Head'), 'head_to_top': max(zs) - h('Head').z}
    r['share_of_height'] = {k: round(v / H, 4) for k, v in L.items()}
    up = (h('LeftForeArm') - h('LeftArm')).normalized()
    r['rest_arm_down_deg'] = round(math.degrees(math.asin(max(-1, min(1, -up.z)))), 1)  # 0 = T-pose, 90 = arms hanging
    lg = (h('LeftFoot') - h('LeftUpLeg')).normalized()
    r['rest_leg_out_deg'] = round(math.degrees(math.atan2(abs(lg.x), -lg.z)), 1)
    # each bone's own Y axis vs the line to its child's head
    off = {}
    for n, c in (('Hips', 'Spine'), ('Spine2', 'Neck'), ('Neck', 'Head'), ('LeftArm', 'LeftForeArm'), ('LeftForeArm', 'LeftHand'),
                 ('LeftHand', 'LeftHandMiddle1'), ('LeftUpLeg', 'LeftLeg'), ('LeftLeg', 'LeftFoot'), ('LeftFoot', 'LeftToeBase')):
        b = arm.data.bones['mixamorig:' + n]
        ax = (W.to_3x3() @ b.matrix_local.to_3x3().col[1]).normalized(); ln = (h(c) - h(n)).normalized()
        off[n] = round(math.degrees(ax.angle(ln)), 1)
    r['axis_vs_limb_deg'] = off
    res[label] = r
    print('RIG', label, json.dumps(r))
json.dump(res, open(OUT, 'w'), indent=1)
