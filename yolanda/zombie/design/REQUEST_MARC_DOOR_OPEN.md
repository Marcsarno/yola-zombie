# Request: a door-opening move for Marc (for the animation chat, or a Mixamo pick)

From the Chapter 2 polish (design/CH2_POLISH_CHECKLIST.md, item 5 and "Not done"). Nothing is built yet; this is what the
scene needs, so whoever makes the clip does not have to dig.

## Where it plays

Chapter 2, the house stop (src/hood/level.js `stopHome`, "the vaccines: in the fridge"). Marc stands at the mark
`fridge_use`, facing the fridge (his aim set to the mark's yaw). Today:

1. the bat goes onto his back (0.4 s, `p.desired = 'fists'`),
2. he plays `hood_Interact` (assets/neighborhood/moves/marc-hood.glb, a generic one-arm reach),
3. 0.45 s into the first shot the fridge door swings open from its hinge (`openSeal('fridge')`),
4. a close shot of the case on the shelf, the case taken (`flags.case = 'carried'`), his line M06, back to play.

The reach reads as "reaching for something", not "opening a door": that is the gap.

## The move wanted

- Marc's right hand to the fridge door's handle (the door hinges on his left as he faces it; the handle at about chest
  height), a pull that swings the door open toward him and to his left, a short step back with it, then the hand into the
  fridge to the case. About 1.6 - 2.2 s, standing, no weapon in hand (the bat is on his back).
- Ends in a neutral stand (the game blends back to his idle).
- The game would start the door's swing at the moment his hand closes on the handle (one number: that time in the clip).

## How it should be judged (the project's own rules)

- Fitted on Marc (assets/male1.glb) in the Rig Lab beside the X Bot / Quaternius dummy, judged in motion, never from
  thumbnails or a self-measured number (memory: animation review standard, reference rig comparison, one viewer).
- Contact: the hand on the handle checked as the contact-check method says (the hand's frame, the worst frame, close-ups).

## Sources

- Mixamo has door-opening clips ("Opening", "Open Door" style); downloading one needs Marc's sign-in on his account and his
  OK. Then the Animation Hub / Rig Lab pipeline as for his other hood moves.
- Or the animation chat makes or adapts one.

When the clip exists: add it to marc-hood.glb as e.g. `hood_DoorOpen`, play it in place of `hood_Interact` in `stopHome`,
and set the door's swing to the handle moment instead of the fixed 0.45 s.
