# SOUND PLAN — making Yola's audio feel AAA

This chat (started 2026-10-17) works ONLY on game sound and sound effects. Files it owns: `src/audio.js`, new
`src/sfx/*`, new `assets/sfx/*`, this file. Shared: `src/main.js` (only the `audio.play(...)` hooks), `dist/combat.js`
(commit bundles via `sh tools/clean_dist.sh`). The opening's own audio (`src/opening/opaudio.js`) belongs to the
opening chat; `src/music.js` stays as it is (the user: one steady music level).

## Why it sounds weak today (diagnosis)

1. **Every effect is synthesised** from white noise and sine/saw oscillators (`src/audio.js`, ~40 sounds). No recorded
   sound at all, so guns, bats and zombies sound like 8-bit "beeps and hiss" rather than real objects.
2. **The weight lives where a phone can't play it.** The punch of the shot, the bat and the body thumps is a 38-120 Hz
   sine. Phone speakers roll off below ~200-300 Hz, so on the device the user tests on those layers are nearly silent:
   only the thin hiss is left.
3. **One layer, no variation.** Each sound is the same every time (no round robin, no pitch/volume randomness), so
   repetition makes it feel cheap within seconds.
4. **No space.** Everything is mono, dead centre, same loudness at any distance, no room reverb. A zombie across the
   ward sounds exactly like one on Yola's shoulder.
5. **No mix processing.** No compressor or limiter on the master, so gains are kept low to avoid clipping, and big
   moments can't be louder than small ones.
6. **Whole categories are missing in gameplay:** Yola's footsteps, clothing and weapon foley, her effort/pain voice,
   zombie footsteps and drags, real zombie vocals (today: a 90 Hz sawtooth "groan"), blood/gore, shell casings, body
   falls with variety, room ambience (hospital hum, fluorescent buzz, alarms, distant moans), proper UI sounds.

## What "AAA" means here (the techniques)

- **Layering**: every important sound = transient (the crack) + body (the punch) + tail (the room) + detail
  (mechanics, debris, blood). Built from recorded sources, mixed per event.
- **Variation**: 3-6 takes per sound, random pick (never the same twice running) + small pitch/volume jitter.
- **Phone translation**: the weight carried at 150-500 Hz plus gentle saturation so the bass is *implied* on small
  speakers; the real sub still there for headphones.
- **Space**: stereo pan from the screen position (the camera is fixed, so left-of-screen = left ear), distance
  falloff, a room reverb per area (small office, long corridor, stairwell, lift shaft).
- **A real mix**: master compressor + limiter, priority/voice stealing (already partly there), a short duck of the
  ambience under the biggest hits so they "punch through". Music untouched.
- **Feedback sounds** the player feels without thinking: hit-confirm and kill-confirm layers, a distinct headshot,
  the shield-break crack, a low-health heartbeat and muffle, reload ticks synced to the animation frames.

## The phases (each one is playable and judged by the user in the game before the next)

**Phase 0 — the engine** (no new sounds yet, nothing audible changes)
Sample loader + sound banks (variations, jitter, layers), stereo pan + distance from world position, convolution
reverb per area (generated impulse responses, no big files), master compressor/limiter, mobile-friendly format
(AAC .m4a; decoded size budget ~25 MB). The current synth sounds stay as the fallback, and the pause menu gets an
**old / new sound toggle** so the user can A/B every phase.

**Phase 1 — guns** (the biggest payoff)
Pistol and shotgun: crack + body + indoor tail + mechanics; shell casings tinkling on the tile; dry fire; reloads in
2-3 parts synced to the clip frames; pump rack; point-blank shotgun = an extra flesh/gore layer.

**Phase 2 — melee and gore**
Bat (wood crack + flesh), axe (blade bite + chop), fists/kick (slaps and thuds), sledgehammer (huge crunch), swing
whooshes sized by weapon, clank on walls, sever, the gib burst (big wet explosion + pieces raining down), blood
splats, body falls on tile. A kill-confirm layer on the hit that kills.

**Phase 3 — zombies**
A vocal set per type (patient, nurse, orderly, sprinter, guard): idle moans, alert, attack telegraph (the cue to
dodge), hurt, death. The sprinter's scream before the charge, the guard's roar and slam. Shuffling/dragging feet.
All positional, so the player can hear where they are off-screen.

**Phase 4 — Yola**
Footsteps on tile/linoleum/blood, scrubs rustle, weapon rattle while running, efforts on swings, pain on hits,
knockdown, low-health heartbeat + muffled world.

**Phase 5 — the world**
Ambience bed per floor (ventilation, fluorescent buzz, distant alarm, far-off screams and banging), door/barricade
sounds, lift (motor, cables, ding), pickups, objective and UI sounds.

**Phase 6 — the mix pass**
Final loudness and priorities, checked on the phone speaker AND headphones.

## Where the sounds come from (decision needed from the user)

- **Free libraries** — Sonniss GDC bundles (tens of GB of pro-recorded guns, impacts, foley, ambience; royalty-free
  for games), Kenney audio and Freesound filtered to CC0. Raw packs stay in the gitignored `assets/source/` (like the
  Kevin Iglesias files: the GitHub repo is public); only the edited in-game bank ships.
- **ElevenLabs sound effects** (the user already uses ElevenLabs for the narration) — best for character-specific
  sounds: zombie vocals per type and Yola's efforts/pain. Costs credits: agree a spending cap first.
- Recommended: libraries for guns, impacts, gore, foley and ambience; ElevenLabs for the voices.

## Yola's voice (the user, 2026-10-17) — rules for Phase 4 efforts/pain lines

- Keep her consistent with the opening recordings: made with **Runway's generate_speech** tool, model **eleven_v3**,
  voice **Niki** (a stock voice, not a custom clone), language **en**. One MP3 per line, two takes each: Take A plain,
  Take B with `[confident]` before the line (e.g. "[confident] Hi. How's that knee treating you?"). The user prefers
  **Take B**: that is the performance reference — conversational, clear, confident.
- Keep approved audio where possible. Omit "Behind me."
- The saved requests have NO stability, similarity, speed, seed or numeric ElevenLabs voice ID: never invent them.
  If using ElevenLabs directly, verify it is the same voice preset (a matching name alone does not prove it).
- Yola is separate from the intro narrator. Other voices: Brodie = the patient, Wanda = reception, Leslie = the
  anesthesia colleague.

## Sources used so far (raw files kept in the session scratchpad only, never committed)

| Source | Licence | Used for |
|---|---|---|
| The Free Firearm Sound Library, "Prepared SFX Library.7z" (opengameart.org/content/the-free-firearm-sound-library) | CC0 | pistol (Walther PPQ near x3, 1911 near x2), shotgun (Benelli Nova, Winchester Model 12, Charles Daly, Mossberg 190: near x2 each), the Model 12's pump rack |
| "handgun reload sound effect" reload.wav by zer0_sol (opengameart.org/content/handgun-reload-sound-effect) | CC0 | mag out, mag in (also the shotgun shell insert, pitched up), slide, dry-fire click |
| synthesised in tools/sfx/build_guns.py | — | brass casings (9 mm on tile), shotgun hulls — ALL REJECTED by the user (2026-10-17): no synthesised foley |
| Kenney Impact Sounds (kenney.nl/assets/impact-sounds) | CC0 | punches, wood/plank/metal/glass/soft impacts, footsteps (concrete/carpet/wood); tinks pitched up as casings |
| Kenney RPG Audio (kenney.nl/assets/rpg-audio) | CC0 | blade chop/slice, doors, creaks, cloth, clicks/latches, footsteps, leather/coin handling |
| "Shotgun Reload Sound effects" shotgunsounds.zip by zer0_sol (opengameart.org) | CC0 | real shell inserts, full pump rack, shell chambered |
| "Punch" qubodupPunch.7z by qubodup (opengameart.org) | CC0 | body punches |
| "thwack sounds" thwack-1.0.zip by AntumDeluge (opengameart.org) | CC0 | hard thwacks/cracks |
| "Squish Sounds Effects" by EZduzziteh (opengameart.org) | CC0 | 8 small wet squish/splat MP3s (low bitrate) |
| "Zombies Sound Pack" zombies.zip by artisticdude (opengameart.org) | CC0 | 24 zombie vocals: moans, attacks, pain, deaths |
| "Monster Sound Pack, Volume 1" monster-sounds-volume-2.zip by Ogrebane (opengameart.org) | CC0 | 18 bright monster yelps/screeches |
| "Monster Sound Effects Pack" monster_sfx_pack.zip by Ogrebane (opengameart.org) | CC0 | 10 dark beast growls/grunts/deaths |
| "monster snarls" (5 OGG reels) by Darsycho (opengameart.org) | CC0 | snarls, split one take per cry |
| "80 CC0 creature SFX" 1 + 2 by rubberduck (opengameart.org) | CC0 | roars, screams, hurt, attack, die, grunts, breath, eat, slime, stomp |
| "Ghost Monster Voice Moaning & Growling" qubodup-GhostMoans.zip (opengameart.org) | CC0 | long moans, pitched down for zombie moans, the far horde, the guard's death |

Zombie library: `tools/sfx/build_zombies.py <scratch with the unpacked packs> .` -> assets/sfx/zombie/*.mp3 (258
takes, ~3.8 MB) + src/sfx/zombies.gen.js. Unnamed clips are sorted by what they measure as (length, dark/bright,
builds/dies away) and labelled that way; the guard's versions are the same recordings pitched down; boss stingers are
real roars reversed into themselves; the floor breach is Kenney thuds slowed -14 st + a wood crack.

Candidate library: `tools/sfx/build_library.py <scratch with the unpacked packs> .` -> assets/sfx/lib/*.mp3 (173
takes, ~0.9 MB) + src/sfx/library.gen.js (groups + labels). The game downloads only the takes in use (selection.json);
the board loads everything.

Rebuild the bank: `python tools/sfx/build_guns.py "<...>/Prepared SFX Library" <...>/reload.wav assets/sfx/guns`
(needs numpy, scipy, soundfile; the near-mic shots are cut at the transient, a "phone punch" harmonic layer is added
under the 40-180 Hz body, peak -1 dBFS, MP3).

## How the engine works (Phase 0, src/audio.js + src/sfx/)

- `src/sfx/banks.js`: each sound = layers (takes picked at random, never twice running; pitch/level jitter; delays;
  reverb send; synth layers mixed in). A name without a loaded bank falls back to the synth in audio.js.
- `src/sfx/samples.js`: fetches the files while the game loads, decodes on the first tap, trims MP3 lead-in.
- `audio.play(name, k, pos)`: `pos {x, z}` pans by screen position (fixed camera) and fades/dulls with distance
  from Yola; more room reverb when far. main.js supplies `audio.spatial`.
- Mix: effects bus -> gentle compressor (new mode) -> master -> limiter (-2.5 dB). Generated ~1 s room IR.
- Pause menu "Effects: new / classic" (stored as sfxModern) — classic = the original synth only, dry and centred.

## The Sound Board (sounds.html) — where the user judges every sound

`/zombie/sounds.html` on this chat's server (port 5177; it needs tools/serve.mjs's /__sfx save, so a server started
before 2026-10-17 must be restarted). Every bank, layer and take: play solo / in the full mix / repeat x6 / the old
synth version; keep or reject takes (candidates, in amber, join the game only when kept); level trims per take, layer
and sound; notes per sound for Claude; phone-speaker and left/right/distance simulation.
Every take says plainly what it is: "Already in the game" / "New option" / kept / added / "Saved for a future weapon"
/ rejected, with only the buttons that make sense (Keep · Save for later · Take out; Add to game · Save for later ·
Reject; Undo). Choices are per sound (keys "<sound>:<file>"); "Also used by" names other sounds sharing a file.
Filters (to review / in the game / saved / rejected), "N of M reviewed", "Next to review". **Saved for future
weapons** (sidebar, Library): takes the user liked for another gun, each tagged with the weapon it is for — start
there when building a new weapon's sounds. "Save choices" writes
assets/sfx/selection.json, which the game reads on load (src/sfx/samples.js). Read the user's notes there before
changing a sound. Works from a phone on the home network too (the save accepts private LAN addresses).

Board upgrades (2026-10-18): sidebar grouped Weapons / Zombies / World / Coming next with sub-groups and progress
bars, a search box ( / ), a sound picker with ◀ ▶ on the phone; overall "N of M takes reviewed"; ■ Stop (Esc) cuts
everything (audio.resetVoices); ▶▶ Play all per layer and ▶▶ Audition the rest (A) play takes one after another —
decide with the keys as each plays; bulk "the N left: reject / later" per layer; Undo (Ctrl+Z); autosave (default
on); a playhead on the waveform; take lengths; folding layers; it remembers the open sound, filter and folds; each
sound says when the game plays it ("hook") and whether an old synth version exists.

## Log
(newest at top)
- 2026-10-18: zombie round: 258 CC0 zombie / creature takes in 17 new sounds — Every zombie (idle moan, spots Yola,
  attack wind-up, bite lands, hurt, death + body fall), Sprinter (scream, charge, death), Guard boss (roar, attack
  grunt, ground slam = boom + debris + roar + sub, arm-torn pain, ENRAGED = roar + boss stinger, death + huge fall),
  Horde (far moans: not wired), floor breach (wired to floorBreach). main.js hooks pass each zombie's place; the
  guard / sprinter get their own voices by kind; new names fall back to the old synth (SYNTH_ALIAS) until picked.
  Another chat added src/sfx/cues.js (synthesised combat cues: warn, dodge, slow-mo, crit, rumble...): left as is.
  The user's picks so far: bat 5, axe 3, gore 2, fist 2, shield 2, door open/close 1 each, footstep 1, swap 1,
  pickup 2. Not yet tested in a real fight: the sprinter / guard sounds (practice room has only normal zombies).
- 2026-10-17: the user's first picks: pistol 01-06 in; pistol 07, 09-14 saved for a future **rifle** (the user's
  words); 08 and every synthesised casing/hull/dry click rejected; ALL close shotguns rejected, the 4 distant
  long-echo shotguns in (they want the big wild blast); pump: forward kept, back rejected; mag out rejected.
  Then "find more": 173 real CC0 candidates (shell inserts, full rack, casings from real tinks, mag drops, clicks;
  new Melee hits / World / Coming next sounds — melee picks replace the synth live). Fix: a sound now plays when ANY
  of its layers has kept takes (the pump and pistol reload had fallen back to the synth because their first layer was
  empty). The game now fetches only the takes in use.
- 2026-10-17: the user asked for friendlier reviewing: "save for a future weapon" (tagged with the weapon type),
  "this is already part of the mix" labels, per-sound choices, filters and next-to-review.
- 2026-10-17: the user: "some are ok, some are not" -> the Sound Board. Added candidates: pistol_06-14 (Bersa .380,
  S&W 642 .38, Ruger Mark III .22, 1911 + PPQ from further off) and shotgun_09-12 (each shotgun from further off,
  long rolling echo).
- 2026-10-17 (Phase 0 + 1 built): the engine above + the gun banks: pistol shot (5 takes + sub + room + brass),
  shotgun (8 takes + sub + room), Model 12 pump (back/forward + hull), pistol reload (mag out/in, slide on done),
  shotgun reload (4 shell inserts), dry fire. Bullet impacts/ricochets/shield/clank/slam now positioned (still synth
  sounds: Phase 2). Measured through a phone-speaker filter (>300 Hz): new pistol ~7 dB louder than the old synth,
  reloads ~13 dB; mechanics set ~10 dB under the shots. NOT yet heard by the user: judge on the phone + headphones.
- 2026-10-17: plan written; nothing built yet.
