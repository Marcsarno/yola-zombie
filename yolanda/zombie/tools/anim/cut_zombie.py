# A Chapter 2 zombie cut apart like the hospital's (2026-10-22, the user: "fix 3, 4, 5. get them more like chapter 1": the
# street zombies had no burst model, no cut-apart pieces): one file that is both the game's modular zombie (head, forearms,
# lower legs come off as pieces, a wound cap on each side of each cut: render/clipchars.js ZombieView.sever) and its burst
# model (the whole body thrown apart in chunks on a big finishing blow: render/gibburst.js), as the Zombie Male AAB's.
# The single skinned body is split by its own skin weights, face by face, into chunks:
#   Head | Chest, Pelvis, Arm_L/R, Thigh_L/R (the torso: burst chunks only) | ForeArm_L/R (with the hands) | Shin_L/R (feet)
# named Mod_<part>__<chunk>__Body, <part> one of Head, Forearm_L, Forearm_R, LowerLeg_L, LowerLeg_R or Body. Each cut is
# sealed on both sides by a cap: the seam itself fanned shut in deep tissue plus blender/gore_kit.py's torn skin, fat, wet
# muscle and splintered bone. The five sever cuts' caps are GORE_<part>_Stump / _Detached (the view shows the stump when the
# part comes off); the torso's own cuts (shoulders, thighs, waist) are GORE_Burst_<cut>_<side>, hidden in the live view,
# shown on the burst's chunks. Every cap's name ends __<chunk>: the burst chunk it flies with.
# The zombie's clips and textures go through unchanged (re-exported as the game's other zombies are, every action).
# usage: blender -b --factory-startup --python tools/anim/cut_zombie.py -- <in.glb> <out.glb> [preview.png]
import bpy, bmesh, sys, os, math, random, re
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
exec(open(os.path.join(HERE, '..', '..', 'blender', 'gore_kit.py')).read())  # Builder, flesh_cap, bone, frame, gore_material, colours

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.vertex_groups: bpy.data.objects.remove(o, do_unlink=True)  # (a stray bone-shape sphere)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bodies = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(bodies) == 1, 'one skinned body expected, found %d' % len(bodies)
body = bodies[0]
arm.data.pose_position = 'REST'; bpy.context.view_layer.update()
short = lambda n: re.sub(r'^mixamorig:?', '', n)
BONES = {short(b.name): b for b in arm.data.bones}   # (not BONE: the gore kit's bone colour)
W = lambda p: arm.matrix_world @ p
def bhead(n): return W(BONES[n].head_local)
def btail(n): return W(BONES[n].tail_local)
full = lambda n: BONES[n].name

# ---- 1. each bone's chunk (unlisted bones: their nearest listed ancestor's) ----
ROOT = {'Head': 'Head', 'Neck': 'Chest', 'Spine2': 'Chest', 'Spine1': 'Chest', 'LeftShoulder': 'Chest', 'RightShoulder': 'Chest', 'Spine': 'Pelvis', 'Hips': 'Pelvis',
        'LeftArm': 'Arm_L', 'RightArm': 'Arm_R', 'LeftForeArm': 'ForeArm_L', 'RightForeArm': 'ForeArm_R',
        'LeftUpLeg': 'Thigh_L', 'RightUpLeg': 'Thigh_R', 'LeftLeg': 'Shin_L', 'RightLeg': 'Shin_R'}
def chunk_of_bone(b):
    while b is not None:
        if short(b.name) in ROOT: return ROOT[short(b.name)]
        b = b.parent
    return 'Pelvis'
CHUNK_BONE = {b.name: chunk_of_bone(b) for b in arm.data.bones}
PART = {'Head': 'Head', 'ForeArm_L': 'Forearm_L', 'ForeArm_R': 'Forearm_R', 'Shin_L': 'LowerLeg_L', 'Shin_R': 'LowerLeg_R'}

# ---- 2. each face's chunk: the one its vertices are most weighted to ----
me = body.data; gname = {g.index: g.name for g in body.vertex_groups}
def vweights(v): return {gname[g.group]: g.weight for g in v.groups if g.weight > 0}
VW = [vweights(v) for v in me.vertices]
def vchunks(i):
    acc = {}
    for n, w in VW[i].items(): c = CHUNK_BONE.get(n, 'Pelvis'); acc[c] = acc.get(c, 0) + w
    return acc
VC = [vchunks(i) for i in range(len(me.vertices))]
face_chunk = []
for p in me.polygons:
    acc = {}
    for i in p.vertices:
        for c, w in VC[i].items(): acc[c] = acc.get(c, 0) + w
    face_chunk.append(max(acc, key=acc.get) if acc else 'Pelvis')
print('faces by chunk', {c: face_chunk.count(c) for c in sorted(set(face_chunk))})

# ---- 3. the cuts: [proximal chunk, distal chunk, name, proximal bone, distal bone, cap style] ----
CUTS = [('Chest', 'Head', 'Head', 'Neck', 'Head', 'Head'),
        ('Arm_L', 'ForeArm_L', 'Forearm_L', 'LeftArm', 'LeftForeArm', 'Limb'), ('Arm_R', 'ForeArm_R', 'Forearm_R', 'RightArm', 'RightForeArm', 'Limb'),
        ('Thigh_L', 'Shin_L', 'LowerLeg_L', 'LeftUpLeg', 'LeftLeg', 'Limb'), ('Thigh_R', 'Shin_R', 'LowerLeg_R', 'RightUpLeg', 'RightLeg', 'Limb'),
        ('Chest', 'Arm_L', 'Burst_ShoulderL', 'LeftShoulder', 'LeftArm', 'Limb'), ('Chest', 'Arm_R', 'Burst_ShoulderR', 'RightShoulder', 'RightArm', 'Limb'),
        ('Pelvis', 'Thigh_L', 'Burst_HipL', 'Hips', 'LeftUpLeg', 'Limb'), ('Pelvis', 'Thigh_R', 'Burst_HipR', 'Hips', 'RightUpLeg', 'Limb'),
        ('Pelvis', 'Chest', 'Burst_Waist', 'Spine', 'Spine1', 'Waist')]
SEVER = {'Head', 'Forearm_L', 'Forearm_R', 'LowerLeg_L', 'LowerLeg_R'}
bm0 = bmesh.new(); bm0.from_mesh(me); bm0.edges.ensure_lookup_table(); bm0.faces.ensure_lookup_table()
MW = body.matrix_world
def seam_edges(a, b):  # the edges between an a face and a b face
    out = []
    for e in bm0.edges:
        cs = {face_chunk[f.index] for f in e.link_faces}
        if a in cs and b in cs: out.append((e.verts[0].index, e.verts[1].index))
    return out
def cut_ring(edges, prox, dist):
    vs = sorted({i for e in edges for i in e})
    P = [MW @ me.vertices[i].co for i in vs]
    c = sum(P, Vector()) / len(P)
    n = (btail(dist) - bhead(dist)).normalized()
    rs = [((p - c) - n * (p - c).dot(n)).length for p in P]
    return {'c': c, 'n': n, 'r': sum(rs) / len(rs), 'rmax': max(rs), 'verts': vs}

rnd = random.Random(11)
def build_cap(name, ring, edges, side, style, bone_name):
    """the fan over the seam (deep tissue, the seam's own skin weights) and the gore kit's cap, one skinned mesh"""
    c, r = ring['c'], ring['r']; u, v, n = frame(ring['n'])
    if side == 'detached': n, v = -n, -v
    B = Builder()
    flesh_cap(B, c, u, v, n, r, rnd, dome=0.8 if side == 'detached' else (0.5 if style in ('Head', 'Waist') else 1.0))
    if style == 'Head':
        if side == 'stump':
            bone(B, c - v * r * 0.25, u, v, n, r * 0.34, r * 1.3, rnd, sides=6)
            t0 = B.ring(c + v * r * 0.35, u, v, n, [r * 0.17] * 6, 0.018); t1 = B.ring(c + v * r * 0.35, u, v, n, [r * 0.13] * 6, 0.004)
            B.band(t0, t1, (0.55, 0.25, 0.22, 1), DARK); B.fan(t1, B.bm.verts.new(c + v * r * 0.35 - n * 0.004), DARK, DARK)
        else: bone(B, c - v * r * 0.25, u, v, n, r * 0.26, r * 0.35, rnd, sides=6)
    elif style == 'Waist': bone(B, c - v * r * 0.4, u, v, n, r * 0.2, r * 0.5, rnd, sides=6)   # (the spine's stub)
    elif side == 'stump': bone(B, c, u, v, n, r * 0.38, r * 2.2, rnd, offset=(r * 0.08, -r * 0.05))
    else:
        bone(B, c, u, v, n, r * 0.26, r * 1.1, rnd, offset=(r * 0.25, 0))
        bone(B, c, u, v, n, r * 0.18, r * 0.85, rnd, offset=(-r * 0.3, r * 0.1))
    # the seam fanned shut, just inside the cap (so the hole is closed whatever the cap misses)
    seam = {}
    for i in ring['verts']: seam[i] = B.bm.verts.new(MW @ me.vertices[i].co)
    mid = B.bm.verts.new(c - n * 0.004)
    for a, b in edges:
        try: f = B.bm.faces.new((seam[a], seam[b], mid) if side == 'stump' else (seam[b], seam[a], mid))
        except ValueError: continue
        for l in f.loops: l[B.col] = MUSCLE if l.vert is mid else DEEP
    B.bm.normal_update(); B.bm.verts.index_update()
    seam_idx = {seam[i].index: i for i in seam}
    m = bpy.data.meshes.new(name); B.bm.to_mesh(m); B.bm.free()
    m.materials.append(gore_material())
    ob = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm; ob.matrix_parent_inverse = arm.matrix_world.inverted()
    groups = {}
    def grp(n): return groups.get(n) or groups.setdefault(n, ob.vertex_groups.new(name=n))
    for vi in range(len(m.vertices)):
        if vi in seam_idx:
            for gn, w in VW[seam_idx[vi]].items(): grp(gn).add([vi], w, 'REPLACE')
        else: grp(bone_name).add([vi], 1.0, 'REPLACE')
    md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    return ob

made = []
for a, b, cut, pb, db, style in CUTS:
    edges = seam_edges(a, b)
    if len(edges) < 3: print('no seam', cut); continue
    ring = cut_ring(edges, pb, db)
    print('cut %-16s seam %3d edges  r %.3f  rmax %.3f' % (cut, len(edges), ring['r'], ring['rmax']))
    tag = 'GORE_' + cut
    made.append(build_cap('%s_Stump__%s' % (tag, a), ring, edges, 'stump', style, full(pb)))
    made.append(build_cap('%s_Detached__%s' % (tag, b), ring, edges, 'detached', style, full(db)))
bm0.free()

# ---- 4. the body split into its chunks (each a copy of the body with only its own faces) ----
for chunk in sorted(set(face_chunk)):
    o = body.copy(); o.data = me.copy(); bpy.context.scene.collection.objects.link(o)
    o.name = o.data.name = 'Mod_%s__%s__Body' % (PART.get(chunk, 'Body'), chunk)
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if face_chunk[f.index] != chunk], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data); bm.free(); made.append(o)
bpy.data.objects.remove(body, do_unlink=True)
for p in ('Head', 'Forearm_L', 'Forearm_R', 'LowerLeg_L', 'LowerLeg_R'): assert any(o.name.startswith('Mod_%s__' % p) for o in made), 'no piece for ' + p

# ---- 5. export: the clips as they came, every action ----
arm.data.pose_position = 'POSE'
for ac in bpy.data.actions: ac.use_fake_user = True
if arm.animation_data: arm.animation_data.action = None
for o in bpy.data.objects: o.select_set(o in made or o == arm)
img = {i.file_format for i in bpy.data.images if i.has_data or i.packed_file}
fmt = 'WEBP' if 'WEBP' in img else 'JPEG'
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                          export_frame_step=1, export_image_format=fmt, export_jpeg_quality=88, export_vertex_color='MATERIAL')
print('WROTE', OUT, 'pieces', len(made), 'actions', len(bpy.data.actions), 'images', fmt)
