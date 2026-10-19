// The reveal's numbers, in one place (2026-10-19, the user: "I want more studio style control for the opening reveal"):
// the light of each part of it, the flashes in the lift (how many, when, how bright), the walk-out, the launch at the lens,
// the freeze and the name card, and when the lights come back. The Reveal Studio (studio.js, combat.html?intro=1&studio=1)
// edits these live and saves them to assets/opening/reveal_tuning.json, which the opening reads at load: what is tuned there
// is what ships. Anything the file does not set keeps the default below.

// The light of each part ("phase") of the reveal (see light below). red: the reveal's own red pulse; key: the one spotlight's steady level, aimed by spotAt ('flash': behind her, from the back of the
// cab, out through the doors: a rim and a silhouette; 'key': in front of her, on her; 'tube': over the operating table);
// cab: the lift car's own lamps; exposure: the whole picture; smoke: the dry-ice fog; beam / dust: the light shaft and the
// dust in it (their steady level; the flashes add to them). secs: how long the change takes when the phase starts.
export const PHASES = [
  ['doors', 'Shut doors (6 → 7)'],
  ['open', 'Doors open: fog, tilt up to old Yola'],
  ['cab', 'Lift flashes (between flashes)'],
  ['walk', 'Walk-out (feet)'],
  ['batShot', 'Bat on the wall'],
  ['launch', 'Launch at the lens'],
  ['card', 'Slow-mo + name card (top of the jump)'],
  ['burst', 'The hit and the burst'],
  ['after', 'Lights back (gameplay)'],
];

export const REVEAL_DEFAULTS = {
  // From the cut to the lift the reveal runs on the game's own lighting (game.on): the baked floor light, the fittings, EXIT signs,
  // the polished floor, Yola's shadow, the emergency look, haze. Each phase dims it: amb the room's general light (1 = the
  // game's), floor the baked floor light and the fittings' reflections, signs the EXIT signs, emRed the emergency red pools and
  // beacon, chars the light on the characters; red, key, cab, smoke, beam, dust are the reveal's own extras on top.
  light: {
    doors: { amb: 0.3, floor: 0.35, signs: 1, emRed: 0.8, chars: 0.4, red: 0.3, key: 0, spotAt: 'flash', cab: 0, exposure: 1, smoke: 0, beam: 0, dust: 0, secs: 0 },
    open: { amb: 0.1, floor: 0.25, signs: 0.9, emRed: 0.6, chars: 0.1, red: 0.05, key: 0.14, spotAt: 'flash', cab: 0, exposure: 1, smoke: 2.4, beam: 0.35, dust: 0.5, secs: 0 },
    cab: { amb: 0.1, floor: 0.25, signs: 0.9, emRed: 0.6, chars: 0.1, red: 0.03, key: 0, spotAt: 'flash', cab: 0, exposure: 1, smoke: 1, beam: 0.05, dust: 0.15, secs: 0 },
    threat: { amb: 0.18, floor: 0.3, signs: 1, emRed: 0.9, chars: 0.5, red: 0.6, key: 0, spotAt: 'flash', cab: 0, exposure: 1, smoke: 1, beam: 0, dust: 0, secs: 0 },
    walk: { amb: 0.16, floor: 0.35, signs: 1, emRed: 0.7, chars: 0.35, red: 0, key: 0.28, spotAt: 'flash', cab: 0, exposure: 1, smoke: 1, beam: 0.35, dust: 0.45, secs: 0 },
    batShot: { amb: 0.2, floor: 0.4, signs: 1, emRed: 0.8, chars: 0.4, red: 0, key: 0.15, spotAt: 'flash', cab: 0, exposure: 1, smoke: 1, beam: 0.2, dust: 0.3, secs: 0 },
    launch: { amb: 0.32, floor: 0.5, signs: 1, emRed: 0.8, chars: 0.6, red: 0, key: 0.25, spotAt: 'flash', cab: 0, exposure: 1, smoke: 1, beam: 0.3, dust: 0.3, secs: 0.2 },
    card: { amb: 0.4, floor: 0.55, signs: 1, emRed: 0.8, chars: 0.8, red: 0, key: 0.5, spotAt: 'flash', cab: 0, exposure: 1.05, smoke: 1, beam: 0.3, dust: 0.3, secs: 0 },
    burst: { amb: 0.38, floor: 0.55, signs: 1, emRed: 0.9, chars: 0.7, red: 0, key: 0.4, spotAt: 'flash', cab: 0, exposure: 1, smoke: 1, beam: 0.2, dust: 0.2, secs: 0 },
    after: { amb: 1, floor: 1, signs: 1, emRed: 1, chars: 1, red: 0, key: 0, spotAt: 'flash', cab: 1, exposure: 1, smoke: 0, beam: 0, dust: 0, secs: 1.2 },
  },
  // the picture quality of the reveal only (the game's own look is untouched): the opening's picture chain (post: bloom, film
  // grain and vignette), the flash's light as a real beam through the fog (beam, beamK its strength), the fog puffs' rolling
  // insides and soft edges (softFog), fog lit from behind glowing toward the lens (glow), her shadow thrown by the flash
  // across the floor (flashShadow)
  quality: { post: true, bloom: 0.8, bloomRadius: 0.6, bloomThreshold: 0, film: true, grain: 0.016, vignette: 0.32, beam: true, beamK: 1, softFog: true, glow: 1, flashShadow: true },
  // the game's lighting in the reveal: on from the cut to the lift; its haze; Yola's own shadow; the impact frame at the hit
  game: { on: true, haze: true, shadow: true, impact: true },
  // when the lights come back up: 'return' (as the camera rises back to the game), 'burst' (at the hit), 'card' (with
  // the name card), 'walk' (as she steps out of the lift)
  brighten: 'return',
  // the failing light at the back of the lift car: what each flash does
  flash: {
    power: 1, // the flash's brightness (x the spotlight's full flash)
    decay: 0.16, // seconds a flash takes to die (each flash in the list can set its own)
    height: 2.25, back: -14.45, angle: 0.46, penumbra: 0.8, // where the light hangs (height, z) and its cone
    beam: 0.7, dust: 0.8, halo: 0.9, sparks: 1, // what each flash adds: the light shaft, the dust in it, the fitting's glow, sparks
    swap: true, // the hall flips clean / outbreak with the flashes (old Yola: clean, Yola 3.0: outbreak)
  },
  // the flashes, in seconds from the doors opening: [time, who ('old' / 'new' Yola), brightness, fade (s, 0: the default),
  // boom (the last one: her, and she stays)]
  flashes: [[0, 'old', 1, 0, false], [1.15, 'old', 0.55, 0, false], [2.0, 'new', 0.85, 0, false], [2.55, 'old', 0.6, 0, false],
    [3.6, 'old', 0.8, 0, false], [3.76, 'new', 0.85, 0, false], [3.89, 'old', 0.9, 0, false], [4.0, 'new', 0.9, 0, false], [4.1, 'old', 0.95, 0, false], [4.19, 'new', 0.95, 0, false],
    [4.36, 'old', 0.85, 0, false], [4.62, 'new', 0.75, 0, false], [5.0, 'old', 0.65, 0, false],
    [5.95, 'new', 1.5, 1.1, true]],
  flashTail: 1.25, // seconds held after the last flash before the cut
  // the floor number and the doors opening: the hold on the 7 after the DING, then the low lens at the threshold (camX/Y/Z:
  // where it stands, x from the doors' centre) tilting up through the fog to the old Yola (endY: where it ends, her face)
  open: { dingHold: 1.1, dingWidth: 0.85, camX: 0.12, camY: 0.2, camZ: -9.3, startY: -0.05, startZ: -10.6, endY: 1.45, tiltDelay: 0.9, tiltSecs: 3.2, hold: 0.6, fov: 38 },
  // the rhythm generator's settings (the Studio's "Generate" makes the list above from these)
  rhythm: { first: 4, firstGap: 0.85, burst: 6, burstFrom: 0.16, burstTo: 0.09, slow: 3, slowFrom: 0.16, slowTo: 0.38, breath: 0.95 },
  walk: {
    bat: true, // she carries the bat out (in her fist, the game's grip); off: empty-handed
    slow: 0.7, // slow motion (1: real time)
    stopZ: -8.9, // where she would stop (past the lens: she walks out of the shot first); the launch starts where she is (z; the doors are at -11.1)
    secs: 5, // the longest the shot holds (it ends when she has walked out of it, then W.empty)
    empty: 0.35, // seconds the empty shot holds after she has gone
    // (2026-10-19, the user: the camera stays still and she walks out of frame) the lens on the floor beside her path, looking
    // back into the cab: how far to her side (m), its height, where it stands (z), what it looks at (height), its lens
    cam: { side: 0.75, height: 0.3, z: -9.7, lookY: 0.75, fov: 34 },
    stepShake: 0.012, // the camera jolt on each step
  },
  batShot: false, // the cut to the athlete's bat leaning by the doors (off when she walks out holding it)
  // (2026-10-19, the user) the music runs through the reveal: low under the shut doors (preLevel), a hard stop on the DING, a
  // steady heartbeat from the doors opening (heartAt s after they start, every heartEvery s, at heartK) until the music comes
  // back (backAt): 'card' (the user's pick: the heartbeat on through the walk-out and the jump, the music crashing in with her
  // name card for cardSecs through the hit, faded at the hand-off) or 'flash' (in on the last flash in the lift, building for
  // buildSecs through the walk-out to the card)
  // stepBass: the deep boom under each of her steps in the walk-out (0 = off)
  music: { preLevel: 0.6, heartAt: 1.0, heartEvery: 0.85, heartK: 0.9, backAt: 'card', cardSecs: 3, buildSecs: 7, stepBass: 1.2 },
  launch: {
    variant: 'B_uppercut', // the jump finisher: 'B_uppercut' (the user's pick, 2026-10-19: the coil, the launch, the spin as she swings) or 'C_uppercut_mirrored' (the same from a deep crouch facing forward)
    jump: 2.4, // 1.4, 2.4 or 3.4 m
    reach: 1, // how much of the jump's own length she travels (1: all of it)
    turn: 0, // her heading, degrees off straight out of the lift (+: to her left)
    gap: 0.25, // the zombie's distance past where the bat lands (m): bigger = further back
    lunge: 1.2, // how far he lurches at her before the hit (m)
    hold: 0.12, // seconds she stands set before she goes (2026-10-19: the coil shot opens on her already getting low)
    rampSlow: 1, rampLen: 0.08, rampAt: 0, // the speed ramp: slow motion in the air (x real speed; 1 = none, the user's pick 2026-10-19: the original timing; 0.25 was the slowed spin), how fast it eases in (s of her clip), from when (s after she leaves the ground)
    // (2026-10-19, the user: no freeze, "slow for that moment.. at the peak of her jump") the card at the top of her jump
    peakLead: 0, // when the card comes: seconds of her clip after the top of the jump (-: before); the slow-down eases in ahead of it
    cardSlow: 0.03, // the speed under the card (x real speed; capped so the bat never lands under the card)
    drift: { push: 0.45, orbit: 7, rise: 0.06 }, // the camera through the card (the user: fake the motion, never frozen): metres in, degrees around her, metres up
    // the coil shot (her getting low for the jump) before the cut to the hit angle: on/off, the camera's distance to her side,
    // ahead of her, its height, what it looks at, the lens, a push in, and the cut (seconds of her clip after lift-off); from: where
    // in her clip the shot opens (s: already going down)
    coil: { on: true, from: 0.06, side: 1.7, front: 2.0, height: 0.55, lookY: 0.75, fov: 38, push: 0.25, cutAt: 0 },
    slowIn: 0.15, slowOut: 0.2, // seconds easing into the slow motion and back to full speed when the card goes
    boomToCard: 0.12, // seconds from the boom to the name card
    cardHold: 2.2, // seconds the card holds
    slow: 0.26, // slow motion after the hit
    headSecs: 0.42, lensDist: 0.62, // the head's flight to the lens: its time and how close it ends
    after: 0.55, // seconds after the head hits the lens before the camera starts back
    returnSecs: 1.8, // the camera's rise back to the game
    cam: { yawOff: 12, dist: 4.3, height: 1.15, pitch: 3, look: 0.35, fov: 42, push: 0.35 }, // the camera on the launch: degrees off her heading, distance, aim height, tilt, aim between her (0) and him (1), lens, push-in
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
export const RT = clone(REVEAL_DEFAULTS); // the live values

// copy what a saved file sets over the live values (keys it does not know are ignored; lists are taken whole)
export function mergeTuning(dst, src) {
  if (!src || typeof src !== 'object') return dst;
  for (const k of Object.keys(dst)) {
    if (!(k in src)) continue;
    const a = dst[k], b = src[k];
    if (Array.isArray(a)) { if (Array.isArray(b)) dst[k] = clone(b); }
    else if (a && typeof a === 'object') mergeTuning(a, b);
    else if (typeof b === typeof a) dst[k] = b;
  }
  return dst;
}
export function resetTuning() { const d = clone(REVEAL_DEFAULTS); for (const k of Object.keys(RT)) RT[k] = d[k]; }
export const TUNING_URL = 'assets/opening/reveal_tuning.json';
export async function loadTuning() {
  try { const r = await fetch(TUNING_URL, { cache: 'no-store' }); if (r.ok) mergeTuning(RT, await r.json()); } catch { /* no file: the defaults */ }
  return RT;
}
export function tuningJSON() { return JSON.stringify(RT, null, 1); }

// the flash list from the rhythm settings: a few slow exchanges, a beat of dark, a burst that speeds up, then slowing click
// by click as the light dies, a held breath, and the boom on her
export function generateFlashes(R) {
  const out = []; let t = 0, who = 'old';
  const flip = () => { const w = who; who = who === 'old' ? 'new' : 'old'; return w; };
  for (let i = 0; i < R.first; i++) { out.push([+t.toFixed(2), i % 3 === 2 ? 'new' : 'old', +(1 - i * 0.12).toFixed(2), 0, false]); t += R.firstGap * (1 + (i % 2) * 0.3); }
  t += 0.25; who = 'old';
  for (let i = 0; i < R.burst; i++) { out.push([+t.toFixed(2), flip(), +(0.8 + 0.15 * i / Math.max(1, R.burst - 1)).toFixed(2), 0, false]); t += R.burstFrom + (R.burstTo - R.burstFrom) * (i / Math.max(1, R.burst - 1)); }
  for (let i = 0; i < R.slow; i++) { t += R.slowFrom + (R.slowTo - R.slowFrom) * (i / Math.max(1, R.slow - 1)); out.push([+t.toFixed(2), flip(), +(0.85 - 0.1 * i).toFixed(2), 0, false]); }
  t += R.breath;
  out.push([+t.toFixed(2), 'new', 1.5, 1.1, true]);
  return out;
}
