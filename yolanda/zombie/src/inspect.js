// Inspect mode (combat.html?inspect=1&yola=2, the user's request 2026-10-16: "I need to see it for myself"): the real
// game's Yola and weapon holds, standing still, with a free camera. Drag to orbit, wheel to zoom, right-drag to pan;
// 1-5 = pistol, shotgun, axe, bat, fists; H = look at her hands, B = whole body. Nothing in the game changes.
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
  game.scriptInput = () => { park(); return { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, swapPresses: 0 }; };
  game.camFree = true;
  const cam = game.camera, p = game.sim.player, Y = game.yola, V = game.THREE.Vector3;
  cam.near = 0.02; cam.updateProjectionMatrix();
  const controls = new OrbitControls(cam, game.renderer.domElement);
  controls.enableDamping = true;
  const body = () => { controls.target.set(p.x, 1.0, p.z); cam.position.set(p.x + Math.sin(p.aimYaw + 0.9) * 2.4, 1.5, p.z + Math.cos(p.aimYaw + 0.9) * 2.4); };
  const hands = () => {
    const c = Y.grip('Right', new V()).lerp(Y.grip('Left', new V()), 0.5);
    controls.target.copy(c);
    cam.position.set(c.x + Math.sin(p.aimYaw + 0.9) * 0.6, c.y + 0.2, c.z + Math.cos(p.aimYaw + 0.9) * 0.6);
  };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;background:rgba(0,0,0,.65);color:#fff;font:13px system-ui;padding:8px 10px;border-radius:8px;line-height:1.5';
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
  const label = () => {
    box.innerHTML = `<b>Inspect: Yola ${yolaN === 2 ? '3.0 (new)' : '2.0 (original)'}</b> — holding <b>${cur}</b><br>` +
      WEAPONS.map((w, i) => `<button data-w="${w}" style="margin:2px;padding:3px 7px;border:1px solid #777;border-radius:5px;color:#fff;background:${w === cur ? '#2a7fd4' : '#333'}">${i + 1} ${w}</button>`).join('') +
      '<br><button data-k="hands" style="margin:2px;padding:3px 7px;border:1px solid #777;border-radius:5px;color:#fff;background:#333">H hands</button> <button data-k="body" style="margin:2px;padding:3px 7px;border:1px solid #777;border-radius:5px;color:#fff;background:#333">B body</button> ' +
      `<a style="color:#8cf" href="?mode=calm&inspect=1&yola=${yolaN === 2 ? 1 : 2}">switch to Yola ${yolaN === 2 ? '2.0' : '3.0'}</a>` +
      '<br>pistol model (P): ' + PISTOLS.map((o) => `<button data-p="${o.key}" style="margin:2px;padding:3px 7px;border:1px solid #777;border-radius:5px;color:#fff;background:${o.key === pist ? '#2a7fd4' : '#333'}">${o.label}${o.file && !alts[o.key] ? ' (loading)' : ''}</button>`).join('') +
      '<br><span style="opacity:.8">drag: orbit · wheel: zoom · right-drag: pan</span>';
    for (const b of box.querySelectorAll('button[data-p]')) b.onclick = () => { if (cur !== 'pistol') equip('pistol'); setPistol(b.dataset.p); };
    for (const b of box.querySelectorAll('button[data-w]')) b.onclick = () => equip(b.dataset.w);
    box.querySelector('[data-k=hands]').onclick = hands; box.querySelector('[data-k=body]').onclick = body;
  };
  const equip = (w) => { cur = w; p.setLoadout(WEAPONS, w); label(); setTimeout(hands, 900); };
  addEventListener('keydown', (e) => {
    const i = '12345'.indexOf(e.key); if (i >= 0) equip(WEAPONS[i]);
    if (e.key === 'h' || e.key === 'H') hands();
    if (e.key === 'b' || e.key === 'B') body();
    if (e.key === 'p' || e.key === 'P') { if (cur !== 'pistol') equip('pistol'); setPistol(PISTOLS[(PISTOLS.findIndex((o) => o.key === pist) + 1) % PISTOLS.length].key); }
  });
  equip('pistol'); setTimeout(body, 600); // (after the first frames have placed her)
  const loop = () => { controls.update(); requestAnimationFrame(loop); };
  loop();
  return { controls, equip, hands, body, setPistol, pistols: PISTOLS.map((o) => o.key) };
}
