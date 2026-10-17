// Encounter pacing: short pressure beats separated by breathers; never spawns next to the player.
import { LAYOUT } from './layout.js';

// Each beat: count, spawn interval, doors allowed. Breather (s) after the beat is cleared.
const BEATS = [
  { n: 2, every: 0.9, doors: ['NE', 'NW'], breather: 3.0, delay: 1.2 },
  { n: 4, every: 1.1, doors: ['NE', 'NW', 'E'], breather: 3.5 },
  { n: 6, every: 0.85, doors: ['NW', 'W', 'NE'], breather: 4.0, kinds: ['sprinter'] },
  { n: 9, every: 0.7, doors: ['NE', 'NW', 'W', 'E'], breather: 0, kinds: ['guard', 'normal', 'sprinter'] },
];
const MIN_SPAWN_DIST = 5.5;

export class Director {
  constructor(sim, mode, benchCount) {
    this.sim = sim; this.mode = mode; this.benchCount = benchCount;
    this.beat = 0; this.spawned = 0; this.timer = BEATS[0].delay; this.state = 'spawning';
    this.cleared = false; this.clearTime = 0;
    if (mode === 'calm') this.setupCalm();
  }

  setupCalm() {
    // Practice dummies: stand in the hall, never attack, regenerate when killed.
    const spots = [[-1.5, -2.5], [1.0, -6.6], [-4.5, 2.5]];
    this.calmSpots = spots;
    for (const [x, z] of spots) this.sim.spawnZombie('NE', { x, z, yaw: 0, passive: true, speedMul: 0 });
  }

  pickDoor(allowed) {
    const p = this.sim.player;
    const ok = LAYOUT.doors.filter((d) => allowed.includes(d.id) && Math.hypot(d.spawn.x - p.x, d.spawn.z - p.z) > MIN_SPAWN_DIST);
    const pool = ok.length ? ok : LAYOUT.doors.filter((d) => Math.hypot(d.spawn.x - p.x, d.spawn.z - p.z) > MIN_SPAWN_DIST);
    if (!pool.length) return null;
    return pool[Math.floor(this.sim.rand() * pool.length)];
  }

  update(dt) {
    const sim = this.sim;
    if (sim.player.dead) return;
    if (this.mode === 'room1' || this.mode === 'arena') return; // authored, not wave-driven (the arena spawns from its panel)
    if (this.mode === 'calm') {
      // respawn a dummy a moment after it dies
      this.timer -= dt;
      if (sim.aliveCount() < this.calmSpots.length && this.timer <= 0) {
        const taken = (x, z) => sim.zombies.some((q) => q.alive && Math.hypot(q.x - x, q.z - z) < 0.5);
        const s = this.calmSpots.find(([x, z]) => !taken(x, z));
        if (s) sim.spawnZombie('NE', { x: s[0], z: s[1], yaw: 0, passive: true, speedMul: 0 });
        this.timer = 1.5;
      }
      return;
    }
    if (this.mode === 'bench') {
      this.timer -= dt;
      if (sim.aliveCount() < this.benchCount && this.timer <= 0) {
        const d = this.pickDoor(['NE', 'NW', 'W', 'E']);
        if (d) sim.spawnZombie(d);
        this.timer = 0.25;
      }
      return;
    }
    if (this.cleared) return;
    const B = BEATS[this.beat];
    this.timer -= dt;
    if (this.state === 'spawning') {
      if (this.spawned < B.n && this.timer <= 0) {
        const d = this.pickDoor(B.doors);
        if (d) { sim.spawnZombie(d, { kind: B.kinds?.[this.spawned] }); this.spawned++; } // (kinds: the first ones of the beat)
        this.timer = B.every;
      }
      if (this.spawned >= B.n && sim.aliveCount() === 0) {
        if (this.beat === BEATS.length - 1) { this.cleared = true; this.clearTime = sim.time; sim.emit({ type: 'encounterCleared' }); return; }
        this.state = 'breather'; this.timer = B.breather;
        sim.emit({ type: 'breather', beat: this.beat + 1, dur: B.breather });
      }
    } else if (this.timer <= 0) {
      this.beat++; this.spawned = 0; this.state = 'spawning'; this.timer = 0.2;
      sim.emit({ type: 'beatStart', beat: this.beat + 1, of: BEATS.length });
    }
  }

  get label() {
    if (this.mode === 'calm') return 'Practice';
    if (this.mode === 'room1') return 'Floor ' + (this.sim?.level?.floor || 7);
    if (this.mode === 'arena') return this.arenaLabel || 'Weapon test';
    if (this.mode === 'bench') return `Bench ${this.benchCount}`;
    if (this.cleared) return 'Cleared';
    return `Wave ${this.beat + 1}/${BEATS.length}`;
  }
}
