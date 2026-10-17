# The reveal's burst (2026-10-17, the opening chat): the modular patient zombie (assets/zombie-patient-mod.glb: head,
# forearms, lower legs, torso, with the gore kit's caps) cut further so the home run can blow him into pieces: the torso
# becomes chest, pelvis, two upper arms and two thighs. Every cut is closed (the mod file's burgundy tissue) and capped on
# both sides by blender/gore_kit.py (torn skin, fat, muscle, splintered bone), plus guts out of the waist and loose gibs.
# Everything stays skinned to the same skeleton, so the game can pose it exactly as the live zombie stands at the hit,
# bake each chunk to a still mesh and throw it. Meshes are named B__<chunk>__<part>; the chunks are what fly.
# Writes a SEPARATE file used by the opening alone; assets/zombie-patient-mod.glb and its build are untouched.
#   assets/opening/zombie-patient-burst.glb
# usage: blender -b --factory-startup --python tools/opening/make_zombie_burst.py -- <assets dir> [preview.png]
import bpy, bmesh, sys, os, math, random
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:]
A = argv[0]; PREVIEW = argv[1] if len(argv) > 1 else None
exec(open(os.path.join(HERE, '..', '..', 'blender', 'gore_kit.py')).read())  # build_piece, gore_material, colours

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(A, 'zombie-patient-mod.glb'))
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.parent is None: bpy.data.objects.remove(o, do_unlink=True)  # (a stray icosphere)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.animation_data_clear(); arm.data.pose_position = 'REST'
for pb in arm.pose.bones: pb.matrix_basis.identity()
bones = arm.data.bones
M = lambda n: 'mixamorig:' + n
TISSUE = 'Fracture | Deep burgundy closed tissue'

# ---- 1. the torso split by its skin weights: each face goes to the chunk its vertices are mostly weighted to ----
CHUNK_OF = {}
for b in ['Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder']: CHUNK_OF[M(b)] = 'Chest'
for b in ['Hips', 'Spine']: CHUNK_OF[M(b)] = 'Pelvis'
for side, S in (('Left', 'L'), ('Right', 'R')):
    for b in ['Arm', 'ForeArm', 'Hand']: CHUNK_OF[M(side + b)] = 'UpperArm_' + S
    for b in ['UpLeg', 'Leg', 'Foot']: CHUNK_OF[M(side + b)] = 'Thigh_' + S
torso = bpy.data.objects['Patient_Torso']; me = torso.data
gname = {g.index: g.name for g in torso.vertex_groups}
def vchunks(v):
    acc = {}
    for g in v.groups:
        n = gname[g.group]; c = CHUNK_OF.get(n)
        if c is None: c = 'UpperArm_L' if 'LeftHand' in n else 'UpperArm_R' if 'RightHand' in n else 'Thigh_L' if 'LeftToe' in n else 'Thigh_R' if 'RightToe' in n else 'Chest'
        acc[c] = acc.get(c, 0) + g.weight
    return acc
vc = [vchunks(v) for v in me.vertices]
face_chunk = []
for p in me.polygons:
    acc = {}
    for vi in p.vertices:
        for c, w in vc[vi].items(): acc[c] = acc.get(c, 0) + w
    face_chunk.append(max(acc, key=acc.get))
# clean edges: a face goes with most of its neighbours (a few passes), then small islands join the chunk they touch most,
# so the cuts run along clean lines instead of leaving loose shards of gown
# (adjacency by vertex POSITION: the glTF mesh is split along its UV seams, which must not count as edges of the surface)
key = lambda co: tuple(round(x, 5) for x in co)
ekey = lambda a, b: tuple(sorted((key(a), key(b))))
edge_faces = {}
for p in me.polygons:
    vs = [me.vertices[i].co for i in p.vertices]
    for k in range(len(vs)): edge_faces.setdefault(ekey(vs[k], vs[(k + 1) % len(vs)]), []).append(p.index)
nbr = [[] for _ in me.polygons]
for fs_ in edge_faces.values():
    for i in fs_: nbr[i] += [j for j in fs_ if j != i]
for _ in range(4):
    nxt = face_chunk[:]
    for i, ns in enumerate(nbr):
        if not ns: continue
        cnt = {}
        for j in ns: cnt[face_chunk[j]] = cnt.get(face_chunk[j], 0) + 1
        best = max(cnt, key=cnt.get)
        if cnt[best] > cnt.get(face_chunk[i], 0) and cnt[best] >= 2: nxt[i] = best
    face_chunk = nxt
for _ in range(3):
    seen = [False] * len(face_chunk)
    for s in range(len(face_chunk)):
        if seen[s]: continue
        isl, stack = [], [s]; seen[s] = True
        while stack:
            i = stack.pop(); isl.append(i)
            for j in nbr[i]:
                if not seen[j] and face_chunk[j] == face_chunk[s]: seen[j] = True; stack.append(j)
        if len(isl) >= 60: continue
        cnt = {}
        for i in isl:
            for j in nbr[i]:
                if face_chunk[j] != face_chunk[s]: cnt[face_chunk[j]] = cnt.get(face_chunk[j], 0) + 1
        if cnt:
            best = max(cnt, key=cnt.get)
            for i in isl: face_chunk[i] = best
CHUNKS = sorted(set(face_chunk)); print('torso chunks', {c: face_chunk.count(c) for c in CHUNKS})

pieces = {}
for c in CHUNKS:
    ob = torso.copy(); ob.data = me.copy(); ob.name = 'B__%s__skin' % c; bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if face_chunk[f.index] != c], context='FACES')
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)  # (the seams closed: UVs are per corner, kept)
    pieces[c] = (ob, bm)

# ---- 2. each new cut: closed with the burgundy tissue, and a ring for the gore caps ----
tissue_i = [m.name for m in me.materials].index(TISSUE)
orig_boundary = {k for k, v in edge_faces.items() if len(v) == 1}  # the mesh's real openings
cut_pts = {}  # chunk -> list of cut-edge vertex positions (for the rings)
for c, (ob, bm) in pieces.items():
    new_b = [e for e in bm.edges if e.is_boundary and tuple(sorted((key(e.verts[0].co), key(e.verts[1].co)))) not in orig_boundary]
    cut_pts[c] = {key(v.co) for e in new_b for v in e.verts}
    res = bmesh.ops.holes_fill(bm, edges=new_b, sides=0)
    for f in res['faces']: f.material_index = tissue_i; f.smooth = False
    bmesh.ops.triangulate(bm, faces=res['faces'])
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
bpy.data.objects.remove(torso, do_unlink=True)

def ring_between(a, b, prox, dist, nb):
    pts = [Vector(p) for p in cut_pts[a] & cut_pts[b]]
    if len(pts) < 6: print('no cut between', a, b, len(pts)); return None
    c = sum(pts, Vector()) / len(pts)
    n = (bones[nb].tail_local - bones[nb].head_local).normalized()
    d = [((p - c) - n * (p - c).dot(n)).length for p in pts]
    r = sum(d) / len(d); rmax = max(d)
    return {'c': list(c), 'n': list(n), 'r': 0.8 * r + 0.2 * rmax, 'prox': prox, 'dist': dist}
CUTS = {  # name: (stump chunk, detached chunk, prox bone, dist bone, the bone giving the cut's normal)
    'Shoulder_L': ('Chest', 'UpperArm_L', M('LeftShoulder'), M('LeftArm'), M('LeftArm')),
    'Shoulder_R': ('Chest', 'UpperArm_R', M('RightShoulder'), M('RightArm'), M('RightArm')),
    'Waist': ('Pelvis', 'Chest', M('Spine'), M('Spine1'), M('Spine1')),
    'Hip_L': ('Pelvis', 'Thigh_L', M('Hips'), M('LeftUpLeg'), M('LeftUpLeg')),
    'Hip_R': ('Pelvis', 'Thigh_R', M('Hips'), M('RightUpLeg'), M('RightUpLeg')),
}
rnd = random.Random(11); caps = []
for name, (sc, dc, prox, dist, nb) in CUTS.items():
    r = ring_between(sc, dc, prox, dist, nb)
    if not r: continue
    print('ring', name, [round(x, 3) for x in r['c']], round(r['r'], 4))
    s = build_piece('B__%s__cap_%s' % (sc, name), arm, prox, r, 'stump', name, rnd)
    d = build_piece('B__%s__cap_%s' % (dc, name), arm, dist, r, 'detached', name, rnd)
    caps += [s, d]

# ---- 3. the mod file's own pieces and caps, renamed into their chunks ----
RENAME = {'Patient_Head': 'Head', 'Patient_LeftForearm': 'Forearm_L', 'Patient_RightForearm': 'Forearm_R',
          'Patient_LeftLowerLeg': 'Shin_L', 'Patient_RightLowerLeg': 'Shin_R'}
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    if o.name in RENAME: o.name = 'B__%s__skin' % RENAME[o.name]
    elif o.name.startswith('GORE_'):
        part, side = o.name.split('.')[0][5:].rsplit('_', 1)  # e.g. Forearm_L, Detached
        if part == 'Head': chunk = 'Head' if side == 'Detached' else 'Chest'
        else:
            S = part[-1]; chunk = (('Forearm_' if part.startswith('Forearm') else 'Shin_') + S) if side == 'Detached' else (('UpperArm_' if part.startswith('Forearm') else 'Thigh_') + S)
        o.name = 'B__%s__cap_%s' % (chunk, part)

# ---- 4. guts out of the waist, and loose gibs (vertex coloured with the gore material, skinned to one bone) ----
GUT = (0.62, 0.22, 0.24, 1); GUT_DARK = (0.30, 0.05, 0.07, 1)
def skin_to(ob, bone_name):
    ob.parent = arm; ob.matrix_parent_inverse = arm.matrix_world.inverted()
    vg = ob.vertex_groups.new(name=bone_name); vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
    md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
def tube(name, path, rad, bone_name, col=GUT, seg=8, rnd=None):
    B = Builder(); prev = None
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized(); u, v, n = frame(t)
        rr = rad * (1 + (rnd.uniform(-0.15, 0.2) if rnd else 0)) * (0.55 if i in (0, len(path) - 1) else 1)
        ring = B.ring(p, u, v, n, [rr] * seg, 0.0, rot=i * 0.4)
        if prev: B.band(prev, ring, col, col if i % 3 else GUT_DARK)
        prev = ring
    for f in B.bm.faces: f.smooth = True
    m = bpy.data.meshes.new(name); B.bm.normal_update(); B.bm.to_mesh(m); B.bm.free(); m.materials.append(gore_material())
    ob = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(ob); skin_to(ob, bone_name); return ob
def coil(c, axis_out, turns, rad_coil, length, n=40, phase=0.0):
    u, v, w = frame(axis_out); pts = []
    for i in range(n):
        k = i / (n - 1); a = phase + turns * 2 * math.pi * k
        pts.append(Vector(c) + w * (length * k) + (u * math.cos(a) + v * math.sin(a)) * rad_coil * (0.4 + 0.6 * math.sin(math.pi * k)) - Vector((0, 0, 0.05 * k * k)))
    return pts
waist = ring_between('Pelvis', 'Chest', M('Spine'), M('Spine1'), M('Spine1'))
wc = Vector(waist['c']) if waist else Vector((0, 0.02, 0.56))
fwd = Vector((0, -1, 0))  # the model faces -y in Blender (glTF +z)
gr = random.Random(5)
tube('B__Pelvis__gut_a', coil(wc + fwd * 0.03, Vector((0.2, -0.6, 0.75)), 2.2, 0.035, 0.11), 0.016, M('Spine'), rnd=gr)
tube('B__Chest__gut_b', coil(wc + fwd * 0.02 + Vector((0.03, 0, 0)), Vector((-0.1, -0.5, -0.85)), 1.6, 0.03, 0.12, phase=1.0), 0.015, M('Spine1'), rnd=gr)
for i in range(3):  # loose loops of gut that fly on their own
    tube('B__Gut%d__gut' % (i + 1), coil(wc + Vector((gr.uniform(-0.04, 0.04), -0.03, gr.uniform(-0.02, 0.02))), Vector((gr.uniform(-1, 1), -0.5, gr.uniform(-0.3, 0.6))), gr.uniform(1.0, 2.0), 0.025, gr.uniform(0.07, 0.11), n=24, phase=gr.uniform(0, 6)), 0.014, M('Spine'), rnd=gr)
def gib(name, c, size, bone_name, rnd):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=size)
    col = bm.loops.layers.color.new('Col')
    for vtx in bm.verts: vtx.co = Vector((vtx.co.x * rnd.uniform(0.7, 1.3), vtx.co.y * rnd.uniform(0.6, 1.2), vtx.co.z * rnd.uniform(0.7, 1.25))) + Vector(c)
    for f in bm.faces:
        cc = rnd.choice([MUSCLE, DEEP, MUSCLE, FAT, SKIN, BONE_STAIN])
        for l in f.loops: l[col] = cc
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free(); m.materials.append(gore_material())
    ob = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(ob); skin_to(ob, bone_name); return ob
for i in range(8):
    gib('B__Gib%d__gib' % (i + 1), wc + Vector((gr.uniform(-0.08, 0.08), gr.uniform(-0.05, 0.03), gr.uniform(-0.05, 0.12))), gr.uniform(0.014, 0.026), M('Spine1'), gr)

# the new pieces' colours under the attribute name the imported gore material reads (the glTF import names it, not 'Col')
ref = next(o for o in bpy.data.objects if o.type == 'MESH' and '__cap_Head' in o.name and o.data.color_attributes and not o.name.startswith('B__Chest__cap_Sh'))
CN = ref.data.color_attributes[0].name; print('gore colour attribute', CN)
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('B__') and CN != 'Col' and 'Col' in o.data.color_attributes: o.data.color_attributes['Col'].name = CN

for o in bpy.data.objects:  # one colour layer each (three.js reads COLOR_0 only)
    if o.type == 'MESH' and o.name.startswith('B__') and len(o.data.color_attributes) > 1:
        print('colour layers', o.name, [(c.name, c.domain, c.data_type) for c in o.data.color_attributes])
        for c in [c for c in o.data.color_attributes if c.name != CN]: o.data.color_attributes.remove(c)
        o.data.color_attributes.active_color = o.data.color_attributes[CN]; o.data.color_attributes.render_color_index = 0
# ---- 5. report, preview, export ----
chunks = {}
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('B__'): chunks.setdefault(o.name.split('__')[1], []).append(o.name.split('__')[2])
for c in sorted(chunks): print('chunk', c, chunks[c])
if PREVIEW:  # an exploded view: each chunk pushed out from the waist
    arm.data.pose_position = 'REST'
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith('B__'):
            c = o.name.split('__')[1]; me2 = o.data
            ctr = sum((v.co for v in me2.vertices), Vector()) / max(1, len(me2.vertices))
            o['_off'] = list((ctr - wc) * 0.7)
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (1.6, -2.4, 0.9); cam.rotation_euler = (math.radians(80), 0, math.radians(33)); cam.data.lens = 50
    try: sc.render.engine = 'BLENDER_WORKBENCH'
    except TypeError as e: print(e)
    sc.display.shading.color_type = 'VERTEX'; sc.render.resolution_x = 900; sc.render.resolution_y = 900
    for o in [o for o in bpy.data.objects if '_off' in o]:
        o.location = Vector(o['_off'])
    sc.render.filepath = PREVIEW; bpy.ops.render.render(write_still=True)
    for o in [o for o in bpy.data.objects if '_off' in o]: o.location = (0, 0, 0)
arm.data.pose_position = 'POSE'
out = os.path.join(A, 'opening', 'zombie-patient-burst.glb')
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type == 'ARMATURE' or (o.type == 'MESH' and o.name.startswith('B__')): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_animations=False, export_skins=True, export_yup=True, export_apply=False)
print('wrote', out, os.path.getsize(out))
