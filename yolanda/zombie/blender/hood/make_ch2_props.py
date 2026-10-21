# Chapter 2 rebuild (2026-10-20): the new set pieces, modelled in a scene of their own ('Ch2Props') in the user's open
# Blender (the user: "when you do your work, I want you to do it within Blender") or in the background, and exported to
# assets/neighborhood/props/hood_<name>.glb for blender/hood/ch2_*.py to place.
#   shed   the groundskeeper's tool shed up the bank from the dock (the user: "I want to be able to walk into it ... you'll
#          see the chainsaw in there. The gas canister ... decorate it to a shed"): 4.4 x 3.4 m, a double door on the front
#          (-Y, the game's +Z: toward the camera and the boat), shut and padlocked (the game swings the leaves DoorL / DoorR
#          open: Pete's key); a workbench and pegboard on the back
#          wall, a steel shelf unit on the left, a gun rack and a mower on the right, rakes in the corner, a bulb on its
#          cord. The gas can, the shotgun and the chainsaw are the game's own models, placed by the level.
#   (in the background) blender -b --factory-startup --python blender/hood/make_ch2_props.py -- [names]
import bpy, math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, propkit; importlib.reload(propkit)
from propkit import box, rod, disc, prism, wall, root, export, use_scene

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'neighborhood', 'props')

# the shed's measures (local metres, front -Y; ch2_dock.py builds its collision from these): the doorway runs door_at ..
# door_at + door_w along the front wall from its left end; bench, shelf, rack: what stands inside (centre x, y, half x, y)
SHED = dict(w=4.4, d=3.4, h=2.3, ridge=3.25, t=0.1, door_at=1.2, door_w=1.6,
            inside=[(-0.2, 1.27, 1.25, 0.33), (-1.88, 0.5, 0.22, 0.68), (1.45, -0.85, 0.4, 0.55)])
# where the level's pieces go (local): the chainsaw on the bench, the gas can under its right end, the shotgun on the rack
SHED_OPEN = dict(DoorL=-1.75, DoorR=0.85)   # (radians about the vertical: the leaves once unlocked)
SHED_SPOTS = dict(chainsaw=(-0.55, 1.2, 0.93), gas=(0.95, 0.7, 0.0), shotgun=(2.12, -0.1, 1.31))

def shed():
    rng = random.Random(21)
    W, D, H, T = SHED['w'], SHED['d'], SHED['h'], SHED['t']
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    r = root('hood_shed')
    SID, TRIM, ROOF = 'M_wood_painted__sage', 'M_wood_painted__white', 'M_roof_shingles'   # (the siding's paint mask speckled close up)
    WOOD, DARK, STEEL = 'M_wood_raw', 'M_wood_dark', 'M_metal_painted__grey'
    # floor: boards on a low sill (4 cm: feet do not sink)
    box(r, 'floor', (W - 0.05, D - 0.05, 0.04), (0, 0, 0.02), 'M_wood_floor')
    # walls: the front with the double doorway, the left with a window by the front corner, the back, the right
    da, dw = SHED['door_at'], SHED['door_w']
    wall(r, 'wall_front', (x0, y0 + T / 2), (x1, y0 + T / 2), H, T, SID, holes=[(da, dw, 0, 2.0)])
    wall(r, 'wall_back', (x0, y1 - T / 2), (x1, y1 - T / 2), H, T, SID)
    wall(r, 'wall_left', (x0 + T / 2, y0), (x0 + T / 2, y1), H, T, SID, holes=[(0.25, 0.7, 1.15, 1.7)])
    wall(r, 'wall_right', (x1 - T / 2, y0), (x1 - T / 2, y1), H, T, SID)
    # gables at the left and right ends (the ridge runs along x)
    for gx in (x0 + T / 2, x1 - T / 2):
        g = prism(r, 'gable', [(-D / 2, H), (D / 2, H), (0, SHED['ridge'])], -T / 2, T / 2, SID)
        g.rotation_euler = (0, 0, math.pi / 2); g.location = (gx, 0, 0)
    # trim: corner boards, the door frame, the window frame and a dark pane
    for cx in (x0, x1):
        for cy in (y0, y1): box(r, 'corner', (0.12, 0.12, H), (cx, cy, H / 2), TRIM)
    fx = x0 + da
    for xx in (fx - 0.04, fx + dw + 0.04): box(r, 'door_jamb', (0.08, 0.14, 2.04), (xx, y0 + T / 2, 1.02), TRIM)
    box(r, 'door_head', (dw + 0.16, 0.14, 0.08), (fx + dw / 2, y0 + T / 2, 2.04), TRIM)
    wy = y0 + 0.6
    for zz in (1.12, 1.73): box(r, 'window_frame', (0.14, 0.8, 0.07), (x0 + T / 2, wy, zz), TRIM)
    box(r, 'window_pane', (0.02, 0.7, 0.55), (x0 + T / 2, wy, 1.42), 'M_glass')
    # the door leaves on their hinges at the jambs, shut (SHED_OPEN: how far the game swings each); a hasp and padlock
    leaf = dw / 2 - 0.02
    for side, rz in ((-1, 0.0), (1, 0.0)):
        hx = fx if side < 0 else fx + dw
        lf = bpy.data.objects.new('DoorL' if side < 0 else 'DoorR', None); propkit.SC.collection.objects.link(lf); lf.parent = r
        lf.location = (hx, y0, 0); lf.rotation_euler = (0, 0, rz)
        box(lf, 'door_leaf', (leaf, 0.05, 1.98), (-side * leaf / 2, -0.03, 1.0), SID)
        for zz in (0.3, 1.0, 1.7): box(lf, 'door_rail', (leaf, 0.03, 0.12), (-side * leaf / 2, -0.07, zz), TRIM)
        box(lf, 'door_brace', (0.08, 0.03, 1.5), (-side * leaf / 2, -0.07, 1.0), TRIM, rot=(0, side * 0.62, 0))
        if side > 0:
            box(lf, 'hasp', (0.16, 0.02, 0.05), (-leaf + 0.06, -0.09, 1.1), 'M_metal_painted__darkgrey')
            box(lf, 'padlock', (0.06, 0.03, 0.07), (-leaf - 0.01, -0.11, 1.06), 'M_metal_painted__yellow')
    # roof: two shingled planes through the wall tops and the ridge, out 0.28 m over the eaves; fascias, a ridge cap
    slope = (SHED['ridge'] - H) / (D / 2); run = D / 2 + 0.28; L = run * math.hypot(1, slope); a = math.atan(slope)
    for s in (-1, 1):
        box(r, 'roof', (W + 0.5, L, 0.06), (0, s * run / 2, SHED['ridge'] - slope * run / 2 + 0.03), ROOF, rot=(-s * a, 0, 0))
        box(r, 'fascia', (W + 0.5, 0.04, 0.16), (0, s * run, H - slope * 0.28 - 0.04), TRIM)
    box(r, 'ridge_cap', (W + 0.5, 0.16, 0.05), (0, 0, SHED['ridge'] + 0.05), 'M_metal_painted__darkgrey')
    # ---- inside: the workbench on the back wall (centre bx)
    bx, by = -0.2, y1 - T - 0.33
    box(r, 'bench_top', (2.5, 0.66, 0.06), (bx, by, 0.9), WOOD)
    for sx in (-1.15, 1.15):
        for sy in (-0.28, 0.28): box(r, 'bench_leg', (0.08, 0.08, 0.87), (bx + sx, by + sy, 0.435), DARK)
    box(r, 'bench_shelf', (2.4, 0.6, 0.03), (bx, by, 0.22), WOOD)
    box(r, 'bench_back', (2.5, 0.03, 0.12), (bx, y1 - T - 0.02, 0.98), DARK)
    # under it: a toolbox, a coffee can of nails, a stack of flowerpots
    box(r, 'toolbox', (0.55, 0.28, 0.24), (bx - 0.7, by, 0.36), 'M_metal_painted__red')
    box(r, 'toolbox_lid', (0.57, 0.3, 0.03), (bx - 0.7, by, 0.49), 'M_metal_painted__red')
    disc(r, 'nail_can', 0.08, 0.16, (bx - 0.1, by + 0.05, 0.31), 'M_metal_rusty', seg=12)
    for k in range(4): disc(r, 'pot', 0.12 - k * 0.003, 0.11, (bx + 0.6, by - 0.05, 0.29 + k * 0.05), 'M_flat__terracotta', seg=12, r2=0.09)
    # on it: a vice, a mug, a work lamp, a rag (the chainsaw is the level's own model, set down left of the lamp)
    box(r, 'vice', (0.16, 0.18, 0.12), (bx - 1.05, by - 0.25, 0.99), 'M_metal_painted__blue')
    disc(r, 'mug', 0.045, 0.1, (bx + 0.95, by + 0.12, 0.98), 'M_flat__white', seg=10)
    box(r, 'rag', (0.3, 0.22, 0.015), (bx + 0.55, by - 0.1, 0.94), 'M_fabric__red', rot=(0, 0, 0.4))
    rod(r, 'lamp_arm', (bx + 1.0, by + 0.25, 0.93), (bx + 0.9, by + 0.05, 1.35), 0.012, 'M_metal_painted__darkgrey')
    disc(r, 'lamp_shade', 0.09, 0.1, (bx + 0.88, by, 1.32), 'M_metal_painted__green', seg=12, r2=0.04, tilt=0.6)
    # the pegboard above it with its tools: a hammer, a saw, wrenches, screwdrivers, a coil of extension cord
    pb = y1 - T - 0.02
    box(r, 'pegboard', (2.3, 0.02, 0.85), (bx, pb, 1.55), 'M_wood_painted__cream')
    rod(r, 'hammer_handle', (bx - 0.9, pb - 0.03, 1.25), (bx - 0.9, pb - 0.03, 1.6), 0.016, DARK)
    box(r, 'hammer_head', (0.14, 0.03, 0.035), (bx - 0.9, pb - 0.03, 1.62), STEEL)
    prism(r, 'saw_blade', [(bx - 0.75, 1.3), (bx - 0.2, 1.36), (bx - 0.2, 1.46), (bx - 0.75, 1.62)], pb - 0.045, pb - 0.035, STEEL)
    box(r, 'saw_grip', (0.14, 0.03, 0.14), (bx - 0.15, pb - 0.04, 1.42), WOOD)
    for k in range(4): box(r, 'wrench', (0.02, 0.012, 0.17 + k * 0.04), (bx + 0.1 + k * 0.07, pb - 0.03, 1.7 - k * 0.02), STEEL)
    for k in range(3):
        rod(r, 'screwdriver', (bx + 0.5 + k * 0.06, pb - 0.03, 1.28), (bx + 0.5 + k * 0.06, pb - 0.03, 1.48), 0.008, STEEL)
        box(r, 'sd_grip', (0.03, 0.03, 0.08), (bx + 0.5 + k * 0.06, pb - 0.03, 1.5), 'M_plastic__yellow')
    disc(r, 'cord_coil', 0.17, 0.05, (bx + 0.8, pb - 0.05, 1.62), 'M_plastic__orange', seg=16, tilt=math.pi / 2)
    # the steel shelf unit on the left wall (behind the window): paint cans, jugs, cartons; a bag of fertiliser at the foot
    sx, sy0 = x0 + T + 0.22, 0.5
    for sy in (sy0 - 0.65, sy0 + 0.65):
        for dx in (-0.2, 0.2): rod(r, 'shelf_post', (sx + dx, sy, 0), (sx + dx, sy, 1.9), 0.015, STEEL)
    for zz in (0.12, 0.62, 1.12, 1.62): box(r, 'shelf', (0.42, 1.34, 0.025), (sx, sy0, zz), STEEL)
    for zz in (0.65, 1.15, 1.65):
        y = sy0 - 0.6
        while y < sy0 + 0.5:
            k = rng.random()
            if k < 0.45: disc(r, 'paint_can', 0.085, 0.17, (sx + rng.uniform(-0.06, 0.06), y + 0.09, zz + 0.085), rng.choice(['M_metal_painted__grey', 'M_metal_painted__blue', 'M_metal_painted__white']), seg=12); y += 0.2
            elif k < 0.7: box(r, 'jug', (0.14, 0.11, 0.26), (sx, y + 0.08, zz + 0.13), rng.choice(['M_plastic__white', 'M_plastic__blue', 'M_plastic__red'])); y += 0.18
            else: box(r, 'carton', (0.34, 0.3, 0.22), (sx, y + 0.17, zz + 0.11), 'M_paper', rot=(0, 0, rng.uniform(-0.1, 0.1))); y += 0.36
    box(r, 'fert_bag', (0.38, 0.6, 0.18), (sx, sy0 - 0.1, 0.23), 'M_fabric__green', rot=(0, 0, 0.05))
    # the right wall: a two-peg gun rack (the shotgun lies on it: the level's pickup), a hose coil; the mower in the front
    # corner, rakes and a shovel leaning in the back corner
    rx = x1 - T - 0.03
    box(r, 'rack_board', (0.03, 1.1, 0.16), (rx, -0.1, 1.3), DARK)
    for sy in (-0.45, 0.25): box(r, 'rack_peg', (0.12, 0.04, 0.05), (rx - 0.06, sy, 1.25), DARK)
    disc(r, 'hose', 0.24, 0.07, (rx - 0.05, 0.85, 1.5), 'M_rubber', seg=16, tilt=math.pi / 2, axis='Y')
    mw = (x1 - 0.75, y0 + 0.75)
    disc(r, 'mower_deck', 0.29, 0.14, (mw[0], mw[1], 0.16), 'M_metal_painted__red', seg=16)
    box(r, 'mower_motor', (0.24, 0.24, 0.2), (mw[0], mw[1], 0.33), 'M_metal_painted__darkgrey')
    for dx in (-0.25, 0.25):
        for dy in (-0.22, 0.22): disc(r, 'mower_wheel', 0.08, 0.05, (mw[0] + dx, mw[1] + dy, 0.08), 'M_rubber', seg=12, tilt=math.pi / 2, axis='Y')
    for dx in (-0.2, 0.2): rod(r, 'mower_handle', (mw[0] + dx, mw[1] + 0.25, 0.25), (mw[0] + dx * 1.1, mw[1] + 0.85, 1.0), 0.013, 'M_metal_painted__darkgrey')
    rod(r, 'mower_bar', (mw[0] - 0.22, mw[1] + 0.85, 1.0), (mw[0] + 0.22, mw[1] + 0.85, 1.0), 0.013, 'M_metal_painted__darkgrey')
    for k, (ax, ay) in enumerate(((x1 - 0.3, y1 - 0.25), (x1 - 0.45, y1 - 0.2), (x1 - 0.6, y1 - 0.22))):
        rod(r, 'tool_handle', (ax, ay - 0.35, 0.02), (ax - 0.15, ay - 0.05, 1.55), 0.016, WOOD)
        if k == 0: box(r, 'shovel_head', (0.22, 0.03, 0.3), (ax, ay - 0.36, 0.17), STEEL, rot=(0.25, 0, 0))
        else: box(r, 'rake_head', (0.42, 0.04, 0.06), (ax, ay - 0.37, 0.05), STEEL)
    # the bulb on its cord from the ridge (unlit: it is day)
    rod(r, 'bulb_cord', (0.2, 0, SHED['ridge'] - 0.05), (0.2, 0, 2.25), 0.006, 'M_flat__black')
    disc(r, 'bulb', 0.04, 0.09, (0.2, 0, 2.2), 'M_flat__white', seg=10)
    return r

# ---------------------------------------------------------------- Marc's house, inside (house_plan.png, from the user's sketch)
# The shell is the row model's east end unit (kit_row4_intact_v2 at game x 6.68, z 45.54): inner walls x 29.1 .. 36.05,
# z 32.95 .. 45.25, floor at 0.18 m, the front door on the east wall at z 38.0 .. 38.95. The plan, fitted to it (north up):
# living (north-west) and dining (north-east) open to each other; the stairs west of the entry between two walls; the
# garage (south-west) behind a door on the kitchen's west wall; the kitchen (south-east) with its counters on that wall and
# the fridge in the far corner; no hall. Sparse (the user: "it's a small space"), lived in and looted.
# Built in game coordinates through G (the prop's origin is HOME_C, front -Y = the game's +Z).
HOME_C = (32.575, 39.1)
HOME = dict(x0=29.1, x1=36.05, z0=32.95, z1=45.25, floor=0.2, h=2.6, door=(38.0, 38.97),
            band=(37.9, 39.05, 39.9), kx=32.85, gdoor=(39.45, 40.3))
def G(x, z, y=0.0): return (x - HOME_C[0], HOME_C[1] - z, y)
def gbox(r, n, x0, z0, x1, z1, y0, y1, mat, yaw=0.0):
    """A box between game corners (x0, z0) - (x1, z1), y0..y1 (the floor's height added), turned yaw about its centre."""
    F = HOME['floor']
    return box(r, n, (abs(x1 - x0), abs(z1 - z0), y1 - y0), G((x0 + x1) / 2, (z0 + z1) / 2, F + (y0 + y1) / 2), mat, rot=(0, 0, yaw))

def home():
    rng = random.Random(4)
    H, F = HOME, HOME['floor']
    r = root('hood_home')
    PL, SK, WOODF, TILE, CONC = 'M_plaster__white', 'M_wood_painted__white', 'M_wood_floor', 'M_tile_floor', 'M_concrete_slab'
    L1, L2, K = H['band']  # living / dining south edge, the stairs' south wall (the garage's north), the kitchen's north edge
    # floors (2 cm over the shell's slab): boards in the living rooms, the entry and on the stairs, tiles in the kitchen,
    # bare concrete in the garage
    gbox(r, 'floor_wood', H['x0'], H['z0'], H['x1'], L1, -0.02, 0.0, WOODF)
    gbox(r, 'floor_wood', 33.0, L1, H['x1'], K, -0.02, 0.0, WOODF)
    gbox(r, 'floor_tile', H['kx'], K, H['x1'], H['z1'], -0.02, 0.0, TILE)
    gbox(r, 'floor_conc', H['x0'], L2, H['kx'], H['z1'], -0.02, 0.0, CONC)
    # inside walls (full height; the cutaway takes everything over 2.45 m once Marc is in)
    T = 0.1
    gbox(r, 'wall', H['x0'], L1 - T / 2, 33.0, L1 + T / 2, 0, H['h'], PL)                       # the living room's south (the stairs' north)
    gbox(r, 'wall', H['x0'], L2 - T / 2, H['kx'] + T / 2, L2 + T / 2, 0, H['h'], PL)          # the stairs' south (the garage's north)
    g0, g1 = H['gdoor']
    gbox(r, 'wall', H['kx'] - T / 2, L2, H['kx'] + T / 2, g0, 0, H['h'], PL)                  # the garage's east wall, its door near the north end
    gbox(r, 'wall', H['kx'] - T / 2, g1, H['kx'] + T / 2, H['z1'], 0, H['h'], PL)
    gbox(r, 'wall', H['kx'] - T / 2, g0, H['kx'] + T / 2, g1, 2.05, H['h'], PL)
    # the garage door's leaf, open into the garage; frames on it and on the stairs' mouth
    a = math.radians(75)  # (hinged at the north jamb, swung 75 deg into the garage)
    box(r, 'door_leaf', (0.82, 0.04, 2.02), G(H['kx'] - 0.41 * math.sin(a), g0 + 0.41 * math.cos(a), F + 1.01), 'M_wood_painted__white', rot=(0, 0, math.pi / 2 - a))
    for zz in (g0, g1): gbox(r, 'frame', H['kx'] - 0.07, zz - 0.04, H['kx'] + 0.07, zz + 0.04, 0, 2.08, SK)
    gbox(r, 'frame', H['kx'] - 0.07, g0, H['kx'] + 0.07, g1, 2.04, 2.1, SK)
    for zz in (L1, L2): gbox(r, 'frame', 32.96, zz - 0.07, 33.04, zz + 0.07, 0, H['h'], SK)
    # a ceiling (the cinematic shots inside show it: layout.js INTERIORS cineClip; in play the cutaway takes it), open over
    # the top of the stairs
    for (ax, az, bx, bz) in ((H['x0'], H['z0'], H['x1'], L1), (31.0, L1, H['x1'], H['z1']), (H['x0'], L2, 31.0, H['z1'])):
        gbox(r, 'ceiling', ax, az, bx, bz, H['h'], H['h'] + 0.03, PL)
    # skirting along the rooms' walls
    for (ax, az, bx, bz) in ((H['x0'], H['z0'] + 0.02, H['x1'], H['z0'] + 0.03), (H['x0'] + 0.01, H['z0'], H['x0'] + 0.02, L1), (H['x1'] - 0.02, H['z0'], H['x1'] - 0.01, H['door'][0]),
                             (H['x1'] - 0.02, H['door'][1], H['x1'] - 0.01, H['z1']), (H['x0'], L1 - 0.06, 33.0, L1 - 0.05), (H['kx'] + 0.05, g1, H['kx'] + 0.06, H['z1'])):
        gbox(r, 'skirting', min(ax, bx), min(az, bz), max(ax, bx) + 0.012, max(az, bz) + 0.012, 0, 0.1, SK)
    # ---- the stairs: 13 treads rising west from the entry to the clipped landing (a second floor is the user's call)
    n, run = 13, (33.0 - H['x0']) / 13
    for i in range(n):
        xa = 33.0 - (i + 1) * run; top = (i + 1) * 0.235
        gbox(r, 'tread', xa, L1 + 0.05, xa + run + 0.02, L2 - 0.05, top - 0.04, top, WOODF)
        gbox(r, 'riser', xa + run - 0.01, L1 + 0.05, xa + run + 0.01, L2 - 0.05, top - 0.235, top - 0.04, SK)
        gbox(r, 'stair_fill', xa, L1 + 0.05, xa + run, L2 - 0.05, 0, top - 0.04, PL)
    rod(r, 'handrail', G(33.0, L1 + 0.1, F + 0.9), G(H['x0'] + 0.3, L1 + 0.1, F + 0.9 + (33.0 - H['x0'] - 0.3) / run * 0.235), 0.025, 'M_wood_dark')
    # ---- the living room: the sofa pushed back (slashed), the TV on the party wall, a rug, the coffee table knocked askew,
    # an armchair on its back, a floor lamp, a plant in the corner, the kids' toys, pictures
    gbox(r, 'rug', 29.9, 34.6, 32.6, 37.0, 0, 0.012, 'M_carpet__maroon', yaw=0.04)
    SOFA = 'M_fabric__teal'
    gbox(r, 'sofa_base', 30.3, H['z0'] + 0.08, 32.5, H['z0'] + 0.95, 0, 0.42, SOFA)
    gbox(r, 'sofa_back', 30.3, H['z0'] + 0.08, 32.5, H['z0'] + 0.32, 0.42, 0.88, SOFA)
    for sx in (30.3, 32.36): gbox(r, 'sofa_arm', sx, H['z0'] + 0.08, sx + 0.14, H['z0'] + 0.95, 0.42, 0.64, SOFA)
    gbox(r, 'cushion', 30.48, H['z0'] + 0.34, 31.4, H['z0'] + 0.92, 0.42, 0.55, SOFA, yaw=0.08)
    gbox(r, 'cushion', 31.5, H['z0'] + 0.5, 32.3, H['z0'] + 1.05, 0.38, 0.5, SOFA, yaw=-0.35)                # (pulled half off)
    for k in range(5): gbox(r, 'stuffing', 30.7 + k * 0.13, H['z0'] + 0.55, 30.78 + k * 0.13, H['z0'] + 0.65, 0.55, 0.58, 'M_flat__white', yaw=rng.uniform(-1, 1))
    gbox(r, 'cushion_floor', 31.6, H['z0'] + 1.3, 32.15, H['z0'] + 1.85, 0, 0.12, SOFA, yaw=0.9)
    gbox(r, 'coffee_table', 30.75, 35.35, 31.85, 35.9, 0.36, 0.42, 'M_wood_dark', yaw=0.32)
    for dx, dz in ((-0.45, -0.2), (0.45, -0.2), (-0.45, 0.2), (0.45, 0.2)):
        c, s = math.cos(0.32), math.sin(0.32); x, z = 31.3 + dx * c + dz * s, 35.62 - dx * s + dz * c
        gbox(r, 'table_leg', x - 0.03, z - 0.03, x + 0.03, z + 0.03, 0, 0.36, 'M_wood_dark')
    gbox(r, 'tv_console', H['x0'] + 0.02, 34.8, H['x0'] + 0.45, 36.4, 0, 0.5, 'M_wood_dark')
    gbox(r, 'tv', H['x0'] + 0.08, 34.95, H['x0'] + 0.14, 36.25, 0.62, 1.3, 'M_flat__black')
    gbox(r, 'tv_screen', H['x0'] + 0.141, 35.0, H['x0'] + 0.15, 36.2, 0.66, 1.26, 'M_screen')
    # the armchair on its back
    AC = 'M_fabric__sage'
    gbox(r, 'chair_seat', 32.3, 36.1, 33.0, 36.85, 0, 0.35, AC, yaw=0.5)
    gbox(r, 'chair_back', 32.25, 36.8, 33.05, 37.45, 0, 0.18, AC, yaw=0.5)
    rod(r, 'lamp_pole', G(32.95, 33.3, F), G(32.95, 33.3, F + 1.55), 0.018, 'M_metal_painted__darkgrey')
    disc(r, 'lamp_base', 0.16, 0.03, G(32.95, 33.3, F + 0.015), 'M_metal_painted__darkgrey', seg=14)
    disc(r, 'lamp_shade', 0.22, 0.28, G(32.95, 33.3, F + 1.6), 'M_fabric__cream', seg=16, r2=0.15)
    disc(r, 'plant_pot', 0.2, 0.32, G(29.45, 33.3, F + 0.16), 'M_flat__terracotta', seg=14, r2=0.16)
    for k in range(7):
        a = k / 7 * math.tau; box(r, 'plant_leaf', (0.08, 0.45, 0.02), G(29.45 + math.cos(a) * 0.12, 33.3 + math.sin(a) * 0.12, F + 0.62), 'M_flat__green', rot=(0.6 * math.sin(a), 0.6 * math.cos(a), a))
    for k, (x, z, c) in enumerate(((30.6, 36.9, 'red'), (30.85, 37.2, 'blue'), (31.2, 36.85, 'yellow'), (30.4, 37.4, 'green'), (31.6, 37.45, 'red'))):
        gbox(r, 'toy', x, z, x + 0.14, z + 0.14, 0, 0.12, 'M_plastic__' + c, yaw=k * 0.7)
    disc(r, 'ball', 0.11, 0.22, G(31.9, 36.9, F + 0.11), 'M_plastic__blue', seg=12)
    gbox(r, 'toy_truck', 30.1, 36.6, 30.45, 36.8, 0, 0.14, 'M_plastic__yellow', yaw=0.4)
    for x0, w, h, c in ((30.6, 0.5, 0.4, 'cream'), (31.3, 0.7, 0.5, 'white'), (32.15, 0.35, 0.45, 'cream')):
        gbox(r, 'picture', x0, H['z0'] + 0.0, x0 + w, H['z0'] + 0.03, 1.35, 1.35 + h, 'M_wood_dark')
        gbox(r, 'picture_in', x0 + 0.04, H['z0'] + 0.03, x0 + w - 0.04, H['z0'] + 0.035, 1.39, 1.31 + h, 'M_flat__' + c)
    # ---- the dining room: the table with two chairs (one knocked back), the half-packed backpack on it, a bookcase in the
    # corner, the sideboard with its drawers out, a pendant lamp
    TX0, TX1, TZ0, TZ1 = 34.6, 35.75, 35.25, 36.0
    gbox(r, 'table_top', TX0, TZ0, TX1, TZ1, 0.72, 0.76, 'M_wood_raw')
    for x in (TX0 + 0.05, TX1 - 0.05):
        for z in (TZ0 + 0.05, TZ1 - 0.05): gbox(r, 'table_leg', x - 0.03, z - 0.03, x + 0.03, z + 0.03, 0, 0.72, 'M_wood_raw')
    for k, (cx, cz, yaw, tip) in enumerate(((34.25, 35.45, 0.1, False), (34.0, 36.3, 0.9, True))):
        if tip:  # (knocked over backwards: lying on the floor)
            gbox(r, 'chair_seat', cx - 0.22, cz - 0.22, cx + 0.22, cz + 0.22, 0.0, 0.05, 'M_wood_dark', yaw=yaw)
            gbox(r, 'chair_back', cx + 0.2, cz - 0.2, cx + 0.62, cz + 0.2, 0.0, 0.04, 'M_wood_dark', yaw=yaw)
        else:
            gbox(r, 'chair_seat', cx - 0.21, cz - 0.21, cx + 0.21, cz + 0.21, 0.44, 0.48, 'M_wood_dark', yaw=yaw)
            gbox(r, 'chair_back', cx - 0.24, cz - 0.21, cx - 0.2, cz + 0.21, 0.48, 0.95, 'M_wood_dark', yaw=yaw)
            for dx in (-0.18, 0.18):
                for dz in (-0.18, 0.18): gbox(r, 'chair_leg', cx + dx - 0.02, cz + dz - 0.02, cx + dx + 0.02, cz + dz + 0.02, 0, 0.44, 'M_wood_dark')
    # the backpack: an open bag on its side, things half in, half out
    gbox(r, 'backpack', 34.95, 35.45, 35.35, 35.72, 0.76, 1.08, 'M_fabric__navy', yaw=0.25)
    gbox(r, 'backpack_flap', 34.9, 35.38, 35.3, 35.48, 1.0, 1.1, 'M_fabric__navy', yaw=0.25)
    gbox(r, 'shirt', 35.25, 35.55, 35.6, 35.9, 0.76, 0.79, 'M_fabric__red', yaw=-0.3)
    disc(r, 'bottle', 0.035, 0.22, G(35.5, 35.35, F + 0.87), 'M_plastic__blue', seg=10)
    gbox(r, 'box_food', 34.7, 35.75, 34.88, 35.92, 0.76, 0.98, 'M_paper', yaw=0.2)
    rod(r, 'pendant_cord', G(35.17, 35.62, F + H['h']), G(35.17, 35.62, F + 1.75), 0.006, 'M_flat__black')
    disc(r, 'pendant', 0.2, 0.18, G(35.17, 35.62, F + 1.68), 'M_metal_painted__darkgrey', seg=14, r2=0.06)
    gbox(r, 'bookcase', 33.45, H['z0'] + 0.02, 34.3, H['z0'] + 0.34, 0, 1.7, 'M_wood_dark')
    for k, zz in enumerate((0.35, 0.75, 1.15)):
        x = 33.5
        while x < 34.22:
            w = rng.uniform(0.03, 0.06); hh = rng.uniform(0.2, 0.3)
            if rng.random() < 0.25: x += 0.08; continue   # (gaps: pulled out, on the floor)
            gbox(r, 'book', x, H['z0'] + 0.36, x + w, H['z0'] + 0.38 + 0.0, zz, zz + hh, rng.choice(['M_flat__red', 'M_flat__blue', 'M_flat__green', 'M_flat__cream']))
            x += w + 0.005
    for k in range(6): gbox(r, 'book_floor', 33.6 + k * 0.17, 33.75 + rng.uniform(0, 0.5), 33.8 + k * 0.17, 33.95 + rng.uniform(0, 0.5), 0, 0.04, rng.choice(['M_flat__red', 'M_flat__blue', 'M_flat__green']), yaw=rng.uniform(0, 3))
    SB = 'M_wood_painted__white'
    gbox(r, 'sideboard', H['x1'] - 0.45, 33.6, H['x1'] - 0.02, 34.9, 0, 0.82, SB)
    for k, out in enumerate((0.35, 0.0, 0.25)):
        gbox(r, 'drawer', H['x1'] - 0.47 - out, 33.68, H['x1'] - 0.45 - out + 0.38, 34.82, 0.6 - k * 0.22, 0.78 - k * 0.22, SB)
    for k in range(4): gbox(r, 'paper', 34.9 + rng.uniform(0, 0.5), 33.8 + rng.uniform(0, 0.9), 35.1 + rng.uniform(0, 0.5), 34.0 + rng.uniform(0, 0.9), 0, 0.005, 'M_paper', yaw=rng.uniform(0, 3))
    # ---- the entry: a mat inside the door, hooks with a jacket on the stairs' end wall, a light switch
    d0, d1 = H['door']
    gbox(r, 'doormat', H['x1'] - 0.75, d0 + 0.05, H['x1'] - 0.05, d1 - 0.05, 0, 0.015, 'M_carpet__brown')
    for k in range(3): gbox(r, 'hook', H['x1'] - 0.05, 37.1 + k * 0.25, H['x1'] - 0.01, 37.13 + k * 0.25, 1.6, 1.65, 'M_metal_painted__darkgrey')
    gbox(r, 'jacket', H['x1'] - 0.14, 37.25, H['x1'] - 0.02, 37.65, 0.95, 1.6, 'M_fabric__green')
    gbox(r, 'switch', H['x1'] - 0.02, d0 - 0.2, H['x1'], d0 - 0.1, 1.15, 1.27, 'M_flat__white')
    gbox(r, 'switch', 33.02, L1 + 0.04, 33.04, L1 + 0.14, 1.15, 1.27, 'M_flat__white')
    # ---- the kitchen: base and wall units on its west wall (the stove in the run), the sink under the front window, the
    # fridge in the far corner (its own model: hood_fridge, its door opens), drawers pulled out, broken plates
    kx = H['kx'] + T / 2
    CAB, TOP = 'M_wood_painted__white', 'M_countertop'
    c0, c1, sz0, sz1 = g1 + 0.3, 44.42, 42.45, 43.05
    for za, zb in ((c0, sz0), (sz1, c1)):
        gbox(r, 'cabinet', kx, za, kx + 0.6, zb, 0, 0.86, CAB)
        gbox(r, 'counter', kx, za, kx + 0.64, zb, 0.86, 0.9, TOP)
        gbox(r, 'wall_unit', kx, za, kx + 0.34, zb, 1.45, 2.15, CAB)
        z = za + 0.02
        while z < zb - 0.3:
            gbox(r, 'cab_door_line', kx + 0.6, z, kx + 0.605, z + 0.005, 0.05, 0.84, 'M_flat__grey'); z += 0.5
    gbox(r, 'drawer_out', kx + 0.5, sz1 + 0.1, kx + 0.95, sz1 + 0.55, 0.7, 0.82, CAB)          # (pulled right out)
    gbox(r, 'backsplash', kx, c0, kx + 0.01, c1, 0.9, 1.45, 'M_tile_wall')
    gbox(r, 'stove', kx, sz0, kx + 0.62, sz1, 0, 0.9, 'M_metal_painted__white')
    gbox(r, 'stove_top', kx, sz0 + 0.02, kx + 0.6, sz1 - 0.02, 0.9, 0.91, 'M_flat__black')
    for dx in (0.17, 0.43):
        for dz in (0.17, 0.43): disc(r, 'burner', 0.08, 0.012, G(kx + dx, sz0 + dz, F + 0.915), 'M_metal_painted__darkgrey', seg=12)
    gbox(r, 'hood_vent', kx, sz0, kx + 0.5, sz1, 1.55, 1.75, 'M_metal_painted__grey')
    SX0, SX1 = 33.75, 35.45
    gbox(r, 'cabinet', SX0, H['z1'] - 0.6, SX1, H['z1'] - 0.02, 0, 0.86, CAB)
    gbox(r, 'counter', SX0, H['z1'] - 0.64, SX1, H['z1'] - 0.02, 0.86, 0.9, TOP)
    gbox(r, 'sink', SX0 + 0.45, H['z1'] - 0.52, SX0 + 1.05, H['z1'] - 0.12, 0.88, 0.91, 'M_metal_painted__grey')
    rod(r, 'tap', G(SX0 + 0.75, H['z1'] - 0.08, F + 0.9), G(SX0 + 0.75, H['z1'] - 0.2, F + 1.18), 0.012, 'M_metal_painted__grey')
    for k in range(7): disc(r, 'plate_shard', rng.uniform(0.04, 0.09), 0.01, G(34.2 + rng.uniform(0, 1.0), 43.4 + rng.uniform(0, 0.8), F + 0.005), 'M_flat__white', seg=6)
    disc(r, 'pot_dropped', 0.13, 0.12, G(34.6, 42.2, F + 0.06), 'M_metal_painted__darkgrey', seg=14, tilt=1.4)
    disc(r, 'bin', 0.16, 0.55, G(H['x1'] - 0.25, 44.9, F + 0.275), 'M_metal_painted__grey', seg=14)
    # ---- the garage: steel shelves on the party wall, boxes, two kids' bikes against the north wall, tools, a lawn chair
    STEEL = 'M_metal_painted__grey'
    for zz in (0.1, 0.65, 1.2, 1.75): gbox(r, 'g_shelf', H['x0'] + 0.03, 40.6, H['x0'] + 0.5, 43.4, zz, zz + 0.025, STEEL)
    for zx in (40.62, 43.38):
        for xx in (H['x0'] + 0.05, H['x0'] + 0.48): rod(r, 'g_post', G(xx, zx, F), G(xx, zx, F + 1.9), 0.015, STEEL)
    for zz in (0.125, 0.675, 1.225):
        z = 40.7
        while z < 43.2:
            w = rng.uniform(0.3, 0.55)
            if rng.random() < 0.8: gbox(r, 'g_box', H['x0'] + 0.06, z, H['x0'] + 0.46, z + w, zz, zz + rng.uniform(0.22, 0.4), 'M_paper', yaw=rng.uniform(-0.05, 0.05))
            z += w + 0.05
    for k, (x, z, w, d, h) in enumerate(((31.5, 43.6, 0.6, 0.5, 0.45), (31.6, 43.62, 0.5, 0.45, 0.35), (32.0, 44.5, 0.55, 0.55, 0.5))):
        gbox(r, 'g_box', x, z, x + w, z + d, 0.45 * (k == 1), 0.45 * (k == 1) + h, 'M_paper', yaw=0.1 * k)
    for k, bx in enumerate((30.0, 31.2)):  # kids' bikes leaning on the north wall
        z = L2 + 0.32
        for wx in (bx, bx + 0.8): disc(r, 'bike_wheel', 0.24, 0.04, G(wx, z, F + 0.25), 'M_rubber', seg=16, tilt=math.pi / 2)
        rod(r, 'bike_frame', G(bx, z, F + 0.25), G(bx + 0.45, z, F + 0.55), 0.02, 'M_metal_painted__red' if k else 'M_metal_painted__blue')
        rod(r, 'bike_frame', G(bx + 0.45, z, F + 0.55), G(bx + 0.8, z, F + 0.25), 0.02, 'M_metal_painted__red' if k else 'M_metal_painted__blue')
        rod(r, 'bike_bar', G(bx + 0.65, z, F + 0.5), G(bx + 0.7, z, F + 0.75), 0.016, 'M_metal_painted__darkgrey')
    gbox(r, 'pegboard', H['kx'] - 0.07, 42.0, H['kx'] - 0.05, 43.6, 1.0, 1.8, 'M_wood_painted__cream')
    for k in range(4): gbox(r, 'g_tool', H['kx'] - 0.1, 42.2 + k * 0.32, H['kx'] - 0.07, 42.25 + k * 0.32, 1.15, 1.55, STEEL)
    gbox(r, 'oil_stain', 30.4, 42.5, 31.6, 43.6, 0.0, 0.004, 'M_flat__black', yaw=0.3)
    gbox(r, 'lawn_chair', 31.9, 41.0, 32.5, 41.15, 0.0, 0.9, 'M_plastic__white', yaw=0.2)
    return r

def fridge():
    """The kitchen's fridge (HOME's far corner), its back to the front wall's corner, facing east (local +X = the game's +X):
    the door ('FridgeDoor', hinged at its south edge) carries the family photo and the kids' drawings; inside, shelves and
    the case's spot (the level shows the case itself)."""
    r = root('hood_fridge')
    W, D, H = 0.76, 0.72, 1.78   # (along z, along x, up)
    B = 'M_metal_painted__white'
    # the body: back, sides, top, bottom, open at +x
    box(r, 'back', (0.04, W, H), (-D / 2 + 0.02, 0, H / 2), B)
    for s in (-1, 1): box(r, 'side', (D, 0.04, H), (0, s * (W / 2 - 0.02), H / 2), B)
    box(r, 'top', (D, W, 0.05), (0, 0, H - 0.025), B); box(r, 'bottom', (D, W, 0.08), (0, 0, 0.04), B)
    box(r, 'inside', (0.02, W - 0.1, H - 0.2), (-D / 2 + 0.045, 0, H / 2), 'M_flat__white')
    for zz in (0.45, 0.85, 1.25): box(r, 'shelf', (D - 0.1, W - 0.1, 0.015), (-0.02, 0, zz), 'M_glass')
    box(r, 'milk', (0.09, 0.09, 0.22), (0.05, 0.22, 0.97), 'M_plastic__white'); box(r, 'jar', (0.1, 0.1, 0.12), (-0.1, -0.22, 0.52), 'M_flat__red')
    # the door: hinged at -Y (its south edge in the game), on its own node (the game swings it)
    d = bpy.data.objects.new('FridgeDoor', None); propkit.SC.collection.objects.link(d); d.parent = r; d.location = (D / 2, -W / 2, 0)
    box(d, 'door', (0.06, W, H - 0.02), (0.03, W / 2, H / 2), B)
    box(d, 'gasket', (0.01, W - 0.06, H - 0.08), (-0.004, W / 2, H / 2), 'M_rubber')
    box(d, 'handle', (0.03, 0.03, 0.5), (0.08, W - 0.07, 1.15), 'M_metal_painted__grey')
    for k, (y, z, w, h, c) in enumerate(((0.2, 1.4, 0.2, 0.15, 'cream'), (0.48, 1.38, 0.16, 0.2, 'white'), (0.25, 1.1, 0.22, 0.17, 'yellow'), (0.52, 1.05, 0.18, 0.22, 'white'), (0.35, 0.8, 0.2, 0.15, 'blue'))):
        box(d, 'photo' if k == 0 else 'drawing', (0.004, w, h), (0.062, y, z), 'M_flat__' + c)
    for k in range(3): box(d, 'scribble', (0.003, 0.12, 0.02), (0.065, 0.48 + 0.01 * k, 1.35 + 0.04 * k), 'M_flat__red' if k % 2 else 'M_flat__blue')
    return r

def case():
    """The metal briefcase of four vials (the story's case): a brushed aluminium case, the lid hinged at the back
    ('CaseLid'), four vials in foam inside; origin at its base centre, the handle toward -Y."""
    r = root('hood_case')
    A = 'M_metal_painted__silver'
    box(r, 'shell', (0.46, 0.32, 0.09), (0, 0, 0.045), A)
    box(r, 'foam', (0.42, 0.28, 0.02), (0, 0, 0.085), 'M_flat__darkgrey')
    for k in range(4):
        rod(r, 'vial', (-0.12 + k * 0.08, -0.05, 0.095), (-0.12 + k * 0.08, 0.07, 0.095), 0.012, 'M_glass')
        rod(r, 'vial_cap', (-0.12 + k * 0.08, 0.07, 0.095), (-0.12 + k * 0.08, 0.09, 0.095), 0.013, 'M_flat__blue')
    lid = bpy.data.objects.new('CaseLid', None); propkit.SC.collection.objects.link(lid); lid.parent = r; lid.location = (0, 0.16, 0.09)
    box(lid, 'lid', (0.46, 0.32, 0.06), (0, -0.16, 0.03), A)
    box(r, 'handle', (0.14, 0.03, 0.03), (0, -0.175, 0.07), 'M_flat__black')
    for sx in (-0.15, 0.15): box(r, 'latch', (0.04, 0.012, 0.03), (sx, -0.162, 0.085), 'M_metal_painted__grey')
    return r

# ---------------------------------------------------------------- the neighbour's garage (B06-L, "the garage with the light on")
# The damaged row's end unit stands open: one bare room (7.4 x 12.75 m) with the street at its front. In the unit's own frame
# (layout.js INTERIORS 'B06#4': centre 0.76, -6.227, turned 0.6575; local +z the open front): a freestanding workbench under
# the hanging light near the front (the bolt cutters on it: the level's pickup), steel shelves and boxes down the left wall,
# a red tool chest, a ladder and the bins on the right, kids' bikes against the back wall, a mower and a cooler; the middle
# kept clear (a fight in here). The prop's origin is the unit's centre; U(lx, lz) puts a unit-local point in it.
GARAGE = dict(c=(0.76, -6.227), yaw=0.6575, hx=3.55, hz=6.2, bench=(0.0, 3.35), light=(-0.13, 4.49))
def _row6_moved():
    """(the map clean-up turned and shifted row 6, ch2_map.py: the unit's centre and turn follow it, from chapter2_extras.json)"""
    import json
    M = next(m for m in json.load(open(os.path.join(HERE, 'src', 'chapter2_extras.json')))['moved_existing'] if m['row'] == 6)
    o, n = M['old'], M['new']; dx, dz = GARAGE['c'][0] - o['x'], GARAGE['c'][1] - o['z']
    lx, lz = dx * math.cos(o['yaw']) - dz * math.sin(o['yaw']), dx * math.sin(o['yaw']) + dz * math.cos(o['yaw'])
    GARAGE['c'] = (n['x'] + lx * math.cos(n['yaw']) + lz * math.sin(n['yaw']), n['z'] - lx * math.sin(n['yaw']) + lz * math.cos(n['yaw']))
    GARAGE['yaw'] += n['yaw'] - o['yaw']
_row6_moved()
def U(lx, lz, y=0.0): return (lx, -lz, y)

def garage():
    rng = random.Random(6)
    r = root('hood_garage')
    WOOD, DARK, STEEL = 'M_wood_raw', 'M_wood_dark', 'M_metal_painted__grey'
    bx, bz = GARAGE['bench']
    # the workbench (2.2 x 0.8 m), the vice, a coffee can, rags, a radio; the light hanging over it on its cord
    box(r, 'bench_top', (2.2, 0.8, 0.07), U(bx, bz, 0.9), WOOD)
    for sx in (-1.0, 1.0):
        for sz in (-0.32, 0.32): box(r, 'bench_leg', (0.08, 0.08, 0.87), U(bx + sx, bz + sz, 0.435), DARK)
    box(r, 'bench_shelf', (2.05, 0.7, 0.03), U(bx, bz, 0.25), WOOD)
    for k in range(4): box(r, 'can_stack', (0.3, 0.25, 0.2), U(bx - 0.6 + k * 0.38, bz, 0.37), rng.choice(['M_paper', 'M_metal_painted__blue', 'M_plastic__red']))
    box(r, 'vice', (0.18, 0.2, 0.13), U(bx + 0.85, bz - 0.25, 1.0), 'M_metal_painted__blue')
    disc(r, 'coffee_can', 0.08, 0.16, U(bx - 0.8, bz + 0.2, 1.01), 'M_metal_rusty', seg=12)
    box(r, 'rag', (0.3, 0.25, 0.015), U(bx + 0.3, bz + 0.15, 0.945), 'M_fabric__red', rot=(0, 0, 0.5))
    box(r, 'radio', (0.3, 0.12, 0.18), U(bx - 0.35, bz - 0.25, 1.03), 'M_plastic__black')
    lx, lz = GARAGE['light']
    rod(r, 'light_cord', U(lx, lz, 2.6), U(lx, lz, 2.05), 0.006, 'M_flat__black')
    disc(r, 'light_shade', 0.22, 0.16, U(lx, lz, 1.97), 'M_metal_painted__green', seg=16, r2=0.05)
    disc(r, 'light_bulb', 0.06, 0.08, U(lx, lz, 1.9), 'M_emissive__amber', seg=10)
    # the left wall: steel shelves (two bays) with boxes, paint, jugs; boxes stacked on the floor beyond them
    sx = -GARAGE['hx'] + 0.25
    for z0 in (-2.4, -0.6):
        for zz in (0.1, 0.65, 1.2, 1.75): box(r, 'shelf', (0.45, 1.7, 0.025), U(sx, z0 + 0.85, zz), STEEL)
        for pz in (z0 + 0.02, z0 + 1.68):
            for px in (sx - 0.21, sx + 0.21): rod(r, 'shelf_post', U(px, pz, 0), U(px, pz, 1.9), 0.015, STEEL)
        for zz in (0.125, 0.675, 1.225):
            z = z0 + 0.1
            while z < z0 + 1.55:
                w = rng.uniform(0.25, 0.45)
                if rng.random() < 0.75: box(r, 'box', (0.4, w, rng.uniform(0.2, 0.38)), U(sx, z + w / 2, zz + 0.15), rng.choice(['M_paper', 'M_paper', 'M_plastic__blue']))
                z += w + 0.06
    for k, (x, z, w, h) in enumerate(((-2.9, -4.6, 0.6, 0.5), (-2.85, -4.0, 0.5, 0.42), (-2.9, -4.55, 0.5, 0.4), (-2.2, -5.3, 0.7, 0.55))):
        box(r, 'box_floor', (w, w * 0.8, h), U(x, z, h / 2 + (0.5 if k == 2 else 0)), 'M_paper', rot=(0, 0, 0.2 * k))
    # the right wall: the red tool chest, the ladder hung on the wall, the bins, a folded lawn chair
    rx = GARAGE['hx'] - 0.3
    box(r, 'tool_chest', (0.5, 0.95, 1.0), U(rx, 0.4, 0.5), 'M_metal_painted__red')
    for k in range(5): box(r, 'chest_drawer', (0.02, 0.85, 0.012), U(rx - 0.26, 0.4, 0.2 + k * 0.17), 'M_metal_painted__grey')
    for dz in (-0.3, 0.3): rod(r, 'ladder_side', U(GARAGE['hx'] - 0.07, -2.6 + dz, 0.4), U(GARAGE['hx'] - 0.07, -2.6 + dz, 2.3), 0.025, 'M_metal_painted__grey')
    for k in range(6): rod(r, 'ladder_rung', U(GARAGE['hx'] - 0.07, -2.9, 0.55 + k * 0.32), U(GARAGE['hx'] - 0.07, -2.3, 0.55 + k * 0.32), 0.015, 'M_metal_painted__grey')
    for k in range(2): disc(r, 'bin', 0.3, 1.0, U(rx - 0.05, -4.3 - k * 0.7, 0.5), 'M_plastic__green' if k else 'M_plastic__grey', seg=14, r2=0.27)
    box(r, 'lawn_chair', (0.08, 0.6, 0.95), U(rx + 0.1, 2.2, 0.48), 'M_plastic__white', rot=(0, 0.15, 0))
    # the back wall: two kids' bikes leaning on it, a soccer ball, a sled of a skateboard
    for k, x in enumerate((-0.6, 0.6)):
        z = -GARAGE['hz'] + 0.3
        for wx in (x - 0.4, x + 0.4): disc(r, 'bike_wheel', 0.25, 0.04, U(wx, z, 0.26), 'M_rubber', seg=16, tilt=math.pi / 2)
        rod(r, 'bike_frame', U(x - 0.4, z, 0.26), U(x, z, 0.56), 0.02, 'M_metal_painted__red' if k else 'M_metal_painted__blue')
        rod(r, 'bike_frame', U(x, z, 0.56), U(x + 0.4, z, 0.26), 0.02, 'M_metal_painted__red' if k else 'M_metal_painted__blue')
        rod(r, 'bike_bar', U(x + 0.25, z, 0.5), U(x + 0.3, z, 0.78), 0.016, 'M_metal_painted__darkgrey')
    disc(r, 'ball', 0.11, 0.22, U(1.6, -5.5, 0.11), 'M_flat__white', seg=12)
    box(r, 'skateboard', (0.2, 0.75, 0.04), U(2.2, -5.3, 0.06), 'M_wood_painted__blue', rot=(0, 0, 0.6))
    # the mower near the front left, the cooler by the tool chest
    mx, mz = -2.6, 4.0
    disc(r, 'mower_deck', 0.29, 0.14, U(mx, mz, 0.16), 'M_metal_painted__green', seg=16)
    box(r, 'mower_motor', (0.24, 0.24, 0.2), U(mx, mz, 0.33), 'M_metal_painted__darkgrey')
    for dx in (-0.25, 0.25):
        for dz in (-0.22, 0.22): disc(r, 'mower_wheel', 0.08, 0.05, U(mx + dx, mz + dz, 0.08), 'M_rubber', seg=12, tilt=math.pi / 2, axis='Y')
    for dx in (-0.2, 0.2): rod(r, 'mower_handle', U(mx + dx, mz - 0.25, 0.25), U(mx + dx * 1.1, mz - 0.85, 1.0), 0.013, 'M_metal_painted__darkgrey')
    box(r, 'cooler', (0.6, 0.4, 0.42), U(rx - 0.05, 1.45, 0.21), 'M_plastic__blue')
    box(r, 'cooler_lid', (0.62, 0.42, 0.05), U(rx - 0.05, 1.45, 0.445), 'M_plastic__white')
    return r

BUILD = {'shed': (shed, 'hood_shed.glb'), 'garage': (garage, 'hood_garage.glb'), 'home': (home, 'hood_home.glb'), 'fridge': (fridge, 'hood_fridge.glb'), 'case': (case, 'hood_case.glb')}

if __name__ == '__main__':
    names = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(BUILD)
    if bpy.app.background: bpy.ops.wm.read_factory_settings(use_empty=True)
    use_scene('Ch2Props')
    os.makedirs(OUT, exist_ok=True)
    x = 0.0
    for n in names:
        fn, file = BUILD[n]
        r = fn()
        print('exported', file, export(r, os.path.join(OUT, file)), 'faces')
        r.location.x = x; x += 7.0   # (laid out side by side in the scene for review)
