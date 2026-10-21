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

27. [x] **The route test**: one continuous run from the house to the boat (`full_*.webm`, about 15 minutes, every stop and
   objective, COMPLETE), driven only with stick and button input: walking by the game's own routes, shooting what it sees,
   pressing Use at prompts, letting every line and cinematic play. Nothing placed by hand. The driver was improved live during
   the run (going after the last looter inside the clubhouse, reaching the fuel prompt from the shore); the clubhouse's finer
   routing grid (14c) was applied to the running game when it was found. Sophie, the infected, every interaction and the
   ending all ran; the bot also plays the story through after every change.
27b. [x] **Sophie in play** (`sophie_all.webm`, the final code): she leads, Marc ignores her way to loot supplies, aims at
   nothing, circles a parked car, backtracks, then takes her way again; with an awake infected about. No jumps seen, no snapped
   turns, no left/right switching; off the phone's view only while Marc sprints away from her (she runs after him); the
   infected never closer than 0.9 m (one chasing Marc ran past her). Also `sophie_gate` (stop, reverse, the gate single
   file), `sophie_combat` (a fight), `sophie_lead`, `pete_key` (the key and the bargain). Matched before/after of the bargain
   framing: `bargain_compare.png`.
28. [x] Leak test: all nine stops sealed after every change. Performance (desktop, phone size, Medium): 31 awake infected at the
   horde, 5.3 ms simulation, 17.9 ms with the draw; the routing refresh 1.2 ms every 0.2 s.

## Not done / reported

- No "open the fridge door" move for Marc (the reach is used). No gesture for Sophie looking back while she leads beyond
  turning to face him (her idle). Report rather than fake.
- Not tested on a physical phone; the clips are from the desktop browser at phone size.
- `levels/` exports for the phone editor not refreshed (the design repo says not to edit them by hand; the export tool is
  `tools/leveldesign/export_hood.mjs`).
