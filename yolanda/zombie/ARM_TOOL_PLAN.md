# Arm tool for the Rig Lab: plan (2026-10-17, not built yet)

The user: "add an arm adjust setting like you do with weapon.. so i can do tweaks ... can it be done with the mouse by
dragging it? pulling and moving and locking certain joints? ... cleaning up the interface... saving it for the future"

## The idea in one line
The arms are no longer fixed rotations: every frame, `render/armfit.js` solves each arm that holds something, choosing the
hand's turn around the handle and the elbow's swing inside the anatomical ranges. So an arm tweak should be **a setting
for that solver**, not a frozen bone rotation. Then a tweak keeps working while the clip plays, through the carry and
into the attack, stays inside the wrist / forearm / elbow limits, and the game plays exactly what the Rig Lab shows (same
file, same math, like the weapon fit).

## What a tweak is (the data)
Per arm (Left / Right), all optional, zero = untouched:
| setting | what it does | unit |
|---|---|---|
| elbow swing | swings the elbow around the shoulder-wrist line (out from the body / in close / up / down) | deg |
| hand turn | turns the hand around the handle (palm up ... palm down) | deg |
| slide | moves the hand along the handle | mm |
| wrist up / down, wrist side | bends the wrist on top of the solved pose (clamped to the wrist's range) | deg |
| shoulder raise / forward | the collarbone (shrug, reach) | deg |
| reach (free arms only) | moves a hand that holds nothing: offset from the clip's hand | mm, in her body frame |

Where it applies (the scope), most specific wins:
`weapon + clip` (e.g. chainsaw carry, chainsaw attack) > `weapon` (every clip with it) > `clip` (no weapon: e.g. the
pistol idle's free hand) > nothing.

Saved in `assets/hold/arm_fit.json` (the same pattern as `weapon_fit.json`):
```json
{ "chainsaw": { "carry": { "yola2": { "Right": { "elbowSwing": -12, "handTurn": 8 }, "Left": { "slide": 15 } } } } }
```
The game loads it and passes it to `handOnto` (render/holdfit.js), so the arena and the play test use it with no other
change. A setting that would push a joint past its range is clamped there, and the panel shows it in red.

Later (phase 4): **keyed tweaks** on an attack, a tweak at chosen frames of the clip, blended between them (a hand
that needs help only mid-swing). Same file, `"keys": [{ "f": 12, ... }]`.

## The mouse (phase 2)
An **Edit arms** mode (button or key E). Round handles appear on each arm: shoulder, elbow, hand. Click one to select it;
the camera stops orbiting while you drag.
- **Drag a hand**: on a weapon, the hand slides along the handle. With Shift it drags the whole weapon (the carry: both
  hands follow, which is how a carry like the chainsaw's would be set by hand instead of by search). A free hand moves
  anywhere and the arm follows (the same anatomical solver).
- **Drag the elbow**: it can only move on its circle (the hand stays put), which is exactly "elbow out / in close".
- **Turn a hand**: a ring around the handle (key R, or drag with the right button): palm up / down.
- **Locks** (a lock icon beside each joint, key L on the selected one):
  - hand pinned: stays where it is while you work on the elbow or shoulder;
  - elbow locked: keeps its swing while the hand moves;
  - wrist locked: keeps the hand's bend while the forearm moves;
  - shoulder locked: no collarbone reach.
- Every drag writes the same settings as the sliders, so the sliders and the handles always agree, and both save the same way.
- **Live readout** beside the selected arm: wrist bend (% of its range), forearm turn (palm up / down, % of range),
  elbow angle; amber past 75%, red at the limit. The limit itself stops the drag.
- **Undo / redo** (Ctrl+Z / Ctrl+Y) for every change, sliders and drags alike.

Built on three.js's own pieces: a raycast for picking the handles, TransformControls for the move / turn gizmo (axis
arrows when you want precision: press X / Y / Z to lock to one axis, like Blender).

## The motion check (phase 1, the user's earlier ask: "no limb should magically jump ... use math to gauge smoothness")
A **Check motion** button: plays the clip (or, in the arena, idle -> attack -> back to idle) frame by frame and measures
every frame:
- each joint's travel and its jerk (the frame-to-frame change in speed): a pop shows as one frame far above its
  neighbours (the same test as the game's footPops, for every joint and the weapon);
- the weapon's turn per frame (a flip shows as tens of degrees in one frame);
- every arm's wrist / forearm / elbow against its range.
Problem frames get red marks on the timeline; clicking one jumps there. The game gets the same check as a test hook
(`game.motionCheck`), so a regression can be caught without looking.

## Cleaning up the interface (phase 3)
Today: a top bar of five rows, the clip list on the left, a floating fit box on the right, the timeline below.
- **One tools dock on the right**, with tabs: *Weapon fit*, *Arm fit*, *Check*. It replaces the floating box, folds away
  (key T), and remembers its tab.
- **The top bar down to two rows**: character, weapon, clip, play controls. Reference, layout, hand presets, skeleton and
  mesh go into a *View* menu (they change rarely).
- **Save**: one Save button for everything (weapon fit + arm fit), with a dot when something is unsaved. It writes the
  files in assets/hold directly (a small save route on the dev server, localhost only, like the Sound Board's), instead
  of shots/ and a manual copy.
- **Keys**: a ? overlay listing them.

## Order of work
1. Data + solver hooks (arm_fit.json, handOnto applies it, clamps to the ranges), the Arm fit sliders with the live
   readout, the save route, the motion check. Everything checked against the reference rigs in the Rig Lab.
2. The mouse: handles, drag hand / elbow / weapon, turn ring, locks, undo.
3. The interface: the dock, the slimmer top bar, one Save, the keys overlay.
4. Later: keyed tweaks on attacks; free-arm tweaks on clips with no weapon.

## Questions for the user before building
- Scope of a tweak by default: this weapon in this clip only (recommended), or this weapon everywhere?
- Dragging a hand that holds a weapon: slide along the handle (recommended, Shift moves the weapon), or move the weapon?
