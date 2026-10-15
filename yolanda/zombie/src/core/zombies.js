// Zombie behaviour: emerge -> chase (flow field + separation) -> telegraphed attack -> recover.
// Hits put them in stagger with collision-aware knockback that navigation does not override.
import { approachAngle, angleDiff } from './world.js';
import { isMelee } from './weapons.js';

let nextId = 1;
const _flow = { x: 0, z: 0 };

export const ZS = { EMERGE: 'emerge', CHASE: 'chase', WINDUP: 'windup', STRIKE: 'strike', RECOVER: 'recover', STAGGER: 'stagger', KNOCKDOWN: 'knockdown', GETUP: 'getup', DYING: 'dying', DEAD: 'dead' };
// Knocked flat by the bat: fall (thrown back, rolls onto the stomach), then get up. The get-up clip
// starts turned ~155 degrees from where the fall ends, so the facing turns with it.
export const KNOCKDOWN_FALL = 1.3, KNOCKDOWN_GETUP = 2.0, GETUP_YAW = -2.705;

export class Zombie {
  constructor(x, z, yaw, opts) {
    this.id = nextId++;
    this.x = x; this.z = z; this.yaw = yaw; this.r = 0.32;
    this.vx = 0; this.vz = 0; // locomotion velocity
    this.kx = 0; this.kz = 0; // knockback velocity (decays, never overwritten by navigation)
    this.hp = opts.hp; this.maxHp = opts.hp;
    this.speedMul = opts.speedMul ?? 1;
    this.passive = !!opts.passive; // practice dummies never attack
    this.dormant = null; // { wake, speedMul }: stands still until sim time passes wake (or it is hit), then becomes a normal zombie
    this.state = ZS.EMERGE; this.t = 0; this.stateDur = 0.75;
    this.attackCd = 0.4;
    this.solid = true;
    this.hitFlash = 0; this.hitDirX = 0; this.hitDirZ = 0; this.hitStrength = 0; this.hitSeq = 0; this.hitKind = '';
    this.deathYaw = 0; this.deathSpeed = 0;
    this.corpseT = 0;
    this.phase = opts.phase ?? 0;
    this.struck = false;
    // dismemberment: limb health; a limb at 0 comes off at the elbow / knee / neck
    this.limbHp = { Head: 45, Forearm_L: 30, Forearm_R: 30, LowerLeg_L: 40, LowerLeg_R: 40 };
    this.severed = new Set(); this.crawling = false; this.lastHitPart = 'torso'; this.toCrawl = false;
    this.hitStyle = ''; this.bumpT = 0;
  }
  get armsLost() { return (this.severed.has('Forearm_L') ? 1 : 0) + (this.severed.has('Forearm_R') ? 1 : 0); }

  sever(part, dirX, dirZ, sim) {
    if (this.severed.has(part)) return;
    this.severed.add(part);
    sim.emit({ type: 'sever', id: this.id, part, dirX, dirZ, x: this.x, z: this.z });
    if (part === 'Head') this.hp = 0;
    else if (part.startsWith('LowerLeg') && !this.crawling) this.crawling = this.toCrawl = true; // falls, then crawls
  }

  set(state, dur = 0) { this.state = state; this.t = 0; this.stateDur = dur; }
  get alive() { return this.state !== ZS.DYING && this.state !== ZS.DEAD; }
  get down() { return this.state === ZS.KNOCKDOWN || this.state === ZS.GETUP; }

  // Incoming hit: direction (unit) and strength in m/s; part: 'torso', a severable limb, or (shotgun)
  // a list of [part, damage] for every pellet. style: the axe attack (swing / heavy / chop).
  takeHit(dmg, dirX, dirZ, impulse, kind, sim, part = 'torso', style = '') {
    if (!this.alive) return;
    const wasDown = this.down, melee = isMelee(kind);
    const parts = Array.isArray(part) ? part : [[part, dmg]];
    const limbMul = kind === 'shotgun' ? 1.35 : melee ? 1.2 : 1;
    let loss = 0, main = 'torso', mainD = 0;
    for (let [pt, d] of parts) {
      if (pt !== 'torso' && this.severed.has(pt)) pt = 'torso';
      if (pt !== 'torso') {
        this.limbHp[pt] -= d * limbMul;
        if (this.limbHp[pt] <= 0) this.sever(pt, dirX, dirZ, sim);
      }
      loss += pt.startsWith('Forearm') ? d * 0.6 : d; // arm hits are less deadly
      if (d > mainD) { mainD = d; main = pt; }
    }
    this.lastHitPart = main;
    this.hp -= loss;
    const push = wasDown ? 0.3 : 1; // a body on the floor barely slides
    this.kx += dirX * impulse * push; this.kz += dirZ * impulse * push;
    this.hitDirX = dirX; this.hitDirZ = dirZ; this.hitStrength = impulse; this.hitSeq++; this.hitKind = kind; this.hitStyle = style;
    this.hitFlash = 1;
    if (this.hp <= 0) {
      this.downDeath = this.state === ZS.KNOCKDOWN; // already lying: no death fall
      this.set(ZS.DYING, 0.75);
      this.solid = false;
      this.deathYaw = Math.atan2(dirX, dirZ); // fall along the hit
      this.deathSpeed = impulse;
      sim.emit({ type: 'zombieDeath', id: this.id, kind, x: this.x, z: this.z });
      return;
    }
    if (wasDown) { sim.emit({ type: 'zombieHit', id: this.id, kind }); return; }
    // knocked flat: the axe (the chop most of all), or a close shotgun blast that lifts them off their feet
    const T = sim.T;
    const fist = kind === 'fist';
    const kd = fist ? (style === 'kick' ? 0.55 : 0) : melee ? (style === 'combo' ? 0 : style === 'chop' ? Math.max(0.75, T.axeKnockdown) : style === 'heavy' ? Math.min(1, T.axeKnockdown + 0.25) : T.axeKnockdown)
      : kind === 'shotgun' ? Math.min(1, Math.max(0, (impulse - 3.5) / 3)) : 0;
    if (this.toCrawl || (!this.crawling && kd > 0 && sim.rand() < kd)) { this.knockDown(dirX, dirZ, sim); return; }
    // Any hit interrupts a windup (rewarding a timely shot); heavier hits stagger longer.
    const dur = fist ? (style === 'kick' ? 0.8 : 0.5) : melee ? 0.95 : kind === 'shotgun' ? Math.min(0.85, 0.3 + impulse * 0.1) : 0.26;
    if (this.state !== ZS.STAGGER || dur > this.stateDur - this.t) this.set(ZS.STAGGER, dur);
    this.attackCd = Math.max(this.attackCd, melee || kind === 'shotgun' ? 0.9 : fist ? 0.7 : 0.35);
    sim.emit({ type: 'zombieHit', id: this.id, kind });
  }

  knockDown(dirX, dirZ, sim) {
    this.set(ZS.KNOCKDOWN, KNOCKDOWN_FALL);
    this.solid = false;
    this.yaw = Math.atan2(-dirX, -dirZ); // face the blow, thrown onto the back
    sim.emit({ type: 'zombieKnockdown', id: this.id });
  }

  // Shoved by another zombie that was knocked into it (speed: m/s handed over along ux, uz).
  bumped(speed, ux, uz, sim) {
    this.kx += ux * speed; this.kz += uz * speed; this.bumpT = 0.4;
    if (!this.alive || this.down) return;
    this.hitDirX = ux; this.hitDirZ = uz; this.hitStrength = speed; this.hitSeq++; this.hitKind = 'bump'; this.hitStyle = '';
    if (!this.crawling && speed > 2.6 && sim.rand() < (speed - 2.6) / 2) { this.knockDown(ux, uz, sim); return; }
    const dur = Math.min(0.8, 0.25 + speed * 0.15);
    if (this.state !== ZS.STAGGER || dur > this.stateDur - this.t) this.set(ZS.STAGGER, dur);
    this.attackCd = Math.max(this.attackCd, 0.5);
    sim.emit({ type: 'zombieBump', id: this.id, speed });
  }

  update(dt, sim) {
    const T = sim.T, p = sim.player, world = sim.world;
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    if (this.bumpT > 0) this.bumpT -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    if (this.dormant) { // stands where placed until its time, a hit, or (a sensed level zombie) Yola close by and in sight
      const D = this.dormant;
      let wake = sim.time >= D.wake || this.hitSeq > 0;
      if (!wake && D.sense && !D.locked && !p.dead) wake = dist < D.sense * 0.5 || (dist < D.sense && world.lineOfSight(this.x, this.z, p.x, p.z, 1.0));
      if (wake) { // a normal zombie now, its first attack a beat away
        this.speedMul = D.speedMul; this.passive = false; this.dormant = null; this.attackCd = Math.max(this.attackCd, 1.1);
        sim.level?.onWake(this); sim.emit({ type: 'zombieWake', id: this.id });
      }
    }
    let wantX = 0, wantZ = 0, speed = 0, turnRate = 5;

    switch (this.state) {
      case ZS.EMERGE:
        // walk in through the doorway (same motion the renderer shows)
        if (this.emergeTo) {
          const ex = this.emergeTo.x - this.x, ez = this.emergeTo.z - this.z, el = Math.hypot(ex, ez);
          const sp = Math.min(el / Math.max(0.05, this.stateDur - this.t), 1.6);
          if (el > 0.02) { this.vx = (ex / el) * sp; this.vz = (ez / el) * sp; } else { this.vx = this.vz = 0; }
        }
        if (this.t >= this.stateDur) this.set(ZS.CHASE);
        break;
      case ZS.CHASE: {
        if (p.dead) { speed = 0; break; }
        const los = dist < 7 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5);
        if (los) { wantX = dx / (dist || 1); wantZ = dz / (dist || 1); }
        else { const rem = world.flowDir(this.x, this.z, _flow); wantX = _flow.x; wantZ = _flow.z; if (rem > 1e7) { wantX = wantZ = 0; } } // no way through (a shut door): it stands and waits
        speed = (wantX || wantZ) ? T.zombieSpeed * this.speedMul * (this.crawling ? 0.32 : 1) : 0;
        if (dist < 1.25) speed *= 0.5; // close in carefully, no jitter at contact
        if (!this.passive && dist < 1.0 && this.attackCd <= 0 && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.7 &&
            world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) {
          this.set(ZS.WINDUP, 0.52);
          sim.emit({ type: 'zombieWindup', id: this.id });
        }
        break;
      }
      case ZS.WINDUP:
        turnRate = 2.5; wantX = dx; wantZ = dz; // keep tracking slowly: stepping aside works
        if (this.t >= this.stateDur) { this.set(ZS.STRIKE, 0.14); this.struck = false; }
        break;
      case ZS.STRIKE:
        turnRate = 0;
        if (!this.struck) {
          this.struck = true;
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          const along = dx * fx + dz * fz;
          const ang = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
          const hit = !p.dead && dist < 1.12 && along > 0 && ang < 0.95 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5);
          // losing arms leaves a weaker claw (both gone: a bite); crawlers hit low and weaker
          if (hit) p.hurt(T.zombieDamage * (1 - 0.3 * this.armsLost) * (this.crawling ? 0.7 : 1), this.x, this.z, sim);
          sim.emit({ type: hit ? 'zombieStrikeHit' : 'zombieStrikeMiss', id: this.id });
        }
        this.vx = Math.sin(this.yaw) * 0.9; this.vz = Math.cos(this.yaw) * 0.9; // lunge
        if (this.t >= this.stateDur) this.set(ZS.RECOVER, 0.55);
        break;
      case ZS.RECOVER:
        turnRate = 2;
        if (this.t >= this.stateDur) { this.set(ZS.CHASE); this.attackCd = 0.35; }
        break;
      case ZS.STAGGER:
        turnRate = 0;
        if (this.t >= this.stateDur) this.set(ZS.CHASE);
        break;
      case ZS.KNOCKDOWN:
        turnRate = 0;
        if (this.t >= this.stateDur) {
          this.yaw += GETUP_YAW; // lying on the stomach: turn with the pose
          if (this.toCrawl) { this.toCrawl = false; this.set(ZS.CHASE); this.solid = true; this.attackCd = Math.max(this.attackCd, 0.6); }
          else this.set(ZS.GETUP, KNOCKDOWN_GETUP);
        }
        break;
      case ZS.GETUP:
        turnRate = 0;
        if (this.toCrawl) { this.toCrawl = false; this.set(ZS.CHASE); this.solid = true; break; } // lost a leg while getting up
        if (this.t >= this.stateDur * 0.6) this.solid = true; // up on its feet again
        if (this.t >= this.stateDur) { this.set(ZS.CHASE); this.attackCd = Math.max(this.attackCd, 0.5); }
        break;
      case ZS.DYING:
        turnRate = 0;
        if (this.t >= this.stateDur) { this.set(ZS.DEAD); this.corpseT = 0; }
        break;
      case ZS.DEAD:
        this.corpseT += dt;
        break;
    }

    // facing
    if (turnRate > 0 && (wantX || wantZ)) this.yaw = approachAngle(this.yaw, Math.atan2(wantX, wantZ), turnRate * dt);

    // locomotion velocity (only in states that walk)
    if (this.state === ZS.CHASE) {
      // walk mostly where we face: turning zombies slow down instead of sliding sideways
      const face = Math.max(0, Math.cos(angleDiff(this.yaw, Math.atan2(wantX, wantZ))));
      const s = speed * (0.35 + 0.65 * face);
      const tx = Math.sin(this.yaw) * s, tz = Math.cos(this.yaw) * s;
      const k = Math.min(1, dt * 6);
      this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    } else if (this.state !== ZS.STRIKE && this.state !== ZS.EMERGE) {
      const k = Math.min(1, dt * 10);
      this.vx -= this.vx * k; this.vz -= this.vz * k;
    }

    // integrate: locomotion + knockback (knockback decays with friction; dying bodies slide less far)
    const fr = Math.exp(-dt * (this.state === ZS.DYING ? 5 : 7));
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    this.kx *= fr; this.kz *= fr;
    if (this.state !== ZS.DEAD) {
      const bx = this.x, bz = this.z;
      if (world.resolveCircle(this, this.r) && (this.kx || this.kz)) {
        // knocked into furniture: lose the velocity component into the obstacle
        const nx = this.x - bx, nz = this.z - bz, nl = Math.hypot(nx, nz);
        if (nl > 1e-5) { const ux = nx / nl, uz = nz / nl, into = this.kx * ux + this.kz * uz; if (into < 0) { this.kx -= into * ux; this.kz -= into * uz; } }
      }
    }
  }
}

// Bowling: a body knocked back fast (shotgun, axe; also one just killed) shoves the zombies it runs
// into, handing over part of its momentum. A hard enough shove staggers or floors them in turn.
export function bump(zs, sim) {
  for (const a of zs) {
    if (a.state === ZS.DEAD || (a.state === ZS.DYING && a.t > 0.5)) continue;
    const ks2 = a.kx * a.kx + a.kz * a.kz;
    if (ks2 < 2.2 * 2.2) continue;
    for (const b of zs) {
      if (b === a || !b.solid || b.bumpT > 0) continue;
      const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r + 0.06, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), ux = dx / d, uz = dz / d, into = a.kx * ux + a.kz * uz;
      if (into < 1.4) continue;
      const give = into * 0.55;
      a.kx -= ux * give * 0.7; a.kz -= uz * give * 0.7;
      b.bumped(give, ux, uz, sim);
    }
  }
}

// Pairwise separation so a crowd spreads instead of stacking. O(n^2) is fine for <= 40.
export function separate(zs, player) {
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i]; if (!a.solid) continue;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j]; if (!b.solid) continue;
      const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), push = (rr - d) * 0.5, ux = dx / d, uz = dz / d;
      a.x -= ux * push; a.z -= uz * push; b.x += ux * push; b.z += uz * push;
    }
    // zombies do not walk through the player
    const dx = a.x - player.x, dz = a.z - player.z, rr = a.r + player.r, d2 = dx * dx + dz * dz;
    if (!player.dead && d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), push = (rr - d) * 0.6; a.x += (dx / d) * push; a.z += (dz / d) * push; }
  }
}
