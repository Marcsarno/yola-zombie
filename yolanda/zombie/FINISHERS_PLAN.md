# Finishers, dodging, the guard, the lady, Yola getting hurt: the game plan (v3, decided)

(2026-10-18 night, combat chat. v1 was the first planning pass; v2 took in the user's answers: the guard as a two-part
finisher fight, a 5% critical finisher on walkers with a wide arc, and "think a little harder" about the dodge: Arkham /
Insomniac Spider-Man / Souls-like timing. v3: the user's decisions, below. Nothing here is built yet. The floors:
FLOORS_REDESIGN.html and LAYOUT_REVIEW.md.)

## The user's decisions (v3)

- **No dodge at will** (a phone game): the button is there but grey. It **pulses yellow** only in the window to tap, and
  flashes white for the perfect moment.
- **The guard:**
  - His arm **never tears off on its own**. Missed the finisher: he pulls the shield free and slams again.
  - **Finisher 1** (after a slam): his arm comes off. **Finisher 2** (after a slam with the other arm): his head comes
    off, and he's dead.
  - Both are execute-style, with the camera in, using the finisher moves already in the game.
- **The lady:**
  - **Finisher: her head shot off, and no acid.**
  - Killed any other way: the acid sprays, but **redone so it looks toxic**. Today it's a cartoon perfect circle. It
    should be an irregular splatter flung along her death, with droplets, a sizzle (bubbles, steam wisps, a hiss), the
    floor etching darker under it, then fading out.
- **Finisher moves for the guard and the lady:** the existing ones.
- **Walkers open to a finisher two ways:** a perfect dodge of their pounce, and the 5% critical. (This is what the v2
  question "pounce + knockdown + crippled" was about: which situations put the gold mark on a normal zombie. The
  knocked-down and crippled ones are dropped.)
- **Win-back health:** parked while testing runs on infinite health. It means getting part of a hit's damage back by
  hitting back within ~3 s (Bloodborne's rally). Revisit when damage is on.

## Where it stands today (read from the code)

- Finishers are in the game one way only: perfect-dodge a walker's pounce (a third of walkers pounce, no sign) -> an amber
  floor ring for 2.4 s -> a fresh attack press in reach (core/sim.js specialMiss / execTarget, core/player.js
  startExecution, render/execution.js). Nearly invisible.
- The guard: the shield blocks frontal hits; his slam plants it, he heaves 3.4 s, his arm tears off on its own; then he
  flails, picks up his torn arm and clubs with it; both arms gone -> enraged.
- The lady: 6.2 m/s, trips on the first zombie in her lane, a wall sits her down 1.3 s. No finisher.
- **Why the dodge feels off (found in the code):**
  - The "now" sign fires far too early. The guard: at his takeoff, about 1.1 s of game time before he lands, and his
    peak slow-motion then stretches that to ~2 s of real time. The lady: the moment she starts running, even 9 m away.
  - The guard's leap has its own slow-motion at the top of the jump, *before* the moment to dodge, so the slowdown and
    the cue don't line up.
  - The reward comes late. The "PERFECT DODGE" slow-motion fires when the attack *misses* (the slam lands, the charge
    runs past), not when she presses. The press and the payoff are apart, so it feels mushy.
  - The judging is loose: "perfect" is any press in the last 0.8 s of the slam, or with the lady anywhere inside 3.8 m.

## 1. The dodge: one beat, every time (Arkham / Spider-Man / Witch Time)

**Telegraph early, cue late.** Two different signals with two different jobs:
- **The telegraph (early, on the enemy, mostly sound):** the guard's roar and crouch, the lady's scream, her lane on the
  floor and her footfalls. It says "something big is coming: get ready, move". The button stays grey.
- **The cue (late, the spider-sense):** fires a **fixed time before the hit lands, the same for every attack**:
  0.45 s of game time. One beat to learn, like a rhythm game: hear the *ting*, tap.
  - The guard: at the end of his hang in the air, as he starts to drop (his clip's frame ~64 of 77). No slow-motion at
    the top of the jump any more: the cue *is* the slowdown.
  - The lady: when she's 0.45 s from reaching Yola (worked out from her distance and speed), after she's already ploughed
    through the walkers in her lane.
- **At the cue:** time dips to half speed for the window (so it's ~0.9 s of real time: room for a thumb on a phone),
  white spider-sense lines flash around Yola's head, the attacker gets a bright outline, the button pulses yellow and its ring
  starts closing, and a sharp *ting*.

**The press pays off at once:**
- Yola dodges on the same frame (untouchable from the first frame).
- It's judged **at the press**:
  - **Perfect:** the last ~0.18 s before the hit (plus a little after, for touch lag).
  - **Good:** earlier in the window.
- **Perfect = Witch Time:** the world drops to ~0.25 speed for ~1.2 s of real time while **Yola moves at full speed**,
  with a white flash, a bass drop and "PERFECT". Then it snaps back exponentially. Her next blow or shot is critical.
  The guard's perfect dodge leads straight into his finisher (below).
- **Good:** she gets clear, a whoosh, no slowdown.
- **Too late:** she takes the heavy hit (section 5).

**Which way she goes:** automatic, by the attack (the safe-direction picker already exists: core/sim.js autoDodge),
unless the stick is held:
- **The slam:** she rolls out of the landing wedge.
- **The charge:** she side-steps across the lane, to the side with more room.

A small arrow on the button (and on her floor ring) shows the way she'll go, so it never surprises.

**Taps outside the window do nothing** (the button is grey). No punishment in version 1. If mashing turns out to beat
it, a short lockout comes later.

**Only one cue at a time.** Walkers' normal attacks never cue (they're basic attacks). Their pounce keeps its quiet,
no-sign perfect dodge that opens a finisher (section 2).

**The three slowdowns, made one family:**

| when | world speed | Yola | how long |
|---|---|---|---|
| cue window | 0.5 | 0.5 | until she presses or the hit lands |
| perfect dodge (Witch Time) | 0.25 | full | ~1.2 s real, then snaps back |
| finisher | its own camera and timing | (render/execution.js) | |

## 2. Finishers: Open -> Mark -> Press

An open enemy shows **one gold mark over its head**, the centre button turns to **FINISH**, and a press (the button or
attack) plays it in slow motion.

**Walkers:**
- A **perfect dodge of a pounce** opens that walker (as now, now with the mark).
- **The 5% critical finisher (the user's idea):** any attack Yola starts on a walker in reach has a 5% chance to become a
  finisher: the camera cuts in and she does the big move, with a **wider arc**, so a walker or two next to the target
  go with it:
  - **Melee:** a wide sweep (the bat's home run, the axe's cleave) that kills everything in a 120° arc within ~2.2 m.
  - **Shotgun:** a wide blast that blows the target and its neighbours apart.
  - **Pistol:** a quick chain of headshots, 2-3 targets, the camera following.
  - Never twice in a row, and at most one every ~12 s, so it stays special.
- (v1's "knocked down / crippled opens it" is dropped: the 5% crit replaces it.)

**The guard and the lady:** section 3 and section 4.

## 3. The big guard: two finishers, two parts

1. **The shield can't be hurt or broken, ever.** He can only be hurt **from behind** (flanking). From the front:
   sparks, a clank, a "blocked" read. Getting behind him also shoves his next slam sooner (flanking speeds the fight up),
   but nothing kills him except the two finishers.
2. **The slam: make it huge.**
   - Dust and debris: a dust ring rolling out, tile chunks thrown up, a shockwave ring on the floor, the cracks (exist).
   - Weight: a strong shake and a camera punch, a low boom with sub-bass, the ceiling lights flicker (the lighting
     kit's flicker).
   - Fodder: **every walker within ~4 m knocked flying** outward, and the ones right under it (~1.5 m) killed. Drip
     stands and wheelchairs shoved away.
3. **Stuck and open:** the shield is stuck in the floor and he heaves at it (~3.4 s). The mark appears over him.
   **Finisher 1: his shield arm comes off** (shot off or smashed off), in slow motion:
   - the arm launches spinning, trailing a long ribbon of blood, bouncing off whatever it hits;
   - a fountain from the shoulder;
   - the camera follows the arm for a beat.
4. **Missed it:** he wrenches the shield out of the floor (a dust burst) and carries on. Another slam, another chance.
5. **Stage 2:** he picks the shield up with his **other** hand: the hold, the walk and the slam mirrored (left and right
   swapped: he's ambidextrous). Same pattern. **Finisher 2: his head blown off.** He's dead.
6. **Removed:** picking up his torn arm and clubbing with it, the one-armed flailing, the enraged stage.

## 4. The big lady: the bowling ball

- Faster (6.2 -> ~7.5 m/s), building speed quicker, **10% larger**.
- Walkers in her lane are thrown down and aside like pins; **she doesn't slow or stop** for them (only a wall, a big prop
  or the guard stops her).
- Heavy: footfall thumps growing as she nears, dust per step, drip stands rattling, a low rumble, her lane on the floor.
- Her cue comes late: 0.45 s before she reaches Yola (section 1).
- **Wall crash:** dodge her into a wall -> a hard crash (cracks, dust, a big shake), down ~2.5 s, dazed -> **the mark:
  her finisher.**
- Never untouchable.
- **Her finisher shoots her head off: no acid.** Any other death: the acid, redone (irregular splatter along her fall,
  droplets, bubbles and steam, a hiss, the floor etched darker, fading out).

## 5. Yola getting hurt: you notice it, it's not unfun

- **A red arc on the screen edge** toward the attacker, instead of the whole-screen flash.
- **Light hits:**
  - Her flinch, a small camera kick away from the blow and her grunt.
  - She never loses control: her attack and her movement carry on.
  - No world hit-stop: that stays the reward for *her* hits.
- **Heavy hits** (slam, charge, smash):
  - She's knocked down.
  - A short hit-stop and a bigger shake.
  - The colour drains for a beat.
- **Fair:** 0.8 s of grace after a hit; two zombies hitting at once count once.
- **Low health:** a heartbeat, darker edges, slightly muffled sound.
- **Optional (open):** win some of the lost health back by hitting back within ~3 s.

## Build order (the big pass)

1. **The dodge:**
   - the fixed-lead cue;
   - the cue dip and Witch Time (the leap's top-of-jump slow-motion removed);
   - judging at the press;
   - the direction arrow;
   - the button: grey at rest, pulsing yellow in the window, white for perfect, gold for FINISH.
2. **The open state + the gold mark + finishers by enemy kind; the 5% walker crit with the wide arc.**
3. **The guard:**
   - shielded except from behind;
   - the slam impact pass, with walkers as fodder;
   - finisher 1 (the arm flies);
   - missed -> he pulls the shield free;
   - the mirrored stage 2, then finisher 2 (the head);
   - the club / flail / enraged stages removed.
4. **The lady:** speed, size, bowling, heavy feel, wall crash -> finisher.
5. **Yola getting hurt.**
6. Check each in the practice room and the wave room; then the user plays on the phone (at High).

## Still open

- **The guard's mirrored stage:** a mirror of his existing clips is assumed. If it looks wrong, a proper left-handed set
  from the Animation Hub.
- **Win-back health:** parked (above).
