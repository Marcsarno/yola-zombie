# Arms through her body: clips for review (2026-10-17, Yola 2)

The user: "analyze any game clip where the arm clips through the body.. identify it to be for review".

**How it was found:** the Rig Lab's `__lab.bodyClipScan({ gun, clips, minDepth })` (src/render/bodyclip.js).
- **Coverage:** every clip the game uses, every frame. Each arm (the elbow end of the upper arm, the forearm, the hand and fingers) is tested against her real mesh: rays through her rest-pose skin, so the result is inside or outside, not a guess from bones.
- **Excluded:** the armpit and the sleeve's underside, which lie against her side by design.
- **Listed:** anything 2 cm or more inside her.
- **Run twice:** the clips alone (weapon: none), and the two-handed and melee weapons with their holds (the second hand's reach onto a handle can pull an arm in).
- **Confirmed by eye:** #1, #2, #4, #5, #7, #8, #9 (the arm or hand disappears inside her). The shallow ones (2-4 cm) are less certain from the pictures; judge them in the Rig Lab.

**Sheets:** `shots/armclip_review_1.png` to `_5.png`, 12 cases each in this order, each at its worst frame with the camera on the contact.
- **#**: the case number; **sheet** says which picture it's on.
- **depth**: how far inside her (cm).
- **frames**: how many of the clip's frames have any arm 2 cm or more inside.

| # | weapon | clip | worst frame | what | depth cm | frames | sheet |
|---|---|---|---|---|---|---|---|
| 1 | sledgehammer | ual_Sword_Heavy_Combo | 1 | Left upper arm in chest | 11.3 | 115/131 | 1 |
| 2 | chainsaw | kev_HumanF_AttackPolearm01 | 7 | Left upper arm in chest | 11.1 | 36/42 | 1 |
| 3 | axe | bat_swing | 40 | Right upper arm in chest | 11.1 | 11/60 | 1 |
| 4 | chainsaw | melee_horizontal | 67 | Left upper arm in chest | 10.8 | 66/73 | 1 |
| 5 | - | death_defeat | 64 | Right hand in right thigh | 9.9 | 178/204 | 1 |
| 6 | axe | t_chop | 106 | Right upper arm in chest | 9.2 | 171/198 | 1 |
| 7 | - | ual1_Roll | 27 | Right hand in right thigh | 9.2 | 26/45 | 1 |
| 8 | - | t_greet_04 | 6 | Left hand in left thigh | 9.0 | 85/85 | 1 |
| 9 | - | t_kick_02 | 31 | Left hand in left thigh | 8.3 | 25/42 | 1 |
| 10 | - | t_greet_01 | 37 | Right upper arm in chest | 8.2 | 78/106 | 1 |
| 11 | - | bat_swing | 39 | Right upper arm in chest | 7.9 | 15/60 | 1 |
| 12 | - | death_fall | 73 | Right upper arm in chest | 7.7 | 39/73 | 1 |
| 13 | - | t_chop | 34 | Left hand in left thigh | 7.6 | 167/198 | 2 |
| 14 | - | ual1_Dodge_Right | 13 | Right hand in right thigh | 7.2 | 11/40 | 2 |
| 15 | knife | ual_Sword_Dash | 5 | Left hand in left thigh | 7.2 | 11/48 | 2 |
| 16 | - | yola_getup | 69 | Right upper arm in right thigh | 7.1 | 33/181 | 2 |
| 17 | axe | gs_low_slash | 43 | Left upper arm in chest | 7.0 | 45/56 | 2 |
| 18 | bat | ual_Sword_Regular_Combo | 78 | Right hand in right thigh | 6.8 | 55/91 | 2 |
| 19 | - | ual_Sword_Regular_Combo | 78 | Right hand in right thigh | 6.8 | 55/91 | 2 |
| 20 | - | gs_low_slash | 56 | Right upper arm in chest | 6.7 | 39/56 | 2 |
| 21 | - | ual1_Dodge_Left | 4 | Right hand in right shin | 6.5 | 13/40 | 2 |
| 22 | - | pistol_strafe_run_left | 7 | Right upper arm in belly | 6.3 | 21/21 | 2 |
| 23 | - | tripo_idle | 162 | Left hand in left thigh | 6.1 | 369/369 | 2 |
| 24 | - | ual1_Hit_Head | 9 | Right hand in right thigh | 5.8 | 14/14 | 2 |
| 25 | - | ual_Sword_Regular_A_Rec | 1 | Right upper arm in belly | 5.7 | 21/30 | 3 |
| 26 | - | ual1_Hit_Shoulder_L | 15 | Right hand in right thigh | 5.4 | 9/17 | 3 |
| 27 | - | ual1_Hit_Chest | 11 | Right hand in right thigh | 5.3 | 5/11 | 3 |
| 28 | - | p_walk_strafe_left_plain | 27 | Right upper arm in right thigh | 5.1 | 20/29 | 3 |
| 29 | - | ual1_Hit_Shoulder_R | 16 | Right hand in right thigh | 5.1 | 11/16 | 3 |
| 30 | - | p_run_strafe_left_plain | 15 | Right hand in right thigh | 5.1 | 11/21 | 3 |
| 31 | - | pistol_strafe_run_right | 12 | Left upper arm in left thigh | 5.0 | 21/21 | 3 |
| 32 | - | yola_knockdown | 1 | Right hand in chest | 4.9 | 37/85 | 3 |
| 33 | - | ual1_Hit_Stomach | 21 | Right hand in right thigh | 4.8 | 7/21 | 3 |
| 34 | - | ual_Sword_Regular_B_Rec | 30 | Right hand in right thigh | 4.6 | 6/32 | 3 |
| 35 | - | p_run_plain | 22 | Left hand in hips | 4.3 | 10/22 | 3 |
| 36 | - | p_walk_strafe_right_plain | 17 | Right hand in right thigh | 4.2 | 18/29 | 3 |
| 37 | - | p_run_strafe_right_plain | 11 | Left upper arm in left thigh | 4.2 | 10/21 | 4 |
| 38 | - | t_box_02 | 21 | Right hand in left thigh | 3.9 | 18/85 | 4 |
| 39 | - | pistol_idle | 30 | Right upper arm in belly | 3.9 | 41/41 | 4 |
| 40 | - | pistol_walk_back | 22 | Right upper arm in belly | 3.8 | 11/32 | 4 |
| 41 | - | t_box_01 | 54 | Left forearm in belly | 3.7 | 60/67 | 4 |
| 42 | - | pistol_strafe_right | 11 | Right upper arm in belly | 3.7 | 19/19 | 4 |
| 43 | - | pistol_walk | 9 | Right upper arm in belly | 3.6 | 16/25 | 4 |
| 44 | - | p_run_back_plain | 3 | Left hand in left thigh | 3.5 | 6/20 | 4 |
| 45 | - | ual_SafetyVault | 16 | Left upper arm in belly | 3.5 | 4/23 | 4 |
| 46 | - | sg_reload | 40 | Right upper arm in belly | 3.3 | 13/100 | 4 |
| 47 | - | pistol_strafe_left | 14 | Right upper arm in belly | 2.7 | 8/19 | 4 |
| 48 | - | pistol_run_back | 14 | Right upper arm in right thigh | 2.6 | 9/17 | 4 |
| 49 | - | pistol_run | 2 | Right upper arm in right thigh | 2.5 | 4/23 | 5 |

## What stands out
- **The worst four are all the second hand on a two-handed weapon.** Its reach onto the handle drags that arm across her chest (#1, #2, #4; the axe #3, #6). The clips alone are clean there.
- **The weapon carries (kk_Melee_2H_Idle with the sledgehammer and chainsaw) are clean.**
- **The others come from the clips themselves:** hands sinking into the thighs (deaths, rolls, hits, greetings) and the gun arm pressing into her belly in the pistol walks and strafes.
