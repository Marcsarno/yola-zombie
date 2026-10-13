# Zombie demo – handoff (stopped at asset stage)

Branch `yolanda-zombie`. The hospital game (`yolanda/src`, `yolanda/dist`) is untouched.

Done:
- `zombie/package.json` (three 0.180.0 + esbuild); `npm install` in `yolanda/zombie`.
- Blender scripts in `zombie/blender/` (common.py, build_zombie.py, make_weapons.py, render_sheet.py, render_face.py).
- Draft assets in `zombie/assets/` (zombie-a.glb, pistol/bat/shotgun.glb). The user rejected the zombie's look, so treat these as placeholders.

Not started: combat code, room, HUD, intro.

Next: set up the Blender MCP and the Tripo 3D API locally, then generate Yola, the zombie, pistol and bat from the
four concept images, rigged or rig-compatible (the patient rig has 20 bones: root, hips, spine, chest, neck, head,
clavicle/upper_arm/forearm/hand .L/.R, thigh/shin/foot .L/.R).
Full brief: the user's original NEW DIRECTION prompt (controls, contact/weight, verification rules).
