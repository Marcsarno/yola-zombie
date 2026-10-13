// Player: one authoritative movement controller + one weapon action state machine.
// Yaw convention: forward = (sin yaw, cos yaw) on (x, z).
import { clamp, angleDiff, approachAngle, segPointDist2, rayCircle } from './world.js';
import { PISTOL, BAT, BAT_SWING, batSegment, muzzleLocal } from './weapons.js';

const AIM_DEADZONE = 0.18;
const FIRE_ALIGN = 0.38; // rad: the shot waits until the upper body faces within this of the stick
const _seg = {}, _seg2 = {}, _mz = {};

export class Player {
  constructor(x, z, tuning) {
    this.T = tuning;
    this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.r = 0.3;
    this.aimYaw = Math.PI; // face up the screen at spawn
    this.aimTarget = this.aimYaw;
    this.aiming = false; this.attackHeld = false;
    this.hp = 100; this.maxHp = 100; this.dead = false; this.invuln = 0; this.hurtT = 9;
    this.equipped = PISTOL; this.desired = PISTOL;
    this.ammo = tuning.magSize;
    this.action = { type: 'ready', t: 0 };
    this.recoil = 0; // 0..1 visual recoil envelope
    this.shotCount = 0; this.swingId = 0;
    this.moveIntent = 0; // stick magnitude (for animation)
  }

  // A swap press toggles the weapon we want. Several presses never queue several swaps.
  requestSwap() {
    if (this.dead) return;
    this.desired = this.desired === PISTOL ? BAT : PISTOL;
  }

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
    if (this.dead) { mx = mz = mag = 0; }
    // aim
    const am = Math.hypot(input.aimX, input.aimZ);
    this.aiming = !this.dead && am > AIM_DEADZONE;
    this.attackHeld = !this.dead && am >= T.attackThreshold;
    if (this.aiming) this.aimTarget = Math.atan2(input.aimX, input.aimZ);
    else if (mag > 0.15) this.aimTarget = Math.atan2(mx, mz);
    let turn = T.turnRate;
    if (this.action.type === 'swing') {
      // commit to the swing: facing is locked through windup and contact, then frees up in recovery
      turn = this.action.st < this.action.activeEnd ? 0 : turn * 0.6;
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
    if (this.action.type === 'swing') speed *= 0.55;
    const dl = mag > 1e-4 ? speed / mag : 0;
    const dvx = mx * dl - this.vx, dvz = mz * dl - this.vz;
    const dvl = Math.hypot(dvx, dvz);
    const speeding = mx * this.vx + mz * this.vz > 0 && speed * speed >= this.vx * this.vx + this.vz * this.vz;
    const maxDv = (speeding ? T.accel : T.decel) * dt;
    if (dvl > maxDv) { this.vx += (dvx / dvl) * maxDv; this.vz += (dvz / dvl) * maxDv; }
    else { this.vx += dvx; this.vz += dvz; }

    const px = this.x, pz = this.z;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // soft-collide with live zombies, then hard-collide with the world
    for (const e of sim.zombies) {
      if (!e.solid) continue;
      const dx = this.x - e.x, dz = this.z - e.z, rr = this.r + e.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), push = (rr - d) * 0.85; this.x += (dx / d) * push; this.z += (dz / d) * push; }
    }
    world.resolveCircle(this, this.r);
    // actual velocity after collisions (drives animation, stops running into walls)
    this.vx = (this.x - px) / dt; this.vz = (this.z - pz) / dt;

    if (this.invuln > 0) this.invuln -= dt;
    this.hurtT += dt;
    this.recoil = Math.max(0, this.recoil - dt * 7);
  }

  // ---------------- actions ----------------
  updateAction(dt, sim) {
    const T = this.T, a = this.action;
    if (this.dead) return;
    a.t += dt;
    switch (a.type) {
      case 'shot':
        if (a.t >= T.pistolInterval) this.setAction('ready');
        break;
      case 'swing': {
        const scale = T.batSpeed;
        const prevT = a.st, st = (a.st = a.t * scale);
        if (st > BAT_SWING.activeStart && prevT < a.activeEnd) sim.resolveBat(this, Math.max(prevT, BAT_SWING.activeStart), Math.min(st, a.activeEnd), a);
        if (prevT < a.activeEnd && st >= a.activeEnd && !a.hits && !a.clanked) sim.emit({ type: 'batMiss' });
        if (st >= BAT_SWING.duration) this.setAction('ready');
        break;
      }
      case 'reload':
        if (this.equipped !== PISTOL) { this.setAction('ready'); break; }
        if (a.t >= T.reloadTime) { this.ammo = T.magSize; sim.emit({ type: 'reloadDone' }); this.setAction('ready'); }
        break;
      case 'swap':
        if (!a.mid && a.t >= a.dur * 0.5) { a.mid = true; this.equipped = a.target; sim.emit({ type: 'swapMid', weapon: a.target }); }
        if (a.t >= a.dur) { sim.emit({ type: 'swapDone', weapon: this.equipped }); this.setAction('ready'); }
        break;
    }

    // Priority: a pending swap is taken as soon as the current recovery allows it, before any further attack.
    if (this.desired !== this.equipped && this.action.type !== 'swap' && this.canBeginSwap()) {
      this.setAction('swap', { dur: T.swapTime, target: this.desired, mid: false });
      sim.emit({ type: 'swapStart', weapon: this.desired });
      return;
    }
    if (this.action.type !== 'ready') return;
    if (this.equipped === PISTOL && this.ammo <= 0) {
      this.setAction('reload'); sim.emit({ type: 'reloadStart' });
      return;
    }
    if (!this.attackHeld) return;
    if (Math.abs(angleDiff(this.aimYaw, this.aimTarget)) > FIRE_ALIGN) return;
    if (this.equipped === PISTOL) {
      this.setAction('shot');
      this.ammo--; this.shotCount++;
      this.recoil = 1;
      sim.firePistol(this);
    } else {
      this.swingId++;
      sim.meleeAssist?.(this);
      this.setAction('swing', { st: 0, hitSet: new Set(), hits: 0, clanked: false, activeEnd: BAT_SWING.activeEnd, id: this.swingId });
      sim.emit({ type: 'swing' });
    }
  }

  canBeginSwap() {
    const a = this.action;
    switch (a.type) {
      case 'ready': case 'reload': return true; // a reload is abandoned (ammo unchanged) by a swap
      case 'shot': return a.t >= Math.min(0.1, this.T.pistolInterval * 0.5);
      case 'swing': return a.st >= BAT_SWING.swapPointRecover;
      default: return false;
    }
  }

  muzzleWorld(out) {
    const m = muzzleLocal(_mz);
    const s = Math.sin(this.aimYaw), c = Math.cos(this.aimYaw);
    // local +X is the character's left; world = rotate about Y by yaw
    out.x = this.x + m.x * c + m.z * s;
    out.z = this.z - m.x * s + m.z * c;
    out.y = m.y;
    return out;
  }

  hurt(dmg, fromX, fromZ, sim) {
    if (this.dead || this.invuln > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.55; this.hurtT = 0;
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.vx += (dx / d) * 2.2; this.vz += (dz / d) * 2.2;
    sim.emit({ type: 'playerHurt', hp: this.hp, dirX: dx / d, dirZ: dz / d });
    if (this.hp <= 0) {
      this.dead = true; this.cancelAttacks(); this.setAction('dead');
      this.deathDir = Math.atan2(dx, dz);
      sim.emit({ type: 'playerDeath' });
    }
    return true;
  }
}

// Shared helpers used by the sim for bat hit testing.
export function batWorldSegment(p, t, out) {
  const s = batSegment(t, _seg);
  const sy = Math.sin(p.aimYaw), cy = Math.cos(p.aimYaw);
  const tw = (lx, lz, o, kx, kz) => { o[kx] = p.x + lx * cy + lz * sy; o[kz] = p.z - lx * sy + lz * cy; };
  tw(s.hx, s.hz, out, 'hx', 'hz');
  tw(s.tx, s.tz, out, 'tx', 'tz');
  out.hy = s.hy; out.ty = s.ty;
  return out;
}
export { segPointDist2, rayCircle, clamp, _seg2 };
