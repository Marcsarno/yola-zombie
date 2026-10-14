// Zombie behaviour: emerge -> chase (flow field + separation) -> telegraphed attack -> recover.
// Hits put them in stagger with collision-aware knockback that navigation does not override.
import { approachAngle, angleDiff } from './world.js';

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

  // Incoming hit: direction (unit) and strength in m/s; part: 'torso' or a severable limb.
  takeHit(dmg, dirX, dirZ, impulse, kind, sim, part = 'torso') {
    if (!this.alive) return;
    const wasDown = this.down;
    if (part !== 'torso' && this.severed.has(part)) part = 'torso';
    this.lastHitPart = part;
    if (part !== 'torso') {
      this.limbHp[part] -= dmg * (kind === 'bat' ? 1.2 : 1);
      if (this.limbHp[part] <= 0) this.sever(part, dirX, dirZ, sim);
    }
    this.hp -= part.startsWith('Forearm') ? dmg * 0.6 : dmg; // arm hits are less deadly
    const push = wasDown ? 0.3 : 1; // a body on the floor barely slides
    this.kx += dirX * impulse * push; this.kz += dirZ * impulse * push;
    this.hitDirX = dirX; this.hitDirZ = dirZ; this.hitStrength = impulse; this.hitSeq++; this.hitKind = kind;
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
    if (this.toCrawl || (kind === 'bat' && !this.crawling && sim.rand() < sim.T.batKnockdown)) {
      this.set(ZS.KNOCKDOWN, KNOCKDOWN_FALL);
      this.solid = false;
      this.yaw = Math.atan2(-dirX, -dirZ); // face the blow, thrown onto the back
      sim.emit({ type: 'zombieKnockdown', id: this.id });
      return;
    }
    // Any hit interrupts a windup (rewarding a timely shot); heavier hits stagger longer.
    const dur = kind === 'bat' ? 0.95 : 0.26;
    if (this.state !== ZS.STAGGER || dur > this.stateDur - this.t) this.set(ZS.STAGGER, dur);
    this.attackCd = Math.max(this.attackCd, kind === 'bat' ? 0.9 : 0.35);
    sim.emit({ type: 'zombieHit', id: this.id, kind });
  }

  update(dt, sim) {
    const T = sim.T, p = sim.player, world = sim.world;
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    if (this.attackCd > 0) this.attackCd -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
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
        else { world.flowDir(this.x, this.z, _flow); wantX = _flow.x; wantZ = _flow.z; }
        speed = T.zombieSpeed * this.speedMul * (this.crawling ? 0.32 : 1);
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
