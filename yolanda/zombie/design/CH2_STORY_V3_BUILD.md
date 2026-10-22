# Chapter 2, story version 3: what is built (2026-10-22)

From design/HANDOFF_NEXT.md (beats 1 - 18), Marc's dialogue pack (design/CH2_VOICE_LINES_2026-10-22.txt, the recordings in
assets/neighborhood/voice/c2_*.mp3) and design/CH2_AUDIO_DIRECTION.md. Code: src/hood/level.js (the story), script.js (the
lines), actors.js (Adam, Sophie), music.js, view.js, hood.js. The bot plays it through: `hood.bot()` (COMPLETE at ~230 s game
time); `hood.bot({ shots: true })` saves a frame of every camera shot to zombie/shots/; `?cinecheck=1` logs anything solid
between a shot's lens and what it frames (hood.cineLog).

## The stops (checkpoints) and where things are

| Stop | Beats | Where |
|---|---|---|
| sneak | 1 - 3 | start behind the striped barricade on the loop road's south end (45.6, 80.4), crouched; the two looters in a drive's mouth by the east row (51.6, 31) and (52.6, 32.6) |
| house | 4 | James at the kitchen's fridge (`james_fridge`); the second fridge in the garage on the party wall (`gfridge_use`, `seal:fridge2`) with the beer in front of the case |
| rescue | 5 - 7 | Sophie and Adam's drive at the court's west end (Marc's picture): their wagon nose-in, two suitcases and a bag behind it (ch2_notes.py `story3`) |
| gate | 8 - 9 | the club gate; the busted house is B06-L's open garage just left of it: the crowbar and the batteries on its bench under the lamp |
| club | 10 - 11 | the walk's fight; Sophie and the case by the portico's east post; the suppressor on the office desk (`keys`) |
| lot | 12 | Pete at (74.6, -67.2), between the crashed pickup and the box truck (Marc's X) |
| dock | 13 | the boat is moored off the pier's north side (its placement, about -28, -84; the old `boat` mark is on the pier) |
| shed | 14 | the shed moved up the bank: door ~18 m north of the pier's shore end (-17, -99.5), its dumpsters to its east |
| horde, after, leave | 15 - 18 | the pier |

## Choices I made (say if any is wrong)

- **Only the new script's lines** (Marc, 2026-10-22: "Cut every line that isn't in my new script. Keep only the James and Pete
  recordings the script said to reuse"): the 70 new lines, James's J01 and scream, Pete's P01 - P03. No barks, no overheard
  subtitles, nothing of the earlier pack's calls. So: the opening call is 106, 107, 103, 108 (Marc's whispers on the radio
  badge, unfiltered as recorded); Yola's call goes 706 straight to 711; the last call is 1206 and 1208; beat 2's overhearing
  and the engine and the six on Sophie have no voices (the script has none for them).
- **The noise rule at the clubhouse**: from "don't use your gun" until the suppressor, the first unsilenced pistol shot stirs the
  horde (a look at it turning), the second brings it.
- **Music**: the letters were matched to the files by name (Suburban Wasteland = A, Silent Grief = B, 永進の脅威 = C,
  Calm Water = D). The headphone leak is off (skipped for now).
- **The guidance marker** shows whenever the next spot is over 5 m away and nothing is being fought (it was "on request");
  Settings' "Stronger guidance" (now on by default) turns it off.
- **The radio**: a small round face of whoever is speaking, top right, a ring pulsing with the voice; no words on screen (Marc).
- **Crouched**: only through the title and the opening look (Marc: "game play should never be crouched").

## Open

- Lines for the overheard looters (beat 2), if wanted.
- Marc's one-handed carry: the case hangs from his left hand when it is down, rides at his left side when the pistol stance
  holds that hand up. A real one-handed hold clip is the animation chat's.
- The crouched sneak is the library's crouch walk played at his pace over his own moves (held still when he stops).
- Who Sophie really was; the cooler is not shown open (the case at her feet tells it).
