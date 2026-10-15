# Bat combo, round 11 (2026-10-15): grounded feet, grip, no skating

Checked the newest bat clip against your clip 13 frame by frame, measured it, and fixed what was off. Bat only.

**What was wrong (measured, not eyeballed):**
- **Feet floating, knees locked straight.** Her feet were 10–30 cm off the floor for most of the combo. The clip was sized
  so her hips sat at standing height, but the fighter in the video crouches, so her legs couldn't reach the floor.
- **A tilted floor.** The clip used her slightly leaning skeleton as "up", which lifted her ~5 cm per metre she moved.
- **Knees caving in** (the tracker guesses badly at sideways depth).
- **Skating in the game.** Against a zombie, the game shortens her step-in so she stops short of it. Her planted feet slid
  up to ~10 cm per frame in the backhand, and again when blending in from idle and back out after the finisher.
- **Left hand off the handle** by up to 7 cm in the finisher's follow-through (her arms are shorter than the fighter's).

**What changed:**
- **The clip (rebuilt in Blender):**
  - Sized by leg length.
  - Her shoe soles are planted, not her ankles, so she stands on the balls of her feet like the video.
  - Knees point over the toes.
  - The forehand landing, which the tracker lost in motion blur, is planted as the video shows.
  - The bat moves into her reach when the video's hands are too far.
- **In the game:** a foot lock. A planted foot stays on its spot while her body moves over it. If it falls too far behind,
  she takes a quick small step instead of sliding. The left shoulder rolls forward a little when the handle is just out of reach.

**Checked:**
- One foot is on the floor in every frame, except the forehand hop (which the video has too).
- Planted feet slide under 1 cm per frame on average, worst ~2 cm (the finisher's pivot).
- Both hands are on the bat (within 2 cm) through all three strikes.
- The bat the game hits with matches the one you see within 3.3 cm.
- The same at 30, 60 and 120 fps.
- Held combo still hit, hit, kill.
- Hit grid 32/42 (it was 34): two edge positions far to her left are lost, because the bat now sits closer to her.

**See:** recordings/bat_combo_before_after.mp4 and recordings/bat_combo_vs_reference.png.

**Not done:**
- The finisher's wind-up leans less than the video.
- Not tested on a phone.
- The axe comes next.

# Polish log — round 9 (2026-10-15)

Your notes from your last play-through, in order. Each change was checked with scripted simulation runs and with renders
in the browser pane, at phone size and at desktop size. Nothing was played by a person on a phone yet.

## Combat

**The bat and the axe are now different, and each combo is two hits.**
- **Bat:** the level swing (right to left), then a **home-run swing back the other way** (left to right).
  - The home run is Yola's own swing mirrored in Blender, so she bats it left-handed. It isn't a new clip.
  - It holds a wind-up behind her shoulder for about 0.2 s, then whips through in about 0.1 s.
  - It also steps in further and hits much harder: about 37 for the first swing, then about 71, which kills.
  - Checked: the mirrored pose matches her real pose reflected to within about 4 mm. `yola.glb` was re-exported, and its
    mesh and textures are byte-identical to before, with the one new clip added.
- **Axe:** the swing, then the overhead chop. The chop now starts with the axe already raised, so it flows straight out
  of the swing instead of dropping down and lifting back up.
- **Smoother chaining:** the second attack eases in (0.16 s cross-fade with a smooth curve) instead of the old 0.1 s
  linear blend.
- Checked: holding attack against one zombie gives first hit → finisher kill, for both weapons, on 4 different seeds.

**The slowdown on hits.** It was a full freeze of the whole game (the game and all animation), so it read as a stutter, and
combo hits stacked the freezes. It's now a brief dip into slow motion (20% speed) that never stops the game:
- 0.07 s on a normal hit.
- Slightly shorter for the first hit of a combo, slightly longer for the finisher or a kill.
- Old saved tuning values reset to the new defaults once, automatically (the tuning settings now carry a version
  number), so the old freeze length can't stick around.

## The opening

- **Poster in the reception:** the heart poster overlapped the operating-room doorway's frame, and the wall sanitizer
  sat inside the doorway too. The poster moved left (with the water cooler shifted so they don't touch), and the
  sanitizer moved between the doorway and the glass wall.
- **Outside the medical center (new first shot), built after your picture:**
  - Cream stucco front, the teal "Yola's Medical Center" sign, a canopy with downlights over the entrance pillars.
  - Teal-framed glass sliding doors, planters with broadleaf plants, hedges under teal windows.
  - Sidewalk with leaf shadows, trees above the roofline, a blue sky with clouds.
  - The shot pushes in slowly from a low angle, the doors slide open, and the camera carries on into the reception.
  - Through the glass you see the real reception (its peach rug, a ceiling with light panels).
  - It frames properly on both a phone (portrait) and a wide screen.
  - The title card now appears just after entering, since the sign shows the name outside.
- **Monitors look switched on:** every patient monitor and anesthesia screen gets a live, glowing display: a sweeping
  ECG, an oxygen trace and a breathing trace, with HR / SpO2 / RR readouts.
  - All screens share one small texture redrawn 12 times a second, so it's cheap.
  - The old static waveform shapes are hidden.
  - When the patient flatlines, the screens show a red flat line and a blinking HR.
  - (Recovery and Pre-Op on Floor 3 merge their props into single meshes for speed, so their monitors were left as they
    were. The Pre-Op one is the deliberately cracked, post-outbreak model.)
- **The surgery room:**
  - The table no longer stands in front of double doors. The door that was behind it moved east along the wall.
  - The wall behind the table is now a head wall with a glove dispenser, hand sanitizer, sharps bin and clock.
  - One table (mid tier) under a mid-tier ceiling surgical light.
  - The mid-tier anesthesia workstation beside the head of the table, facing it, plus a mid-tier monitor and a mid-tier
    IV pole at the table's side.
  - A biohazard bin, a waste bin and a mid-tier supply cart against the walls.
  - The monitor and workstation screens are working displays (above) instead of broken-looking ones.
  - The story's camera shots and the "check the equipment / monitor" tags follow the equipment.
- **"Oh no, he's moving":**
  - His fingers twitch and his head rolls toward the room. The old hand-lift never worked: it referred to a bone name
    that doesn't exist.
  - Then he slowly, stiffly sits up from the hips, legs still flat on the table, while his skin drains to a grey green.
  - The surgeon and both staff turn to look at him and back away.
- **The reveal:** the single fade to black is now a failing-light flicker:
  - The light stutters with an electrical tick and buzz.
  - In one dark beat, the shape in the doorway is the new Yola.
  - A lit flash shows the old Yola again.
  - One bright frame shows someone else.
  - Then the light dies, and comes back on the new Yola.
  - The dark beats are dim red only, so the figure is hard to make out.
  - Reduced-flash mode gets one slow dip instead.

## Zombie fight: emergency lighting (applied across the whole floor, almost no cost)

- **Main lights:** the one shadow-casting sun turns a cold, dimmer emergency white. The fill light goes cold blue over a
  dark red bounce.
- **Warning beacon:** one red fill light that breathes slowly like a rotating beacon.
- **Floor glow:** soft glow pools painted on the floor (red under the fittings and at every doorway, cold white in the
  middle of each room). They're unlit decals, not lights.
- **Screen edge:** a faint pulsing red vignette at the edges, drawn by the browser rather than the 3D renderer.
- **Fewer lights:** Floor 3's five amber point lights (each one cost every lit pixel) are gone, so this is cheaper than
  before. No light casts its own shadow. The red beacon light exists from the start at zero, so turning the look on
  never triggers a shader recompile (no hitch).
- **When it switches:** it fades in over 1.6 s as the camera widens after the reveal, and resets if the opening is
  replayed.

## Checked

- **Bat hit grid:** unchanged at 30/42 on open floor, 26/42 beside a wall.
- **Headshots:** 9.6% of hits.
- **Crowd overlap:** still about half what it was before round 8.
- **Floor 3 navigation:** unchanged, and no zombie gets stuck in the rebuilt operating room.

## Not verified

- Real-time feel on a phone: the home-run timing, the slow-motion length, and the flicker's rhythm with sound.
- The emergency-light edge vignette on a real screen (the in-pane test views can't show page overlays).

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
