// The recorded sound banks (built by tools/sfx/build_guns.py; sources and licences in SOUND_PLAN.md).
// A bank is layers played together. Per layer:
//   files  takes to pick from at random (never the same twice running)   synth  a synthesised layer from audio.js instead
//   gain   level (x the caller's k)       pitch  [lo, hi] semitones of random detune       at  delay in s (or [lo, hi])
//   wet    reverb send (the room)          side   true: from beside Yola, not her centre (a casing hitting the floor)
// A sound name with no bank (or not loaded yet) falls back to the synthesised version in audio.js.
const G = 'assets/sfx/guns/';
const takes = (name, n) => Array.from({ length: n }, (_, i) => `${G}${name}_${String(i + 1).padStart(2, '0')}.mp3`);
const one = (name) => [`${G}${name}.mp3`];

export const BANKS = {
  // the pistol: a close 9 mm / .45 crack + a sub thump for headphones + the corridor answering + brass on the tile
  shot: { layers: [
    { files: takes('pistol', 5), gain: 0.8, pitch: [-0.7, 0.5], wet: 0.34 },
    { synth: 'subPistol', gain: 1, wet: 0 },
    { files: takes('brass', 4), gain: 0.2, pitch: [-1.5, 1.5], at: [0.34, 0.52], wet: 0.1, side: true },
  ] },
  // the shotgun: a 12 gauge pump blast + a deep sub + a long room (the pump follows as its own sound)
  shotgun: { layers: [
    { files: takes('shotgun', 8), gain: 1, pitch: [-0.9, 0.4], wet: 0.45 },
    { synth: 'subShotgun', gain: 1, wet: 0 },
  ] },
  // the Model 12's own rack: back, forward, and the spent hull bouncing off the floor
  pump: { layers: [
    { files: one('pump_back'), gain: 0.45, pitch: [-0.4, 0.4], wet: 0.16 },
    { files: one('pump_fwd'), gain: 0.5, pitch: [-0.4, 0.4], at: 0.19, wet: 0.16 },
    { files: takes('hull', 3), gain: 0.32, pitch: [-1, 1], at: [0.38, 0.5], wet: 0.1, side: true },
  ] },
  // the pistol reload (1.05 s): the empty magazine drops, the new one seats; the slide is reloadDone
  pistolReload: { layers: [
    { files: one('mag_out'), gain: 0.35, pitch: [-0.5, 0.5], at: 0.06, wet: 0.12 },
    { files: one('mag_in'), gain: 0.45, pitch: [-0.5, 0.5], at: 0.5, wet: 0.12 },
  ] },
  pistolReloadDone: { layers: [{ files: one('slide'), gain: 0.45, pitch: [-0.4, 0.4], wet: 0.14 }] },
  // the shotgun reload (1.9 s): four shells thumbed into the tube; the pump closes it (reloadDone)
  shotgunReload: { layers: [0.12, 0.52, 0.92, 1.32].map((at) => ({ files: one('mag_in'), gain: 0.28, pitch: [3.5, 5], at, wet: 0.1 })) },
  dry: { layers: [{ files: one('dry_click'), gain: 0.5, pitch: [-0.5, 0.5], wet: 0.08 }] },
};
