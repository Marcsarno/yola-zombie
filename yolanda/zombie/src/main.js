// Combat benchmark entry point: loads the hospital wing, Yola and the zombie, runs the fixed-step sim.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sim, STEP, DODGE_CUE } from './core/sim.js';
import { makeTuning } from './core/tuning.js';
import { setMeleePaths, meleeSegment, BAT_DEF, WOOD_BAT_DEF, PACK_AXE_DEF, BAT_PROFILE, useBuiltBat } from './core/weapons.js';
import { buildLibraryAttack } from './render/libattack.js';
import { setupNewMoves } from './render/newmoves.js';
import { setupSlideFinisher } from './render/slidefin.js';
import { AcidPools } from './render/acid.js';
import { radioFit } from './render/radiohold.js';
import { caseFit } from './render/casecarry.js';
import { LAYOUT, ROOM1, useLevel, useFloor, levelForMode } from './core/layout.js';
import { ktxLoader, loadKtxList, ktxPath } from './hood/ktx.js';
import { Arena } from './render/arena.js';
import { YolaView, ZombieView } from './render/clipchars.js';
import { FX } from './render/fx.js';
import { GibBurst } from './render/gibburst.js';
import { Telegraphs } from './render/telegraph.js';
import { Looks, LOOKS } from './render/looks.js';
import { LiveScreens } from './render/screens.js';
import { CombatAudio } from './audio.js';
import { GameMusic } from './music.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { angleDiff } from './core/world.js';
import { meleeWorldSegment, VAULT, VAULT_SHOTS } from './core/player.js';
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
import { loadHoldLayers } from './render/holdlayers.js';
import { ChapterUI } from './ui/chapter.js';
import { ThreatCue } from './render/threatcue.js';
import { FinishMarks } from './render/finishmark.js';
import { RoomsView } from './render/rooms.js';
import { loadRoomProps } from './render/roomprops.js';
import { cue } from './sfx/cues.js';
import { SlowMotion } from './render/slowmo.js';
import { ExecDirector } from './render/execution.js';
import { Atmos } from './render/atmos.js';
import { LightKit } from './render/lightkit.js';
import { chapterLightPlan } from './render/floorlights.js';
import { shareTextures, texturesOf } from './render/texshare.js';
import { setupLibWeapons } from './render/libweapons.js';
import { startDemos } from './demos.js';
import { startHood } from './hood/hood.js';
import { groundY as hoodGroundY } from './hood/layout.js';

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
// (PERF_AUDIT.md 7, phones) no MSAA on a sharp phone screen (1.5x pixels or more: the density hides the steps, and MSAA
// multiplies the pixel work), and the plain PCF shadow filter instead of the soft one (fewer samples on every lit pixel)
const hiDpiPhone = isMobile && devicePixelRatio >= 1.5 && resolvedQuality() !== 'high'; // (quality High: everything on, the user's call on their phone)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: resolvedQuality() !== 'low' && !hiDpiPhone, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = resolvedQuality() !== 'low';
renderer.shadowMap.type = isMobile && resolvedQuality() !== 'high' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // the environment is static: render its shadows once
// what goes wrong on a phone, on screen (2026-10-18: the game ran but drew nothing on the user's iPhone, Safari and Edge;
// a phone has no console): a script error, or the phone resetting the graphics (WebGL context lost: usually out of
// graphics memory). A red strip near the bottom; tap it to reload.
const diag = (() => {
  let el = null;
  return (msg) => {
    if (!el) { el = document.createElement('div'); el.style.cssText = 'position:fixed;left:6px;right:6px;bottom:96px;z-index:10000;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#fff;background:rgba(130,10,10,0.9);padding:6px 8px;border-radius:6px;white-space:pre-wrap'; el.onclick = () => location.reload(); document.body.appendChild(el); }
    el.textContent = msg + '\n(tap here to reload)';
  };
})();
canvas.addEventListener('webglcontextlost', () => diag('The phone reset the graphics (WebGL context lost): usually out of graphics memory. Quality: ' + resolvedQuality() + ', pixel ratio ' + renderer.getPixelRatio()));
canvas.addEventListener('webglcontextrestored', () => { renderer.shadowMap.needsUpdate = true; diag('The graphics came back (context restored).'); });
window.addEventListener('error', (e) => diag('Error: ' + (e.message || e.error) + '\n' + String(e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno));
window.addEventListener('unhandledrejection', (e) => diag('Error (async): ' + (e.reason?.message || e.reason) + '\n' + String(e.reason?.stack || '').split('\n').slice(0, 2).join('\n')));
const scene = new THREE.Scene();
// (PERF_AUDIT.md 1) the renderer's per-frame transform pass walks only what can be drawn: three.js updates every object,
// hidden or not, and over half the scene is hidden (pooled zombies, the opening's sets, other floors): 6.7 -> 2.2 ms on
// the PC at phone settings. A hidden group refreshes when shown (its own matrix update forces its children); explicit
// calls (getWorldPosition, updateMatrixWorld on an object) are untouched.
scene.updateMatrixWorld = function (force) { visibleMatrixWorld(this, force); };
function visibleMatrixWorld(o, force) {
  if (o.matrixAutoUpdate) o.updateMatrix();
  if (o.matrixWorldNeedsUpdate || force) {
    if (o.matrixWorldAutoUpdate === true) { if (o.parent === null) o.matrixWorld.copy(o.matrix); else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix); }
    // (what three.js's own updateMatrixWorld overrides add, skipped by doing it inline: an attached skinned mesh's bind
    // inverse follows it, or a character placed away from where it was built draws off in space: the opening's whole
    // cast vanished, 2026-10-19; a camera inside the scene keeps its view matrix)
    if (o.isSkinnedMesh && o.bindMode === 'attached') o.bindMatrixInverse.copy(o.matrixWorld).invert();
    else if (o.isCamera) o.matrixWorldInverse.copy(o.matrixWorld).invert();
    o.matrixWorldNeedsUpdate = false; force = true;
  }
  const ch = o.children;
  for (let i = 0, n = ch.length; i < n; i++) { const c = ch[i]; if (c.visible) visibleMatrixWorld(c, force); else if (force) c.matrixWorldNeedsUpdate = true; } // (a skipped child whose parent moved catches up when shown)
}
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
let looks = null, atmos = null, lightkit = null; // lighting looks (render/looks.js): the ☀ button cycles them
// (2026-10-19, the user: "bake it all in and apply the lighting through each level") the lighting lab's picks on the story
// floors (LAB_PICKS in demos.js: the baked floor light, the fittings with their tubes hidden, EXIT signs, the polished floor,
// the muzzle flash, Yola's own shadow, character light 0.45; splatter, haze and impact frames), from the hand-off on: the
// opening and its reveal keep the look they were signed off with
const STORY_LIGHT = ['fixtures', 'baked', 'exit', 'polish', 'muzzle', 'yshadow'], STORY_ATMOS = ['splatter', 'haze', 'impact'];
let storyLit = false;
function storyLighting(on) {
  storyLit = on;
  if (on) { lightkit.setTubes(false); lightkit.setCharLight(0.45); }
  for (const k of STORY_LIGHT) lightkit.set(k, on);
  for (const k of STORY_ATMOS) atmos.set(k, on);
  if (on) lightkit.setFloor(LAYOUT.floor);
}
addEventListener('resize', resize); resize();

// ---------- systems ----------
const tuning = makeTuning(store.get('tuning', null));
const audio = new CombatAudio();
audio.setVolume(store.get('volume', 0.8)); audio.setMuted(store.get('muted', false));
for (const b of ['sfx', 'music', 'voice']) { audio.levels[b] = store.get('lvl_' + b, audio.levels[b]); audio.busMuted[b] = store.get('mute_' + b, false); }
audio.setModern(store.get('sfxModern', true)); // (pause menu: new recorded effects / the classic synthesised set)
// where a sound sits: left/right from its place on screen (the camera never turns, so screen left is the left ear), and
// its distance from Yola (fainter, duller, more room)
const _ap = new THREE.Vector3();
audio.spatial = (x, z) => { _ap.set(x, 1, z).project(camera); return { pan: Math.max(-0.85, Math.min(0.85, _ap.x * 0.7)), d: Math.hypot(x - sim.player.x, z - sim.player.z) }; };
const music = new GameMusic(audio); // the supplied combat track: explore / combat with hysteresis (music.js)
const fx = new FX(scene);
// the full burst on big finishing blows (render/gibburst.js): one model per zombie type that has one (0 nurse, 1 patient)
const gibs = new GibBurst(scene, new GLTFLoader().setKTX2Loader(ktxLoader(renderer)), fx);
const telegraphs = new Telegraphs(scene); // zombie attack wedges on the floor
const threatCue = new ThreatCue(scene); // the sign over a special enemy's big attack (render/threatcue.js)
const finishMarks = new FinishMarks(scene); // the gold mark over a zombie open to a finisher (render/finishmark.js)
const acid = new AcidPools(scene, fx); // the lady's acid pools (render/acid.js)
const roomsView = new RoomsView(scene, fx, audio); // cracked walls, the flood, the MRI magnet (render/rooms.js)
loadRoomProps(); // (their Blender models, and the oxygen cylinders': render/roomprops.js)
fx.gore = store.get('gore', true);
let shakeOn = true;
const hud = new Hud({ tuning, audio, store, onAction: (a, v) => uiAction(a, v) });
const input = new Input(document.getElementById('touch'), {
  swapButton: document.getElementById('swapBtn'),
  getPlayerScreen: () => playerScreen,
});
const unlockAudio = () => { audio.init(); music?.prime?.(); }; // (music.prime: the iPhone lets the gameplay track start later only if it first played inside a tap)
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

let arena, yola, sim, hood = null;
const zviews = new Map(); const zpool = [[], [], [], [], [], [], [], [], [], [], []]; // (one pool per ZOMBIE_TYPES entry)
// (2026-10-24) Chapter 2's zombies animate at a rate by where they are: every frame near Marc, every 2nd beyond 14 m, every 4th
// off screen (clipchars.js ZombieView.update: only while they walk; ?zthrottle=0 or game.zThrottle = false for the old way)
let zThrottle = params.get('zthrottle') !== '0'; // (with LAYOUT.hood, read each frame: the layout is chosen after this runs)
const zFrustum = new THREE.Frustum(), zPV = new THREE.Matrix4(), zSphere = new THREE.Sphere();
const storyStart = params.has('intro') || params.has('reveal') || params.has('room1');
let mode = storyStart ? 'room1' : params.get('mode') || 'encounter', benchN = +(params.get('n') || 10);
useLevel(levelForMode(mode)); // the story's chapter (Floors 7, 6, 5), or the combat wing for practice, waves and benchmarks
let levelSave = store.get('chapter1save', null); // the latest chapter checkpoint (retry restores it)
if (levelSave && levelSave.v !== 2) levelSave = null; // (an old Floor 3 save does not fit the new floors)
const HIT_SLOW = 0.2; // time runs at this rate through a hit-stop
const YOLA_AHEAD = 0.38; // in slow motion Yola gets back this share of the speed the world loses (world 0.3: her 0.57)
let paused = false, hitPauseT = 0, acc = 0, last = performance.now(), playerScreen = null;
const camState = { x: 0, z: 0, vx: 0, vz: 0, trauma: 0, look: new THREE.Vector2() };
const perf = { frames: [], cpu: [], spikes: 0, t0: performance.now() };
// the GPU's own time for a frame (EXT_disjoint_timer_query_webgl2: most Android phones and desktops; not iOS): one frame in
// ten is timed, read back a few frames later. null: unknown (then the frame's JS time decides, see perfSample)
const gpuTimer = (() => {
  const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return null;
  let q = null, n = 0; const out = [];
  return {
    begin() { if (q || ++n % 10) return false; q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return true; },
    end(on) { if (on) gl.endQuery(ext.TIME_ELAPSED_EXT); },
    poll() { if (!q || !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return; if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); if (out.length > 20) out.shift(); } gl.deleteQuery(q); q = null; },
    avg() { return out.length ? out.reduce((a, b) => a + b, 0) / out.length : null; },
  };
})();

// ---------- loading ----------
// Characters: Tripo meshes (mixamorig skeleton) with Mixamo/Tripo clips, exported by blender/export_chars.py.
// (Yola's locomotion speeds are measured from foot plants at load, see YolaView.measureGaits.)
const ZOMBIE_TYPES = [
  { file: 'assets/zombie-nurse-mod.glb', extra: ['assets/zombie-nurse-scratch.glb', 'assets/zombie_moves/nurse-mod.glb', 'assets/zombie_moves/nurse-mod-b.glb', 'assets/zombie_moves/nurse-mod-c.glb'], height: 1.78, walk: { speed: 0.168 } }, // modular: severable head, forearms, lower legs
  { file: 'assets/zombie-patient-mod.glb', extra: ['assets/zombie-patient-scratch.glb', 'assets/zombie_moves/patient-mod.glb', 'assets/zombie_moves/patient-mod-b.glb', 'assets/zombie_moves/patient-mod-c.glb', 'assets/zombie_moves/patient-bedrise.glb'], height: 1.68, walk: { speed: 0.174 } },
  // tools/anim/build_zombie.py: the sprinter (the big lady; hand weights fixed) and the big guard (a stand-in shield until his
  // bed-panel shield is modelled). Not modular: no limbs come off them yet.
  { file: 'assets/zombie-sprinter.glb', extra: ['assets/zombie_moves/sprinter.glb', 'assets/zombie_moves/sprinter-b.glb'], height: 2.2, walk: { speed: 0.168 }, sprint: 4.3, girth: 1.7 }, // (15% bigger than first built: she has to feel big)
  { file: 'assets/zombie-guard.glb', extra: ['assets/zombie_moves/guard.glb', 'assets/zombie_moves/guard-b.glb'], height: 2.05, walk: { speed: 0.168 }, shield: true, girth: 1.4 },
  // the runner (2026-10-18, the user: "an orange-clothed variant of the existing nurse zombie ... the faster enemy"): the
  // nurse's own model and clips, her blue scrubs turned orange at load (orangeScrubs), core/zombies.js KINDS.runner
  { same: 0, height: 1.78, walk: { speed: 0.168 }, orange: true },
  // Chapter 2's street zombies (2026-10-20, the user picked them from the Mixamo downloads: "add those in place of the
  // hospital-type zombies"): Romero and Zombiegirl, made light by tools/anim/mixamo_zombie_prep.py (12k / 7.4k triangles,
  // base colour at 1024), then tools/anim/build_zombie.py and test_zombie_clips.py as the sprinter. Loaded only in Chapter 2;
  // there they stand in for the nurse, the patient and the runner. Cut apart as the hospital's (2026-10-22, the user: "get
  // them more like chapter 1"): tools/anim/cut_zombie.py makes the -mod files, modular (head, forearms, lower legs come off
  // with wound caps) and their own burst models; the move packs carry the nurse's set (test_zombie_clips.py).
  { file: 'assets/zombie-romero-mod.glb', extra: ['assets/zombie_moves/romero.glb'], height: 1.78, walk: { speed: 0.168 }, hood: true },
  { file: 'assets/zombie-zombiegirl-mod.glb', extra: ['assets/zombie_moves/zombiegirl.glb'], height: 1.68, walk: { speed: 0.174 }, hood: true },
  // the Zombie Male AAB (Unity Asset Store, free; 2026-10-20, the user: "put him in the neighbourhood chapter ... as one of
  // the regular zombies, mixed in with the others"): unpacked and built 1.0 tall with his head bone set upright, then
  // tools/anim/build_zombie.py (--no-normals --opaque ZombieMale_Shirt_MAT_V1) and test_zombie_clips.py (the nurse set).
  // 21k triangles, 5.5 MB. Not modular. The street zombies take turns: Romero, Zombiegirl, him.
  { file: 'assets/zombie-male-aab.glb', extra: ['assets/zombie_moves/male-aab.glb'], height: 1.80, walk: { speed: 0.168 }, hood: true },
  // ordinary people turned (2026-10-21, the user: "regular people zombies ... mixed in with the others"): the survivors
  // Remy, Bryce and David retextured by tools/anim/zombify_skin.py (David in a light shirt and jeans) with the zombie set
  // from tools/anim/build_zombie.py (Remy --upright), cut apart by tools/anim/cut_zombie.py as Romero and Zombiegirl, with
  // the nurse's move pack. 8: Remy, 9: Bryce, 10: David.
  { file: 'assets/survivors/zombified/remy-zombie-mod.glb', extra: ['assets/zombie_moves/remy-zombie.glb'], height: 1.80, walk: { speed: 0.168 }, hood: true },
  { file: 'assets/survivors/zombified/bryce-zombie-mod.glb', extra: ['assets/zombie_moves/bryce-zombie.glb'], height: 1.78, walk: { speed: 0.172 }, hood: true },
  { file: 'assets/survivors/zombified/david-zombie-mod.glb', extra: ['assets/zombie_moves/david-zombie.glb'], height: 1.80, walk: { speed: 0.168 }, hood: true },
];
// her scrubs' blue (hue ~165-250) recoloured, the rest of the texture (skin, hair, blood) untouched; once per map and recipe.
// (2026-10-18, the user: "show me 4 different clothing variations ... nurse scrub color ... keep the orange look"; of the
// lineup they kept her own blue, navy and charcoal for the nurses, orange for the runner: "i don't want the purple.. or the
// green or the red"). H: the new hue, s: saturation (null: the original's, boosted), l: [scale, add, max] on the lightness
const SCRUBS = {
  orange: { H: 22, s: null, l: [0.92, 0.04, 0.62] },   // the runner's safety orange
  navy: { H: 224, s: 0.55, l: [0.42, 0.02, 0.32] },     // charge nurse navy
  charcoal: { H: 210, s: 0.06, l: [0.40, 0.03, 0.30] }, // agency charcoal
};
const NURSE_SCRUBS = [null, 'navy', 'charcoal']; // (null: her own blue) one each in turn, by the zombie's id
const nurseScrubs = (z) => (z.scrubs !== undefined ? z.scrubs : z.prop === 'surgeon' ? 'navy' : NURSE_SCRUBS[z.id % NURSE_SCRUBS.length]); // (the surgeon: theatre navy under the cap)
function bindView(v, z) { v.bind(z); if (v.type === 0) setScrubs(v, nurseScrubs(z)); } // (a pooled nurse view takes the colour of the zombie it shows)
const _scrubMaps = new Map();
function scrubsTexture(tex, key) {
  const R = SCRUBS[key];
  if (!tex?.image || !R) return tex;
  const ck = key + ':' + tex.uuid; if (_scrubMaps.has(ck)) return _scrubMaps.get(ck);
  const img = tex.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), dl = mx - mn;
    if (dl < 0.06 || mx < 0.06) continue;
    let h = mx === r ? ((gg - b) / dl) % 6 : mx === gg ? (b - r) / dl + 2 : (r - gg) / dl + 4; h = (h * 60 + 360) % 360;
    if (h < 165 || h > 250) continue;
    const l = (mx + mn) / 2, s = R.s ?? Math.min(1, (dl / (1 - Math.abs(2 * l - 1) || 1)) * 1.6 + 0.2);
    const H = (R.H + (h - 205) * 0.12 + 360) % 360, L = Math.min(R.l[2], l * R.l[0] + R.l[1]);
    const C = (1 - Math.abs(2 * L - 1)) * s, X = C * (1 - Math.abs(((H / 60) % 2) - 1)), m = L - C / 2, k6 = Math.floor(H / 60) % 6;
    const [rr, g2, bb] = [[C, X, 0], [X, C, 0], [0, C, X], [0, X, C], [X, 0, C], [C, 0, X]][k6];
    d[i] = (rr + m) * 255; d[i + 1] = (g2 + m) * 255; d[i + 2] = (bb + m) * 255;
  }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  for (const k of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'channel', 'anisotropy']) t[k] = tex[k];
  t.needsUpdate = true; _scrubMaps.set(ck, t);
  return t;
}
const orangeScrubs = (tex) => scrubsTexture(tex, 'orange');
function setScrubs(view, key) { view.model.traverse((o) => { if (o.isMesh && o.material?.map) { o.userData.baseMap ??= o.material.map; o.material.map = key ? scrubsTexture(o.userData.baseMap, key) : o.userData.baseMap; o.material.needsUpdate = true; } }); }
// (extra: clips retargeted onto each type's own skeleton: the scratch, tools/anim/zombie_clip.py; the Quaternius UAL zombie
// walks, run, bite and hit flinches, tools/anim/test_zombie_clips.py, UAL_PACKS.md)
const viewType = (z) => (z.kind === 'sprinter' ? 2 : z.kind === 'guard' ? 3 : LAYOUT.hood ? 5 + (z.id % 6) : z.kind === 'runner' ? 4 : z.prop === 'surgeon' || z.look === 'nurse' ? 0 : z.prop === 'bed' || z.look === 'patient' ? 1 : z.id % 2);
// Chapter 2 is Marc's (2026-10-20, the user: "swap Marc in for the playable character in chapter 2"): outside the hospital
// the hero is Marc (assets/male1.glb: Yola 3.0's clips retargeted onto him, tools/anim/male1_build.py), 1.80 m; ?hero=yola
// keeps Yola there. He gets no posture fix (the Rig Lab shows him without it). The fits the user has not set for him yet
// (Rig Lab key male1) borrow Yola 3.0's.
const MARC = !!LAYOUT.hood && params.get('hero') !== 'yola';
const YOLA_HEIGHT = MARC ? 1.80 : 1.62;
// which Yola plays (2026-10-16): 1 = the original model, 2 = the user's new Tripo model (testing; tools/anim/yola2_build.py).
// The pause menu's Yola choice (remembered), or ?yola=2. The opening keeps its own Yola either way.
const YOLA_MODEL = MARC ? 'marc' : params.get('yola') || store.get('yolaModel', '2'); // (2026-10-16 brief: Yola 3.0, the new model, is the hero by default)
const HERO_KEY = MARC ? 'male1' : YOLA_MODEL === '2' ? 'yola2' : 'yola'; // (the Rig Lab's character key: the fits are kept under it)
const YOLA_FILES = MARC ? { model: 'assets/male1.glb', extra: ['assets/male1_ual.glb', 'assets/neighborhood/moves/marc-hood.glb'], data: 'assets/clipdata_yola2.json' } // (Marc: the same clips as Yola 3.0, so her clip data)
  : YOLA_MODEL === '2' ? { model: 'assets/yola2.glb', extra: ['assets/yola2_ual.glb'], data: 'assets/clipdata_yola2.json' } // (yola2_ual: the Quaternius UAL moves, UAL_PACKS.md)
  : { model: 'assets/yola.glb', extra: ['assets/yola_combo.glb', 'assets/yola_extra.glb', 'assets/yola_sword.glb'], data: 'assets/clipdata.json' };
// Marc's missing fits: Yola 3.0's, in a fit file ({fit: {yola2, male1}}) or a prefixed one ({'yola2:<clip>': ...})
function heroFits(j) {
  if (!MARC || !j || typeof j !== 'object') return j;
  for (const [k, v] of Object.entries(j)) {
    if (v && typeof v === 'object' && v.yola2 && !v.male1) v.male1 = v.yola2;
    if (k.startsWith('yola2:') && !j['male1:' + k.slice(6)]) j['male1:' + k.slice(6)] = v;
  }
  return j;
}
const loader = new GLTFLoader(); loader.setKTX2Loader(ktxLoader(renderer)); // (Chapter 2's KTX2 pictures: hood/ktx.js)
// a Chapter 2 zombie's file: its KTX2 copy when tools/hood/ktx2.mjs made one (opt/ktx/zombies/<name>)
const zombieFile = (t) => (LAYOUT.hood && t.hood && ktxPath('zombies/' + t.file.split('/').pop())) || t.file;
async function load() {
  if (LAYOUT.hood) await loadKtxList();
  gibs.load({ 0: 'assets/zombie-nurse-burst.glb', 1: 'assets/zombie-patient-burst.glb', ...(LAYOUT.hood ? { 7: zombieFile(ZOMBIE_TYPES[7]) } : {}) }); // (in the background: until it is in, kills die as before) (the Zombie Male AAB's cut-apart body is its own burst model)
  audio.preload(); // (the recorded effect banks: small, fetched now, decoded on the first tap)
  music.preload(); // (the gameplay track buffers while the game loads: it starts the moment the reveal hands over)
  hud.loading(0);
  arena = new Arena(scene, resolvedQuality(), renderer);
  atmos = new Atmos(scene, fx, arena); // (the lighting upgrades, each switchable: render/atmos.js, demo=lighting)
  lightkit = new LightKit(scene, fx, arena, tuning.camYaw); // (the plan's picked upgrades: render/lightkit.js)
  if (LAYOUT.story) lightkit.usePlan(chapterLightPlan()); // (the chapter's floors: render/floorlights.js)
  ZombieView.eyeCfg.light = (x, z) => lightkit.lightAt(x, z);
  looks = new Looks(renderer, scene, camera); looks.set(store.get('look', 'standard'));
  document.getElementById('lookBtn')?.addEventListener('click', () => {
    const i = (LOOKS.findIndex(([k]) => k === looks.key) + 1) % LOOKS.length, [k, label] = LOOKS[i];
    looks.set(k); store.set('look', k); hud.toast('Look: ' + label);
    clearTimeout(looks.fpsT); looks.fpsT = setTimeout(() => { const f = perf.frames.slice(-90), avg = f.reduce((a, b) => a + b, 0) / (f.length || 1); hud.toast(label + ' · ' + Math.round(1000 / avg) + ' fps'); }, 2500);
  });
  // Yola, plus the clips authored outside her model file (the bat combo: skeleton-only, same bone names)
  const yolaP = Promise.all([loader.loadAsync(YOLA_FILES.model), ...YOLA_FILES.extra.map((f) => loader.loadAsync(f).catch(() => null))]).then(([g, ...xs]) => { for (const x of xs) if (x) g.animations.push(...x.animations); return g; });
  // (each type's extra clips, the scratch, are retargeted onto its own skeleton: tools/anim/zombie_clip.py)
  const zomP = Promise.all(ZOMBIE_TYPES.map((t) => t.same != null || (t.hood && !LAYOUT.hood) ? null : Promise.all([loader.loadAsync(zombieFile(t)).catch(() => loader.loadAsync(t.file)), ...(t.extra || []).map((f) => loader.loadAsync(f).catch(() => null))]).then(([g, ...xs]) => { for (const x of xs) if (x) g.animations.push(...x.animations); return g; })));
  // (Chapter 2's street zombies are their own burst models: the loaded model itself, so its textures are not loaded twice)
  if (LAYOUT.hood) zomP.then((gs) => gibs.load(Object.fromEntries([5, 6, 8, 9, 10].filter((i) => gs[i]).map((i) => [i, gs[i]])))).catch(() => {});
  const dataP = fetch(YOLA_FILES.data).then((r) => r.json());
  // the guard's shield (the user's v2 package): the GLB and the two damage maps, loaded once and shared by every guard
  const shieldP = Promise.all([loader.loadAsync('assets/shield/modular_bed_shield.glb'), loadDamageTextures(new URL('assets/shield/', location.href))])
    .then(([gltf, damageTextures]) => { ZombieView.shieldAsset = { gltf, damageTextures }; }).catch((e) => console.warn('shield asset failed: stand-in shield', e));
  const wpnP = Promise.all([loader.loadAsync('assets/weapons/pump_short.glb'), loader.loadAsync('assets/weapons/fire_axe.glb'), loader.loadAsync('assets/weapons/shotgun_shell.glb'),
    loader.loadAsync('assets/weapons/pistol_core.glb').catch(() => null),
    loader.loadAsync('assets/weapons/pistol_mag_empty.glb').catch(() => null), loader.loadAsync('assets/weapons/pistol_mag_loaded.glb').catch(() => null), // (the reload's magazines)
    fetch('assets/hold/pistol_fit.json').then((r) => r.json()).then(heroFits).catch(() => ({})), // (the user's pistol fit per character, set in the Rig Lab)
    loader.loadAsync(WOOD_BAT_DEF.file).catch(() => null), loader.loadAsync(PACK_AXE_DEF.file).catch(() => null)]); // (the wood bat and the pack's axe: setupBat)
  // the hospital's own zombies' things (render/clipchars.js IV / CHAIR / wearSurgeonKit): the stand and the chair at the
  // level's sizes (prop footprints in core/chapter.js), the cap and mask as built
  const fitProp = (g, hgt) => { const o = g.scene, b = new THREE.Box3().setFromObject(o), s = hgt / (b.max.y - b.min.y), c = b.getCenter(new THREE.Vector3()); const w = new THREE.Group(); o.scale.setScalar(s); o.position.set(-c.x * s, -b.min.y * s, -c.z * s); w.add(o); w.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } }); return w; }; // (they move: the shadow map is drawn once for the still scenery, so a cast shadow stayed where they started)
  const propP = Promise.all([loader.loadAsync('assets/hospital/iv_stand.glb').then((g) => { ZombieView.propSrc.iv = fitProp(g, 2.03); }),
    loader.loadAsync('assets/hospital/wheelchair.glb').then((g) => { ZombieView.propSrc.chair = fitProp(g, 0.97); }),
    loader.loadAsync('assets/hospital/recovery_bed_open_nx.glb').then((g) => { ZombieView.propSrc.bedOpen = fitProp(g, 0.87); }), // (the demo's bed)
    loader.loadAsync('assets/props/surgeon_cap.glb').then((g) => { ZombieView.propSrc.cap = g.scene; })].map((q) => q.catch((e) => console.warn('prop', e))));
  const breachP = loader.loadAsync('assets/props/floor_breach.glb').then((g) => { breaches.src = g.scene; g.scene.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; } }); }).catch(() => {}); // (blender/make_floor_breach.py)
  loadHoldLayers(); // (the user's hold-layer switches, render/holdlayers.js)
  await arena.loadProps(loader, (k) => hud.loading(k * 0.7));
  arena.playLook(); // (the practice wing: the chapter's surfaces and lighting)
  const [yg, zgs, clipdata, [sgG, axeG, shellG, pistolG, magEmptyG, magLoadedG, pistolFits, woodBatG, packAxeG]] = await Promise.all([yolaP, zomP, dataP, wpnP, shieldP, propP]);
  hud.loading(0.95);
  setMeleePaths(clipdata, YOLA_HEIGHT / clipdata.heights.YOLA, clipdata.hips_rest);
  yola = new YolaView(scene, yg, clipdata, { shotgun: sgG, axe: axeG, shell: shellG, pistol: pistolG, magEmpty: magEmptyG, magLoaded: magLoadedG, pistolFit: pistolFits[HERO_KEY], height: YOLA_HEIGHT });
  yola.addAttackClips(yg.animations.filter((c) => c.name === 'yola_knockdown' || c.name === 'yola_getup' || c.name === 'ual_KipUp')); // (tools/anim/yola_clips.py: knocked flat, getting up)
  setupBat(yg.animations, await fetch('assets/hold/weapon_fit.json').then((r) => r.json()).then(heroFits).catch(() => ({})), woodBatG, packAxeG); window.game.yolaClips = yg.animations;
  await setupLibWeapons({ yola, loader, scene, clips: yg.animations, who: HERO_KEY }).catch((e) => console.warn('library weapons', e)); // (the sledgehammer, crowbar, knife)
  ZOMBIE_TYPES.forEach((t, i) => (t.gltf = zgs[t.same ?? i]));
  renderer.shadowMap.needsUpdate = true;
  screens.scan(scene); // the monitors' live faces (the opening's clinic is scanned once it has loaded)
  if (LAYOUT.hood) { hood = await startHood({ scene, loader, arena, renderer, quality: resolvedQuality(), params, audio, hud, fx, onProgress: (k) => hud.loading(0.95 + 0.04 * k) }); window.game.onRestart = hood.onRestart; } // (Chapter 2, the neighbourhood: src/hood/)
  // (2026-10-21) a blood pool lies on the ground under it: the neighbourhood's roads, drives, walks and pavers stand 2-5 cm
  // over the lawn, and at the hospital floor's height every pool on a road lay hidden under it
  if (LAYOUT.hood) {
    const flat = []; scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && /^(ch2_\w*(road|kerb|drive|rab)|roads|sidewalks|driveway|home_walk|paver|pool_deck|curb|tennis_court|terrain)/.test(o.name)) flat.push(o); });
    const rc = new THREE.Raycaster(), from = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    fx.groundAt = (x, z) => { rc.set(from.set(x, 0.6, z), down); rc.far = 0.8; const h = rc.intersectObjects(flat, false)[0]; return Math.max(h ? h.point.y : 0, hoodGroundY(x, z)); }; // (and the houses' floors, the stoop, the dock)
  }
  restart();
  startChapterUI();
  hud.loading(1);
  if (params.has('intro') || params.has('reveal') || params.has('room1')) await startOpening();
  if (mode === 'arena') window.game.testArena = await startTestArena({ game: window.game, scene, loader, telegraphs }); // the weapon test arena (combat.html?mode=arena)
  // spare zombie views, built now (behind the loading screen): a zombie that arrives mid-fight (out of the floor, through a
  // door) takes one from the pool; building one then cost ~100 ms, a visible hitch (2026-10-18)
  prepViews();
  await breachP; if (breaches.src) { const w = breaches.src.clone(true); w.visible = false; w.position.y = -50; scene.add(w); } // (compiled with the rest: its first breach mid-fight froze a frame)
  window.game.texShare = shareTextures(scene, renderer); // (PERF_AUDIT.md 6: one GPU copy per image, all uploaded now)
  if (LAYOUT.story) lightkit.prepareYShadow(); // (in the scene from the start: render/lightkit.js)
  warmPrograms();
  if (LAYOUT.story) { storyLighting(true); warmPrograms(); storyLighting(!opening?.active); } // (the story lighting's shaders too, behind the loading screen: switching it on at the hand-off froze a frame for 2.8 s)
  requestAnimationFrame(frame);
  if (params.has('lab')) startLab(window.game, params.get('lab') || 'bat'); // the combat lab (frame-by-frame melee against the reference)
  if (params.has('inspect')) window.game.inspect = startInspect(window.game); // free camera on Yola's weapon holds (src/inspect.js)
  if (params.has('demo')) startDemos(window.game, params.get('demo'), params.get('auto') === '1'); // repeatable examples (src/demos.js)
}
// The bat: Quaternius's Sword Regular Combo (one-handed, four strikes), built on the Yola that plays, the bat in her right
// fist and the matching Sword Idle as its stance (src/render/libattack.js). Without the clip the older bat combo stays.
// a clip held on its first frame (two keys, the same pose): an idle stance taken from one frame of a clip
function holdFrame(clip, name) {
  const tracks = clip.tracks.map((t) => { const n = t.getValueSize(), v = Array.from(t.values.slice(0, n)); return new t.constructor(t.name, [0, 1], [...v, ...v]); });
  return new THREE.AnimationClip(name, 1, tracks);
}
function setupBat(anims, fits = {}, woodG = null, axeG = null) {
  const who = HERO_KEY;
  yola.axeFit = fits.axe?.[who] || null; yola.shotgunFit = fits.short?.[who] || null; // (the axe's and shotgun's fits, same Rig Lab file)
  // (a clip's own shotgun fit, "short@<clip>": the shotgun slide finisher's kneel setup, render/clipchars.js shotgunClip)
  yola.shotgunClipFits = Object.fromEntries(Object.entries(fits).filter(([k, v]) => k.startsWith('short@') && v?.[who]).map(([k, v]) => [k.slice(6), v[who]]));
  if (YOLA_MODEL !== '2') yola.postureOff = true; // (the posture fix was measured on Yola 3.0's rig: render/posture.js)
  fetch('assets/hold/hand_poses.json').then((r) => r.json()).then((j) => yola.setHandPoses(heroFits(j), who)).catch(() => {}); // (the Rig Lab Hands settings)
  fetch('assets/hold/arm_pose.json').then((r) => r.json()).then((j) => yola.setArmPose(heroFits(j), who)).catch(() => {}); // (the Rig Lab's arm adjustments)
  // the walkie-talkie hold (render/radiohold.js; the Rig Lab's Radio section: its saved settings, or its unsaved ones in this
  // browser while the user is setting it up)
  fetch('assets/hold/radio_hold.json').then((r) => r.json()).catch(() => ({})).then((j) => {
    let mine = {}; try { mine = JSON.parse(localStorage.getItem('radioHold') || '{}'); } catch { /* storage off */ }
    yola.radioFit = radioFit(mine[who] || j[who]);
  });
  // the case in his left hand (render/casecarry.js; the Rig Lab's Case section, as the radio's)
  fetch('assets/hold/case_carry.json').then((r) => r.json()).catch(() => ({})).then((j) => {
    let mine = {}; try { mine = JSON.parse(localStorage.getItem('caseCarry') || '{}'); } catch { /* storage off */ }
    yola.caseFit = caseFit(mine[who] || j[who]);
  });
  // the stance (2026-10-18, the user's pick in the Rig Lab): Quaternius UAL2 Sword_Block held on its first frame, the rest
  // stance, bat level (assets/yola2_ual.glb; without it the Sword Idle as before)
  const block = anims.find((c) => c.name === 'ual_Sword_Block');
  const combo = anims.find((c) => c.name === 'ual_Sword_Regular_Combo'), idle = block ? holdFrame(block, 'ual_Sword_Block') : anims.find((c) => c.name === 'ual1_Sword_Idle');
  VAULT.shots = anims.some((c) => c.name === 'hub_vault_pistol') ? VAULT_SHOTS : null; // (his gun vaults fire: core/player.js)
  if (!combo) { setupNewMoves(yola, anims, null); return; }
  const h = new THREE.Group(), m = woodG ? woodG.scene : makeBat(0.84); // (the wood bat; the built one if its file failed)
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  h.add(m); h.visible = false; scene.add(h);
  const hold = { obj: h, w: woodG ? WOOD_BAT_DEF : BAT_DEF, hand: 'Right', roll: 0, slide: 0, flip: false, two: false, fingers: null, pack: !!woodG };
  // (the user's fits, set in the Rig Lab: the wood bat is the Rig Lab's Bat, alubat: its own for the stance, alubat@ual_Sword_Block)
  hold.fit = (woodG ? fits.alubat : fits.bat)?.[who] || null;
  if (woodG && block) hold.fitIdle = fits['alubat@ual_Sword_Block']?.[who] || null;
  // (the opening's walk out of the lift: the bat's own grip on that walk, set in the Rig Lab: opening/opening.js tickStand)
  hold.fitWalk = (woodG && fits['alubat@reveal_walk']?.[who]) || null;
  yola.setOneHandedBat(hold, idle);
  // the axe (2026-10-19, the user: "use the same grip and attack as the bat"): the hospital pack's fire axe in her right fist
  // as the Rig Lab holds it (its packaxe fits; packaxe@ual_Sword_Block for the stance if set), the bat's stance and moves
  // (render/newmoves.js builds them with the axe in her hand)
  if (axeG) {
    const ha = new THREE.Group(); axeG.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    ha.add(axeG.scene); ha.visible = false; scene.add(ha);
    yola.axeLib = { obj: ha, w: PACK_AXE_DEF, hand: 'Right', roll: 0, slide: 0, flip: false, two: false, fingers: null, pack: true,
      fit: fits.packaxe?.[who] || null, fitIdle: fits['packaxe@ual_Sword_Block']?.[who] || null };
  }
  // (89 of its 91 frames: the last one snaps back to the loop pose; four strikes, the third a slower swing)
  useBuiltBat(buildLibraryAttack(yola, { clip: combo, frames: 89, hold, P: BAT_PROFILE, speed: 1, name: 'bat', sound: 'bat', strikes: 4 }));
  setupNewMoves(yola, anims, hold); // (the Quaternius UAL moves: the combo strike by strike, leg attacks, dodge, vault; render/newmoves.js)
  setupSlideFinisher(yola, anims); // (the shotgun's slide finisher: render/slidefin.js)
}
// Compile every shader the fight can need before play. A first use mid-fight compiled one and froze that frame (a limb
// cut off: 70-270 ms; the first hit): severed pieces draw the zombie's materials unskinned, and pooled hidden things
// (blood pools, hit rings, the arena's weapons, the outbreak surfaces) are skipped by a normal compile. The warm-up
// materials are kept (disposing them would free the programs again).
const warmMats = [];
function warmPrograms() {
  const tmp = new THREE.Group(), box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  ZOMBIE_TYPES.forEach((t, type) => {
    if (!t.gltf) return; // (a neighbourhood-only type in the hospital is not loaded: building its view threw and stopped the load)
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
// the chapter's on-screen layer (radio captions, the lift's floor picker, the case): story mode only
let chapterUI = null;
function startChapterUI() {
  if (chapterUI || !LAYOUT.story) return;
  chapterUI = new ChapterUI({ scene, camera, arena, audio, hud, fx, input, yola: () => yola, sim: () => sim, applyLevel: (s) => { levelSave = s; applyLevel(s); }, prepFloor, onSave: (s) => { levelSave = s; store.set('chapter1save', s); }, onReplay: () => { applyRoom1(); } });
  window.chapterUI = chapterUI;
}
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
function applyRoom1() { levelSave = null; store.set('chapter1save', null); return applyLevel(null); }
// The chapter from its start (save null: Floor 7's OR, its dormant zombies, Yola with the bat) or from a checkpoint (any floor)
// (2026-10-18, the user: "load the other floors in the elevator") only the floor being played is switched on (arena.js
// adoptFloors). prepFloor: the lift has started (the screen is faded): the next floor switches on and its textures go up a
// few a frame through the ride. settleFloor: arrived: only this floor stays on, and the textures only the others use leave
// the GPU (they go up again on the next ride there).
let floorQueue = [];
function prepFloor(n) {
  if (!arena?.floorGroups?.[n]) return;
  arena.showFloors([LAYOUT.floor, n]);
  floorQueue = [...texturesOf(arena.floorGroups[n])];
}
function settleFloor(n) {
  if (!arena?.floorGroups) return;
  arena.showFloors([n]); floorQueue = [];
  lightkit?.setFloor(n); // (the floor's own EXIT signs and flicker patches, its bake's fill)
  const keep = new Set(); for (const o of arena.group.children) if (o.visible) for (const t of texturesOf(o)) keep.add(t.source);
  for (const [f, g] of Object.entries(arena.floorGroups)) if (+f !== n) for (const t of texturesOf(g)) if (!keep.has(t.source)) t.dispose();
}
function applyLevel(save) {
  if (LAYOUT.story) useFloor(save?.floor || 7); // (the simulation's world is the save's floor)
  restart('room1', benchN, save);
  if (LAYOUT.story) settleFloor(LAYOUT.floor);
  shareTextures(scene, renderer); // (a floor's new props: one GPU copy per image)
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
  for (const L of sim.loose) { L.px = L.x; L.pz = L.z; }
  input.clearAll(); input.enabled = true; acc = 0; hitPauseT = 0; last = performance.now();
  arena.syncLevel(sim.level);
  if (sim.level?.taken.has('bat')) opening?.takeBat?.(); else opening?.restoreBat?.();
  hud.setObjective(OBJECTIVES[sim.level ? sim.level.objective : 'room1'] || '');
  prepViews();
  return sim;
}
// show the zombies and Yola without stepping the simulation (the reveal, before control is handed over)
function previewRoom1(dt) {
  if (!opening?.revealSwing && !opening?.revealPose) yola.update(dt, stillState(sim.player.x, sim.player.z, sim.player.aimYaw)); // (the reveal poses Yola itself)
  for (const z of sim.zombies) {
    let v = zviews.get(z.id);
    if (!v) { const type = viewType(z); v = zpool[type].pop() || newZombieView(type); bindView(v, z); zviews.set(z.id, v); }
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
// every zombie of the level with its view now (not on its first drawn frame), and spares in the pool for those that arrive
// mid-fight (out of the floor, through a door): building a view then cost ~100 ms, a visible hitch (2026-10-18)
// (not bound while the opening plays: a bound view is shown, and the floor's zombies stood in the opening's rooms, round
// the OR table among her crew, 2026-10-19; the reveal binds them from the pool when it shows them, previewRoom1)
function prepViews() {
  if (!sim) return;
  if (!opening?.active) for (const z of sim.zombies) if (!zviews.has(z.id)) { const type = viewType(z), v = zpool[type].pop() || newZombieView(type); bindView(v, z); zviews.set(z.id, v); }
  // (Chapter 2 keeps more spare: its streets and bigger waves, hood/level.js AMBIENT / WAVE_EXTRA)
  for (const [type, n] of LAYOUT.hood ? [[5, 4], [6, 4], [7, 4], [8, 3], [9, 3], [10, 3], [2, 1], [3, 1]] : [[0, 4], [1, 4], [4, 3], [2, 1], [3, 1]]) while (zpool[type].length < n) { const v = newZombieView(type); v.hide(); zpool[type].push(v); }
}
function newZombieView(type) {
  const t = ZOMBIE_TYPES[type];
  const v = new ZombieView(scene, t.gltf, t.height, t.walk, t);
  v.type = type;
  if (type === 0) v.wearSurgeonKit(ZombieView.propSrc.cap); // (the nurse: a surgeon when it is one)
  if (t.orange) v.model.traverse((o) => { if (o.isMesh && o.material?.map) o.material.map = orangeScrubs(o.material.map); }); // (the runner)
  return v;
}

// ---------- lifecycle ----------
function restart(newMode = mode, n = benchN, save = null) {
  execDir.cancel(); // (an execution never outlives its level)
  if (levelForMode(newMode) !== LAYOUT.name) { // the other layout: load it fresh
    const q = new URLSearchParams(); if (newMode !== 'room1') q.set('mode', newMode); else q.set('room1', '1'); if (newMode === 'bench') q.set('n', n);
    location.search = q.toString(); return;
  }
  mode = newMode; benchN = n;
  sim = new Sim({ tuning, seed: +(params.get('seed') || 1234), mode, benchCount: n, save });
  window.game.sim = sim;
  for (const v of zviews.values()) { v.hide(); zpool[v.type].push(v); }
  zviews.clear();
  ZombieView.clearPieces(); gibs.clear(); clearBreaches();
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
    case 'restart': if (LAYOUT.hood) restart(mode); else if (sim.level) applyLevel(levelSave); else restart(mode); break; // the story level retries from its checkpoint (the neighbourhood: src/hood/ restores its own)
    case 'restartLevel': applyRoom1(); break;
    case 'mode': restart(v); break;
    case 'bench': restart('bench', v); break;
    case 'quality': quality = v; store.set('quality', v); location.reload(); break;
    case 'gore': fx.gore = v; store.set('gore', v); break;
    case 'yola': store.set('yolaModel', v); location.reload(); break;
    case 'shake': shakeOn = v; break;
    case 'guide': store.set('guide', v); break; // (Chapter 2's guidance marker: src/hood/hint.js)
    case 'debug': debugOn = v; debugGroup.visible = v; break;
  }
}
addEventListener('blur', () => { if (sim && !paused && !sim.player.dead && params.get('demo') !== 'finishers') setPaused(true); }); // (the finisher player keeps playing while you look elsewhere)
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
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _seg = {};
let groanT = 2;
function frame(now) {
  requestAnimationFrame(frame);
  if (now - last > 500 && last > 0) { perf.stalls = (perf.stalls || 0) + 1; perf.longest = Math.max(perf.longest || 0, now - last); } // (a frame that never came: the meter's 'stalls')
  perf.frameCount = (perf.frameCount || 0) + 1;
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now; // (never negative: applyLevel sets last after the frame's own timestamp; a negative step blew the emergency light up, 2026-10-19)
  if (manualTicks) return;
  const c0 = performance.now(); runFrame(dt); perf.cpu.push(performance.now() - c0); if (perf.cpu.length > 600) perf.cpu.shift();
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
  if (floorQueue.length) for (let i = 0; i < 6 && floorQueue.length; i++) { try { renderer.initTexture(floorQueue.shift()); } catch { /* on first use instead */ } }
  screens.update(dt);
  if (opening && !opening.active) opening.ambient?.(dt); // the seated guard keeps idling after the hand-off
  const wantLit = !opening?.active || !!opening?.gameLight; // (the story lighting: off for the opening, on from the hand-off; the reveal turns it on from the cut to the lift: opening.gameLight)
  if (LAYOUT.story && lightkit && storyLit !== wantLit) storyLighting(wantLit);
  if (opening?.active) { opening.update(dt); if (opening.room1Preview) previewRoom1(Math.min(dt, 0.05) * (opening.timeScale || 1)); if (opening.gameLight && storyLit) revealLight(opening.paused ? 0 : dt); opening.labApply?.(); if (doRender && !opening.renderFrame?.()) looks.render(); return; } // (renderFrame: the reveal's own picture chain, src/opening/revealpost.js)
  const p = sim.player;
  let simDt = dt;
  if (paused) simDt = 0;
  // cinematic slow motion (the guard's leap at its peak, a perfect dodge, a finishing blow: slowMotion below)
  // (2026-10-18, the user: "the slow motion doesn't feel good. I think our character needs to ability to move slightly faster
  // than the rest of the world during that slow motion"): the world runs at k, Yola at k + YOLA_AHEAD of what it loses (her
  // steps, swings, shots and her animation: sim.yolaBoost in core/sim.js step, the same factor on her view below)
  if (!paused) {
    execNow = execDir.update(dt, tuning, sim.player.execHitIn);
    const k = slowmo.update(dt, sim, !!opening?.active, execNow ? execNow.k : (hood?.cine?.timeScale ?? null)); simDt *= k; // (hood.cine: Chapter 2's cinematic moments hold the world)
    sim.yolaBoost = execNow ? execNow.boost : hood?.cine?.active ? 1 : slowmo.full ? 1 / Math.max(0.05, k) : k < 0.995 ? (k + (1 - k) * YOLA_AHEAD) / Math.max(0.05, k) : 1; // (Witch Time: Yola at full speed)
  }
  // hit-stop: a short dip into slow motion (never a full freeze: a freeze reads as a stutter, and combo hits stacked them)
  if (hitPauseT > 0) { const h = Math.min(hitPauseT, simDt); hitPauseT -= h; simDt -= h * (1 - HIT_SLOW); }
  // fixed-step simulation (input sampled once per frame; a swap press is delivered exactly once)
  acc += simDt;
  if (acc > STEP * 8) acc = STEP * 8; // never spiral after a stall
  // stick directions are screen directions: rotate them by the camera's turn
  let inp = window.game.scriptInput ? window.game.scriptInput(sim, dt) : input.sample(THREE.MathUtils.degToRad(tuning.camYaw));
  if (window.game.inputFilter) inp = window.game.inputFilter(inp, sim); // (Chapter 2's cinematic moments: the controls held, src/hood/cine.js)
  let steps = 0;
  while (acc >= STEP) {
    p.px = p.x; p.pz = p.z; p.pyaw = p.aimYaw;
    for (const z of sim.zombies) { z.px = z.x; z.pz = z.z; z.pyaw = z.yaw; }
    for (const L of sim.loose) { L.px = L.x; L.pz = L.z; }
    sim.step(inp);
    if (steps === 0) inp = Object.assign({}, inp, { swapPresses: 0, usePresses: 0 });
    acc -= STEP; steps++;
  }
  const alpha = paused ? 1 : acc / STEP; // frozen frames show the latest step (alpha 0 rolled the pose back a step)
  handleEvents();
  if (steps) window.game.arenaTick?.(steps * STEP);
  const animDt = paused ? 0 : simDt;

  // ---- Yola ----
  { // the dodge button (2026-10-18 night, FINISHERS_PLAN.md 1): always there in play, grey and dead at rest (no dodge at
    // will); it pulses yellow only through the window to dodge (sim.dodgeThreat open), its ring closing toward the hit,
    // white in the perfect moment; an arrow on it shows which way she'll go
    const b = (window.__dodgeBtn ??= document.getElementById('dodgeBtn')), th = p.threat, dt0 = p.dodgeTh;
    if (b) {
      b.classList.toggle('show', !p.dead && !opening?.active);
      b.classList.toggle('open', p.dodgeOpen > 0 && !p.dead); b.classList.toggle('perfect', !!dt0?.perfect && !p.dead);
      const fin = !!p.finishReady && !p.dead; // (FINISH: a zombie open to a finisher in reach, no dodge window)
      if (fin !== b.__fin) { b.__fin = fin; b.classList.toggle('finish', fin); const l = b.querySelector('.lbl'); if (l) l.textContent = fin ? 'Finish' : 'Dodge'; }
      const pr = dt0 ? Math.min(1, Math.max(0, 1 - dt0.eta / DODGE_CUE.lead)) : 0;
      if (Math.abs(pr - (b.__p ?? -1)) > 0.02) { b.style.setProperty('--p', pr.toFixed(3)); b.__p = pr; }
      if (dt0 && p.dodgeDir) { // the arrow: her dodge direction as it looks on screen
        _v.set(p.x, 1, p.z).project(camera); const sx = _v.x, sy = _v.y;
        _v.set(p.x + p.dodgeDir.x, 1, p.z + p.dodgeDir.z).project(camera);
        const ang = Math.atan2(_v.x - sx, _v.y - sy) * 180 / Math.PI;
        if (Math.abs(ang - (b.__a ?? 999)) > 2) { b.style.setProperty('--a', ang.toFixed(1) + 'deg'); b.__a = ang; }
      }
    }
    // low health (under 30%: FINISHERS_PLAN.md 5): the edges darken and a slow heartbeat, tension rather than punishment
    { const low = p.dead ? 0 : Math.max(0, Math.min(1, (0.3 - p.hp / p.maxHp) / 0.2)), q = Math.round(low * 20) / 20;
      if (q !== window.__lowQ) { window.__lowQ = q; document.documentElement.style.setProperty('--low', q); }
      if (low > 0 && (window.__beatT = (window.__beatT ?? 0) - dt) <= 0) { window.__beatT = 1.05 - low * 0.35; cue(audio, 'heartbeat', 0.5 + low * 0.6); } }
    // the moment the window opens on a special attack: the spider-sense over Yola's head (render/threatcue.js)
    if (dt0?.special && !cueState.sense) { cueState.sense = true; threatCue.sense(yola.bones?.Head?.getWorldPosition(_v2) || _v2.set(p.x, 1.9, p.z)); }
    else if (!dt0) cueState.sense = false;
    // the sign over the attacker, and its sounds: the warning when it starts, the ping when it is time
    const tz = th?.z, tv = tz && zviews.get(tz.id);
    const hb = tv?.bones?.Head?.getWorldPosition(_v); // (over his head, wherever it is: crouched, in the air)
    threatCue.update(dt, th, tz ? { x: hb ? hb.x : tz.px + (tz.x - tz.px) * alpha, y: hb ? hb.y : null, z: hb ? hb.z : tz.pz + (tz.z - tz.pz) * alpha } : null, tv ? tv.height : 2);
    const key = th ? th.z.id + th.kind : '';
    if (key && key !== cueState.key) cue(audio, 'warn');
    if (th?.now && !(cueState.now === key)) { cue(audio, 'now'); cueState.now = key; }
    cueState.key = key;
  }
  // the guard heaving at his shield, lodged in the floor: a grinding creak every heave
  for (const z of sim.zombies) if (z.state === 'stuck' && Math.floor((z.t + 0.2) / 0.5) !== Math.floor((z.t + 0.2 - animDt) / 0.5)) { const g = Math.min(1, z.t / Math.max(0.5, z.stateDur)); cue(audio, 'heave', 0.7 + g * 0.5); shake(0.05 + g * 0.08); fx.burst(z.x + Math.sin(z.yaw) * 0.75, 0.06, z.z + Math.cos(z.yaw) * 0.75, 5 + Math.round(g * 8), 0x8a8172, 1.2, 0.5, 0.35); } // (each heave at his planted shield: the floor creaks and puffs, harder each time)
  // the big lady's charge (2026-10-18 night, the user: "something heavy's moving here"): every stride a thump you feel, a
  // camera bump that grows as she nears and a puff of dust at her feet
  for (const z of sim.zombies) {
    if (z.kind !== 'sprinter' || !z.sprinting || !z.alive || z.spd < 2) { if (z.kind === 'sprinter') z.strideD = 0.6; continue; }
    if ((z.strideD = (z.strideD ?? 0.6) + z.spd * animDt) < 1.25) continue;
    z.strideD -= 1.25; const d = Math.hypot(z.x - p.x, z.z - p.z), k = Math.max(0, 1 - d / 14);
    cue(audio, 'stomp', 0.35 + k * 0.65); if (k > 0) shake(0.04 + k * 0.16);
    fx.burst(z.x, 0.05, z.z, 5, 0xa39a8a, 1.0, 0.35, 0.5); fx.smoke(z.x, z.z, 1, 0.25, 0.25, 1.6, 0.6, 0x9d9483, 0.25);
  }
  const ix = p.px + (p.x - p.px) * alpha, iz = p.pz + (p.z - p.pz) * alpha;
  const iyaw = p.pyaw + angleDiff(p.pyaw, p.aimYaw) * alpha;
  const a = p.action;
  yola.update(animDt * (sim.yolaBoost || 1), {
    x: ix, z: iz, vx: p.vx, vz: p.vz, aimYaw: iyaw, equipped: p.equipped, action: a.type, actionT: a.t,
    swingT: a.type === 'swing' ? a.st : 0, combo: a.combo || 0, ground: !!a.ground, swingId: a.id, atk: a.type === 'swing' ? p.atk(a) : null, act: a, owned: p.owned, downFall: a.fall, downUp: a.up, recoil: p.recoil, recoilScale: tuning.pistolRecoil,
    dead: p.dead, deathDir: p.deathDir || 0, hurtT: p.hurtT, hurtDirX: p.hurtDirX || 0, hurtDirZ: p.hurtDirZ || 0,
    reloadDur: p.reloadTime(), swapDur: tuning.swapTime,
  });
  // the swing arc: every melee weapon, through each damaging window of the attack (and a little either side)
  if (a.type === 'swing' && p.equipped !== 'fists') {
    const A = p.atk(), wins = A.windows || [[A.activeStart, a.activeEnd]];
    if (wins.some(([w0, w1]) => a.st > w0 - 0.07 && a.st < w1 + 0.05)) {
      if ((p.equipped === 'test' || yola.libHolds?.[p.equipped]) && yola.testTip) fx.trailPush(yola.testGrip, yola.testTip, true);
      else if (yola.melee.visible) fx.trailPush(yola.melee.position, yola.melee.userData.tip.getWorldPosition(_v), true);
    }
  }
  fx.setAim(ix, iz, iyaw, !p.dead, p.aiming ? (p.attackHeld ? 1 : 0.5) : 0.2);

  stepPhysics(animDt);
  acid.audio = audio; acid.update(sim.hazards, sim.zombies, animDt, p);
  roomsView.update(sim, animDt); // (render/rooms.js)
  if (lightkit?.on.baked) for (const V of roomsView.floods.values()) if (!V.water.userData.baked) lightkit.bakeMesh(V.water); // (the water takes the floor's bake)
  ZombieView.updatePieces(animDt); ZombieView.updateShields(animDt); gibs.world = sim.world; gibs.update(animDt);
  ZombieView.syncLoose(sim.loose, alpha, animDt); // (the drip stands and wheelchairs: core/loose.js)
  { // open to a finisher: the gold mark over its head (render/finishmark.js), the one in reach a touch bigger
    const reach = p.finishReady ? sim.execTarget(p, true) : null, list = [];
    for (const z of sim.zombies) {
      if (!z.alive || !(z.executable > sim.time) || z.execLock) continue;
      const v = zviews.get(z.id), hb = v?.bones?.Head?.getWorldPosition(new THREE.Vector3());
      list.push({ pos: hb || new THREE.Vector3(z.x, v ? v.height : 1.8, z.z), left: z.executable - sim.time, dur: z.openDur || 2.4, inReach: z === reach });
    }
    finishMarks.update(dt, list);
  }
  // ---- zombies (pooled views) ----
  const seen = new Set();
  const zThr = zThrottle && !!LAYOUT.hood;
  if (zThr) zFrustum.setFromProjectionMatrix(zPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); // (last frame's camera: one frame late is fine for picking a rate)
  for (const z of sim.zombies) {
    if (z.noView) continue; // (the neighbourhood's looters: people in the zombie list, drawn by src/hood/actors.js)
    let v = zviews.get(z.id);
    if (!v) {
      const type = viewType(z);
      v = zpool[type].pop() || newZombieView(type);
      bindView(v, z); zviews.set(z.id, v);
      z.px ??= z.x; z.pz ??= z.z;
    }
    seen.add(z.id);
    if (z.gibbed) { if (v.outer.visible) v.hide(); continue; } // (blown apart: its pieces are the burst's, the view stays hidden)
    // Floor 3: a dormant zombie far from Yola (another room) is neither drawn nor animated
    // (Chapter 2's cinematic moments: measured from what the shot looks at, so a pan to a crowd shows it: hood.cine.focus)
    const fcx = hood?.cine?.active && hood.cine.focus ? hood.cine.focus.x : ix, fcz = hood?.cine?.active && hood.cine.focus ? hood.cine.focus.z : iz;
    if (sim.level && z.dormant && (z.x - fcx) * (z.x - fcx) + (z.z - fcz) * (z.z - fcz) > 15 * 15 && (z.x - ix) * (z.x - ix) + (z.z - iz) * (z.z - iz) > 15 * 15) { if (v.outer.visible) { v.outer.visible = false; v.blob.visible = false; v.farHidden = true; } continue; }
    if (v.farHidden) { v.outer.visible = true; v.blob.visible = true; v.farHidden = false; }
    if (zThr) { zSphere.center.set(v.outer.position.x, v.height * 0.5, v.outer.position.z); zSphere.radius = v.height * 1.25; v.animEvery = !zFrustum.intersectsSphere(zSphere) ? 4 : (z.x - fcx) * (z.x - fcx) + (z.z - fcz) * (z.z - fcz) > 14 * 14 ? 2 : 1; } else v.animEvery = 1;
    v.update(animDt, z, z.px + (z.x - z.px) * alpha, z.pz + (z.z - z.pz) * alpha, sim.time);
  }
  for (const [id, v] of zviews) if (!seen.has(id)) { v.hide(); zviews.delete(id); zpool[v.type].push(v); }
  telegraphs.update(sim.zombies, alpha);

  // ambient groans (rate-limited, nearest zombies)
  groanT -= animDt;
  if (groanT <= 0) { groanT = 1.6 + Math.random() * 2; const near = sim.zombies.filter((z) => z.alive && Math.hypot(z.x - p.x, z.z - p.z) < 9); if (near.length) audio.play('groan', Math.min(1, 0.5 + near.length * 0.1), near[Math.floor(Math.random() * near.length)]); } // (from one of them: its side, its distance)

  fx.update(animDt);
  if (music.state !== 'off') { const R = music.state === 'combat' ? 11 : 7; music.update(dt, sim.zombies.some((z) => z.alive && !z.dormant && !z.passive && (Math.hypot(z.x - p.x, z.z - p.z) < R || z.state === 'windup' || z.state === 'strike')), paused || p.dead); }
  arena.update(dt, ix, iz, THREE.MathUtils.degToRad(tuning.camYaw), sim.level);
  hud.setEmergency(!!arena.em && arena.em.target > 0);
  hud.setPrompt(sim.level && !paused ? sim.level.prompt : null);
  chapterUI?.update(paused ? 0 : dt);
  if (camOverride) applyCamOverride(); else if (!window.game.camFree) updateCamera(dt, ix, iz, iyaw, p); // (camFree: inspect mode moves the camera)
  hood?.update(dt, ix, iz, camera, sim);
  // player screen position (mouse aiming)
  _v.set(ix, 1.0, iz).project(camera);
  playerScreen = { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };

  if (debugOn) updateDebug(p);
  hud.update(sim, dt);
  atmos?.update(dt, sim, ix, iz, iyaw);
  if (lightkit) {
    lightkit.screensMat = screens.mat;
    lightkit.torch = atmos?.on.torch ? { x: ix, z: iz, fx: Math.sin(iyaw), fz: Math.cos(iyaw) } : null;
    const kv = []; for (const [id, v] of zviews) { const z = sim.zombies.find((q) => q.id === id); if (z) kv.push({ z, view: v, blob: v.blob }); }
    lightkit.update(dt, sim, kv, yola);
    if (lightkit.on.room || yola.roomTintWas) { const t = lightkit.on.room ? yola.roomTint : null; yola.roomTintWas = !!t; yola.model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.emissive) { if (t) m.emissive.copy(t); else m.emissive.setRGB(0, 0, 0); } }); }
    looks.setDrain?.(1 - p.hp / Math.max(1, p.maxHp));
  }
  execLook(animDt, dt);
  if (doRender) { gpuTimer?.poll(); const on = gpuTimer?.begin(); looks.render(); gpuTimer?.end(on); }
}

// the story lighting built, its textures on the GPU and its shaders compiled behind the opening's title screen: the reveal turns
// it on at the cut to the lift, and building it there (the baked floor's materials, the signs, the haze) hitched the frame
async function warmStoryLight(during = null) { // (during: the opening's own warm-up, run while the lighting is on)
  if (!LAYOUT.story || !lightkit || storyLit) return;
  storyLighting(true);
  const t0 = performance.now(); while (lightkit.plan.bakes.some((B) => B.tex && !B.tex.image?.width) && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 50)); // (the bakes load in the background)
  for (const B of lightkit.plan.bakes) if (B.tex?.image?.width) renderer.initTexture(B.tex);
  lightkit.update(0, sim, [], yola); try { renderer.compile(scene, camera); } catch { /* on first use instead */ } renderer.render(scene, camera);
  try { during?.(); } catch (e) { console.warn('warm', e); }
  storyLighting(false);
}
// the game's lights during the reveal (render/lightkit.js, render/atmos.js): ticked as in play, Yola where the reveal has her
// (the opening dims them beat by beat: lightkit.dim, the character light, the emergency look)
function revealLight(dt) {
  const her = opening.herAt?.(), P = her ? { player: { x: her.x, z: her.z } } : sim;
  const kv = []; for (const [id, v] of zviews) { const z = sim.zombies.find((q) => q.id === id); if (z) kv.push({ z, view: v, blob: v.blob }); }
  lightkit.screensMat = screens.mat; lightkit.update(dt, P, kv, yola); atmos?.update(dt, P, 0, 0, 0);
  opening.aimFlashShadow?.(); // (her shadow thrown by the flash: the kit's shadow light re-aimed after its own aim)
}

let impactFrame = -1, frameNo = 0, impactN = 0;
// a big finishing blow: the zombie's view bursts into its pieces (only the zombies with a burst model, only when drawn)
const GIB_SHOTGUN_RANGE = 2.6; // m: the shotgun's point-blank range (the same as its close-blast thump)
function gib(id, dx, dz, power) {
  const z = sim.zombies.find((q) => q.id === id), v = zviews.get(id);
  if (!z || z.gibbed || !v || !v.outer.visible || v.farHidden || !gibs.has(v.type)) return false;
  if (!gibs.burst(v, dx, dz, power)) return false;
  z.gibbed = true; v.hide(); audio.play('sever', 1.4); shake(0.55);
  return true;
}
// how each weapon / zombie attack bleeds (render/fx.js bloodHit)
const MELEE_BLOOD = { axe: 'blade', knife: 'blade', bat: 'blunt', crowbar: 'blunt', sledgehammer: 'blunt' };
const STRIKE_BLOOD = { scratch: 'blade', flail: 'blade', dash: 'blade', lunge: 'bite', pounce: 'bite', bite: 'bite', club: 'blunt', smash: 'blunt', slam: 'blunt' };
let hurtFrame = -1;
// an execution's full-body burst by weapon (the power of the throw); the rest take parts off (core/zombies.js EXEC_GORE)
const EXEC_BURST = { bat: 1.8, shotgun: 2.2, sledgehammer: 1.3 };
const EXEC_BLOOD = { axe: 'blade', knife: 'blade', pistol: 'pistol', shotgun: 'shotgun' };
function handleEvents() {
  frameNo++;
  const p = sim.player;
  for (const e of sim.events) {
    { const r = roomsView.onEvent(e, sim); if (r != null) { if (r.startsWith('shake:')) shake(+r.slice(6)); continue; } } // (core/rooms.js events: render/rooms.js)
    switch (e.type) {
      case 'shot': {
        audio.play('shot');
        fx.muzzle(yola.muzzleWorld); lightkit?.onShot(e, p, false); // (after the muzzle: the kit may push the flash further)
        fx.tracer(yola.muzzleWorld.x, yola.muzzleWorld.y, yola.muzzleWorld.z, e.ex, e.ez, 0.5, e.ey);
        if (e.hit === 'zombie' && !e.blocked) { if (e.ey != null) fx.burst(e.ex, e.ey, e.ez, 4, 0x5a1414, 1.8, 0.8, 0.45); else fx.impactZombie(e.ex, e.ez, Math.sin(e.yaw), Math.cos(e.yaw), false); fx.bloodHit('pistol', e.ex, e.ey ?? 1.15, e.ez, Math.sin(e.yaw), Math.cos(e.yaw), e.killed ? 1.4 : 1); audio.play('bulletHit', 1, { x: e.ex, z: e.ez }); if (!e.killed) audio.play('zombieHurt', 1, { x: e.ex, z: e.ez }); } // (a round on the guard's shield: its own knock, no blood)
        else if (e.hit === 'wall') { fx.impactWall(e.ex, e.ez, e.nx, e.nz); audio.play('ricochet', 1, { x: e.ex, z: e.ez }); }
        shake(0.12);
        break;
      }
      case 'shotgun': {
        audio.play('shotgun');
        const mw = yola.muzzleWorld;
        fx.muzzle(mw, 1.8); { const mid = e.pellets?.[e.pellets.length >> 1]; lightkit?.onShot({ ...(mid || {}), yaw: e.yaw }, p, true); }
        let flesh = 0; const bled = new Set(); // (one wet cone per body, however many pellets)
        for (const pl of e.pellets) {
          fx.tracer(mw.x, mw.y, mw.z, pl.ex, pl.ez, 0.6, pl.ey);
          if (pl.hit === 'zombie') { if (!e.blocked?.includes(pl.id) && flesh++ < 4) { fx.impactZombie(pl.ex, pl.ez, Math.sin(e.yaw), Math.cos(e.yaw), false); if (!bled.has(pl.id)) { bled.add(pl.id); fx.bloodHit('shotgun', pl.ex, pl.ey ?? 1.1, pl.ez, Math.sin(e.yaw), Math.cos(e.yaw), e.closest < 2.6 ? 1.5 : 1); } } }
          else if (pl.hit === 'wall' && Math.random() < 0.5) fx.impactWall(pl.ex, pl.ez, pl.nx, pl.nz);
        }
        if (flesh) audio.play('bulletHit', 1.3);
        // point blank: the blast lands as one heavy thump with a white flash on the body it struck (restrained: one per blast)
        const near = e.hits && e.closest < 2.6;
        for (const id of e.killed || []) { const zk = sim.zombies.find((q) => q.id === id); if (zk && Math.hypot(zk.x - p.x, zk.z - p.z) < GIB_SHOTGUN_RANGE) gib(id, Math.sin(e.yaw), Math.cos(e.yaw), 1.4); } // (point blank: the full burst)
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
        fx.bloodHit(e.fist ? 'blunt' : MELEE_BLOOD[e.weapon] || 'blunt', e.x - e.dirX * 0.15, chop ? 0.5 : 1.15, e.z - e.dirZ * 0.15, e.dirX, e.dirZ, (e.fist ? 0.6 : e.weapon === 'sledgehammer' ? 1.6 : 1) * (e.killed ? 1.3 : 1) * (e.style === 'heavy' || chop ? 1.2 : 1));
        fx.hitFlash(e.x - e.dirX * 0.18, chop ? 0.45 : 1.15, e.z - e.dirZ * 0.18, e.dirX, e.dirZ, (e.killed ? 1.3 : 1) * (e.style === 'heavy' || chop ? 1.2 : 1) * (e.fist ? 0.7 : 1));
        if (first) {
          shake(e.killed || chop ? 0.6 : 0.45);
          // the camera kicks along the blow (the follow spring brings it back); the chop kicks down-screen
          if (shakeOn) { const k = (e.killed ? 2.2 : 1.7) * (chop ? 1.3 : 1) * tuning.shake; camState.vx += e.dirX * k; camState.vz += e.dirZ * k; }
        } else if (impactN === 2) shake(0.12); // (a second body in the same swing: a touch more, never a stack)
        if (e.killed && !e.fist && e.style === 'heavy') gib(e.id, e.dirX, e.dirZ, 1); // (the bat's finisher, the sledgehammer: the full burst)
        break;
      }
      case 'objective': hud.setObjective(OBJECTIVES[e.id] || ''); audio.play('swap'); break;
      case 'pickup': {
        audio.play(e.kind === 'health' ? 'heal' : 'reloadDone'); hud.flash('reload');
        if (e.id === 'bat') opening?.takeBat?.(); else arena.takePickup(e.id);
        hud.toast(e.kind === 'weapon' ? (e.weapon === 'pistol' ? (e.id === 'pistol' ? 'Pistol — the guard’s sidearm' : 'Pistol') : e.label || (e.weapon === 'axe' ? 'Fire axe' : 'Baseball bat')) : e.kind === 'ammo' ? e.label || 'Spare pistol rounds' : 'First aid: health restored');
        break;
      }
      case 'checkpoint': levelSave = e.save; store.set('chapter1save', e.save); break;
      case 'liftPower': arena.liftPowered(true); audio.play('power'); hud.toast('Lift power restored'); break;
      case 'unbrace': audio.play('unbrace'); break;
      case 'doorOpened': audio.play('doorOpen'); chapterUI?.onEvent(e); break;
      case 'bang': if (e.near < 11) { audio.play('bang', Math.max(0.25, 1 - e.near / 12)); arena.bang(e.door); if (Math.random() < 0.6) setTimeout(() => audio.play('groan', 0.7), 200); } break;
      case 'liftDoors': audio.play(e.open ? 'liftDing' : 'liftClose'); break;
      case 'levelComplete': input.clearAll(); input.enabled = false; store.set('chapter1save', null); levelSave = null; hud.levelDone(sim); audio.play('clear'); break;
      case 'chapterComplete': input.clearAll(); input.enabled = false; store.set('chapter1save', null); levelSave = null; audio.play('clear'); chapterUI?.onEvent(e); break;
      case 'radio': case 'liftTravel': case 'case': case 'partitionBreak': case 'record': case 'sampleMatch': case 'liftFault': chapterUI?.onEvent(e); break;
      case 'roomEnter': { const r = LAYOUT.rooms?.find((q) => q.id === e.room); if (r && r.id !== 'or') hud.banner(r.name); break; }
      case 'zombieWake': { const z = zat(e.id); if (z?.kind === 'guard') audio.play('guardRoar', 1, z); else if (Math.random() < 0.6 && dist(e.id) < 12) audio.play('zombieAlert', 0.9, z); break; } // (sound board: Zombies)
      case 'dryFire': audio.play('dry'); hud.toast('Out of rounds'); break;
      case 'zombieBump': audio.play('bump', Math.min(1.2, e.speed / 3)); break;
      case 'zombieKnockdown': audio.play('knockdown'); break;
      case 'sprinterSpot': if (dist(e.id) < 14) audio.play('sprinterScream', 1.5, zat(e.id)); break; // her scream before the charge (the warning cue: the threat sign)
      case 'sprinterLock': if (dist(e.id) < 14) { cue(audio, 'warn', 1.2); audio.play('sprinterCharge', 1, zat(e.id)); const z = sim.zombies.find((q) => q.id === e.id); if (z) fx.burst(z.x, 0.05, z.z, 10, 0xcfc6b4, 1.6, 0.3, 0.4, -Math.sin(z.yaw), -Math.cos(z.yaw)); } break; // (her line is fixed: she paws the floor, a kick of dust behind her)
      case 'zombieTumble': audio.play('knockdown'); if (dist(e.id) < 8) shake(0.15); break;
      // the guard's slam (2026-10-18, the user: "a visual effect of the guard on launch, and a strong visual effect for when he
      // impacts the ground.. and small screen shake.. cracks on the ground around him and the shield... and impact smoke"):
      // the launch kicks up a ring of dust at his feet; the impact throws a shockwave ring, tile grit and dust, a cloud of smoke
      // that billows out and hangs, cracks round the shield and under his feet, a short hit-pause and a small shake
      case 'guardLaunch': { audio.play('swing', 0.8, e); fx.burst(e.x, 0.06, e.z, 16, 0xcfc6b4, 2.2, 0.35, 0.45); fx.smoke(e.x, e.z, 5, 0.35, 0.45, 2.2, 0.9); fx.ring(e.x, e.z, 0xd8cfbf, 0.6); break; }
      case 'zombieSlam': {
        const d = Math.hypot(e.x - p.x, e.z - p.z), gz = sim.zombies.find((q) => q.id === e.id);
        audio.play('guardSlam', 1.4, e); fx.ring(e.x, e.z, 0xffffff, 1.7); fx.ring(e.x, e.z, 0xd8cfbf, 1.1);
        fx.burst(e.x, 0.1, e.z, 30, 0xcfc6b4, 3.2, 1.1, 0.8); fx.burst(e.x, 0.05, e.z, 16, 0x6f6658, 3.8, 0.9, 0.6); fx.burst(e.x, 0.3, e.z, 8, 0xe9e2d2, 4.5, 2.2, 0.55);
        fx.smoke(e.x, e.z, 11, 1.0, 1.0, 3.2, 2.4);
        if (gz) fx.floorCrack(gz.x, gz.z, 0.9); // (under his feet: the leap's landing)
        // (2026-10-18 night, the user: "more of an impact ... more particle effects maybe a shake"): a dust wave rolling out in
        // rings, tile chunks thrown high, a second smoke bank, the ceiling shaken (atmos), a harder shake and a deeper stop
        fx.ring(e.x, e.z, 0xe8dfcf, 2.6); fx.ring(e.x, e.z, 0xbfb6a4, 3.6); fx.ring(e.x, e.z, 0x9a917f, 4.4);
        fx.burst(e.x, 0.15, e.z, 26, 0xb9b2a4, 5.5, 3.2, 0.9); fx.burst(e.x, 0.1, e.z, 14, 0x4c463d, 4.5, 2.6, 1.1);
        fx.smoke(e.x, e.z, 9, 1.6, 0.6, 4.4, 2.8, 0x9d9483, 0.45); atmos?.onBigHit?.(e.x, e.z);
        hitPauseT = Math.max(hitPauseT, 0.1);
        if (d < 10) shake(Math.max(0.25, 0.85 - d * 0.06)); if (shakeOn) camState.vz += 0.9 * tuning.shake;
        break;
      }
      case 'floorRumble': { const d = Math.hypot(e.x - p.x, e.z - p.z); cue(audio, 'rumble', Math.max(0.3, 1 - d / 14)); fx.floorCrack?.(e.x, e.z, 0.75); fx.burst(e.x, 0.05, e.z, 8, 0x9a948a, 0.8, 0.4, 0.9); if (d < 9) shake(0.12); break; } // the floor about to break: a crack, grit, a rumble (an emerging zombie: core/sim.js spawnFromFloor)
      case 'floorShudder': { const d = Math.hypot(e.x - p.x, e.z - p.z); fx.growCrack(e.x, e.z, 0.75 + e.k * 0.55); fx.burst(e.x, 0.05, e.z, 4 + Math.round(e.k * 8), 0x9a948a, 0.9 + e.k, 0.5 + e.k * 0.6, 0.6); fx.smoke(e.x, e.z, 1 + Math.round(e.k * 2), 0.35, 0.3, 2.0, 0.9, 0x9d9483, 0.2); if (d < 9) shake(0.05 + e.k * 0.1); break; } // (the breach building: the crack grows, dust)
      case 'floorBreach': { const d = Math.hypot(e.x - p.x, e.z - p.z); cue(audio, 'breach', Math.max(0.35, 1 - d / 14)); audio.play('floorBreach', 1, e); fx.clearCrackAt(e.x, e.z); placeBreach(e.x, e.z); fx.burst(e.x, 0.15, e.z, 24, 0xd9cdb2, 3.2, 2.4, 0.8); fx.burst(e.x, 0.1, e.z, 18, 0x6f6a62, 2.4, 2.0, 1.0); fx.ring(e.x, e.z, 0xd8cfbf, 1.0); fx.smoke(e.x, e.z, 8, 0.6, 0.7, 2.6, 1.8); audio.play('knockdown', 0.9, e); if (d < 9) shake(0.35); break; } // (it bursts up through the tiles: debris high, a dust cloud, a thump)
      case 'ladyPin': { const zz = zat(e.id); audio.play('knockdown', 0.9, zz || e); fx.burst(e.x, 0.6, e.z, 8, 0x5a1414, 2.4, 1.2, 0.5); shake(0.12); break; } // (a walker bowled over by her charge)
      case 'tankHiss': { const d = Math.hypot(e.x - p.x, e.z - p.z); cue(audio, 'hiss', d < 12 ? 1.3 - d / 12 : 0.2); break; } // (a cylinder punctured: core/loose.js O2)
      case 'tankBoom': { // an oxygen cylinder bursts: a fireball, a shock ring, debris, smoke, a flash that lights the room, the boom
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        cue(audio, 'boom', Math.max(0.4, 1.2 - d / 16)); audio.play('shotgunClose', 0.8, e);
        fx.burst(e.x, 0.7, e.z, 40, 0xffc24a, 6.5, 2.6, 0.5); fx.burst(e.x, 0.6, e.z, 26, 0xff6a1a, 5.0, 2.0, 0.65); fx.burst(e.x, 0.5, e.z, 18, 0xfff2c0, 7.5, 1.4, 0.3);
        fx.burst(e.x, 0.3, e.z, 16, 0x3a3631, 5.5, 2.8, 1.0); // (cylinder shrapnel)
        fx.ring(e.x, e.z, 0xfff1d0, 3.4); fx.ring(e.x, e.z, 0xff8a3a, 2.4); fx.smoke(e.x, e.z, 12, 1.4, 1.1, 3.6, 2.8, 0x2e2b28, 0.9); fx.smoke(e.x, e.z, 6, 0.8, 0.9, 3.0, 1.6, 0x6d655c, 0.5);
        fx.floorCrack(e.x, e.z, 1.2); atmos?.onBigHit?.(e.x, e.z);
        fx.flash.position.set(e.x, 1.0, e.z); fx.flash.visible = true; fx.flash.scale.setScalar(3.2); fx.flashT = 0.12;
        fx.flashLight.position.set(e.x, 1.4, e.z); fx.flashLight.distance = 14; fx.flashLight.color.setHex(0xff9a3a); fx.flashLight.intensity = 60;
        hitPauseT = Math.max(hitPauseT, 0.08); if (d < 14) shake(Math.max(0.2, 1.0 - d * 0.06));
        break;
      }
      case 'guardArmOff': audio.play('sever'); audio.play('guardPain', 1, zat(e.id) || e); shake(0.6); hud.popup('ARM OFF'); break; // (his first finisher: the arm flies, render/clipchars.js cutByWeights)
      case 'guardWrench': cue(audio, 'free'); shake(0.3); break; // (the finisher missed: he tears the shield back out of the floor)
      case 'guardRegrip': cue(audio, 'free'); cue(audio, 'heave', 1.2); break; // (the shield in his other hand)
      case 'shieldStuck': cue(audio, 'lodge'); fx.burst(e.x, 0.08, e.z, 18, 0x8a8172, 2.0, 0.6, 0.6); fx.floorCrack?.(e.x, e.z, 1.5); hud.popup('SHIELD STUCK'); break; // (his shield driven into the floor for good: render/fx.js floorCrack)
      case 'guardArmTorn': cue(audio, 'free'); audio.play('sever'); audio.play('guardPain', 1, zat(e.id) || e); shake(0.45); hitPauseT = Math.max(hitPauseT, 0.09); hud.popup('ARM TORN OFF'); break; // (the last heave: his arm stays on the shield)
      case 'guardClub': cue(audio, 'heave', 1.2); break;
      case 'chairTip': audio.play('bump', 1.3); break; // (out of its wheelchair: the chair on its side, core/loose.js)
      case 'bedRise': if (dist(e.id) < 12) audio.play('groan', 1.1); if (sim.__bedCamDone !== true) { sim.__bedCamDone = true; bedCam = { id: e.id, t: 0, dur: 2.0 }; slowBeat(0.55, 1.5); } break; // (the first one she meets: a short cut onto it sitting up)
      case 'guardClubBreak': audio.play('sever'); audio.play('bump', 1.3); shake(0.3); break; // (his torn arm comes apart on the blow: render/clipchars.js breakClub)
      case 'zombieStrikeHit': if (hurtFrame === frameNo) { // (it drew blood: hers, by what it was)
        const z = sim.zombies.find((q) => q.id === e.id), how = STRIKE_BLOOD[e.attack] || 'blunt';
        audio.play('zombieBite', 1, z || p); // (its bite / claw: sound board, Zombies)
        const dx = z ? p.x - z.x : 0, dz = z ? p.z - z.z : 1;
        fx.bloodHit(how, p.x - dx * 0.1, how === 'bite' ? 1.35 : 1.15, p.z - dz * 0.1, dx, dz, how === 'blunt' ? 1.3 : 0.8, 'yola');
        if (e.attack === 'club') { audio.play('bump', 1.4); if (z) fx.bloodHit('blunt', p.x, 1.25, p.z, dx, dz, 1.2); } // (his torn arm: a wet thud, its own blood off it too)
      } break;
      case 'sprinterHit': fx.bloodHit('blunt', p.x, 1.1, p.z, Math.sin(p.aimYaw || 0), Math.cos(p.aimYaw || 0), 1.5, 'yola'); audio.play('bump', 1.2); shake(0.5); break; // her charge ran into Yola // (he pulls his arm off the shield's grip: a club now)
      case 'shieldFree': { const z = sim.zombies.find((q) => q.id === e.id); cue(audio, 'free'); if (z) fx.burst(z.x + Math.sin(z.yaw) * 0.75, 0.1, z.z + Math.cos(z.yaw) * 0.75, 14, 0x8a8172, 2.4, 0.9, 0.5); break; }
      case 'guardFinished': slowBeat(0.3, 0.7); shake(0.6); break; // (his head: the finishing blow)
      case 'dodge': audio.play('swing', 0.75); break;
      case 'grabbed': audio.play('bump', 0.8); break; // (a crawler has her ankle: she is held back, core/player.js grabT)
      // (2026-10-18 night) the perfect dodge pays at the press: Witch Time (the world crawls, Yola at full speed), a white
      // flash, the bass; her next blow or shot is critical (core/sim.js step)
      case 'perfectDodge': slowmo.beat(0.25, 1.2, true); cue(audio, 'perfect'); hud.popup('PERFECT DODGE'); hud.screenFlash(); shake(0.15); break;
      case 'dodgeSuccess': if (!e.perfect) audio.play('swing', 0.5); break; // (a good dodge: clear, no slowdown)
      case 'finisherOpen': cue(audio, 'mark'); break; // (the gold mark: render/finishmark.js)
      // (2026-10-18, the user: "better visual effects for weapon crits when we hit during slow motion"): the snap out of slow
      // motion on a white screen flash, a big star, a white and a gold shockwave, a fan of gold sparks and blood, a beat of hit-stop
      case 'crit': {
        slowEnd(); cue(audio, 'crit'); hud.popup('CRITICAL'); shake(0.6); hitPauseT = Math.max(hitPauseT, 0.1);
        fx.hitFlash(e.x, 1.15, e.z, e.dirX || 0, e.dirZ || 0, 3.4); fx.ring(e.x, e.z, 0xffffff, 1.5); fx.ring(e.x, e.z, 0xffc247, 0.9);
        fx.burst(e.x, 1.15, e.z, 26, 0xffd27a, 5.0, 1.4, 0.4, (e.dirX || 0) * 0.6, (e.dirZ || 0) * 0.6); fx.bloodSpray(e.x, 1.2, e.z, e.dirX || 0, 0.4, e.dirZ || 0, 26, 4);
        const cf = document.getElementById('critFlash'); if (cf) { cf.classList.remove('go'); void cf.offsetWidth; cf.classList.add('go'); }
        break;
      }
      case 'playerDown': audio.play('knockdown'); shake(0.7); hud.drain(); hitPauseT = Math.max(hitPauseT, 0.08); try { navigator.vibrate?.(120); } catch { /* no buzz */ } // (a heavy hit: the colour drains for a beat) if (shakeOn) { camState.vx += e.dirX * 2.2; camState.vz += e.dirZ * 2.2; } break;
      case 'sever': audio.play('sever'); shake(0.15); break;
      case 'ladyBurst': audio.play('sever'); audio.play('zombieDeath'); shake(0.85); break; // (the lady pops: core/sim.js ladyBurst)
      case 'guardEnraged': audio.play('guardEnraged', 1, e); hud.popup('ENRAGED'); shake(0.4); break; // (the guard, both arms gone)
      case 'acidBurn': fx.burst(e.x, 0.1, e.z, 3, 0xd9f25a, 0.6, 1.8, 0.45); break;
      case 'shieldHit': audio.play('shieldHit', e.kind === 'pistol' ? 0.7 : 1, e); fx.impactWall(e.x - e.dirX * 0.45, e.z - e.dirZ * 0.45, -e.dirX, -e.dirZ); if (e.kind !== 'pistol') shake(0.25); break;
      case 'shieldCrack': audio.play('shieldHit', 1.4, e); fx.burst(e.x, 0.6, e.z, 20, 0xe9e1cf, 2.6, 1.0, 0.5); fx.burst(e.x, 0.5, e.z, 8, 0x2f8f92, 2.2, 0.8, 0.45); shake(0.55); break; // (his first slam: the big crack, chips of the cream frame and the teal panel)
      case 'shieldBreak': audio.play('shieldBreak'); cue(audio, 'lodge', 0.8); fx.burst(e.x, 0.6, e.z, 26, 0xe9e1cf, 3.2, 1.2, 0.6); fx.burst(e.x, 0.4, e.z, 12, 0x2f8f92, 2.8, 1.0, 0.5); shake(0.8); hud.popup('SHIELD SHATTERED'); break; // (his second slam: in pieces, frame and all)
      case 'headshot': audio.play('bulletHit', 1.5); shake(0.35); hud.popup('HEADSHOT'); break;
      case 'batMiss': audio.play('batMiss'); break;
      case 'batClank': audio.play('clank', 1, e); fx.impactWall(e.x, e.z, e.nx, e.nz); shake(0.2); break;
      case 'hitPause': hitPauseT = Math.max(hitPauseT, e.dur); break;
      case 'reloadStart': audio.play(e.weapon === 'shotgun' ? 'shotgunReload' : 'pistolReload'); hud.flash('reload'); break;
      case 'reloadDone': audio.play(e.weapon === 'shotgun' ? 'pump' : 'pistolReloadDone'); break;
      case 'swapStart': audio.play('swap'); break;
      case 'zombieWindup': { const z = zat(e.id); if (z?.kind === 'guard') { if (dist(e.id) < 16) audio.play('guardAttack', 1, z); } else if (dist(e.id) < 8) audio.play('windup', 1, z); break; }
      case 'playerHurt': { // (FINISHERS_PLAN.md 5: she notices, it isn't unfun) the red arc from the side it came from, a kick away
        // from it, her grunt; no world hit-stop (that stays the reward for her own hits); a buzz on phones that can
        hurtFrame = frameNo; audio.play('playerHurt'); shake(0.3); p.hurtDirX = e.dirX; p.hurtDirZ = e.dirZ; sim.stats.damageTaken += 1;
        _v.set(p.x, 1, p.z).project(camera); const sx = _v.x, sy = _v.y; _v.set(p.x - e.dirX, 1, p.z - e.dirZ).project(camera);
        hud.hurtFrom(Math.atan2(_v.x - sx, _v.y - sy)); if (shakeOn) { camState.vx += e.dirX * 0.7 * tuning.shake; camState.vz += e.dirZ * 0.7 * tuning.shake; }
        try { navigator.vibrate?.(35); } catch { /* no buzz */ }
        break; }
      case 'playerDeath': audio.play('death'); input.clearAll(); input.enabled = false; hud.death(sim); break;
      case 'zombieDeath': { sim.stats.kills++; const zx = sim.zombies.find((q) => q.id === e.id); audio.play(zx?.kind === 'sprinter' ? 'sprinterDeath' : zx?.kind === 'guard' ? 'guardDeath' : 'zombieDeath', 1, zx || e);
        if (zx?.executed && EXEC_BURST[zx.execWeapon]) gib(e.id, zx.hitDirX, zx.hitDirZ, EXEC_BURST[zx.execWeapon]); // (the bat, the shotgun, the sledgehammer: the full burst)
        if (zx) atmos?.onKill(e.x, e.z, zx.hitDirX || 0, zx.hitDirZ || 0); // (by a wall: its blood up the wall)
        break; }
      case 'critFinisher': cue(audio, 'crit', 0.7); break; // (the 5% critical finisher: core/sim.js critFinisher)
      case 'chainShot': audio.play('shot'); fx.muzzle(yola.muzzleWorld); fx.tracer(yola.muzzleWorld.x, yola.muzzleWorld.y, yola.muzzleWorld.z, e.x, e.z, 0.5, 1.6); fx.bloodHit('pistol', e.x, 1.6, e.z, 0, 0, 1.6); shake(0.25); break; // (the pistol's chain of headshots)
      case 'execStart': execDir.start(e); fx.ring(e.x, e.z, 0xffffff, 1.4); fx.ring(e.x, e.z, 0xffb347, 2.2); audio.play('swing', 0.7); break; // (render/execution.js: time and the camera)
      case 'execHit': { // the finisher lands: freeze, flash, kick, the boom
        execDir.hit(e); shake(0.8); execFlash = 1; atmos?.onBigHit(e.x, e.z); // (no banner, no word: the user)
        if (sim.zombies.find((q) => q.id === e.id)?.headBurst) { audio.play('shotgunClose', 0.9); audio.play('sever', 1.3); shake(0.35); break; } // (Chapter 2's pistol finisher: the head bursts, render/clipchars.js burstHead; no sparks, no rings)
        { const dx = e.dirX || 0, dz = e.dirZ || 0; // the epic hit: a blood blast, a fan of sparks, two shockwaves, dust, the frame flash
          fx.bloodHit(EXEC_BLOOD[e.weapon] || 'blunt', e.x, 1.2, e.z, dx, dz, 2.6);
          fx.burst(e.x, 1.2, e.z, 34, 0xffd27a, 5.5, 1.6, 0.45, dx * 0.7, dz * 0.7); fx.burst(e.x, 1.1, e.z, 16, 0xfff6e8, 3.2, 1.0, 0.25, dx, dz);
          fx.ring(e.x, e.z, 0xffffff, 2.6); fx.ring(e.x, e.z, 0xff5a3a, 1.7); fx.smoke(e.x, e.z, 5, 0.5, 0.45, 2.4, 1.2, 0x8a6d62, 0.6); fx.bloodPool(e.x + dx * 0.6, e.z + dz * 0.6, 1.4);
          const cf = document.getElementById('critFlash'); if (cf) { cf.classList.remove('go'); void cf.offsetWidth; cf.classList.add('go'); } }
        fx.hitFlash(e.x - (e.dirX || 0) * 0.2, 1.15, e.z - (e.dirZ || 0) * 0.2, e.dirX || 0, e.dirZ || 0, 2.4); fx.ring(e.x, e.z, 0xfff1d0, 1.8);
        audio.play('shotgunClose', 0.9); audio.play('sever');
        if (shakeOn) { camState.vx += (e.dirX || 0) * 2.4 * tuning.shake; camState.vz += (e.dirZ || 0) * 2.4 * tuning.shake; }
        if (e.weapon === 'sledgehammer') { fx.floorCrack(e.x, e.z, 1.6); fx.smoke(e.x, e.z, 7, 0.7, 0.6, 2.6, 1.6); fx.ring(e.x, e.z, 0xd8cfbf, 1.4); } // (flattened into the floor)
        break; }
      case 'zombieSpawn': { const z = zat(e.id); if (z?.kind === 'guard') audio.play('guardRoar', 1, z); else if (Math.random() < 0.5) audio.play('zombieAlert', 0.8, z); break; }
      case 'beatStart': hud.banner(`Wave ${e.beat}`); audio.play('wave'); break;
      case 'breather': hud.banner('Breather', 'Next wave incoming'); break;
      case 'encounterCleared': hud.cleared(sim); audio.play('clear'); input.clearAll(); break;
    }
  }
  sim.events.length = 0;
}
const zat = (id) => sim.zombies.find((q) => q.id === id); // (a zombie's place and kind: where its sounds come from, which voice)
const dist = (id) => { const z = sim.zombies.find((q) => q.id === id); return z ? Math.hypot(z.x - sim.player.x, z.z - sim.player.z) : 99; };
const cueState = { key: '', now: '' };
// the floor breaches (core/sim.js spawnFromFloor; assets/props/floor_breach.glb): one stays wherever a zombie broke through,
// for this level (restart clears them); its far inner wall is painted for the game's fixed view, so it is never turned
const breaches = { src: null, list: [] };
function placeBreach(x, z) {
  if (!breaches.src) return;
  // (the story floors are the Outbreak kit's grey tile: the broken tiles take that colour there, cream and teal elsewhere)
  if (LAYOUT.story && !breaches.grey) { breaches.grey = breaches.src.clone(true); breaches.grey.traverse((m) => { if (m.isMesh) { const f = (mt) => { const c = mt.clone(); if (/TileCream/.test(mt.name)) c.color.setRGB(0.42, 0.41, 0.39); else if (/TileTeal/.test(mt.name)) c.color.setRGB(0.3, 0.3, 0.29); return c; }; m.material = Array.isArray(m.material) ? m.material.map(f) : f(m.material); } }); }
  const o = (LAYOUT.story ? breaches.grey : breaches.src).clone(true); o.position.set(x, 0, z); scene.add(o); breaches.list.push(o);
  if (breaches.list.length > 10) breaches.list.shift().removeFromParent();
}
function clearBreaches() { for (const o of breaches.list) o.removeFromParent(); breaches.list.length = 0; }

const slowmo = new SlowMotion(audio); // (render/slowmo.js: the guard's leap, a perfect dodge, a finishing blow)
const slowBeat = (k, d) => slowmo.beat(k, d), slowEnd = () => slowmo.end();
let bedCam = null; // (the first bed patient's cut: updateCamera)
const execDir = new ExecDirector(); let execNow = null, execRingT = 0, execFlash = 0, execGrade = 0, execEmberT = 0; // (render/execution.js: the execution beat; execNow: this frame's)
function shake(k) { if (shakeOn) camState.trauma = Math.min(1, camState.trauma + k * tuning.shake); }

const _ex = new THREE.Vector3();
// The finisher's look (render/execution.js): the world drained and contrasty while it runs (a canvas filter: free), a warm
// key light above the pair (the muzzle flash's light, borrowed: no extra light in the shaders), a white-hot flash on the
// hit, embers drifting through the hang
function execLook(animDt, dt) {
  const X = execNow, on = X ? X.cam : 0;
  execGrade += (on - execGrade) * Math.min(1, dt * 14);
  execFlash = Math.max(0, execFlash - dt * 4.5);
  const g = execGrade, fl = execFlash;
  renderer.domElement.style.filter = g > 0.01 || fl > 0.01 ? `saturate(${(1 - 0.6 * g + 0.4 * fl).toFixed(3)}) contrast(${(1 + 0.22 * g).toFixed(3)}) brightness(${(1 - 0.12 * g + 0.4 * fl).toFixed(3)})` : '';
  const tz = X && sim.zombies.find((q) => q.id === execDir.s?.id);
  if (X && tz) {
    const p = sim.player, mx = (p.x + tz.x) / 2, mz = (p.z + tz.z) / 2;
    fx.flashLight.color.setHex(fl > 0.3 ? 0xfff1d8 : 0xffb066); fx.flashLight.distance = 6.5;
    fx.flashLight.position.set(mx, 2.3, mz); fx.flashLight.intensity = 7 * g + 24 * fl; // (a hot flash on the hit, not a white-out)
    if (X.phase === 'hang' && (execEmberT -= dt) <= 0) { execEmberT = 0.04; fx.burst(tz.x + (Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.8, tz.z + (Math.random() - 0.5) * 0.8, 2, Math.random() < 0.5 ? 0xffc070 : 0x9a1a14, 0.5, 0.9, 1.1); } // (embers and blood mist hanging in the air)
  }
}
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
  // the execution camera (render/execution.js): the game camera's own direction, nearer and lower, on Yola and her target
  // (a little toward her side), a touch tighter; a cut in or a push-in (execCamPush), eased back out
  const X = execNow, b = X ? X.cam * X.cam * (3 - 2 * X.cam) : 0;
  if (b > 0.001) {
    const tz = sim.zombies.find((q) => q.id === execDir.s?.id), zx = tz ? tz.x : px, zz = tz ? tz.z : pz;
    const mx = (px + zx) / 2, mz = (pz + zz) / 2, rx = -fz, rz = fx, ep = THREE.MathUtils.degToRad(tuning.execCamPitch);
    const ed = D * tuning.execCamDist * (1 - 0.1 * (X.creep || 0)), side = 0.25;
    _ex.set(mx - fx * Math.cos(ep) * ed + rx * side, 1.0 + Math.sin(ep) * ed, mz - fz * Math.cos(ep) * ed + rz * side);
    let lx = mx, ly = 1.0, lz = mz;
    // (Chapter 2's pistol finisher, tz.headBurst: closer, over his right shoulder at the zombie's head, the two in line for
    // a phone held upright)
    if (tz?.headBurst) { const dl = Math.hypot(zx - px, zz - pz) || 1, ux = (zx - px) / dl, uz = (zz - pz) / dl; _ex.set(px - ux * 1.7 - uz * 0.5, 1.7 + hoodGroundY(px, pz), pz - uz * 1.7 + ux * 0.5); lx = zx; ly = 1.45 + hoodGroundY(zx, zz); lz = zz; }
    camera.position.lerp(_ex, b);
    camera.lookAt(camState.x + (lx - camState.x) * b, 0.6 + (ly - 0.6) * b, camState.z + (lz - camState.z) * b);
  }
  // the first bed patient sitting up (bedCam): the camera cuts in on it for a beat and eases back
  if (bedCam) {
    bedCam.t += dt; const u = bedCam.t / bedCam.dur, bz = sim.zombies.find((q) => q.id === bedCam.id);
    if (u >= 1 || !bz) bedCam = null;
    else {
      const k = u < 0.12 ? u / 0.12 : u > 0.75 ? (1 - u) / 0.25 : 1, e = k * k * (3 - 2 * k), ep = THREE.MathUtils.degToRad(32), ed = D * 0.42;
      _ex.set(bz.x - fx * Math.cos(ep) * ed, 0.6 + Math.sin(ep) * ed, bz.z - fz * Math.cos(ep) * ed);
      camera.position.lerp(_ex, e); camera.lookAt(camState.x + (bz.x - camState.x) * e, 0.6 + 0.3 * e, camState.z + (bz.z - camState.z) * e);
    }
  }
  { const fov = GAME_FOV * (1 + (tuning.execCamFov - 1) * b); if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); } }
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
  // (2026-10-18 fix) checked every 30th frame by its own count: the history is capped at 600, so 'length % 30' became true on
  // every frame after ten seconds; and never twice within 1.5 s (each change reallocates the screen's buffers)
  perf.n = (perf.n || 0) + 1;
  if (perf.frames.length >= 90 && perf.n % 30 === 0 && !paused && performance.now() - (perf.resizedAt || 0) > 1500) {
    const recent = perf.frames.slice(-90), avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    // (PERF_AUDIT.md 7) only when the GPU is the limit: a lower resolution saves GPU work, not the CPU's. The GPU's own time
    // when the phone can tell (gpuTimer); otherwise a frame whose JS took most of it is CPU-bound. CPU-bound: the
    // sharpness comes back (dropping it would only blur the picture)
    const cpu = perf.cpu.slice(-90), cpuAvg = cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length), gpu = gpuTimer?.avg();
    const gpuBound = gpu != null ? gpu > Math.min(14, avg * 0.7) : cpuAvg < avg * 0.6;
    perf.limit = gpuBound ? 'gpu' : 'cpu';
    if (avg > 21 && renderScale > 0.6 && gpuBound) { renderScale = Math.max(0.6, renderScale - 0.1); resize(); perf.resizedAt = performance.now(); }
    else if ((avg < 14 || !gpuBound) && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.05); resize(); perf.resizedAt = performance.now(); }
  }
}
// the on-screen speed meter (?perf=1, 2026-10-18: the phone reports what it really does): twice a second, frame rate and
// frame time (average, slowest 5%), the JS (CPU) and GPU time per frame, which one is the limit, the resolution and its
// scale, anti-aliasing, shadows, draw calls, triangles, textures on the GPU, JS memory, zombies and the floor
if (params.get('perf') === '1') {
  const el = document.createElement('div'); el.id = 'perfMeter';
  el.style.cssText = 'position:fixed;left:6px;top:215px;z-index:9999;pointer-events:none;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#d8f5e8;background:rgba(0,0,0,0.62);padding:5px 7px;border-radius:6px;white-space:pre';
  document.body.appendChild(el);
  const avgOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  setInterval(() => {
    const f = perf.frames.slice(-60), srt = [...perf.frames.slice(-120)].sort((a, b) => a - b), avg = avgOf(f), p95 = srt.length ? srt[Math.floor(srt.length * 0.95)] : 0;
    const gpu = gpuTimer?.avg(), I = renderer.info, aa = renderer.getContextAttributes()?.antialias;
    const heap = performance.memory ? (performance.memory.usedJSHeapSize / 1e6).toFixed(0) + ' MB' : 'n/a';
    const shadows = renderer.shadowMap.enabled ? (renderer.shadowMap.type === THREE.PCFShadowMap ? 'pcf' : 'soft') : 'off';
    el.textContent = [
      `${avg ? (1000 / avg).toFixed(0) : '-'} fps  frame ${avg.toFixed(1)} ms  slow5% ${p95.toFixed(1)}`,
      `cpu ${avgOf(perf.cpu.slice(-60)).toFixed(1)} ms  gpu ${gpu != null ? gpu.toFixed(1) + ' ms' : 'n/a'}  limit ${perf.limit || '?'}`,
      `${renderer.domElement.width}x${renderer.domElement.height}  scale ${renderScale.toFixed(2)}  dpr ${renderer.getPixelRatio().toFixed(2)}  ${resolvedQuality()}`,
      `AA ${aa ? 'on' : 'off'}  shadows ${shadows}`,
      `calls ${I.render.calls}  tris ${(I.render.triangles / 1000).toFixed(0)}k  tex ${I.memory.textures}  heap ${heap}`,
      `zombies ${sim?.aliveCount?.() ?? '-'}  floor ${LAYOUT.story ? LAYOUT.floor : 'wing'}`,
      // (the heartbeat: 'clock' counts while the page's JS runs; 'frames' only while the game loop runs)
      `clock ${((performance.now() - perf.t0) / 1000).toFixed(1)}s  frames ${perf.frameCount || 0}  stalls ${perf.stalls || 0}${perf.longest ? ' (' + (perf.longest / 1000).toFixed(1) + 's)' : ''}`,
    ].join('\n');
  }, 500);
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
window.game = { yolaModel: YOLA_MODEL, yolaClips: null, get hitPause() { return hitPauseT; }, yolaPose(dt, s) { yola.update(dt, s); }, fxAim(v) { fx.setAim(sim.player.x, sim.player.z, sim.player.aimYaw, v, 0); }, fxBurst(...a) { fx.burst(...a); }, musicStart(k) { music.start(k); }, music, stillYola(dt) { yola.update(dt, stillState(ROOM1.player.x, ROOM1.player.z, ROOM1.player.yaw)); }, hideZombieViews() { for (const v of zviews.values()) { v.hide(); zpool[v.type].push(v); } zviews.clear(); }, applyRoom1, applyLevel, get levelSave() { return levelSave; }, get arena() { return arena; }, cameraPose, previewRoom1, warmRoom1, stillState, hudShow(v) { document.getElementById('hud').style.display = v ? '' : 'none'; document.getElementById('touch').style.pointerEvents = v ? '' : 'none'; }, tick, shot, sheet, footSlide, footPops, simBat: (st, combo = 0) => meleeWorldSegment(sim.player, sim.player.attacks[combo], st, {}), cam(o) { camOverride = o; },  resume() { manualTicks = false; last = performance.now(); }, get sim() { return sim; }, set sim(v) {}, restart, perfReport, tuning, setPaused, uiAction, scriptInput: null, telegraphs, get looks() { return looks; }, get yola() { return yola; }, get physics() { return physics; }, zviews, get zThrottle() { return zThrottle; }, set zThrottle(v) { zThrottle = !!v; }, get atmos() { return atmos; }, get lightkit() { return lightkit; }, warmStoryLight, storyLight(on) { if (LAYOUT.story && lightkit && storyLit !== !!on) storyLighting(!!on); }, revealLight, ZombieView, get fx() { return fx; }, get execActive() { return execDir.active; }, clearPieces() { ZombieView.clearPieces(); gibs.clear(); }, get looseMeshes() { return ZombieView.looseMeshes; }, get propSrc() { return ZombieView.propSrc; }, propsAdd(o) { ZombieView.props.push(o); }, lab: { kill: (...a) => physlab.kill(window.game, ...a), pile: (...a) => physlab.pile(window.game, ...a), sever: (...a) => physlab.sever(window.game, ...a), blast: (...a) => physlab.blast(window.game, ...a), combo: (...a) => physlab.combo(window.game, ...a) }, get pieces() { return ZombieView.pieces; }, scrubs: (v, k) => setScrubs(v, k), SCRUBS, THREE, camera, renderer, scene };
hud.perfReport = perfReport;
load().catch((e) => { console.error(e); hud.error(String(e)); });
