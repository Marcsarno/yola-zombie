# Chapter 2, Marc's polish brief (design/CH2_POLISH_BRIEF.md): small, reversible fixes on hood.blend, after the ch2_* scripts.
#   run in the open hood Blender (or blender -b blender/hood/hood.blend --python blender/hood/ch2_polish.py -- [parts])
# Parts (each guarded by a scene flag, so a part runs once):
#   leftovers   the old map's ground under the new loop road (ch2_map.py moved the road): driveway and verge faces lying on
#               the new road are cut away, and the bits of row 5's old driveways stranded across it on the far lawn go
import bpy, bmesh, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [HERE]
sc = bpy.context.scene

def roads_bvh():
    """the new roads (ch2_map.py's ch2_*road* meshes) as one ray-test tree, in world space"""
    vs, fs = [], []
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith('ch2_') or 'road' not in o.name: continue
        M = o.matrix_world; base = len(vs)
        vs += [M @ v.co for v in o.data.vertices]; fs += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(vs, fs) if fs else None

def on_road(bvh, p): return bvh.ray_cast(Vector((p.x, p.y, 5.0)), Vector((0, 0, -1)), 10.0)[0] is not None

def leftovers():
    if sc.get('ch2_polish_leftovers'): print('leftovers: done before'); return
    bvh = roads_bvh(); n_cut = n_drop = 0
    rows = [e.matrix_world.translation.copy() for e in bpy.data.collections['PLACED'].all_objects if os.path.basename(e.get('src', '')).startswith('kit_row')]
    for o in list(bpy.data.collections['GROUND'].all_objects):
        if o.type != 'MESH' or not o.name.startswith(('driveway_', 'verges')): continue
        bm = bmesh.new(); bm.from_mesh(o.data); M = o.matrix_world
        # faces part on the road, part off: halved a few times first (the road's kerb hides the stepped edge left)
        for _ in range(6):
            cross = [f for f in bm.faces if len({on_road(bvh, M @ v.co) for v in f.verts} | {on_road(bvh, M @ f.calc_center_median())}) > 1]
            if not cross: break
            bmesh.ops.subdivide_edges(bm, edges=list({e for f in cross for e in f.edges}), cuts=1, use_grid_fill=True)
        dead = [f for f in bm.faces if on_road(bvh, M @ f.calc_center_median())]
        n_cut += len(dead); bmesh.ops.delete(bm, geom=dead, context='FACES')
        if o.name.startswith('driveway_') and bm.faces:
            # the pieces left: keep the one by its row (nearest a row's centre); the rest lie across the road
            bm.faces.ensure_lookup_table(); seen, comps = set(), []
            for f in bm.faces:
                if f.index in seen: continue
                stack, comp = [f], []
                seen.add(f.index)
                while stack:
                    g = stack.pop(); comp.append(g)
                    for e in g.edges:
                        for h in e.link_faces:
                            if h.index not in seen: seen.add(h.index); stack.append(h)
                comps.append(comp)
            if len(comps) > 1 and rows:
                def dist(comp):
                    c = sum((M @ f.calc_center_median() for f in comp), Vector()) / len(comp)
                    return min((Vector((c.x, c.y, 0)) - Vector((r.x, r.y, 0))).length for r in rows)
                comps.sort(key=dist)
                for comp in comps[1:]:
                    n_drop += len(comp); bmesh.ops.delete(bm, geom=comp, context='FACES')
        bm.to_mesh(o.data); bm.free(); o.data.update()
    sc['ch2_polish_leftovers'] = True
    print('leftovers: %d faces under the new roads cut, %d stranded across them dropped' % (n_cut, n_drop))

# ---------------------------------------------------------------------------------------------------- the weak blockers
# Blocking lines (COL boxes along a boundary, a block or a seal) whose gaps were "closed" by knee-high fillers (a tire stack,
# pallets, sandbags, trash bags, boxes, a cart) with the invisible wall behind them: each gap gets the line's own panels (the
# palisade, the privacy fence, corrugated sheet), standing on the collider's centre line; the fillers move off the line to the
# walkable side (they stay as the junk that was piled there), their own small colliders with them; the line's collider is
# thinned to the panels. REACH: a json grid of the cells Marc can walk (scratchpad, from the game's own collision).
FILLERS = ('tire_stack', 'pallet_stack', 'pallet', 'sandbags', 'trash_bags', 'cardboard_box', 'debris_pile', 'shopping_cart', 'tire', 'barrel', 'wooden_crate')
PANELS = {'palisade': ['models/palisade_2m.glb', 'models/palisade_2m_b.glb', 'models/palisade_2m_c.glb'], 'fence_privacy': ['kit/fence_privacy.glb'],
          'hood_fence_slat': ['props/hood_fence_slat.glb'], 'wall_corrugated': ['kit/wall_corrugated.glb', 'kit/wall_corrugated_b.glb']}
SOFT = ('nbt_', 'palm_', 'shrub', 'yard', 'nb_frond', 'by_garden', 'nb_palm_debris')
def blockers():
    if sc.get('ch2_polish_blockers'): print('blockers: done before'); return
    import json, hoodlib, ch2lib
    R = json.load(open(REACH)); RX, RZ, RC = R['x0'], R['z0'], R['cell']; rows = R['rows']
    def walk(x, z):
        i, j = int((x - RX) / RC), int((z - RZ) / RC)
        return 0 <= j < len(rows) and 0 <= i < len(rows[0]) and rows[j][i] == '1'
    inst = []
    for e in bpy.data.collections['PLACED'].all_objects:
        if e.instance_type != 'COLLECTION' or not e.instance_collection or e.hide_render: continue
        b = hoodlib.lib_bounds(e.instance_collection)
        if not b: continue
        x0, x1, y0, y1, z0, z1 = b; M = e.matrix_world
        cs = [M @ Vector((x, y, 0)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        top = (M @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, z1))).z
        inst.append((e, cs, top, os.path.basename(e.get('src', '') or e.instance_collection.get('src', ''))))
    fixed = []
    for cname in [o.name for o in bpy.data.collections['COL'].all_objects if o.get('col') == 'box']:
        c = bpy.data.objects.get(cname)
        if c is None: continue    # (a filler's own collider, rebuilt below)
        tag = c.get('tag', '')
        if tag.startswith(('bld', 'water', 'tree', 'prop:', 'dock')): continue
        s = c.matrix_world.to_scale(); ax = 0 if s.x >= s.y else 1; L, T = (s.x, s.y) if ax == 0 else (s.y, s.x)
        if L < 2.0 or T > 1.6: continue
        M = c.matrix_world; Mi = M.inverted()
        on, fill, styles = [], [], {}
        for e, cs, top, src in inst:
            lc = [Mi @ p for p in cs]
            lo = [min(p[i] for p in lc) for i in range(2)]; hi = [max(p[i] for p in lc) for i in range(2)]
            if hi[0] < -0.55 or lo[0] > 0.55 or hi[1] < -0.55 - 0.3 / max(s.y, 1e-3) or lo[1] > 0.55 + 0.3 / max(s.y, 1e-3): continue
            a, b = max(-0.5, lo[ax]), min(0.5, hi[ax])
            if b <= a: continue
            if src.startswith(FILLERS) and top < 0.9: fill.append(e); continue
            if src.startswith(SOFT) or top < 0.9: continue
            on.append((a, b))
            for k in PANELS:
                if src.startswith(k): styles[k] = styles.get(k, 0) + 1
        if not fill: continue
        # the gaps along the line that nothing tall stands in
        on.sort(); gaps, cur = [], -0.5
        for a, b in on:
            if a > cur: gaps.append((cur, a))
            cur = max(cur, b)
        if cur < 0.5: gaps.append((cur, 0.5))
        gaps = [(a, b) for a, b in gaps if (b - a) * L > 0.4]
        if not gaps: continue
        style = max(styles, key=styles.get) if styles else 'palisade'
        # the line's direction and its walkable side (in game x / z)
        d3 = (M.to_3x3() @ Vector((1, 0, 0) if ax == 0 else (0, 1, 0))).normalized(); n3 = Vector((-d3.y, d3.x, 0))
        ctr = M.translation; side = 0
        for k in range(9):
            t = (k / 8 - 0.5) * L; p = ctr + d3 * t
            for sgn in (1, -1):
                q = p + n3 * sgn * (T / 2 + 0.8)
                if walk(q.x, -q.y): side += sgn
        sgn = 1 if side >= 0 else -1
        yaw = math.atan2(d3.y, d3.x)
        n_pan = 0
        for a, b in gaps:
            w = (b - a) * L; k = max(1, round(w / 2.1)); step = w / k
            for i in range(k):
                t = a * L + (i + 0.5) * step; p = ctr + d3 * t
                rel = PANELS[style][(n_pan + i) % len(PANELS[style])]
                sx = step / {'palisade': 2.1, 'fence_privacy': 2.43, 'hood_fence_slat': 2.47, 'wall_corrugated': 3.0}[style]
                e = ch2lib.place(rel, p.x, -p.y, yaw + (math.pi if sgn < 0 else 0), collide=False, owner='ch2_polish', name='polish_panel')
                e.scale = (sx, 1.0, 1.0)
            n_pan += k
        # the fillers: off the line onto the walkable side, their own colliders with them
        for e in fill:
            if e.get('polish_moved') is None: e['polish_moved'] = list(e.location)
            off = T / 2 + 0.75
            e.location = e.location + n3 * sgn * off
            old = bpy.data.objects.get('COL_prop_' + e.name)
            if old: bpy.data.objects.remove(old, do_unlink=True)
            bpy.context.view_layer.update()
            nc = hoodlib.prop_collider(e)
            if nc is not None: nc['ch2'] = 'ch2_polish'
        # (the line's collider keeps its thickness: thinned, the lines' corners opened up; the panels stand on its centre line)
        fixed.append('%s (%.1f, %.1f) %.0f m: %d panels (%s), %d fillers moved' % (tag, ctr.x, -ctr.y, L, n_pan, style, len(fill)))
    sc['ch2_polish_blockers'] = True
    print('blockers:\n  ' + '\n  '.join(fixed))

# the old verges (grass strips along the old road) across the driveways ch2_map.py stretched to the new road: cut where they
# lie on a driveway (a green band across the asphalt)
def verges():
    if sc.get('ch2_polish_verges'): print('verges: done before'); return
    vs, fs = [], []
    for o in bpy.data.collections['GROUND'].all_objects:
        if o.type != 'MESH' or not o.name.startswith('driveway_'): continue
        M = o.matrix_world; base = len(vs)
        vs += [M @ v.co for v in o.data.vertices]; fs += [[base + i for i in p.vertices] for p in o.data.polygons]
    bvh = BVHTree.FromPolygons(vs, fs); n = 0
    for o in list(bpy.data.collections['GROUND'].all_objects):
        if o.type != 'MESH' or not o.name.startswith('verges'): continue
        bm = bmesh.new(); bm.from_mesh(o.data); M = o.matrix_world
        for _ in range(6):
            cross = [f for f in bm.faces if len({on_road(bvh, M @ v.co) for v in f.verts} | {on_road(bvh, M @ f.calc_center_median())}) > 1]
            if not cross: break
            bmesh.ops.subdivide_edges(bm, edges=list({e for f in cross for e in f.edges}), cuts=1, use_grid_fill=True)
        dead = [f for f in bm.faces if on_road(bvh, M @ f.calc_center_median())]
        n += len(dead); bmesh.ops.delete(bm, geom=dead, context='FACES')
        bm.to_mesh(o.data); bm.free(); o.data.update()
    sc['ch2_polish_verges'] = True
    print('verges: %d faces on driveways cut' % n)

# Marc's front door: a dead planter stood half across the mouth of the doorway (0.4 m left for him, none for the infected's
# routes): moved to the other side of the door, against the wall (its collider with it)
def doorway():
    if sc.get('ch2_polish_doorway'): print('doorway: done before'); return
    import hoodlib
    e = bpy.data.objects.get('by_planter_dead.005')
    if e is None or abs(e.location.x - 36.6) > 0.3 or abs(-e.location.y - 39.24) > 0.3: print('doorway: the planter is not where it was'); return
    e['polish_moved'] = list(e.location); e.location = (36.62, -37.2, e.location.z)
    old = bpy.data.objects.get('COL_prop_' + e.name)
    if old: bpy.data.objects.remove(old, do_unlink=True)
    bpy.context.view_layer.update(); c = hoodlib.prop_collider(e)
    if c is not None: c['ch2'] = 'ch2_polish'
    sc['ch2_polish_doorway'] = True
    print('doorway: the planter moved to (36.62, 37.2)')

PARTS = dict(leftovers=leftovers, blockers=blockers, verges=verges, doorway=doorway)
if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for p in (args or list(PARTS)): PARTS[p]()
