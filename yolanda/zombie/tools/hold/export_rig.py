# Export Yola's skeleton for rigfit.py (fitting her own rig to multi-view 2D tracks outside Blender).
# Writes: every bone (parent, rest head, rest orientation, all in armature space, model units), the shoe sole points of
# each foot in its Foot bone's local frame (for floor contact), and the head's front point (the reference's "nose").
# usage: blender -b blender/characters.blend --python tools/hold/export_rig.py -- <out.json>
import bpy, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import holdlib as H
out = sys.argv[sys.argv.index('--') + 1:][0]
arm, body = H.rig()
bones = []
for b in arm.data.bones:
    m = b.matrix_local
    bones.append({'name': b.name.replace('mixamorig:', ''), 'parent': b.parent.name.replace('mixamorig:', '') if b.parent else None,
                  'head': list(b.head_local), 'tail': list(b.tail_local), 'rot': [list(r) for r in m.to_3x3().normalized()]})
gi = {g.index: g.name.replace('mixamorig:', '') for g in body.vertex_groups}
toA = arm.matrix_world.inverted() @ body.matrix_world
soles = {s: [] for s in H.SIDES}; head_pts = []
for v in body.data.vertices:
    if not v.groups: continue
    g = gi.get(max(v.groups, key=lambda e: e.weight).group, '')
    p = toA @ v.co
    for s in H.SIDES:
        if g in (s + 'Foot', s + 'ToeBase', s + 'Toe_End'): soles[s].append(p)
    if g.startswith('Head'): head_pts.append(p)
sole_out = {}
for s, ps in soles.items():
    fb = arm.data.bones['mixamorig:' + s + 'Foot']; Mi = fb.matrix_local.inverted()
    low = sorted(ps, key=lambda p: p.z)[:max(40, len(ps) // 6)]  # the sole: the lowest sixth of the shoe
    sole_out[s] = [list(Mi @ p) for p in low[::max(1, len(low) // 60)]]
hb = arm.data.bones['mixamorig:Head']
front = min(head_pts, key=lambda p: p.y)  # Yola faces -Y in the armature
json.dump({'bones': bones, 'soles_local': sole_out, 'head_front_local': list(hb.matrix_local.inverted() @ front),
           'units_to_m': H.M}, open(out, 'w'))
print('EXPORTED', len(bones), 'bones', {s: len(v) for s, v in sole_out.items()}, 'sole points')
