# Clothed reference dummies for the Rig Lab (2026-10-20, the user: "another dummy we can compare Marc to that is actually
# wearing clothes"): Quaternius's free Modular Character Outfits - Fantasy (Male_Peasant, Male_Ranger, CC0) are rigged to
# the same 65-bone skeleton as the UAL mannequin, so they play the Quaternius clips natively. The outfits have no head:
# the head (+ eyes) is cut from the free Universal Base Characters' Superhero_Male and bound to the outfit's rig, with the
# pack's buzzed hair, beard and regular eyebrows (bald, the head read as a woman's to the user).
# usage: blender -b --factory-startup --python tools/anim/clothed_ref_build.py -- <outfits glTF dir> <base glTF dir> <out dir> <hair glTF dir>
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
OUTFITS, BASE, OUT, HAIR = argv[:4]
HEAD_GROUPS = ('Head', 'neck_02', 'neck_01')   # (neck_01 too: the head alone left a gap above the collar)
HAIR_PARTS = ('Hair_Buzzed', 'Hair_Beard', 'Eyebrows_Regular')

def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    keep = [o for o in new if not o.name.startswith('Icosphere')]
    for o in [o for o in new if o.name.startswith('Icosphere')]: bpy.data.objects.remove(o, do_unlink=True)
    return keep

for name in ('Male_Peasant', 'Male_Ranger'):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    outfit = imp(os.path.join(OUTFITS, name + '.gltf'))
    arm = next(o for o in outfit if o.type == 'ARMATURE')
    base = imp(os.path.join(BASE, 'Superhero_Male_FullBody.gltf'))
    barm = next(o for o in base if o.type == 'ARMATURE')
    brows = [o for o in base if o.type == 'MESH' and o.name.startswith('Eyebrows')]   # (replaced by Eyebrows_Regular)
    base = [o for o in base if o not in brows]
    for o in brows: bpy.data.objects.remove(o, do_unlink=True)
    for part in HAIR_PARTS: base += imp(os.path.join(HAIR, part + '.gltf'))
    # the Superhero head sits higher than the outfit's (Regular) head bone: move the head pieces onto the outfit's neck
    hb = lambda a, n: a.matrix_world @ a.data.bones[n].head_local
    shift = hb(arm, 'neck_01') - hb(barm, 'neck_01'); print('HEAD_SHIFT', name, tuple(round(x, 4) for x in shift))
    for o in [o for o in base if o.type == 'MESH' and o.parent is None or (o.parent and o.parent.type == 'ARMATURE')]:
        o.matrix_world = __import__('mathutils').Matrix.Translation(shift) @ o.matrix_world
    for o in [o for o in base if o.type == 'MESH']:
        if o.name.startswith('SuperHero_Male'):   # keep only the head and the top of the neck
            gi = {o.vertex_groups[g].index for g in HEAD_GROUPS if g in o.vertex_groups}
            drop = [v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in gi) < 0.5]
            import bmesh
            bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.verts[i] for i in drop], context='VERTS'); bm.to_mesh(o.data); bm.free()
            o.name = name + '_Head'
        mw = o.matrix_world.copy(); pb = o.parent_bone if o.parent_type == 'BONE' else ''
        o.parent = arm
        if pb: o.parent_type = 'BONE'; o.parent_bone = pb
        o.matrix_world = mw
        for m in o.modifiers:
            if m.type == 'ARMATURE': m.object = arm
    for a in [o for o in base if o.type == 'ARMATURE']: bpy.data.objects.remove(a, do_unlink=True)
    for m in bpy.data.materials:  # (textures whose image is missing from the pack export as empty WebP entries three.js rejects)
        if m.node_tree:
            for nd in [nd for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and (nd.image is None or nd.image.size[0] == 0)]:
                print('DROP_TEX', m.name, nd.image and nd.image.name); m.node_tree.nodes.remove(nd)
    for o in bpy.data.objects: o.select_set(o.type in ('MESH', 'ARMATURE'))
    path = os.path.join(OUT, 'Clothed_' + name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_animations=False, export_skins=True,
                              export_yup=True, export_apply=False, export_image_format='WEBP', export_image_quality=85)
    print('EXPORTED', path, os.path.getsize(path), [o.name for o in bpy.data.objects if o.type == 'MESH'])
