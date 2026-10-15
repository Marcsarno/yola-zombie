# Zombie combat benchmark: progress notes

Branch `zombie-combat` (baseline tag `baseline-supplied` = the project exactly as supplied).
Hospital game untouched: `yolanda/src`, built with `node tools/build.mjs`.

## Run
```
node yolanda/tools/serve.mjs 5173      # serves yolanda/ (also prints LAN URL for a phone on the same Wi-Fi)
cd yolanda/zombie && npm run build     # bundles src/ -> dist/combat.js
open http://localhost:5173/zombie/combat.html
```
Hospital route: http://localhost:5173/dist/Yolanda-Specialty-Medical-Center.html

## Baseline (2026-10-13)
- Hospital game builds and runs (title, opening day, career). No combat code anywhere.
- Zombie demo stopped at asset stage. zombie-a.glb rejected (childlike mint figure, no animation).
- yola.glb: 12-bone chibi rig, no hands/feet/clavicles, tray baked in -> cannot grip weapons.
- pistol/bat GLBs are primitive placeholders.
- Tripo API: logged in, 0 credits (blocker for final character meshes). Cap agreed: ~200 credits.
- "06 / Sculpted Minimal" concept image was not among the supplied files.

## Architecture
- `src/core/*`: engine-agnostic combat (no Three.js imports). Fixed 60 Hz simulation, deterministic per seed.
  Reusable in another Three.js survival game: world colliders + nav, twin-stick input state, player
  controller + action state machine, weapons (shared bat arc), hit resolution, zombie AI, encounter director.
- `src/render/clipchars.js`: clip-driven characters (mixamorig). Locomotion clips blended by local
  velocity and played at the rate that matches travel; swing clip time driven by the simulation;
  small additive corrections (aim alignment, recoil, flinch) in character space; weapon sockets.
- `src/ui/*`: sticks (pointer-id capture), HUD, tuning panel.

## Characters and animation
- Yola, scrubs zombie, patient zombie: the user's Tripo models (mixamorig skeleton), decimated to 15k / 9k / 9k tris, 1K textures.
- Clips: Mixamo (free, user's Adobe login) - pistol locomotion pack, baseball hit (bat), zombie set. Raw FBX in assets/mixamo/.
- blender/retarget.py: world-space retarget with rest-pose alignment. blender/export_chars.py: GLB export + clip measurements.
- Reference check: Mixamo X Bot (assets/mixamo/reference) played beside Yola in Blender; weapon sockets calibrated on it.
- clipdata.json: bat path (socket direction per frame), hips rest, heights. glTF clip time = Blender frame / 30.

## Log
- 2026-10-13: baseline inspected, git baseline, server, Blender MCP connected, Tripo CLI logged in (0 credits).
- 2026-10-13: combat core + HUD built. Rejected stand-in models dropped. User's Tripo Yola + 2 zombies with Mixamo clips in game.
  Bat fixed via X Bot reference socket; sim/render bat agree within 3 cm. Decimated for phones. See CHECKLIST.md.
- 2026-10-13: phone test by user: runs smooth, zombie walk OK. Next: fix jittery legs when strafing with the pistol (render/clipchars.js locoWeights).
- 2026-10-13 (round 2): strafe jitter fixed (loop hitch at clip start, phase-synced gait, running strafes with the
  pistol torso, mirrored walking strafe, back-half hip turn, rate-limited blends). Reload clip. Bat swing leveled
  + follow-through, knockdown/get-up, directional reactions, stronger impact. 23 new Mixamo clips in assets/mixamo.
  Next (agreed): zombie physics - custom ragdoll, body-to-body knockback, hit-location reactions; then dismemberment.
  Later: hold-to-combo melee (3 hits, continues only on contact).
- 2026-10-13 (round 3): modular nurse/patient (seams welded, ~8.8k tris, own gore kit `blender/gore_kit.py`),
  Outbreak hospital furniture in the test room, camera lowered/turned (Zombieville USA 3D look; fixed, never
  turns; tunable), ragdolls + dismemberment + blood. Physics bake-off (`game.lab.*`): custom 0.86 ms/step vs
  Rapier 1.3-1.5 ms at 30 ragdolls; USER CHOSE CUSTOM (Rapier kept behind ?physics=rapier).
  Patient gown weights fixed (forearm/hand influences removed from torso).
  Open: severed forearm once baked stretched (~4 m), not reproduced; small gown flap on raised arm.
  Next: more game feel / play polish in the test room, then Level 1 (map supplied in chat, 8 rooms).
- 2026-10-14 (round 4): weapons pistol -> shotgun -> axe (swap button cycles). Shotgun: 9 pellets, falloff,
  multi-limb severs, close blasts lift/throw ragdolls and knock down, knocked bodies bowl into others;
  pump racks (left hand IK on the pump). Axe combo (hold attack): baseball swing -> great-sword low slash
  (takes legs) -> Yola's own Tripo chop finisher; unlocks once the first hit lands; lunges to target;
  chop hits bodies on the floor. Per-weapon zombie reactions/ragdoll launch. Fixed: Yola bending over
  with the shotgun (corrections accumulated on un-keyed bones; bones now reset to rest each frame),
  stretched severed limbs (bake from current pose). Lab: game.lab.blast / combo.
  Yola's Tripo clip library (punch, kick, dive/roll, chop, hits, deaths) found in
  Downloads/nurse+character+3d+model.glb (it is Yola). Retarget with NLA tracks removed.
  OPEN: shotgun hold pose (low ready; short arms don't always reach the pump - last test left hand
  0.7 m off), user wants: knee-slide shotgun move, kicks/punches, dodge roll, more Tripo deaths/hits.
- 2026-10-14 (round 5): REPLACED the double-barrel idea with a SHORT PUMP SHOTGUN (user wanted a pump + a real shell).
  * Yola's game mesh was my 15k decimation and its UVs were broken (jagged blotches on face/body). Restored her ORIGINAL
    42k-triangle mesh (user's call), 36 clips, assets/yola.glb (6.5 MB). The 15k version is not kept.
  * Rig lab: http://localhost:5173/zombie/viewer.html (src/viewer.js, viewer.html, `node build.mjs`). Yola / nurse / patient
    frame by frame next to the Mixamo source skeleton (known good), side by side or ghost overlay, hand-span readout,
    gun + shell fit sliders ("Fit panel"). window.__lab for scripting. H hides the UI.
  * Gun: assets/weapons/pump_short.glb = the weapon pack's shotgun reshaped in Blender (stock off, shortened so the pump sits
    under her left hand 0.26 m from the grip, thicker/longer barrel, brown pistol grip + brown ribbed pump, separate sliding
    'Pump' node, LoadPort / Muzzle / GameGrip_L empties). Shell: assets/weapons/shell.glb. Built by blender/make_pump.py
    (shell + the first from-scratch gun) plus hand edits of the pack gun in the live scene.
  * Hold: blender action sg_reload = rifle low-ready reload retargeted from Mixamo, spine twisted 52 deg so the barrel points
    along the pelvis heading. Game: shotgun_hold_upper = its frame 1 (HOLD_T; a static clip time is applied only every other
    mixer update, so the hold time alternates by 1e-6 each frame), shotgun_reload_upper = whole clip.
  * Left hand uses shared 2-bone IK (src/render/ik.js): stays on the pump as it slides (shot rack, and rack at reload frames
    80-96), reaches the loading port while the shell is in hand (frames 30-56). Shell hand offsets live in
    SHOTGUN_SPEC.shell (core/weapons.js); tune them in the viewer ("Align shell to port" / sliders) and copy the values.
  * SHOTGUN_HOLD.muzzle re-measured (-0.206, 1.196, 0.854).
  NOT DONE / NEXT:
  - User has not yet judged the shell/pump/hold in the viewer. Check reload frames 30-60 (shell size, fit) and the shot rack.
  - Player deaths: Yola clips t_fall (real fall, 91f) and t_defeat_03 (stumble to face-down, 167f) are real deaths;
    death_fall / death_defeat already in the glb; t_defeat_02 is only a standing slump (not a death). die() still plays
    death_fall only -> pick a variant by last hit direction.
  - Knee slide special = clip t_shoot (run, drop to one knee and slide, kneel and aim; frames ~20-50 slide). Plan: legs/hips from
    t_shoot + the shotgun upper body layer, a button on the HUD. Dodge roll = t_dive. Punches t_box_01-03, kicks t_kick_01/02.
  - Zombie physics per weapon (user's spec): pistol = small stagger, no big push; swing/bat = moderate shove that keeps the
    zombie in reach so the combo continues; axe = LESS push, MORE limb removal; shotgun = major push + limb removal + extra gore.
    Not started this round (per-weapon styles already exist in zombies.js takeHit / clipchars ZombieView, see round 4).
  - HUD weapon icon for the shotgun is still the old pump shape; shotgun mag is back to pump numbers (6, 0.85 s).
  - blender/characters.blend was saved with the live work (actions sg_reload, t_*, gs_low_slash, rifle_aim_idle; a few imported
    helper objects are still in the scene: Armature (Tripo import), Armature.001/.002 (Mixamo rifle refs), Gun/Shell).
- 2026-10-14 (round 6, branch `opening-reveal`): opening/reveal vertical slice, built in four prompts.
  * Prompt 1 DONE: `?intro=1` (add `&auto=1` to skip the start gate) plays the 60 s hospital tour in the combat engine:
    src/opening/{opening,stage,actors,ui,opaudio,content}.js. Clinic set built from the hospital game's own models far from
    the combat wing (clinic origin x=60); OR/combat wing is untouched. Starter->middle->advanced->starter crossfade at
    0:25/0:32/~0:39, preview labels, original Yola's awkward wave (authored in code: the original Yola rig has NO wave clip),
    arrival hold at 1:00 (state CHECK_IN / ARRIVAL_HOLD). Dev: `opening.seek(t)`, `opening.skip()`, `opening.report()`.
  * Also this round: unarmed fists (jab/cross/kick from Yola's Tripo clips; loadouts via Player.setLoadout), left-hand IK
    palm fix, greet_01/greet_04 baked into yola.glb (greet_01 is the improved Yola's smooth wave candidate).
  * Next: Prompt 2 (check-in, seated assessment, dev placeholder card), 3 (OR choices, flatline), 4 (reveal, Room 1).
  * (later in round 6) Opening prompts 2-4 + the re-cut tour, branch `opening-reveal` (see git log):
    - Tour re-cut to the supplied ElevenLabs narration (assets/opening/audio/narration.mp3, 47.07 s). Editable timestamps and shot
      triggers: src/opening/content.js (TOUR). The recording's playback position is the shot clock; without audio permission the
      same timestamps drive subtitles (fallback). Sequence: reception glide -> empty room furnished (popIn + floor rings) ->
      staff at stations / receptionist greeting / Yola seated opposite a patient (previews) -> chart + decision-card previews ->
      equipment -> tiers (hold) -> original Yola's awkward wave on "Still working on the wave" -> arrival -> settle.
    - Acts after the tour live in src/opening/opening.js: act2 (check-in, seated assessment, dev placeholder card), act3 (OR
      choices, alert, flatline, motion, scream), act4 (reveal at ROOM1.player anchor, smooth wave = t_greet_04, return to the
      game camera) and finalize() = the ONE canonical Room 1 snapshot (normal, skip, replay, ?room1=1).
    - Room 1 (core/layout.js ROOM1, sim.setupRoom1): fists only, 3 dormant zombies (wake 2/5/8 s), exit via the NW doorway to
      the new Supply Hall (belongings table: bat + cap; picking up the bat gives the BAT weapon), objective chain in sim.updateFlow.
    - Dev URLs: ?intro=1[&auto=1], ?reveal=1 (replay from "Get Yola"), ?room1=1 (direct canonical snapshot). Test hooks:
      opening.seek(t), opening.runTo(label), opening.skip(), opening.replay(), opening.report().
    - Asset orientation facts used: staff-chair front is -Z; waiting/break/reception chairs front +Z; reception and team desks
      have the operator on +Z (rotated 180 here so the screen faces the person behind the desk).
  * Verification so far (desktop pane, mobile-sized viewport 375x812; NOT a physical phone):
    - Normal completion, skip, direct start (?room1=1) and replay all reach the same Room 1 snapshot (identical JSON snapshot of
      sim, actors, lights, HUD, camera; only live mouse aim differs). Repeated Start taps/card taps start/answer once.
    - Background/blur pauses the story clock, audio context and voice; resume continues with no cue burst.
    - Reduced flash: min light 0.32 (vs 0.03), red light and vignette halved, same reveal timing (13.9 s).
    - Live run with the real recording (real click for audio permission): story clock follows the narration position.
    - Room 1: objective chain works (Get out of the operating room -> Pick up the baseball bat -> Head for the Waiting Area and
      Reception), bat pickup grants BAT, zombies wake at 2/5/8 s, punches/kick hit.
    - Desktop render cost (JS ms/frame, calls, tris): reception 3.2 ms/169/118k; treatment 2.7/184/142k; OR 3.7/221/182k; Room 1 +3
      zombies 2.9/195/172k; 9 lights. Phone cost not measured.
  * NOT yet verified / known gaps: sound itself (music, chimes, voice lines for non-recorded dialogue, scream, flatline) never heard;
    no physical-phone test; the improved Yola's wave (t_greet_04) reads well in stills but was not judged frame-by-frame by the
    user; guard seat height in the hall chair is approximate; Room 2 / reception fight not built (guard just sits there).
    Next if continuing: user review of the full run on their phone, then polish items they call out.
