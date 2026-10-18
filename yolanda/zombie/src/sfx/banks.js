// The recorded sound banks (built by tools/sfx/build_guns.py; sources and licences in SOUND_PLAN.md).
// A bank is layers played together. Per layer:
//   files  takes in the game by default, one picked at random (never the same twice running)
//   extra  candidate takes: heard on the Sound Board (sounds.html), in the game only once the user approves them
//   synth  a synthesised layer from audio.js instead of files
//   gain   level (x the caller's k)       pitch  [lo, hi] semitones of random detune       at  delay in s (or [lo, hi])
//   wet    reverb send (the room)          side   true: from beside Yola, not her centre (a casing hitting the floor)
// Per sound: group / sub  where it sits on the board (Weapons > Guns, Zombies > Guard (boss) ...)
//            pending  true = the game has no hook for it yet (the user's picks wait until it is wired)
//            hook     what in the game plays it (shown on the board)
// The candidate library (assets/sfx/lib, built by tools/sfx/build_library.py) is listed in library.gen.js.
// The user's verdicts and level trims from the Sound Board live in assets/sfx/selection.json (samples.js applies them).
// A sound name with no bank (or not loaded yet, or every take rejected) falls back to the synthesised version in audio.js.
import { LIB, LIB_LABELS } from './library.gen.js';
import { ZLIB, ZLIB_LABELS } from './zombies.gen.js';

const G = 'assets/sfx/guns/';
const lib = (...keys) => keys.flatMap((k) => LIB[k] || []);
const zl = (...keys) => keys.flatMap((k) => ZLIB[k] || []);
const take = (name, i) => `${G}${name}_${String(i).padStart(2, '0')}.mp3`;
const takes = (name, from, to) => Array.from({ length: to - from + 1 }, (_, i) => take(name, from + i));
const one = (name) => [`${G}${name}.mp3`];

export const BANKS = {
  // the pistol: a close 9 mm / .45 crack + a sub thump for headphones + the corridor answering + brass on the tile
  shot: { label: 'Pistol shot', group: 'Weapons', sub: 'Guns', cadence: 0.26, hook: "Yola fires the pistol", layers: [
    { label: 'Shot', files: takes('pistol', 1, 5), extra: takes('pistol', 6, 14), gain: 0.8, pitch: [-0.7, 0.5], wet: 0.34 },
    { label: 'Sub thump (headphones)', synth: 'subPistol', gain: 1, wet: 0 },
    { label: 'Brass casing', files: takes('brass', 1, 4), extra: lib('brass'), gain: 0.2, pitch: [-1.5, 1.5], at: [0.34, 0.52], wet: 0.1, side: true },
  ] },
  // the shotgun: a 12 gauge pump blast + a deep sub + a long room (the pump follows as its own sound)
  shotgun: { label: 'Shotgun blast', group: 'Weapons', sub: 'Guns', cadence: 0.85, then: { name: 'pump', at: 0.24 }, hook: "Yola fires the shotgun", layers: [
    { label: 'Blast', files: takes('shotgun', 1, 8), extra: takes('shotgun', 9, 12), gain: 1, pitch: [-0.9, 0.4], wet: 0.45 },
    { label: 'Sub boom (headphones)', synth: 'subShotgun', gain: 1, wet: 0 },
  ] },
  // the Model 12's own rack: back, forward, and the spent hull bouncing off the floor
  pump: { label: 'Shotgun pump', group: 'Weapons', sub: 'Guns', cadence: 0.85, hook: "the shotgun pumps after each blast (and closes after a reload)", layers: [
    { label: 'Rack back', files: one('pump_back'), gain: 0.45, pitch: [-0.4, 0.4], wet: 0.16 },
    { label: 'Rack forward', files: one('pump_fwd'), gain: 0.5, pitch: [-0.4, 0.4], at: 0.19, wet: 0.16 },
    { label: 'Full rack (one real recording)', files: [], extra: lib('rack'), gain: 0.55, pitch: [-0.4, 0.4], wet: 0.16 },
    { label: 'Spent hull', files: takes('hull', 1, 3), extra: lib('hull'), gain: 0.32, pitch: [-1, 1], at: [0.38, 0.5], wet: 0.1, side: true },
  ] },
  // the pistol reload (1.05 s): the empty magazine drops, the new one seats; the slide is reloadDone
  pistolReload: { label: 'Pistol reload', group: 'Weapons', sub: 'Reloads', hook: "a pistol reload starts", layers: [
    { label: 'Magazine out', files: one('mag_out'), extra: lib('magdrop'), gain: 0.35, pitch: [-0.5, 0.5], at: 0.06, wet: 0.12 },
    { label: 'Magazine in', files: one('mag_in'), gain: 0.45, pitch: [-0.5, 0.5], at: 0.5, wet: 0.12 },
  ] },
  pistolReloadDone: { label: 'Pistol slide (reload done)', group: 'Weapons', sub: 'Reloads', hook: "a pistol reload finishes", layers: [{ label: 'Slide', files: one('slide'), gain: 0.45, pitch: [-0.4, 0.4], wet: 0.14 }] },
  // the shotgun reload (1.9 s): four shells thumbed into the tube; the pump closes it (reloadDone)
  shotgunReload: { label: 'Shotgun reload (4 shells)', group: 'Weapons', sub: 'Reloads', hook: "a shotgun reload starts", layers: [0.12, 0.52, 0.92, 1.32].map((at, i) => ({ label: `Shell ${i + 1}`, files: one('mag_in'), extra: lib('shellin'), gain: 0.28, pitch: [3.5, 5], at, wet: 0.1 })) },
  dry: { label: 'Dry fire (empty)', group: 'Weapons', sub: 'Guns', hook: "Yola pulls the trigger on an empty gun", layers: [{ label: 'Click', files: one('dry_click'), extra: lib('click'), gain: 0.5, pitch: [-0.5, 0.5], wet: 0.08 }] },

  // ---- melee hits: the game already plays these (synthesised); the first takes the user adds replace the synth,
  // which stays as a quiet "classic" layer underneath until switched off on the board ----
  fistHit: { label: 'Fist / kick hit', group: 'Weapons', sub: 'Melee hits', hook: "a fist or kick lands", layers: [
    { label: 'Punch', files: [], extra: lib('punch', 'punchheavy'), gain: 0.9, pitch: [-1, 1], wet: 0.12 },
    { label: 'Classic synth thump (under it)', synth: 'fistHit', gain: 0.6 },
  ] },
  batHit: { label: 'Bat hit', group: 'Weapons', sub: 'Melee hits', hook: "the bat lands", layers: [
    { label: 'Crack', files: [], extra: lib('wood', 'thwack'), gain: 0.9, pitch: [-1, 0.8], wet: 0.2 },
    { label: 'Body', files: [], extra: lib('soft', 'punchheavy'), gain: 0.8, pitch: [-1.5, 0.5], wet: 0.1 },
    { label: 'Classic synth (under it)', synth: 'batHit', gain: 0.5 },
  ] },
  axeHit: { label: 'Axe hit', group: 'Weapons', sub: 'Melee hits', hook: "the axe lands", layers: [
    { label: 'Blade bite', files: [], extra: lib('blade', 'thwack'), gain: 0.85, pitch: [-1, 1], wet: 0.15 },
    { label: 'Wet', files: [], extra: lib('squish'), gain: 0.5, pitch: [-1.5, 0.5], wet: 0.08 },
    { label: 'Body', files: [], extra: lib('soft', 'punchheavy'), gain: 0.7, pitch: [-1.5, 0.5], wet: 0.1 },
    { label: 'Classic synth (under it)', synth: 'axeHit', gain: 0.5 },
  ] },
  sever: { label: 'Limb severed / gore', group: 'Weapons', sub: 'Melee hits', hook: "a limb comes off", layers: [
    { label: 'Wet', files: [], extra: lib('squish'), gain: 0.85, pitch: [-2, 0.5], wet: 0.15 },
    { label: 'Snap', files: [], extra: lib('thwack', 'wood'), gain: 0.5, pitch: [0, 2], wet: 0.1 },
    { label: 'Classic synth (under it)', synth: 'sever', gain: 0.5 },
  ] },
  knockdown: { label: 'Body hits the floor', group: 'Weapons', sub: 'Melee hits', hook: "a zombie is knocked to the floor", layers: [
    { label: 'Thud (as the fall lands)', files: [], extra: lib('soft', 'punchheavy'), gain: 0.85, pitch: [-2, 0], at: 0.55, wet: 0.25 },
    { label: 'Classic synth (under it)', synth: 'knockdown', gain: 0.5 },
  ] },
  bump: { label: 'Zombie bumps into Yola', group: 'Weapons', sub: 'Melee hits', hook: "a zombie bumps into Yola", layers: [
    { label: 'Thud', files: [], extra: lib('soft'), gain: 0.7, pitch: [-1, 1], wet: 0.1 },
    { label: 'Classic synth (under it)', synth: 'bump', gain: 0.5 },
  ] },
  clank: { label: 'Bat hits a wall / metal', group: 'Weapons', sub: 'Melee hits', hook: "the bat hits a wall", layers: [
    { label: 'Metal', files: [], extra: lib('metal'), gain: 0.8, pitch: [-1, 1], wet: 0.25 },
    { label: 'Classic synth (under it)', synth: 'clank', gain: 0.4 },
  ] },
  shieldHit: { label: "Hit on the guard's shield", group: 'Weapons', sub: 'Melee hits', hook: "a hit lands on the guard's shield", layers: [
    { label: 'Board knock', files: [], extra: lib('wood', 'thwack'), gain: 0.85, pitch: [-2, 0], wet: 0.2 },
    { label: 'Classic synth (under it)', synth: 'shieldHit', gain: 0.5 },
  ] },
  doorOpen: { label: 'Door opens', group: 'World', sub: 'Doors', hook: "a door opens", layers: [
    { label: 'Door', files: [], extra: lib('door'), gain: 0.8, pitch: [-0.5, 0.5], wet: 0.3 },
    { label: 'Classic synth (under it)', synth: 'doorOpen', gain: 0.4 },
  ] },

  // ---- zombies (2026-10-18): each type's moments. The game hooks pass the zombie's place (pan + distance) ----
  groan: { label: 'Idle moan (near Yola)', group: 'Zombies', sub: 'Every zombie', hook: 'a zombie near Yola, every few seconds', layers: [
    { label: 'Moan', files: [], extra: zl('idle'), gain: 0.55, pitch: [-1.5, 1], wet: 0.3 },
    { label: 'Classic synth (under it)', synth: 'groan', gain: 0.6 },
  ] },
  zombieAlert: { label: 'Spots Yola / wakes up', group: 'Zombies', sub: 'Every zombie', hook: 'a zombie wakes or appears', layers: [
    { label: 'Growl', files: [], extra: zl('alert'), gain: 0.7, pitch: [-1, 1], wet: 0.25 },
  ] },
  windup: { label: 'Attack wind-up (your dodge cue)', group: 'Zombies', sub: 'Every zombie', hook: 'a zombie starts its attack (the red floor wedge)', layers: [
    { label: 'Attack cry', files: [], extra: zl('attack'), gain: 0.75, pitch: [-1, 1], wet: 0.2 },
    { label: 'Classic synth (under it)', synth: 'windup', gain: 0.5 },
  ] },
  zombieBite: { label: 'Its attack lands on Yola', group: 'Zombies', sub: 'Every zombie', hook: 'a zombie hits Yola', layers: [
    { label: 'Bite / claw (wet)', files: [], extra: [...zl('bite'), ...lib('squish')], gain: 0.7, pitch: [-1.5, 1], wet: 0.12 },
    { label: 'Snarl', files: [], extra: zl('attack'), gain: 0.55, pitch: [-1, 1], wet: 0.15 },
  ] },
  zombieHurt: { label: 'Hurt (shot, not killed)', group: 'Zombies', sub: 'Every zombie', hook: 'a bullet hits a zombie', layers: [
    { label: 'Pain', files: [], extra: zl('hurt'), gain: 0.6, pitch: [-1.5, 1.5], wet: 0.15 },
    { label: 'Classic synth (under it)', synth: 'zombieHurt', gain: 0.5 },
  ] },
  zombieDeath: { label: 'Death', group: 'Zombies', sub: 'Every zombie', hook: 'a zombie dies', layers: [
    { label: 'Death cry', files: [], extra: zl('death'), gain: 0.75, pitch: [-1.5, 1], wet: 0.25 },
    { label: 'Body hits the floor', files: [], extra: lib('soft', 'punchheavy'), gain: 0.6, pitch: [-2, 0], at: [0.4, 0.55], wet: 0.2 },
    { label: 'Classic synth (under it)', synth: 'zombieDeath', gain: 0.5 },
  ] },
  sprinterScream: { label: 'Her scream before the charge', group: 'Zombies', sub: 'Sprinter (big lady)', hook: 'the sprinter spots Yola', layers: [
    { label: 'Scream', files: [], extra: zl('scream'), gain: 0.9, pitch: [-1, 0.5], wet: 0.35 },
  ] },
  sprinterCharge: { label: 'She locks on and runs', group: 'Zombies', sub: 'Sprinter (big lady)', hook: 'the sprinter starts her charge', layers: [
    { label: 'Effort', files: [], extra: zl('charge'), gain: 0.8, pitch: [-1.5, 0.5], wet: 0.2 },
  ] },
  sprinterDeath: { label: 'Her death', group: 'Zombies', sub: 'Sprinter (big lady)', hook: 'the sprinter dies', layers: [
    { label: 'Death cry', files: [], extra: zl('sdeath'), gain: 0.85, pitch: [-1, 0.5], wet: 0.3 },
    { label: 'Heavy body falls', files: [], extra: [...lib('soft', 'punchheavy'), ...zl('stomp')], gain: 0.75, pitch: [-3, 0], at: [0.45, 0.6], wet: 0.25 },
  ] },
  guardRoar: { label: 'Roar (he sees you)', group: 'Zombies', sub: 'Guard (boss)', hook: 'the guard wakes or appears', layers: [
    { label: 'Roar', files: [], extra: zl('groar'), gain: 1, pitch: [-0.5, 0.5], wet: 0.4 },
  ] },
  guardAttack: { label: 'Attack grunt', group: 'Zombies', sub: 'Guard (boss)', hook: 'the guard winds up a swing', layers: [
    { label: 'Grunt', files: [], extra: zl('gattack'), gain: 0.9, pitch: [-1, 0.5], wet: 0.25 },
  ] },
  guardSlam: { label: 'Ground slam', group: 'Zombies', sub: 'Guard (boss)', hook: 'the guard leap-slam lands', layers: [
    { label: 'Boom', files: [], extra: zl('stomp'), gain: 1, pitch: [-1, 0.5], wet: 0.35 },
    { label: 'Debris', files: [], extra: zl('debris'), gain: 0.5, pitch: [-1, 1], at: [0.05, 0.12], wet: 0.2 },
    { label: 'Roar with it', files: [], extra: zl('gattack', 'groar'), gain: 0.7, pitch: [-1, 0], wet: 0.3 },
    { label: 'Sub boom (headphones)', synth: 'subShotgun', gain: 1 },
  ] },
  guardPain: { label: 'Arm torn off (pain)', group: 'Zombies', sub: 'Guard (boss)', hook: 'the guard loses an arm', layers: [
    { label: 'Pain roar', files: [], extra: zl('gpain'), gain: 1, pitch: [-0.5, 0.5], wet: 0.35 },
  ] },
  guardEnraged: { label: 'ENRAGED', group: 'Zombies', sub: 'Guard (boss)', hook: 'both arms gone: he enrages', layers: [
    { label: 'Roar', files: [], extra: zl('groar'), gain: 1, pitch: [-1, 0], wet: 0.4 },
    { label: 'Boss stinger', files: [], extra: zl('sting'), gain: 0.85, pitch: [-0.5, 0.5], wet: 0.3 },
  ] },
  guardDeath: { label: 'His death', group: 'Zombies', sub: 'Guard (boss)', hook: 'the finishing blow on the guard', layers: [
    { label: 'Death roar', files: [], extra: zl('gdeath'), gain: 1, pitch: [-0.5, 0.5], wet: 0.45 },
    { label: 'Huge body falls', files: [], extra: zl('stomp'), gain: 0.9, pitch: [-1, 0], at: [0.6, 0.8], wet: 0.3 },
  ] },
  hordeDistant: { label: 'The horde, far off', group: 'Zombies', sub: 'Horde & atmosphere', pending: true, cadence: 4, layers: [
    { label: 'Distant moan', files: [], extra: zl('horde'), gain: 0.4, pitch: [-1, 1], wet: 0.6 },
  ] },
  floorBreach: { label: 'Bursting up through the floor', group: 'Zombies', sub: 'Horde & atmosphere', hook: 'a zombie bursts up through the tiles', layers: [
    { label: 'Rumble + crack', files: [], extra: zl('breach'), gain: 0.9, pitch: [-1, 0.5], wet: 0.3 },
    { label: 'Debris', files: [], extra: zl('debris'), gain: 0.5, pitch: [-1, 1], at: [0.35, 0.45], wet: 0.2 },
  ] },

  // ---- coming next: no game hook yet (Phase 2-5); pick now, they go in when wired ----
  footstep: { label: 'Yola footstep', group: 'Coming next', sub: 'Not in the game yet', pending: true, cadence: 0.32, layers: [
    { label: 'Step', files: [], extra: lib('step', 'stepsoft'), gain: 0.5, pitch: [-1, 1], wet: 0.08 },
  ] },
  doorClose: { label: 'Door closes', group: 'Coming next', sub: 'Not in the game yet', pending: true, layers: [{ label: 'Door', files: [], extra: lib('doorshut'), gain: 0.8, pitch: [-0.5, 0.5], wet: 0.3 }] },
  glassBreak: { label: 'Glass breaks', group: 'Coming next', sub: 'Not in the game yet', pending: true, layers: [{ label: 'Glass', files: [], extra: lib('glass'), gain: 0.85, pitch: [-1, 1], wet: 0.3 }] },
  weaponSwap: { label: 'Weapon swap (handling)', group: 'Coming next', sub: 'Not in the game yet', pending: true, layers: [{ label: 'Handling', files: [], extra: lib('cloth', 'click'), gain: 0.6, pitch: [-1, 1], wet: 0.06 }] },
  pickupItem: { label: 'Pick up an item', group: 'Coming next', sub: 'Not in the game yet', pending: true, layers: [{ label: 'Item', files: [], extra: lib('pickup', 'cloth'), gain: 0.6, pitch: [-1, 1], wet: 0.06 }] },
};

// what each take is, for the Sound Board
const SRC = {
  pistol: ['Walther PPQ 9mm, close', 'Walther PPQ 9mm, close', 'Walther PPQ 9mm, close', '1911 .45, close', '1911 .45, close',
    'Bersa .380, close', 'Bersa .380, close', 'S&W 642 .38 revolver, close', 'S&W 642 .38 revolver, close', 'Ruger Mark III .22, close', 'Ruger Mark III .22, close',
    '1911 .45, further off (echo)', 'Walther PPQ 9mm, further off', 'Walther PPQ 9mm, further off'],
  shotgun: ['Benelli Nova, close', 'Benelli Nova, close', 'Winchester Model 12, close', 'Winchester Model 12, close', 'Charles Daly pump, close', 'Charles Daly pump, close',
    'Mossberg 190, close', 'Mossberg 190, close', 'Benelli Nova, further off (long echo)', 'Winchester Model 12, further off (long echo)', 'Charles Daly pump, further off (long echo)', 'Mossberg 190, further off (long echo)'],
  brass: ['9mm brass on tile (synth)', '9mm brass on tile (synth)', '9mm brass on tile (synth)', '9mm brass on tile (synth)'],
  hull: ['12 ga hull on tile (synth)', '12 ga hull on tile (synth)', '12 ga hull on tile (synth)'],
};
export function takeLabel(file) {
  if (LIB_LABELS[file]) return LIB_LABELS[file];
  if (ZLIB_LABELS[file]) return ZLIB_LABELS[file];
  const m = file.match(/([a-z_]+?)_(\d+)\.mp3$/); const b = file.split('/').pop().replace('.mp3', '');
  if (m && SRC[m[1]]) return `${b} · ${SRC[m[1]][+m[2] - 1] || ''}`;
  return { pump_back: 'pump_back · Winchester Model 12 rack, back', pump_fwd: 'pump_fwd · Winchester Model 12 rack, forward', mag_out: 'mag_out · handgun magazine dropped', mag_in: 'mag_in · handgun magazine seated', slide: 'slide · handgun slide racked', dry_click: 'dry_click · trigger on an empty gun' }[b] || b;
}
