# Chapter 2 rebuild: the dock (the user's painted map, 2026-10-20, on a top view of this scene: yellow "you can remove
# those trees up to this point, because this is where the dock needs to be"; black "a road from the parking lot to the
# dock"; red the shed; blue "a fence ... that you just can't pass", trees beyond it).
#   - the old dock pocket opens up: its two boundary lines and the trees from the lake to the lot fence go, up to the new
#     fence along the tree line (from the lake's north shore round to the lot's north-west corner)
#   - the service road from the parking lot's west edge to the dock, through a gap in the lot's west fence
#   - the groundskeeper's shed (make_ch2_props.py) up the bank, its door toward the dock; walls and fittings collide
#   - marks for the level: the shed and what is in it, the road's ends
# Runs on hood.blend after dress_hood.py (the user's open Blender, or blender -b blender/hood/hood.blend --python <this>),
# then export_layout.py. A rerun takes away what it added before (ch2lib.wipe); what it removes stays removed.
import bpy, os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import importlib, hoodlib, ch2lib, make_ch2_props
for m in (hoodlib, ch2lib, make_ch2_props): importlib.reload(m)
from hoodlib import col_box
from ch2lib import *
from make_ch2_props import SHED, SHED_SPOTS

ID = 'ch2_dock'
rng = random.Random(20261021)
print('wiped', wipe(ID))

# the cleared ground: the lake's east shore, its north shore, the new fence, the lot's west fence, the club's back fence
FENCE_LINE = [(-58.0, -99.3), (-58.0, -103.5), (-40.0, -110.5), (-19.0, -122.0), (-5.0, -124.0), (8.0, -123.5), (20.0, -110.0), (29.0, -90.9)]   # (ends inside the lot's north fence: no gap at the corner)
CLEAR = [(-26.5, -67.0), (-27.6, -100.0), (-58.0, -100.0)] + FENCE_LINE[1:] + [(27.3, -69.0), (26.3, -68.0)]
TREES = ('nbt_', 'palm_', 'shrub_', 'yard_pocket', 'yard_frond')

# ---------------------------------------------------------------- 1. the trees out (and from under the new fence)
def tree_spot(x, z): return in_poly(CLEAR, x, z) or near_line(x, z, FENCE_LINE, 1.6)
n = remove(lambda e: os.path.basename(e['src']).startswith(TREES) and tree_spot(e.location.x, gz(e)))
for o in list(bpy.data.collections['COL'].objects):
    if (o.get('tag') or '').startswith('tree') and tree_spot(o.location.x, gz(o)): bpy.data.objects.remove(o, do_unlink=True); n += 1
print('trees out', n)

# ---------------------------------------------------------------- 2. the old dock pocket's north and east lines go
POCKET = [[(-26.8, -86.5), (-14.2, -86.5)], [(-14.2, -86.8), (-12.6, -66.6)]]
BOUNDARY_KIT = ('palisade_2m', 'fence_privacy', 'barbed_wire', 'tire_stack', 'pallet_stack')
n = 0
for o in list(bpy.data.collections['COL'].objects):
    if o.get('tag') == 'boundary' and any(near_line(o.location.x, gz(o), L, 1.5) for L in POCKET): bpy.data.objects.remove(o, do_unlink=True); n += 1
n2 = remove(lambda e: os.path.basename(e['src']).startswith(BOUNDARY_KIT) and any(near_line(e.location.x, gz(e), L, 1.4) for L in POCKET))
print('dock pocket lines out', n, 'colliders,', n2, 'pieces')

# ---------------------------------------------------------------- 3. the road's gap in the lot's west fence (x 27.3)
GAP = (-84.6, -77.4)   # (game z: the road's width and a little)
LOT_W = [(27.6, -69.1), (27.0, -91.3)]
for o in list(bpy.data.collections['COL'].objects):
    if o.get('tag') == 'boundary' and near_line(o.location.x, gz(o), LOT_W, 1.2) and abs(o.scale.x) > 15: bpy.data.objects.remove(o, do_unlink=True)
def lot_x(z): return LOT_W[0][0] + (LOT_W[1][0] - LOT_W[0][0]) * (z - LOT_W[0][1]) / (LOT_W[1][1] - LOT_W[0][1])
for z0, z1 in ((LOT_W[0][1], GAP[1]), (GAP[0], LOT_W[1][1])):
    za, zb = max(z0, z1), min(z0, z1); xa, xb = lot_x(za), lot_x(zb)
    o = col_box('COL_boundary_lotw', (xa + xb) / 2, (za + zb) / 2, 0.45, abs(za - zb) / 2, math.atan2(-(xb - xa), za - zb), 2.5, 'boundary'); o['ch2'] = ID
print('lot fence gap: pieces out', remove(lambda e: os.path.basename(e['src']).startswith(BOUNDARY_KIT) and near_line(e.location.x, gz(e), LOT_W, 1.4) and GAP[0] - 0.6 < gz(e) < GAP[1] + 0.6))

# the groundskeeper's chained gate across the road in that gap: shut until the story reaches the dock (Marc cuts it)
seal_line('dock_road_gate', [(lot_x(GAP[1]) + 0.05, GAP[1] - 0.15), (lot_x(GAP[0]) + 0.05, GAP[0] + 0.15)], CHAIN, rng, tag='seal:dockroad', owner=ID)

# ---------------------------------------------------------------- 4. the new fence along the tree line, the lake's north shore
seal_line('ch2_fence', FENCE_LINE, FENCE, rng, tag='boundary', h=2.5, owner=ID)
o = col_box('COL_boundary_ch2_corner', 27.95, -91.15, 0.85, 0.6, 0.0, 2.5, 'boundary'); o['ch2'] = ID   # (the lot's north-west corner: its two fences met short)
o = col_box('COL_water_ch2_north', -43.0, -100.6, 16.2, 0.7, 0.0, 1.0, 'water'); o['ch2'] = ID   # (the lake's north edge had none)

# ---------------------------------------------------------------- 5. the service road: the lot's west edge to the dock
asphalt = bpy.data.objects['roads'].data.materials[0]
ROAD = [(-23.5, -75.6), (-14.5, -75.6), (-11.8, -78.2), (34.6, -78.2), (34.6, -83.8), (-11.8, -83.8), (-14.5, -86.4), (-23.5, -86.4)]
ground_mesh('ch2_dock_road', ROAD[::-1], 0.027, asphalt, ID)

# ---------------------------------------------------------------- 6. the shed, its door to the south (toward the camera and the dock)
SX, SZ = -8.6, -110.0
place('props/hood_shed.glb', SX, SZ, 0.0, tag='seal:shed', collide=False, name='ch2_shed', owner=ID)   # (drawn on its own: its doors swing)
W, D, T = SHED['w'], SHED['d'], SHED['t']
def L(lx, ly): return SX + lx, SZ - ly   # shed local (x, y) -> game (x, z); local -y is the game's +z
def wallbox(n, lx0, ly0, lx1, ly1):
    (ax, az), (bx, bz) = L(lx0, ly0), L(lx1, ly1)
    o = col_box('COL_prop_ch2_shed_' + n, (ax + bx) / 2, (az + bz) / 2, abs(bx - ax) / 2 + 0.05, abs(bz - az) / 2 + 0.05, 0.0, 2.3, 'prop:hood_shed'); o['ch2'] = ID
x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
wallbox('back', x0, y1 - T, x1, y1); wallbox('left', x0, y0, x0 + T, y1); wallbox('right', x1 - T, y0, x1, y1)
da, dw = SHED['door_at'], SHED['door_w']
wallbox('front_a', x0, y0, x0 + da, y0 + T); wallbox('front_b', x0 + da + dw, y0, x1, y0 + T)
for k, (cx, cy, hx, hy) in enumerate(SHED['inside']): wallbox('in%d' % k, cx - hx, cy - hy, cx + hx, cy + hy)
# the shut doors: the doorway's seal, open once Pete's key turns ('seal:shed')
ax, az = L(x0 + da, y0 + T / 2); bx, bz = L(x0 + da + dw, y0 + T / 2)
o = col_box('COL_seal_shed', (ax + bx) / 2, az, dw / 2, 0.08, 0.0, 2.0, 'seal:shed'); o['ch2'] = ID
# the chainsaw on the bench (seen, not taken; the user's word on it is awaited)
cx, cy, ch = SHED_SPOTS['chainsaw']
place('props/chainsaw.glb', *L(cx, cy), yaw=0.35, collide=False, name='ch2_chainsaw', owner=ID, y=ch)

# ---------------------------------------------------------------- 7. marks
dcx = x0 + da + dw / 2
for n, (lx, ly, h) in SHED_SPOTS.items(): mark('shed_' + n, *L(lx, ly), y=h, owner=ID)
mark('shed', SX, SZ, owner=ID)
mark('shed_door', *L(dcx, y0 - 0.9), yaw=0.0, owner=ID)          # just outside the doorway
mark('shed_inside', *L(dcx, 0.0), owner=ID)                       # where Marc stands to look round
mark('dock_road_lot', 31.0, -81.0, owner=ID); mark('dock_road_dock', -17.0, -81.0, owner=ID)
mark('dockroad_use', 29.2, -81.0, owner=ID)                      # (the lot side of its chained gate)
print('dock rebuilt: placed', len(placed().objects), 'colliders', len(bpy.data.collections['COL'].objects))
