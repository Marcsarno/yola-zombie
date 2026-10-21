# Chapter 2 polish brief (Marc, 2026-10-21)

Saved as given. Order: finish the current Chapter 2 story implementation first, then carry out this brief (inspect, make a
prioritized checklist, implement the Sophie behaviours and the targeted environment fixes, test them, fix regressions).
Preserve a working checkpoint before editing. If a real blocker prevents progress, explain it rather than claiming success.

---

After the Chapter 2 story implementation is working, perform a physical, functional and spatial consistency audit of the
playable level. Find and fix arrangements that look wrong, behave incorrectly or make no sense in the world. This is a cleanup
and correctness pass, not a request to add more decoration.

FIRST: inspect the entire playable route from the actual fixed gameplay camera at portrait-phone proportions. Capture baseline
screenshots and make a prioritized defect list before editing. Inspect relevant close-ups and animations too; distant
screenshots alone cannot verify how people use objects.

## PASS 1: OBJECTS AND PEOPLE

* Check placement, orientation, scale, floor contact, clipping and relationships between objects.
* Judge functional fronts and backs from the actual model, not assumed axes or object names.
* Where present, seated people must face the chair's usable direction, with their body supported by the seat. Check this while
  moving and turning, not only in the starting pose.
* Check hands against handles, feet against floors, people against seats, and held props against their intended grip. Verify
  doors open from their hinges and do not swing through people or furniture.
* Furniture must have a plausible purpose and arrangement. Chairs should relate sensibly to desks or tables. Storage and
  equipment need usable access. Deliberately overturned or abandoned furniture is fine when the surrounding scene makes that
  clear.
* Inspect interaction and animation alignment as well as appearance. Do not rotate an entire character or asset to hide one bad
  attachment and break everything else.

## PASS 2: ENVIRONMENT AND ROUTE

* Every important route blocker must visually justify being impassable under this game's established movement rules. A lone
  tire, tiny box or knee-high prop must not act like a solid wall across an otherwise open route.
* Replace weak blockers with believable, substantial arrangements using existing assets where possible. Do not merely enlarge
  random props. Keep collision aligned with visible geometry and preserve the intended route.
* Audit roads, paths, doors and encounter spaces for arbitrary clutter. For each suspicious object, ask: why is it here, how did
  it get here, and what does it contribute? Remove or relocate objects that have no convincing purpose.
* Preserve intentional wreckage, cover and storytelling. An unusual placement is not automatically a mistake.
* Keep enemies, pickups, exits and important interactions readable. Taller barriers must not hide essential gameplay behind them.

## PASS 3: REPLAY AND PROVE

Replay from the house to the boat after the fixes. Check companion movement, enemy navigation, collisions, interactions,
scripted camera moments and progression. Verify changes have not blocked Sophie, trapped enemies, hidden pickups or broken the
final sequence.

## GUARDRAILS

Preserve the approved story, dialogue, objectives, route, combat, character identities, working rigs and fixed-camera design.
Do not invent new mechanics or redesign the map. Prefer small, reversible fixes. Keep the mobile performance budget; do not add
expensive effects as a substitute for fixing placement.

## DONE WHEN

Every listed defect is fixed and rechecked, or explicitly reported as unresolved. Provide matched before/after gameplay
screenshots, a short list of changes, and the results of the route test. State anything you could not actually inspect or test.
Do not claim verification based only on code review, and do not keep changing already-correct areas just to fill three passes.

## SOPHIE: BELIEVABLE COMPANION AND SUBTLE GUIDE

Make Sophie feel like a frightened person accompanying Marc, not a robot following a fixed offset. Use a small, explicit set of
behaviors: follow, briefly lead, wait/look back, yield, seek safety, and scripted story actions. Her behavior must respect the
current objective and story state.

### FOLLOW AND MOVE NATURALLY

* Follow at a comfortable, adjustable distance, usually a few meters behind or slightly beside Marc. Choose reachable positions
  that remain readable in the fixed camera, not a rigid point directly behind his rotation.
* Smooth acceleration, stopping and turning. Match walking/running animation to actual movement. Avoid sliding feet, snapping
  rotation, constant tiny steps, circling and repeated left/right switching.
* Maintain a comfortable distance band: stop when close enough and resume only after meaningful separation. Do not endlessly
  correct her position while Marc stands still or aims.
* Use navigable routes around obstacles, not straight-line chasing. At narrow doors, yield and pass single-file. Never block
  Marc, interactions, exits or the camera's view of a threat.
* If stuck, replan and recover to a nearby valid position. Do not visibly teleport, walk through walls or skip a locked gate or
  story trigger to catch up. Report unrecoverable cases rather than hiding them.

### LEAD WITH INTENT

* At appropriate story beats, Sophie may move a short distance ahead toward the next known route point, then pause and look
  back. She guides one step at a time rather than running off to the final objective.
* If Marc explores or stops, she waits safely or returns to following. She must not trigger encounters or complete objectives
  while the player is elsewhere.
* Do not make her omniscient. She knows the places established in the dialogue, not every hidden pickup. She can lead toward
  the lit garage or clubhouse, but cannot bypass the required sequence.
* During combat, stop leading. Sophie is unarmed and frightened: stay out of Marc's firing line, retreat to reachable nearby
  safety and cower where appropriate. Avoid repeatedly crossing between Marc and enemies. She does not attack or require
  babysitting; preserve her protection until the scripted death.
* Reserve her unusually decisive movement for taking Pete's key. Preserve the key bargain, dock waiting, attempted escape and
  scripted death. Ordinary companion logic must not overwrite those scenes.

### SUBTLE GUIDANCE

* Use Sophie's position, facing, brief pauses and existing recorded directions as the primary guidance. Do not repeat dialogue
  constantly or interrupt important lines.
* Reinforce the next route with plausible lighting, visible landmarks and uncluttered sightlines. Judge these from the actual
  portrait gameplay camera.
* When an objective changes, or the player requests help or remains genuinely stuck, briefly show a small, restrained marker at
  the next reachable route point or interaction. No permanent arrow trail, giant floating icons or glowing path through walls.
  Use shape and contrast, not color alone. Fade it when the player follows the route or arrives.
* Do not treat stopping to fight or loot as being lost. Do not reveal undiscovered objectives. Offer an optional stronger
  guidance setting for players who need it.
* Reuse existing audio. Do not generate more paid voice lines for this pass.

### VERIFY IN PLAY

Test stopping, reversing direction, circling obstacles, narrow doors, looting, aiming, combat, backtracking and ignoring her
suggested route. Then test Pete's key scene and the entire dock sequence. Show gameplay clips, not only still screenshots.
Confirm no jitter loops, doorway blocking, premature triggers, missed dialogue or progression failures. Keep the mobile
performance budget and fixed camera. Use existing animations first; report missing gestures rather than faking them with
awkward whole-body rotations.
