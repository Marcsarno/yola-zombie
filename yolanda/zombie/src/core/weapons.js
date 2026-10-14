// Weapon definitions and the shared motion that both the simulation and the renderer use.
// Character space: +Z forward, +X the character's LEFT, +Y up. Origin between the feet.
// Hold and swing data are measured from Yola's actual animation clips (assets/clipdata.json), so the
// simulated muzzle and axe are where the rendered ones are.

export const PISTOL = 'pistol';
export const SHOTGUN = 'shotgun';
export const AXE = 'axe';
export const WEAPON_ORDER = [PISTOL, SHOTGUN, AXE]; // the swap button cycles through these
export const isGun = (w) => w === PISTOL || w === SHOTGUN;
export const isMelee = (kind) => kind === AXE || kind === 'bat';

export const PISTOL_HOLD = {
  grip: { x: -0.066, y: 1.16, z: 0.43 }, // right-hand grip (measured from pistol_idle, metres)
  muzzleForward: 0.17, // muzzle ahead of the grip along the barrel
  muzzleUp: 0.06,
};
// Pump shotgun held at the shoulder (measured in game from the rendered muzzle, aim pose).
export const SHOTGUN_HOLD = { muzzle: { x: -0.21, y: 1.055, z: 1.026 } };
export const SHOTGUN_SPEC = {
  pellets: 9,
  spread: 0.15, // rad, half-angle of the cone
  range: 11, // m; damage and push fall off with distance
  falloffFrom: 2.2, // full power inside this distance
  pumpStart: 0.24, pumpEnd: 0.62, // s after the shot: the pump racks back and forward
};

export function muzzleLocal(weapon, out = {}) {
  if (weapon === SHOTGUN) { Object.assign(out, SHOTGUN_HOLD.muzzle); return out; }
  out.x = PISTOL_HOLD.grip.x; out.y = PISTOL_HOLD.grip.y + PISTOL_HOLD.muzzleUp; out.z = PISTOL_HOLD.grip.z + PISTOL_HOLD.muzzleForward;
  return out;
}

// ---- axe: a three-attack combo, each attack sampled from its clip ----
// Every attack: the clip frames that are played (clip time = frame / fps, advanced rate x real time),
// the turn into the attack (yawOffset: the clip strikes off to one side, Yola turns so it lands on the
// aim), the damaging window and when the next attack of the combo may start (chainFrom). The combo
// continues only while the attack is held (or pressed again) AND the current attack connected.
// style: how the zombie reacts - swing (thrown sideways), heavy (thrown hard), chop (driven down).
const deg = Math.PI / 180;
export const AXE_ATTACKS = [
  { // 1: the leveled baseball swing, right to left at chest height
    name: 'swing', clip: 'bat_swing', path: 'bat_swing', f0: 24, f1: 40, rate: 1.5, fps: 30, yawOffset: 40 * deg,
    duration: 0.62, activeStart: 0.155, activeEnd: 0.31, chainFrom: 0.33, swapPoint: 0.48,
    dmg: 1, knock: 1, style: 'swing', sever: { head: 0.35, arm: 0.25 },
  },
  { // last: the finisher, an overhead chop (Mixamo heavy weapon swing: raise over the head, slam down, lean in)
    name: 'chop', clip: 'heavy_swing', path: 'heavy_swing', f0: 58, f1: 96, rate: 2.0, fps: 30, yawOffset: 0,
    duration: 0.85, activeStart: 0.3, activeEnd: 0.47, chainFrom: 9, swapPoint: 0.66,
    dmg: 1.6, knock: 0.8, style: 'chop', sever: { head: 0.6, arm: 0.35 },
  },
];
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
  for (const A of AXE_ATTACKS) {
    const samples = clipdata[A.path];
    A.PATH = [];
    if (!samples) continue;
    for (const s of samples) {
      const t = (s.f - A.f0) / (A.fps * A.rate);
      if (t < -0.001 || s.f > A.f1) continue;
      const ox = s.hips && hipsRest ? s.hips[0] - hipsRest[0] : 0, oz = s.hips && hipsRest ? s.hips[2] - hipsRest[2] : 0;
      const pin = (v) => [v[0] - ox, v[1], v[2] - oz];
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
  out.tx = out.hx + out.dx * AXE_GEOM.length;
  out.ty = out.hy + out.dy * AXE_GEOM.length;
  out.tz = out.hz + out.dz * AXE_GEOM.length;
  return out;
}
