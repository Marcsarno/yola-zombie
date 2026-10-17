# Quaternius Universal Animation Library 1 + 2 (Source), bought 2026-10-17

CC0, same skeleton as the mannequin we already compare against. Local copies (git-ignored, assets/source/ual/):
- `UAL1_Full.glb` (120 clips), `UAL2_Full.glb` (134 clips); the `_RM` versions keep root motion (travel on the root bone)
- `UAL1_Source.blend`, `UAL2_Source.blend`: the original Blender files (every clip as an action)
- `Mannequin_F.glb` / `.blend`: a female mannequin, same rig, no clips of its own (the Rig Lab can play any clip on her)
- the free Standard files (43 clips each) are still there; every clip they share with the Source files is identical

## How to look at them (Rig Lab, beside the mannequin)
- Yola: `viewer.html?char=yola2&extra=assets/test_clips/ual1_full_yola2.glb,assets/test_clips/ual2_full_yola2.glb,assets/test_clips/ual2_full_yola2_b.glb`
- patient zombie: `viewer.html?char=patient&extra=assets/test_clips/ual1_full_patient.glb,assets/test_clips/ual2_full_patient.glb`
- big guard: `viewer.html?char=guard&extra=assets/test_clips/ual2_full_guard.glb`
- test clips list first, grouped by file ("TEST: ... (not in the game)"); the "female mannequin" box swaps the reference body
- test bakes: Yola `YOLA2_ONLY=none YOLA2_EXTRA_UAL1=a,b` / `YOLA2_EXTRA_UAL2=a,b` with tools/anim/yola2_build.py, then
  tools/anim/test_export_clips.py; zombies `tools/anim/test_zombie_clips.py -- <zombie.glb> <ual.glb> <out.glb> <prefix> <a,b>`
- Rig Lab fix found on the way: "in place" pinned the mannequin's HEIGHT (its pelvis moves in a Z-up frame), so every
  mannequin jump/crouch looked flat beside Yola. Fixed (viewer.js pinRoot); earlier mannequin comparisons in place were
  missing the mannequin's vertical bob.

## Checked beside the mannequin (2026-10-17, front + side, 6 frames each)
Yola: SafetyVault, Melee_Combo, Dodge_Left/Right, Sword_Heavy_Combo, TreeChopping_Loop, Mining_Loop, Sprint_Exit, Jog_Left
- all follow the mannequin closely; Dodge clips START crouched (need a short blend in from the run)
- TreeChopping / Mining are ONE-handed in the source (free left hand): not a two-handed axe swing
Patient zombie: Zombie_Bite, Zombie_Spawn, Zombie_Run_Fwd, Hit_Shoulder_L, Crawl_Left
- all follow; the crawl's chest sits a little higher than the mannequin's (her arms are shorter); his head tips up a
  little more than the mannequin's in the hit (the zombies have no posture fix yet: render/posture.js is Yola's)
Guard: Sword_GroundPound, NinjaJump_Start, NinjaJump_Land, Shield_Dash: all follow

## Candidates by the user's ideas (2026-10-17)
| idea | clips | notes |
|---|---|---|
| smoother attack chains | UAL2 Sword_Light_A/B/C(+_Rec), Sword_Regular_A/B/C(+_Rec), Sword_Heavy_A/B/C(+_Rec), Melee_Hook(+_Rec), Melee_Knee(+_Rec) | each strike has its own recovery clip: stopping after any hit plays that strike's own recovery instead of a blend from mid-combo |
| fists (now Tripo t_box/t_kick) | Punch_Jab, Punch_Cross, Kick, Melee_Combo, Melee_Hook, Melee_Uppercut, Melee_Knee, PunchKick_Enter/Exit | |
| axe side swing (the one Mixamo melee clip left: bat_swing) | no true two-handed swing in either pack | Sword_Heavy_* / TreeChopping / Mining are one-handed |
| smoother running | Jog_* 8 directions + LeanL/R, Walk_* 8 directions, Sprint_Enter/Loop/Exit, Turn90_L/R, Turn180_L/R | diagonals fill the gaps between today's strafes |
| Yola dodge (make the lunge dodgeable by her) | Dodge_Left, Dodge_Right, Roll, Slide_Start/Loop/Exit | the zombie lunge already has a wind-up and floor warning |
| Yola vault | SafetyVault, ClimbUp_1m/2m, StepUp, GetOffWall_2m, JogToFlip | needs obstacles in the maps (the opening/maps chat) |
| zombie attacks | Zombie_Bite, Zombie_Scratch, (Melee_* on zombies) | |
| zombie movement | Zombie_Walk_* and Zombie_Run_* in 8 directions, Zombie_Idle_Loop, Turn90/180 | |
| zombie spawn | Zombie_Spawn (claws up out of the floor), Crawl_Exit, KipUp | |
| zombie hits / deaths | Hit_Chest/Head/Shoulder_L/Shoulder_R/Stomach (0.3-0.7 s flinches), Hit_Knockback, Death01/02, Crawl_* 6 directions + Enter | short flinches for bullet hits |
| guard jump-slam | NinjaJump_Start (crouch, leap, tucked at the top) -> Sword_GroundPound (from the air, hand smashed into the floor) or NinjaJump_Land | the slow-at-the-peak, faster-and-faster fall is a playback-speed curve in the game, plus extra height |
| Yola reactions / pickups | Hit_* (short), Hit_Knockback, KipUp, LayToIdle, Idle_Tired_Loop (low health), Bandage_Loop, Consume, Drink, PickUp_Kneeling, Interact, Chest_Open, OverhandThrow (a throwable) | |
| opening / cinematics (other chat) | Crouch_*, Crawl_*, Sitting_*, GroundSit_*, Idle_LookAround, Crying, Surprise, Idle_TalkingPhone, Climb_* | |
