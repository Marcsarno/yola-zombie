# The vaccine case for the game (2026-10-22, the user's Vaccine_Carry_Case_Game_Asset.zip: assets/source/vaccine_case/).
# The source's inside never shows while it is shut (the foam tray, the lid's foam, the four vials, the cooling insert):
# those go, and what is left is joined by part, the base (CaseBase) and the lid (CaseLid, under Lid_Hinge_PIVOT, which keeps
# the source's Open_Lid_110deg action), so it draws as ~10 material sections instead of 32. CarryGrip (the handle's
# middle) is kept. Lying flat, its root under the shell's middle, the handle on its +Z edge running along X: the same
# conventions as the case it replaces (render/casecarry.js, src/hood/view.js), at its true size (30 x 22 x 7 cm).
# usage (in Blender, with the source imported, or headless):
#   blender -b --python tools/hood/case_for_game.py -- <source.glb> <out.glb>
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if argv:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for d in (bpy.data.actions, bpy.data.meshes, bpy.data.materials): [d.remove(x) for x in list(d)]   # (an earlier import's names would take the .001s)
    bpy.ops.import_scene.gltf(filepath=argv[0])
OUT = argv[1] if len(argv) > 1 else None

INSIDE = ('Cold_insert', 'Foam_tray_WITH_recesses', 'Lid_Hinge_PIVOT__04_Closed_cell_foam', 'VaccineCase_ROOT__08_Frosted_vial', 'vial__Vial_')
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith(INSIDE): bpy.data.objects.remove(o, do_unlink=True)
pivot = bpy.data.objects['Lid_Hinge_PIVOT']
def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = o.data.name = name
    return o
lid = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == pivot]
base = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent != pivot]
L = join(lid, 'CaseLid'); B = join(base, 'CaseBase')
for o in (L, B):  # (one section per material: the join keeps duplicate slots)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.material_slot_remove_unused()
tris = sum(len(p.vertices) - 2 for o in (L, B) for p in o.data.polygons)
print('case for game: tris', tris, 'sections', len(L.material_slots) + len(B.material_slots))
if OUT:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animation_mode='ACTIONS', export_apply=True)
    print('WROTE', OUT)
