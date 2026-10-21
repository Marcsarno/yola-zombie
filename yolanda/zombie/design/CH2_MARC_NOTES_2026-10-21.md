# Chapter 2 map: Marc's change list (2026-10-21)

Collected from his Blender notes. **Nothing is done until Marc says go.** Blender coordinates (x, y); the game's z = -y.

1. **Remove the two fence lines in the loop's middle island** ("they don't help or serve the game play").
   - `home_back_fence_privacy` .. `.010`: the east line, x 28.9, y -31.3 .. -7.5 (its collision `COL_block_home_back_0`).
   - `curve_west_yard_fence_privacy` .. `.005`: the west line, x 4.5 .. 6.2, y -19.3 .. -31.1 (its collision `COL_block_curve_west_yard_0`).
   - Not included: the barricade, sandbags and trash at the road end north of the loop (`home_curve_*`, `home_b05*`, the story's "way on"), unless Marc says so.
   - Effect: these are the walls between the home and curve stops, and between the curve stop and the road (zones.js `home` / `curve`). With them gone the zones and the leak test have to be redone so the stops stay sealed.
   - Source: blender/hood/ch2_map.py `seal_line('home_back', ...)` and dress_hood.py `seal_line('curve_west_yard', ...)`. The change goes in the scripts, not only in the .blend.
2. **Move the AC unit to the house wall on the right of the patio** (camera facing the back of the house south of the island).
   - `by_ac_unit.003` (and `COL_prop_by_ac_unit.003`) is now at x 36.9, against the wall on the patio's left.
   - The new spot is about x 28.8, y -32.1, on the same wall facing the same way. Today the gap between the patio cage (x 29.38) and the fence (28.9) is 0.5 m, and the unit is 0.95 m wide. It fits once item 1's fence is gone.
   - `by_hose_reel.001` (x 27.8 .. 28.85) moves about 1 m further right to make room.
3. **No bus; cars parked, not dumped in the road** ("if one is in the road.. that's fine.. but the majority should be parked correctly.. that goes for large parking area too").
   - Remove the bus (`curve_west_road_car3_bus_wrecked`, 2.6, -7.1). Nothing in the story needs it: only the zombie mark `z_curve_bus` is named after it, and the mark stays.
   - There are 20 placed cars today:
     - 9 are road blocks (seal lines in dress_hood.py / ch2_map.py: `curve_west_road`, `curve_west_gap`, `roadblock_s`, `grandma_road`, `home_south_road`).
     - 11 are loose. 7 of those are scattered round the big parking area (x 40 .. 78, y 60 .. 82). The others: the fiat and the rusty pickup in the loop, the hudson (50.7, -23.6), and the panel van (1.6, 41.2).
   - Wanted:
     - Most cars in driveways (the new `ch2_drive_*` pads and the old kit driveways), straight and nose-in or reversed in.
     - The parking area's cars in its bays, in rows.
     - At most one or two left in the road.
   - Effect: where a road block is made of cars, it still has to stop the player. Each one gets a non-car block (barricade, fence, jersey barriers, trash) or keeps one car plus other junk. Then the leak test is rerun.
4. **A row of large shrubs taller than Marc across the island's open end** (his blue arc on the photo looking at the back of the house, the house at the top).
   - The arc runs from the house's patio side, just past the rusty pickup's spot, down round the open end near the fiat, and back up to the west fence's end. Read from the photo (rough, to be checked on a top view before building), it passes about (35, -19) → (29.5, -14) → (20, -11.5) → (13, -12.5) → (7, -17).
   - So with item 1's fences gone, the shrubs close the back yard off from the loop road instead.
   - Height: Marc is about 1.8 m, so the shrubs should be about 2.2 - 2.6 m. Nothing on hand is that tall: `hedge_round` is 1.0 m and `shrub_dry` 1.3 m.
   - A new tall shrub asset is needed (Blender opened visibly first, as for every new asset). For a Florida yard that means a viburnum / ligustrum / podocarpus kind of hedge shrub: a few sizes, packed close so it reads as one thick row with no gaps.
   - The shrubs block the player (collision), and the leak test is rerun with them as the island's wall.
5. **The roundabout by the clubhouse** (centre about (9, 33)). It is part of the old ground's `roads` mesh (GROUND collection), with the thin grey `sidewalks` ring round its grass.
   - Smooth the joins: the two arms meet the circle at hard corners today. Those are the west arm toward the roadblock (about (1.4, 31.5)) and the east arm (about (15.9, 37.3)). Each gets a curved flare into the circle, with the road's lines following.
   - Edge the grass island with a real kerb and a ring of pavers inside it, in place of today's thin grey ring.
   - One small palm in the island: short and wide, not tall, so it never hides the clubhouse from the game camera. None on hand fits (the palms are 2.6 - 9.8 m tall).
     - A new asset: a sago / pygmy-date / dwarf palmetto kind of clump, about 1.5 - 2 m tall and 2.5 - 3 m wide.
     - Checked from the game camera on the way to the club.
6. **Remove the looters' roadblock on the left of the roundabout** ("I don't need that area blocked").
   - The pieces:
     - The padlocked gate `roadblock_gate_hood_fence_slat` .. `.002` (seal `COL_seal_roadblock_0`, tag seal:roadblock).
     - The barricade north of it, `roadblock_n_*` (with the `polish_panel` pieces there and `COL_block_roadblock_n_0`).
     - The cars south of it, `roadblock_s_*` (`COL_block_roadblock_s_0`).
     - The scripts: dress_hood.py `seal_line('roadblock_n' / 'roadblock_gate' / 'roadblock_s')` and ch2_map.py line 306.
   - Today's story never opens that gate (level.js has no openSeal('roadblock'); it was the old story's "leader's keys").
   - Effect: the west area (pool, lakeside, pavilions, playground, Grandma's front yard; zones.js `west`) opens from the club stop on, instead of only at the horde. zones.js STOPS for club / clubhouse / dock / shed gain 'west', and the leak test is rerun: west's own outer edges and the dock seal must still hold.
7. **The lakeside pavilion: smaller and more square, and a grill on its right** (`gazebo_large.007` at (-31.9, 21.0), the octagonal gazebo, 7.0 x 7.0 m, 6.1 m tall).
   - Swap it for a square pavilion of about 5 - 5.5 m. The first choice is the kit's own `pavilion_small` (5.6 x 5.6 m, 4.5 m tall, the one taken off the lakeside earlier); show Marc it in place first.
     - If it does not read as square or right, make a simple square one (four posts, a hip roof, a slab, a picnic table).
     - The colliders (`COL` tagged for the gazebo) are swapped with it.
   - Add one `by_grill` on its right as Marc looks at it (the east side, toward the palm).
   - The two grills already on its left (`ch2_bbq_grill`, `.001`, from the "two barbecue spots" note) stay, and move in to the smaller footprint. Ask Marc if he wants those gone and only the right one kept.
8. **The playground: one pad, bigger, and laid out again** (Marc's photo from the road, the lake at the top).
   - Why it looks "double lapped": two wood-chip squares overlap.
     - The `hood_play_pad` model (centre (-44.4, 5.0), turned -30°).
     - Under it, the square `playground` mesh (MARKS collection, x -50.6 .. -38.2, y -0.1 .. 10.4, square to the world, the old map's playground ground).
     - The fix: one pad only, square to the world, bigger. His blue box is about 1.5x today's, roughly 16 x 12 m, the long side along the lake.
   - The swing set (`play_swings`) goes along the back (lake) edge of the pad, running across, where he wrote SS.
   - The play tower with its slides (`play_play_tower`) goes below it, in the middle toward the road, in his box marked SL.
   - The merry-go-round, sandbox, benches and the fallen tree stay, re-spaced on the bigger pad. Their collision moves with them. The zombie marks `z_play_a` / `z_play_b` stay clear of the pieces.
   - "Have the grass stretch out more", and the red line over the water: read as the lawn reaching further toward the lake, the lake's edge pulled back to his red line along this stretch. That moves:
     - the water's edge and its collision (`COL_water_37` .. `40`, ...);
     - the shore sand in the masks;
     - the light bake.
     **Confirmed by Marc:** the grass extends out to the red line. The lake's edge is pulled back there; the new edge is drawn on a top view for his OK before building.
9. **Behind the clubhouse: a straight concrete wall, the dock road gate gone, two dumpsters and the shed in front of the wall** ("I think that's more realistic").
   - **The wall.**
     - The white fence round the dock field goes. That is the top run from the lake and the angled run down to the lot's corner.
     - In its place: one tall concrete wall (about 2.5 - 3 m, so it reads as a wall, not a fence) running straight across on Marc's yellow line.
     - The line starts at the lake's edge, west of the field. It passes just south of where the shed stands today (shed `ch2_shed` at (-8.6, 110)), between the shed and the dock road (y about 81), so roughly y 95 - 105, to be set on a top view.
     - It carries straight on east, over the woods north of the parking lot, to the map's east edge. Trees in its way and south of it come out.
     - New asset: a plain concrete wall section (panels and posts, a little weathered), opened in Blender visibly first.
   - **The X: the dock road's chained gate goes**, "should be able to freely walk".
     - The pieces: `dock_road_gate_hood_fence_slat` .. `.002`, seal `COL_seal_dockroad_0` (tag seal:dockroad), at the service road's lot end (27.3, 81).
     - Story effect: the dock stop's "Cut the chain" step goes (level.js stopDock, the `use('dockroad', ...)` line and Sophie's lead that waits on it). zones.js STOPS drop 'dockroad', and the dock area is reachable from the club stop on. Leak test rerun.
   - **Two dumpsters and the shed in front of the wall** (his DD and S, south of the line, east of the field's middle, near the dock road).
     - Two `dumpster` side by side, then the shed beside them.
     - The shed moves with everything the story keeps in it: `shed_door`, `shed_chainsaw`, `shed_shotgun`, `shed_gas`, its seal `shed`, its collision and the bake. blender/hood/ch2_dock.py places it.
   - Story check: the horde fight and the dock run (pour_fuel at the boat, the horde start about (-10.5, 100)) used the open field north of the line. With the wall, the field ends at the wall, so the horde's space and Sophie's routes (ROUTES.dock) are re-checked, and the bot and the stick replay rerun.
10. **A basketball court in the new space north of the parking lot** (his BB box: the lot's north-east part, between the lot's north barrier and the new wall).
    - The woods there are cleared up to the wall.
    - A full outdoor court: an asphalt / concrete slab with painted lines, two hoops on poles, a little wear. New asset, since only tennis and volleyball courts are on hand.
    - The lot's north barrier (the red-white blocks along the lot's top edge) opens in front of the court, so the court is reached from the lot. The new wall is the boundary behind it. Leak test rerun.
11. **The east side: clear the woods behind the east rows, one long east wall, debris at the tennis courts, and the barrier at the X** (Marc's top view: the loop at the top, the highway on the right).
    - Positions below were read off his photo (about ±10 m). Each is set on a top render with the lines drawn on, for his OK before building.
    - **Light blue: clear the woods behind the east rows.**
      - The area runs from the tennis courts' south edge down past the east rows, between the rows' backs and the new wall: about x 61 .. 99, y -3 .. -53, about 44 trees today.
      - All trees out but one. It becomes plain lawn, walkable, with the old woods' undergrowth and debris thinned to match.
    - **Black line: a tall concrete wall down the whole east side** (the same wall as note 9).
      - It runs from the tennis courts down the full length of the neighbourhood to the south end, between the houses and the highway, roughly x 105 at the courts to x 85 at the south end, following his curve.
      - It becomes the neighbourhood's east edge: the highway strip beyond it is out of reach.
    - **Red line: debris along the tennis courts' south edge**, "you can't sneak through the tennis courts": a junk pile line (pallets, a wrecked car or two, tyres, trash) closing the courts off (`tennis_court.001` at (83.1, 29)).
    - **The orange X: the barrier across the road south of the home row.** The pieces:
      - `home_south_fence_privacy` .. `.003` (`COL_block_home_south_0`);
      - the crushed sedan `home_south_road_car3_sedan_crushed_white` (`COL_block_home_south_road_0`);
      - the scripts: dress_hood.py `seal_line('home_south_road', ...)` and the home_south fence line.
      **Confirmed by Marc:** remove that gate.
    - Effect: the home stop opens south, onto the south rows and the cleared east lawn. zones.js `home` and the leak test are redone with the new east wall as the edge, and the stops' order is re-checked so nothing ahead in the story is reachable early by mistake.

## Done (2026-10-21, after Marc's "go ahead and begin on these map edits")

All 11 notes are built, in blender/hood/ch2_notes.py (parts open, park, shrubs, roundabout, pavilion, playground, lake, walls,
east), ch2_dock.py (the shed moved, the dumpsters, the dock road's gate gone) and make_ch2_props.py (the new models
hood_shrub_tall, hood_palm_short, hood_wall_concrete, hood_court_basketball, exported to assets/neighborhood/props).

- Exported, the masks re-made and the light baked again (LIGHT_VERSION 2026-10-21c).
- The leak test is sealed at every stop. zones.js gains `south` and `north` for the ground that opened up.
- The story bot plays to COMPLETE.
- What changed from the notes as written:
  - 3: the hudson stays in the road, and the black van stays at the clubhouse kerb. The three car road blocks
    (curve_west_road, curve_west_gap, grandma_road) keep their collision, rebuilt in junk with no car.
  - 4: the hedge's ends stop short of the kerbs, as Marc drew them, so the back yard is still walked into round them.
  - 9 / 10: the lot's whole north fence went, not only the part in front of the court.
- Story effects (Marc may change the beats):
  - The home stop now reaches the curve and the south rows. The barricade beat ("Push the barricade over") still plays,
    but the barricade no longer shuts anything.
  - The cutters gate still holds the way to the club. Past it, the club, the west (pool, lake, playground), the dock field
    and the court are one area. The dock gate by the pool is bypassed by the lot and the dock road.
  - "Cut the chain" at the dock road is gone.
- Follow-up (Marc, after looking round in Blender: "two barriers that i wanted gone that are still there"): the survivors'
  barricade and trash across the top of the loop at x 28.9 (`home_curve`, `home_b05`, `home_b05_low`, seal `home`) and the
  old bus line's junk on the loop's west side (`curve_west_road`, `curve_west_gap`) are out too. The leak test is still
  sealed: the cutters gate holds the way to the club. "Push the barricade over" now has nothing to push.
- Follow-up, the courts ("no need to fence off the volleyball court... yes fence off tennis court", "remove all the debris and
  trash too", "get the trees and bushes off the volleyball court", "move it over some too"; ch2_notes.py `courts`):
  - The club's east trash line and the lot's two chain lines are gone, so the courts' ground opens onto the club and the lot.
  - The volleyball court moved 13.5 m east, by the tennis court (his red box). Its net's collision moved with it, and its
    old and new spots are cleared of trees and bushes.
  - The tennis court is fenced in on its own: its fence's 3 m gap on the south side is closed with chain-link.
  - No trash or debris is left on that ground, including the junk line along the tennis court's south edge. The fence
    line there (to the east lawn) stays: it keeps the chained gate the way to the club.
  - zones.js gains `courts`. The leak test is sealed.
- Follow-up, behind the clubhouse ("remove all the gate and fence behind the club house. keep the one around the pool";
  ch2_notes.py `clubback`):
  - The club's back fence is gone from the lake to the lot's corner (`COL_boundary_344` and its palisades and panels),
    with the club's dock gate (seal `dock`) and the trash line off the club's back corner (`club_back`).
  - The pool's own fence stays.
  - Story: the horde's runners that "come through the club's dock gate" now come across open ground there. The leak test
    is sealed.
- Follow-up, "all this junk too" (Marc's crosses on a view of the club's back):
  - The parking lot's whole west fence is gone (ch2_dock.py section 3: no gap for the road now, no fence) with its palisades,
    tyres and pallets.
  - Also gone: the back fence's leftover tyre stacks and the fence panels by the club's back corner (ch2_notes.py `clubback`).
  - The leak test is sealed.
- Follow-up, the lake's north-east corner ("round out the lake.. i put a red line.. and the yellow is vegitation sticking out
  of the lake"; ch2_notes.py `lakenorth`):
  - The lake's straight north shore and its hard corner at the dock's end are now one curve, swinging north and west from
    the dock (LAKE_N) over the strip by the dock field. The lake mesh is rebuilt from its outline.
  - The concrete wall now starts at the new shore (WALL_N from x -33.5). The strip's fence piece and the old north-edge
    water collision went (ch2_dock.py section 4), with what stood in the new water.
  - New water collision runs along the curve, on into the old east shore's.
  - New model `hood_reeds` (make_ch2_props.py): reed and cattail clumps in the shallows along the new shore.
  - The dock zone follows the new shore. The leak test is sealed.
- Follow-up, the boat and the dock:
  - "make sure the water doesn't clip through the boat": an unseen cover over the boat's open hull at its waterline (view.js
    `hullMask`) hides the lake inside it. It rides with the boat when it leaves.
  - The reeds were standing on the shore's sand (the shallows fade to clear), so they moved 3.5 - 7.5 m out, into dark water.
  - "double the size of the dock": the old 9 x 3 m pier (the old ground's `gen` meshes, its `dock` collision) is replaced by
    hood_dock (make_ch2_props.py), 18 x 6 m, its north edge where the old one's was, so the boat still lies along it.
    - Edge collision runs round its three sides on the water, and the shore's water collision is opened where it starts.
    - layout.js FLOORS 'dock' lifts people and zombies onto its deck, and the dock zone takes it in. The leak test is sealed.
- Follow-up: "the dock is a little too big.. make it 25% smaller.. and make sure the boat is set next to it.. not clipping":
  - The pier is now 13.5 x 4.5 m, its shore end and north edge where they were.
  - The boat's hull lies alongside it, 0.2 m off its north edge (measured on the models), with no overlap.
  - FLOORS 'dock', its edge collision and the dock zone follow. The leak test is sealed.
- Follow-up, "you can keep the palm .. but remove the trees between these buildings" (the gap between the B05 row and the
  east row, by the tennis courts; ch2_notes.py `gaptrees`): nine trees out (oaks, storm-bent, scraggly, a snag). The cabbage
  palm stays.
- Follow-up, "remove the stuff with the x on it.. and furnish that building thats cracked open the exact same way as my
  house" (B05's broken end unit off Marc's yard; ch2_notes.py `b05`):
  - Out: the fence panel across its broken corner (and the corner's block collision), the two fence pieces out on the lawn
    toward the east row, and the trash bags on the lawn.
  - In: Marc's own ground floor (hood_home: the living and dining rooms, the stairs, the kitchen, the garage) with its
    fridge (shut; only Marc's door swings), plus copies of his house's inside walls and furniture collision. They are
    turned into this unit: it is the same row model, so the rooms fit its shell, sunk 0.18 m with the damaged row.
  - The way in is the broken corner, into the kitchen. The 'help' wave still comes out of its garage, through the kitchen.
    The leak test is sealed.
- Follow-up, the club gate's line: "remove the stuff with an X .. and the fence circled in blue.. I want better quality
  fence.. maybe a taller chainlink fence, slighly taller than my character with barb wire. ... and trash out front... hap
  hazardly put together.. but better looking and harder to get over the top off" (ch2_notes.py `gatefence`):
  - Out: the two runs of panels left standing along the club's east side, and the gate line's slatted chain-link panels.
  - The new fence (make_ch2_props.py `fence_chain` / `fence_chain_b` / `fence_post`) runs from row 6's end wall to row 5's:
    - 2.3 m of see-through chain-link on galvanised posts, with a top rail and a loose bottom wire.
    - Arms leaning out over Marc's side carry three strands of rusty barbed wire, and a razor-wire coil runs along the top.
    - Two sections have a dent pushed in, and a KEEP OUT sign is wired on.
  - The new gate (`gate_chain`): the chained, padlocked double gate to match, in the same place with the same tag. The game
    now swings its leaves open when the chain is cut (view.js: the old gate's file name no longer matched, so it fell flat).
  - Junk is heaped against the fence on Marc's side: corrugated sheets and pallets leant on it, dumped sofas, tyres, trash
    bags, barrels, crates, a tipped cart, a broken picket section. The gate's approach is left clear, and the heaps have
    low collision so nobody walks through them. The fence's own 4 m collision is unchanged.
  - Blender: the chain-link materials now show the wire as see-through (they were grey sheets in the viewport).
