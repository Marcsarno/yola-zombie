# Shared helpers for the zombie-demo Blender pipeline (Blender 5.x as the `bpy` module, headless).
import bpy, io, contextlib, mathutils, math, random

def quiet():
    return contextlib.redirect_stdout(io.StringIO())

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_glb(path):
    with quiet():
        bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.data.objects):
        if o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)

def armature():
    return next(o for o in bpy.data.objects if o.type == 'ARMATURE')

def skinned_meshes():
    return [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]

def apply_modifier(o, name):
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_apply(modifier=name)

def reproportion(arm, scales, rots=None):
    """Bake new proportions through the rig: pose bones (scale / rotate), apply the deformation to every
    skinned mesh, then make that pose the new rest pose. Skin weights are kept."""
    for name, s in scales.items():
        pb = arm.pose.bones[name]
        pb.scale = s if isinstance(s, tuple) else (s, s, s)
    for name, e in (rots or {}).items():
        pb = arm.pose.bones[name]
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = e
    bpy.context.view_layer.update()
    for o in skinned_meshes():
        mod = next(m for m in o.modifiers if m.type == 'ARMATURE')
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_copy(modifier=mod.name)
        apply_modifier(o, mod.name)  # first copy baked into the mesh, the duplicate stays live
    bpy.context.view_layer.objects.active = arm
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')

def ground(arm):
    """Move rig + meshes so the lowest vertex sits on z=0."""
    zmin = min((o.matrix_world @ v.co).z for o in skinned_meshes() for v in o.data.vertices)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for b in arm.data.edit_bones:
        b.head.z -= zmin
        b.tail.z -= zmin
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in skinned_meshes():
        for v in o.data.vertices:
            v.co.z -= zmin / o.matrix_world.to_scale().z
    return zmin

def verts_of_material(o, name):
    me = o.data
    idx = [i for i, m in enumerate(me.materials) if m and m.name == name]
    vs = set()
    for p in me.polygons:
        if p.material_index in idx:
            vs.update(p.vertices)
    return sorted(vs)

def centroid(o, vs):
    pts = [o.matrix_world @ o.data.vertices[i].co for i in vs]
    return sum(pts, mathutils.Vector()) / max(1, len(pts))

def new_mat(name, rgb, rough=0.6):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF'] if m.node_tree else None
    if b is None:
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m

def bind_to_bone(o, arm, bone):
    """Parent a new mesh to the rig with every vertex weighted 100% to one bone."""
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
    m = o.modifiers.new('Armature', 'ARMATURE')
    m.object = arm

def decimate(o, ratio):
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = ratio
    m.use_collapse_triangulate = True
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
    apply_modifier(o, 'dec')

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def join(objs, name):
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.object
    j.name = name
    return j

# ---------- procedural shading for bakes (object-space so features stay where they are placed) ----------
class NodeBuilder:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        for n in list(self.nt.nodes):
            if n.type not in ('OUTPUT_MATERIAL',):
                self.nt.nodes.remove(n)
        self.out = next(n for n in self.nt.nodes if n.type == 'OUTPUT_MATERIAL')
        self.bsdf = self.nt.nodes.new('ShaderNodeBsdfPrincipled')
        self.nt.links.new(self.bsdf.outputs[0], self.out.inputs[0])
        self.coord = self.nt.nodes.new('ShaderNodeTexCoord')
    def n(self, t, **kw):
        node = self.nt.nodes.new(t)
        for k, v in kw.items():
            if k.startswith('i_'):
                key = k[2:].replace('_', ' ')
                node.inputs[key].default_value = v
            else:
                setattr(node, k, v)
        return node
    def link(self, a, b):
        self.nt.links.new(a, b)
    def rgb(self, c):
        node = self.n('ShaderNodeRGB')
        node.outputs[0].default_value = (*c, 1)
        return node.outputs[0]
    def val(self, v):
        node = self.n('ShaderNodeValue')
        node.outputs[0].default_value = v
        return node.outputs[0]
    def noise(self, scale, detail=3, rough=0.55, vec=None):
        nz = self.n('ShaderNodeTexNoise', i_Scale=scale, i_Detail=detail, i_Roughness=rough)
        self.link(vec or self.coord.outputs['Object'], nz.inputs['Vector'])
        return nz
    def mix(self, a, b, fac):
        m = self.n('ShaderNodeMix', data_type='RGBA', blend_type='MIX')
        self.link(fac, m.inputs[0]) if not isinstance(fac, float) else None
        if isinstance(fac, float):
            m.inputs[0].default_value = fac
        self.link(a, m.inputs[6])
        self.link(b, m.inputs[7])
        return m.outputs[2]
    def ramp(self, src, a, b):
        """smoothstep-ish mask: 0 below a, 1 above b"""
        mr = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
        mr.inputs['From Min'].default_value = a
        mr.inputs['From Max'].default_value = b
        self.link(src, mr.inputs['Value'])
        return mr.outputs['Result']
    def blob(self, center, radius, soft=0.012, warp=0.35, warp_scale=18.0, stretch=(1, 1, 1)):
        """1 inside a noise-warped sphere at an object-space point (blood splats, bruises, sockets)."""
        sub = self.n('ShaderNodeVectorMath', operation='SUBTRACT')
        self.link(self.coord.outputs['Object'], sub.inputs[0])
        sub.inputs[1].default_value = center
        sc = self.n('ShaderNodeVectorMath', operation='MULTIPLY')
        self.link(sub.outputs[0], sc.inputs[0])
        sc.inputs[1].default_value = (1 / stretch[0], 1 / stretch[1], 1 / stretch[2])
        ln = self.n('ShaderNodeVectorMath', operation='LENGTH')
        self.link(sc.outputs[0], ln.inputs[0])
        nz = self.noise(warp_scale, 2, 0.6)
        mul = self.n('ShaderNodeMath', operation='MULTIPLY_ADD')
        self.link(nz.outputs['Fac'], mul.inputs[0])
        mul.inputs[1].default_value = radius * warp
        mul.inputs[2].default_value = radius * (1 - warp * 0.5)
        d = self.n('ShaderNodeMath', operation='SUBTRACT')
        self.link(mul.outputs[0], d.inputs[0])
        self.link(ln.outputs['Value'], d.inputs[1])
        return self.ramp(d.outputs[0], -soft, soft)
    def maxm(self, a, b):
        m = self.n('ShaderNodeMath', operation='MAXIMUM')
        self.link(a, m.inputs[0]); self.link(b, m.inputs[1])
        return m.outputs[0]
    def set_color(self, sock, rough=0.6):
        self.link(sock, self.bsdf.inputs['Base Color'])
        self.bsdf.inputs['Roughness'].default_value = rough

def bake_atlas(o, size=1024, ao_size=1024, ao_strength=0.5, margin=6, uv_margin=0.006, ao_dist=0.12):
    """Smart-UV the (joined) mesh, bake its procedural diffuse colour into one image, bake AO, multiply."""
    import numpy as np
    me = o.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='UVMap')
    bpy.context.view_layer.objects.active = o
    for ob in bpy.context.selected_objects: ob.select_set(False)
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=uv_margin, area_weight=0.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    col = bpy.data.images.new('bake_col', size, size)
    aoi = bpy.data.images.new('bake_ao', ao_size, ao_size)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    sc.render.bake.margin = margin
    def target(img):
        for m in me.materials:
            nt = m.node_tree
            t = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
            t.name = 'BAKE_TARGET'; t.image = img
            nt.nodes.active = t
    target(col)
    with quiet():
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_clear=True, margin=margin)
    target(aoi)
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.cycles.samples = 64
    with quiet():
        bpy.ops.object.bake(type='AO', use_clear=True, margin=margin)
    c = np.array(col.pixels[:]).reshape(size, size, 4)
    a = np.array(aoi.pixels[:]).reshape(ao_size, ao_size, 4)
    if ao_size != size:
        a = a.repeat(size // ao_size, 0).repeat(size // ao_size, 1)
    k = (1 - ao_strength) + ao_strength * a[..., :1]
    c[..., :3] *= k
    col.pixels[:] = c.ravel()
    return col

def single_material(o, img, name, rough=0.65):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    o.data.materials.clear()
    o.data.materials.append(m)
    return m

def export_glb(path, jpeg=True):
    with quiet():
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_animations=False, export_skins=True,
                                  export_yup=True, export_image_format='JPEG' if jpeg else 'AUTO', export_jpeg_quality=88)
