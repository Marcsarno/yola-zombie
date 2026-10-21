# Chapter 4, Grammy's peninsula (design/HANDOFF_GRANDMA_PENINSULA.md, the plan design/grandma_map/): the map, built in
# blender/grammy/grammy.blend from the plan's numbers (src/grandma_map.json: metres from Grandma's door, x east, z south).
#   blender blender/grammy/grammy.blend --python blender/grammy/build_grammy.py -- [parts]     (or run in the open Blender)
# Parts (each wipes what it made before and builds it again; no parts = all, in this order):
#   ground   the land and the water: one terrain grid, lowered under the street map's water into banks; the water plane
#   roads    the plan's roads as smooth ribbons (asphalt, a concrete valley gutter each side, cut where roads meet); the
#            boulevard as two carriageways round a raised palm median; the tip roundabout's island; the boat ramp
#   villas   the villa kit (make_villa.py) on every footprint, scaled to it, its front to the road; driveways to the road,
#            entry walks, round shrubs along the fronts
#   trees    palms and shade trees in the yards, palms down the median, the woods north of the boulevard
#   bounds   the walkable area sealed (the plan's zone): fences on land, nothing over water; the blockades B1 - B5
#   gate     the guard gate on the boulevard's median: the booth, a lift bar across each lane (tagged: the game lifts them)
#   marks    the landing, her door, the beats, the gate, the gas can, the family car
import bpy, bmesh, math, os, sys, random
from collections import deque
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [HERE]
import importlib, hoodlib, gramlib; importlib.reload(hoodlib); importlib.reload(gramlib)   # (Blender keeps modules between runs)
import gramlib as G
from gramlib import MAP, mesh_obj, world_uv, place, col, mark, wipe

X0, X1, Z0, Z1 = -190.0, 390.0, -335.0, 125.0      # the ground's extents (the boulevard runs on past both ends)
STEP = 3.0
WATER_Y = -0.35
ROAD_Y, GUTTER_Y, DRIVE_Y = 0.03, 0.036, 0.042

# ------------------------------------------------------------------------------------------------ the land and the water
def blur(a, r):
    for _ in range(2):
        p = np.pad(a, ((r + 1, r), (0, 0)), mode='edge'); c = np.cumsum(p, axis=0); a = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
        p = np.pad(a, ((0, 0), (r + 1, r)), mode='edge'); c = np.cumsum(p, axis=1); a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return a
_WB = None
def water_at(x, z):
    """0 on land .. 1 in the water (the street map's mask, softened; outside the map: land; the bay at the map's top edge
    rounded off, not cut straight)"""
    global _WB
    if _WB is None: _WB = blur(G.water_mask(), 5)
    H, W = _WB.shape
    u, v = G.px(x, z)
    if u < 0 or v < 0 or u >= W - 1 or v >= H - 1: return 0.0
    i, j = int(v), int(u); fu, fv = u - j, v - i
    w = (_WB[i, j] * (1 - fu) * (1 - fv) + _WB[i, j + 1] * fu * (1 - fv) + _WB[i + 1, j] * (1 - fu) * fv + _WB[i + 1, j + 1] * fu * fv)
    if z < -150: w *= min(1.0, max(0.0, (z + 196) / 40.0)) ** 0.5 if z < -156 else 1.0
    return float(w)
def ss(e0, e1, x): t = min(1, max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

def build_ground():
    wipe('ground')
    nx, nz = int((X1 - X0) / STEP) + 1, int((Z1 - Z0) / STEP) + 1
    verts, faces = [], []
    for j in range(nz):
        z = Z0 + j * STEP
        for i in range(nx):
            x = X0 + i * STEP
            verts.append((x, -1.7 * ss(0.3, 0.8, water_at(x, z)), z))
    for j in range(nz - 1):
        for i in range(nx - 1):
            a = j * nx + i; faces.append((a, a + nx, a + nx + 1, a + 1))
    t = mesh_obj('terrain', verts, faces, 'M_grass_ground', 'ground')
    t.data.materials[0] = hoodlib_terrain()
    # the water: one plane over the whole ground (the land stands above it)
    mesh_obj('lake', [(X0, WATER_Y, Z0), (X1, WATER_Y, Z0), (X1, WATER_Y, Z1), (X0, WATER_Y, Z1)], [(0, 3, 2, 1)], 'M_water', 'ground')
    print('ground', len(verts), 'verts')
def hoodlib_terrain():
    import hoodlib
    return hoodlib.terrain_material()

# ------------------------------------------------------------------------------------------------ the roads
_ROADS = None
def roads():
    global _ROADS
    if _ROADS is None: _ROADS = _roads()
    return _ROADS
def _roads():
    """{name: (points, width, closed)} from the plan; the boulevard carried on past both ends of the map"""
    out = {}
    for k, r in MAP['roads'].items():
        pts = G.dedupe([tuple(p) for p in r['points']])
        closed = k == 'tip ring'
        if closed and math.dist(pts[0], pts[-1]) < 1.0: pts = pts[:-1]
        if k == 'Waterways Blvd':
            for end in (0, -1):
                a, b = (pts[0], pts[1]) if end == 0 else (pts[-1], pts[-2])
                d = math.dist(a, b); far = (a[0] + (a[0] - b[0]) / d * 90, a[1] + (a[1] - b[1]) / d * 90)
                pts = [far] + pts if end == 0 else pts + [far]
        out[k] = (G.resample(pts, 2.0) if not closed else pts, r['width_m'], closed)
    return out
BLVD_MEDIAN = 3.0
def lanes(R):
    """the drivable ribbons: (name, points, half width, closed); the boulevard as its two carriageways"""
    out = []
    for k, (pts, w, closed) in R.items():
        if k == 'Waterways Blvd':
            nm = G.normals(pts); off = BLVD_MEDIAN / 2 + (w - BLVD_MEDIAN) / 4
            for s in (1, -1): out.append((k + (' L' if s > 0 else ' R'), [(p[0] + n[0] * off * s, p[1] + n[1] * off * s) for p, n in zip(pts, nm)], (w - BLVD_MEDIAN) / 4, False))
        else: out.append((k, pts, w / 2, closed))
    return out
_BB = {}
def inside_other(p, me, L, pad=0.0):
    for k, pts, hw, closed in L:
        if k == me: continue
        bb = _BB.get(k)
        if bb is None:
            xs, zs = [q[0] for q in pts], [q[1] for q in pts]; bb = _BB[k] = (min(xs) - hw, max(xs) + hw, min(zs) - hw, max(zs) + hw)
        if not (bb[0] <= p[0] <= bb[1] and bb[2] <= p[1] <= bb[3]): continue
        if G.line_dist(p, pts + ([pts[0]] if closed else [])) < hw - pad: return True
    return False
def ribbon(name, pts, a, b, y, mat, closed, keep=None, tile=4.0, strip=False):
    """a strip between offsets a..b (left normal) along pts; keep(i, p_mid) False drops a quad; strip: its UVs run along it
    (the concrete's slab joints square to the strip), else in world x / z"""
    nm = G.normals(pts, closed); n = len(pts)
    verts, faces, uvs = [], [], []
    run = [0.0]
    for k in range(1, n + (1 if closed else 0)): run.append(run[-1] + math.dist(pts[k - 1], pts[k % n]))
    idx = list(range(n)) + ([0] if closed else [])
    for k in range(len(idx) - 1):
        i, j = idx[k], idx[k + 1]
        pi, pj, ni, nj = pts[i], pts[j], nm[i], nm[j]
        mid = ((pi[0] + pj[0]) / 2 + (ni[0] + nj[0]) / 2 * (a + b) / 2, (pi[1] + pj[1]) / 2 + (ni[1] + nj[1]) / 2 * (a + b) / 2)
        if keep and not keep(k, mid): continue
        q = len(verts)
        verts += [(pi[0] + ni[0] * a, y, pi[1] + ni[1] * a), (pi[0] + ni[0] * b, y, pi[1] + ni[1] * b), (pj[0] + nj[0] * b, y, pj[1] + nj[1] * b), (pj[0] + nj[0] * a, y, pj[1] + nj[1] * a)]
        si, sj = run[k], run[k + 1]
        uvs += [(si / tile, a / tile), (si / tile, b / tile), (sj / tile, b / tile), (sj / tile, a / tile)]
        faces.append((q, q + 3, q + 2, q + 1))
    if not faces: return None
    o = mesh_obj(name, verts, faces, mat, 'roads', uv=uvs if strip else world_uv(tile))
    # (shared corners welded: one smooth strip)
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01); bm.to_mesh(o.data); bm.free()
    return o

def build_roads():
    wipe('roads')
    R = roads(); L = lanes(R)
    for k, pts, hw, closed in L:
        ribbon('road_' + k, pts, -hw, hw, ROAD_Y, 'M_asphalt', closed)
        # the valley gutters: 0.6 m of concrete inside each edge, left out where another road's asphalt runs
        for s in (1, -1):
            if closed:      # (the roundabout: its outer gutter only; the island's kerb is the inner edge)
                c = MAP['tip_roundabout']['centre']; nm0 = G.normals(pts, True)[0]
                if math.dist((pts[0][0] + nm0[0] * s * hw, pts[0][1] + nm0[1] * s * hw), c) < math.dist(pts[0], c): continue
            a, b = sorted((s * (hw - 0.6), s * hw))
            ribbon('gutter_' + k, pts, a, b, GUTTER_Y, 'M_concrete_slab', closed, keep=lambda i, m: not inside_other(m, k, L, 0.05), tile=3.0, strip=True)
    # the boulevard's median: a raised kerb round a grass strip (palms on it: trees)
    pts, w, _ = R['Waterways Blvd']
    ribbon('median_grass', pts, -BLVD_MEDIAN / 2 + 0.25, BLVD_MEDIAN / 2 - 0.25, 0.16, 'HOOD_terrain', False)     # (the lawn's own look)
    for s in (1, -1):
        a, b = sorted((s * (BLVD_MEDIAN / 2 - 0.25), s * BLVD_MEDIAN / 2))
        ribbon('median_kerb', pts, a, b, 0.17, 'M_concrete_slab', False, tile=3.0, strip=True)
        side_kerb(pts, s * BLVD_MEDIAN / 2)
    # the tip roundabout: its island (grass, a kerb round it), the mailbox in the middle
    tr = MAP['tip_roundabout']; cx, cz = tr['centre']; r = tr['island_radius_m']
    ring = [(cx + math.cos(a / 32 * math.tau) * r, cz + math.sin(a / 32 * math.tau) * r) for a in range(32)]
    disc_mesh('island', (cx, cz), r - 0.25, 0.16, 'HOOD_terrain')
    ribbon('island_kerb', ring, -0.25, 0.0, 0.17, 'M_concrete_slab', True, tile=3.0, strip=True)
    # the boat ramp: the tip stub on into the water, sloping down
    a, b = MAP['roads']['tip stub']['points']
    d = math.dist(a, b); ux, uz = (a[0] - b[0]) / d, (a[1] - b[1]) / d
    p0 = a; p1 = (a[0] + ux * 12, a[1] + uz * 12); nx, nz = -uz, ux
    verts = [(p0[0] + nx * 3.2, ROAD_Y, p0[1] + nz * 3.2), (p0[0] - nx * 3.2, ROAD_Y, p0[1] - nz * 3.2), (p1[0] - nx * 3.2, -1.3, p1[1] - nz * 3.2), (p1[0] + nx * 3.2, -1.3, p1[1] + nz * 3.2)]
    mesh_obj('boat_ramp', verts, [(0, 1, 2, 3)], 'M_concrete_slab', 'roads', uv=world_uv(3.0))
    print('roads', len(L))

def side_kerb(pts, off):
    """the median's kerb face: a vertical strip from the road up to the kerb's top"""
    nm = G.normals(pts); verts, faces = [], []
    for i in range(len(pts) - 1):
        q = len(verts)
        for k in (i, i + 1):
            x, z = pts[k][0] + nm[k][0] * off, pts[k][1] + nm[k][1] * off
            verts += [(x, ROAD_Y, z), (x, 0.17, z)]
        faces.append((q, q + 2, q + 3, q + 1) if off > 0 else (q, q + 1, q + 3, q + 2))
    mesh_obj('median_kerb_face', verts, faces, 'M_concrete_slab', 'roads', uv=lambda x, y, z: ((x - z) / 3.0, y / 3.0))

def disc_mesh(name, c, r, y, mat, seg=32):
    verts = [(c[0], y, c[1])] + [(c[0] + math.cos(a / seg * math.tau) * r, y, c[1] + math.sin(a / seg * math.tau) * r) for a in range(seg)]
    faces = [(0, 1 + (a + 1) % seg, 1 + a) for a in range(seg)]
    return mesh_obj(name, verts, faces, mat, 'roads', uv=world_uv(4.0))

# ------------------------------------------------------------------------------------------------ the villas
import make_villa as V; importlib.reload(V)
KIT = dict(villa4='grammy/props/grammy_villa4.glb', villa6='grammy/props/grammy_villa6.glb', house='grammy/props/grammy_house.glb')
class Frame:
    """a building's own frame: the kit's x along the front (left to right seen from the road), its Blender y from the front
    (-D/2) to the back; scaled to the footprint"""
    def __init__(self, b):
        self.b = b; self.kind = b['kind']; self.spec = V.KINDS[self.kind]
        self.cx, self.cz = b['centre_m']; self.fx, self.fz = b['front']
        self.sx, self.sy = b['length_m'] / self.spec['L'], b['depth_m'] / self.spec['D']
        self.yaw = math.atan2(self.fx, self.fz); self.c, self.s = math.cos(self.yaw), math.sin(self.yaw)
    def game(self, lx, ly):
        bx = self.cx + self.c * lx * self.sx - self.s * ly * self.sy; by = -self.cz + self.s * lx * self.sx + self.c * ly * self.sy
        return (bx, -by)
    def box(self, name, lx0, lx1, ly0, ly1, h, tag):
        cx, cz = self.game((lx0 + lx1) / 2, (ly0 + ly1) / 2)
        return col(name, cx, cz, abs(lx1 - lx0) / 2 * self.sx, abs(ly1 - ly0) / 2 * self.sy, self.yaw, h, tag, 'villas')

def to_road(p, d, L, maxd=32.0):
    """from p along d (unit, x / z) to the first road's edge: the point there, or None"""
    for k in range(int(maxd / 0.25)):
        q = (p[0] + d[0] * k * 0.25, p[1] + d[1] * k * 0.25)
        for name, pts, hw, closed in L:
            if G.line_dist(q, pts + ([pts[0]] if closed else [])) < hw: return q
    return None

def build_villas():
    wipe('villas')
    R = roads(); L = lanes(R)
    near = lambda p, r: [l for l in L if any(math.dist(p, q) < r + 60 for q in l[1][::8])]
    for bid, b in MAP['buildings'].items():
        F = Frame(b); spec = F.spec; Lk, Dk = spec['L'], spec['D']
        place(KIT[F.kind], F.cx, F.cz, F.yaw, sx=F.sx, sz=F.sy, collide=False, name='villa_' + bid, part='villas')
        B = V.bays(spec['seq'], Lk); gs = [(a, bb) for k, a, bb in B if k == 'G']; ends = {gs[0], gs[-1]}
        ents = [(a, bb) for k, a, bb in B if k == 'E']
        y0, y1, ED = -Dk / 2, Dk / 2, V.ENTRY_D
        # collision: the back, the front between the entries (the alcoves stay open to their doors), the stepped garages
        F.box('COL_' + bid, -Lk / 2, Lk / 2, y0 + ED, y1, 3.2, 'bld:' + bid)
        edges = [-Lk / 2] + [v for a, bb in ents for v in (a, bb)] + [Lk / 2]
        for i, (sa, sb) in enumerate(zip(edges[::2], edges[1::2])):
            F.box('COL_%s_f%d' % (bid, i), sa - (0.1 if i else 0), sb + (0.1 if i < len(ents) else 0), y0, y0 + ED + 0.05, 3.2, 'bld:' + bid)
        for a, bb in ends: F.box('COL_%s_g' % bid, a - 0.2, bb + 0.2, y0 - V.PROJ - 0.1, y0, 3.2, 'bld:' + bid)
        # driveways: from each garage door out to the road (each edge to where it meets the road), concrete
        Lb = near((F.cx, F.cz), max(Lk * F.sx, Dk * F.sy))
        out = (F.fx, F.fz)
        drives = {}
        for a, bb in gs:
            yd = y0 - (V.PROJ if (a, bb) in ends else 0) - 0.1
            ps = [F.game(x, yd) for x in (a + 0.05, bb - 0.05)]
            es = [to_road(p, out, Lb) for p in ps]
            if None in es: es = [(p[0] + out[0] * 6, p[1] + out[1] * 6) for p in ps]   # (no road in front: a short apron)
            drives[(a, bb)] = es
            v = [(ps[0][0], DRIVE_Y, ps[0][1]), (ps[1][0], DRIVE_Y, ps[1][1]), (es[1][0], DRIVE_Y, es[1][1]), (es[0][0], DRIVE_Y, es[0][1])]
            ax, az = -out[1], out[0]      # (across the driveway)
            mesh_obj('drive_' + bid, v, [(0, 1, 2, 3)], 'M_concrete_slab', 'villas', uv=lambda x, y, z: ((x * ax + z * az) / 3.0, (x * out[0] + z * out[1]) / 3.0))
        # the entries' walks: out of the alcove and along the front to the next garage's driveway
        for i, (a, bb) in enumerate(ents):
            k = [j for j, (kk, aa, _) in enumerate(B) if kk == 'E' and aa == a][0]
            nxt = B[k + 1] if k + 1 < len(B) and B[k + 1][0] == 'G' else None; prv = B[k - 1] if B[k - 1][0] == 'G' else None
            xa, xb = (a, nxt[1] + 0.3) if nxt else (prv[2] - 0.3, bb)
            yw = y0 - (V.PROJ if (nxt and (nxt[1], nxt[2]) in ends) or (prv and (prv[1], prv[2]) in ends) else 0)
            v = [F.game(xa, y0 + 0.2), F.game(xb, y0 + 0.2), F.game(xb, y0 - 1.3), F.game(xa, y0 - 1.3)]
            mesh_obj('walk_' + bid, [(p[0], DRIVE_Y + 0.004, p[1]) for p in v], [(0, 1, 2, 3)], 'M_concrete_slab', 'villas', uv=lambda x, y, z: ((x * -out[1] + z * out[0]) / 1.5, (x * out[0] + z * out[1]) / 1.5))
        # Grandma's: her door is the first entry's (the plan's origin)
        dm, dd = None, 1e9
        for a, bb in ents[:1]:
            p = F.game((a + bb) / 2, y0); d = math.hypot(*p)
            if d < 6: mark('door_grandma', *F.game((a + bb) / 2, y0 + ED - 0.6), yaw=F.yaw + math.pi, part='villas'); mark('door_grandma_mouth', *p, yaw=F.yaw + math.pi, part='villas'); print('Grandma:', bid, 'door', [round(v, 2) for v in p])
    print('villas', len(MAP['buildings']))

# ------------------------------------------------------------------------------------------------ the trees
RES = 1.0   # the free-ground raster's metres a cell
def raster():
    """(xs, zs, free, zone): a 1 m raster of the map: free = land, off the roads (2.5 m), the buildings (2 m) and the
    driveways and walks (1 m); zone = the walkable area"""
    xs = np.arange(X0, X1, RES) + RES / 2; zs = np.arange(Z0, Z1, RES) + RES / 2
    GX, GZ = np.meshgrid(xs, zs)
    # land: the softened mask, sampled at each cell
    WB = blur(G.water_mask(), 5); u = GX * G.PXM + G.O[0]; v = GZ * G.PXM + G.O[1]
    inside = (u >= 0) & (v >= 0) & (u < WB.shape[1] - 1) & (v < WB.shape[0] - 1)
    w = np.zeros_like(GX); w[inside] = WB[v[inside].astype(int), u[inside].astype(int)]
    w = np.where(GZ < -156, w * np.sqrt(np.clip((GZ + 196) / 40, 0, 1)), w)
    free = w < 0.25
    def near_seg(a, b, r):
        x0, x1 = min(a[0], b[0]) - r, max(a[0], b[0]) + r; z0, z1 = min(a[1], b[1]) - r, max(a[1], b[1]) + r
        i0, i1 = max(0, int((x0 - X0) / RES)), min(len(xs), int((x1 - X0) / RES) + 2); j0, j1 = max(0, int((z0 - Z0) / RES)), min(len(zs), int((z1 - Z0) / RES) + 2)
        if i0 >= i1 or j0 >= j1: return
        px_, pz_ = GX[j0:j1, i0:i1], GZ[j0:j1, i0:i1]; dx, dz = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dz * dz or 1
        t = np.clip(((px_ - a[0]) * dx + (pz_ - a[1]) * dz) / L2, 0, 1)
        d = np.hypot(px_ - a[0] - t * dx, pz_ - a[1] - t * dz)
        free[j0:j1, i0:i1] &= d >= r
    for k, pts, hw, closed in lanes(roads()):
        P = pts + ([pts[0]] if closed else [])
        for a, b in zip(P, P[1:]): near_seg(a, b, hw + 2.5)
    pts, w_, _ = roads()['Waterways Blvd']
    for a, b in zip(pts, pts[1:]): near_seg(a, b, w_ / 2 + 2.5)
    def poly_out(P, pad):
        """cells inside a convex polygon grown by pad: blocked"""
        xs_ = [p[0] for p in P]; zs_ = [p[1] for p in P]
        i0, i1 = max(0, int((min(xs_) - pad - X0) / RES)), min(len(xs), int((max(xs_) + pad - X0) / RES) + 2)
        j0, j1 = max(0, int((min(zs_) - pad - Z0) / RES)), min(len(zs), int((max(zs_) + pad - Z0) / RES) + 2)
        if i0 >= i1 or j0 >= j1: return
        px_, pz_ = GX[j0:j1, i0:i1], GZ[j0:j1, i0:i1]; ok = np.ones_like(px_, dtype=bool)
        cx, cz = sum(xs_) / len(P), sum(zs_) / len(P)
        for a, b in zip(P, P[1:] + P[:1]):
            nx, nz = b[1] - a[1], -(b[0] - a[0]); L = math.hypot(nx, nz) or 1; nx, nz = nx / L, nz / L
            if (cx - a[0]) * nx + (cz - a[1]) * nz > 0: nx, nz = -nx, -nz      # (the normal pointing out)
            ok &= (px_ - a[0]) * nx + (pz_ - a[1]) * nz < pad
        free[j0:j1, i0:i1] &= ~ok
    for bid, b in MAP['buildings'].items(): poly_out([tuple(c) for c in b['corners_m']], 2.0)
    for o in bpy.data.objects:
        if o.get('part') == 'villas' and o.type == 'MESH' and o.name.startswith(('drive_', 'walk_')):
            poly_out([(v.co.x, -v.co.y) for v in o.data.vertices], 1.0)
    # the walkable area (an even-odd test over the cells)
    Z = MAP['zone']; zone = np.zeros_like(free)
    for a, b in zip(Z, Z[1:] + Z[:1]):
        cond = (b[1] > GZ) != (a[1] > GZ)
        xi = (b[0] - a[0]) * (GZ - a[1]) / ((b[1] - a[1]) or 1e-9) + a[0]
        zone ^= cond & (GX < xi)
    return xs, zs, free, zone, w

YARD = [('neighborhood/models/palm_cabbage.glb', 25), ('neighborhood/models/palm_cabbage_b.glb', 10), ('neighborhood/models/palm_coco.glb', 14),
        ('neighborhood/models/palm_coco_b.glb', 5), ('neighborhood/models/nbt_broad_oak.glb', 30), ('neighborhood/models/nbt_scraggly.glb', 9),
        ('neighborhood/models/palm_fl_struggling.glb', 3), ('neighborhood/models/palm_fl_leaning.glb', 2), ('neighborhood/models/palm_fl_dead.glb', 2)]
WOODS = [('neighborhood/models/nbt_broad_oak.glb', 38), ('neighborhood/models/nbt_storm.glb', 26), ('neighborhood/models/nbt_scraggly.glb', 14),
         ('neighborhood/models/palm_cabbage_far.glb', 16), ('neighborhood/models/nbt_snag.glb', 6)]
def pick(rng, table):
    t = rng.random() * sum(w for _, w in table)
    for m, w in table:
        t -= w
        if t <= 0: return m
    return table[-1][0]

def build_trees():
    wipe('trees')
    rng = random.Random(4); xs, zs, free, zone, wat = raster()
    def cell(x, z):
        i, j = int((x - X0) / RES), int((z - Z0) / RES)
        return (0 <= i < len(xs) and 0 <= j < len(zs)), i, j
    clump = lambda x, z: 0.5 + 0.5 * math.sin(x * 0.071 + math.sin(z * 0.05) * 2.1) * math.cos(z * 0.063 - math.sin(x * 0.04) * 1.7)
    blvd = roads()['Waterways Blvd'][0]
    n = {'yard': 0, 'woods': 0, 'median': 0}; S = 6.0
    for gz in np.arange(Z0 + S / 2, Z1, S):
        for gx in np.arange(X0 + S / 2, X1, S):
            x, z = gx + (rng.random() - 0.5) * S * 0.9, gz + (rng.random() - 0.5) * S * 0.9
            ok, i, j = cell(x, z)
            if not ok or not free[j, i]: continue
            inz = zone[j, i]
            # north of the boulevard: woods (outside the street map: only the road was drawn there)
            side = G.line_dist((x, z), blvd) if not inz else 99
            woods = not inz and (z < -150 or x > 150 or x < -125)
            p = (0.34 if inz else 0.5 if woods else 0.3) * (0.45 + clump(x, z))
            if rng.random() > p: continue
            m = pick(rng, WOODS if woods else YARD)
            s = 0.85 + rng.random() * 0.35
            place(m, x, z, rng.random() * math.tau, s=s, collide=False, part='trees')
            n['woods' if woods else 'yard'] += 1
            if inz or side < 30:
                col('COL_tree', x, z, 0.32 if 'palm' in m else 0.45, 0.32 if 'palm' in m else 0.45, 0, 3.0, 'tree', 'trees')
    # palms down the boulevard's median
    pts = G.resample(blvd, 13.0)
    gate = MAP['guard_gate']
    for p in pts[1:-1]:
        if math.dist(p, gate) < 9: continue
        place('neighborhood/models/palm_coco.glb' if rng.random() < 0.6 else 'neighborhood/models/palm_cabbage.glb', p[0], p[1], rng.random() * math.tau, s=0.9 + rng.random() * 0.25, collide=False, part='trees', y=0.17)
        n['median'] += 1
    print('trees', n)

# ------------------------------------------------------------------------------------------------ the bounds, the blockades
BLOCKS_PX = {'B1': ('south loop', (581, 452)), 'B5': ('connector', (603, 410)), 'B2': ('SW 11th St', (266, 251)),
             'B3': ('SW 42nd Terrace', (447, 130)), 'B4': ('Waterways Blvd', (400, -71))}   # (tools/plan/grandma_map.py BLOCKS)
def m_of(p): return ((p[0] - G.O[0]) / G.PXM, (p[1] - G.O[1]) / G.PXM)
FOOT = [[tuple(c) for c in b['corners_m']] for b in MAP['buildings'].values()]
def in_bld(p, pad=0.4):
    for P in FOOT:
        if G.in_poly(P, *p) or G.line_dist(p, P + [P[0]]) < pad: return True
    return False
def on_road(p, L, pad=0.3):
    return any(G.line_dist(p, pts + ([pts[0]] if closed else [])) < hw + pad for k, pts, hw, closed in L)
FENCE_M, BARRIER_M, HEDGE_M = 'neighborhood/kit/fence_privacy.glb', 'neighborhood/kit/jersey_barrier.glb', 'grammy/props/grammy_hedge.glb'

def shoreside(p, d):
    """True where a boundary runs along the shore (water within 14 m, the line roughly parallel to the waterline): the
    walkable area goes down to the water there (Marc's loop: the west and south shores), the shore's wall closes it"""
    near = max(water_at(p[0] + math.cos(a) * r, p[1] + math.sin(a) * r) for a in [k * math.tau / 12 for k in range(12)] for r in (4, 8, 12, 14))
    if near < 0.4: return False
    gx, gz = water_at(p[0] + 2, p[1]) - water_at(p[0] - 2, p[1]), water_at(p[0], p[1] + 2) - water_at(p[0], p[1] - 2)
    g = math.hypot(gx, gz)
    if g < 1e-3: return True
    return abs(d[0] * gx / g + d[1] * gz / g) < 0.6

def fence_line(name, pts, rng, L, part='bounds', tag=None, h=2.2, shore_ok=False):
    """privacy fence in 2 m panels along pts, a concrete barrier where it crosses a road, nothing over the water or through a
    building; a collider over each unbroken run"""
    tag = tag or 'bound:' + name
    run = []
    def close_run():
        if run:
            a, b = run[0][0], run[-1][1]; dx, dz = b[0] - a[0], b[1] - a[1]; Lr = math.hypot(dx, dz)
            if Lr > 0.1: col('COL_' + name, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Lr / 2 + 0.9, 0.25, math.atan2(-dz, dx), h, tag, part)   # (on 0.9 m past each end: into the water, a wall)
        run.clear()
    for a, b in zip(pts, pts[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]; Ls = math.hypot(dx, dz)
        if Ls < 0.05: continue
        ux, uz = dx / Ls, dz / Ls; yaw = math.atan2(-dz, dx); k = max(1, round(Ls / 2.0)); step = Ls / k
        for i in range(k):
            p0 = (a[0] + ux * step * i, a[1] + uz * step * i); p1 = (p0[0] + ux * step, p0[1] + uz * step); mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
            if water_at(*mid) > 0.38 or in_bld(mid) or (shore_ok and shoreside(mid, (ux, uz))): close_run(); continue
            road = on_road(mid, L)
            if road and G.line_dist(mid, blvd_pts()) < 9: pass      # (across the boulevard: a wall you don't see, where it carries on)
            elif road: place(BARRIER_M, mid[0], mid[1], yaw + math.radians(rng.uniform(-2, 2)), collide=False, part=part, name=name)
            elif G.line_dist(mid, blvd_pts()) < 14:   # (along the boulevard: Marc's line of bushes, not a fence)
                place(HEDGE_M, mid[0], mid[1], yaw + math.radians(rng.uniform(-4, 4)), sx=step / 3.0 * 1.05, collide=False, part=part, name=name)
            else: place(FENCE_M, mid[0], mid[1], yaw + math.radians(rng.uniform(-2, 2)), sx=step / 2.0, collide=False, part=part, name=name)
            run.append((p0, p1))
        close_run()

def contour(xs, zs, F, level):
    """marching squares over a field F (rows z, cols x): the level line as chained polylines (game x / z)"""
    segs = []
    H, W = F.shape
    def lerp(a, b, fa, fb):
        t = (level - fa) / ((fb - fa) or 1e-9); return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    for j in range(H - 1):
        row0, row1 = F[j], F[j + 1]
        for i in range(W - 1):
            f = (row0[i], row0[i + 1], row1[i + 1], row1[i])
            c = int(f[0] > level) | (int(f[1] > level) << 1) | (int(f[2] > level) << 2) | (int(f[3] > level) << 3)
            if c == 0 or c == 15: continue
            P = ((xs[i], zs[j]), (xs[i + 1], zs[j]), (xs[i + 1], zs[j + 1]), (xs[i], zs[j + 1]))
            e = [lerp(P[k], P[(k + 1) % 4], f[k], f[(k + 1) % 4]) if ((f[k] > level) != (f[(k + 1) % 4] > level)) else None for k in range(4)]
            pts = [p for p in e if p is not None]
            if len(pts) == 2: segs.append((pts[0], pts[1]))
            elif len(pts) == 4: segs += [(pts[0], pts[1]), (pts[2], pts[3])]
    key = lambda p: (round(p[0], 3), round(p[1], 3))
    ends = {}
    for s in segs:
        for p in s: ends.setdefault(key(p), []).append(s)
    used, lines = set(), []
    for s in segs:
        if id(s) in used: continue
        used.add(id(s)); line = [s[0], s[1]]
        for fwd in (True, False):
            while True:
                tip = line[-1] if fwd else line[0]; nxt = None
                for t in ends.get(key(tip), []):
                    if id(t) not in used: nxt = t; break
                if nxt is None: break
                used.add(id(nxt)); q = nxt[1] if key(nxt[0]) == key(tip) else nxt[0]
                if fwd: line.append(q)
                else: line.insert(0, q)
        lines.append(line)
    return lines
def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dmax, k = 0, 0
    for i in range(1, len(pts) - 1):
        d = G.seg_dist(pts[i], a, b)
        if d > dmax: dmax, k = d, i
    return rdp(pts[:k + 1], eps)[:-1] + rdp(pts[k:], eps) if dmax > eps else [a, b]

def landing_frame():
    """the landing at the tip: (sx, sz) where the shore meets the water, (wx, wz) out over the water"""
    lx, lz = MAP['landing']
    best = max(range(24), key=lambda i: sum(water_at(lx + math.cos(i * math.tau / 24) * r, lz + math.sin(i * math.tau / 24) * r) for r in (4, 8, 12)))
    wx, wz = math.cos(best * math.tau / 24), math.sin(best * math.tau / 24)
    sx, sz = lx, lz
    for t in range(80):
        q = (lx + wx * t * 0.25, lz + wz * t * 0.25)
        if water_at(*q) > 0.43: break
        sx, sz = q
    return sx, sz, wx, wz
DECK_L, DECK_W = 8.0, 2.6

def build_bounds():
    wipe('bounds')
    rng = random.Random(7); L = lanes(roads())
    # the walkable area as one closed outline: the plan's zone inland; down to the water's edge wherever the shore is near
    # (Marc's loop takes in the west and south shores); only the part the landing connects to
    xs, zs, free, zone, w = raster()
    land = w < 0.36
    dil = lambda m, r: blur(m.astype(np.float32), r) > 1e-3
    walk = land & (zone | (dil(zone, 6) & dil(~land, 9)))
    # the landing's deck: walkable out over the water (the outline goes round it)
    sx, sz, wx, wz = landing_frame(); GX, GZ = np.meshgrid(xs, zs)
    along = (GX - sx) * wx + (GZ - sz) * wz; side = -(GX - sx) * wz + (GZ - sz) * wx
    walk |= (along > -2) & (along < DECK_L - 0.6) & (np.abs(side) < DECK_W / 2 - 0.15)
    lx, lz = sx - wx * 1.2, sz - wz * 1.2; si, sj = int((lx - X0) / RES), int((lz - Z0) / RES)
    for r_ in range(12):    # (the landing point may sit on the water's line: the nearest walkable cell)
        cand = [(sj + dj, si + di) for dj in range(-r_, r_ + 1) for di in range(-r_, r_ + 1) if walk[sj + dj, si + di]]
        if cand: sj, si = cand[0]; break
    reach = np.zeros_like(walk); reach[sj, si] = True; q = deque([(sj, si)])
    H_, W_ = walk.shape
    while q:
        j, i = q.popleft()
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = j + dj, i + di
            if 0 <= a < H_ and 0 <= b < W_ and walk[a, b] and not reach[a, b]: reach[a, b] = True; q.append((a, b))
    lines = [l for l in contour(xs, zs, blur(reach.astype(np.float32), 1), 0.5) if G.polyline_len(l) > 30]
    # round it: an invisible wall along the water, fences on land (concrete barriers across roads; nothing seen across
    # the boulevard past the gate, where the family car drives away)
    gx, gz = MAP['guard_gate']; gu = blvd_frame((gx, gz)); blvd = roads()['Waterways Blvd'][0]
    past_gate = lambda p: (p[0] - gx) * gu[0] + (p[1] - gz) * gu[1] > 6 and G.line_dist(p, blvd) < 8
    n = 0
    for line in lines:
        line = rdp(line, 0.35)
        for a, b in zip(line, line[1:]):
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); dx, dz = b[0] - a[0], b[1] - a[1]; Ls = math.hypot(dx, dz)
            if Ls < 0.05: continue
            nx, nz = -dz / Ls, dx / Ls
            if max(water_at(mid[0] + nx * s * 1.6, mid[1] + nz * s * 1.6) for s in (1, -1)) > 0.38 or past_gate(mid):
                col('COL_shore', mid[0], mid[1], Ls / 2 + 0.3, 0.3, math.atan2(-dz, dx), 2.0, 'shore', 'bounds'); n += 1
            else: fence_line('zone', [a, b], rng, L)
    print('bounds: the outline', len(lines), 'lines,', n, 'water pieces')
    # the blockades: across the road (wrecks, barriers, a sawhorse), fenced on to the buildings each side
    CARS = ['car3_fiat132_rust', 'car3_pickup_crashed', 'car3_suv_smashed_blue', 'car3_pickup_rusty', 'car3_van_panel_90s', 'car3_hudson_hornet']
    for bid, (rname, ppx) in BLOCKS_PX.items():
        p = m_of(ppx); pts, w_, closed = roads()[rname]
        k = min(range(len(pts) - 1), key=lambda i: G.seg_dist(p, pts[i], pts[i + 1]))
        dx, dz = pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]; Ld = math.hypot(dx, dz); ux, uz = dx / Ld, dz / Ld; nx, nz = -uz, ux
        hw = w_ / 2 + (0.5 if rname == 'Waterways Blvd' else 0.3)
        ryaw = math.atan2(-dz, dx)            # (a model's x along the road)
        across = ryaw + math.pi / 2
        for f in ([-0.55, 0.0, 0.55] if hw > 5 else [-0.4, 0.4]):
            c = rng.choice(CARS)
            place('neighborhood/models/%s.glb' % c, p[0] + nx * f * hw + ux * rng.uniform(-0.8, 0.8), p[1] + nz * f * hw + uz * rng.uniform(-0.8, 0.8),
                  across + math.radians(rng.uniform(-28, 28)), collide=False, part='bounds', name='blockade_' + bid)
        for f in (-1, 1):
            place(BARRIER_M, p[0] + nx * f * (hw - 0.6) - ux * 1.6, p[1] + nz * f * (hw - 0.6) - uz * 1.6, across + math.radians(rng.uniform(-10, 10)), collide=False, part='bounds', name='blockade_' + bid)
        place('neighborhood/kit/barricade_sawhorse.glb', p[0] - ux * 3.2, p[1] - uz * 3.2, across + math.radians(rng.uniform(-15, 15)), collide=False, part='bounds', name='blockade_' + bid)
        col('COL_block_' + bid, p[0], p[1], 2.2, hw + 0.4, ryaw, 2.4, 'block:' + bid, 'bounds')
        mark('block_' + bid, p[0], p[1], ryaw, part='bounds')
        # on from each kerb to the nearest building (or 24 m), fenced
        for s in (1, -1):
            a = (p[0] + nx * s * (hw + 0.3), p[1] + nz * s * (hw + 0.3)); b = a
            for t in range(1, 49):
                q = (a[0] + nx * s * t * 0.5, a[1] + nz * s * t * 0.5)
                if in_bld(q, 0.2) or water_at(*q) > 0.38: break
                b = q
            if math.dist(a, b) > 0.5: fence_line('block_' + bid, [a, b], rng, [l for l in L if not l[0].startswith(rname)])
    print('bounds: shore pieces', n)

# ------------------------------------------------------------------------------------------------ the guard gate, the landing
def blvd_frame(p):
    pts = roads()['Waterways Blvd'][0]
    k = min(range(len(pts) - 1), key=lambda i: G.seg_dist(p, pts[i], pts[i + 1]))
    dx, dz = pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]; Ld = math.hypot(dx, dz)
    return dx / Ld, dz / Ld          # (toward the south-east: the way out)
def blvd_pts(): return roads()['Waterways Blvd'][0]
def build_gate():
    wipe('gate')
    gx, gz = MAP['guard_gate']; ux, uz = blvd_frame((gx, gz)); nx, nz = -uz, ux     # (n: toward the neighbourhood side)
    ryaw = math.atan2(-uz, ux)
    place('grammy/props/grammy_booth.glb', gx, gz, ryaw, collide=False, part='gate', name='gate_booth', y=0.17)
    col('COL_gate_booth', gx, gz, 1.5, 1.25, ryaw, 3.0, 'gate:booth', 'gate')
    lane_w = (14 - BLVD_MEDIAN) / 2
    for s, side in ((1, 'sw'), (-1, 'ne')):
        # the post on the median's edge, the bar across its lane toward the outer kerb
        px_, pz_ = gx + nx * s * (BLVD_MEDIAN / 2 - 0.3) - ux * 2.2, gz + nz * s * (BLVD_MEDIAN / 2 - 0.3) - uz * 2.2
        yaw = math.atan2(-nz * s, nx * s)     # (the model's x toward the kerb)
        place('grammy/props/grammy_gatebar.glb', px_, pz_, yaw, collide=False, part='gate', name='gate_bar_' + side, tag='seal:gate', y=0.17)
        cx, cz = gx + nx * s * (BLVD_MEDIAN / 2 + lane_w / 2) - ux * 2.2, gz + nz * s * (BLVD_MEDIAN / 2 + lane_w / 2) - uz * 2.2
        col('COL_seal_gate_' + side, cx, cz, 0.3, lane_w / 2 + 0.3, ryaw, 2.0, 'seal:gate', 'gate')
    # the median between the two bars, and on from each outer kerb along the bars' line: fenced out to the walkable area's
    # edge, so the gate is the only way past
    bx, bz = gx - ux * 2.2, gz - uz * 2.2
    col('COL_gate_median', bx, bz, 0.35, BLVD_MEDIAN / 2 + 0.2, ryaw, 2.0, 'gate:median', 'gate')
    Z = [tuple(p) for p in MAP['zone']]; rng = random.Random(11); L = lanes(roads())
    edges = [(Z[i], Z[(i + 1) % len(Z)]) for i in range(len(Z))]
    def side(p):     # (which side of the boulevard a point is on)
        P = blvd_pts(); k = min(range(len(P) - 1), key=lambda i: G.seg_dist(p, P[i], P[i + 1]))
        return (P[k + 1][0] - P[k][0]) * (p[1] - P[k][1]) - (P[k + 1][1] - P[k][1]) * (p[0] - P[k][0]) > 0
    edges = [(p, q) for p, q in edges if side(p) == side(q)]      # (not the edges across the boulevard)
    for s in (1, -1):
        a = (bx + nx * s * (BLVD_MEDIAN / 2 + lane_w + 0.4), bz + nz * s * (BLVD_MEDIAN / 2 + lane_w + 0.4))
        # straight to the nearest point of the walkable area's edge on that side (not the edges across the boulevard)
        best = None
        for p, q in edges:
            dx, dz = q[0] - p[0], q[1] - p[1]; L2 = dx * dx + dz * dz or 1
            t = max(0, min(1, ((a[0] - p[0]) * dx + (a[1] - p[1]) * dz) / L2)); c = (p[0] + t * dx, p[1] + t * dz)
            if ((c[0] - a[0]) * nx + (c[1] - a[1]) * nz) * s < 0: continue
            d = math.dist(a, c)
            if best is None or d < best[0]: best = (d, c)
        d, c = best; ux2, uz2 = (c[0] - a[0]) / (d or 1), (c[1] - a[1]) / (d or 1)
        b = (c[0] + ux2 * 1.5, c[1] + uz2 * 1.5)       # (on a little past the edge: the outline's wall is there)
        fence_line('gate_side', [a, b], rng, [l for l in L if not l[0].startswith('Waterways')], part='gate', tag='bound:gate')
    mark('gate', gx, gz, ryaw, part='gate'); mark('gate_hold', gx - ux * 9 + nx * 4.5, gz - uz * 9 + nz * 4.5, ryaw, part='gate')
    # the family car, just past the gate on the neighbourhood side, facing the way out
    cx, cz = gx + ux * 16 + nx * (BLVD_MEDIAN / 2 + lane_w / 2), gz + uz * 16 + nz * (BLVD_MEDIAN / 2 + lane_w / 2)
    place('neighborhood/models/car3_van_offroad.glb', cx, cz, ryaw, collide=True, part='gate', name='family_van', tag='car:family')
    mark('family_car', cx, cz, ryaw, part='gate')
    # the landing at the tip: a timber deck from the shore out into the water (walled round by the bounds' outline)
    sx, sz, wx, wz = landing_frame()
    yaw = math.atan2(wx, wz)
    place('grammy/props/grammy_landing.glb', sx - wx * 0.6, sz - wz * 0.6, yaw, collide=False, part='gate', name='landing_deck')
    mark('landing', sx - wx * 1.2, sz - wz * 1.2, yaw + math.pi, part='gate')
    mark('boat', sx + wx * 9.5, sz + wz * 9.5, yaw, y=WATER_Y, part='gate')

def build_marks():
    wipe('marks')
    for k, b in MAP['beats'].items(): mark('beat_%s' % k, b['x'], b['z'], part='marks')
    place('neighborhood/models/nb_fuel_can.glb', 98.0, -8.0, 0.4, collide=False, part='marks', name='gas_can', tag='pickup:gas')
    mark('gas', 98.0, -8.0, part='marks')
    cx, cz = MAP['tip_roundabout']['centre']
    mark('mailbox', cx, cz, part='marks')
    place('grammy/props/grammy_mailbox.glb', cx, cz, 0.6, collide=False, part='marks', name='tip_mailbox', y=0.16)
    G.col_circle('COL_mailbox', cx, cz, 0.3, 1.3, 'prop:mailbox')['part'] = 'marks'

PARTS = dict(ground=build_ground, roads=build_roads, villas=build_villas, trees=build_trees, bounds=build_bounds, gate=build_gate, marks=build_marks)
if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    G.main_scene()
    for p in (args or list(PARTS)):
        PARTS[p]()
    bpy.ops.wm.save_mainfile()
