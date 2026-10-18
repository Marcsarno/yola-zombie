# The ward bed with one side rail taken off (2026-10-18, the user: the patient getting out of bed "clips through the bed
# guard rail.. either we adjust the animation or remove one of the rails"): assets/hospital/recovery_bed.glb copied twice,
# its half-length side rail (and its hinge bits) removed on one long side: recovery_bed_open_nx.glb (the bed's own -X side
# open), recovery_bed_open_px.glb (+X). The game puts a bed patient's bed on the side it gets out of (core/chapter.js).
# Run in Blender (the live session): exec(open(r'<this file>').read())
import bpy, bmesh, os

ROOT = r'C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie'
SRC = os.path.join(ROOT, 'assets', 'hospital', 'recovery_bed.glb')

sc = bpy.data.scenes.get('bed_open') or bpy.data.scenes.new('bed_open')
bpy.context.window.scene = sc
for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)

def build(side, x_off):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC)
    m = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
    m.name = 'recovery_bed_open_' + side
    bm = bmesh.new(); bm.from_mesh(m.data); bm.verts.ensure_lookup_table()
    seen, kill = set(), []
    for v in bm.verts:  # loose parts: a rail part lies wholly out past the mattress on that side, up at rail height
        if v.index in seen: continue
        st, comp = [v], []; seen.add(v.index)
        while st:
            a = st.pop(); comp.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen: seen.add(b.index); st.append(b)
        xs = [q.co.x for q in comp]; zs = [q.co.z for q in comp]
        out = min(xs) > 0.4 if side == 'px' else max(xs) < -0.4
        if out and min(zs) > 0.45: kill += comp
    print(side, 'removing', len(kill), 'verts')
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(m.data); bm.free()
    m.location.x = x_off
    return m

beds = [build('nx', -0.8), build('px', 0.8)]
for m in beds:
    for o in bpy.data.objects:
        try: o.select_set(False)
        except RuntimeError: pass
    m.select_set(True)
    loc = m.location.x; m.location.x = 0
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'hospital', m.name + '.glb'), use_selection=True, use_active_scene=True, export_format='GLB', export_yup=True)
    m.location.x = loc
    print('exported', m.name)
