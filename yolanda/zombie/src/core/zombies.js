// Zombie behaviour: emerge -> chase (flow field + separation) -> telegraphed attack -> recover.
// Hits put them in stagger with collision-aware knockback that navigation does not override.
import { approachAngle, angleDiff } from './world.js';
import { isMelee } from './weapons.js';

let nextId = 1;
const _flow = { x: 0, z: 0 }, _steer = { x: 0, z: 0, k: 1 };

export const ZS = { EMERGE: 'emerge', CHASE: 'chase', WINDUP: 'windup', STRIKE: 'strike', RECOVER: 'recover', STAGGER: 'stagger', KNOCKDOWN: 'knockdown', GETUP: 'getup', DYING: 'dying', DEAD: 'dead', STUCK: 'stuck' };
// Knocked flat by the bat: fall (thrown back, rolls onto the stomach), then get up. The get-up clip
// starts turned ~155 degrees from where the fall ends, so the facing turns with it.
export const KNOCKDOWN_FALL = 1.3, KNOCKDOWN_GETUP = 2.0, GETUP_YAW = -2.705;
// The two attacks. lunge: the long reach (starts from ~1 m, steps in as it strikes). scratch: both arms raked down from
// above (Quaternius UAL2 Zombie_Scratch), quicker to come but short and wide; a zombie that gets inside ~0.9 m uses it.
// from: the distance it starts from; range / arc (half-angle, rad): what the strike reaches (also the floor telegraph).
export const ZATTACKS = {
  lunge: { from: 1.0, range: 1.12, arc: 0.95, strike: 0.14, recover: 0.55, step: 0.9 },
  scratch: { from: 0.92, range: 0.98, arc: 1.25, strike: 0.13, recover: 0.62, step: 0.35 },
  // the big guard's leap-slam (render/clipchars.js SLAM, 2026-10-18): a long wind-up, the tell to dodge (he sinks behind
  // his shield and holds the crouch, then leaps at 'takeoff' of it, floats and drops); the smash lands a wide area in front
  // of him and knocks Yola flat; then a slow recovery (the opening to hit him). windup = the clip's frames 1-77 at 30 fps
  slam: { from: 2.4, range: 2.1, arc: 1.0, strike: 0.15, recover: 1.1, step: 0, windup: 2.53, leap: 1.4, takeoff: 0.58 },
  // the pounce (2026-10-17, the user: "a lunge attack you can dodge"; Quaternius UAL2 Zombie_Bite): from 1.7-3.2 m a
  // standing zombie rears back (the wind-up, a long narrow wedge on the floor; it stops turning after `lock` of it), then
  // leaps along that line and bites whatever it reaches. Committed: a side-step or Yola's dodge beats it, and a miss
  // leaves it stumbling (the long recovery is the opening). range: the wedge (the leap plus the bite's reach).
  pounce: { min: 1.7, from: 3.2, range: 3.3, arc: 0.32, windup: 0.75, lock: 0.6, strike: 0.32, leapMax: 2.5, bite: 0.55, recover: 0.95, cd: 5, chance: 0.4, step: 0 },
};
// how a standing zombie walks (render/clipchars.js ZombieView): 'shamble' the Mixamo zombie walk, 'ual' Quaternius's
// zombie walk in eight directions (it side-steps when it circles her), 'run' Quaternius's zombie run, a runner (faster:
// RUNNER_SPEED). Picked from each zombie's phase; the sprinter and the guard keep their own.
// The big guard's fight (2026-10-18, the user: "his shield should completely block attacks that strike it ... the slam
// damages his shield; my positioning lets me damage him"). Nothing that strikes the shield hurts it or him; only his own
// leap-slams do: the first drives it into the floor, a big crack, and it sticks there (stuck s: he heaves at it, his body
// open above it); the second shatters it, frame and all (reel s: he reels, open). Before it breaks his body cannot be
// taken below floor x his health (a flank or the stuck window wears him down to there; at the floor he goes for the slam).
// Broken, the shatter leaves him at most broken x his health, and every hit after that moves him one stage on, never two
// (stages: an arm at the shoulder below each fraction, at least stageGap s apart; both gone: enraged, he charges as the
// lady does), and the killing blow takes his head. turn: rad/s he turns to face her (slow: strafing round him works).
export const GUARD = { armHp: Infinity, headHp: 35, rageSpeed: 1.6, stuck: 2.6, reel: 1.7, floor: 0.3, broken: 0.55, stages: [0.36, 0.18], stageGap: 0.35, turn: 1.7, front: 0.42 };
// the lady's burst (PROGRESS.md plan): however she dies, she swells for a beat (swell, s into her dying) and pops: Yola
// knocked down inside knock m, staggered to stagger m; an acid pool (radius r) that hurts Yola dps for dur s, then dissolves.
// Zombies walk through it (it only steams around their feet).
export const LADY = { swell: 0.3, knock: 2.0, stagger: 3.5, acid: { r: 1.5, dur: 5, dps: 6 } };
export const GAITS = { runnerShare: 0.15, ualShare: 0.45 };
export const RUNNER_SPEED = 2.5; // (x zombieSpeed: ~2.5 m/s, Yola runs 3.3; the run clip's own pace is ~4 m/s, slower looked like slow motion)
// Zombie kinds (multipliers on the tuning values; r: body radius in metres).
//  sprinter (the big lady): once she sees Yola she charges, faster than Yola can run, but she turns slowly at speed, so a
//    late side-step sends her past and she has to brake and come round; running into a wall, a prop or another zombie at
//    speed trips her: she stumbles back onto her backside and has to get up. Takes a couple more bullets.
//  guard (the big guard): slow, hits very hard, takes many more bullets, barely pushed by blows and rarely floored. He
//    carries a broken-off hospital-bed panel as a shield (assets/shield, the user's v2 package): blows and bullets from
//    the front (within ~70 degrees of where he faces) hit the shield instead of him. It cracks (hairline, then heavy) and
//    breaks after SHIELD_HP of shield damage; melee wrecks it fastest (x1.5), bullets least (x0.7). Broken, he staggers
//    and is open: every hit lands. From the side or behind, the shield never helps him.
export const KINDS = {
  normal: { hp: 1, speed: 1, dmg: 1, knock: 1, kd: 1, stagger: 1, r: 0.32 },
  sprinter: { hp: 1.5, speed: 1, dmg: 1.1, knock: 0.85, kd: 1, stagger: 0.85, r: 0.41 },
  guard: { hp: 2.6, speed: 0.6, dmg: 1.8, knock: 0.4, kd: 0.25, stagger: 0.55, r: 0.42 },
};
// (2026-10-17, the user: "more progression of the shield breaking ... I don't get a chance to see the cracks": 190 hp and
// 0.62 / 0.3 stages went intact -> heavy -> broken in three bat blows. Now four bat or axe blows (intact, hairline,
// hairline, heavy, broken), 3 close shotgun blasts, ~12 pistol rounds; each new stage throws chips: shieldCrack)
export const SHIELD_HP = 270;
export const SHIELD_MUL = { melee: 1.5, fist: 0.8, shotgun: 0.9, pistol: 0.7 };
export const shieldState = (z) => !z.shieldMax ? 'none' : z.shieldHp <= 0 ? 'break' : z.shieldHp / z.shieldMax > 0.78 ? 'intact' : z.shieldHp / z.shieldMax > 0.4 ? 'hairline' : 'heavy';
export const TUMBLE_FALL = 1.3, TUMBLE_GETUP = 1.9;
const PERSONAL = 1.05; // m a waiting zombie keeps between itself and its neighbours // the sprinter's trip: down onto her back, then up (no turn)

export class Zombie {
  constructor(x, z, yaw, opts) {
    this.id = nextId++;
    this.kind = opts.kind || 'normal'; this.K = KINDS[this.kind] || KINDS.normal;
    this.x = x; this.z = z; this.yaw = yaw; this.r = this.K.r;
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
    this.side = ((this.phase * 7.31) % 1) * 2 - 1; // its own approach side, -1..1 (from the phase: deterministic)
    this.swayRate = 0.9 + ((this.phase * 3.7) % 1) * 0.7;
    this.struck = false;
    // dismemberment: limb health; a limb at 0 comes off at the elbow / knee / neck
    this.limbHp = { Head: 45, Forearm_L: 30, Forearm_R: 30, LowerLeg_L: 40, LowerLeg_R: 40 };
    // the big guard's progression (PROGRESS.md gore plan, the user 2026-10-15): the shield, then one arm (at the shoulder),
    // the other arm, then ENRAGED (faster, charges like the lady), and only then the head, quickly
    if (this.kind === 'guard') Object.assign(this.limbHp, { Forearm_L: GUARD.armHp, Forearm_R: GUARD.armHp, Head: Infinity });
    this.slams = 0; this.stageT = -9; // (the guard: slams landed, when his last gore stage came)
    this.enraged = false; this.burst = false; // (burst: the lady has popped)
    this.severed = new Set(); this.crawling = false; this.lastHitPart = 'torso'; this.toCrawl = false;
    this.hitStyle = ''; this.bumpT = 0;
    this.attack = 'lunge'; // the attack being wound up / struck
    this.holdR = 2.0 + ((this.phase * 5.17) % 1) * 0.7; // waiting its turn: how far back it stands
    this.repoT = 0; this.repoDir = 0; this.repoWait = 1 + ((this.phase * 2.3) % 1) * 1.5; // waiting: short walks along the ring
    this.sprinting = false; this.spd = 0; this.spotT = 0; this.braking = false; this.chargeHit = false; this.fall = '';
    this.slamCd = 1.5; // the guard's slam cooldown
    this.pounceCd = 1 + ((this.phase * 9.13) % 1) * 2; // (the first pounce a little after it closes in, staggered across a group)
    { const g = opts.gait || ((this.phase * 13.7) % 1 < GAITS.runnerShare ? 'run' : (this.phase * 13.7) % 1 < GAITS.runnerShare + GAITS.ualShare ? 'ual' : 'shamble');
      this.gait = this.kind === 'normal' ? g : 'shamble'; }
    this.shieldHp = this.shieldMax = this.kind === 'guard' ? SHIELD_HP : 0; // the sprinter's charge (sprinterChase); fall: 'tumble' when she trips
  }
  get armsLost() { return (this.severed.has('Forearm_L') ? 1 : 0) + (this.severed.has('Forearm_R') ? 1 : 0); }

  sever(part, dirX, dirZ, sim) {
    if (this.severed.has(part)) return;
    this.severed.add(part);
    sim.emit({ type: 'sever', id: this.id, part, dirX, dirZ, x: this.x, z: this.z });
    if (part === 'Head') this.hp = 0;
    else if (part.startsWith('LowerLeg') && !this.crawling) this.crawling = this.toCrawl = true; // falls, then crawls
    if (this.kind === 'guard' && part.startsWith('Forearm')) {
      if (part === 'Forearm_L' && this.shieldHp > 0) { this.shieldHp = 0; sim.emit({ type: 'shieldBreak', id: this.id, x: this.x, z: this.z, dirX, dirZ, kind: 'drop' }); } // (his shield arm: the shield goes with it)
      if (this.armsLost >= 2 && !this.enraged) { // both arms gone: enraged, and the head can go now
        this.enraged = true; this.limbHp.Head = GUARD.headHp; this.speedMul *= GUARD.rageSpeed; this.attackCd = Math.min(this.attackCd, 0.3);
        sim.emit({ type: 'guardEnraged', id: this.id, x: this.x, z: this.z });
      }
    }
  }

  // a leg broken (a bat or a slide tackle at its shins): it stays on, but the zombie goes down and crawls from then on
  cripple(part, sim) {
    if (this.crawling || !this.alive || this.severed.has(part)) return;
    this.limbHp[part] = Math.max(1, this.limbHp[part]); // (kept: nothing to cut off)
    this.crawling = this.toCrawl = true; this.broken = part;
    sim.emit({ type: 'legBreak', id: this.id, part, x: this.x, z: this.z });
  }
  set(state, dur = 0) { this.state = state; this.t = 0; this.stateDur = dur; }
  // does his shield take a blow travelling along (dirX, dirZ)? Only from the front, only while he holds it up
  // (stuck: it is down in the floor in front of him, his body above it is open)
  shieldBlocks(dirX, dirZ) {
    if (!(this.shieldHp > 0) || !this.alive || this.down || this.state === ZS.STUCK) return false;
    return -(dirX * Math.sin(this.yaw) + dirZ * Math.cos(this.yaw)) > GUARD.front;
  }
  // his shield takes his own slam (the only thing that damages it): the first lodges it in the floor, cracked; the second
  // shatters it, every piece of it
  slamShield(sim) {
    if (!(this.shieldHp > 0)) return;
    this.slams++;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), x = this.x + fx * 0.75, z = this.z + fz * 0.75;
    if (this.slams === 1) {
      this.shieldHp = this.shieldMax * 0.3; // (heavy: the big crack)
      this.set(ZS.STUCK, GUARD.stuck); this.vx = this.vz = 0;
      sim.emit({ type: 'shieldCrack', id: this.id, x, z, dirX: -fx, dirZ: -fz, state: 'heavy', slam: true });
      sim.emit({ type: 'shieldStuck', id: this.id, x, z, dur: GUARD.stuck });
    } else {
      this.shieldHp = 0;
      this.hp = Math.min(this.hp, this.maxHp * GUARD.broken);
      this.hitDirX = -fx * 0.3; this.hitDirZ = -fz * 0.3; // (the pieces burst out where it struck)
      this.set(ZS.STAGGER, GUARD.reel); this.attackCd = Math.max(this.attackCd, GUARD.reel + 0.4); this.hitKind = 'slam'; this.hitStyle = 'shield';
      sim.emit({ type: 'shieldBreak', id: this.id, x, z, dirX: fx, dirZ: fz, kind: 'slam' });
    }
  }
  get alive() { return this.state !== ZS.DYING && this.state !== ZS.DEAD; }
  get down() { return this.state === ZS.KNOCKDOWN || this.state === ZS.GETUP; }

  // Incoming hit: direction (unit) and strength in m/s; part: 'torso', a severable limb, or (shotgun)
  // a list of [part, damage] for every pellet. style: the axe attack (swing / heavy / chop).
  takeHit(dmg, dirX, dirZ, impulse, kind, sim, part = 'torso', style = '') {
    if (!this.alive) return;
    const wasDown = this.down, melee = isMelee(kind);
    const parts = Array.isArray(part) ? part : [[part, dmg]];
    // the guard's shield takes a frontal blow: it stops it completely (no harm to it or to him: only his slams damage it);
    // he is shoved a little and flinches behind it. A hard blow rocks him back a step, but nothing stops a slam once begun.
    if (this.shieldBlocks(dirX, dirZ)) {
      this.kx += dirX * impulse * 0.3 * this.K.knock; this.kz += dirZ * impulse * 0.3 * this.K.knock;
      this.hitDirX = dirX; this.hitDirZ = dirZ; this.hitStrength = impulse * 0.4; this.hitSeq++; this.hitKind = kind; this.hitStyle = 'shield'; this.hitFlash = 0.25;
      if (melee && this.state === ZS.CHASE) this.set(ZS.STAGGER, 0.28);
      else if (melee && this.state === ZS.WINDUP && this.attack !== 'slam') this.set(ZS.STAGGER, 0.35);
      sim.emit({ type: 'shieldHit', id: this.id, x: this.x, z: this.z, dirX, dirZ, kind, state: shieldState(this) });
      return 'blocked';
    }
    const limbMul = kind === 'shotgun' ? 1.35 : melee ? 1.2 : 1;
    let loss = 0, main = 'torso', mainD = 0;
    for (let [pt, d] of parts) {
      if (pt !== 'torso' && this.severed.has(pt)) pt = 'torso';
      if (pt.startsWith('LowerLeg') && this.kind !== 'normal') pt = 'torso'; // (the big two never lose a leg: PROGRESS.md gore plan)
      // a bullet in a walker's leg takes it off half the time (the user, 2026-10-17: "randomly shoot a leg off")
      if (pt.startsWith('LowerLeg') && (kind === 'pistol' || kind === 'shotgun') && this.limbHp[pt] > 0 && sim.rand() < (sim.T.legShotChance ?? 0.5)) this.limbHp[pt] = Math.min(this.limbHp[pt], d * limbMul * 0.99);
      if (pt !== 'torso' && this.broken !== pt) { // (a broken leg stays on: a blunt blow never cuts)
        this.limbHp[pt] -= d * limbMul;
        if (this.limbHp[pt] <= 0) this.sever(pt, dirX, dirZ, sim);
      }
      loss += pt.startsWith('Forearm') ? d * 0.6 : d; // arm hits are less deadly
      if (d > mainD) { mainD = d; main = pt; }
    }
    this.lastHitPart = main;
    let cut = null; // (the guard: the arm this hit takes)
    if (this.kind === 'guard') { // his fight's stages (GUARD)
      const M = this.maxHp, after = this.hp - loss;
      if (this.shieldHp > 0) { // shield up: his body only down to the floor, and there he goes for his slam
        if (after <= M * GUARD.floor) { loss = Math.max(0, this.hp - M * GUARD.floor); this.slamCd = Math.min(this.slamCd, 0.4); }
      } else {
        const next = GUARD.stages[this.armsLost], soon = sim.time - this.stageT < GUARD.stageGap;
        if (next != null && after < M * next) { // this hit crosses a stage: an arm (never two in one hit)
          if (soon) loss = Math.max(0, this.hp - M * next);
          else {
            const nn = GUARD.stages[this.armsLost + 1];
            loss = Math.min(loss, this.hp - (nn != null ? M * nn + 1 : 1));
            const fromLeft = -(dirX * Math.cos(this.yaw) - dirZ * Math.sin(this.yaw)) > 0;
            cut = main.startsWith('Forearm') ? main : fromLeft ? 'Forearm_L' : 'Forearm_R';
            if (this.severed.has(cut)) cut = cut === 'Forearm_L' ? 'Forearm_R' : 'Forearm_L';
            this.stageT = sim.time;
          }
        } else if (after <= 0 && soon) loss = this.hp - 1; // (the killing blow waits for the last stage to be seen)
      }
    }
    this.hp -= loss;
    if (cut) this.sever(cut, dirX, dirZ, sim);
    if (this.kind === 'guard' && this.hp <= 0 && !(this.shieldHp > 0) && !this.severed.has('Head')) { this.lastHitPart = 'Head'; this.sever('Head', dirX, dirZ, sim); sim.emit({ type: 'guardFinished', id: this.id, x: this.x, z: this.z }); } // the finishing blow: his head
    const push = (wasDown ? 0.3 : 1) * this.K.knock; // a body on the floor barely slides (a heavy one barely moves)
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
    if (wasDown || this.state === ZS.STUCK) { sim.emit({ type: 'zombieHit', id: this.id, kind }); return; } // (stuck: he takes it, heaving at the shield)
    // the sprinter caught mid-charge by a melee blow or a shotgun blast: her own speed takes her down (the trip)
    if (this.sprinting && this.spd > 2.0 && (melee || kind === 'fist' || kind === 'shotgun')) { this.tumble(sim, 'hit'); sim.emit({ type: 'zombieHit', id: this.id, kind }); return; }
    // knocked flat: the axe (the chop most of all), or a close shotgun blast that lifts them off their feet
    const T = sim.T;
    const fist = kind === 'fist';
    const kd = style === 'legs' ? 1 : fist ? (style === 'kick' ? 0.55 : 0) : melee ? (style === 'combo' ? 0 : style === 'chop' ? Math.max(0.75, T.axeKnockdown) : style === 'heavy' ? Math.min(1, T.axeKnockdown + 0.25) : T.axeKnockdown)
      : kind === 'shotgun' ? Math.min(1, Math.max(0, (impulse - 3.5) / 3)) : 0;
    if (this.toCrawl || (!this.crawling && kd > 0 && sim.rand() < kd * this.K.kd)) { this.knockDown(dirX, dirZ, sim); return; }
    this.sprinting = false; this.spd = 0; // a hit breaks a charge
    // Any hit interrupts a windup (rewarding a timely shot); heavier hits stagger longer.
    const dur = (fist ? (style === 'kick' ? 0.8 : 0.5) : melee ? 0.95 : kind === 'shotgun' ? Math.min(0.85, 0.3 + impulse * 0.1) : 0.26) * this.K.stagger;
    if (this.state !== ZS.STAGGER || dur > this.stateDur - this.t) this.set(ZS.STAGGER, dur);
    this.attackCd = Math.max(this.attackCd, melee || kind === 'shotgun' ? 0.9 : fist ? 0.7 : 0.35);
    sim.emit({ type: 'zombieHit', id: this.id, kind });
  }

  knockDown(dirX, dirZ, sim) {
    this.fall = ''; this.sprinting = false; this.spd = 0;
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

  // Crowd steering on top of the path to Yola: its own approach side (a group fans out instead of filing in a line), a
  // slow shambling sway, look-ahead avoidance of the zombies in its way (slowing to queue behind one that is busy
  // attacking or staggered), and close to Yola, spreading around her rather than stacking up on one side.
  // (wx, wz): the path heading (unit). Returns the new heading and a speed factor.
  steer(wx, wz, dist, los, sim) {
    const out = _steer; let k = 1;
    const far = Math.min(1, Math.max(0, (dist - 1.6) / 3.5)); // 0 close in (it must still reach her) .. 1 from 5 m
    const ang = (los ? this.side * 0.45 * far : 0) + Math.sin(sim.time * this.swayRate + this.phase * 6.283) * 0.2 * (0.3 + 0.7 * far);
    const c = Math.cos(ang), s = Math.sin(ang);
    let hx = wx * c + wz * s, hz = -wx * s + wz * c;
    const lx = hz, lz = -hx; // perpendicular to the heading
    const p = sim.player, myA = Math.atan2(this.x - p.x, this.z - p.z), avoid = los ? 1.5 : 0.9;
    let ax = 0, az = 0;
    for (const o of sim.zombies) {
      if (o === this || !o.solid || !o.alive) continue;
      const rx = o.x - this.x, rz = o.z - this.z, d2 = rx * rx + rz * rz;
      if (d2 > 2.4 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), along = rx * hx + rz * hz;
      if (along > 0) { // ahead: in the way if within a body width of its line
        const lat = rx * lx + rz * lz, clear = this.r + o.r + 0.14;
        if (Math.abs(lat) < clear) {
          const w = (1 - d / 1.55) * (1 - Math.abs(lat) / clear);
          const sg = Math.abs(lat) > 0.03 ? -Math.sign(lat) : this.id & 1 ? 1 : -1; // pass on the side it is not on
          ax += lx * sg * w * avoid; az += lz * sg * w * avoid;
          if (o.state !== ZS.CHASE && d < 1.0) k = Math.min(k, 0.3 + 0.5 * d); // queue behind a busy one
        }
      }
      // around Yola: two closing in from nearly the same side drift apart around her
      if (dist < 2.8) {
        const od = Math.hypot(o.x - p.x, o.z - p.z);
        if (od < 2.8) {
          const da = angleDiff(Math.atan2(o.x - p.x, o.z - p.z), myA);
          if (Math.abs(da) < 0.75) {
            const tx = Math.cos(myA), tz = -Math.sin(myA), sg = da === 0 ? (this.id & 1 ? 1 : -1) : Math.sign(da); // tangent around her
            const w = (1 - Math.abs(da) / 0.75) * 0.9;
            ax += tx * sg * w; az += tz * sg * w;
          }
        }
      }
    }
    hx += ax; hz += az;
    // never steered backwards off the path
    const fwd = hx * wx + hz * wz;
    if (fwd < 0.2) { hx += wx * (0.2 - fwd); hz += wz * (0.2 - fwd); }
    const l = Math.hypot(hx, hz) || 1;
    out.x = hx / l; out.z = hz / l; out.k = k;
    return out;
  }

  // The sprinter's charge. Returns true while it owns her movement (heading and speed set here). She spots Yola (in sight,
  // 2.4-12 m), stops for a beat (the scream: sprinterSpot), then accelerates to a full sprint along her facing and runs
  // straight through: reaching Yola at speed is the hit (a hard shove), and she keeps going. At speed she turns slowly
  // (sprinterTurn), so a late side-step makes her miss and overshoot; past Yola she brakes over a few metres and comes
  // round slowly (the opening to hit her), then charges again, or, close in, falls back on the normal attacks. Running into
  // a wall or a prop at speed trips her (update: tumble); another zombie in her path is bowled over.
  sprinterChase(dt, sim, dx, dz, dist) {
    const T = sim.T, p = sim.player, top = (T.sprinterSpeed ?? 3.9) * this.speedMul;
    const sees = !p.dead && dist < 12 && sim.world.lineOfSight(this.x, this.z, p.x, p.z, 0.5);
    if (!this.sprinting) {
      if (!sees || dist < 2.4 || this.attackCd > 0.3) { this.spotT = 0; return false; }
      if (this.spotT === 0) sim.emit({ type: 'sprinterSpot', id: this.id });
      this.spotT += dt;
      // the wind-up: she plants, squares up to Yola and roars (the lane on the floor shows where she will run)
      this.yaw = approachAngle(this.yaw, Math.atan2(dx, dz), 4 * dt);
      if (this.spotT < (T.sprinterWindup ?? 0.7)) return true;
      this.sprinting = true; this.spd = Math.max(this.spd, 1.0); this.braking = false; this.chargeHit = false;
      this.yaw = Math.atan2(dx, dz); // the line is set here: she never steers again until she has stopped
    }
    const off = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
    if (p.dead || dist > 14 || (!sees && dist > 3)) { this.sprinting = false; this.spotT = 0; this.spd = 0; return false; } // lost her
    if (!this.braking && off > 1.4 && dist < 3.5) { this.braking = true; if (!this.chargeHit) sim.specialMiss?.(this, 'charge'); } // ran past her
    let turn;
    if (this.braking) {
      this.spd = Math.max(0, this.spd - 6 * dt); turn = this.spd < 1.2 ? 1.3 : 0; // brakes hard in a straight line, then comes round slowly
      if (this.spd < 0.6 && off < 0.6) { // stopped and facing her again: a breather, then a fresh wind-up (never a second run without one)
        this.braking = false; this.chargeHit = false; this.sprinting = false; this.spotT = 0; this.spd = 0;
        this.attackCd = dist < 2.4 ? 0 : 0.9; return false;
      }
    } else {
      this.spd = Math.min(top, this.spd + 5.5 * dt);
      turn = 0; // committed: a straight line, no homing (a side-step at any point beats her)
    }
    this.yaw = approachAngle(this.yaw, Math.atan2(dx, dz), turn * dt);
    // the charge hit: into Yola at speed (once per pass); she runs on through
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
    if (!this.chargeHit && !this.braking && this.spd > 2.4 && along > -0.1 && along < this.r + p.r + 0.2 && Math.abs(lat) < this.r + p.r - 0.1) {
      this.chargeHit = true; this.braking = true; // she runs on past and brakes
      // the shove: Yola thrown aside off her path (and along it), so the charge goes by instead of pinning her
      const sg = lat >= 0 ? 1 : -1;
      if (p.hurt(T.zombieDamage * 1.3 * this.K.dmg, this.x, this.z, sim) && !p.dead) p.knockDown(this.x - fz * sg * 0.6, this.z + fx * sg * 0.6, sim); // knocked flat, thrown off her path
      sim.emit({ type: 'sprinterHit', id: this.id });
    }
    if (this.spd > 2.2) { // bowling: another zombie in her path at speed
      for (const o of sim.zombies) {
        if (o === this || !o.solid || !o.alive) continue;
        const rx = o.x - this.x, rz = o.z - this.z, d = Math.hypot(rx, rz);
        if (d < this.r + o.r + 0.08 && rx * fx + rz * fz > 0.1) { o.bumped(this.spd * 0.75, rx / (d || 1), rz / (d || 1), sim); this.tumble(sim, 'zombie'); break; }
      }
    }
    return this.sprinting;
  }
  // tripped at speed: she stumbles back and sits down hard (a zombie in the way: half the time she only staggers)
  tumble(sim, what) {
    if (!this.alive || this.down) return;
    this.sprinting = false; this.spd = 0; this.vx = this.vz = 0; this.spotT = 0;
    if (what === 'zombie' && sim.rand() < 0.5) { this.set(ZS.STAGGER, 0.6); sim.emit({ type: 'zombieBump', id: this.id, speed: 2 }); return; }
    if (what === 'wall' && !this.chargeHit) sim.specialMiss?.(this, 'charge'); // (dodged into a wall)
    this.fall = 'tumble'; this.solid = false;
    this.set(ZS.KNOCKDOWN, TUMBLE_FALL);
    sim.emit({ type: 'zombieTumble', id: this.id, what });
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
        if ((this.kind === 'sprinter' || this.enraged) && !this.crawling && !this.passive && this.sprinterChase(dt, sim, dx, dz, dist)) { turnRate = 0; break; } // (the enraged guard charges as she does)
        if (this.kind === 'guard' && !this.enraged) turnRate = GUARD.turn; // (slow to turn: strafing round his shield works)
        speed = (wantX || wantZ) ? T.zombieSpeed * this.speedMul * (this.crawling ? 0.32 : this.gait === 'run' ? RUNNER_SPEED : 1) : 0;
        if (speed > 0) { const s = this.steer(wantX, wantZ, dist, los, sim); wantX = s.x; wantZ = s.z; speed *= s.k; }
        // Waiting its turn (spacing): a zombie without an attack slot stops a step back from her (at its own distance),
        // facing her, and now and then takes a few steps along the ring away from the nearest other zombie, so a group
        // spreads around her instead of piling in. It closes in when a slot frees (one ahead of it falls or is floored).
        const waiting = !this.passive && los && sim.engaged && !sim.engaged.has(this.id) && !this.crawling && this.kind !== 'sprinter'; // (a sprinter never waits)
        if (waiting && dist < this.holdR + 0.5 && speed > 0) {
          const a = Math.atan2(this.x - p.x, this.z - p.z), rx = Math.sin(a), rz = Math.cos(a); // rx, rz: away from her
          if (this.repoT > 0) {
            this.repoT -= dt;
            const e = Math.max(-1, Math.min(1, dist - this.holdR)); // keep to its ring while it walks
            wantX = Math.cos(a) * this.repoDir - rx * e * 0.6; wantZ = -Math.sin(a) * this.repoDir - rz * e * 0.6;
            speed = T.zombieSpeed * this.speedMul * 0.5;
          } else {
            wantX = dx / (dist || 1); wantZ = dz / (dist || 1);
            speed *= Math.max(0, Math.min(1, (dist - this.holdR) / 0.5)); // eases to a stop at its spot
            // personal space (2026-10-16: waiting zombies stood shoulder to shoulder, 0.65 m apart, and read as one mass): it
            // keeps about a metre from its neighbours by sliding along its ring (and a little back), never toward her
            let sx = 0, sz = 0;
            for (const o of sim.zombies) {
              if (o === this || !o.alive || !o.solid) continue;
              const ox = this.x - o.x, oz = this.z - o.z, d = Math.hypot(ox, oz);
              if (d < PERSONAL && d > 1e-4) { const w = (PERSONAL - d) / PERSONAL; sx += (ox / d) * w; sz += (oz / d) * w; }
            }
            if (sx || sz) {
              const tx = Math.cos(a), tz = -Math.sin(a), tang = sx * tx + sz * tz, out = Math.max(0, sx * rx + sz * rz) * 0.5;
              const mx = tx * tang + rx * out, mz = tz * tang + rz * out, ml = Math.hypot(mx, mz);
              if (ml > 0.04) { wantX = mx / ml; wantZ = mz / ml; speed = T.zombieSpeed * this.speedMul * 0.45 * Math.min(1, ml * 2.5); }
            }
            if ((this.repoWait -= dt) <= 0) {
              let near = null, nd = 9;
              for (const o of sim.zombies) {
                if (o === this || !o.alive || !o.solid) continue;
                const d = Math.hypot(o.x - this.x, o.z - this.z); if (d < nd) { nd = d; near = o; }
              }
              this.repoDir = near && nd < 2.2 ? (angleDiff(a, Math.atan2(near.x - p.x, near.z - p.z)) > 0 ? -1 : 1) : (sim.rand() < 0.5 ? -1 : 1);
              this.repoT = 0.5 + sim.rand() * 0.6; this.repoWait = 1.4 + sim.rand() * 2.2;
            }
          }
        } else {
          this.repoT = 0;
          if (dist < 1.25) speed *= 0.5; // close in carefully, no jitter at contact
          if (dist < 0.8) speed = 0; // in reach: it stands and waits for its turn rather than pushing into her
        }
        // Attack (pacing): only a zombie with a slot, in reach, facing her, and only once the floor's attack turn comes
        // round (each attack started holds the next one off by zombieAttackGap). Inside ~0.9 m it scratches.
        const slot = !sim.engaged || sim.engaged.has(this.id) || this.crawling || this.kind === 'sprinter';
        if (this.kind === 'guard' && !this.enraged && this.shieldHp > 0 && !this.passive && slot && (this.slamCd -= dt) <= 0 && dist > 0.6 && dist < ZATTACKS.slam.from && this.attackCd <= 0 &&
            sim.time >= (sim.nextAttackT || 0) && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.5 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) {
          this.attack = 'slam'; this.set(ZS.WINDUP, ZATTACKS.slam.windup); this.slamCd = 4 + sim.rand() * 2.5;
          sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75) * 1.5;
          sim.emit({ type: 'zombieWindup', id: this.id, attack: 'slam' });
          break;
        }
        // the pounce: from further out, now and then (it decides once per cooldown; declined, it closes in as usual)
        const PO = ZATTACKS.pounce;
        if (this.kind === 'normal' && !this.crawling && !this.passive && slot && (this.pounceCd -= dt) <= 0 && dist > PO.min && dist < PO.from && this.attackCd <= 0 &&
            sim.time >= (sim.nextAttackT || 0) && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.5 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) {
          if (sim.rand() < (T.pounceChance ?? PO.chance)) {
            this.attack = 'pounce'; this.set(ZS.WINDUP, T.pounceWindup ?? PO.windup); this.pounceCd = PO.cd + sim.rand() * 4;
            sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75) * 1.4;
            sim.emit({ type: 'zombieWindup', id: this.id, attack: 'pounce' });
            break;
          }
          this.pounceCd = 1.5 + sim.rand() * 1.5;
        }
        if (!this.passive && slot && sim.time >= (sim.nextAttackT || 0) && dist < ZATTACKS.lunge.from && this.attackCd <= 0 &&
            Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.7 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) {
          const armed = this.armsLost < 2 && !this.crawling; // no arms (a bite) or crawling: the plain lunge
          this.attack = armed && (dist < 0.85 || (dist < ZATTACKS.scratch.from && sim.rand() < 0.25)) ? 'scratch' : 'lunge';
          this.set(ZS.WINDUP, this.attack === 'scratch' ? T.scratchWindup ?? 0.42 : T.zombieWindup ?? 0.62);
          sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75) * (0.8 + sim.rand() * 0.5);
          sim.emit({ type: 'zombieWindup', id: this.id, attack: this.attack });
        }
        break;
      }
      case ZS.WINDUP:
        turnRate = this.attack === 'slam' ? (this.t < this.stateDur * ZATTACKS.slam.takeoff ? 1.6 : 0) : this.attack === 'pounce' ? (this.t < this.stateDur * ZATTACKS.pounce.lock ? 3 : 0) : 2.5; wantX = dx; wantZ = dz; // keep tracking slowly: stepping aside works (the slam commits once he leaps, the pounce a moment before it leaps)
        if (this.attack === 'slam' && this.t > this.stateDur * ZATTACKS.slam.takeoff) { // the leap forward: as far as she was when he left the floor (the shield lands a step short of her), at most leap
          if (this.leapL == null) this.leapL = Math.max(0, Math.min(ZATTACKS.slam.leap, dist - 1.05));
          const L = this.leapL / (this.stateDur * (1 - ZATTACKS.slam.takeoff)); this.vx = Math.sin(this.yaw) * L; this.vz = Math.cos(this.yaw) * L;
        } else if (this.attack === 'slam') this.leapL = null;
        if (this.t >= this.stateDur) {
          this.set(ZS.STRIKE, ZATTACKS[this.attack].strike); this.struck = false;
          if (this.attack === 'pounce') { // the leap: as far as she was (a body short of her), never further than leapMax
            const PO = ZATTACKS.pounce, L = Math.max(1.0, Math.min(PO.leapMax, dist - 0.45)) / PO.strike;
            this.vx = Math.sin(this.yaw) * L; this.vz = Math.cos(this.yaw) * L;
            sim.emit({ type: 'zombiePounce', id: this.id });
          }
        }
        break;
      case ZS.STRIKE: {
        turnRate = 0;
        const Z = ZATTACKS[this.attack];
        if (this.attack === 'pounce') { // airborne along its line: the bite lands on the first frame she is within reach in front of it
          if (!this.struck && !p.dead) {
            const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
            if (along > -0.1 && along < Z.bite + p.r && lat < this.r + p.r && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) {
              this.struck = true; this.vx *= 0.25; this.vz *= 0.25; // (lands on her: no sliding through)
              const hit = p.hurt(T.zombieDamage * 1.25 * this.K.dmg * (1 - 0.3 * this.armsLost), this.x, this.z, sim);
              sim.emit({ type: hit ? 'zombieStrikeHit' : 'zombieStrikeMiss', id: this.id, attack: 'pounce' });
            }
          }
          if (this.t >= this.stateDur) {
            if (!this.struck) sim.emit({ type: 'zombieStrikeMiss', id: this.id, attack: 'pounce' });
            this.set(ZS.RECOVER, Z.recover * (this.struck ? 0.8 : 1.15)); // (a miss stumbles longer: the opening)
          }
          break;
        }
        if (!this.struck) {
          this.struck = true;
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          const along = dx * fx + dz * fz;
          const ang = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
          const hit = !p.dead && dist < Z.range && along > 0 && ang < Z.arc && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5);
          // losing arms leaves a weaker claw (both gone: a bite); crawlers hit low and weaker
          const dmg = (this.attack === 'scratch' ? T.scratchDamage ?? 8 : this.attack === 'slam' ? T.zombieDamage * 1.3 : T.zombieDamage) * this.K.dmg;
          if (hit && p.hurt(dmg * (1 - 0.3 * this.armsLost) * (this.crawling ? 0.7 : 1), this.x, this.z, sim) && this.attack === 'slam' && !p.dead) p.knockDown(this.x, this.z, sim);
          if (this.attack === 'slam') sim.emit({ type: 'zombieSlam', id: this.id, x: this.x + Math.sin(this.yaw) * 1.1, z: this.z + Math.cos(this.yaw) * 1.1, hit, second: this.slams >= 1 });
          sim.emit({ type: hit ? 'zombieStrikeHit' : 'zombieStrikeMiss', id: this.id, attack: this.attack });
          if (this.attack === 'slam' && !hit) sim.specialMiss?.(this, 'slam'); // (dodged: core/sim.js specialMiss)
          if (this.attack === 'slam' && this.shieldHp > 0) { this.slamShield(sim); break; } // (his shield into the floor: stuck, or in pieces)
        }
        this.vx = Math.sin(this.yaw) * Z.step; this.vz = Math.cos(this.yaw) * Z.step; // steps into it
        if (this.t >= this.stateDur) this.set(ZS.RECOVER, Z.recover);
        break;
      }
      case ZS.STUCK: // the guard heaving at his shield, lodged in the floor (slamShield): then he wrenches it free
        turnRate = 0; this.vx = this.vz = 0;
        if (this.t >= this.stateDur) { this.set(ZS.RECOVER, 0.95); this.attackCd = Math.max(this.attackCd, 1.4); this.slamCd = Math.max(this.slamCd, 3.5); sim.emit({ type: 'shieldFree', id: this.id }); }
        break;
      case ZS.RECOVER:
        turnRate = 2;
        if (this.t >= this.stateDur) { this.set(ZS.CHASE); this.attackCd = 0.6 + sim.rand() * 0.6; }
        break;
      case ZS.STAGGER:
        turnRate = 0;
        if (this.t >= this.stateDur) this.set(ZS.CHASE);
        break;
      case ZS.KNOCKDOWN:
        turnRate = 0;
        if (this.t >= this.stateDur && this.fall === 'tumble') { this.set(ZS.GETUP, TUMBLE_GETUP); break; } // (on her back: up the way she faces)
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
        if (this.t >= this.stateDur) { this.set(ZS.CHASE); this.fall = ''; this.attackCd = Math.max(this.attackCd, 0.5); }
        break;
      case ZS.DYING:
        // the lady pops: a beat into her death (her swell), wherever and however she died, carrying her momentum
        if (this.kind === 'sprinter' && !this.burst && this.t >= LADY.swell) { this.burst = true; sim.ladyBurst(this); }
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
    if (this.state === ZS.CHASE && (this.sprinting || this.spotT > 0)) { // the charge: along her facing at her own speed
      const k = Math.min(1, dt * 10), sp = this.sprinting ? this.spd : 0, tx = Math.sin(this.yaw) * sp, tz = Math.cos(this.yaw) * sp;
      this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    } else if (this.state === ZS.CHASE) {
      // walk mostly where we face: turning zombies slow down instead of sliding sideways
      const face = Math.max(0, Math.cos(angleDiff(this.yaw, Math.atan2(wantX, wantZ))));
      const s = speed * (0.35 + 0.65 * face);
      const tx = Math.sin(this.yaw) * s, tz = Math.cos(this.yaw) * s;
      const k = Math.min(1, dt * 6);
      this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    } else if (this.state !== ZS.STRIKE && this.state !== ZS.EMERGE && !(this.state === ZS.WINDUP && this.attack === 'slam')) {
      const k = Math.min(1, dt * 10);
      this.vx -= this.vx * k; this.vz -= this.vz * k;
    }

    // integrate: locomotion + knockback (knockback decays with friction; dying bodies slide less far)
    const fr = Math.exp(-dt * (this.state === ZS.DYING ? 5 : 7));
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    this.kx *= fr; this.kz *= fr;
    if (this.state !== ZS.DEAD) {
      const bx = this.x, bz = this.z;
      const hitWall = world.resolveCircle(this, this.r);
      if (hitWall && this.sprinting && this.spd > 2.2) { // ran into a wall or a prop at speed: she trips
        const nx = this.x - bx, nz = this.z - bz, nl = Math.hypot(nx, nz);
        if (nl > 1e-5 && (this.vx * nx + this.vz * nz) / (nl * this.spd) < -0.45) this.tumble(sim, 'wall');
      }
      if (hitWall && (this.kx || this.kz)) {
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
