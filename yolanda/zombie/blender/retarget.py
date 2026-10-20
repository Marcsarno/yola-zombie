# Retarget Mixamo clips (FBX, "without skin") onto Tripo characters that use mixamorig bone names.
# Rest poses differ (Mixamo X Bot T-pose vs Tripo A-pose), so rotations are transferred as
# "world-space change from rest" per bone, and the hips translation is scaled by leg height.
# Usage inside Blender:  exec(open(path).read()); retarget_fbx(fbx_path, target_armature, action_name)
import bpy, mathutils

def _win_override():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    return dict(window=win, area=area, region=area.regions[-1])

def _order(arm):
    out = []
    def walk(b):
        out.append(b)
        for c in b.children: walk(c)
    for b in arm.data.bones:
        if b.parent is None: walk(b)
    return out

def _facing(a):  # the feet's toe direction at rest (world, level)
    try:
        W = a.matrix_world; d = a.data.bones
        v = sum(((W @ d['mixamorig:%sToeBase' % s].head_local) - (W @ d['mixamorig:%sFoot' % s].head_local) for s in ('Left', 'Right')), mathutils.Vector())
        v.z = 0; return v.normalized() if v.length > 1e-6 else None
    except KeyError: return None

def retarget(src, tgt, name, frame_range=None, hips='mixamorig:Hips', rest_relative=()):
    # rest_relative: bones that copy the source bone's TURN FROM ITS OWN REST relative to its parent, instead of its
    # direction (Marc's collarbones, 2026-10-20: the mannequin's slope back 38 deg at rest, X Bot's 12, his 3; copying
    # the direction pulled his shoulders back ~6.5 cm in the Quaternius idle and pinched his shoulder blades).
    sc = bpy.context.scene
    S = src.matrix_world.to_quaternion(); T = tgt.matrix_world.to_quaternion()
    Tinv = T.inverted()
    fs, ft = _facing(src), _facing(tgt)
    Yf = fs.rotation_difference(ft) if fs is not None and ft is not None else mathutils.Quaternion()
    # leg-length scale for the hips translation (world units)
    def hip_h(a):
        b = a.data.bones[hips]
        return (a.matrix_world @ b.head_local).z - min((a.matrix_world @ x.head_local).z for x in a.data.bones)
    k = hip_h(tgt) / hip_h(src)
    # target bones the source lacks (e.g. a two-bone spine driving a three-bone one) keep their rest pose relative to
    # their parent and are carried along, so everything below them still follows the body
    allb = _order(tgt)
    bones = [b for b in allb if b.name in src.data.bones]
    carried = {b.name for b in allb if b.name not in src.data.bones and b.parent is not None}
    rest_t = {b.name: b.matrix_local.copy() for b in tgt.data.bones}
    rest_s = {b.name: src.data.bones[b.name].matrix_local.copy() for b in bones}
    # per-bone constant: world-space rest offset
    # A aligns the target's rest bone direction with the source's (A-pose -> T-pose) so the source's
    # change from ITS rest pose lands on a target bone that starts from the same direction.
    off = {}
    for b in bones:
        sb = src.data.bones[b.name]
        Rs = S @ rest_s[b.name].to_quaternion()
        Rt = T @ rest_t[b.name].to_quaternion()
        dt = (T @ (b.tail_local - b.head_local)).normalized()
        ds = (S @ (sb.tail_local - sb.head_local)).normalized()
        A = dt.rotation_difference(ds)
        off[b.name] = Rs.inverted() @ A @ Rt
    act = bpy.data.actions.new(name)
    if not tgt.animation_data: tgt.animation_data_create()
    tgt.animation_data.action = act
    for pb in tgt.pose.bones: pb.rotation_mode = 'QUATERNION'
    sact = src.animation_data.action
    f0, f1 = frame_range or (int(sact.frame_range[0]), int(sact.frame_range[1]))
    src_hips_rest = src.matrix_world @ rest_s[hips].translation
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        P = {}
        for b in allb:
            if b.name in carried:
                if b.parent.name in P:
                    P[b.name] = P[b.parent.name] @ (rest_t[b.parent.name].inverted() @ rest_t[b.name])
                    tpb = tgt.pose.bones[b.name]; tpb.rotation_quaternion = (1, 0, 0, 0)
                    tpb.keyframe_insert('rotation_quaternion', frame=f - f0 + 1)
                continue
            if b.name not in off: continue
            spb = src.pose.bones[b.name]
            Ws = S @ spb.matrix.to_quaternion() # source posed world rotation
            Wt = Ws @ off[b.name]                  # target posed world rotation
            if b.name in rest_relative and b.parent and b.parent.name in P and b.parent.name in src.pose.bones:
                Rs = S @ rest_s[b.name].to_quaternion(); Rps = S @ src.data.bones[b.parent.name].matrix_local.to_quaternion()
                Wps = S @ src.pose.bones[b.parent.name].matrix.to_quaternion()
                rel = (Wps @ Rps.inverted()).inverted() @ (Ws @ Rs.inverted())   # its turn from rest, relative to its parent's
                Wpt = T @ P[b.parent.name].to_quaternion(); Rpt = T @ rest_t[b.parent.name].to_quaternion()
                Wt = (Wpt @ Rpt.inverted()) @ (Yf @ rel @ Yf.inverted()) @ (T @ rest_t[b.name].to_quaternion())
            Rarm = Tinv @ Wt                       # in target armature space
            if b.parent and b.parent.name in P:
                Pp = P[b.parent.name]
                head = Pp @ (rest_t[b.parent.name].inverted() @ rest_t[b.name]).translation
            elif b.parent:
                head = rest_t[b.name].translation  # parent not retargeted: keep rest
            else:
                head = rest_t[b.name].translation
            if b.name == hips:
                dw = (src.matrix_world @ spb.matrix.translation) - src_hips_rest
                head = rest_t[b.name].translation + (tgt.matrix_world.inverted().to_3x3() @ (dw * k))
            M = mathutils.Matrix.Translation(head) @ Rarm.to_matrix().to_4x4()
            P[b.name] = M
            # local basis: L = (Rest_p^-1 Rest_b)^-1 Pp^-1 P_b
            if b.parent and b.parent.name in P:
                rel = rest_t[b.parent.name].inverted() @ rest_t[b.name]
                L = rel.inverted() @ P[b.parent.name].inverted() @ M
            else:
                L = rest_t[b.name].inverted() @ M
            tpb = tgt.pose.bones[b.name]
            loc, rot, _ = L.decompose()
            tpb.rotation_quaternion = rot
            tpb.keyframe_insert('rotation_quaternion', frame=f - f0 + 1)
            if b.name == hips:
                tpb.location = loc
                tpb.keyframe_insert('location', frame=f - f0 + 1)
    return act

def import_fbx_armature(path):
    before = set(bpy.data.objects); acts = set(bpy.data.actions)
    with bpy.context.temp_override(**_win_override()):
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    return arm, new, [a for a in bpy.data.actions if a not in acts]

def retarget_fbx(path, tgt, name):
    arm, new, acts = import_fbx_armature(path)
    try:
        act = retarget(arm, tgt, name)
    finally:
        for o in new: bpy.data.objects.remove(o, do_unlink=True)
        for a in acts: bpy.data.actions.remove(a)
    act.use_fake_user = True
    return act
