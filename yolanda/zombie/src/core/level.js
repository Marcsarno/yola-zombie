// Chapter 1 game state (Floors 7, 6 and 5; core/chapter.js). One Level per floor visit: the simulation's world is the
// current floor; everything that must survive a lift ride, a retry or a reload lives in the snapshot (flags, the case,
// the dead, the pickups taken). No DOM, no rendering: the renderer reads `doors`, `lift`, `case`, `prompt` and listens
// to the sim's events (the radio and phone lines, lift travel, the partition breaking).
//
// Floor 7: the lift is dead -> the phone check -> the radio at the nurse station (TECH on 3) -> restore the lift circuit in
//          lift service (also powers the contractor store) -> back north through the prep room, unbar the OR's south door
//          from that side -> the lift.
// Floor 6: the sealed pre-procedure case in cold dispatch; the ward route always open, the charger can break the weak
//          partition (optional). Carrying: the case in the off hand, one-handed weapons only; one action sets it down.
// Floor 5: secure the case at intake, read the dispatch record (either order), match them at intake, take the case and
//          board the lift toward Floor 4 (the chapter's end).
import { FLOORS, LIFTS, CASE_HOME, INTAKE_SPOT, roomAt as chapterRoomAt } from './chapter.js';
import { ZS } from './zombies.js';

export const LIFT_DOOR_TIME = 1.0; // s: the kit's Doors_Open / Doors_Close clips are exactly one second
export const BRACE_TIME = 2.5, DOOR_OPEN_TIME = 1.5; // the braced double door's Brace_Remove and Doors_Open clips
export const ONE_HANDED = ['bat', 'pistol']; // what Yola can use with the case in her other hand (the current rig's clips)
const CASE_R = 1.35;

const inRect = (r, x, z, m = 0) => x > r.minX + m && x < r.maxX - m && z > r.minZ + m && z < r.maxZ - m;
export const roomAt = chapterRoomAt;

export class Level {
  constructor(sim, save = null) {
    this.sim = sim;
    const s = save || {};
    this.floor = s.floor || 7;
    this.F = FLOORS[this.floor];
    this.L = LIFTS[this.floor];
    // the facts of the chapter, kept separate (no hidden sequencing between them)
    this.flags = {
      lift_power_restored: false, or_south_unbarred: false, partition_broken: false,
      phone_checked: false, radio_heard: false, power_call: false, case_seen: false, case_picked: false,
      case_secured: false, record_seen: false, sample_matched: false, chapter_complete: false,
      ...(s.flags || {}),
    };
    this.case = s.case ? { ...s.case } : { state: 'home', floor: CASE_HOME.floor, x: CASE_HOME.x, z: CASE_HOME.z, y: CASE_HOME.y };
    this.taken = new Set(s.taken || []);
    this.killed = new Set(s.killed || []);
    this.visited = new Set(s.visited || []);
    this.objective = s.objective || 'f7_lift';
    this.complete = false;
    this.ownedFull = s.ownedFull || null; // her full loadout while the case holds one hand
    // doors the renderer animates: 0..1 progress of the bar (brace) and of the leaves (open)
    const open = (f) => (f ? 1 : 0);
    this.doors = {
      orbar: { brace: open(this.flags.or_south_unbarred), open: open(this.flags.or_south_unbarred), busy: false },
      x7door: { brace: 1, open: open(this.flags.lift_power_restored), busy: false },
      partition: { broken: this.flags.partition_broken },
    };
    const powered = this.floor !== 7 || this.flags.lift_power_restored;
    this.lift = { state: !powered ? 'fault' : s.arrive ? 'arriving' : 'ready', open: 0, t: 0, floor: this.floor, choosing: false };
    this.prompt = null; this.room = null; this.lines = []; this.ending = null;
    const W = sim.world;
    if (W.dyn) {
      if (this.flags.or_south_unbarred && W.dyn.orbar) W.setOff(W.dyn.orbar, true);
      if (this.flags.lift_power_restored && W.dyn.x7door) W.setOff(W.dyn.x7door, true);
      if (this.flags.partition_broken && W.dyn.partition) W.setOff(W.dyn.partition, true);
    }
    // the zombies of this floor: placed, standing, waiting to sense Yola (the OR's wake on their timers the first time through)
    const fresh = !save || (save.floor === 7 && !save.flags?.radio_heard && !this.killed.size && this.floor === 7 && !s.x);
    for (const g of this.F.groups) {
      g.zombies.forEach((zs, i) => {
        const key = this.floor + ':' + g.id + ':' + i;
        if (this.killed.has(key)) return;
        const z = sim.spawnZombie(null, { x: zs.x, z: zs.z, yaw: zs.yaw, passive: true, speedMul: 0, kind: zs.kind });
        z.set(ZS.CHASE); z.spawnKey = key; z.group = g.id; if (zs.look) z.look = zs.look;
        z.dormant = {
          wake: fresh && zs.wake !== undefined ? zs.wake : Infinity, sense: g.sense ?? (zs.wake !== undefined ? 6 : 0), locked: !!g.locked,
          group: g.id, speedMul: 0.85 + 0.1 * (i % 3),
        };
      });
    }
    // pickups still lying where they belong
    this.pickups = this.F.pickups.filter((q) => !this.taken.has(q.id)).map((q) => ({ ...q }));
    // the player: the canonical start, a checkpoint, or stepping out of the lift
    const p = sim.player;
    p.reserve = { pistol: 0, shotgun: 0 };
    if (save) {
      if (s.arrive) { p.x = this.L.inside.x; p.z = this.L.inside.z; p.aimYaw = p.aimTarget = 0; }
      else { p.x = s.x; p.z = s.z; p.aimYaw = p.aimTarget = s.yaw ?? 0; }
      p.setLoadout(s.owned?.length ? s.owned : ['fists'], s.equipped || (s.owned && s.owned[0]) || 'fists');
      Object.assign(p.mags, s.mags || {}); Object.assign(p.reserve, s.reserve || {});
      p.hp = s.hp ?? p.maxHp;
    }
    if (sim.T.testInfiniteAmmo) p.reserve = { pistol: Infinity, shotgun: Infinity }; // (a checkpoint stores Infinity as null)
    if (this.case.state === 'carried') this.applyCarry(true);
  }

  emit(e) { this.sim.emit(e); }
  setObjective(id) { if (this.objective === id) return; this.objective = id; this.emit({ type: 'objective', id }); this.checkpoint(); }
  say(id) { this.emit({ type: 'radio', id }); } // a short exchange (captions; the UI plays it while play goes on)

  // a checkpoint: everything needed to restore a coherent chapter (doors and pickups keep their state; the dead stay dead)
  snapshot(extra = {}) {
    const p = this.sim.player;
    const owned = this.ownedFull || p.owned;
    return {
      v: 2, level: 'chapter', floor: this.floor, flags: { ...this.flags }, case: { ...this.case }, taken: [...this.taken], killed: [...this.killed],
      visited: [...this.visited], objective: this.objective, owned: [...owned], equipped: p.equipped, mags: { ...p.mags }, reserve: { ...p.reserve },
      hp: Math.max(35, p.hp), x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.aimYaw.toFixed(3), ...extra,
    };
  }
  checkpoint() { if (!this.sim.player.dead && this.lift.state !== 'travel') this.emit({ type: 'checkpoint', save: this.snapshot() }); }

  // a woken zombie rouses the others of its group nearby (a beat apart, never all at once)
  onWake(z) {
    for (const o of this.sim.zombies) {
      const d = o.dormant;
      if (!d || d.locked || o.group !== z.group || o === z) continue;
      if (Math.hypot(o.x - z.x, o.z - z.z) < 7) d.wake = Math.min(d.wake, this.sim.time + 0.35 + this.sim.rand() * 0.9);
    }
  }
  wakeGroup(id) {
    let k = 0;
    for (const o of this.sim.zombies) if (o.dormant && o.group === id) { o.dormant.locked = false; o.dormant.wake = Math.min(o.dormant.wake, this.sim.time + 0.4 + 0.45 * k++); }
  }

  // ---- the case: carried in the off hand (one-handed weapons only), set down with one action, picked up again ----
  applyCarry(on) {
    const p = this.sim.player;
    if (on) {
      if (!this.ownedFull) this.ownedFull = [...p.owned];
      const allowed = this.ownedFull.filter((w) => ONE_HANDED.includes(w));
      p.owned = allowed.length ? allowed : [...this.ownedFull];
      if (!p.owned.includes(p.desired)) p.desired = p.owned[0];
    } else if (this.ownedFull) {
      const keep = p.desired;
      p.owned = WEAPON_SORT(this.ownedFull.concat(p.owned.filter((w) => !this.ownedFull.includes(w)))); this.ownedFull = null;
      if (p.owned.includes(keep)) p.desired = keep;
    }
  }
  canCarry() { return (this.ownedFull || this.sim.player.owned).some((w) => ONE_HANDED.includes(w)); }
  takeCase() {
    const c = this.case, first = !this.flags.case_picked;
    c.state = 'carried'; c.floor = this.floor; this.flags.case_picked = true;
    this.applyCarry(true);
    this.emit({ type: 'case', state: 'carried', first });
    if (first) { this.say('f6_pickup'); this.setObjective(this.flags.case_secured || this.flags.sample_matched ? 'f5_down' : 'f5_intake'); }
    else if (this.flags.sample_matched && this.floor === 5) this.setObjective('f5_down');
    this.checkpoint();
  }
  dropCase(x, z) {
    const c = this.case;
    c.state = 'placed'; c.floor = this.floor; c.x = +x.toFixed(2); c.z = +z.toFixed(2); c.y = 0;
    this.applyCarry(false);
    this.emit({ type: 'case', state: 'placed' });
    this.checkpoint();
  }
  secureCase() {
    const c = this.case;
    c.state = 'stored'; c.floor = 5; c.x = INTAKE_SPOT.x; c.z = INTAKE_SPOT.z; c.y = INTAKE_SPOT.y;
    this.applyCarry(false);
    const first = !this.flags.case_secured; this.flags.case_secured = true;
    this.emit({ type: 'case', state: 'stored', first });
    if (this.flags.record_seen && !this.flags.sample_matched) this.matchSample();
    else if (first) { this.say('f5_intake'); this.setObjective('f5_record'); }
    this.checkpoint();
  }
  matchSample() {
    this.flags.sample_matched = true;
    this.say('f5_match');
    this.emit({ type: 'sampleMatch' });
    this.setObjective(this.case.state === 'carried' ? 'f5_down' : 'f5_retrieve');
  }

  step(dt, input) {
    const sim = this.sim, p = sim.player;
    if (this.complete) return;
    // the dead stay dead on a retry
    for (const z of sim.zombies) if (z.spawnKey && !z.alive && !this.killed.has(z.spawnKey)) this.killed.add(z.spawnKey);
    // rooms: entering a new room is a checkpoint
    const room = roomAt(p.x, p.z);
    if (room && room !== this.room) {
      this.room = room;
      const key = this.floor + ':' + room;
      if (!this.visited.has(key)) { this.visited.add(key); this.emit({ type: 'roomEnter', room }); this.onFirstVisit(room); }
      if (!p.dead) this.checkpoint();
    }
    this.pickupStep(p);
    this.doorStep(dt);
    this.partitionStep();
    this.liftStep(dt, p);
    // what Yola can do (or learn) here; a Use press acts on it
    this.prompt = p.dead ? null : this.findPrompt(p);
    if (input.usePresses > 0 && this.prompt?.usable) this.use(this.prompt.id);
  }

  onFirstVisit(room) {
    if (room === 'k6' && !this.flags.case_seen) this.flags.case_seen = true;
    if (room === 'j6' && !this.flags.case_picked) this.setObjective('f6_case');
    if (room === 'i5' && this.floor === 5 && this.case.state !== 'carried' && !this.flags.case_secured) this.say('f5_first');
  }

  pickupStep(p) {
    if (p.dead) return;
    for (const q of this.pickups) {
      if (Math.hypot(p.x - q.x, p.z - q.z) > q.r) continue;
      if (q.kind === 'health' && p.hp >= p.maxHp) continue; // full health: the case stays for later
      this.pickups.splice(this.pickups.indexOf(q), 1); this.taken.add(q.id);
      if (q.kind === 'weapon') {
        const list = this.ownedFull || p.owned;
        if (!list.includes(q.weapon)) { list.push(q.weapon); if (this.ownedFull) this.applyCarry(true); }
        if (q.mag !== undefined) p.mags[q.weapon] = q.mag;
        if (!this.ownedFull || ONE_HANDED.includes(q.weapon)) p.desired = q.weapon; // takes it out (two-handed: once the case is down)
      } else if (q.kind === 'ammo') p.reserve[q.weapon] = (p.reserve[q.weapon] || 0) + q.rounds;
      else if (q.kind === 'health') p.hp = Math.min(p.maxHp, p.hp + q.amount);
      this.emit({ type: 'pickup', id: q.id, kind: q.kind, weapon: q.weapon, label: q.label });
      this.checkpoint();
      break;
    }
  }

  findPrompt(p) {
    const near = (o, r) => Math.hypot(p.x - o.x, p.z - o.z) < r;
    const c = this.case, carrying = c.state === 'carried', f = this.floor;
    for (const it of this.F.interact) {
      if (!near(it, it.r)) continue;
      const okSide = !it.side || (it.side.min !== undefined ? (it.side.axis === 'x' ? p.x > it.side.min : p.z > it.side.min) : (it.side.axis === 'x' ? p.x < it.side.max : p.z < it.side.max));
      if (it.id === 'radio' && !this.flags.radio_heard) return { id: it.id, label: it.label, usable: true };
      if (it.id === 'liftReset' && !this.flags.lift_power_restored) return { id: it.id, label: it.label, usable: true };
      if (it.id === 'orBar' && !this.flags.or_south_unbarred && !this.doors.orbar.busy && okSide) return { id: it.id, label: it.label, usable: true };
      if (it.id === 'intake') {
        if (carrying) return { id: 'intake', label: 'Secure the case', usable: true };
        if (c.state === 'stored' && this.flags.record_seen && !this.flags.sample_matched) return { id: 'match', label: 'Compare the record with the case', usable: true };
      }
      if (it.id === 'record' && !this.flags.record_seen) return { id: 'record', label: it.label, usable: true };
    }
    // the case itself (wherever it lies on this floor)
    if (!carrying && c.floor === f && near(c, CASE_R)) {
      if (!this.canCarry()) return { id: 'caseNoHand', label: 'Needs a free hand: a one-handed weapon', usable: false };
      return { id: 'takeCase', label: c.state === 'home' ? 'Take the sealed case' : 'Pick up the case', usable: true };
    }
    // facts, not actions
    if (f === 7) {
      if (!this.flags.or_south_unbarred && p.z < 1.05 && near({ x: -1.35, z: 0.2 }, 2.0)) return { id: 'orBarred', label: 'Barred from the other side', usable: false };
      if (this.lift.state === 'fault' && near(this.L.call, 2.6)) return { id: 'liftFault', label: 'Lift: no power', usable: false };
      if (!this.flags.lift_power_restored && near({ x: -15.05, z: 16.4 }, 1.8)) return { id: 'x7Locked', label: 'Powered door: no power', usable: false };
    }
    if (f === 6 && !this.flags.partition_broken && near({ x: -16.6, z: -56.05 }, 1.6)) return { id: 'partitionWeak', label: 'A weak partition — too solid to push', usable: false };
    if (f === 5 && this.case.state === 'stored' && near(INTAKE_SPOT, 2.2) && !this.flags.sample_matched && !this.flags.record_seen) return { id: 'caseHeld', label: 'The case is secured here', usable: false };
    for (const q of this.pickups) if (q.kind === 'health' && near(q, q.r + 0.6) && p.hp >= p.maxHp) return { id: 'healthFull', label: 'Health full — leave the first-aid case', usable: false };
    // set the case down (one action) when nothing else is here
    if (carrying && !this.lift.choosing) return { id: 'dropCase', label: 'Set the case down', usable: true, quiet: true };
    return null;
  }

  use(id) {
    const p = this.sim.player;
    if (id === 'radio' && !this.flags.radio_heard) {
      this.flags.radio_heard = true; this.say('f7_radio'); this.setObjective('f7_power');
    } else if (id === 'liftReset' && !this.flags.lift_power_restored) {
      this.flags.lift_power_restored = true;
      if (this.lift.state === 'fault') this.lift.state = 'ready';
      this.doors.x7door.busy = true; this.doors.x7door.t = 0; // the contractor store's door runs on the same circuit
      this.emit({ type: 'liftPower' });
      this.say('f7_power');
      this.setObjective(this.flags.or_south_unbarred ? 'f7_board' : 'f7_return');
    } else if (id === 'orBar') {
      const d = this.doors.orbar; if (d.busy) return;
      d.busy = true; d.t = 0;
      this.emit({ type: 'unbrace', door: 'orbar' });
    } else if (id === 'takeCase') this.takeCase();
    else if (id === 'dropCase') this.dropCase(p.x + Math.sin(p.aimYaw) * 0.55, p.z + Math.cos(p.aimYaw) * 0.55);
    else if (id === 'intake') this.secureCase();
    else if (id === 'match') this.matchSample();
    else if (id === 'record') {
      this.flags.record_seen = true;
      this.emit({ type: 'record' });
      const atHand = this.case.state === 'stored' || this.case.state === 'carried';
      if (this.flags.case_secured && this.case.state === 'stored') { this.say('f5_record'); this.setObjective('f5_match'); }
      else { this.say(atHand ? 'f5_record' : 'f5_record_first'); this.setObjective(atHand ? 'f5_match' : 'f5_record_case'); }
      this.checkpoint();
    }
  }

  // the bar comes off, then the leaves swing open; the doorway only becomes passable once they are open.
  // The contractor store's powered door slides open when the circuit comes back.
  doorStep(dt) {
    const W = this.sim.world;
    const d = this.doors.orbar;
    if (d.busy) {
      d.t += dt;
      d.brace = Math.min(1, d.t / BRACE_TIME);
      d.open = Math.min(1, Math.max(0, (d.t - BRACE_TIME) / DOOR_OPEN_TIME));
      if (d.open >= 0.6 && W.dyn?.orbar && !W.dyn.orbar.off) W.setOff(W.dyn.orbar, true);
      if (d.open >= 1) {
        d.busy = false; this.flags.or_south_unbarred = true;
        this.emit({ type: 'doorOpened', door: 'orbar' });
        if (this.flags.lift_power_restored) this.setObjective('f7_board');
        this.checkpoint();
      }
    }
    const x = this.doors.x7door;
    if (x.busy) {
      x.t += dt; x.open = Math.min(1, x.t / DOOR_OPEN_TIME);
      if (x.open >= 0.6 && W.dyn?.x7door && !W.dyn.x7door.off) W.setOff(W.dyn.x7door, true);
      if (x.open >= 1) { x.busy = false; if (this.floor === 7) this.emit({ type: 'doorOpened', door: 'x7door' }); }
    }
  }

  // Floor 6: the charger's committed run into the weak partition breaks it for good (the ward route never depends on it)
  partitionStep() {
    if (this.floor !== 6 || this.flags.partition_broken) return;
    const W = this.sim.world, b = W.dyn?.partition; if (!b) return;
    for (const e of this.sim.events) {
      if (e.type !== 'zombieTumble' || e.what !== 'wall') continue;
      const z = this.sim.zombies.find((q) => q.id === e.id); if (!z || z.kind !== 'sprinter') continue;
      const cx = Math.max(b.minX, Math.min(z.x, b.maxX)), cz = Math.max(b.minZ, Math.min(z.z, b.maxZ));
      if (Math.hypot(z.x - cx, z.z - cz) > z.r + 0.6) continue;
      this.flags.partition_broken = true; this.doors.partition.broken = true;
      W.setOff(b, true);
      this.emit({ type: 'partitionBreak', x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, dirX: Math.sin(z.yaw), dirZ: Math.cos(z.yaw) });
      this.checkpoint();
      break;
    }
  }

  // the lift: fault -> ready (power) -> opening (Yola at the doors) -> open (a floor picker while she stands in the cab) ->
  // closing (a floor chosen; never on her) -> travel (the ride: the game rebuilds the next floor) ... arriving -> open.
  floorsFrom() {
    const list = [];
    for (const f of [7, 6, 5]) if (f !== this.floor) list.push({ floor: f, label: 'Floor ' + f });
    if (this.floor === 5 && this.flags.sample_matched && this.case.state === 'carried') list.push({ floor: 4, label: 'Floor 4 — continue', end: true });
    return list;
  }
  chooseFloor(f) {
    const L = this.lift; if (L.state !== 'open' || !L.choosing) return;
    if (f === 4 && !(this.floor === 5 && this.flags.sample_matched && this.case.state === 'carried')) return;
    L.target = f; L.state = 'closing'; L.choosing = false;
    this.emit({ type: 'liftDoors', open: false });
  }
  liftStep(dt, p) {
    const L = this.lift, W = this.sim.world, LF = this.L;
    const inCab = inRect(LF.cab, p.x, p.z, p.r * 0.6), atDoor = Math.abs(p.x - LF.x) < 2.8 && p.z < LF.z + 2.8 && p.z > LF.z - 3.6;
    const inThreshold = inRect(LF.threshold, p.x, p.z, -p.r);
    switch (L.state) {
      case 'fault':
        if (this.floor === 7 && !this.flags.phone_checked && !p.dead && Math.hypot(p.x - LF.call.x, p.z - LF.call.z) < 2.2 && !this.sim.zombies.some((z) => z.alive && !z.dormant && Math.hypot(z.x - p.x, z.z - p.z) < 7)) { // (the fight is over first)
          this.flags.phone_checked = true; this.emit({ type: 'liftFault' }); this.say('f7_phone'); this.setObjective('f7_find');
        }
        break;
      case 'ready':
        if (atDoor && !p.dead) { L.state = 'opening'; this.emit({ type: 'liftDoors', open: true }); }
        break;
      case 'arriving':
        L.t += dt; if (L.t > 0.55) { L.state = 'opening'; this.emit({ type: 'liftDoors', open: true }); }
        break;
      case 'opening':
        L.open = Math.min(1, L.open + dt / LIFT_DOOR_TIME);
        if (L.open >= 0.7) W.setOff(W.dyn.liftDoors, true);
        if (L.open >= 1) L.state = 'open';
        break;
      case 'open':
        L.choosing = inCab && !p.dead;
        if (!atDoor && !inCab && p.z > LF.z + 3.4) { L.state = 'closingIdle'; L.choosing = false; }
        break;
      case 'closingIdle': // she walked away: the doors close (they open again when she comes back)
        if (atDoor) { L.state = 'opening'; break; }
        L.open = Math.max(0, L.open - dt / LIFT_DOOR_TIME);
        if (L.open < 0.3) W.setOff(W.dyn.liftDoors, false);
        if (L.open <= 0) L.state = 'ready';
        break;
      case 'closing':
        if (!inCab || inThreshold || p.dead) { L.state = 'opening'; L.target = null; this.emit({ type: 'liftDoors', open: true }); break; } // never close on her
        L.open = Math.max(0, L.open - dt / LIFT_DOOR_TIME);
        if (L.open <= 0) {
          W.setOff(W.dyn.liftDoors, false);
          if (L.target === 4) {
            L.state = 'gone'; this.complete = true; this.flags.chapter_complete = true;
            this.emit({ type: 'chapterComplete' });
          } else {
            L.state = 'travel';
            this.emit({ type: 'liftTravel', from: this.floor, to: L.target, save: this.snapshot({ floor: L.target, arrive: true, objective: this.arrivalObjective(L.target) }) });
          }
        }
        break;
    }
  }
  // the objective on arriving at a floor (the chapter's goals, wherever they stand)
  arrivalObjective(f) {
    const F = this.flags, c = this.case;
    if (F.sample_matched) return c.state === 'carried' ? (f === 5 ? 'f5_down' : 'f5_back') : c.floor === f ? 'f5_retrieve' : 'f5_fetch';
    if (c.state === 'carried') return f === 5 ? 'f5_intake' : 'f5_go';
    if (f === 6 && !F.case_picked) return 'f6_case';
    if (f === 5) return F.record_seen ? (F.case_secured ? 'f5_match' : 'f5_record_case') : F.case_secured ? 'f5_record' : 'f5_explore';
    if (f === 7) return 'f7_explore';
    return this.objective;
  }
}
const ORDER = ['pistol', 'shotgun', 'axe', 'bat', 'fists'];
function WEAPON_SORT(list) { return [...new Set(list)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)); }
