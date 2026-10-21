# Chapter 2: Marc's change list on the built map (2026-10-21, design/CH2_MARC_NOTES_2026-10-21.md; the numbers below are
# its notes). Runs on hood.blend after the other ch2 scripts, in the user's open Blender (bl.mjs --run) or in the background.
# Each part can run again: what this script adds carries ['ch2'] = 'ch2_notes:<part>' and is wiped first; what it removes is
# looked up by name, so a second run finds nothing to remove. Coordinates are the game's (x east, z south).
#   open    1 the loop island's two fence lines, 2 the AC unit, 3 the bus, 6 the looters' roadblock, 9 the dock road's gate,
#           11 the gate across the road south of the home row: out
#   blender -b blender/hood/hood.blend --python blender/hood/ch2_notes.py -- open
import bpy, os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import importlib, hoodlib, ch2lib
for m in (hoodlib, ch2lib): importlib.reload(m)
from hoodlib import col_box
from ch2lib import *
from mathutils import Vector

PARTS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def owner(part): return 'ch2_notes:' + part

def cols_out(pred):
    n = 0
    for o in list(bpy.data.collections['COL'].objects):
        if pred(o.get('tag') or '', o): bpy.data.objects.remove(o, do_unlink=True); n += 1
    return n

def move_by(name, dx, dz):
    """A placement and its prop collider moved dx, dz (game metres)."""
    for n in (name, 'COL_prop_' + name):
        o = bpy.data.objects.get(n)
        if o: o.location.x += dx; o.location.y -= dz

# ---------------------------------------------------------------- open
LINES_OUT = ('home_back', 'curve_west_yard',            # 1: the island's fences ("they don't help or serve the game play")
             'roadblock_n', 'roadblock_gate', 'roadblock_s',   # 6: "I don't need that area blocked"
             'dock_road_gate',                         # 9: the X, "should be able to freely walk"
             'home_south', 'home_south_road',          # 11: the orange X, "remove that gate"
             'home_curve', 'home_b05', 'home_b05_low',  # (Marc, after looking round: "two barriers that i wanted gone that are still there": the
             'curve_west_road', 'curve_west_gap')       # survivors' barricade across the top of the loop, and the old bus line's junk on its west side)
SEALS_OUT = ('roadblock', 'dockroad', 'home')
def open_up():
    for lid in LINES_OUT:
        n = remove(lambda e: e.name.startswith(lid + '_') and not e.name.startswith(lid + '_yard'))   # (home_south: not home_south_yard)
        c = cols_out(lambda t, o: t == 'block:' + lid)
        print('line', lid, 'pieces out', n, 'colliders', c)
    for sid in SEALS_OUT: print('seal', sid, 'colliders', cols_out(lambda t, o: t == 'seal:' + sid))
    # the looters' roadblock: the panels the polish pass stood over its ends (polish_panel by x -1, z -14 .. -47)
    print('roadblock panels', remove(lambda e: e.name.startswith('polish_panel') and abs(e.location.x + 1.0) < 0.8 and -47.5 < gz(e) < -13.5))
    # 3: the bus (only the zombie mark z_curve_bus was named after it)
    print('bus', remove(lambda e: 'bus_wrecked' in e.get('src', '')))
    # 2: the AC unit to the house wall on the patio's other side (by the old fence, x 28.9), the hose reel a metre on
    ac, hose = bpy.data.objects.get('by_ac_unit.003'), bpy.data.objects.get('by_hose_reel.001')
    if ac and ac.location.x > 33: move_by('by_ac_unit.003', 28.8 - ac.location.x, 0)
    if hose and hose.location.x > 27.6: move_by('by_hose_reel.001', 27.2 - hose.location.x, 0)

# ---------------------------------------------------------------- park
# 3: "the cars.. they can be in drive ways abandoned... not in the road like this.. if one is in the road.. that's fine.. but
# the majority should be parked correctly.. that goes for large parking area too": the lot's cars into its bays, the loose
# ones and the road blocks' cars into driveways (straight, nose in or backed in); the hudson stays in the road and the black
# van at the clubhouse's kerb. The three road blocks built of cars keep their collision, rebuilt in junk with no car.
JUNK_S = ([('kit/jersey_barrier.glb', 'x', 6, 0.15), ('kit/tire_stack_3.glb', 'x', 30, 0.3), ('kit/debris_pile.glb', 'x', 40, 0.3),
           ('kit/pallet_stack.glb', 'x', 12, 0.2), ('kit/jersey_barrier_striped.glb', 'x', 6, 0.15), ('kit/trash_bags_5.glb', 'x', 40, 0.3)], 1.6, 1.6, 0.1)
JUNK_AGAIN = ('grandma_road',)   # (the loop's two went altogether: `open`)
CAR_LINES = {'curve_west_road': [(1.7, 1.3), (4.3, 18.0)], 'curve_west_gap': [(0.3, -4.9), (1.75, 1.5)], 'grandma_road': [(-45.3, 18.4), (-35.5, 18.8)]}
LOT_ROWS = (-82.46, -70.96, -63.96, -52.46)          # (the bays' centre lines: the stall lines 5 m long, 2.8 m apart in x)
LOT_X = [36.49 + 2.8 * i for i in range(8)] + [64.49 + 2.8 * i for i in range(8)]
def bays_taken():
    return [(e.location.x, gz(e)) for e in placed().objects if e.get('src') and 'car3_' in e['src']]
def driveways():
    """Each driveway's (centre, axis out from its house, length, width, house end)."""
    from mathutils import Vector
    out = []
    bld = [(o.location.x, gz(o)) for o in bpy.data.collections['COL'].objects if (o.get('tag') or '').startswith('bld:')]
    for cname, pre in (('GROUND', 'driveway_'), ('NEW', 'ch2_drive_')):
        for o in bpy.data.collections[cname].objects:
            if not o.name.startswith(pre) or o.type != 'MESH': continue
            P = [(w.x, -w.y) for w in (o.matrix_world @ v.co for v in o.data.vertices)]
            cx = sum(p[0] for p in P) / len(P); cz = sum(p[1] for p in P) / len(P)
            sxx = sum((p[0] - cx) ** 2 for p in P); szz = sum((p[1] - cz) ** 2 for p in P); sxz = sum((p[0] - cx) * (p[1] - cz) for p in P)
            a = 0.5 * math.atan2(2 * sxz, sxx - szz); ux, uz = math.cos(a), math.sin(a)
            al = [(p[0] - cx) * ux + (p[1] - cz) * uz for p in P]; ac = [-(p[0] - cx) * uz + (p[1] - cz) * ux for p in P]
            L, W = max(al) - min(al), max(ac) - min(ac)
            if W > L: ux, uz, L, W, al = -uz, ux, W, L, [-(p[0] - cx) * uz + (p[1] - cz) * ux for p in P]
            e0 = (cx + ux * min(al), cz + uz * min(al)); e1 = (cx + ux * max(al), cz + uz * max(al))
            nb = min(bld, key=lambda b: (b[0] - cx) ** 2 + (b[1] - cz) ** 2)
            h, s = (e0, 1) if math.dist(e0, nb) < math.dist(e1, nb) else (e1, -1)
            out.append(dict(name=o.name, c=(cx, cz), u=(ux * s, uz * s), L=L, W=W, house=h))
    return out
def park():
    rng = random.Random(3)
    wipe(owner('park'))
    # the three car road blocks: their pieces and boxes out, built again in junk
    for lid, pts in CAR_LINES.items():
        remove(lambda e: e.name.startswith(lid + '_')); cols_out(lambda t, o: t == 'block:' + lid)
        if lid in JUNK_AGAIN: seal_line(lid, pts, JUNK_S, rng, owner=owner('park'))
    # (the eight cars of the road blocks taken up here and in `open`, parked again: a mix, not eight of the same two)
    keep_cars = ['cars_raw/car3_sedan_crushed_white.glb', 'cars_raw/car3_hatch_stripped_white.glb', 'models/car3_suv_smashed_blue.glb', 'cars_raw/car3_coupe_rust.glb',
                 'cars_raw/car3_sedan_compact.glb', 'models/car3_pickup_crashed.glb', 'cars_raw/car3_wagon_60s.glb', 'models/car3_van_offroad.glb']
    # the lot: every car standing in it into a bay, rows from the clubhouse end
    lot = [e for e in placed().objects if e.get('src') and 'car3_' in e['src'] and 28 < e.location.x < 95 and -92 < gz(e) < -49]
    bays = [(x, z) for z in LOT_ROWS for x in LOT_X]; rng.shuffle(bays)
    for e, (x, z) in zip(lot, bays):
        yaw = (0.0 if rng.random() < 0.5 else math.pi) + math.radians(rng.uniform(-3, 3))
        move_by(e.name, x - e.location.x, z - gz(e)); e.rotation_euler.z = yaw
        c = bpy.data.objects.get('COL_prop_' + e.name)
        if c: c.rotation_euler.z = yaw
        print('lot', e.name, '->', (round(x, 1), z))
    # the loose ones left in the yards and on the island (not the hudson, not the van at the club): into driveways too
    loose = [e for e in placed().objects if e.get('src') and 'car3_' in e['src'] and not e.get('ch2') and not LINE_PIECE_NOTES(e.name)
             and not (28 < e.location.x < 95 and -92 < gz(e) < -49) and 'hudson' not in e['src'] and 'van_panel' not in e['src']]
    D = [d for d in driveways() if 5.5 <= d['L'] and 3.2 <= d['W'] <= 5.5 and -10 < d['c'][1] < 86 and -50 < d['c'][0] < 72]
    busy = [(o.location.x, gz(o)) for o in bpy.data.collections['COL'].objects if (o.get('tag') or '').startswith('prop:')]
    D = [d for d in D if not any(math.dist(d['c'], b) < 2.6 for b in busy)]
    # spread out: each next driveway the one farthest from those taken
    want = len(loose) + len(keep_cars); pick = []
    while D and len(pick) < want:
        d = max(D, key=lambda d: min([math.dist(d['c'], p['c']) for p in pick] or [1e9]) + rng.uniform(0, 3)) if pick else rng.choice(D)
        pick.append(d); D.remove(d)
    def spot(d, rel):
        L = size_of(rel)[1]; hx, hz = d['house']; ux, uz = d['u']; off = 0.9 + L / 2
        yaw = math.atan2(ux, uz) + (math.pi if rng.random() < 0.5 else 0.0) + math.radians(rng.uniform(-4, 4))
        return hx + ux * off, hz + uz * off, yaw
    for e, d in zip(loose, pick):
        x, z, yaw = spot(d, e['src']); move_by(e.name, x - e.location.x, z - gz(e)); e.rotation_euler.z = yaw
        c = bpy.data.objects.get('COL_prop_' + e.name)
        if c: c.rotation_euler.z = yaw
        print('driveway', e.name, '->', d['name'])
    for rel, d in zip(keep_cars, pick[len(loose):]):
        x, z, yaw = spot(d, rel); place(rel, x, z, yaw, name='parked_' + os.path.splitext(os.path.basename(rel))[0], owner=owner('park'))
        print('driveway (new)', rel, '->', d['name'])
LINE_PIECE_NOTES = lambda n: n.startswith(tuple(l + '_' for l in CAR_LINES))

# ---------------------------------------------------------------- shrubs
# 4: "large tall shrubs.. taller than marc" on his blue arc across the loop island's open end (the fences gone): the house's
# back yard screened from the loop road by a thick hedge row of hood_shrub_tall (2.6 m), where he drew it: its ends stop short
# of the kerbs as his did (about 5 m), so the yard is still walked into round them
import json
EXTRAS = json.load(open(os.path.join(HERE, 'src', 'chapter2_extras.json')))
L1 = next(g for g in EXTRAS['ground'] if g['id'] == 'L1'); L1P = [tuple(p) for p in L1['points']]; L1H = L1['width'] / 2
def dist_l1(x, z):
    best = 1e9
    for a, b in zip(L1P, L1P[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dz * dz or 1e-9; t = max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / L2))
        best = min(best, math.hypot(x - a[0] - dx * t, z - a[1] - dz * t))
    return best
def catmull(P, step):
    out = []
    Q = [P[0]] + P + [P[-1]]
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]; n = max(2, int(math.dist(p1, p2) / step * 4))
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(P[-1]); return resample_by(out, step)
def resample_by(pts, step):
    out = [pts[0]]; acc = 0.0
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b); t = step - acc
        while t <= L: out.append((a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)); t += step
        acc = (acc + L) % step
    return out
SHRUB = 'props/hood_shrub_tall.glb'
HEDGE_ARC = [(35.5, 21.5), (33.6, 16.6), (28.0, 13.2), (20.0, 12.2), (13.0, 13.2), (9.0, 16.5), (7.0, 20.5)]   # (read off his photo by the pickup, the fiat and the trees)
def shrubs():
    rng = random.Random(44); wipe(owner('shrubs'))
    P = list(HEDGE_ARC)
    S = catmull(P, 1.15)
    for x, z in S:
        place(SHRUB, x + rng.uniform(-0.12, 0.12), z + rng.uniform(-0.12, 0.12), rng.uniform(0, 6.28), s=rng.uniform(0.88, 1.12), collide=False, name='hedge_tall', owner=owner('shrubs'))
    for k, (a, b) in enumerate(zip(S[::3], S[3::3] + ([S[-1]] if (len(S) - 1) % 3 else []))):
        L = math.dist(a, b); yaw = math.atan2(-(b[1] - a[1]), b[0] - a[0])
        o = col_box('COL_block_hedge_tall_%d' % k, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2 + 0.4, 0.75, yaw, 2.6, 'block:hedge_tall'); o['ch2'] = owner('shrubs')
    print('tall hedge', len(S), 'shrubs, ends', [tuple(round(v, 1) for v in P[0]), tuple(round(v, 1) for v in P[-1])])

# ---------------------------------------------------------------- roundabout
# 5: "smooth out the connecting road in the around about.. add pavers around the grass of the round about.. or a curb... and
# add a small palm.. not a tall one.. one of those short wide ones": the two arms meet the old ground's circle (centre RB_C,
# asphalt r 4.5 .. 9) square-ended, a sliver of lawn at each corner; a fillet of asphalt (radius 4 m) in each of the four
# corners; the island: a raised kerb at its edge, a ring of pavers inside it, the lawn in the middle, one hood_palm_short
RB_C, RB_R = (10.07, -32.46), 9.0
RB_ARMS = {'west': [((-3.8, -24.05), (2.66, -26.21)), ((-6.66, -31.31), (0.49, -33.71))],     # (each edge: a far point, its end at the circle)
           'east': [((22.75, -42.32), (17.04, -40.36)), ((25.8, -36.02), (18.71, -33.56))]}
def ring_mesh(name, r0, r1, y0, y1, mat, n=72):
    """A flat ring (y0 == y1) or a kerb (a box section r0 .. r1, y0 .. y1) round the roundabout's centre."""
    import bmesh
    new = bpy.data.collections['NEW']; bm = bmesh.new(); cx, cz = RB_C
    def v(r, a, y): return bm.verts.new((cx + r * math.cos(a), -(cz + r * math.sin(a)), y))
    A = [2 * math.pi * i / n for i in range(n)]
    rings = [(r0, y0), (r1, y0)] if y0 == y1 else [(r0, y0), (r0, y1), (r1, y1), (r1, y0)]
    V = [[v(r, a, y) for a in A] for r, y in rings]
    for k in range(len(V) - 1):
        for i in range(n): bm.faces.new((V[k][i], V[k][(i + 1) % n], V[k + 1][(i + 1) % n], V[k + 1][i]))
    bm.normal_update()
    for f in bm.faces:   # (up, and the kerb's sides out from its own section)
        c = f.calc_center_median(); rr = math.hypot(c.x - cx, -c.y - cz)
        if abs(f.normal.z) > 0.5:
            if f.normal.z < 0: f.normal_flip()
        elif (f.normal.x * (c.x - cx) + (-f.normal.y) * (-c.y - cz)) * (1 if rr > (r0 + r1) / 2 else -1) < 0: f.normal_flip()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.new(name='UVMap')
    for li, lp in enumerate(me.loops): co = me.vertices[lp.vertex_index].co; uv.data[li].uv = (co.x / 2.0, co.y / 2.0)
    me.materials.append(mat); o = bpy.data.objects.new(name, me); o['ch2'] = owner('roundabout'); new.objects.link(o); return o
def roundabout():
    wipe(owner('roundabout'))
    road = bpy.data.objects['roads'].data.materials[0]; walk = bpy.data.objects['sidewalks'].data.materials[0]; pav = bpy.data.objects['paver_paths'].data.materials[0]
    cx, cz = RB_C; RF = 4.0
    for arm, edges in RB_ARMS.items():
        (fa, na), (fb, nb) = edges
        # (the arm's square end to the circle: from its two end corners round an arc at 8 m, inside the asphalt; the lawn left
        # between the end and the circle's edge is covered)
        a0, a1 = math.atan2(nb[1] - cz, nb[0] - cx), math.atan2(na[1] - cz, na[0] - cx); dd = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        cap = [na, nb] + [(cx + 8.0 * math.cos(a0 + dd * i / 10), cz + 8.0 * math.sin(a0 + dd * i / 10)) for i in range(11)]
        if sum(cap[i][0] * cap[(i + 1) % len(cap)][1] - cap[(i + 1) % len(cap)][0] * cap[i][1] for i in range(len(cap))) < 0: cap = cap[::-1]
        ground_mesh('ch2_rab_cap_' + arm, cap, 0.0322, road, owner('roundabout'))
        for k, ((far, near), other) in enumerate(((edges[0], edges[1][1]), (edges[1], edges[0][1]))):
            ux, uz = near[0] - far[0], near[1] - far[1]; L = math.hypot(ux, uz); ux, uz = ux / L, uz / L
            nx, nz = -uz, ux
            if (other[0] - near[0]) * nx + (other[1] - near[1]) * nz > 0: nx, nz = -nx, -nz   # (the normal out to the lawn, away from the other edge)
            # the fillet's centre: rf out from the edge's line, R + rf from the circle's centre
            ox, oz = far[0] + nx * RF, far[1] + nz * RF
            t0 = (ox - cx) * ux + (oz - cz) * uz; d2 = (ox - cx) ** 2 + (oz - cz) ** 2 - t0 * t0
            t = -t0 - math.sqrt(max(0.0, (RB_R + RF) ** 2 - d2))   # (the first such point coming in from the far end)
            if t < 0: t = -t0 + math.sqrt(max(0.0, (RB_R + RF) ** 2 - d2))
            Ox, Oz = ox + ux * t, oz + uz * t
            T1 = (Ox - nx * RF, Oz - nz * RF)
            g = math.hypot(Ox - cx, Oz - cz); T2 = (cx + (Ox - cx) * RB_R / g, cz + (Oz - cz) * RB_R / g)
            a1, a2 = math.atan2(T1[1] - Oz, T1[0] - Ox), math.atan2(T2[1] - Oz, T2[0] - Ox)
            da = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
            arc = [(Ox + RF * math.cos(a1 + da * i / 12), Oz + RF * math.sin(a1 + da * i / 12)) for i in range(13)]
            # (the fan's point on the asphalt ring, 5 m out from the centre toward the corner: its triangles then cover the
            # corner's sliver of lawn between the arm's square end and the circle as well)
            mx, mz = (T1[0] + T2[0]) / 2 - cx, (T1[1] + T2[1]) / 2 - cz; ml = math.hypot(mx, mz); pin = (cx + mx / ml * 5.0, cz + mz / ml * 5.0)
            outline = [pin] + arc
            if sum((outline[i][0] * outline[(i + 1) % len(outline)][1] - outline[(i + 1) % len(outline)][0] * outline[i][1]) for i in range(len(outline))) < 0: outline = outline[::-1]
            o = ground_mesh('ch2_rab_fillet_%s_%d' % (arm, k), outline, 0.0325, road, owner('roundabout'))
            print('fillet', arm, k, 'T1', tuple(round(v, 2) for v in T1), 'T2', tuple(round(v, 2) for v in T2))
    # the island: the kerb on the old walk ring's outer half, pavers inside it, the lawn in the middle
    ring_mesh('ch2_rab_kerb', 4.26, 4.5, 0.03, 0.17, walk)
    ring_mesh('ch2_rab_pavers', 2.9, 4.26, 0.045, 0.045, pav)
    # what lay in the island goes (dry branches, litter); the palm in the middle, a small trunk collider only
    print('island clutter out', remove(lambda e: math.hypot(e.location.x - cx, gz(e) - cz) < 4.6 and not e.get('ch2') and os.path.basename(e['src']).startswith(('debris', 'yard', 'nb_', 'cardboard', 'supply', 'trash', 'tire', 'shrub'))))
    place('props/hood_palm_short.glb', cx, cz, 0.4, collide=False, name='rab_palm', owner=owner('roundabout'))
    c = col_box('COL_prop_rab_palm', cx, cz, 0.3, 0.3, 0.0, 1.0, 'prop:palm'); c['ch2'] = owner('roundabout')

# ---------------------------------------------------------------- pavilion
# 7: "make the pavillion here smaller and more square. also.. put a bbq grill is the right of it": the lakeside's octagonal
# gazebo (7 m) out, the kit's square pavilion_small (5.6 m) where it stood; a grill on its east side (his right, toward the
# palm) and the two on its west side brought in to the smaller footprint
PAV_AT = (-31.9, -21.0, 0.3)
def pavilion():
    wipe(owner('pavilion'))
    gx, gzz, a = PAV_AT
    print('gazebo out', remove(lambda e: e.name == 'gazebo_large.007' or (e.name.startswith('pav_square') and not e.get('ch2'))))
    print('gazebo colliders out', cols_out(lambda t, o: t == 'gazebo' and math.hypot(o.location.x - gx, -o.location.y - gzz) < 6))
    place('models/pavilion_small.glb', gx, gzz, a, collide=False, name='pav_square', owner=owner('pavilion'))
    C = json.load(open(os.path.join(hoodlib.ASSETS, 'models', 'pavilion_small.colliders.json')))
    for k, b in enumerate(C['boxes']):
        lx, lz = (b['min'][0] + b['max'][0]) / 2, (b['min'][2] + b['max'][2]) / 2
        wx, wz = gx + lx * math.cos(a) + lz * math.sin(a), gzz - lx * math.sin(a) + lz * math.cos(a)
        o = col_box('COL_pav_square_%d' % k, wx, wz, (b['max'][0] - b['min'][0]) / 2, (b['max'][2] - b['min'][2]) / 2, a, b['max'][1], 'pavilion'); o['ch2'] = owner('pavilion')
    # the grills: the two west ones 3.9 m out (was 4.5 from the gazebo), one on the east
    ex, ez = math.cos(a), -math.sin(a); sx, sz = math.sin(a), math.cos(a)
    for i, s in enumerate((1.3, -1.3)):
        e = bpy.data.objects.get('ch2_bbq_grill' + ('' if i == 0 else '.001'))
        if e: move_by(e.name, gx - ex * 3.9 + sx * s - e.location.x, gzz - ez * 3.9 + sz * s - gz(e))
    place('models/by_grill.glb', gx + ex * 3.9 - sx * 0.6, gzz + ez * 3.9 - sz * 0.6, a - math.pi / 2, name='pav_grill_east', owner=owner('pavilion'))

# ---------------------------------------------------------------- playground
# 8: "right now it's like double lapped on the ground looks like two squares competing for space.. make it bigger.. put the
# swing set where i put the line with the ss. and have the slide below it where i put the box and the SL": one pad (the
# wood-chip pad stretched to 16 x 12 m), square to the lake road and the shore; the swings across its lake edge, the tower
# with its slides below them toward the road, the merry-go-round, the sandbox and the benches round them. (The second
# square was the old map's 'playground' mark, a mesh: it stays a mark, at the new pad's middle, and is no longer drawn.)
PAD_C, PAD_YAW, PAD_S = (-46.5, -7.0), 0.834, (1.3, 1.2)
def pad_xz(a, b):
    """The pad's own frame: a along its long side (game u = (cos, -sin) of PAD_YAW), b out toward the lake (+) / the road (-)."""
    c, s = math.cos(PAD_YAW), math.sin(PAD_YAW); lx, lz = a, -b
    return PAD_C[0] + lx * c + lz * s, PAD_C[1] - lx * s + lz * c
def playground():
    wipe(owner('playground'))
    print('old pieces out', remove(lambda e: e.name.startswith('play_') and not e.get('ch2')))
    hw, hd = 6.15 * PAD_S[0], 5.07 * PAD_S[1]
    inside = lambda x, z: (lambda dx, dz: abs(dx * math.cos(PAD_YAW) - dz * math.sin(PAD_YAW)) < hw + 1.0 and abs(dx * math.sin(PAD_YAW) + dz * math.cos(PAD_YAW)) < hd + 1.0)(x - PAD_C[0], z - PAD_C[1])
    print('clutter off the pad', remove(lambda e: not e.get('ch2') and inside(e.location.x, gz(e)) and os.path.basename(e['src']).startswith(('debris', 'yard', 'nb_', 'cardboard', 'supply', 'trash', 'tire', 'shrub', 'by_'))))
    p = place('props/hood_play_pad.glb', *PAD_C, PAD_YAW, collide=False, name='play_pad', owner=owner('playground')); p.scale = (PAD_S[0], PAD_S[1], 1.0)
    for rel, a, b, dyaw, nm in (('props/hood_swings.glb', -2.0, 4.0, 0.0, 'swings'), ('props/hood_play_tower.glb', 1.5, -0.6, 0.0, 'tower'),
                                ('props/hood_merry.glb', -5.4, -2.2, 0.5, 'merry'), ('props/hood_sandbox.glb', 5.6, 3.3, 0.15, 'sandbox'),
                                ('props/hood_bench.glb', -4.5, -7.0, math.pi, 'bench'), ('props/hood_bench.glb', 4.5, -7.0, math.pi, 'bench')):
        place(rel, *pad_xz(a, b), PAD_YAW + dyaw, name='play_' + nm, owner=owner('playground'))
    m = bpy.data.objects.get('playground')
    if m: m.location.x, m.location.y = PAD_C[0], -PAD_C[1]; m.hide_set(True); m.hide_render = True   # (the horde stands round it)

# ---------------------------------------------------------------- lake
# 8: "the grass should extend further out thats the red line": the lake's edge pulled back 5 m along the playground's
# stretch (flat for 12 m each side of the pad, tapering out by 26 m), out along the pad's lake direction; the water's mesh,
# the dirt bank, the water's collision and what stands on the bank move with it. (The lawn under it is one plane: it shows.)
SHORE_OUT = 5.0
def lake_edge():
    if bpy.context.scene.get('ch2_notes_lake'): print('lake edge already moved'); return
    c, s = math.cos(PAD_YAW), math.sin(PAD_YAW); u = (c, -s); n = (-s, -c)   # (n: from the pad out over the lake)
    lake = bpy.data.objects['lake']; Mw = lake.matrix_world; Mi = Mw.inverted()
    import bmesh
    from mathutils import Vector
    bm = bmesh.new(); bm.from_mesh(lake.data)
    edge = [(Mw @ v.co) for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
    edge = [(w.x, -w.y) for w in edge]
    def win(x, z):
        t = (x - PAD_C[0]) * u[0] + (z - PAD_C[1]) * u[1]
        if abs(t) <= 12: return 1.0
        return 0.5 * (1 + math.cos(math.pi * min(1.0, (abs(t) - 12) / 14)))
    def depth(x, z): return min(math.hypot(x - ex, z - ez) for ex, ez in edge)
    near = lambda x, z: (x - PAD_C[0]) * u[0] + (z - PAD_C[1]) * u[1]
    moved = 0
    for v in bm.verts:
        w = Mw @ v.co; x, z = w.x, -w.y
        if abs(near(x, z)) > 26: continue
        k = win(x, z) * max(0.0, 1 - depth(x, z) / 20) * SHORE_OUT
        if k <= 0: continue
        v.co = Mi @ Vector((x + n[0] * k, -(z + n[1] * k), w.z)); moved += 1
    bm.to_mesh(lake.data); bm.free(); lake.data.update()
    shore = bpy.data.objects['shore']; Ms = shore.matrix_world; Msi = Ms.inverted(); ns = 0
    for v in shore.data.vertices:
        w = Ms @ v.co; x, z = w.x, -w.y
        if abs(near(x, z)) > 26 or depth(x, z) > 8: continue
        k = win(x, z) * SHORE_OUT; v.co = Msi @ Vector((x + n[0] * k, -(z + n[1] * k), w.z)); ns += 1
    shore.data.update()
    nc = 0
    for o in list(bpy.data.collections['COL'].objects) + [e for e in placed().objects if e.get('src')]:
        x, z = o.location.x, -o.location.y
        if o.name.startswith('COL_prop_'): continue   # (they move with their props, below)
        is_water = (o.get('tag') or '') == 'water'
        if abs(near(x, z)) > 26 or (not is_water and depth(x, z) > 3.0): continue
        if not is_water and o.get('ch2') == owner('playground'): continue
        k = win(x, z) * SHORE_OUT
        if is_water: o.location.x += n[0] * k; o.location.y -= n[1] * k
        else: move_by(o.name, n[0] * k, n[1] * k)
        nc += 1
    bpy.context.scene['ch2_notes_lake'] = 1
    print('lake edge: water verts', moved, 'bank verts', ns, 'colliders and bank props', nc)

# ---------------------------------------------------------------- walls
# 9: "make the fence here taller .. actually make it a wall.. concrete.. have it go straight across" (behind the clubhouse,
# from the lake past the shed, on over the woods north of the lot); 11: "another tall concrete wall where the black line is
# all the way down the whole neighbourhood" (between the houses and the highway). One wall of hood_wall_concrete sections
# (2.9 m), its own collision; it takes the place of the dock field's fence (ch2_dock.py keeps only its lake end), the lot's
# north and east fences and the east edge's two lines, which go (the lot then opens north onto the court and the field;
# the cleared east lawn opens off the east rows). The south edge's line is carried east to the wall.
WALL_N = [(-33.5, -104.1), (106.0, -107.0)]   # (from the lake's new rounded shore: lakenorth)
WALL_E = [(106.0, -107.0), (106.0, -9.0), (103.5, 10.0), (99.0, 31.0), (95.0, 50.0), (91.0, 67.0), (88.5, 97.0), (86.5, 121.0), (85.0, 150.0)]
WALL_S = [(71.3, 82.0), (89.7, 82.0)]
BOUNDS_OUT = [((28.4, -91.0), (93.3, -91.0)), ((93.0, -91.2), (105.1, -51.7)), ((105.1, -52.2), (105.1, -8.7)), ((54.9, 5.3), (71.1, 21.8)), ((71.0, 48.2), (71.1, 82.3))]
BOUNDARY_KIT = ('palisade_2m', 'fence_privacy', 'barbed_wire', 'tire_stack', 'pallet_stack', 'hood_fence_slat')
WALL_PROP = 'props/hood_wall_concrete.glb'
def wall_line(lid, pts, own):
    """Sections end to end along pts, each segment filled exactly (its sections stretched a little to fit), a post at every
    joint; one box of collision a segment."""
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        L = math.dist(a, b); n = max(1, round(L / 4.0)); sx = L / (n * 4.0); yaw = math.atan2(-(b[1] - a[1]), b[0] - a[0])
        ux, uz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        for i in range(n):
            t = (i + 0.5) * L / n; e = place(WALL_PROP, a[0] + ux * t, a[1] + uz * t, yaw, collide=False, name=lid + '_wall', owner=own); e.scale = (sx, 1.0, 1.0)
        o = col_box('COL_wall_%s_%d' % (lid, k), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2 + 0.2, 0.25, yaw, 3.0, 'boundary'); o['ch2'] = own
def walls():
    own = owner('walls'); wipe(own)
    n_col = cols_out(lambda t, o: t == 'boundary' and o.scale.x > 3 and any(near_seg(o.location.x, gz(o), a, b, 1.0) for a, b in BOUNDS_OUT))
    n_col += cols_out(lambda t, o: o.name == 'COL_boundary_ch2_corner')
    n_kit = remove(lambda e: os.path.basename(e['src']).startswith(BOUNDARY_KIT) and any(near_seg(e.location.x, gz(e), a, b, 1.4) for a, b in BOUNDS_OUT))
    print('old edge lines out:', n_col, 'colliders', n_kit, 'pieces')
    wall_line('north', WALL_N, own); wall_line('east', WALL_E, own); wall_line('south_e', WALL_S, own)
    # no tree, bush or clutter under or against the wall
    allw = [WALL_N, WALL_E, WALL_S]
    n = remove(lambda e: not e.get('ch2') and (os.path.basename(e['src']).startswith(TREES_ALL) or e.name.startswith('debris')) and any(near_line(e.location.x, gz(e), W, 2.6) for W in allw))
    n += cols_out(lambda t, o: t.startswith('tree') and any(near_line(o.location.x, gz(o), W, 2.6) for W in allw))
    print('trees off the wall', n)
TREES_ALL = ('nbt_', 'palm_', 'shrub', 'yard_pocket', 'yard_frond', 'yardprop_dry', 'yard_crackweeds', 'debris')

# ---------------------------------------------------------------- east
# 11: "remove all the trees where the light blue is.. make it grass and walkable with 1 tree" (behind the east rows, from
# the tennis courts down, to the new wall), and "you can't sneak through the tennis courts.. there is debris blocking" (a
# junk line along the courts' south edge, which already has its fence); 10: "with the added space.. add a basketball court
# here" (north of the lot, its north fence gone, the woods cleared to the wall)
EAST_LAWN = [(71.0, -4.5), (106.0, -9.0), (103.5, 10.0), (99.0, 31.0), (95.5, 56.0), (71.0, 56.0)]
LOT_NORTH = [(27.0, -91.0), (106.0, -91.0), (106.0, -107.5), (27.0, -107.5)]
KEEP_TREE = (88.0, 28.0)
COURT_AT = (81.0, -98.6)
def east():
    own = owner('east'); wipe(own); rng = random.Random(11)
    def tree_like(e): return os.path.basename(e['src']).startswith(TREES_ALL) or e.name.startswith('debris')
    lawn = [e for e in placed().objects if e.get('src') and not e.get('ch2') and tree_like(e) and in_poly(EAST_LAWN, e.location.x, gz(e))]
    big = [e for e in lawn if os.path.basename(e['src']).startswith(('nbt_', 'palm_'))]
    keep = min(big, key=lambda e: math.dist((e.location.x, gz(e)), KEEP_TREE)) if big else None
    n = remove(lambda e: e in lawn and e is not keep and (not keep or e.name != keep.name))
    n += cols_out(lambda t, o: t.startswith('tree') and in_poly(EAST_LAWN, o.location.x, gz(o)) and not (keep and math.dist((o.location.x, gz(o)), (keep.location.x, gz(keep))) < 0.8))
    print('east lawn cleared', n, 'kept', keep.name if keep else None)
    n = remove(lambda e: not e.get('ch2') and tree_like(e) and in_poly(LOT_NORTH, e.location.x, gz(e)))
    n += cols_out(lambda t, o: t.startswith('tree') and in_poly(LOT_NORTH, o.location.x, gz(o)))
    print('north of the lot cleared', n)
    # the court, its two poles collide (the slab is walked on)
    cx, cz = COURT_AT
    place('props/hood_court_basketball.glb', cx, cz, 0.0, collide=False, name='court_basketball', owner=own)
    for s in (-1, 1):
        o = col_box('COL_prop_court_pole_%d' % (s > 0), cx + s * 14.0, cz, 0.15, 0.15, 0.0, 3.4, 'prop:court_pole'); o['ch2'] = own
    # (the junk line along the tennis courts' south edge went with `courts`: Marc fenced the court itself instead)

# ---------------------------------------------------------------- courts
# (Marc, looking round: "no need to fence off the volleyball court... yes fence off tennis court", "remove all the debris and
# trash too", "and get the trees and bushes off the volleyball court"): the lines that shut the courts' ground off from the
# club and the lot go (the club's east trash line, the lot's two chain lines), the volleyball court is cleared of trees and
# bushes, the tennis court's own fence closed at its south gap; no trash or debris left on that ground. The line along its
# south edge (to the east lawn) stays: it keeps the chained gate the way to the club.
COURTS = [(33.6, -49.6), (106.0, -49.6), (106.0, -9.0), (59.5, -4.4), (34.7, -19.6)]
VOLLEY = (36.8, 49.4, -41.4, -22.4)   # (where it stood; "move it over some too": 13.5 m east, by the tennis court, his red box)
VOLLEY_DX = 13.5
TRASHY = ('trash_bags', 'dumpster', 'cardboard', 'debris_pile', 'shopping_cart', 'tire', 'pallet', 'supply_bag', 'nb_', 'yardprop_', 'by_chair_collapsed', 'by_pot_tipped', 'barrel')
def courts():
    own = owner('courts'); wipe(own); rng = random.Random(12)
    for lid in ('club_east', 'lot_south_a', 'lot_south'):
        print('line', lid, 'pieces out', remove(lambda e: e.name.startswith(lid + '_')), 'colliders', cols_out(lambda t, o: t == 'block:' + lid))
    print('junk line out', remove(lambda e: e.name.startswith('courts_junk')), cols_out(lambda t, o: t == 'block:courts_junk'))
    v = bpy.data.objects.get('volleyball_court.001')
    if v and v.location.x < 47:   # (once: its net's colliders with it)
        v.location.x += VOLLEY_DX
        for o in bpy.data.collections['COL'].objects:
            if (o.get('tag') or '') == 'volley': o.location.x += VOLLEY_DX
    x0, x1, z0, z1 = VOLLEY[0] + VOLLEY_DX, VOLLEY[1] + VOLLEY_DX, VOLLEY[2], VOLLEY[3]
    on_volley = lambda x, z: x0 - 1.0 < x < x1 + 1.0 and z0 - 1.0 < z < z1 + 1.0
    print('volleyball court cleared', remove(lambda e: os.path.basename(e['src']).startswith(TREES_ALL) and on_volley(e.location.x, gz(e))),
          cols_out(lambda t, o: t.startswith('tree') and on_volley(o.location.x, gz(o))))
    print('trash and debris out', remove(lambda e: not e.get('ch2') and in_poly(COURTS, e.location.x, gz(e)) and not e.name.startswith(('tennis', 'volleyball'))
          and (e.name.startswith('debris') or os.path.basename(e['src']).startswith(TRASHY))))
    # the tennis court's fence: its south side's 3 m opening (x 81.6 .. 84.6 at z -11.95) closed with the same chain-link
    seal_line('tennis_gate', [(81.5, -11.95), (84.7, -11.95)], CHAIN, rng, tag='block:tennis_gate', owner=own)

# ---------------------------------------------------------------- clubback
# (Marc: "remove all the gate and fence behind the club house. keep the one around the pool.. thats different"): the club's
# back fence from the lake to the lot's corner (the boundary line, its palisades and panels, the club's dock gate, the trash
# line off the club's back corner) goes; the pool's own fence stays. The club's back and the dock field are one ground then.
CLUB_BACK = ((-25.0, -67.6), (26.3, -69.5))
def clubback():
    for lid in ('club_back', 'dock_gate'):
        print('line', lid, 'pieces out', remove(lambda e: e.name.startswith(lid + '_')), 'colliders', cols_out(lambda t, o: t in ('block:' + lid, 'seal:dock')))
    a, b = CLUB_BACK
    # ("all this junk too": the fence's tyres and pallets left a little off its line, the panels by the club's corner)
    print('fence pieces out', remove(lambda e: os.path.basename(e['src']).startswith(BOUNDARY_KIT) and near_seg(e.location.x, gz(e), a, b, 2.6)))
    print('panels by the corner out', remove(lambda e: e.name.startswith('polish_panel') and 19.5 < e.location.x < 22.0 and -68.5 < gz(e) < -60.5))
    print('fence colliders out', cols_out(lambda t, o: (t == 'boundary' or t.startswith('prop:fence') or t.startswith('prop:palisade')) and near_seg(o.location.x, gz(o), a, b, 1.5)))

# ---------------------------------------------------------------- lakenorth
# (Marc: "round out the lake.. i put a red line.. and the yellow is vegitation sticking out of the lake"): the lake's north
# shore, a straight line with a hard corner at the dock's end, swings round north and west in a curve over the strip by the
# dock field and the ground past the wall's old west end; the wall then starts at the new shore (WALL_N), the strip's fence
# and what stood there go; water collision along the new shore; reeds and cattails in the shallows along it
LAKE_N = [(-175.0, -139.5), (-150.0, -140.0), (-125.0, -137.0), (-100.0, -133.0), (-80.0, -128.0), (-65.0, -123.0), (-52.0, -117.0),
          (-42.0, -111.5), (-35.0, -106.5), (-30.5, -102.0), (-27.8, -97.5), (-26.6, -94.3)]   # (west to east, game x / z)
def lake_north():
    import bmesh
    from mathutils import Vector
    if bpy.context.scene.get('ch2_notes_lakenorth'): print('lake already rounded'); return
    o = bpy.data.objects['lake']; Mw = o.matrix_world; Mi = Mw.inverted(); y = (Mw @ o.data.vertices[0].co).z
    bm = bmesh.new(); bm.from_mesh(o.data)
    adj = {}
    for e in bm.edges:
        if e.is_boundary:
            a, b = e.verts; adj.setdefault(a.index, []).append(b.index); adj.setdefault(b.index, []).append(a.index)
    bm.verts.ensure_lookup_table()
    s = next(iter(adj)); L = [s]; prev = None; cur = s
    while True:
        nx = [n for n in adj[cur] if n != prev and n not in L]
        if not nx: break
        prev, cur = cur, nx[0]; L.append(cur)
    P = [(lambda w: (w.x, -w.y))(Mw @ bm.verts[i].co) for i in L]
    bm.free()
    # the run of the outline the curve replaces: the north edge and the corner (z under -95, east of x -180)
    out = [p for p in P if not (p[1] < -95.0 and p[0] > -180.0) or p[0] < -178.5]
    # put the curve in where that run was: after the point the outline reaches it from (the far west corner) ...
    k = min(range(len(out)), key=lambda i: math.dist(out[i], (-178.9, -101.7)))
    j = min(range(len(out)), key=lambda i: math.dist(out[i], (-26.3, -94.3)))
    # (the outline runs one way round; the curve goes in between the two points it joins, the right way about)
    if (j - k) % len(out) == 1: new = out[:k + 1] + LAKE_N + out[k + 1:]
    elif (k - j) % len(out) == 1: new = out[:j + 1] + LAKE_N[::-1] + out[j + 1:]
    else: raise RuntimeError('lake outline: the corner points are not neighbours (%d, %d of %d)' % (k, j, len(out)))
    bm = bmesh.new(); vs = [bm.verts.new(Mi @ Vector((x, -z, y))) for x, z in new]
    f = bm.faces.new(vs); bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
    for f in bm.faces:
        if f.normal.z < 0: f.normal_flip()
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for lp in f.loops: w = Mw @ lp.vert.co; lp[uvl].uv = (w.x / 8.0, w.y / 8.0)
    mats = list(o.data.materials); me = bpy.data.meshes.new('lake'); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    old = o.data; o.data = me; bpy.data.meshes.remove(old)
    bpy.context.scene['ch2_notes_lakenorth'] = 1
    print('lake outline', len(P), '->', len(new), 'points, faces', len(me.polygons))
def lake_north_dress():
    own = owner('lakenorth'); wipe(own); rng = random.Random(15)
    water = LAKE_N + [(-26.6, -94.3), (-27.0, -100.0), (-178.9, -101.7)]   # (the new water: between the curve and the old north shore)
    inside = lambda x, z: in_poly(water, x, z)
    print('out of the new water', remove(lambda e: not e.get('ch2') and inside(e.location.x, gz(e)) and not e.name.startswith(('north_wall', 'east_wall'))),
          cols_out(lambda t, o: (t.startswith('tree') or t == 'water') and inside(o.location.x, gz(o)) or (t == 'water' and o.location.x > -28 and gz(o) < -93)))
    # water collision along the new shore (inside the map), 0.4 m out over the water
    S = resample_by([(x, z) for x, z in LAKE_N if x > -80] + [(-26.0, -91.0)], 3.0) + [(-26.0, -91.0)]   # (on into the old east shore's own: no gap at the joint)
    for k, (a, b) in enumerate(zip(S, S[1:])):
        dx, dz = b[0] - a[0], b[1] - a[1]; Lg = math.hypot(dx, dz); nx, nz = -dz / Lg, dx / Lg   # (to the water's side: south of a line running east)
        c = ((a[0] + b[0]) / 2 + nx * 0.4, (a[1] + b[1]) / 2 + nz * 0.4)
        o = col_box('COL_water_north_%d' % k, c[0], c[1], Lg / 2 + 0.2, 0.4, math.atan2(-dz, dx), 1.0, 'water'); o['ch2'] = own
    # reeds in the shallows: clumps 3.5 - 7.5 m out from the new shore, every metre or two, thicker toward the corner
    for k, (x, z) in enumerate(resample_by([(x, z) for x, z in LAKE_N if x > -90], 1.6)):
        for _ in range(1 + (rng.random() < 0.5)):
            i = min(range(len(LAKE_N) - 1), key=lambda i: math.dist(LAKE_N[i], (x, z)))
            a, b = LAKE_N[i], LAKE_N[i + 1]; dx, dz = b[0] - a[0], b[1] - a[1]; Lg = math.hypot(dx, dz)
            d = rng.uniform(3.5, 7.5)   # (out past the shallows, which fade to clear over their first few metres: in the dark water)
            px, pz = x - dz / Lg * d + rng.uniform(-0.6, 0.6), z + dx / Lg * d + rng.uniform(-0.6, 0.6)   # (out to the water side, as the water collision)
            place('props/hood_reeds.glb', px, pz, rng.uniform(0, 6.28), s=rng.uniform(0.75, 1.25), collide=False, name='lake_reeds', owner=own)
    print('water colliders', len(S) - 1)

# ---------------------------------------------------------------- dock
# (Marc: "double the size of the dock. length and width.. so it can fit people and potential zombies"): the old 9 x 3 m pier
# (the old ground's 'gen' meshes, its 'dock' collision) out; hood_dock (make_ch2_props.py, 13.5 x 4.5 m) from the dock road's end
# out over the lake, its north edge where the old one's was (the boat lies along it); edge collision round its three sides on
# the water, the shore's water collision opened where it starts; layout.js FLOORS 'dock' lifts people onto its deck
DOCK_C, DOCK_HX, DOCK_HZ = (-28.75, -80.35), 6.75, 2.25   # (13.5 x 4.5 m: "25% smaller"; the shore end and the north edge where they were)
def dock():
    own = owner('dock'); wipe(own)
    n = 0
    for name in ['gen'] + ['gen.%03d' % i for i in range(1, 9)]:
        o = bpy.data.objects.get(name)
        if o and o.type == 'MESH' and -33 < (o.matrix_world @ o.data.vertices[0].co).x < -20: bpy.data.objects.remove(o, do_unlink=True); n += 1
    print('old pier meshes out', n, 'its collision', cols_out(lambda t, o: t == 'dock'))
    print('shore water collision opened', cols_out(lambda t, o: t == 'water' and -26.0 < o.location.x < -23.0 and -83.3 < gz(o) < -74.0))
    o = col_box('COL_water_dock_s', -24.2, -76.1, 0.6, 1.95, 0.0, 1.5, 'water'); o['ch2'] = own   # (the shore south of the pier, to the next box)
    cx, cz = DOCK_C
    place('props/hood_dock.glb', cx, cz, 0.0, collide=False, name='dock_pier', owner=own)
    # (the boat lay against the old pier's north rail, which is 1.1 m in from the new one's edge: out alongside it, once)
    if bpy.data.objects['boat_motor.001'].location.y < 83.5: move_by('boat_motor.001', 0.0, -1.1)
    x0, x1, z0, z1 = cx - DOCK_HX, -23.4, cz - DOCK_HZ, cz + DOCK_HZ
    for nm, (ax, az), (bx, bz) in (('n', (x0, z0), (x1, z0)), ('s', (x0, z1), (x1, z1)), ('w', (x0, z0), (x0, z1))):
        L = math.hypot(bx - ax, bz - az); o = col_box('COL_dock_edge_' + nm, (ax + bx) / 2, (az + bz) / 2, L / 2 + 0.15, 0.12, math.atan2(-(bz - az), bx - ax), 1.0, 'dock'); o['ch2'] = own

# ---------------------------------------------------------------- gaptrees
# (Marc, showing the gap between the B05 row and the east row by the tennis courts: "you can keep the palm .. but remove the
# trees between these buildings"): the oaks, the storm-bent and scraggly trees and the snag there go, the cabbage palm stays
GAP_TREES = ('nbt_broad_oak.124', 'nbt_broad_oak.125', 'nbt_broad_oak.126', 'nbt_broad_oak.130', 'nbt_broad_oak.136', 'nbt_scraggly.038',
             'nbt_scraggly.043', 'nbt_snag', 'nbt_storm.110')
def gaptrees():
    spots = [(o.location.x, gz(o)) for o in placed().objects if o.name in GAP_TREES]
    print('trees out', remove(lambda e: e.name in GAP_TREES), 'their collision', cols_out(lambda t, o: t.startswith('tree') and any(math.dist((o.location.x, gz(o)), q) < 0.8 for q in spots)))

# ---------------------------------------------------------------- b05
# (Marc, looking at the B05 row's broken end unit off his yard: "remove the stuff with the x on it.. and furnish that
# building thats cracked open the exact same way as my house"): the fence across its broken corner, the fence pieces and
# the trash bags out on the lawn east of it go. Inside, Marc's own ground floor: hood_home (make_ch2_props.py HOME), its
# fridge (shut: only Marc's swings) and copies of ch2_home.py's inside walls and furniture colliders, carried from his
# row's end unit into this one (the same row model, so the same rooms; the damaged row sits 0.18 m down). The unit's outer
# walls are its row's own (COL_bld_B05_*): its way in is the broken corner, into the kitchen.
B05_OUT = ('b05_gap_fence_privacy', 'fence_privacy.032', 'palisade_2m_b.041', 'fence_privacy.033', 'palisade_2m_b.042', 'debris.010')
HOME_OUTER = ('party', 'rear', 'front', 'east_n', 'east_s', 'door')
def b05():
    own = owner('b05'); print('wiped', wipe(own))
    print('out', remove(lambda e: e.name in B05_OUT), 'the gap seal', cols_out(lambda t, o: t == 'block:b05_gap'))
    import make_ch2_props; importlib.reload(make_ch2_props)
    HOME, HOME_C = make_ch2_props.HOME, make_ch2_props.HOME_C
    M, D = bpy.data.objects['kit_row4_intact_v2'], bpy.data.objects['kit_row4_damaged_v2']
    th = D.rotation_euler.z - M.rotation_euler.z; c, s = math.cos(th), math.sin(th); dy = D.location.z - M.location.z
    def at(x, z):   # (a point in Marc's house, game coords -> the same point in B05's end unit)
        lx, ly = x - M.location.x, -z - M.location.y
        return D.location.x + lx * c - ly * s, -(D.location.y + lx * s + ly * c)
    place('props/hood_home.glb', *at(*HOME_C), th, collide=False, name='b05_inside', owner=own, y=dy)
    kx = HOME['kx']
    place('props/hood_fridge.glb', *at(kx + 0.05 + 0.36, 44.45 + 0.38), th, collide=False, name='b05_fridge', owner=own, y=HOME['floor'] + dy)
    n = 0
    for o in list(bpy.data.collections['COL'].objects):
        if o.get('ch2') != 'ch2_home' or not o.name.startswith('COL_ch2_home_') or o.name[13:] in HOME_OUTER: continue
        x, z = at(o.location.x, -o.location.y)
        k = o.copy(); k.name = 'COL_ch2_b05_' + o.name[13:]; k['ch2'] = own; k['tag'] = 'prop:b05'
        k.location = (x, -z, o.location.z); k.rotation_euler = (0, 0, o.rotation_euler.z + th)
        bpy.data.collections['COL'].objects.link(k); n += 1
    print('b05 furnished: colliders', n)

# ---------------------------------------------------------------- gatefence
# (Marc, looking at the club gate's line from his side: "remove the stuff with an X .. and the fence circled in blue.. I want
# better quality fence.. maybe a taller chainlink fence, slighly taller than my character with barb wire. ... and trash out
# front... hap hazardly put together.. but better looking and harder to get over the top off"): the two runs of panels left
# along the club's east side (ch2_polish's, standing on nothing now) and the gate line's slatted panels go; the line is
# built again from make_ch2_props.py's chain-link (2.3 m, barbed wire and a razor coil on arms over Marc's side) from row
# 6's end wall to row 5's, the chained gate swapped for the one to match (the same place, tag and swinging leaves), and junk
# heaped against it on Marc's side, the gate's approach left clear. The line's collision stays (4 m: nobody climbs it); the
# heaps get low boxes of their own so nobody walks through them.
GATE_OUT = ('polish_panel.046', 'polish_panel.047', 'polish_panel.048', 'polish_panel.049', 'polish_panel.050', 'polish_panel.051')
GF_A, GF_B = (-0.65, -13.7), (33.12, -19.3)     # (dress_hood.py's gate line)
GF_X0, GF_X1 = 1.75, 34.7                       # (where it meets row 6's end wall and row 5's west wall)
GF_GATE = (18.58, -16.88)
# the junk: (model, along the line from its west end m, out toward Marc m, turn deg, lean deg toward the fence, stood on edge, up m)
GF_JUNK = [
    ('kit/car_tire_pile.glb', 1.6, 1.25, 6, 0, False, 0), ('kit/wall_corrugated.glb', 0.35, 0.95, 2, 21, False, 0),
    ('kit/tire.glb', 3.1, 0.75, 0, 0, False, 0.7), ('kit/trash_bags_5.glb', 3.8, 0.95, 12, 0, False, 0), ('kit/trash_bags_3.glb', 4.8, 1.7, 40, 0, False, 0),
    ('kit/sofa_dumped.glb', 6.1, 1.4, -3, 32, False, 0), ('kit/wall_corrugated_b.glb', 4.3, 0.85, -3, 20, False, 0), ('kit/pallet_stack.glb', 2.6, 1.95, 30, 0, False, 0),
    ('kit/trash_bags_5.glb', 5.0, 2.0, 60, 0, False, 0), ('kit/tire.glb', 9.2, 1.95, 0, 0, False, 0), ('kit/tire.glb', 9.25, 1.9, 0, 0, False, 0.22), ('kit/pallet.glb', 12.9, 0.5, 5, 15, True, 0), ('kit/cardboard_box_big.glb', 7.3, 1.75, 25, 0, False, 0),
    ('kit/pallet.glb', 7.9, 0.55, 4, 18, True, 0), ('kit/pallet.glb', 8.8, 0.7, -6, 24, True, 0), ('kit/barrel_rusty.glb', 9.7, 1.05, 0, 0, False, 0),
    ('kit/barrel_rusty.glb', 10.4, 1.6, 70, 90, False, 0), ('kit/wooden_crate.glb', 11.2, 0.85, 14, 0, False, 0), ('kit/wooden_crate.glb', 11.05, 0.8, 38, 0, False, 0.8),
    ('kit/wall_corrugated_b.glb', 11.7, 1.0, -2, 24, False, 0), ('kit/trash_bags_3.glb', 12.6, 1.85, -25, 0, False, 0), ('kit/shopping_cart_tipped.glb', 13.4, 1.35, 62, 0, False, 0),
    ('kit/tire.glb', 20.5, 0.9, 0, 0, False, 0), ('kit/tire.glb', 20.6, 0.95, 0, 0, False, 0.22), ('kit/tire.glb', 20.45, 0.88, 0, 0, False, 0.44),
    ('kit/wall_corrugated.glb', 21.4, 0.95, 3, 19, False, 0), ('kit/trash_bags_5.glb', 22.9, 1.75, -20, 0, False, 0),
    ('kit/fence_picket_broken.glb', 24.5, 0.55, -4, 26, False, 0), ('kit/debris_pile.glb', 26.0, 1.35, 15, 0, False, 0),
    ('kit/sofa_dumped.glb', 28.3, 1.45, 172, 28, False, 0), ('kit/wall_corrugated_b.glb', 25.4, 0.85, 1, 20, False, 0), ('kit/trash_bags_3.glb', 27.0, 2.3, 10, 0, False, 0),
    ('kit/pallet.glb', 23.3, 0.5, 2, 16, True, 0), ('kit/pallet.glb', 24.1, 0.65, -5, 22, True, 0), ('kit/wooden_crate.glb', 33.4, 1.25, 20, 0, False, 0), ('kit/pallet_stack.glb', 29.9, 1.2, 15, 0, False, 0), ('kit/pallet.glb', 30.6, 0.6, 3, 20, True, 0),
    ('kit/barrel_rusty.glb', 31.5, 1.0, 0, 0, False, 0), ('models/yardprop_trash_can_rust.glb', 32.2, 1.55, 100, 88, False, 0),
    ('models/by_chair_collapsed.glb', 31.0, 2.0, 30, 0, False, 0), ('kit/military_crate.glb', 32.7, 0.8, 8, 0, False, 0), ('kit/trash_bags_3.glb', 33.0, 1.7, -40, 0, False, 0)]
GF_HEAPS = [(0.0, 14.0), (20.1, 33.2)]          # (along the line: where the junk lies, its low collision)

def settle(e):
    """Down (or up) onto the ground: the lowest point of what the placement draws at y 0."""
    lo = 1e9
    for o in e.instance_collection.all_objects:
        if o.type != 'MESH': continue
        for v in o.bound_box: lo = min(lo, (e.matrix_world @ o.matrix_world @ Vector(v)).z)
    e.location.z -= lo + 0.01

def gatefence():
    import make_ch2_props; importlib.reload(make_ch2_props)
    own = owner('gatefence'); print('wiped', wipe(own))
    print('panels out', remove(lambda e: e.name in GATE_OUT or e.name.startswith('gate_fence')))
    dx, dz = GF_B[0] - GF_A[0], GF_B[1] - GF_A[1]; L = math.hypot(dx, dz); ux, uz = dx / L, dz / L; yaw = math.atan2(-uz, ux)
    nx, nz = -uz, ux                                    # (Marc's side: +z, away from the club)
    def pt(t): return GF_A[0] + ux * t, GF_A[1] + uz * t
    t0, t1 = (GF_X0 - GF_A[0]) / ux, (GF_X1 - GF_A[0]) / ux
    tg = (GF_GATE[0] - GF_A[0]) * ux + (GF_GATE[1] - GF_A[1]) * uz
    S = make_ch2_props.FENCE['L']; n = 0
    for a, b in ((t0, tg - 1.74), (tg + 1.74, t1)):
        k = max(1, round((b - a) / S)); w = (b - a) / k
        for i in range(k):
            x, z = pt(a + (i + 0.5) * w)
            e = place('props/hood_fence_chain_b.glb' if n in (2, 9) else 'props/hood_fence_chain.glb', x, z, yaw, collide=False, name='gate_chain', owner=own)
            e.scale.x = w / S; n += 1
        x, z = pt(b if a < tg else a); place('props/hood_fence_post.glb', x, z, yaw, collide=False, name='gate_chain_post', owner=own)
        x, z = pt(a if a < tg else b); place('props/hood_fence_post.glb', x, z, yaw, collide=False, name='gate_chain_post', owner=own)
    g = bpy.data.objects['palisade_gate.001']
    g.instance_collection = ensure_model('props/hood_gate_chain.glb'); g['src'] = 'props/hood_gate_chain.glb'
    tj = lambda t: t0 + t
    for rel, t, d, turn, lean, edge, up in GF_JUNK:
        x, z = pt(tj(t)); x, z = x + nx * d, z + nz * d
        e = place(rel, x, z, yaw + math.radians(turn), collide=False, name='gate_junk', owner=own, y=up)
        e.rotation_euler = (math.radians(90 - lean) if edge else -math.radians(lean) * (1 if abs(turn) < 90 else -1), 0, yaw + math.radians(turn))
        bpy.context.view_layer.update()
        if up == 0: settle(e)
    for k, (a, b) in enumerate(GF_HEAPS):
        (xa, za), (xb, zb) = pt(tj(a)), pt(tj(b)); cx, cz = (xa + xb) / 2 + nx * 1.2, (za + zb) / 2 + nz * 1.2
        o = col_box('COL_gate_junk_%d' % k, cx, cz, (b - a) / 2, 0.85, yaw, 1.0, 'block:gate_junk'); o['ch2'] = own
    for m in bpy.data.materials:
        if m.name.startswith('M_chainlink'): make_ch2_props.chainlink_wire(m)
    print('gate line: sections', n, 'junk', len(GF_JUNK))

if 'open' in PARTS: open_up()
if 'park' in PARTS: park()
if 'shrubs' in PARTS: shrubs()
if 'roundabout' in PARTS: roundabout()
if 'pavilion' in PARTS: pavilion()
if 'playground' in PARTS: playground()
if 'lake' in PARTS: lake_edge()
if 'walls' in PARTS: walls()
if 'east' in PARTS: east()
if 'courts' in PARTS: courts()
if 'clubback' in PARTS: clubback()
if 'lakenorth' in PARTS: lake_north(); lake_north_dress()
if 'dock' in PARTS: dock()
if 'gaptrees' in PARTS: gaptrees()
if 'b05' in PARTS: b05()
if 'gatefence' in PARTS: gatefence()
print('notes parts done:', PARTS)
