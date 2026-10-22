# Chapter 2: audio direction (Marc, 2026-10-22)

Audio direction for Chapter 2 only. No story changes. Beat numbers are design/HANDOFF_NEXT.md's. Four music tracks, all in
D minor (assets/neighborhood/music/):

| | Track | File | From Marc's files |
|---|---|---|---|
| A | Tension: sparse dark ambient, no drums, the main loop | ch2_a_tension.mp3 | Suburban Wasteland.mp3 |
| B | Grief: slow solo piano and cello | ch2_b_grief.mp3 | Silent Grief.mp3 |
| C | Action: driving drums and strings, finale only | ch2_c_action.mp3 | 永進の脅威.mp3 |
| D | Leaving: calm, somber, hopeful, plays once | ch2_d_leaving.mp3 | Calm Water.mp3 |

(The letters were matched to the files by their names: tell me if any is the wrong way round.) There is no track E. James's
headphone music is skipped for now (the old synthesized leak is out too).

Music follows the STORY STATE (the beat the player has reached), never a timer. It must survive any order of optional
pickups, a death, and a retry from a checkpoint (resume the right track for the current beat).

- Beat 1: black and the title have no music, only ambience (wind, a far shot). Fade in A after the camera look at the far looters.
- Beats 2-4 (overheard looters, the house, James): A, very low. No music at the moment of the shot.
- Beat 5 rescue fight: A, a little stronger. No action track.
- At the husband's "Hey. I've got you." cross-fade to B. Keep B through the turn, the reveal, "it only works before," and the boat deal.
- Beats 7-9 (radio light, gate, busted house, Yola's call): B fades out as they leave, A returns at the gate. Duck under the radio call.
- Beats 10-11 (walk, clubhouse): A. At Sophie's "don't use your gun" and the horde look, drop to a near-silent drone. Melee inside: A, no drums.
- Beat 12 (Pete, silenced pistol): A, kept quiet.
- Beat 13 (dock, cooler): A, sparse and low.
- Beat 14 (the engine): cut ALL music at the cough and roar so the engine is heard.
- Beats 14-16 (the horde runs, Sophie's attack, the shotgun fight): C starts when the horde starts running (the camera look at
  the playground). Keep it until the last zombie dies.
- Beat 17 (Marc over Sophie): hard cut to silence. No music. A held silent beat.
- Beat 18: D fades in as he fuels the boat. Quiet under the last radio call. Plays once to the end card.

Rules: cross-fade 2 to 3 seconds unless I say cut. A and B loop, C loops until the fight ends, D plays once. Keep all music
low in the mix and duck under voice lines and radio calls. Gunshots, the engine, zombie groans, Sophie's whispers and the
looter chatter must always read clearly. The silence at beat 17 matters more than any track. Don't fill it.

## How it is built (src/hood/music.js, level.js `music()`)

Each stop sets its own cue as it starts (so a retry resumes the right one), and the story sets the beat's cues within it:
`none`, `A_low`, `A`, `A_up`, `drone` (A at a whisper behind a 420 Hz low-pass), `B`, `C`, `D`. Cross-fades are 2.5 s; the
cuts (James's shot, the engine, the last of the horde) are instant. The music bus ducks under every spoken line (audio.duck).
The tracks stream from audio elements (no whole-file decode on a phone), each played silently once inside the first tap so
iOS lets it start later. The wind bed runs under everything, low.
