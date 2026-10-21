# Chapter 2 rebuild: the neighbour's garage with the light on (HANDOFF_PC_START.md A3; house_plan.png, right): the bolt
# cutters on a workbench under the hanging light, the garage furnished round its walls (make_ch2_props.py GARAGE), its
# middle clear for the fight in there; each piece that stands collides.
# Runs on hood.blend after dress_hood.py (the user's open Blender, or blender -b ... --python <this>), then export_layout.py.
import bpy, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import importlib, hoodlib, ch2lib, make_ch2_props
for m in (hoodlib, ch2lib, make_ch2_props): importlib.reload(m)
from hoodlib import col_box
from ch2lib import *
from make_ch2_props import GARAGE

ID = 'ch2_garage'
print('wiped', wipe(ID))
(cx, cz), th = GARAGE['c'], GARAGE['yaw']
c, s = math.cos(th), math.sin(th)
def W(lx, lz): return cx + lx * c + lz * s, cz - lx * s + lz * c   # the unit's frame -> the game's (HoodWorld.world)
def gbox(n, lx, lz, hx, hz, h):
    x, z = W(lx, lz); o = col_box('COL_ch2_garage_' + n, x, z, hx, hz, th, h, 'prop:hood_garage'); o['ch2'] = ID

place('props/hood_garage.glb', cx, cz, th, collide=False, name='ch2_garage', owner=ID)
bx, bz = GARAGE['bench']
hx = GARAGE['hx']
for n, (lx, lz, ax, az, h) in {'bench': (bx, bz, 1.1, 0.4, 0.95), 'shelves': (-hx + 0.25, -0.65, 0.25, 1.75, 1.9), 'boxes': (-2.6, -4.8, 0.6, 0.75, 1.0),
                               'chest': (hx - 0.3, 0.4, 0.28, 0.5, 1.0), 'bins': (hx - 0.35, -4.65, 0.32, 0.7, 1.0), 'cooler': (hx - 0.35, 1.45, 0.32, 0.22, 0.45),
                               'mower': (-2.6, 4.3, 0.35, 0.65, 0.9), 'bikes': (0.0, -GARAGE['hz'] + 0.3, 1.1, 0.12, 0.8)}.items():
    gbox(n, lx, lz, ax, az, h)
# the cutters lie on the bench (the level's pickup at this height); the light's mark over it
x, z = W(bx + 0.1, bz + 0.05); mark('cutters', x, z, th, y=0.95, owner=ID)
x, z = W(*GARAGE['light']); mark('garage_light', x, z, owner=ID)
print('garage furnished')
