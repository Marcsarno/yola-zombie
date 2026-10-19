// Fixed-step combat simulation. No rendering, no DOM: feed it input, read state + events.
import { World, rng, rayCircle, segPointDist2, angleDiff } from './world.js';
import { LAYOUT, buildWorld } from './layout.js';
import { Player, meleeWorldSegment } from './player.js';
import { Zombie, ZS, KINDS, ZATTACKS, LADY, FLOOR_EMERGE, separate, bump } from './zombies.js';
import { AXE_GEOM, FISTS, BAT, PISTOL, SHOTGUN, SHOTGUN_SPEC } from './weapons.js';
import { Director } from './director.js';
import { ROOM1 } from './layout.js';
import { Level } from './level.js';
import { addLoose, looseStep, IV_CARRY, O2, tankPos, punctureTank, o2Step } from './loose.js';
import { addCrackedWall, crackedNear, breakWall, heavyImpact, addFlood, joltFlood, panelHit, addMRI, roomsStep, CRACK, FLOOD } from './rooms.js';

export const STEP = 1 / 60;
const BULLET_RANGE = 16, BULLET_MIN_H = 1.25, ZR_HIT = 0.36, BAT_MIN_HIT_Y = 0.7, BAT_BODY_R = 0.3;
const ARM_REACH = 0.36, ARM_R = 0.2; // a standing zombie's reaching arms: a circle this far ahead of its body
const _m = {}, _a = {}, _b = {};
// the dodge's beat (FINISHERS_PLAN.md 1): its window opens lead s (game time) before the hit lands, whatever the attack; a
// press inside its last perfect s is perfect; grace: the button stays lit this long after the window shuts (touch lag)
export const DODGE_CUE = { lead: 0.45, perfect: 0.18, grace: 0.1 };

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
    this.loose = []; // the drip stands and wheelchairs in the world (core/loose.js)
    this.events = [];
    this.hazards = []; // acid pools: { x, z, r, t, dur, dps } (the lady's burst)
    this.time = 0;
    this.flowT = 0;
    this.engaged = new Set(); this.engageT = 0; this.nextAttackT = 0; // zombie attack slots and turns (updateEngagement)
    this.stats = { shots: 0, shotHits: 0, swings: 0, batHits: 0, kills: 0, damageTaken: 0 };
    this.director = new Director(this, opts.mode || 'encounter', opts.benchCount || 0);
    this.world.updateFlow(this.player.x, this.player.z);
    this.pickups = []; this.flow = { objective: '' }; // Room 1: the bat pickup and the objective chain
    if ((opts.mode || '') === 'room1') { if (LAYOUT.story) this.level = new Level(this, opts.save || null); else this.setupRoom1(); }
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
    // the dodge is there only while something dodgeable is coming at her (the user, 2026-10-17): its button shows then.
    // A special enemy's big attack (the guard's leap-slam, the lady's charge) is its own: p.threat drives the cue over the
    // attacker and the button's pulse, and the press dodges the way that gets her clear (autoDodge), not along the stick
    // (2026-10-18 night, FINISHERS_PLAN.md 1: "telegraph early, cue late") the window to dodge opens a fixed DODGE_CUE.lead
    // before the hit lands, the same for every attack: one beat to learn. The button is grey until then (no dodge at will:
    // the user), pulses yellow through the window; a press in its last DODGE_CUE.perfect is perfect, rewarded at once
    // (perfectDodge: Witch Time, main.js), not when the attack later misses.
    const th = this.dodgeThreat();
    p.threat = th && th.special ? th : null; // (the sign over a special attacker: render/threatcue.js)
    p.dodgeTh = th && th.open ? th : null;
    p.dodgeOpen = th && th.open ? DODGE_CUE.grace : Math.max(0, (p.dodgeOpen || 0) - dt);
    if (p.dodgeTh) { // which way she'll go (the button's arrow shows it): the safe way from a special attack, else the stick / back
      p.dodgeAuto = th.special ? this.autoDodge(p, th, input.moveX, input.moveZ) : null;
      const sl = Math.hypot(input.moveX, input.moveZ);
      p.dodgeDir = p.dodgeAuto ? { x: p.dodgeAuto.x, z: p.dodgeAuto.z } : sl > 0.2 ? { x: input.moveX / sl, z: input.moveZ / sl } : { x: -Math.sin(p.aimYaw), z: -Math.cos(p.aimYaw) };
    }
    if (p.critT > 0) p.critT -= dt;
    if (input.dodgePresses && p.dodgeOpen > 0) {
      const tt = p.dodgeTh || this.lastTh, auto = tt?.special ? (p.dodgeAuto || this.autoDodge(p, tt, input.moveX, input.moveZ)) : null;
      if (auto ? p.tryDodge(auto.x, auto.z, this, auto) : p.tryDodge(input.moveX, input.moveZ, this)) { // (Dodge / Shift: core/player.js DODGE)
        if (tt) {
          const perfect = tt.eta <= DODGE_CUE.perfect;
          this.lastDodge = { t: this.time, id: tt.z.id, kind: tt.kind, perfect };
          if (perfect) {
            if (tt.kind !== 'pounce') p.critT = this.T.critWindow ?? 2.2; // (her next blow or shot is critical; a pounce's reward is the execute: specialMiss)
            this.emit({ type: 'perfectDodge', id: tt.z.id, kind: tt.kind, x: tt.z.x, z: tt.z.z });
          }
        }
      }
    }
    if (p.dodgeTh) this.lastTh = p.dodgeTh;
    // the same button outside a dodge window, with a zombie open to a finisher in reach: FINISH (core/player.js updateAction)
    p.finishReady = !p.dodgeTh && p.dodgeOpen <= 0 && !!this.execTarget(p, true);
    if (input.dodgePresses && p.dodgeOpen <= 0 && p.finishReady) p.wantFinishUntil = this.time + 0.3;
    this.stepChain();
    roomsStep(this, dt); // (cracked walls, the flood, the MRI magnet: core/rooms.js)
    const yb = this.yolaBoost || 1; // (slow motion: Yola a little ahead of the world, main.js YOLA_AHEAD)
    p.move(dt * yb, input, this.world, this);
    p.updateAction(dt * yb, this);
    this.flowT -= dt;
    if (this.flowT <= 0) { this.world.updateFlow(p.x, p.z); this.flowT = 0.2; }
    if ((this.engageT -= dt) <= 0) { this.engageT = 0.2; this.updateEngagement(); }
    for (const z of this.zombies) z.update(dt, this);
    this.updateHazards(dt);
    bump(this.zombies, this);
    separate(this.zombies, p);
    looseStep(this, dt); // (the drip stands and wheelchairs: nobody walks through them)
    o2Step(this, dt); // (oxygen cylinders: fuses burning down, bursts: core/loose.js O2)
    this.director.update(dt);
    if (this.level) this.level.step(dt, input); else this.updateFlow();
    // remove old corpses (renderer fades them first)
    if (this.zombies.length > 48 || this.time % 1 < dt) this.zombies = this.zombies.filter((z) => !(z.state === ZS.DEAD && z.corpseT > 7));
  }

  spawnZombie(door, opts = {}) {
    if (opts.kind === 'o2chair' || opts.kind === 'o2walker') opts = { ...opts, kind: 'normal', prop: opts.kind === 'o2chair' ? 'chair' : 'iv', o2: true }; // (an oxygen cylinder on its chair / trolley: core/loose.js O2)
    const d = (typeof door === 'string' ? LAYOUT.doors.find((x) => x.id === door) : door) || { id: 'placed', x: opts.x, z: opts.z, axis: 'x', spawn: { x: opts.x, z: opts.z }, yaw: opts.yaw ?? 0 };
    const jitter = (this.rand() - 0.5) * 0.8;
    const sx = d.spawn.x + (d.axis === 'x' ? jitter : 0), sz = d.spawn.z + (d.axis === 'z' ? jitter : 0);
    const K = KINDS[opts.kind] || KINDS.normal; // (the sprinter and the big guard: their own health and pace)
    const z = new Zombie(sx, sz, d.yaw, {
      hp: (opts.hp ?? this.T.zombieHp) * K.hp,
      speedMul: (opts.speedMul ?? 0.85 + this.rand() * 0.3) * K.speed,
      passive: opts.passive,
      phase: this.rand(),
      kind: opts.kind,
      prop: opts.prop, bed: opts.bed,
    });
    if (opts.x !== undefined) { z.x = opts.x; z.z = opts.z; z.yaw = opts.yaw ?? z.yaw; z.stateDur = 0.3; z.layInBed(); }
    else { z.emergeTo = { x: sx, z: sz }; z.x = d.axis === 'x' ? sx : d.x + (d.x < 0 ? 0.35 : -0.35); z.z = d.axis === 'x' ? d.z + 0.35 : sz; }
    this.zombies.push(z);
    if (z.prop === 'iv' || z.prop === 'chair') { // (its drip stand / wheelchair: core/loose.js)
      const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw), lx = Math.cos(z.yaw), lz = -Math.sin(z.yaw), iv = z.prop === 'iv';
      z.loose = addLoose(this, z.prop, iv ? z.x + fx * IV_CARRY.fwd + lx * IV_CARRY.side : z.x + fx * 0.06, iv ? z.z + fz * IV_CARRY.fwd + lz * IV_CARRY.side : z.z + fz * 0.06, z.yaw, z.id);
      if (opts.o2) { z.loose.o2 = true; z.o2 = true; }
    }
    this.emit({ type: 'zombieSpawn', id: z.id, door: d.id });
    return z;
  }

  // the room mechanics (core/rooms.js): placed by the floors, or a practice scene
  addCrackedWall(o) { return addCrackedWall(this, o); }
  addFlood(o) { return addFlood(this, o); }
  addMRI(o) { return addMRI(this, o); }
  heavyImpact(x, z, r, by) { heavyImpact(this, x, z, r, by); }
  // a standing oxygen cylinder (core/loose.js O2): the floors place them (a cylinder store, a corridor); shoot it
  addTank(x, z) { const L = addLoose(this, 'o2tank', x, z, 0, 0); L.o2 = true; L.held = false; return L; }

  // A zombie out of the floor (core/zombies.js FLOOR_EMERGE): placed at the hole, under the floor until it breaks through.
  // The level never calls this right under Yola (core/level.js floorStep keeps her a few metres off).
  spawnFromFloor(x, z, opts = {}) {
    const p = this.player, yaw = opts.yaw ?? Math.atan2(p.x - x, p.z - z);
    const zb = this.spawnZombie(null, { x, z, yaw, kind: opts.kind, hp: opts.hp });
    const F = { ...FLOOR_EMERGE, breached: false };
    zb.floorSpawn = F; zb.set(ZS.EMERGE, F.rumble + F.climb); zb.solid = false; zb.emergeTo = null;
    if (opts.look) zb.look = opts.look;
    this.emit({ type: 'floorRumble', id: zb.id, x, z, dur: F.rumble });
    return zb;
  }

  // The lady bursts (core/zombies.js LADY): her burst knocks Yola flat close by and staggers her further out; an acid pool
  // stays where she was. (Her death momentum carries the burst forward: the gore flies along it.)
  ladyBurst(z) {
    const p = this.player, A = LADY.acid, d = Math.hypot(p.x - z.x, p.z - z.z);
    const mv = Math.hypot(z.vx + z.kx, z.vz + z.kz), hd = Math.hypot(z.hitDirX || 0, z.hitDirZ || 0); // (the splatter flies along her momentum, else along the killing blow)
    this.hazards.push({ id: z.id, x: z.x, z: z.z, r: A.r, t: 0, dur: A.dur, dps: A.dps, dirX: mv > 0.5 ? (z.vx + z.kx) / mv : hd ? z.hitDirX / hd : 1, dirZ: mv > 0.5 ? (z.vz + z.kz) / mv : hd ? z.hitDirZ / hd : 0, seed: this.rand() });
    this.emit({ type: 'ladyBurst', id: z.id, x: z.x, z: z.z, dirX: z.hitDirX || 0, dirZ: z.hitDirZ || 0, vx: z.vx + z.kx, vz: z.vz + z.kz });
    if (!p.dead && p.invuln <= 0 && p.action.type !== 'vault') {
      if (d < LADY.knock) p.knockDown(z.x, z.z, this);
      else if (d < LADY.stagger) p.hurt(4, z.x, z.z, this);
    }
  }
  // acid: hurts Yola while she stands in it (a slow burn, no knockback); fades out at the end
  updateHazards(dt) {
    const p = this.player;
    for (const h of this.hazards) {
      h.t += dt;
      if (p.dead || Math.hypot(p.x - h.x, p.z - h.z) > h.r) continue;
      if (!this.T.testInfiniteHealth) { p.hp = Math.max(0, p.hp - h.dps * dt); if (p.hp <= 0) p.hurt(0.01, h.x, h.z, this); }
      if ((h.burnT = (h.burnT || 0) - dt) <= 0) { h.burnT = 0.45; this.emit({ type: 'acidBurn', x: p.x, z: p.z }); }
    }
    this.hazards = this.hazards.filter((h) => h.t < h.dur);
  }

  // Something she can dodge is coming: a zombie winding up its lunge or pounce at her (or in the pounce's leap), the big
  // guard winding up his jump slam, the big lady (or the enraged guard) squaring up for her charge or running it at her.
  // Returns { z, kind, special, u (the wind-up's progress 0..1), now (the moment to dodge: the slam once he has leapt, the
  // charge once it is running), soon (well timed: close to landing) } or null; a special threat outranks a walker's.
  // eta: game seconds until the hit would land; open: inside the dodge window (DODGE_CUE.lead); perfect: inside its last
  // DODGE_CUE.perfect. now / soon: open / perfect (the older names, still read by the sign and the button).
  dodgeThreat() {
    const p = this.player; if (p.dead) return null;
    const C = DODGE_CUE, mk = (o) => { o.open = o.eta <= C.lead; o.perfect = o.eta <= C.perfect; o.now = o.open; o.soon = o.perfect; return o; };
    let best = null;
    for (const z of this.zombies) {
      if (!z.alive || z.down || z.passive || z.dormant) continue;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (z.state === ZS.WINDUP && z.attack === 'slam' && d < 7.5) { // (he lands at the end of his wind-up)
        const u = z.t / Math.max(0.05, z.stateDur), left = Math.max(0, z.stateDur - z.t);
        return mk({ z, kind: 'slam', special: true, u, eta: left, left });
      }
      const charger = z.kind === 'sprinter' || z.enraged;
      if (charger && d < 12 && !z.crawling && ((z.spotT > 0 && !z.sprinting) || (z.sprinting && !z.braking))) {
        const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw), along = (p.x - z.x) * fx + (p.z - z.z) * fz, lat = Math.abs((p.x - z.x) * fz - (p.z - z.z) * fx);
        const T = this.T, u = z.sprinting ? 1 : Math.min(1, z.spotT / (T.sprinterWindup ?? 0.7));
        let eta = Infinity; // (winding up, running past, or her line misses Yola: the telegraph only)
        if (z.sprinting && along > -0.2 && lat < z.r + p.r + 0.35) { // the time to cover the gap, building toward her top speed
          const gap = Math.max(0, along - (z.r + p.r)), a = T.sprinterAccel ?? 4.3, top = (T.sprinterSpeed ?? 6.2) * z.speedMul, v = Math.max(0.5, z.spd);
          const tTop = Math.max(0, (top - v) / a), dTop = v * tTop + 0.5 * a * tTop * tTop;
          eta = gap <= dTop ? (-v + Math.sqrt(v * v + 2 * a * gap)) / a : tTop + (gap - dTop) / top;
        }
        return mk({ z, kind: 'charge', special: true, u, eta, left: eta });
      }
      // (2026-10-18, the user: "I don't think all the basic zombies need attacks that need to be dodged.. they can just have
      // basic attacks too"): a walker's lunge, scratch or pounce never brings up the sign; the runner's dash rake does.
      // A walker's pounce (about a third of them pounce): the button lights for it, no sign over it; a perfect dodge of it
      // opens that walker to a finisher (specialMiss)
      if (!best && z.attack === 'pounce' && (z.state === ZS.WINDUP || z.state === ZS.STRIKE) && d < ZATTACKS.pounce.range + 1.2) {
        const u = z.state === ZS.STRIKE ? 1 : z.t / Math.max(0.05, z.stateDur);
        best = mk({ z, kind: 'pounce', special: false, u, eta: z.state === ZS.STRIKE ? 0.05 : Math.max(0, z.stateDur - z.t) + 0.12 });
      }
      if (!best && z.attack === 'dash' && (z.state === ZS.WINDUP || z.state === ZS.STRIKE) && d < 5.5) {
        const u = z.state === ZS.STRIKE ? 1 : z.t / Math.max(0.05, z.stateDur), left = z.state === ZS.STRIKE ? 0.05 : Math.max(0, z.stateDur - z.t) + 0.08;
        best = mk({ z, kind: 'dash', special: true, u, eta: left, left });
      }
    }
    return best;
  }

  // Which way a dodge from a special attack goes (the user: "choose a sensible escape direction based on the attack and
  // surrounding space ... without rolling into walls, props, or an obviously worse position"). Sixteen directions are tried
  // (and the stick's own, which wins any near tie): each path is walked against the world (it may end early at a wall; too
  // short and it is dropped), the end scored for how far it is outside the attack (the slam's landing wedge; the charge's
  // lane), room around it, no zombie waiting there, not back toward the attacker. The slam is rolled out of; the charge is
  // side-stepped, Yola squared up to the charger so the step is truly to her left or right.
  autoDodge(p, th, sx, sz) {
    const z = th.z, W = this.world, fx = Math.sin(z.yaw), fz = Math.cos(z.yaw), slam = th.kind === 'slam';
    const D = slam ? 3.0 : 1.9, sl = Math.hypot(sx, sz), r = p.r;
    let cx = z.x, cz = z.z; // the slam lands where his leap ends: his remaining travel ahead of him
    if (slam) { const S = ZATTACKS.slam, rem = Math.max(0, Math.min(1, (1 - Math.max(th.u, S.takeoff)) / (1 - S.takeoff))) * (z.leapL ?? Math.min(S.leap, Math.max(0, Math.hypot(p.x - z.x, p.z - z.z) - 1.05))); cx += fx * rem; cz += fz * rem; }
    const blocked = (x, y) => {
      const B = W.bounds; if (B && (x < B.minX + r || x > B.maxX - r || y < B.minZ + r || y > B.maxZ - r)) return true;
      for (const b of W.boxes) { if (b.off || (b.h ?? 1) < 0.25) continue; const qx = Math.max(b.minX, Math.min(x, b.maxX)), qz = Math.max(b.minZ, Math.min(y, b.maxZ)); if ((x - qx) ** 2 + (y - qz) ** 2 < r * r * 0.95) return true; }
      return false;
    };
    const outside = (x, y) => { // metres clear of the attack (negative: inside it)
      const rx = x - cx, rz = y - cz, d = Math.hypot(rx, rz);
      if (slam) {
        const along = rx * fx + rz * fz, ang = Math.acos(Math.max(-1, Math.min(1, along / (d || 1))));
        const radial = d - (ZATTACKS.slam.range + r + 0.25), angular = along <= 0 ? 1.5 : (ang - ZATTACKS.slam.arc) * Math.max(0.6, d);
        return Math.max(radial, angular);
      }
      const ax = x - z.x, az = y - z.z, lat = Math.abs(ax * fz - az * fx), al = ax * fx + az * fz;
      return al < -0.5 ? 1.5 : lat - (z.r + r + 0.35);
    };
    let best = null;
    const tries = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; tries.push([Math.sin(a), Math.cos(a), 0]); }
    if (sl > 0.3) tries.push([sx / sl, sz / sl, 1]);
    for (const [dx, dz, stick] of tries) {
      let len = 0;
      for (let s = 0.25; s <= D + 1e-6; s += 0.25) { if (blocked(p.x + dx * s, p.z + dz * s)) break; len = s; }
      if (len < D * 0.55) continue; // (a wall too close that way)
      const ex = p.x + dx * len, ez = p.z + dz * len, out = outside(ex, ez);
      let score = Math.min(1.6, out) * 3;
      if (out < 0) score -= 6; // (still under it)
      let room = 0; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (!blocked(ex + Math.sin(a) * 1.0, ez + Math.cos(a) * 1.0)) room++; }
      score += room * 0.18 + (len / D) * 0.8;
      for (const o of this.zombies) { if (o === z || !o.alive || !o.solid) continue; const d = Math.hypot(o.x - ex, o.z - ez); if (d < 1.4) score -= (1.4 - d) * 2.2; }
      const tx = z.x - p.x, tz = z.z - p.z, tl = Math.hypot(tx, tz) || 1; score -= Math.max(0, (dx * tx + dz * tz) / tl) * 1.2; // (not back into him)
      if (sl > 0.3) score += Math.max(0, (dx * sx + dz * sz) / sl) * 0.9 + stick * 0.3; // (the stick, where it is safe)
      if (!best || score > best.score) best = { score, x: dx, z: dz, len };
    }
    if (!best) return null; // (boxed in: the plain dodge along the stick)
    const out = { x: best.x, z: best.z, dist: best.len, roll: slam };
    if (!slam) { // square up to the charger; the step is then to her left or right
      out.face = Math.atan2(z.x - p.x, z.z - p.z);
      out.kind = angleDiff(out.face, Math.atan2(best.x, best.z)) > 0 ? 'left' : 'right';
    }
    return out;
  }
  // a special attack has missed (the slam landed without her, the charge ran past) after a dodge of it: a success. A perfect
  // one was rewarded at the press (step: perfectDodge); a walker's pounce dodged perfectly opens it to a finisher now
  specialMiss(z, kind) {
    const d = this.lastDodge;
    if (!d || d.id !== z.id || this.time - d.t > 2.6 || d.used) return;
    d.used = true;
    if (d.perfect && kind === 'pounce') this.openFinisher(z, 'pounce'); // (2026-10-18, the user's idea: a perfect dodge on a basic zombie is an execute)
    this.emit({ type: 'dodgeSuccess', id: z.id, kind, perfect: d.perfect, x: z.x, z: z.z });
  }
  // a zombie open to a finisher (FINISHERS_PLAN.md 2): the gold mark over it and the FINISH button while it lasts
  openFinisher(z, why, dur = this.T.finisherOpen ?? 2.6) {
    z.executable = this.time + dur; z.openWhy = why; z.openDur = dur;
    this.emit({ type: 'finisherOpen', id: z.id, why, dur, x: z.x, z: z.z });
  }
  // a zombie open to an execution in front of her and in reach (the nearest to her aim): render/execution.js plays the beat
  execTarget(p, anyDir = false) { // (anyDir: the FINISH button takes the nearest open one in reach, wherever she aims)
    let best = null, bs = 1e9;
    for (const z of this.zombies) {
      if (!z.alive || !(z.executable > this.time) || (z.down && z.openWhy !== 'wall') || z.execLock) continue; // (the lady opened by her crash: on the floor)
      const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz);
      if (d > (this.T.execReach ?? 3.6)) continue;
      const off = anyDir ? 0 : Math.abs(angleDiff(p.aimTarget, Math.atan2(dx, dz)));
      if (off > 1.25) continue;
      const s = d + off * 1.5; if (s < bs) { bs = s; best = z; }
    }
    return best;
  }
  // the execution's blow lands whatever the swing did (the zombie dies to it: zombies.js executed)
  forceExec(z) {
    if (z.kind === 'guard' && !z.executed) return; // (his first finisher already took the arm: he lives on)
    const p = this.player, dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz) || 1, w = p.equipped;
    const kind = w === PISTOL || w === SHOTGUN ? w : w === 'fists' ? 'fist' : w === BAT || w === 'crowbar' || w === 'sledgehammer' ? 'bat' : 'axe';
    z.takeHit(9999, dx / d, dz / d, 6, kind, this, 'torso', 'heavy');
    if (kind !== PISTOL && kind !== SHOTGUN) this.emit({ type: 'batHit', id: z.id, x: z.x, z: z.z, dirX: dx / d, dirZ: dz / d, killed: !z.alive, combo: 2, style: 'heavy', weapon: w, fist: kind === 'fist' });
  }
  // the 5% critical finisher (FINISHERS_PLAN.md 2): a fresh attack on a walker in reach and in front becomes a finisher,
  // T.critFinChance of the time, never sooner than T.critFinCooldown s after the last one
  critFinisher(p) {
    if (this.time < (this.critFinNext || 0)) return null;
    let best = null, bs = 1e9;
    for (const z of this.zombies) {
      if (!z.alive || (z.kind !== 'normal' && z.kind !== 'runner') || z.down || z.dormant || z.passive || z.buried || z.execLock || z.bed) continue;
      const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz);
      if (d > (this.T.execReach ?? 3.6)) continue;
      const off = Math.abs(angleDiff(p.aimTarget, Math.atan2(dx, dz))); if (off > 1.0) continue;
      const s = d + off * 1.5; if (s < bs) { bs = s; best = z; }
    }
    if (!best || this.rand() >= (this.T.critFinChance ?? 0.05)) return null;
    this.critFinNext = this.time + (this.T.critFinCooldown ?? 12);
    this.emit({ type: 'critFinisher', id: best.id, x: best.x, z: best.z });
    return best;
  }
  // the critical finisher's wide arc, as its target dies: melee and the shotgun take every walker in a 120-degree arc
  // round her strike (within 2.4 m of the target, in front of her); the pistol queues a quick chain of headshots on up to
  // two more within 7 m (stepChain)
  critSweep(z) {
    const p = this.player, w = p.equipped, ax = z.x - p.x, az = z.z - p.z, al = Math.hypot(ax, az) || 1;
    if (w === PISTOL) {
      const c = this.zombies.filter((o) => o !== z && o.alive && !o.buried && !o.dormant && (o.kind === 'normal' || o.kind === 'runner') && Math.hypot(o.x - p.x, o.z - p.z) < 7)
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 2);
      this.chain = c.map((o, i) => ({ id: o.id, at: this.time + 0.12 + i * 0.14 }));
      return;
    }
    for (const o of this.zombies) {
      if (o === z || !o.alive || o.buried || o.dormant || o.kind === 'guard' || o.kind === 'sprinter') continue;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      if (Math.hypot(o.x - z.x, o.z - z.z) > 2.4 || (dx * ax + dz * az) / (d * al || 1) < 0.5) continue; // (120 degrees round her line)
      o.executed = true; o.execWeapon = w; o.execDone = true;
      const kind = w === SHOTGUN ? SHOTGUN : w === FISTS ? 'fist' : w === BAT || w === 'crowbar' || w === 'sledgehammer' ? 'bat' : 'axe';
      o.takeHit(9999, dx / (d || 1), dz / (d || 1), 7, kind, this, 'torso', 'heavy');
      this.emit({ type: 'critSweep', id: o.id, x: o.x, z: o.z, weapon: w });
    }
  }
  // the pistol's chain of headshots: Yola snaps to each in turn
  stepChain() {
    if (!this.chain?.length) return;
    const p = this.player;
    while (this.chain.length && this.time >= this.chain[0].at) {
      const c = this.chain.shift(), o = this.zombies.find((q) => q.id === c.id); if (!o || !o.alive) continue;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.aimYaw = p.aimTarget = Math.atan2(dx, dz); p.recoil = 1;
      o.limbHp.Head = 0; o.takeHit(9999, dx / d, dz / d, 4, PISTOL, this, 'Head');
      this.emit({ type: 'chainShot', id: o.id, x: o.x, z: o.z });
    }
  }
  // a critical blow or shot (a perfect dodge's reward): the multiplier once, then gone
  takeCrit() { const p = this.player; if (!(p.critT > 0)) return 1; p.critT = 0; return this.T.critMul ?? 3; }

  aliveCount() { let n = 0; for (const z of this.zombies) if (z.alive) n++; return n; }

  // Attack slots (spacing): the T.zombieEngage nearest standing zombies within 7 m may close in and attack; the others
  // hold a step back (zombies.js). A zombie keeps its slot over a slightly nearer rival (no flip-flopping), and loses it
  // while floored, so the next one steps up.
  updateEngagement() {
    const p = this.player, n = Math.max(1, Math.round(this.T.zombieEngage ?? 2)), cand = [];
    for (const z of this.zombies) {
      if (!z.alive || z.passive || z.dormant || z.down || z.state === ZS.EMERGE) continue;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (d < 7) cand.push([d - (this.engaged.has(z.id) ? 0.7 : 0), z.id]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    this.engaged = new Set(cand.slice(0, n).map((c) => c[1]));
  }

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
        if (d > 12 || d < 0.2 || z.buried) continue;
        const a = Math.abs(angleDiff(yaw, Math.atan2(dx, dz))) - Math.atan(ZR_HIT / d);
        if (a < maxBend && a < bestA && this.world.lineOfSight(m.x, m.z, z.x, z.z, BULLET_MIN_H)) { best = z; bestA = a; }
      }
      if (best) yaw = Math.atan2(best.x - m.x, best.z - m.z);
    }
    const r = this.traceBullet(m.x, m.z, yaw);
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    if (r.tank) { punctureTank(this, r.tank); this.emit({ type: 'shot', ox: m.x, oy: m.y, oz: m.z, ex: m.x + dx * r.t, ez: m.z + dz * r.t, hit: 'tank', yaw }); return; }
    { const ph = panelHit(this, m.x, m.z, dx, dz, r.t); if (ph) { joltFlood(this, ph.F); this.emit({ type: 'shot', ox: m.x, oy: m.y, oz: m.z, ex: m.x + dx * ph.t, ez: m.z + dz * ph.t, hit: 'wall', nx: -dx, nz: -dz, yaw }); return; } } // (the flood's panel: core/rooms.js)
    if (r.zombie?.o2 && r.zombie.loose?.o2 && this.rand() < O2.through) punctureTank(this, r.zombie.loose); // (through its rider into the cylinder)
    if (r.zombie) {
      this.stats.shotHits++;
      const z = r.zombie, along = (z.x - m.x) * dx + (z.z - m.z) * dz;
      const off = Math.hypot(m.x + dx * along - z.x, m.z + dz * along - z.z);
      // a perfect shot: through the middle of a standing zombie, not too far off, and every once in a while the
      // head comes clean off (one hit, one kill)
      const crit = z.shieldBlocks(dx, dz) ? 1 : this.takeCrit(); // (a perfect dodge's critical round; never spent on his shield)
      const perfect = z.kind !== 'guard' && !z.down && !z.crawling && !z.severed.has('Head') && !z.shieldBlocks(dx, dz) && ((off < 0.16 && along < 11 && this.rand() < (this.T.headshotChance ?? 0)) || crit > 1);
      if (perfect) z.limbHp.Head = 0;
      if (crit > 1) this.emit({ type: 'crit', id: z.id, x: z.x, z: z.z, weapon: 'pistol' });
      const res = z.takeHit(this.T.pistolDamage * crit, dx, dz, this.T.pistolKnockback * (perfect ? 1.6 : 1) * (crit > 1 ? 1.8 : 1), 'pistol', this, perfect ? 'Head' : this.bulletPart(z, m.x, m.z, dx, dz));
      if (perfect) { this.stats.headshots = (this.stats.headshots || 0) + 1; this.emit({ type: 'headshot', id: z.id, x: z.x, z: z.z }); if (this.T.hitPause > 0) this.emit({ type: 'hitPause', dur: this.T.hitPause * 1.6 }); }
      this.emit({ type: 'shot', ox: m.x, oy: m.y, oz: m.z, ex: m.x + dx * r.t, ez: m.z + dz * r.t, ey: z.down || z.crawling ? 0.25 : undefined, hit: 'zombie', id: z.id, yaw, killed: !z.alive, blocked: res === 'blocked' }); // (ey: a body on the floor, the round goes down into it)
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
      if (r.tank) { punctureTank(this, r.tank); pellets.push({ ex, ez, hit: 'tank' }); continue; }
      { const ph = panelHit(this, m.x, m.z, dx, dz, r.t); if (ph) { joltFlood(this, ph.F); pellets.push({ ex: m.x + dx * ph.t, ez: m.z + dz * ph.t, hit: 'wall', nx: -dx, nz: -dz }); continue; } }
      if (r.zombie?.o2 && r.zombie.loose?.o2 && this.rand() < O2.through * 0.6) punctureTank(this, r.zombie.loose);
      if (r.zombie) {
        const fall = r.t <= S.falloffFrom ? 1 : Math.max(0.33, 1 - ((r.t - S.falloffFrom) / (S.range - S.falloffFrom)) * 0.67);
        let h = hits.get(r.zombie);
        if (!h) hits.set(r.zombie, (h = { dmg: 0, px: 0, pz: 0, parts: [] }));
        h.dmg += T.shotgunDamage * fall; h.px += dx * fall; h.pz += dz * fall;
        h.parts.push([this.bulletPart(r.zombie, m.x, m.z, dx, dz, true), T.shotgunDamage * fall]);
        pellets.push({ ex, ez, ey: r.zombie.down || r.zombie.crawling ? 0.25 : undefined, hit: 'zombie', id: r.zombie.id });
      } else pellets.push({ ex, ez, hit: r.wall ? 'wall' : 'none', nx: r.nx, nz: r.nz });
    }
    const killed = [], blocked = [];
    let crit = 1;
    if (hits.size && [...hits.keys()].some((z) => { const h = hits.get(z), pl = Math.hypot(h.px, h.pz) || 1; return !z.shieldBlocks(h.px / pl, h.pz / pl); })) crit = this.takeCrit();
    for (const [z, h] of hits) {
      this.stats.shotHits++;
      const pl = Math.hypot(h.px, h.pz) || 1;
      if (crit > 1) { h.dmg *= crit * 0.7; for (const q of h.parts) q[1] *= crit * 0.7; this.emit({ type: 'crit', id: z.id, x: z.x, z: z.z, weapon: 'shotgun' }); }
      if (z.takeHit(h.dmg, h.px / pl, h.pz / pl, (T.shotgunKnockback * pl) / S.pellets * (crit > 1 ? 1.4 : 1), SHOTGUN, this, h.parts) === 'blocked') blocked.push(z.id);
      if (!z.alive) killed.push(z.id);
    }
    let closest = 99, closestId = -1; for (const z of hits.keys()) { const d = Math.hypot(z.x - p.x, z.z - p.z); if (d < closest) { closest = d; closestId = z.id; } }
    this.emit({ type: 'shotgun', ox: m.x, oy: m.y, oz: m.z, yaw: yaw0, pellets, hits: hits.size, killed, blocked, closest, closestId });
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
    let t = w ? w.t * range : range, zombie = null, tank = null;
    for (const z of this.zombies) {
      if (!z.alive || z.buried) continue;
      const h = rayCircle(ox, oz, dx, dz, t, z.x, z.z, ZR_HIT);
      if (h >= 0 && h < t) { t = h; zombie = z; }
    }
    for (const L of this.loose || []) { // (an oxygen cylinder in the way: core/loose.js O2)
      if (!L.o2 || L.gone) continue; const q = tankPos(L, _a);
      const h = rayCircle(ox, oz, dx, dz, t, q.x, q.z, O2.hitR);
      if (h >= 0 && h < t) { t = h; tank = L; zombie = null; }
    }
    return { t, zombie, tank, wall: !zombie && !tank && !!w, nx: w?.nx, nz: w?.nz };
  }

  // Gentle melee assist: at swing start, turn up to ~20 degrees toward a zombie that is within reach,
  // roughly in front (50 degrees) and not behind a wall. The turn is real (the body rotates), so the
  // bat still has to meet the body for a hit.
  meleeAssist(p, reach = 1.45, downToo = false) {
    let best = null, bestA = 0.87;
    for (const z of this.zombies) {
      if (!z.alive || z.buried || (z.down && !downToo)) continue;
      const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz);
      if (d > reach || d < 0.2) continue;
      const a = Math.abs(angleDiff(p.aimYaw, Math.atan2(dx, dz)));
      if (a < bestA && this.world.lineOfSight(p.x, p.z, z.x, z.z, 0.9)) { best = z; bestA = a; }
    }
    if (!best) return null;
    const want = angleDiff(p.aimYaw, Math.atan2(best.x - p.x, best.z - p.z));
    return { target: best, turn: Math.max(-0.35, Math.min(0.35, want)) }; // (the player eases this turn in over the windup)
  }

  // the zombie on the floor (knocked down or crawling) to strike down at: in reach (1.9 m), within ~50 degrees of the aim,
  // in sight, and nearer than anything standing in that cone
  groundTarget(p, reach = 1.9) {
    let best = null, bd = 1e9, up = 1e9;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz);
      if (d > reach || Math.abs(angleDiff(p.aimYaw, Math.atan2(dx, dz))) > 0.9 || !this.world.lineOfSight(p.x, p.z, z.x, z.z, 0.5)) continue;
      if (z.down || z.crawling) { if (d < bd) { bd = d; best = z; } } else up = Math.min(up, d);
    }
    return best && bd < up ? best : null;
  }

  // ---------------- axe: swept between simulation steps ----------------
  resolveMelee(p, t0, t1, act) {
    if (!act.roomsDone && (this.cracked?.length || this.floods?.length)) { // (once a swing: core/rooms.js)
      act.roomsDone = true;
      const sx = p.x + Math.sin(p.aimYaw) * 1.05, sz = p.z + Math.cos(p.aimYaw) * 1.05;
      for (const C of crackedNear(this, sx, sz, CRACK.near + 0.35)) { if (p.equipped === 'sledgehammer') breakWall(this, C, Math.sin(p.aimYaw), Math.cos(p.aimYaw), 'sledge'); else this.emit({ type: 'wallClank', id: C.id, x: sx, z: sz }); }
      for (const F of this.floods || []) if (Math.hypot(F.panel.x - sx, F.panel.z - sz) < FLOOD.panelReach) joltFlood(this, F);
    }
    if (t1 <= t0) return;
    const SUB = 4, T = this.T, A = p.atk(act), G = A.geom || AXE_GEOM, fist = p.equipped === FISTS || A.kind === 'fist';
    let prev = meleeWorldSegment(p, A, t0, _a);
    let px = prev.tx, pz = prev.tz;
    { const w0 = this.world.raycast(p.x, p.z, px, pz, 0.9); if (w0) { px = p.x + (px - p.x) * w0.t; pz = p.z + (pz - p.z) * w0.t; } }
    // a wall only stops the attack when she swings INTO it (a wall straight ahead, within the bat's reach); a wall
    // beside her (a corridor) just stops the bat where it meets it, and the rest of the arc still lands
    if (act.facingWall === undefined) act.facingWall = !!this.world.raycast(p.x, p.z, p.x + Math.sin(p.aimYaw) * 0.85, p.z + Math.cos(p.aimYaw) * 0.85, 0.9);
    for (let s = 1; s <= SUB; s++) {
      const t = t0 + ((t1 - t0) * s) / SUB;
      if (t > act.activeEnd) break;
      const seg = meleeWorldSegment(p, A, t, _b);
      const wall = this.world.raycast(p.x, p.z, seg.tx, seg.tz, 0.9);
      let tipX = seg.tx, tipZ = seg.tz;
      if (wall) {
        tipX = p.x + (seg.tx - p.x) * wall.t; tipZ = p.z + (seg.tz - p.z) * wall.t;
        if (!act.clanked && act.facingWall) { act.clanked = true; act.activeEnd = t; this.emit({ type: 'batClank', x: tipX, z: tipZ, nx: wall.nx, nz: wall.nz }); }
      }
      const f = G.hitFrom / G.length;
      const ax = seg.hx + (tipX - seg.hx) * f, az = seg.hz + (tipZ - seg.hz) * f;
      const ay = seg.hy + (seg.ty - seg.hy) * f;
      // sweep: test the damaging section at this substep AND the arc chord the tip travelled.
      // Only a bat at body height counts: the swing's low dip past the knees does not land a blow.
      const chop = A.style === 'chop';
      for (const z of this.zombies) {
        if (!z.alive || z.buried || act.hitSet.has(z.id)) continue;
        if (z.down && !chop) continue; // only the chop comes down far enough to hit a body on the floor
        const low = z.down || z.crawling;
        const rr = low ? 0.42 : BAT_BODY_R + (fist ? G.radius : 0); // the visible torso (a body on the floor: its width)
        const minY = low ? 0.05 : A.minY ?? (chop ? 0.3 : fist ? 0.25 : BAT_MIN_HIT_Y); // (a test-arena attack sets its own) // (a crawler is struck as it rises at her)
        // a body on the floor is long (2026-10-18): a crawler's head and arms reach out ahead of it, a floored one lies back
        // from where it fell; both points count, so a blow coming down on any of it lands
        const fwd = z.crawling ? 0.45 : z.down ? -0.55 : 0, bx = z.x + Math.sin(z.yaw) * fwd, bz = z.z + Math.cos(z.yaw) * fwd;
        let near = false;
        for (const [cx, cz] of fwd ? [[z.x, z.z], [bx, bz]] : [[z.x, z.z]]) {
          const h1 = segPointDist2(ax, az, tipX, tipZ, cx, cz);
          const y1 = ay + (seg.ty - ay) * h1.t;
          const d1 = y1 >= minY && (!low || y1 < 0.75) ? h1.d2 : 1e9; // (low: the weapon has to come down to it)
          const d2 = seg.ty >= minY && (!low || seg.ty < 0.75) ? segPointDist2(px, pz, tipX, tipZ, cx, cz).d2 : 1e9;
          if (Math.min(d1, d2) <= rr * rr) { near = true; break; }
        }
        // the arms: a standing zombie reaches toward her, and a bat through the reaching arms is a hit too
        if (!near && !z.down && !z.crawling && z.armsLost < 2) {
          const ox = z.x + Math.sin(z.yaw) * ARM_REACH, oz = z.z + Math.cos(z.yaw) * ARM_REACH, ar = ARM_R + (fist ? G.radius : 0);
          const e1 = segPointDist2(ax, az, tipX, tipZ, ox, oz), ey = ay + (seg.ty - ay) * e1.t;
          near = (ey >= minY && e1.d2 <= ar * ar) || (seg.ty >= minY && segPointDist2(px, pz, tipX, tipZ, ox, oz).d2 <= ar * ar);
        }
        if (!near) continue;
        // walls block strikes (seen from her, or from where the bat is)
        if (!this.world.lineOfSight(p.x, p.z, z.x, z.z, 0.9) && !this.world.lineOfSight(tipX, tipZ, z.x, z.z, 0.9)) continue;
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
          const dmgF = T.fistDamage * A.dmg, blk = !A.legs && z.shieldBlocks(dx, dz);
          if (A.legs && this.rand() < 0.35) z.cripple(this.rand() < 0.5 ? 'LowerLeg_L' : 'LowerLeg_R', this); // (the slide tackle: sometimes a leg breaks)
          z.takeHit(dmgF, dx, dz, T.fistKnockback * A.knock, 'fist', this, 'torso', A.style);
          this.emit({ type: 'batHit', id: z.id, x: z.x, z: z.z, dirX: dx, dirZ: dz, killed: !z.alive, combo: act.combo, style: A.style, fist: true, shield: blk });
          if (T.meleeHitPause > 0) this.emit({ type: 'hitPause', dur: T.meleeHitPause * 0.5 * (z.alive ? 1 : 1.3) });
          continue;
        }
        const critM = z.shieldBlocks(dx, dz) ? 1 : this.takeCrit(); // (a perfect dodge's critical blow)
        if (critM > 1) this.emit({ type: 'crit', id: z.id, x: z.x, z: z.z, weapon: 'melee' });
        const dmg = T.axeDamage * A.dmg * critM, lethal = z.hp <= dmg, r = this.rand(), sv = A.sever;
        // (a leg attack goes in under the guard's shield and always finds the shins)
        const side = this.rand() < 0.5 ? '_L' : '_R', shielded = z.shieldBlocks(dx, dz); // (a blow on the guard's shield cuts nothing; a low one too: the panel reaches the floor)
        const kind = A.kind || (p.equipped === BAT ? 'bat' : 'axe'); // (a test-arena attack names its own: bat = blunt, axe = blade)
        const headOk = z.kind !== 'guard' || z.enraged; // (the guard's head only once both arms are gone)
        const part = shielded ? 'torso' : A.legs ? 'LowerLeg' + side : lethal && headOk && r < sv.head ? 'Head'
          : r < (lethal ? sv.head : 0) + sv.arm ? 'Forearm' + side
          : sv.leg && r < (lethal ? sv.head : 0) + sv.arm + sv.leg ? 'LowerLeg' + side : 'torso';
        if (part !== 'torso' && !z.severed.has(part)) { if (kind === 'bat') z.cripple(part, this); else z.limbHp[part] = 0; } // the blade goes through; a bat breaks the leg
        const last = act.ground || act.leg || act.combo === p.attacks.length - 1, holding = !last && p.attackHeld;
        z.takeHit(dmg, dx, dz, T.axeKnockback * A.knock * (holding ? 0.45 : 1), kind, this, part, holding ? 'combo' : A.style);
        this.emit({ type: 'batHit', id: z.id, x: z.x, z: z.z, dirX: dx, dirZ: dz, killed: !z.alive, combo: act.combo, style: A.style, weapon: A.kind ? kind : p.equipped, shield: shielded });
        if (T.meleeHitPause > 0) this.emit({ type: 'hitPause', dur: T.meleeHitPause * (z.alive ? 1 : 1.3) * (last ? 1.25 : 0.8) });
      }
      px = tipX; pz = tipZ;
    }
  }
}

export { ZS, PISTOL, SHOTGUN };
