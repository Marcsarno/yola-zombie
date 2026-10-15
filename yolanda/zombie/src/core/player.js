// Player: one authoritative movement controller + one weapon action state machine.
// Yaw convention: forward = (sin yaw, cos yaw) on (x, z).
import { clamp, angleDiff, approachAngle, segPointDist2, rayCircle } from './world.js';
import { PISTOL, SHOTGUN, AXE, FISTS, WEAPON_ORDER, attacksOf, meleeSegment, muzzleLocal } from './weapons.js';

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
    this.owned = [...WEAPON_ORDER]; // weapons she carries (the swap button cycles through these)
    this.equipped = PISTOL; this.desired = PISTOL;
    this.mags = { [PISTOL]: tuning.magSize, [SHOTGUN]: tuning.shotgunMag };
    this.reserve = { [PISTOL]: Infinity, [SHOTGUN]: Infinity }; // spare rounds (the story level counts them; practice never runs out)
    this.action = { type: 'ready', t: 0 };
    this.recoil = 0; // 0..1 visual recoil envelope
    this.shotCount = 0; this.swingId = 0;
    this.moveIntent = 0; // stick magnitude (for animation)
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
    const held = !this.dead && am >= T.attackThreshold;
    if (held && !this.attackHeld) this.attackPressT = 0; // fresh press
    this.attackPressT = (this.attackPressT ?? 9) + dt;
    this.attackHeld = held;
    if (this.aiming) this.aimTarget = Math.atan2(input.aimX, input.aimZ);
    else if (mag > 0.15) this.aimTarget = Math.atan2(mx, mz);
    let turn = T.turnRate;
    if (this.action.type === 'swing') {
      // commit to the swing: facing is locked through windup and contact, then frees up in recovery
      turn = this.action.st < this.action.activeEnd ? 0 : turn * 0.6;
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
    if (this.action.type === 'swing') speed *= 0.55;
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
    // lunge: a combo attack steps in toward its target during the windup
    const act = this.action;
    if (act.type === 'swing' && act.lunge > 0 && act.st < this.attacks[act.combo].activeStart) {
      const v = (act.lunge / this.attacks[act.combo].activeStart) * T.axeSpeed * dt;
      this.x += Math.sin(this.aimYaw) * v; this.z += Math.cos(this.aimYaw) * v;
    }
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
        if (a.t >= (this.equipped === SHOTGUN ? T.shotgunInterval : T.pistolInterval)) this.setAction('ready');
        break;
      case 'swing': {
        const A = this.attacks[a.combo];
        const prevT = a.st, st = (a.st = a.t * T.axeSpeed);
        if (st > A.activeStart && prevT < a.activeEnd) sim.resolveMelee(this, Math.max(prevT, A.activeStart), Math.min(st, a.activeEnd), a);
        if (prevT < a.activeEnd && st >= a.activeEnd && !a.hits && !a.clanked) sim.emit({ type: 'batMiss' });
        // combo: once the opening attack connects, the rest of the combo follows while the attack is
        // held (or pressed again during the attack)
        if (a.hits > 0) a.unlocked = true;
        if (a.combo < this.attacks.length - 1 && a.unlocked && st >= A.chainFrom && (this.attackHeld || this.attackPressT < a.t)) {
          this.startSwing(sim, a.combo + 1, true);
          break;
        }
        if (st >= A.duration) this.setAction('ready');
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
    if (this.equipped in this.mags && this.ammo <= 0) {
      if ((this.reserve[this.equipped] ?? Infinity) > 0) { this.setAction('reload'); sim.emit({ type: 'reloadStart', weapon: this.equipped }); return; }
      if (this.attackHeld && this.attackPressT < 0.05) sim.emit({ type: 'dryFire', weapon: this.equipped }); // empty: a click, no reload
      return;
    }
    if (!this.attackHeld) return;
    if (Math.abs(angleDiff(this.aimYaw, this.aimTarget)) > FIRE_ALIGN) return;
    if (this.equipped === PISTOL || this.equipped === SHOTGUN) {
      this.setAction('shot');
      this.ammo--; this.shotCount++;
      this.recoil = 1;
      if (this.equipped === SHOTGUN) sim.fireShotgun(this); else sim.firePistol(this);
    } else this.startSwing(sim, 0);
  }

  reloadTime() { return this.equipped === SHOTGUN ? this.T.shotgunReload : this.T.reloadTime; }

  startSwing(sim, combo, unlocked = false) {
    this.swingId++;
    const A = this.attacks[combo];
    // turn toward a zombie in reach (combo follow-ups look further, and the chop finds bodies on the floor)
    const tgt = sim.meleeAssist?.(this, A.assist ?? (combo > 0 ? 2.1 : 1.45), A.style === 'chop');
    const lunge = tgt ? clamp(Math.hypot(tgt.x - this.x, tgt.z - this.z) - (A.stand ?? 1.05), 0, combo > 0 ? 0.75 : 0.35) : 0;
    this.setAction('swing', { st: 0, combo, hitSet: new Set(), hits: 0, clanked: false, activeEnd: A.activeEnd, id: this.swingId, lunge, unlocked });
    this.attackPressT = 9;
    sim.emit({ type: 'swing', combo });
  }

  canBeginSwap() {
    const a = this.action;
    switch (a.type) {
      case 'ready': case 'reload': return true; // a reload is abandoned (ammo unchanged) by a swap
      case 'shot': return a.t >= (this.equipped === SHOTGUN ? 0.3 : Math.min(0.1, this.T.pistolInterval * 0.5));
      case 'swing': return a.st >= this.attacks[a.combo].swapPoint;
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

  hurt(dmg, fromX, fromZ, sim) {
    if (this.dead || this.invuln > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.55; this.hurtT = 0;
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
