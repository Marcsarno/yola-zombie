# Grip sheet renders (WEAPON_HOLD_PROCESS.md section 8): for each listed frame, 8 views around the hands (every 45 deg,
# slightly above) plus full-body front and side, with the weapon placed by the grip solve exactly as holdcheck.py places it.
# Weapon rings inside her body (from the holdcheck report) are drawn red.
# usage: blender -b blender/characters.blend --python tools/hold/gripsheet.py -- <hands.json> <weapon> <check.json> <outdir> <action:frame> [...]
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import holdlib as H

argv = sys.argv[sys.argv.index('--') + 1:]
cal = H.load_json(argv[0]); weapon = argv[1]; check = H.load_json(argv[2]); outdir = argv[3]; shots = argv[4:]
W = H.load_json(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'weapons_hold.json'))[weapon]
U = 1 / H.M
arm, body = H.rig(); sc = bpy.context.scene
for o in sc.objects:
    o.hide_render = not (o == arm or o == body)
prim = W['primary']

def make_weapon():  # the round weapon from its profile (shaft along local +Z, back end at the origin)
    me = bpy.data.meshes.new('hold_weapon'); bm = bmesh.new(); N = 24; rings = []
    for s, r in W['profile']:
        rings.append([bm.verts.new((math.cos(k * 2 * math.pi / N) * r * U, math.sin(k * 2 * math.pi / N) * r * U, s * U)) for k in range(N)])
    for a, b in zip(rings, rings[1:]):
        for k in range(N): bm.faces.new((a[k], a[(k + 1) % N], b[(k + 1) % N], b[k]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1]); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('hold_weapon', me); sc.collection.objects.link(ob)
    m = bpy.data.materials.new('wood'); m.diffuse_color = (0.78, 0.6, 0.38, 1); me.materials.append(m)
    return ob
wob = make_weapon()
red = bpy.data.materials.new('pen'); red.diffuse_color = (1, 0.05, 0.05, 1)
def ring_marker(name):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=1, radius2=1, depth=1)
    bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); me.materials.append(red); return ob
marks = [ring_marker(f'pen{i}') for i in range(6)]
# fist-centre markers (small spheres): blue = primary, green = support target on the shaft
def ball(name, col):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.004)
    bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    m = bpy.data.materials.new(name); m.diffuse_color = col; me.materials.append(m); return ob

SKEL_COL = {'Left': (0.15, 0.45, 1.0, 1), 'Right': (1.0, 0.2, 0.15, 1), 'mid': (1.0, 0.85, 0.1, 1)}
def make_skeleton():  # the bones as sticks (head -> tail) with a ball at each joint, in the current pose: one object per colour
    obs = []
    for side, col in SKEL_COL.items():
        me = bpy.data.meshes.new('skel_' + side); bm = bmesh.new()
        for pbn in arm.pose.bones:
            n = pbn.name.replace('mixamorig:', '')
            if any(x in n for x in ('Eye', 'End', 'Toe')): continue
            sd = 'Left' if n.startswith('Left') else 'Right' if n.startswith('Right') else 'mid'
            if sd != side: continue
            fing = 'Hand' in n and n not in ('LeftHand', 'RightHand')
            r = 0.0016 if fing else 0.0045; A_, B_ = pbn.head, pbn.tail
            if (B_ - A_).length < 1e-5: continue
            rotm = Vector((0, 0, 1)).rotation_difference((B_ - A_).normalized()).to_matrix().to_4x4()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r, radius2=r * 0.6, depth=(B_ - A_).length, matrix=Matrix.Translation((A_ + B_) / 2) @ rotm)
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=r * 1.7, matrix=Matrix.Translation(A_))
        bm.to_mesh(me); bm.free()
        m_ = bpy.data.materials.new('skelm_' + side); m_.diffuse_color = col; me.materials.append(m_)
        ob = bpy.data.objects.new('skel_' + side, me); sc.collection.objects.link(ob); ob.matrix_world = mw; obs.append(ob)
    return obs

cam = bpy.data.objects.new('gs_cam', bpy.data.cameras.new('gs_cam')); sc.collection.objects.link(cam); sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'
sh.show_cavity = True; sh.show_shadows = False
sc.render.film_transparent = False
if sc.world: sc.world.color = (0.18, 0.2, 0.22)
os.makedirs(outdir, exist_ok=True)
mw = arm.matrix_world
def look(pos, tgt, up=Vector((0, 0, 1))):
    z = (pos - tgt).normalized(); x = up.cross(z).normalized(); y = z.cross(x)
    cam.matrix_world = Matrix.Translation(pos) @ Matrix((x, y, z)).transposed().to_4x4()
rows = {(r['action'], r['f']): r for r in check['frames']}
listing = []
for shot in shots:
    name, f = shot.split(':'); f = int(f)
    H.use_action(arm, name); sc.frame_set(f)
    r = rows.get((name, f))
    cP, aP, kP = H.fist_world(arm, prim, cal); d = aP; knob = cP - d * (W['grips'][prim] * U)
    wob.matrix_world = mw @ (Matrix.Translation(knob) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4())
    for m in marks: m.hide_render = True
    if r and r.get('weapon_in_body_cm', 0) > 0.2 and r.get('weapon_in_body_at_m') is not None:
        s0 = r['weapon_in_body_at_m']; m = marks[0]; m.hide_render = False
        rr = max(rad for ss, rad in W['profile'] if abs(ss - s0) < 0.06) * U * 1.25
        m.matrix_world = mw @ (Matrix.Translation(knob + d * (s0 * U)) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4() @ Matrix.Diagonal((rr, rr, 0.03 * U, 1)))
    cS, _, _ = H.fist_world(arm, 'Right' if prim == 'Left' else 'Left', cal)
    mid = mw @ ((cP + cS) / 2)
    # 8 views around the hands: 0.75 m away, 15 deg above. Anything nearer the camera than 0.16 m in front of the hands is
    # clipped away, so her head, hair or shoulder never hides the grip
    R = 0.75 * U; cam.data.type = 'PERSP'; cam.data.lens = 60; cam.data.clip_start = R - 0.16 * U; cam.data.clip_end = 100
    sc.render.resolution_x = sc.render.resolution_y = 560
    for k in range(8):
        a = k * math.pi / 4
        pos = mid + Vector((math.sin(a) * math.cos(0.26), -math.cos(a) * math.cos(0.26), math.sin(0.26))) * R
        look(pos, mid); sc.render.filepath = os.path.join(outdir, f'{name}_{f:03d}_a{k}.png'); bpy.ops.render.render(write_still=True)
    # skeleton views: bones + weapon on a transparent background, from three of the close cameras and the full front; the
    # sheet lays them over the faded body render from the same camera
    skel = make_skeleton()
    body.hide_render = True; sc.render.film_transparent = True; sh.color_type = 'MATERIAL'
    for k in (1, 5, 7):
        a = k * math.pi / 4
        pos = mid + Vector((math.sin(a) * math.cos(0.26), -math.cos(a) * math.cos(0.26), math.sin(0.26))) * R
        look(pos, mid); sc.render.filepath = os.path.join(outdir, f'{name}_{f:03d}_skel_a{k}.png'); bpy.ops.render.render(write_still=True)
    hip0 = mw @ H.head(arm, 'Hips'); tgt0 = Vector((hip0.x, hip0.y, 0.5 * (mw @ H.head(arm, 'Head')).z))
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.25; cam.data.clip_start = 0.01
    look(tgt0 + Vector((0, -1, 0)) * 3, tgt0); sc.render.filepath = os.path.join(outdir, f'{name}_{f:03d}_skel_front.png'); bpy.ops.render.render(write_still=True)
    cam.data.type = 'PERSP'; cam.data.clip_start = R - 0.16 * U
    body.hide_render = False; sc.render.film_transparent = False; sh.color_type = 'TEXTURE'
    for o in skel: bpy.data.objects.remove(o, do_unlink=True)
    # full body: front and her left side, orthographic
    hip = mw @ H.head(arm, 'Hips'); tgt = Vector((hip.x, hip.y, 0.5 * (mw @ H.head(arm, 'Head')).z))
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.25; cam.data.clip_start = 0.01; sc.render.resolution_x = 560; sc.render.resolution_y = 560
    for v, dv in (('front', Vector((0, -1, 0))), ('side', Vector((1, 0, 0)))):
        look(tgt + dv * 3, tgt); sc.render.filepath = os.path.join(outdir, f'{name}_{f:03d}_{v}.png'); bpy.ops.render.render(write_still=True)
    if shot == shots[0] and cal.get('capsules'):  # body capsules as wire cages over her, front and side
        cages = []
        wire = bpy.data.materials.new('cage'); wire.diffuse_color = (0.1, 1.0, 0.3, 1)
        for cn, cp in cal['capsules'].items():
            A_, B_ = H.capsule_world(arm, cp); ln = (B_ - A_).length; rr = cp['r']
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=rr, depth=max(ln, 1e-4)); cy = bpy.context.object
            cy.matrix_world = mw @ (Matrix.Translation((A_ + B_) / 2) @ Vector((0, 0, 1)).rotation_difference((B_ - A_).normalized() if ln > 1e-6 else Vector((0, 0, 1))).to_matrix().to_4x4())
            md = cy.modifiers.new('w', 'WIREFRAME'); md.thickness = 0.002; cy.data.materials.append(wire); cages.append(cy)
            for e_ in (A_, B_):
                bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=rr); sp_ = bpy.context.object; sp_.location = mw @ e_
                md = sp_.modifiers.new('w', 'WIREFRAME'); md.thickness = 0.002; sp_.data.materials.append(wire); cages.append(sp_)
        for v, dv in (('capsules_front', Vector((0, -1, 0))), ('capsules_side', Vector((1, 0, 0)))):
            look(tgt + dv * 3, tgt); sc.render.filepath = os.path.join(outdir, f'{name}_{f:03d}_{v}.png'); bpy.ops.render.render(write_still=True)
        for o in cages: bpy.data.objects.remove(o, do_unlink=True)
    listing.append({'shot': f'{name}_{f:03d}', 'check': r})
json.dump(listing, open(os.path.join(outdir, 'index.json'), 'w'), indent=1)
print('RENDERED', len(shots), 'frames ->', outdir)
