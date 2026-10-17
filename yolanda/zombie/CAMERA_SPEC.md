# Yola zombie game: gameplay camera spec (for painting 2D assets to match)

Source of truth: `src/main.js` `updateCamera()` and `src/core/tuning.js` (camPitch 42, camYaw 35, camWidth 7.2, GAME_FOV 50).
Checked against the running game on 2026-10-17.

## The camera in one paragraph

A fixed, never-rotating **perspective** camera looking down at the floor at about **40°** from horizontal, turned
**35°** so the room's walls run diagonally across the screen (a "Zombieville USA 3D" diorama view). Vertical field of
view **50°**. It follows the player, with a fixed size: about **7.2 m of floor across a portrait phone screen** at the
player (12.2 m across a landscape screen). World units are metres; Y is up; the player is 1.62 m tall.

## Exact math

World axes: +X east, +Z south, +Y up (three.js convention). Floor point the camera follows: `T = (tx, 0, tz)` (the player
plus a small look-ahead, shifted up-screen so the player sits in the lower middle).

```
yaw   = 35°           pitch = 42°           vfov = 50°
a     = screen width / screen height
hfov  = 2·atan(tan(vfov/2)·a)
W     = 7.2 m if a < 1 (portrait), else 7.2·1.7 = 12.24 m
D     = clamp( W / (2·tan(hfov/2)), 4, 22 )            // distance from the camera to the floor point T

camera.position = ( tx + sin(yaw)·cos(pitch)·D,
                    sin(pitch)·D,
                    tz + cos(yaw)·cos(pitch)·D )
camera.lookAt( tx, 0.6, tz )                            // aims 0.6 m above the floor, so the true down-angle is a bit under 42°
```

So the camera sits **south-east** of the player and looks **north-west**: its horizontal view direction is
`(-sin 35°, 0, -cos 35°) = (-0.574, 0, -0.819)`. Camera right on the floor = `(0.819, 0, -0.574)`.

| Screen | aspect | D (m) | camera height (m) | back from target (m) | true down-angle | horizontal FOV | floor across at player |
|---|---|---|---|---|---|---|---|
| phone portrait 9:19.5 | 0.462 | 16.73 | 11.19 | 12.43 | 40.4° | 24.3° | 7.2 m |
| tablet portrait 3:4 | 0.750 | 10.29 | 6.89 | 7.65 | 39.4° | 38.6° | 7.2 m |
| landscape 16:9 | 1.778 | 7.38 | 4.94 | 5.49 | 38.3° | 79.3° | 12.2 m |

On a phone (the main target) the camera is far away with a narrow lens, so the view is close to **orthographic**:
painting with a parallel (axonometric) projection matches well. Landscape has noticeably more perspective.

## How the world looks on screen (use these for painting)

With the view ~40° down and turned 35° (parallel-projection approximation):

| World direction | Direction on screen (0° = right, + = counter-clockwise) | Relative length of 1 m |
|---|---|---|
| East (+X) | −24.2° (right and a little down) | 0.898 |
| North (−Z) | +42.6° (up and to the right) | 0.779 |
| West (−X) | 155.8° (left and a little up) | 0.898 |
| South (+Z) | −137.4° (down and to the left) | 0.779 |
| Up (+Y) | straight up on screen | cos 40° ≈ 0.766 |

- A 1 m × 1 m floor tile appears as a parallelogram with edges at −24.2° and +42.6°.
- Floor depth along the view direction is squashed to sin 40° ≈ **0.64** of its true length; widths across the view are
  not squashed.
- Upright things (people, cabinets, IV poles) stay vertical on screen and show **0.766** of their true height.
- Scale: on a 1080 px wide portrait screen, 1 m across at the player ≈ **150 px**; the player (1.62 m) is about
  **186 px** tall on screen.
- You see the **tops** of objects clearly, plus their **south** and **east**-facing sides (the faces turned toward the
  camera). North and west faces are hidden.

## Lighting to paint in

- Key light ("sun", directional): coming **from** `(-0.358, 0.835, 0.418)`: high (56.6° above the floor), from the
  **west-south-west**. On screen it comes **from the left and slightly from the viewer's side**, so lit faces are the
  left/top ones and shadows fall **to the right and a little up-screen**.
- Fill: a hemisphere light, warm cream from above (`#fff4e3`), cool grey-green from below (`#7c9a96`).
- Colour output: sRGB, Neutral tone mapping, exposure 0.92 (slightly soft and desaturated highlights).

## Prompt you can paste into ChatGPT

> Paint a game asset for a 3D mobile game seen from a fixed diorama camera: looking down at about 40° from horizontal,
> turned 35° so the world grid runs diagonally (world east points 24° below horizontal to the right, world north
> points 43° above horizontal to the right). Near-orthographic (narrow lens, camera far away). Show the top and the
> south/east-facing sides; vertical edges stay vertical. Light comes from high on the left (about 57° up), slightly
> toward the viewer; soft shadows fall to the right and slightly up. Warm cream ambient light from above, cool
> grey-green bounce from below. Scale reference: 1 metre ≈ 150 px across at 1080 px screen width; a 1.62 m person is
> about 186 px tall. Hand-painted texture style, clean silhouette, transparent background.
