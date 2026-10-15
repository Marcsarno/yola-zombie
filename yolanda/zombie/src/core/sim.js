// Fixed-step combat simulation. No rendering, no DOM: feed it input, read state + events.
import { World, rng, rayCircle, segPointDist2, angleDiff } from './world.js';
import { LAYOUT, buildWorld } from './layout.js';
import { Player, meleeWorldSegment } from './player.js';
import { Zombie, ZS, separate, bump } from './zombies.js';
import { AXE_GEOM, FISTS, BAT, PISTOL, SHOTGUN, SHOTGUN_SPEC } from './weapons.js';
import { Director } from './director.js';
import { ROOM1 } from './layout.js';
import { Level } from './level.js';

export const STEP = 1 / 60;
const BULLET_RANGE = 16, BULLET_MIN_H = 1.25, ZR_HIT = 0.36, BAT_MIN_HIT_Y = 0.7, BAT_BODY_R = 0.28;
const _m = {}, _a = {}, _b = {};

export class Sim {
  constructor(opts) {
    this.opts = opts;
    this.T = opts.tuning;
    this.seed = opts.seed ?? 1234;
    this.rand = rng(this.seed);
    this.world = buildWorld(World);
    const s = LAYOUT.playerStart;
    this.player = new Player(s.x, s.z, this.T);
    this.player.aimYaw = this.player.aimTarget = s.yaw;
    this.zombies = [];
    this.events = [];
    this.time = 0;
    this.flowT = 0;
    this.stats = { shots: 0, shotHits: 0, swings: 0, batHits: 0, kills: 0, damageTaken: 0 };
    this.director = new Director(this, opts.mode || 'encounter', opts.benchCount || 0);
    this.world.updateFlow(this.player.x, this.player.z);
    this.pickups = []; this.flow = { objective: '' }; // Room 1: the bat pickup and the objective chain
    if ((opts.mode || '') === 'room1') { if (LAYOUT.name === 'floor3') this.level = new Level(this, opts.save || null); else this.setupRoom1(); }
  }

  // ---- Room 1: three static, preplaced standard zombies (staggered wake-ups), the exit to the Supply Hall, the bat ----
  setupRoom1() {
    const R = ROOM1;
    this.flow = { objective: 'room1', stage: 'exit' };
    R.zombies.forEach((s, i) => {
      const z = this.spawnZombie('NE', { x: s.x, z: s.z, yaw: s.yaw, passive: true, speedMul: 0 });
      z.set(ZS.CHASE); // already standing (no emerge walk-in)
      z.dormant = { wake: s.wake, speedMul: 0.85 + 0.1 * i }; // stands still until its wake time (or until it is hit)
    });
    this.pickups.push({ id: 'bat', weapon: BAT, x: R.bat.x, z: R.bat.z, r: 1.35 });
  }
  // objective chain: OR -> Supply Hall (bat) -> Waiting/Reception
  updateFlow() {
    const f = this.flow, p = this.player; if (f.objective === undefined || f.stage === undefined) return;
    const inSupply = p.z < ROOM1.hallLine && p.x < ROOM1.hallMaxX;
    if (f.stage === 'exit' && inSupply) { f.stage = this.pickups.some((q) => q.id === 'bat') ? 'bat' : 'reception'; f.objective = f.stage; this.emit({ type: 'objective', id: f.objective }); }
    for (const q of this.pickups) {
      if (Math.hypot(p.x - q.x, p.z - q.z) < q.r && !p.dead) {
        this.pickups.splice(this.pickups.indexOf(q), 1);
        if (!p.owned.includes(q.weapon)) p.owned.push(q.weapon);
        p.desired = q.weapon; // takes it out
        this.emit({ type: 'pickup', id: q.id, weapon: q.weapon });
        if (f.stage === 'bat' || f.stage === 'exit') { f.stage = 'reception'; f.objective = 'reception'; this.emit({ type: 'objective', id: 'reception' }); }
        break;
      }
    }
  }

  emit(ev) { ev.t = this.time; this.events.push(ev); }

  // input: {moveX, moveZ, aimX, aimZ, swapPresses} already in world directions
  step(input) {
    const dt = STEP;
    this.time += dt;
    const p = this.player;
    for (let i = 0; i < input.swapPresses; i++) p.requestSwap();
    p.move(dt, input, this.world, this);
    p.updateAction(dt, this);
    this.flowT -= dt;
    if (this.flowT <= 0) { this.world.updateFlow(p.x, p.z); this.flowT = 0.2; }
    for (const z of this.zombies) z.update(dt, this);
    bump(this.zombies, this);
    separate(this.zombies, p);
    this.director.update(dt);
    if (this.level) this.level.step(dt, input); else this.updateFlow();
    // remove old corpses (renderer fades them first)
    if (this.zombies.length > 48 || this.time % 1 < dt) this.zombies = this.zombies.filter((z) => !(z.state === ZS.DEAD && z.corpseT > 7));
  }

  spawnZombie(door, opts = {}) {
    const d = (typeof door === 'string' ? LAYOUT.doors.find((x) => x.id === door) : door) || { id: 'placed', x: opts.x, z: opts.z, axis: 'x', spawn: { x: opts.x, z: opts.z }, yaw: opts.yaw ?? 0 };
    const jitter = (this.rand() - 0.5) * 0.8;
    const sx = d.spawn.x + (d.axis === 'x' ? jitter : 0), sz = d.spawn.z + (d.axis === 'z' ? jitter : 0);
    const z = new Zombie(sx, sz, d.yaw, {
      hp: opts.hp ?? this.T.zombieHp,
      speedMul: opts.speedMul ?? 0.85 + this.rand() * 0.3,
      passive: opts.passive,
      phase: this.rand(),
    });
    if (opts.x !== undefined) { z.x = opts.x; z.z = opts.z; z.yaw = opts.yaw ?? z.yaw; z.stateDur = 0.3; }
    else { z.emergeTo = { x: sx, z: sz }; z.x = d.axis === 'x' ? sx : d.x + (d.x < 0 ? 0.35 : -0.35); z.z = d.axis === 'x' ? d.z + 0.35 : sz; }
    this.zombies.push(z);
    this.emit({ type: 'zombieSpawn', id: z.id, door: d.id });
    return z;
  }

  aliveCount() { let n = 0; for (const z of this.zombies) if (z.alive) n++; return n; }

  // ---------------- pistol ----------------
  firePistol(p) {
    this.stats.shots++;
    const m = p.muzzleWorld(_m);
    let yaw = p.aimYaw + (this.rand() - 0.5) * 0.02; // +-0.6 degrees
    // Muzzle obstruction: if a wall sits between the body and the muzzle, the shot hits that wall.
    const block = this.world.raycast(p.x, p.z, m.x, m.z, BULLET_MIN_H);
    if (block) {
      const ix = p.x + (m.x - p.x) * block.t, iz = p.z + (m.z - p.z) * block.t;
      this.emit({ type: 'shot', ox: m.x, oy: m.y, oz: m.z, ex: ix, ez: iz, hit: 'wall', nx: block.nx, nz: block.nz, yaw });
      return;
    }
    // Gentle aim assist: only when nothing is already on the ray, bend at most ~5 degrees toward a visible zombie.
    const first = this.traceBullet(m.x, m.z, yaw);
    if (!first.zombie && this.T.aimAssist > 0) {
      const maxBend = 0.087 * this.T.aimAssist;
      let best = null, bestA = 1e9;
      for (const z of this.zombies) {
        if (!z.alive) continue;
        const dx = z.x - m.x, dz = z.z - m.z, d = Math.hypot(dx, dz);
        if (d > 12 || d < 0.2) continue;
        const a = Math.abs(angleDiff(yaw, Math.atan2(dx, dz))) - Math.atan(ZR_HIT / d);
        if (a < maxBend && a < bestA && this.world.lineOfSight(m.x, m.z, z.x, z.z, BULLET_MIN_H)) { best = z; bestA = a; }
      }
      if (best) yaw = Math.atan2(best.x - m.x, best.z - m.z);
    }
    const r = this.traceBullet(m.x, m.z, yaw);
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    if (r.zombie) {
      this.stats.shotHits++;
      r.zombie.takeHit(this.T.pistolDamage, dx, dz, this.T.pistolKnockback, 'pistol', this, this.bulletPart(r.zombie, m.x, m.z, dx, dz));
      this.emit({ type: 'shot', ox: m.x, oy: m.y, oz: m.z, ex: m.x + dx * r.t, ez: m.z + dz * r.t, hit: 'zombie', id: r.zombie.id, yaw, killed: !r.zombie.alive });
    } else {
      this.emit({ type: 'shot', ox: m.x, oy: m.y, oz: m.z, ex: m.x + dx * r.t, ez: m.z + dz * r.t, hit: r.wall ? 'wall' : 'none', nx: r.nx, nz: r.nz, yaw });
    }
  }

  // ---------------- shotgun ----------------
  // Nine pellets across a cone. Each pellet is its own ray (the spread can catch several zombies);
  // damage and push fall off with distance. Every zombie takes one combined hit: the summed damage,
  // a push along the average pellet direction, and each pellet's body part (several limbs can go).
  fireShotgun(p) {
    this.stats.shots++;
    const S = SHOTGUN_SPEC, T = this.T, m = p.muzzleWorld(_m);
    p.vx -= Math.sin(p.aimYaw) * 1.1; p.vz -= Math.cos(p.aimYaw) * 1.1; // the kick rocks Yola back a step
    const block = this.world.raycast(p.x, p.z, m.x, m.z, BULLET_MIN_H);
    const yaw0 = p.aimYaw, pellets = [], hits = new Map();
    for (let i = 0; i < S.pellets; i++) {
      const u = ((i + 0.5) / S.pellets) * 2 - 1; // spread evenly across the cone, with jitter
      const yaw = yaw0 + (u * 0.85 + (this.rand() - 0.5) * 0.3) * S.spread;
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      if (block) { pellets.push({ ex: p.x + (m.x - p.x) * block.t, ez: p.z + (m.z - p.z) * block.t, hit: 'wall', nx: block.nx, nz: block.nz }); continue; }
      const r = this.traceBullet(m.x, m.z, yaw, S.range);
      const ex = m.x + dx * r.t, ez = m.z + dz * r.t;
      if (r.zombie) {
        const fall = r.t <= S.falloffFrom ? 1 : Math.max(0.33, 1 - ((r.t - S.falloffFrom) / (S.range - S.falloffFrom)) * 0.67);
        let h = hits.get(r.zombie);
        if (!h) hits.set(r.zombie, (h = { dmg: 0, px: 0, pz: 0, parts: [] }));
        h.dmg += T.shotgunDamage * fall; h.px += dx * fall; h.pz += dz * fall;
        h.parts.push([this.bulletPart(r.zombie, m.x, m.z, dx, dz, true), T.shotgunDamage * fall]);
        pellets.push({ ex, ez, hit: 'zombie', id: r.zombie.id });
      } else pellets.push({ ex, ez, hit: r.wall ? 'wall' : 'none', nx: r.nx, nz: r.nz });
    }
    const killed = [];
    for (const [z, h] of hits) {
      this.stats.shotHits++;
      const pl = Math.hypot(h.px, h.pz) || 1;
      z.takeHit(h.dmg, h.px / pl, h.pz / pl, (T.shotgunKnockback * pl) / S.pellets, SHOTGUN, this, h.parts);
      if (!z.alive) killed.push(z.id);
    }
    this.emit({ type: 'shotgun', ox: m.x, oy: m.y, oz: m.z, yaw: yaw0, pellets, hits: hits.size, killed });
    if (hits.size && this.T.hitPause > 0) this.emit({ type: 'hitPause', dur: this.T.hitPause * (killed.length ? 0.8 : 0.5) });
  }

  // Which part a bullet hits, from where it passes the body: wide of centre takes the arm on that side;
  // through the middle mostly the torso, sometimes the head or a leg.
  bulletPart(z, ox, oz, dx, dz, pellet = false) {
    const rx = z.x - ox, rz = z.z - oz, along = rx * dx + rz * dz;
    const qx = ox + dx * along - z.x, qz = oz + dz * along - z.z; // closest ray point, relative to the body
    const side = qx * Math.cos(z.yaw) - qz * Math.sin(z.yaw); // + = the zombie's left
    const r = this.rand();
    if (Math.hypot(qx, qz) > 0.17) return r < 0.75 ? (side > 0 ? 'Forearm_L' : 'Forearm_R') : 'torso';
    // pellets spread up and down as well: more of them find the head and the legs
    if (r < (pellet ? 0.16 : 0.12)) return 'Head';
    if (r < (pellet ? 0.4 : 0.26)) return this.rand() < 0.5 ? 'LowerLeg_L' : 'LowerLeg_R';
    return 'torso';
  }

  traceBullet(ox, oz, yaw, range = BULLET_RANGE) {
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const w = this.world.raycast(ox, oz, ox + dx * range, oz + dz * range, BULLET_MIN_H);
    let t = w ? w.t * range : range, zombie = null;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const h = rayCircle(ox, oz, dx, dz, t, z.x, z.z, ZR_HIT);
      if (h >= 0 && h < t) { t = h; zombie = z; }
    }
    return { t, zombie, wall: !zombie && !!w, nx: w?.nx, nz: w?.nz };
  }

  // Gentle melee assist: at swing start, turn up to ~20 degrees toward a zombie that is within reach,
  // roughly in front (50 degrees) and not behind a wall. The turn is real (the body rotates), so the
  // bat still has to meet the body for a hit.
  meleeAssist(p, reach = 1.45, downToo = false) {
    let best = null, bestA = 0.87;
    for (const z of this.zombies) {
      if (!z.alive || (z.down && !downToo)) continue;
      const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz);
      if (d > reach || d < 0.2) continue;
      const a = Math.abs(angleDiff(p.aimYaw, Math.atan2(dx, dz)));
      if (a < bestA && this.world.lineOfSight(p.x, p.z, z.x, z.z, 0.9)) { best = z; bestA = a; }
    }
    if (!best) return null;
    const want = angleDiff(p.aimYaw, Math.atan2(best.x - p.x, best.z - p.z));
    const turn = Math.max(-0.35, Math.min(0.35, want));
    p.aimYaw += turn; p.aimTarget = p.aimYaw;
    return best;
  }

  // ---------------- axe: swept between simulation steps ----------------
  resolveMelee(p, t0, t1, act) {
    if (t1 <= t0) return;
    const SUB = 4, T = this.T, A = p.attacks[act.combo], G = A.geom || AXE_GEOM, fist = p.equipped === FISTS;
    let prev = meleeWorldSegment(p, A, t0, _a);
    let px = prev.tx, pz = prev.tz;
    for (let s = 1; s <= SUB; s++) {
      const t = t0 + ((t1 - t0) * s) / SUB;
      if (t > act.activeEnd) break;
      const seg = meleeWorldSegment(p, A, t, _b);
      // bat into a wall: clank, end the damaging window
      const wall = this.world.raycast(p.x, p.z, seg.tx, seg.tz, 0.9);
      let tipX = seg.tx, tipZ = seg.tz;
      if (wall) {
        tipX = p.x + (seg.tx - p.x) * wall.t; tipZ = p.z + (seg.tz - p.z) * wall.t;
        if (!act.clanked) { act.clanked = true; act.activeEnd = t; this.emit({ type: 'batClank', x: tipX, z: tipZ, nx: wall.nx, nz: wall.nz }); }
      }
      const f = G.hitFrom / G.length;
      const ax = seg.hx + (tipX - seg.hx) * f, az = seg.hz + (tipZ - seg.hz) * f;
      const ay = seg.hy + (seg.ty - seg.hy) * f;
      // sweep: test the damaging section at this substep AND the arc chord the tip travelled.
      // Only a bat at body height counts: the swing's low dip past the knees does not land a blow.
      const chop = A.style === 'chop';
      for (const z of this.zombies) {
        if (!z.alive || act.hitSet.has(z.id)) continue;
        if (z.down && !chop) continue; // only the chop comes down far enough to hit a body on the floor
        const rr = z.down ? 0.5 : BAT_BODY_R + (fist ? G.radius : 0); // the visible torso (a lying body is longer)
        const minY = z.down ? 0.05 : chop ? 0.3 : fist ? 0.25 : BAT_MIN_HIT_Y;
        const h1 = segPointDist2(ax, az, tipX, tipZ, z.x, z.z);
        const y1 = ay + (seg.ty - ay) * h1.t;
        const d1 = y1 >= minY ? h1.d2 : 1e9;
        const d2 = seg.ty >= minY ? segPointDist2(px, pz, tipX, tipZ, z.x, z.z).d2 : 1e9;
        if (Math.min(d1, d2) > rr * rr) continue;
        if (!this.world.lineOfSight(p.x, p.z, z.x, z.z, 0.9)) continue; // walls block strikes
        // direction: mostly the bat's travel, partly away from Yola
        let vx = tipX - px, vz = tipZ - pz; const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
        let rx = z.x - p.x, rz = z.z - p.z; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
        let dx = vx * 0.6 + rx * 0.4, dz = vz * 0.6 + rz * 0.4; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        act.hitSet.add(z.id); act.hits++;
        this.stats.batHits++;
        // the chop drives straight down: less sideways throw
        if (A.style === 'chop') { dx = dx * 0.5 + rx * 0.5; dz = dz * 0.5 + rz * 0.5; const l2 = Math.hypot(dx, dz) || 1; dx /= l2; dz /= l2; }
        // the blade cuts: a killing blow can take the head; otherwise an arm (or, low, a leg) can come off
        if (fist) { // unarmed: no blade, no severing; a light stagger (the kick can knock them flat)
          const dmgF = T.fistDamage * A.dmg;
          act.hitSet.add(z.id); act.hits++; this.stats.batHits++;
          z.takeHit(dmgF, dx, dz, T.fistKnockback * A.knock, 'fist', this, 'torso', A.style);
          this.emit({ type: 'batHit', id: z.id, x: z.x, z: z.z, dirX: dx, dirZ: dz, killed: !z.alive, combo: act.combo, style: A.style, fist: true });
          if (T.hitPause > 0) this.emit({ type: 'hitPause', dur: T.hitPause * 0.6 * (z.alive ? 1 : 1.4) });
          continue;
        }
        const dmg = T.axeDamage * A.dmg, lethal = z.hp <= dmg, r = this.rand(), sv = A.sever;
        const side = this.rand() < 0.5 ? '_L' : '_R';
        const part = lethal && r < sv.head ? 'Head'
          : r < (lethal ? sv.head : 0) + sv.arm ? 'Forearm' + side
          : sv.leg && r < (lethal ? sv.head : 0) + sv.arm + sv.leg ? 'LowerLeg' + side : 'torso';
        if (part !== 'torso' && !z.severed.has(part)) z.limbHp[part] = 0; // the blade goes through
        const last = act.combo === p.attacks.length - 1, holding = !last && p.attackHeld;
        z.takeHit(dmg, dx, dz, T.axeKnockback * A.knock * (holding ? 0.45 : 1), p.equipped === BAT ? 'bat' : 'axe', this, part, holding ? 'combo' : A.style);
        this.emit({ type: 'batHit', id: z.id, x: z.x, z: z.z, dirX: dx, dirZ: dz, killed: !z.alive, combo: act.combo, style: A.style });
        if (T.hitPause > 0) this.emit({ type: 'hitPause', dur: T.hitPause * (z.alive ? 1 : 1.4) * (A.style === 'chop' ? 1.4 : 1) });
      }
      px = tipX; pz = tipZ;
    }
  }
}

export { ZS, PISTOL, SHOTGUN };
