# Chapter 2: the remake's changes to the neighbourhood, applied to the base scene (build_hood.py) and saved as hood.blend.
#   blender -b blender/hood/hood_base.blend --python blender/hood/dress_hood.py
# The user (2026-10-19): building and path positions stay; "car placement is not very smart ... lots of barricades ...
# you can't exit this way ... rocks, rubble, broken stuff, piles of garbage bags". So:
#   - the old level's eight cars come out and come back where they mean something (pile-ups, cover, the maintenance pickup)
#   - every stop is sealed by lines of real kit pieces, each line backed by ONE continuous collision box per segment (no gap
#     between props can leak); lines the story opens are tagged seal:<id>, their props too (the game moves them aside)
#   - Grandma's front door (B08's north unit) comes inside the playable edge
#   - MARKS: named empties the game reads (starts, spawns, pickups, story spots)
# Coordinates below are the game's (three.js world: x east, z south), metres.
import bpy, os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hoodlib import *

OUTF = os.path.join(HERE, 'hood.blend')
rng = random.Random(20261020)
lib = bpy.data.collections['LIB']; placed = bpy.data.collections['PLACED']

def ensure_model(rel):
    name = os.path.splitext(os.path.basename(rel))[0]
    c = bpy.data.collections.get(name)
    if c is not None and c.get('src'): return c
    c = bpy.data.collections.new(name); lib.children.link(c)
    objs = import_into(os.path.join(ASSETS, rel), c); swap_materials(objs); c['src'] = rel
    for o in objs: o.hide_set(False)
    return c

def place(rel, x, z, yaw=0.0, s=1.0, tag=None, collide=True, name=None):
    c = ensure_model(rel)
    e = bpy.data.objects.new(name or c.name, None)
    e.instance_type = 'COLLECTION'; e.instance_collection = c
    e.location = (x, -z, 0); e.rotation_euler = (0, 0, yaw); e.scale = (s, s, s)
    e['src'] = rel
    if tag: e['tag'] = tag
    placed.objects.link(e)
    bpy.context.view_layer.update()
    if collide: prop_collider(e)
    return e

def remove(pred):
    n = 0
    for e in list(placed.objects):
        if e.get('src') and pred(e):
            c = bpy.data.objects.get('COL_prop_' + e.name)
            if c: bpy.data.objects.remove(c, do_unlink=True)
            bpy.data.objects.remove(e, do_unlink=True); n += 1
    return n

def size_of(rel):
    b = lib_bounds(ensure_model(rel)); return (b[1] - b[0], b[3] - b[2], b[5] - b[4]) if b else (1, 1, 1)  # (local x, local three-z, height)

# ---------------------------------------------------------------- 1. the old cars out (the user: "not very smart")
print('old cars removed', remove(lambda e: os.path.basename(e['src']).startswith('car3_')))

# ---------------------------------------------------------------- 2. Grandma's: the old edge ran across her front door
for o in list(bpy.data.collections['COL'].objects):
    if o.get('tag') == 'boundary':
        x, z = o.location.x, -o.location.y
        if -46.5 < x < -22.5 and 4.5 < z < 10.5: bpy.data.objects.remove(o, do_unlink=True)
print('palisade along the old edge removed', remove(lambda e: 'palisade' in e['src'] and -46 < e.location.x < -23 and 4 < -e.location.y < 11))

# ---------------------------------------------------------------- 2b. floors the player walks on at ground level
# (the user: "the feet kind of slipped right through the floor" in the old clubhouse and on the boat) the damaged end units'
# garage slabs stand 0.18 m up: their rows sink 0.18 m (from outside the same; inside the slab is the ground)
for e in placed.objects:
    if 'kit_row4_damaged' in e.get('src', ''): e.location.z -= 0.18

# ---------------------------------------------------------------- 3. seal lines
# style: (props in turn [(file, along: 'x' | 'z' (which local axis runs along the line), yaw jitter deg, side jitter m)],
#         collision thickness m, collision height m, gap between props m)
FENCE = ([('kit/fence_privacy.glb', 'x', 2, 0.04)], 0.4, 2.0, -0.05)
CHAIN = ([('props/hood_fence_slat.glb', 'x', 1, 0.02)], 0.3, 2.0, -0.02)   # (polish 1: the plain chain-link read as bare posts at this camera: slatted panels)
CARS = ([('cars_raw/car3_sedan_crushed_white.glb', 'z', 28, 0.4), ('kit/tire_stack_3.glb', 'x', 30, 0.3), ('cars_raw/car3_coupe_rust.glb', 'z', 32, 0.4),
         ('kit/jersey_barrier.glb', 'x', 10, 0.2), ('cars_raw/car3_wagon_60s.glb', 'z', 25, 0.4), ('kit/debris_pile.glb', 'x', 40, 0.3),
         ('cars_raw/car3_hatch_stripped_white.glb', 'z', 30, 0.4), ('kit/car_tire_pile.glb', 'x', 40, 0.2), ('models/car3_suv_smashed_blue.glb', 'z', 26, 0.4)], 2.2, 1.6, 0.1)
TRASH = ([('kit/trash_bags_5.glb', 'x', 40, 0.25), ('kit/dumpster.glb', 'x', 6, 0.1), ('kit/trash_bags_3.glb', 'x', 50, 0.3), ('kit/cardboard_box_big.glb', 'x', 30, 0.3),
          ('kit/debris_pile.glb', 'x', 40, 0.25), ('kit/trash_bags_5.glb', 'x', 60, 0.3), ('kit/shopping_cart_tipped.glb', 'x', 60, 0.3), ('kit/trash_bags_3.glb', 'x', 40, 0.3)], 1.3, 1.4, -0.1)
BARRICADE = ([('kit/pallet_stack.glb', 'x', 12, 0.15), ('kit/wall_corrugated.glb', 'x', 6, 0.1), ('kit/sandbags_2m.glb', 'x', 5, 0.1), ('kit/barricade_sawhorse.glb', 'x', 8, 0.15),
              ('kit/wall_corrugated_b.glb', 'x', 6, 0.1), ('kit/tire_stack_4.glb', 'x', 20, 0.15), ('kit/pallet_stack.glb', 'x', 15, 0.15)], 1.0, 1.8, -0.15)

def seal_line(lid, pts, style, tag=None, h=None, first=None):
    props, thick, ch, gap = style
    tag = tag or ('block:' + lid)
    k = 0
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz); ux, uz = dx / L, dz / L; nx, nz = -uz, ux
        along_x = math.atan2(-dz, dx)   # yaw that turns a model's local x along the line
        col_box('COL_%s_%d' % (tag.replace(':', '_'), k), (ax + bx) / 2, (az + bz) / 2, L / 2 + 0.15, thick / 2, along_x, h or ch, tag)
        t = 0.1
        seq = ([first] if first and k == 0 else []) + props
        i = 0
        while t < L - 0.4:
            rel, axis, yj, sj = seq[i] if i < len(seq) else props[(i - len(seq)) % len(props)]
            sx, sz, sh = size_of(rel)
            w = sx if axis == 'x' else sz
            if t + w > L + 0.6 and w > 2.5: i += 1; t += 0.3; continue   # (a big piece that would overhang the line's end: try the next)
            c = t + w / 2; off = rng.uniform(-sj, sj)
            x, z = ax + ux * c + nx * off, az + uz * c + nz * off
            yaw = (along_x if axis == 'x' else math.atan2(dx, dz)) + math.radians(rng.uniform(-yj, yj)) + (math.pi if rng.random() < 0.5 and axis == 'z' else 0)
            place(rel, x, z, yaw, tag=tag if tag.startswith('seal:') else None, collide=False, name='%s_%s' % (lid, os.path.splitext(os.path.basename(rel))[0]))
            t += w + gap; i += 1
        k += 1

BUS = ('models/car3_bus_wrecked.glb', 'z', 6, 0.2)
# home (stop 1): the pile-up across the loop south of Marc's row, the B05 garage gap, the back-garden fences
seal_line('home_south', [(36.6, 46.0), (44.8, 47.6)], FENCE)
seal_line('home_south_road', [(44.8, 47.6), (54.0, 49.0)], CARS)
seal_line('home_south_yard', [(54.0, 49.0), (59.5, 49.4)], TRASH)
seal_line('b05_gap', [(53.6, 1.8), (55.5, 6.2)], FENCE)
seal_line('home_back', [(28.9, 32.6), (28.9, 15.4)], FENCE)
seal_line('home_curve', [(28.9, 15.4), (28.9, 6.0)], BARRICADE, tag='seal:home')            # the survivors' barricade: the way on
seal_line('home_b05', [(28.9, 6.0), (28.9, -6.9)], TRASH)
# the curve (stop 2): the crashed bus and the fences west of B06's open garage
seal_line('curve_west_road', [(1.7, 1.3), (4.3, 18.0)], CARS, first=BUS)
seal_line('curve_west_yard', [(4.3, 18.0), (6.5, 32.6)], FENCE)
# beyond the gate: the club front's east side and the lot fence (the courts stay out of reach); the looters' roadblock west
seal_line('club_east', [(33.6, -19.6), (33.6, -40.5)], TRASH)
seal_line('lot_south_a', [(33.6, -40.5), (41.5, -49.5)], CHAIN)
seal_line('lot_south', [(41.5, -49.5), (105.5, -49.5)], CHAIN)
seal_line('roadblock_n', [(-1.3, -46.4), (-1.0, -32.6)], BARRICADE)
seal_line('roadblock_gate', [(-1.0, -32.6), (-0.9, -26.4)], CHAIN, tag='seal:roadblock')    # their padlocked gate: the leader's keys
seal_line('roadblock_s', [(-0.9, -26.4), (-0.6, -13.9)], CARS)
seal_line('club_back', [(20.6, -61.0), (20.7, -69.6)], TRASH)
seal_line('club_door', [(8.2, -47.3), (11.0, -47.3)], BARRICADE, tag='seal:clubdoor')         # the looters' barricade behind the front doors
# the dock trail (stop 10): the club's launch gate, locked; the keys open it, but not without Lilah
seal_line('dock_gate', [(-23.8, -67.6), (-12.5, -67.6)], CHAIN, tag='seal:dock')
# Grandma's (stop 8): her unit inside, the main road shut south of it, the lake gap behind B08
seal_line('grandma_road', [(-45.3, 18.4), (-35.5, 18.8)], CARS)
seal_line('grandma_yard', [(-35.5, 18.8), (-23.2, 19.4)], FENCE)
seal_line('b08_lake', [(-58.3, 7.6), (-64.8, 7.2)], FENCE)

# the gate's chained leaves: shut until the chain is cut
for o in bpy.data.collections['COL'].objects:
    if o.get('tag') == 'gate': o['tag'] = 'seal:gate'
for e in placed.objects:
    if 'palisade_gate' in e.get('src', ''): e['tag'] = 'seal:gate'
    if 'boat_motor' in e.get('src', ''): e['tag'] = 'boat'     # (the escape boat: drawn on its own, it leaves the dock at the end)

# ---------------------------------------------------------------- 3b. polish pass 1: the playground, the gate, its fence
# the playground (the user: "doesn't look very good"): the old model and its collision out; a wood-chip pad with a play
# tower, swings (one seat hanging by a chain), a merry-go-round knocked off level, a sandbox and two benches
PG = (-44.425, -4.96, math.radians(-30))
def pg(lx, lz):
    c, s = math.cos(PG[2]), math.sin(PG[2]); return PG[0] + lx * c + lz * s, PG[1] - lx * s + lz * c
print('old playground removed', remove(lambda e: os.path.basename(e['src']) == 'playground.glb'))
for o in list(bpy.data.collections['COL'].objects):
    if o.get('tag') == 'playground': bpy.data.objects.remove(o, do_unlink=True)
for rel, lx, lz, dyaw, col in (('props/hood_play_pad.glb', 0, 0, 0, False), ('props/hood_play_tower.glb', -2.4, -1.2, 0, True), ('props/hood_swings.glb', 3.2, -2.6, 0, True),
                               ('props/hood_merry.glb', 2.6, 2.4, 0.4, True), ('props/hood_sandbox.glb', -3.6, 2.8, 0.2, True),
                               ('props/hood_bench.glb', 0.5, 6.2, math.pi, True), ('props/hood_bench.glb', -7.0, 0.5, -math.pi / 2, True)):
    x, z = pg(lx, lz); place(rel, x, z, PG[2] + dyaw, collide=col, name='play_' + os.path.basename(rel)[5:-4])
# the gate (the user: "doesn't look very good"): a steel-posted chain-link double gate, chained and padlocked; the gate
# line's patchwork palisade becomes chain-link with green privacy slats and barbed wire (the boundary's palisades stay)
GA, GB = (-0.65, -13.7), (33.12, -19.3)
def near_gate_line(x, z, m=1.2):
    dx, dz = GB[0] - GA[0], GB[1] - GA[1]; L2 = dx * dx + dz * dz; t = max(0, min(1, ((x - GA[0]) * dx + (z - GA[1]) * dz) / L2))
    return math.hypot(x - (GA[0] + dx * t), z - (GA[1] + dz * t)) < m
for e in placed.objects:
    if 'palisade_gate' in e.get('src', ''):
        c = ensure_model('props/hood_gate.glb'); e.instance_collection = c; e['src'] = 'props/hood_gate.glb'; e['tag'] = 'seal:gate'
print('gate-line palisades removed', remove(lambda e: 'palisade_2m' in e['src'] and near_gate_line(e.location.x, -e.location.y)))
GATE_C, GATE_HALF = (18.57, -16.88), 1.95
dx, dz = GB[0] - GA[0], GB[1] - GA[1]; L = math.hypot(dx, dz); ux, uz = dx / L, dz / L; yaw_line = math.atan2(-dz, dx)
t = 0.0
while t < L - 0.2:
    w = 2.4; c = t + w / 2; x, z = GA[0] + ux * c, GA[1] + uz * c
    if math.hypot(x - GATE_C[0], z - GATE_C[1]) < GATE_HALF + 1.15: t += 0.3; continue
    place('props/hood_fence_slat.glb', x, z, yaw_line, collide=False, name='gate_fence'); t += w

# ---------------------------------------------------------------- 3c. polish pass 1: what people dropped and the storm left
# (the user: "add debris and trash ... broken stuff"; 05_ART_DIRECTION: "Not dark or gloomy"; no blue tarps) small things
# that never block: luggage and bags from the people who ran, boxes, tyres, fallen palm fronds, dead branches; kept out of
# buildings, cars and fences (the story's pickups are drawn above anything here)
DEBRIS = [('models/nb_palm_debris.glb', 4), ('models/yardprop_dry_branches.glb', 3), ('kit/cardboard_box.glb', 3), ('kit/tire.glb', 2), ('models/nb_suitcase.glb', 2),
          ('models/nb_tote.glb', 2), ('models/nb_water_jug.glb', 2), ('kit/supply_bag.glb', 2), ('kit/trash_bags_3.glb', 2), ('models/yardprop_old_tyre.glb', 1),
          ('models/by_chair_collapsed.glb', 1), ('models/by_pot_tipped.glb', 1), ('kit/cardboard_box_big.glb', 1)]
AREAS = [((37, 58), (5, 46), 34), ((6, 28), (4, 30), 26), ((6, 30), (-16, 0), 16), ((2, 32), (-45, -20), 26), ((35, 88), (-84, -51), 40),
         ((-40, -3), (-45, -12), 30), ((-45, -26), (-2, 17), 18), ((-22, -14), (-66, -60), 5)]
bag = [rel for rel, w in DEBRIS for _ in range(w)]
cols_now = [(o.location.x, -o.location.y, max(o.scale.x, o.scale.y) / 2 + 0.6) for o in bpy.data.collections['COL'].objects if o.get('col')]
def clear_spot(x, z):
    for cx, cz, r in cols_now:
        if abs(x - cx) < r and abs(z - cz) < r: return False
    return True
n_debris = 0
for (x0, x1), (z0, z1), n in AREAS:
    for _ in range(n):
        for _try in range(12):
            x, z = rng.uniform(x0, x1), rng.uniform(z0, z1)
            if clear_spot(x, z): break
        else: continue
        place(rng.choice(bag), x, z, rng.uniform(0, math.tau), collide=False, name='debris'); n_debris += 1
print('debris', n_debris)

# ---------------------------------------------------------------- 4. cars that mean something
place('models/car3_hudson_hornet.glb', 46.4, 24.0, math.radians(172))           # stop 1: cover on the loop arm
place('models/car3_pickup_rusty.glb', 41.0, 11.8, math.radians(64))            # stop 1: nosed into the curve
place('models/car3_fiat132_rust.glb', 14.0, 12.6, math.radians(-75))           # stop 2: abandoned on the curve
place('models/car3_van_panel_90s.glb', 1.6, -41.2, math.radians(70))           # the looters' van at the portico
place('cars_raw/car3_pickup_utility_90.glb', 58.0, -71.5, math.radians(12))    # stop 5: the maintenance pickup (the gas can in its bed)
place('kit/boat_row.glb', 63.0, -74.5, math.radians(100), collide=True)         # stop 5: the stranded boat trailer's boat
for i, (rel, x, z, yd) in enumerate([('models/car3_pickup_crashed.glb', 44, -60, 30), ('models/car3_van_offroad.glb', 50, -79, 95),
                                       ('cars_raw/car3_sedan_compact.glb', 70, -62, -80), ('cars_raw/car3_boxtruck_lct.glb', 78, -76, 15),
                                       ('cars_raw/car3_coupe_rust.glb', 66, -82, 88), ('cars_raw/car3_wagon_60s.glb', 40, -71, -12)]):
    place(rel, x, z, math.radians(yd))                                          # stop 5: cover across the lot

# ---------------------------------------------------------------- 5. marks
marks = bpy.data.collections.get('MARKS') or bpy.data.collections.new('MARKS')
if marks.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(marks)
def mark(name, x, z, yaw=0.0, y=0.0):
    e = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    e.empty_display_type = 'SINGLE_ARROW'; e.empty_display_size = 0.8
    e.location = (x, -z, y); e.rotation_euler = (0, 0, yaw)
    if e.name not in marks.objects: marks.objects.link(e)
MARKS = {
    'start_home': (38.2, 40.6, math.pi / 2), 'door_home': (36.9, 40.6), 'survivor_rifle': (47.6, 31.0, 0.0), 'rifle_drop': (46.6, 29.8),
    'survivor_far_a': (44.0, 15.5), 'survivor_far_b': (49.5, 13.5),
    'z_home_garage': (52.5, -1.0), 'z_home_fence': (61.0, 12.0), 'z_home_yard': (39.0, 3.0), 'z_home_pile': (50.0, 50.6), 'z_home_curve': (33.0, 10.5),
    'seal_home_use': (29.8, 10.5),
    'cutters': (2.9, -3.6), 'garage_light': (3.4, -2.6), 'z_curve_bus': (5.5, 9.0), 'z_curve_yard': (12.0, 26.0), 'z_garage': (-2.0, -8.0),
    'gate_use': (18.6, -15.4), 'z_gate_a': (14.0, -27.0), 'z_gate_b': (24.0, -30.0), 'z_gate_c': (10.0, -36.0), 'z_gate_d': (28.0, -24.0),
    'club_warn': (10.5, -41.0), 'club_door': (9.6, -46.0), 'z_drive_a': (26.0, -44.0), 'z_drive_b': (31.0, -58.0),
    'gas_can': (58.4, -73.4), 'z_lot_a': (86.0, -60.0), 'z_lot_b': (75.0, -86.0), 'z_lot_c': (48.0, -86.0), 'z_lot_d': (36.0, -66.0), 'z_lot_e': (88.0, -82.0),
    'girls_portico': (13.4, -43.6), 'keys': (9.0, -60.2), 'leader': (9.8, -60.0), 'looter_a': (7.0, -52.0), 'looter_b': (14.0, -55.0), 'looter_c': (12.9, -44.7), 'looter_d': (6.3, -44.9),
    'roadblock_use': (0.6, -29.5), 'z_pav_a': (-20.0, -24.0), 'z_pav_b': (-30.0, -32.0),
    'grandma_door': (-44.6, 11.0, -math.pi / 2), 'lilah': (-44.0, 11.4), 'grandma': (-44.2, 12.6),
    'playground': (-44.4, -5.0), 'z_play_a': (-52.0, -14.0), 'z_play_b': (-36.0, -2.0), 'z_play_c': (-40.0, 14.0), 'z_play_d': (-30.0, -16.0),
    'dock_use': (-18.0, -66.6), 'boat': (-27.5, -80.9), 'pour_fuel': (-25.6, -80.4), 'z_dock_a': (-14.0, -62.0), 'z_dock_b': (-4.0, -63.5), 'z_dock_c': (-19.0, -57.0),
}
for n, v in MARKS.items(): mark(n, v[0], v[1], v[2] if len(v) > 2 else 0.0)

bpy.ops.wm.save_as_mainfile(filepath=OUTF)
print('dressed: placed', len(placed.objects), 'colliders', len(bpy.data.collections['COL'].objects), 'marks', len(marks.objects), '->', OUTF)
