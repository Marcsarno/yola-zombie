# Quaternius Universal Animation Library 1 + 2 (Source), bought 2026-10-17

CC0, same skeleton as the mannequin we already compare against. Local copies (git-ignored, assets/source/ual/):
- `UAL1_Full.glb` (120 clips), `UAL2_Full.glb` (134 clips); the `_RM` versions keep root motion (travel on the root bone)
- `UAL1_Source.blend`, `UAL2_Source.blend`: the original Blender files (every clip as an action)
- `Mannequin_F.glb` / `.blend`: a female mannequin, same rig, no clips of its own (the Rig Lab can play any clip on her)
- the free Standard files (43 clips each) are still there; every clip they share with the Source files is identical

## How to look at them (Rig Lab, beside the mannequin)
- just open the Rig Lab and pick Yola 2, Zombie patient or Zombie big guard: their test bakes load by themselves
  (viewer.js CHARS[].newPacks, assets/test_clips/ual*_full_*.glb, local files)
- the clip list is a side panel on the left (always open; "Clip list" button / H hides it): "★ NEW PACKS: <kind>" groups
  first (zombie moves & attacks, jump/slam/shield, run/walk/turn, dodge/vault/climb, fists & kicks, weapon strikes &
  chains, hits/falls/deaths, pick up/use/react), then the game's own groups; a find box; "only clips the game uses"
- "(currently used)" = the game plays that clip (read from dist/combat.js, so it follows the game)
- the "female mannequin" box swaps the reference body
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

## In the game now (2026-10-17)
Files: `assets/yola2_ual.glb` (Yola's add-on clips, skeleton-only, CC0 + one Mixamo), `assets/zombie_moves/<type>.glb`
(each zombie type's add-on clips), `assets/arena/` (the weapon arena's data, deployable). Built with
`tools/anim/yola2_build.py` (YOLA2_EXTRA_UAL1 / UAL2) + `tools/anim/test_export_clips.py`, and
`tools/anim/test_zombie_clips.py`.
- **Dodge** (Shift / the Dodge button): only while something dodgeable is coming (a lunge or pounce wind-up, the guard's
  jump-slam wind-up, the lady lining up or running her charge; sim.dodgeThreat). Across her aim a side dodge
  (Dodge_Left/Right, 1.9 m), along it a roll (Roll, 3 m); untouchable through its middle (core/player.js DODGE).
- **Vault** over low props (0.35-1.1 m high, at most 1.3 m deep) when she runs at one head-on (stick and run within 25 deg
  of square, over 55% of her run speed); SafetyVault (core/player.js VAULT).
- **Bat combo** strike by strike (Sword_Regular_A, B, C: the old combo clip is exactly these three): stopping after a
  strike plays its recovery clip (A_Rec, B_Rec) from the strike's last pose (render/clipchars.js recCur).
- **Leg strikes** (no button): a melee opener at a standing walker goes low 25% of the time (tuning legStrikeChance): the
  axe cuts the shin off (gs_low_slash, its path sampled from the drawn axe), the bat breaks the leg (UAL1 Sword_Attack
  turned 67 deg so its low end lands on the aim; Sword_Light_C never brings the bat below 0.52 m in front of her), fists
  slide-tackle (Slide_Start + Slide_Exit, ~3.3 m; a leg breaks 35% of the time). The zombie goes down and crawls. A bullet
  in a walker's shin takes it off half the time (legShotChance). The big two never lose a leg. Leg strikes go under the
  guard's shield.
- **Bat floor smash** at a zombie on the floor (Sword_Heavy_D frames 10-34).
- **Bat on her back** when carried, drawn over the shoulder with UAL1 Sword_Enter (?batdraw=0 turns it off). Sword_Exit
  (putting it back) is not used yet: the next weapon comes out in 0.3 s, too soon for it.
- **Zombies**: walk styles (Mixamo shamble / UAL 8-way zombie walk, side-steps when circling / UAL zombie run, a runner at
  2.5 m/s: core/zombies.js GAITS, 15% runners), short hit flinches for bullets and punches (UAL1 Hit_*), the **pounce**
  (Zombie_Bite: from 1.7-3.2 m, 0.75 s wind-up with a long narrow wedge, locked 60% in, a 0.32 s leap up to 2.5 m, the
  bite; a miss stumbles longer).
- **Guard**: the shield takes four blows (intact, hairline, hairline, heavy, broken; chips at each new stage), then his
  arms come off at the shoulder (130 hp each; the shield goes with the left), both gone: ENRAGED (faster, charges like the
  lady, no slam), then the head (35 hp). **Lady**: swells (belly, green pulse) under 35% hp and in the beat before she
  dies, then bursts into chunks (knocks Yola down inside 2 m, staggers her to 3.5 m), an acid pool for 5 s (hurts Yola,
  steams around zombies' feet). Their cuts are baked at runtime from the skin weights (no cut model, no wound caps yet).
- **Arena online**: it had no library weapons online (its data and clip bake are local-only); now its data is in
  assets/arena and the picked clips in yola2_ual.glb (Kevin Iglesias picks stay local only). Rig Lab: sledgehammer,
  chainsaw, knife (Move Library data sheet, fit sliders).

## Start / end (transition) clips in the packs
UAL1: Sprint_Enter / Sprint_Exit, Crouch_Enter / Exit, Crawl_Enter / Exit, Climb_Enter / Exit, Sitting_Enter / Exit,
GroundSit_Enter / Exit, Sword_Enter / Exit, PunchKick_Enter / Exit, Push_Enter / Exit, Counter_Enter / Exit,
Spell_*_Enter / Exit, Jump_Start / Jump_Land, Turn90_L / R. UAL2: Slide_Start / Slide_Exit, NinjaJump_Start / Land,
IdleToLay / LayToIdle, KipUp, Turn180_L / R, JogToFlip, the strikes' *_Rec recoveries (Sword_Regular / Light / Heavy
A-C, Melee_Hook, Melee_Knee).
Used: Sword_Enter, Sword_Regular_A_Rec / B_Rec, Slide_Start + Exit. Good next ones: KipUp or LayToIdle for Yola's
get-up (hers takes 1.7 s), Crawl_Enter when a zombie loses a leg (instead of the knockdown), Turn90 / Turn180 for turning
on the spot, PunchKick_Enter / Exit when the fists come out, Sprint_Enter / Exit if she gets a sprint.

## Interacting with things
Interact (a button, a door handle), PickUp_Kneeling (off the floor), PickUp_Table (off a counter), Chest_Open (a cabinet,
a crate), Push_Enter / Loop / Exit (a cart, a barricade, a stuck door), Fixing_Kneeling (repairing, hot-wiring), Consume /
Drink (eating, a drink), Bandage_Loop (healing herself), Counter_Give / Show (handing something over), Walk_Carry_Loop
(carrying a box), Idle_Torch_Loop / Idle_Lantern_Loop (carrying a light), OverhandThrow (a bottle, a flare),
Climb_* / ClimbUp_1m / 2m / StepUp (ladders, ledges). None is wired yet: the levels' Use button is the maps chat's
(core/level.js).
