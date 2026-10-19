# Finishers, the action button, the guard, the lady, Yola getting hurt: the game plan

(2026-10-18 night, combat chat, a planning session with the user before "a big pass ... a big build". Nothing here is built
yet; the open decisions at the end are the user's.)

## Where it stands today (read from the code)

- **Finishers are in the real game, but only one way in:** perfect-dodge a walker's *pounce* (about a third of walkers
  pounce; the dodge button comes up quietly, no sign over it) -> that walker gets an amber ring on the floor for 2.4 s ->
  a fresh attack press while facing it within 3.6 m plays the finisher (slow motion, the camera in, the weapon's move;
  core/sim.js specialMiss / execTarget, core/player.js startExecution, render/execution.js). Rare and nearly invisible:
  most players will never find it.
- **The guard has no finisher.** His slam plants the shield; he heaves 3.4 s (his body open, but only from the front of
  the shield's old spot), then his arm tears off **on its own**. Before the slam, the shield blocks only frontal hits.
- **The lady has no finisher.** Running into a wall sits her down for 1.3 s. Her "bowling" stops at the first zombie:
  she trips on it (half the time she only staggers). Top speed 6.2 m/s, building at 4.3 m/s2 (Yola runs 3.3).
- **The dodge button lights too early (the user's complaint, confirmed):** it shows as soon as anything dodgeable starts
  winding up (the lady: the moment she spots Yola, up to 9 m away) and turns red "now" the moment she starts running,
  even 9 m out. The real moment (she's about to reach Yola) gets the same look as "she just started".
- **Yola getting hurt:** a red full-screen vignette flash, a 0.4 shake, a grunt, a 2.2 m/s shove, a small upper-body
  flinch, 0.55 s untouchable. Big hits (charge, slam) knock her down. Same "shake" language as hitting an enemy.

## 1. One rule for every finisher: Open -> Mark -> Press

A finisher only exists when an enemy is **open**: a state the player caused. Every open enemy shows **the same mark over
its head** (one gold icon, God of War style, not a floor ring), the centre button turns into **FINISH**, and a press
(the centre button or the attack button) plays it in slow motion. The window is short (2-3 s) and the mark shows it
running out. One code path for all enemies (sim: `z.open = { until, kind }`; render: the mark; player: startExecution
picks the move by enemy kind).

| enemy | how it opens | what the finisher does |
|---|---|---|
| walker | perfect-dodge its pounce (as now); knocked down or crippled (legs off) by Yola's blows | the weapon's finisher (as now): the burst / the head off |
| big guard | **his slam lands** (shield stuck in the floor) | Yola tears / hacks his shield arm off, in slow motion |
| big lady | **she slams into a wall** at speed and goes down | the kill, without her acid burst (the reward) |

A cooldown between walker finishers (~8-10 s) keeps them special; the guard's and the lady's are always available when
they open. During a finisher Yola is untouchable (as now) and nearby walkers are shoved back a step, so it's a breather,
never a trap.

## 2. The centre action button: one button, three looks

- **Resting:** always on screen, a dim grey outline, **not tappable**. Taps do nothing (no penalty, no early dodge).
- **Dodge:** lights only in the real window: from about 0.6 s before the hit lands (the lady: when she's ~1 s from
  reaching Yola; the guard: once he's in the air; a pounce: its last stretch). Its ring fills toward the moment; the last
  ~0.25 s it flashes white = **perfect** (slow-motion beat, the crit / the finisher opening). Any press in the lit window
  dodges clear.
- **Finish:** gold with the finisher icon while an open enemy is in reach.

The warning still comes early, but **over the enemy** (the sign over its head, the lane on the floor, the scream), not on
the button: the enemy says "it's coming", the button says "now".

## 3. The big guard (the God of War moment)

1. **Before the slam he can't be hurt:** the shield turns blows and bullets from any side (sparks, a clank, a "can't
   hurt him" read). The player's job: stay alive and read the leap.
2. **The slam:** the sign over him while he coils; the button lights once he's in the air; roll out (the auto-roll that
   picks a safe way already exists).
3. **After the slam he's open:** the shield is stuck, he heaves at it, he takes damage now, and **the mark appears over
   his head**. Press -> slow motion, Yola's finisher on the shield arm: it tears off (the tear, the stuck shield and the
   one-armed fight after it already exist).
4. **Missed it:** he wrenches the shield free (or what's left of it) and the cycle starts again: another slam, another
   chance. The finisher is how the arm comes off, never on its own.
5. After the arm: one-armed flailing, then the club (as now); his last finisher can take the head when he's low.

## 4. The big lady (the bowling ball)

- **Faster:** top speed 6.2 -> ~7.5 m/s, and she gets there quicker (accel 4.3 -> ~6.5): a lumbering first step, then
  she's flying.
- **10% larger** (body radius 0.41 -> 0.45 to match).
- **Bowling:** every walker in her lane is thrown down and sideways (the pins), and **she doesn't slow or stop** for
  them. Only a wall, a big prop or the guard stops her.
- **"Something heavy is moving":** footfall thumps that grow as she nears (a camera bump per step, scaled by distance), dust
  kicked up per step, loose props / drip stands rattling as she passes, a low rumble under the sound, the lane on the floor.
- **The wall slam:** at speed into a wall -> a hard crash (cracks, dust, a big shake), she's down longer (~2.5 s), dazed
  -> **open: the mark over her**. Side-stepping her into a wall becomes the play.
- **Never untouchable:** bullets and blows always land on her.

## 5. Yola getting hurt: you notice it, it's not unfun

Enemies get **interrupted** (stagger, hit-stop: that's the player's reward). Yola **doesn't lose control** on light hits.

- **Which way it came from:** a red arc on the screen edge toward the attacker instead of the whole-screen flash.
- **Her own hit:** a small camera kick away from the blow, her flinch and grunt, no world hit-stop (that stays the
  reward for *her* hits). A light hit never stops her attack or her movement.
- **Win it back (optional, Bloodborne's "rally"):** part of the lost health shows as a pale chunk on the health bar;
  hitting back within ~3 s wins it back. Getting hit becomes a push to fight, not a punishment.
- **Fair:** 0.8 s of grace after a hit (a subtle flicker); two zombies hitting at once count once.
- **Heavy hits are their own tier** (charge, slam, smash): knocked down, a short hit-stop, a bigger shake, the colour
  drained for a beat.
- **Low health (under ~30%):** a heartbeat, the edges darken, the sound muffles a little. Tension, not punishment.
- Phone buzz on Android (iPhone browsers can't vibrate).

## Build order (the big pass)

1. The centre button: the resting / dodge / finish looks and the real dodge windows per attack.
2. The open state + the mark + the finisher picking its move by enemy kind.
3. The lady: speed, size, bowling, the heavy-footstep feel, the wall slam -> open.
4. The guard: shielded before the slam, the slam -> open -> the arm-tear finisher, missed -> shield free and again.
5. Walker openings (knocked down, crippled) + the cooldown.
6. Yola getting hurt (direction arc, tiers, rally if picked, low health).
7. Check it all in the test rooms (combat.html?mode=calm&demo=execute, the wave room), then the user plays on the phone.

## Open decisions (the user's)

1. **Dodge at will?** With the button only lit in the windows, Yola can't dodge whenever she likes (as now: the dodge is
   reactive only). Recommended: keep it reactive.
2. **The guard's missed finisher:** he pulls the shield free and slams again (recommended), or the arm tears anyway (as now).
3. **The lady's finisher reward:** she dies without the acid burst (recommended), or the burst stays.
4. **Walker openings:** perfect pounce dodge + knocked down + crippled (recommended), or fewer / more (low health, a combo
   ender).
5. **Win-it-back health (rally):** in or out.
6. **Finisher moves for the guard and the lady:** reuse Yola's existing finisher clips aimed at the arm / the body
   (fast), or new moves from the Animation Hub (better, takes longer).
