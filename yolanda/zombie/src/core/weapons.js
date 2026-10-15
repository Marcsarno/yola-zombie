// Weapon definitions and the shared motion that both the simulation and the renderer use.
// Character space: +Z forward, +X the character's LEFT, +Y up. Origin between the feet.
// Hold and swing data are measured from Yola's actual animation clips (assets/clipdata.json), so the
// simulated muzzle and axe are where the rendered ones are.

export const PISTOL = 'pistol';
export const SHOTGUN = 'shotgun';
export const AXE = 'axe';
export const FISTS = 'fists';
export const BAT = 'bat'; // the baseball bat from the Supply Hall: one blunt swing, hold to keep swinging
export const WEAPON_ORDER = [PISTOL, SHOTGUN, AXE, BAT, FISTS]; // the swap button cycles through these (the ones owned)
export const isGun = (w) => w === PISTOL || w === SHOTGUN;
export const isMelee = (kind) => kind === AXE || kind === 'bat'; // kind 'fist' is its own, lighter reaction

export const PISTOL_HOLD = {
  grip: { x: -0.066, y: 1.16, z: 0.43 }, // right-hand grip (measured from pistol_idle, metres)
  muzzleForward: 0.17, // muzzle ahead of the grip along the barrel
  muzzleUp: 0.06,
};
// Short pump shotgun at the low ready (measured in game from the rendered muzzle, hold pose).
export const SHOTGUN_HOLD = { muzzle: { x: -0.206, y: 1.196, z: 0.854 } };
export const SHOTGUN_SPEC = {
  pellets: 9,
  spread: 0.15, // rad, half-angle of the cone
  range: 11, // m; damage and push fall off with distance
  falloffFrom: 2.2, // full power inside this distance
  pumpStart: 0.24, pumpEnd: 0.62, // s after the shot: the pump racks back and forward
  pumpStroke: 0.07, // m the forend slides back
  // reload (sg_reload clip frames): the pump racks when the left hand is back on it
  rackFrom: 80, rackTo: 96,
  // the shell she carries to the loading port: shown between these frames, held in the left hand (offset in
  // metres and rotation in degrees, in the hand's frame; set with the rig lab, viewer.html)
  shell: { from: 30, to: 56, x: 0.0478, y: 0, z: 0, rx: 32.07, ry: 66.49, rz: -47.36, portDown: 0.05 },
};

export function muzzleLocal(weapon, out = {}) {
  if (weapon === SHOTGUN) { Object.assign(out, SHOTGUN_HOLD.muzzle); return out; }
  out.x = PISTOL_HOLD.grip.x; out.y = PISTOL_HOLD.grip.y + PISTOL_HOLD.muzzleUp; out.z = PISTOL_HOLD.grip.z + PISTOL_HOLD.muzzleForward;
  return out;
}

// ---- melee: two-attack combos, each attack sampled from its clip ----
// Every attack: the clip frames that are played (clip time = frame / fps, advanced rate x real time; an optional
// held wind-up plays frames f0..windTo at windRate first), the turn into the attack (yawOffset: the clip strikes off
// to one side, Yola turns so it lands on the aim), the damaging window and when the next attack of the combo may
// start (chainFrom). The combo continues only while the attack is held (or pressed again) AND the first one
// connected. blendIn: how long the previous attack's pose cross-fades into this one (s). hand: the hand the weapon is
// rigid to in this clip (the mirrored swing holds it in the left). style: how the zombie reacts - swing (thrown
// sideways), heavy (thrown hard), chop (driven down).
const deg = Math.PI / 180;
const SWING = { // the leveled baseball swing, right to left at chest height (shared by the axe and the bat)
  name: 'swing', clip: 'bat_swing', path: 'bat_swing', f0: 24, f1: 40, rate: 1.5, fps: 30, yawOffset: 40 * deg,
  duration: 0.6, activeStart: 0.14, activeEnd: 0.33, chainFrom: 0.3, swapPoint: 0.48, assist: 1.75,
};
export const AXE_ATTACKS = [
  { ...SWING, dmg: 1, knock: 1, style: 'swing', sever: { head: 0.35, arm: 0.25 } },
  { // 2: Yola's own overhead chop (Tripo), entered with the axe already raised behind her head so it follows the
    // swing straight away: up, then slammed down on the aim
    name: 'chop', clip: 't_chop', path: 't_chop', f0: 52, f1: 74, rate: 1.3, fps: 30, yawOffset: -14 * deg, // (the clip lands ~14 degrees left: she turns so it comes down on the aim)
    duration: 0.74, activeStart: 0.2, activeEnd: 0.4, chainFrom: 9, swapPoint: 0.55, blendIn: 0.16, assist: 2.1, lungeMax: 0.6,
    dmg: 1.6, knock: 0.8, style: 'chop', sever: { head: 0.6, arm: 0.35 },
  },
];
// ---- unarmed: jab, cross, sweeping kick (Yola's own Tripo clips; a limb is the striker, not a weapon) ----
// limb: the clip sample that strikes (l/r = hand grip, rf = right toe). The "weapon" is a short segment at
// the limb (geom), so the same swept hit test as the axe applies; the kick sweeps an arc, so it catches
// whatever the foot passes. stand: how close she steps in to the target.
const FIST_GEOM = { length: 0.12, hitFrom: 0, radius: 0.12 };
export const FIST_ATTACKS = [
  { name: 'jab', clip: 't_box_01', path: 't_box_01', limb: 'l', f0: 8, f1: 38, rate: 1.4, fps: 30, yawOffset: 5.7 * deg,
    duration: 0.66, activeStart: 0.14, activeEnd: 0.33, chainFrom: 0.36, swapPoint: 0.42, geom: FIST_GEOM, stand: 0.7, assist: 1.5,
    dmg: 1, knock: 0.3, style: 'jab', sever: {} },
  { name: 'cross', clip: 't_box_02', path: 't_box_02', limb: 'r', f0: 44, f1: 62, rate: 1.4, fps: 30, yawOffset: 4.9 * deg,
    duration: 0.5, activeStart: 0.17, activeEnd: 0.32, chainFrom: 0.34, swapPoint: 0.4, geom: FIST_GEOM, stand: 0.7, assist: 1.7,
    dmg: 1.3, knock: 0.45, style: 'cross', sever: {} },
  { name: 'kick', clip: 't_kick_02', path: 't_kick_02', limb: 'rf', f0: 14, f1: 40, rate: 1.2, fps: 30, yawOffset: 30 * deg,
    duration: 0.74, activeStart: 0.3, activeEnd: 0.56, chainFrom: 9, swapPoint: 0.6, geom: { length: 0.15, hitFrom: 0, radius: 0.15 }, stand: 0.95, assist: 1.9,
    dmg: 2.2, knock: 1.0, style: 'kick', sever: {} },
];
// attack set of a weapon
// the bat: the same leveled swing (right to left), then the home-run swing back the other way - her own swing
// mirrored (left to right, the bat rigid to the left hand), loaded with a held wind-up and driven through hard.
// Blunt: never severs. (x axeDamage 62, zombie 100 hp: the swing's 37 leaves it standing, the home run finishes it.)
// sock: the grip calibration the renderer uses (the first swing keeps the bat's own idle grip).
export const BAT_ATTACKS = [
  { ...SWING, name: 'bat swing', dmg: 0.6, knock: 1.0, style: 'swing', sever: {} },
  { name: 'bat home run', sock: 'home run', clip: 'bat_swing_m', path: 'bat_swing_m', hand: 'Left',
    f0: 28, windTo: 31, windRate: 0.4, f1: 44, rate: 1.7, fps: 30, yawOffset: -40 * deg,
    duration: 0.8, activeStart: 0.22, activeEnd: 0.41, chainFrom: 9, swapPoint: 0.6, blendIn: 0.16, assist: 2.1, lungeMax: 0.8,
    dmg: 1.15, knock: 1.7, style: 'heavy', sever: {} },
];
// clip frame at attack time t (a held wind-up first when the attack has one), and its inverse
export function attackFrame(A, t) {
  if (!A.windRate) return A.f0 + t * A.fps * A.rate;
  const tw = (A.windTo - A.f0) / (A.fps * A.windRate);
  return t <= tw ? A.f0 + t * A.fps * A.windRate : A.windTo + (t - tw) * A.fps * A.rate;
}
export function attackTime(A, f) {
  if (!A.windRate) return (f - A.f0) / (A.fps * A.rate);
  const tw = (A.windTo - A.f0) / (A.fps * A.windRate);
  return f <= A.windTo ? (f - A.f0) / (A.fps * A.windRate) : tw + (f - A.windTo) / (A.fps * A.rate);
}
export const attackEnd = (A) => attackTime(A, A.f1);
export const attacksOf = (w) => (w === FISTS ? FIST_ATTACKS : w === BAT ? BAT_ATTACKS : AXE_ATTACKS);
export const AXE_GEOM = {
  length: 0.74, // hands (midpoint of the grip) to the blade, metres
  hitFrom: 0.3, // only the outer part of the axe lands a blow
  radius: 0.09,
};
// legacy name (physics lab, debug)
export const BAT_SWING = AXE_ATTACKS[0];

const rotY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
// samples: clipdata[path] ([{f, r:[x,y,z], l:[x,y,z], d, hips}] in model units); scale: model units -> metres
// hipsRest: the renderer pins the hips' horizontal position, so the clip's hip drift is removed here too.
export function setMeleePaths(clipdata, scale, hipsRest) {
  for (const A of [...AXE_ATTACKS, ...BAT_ATTACKS, ...FIST_ATTACKS]) {
    const samples = clipdata[A.path];
    A.PATH = [];
    if (!samples) continue;
    for (const s of samples) {
      if (s.f < A.f0 - 0.001 || s.f > A.f1) continue;
      const t = attackTime(A, s.f);
      const ox = s.hips && hipsRest ? s.hips[0] - hipsRest[0] : 0, oz = s.hips && hipsRest ? s.hips[2] - hipsRest[2] : 0;
      const pin = (v) => [v[0] - ox, v[1], v[2] - oz];
      if (A.limb) { // unarmed: the striking limb, pointing out from the hips
        const p = rotY(pin(s[A.limb]).map((v) => v * scale), A.yawOffset), h = rotY(pin(s.hips).map((v) => v * scale), A.yawOffset);
        const d = [p[0] - h[0], 0, p[2] - h[2]], dl = Math.hypot(d[0], d[2]) || 1;
        A.PATH.push({ t, mx: p[0], my: p[1], mz: p[2], dx: d[0] / dl, dy: 0, dz: d[2] / dl });
        continue;
      }
      const r = rotY(pin(s.r).map((v) => v * scale), A.yawOffset), l = rotY(pin(s.l).map((v) => v * scale), A.yawOffset);
      const d = s.d ? rotY(s.d, A.yawOffset) : [r[0] - l[0], r[1] - l[1], r[2] - l[2]];
      const dl = Math.hypot(d[0], d[1], d[2]) || 1;
      A.PATH.push({ t, mx: (r[0] + l[0]) / 2, my: (r[1] + l[1]) / 2, mz: (r[2] + l[2]) / 2, dx: d[0] / dl, dy: d[1] / dl, dz: d[2] / dl });
    }
  }
}

// Pose of the axe at attack time t: hands midpoint (hx,hy,hz) and unit direction toward the head (dx,dy,dz).
export function meleePose(A, t, out = {}) {
  const P = A.PATH;
  if (!P || !P.length) { out.hx = -0.2; out.hy = 1.1; out.hz = 0.2; out.dx = 0; out.dy = 0.7; out.dz = -0.7; return out; }
  if (t <= P[0].t) { Object.assign(out, { hx: P[0].mx, hy: P[0].my, hz: P[0].mz, dx: P[0].dx, dy: P[0].dy, dz: P[0].dz }); return out; }
  let i = 0;
  while (i < P.length - 2 && t > P[i + 1].t) i++;
  const a = P[i], b = P[i + 1], u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t || 1)));
  out.hx = a.mx + (b.mx - a.mx) * u; out.hy = a.my + (b.my - a.my) * u; out.hz = a.mz + (b.mz - a.mz) * u;
  let dx = a.dx + (b.dx - a.dx) * u, dy = a.dy + (b.dy - a.dy) * u, dz = a.dz + (b.dz - a.dz) * u;
  const dl = Math.hypot(dx, dy, dz) || 1;
  out.dx = dx / dl; out.dy = dy / dl; out.dz = dz / dl;
  return out;
}

// Axe segment (hands -> head) in character space at attack time t.
export function meleeSegment(A, t, out = {}) {
  meleePose(A, t, out);
  const L = (A.geom || AXE_GEOM).length;
  out.tx = out.hx + out.dx * L;
  out.ty = out.hy + out.dy * L;
  out.tz = out.hz + out.dz * L;
  return out;
}
