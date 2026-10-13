# First milestone checklist (movement / shooting / melee benchmark)

Status: PASS = verified with the evidence named; PARTIAL = works with a known gap; OPEN = not done / needs you.
Evidence images are in `zombie/shots/` (regenerate with the `game.*` test hooks in `src/main.js`).

| # | Item | Test | Evidence | Status |
|---|------|------|----------|--------|
| 1 | Restorable baseline | `git tag baseline-supplied`; hospital code untouched | git log | PASS |
| 2 | Separate combat entry | `zombie/combat.html` | runs, no console errors | PASS |
| 3 | Hospital route still works | `dist/Yolanda-Specialty-Medical-Center.html` | loaded at session start; no shared code changed since | PASS |
| 4 | Tripo Yola + 2 zombie types in game | load combat.html | sheet-chars, bench30 | PASS |
| 5 | Mixamo clips retargeted correctly | side by side with Mixamo X Bot in Blender, same frames | hand orientation offset constant (0.0 deg drift); pistol stance, strafe, swing visually match | PASS |
| 6 | Feet match travel (no skating) | clip speed measured in Blender, playback rate = travel / clip speed | `CLIP_SPEEDS`, `locoWeights()` | PASS (verify by eye on phone) |
| 7 | Twin-stick: move + aim independent, retreat while firing | scripted retreat-fire | sheet-signature s1 | PASS |
| 8 | Pointer-id stick ownership, clear on cancel/blur/hide/pause | code review `ui/input.js` | needs a real two-thumb test | OPEN (phone) |
| 9 | Swap priority, no duplicate swaps, reload cancelled by swap | `player.js` state machine | sheet-signature s2/s6 | PASS |
| 10 | Pistol hits from the muzzle, walls block, once per shot | `sim.firePistol` | 4/4 hits in signature test | PASS |
| 11 | Bat hits follow the animated bat, swept, once per victim | rendered bat vs simulated bat | max error 6 mm hands / 3 cm tip; hits only at body height | PASS |
| 12 | Bat arc | dummy at 10 deg steps, 1.0 m | hits -40..+40 deg (gentle 20 deg melee assist), reach 1.3 m | PASS |
| 13 | Reactions follow hit direction; death falls along the blow | Mixamo flinch/stumble + back/forward deaths chosen by hit vs facing | sheet-signature s4/s6 | PASS |
| 14 | Zombie telegraph, no attacks through walls | windup clip synced to sim; LOS check at strike | code + encounter runs | PARTIAL (needs your eye) |
| 15 | Death + instant restart, calm practice mode | menu / death screen | HUD | PASS (desktop) |
| 16 | Tuning panel | Pause -> Tuning | all brief parameters exposed | PASS |
| 17 | Sound: shot, reload, swing, hit, miss, reactions, death; mute/volume | `audio.js` | synthesised placeholders | PARTIAL (functional, not final quality) |
| 18 | Performance 5/10/20/30 | desktop, hidden browser pane, 585x1266 @1.5 DPR, CPU+GPU-finish time per frame | 5: 1.1 ms, 10: 1.7, 20: 2.2, 30: 2.9 avg (p95 <= 7.2) ; 30 zombies = 296k tris after decimation | PARTIAL (no phone measured) |
| 19 | Phone test | user's phone, http://10.0.0.131:5173/zombie/combat.html | 2026-10-13: user reports it runs smooth; zombie walk looks OK | PASS (feel review ongoing) |
| 20 | Hospital presentation (dense rooms like concept) | - | the hall is still too open/sparse | OPEN |
| 21 | Modular dismemberment | deferred until the benchmark is approved | - | OPEN (by design) |

## Known defects (worst first)
0. USER-REPORTED: Yola's legs jitter while strafing with the pistol (likely strafe/forward/back clip blend weights flipping or clip phases fighting). Fix first next round.
1. The ward layout is a big open hall; the concept art has denser, furnished rooms. Needs a layout pass.
2. Pistol has no reload clip (procedural tilt only); hurt reaction for Yola is a procedural flinch, not a clip.
3. Mixamo zombie walk is slow; it is played ~3x to reach 1 m/s. Watch for a hurried look; a faster zombie walk clip may be needed.
