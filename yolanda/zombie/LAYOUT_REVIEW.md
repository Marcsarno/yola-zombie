# Floors 7 / 6 / 5: a layout review before the lighting bake

(2026-10-18 night, combat chat, a planning pass for the user: "does this make sense? is this good? ... hallway then room,
hallway then room ... if you have a hallway you could just skip rooms. So I do kind of like the way we have it now".
Nothing changed yet. The maps belong to the maps chat (OPENING_MAPS_HANDOFF.md): building this goes there.)

**Superseded for Floors 6 and 5 by FLOORS_REDESIGN.html.** After this review the user decided:
- Floors 6 and 5 are too small: nine rooms each, like Floor 7.
- A blocked corridor, and a reception desk in the middle.
- A toilet on every floor.
- A cracked wall broken with the sledgehammer where it's introduced.
- Floor 7 stays, with additions.

This file stays as the record of which plans are current and why.

## Which plans are current (checked, because the first version of this review used old pictures)

- **The walls, doors and routes:** the user's own **Tiled v3 plans** (Downloads/Yola_Floors_7_6_5_Tiled_v3.zip, Oct 16;
  copies in shots/map_floor7/6/5_layout_v3.png). The floors were built from them on Oct 16 (18797ae), and **no wall has
  moved since**.
- **The room names, purposes and furniture:** redone on Oct 18 from Claude's proposals, approved by the user
  (FLOOR7_LAYOUT_PROPOSAL.html, FLOORS_6_5_LAYOUT_PROPOSAL.html; 5d2b9fc, 4a656cb). Their own words: "the route and room
  shapes are unchanged; only the names, purposes and furniture change."
- **The floors as built today:** shots/map_floor7/6/5_now.png (fresh top-down renders, Oct 18 night). The older
  map_floor*_top.png are from Oct 16, before the refurnishing: don't use them.

The current rooms (old v3 name in brackets):

| | rooms |
|---|---|
| **Floor 7** | Operating Room · Endoscopy and Sterile Supply (Supply) · Reception and Nurse Station · Recovery Ward / PACU (Treatment Ward) · Ward Refurbishment, closed (Renovation) · Staff Lounge and Canteen (Cafeteria) · Equipment Store, locked (Contractor Store) · Lift Plant and Janitor (Lift Service) · Pre-op Holding and Scrub (Return / Prep room) |
| **Floor 6** | Lift Lobby 6 · Ward Junction · Ward 6B Surgical (Recovery Ward) · Sample Prep Lab (Preparation) · Cold Dispatch · Service Corridor (Service Passage) · Ward 6C Conversion Works (the lady's bay) |
| **Floor 5** | Lift Lobby 5 · Diagnostic Intake · Isolation Ward (Short Ward) · Medical Records (Transfer Records) · Imaging and Equipment Bay · the Transfer Hub |

## What works (keep it)

- **One route through rooms, with loops:**
  - **Floor 7:** out the long way, back the short way (Pre-op Holding -> the bar -> the OR).
  - **Floor 6:** an always-open route plus the optional weak wall.
  - **Floor 5:** two routes that both work in either direction.

  Nobody can skip the fights, and the way back is quicker than the way out.
- **One clear goal per floor,** with gates you can see (the bar, the lift power, the case).
- **Rooms built for the special enemies:** the lady's lane in Lift Plant and her bay on 6, the guard in the canteen
  and the Isolation Ward.
- **Every room reads as a hospital room now** (since the Oct 18 refurnish).

## What's still missing

1. **No toilets anywhere.**
2. **The janitor closet isn't a room:** on Floor 7 it's shelving and a cabinet along the walls of Lift Plant and Janitor.
   Floor 6's Service Corridor has the cleaners' sink.
3. **Almost no corridors:** every room is a big box (12-17 m) joined by doors. The only corridor-like spaces are Floor
   6's Service Corridor and Ward Junction. Real hospital floors hang off a corridor spine, with small rooms (toilets,
   closets, linen, a med room) between the big ones. The small rooms are what make the big ones feel big.
4. **The goals are all "walk there, press":** the radio, the power, the bar, the case, the record.

## The fix: corridors you can see but not take (yet)

A corridor gives the hospital feel. A **blocked** one keeps the room-by-room route:
- **Blocked by** a fire shutter, beds piled up, a collapsed ceiling, or a door with a push-bar on the far side.
- **You can see down it**, so the floor reads as a hospital, but you can't take it on the way out.
- **It opens later as the quick way back:** the power raises the shutter, you kick the push-bar from the far side, or
  the lady smashes the barricade. That's the Resident Evil / Souls loop: never a way to skip the rooms.

Small rooms hang off the corridors:
- **Loot pockets.**
- **A scare:** a zombie in a toilet stall.
- **Where zombies come from** (the pacing plan's motivated spawns): a door bangs and they burst out of the toilets or
  the closet.

### Floor 7: Restore the way down
- **The staff corridor:** the empty L in the middle (between Endoscopy and Sterile Supply, the Recovery Ward and the
  Equipment Store; about 3 x 17 m and 2.6 x 14 m: the dark gap in map_floor7_now.png). Fire shutters at both ends,
  closed on the way out.
- **Off the corridor:** **staff toilets** (two stalls) and the **janitor closet as its own small room**. The closet
  moves out of Lift Plant, which then keeps its open bay for the lady's lane.
- **The power becomes a two-step:**
  1. The lift panel is dead: **the fuse is in the janitor closet.**
  2. Then a **hold**: the breaker takes ~20 s to spin up while zombies pour out of the toilets and the closet.
- **When it's back, the lights come on room by room** (the lighting bake done twice, dark and lit), and the corridor's
  shutters rise: the quick way back toward the OR. The lighting work and the goal become one moment.

### Floor 6: Choose your approach
- **The Service Corridor** (already built) gets **a toilet** off it, and the cleaners' sink becomes a small closet.
- **The weak wall into Ward 6C** (already built, as a scripted breach): **the lady breaks it** when Yola dodges her
  charge into it. It teaches her wall-crash finisher (FINISHERS_PLAN.md) and opens the shortcut at once.

### Floor 5: Match the sample to the patient
- **A toilet block** in the empty space right of the Transfer Hub (below Lift Lobby 5, about 6 m wide).
- **The Isolation Ward (the guard):** a few walkers around him, so his first slam throws them (FINISHERS_PLAN.md: the
  fodder).
- **Medical Records gets pressure:** while the record prints or the IDs are compared, zombies come out of the toilet
  block, so you hold the room or carry the fight back to Diagnostic Intake.

## Order

1. The user OKs this (or changes it).
2. The maps chat builds the corridors and the small rooms: Floor 7 first, the one already played.
3. The goals get their new steps (the fuse, the hold, the lady's wall, the records pressure).
4. **Then the lighting bake, per floor** (dark and lit for Floor 7), once each floor's walls are final.
