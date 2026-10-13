// Weapon definitions and the shared motion that both the simulation and the renderer use.
// Character space: +Z forward, +X the character's LEFT, +Y up. Origin between the feet.
// Hold and swing data are measured from Yola's actual animation clips (assets/clipdata.json), so the
// simulated muzzle and bat are where the rendered ones are.

export const PISTOL = 'pistol';
export const BAT = 'bat';

export const PISTOL_HOLD = {
  grip: { x: -0.066, y: 1.16, z: 0.43 }, // right-hand grip (measured from pistol_idle, metres)
  muzzleForward: 0.17, // muzzle ahead of the grip along the barrel
  muzzleUp: 0.06,
};

export function pistolGripLocal(out = {}) {
  out.x = PISTOL_HOLD.grip.x; out.y = PISTOL_HOLD.grip.y; out.z = PISTOL_HOLD.grip.z;
  return out;
}
export function muzzleLocal(out = {}) {
  pistolGripLocal(out);
  out.y += PISTOL_HOLD.muzzleUp;
  out.z += PISTOL_HOLD.muzzleForward;
  return out;
}

// ---- bat swing: sampled from the bat_swing clip ----
// The clip (Mixamo "Baseball Hit - Single", leveled in Blender so the bat sweeps flat at waist-chest
// height instead of dipping to a pitched ball at the knees) sweeps the bat around the batter's right
// side, as a batter stands sideways to the target. During the swing Yola turns yawOffset into it, so
// the sweep finishes square on the aim. The sampled path is rotated by the same offset, keeping the
// hit test and the rendered bat identical.
export const BAT_SWING = {
  clipStartFrame: 24, // clip frame at swing time 0 (end of the stance, start of the load)
  clipEndFrame: 40, // end of the two-handed follow-through (the batter lets go after this); blend back to ready
  rate: 1.5, // clip frames advance this many times faster than real time
  fps: 30,
  yawOffset: (40 * Math.PI) / 180,
  duration: 0.62,
  activeStart: 0.155,
  activeEnd: 0.31,
  length: 0.71, // hands (midpoint of the grip) to the tip, metres
  fullLength: 0.84,
  hitFrom: 0.24,
  radius: 0.09,
  swapPointRecover: 0.48,
};
let PATH = null; // [{t, mx,my,mz, dx,dy,dz}] in metres, character space

const rotY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
// samples: clipdata.bat_swing ([{f, r:[x,y,z], l:[x,y,z]}] in model units); scale: model units -> metres
// hipsRest: the renderer pins the hips' horizontal position, so the clip's hip drift is removed here too.
export function setBatPath(samples, scale, hipsRest) {
  const S = BAT_SWING;
  PATH = [];
  for (const s of samples) {
    const t = (s.f - S.clipStartFrame) / (S.fps * S.rate);
    if (t < -0.001 || s.f > S.clipEndFrame) continue;
    const ox = s.hips && hipsRest ? s.hips[0] - hipsRest[0] : 0, oz = s.hips && hipsRest ? s.hips[2] - hipsRest[2] : 0;
    const pin = (v) => [v[0] - ox, v[1], v[2] - oz];
    const r = rotY(pin(s.r).map((v) => v * scale), S.yawOffset), l = rotY(pin(s.l).map((v) => v * scale), S.yawOffset);
    // bat direction: from the right-hand socket calibrated on the Mixamo reference skeleton (s.d);
    // older data falls back to the line between the hands
    const d = s.d ? rotY(s.d, S.yawOffset) : [r[0] - l[0], r[1] - l[1], r[2] - l[2]];
    let dx = d[0], dy = d[1], dz = d[2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    PATH.push({ t, mx: (r[0] + l[0]) / 2, my: (r[1] + l[1]) / 2, mz: (r[2] + l[2]) / 2, dx: dx / dl, dy: dy / dl, dz: dz / dl });
  }
}

// Pose of the bat at swing time t: hands midpoint (hx,hy,hz) and unit direction toward the tip (dx,dy,dz).
export function batPose(t, out = {}) {
  if (!PATH || !PATH.length) { out.hx = -0.2; out.hy = 1.1; out.hz = 0.2; out.dx = 0; out.dy = 0.7; out.dz = -0.7; return out; }
  const P = PATH;
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

// Bat segment (hands -> tip) in character space at swing time t.
export function batSegment(t, out = {}) {
  batPose(t, out);
  out.tx = out.hx + out.dx * BAT_SWING.length;
  out.ty = out.hy + out.dy * BAT_SWING.length;
  out.tz = out.hz + out.dz * BAT_SWING.length;
  return out;
}
