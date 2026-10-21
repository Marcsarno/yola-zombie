# Chapter 2 rebuild: the map clean-up (HANDOFF_PC_START.md A1; design/chapter2_extras/extras.json, the user's "good enough for
# now"): rows 3, 4, 5 and 6 turn and shift so their driveways meet the road squarely; the loop road becomes a capital A with a
# rounded top (L1); extra rows S1 - S6 and S8 down the south and east, streets R1 - R4 joining them; the trees out of their
# footprints. Runs once on hood.blend after dress_hood.py and before the other ch2 scripts (they place things in the rows'
# new frames: make_ch2_props.py GARAGE). Parts:
#   rows   move each row with what belongs to it (its walls' collision, its driveways, the clutter at its walls, the marks)
#   road   L1 laid as a new road (asphalt, a dashed centre line, kerbs); the old loop's asphalt, kerbs and walks taken up
#   extra  the new rows and streets
#   highway  H1, the plan's optional highway on the east edge (one plain slab; run on its own: -- highway)
#   lake   Marc's notes on the built map: the west rows 3 m south, bushes by the playground, the BBQ (-- lake)
#   blender -b blender/hood/hood.blend --python blender/hood/ch2_map.py -- rows road extra
import bpy, bmesh, os, sys, math, json, random
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import importlib, hoodlib, ch2lib
for m in (hoodlib, ch2lib): importlib.reload(m)
from hoodlib import col_box
from ch2lib import *

ID = 'ch2_map'
PARTS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['rows', 'road', 'extra']
EXTRAS = json.load(open(os.path.join(HERE, 'src', 'chapter2_extras.json')))
rng = random.Random(1021)

def R(yaw, lx, lz): return lx * math.cos(yaw) + lz * math.sin(yaw), -lx * math.sin(yaw) + lz * math.cos(yaw)   # (three.js rotation.y)
def Rinv(yaw, dx, dz): return dx * math.cos(yaw) - dz * math.sin(yaw), dx * math.sin(yaw) + dz * math.cos(yaw)
def mover(old, new):
    """A function moving a game point (x, z) and a yaw from the row's old frame to its new one."""
    def f(x, z, yaw=0.0):
        lx, lz = Rinv(old['yaw'], x - old['x'], z - old['z']); dx, dz = R(new['yaw'], lx, lz)
        return new['x'] + dx, new['z'] + dz, yaw + (new['yaw'] - old['yaw'])
    return f
import re
LINE_PIECE = re.compile(r'^(home_|b05_|curve_|club_|lot_|roadblock_|dock_|grandma_|b08_|gate_fence|ch2_)')
def in_quad(Q, x, z, grow=0.0):
    cx = sum(p[0] for p in Q) / 4; cz = sum(p[1] for p in Q) / 4
    G = [(cx + (px - cx) * (1 + grow / 8), cz + (pz - cz) * (1 + grow / 8)) for px, pz in Q]
    return in_poly(G, x, z)

# ---------------------------------------------------------------- rows
def move_row(M, seen):
    """One row from M['old'] to M['new'] (x, z, yaw) with what belongs to it; `seen`: what has moved already (two rows
    side by side share it, so nothing between them moves twice). False when the row is not where M says."""
    old, new = M['old'], M['new']; f = mover(old, new)
    model = M['model']
    inst = next((e for e in placed().objects if model in e.get('src', '') and abs(e.location.x - old['x']) < 0.05 and abs(-e.location.y - old['z']) < 0.05), None)
    if inst is None: print('row', M['row'], 'NOT FOUND'); return False
    # the old footprint (the moved one's corners turned back into the old frame)
    newQ = M['footprint_corners']; back = mover(new, old); oldQ = [back(x, z)[:2] for x, z in newQ]
    moved = {'placed': 0, 'col': 0, 'ground': 0, 'marks': 0}
    def mv(o, kind):
        if o.name in seen: return
        seen.add(o.name)
        x, z, yaw = f(o.location.x, -o.location.y, o.rotation_euler.z)
        o.location.x, o.location.y = x, -z; o.rotation_euler.z = yaw; moved[kind] += 1
    # the row, the clutter at its walls (2 m round it), their prop colliders
    bids = set()
    for o in list(bpy.data.collections['COL'].objects):
        t = o.get('tag') or ''
        if t.startswith('bld:') and in_quad(oldQ, o.location.x, -o.location.y, 0.5): bids.add(t[4:]); mv(o, 'col')
    for e in list(placed().objects):
        if e is inst: mv(e, 'placed'); continue
        t = e.get('tag') or ''
        # (not the seal and block lines' pieces: their collision stays, they are looked at after; not the ch2 scripts' own:
        # they rebuild in the rows' new frames)
        if t.startswith('seal:') or not e.get('src') or e.get('ch2') or LINE_PIECE.match(e.name) or 'kit_row' in e['src']: continue   # (nor another row)
        if in_quad(oldQ, e.location.x, -e.location.y, 2.0):
            mv(e, 'placed'); c = bpy.data.objects.get('COL_prop_' + e.name)
            if c: mv(c, 'col')
    # its driveways (ground meshes named driveway_<B id>_<n>): turned about their own origins' world points
    for o in bpy.data.collections['GROUND'].objects:
        if any(o.name.startswith('driveway_' + b + '_') for b in bids) and o.name not in seen:
            seen.add(o.name); me = o.data; Mw = o.matrix_world
            for v in me.vertices:
                w = Mw @ v.co; x, z, _ = f(w.x, -w.y); v.co = Mw.inverted() @ __import__('mathutils').Vector((x, -z, w.z))
            me.update(); moved['ground'] += 1
    for o in bpy.data.collections['MARKS'].objects:
        if not o.get('ch2') and in_quad(oldQ, o.location.x, -o.location.y, 2.0): mv(o, 'marks')
    print('row', M['row'], bids, moved); return True

def move_rows():
    done = json.loads(bpy.context.scene.get('ch2_rows_moved', '[]'))
    for M in EXTRAS['moved_existing']:
        if M['row'] in done: print('row', M['row'], 'already moved'); continue
        if move_row(M, set()): done.append(M['row'])
    bpy.context.scene['ch2_rows_moved'] = json.dumps(done)

# ---------------------------------------------------------------- road
# the old loop's centre line (from the old ground: legs at x -0.7 and 47.1, the top at z 11.1, corners of 9 m) and the
# cross street (z 56) it kept between its legs
def arc(cx, cz, r, a0, a1, n=8): return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
OLD_LOOP = [(-0.7, 101.0), (-0.7, 20.1)] + arc(8.3, 20.1, 9.0, math.pi, 1.5 * math.pi)[1:] + [(38.1, 11.1)] + arc(38.1, 20.1, 9.0, 1.5 * math.pi, 2 * math.pi)[1:] + [(47.1, 101.0)]
CROSS = (3.5, 51.6, 42.9, 60.6)        # (the cross street between the old legs: x0, z0, x1, z1)
L1 = next(g for g in EXTRAS['ground'] if g['id'] == 'L1')

def dist_line(x, z, pts):
    best = 1e9
    for a, b in zip(pts, pts[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dz * dz or 1e-9
        t = max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); best = min(best, math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)))
    return best

def take_up(names, reach, keep=lambda x, z: False, dry=False):
    """Faces of the ground meshes `names` whose centre lies within `reach` m of the old loop's centre line go (bmesh)."""
    out = {}
    for n, r in zip(names, reach):
        o = bpy.data.objects.get(n)
        if not o: continue
        bm = bmesh.new(); bm.from_mesh(o.data); Mw = o.matrix_world
        kill = []
        for f in bm.faces:
            c = Mw @ f.calc_center_median(); x, z = c.x, -c.y
            if z > 101.5 or z < -3: continue
            if dist_line(x, z, OLD_LOOP) < r and not keep(x, z): kill.append(f)
        out[n] = len(kill)
        if not dry and kill: bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(o.data); o.data.update()
        bm.free()
    return out

def strip(name, pts, half, y, mat, uv_tile=4.0, kerb=None):
    """A road (or a kerb) along the polyline pts: quads between the offsets -half and +half, a box section when kerb=(w, h)."""
    new = bpy.data.collections.get('NEW') or bpy.data.collections.new('NEW')
    if new.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(new)
    nrm = []
    for i, p in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]; dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1
        nrm.append((-dz / L, dx / L))
    bm = bmesh.new()
    def ring(off, h): return [bm.verts.new((p[0] + n[0] * off, -(p[1] + n[1] * off), h)) for p, n in zip(pts, nrm)]
    if kerb is None:
        A, B = ring(-half, y), ring(half, y)
        for i in range(len(pts) - 1): bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
    else:
        w, h = kerb
        for side in (-1, 1):
            o0, o1 = side * half, side * (half + w)
            A, B, C, D = ring(o0, y), ring(o0, y + h), ring(o1, y + h), ring(o1, y)
            for i in range(len(pts) - 1):
                for P, Q in ((A, B), (B, C), (C, D)): bm.faces.new((P[i], P[i + 1], Q[i + 1], Q[i]))
    # (face up, the kerbs' sides out from their own section: a new face's normal is only known after normal_update; without
    # it nothing was turned and the game, drawing one side, showed the lawn through every new road)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < -0.5: f.normal_flip()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new(name='UVMap')
    for li, lp in enumerate(me.loops): co = me.vertices[lp.vertex_index].co; uv.data[li].uv = (co.x / uv_tile, co.y / uv_tile + 1)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); ob['ch2'] = ID; new.objects.link(ob)
    return ob

def resample(pts, step):
    out = [pts[0]]; acc = 0.0
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); t = step - acc
        while t <= L: out.append((a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)); t += step
        acc = (acc + L) % step
    if out[-1] != pts[-1]: out.append(pts[-1])
    return out

def lay_road(dry=False):
    pts = [tuple(p) for p in L1['points']]; half = L1['width'] / 2
    cross = lambda x, z: CROSS[0] + 2.0 <= x <= CROSS[2] - 2.0 and CROSS[1] <= z <= CROSS[3]
    gone = take_up(['roads', 'markings', 'curb_fillets', 'sidewalks', 'verges'], [6.2, 6.2, 7.5, 7.5, 7.5], keep=cross, dry=dry)
    print('old loop taken up (faces):', gone)
    # what stood in the old loop's kerbs and walks, and what would stand in the new road (not the story's lines)
    # (only clutter, trees, the old kerbs and street lights go: the map edge's fences and the story's lines stay; cars are
    # pushed off the road to the verge, as if they had been left there)
    CLUTTER = re.compile(r'^(curb_|nb_frond|nb_palm|nb_suitcase|nb_tote|nb_water|yard|by_|cardboard|supply_bag|tire\.glb|trash_bags|shrub|palm_|nbt_|street_light|debris)')
    def rm(e):
        b = os.path.basename(e['src']); x, z = e.location.x, -e.location.y
        if b.startswith('curb_') and dist_line(x, z, OLD_LOOP) < 7.8: return True
        return bool(CLUTTER.match(b)) and not LINE_PIECE.match(e.name) and not e.get('ch2') and dist_line(x, z, pts) < half + 0.8
    if dry: print('would remove', sorted({os.path.basename(e['src']) for e in placed().objects if e.get('src') and rm(e)})); return
    print('removed from the roads', remove(rm))
    for e in list(placed().objects):
        b = os.path.basename(e.get('src', ''))
        if not b.startswith(('car3_', 'cars_')) or LINE_PIECE.match(e.name) or e.get('ch2'): continue
        x, z = e.location.x, -e.location.y; d = dist_line(x, z, pts)
        if d > half + 1.3: continue
        # the nearest point of the road's centre line, then out along its normal to the verge
        best = None
        for a, c in zip(pts, pts[1:]):
            dx, dz = c[0] - a[0], c[1] - a[1]; L2 = dx * dx + dz * dz or 1e-9; t = max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2))
            qx, qz = a[0] + dx * t, a[1] + dz * t
            if best is None or math.hypot(x - qx, z - qz) < best[0]: best = (math.hypot(x - qx, z - qz), qx, qz)
        _, qx, qz = best; ux, uz = (x - qx) / (best[0] or 1), (z - qz) / (best[0] or 1)
        if best[0] < 0.05: ux, uz = 1, 0
        nx, nz = qx + ux * (half + 1.6), qz + uz * (half + 1.6)
        c = bpy.data.objects.get('COL_prop_' + e.name)
        e.location.x, e.location.y = nx, -nz
        if c: c.location.x += nx - x; c.location.y += -(nz - z)
        print('car pushed to the verge', e.name, (round(x, 1), round(z, 1)), '->', (round(nx, 1), round(nz, 1)))
    if bpy.context.scene.get('ch2_road_laid'): print('L1 already laid'); return
    road = bpy.data.objects['roads'].data.materials[0]; walk = bpy.data.objects['sidewalks'].data.materials[0]; mk = bpy.data.materials['HOOD_markings']
    P = resample(pts, 1.0)
    strip('ch2_L1_road', P, half, 0.031, road)
    strip('ch2_L1_kerb', P, half, 0.031, walk, uv_tile=2.0, kerb=(0.22, 0.12))
    D = resample(pts, 0.5); k = 0
    while k + 6 < len(D): strip('ch2_L1_line', D[k:k + 7], 0.07, 0.036, mk); k += 12   # (a 3 m dash every 6 m)
    # the cross street carried on to the new legs (it ended on the old ones)
    for x0, x1 in ((-3.0, CROSS[0] + 2.5), (CROSS[2] - 2.5, 50.5)):
        ground_mesh('ch2_cross_' + ('w' if x0 < 0 else 'e'), [(x0, CROSS[1] + 0.4), (x1, CROSS[1] + 0.4), (x1, CROSS[3] - 0.4), (x0, CROSS[3] - 0.4)], 0.0305, road, ID)
    bpy.context.scene['ch2_road_laid'] = 1

FENCE_S = ([('kit/fence_privacy.glb', 'x', 2, 0.04)], 0.4, 2.0, -0.05)
BARRICADE_S = ([('kit/pallet_stack.glb', 'x', 12, 0.15), ('kit/wall_corrugated.glb', 'x', 6, 0.1), ('kit/sandbags_2m.glb', 'x', 5, 0.1), ('kit/barricade_sawhorse.glb', 'x', 8, 0.15),
                ('kit/wall_corrugated_b.glb', 'x', 6, 0.1), ('kit/tire_stack_4.glb', 'x', 20, 0.15), ('kit/pallet_stack.glb', 'x', 15, 0.15)], 1.0, 1.8, -0.15)
TRASH_S = ([('kit/trash_bags_5.glb', 'x', 40, 0.25), ('kit/dumpster.glb', 'x', 6, 0.1), ('kit/trash_bags_3.glb', 'x', 50, 0.3), ('kit/cardboard_box_big.glb', 'x', 30, 0.3),
            ('kit/debris_pile.glb', 'x', 40, 0.25), ('kit/trash_bags_5.glb', 'x', 60, 0.3), ('kit/shopping_cart_tipped.glb', 'x', 60, 0.3), ('kit/trash_bags_3.glb', 'x', 40, 0.3)], 1.3, 1.4, -0.1)
def yard_lines():
    if bpy.context.scene.get('ch2_yard_lines'): print('yard lines already moved'); return
    for lid in ('home_back', 'home_curve', 'home_b05'):
        print(lid, 'pieces out', remove(lambda e: e.name.startswith(lid + '_')))
    for o in list(bpy.data.collections['COL'].objects):
        if (o.get('tag') or '') in ('block:home_back', 'seal:home', 'block:home_b05'): bpy.data.objects.remove(o, do_unlink=True)
    seal_line('home_back', [(28.9, 32.6), (28.9, 6.4)], FENCE_S, rng, owner=ID)
    seal_line('home_curve', [(28.9, 6.4), (28.9, -3.4)], BARRICADE_S, rng, tag='seal:home', owner=ID)   # (the way on: across the new road)
    seal_line('home_b05', [(28.9, -3.4), (28.9, -6.9)], TRASH_S, rng, owner=ID)
    o = bpy.data.objects.get('seal_home_use'); o.location.x, o.location.y = 29.8, -1.4
    bpy.context.scene['ch2_yard_lines'] = 1

# the moved rows' driveways carried on to the new road's edge (each vertex at the far end along the row's front)
def stretch_drives():
    from mathutils import Vector
    pts = [tuple(p) for p in L1['points']]; half = L1['width'] / 2
    ids = {3: 'B03', 4: 'B04', 5: 'B05', 6: 'B06'}
    for M in EXTRAS['moved_existing']:
        fx, fz = M['front']; b = ids[M['row']]
        for o in bpy.data.collections['GROUND'].objects:
            if not o.name.startswith('driveway_' + b + '_'): continue
            me = o.data; Mw = o.matrix_world; Mi = Mw.inverted()
            W = [Mw @ v.co for v in me.vertices]; ext = [w.x * fx + (-w.y) * fz for w in W]; far = max(ext)
            n = 0
            for v, w, e in zip(me.vertices, W, ext):
                if e < far - 0.3: continue
                x, z = w.x, -w.y; d = dist_line(x, z, pts)
                if d <= half - 0.15: continue
                # step along the front until under the road's edge (a few small steps: the road curves)
                for _ in range(40):
                    if dist_line(x, z, pts) <= half - 0.15: break
                    x += fx * 0.25; z += fz * 0.25
                v.co = Mi @ Vector((x, -z, w.z)); n += 1
            me.update()
            if n: print('driveway', o.name, 'stretched', n)

# ---------------------------------------------------------------- extra: the new rows and their streets
TREES = ('nbt_', 'palm_', 'shrub_', 'yard_pocket', 'yard_frond', 'yardprop_dry')
def extras():
    if bpy.context.scene.get('ch2_extras_done'): print('extras already placed'); return
    road = bpy.data.objects['roads'].data.materials[0]; walk = bpy.data.objects['sidewalks'].data.materials[0]; mk = bpy.data.materials['HOOD_markings']
    streets = [g for g in EXTRAS['ground'] if g['kind'] == 'path' and g['id'] != 'L1']
    allroads = [([tuple(p) for p in L1['points']], L1['width'] / 2)] + [([tuple(p) for p in g['points']], g['width'] / 2) for g in streets]
    # the streets: as L1 (asphalt, kerbs, a dashed centre line)
    for g in streets:
        pts = resample([tuple(p) for p in g['points']], 1.0); half = g['width'] / 2
        strip('ch2_%s_road' % g['id'], pts, half, 0.031, road)
        strip('ch2_%s_kerb' % g['id'], pts, half, 0.031, walk, uv_tile=2.0, kerb=(0.22, 0.12))
        D = resample(pts, 0.5); k = 0
        while k + 6 < len(D): strip('ch2_%s_line' % g['id'], D[k:k + 7], 0.07, 0.036, mk); k += 12
    def on_road(x, z, m=0.0): return any(dist_line(x, z, P) < h + m for P, h in allroads)
    # the rows: the game's own row model, its collision box, four driveways out to their street
    n_trees = remove(lambda e: os.path.basename(e['src']).startswith(TREES) and (on_road(e.location.x, -e.location.y, 1.5) or
                     any(in_quad(B['footprint_corners'], e.location.x, -e.location.y, 2.0) for B in EXTRAS['buildings'])))
    for o in list(bpy.data.collections['COL'].objects):
        if (o.get('tag') or '').startswith('tree') and any(in_quad(B['footprint_corners'], o.location.x, -o.location.y, 2.0) for B in EXTRAS['buildings']): bpy.data.objects.remove(o, do_unlink=True)
    print('trees out of the new rows and streets', n_trees)
    for B in EXTRAS['buildings']:
        yaw = B['yaw']; place('models/%s.glb' % B['model'], B['x'], B['z'], yaw, collide=False, name='ch2_row_' + B['id'], owner=ID)
        Q = B['footprint_corners']; cx = sum(p[0] for p in Q) / 4; cz = sum(p[1] for p in Q) / 4
        L = math.hypot(Q[1][0] - Q[0][0], Q[1][1] - Q[0][1]); D = math.hypot(Q[3][0] - Q[0][0], Q[3][1] - Q[0][1])
        o = col_box('COL_bld_ch2_' + B['id'], cx, cz, L / 2, D / 2, yaw, 6.0, 'bld:' + B['id']); o['ch2'] = ID
        fx, fz = B['front']
        for k, lx in enumerate((2.38, 11.1, 18.5, 24.58)):
            # from the row's front (local z 0.3) out along its front until under a street (or 12 m)
            ax, az = R(yaw, lx, 0.3); ax += B['x']; az += B['z']
            d = 0.0
            while d < 12 and not on_road(ax + fx * d, az + fz * d, -0.3): d += 0.25
            if d >= 12: continue
            sx, sz = fz, -fx   # (across the driveway)
            pts = [(ax - sx * 2.0, az - sz * 2.0), (ax + sx * 2.0, az + sz * 2.0), (ax + sx * 2.0 + fx * d, az + sz * 2.0 + fz * d), (ax - sx * 2.0 + fx * d, az - sz * 2.0 + fz * d)]
            if (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]) > 0: pts = pts[::-1]
            ground_mesh('ch2_drive_%s_%d' % (B['id'], k), pts, 0.0302, road, ID)
    bpy.context.scene['ch2_extras_done'] = 1
    print('extra rows', len(EXTRAS['buildings']), 'streets', len(streets))

# the seal lines the rows moved away from (the leak test found them): the rubbish line at Marc's yard edge carried down to
# row 5's new front; the curve's west line (the bus and the cars) from row 6's new front corner; the gate line's west end
# now inside row 6 (its end wall shuts it) taken up there
CARS_S = ([('cars_raw/car3_sedan_crushed_white.glb', 'z', 28, 0.4), ('kit/tire_stack_3.glb', 'x', 30, 0.3), ('cars_raw/car3_coupe_rust.glb', 'z', 32, 0.4),
           ('kit/jersey_barrier.glb', 'x', 10, 0.2), ('kit/debris_pile.glb', 'x', 40, 0.3)], 2.2, 1.6, 0.1)
def fix_lines():
    if bpy.context.scene.get('ch2_lines_fixed'): print('lines already fixed'); return
    seal_line('home_b05_low', [(28.9, -6.8), (28.9, -12.0)], TRASH_S, rng, owner=ID)
    seal_line('curve_west_gap', [(0.3, -4.9), (1.75, 1.5)], CARS_S, rng, owner=ID)
    GA, GB, HIT = (-0.65, -13.7), (33.12, -19.3), 3.3
    print('gate line pieces inside row 6 out', remove(lambda e: e.name.startswith('gate_fence') and e.location.x < HIT and near_seg(e.location.x, -e.location.y, GA, GB, 0.8)))
    for o in list(bpy.data.collections['COL'].objects):
        t = o.get('tag') or ''
        if not t.startswith(('bld', 'seal', 'prop')) and o.location.x < HIT - 1.0 and near_seg(o.location.x, -o.location.y, GA, GB, 0.8) and o.scale.x < 6: print('  col out', o.name, t); bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.scene['ch2_lines_fixed'] = 1

# row 6 now reaches the gate line and the looters' roadblock: both stop at its new east end wall (the fence's long box from
# the old corner, the roadblock's south box), so neither runs through the neighbour's garage
def trim_at_row6():
    if bpy.context.scene.get('ch2_row6_trim'): print('row 6 ends already trimmed'); return
    for name, a, b, tag in (('COL_fence_338', (1.6, -14.08), (16.86, -16.60), 'fence'), ('COL_block_roadblock_s_0', (-0.76, -16.7), (-0.79, -26.55), 'block:roadblock_s')):   # (into the end wall, not the footprint)
        o = bpy.data.objects.get(name)
        if not o: print('missing', name); continue
        th, h = o.scale.y / 2, o.scale.z; bpy.data.objects.remove(o, do_unlink=True)
        L = math.hypot(b[0] - a[0], b[1] - a[1]); yaw = math.atan2(-(b[1] - a[1]), b[0] - a[0])
        c = col_box(name, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2, th, yaw, h, tag); c['ch2'] = ID
        print('trimmed', name, a, '->', b)
    bpy.context.scene['ch2_row6_trim'] = 1

# and the other ends they moved away from: the gate fence's east end carried into row 5's west wall; the lakeside boundary
# south of row 6 carried down into row 6's new west end (a few fence panels over the new part)
def reach_rows():
    if bpy.context.scene.get('ch2_reach_rows'): print('row ends already reached'); return
    for name, a, b, tag in (('COL_fence_337', (20.29, -17.17), (34.7, -19.56), 'fence'), ('COL_boundary_356', (-23.47, 1.5), (-23.4, 21.6), 'boundary')):
        o = bpy.data.objects.get(name)
        if not o: print('missing', name); continue
        th, h = o.scale.y / 2, o.scale.z; bpy.data.objects.remove(o, do_unlink=True)
        L = math.hypot(b[0] - a[0], b[1] - a[1]); yaw = math.atan2(-(b[1] - a[1]), b[0] - a[0])
        c = col_box(name, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2, th, yaw, h, tag); c['ch2'] = ID
        print('reached', name, a, '->', b)
    seal_line('w6_end', [(-23.45, 2.9), (-23.43, 6.7)], FENCE_S, rng, owner=ID)
    bpy.data.objects.remove(bpy.data.objects['COL_block_w6_end_0'], do_unlink=True)   # (the boundary box covers it)
    bpy.context.scene['ch2_reach_rows'] = 1

# H1: the plan's optional highway along the east edge, built as drawn: one plain asphalt slab (no kerbs, no markings, as the
# plan asks), the trees standing on it taken out. Past the free walk's edge (x 106) and the bake (x 110): seen from the air
def highway():
    if bpy.context.scene.get('ch2_highway_done'): print('highway already laid'); return
    x0, z0, x1, z1 = next(g for g in EXTRAS['ground'] if g['id'] == 'H1')['rect']
    on = lambda x, z: x0 - 1 <= x <= x1 + 1 and z0 - 1 <= z <= z1 + 1
    n = remove(lambda e: os.path.basename(e['src']).startswith(TREES) and on(e.location.x, -e.location.y))
    for o in list(bpy.data.collections['COL'].objects):
        if (o.get('tag') or '').startswith('tree') and on(o.location.x, -o.location.y): bpy.data.objects.remove(o, do_unlink=True)
    ground_mesh('ch2_H1_road', [(x0, z1), (x1, z1), (x1, z0), (x0, z0)], 0.031, bpy.data.objects['roads'].data.materials[0], ID)
    bpy.context.scene['ch2_highway_done'] = 1
    print('highway H1 laid; trees off it', n)

# Marc's notes on the built map (2026-10-21: P the pool, D the dock, PG the playground, H the two west rows, BBQ): the two
# west rows (B08, B07) 3 m further south for breathing room by the playground, with their yards, driveways and the lake
# fence that closes B08's yard; a row of bushes between the playground and B08; and at the BBQ one pavilion (the gazebo)
# with two grills beside it, the two small pavilions up the lake road taken out
HEDGE = 'props/hedge_round.glb'   # (Chapter 4's grammy_hedge: 3 m of low round shrubs, the villas' shrubs in a row)
def lake_strip():
    if bpy.context.scene.get('ch2_lake_strip_done'): print('lake strip already done'); return
    from mathutils import Vector
    seen = set()
    for row, iname, cname in (('B08', 'kit_row4_intact_v2.004', 'COL_bld_B08_208'), ('B07', 'kit_row4_intact_v2.003', 'COL_bld_B07_207')):
        e, c = bpy.data.objects[iname], bpy.data.objects[cname]
        old = {'x': e.location.x, 'z': -e.location.y, 'yaw': 0.0}; new = {'x': old['x'], 'z': old['z'] + 3.0, 'yaw': 0.0}
        Q = [(c.matrix_world @ Vector((sx, sy, 0)))for sx, sy in ((0.5, 0.5), (0.5, -0.5), (-0.5, -0.5), (-0.5, 0.5))]
        move_row({'row': row, 'model': 'kit_row4_intact_v2', 'old': old, 'new': new, 'footprint_corners': [(q.x, -q.y + 3.0) for q in Q]}, seen)
    # (B08's yard fence to the lake, a line piece the row move leaves: with it)
    n_fence = 0
    for o in list(placed().objects) + [bpy.data.objects.get('COL_block_b08_lake_0')]:
        if o is not None and (o.name.startswith('b08_lake') or o.name == 'COL_block_b08_lake_0') and o.name not in seen:
            o.location.y -= 3.0; seen.add(o.name); n_fence += 1
    # the bushes: z 5.5, from the lake's edge to the lake road's verge (x -64 to -43), each a little turned
    for k in range(7):
        place(HEDGE, -62.5 + 3.0 * k, 5.5 + rng.uniform(-0.15, 0.15), rng.uniform(-0.06, 0.06), name='ch2_hedge', owner=ID)
    # the BBQ: the gazebo stays; the two small pavilions (and their posts' collision) go; two grills on the gazebo's lake side
    n_pav = remove(lambda e: e.instance_collection is not None and e.instance_collection.name == 'pavilion_small')
    for o in list(bpy.data.collections['COL'].objects):
        if (o.get('tag') or '') == 'pavilion': bpy.data.objects.remove(o, do_unlink=True)
    gz = bpy.data.objects['gazebo_large.007']; gx, gzz, a = gz.location.x, -gz.location.y, gz.rotation_euler.z
    ex, ez = -math.cos(a), math.sin(a)      # (its west face, in game x / z)
    sx, sz = math.sin(a), math.cos(a)       # (along that face)
    for s in (1.3, -1.3):
        place('models/by_grill.glb', gx + ex * 4.5 + sx * s, gzz + ez * 4.5 + sz * s, a + math.pi / 2, name='ch2_bbq_grill', owner=ID)
    bpy.context.scene['ch2_lake_strip_done'] = 1
    print('lake strip: rows moved, fence pieces', n_fence, 'hedges 7, small pavilions out', n_pav)

if 'lake' in PARTS: lake_strip()
if 'highway' in PARTS: highway()
if 'rows' in PARTS: move_rows()
if 'drives' in PARTS: stretch_drives()
if 'lines' in PARTS: fix_lines(); trim_at_row6(); reach_rows()
if 'extra' in PARTS: extras()
if 'roaddry' in PARTS: lay_road(dry=True)
if 'road' in PARTS: lay_road(); yard_lines()
print('map parts done:', PARTS)
