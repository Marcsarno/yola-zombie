// Inspect mode (combat.html?inspect=1&yola=2, the user's request 2026-10-16: "I need to see it for myself"): the real
// game's Yola and weapon holds, standing still, with a free camera. Drag to orbit, wheel to zoom, right-drag to pan;
// 1-5 = pistol, shotgun, axe, bat, fists; H = look at her hands, B = whole body. Nothing in the game changes.
// Buttons: a move played on the spot (walk, run, back, strafes, attack), speed / pause / one-frame steps, cameras, and
// with the bat the run options (render/clipchars.js batRun).
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makePistol } from './render/weaponModels.js';

const WEAPONS = ['pistol', 'shotgun', 'axe', 'bat', 'fists'];
// pistol models to compare (the user, 2026-10-16: "I hate the one she has"; picked the Hospital Weapons Core pistol, now the
// game's). Each is shown in the game's pistol frame: barrel +Z, top +Y, origin where the hand wraps the grip.
const PISTOLS = [
  { key: 'current', label: 'in game: Hospital Weapons Core' },
  { key: 'old', label: 'old built-in', build: makePistol },
  { key: 'original', label: 'original project pistol', file: 'assets/pistol.glb' }, // already barrel +Z, grip at the origin
];

export function startInspect(game) {
  const yolaN = new URLSearchParams(location.search).get('yola') === '2' ? 2 : 1;
  game.restart('calm');
  const park = () => { for (const z of game.sim.zombies) { z.x = 60; z.z = 60; z.solid = false; } };
  park();
  game.hudShow(false);
  const cam = game.camera, p = game.sim.player, Y = game.yola, V = game.THREE.Vector3;
  // moves on the spot (2026-10-16, the user: "you'll have to show me"): she plays the game's real blend for each move
  // (walk / run / back / strafes / attack) while held in place, facing +Z; speed, pause and single steps drive the game
  const MOVES = { stand: [0, 0, 0], walk: [0, 1, 0.4], run: [0, 1, 1], back: [0, -1, 1], 'strafe L': [1, 0, 1], 'strafe R': [-1, 0, 1], attack: [0, 0, 0] };
  let move = 'stand', speed = 1, paused = false;
  const x0 = p.x, z0 = p.z;
  game.scriptInput = () => {
    park(); p.x = p.px = x0; p.z = p.pz = z0; const [mx, mz, m] = MOVES[move];
    return { moveX: mx * m, moveZ: mz * m, aimX: 0, aimZ: move === 'attack' ? 1 : 0.3, swapPresses: 0, usePresses: 0 }; // (aim 0.3: facing without attacking)
  };
  game.camFree = true;
  cam.near = 0.02; cam.updateProjectionMatrix();
  const controls = new OrbitControls(cam, game.renderer.domElement);
  controls.enableDamping = true;
  const body = () => { controls.target.set(p.x, 1.0, p.z); cam.position.set(p.x + Math.sin(p.aimYaw + 0.9) * 2.4, 1.5, p.z + Math.cos(p.aimYaw + 0.9) * 2.4); };
  const hands = () => {
    const c = Y.grip('Right', new V()).lerp(Y.grip('Left', new V()), 0.5);
    controls.target.copy(c);
    cam.position.set(c.x + Math.sin(p.aimYaw + 0.9) * 0.6, c.y + 0.2, c.z + Math.cos(p.aimYaw + 0.9) * 0.6);
  };
  const BATRUNS = [['now', 'now'], ['rebase', 'rebase'], ['plain', 'plain'], ['plainlegs', 'plainlegs']]; // (see render/clipchars.js batRun)
  let camMode = 'body';
  const btn = (k, v, text, on) => `<button data-${k}="${v}" style="margin:1px;padding:1px 5px;font:11px system-ui;border:1px solid #666;border-radius:4px;color:#fff;background:${on ? '#2a7fd4' : '#333'}">${text}</button>`;
  const setCam = (c) => {
    camMode = c;
    if (c === 'side') { controls.target.set(x0, 0.95, z0); cam.position.set(x0 - 2.2, 1.05, z0); } // (her right: she faces +Z, +X is her left; 2.2 m clears the stretcher)
    if (c === 'left side') { controls.target.set(x0, 0.95, z0); cam.position.set(x0 + 3.0, 1.05, z0); }
    if (c === 'front') { controls.target.set(x0, 0.95, z0); cam.position.set(x0, 1.1, z0 + 3.0); }
    if (c === 'body') body();
    if (c === 'hands') hands();
    label();
  };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:6px;top:6px;z-index:50;background:rgba(0,0,0,.6);color:#fff;font:11px system-ui;padding:4px 6px;border-radius:7px;line-height:1.35;max-width:min(560px,92vw)';
  document.body.appendChild(box);
  let cur = 'pistol', pist = 'current';
  // the pistol options: the built-in model's own meshes, plus each GLB wrapped into the same frame, all under Yola's pistol
  const P = Y.pistol, own = [...P.children], alts = {};
  const loader = new GLTFLoader();
  for (const o of PISTOLS) if (o.build) { const w = o.build(1); w.visible = false; P.add(w); alts[o.key] = w; }
  for (const o of PISTOLS) if (o.file) loader.load(o.file, (g) => {
    const w = new game.THREE.Group(); g.scene.rotation.y = o.rotY || 0; w.add(g.scene); w.visible = false;
    g.scene.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    P.add(w); alts[o.key] = w; setPistol(pist);
  });
  const setPistol = (k) => {
    pist = k;
    for (const c of own) c.visible = k === 'current';
    for (const [key, w] of Object.entries(alts)) w.visible = key === k;
    label();
  };
  let folded = false;
  const label = () => {
    if (folded) { box.innerHTML = btn('k', 'unfold', '▸ inspect panel (U)', false); box.querySelector('[data-k=unfold]').onclick = () => { folded = false; label(); }; return; }
    box.innerHTML = `<b>Yola ${yolaN === 2 ? '3.0' : '2.0'}</b> · ${cur} ` + btn('k', 'fold', '▾ hide (U)', false) +
      ` <a style="color:#8cf" href="?mode=calm&inspect=1&yola=${yolaN === 2 ? 1 : 2}">Yola ${yolaN === 2 ? '2.0' : '3.0'}</a><br>` +
      WEAPONS.map((w, i) => btn('w', w, `${i + 1} ${w}`, w === cur)).join('') +
      '<br>move: ' + Object.keys(MOVES).map((m) => btn('m', m, m, m === move)).join('') +
      '<br>speed: ' + [1, 0.5, 0.25].map((s) => btn('s', s, s + 'x', s === speed && !paused)).join('') + btn('s', 'pause', 'pause', paused) + btn('s', 'step', 'step', false) +
      '<br>camera: ' + ['side', 'left side', 'front', 'body', 'hands', 'game'].map((c) => btn('c', c, c === 'game' ? 'game' : c, c === camMode)).join('') +
      (cur === 'bat' ? '<br>bat run: ' + BATRUNS.map(([k, l]) => btn('r', k, l, Y.batRun === k)).join('') +
        (Y.batRun === 'plain' ? ` bat arm hold <input id="batArm" type="range" min="0" max="90" step="5" value="${Math.round(Y.batArmHold * 100)}" style="width:90px;vertical-align:middle"> <span id="batArmV">${Math.round(Y.batArmHold * 100)}%</span>` +
          ` wrist hold <input id="batWrist" type="range" min="0" max="95" step="5" value="${Math.round(Y.batWristHold * 100)}" style="width:90px;vertical-align:middle"> <span id="batWristV">${Math.round(Y.batWristHold * 100)}%</span>` : '') : '') +
      (cur === 'pistol' ? '<br>pistol (P): ' + PISTOLS.map((o) => btn('p', o.key, o.label + (o.file && !alts[o.key] ? ' (loading)' : ''), o.key === pist)).join('') : '');
    box.querySelector('[data-k=fold]').onclick = () => { folded = true; label(); };
    for (const b of box.querySelectorAll('button[data-m]')) b.onclick = () => { move = b.dataset.m; label(); };
    for (const b of box.querySelectorAll('button[data-s]')) b.onclick = () => { const v = b.dataset.s; if (v === 'pause') paused = !paused; else if (v === 'step') { paused = true; game.tick(1, 1 / 60, true); } else { speed = +v; paused = false; } label(); };
    for (const b of box.querySelectorAll('button[data-c]')) b.onclick = () => setCam(b.dataset.c);
    for (const b of box.querySelectorAll('button[data-r]')) b.onclick = () => { Y.batRun = b.dataset.r; label(); };
    const arm = box.querySelector('#batArm'); if (arm) arm.oninput = () => { Y.batArmHold = arm.value / 100; box.querySelector('#batArmV').textContent = arm.value + '%'; }; // (0 = the run's own swing)
    const wr = box.querySelector('#batWrist'); if (wr) wr.oninput = () => { Y.batWristHold = wr.value / 100; box.querySelector('#batWristV').textContent = wr.value + '%'; };
    for (const b of box.querySelectorAll('button[data-p]')) b.onclick = () => { if (cur !== 'pistol') equip('pistol'); setPistol(b.dataset.p); };
    for (const b of box.querySelectorAll('button[data-w]')) b.onclick = () => equip(b.dataset.w);
  };
  const equip = (w) => { cur = w; p.setLoadout(WEAPONS, w); label(); if (camMode === 'hands') setTimeout(hands, 900); };
  addEventListener('keydown', (e) => {
    const i = '12345'.indexOf(e.key); if (i >= 0) equip(WEAPONS[i]);
    if (e.key === 'h' || e.key === 'H') hands();
    if (e.key === 'b' || e.key === 'B') body();
    if (e.key === 'u' || e.key === 'U') { folded = !folded; label(); }
    if (e.key === 'p' || e.key === 'P') { if (cur !== 'pistol') equip('pistol'); setPistol(PISTOLS[(PISTOLS.findIndex((o) => o.key === pist) + 1) % PISTOLS.length].key); }
  });
  // (start options in the URL: &w=bat&move=run&cam=side&batrun=plain)
  const q = new URLSearchParams(location.search);
  if (MOVES[q.get('move')]) move = q.get('move');
  equip(WEAPONS.includes(q.get('w')) ? q.get('w') : 'pistol');
  setTimeout(() => setCam(q.get('cam') || 'body'), 600); // (after the first frames have placed her)
  // the game is stepped from here (slow motion, pause, single frames); 'game camera' hands the view back to the game's
  // Fixed 1/60 s steps: she is held in place by putting her back on her spot every step, so each step must move her the
  // same distance; a step that followed the screen's uneven frame times made her jump forward and back by up to 9.5 cm
  // (the user, 2026-10-16: "a jitter of the entire body ... from the side")
  let last = performance.now(), acc = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    controls.enabled = camMode !== 'game'; game.camFree = camMode !== 'game';
    if (camMode !== 'game') controls.update();
    if (!paused) { acc += dt * speed; let n = 0; while (acc >= 1 / 60 && n < 4) { game.tick(1, 1 / 60, false); acc -= 1 / 60; n++; } if (n === 4) acc = 0; }
    game.looks.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return { controls, equip, hands, body, setPistol, pistols: PISTOLS.map((o) => o.key), setMove: (m) => { move = m; label(); }, setCam, setSpeed: (s) => { speed = s; paused = false; label(); } };
}
