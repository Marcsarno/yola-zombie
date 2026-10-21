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

# ---------------------------------------------------------------- 3. the lot's west fence (x 27.3) goes
# (it had a gap for the road; Marc's notes, 2026-10-21, "all this junk too": the whole fence, its palisades, tyres and pallets)
LOT_W = [(27.6, -69.1), (27.0, -91.3)]
for o in list(bpy.data.collections['COL'].objects):
    if o.get('tag') == 'boundary' and near_line(o.location.x, gz(o), LOT_W, 1.2): bpy.data.objects.remove(o, do_unlink=True)
print('lot west fence: pieces out', remove(lambda e: os.path.basename(e['src']).startswith(BOUNDARY_KIT) and near_line(e.location.x, gz(e), LOT_W, 1.6)))

# (the groundskeeper's chained gate that stood across the road in that gap went with Marc's notes, 2026-10-21: "should be
# able to freely walk", design/CH2_MARC_NOTES_2026-10-21.md 9)

# ---------------------------------------------------------------- 4. (the tree-line fence and the lake's north edge)
# (the fence is ch2_notes.py's concrete wall now, from the lake's rounded north shore; that shore and its water collision
# are ch2_notes.py's too: Marc's notes, 2026-10-21, "round out the lake")

# ---------------------------------------------------------------- 5. the service road: the lot's west edge to the dock
asphalt = bpy.data.objects['roads'].data.materials[0]
ROAD = [(-23.5, -75.6), (-14.5, -75.6), (-11.8, -78.2), (34.6, -78.2), (34.6, -83.8), (-11.8, -83.8), (-14.5, -86.4), (-23.5, -86.4)]
ground_mesh('ch2_dock_road', ROAD[::-1], 0.027, asphalt, ID)

# ---------------------------------------------------------------- 6. the shed, its door to the south (toward the camera and the dock)
# (Marc's notes 9: "add 2 dumpsters and then the shed. I think thats more realistic": a service yard against the new wall,
# east of the field's middle by the road; the two dumpsters on its west, below)
SX, SZ = 10.5, -102.4
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
# the two dumpsters west of the shed, backs to the wall, lids to the road
for k, dx in enumerate((-6.9, -4.6)):
    x = SX + dx; zw = -103.5 + (x + 58.0) * (-3.5 / 164.0)
    place('kit/dumpster.glb', x, zw + 0.25 + size_of('kit/dumpster.glb')[1] / 2 + 0.1, 0.0, name='ch2_yard_dumpster', owner=ID)
print('dock rebuilt: placed', len(placed().objects), 'colliders', len(bpy.data.collections['COL'].objects))
