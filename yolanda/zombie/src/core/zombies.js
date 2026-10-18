// Zombie behaviour: emerge -> chase (flow field + separation) -> telegraphed attack -> recover.
// Hits put them in stagger with collision-aware knockback that navigation does not override.
import { approachAngle, angleDiff } from './world.js';
import { IV_CARRY, LOOSE } from './loose.js';
import { isMelee } from './weapons.js';

let nextId = 1;
const _flow = { x: 0, z: 0 }, _steer = { x: 0, z: 0, k: 1 };

export const ZS = { EMERGE: 'emerge', CHASE: 'chase', WINDUP: 'windup', STRIKE: 'strike', RECOVER: 'recover', STAGGER: 'stagger', KNOCKDOWN: 'knockdown', GETUP: 'getup', DYING: 'dying', DEAD: 'dead', STUCK: 'stuck', PICKUP: 'pickup' };
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
  // (2026-10-18, the user: walkers "more interesting than zombies that simply shamble into me ... short, readable lunging
  // attacks with anticipation, commitment, and recovery"): the pounce is also how a zombie waiting its turn in the ring
  // attacks (no attack slot needed, one pounce at a time, still in the floor's turn order), so the pressure comes from
  // different sides rather than from the two in front
  pounce: { min: 1.3, from: 3.2, range: 3.3, arc: 0.32, windup: 0.75, lock: 0.6, strike: 0.32, leapMax: 2.5, bite: 0.55, recover: 0.95, cd: 4.5, chance: 0.45, step: 0 },
  // the runner's dash rake (2026-10-18, the user's fast orange variant: "a different attack ... a distinct feel beyond
  // simply speeding up the ordinary walker"): from min-from m it plants for the wind-up (arms up behind it, turning to her
  // until lock of it, a long narrow wedge on the floor), then sprints straight through where she stood (dist m in strike
  // s), raking with both arms as it passes (the scratch over its running legs); it overshoots and skids (recover). Hit and
  // run: a side step beats it, and the skid is the opening.
  dash: { min: 2.0, from: 4.6, range: 3.6, arc: 0.2, windup: 0.45, lock: 0.7, strike: 0.5, dist: 3.6, reach: 0.5, recover: 0.85, cd: 2.6, step: 0 },
  // the guard after his arm tore off (GUARD): 'flail' his one arm swung wildly, wide and quick, chained (UAL Sword_Regular
  // A / B, empty-handed); 'club' the torn arm swung as a weapon, longer and harder, a heavy one floors her
  // the big lady close in (2026-10-18, the Butcher brief: "she has some attacks when you're close"): a heavy two-handed smash
  // that throws Yola back out of reach (often floored), where her charge is the threat again
  smash: { from: 2.1, range: 1.75, arc: 1.3, windup: 0.62, strike: 0.18, recover: 0.75, step: 0.8, dmg: 1.35, kd: 0.5 },
  flail: { from: 1.55, range: 1.65, arc: 1.5, windup: 0.36, strike: 0.16, recover: 0.32, step: 0.6, dmg: 0.75 },
  club: { from: 2.0, range: 2.15, arc: 1.15, windup: 0.5, strike: 0.18, recover: 0.55, step: 0.7, dmg: 1.25, kd: 0.4 },
};
// how a standing zombie walks (render/clipchars.js ZombieView): 'shamble' the Mixamo zombie walk, 'ual' Quaternius's
// zombie walk in eight directions (it side-steps when it circles her), 'run' Quaternius's zombie run, a runner (faster:
// RUNNER_SPEED). Picked from each zombie's phase; the sprinter and the guard keep their own.
// The big guard's fight (2026-10-18, the user: "his shield should completely block attacks that strike it"; then, after
// playing: "make it seem like he is trying to pull it out of the ground... it stays completely stuck... and the process makes
// his arm pull off. then his game play is him swinging his remaining arm wildly... he picks up his torn arm with his other
// hand and swings his arm as a weapon"). Nothing that strikes the shield hurts it or him. His leap-slam drives it into the
// floor for good (the only slam he gets): stuck s of heaving at it, his body open above it, his body never below floor x his
// health while he still holds it; the last heave tears his shield arm off at the shoulder (the arm stays gripping the planted
// shield) and he reels back (reel s), left at most tear x his health. Then he flails his one arm (ZATTACKS.flail); after
// pickupAfter s, or below pickupHp, he goes back to the shield, pulls his arm off its grip (pickup s, it is his from grab of
// it) and swings it as a club (ZATTACKS.club) to the end; the killing blow takes his head. turn: rad/s he turns to face her.
// (2026-10-18, the user: "move a little faster and smoother.. not so jerky and jittery"): stageSpeed scales his walk by stage
// (wild and lurching once his shield arm is gone); spin: how hard his turn eases in and out (he turns on an angular speed
// that builds and settles, never a fixed-rate snap). clubWear: his torn arm comes apart after this much use (a blow that
// lands 1, a miss 0.4): he flails one-armed from then on (guardClubBreak)
export const GUARD = { headHp: 35, stuck: 3.4, heave: 0.5, reel: 1.25, floor: 0.3, tear: 0.62, pickupAfter: 5.5, pickupHp: 0.42, pickup: 1.3, grab: 0.55, turn: 1.7, front: 0.42, armHp: Infinity,
  rageSpeed: 1.3, stageSpeed: { shield: 1, onearm: 1.3, club: 1.15 }, spin: 5, clubWear: 3 };
// the lady's burst (PROGRESS.md plan): however she dies, she swells for a beat (swell, s into her dying) and pops: Yola
// knocked down inside knock m, staggered to stagger m; an acid pool (radius r) that hurts Yola dps for dur s, then dissolves.
// Zombies walk through it (it only steams around their feet).
export const LADY = { swell: 0.3, knock: 2.0, stagger: 3.5, acid: { r: 1.5, dur: 5, dps: 6 } };
export const GAITS = { runnerShare: 0.1, ualShare: 0.65 }; // (2026-10-18: most walk the 8-way walk, which can step aside and back off facing her)
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
  runner: { hp: 0.75, speed: 1.2, dmg: 0.9, knock: 1.1, kd: 1.1, stagger: 1, r: 0.32 }, // the orange runner: quicker, lighter, frailer (its run: RUNNER_SPEED)
  sprinter: { hp: 1.5, speed: 1, dmg: 1.1, knock: 0.85, kd: 1, stagger: 0.85, r: 0.41 },
  guard: { hp: 2.6, speed: 0.8, dmg: 1.8, knock: 0.4, kd: 0.25, stagger: 0.55, r: 0.42 },
};
// (2026-10-17, the user: "more progression of the shield breaking ... I don't get a chance to see the cracks": 190 hp and
// 0.62 / 0.3 stages went intact -> heavy -> broken in three bat blows. Now four bat or axe blows (intact, hairline,
// hairline, heavy, broken), 3 close shotgun blasts, ~12 pistol rounds; each new stage throws chips: shieldCrack)
export const SHIELD_HP = 270;
export const SHIELD_MUL = { melee: 1.5, fist: 0.8, shotgun: 0.9, pistol: 0.7 };
export const shieldState = (z) => !z.shieldMax ? 'none' : z.shieldHp <= 0 ? 'break' : z.shieldHp / z.shieldMax > 0.78 ? 'intact' : z.shieldHp / z.shieldMax > 0.4 ? 'hairline' : 'heavy';
export const TUMBLE_FALL = 1.3, TUMBLE_GETUP = 1.9;
// out of the floor (2026-10-18, the user's part 3; core/sim.js spawnFromFloor): the floor rumbles and cracks for rumble s
// (it is still under the floor: nothing can touch it), then the tiles burst up into a breach (assets/props/floor_breach.glb)
// and it claws its way out (Quaternius UAL2 Zombie_Spawn) over climb s; it can be hit once its body is out (buriedFor of the
// climb), it is solid from solidAt, and it is a normal zombie when it stands
// (2026-10-18, the user: "the zombies crawling out of the ground don't feel good just yet"): a shorter, building rumble (the crack
// grows, the floor shudders and puffs dust, shudder s apart), then it bursts up through the tiles at once (render: the climb's
// first part played fast) and hauls itself out quicker
// A bed patient getting up out of its bed: the Animation Hub's patient_bed_rise (assets/zombie_moves/patient-bedrise.glb,
// AnimationHub/HUB_GUIDE.md "Patient bed rise"): lying on its back, a noise jolts its head up, it sits up, turns on its
// backside to the bed's side, scoots to the edge, perches, slides down to the floor (BED_RISE s, the clip's own walk after
// that is the game's). Its root never turns; its hips travel BED_PATH ([s, m to its right, m ahead], measured from the
// clip, from its rest hips) and the game moves the zombie along it, so the body and the zombie stay together. The bed
// stands where the hub had it: its centre BED_AT from the zombie's root (in the root's frame), turned a quarter left of
// it; it gets off on the side it faces. side -1: the whole thing mirrored (off the bed's other side, render mirrors it)
export const BED_RISE = 7.4;
// an execution's gore by weapon (core/player.js startExecution): the parts it takes off; the bat, the shotgun and the
// sledgehammer burst the whole body instead (main.js zombieDeath), the kick throws it (an impulse, above)
export const EXEC_GORE = { axe: ['Head', 'Forearm_L'], crowbar: ['Head'], knife: ['Head'], pistol: ['Head'] };
export const BED_AT = { x: -0.05, z: -0.29 };
export const BED_PATH = [[0, 0.001, -0.252], [3.8, 0.005, -0.252], [3.9, 0.015, -0.25], [4.0, 0.032, -0.243], [4.1, 0.056, -0.229], [4.2, 0.084, -0.211],
  [4.3, 0.115, -0.189], [4.4, 0.15, -0.165], [4.5, 0.185, -0.139], [4.6, 0.22, -0.113], [4.7, 0.254, -0.086], [4.8, 0.285, -0.059], [4.9, 0.312, -0.034],
  [5.0, 0.334, -0.012], [5.1, 0.35, 0.005], [5.2, 0.359, 0.015], [5.3, 0.36, 0.018], [6.1, 0.36, 0.026], [6.2, 0.36, 0.107], [6.3, 0.36, 0.215],
  [6.4, 0.36, 0.272], [6.5, 0.36, 0.278], [6.6, 0.359, 0.297], [6.7, 0.36, 0.341], [6.8, 0.36, 0.401], [6.9, 0.361, 0.459], [7.0, 0.361, 0.504],
  [7.1, 0.362, 0.517], [7.4, 0.368, 0.526]];
// where a bed patient's root is for its bed { x, z, yaw, side }: [x, z, yaw]
export function bedRoot(B) {
  const s = B.side || 1, yaw = B.yaw - s * Math.PI / 2, ax = s * BED_AT.x, az = BED_AT.z;
  return [B.x - (ax * Math.cos(yaw) + az * Math.sin(yaw)), B.z - (-ax * Math.sin(yaw) + az * Math.cos(yaw)), yaw];
}
// its hips' place along BED_PATH at t s, from its root
export function bedPathAt(B, t) {
  const s = B.side || 1, [rx, rz, yaw] = bedRoot(B);
  let i = 0; while (i < BED_PATH.length - 2 && BED_PATH[i + 1][0] <= t) i++;
  const a = BED_PATH[i], b = BED_PATH[i + 1], u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  const px = s * (a[1] + (b[1] - a[1]) * u), pz = a[2] + (b[2] - a[2]) * u;
  return [rx + px * Math.cos(yaw) + pz * Math.sin(yaw), rz - px * Math.sin(yaw) + pz * Math.cos(yaw)];
}
export const FLOOR_EMERGE = { rumble: 1.1, climb: 2.0, buriedFor: 0.18, solidAt: 0.45, shudder: 0.32 };
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
    this.gstage = this.kind === 'guard' ? 'shield' : ''; this.planted = null; this.tearT = 0; this.club = false; // (gstage: the guard's 'shield' -> 'onearm' -> 'club'; planted: where his shield stuck)
    this.enraged = false; this.burst = false; // (burst: the lady has popped)
    this.severed = new Set(); this.crawling = false; this.lastHitPart = 'torso'; this.toCrawl = false;
    this.hitStyle = ''; this.bumpT = 0;
    this.attack = 'lunge'; // the attack being wound up / struck
    this.holdR = 1.5 + ((this.phase * 5.17) % 1) * 0.6; // waiting its turn: how far back it stands (2026-10-18: closer, within a swing that steps in, not a queue at 2-2.7 m)
    this.repoT = 0; this.repoDir = 0; this.repoWait = 1 + ((this.phase * 2.3) % 1) * 1.5; // waiting: short walks along the ring
    this.sprinting = false; this.spd = 0; this.spotT = 0; this.braking = false; this.chargeHit = false; this.fall = '';
    this.slamCd = 1.5; // the guard's slam cooldown
    this.pounceCd = 1 + ((this.phase * 9.13) % 1) * 2; // (the first pounce a little after it closes in, staggered across a group)
    { const g = opts.gait || ((this.phase * 13.7) % 1 < GAITS.runnerShare ? 'run' : (this.phase * 13.7) % 1 < GAITS.runnerShare + GAITS.ualShare ? 'ual' : 'shamble');
      this.gait = this.kind === 'runner' ? 'run' : this.kind === 'normal' ? g : this.kind === 'guard' ? 'ual' : 'shamble'; } // (the guard: the shamble played near twice its own pace read as jitter; Quaternius's heavier walk at its own pace)
    this.dashCd = 0.8 + ((this.phase * 4.7) % 1) * 1.2;
    this.pouncer = (this.phase * 17.3) % 1 < 0.35; // (2026-10-18: about a third of the walkers pounce; the rest only swipe and bite)
    // the hospital's own (2026-10-18, the user): prop 'iv' walks dragging its drip stand (render: the stand rolls, its hand on
    // it), 'chair' has no legs and wheels itself after her (it only claws; a blow that floors it tips it out: a crawler from
    // then), 'surgeon' wears a theatre cap and mask, 'bed' lies in a bed until she comes close, then gets up out of it (bed:
    // { x, z, y, yaw } where it lies; the get-up: BED_RISE)
    this.prop = opts.prop || ''; this.bed = opts.bed || null; this.chair = this.prop === 'chair';
    this.layInBed();
    if (this.prop) this.pouncer = false;
    if (this.prop === 'iv' || this.prop === 'bed') this.gait = 'ual'; else if (this.chair) this.gait = 'shamble'; // (the shamble at their pace played ~3x its own: the user, 'does not correctly walk'; the 8-way walk at its own pace)
    if (this.chair) { this.r = LOOSE.chair.r; this.severed.add('LowerLeg_L'); this.severed.add('LowerLeg_R'); this.limbHp.LowerLeg_L = this.limbHp.LowerLeg_R = 0; }
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
  // its drip stand or wheelchair (core/loose.js), while it has it: the chair under it; the stand on its spring beside it,
  // let go through a fight, a flinch or a fall and taken again if still in reach, else left behind. Dead: it stays put.
  carryLoose(dt, sim) {
    const L = this.loose; if (!L || L.owner !== this.id) return;
    if (!this.alive || this.state === ZS.DYING || this.state === ZS.DEAD) { L.owner = 0; L.held = false; return; }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    if (L.kind === 'chair') {
      if (!this.chair) { L.owner = 0; L.held = false; return; }
      L.x = this.x + fx * 0.06; L.z = this.z + fz * 0.06; L.yaw = this.yaw; L.vx = this.vx; L.vz = this.vz; L.held = true; return;
    }
    const C = IV_CARRY, s = this.state, busy = s === ZS.WINDUP || s === ZS.STRIKE || s === ZS.RECOVER || s === ZS.STAGGER || s === ZS.KNOCKDOWN || s === ZS.GETUP || this.crawling;
    const sx = this.x + fx * C.fwd + lx * C.side, sz = this.z + fz * C.fwd + lz * C.side;
    if (busy) { L.held = false; return; }
    if (!L.held && Math.hypot(L.x - sx, L.z - sz) > C.reach) { L.owner = 0; return; } // (left behind: it walks on without it)
    L.held = true;
    L.vx += ((sx - L.x) * C.k - L.vx * C.damp) * dt; L.vz += ((sz - L.z) * C.k - L.vz * C.damp) * dt; L.x += L.vx * dt; L.z += L.vz * dt;
    const dx = L.x - sx, dz = L.z - sz, d = Math.hypot(dx, dz); if (d > C.arm) { L.x = sx + (dx / d) * C.arm; L.z = sz + (dz / d) * C.arm; }
    sim.world.resolveCircle(L, L.r);
  }
  layInBed() { if (this.bed) { [this.x, this.z] = bedPathAt(this.bed, 0); this.yaw = bedRoot(this.bed)[2]; } } // (lying in it as the hub laid it)
  set(state, dur = 0) { this.state = state; this.t = 0; this.stateDur = dur; }
  // nothing standing between it and her (a pounce never leaps through another zombie)
  clearLine(sim, dx, dz, dist) {
    const ux = dx / (dist || 1), uz = dz / (dist || 1);
    for (const o of sim.zombies) {
      if (o === this || !o.alive || !o.solid) continue;
      const rx = o.x - this.x, rz = o.z - this.z, along = rx * ux + rz * uz;
      if (along > 0.2 && along < dist - 0.3 && Math.abs(rx * uz - rz * ux) < this.r + o.r) return false;
    }
    return true;
  }
  // does his shield take a blow travelling along (dirX, dirZ)? Only from the front, only while he holds it up
  // (stuck: it is down in the floor in front of him, his body above it is open)
  shieldBlocks(dirX, dirZ) {
    if (!(this.shieldHp > 0) || !this.alive || this.down || this.state === ZS.STUCK) return false;
    return -(dirX * Math.sin(this.yaw) + dirZ * Math.cos(this.yaw)) > GUARD.front;
  }
  // his slam drives his shield into the floor for good (GUARD): it stays there, planted, and he heaves at it
  slamShield(sim) {
    if (!(this.shieldHp > 0) || this.planted) return;
    this.slams++;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), x = this.x + fx * 0.75, z = this.z + fz * 0.75;
    this.planted = { x, z, yaw: this.yaw, gx: this.x + fx * 0.42, gz: this.z + fz * 0.42 }; // (gx, gz: about where its grip is, his side of it)
    this.shieldHp = this.shieldMax * 0.3; // (the big crack)
    this.set(ZS.STUCK, GUARD.stuck); this.vx = this.vz = 0;
    sim.emit({ type: 'shieldCrack', id: this.id, x, z, dirX: -fx, dirZ: -fz, state: 'heavy', slam: true });
    sim.emit({ type: 'shieldStuck', id: this.id, x, z, dur: GUARD.stuck });
  }
  // the last heave: his shield arm comes off at the shoulder, still gripping the planted shield; he reels back from it
  tearArm(sim) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.shieldHp = 0; this.gstage = 'onearm'; this.tearT = sim.time;
    this.hp = Math.min(this.hp, this.maxHp * GUARD.tear);
    this.hitDirX = -fx; this.hitDirZ = -fz; this.hitKind = 'tear'; this.hitStyle = 'tear'; this.hitStrength = 2; this.hitSeq++; this.lastHitPart = 'Forearm_L';
    this.sever('Forearm_L', -fx, -fz, sim);
    this.set(ZS.STAGGER, GUARD.reel); this.attackCd = Math.max(this.attackCd, GUARD.reel + 0.3);
    this.kx -= fx * 1.6; this.kz -= fz * 1.6; // (he staggers back off it)
    sim.emit({ type: 'guardArmTorn', id: this.id, x: this.planted.x, z: this.planted.z });
  }
  get alive() { return this.state !== ZS.DYING && this.state !== ZS.DEAD; }
  get buried() { const F = this.floorSpawn; return !!F && this.state === ZS.EMERGE && this.t < F.rumble + F.climb * F.buriedFor; } // (under the floor still)
  get down() { return this.state === ZS.KNOCKDOWN || this.state === ZS.GETUP; }

  // Incoming hit: direction (unit) and strength in m/s; part: 'torso', a severable limb, or (shotgun)
  // a list of [part, damage] for every pellet. style: the axe attack (swing / heavy / chop).
  takeHit(dmg, dirX, dirZ, impulse, kind, sim, part = 'torso', style = '') {
    if (!this.alive) return;
    const wasDown = this.down, melee = isMelee(kind);
    const parts = Array.isArray(part) ? part : [[part, dmg]];
    // the guard's shield takes a frontal blow: it stops it completely (no harm to it or to him: only his slams damage it);
    // he is shoved a little and flinches behind it, never more.
    if (this.shieldBlocks(dirX, dirZ)) {
      this.kx += dirX * impulse * 0.3 * this.K.knock; this.kz += dirZ * impulse * 0.3 * this.K.knock;
      this.hitDirX = dirX; this.hitDirZ = dirZ; this.hitStrength = impulse * 0.4; this.hitSeq++; this.hitKind = kind; this.hitStyle = 'shield'; this.hitFlash = 0.25;
      // (no stagger: a blow on the panel only jolts him behind it, so hammering at the shield never stun-locks him out of
      // his advance or his slam; only his lunge's wind-up breaks on a hard blow)
      if (melee && this.state === ZS.WINDUP && this.attack !== 'slam') this.set(ZS.STAGGER, 0.35);
      sim.emit({ type: 'shieldHit', id: this.id, x: this.x, z: this.z, dirX, dirZ, kind, state: shieldState(this) });
      return 'blocked';
    }
    if (this.executable && sim.time < this.executable && (melee || kind === 'pistol' || kind === 'shotgun' || kind === 'fist')) { this.executed = true; this.executable = 0; } // (the execute: whatever she hits it with, it bursts: main.js zombieDeath)
    const limbMul = kind === 'shotgun' ? 1.35 : melee ? 1.2 : 1;
    let loss = 0, main = 'torso', mainD = 0;
    for (let [pt, d] of parts) {
      if (pt !== 'torso' && this.severed.has(pt)) pt = 'torso';
      if (pt.startsWith('LowerLeg') && this.kind !== 'normal') pt = 'torso'; // (the big two never lose a leg: PROGRESS.md gore plan)
      // a bullet in a walker's leg takes it off half the time (the user, 2026-10-17: "randomly shoot a leg off")
      if (pt.startsWith('LowerLeg') && (kind === 'pistol' || kind === 'shotgun') && this.limbHp[pt] > 0 && sim.rand() < (sim.T.legShotChance ?? 0.5) * (kind === 'shotgun' ? 0.45 : 1.2)) this.limbHp[pt] = Math.min(this.limbHp[pt], d * limbMul * 0.99); // (2026-10-18: a blast puts several pellets in the legs: each less likely to take one; measured crawlers per kill ~25-35%)
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
      }
    }
    if (this.executed) { loss = this.hp + 1; if (this.execWeapon === 'fists') impulse = Math.max(impulse, 15); } // (the kick: across the room)
    this.hp -= loss;
    if (this.executed && !this.execDone) { // the finisher's own gore by her weapon (EXEC_GORE); the bursts are the renderer's (main.js)
      this.execDone = true;
      for (const part of EXEC_GORE[this.execWeapon] || []) if (!this.severed.has(part)) this.sever(part, dirX, dirZ, sim);
    }
    if (cut) this.sever(cut, dirX, dirZ, sim);
    if (this.kind === 'guard' && this.hp <= 0 && !(this.shieldHp > 0) && !this.severed.has('Head')) { this.lastHitPart = 'Head'; this.sever('Head', dirX, dirZ, sim); sim.emit({ type: 'guardFinished', id: this.id, x: this.x, z: this.z }); } // the finishing blow: his head
    const push = (wasDown ? 0.3 : 1) * this.K.knock * (this.bed ? 0 : 1); // a body on the floor barely slides (a heavy one barely moves)
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
      if (this.executed) { const p = sim.player; p.hp = Math.min(p.maxHp, p.hp + (sim.T.execHeal ?? 5)); sim.emit({ type: 'execHit', id: this.id, weapon: this.execWeapon, x: this.x, z: this.z, dirX, dirZ }); }
      return;
    }
    if (wasDown || this.state === ZS.STUCK || this.bed) { sim.emit({ type: 'zombieHit', id: this.id, kind }); return; } // (in its bed or getting out of it: it takes the blow and keeps coming) // (stuck: he takes it, heaving at the shield)
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
    if (this.chair) { // (out of its wheelchair onto the floor; the chair goes over on its side and stays)
      this.chair = false; this.crawling = this.toCrawl = true; this.r = this.K.r;
      const L = this.loose; if (L) { L.owner = 0; L.held = false; L.tipped = true; L.r = LOOSE.tipped.r; L.x += dirX * 0.4; L.z += dirZ * 0.4; L.vx = dirX * 1.2; L.vz = dirZ * 1.2; L.tipSide = sim.rand() < 0.5 ? -1 : 1; }
      sim.emit({ type: 'chairTip', id: this.id, x: this.x, z: this.z, dirX, dirZ });
    }
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
    const T = sim.T, p = sim.player, top = (T.sprinterSpeed ?? 6.2) * this.speedMul;
    const sees = !p.dead && dist < 12 && sim.world.lineOfSight(this.x, this.z, p.x, p.z, 0.5);
    if (!this.sprinting) {
      if (!sees || dist < 2.6 || this.attackCd > 0.3) { this.spotT = 0; this.aimLocked = false; return false; } // (close in: her smash, not a charge)
      if (this.spotT === 0) sim.emit({ type: 'sprinterSpot', id: this.id });
      this.spotT += dt;
      // the wind-up: she plants, roars and aims, turning after Yola (the lane on the floor shows where she will run), until
      // the last sprinterLock s: her line is fixed there, and she goes along it whatever Yola does now (the moment to place
      // her: across a wall, the partition, another zombie)
      const W = T.sprinterWindup ?? 1.35, lockAt = W - (T.sprinterLock ?? 0.42);
      this.windupT = W;
      if (this.spotT < lockAt) this.yaw = approachAngle(this.yaw, Math.atan2(dx, dz), 2.6 * dt);
      else if (!this.aimLocked) { this.aimLocked = true; sim.emit({ type: 'sprinterLock', id: this.id }); }
      if (this.spotT < W) return true;
      this.sprinting = true; this.spd = Math.max(this.spd, 0.8); this.braking = false; this.chargeHit = false; this.aimLocked = false; // (her line: where she aimed it)
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
      this.spd = Math.min(top, this.spd + (T.sprinterAccel ?? 4.3) * dt); // (builds up: a lumbering start, then she is flying)
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
      if (!wake && D.sense && !D.locked && !p.dead) wake = dist < D.sense * (this.bed ? 1 : 0.5) || (dist < D.sense && world.lineOfSight(this.x, this.z, p.x, p.z, 1.0));
      if (wake) { // a normal zombie now, its first attack a beat away
        this.speedMul = D.speedMul; this.passive = false; this.dormant = null; this.attackCd = Math.max(this.attackCd, 1.1);
        sim.level?.onWake(this); sim.emit({ type: 'zombieWake', id: this.id });
        if (this.bed) { this.bedRise = true; this.set(ZS.EMERGE, BED_RISE); sim.emit({ type: 'bedRise', id: this.id }); } // (out of its bed: patient_bed_rise)
      }
    }
    let wantX = 0, wantZ = 0, speed = 0, turnRate = 5;

    switch (this.state) {
      case ZS.EMERGE:
        if (this.bedRise) { // out of the bed along the clip's own path (BED_PATH), its root's facing held
          [this.x, this.z] = bedPathAt(this.bed, this.t); this.vx = this.vz = 0; this.kx = this.kz = 0; turnRate = 0; this.yawV = 0;
          if (this.t >= this.stateDur) { this.bedRise = false; this.bed = null; this.set(ZS.CHASE); this.attackCd = Math.max(this.attackCd, 0.6); this.rGrow = 1; }
          break;
        }
        if (this.floorSpawn) { // out of the floor: in place, turning to face her as it climbs
          const F = this.floorSpawn; this.vx = this.vz = 0;
          if (!F.breached && Math.floor(this.t / FLOOR_EMERGE.shudder) !== Math.floor((this.t - dt) / FLOOR_EMERGE.shudder) && this.t < F.rumble) sim.emit({ type: 'floorShudder', id: this.id, x: this.x, z: this.z, k: this.t / F.rumble }); // (it is coming: harder each time)
          if (!F.breached && this.t >= F.rumble) { F.breached = true; sim.emit({ type: 'floorBreach', id: this.id, x: this.x, z: this.z }); }
          if (F.breached) { turnRate = 1.2; wantX = dx; wantZ = dz; }
          this.solid = this.t >= F.rumble + F.climb * F.solidAt;
          if (this.t >= this.stateDur) { this.set(ZS.CHASE); this.solid = true; this.attackCd = Math.max(this.attackCd, 0.7); }
          break;
        }
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
        if (this.kind === 'guard' && !this.enraged) turnRate = this.gstage === 'shield' ? GUARD.turn : 3.2; // (slow to turn behind his shield: strafing round it works; wild without it)
        if (this.kind === 'guard' && this.gstage === 'onearm' && this.planted && !this.armGone && !this.passive && (sim.time - this.tearT > GUARD.pickupAfter || this.hp < this.maxHp * GUARD.pickupHp)) { // back to the shield for his arm
          const P = this.planted, gx = P.gx - Math.sin(P.yaw) * 0.55 - this.x, gz = P.gz - Math.cos(P.yaw) * 0.55 - this.z, gd = Math.hypot(gx, gz);
          if (gd < 0.3) { this.set(ZS.PICKUP, GUARD.pickup); this.vx = this.vz = 0; sim.emit({ type: 'guardPickup', id: this.id }); break; }
          wantX = gx / gd; wantZ = gz / gd; speed = T.zombieSpeed * this.speedMul * 1.15;
          { const s = this.steer(wantX, wantZ, gd, true, sim); wantX = s.x; wantZ = s.z; speed *= s.k; }
          turnRate = 4; break;
        }
        speed = (wantX || wantZ) ? T.zombieSpeed * this.speedMul * (this.crawling ? 0.32 : this.gait === 'run' ? RUNNER_SPEED : 1) * (this.chair ? 0.72 : this.prop === 'iv' ? 0.8 : 1) * (this.kind === 'guard' && !this.enraged ? GUARD.stageSpeed[this.gstage] || 1 : 1) : 0;
        if (speed > 0) { const s = this.steer(wantX, wantZ, dist, los, sim); wantX = s.x; wantZ = s.z; speed *= s.k; }
        // Waiting its turn (spacing): a zombie without an attack slot stops a step back from her (at its own distance),
        // facing her, and now and then takes a few steps along the ring away from the nearest other zombie, so a group
        // spreads around her instead of piling in. It closes in when a slot frees (one ahead of it falls or is floored).
        const waiting = !this.passive && los && sim.engaged && !sim.engaged.has(this.id) && !this.crawling && this.kind !== 'sprinter'; // (a sprinter never waits)
        const holdR = this.holdR + Math.sin(sim.time * 0.9 * this.swayRate + this.phase * 6.283) * 0.3; // (the ring breathes: it edges in and backs off)
        this.backing = false;
        const sidestep = this.gait === 'ual' || this.gait === 'run'; // (the 8-way walk can step aside or back facing her; the shamble only walks forward)
        if (waiting && sidestep && dist < holdR - 0.35 && los) { // too close for a zombie waiting its turn (it landed a pounce): it backs off to its ring, facing her
          wantX = -dx / (dist || 1); wantZ = -dz / (dist || 1); speed = T.zombieSpeed * this.speedMul * 0.4; this.backing = true;
        } else if (waiting && dist < holdR + 0.5 && speed > 0) {
          const a = Math.atan2(this.x - p.x, this.z - p.z), rx = Math.sin(a), rz = Math.cos(a); // rx, rz: away from her
          if (this.repoT > 0) {
            this.repoT -= dt;
            const e = Math.max(-1, Math.min(1, dist - holdR)); // keep to its ring while it walks
            wantX = Math.cos(a) * this.repoDir - rx * e * 0.6; wantZ = -Math.sin(a) * this.repoDir - rz * e * 0.6;
            speed = T.zombieSpeed * this.speedMul * 0.5;
          } else {
            wantX = dx / (dist || 1); wantZ = dz / (dist || 1);
            speed *= Math.max(0, Math.min(1, (dist - holdR) / 0.5)); // eases to a stop at its spot
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
          if (sidestep && dist < 1.5 && !this.crawling) { // the two in front: never shoulder to shoulder; a short shuffle round her away from the other
            let sx = 0, sz = 0;
            for (const o of sim.zombies) { if (o === this || !o.alive || !o.solid) continue; const ox = this.x - o.x, oz = this.z - o.z, d = Math.hypot(ox, oz); if (d < 0.95 && d > 1e-4) { const w = (0.95 - d) / 0.95; sx += (ox / d) * w; sz += (oz / d) * w; } }
            const a = Math.atan2(this.x - p.x, this.z - p.z), tx = Math.cos(a), tz = -Math.sin(a), tang = sx * tx + sz * tz;
            if (Math.abs(tang) > 0.08) { wantX = tx * Math.sign(tang); wantZ = tz * Math.sign(tang); speed = T.zombieSpeed * this.speedMul * 0.4; this.backing = true; }
          }
          if (dist < (this.kind === 'normal' && !this.crawling ? 0.95 : 0.8) && !this.backing) speed = 0; // in reach: it stands and waits for its turn rather than pushing into her (a walker a body's width off, not hugging her)
        }
        // Attack (pacing): only a zombie with a slot, in reach, facing her, and only once the floor's attack turn comes
        // round (each attack started holds the next one off by zombieAttackGap). Inside ~0.9 m it scratches.
        const slot = !sim.engaged || sim.engaged.has(this.id) || this.crawling || this.kind === 'sprinter';
        if (this.kind === 'guard' && !this.enraged && this.shieldHp > 0 && !this.planted && !this.passive && slot && (this.slamCd -= dt) <= 0 && dist > 0.6 && dist < ZATTACKS.slam.from && this.attackCd <= 0 &&
            sim.time >= (sim.nextAttackT || 0) && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) { // (any facing: his wind-up turns him to her until he leaps, so circling him never switches his slam off)
          this.attack = 'slam'; this.set(ZS.WINDUP, ZATTACKS.slam.windup); this.slamCd = 4 + sim.rand() * 2.5;
          sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75) * 1.5;
          sim.emit({ type: 'zombieWindup', id: this.id, attack: 'slam' });
          break;
        }
        // the runner's dash rake (ZATTACKS.dash): its own attack from out of reach, in the floor's turn order, one at a time
        const DA = ZATTACKS.dash;
        if (this.kind === 'runner' && !this.crawling && !this.passive && (this.dashCd -= dt) <= 0 && dist > DA.min && dist < DA.from && this.attackCd <= 0 &&
            sim.time >= (sim.nextAttackT || 0) && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.6 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5) && this.clearLine(sim, dx, dz, dist) &&
            !sim.zombies.some((o) => o !== this && o.attack === 'dash' && (o.state === ZS.WINDUP || o.state === ZS.STRIKE))) {
          this.attack = 'dash'; this.set(ZS.WINDUP, T.dashWindup ?? DA.windup); this.dashCd = DA.cd + sim.rand() * 1.6;
          sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75) * 1.2;
          sim.emit({ type: 'zombieWindup', id: this.id, attack: 'dash' });
          break;
        }
        // the pounce: from further out, now and then (it decides once per cooldown; declined, it closes in as usual)
        const PO = ZATTACKS.pounce;
        if (this.kind === 'normal' && this.pouncer && !this.crawling && !this.passive && (slot || !sim.zombies.some((o) => o !== this && o.attack === 'pounce' && (o.state === ZS.WINDUP || o.state === ZS.STRIKE))) && (this.pounceCd -= dt) <= 0 && dist > PO.min && dist < PO.from && this.attackCd <= 0 &&
            sim.time >= (sim.nextAttackT || 0) && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.5 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5) && this.clearLine(sim, dx, dz, dist)) {
          if (sim.rand() < (T.pounceChance ?? PO.chance)) {
            this.attack = 'pounce'; this.set(ZS.WINDUP, T.pounceWindup ?? PO.windup); this.pounceCd = PO.cd + sim.rand() * 4;
            sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75) * 1.4;
            sim.emit({ type: 'zombieWindup', id: this.id, attack: 'pounce' });
            break;
          }
          this.pounceCd = 1.5 + sim.rand() * 1.5;
        }
        if (this.kind === 'sprinter' && !this.crawling && !this.passive && dist < ZATTACKS.smash.from && this.attackCd <= 0 && sim.time >= (sim.nextAttackT || 0) &&
            Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.8 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) { // the lady close in: her smash
          this.attack = 'smash'; this.set(ZS.WINDUP, ZATTACKS.smash.windup);
          sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75);
          sim.emit({ type: 'zombieWindup', id: this.id, attack: 'smash' });
          break;
        }
        if (this.kind === 'guard' && this.gstage !== 'shield' && !this.passive && slot && sim.time >= (sim.nextAttackT || 0) && this.attackCd <= 0) { // one arm, or his arm as a club
          const A = this.club ? ZATTACKS.club : ZATTACKS.flail;
          if (dist < A.from && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.9 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) {
            this.attack = this.club ? 'club' : 'flail'; this.set(ZS.WINDUP, A.windup); this.swingN = (this.swingN || 0) + 1;
            sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75) * (this.club ? 0.9 : 0.5);
            sim.emit({ type: 'zombieWindup', id: this.id, attack: this.attack });
          }
          break;
        }
        if (!this.passive && slot && sim.time >= (sim.nextAttackT || 0) && dist < ZATTACKS.lunge.from && this.attackCd <= 0 &&
            Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 0.7 && world.lineOfSight(this.x, this.z, p.x, p.z, 0.5)) {
          const armed = this.armsLost < 2 && !this.crawling; // no arms (a bite) or crawling: the plain lunge
          this.attack = armed && (this.chair || dist < 0.97 || (dist < ZATTACKS.scratch.from && sim.rand() < 0.25)) ? 'scratch' : 'lunge'; // (in a wheelchair: it only claws)
          this.set(ZS.WINDUP, this.attack === 'scratch' ? T.scratchWindup ?? 0.42 : T.zombieWindup ?? 0.62);
          sim.nextAttackT = sim.time + (T.zombieAttackGap ?? 0.75) * (0.8 + sim.rand() * 0.5);
          sim.emit({ type: 'zombieWindup', id: this.id, attack: this.attack });
        }
        break;
      }
      case ZS.WINDUP:
        turnRate = this.attack === 'slam' ? (this.t < this.stateDur * ZATTACKS.slam.takeoff ? 1.6 : 0) : this.attack === 'pounce' ? (this.t < this.stateDur * ZATTACKS.pounce.lock ? 3 : 0) : this.attack === 'dash' ? (this.t < this.stateDur * ZATTACKS.dash.lock ? 6 : 0) : 2.5; wantX = dx; wantZ = dz; // keep tracking slowly: stepping aside works (the slam commits once he leaps, the pounce a moment before it leaps)
        if (this.attack === 'slam' && this.t > this.stateDur * ZATTACKS.slam.takeoff) { // the leap forward: as far as she was when he left the floor (the shield lands a step short of her), at most leap
          if (this.leapL == null) sim.emit({ type: 'guardLaunch', id: this.id, x: this.x, z: this.z }); // (the push off the floor: the launch effect)
          if (this.leapL == null) this.leapL = Math.max(0, Math.min(ZATTACKS.slam.leap, dist - 1.05));
          const L = this.leapL / (this.stateDur * (1 - ZATTACKS.slam.takeoff)); this.vx = Math.sin(this.yaw) * L; this.vz = Math.cos(this.yaw) * L;
        } else if (this.attack === 'slam') this.leapL = null;
        if (this.t >= this.stateDur) {
          this.set(ZS.STRIKE, ZATTACKS[this.attack].strike); this.struck = false;
          if (this.attack === 'dash') { const L = ZATTACKS.dash.dist / ZATTACKS.dash.strike; this.vx = Math.sin(this.yaw) * L; this.vz = Math.cos(this.yaw) * L; sim.emit({ type: 'zombieDash', id: this.id }); }
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
        if (this.attack === 'dash') { // running through: the rake lands the first frame she is beside its path, and it runs on
          if (!this.struck && !p.dead) {
            const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
            if (along > -0.25 && along < Z.reach + p.r && lat < this.r + p.r + 0.15) {
              this.struck = true; // (shoved aside off its path, not along it: hurt pushes away from a point beside the runner)
              const sg = (dx * fz - dz * fx) >= 0 ? 1 : -1;
              const hit = p.hurt((T.scratchDamage ?? 8) * 1.4 * this.K.dmg * (1 - 0.3 * this.armsLost), this.x - fz * sg * 0.8, this.z + fx * sg * 0.8, sim);
              sim.emit({ type: hit ? 'zombieStrikeHit' : 'zombieStrikeMiss', id: this.id, attack: 'dash' });
            }
          }
          if (this.t >= this.stateDur) { if (!this.struck) sim.emit({ type: 'zombieStrikeMiss', id: this.id, attack: 'dash' }); this.set(ZS.RECOVER, Z.recover * (this.struck ? 0.85 : 1.1)); }
          break;
        }
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
            if (!this.struck) { sim.emit({ type: 'zombieStrikeMiss', id: this.id, attack: 'pounce' }); sim.specialMiss?.(this, 'pounce'); } // (dodged: a perfect one is an execute)
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
          const dmg = (this.attack === 'scratch' ? T.scratchDamage ?? 8 : this.attack === 'slam' ? T.zombieDamage * 1.3 : T.zombieDamage * (Z.dmg ?? 1)) * this.K.dmg;
          const hurt = hit && p.hurt(dmg * (this.kind === 'guard' ? 1 : 1 - 0.3 * this.armsLost) * (this.crawling ? 0.7 : 1), this.x, this.z, sim);
          if (hurt && (this.attack === 'club' || this.attack === 'smash') && !p.dead && sim.rand() < Z.kd) p.knockDown(this.x, this.z, sim); // (a heavy one floors her)
          if (hurt && this.attack === 'smash' && !p.dead && !p.down) { const l = dist || 1; p.vx += (dx / l) * 3.5; p.vz += (dz / l) * 3.5; } // (thrown back out of her reach)
          if (hurt && this.attack === 'slam' && !p.dead) p.knockDown(this.x, this.z, sim);
          // a crawler that gets its hands on her grabs her ankles (2026-10-18, the user: "a surviving crawler should remain a
          // meaningful threat"): she is held back for a moment (core/player.js grabT), not knocked about
          if (hurt && this.crawling && this.armsLost < 2) { p.grabT = 0.75; sim.emit({ type: 'grabbed', id: this.id }); }
          if (this.attack === 'slam') { // (the shockwave floors the other zombies close to where it lands)
            const ix = this.x + Math.sin(this.yaw) * 1.1, iz = this.z + Math.cos(this.yaw) * 1.1;
            for (const o of sim.zombies) {
              if (o === this || !o.alive || !o.solid || o.down || o.kind === 'guard' || o.crawling || o.state === ZS.EMERGE) continue;
              const ox = o.x - ix, oz = o.z - iz, d = Math.hypot(ox, oz);
              if (d < 2.1) { o.knockDown(ox / (d || 1), oz / (d || 1), sim); o.kx += (ox / (d || 1)) * 2.2; o.kz += (oz / (d || 1)) * 2.2; }
            }
          }
          if (this.attack === 'club' && (this.clubWear = (this.clubWear || 0) + (hurt ? 1 : 0.4)) >= GUARD.clubWear) { // (his torn arm comes apart on the blow)
            this.club = false; this.gstage = 'onearm'; this.armGone = true;
            sim.emit({ type: 'guardClubBreak', id: this.id, x: this.x + Math.sin(this.yaw) * 1.2, z: this.z + Math.cos(this.yaw) * 1.2, dirX: Math.sin(this.yaw), dirZ: Math.cos(this.yaw) });
          }
          if (this.attack === 'slam') sim.emit({ type: 'zombieSlam', id: this.id, x: this.x + Math.sin(this.yaw) * 1.1, z: this.z + Math.cos(this.yaw) * 1.1, hit, second: this.slams >= 1 });
          sim.emit({ type: hit ? 'zombieStrikeHit' : 'zombieStrikeMiss', id: this.id, attack: this.attack });
          if (this.attack === 'slam' && !hit) sim.specialMiss?.(this, 'slam'); // (dodged: core/sim.js specialMiss)
          if (this.attack === 'slam' && this.shieldHp > 0) { this.slamShield(sim); break; } // (his shield into the floor: stuck, or in pieces)
        }
        this.vx = Math.sin(this.yaw) * Z.step; this.vz = Math.cos(this.yaw) * Z.step; // steps into it
        if (this.t >= this.stateDur) { this.set(ZS.RECOVER, Z.recover); if (this.attack === 'flail' && this.swingN % 3) { this.attackCd = 0; sim.nextAttackT = Math.min(sim.nextAttackT || 0, sim.time); } } // (wild: the flails come in twos and threes, back to back)
        break;
      }
      case ZS.STUCK: // the guard heaving at his shield, planted in the floor for good (slamShield): the last heave tears his arm off
        turnRate = 0; this.vx = this.vz = 0;
        if (this.t >= this.stateDur) this.tearArm(sim);
        break;
      case ZS.PICKUP: { // pulling his torn arm off the shield's grip: his from grab of it on
        turnRate = 6; wantX = Math.sin(this.planted.yaw); wantZ = Math.cos(this.planted.yaw); this.vx = this.vz = 0;
        if (!this.club && this.t >= this.stateDur * GUARD.grab) { this.club = true; this.gstage = 'club'; sim.emit({ type: 'guardClub', id: this.id }); }
        if (this.t >= this.stateDur) { this.set(ZS.CHASE); this.attackCd = 0.35; }
        break;
      }
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
    if (this.bed) { this.yaw = bedRoot(this.bed)[2]; } // (in its bed, and getting out: the clip's own facing, never turned to her)
    else if (this.kind === 'guard') { // (his turn builds and settles: no fixed-rate snap, no dead stop)
      const on = turnRate > 0 && (wantX || wantZ) && !(this.state === ZS.CHASE && this.backing);
      const want = on ? Math.max(-turnRate, Math.min(turnRate, angleDiff(this.yaw, Math.atan2(wantX, wantZ)) * GUARD.spin)) : 0;
      this.yawV = (this.yawV || 0) + (want - (this.yawV || 0)) * Math.min(1, dt * (on ? 7 : 12));
      this.yaw += this.yawV * dt;
    } else if (turnRate > 0 && (wantX || wantZ) && !(this.state === ZS.CHASE && this.backing)) this.yaw = approachAngle(this.yaw, Math.atan2(wantX, wantZ), turnRate * dt);

    // locomotion velocity (only in states that walk)
    if (this.state === ZS.CHASE && (this.sprinting || this.spotT > 0)) { // the charge: along her facing at her own speed
      const k = Math.min(1, dt * 10), sp = this.sprinting ? this.spd : 0, tx = Math.sin(this.yaw) * sp, tz = Math.cos(this.yaw) * sp;
      this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    } else if (this.state === ZS.CHASE && this.backing) { // stepping back or aside, still facing her (the 8-way walk plays the step)
      this.yaw = approachAngle(this.yaw, Math.atan2(dx, dz), 4 * dt);
      const k = Math.min(1, dt * 6); this.vx += (wantX * speed - this.vx) * k; this.vz += (wantZ * speed - this.vz) * k;
    } else if (this.state === ZS.CHASE) {
      // walk mostly where we face: turning zombies slow down instead of sliding sideways
      const face = Math.max(0, Math.cos(angleDiff(this.yaw, Math.atan2(wantX, wantZ))));
      const s = speed * (0.35 + 0.65 * face);
      const tx = Math.sin(this.yaw) * s, tz = Math.cos(this.yaw) * s;
      const k = Math.min(1, dt * 6);
      this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    } else if (this.state !== ZS.STRIKE && this.state !== ZS.EMERGE && !(this.state === ZS.WINDUP && this.attack === 'slam')) {
      const k = Math.min(1, dt * (this.state === ZS.RECOVER && this.attack === 'dash' ? 4.5 : 10)); // (the dash's skid: it slides to a stop)
      this.vx -= this.vx * k; this.vz -= this.vz * k;
    }

    if (this.rGrow > 0) { this.rGrow = Math.max(0, this.rGrow - dt); this.r = this.K.r * (1 - 0.6 * this.rGrow); }
    this.carryLoose(dt, sim);
    // integrate: locomotion + knockback (knockback decays with friction; dying bodies slide less far)
    const fr = Math.exp(-dt * (this.state === ZS.DYING ? 5 : 7));
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    this.kx *= fr; this.kz *= fr;
    if (this.state !== ZS.DEAD && !this.bed) { // (in its bed, or getting out over it: the bed's own collider never pushes it off)
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
    // zombies do not walk through the player (the runner's dash rakes past her: it brushes by, she is shoved aside)
    const dx = a.x - player.x, dz = a.z - player.z, rr = a.r + player.r, d2 = dx * dx + dz * dz;
    if (!player.dead && d2 < rr * rr && d2 > 1e-8 && !(a.state === ZS.STRIKE && a.attack === 'dash')) { const d = Math.sqrt(d2), push = (rr - d) * 0.6; a.x += (dx / d) * push; a.z += (dz / d) * push; }
  }
}
