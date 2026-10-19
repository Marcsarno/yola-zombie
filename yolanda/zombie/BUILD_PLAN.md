# The big build (agreed 2026-10-18 night: "we have a game plan ... let it cook tonight")

**Status 2026-10-19: the combat chat's part is built and committed (see NEXT_FIXES.md START HERE). The maps chat's part (the
floors) has not started: its session stopped. Next: the lighting bake.**

One page that ties the plans together, says who builds what, and how the two chats meet. The details live in:
- **FINISHERS_PLAN.md** (v3, decided): the dodge, finishers, the guard, the lady, Yola getting hurt.
- **FLOORS_REDESIGN.html**: Floor 7 + additions, the new Floors 6 and 5.
- **NEXT_FIXES.md**: the user's notes (eyes, bed patients).

The user's rules for all of it:
- No timers, no noise or stealth, no flashlight: an action game.
- Floor 7 keeps every weapon for testing.
- Medium stays the default; the user tests at High on the phone.

## The combat chat builds (the systems; tested in the practice room and the wave room first)

1. **The dodge** (FINISHERS_PLAN.md 1):
   - the cue a fixed 0.45 s before the hit;
   - the button grey at rest, **pulsing yellow** in the window, white for perfect;
   - the window at half speed;
   - Witch Time on a perfect press;
   - the direction arrow;
   - the guard's old top-of-the-leap slow motion removed.
2. **Finishers** (2):
   - the gold mark and the FINISH button;
   - walkers open on a perfect pounce dodge, plus the 5% critical with the wide arc.
3. **The guard** (3):
   - the shield can't be hurt; he's hurt only from behind;
   - the slam impact pass, walkers as fodder;
   - finisher 1 takes the arm, finisher 2 the head;
   - missed: he pulls the shield free;
   - the mirrored second stage;
   - the club, flail and enraged stages removed.
4. **The lady** (4):
   - faster, 10% larger, bowling walkers;
   - heavy footsteps;
   - the wall crash opens her finisher (head off, no acid);
   - otherwise the acid, **redone** (an irregular splatter, droplets, bubbles, steam, a hiss, the floor etched).
5. **Yola getting hurt** (5).
6. **Oxygen tanks** (Floor 6's thing; spawn kinds `o2chair`, `o2walker`, a loose `o2tank` prop):
   - the wheelchair zombies carry a cylinder and wheel themselves fast;
   - old walkers drag one on a trolley;
   - loose cylinders.
   - Shot: a short hiss, then a blast that throws or kills zombies around it, chains to other tanks, and hurts Yola close by.
7. **The flood** (Floor 5):
   - a water area slows everyone (zombies and Yola);
   - its electrical panel, hit, sends a jolt through the water that kills the zombies in it (and hurts Yola if she's in it), then recharges.
8. **The MRI magnet** (Floor 5):
   - on when Yola enters: her gun is torn away and pinned to the magnet;
   - loose metal is dragged across the room, hitting zombies on the way;
   - the guard's shield is ripped off and stuck to it: he's open, with his finisher mark at once.
   - The big red shutdown button: a helium cloud blasts out, the magnet dies, and the gun drops.
9. **Cracked walls:** a wall segment that breaks to the sledgehammer, the lady's charge or the guard's slam (dust, chunks, a hole), opening its passage for good.
10. **The user's notes:**
    - the zombie eyes placed on the actual eyes;
    - bed patients waking once they're on screen (~8-10 m) and getting up faster, with a short camera cut on the first one.

## The maps chat builds (OPENING_MAPS_HANDOFF.md: the opening and the maps)

1. **Floor 7's additions** (FLOORS_REDESIGN.html):
   - staff toilets off Endoscopy and Sterile Supply;
   - the janitor closet as its own room;
   - the blocked service corridor;
   - the Refurbishment -> canteen doorway as a cracked blockwork wall, the sledgehammer beside it.
2. **Floor 6 rebuilt** (nine rooms at Floor 7's size):
   - the main corridor cut by a fire shutter and a collapsed ceiling;
   - the central nurse station;
   - the cylinder store;
   - toilets and the janitor closet;
   - Ward 6B's cracked wall;
   - the lady's cracked wall into Cold Dispatch.
3. **Floor 5 rebuilt** (nine rooms):
   - the Main Reception hall with the round desk;
   - the flooded Isolation Ward (water area + panel);
   - the MRI Arena (the magnet + the shutdown button);
   - the Imaging lane;
   - the optional Pathology Lab behind a cracked wall;
   - toilets and the janitor closet.
4. Furnishing, camera-facing room identity, and new props (Blender, opened visibly), as on Floor 7.
5. The story beats stay: the radio on 7, the case in Cold Dispatch, Intake beside the lift, the record, the ID match.

## Where the two meet (so neither waits on the other)

The maps chat **places** things in the floor data; the combat chat makes them **work**:
- cracked walls: wall segments marked `cracked`;
- the flood: an area plus the panel's spot;
- the MRI: the magnet's spot plus the shutdown button's spot;
- loose oxygen cylinders: placed props;
- zombie placements with the new kinds (`o2chair`, `o2walker`).

Until the floors exist, the combat chat tests each system in the practice room. Each chat stages its own files by name
and commits its own work. The shared file, core/chapter.js, is edited by one chat at a time: the maps chat owns the
floors' layout and encounter lists; the combat chat only adds the new kinds' behaviour elsewhere (core/zombies.js,
core/sim.js, render/*).

## Then

- **The lighting bake per floor**, once each floor's walls are final.
- The user plays it all on the phone (at High).
