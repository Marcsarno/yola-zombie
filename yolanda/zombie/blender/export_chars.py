# Export game characters: one GLB per character with only its own clips (as NLA tracks),
# 1K textures, plus a JSON of measured clip data (locomotion speeds, bat swing path).
# Assumes the scene from the session: Armature (Yola), Armature.001 (scrubs zombie),
# Armature.002 (patient zombie), each with its Tripo mesh as a child; retargeted actions present.
import bpy, json, mathutils

OUT = r"C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie\assets" + "\\"

def win_override():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    return dict(window=win, area=area, region=area.regions[-1])

def set_action(arm, act):
    arm.animation_data.action = act
    try: arm.animation_data.action_slot = act.slots[0]
    except Exception: pass

def height(arm):
    mesh = next(c for c in arm.children if c.type == 'MESH')
    zs = [(mesh.matrix_world @ mathutils.Vector(v)).z for v in mesh.bound_box]
    return max(zs) - min(zs)

def downscale_textures(arm, size=1024):
    mesh = next(c for c in arm.children if c.type == 'MESH')
    for m in mesh.data.materials:
        if not m or not m.node_tree: continue
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > size:
                n.image.scale(size, size)

def root_speed(arm, act, hips='mixamorig:Hips'):
    """Average horizontal hips speed over the clip (model units / s) and its direction."""
    sc = bpy.context.scene; fps = sc.render.fps / sc.render.fps_base
    set_action(arm, act)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    def hp(f):
        sc.frame_set(f); return arm.matrix_world @ arm.pose.bones[hips].head
    a, b = hp(f0), hp(f1)
    d = (b - a); d.z = 0
    dur = (f1 - f0) / fps
    return {'speed': d.length / dur if dur else 0, 'dir': [d.x, d.y], 'frames': f1 - f0 + 1, 'fps': fps}

def sample_hands(arm, act, f0, f1):
    """Per-frame hand grip points in the character frame (x left, y up, z forward; Blender -Y is forward)."""
    sc = bpy.context.scene
    set_action(arm, act)
    out = []
    inv = arm.matrix_world.inverted()
    def grip(side):
        h = arm.pose.bones[f'mixamorig:{side}Hand'].head
        m = arm.pose.bones[f'mixamorig:{side}HandMiddle1'].head
        return (h + m) * 0.5
    def hips():
        return arm.pose.bones['mixamorig:Hips'].head
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        r, l, hp = grip('Right'), grip('Left'), hips()
        # Blender armature space: +X = character's left? Tripo/Mixamo: character faces -Y, left hand at +X.
        conv = lambda v: [v.x, v.z, -v.y]
        out.append({'f': f, 'r': conv(r), 'l': conv(l), 'hips': conv(hp)})
    return out

def push_tracks(arm, names):
    ad = arm.animation_data
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for n in names:
        act = bpy.data.actions[n]
        tr = ad.nla_tracks.new(); tr.name = n
        st = tr.strips.new(n, int(act.frame_range[0]), act)
        try: st.action_slot = act.slots[0]
        except Exception: pass
        tr.mute = False
    ad.action = None

def export(arm, names, path):
    arm.location = (0, 0, 0)  # characters are exported centred on their own origin
    push_tracks(arm, names)
    for p in arm.pose.bones:
        p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.scale = (1, 1, 1)
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for c in arm.children: c.select_set(True)
    bpy.context.view_layer.objects.active = arm
    with bpy.context.temp_override(**win_override()):
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB',
            export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
            export_image_format='WEBP', export_image_quality=85, export_apply=False,
            export_yup=True, export_skins=True, export_def_bones=False, export_optimize_animation_size=True)
