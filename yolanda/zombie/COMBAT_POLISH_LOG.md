# Combat polish log — round 8 (2026-10-14)

What changed in the combat, why, and how each change was checked. All numbers come from scripted runs of the real
simulation code (node), plus close-up renders in the browser pane at a phone-sized viewport. Nothing here was played by a
person on a phone yet.

## What you asked for

### 1. Unlimited ammo for testing (reloads still happen)
- New tuning switch `testInfiniteAmmo` (src/core/tuning.js), **on** for now. Spare rounds never run out on any mode, Floor 3
  included; the magazine still empties (12 pistol / 6 shotgun) and Yola still has to reload.
- The HUD shows just the magazine count while the spare rounds are unlimited.
- To go back to counted ammo on Floor 3, set `testInfiniteAmmo: false` in `tuning.js`.
- Check: 946 pistol shots fired at targets. Reloads happened on schedule (37) and she never ran dry.

### 2. Zombies: less piling into each other, less straight-line walking
New steering on top of their pathfinding (`Zombie.steer`, src/core/zombies.js):
- **Own approach side.** Each zombie leans to its own side of the direct line from far away, so a group fans out instead of
  walking single file. This fades out as it gets close, so it still reaches her.
- **Shamble sway.** A slow, per-zombie wobble in heading, so the walk isn't a ruler-straight line.
- **Look-ahead avoidance.** A zombie that has another one ahead of it in its path steps around it, on the side the other one
  isn't on.
- **Queueing.** It slows down behind a zombie that's busy attacking or staggering, instead of shoving through it.
- **Surrounding.** Within about 2.8 m of Yola, two zombies coming at her from nearly the same angle drift apart around her.
  The crowd ends up around her instead of stacked on one side.

Check: 8 zombies starting bunched together, walking at Yola:

| | Overlap (lower is better) | Reached her | Arc of the circle around her they cover | Path curve |
|---|---|---|---|---|
| Before | 10.4 / 11.9 | 7 / 6 of 8 | 125° / 129° | 1.013 (straight) |
| After | 4.8 / 5.3 | 8 / 7 of 8 | 178° / 196° | 1.05 (gentle curves) |

On Floor 3, with every zombie awake and Yola standing in four different rooms, about as many reach her as before, in about
the same time, and none snag on doorways. The two CT zombies stay put because the CT door is barred, which is intended.

### 3. Bat combo (like the axe)
- The bat now has a three-hit combo: the level swing, then the low backhand, then the overhead slam. It's blunt, so nothing
  gets cut off.
- It works like the axe: the first hit has to connect, then holding attack (or pressing again) carries on into the next.
- Damage, against a 100 hp zombie: swing about 37, backhand about 43, slam about 81. The first two leave it standing and the
  slam finishes it. The slam can also hit a zombie that's on the floor.
- Check: the held-attack test went swing hit → backhand hit → slam kill, the same on 4 different seeds. Close-up renders
  show the bat gripped in both hands through all three attacks.

### 4. Pistol headshots
- Sometimes a pistol hit that goes through the middle of a standing zombie, within 11 m, takes the head clean off: a
  one-shot kill.
- It comes with an extra hit-pause, a bigger shake, a louder impact and a "HEADSHOT" pop-up. The head uses the same
  severing effect as the axe, so it flies off with blood.
- The rate is tuning `headshotChance` = 0.1. Measured: 91 of 946 shots (9.6%).

### 5. Bat hits not registering when the swing looks like it should land
I measured the swing path from Yola's own clip data and ran a grid of zombie positions (distance × angle) through the real
hit test. I found three causes:

1. **Side walls ended the swing early.** The bat swings from her right side round to her left. In a corridor, the bat
   touched the side wall before reaching the front, which counted as a "clank" and ended the damage for the rest of the
   swing. Now only a wall straight ahead of her within the bat's reach ends the swing. A side wall just stops the bat where
   it meets it, and the rest of the swing still lands.
2. **The zombie's reaching arms weren't hittable.** Only a 0.28 m circle around the zombie's middle counted. A standing
   zombie now also has a hit circle 0.36 m in front of it, where its arms reach toward her. The body circle is also slightly
   bigger (0.3 m).
3. **Short damage window and reach.** The first swing's damage window is a little wider (0.14–0.33 s instead of
   0.155–0.31 s), and her step-in toward a nearby zombie reaches a bit further (finds zombies up to 1.75 m away, steps up to
   0.5 m).
- Also: crawling zombies (lost a leg) can now be hit by the swing. Before, the bat always passed over them.

Hit grid: 42 positions, 0.7–1.7 m away, 75° to either side:

| | Open floor | Beside a corridor wall |
|---|---|---|
| Before | 21 / 42 | **5 / 42** |
| After | 30 / 42 | 26 / 42 |

The positions that still miss are zombies behind the wall, or far out to her left past where the swing ends.

## Other things I found and fixed

- **The axe's (and now the bat's) overhead finisher landed off target.** The slam clip comes down about 14° to her left, so
  a zombie straight ahead was just outside the hit area and the finisher whiffed every time in testing. She now turns into
  the slam, the same way she already turns into the first swing. On screen too, it comes down on her aim line.
- **Punches and kicks were counted twice** in the hit stats and the hit list. Fixed (stats only, no gameplay effect).

## Files
- `src/core/tuning.js`: `testInfiniteAmmo`, `headshotChance`
- `src/core/level.js`: infinite spare rounds while testing
- `src/core/weapons.js`: bat combo, slam yaw, first-swing window and reach
- `src/core/player.js`: longer first-swing step-in
- `src/core/sim.js`: melee hit test (walls, arms, crawlers, double count), pistol headshot
- `src/core/zombies.js`: crowd steering
- `src/render/clipchars.js`: bat combo grip calibration (`sock`)
- `src/main.js`, `src/ui/hud.js`, `combat.html`: headshot feedback and pop-up

## Not verified
- How it all feels in real-time play on a phone (timing of the bat combo, whether 10% headshots feels right, whether the
  zombie sway reads well at speed). All of these are tuning values that are easy to change.
