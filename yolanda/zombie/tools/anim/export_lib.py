# Export the library clips on Yola for the move viewer (moves.html): one skeleton-only GLB with every listed action
# (sampled at 30 fps, the actions' own rate) and a catalogue JSON (label, source, license, weapon group, frames).
# Clips are grouped by weapon (the viewer's list). Licences: Mixamo (Adobe terms), Quaternius UAL1/2 and KayKit (CC0),
# Kevin Iglesias (royalty-free in games; raw files may not be redistributed: the baked GLB ships inside the game only).
# usage: blender -b <lib.blend> --python tools/anim/export_lib.py -- <out.glb> <catalog.json>
import bpy, sys, json, re
argv = sys.argv[sys.argv.index('--') + 1:]
out_glb, out_cat = argv[0], argv[1]
arm = bpy.data.objects['YOLA']; sc = bpy.context.scene; ad = arm.animation_data or arm.animation_data_create()

SRC = [  # (name prefix or exact name, source label, licence)
    ('kevs_', 'Kevin Iglesias - Human Soldier FREE', 'royalty-free (no raw redistribution)'),
    ('kev_', 'Kevin Iglesias - Human Melee FREE', 'royalty-free (no raw redistribution)'),
    ('ual1_', 'Quaternius - Universal Animation Library 1', 'CC0'),
    ('ual_', 'Quaternius - Universal Animation Library 2', 'CC0'),
    ('kk_', 'KayKit - Character Animations 1.1', 'CC0'),
]
MIXAMO = ['bat_idle', 'bat_swing', 'heavy_swing', 'baseball_double', 'baseball_homerun', 'melee_horizontal', 't_chop',
          'gs_low_slash', 't_box_01', 't_box_02', 't_box_03', 't_kick_01', 't_kick_02', 'pistol_idle', 'pistol_hit',
          'pistol_reload', 'reload_rifle_stand', 'rifle_aim_idle', 'sg_reload', 'hit_body', 't_hit_body_01', 't_hit_head',
          'death_fall']
# weapon groups (the viewer's list), by keyword in the clip name; first match wins
GROUPS = [
    ('Combos (built)', r'^built_'),
    ('Two-handed: bat / sledgehammer / axe', r'2H|Attack2H|heavy_swing|bat_swing|baseball|bat_idle|Heavy_Combo|t_chop|gs_|Spinning|2H_Idle'),
    ('Polearm / thrust (butt strikes)', r'Polearm'),
    ('One-handed blunt: crowbar / club / pipe', r'1H|Attack1H|melee_horizontal|Sword_Regular|Sword_Attack|Sword_Idle|Sword_Dash|Sword_Block|Melee_Hook|OverhandThrow|CombatIdle1H'),
    ('Knife / stab / dual', r'Stab|Dualwield'),
    ('Shield', r'Shield'),
    ('Guns: pistol / rifle / shotgun', r'Gun|Rifle|Pistol|pistol|rifle|sg_|Grenade'),
    ('Unarmed: punch / kick', r'Punch|Kick|t_box|t_kick|Unarmed'),
    ('Hit reactions / death', r'Hit|Damage|Death|death|hit_|Knockback|Block_Hit'),
    ('Idles / other', r'.'),
]
def source_of(n):
    for p, s, l in SRC:
        if n.startswith(p): return s, l
    if n.startswith('built_'): return 'Built in Blender from the clips above (hands fitted)', 'mixed (see recipe)'
    return 'Mixamo (Adobe)', 'Mixamo terms (use in games)'
def group_of(n):
    for g, rx in GROUPS:
        if re.search(rx, n): return g
names = [a.name for a in bpy.data.actions if a.name.startswith(tuple(p for p, _, _ in SRC)) or a.name in MIXAMO or a.name.startswith('built_')]
names = sorted(set(names))
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
cat = []
for n in names:
    a = bpy.data.actions[n]; f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    tr = ad.nla_tracks.new(); tr.name = n; st = tr.strips.new(n, f0, a)
    try: st.action_slot = a.slots[0]
    except Exception: pass
    s, l = source_of(n)
    label = re.sub(r'^(kevs_|kev_|ual1_|ual_|kk_)', '', n).replace('HumanF_', '').replace('_', ' ')
    cat.append({'clip': n, 'label': label, 'group': group_of(n), 'source': s, 'license': l, 'frames': f1 - f0 + 1, 'fps': 30})
ad.action = None
for p in arm.pose.bones: p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
sc.render.fps = 30; sc.render.fps_base = 1
for o in bpy.context.view_layer.objects: o.select_set(False)
arm.hide_set(False); arm.select_set(True); bpy.context.view_layer.objects.active = arm
arm.location = (0, 0, 0)
bpy.ops.export_scene.gltf(filepath=out_glb, use_selection=True, export_format='GLB', export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_yup=True, export_skins=True,
    export_def_bones=False, export_optimize_animation_size=True, export_apply=False)
json.dump({'groups': [g for g, _ in GROUPS], 'clips': cat, 'fps': 30}, open(out_cat, 'w'), indent=1)
print('EXPORTED', len(cat), 'clips ->', out_glb)
