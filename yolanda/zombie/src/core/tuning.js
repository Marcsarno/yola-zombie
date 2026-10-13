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
  reloadTime: 1.05,
  swapTime: 0.3,
  batDamage: 70,
  batKnockback: 5.2, // m/s impulse
  batSpeed: 1.0, // swing time scale (higher = faster)
  hitPause: 0.05, // s freeze on heavy hits (0 = off)
  shake: 1.0,
  zombieSpeed: 1.0, // m/s approach
  zombieHp: 100,
  zombieDamage: 12,
  lookAhead: 1.3, // camera look-ahead toward aim (m)
};

export function makeTuning(saved) {
  return Object.assign({}, TUNING_DEFAULTS, saved || {});
}
