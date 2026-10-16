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
- 2026-10-15 (round 7): Floor 3 / Level 1 "the hospital loop" + opening polish (branch opening-reveal).
  * Level data: src/core/floor3.js (rooms, wall centre lines with door gaps, doors, props, signs, zombie groups, pickups,
    interactions; plan px -> world: x=(px-918)/27-7, z=(py-520)/27-11.15). Game state: src/core/level.js (flags
    lift_power_restored / cafeteria_brace_removed / ct_return_unbarred, pickups, prompts + Use, lift state machine, checkpoints).
    layout.js now holds two layouts (wing for practice/waves/bench; floor3 for the story) chosen by mode (room1 = floor3).
  * Renderer (render/arena.js): per-room floors, walls that cut away (lower to 1 m) between the camera and Yola, wall-mounted
    items hide with their wall, kit doors/lift cut by clipping planes (armed on the first play frame), braced door + CT bar +
    lift animated from level state, reset panel + FAULT/READY, canvas wayfinding signs + the supplied 2D room prints, room props
    merged per material per room (OR props kept separate for the opening), walls baked to one vertex-coloured mesh each.
  * Opening: assessment office (desk, clinician chair, two visitor chairs, supplies, info wall), two-bay room with three tiers
    (bed, headwall, monitor, IV, cabinet, screen, cart, prep storage), staff corridor; athlete changes to white at the OR cut;
    a lilac-scrubs clinician operates (Yola is called in); reveal: both Yolas stand still, no ECG over it, black beat, then a
    Borderlands-style freeze/punch-in boss card (YOLA — Calm under pressure). iPhone audio: playback audio session + silent
    looping <audio> unlock, narration/music join late if the context resumes after the tap.
  * Tested (desktop pane, mobile viewport; NOT a phone): all pickups (incl. full-health refusal, emptied bag), lift fault ->
    reset -> doors open -> board -> close -> level complete, brace removal (anim, collision off, cafeteria release), CT bar from
    the CT side only (OR side says barred), every doorway walked both ways with stick input, nav reachability with each door
    state, retry from checkpoint (flags, pickups, kills, loadout kept). Render: 230-370 calls, 210-360k tris per view.
  * Not verified: sound on an iPhone; real-time playthrough with combat by a person; phone frame rate.
- 2026-10-14 (round 8): combat polish. Full details in COMBAT_POLISH_LOG.md. Unlimited spare ammo while testing (reloads
  kept); zombie crowd steering; three-hit bat combo; pistol headshots; bat hit registration (side walls, reaching arms,
  window/reach, crawlers); the finisher's 14° aim offset; fist hits counted twice.
- 2026-10-15 (round 9): see COMBAT_POLISH_LOG.md (top). Two-hit combos (bat: swing + mirrored home run `bat_swing_m`,
  new clip in yola.glb; axe: swing + raised chop); hit-stop is slow motion, not a freeze (tuning versioned); opening:
  exterior first shot (stage.buildExterior), live monitor screens (render/screens.js), OR rebuilt around one mid-tier
  table (floor3.js; door or_ct_2 moved to x 4.8), patient sits up and greens, flicker reveal; Floor 3 emergency
  lighting (arena.setEmergency; amber point lights removed).
- 2026-10-15 (round 10, IN PROGRESS: bat combat rebuilt from the user's reference videos; bat only, the axe is next).
  * Glide/teleport fixed (player.js): the attack advance fed back into the velocity (it snowballed to 15 m/s; she
    jumped). Movement now has one owner: locomotion velocity plus a bounded attack-advance channel. Stick movement is
    zero while the attack clip owns the legs. The assist turn eases in over the wind-up.
  * Bat combo = mocap clip `bat_combo_mc` (assets/yola_combo.glb + clipdata), made by tools/mocap (see its README):
    forehand / backhand / spinning finisher, chained on the same clip. The left hand goes on the handle by IK after
    blending. The bat has its own impact crack (one per frame), and the whoosh is timed to each strike.
  * Tools: the combat lab (combat.html?lab=bat) and the Rig Lab (viewer.html, combo + reference video + weapon selector).
  * Measured: grip contact <=2 cm through a held combo; bat hit grid 34/42 (open) and 33/42 (wall); 12-zombie crowd:
    no double hits, hit-stop <=0.114 s per swing, largest move step 3.2 cm.
  * recordings/: bat_combo_before_after.mp4 and the reference-vs-game pair sheets.
  * NEXT: review the latest clip (image-plane crouch, foot contacts, retuned keys) in the viewer against the
    reviewer's list (crouch/lean, finisher low-to-high, backhand contact in front, bat vertical at the reset). Then
    re-record, a phone test, and the same workflow for the axe. Optional upgrade: GVHMR/WHAM (needs SMPL registration
    by the user).
- 2026-10-15 (round 11, bat only; uncommitted until the user says): the latest mocap clip checked against the video and fixed.
  * Found by measuring (Rig Lab, rendered shoe soles): feet floated 10-30 cm for most of the combo with knees locked straight
    (scale from hip height), the floor was tilted 3 deg (rest-skeleton "up"), knees caved inward (tracker depth), and in the game
    planted feet skated up to ~10 cm/frame (the backhand's 0.6 m advance cut to ~30% to stop short of the zombie, and the
    blends in from / out to idle).
  * Fixed in tools/mocap/retarget_mocap.py (see its README "Round 11") and with a runtime foot lock + clavicle reach in
    render/clipchars.js. Contacts per frame are exported in clipdata (cL/cR).
  * Measured after: one foot on the floor in every frame except the forehand hop (as in the video); planted-foot slide median
    <1 cm/frame, worst ~2 cm/frame (the finisher's pivot); left hand <=2 cm from the handle through all three strikes (was up to
    7.4); simulated vs rendered bat <=3.3 cm in every damage window; same at 30/60/120 fps. Hit grid 32/42 open, 31/42 wall (was
    34/33: two cells at the far left edge lost when the bat moved into her reach). Held combo still hit, hit, kill (4 seeds).
    Crowd of 12: no double hits, hit-stop <=0.114 s per swing.
  * recordings/bat_combo_before_after.mp4 (side view + gameplay camera at phone size, last commit vs now) and
    recordings/bat_combo_vs_reference.png (20 frames, clip vs video).
  * Remaining vs the video: the finisher wind-up leans less (video ~25-50 deg forward, Yola ~20); Yola is stockier, so the
    crouch reads shallower. Not tested on a phone.
  * USER REJECTED the look (full-size Rig Lab frames: contorted arms, torso facing the camera instead of the target,
    inhuman wrists; "following the skeleton isn't viable"). Kept: the foot lock, the clavicle reach, the measuring
    helpers and tests. The retargeted clip itself is NOT the way forward (see round 12).
- 2026-10-15 (round 12, bat only): a new, reusable foundation for weapon holds. Read WEAPON_HOLD_PROCESS.md first.
  * Process: WEAPON_HOLD_PROCESS.md (the procedure for every held weapon):
    - The weapon is placed by a solved grip: the shaft through the fist centre.
    - Body animation first, then the weapon, then the support hand. Human joint limits.
    - Collision is checked against her skinned mesh.
    - A review gate: full-size 8-angle grip sheets, then a 1x video watched before reporting.
  * Hold toolkit tools/hold (Blender 5.2 headless):
    - calibrate.py writes assets/hold/yola_hands.json: fist centres from the curled fingers, elbow hinges, capsules.
    - holdcheck.py checks every frame: grip, joint limits, weapon and arms inside her body.
    - gripsheet.py renders 8 views around the hands, full views, skeleton overlays and capsule cages.
    - tools/labcheck.js gripSheet() lays out one page per frame with the numbers.
    - Proven on raw bat_idle + bat_swing (Mixamo):
      - The bottom (left) hand grips throughout. The top hand is 4.6-6.7 cm off the bat and opens in the follow-through.
      - Mixamo wrists exceed human limits (the X Bot source itself bends 65-96 deg sideways).
      - The bat goes through her big head in the stance.
  * Reference footage, re-read with the user:
    - Yola frames 71-85 are a BUTT STRIKE (knob-first), not a backhand swing.
    - Clip 1 (front three-quarter) is the second angle of the same combo. Clip 13's second half is NOT a replay (it's the
      finisher close-up, then idle).
  * Weapon tracking pipeline tools/track (README.md there):
    - frames.py, sync by contact frames + syncsearch.py, track2d.py (rigid-bat 2D tracker), batfix.html (the user's
      large-frame correction page), solve3d.py (two-view rigid-bat + body solve), overlay.py.
    - The user corrected 138 frames of clip 13 and 169 of clip 1.
    - Result: tools/track/data/bat3d_combo.json, Yola frames 1-165. Both views agree within a median of 12-15 px.
      Bat = 1.62 torso.
    - Video: recordings/bat3d_both_clips_overlay.mp4.
  * Measured sync: clip 1 = clip 13 + 70-72 (forehand), +80 from the upright hold on.
  * NOT DONE / NEXT:
    1. The finisher: clip 13 cuts away at 184. Track it from clip 13's close camera (~186-215) or clip 12's back view,
       paired with clip 1 (~262-300).
    2. Build Yola's bat combo from this:
       - The 3D bat path is the primary; her hands are fitted to it by the hold toolkit, with joint limits.
       - Body: mocap swings (Mixamo bat clips) retimed to the reference, or Blender-authored poses, with the torso turn
         taken from the 3D solve.
       - Then the checker and the grip sheets, then the game.
    3. Then the axe through the same process.
  * Uncommitted-then-committed: round 11 changes (rejected look) and round 12 tools are in separate commits.
- 2026-10-15 (round 13): the video-tracked bat combo was DROPPED; moves now come from free animation libraries, and the
  user picks them in a new Move Library page.
  * Why the video path was dropped:
    - The two reference cameras face each other (clip 13 behind her, clip 1 in front, ~150-180 deg apart) and both
      orbit, so depth was unobservable. The solve flattened her hands into her torso.
    - A re-solve with the real camera angle plus hand priors fixed the depth (tools/track/solvecheck.py), but the
      MediaPipe skeleton on the faceless mannequin is wrong in places, and the user called it.
    - The work is kept: tools/track/{hands_on_bat,solve2combo,dummy2d,solvecheck}.py and the solve3d.py options
      (yaw_init, init_from, hands, w_hands, w_front). The user marked the finisher frames in batfix.html (now with
      clip 13's close camera and clip 1 up to 310).
  * Libraries downloaded (raw files OUTSIDE the repo, in the session scratchpad; the zips are in ~/Downloads):
    - Quaternius Universal Animation Library 1 + 2, Standard editions (CC0).
    - Kevin Iglesias Human Melee FREE + Human Soldier FREE (royalty-free in games; raw files may not be redistributed).
    - KayKit Character Animations 1.1 (CC0).
    - Mixamo's export queue was stuck all afternoon; its 7 requested clips never arrived.
  * New tools (tools/anim):
    - import_lib.py retargets any of these rigs (ue / kevin / kaykit / mixamo bone maps) onto Yola. blender/retarget.py
      now carries target bones the source lacks.
    - assemble.py joins retimed pieces with cross-fades.
    - export_lib.py writes assets/moves/yola_moves.glb (97 clips on Yola) and catalog.json (source, licence, weapon group).
  * Hold toolkit (tools/hold):
    - weaponpath.py: the weapon path from a clip's own two hands.
    - holdfit.py 'action' mode, plus:
      - per-hand grip direction with costly regrips (fingers open around them);
      - reversed grip only inside HOLD_REVERSE_OK spans;
      - clavicles capped at 18 deg;
      - weapon pushed forward out of her deep torso;
      - wider arm-vs-body test.
    - holdlib:
      - wrist flex/deviation are measured in the twisted forearm frame;
      - per-side forearm-twist limits are measured from 4440 frames of real mocap (L -150..60, R -60..140);
      - helper refactor: body_sets / inside.
    - export_rig.py writes assets/hold/yola_rig.json.
  * The library-built bat combo (recordings/bat_combo_library_v4.mp4) was superseded the same day. The user prefers the
    Quaternius combos (Sword Heavy Combo, Sword Regular Combo) as-is for the bat and sledgehammer, so its cleanup was
    frozen.
  * New weapons from the user's Renovation pack: assets/weapons/{sledgehammer,crowbar,chainsaw}.glb.
    - assets/moves/weapons.json holds grip frames for all 8 weapons, measured from the models.
    - weapons_hold.json has hold sheets for the new three.
    - Check image: recordings/weapons_check.png.
  * Move Library (moves.html, src/moves.js, dist/moves.js; http://localhost:5173/zombie/moves.html):
    - Yola plays every library move, grouped by weapon, with any of the 8 weapons in either hand
      (roll/slide/flip/closed fists, speed).
    - "Use in game" panel:
      - verdict good / maybe / no;
      - any number of weapon uses, each with a reason and the viewer settings;
      - an overview of weapons with no attack or several attacks.
    - Saved to shots/move_selection.json (git-ignored: copy it into the repo when the selection should be kept).
  * NEXT: the user sorts the moves. Then each chosen attack goes through the hold fit for its weapon (grip sheets + 1x
    video) before it goes into the game.
- 2026-10-15 (round 14): the weapon test arena, zombie spacing / pacing / telegraphs, the zombie scratch, and the
  Hospital Outbreak texture kit on Floor 3. The user sorted 65 moves in the Move Library; the game's own melee combo
  stays as it is for now.
  * Weapon test arena: combat.html?mode=arena (also "Weapon test" in the pause menu). src/arena/testarena.js.
    - The "⚔ Attacks" panel lists, per weapon, the game's own attacks plus every Move Library pick (good / maybe, with a
      weapon use; gun reloads left out) at the speed / hand / roll / slide it was judged with; speed chips 0.5-1.5x.
    - Each pick is built from its clip on Yola (assets/moves/yola_moves.glb): posed frame by frame with the weapon
      placed as drawn, giving the hit path, the damaging windows (where the business end moves fast: Sword Heavy Combo
      4, Sword Regular Combo 3, each hits afresh) and her forward travel (root motion when over 0.3 m).
    - Weapon profiles (damage, impact, blunt / blade / unarmed, sever chances) in testarena.js PROFILE.
    - Zombie buttons (3 dummies that come back, 1 / 3 / 6 live, clear), "Yola can't die", wedges on/off, and a
      "How does it feel?" rating + note per attack, saved to shots/arena_feel.json (and this browser).
    - The picks are read from the newest of shots/move_selection.json, assets/moves/selection.json (the shipped copy,
      refreshed this round) and the browser's own Move Library copy.
    - Engine: weapons.js TEST / TEST_ATTACKS; player.js multi-window strikes (A.windows); sim.js A.kind / A.minY;
      YolaView.addAttackClips / setTestWeapon / placeTest (the move library's fist-frame weapon placement, closed fists).
    - All 26 weapon picks connect with the dummies (node checks in the session); bat idle is a stance, not an attack.
  * Zombie AI (core/zombies.js, sim.js updateEngagement; tuning panel "Enemies"):
    - Spacing: only zombieEngage (2) nearest standing zombies within 7 m may close in and attack; the others stop at
      their own 2.0-2.7 m ring facing her and now and then walk along it away from their neighbour
      (recordings/zombie_spacing_ring.png).
    - Pacing: each attack started holds the next one off by zombieAttackGap (0.75 s x 0.8-1.3); cooldown after an
      attack 0.6-1.2 s (was 0.35).
    - Telegraphs: the lunge wind-up is 0.62 s (was 0.52); a red floor wedge shows the exact reach and width and fills
      over the wind-up, flashes on the strike (render/telegraph.js); the body warms to red.
    - The scratch (Quaternius UAL2 Zombie_Scratch, retargeted onto each zombie skeleton by tools/anim/zombie_clip.py ->
      assets/zombie-{nurse,patient}-scratch.glb): used inside ~0.9 m (and 25% from 0.92 m), 0.42 s wind-up, 8 damage,
      reach 0.98 m, wide (+-72 deg); armless or crawling zombies keep the lunge (recordings/zombie_scratch_telegraph.png).
  * Hospital Outbreak texture kit v1 (assets/hospital_outbreak: the five surfaces as JPG, the three decals as 512 px
    WebP; 1.3 MB instead of 12 MB): Floor 3 only, switched on at the reveal with the opening's blood (setBlood ->
    Arena.setOutbreak), so the clean opening is unchanged.
    - Room recipes from the kit (OB_ROOMS in render/arena.js); floor tiles 0.75 m (one image = 3 m), walls one square
      repeat per 2.7 m height, horizontal only; wall faces painted per the room they face.
    - 15 hand-placed blood marks (OB_BLOOD): handprints by doors at hand height, the stretcher drag in the OR, one
      concentrated splatter in Maintenance, light smears elsewhere, fighting lanes clear.
    - +14 draw calls, fewer triangles than the clean look (Room 1 view). Plain repeat (not mirrored): the seams barely
      show. Cut-away walls squash the wall image with them (the blue band stays proportional).
    - recordings/outbreak_textures_floor3.png.
  * NOT verified on the phone: frame time with the textures, the arena panel by touch, how the AI feels in play.
  * Follow-up (the user: melee hits felt choppy): the melee hit slow motion is off (tuning meleeHitPause = 0, its own
    slider; gun hits keep hitPause). The real freezes were shaders compiled on first use mid-fight (a limb cut off:
    70-270 ms; the first bat hit: 28 ms): main.js warmPrograms() now compiles everything at load, with hidden pooled
    objects shown (lights left exactly as they are, since programs depend on the light count), unskinned copies of each
    zombie view's materials (as sever bakes them), the arena's weapon models preloaded, and one shadow-map frame. After:
    no program compiles during play; hit frames 5-15 ms on the desktop (axe frames with many cut pieces and bodies on the
    floor still reach 25-35 ms). Not measured on the phone.
  * The weapon test arena shows the outbreak surfaces too (panel switch "Floor 3 outbreak textures", on by default,
    remembered): the combat wing's operating room gets the clinical recipe, its hall the corridor one, six blood marks
    (OB_WING_ROOMS / OB_BLOOD_WING in render/arena.js; built on first use). recordings/outbreak_textures_arena.png.
- 2026-10-15 (round 15): two new zombies from the user's Tripo models (big+black+lady, big+guard), built by
  tools/anim/build_zombie.py -> assets/zombie-sprinter.glb, assets/zombie-guard.glb (21 / 24 clips: the Mixamo zombie
  set, UAL1 Sprint_Loop, UAL2 Zombie_Scratch / Hit_Knockback, and for the guard UAL2's shield clips).
  * The lady's clothing stuck to her hands: checked by eye in Blender (sprint, side views): both cargo-pocket flaps were
    weighted 25-40% to her finger bones, so they stretched out in strips with every arm swing. build_zombie.py
    --fix-hands re-weights vertices below the elbow that sit nearer the thigh or torso than the hand (107) from their
    clean neighbours; re-checked in Blender (sprint, scratch, stumble-fall, get-up) and in the Rig Lab from the exported
    GLB (recordings/sprinter_weights_before.png / _after.png). The guard has none (checked walking in the Rig Lab).
  * Both are in the Rig Lab (viewer.html) next to the Mixamo reference.
  * The sprinter (core/zombies.js KINDS / sprinterChase / tumble): 1.5x health, 2.0 m (15% bigger than first built, the
    user's call), spots Yola in sight within 12 m, a beat (scream), then charges at sprinterSpeed 3.9 m/s (Yola runs 3.3),
    turning only sprinterTurn 1.5 rad/s and not at all inside 1.6 m. She runs through: a hit is a hard shove aside;
    a side-step when she is ~1.8-2.8 m away makes her miss and run ~1.8 m past, brake and come round slowly (measured);
    too late or too early and she hits. Into a wall, a prop or a zombie at speed she trips: stumble_fall frames 40-90
    onto her back, then standup_back (she sits up on her backside, then stands). Close in: the normal attacks.
  * The guard: 2.6x health, 0.6x pace, 1.8x damage, 0.4x knockback, rarely floored, 2.05 m; walks with UAL2's shield
    hold on the upper body and a stand-in bed-panel shield (render/clipchars.js makeStandInShield) until the real one is
    modelled. Neither new zombie is modular (no limbs come off yet).
  * Ragdolls (all zombies): the body may no longer fold shut (custom.js: the neck keeps 0.72-0.88 of its distance from
    the pelvis, hips, knees and feet); the parts' radii scale with a per-type girth (sprinter 1.7, guard 1.4) so limbs do
    not sink into a big body; heavy bodies are thrown less far. recordings/sprinter_ragdoll_after.png, guard_ragdoll.png.
  * Arena buttons "Sprinter" / "Big guard"; the encounter's waves 3 and 4 include them; tuning: sprinter speed / turn.
- 2026-10-15 (round 16, the user's notes after trying the new zombies):
  * Library combos stop where you stop (testarena.js splitCombo): a multi-strike clip becomes one attack per strike, cut
    between strikes, chained on the frame the last one ends; tap once = 1 hit, each further tap (or holding) adds the
    next (Sword Heavy Combo: 1-4, checked in the sim).
  * Downward strike at a zombie on the floor (knocked down, tripped or crawling): weapons.js groundAttack (Yola's t_chop
    with the weapon's profile) replaces the combo opener when Sim.groundTarget finds one in front and nothing standing
    nearer; bat, axe and every arena weapon (bat on a floored dummy: 100 -> 13).
  * Feel: a faint additive swing arc on every melee weapon, fading at its tail and stronger with speed (fx.js), and a
    hit flash + sparks + dust on every blow (fx.hitFlash).
  * Sprinter: turns 0.9 rad/s at speed (was 1.5; saved tuning for it resets, tuning v3), stops steering inside 2 m;
    a melee blow or shotgun blast mid-charge trips her; her charge hit knocks Yola flat.
  * Yola knocked down (player.js knockDown, 'down' action: thrown back, untouchable, gets up ~2.9 s later):
    assets/yola_extra.glb (tools/anim/yola_clips.py: the Mixamo knockdown + stomach get-up retargeted onto YOLA).
    recordings/yola_knocked_down.png.
  * The guard's slam: KayKit Melee_1H_Attack_Jump_Chop (a leap and an overhead smash; its hip rise halved at load),
    chosen at 1.3-2.4 m every 4-6.5 s: 0.95 s wind-up with a wide red wedge, a 1.4 m leap, the smash (1.3x his hit,
    knocks Yola flat; dust ring, shake), 1 s recovery. build_zombie.py reads KayKit clips (--kk). The first KayKit
    choice (2H chop) was rejected on sight: a twist across the body, not a slam. recordings/guard_slam.png.
  * Lighting looks (render/looks.js; the ☀ button cycles them, remembered; a toast shows the frame rate): Standard, AO
    (GTAO contact shadows), glow (bloom), AO + glow, Cinematic (+ grade and vignette), Crisp shadows (2x shadow map),
    Performance (no shadows). Desktop cost on Floor 3 (ms/frame, incl. sim): 16 / 28 / 19 / 27 / 30 / 12 / 13.
    recordings/looks_standard_ao_cinematic.png. Not measured on the phone.
