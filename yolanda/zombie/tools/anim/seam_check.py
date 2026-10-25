# Seams: vertex pairs that touch at rest (< 1 mm) but follow different bones; how far they drift apart in every clip.
import bpy, sys
from mathutils.kdtree import KDTree
f = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=f)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); me = next(o for o in bpy.data.objects if o.type == 'MESH')
V = me.data.vertices; W = me.matrix_world
names = {g.index: g.name.split(':')[-1] for g in me.vertex_groups}
dom = lambda v: names[max(v.groups, key=lambda g: g.weight).group] if v.groups else None
kd = KDTree(len(V))
for v in V: kd.insert(W @ v.co, v.index)
kd.balance()
# each vertex: its own piece (loose part); pairs = nearest vertex of ANOTHER piece within 1 cm whose dominant bone differs
import bmesh
bm = bmesh.new(); bm.from_mesh(me.data); bm.verts.ensure_lookup_table()
piece = [-1] * len(V); pid = 0
for v0 in bm.verts:
    if piece[v0.index] >= 0: continue
    st = [v0]; piece[v0.index] = pid
    while st:
        x = st.pop()
        for e in x.link_edges:
            y = e.other_vert(x)
            if piece[y.index] < 0: piece[y.index] = pid; st.append(y)
    pid += 1
print("PIECES", pid)
pairs = []
for v in V:
    best = None
    for co, j, d in kd.find_range(W @ v.co, 0.01):
        if piece[j] != piece[v.index] and dom(V[j]) != dom(v) and (best is None or d < best[2]): best = (v.index, j, d)
    if best and best[1] > v.index: pairs.append((best[0], best[1], dom(v), dom(V[best[1]]), best[2]))
print('SEAM PAIRS', len(pairs))
dg = bpy.context.evaluated_depsgraph_get(); worst = {}
for act in bpy.data.actions:
    arm.animation_data.action = act
    try: arm.animation_data.action_slot = act.slots[0]
    except Exception: pass
    f0, f1 = map(int, act.frame_range)
    for fr in range(f0, f1 + 1, 4):
        bpy.context.scene.frame_set(fr); ev = me.evaluated_get(dg); m = ev.to_mesh(); P = m.vertices
        for i, j, a, b, d0 in pairs:
            gap = (((P[i].co - P[j].co) @ W.to_3x3().transposed()).length - d0) * 100
            k = tuple(sorted((a, b)))
            if gap > worst.get(k, (0,))[0]: worst[k] = (gap, act.name, fr)
        ev.to_mesh_clear()
for k, (g, a, fr) in sorted(worst.items(), key=lambda kv: -kv[1][0])[:12]:
    print('GAP %-28s %5.2f cm  (%s frame %d)' % ('/'.join(k), g, a, fr))
