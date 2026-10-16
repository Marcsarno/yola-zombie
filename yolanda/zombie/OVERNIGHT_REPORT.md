# Overnight report: 2026-10-15 to 2026-10-16

This round covers two requests:
- the overnight handoff (Yola_Overnight_Claude_Handoff plus the Opening V3 package);
- the play-and-polish pass that followed it.

## Where things are

| | |
|---|---|
| **Rollback point** | Tag `checkpoint-pre-opening-v3` (commit 452925a), the build as it stood before this round. |
| **Latest commit** | On branch `opening-reveal`. Nothing has been pushed. |
| **Live build** | https://yola-zombie.vercel.app/zombie/combat.html?intro=1 (production; the previous deployment is one rollback away in Vercel). |
| **Download** | `yolanda/Yola_Zombie_build_2026-10-16.zip` (62 MB, runnable; see HOW_TO_RUN.txt inside). |
| **Screenshots** | `recordings/round17/`. They are real captures from the browser. No video was recorded. |

The opening takes about 3:35 at real speed, answering each card with one wrong pick first.

## Changelog

### Opening (handoff priorities 1 and 2)

**Script and audio**
- The reviewed 33-line script uses take B for every line.
  - Line 32 ("Behind me.") is never played. Its files and number are kept.
  - Line 33 plays once, after control returns.
- The take A files stay in `assets/opening/voice` for review.
- Lines play on their own dialogue channel, and the music dips under them.
- The scene moves on when a line has actually finished playing. If no clip plays (sound muted before the first tap, a failed load, a silent skip), the line runs on its measured length instead. The trailing silence of each clip is trimmed.
- Each clip's level is matched at playback. Levels were measured in the browser: no clipping was found; line 29B is quiet and 30B/31B are shouted. The MP3 files are untouched.

**Captions and cards**
- Captions are off by default; the CC button turns them on, and the choice is remembered.
- The three clinical cards use your reviewed text and answer keys:
  - a wrong answer is struck through, shows its hint, and the card stays open;
  - the right answer shows its success line, a "Why?" explanation where the script has one, and Continue;
  - nothing is scored, and no unsafe action is shown.

**The journey**
1. Outside, then the narrated tour, kept as it was.
2. The athlete and his guard arrive and walk up to reception (line 01).
3. The office, with both visitors seated: lines 02 to 10, Card 1, line 11.
4. The colleague brings a wheelchair (lines 12 to 14). On line 15, Yola turns to the guard and the shot frames him.
5. A clean cut to the athlete seated in the wheelchair, with the guard carrying the bat.
6. A real ground-floor elevator (the same kit as Floor 3's lift): the doors open, the group goes in, the chair turns to face the doors, the doors close, and the floor display climbs G, 1, 2, 3.
7. The same lift opens into the Floor 3 operating suite (line 16). He changes off camera; the guard and the bat wait outside by the belongings table.
8. Lines 17 to 19, then Card 2 at the anesthesia workstation, then lines 20 and 21.
9. "Later in the procedure", then line 22 and Card 3 (TOF ratio 0.78), then line 23.
10. "A few minutes later": TOF 0.96, with the other readiness checks ticking off before extubation.
11. The handoff (lines 24 to 26). The colleague stays at his head, and Yola steps out to the Supply Hall.
12. A quiet beat, then the crisis:
    - the alarm (line 27);
    - the nurse checks his pulse before "There's no pulse" (line 28);
    - compressions start right away;
    - he moves and his head turns (line 29);
    - the calls for Yola (lines 30 and 31).

**The painted breakthrough**
- The last frame is captured, turns into a painting over about one second, and the bat finisher smashes through it at its contact frame.
- It breaks into ten pieces, with the outbreak version of the same room behind.
- The strike frame is held for a beat, the camera pushes in, then it settles to the gameplay camera with control in about 1.5 s.
- The old Yola model is never broken apart, and no name card covers her.

**Hand-off into play**
- Yola starts holding the bat.
- The operating room's zombies now include the white-clothed patient and a nurse.
- The leftover opening guard body is gone from the level. His blood and pistol remain.

**Room fixes**
- The office monitor moved to the end of the desk; it had hidden Yola's face from the visitors.
- Sharps containers added.
- The reception poster is no longer behind the water cooler.
- The two treatment bays now have treatment recliners in three upgrade tiers. I modelled them in Blender (`tools/anim/make_recliner.py`), since the kit had none.
- The operating-room light hangs over the knee instead of the patient's head.
- The operating room has a clean, light backdrop before the outbreak.
- After the outbreak, the red light is selective (under the lights and at the doors) instead of tinting the whole room pink-purple. The fill light is cooler and lighter, and blood marks sit where the story happened.
- The OPERATING ROOM sign now hangs over the room's own doorway, and the maintenance direction sign sits beside that exit (your note).

### Music, shield and enemies (priority 3)

**Music**
- Your Agile Groove streams into the game: a quieter, filtered version while exploring, full when fighting.
- It switches with a distance buffer and a 3-second minimum between switches, so it does not flicker on and off.
- It starts on the breakthrough impact, and on skip or continue.
- The pause menu now has separate Music, Effects and Voices levels.

**Shield (v2 package)**
- The package's controller is used unchanged. The GLB hash matches its manifest.
- It is fitted once per life into the guard's closed left fist in his hold pose, then follows the hand, so the grip never slides.
- Frontal hits go to the shield: it cracks (hairline, then heavy) and breaks after 190 shield damage. Melee is the best tool against it: melee x1.5, shotgun x0.9, pistol x0.7.
- When it breaks, the five pieces fall under the game's own physics (never the baked clip at the same time), fade after 5 seconds and clean themselves up. The hold stops at once and he staggers, open to hits.
- Hits on the shield make a board knock and splinters, with no blood, no severed limbs and no headshots.

**The orderly's charge**
- A 0.7-second wind-up, with a lane growing on the floor.
- A straight, committed run with no homing.
- After a miss she brakes, turns, pauses, and needs a fresh wind-up.

### Play-and-polish loop

- **Feet planted through every melee swing.** The axe and fists skated their planted feet (median 0.65 m/s). Now 0.
- **One jolt per swing.** One impact sound, one shake and one camera kick per swing however many zombies it catches; each body still gets its own flash and spray.
- **Shotgun up close.** Inside about 2.6 m it adds a heavy body thump and a flash on the nearest body.
- **Effects cap.** Effect sounds are capped, so the same sound plays at most twice in 60 ms and no more than 14 effect sounds start within a third of a second.
- **Crowd spacing.** Waiting zombies keep about a metre from each other: median gap 0.65 to 0.85 m, with a bit more pressure on Yola.
- **Crawlers stay down.** A legless zombie used to stand up on its stump to attack. It now coils and lunges along the floor.
- **Saved settings reset.** A tuning panel saved by an older build could keep the 0.07 s melee slow-motion; the tuning version bump resets it.
- **Wall cut-away.** Walls no longer flicker when Yola walks along a wall's line.
- **Short phones.** The choice card fits a 320 x 690 screen without covering the patient monitor.
- **Test health.** Health is infinite for testing, as you asked: hits still flinch her, push her and knock her down, but no health is lost.

## Tests actually run

All of these ran in the desktop browser pane, in phone-sized emulation (375 x 812) unless noted. **No physical phone was tested.**

**Full opening at real speed, twice, with sound**
- All 31 lines played from their clips.
- Each card was answered wrong once, then right; the retry hint showed, then success.
- Line 33 played after control returned, and the combat music came on.

**Dialogue edge cases**
- Hiding the page mid-line froze both the line and the story, and they resumed together.
- Muting mid-line kept the timing.
- Lines never overlapped.
- Skip stopped the voice and the narrator.
- Replay restarts the narrator.

**Screen sizes**
- Cards and the monitor checked at 320 x 690, 375 x 812 and desktop 1280 x 720.
- The full painted breakthrough was checked frame by frame in portrait and landscape.

**Shield**
- Seen from the front, side and rear, during a hit reaction and during the slam. The grip is inside the fist.
- Damage states and the break into five falling pieces were checked by eye.

**Orderly**
- Wind-up lane, a sidestep making her miss, braking, then a fresh wind-up.

**Crawler (dedicated test)**
- The leg came off; he fell, crawled the whole way, attacked 5 times and hit 3 times.
- His head never rose above 0.6 m. He did not slide or overlap.

**Crowd frame times** (real frame loop, axe held into the crowd, `tools/crowdtest.js`)

| Zombies | This build: avg / 95th percentile / worst (ms) | Rollback build: avg (ms) |
|---|---|---|
| 10 | 7.8 / 14 / 35 | 7.7 |
| 15 | 9.4 / 14 / 21 | 9.1 |
| 30 | 15.5 / 21 / 118 | not run |

- The 118 ms worst case at 30 zombies was a single spike while 20 extra zombie models were being created.
- No melee slow-motion was triggered.
- **This is a desktop graphics card; phone performance is unmeasured.**

**Floor 3 scripted session**
- Fought through the operating room with the bat (11 kills), walked to the Waiting Area and picked up the pistol, fired 22 shots including a reload, then paused and resumed.
- No errors.

**Node combat tests** (`tools/tests`)
- Identical results to the rollback build: bat hit grid 32/42, the combo sequence, crowd melee, and glide.

**What could not be judged**
- I could not listen to the audio. Pronunciation, acting and mix balance were not reviewed by ear, only measured.

## Unresolved or uncertain

**Not done by decision**
- Your gore plan for the big lady and the guard (arms off at the shoulder, the burst and the acid) was not built. The polish brief said no new systems tonight. It is written up in PROGRESS.md, ready for the next round.

**Not verified**
- Physical-phone feel and frame rate.
- How the voices sound, including how "Yola" and "rocuronium" are pronounced.
- The elevator journey has no dialogue for about 27 seconds (from line 15 to line 16). It is a deliberate quiet beat, but you may want it shorter.

**Open questions**
- The painting treatment is a light brush-and-canvas pass over the captured frame. Whether it reads as "painted" enough is your call.
- Treatment recliners: the room's bay lamps still stand at the foot of each chair.

**Live-site limits**
- The live site leaves out the raw packages, the Mixamo files and the Move Library bake. Those include licensed clips that should not be served raw. As a result, the Weapon test arena and the Rig Lab only work locally.

## The three design choices

1. **The elevator's live floor display.** A small amber panel climbs G, 1, 2, 3 with a ding, so the ride reads in two seconds of screen time without a long cab scene.
2. **Holding the strike frame.** The bat's pass through the picture is timed to the finisher's real contact frame and held for a beat, with a push-in on the strongest pose and the music change landing on the impact.
3. **Blood that tells the story.** After the reveal the room keeps the story's marks: under the head of the table where he turned, a drag toward the Supply Hall, handprints on the dead lift, and a hand where the guard waited. The red emergency light is pulled back to pools, so these marks and the zombie silhouettes read.
