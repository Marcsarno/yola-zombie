// Player: one authoritative movement controller + one weapon action state machine.
// Yaw convention: forward = (sin yaw, cos yaw) on (x, z).
import { clamp, angleDiff, approachAngle, segPointDist2, rayCircle } from './world.js';
import { PISTOL, SHOTGUN, AXE, FISTS, WEAPON_ORDER, usableWeapons, attacksOf, meleeSegment, muzzleLocal, attackEnd, groundAttack, legAttack, strikeReach, EXEC_LAUNCH, EXEC_SLIDE } from './weapons.js';

const AIM_DEADZONE = 0.18;
// knocked flat (the sprinter's charge): thrown back onto the floor, rolls onto her front, gets up (assets/yola_extra.glb:
// the Mixamo knockdown and stomach get-up, as the zombies use them; the get-up clip starts turned GETUP_YAW from the fall)
export const DOWN_FALL = 1.15, DOWN_UP = 1.7, DOWN_YAW = -2.705;
// the kip-up (2026-10-18, the user: "a quick get-up ... on their back, throws their legs upward, and springs back onto
// their feet"): Quaternius UAL2 KipUp (assets/yola2_ual.glb). Every knockdown throws her onto her back first (the fall's
// frames 1-44: on her back by 38), so she kips straight up from there instead of rolling over onto her front and
// pushing up (2.85 s down -> 2.0 s): fall s, then up s; she comes up facing the way she fell from (the attacker)
export const KIP = { fall: 0.95, up: 1.05 };
const FIRE_ALIGN = 0.38; // rad: the shot waits until the upper body faces within this of the stick
const _seg = {}, _seg2 = {}, _mz = {};
const _rm = { x: 0, z: 0 };
// a root curve [{t, z}] at attack time t (linear between samples)
function rootAt(R, t) {
  if (t <= R[0].t) return R[0].z; let i = 0;
  while (i < R.length - 2 && t > R[i + 1].t) i++;
  const a = R[i], b = R[i + 1], u = Math.min(1, (t - a.t) / (b.t - a.t || 1)); return a.z + (b.z - a.z) * u;
}
const smooth = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
// The dodge and the vault (2026-10-17, Quaternius UAL1 Dodge_Left / Dodge_Right / Roll, UAL2 SafetyVault; played by
// render/clipchars.js YolaView over everything else). The dodge goes the way the move stick points (no stick: straight
// back from the aim): across her aim a side dodge (she keeps facing the aim), along it a roll (she turns into it).
// dur (s), dist (m: the clips' own root travel, scaled to her and shortened for the roll), iframes [from, to] (s: blows
// pass through her), cancel: from when an attack or a shot may cut it short. out: how its travel eases (the side dodge
// bursts out, as its clip: most of 2 m in the first third).
export const DODGE = {
  side: { dur: 0.72, dist: 1.9, iframes: [0.03, 0.42], cancel: 0.5, out: (u) => 1 - Math.pow(1 - u, 2.6) },
  roll: { dur: 0.8, dist: 3.0, iframes: [0.03, 0.5], cancel: 0.62, out: (u) => smooth(u) * 0.35 + u * 0.65 },
  cooldown: 0.25,
};
// the vault: a prop she runs into that is low (0.35-1.1 m) and thin (at most 1.3 m through along her run), with room to
// land on the far side. She clears it in VAULT.dur, untouched by that prop; the zombies have to go round.
// Only head-on (the user, 2026-10-17: "if you're gliding into it, don't vault"): her stick and her actual run both within
// headOn of square to the face she meets, at more than minSpeed of her full run.
export const VAULT = { dur: 0.62, minH: 0.35, maxH: 1.1, maxDepth: 1.3, reach: 0.38, headOn: 25 * Math.PI / 180, minSpeed: 0.55 };
// ray (x,z)+(dx,dz)t against a box: [tEnter, tExit, the face it enters: 0 = an x face, 1 = a z face] or null
function rayBox(b, x, z, dx, dz) {
  let t0 = -1e9, t1 = 1e9, face = 0;
  for (const [k, p, d, lo, hi] of [[0, x, dx, b.minX, b.maxX], [1, z, dz, b.minZ, b.maxZ]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let a = (lo - p) / d, c = (hi - p) / d; if (a > c) [a, c] = [c, a];
    if (a > t0) { t0 = a; face = k; }
    t1 = Math.min(t1, c); if (t0 > t1) return null;
  }
  return [t0, t1, face];
}

const ZS_STAGGER = 'stagger';
export class Player {
  constructor(x, z, tuning) {
    this.T = tuning;
    this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.r = 0.3;
    this.aimYaw = Math.PI; // face up the screen at spawn
    this.aimTarget = this.aimYaw;
    this.aiming = false; this.attackHeld = false;
    this.hp = 100; this.maxHp = 100; this.dead = false; this.invuln = 0; this.hurtT = 9;
    this.owned = usableWeapons(WEAPON_ORDER); // weapons she carries (the swap button cycles through these; the library ones once built)
    this.equipped = PISTOL; this.desired = PISTOL;
    this.mags = { [PISTOL]: tuning.magSize, [SHOTGUN]: tuning.shotgunMag };
    this.reserve = { [PISTOL]: Infinity, [SHOTGUN]: Infinity }; // spare rounds (the story level counts them; practice never runs out)
    this.action = { type: 'ready', t: 0 };
    this.recoil = 0; // 0..1 visual recoil envelope
    this.shotCount = 0; this.swingId = 0;
    this.moveIntent = 0; // stick magnitude (for animation)
    this.dodgeCd = 0;
  }

  // ---------------- the dodge, the vault, the leg attack ----------------
  // a dodge press: along the move stick (in world directions), or straight back from the aim. auto (sim.autoDodge, a
  // special attack): the escape it chose: (mx, mz) its direction, dist (shortened where a wall comes first), roll (the
  // slam: rolled out of), or kind left / right with face (the charge: squared up to the charger, a side step)
  tryDodge(mx, mz, sim, auto = null) {
    if (this.dead || this.dodgeCd > 0) return false;
    const a = this.action, t = a.type;
    const free = t === 'ready' || t === 'reload' || t === 'shot' || (t === 'swing' && a.st >= this.atk(a).activeEnd) || (t === 'dodge' && a.t >= DODGE[a.kind === 'roll' ? 'roll' : 'side'].dur * 0.85);
    if (!free) return false; // (not mid-strike, knocked down, swapping or vaulting)
    if (auto) {
      const kind = auto.roll ? 'roll' : auto.kind, D = auto.roll ? DODGE.roll : DODGE.side;
      if (kind === 'roll') this.aimYaw = this.aimTarget = Math.atan2(mx, mz); else if (auto.face != null) this.aimYaw = this.aimTarget = auto.face;
      this.setAction('dodge', { kind, dirX: mx, dirZ: mz, dur: D.dur, dist: Math.min(D.dist, auto.dist ?? D.dist), done: 0, auto: true });
      this.attackHeld = false; this.vx *= 0.3; this.vz *= 0.3;
      sim.emit({ type: 'dodge', kind, auto: true });
      return true;
    }
    let l = Math.hypot(mx, mz);
    if (l < 0.2) { mx = -Math.sin(this.aimYaw); mz = -Math.cos(this.aimYaw); l = 1; } // no stick: back from the aim
    mx /= l; mz /= l;
    const dirYaw = Math.atan2(mx, mz), rel = angleDiff(this.aimYaw, dirYaw), side = Math.abs(rel) > Math.PI * 0.25 && Math.abs(rel) < Math.PI * 0.75;
    const D = side ? DODGE.side : DODGE.roll;
    // (a side dodge: rel > 0 = toward her left, angleDiff measured from the aim)
    const kind = side ? (rel > 0 ? 'left' : 'right') : 'roll';
    if (kind === 'roll') { this.aimYaw = this.aimTarget = dirYaw; }
    this.setAction('dodge', { kind, dirX: mx, dirZ: mz, dur: D.dur, dist: D.dist, done: 0 });
    this.attackHeld = false; this.vx *= 0.3; this.vz *= 0.3;
    sim.emit({ type: 'dodge', kind });
    return true;
  }
  // the leg attack of the weapon in hand, on demand (tests; in play it comes now and then on its own: startSwing)
  tryLegs(sim) {
    const L = legAttack(this.equipped); if (!L || this.dead) return false;
    const a = this.action, t = a.type;
    if (!(t === 'ready' || (t === 'swing' && a.st >= this.atk(a).swapPoint) || (t === 'dodge' && a.t >= DODGE[a.kind === 'roll' ? 'roll' : 'side'].cancel))) return false;
    this.startSwing(sim, 0, false, 'legs');
    return true;
  }
  // a vault over the low prop she is running into (from move: stick direction mx, mz, unit)
  tryVault(mx, mz, world, sim) {
    const V = VAULT, ahead = this.r + V.reach, sp = Math.hypot(this.vx, this.vz);
    if (sp < V.minSpeed * this.T.moveSpeed) return false; // (running at it, not walking or easing in)
    const cosOn = Math.cos(V.headOn), vx = this.vx / sp, vz = this.vz / sp;
    for (const b of world.boxes) {
      if (b.off || b.kind !== 'prop' || b.h < V.minH || b.h > V.maxH) continue;
      const tt = rayBox(b, this.x, this.z, mx, mz);
      if (!tt || tt[0] < 0 || tt[0] > ahead || tt[1] - tt[0] > V.maxDepth) continue;
      // head-on: the stick and her run square to the face she meets (not gliding along it, not clipping its corner)
      const nx = tt[2] === 0 ? Math.sign(mx) : 0, nz = tt[2] === 1 ? Math.sign(mz) : 0;
      if (mx * nx + mz * nz < cosOn || vx * nx + vz * nz < cosOn) continue;
      const land = tt[1] + this.r + 0.12, lx = this.x + mx * land, lz = this.z + mz * land;
      // room to land: clear of every other box, inside the level
      const probe = { x: lx, z: lz };
      let clear = true;
      for (const o of world.boxes) {
        if (o === b || o.off) continue;
        const cx = Math.max(o.minX, Math.min(lx, o.maxX)), cz = Math.max(o.minZ, Math.min(lz, o.maxZ));
        if ((lx - cx) ** 2 + (lz - cz) ** 2 < this.r * this.r) { clear = false; break; }
      }
      const B = world.bounds; if (B && (lx < B.minX || lx > B.maxX || lz < B.minZ || lz > B.maxZ)) clear = false;
      if (!clear || !world.lineOfSight(this.x, this.z, lx, lz, 1.2)) continue; // (nothing tall in the way either)
      this.aimYaw = this.aimTarget = Math.atan2(mx, mz);
      this.setAction('vault', { box: b, x0: this.x, z0: this.z, x1: probe.x, z1: probe.z, dur: V.dur, h: b.h });
      this.attackHeld = false; this.vx = this.vz = 0;
      sim.emit({ type: 'vault', h: b.h });
      return true;
    }
    return false;
  }

  get ammo() { return this.mags[this.equipped] ?? 0; }
  set ammo(v) { if (this.equipped in this.mags) this.mags[this.equipped] = v; }
  magSize(w = this.equipped) { return w === SHOTGUN ? this.T.shotgunMag : this.T.magSize; }

  // A swap press steps the weapon we want along pistol -> shotgun -> axe. Presses before the swap
  // starts keep stepping (two quick presses go two weapons along); the swap goes straight there.
  requestSwap() {
    if (this.dead || this.owned.length < 2) return;
    const i = this.owned.indexOf(this.desired);
    this.desired = this.owned[(i + 1) % this.owned.length];
  }

  // Start (or restart) carrying exactly these weapons, the first one in hand
  setLoadout(list, equip = list[0]) {
    this.owned = [...list]; this.equipped = this.desired = equip;
    this.setAction('ready'); this.attackHeld = false;
  }
  get attacks() { return attacksOf(this.equipped); }
  // the attack an action plays: the combo's, the downward strike at a zombie on the floor, or the leg attack
  atk(a = this.action) { return a.execA ? a.execA : a.ground ? groundAttack(this.equipped) : a.leg ? legAttack(this.equipped) : this.attacks[a.combo]; }

  cancelAttacks() {
    const a = this.action.type;
    if (a === 'shot' || a === 'swing') this.setAction('ready');
    this.attackHeld = false;
  }

  setAction(type, extra) {
    this.action = Object.assign({ type, t: 0 }, extra);
  }

  // ---------------- movement ----------------
  move(dt, input, world, sim) {
    const T = this.T;
    let mx = input.moveX, mz = input.moveZ, mag = Math.min(1, Math.hypot(mx, mz));
    this.moveIntent = mag;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    // running into a low prop: over it (VAULT)
    { const t = this.action.type; if (!this.dead && mag > 0.6 && (t === 'ready' || t === 'shot' || t === 'reload') && this.tryVault(mx / mag, mz / mag, world, sim)) { /* the vault owns her now */ } }
    const down = this.action.type === 'down', dodging = this.action.type === 'dodge', vaulting = this.action.type === 'vault';
    const exec = this.action.type === 'execDash' || this.action.type === 'execAim' || !!this.action.execA; // (an execution moves her itself: updateAction)
    if (this.dead || down || dodging || vaulting || exec) { mx = mz = mag = 0; }
    // aim
    const am = down ? 0 : Math.hypot(input.aimX, input.aimZ);
    this.aiming = !this.dead && am > AIM_DEADZONE;
    const held = !this.dead && am >= T.attackThreshold;
    if (held && !this.attackHeld) this.attackPressT = 0; // fresh press
    this.attackPressT = (this.attackPressT ?? 9) + dt;
    this.attackHeld = held;
    if (this.aiming) this.aimTarget = Math.atan2(input.aimX, input.aimZ);
    else if (mag > 0.15) this.aimTarget = Math.atan2(mx, mz);
    let turn = down || vaulting || (dodging && this.action.kind === 'roll') ? 0 : T.turnRate;
    if (this.action.type === 'swing') {
      // commit to the swing: facing is locked through windup and contact (an assist turn toward the target eases in
      // over the first part of the windup instead of snapping), then frees up in recovery
      const a = this.action;
      turn = a.st < a.activeEnd ? 0 : turn * 0.6;
      if (a.turnBy && a.st < a.activeEnd) { const k = smooth(a.st / Math.max(0.05, Math.min(0.14, this.atk(a).activeStart))); this.aimYaw = a.turnFrom + a.turnBy * k; this.aimTarget = this.aimYaw; }
    } else if (this.action.type === 'shot' && this.equipped === SHOTGUN) {
      turn *= 0.7; // a long gun turns a little slower
    }
    this.aimYaw = approachAngle(this.aimYaw, this.aimTarget, turn * dt);

    // desired velocity with direction-dependent speed while aiming
    let speed = T.moveSpeed * mag;
    if (mag > 0.01 && this.aiming) {
      const rel = Math.cos(angleDiff(this.aimYaw, Math.atan2(mx, mz)));
      const side = 1 - Math.abs(rel);
      const k = rel >= 0 ? 1 - side * (1 - T.strafeSpeed) : T.strafeSpeed + (T.backpedalSpeed - T.strafeSpeed) * -rel;
      speed *= k;
    }
    if (this.action.type === 'swing') speed *= this.attackMoveScale();
    speed *= this.wade || 1; // (wading: core/rooms.js FLOOD)
    if (this.grabT > 0) { this.grabT -= dt; speed *= 0.3; } // (a crawler has her by the ankle)
    else if (this.equipped === SHOTGUN) speed *= 0.92;
    const dl = mag > 1e-4 ? speed / mag : 0;
    const dvx = mx * dl - this.vx, dvz = mz * dl - this.vz;
    const dvl = Math.hypot(dvx, dvz);
    const speeding = mx * this.vx + mz * this.vz > 0 && speed * speed >= this.vx * this.vx + this.vz * this.vz;
    const maxDv = (speeding ? T.accel : T.decel) * dt;
    if (dvl > maxDv) { this.vx += (dvx / dvl) * maxDv; this.vz += (dvz / dvl) * maxDv; }
    else { this.vx += dvx; this.vz += dvz; }

    const px = this.x, pz = this.z;
    this.x += this.vx * dt; this.z += this.vz * dt;
    if (this.slide) { // thrown: a slide that decays (not velocity: the stick cannot fight it)
      this.x += this.slide.x * dt; this.z += this.slide.z * dt;
      const k = Math.exp(-dt * 3.2); this.slide.x *= k; this.slide.z *= k;
      if (Math.abs(this.slide.x) + Math.abs(this.slide.z) < 0.05) this.slide = null;
    }
    // the attack's advance (root motion): a bounded step along the attack's heading, eased over the windup, stopping
    // short of the target. It is NOT velocity: it never carries over into the next frame.
    const rm = this.attackAdvance(sim);
    // the dodge's and the vault's travel: along their curves (like the attack advance, never velocity)
    const A0 = this.action;
    if (dodging) {
      const D = DODGE[A0.kind === 'roll' ? 'roll' : 'side'], want = A0.dist * D.out(Math.min(1, (A0.t + dt) / A0.dur)), step = want - A0.done;
      A0.done = want; rm.x += A0.dirX * step; rm.z += A0.dirZ * step;
    } else if (vaulting) {
      const u = smooth(Math.min(1, (A0.t + dt) / A0.dur));
      rm.x += A0.x0 + (A0.x1 - A0.x0) * u - this.x; rm.z += A0.z0 + (A0.z1 - A0.z0) * u - this.z;
    }
    this.x += rm.x; this.z += rm.z;
    // soft-collide with live zombies (not through a dodge's untouchable moment, nor over a prop), then the world
    const through = vaulting || exec || (dodging && this.invuln > 0);
    if (!through) for (const e of sim.zombies) {
      if (!e.solid || (e.state === 'strike' && e.attack === 'dash')) continue; // (the runner's dash brushes past her)
      const dx = this.x - e.x, dz = this.z - e.z, rr = this.r + e.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), push = (rr - d) * 0.85; this.x += (dx / d) * push; this.z += (dz / d) * push; }
    }
    world.resolveCircle(this, this.r, vaulting ? A0.box : null);
    // actual locomotion velocity after collisions (drives animation, stops running into walls); the attack advance
    // is taken back out, so it cannot accumulate into speed
    this.vx = (this.x - px - rm.x - (this.slide ? this.slide.x * dt : 0)) / dt; this.vz = (this.z - pz - rm.z - (this.slide ? this.slide.z * dt : 0)) / dt;
    if (down || dodging || vaulting || exec) this.vx = this.vz = 0; // (on the floor, dodging, vaulting: their own clips, no running animation)
    const vl = Math.hypot(this.vx, this.vz), vmax = T.moveSpeed * 1.05;
    if (vl > vmax) { this.vx *= vmax / vl; this.vz *= vmax / vl; }

    if (this.invuln > 0) this.invuln -= dt;
    this.hurtT += dt;
    this.recoil = Math.max(0, this.recoil - dt * 7);
  }

  // how much stick movement is allowed during an attack: none while its clip owns the legs, back in as it blends out
  attackMoveScale() {
    const a = this.action; if (a.type !== 'swing') return 1;
    const A = this.atk(a), tEnd = attackEnd(A);
    return a.st <= tEnd ? 0 : smooth((a.st - tEnd) / Math.max(0.05, A.duration - tEnd));
  }
  // this step's attack advance: total distance eased over the windup along the heading fixed at the attack's start,
  // reduced so Yola stops a body short of the target (zombie) she is stepping into
  attackAdvance(sim) {
    const out = _rm; out.x = out.z = 0;
    const a = this.action; if (a.type !== 'swing') return out;
    if (a.back > 0) { // stepping back into reach of a body on the floor at her feet, as the weapon goes up
      const want = a.back * smooth(a.st / Math.max(0.05, this.atk(a).activeStart * 0.75)), step = want - (a.backed || 0);
      a.backed = want; out.x -= Math.sin(a.heading) * step; out.z -= Math.cos(a.heading) * step;
    }
    if (!(a.lunge > 0)) return out;
    const A = this.atk(a), dur = Math.max(0.05, A.activeStart);
    const want = A.ROOT ? rootAt(A.ROOT, a.st) * a.rootScale : a.lunge * smooth(a.st / dur), step = want - (a.advanced || 0);
    if (step <= 0) return out;
    let d = step;
    const tg = a.target;
    if (tg && tg.alive) { const gap = Math.hypot(tg.x - this.x, tg.z - this.z) - (A.stand ?? 1.05); d = Math.max(0, Math.min(d, gap)); }
    a.advanced = (a.advanced || 0) + step; // (the curve advances even when blocked: no catch-up burst later)
    out.x += Math.sin(a.heading) * d; out.z += Math.cos(a.heading) * d;
    if (A.ROOTX) { // sideways too (the shotgun slide: to her left, +x in the clip), scaled with the forward travel
      const wx = rootAt(A.ROOTX, a.st) * a.rootScale, sx = wx - (a.sided || 0); a.sided = wx;
      out.x += Math.cos(a.heading) * sx; out.z -= Math.sin(a.heading) * sx;
    }
    return out;
  }

  // ---------------- actions ----------------
  updateAction(dt, sim) {
    const T = this.T, a = this.action;
    if (this.dead) return;
    a.t += dt;
    switch (a.type) {
      case 'execDash': {
        const u = Math.min(1, a.t / a.dur), e = u * u * (3 - 2 * u);
        this.x = a.x0 + (a.x1 - a.x0) * e; this.z = a.z0 + (a.z1 - a.z0) * e; this.vx = this.vz = 0;
        const z = sim.zombies.find((q) => q.id === a.id);
        if (z) this.aimYaw = this.aimTarget = Math.atan2(z.x - this.x, z.z - this.z);
        if (u < 1) break;
        if (!z || !z.alive) { this.setAction('ready'); this.execId = 0; break; }
        if (this.equipped === PISTOL || this.equipped === SHOTGUN) { this.setAction('execAim', { dur: 0.2, id: z.id }); this.execHitIn = 0.2; break; } // (a beat with the muzzle on it, then the shot)
        { const A = this.attacks[this.attacks.length - 1]; this.execHitIn = (A.windows ? A.windows[A.windows.length - 1][0] : A.activeStart) / (this.T.axeSpeed || 1); } // (when her strike lands: render/execution.js paces the wind-up to it)
        this.startSwing(sim, this.attacks.length - 1, true, 'execute'); this.action.execId = z.id;
        break;
      }
      case 'execAim': {
        const z = sim.zombies.find((q) => q.id === a.id);
        if (z) this.aimYaw = this.aimTarget = Math.atan2(z.x - this.x, z.z - this.z);
        if (a.t < a.dur) break;
        if (!z || !z.alive) { this.setAction('ready'); this.execId = 0; break; }
        { // point-blank
          this.setAction('shot', { execId: z.id }); if (this.ammo > 0) this.ammo--; this.shotCount++; this.recoil = 1;
          if (this.equipped === SHOTGUN) sim.fireShotgun(this); else sim.firePistol(this);
          if (z.alive) sim.forceExec(z);
        }
        break;
      }
      case 'shot':
        if (a.t >= (this.equipped === SHOTGUN ? T.shotgunInterval : T.pistolInterval)) this.setAction('ready');
        break;
      case 'swing': {
        const A = this.atk(a);
        if (A.gunShot != null) { // the shotgun slide finisher (render/slidefin.js): the point-blank shot at its frame, the kill with it
          const prevT = a.st; a.st = a.t;
          if (prevT < A.gunShot && a.st >= A.gunShot) {
            if (this.ammo > 0) this.ammo--; this.shotCount++; this.recoil = 0; // (the kick is in the clip)
            sim.fireShotgun(this); const z = sim.zombies.find((q) => q.id === a.execId); if (z && z.alive) sim.forceExec(z);
          }
          if (a.st >= A.duration) { this.setAction('ready'); this.execId = 0; }
          break;
        }
        const prevT = a.st, st = (a.st = a.t * T.axeSpeed);
        if (A.continuous && !A.windows && prevT < A.activeStart - 0.12 && st >= A.activeStart - 0.12) sim.emit({ type: 'whoosh', combo: a.combo }); // the swish peaks on the strike
        if (A.windows) { // several strikes in one clip (library combos): each window hits afresh, with its own swish (one per strike: a split strike's own window)
          for (let i = 0; i < A.windows.length; i++) {
            const [w0, w1] = A.windows[i];
            if (prevT < w0 - 0.1 && st >= w0 - 0.1) sim.emit({ type: 'whoosh', combo: (A.continuous ? A.last : i === A.windows.length - 1) ? 2 : 0 });
            if (st > w0 && prevT < w1) {
              if (a.win !== i) { a.win = i; a.hitSet = new Set(); a.activeEnd = w1; a.clanked = false; }
              sim.resolveMelee(this, Math.max(prevT, w0), Math.min(st, a.activeEnd), a);
            }
          }
        } else {
          if (st > A.activeStart && prevT < a.activeEnd) sim.resolveMelee(this, Math.max(prevT, A.activeStart), Math.min(st, a.activeEnd), a);
          if (prevT < a.activeEnd && st >= a.activeEnd && !a.hits && !a.clanked) sim.emit({ type: 'batMiss' });
        }
        // combo: once the opening attack connects, the rest of the combo follows while the attack is
        // held (or pressed again during the attack)
        if (a.hits > 0 || A.chainAlways) a.unlocked = true; // (the bat's combo flows on input, hit or miss)
        // (comboCap: the combo cut short, e.g. its first two hits for Marc with the case in his other hand, src/hood/view.js)
        if (!a.ground && !a.leg && a.combo < Math.min(this.attacks.length, this.comboCap || Infinity) - 1 && a.unlocked && st >= A.chainFrom && (this.attackHeld || this.attackPressT < a.t)) {
          // (2026-10-18) the strike floored what it hit: the combo goes down after it instead of swinging on over it
          if (groundAttack(this.equipped) && sim.groundTarget?.(this)) this.startSwing(sim, 0); else this.startSwing(sim, a.combo + 1, true);
          break;
        }
        // the combo again before the last attack has fully settled (A.restartFrom: the bat, core/weapons.js useBuiltBat)
        if (!a.ground && !a.leg && A.restartFrom != null && st >= A.restartFrom && st < A.duration && (this.attackHeld || this.attackPressT < a.t)) {
          this.startSwing(sim, 0);
          break;
        }
        if (a.execId) { // (the execution's strike: it never misses)
          const end = A.windows ? A.windows[A.windows.length - 1][1] : a.activeEnd, z = sim.zombies.find((q) => q.id === a.execId);
          if (z && z.alive && st >= end) sim.forceExec(z);
          if (!z || !z.alive) { if (st >= end) this.execId = 0; }
        }
        if (st >= A.duration) { this.setAction('ready'); this.execId = 0; }
        break;
      }
      case 'reload':
        if (!(this.equipped in this.mags)) { this.setAction('ready'); break; }
        if (a.t >= this.reloadTime()) {
          const w = this.equipped, take = Math.min(this.magSize() - this.ammo, this.reserve[w] ?? Infinity);
          this.ammo += take; if (Number.isFinite(this.reserve[w])) this.reserve[w] -= take;
          sim.emit({ type: 'reloadDone', weapon: w }); this.setAction('ready');
        }
        break;
      case 'down':
        if (!a.turned && a.t >= a.fall) { a.turned = true; this.aimYaw += DOWN_YAW; this.aimTarget = this.aimYaw; } // the get-up starts turned
        if (a.t >= a.fall + a.up) { this.setAction('ready'); this.invuln = Math.max(this.invuln, 0.4); }
        break;
      case 'swap':
        if (!a.mid && a.t >= a.dur * 0.5) { a.mid = true; this.equipped = a.target; sim.emit({ type: 'swapMid', weapon: a.target }); }
        if (a.t >= a.dur) { sim.emit({ type: 'swapDone', weapon: this.equipped }); this.setAction('ready'); }
        break;
      case 'dodge': {
        const D = DODGE[a.kind === 'roll' ? 'roll' : 'side'];
        if (a.t >= D.iframes[0] && a.t <= D.iframes[1]) this.invuln = Math.max(this.invuln, 0.02); // (untouchable through its middle)
        if (a.t >= a.dur) { this.setAction('ready'); this.dodgeCd = DODGE.cooldown; }
        else if (a.t >= D.cancel && this.attackHeld) { this.setAction('ready'); this.dodgeCd = DODGE.cooldown; } // (an attack cuts its end short)
        break;
      }
      case 'vault':
        if (a.t >= a.dur) this.setAction('ready');
        break;
    }

    // Priority: a pending swap is taken as soon as the current recovery allows it, before any further attack.
    if (this.desired !== this.equipped && this.action.type !== 'swap' && this.canBeginSwap()) {
      this.setAction('swap', { dur: T.swapTime, target: this.desired, mid: false });
      sim.emit({ type: 'swapStart', weapon: this.desired });
      return;
    }
    if (this.action.type !== 'ready') return;
    if (this.equipped in this.mags && this.ammo <= 0) {
      if ((this.reserve[this.equipped] ?? Infinity) > 0) { this.setAction('reload'); sim.emit({ type: 'reloadStart', weapon: this.equipped }); return; }
      if (this.attackHeld && this.attackPressT < 0.05) sim.emit({ type: 'dryFire', weapon: this.equipped }); // empty: a click, no reload
      return;
    }
    // the FINISH button (the dodge button, gold while an open zombie is in reach: core/sim.js step) takes it
    if (sim.time < (this.wantFinishUntil || 0)) { const ez = sim.execTarget?.(this, true); if (ez) { this.wantFinishUntil = 0; this.startExecution(ez, sim); return; } }
    if (!this.attackHeld) return;
    // an execution (2026-10-18, the user: the perfect dodge's execute made epic): a fresh press with a zombie open to it in
    // front and in reach takes it over the plain attack (sim.execTarget). Else, now and then (the user, 2026-10-18 night:
    // "5% of the time ... almost like a critical hit"), the attack a fresh press starts on a walker becomes a finisher
    // with a wide arc that takes its neighbours too (sim.critFinisher, critSweep)
    if (this.attackPressT < 0.25) {
      const ez = sim.execTarget?.(this); if (ez) { this.startExecution(ez, sim); return; }
      const cz = sim.critFinisher?.(this); if (cz) { cz.critFin = true; this.startExecution(cz, sim); return; }
    }
    if (Math.abs(angleDiff(this.aimYaw, this.aimTarget)) > FIRE_ALIGN) return;
    if (this.equipped === PISTOL || this.equipped === SHOTGUN) {
      this.setAction('shot');
      this.ammo--; this.shotCount++;
      this.recoil = 1;
      if (this.equipped === SHOTGUN) sim.fireShotgun(this); else sim.firePistol(this);
    } else this.startSwing(sim, 0);
  }

  // The execution: she locks on, lunges in to her strike's own distance (a fraction of a second, real time: the world is
  // slowed, render/execution.js), then plays her weapon's strongest move (its last combo strike, the kick, a point-blank
  // shot). The zombie stands frozen and dies to it whatever lands (zombies.js executed; sim.forceExec if the swing misses).
  startExecution(z, sim) {
    const dx = z.x - this.x, dz = z.z - this.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    const gun = this.equipped === PISTOL || this.equipped === SHOTGUN, fin = this.attacks[this.attacks.length - 1];
    // (a chapter's pistol finisher that bursts the head, src/hood/level.js rules: shot from where he stands, no step in)
    const burst = this.equipped === PISTOL && !!sim.rules?.pistolHeadBurst;
    const stand = burst ? d : gun ? 1.0 : Math.max(0.75, fin?.stand ?? 0.95);
    z.executed = true; z.execWeapon = this.equipped; z.executable = 0; z.execLock = true; z.headBurst = burst;
    if (z.down) z.stateDur = 9; else z.set(ZS_STAGGER, 9); z.vx = z.vz = 0; z.kx = z.kz = 0; z.hitFlash = 1; // (one on the floor stays there: the lady after her crash)
    this.aimYaw = this.aimTarget = Math.atan2(dx, dz); this.vx = this.vz = 0;
    this.invuln = Math.max(this.invuln, 3); this.execId = z.id;
    sim.emit({ type: 'execStart', id: z.id, weapon: this.equipped, x: z.x, z: z.z });
    if (!gun && this.equipped !== FISTS && this.equipped !== 'chainsaw' && EXEC_LAUNCH.length) { this.startLaunch(z, d, fin, sim); return; } // (the melee weapons leap in: startLaunch)
    if (this.equipped === SHOTGUN && EXEC_SLIDE.length && d > 1.5) { this.startSlide(z, d, sim); return; } // (the shotgun slides in: startSlide)
    const go = Math.max(0, d - stand);
    this.setAction('execDash', { dur: Math.max(0.05, Math.min(0.16, go / 16)), x0: this.x, z0: this.z, x1: this.x + ux * go, z1: this.z + uz * go, id: z.id });
  }
  // A melee finisher as a jump (core/weapons.js EXEC_LAUNCH): B or C at random, the shortest jump that covers the gap,
  // its travel (the clip's own, in the air) scaled to stop her a strike short of the zombie; the weapon's own finisher
  // profile (what it does to the body, its sound). No dash first: she coils and leaps from where she is.
  startLaunch(z, d, fin, sim) {
    const v = sim.rand() < 0.5 ? 'B_uppercut' : 'C_uppercut_mirrored';
    const list = EXEC_LAUNCH.filter((e) => e.variant === v).sort((a, b) => a.dist - b.dist);
    const gap = Math.max(0, d - list[0].A.stand), far = (e) => (e.A.ROOT ? e.A.ROOT[e.A.ROOT.length - 1].z : 0);
    const E = list.find((e) => far(e) >= gap) || list[list.length - 1], L = E.A, total = far(E);
    const A = { ...L, kind: fin?.kind ?? L.kind, sound: fin?.sound ?? L.sound, sever: fin?.sever ?? L.sever, dmg: Math.max(L.dmg, fin?.dmg ?? 0), knock: fin?.knock ?? L.knock };
    const rootScale = total > 0.01 ? Math.min(1, gap / total) : 0;
    this.swingId++;
    this.setAction('swing', { st: 0, combo: this.attacks.length - 1, ground: false, leg: false, hitSet: new Set(), hits: 0, clanked: false, activeEnd: A.activeEnd, id: this.swingId,
      lunge: total * rootScale, unlocked: true, target: z, heading: this.aimYaw, turnFrom: this.aimYaw, turnBy: 0, advanced: 0, rootScale, back: 0, execA: A, execId: z.id });
    this.execHitIn = A.activeStart / (this.T.axeSpeed || 1); // (when her strike lands: render/execution.js paces her to it)
    this.attackPressT = 9;
    sim.emit({ type: 'swing', combo: this.attacks.length - 1 });
  }
  // The shotgun's slide finisher (render/slidefin.js EXEC_SLIDE): the shortest slide whose travel covers the gap to her stand
  // (1 m short of the zombie), its travel scaled down for a shorter gap; she slides along the line to it, bending a little to
  // her left as the clip does, and fires at the clip's shot frame (updateAction 'swing')
  startSlide(z, d, sim) {
    const list = EXEC_SLIDE.slice().sort((a, b) => far(a) - far(b)), gap = Math.max(0, d - 1.0);
    function far(e) { return e.A.ROOT ? e.A.ROOT[e.A.ROOT.length - 1].z : 0; }
    const E = list.find((e) => far(e) >= gap) || list[list.length - 1], A = E.A, total = far(E), rootScale = total > 0.01 ? Math.min(1, gap / total) : 0;
    this.swingId++;
    this.setAction('swing', { st: 0, combo: this.attacks.length - 1, ground: false, leg: false, hitSet: new Set(), hits: 0, clanked: false, activeEnd: A.activeEnd, id: this.swingId,
      lunge: total * rootScale, unlocked: true, target: z, heading: this.aimYaw, turnFrom: this.aimYaw, turnBy: 0, advanced: 0, sided: 0, rootScale, back: 0, execA: A, execId: z.id });
    this.execHitIn = A.gunShot; this.attackPressT = 9; // (render/execution.js paces her to the shot)
    sim.emit({ type: 'execSlide', id: z.id, variant: E.variant });
  }
  reloadTime() { return this.equipped === SHOTGUN ? this.T.shotgunReload : this.T.reloadTime; }

  startSwing(sim, combo, unlocked = false, special = null) {
    this.swingId++;
    // now and then the opener goes in low instead, at a standing walker in reach (no button: the user, 2026-10-17): the
    // weapon's leg strike (core/weapons.js LEG_ATTACKS), which takes a leg and leaves it crawling
    let leg = special === 'legs';
    if (!leg && combo === 0 && legAttack(this.equipped)) {
      const t = sim.meleeAssist?.(this, 1.7)?.target;
      if (t && t.kind === 'normal' && !t.crawling && !t.down && sim.rand() < (this.T.legStrikeChance ?? 0.25)) leg = true;
    }
    // a zombie on the floor in front (and nothing standing nearer): the downward strike instead of the combo's opener
    const G = combo === 0 && !leg ? groundAttack(this.equipped) : null, ground = !!(G && sim.groundTarget?.(this));
    const A = leg ? legAttack(this.equipped) : ground ? G : this.attacks[combo];
    // turn toward a zombie in reach (combo follow-ups look further, and the chop finds bodies on the floor)
    const as = sim.meleeAssist?.(this, A.assist ?? (combo > 0 ? 2.1 : 1.45), A.style === 'chop');
    const tgt = as?.target || null, turnBy = as?.turn || 0;
    let lunge = tgt ? clamp(Math.hypot(tgt.x - this.x, tgt.z - this.z) - (A.stand ?? 1.05), 0, A.lungeMax ?? (combo > 0 ? 0.75 : 0.5)) : 0;
    let rootScale = 1;
    if (A.ROOT) { // the clip's own advance, scaled down so she stops short of the target (no target: the full step)
      const total = A.ROOT[A.ROOT.length - 1].z;
      rootScale = tgt && total > 0.01 ? clamp((Math.hypot(tgt.x - this.x, tgt.z - this.z) - (A.stand ?? 0.85)) / total, 0, 1) : 1;
      lunge = Math.max(0, total * rootScale);
    }
    // (2026-10-18, the user: "the visible strike and the actual hit should agree"): a body on the floor nearer than where this
    // strike's weapon comes down (strikeReach): she steps back into range as she raises it, so the blow lands on it
    let back = 0;
    if (ground) { const gt = sim.groundTarget?.(this); if (gt) { const gd = Math.hypot(gt.x - this.x, gt.z - this.z), reach = strikeReach(A); if (gd < reach - 0.15) back = Math.min(0.85, reach - 0.1 - gd); } }
    this.setAction('swing', { st: 0, combo, ground, leg, hitSet: new Set(), hits: 0, clanked: false, activeEnd: A.activeEnd, id: this.swingId, lunge, unlocked,
      target: tgt, heading: this.aimYaw + turnBy, turnFrom: this.aimYaw, turnBy, advanced: 0, rootScale, back });
    this.attackPressT = 9;
    sim.emit({ type: 'swing', combo });
  }

  canBeginSwap() {
    const a = this.action;
    switch (a.type) {
      case 'ready': case 'reload': return true; // a reload is abandoned (ammo unchanged) by a swap
      case 'shot': return a.t >= (this.equipped === SHOTGUN ? 0.3 : Math.min(0.1, this.T.pistolInterval * 0.5));
      case 'swing': return a.st >= this.atk(a).swapPoint;
      default: return false;
    }
  }

  muzzleWorld(out) {
    const m = muzzleLocal(this.equipped, _mz);
    const s = Math.sin(this.aimYaw), c = Math.cos(this.aimYaw);
    // local +X is the character's left; world = rotate about Y by yaw
    out.x = this.x + m.x * c + m.z * s;
    out.z = this.z - m.x * s + m.z * c;
    out.y = m.y;
    return out;
  }

  // knocked off her feet from (fromX, fromZ): faces the blow and is thrown back, untouchable until she is up again
  knockDown(fromX, fromZ, sim) {
    if (this.dead || this.action.type === 'down') return;
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.aimYaw = this.aimTarget = Math.atan2(-dx, -dz); // facing the hit: she falls back, away from it
    this.slide = { x: (dx / d) * 3.4, z: (dz / d) * 3.4 };
    this.attackHeld = false;
    const kip = this.T.kipUp !== false;
    this.setAction('down', kip ? { fall: KIP.fall, up: KIP.up, turned: true, kip: true } : { fall: DOWN_FALL, up: DOWN_UP, turned: false });
    this.invuln = kip ? KIP.fall + KIP.up : DOWN_FALL + DOWN_UP;
    sim.emit({ type: 'playerDown', dirX: dx / d, dirZ: dz / d });
  }

  hurt(dmg, fromX, fromZ, sim) {
    if (this.dead || this.invuln > 0) return false;
    if (!this.T.testInfiniteHealth) this.hp = Math.max(0, this.hp - dmg); // (test mode: every reaction, no health lost)
    this.invuln = 0.8; this.hurtT = 0; // (0.8 s of grace: two at once count once, FINISHERS_PLAN.md 5)
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.vx += (dx / d) * 2.2; this.vz += (dz / d) * 2.2;
    this.hurtDirX = dx / d; this.hurtDirZ = dz / d;
    sim.emit({ type: 'playerHurt', hp: this.hp, dirX: dx / d, dirZ: dz / d });
    if (this.hp <= 0) {
      this.dead = true; this.cancelAttacks(); this.setAction('dead');
      this.deathDir = Math.atan2(dx, dz);
      sim.emit({ type: 'playerDeath' });
    }
    return true;
  }
}

// Shared helpers used by the sim for axe hit testing: the axe segment of attack A in world space.
export function meleeWorldSegment(p, A, t, out) {
  const s = meleeSegment(A, t, _seg);
  const sy = Math.sin(p.aimYaw), cy = Math.cos(p.aimYaw);
  const tw = (lx, lz, o, kx, kz) => { o[kx] = p.x + lx * cy + lz * sy; o[kz] = p.z - lx * sy + lz * cy; };
  tw(s.hx, s.hz, out, 'hx', 'hz');
  tw(s.tx, s.tz, out, 'tx', 'tz');
  out.hy = s.hy; out.ty = s.ty;
  return out;
}
export { segPointDist2, rayCircle, clamp, _seg2 };
