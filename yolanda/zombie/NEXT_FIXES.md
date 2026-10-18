# Next fixes (the user's notes, 2026-10-18, after playing the combat pass)

STATUS 2026-10-18 (later the same day, commits fedf28e..3a5131c; pushed to GitHub and deployed to production at 20b51e4):
- DONE 1 (ponytail: the UAL attack clips have no hair tracks; the mixer wrote NaN into Hair1's position: render/hairsway.js
  now restores the hair bones' rest place each frame), 2 (render/clipchars.js YolaView.headLook), 4 + 5 (the guard
  reworked by the user's new brief: the shield planted in the world, his hands IK-held on it, his arm tears off on it, he
  flails one-armed, then clubs with the torn arm; slam launch / impact / smoke / cracks / small shake), 6, 7, 8, 9, 10 (the
  lady: aim, lock, build-up to 6.2 m/s, close smash), 11, 12, 15, 16 (a perfect dodge of a walker's pounce: execute).
- 13, 14: done by another chat (the crowbar's own hub combo, uncommitted in that chat's files).
- OPEN 3: the sledgehammer swings with a one-handed sword combo (its free arm flies off the handle, GRIPS_HANDOFF.md OPEN):
  needs a two-handed heavy attack, picked by the user and checked in the Rig Lab (never KayKit).
- Also new: nurse scrub variations to choose from (combat.html?mode=calm&demo=nurses; main.js SCRUBS).

Context: COMBAT_POLISH_LOG.md round 20 (what was built).

## Yola
1. **Ponytail disappears during many melee attacks.** Find which attack clips / layers hide or collapse the hair bones
   (render/hairsway.js, the attack overlays in render/clipchars.js; check every melee weapon's attacks).
2. **Her head doesn't face where she is looking**: it looks weird. The head should turn toward the aim direction.
3. **She holds the sledgehammer badly**: the user doesn't like the hold (Rig Lab fit / hand placement for the
   sledgehammer; judge against the reference rig, never toward a self-measured number).

## The guard's slam
4. **On impact the shield does not look driven into the floor**: it stays but still sort of moves, which takes away the
   stuck feeling. Tune the stuck pose so the shield is planted solid (no drift from the heave animation; the arms pull
   at a fixed shield).
5. **Visual effects to sell the slam:** an effect when he launches; a STRONG effect when he hits the ground; a small
   screen shake; cracks in the floor around him and around the shield; impact smoke / dust. "Things like that."

## Dodge and threat cues
6. **The Dodge button should be a real action button: larger, and centred on the phone.**
7. **Basic zombies don't need dodge-worthy attacks**: they can have plain basic attacks (no dodge treatment).
8. **The red floor indicator** for the special zombies (lunge, charge, leap) should be **more subtle**.

## The big lady (the charger)
9. She **doesn't run fast enough** and doesn't look like she **builds up speed and charges**.
10. **Like the Butcher in Diablo 3:** she has attacks when you're close, and there is a **moment where she sets up / aims
    the direction of her charge** (the player sees where it's going and has time to react).

## Slow motion and crits
11. **Slow motion doesn't feel good.** Idea: **Yola moves slightly faster than the rest of the world** during slow motion.
12. **Better visual effects for crits** when she hits during slow motion.

## The crowbar
13. **Too long a delay after its 4th attack** before she can attack again. Use the **same timing as the bat**, but the
    crowbar's attacks about **20% faster** than the bat's, so it feels different.
14. If another combo can be built from the animations we have for the crowbar, the user would like to consider it.

## Floor breaches
15. **Zombies crawling out of the ground don't feel good yet** (the emergence needs work: timing, look, readability).

## Idea (the user: "just a thought")
16. A **perfect dodge against a basic zombie** could become more of an **execute**: change the animation slightly and use
    the **full-body explosion kill** (render/gibburst.js, the burst the user loved) for it.
