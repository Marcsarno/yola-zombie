// Chapter 2 (Marc's neighbourhood): the gauntlet's game state and story, run inside the hospital game's simulation as
// sim.level (core/sim.js steps it after the zombies; main.js shows its prompt). The story is one generator per stop, driven
// by game time (the old Survive build's way: easy to write, skip and test): each yields once per simulation step.
// Seals ('seal:<id>' collision from the Blender export) open as the story reaches them; the view moves their props aside.
// The story, version 3 (2026-10-22: design/HANDOFF_NEXT.md beats 1 - 18, Marc's dialogue pack; Marc is alone, the vaccine
// only works before a bite, four doses):
//   sneak   1 - 3   in from the barricade at the south end, crouched for the opening; the two looters far off (a look); Yola
//                   on the radio; past them up the road; the end house, its door ajar
//   house   4       James at the kitchen's fridge (the wrong one): the dip, his head; the garage's fridge, behind the beer
//   rescue  5 - 7   shots and screams down the court: Adam bitten in their yard; the wave; he turns in Sophie's arms; the
//                   reveal (the case's symbol, "it only works before"); the boat deal; the radio's battery light
//   gate    8 - 9   the gate locked: Sophie picks it; the busted house by it: the crowbar, the batteries; Yola's call
//   club    10 - 11 the walk (a pistol fight); the clubhouse: "don't use your gun", the horde at the playground; the case set
//                   down (glance two); melee only inside; the suppressor; "He must have it on him"
//   lot     12      Pete in the lot under the infected; the silenced pistol; Sophie takes his key
//   dock    13      her boat, nearly dry; the cooler; the case handed over (glance three); the shed's key
//   shed    14      the shed up the bank: the shotgun, the gas; the engine: the horde runs
//   horde   15 - 16 the six on Sophie; the shotgun (one slow beat on the first blast); the horde in waves
//   after   17      silence; Marc over her; the case at her feet
//   leave   18      the fuel, the motor, the water, Yola on the radio
// Its cinematic moments (src/hood/cine.js, the user: "everything around you should kind of stop") hold the world; the shots
// are framed for a phone held upright (subjects stacked in depth or close, not spread across the frame) and checked for
// anything between the lens and what it looks at (?cinecheck=1: hood.js). The music follows the beat (music(); hood music.js).
import { HOOD, STAGES, groundY } from './layout.js';
import { GOALS } from './script.js';
import { ZONES } from './zones.js';
import { SHOTGUN, PISTOL } from '../core/weapons.js';

const STEP = 1 / 60;
const groundAt = (q) => groundY(q.x, q.z);   // (the pier's deck: 0.39 m up)
// the streets' infected per stop (2026-10-20, the user: "add more zombies to the outside area"): [zone (zones.js), centre
// x, z, radius, how many]; they stand about until Marc comes near (in sight within 9 m, or 4.5 m anywhere) or is heard
const AMBIENT = {
  rescue: ['south', 4, 40, 16, 3], gate: ['curve', 14, 10, 20, 4], club: ['club', 18, -30, 10, 3], lot: ['club', 60, -78, 22, 5], dock: ['dock', -2, -92, 12, 2],
};
const WAVE_EXTRA = 0.5; // (every wave brings half as many again: one more ordinary infected for every two it lists)
const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
export const STOP_ORDER = ['sneak', 'house', 'rescue', 'gate', 'club', 'lot', 'dock', 'shed', 'horde', 'after', 'leave'];
// where each stop restarts (a checkpoint): a safe spot at its start [x, y, z, yaw] (a 'start_<stop>' mark wins over these)
export const STOP_STARTS = { sneak: [45.6, 0, 80.4, Math.PI], house: [38.6, 0, 40.2, -Math.PI / 2], rescue: [38.4, 0, 38.5, Math.PI / 2], gate: [15.5, 0, 57.5, -Math.PI / 2],
  club: [18.6, 0, -19.5, Math.PI], lot: [17.5, 0, -43.5, 2.2], dock: [62, 0, -70, -Math.PI / 2], shed: [-19.5, 0, -82.5, Math.PI], horde: [-17.2, 0, -95.2, 0],
  after: [-21, 0, -86, -Math.PI / 2], leave: [-21, 0, -82.5, -Math.PI / 2] };
// each stop's ammo and first aid [id, x, z, weapon]: in the places people would have left them
export const SUPPLIES = {
  house: [['ammo_p', 34.5, 42.2, 'pistol'], ['med', 30.6, 41.8]],
  rescue: [['ammo_p', 15.6, 63.4, 'pistol'], ['med', 9.4, 63.8]],
  gate: [['ammo_p', 13.0, 15.0, 'pistol'], ['med', 24.5, -7.5]],
  club: [['med', 14.5, -52.0], ['ammo_p', 12.2, -59.6, 'pistol']],
  lot: [['ammo_p', 72.5, -66.0, 'pistol'], ['med', 48.0, -76.5]],
  dock: [['med', -19.5, -75.0]],
  horde: [['ammo_s', -12.5, -93.5, 'shotgun'], ['med', -4.5, -93.0], ['ammo_s', -21.0, -88.0, 'shotgun'], ['ammo_s', -6.5, -84.6, 'shotgun'], ['ammo_s', -24.5, -76.5, 'shotgun']],
};
// the ways Sophie knows, as route points; she leads along them a few metres at a time (companion.js), never past the last.
// The guidance marker (hint.js) shows the next of them too.
export const ROUTES = {
  gate: [[6.5, 57.5], [1.2, 50], [0.8, 32], [2.5, 14], [8.5, 2], [14.5, -7.5], [17.6, -12.6]],   // her yard -> the court's west end, up the loop's west leg, to the gate
  clubhouse: [[18.5, -20], [15.5, -26], [14.2, -31], [12.4, -37.5]],                              // the gate -> the clubhouse's front
  dock: [[66, -72], [50, -79], [31, -81], [12, -81], [-6, -81], [-18, -81.5]],                     // the lot -> down the service road to the dock
};
// the people (beats 1, 5, 12): the two looters at the start, Adam and Sophie in their yard at the court's west end (Marc's
// picture: their wagon nose-in on the drive, ch2_notes.py story3), Pete in the lot between the dark SUV and the van (his)
const LOOTERS_AT = [{ x: 51.6, z: 31.0, face: [58.5, 27.5] }, { x: 52.6, z: 32.6, face: [58.5, 30.5] }];   // (in a drive's mouth off the road, the hornet and the coupe either side)
const ADAM_AT = { x: 11.6, z: 60.9, yaw: -2.3 }, SOPHIE_YARD = { x: 12.9, z: 62.4, yaw: -2.6 };
const PETE_AT = { x: 74.6, z: -67.2, yaw: 2.4 };   // (between the crashed pickup and the box truck: Marc's X)
const OFFICE = { x: 9.6, z: -59.6 };   // (where Sophie checks the clubhouse's office: by the desk, the 'keys' mark)
const SAVE_KEY = 'zc.hoodsave3';
export const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; } };
const writeSave = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {} };
export const clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch {} };

export class HoodLevel {
  constructor(sim, api, save = null) {
    this.sim = sim; this.api = api; // api: { view, subs, hud, audio, fx, actors, cine, voice, music } (hood.js)
    const s = save || {};
    this.stop = s.stop || 'sneak';
    // case: 'fridge' | 'carried' | 'ground' (set down: caseAt) | 'held' (Sophie's hands) | 'cooler' | 'dead' (at her feet)
    // | 'boat'; gun: null | 'shotgun'; gas: 'shed' | 'carried' | {x, z} on the ground | 'used'; key: null | 'sophie' | true;
    // crowbar, batteries, silencer: found; called: Yola's call (beat 9) heard
    this.flags = { case: 'fridge', gun: null, gas: 'shed', key: null, crowbar: false, batteries: false, silencer: false, called: false, ...(s.flags || {}) };
    this.caseAt = s.caseAt || null;
    this.open = new Set(s.open || []);
    this.taken = new Set(s.taken || []); this.killed = new Set(); this.visited = new Set();
    this.floor = 'hood'; this.prompt = null; this.objective = ''; this.complete = false;
    this.pickups = []; this.interact = []; this.npcs = []; this.time = 0;
    this.t0 = sim.time; this.lastShotT = -1;
    const p = sim.player;
    this.loadout(this.flags.crowbar ? 'crowbar' : PISTOL);
    p.mags[PISTOL] = s.pistolMag ?? 12; p.reserve[PISTOL] = s.pistolRes ?? 24;
    if (this.flags.gun === 'shotgun') { p.mags[SHOTGUN] = s.gunMag ?? sim.T.shotgunMag; p.reserve[SHOTGUN] = s.gunRes ?? 16; }
    for (const id of this.open) this.applySeal(id, true);
    const st = this.mark('start_' + this.stop) || this.startFor(this.stop);
    p.x = p.px = st[0]; p.z = p.pz = st[2]; p.aimYaw = p.aimTarget = st[3] ?? Math.PI / 2;
    this.co = this.run();
  }
  // Marc's weapons: the pistol from the start, the crowbar once found (one-handed: the case in his other hand), the shed's
  // shotgun at the end
  loadout(equip = null) {
    const p = this.sim.player, list = [...(this.flags.crowbar ? ['crowbar'] : []), PISTOL, ...(this.flags.gun === 'shotgun' ? [SHOTGUN] : []), 'fists'];
    const was = p.desired; p.setLoadout(list, equip || (list.includes(was) ? was : PISTOL));
  }
  mark(n) { return HOOD.marks[n] || null; }
  at(n) { const m = this.mark(n); return m ? { x: m[0], y: m[1], z: m[2], yaw: m[3] } : { x: 0, y: 0, z: 0, yaw: 0 }; }
  startFor(stop) { return STOP_STARTS[stop] || STOP_STARTS.sneak; }
  setGoal(k) { if (k !== this.objective) this.goalT0 = this.time; this.objective = k; this.api.hud.setObjective(GOALS[k] || k || ''); }
  music(cue, fade) { this.api.music?.set(cue, fade); }
  // where the current objective is (the guidance marker, hint.js); none while the job is to fight
  goalTarget() {
    const o = this.objective;
    const T = { sneak: 'home_door_use', house: 'home_door_use', vials: 'gfridge_use', clubhouse: 'club_warn', dock: 'boat', shed: 'shed_door', fuel: 'pour_fuel', leave: 'pour_fuel' }[o];
    if (o === 'help' || o === 'save') return this.sophieAt || null;
    if (o === 'savePete') return PETE_AT;
    if (o === 'follow' || o === 'pete') return this.sophie ? { x: this.sophie.x, z: this.sophie.z } : null;
    if (o === 'quiet') return this.flags.crowbar ? this.at('garage_light') : this.at('cutters');
    if (o === 'batteries') return this.at('cutters');
    if (o === 'gate') return this.at('gate_use');
    if (o === 'clear') return this.flags.silencer ? null : this.at('keys');
    if ((o === 'takeCase' || o === 'caseBack') && this.caseAt) return this.caseAt;
    if (o === 'sophie') return this.sophie ? { x: this.sophie.x, z: this.sophie.z } : this.at('boat');
    if (o === 'fuel' && typeof this.flags.gas === 'object') return this.flags.gas;
    return T ? this.at(T) : null;
  }
  // the next step toward the objective (the guidance marker): the next point of the way Sophie knows that Marc has not yet
  // passed, else the objective's own spot
  nextStep() {
    const R = this.objective === 'follow' ? ROUTES[this.route] : null, p = this.sim.player;
    if (!R) return null;
    const end = R[R.length - 1], toEnd = (x, z) => Math.hypot(end[0] - x, end[1] - z);
    if (toEnd(p.x, p.z) < 4) return null;
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
    writeSave({ v: 3, stop, flags: this.flags, caseAt: this.caseAt, open: [...this.open], taken: [...this.taken], pistolMag: p.mags[PISTOL], pistolRes: p.reserve[PISTOL], gunMag: p.mags[SHOTGUN], gunRes: p.reserve[SHOTGUN] });
  }

  // ---------------------------------------------------------------- the simulation's hooks
  onWake() {}
  step(dt, input) {
    this.time += dt;
    const p = this.sim.player;
    for (const n of [...this.npcs]) n.step?.(dt, this);
    this.pickupStep(p);
    this.carryStep(p, input);
    this.sneakStep(p, input);
    // Marc's own shots this step (the sim's events: the noise rule at the clubhouse, the first shotgun blast)
    for (const e of this.sim.events) if ((e.type === 'shot' || e.type === 'shotgun') && e.t > this.lastShotT) { this.lastShotT = e.t; this.onShot?.(e.type); }
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

  // ---------------------------------------------------------------- the shotgun, the gas can, the case
  shotgunOn(mag = null, res = 16) {
    const p = this.sim.player, T = this.sim.T;
    this.flags.gun = 'shotgun'; this.loadout(SHOTGUN);
    p.mags[SHOTGUN] = mag ?? T.shotgunMag; p.reserve[SHOTGUN] = res;
  }
  // carrying the gas can: a little slower, no fighting with it in hand: attacking sets it down where Marc stands; Use beside
  // it picks it up again
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
  // the case set down (where: {x, z, yaw}); Use beside it takes it again
  setCaseDown(where, label = 'Take the case') {
    this.flags.case = 'ground'; this.caseAt = { x: where.x, z: where.z, yaw: where.yaw || 0 };
    this.api.view.showCase?.('ground', this.caseAt);
    this.addUse({ id: 'case', x: where.x, z: where.z, r: 1.4, label, use: () => this.takeCase() });
  }
  takeCase() { this.flags.case = 'carried'; this.caseAt = null; this.dropUse('case'); this.api.view.showCase?.('carried'); this.api.audio?.play('reloadDone'); this.api.hero?.script('hood_PickUp_Kneeling', { fadeIn: 0.15, fadeOut: 0.3 }); }
  // the opening only (beat 1, Marc: "I only want to be crouched for the opening... game play should never be crouched"): low
  // behind the barricade through the title and the first look; up the moment he is handed the controls, or sooner if he moves,
  // aims or is hit before then
  sneakStep(p, input) {
    if (!this.sneaking) return;
    const moving = Math.hypot(input.moveX || 0, input.moveZ || 0) > 0.2 || Math.hypot(input.aimX || 0, input.aimZ || 0) > 0.35;
    if (moving || p.dead || ['shot', 'swing', 'down', 'dodge'].includes(p.action.type)) { this.sneak(false); return; }
    const s = this.api.hero?.scriptState?.();
    if (!s || s.name !== 'hood_Crouch_Idle_Loop') this.api.hero?.script('hood_Crouch_Idle_Loop', { loop: true, fadeIn: 0.3, fadeOut: 0.45 });
  }
  sneak(on) { if (this.sneaking === on) return; this.sneaking = on; if (!on) this.api.hero?.end(); }

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
    // a spot with a way to him, the nearest within 5 m (a mark by a fence put them where no route reaches Marc)
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
  // a ring of infected round a point, facing it, still until Marc comes near
  ring(c, n, r, opts = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (opts.a0 ?? 0) + (i / n) * (opts.arc ?? Math.PI * 2) + this.sim.rand() * 0.6, d = r * (0.8 + this.sim.rand() * 0.4), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const q = { x, z }; if (this.sim.world.resolveCircle(q, 0.45)) continue;
      out.push(this.spawnAt({ x, z }, { near: true, spread: 0, yaw: Math.atan2(c.x - x, c.z - z), dormant: opts.dormant ?? 11, kind: opts.kind, wave: opts.wave || 'ring' }));
    }
    return out;
  }
  wake(list) { for (const z of list) if (z.alive && z.dormant) { z.dormant.wake = 0; z.passive = false; z.speedMul = z.dormant.speedMul || 1; z.dormant = null; } }
  // (the ones still up near him: a straggler stuck 45 m off behind a wall never holds the story)
  alive(group, r = 45) { const p = this.sim.player; return group.filter((z) => z.alive && Math.hypot(z.x - p.x, z.z - p.z) < r).length; }
  awakeNear(r) { const p = this.sim.player; return this.sim.zombies.some((z) => z.alive && !z.passive && !z.dormant && !z.looter && Math.hypot(z.x - p.x, z.z - p.z) < r); }
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
  P(y = 1.3) { const p = this.sim.player; return [p.x, y + groundAt(p), p.z]; }
  // a framing fixed the moment the shot cuts in (a held frame, not one that follows)
  held(fn) { let v = null; return () => (v ??= fn()); }
  // a two-shot for a portrait screen: over one's shoulder at the other, both in the frame one behind the other; over Marc's
  // shoulder unless a wall is behind him, then over hers. Fixed as the shot starts (a held framing).
  twoShot(other, { back = 2.3, side = 0.55, h = 1.75, over = 'marc' } = {}) {
    let f = null;
    const make = () => {
      const p = this.sim.player, q = typeof other === 'function' ? other() : other, w = this.sim.world;
      const pairs = over === 'marc' ? [[p, q], [q, p]] : [[q, p], [p, q]];
      for (const [a, b] of pairs) {
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        const cx = a.x + ux * back - uz * side, cz = a.z + uz * back + ux * side;
        if (!w.blockedAt(cx, cz, 0.25) && w.lineOfSight(cx, cz, b.x, b.z, 1.6) && w.lineOfSight(cx, cz, a.x, a.z, 1.6)) return { from: [cx, h, cz], look: [b.x + ux * 0.4, 1.3, b.z + uz * 0.4] };
      }
      return { from: [(p.x + q.x) / 2 + 3.2, 3.2, (p.z + q.z) / 2 + 4.6], look: [(p.x + q.x) / 2, 1.2, (p.z + q.z) / 2] };
    };
    // (and the two turned to each other: Marc keeps whatever way he last aimed otherwise)
    const face = () => { const p = this.sim.player, q = typeof other === 'function' ? other() : other; p.aimYaw = p.aimTarget = Math.atan2(q.x - p.x, q.z - p.z); };
    return { from: () => (face(), (f ??= make()).from), look: () => (f ??= make()).look };
  }
  // a camera on the line from b through a, `d` m past a, `side` m off it, at height h (two people in a portrait frame: one
  // behind the other)
  inLine(b, a, d, side = 0.3, h = 1.7) { const dx = a.x - b.x, dz = a.z - b.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l; return [a.x + ux * d - uz * side, h, a.z + uz * d + ux * side]; }
  // over Marc's shoulder at `t` (live {x, z} or a getter): back, side and height as asked if that place is clear and sees
  // them both, else the nearest of a few closer or swung round (a doorway, a wall behind him); held once found
  behindMarc(t, back, side, h) {
    let f = null;
    return () => {
      if (f) return f;
      const p = this.sim.player, q = typeof t === 'function' ? t() : t, w = this.sim.world, a = Math.atan2(q.x - p.x, q.z - p.z);
      for (const [b, sd] of [[back, side], [back, -side], [back * 0.7, side], [back * 0.7, -side], [back * 0.5, side * 1.4], [back * 0.5, -side * 1.4]]) {
        const x = p.x - Math.sin(a) * b + Math.cos(a) * sd, z = p.z - Math.cos(a) * b - Math.sin(a) * sd;
        if (!w.blockedAt(x, z, 0.25) && w.lineOfSight(x, z, p.x, p.z, 1.2) && w.lineOfSight(x, z, q.x, q.z, 1.2)) return (f = [x, h, z]);
      }
      return (f = [p.x - Math.sin(a) * back * 0.4, h, p.z - Math.cos(a) * back * 0.4]);
    };
  }
  // a spot `d` m from (x, z) toward the angle a, pushed out of anything solid (camera places)
  free(x, z, a, d, r = 0.3) { const q = { x: x + Math.sin(a) * d, z: z + Math.cos(a) * d }; this.sim.world.resolveCircle(q, r); return q; }

  // ---------------------------------------------------------------- supplies (never stuck for rounds)
  addSupplies(stop) {
    const S = SUPPLIES[stop] || [];
    const p = this.sim.player;
    for (const [id, x, z, w] of S) {
      const key = stop + ':' + id + ':' + x, med = id.startsWith('med');
      this.addPickup({ id: key, x, z, r: 1.0, model: med ? 'health' : 'ammo', label: med ? 'First aid' : w === 'shotgun' ? 'Shotgun shells' : 'Pistol rounds',
        when: med ? () => p.hp < p.maxHp : w === 'shotgun' ? () => this.flags.gun === 'shotgun' : null,
        onTake: () => { if (med) p.hp = Math.min(p.maxHp, p.hp + 50); else if (w === 'shotgun') p.reserve[SHOTGUN] = (p.reserve[SHOTGUN] || 0) + 10; else p.reserve[PISTOL] = (p.reserve[PISTOL] || 0) + 12; } });
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

  // ---------------------------------------------------------------- Sophie (from beat 5 on)
  ensureSophie(at, mode = 'follow') {
    if (!this.sophie || !this.npcs.includes(this.sophie)) { this.sophie = this.api.actors?.sophie(at || this.sim.player); if (this.sophie) this.npcs.push(this.sophie); }
    if (this.sophie && mode) this.sophie.mode = mode;
    return this.sophie;
  }
  sophieTo(x, z, run = false, after = 'idle') { const s = this.sophie; if (!s) return; s.lead = null; s.target = { x, z, run }; s.after = after; s.mode = 'goto'; }
  // she shows the way: ahead along a route she knows, waiting for him (companion.js); following again at its end
  sophieLead(id) { const s = this.sophie, pts = ROUTES[id]; this.route = id; if (!s || !pts) return; s.lead = { pts, i: 0, done: false }; s.mode = 'follow'; }
  sophiePose(pose, face = null, once = false) { const s = this.sophie; if (!s) return; s.mode = 'pose'; s.pose = pose; s.poseOnce = once; s.face = face; }
  sophieLook(pt, t = 1.5) { if (this.sophie) this.sophie.lookHold = { ...(typeof pt === 'function' ? {} : pt), live: typeof pt === 'function' ? pt : null, t }; }
  // before a two-shot: she comes to stand by him (up to 6 s)
  *meet(r = 2.2) {
    const s = this.sophie, p = this.sim.player; if (!s) return;
    if (Math.hypot(s.x - p.x, s.z - p.z) <= r + 0.4) return;
    const a = Math.atan2(s.x - p.x, s.z - p.z), q = this.free(p.x, p.z, a, r); this.sophieTo(q.x, q.z, true, 'idle');
    yield* this.until(() => s.mode !== 'goto', 6);
  }
  // the boat where it is moored (its placement: off the pier's north side; the old 'boat' mark is on the pier)
  boatAt() { const s = this.api.view.seals?.boat?.[0]; return s ? { x: s.p0.x, z: s.p0.z } : this.at('boat'); }
  // a scene with her in it starts with her by him: she comes (up to `wait` s); still far, she is at `at` as the scene cuts in
  // (a player who ran on ahead of her never starts a talk with nobody there)
  *together(at, r = 4, wait = 6) {
    const s = this.sophie, p = this.sim.player; if (!s || s.mode === 'dead') return;
    if (Math.hypot(s.x - p.x, s.z - p.z) <= r) return;
    this.sophieTo(at.x, at.z, true, 'idle');
    yield* this.until(() => Math.hypot(s.x - p.x, s.z - p.z) <= r || s.mode !== 'goto', wait);
    if (Math.hypot(s.x - p.x, s.z - p.z) > r) { const q = { x: at.x, z: at.z }; this.sim.world.resolveCircle(q, 0.3); s.x = q.x; s.z = q.z; s.speed = 0; s.mode = 'idle'; }
  }
  // her head, live (the shots that look at her face)
  sophieHead() { const s = this.sophie; return () => (s ? [s.x, (s.mode === 'pose' && /Kneel|Crouch/.test(s.pose || '') ? 0.95 : 1.5) + groundAt(s), s.z] : this.P(1.5)); }   // (+ the pier's deck under her)

  // ---------------------------------------------------------------- the story
  *run() {
    this.started = false;
    const from = STOP_ORDER.indexOf(this.stop);
    yield; this.started = true;
    const stops = { sneak: this.stopSneak, house: this.stopHouse, rescue: this.stopRescue, gate: this.stopGate, club: this.stopClub, lot: this.stopLot, dock: this.stopDock,
      shed: this.stopShed, horde: this.stopHorde, after: this.stopAfter, leave: this.stopLeave };
    // (a checkpoint after Sophie joins and before the dock: she is with him again, beside him, not on top of him)
    if (from >= STOP_ORDER.indexOf('gate') && from <= STOP_ORDER.indexOf('dock')) { const p = this.sim.player, q = { x: p.x + 1.5, z: p.z + 2.5 }; this.sim.world.resolveCircle(q, 0.35); this.ensureSophie({ ...q, yaw: p.aimYaw }, 'follow'); }
    if (from === STOP_ORDER.indexOf('shed')) { const b = this.boatAt(); this.ensureSophie({ x: b.x + 1.6, z: b.z + 1.95, yaw: Math.PI }, 'idle'); }
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

  // 1 - 3. THE SNEAK: behind the barricade at the south end; the looters far off; the call; the talk overheard; the end house
  *stopSneak() {
    const p = this.sim.player, cine = this.api.cine;
    this.setGoal('');
    this.music('none', 0);
    const call = ['c106', 'c107', 'c103', 'c108'];
    this.prefetch(...call, 'J01', 'J02', 'c303', 'c304');
    // the two of them up the road by the east row, armed, talking (calm until he gives himself away: actors.js looters)
    const L = this.api.looters?.(this, LOOTERS_AT.map((s) => ({ x: s.x, z: s.z, out: true, calm: true, face: s.face }))) || [];
    this.sentries = L;
    this.sneak(true);
    yield* this.wait(2.6);   // (black, the title, the light coming up over him: hood.js titleCard; the wind and a far shot only)
    this.api.audio?.play('shot', 0.35, { x: p.x - 70, z: p.z - 60 });
    yield* this.wait(1.6);
    // the look: up the road to them (close, the two in one portrait frame, one behind the other), then back to Marc at the
    // barricade, low, from in front of it
    const lk = { x: (LOOTERS_AT[0].x + LOOTERS_AT[1].x) / 2, z: (LOOTERS_AT[0].z + LOOTERS_AT[1].z) / 2 };
    // (a phone held upright sees only ~14 deg across at this lens: the camera down the line through the two of them)
    const ln = this.inLine(LOOTERS_AT[1], LOOTERS_AT[0], 6.4, -1.05, 1.85), ln2 = this.inLine(LOOTERS_AT[1], LOOTERS_AT[0], 5.0, -0.95, 1.75);
    yield* this.shot([
      { look: [lk.x, 1.4, lk.z], from: ln, fov: 34, slow: 1, hold: 2.0, move: 0 },
      { look: [lk.x, 1.35, lk.z], from: ln2, fov: 34, slow: 1, hold: 0.4, move: 1.8 },
      { look: () => this.P(0.9), from: () => [p.x - 1.1, 0.75, p.z - 3.0], fov: 40, slow: 1, hold: 1.2 },
    ], { back: 1.0 });
    this.sneak(false);   // (he stands as the game's camera comes back: from here it is play, never crouched)
    this.music('A_low', 3);
    this.setGoal('sneak');
    // the call, whispered, on the radio card (he keeps moving: the lines go on under the walk)
    this.say(...call);
    // past them up the road (the cars between them and him; no stealth: they never look round)
    yield* this.until(() => p.z < 58 || L.some((q) => !q.calm || !q.alive));
    // the end house: its door left ajar (the leaf part-way in)
    this.api.view.doorAjar?.(0.22);
    yield* this.until(() => this.near('home_door_use', 6));
    this.sneak(false);
  }

  // 4. THE HOUSE: James at the kitchen's fridge, headphones on; the dip and his head; the garage's fridge, behind the beer
  *stopHouse() {
    const p = this.sim.player, cine = this.api.cine;
    this.sneak(false);
    this.music('A_low', 2);
    this.setGoal('house');
    this.api.view.doorAjar?.(0.22);
    this.api.view.openSeal?.('fridge', true, false);   // (James has the kitchen's fridge open)
    const jm = this.at('james_fridge');
    const j = this.api.actors?.james(this, jm); if (j) this.npcs.push(j);
    this.james = j;
    yield* this.use('door', 'home_door_use', 'Go in', 1.4);
    this.openSeal('home_door');
    // (the looters out front leave while he is inside, out of his sight: they were never part of this)
    this.dismissSentries();
    if (j) j.onDeath = () => { this.api.voice?.play('J02'); };
    // he notices Marc when Marc is in the room with him (4.6 m), heads for the garage's door, or shoots
    yield* this.until(() => !j || !j.alive || this.nearXZ(jm, 4.6) || (p.x < 33.4 && p.z > 38.6 && p.z < 45.5) || p.action.type === 'shot');
    if (j && j.alive) {
      const head = () => j.headPos(), h2 = this.held(head), h3 = this.held(head);
      // over Marc's shoulder at James's back at the open fridge; James turns; close on him as he shouts; then the camera dips
      // low behind Marc, the pistol up, slow, for the shot (the user: "It dips down and you just shoot his head right off").
      // No music at the moment of the shot (Marc's direction)
      const behind = (back, side, h) => this.behindMarc(jm, back, side, h);
      p.desired = PISTOL;
      if (j) j.subject = true;
      this.music('none', 0.6);
      yield* this.shot([
        { look: () => [jm.x - 0.3, 1.25, jm.z], from: behind(1.9, 0.55, 1.75), fov: 40, slow: 0.25, hold: 0.9 },
        { look: () => { const h = h2(); return [h[0], h[1] - 0.2, h[2]]; }, from: () => { const h = h2(); return [h[0] + 1.25, 1.62, h[2] - 1.45]; }, fov: 40, slow: 0.25, hold: 0.5, fn: () => { const d = j.turn(); cine.after(d * 0.7, () => j.shout()); this.say('J01'); } },
        { look: () => { const h = head(); return [h[0], h[1] - 0.15, h[2]]; }, from: () => { const h = h3(); return [h[0] + 1.25, 1.6, h[2] - 1.5]; }, fov: 40, slow: 0.25, hold: 1.5, until: this.linesDone(), max: 8 },
        { look: head, from: behind(1.7, 0.75, 1.0), fov: 40, slow: 0.3, aim: j.z, prompt: 'SHOOT', hold: 0.4, fn: () => j.threat(2.6), until: () => !j.alive, max: 3.2 },
        { look: head, from: behind(1.7, 0.75, 1.0), fov: 40, slow: 0.2, hold: 1.1 },
      ], { back: 0.7 });
      if (j) j.subject = false;
    }
    yield* this.until(() => !j || !j.alive);
    // over him: "Sorry, buddy. Wrong fridge." (a low look past Marc down at the body by the open fridge)
    yield* this.wait(0.8);
    this.music('A_low', 2.5);
    if (j && j.obj) {
      const body = { x: j.z.x, z: j.z.z };
      yield* this.shot([{ look: [body.x - 0.2, 0.35, body.z], from: () => { const a = Math.atan2(body.x - p.x, body.z - p.z); return [p.x - Math.sin(a) * 1.1 + Math.cos(a) * 0.5, 1.95, p.z - Math.cos(a) * 1.1 - Math.sin(a) * 0.5]; }, fov: 44, slow: 1, hold: 0.6,
        fn: () => this.say('c303'), until: this.linesDone(), max: 5 }], { back: 0.6 });
    } else yield* this.talk('c303');
    // the vials: the second fridge, in the garage. One interaction: open it, the case behind the beer
    this.setGoal('vials');
    const fc = this.at('gfridge_case');
    this.api.view.showCase?.('fridge', fc);
    yield* this.use('fridge2', 'gfridge_use', 'Open the fridge', 1.4);
    const fu = this.at('gfridge_use');
    p.x = p.px = fu.x; p.z = p.pz = fu.z; p.aimYaw = p.aimTarget = fu.yaw;
    const gunWas = p.desired; p.desired = 'fists';
    yield* this.wait(0.4);
    this.api.hero?.script('hood_Interact');
    // (inside the garage: from its south-east corner across Marc's right shoulder at the fridge; then in at the shelf)
    yield* this.shot([
      { look: [fu.x - 0.45, 1.15, fu.z + 0.02], from: [fu.x + 1.65, 1.7, fu.z - 1.5], fov: 44, slow: 1, hold: 1.3, fn: () => cine.after(0.45, () => this.openSeal('fridge2')) },
      { look: [fc.x, fc.y + 0.02, fc.z], from: [fu.x + 0.75, 1.62, fu.z - 0.95], fov: 34, slow: 1, hold: 0.9, fn: () => this.say('c304') },
      { look: [fc.x, fc.y + 0.02, fc.z], from: [fu.x + 0.75, 1.62, fu.z - 0.95], fov: 34, slow: 1, hold: 0.6, until: this.linesDone(), max: 4, fn: () => { this.flags.case = 'carried'; this.api.view.showCase?.('carried'); } },
    ], { back: 0.6 });
    p.desired = gunWas === 'fists' ? PISTOL : gunWas;
    this.setGoal('');
    yield* this.until(() => p.x > 36.6);
  }
  dismissSentries() {
    for (const a of this.sentries || []) {
      if (!a.alive || !a.calm) continue;
      const i = this.sim.zombies.indexOf(a.z); if (i >= 0) this.sim.zombies.splice(i, 1);
      a.obj.removeFromParent(); a.sight.visible = false; this.npcs = this.npcs.filter((q) => q !== a);
    }
  }

  // 5 - 7. THE RESCUE: shots and screams down the court; Adam bitten; the wave; he turns; the reveal; the deal; the radio
  *stopRescue() {
    const p = this.sim.player, cine = this.api.cine, v = this.api.view;
    this.music('A_low', 2);
    this.prefetch('c401', 'c402', 'c403', 'c404', 'c405', 'c406', 'c407', 'c408', 'c409', 'c410', 'c501', 'c502', 'c503', 'c504', 'c505');
    const ad = this.api.actors?.adam(ADAM_AT); if (ad) this.npcs.push(ad);
    this.adam = ad;
    const sp = this.ensureSophie(SOPHIE_YARD, 'scared'); sp.face = ADAM_AT;
    this.sophieAt = SOPHIE_YARD;
    // what his shooting brought: up the court from the loop's west leg, round the yard (slow on him; his rounds slow them, they
    // cannot stop them)
    const ring = this.ring(ADAM_AT, 5, 4.0, { dormant: 0, a0: 1.85, arc: 1.3 });   // (beyond him from the look's lens, up the court from its west end)
    for (const z of ring) { z.passive = true; z.speedMul = 0.2; }
    yield* this.wait(0.5);
    this.say('c401');
    yield* this.wait(1.6);
    // the look (short): down the court at their drive, low by the kerb, Adam firing; he is overwhelmed and bitten
    const lookAt = [ADAM_AT.x + 0.3, 1.15, ADAM_AT.z + 0.4];
    if (ad) ad.subject = true;
    yield* this.shot([
      { look: lookAt, from: [ADAM_AT.x + 5.2, 1.45, ADAM_AT.z - 3.9], fov: 38, slow: 0.6, rate: 1, hold: 2.0, fn: () => this.say('c402') },
      { look: [ADAM_AT.x, 0.9, ADAM_AT.z], from: [ADAM_AT.x + 3.1, 1.25, ADAM_AT.z - 2.2], fov: 38, slow: 0.4, rate: 0.7, hold: 1.1, fn: () => { this.say('c403'); const z = ring[0]; if (z) { z.x = z.px = ADAM_AT.x + 0.7; z.z = z.pz = ADAM_AT.z + 0.15; z.yaw = Math.atan2(ADAM_AT.x - z.x, ADAM_AT.z - z.z); } } },
      { look: [ADAM_AT.x, 0.55, ADAM_AT.z], from: [ADAM_AT.x + 3.1, 1.25, ADAM_AT.z - 2.2], fov: 38, slow: 0.3, rate: 0.6, hold: 1.6, fn: () => ad?.bitten() },
    ], { back: 0.8 });
    if (ad) ad.subject = false;
    ad?.bitten();
    this.say('c404');
    this.setGoal('help'); this.music('A', 2.5);
    yield* this.until(() => this.nearXZ(ADAM_AT, 13));
    this.setGoal('save'); this.music('A_up', 2.5);
    for (const z of ring) { z.passive = false; z.speedMul = 1; }
    this.wake(ring);
    const w = yield* this.wave([[{ x: -2.2, z: 57.5 }], [{ x: -2.0, z: 66.5 }, 'runner'], [{ x: 3.5, z: 54.5 }]], 1.6, 'rescue');   // (up the loop's west leg into the court)
    yield* this.until(() => this.alive(ring) + this.alive(w) === 0, 120);
    this.setGoal('');
    yield* this.wait(0.8);
    // Sophie down by his head; "Hey. I've got you." (B from here: Marc's direction); he turns in her arms; he rises at her
    const hd = ad?.headAt?.() || { x: ADAM_AT.x, z: ADAM_AT.z }, side = ad?.sideAt?.() ?? -1.0;
    const kneel = this.free(hd.x, hd.z, side, 0.7, 0.25);
    this.sophieTo(kneel.x, kneel.z, true, 'pose'); sp.pose = 'hood_Fixing_Kneeling'; sp.poseOnce = false; sp.face = ADAM_AT;
    yield* this.until(() => sp.mode === 'pose', 4);
    sp.mode = 'pose'; sp.pose = 'hood_Fixing_Kneeling'; sp.face = ADAM_AT;
    // (Marc a few steps off, facing them)
    const ma = Math.atan2(p.x - ADAM_AT.x, p.z - ADAM_AT.z), stand = this.free(ADAM_AT.x, ADAM_AT.z, ma, 3.2);
    p.x = p.px = stand.x; p.z = p.pz = stand.z; p.aimYaw = p.aimTarget = Math.atan2(ADAM_AT.x - p.x, ADAM_AT.z - p.z);
    p.desired = PISTOL;
    // (the lens low across his head from her: her face over his, both in a tall frame)
    const across = Math.atan2(hd.x - kneel.x, hd.z - kneel.z), low = this.held(() => [hd.x + Math.sin(across) * 1.55 + Math.cos(across) * 0.25, 0.82, hd.z + Math.cos(across) * 1.55 - Math.sin(across) * 0.25]);
    if (ad) ad.subject = true; sp.subject = true;
    this.say('c406');
    yield* this.shot([
      { look: [kneel.x * 0.6 + hd.x * 0.4, 0.62, kneel.z * 0.6 + hd.z * 0.4], from: low, fov: 42, slow: 1, hold: 1.2, until: this.linesDone(), max: 8 },
      { look: [hd.x, 0.3, hd.z], from: () => [hd.x + Math.sin(across) * 0.9, 0.62, hd.z + Math.cos(across) * 0.9], fov: 36, slow: 1, hold: 0.6, fn: () => { this.say('c405'); this.music('B', 2.5); }, until: this.linesDone(), max: 6 },
    ], { back: 0.0 });
    // the turn: his skin going over, the groan; she backs away on her knees, his name; he comes up
    let k = 0;
    yield* this.shot([
      { look: [hd.x, 0.28, hd.z], from: () => [hd.x + Math.sin(across) * 0.75 + Math.cos(across) * 0.12, 0.55, hd.z + Math.cos(across) * 0.75 - Math.sin(across) * 0.12], fov: 32, slow: 1, hold: 3.2, move: 3.0, fn: () => { this.api.voice?.play('c407'); const tick = () => { k = Math.min(1, k + 0.034); ad?.turn(k); if (k < 1) cine.after(0.1, tick); }; tick(); } },
      { look: this.sophieHead(), from: low, fov: 36, slow: 1, hold: 1.0,
        fn: () => { ad?.turn(1); this.say('c408'); const back = this.free(kneel.x, kneel.z, Math.atan2(kneel.x - ADAM_AT.x, kneel.z - ADAM_AT.z), 1.2, 0.25); this.sophieTo(back.x, back.z, false, 'pose'); sp.pose = 'hood_Crouch_Idle_Loop'; sp.face = ADAM_AT; }, until: this.linesDone(), max: 6 },
      { look: [(ADAM_AT.x + hd.x) / 2, 0.85, (ADAM_AT.z + hd.z) / 2], from: [(ADAM_AT.x + hd.x) / 2 + Math.sin(ma + 0.6) * 3.6, 1.3, (ADAM_AT.z + hd.z) / 2 + Math.cos(ma + 0.6) * 3.6], fov: 42, slow: 1, hold: 2.6, fn: () => { const d = ad?.rise(this) || 2; cine.after(Math.max(0.6, d - 0.9), () => { ad?.lunge({ x: sp.x, z: sp.z }); this.api.voice?.play('c409'); }); } },
    ], { back: 0.0 });
    // Marc shoots him: the dip behind Marc, the pistol up, slow; his aim swings onto Adam
    const behind = (back, side, h) => this.behindMarc(() => ({ x: ad.x, z: ad.z }), back, side, h);
    if (ad?.zb) {
      yield* this.shot([
        { look: () => [ad.x, 1.3, ad.z], from: behind(2.5, 0.9, 1.3), fov: 40, slow: 0.3, aim: { get x() { return ad.x; }, get z() { return ad.z; } }, prompt: 'SHOOT', hold: 0.4, until: () => !ad.zb.alive, max: 45 },
        { look: () => [ad.x, 0.9, ad.z], from: behind(2.5, 0.9, 1.3), fov: 40, slow: 0.25, hold: 1.2 },
      ], { back: 0.0 });
    }
    yield* this.until(() => !ad?.zb || !ad.zb.alive);
    if (ad) ad.subject = false;
    // "He just went out to get the car." (on her, crying, the car's open back behind her)
    this.sophiePose('hood_Crying', ADAM_AT);
    yield* this.shot([{ look: this.sophieHead(), from: () => { const a = Math.atan2(p.x - sp.x, p.z - sp.z) + 0.5; return [sp.x + Math.sin(a) * 1.9, 1.35, sp.z + Math.cos(a) * 1.9]; }, fov: 40, slow: 1, hold: 1.0, fn: () => this.say('c410'), until: this.linesDone(), max: 6 }], { back: 0.0 });
    sp.subject = false;
    yield* this.reveal();
    this.sophieAt = null;
  }
  // 6 - 7. The reveal and the deal; the radio's light
  *reveal() {
    const p = this.sim.player, sp = this.sophie, cine = this.api.cine, v = this.api.view;
    this.prefetch('c506', 'c507', 'c508', 'c509', 'c510', 'c511', 'c512', 'c513', 'c514', 'c601');
    // Marc lowers the case to the grass at his feet (her eyes on him, then on it: the slow zoom on its symbol, the "x4")
    yield* this.meet(1.9);
    this.sophiePose('hood_Idle_Loop', { x: p.x, z: p.z });
    p.aimYaw = p.aimTarget = Math.atan2(sp.x - p.x, sp.z - p.z);
    const yw = p.aimYaw, cz = { x: p.x + Math.sin(yw + 0.9) * 0.55, z: p.z + Math.cos(yw + 0.9) * 0.55, yaw: yw + Math.PI / 2 };
    p.desired = 'fists';
    yield* this.wait(0.35);
    this.api.hero?.script('hood_PickUp_Kneeling', { fadeIn: 0.2, fadeOut: 0.4 });
    cine.after(0.7, () => { this.flags.case = 'ground'; this.caseAt = cz; v.showCase?.('ground', cz); });
    const ms = this.twoShot(sp, { over: 'marc', back: 1.6, side: 0.45, h: 1.7 });
    yield* this.shot([
      { look: this.sophieHead(), from: ms.from, fov: 34, slow: 1, hold: 1.4, fn: () => this.sophieLook(() => ({ x: p.x, z: p.z }), 1.4) },
      { look: this.sophieHead(), from: ms.from, fov: 34, slow: 1, hold: 1.2, fn: () => this.sophieLook(cz, 4) },
      { look: [cz.x, 0.12, cz.z], from: [cz.x + Math.sin(yw + Math.PI) * 0.5 + 0.15, 0.95, cz.z + Math.cos(yw + Math.PI) * 0.5], fov: 38, slow: 1, hold: 0.2 },
      { look: [cz.x, 0.12, cz.z], from: [cz.x + Math.sin(yw + Math.PI) * 0.28 + 0.08, 0.5, cz.z + Math.cos(yw + Math.PI) * 0.28], fov: 30, slow: 1, move: 2.6, hold: 0.4, fn: () => cine.after(1.6, () => this.say('c501')), until: this.linesDone(), max: 6 },
    ], { back: 0.0 });
    p.desired = 'fists';   // (his hands empty while they talk: no pistol on her)
    // the deal, a held two-shot over her shoulder; he takes the case back up (glance one: her eyes on it a beat too long)
    const two = this.twoShot(sp, { over: 'sophie' });
    this.say('c502', 'c503', 'c504');
    yield* this.shot([{ look: two.look, from: two.from, fov: 44, slow: 1, hold: 2, until: this.linesDone(), max: 30 }], { back: 0.0 });
    this.api.hero?.script('hood_PickUp_Kneeling', { fadeIn: 0.2, fadeOut: 0.4 });
    const g1 = this.twoShot(sp, { over: 'marc', back: 1.5, side: 0.4, h: 1.65 });
    yield* this.shot([
      { look: this.sophieHead(), from: g1.from, fov: 34, slow: 1, hold: 0.75, fn: () => { this.sophieLook(() => v.caseObj?.position || { x: p.x, z: p.z }, 3.0); cine.after(0.6, () => { this.flags.case = 'carried'; this.caseAt = null; v.showCase?.('carried'); }); } },
      { look: this.sophieHead(), from: g1.from, fov: 32, slow: 1, hold: 2.1, move: 2.0 },
    ], { back: 0.0 });
    this.say('c505', 'c506', 'c507', 'c508', 'c509', 'c510', 'c511', 'c512', 'c513', 'c514');
    yield* this.shot([{ look: two.look, from: two.from, fov: 44, slow: 1, hold: 2, fn: () => this.sophiePose('hood_Idle_Talking_Loop', { x: p.x, z: p.z }), until: this.linesDone(), max: 90 }], { back: 0.0 });
    // the radio on his belt: a red light blinking (the battery), close; "Battery's almost gone."
    v.radioLow?.(true);
    const rp = () => { const r = v.radio; return r ? [r.position.x, r.position.y, r.position.z] : this.P(0.95); };
    const rh = this.held(rp);
    p.desired = 'fists';
    yield* this.shot([{ look: rp, from: () => { const r = rh(), a = p.aimYaw - Math.PI / 2 + 0.45; return [r[0] + Math.sin(a) * 0.85, r[1] + 0.2, r[2] + Math.cos(a) * 0.85]; }, fov: 32, slow: 1, hold: 1.3, fn: () => { v.radioLedHold = true; cine.after(0.7, () => this.say('c601')); }, until: this.linesDone(), max: 5 }], { back: 0.7 });
    v.radioLedHold = false;
    sp.mode = 'follow'; p.desired = PISTOL;
  }

  // 8 - 9. THE GATE: locked, Sophie picks it; the busted house by it (the crowbar, the batteries); Yola's call
  *stopGate() {
    const p = this.sim.player, cine = this.api.cine, v = this.api.view;
    const sp = this.ensureSophie(null, null);
    v.radioLow?.(!this.flags.batteries);
    this.music('B', 2);
    this.prefetch('c602', 'c603', 'c603b', 'c604', 'c605', 'c701', 'c702', 'c703', 'c704', 'c705', 'c706');
    // the busted house just left of the gate (B06-L, its garage stood open): the crowbar and the batteries on its bench,
    // under its lamp, from the start (order-proof: either, both or neither before Sophie says a word)
    v.garageLight?.(true);
    const c = this.at('cutters');
    this.addPickup({ id: 'crowbar', x: c.x, z: c.z, y: c.y || undefined, r: 1.3, model: 'crowbar', label: 'Crowbar', onTake: () => { this.flags.crowbar = true; this.loadout('crowbar'); this.say('c702'); } });
    const bx = c.x - 0.45 * Math.cos(0.74), bz = c.z + 0.45 * Math.sin(0.74);
    this.addPickup({ id: 'batteries', x: bx, z: bz, y: c.y || undefined, r: 1.2, model: 'batteries', label: 'Batteries', onTake: () => { this.flags.batteries = true; v.radioLow?.(false); this.say('c701'); } });
    const inside = [this.spawnAt('z_garage', { dormant: 4.0, wave: 'garage' })];
    void inside;
    // Yola's call once the radio has its batteries, whenever that is (between fights, never over a shot)
    const call = ['c703', 'c704', 'c705', 'c706', 'c711', 'c712', 'c713', 'c714'];
    const callWatch = { step: () => {
      if (this.flags.called || !this.flags.batteries || this.api.subs.busy || cine?.active || this.awakeNear(10)) return;
      this.flags.called = true; this.prefetch(...call); this.later(1.2, () => this.say(...call));
      this.npcs = this.npcs.filter((q) => q !== callWatch);
    } };
    this.npcs.push(callWatch);
    this.sophieLead('gate'); this.setGoal('follow');
    // B out as they leave the yard; A back at the gate
    yield* this.until(() => Math.hypot(p.x - SOPHIE_YARD.x, p.z - SOPHIE_YARD.z) > 14 || this.near('gate_use', 12));
    this.music('none', 3);
    yield* this.until(() => this.near('gate_use', 7));
    this.music('A_low', 2.5);
    // she kneels at the lock and works it; he watches her
    const g = this.at('gate_use'), lock = { x: g.x, z: g.z + 0.55 };
    yield* this.together(lock, 7, 5);
    this.sophieTo(lock.x, lock.z, false, 'pose'); sp.pose = 'hood_Fixing_Kneeling'; sp.face = { x: g.x, z: g.z - 2 };
    yield* this.until(() => sp.mode === 'pose', 6);
    if (sp.mode !== 'pose') { sp.x = lock.x; sp.z = lock.z; sp.mode = 'pose'; }
    const t0 = this.time;
    this.setGoal('gate');
    yield* this.talk('c602');
    yield* this.talk('c604');
    let said603 = false;
    if (!this.flags.crowbar) {
      said603 = true;
      // "That house there. The door's open.": a look across at it, its lamp on, the crowbar on the bench
      this.say('c603');
      const gl = this.at('garage_light');
      yield* this.shot([{ look: [gl.x, 1.0, gl.z], from: { yaw: 35, pitch: 22, dist: 7.5 }, fov: 40, slow: 0.4, hold: 2.4, move: 1.0, until: this.linesDone(), max: 6 }], { back: 0.7 });
      this.setGoal('quiet');
    }
    // the lock gives once she has had her time at it and he is back by her (with what he went for, or after a while)
    let saidB = false;
    yield* this.until(() => {
      if (said603 && !saidB && this.flags.crowbar && this.nearXZ(sp, 5) && !this.api.subs.busy) { saidB = true; this.say('c603b'); }
      if (this.flags.crowbar && this.objective === 'quiet') this.setGoal(this.flags.batteries ? 'gate' : 'batteries');
      if (this.objective === 'batteries' && this.flags.batteries) this.setGoal('gate');
      const ready = this.time - t0 > 14 && (this.flags.crowbar || this.time - t0 > 60) && this.near('gate_use', 6) && !this.awakeNear(9);
      return ready && !this.api.subs.busy;
    });
    v.garageLight?.(false);
    this.api.audio?.play('reloadDone'); yield* this.wait(0.4); this.api.audio?.play('pumpRack');
    this.openSeal('gate');
    sp.mode = 'follow';
    this.say('c605');
  }

  // 10 - 11. THE CLUBHOUSE: the walk; "don't use your gun"; the horde; the case set down; inside, melee; the suppressor
  *stopClub() {
    const p = this.sim.player, cine = this.api.cine, v = this.api.view, sp = this.ensureSophie(null, null);
    this.music('A', 2.5);
    this.prefetch('c801', 'c802', 'c803', 'c804', 'c805', 'c806', 'c807', 'c808', 'c809');
    this.sophieLead('clubhouse'); this.setGoal('follow');
    // the walk: a short fight on the way (the pistol: out here, it wakes nobody yet)
    yield* this.until(() => p.z < -23);
    const w = yield* this.wave([['z_gate_a'], ['z_gate_d'], ['z_gate_b', 'runner']], 1.4, 'walk');
    yield* this.until(() => this.near('club_warn', 9) && this.alive(w) === 0, 240);
    yield* this.until(() => this.alive(w) === 0, 60);
    // at the front: she stops low by the door
    const door = this.at('club_door'), crouch = { x: 13.6, z: -42.25 };   // (by the portico's east post, out from under its roof)
    yield* this.together(crouch, 6, 6);
    this.sophieTo(crouch.x, crouch.z, false, 'pose'); sp.pose = 'hood_Crouch_Idle_Loop'; sp.face = door; sp.sneak = true;
    yield* this.until(() => sp.mode === 'pose', 6);
    this.ensureHorde();
    yield* this.talk('c801');
    this.quiet = true; this.music('drone', 2.5); this.quietWarned = false;
    this.say('c802', 'c803');
    yield* this.until(() => !this.api.subs.busy);
    // "Look.": the playground, the horde standing about (a long lens from the lake path, then nearer, a slow drift)
    const pg = this.at('playground');
    yield* this.shot([
      { look: [pg.x, 1.0, pg.z], from: [pg.x + 15, 6.5, pg.z - 11], fov: 30, slow: 1, hold: 1.6 },
      { look: [pg.x - 1, 0.9, pg.z + 1], from: [pg.x + 9.5, 2.4, pg.z - 7.5], fov: 34, slow: 1, move: 3.5, hold: 0.3, fn: () => cine.after(1.4, () => this.say('c804')), until: this.linesDone(), max: 6 },
    ], { back: 1.0 });
    // the case down by her to swing (glance two: her hand drifts to it; he turns; she takes it back)
    this.say('c805');
    const cd = { x: crouch.x - 0.1, z: crouch.z + 0.75, yaw: 0.4 };   // (in front of her, toward the lens)
    p.desired = this.flags.crowbar ? 'crowbar' : 'fists';
    { const q = { x: cd.x - 0.8, z: cd.z + 0.1 }; this.sim.world.resolveCircle(q, 0.3); p.x = p.px = q.x; p.z = p.pz = q.z; p.vx = p.vz = 0; p.aimYaw = p.aimTarget = Math.atan2(cd.x - q.x, cd.z - q.z); }
    this.api.hero?.script('hood_PickUp_Kneeling', { fadeIn: 0.2, fadeOut: 0.4 });
    yield* this.wait(0.7); this.setCaseDown(cd); yield* this.wait(0.8);
    const toDoor = Math.atan2(door.x - p.x, door.z - p.z);
    p.aimYaw = p.aimTarget = toDoor;
    if (sp) sp.subject = true;
    yield* this.shot([
      { look: [cd.x, 0.55, cd.z - 0.4], from: [cd.x + 0.55, 1.15, cd.z + 1.75], fov: 38, slow: 0.5, rate: 1, hold: 1.4, fn: () => { const q = { x: cd.x - 0.8, z: cd.z + 0.1 }; this.sim.world.resolveCircle(q, 0.3); p.x = p.px = q.x; p.z = p.pz = q.z; sp.x = crouch.x; sp.z = crouch.z; sp.speed = 0; sp.yaw = Math.atan2(cd.x - crouch.x, cd.z - crouch.z); this.sophiePose('hood_PickUp_Kneeling', cd, true); this.sophieLook(cd, 2); } },
      { look: () => this.P(1.45), from: this.held(() => this.inLine({ x: p.x, z: p.z }, { x: sp.x, z: sp.z }, 1.3, 0.35, 1.25)), fov: 36, slow: 0.5, hold: 0.9, fn: () => { p.aimYaw = p.aimTarget = Math.atan2(sp.x - p.x, sp.z - p.z); } },
      { look: this.sophieHead(), from: [cd.x + 0.4, 1.25, cd.z + 1.35], fov: 36, slow: 0.5, hold: 1.1, fn: () => { this.sophiePose('hood_Surprise', { x: p.x, z: p.z }, true); this.sophieLook(() => ({ x: p.x, z: p.z }), 1.2); } },
    ], { back: 0.6 });
    if (sp) sp.subject = false;
    this.sophiePose('hood_Crouch_Idle_Loop', door);
    // inside: only the infected (melee), the suppressor in the office, the supplies she spoke of
    this.openSeal('clubdoor');
    this.setGoal('clear'); this.music('A', 3);
    const kk = this.at('keys');
    // (only where he can get to: the hall, the west room, the corridor to the office, the office; three of the clubhouse's small
    // rooms are closed boxes with no doorway, and the first build put infected in them: Marc, "i can't actually clear it out")
    const inside = [[1.5, -50.5], [12.5, -50.0], [6.5, -52.5], [9.6, -56.6], [11.8, -60.0]].map(([x, z]) => this.spawnAt({ x, z }, { near: true, dormant: 5.5, wave: 'club' }));
    this.addPickup({ id: 'silencer', x: kk.x, z: kk.z, r: 1.1, model: 'silencer', label: 'Suppressor', onTake: () => { this.flags.silencer = true; this.quiet = false; v.silencerOn?.(window.game?.yola); this.say('c806'); this.music('A', 2.5); } });
    // (and never held by one he cannot reach: one with no way to him counts as gone after a minute in here)
    const tIn = this.time, reach = (z) => this.sim.world.flowDir(z.x, z.z, {}) < 1e7;
    yield* this.until(() => this.flags.silencer && inside.filter((z) => z.alive && (this.time - tIn < 60 || reach(z))).length === 0);
    // she comes in to the office: what she was looking for is not here
    sp.sneak = false;
    yield* this.together(OFFICE, 5, 4);
    this.sophieTo(OFFICE.x, OFFICE.z, true, 'idle');
    yield* this.until(() => sp.mode !== 'goto' || this.nearXZ(sp, 3), 10);
    yield* this.meet(2.0);
    const gunC = p.desired; p.desired = 'fists';
    const two = this.twoShot(sp, { over: 'marc' });
    this.say('c807', 'c808', 'c809');
    yield* this.shot([{ look: two.look, from: two.from, fov: 44, slow: 1, hold: 1.5, until: this.linesDone(), max: 20 }], { back: 0.6 });
    sp.mode = 'follow'; p.desired = gunC;
    // the case, where he set it down (he goes nowhere without it)
    if (this.flags.case === 'ground') { this.setGoal('takeCase'); yield* this.until(() => this.flags.case === 'carried'); }
    this.setGoal('');
  }
  // an unsilenced shot near the clubhouse (from Sophie's warning until the suppressor): the first stirs the horde (a look),
  // the second wakes it
  onShot(kind) {
    if (this.stop === 'horde' && kind === 'shotgun' && !this.firstBlast) { this.firstBlast = true; this.slowBlast?.(); }
    if (!this.quiet || kind !== 'shot' || this.flags.silencer || this.hordeUp) return;
    if (!this.quietWarned) {
      this.quietWarned = true; if (this.api.cine?.active) return;
      const pg = this.at('playground');
      this.api.cine?.play([{ look: [pg.x, 1.0, pg.z], from: [pg.x + 9.5, 2.4, pg.z - 7.5], fov: 34, slow: 0.35, hold: 1.6, fn: () => { for (const z of (this.horde || []).slice(0, 4)) if (z.alive) z.yaw = Math.atan2(-z.x + 10, -z.z - 50); } }], { back: 0.6 });
      return;
    }
    this.hordeUp = true; this.music('C', 0.6);
    this.bringHorde(this.horde || [], [[-9, -36], [-10, -41], [-8.5, -31], [-9.5, -45]]);
  }
  // the horde brought in from beyond the stop's routes (the playground lies outside them): two at a time at the edge
  bringHorde(list, gate) {
    const far = list.filter((z) => z.alive); let i = 0;
    const bring = (z) => { const [gx, gz] = gate[i++ % gate.length], q = { x: gx + (this.sim.rand() - 0.5) * 2, z: gz - this.sim.rand() * 2.5 }; this.sim.world.resolveCircle(q, 0.45); z.x = z.px = q.x; z.z = z.pz = q.z; z.vx = z.vz = 0; this.wake([z]); z.passive = false; return z; };
    const next = () => { if (!far.length) return; bring(far.shift()); if (far.length) bring(far.shift()); this.later(0.9, next); };
    next();
  }

  // 12. THE LOT: Sophie runs ahead; Pete under the infected; the silenced pistol; she takes his key
  *stopLot() {
    const p = this.sim.player, cine = this.api.cine, sp = this.ensureSophie(null, 'follow');
    this.music('A_low', 2.5);
    this.prefetch('P01', 'P02', 'P03', 'c905', 'c906');
    if (this.flags.silencer) this.api.view.silencerOn?.(window.game?.yola);
    // she runs, as if she knows where (down the drive and into the lot)
    this.sophieTo(PETE_AT.x - 13, PETE_AT.z + 3.5, true, 'scared'); this.setGoal('pete');
    const pete = this.api.actors?.pete(PETE_AT); if (pete) this.npcs.push(pete);
    const ring = this.ring(PETE_AT, 5, 3.2, { dormant: 0 });
    for (const z of ring) { z.passive = true; z.speedMul = 0.25; }
    yield* this.until(() => p.x > 26 || this.nearXZ(PETE_AT, 40));
    this.say('P01');
    this.setGoal('savePete');
    yield* this.until(() => this.nearXZ(PETE_AT, 24), 30);
    this.say('P02');
    const w = yield* this.wave([['z_lot_a'], ['z_lot_d', 'runner']], 1.0, 'lot');
    yield* this.until(() => this.nearXZ(PETE_AT, 12), 20);
    // he goes under: slow, close; the world held
    if (pete) pete.subject = true;
    yield* this.shot([
      { look: [PETE_AT.x, 1.2, PETE_AT.z], from: { yaw: 35, pitch: 18, dist: 4.4 }, fov: 38, slow: 0.12, rate: 0.55, hold: 0.5, fn: () => this.say('P03') },
      { look: [PETE_AT.x, 0.9, PETE_AT.z], from: { yaw: 52, pitch: 24, dist: 3.8 }, fov: 38, slow: 0.12, rate: 0.45, hold: 2.2, fn: () => pete?.overwhelm() },
    ], { back: 0.6 });
    if (pete) pete.subject = false;
    for (const z of ring) { z.passive = false; z.speedMul = 1; }
    this.wake(ring);
    // Sophie, brave only to take something: to his body for the key while Marc fights
    let gotKey = false;
    const bones = {}, bodyAt = () => { const P = pete?.obj, at = (n) => { const o = bones[n] ??= P?.getObjectByName(n); if (!o) return null; o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return { x: e[12], z: e[14] }; };
      const h = at('mixamorigHips'), c = at('mixamorigSpine2') || h, hd = at('mixamorigHead') || c; if (!h) return { x: PETE_AT.x - 0.7, z: PETE_AT.z + 0.5, face: PETE_AT };
      let ax = hd.x - h.x, az = hd.z - h.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; let nx = -az, nz = ax; if (nx * 0.57 + nz * 0.82 < 0) { nx = -nx; nz = -nz; }
      const q = { x: c.x + nx * 0.75, z: c.z + nz * 0.75 }; this.sim.world.resolveCircle(q, 0.3); return { ...q, face: c }; };
    if (sp) { let k = bodyAt(); sp.target = { get x() { return (k = bodyAt()).x; }, get z() { return k.z; }, run: true, done: () => { sp.mode = 'idle'; sp.face = k.face; this.later(0.45, () => { sp.mode = 'pose'; sp.pose = 'hood_PickUp_Kneeling'; sp.poseOnce = false; }); this.later(1.75, () => { gotKey = true; this.flags.key = 'sophie'; sp.face = null; sp.mode = 'scared'; }); } }; sp.after = 'pose'; sp.mode = 'goto'; }
    else { gotKey = true; this.flags.key = 'sophie'; }
    yield* this.until(() => gotKey && this.alive([...ring, ...w]) === 0, 150);
    yield* this.wait(1.0);
    // "Sorry, pal." (Marc over him, a low look past his shoulder)
    const pb = pete ? { x: pete.x, z: pete.z } : PETE_AT;
    p.aimYaw = p.aimTarget = Math.atan2(pb.x - p.x, pb.z - p.z);
    yield* this.shot([{ look: [pb.x, 0.35, pb.z], from: [pb.x + 2.0, 1.75, pb.z + 1.7], fov: 44, slow: 1, hold: 0.5, fn: () => this.say('c905'), until: this.linesDone(), max: 5 }], { back: 0.6 });
    if (sp) { sp.mode = 'follow'; }
    this.say('c906');
  }

  // 13. THE DOCK: her boat; the cooler; the case handed over (glance three); the shed's key
  *stopDock() {
    const p = this.sim.player, cine = this.api.cine, v = this.api.view, sp = this.ensureSophie(null, 'follow');
    this.music('A_low', 2.5);
    this.prefetch('c1001', 'c1002', 'c1003', 'c1004', 'c1005', 'c1006', 'c1007', 'c1008', 'c1009', 'c1010');
    if (this.flags.silencer) v.silencerOn?.(window.game?.yola);
    this.sophieLead('dock'); this.setGoal('follow');
    const b = this.boatAt();
    v.showCooler?.(true);
    yield* this.until(() => this.nearXZ(b, 9));
    // she goes out onto the pier by the stern; he follows her up
    const by = { x: b.x + 1.0, z: b.z + 2.05 };   // (on the pier by the boat's side)
    yield* this.together(by, 6, 8);
    this.sophieTo(by.x, by.z, false, 'idle');
    yield* this.until(() => sp.mode !== 'goto', 8);
    if (Math.hypot(sp.x - by.x, sp.z - by.z) > 1.5) { sp.x = by.x; sp.z = by.z; sp.mode = 'idle'; }
    yield* this.meet(2.0);
    p.desired = 'fists';
    const cp = v.coolerAt?.() || { x: b.x, y: 0.5, z: b.z };
    const two = this.twoShot(sp, { over: 'marc' }), sw = this.twoShot(sp, { over: 'sophie' });
    // the boat (dry, a pull-start outboard), the cooler (the camera stays on it), the ask
    this.say('c1001');
    yield* this.shot([
      { look: [b.x - 0.3, 0.45, b.z], from: [b.x + 3.6, 1.85, b.z + 3.9], fov: 38, slow: 1, hold: 1.2, fn: () => cine.after(0.6, () => this.say('c1002')), until: this.linesDone(), max: 6 },
      { look: [cp.x, cp.y, cp.z], from: [cp.x + 1.9, cp.y + 1.25, cp.z + 1.7], fov: 34, slow: 1, hold: 1.6, move: 0, fn: () => this.say('c1003') },
      { look: [cp.x, cp.y, cp.z], from: [cp.x + 1.45, cp.y + 1.0, cp.z + 1.3], fov: 32, slow: 1, hold: 0.4, move: 1.6, until: this.linesDone(), max: 5 },
      { look: two.look, from: two.from, fov: 44, slow: 1, hold: 0.4, fn: () => this.say('c1004', 'c1005', 'c1006'), until: this.linesDone(), max: 25 },
    ], { back: 0.0 });
    // "Anything." and he hands it over; her eyes on it in her hands (glance three)
    this.say('c1007');
    yield* this.shot([{ look: sw.look, from: sw.from, fov: 42, slow: 1, hold: 2.2, until: this.linesDone(), max: 8 }], { back: 0.0 });
    this.api.hero?.script('hood_Interact', { fadeIn: 0.2, fadeOut: 0.4 });
    yield* this.wait(0.5);
    const hand = () => { const h = sp.obj?.getObjectByName?.('mixamorigRightHand'); if (!h) return { x: sp.x, y: 0.7, z: sp.z, yaw: sp.yaw }; const q = h.getWorldPosition(this._hv || (this._hv = h.position.clone())); return { x: q.x, y: q.y - 0.14, z: q.z, yaw: sp.yaw }; };
    this.flags.case = 'held'; v.showCase?.('held', { get: hand }); this.sophiePose('hood_Idle_Loop', { x: p.x, z: p.z });
    yield* this.shot([
      { look: () => { const h = this.sophieHead()(); return [h[0], h[1] - 0.25, h[2]]; }, from: this.held(() => { const a = Math.atan2(p.x - sp.x, p.z - sp.z) + 0.3; return [sp.x + Math.sin(a) * 1.3, 1.5, sp.z + Math.cos(a) * 1.3]; }), fov: 36, slow: 1, hold: 2.0, fn: () => { sp.yaw = Math.atan2(p.x - sp.x, p.z - sp.z); this.sophieLook(() => { const q = v.caseObj?.position; return q ? { x: q.x, z: q.z } : sp; }, 2.0); } },
    ], { back: 0.0 });
    // the key at last: the shed's (its disc padlock is one she cannot pick)
    this.say('c1008');
    yield* this.shot([{ look: two.look, from: two.from, fov: 44, slow: 1, hold: 1.0, fn: () => cine.after(1.0, () => { this.flags.key = true; this.api.hud.toast('The shed key'); this.api.audio?.play('reloadDone'); }), until: this.linesDone(), max: 6 }], { back: 0.0 });
    this.say('c1009', 'c1010');
    yield* this.shot([{ look: sw.look, from: sw.from, fov: 44, slow: 1, hold: 1.0, until: this.linesDone(), max: 12 }], { back: 0.7 });
    p.desired = PISTOL;
    this.flags.key = true;
    this.setGoal('shed');
    // (out of his sight she puts the case in the cooler)
    this.later(0.1, () => { const tick = () => { if (Math.hypot(p.x - sp.x, p.z - sp.z) > 7 || this.stop !== 'dock') { this.flags.case = 'cooler'; v.showCase?.('cooler'); } else this.later(0.4, tick); }; tick(); });
  }

  // the playground's horde, about thirty standing about (made at the clubhouse; again on a retry from later)
  ensureHorde() {
    if (this.horde?.some((z) => z.alive)) return this.horde;
    const pg = this.at('playground'); this.horde = [];
    for (let i = 0; i < 28; i++) {
      const a = this.sim.rand() * Math.PI * 2, d = 1.5 + Math.sqrt(this.sim.rand()) * 7.5, x = pg.x + Math.cos(a) * d, z = pg.z + Math.sin(a) * d, q = { x, z };
      if (this.sim.world.resolveCircle(q, 0.45)) continue;
      this.horde.push(this.spawnAt({ x, z }, { near: true, spread: 0, yaw: this.sim.rand() * 6.28, dormant: 2.5, kind: i % 5 === 0 ? 'runner' : undefined, wave: 'horde' }));
    }
    return this.horde;
  }

  // 14. THE SHED: unlocked with the key; the shotgun, the gas; the engine (the cord, a cough, a roar, dead): the horde runs
  *stopShed() {
    const p = this.sim.player, cine = this.api.cine, sp = this.ensureSophie(null, null);
    this.ensureHorde();
    this.music('A_low', 2.5);
    this.prefetch('c1101', 'c1103', 'ENGINE');
    if (this.flags.case !== 'cooler') { this.flags.case = 'cooler'; this.api.view.showCase?.('cooler'); }
    this.setGoal('shed');
    yield* this.use('shed', 'shed_door', 'Unlock the shed', 1.6, { can: () => this.flags.key === true, no: 'Locked' });
    this.api.audio?.play('reloadDone');
    this.openSeal('shed');
    const cs = this.at('shed_chainsaw'), sg = this.at('shed_shotgun'), gs = this.at('shed_gas'), dr = this.at('shed_door');
    let gun = this.flags.gun === 'shotgun';
    if (!gun) this.addPickup({ id: 'shotgun', x: sg.x - 0.45, z: sg.z, y: sg.y, r: 0.8, model: 'shotgun', label: 'Shotgun', onTake: () => { gun = true; this.shotgunOn(null, 16); } });
    if (this.flags.gas === 'shed') { this.api.view.placeGas?.(gs.x, gs.z); this.addUse({ id: 'gas', x: gs.x, z: gs.z, r: 1.3, label: 'Take the gas can', use: () => { this.pickGas(); this.say('c1101'); } }); }
    // what is in there: the chainsaw on the bench, the shotgun on the rack (a beat on it), the can on the floor; the world held
    yield* this.shot([
      { look: [cs.x, cs.y + 0.1, cs.z], from: [dr.x + 0.3, 1.75, dr.z - 1.4], fov: 40, slow: 0.1, hold: 1.2, move: 0.8 },
      { look: [sg.x - 0.1, sg.y - 0.05, sg.z], from: [sg.x - 2.3, sg.y + 0.45, sg.z + 1.25], fov: 36, slow: 0.1, hold: 1.0 },
      { look: [sg.x - 0.1, sg.y - 0.05, sg.z], from: [sg.x - 1.7, sg.y + 0.3, sg.z + 0.95], fov: 34, slow: 0.1, hold: 0.6, move: 1.0 },
      { look: [gs.x, 0.3, gs.z], from: [gs.x - 1.5, 1.45, gs.z + 1.6], fov: 40, slow: 0.1, hold: 1.0 },
    ], { back: 0.7 });
    // (the shotgun or not: once he has the gas, the engine a few seconds later)
    let tg = null;
    yield* this.until(() => { if (this.flags.gas !== 'shed' && tg === null) tg = this.time; return tg !== null && (gun || this.time - tg > 6); });
    yield* this.until(() => !this.api.subs.busy, 4);
    // the cord, far off; then the engine: every bit of music out at the cough so it is heard
    const b = this.boatAt(), pg = this.at('playground');
    if (sp) { const at = { x: b.x + 1.6, z: b.z + 1.95 }; sp.x = at.x; sp.z = at.z; this.sophiePose('hood_Interact', b); sp.subject = true; }
    this.say('c1103');
    yield* this.wait(1.6);
    this.music('none', 0); this.api.voice?.play('ENGINE');
    yield* this.wait(1.4);
    const crowd = () => { const a = (this.horde || []).filter((z) => z.alive); let x = 0, z = 0; for (const q of a) { x += q.x; z += q.z; } return a.length ? [x / a.length, 1.0, z / a.length] : [pg.x, 1.0, pg.z]; };
    yield* this.shot([
      { look: () => this.P(1.4), from: () => [p.x + 1.3, 1.7, p.z + 1.9], fov: 38, slow: 0.5, hold: 1.2, fn: () => { const a = Math.atan2(b.x - p.x, b.z - p.z); p.aimYaw = p.aimTarget = a; } },
      // the horde hears it and runs (C from here)
      { look: crowd, from: { yaw: 50, pitch: 28, dist: 15 }, fov: 42, slow: 0.4, hold: 0.6, fn: () => { this.music('C', 0.4); this.sim.world.rallyAt(-16.5, -63.5); for (const z of this.horde || []) { this.wake([z]); if (z.kind !== 'runner') z.speedMul *= 1.6; } } },
      { look: crowd, from: { yaw: 40, pitch: 34, dist: 16 }, fov: 42, slow: 0.4, hold: 1.8, move: 1.8 },
    ], { back: 0.0 });
    if (sp) sp.subject = false;
  }

  // 15 - 16. THE HORDE: six on Sophie at the boat; the shotgun; the horde in waves
  *stopHorde() {
    const p = this.sim.player, sp = this.sophie, b = this.boatAt(), cine = this.api.cine;
    this.music('C', 0.5);
    this.setGoal('sophie');
    this.openSeal('dock'); this.sim.world.rallyAt(null);
    this.ensureHorde();
    const s = sp || { x: b.x + 1.6, z: b.z + 1.95 };
    // the six on her (she is on the ground by the boat); a cut to her, her cries; back to Marc
    const six = this.ring(s, 6, 1.35, { dormant: 0, wave: 'six' });
    for (const z of six) { z.passive = true; z.speedMul = 0.15; }
    if (sp) { this.sophiePose('hood_Hit_Chest', null, true); sp.subject = true; }
    yield* this.shot([
      { look: [s.x, 0.9, s.z], from: [s.x + 3.4, 1.4, s.z + 3.0], fov: 40, slow: 0.5, rate: 1, hold: 1.0, },
      { look: [s.x, 0.8, s.z], from: [s.x + 2.2, 1.0, s.z + 2.3], fov: 38, slow: 0.5, rate: 1, hold: 1.4, fn: () => { if (sp) this.sophiePose('hood_Crouch_Idle_Loop', null); } },
      { look: () => this.P(1.3), from: () => [p.x + 1.4, 1.65, p.z + 2.0], fov: 40, slow: 0.7, hold: 0.9 },
    ], { back: 0.5 });
    if (sp) sp.subject = false;
    this.setGoal('horde');
    // she goes (and the case is at her feet, out of the cooler: what she was doing reads at a glance)
    this.later(2.2, () => {
      if (sp && sp.mode !== 'dead') sp.die();
      const at = { x: s.x + 0.45, z: s.z + 0.25, yaw: 0.6 }; this.flags.case = 'dead'; this.caseAt = at; this.api.view.showCase?.('ground', at);
      for (const z of six) { z.passive = false; z.speedMul = 1; } this.wake(six);
    });
    // the first blast: one slow beat (onShot -> slowBlast), then the game's own speed
    this.firstBlast = false;
    this.slowBlast = () => { if (cine?.active) return; const c = window.game?.camera; if (!c) return; const f = [c.position.x * 0.8 + p.x * 0.2, c.position.y * 0.85 + 1.4 * 0.15, c.position.z * 0.8 + p.z * 0.2]; cine.play([{ look: () => this.P(1.1), from: f, fov: c.fov * 0.92, slow: 0.22, aim: true, hold: 0.9 }], { back: 0.35 }); };
    // the horde: in through the club's dock gate by the pool, in three waves, each when the last is nearly down
    const GATE = [[-16, -66.5], [-19, -66], [-13.5, -66.8], [-21, -66.2]];
    const far = (this.horde || []).filter((z) => z.alive), waves = [far.slice(0, 10), far.slice(10, 20), far.slice(20)];
    yield* this.wait(3.0);
    for (const wv of waves) {
      if (!wv.length) continue;
      this.bringHorde(wv, GATE);
      yield* this.wait(2.0);
      yield* this.until(() => this.alive([...six, ...wv]) <= 2, 180);
    }
    yield* this.until(() => this.alive([...six, ...far]) === 0 && !this.awakeNear(30), 300);
    // the last one down: a hard cut to silence (Marc's direction: the silence matters more than any track)
    this.music('none', 0);
  }

  // 17. AFTER: the silence; Marc over her; the case at her feet
  *stopAfter() {
    const p = this.sim.player, sp = this.sophie, cine = this.api.cine;
    this.music('none', 0);
    const at = this.caseAt || (sp ? { x: sp.x + 0.45, z: sp.z + 0.25, yaw: 0.6 } : { x: -24, z: -80, yaw: 0 });
    if (this.flags.case !== 'dead') { this.flags.case = 'dead'; this.caseAt = at; this.api.view.showCase?.('ground', at); }
    if (sp && sp.mode !== 'dead') sp.die();
    this.setGoal('caseBack');
    yield* this.wait(1.5);
    p.desired = 'fists';   // (over her: the gun down)
    yield* this.until(() => this.nearXZ(at, 3.2), 120);
    // held, silent: low by her, up at him over her; then the case by her hand
    const s = sp || at;
    const a = Math.atan2(p.x - s.x, p.z - s.z);
    yield* this.shot([
      { look: () => this.P(1.45), from: [s.x - Math.sin(a) * 0.9 + Math.cos(a) * 0.45, 0.68 + groundAt(s), s.z - Math.cos(a) * 0.9 - Math.sin(a) * 0.45], fov: 40, slow: 0.6, hold: 3.2 },
      { look: [at.x, 0.12, at.z], from: [at.x + Math.sin(a) * 0.9, 1.25, at.z + Math.cos(a) * 0.9], fov: 36, slow: 0.6, hold: 1.8 },
    ], { back: 0.8 });
    this.addUse({ id: 'case', x: at.x, z: at.z, r: 1.4, label: 'Take the case', use: () => this.takeCase() });
    yield* this.until(() => this.flags.case === 'carried');
    yield* this.wait(0.9);
    yield* this.talk('c1201');
    p.desired = this.flags.gun === 'shotgun' ? SHOTGUN : PISTOL;
    this.setGoal('');
  }

  // 18. LEAVING: the fuel (D comes in), the motor (it starts on the first pull), the water, Yola
  *stopLeave() {
    const p = this.sim.player, b = this.at('pour_fuel');
    this.prefetch('c1206', 'c1208');
    if (this.flags.case !== 'carried') { this.flags.case = 'carried'; this.api.view.showCase?.('carried'); }
    this.setGoal('fuel');
    let fuelled = this.flags.gas === 'used', launched = false;
    if (!fuelled) {
      this.addUse({ id: 'fuel', x: b.x, z: b.z, r: 2.4, label: 'Fuel the boat', no: 'Bring the gas can', can: () => this.flags.gas === 'carried', use: () => { fuelled = true; this.dropUse('fuel'); } });
      yield* this.until(() => fuelled);
    }
    this.music('D', 3);
    this.api.audio?.play('reloadDone'); this.flags.gas = 'used'; if (this.api.view.gas) { this.api.view.gas.visible = false; this.api.view.gasMode = 'used'; }
    this.setGoal('leave');
    this.addUse({ id: 'launch', x: b.x, z: b.z, r: 2.4, label: 'Start the motor', use: () => { launched = true; this.dropUse('launch'); } });
    yield* this.until(() => launched);
    const eng = this.api.voice?.engine?.();
    // aboard: the boat pulls away from the dock out over the lake, the camera with it; Yola on the radio, D quiet under it
    const boat = this.api.view.boatStart?.();
    this.say('c1206', 'c1208');
    if (boat) {
      this.boating = true; // (Marc stands in the boat: hood.js lifts him onto its floor)
      const dir = { x: -0.99, z: -0.14 };
      for (let t = 0; t < 34 && (t < 12 || this.api.subs.busy); t += STEP) {
        const k = Math.min(1, t / 11), s = 26 * k * k + Math.max(0, t - 11) * 2.4, bx = boat.x + dir.x * s, bz = boat.z + dir.z * s;
        this.api.view.boatAt(bx, bz, t);
        p.x = p.px = bx; p.z = p.pz = bz; p.vx = p.vz = 0;
        for (const z of this.sim.zombies) if (z.alive && Math.hypot(z.x - bx, z.z - bz) < 2) z.x += 0.6; // (nobody climbs aboard)
        eng?.gain?.(Math.max(0.25, 1 - t / 30));
        yield;
      }
    } else yield* this.until(() => !this.api.subs.busy);
    eng?.stop?.(2.5);
    this.complete = true; this.setGoal('');
    this.api.onComplete?.();
    clearSave();
  }

  // a little later, in game time (a one-off beside the story)
  later(s, fn) { const self = this; const co = (function* () { yield* self.wait(s); fn(); })(), t = { step() { if (!t.done && co.next().done) { t.done = true; self.npcs = self.npcs.filter((q) => q !== t); } } }; this.npcs.push(t); }
}
