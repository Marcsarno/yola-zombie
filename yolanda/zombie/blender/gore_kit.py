# Procedural gore kit for the modular zombies: one stump (stays on the body) and one detached cap
# (goes with the severed part) per cut. Torn skin rim, fat line, domed wet muscle, splintered bone.
# Low poly (~150-300 tris each), coloured by vertex colours (no textures), skinned 100% to one bone.
# Usage inside Blender:
#   exec(open(path).read()); build_kit('NURSE_MOD', rings)   # rings from blender/cut_rings.json
import bpy, bmesh, math, random, mathutils
from mathutils import Vector

SKIN = (0.58, 0.36, 0.31, 1); FAT = (0.66, 0.50, 0.30, 1); MUSCLE = (0.36, 0.025, 0.025, 1)
DEEP = (0.14, 0.0, 0.008, 1); BONE = (0.90, 0.85, 0.72, 1); BONE_STAIN = (0.55, 0.12, 0.08, 1)
MARROW = (0.35, 0.05, 0.04, 1); DARK = (0.06, 0.01, 0.01, 1)

def gore_material():
    m = bpy.data.materials.get('Gore')
    if m: return m
    m = bpy.data.materials.new('Gore'); m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.32  # wet
    return m

def frame(n):
    n = Vector(n).normalized()
    a = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
    u = n.cross(a).normalized(); v = n.cross(u)
    return u, v, n

class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.col = self.bm.loops.layers.color.new('Col')
    def ring(self, c, u, v, n, radii, h, rng_h=0.0, rot=0.0, rnd=None):
        out = []
        k = len(radii)
        for i, r in enumerate(radii):
            a = rot + 2 * math.pi * i / k
            hh = h + (rnd.uniform(-rng_h, rng_h) if rnd else 0)
            out.append(self.bm.verts.new(c + (u * math.cos(a) + v * math.sin(a)) * r + n * hh))
        return out
    def band(self, A, B, ca, cb):
        k = len(A)
        for i in range(k):
            j = (i + 1) % k
            f = self.bm.faces.new((A[i], A[j], B[j], B[i]))
            for l in f.loops: l[self.col] = ca if l.vert in (A[i], A[j]) else cb
    def fan(self, ring, tip, cr, ct):
        k = len(ring)
        for i in range(k):
            f = self.bm.faces.new((ring[i], ring[(i + 1) % k], tip))
            for l in f.loops: l[self.col] = ct if l.vert is tip else cr

def flesh_cap(B, c, u, v, n, r, rnd, k=14, dome=1.0):
    """Torn rim -> thin fat line -> domed wet muscle, facing +n. Every ring is irregular so the wound
    reads torn, not sliced; a few skin flaps stick out past the rim."""
    J = lambda lo, hi: [rnd.uniform(lo, hi) for _ in range(k)]
    flapk = set(rnd.sample(range(k), 3))
    jag = [r * (1.04 + (0.16 if i in flapk else 0) + x) for i, x in enumerate(J(-0.05, 0.07))]
    base = B.ring(c, u, v, n, [r * 1.0 for _ in range(k)], -0.006)            # tucked under the skin
    rim = B.ring(c, u, v, n, jag, 0.004, rng_h=0.004, rnd=rnd)                 # torn skin crown
    flap = B.ring(c, u, v, n, [x * 0.95 for x in jag], 0.009, rng_h=0.007, rnd=rnd)
    fat = B.ring(c, u, v, n, [r * x for x in J(0.80, 0.90)], 0.008 * dome, rng_h=0.002, rnd=rnd)
    mus = B.ring(c, u, v, n, [r * x for x in J(0.55, 0.72)], 0.016 * dome, rng_h=0.004, rnd=rnd)
    core = B.ring(c, u, v, n, [r * x for x in J(0.20, 0.34)], 0.021 * dome, rng_h=0.003, rnd=rnd)
    tip = B.bm.verts.new(c + n * 0.020 * dome)
    TORN = (0.42, 0.12, 0.10, 1)
    B.band(base, rim, SKIN, SKIN); B.band(rim, flap, SKIN, TORN); B.band(flap, fat, TORN, FAT)
    B.band(fat, mus, FAT, MUSCLE); B.band(mus, core, MUSCLE, DEEP); B.fan(core, tip, DEEP, DEEP)
    for f in B.bm.faces: f.smooth = True  # flesh is smooth; the bone added after stays faceted

def bone(B, c, u, v, n, rad, length, rnd, sides=6, spikes=True, offset=(0, 0)):
    """Splintered bone shaft from inside the flesh out along n, jagged broken end with marrow."""
    o = c + u * offset[0] + v * offset[1]
    bot = B.ring(o, u, v, n, [rad] * sides, 0.0)
    mid = B.ring(o, u, v, n, [rad * 0.95] * sides, length * 0.55)
    tops = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        h = length * (rnd.uniform(0.7, 1.0) if spikes else 1.0)
        if spikes and i == rnd.randrange(sides): h = length * 1.35  # one long splinter
        tops.append(B.bm.verts.new(o + (u * math.cos(a) + v * math.sin(a)) * rad * 0.9 + n * h))
    B.band(bot, mid, BONE_STAIN, BONE); B.band(mid, tops, BONE, BONE)
    marrow = B.bm.verts.new(o + n * length * 0.72)
    B.fan(tops, marrow, BONE, MARROW)

def build_piece(name, arm, bone_name, ring, side, part, rnd):
    c = Vector(ring['c']); u, v, n = frame(ring['n']); r = ring['r']
    if side == 'detached': n, v = -n, -v  # faces back toward the body
    B = Builder()
    flesh_cap(B, c, u, v, n, r, rnd, dome=0.8 if side == 'detached' else (0.5 if part == 'Head' else 1.0))
    if part == 'Head':
        if side == 'stump':
            bone(B, c - v * r * 0.25, u, v, n, r * 0.34, r * 1.3, rnd, sides=6)          # spine stub
            # windpipe: dark open tube toward the front
            t0 = B.ring(c + v * r * 0.35, u, v, n, [r * 0.17] * 6, 0.018); t1 = B.ring(c + v * r * 0.35, u, v, n, [r * 0.13] * 6, 0.004)
            B.band(t0, t1, (0.55, 0.25, 0.22, 1), DARK); B.fan(t1, B.bm.verts.new(c + v * r * 0.35 - n * 0.004), DARK, DARK)
        else:
            bone(B, c - v * r * 0.25, u, v, n, r * 0.26, r * 0.35, rnd, sides=6)
    elif side == 'stump':  # humerus / femur: one thick splintered shaft
        bone(B, c, u, v, n, r * 0.38, r * 2.2, rnd, offset=(r * 0.08, -r * 0.05))
    else:                  # forearm (radius + ulna) / shin (tibia + fibula): two shorter ends
        bone(B, c, u, v, n, r * 0.26, r * 1.1, rnd, offset=(r * 0.25, 0))
        bone(B, c, u, v, n, r * 0.18, r * 0.85, rnd, offset=(-r * 0.3, r * 0.1))
    me = bpy.data.meshes.new(name); B.bm.normal_update(); B.bm.to_mesh(me); B.bm.free()
    me.materials.append(gore_material())
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm; ob.matrix_parent_inverse = arm.matrix_world.inverted()
    vg = ob.vertex_groups.new(name=bone_name); vg.add(range(len(me.vertices)), 1.0, 'REPLACE')
    md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    return ob

def build_kit(arm_name, rings, seed=7):
    arm = bpy.data.objects[arm_name]; rnd = random.Random(seed)
    for o in list(arm.children):
        if o.name.startswith('GORE_'): bpy.data.objects.remove(o, do_unlink=True)
    made = []
    for key, ring in rings.items():
        a, part = key.split(':')
        if a != arm_name: continue
        made.append(build_piece(f'GORE_{part}_Stump', arm, ring['prox'], ring, 'stump', part, rnd))
        made.append(build_piece(f'GORE_{part}_Detached', arm, ring['dist'], ring, 'detached', part, rnd))
    return made
