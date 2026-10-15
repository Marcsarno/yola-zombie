// Floor 3 game state: one main goal (restore the lift's local power in Maintenance, then board the lift), two optional
// physical shortcuts (the Cafeteria brace, the CT-side bar), pickups that belong where they lie, and retry checkpoints.
// No DOM, no rendering: the renderer reads `doors`, `lift`, `prompt` and listens to the sim's events.
import { GROUPS, PICKUPS, INTERACT, LIFT, ROOMS } from './floor3.js';
import { ZS } from './zombies.js';

export const LIFT_DOOR_TIME = 1.0; // s: the kit's Doors_Open / Doors_Close clips are exactly one second
export const BRACE_TIME = 2.5, DOOR_OPEN_TIME = 1.5; // the braced double door's Brace_Remove and Doors_Open clips

const inRect = (r, x, z, m = 0) => x > r.minX + m && x < r.maxX - m && z > r.minZ + m && z < r.maxZ - m;
export function roomAt(x, z) {
  for (const r of ROOMS) for (const [x0, x1, z0, z1] of r.rects) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r.id;
  return null;
}

export class Level {
  constructor(sim, save = null) {
    this.sim = sim;
    const s = save || {};
    // the three physical facts of this floor, kept separate (no hidden sequencing between them)
    this.flags = { lift_power_restored: false, cafeteria_brace_removed: false, ct_return_unbarred: false, ...(s.flags || {}) };
    this.taken = new Set(s.taken || []);
    this.killed = new Set(s.killed || []);
    this.visited = new Set(s.visited || []);
    this.objective = s.objective || 'maintenance';
    this.complete = false;
    // doors the renderer animates: brace / bar removal progress and leaf opening, 0..1
    this.doors = {
      brace: { brace: this.flags.cafeteria_brace_removed ? 1 : 0, open: this.flags.cafeteria_brace_removed ? 1 : 0, busy: false },
      ctbar: { brace: this.flags.ct_return_unbarred ? 1 : 0, open: this.flags.ct_return_unbarred ? 1 : 0, busy: false },
    };
    this.lift = { state: this.flags.lift_power_restored ? 'ready' : 'fault', open: 0, t: 0 };
    this.prompt = null; this.bangT = 2; this.room = null; this.saveT = 0;
    const W = sim.world;
    if (this.flags.cafeteria_brace_removed) W.setOff(W.dyn.brace, true);
    if (this.flags.ct_return_unbarred) W.setOff(W.dyn.ctbar, true);
    // the zombies: placed, standing, waiting to sense Yola (the OR's three wake on their timers the first time through)
    const fresh = !save;
    for (const g of GROUPS) {
      g.zombies.forEach((zs, i) => {
        const key = g.id + ':' + i;
        if (this.killed.has(key)) return;
        const z = sim.spawnZombie(null, { x: zs.x, z: zs.z, yaw: zs.yaw, passive: true, speedMul: 0 });
        z.set(ZS.CHASE); z.spawnKey = key; z.group = g.id;
        const locked = !!g.locked && !(g.trigger === 'brace' && this.flags.cafeteria_brace_removed);
        z.dormant = {
          wake: fresh && zs.wake !== undefined ? zs.wake : Infinity, sense: g.sense ?? (zs.wake !== undefined ? 6 : 0), locked,
          group: g.id, speedMul: 0.85 + 0.1 * (i % 3),
        };
      });
    }
    // pickups still lying where they belong
    this.pickups = PICKUPS.filter((q) => !this.taken.has(q.id)).map((q) => ({ ...q }));
    // the player: the canonical Room 1 start, or the checkpoint
    const p = sim.player;
    p.reserve = { pistol: 0, shotgun: 0 };
    if (save) {
      p.x = s.x; p.z = s.z; p.aimYaw = p.aimTarget = s.yaw ?? 0;
      p.setLoadout(s.owned?.length ? s.owned : ['fists'], s.equipped || (s.owned && s.owned[0]) || 'fists');
      Object.assign(p.mags, s.mags || {}); Object.assign(p.reserve, s.reserve || {});
      p.hp = s.hp ?? p.maxHp;
    }
    if (sim.T.testInfiniteAmmo) p.reserve = { pistol: Infinity, shotgun: Infinity }; // (a checkpoint stores Infinity as null)
  }

  emit(e) { this.sim.emit(e); }
  setObjective(id) { if (this.objective === id) return; this.objective = id; this.emit({ type: 'objective', id }); this.checkpoint(); }

  // a checkpoint: everything needed to restore a coherent floor (doors and pickups keep their state; the dead stay dead)
  snapshot() {
    const p = this.sim.player;
    return {
      v: 1, level: 'floor3', flags: { ...this.flags }, taken: [...this.taken], killed: [...this.killed], visited: [...this.visited],
      objective: this.objective, owned: [...p.owned], equipped: p.equipped, mags: { ...p.mags }, reserve: { ...p.reserve },
      hp: Math.max(35, p.hp), x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.aimYaw.toFixed(3),
    };
  }
  checkpoint() { if (!this.sim.player.dead) this.emit({ type: 'checkpoint', save: this.snapshot() }); }

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

  step(dt, input) {
    const sim = this.sim, p = sim.player, W = sim.world;
    if (this.complete) return;
    // the dead stay dead on a retry
    for (const z of sim.zombies) if (z.spawnKey && !z.alive && !this.killed.has(z.spawnKey)) this.killed.add(z.spawnKey);
    // rooms: entering a new room is a checkpoint
    const room = roomAt(p.x, p.z);
    if (room && room !== this.room) {
      this.room = room;
      if (!this.visited.has(room)) { this.visited.add(room); this.emit({ type: 'roomEnter', room }); }
      if (!p.dead) this.checkpoint();
    }
    this.pickupStep(p);
    this.doorStep(dt);
    this.liftStep(dt, p);
    // what Yola can do (or learn) here; a Use press acts on it
    this.prompt = p.dead ? null : this.findPrompt(p);
    if (input.usePresses > 0 && this.prompt?.usable) this.use(this.prompt.id);
    // banging behind the braced staff door while it stays shut (four residents, heard before they are seen)
    if (!this.flags.cafeteria_brace_removed) {
      this.bangT -= dt;
      const d = Math.hypot(p.x + 25.6, p.z + 14.6);
      if (this.bangT <= 0) { this.bangT = 1.4 + sim.rand() * 2.2; if (d < 11) this.emit({ type: 'bang', door: 'brace', near: d }); }
    }
  }

  pickupStep(p) {
    if (p.dead) return;
    for (const q of this.pickups) {
      if (Math.hypot(p.x - q.x, p.z - q.z) > q.r) continue;
      if (q.kind === 'health' && p.hp >= p.maxHp) continue; // full health: the case stays for later
      this.pickups.splice(this.pickups.indexOf(q), 1); this.taken.add(q.id);
      if (q.kind === 'weapon') {
        if (!p.owned.includes(q.weapon)) p.owned.push(q.weapon);
        if (q.mag !== undefined) p.mags[q.weapon] = q.mag;
        p.desired = q.weapon; // takes it out
      } else if (q.kind === 'ammo') p.reserve[q.weapon] = (p.reserve[q.weapon] || 0) + q.rounds;
      else if (q.kind === 'health') p.hp = Math.min(p.maxHp, p.hp + q.amount);
      this.emit({ type: 'pickup', id: q.id, kind: q.kind, weapon: q.weapon });
      if (q.id === 'bat') this.wakeGroup('supply'); // the patients in the waiting area heard that
      this.checkpoint();
      break;
    }
  }

  findPrompt(p) {
    const near = (o, r) => Math.hypot(p.x - o.x, p.z - o.z) < r;
    for (const it of INTERACT) {
      if (!near(it, it.r)) continue;
      const okSide = !it.side || (it.side.axis === 'x' ? p.x < it.side.max : p.z < it.side.max);
      if (it.id === 'liftReset' && !this.flags.lift_power_restored) return { id: it.id, label: it.label, usable: true };
      if (it.id === 'brace' && !this.flags.cafeteria_brace_removed && !this.doors.brace.busy && okSide) return { id: it.id, label: it.label, usable: true };
      if (it.id === 'ctBar' && !this.flags.ct_return_unbarred && !this.doors.ctbar.busy && okSide) return { id: it.id, label: it.label, usable: true };
    }
    // facts, not actions
    if (!this.flags.ct_return_unbarred && p.z > -11.15 && near({ x: -4.5, z: -10.3 }, 1.9)) return { id: 'ctBarred', label: 'Barred from the other side', usable: false };
    if (!this.flags.cafeteria_brace_removed && p.x > -25.6 && near({ x: -24.9, z: -14.6 }, 1.6)) return { id: 'braceOther', label: 'Braced shut from the other side', usable: false };
    if (this.lift.state === 'fault' && near(LIFT.call, 2.4)) return { id: 'liftFault', label: 'Lift: power fault — reset it in Maintenance', usable: false };
    for (const q of this.pickups) if (q.kind === 'health' && near(q, q.r + 0.6) && p.hp >= p.maxHp) return { id: 'healthFull', label: 'Health full — leave the first-aid case', usable: false };
    if (this.taken.has('ammo') && near({ x: -14.85, z: 3.25 }, 1.0)) return { id: 'bagEmpty', label: 'The bag is empty', usable: false };
    return null;
  }

  use(id) {
    const W = this.sim.world;
    if (id === 'liftReset' && !this.flags.lift_power_restored) {
      this.flags.lift_power_restored = true;
      if (this.lift.state === 'fault') this.lift.state = 'ready';
      this.emit({ type: 'liftPower' });
      this.setObjective('elevator');
      this.checkpoint();
    } else if (id === 'brace' || id === 'ctBar') {
      const key = id === 'brace' ? 'brace' : 'ctbar', d = this.doors[key];
      if (d.busy) return;
      d.busy = true; d.t = 0;
      this.emit({ type: 'unbrace', door: key });
    }
  }

  // brace / bar removal, then the leaves swing open; the doorway only becomes passable once they are open
  doorStep(dt) {
    const W = this.sim.world;
    for (const key of ['brace', 'ctbar']) {
      const d = this.doors[key];
      if (!d.busy) continue;
      d.t += dt;
      d.brace = Math.min(1, d.t / BRACE_TIME);
      d.open = Math.min(1, Math.max(0, (d.t - BRACE_TIME) / DOOR_OPEN_TIME));
      if (d.open >= 0.6 && W.dyn[key] && !W.dyn[key].off) W.setOff(W.dyn[key], true);
      if (d.open >= 1) {
        d.busy = false;
        if (key === 'brace') { this.flags.cafeteria_brace_removed = true; this.wakeGroup('cafe'); this.emit({ type: 'doorOpened', door: key }); }
        else { this.flags.ct_return_unbarred = true; this.emit({ type: 'doorOpened', door: key }); }
        this.checkpoint();
      }
    }
  }

  // the lift: fault -> ready (power) -> opening (Yola at the call panel) -> open -> closing (Yola fully in the cab) -> gone.
  // Leaving the cab, or standing in the threshold, while the doors close sends them back open.
  liftStep(dt, p) {
    const L = this.lift, W = this.sim.world;
    const inCab = inRect(LIFT.cab, p.x, p.z, p.r), atDoor = p.x > 5.2 && p.z > LIFT.z - 2.6 && p.z < LIFT.z + 2.6;
    const inThreshold = inRect(LIFT.threshold, p.x, p.z, -p.r);
    switch (L.state) {
      case 'ready':
        if (atDoor && !p.dead) { L.state = 'opening'; this.emit({ type: 'liftDoors', open: true }); }
        break;
      case 'opening':
        L.open = Math.min(1, L.open + dt / LIFT_DOOR_TIME);
        if (L.open >= 0.7) W.setOff(W.dyn.liftDoors, true);
        if (L.open >= 1) { L.state = 'open'; this.setObjective('board'); }
        break;
      case 'open':
        if (inCab && !p.dead) { L.state = 'closing'; L.t = 0; this.emit({ type: 'liftDoors', open: false }); }
        break;
      case 'closing':
        if (!inCab || inThreshold || p.dead) { L.state = 'opening'; this.emit({ type: 'liftDoors', open: true }); break; } // never close on her
        L.open = Math.max(0, L.open - dt / LIFT_DOOR_TIME);
        if (L.open <= 0) {
          W.setOff(W.dyn.liftDoors, false);
          L.state = 'gone'; this.complete = true;
          this.emit({ type: 'levelComplete' });
        }
        break;
    }
  }
}
