// Chapter 2 (Marc's neighbourhood): the gauntlet's game state and story, run inside the hospital game's simulation as
// sim.level (core/sim.js steps it after the zombies; main.js shows its prompt). The story is one generator per stop, driven
// by game time (the old Survive build's way: easy to write, skip and test): each yields once per simulation step.
// Seals ('seal:<id>' collision from the Blender export) open as the story reaches them; the view moves their props aside.
// The stops (the user's brief, 2026-10-19): home (hold, the rifle) -> the curve (B06-L's lit garage: bolt cutters) -> the
// gate (cut it, hold the surge) -> the club front (warned off) -> the parking lot (the gas can) -> the clubhouse (the
// looters, the keys) -> the roadblock -> the pavilions -> Grandma's (Lilah) -> the playground -> the dock (fuel, hold, launch).
import { HOOD } from './layout.js';
import { GOALS } from './script.js';
import { SHOTGUN, SHOTGUN_SPEC, PISTOL } from '../core/weapons.js';

const STEP = 1 / 60;
export const STOP_ORDER = ['home', 'curve', 'gate', 'club', 'lot', 'clubhouse', 'west', 'grandma', 'playground', 'dock'];
const SAVE_KEY = 'zc.hoodsave';
export const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; } };
const writeSave = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {} };
export const clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch {} };

// the rifle (the user's Security Rifle C): it rides on the shotgun's hold and clips (its grips were built to the short pump
// shotgun's exactly); one heavy accurate round instead of a pellet cone, a 10-round magazine
const RIFLE = { pellets: 1, spread: 0.004, range: 24, falloffFrom: 22, damage: 85, knockback: 5.5, mag: 10, interval: 0.42, reload: 1.7 };

export class HoodLevel {
  constructor(sim, api, save = null) {
    this.sim = sim; this.api = api; // api: { view, subs, hud, audio, fx } (hood.js)
    const s = save || {};
    this.stop = s.stop || 'home';
    this.flags = { rifle: false, cutters: false, gas: 'lot', keys: false, lilah: false, stowed: false, ...(s.flags || {}) }; // gas: 'lot' | 'carried' | {x, z} on the ground | 'boat'
    this.open = new Set(s.open || []);
    this.taken = new Set(s.taken || []); this.killed = new Set(); this.visited = new Set();
    this.floor = 'hood'; this.prompt = null; this.objective = ''; this.complete = false;
    this.pickups = []; this.interact = []; this.npcs = []; this.time = 0;
    this.t0 = sim.time;
    const p = sim.player;
    // Marc's loadout (to confirm with the user: "what Marc carries"): the bat and the pistol with a few spare rounds
    p.setLoadout(this.flags.rifle ? ['bat', PISTOL, SHOTGUN, 'fists'] : ['bat', PISTOL, 'fists'], 'bat');
    p.mags[PISTOL] = s.pistolMag ?? 12; p.reserve[PISTOL] = s.pistolRes ?? 24;
    if (this.flags.rifle) this.rifleOn(s.rifleMag ?? RIFLE.mag, s.rifleRes ?? 20);
    for (const id of this.open) this.applySeal(id, true);
    const st = this.mark('start_' + this.stop) || this.startFor(this.stop);
    p.x = p.px = st[0]; p.z = p.pz = st[2]; p.aimYaw = p.aimTarget = st[3] ?? Math.PI / 2;
    this.co = this.run();
  }
  mark(n) { return HOOD.marks[n] || null; }
  at(n) { const m = this.mark(n); return m ? { x: m[0], z: m[2], yaw: m[3] } : { x: 0, z: 0, yaw: 0 }; }
  // where each stop restarts (a checkpoint): a safe spot at its start
  startFor(stop) {
    const S = { home: [38.2, 0, 40.6, Math.PI / 2], curve: [26.5, 0, 10.5, -Math.PI / 2], gate: [18.6, 0, -9.5, Math.PI], club: [17.5, 0, -22, Math.PI],
      lot: [30, 0, -46, 2.3], clubhouse: [13, 0, -41.5, Math.PI], west: [-4, 0, -31, -Math.PI / 2], grandma: [-36, 0, -6, -2.6],
      playground: [-43, 0, 4, Math.PI], dock: [-14, 0, -60, Math.PI] };
    return S[stop] || S.home;
  }
  setGoal(k) { if (k !== this.objective) this.goalT0 = this.time; this.objective = k; this.api.hud.setObjective(GOALS[k] || k || ''); }
  // where the current objective is (the hint marker, hint.js); none while the job is to hold ground
  goalTarget() {
    const T = { rifle: 'rifle_drop', push: 'seal_home_use', cutters: 'cutters', gate: 'gate_use', lot: 'gas_can', gas: 'gas_can', keys: 'club_door',
      roadblock: 'roadblock_use', stow: 'pour_fuel', lilah: 'grandma_door', boat: 'pour_fuel', fuel: 'pour_fuel', launch: 'pour_fuel' }[this.objective];
    if (this.objective === 'gas' && typeof this.flags.gas === 'object') return this.flags.gas;
    if (this.objective === 'stow' && this.flags.gas !== 'carried') return typeof this.flags.gas === 'object' ? this.flags.gas : null;
    return T ? this.at(T) : null;
  }
  say(...ids) { for (const id of ids) this.api.subs.say(id); }
  checkpoint(stop) {
    this.stop = stop; const p = this.sim.player;
    writeSave({ v: 1, stop, flags: this.flags, open: [...this.open], taken: [...this.taken], pistolMag: p.mags[PISTOL], pistolRes: p.reserve[PISTOL], rifleMag: p.mags[SHOTGUN], rifleRes: p.reserve[SHOTGUN] });
  }

  // ---------------------------------------------------------------- the simulation's hooks
  onWake() {}
  step(dt, input) {
    this.time += dt;
    const p = this.sim.player;
    for (const n of this.npcs) n.step?.(dt, this);
    this.pickupStep(p);
    this.carryStep(p, input);
    const r = this.co.next(); if (r.done) this.co = (function* () {})();
    this.prompt = p.dead ? null : this.findPrompt(p);
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

  // ---------------------------------------------------------------- the rifle and the gas can
  rifleOn(mag = RIFLE.mag, res = 20) {
    const p = this.sim.player, T = this.sim.T;
    Object.assign(SHOTGUN_SPEC, { pellets: RIFLE.pellets, spread: RIFLE.spread, range: RIFLE.range, falloffFrom: RIFLE.falloffFrom });
    Object.assign(T, { shotgunDamage: RIFLE.damage, shotgunKnockback: RIFLE.knockback, shotgunMag: RIFLE.mag, shotgunInterval: RIFLE.interval, shotgunReload: RIFLE.reload });
    if (!p.owned.includes(SHOTGUN)) p.owned.splice(Math.max(0, p.owned.indexOf('fists')), 0, SHOTGUN);
    p.mags[SHOTGUN] = mag; p.reserve[SHOTGUN] = res;
    this.api.view.rifleOn?.();
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
  // a zombie at a mark (or {x, z}), facing the player; opts: kind, dormant (sense m), hp
  spawnAt(where, opts = {}) {
    const p = this.sim.player;
    let m = typeof where === 'string' ? this.at(where) : where;
    // never on top of her, never in plain sight: a mark nearer than 11 m (a portrait screen shows ~10 m up) gives way to the farthest of its stop's others
    // (marks are named z_<stop>_<n>)
    if (typeof where === 'string' && Math.hypot(m.x - p.x, m.z - p.z) < 11) {
      const pre = where.split('_').slice(0, 2).join('_') + '_';
      const alt = Object.keys(HOOD.marks).filter((n) => n.startsWith(pre)).map((n) => this.at(n)).sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z))[0];
      if (alt && Math.hypot(alt.x - p.x, alt.z - p.z) > Math.hypot(m.x - p.x, m.z - p.z)) m = alt;
    }
    const j = () => (this.sim.rand() - 0.5) * (opts.spread ?? 1.6);
    const x = m.x + j(), z = m.z + j();
    const zb = this.sim.spawnZombie(null, { x, z, yaw: Math.atan2(p.x - x, p.z - z), kind: opts.kind });
    if (opts.dormant) { zb.passive = true; zb.dormant = { wake: Infinity, sense: opts.dormant, speedMul: zb.speedMul }; zb.speedMul = 0; }
    zb.hoodWave = opts.wave || null;
    return zb;
  }
  // a wave: [[mark, kind?] ...] spawned `every` s apart, the farthest-from-player marks first (never on top of her)
  *wave(list, every = 0.8, tag = 'w') {
    const out = [];
    for (const [where, kind, dormant] of list) {
      out.push(this.spawnAt(where, { kind, dormant, wave: tag }));
      yield* this.wait(every);
    }
    return out;
  }
  alive(group) { return group.filter((z) => z.alive).length; }
  *wait(s) { for (let t = 0; t < s; t += STEP) yield; }
  *until(fn, max = Infinity) { for (let t = 0; !fn() && t < max; t += STEP) yield; }
  *talk(...ids) { this.say(...ids); yield; yield* this.until(() => !this.api.subs.busy); }
  near(name, r) { const m = this.at(name), p = this.sim.player; return Math.hypot(p.x - m.x, p.z - m.z) < r; }

  // ---------------------------------------------------------------- supplies (polish pass 2: never stuck for rounds)
  // each stop's ammo and first aid: in the places people would have left them (the brief: "Don't make ... running out of
  // ammunition permanently block progress"); the bat never runs out either
  addSupplies(stop) {
    const S = {
      home: [['ammo_p', 53.0, -1.5, 'pistol'], ['med', 54.6, -3.6], ['ammo_p2', 44.2, 26.5, 'pistol']],
      curve: [['ammo_r', 3.6, -5.6, 'rifle'], ['ammo_p', 13.0, 15.0, 'pistol']],
      gate: [['med', 24.5, -7.5]],
      lot: [['ammo_r', 63.2, -72.2, 'rifle'], ['med', 48.0, -76.5], ['ammo_p', 72.5, -66.0, 'pistol']],
      clubhouse: [['med', 14.5, -52.0], ['ammo_r', 12.2, -59.6, 'rifle']],
      west: [['ammo_p', -23.0, -30.0, 'pistol']],
      playground: [['ammo_r', -40.0, -11.5, 'rifle']],
      dock: [['med', -19.5, -73.5], ['ammo_r', -16.5, -70.0, 'rifle']],
    }[stop] || [];
    const p = this.sim.player;
    for (const [id, x, z, w] of S) {
      const key = stop + ':' + id, med = id.startsWith('med');
      this.addPickup({ id: key, x, z, r: 1.0, model: med ? 'health' : 'ammo', label: med ? 'First aid' : w === 'rifle' ? 'Rifle rounds' : 'Pistol rounds',
        when: med ? () => p.hp < p.maxHp : null,
        onTake: () => { if (med) p.hp = Math.min(p.maxHp, p.hp + 50); else if (w === 'rifle') p.reserve[SHOTGUN] = (p.reserve[SHOTGUN] || 0) + 10; else p.reserve[PISTOL] = (p.reserve[PISTOL] || 0) + 12; } });
    }
  }

  // ---------------------------------------------------------------- the story
  *run() {
    this.started = false;
    const from = STOP_ORDER.indexOf(this.stop);
    yield; this.started = true;
    const stops = { home: this.stopHome, curve: this.stopCurve, gate: this.stopGate, club: this.stopClub, lot: this.stopLot, clubhouse: this.stopClubhouse,
      west: this.stopWest, grandma: this.stopGrandma, playground: this.stopPlayground, dock: this.stopDock };
    for (let i = Math.max(0, from); i < STOP_ORDER.length; i++) {
      const id = STOP_ORDER[i];
      this.checkpoint(id);
      this.api.onStop?.(id);
      this.addSupplies(id);
      yield* stops[id].call(this);
    }
  }

  // 1. HOME: the radio, the shots, the first infected, the rifle
  *stopHome() {
    const p = this.sim.player;
    this.setGoal('');
    yield* this.wait(1.2);
    yield* this.talk('l01', 'l02', 'l03', 'l04', 'l05', 'l06');
    // shots: the survivor on the loop arm, firing at what comes down from the curve
    const surv = this.api.npc?.('survivor', this.at('survivor_rifle'), { friendly: true, gun: 'rifle' });
    const far = [this.api.npc?.('survivor', this.at('survivor_far_a'), { friendly: true, gun: 'pistol' }), this.api.npc?.('survivor', this.at('survivor_far_b'), { friendly: true, gun: 'pistol' })].filter(Boolean);
    yield* this.wait(0.6);
    this.say('l07');
    this.setGoal('home');
    let w1 = yield* this.wave([['z_home_curve'], ['z_home_yard'], ['z_home_curve', 'normal']], 0.9, 'h1');
    yield* this.talk('l08', 'l09', 'l10', 'l11', 'l12');
    const w2 = yield* this.wave([['z_home_garage'], ['z_home_fence'], ['z_home_yard', 'runner'], ['z_home_garage']], 1.1, 'h2');
    yield* this.until(() => this.alive(w1) + this.alive(w2) <= 2, 40);
    // the far survivors go under; the rifle survivor backs up and is overwhelmed: the rifle falls on the arm
    this.say('l13');
    for (const n of far) n.overwhelm?.();
    const w3 = yield* this.wave([['z_home_curve'], ['z_home_curve', 'runner'], ['z_home_fence']], 0.7, 'h3');
    yield* this.wait(2.5);
    surv?.overwhelm?.();
    const drop = this.at('rifle_drop');
    this.setGoal('rifle');
    this.addPickup({ id: 'rifle', x: drop.x, z: drop.z, r: 1.1, model: 'rifle', label: 'Rifle', onTake: () => { this.flags.rifle = true; this.rifleOn(); p.desired = SHOTGUN; } });
    // the pick-up is risky: the curve keeps feeding the arm while it lies there
    const w4 = yield* this.wave([['z_home_pile'], ['z_home_curve'], ['z_home_garage', 'runner']], 1.2, 'h4');
    yield* this.until(() => this.flags.rifle, 120);
    this.setGoal('home');
    // something to enjoy it on: a bigger push from three sides
    const w5 = yield* this.wave([['z_home_curve'], ['z_home_fence'], ['z_home_yard'], ['z_home_garage', 'runner'], ['z_home_curve'], ['z_home_pile'], ['z_home_fence', 'runner'], ['z_home_curve']], 0.6, 'h5');
    yield* this.until(() => this.alive([...w1, ...w2, ...w3, ...w4, ...w5]) <= 1, 90);
    yield* this.wait(1.0);
    yield* this.talk('l14', 'l15', 'l16', 'l17', 'l18');
    this.api.companion?.('arianna', true);
    // the way on: the survivors' barricade across the curve
    this.setGoal('push');
    let pushed = false;
    const u = this.at('seal_home_use');
    this.addUse({ id: 'push', x: u.x, z: u.z, r: 2.0, label: 'Push the barricade over', use: () => { pushed = true; this.dropUse('push'); this.openSeal('home'); this.api.audio?.play('knockdown'); } });
    yield* this.until(() => pushed);
  }

  // 2. THE CURVE: the lit garage at B06's end; its dark corners are not empty
  *stopCurve() {
    if (!this.open.has('home')) this.openSeal('home');
    this.setGoal('cutters');
    this.api.view.garageLight?.(true);
    const c = this.at('cutters');
    this.addPickup({ id: 'cutters', x: c.x, z: c.z, r: 1.2, model: 'cutters', label: 'Bolt cutters', onTake: () => { this.flags.cutters = true; } });
    const w1 = [this.spawnAt('z_garage', { dormant: 5.5 }), this.spawnAt('z_garage', { dormant: 5.5 })];
    yield* this.until(() => Math.hypot(this.sim.player.x - 14, this.sim.player.z - 10) < 9 || this.flags.cutters);
    const w2 = yield* this.wave([['z_curve_bus'], ['z_curve_yard'], ['z_curve_bus', 'runner'], ['z_curve_yard']], 1.3, 'c1');
    yield* this.until(() => this.flags.cutters);
    this.api.view.garageLight?.(false);
    this.setGoal('gate');
    void w1; void w2;
  }

  // 3. THE GATE: cut the chain, the surge from the club side, hold the gap
  *stopGate() {
    this.flags.cutters = true;
    this.setGoal('gate');
    let cut = false;
    const g = this.at('gate_use');
    this.addUse({ id: 'gate', x: g.x, z: g.z, r: 2.2, label: 'Cut the chain', use: () => { cut = true; this.dropUse('gate'); } });
    yield* this.until(() => cut);
    yield* this.talk('l19');
    this.api.audio?.play('pumpRack'); yield* this.wait(0.9); this.api.audio?.play('knockdown');
    this.openSeal('gate');
    this.setGoal('holdgate');
    const w = yield* this.wave([['z_gate_a'], ['z_gate_b'], ['z_gate_c', 'runner'], ['z_gate_d'], ['z_gate_a'], ['z_gate_b', 'runner'], ['z_gate_c'], ['z_gate_d'], ['z_gate_a', 'sprinter']], 0.55, 'g1');
    yield* this.until(() => this.alive(w) <= 1, 120);
    yield* this.wait(1.5);
    yield* this.talk('l20', 'l21', 'l22', 'l23');
  }

  // 4. THE CLUB FRONT: voices inside, a warning shot; a few on the drive
  *stopClub() {
    this.setGoal('lot');
    yield* this.until(() => this.near('club_warn', 7));
    this.say('w01');
    this.api.warnShot?.(this.at('club_door'), this.sim.player);
    const w = yield* this.wave([['z_drive_a'], ['z_drive_b'], ['z_drive_a', 'runner']], 1.0, 'd1');
    yield* this.until(() => this.sim.player.x > 30 || this.alive(w) === 0, 120);
  }

  // 5. THE PARKING LOT: the gas can in the maintenance pickup's bed; they come at the lot from every side
  *stopLot() {
    this.setGoal('gas');
    const gc = this.at('gas_can');
    if (this.flags.gas === 'lot') this.api.view.placeGas?.(gc.x, gc.z, true);
    yield* this.until(() => this.near('gas_can', 9));
    yield* this.talk('l24');
    const w1 = yield* this.wave([['z_lot_a'], ['z_lot_b'], ['z_lot_c'], ['z_lot_d', 'runner']], 0.9, 'p1');
    if (this.flags.gas === 'lot') this.addUse({ id: 'gas', x: gc.x, z: gc.z, r: 1.6, label: 'Take the gas can', use: () => { this.pickGas(); this.say('l25'); } });
    yield* this.until(() => this.flags.gas === 'carried');
    const w2 = yield* this.wave([['z_lot_e'], ['z_lot_a', 'runner'], ['z_lot_c'], ['z_lot_b'], ['z_lot_d'], ['z_lot_e', 'runner'], ['z_lot_a']], 0.75, 'p2');
    yield* this.until(() => this.alive([...w1, ...w2]) <= 1, 120);
    yield* this.talk('l26', 'l27');
    this.setGoal('keys');
  }

  // 6. THE CLUBHOUSE: the looters come out shooting; the leader holds the keys in the office
  *stopClubhouse() {
    this.setGoal('keys');
    yield* this.until(() => this.near('club_door', 10));
    this.say('w02');
    this.openSeal('clubdoor');
    const L = this.api.looters?.(this) || [];
    this.setGoal('looters');
    yield* this.until(() => this.near('club_door', 2.5) || L.filter((q) => q.out && q.alive).length === 0, 240);
    this.say('l28', 'w03');
    yield* this.until(() => this.flags.keys);
    yield* this.talk('l29');
  }

  // 7. THE ROADBLOCK and the west side: their padlocked gate; the gas goes to the boat on the way
  *stopWest() {
    this.flags.keys = true;
    this.setGoal('roadblock');
    let unlocked = this.open.has('roadblock');
    const r = this.at('roadblock_use');
    if (!unlocked) this.addUse({ id: 'roadblock', x: r.x, z: r.z, r: 2.0, label: 'Unlock the roadblock gate', use: () => { unlocked = true; this.dropUse('roadblock'); this.openSeal('roadblock'); this.openSeal('dock'); this.api.audio?.play('reloadDone'); } });
    yield* this.until(() => unlocked);
    if (!this.open.has('dock')) this.openSeal('dock');
    // the gas: to the boat if Marc has it with him (the dock is just past the pool)
    if (this.flags.gas !== 'boat') {
      this.setGoal('stow');
      const b = this.at('pour_fuel');
      this.addUse({ id: 'stow', x: b.x, z: b.z, r: 2.4, label: 'Stow the gas in the boat', no: 'Bring the gas can', can: () => this.flags.gas === 'carried', use: () => { this.flags.gas = 'boat'; this.dropUse('stow'); this.api.view.stowGas?.(); this.say('d01'); } });
      const w = yield* this.wave([['z_pav_a'], ['z_pav_b']], 1.5, 'r1');
      yield* this.until(() => this.flags.gas === 'boat');
      void w;
    }
  }

  // 8. GRANDMA'S: Lilah, a short family beat (no tragedy invented; Grandma's part is the user's to decide)
  *stopGrandma() {
    this.setGoal('lilah');
    const w = yield* this.wave([['z_pav_a'], ['z_pav_b'], ['z_pav_a', 'runner']], 1.4, 'm1');
    let knocked = false;
    const d = this.at('grandma_door');
    this.addUse({ id: 'grandma', x: d.x, z: d.z, r: 2.0, label: 'Knock: Lilah!', use: () => { knocked = true; this.dropUse('grandma'); } });
    yield* this.until(() => knocked);
    yield* this.until(() => this.alive(w) === 0, 20);
    yield* this.talk('l30', 'l31');
    this.flags.lilah = true;
    this.api.companion?.('lilah', true);
    yield* this.talk('l32', 'l33', 'l34');
  }

  // 9. THE PLAYGROUND: quiet, then they cut the pause short
  *stopPlayground() {
    this.setGoal('boat');
    yield* this.until(() => this.near('playground', 7));
    yield* this.wait(3.5);
    yield* this.wave([['z_play_a'], ['z_play_c'], ['z_play_b', 'runner'], ['z_play_d'], ['z_play_a', 'runner'], ['z_play_c'], ['z_play_d'], ['z_play_a', 'sprinter']], 0.7, 'pl');
  }

  // 10. THE DOCK: fuel, everyone aboard, the last push, launch
  *stopDock() {
    this.setGoal('fuel');
    let fuelled = false, launched = false;
    const b = this.at('pour_fuel');
    this.addUse({ id: 'fuel', x: b.x, z: b.z, r: 2.4, label: 'Fuel the boat', no: 'The girls first', can: () => this.flags.lilah && this.flags.gas === 'boat', use: () => { fuelled = true; this.dropUse('fuel'); } });
    yield* this.until(() => fuelled);
    this.api.audio?.play('reloadDone'); this.flags.gas = 'used'; if (this.api.view.gas) { this.api.view.gas.visible = false; this.api.view.gasMode = 'used'; } // (poured into the tank)
    this.setGoal('hold');
    const w = yield* this.wave([['z_dock_a'], ['z_dock_b'], ['z_dock_c', 'runner'], ['z_dock_a'], ['z_dock_b', 'runner'], ['z_dock_c'], ['z_dock_a', 'sprinter'], ['z_dock_b']], 0.8, 'k1');
    yield* this.until(() => this.alive(w) <= 1, 150);
    this.setGoal('launch');
    this.addUse({ id: 'launch', x: b.x, z: b.z, r: 2.4, label: 'Start the motor', use: () => { launched = true; this.dropUse('launch'); } });
    yield* this.until(() => launched);
    // aboard: Marc (and the girls) in the boat; it pulls away from the dock out over the lake, the camera with it
    const boat = this.api.view.boatStart?.();
    if (boat) {
      this.boating = true; // (Marc stands in the boat: hood.js lifts him onto its floor)
      this.say('l35', 'l36', 'l37');
      const p = this.sim.player, dir = { x: -0.99, z: -0.14 };
      for (let t = 0; t < 11; t += STEP) {
        const k = Math.min(1, t / 11), s = 26 * k * k, bx = boat.x + dir.x * s, bz = boat.z + dir.z * s;
        this.api.view.boatAt(bx, bz, t);
        p.x = p.px = bx; p.z = p.pz = bz; p.vx = p.vz = 0;
        for (const z of this.sim.zombies) if (z.alive && Math.hypot(z.x - bx, z.z - bz) < 2) z.x += 0.6; // (nobody climbs aboard)
        yield;
      }
    } else yield* this.talk('l35', 'l36', 'l37');
    this.complete = true; this.setGoal('');
    this.api.onComplete?.();
    clearSave();
  }
}
