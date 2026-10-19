# Floors 7 / 6 / 5: a layout review before the lighting bake

(2026-10-18 night, combat chat, a planning pass for the user: "does this make sense? is this good? ... hallway then room,
hallway then room ... if you have a hallway you could just skip rooms. So I do kind of like the way we have it now".
Read from the v3 plans (shots/map_floor7/6/5_layout_v3.png) and the floors as built (shots/map_floor7/6/5_top.png).
Nothing changed yet. The maps belong to the maps chat (OPENING_MAPS_HANDOFF.md): building this goes there.)

## What works

- **One route through rooms, with loops.** Floor 7 goes out the long way (west, down, east) and comes back short (R7 ->
  the bar -> the OR). Floor 6 has an always-open route plus an optional breach. Floor 5 has two routes that both
  work in either direction. Nobody can skip the fights, and the return trip is quicker than the way out. That's the right
  shape: keep it.
- **Each floor has one clear goal, and the gates are things you can see** (the bar, the dead lift power, the case).
- **The special enemies get a room built for them:** the cafeteria and the lady's bay with room to dodge, the short
  ward for the guard.

## What's missing

1. **It doesn't feel like a hospital, it feels like a grid of halls.** Every room is a big box (12-17 m) joined by one
   door. Real hospital floors have a **corridor spine** and **small rooms** off it: toilets, a janitor closet, linen,
   a med room, an office. The small rooms are what make a big ward feel big.
2. **No toilets, no janitor closet** (they were in the pacing plan, never built).
3. **Floors 6 and 5 are mostly empty floor** (the top shots). Their furnishing plan exists (FLOORS_6_5_LAYOUT_PROPOSAL.html)
   but isn't in.
4. **The goals are all "walk there, press":** the radio, the power, the bar, the case, the record.

## The fix: corridors you can see but not take (yet)

A corridor gives the hospital feel. A **blocked** corridor keeps the room-by-room route the user likes:
- **The blocks:** a fire shutter, a barricade of beds, a collapsed ceiling, a door with a push-bar on the far side.
- **Seeing it matters:** you see down it (it reads as a hospital), but you can't use it on the way out.
- **It opens later, as a shortcut back:** the shutter rises when the power returns, you kick the push-bar from the far
  side, the lady smashes the barricade. That's the Resident Evil / Souls loop: the way back opens up as a reward, never
  a way to skip the way out.

The small rooms hang off the corridors:
- **Loot pockets:** ammo, a med kit.
- **A scare:** a zombie in a toilet stall.
- **Where zombies come from (the pacing plan's "motivated spawns"):** a door bangs and they burst out of the toilets or
  the closet, instead of appearing from nowhere.

### Floor 7: Restore the way down
- **The empty L between Supply, the Treatment ward and the Contractor store** (about 3 x 17 m and 2.6 x 14 m: the gap in
  the middle of the top shot) **becomes the staff corridor.** Its ends are fire shutters, closed on the way out.
- **Toilets (two stalls) and the janitor closet** off it, taken from the south side of Supply (a big room: it can give
  ~4 m).
- **The power becomes a two-step:**
  1. The panel in Lift Service is dead: the **fuse is in the janitor closet**.
  2. Then a **hold**: the breaker takes ~20 s to spin up while zombies pour out of the toilets and the closet.
- **When the power comes on, the lights come back room by room** (the lighting bake done twice, dark and lit), and the
  corridor's shutters rise: the quick way back to the OR. The lighting work and the goal become the same moment.

### Floor 6: Choose your approach
- The "open service passage" in the v3 plan was never built (it's empty space in the top shot). **Build it as the
  service corridor**, with the janitor closet and a toilet off it.
- **The weak wall into the lady's bay:** instead of a scripted breach, **the lady breaks it** when Yola dodges her charge
  into it. It teaches the wall-crash finisher (FINISHERS_PLAN.md) and opens the shortcut at once.
- Furnish it (the existing proposal), so the big rooms stop being empty floor.

### Floor 5: Match the sample to the patient
- **A toilet block in the empty space right of the Transfer hub** (below Arrival, about 6 m wide).
- **The guard's room (the short ward):** a few walkers around him so his first slam throws them (FINISHERS_PLAN.md:
  the fodder).
- **The records goal gets pressure:** while the record prints / the IDs are compared, zombies come out of the toilet
  block, so you hold the room or carry the fight back to intake.
- Furnish it (the existing proposal).

## Order

1. The user OKs this (or changes it).
2. The maps chat builds the corridors, the small rooms and the furnishing: Floor 7 first, the one already played.
3. The goals get their new steps (the fuse, the hold, the lady's wall, the records pressure).
4. **Then the lighting bake, per floor** (dark and lit for Floor 7), once each floor's walls are final.
