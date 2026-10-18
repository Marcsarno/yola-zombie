import { ATMOS } from './render/atmos.js';
import { LIGHTKIT } from './render/lightkit.js';
import { MOODS } from './render/looks.js';
// Repeatable examples (2026-10-18, the user: "show short, repeatable examples of the first shield slam, second-slam break,
// post-break dismemberment, charger dodge, get-ups, and walker lunges ... check them in the actual Three.js game").
// combat.html?mode=calm&demo=<name>: the practice room with only that scene in it, set up the same way every time; the
// ↺ button (or R) sets it up again. You play it yourself; &auto=1 lets Yola dodge on her own at the moment and fight
// back, to watch it. Names: slam1, slam2, dismember, charger, kipup, ladykip, walkers, runner, floor, low.
const DEMOS = {
  slam1: { label: 'Guard: the slam (dodge it: the shield sticks for good)', weapon: 'bat', setup(sim) { const z = guard(sim, -0.4); z.slamCd = 0; } },
  tear: { label: 'Guard: stuck shield, his arm tears off, the flail, then his arm as a club', weapon: 'pistol', setup(sim) { const z = put(sim, -1.2, -0.4, 'guard', Math.PI / 2); z.attackCd = 0; z.slamShield(sim); } },
  charger: { label: 'The big lady charges (dodge left/right)', weapon: 'pistol', setup(sim) { const z = put(sim, 0.4, -5.6, 'sprinter'); z.attackCd = 0; } },
  kipup: { label: 'Yola knocked flat: the kip-up', weapon: 'bat', setup(sim) { const z = guard(sim, -0.2); z.slamCd = 0; sim.demoNoDodge = true; } },
  ladykip: { label: 'The lady trips into the wall: her kip-up', weapon: 'pistol', setup(sim) { const p = sim.player; p.z = 10.05; const z = put(sim, 0.4, 2.6, 'sprinter'); z.attackCd = 0; } },
  walkers: { label: 'Walkers: the ring, its pounces, the scratch', weapon: 'bat', setup(sim) { for (let i = 0; i < 6; i++) { const a = Math.PI + (i / 5 - 0.5) * 2.4; put(sim, 0.4 + Math.sin(a) * 6, 1.0 + Math.cos(a) * 6, 'normal', a + Math.PI); } sim.player.z = 1.0; } },
  runner: { label: 'The orange runner: the dash rake', weapon: 'bat', setup(sim) { put(sim, 0.4, -5.5, 'runner'); } },
  floor: { label: 'Out of the floor: the breach', weapon: 'pistol', setup(sim) { sim.spawnFromFloor(-0.8, -1.6, { look: 'patient' }); sim.spawnFromFloor(2.2, -0.6, { kind: 'runner' }); } },
  // (2026-10-18, the user: "show me 4 different clothing variations ... nurse scrub color ... keep the orange look") a
  // lineup, left to right: her own blue, the runner's orange, then the new colours (main.js SCRUBS)
  nurses: { label: 'Nurse scrubs: blue · navy · charcoal (and the runner\'s orange)', weapon: 'bat', setup(sim, game) {
    const keys = [null, 'navy', 'charcoal', 'orange'];
    const zs = keys.map((k, i) => { const z = sim.spawnZombie('placed', { x: -1.65 + i * 1.1, z: -0.4, yaw: 0, passive: true, speedMul: 0 }); z.look = 'nurse'; z.scrubs = k; return z; });
    sim.player.z = 3.6;
    const paint = () => { let ok = true; for (const z of zs) { const v = game.zviews.get(z.id); if (v) game.scrubs(v, z.scrubs); else ok = false; } if (!ok) setTimeout(paint, 100); };
    setTimeout(paint, 100);
  } },
  // (2026-10-18, the user: the IV pole walker, the legless one in a wheelchair, a surgeon, an old patient in every bed)
  hospital: { label: 'The hospital\'s own: drip stand, wheelchair, surgeon, a patient in bed (walk up to the bed)', weapon: 'bat', setup(sim, game) {
    put(sim, -2.6, -4.2, 'normal', 0, 'iv'); put(sim, 0.4, -5.0, 'normal', 0, 'chair'); put(sim, 3.0, -4.4, 'normal', 0, 'surgeon');
    const B = { x: 4.4, z: -1.8, yaw: 0, side: 1 }, b = sim.spawnZombie('placed', { x: B.x, z: B.z, yaw: 0, passive: true, speedMul: 0, prop: 'bed', bed: B });
    b.set('chase'); b.dormant = { wake: Infinity, sense: 3.2, speedMul: 0.9 };
    const S = game.propSrc?.bedOpen; if (S) { const o = S.clone(); o.position.set(B.x, 0, B.z); o.rotation.y = B.yaw; game.scene.add(o); game.propsAdd(o); }
  } },
  // (2026-10-18) the execution: a walker that pounces; dodge it at the last moment (Dodge / Shift), then attack it while it
  // glows (render/execution.js). Change weapons with Swap to see each finisher
  execute: { label: 'Finisher: perfect-dodge the pounce, then attack the glowing walker (Swap: each weapon)', weapon: 'bat', setup(sim) {
    for (const [x, z] of [[-1.6, -4.6], [2.4, -5.2]]) { const q = put(sim, x, z, 'normal', 0); q.pouncer = true; q.pounceCd = 0.5; }
  } },
  // (2026-10-18, the user: "show me a player of the executions and the camera"): every weapon's finisher in turn, played by
  // itself (the real beat: render/execution.js); the buttons pick one to repeat, or all of them again
  finishers: { label: 'Finishers: every weapon in turn', weapon: 'bat', setup(sim, game) { showcase(sim, game); } },
  // (2026-10-18, the user: "find a room that you can apply those different lighting upgrades so i can view them and
  // understand them"): every upgrade switchable on its own, what it is and what it costs, the frame time live
  lighting: { label: 'Lighting lab: switch each upgrade on and off', weapon: 'bat', setup(sim, game) { lightingLab(sim, game); } },
  low: { label: 'Low targets: a crawler, a floored walker', weapon: 'axe', setup(sim) { const c = put(sim, 0.4, 0.6, 'normal'); c.crawling = true; c.broken = 'LowerLeg_L'; const k = put(sim, 1.6, 0.4, 'normal'); k.knockDown(0, 1, sim); } },
};
function put(sim, x, z, kind = 'normal', yaw = 0, prop) { const q = sim.spawnZombie('placed', { x, z, yaw, kind, prop }); q.set('chase'); return q; }
function guard(sim, z) { const g = put(sim, 0.4, z, 'guard'); g.attackCd = 0; return g; }

export function startDemos(game, name, auto) {
  const D = DEMOS[name] || DEMOS.slam1;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:calc(58px + env(safe-area-inset-top));transform:translateX(-50%);z-index:30;display:flex;gap:8px;align-items:center;font:600 13px system-ui;color:#fff;background:rgba(20,26,30,.78);padding:6px 10px;border-radius:12px;max-width:92vw';
  el.innerHTML = `<span>${D.label}</span><button style="font:700 15px system-ui;border:0;border-radius:8px;padding:4px 10px">↺</button>`;
  document.body.appendChild(el);
  const setup = () => {
    game.restart('calm');
    const sim = game.sim, p = sim.player;
    sim.director.update = () => {}; sim.zombies = []; sim.T.testInfiniteHealth = true;
    p.x = 0.4; p.z = 2.2; p.aimYaw = p.aimTarget = Math.PI; p.setLoadout([D.weapon, 'pistol', 'shotgun', 'bat', 'axe', 'fists'].filter((w, i, a) => a.indexOf(w) === i), D.weapon);
    D.setup(sim, game);
    p.px = p.x; p.pz = p.z; game.yola.reset(p.x, p.z, p.aimYaw);
    if (auto) game.scriptInput = (s) => autoplay(s, game);
  };
  el.querySelector('button').onclick = setup;
  addEventListener('keydown', (e) => { if (e.code === 'KeyR') setup(); });
  setup();
}

// the lighting lab: a panel of switches (render/atmos.js ATMOS), a few blood pools to walk through, walkers by the walls
// to kill (wall splatter), a Big hit button (dust and the impact frame), the frame time
function lightingLab(sim, game) {
  const fx = game.fx, A = game.atmos;
  for (const [x, z, s] of [[0.4, 0.4, 1.3], [-1.6, -2.4, 1.0], [2.0, 3.6, 1.1]]) fx?.bloodPool(x, z, s);
  for (const [x, z, yaw] of [[-6.2, 4.2, -Math.PI / 2], [0.6, -4.4, Math.PI], [-6.1, -1.2, -Math.PI / 2]]) { const q = put(sim, x, z, 'normal', yaw); q.passive = true; q.speedMul = 0; }
  sim.player.x = 0.4; sim.player.z = 2.6;
  let el = document.getElementById('lightLab'); if (el) el.remove();
  el = document.createElement('div'); el.id = 'lightLab';
  el.style.cssText = 'position:fixed;left:max(8px,env(safe-area-inset-left));top:calc(100px + env(safe-area-inset-top));z-index:30;width:250px;max-height:calc(100vh - 120px);overflow:auto;font:12px/1.35 system-ui;color:#eef3f2;background:rgba(18,24,26,.86);border-radius:10px;padding:8px 10px';
  const row = ([k, label]) => `<label style="display:flex;gap:7px;align-items:center;padding:3px 0;cursor:pointer"><input type="checkbox" data-k="${k}" ${A?.on[k] ? 'checked' : ''}><span>${label}</span></label>`;
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:4px"><span>Lighting</span><span id="labMs" style="font:600 11.5px ui-monospace,monospace;color:#ffcf8a">…</span></div>'
    + '<label style="display:flex;gap:7px;align-items:center;padding:3px 0 6px;cursor:pointer;border-bottom:1px solid #3a4747;margin-bottom:3px"><input type="checkbox" id="labRoom"><span><b>Whole room view</b></span></label>'
    + '<div style="font-weight:700;margin:2px 0 2px;color:#ffcf8a">Plan upgrades</div>' + LIGHTKIT.map(row).join('')
    + '<label style="display:flex;gap:7px;align-items:center;padding:3px 0">G · Floor mood <select id="labMood"><option value="">off</option>' + Object.keys(MOODS).filter((k) => k !== 'none').map((k) => '<option>' + k + '</option>').join('') + '</select></label>'
    + '<label style="display:flex;gap:7px;align-items:center;padding:3px 0;cursor:pointer"><input type="checkbox" id="labFilm"><span>H · Film finish (grain, vignette, colour drains with health)</span></label>'
    + '<label style="display:flex;gap:7px;align-items:center;padding:3px 0">Eye colour <select id="labEye"><option value="ffd890">gold</option><option value="ff3a2a">red</option><option value="b8ff6a">green</option><option value="e8f4ff">white</option></select></label>'
    + '<label style="display:flex;gap:7px;align-items:center;padding:3px 0;cursor:pointer"><input type="checkbox" id="labTubes"><span>Show the tubes on the ceiling (and their halos)</span></label>'
    + '<label style="display:flex;gap:7px;align-items:center;padding:3px 0 6px;cursor:pointer;border-bottom:1px solid #3a4747"><input type="checkbox" id="labShadows" checked><span>Real shadows (off = phone low tier)</span></label>'
    + '<div style="font-weight:700;margin:4px 0 2px;color:#ffcf8a">Lab effects</div>'
    + ATMOS.filter((a) => a[0] !== 'tubes').map(row).join('')
    + '<div style="display:flex;gap:6px;margin:6px 0"><button data-a="all">All on</button><button data-a="none">All off</button><button data-a="hit">Big hit</button></div>'
    + '<div id="labWhat" style="color:#c9d6d4;border-top:1px solid #3a4747;padding-top:6px">Tick one to see it. Walk Yola through the blood, kill the walkers by the walls, try Big hit.</div>';
  for (const b of el.querySelectorAll('button')) b.style.cssText = 'font:600 11.5px system-ui;border:0;border-radius:6px;padding:4px 7px;cursor:pointer;background:#e8ecec;color:#1b2222';
  document.body.appendChild(el);
  const what = (k) => { const a = ATMOS.find((q) => q[0] === k) || LIGHTKIT.find((q) => q[0] === k); if (a) el.querySelector('#labWhat').innerHTML = `<b>${a[1]}</b><br>${a[2]}<br><span style="color:#9fb2af">Cost: ${a[3]}</span>`; };
  const K = game.lightkit, LK = new Set(LIGHTKIT.map((q) => q[0]));
  const mood = () => game.looks?.setMood(el.querySelector('#labMood').value || null, el.querySelector('#labFilm').checked);
  el.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'labRoom') { roomView(game, e.target.checked); return; }
    if (id === 'labMood' || id === 'labFilm') { mood(); return; }
    if (id === 'labEye') { game.ZombieView.eyeCfg.col = parseInt(e.target.value, 16); return; }
    if (id === 'labTubes') { K?.setTubes(e.target.checked); return; }
    if (id === 'labShadows') { game.looks?.set(e.target.checked ? 'standard' : 'lite'); return; }
    const k = e.target.dataset?.k; if (!k) return;
    if (LK.has(k)) { K?.set(k, e.target.checked); if (k === 'eyes') game.ZombieView.eyeCfg.on = e.target.checked; } else A?.set(k, e.target.checked);
    if (e.target.checked) what(k);
  });
  // the user's picks survive a reload (this browser only): every switch and list but the room view, saved on each change
  const SAVE = 'yola.lightLab.v1';
  const fields = () => [...el.querySelectorAll('input[type=checkbox], select')].filter((c) => c.id !== 'labRoom');
  const keyOf = (c) => c.dataset?.k || c.id;
  el.addEventListener('change', () => { try { const o = {}; for (const c of fields()) o[keyOf(c)] = c.type === 'checkbox' ? c.checked : c.value; localStorage.setItem(SAVE, JSON.stringify(o)); } catch {} });
  try {
    const o = JSON.parse(localStorage.getItem(SAVE) || 'null');
    if (o) for (const c of fields()) { const v = o[keyOf(c)]; if (v === undefined) continue; const cur = c.type === 'checkbox' ? c.checked : c.value; if (cur === v) continue; if (c.type === 'checkbox') c.checked = v; else c.value = v; c.dispatchEvent(new Event('change', { bubbles: true })); }
  } catch {}
  el.addEventListener('click', (e) => {
    const a = e.target.dataset?.a; if (!a) return;
    if (a === 'all' || a === 'none') for (const c of el.querySelectorAll('input[data-k]')) { c.checked = a === 'all'; c.dispatchEvent(new Event('change', { bubbles: true })); }
    if (a === 'hit') { const p = game.sim.player; A?.onBigHit(p.x, p.z); A?.onKill(p.x, p.z, Math.sin(p.aimYaw), Math.cos(p.aimYaw), 8); fx?.ring(p.x, p.z, 0xffffff, 2); }
  });
  // the frame time, averaged over the last second of real frames
  let n = 0, sum = 0, last = performance.now();
  const tick = () => { if (!document.body.contains(el)) return; const now = performance.now(); sum += now - last; last = now; if (++n >= 30) { el.querySelector('#labMs').textContent = (sum / n).toFixed(1) + ' ms'; n = 0; sum = 0; } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
// the whole practice room from above, the game camera's own angle and turn (the lighting lab); off: the game camera again
function roomView(game, on) {
  game.camFree = on; if (!on) return;
  const T = game.tuning, cy = (T.camYaw * Math.PI) / 180, p = (Math.max(48, T.camPitch) * Math.PI) / 180, D = 23, fx = -Math.sin(cy), fz = -Math.cos(cy);
  game.camera.position.set(-fx * Math.cos(p) * D, Math.sin(p) * D, 0.5 - fz * Math.cos(p) * D); game.camera.lookAt(0, 0, 0.5);
}
// the finisher player: a walker stands in front of her glowing; she presses; the beat plays; the next weapon (SHOW order)
const SHOW = ['bat', 'axe', 'crowbar', 'knife', 'sledgehammer', 'fists', 'pistol', 'shotgun'];
const SHOW_LABEL = { bat: 'Bat', axe: 'Axe', crowbar: 'Crowbar', knife: 'Knife', sledgehammer: 'Sledgehammer', fists: 'Kick', pistol: 'Pistol', shotgun: 'Shotgun' };
let showOnly = null, SH = null; // (SH: the player's state; the buttons reach the current one after a restart)
function showcase(sim, game) {
  let bar = document.getElementById('showBar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'showBar';
    bar.style.cssText = 'position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:30;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;max-width:calc(100vw - 32px);font:600 12.5px system-ui;color:#fff;background:rgba(20,26,30,.8);padding:7px 9px;border-radius:10px';
    const b = (k, t) => `<button data-w="${k}" style="font:600 12.5px system-ui;border:0;border-radius:7px;padding:5px 9px;cursor:pointer">${t}</button>`;
    bar.innerHTML = '<span id="showNow" style="min-width:96px">…</span>' + b('all', 'All') + SHOW.map((w) => b(w, SHOW_LABEL[w])).join('');
    bar.onclick = (e) => { const w = e.target.dataset?.w; if (!w) return; showOnly = w === 'all' ? null : w; if (SH) { SH.i = w === 'all' ? 0 : SHOW.indexOf(w); SH.state = 'next'; SH.t = 0; } };
    document.body.appendChild(bar);
  }
  const S = (SH = { i: 0, state: 'next', t: 0, z: null });
  const mark = () => { for (const el of bar.querySelectorAll('button')) { const on = el.dataset.w === (showOnly || 'all'); el.style.background = on ? '#ffb347' : '#e8ecec'; el.style.color = '#1b2222'; } };
  mark();
  game.scriptInput = (s, dt) => {
    const r = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, swapPresses: 0, usePresses: 0, dodgePresses: 0 };
    const sim = game.sim, p = sim.player;
    S.t += dt;
    if (S.state === 'next') { // a fresh walker 2.7 m in front of her, glowing; her weapon for this one
      mark();
      game.clearPieces?.(); sim.zombies = [];
      const w = showOnly || SHOW[S.i % SHOW.length];
      p.setLoadout([w, 'fists'], w); p.x = 0.4; p.z = 1.6; p.aimYaw = p.aimTarget = Math.PI; p.vx = p.vz = 0; p.px = p.x; p.pz = p.z;
      const z = sim.spawnZombie('placed', { x: 0.55, z: -1.1, yaw: 0, passive: true, speedMul: 0 }); z.set('chase'); z.executable = sim.time + 99;
      S.z = z; S.state = 'wait'; S.t = 0;
      const now = document.getElementById('showNow'); if (now) now.textContent = SHOW_LABEL[w];
      return r;
    }
    if (S.state === 'wait' && S.t > 0.9) { S.state = 'press'; S.t = 0; }
    if (S.state === 'press') { // hold the attack toward it for a moment
      const dx = S.z.x - p.x, dz = S.z.z - p.z, l = Math.hypot(dx, dz) || 1; r.aimX = dx / l; r.aimZ = dz / l;
      if (S.t > 0.15) { S.state = 'play'; S.t = 0; }
      return r;
    }
    if (S.state === 'play' && !S.z.alive && !game.execActive && S.t > 0.3) { S.state = 'rest'; S.t = 0; }
    if (S.state === 'play' && S.t > 6) { S.state = 'next'; S.i++; } // (never stuck)
    if (S.state === 'rest' && S.t > 1.1) { S.state = 'next'; S.i++; }
    return r;
  };
}
// &auto=1: she dodges a special attack at its moment and fights whatever is nearest (to watch a scene play out)
function autoplay(sim) {
  const p = sim.player, r = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, swapPresses: 0, usePresses: 0, dodgePresses: 0 };
  if (sim.demoNoDodge) return r; // (the kip-up scene: she stands and takes the slam)
  const th = p.threat; if (th && th.now && th.soon) { r.dodgePresses = 1; return r; }
  let best = null, bd = 9;
  for (const z of sim.zombies) { if (!z.alive || z.buried) continue; const d = Math.hypot(z.x - p.x, z.z - p.z); if (d < bd) { bd = d; best = z; } }
  if (!best || (th && !th.now)) return r;
  const dx = best.x - p.x, dz = best.z - p.z, l = Math.hypot(dx, dz) || 1;
  const shielded = best.kind === 'guard' && best.shieldBlocks(dx / l, dz / l);
  if (!shielded) { r.aimX = dx / l; r.aimZ = dz / l; }
  if (shielded) { r.moveX = -dz / l; r.moveZ = dx / l; } // (round his shield)
  return r;
}
