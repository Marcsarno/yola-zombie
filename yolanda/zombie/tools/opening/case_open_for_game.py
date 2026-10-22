# The vaccine case for Chapter 1's doctor scene (2026-10-22): the camera starts on the case lying OPEN, so its inside stays
# (the foam tray with its four vials and the cooling insert, the lid's foam). Otherwise as the neighbourhood's game copy
# (tools/hood/case_for_game.py on neighborhood-level): the parts joined by side, the base (CaseBase) and the lid (CaseLid,
# under Lid_Hinge_PIVOT, which keeps the source's Open_Lid_110deg action, frame 1 shut to 48 open: played backwards it
# shuts), one section per material, CarryGrip kept. Lying flat, root under the shell's middle, the handle on its +Z edge
# along X, at true size (30 x 22 x 7 cm): the conventions render/casecarry.js expects.
# usage: blender -b --factory-startup --python tools/opening/case_open_for_game.py -- <Vaccine_Carry_Case.glb> <out.glb>
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
pivot = bpy.data.objects['Lid_Hinge_PIVOT']
def under(o, p):
    while o is not None:
        if o == p: return True
        o = o.parent
    return False
def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = o.data.name = name
    bpy.ops.object.material_slot_remove_unused()
    return o
mesh = [o for o in bpy.data.objects if o.type == 'MESH']
lid = [o for o in mesh if under(o, pivot)]; base = [o for o in mesh if o not in lid]  # (both before the first join removes objects)
L = join(lid, 'CaseLid'); B = join(base, 'CaseBase')
for o in [o for o in bpy.data.objects if o.type == 'EMPTY' and not o.children and o.name not in ('CarryGrip', 'Lid_Hinge_PIVOT')]:
    bpy.data.objects.remove(o, do_unlink=True)  # (the vials' empty groups, once their meshes are joined)
tris = sum(len(p.vertices) - 2 for o in (L, B) for p in o.data.polygons)
print('case (open) for game: tris', tris, 'sections', len(L.material_slots) + len(B.material_slots), 'objects', [o.name for o in bpy.data.objects])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=argv[1], export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_apply=True)
print('WROTE', argv[1])
