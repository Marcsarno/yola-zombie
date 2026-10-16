// Weapon test arena (combat.html?mode=arena): every attack picked in the Move Library (moves.html: verdict good or maybe,
// assigned to a weapon, with the speed / hand / roll / slide it was judged with) playable in the real game, against
// practice dummies or live zombies, next to the game's own attacks. A panel picks the weapon and the attack, spawns
// zombies, and records how each one feels (shots/arena_feel.json).
// Each library attack is built from its clip on Yola (assets/moves/yola_moves.glb): the clip is posed frame by frame
// with the weapon placed in her fist exactly as it is drawn, giving the weapon's path (the hit test), its damaging
// windows (where the weapon's business end moves fast: a combo clip has several, each hits afresh), and her forward
// travel (the hips' advance, applied by the game as the attack's root motion).
import * as THREE from 'three';
import { TEST, TEST_ATTACKS, BAT, AXE, FISTS, PISTOL, SHOTGUN, attackTime, attackEnd, resetGroundAttacks } from '../core/weapons.js';
import { makeBat, prepAxe, makeKnife } from '../render/weaponModels.js';

const FPS = 30;
const ORDER = ['bat', 'sledgehammer', 'axe', 'crowbar', 'chainsaw', 'knife', 'none', 'pistol', 'shotgun'];
const LABEL = { bat: 'Bat', sledgehammer: 'Sledgehammer', axe: 'Axe', crowbar: 'Crowbar', chainsaw: 'Chainsaw', knife: 'Knife', none: 'Unarmed', pistol: 'Pistol', shotgun: 'Shotgun' };
// How each weapon hits. dmg / knock: x the game's axe damage (62) and impact (zombies have 100 hp). kind: bat = blunt,
// axe = a blade (cuts limbs, by sever chances), fist = unarmed. hitFrom: the part of the weapon past this fraction of its
// length lands blows; radius: its head's size.
const PROFILE = {
  bat: { kind: 'bat', dmg: 0.75, knock: 1.0, style: 'swing', sever: {}, hitFrom: 0.45, radius: 0.1, reach: 'tip' },
  sledgehammer: { kind: 'bat', dmg: 1.45, knock: 1.6, style: 'heavy', sever: {}, hitFrom: 0.55, radius: 0.14 },
  axe: { kind: 'axe', dmg: 1.0, knock: 1.0, style: 'swing', sever: { head: 0.35, arm: 0.25 }, hitFrom: 0.5, radius: 0.1 },
  crowbar: { kind: 'bat', dmg: 0.7, knock: 0.8, style: 'swing', sever: {}, hitFrom: 0.4, radius: 0.09 },
  chainsaw: { kind: 'axe', dmg: 0.9, knock: 0.5, style: 'swing', sever: { head: 0.4, arm: 0.4, leg: 0.2 }, hitFrom: 0.3, radius: 0.11 },
  knife: { kind: 'axe', dmg: 0.6, knock: 0.4, style: 'swing', sever: { head: 0.12, arm: 0.2 }, hitFrom: 0.2, radius: 0.08 },
  none: { kind: 'fist', dmg: 1.4, knock: 0.7, style: 'cross', sever: {} },
};
// the game's own attacks, equipped exactly as in the game
const GAME = { bat: [BAT, 'Game: bat combo (3 hits)'], axe: [AXE, 'Game: axe swing + chop'], none: [FISTS, 'Game: jab, cross, kick'], pistol: [PISTOL, 'Game: pistol'], shotgun: [SHOTGUN, 'Game: shotgun'] };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private */ } } };

async function json(url) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }
// the newest of: the dev server's live copy, the copy shipped with the game, this browser's own copy (moves.html)
async function loadSelection() {
  const all = [await json('shots/move_selection.json?' + Date.now()), await json('assets/moves/selection.json'), store.get('moves_selection', null)].filter(Boolean);
  return all.sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0] || { moves: {} };
}

export async function startTestArena({ game, scene, loader, telegraphs }) {
  const yola = game.yola;
  const [catalog, wj, SEL, lib] = await Promise.all([json('assets/moves/catalog.json'), json('assets/moves/weapons.json'), loadSelection(), loader.loadAsync('assets/moves/yola_moves.glb')]);
  const WDEF = wj?.weapons || {};
  const clips = Object.fromEntries(lib.animations.map((c) => [c.name, c]));
  const meta = Object.fromEntries((catalog?.clips || []).map((c) => [c.clip, c]));
  // her closed fist (a frame of the built bat combo where both hands grip the bat), put on each hand holding a weapon
  let fingers = null;
  {
    const gc = clips.built_bat_combo_v4;
    if (gc) {
      const a = yola.mixer.clipAction(gc); for (const x of Object.values(yola.actions)) x.setEffectiveWeight(0);
      a.play(); a.setEffectiveWeight(1); a.time = Math.min(...gc.tracks.map((t) => t.times[0])) + 9 / FPS; yola.mixer.update(0);
      fingers = Object.entries(yola.bones).filter(([n]) => /Hand(Thumb|Index|Middle|Ring|Pinky)\d/.test(n)).map(([n, b]) => [n, b.quaternion.clone()]);
      a.stop(); yola.mixer.uncacheAction(gc);
    }
  }
  // weapon models (one holder each, in the scene; YolaView places the one in use)
  const models = {};
  async function model(key) {
    if (key in models) return models[key];
    const w = WDEF[key]; let o = null;
    try {
      if (w?.builder === 'makeBat') o = makeBat(0.84);
      else if (w?.builder === 'knife') o = makeKnife();
      else if (w?.file) { const g = await loader.loadAsync(w.file); o = w.prep === 'axe' ? prepAxe(g) : g.scene; }
    } catch (e) { console.warn('weapon', key, e); }
    if (o) { o.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; } }); const h = new THREE.Group(); h.add(o); h.visible = false; scene.add(h); o = h; }
    return (models[key] = o);
  }

  await Promise.all(ORDER.filter((k) => WDEF[k] && k !== 'pistol' && k !== 'shotgun').map(model)); // all loaded now: their shaders compile with the game's warm-up

  // ---- the picks: one entry per (move, weapon) the user assigned; reloads and other gun moves stay in the Move Library ----
  const entries = [];
  for (const [clip, m] of Object.entries(SEL.moves || {})) {
    if (m.verdict === 'no' || !clips[clip]) continue;
    for (const u of m.uses || []) {
      if (u.weapon === 'pistol' || u.weapon === 'shotgun') continue;
      entries.push({ id: clip + '|' + u.weapon, clip, weapon: u.weapon, label: meta[clip]?.label || clip, verdict: m.verdict, why: u.why || '', note: m.note || '',
        speed: +u.speed || 1, hand: u.hand || 'Right', roll: +u.roll || 0, slide: +u.slide || 0, flip: !!u.flip });
    }
  }
  const order = { good: 0, maybe: 1 };
  entries.sort((a, b) => (order[a.verdict] ?? 2) - (order[b.verdict] ?? 2) || a.label.localeCompare(b.label));

  // ---- build a library attack: pose the clip frame by frame with the weapon in her hand ----
  const V = () => new THREE.Vector3();
  function sample(e, A, rawClip, w) {
    const Y = yola, acts = Object.values(Y.actions), saved = acts.map((a) => [a, a.getEffectiveWeight(), a.time]);
    const op = Y.outer.position.clone(), ry = Y.container.rotation.y;
    Y.outer.position.set(0, 0, 0); Y.container.rotation.y = 0;
    for (const a of acts) a.setEffectiveWeight(0);
    const act = Y.act(e.clip), raw = Y.mixer.clipAction(rawClip); raw.play(); raw.timeScale = 0;
    const ff = { c: V(), a: V(), k: V() }, rows = [];
    const pose = (a, f) => { for (const [b, q] of Y.restQ) b.quaternion.copy(q); a.setEffectiveWeight(1); a.time = f / FPS + (f & 1) * 1e-6; Y.mixer.update(0); Y.outer.updateMatrixWorld(true); a.setEffectiveWeight(0); };
    // (two passes: posing the two copies alternately frame by frame leaves the mixer applying stale poses)
    const travel = [];
    for (let f = A.f0; f <= A.f1; f++) { pose(raw, f); travel.push(Y.bones.Hips.getWorldPosition(V())); } // unpinned: her travel
    for (let f = A.f0; f <= A.f1; f++) {
      const hips = travel[f - A.f0];
      pose(act, f); act.setEffectiveWeight(1);
      Y.placeTest();
      const row = { f, hips, pin: Y.bones.Hips.getWorldPosition(V()) };
      if (w) { row.grip = Y.testGrip.clone(); row.tip = Y.testTip.clone(); }
      else { row.l = Y.fistFrame('Left', ff).c.clone(); row.r = Y.fistFrame('Right', ff).c.clone(); row.lf = Y.bones.LeftToeBase.getWorldPosition(V()); row.rf = Y.bones.RightToeBase.getWorldPosition(V()); }
      act.setEffectiveWeight(0); rows.push(row);
    }
    raw.stop(); Y.mixer.uncacheAction(rawClip);
    for (const [a, wt, t] of saved) { a.setEffectiveWeight(wt); a.time = t; }
    Y.outer.position.copy(op); Y.container.rotation.y = ry;
    return rows;
  }
  async function buildAttack(e, speed) {
    const P = PROFILE[e.weapon], w = WDEF[e.weapon] && e.weapon !== 'none' ? WDEF[e.weapon] : null;
    const obj = w ? await model(e.weapon) : null;
    const src = clips[e.clip], t0 = Math.min(...src.tracks.map((t) => t.times[0]));
    const play = src.clone(); play.name = e.clip; yola.addAttackClips([play]);
    yola.setTestWeapon({ obj, w, hand: e.hand, roll: e.roll, slide: e.slide, flip: e.flip, two: w?.hands === 'two', fingers: w ? fingers : null });
    if (w && P.reach === 'tip' && w.tip) yola.test.w = { ...w, impact_point: w.tip };
    const f0 = Math.round(t0 * FPS), f1 = f0 + (meta[e.clip]?.frames || Math.round((src.duration - t0) * FPS) + 1) - 1;
    const A = { name: e.label, clip: e.clip, path: e.clip, f0, f1, fps: FPS, rate: speed, yawOffset: 0, chainFrom: 9, recover: 0.3, stand: 0.9, assist: 1.9,
      lungeMax: 0.5, enterBlend: 0.12, minY: 0.45, kind: P.kind, dmg: P.dmg, knock: P.knock, style: P.style, sever: P.sever, sound: e.weapon };
    const rows = sample(e, A, src.clone(), w);
    // the striking point and the weapon (or limb) direction, character space
    let pts, dirs, L, geom;
    if (w) {
      L = rows[0].tip.distanceTo(rows[0].grip);
      pts = rows.map((r) => r.grip); dirs = rows.map((r) => r.tip.clone().sub(r.grip).normalize());
      geom = { length: L, hitFrom: P.hitFrom, radius: P.radius };
    } else { // unarmed: the limb that moves fastest in this clip (a fist, or the foot for a kick)
      let best = 'r', bp = 0;
      for (const k of ['l', 'r', 'lf', 'rf']) for (let i = 1; i < rows.length; i++) { const v = rows[i][k].distanceTo(rows[i - 1][k]); if (v > bp) { bp = v; best = k; } }
      pts = rows.map((r) => r[best]); dirs = rows.map((r) => { const d = r[best].clone().sub(r.pin); d.y = 0; return d.normalize(); });
      L = 0.12; geom = { length: L, hitFrom: 0, radius: best.endsWith('f') ? 0.15 : 0.12 };
      if (best.endsWith('f')) { A.style = 'kick'; A.dmg = 2.2; A.knock = 1.0; }
      A.limb = best;
    }
    A.geom = geom;
    A.PATH = rows.map((r, i) => ({ t: attackTime(A, r.f), mx: pts[i].x, my: pts[i].y, mz: pts[i].z, dx: dirs[i].x, dy: dirs[i].y, dz: dirs[i].z }));
    // damaging windows: where the business end moves fast (each one hits afresh)
    const tip = (i) => pts[i].clone().addScaledVector(dirs[i], L);
    const sp = rows.map((r, i) => (i ? tip(i).distanceTo(tip(i - 1)) * FPS : 0));
    const peak = Math.max(...sp), thr = Math.max(w ? 2.6 : 2.0, peak * 0.42);
    const wins = []; let cur = null;
    sp.forEach((v, i) => { if (v >= thr) { if (cur && i - cur[1] <= 3) cur[1] = i; else { if (cur) wins.push(cur); cur = [i, i]; } } });
    if (cur) wins.push(cur);
    let windows = wins.filter((x) => x[1] - x[0] >= 1).map(([a, b]) => [attackTime(A, rows[Math.max(0, a - 1)].f), attackTime(A, rows[Math.min(rows.length - 1, b + 1)].f)]);
    const end = attackEnd(A);
    if (!windows.length) windows = [[end * 0.3, end * 0.6]];
    A.windows = windows; A.activeStart = windows[0][0]; A.activeEnd = windows[windows.length - 1][1];
    A.duration = end + A.recover; A.swapPoint = end * 0.85;
    A.peak = peak;
    // her travel: the hips' forward advance through the clip (applied as root motion; she stops short of a target)
    const z0 = rows[0].hips.z, R = rows.map((r) => ({ t: attackTime(A, r.f), z: Math.max(0, r.hips.z - z0) }));
    for (let i = 1; i < R.length; i++) R[i].z = Math.max(R[i].z, R[i - 1].z); // never pulled back
    A.ROOT = R[R.length - 1].z > 0.3 ? R : null; // (a small shuffle: the game's own step toward the target instead)
    return splitCombo(A);
  }
  // A combo clip (several strikes) becomes a chain of attacks, one per strike, cut between strikes, so the combo can stop
  // after any hit: tap once for one strike, keep tapping (or hold) for the next, which starts on the very frame the last
  // one ends (one continuous clip: no blend between them). Stopping early blends that strike's last pose back to the idle.
  function splitCombo(A) {
    const n = A.windows.length;
    if (n < 2) return [A];
    const toF = (t) => A.f0 + t * FPS * A.rate;
    const cuts = A.windows.slice(0, -1).map(([, e], i) => Math.round(toF(e) + (toF(A.windows[i + 1][0]) - toF(e)) * 0.45));
    const bounds = [A.f0, ...cuts, A.f1];
    return A.windows.map((win, i) => {
      const fa = bounds[i], fb = bounds[i + 1], t0 = (fa - A.f0) / (FPS * A.rate), t1 = (fb - A.f0) / (FPS * A.rate);
      const S = { ...A, name: `${A.name} ${i + 1}/${n}`, f0: fa, f1: fb, continuous: true, chainAlways: true, last: i === n - 1 };
      S.PATH = A.PATH.filter((q) => q.t >= t0 - 1e-6 && q.t <= t1 + 1e-6).map((q) => ({ ...q, t: q.t - t0 }));
      S.windows = [[Math.max(0, win[0] - t0), win[1] - t0]]; S.activeStart = S.windows[0][0]; S.activeEnd = S.windows[0][1];
      const end = attackEnd(S);
      S.duration = end + (S.last ? A.recover : 0.4); S.swapPoint = end * 0.85; S.chainFrom = S.last ? 9 : end;
      if (A.ROOT) { const R = A.ROOT.filter((q) => q.t >= t0 - 1e-6 && q.t <= t1 + 1e-6), z0 = R[0]?.z || 0; S.ROOT = R.length > 1 && R[R.length - 1].z - z0 > 0.05 ? R.map((q) => ({ t: q.t - t0, z: q.z - z0 })) : null; }
      return S;
    });
  }

  // ---- state and arena actions ----
  const S = { textures: store.get('ta.tex', true), weapon: store.get('ta.weapon', 'sledgehammer'), pick: store.get('ta.pick', null), speed: null, god: true, respawn: true, open: true };
  let current = null; // { e (entry or game key), A }
  const feel = store.get('ta.feel', {}); // id -> { feel, note, at }
  const label = (e) => e ? `${LABEL[e.weapon]} · ${e.label}` : '';
  async function equip(id, speed = null) {
    const sim = game.sim, p = sim.player;
    S.pick = id; store.set('ta.pick', id);
    if (id.startsWith('game|')) {
      const key = id.split('|')[1], [w, name] = GAME[key];
      p.setLoadout([w]); p.equipped = p.desired = w; current = { id, name: `${LABEL[key]} · ${name.replace('Game: ', 'the game’s ')}` };
    } else {
      const e = entries.find((x) => x.id === id); if (!e) return;
      S.speed = speed ?? e.speed;
      const As = await buildAttack(e, S.speed);
      TEST_ATTACKS.length = 0; TEST_ATTACKS.push(...As); resetGroundAttacks();
      game.sim.player.setLoadout([TEST]); current = { id, e, As, name: label(e) + (S.speed !== 1 ? ` · ${S.speed}x` : '') };
    }
    game.sim.director.arenaLabel = current.name;
    render();
  }
  function freeSpot(near, minD, maxD) {
    const sim = game.sim, p = sim.player;
    for (let k = 0; k < 40; k++) {
      const a = sim.rand() * Math.PI * 2, d = minD + sim.rand() * (maxD - minD), x = near.x + Math.sin(a) * d, z = near.z + Math.cos(a) * d;
      const t = { x, z };
      if (sim.world.resolveCircle(t, 0.4) || Math.hypot(t.x - x, t.z - z) > 1e-3) continue;
      if (!sim.world.lineOfSight(p.x, p.z, x, z, 0.5)) continue;
      if (sim.zombies.some((q) => q.alive && Math.hypot(q.x - x, q.z - z) < 0.9)) continue;
      return { x, z };
    }
    return null;
  }
  const dummySpots = [];
  function dummies() {
    const sim = game.sim, p = sim.player, fy = p.aimYaw, fx = Math.sin(fy), fz = Math.cos(fy), lx = Math.cos(fy), lz = -Math.sin(fy);
    dummySpots.length = 0;
    for (const o of [-1.1, 0, 1.1]) {
      const x = p.x + fx * 1.35 + lx * o, z = p.z + fz * 1.35 + lz * o;
      dummySpots.push({ x, z, yaw: fy + Math.PI });
      sim.spawnZombie('NE', { x, z, yaw: fy + Math.PI, passive: true, speedMul: 0 });
    }
  }
  function live(n, kind) {
    const sim = game.sim, far = kind === 'sprinter'; // (the sprinter needs room to see Yola and charge)
    for (let i = 0; i < n; i++) { const s = far ? freeSpot(sim.player, 6, 8) || freeSpot(sim.player, 4, 6) : freeSpot(sim.player, 3.5, 5.5); if (s) { const z = sim.spawnZombie('NE', { x: s.x, z: s.z, yaw: Math.atan2(sim.player.x - s.x, sim.player.z - s.z), kind }); z.attackCd = 0.8 + i * 0.2; } }
  }
  function clear() { for (const z of game.sim.zombies) if (z.alive) { z.hp = 0; z.set('dead'); z.corpseT = 99; z.solid = false; } dummySpots.length = 0; }
  // every step: Yola can't die (when chosen), dummies come back
  let respawnT = 0;
  game.arenaTick = (dt) => {
    const sim = game.sim, p = sim.player;
    if (S.god && p.hp < 40 && !p.dead) p.hp = p.maxHp;
    if (S.respawn && dummySpots.length && (respawnT -= dt) <= 0) {
      respawnT = 0.5;
      for (const d of dummySpots) if (!sim.zombies.some((q) => q.alive && q.passive && Math.hypot(q.x - d.x, q.z - d.z) < 0.6)) { sim.spawnZombie('NE', { x: d.x, z: d.z, yaw: d.yaw, passive: true, speedMul: 0 }); break; }
    }
  };
  game.onRestart = () => { dummySpots.length = 0; if (S.pick) equip(S.pick, S.speed); dummies(); };

  // ---- the panel ----
  const css = document.createElement('style');
  css.textContent = `
  #ta { position: fixed; z-index: 5; left: calc(10px + var(--sal, 0px)); top: calc(60px + var(--sat, 0px)); font: 13px/1.3 system-ui, sans-serif; color: #eef4f4; pointer-events: none; }
  #ta * { box-sizing: border-box; } #ta button, #ta input, #ta label, #taPanel { pointer-events: auto; }
  #taToggle { background: rgba(20,30,36,.86); color: #fff; border: 1px solid #ffffff2a; border-radius: 10px; padding: 7px 11px; font-weight: 650; }
  #taPanel { margin-top: 6px; width: min(360px, calc(100vw - 20px)); max-height: 72vh; overflow: auto; background: rgba(20,30,36,.92); border: 1px solid #ffffff22; border-radius: 12px; padding: 10px; display: none; }
  #ta.open #taPanel { display: block; }
  #ta h4 { margin: 10px 0 5px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #9fbcc0; }
  #ta .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  #ta .chips button { background: #2b3d45; color: #dfeaea; border: 0; border-radius: 8px; padding: 6px 9px; font-size: 12.5px; }
  #ta .chips button.on { background: #2f8f92; color: #fff; }
  #ta .chips button small { opacity: .7; margin-left: 3px; }
  #ta .att { display: block; width: 100%; text-align: left; background: #24343b; color: #eef4f4; border: 0; border-radius: 9px; padding: 7px 9px; margin: 4px 0; }
  #ta .att.on { outline: 2px solid #3fc1c4; background: #2a454c; }
  #ta .att i { color: #b9cfd2; font-size: 11.5px; } #ta .att .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  #ta .dot.good { background: #4cc77a; } #ta .dot.maybe { background: #e2b33c; } #ta .dot.game { background: #6aa8ff; }
  #ta .feelTag { float: right; font-size: 11px; padding: 1px 6px; border-radius: 6px; background: #3a4b52; }
  #ta .feelTag.great { background: #2f7d4c; } #ta .feelTag.ok { background: #6d6227; } #ta .feelTag.bad { background: #7d2f2f; }
  #ta label.opt { display: flex; gap: 7px; align-items: center; margin: 5px 0; }
  #ta input[type=text] { width: 100%; margin-top: 6px; background: #1a262c; color: #fff; border: 1px solid #ffffff22; border-radius: 8px; padding: 6px 8px; }
  #ta .muted { color: #9fb2b5; font-size: 11.5px; }`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'ta'; root.className = S.open ? 'open' : '';
  root.innerHTML = '<button id="taToggle">⚔ Attacks</button><div id="taPanel"></div>';
  document.body.appendChild(root);
  root.addEventListener('keydown', (ev) => ev.stopPropagation()); // typing a note does not walk Yola
  root.querySelector('#taToggle').onclick = () => { S.open = !S.open; root.classList.toggle('open', S.open); };
  const panel = root.querySelector('#taPanel');
  const count = (k) => entries.filter((e) => e.weapon === k).length + (GAME[k] ? 1 : 0);
  function render() {
    const list = [...(GAME[S.weapon] ? [{ id: 'game|' + S.weapon, game: true, label: GAME[S.weapon][1] }] : []), ...entries.filter((e) => e.weapon === S.weapon)];
    const cur = current?.e, f = current && feel[current.id];
    panel.innerHTML = `
      <div class="chips">${ORDER.map((k) => `<button data-w="${k}" class="${k === S.weapon ? 'on' : ''}">${LABEL[k]}<small>${count(k)}</small></button>`).join('')}</div>
      <h4>Attacks for the ${LABEL[S.weapon].toLowerCase()}</h4>
      ${list.length ? list.map((e) => `<button class="att ${S.pick === e.id ? 'on' : ''}" data-id="${esc(e.id)}"><span class="dot ${e.game ? 'game' : e.verdict}"></span>${esc(e.label)}${feel[e.id] ? `<span class="feelTag ${feel[e.id].feel}">${feel[e.id].feel}</span>` : ''}${e.game ? '' : `<br><i>${e.verdict === 'good' ? 'Good' : 'Maybe'} · ${e.speed}x${e.why ? ' · ' + esc(e.why) : ''}</i>`}</button>`).join('') : '<div class="muted">No attack picked for this weapon yet (Move Library).</div>'}
      ${cur ? `<h4>Speed</h4><div class="chips">${SPEEDS.map((v) => `<button data-sp="${v}" class="${v === S.speed ? 'on' : ''}">${v}x</button>`).join('')}</div>
        <div class="muted">${current.As.length > 1 ? `${current.As.length}-hit combo: tap once for 1 hit, keep tapping (or hold) for more` : '1 strike'} · ${current.As.reduce((t, a) => t + attackEnd(a), 0).toFixed(2)} s in all</div>` : ''}
      ${current ? `<h4>How does it feel?</h4><div class="chips">${['great', 'ok', 'bad'].map((v) => `<button data-feel="${v}" class="${f?.feel === v ? 'on' : ''}">${v === 'great' ? 'Feels great' : v === 'ok' ? 'OK' : 'Not for the game'}</button>`).join('')}</div>
        <input type="text" id="taNote" placeholder="Note (optional)" value="${esc(f?.note || '')}">` : ''}
      <h4>Zombies</h4>
      <div class="chips"><button data-z="d">3 dummies</button><button data-z="1">1 zombie</button><button data-z="3">3 zombies</button><button data-z="6">6 zombies</button><button data-z="s">Sprinter</button><button data-z="g">Big guard</button><button data-z="c">Clear</button></div>
      <label class="opt"><input type="checkbox" id="taTex" ${S.textures ? 'checked' : ''}> Floor 3 outbreak textures (worn floor, walls, blood)</label>
      <label class="opt"><input type="checkbox" id="taGod" ${S.god ? 'checked' : ''}> Yola can't die</label>
      <label class="opt"><input type="checkbox" id="taResp" ${S.respawn ? 'checked' : ''}> Dummies come back</label>
      <label class="opt"><input type="checkbox" id="taWedge" ${telegraphs.enabled ? 'checked' : ''}> Zombie attack wedges on the floor</label>
      <div class="muted">Attack: hold the right thumb (or the mouse). Picks come from the Move Library (good and maybe, with a weapon).</div>`;
    panel.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { S.weapon = b.dataset.w; store.set('ta.weapon', S.weapon); render(); }));
    panel.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => equip(b.dataset.id)));
    panel.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = () => equip(S.pick, +b.dataset.sp)));
    panel.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => { const v = b.dataset.z; if (v === 'd') dummies(); else if (v === 'c') clear(); else if (v === 's') live(1, 'sprinter'); else if (v === 'g') live(1, 'guard'); else live(+v); }));
    panel.querySelectorAll('[data-feel]').forEach((b) => (b.onclick = () => { feel[current.id] = { ...(feel[current.id] || {}), feel: b.dataset.feel, at: new Date().toISOString(), name: current.name }; saveFeel(); render(); }));
    const note = panel.querySelector('#taNote'); if (note) note.onchange = () => { feel[current.id] = { ...(feel[current.id] || {}), note: note.value, at: new Date().toISOString(), name: current.name }; saveFeel(); };
    panel.querySelector('#taTex').onchange = (ev) => { S.textures = ev.target.checked; store.set('ta.tex', S.textures); game.arena.setOutbreak(S.textures); };
    panel.querySelector('#taGod').onchange = (ev) => { S.god = ev.target.checked; };
    panel.querySelector('#taResp').onchange = (ev) => { S.respawn = ev.target.checked; };
    panel.querySelector('#taWedge').onchange = (ev) => { telegraphs.enabled = ev.target.checked; };
  }
  function saveFeel() {
    store.set('ta.feel', feel);
    fetch('/__shot/arena_feel.json', { method: 'POST', body: JSON.stringify({ updated: new Date().toISOString(), feel }, null, 1) }).catch(() => {});
  }

  // start: the last pick (or the first sledgehammer one), three dummies in front of her
  const first = S.pick && (S.pick.startsWith('game|') || entries.some((e) => e.id === S.pick)) ? S.pick : (entries.find((e) => e.weapon === S.weapon)?.id || (GAME[S.weapon] ? 'game|' + S.weapon : entries[0]?.id));
  game.arena.setOutbreak(S.textures); // the hospital kit's worn surfaces (as Floor 3 after the reveal), switchable in the panel
  if (first) await equip(first);
  dummies();
  render();
  return { entries, equip, buildAttack, dummies, live, clear, S, get current() { return current; } };
}
