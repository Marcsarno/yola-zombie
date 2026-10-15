# Per-character calibration (WEAPON_HOLD_PROCESS.md section 3): fist centres and grip axes, elbow hinge axes, body capsules.
# usage: blender -b blender/characters.blend --python tools/hold/calibrate.py -- <out.json> [grip_action] [grip_frame]
import bpy, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import holdlib as H

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]; grip_action = argv[1] if len(argv) > 1 else 'bat_idle'; grip_frame = int(argv[2]) if len(argv) > 2 else 1
arm, body = H.rig()
H.use_action(arm, grip_action); bpy.context.scene.frame_set(grip_frame)
cal = {'character': 'YOLA', 'units_to_m': H.M, 'grip_pose': [grip_action, grip_frame], 'hands': {}}
for s in H.SIDES:
    cal['hands'][s] = H.calibrate_hand(arm, s)
    c = cal['hands'][s]
    print('HAND', s, 'fist centre (cm, hand space)', [round(v * H.M * 100, 2) for v in c['centre']], 'axis', [round(v, 3) for v in c['axis']],
          'finger circle r', round(c['radius'] * H.M * 100, 2), 'cm; index-pinky', round(c['width'] * H.M * 100, 1), 'cm; curl', round(H.finger_curl(arm, s)))
cal['hinge'] = H.elbow_hinges(arm, ['bat_idle', 'bat_swing', 'baseball_double', 'baseball_homerun', 'heavy_swing', 'melee_horizontal',
                                    'pistol_idle', 'pistol_reload', 'sg_reload', 't_chop', 'gs_low_slash'])
print('HINGE', {s: [round(v, 3) for v in cal['hinge'][s]] for s in H.SIDES})
cal['capsules'] = H.fit_capsules(arm, body)
for n, c in cal['capsules'].items(): print('CAPSULE', n, c['a'], '->', c['b'], 'r', round(c['r'] * H.M * 100, 1), 'cm', 'verts', c['n'])
# sanity: the rest pose must be inside every limit (else the angle definitions are wrong)
H.use_action(arm, grip_action); bpy.context.scene.frame_set(grip_frame)
JF = H.joint_frames(arm, cal)
for s in H.SIDES:
    a = H.measure_arm(arm, s, JF, cal['hinge']); print('ANGLES', grip_action, grip_frame, s, {k: round(v, 1) for k, v in a.items()}, 'faults', H.limit_faults(a))
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(cal, open(out, 'w'), indent=1)
print('WROTE', out)
