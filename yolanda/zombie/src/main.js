// Combat benchmark entry point: loads the hospital wing, Yola and the zombie, runs the fixed-step sim.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sim, STEP } from './core/sim.js';
import { makeTuning } from './core/tuning.js';
import { setBatPath, BAT_SWING, batSegment } from './core/weapons.js';
import { LAYOUT } from './core/layout.js';
import { Arena } from './render/arena.js';
import { YolaView, ZombieView } from './render/clipchars.js';
import { FX } from './render/fx.js';
import { CombatAudio } from './audio.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { angleDiff } from './core/world.js';
import { batWorldSegment } from './core/player.js';

const params = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('zc.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('zc.' + k, JSON.stringify(v)); } catch {} },
};

// ---------- quality ----------
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
let quality = params.get('q') || store.get('quality', 'auto');
const resolvedQuality = () => (quality === 'auto' ? (isMobile ? 'medium' : 'high') : quality);
const DPR_CAP = { low: 1, medium: 1.5, high: 2 };

// ---------- renderer / scene ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: resolvedQuality() !== 'low', powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = resolvedQuality() !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // the environment is static: render its shadows once
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x27323a);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 80);
let renderScale = 1;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP[resolvedQuality()]) * renderScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- systems ----------
const tuning = makeTuning(store.get('tuning', null));
const audio = new CombatAudio();
audio.setVolume(store.get('volume', 0.8)); audio.setMuted(store.get('muted', false));
const fx = new FX(scene);
fx.gore = store.get('gore', true);
let shakeOn = true;
const hud = new Hud({ tuning, audio, store, onAction: (a, v) => uiAction(a, v) });
const input = new Input(document.getElementById('touch'), {
  swapButton: document.getElementById('swapBtn'),
  getPlayerScreen: () => playerScreen,
});
const unlockAudio = () => audio.init();
addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });

let arena, yola, sim;
const zviews = new Map(); const zpool = [[], []];
let mode = params.get('mode') || 'encounter', benchN = +(params.get('n') || 10);
let paused = false, hitPauseT = 0, acc = 0, last = performance.now(), playerScreen = null;
const camState = { x: 0, z: 0, vx: 0, vz: 0, trauma: 0, look: new THREE.Vector2() };
const perf = { frames: [], spikes: 0, t0: performance.now() };

// ---------- loading ----------
// Characters: Tripo meshes (mixamorig skeleton) with Mixamo/Tripo clips, exported by blender/export_chars.py.
// Clip travel speeds (model units/s) measured in Blender from each clip's root motion.
const CLIP_SPEEDS = {
  pistol_walk: { speed: 1.193 }, pistol_run: { speed: 1.41 }, pistol_walk_back: { speed: 0.656 }, pistol_run_back: { speed: 1.542 },
  pistol_strafe_left: { speed: 1.006 }, pistol_strafe_right: { speed: 1.129 },
};
const ZOMBIE_TYPES = [
  { file: 'assets/zombie-scrubs.glb', height: 1.78, walk: { speed: 0.168 } },
  { file: 'assets/zombie-patient.glb', height: 1.68, walk: { speed: 0.174 } },
];
const YOLA_HEIGHT = 1.62;
const loader = new GLTFLoader();
async function load() {
  hud.loading(0);
  arena = new Arena(scene, resolvedQuality(), renderer);
  const yolaP = loader.loadAsync('assets/yola.glb');
  const zomP = Promise.all(ZOMBIE_TYPES.map((t) => loader.loadAsync(t.file)));
  const dataP = fetch('assets/clipdata.json').then((r) => r.json());
  await arena.loadProps(loader, (k) => hud.loading(k * 0.7));
  const [yg, zgs, clipdata] = await Promise.all([yolaP, zomP, dataP]);
  hud.loading(0.95);
  setBatPath(clipdata.bat_swing, YOLA_HEIGHT / clipdata.heights.YOLA, clipdata.hips_rest);
  yola = new YolaView(scene, yg, CLIP_SPEEDS, clipdata);
  ZOMBIE_TYPES.forEach((t, i) => (t.gltf = zgs[i]));
  renderer.shadowMap.needsUpdate = true;
  restart();
  hud.loading(1);
  requestAnimationFrame(frame);
}
function newZombieView(type) {
  const t = ZOMBIE_TYPES[type];
  const v = new ZombieView(scene, t.gltf, t.height, t.walk);
  v.type = type;
  return v;
}

// ---------- lifecycle ----------
function restart(newMode = mode, n = benchN) {
  mode = newMode; benchN = n;
  sim = new Sim({ tuning, seed: +(params.get('seed') || 1234), mode, benchCount: n });
  window.game.sim = sim;
  for (const v of zviews.values()) { v.hide(); zpool[v.type].push(v); }
  zviews.clear();
  const p = sim.player;
  p.px = p.x; p.pz = p.z; p.pyaw = p.aimYaw;
  yola.reset(p.x, p.z, p.aimYaw);
  fx.trailClear();
  camState.x = p.x; camState.z = p.z - 1.2; camState.vx = camState.vz = 0;
  hitPauseT = 0; acc = 0;
  perf.frames.length = 0; perf.spikes = 0; perf.t0 = performance.now();
  hud.onRestart(sim);
  setPaused(false);
}

function setPaused(v) {
  paused = v;
  input.clearAll();
  input.enabled = !v && !sim.player.dead;
  if (v) sim.player.cancelAttacks();
  hud.setPaused(v);
}

function uiAction(a, v) {
  switch (a) {
    case 'pause': if (!sim.player.dead) setPaused(true); break;
    case 'resume': setPaused(false); break;
    case 'restart': restart(mode); break;
    case 'mode': restart(v); break;
    case 'bench': restart('bench', v); break;
    case 'quality': quality = v; store.set('quality', v); location.reload(); break;
    case 'gore': fx.gore = v; store.set('gore', v); break;
    case 'shake': shakeOn = v; break;
    case 'debug': debugOn = v; debugGroup.visible = v; break;
  }
}
addEventListener('blur', () => { if (sim && !paused && !sim.player.dead) setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && sim && !paused && !sim.player.dead) setPaused(true); });

// ---------- debug overlay (off by default) ----------
let debugOn = params.get('debug') === '1';
const debugGroup = new THREE.Group(); debugGroup.visible = debugOn; scene.add(debugGroup);
function buildDebug() {
  debugGroup.clear();
  const mat = new THREE.LineBasicMaterial({ color: 0xff3366 });
  for (const b of sim.world.boxes) {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(b.maxX - b.minX, Math.max(0.05, b.h), b.maxZ - b.minZ));
    const l = new THREE.LineSegments(g, mat); l.position.set((b.minX + b.maxX) / 2, b.h / 2, (b.minZ + b.maxZ) / 2); debugGroup.add(l);
  }
  debugGroup.userData.circles = [];
}
const dbgCircle = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.33, 24), new THREE.MeshBasicMaterial({ color: 0x00ffaa, side: THREE.DoubleSide }));
dbgCircle.rotation.x = -Math.PI / 2;
const dbgBat = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffff00 }));

// ---------- per-frame ----------
const _v = new THREE.Vector3(), _seg = {};
let groanT = 2;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (manualTicks) return;
  runFrame(dt);
}
let manualTicks = false;
// Test hook: advance n frames of dt seconds (works while the tab is hidden). Renders the last frame.
function tick(n = 1, dt = 1 / 60, render = true) {
  manualTicks = true;
  for (let i = 0; i < n; i++) runFrame(dt, render && i === n - 1);
}
function runFrame(dt, doRender = true) {
  perfSample(dt);
  const p = sim.player;
  let simDt = dt;
  if (paused) simDt = 0;
  if (hitPauseT > 0) { const h = Math.min(hitPauseT, simDt); hitPauseT -= h; simDt -= h; }
  // fixed-step simulation (input sampled once per frame; a swap press is delivered exactly once)
  acc += simDt;
  if (acc > STEP * 8) acc = STEP * 8; // never spiral after a stall
  let inp = window.game.scriptInput ? window.game.scriptInput(sim, dt) : input.sample(0);
  let steps = 0;
  while (acc >= STEP) {
    p.px = p.x; p.pz = p.z; p.pyaw = p.aimYaw;
    for (const z of sim.zombies) { z.px = z.x; z.pz = z.z; z.pyaw = z.yaw; }
    sim.step(inp);
    if (steps === 0) inp = Object.assign({}, inp, { swapPresses: 0 });
    acc -= STEP; steps++;
    if (hitPauseT > 0) { acc = 0; break; }
  }
  const alpha = paused ? 1 : acc / STEP;
  handleEvents();
  const animDt = paused ? 0 : simDt;

  // ---- Yola ----
  const ix = p.px + (p.x - p.px) * alpha, iz = p.pz + (p.z - p.pz) * alpha;
  const iyaw = p.pyaw + angleDiff(p.pyaw, p.aimYaw) * alpha;
  const a = p.action;
  yola.update(animDt, {
    x: ix, z: iz, vx: p.vx, vz: p.vz, aimYaw: iyaw, equipped: p.equipped, action: a.type, actionT: a.t,
    swingT: a.type === 'swing' ? a.st : 0, recoil: p.recoil, recoilScale: tuning.pistolRecoil,
    dead: p.dead, deathDir: p.deathDir || 0, hurtT: p.hurtT, hurtDirX: p.hurtDirX || 0, hurtDirZ: p.hurtDirZ || 0,
    reloadDur: tuning.reloadTime, swapDur: tuning.swapTime,
  });
  // bat trail during the damaging part of the swing
  if (a.type === 'swing' && a.st > BAT_SWING.activeStart - 0.04 && a.st < a.activeEnd + 0.04) {
    fx.trailPush(yola.bat.position, yola.bat.userData.tip.getWorldPosition(_v), true);
  }
  fx.setAim(ix, iz, iyaw, !p.dead, p.aiming ? (p.attackHeld ? 1 : 0.5) : 0.2);

  // ---- zombies (pooled views) ----
  const seen = new Set();
  for (const z of sim.zombies) {
    let v = zviews.get(z.id);
    if (!v) {
      const type = z.id % 2;
      v = zpool[type].pop() || newZombieView(type);
      v.bind(z); zviews.set(z.id, v);
      z.px ??= z.x; z.pz ??= z.z;
    }
    seen.add(z.id);
    v.update(animDt, z, z.px + (z.x - z.px) * alpha, z.pz + (z.z - z.pz) * alpha, sim.time);
  }
  for (const [id, v] of zviews) if (!seen.has(id)) { v.hide(); zviews.delete(id); zpool[v.type].push(v); }

  // ambient groans (rate-limited, nearest zombies)
  groanT -= animDt;
  if (groanT <= 0) { groanT = 1.6 + Math.random() * 2; const n = sim.zombies.filter((z) => z.alive && Math.hypot(z.x - p.x, z.z - p.z) < 9).length; if (n) audio.play('groan', Math.min(1, 0.5 + n * 0.1)); }

  fx.update(animDt);
  if (camOverride) applyCamOverride(); else updateCamera(dt, ix, iz, iyaw, p);
  // player screen position (mouse aiming)
  _v.set(ix, 1.0, iz).project(camera);
  playerScreen = { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };

  if (debugOn) updateDebug(p);
  hud.update(sim, dt);
  if (doRender) renderer.render(scene, camera);
}

function handleEvents() {
  const p = sim.player;
  for (const e of sim.events) {
    switch (e.type) {
      case 'shot': {
        audio.play('shot');
        fx.muzzle(yola.muzzleWorld);
        fx.tracer(yola.muzzleWorld.x, yola.muzzleWorld.y, yola.muzzleWorld.z, e.ex, e.ez);
        if (e.hit === 'zombie') { fx.impactZombie(e.ex, e.ez, Math.sin(e.yaw), Math.cos(e.yaw), false); audio.play('bulletHit'); if (!e.killed) audio.play('zombieHurt'); }
        else if (e.hit === 'wall') { fx.impactWall(e.ex, e.ez, e.nx, e.nz); audio.play('ricochet'); }
        shake(0.12);
        break;
      }
      case 'swing': sim.stats.swings++; audio.play('swing'); break;
      case 'batHit': audio.play('batHit'); fx.impactZombie(e.x, e.z, e.dirX, e.dirZ, true); shake(e.killed ? 0.45 : 0.35); break;
      case 'batMiss': audio.play('batMiss'); break;
      case 'batClank': audio.play('clank'); fx.impactWall(e.x, e.z, e.nx, e.nz); shake(0.2); break;
      case 'hitPause': hitPauseT = Math.max(hitPauseT, e.dur); break;
      case 'reloadStart': audio.play('reload'); hud.flash('reload'); break;
      case 'reloadDone': audio.play('reloadDone'); break;
      case 'swapStart': audio.play('swap'); break;
      case 'zombieWindup': if (dist(e.id) < 8) audio.play('windup'); break;
      case 'playerHurt': audio.play('playerHurt'); shake(0.4); hud.hurt(); p.hurtDirX = e.dirX; p.hurtDirZ = e.dirZ; sim.stats.damageTaken += 1; break;
      case 'playerDeath': audio.play('death'); input.clearAll(); input.enabled = false; hud.death(sim); break;
      case 'zombieDeath': sim.stats.kills++; audio.play('zombieDeath'); break;
      case 'zombieSpawn': if (Math.random() < 0.5) audio.play('groan', 0.8); break;
      case 'beatStart': hud.banner(`Wave ${e.beat}`); audio.play('wave'); break;
      case 'breather': hud.banner('Breather', 'Next wave incoming'); break;
      case 'encounterCleared': hud.cleared(sim); audio.play('clear'); input.clearAll(); break;
    }
  }
  sim.events.length = 0;
}
const dist = (id) => { const z = sim.zombies.find((q) => q.id === id); return z ? Math.hypot(z.x - sim.player.x, z.z - sim.player.z) : 99; };
function shake(k) { if (shakeOn) camState.trauma = Math.min(1, camState.trauma + k * tuning.shake); }

function updateCamera(dt, px, pz, yaw, p) {
  const aspect = camera.aspect;
  const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const want = aspect < 1 ? 5.2 : 9; // metres of floor visible across at the player
  const D = THREE.MathUtils.clamp(want / (2 * Math.tan(hfov / 2)), 9, 22);
  // modest look-ahead toward the aim; no camera rotation ever
  const la = (p.aiming ? 1 : 0.45) * tuning.lookAhead * (p.dead ? 0 : 1);
  camState.look.x += (Math.sin(yaw) * la - camState.look.x) * Math.min(1, dt * 3);
  camState.look.y += (Math.cos(yaw) * la - camState.look.y) * Math.min(1, dt * 3);
  // keep Yola in the lower-middle of a portrait screen (most threats arrive from up-screen)
  let tx = px + camState.look.x, tz = pz + camState.look.y - (aspect < 1 ? 1.4 : 0.6);
  const halfW = D * Math.tan(hfov / 2);
  const lim = Math.max(0, 7.4 - halfW + 0.8);
  tx = THREE.MathUtils.clamp(tx, -lim, lim);
  tz = THREE.MathUtils.clamp(tz, -9.2, aspect < 1 ? 6.6 : 7.6);
  // critically damped follow
  const w = 7, k = w * w, c = 2 * w;
  camState.vx += (k * (tx - camState.x) - c * camState.vx) * dt; camState.vz += (k * (tz - camState.z) - c * camState.vz) * dt;
  camState.x += camState.vx * dt; camState.z += camState.vz * dt;
  const pitch = THREE.MathUtils.degToRad(57);
  camera.position.set(camState.x, Math.sin(pitch) * D, camState.z + Math.cos(pitch) * D);
  camera.lookAt(camState.x, 0.6, camState.z);
  // bounded shake
  camState.trauma = Math.max(0, camState.trauma - dt * 2.2);
  const s = camState.trauma * camState.trauma * 0.18;
  if (s > 0) { camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s * 0.5; camera.position.z += (Math.random() - 0.5) * s; }
}

function updateDebug(p) {
  if (!debugGroup.children.length || debugGroup.userData.sim !== sim) { buildDebug(); debugGroup.userData.sim = sim; debugGroup.add(dbgCircle, dbgBat); }
  dbgCircle.position.set(p.x, 0.05, p.z);
  if (p.action.type === 'swing') {
    const s = batSegment(p.action.st, _seg), sy = Math.sin(p.aimYaw), cy = Math.cos(p.aimYaw);
    const w = (x, y, z) => new THREE.Vector3(p.x + x * cy + z * sy, y, p.z - x * sy + z * cy);
    dbgBat.geometry.setFromPoints([w(s.hx, s.hy, s.hz), w(s.tx, s.ty, s.tz)]);
    dbgBat.visible = true;
  } else dbgBat.visible = false;
}

// ---------- performance measurement ----------
function perfSample(dt) {
  const ms = dt * 1000;
  perf.frames.push(ms); if (perf.frames.length > 600) perf.frames.shift();
  if (ms > 34) perf.spikes++;
  // dynamic resolution: protect frame time before anything else
  if (perf.frames.length >= 90 && perf.frames.length % 30 === 0 && !paused) {
    const recent = perf.frames.slice(-90), avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (avg > 21 && renderScale > 0.6) { renderScale = Math.max(0.6, renderScale - 0.1); resize(); }
    else if (avg < 14 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.05); resize(); }
  }
}
function perfReport() {
  const f = [...perf.frames].sort((a, b) => a - b);
  if (!f.length) return null;
  const avg = f.reduce((a, b) => a + b, 0) / f.length;
  return {
    fps: +(1000 / avg).toFixed(1), avgMs: +avg.toFixed(2), p95Ms: +f[Math.floor(f.length * 0.95)].toFixed(2), maxMs: +f[f.length - 1].toFixed(2),
    spikesOver34ms: perf.spikes, zombies: sim.aliveCount(), dpr: +renderer.getPixelRatio().toFixed(2), renderScale,
    res: `${renderer.domElement.width}x${renderer.domElement.height}`, quality: resolvedQuality(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
    ua: navigator.userAgent,
  };
}

// Test hook: close-up camera. {target:'yola'|zombie id, yaw (deg, 0 = in front of the character), pitch (deg), dist, h}
let camOverride = null;
function applyCamOverride() {
  const o = camOverride;
  let tx, tz, fy;
  if (o.target === 'yola') { tx = sim.player.x; tz = sim.player.z; fy = sim.player.aimYaw; }
  else { const z = sim.zombies.find((q) => q.id === o.target) || sim.zombies[0]; if (!z) return; tx = z.x; tz = z.z; fy = z.yaw; }
  const a = fy + THREE.MathUtils.degToRad(o.yaw || 0), pi = THREE.MathUtils.degToRad(o.pitch ?? 10), d = o.dist || 2.6;
  camera.position.set(tx + Math.sin(a) * Math.cos(pi) * d, (o.h ?? 0.9) + Math.sin(pi) * d, tz + Math.cos(a) * Math.cos(pi) * d);
  camera.lookAt(tx, o.h ?? 0.9, tz);
}
// Test hook: save the current 3D frame as zombie/shots/<name>.png via the local dev server.
async function shot(name) {
  if (camOverride) applyCamOverride();
  renderer.render(scene, camera);
  const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/png'));
  await fetch('/__shot/' + name + '.png', { method: 'POST', body: blob });
  return name;
}
// Test hook: stitch saved captures into one labelled contact sheet.
async function sheet(names, out, cols = 3, w = 320) {
  const imgs = await Promise.all(names.map((n) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = '/zombie/shots/' + n + '.png?' + Date.now(); })));
  const first = imgs.find(Boolean); const h = Math.round(w * (first.height / first.width));
  const c = document.createElement('canvas'); c.width = cols * w; c.height = Math.ceil(names.length / cols) * (h + 18);
  const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.font = '13px sans-serif';
  imgs.forEach((im, k) => { const x = (k % cols) * w, y = Math.floor(k / cols) * (h + 18); if (im) g.drawImage(im, x, y + 18, w, h); g.fillStyle = '#fff'; g.fillText(names[k], x + 4, y + 13); });
  const b = await new Promise((r) => c.toBlob(r, 'image/png'));
  await fetch('/__shot/' + out + '.png', { method: 'POST', body: b });
  return out;
}
window.game = { tick, shot, sheet, simBat: (st) => batWorldSegment(sim.player, st, {}), cam(o) { camOverride = o; },  resume() { manualTicks = false; last = performance.now(); }, get sim() { return sim; }, set sim(v) {}, restart, perfReport, tuning, setPaused, uiAction, scriptInput: null, get yola() { return yola; }, THREE, camera, renderer, scene };
hud.perfReport = perfReport;
load().catch((e) => { console.error(e); hud.error(String(e)); });
