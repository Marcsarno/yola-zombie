# Chapter 4, Grammy's peninsula (design/HANDOFF_GRANDMA_PENINSULA.md part 2, Marc's photos in design/grandma_map/ref/): the
# villa kit. One story, long and low: grey-white stucco with white trim, a low terracotta barrel-tile hip roof, white sectional
# garage doors under an arched trim line, tall arched windows with white plantation shutters, deep entry alcoves (open to the
# sky for their first 3 m, then a small covered part under a grey-siding gable, the front door at the back), the electric
# meters between the two middle garages.
#   blender blender/grammy/grammy.blend --python blender/grammy/make_villa.py      (or run in the open Blender)
# Builds in the 'Villas' scene and exports assets/grammy/props/:
#   grammy_villa4.glb   four garages, two entries (Grandma's: 39.7 x 21.6 m)
#   grammy_villa6.glb   six garages, four entries (the six-unit rows, ~58 m: "a guess: same look, more garages")
#   grammy_house.glb    the small hip-roof houses (one garage)
# Each is built at its nominal size; the map (build_grammy.py) scales it to the real footprint. Origin at the base centre,
# the front toward -Y (the game's +Z), the kit's placeholder materials (M_<key>__<paint>: the game swaps in its textures).
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'hood'), HERE]
import propkit as K
from propkit import box, wall, prism, root, finish
import hoodlib, importlib; importlib.reload(hoodlib)   # (Blender keeps modules between runs)
K.M = hoodlib.kit_material          # (the real textured materials in the window; the names stay M_<key>__<paint>)
ROOT = os.path.dirname(os.path.dirname(HERE)); OUT = os.path.join(ROOT, 'assets', 'grammy', 'props')

EAVE, OV, PITCH = 2.9, 0.55, math.radians(18)    # wall top, the roof's overhang, its pitch
# (trim, shutters, doors and siding in clean flat paint: the kit's painted-wood textures have bare patches, these are kept)
WALL, TRIM, SIDING, ROOF = 'M_stucco__villa', 'M_flat__trim', 'M_flat__bluegrey', 'M_roof_tile_barrel__tilesun'
SHUTTER, DOOR, GLASS, CONC, LINE = 'M_flat__trim', 'M_flat__trim', 'M_glass', 'M_concrete_slab', 'M_flat__grey'
# along the front, left to right (the handoff's order): W window, G garage, E entry, M the meters between two garages
NOM = dict(W=1.7, G=3.4, E=2.2, M=1.6); GAP = 0.7; END = 0.4
KINDS = dict(villa4=dict(seq='W G W E G M G E W G W', L=39.7, D=21.6, units=4),
             villa6=dict(seq='W G W E G M G E W E G M G E W G W', L=58.0, D=21.6, units=6),
             house=dict(seq='W G E W', L=20.0, D=16.0, units=1))
ENTRY_D, OPEN_D = 4.0, 3.0     # the alcove's depth; how much of it is open to the sky

def bays(seq, L):
    """[(kind, x0, x1)] along the front, the spare length spread over the gaps and the ends"""
    s = seq.split(); n = len(s)
    nom = sum(NOM[k] for k in s) + GAP * (n - 1) + 2 * END
    extra = (L - nom) / (n + 1); g, e = GAP + extra, END + extra
    out, x = [], -L / 2 + e
    for k in s: out.append((k, x, x + NOM[k])); x += NOM[k] + g
    return out

def arch_pts(cx, z0, w, rise, seg=10, inner=0.0):
    """the points of a segmental arch over a span w at spring height z0 (x, z)"""
    r = (w * w / 4 + rise * rise) / (2 * rise); zc = z0 + rise - r; a = math.asin(min(1, (w / 2) / r))
    return [(cx + math.sin(-a + 2 * a * i / seg) * (r + inner), zc + math.cos(-a + 2 * a * i / seg) * (r + inner)) for i in range(seg + 1)]

def band(parent, name, pts, t, y0, y1, mat):
    """a flat band (t thick, in the X-Z plane) along a polyline of (x, z) points, between y0 and y1: arch trims"""
    for i in range(len(pts) - 1):
        (xa, za), (xb, zb) = pts[i], pts[i + 1]
        d = Vector((xb - xa, zb - za)); L = d.length; n = Vector((-d.y, d.x)) / L * t / 2
        prism(parent, name, [(xa - n.x, za - n.y), (xb - n.x, zb - n.y), (xb + n.x, zb + n.y), (xa + n.x, za + n.y)], y0, y1, mat)

def window(r, cx, yf, w=1.15, sill=0.85, top=2.05):
    """an arched window with white plantation shutters (the hole is cut by the wall; its parts sit in it)"""
    box(r, 'shutter', (w, 0.04, top - sill), (cx, yf + 0.12, (sill + top) / 2), SHUTTER)
    for i in range(1, 10): box(r, 'slat', (w - 0.04, 0.012, 0.018), (cx, yf + 0.095, sill + i * (top - sill) / 10), LINE)
    box(r, 'slat', (0.03, 0.014, top - sill), (cx, yf + 0.094, (sill + top) / 2), SHUTTER)
    for dx in (-w / 2 - 0.05, w / 2 + 0.05): box(r, 'trim', (0.12, 0.08, top - sill + 0.1), (cx + dx, yf - 0.02, (sill + top) / 2), TRIM)
    box(r, 'trim', (w + 0.36, 0.12, 0.08), (cx, yf - 0.04, sill - 0.04), TRIM)
    # the arch over it: shutters in a half round on the wall, its trim round it
    pts = arch_pts(cx, top, w, w / 2 - 0.02, 10)
    prism(r, 'shutter', [(cx - w / 2, top)] + pts[1:-1] + [(cx + w / 2, top)], yf - 0.015, yf + 0.01, SHUTTER)
    band(r, 'trim', arch_pts(cx, top, w + 0.12, w / 2 + 0.04, 10), 0.11, yf - 0.05, yf + 0.01, TRIM)
    box(r, 'trim', (w + 0.1, 0.06, 0.06), (cx, yf - 0.03, top), TRIM)

def garage(r, x0, x1, yf, num):
    cx, w, h = (x0 + x1) / 2, x1 - x0 - 0.5, 2.2
    box(r, 'door', (w, 0.06, h), (cx, yf + 0.16, h / 2), DOOR)
    for row in range(4):             # the raised square panels, the sections' joints between them
        for col in range(4):
            pw, ph = w / 4 - 0.12, h / 4 - 0.12
            box(r, 'door', (pw, 0.03, ph), (cx - w / 2 + (col + 0.5) * w / 4, yf + 0.125, (row + 0.5) * h / 4), DOOR)
        if row: box(r, 'joint', (w, 0.02, 0.025), (cx, yf + 0.125, row * h / 4), LINE)
    for col in range(1, 4): box(r, 'joint', (0.02, 0.02, h), (cx - w / 2 + col * w / 4, yf + 0.128, h / 2), 'M_flat__villa')
    # pilasters at its sides and the arched trim line between their tops
    for x in (x0 + 0.1, x1 - 0.1): box(r, 'trim', (0.2, 0.1, 2.45), (x, yf - 0.04, 1.225), TRIM)
    band(r, 'trim', arch_pts(cx, 2.42, x1 - x0 - 0.2, 0.32, 12), 0.13, yf - 0.06, yf + 0.01, TRIM)
    box(r, 'trim', (w + 0.08, 0.06, 0.08), (cx, yf + 0.02, h + 0.04), TRIM)
    box(r, 'num', (0.32, 0.03, 0.12), (x0 - 0.3, yf - 0.03, 1.75), 'M_metal_painted__darkgrey')   # the house number
    box(r, 'lamp', (0.14, 0.1, 0.28), (x0 - 0.3, yf - 0.06, 2.0), 'M_metal_painted__darkgrey')

PROJ, GPITCH = 0.8, math.radians(32)   # how far the end garages step forward; their gables' pitch
def end_gable(r, x0, x1, y0):
    """an end garage stepped forward PROJ under a front gable in grey siding (white rake boards, a round vent): its side walls,
    the gable, the two small slopes running back into the main roof"""
    yf = y0 - PROJ; cx, hw = (x0 + x1) / 2, (x1 - x0) / 2 + 0.35
    for x in (x0 - 0.1, x1 + 0.1): wall(r, 'wall', (x, yf), (x, y0), EAVE, 0.2, WALL)
    zr = EAVE + hw * math.tan(GPITCH)
    prism(r, 'gable', [(x0 - 0.2, EAVE), (x1 + 0.2, EAVE), (cx, zr - 0.12)], yf - 0.1, yf + 0.1, SIDING)
    z = EAVE + 0.18
    while z < zr - 0.3:
        wz = (x1 - x0 + 0.4) * (1 - (z - EAVE) / (zr - 0.12 - EAVE)) - 0.1
        box(r, 'board', (wz, 0.02, 0.025), (cx, yf - 0.105, z), LINE); z += 0.18
    band(r, 'trim', [(x0 - 0.35, EAVE - 0.02), (cx, zr), (x1 + 0.35, EAVE - 0.02)], 0.16, yf - 0.38, yf - 0.3, TRIM)
    K.disc(r, 'vent', 0.2, 0.05, (cx, yf - 0.12, EAVE + (zr - EAVE) * 0.45), TRIM, 16, math.pi / 2)
    box(r, 'trim', (x1 - x0 + 0.5, 0.2, 0.2), (cx, yf - 0.05, EAVE - 0.08), TRIM)
    # its roof: two slopes from the gable's eaves up to its ridge, back until the main roof covers them
    yb = y0 - OV + (zr - EAVE) / math.tan(PITCH) + 0.15; ya = yf - 0.35
    bm = bmesh.new()
    for s in (-1, 1):
        vs = [Vector((cx + s * hw, ya, EAVE)), Vector((cx + s * hw, yb, EAVE)), Vector((cx, yb, zr)), Vector((cx, ya, zr))]
        bm.faces.new([bm.verts.new(v) for v in vs])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0: f.normal_flip()
    roof_uv(finish('roof', bm, ROOF, r).data, 2.0)

def shrub(r, x, y, s=1.0, sub=2):
    """a low round shrub: a dark core inside a shell of leaves (the kit's shrub leaves, cut out by their alpha)"""
    for dx, dy, k in ((0, 0, 1.0), (0.35 * s, 0.1, 0.8), (-0.3 * s, -0.05, 0.75)):
        for mat, rr in (('M_flat__leafcore', 0.4), ('M_leaves__shrub', 0.55)):
            bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=rr * k * s)
            bmesh.ops.scale(bm, vec=(1, 1, 0.78), verts=bm.verts)
            bmesh.ops.translate(bm, vec=(x + dx, y + dy, rr * k * s * 0.62), verts=bm.verts)
            finish('shrub', bm, mat, r, True)

def meters(r, x0, x1, yf):
    for i, x in enumerate((x0 + 0.45, x1 - 0.45)):
        box(r, 'meter', (0.34, 0.14, 0.55), (x, yf - 0.07, 1.45), 'M_metal_painted__grey')
        box(r, 'meter', (0.22, 0.1, 0.3), (x, yf - 0.05, 0.75), 'M_metal_painted__grey')
        box(r, 'meter', (0.05, 0.05, 0.5), (x, yf - 0.03, 0.35), 'M_metal_painted__grey')

def entry(r, x0, x1, yf):
    """the alcove: walls each side, a concrete walk, the covered part under a siding gable, the door and its screen"""
    yb = yf + ENTRY_D; yc = yf + OPEN_D
    for x in (x0, x1): wall(r, 'wall', (x, yf), (x, yb), EAVE, 0.2, WALL)
    wall(r, 'wall', (x0, yb), (x1, yb), EAVE, 0.2, WALL, holes=[((x1 - x0) / 2 - 0.5, 1.0, 0.0, 2.1)])
    box(r, 'walk', (x1 - x0, ENTRY_D + 1.2, 0.04), ((x0 + x1) / 2, yf + ENTRY_D / 2 - 0.6, 0.02), CONC)
    box(r, 'frontdoor', (0.96, 0.05, 2.08), ((x0 + x1) / 2, yb + 0.02, 1.04), 'M_wood_painted__darkgrey')
    # the screen porch: a white frame across the covered part, screen between
    for x in (x0 + 0.12, x1 - 0.12): box(r, 'trim', (0.08, 0.08, 2.4), (x, yc + 0.1, 1.2), TRIM)
    box(r, 'trim', (x1 - x0, 0.1, 0.1), ((x0 + x1) / 2, yc + 0.1, 2.4), TRIM)
    box(r, 'trim', (0.9, 0.06, 2.1), ((x0 + x1) / 2, yc + 0.1, 1.05), 'M_screen')
    # above the covered part, the gable in grey siding, with its white rake boards; a beam under it
    zr = EAVE + (OPEN_D + OV) * math.tan(PITCH)
    box(r, 'gable', (x1 - x0, 0.12, zr - EAVE + 0.05), ((x0 + x1) / 2, yc, (EAVE + zr) / 2), SIDING)
    z = EAVE + 0.18
    while z < zr - 0.05: box(r, 'board', (x1 - x0 - 0.04, 0.02, 0.025), ((x0 + x1) / 2, yc - 0.065, z), LINE); z += 0.18
    cx, hw = (x0 + x1) / 2, (x1 - x0) / 2
    band(r, 'trim', [(x0 + 0.05, EAVE + 0.05), (cx, zr - 0.08), (x1 - 0.05, EAVE + 0.05)], 0.12, yc - 0.1, yc - 0.04, TRIM)
    box(r, 'trim', (x1 - x0, 0.18, 0.22), (cx, yc - 0.02, EAVE - 0.09), TRIM)
    box(r, 'vent', (0.36, 0.04, 0.36), (cx, yc - 0.09, EAVE + 0.38), TRIM)

def hip_roof(r, x0, x1, y0, y1, notches=()):
    """the hip roof over the walls (overhang OV), its front slope cut away over each entry's open part (x0, x1 pairs): the
    cut's cheeks in stucco, white fascia round the eaves and up the cuts"""
    Rx0, Rx1, Ry0, Ry1 = x0 - OV, x1 + OV, y0 - OV, y1 + OV
    hd = (Ry1 - Ry0) / 2; tn = OV + OPEN_D; tan = math.tan(PITCH); hd = min(hd, (Rx1 - Rx0) / 2)
    ym = (Ry0 + Ry1) / 2; H = hd * tan
    P = lambda x, t: Vector((x, Ry0 + t, EAVE + t * tan))
    bm = bmesh.new()
    def face(vs):
        out = []
        for v in vs:
            if not out or (v - out[-1]).length > 1e-4: out.append(v)
        if (out[0] - out[-1]).length < 1e-4: out.pop()
        if len(out) >= 3: bm.faces.new([bm.verts.new(v) for v in out])
    # the front slope, in strips between the breakpoints (the hips' feet, the cuts' sides)
    xs = sorted({Rx0, Rx0 + hd, Rx1 - hd, Rx1, *[a for n in notches for a in n]})
    top = lambda x: min(hd, x - Rx0, Rx1 - x)
    for xa, xb in zip(xs, xs[1:]):
        if xb - xa < 1e-4: continue
        cut = any(a <= xa + 1e-4 and xb <= b + 1e-4 for a, b in notches)
        tb = tn if cut else 0.0
        if top(xa) < tb - 1e-4 and top(xb) < tb - 1e-4: continue
        face([P(xa, tb), P(xb, tb), P(xb, max(tb, top(xb))), P(xa, max(tb, top(xa)))])
    # the back slope and the two hip ends
    Q = lambda x, t: Vector((x, Ry1 - t, EAVE + t * tan))
    face([Q(Rx1, 0), Q(Rx0, 0), Q(Rx0 + hd, hd), Q(Rx1 - hd, hd)])
    face([Vector((Rx0, Ry1, EAVE)), Vector((Rx0, Ry0, EAVE)), Vector((Rx0 + hd, ym, EAVE + H))])
    face([Vector((Rx1, Ry0, EAVE)), Vector((Rx1, Ry1, EAVE)), Vector((Rx1 - hd, ym, EAVE + H))])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0: f.normal_flip()
    ob = finish('roof', bm, ROOF, r)
    roof_uv(ob.data, 2.0)
    # fascia round the eaves (cut where the notches are) and up the cuts' sides; the cuts' cheeks
    spans = [(Rx0, Rx1)]
    for a, b in notches:
        new = []
        for s0, s1 in spans:
            if b <= s0 or a >= s1: new.append((s0, s1)); continue
            if a > s0: new.append((s0, a))
            if b < s1: new.append((b, s1))
        spans = new
    for a, b in spans: box(r, 'fascia', (b - a, 0.06, 0.22), ((a + b) / 2, Ry0 - 0.03, EAVE - 0.06), TRIM)
    box(r, 'fascia', (Rx1 - Rx0, 0.06, 0.22), ((Rx0 + Rx1) / 2, Ry1 + 0.03, EAVE - 0.06), TRIM)
    for x in (Rx0, Rx1): box(r, 'fascia', (0.06, Ry1 - Ry0, 0.22), (x, ym, EAVE - 0.06), TRIM)
    for a, b in notches:
        for x in (a, b):
            K.rod(r, 'fascia', (x, Ry0, EAVE), (x, Ry0 + tn, EAVE + tn * tan), 0.07, TRIM, 4)
            # the cheek: stucco from the wall top up to the roof's underside, over the open part
            bmc = bmesh.new(); vs = [bmc.verts.new(v) for v in ((x, y0, EAVE - 0.01), (x, Ry0 + tn, EAVE - 0.01), (x, Ry0 + tn, EAVE + tn * tan), (x, y0, EAVE + OV * tan))]
            bmc.faces.new(vs); bmesh.ops.recalc_face_normals(bmc, faces=bmc.faces)
            c = finish('cheek', bmc, WALL, r)
            for p in c.data.polygons: p.use_smooth = False
        box(r, 'fascia', (b - a, 0.06, 0.2), ((a + b) / 2, Ry0 + tn, EAVE + tn * tan - 0.06), TRIM)
    return ob

def roof_uv(me, tile):
    """the tiles' rows along each slope's eave, the barrels running down it"""
    uv = me.uv_layers[0]
    for p in me.polygons:
        n = p.normal; h = Vector((n.x, n.y, 0))
        h = h.normalized() if h.length > 1e-4 else Vector((0, -1, 0))
        along = Vector((-h.y, h.x, 0)); up = n.cross(along).normalized()
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (v.dot(along) / tile, v.dot(up) / tile)

def building(kind):
    spec = KINDS[kind]; L, D = spec['L'], spec['D']
    x0, x1, y0, y1 = -L / 2, L / 2, -D / 2, D / 2
    r = root('grammy_' + kind)
    B = bays(spec['seq'], L)
    # the front wall, broken at each entry; holes for the garage doors and the windows
    ents = [(a, b) for k, a, b in B if k == 'E']
    gs = [(a, b) for k, a, b in B if k == 'G']; ends = {gs[0], gs[-1]}
    seg_edges = [x0] + [v for a, b in ents for v in (a, b)] + [x1]
    for sa, sb in zip(seg_edges[::2], seg_edges[1::2]):
        holes = []
        for k, a, b in B:
            if a < sa - 1e-3 or b > sb + 1e-3: continue
            if k == 'G' and (a, b) not in ends: holes.append((a + 0.25 - sa, b - a - 0.5, 0.0, 2.2))
            if k == 'W': c = (a + b) / 2; holes.append((c - 0.575 - sa, 1.15, 0.85, 2.05))
        wall(r, 'wall', (sa, y0), (sb, y0), EAVE, 0.2, WALL, holes=holes)
    gs = [(a, b) for k, a, b in B if k == 'G']; ends = {gs[0], gs[-1]}
    for k, a, b in B:
        if k == 'W': window(r, (a + b) / 2, y0 - 0.1); shrub(r, (a + b) / 2 - 0.45, y0 - 0.75); shrub(r, (a + b) / 2 + 0.55, y0 - 0.7, 0.85)
        elif k == 'G' and (a, b) in ends: garage(r, a, b, y0 - PROJ - 0.1, 0); end_gable(r, a, b, y0)
        elif k == 'G': garage(r, a, b, y0 - 0.1, 0)
        elif k == 'M': meters(r, a, b, y0 - 0.1); shrub(r, (a + b) / 2, y0 - 0.75, 0.8)
        elif k == 'E': entry(r, a, b, y0)
    # the back: a slider to each unit; the ends: two windows each
    holes = []
    for i in range(spec['units']):
        c = x0 + (i + 0.5) * L / spec['units']; holes.append((c - 1.2 - x0, 2.4, 0.0, 2.15))
    wall(r, 'wall', (x1, y1), (x0, y1), EAVE, 0.2, WALL, holes=[(L - (h[0] + h[1]), h[1], h[2], h[3]) for h in holes])
    for i in range(spec['units']):
        c = x0 + (i + 0.5) * L / spec['units']
        box(r, 'glass', (2.3, 0.04, 2.1), (c, y1 + 0.02, 1.05), GLASS)
        for dx in (-1.22, 0.0, 1.22): box(r, 'trim', (0.08, 0.1, 2.15), (c + dx, y1 + 0.06, 1.075), TRIM)
        box(r, 'trim', (2.5, 0.1, 0.1), (c, y1 + 0.06, 2.18), TRIM)
    for x, s in ((x0, -1), (x1, 1)):
        hs = [(D * 0.3 - 0.6, 1.15, 0.85, 2.05), (D * 0.7 - 0.6, 1.15, 0.85, 2.05)]
        wall(r, 'wall', (x, y0) if s > 0 else (x, y1), (x, y1) if s > 0 else (x, y0), EAVE, 0.2, WALL, holes=hs)
        for f in (0.3, 0.7):
            y = y0 + D * f if s > 0 else y1 - D * f
            box(r, 'shutter', (0.04, 1.15, 1.2), (x - s * 0.12, y, 1.45), SHUTTER)
            box(r, 'trim', (0.1, 1.45, 0.08), (x + s * 0.12, y, 0.81), TRIM)
    # inside: dark boxes (no interiors; the windows show shadow, not sky), round the open alcoves
    yb = y0 + ENTRY_D + 0.12
    box(r, 'void', (L - 0.3, y1 - 0.15 - yb, EAVE - 0.05), (0, (yb + y1 - 0.15) / 2, EAVE / 2), 'M_void')
    for sa, sb in zip(seg_edges[::2], seg_edges[1::2]):
        box(r, 'void', (sb - sa - 0.3, yb - y0 - 0.15, EAVE - 0.05), ((sa + sb) / 2, (y0 + 0.15 + yb) / 2, EAVE / 2), 'M_void')
    box(r, 'plinth', (L + 0.04, D + 0.04, 0.12), (0, 0, 0.06), 'M_concrete_rough')
    hip_roof(r, x0, x1, y0, y1, notches=[(a, b) for a, b in ents])
    return r

def build(kinds=None):
    sc = K.use_scene('Villas')
    out = {}
    x = 0.0
    for kind in (kinds or KINDS):
        r = building(kind)
        out[kind] = r
    return sc, out

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    sc, built = build([a for a in args if a in KINDS] or None)
    if 'export' in args:
        os.makedirs(OUT, exist_ok=True)
        for kind, r in built.items(): print(kind, K.export(r, os.path.join(OUT, 'grammy_%s.glb' % kind)), 'faces')
    else:   # laid side by side to look at
        for kind, r in built.items(): r.location.x = dict(villa4=0, villa6=60, house=110)[kind]
