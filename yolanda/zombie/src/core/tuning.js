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
  testInfiniteAmmo: true, // testing: spare rounds never run out (magazines still empty and reload); false = Floor 3 counts them
  headshotChance: 0.1, // a clean centre-mass pistol hit sometimes takes the head off (one-shot kill)
  reloadTime: 1.05,
  swapTime: 0.3,
  shotgunDamage: 16, // per pellet (9 pellets), full power inside ~2 m, falling off to a third at 11 m
  shotgunKnockback: 9, // m/s push when every pellet lands at close range
  shotgunInterval: 0.85, // s between shots (the pump)
  shotgunMag: 6,
  shotgunReload: 1.9,
  axeDamage: 62, // first attack; the combo's later attacks hit harder (weapons.js AXE_ATTACKS)
  axeKnockback: 5.0, // m/s impulse
  axeSpeed: 1.0, // attack time scale (higher = faster)
  axeKnockdown: 0.45, // chance a non-lethal axe hit knocks the zombie flat (the chop: more)
  fistDamage: 18, // jab; the cross and kick hit harder (weapons.js FIST_ATTACKS)
  fistKnockback: 4.0, // m/s impulse (x the attack's knock factor)
  hitPause: 0.085, // s freeze on axe hits (kills hold 1.4x longer; 0 = off)
  shake: 1.0,
  zombieSpeed: 1.0, // m/s approach
  zombieHp: 100,
  zombieDamage: 12,
  lookAhead: 1.3, // camera look-ahead toward aim (m)
  camPitch: 42, // degrees down from horizontal (Zombieville USA 3D-like diorama view)
  camYaw: 35, // degrees the view is turned (positive: camera to the right, looking up-left)
  camWidth: 7.2, // metres of floor across a portrait screen at the player
};

export function makeTuning(saved) {
  return Object.assign({}, TUNING_DEFAULTS, saved || {});
}
