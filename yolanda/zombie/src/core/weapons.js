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
// the bat: ONE continuous combo clip (bat_combo_mc, 60 fps), retargeted onto Yola from the reference footage (pose
// estimation + the tracked bat), cut into three strikes that hand over at the exact frame where the previous one
// ends, so chaining never cross-fades: 1) the lunging forehand (right to left, a full-body turn), 2) the backhand
// (left to right, from where the forehand left the bat), 3) the spinning, rising finisher (right to left). Each wind-up
// may play a little faster than the reference (windRate); every strike plays at the reference's own speed.
// Frames: hitF0..hitF1 the damaging sweep (from the measured bat path), f1 the hand-over. Blunt: never severs.
// (x axeDamage 62, zombie 100 hp: forehand 37 + backhand 43 leave it standing; the finisher's 81 ends it.)
const BAT_CLIP = { clip: 'bat_combo_mc', path: 'bat_combo_mc', sock: 'bat combo', fps: 60, rate: 1, yawOffset: 0, stand: 0.85, assist: 1.9, continuous: true, chainAlways: true, sever: {} };
export const BAT_ATTACKS = [
  { ...BAT_CLIP, name: 'bat forehand', f0: 4, f1: 40, hitF0: 20, hitF1: 32, recover: 0.36, enterBlend: 0.12, dmg: 0.6, knock: 0.9, style: 'swing' },
  { ...BAT_CLIP, name: 'bat backhand', f0: 40, windTo: 70, windRate: 1.4, f1: 97, hitF0: 73, hitF1: 91, recover: 0.34, dmg: 0.7, knock: 1.0, style: 'swing' },
  { ...BAT_CLIP, name: 'bat finisher', f0: 97, windTo: 118, windRate: 1.3, f1: 165, hitF0: 120, hitF1: 135, recover: 0.3, dmg: 1.3, knock: 1.8, style: 'heavy', last: true },
];
// The bat since 2026-10-16: Quaternius's one-handed Sword Regular Combo (UAL2, CC0), the user's pick, split into its strikes
// and built at load on whichever Yola is playing (src/render/libattack.js; main.js setupBat replaces the strikes above).
// The bat model's frame (makeBat(0.84), the Move Library's data sheet) and how it hits.
export const BAT_DEF = { builder: 'makeBat', hands: 'one', grip_primary: [0, 0, -0.065], shaft_axis: [0, 0, 1], ref_axis: [1, 0, 0],
  length_m: 0.84, impact_point: [0, 0, 0.55], tip: [0, 0, 0.71], knob: [0, 0, -0.13] };
export const BAT_PROFILE = { kind: 'bat', dmg: 0.75, knock: 1.0, style: 'swing', sever: {}, hitFrom: 0.45, radius: 0.1, reach: 'tip' };
export function useBuiltBat(strikes) {
  BAT_ATTACKS.length = 0; BAT_ATTACKS.push(...strikes);
  const last = BAT_ATTACKS[BAT_ATTACKS.length - 1]; // the finisher lands harder
  if (last && BAT_ATTACKS.length > 1) Object.assign(last, { dmg: BAT_PROFILE.dmg * 1.6, knock: 1.7, style: 'heavy' });
  // the wait after the finisher before the combo can start again, cut by 75% (the user, 2026-10-17): from the end of its
  // hit to the end of its action was 1.6 s (its settle back to the stance + recover); a new combo may now start a quarter
  // of the way through it (player.js restartFrom), the finisher's pose fading out under the new opener
  if (last) last.restartFrom = last.activeEnd + 0.25 * (last.duration - last.activeEnd);
}
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
// frame-authored attacks: their times (attack clock) from their frames (again after a retime: the lab's sliders)
function timeBat() {
  for (const A of BAT_ATTACKS) {
    if (A.built) continue;
    A.activeStart = attackTime(A, A.hitF0); A.activeEnd = attackTime(A, A.hitF1);
    const end = attackEnd(A);
    A.chainFrom = A.last ? 9 : end; // the hand-over: the next strike starts on the frame this one ends
    A.duration = end + A.recover; A.swapPoint = end;
  }
}
timeBat();
let _pathArgs = null;
export function retimeBat(changes) { // [{i, windRate?, recover?, enterBlend?}]
  for (const c of changes) Object.assign(BAT_ATTACKS[c.i], c);
  timeBat(); if (_pathArgs) setMeleePaths(..._pathArgs);
}
// ---- the weapon test arena (combat.html?mode=arena): any library attack on any weapon, one at a time ----
// TEST_ATTACKS holds the attack picked in the arena (src/arena/testarena.js builds it: the clip, its sampled weapon path
// PATH, its damaging windows from the weapon's speed, its forward travel ROOT and the weapon's damage profile).
export const TEST = 'test';
export const TEST_ATTACKS = [];
// The downward strike at a zombie on the floor (knocked down, tripped or crawling): Yola's own overhead chop (t_chop, the
// axe's second attack) for every melee weapon, with that weapon's profile (blunt weapons crush, blades cut). Started
// instead of the combo's first attack when the nearest thing in front of her is down (Sim.groundTarget).
const GROUND = {};
export function groundAttack(w) {
  if (GROUND_OWN[w]) return GROUND_OWN[w];
  if (w !== AXE && w !== BAT && w !== TEST) return null;
  const base = AXE_ATTACKS[1], T0 = w === TEST ? TEST_ATTACKS[0] : null;
  if (!base.PATH || (w === TEST && !T0)) return null;
  const key = w + (T0 ? '|' + T0.clip + T0.kind : '');
  if (GROUND[key]) return GROUND[key];
  const g = { ...base, name: 'ground', sock: 'chop', chainFrom: 9, blendIn: 0.12, enterBlend: 0.14, assist: 2.0, ground: true };
  if (w === BAT) Object.assign(g, { kind: 'bat', sever: {}, dmg: 1.4, knock: 0.6 });
  if (T0) Object.assign(g, { kind: T0.kind, sever: T0.kind === 'axe' ? { head: 0.5, arm: 0.3, leg: 0.2 } : {}, dmg: Math.max(1.2, T0.dmg * 1.5), knock: 0.6, sound: T0.sound,
    geom: T0.geom && T0.kind !== 'fist' ? { length: Math.max(0.45, T0.geom.length), hitFrom: 0.3, radius: Math.max(0.1, T0.geom.radius) } : base.geom });
  return (GROUND[key] = g);
}
export const resetGroundAttacks = () => { for (const k in GROUND) delete GROUND[k]; };
// A weapon's own downward strike, built at load (render/newmoves.js: the bat's Quaternius Sword_Heavy_D smash into the
// floor), used by groundAttack in place of the shared chop
export const GROUND_OWN = {};
// ---- the leg attacks (2026-10-17, the user: "attacks that would take out their legs ... to get them to crawl") ----
// Started by their own button (Legs / C, core/player.js startLegs). Low: they hit below the knee (minY 0), never a body
// on the floor, and always strike the shins (sim.js resolveMelee style 'legs'): a blade cuts the lower leg off, a blunt
// weapon or a slide breaks it (core/zombies.js cripple); either way the zombie goes down and crawls.
//   axe:   the Mixamo great-sword low slash (gs_low_slash, two-handed, already on Yola): overhead, down to the ankles
//   bat:   Quaternius UAL2 Sword_Light_C, a crouched knee-height sweep (built at load, render/newmoves.js)
//   fists: Quaternius UAL2 Slide_Start + Slide_Exit, a feet-first slide tackle (built at load)
export const LEG_ATTACKS = {
  axe: { name: 'leg chop', clip: 'gs_low_slash', path: 'gs_low_slash', f0: 12, f1: 34, rate: 1.25, fps: 30, yawOffset: 0, sock: 'leg chop',
    duration: 0.95, activeStart: 0.3, activeEnd: 0.5, chainFrom: 9, swapPoint: 0.7, blendIn: 0.12, enterBlend: 0.12, assist: 1.8, lungeMax: 0.5,
    dmg: 0.9, knock: 0.5, style: 'legs', minY: 0, legs: true, sever: { leg: 1 } },
};
export const legAttack = (w) => LEG_ATTACKS[w] || null;
export const attacksOf = (w) => (w === FISTS ? FIST_ATTACKS : w === BAT ? BAT_ATTACKS : w === TEST ? TEST_ATTACKS : AXE_ATTACKS);
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
  _pathArgs = [clipdata, scale, hipsRest];
  for (const A of [...AXE_ATTACKS, ...BAT_ATTACKS, ...FIST_ATTACKS, LEG_ATTACKS.axe]) {
    if (A.built) continue; // (built at load with its own path)
    const samples = clipdata[A.path];
    A.PATH = []; A.ROOT = null;
    if (!samples) continue;
    if (A.continuous) { const s0 = samples.find((q) => q.f >= A.f0); A.ROOT = samples.filter((q) => q.f >= A.f0 && q.f <= A.f1).map((q) => ({ t: attackTime(A, q.f), z: (q.hips[2] - s0.hips[2]) * scale })); }
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
