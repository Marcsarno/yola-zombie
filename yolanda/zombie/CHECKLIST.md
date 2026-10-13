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
| 6 | Feet match travel (no skating), no leg jitter | gait phase shared by all blended clips, stride measured from foot plants at load; `game.footSlide` (8 directions x walk/run) and `game.footPops` (reversals, zigzag, sweeps) | slide 0.07-0.57 m/s walking, 0.14-1.1 running; worst foot jump <= 542 m/s^2 (normal swing ~300-400; the old loop hitch was 1636) | PASS (user: "strafing feels much better") |
| 7 | Twin-stick: move + aim independent, retreat while firing | scripted retreat-fire | sheet-signature s1 | PASS |
| 8 | Pointer-id stick ownership, clear on cancel/blur/hide/pause | code review `ui/input.js` | needs a real two-thumb test | OPEN (phone) |
| 9 | Swap priority, no duplicate swaps, reload cancelled by swap | `player.js` state machine | sheet-signature s2/s6 | PASS |
| 10 | Pistol hits from the muzzle, walls block, once per shot | `sim.firePistol` | 4/4 hits in signature test | PASS |
| 11 | Bat hits follow the animated bat, swept, once per victim | rendered bat vs simulated bat (leveled swing) | max error 6 mm hands / 2.5 cm tip; tip 0.76-0.79 m through contact (was 0.45) | PASS |
| 12 | Bat arc | zombie at 10 deg steps, 0.8 / 1.1 / 1.35 m, assist off | hits about -80..+60 deg (her right to front-left), reach 1.35 m | PASS |
| 12b | Bat impact | sheet_swingTop, sheet_knockdown, sheet_getup | directional large reactions, 50% knockdown + get-up (seamless handover), hit-pause 0.085 s (kills 0.12), camera kick | PARTIAL (needs your feel) |
| 12c | Pistol reload clip | sheet_reload | Mixamo reload, upper body only, synced to the reload timer; gun follows the hand | PASS (needs your eye) |
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
1. Zombie physics: knocked-back zombies do not bump each other; deaths are clips, not ragdolls; bullet hits use one flinch clip. Next: lightweight custom ragdoll + body-to-body impulses + per-hit-location reactions.
2. The ward layout is a big open hall; the concept art has denser, furnished rooms. Needs a layout pass.
3. Yola's hurt reaction is a procedural flinch, not a clip.
4. Mixamo zombie walk is slow; it is played ~3x to reach 1 m/s. Watch for a hurried look; a faster zombie walk clip may be needed.
5. Zombie GLBs are ~3.1 MB each (long get-up / crawl clips); trim if phone loading feels slow.

Fixed 2026-10-13: strafe leg jitter (cause: every looping clip held its first frame for one frame per cycle, plus unsynced blends and a wrong forward-right blend segment).
