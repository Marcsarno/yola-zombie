# Yolanda’s Specialty Medical Center

A Two Point Hospital–style management game with a CRNA / anesthesia theme. It ships as **one offline HTML file**
(`dist/Yolanda-Specialty-Medical-Center.html`, ~34 MB, 3D models and art embedded) and also contains the
**Anesthesia Shift** prep minigame (`?mode=shift`) and a free construction sandbox (`?mode=builder`).

Open the HTML file in a current Chrome, Edge, Firefox or Safari. Progress autosaves in the browser.

## Building from source

```
node tools/build.mjs          # → dist/Yolanda-Specialty-Medical-Center.html
node tools/check.mjs          # syntax-check the assembled code
node tools/build.mjs --fresh  # re-pack assets (normally cached in dist/.assets.packed)
```

| Path | What it is |
| --- | --- |
| `src/game.js` | The game engine, unminified (Three.js + hospital simulation + shift minigame + builder). |
| `src/mods/*.js` | The career layer. Concatenated into `game.js` at the `/*@@MODS@@*/` marker, in file order. |
| `src/shell-head.html`, `src/loader.html` | HTML shell and the offline loader that unpacks assets. |
| `assets/` | Every model, texture and stylesheet referenced by URL. Packed into the HTML at build time. |
| `tools/` | `build.mjs`, `check.mjs`, `asset-index.json` (asset list with MIME types). |

`src/game.js` is the original build output run through Prettier, plus the targeted fixes listed below. The mods
run inside the same closure and use the original minified names (`ct` staff roles, `Ci` cases, `vh` equipment tokens,
`$n` simulation, `eu` hospital controller, …); each mod file documents what it touches.

## What the career layer adds

Start from the title screen: **New career** (furnished and staffed, ready to open), **Tutorial** (Opening Day on the same floor plan, which hands over to career mode) or the **Construction sandbox**.
The Yolanda’s-shift minigame is on hold and no longer linked from the interface.

* **Endless demand and reputation.** The fixed appointment list is gone. Bookings follow reputation (0–100%), prices
  and events, capped by hospital size. Patients have patience: long waits, unmet toilet needs and boredom drop their
  mood; unhappy patients walk out and cost reputation.
* **Three-star progression** with goals per star, cash rewards, larger loan limits and unlocks.
* **Ten procedures** across Endoscopy and a new **Operating room** (cataract, dental, knee, gallbladder, cardiac
  ablation, spinal fusion, ERCP). A case is only routed to a room that has all its equipment.
* **Operating room** furnished template (surgery table, anesthesia workstation, AirReady, supply cart, IV stand).
* **Staff skills, traits and a hiring market.** Five skill levels, traits (Quick, Tireless, Frugal, Meticulous,
  Mentor), wages that scale with skill, experience from real work, paid courses and severance.
* **Research.** Twelve projects unlock procedures and permanent perks; funded by a daily budget.
* **Finance.** Per-procedure pricing, interest-bearing loans, daily ledger and chart, wage/upkeep accounting.
* **Complications.** Risk depends on case, team skill, fatigue, equipment tier and research.
* **Random events.** VIP visit, emergency transfer, seasonal surge, board inspection, equipment fault, donation,
  press feature.
* **Equipment upgrades.** Every core station (anesthesia workstation, endoscopy tower, stretcher, operating table,
  AirReady, SedaPrep, ThermaNest, IV stand, supply cart) can be upgraded to the Standard or Advanced kit model.
  Upgrades change speed, prep time or complication risk. (Reception already had one.)
  Everything **starts at the shabby Starter tier** (mismatched chairs, plain desk, basic equipment) and the three
  tiers use the supplied Starter / Standard / Advanced models.
* **Starter layout.** The career opens in a spine-and-concourse floor plan built from the game’s own room
  templates: Starter lobby (one desk, only **four mismatched chairs** — the seating squeeze is the nudge to upgrade),
  Assessment, Restroom, Janitor, Endoscopy and Recovery. Nicer lobby fittings (Standard chairs, Sculpted bench,
  upgraded desk) lift waiting patients’ mood by up to +12; floor finish, wayfinding and posters are cosmetic for now.
* **Clinical decor.** Assessment and Recovery get anatomy wall art, service headwalls, bay and room signs from the
  Clinical Identity Kit (`assets/models/decor2`).
* **Yolanda’s shift ↔ hospital link.** Finish a shift in the minigame; return to the center for a cash bonus,
  reputation and XP for Yolanda.
* **Modern interface** (`src/mods/35-modern-ui.js`). Graphical HUD (cash with +$ popups, reputation ring, mood
  face, patients, day clock), a goal tracker with segmented progress, a bottleneck alert, an icon dock with direct
  access to Team / Goals / Research / Finance / Hospital (a “More” sheet on phones), a drawer on desktop and a bottom
  sheet on mobile, avatar-and-pip staff cards, department cards with utilisation, and a rebuilt title screen.
* **Decisions** (`src/mods/37-decisions.js`). About every minute of game time a card asks for a call with a visible cost and
  a real trade-off: a comfort plan for a named patient (comfort-first / standard / fast-track: speed against mood and
  risk), a walk-in rush, a jammed queue, a tired team member, a supplier, a livestreaming patient, a rattling scope,
  an intern's shortcut. Ignore a card and its default applies. A pipeline strip (check-in, assessment, procedure,
  recovery) shows where patients are and which stage is backing up; tap a pill to jump there.
* **Pace and feel.** Busy opening, a faster care journey, an early first event, sound effects and a soft background
  loop (sound toggle in the HUD or More menu), varied discharge lines and a "next step" prompt.
* **Animation.** Procedural walk cycle with counter-swinging arms, elbow bend, hip/shoulder twist and a pelvis bob
  over planted feet.

## Fixes to the original build

* **Deadlock:** a patient could wedge against the front-door frame while walking in and block the whole reception
  queue forever (cash drained, nobody treated). A generic stuck-actor watchdog now recovers any person held for 30 s.
* The tutorial’s “Skip” and the bounded 18-appointment cap no longer end the game; career mode continues.
* Operating-room rooms use the same pipeline as Endoscopy (the builder already offered an “Operating room” type that
  the simulation ignored).

## Testing

Headless Playwright scripts were used for soak runs (hours of simulated play with an autoplay bot that builds,
hires, researches, upgrades and reprices) and UI screenshots. Useful console hooks: `window.hospital` (simulation),
`window.YC` (career layer; `YC.careerStart()` creates a new career game), `window.construction` (builder).
Add `?title=0` to skip the title screen.

*An entertainment game inspired by anesthesia workflow. All cases are fictional; no clinical instruction. Two Point
Hospital is a style reference only; no assets from that game are used.*
