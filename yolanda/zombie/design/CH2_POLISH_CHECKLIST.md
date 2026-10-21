# Chapter 2 polish: the defect list and what was done (from design/CH2_POLISH_BRIEF.md)

Baseline: 2026-10-21, the game camera at phone size (375 x 812): shots `zombie/shots/base_*.png` (the route, free walk) and
`tour_*.png` (the story played through, every cinematic and objective change); the blocking lines measured in Blender (what
stands on each collider, how tall). Checkpoint before any change: commits 21040b0 / affa80e, and copies of hood.blend and
grammy.blend in the session scratchpad. Clips (`zombie/shots/*.webm`, local only, not in git): recorded from the game at 30 fps.

Status: [x] fixed and rechecked in the game, [k] checked and kept as it is, [~] partly / reported.

## P1: wrong or broken where the player looks

1. [x] **Old ground on the new loop road**: row 5's old driveways ran across the road onto the far lawn, and the old grass verges
   crossed the road and the stretched driveways (black and green stripes at the barricade). `blender/hood/ch2_polish.py`
   parts `leftovers` and `verges` cut them (the verges' mesh dissolved back to 12.8k triangles after the cut).
2. [x] **Weak blockers**: 15 blocking lines whose gaps were "closed" by knee-high fillers (tire stacks 0.6 m, pallets 0.45 m,
   sandbags 0.43 m, trash bags, boxes, a cart) with an invisible wall behind. Each gap now has the line's own panels (palisade,
   privacy fence, slatted chain-link, corrugated sheet); the fillers moved off the line to the walkable side, still there as
   junk (`ch2_polish.py blockers`). Biggest: `club_east` (21 m, between the gate and the clubhouse), behind the clubhouse, the
   lot's edges, the dock road's gate, the old roadblock, the west edge. Re-measured: one 1.4 m end left at the north fence
   by the dock (no filler there, off the route). Leak test: every stop sealed.
3. [x] **Grass growing on hard floors** (the neighbour's garage, the clubhouse porch, the courts): the ground masks now keep
   tufts off every model's own floor (`mask_hood.py` floors channel; Chapter 4 too).
4. [x] **The new roads and the dock pad baked black**: the bake left the remake's own ground meshes in the render, 3 cm over the
   light catcher, so they shaded it. `bake_hood.py` leaves them out; rebaked.
5. [x] **The fridge**: Marc reached for the fridge with the bat still in his hand, the door was open before his hand came up,
   and the shots framed his back and then an empty floor. Now the bat goes onto his back first, the door swings as his hand
   reaches, the shots are from inside the kitchen (no wall or Marc in the way). There is no "open a door" move for Marc: the
   reach (`hood_Interact`) is used; reported.
6. [x] **The radio in his hand**: during radio calls the walkie hung at his collar, 18 cm below his empty hand on the front step
   (it was placed before the game lifts him onto the step). Now placed after the lift: in his hand at his ear.
7. [x] **The call at the door framed Marc's back** for the whole call: now three-quarters from his right, face and radio.
8. [x] **Sophie knelt on Pete's back** to take the key (her spot was worked out while his body was still falling): she now
   runs to his side (0.75 m from his chest, the camera's side, from where his body ends up), turns to him, then kneels.
9. [x] **The two bargain shots** (Sophie's deal, Pete's key) were side-on two-shots that left both at the edges of a phone's
   narrow frame: over Marc's shoulder at her (over hers when a wall is behind him), both turned to each other.
10. [x] **The engine's horde shots** showed a bare play pad and then empty water: far infected were never drawn during a
   cinematic (the draw distance was measured from Marc, not from what the shot looks at), the low narrow framing caught one of
   them, and the woken horde stood still (no route to Marc with the dock gate shut). Now: drawn round the shot's focus,
   framed high and wide following the crowd, and they run for the dock gate (a rally point when they have no route to Marc,
   cleared when the gate opens next scene).
11. [x] **The infected had no routes after the house**: only the first stop had a navigation grid, so later waves only came at
   Marc when they could see him within 7 m. Every stop now has its own grid (1.2 ms or less per refresh on the biggest).
12. [x] **A wave spawned behind the yard fence** at the help stop, with no way to Marc; the stop waited on it for two minutes.
   Spawns now take the nearest spot (within 5 m) that has a way to him.
13. [x] **The shotgun could be taken through the shed's east wall** from outside (reach 1.0 m): reach 0.8 m, only from inside.

14b. [x] **A dead planter half across Marc's front door** (0.4 m left to pass, none for the infected's routes): moved to the
   other side of the door (`ch2_polish.py doorway`).
14c. [x] **Doorways lost in the routing grid**: the house's 0.97 m front door and the clubhouse's door were narrower than the
   0.4 - 0.5 m routing cells allow, so the infected (and route-following) could not path through them. The house and clubhouse
   stops route on 0.3 m cells (about 1 ms a refresh).
14d. [x] **The guidance marker pointed back** at the end of Sophie's route once Marc had walked past it toward the objective:
   it now points at the objective itself.
14e. [x] **Sophie froze beside a sleeping infected** (every way out counted as running past it) and stayed in hiding while Marc
   walked 10 m off: sleeping ones only count when she is right by them, the one beside her never blocks her way out, and when
   Marc moves off in a fight she runs to keep with him. She leads and hides only within what the phone shows round Marc.

## P2: checked close up and kept

14. [k] Marc's front door swings in against the wall, clear of the furniture and of James (`tour_001..008`).
15. [k] The shed's double doors swing out from their hinges, clear of the bench (`replay3_shed`).
16. [k] James at the dining table: hands at the backpack on the table, feet on the floor, headphones on (`james_check.png`).
17. [k] Marc standing in the boat as it leaves (`replay3_leave`).
18. [k] The clutter on the clubhouse's turning circle, the gate roundabout and the bargain street (boxes, cans, bags, fronds):
   left as it is. It is the trail of people who fled to the clubhouse (polish pass 1), it stands in no lane Marc must take,
   and none of it hides a pickup or a prompt.

## Sophie (`src/hood/companion.js`; the story's own scenes keep their scripted moves)

19. [x] **Follow in a band**: she stops 2.5 - 3.5 m from Marc and moves again only after a real gap (5.6 m), beside or behind
   him, keeping her side; at his pace, a little faster to close a gap. Clips: `sophie_follow`, `sophie_gate`. Measured on the
   gate walk (stops, reversing, the gate both ways): 5 stand/move changes in 21 s, 0 jumps, 0 snapped turns, 0.05 s in his line
   of fire, 0.08 s moving while he stood still.
20. [x] **Readable in the fixed camera**: her spot is kept on the portrait screen (across and down); she moves back when she
   has been off it for a second.
21. [x] **Yield**: out of his way when he walks at her; round him, never through him (1.5 m clear); never stopping in a doorway
   or a gap, or beside a prompt he needs; single file through doors (his own trail when a wall is between).
22. [x] **Safety in fights** (`sophie_combat`): to a spot behind Marc, away from the infected, not across his line of fire,
   never running through the fight to get there; cornered, she stays down where she is; cowers; back to following when it is
   over. Measured with five infected: 0.07 s in his line of fire, the nearest infected never closer than 9.6 m to her.
23. [x] **Lead with intent** (`sophie_lead`): at the barricade, the gate, toward the lit garage, toward the clubhouse and to the
   dock road's gate (`level.js ROUTES`: only what the dialogue gives her), a few metres at a time, waiting and looking back;
   following again if he goes elsewhere; never past the last point, so she starts nothing ahead of him.
24. [~] **Stuck**: no headway for 1.4 s, she takes his trail. Far off the screen (16 m+) she still closes up out of sight, but
   now onto his trail 13 m+ behind him (never past a gate he opened). In all the clips she never needed it (0 recoveries).
   Not tested: a deliberately trapped Sophie (no such place was found on the route).
25. [x] **Guidance marker** (`hint.js`): a small white-ringed dark diamond with the distance, for 4 s when the objective
   changes, on a tap of the objective line (7 s), or when genuinely stuck (45 s on the objective and no headway for 25 s); never
   while infected are awake within 14 m; it points at the next step of the way Sophie knows, else the objective's spot.
   Settings: "Stronger guidance" shows it whenever the spot is 8 m+ away and nothing is being fought.
26. [k] Her story scenes are as before: the rescue, the bargain, the key grab (now beside Pete), the dock wait, the engine, her
   death in the horde.

## Pass 3: replay house to boat

27. [x] **The route test, on the final build** (`final_*.webm` + `final_*_sheet.png`, one clip per stop): one continuous run
   from the house to the boat, every stop and objective, COMPLETE in 7 minutes, driven only with stick and button input
   (walking by the game's own routes, shooting what it sees, pressing Use at prompts, letting every line and cinematic play).
   Nothing placed by hand, no side-steps, no live patches. Two earlier runs today found item 34 (the looter in the wall) and
   item 36 (Sophie off the side of the screen), and the driver learnt to walk to the nearest standable spot in a prompt's
   reach (the boat's fuel, over the water); each fix was followed by a fresh run from the house. Sophie in that final run:
   off a phone's view 6.4% of the time she followed (13.7% before item 36), never more than 8 m from Marc except as a stop
   begins (0.9%). The bot also plays the story through (COMPLETE) after the last change. (The first replay, `full_*.webm`,
   was before today's fixes.)
27b. [x] **Sophie in play** (`sophie_all.webm`, the final code): she leads, Marc ignores her way to loot supplies, aims at
   nothing, circles a parked car, backtracks, then takes her way again; with an awake infected about. No jumps seen, no snapped
   turns, no left/right switching; off the phone's view only while Marc sprints away from her (she runs after him); the
   infected never closer than 0.9 m (one chasing Marc ran past her). Also `sophie_gate` (stop, reverse, the gate single
   file), `sophie_combat` (a fight), `sophie_lead`, `pete_key` (the key and the bargain). Matched before/after of the bargain
   framing: `ba_09_bargain.png`.
28. [x] Leak test: all nine stops sealed after every change. Performance (desktop, phone size, Medium): 31 awake infected at the
   horde, 5.3 ms simulation, 17.9 ms with the draw; the routing refresh 1.2 ms every 0.2 s.
29. [x] **Found in the matched Sophie run: she waited at her lead point off the screen** while Marc walked the other way (up to
   11 m off, about 15 s off screen), and once she stood close she could flick between standing and walking within a frame or
   two. Now she leaves the lead for following once she has been off his screen 1.2 s (or he is 8 m off) and takes it up again
   when he is back within 5 m of her way; she only stops once what moved her (his line of fire, off screen) is gone. Rechecked:
   the lead clip (`sophie_lead`, on screen the whole way, ends beside him at the gate), the matched follow run below, and the
   bot plays the story through to COMPLETE.
30. [x] **Two new panel runs at the far south edge (free walk only) read messy**: 8 palisade panels stood over the lines' own
   jersey barriers (0.81 m, under the "tall" cut so the blockers part took them for gaps). `ch2_polish.py jersey` takes them
   out (the panels in real gaps stay), `jersey_gaps` puts a jersey barrier cut to fit in the one real opening left beside them
   (1.3 m, where a tire stack had been), and `blockers` now counts jersey barriers as the line's own pieces. Leak test sealed;
   `ba_02_blockers.png`, bottom row.
31. [x] **Sophie looks back while she leads** (the brief's "wait/look back"; there is no such move in her set): her neck and
   head turn toward Marc on top of the move playing (actors.js `storyBody` `look`, up to 72 degrees, eased in and out): a
   glance over her shoulder every 3 s as she walks ahead, her eyes on him while she waits. `ba_sophie_lookback.png`.
32. [x] **The new map** (design repo, `design/chapter2_extras/extras_full.png`, proposal v5: rows 3 - 6 turned, rows S1 - S8,
   streets R1 - R4, the loop as a capital A, the barrier lines): `ba_00_new_map.png` sets it beside hood.blend rendered from
   above on the same grid, and the plan laid over the build. Everything on it is built except what the plan itself leaves
   open: the optional highway H1 and the two lake houses its README says need a decision.
33. [x] **The phone editor's copy** (`levels/hood` in the design repo) re-exported with `tools/leveldesign/export_hood.mjs`
   from this build (layout, ground, light, models, the editor's vendored modules). Written to the local clone only: not
   pushed, and the editor artifact not republished (both are Marc's call).
34. [x] **The clubhouse's second looter stood inside a wall** (`looter_b`, 14, -55, there since the original map): the back
   room's wall runs through his spot, no route reaches him and nowhere Marc can stand sees him, so the clubhouse objective
   (every looter down) could not finish; the re-run replay stopped there. `ch2_polish.py looter_b` puts him behind the bar
   (13.2, -53.8): crouched under its 1.1 m counter, 10.5 m of route from the door. Leak test sealed; the replay below.
35. [x] **Chapter 4, Grammy's peninsula** (the other half of the goal): `ba_ch4_grammy_map.png` sets the design repo's
   `grandma_map.png` beside grammy.blend rendered from above on the same grid, and the map over the build.
36. [x] **Found in the re-run replay: Sophie dropped off the screen's side when Marc ran across it** (off a phone's view 14%
   of the time she followed, 30% at the gate and Pete's stops): standing, she only set off once she had been off screen a
   full second or 5.6 m back, too late at his 3.3 m/s. Now, when he is running, she sets off as soon as where she would be in
   a moment is off his screen, and keeps going while that holds (off screen after 0.4 s at most otherwise). The matched walk:
   off screen 3.1 s -> 0.07 s.

## Evidence: matched before/after (zombie/shots, local only, not in git)

Before = the same spot or moment in the checkpoint before the polish (commit affa80e, run as its own local copy) or the
baseline tour; after = now. Same camera, phone size (375 x 812).

| Defect | Sheet |
| --- | --- |
| The new map (32) | `ba_00_new_map.png` (the plan, the build from above, the plan over the build) |
| 1 old ground on the loop road | `ba_01_old_ground.png` (barricade curve, by the pickup) |
| 2 weak blockers | `ba_02_blockers.png` (9 lines on the story's route + the far south jersey lines of item 30) |
| Sophie's look back (31) | `ba_sophie_lookback.png` (new: no before) |
| 3 grass on hard floors | `ba_03_floors.png` (garage floor, clubhouse porch) |
| 4 new ground baked black | `ba_04_black_bake.png` (dock pad, dock road, its gate) |
| 5 the fridge | `ba_05_fridge.png` (four matching moments of the cinematic) |
| 6, 7 radio and call framing | `ba_06_07_radio_call.png` |
| 8 Sophie on Pete's back | `ba_08_key_kneel.png` |
| 9 bargain two-shot | `ba_09_bargain.png` |
| 10 engine horde shots | `ba_10_engine_horde.png` (two matching shots of the continuous replays) |
| 14b planter at the door | `ba_14b_planter.png` |
| Sophie following (19 - 22, 29, 36) | `ba_sophie_follow.png` + clips `sophie_ab_before.webm` / `sophie_ab_after.webm`: the same scripted walk (run off, back, stop, circle; 33 s) with Sophie following, old build vs now. Off a phone's view 3.7 s -> 0.07 s; closest to Marc 0.03 m -> 1.5 m; in his line of fire 2.3 s -> 0.3 s; moving while he stands 9.2 s -> 1.1 s; snapped turns 2 -> 0; visible jumps 0 -> 0. With the story's lead left in (`sophie_ab_after_lead.webm`) she leaves the lead when he goes elsewhere (item 29). |

No picture pair (not a visual defect, or nothing to see in a still), measured instead: 11 infected routes (grids per stop,
refresh time), 12 spawn behind the fence (the stop no longer waits on it; bot run), 13 shotgun reach (0.8 m, inside only),
14c doorways (routes through the 0.97 m door), 14d marker direction, 14e Sophie freezing by a sleeping infected (a fault of the
new companion code found while testing, so there is no "before" in the old build). The old build had no leading, no marker
rules and no safety moves, so items 22, 23, 25 are shown by their own clips (`sophie_combat`, `sophie_lead`, `sophie_all`).

## Not done / reported

- Marc has no "open a door" move: at the fridge his reach (`hood_Interact`) opens it, timed so the door swings with his hand
  (item 5). A real door move is a new animation (the animation chat's work); reported rather than faked.
- Not tested on a physical phone: every clip and number is from the desktop browser at phone size (375 x 812). The iPhone
  check (High quality as the stress test) is Marc's.
- The phone editor: `levels/hood` is re-exported in the local design repo (item 33) but not pushed, and the editor artifact
  not republished; both wait for Marc's OK.
- `sophie_all`, `sophie_combat` and `sophie_gate` were recorded before items 29, 31 and 36; the final replay, the matched
  follow walk, the lead clip and the bot cover the changed code.
