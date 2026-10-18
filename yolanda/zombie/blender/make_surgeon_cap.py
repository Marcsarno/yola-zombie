# The surgeon zombie's theatre cap and mask (2026-10-18, the user: "making one look like a surgeon, with the nurse hat or
# doctor hat.. whatever those surgical hair cover things are called"): a disposable bouffant cap (pale blue, gathered on
# an elastic band, puffed over the crown, down to the hairline all round) and a pleated surgical mask pulled down under
# the chin on its ear loops. Built on the nurse zombie (assets/zombie-nurse-mod.glb), fitted to its head in the Head
# bone's own frame (the head is tipped forward in the rest pose), exported in that model's space:
# assets/props/surgeon_cap.glb. The game (render/clipchars.js wearSurgeon) puts it on the zombie's Head bone at rest.
# Run in Blender (the live session): exec(open(r'<this file>').read())
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, noise

ROOT = r'C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie'
NURSE = os.path.join(ROOT, 'assets', 'zombie-nurse-mod.glb')
OUT = os.path.join(ROOT, 'assets', 'props', 'surgeon_cap.glb')
CAP = False  # (2026-10-18, the user, on seeing it: "yikes.. ditch the surgeon hat": the mask only; the cap is still built in the .blend)

sc = bpy.data.scenes.get('surgeon_cap') or bpy.data.scenes.new('surgeon_cap')
bpy.context.window.scene = sc
for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=NURSE)
ref = [o for o in bpy.data.objects if o not in before]

def mat(name, rgb, rough=0.85):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    return m

# the head's own frame: U up the Head bone, F the way the face looks, R across
arm = next(o for o in ref if o.type == 'ARMATURE')
hb = next(b for b in arm.data.bones if b.name.endswith(':Head'))
H0 = arm.matrix_world @ hb.head_local; U = ((arm.matrix_world @ hb.tail_local) - H0).normalized()
F = Vector((0, -1, 0)); F = (F - U * F.dot(U)).normalized(); R = F.cross(U)
W = lambda r, f, u: H0 + R * r + F * f + U * u  # head frame -> model space
head = next(o for o in ref if o.name.startswith('Nurse_Head'))
dg = bpy.context.evaluated_depsgraph_get(); ev = head.evaluated_get(dg); me = ev.to_mesh()
L = [(lambda d: (d.dot(R), d.dot(F), d.dot(U)))((head.matrix_world @ v.co) - H0) for v in me.vertices]; ev.to_mesh_clear()
TOP = max(p[2] for p in L)
cr = [p for p in L if abs(p[2] - (TOP - 0.06)) < 0.008]
r0, r1 = min(p[0] for p in cr), max(p[0] for p in cr); f0, f1 = min(p[1] for p in cr), max(p[1] for p in cr)
CR, CF, CU = (r0 + r1) / 2, (f0 + f1) / 2, TOP - 0.075
AR, AF, AU = (r1 - r0) / 2 + 0.016, (f1 - f0) / 2 + 0.02, (TOP - CU) + 0.012
print('head frame', CR, CF, CU, AR, AF, AU, TOP)

# ---- the cap: an ellipsoid over the crown, cut at the elastic: at the hairline over the brow, above the ears at the sides,
# down to the nape at the back; puffed over the top and gathered into the band ----
def band_u(r, f):  # the band's height round the head (angle 0 at the brow)
    a = math.atan2((r - CR) / AR, (f - CF) / AF)
    front = 0.5 + 0.5 * math.cos(a)
    return CU - 0.075 + 0.1 * front ** 1.5
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=28, radius=1.0)
for v in bm.verts:
    x, y, z = v.co
    v.co = Vector((CR + x * AR, CF - y * AF, CU + z * AU))  # (r, f, u) for now
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < band_u(v.co.x, v.co.y) - 0.003], context='VERTS')
for v in bm.verts:
    r, f, u = v.co; a = math.atan2((r - CR) / AR, (f - CF) / AF)
    b = band_u(r, f); h = max(0.0, min(1.0, (u - b) / max(1e-4, TOP + 0.02 - b)))
    n = Vector(((r - CR) / AR ** 2, (f - CF) / AF ** 2, (u - CU) / AU ** 2)).normalized()
    puff = 0.006 * math.sin(h * math.pi) + noise.noise(Vector((r, f, u)) * 45.0) * 0.004 * h
    crease = math.sin(a * 26) * 0.003 * max(0.0, 1 - h * 3.0)
    v.co += n * (puff + crease)
rim = [e for e in bm.edges if e.is_boundary]
ret = bmesh.ops.extrude_edge_only(bm, edges=rim)
for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
    r, f, u = v.co; d = Vector((r - CR, f - CF, 0)).normalized(); v.co = Vector((r - d.x * 0.005, f - d.y * 0.005, u - 0.007))
for v in bm.verts: v.co = W(*v.co)
# never inside the head or its hair: anything closer than 5 mm to the head's surface is pushed out along it
from mathutils.bvhtree import BVHTree
ev = head.evaluated_get(bpy.context.evaluated_depsgraph_get()); hm = ev.to_mesh(); hm.transform(head.matrix_world)
tree = BVHTree.FromPolygons([v.co.copy() for v in hm.vertices], [tuple(p.vertices) for p in hm.polygons]); ev.to_mesh_clear()
CW = W(CR, CF, CU)
for _ in range(3):
    for v in bm.verts:
        loc, nrm, i, d = tree.find_nearest(v.co)
        if loc is None: continue
        out = (v.co - loc).dot((loc - CW).normalized())
        if out < 0.005: v.co += (loc - CW).normalized() * (0.005 - out)
capme = bpy.data.meshes.new('surgeon_cap'); bm.to_mesh(capme); bm.free()
cap = bpy.data.objects.new('surgeon_cap', capme); sc.collection.objects.link(cap)
sol = cap.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.0025; sol.offset = 1
cap.data.materials.append(mat('CapBlue', (0.42, 0.62, 0.80), 0.9))
for p in cap.data.polygons: p.use_smooth = True

# ---- the mask: pleated, round the jaw just under the chin; ear loops up to behind the ears ----
UMIN = -0.03  # (the chin's underside in the head frame: the face ends about here, the neck below)
cols, rows = 14, 8
grid = []
for rr in range(rows + 1):
    row = []
    for c in range(cols + 1):
        s = c / cols - 0.5; t = rr / rows
        ang = s * 2.5
        pleat = 0.0025 * math.sin(t * math.pi * 3) * (1 - abs(s) * 1.4)
        r = CR + math.sin(ang) * 0.066
        f = CF + 0.035 + math.cos(ang) * 0.072 + pleat
        u = UMIN + 0.004 - t * 0.05 + 0.03 * s * s
        row.append(W(r, f, u))
    grid.append(row)
bm = bmesh.new(); vv = [[bm.verts.new(p) for p in row] for row in grid]
for rr in range(rows):
    for c in range(cols): bm.faces.new((vv[rr][c], vv[rr][c + 1], vv[rr + 1][c + 1], vv[rr + 1][c]))
maskme = bpy.data.meshes.new('surgeon_mask'); bm.to_mesh(maskme); bm.free()
mask = bpy.data.objects.new('surgeon_mask', maskme); sc.collection.objects.link(mask)
s2 = mask.modifiers.new('thick', 'SOLIDIFY'); s2.thickness = 0.002
mask.data.materials.append(mat('MaskTeal', (0.62, 0.80, 0.82), 0.95))
for p in mask.data.polygons: p.use_smooth = True
for k, s in ((0, -1), (cols, 1)):
    a = grid[0][k]; ear = W(CR + s * (AR - 0.006), CF - AF * 0.15, CU - 0.045)
    cu = bpy.data.curves.new('loop', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0012
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(1)
    for i, p in enumerate((a, ear)):
        bp = sp.bezier_points[i]; bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    lo = bpy.data.objects.new('ear_loop', cu); sc.collection.objects.link(lo)
    lo.data.materials.append(mat('LoopWhite', (0.85, 0.87, 0.86), 0.9))

bpy.ops.object.select_all(action='DESELECT')
for o in list(sc.objects):
    if o.name.startswith('ear_loop'):
        bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
for o in sc.objects:
    if o.name.startswith(('surgeon_mask', 'ear_loop')) or (CAP and o.name.startswith('surgeon_cap')): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_format='GLB', export_apply=True, export_yup=True)
print('exported', OUT)
