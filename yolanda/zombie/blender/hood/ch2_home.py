# Chapter 2 rebuild: inside Marc's house (HANDOFF_PC_START.md A2; house_plan.png from the user's sketch, fitted to the real
# shell: the east end unit of the row at game x 6.68, z 45.54; make_ch2_props.py HOME has the measures).
#   - the furnished ground floor (hood_home.glb) and the fridge (hood_fridge.glb, its door swings in the game)
#   - the row's one collision box stops at the end unit's party wall; the unit gets walls of its own: the outer four (the
#     front door's gap shut by 'seal:home_door' until Marc opens it), the inside walls, the furniture
#   - Marc's row is tagged 'seal:home_door': the game draws it on its own so that its front door can swing (view.js)
#   - marks: the porch, the door, inside, James at the dining table, the fridge
# Runs on hood.blend after dress_hood.py (the user's open Blender, or blender -b ... --python <this>), then export_layout.py.
import bpy, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import importlib, hoodlib, ch2lib, make_ch2_props
for m in (hoodlib, ch2lib, make_ch2_props): importlib.reload(m)
from hoodlib import col_box
from ch2lib import *
from make_ch2_props import HOME, HOME_C

ID = 'ch2_home'
print('wiped', wipe(ID))
F = HOME['floor']
def cbox(n, x0, z0, x1, z1, h, tag='prop:home', yaw=0.0):
    o = col_box('COL_ch2_home_' + n, (x0 + x1) / 2, (z0 + z1) / 2, abs(x1 - x0) / 2, abs(z1 - z0) / 2, yaw, h, tag); o['ch2'] = ID; return o

# ---------------------------------------------------------------- 1. the row's box stops at the party wall
row = bpy.data.objects['kit_row4_intact_v2']                   # (Marc's row: game x 6.68, z 45.54)
b = bpy.data.objects.get('COL_bld_B01_183')
if b and b.scale.x > 25:                                       # (the first run only: x 6.68 .. 36.28 -> 6.68 .. 28.95)
    x0 = b.location.x - b.scale.x / 2; b.scale.x = 28.95 - x0; b.location.x = x0 + b.scale.x / 2
row['tag'] = 'seal:home_door'

# ---------------------------------------------------------------- 2. the end unit's walls
X0, X1, Z0, Z1 = HOME['x0'], HOME['x1'], HOME['z0'], HOME['z1']
d0, d1 = HOME['door']
cbox('party', 28.95, 32.79, X0, 45.74, 6.0, 'bld:home')
cbox('rear', 28.95, 32.79, 36.28, Z0, 6.0, 'bld:home')
cbox('front', 28.95, Z1, 36.28, 45.74, 6.0, 'bld:home')
cbox('east_n', X1, 32.79, 36.28, d0, 6.0, 'bld:home'); cbox('east_s', X1, d1, 36.28, 45.74, 6.0, 'bld:home')
cbox('door', X1 - 0.05, d0, 36.33, d1, 2.4, 'seal:home_door')
L1, L2, K = HOME['band']; kx = HOME['kx']; g0, g1 = HOME['gdoor']
cbox('w_living', X0, L1 - 0.06, 33.05, L1 + 0.06, 2.6)
cbox('stairs', X0, L1, 33.0, L2, 2.6)
cbox('w_garage_n', X0, L2 - 0.06, kx + 0.06, L2 + 0.06, 2.6)
cbox('w_garage_e1', kx - 0.06, L2, kx + 0.06, g0, 2.6); cbox('w_garage_e2', kx - 0.06, g1, kx + 0.06, Z1, 2.6)
# the furniture (heights under 1.25 m let shots over, as everywhere)
for n, (x0, z0, x1, z1, h) in {
        'sofa': (30.3, Z0, 32.5, Z0 + 0.95, 0.9), 'tv': (X0, 34.8, X0 + 0.45, 36.4, 1.3), 'coffee': (30.7, 35.3, 31.9, 35.95, 0.42),
        'armchair': (32.25, 36.1, 33.05, 37.45, 0.4), 'dining': (34.0, 35.2, 35.8, 36.55, 0.76), 'bookcase': (33.45, Z0, 34.3, Z0 + 0.36, 1.7),
        'sideboard': (35.1, 33.6, X1, 34.9, 0.82), 'counters': (kx + 0.05, g1 + 0.3, kx + 0.7, 44.42, 0.9), 'sink': (33.75, Z1 - 0.65, 35.45, Z1, 0.9),
        'fridge': (kx + 0.05, 44.45, kx + 0.8, Z1, 1.8), 'g_shelves': (X0, 40.6, X0 + 0.55, 43.4, 1.9), 'g_boxes': (31.5, 43.6, 32.6, 45.1, 0.95),
        'bin': (X1 - 0.42, 44.7, X1, Z1, 0.55), 'lamp': (32.8, 33.15, 33.1, 33.45, 1.8), 'plant': (X0, Z0, 29.7, 33.55, 0.9)}.items():
    cbox(n, x0, z0, x1, z1, h)

# ---------------------------------------------------------------- 3. the furnished floor and the fridge
place('props/hood_home.glb', HOME_C[0], HOME_C[1], 0.0, collide=False, name='ch2_home_inside', owner=ID, y=0.0)
place('props/hood_fridge.glb', kx + 0.05 + 0.36, 44.45 + 0.38, 0.0, tag='seal:fridge', collide=False, name='ch2_fridge', owner=ID, y=F)   # (drawn on its own: its door swings)

# ---------------------------------------------------------------- 4. marks
mark('home_porch', 37.5, 38.5, -math.pi / 2, owner=ID)        # (outside the door, facing it)
mark('start_home', 37.5, 38.5, -math.pi / 2)                    # (the chapter starts there: the old start stood by the planters)
mark('home_door_use', 36.75, 38.5, -math.pi / 2, owner=ID)
mark('home_inside', 35.3, 38.5, -math.pi / 2, owner=ID)
mark('james', 35.15, 36.62, math.pi, owner=ID)                 # (at the dining table, his back to the door)
mark('fridge_use', 33.95, 44.83, -math.pi / 2, owner=ID)       # (in front of the fridge, facing it)
mark('fridge_case', kx + 0.38, 44.83, -math.pi / 2, y=F + 0.88, owner=ID)
print('home rebuilt: colliders', len(bpy.data.collections['COL'].objects))
