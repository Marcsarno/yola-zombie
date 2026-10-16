// Combat benchmark entry point: loads the hospital wing, Yola and the zombie, runs the fixed-step sim.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sim, STEP } from './core/sim.js';
import { makeTuning } from './core/tuning.js';
import { setMeleePaths, meleeSegment, BAT_DEF, BAT_PROFILE, useBuiltBat } from './core/weapons.js';
import { buildLibraryAttack } from './render/libattack.js';
import { LAYOUT, ROOM1, useLevel, levelForMode } from './core/layout.js';
import { Arena } from './render/arena.js';
import { YolaView, ZombieView } from './render/clipchars.js';
import { FX } from './render/fx.js';
import { Telegraphs } from './render/telegraph.js';
import { Looks, LOOKS } from './render/looks.js';
import { LiveScreens } from './render/screens.js';
import { CombatAudio } from './audio.js';
import { GameMusic } from './music.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { angleDiff } from './core/world.js';
import { meleeWorldSegment } from './core/player.js';
import { CustomPhysics } from './render/physics/custom.js';
import { loadDamageTextures } from './render/ShieldController.mjs';
import { RapierPhysics } from './render/physics/rapier.js';
import * as physlab from './physlab.js';
import { Opening } from './opening/opening.js';
import { OBJECTIVES } from './opening/content.js';
import { startLab } from './lab.js';
import { startInspect } from './inspect.js';
import { startTestArena } from './arena/testarena.js';
import { makeBat } from './render/weaponModels.js';

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
const GAME_FOV = 50; // the gameplay camera's field of view (the opening uses its own and hands back to this)
let renderScale = 1;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP[resolvedQuality()]) * renderScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  looks?.setSize();
}
let looks = null; // lighting looks (render/looks.js): the ☀ button cycles them
addEventListener('resize', resize); resize();

// ---------- systems ----------
const tuning = makeTuning(store.get('tuning', null));
const audio = new CombatAudio();
audio.setVolume(store.get('volume', 0.8)); audio.setMuted(store.get('muted', false));
for (const b of ['sfx', 'music', 'voice']) { audio.levels[b] = store.get('lvl_' + b, audio.levels[b]); audio.busMuted[b] = store.get('mute_' + b, false); }
const music = new GameMusic(audio); // the supplied combat track: explore / combat with hysteresis (music.js)
const fx = new FX(scene);
const telegraphs = new Telegraphs(scene); // zombie attack wedges on the floor
fx.gore = store.get('gore', true);
let shakeOn = true;
const hud = new Hud({ tuning, audio, store, onAction: (a, v) => uiAction(a, v) });
const input = new Input(document.getElementById('touch'), {
  swapButton: document.getElementById('swapBtn'),
  getPlayerScreen: () => playerScreen,
});
const unlockAudio = () => audio.init();
addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('touchend', unlockAudio, { capture: true }); // (iPhone counts touchend/click, not touchstart, as the audio gesture)
addEventListener('click', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });

// ---------- physics (ragdolls, severed pieces): ?physics=custom | rapier | off ----------
const physMode = params.get('physics') || store.get('physics', 'custom');
const physics = physMode === 'off' ? null : physMode === 'rapier' ? new RapierPhysics() : new CustomPhysics();
ZombieView.physics = physics;
ZombieView.fx = fx;
let physAcc = 0;
function resetPhysics() {
  if (!physics) return;
  physics.ready = false; physAcc = 0;
  const p = physics.init(sim.world);
  if (physics.syncInit) physics.ready = true; // the custom backend sets up synchronously
  else p.then(() => { physics.ready = true; }).catch((e) => { console.error(e); hud.error?.('Physics failed: ' + e.message); });
}
function stepPhysics(dt) {
  if (!physics?.ready || dt <= 0) return;
  physAcc += dt;
  let n = 0;
  while (physAcc >= STEP && n < 4) { physics.step(STEP); physAcc -= STEP; n++; }
  if (n === 4) physAcc = 0; // never spiral after a stall
}

let arena, yola, sim;
const zviews = new Map(); const zpool = [[], [], [], []];
const storyStart = params.has('intro') || params.has('reveal') || params.has('room1');
let mode = storyStart ? 'room1' : params.get('mode') || 'encounter', benchN = +(params.get('n') || 10);
useLevel(levelForMode(mode)); // the story's Floor 3, or the combat wing for practice, waves and benchmarks
let levelSave = store.get('floor3save', null); // the latest Floor 3 checkpoint (retry restores it)
const HIT_SLOW = 0.2; // time runs at this rate through a hit-stop
let paused = false, hitPauseT = 0, acc = 0, last = performance.now(), playerScreen = null;
const camState = { x: 0, z: 0, vx: 0, vz: 0, trauma: 0, look: new THREE.Vector2() };
const perf = { frames: [], spikes: 0, t0: performance.now() };

// ---------- loading ----------
// Characters: Tripo meshes (mixamorig skeleton) with Mixamo/Tripo clips, exported by blender/export_chars.py.
// (Yola's locomotion speeds are measured from foot plants at load, see YolaView.measureGaits.)
const ZOMBIE_TYPES = [
  { file: 'assets/zombie-nurse-mod.glb', extra: 'assets/zombie-nurse-scratch.glb', height: 1.78, walk: { speed: 0.168 } }, // modular: severable head, forearms, lower legs
  { file: 'assets/zombie-patient-mod.glb', extra: 'assets/zombie-patient-scratch.glb', height: 1.68, walk: { speed: 0.174 } },
  // tools/anim/build_zombie.py: the sprinter (the big lady; hand weights fixed) and the big guard (a stand-in shield until his
  // bed-panel shield is modelled). Not modular: no limbs come off them yet.
  { file: 'assets/zombie-sprinter.glb', height: 2.0, walk: { speed: 0.168 }, sprint: 4.3, girth: 1.7 }, // (15% bigger than first built: she has to feel big)
  { file: 'assets/zombie-guard.glb', height: 2.05, walk: { speed: 0.168 }, shield: true, girth: 1.4 },
];
const viewType = (z) => (z.kind === 'sprinter' ? 2 : z.kind === 'guard' ? 3 : z.look === 'nurse' ? 0 : z.look === 'patient' ? 1 : z.id % 2);
const YOLA_HEIGHT = 1.62;
// which Yola plays (2026-10-16): 1 = the original model, 2 = the user's new Tripo model (testing; tools/anim/yola2_build.py).
// The pause menu's Yola choice (remembered), or ?yola=2. The opening keeps its own Yola either way.
const YOLA_MODEL = params.get('yola') || store.get('yolaModel', '1');
const YOLA_FILES = YOLA_MODEL === '2' ? { model: 'assets/yola2.glb', extra: [], data: 'assets/clipdata_yola2.json' }
  : { model: 'assets/yola.glb', extra: ['assets/yola_combo.glb', 'assets/yola_extra.glb', 'assets/yola_sword.glb'], data: 'assets/clipdata.json' };
const loader = new GLTFLoader();
async function load() {
  hud.loading(0);
  arena = new Arena(scene, resolvedQuality(), renderer);
  looks = new Looks(renderer, scene, camera); looks.set(store.get('look', 'standard'));
  document.getElementById('lookBtn')?.addEventListener('click', () => {
    const i = (LOOKS.findIndex(([k]) => k === looks.key) + 1) % LOOKS.length, [k, label] = LOOKS[i];
    looks.set(k); store.set('look', k); hud.toast('Look: ' + label);
    clearTimeout(looks.fpsT); looks.fpsT = setTimeout(() => { const f = perf.frames.slice(-90), avg = f.reduce((a, b) => a + b, 0) / (f.length || 1); hud.toast(label + ' · ' + Math.round(1000 / avg) + ' fps'); }, 2500);
  });
  // Yola, plus the clips authored outside her model file (the bat combo: skeleton-only, same bone names)
  const yolaP = Promise.all([loader.loadAsync(YOLA_FILES.model), ...YOLA_FILES.extra.map((f) => loader.loadAsync(f).catch(() => null))]).then(([g, ...xs]) => { for (const x of xs) if (x) g.animations.push(...x.animations); return g; });
  // (each type's extra clips, the scratch, are retargeted onto its own skeleton: tools/anim/zombie_clip.py)
  const zomP = Promise.all(ZOMBIE_TYPES.map((t) => Promise.all([loader.loadAsync(t.file), t.extra ? loader.loadAsync(t.extra).catch(() => null) : null]).then(([g, x]) => { if (x) g.animations.push(...x.animations); return g; })));
  const dataP = fetch(YOLA_FILES.data).then((r) => r.json());
  // the guard's shield (the user's v2 package): the GLB and the two damage maps, loaded once and shared by every guard
  const shieldP = Promise.all([loader.loadAsync('assets/shield/modular_bed_shield.glb'), loadDamageTextures(new URL('assets/shield/', location.href))])
    .then(([gltf, damageTextures]) => { ZombieView.shieldAsset = { gltf, damageTextures }; }).catch((e) => console.warn('shield asset failed: stand-in shield', e));
  const wpnP = Promise.all([loader.loadAsync('assets/weapons/pump_short.glb'), loader.loadAsync('assets/weapons/fire_axe.glb'), loader.loadAsync('assets/weapons/shell.glb'),
    loader.loadAsync('assets/weapons/pistol_core.glb').catch(() => null)]);
  await arena.loadProps(loader, (k) => hud.loading(k * 0.7));
  const [yg, zgs, clipdata, [sgG, axeG, shellG, pistolG]] = await Promise.all([yolaP, zomP, dataP, wpnP, shieldP]);
  hud.loading(0.95);
  setMeleePaths(clipdata, YOLA_HEIGHT / clipdata.heights.YOLA, clipdata.hips_rest);
  yola = new YolaView(scene, yg, clipdata, { shotgun: sgG, axe: axeG, shell: shellG, pistol: pistolG });
  yola.addAttackClips(yg.animations.filter((c) => c.name === 'yola_knockdown' || c.name === 'yola_getup')); // (tools/anim/yola_clips.py: knocked flat, getting up)
  setupBat(yg.animations); window.game.yolaClips = yg.animations;
  ZOMBIE_TYPES.forEach((t, i) => (t.gltf = zgs[i]));
  renderer.shadowMap.needsUpdate = true;
  screens.scan(scene); // the monitors' live faces (the opening's clinic is scanned once it has loaded)
  restart();
  hud.loading(1);
  if (params.has('intro') || params.has('reveal') || params.has('room1')) await startOpening();
  if (mode === 'arena') window.game.testArena = await startTestArena({ game: window.game, scene, loader, telegraphs }); // the weapon test arena (combat.html?mode=arena)
  warmPrograms();
  requestAnimationFrame(frame);
  if (params.has('lab')) startLab(window.game, params.get('lab') || 'bat'); // the combat lab (frame-by-frame melee against the reference)
  if (params.has('inspect')) window.game.inspect = startInspect(window.game); // free camera on Yola's weapon holds (src/inspect.js)
}
// The bat: Quaternius's Sword Regular Combo (one-handed, four strikes), built on the Yola that plays, the bat in her right
// fist and the matching Sword Idle as its stance (src/render/libattack.js). Without the clip the older bat combo stays.
function setupBat(anims) {
  const combo = anims.find((c) => c.name === 'ual_Sword_Regular_Combo'), idle = anims.find((c) => c.name === 'ual1_Sword_Idle');
  if (!combo) return;
  const h = new THREE.Group(), m = makeBat(0.84);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  h.add(m); h.visible = false; scene.add(h);
  const hold = { obj: h, w: BAT_DEF, hand: 'Right', roll: 0, slide: 0, flip: false, two: false, fingers: null };
  yola.setOneHandedBat(hold, idle);
  // (89 of its 91 frames: the last one snaps back to the loop pose; four strikes, the third a slower swing)
  useBuiltBat(buildLibraryAttack(yola, { clip: combo, frames: 89, hold, P: BAT_PROFILE, speed: 1, name: 'bat', sound: 'bat', strikes: 4 }));
}
// Compile every shader the fight can need before play. A first use mid-fight compiled one and froze that frame (a limb
// cut off: 70-270 ms; the first hit): severed pieces draw the zombie's materials unskinned, and pooled hidden things
// (blood pools, hit rings, the arena's weapons, the outbreak surfaces) are skipped by a normal compile. The warm-up
// materials are kept (disposing them would free the programs again).
const warmMats = [];
function warmPrograms() {
  const tmp = new THREE.Group(), box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  ZOMBIE_TYPES.forEach((t, type) => {
    // a view of each type (from the pool: its materials are the game's, tuned at construction), and an unskinned copy of
    // every one of its materials, as ZombieView.sever bakes them (wound caps and gore included)
    if (!zpool[type].length) { const nv = newZombieView(type); nv.hide(); zpool[type].push(nv); } // (pooled: hidden until bound)
    const v = zpool[type][0];
    v.model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      for (const m of [].concat(o.material)) { const c = m.clone(); if (c.emissive) c.emissive.setRGB(0, 0, 0); warmMats.push(c); tmp.add(new THREE.Mesh(box, c)); }
    });
  });
  scene.add(tmp);
  // (the lights stay exactly as they are: a program is built for the scene's light count, so lights switched on for the
  // warm-up would compile programs play never uses)
  const lit = new Set(); scene.traverseVisible((o) => { if (o.isLight) lit.add(o); });
  const hidden = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const dark = []; scene.traverse((o) => { if (o.isLight && o.visible && !lit.has(o)) { dark.push(o); o.visible = false; } });
  try { renderer.compile(scene, camera); } catch (e) { console.warn('warm-up compile', e); }
  // one real frame with the shadow map redrawn: compile() leaves out the shadow-depth programs (behind the loading screen)
  if (renderer.shadowMap.enabled) { renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); }
  for (const o of dark) o.visible = true;
  for (const o of hidden) o.visible = false;
  renderer.shadowMap.needsUpdate = true;
  scene.remove(tmp);
}
let opening = null;
const screens = new LiveScreens();
async function startOpening() {
  opening = new Opening({ scene, camera, renderer, loader, audio, params, arena, yola, screens, getSim: () => sim, tuning, game: () => window.game });
  window.opening = opening;
  await opening.preload((k) => hud.loading(0.95 + 0.05 * k));
  screens.scan(scene);
  opening.begin();
  opening.warm2?.();
}

// ---------- Room 1: the canonical hand-off (used by the opening's normal end, skip, replay and ?room1=1) ----------
// A still frame of Yola for the opening (idle, unarmed): the same state object the game feeds the view each frame
function stillState(x, z, yaw) {
  return { x, z, vx: 0, vz: 0, aimYaw: yaw, equipped: 'fists', action: 'ready', actionT: 0, swingT: 0, combo: 0, swingId: -1, recoil: 0, recoilScale: 1, dead: false, deathDir: 0, hurtT: 99, hurtDirX: 0, hurtDirZ: 0, reloadDur: 1, swapDur: tuning.swapTime };
}
// put the game camera exactly where it will sit for the player at (x,z) facing yaw (no easing), and return that pose
function cameraPose(x, z, yaw) {
  camera.fov = GAME_FOV; camera.updateProjectionMatrix();
  const p = sim.player, sx = p.x, sz = p.z, sy = p.aimYaw;
  p.x = x; p.z = z; p.aimYaw = yaw;
  const cy = THREE.MathUtils.degToRad(tuning.camYaw), fx = -Math.sin(cy), fz = -Math.cos(cy), aspect = camera.aspect, up = aspect < 1 ? 1.4 : 0.6;
  const la = 0.45 * tuning.lookAhead;
  camState.look.set(Math.sin(yaw) * la, Math.cos(yaw) * la);
  const cb = LAYOUT.camBounds;
  camState.x = cb ? THREE.MathUtils.clamp(x + camState.look.x + fx * up, cb.minX, cb.maxX) : THREE.MathUtils.clamp(x + camState.look.x + fx * up, -6.2, 6.2);
  camState.z = cb ? THREE.MathUtils.clamp(z + camState.look.y + fz * up, cb.minZ, cb.maxZ) : THREE.MathUtils.clamp(z + camState.look.y + fz * up, -9.2, aspect < 1 ? 6.6 : 7.6);
  camState.vx = camState.vz = 0; camState.trauma = 0;
  updateCamera(1e-4, x, z, yaw, p);
  const pose = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
  p.x = sx; p.z = sz; p.aimYaw = sy;
  return pose;
}
function applyRoom1() { levelSave = null; store.set('floor3save', null); return applyLevel(null); }
// Floor 3 from its start (save null: Room 1, three dormant standard zombies, Yola unarmed) or from a checkpoint
function applyLevel(save) {
  restart('room1', benchN, save);
  const p = sim.player, A = ROOM1.player;
  if (!save) {
    p.x = A.x; p.z = A.z; p.aimYaw = p.aimTarget = A.yaw; p.hp = p.maxHp;
    p.setLoadout(['bat', 'fists'], 'bat'); // she breaks through with the guard's bat in her hands
    if (sim.level) { sim.level.taken.add('bat'); sim.level.pickups = sim.level.pickups.filter((q) => q.id !== 'bat'); }
  }
  p.px = p.x; p.pz = p.z; p.pyaw = p.aimYaw; p.vx = p.vz = 0; p.invuln = save ? 1.2 : 0; p.attackHeld = false; p.recoil = 0;
  yola.reset(p.x, p.z, p.aimYaw); yola.setShown(true);
  cameraPose(p.x, p.z, p.aimYaw); // the follow camera starts exactly at the pose
  for (const z of sim.zombies) { z.px = z.x; z.pz = z.z; z.pyaw = z.yaw; }
  input.clearAll(); input.enabled = true; acc = 0; hitPauseT = 0; last = performance.now();
  arena.syncLevel(sim.level);
  if (sim.level?.taken.has('bat')) opening?.takeBat?.(); else opening?.restoreBat?.();
  hud.setObjective(OBJECTIVES[sim.level ? sim.level.objective : 'room1'] || '');
  return sim;
}
// show the zombies and Yola without stepping the simulation (the reveal, before control is handed over)
function previewRoom1(dt) {
  if (!opening?.revealSwing) yola.update(dt, stillState(sim.player.x, sim.player.z, sim.player.aimYaw));
  for (const z of sim.zombies) {
    let v = zviews.get(z.id);
    if (!v) { const type = viewType(z); v = zpool[type].pop() || newZombieView(type); v.bind(z); zviews.set(z.id, v); }
    v.update(dt, z, z.x, z.z, sim.time);
  }
}
// compile everything the hand-off draws (the zombies, Yola's fists) before the timed reveal, with no visible change
function warmRoom1() {
  const sv = { x: camera.position.x, y: camera.position.y, z: camera.position.z, q: camera.quaternion.clone(), fov: camera.fov };
  applyLevel(null); yola.setShown(true); // (warm-up only: the saved checkpoint is left alone)
  for (let i = 0; i < 3; i++) previewRoom1(1 / 60);
  renderer.render(scene, camera);
  for (const v of zviews.values()) { v.hide(); zpool[v.type].push(v); } zviews.clear(); yola.setShown(false);
  camera.position.set(sv.x, sv.y, sv.z); camera.quaternion.copy(sv.q); camera.fov = sv.fov; camera.updateProjectionMatrix();
}
function newZombieView(type) {
  const t = ZOMBIE_TYPES[type];
  const v = new ZombieView(scene, t.gltf, t.height, t.walk, t);
  v.type = type;
  return v;
}

// ---------- lifecycle ----------
function restart(newMode = mode, n = benchN, save = null) {
  if (levelForMode(newMode) !== LAYOUT.name) { // the other layout: load it fresh
    const q = new URLSearchParams(); if (newMode !== 'room1') q.set('mode', newMode); else q.set('room1', '1'); if (newMode === 'bench') q.set('n', n);
    location.search = q.toString(); return;
  }
  mode = newMode; benchN = n;
  sim = new Sim({ tuning, seed: +(params.get('seed') || 1234), mode, benchCount: n, save });
  window.game.sim = sim;
  for (const v of zviews.values()) { v.hide(); zpool[v.type].push(v); }
  zviews.clear();
  ZombieView.clearPieces();
  resetPhysics();
  const p = sim.player;
  p.px = p.x; p.pz = p.z; p.pyaw = p.aimYaw;
  yola.reset(p.x, p.z, p.aimYaw);
  fx.trailClear();
  camState.x = p.x; camState.z = p.z - 1.2; camState.vx = camState.vz = 0;
  hitPauseT = 0; acc = 0;
  perf.frames.length = 0; perf.spikes = 0; perf.t0 = performance.now();
  hud.onRestart(sim);
  setPaused(false);
  window.game.onRestart?.(sim); // (the weapon test arena re-equips its pick and puts its dummies back)
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
    case 'restart': if (sim.level) applyLevel(levelSave); else restart(mode); break; // the story level retries from its checkpoint
    case 'restartLevel': applyRoom1(); break;
    case 'mode': restart(v); break;
    case 'bench': restart('bench', v); break;
    case 'quality': quality = v; store.set('quality', v); location.reload(); break;
    case 'gore': fx.gore = v; store.set('gore', v); break;
    case 'yola': store.set('yolaModel', v); location.reload(); break;
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
  if (paused) setPaused(false); // a hidden test tab auto-pauses
  for (let i = 0; i < n; i++) runFrame(dt, render && i === n - 1);
}
function runFrame(dt, doRender = true) {
  perfSample(dt);
  screens.update(dt);
  if (opening && !opening.active) opening.ambient?.(dt); // the seated guard keeps idling after the hand-off
  if (opening?.active) { opening.update(dt); if (opening.room1Preview) previewRoom1(Math.min(dt, 0.05) * (opening.timeScale || 1)); if (doRender) looks.render(); return; }
  const p = sim.player;
  let simDt = dt;
  if (paused) simDt = 0;
  // hit-stop: a short dip into slow motion (never a full freeze: a freeze reads as a stutter, and combo hits stacked them)
  if (hitPauseT > 0) { const h = Math.min(hitPauseT, simDt); hitPauseT -= h; simDt -= h * (1 - HIT_SLOW); }
  // fixed-step simulation (input sampled once per frame; a swap press is delivered exactly once)
  acc += simDt;
  if (acc > STEP * 8) acc = STEP * 8; // never spiral after a stall
  // stick directions are screen directions: rotate them by the camera's turn
  let inp = window.game.scriptInput ? window.game.scriptInput(sim, dt) : input.sample(THREE.MathUtils.degToRad(tuning.camYaw));
  let steps = 0;
  while (acc >= STEP) {
    p.px = p.x; p.pz = p.z; p.pyaw = p.aimYaw;
    for (const z of sim.zombies) { z.px = z.x; z.pz = z.z; z.pyaw = z.yaw; }
    sim.step(inp);
    if (steps === 0) inp = Object.assign({}, inp, { swapPresses: 0, usePresses: 0 });
    acc -= STEP; steps++;
  }
  const alpha = paused ? 1 : acc / STEP; // frozen frames show the latest step (alpha 0 rolled the pose back a step)
  handleEvents();
  if (steps) window.game.arenaTick?.(steps * STEP);
  const animDt = paused ? 0 : simDt;

  // ---- Yola ----
  const ix = p.px + (p.x - p.px) * alpha, iz = p.pz + (p.z - p.pz) * alpha;
  const iyaw = p.pyaw + angleDiff(p.pyaw, p.aimYaw) * alpha;
  const a = p.action;
  yola.update(animDt, {
    x: ix, z: iz, vx: p.vx, vz: p.vz, aimYaw: iyaw, equipped: p.equipped, action: a.type, actionT: a.t,
    swingT: a.type === 'swing' ? a.st : 0, combo: a.combo || 0, ground: !!a.ground, swingId: a.id, downFall: a.fall, downUp: a.up, recoil: p.recoil, recoilScale: tuning.pistolRecoil,
    dead: p.dead, deathDir: p.deathDir || 0, hurtT: p.hurtT, hurtDirX: p.hurtDirX || 0, hurtDirZ: p.hurtDirZ || 0,
    reloadDur: p.reloadTime(), swapDur: tuning.swapTime,
  });
  // the swing arc: every melee weapon, through each damaging window of the attack (and a little either side)
  if (a.type === 'swing' && p.equipped !== 'fists') {
    const A = p.atk(), wins = A.windows || [[A.activeStart, a.activeEnd]];
    if (wins.some(([w0, w1]) => a.st > w0 - 0.07 && a.st < w1 + 0.05)) {
      if (p.equipped === 'test' && yola.testTip) fx.trailPush(yola.testGrip, yola.testTip, true);
      else if (yola.melee.visible) fx.trailPush(yola.melee.position, yola.melee.userData.tip.getWorldPosition(_v), true);
    }
  }
  fx.setAim(ix, iz, iyaw, !p.dead, p.aiming ? (p.attackHeld ? 1 : 0.5) : 0.2);

  stepPhysics(animDt);
  ZombieView.updatePieces(animDt); ZombieView.updateShields(animDt);
  // ---- zombies (pooled views) ----
  const seen = new Set();
  for (const z of sim.zombies) {
    let v = zviews.get(z.id);
    if (!v) {
      const type = viewType(z);
      v = zpool[type].pop() || newZombieView(type);
      v.bind(z); zviews.set(z.id, v);
      z.px ??= z.x; z.pz ??= z.z;
    }
    seen.add(z.id);
    // Floor 3: a dormant zombie far from Yola (another room) is neither drawn nor animated
    if (sim.level && z.dormant && (z.x - ix) * (z.x - ix) + (z.z - iz) * (z.z - iz) > 15 * 15) { if (v.outer.visible) { v.outer.visible = false; v.blob.visible = false; v.farHidden = true; } continue; }
    if (v.farHidden) { v.outer.visible = true; v.blob.visible = true; v.farHidden = false; }
    v.update(animDt, z, z.px + (z.x - z.px) * alpha, z.pz + (z.z - z.pz) * alpha, sim.time);
  }
  for (const [id, v] of zviews) if (!seen.has(id)) { v.hide(); zviews.delete(id); zpool[v.type].push(v); }
  telegraphs.update(sim.zombies, alpha);

  // ambient groans (rate-limited, nearest zombies)
  groanT -= animDt;
  if (groanT <= 0) { groanT = 1.6 + Math.random() * 2; const n = sim.zombies.filter((z) => z.alive && Math.hypot(z.x - p.x, z.z - p.z) < 9).length; if (n) audio.play('groan', Math.min(1, 0.5 + n * 0.1)); }

  fx.update(animDt);
  if (music.state !== 'off') { const R = music.state === 'combat' ? 11 : 7; music.update(dt, sim.zombies.some((z) => z.alive && !z.dormant && !z.passive && (Math.hypot(z.x - p.x, z.z - p.z) < R || z.state === 'windup' || z.state === 'strike')), paused || p.dead); }
  arena.update(dt, ix, iz, THREE.MathUtils.degToRad(tuning.camYaw), sim.level);
  hud.setEmergency(!!arena.em && arena.em.target > 0);
  hud.setPrompt(sim.level && !paused ? sim.level.prompt : null);
  if (camOverride) applyCamOverride(); else if (!window.game.camFree) updateCamera(dt, ix, iz, iyaw, p); // (camFree: inspect mode moves the camera)
  // player screen position (mouse aiming)
  _v.set(ix, 1.0, iz).project(camera);
  playerScreen = { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };

  if (debugOn) updateDebug(p);
  hud.update(sim, dt);
  if (doRender) looks.render();
}

let impactFrame = -1, frameNo = 0, impactN = 0;
function handleEvents() {
  frameNo++;
  const p = sim.player;
  for (const e of sim.events) {
    switch (e.type) {
      case 'shot': {
        audio.play('shot');
        fx.muzzle(yola.muzzleWorld);
        fx.tracer(yola.muzzleWorld.x, yola.muzzleWorld.y, yola.muzzleWorld.z, e.ex, e.ez);
        if (e.hit === 'zombie' && !e.blocked) { fx.impactZombie(e.ex, e.ez, Math.sin(e.yaw), Math.cos(e.yaw), false); audio.play('bulletHit'); if (!e.killed) audio.play('zombieHurt'); } // (a round on the guard's shield: its own knock, no blood)
        else if (e.hit === 'wall') { fx.impactWall(e.ex, e.ez, e.nx, e.nz); audio.play('ricochet'); }
        shake(0.12);
        break;
      }
      case 'shotgun': {
        audio.play('shotgun');
        const mw = yola.muzzleWorld;
        fx.muzzle(mw, 1.8);
        let flesh = 0;
        for (const pl of e.pellets) {
          fx.tracer(mw.x, mw.y, mw.z, pl.ex, pl.ez, 0.6);
          if (pl.hit === 'zombie') { if (!e.blocked?.includes(pl.id) && flesh++ < 4) fx.impactZombie(pl.ex, pl.ez, Math.sin(e.yaw), Math.cos(e.yaw), false); }
          else if (pl.hit === 'wall' && Math.random() < 0.5) fx.impactWall(pl.ex, pl.ez, pl.nx, pl.nz);
        }
        if (flesh) audio.play('bulletHit', 1.3);
        // point blank: the blast lands as one heavy thump with a white flash on the body it struck (restrained: one per blast)
        const near = e.hits && e.closest < 2.6;
        if (near) { audio.play('shotgunClose'); const zc = sim.zombies.find((q) => q.id === e.closestId); if (zc) fx.hitFlash(zc.x - Math.sin(e.yaw) * 0.25, 1.1, zc.z - Math.cos(e.yaw) * 0.25, Math.sin(e.yaw), Math.cos(e.yaw), 1.5); }
        shake(near ? 0.7 : e.hits ? 0.5 : 0.35);
        // the camera kicks back against the shot
        if (shakeOn) { const k = 1.2 * tuning.shake; camState.vx -= Math.sin(e.yaw) * k; camState.vz -= Math.cos(e.yaw) * k; }
        setTimeout(() => audio.play('pump'), 240);
        break;
      }
      case 'swing': sim.stats.swings++; if (p.equipped !== 'bat' && !p.attacks[e.combo]?.windows) audio.play('swing', p.equipped === 'fists' ? 0.55 : e.combo === 1 ? 1.35 : 1); break;
      case 'whoosh': audio.play('swing', e.combo === 2 ? 1.3 : 1); break; // (the bat combo: timed to each strike) // (the second melee hit is the heavy one)
      case 'batHit': {
        if (e.shield) { if (shakeOn) { camState.vx += e.dirX * 0.9 * tuning.shake; camState.vz += e.dirZ * 0.9 * tuning.shake; } break; } // (on the guard's shield: the shieldHit event sounds it)
        const chop = e.style === 'chop';
        // one impact sound, one shake and one camera kick per frame however many are struck (a swing through three zombies
        // is one crack and one jolt, a little bigger, not three stacked); every body gets its own flash and spray
        const first = impactFrame !== frameNo;
        if (first) { impactFrame = frameNo; impactN = 0; audio.play(e.fist ? 'fistHit' : e.weapon === 'bat' ? 'batHit' : 'axeHit', chop || e.style === 'kick' || e.style === 'heavy' ? 1.3 : 1); }
        impactN++;
        fx.impactZombie(e.x, e.z, e.dirX, e.dirZ, impactN <= 3);
        fx.hitFlash(e.x - e.dirX * 0.18, chop ? 0.45 : 1.15, e.z - e.dirZ * 0.18, e.dirX, e.dirZ, (e.killed ? 1.3 : 1) * (e.style === 'heavy' || chop ? 1.2 : 1) * (e.fist ? 0.7 : 1));
        if (first) {
          shake(e.killed || chop ? 0.6 : 0.45);
          // the camera kicks along the blow (the follow spring brings it back); the chop kicks down-screen
          if (shakeOn) { const k = (e.killed ? 2.2 : 1.7) * (chop ? 1.3 : 1) * tuning.shake; camState.vx += e.dirX * k; camState.vz += e.dirZ * k; }
        } else if (impactN === 2) shake(0.12); // (a second body in the same swing: a touch more, never a stack)
        break;
      }
      case 'objective': hud.setObjective(OBJECTIVES[e.id] || ''); audio.play('swap'); break;
      case 'pickup': {
        audio.play(e.kind === 'health' ? 'heal' : 'reloadDone'); hud.flash('reload');
        if (e.id === 'bat') opening?.takeBat?.(); else arena.takePickup(e.id);
        hud.toast(e.kind === 'weapon' ? (e.weapon === 'pistol' ? 'Pistol — the guard’s sidearm' : 'Baseball bat') : e.kind === 'ammo' ? 'Spare pistol rounds' : 'First aid: health restored');
        break;
      }
      case 'checkpoint': levelSave = e.save; store.set('floor3save', e.save); break;
      case 'liftPower': arena.liftPowered(true); audio.play('power'); hud.toast('Lift power restored'); break;
      case 'unbrace': audio.play('unbrace'); break;
      case 'doorOpened': audio.play('doorOpen'); break;
      case 'bang': if (e.near < 11) { audio.play('bang', Math.max(0.25, 1 - e.near / 12)); arena.bang(e.door); if (Math.random() < 0.6) setTimeout(() => audio.play('groan', 0.7), 200); } break;
      case 'liftDoors': audio.play(e.open ? 'liftDing' : 'liftClose'); break;
      case 'levelComplete': input.clearAll(); input.enabled = false; store.set('floor3save', null); levelSave = null; hud.levelDone(sim); audio.play('clear'); break;
      case 'roomEnter': { const r = LAYOUT.rooms?.find((q) => q.id === e.room); if (r && r.id !== 'or') hud.banner(r.name); break; }
      case 'zombieWake': if (Math.random() < 0.6 && dist(e.id) < 12) audio.play('groan', 0.9); break;
      case 'dryFire': audio.play('dry'); hud.toast('Out of rounds'); break;
      case 'zombieBump': audio.play('bump', Math.min(1.2, e.speed / 3)); break;
      case 'zombieKnockdown': audio.play('knockdown'); break;
      case 'sprinterSpot': if (dist(e.id) < 14) audio.play('groan', 1.5); break; // her scream before the charge
      case 'zombieTumble': audio.play('knockdown'); if (dist(e.id) < 8) shake(0.15); break;
      case 'sprinterHit': audio.play('bump', 1.2); shake(0.5); break; // her charge ran into Yola
      case 'zombieSlam': { const d = Math.hypot(e.x - p.x, e.z - p.z); audio.play('knockdown', 1.4); fx.ring(e.x, e.z, 0xd8cfbf); fx.burst(e.x, 0.1, e.z, 16, 0xcfc6b4, 2.2, 0.8, 0.6); if (d < 7) shake(0.9 - d * 0.1); break; } // the guard's smash: dust, a ring, the floor shakes
      case 'playerDown': audio.play('knockdown'); shake(0.7); if (shakeOn) { camState.vx += e.dirX * 2.2; camState.vz += e.dirZ * 2.2; } break;
      case 'sever': audio.play('sever'); shake(0.15); break;
      case 'shieldHit': audio.play('shieldHit', e.kind === 'pistol' ? 0.7 : 1); fx.impactWall(e.x - e.dirX * 0.45, e.z - e.dirZ * 0.45, -e.dirX, -e.dirZ); if (e.kind !== 'pistol') shake(0.25); break;
      case 'shieldBreak': audio.play('shieldBreak'); fx.burst(e.x - e.dirX * 0.4, 1.1, e.z - e.dirZ * 0.4, 14, 0xd7e7e2, 2.4, 0.9, 0.55); shake(0.55); hud.popup('SHIELD BROKEN'); break;
      case 'headshot': audio.play('bulletHit', 1.5); shake(0.35); hud.popup('HEADSHOT'); break;
      case 'batMiss': audio.play('batMiss'); break;
      case 'batClank': audio.play('clank'); fx.impactWall(e.x, e.z, e.nx, e.nz); shake(0.2); break;
      case 'hitPause': hitPauseT = Math.max(hitPauseT, e.dur); break;
      case 'reloadStart': audio.play(e.weapon === 'shotgun' ? 'shellsStart' : 'reload'); hud.flash('reload'); break;
      case 'reloadDone': audio.play(e.weapon === 'shotgun' ? 'pump' : 'reloadDone'); break;
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
  const want = aspect < 1 ? tuning.camWidth : tuning.camWidth * 1.7; // metres of floor visible across at the player
  const D = THREE.MathUtils.clamp(want / (2 * Math.tan(hfov / 2)), 4, 22);
  const cy = THREE.MathUtils.degToRad(tuning.camYaw), fx = -Math.sin(cy), fz = -Math.cos(cy); // screen-up on the floor
  // modest look-ahead toward the aim; the camera never turns during play
  const la = (p.aiming ? 1 : 0.45) * tuning.lookAhead * (p.dead ? 0 : 1);
  camState.look.x += (Math.sin(yaw) * la - camState.look.x) * Math.min(1, dt * 3);
  camState.look.y += (Math.cos(yaw) * la - camState.look.y) * Math.min(1, dt * 3);
  // keep Yola in the lower-middle of a portrait screen (most threats arrive from up-screen)
  const up = aspect < 1 ? 1.4 : 0.6;
  let tx = px + camState.look.x + fx * up, tz = pz + camState.look.y + fz * up;
  const cb = LAYOUT.camBounds;
  if (cb) { tx = THREE.MathUtils.clamp(tx, cb.minX, cb.maxX); tz = THREE.MathUtils.clamp(tz, cb.minZ, cb.maxZ); }
  else {
    if (Math.abs(tuning.camYaw) < 1) { // straight-on: stop at the side walls
      const lim = Math.max(0, 7.4 - D * Math.tan(hfov / 2) + 0.8);
      tx = THREE.MathUtils.clamp(tx, -lim, lim);
    } else tx = THREE.MathUtils.clamp(tx, -6.2, 6.2);
    tz = THREE.MathUtils.clamp(tz, -9.2, aspect < 1 ? 6.6 : 7.6);
  }
  // critically damped follow
  const w = 7, k = w * w, c = 2 * w;
  camState.vx += (k * (tx - camState.x) - c * camState.vx) * dt; camState.vz += (k * (tz - camState.z) - c * camState.vz) * dt;
  camState.x += camState.vx * dt; camState.z += camState.vz * dt;
  const pitch = THREE.MathUtils.degToRad(tuning.camPitch);
  camera.position.set(camState.x - fx * Math.cos(pitch) * D, Math.sin(pitch) * D, camState.z - fz * Math.cos(pitch) * D);
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
    const s = meleeSegment(p.atk(), p.action.st, _seg), sy = Math.sin(p.aimYaw), cy = Math.cos(p.aimYaw);
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
    res: `${renderer.domElement.width}x${renderer.domElement.height}`, quality: resolvedQuality(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, physics: physics ? physics.name : 'off', physicsMsPerStep: physics?.stats.steps ? +(physics.stats.ms / physics.stats.steps).toFixed(3) : 0, physicsBodies: physics?.count() || 0,
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
  looks.render();
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
// Test hook: hold a stick input with Yola pinned in open floor and measure planted-foot slide (m/s,
// median per foot; ~0.1-0.3 is clean, >1 reads as skating). Directions are screen-relative.
function footSlide(mx, mz, ax = 0, az = -0.3, n = 120) {
  restart('calm');
  for (const z of sim.zombies) { z.x = 50; z.z = 50; z.solid = false; }
  const p = sim.player, V = THREE.Vector3, L = new V(), R = new V(), LT = new V(), RT = new V(), rows = [];
  window.game.scriptInput = () => ({ moveX: mx, moveZ: mz, aimX: ax, aimZ: az, swapPresses: 0 });
  for (let i = 0; i < n + 40; i++) {
    p.x = p.px = 0.4; p.z = p.pz = 0;
    tick(1, 1 / 60, false);
    if (i < 40) continue;
    const o = yola.outer.position;
    yola.worldPos('LeftFoot', L); yola.worldPos('RightFoot', R); yola.worldPos('LeftToeBase', LT); yola.worldPos('RightToeBase', RT);
    rows.push({ L: [L.x - o.x, Math.min(L.y, LT.y), L.z - o.z], R: [R.x - o.x, Math.min(R.y, RT.y), R.z - o.z], vx: p.vx, vz: p.vz });
  }
  window.game.scriptInput = null;
  const out = { speed: +Math.hypot(p.vx, p.vz).toFixed(2), hipYawDeg: Math.round((yola.hipYaw || 0) * 57.3) };
  for (const f of ['L', 'R']) {
    const minY = Math.min(...rows.map((r) => r[f][1])), s = [];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1][f], b = rows[i][f];
      if (a[1] < minY + 0.02 && b[1] < minY + 0.02) s.push(Math.hypot(b[0] - a[0] + rows[i].vx / 60, b[2] - a[2] + rows[i].vz / 60) * 60);
    }
    s.sort((a, b) => a - b);
    out[f] = +s[s.length >> 1].toFixed(2);
  }
  return out;
}
// Test hook: drive input fn(frame) with Yola pinned and report foot pops: the frame-to-frame
// acceleration of the feet (m/s^2; normal leg swing peaks ~300-400, a pop shows as 1000+).
function footPops(fn, frames) {
  restart('calm');
  for (const z of sim.zombies) { z.x = 50; z.z = 50; z.solid = false; }
  const p = sim.player, V = THREE.Vector3, L = new V(), R = new V(), rows = [];
  let i = 0;
  window.game.scriptInput = () => Object.assign({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, swapPresses: 0 }, fn(i));
  for (i = 0; i < frames; i++) {
    p.x = p.px = 0.4; p.z = p.pz = 0;
    tick(1, 1 / 60, false);
    const o = yola.outer.position;
    yola.worldPos('LeftFoot', L); yola.worldPos('RightFoot', R);
    rows.push([L.x - o.x, L.y, L.z - o.z, R.x - o.x, R.y, R.z - o.z]);
  }
  window.game.scriptInput = null;
  const acc = [];
  for (let k = 25; k < rows.length; k++) {
    const a = rows[k - 2], b = rows[k - 1], c = rows[k];
    const f = (o) => Math.hypot(c[o] - 2 * b[o] + a[o], c[o + 1] - 2 * b[o + 1] + a[o + 1], c[o + 2] - 2 * b[o + 2] + a[o + 2]) * 3600;
    acc.push([Math.max(f(0), f(3)), k]);
  }
  const s = acc.map((a) => a[0]).sort((a, b) => a - b), worst = acc.sort((a, b) => b[0] - a[0])[0];
  return { p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(worst[0]), atFrame: worst[1] };
}
window.game = { yolaModel: YOLA_MODEL, yolaClips: null, get hitPause() { return hitPauseT; }, yolaPose(dt, s) { yola.update(dt, s); }, fxAim(v) { fx.setAim(sim.player.x, sim.player.z, sim.player.aimYaw, v, 0); }, fxBurst(...a) { fx.burst(...a); }, musicStart(k) { music.start(k); }, music, stillYola(dt) { yola.update(dt, stillState(ROOM1.player.x, ROOM1.player.z, ROOM1.player.yaw)); }, hideZombieViews() { for (const v of zviews.values()) { v.hide(); zpool[v.type].push(v); } zviews.clear(); }, applyRoom1, applyLevel, get levelSave() { return levelSave; }, get arena() { return arena; }, cameraPose, previewRoom1, warmRoom1, stillState, hudShow(v) { document.getElementById('hud').style.display = v ? '' : 'none'; document.getElementById('touch').style.pointerEvents = v ? '' : 'none'; }, tick, shot, sheet, footSlide, footPops, simBat: (st, combo = 0) => meleeWorldSegment(sim.player, sim.player.attacks[combo], st, {}), cam(o) { camOverride = o; },  resume() { manualTicks = false; last = performance.now(); }, get sim() { return sim; }, set sim(v) {}, restart, perfReport, tuning, setPaused, uiAction, scriptInput: null, telegraphs, get looks() { return looks; }, get yola() { return yola; }, get physics() { return physics; }, zviews, lab: { kill: (...a) => physlab.kill(window.game, ...a), pile: (...a) => physlab.pile(window.game, ...a), sever: (...a) => physlab.sever(window.game, ...a), blast: (...a) => physlab.blast(window.game, ...a), combo: (...a) => physlab.combo(window.game, ...a) }, get pieces() { return ZombieView.pieces; }, THREE, camera, renderer, scene };
hud.perfReport = perfReport;
load().catch((e) => { console.error(e); hud.error(String(e)); });
