# Intake report for a new character (CHARACTER_RIG_PLAYBOOK.md section 0a, 2026-10-20, the user: "what we are not
# thinking about, and what has been proven to be helpful ... the next time we introduce a new character"). Day one:
# look, change nothing. Reads the character as downloaded (GLB or FBX), measures it against the clip dummies and writes
# one page for the user to read and draw on:
#   budget     triangles, materials, textures, bones against Yola 2 (the phone)
#   skeleton   proportions, rest pose, each bone's axis vs its limb line (the retarget copies directions), the chest "V"
#              (collarbone slopes), the spine curve, joints inside and centred in the body, end bones outside the mesh,
#              left / right symmetry
#   weights    influences per vertex, normalisation, coverage, STRAYS (a patch held by a bone far from its neighbours'
#              bones: a pocket on the hand, a beard on the chest) and FAR PARTS (hair, flaps, packs: the dangly-parts list)
#   joints     rows of vertices to bend on at the shoulder, elbow, wrist, hip, knee, ankle
#   pictures   the bones in the mesh with the dummy's skeleton laid over (side, front), weight patches, strays, far parts,
#              wireframe at the joints
# Every finding is something to show the user, never something this script fixes. It changes nothing it reads.
# Writes <out>/report.html (one page, pictures inside), <out>/report.json, <out>/*.jpg. Takes ~1-2 min in background
# Blender; never run it in the user's open Blender (it clears the scene).
# usage: blender -b --factory-startup --python tools/anim/intake_report.py -- <assets dir> <character file> <out dir>
#          [name=Marc] [female=1]
import bpy, bmesh, sys, os, re, json, math, base64, html, colorsys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
A, CHAR, OUT = [os.path.abspath(x) for x in argv[:3]]
OPT = dict(x.split('=', 1) for x in argv[3:])
NAME = OPT.get('name', os.path.splitext(os.path.basename(CHAR))[0]); FEMALE = OPT.get('female') == '1'
os.makedirs(OUT, exist_ok=True)
# Yola 2, measured 2026-10-20 (assets/yola2.glb): the budget a hero has in the game today
YOLA2 = {'triangles': 31296, 'vertices': 35358, 'materials': 1, 'textures': 3, 'bones': 68}

UE = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    UE.update({f'clavicle_{s}': S + 'Shoulder', f'upperarm_{s}': S + 'Arm', f'lowerarm_{s}': S + 'ForeArm', f'hand_{s}': S + 'Hand',
               f'thigh_{s}': S + 'UpLeg', f'calf_{s}': S + 'Leg', f'foot_{s}': S + 'Foot', f'ball_{s}': S + 'ToeBase'})
    for f, F in (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky')):
        for i in (1, 2, 3): UE[f'{f}_0{i}_{s}'] = f'{S}Hand{F}{i}'
def short(n):
    n = n.split(':')[-1]; n = re.sub(r'^mixamorig\d*_?', '', n)
    return UE.get(n, n)

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
def imp(path):
    before = set(bpy.data.objects)
    if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else: bpy.ops.import_scene.gltf(filepath=path)
    for o in [o for o in bpy.data.objects if o not in before and o.name.startswith('Icosphere')]: bpy.data.objects.remove(o, do_unlink=True)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    arm.data.pose_position = 'REST'
    meshes = [o for o in new if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    bpy.context.view_layer.update()
    return new, arm, meshes

# ---------------- a rig's skeleton, measured in its own body frame ----------------
class Rig:
    def __init__(self, label, path):
        self.label, self.path = label, path
        self.objs, self.arm, self.meshes = imp(path)
        W = self.arm.matrix_world
        self.bone = {}
        for b in self.arm.data.bones: self.bone.setdefault(short(b.name), b)
        self.head = {k: W @ b.head_local for k, b in self.bone.items()}
        self.tail = {k: W @ b.tail_local for k, b in self.bone.items()}
        zs = [(m.matrix_world @ v.co).z for m in self.meshes for v in m.data.vertices]
        self.z0, self.H = min(zs), max(zs) - min(zs)
        L = self.head['LeftUpLeg'] - self.head['RightUpLeg']; L.z = 0; self.L = L.normalized()  # her left
        self.U = Vector((0, 0, 1)); self.F = self.L.cross(self.U).normalized()  # her front
    def h(self, k): return self.head[k]
    def side_deg(self, v): # a direction in side view: degrees forward of straight up
        return math.degrees(math.atan2(v.dot(self.F), v.dot(self.U)))
    def measure(self):
        h, H = self.h, self.H
        d = lambda a, b: (h(b) - h(a)).length
        r = {'height_m': round(H, 3), 'bones': len(self.arm.data.bones), 'fingers': 'LeftHandIndex1' in self.bone}
        L = {'hips_height': h('Hips').z - self.z0, 'thigh': d('LeftUpLeg', 'LeftLeg'), 'shin': d('LeftLeg', 'LeftFoot'),
             'upper_arm': d('LeftArm', 'LeftForeArm'), 'forearm': d('LeftForeArm', 'LeftHand'), 'shoulder_width': d('LeftArm', 'RightArm'),
             'hip_width': d('LeftUpLeg', 'RightUpLeg'), 'hips_to_neck': d('Hips', 'Neck'), 'neck_to_head': d('Neck', 'Head')}
        r['share_of_height'] = {k: round(v / H, 4) for k, v in L.items()}
        up = (h('LeftForeArm') - h('LeftArm')).normalized()
        r['rest_arm_down_deg'] = round(math.degrees(math.asin(max(-1, min(1, -up.z)))), 1)  # 0 = T-pose, ~45 = A-pose
        # each bone's own axis vs the line to its chain child (retarget.py copies the axis: an error here lands on the clip)
        W3 = self.arm.matrix_world.to_3x3(); ax = {}
        for n, c in (('Hips', 'Spine'), ('Spine2', 'Neck'), ('Neck', 'Head'), ('LeftShoulder', 'LeftArm'), ('LeftArm', 'LeftForeArm'),
                     ('LeftForeArm', 'LeftHand'), ('LeftHand', 'LeftHandMiddle1'), ('LeftUpLeg', 'LeftLeg'), ('LeftLeg', 'LeftFoot'), ('LeftFoot', 'LeftToeBase')):
            if n in self.bone and c in self.bone:
                a = (W3 @ self.bone[n].matrix_local.to_3x3().col[1]).normalized(); ax[n] = round(math.degrees(a.angle((h(c) - h(n)).normalized())), 1)
        r['axis_vs_limb_deg'] = ax
        # the chest "V": each collarbone from its root to the shoulder joint, how far it slopes back and up (Marc 2026-10-20)
        cv = {}
        for s, sg in (('Left', 1), ('Right', -1)):
            v = h(s + 'Arm') - h(s + 'Shoulder'); out = v.dot(self.L) * sg
            cv[s] = {'back_deg': round(math.degrees(math.atan2(-v.dot(self.F), out)), 1), 'up_deg': round(math.degrees(math.atan2(v.dot(self.U), out)), 1)}
        r['collarbone'] = cv
        # the spine curve in side view: each segment's lean, degrees forward of straight up
        r['spine_curve_deg'] = {f'{a}->{b}': round(self.side_deg(h(b) - h(a)), 1) for a, b in (('Hips', 'Spine'), ('Spine', 'Spine1'), ('Spine1', 'Spine2'), ('Spine2', 'Neck'), ('Neck', 'Head')) if a in self.bone and b in self.bone}
        r['neck_lean_vs_hips_deg'] = round(self.side_deg(h('Head') - h('Neck')) - self.side_deg(h('Spine') - h('Hips')), 1)
        return r

print('INTAKE: importing', CHAR)
C = Rig(NAME, CHAR)
refs = [Rig('mannequin (female)' if FEMALE else 'mannequin', os.path.join(A, 'source', 'ual', 'Mannequin_F.glb' if FEMALE else 'UAL1_Standard.glb')),
        Rig('X Bot', os.path.join(A, 'mixamo', 'reference', 'ref_xbot_pistol_idle.fbx'))]
R = {'name': NAME, 'file': CHAR, 'date': '2026-10-20 tool', 'skeleton': {C.label: C.measure(), **{r.label: r.measure() for r in refs}}}
H = C.H
# distances in cm at the height the game shows it (height=, e.g. Marc 1.80; Tripo files come 1 unit tall)
GH = float(OPT.get('height', H if 1.3 < H < 2.3 else 1.75)); CM = 100 * GH / H; R['shown_height_m'] = GH

# ---------------- budget ----------------
tris = sum(len(p.vertices) - 2 for m in C.meshes for p in m.data.polygons)
verts = sum(len(m.data.vertices) for m in C.meshes)
mats = {s.material.name for m in C.meshes for s in m.material_slots if s.material}
imgs = {}
for mn in mats:
    nt = bpy.data.materials[mn].node_tree
    for n in (nt.nodes if nt else []):
        if n.type == 'TEX_IMAGE' and n.image: imgs[n.image.name] = list(n.image.size)
R['budget'] = {'triangles': tris, 'vertices': verts, 'meshes': len(C.meshes), 'materials': len(mats), 'textures': imgs, 'bones': len(C.arm.data.bones),
               'file_MB': round(os.path.getsize(CHAR) / 1e6, 1), 'vs_yola2': {'triangles': round(tris / YOLA2['triangles'], 2), 'bones': len(C.arm.data.bones) - YOLA2['bones']}}

# ---------------- the mesh (rest pose, world metres), all skinned meshes as one ----------------
P, polys, edges, wrows, wcols, wvals, off = [], [], [], [], [], [], 0
bones = [k for k in C.bone]; bidx = {k: i for i, k in enumerate(bones)}
for m in C.meshes:
    Mw = m.matrix_world; me = m.data
    P += [Mw @ v.co for v in me.vertices]
    polys += [[i + off for i in p.vertices] for p in me.polygons]
    e = np.zeros(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', e); edges.append(e.reshape(-1, 2) + off)
    gname = {g.index: short(g.name) for g in m.vertex_groups}
    for v in me.vertices:
        for g in v.groups:
            k = gname.get(g.group)
            if k in bidx and g.weight > 1e-4: wrows.append(v.index + off); wcols.append(bidx[k]); wvals.append(g.weight)
    off += len(me.vertices)
N, B = len(P), len(bones)
Pn = np.array([tuple(p) for p in P]); E = np.concatenate(edges) if edges else np.zeros((0, 2), dtype=np.int64)
Wm = np.zeros((N, B), dtype=np.float32); np.add.at(Wm, (np.array(wrows), np.array(wcols)), np.array(wvals, dtype=np.float32))
bvh = BVHTree.FromPolygons(P, polys)
ninf = (Wm > 1e-4).sum(1); tot = Wm.sum(1); dom = Wm.argmax(1); domw = Wm.max(1) / np.maximum(tot, 1e-9)
R['weights'] = {'max_influences': int(ninf.max()), 'vertices_over_4_influences': int((ninf > 4).sum()), 'unnormalised': int((np.abs(tot - 1) > 0.02).sum() - (tot == 0).sum()),
                'unweighted': int((tot == 0).sum()), 'coverage_share': {bones[i]: round(float((dom[tot > 0] == i).mean()), 4) for i in np.argsort(-np.bincount(dom[tot > 0], minlength=B))[:24] if (dom[tot > 0] == i).any()}}

# distance from every vertex to every bone's segment (head -> tail)
Ha = np.array([tuple(C.head[k]) for k in bones]); Ta = np.array([tuple(C.tail[k]) for k in bones])
D = np.empty((N, B), dtype=np.float32)
for j in range(B):
    ab = Ta[j] - Ha[j]; l2 = max(float(ab @ ab), 1e-12); t = np.clip(((Pn - Ha[j]) @ ab) / l2, 0, 1)
    D[:, j] = np.linalg.norm(Pn - (Ha[j] + t[:, None] * ab), axis=1)
nearest = D.argmin(1); dmin = D.min(1)

# hops between two bones in the skeleton (parent / child = 1)
par = {k: (short(b.parent.name) if b.parent else None) for k, b in C.bone.items()}
def chain(k):
    out = []
    while k: out.append(k); k = par.get(k)
    return out
_hops = {}
def hops(a, b):
    if (a, b) not in _hops:
        ca, cb = chain(a), chain(b); sb = {k: i for i, k in enumerate(cb)}
        _hops[(a, b)] = next((i + sb[k] for i, k in enumerate(ca) if k in sb), 99)
    return _hops[(a, b)]

# STRAYS: mesh edges where the strong bone changes to one far away in the skeleton (3+ bones apart, or the head straight
# onto the chest past the neck): a patch held by the wrong part (a pocket on the hand, a beard or ponytail on the chest)
strong = domw >= 0.5
a, b = E[:, 0], E[:, 1]; dif = (dom[a] != dom[b]) & strong[a] & strong[b]
pairs = {}
for i, j in zip(a[dif], b[dif]):
    x, y = bones[dom[i]], bones[dom[j]]; hp = hops(x, y)
    skip_neck = {x, y} == {'Head', 'Spine2'}
    if hp >= 3 or skip_neck:
        key = tuple(sorted((x, y))); s = pairs.setdefault(key, {'hops': hp, 'vertices': set()}); s['vertices'].update((int(i), int(j)))
stray_v = set().union(*[s['vertices'] for s in pairs.values()]) if pairs else set()
def where(vs): # the bone nearest the patch's middle
    c = Pn[list(vs)].mean(0); return bones[int(np.argmin(np.linalg.norm((Ha + Ta) / 2 - c, axis=1)))]
R['strays'] = sorted([{'bones': list(k), 'hops_apart': s['hops'], 'border_vertices': len(s['vertices']), 'near': where(s['vertices'])} for k, s in pairs.items()], key=lambda x: -x['border_vertices'])

# FAR PARTS: vertices much further from their own bone than that bone's usual skin (hair, ponytails, packs, flaps, hoods)
far = np.zeros(N, dtype=bool); far_rep = []
for j in range(B):
    sel = dom == j
    if sel.sum() < 30: continue
    dj = D[sel, j]; r50 = float(np.median(dj)); thr = max(2.0 * r50, r50 + 0.06 * H); f = dj > thr
    if f.sum() >= 40:
        idx = np.where(sel)[0][f]; far[idx] = True
        far_rep.append({'bone': bones[j], 'vertices': int(f.sum()), 'usual_skin_cm': round(r50 * CM, 1), 'furthest_cm': round(float(dj.max()) * CM, 1)})
R['far_parts'] = sorted(far_rep, key=lambda x: -x['vertices'])

# ---------------- joints: inside the body, centred, rows of vertices to bend on ----------------
# (joint, the limb it sits in: from -> to, whether left / right centring means anything there: not where the limb meets the
# body at the shoulder and hip, whose inner side runs into the torso)
JOINTS = [('shoulder', 'Arm', 'Arm', 'ForeArm', False), ('elbow', 'ForeArm', 'Arm', 'ForeArm', True), ('wrist', 'Hand', 'ForeArm', 'Hand', True),
          ('hip', 'UpLeg', 'UpLeg', 'Leg', False), ('knee', 'Leg', 'UpLeg', 'Leg', True), ('ankle', 'Foot', 'Leg', 'Foot', True)]
def ray(o, d):
    hit = bvh.ray_cast(o + d * 1e-4, d, 0.5 * H); return hit[3] if hit[0] is not None else None
jr = {}
for side in ('Left', 'Right'):
    for nm, j, a0, a1, lr in JOINTS:
        J, K0, K1 = C.head.get(side + j), C.head.get(side + a0), C.head.get(side + a1)
        if J is None or K0 is None or K1 is None: continue
        ax = (K1 - K0).normalized(); f = (C.F - ax * C.F.dot(ax)).normalized(); l = ax.cross(f).normalized()
        dist = {k: ray(J, v) for k, v in (('front', f), ('back', -f), ('out', l), ('in', -l))}
        e = {'inside': sum(v is not None for v in dist.values()) >= 3}  # (layered clothes make the nearest face's normal useless here)
        if dist['front'] and dist['back']: e['front_back'] = round((dist['front'] - dist['back']) / (dist['front'] + dist['back']), 2)  # + = sits toward her back
        if lr and dist['out'] and dist['in']: e['side'] = round((dist['out'] - dist['in']) / (dist['out'] + dist['in']), 2)
        # rows of vertices to bend on: the edges within 5% of height of the joint, how far apart they sit along the limb
        jv = Pn - np.array(tuple(J)); along = jv @ np.array(tuple(ax)); rad = np.linalg.norm(jv - along[:, None] * np.array(tuple(ax)), axis=1)
        near = (np.abs(along) < 0.05 * H) & (rad < 0.12 * H) & np.isin(dom, [bidx[k] for k in (side + j, par.get(side + j)) if k in bidx])
        en = E[near[E[:, 0]] & near[E[:, 1]]]
        if len(en):
            ev = Pn[en[:, 1]] - Pn[en[:, 0]]; el = np.linalg.norm(ev, axis=1) + 1e-9; ea = np.abs(ev @ np.array(tuple(ax))) / el
            al = el[ea > 0.6]; ar = el[ea < 0.4]
            if len(al): e['rows_within_5pct'] = int(round(0.1 * H / float(np.median(ev[ea > 0.6] @ np.array(tuple(ax)) * np.sign(ev[ea > 0.6] @ np.array(tuple(ax)))))))
            if len(ar): e['around'] = int(round(2 * math.pi * float(np.median(rad[near])) / float(np.median(ar))))
        jr[f'{side} {nm}'] = e
R['joints'] = jr

# END BONES outside the mesh (head top, finger tips, toe ends) and joints' left / right symmetry
ends = {}
for k, b in C.bone.items():
    if b.children: continue
    p = C.head[k]; loc, nrm, _, dn = bvh.find_nearest(p)
    if loc is not None and (p - loc).dot(nrm) > 0 and dn * CM > 1: ends[k] = round(dn * CM, 1)
R['end_bones_outside_cm'] = ends
hip = C.head['Hips']; mir = lambda p: p - 2 * (p - hip).dot(C.L) * C.L
sym = {k: round((mir(C.head[k]) - C.head['Right' + k[4:]]).length * CM, 1) for k in C.bone if k.startswith('Left') and ('Right' + k[4:]) in C.head}
R['symmetry_cm'] = {'worst': dict(sorted(sym.items(), key=lambda x: -x[1])[:6])}

# ---------------- what to talk about with the user (never fixed here) ----------------
notes = []
S, ref0 = R['skeleton'][C.label], R['skeleton'][refs[0].label]
if not 1.3 < H < 2.3: notes.append(f'The file is {H:.2f} units tall (Tripo files come 1 unit tall); the game will show it at {GH} m, and every cm here is at {GH} m. Check the scale before anything else.')
for k, v in S['spine_curve_deg'].items():
    th = [R['skeleton'][r.label]['spine_curve_deg'].get(k) for r in refs]
    if all(t is not None and abs(v - t) > 8 for t in th): notes.append(f'Spine {k} leans {v} deg at rest, the dummies {", ".join(map(str, th))}: it shows in every clip (a forward head, a hump); compare the side picture.')
if R['budget']['vs_yola2']['triangles'] > 1.3: notes.append(f"{tris:,} triangles, {R['budget']['vs_yola2']['triangles']}x Yola 2: decide early whether the phone needs a lighter version.")
for s in ('Left', 'Right'):
    mine = S['collarbone'][s]['back_deg']; theirs = [R['skeleton'][r.label]['collarbone'][s]['back_deg'] for r in refs]
    if max(abs(mine - t) for t in theirs) > 10: notes.append(f'{s} collarbone slopes back {mine} deg, the clip dummies {", ".join(map(str, theirs))}: test its collarbones turning from its own rest (rest_relative, an A/B), as Marc.')
for k, v in S['axis_vs_limb_deg'].items():
    if v > 5: notes.append(f'{k}: its axis sits {v} deg off its limb line; the retarget copies the axis (a posture fix, as X Bot\'s neck / head).')
for k, e in jr.items():
    if not e.get('inside', True): notes.append(f'{k} joint is not inside the body: look at it in Blender (bones in front, X-ray).')
    elif abs(e.get('front_back', 0)) > 0.45 or abs(e.get('side', 0)) > 0.45: notes.append(f"{k} joint sits off-centre (front/back {e.get('front_back')}, side {e.get('side')}): look before moving anything (moving Marc's joints made him worse).")
    if e.get('rows_within_5pct', 99) < 4: notes.append(f"{k}: only ~{e.get('rows_within_5pct')} rows of vertices to bend on: remesh the joint before painting.")
for k, v in ends.items(): notes.append(f'End bone {k} sits {v} cm outside the mesh (Marc\'s head top stuck out): pull it inside.')
if sym and max(sym.values()) > 1.5: notes.append(f'Left / right joints differ by up to {max(sym.values())} cm ({max(sym, key=sym.get)}): check it is the body, not the rig.')
if R['weights']['vertices_over_4_influences']: notes.append(f"{R['weights']['vertices_over_4_influences']} vertices hold more than 4 bones: the game keeps 4, limit and normalise before export.")
for s in R['strays'][:8]: notes.append(f"Stray weights: {s['bones'][0]} next to {s['bones'][1]} ({s['hops_apart']} bones apart) on {s['border_vertices']} border vertices near the {s['near']}.")
for f in R['far_parts'][:6]: notes.append(f"Far part on the {f['bone']}: {f['vertices']} vertices up to {f['furthest_cm']} cm out (its skin usually {f['usual_skin_cm']} cm): hair, a flap or a pack? Decide: rigid, sway bones, or follow.")
R['to_discuss'] = notes

# ---------------- pictures (Workbench, orthographic, the rest pose) ----------------
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'
w = bpy.data.worlds.new('W'); w.color = (0.11, 0.14, 0.16); sc.world = w
sc.render.resolution_x, sc.render.resolution_y = 640, 860
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88 # (the page carries every picture: ~10 MB as PNG)
cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; cam = bpy.data.objects.new('C', cd); sc.collection.objects.link(cam); sc.camera = cam
for r in refs:
    for o in r.objs: o.hide_render = True
mid = Vector((hip.x, hip.y, C.z0 + 0.5 * H))
def shoot(name, d, scale=1.12, target=None, res=(640, 860)):
    t = target or mid; sc.render.resolution_x, sc.render.resolution_y = res
    cam.location = t + d.normalized() * 4 * H; cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler(); cd.ortho_scale = scale * H
    sc.render.filepath = os.path.join(OUT, name + '.jpg'); bpy.ops.render.render(write_still=True); return name + '.jpg'
def sticks(name, rig, xf, color):  # a rig's bones as rods parent joint -> child joint, and joint balls (xf: into the character's frame)
    bm = bmesh.new(); rr = 0.0045 * H
    for k, bn in rig.bone.items():  # (as the Rig Lab draws them: imported bone tails are the importer's guess, not data)
        if not bn.parent or short(bn.parent.name) not in rig.head: continue
        p, q = xf(rig.head[short(bn.parent.name)]), xf(rig.head[k])
        if (q - p).length < 1e-5: continue
        g = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=rr, radius2=rr * 0.6, depth=(q - p).length)
        Mx = Matrix.Translation((p + q) / 2) @ (q - p).to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=Mx, verts=g['verts'])
        s = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=rr * 1.6); bmesh.ops.transform(bm, matrix=Matrix.Translation(q), verts=s['verts'])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); o.color = color
    mt = bpy.data.materials.new(name); mt.diffuse_color = color; me.materials.append(mt); return o
def onto(r): # the dummy's points onto the character: same hips, same facing (a turn about up only), same height
    k = H / r.H; yaw = math.atan2(r.F.cross(C.F).z, r.F.dot(C.F)); rot = Matrix.Rotation(yaw, 3, 'Z')
    return lambda p: C.head['Hips'] + rot @ ((p - r.head['Hips']) * k)
pics = []
# 1. bones in the mesh, the dummy's skeleton laid over at the hips (character orange, mannequin white, X Bot cyan)
sh.color_type = 'MATERIAL'; sh.show_xray = True; sh.xray_alpha = 0.35
for m in C.meshes:
    mt = bpy.data.materials.new('ghost'); mt.diffuse_color = (0.6, 0.62, 0.66, 1); m.data.materials.clear(); m.data.materials.append(mt)
own = sticks('bones_char', C, lambda p: p, (1, 0.55, 0.15, 1))
shoulder = (C.head['LeftArm'] + C.head['RightArm']) / 2
for r, col in zip(refs, ((0.95, 0.95, 0.95, 1), (0.3, 0.85, 1, 1))): # one dummy at a time (three skeletons at once do not read)
    o = sticks('bones_' + r.label, r, onto(r), col); tag = re.sub(r'\W+', '_', r.label).strip('_').lower(); cn = 'white' if col[0] > 0.9 else 'cyan'
    pics += [(shoot('skeleton_side_' + tag, -C.L), f"Side, from the right: {NAME}'s bones (orange) in the mesh, the {r.label}'s ({cn}) laid over at the hips, same height. Read the spine curve, the neck, the head."),
             (shoot('skeleton_chest_' + tag, -C.L, 0.42, shoulder, (640, 640)), f'Side close-up on the chest: the collarbones (the "V") against the {r.label}\'s.'),
             (shoot('skeleton_front_' + tag, C.F), f'Front, against the {r.label}: shoulder width, collarbones, hips, where each joint sits in the body.')]
    o.hide_render = True
own.hide_render = True
sh.show_xray = False
# 2. weight patches (a colour per bone, mixed by weight), 3. strays and far parts
hue = lambda i: np.array(colorsys.hsv_to_rgb((i * 0.618034) % 1, 0.85, 1.0))
pal = np.array([hue(i) for i in range(B)]); cols = (Wm @ pal) / np.maximum(Wm.sum(1, keepdims=True), 1e-9)
mark = np.tile(np.array([0.55, 0.57, 0.6]), (N, 1)); mark[far] = (1.0, 0.8, 0.1); mark[list(stray_v)] = (1.0, 0.1, 0.1)
def paint(arr):
    o0 = 0
    for m in C.meshes:
        n = len(m.data.vertices); ca = m.data.color_attributes.get('intake') or m.data.color_attributes.new('intake', 'FLOAT_COLOR', 'POINT')
        rgba = np.concatenate([arr[o0:o0 + n], np.ones((n, 1))], 1).astype(np.float32).ravel(); ca.data.foreach_set('color', rgba)
        m.data.color_attributes.active_color = ca; o0 += n
sh.color_type = 'VERTEX'
paint(cols); pics += [(shoot('weights_front', C.F), 'Weights: a colour per bone, mixed where bones share. Borders should be soft on clothes, sharp only at rigid parts.'), (shoot('weights_back', -C.F), 'Weights from behind: shoulder blades, the back of the neck, the seat.')]
paint(mark); pics += [(shoot('strays_front', C.F), 'Red: stray weights (a patch held by a bone far from its neighbours\' bones). Yellow: far parts (hair, flaps, packs).'), (shoot('strays_back', -C.F), 'Strays and far parts from behind.')]
# 4. wireframe at the joints (left side)
sh.color_type = 'OBJECT'
wires = []
for m in C.meshes:
    m.color = (0.62, 0.64, 0.68, 1)
    wo = m.copy(); wo.data = m.data; sc.collection.objects.link(wo); md = wo.modifiers.new('wire', 'WIREFRAME'); md.thickness = 0.0012 * H; md.use_replace = True; md.use_even_offset = False
    wo.color = (0.05, 0.07, 0.09, 1); wires.append(wo)
for nm, j in (('shoulder', 'LeftArm'), ('elbow', 'LeftForeArm'), ('hip', 'LeftUpLeg'), ('knee', 'LeftLeg')):
    pics.append((shoot('wire_' + nm, C.F + C.L * 0.6, 0.22, C.head[j], (520, 520)), f'Wireframe at the left {nm}: rows of edges around the joint are what it bends on.'))
for wo in wires: bpy.data.objects.remove(wo, do_unlink=True)

# ---------------- the page ----------------
json.dump(R, open(os.path.join(OUT, 'report.json'), 'w'), indent=1, default=str)
E_ = html.escape
def table(rows, head):
    return '<table><tr>' + ''.join(f'<th>{E_(h)}</th>' for h in head) + '</tr>' + ''.join('<tr>' + ''.join(f'<td>{E_(str(c))}</td>' for c in r) + '</tr>' for r in rows) + '</table>'
labs = [C.label] + [r.label for r in refs]; sk = R['skeleton']
prop = [[k] + [sk[l]['share_of_height'][k] for l in labs] for k in sk[C.label]['share_of_height']]
axr = [[k] + [sk[l]['axis_vs_limb_deg'].get(k, '') for l in labs] for k in sk[C.label]['axis_vs_limb_deg']]
cvr = [[s + ' ' + q] + [sk[l]['collarbone'][s][q] for l in labs] for s in ('Left', 'Right') for q in ('back_deg', 'up_deg')]
spr = [[k] + [sk[l]['spine_curve_deg'].get(k, '') for l in labs] for k in sk[C.label]['spine_curve_deg']] + [['neck lean vs hips'] + [sk[l]['neck_lean_vs_hips_deg'] for l in labs]]
img = lambda f: 'data:image/jpeg;base64,' + base64.b64encode(open(os.path.join(OUT, f), 'rb').read()).decode()
b = R['budget']
page = f'''<!doctype html><html><head><meta charset="utf-8"><title>Intake: {E_(NAME)}</title><style>
body{{background:#1d262b;color:#eef2f0;font:14px/1.45 system-ui,Segoe UI,sans-serif;margin:0;padding:20px;max-width:1300px}}
h1{{margin:0 0 4px}} h2{{margin:28px 0 8px;color:#ffb347;font-size:16px;text-transform:uppercase;letter-spacing:.05em}}
table{{border-collapse:collapse;margin:6px 0 10px;font-variant-numeric:tabular-nums}} td,th{{border:1px solid #3a4a52;padding:3px 8px;text-align:right}} th{{background:#26323a}} td:first-child,th:first-child{{text-align:left}}
.pics{{display:flex;flex-wrap:wrap;gap:12px}} figure{{margin:0;background:#26323a;border-radius:8px;padding:6px;max-width:640px}} figure img{{max-width:100%;display:block}} figcaption{{color:#9db0ad;font-size:12.5px;padding:4px 2px}}
li{{margin:3px 0}} .dim{{color:#9db0ad}}</style></head><body>
<h1>Intake: {E_(NAME)}</h1><div class="dim">{E_(os.path.basename(CHAR))} as downloaded, measured against the {E_(refs[0].label)} and X Bot (CHARACTER_RIG_PLAYBOOK.md 0a). Nothing was changed.</div>
<h2>To talk about</h2><ol>{''.join(f'<li>{E_(n)}</li>' for n in notes) or '<li>Nothing flagged.</li>'}</ol>
<h2>Budget (the phone)</h2>{table([['triangles', b['triangles'], YOLA2['triangles']], ['vertices', b['vertices'], YOLA2['vertices']], ['materials', b['materials'], YOLA2['materials']], ['textures', len(b['textures']), YOLA2['textures']], ['bones', b['bones'], YOLA2['bones']]], ['', NAME, 'Yola 2'])}
<div class="dim">textures: {E_(', '.join(f"{k} {v[0]}x{v[1]}" for k, v in b['textures'].items()))}; file {b['file_MB']} MB</div>
<h2>Pictures</h2><div class="pics">{''.join(f'<figure><img src="{img(f)}"><figcaption>{E_(c)}</figcaption></figure>' for f, c in pics)}</div>
<h2>Skeleton</h2><div class="dim">height {sk[C.label]['height_m']} m; rest arms {sk[C.label]['rest_arm_down_deg']} deg below level (0 T-pose, ~45 A-pose); {sk[C.label]['bones']} bones, fingers: {sk[C.label]['fingers']}</div>
<b>Proportions (share of height)</b>{table(prop, [''] + labs)}
<b>Each bone's axis vs its limb line (deg; over ~5 the retarget carries the error)</b>{table(axr, [''] + labs)}
<b>Collarbones: the chest "V" (deg)</b>{table(cvr, [''] + labs)}
<b>Spine curve, side view (deg forward of straight up)</b>{table(spr, [''] + labs)}
<b>Joints in the body</b> <span class="dim">(front_back / side: 0 centred, + toward her back / outside; rows: vertex rows to bend on within 5% of height)</span>{table([[k, e.get('inside'), e.get('front_back', ''), e.get('side', ''), e.get('rows_within_5pct', ''), e.get('around', '')] for k, e in jr.items()], ['joint', 'inside', 'front_back', 'side', 'rows', 'around'])}
<div class="dim">End bones outside the mesh (cm): {E_(json.dumps(ends) if ends else 'none')}. Left / right worst (cm): {E_(json.dumps(R['symmetry_cm']['worst']))}</div>
<h2>Weights</h2>{table([['most bones on one vertex', R['weights']['max_influences']], ['vertices over 4 bones', R['weights']['vertices_over_4_influences']], ['not normalised', R['weights']['unnormalised']], ['no weight at all', R['weights']['unweighted']]], ['', ''])}
<b>Strays</b>{table([[' / '.join(s['bones']), s['hops_apart'], s['border_vertices'], s['near']] for s in R['strays']], ['bones', 'apart', 'border vertices', 'near']) if R['strays'] else ' <span class="dim">none</span>'}
<b>Far parts</b>{table([[f['bone'], f['vertices'], f['usual_skin_cm'], f['furthest_cm']] for f in R['far_parts']], ['bone', 'vertices', 'usual skin cm', 'furthest cm']) if R['far_parts'] else ' <span class="dim">none</span>'}
<b>Coverage (share of vertices each bone holds most)</b>{table([[k, v] for k, v in R['weights']['coverage_share'].items()], ['bone', 'share'])}
</body></html>'''
open(os.path.join(OUT, 'report.html'), 'w', encoding='utf-8').write(page)
print('INTAKE_DONE', os.path.join(OUT, 'report.html'), len(notes), 'notes')
