# Export what tools/anim/yola2_build.py made (run on its .blend):
#   assets/yola2.glb               the new Yola: mesh (base colour 2048, normal / metal-rough 1024, WebP) + every game clip
#   assets/yola_sword.glb          skeleton-only: Sword Regular Combo on the FIRST Yola (the bat, when she is the one playing)
#   assets/moves/yola2_moves.glb   skeleton-only: the library picks on the new Yola (local only, as yola_moves.glb)
#   assets/clipdata_yola2.json     clipdata.json's hit paths re-measured on her (grips, limbs, hips; weapon directions kept)
# usage: blender -b <yola2.blend> --python tools/anim/yola2_export.py -- <assets dir>
import bpy, sys, os, json, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
A = argv[0]
sc = bpy.context.scene; sc.render.fps = 30
lists = json.load(open(bpy.data.filepath + '.json'))
Y2, Y1 = bpy.data.objects['YOLA2'], bpy.data.objects['YOLA1']

def set_action(arm, act):
    arm.animation_data_create(); arm.animation_data.action = act
    if act is not None:
        try: arm.animation_data.action_slot = act.slots[0]
        except Exception: pass

def push_tracks(arm, names, rename=None):
    ad = arm.animation_data or arm.animation_data_create()
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for n in names:
        act = bpy.data.actions[n]
        tr = ad.nla_tracks.new(); tr.name = (rename or {}).get(n, n)
        st = tr.strips.new(tr.name, int(act.frame_range[0]), act)
        try: st.action_slot = act.slots[0]
        except Exception: pass
    ad.action = None
    for p in arm.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)

def export(objs, path):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_animations=True,
        export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_image_format='WEBP', export_image_quality=88,
        export_apply=False, export_yup=True, export_skins=True, export_def_bones=False, export_optimize_animation_size=True, export_extras=True)
    print('EXPORTED', path, os.path.getsize(path))

# ---- clipdata, measured before the export (the export leaves the rig at rest) ----
old = json.load(open(os.path.join(A, 'clipdata.json')))
conv = lambda v: [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]
def pb(arm, n): return arm.pose.bones['mixamorig:' + n]
def grip(arm, s): return (pb(arm, s + 'Hand').head + pb(arm, s + 'HandMiddle1').head) * 0.5
LIMB = {'r': lambda a: grip(a, 'Right'), 'l': lambda a: grip(a, 'Left')}
# which point the first Yola's clipdata used for the kicking foot ('rf'): pick the bone that reproduces it
set_action(Y1, bpy.data.actions['Y1_t_kick_02']); f0 = old['t_kick_02'][0]['f']; sc.frame_set(f0)
cands = {n: pb(Y1, n).head for n in ('RightToeBase', 'RightToe_End', 'RightFoot')}
want = mathutils.Vector(old['t_kick_02'][0]['rf'])
rf_bone = min(cands, key=lambda n: (mathutils.Vector(conv(cands[n])) - want).length)
print('rf is', rf_bone, 'err', (mathutils.Vector(conv(cands[rf_bone])) - want).length)
LIMB['rf'] = lambda a: pb(a, rf_bone).head
LIMB['lf'] = lambda a: pb(a, rf_bone.replace('Right', 'Left')).head
new = {}
for k, v in old.items():
    if not isinstance(v, list) or not v or not isinstance(v[0], dict) or 'f' not in v[0]:
        new[k] = v; continue
    if k not in bpy.data.actions: print('NO CLIP for', k); continue
    set_action(Y2, bpy.data.actions[k]); rows = []
    for s in v:
        sc.frame_set(s['f']); row = {'f': s['f']}
        for fld in s:
            if fld in LIMB: row[fld] = conv(LIMB[fld](Y2))
            elif fld == 'hips': row[fld] = conv(pb(Y2, 'Hips').head)
            elif fld == 'd': row[fld] = s['d']  # (the weapon's direction in character space: the same move, kept)
            elif fld != 'f': row[fld] = s[fld]
        rows.append(row)
    new[k] = rows
set_action(Y2, None)
for p in Y2.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
bpy.context.view_layer.update()
me = bpy.data.objects['YOLA2_mesh']
zs = [(me.matrix_world @ mathutils.Vector(c)).z for c in me.bound_box]
new['heights'] = dict(old.get('heights', {})); new['heights']['YOLA'] = max(zs) - min(zs)
new['hips_rest'] = conv(Y2.data.bones['mixamorig:Hips'].head_local)
new['note_yola2'] = 'measured on the new Yola (tools/anim/yola2_export.py); d (weapon direction) kept from clipdata.json'
json.dump(new, open(os.path.join(A, 'clipdata_yola2.json'), 'w'))
print('CLIPDATA', len(new), new['heights']['YOLA'], new['hips_rest'])

# ---- textures: base colour 2048, the rest 1024 ----
# Her scrubs (tools/anim/yola2_cloth.py, assets/source/yola_v2/cloth), YOLA2_CLOTH = the look:
#   matte (default, the user's pick on 2026-10-16): her colours as Tripo painted them; only the cloth's metal-roughness
#         changes (0.70 -> ~0.90, with the share of shine it keeps, 0.3, in R: the game applies it)
#   full  the cotton look that was turned down (too dark): + cotton colour, fold shadows, normal map at 2048
#   none  her textures exactly as Tripo made them
MODE = os.environ.get('YOLA2_CLOTH', 'matte')
CLOTH = os.path.join(A, 'source', 'yola_v2', 'cloth')
SWAP = {'_rm': ('yola2_rm_matte.png', 'Non-Color')} if MODE == 'matte' else        {'basecolor': ('yola2_basecolor_cotton.png', 'sRGB'), '_rm': ('yola2_rm_matte.png', 'Non-Color'), 'normal': ('yola2_normal_2048.png', 'Non-Color')} if MODE == 'full' else {}
swapped = False
for m in me.data.materials:
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            for key, (fn, cs) in SWAP.items():
                f = os.path.join(CLOTH, fn)
                if key in n.image.name and os.path.exists(f):
                    im = bpy.data.images.load(f, check_existing=False); im.colorspace_settings.name = cs; n.image = im; print('CLOTH', fn); swapped = True
                    break
            big = any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links) or (MODE == 'full' and 'normal' in n.image.name)
            size = 2048 if big else 1024
            if max(n.image.size) > size: n.image.scale(size, size)
            print('TEX', n.image.name, tuple(n.image.size), 'base' if big else '')
    if swapped: m['clothSpec'] = 1  # (the game keeps 30% of the cloth's shine: R of the metal-roughness map)
print('CLOTH MODE', MODE, 'swapped' if swapped else 'as made')

# ---- the files ----
push_tracks(Y2, lists['game']); Y2.location = (0, 0, 0)
export([Y2, me], os.path.join(A, 'yola2.glb'))
push_tracks(Y2, lists['lib'])
export([Y2], os.path.join(A, 'moves', 'yola2_moves.glb'))
push_tracks(Y1, lists['first'], {n: n[len('Y1S_'):] for n in lists['first']}); Y1.location = (0, 0, 0)
export([Y1], os.path.join(A, 'yola_sword.glb'))
print('EXPORT_DONE')
