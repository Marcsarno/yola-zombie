// Every value exposed in the tuning panel. Units: metres, seconds, radians/second.
export const TUNING_DEFAULTS = {
  moveSpeed: 3.3, // m/s at full stick
  accel: 28, // m/s^2 when speeding up
  decel: 34, // m/s^2 when releasing / reversing
  turnRate: 16, // rad/s upper-body aim turn
  backpedalSpeed: 0.78, // speed multiplier when moving directly against the aim
  strafeSpeed: 0.92, // multiplier when moving perpendicular to the aim
  attackThreshold: 0.45, // right-stick deflection that starts attacking
  pistolInterval: 0.24, // s between shots while held
  pistolDamage: 34,
  pistolRecoil: 1.0, // visual kick scale
  pistolKnockback: 1.6, // m/s impulse
  aimAssist: 0.5, // 0 = off, 1 = full (max 5 degrees bend)
  magSize: 12,
  testInfiniteHealth: true, // testing feel, not difficulty (the user, 2026-10-15): hits still flinch, push and knock her down; her health does not drop
  testInfiniteAmmo: true, // testing: spare rounds never run out (magazines still empty and reload); false = Floor 3 counts them
  headshotChance: 0.1, // a clean centre-mass pistol hit sometimes takes the head off (one-shot kill)
  reloadTime: 1.05,
  swapTime: 0.3,
  shotgunDamage: 16, // per pellet (9 pellets), full power inside ~2 m, falling off to a third at 11 m
  shotgunKnockback: 9, // m/s push when every pellet lands at close range
  shotgunInterval: 0.85, // s between shots (the pump)
  shotgunMag: 6,
  shotgunReload: 1.9,
  legStrikeChance: 0.13, // a melee opener at a standing walker goes in low for its legs (core/player.js startSwing)
  legShotChance: 0.5, // a bullet in a walker's lower leg takes it off (core/zombies.js takeHit)
  axeDamage: 62, // first attack; the combo's later attacks hit harder (weapons.js AXE_ATTACKS)
  axeKnockback: 5.0, // m/s impulse
  axeSpeed: 1.0, // attack time scale (higher = faster)
  axeKnockdown: 0.45, // chance a non-lethal axe hit knocks the zombie flat (the chop: more)
  fistDamage: 18, // jab; the cross and kick hit harder (weapons.js FIST_ATTACKS)
  fistKnockback: 4.0, // m/s impulse (x the attack's knock factor)
  hitPause: 0.07, // s of slow motion on a gun hit (a headshot, a shotgun blast; 0 = off)
  meleeHitPause: 0, // s of slow motion on a melee hit: off (the user found it made melee feel choppy); 0.07 was the old value
  shake: 1.0,
  zombieSpeed: 1.0, // m/s approach
  zombieHp: 100,
  zombieDamage: 12, // the lunge
  zombieEngage: 2, // zombies allowed to close in and attack at once; the rest hold a step back and circle
  zombieAttackGap: 0.75, // s: after one zombie starts an attack, the next waits at least this long (attacks come in turns)
  zombieWindup: 0.62, // s: the lunge's wind-up (its telegraph: arms back, red wedge on the floor)
  scratchWindup: 0.42, // s: the scratch's quicker wind-up (used close in: under ~0.9 m)
  scratchDamage: 8,
  // (2026-10-18, the user: "she doesn't run fast enough... it doesn't look like she builds up speed and charges. you need a
  // moment to set up where you want her to charge... like the butcher in diablo 3"): a longer wind-up in which she tracks
  // Yola, her line fixed sprinterLock s before she goes (the moment to place her charge), then a run that starts slow and
  // builds (sprinterAccel m/s2) to sprinterSpeed, far faster than Yola
  sprinterWindup: 1.35, // s: the big lady plants, roars and aims before a charge (the lane shows on the floor)
  sprinterLock: 0.42, // s: the end of her wind-up with her line fixed (no more tracking: she goes where she aimed)
  sprinterSpeed: 6.2, // m/s: her charge at full speed (Yola runs 3.3)
  sprinterAccel: 4.3, // m/s2: how fast she builds up to it (from a slow start)
  sprinterTurn: 0.9, // rad/s she turns at full speed (slow: a side-step makes her overshoot); none inside 2 m
  lookAhead: 1.3, // camera look-ahead toward aim (m)
  camPitch: 42, // degrees down from horizontal (Zombieville USA 3D-like diorama view)
  camYaw: 35, // degrees the view is turned (positive: camera to the right, looking up-left)
  camWidth: 7.2, // metres of floor across a portrait screen at the player
};

// bumped when defaults change, so tuning saved by an older build does not hide the new values
export const TUNING_VERSION = 6;
// defaults changed since an older version: on load those keys go back to the new default (each version's list applies to
// everything saved before it). 4: the melee hit-stop is off by default (a panel save from before round 16 kept 0.07: the
// stutter the user felt on multi-target axe hits), the orderly's charge no longer steers.
const CHANGED = { 3: ['sprinterTurn'], 4: ['meleeHitPause', 'sprinterTurn', 'sprinterWindup'], 5: ['legStrikeChance'], 6: ['sprinterWindup', 'sprinterSpeed'] }; // (5: leg strikes a little rarer, 2026-10-18)
export function makeTuning(saved) {
  if (saved && saved._v >= 2 && saved._v < TUNING_VERSION) { saved = { ...saved }; for (let v = saved._v + 1; v <= TUNING_VERSION; v++) for (const k of CHANGED[v] || []) delete saved[k]; saved._v = TUNING_VERSION; }
  if (!saved || saved._v !== TUNING_VERSION) saved = null;
  return Object.assign({ _v: TUNING_VERSION }, TUNING_DEFAULTS, saved || {});
}
