// Chapter 2 (Marc's neighbourhood): the gauntlet's game state and story, run inside the hospital game's simulation as
// sim.level (core/sim.js steps it after the zombies; main.js shows its prompt). The story is one generator per stop, driven
// by game time (the old Survive build's way: easy to write, skip and test): each yields once per simulation step.
// Seals ('seal:<id>' collision from the Blender export) open as the story reaches them; the view moves their props aside.
// The story (2026-10-20 reset: design/HANDOFF_NEXT.md B01 - B13 and the user's audio pack; Marc is alone):
//   home    the call at the door (Yola on the radio), the house: James at the dining table, the vaccines in the fridge
//   help    "Help!": Sophie surrounded by the infected; the bargain; she leads him to the barricade on the curve
//   gate    the chained gate; the bolt cutters in the neighbour's garage with the light on
//   club    the boat needs gas, Pete has the shed key; the looters hold the clubhouse; the rifle inside
//   pete    Pete fighting on the drive, overwhelmed; Sophie takes his key; the dose, Yola on the radio; the key
//   dock    through the lot to the dock: the playground horde, quiet; the case in the boat's cooler
//   shed    the shed up the bank: the shotgun and the gas; the engine: Sophie tries to go; the horde runs
//   horde   the horde reaches the boat first (Sophie); the shotgun
//   leave   the fuel, the boat, Yola on the radio
// Its cinematic moments (src/hood/cine.js, the user: "everything around you should kind of stop") hold the world.
import { HOOD, STAGES } from './layout.js';
import { GOALS, LINES } from './script.js';
import { ZONES } from './zones.js';
import { SHOTGUN, SHOTGUN_SPEC, PISTOL } from '../core/weapons.js';

const STEP = 1 / 60;
// the streets' infected per stop (2026-10-20, the user: "add more zombies to the outside area"): [zone (zones.js), centre
// x, z, radius, how many]; they stand about until Marc comes near (in sight within 9 m, or 4.5 m anywhere) or is heard
const AMBIENT = {
  gate: ['curve', 14, 10, 20, 4], club: ['club', 18, -32, 14, 4], pete: ['club', 64, -70, 24, 6], dock: ['dock', -2, -100, 16, 3],
};
const WAVE_EXTRA = 0.5; // (every wave brings half as many again: one more ordinary infected for every two it lists)
const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
export const STOP_ORDER = ['home', 'help', 'gate', 'club', 'pete', 'dock', 'shed', 'horde', 'leave'];
// where each stop restarts (a checkpoint): a safe spot at its start [x, y, z, yaw] (a 'start_<stop>' mark wins over these)
export const STOP_STARTS = { home: [37.5, 0, 38.5, -Math.PI / 2], help: [38.4, 0, 34.5, Math.PI * 0.85], gate: [27.5, 0, 9.5, -Math.PI / 2], club: [18.6, 0, -19.5, Math.PI],
  pete: [17.5, 0, -43.5, 2.2], dock: [36.5, 0, -80.5, -Math.PI / 2], shed: [-17, 0, -86, Math.PI], horde: [-10.5, 0, -103.5, 0], leave: [-21, 0, -80.5, -Math.PI / 2] };
// each stop's ammo and first aid [id, x, z, weapon]: in the places people would have left them (polish pass 2)
export const SUPPLIES = {
  home: [['ammo_p', 34.5, 42.2, 'pistol'], ['med', 30.6, 41.8]],
  help: [['ammo_p', 53.73, -2.47, 'pistol'], ['med', 55.68, -4.24]],
  gate: [['ammo_p', 13.0, 15.0, 'pistol'], ['med', 24.5, -7.5]],
  club: [['med', 14.5, -52.0], ['ammo_p', 12.2, -59.6, 'pistol'], ['ammo_r', 6.2, -58.6, 'rifle']],
  pete: [['ammo_r', 63.2, -72.2, 'rifle'], ['med', 48.0, -76.5], ['ammo_p', 72.5, -66.0, 'pistol']],
  dock: [['med', -19.5, -75.0]],
  horde: [['ammo_s', -12.5, -96.5, 'shotgun'], ['med', -4.5, -93.0], ['ammo_s', -21.0, -88.0, 'shotgun']],
};
// the ways Sophie knows (what the dialogue gives her: the barricade, the gate, the garage with the light on, the clubhouse,
// the dock road), as route points; she leads along them a few metres at a time (companion.js), never past the last, which
// stops short of what happens there. The guidance marker (hint.js) shows the next of them too.
export const ROUTES = {
  follow: [[44, 4.5], [38.5, 3.2], [32.4, 0.6]],                    // her garage -> the barricade on the curve
  gate: [[26.8, -1.2], [23.8, -8], [20.8, -12.2]],                  // the barricade -> the chained gate
  cutters: [[14.5, -10], [9.5, -7]],                                // -> toward the garage with the light on (short of it)
  clubhouse: [[18.5, -20], [15.5, -26], [14.2, -30.5]],             // the gate -> the clubhouse's front (short of the warning)
  dock: [[30.5, -61], [30.5, -69], [30.2, -77.5], [22, -81], [6, -81]],   // Pete's drive -> down the dock road (its gate gone: Marc's notes 9)
};
const SAVE_KEY = 'zc.hoodsave2';
export const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; } };
const writeSave = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {} };
export const clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch {} };

// the rifle (the user's Security Rifle C): it rides on the shotgun's hold and clips (its grips were built to the short pump
// shotgun's exactly); one heavy accurate round instead of a pellet cone, a 10-round magazine. The shed's shotgun takes the
// slot back (SG: the pump's own numbers, kept from before the rifle first changed them)
const RIFLE = { pellets: 1, spread: 0.004, range: 24, falloffFrom: 22, damage: 85, knockback: 5.5, mag: 10, interval: 0.42, reload: 1.7 };
const SG_SPEC = { ...SHOTGUN_SPEC };
let SG_T = null;

export class HoodLevel {
  constructor(sim, api, save = null) {
    this.sim = sim; this.api = api; // api: { view, subs, hud, audio, fx, actors, cine, voice } (hood.js)
    const s = save || {};
    this.stop = s.stop || 'home';
    // case: 'fridge' | 'carried' | 'cooler' | 'dock' (on the boards by Sophie) | 'boat'; gun: the long gun in the shotgun slot
    // (null | 'rifle' | 'shotgun'); gas: 'shed' | 'carried' | {x, z} on the ground | 'boat' | 'used'; key: null | 'sophie' | true
    this.flags = { case: 'fridge', gun: null, cutters: false, gas: 'shed', key: null, ...(s.flags || {}) };
    this.open = new Set(s.open || []);
    this.taken = new Set(s.taken || []); this.killed = new Set(); this.visited = new Set();
    this.floor = 'hood'; this.prompt = null; this.objective = ''; this.complete = false;
    this.pickups = []; this.interact = []; this.npcs = []; this.time = 0;
    this.t0 = sim.time;
    const p = sim.player, T = sim.T;
    SG_T ??= { shotgunDamage: T.shotgunDamage, shotgunKnockback: T.shotgunKnockback, shotgunMag: T.shotgunMag, shotgunInterval: T.shotgunInterval, shotgunReload: T.shotgunReload };
    // Marc's loadout: the bat and the pistol with a few spare rounds; the long gun when he has found one
    p.setLoadout(this.flags.gun ? ['bat', PISTOL, SHOTGUN, 'fists'] : ['bat', PISTOL, 'fists'], 'bat');
    p.mags[PISTOL] = s.pistolMag ?? 12; p.reserve[PISTOL] = s.pistolRes ?? 24;
    if (this.flags.gun === 'rifle') this.rifleOn(s.gunMag ?? RIFLE.mag, s.gunRes ?? 20);
    else if (this.flags.gun === 'shotgun') this.shotgunOn(s.gunMag, s.gunRes ?? 16);
    for (const id of this.open) this.applySeal(id, true);
    const st = this.mark('start_' + this.stop) || this.startFor(this.stop);
    p.x = p.px = st[0]; p.z = p.pz = st[2]; p.aimYaw = p.aimTarget = st[3] ?? Math.PI / 2;
    this.co = this.run();
  }
  mark(n) { return HOOD.marks[n] || null; }
  at(n) { const m = this.mark(n); return m ? { x: m[0], y: m[1], z: m[2], yaw: m[3] } : { x: 0, y: 0, z: 0, yaw: 0 }; }
  startFor(stop) { return STOP_STARTS[stop] || STOP_STARTS.home; }
  setGoal(k) { if (k !== this.objective) this.goalT0 = this.time; this.objective = k; this.api.hud.setObjective(GOALS[k] || k || ''); }
  // where the current objective is (the hint marker, hint.js); none while the job is to fight
  goalTarget() {
    const T = { vaccines: 'home_door_use', fridge: 'fridge_use', out: 'home_porch', cutters: 'cutters', gate: 'gate_use', clubhouse: 'club_door',
      dock: 'boat', gas: 'shed_door', shed: 'shed_gas', fuel: 'pour_fuel', leave: 'pour_fuel', caseBack: 'boat' }[this.objective];
    if (this.objective === 'help' || this.objective === 'save') return this.sophieAt || null;
    if (this.objective === 'savePete') return this.peteAt || null;
    if (this.objective === 'fuel' && typeof this.flags.gas === 'object') return this.flags.gas;
    return T ? this.at(T) : null;
  }
  // the next step toward the objective (the guidance marker): the next point of the way Sophie knows that Marc has not yet
  // passed, else the objective's own spot
  nextStep() {
    const R = ROUTES[this.objective === 'follow' && this.stop === 'gate' ? 'gate' : this.objective], p = this.sim.player;
    if (!R || (this.objective === 'dock' && this.open.has('dockroad'))) return null;   // (the way through opened: the spot itself)
    const end = R[R.length - 1], toEnd = (x, z) => Math.hypot(end[0] - x, end[1] - z);
    if (toEnd(p.x, p.z) < 4) return null;   // (there: the spot itself)
    const gt = this.goalTarget(); if (gt && Math.hypot(gt.x - p.x, gt.z - p.z) < Math.hypot(gt.x - end[0], gt.z - end[1])) return null;   // (past the way's end, nearer the objective: the objective, never back)
    const q = R.find((pt) => toEnd(pt[0], pt[1]) < toEnd(p.x, p.z) - 1.5);
    return q ? { x: q[0], z: q[1] } : null;
  }
  say(...ids) { for (const id of ids) this.api.subs.say(id); }
  // the infected's routes over this stop's area (layout.js STAGES): rebuilt as the stop starts (a few ms)
  navFor(stop) {
    const st = STAGES[stop], w = this.sim.world, p = this.sim.player; if (!st || w.bounds === st.bounds) return;
    w.bounds = st.bounds; w.buildNav(st.cell || 0.4, 0.3); w.updateFlow(p.x, p.z);
  }
  checkpoint(stop) {
    this.stop = stop; const p = this.sim.player;
    writeSave({ v: 2, stop, flags: this.flags, open: [...this.open], taken: [...this.taken], pistolMag: p.mags[PISTOL], pistolRes: p.reserve[PISTOL], gunMag: p.mags[SHOTGUN], gunRes: p.reserve[SHOTGUN] });
  }

  // ---------------------------------------------------------------- the simulation's hooks
  onWake() {}
  step(dt, input) {
    this.time += dt;
    const p = this.sim.player;
    for (const n of [...this.npcs]) n.step?.(dt, this);
    this.pickupStep(p);
    this.carryStep(p, input);
    const r = this.co.next(); if (r.done) this.co = (function* () {})();
    this.prompt = p.dead || this.api.cine?.active ? null : this.findPrompt(p);
    if (input.usePresses > 0 && this.prompt?.usable) { const it = this.interact.find((q) => q.id === this.prompt.id); it?.use?.(); }
  }

  // ---------------------------------------------------------------- seals, pickups, interactions
  applySeal(id, open = true) {
    if (open) this.open.add(id);
    for (const s of this.sim.world.shapes) if (s.tag === 'seal:' + id) this.sim.world.setOff(s, open);
    this.api.view.openSeal?.(id, open, !!this.started);
  }
  openSeal(id) { this.applySeal(id, true); this.sim.world.updateFlow(this.sim.player.x, this.sim.player.z); }
  addPickup(q) { if (this.taken.has(q.id)) return null; this.pickups.push(q); this.api.view.showPickup?.(q); return q; }
  pickupStep(p) {
    if (p.dead) return;
    for (const q of this.pickups) {
      if (Math.hypot(p.x - q.x, p.z - q.z) > (q.r || 1.2)) continue;
      if (q.when && !q.when()) continue;
      this.pickups.splice(this.pickups.indexOf(q), 1); this.taken.add(q.id);
      this.api.view.takePickup?.(q.id);
      this.api.audio?.play('reloadDone'); this.api.hud.flash?.('reload');
      if (q.label) this.api.hud.toast(q.label);
      q.onTake?.(); break;
    }
  }
  addUse(it) { this.interact = this.interact.filter((q) => q.id !== it.id); this.interact.push(it); return it; }
  dropUse(id) { this.interact = this.interact.filter((q) => q.id !== id); }
  findPrompt(p) {
    let best = null, bd = 1e9;
    for (const it of this.interact) {
      const d = Math.hypot(p.x - it.x, p.z - it.z); if (d > (it.r || 1.6) || d >= bd) continue;
      if (it.when && !it.when()) continue;
      best = it; bd = d;
    }
    if (!best) return null;
    const ok = best.can ? best.can() : true;
    return { id: best.id, label: ok ? best.label : (best.no || best.label), usable: ok };
  }
  // a prompt the story waits on: resolves (true) when used
  *use(id, mark, label, r = 1.8, extra = {}) {
    let used = false; const m = typeof mark === 'string' ? this.at(mark) : mark;
    this.addUse({ id, x: m.x, z: m.z, r, label, ...extra, use: () => { used = true; this.dropUse(id); } });
    yield* this.until(() => used);
  }

  // ---------------------------------------------------------------- the long guns and the gas can
  rifleOn(mag = RIFLE.mag, res = 20) {
    const p = this.sim.player, T = this.sim.T;
    Object.assign(SHOTGUN_SPEC, { pellets: RIFLE.pellets, spread: RIFLE.spread, range: RIFLE.range, falloffFrom: RIFLE.falloffFrom });
    Object.assign(T, { shotgunDamage: RIFLE.damage, shotgunKnockback: RIFLE.knockback, shotgunMag: RIFLE.mag, shotgunInterval: RIFLE.interval, shotgunReload: RIFLE.reload });
    if (!p.owned.includes(SHOTGUN)) p.owned.splice(Math.max(0, p.owned.indexOf('fists')), 0, SHOTGUN);
    p.mags[SHOTGUN] = mag; p.reserve[SHOTGUN] = res; this.flags.gun = 'rifle';
    this.api.view.rifleOn?.();
  }
  // the shed's pump shotgun in the slot instead (the rifle stays on the shed's rack)
  shotgunOn(mag = null, res = 16) {
    const p = this.sim.player, T = this.sim.T;
    Object.assign(SHOTGUN_SPEC, SG_SPEC); Object.assign(T, SG_T);
    if (!p.owned.includes(SHOTGUN)) p.owned.splice(Math.max(0, p.owned.indexOf('fists')), 0, SHOTGUN);
    p.mags[SHOTGUN] = mag ?? T.shotgunMag; p.reserve[SHOTGUN] = res; this.flags.gun = 'shotgun';
    this.api.view.rifleOff?.();
  }
  // carrying the gas can: a little slower, no fighting with it in hand: attacking sets it down where Marc stands (the
  // brief: "Let Marc set it down to fight and pick it up again"); Use beside it picks it up again
  carryStep(p, input) {
    const carried = this.flags.gas === 'carried', T = this.sim.T;
    T.hoodBaseSpeed ??= T.moveSpeed;
    T.moveSpeed = T.hoodBaseSpeed * (carried ? 0.84 : 1);
    const attacking = Math.hypot(input.aimX || 0, input.aimZ || 0) > 0.35 || ['swing', 'shot', 'down', 'dodge'].includes(p.action.type);
    if (carried && !p.dead && attacking) this.setGasDown(p.x + Math.sin(p.aimYaw + 1.6) * 0.5, p.z + Math.cos(p.aimYaw + 1.6) * 0.5);
  }
  setGasDown(x, z) {
    this.flags.gas = { x, z };
    this.api.view.placeGas?.(x, z);
    this.addUse({ id: 'gas', x, z, r: 1.3, label: 'Pick up the gas can', use: () => this.pickGas() });
  }
  pickGas() { this.flags.gas = 'carried'; this.dropUse('gas'); this.api.view.carryGas?.(); this.api.audio?.play('reloadDone'); }

  // ---------------------------------------------------------------- spawning
  // a zombie at a mark (or {x, z}), facing the player; opts: kind, dormant (sense m), hp, near (allow close: a scripted ring)
  spawnAt(where, opts = {}) {
    const p = this.sim.player;
    let m = typeof where === 'string' ? this.at(where) : where;
    // never on top of him, never in plain sight: a mark nearer than 11 m gives way to the farthest of its stop's others
    if (typeof where === 'string' && !opts.near && Math.hypot(m.x - p.x, m.z - p.z) < 11) {
      const pre = where.split('_').slice(0, 2).join('_') + '_';
      const alt = Object.keys(HOOD.marks).filter((n) => n.startsWith(pre)).map((n) => this.at(n)).sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z))[0];
      if (alt && Math.hypot(alt.x - p.x, alt.z - p.z) > Math.hypot(m.x - p.x, m.z - p.z)) m = alt;
    }
    const j = () => (this.sim.rand() - 0.5) * (opts.spread ?? 1.6);
    let x = m.x + j(), z = m.z + j();
    // (the polish brief's replay: a wave's mark by the yard fence put them on the far side of the boundary, where no route
    // reaches Marc, and the stop waited on them for two minutes): a spot with a way to him, the nearest within 5 m
    if (!opts.near) { const w = this.sim.world, o = {}; if (w.blockedAt(x, z, 0.4) || w.flowDir(x, z, o) > 1e7) {
      let best = null;
      for (let r = 0.75; r <= 5 && !best; r += 0.75) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, qx = m.x + Math.cos(a) * r, qz = m.z + Math.sin(a) * r; if (!w.blockedAt(qx, qz, 0.4) && w.flowDir(qx, qz, o) < 1e7) { best = [qx, qz]; break; } }
      if (best) [x, z] = best;
    } }
    const zb = this.sim.spawnZombie(null, { x, z, yaw: opts.yaw ?? Math.atan2(p.x - x, p.z - z), kind: opts.kind });
    if (opts.dormant) { zb.passive = true; zb.dormant = { wake: Infinity, sense: opts.dormant, speedMul: zb.speedMul }; zb.speedMul = 0; }
    zb.hoodWave = opts.wave || null;
    return zb;
  }
  // a wave: [[mark, kind?] ...] spawned `every` s apart (never on top of him)
  *wave(list, every = 0.8, tag = 'w') {
    const out = [];
    let extra = 0;
    for (const [where, kind, dormant] of list) {
      out.push(this.spawnAt(where, { kind, dormant, wave: tag }));
      if ((extra += WAVE_EXTRA) >= 1) { extra -= 1; out.push(this.spawnAt(where, { dormant, wave: tag, spread: 3 })); }
      yield* this.wait(every);
    }
    return out;
  }
  // a ring of infected round a point (Sophie's, Pete's), facing it, still until Marc comes near
  ring(c, n, r, opts = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.sim.rand() * 0.6, d = r * (0.8 + this.sim.rand() * 0.4), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const q = { x, z }; if (this.sim.world.resolveCircle(q, 0.45)) continue;
      out.push(this.spawnAt({ x, z }, { near: true, spread: 0, yaw: Math.atan2(c.x - x, c.z - z), dormant: opts.dormant ?? 11, kind: opts.kind, wave: opts.wave || 'ring' }));
    }
    return out;
  }
  wake(list) { for (const z of list) if (z.alive && z.dormant) { z.dormant.wake = 0; z.passive = false; z.speedMul = z.dormant.speedMul || 1; z.dormant = null; } }
  alive(group) { return group.filter((z) => z.alive).length; }
  *wait(s) { for (let t = 0; t < s; t += STEP) yield; }
  *until(fn, max = Infinity) { for (let t = 0; !fn() && t < max; t += STEP) yield; }
  *talk(...ids) { this.say(...ids); yield; yield* this.until(() => !this.api.subs.busy); }
  near(name, r) { const m = this.at(name), p = this.sim.player; return Math.hypot(p.x - m.x, p.z - m.z) < r; }
  nearXZ(q, r) { const p = this.sim.player; return Math.hypot(p.x - q.x, p.z - q.z) < r; }
  prefetch(...ids) { this.api.voice?.prefetch(ids); }
  // a cinematic moment (cine.js): the story waits until the game camera is back
  *shot(list, opts) { if (!this.api.cine) return; yield* this.api.cine.run(list, opts); }
  // lines during a held shot: the shot holds until they are said
  linesDone() { return () => !this.api.subs.busy; }
  // Marc's own spot and framing for the shots
  P(y = 1.3) { const p = this.sim.player; return [p.x, y, p.z]; }
  // a two-shot for a portrait screen (the polish brief's replay: a side-on two-shot of two people 2 m apart leaves both at the
  // edges of a phone's narrow frame): over one's shoulder at the other, both in the frame one behind the other; over Marc's
  // shoulder unless a wall is behind him, then over hers. Fixed as the shot starts (a held framing).
  twoShot(other) {
    let f = null;
    const make = () => {
      const p = this.sim.player, q = typeof other === 'function' ? other() : other, w = this.sim.world;
      for (const [a, b] of [[p, q], [q, p]]) {
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        const cx = a.x + ux * 2.3 - uz * 0.55, cz = a.z + uz * 2.3 + ux * 0.55;
        if (!w.blockedAt(cx, cz, 0.25) && w.lineOfSight(cx, cz, b.x, b.z, 1.6)) return { from: [cx, 1.75, cz], look: [b.x + ux * 0.4, 1.3, b.z + uz * 0.4] };
      }
      return { from: [(p.x + q.x) / 2 + 3.2, 3.2, (p.z + q.z) / 2 + 4.6], look: [(p.x + q.x) / 2, 1.2, (p.z + q.z) / 2] };
    };
    // (and the two turned to each other: Marc keeps whatever way he last aimed otherwise)
    const face = () => { const p = this.sim.player, q = typeof other === 'function' ? other() : other; p.aimYaw = p.aimTarget = Math.atan2(q.x - p.x, q.z - p.z); };
    return { from: () => (face(), (f ??= make()).from), look: () => (f ??= make()).look };
  }

  // ---------------------------------------------------------------- supplies (polish pass 2: never stuck for rounds)
  addSupplies(stop) {
    const S = SUPPLIES[stop] || [];
    const p = this.sim.player;
    for (const [id, x, z, w] of S) {
      const key = stop + ':' + id, med = id.startsWith('med');
      this.addPickup({ id: key, x, z, r: 1.0, model: med ? 'health' : 'ammo', label: med ? 'First aid' : w === 'rifle' ? 'Rifle rounds' : w === 'shotgun' ? 'Shotgun shells' : 'Pistol rounds',
        when: med ? () => p.hp < p.maxHp : w === 'rifle' ? () => this.flags.gun === 'rifle' : w === 'shotgun' ? () => this.flags.gun === 'shotgun' : null,
        onTake: () => { if (med) p.hp = Math.min(p.maxHp, p.hp + 50); else if (w === 'rifle' || w === 'shotgun') p.reserve[SHOTGUN] = (p.reserve[SHOTGUN] || 0) + (w === 'rifle' ? 10 : 8); else p.reserve[PISTOL] = (p.reserve[PISTOL] || 0) + 12; } });
    }
  }
  // the stop's street infected (AMBIENT): free spots inside the stop's area, out of sight (13 m+ from Marc), 3.5 m apart
  addStreetZombies(stop) {
    const A = AMBIENT[stop], P = A && ZONES[A[0]]; if (!P) return [];
    const [, cx, cz, r, n] = A, p = this.sim.player, w = this.sim.world, out = [], q = { x: 0, z: 0 };
    for (let tries = 0; out.length < n && tries < 400; tries++) {
      const a = this.sim.rand() * Math.PI * 2, d = Math.sqrt(this.sim.rand()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!inPoly(P, x, z) || Math.hypot(x - p.x, z - p.z) < 13 || out.some((o) => Math.hypot(o.x - x, o.z - z) < 3.5)) continue;
      q.x = x; q.z = z; if (w.resolveCircle(q, 0.5)) continue;
      out.push(this.spawnAt({ x, z }, { dormant: 9, spread: 0, yaw: this.sim.rand() * Math.PI * 2, wave: 'street' }));
    }
    return out;
  }

  // ---------------------------------------------------------------- Sophie (from B03 on)
  ensureSophie(at, mode = 'follow') {
    if (!this.sophie || !this.npcs.includes(this.sophie)) { this.sophie = this.api.actors?.sophie(at || this.sim.player); if (this.sophie) this.npcs.push(this.sophie); }
    if (this.sophie && mode) this.sophie.mode = mode;
    return this.sophie;
  }
  sophieTo(x, z, run = false, after = 'idle') { const s = this.sophie; if (!s) return; s.lead = null; s.target = { x, z, run }; s.after = after; s.mode = 'goto'; }
  // she shows the way: ahead along a route she knows, waiting for him (companion.js); following again at its end
  sophieLead(pts) { const s = this.sophie; if (!s || !pts) return; s.lead = { pts, i: 0, done: false }; s.mode = 'follow'; }
  // before a two-shot: she comes to stand by him (up to 6 s)
  *meet(r = 2.2) {
    const s = this.sophie, p = this.sim.player; if (!s) return;
    if (Math.hypot(s.x - p.x, s.z - p.z) <= r + 0.4) return;
    const a = Math.atan2(s.x - p.x, s.z - p.z); this.sophieTo(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, true, 'idle');
    yield* this.until(() => s.mode !== 'goto', 6);
  }

  // ---------------------------------------------------------------- the story
  *run() {
    this.started = false;
    const from = STOP_ORDER.indexOf(this.stop);
    yield; this.started = true;
    const stops = { home: this.stopHome, help: this.stopHelp, gate: this.stopGate, club: this.stopClub, pete: this.stopPete, dock: this.stopDock,
      shed: this.stopShed, horde: this.stopHorde, leave: this.stopLeave };
    // (a checkpoint after Sophie joins: she is with him again)
    if (from >= STOP_ORDER.indexOf('gate') && from <= STOP_ORDER.indexOf('dock')) { const p = this.sim.player, q = { x: p.x + 1.5, z: p.z + 2.5 }; this.sim.world.resolveCircle(q, 0.35); this.ensureSophie({ ...q, yaw: p.aimYaw }, 'follow'); } // (and from the dock: beside him, not on top of him)
    if (from >= STOP_ORDER.indexOf('shed') && from <= STOP_ORDER.indexOf('shed')) { const b = this.at('boat'); this.ensureSophie({ x: b.x + 3.2, z: b.z + 0.6, yaw: -Math.PI / 2 }, 'idle'); }
    for (let i = Math.max(0, from); i < STOP_ORDER.length; i++) {
      const id = STOP_ORDER[i];
      this.navFor(id);
      this.checkpoint(id);
      this.api.onStop?.(id);
      this.addSupplies(id);
      this.addStreetZombies(id);
      yield* stops[id].call(this);
    }
  }

  // B01 - B02. HOME: the call at the door; James; the fridge
  *stopHome() {
    const p = this.sim.player, cine = this.api.cine;
    this.setGoal('');
    const call = ['Y01', 'M01', 'Y02', 'Y03', 'M02', 'Y04', 'M03', 'Y05', 'M04', 'Y06', 'M05'];
    this.prefetch(...call, 'J01', 'J02', 'M06', 'S01', 'S02');
    yield* this.wait(1.4);
    // B01 (the call at the door): close on Marc at his door, the radio card up; nothing moves out here. (The polish brief: the
    // old framing held on his back for the whole call; now three-quarters from his right, his face and the radio at his ear.)
    this.say(...call);
    const yw = p.aimYaw, fx = Math.sin(yw), fz = Math.cos(yw), rx = -Math.cos(yw), rz = Math.sin(yw);
    yield* this.shot([{ look: () => [p.x + fx * 0.25, 1.5, p.z + fz * 0.25], from: () => [p.x + fx * 0.6 + rx * 2.5, 1.8, p.z + fz * 0.6 + rz * 2.5], fov: 44, slow: 1, hold: 2, until: this.linesDone(), max: 120 }], { back: 0.8 });
    // B02: in through the front door; James at the dining table, headphones on, his back to the door
    this.setGoal('vaccines');
    const j = this.api.actors?.james(this, this.at('james')); if (j) this.npcs.push(j);
    this.james = j;
    yield* this.use('door', 'home_door_use', 'Go in', 1.4);
    this.openSeal('home_door');
    this.tinny = this.api.voice?.tinny?.(this.at('james'));
    let alerted = false;
    if (j) j.onDeath = () => { this.api.voice?.play('J02'); this.tinny?.stop(); };
    // he notices Marc when Marc is in the room with him (4.5 m) or shoots
    yield* this.until(() => !j || !j.alive || (this.nearXZ(this.at('james'), 4.6) && p.x < 36.0) || p.action.type === 'shot');
    if (j && j.alive) {
      alerted = true;
      const jm = this.at('james'), head = () => j.headPos();
      const held = () => { let v = null; return () => (v ??= head()); }, h2 = held(), h3 = held(); // (a framing fixed as the shot cuts in: held, not following him)
      // over Marc's shoulder at James's back; James turns; close on him as he shouts; then the camera dips low behind
      // Marc, the pistol up, slow, for the shot (the user: "It dips down and you just shoot his head right off")
      const behind = (back, side, h) => () => { const a = Math.atan2(jm.x - p.x, jm.z - p.z); return [p.x - Math.sin(a) * back + Math.cos(a) * side, h, p.z - Math.cos(a) * back - Math.sin(a) * side]; };
      p.desired = PISTOL;
      if (j) j.subject = true;
      yield* this.shot([
        { look: () => [jm.x, 1.3, jm.z], from: behind(1.9, 0.55, 1.8), fov: 42, slow: 0.25, hold: 0.9 },
        { look: () => { const h = h2(); return [h[0], h[1] - 0.2, h[2]]; }, from: () => { const h = h2(); return [h[0] - 1.6, 1.64, h[2] + 1.5]; }, fov: 40, slow: 0.25, hold: 0.5, fn: () => { const d = j.turn(); cine.after(d * 0.7, () => j.shout()); this.say('J01'); } },
        { look: () => { const h = head(); return [h[0], h[1] - 0.15, h[2]]; }, from: () => { const h = h3(); return [h[0] - 1.6, 1.6, h[2] + 1.55]; }, fov: 40, slow: 0.25, hold: 1.5, until: this.linesDone(), max: 8 },
        { look: head, from: behind(1.7, 0.75, 1.0), fov: 40, slow: 0.3, aim: j.z, prompt: 'SHOOT', hold: 0.4, fn: () => j.threat(2.6), until: () => !j.alive, max: 3.2 },
        { look: head, from: behind(1.7, 0.75, 1.0), fov: 40, slow: 0.2, hold: 1.1 },
      ], { back: 0.7 });
      if (j) j.subject = false;
    }
    yield* this.until(() => !j || !j.alive);
    this.tinny?.stop();
    void alerted;
    // the vaccines: in the fridge (the user's choice). One clear interaction: open the fridge, take the case
    this.setGoal('fridge');
    const fc = this.at('fridge_case');
    this.api.view.showCase?.('fridge', fc);
    yield* this.use('fridge', 'fridge_use', 'Open the fridge', 1.4);
    const fu = this.at('fridge_use');
    p.x = p.px = fu.x; p.z = p.pz = fu.z; p.aimYaw = p.aimTarget = fu.yaw;
    // (the polish brief: the bat put away for it, his hand to the door as it swings open from its hinge; the shots from inside
    // the kitchen, never through Marc or a wall: the old ones framed his back, then the empty floor)
    const gunWas = p.desired; p.desired = 'fists';
    yield* this.wait(0.4);   // (the bat onto his back first)
    this.api.hero?.script('hood_Interact');
    yield* this.shot([
      { look: [fu.x - 0.45, 1.15, fu.z + 0.02], from: [fu.x + 1.75, 1.7, fu.z - 1.55], fov: 44, slow: 1, hold: 1.3, fn: () => cine.after(0.45, () => this.openSeal('fridge')) },
      { look: [fc.x, fc.y, fc.z], from: [fu.x + 0.8, 1.55, fu.z - 0.98], fov: 38, slow: 1, hold: 1.3 },
      { look: [fc.x, fc.y, fc.z], from: [fu.x + 0.8, 1.55, fu.z - 0.98], fov: 38, slow: 1, hold: 0.5, fn: () => { this.flags.case = 'carried'; this.api.view.showCase?.('carried'); this.say('M06'); } },
      { look: () => this.P(1.25), from: [fu.x - 0.1, 1.7, fu.z - 2.4], fov: 42, slow: 1, hold: 0.6, until: this.linesDone(), max: 4 },
    ], { back: 0.6 });
    p.desired = gunWas;
    this.setGoal('out');
    yield* this.until(() => p.x > 36.6);
  }

  // B03 - B04. "HELP!": Sophie by the B05 garage, the infected round her; the bargain; she leads to the curve's barricade
  *stopHelp() {
    const p = this.sim.player;
    const at = { x: 49.08, z: 2.88, yaw: Math.PI * 0.8 }; // (B05's drive: the row moved with the map clean-up)
    this.sophieAt = at;
    const sp = this.ensureSophie(at, 'scared');
    const ring = this.ring(at, 6, 2.6, { dormant: 12 });
    this.prefetch('S03', 'S03a', 'M06a', 'S04', 'S05', 'S06', 'S07', 'M07', 'S08');
    yield* this.wait(0.6);
    this.say('S01');
    this.setGoal('help');
    yield* this.until(() => this.nearXZ(at, 22), 6);
    this.say('S02');
    yield* this.until(() => this.nearXZ(at, 15));
    // a held look at her, still, the infected round her
    yield* this.shot([{ look: [at.x, 0.9, at.z], from: { yaw: 35, pitch: 30, dist: 7.5 }, fov: 42, slow: 0.12, hold: 1.7 }], { back: 0.5 });
    this.wake(ring);
    this.setGoal('save');
    const w = yield* this.wave([['z_home_garage'], ['z_home_fence'], ['z_home_garage', 'runner']], 1.4, 'help');
    yield* this.until(() => this.alive(ring) + this.alive(w) === 0, 120);
    yield* this.wait(0.8);
    // the bargain: the two of them, a held two-shot
    yield* this.meet();
    sp.mode = 'idle'; sp.idle = 'hood_Idle_Tired_Loop';
    const two = this.twoShot(() => this.sophie || at);
    this.say('S03', 'S03a', 'M06a', 'S04', 'S05', 'S06', 'S07', 'M07', 'S08');
    yield* this.shot([{ look: two.look, from: two.from, fov: 46, slow: 1, hold: 2, until: this.linesDone(), max: 90 }], { back: 0.7 });
    sp.idle = 'hood_Idle_Loop';
    this.sophieAt = null;
    // "Follow me. I know a way": she goes ahead to the curve and he follows her past it. (The curve's barricade went with
    // Marc's map notes, 2026-10-21; its "Push the barricade over" stayed behind, a prompt for nothing that held the story up:
    // out 2026-10-22. He only has to reach where it stood)
    this.setGoal('follow');
    this.sophieLead(ROUTES.follow);
    const by = this.at('seal_home_use');
    yield* this.until(() => Math.hypot(this.sim.player.x - by.x, this.sim.player.z - by.z) < 3);
  }

  // B05. THE GATE: chained; the bolt cutters in the neighbour's garage with the light on
  *stopGate() {
    const p = this.sim.player;
    if (!this.open.has('home')) this.openSeal('home');
    const sp = this.ensureSophie(null, null);
    this.prefetch('S09', 'S10', 'M08', 'M08a', 'S11', 'S12');
    this.sophieLead(ROUTES.gate);
    this.setGoal('follow');
    yield* this.until(() => this.near('gate_use', 6));
    // "The garage with the light on": a look across at it
    this.api.view.garageLight?.(true);
    const gl = this.at('garage_light');
    this.say('S09');
    yield* this.shot([{ look: [gl.x, 1.2, gl.z], from: { yaw: 35, pitch: 28, dist: 9 }, fov: 42, slow: 0.4, hold: 2.2, move: 0.9 }], { back: 0.7 });
    this.say('S10', 'M08');
    this.sophieLead(ROUTES.cutters);
    this.setGoal('cutters');
    const c = this.at('cutters');
    this.addPickup({ id: 'cutters', x: c.x, z: c.z, y: c.y || undefined, r: 1.3, model: 'cutters', label: 'Bolt cutters', onTake: () => { this.flags.cutters = true; } }); // (on the workbench under the light)
    const w1 = [this.spawnAt('z_garage', { dormant: 5.5 }), this.spawnAt('z_garage', { dormant: 5.5 })];
    yield* this.until(() => Math.hypot(p.x - 6, p.z + 2) < 10 || this.flags.cutters);
    const w2 = yield* this.wave([['z_curve_bus'], ['z_curve_yard', 'runner']], 1.3, 'c1');
    yield* this.until(() => this.flags.cutters);
    this.api.view.garageLight?.(false);
    this.setGoal('gate');
    yield* this.use('gate', 'gate_use', 'Cut the chain', 2.2);
    this.api.audio?.play('pumpRack'); yield* this.wait(0.7); this.api.audio?.play('knockdown');
    this.openSeal('gate');
    void w1; void w2;
  }

  // B06 - B07. THE CLUBHOUSE: the boat needs gas, Pete has the key; the looters; the rifle
  *stopClub() {
    const p = this.sim.player, sp = this.ensureSophie(null, null);
    this.flags.cutters = true;
    this.prefetch('L01', 'L02', 'L03', 'L04', 'M09', 'LB01', 'LB02', 'LB03', 'LB04');
    yield* this.wait(1.0);
    yield* this.talk('M08a', 'S11', 'S12');
    this.sophieLead(ROUTES.clubhouse);
    this.setGoal('clubhouse');
    yield* this.until(() => this.near('club_warn', 7));
    this.say('L01');
    this.api.warnShot?.(this.at('club_door'), p);
    if (sp) this.sophieTo(20.5, -35.5, true, 'scared'); // (back behind the van at the club front, out of their line)
    const L = this.api.looters?.(this) || [];
    this.looters = L;
    yield* this.until(() => this.near('club_door', 10));
    this.say('L02');
    this.openSeal('clubdoor');
    // the rifle in the office
    const r = this.at('keys');
    this.addPickup({ id: 'rifle', x: r.x, z: r.z, r: 1.1, model: 'rifle', label: 'Rifle', onTake: () => {
      this.rifleOn(); p.desired = SHOTGUN;
      if (L.some((q) => q.alive)) this.say('L04');
    } });
    yield* this.until(() => this.near('club_door', 2.6) || L.filter((q) => q.out && q.alive).length === 0, 240);
    if (L.some((q) => q.alive)) this.say('L03');
    yield* this.until(() => L.every((q) => !q.alive), 600);
    yield* this.wait(0.8);
    yield* this.talk('M09');
    if (sp) sp.mode = 'follow';
  }

  // B08. PETE on the drive; Sophie takes his key; the dose (Yola on the radio); the key
  *stopPete() {
    const p = this.sim.player, sp = this.ensureSophie(null, 'follow');
    const pa = { x: 27.6, z: -54.5, yaw: Math.PI * 0.75 };
    this.peteAt = pa;
    const pete = this.api.actors?.pete(pa); if (pete) this.npcs.push(pete);
    const ring = this.ring(pa, 5, 3.4, { dormant: 0 }); // (awake: on him; he shoots them)
    for (const z of ring) { z.passive = true; z.speedMul = 0.25; } // (they press round him, slowly)
    this.prefetch('P01', 'P02', 'P03', 'S13', 'M10', 'S14', 'M11', 'Y07', 'M12', 'Y08', 'Y09', 'M13', 'Y10', 'M14', 'S15');
    yield* this.wait(0.8);
    this.say('P01');
    this.setGoal('savePete');
    yield* this.until(() => this.nearXZ(pa, 16), 25);
    this.say('P02');
    const w = yield* this.wave([['z_drive_a'], ['z_drive_b', 'runner']], 1.0, 'd1');
    yield* this.until(() => this.nearXZ(pa, 11), 14);
    // he goes under: slow, close; the world held
    if (pete) pete.subject = true;
    yield* this.shot([
      { look: [pa.x, 1.2, pa.z], from: { yaw: 35, pitch: 20, dist: 4.4 }, fov: 40, slow: 0.12, rate: 0.55, hold: 0.5, fn: () => { this.say('P03'); } },
      { look: [pa.x, 0.9, pa.z], from: { yaw: 50, pitch: 26, dist: 3.8 }, fov: 40, slow: 0.12, rate: 0.45, hold: 2.2, fn: () => pete?.overwhelm() },
    ], { back: 0.6 });
    if (pete) pete.subject = false;
    this.peteAt = null;
    for (const z of ring) { z.passive = false; z.speedMul = 1; }
    this.wake(ring);
    // Sophie, brave only to take something: she runs for the key while he fights
    let gotKey = false;
    // (the polish brief: she knelt on his back; now beside his chest, on the camera's side, facing him: from where his body lies)
    const bones = {}, bodyAt = () => { const P = pete?.obj, at = (n) => { const o = bones[n] ??= P?.getObjectByName(n); if (!o) return null; o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return { x: e[12], z: e[14] }; };
      const h = at('mixamorigHips'), c = at('mixamorigSpine2') || h, hd = at('mixamorigHead') || c; if (!h) return { x: pa.x - 0.7, z: pa.z + 0.5, face: pa };
      let ax = hd.x - h.x, az = hd.z - h.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; let nx = -az, nz = ax; if (nx * 0.57 + nz * 0.82 < 0) { nx = -nx; nz = -nz; }
      const q = { x: c.x + nx * 0.75, z: c.z + nz * 0.75 }; this.sim.world.resolveCircle(q, 0.3); return { ...q, face: c }; };
    // (read every frame while she runs in: his body is still falling as she sets off)
    if (sp) { let k = bodyAt(); sp.target = { get x() { return (k = bodyAt()).x; }, get z() { return k.z; }, run: true, done: () => { sp.mode = 'idle'; sp.face = k.face; this.later(0.45, () => { sp.mode = 'pose'; sp.pose = 'hood_PickUp_Kneeling'; }); this.later(1.75, () => { gotKey = true; this.flags.key = 'sophie'; this.say('S13'); sp.face = null; sp.mode = 'scared'; }); } }; sp.after = 'pose'; sp.mode = 'goto'; }   // (a moment to turn to him, then down)
    else { gotKey = true; this.flags.key = 'sophie'; }
    yield* this.until(() => gotKey && this.alive([...ring, ...w]) <= 1, 120);
    yield* this.wait(1.0);
    // the key: she wants a dose first; Marc calls Yola (the radio card), then gives his word
    yield* this.meet();
    if (sp) { sp.mode = 'idle'; sp.idle = 'hood_Idle_Talking_Loop'; }
    const two = this.twoShot(() => this.sophie || pa);
    this.say('M10', 'S14', 'M11', 'Y07', 'M12', 'Y08', 'Y09', 'M13', 'Y10', 'M14', 'S15');
    yield* this.shot([{ look: two.look, from: two.from, fov: 46, slow: 1, hold: 2, until: this.linesDone(), max: 120 }], { back: 0.7 });
    this.flags.key = true; this.api.hud.toast('The shed key');
    if (sp) { sp.idle = 'hood_Idle_Loop'; sp.mode = 'follow'; }
  }

  // B09. THE DOCK: through the lot and down the service road; the playground; quiet; the case in the cooler
  *stopDock() {
    const p = this.sim.player, sp = this.ensureSophie(null, 'follow');
    this.prefetch('M15', 'M16', 'M17', 'S16', 'M18', 'S17', 'M19', 'S18', 'M20', 'S19');
    this.sophieLead(ROUTES.dock);
    this.setGoal('dock');
    const b = this.at('boat');
    yield* this.until(() => this.nearXZ(b, 9));
    yield* this.talk('M15');
    // the playground: the horde, about thirty, standing about (the user: "pan to the playground and show there are about
    // 30 zombies there")
    const pg = this.at('playground');
    this.ensureHorde();
    yield* this.wait(0.4);
    this.say('M16', 'M17');
    yield* this.shot([
      { look: [pg.x, 0.9, pg.z], from: { yaw: 35, pitch: 26, dist: 15 }, fov: 42, slow: 1, hold: 0.3 },
      { look: [pg.x + 2, 0.9, pg.z - 2], from: { yaw: 30, pitch: 22, dist: 12 }, fov: 42, slow: 1, move: 4.5, hold: 0.2, until: this.linesDone(), max: 14 },
    ], { back: 1.0 });
    yield* this.talk('S16');
    // the case in the boat's cooler
    this.setGoal('');
    this.api.view.showCooler?.(true);
    yield* this.use('cooler', 'pour_fuel', 'Put the case in the cooler', 2.4);
    const cp = this.api.view.coolerAt?.() || { x: b.x, y: 0.5, z: b.z };
    this.say('M18');
    yield* this.shot([{ look: [cp.x, cp.y + 0.1, cp.z], from: [cp.x + 1.4, cp.y + 1.1, cp.z + 1.3], fov: 38, slow: 1, hold: 1.0, fn: () => { this.flags.case = 'cooler'; this.api.view.showCase?.('cooler'); } },
      { look: () => this.P(1.2), from: { yaw: 35, pitch: 24, dist: 5.5 }, fov: 40, slow: 1, hold: 0.5, until: this.linesDone(), max: 6 }], { back: 0.6 });
    if (sp) { this.sophieTo(b.x + 3.2, b.z + 0.6, false, 'idle'); }
    yield* this.talk('S17', 'M19', 'S18', 'M20', 'S19');
  }

  // the playground's horde, about thirty standing about (made at the dock; again on a retry from the shed)
  ensureHorde() {
    if (this.horde?.some((z) => z.alive)) return this.horde;
    const pg = this.at('playground'); this.horde = [];
    for (let i = 0; i < 26; i++) {
      const a = this.sim.rand() * Math.PI * 2, d = 1.5 + Math.sqrt(this.sim.rand()) * 7.5, x = pg.x + Math.cos(a) * d, z = pg.z + Math.sin(a) * d, q = { x, z };
      if (this.sim.world.resolveCircle(q, 0.45)) continue;
      this.horde.push(this.spawnAt({ x, z }, { near: true, spread: 0, yaw: this.sim.rand() * 6.28, dormant: 2.5, kind: i % 5 === 0 ? 'runner' : undefined, wave: 'horde' }));
    }
    return this.horde;
  }

  // B10 - B11. THE SHED: unlocked with Pete's key; the chainsaw, the shotgun, the gas; the engine; the horde runs
  *stopShed() {
    const p = this.sim.player, sp = this.ensureSophie(null, null);
    this.ensureHorde();
    this.prefetch('M21', 'M22', 'M23', 'S20', 'S21', 'S22', 'M24', 'ENGINE', 'S23');
    this.setGoal('gas');
    yield* this.use('shed', 'shed_door', 'Unlock the shed', 1.6, { can: () => this.flags.key === true, no: 'Locked' });
    this.openSeal('shed');
    const cs = this.at('shed_chainsaw'), sg = this.at('shed_shotgun'), gs = this.at('shed_gas'), dr = this.at('shed_door');
    let gun = false;
    this.addPickup({ id: 'shotgun', x: sg.x - 0.45, z: sg.z, y: sg.y, r: 0.8, model: 'shotgun', label: 'Shotgun', onTake: () => { gun = true; this.shotgunOn(null, 16); p.desired = SHOTGUN; } });
    if (this.flags.gas === 'shed') { this.api.view.placeGas?.(gs.x, gs.z); this.addUse({ id: 'gas', x: gs.x, z: gs.z, r: 1.3, label: 'Take the gas can', use: () => this.pickGas() }); }
    // (the shotgun's reach 0.8 m: at 1.0 it could be taken through the shed's east wall from outside; the polish brief's replay)
    // what is in there: the chainsaw on the bench, the shotgun on the rack, the can on the floor; the world held
    yield* this.shot([
      { look: [cs.x, cs.y + 0.1, cs.z], from: [dr.x + 0.3, 1.75, dr.z - 0.6], fov: 40, slow: 0.1, hold: 1.4, move: 0.8 },
      { look: [sg.x - 0.1, sg.y - 0.05, sg.z], from: [sg.x - 2.3, sg.y + 0.45, sg.z + 1.25], fov: 40, slow: 0.1, hold: 1.4 },
      { look: [gs.x, 0.3, gs.z], from: [gs.x - 1.5, 1.45, gs.z + 1.6], fov: 40, slow: 0.1, hold: 1.2 },
    ], { back: 0.7 });
    this.setGoal('shed');
    yield* this.until(() => gun && this.flags.gas !== 'shed');
    yield* this.talk('M21');
    // the engine: Sophie at the outboard; the noise; the playground hears
    const b = this.at('boat'), pg = this.at('playground');
    // (the crowd's middle, live: the shots follow it; the polish brief's replay: a low, narrow frame showed one of them)
    const crowd = () => { const a = (this.horde || []).filter((z) => z.alive); let x = 0, z = 0; for (const q of a) { x += q.x; z += q.z; } return a.length ? [x / a.length, 1.0, z / a.length] : [pg.x, 1.0, pg.z]; };
    if (sp) { sp.mode = 'pose'; sp.pose = 'hood_PickUp_Kneeling'; sp.subject = true; }
    this.api.voice?.play('ENGINE');
    this.say('M22', 'M23', 'S20');
    yield* this.shot([
      { look: [b.x, 0.6, b.z], from: [p.x + 1.4, 4.2, p.z + 1.8], fov: 34, slow: 0.4, hold: 2.6 },
      { look: crowd, from: { yaw: 50, pitch: 32, dist: 16 }, fov: 46, slow: 0.35, hold: 0.6, fn: () => { this.sim.world.rallyAt(-16.5, -63.5); for (const z of this.horde || []) { this.wake([z]); z.kind === 'runner' || (z.speedMul *= 1.6); } } },
      { look: crowd, from: { yaw: 40, pitch: 36, dist: 17 }, fov: 46, slow: 0.35, hold: 2.4, move: 2.4 },
    ], { back: 0.6 });
    if (sp) sp.subject = false;
    this.say('S21', 'S22', 'M24');
  }

  // B12. THE HORDE reaches the boat before Marc can; Sophie; the shotgun
  *stopHorde() {
    const p = this.sim.player, sp = this.sophie, b = this.at('boat');
    this.setGoal('sophie');
    // the playground's runners are far off: what reaches her first comes through the club's dock gate, by the pool
    // (out of sight from the shed, the playground's runners come in through the club's dock gate by the pool: the first four at
    // once, on her; the rest two at a time)
    this.openSeal('dock'); this.sim.world.rallyAt(null);
    const GATE = [[-16, -66.5], [-19, -66], [-13.5, -66.8], [-21, -66.2]], far = (this.horde || []).filter((z) => z.alive), first = [];
    const bring = (z, i) => { const [gx, gz] = GATE[i % GATE.length]; z.x = z.px = gx + (this.sim.rand() - 0.5) * 2; z.z = z.pz = gz - this.sim.rand() * 3; z.vx = z.vz = 0; return z; };
    for (let i = 0; i < 4; i++) first.push(far.length ? bring(far.shift(), i) : this.spawnAt({ x: GATE[i][0], z: GATE[i][1] - 2 }, { near: true, spread: 0.8, kind: 'runner', wave: 'horde1' }));
    this.later(2.0, () => { let i = 0; const next = () => { if (!far.length) return; bring(far.shift(), i++); if (far.length) bring(far.shift(), i++); this.later(0.9, next); }; next(); });
    let dead = false;
    const t0 = this.time;
    yield* this.until(() => !sp || first.some((z) => z.alive && Math.hypot(z.x - sp.x, z.z - sp.z) < 2.2) || this.time - t0 > 3.0);
    if (sp && !dead) { dead = true; this.api.voice?.play('S23'); sp.die(); }
    this.setGoal('horde');
    const w = yield* this.wave([['z_dock_a', 'sprinter'], ['z_dock_b', 'runner']], 2.5, 'h2');
    yield* this.until(() => this.alive([...first, ...w, ...(this.horde || [])]) <= 1, 300);
    yield* this.wait(1.2);
    if (this.flags.case === 'cooler') this.flags.case = 'boat';
    yield* this.talk('M25');
  }

  // B13. LEAVING: the fuel, the boat, Yola
  *stopLeave() {
    const p = this.sim.player, b = this.at('pour_fuel');
    this.prefetch('M26', 'Y11', 'M27', 'Y12', 'M28', 'Y13', 'M29');
    this.setGoal('fuel');
    let fuelled = false, launched = false;
    this.addUse({ id: 'fuel', x: b.x, z: b.z, r: 2.4, label: 'Fuel the boat', no: 'Bring the gas can', can: () => this.flags.gas === 'carried', use: () => { fuelled = true; this.dropUse('fuel'); } });
    yield* this.until(() => fuelled);
    this.api.audio?.play('reloadDone'); this.flags.gas = 'used'; if (this.api.view.gas) { this.api.view.gas.visible = false; this.api.view.gasMode = 'used'; }
    this.setGoal('leave');
    this.addUse({ id: 'launch', x: b.x, z: b.z, r: 2.4, label: 'Push off', use: () => { launched = true; this.dropUse('launch'); } });
    yield* this.until(() => launched);
    // aboard: the boat pulls away from the dock out over the lake, the camera with it; Yola on the radio
    const boat = this.api.view.boatStart?.();
    this.say('M26', 'Y11', 'M27', 'Y12', 'M28', 'Y13', 'M29');
    if (boat) {
      this.boating = true; // (Marc stands in the boat: hood.js lifts him onto its floor)
      const dir = { x: -0.99, z: -0.14 };
      for (let t = 0; t < 30 && (t < 11 || this.api.subs.busy); t += STEP) {
        const k = Math.min(1, t / 11), s = 26 * k * k + Math.max(0, t - 11) * 2.4, bx = boat.x + dir.x * s, bz = boat.z + dir.z * s;
        this.api.view.boatAt(bx, bz, t);
        p.x = p.px = bx; p.z = p.pz = bz; p.vx = p.vz = 0;
        for (const z of this.sim.zombies) if (z.alive && Math.hypot(z.x - bx, z.z - bz) < 2) z.x += 0.6; // (nobody climbs aboard)
        yield;
      }
    } else yield* this.until(() => !this.api.subs.busy);
    this.complete = true; this.setGoal('');
    this.api.onComplete?.();
    clearSave();
  }

  // a little later, in game time (a one-off beside the story)
  later(s, fn) { const self = this; const co = (function* () { yield* self.wait(s); fn(); })(), t = { step() { if (!t.done && co.next().done) { t.done = true; self.npcs = self.npcs.filter((q) => q !== t); } } }; this.npcs.push(t); }
}
void LINES;
