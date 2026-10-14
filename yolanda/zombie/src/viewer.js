// Rig lab: plays Yola / the zombies frame by frame next to the Mixamo reference (the clip's source
// skeleton, which is known to be correct), with weapon-fit sliders. Open /zombie/viewer.html.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { prepShotgun, prepPumpShort, prepShell } from './render/weaponModels.js';
import { ikArm } from './render/ik.js';
import { SHOTGUN_SPEC } from './core/weapons.js';

const FPS = 30;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

const CHARS = {
  yola: { label: 'Yola', file: 'assets/yola.glb', height: 1.62, ref: 'yola_' },
  nurse: { label: 'Zombie nurse', file: 'assets/zombie-nurse-mod.glb', height: 1.78, ref: 'zombie_' },
  patient: { label: 'Zombie patient', file: 'assets/zombie-patient-mod.glb', height: 1.78, ref: 'zombie_' },
};
// clips whose Mixamo source file is named differently
const REF_ALIAS = { pistol_reload: 'reload_walk' };
const GUNS = { none: 'no weapon', old: 'pump shotgun (old, too long)', short: 'short pump (new)' };
const GUN_FILES = { old: 'assets/weapons/pump_shotgun.glb', short: 'assets/weapons/pump_short.glb' };

// ---------------- scene ----------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1d262b);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 60);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x445055, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 3); scene.add(sun);
scene.add(new THREE.GridHelper(6, 24, 0x4b5f68, 0x33444c));
const controls = new OrbitControls(camera, canvas); controls.target.set(0, 0.85, 0); controls.enableDamping = true;
function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const CAMS = { face: [0, 1.42, 0.85], front: [0, 1.0, 3.4], side: [3.4, 1.0, 0], back: [0, 1.0, -3.4], top: [0, 4.4, 0.01], three: [2.4, 1.5, 2.6] };
function setCam(k) { const p = CAMS[k]; camera.position.set(...p); controls.target.set(0, k === 'face' ? 1.38 : 0.85, 0); controls.update(); }
setCam('three');
for (const b of document.querySelectorAll('[data-cam]')) b.onclick = () => setCam(b.dataset.cam);

// ---------------- loading ----------------
const gltfLoader = new GLTFLoader(), fbxLoader = new FBXLoader();
const loadG = (f) => new Promise((res, rej) => gltfLoader.load(f, res, undefined, rej));
const loadF = (f) => new Promise((res, rej) => fbxLoader.load(f, res, undefined, rej));
const refCache = new Map();
function refClip(file) { // Mixamo source clip (skeleton-only FBX)
  if (!refCache.has(file)) refCache.set(file, loadF(file).then((o) => o.animations[0] || null).catch(() => null));
  return refCache.get(file);
}
function pinRoot(clip, on) {
  // keep the vertical bob, pin horizontal hips motion to the first frame
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    if (!t.__orig) t.__orig = t.values.slice();
    const v = t.values, o = t.__orig;
    for (let i = 0; i < v.length; i += 3) { v[i] = on ? o[0] : o[i]; v[i + 2] = on ? o[2] : o[i + 2]; }
  }
}
const clipT0 = (c) => Math.min(...c.tracks.map((t) => t.times[0]));
const clipFrames = (c) => Math.round((c.duration - clipT0(c)) * FPS) + 1;

class Actor {
  constructor(obj, height) {
    this.root = new THREE.Group(); this.obj = obj; this.root.add(obj);
    const box = new THREE.Box3().setFromObject(obj); this.nat = box.max.y - box.min.y; // natural height
    this.setHeight(height);
    this.mixer = new THREE.AnimationMixer(obj);
    this.bones = {}; obj.traverse((o) => { if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o; });
    this.helper = new THREE.SkeletonHelper(obj); this.helper.visible = false; this.helper.material.depthTest = false;
    this.clip = null; this.action = null; this.frames = 1; this.t0 = 0;
  }
  setHeight(h) { this.height = h; this.root.scale.setScalar(h / this.nat); this.root.updateMatrixWorld(true); }
  play(clip) {
    if (this.action) this.action.stop();
    this.mixer.uncacheRoot(this.obj);
    this.clip = clip; this.t0 = clipT0(clip); this.frames = clipFrames(clip);
    this.action = this.mixer.clipAction(clip); this.action.play(); this.action.timeScale = 0;
  }
  setFrame(f) {
    if (!this.action) return;
    this.action.time = clamp(this.t0 + (f - 1) / FPS, 0, this.clip.duration);
    this.mixer.update(0); this.root.updateMatrixWorld(true);
  }
  grip(side, out) { // between the wrist and the middle-finger knuckle (same as the game)
    const h = this.bones[side + 'Hand'], m = this.bones[side + 'HandMiddle1'];
    h.getWorldPosition(out); m.getWorldPosition(_v3); return out.add(_v3).multiplyScalar(0.5);
  }
}

// ---------------- weapon fit ----------------
// Same math as the game's shotgun socket: at a "fit frame" the gun's +X (barrel) points from the right
// grip to the left grip, +Y up; that orientation is stored in the right hand's frame and followed.
const FIT0 = { ox: 0, oy: 0, oz: 0, rx: 0, ry: 0, rz: 0, s: 1 };
const fit = { ...FIT0 };
// the shell carried in the left hand (offset in the left hand's frame, metres; rotation degrees)
const SH0 = { ...SHOTGUN_SPEC.shell, slide: 0 };
const shellFit = { ...SH0 };
const SHELL_ROWS = [['x', 'shell X', -0.1, 0.1, 0.002], ['y', 'shell Y', -0.1, 0.1, 0.002], ['z', 'shell Z', -0.1, 0.1, 0.002], ['rx', 'roll X', -180, 180, 1], ['ry', 'yaw Y', -180, 180, 1], ['rz', 'pitch Z', -180, 180, 1], ['from', 'shown from', 0, 200, 1], ['to', 'shown to', 0, 200, 1], ['slide', 'pump slide', 0, 0.1, 0.002]];
const FIT_ROWS = [['ox', 'fwd (X)', -0.2, 0.2, 0.002], ['oy', 'up (Y)', -0.2, 0.2, 0.002], ['oz', 'side (Z)', -0.2, 0.2, 0.002], ['rx', 'roll X', -180, 180, 1], ['ry', 'yaw Y', -180, 180, 1], ['rz', 'pitch Z', -180, 180, 1], ['s', 'scale', 0.3, 2.5, 0.01]];
class Gun {
  constructor(actor) { this.actor = actor; this.obj = null; this.socket = new THREE.Quaternion(); this.has = false; }
  setObject(o) { if (this.obj) scene.remove(this.obj); this.obj = o; if (o) { scene.add(o); this.calibrate(); } }
  calibrate() {
    const a = this.actor; if (!this.obj || !a.action) return;
    a.grip('Right', _v); a.grip('Left', _v2);
    const x = _v2.clone().sub(_v).normalize(), z = new THREE.Vector3().crossVectors(x, UP).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    const g = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    a.bones.RightHand.getWorldQuaternion(_q); this.socket.copy(_q.invert().multiply(g)); this.has = true;
  }
  update(k) { // k: world size of this actor relative to Yola (1 for Yola)
    if (!this.obj || !this.has) return;
    const a = this.actor; a.bones.RightHand.getWorldQuaternion(_q);
    const adj = new THREE.Quaternion().setFromEuler(new THREE.Euler(fit.rx * Math.PI / 180, fit.ry * Math.PI / 180, fit.rz * Math.PI / 180, 'XYZ'));
    const gq = _q.multiply(this.socket).multiply(adj);
    a.grip('Right', _v);
    this.obj.quaternion.copy(gq);
    this.obj.position.copy(_v).add(_v2.set(fit.ox, fit.oy, fit.oz).multiplyScalar(k).applyQuaternion(gq));
    this.obj.scale.setScalar(fit.s * k);
    this.obj.updateMatrixWorld(true);
  }
}

// ---------------- state ----------------
const S = { char: 'yola', playing: true, frame: 1, speed: 1, overlay: false, gun: 'short', frames: 1 };
let main, ref, mainGun, refGun;
const gunTemplates = {}, marks = {}, mainCache = {};
function ghostify(obj, on) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.__mat) o.__mat = o.material;
    o.material = on ? new THREE.MeshBasicMaterial({ color: 0x66d4ff, transparent: true, opacity: 0.4, depthWrite: false }) : o.__mat;
  });
}
function makeMarks() {
  const mk = (c) => new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: c, depthTest: false }));
  const line = (c) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 0.01)]), new THREE.LineBasicMaterial({ color: c, depthTest: false }));
  for (const k of ['main', 'ref']) {
    marks[k] = { r: mk(0xff5050), l: mk(0x50a0ff), line: line(k === 'main' ? 0xffd24d : 0x66d4ff) };
    for (const m of Object.values(marks[k])) { m.renderOrder = 10; m.frustumCulled = false; scene.add(m); }
  }
}
function updateMarks() {
  const on = $('marks').checked;
  for (const [k, a] of [['main', main], ['ref', ref]]) {
    const m = marks[k]; if (!m || !a) continue;
    const vis = on && (k === 'main' || a.root.visible);
    for (const o of Object.values(m)) o.visible = vis;
    if (!vis || !a.action) continue;
    a.grip('Right', _v); a.grip('Left', _v2);
    m.r.position.copy(_v); m.l.position.copy(_v2);
    m.line.geometry.setFromPoints([_v.clone(), _v2.clone()]);
  }
}

async function setChar(key) {
  S.char = key;
  for (const b of document.querySelectorAll('#chars button')) b.classList.toggle('on', b.dataset.k === key);
  if (main) { scene.remove(main.root, main.helper); mainGun?.setObject(null); }
  if (!mainCache[key]) {
    const g = await loadG(CHARS[key].file);
    g.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; if (/^GORE_/.test(o.name)) o.visible = false; });
    mainCache[key] = { gltf: g, actor: new Actor(g.scene, CHARS[key].height) };
  }
  const { gltf, actor } = mainCache[key];
  main = actor; scene.add(main.root, main.helper);
  mainGun = new Gun(main);
  const sel = $('clip'); sel.innerHTML = '';
  for (const c of gltf.animations) sel.add(new Option(`${c.name}  (${clipFrames(c)}f)`, c.name));
  const first = key === 'yola' ? 'reload_rifle_stand' : gltf.animations[0].name;
  sel.value = gltf.animations.some((c) => c.name === first) ? first : gltf.animations[0].name;
  await setClip(sel.value);
  applyGun();
}
async function setClip(name) {
  const c = mainCache[S.char].gltf.animations.find((x) => x.name === name);
  pinRoot(c, $('inplace').checked); main.play(c);
  const base = REF_ALIAS[name] || name; // the reference: the Mixamo source of this clip
  const file = `assets/mixamo/${CHARS[S.char].ref}${base}.fbx`;
  const rc = await refClip(file);
  const rsel = $('refclip'); rsel.innerHTML = '';
  if (rc) { rsel.add(new Option(file.split('/').pop(), file)); $('note').textContent = ''; }
  else { rsel.add(new Option('no Mixamo source for this clip', '')); $('note').textContent = 'No Mixamo reference for this clip (Tripo or custom clip).'; }
  ref.root.visible = !!rc; ref.helper.visible = !!rc && $('bones').checked;
  if (rc) { pinRoot(rc, $('inplace').checked); ref.play(rc); }
  S.frames = Math.max(main.frames, rc ? ref.frames : 1);
  $('scrub').max = S.frames; S.frame = 1;
  layout(); refresh(); mainGun.calibrate(); refGun?.calibrate(); refresh();
}
function layout() {
  const sep = S.overlay ? 0 : 0.55;
  main.root.position.set(-sep, 0, 0); ref.root.position.set(sep, 0, 0);
  ref.setHeight($('match').checked ? main.height : ref.nat);
  ghostify(ref.obj, S.overlay);
  $('lay').textContent = S.overlay ? 'overlay (ghost)' : 'side by side';
  main.root.updateMatrixWorld(true); ref.root.updateMatrixWorld(true);
}
const PUMP = { auto: true, a: 80, b: 96, stroke: 0.07, portDown: 0.05 };
function pumpSlide(f) {
  let s = shellFit.slide;
  if (PUMP.auto && $('clip').value === 'sg_reload' && f >= PUMP.a && f <= PUMP.b) s += PUMP.stroke * Math.sin(Math.PI * (f - PUMP.a) / (PUMP.b - PUMP.a));
  return s;
}
const _m1 = new THREE.Vector3(), _m2 = new THREE.Vector3();
const smooth01 = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
function leftHand(f) {
  const g = mainGun?.obj; if (!g || !main.action) return;
  const U = g.userData; if (!U.pump) return;
  U.pump.position.x = U.pumpX - pumpSlide(f); g.updateMatrixWorld(true);
  if (!$('ik').checked) return;
  const B = main.bones, ik = (t, w) => ikArm(B.LeftArm, B.LeftForeArm, B.LeftHand, t, w);
  main.grip('Left', _m1);
  // the shell goes up into the loading port from below
  const shellOn = f >= shellFit.from && f <= shellFit.to && shellFit.to > shellFit.from;
  let wPort = 0;
  if (shellOn && U.port) {
    const target = g.localToWorld(U.port.position.clone().add(new THREE.Vector3(0, -PUMP.portDown, 0)));
    wPort = smooth01(1 - (_m1.distanceTo(target) - 0.05) / 0.2);
    if (wPort > 0) { ik(target, wPort); main.grip('Left', _m1); }
  }
  // otherwise the hand stays on the pump wherever it slides
  const rest = g.localToWorld(new THREE.Vector3(U.pumpX, 0, 0).add(U.gripL.position.clone().setX(0)));
  const wHold = smooth01(1 - (_m1.distanceTo(rest) - 0.03) / 0.12) * (1 - wPort);
  if (wHold > 0) ik(U.gripL.getWorldPosition(_m2), wHold);
}
function alignShell() { // the shell's axis points from the hand to the loading port, its tip at the port
  const g = mainGun?.obj; if (!g?.userData.port) return;
  main.bones.LeftHand.getWorldQuaternion(_q); main.grip('Left', _v);
  g.userData.port.getWorldPosition(_v2);
  const d = _v2.clone().sub(_v), L = d.length(); d.normalize().applyQuaternion(_q.clone().invert());
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d), e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  Object.assign(shellFit, { rx: e.x * 180 / Math.PI, ry: e.y * 180 / Math.PI, rz: e.z * 180 / Math.PI, x: Math.max(0, L - 0.037), y: 0, z: 0 });
  window.__lab.setShell({});
}
let shellTemplate = null, shellObj = null;
function updateShell(f) {
  if (!shellObj) return;
  const on = !!main.action && f >= shellFit.from && f <= shellFit.to && shellFit.to > shellFit.from && S.gun === 'short';
  shellObj.visible = on; if (!on) return;
  main.bones.LeftHand.getWorldQuaternion(_q);
  const adj = new THREE.Quaternion().setFromEuler(new THREE.Euler(shellFit.rx * Math.PI / 180, shellFit.ry * Math.PI / 180, shellFit.rz * Math.PI / 180, 'XYZ'));
  const q = _q.multiply(adj);
  main.grip('Left', _v);
  shellObj.quaternion.copy(q);
  shellObj.position.copy(_v).add(_v2.set(shellFit.x, shellFit.y, shellFit.z).applyQuaternion(_q.copy(q)));
  shellObj.updateMatrixWorld(true);
}
function applyGun() {
  mainGun?.setObject(null); refGun?.setObject(null);
  const t = gunTemplates[S.gun];
  if (S.gun === 'none' || !t) return;
  const mk = () => { const o = t.clone(true); o.userData = { ...t.userData, gripL: o.getObjectByName('GameGrip_L'), port: o.getObjectByName('LoadPort'), pump: o.getObjectByName('Pump') }; return o; };
  mainGun.setObject(mk());
  if ($('gunref').checked) refGun.setObject(mk());
}
function refresh() {
  if (!main) return;
  const f = Math.max(1, Math.min(S.frames, Math.round(S.frame)));
  main.setFrame(Math.min(f, main.frames));
  if (ref.root.visible) ref.setFrame(Math.min(f, ref.frames));
  mainGun?.update(1); leftHand(f);
  if (refGun?.obj) { refGun.obj.visible = ref.root.visible; refGun.update(ref.height / main.height); }
  updateMarks(); updateShell(f);
  $('scrub').value = f;
  $('frameInfo').textContent = `frame ${f} / ${S.frames}  (${(f / FPS).toFixed(2)} s)`;
  const lines = [];
  if (main.action) { main.grip('Right', _v); main.grip('Left', _v2); lines.push(`${CHARS[S.char].label}   hand span ${_v.distanceTo(_v2).toFixed(3)} m`); }
  if (ref.root.visible && ref.action) { ref.grip('Right', _v); ref.grip('Left', _v2); lines.push(`Reference   hand span ${_v.distanceTo(_v2).toFixed(3)} m`); }
  const hold = mainGun?.obj?.userData.gripL;
  if (hold && main.action) { hold.getWorldPosition(_v); main.grip('Left', _v2); lines.push(`left hand to gun hold point ${_v.distanceTo(_v2).toFixed(3)} m`); }
  const port = mainGun?.obj?.userData.port;
  if (port && main.action) { port.getWorldPosition(_v); main.grip('Left', _v2); lines.push(`left hand to loading port ${_v.distanceTo(_v2).toFixed(3)} m`); }
  $('readout').textContent = lines.join('\n');
  $('fitOut').value = JSON.stringify({ gun: S.gun, clip: $('clip').value, shell: shellFit, ...Object.fromEntries(Object.entries(fit).map(([k, v]) => [k, +(+v).toFixed(4)])) }, null, 1);
}

// ---------------- UI ----------------
function pausedUI(p) { S.playing = !p; $('play').textContent = S.playing ? 'Pause' : 'Play'; $('play').classList.toggle('on', S.playing); }
function buildUI() {
  for (const k in CHARS) { const b = document.createElement('button'); b.textContent = CHARS[k].label; b.dataset.k = k; b.onclick = () => setChar(k); $('chars').appendChild(b); }
  for (const k in GUNS) $('gun').add(new Option(GUNS[k], k));
  $('gun').value = S.gun;
  $('gun').onchange = (e) => { S.gun = e.target.value; applyGun(); refresh(); };
  $('gunref').onchange = () => { applyGun(); refresh(); };
  const host = $('fit');
  for (const [k, label, lo, hi, st] of FIT_ROWS) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label>${label}</label><input type="range" min="${lo}" max="${hi}" step="${st}" value="${fit[k]}"><span>${fit[k]}</span>`;
    const inp = row.querySelector('input'), sp = row.querySelector('span');
    inp.oninput = () => { fit[k] = +inp.value; sp.textContent = (+inp.value).toFixed(k === 's' ? 2 : 3); refresh(); };
    row._set = (v) => { inp.value = v; sp.textContent = (+v).toFixed(k === 's' ? 2 : 3); };
    row.dataset.k = k; host.appendChild(row);
  }
  const host2 = $('fit2');
  for (const [k, label, lo, hi, st] of SHELL_ROWS) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label>${label}</label><input type="range" min="${lo}" max="${hi}" step="${st}" value="${shellFit[k]}"><span>${shellFit[k]}</span>`;
    const inp = row.querySelector('input'), sp = row.querySelector('span');
    inp.oninput = () => { shellFit[k] = +inp.value; sp.textContent = (+inp.value).toFixed(3); refresh(); };
    row._set = (v) => { inp.value = v; sp.textContent = (+v).toFixed(3); };
    row.dataset.k = k; host2.appendChild(row);
  }
  $('alignShell').onclick = alignShell;
  $('fitReset').onclick = () => { Object.assign(fit, FIT0); for (const r of host.children) r._set(fit[r.dataset.k]); refresh(); };
  $('fitHere').onclick = () => { mainGun.calibrate(); refGun.calibrate(); refresh(); };
  $('clip').onchange = (e) => setClip(e.target.value);
  $('lay').onclick = () => { S.overlay = !S.overlay; layout(); refresh(); };
  $('match').onchange = () => { layout(); refresh(); };
  $('marks').onchange = refresh;
  $('bones').onchange = () => { main.helper.visible = $('bones').checked; ref.helper.visible = $('bones').checked && ref.root.visible; };
  $('inplace').onchange = () => setClip($('clip').value);
  $('speed').onchange = (e) => { S.speed = +e.target.value; };
  $('toggleSide').onclick = () => $('side').classList.toggle('open');
  const ui = () => { for (const id of ['top', 'bottom', 'side']) { const el = $(id); el.hidden = !el.hidden; } };
  $('hideUI').onclick = ui;
  addEventListener('keydown', (e) => { if (e.code === 'KeyH' && e.target.tagName !== 'TEXTAREA') ui(); });
  const step = (d) => { pausedUI(true); S.frame = ((Math.round(S.frame) - 1 + d + S.frames * 100) % S.frames) + 1; refresh(); };
  $('prev').onclick = () => step(-1); $('next').onclick = () => step(1); $('prev10').onclick = () => step(-10); $('next10').onclick = () => step(10);
  const toggle = () => pausedUI(S.playing);
  $('play').onclick = toggle;
  $('scrub').oninput = (e) => { pausedUI(true); S.frame = +e.target.value; refresh(); };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowLeft') step(e.shiftKey ? -10 : -1);
    else if (e.code === 'ArrowRight') step(e.shiftKey ? 10 : 1);
  });
}

// ---------------- main ----------------
(async function init() {
  buildUI(); makeMarks();
  // reference: the Mixamo X Bot with skin (its own pistol-idle clip is replaced by the selected source clip)
  const xb = await loadF('assets/mixamo/reference/ref_xbot_pistol_idle.fbx');
  xb.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  ref = new Actor(xb, 1.62); ref.root.visible = false; scene.add(ref.root, ref.helper);
  refGun = new Gun(ref);
  for (const [k, f] of Object.entries(GUN_FILES)) {
    try { const g = await loadG(f); gunTemplates[k] = k === 'short' ? prepPumpShort(g) : prepShotgun(g); } catch { /* not built yet */ }
  }
  for (const k of Object.keys(GUNS)) if (k !== 'none' && !gunTemplates[k]) $('gun').querySelector(`option[value=${k}]`).textContent += ' (not built yet)';
  try { const g = await loadG('assets/weapons/shell.glb'); shellTemplate = prepShell(g); shellObj = shellTemplate; shellObj.visible = false; scene.add(shellObj); } catch { /* not built yet */ }
  await setChar('yola');
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.playing && main?.action) {
      S.frame += dt * FPS * S.speed;
      if (S.frame >= S.frames + 1) S.frame = $('loop').checked ? 1 : S.frames;
      refresh();
    }
    controls.update(); renderer.render(scene, camera);
  });
  window.__lab = { PUMP, alignShell, gunObj: () => mainGun?.obj, shellFit, setShell: (o) => { Object.assign(shellFit, o); for (const r of $('fit2').children) r._set(shellFit[r.dataset.k]); refresh(); }, camera, controls, setCam, S, fit, get main() { return main; }, get ref() { return ref; }, scene, refresh, setChar, setClip, applyGun, setFrame: (f) => { pausedUI(true); S.frame = f; refresh(); } };
})();
