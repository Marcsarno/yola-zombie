// Rig lab: plays Yola / the zombies frame by frame next to the Mixamo reference (the clip's source
// skeleton, which is known to be correct), with weapon-fit sliders. Open /zombie/viewer.html.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { prepShotgun, prepPumpShort, prepShell, makePistol, makeBat, prepAxe, prepPistolCore, PISTOL_CORE_SCALE } from './render/weaponModels.js';
import { ikArm } from './render/ik.js';
import { HairSway } from './render/hairsway.js';
import { SHOTGUN_SPEC, BAT_DEF } from './core/weapons.js';
import { placeOneHanded, twoHandLine, applyFit } from './render/holdfit.js';
import { applyPosture, postureFamily, POSTURE_BONES } from './render/posture.js';

let FPS = 30; // the current clip's frame rate (the bat combo: 60)
const CLIP_FPS = { bat_combo_mc: 60 };
// the bat combo's reference footage: clip 13, frame = clip frame + 19 (frames 20..184), with the detected skeleton
const VIDREF = { bat_combo_mc: { dir: 'assets/ref/bat13/', offset: 19, first: 20, last: 184 } };
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

// the new Yola's clips and their X Bot source files (tools/anim/yola2_build.py retargets each from its source; the
// clips made by editing a Mixamo clip are shown against the clip they were made from)
const YOLA2_REF = { bat_swing: 'yola_baseball_single', bat_swing_m: null, pistol_reload: 'yola_reload_walk', sg_reload: 'yola_reload_rifle_stand',
  p_run_back_plain: 'yola_run_back_plain', p_run_plain: 'yola_run_plain', p_run_strafe_left_plain: 'yola_run_strafe_left_plain',
  p_run_strafe_right_plain: 'yola_run_strafe_right_plain', p_walk_strafe_left_plain: 'yola_walk_strafe_left_plain',
  p_walk_strafe_right_plain: 'yola_walk_strafe_right_plain', yola_knockdown: 'zombie_knockdown', yola_getup: 'zombie_standup_stomach',
  pistol_strafe_left: null, pistol_strafe_run_left: null, pistol_strafe_run_right: null }; // (built from several clips: no single source)
const CHARS = {
  yola: { label: 'Yola', file: 'assets/yola.glb', extra: ['assets/yola_combo.glb', 'assets/yola_sword.glb'], height: 1.62, ref: 'yola_' },
  // the new Yola (2026-10-16, the user's Tripo nurse-scrubs model): every game clip plus the library picks
  yola2: { label: 'Yola 2 (new model)', file: 'assets/yola2.glb', extra: ['assets/moves/yola2_moves.glb'], height: 1.62, ref: 'yola_', refMap: YOLA2_REF,
    libRef: { pistol_reload: 'ual1_Pistol_Reload' } }, // (2026-10-17: her reload is Quaternius Pistol_Reload, support hand on the gun)
  nurse: { label: 'Zombie nurse', file: 'assets/zombie-nurse-mod.glb', height: 1.78, ref: 'zombie_' },
  patient: { label: 'Zombie patient', file: 'assets/zombie-patient-mod.glb', height: 1.78, ref: 'zombie_' },
  // tools/anim/build_zombie.py (2026-10-15): the sprinter (hand weights fixed: the cargo pockets no longer follow her
  // hands) and the big guard (his shield is still being modelled)
  sprinter: { label: 'Zombie sprinter (big lady)', file: 'assets/zombie-sprinter.glb', height: 2.0, ref: 'zombie_' },
  guard: { label: 'Zombie big guard', file: 'assets/zombie-guard.glb', height: 2.05, ref: 'zombie_' },
};
// library clips (ual_ / ual1_): the reference is Quaternius's own mannequin playing the clip (assets/source/ual, local only)
const UAL_FILES = { ual_: 'assets/source/ual/UAL2_Standard.glb', ual1_: 'assets/source/ual/UAL1_Standard.glb' };
const UE_MAP = { pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head' };
for (const [s, S2] of [['l', 'Left'], ['r', 'Right']]) {
  Object.assign(UE_MAP, { [`clavicle_${s}`]: S2 + 'Shoulder', [`upperarm_${s}`]: S2 + 'Arm', [`lowerarm_${s}`]: S2 + 'ForeArm', [`hand_${s}`]: S2 + 'Hand',
    [`thigh_${s}`]: S2 + 'UpLeg', [`calf_${s}`]: S2 + 'Leg', [`foot_${s}`]: S2 + 'Foot', [`ball_${s}`]: S2 + 'ToeBase' });
  // every finger (the pistol in the mannequin's fist needs the index and pinky knuckles; finger bones overlay too)
  for (const [f, F] of [['thumb', 'Thumb'], ['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky']]) for (const i of [1, 2, 3]) UE_MAP[`${f}_0${i}_${s}`] = `${S2}Hand${F}${i}`;
}
// clips whose Mixamo source file is named differently
const REF_ALIAS = { pistol_reload: 'reload_walk', sg_reload: 'reload_rifle_stand' };
// clips cut from the middle of their source: the source frame that her frame 1 is (pistol_reload = X Bot's reload_walk
// frames 38-99, measured by matching both hands over the clip, 2026-10-16; before this the two were shown out of step)
const REF_OFFSET = { pistol_reload: 37 };
const GUNS = { auto: 'auto (match the clip)', none: 'no weapon', pistol: 'pistol', short: 'shotgun (short pump)', old: 'shotgun (old, too long)', axe: 'fire axe', bat: 'baseball bat' };
const HELD = { pistol: 1, axe: 1, bat: 1 }; // held by the hands directly (the shotguns use the fitted socket below)
const autoWeapon = (name) => /bat|baseball|homerun/.test(name) ? 'bat' : /chop|gs_|slash|axe/.test(name) ? 'axe' : /^sg_|shotgun|reload_rifle|rifle/.test(name) ? 'short' : /pistol|t_shoot/.test(name) ? 'pistol' : 'none';
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
const CAMS = { face: [0, 1.42, 0.85], front: [0, 1.0, 3.4], side: [3.4, 1.0, 0], left: [-3.4, 1.0, 0], back: [0, 1.0, -3.4], top: [0, 4.4, 0.01], three: [2.4, 1.5, 2.6] };
function setCam(k) { const p = CAMS[k]; camera.position.set(...p); controls.target.set(0, k === 'face' ? 1.38 : 0.85, 0); controls.update(); }
// zoom onto one rig's hands, keeping the current viewing direction (orbit around them afterwards)
function camHands(who) {
  const a = who === 'ref' ? ref : main; if (!a?.action || !a.root.visible) return;
  a.grip('Right', _v); a.grip('Left', _v2); const c = _v.clone().lerp(_v2, 0.5);
  const dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(c); camera.position.copy(c).addScaledVector(dir, 0.5); controls.update();
}
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
function pinRoot(clip, on, a) {
  // keep the vertical bob, pin horizontal hips motion to the rig's own rest spot (as the game strips to the rest hips;
  // pinning to the first frame left a clip cut from mid-walk, e.g. the reload from X Bot frame 38, a step forward).
  // (a: the actor, for its bones' rest positions; the Quaternius rig is Z-up, so "0" would have sunk it)
  for (const t of clip.tracks) {
    if (!/(Hips|pelvis|root)\.position$/.test(t.name)) continue;
    if (!t.__orig) t.__orig = t.values.slice();
    const v = t.values, o = t.__orig, r = a?.restPos?.[t.name.split('.')[0].replace(/^mixamorig:?/, '')], rx = r ? r.x : o[0], rz = r ? r.z : o[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = on ? rx : o[i]; v[i + 2] = on ? rz : o[i + 2]; }
  }
}
const clipT0 = (c) => Math.min(...c.tracks.map((t) => t.times[0]));
const fpsOf = (c) => CLIP_FPS[c.name] || 30;
const clipFrames = (c) => Math.round((c.duration - clipT0(c)) * fpsOf(c)) + 1;

// Finger bones drawn over the mesh (the user, 2026-10-16: "the finger skeleton enabled"): a dot on every finger joint and a
// line from each joint to its parent, coloured per finger (thumb red, index yellow, middle green, ring blue, pinky violet).
const FCOL = { thumb: 0xff4d4d, index: 0xffd24d, middle: 0x4dff88, ring: 0x4dc3ff, pinky: 0xd27bff };
const fingerKind = (n) => { const m = /thumb|index|middle|ring|pinky/i.exec(n); return m ? m[0].toLowerCase() : null; };
const FSPH = new THREE.SphereGeometry(0.0045, 8, 6);
const ACTORS = [];
class FingerSkel {
  constructor(actor) {
    this.a = actor; this.g = new THREE.Group(); this.g.visible = false; this.joints = []; this.pairs = [];
    actor.obj.traverse((b) => {
      if (!b.isBone) return; const k = fingerKind(b.name); if (!k) return;
      const s = new THREE.Mesh(FSPH, new THREE.MeshBasicMaterial({ color: FCOL[k], depthTest: false })); s.renderOrder = 12; s.frustumCulled = false;
      this.g.add(s); this.joints.push([b, s]);
      if (b.parent?.isBone) this.pairs.push([b.parent, b, new THREE.Color(FCOL[k])]);
    });
    const geo = new THREE.BufferGeometry(), n = this.pairs.length * 2;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3); this.pairs.forEach(([, , c], i) => { for (const j of [0, 1]) c.toArray(col, (i * 2 + j) * 3); });
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })); this.lines.renderOrder = 12; this.lines.frustumCulled = false;
    this.g.add(this.lines); scene.add(this.g);
  }
  update(show) {
    this.g.visible = show; if (!show) return;
    const k = this.a.height / 1.62;
    for (const [b, s] of this.joints) { b.getWorldPosition(s.position); s.scale.setScalar(k); }
    const P = this.lines.geometry.attributes.position;
    this.pairs.forEach(([p, c], i) => { p.getWorldPosition(_v3); P.setXYZ(i * 2, _v3.x, _v3.y, _v3.z); c.getWorldPosition(_v3); P.setXYZ(i * 2 + 1, _v3.x, _v3.y, _v3.z); });
    P.needsUpdate = true;
  }
}
function updateFingers() {
  const on = $('fingerBones')?.checked !== false;
  for (const a of ACTORS) a.fing.update(on && (a === main || (a === ref && ref.root.visible)) && a.root.parent === scene);
}

class Actor {
  constructor(obj, height) {
    this.root = new THREE.Group(); this.obj = obj; this.root.add(obj);
    const box = new THREE.Box3().setFromObject(obj); this.nat = box.max.y - box.min.y; // natural height
    this.setHeight(height);
    this.mixer = new THREE.AnimationMixer(obj);
    this.bones = {}; obj.traverse((o) => { if (o.isBone) { const n = o.name.replace(/^mixamorig:?/, ''); this.bones[UE_MAP[n] || n] = o; } });
    this.restPos = {}; obj.traverse((o) => { if (o.isBone) this.restPos[o.name.replace(/^mixamorig:?/, '')] ||= o.position.clone(); }); // (by the file's own names)
    this.helper = new THREE.SkeletonHelper(obj); this.helper.visible = false; this.helper.material.depthTest = false;
    this.clip = null; this.action = null; this.frames = 1; this.t0 = 0;
    this.hair = new HairSway(this.bones); // the ponytail sway (the new Yola), stepped by the render loop
    this.fing = new FingerSkel(this); ACTORS.push(this);
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
    this.action.time = clamp(this.t0 + (f - 1) / fpsOf(this.clip), 0, this.clip.duration);
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
    // Yola: on sg_reload frame 1 whatever clip is shown, as the game calibrates it (render/clipchars.js
    // calibrateShotgunSocket); the reference on its own clip's frame 1
    const hold = a === main && mainCache[S.char]?.gltf.animations.find((c) => c.name === 'sg_reload');
    if (hold && a.clip !== hold) { withPose(a, hold, 1, () => this.calibrateHere()); return; }
    this.calibrateHere();
  }
  calibrateHere() {
    const a = this.actor;
    a.grip('Right', _v); a.grip('Left', _v2);
    const x = _v2.clone().sub(_v).normalize(), z = new THREE.Vector3().crossVectors(x, UP).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    const g = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    a.bones.RightHand.getWorldQuaternion(_q); this.socket.copy(_q.invert().multiply(g)); this.has = true;
  }
  update(k) { // k: world size of this actor relative to Yola (1 for Yola)
    if (!this.obj || !this.has) return;
    // as the game (render/clipchars.js placeWeapons): the right-hand socket at the right grip, then the user's shotgun fit
    // (the fit panel; render/holdfit.js applyFit, pivoting on the right grip)
    const a = this.actor; a.bones.RightHand.getWorldQuaternion(_q);
    const gq = _q.multiply(this.socket);
    a.grip('Right', _v);
    applyFit(this.obj, _v, gq, fitW('short', a), new THREE.Vector3(), k, k);
    this.obj.updateMatrixWorld(true);
  }
}

// ---------------- state ----------------
const S = { char: 'yola', playing: true, frame: 1, speed: 1, overlay: false, gun: 'auto', frames: 1 };
const weaponOf = () => (S.gun === 'auto' ? autoWeapon(main?.clip?.name || '') : S.gun);
let main, ref, mainGun, refGun, refX, refGunX;
const ualCache = {};
function ualRef(file) { // Quaternius's mannequin and its clips, loaded once per library file
  if (!ualCache[file]) ualCache[file] = loadG(file).then((g) => {
    g.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const actor = new Actor(g.scene, 1.62); actor.root.visible = false; scene.add(actor.root, actor.helper);
    return { actor, clips: g.animations };
  }).catch(() => null);
  return ualCache[file];
}
function useRef(a) { // switch the shown reference actor (the X Bot or a mannequin)
  if (ref && ref !== a) { ref.root.visible = false; ref.helper.visible = false; }
  ref = a; refGun = a === refX ? refGunX : new Gun(a);
}
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
    // (&extra=a.glb,b.glb: test bakes of this character's clips, e.g. assets/test_clips; named <clip>_REBAKE_<what>)
    const extraQ = key === new URLSearchParams(location.search).get('char') ? (new URLSearchParams(location.search).get('extra') || '').split(',').filter(Boolean) : [];
    for (const f of [...(CHARS[key].extra || []), ...extraQ]) { try { const c = await loadG(f); g.animations.push(...c.animations); } catch { /* not built */ } }
    g.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; if (/^GORE_/.test(o.name)) o.visible = false; });
    mainCache[key] = { gltf: g, actor: new Actor(g.scene, CHARS[key].height) };
  }
  const { gltf, actor } = mainCache[key];
  main = actor; scene.add(main.root, main.helper);
  mainGun = new Gun(main);
  const sel = $('clip'); sel.innerHTML = ''; fillClips();
  const first = key === 'yola2' ? 'ual_Sword_Regular_Combo' : key === 'yola' ? (gltf.animations.some((c) => c.name === 'bat_combo_mc') ? 'bat_combo_mc' : 'reload_rifle_stand') : gltf.animations[0].name;
  sel.value = gltf.animations.some((c) => c.name === first) ? first : gltf.animations[0].name;
  await setClip(sel.value);
  applyGun();
}
async function setClip(name) {
  const c = mainCache[S.char].gltf.animations.find((x) => x.name === name);
  pinRoot(c, $('inplace').checked, main); main.play(c); main.hair?.reset?.(); FPS = fpsOf(c); vidRef(name);
  // the reference: the clip's own source rig. Mixamo clips: Mixamo's X Bot; library clips: Quaternius's mannequin
  // (a game clip made from a library move is shown against that move: CHARS[].libRef)
  const libName = (CHARS[S.char].libRef || {})[name.replace(/_REBAKE_.*$/, '')] || name;
  const lib = Object.keys(UAL_FILES).sort((a, b) => b.length - a.length).find((p) => libName.startsWith(p));
  let rc = null, file = '';
  if (lib) {
    const u = await ualRef(UAL_FILES[lib]);
    useRef(u ? u.actor : refX);
    rc = u?.clips.find((c) => c.name === libName.replace(/_REBAKE_.*$/, '').slice(lib.length)) || null; file = UAL_FILES[lib];
  } else {
    useRef(refX);
    const nm = name.replace(/_REBAKE_.*$/, ''); // (a test re-bake: the clip it re-bakes has the reference)
    const map = CHARS[S.char].refMap || {}, base = nm in map ? map[nm] : REF_ALIAS[nm] || nm;
    file = base === null ? '' : `assets/mixamo/${map[nm] ? '' : CHARS[S.char].ref}${base}.fbx`;
    rc = file ? await refClip(file) : null;
  }
  const rsel = $('refclip'); rsel.innerHTML = '';
  if (rc) { rsel.add(new Option(lib ? `Quaternius mannequin: ${rc.name}` : file.split('/').pop(), file)); $('note').textContent = ''; }
  else { rsel.add(new Option('no source rig for this clip', '')); $('note').textContent = 'No reference for this clip (Tripo or custom clip).'; }
  ref.root.visible = !!rc; ref.helper.visible = !!rc && $('bones').checked;
  if (rc) { pinRoot(rc, $('inplace').checked, ref); ref.play(rc); }
  S.refOff = rc && !lib ? REF_OFFSET[name.replace(/_REBAKE_.*$/, '')] || 0 : 0;
  S.frames = Math.max(main.frames, rc ? ref.frames - S.refOff : 1);
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
  // the palm grip point (not the wrist) is what lands on the target
  const B = main.bones, ik = (t, w) => {
    const tt = t.clone(); main.grip('Left', _m2); B.LeftHand.getWorldPosition(_v3); tt.sub(_m2.sub(_v3));
    ikArm(B.LeftArm, B.LeftForeArm, B.LeftHand, tt, w);
  };
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
  const w = weaponOf();
  for (const k in held) held[k].visible = false;
  const t = gunTemplates[w];
  if (w === 'none' || HELD[w] || !t) return;
  const mk = () => { const o = t.clone(true); o.userData = { ...t.userData, gripL: o.getObjectByName('GameGrip_L'), port: o.getObjectByName('LoadPort'), pump: o.getObjectByName('Pump') }; return o; };
  mainGun.setObject(mk());
  if ($('gunref').checked) refGun.setObject(mk());
}
function refresh() {
  if (!main) return;
  const f = Math.max(1, Math.min(S.frames, Math.round(S.frame)));
  main.setFrame(Math.min(S.playing ? Math.max(1, S.frame) : f, main.frames)); // (playing: between frames too, smooth for the hair sway)
  if (ref.root.visible) ref.setFrame(Math.min(f + (S.refOff || 0), ref.frames));
  undoPost(main); undoPost(ref); postureFix(main, ref); handPose(main);
  if (handsUI && handsSeen !== handKey()) { handsSeen = handKey(); handsUI(); }
  shotKick(main); if (ref.root.visible) shotKick(ref);
  mainGun?.update(1); leftHand(f);
  if (refGun?.obj) { refGun.obj.visible = ref.root.visible; refGun.update(ref.height / main.height); }
  updateMarks(); updateShell(f);
  $('scrub').value = f;
  $('frameInfo').textContent = `frame ${f} / ${S.frames}  (${(f / FPS).toFixed(2)} s at ${FPS} fps)` + (S.refOff ? `  ·  reference frame ${f + S.refOff}` : '');
  drawVidRef(f); updateBat(); updateMags(); updateFingers(); updatePistolFitUI();
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

// ---------------- the bat (combo clip) and the reference footage ----------------
// the bat runs along both grips (the combo clip keeps both hands on its line): from just below the left hand to the tip
// held weapons (the game's own models): bat and axe between the hands along the line through both grips (origin at the
// hands' midpoint, handle along +Z); the pistol in the right hand, barrel along the forearm (origin at the grip, top +Y)
const held = { bat: makeBat(), pistol: makePistol() }; for (const k in held) { held[k].visible = false; scene.add(held[k]); }
// ---- pistol reload magazines (the user's props, 2026-10-17: assets/weapons/pistol_mag_empty / _loaded.glb) ----
// Made for this pistol: in the pistol model's own frame (+X barrel, +Y up) a seated magazine sits at MAG_SEAT, its base
// plate exactly over the pistol's Pistol_Magazine_Art (hidden while the props play). Events, frames of the reload clip
// (Quaternius Pistol_Reload with the support hand, measured on her: gun tips up 4-7, left hand at the hip pouch 13-15,
// at the grip 28-37): the empty one drops at `drop` and falls; the loaded one is in her left hand (held by its base between thumb and index,
// magPinch) from `grab`, slides into the grip from `insert` and is seated at `seat`, when the gun's own magazine shows again.
const MAG_SEAT = new THREE.Vector3(-0.008, -0.039, 0);
const RELOAD_EVENTS = [{ test: /Pistol_Reload|^pistol_reload$/i, drop: 6, grab: 13, insert: 23, seat: 28 }];
const mags = { empty: null, loaded: null, fall: null };
const prepMag = (g) => { const o = g.scene; o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } }); o.visible = false; return o; };
loadG('assets/weapons/pistol_mag_empty.glb').then((g) => { mags.empty = prepMag(g); scene.add(mags.empty); refresh(); }).catch(() => {});
loadG('assets/weapons/pistol_mag_loaded.glb').then((g) => { mags.loaded = prepMag(g); refresh(); }).catch(() => {});
const magPinch = () => { const B = main.bones; return B.LeftHandThumb2.getWorldPosition(new THREE.Vector3()).lerp(B.LeftHandIndex2.getWorldPosition(_v3), 0.5); }; // (where her hand holds the magazine)
function reloadEvents() { return weaponOf() === 'pistol' && $('mags')?.checked !== false ? RELOAD_EVENTS.find((e) => e.test.test(main?.clip?.name || '')) : null; }
function updateMags() {
  const P = held.pistol, inner = P?.children?.[0], E = reloadEvents(), art = inner?.getObjectByName?.('Pistol_Magazine_Art');
  if (mags.empty) mags.empty.visible = false;
  if (mags.loaded) mags.loaded.visible = false;
  if (art) art.visible = true;
  if (!E || !inner || !P.visible || !mags.empty || !mags.loaded) return;
  const f = S.playing ? S.frame : Math.round(S.frame);
  if (art) art.visible = f < E.drop || f >= E.seat;
  inner.updateWorldMatrix(true, false);
  // per clip and fit: the empty one's start pose (seated, at the drop frame)
  const key = main.clip.name + JSON.stringify(fitOf(main));
  if (mags.fall?.key !== key) {
    const keep = S.frame, at = (fr) => { main.setFrame(fr); placeHeldOn(main, P); inner.updateWorldMatrix(true, false); };
    at(E.drop); const M = inner.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(MAG_SEAT));
    const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3(); M.decompose(p0, q0, s0);
    mags.fall = { key, p0, q0, s0 };
    at(Math.min(S.playing ? Math.max(1, keep) : Math.round(keep), main.frames));
  }
  // the loaded one: a child of the pistol model (its frame and scale), held by its base between her thumb and index
  // finger; from `insert` it eases from her fingers to its seat (her pinch ends ~2.4 cm from a seated magazine's base,
  // so it stays in her fingers) and is seated at `seat`. (The game's clipchars.js placeMags plays the same rules.)
  if (mags.loaded.parent !== inner) inner.add(mags.loaded);
  if (f >= E.grab && f < E.seat) {
    const u = f <= E.insert ? 0 : (f - E.insert) / (E.seat - E.insert), s = u * u * (3 - 2 * u);
    mags.loaded.position.copy(inner.worldToLocal(magPinch())).lerp(MAG_SEAT, s); mags.loaded.quaternion.identity(); mags.loaded.visible = true;
  }
  // the empty one: leaves the grip at `drop` and falls (world space)
  if (f >= E.drop) {
    const F = mags.fall, t = (f - E.drop) / FPS, k = main.height / 1.62;
    const tHit = Math.sqrt(Math.max(0, 2 * (F.p0.y - 0.02) / (9.8 * k)));
    const tt = Math.min(t, tHit);
    mags.empty.position.copy(F.p0).add(new THREE.Vector3(0, -4.9 * k * tt * tt, 0));
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1).applyQuaternion(F.q0), 5 * tt); // (a tumble about its own side axis)
    mags.empty.quaternion.copy(spin.multiply(F.q0)); mags.empty.scale.copy(F.s0); mags.empty.visible = true;
  }
}
loadG('assets/weapons/pistol_core.glb').then((g) => { scene.remove(held.pistol); held.pistol = prepPistolCore(g); held.pistol.visible = false; scene.add(held.pistol); refresh(); }).catch(() => {}); // the game's pistol (the pack's)
loadG('assets/weapons/fire_axe.glb').then((g) => { held.axe = prepAxe(g); held.axe.visible = false; scene.add(held.axe); applyGun(); refresh(); }).catch(() => {});
const _m4 = new THREE.Matrix4();
// the same held weapon in the reference rig's hands (the user, 2026-10-16: to compare how each hand closes on it)
const heldRef = { bat: makeBat(), pistol: makePistol() }; for (const k in heldRef) { heldRef[k].visible = false; scene.add(heldRef[k]); }
loadG('assets/weapons/pistol_core.glb').then((g) => { scene.remove(heldRef.pistol); heldRef.pistol = prepPistolCore(g); heldRef.pistol.visible = false; scene.add(heldRef.pistol); }).catch(() => {});
loadG('assets/weapons/fire_axe.glb').then((g) => { heldRef.axe = prepAxe(g); heldRef.axe.visible = false; scene.add(heldRef.axe); }).catch(() => {});
// PROPOSED pistol placement (Rig Lab only, "pistol in the fist" checkbox): the grip through the right fist's centre (the
// curled fingers' joints), along the fist's grip axis (pinky -> index knuckle), the barrel toward the forearm's direction.
// Pistol frame (pistol_core.glb, measured): grip fist point (0, 0.005, 0.0026), grip axis (0, 0.9509, 0.3094), barrel +Z.
const PG = { at: new THREE.Vector3(0, 0.005, 0.0026), axis: new THREE.Vector3(0, 0.9509, 0.3094).normalize() };
function pistolInFist(a, o) {
  const h = a === main ? handsOf().gunHand : 'Right'; // (which hand holds it: the Hands controls)
  const B = a.bones, c = new THREE.Vector3(); let n = 0;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = B[h + 'Hand' + f + i]; if (b) { c.add(b.getWorldPosition(_v3)); n++; } }
  if (!n || !B[h + 'HandIndex1'] || !B[h + 'HandPinky1']) return false; c.multiplyScalar(1 / n);
  const A = B[h + 'HandIndex1'].getWorldPosition(new THREE.Vector3()).sub(B[h + 'HandPinky1'].getWorldPosition(_v3)).normalize();
  const F = B[h + 'Hand'].getWorldPosition(new THREE.Vector3()).sub(B[h + 'ForeArm'].getWorldPosition(_v3)); F.addScaledVector(A, -F.dot(A)).normalize();
  const zb = new THREE.Vector3(0, 0, 1).addScaledVector(PG.axis, -PG.axis.z).normalize(); // the barrel, square to the grip axis
  const M1 = new THREE.Matrix4().makeBasis(PG.axis, zb, new THREE.Vector3().crossVectors(PG.axis, zb));
  const M2 = new THREE.Matrix4().makeBasis(A, F, new THREE.Vector3().crossVectors(A, F));
  const q0 = new THREE.Quaternion().setFromRotationMatrix(M2.multiply(M1.transpose()));
  // the user's fit for this rig (sliders): size, then a move and a turn in the gun's own axes, pivoting on the fist centre
  const P = fitOf(a), d2r = Math.PI / 180;
  o.scale.multiplyScalar(P.size / 100);
  o.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(P.tilt * d2r, P.turn * d2r, P.roll * d2r, 'YXZ')));
  const off = new THREE.Vector3(P.side, P.up, P.fwd).multiplyScalar(0.001 * a.height / 1.62).applyQuaternion(q0);
  o.position.copy(c).add(off).sub(PG.at.clone().multiplyScalar(o.scale.x * PISTOL_CORE_SCALE).applyQuaternion(o.quaternion));
  return true;
}
// the pistol shot (the game has no shooting clip: render/clipchars.js aimPistol kicks the chest and both upper arms
// up and back on top of the idle pose; kick = recoil^2 x tuning.pistolRecoil, recoil 1 at the shot, falling 7/s).
// "shot kick" holds a kick to study it frame by frame; "fire" plays one shot; "keep firing" shoots every 0.24 s
const SHOT = { hold: 0, recoil: 0, auto: false, next: 0 };
const _qk = new THREE.Quaternion(), _qk2 = new THREE.Quaternion();
function kickC(a, n, x) { // rotate bone n by x about the character's own left-right axis (as the game's rotateEulerC)
  let b = a.bones[n]; if (!b) return;
  while (b.parent?.name === b.name) b = b.parent; // (the X Bot FBX nests a same-named copy in each bone: turn the outer, animated one)
  a.root.getWorldQuaternion(_qk); b.getWorldQuaternion(_qk2);
  const W = _qk.invert().multiply(_qk2), D = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, 0, 'YXZ'));
  postRot(a, b, (q) => q.multiply(W.clone().invert().multiply(D).multiply(W)));
}
// changes made on top of the clip (the posture preview, the shot kick) are recorded per actor and undone before the next
// redraw: the mixer only rewrites a bone whose animated value changed, so on a held frame they would stay and stack
function postRot(a, b, fn) { const base = b.quaternion.clone(); fn(b.quaternion); (a.post ||= []).push([b, base, b.quaternion.clone()]); }
function undoPost(a) {
  if (!a?.post?.length) return;
  for (const [b, base, done] of a.post.reverse()) if (b.quaternion.equals(done)) b.quaternion.copy(base);
  a.post = []; a.root.updateMatrixWorld(true);
}
// POSTURE PREVIEW (2026-10-16, Rig Lab only): blender/retarget.py points each of Yola's bones along the source bone's own
// axis (head -> tail), but X Bot's Neck and Head axes sit 16.9 / 25.8 deg off his real neck line (Neck -> Head -> head
// top) and Yola's Hips / Spine2 / Hands axes 4.1 / 1.6 / ~4 deg off hers, so her head ends up tipped back and her pelvis
// tucked in every Mixamo clip. The fix is a constant turn per bone (what the retarget gives when it matches the lines):
// C = Rt^-1 A^-1 A' Rt  (Rt her rest rotation, A axis->axis, A' line->line); her children keep their own rotations.
const POSTURE = [['Hips', 'Spine'], ['Spine2', 'Neck'], ['Neck', 'Head'], ['Head', 'HeadTop_End'], ['LeftHand', 'LeftHandMiddle1'], ['RightHand', 'RightHandMiddle1']];
const outerBone = (b) => { while (b && b.parent?.name === b.name) b = b.parent; return b; };
function restFrames(a) { // each bone's world rotation, +Y axis and line to its child at the bind pose
  const t = a.action?.time; a.action?.stop(); a.obj.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); }); a.root.updateMatrixWorld(true);
  const out = {};
  for (const [n, c] of POSTURE) {
    const b = outerBone(a.bones[n]), k = outerBone(a.bones[c]); if (!b || !k) continue;
    const R = b.getWorldQuaternion(new THREE.Quaternion());
    out[n] = { R, axis: new THREE.Vector3(0, 1, 0).applyQuaternion(R), line: k.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize() };
  }
  if (a.action) { a.action.play(); a.action.time = t; a.mixer.update(0); a.root.updateMatrixWorld(true); }
  return out;
}
const postureCache = new Map();
function postureC(a, src) { // per (character, source rig): the constant turn for each posture bone, in the bone's own frame
  const key = a.obj.uuid + '|' + src.obj.uuid; if (postureCache.has(key)) return postureCache.get(key);
  const T = restFrames(a), S = restFrames(src), C = {};
  for (const [n] of POSTURE) {
    if (!T[n] || !S[n]) continue;
    const A = new THREE.Quaternion().setFromUnitVectors(T[n].axis, S[n].axis), A2 = new THREE.Quaternion().setFromUnitVectors(T[n].line, S[n].line);
    C[n] = T[n].R.clone().invert().multiply(A.invert()).multiply(A2).multiply(T[n].R);
  }
  postureCache.set(key, C); return C;
}
function postureFix(a, src) {
  // the game's posture fix (render/posture.js: the turns measured by postureC above, the hands left out, the head's
  // children turning with it), on Yola for the shown clip's source family
  if (!$('posture')?.checked || a !== main || !a?.action || S.char !== 'yola2') return; // (measured on Yola 3.0's rig)
  const fam = postureFamily((CHARS[S.char].libRef || {})[a.clip.name.replace(/_REBAKE_.*$/, '')] || a.clip.name.replace(/_REBAKE_.*$/, ''));
  if (!fam) return;
  const one = { [fam]: 1 }; applyPosture(a.bones, Object.fromEntries(POSTURE_BONES.map((n) => [n, one])), (b, fn) => postRot(a, outerBone(b), fn));
  a.root.updateMatrixWorld(true);
}
// ---- HANDS (the user, 2026-10-17: "choose hands open, hands closed, what hand the weapon's supposed to be in"; the Move
// Library's fists, brought here beside the reference): per clip and per hand, a curl from the clip's own fingers (0,
// "open") through "support" (0.5) to her closed fist (1), and which hand holds the pistol. The fist is her own: the finger
// pose of her bat_idle (both hands round a bat handle). The reference keeps its own fingers to compare against. Kept in
// this browser; "save" writes shots/hand_poses.json (copied to assets/hold/hand_poses.json when the user says so).
const FINGER = /Hand(Thumb|Index|Middle|Ring|Pinky)\d$/;
const fistCache = new Map();
function fistPose(a) {
  if (fistCache.has(a.obj.uuid)) return fistCache.get(a.obj.uuid);
  const clip = mainCache[S.char]?.gltf.animations.find((c) => c.name === 'bat_idle');
  let pose = null;
  if (clip) {
    const saved = []; a.obj.traverse((o) => { if (o.isBone) saved.push([o, o.quaternion.clone(), o.position.clone()]); });
    const mx = new THREE.AnimationMixer(a.obj), ac = mx.clipAction(clip); ac.play(); ac.time = clipT0(clip); mx.update(0);
    pose = {}; for (const [n, b] of Object.entries(a.bones)) if (FINGER.test(n)) pose[n] = b.quaternion.clone();
    ac.stop(); mx.uncacheRoot(a.obj); for (const [b, q, p] of saved) { b.quaternion.copy(q); b.position.copy(p); } a.root.updateMatrixWorld(true);
  }
  fistCache.set(a.obj.uuid, pose); return pose;
}
// pose actor a on frame f of clip, run fn, then put the actor back exactly as it was
function withPose(a, clip, f, fn) {
  const saved = []; a.obj.traverse((o) => { if (o.isBone) saved.push([o, o.quaternion.clone(), o.position.clone()]); });
  const mx = new THREE.AnimationMixer(a.obj), ac = mx.clipAction(clip); ac.play(); ac.time = clipT0(clip) + (f - 1) / fpsOf(clip); mx.update(0); a.root.updateMatrixWorld(true);
  try { fn(); } finally { ac.stop(); mx.uncacheRoot(a.obj); for (const [b, q, p] of saved) { b.quaternion.copy(q); b.position.copy(p); } a.root.updateMatrixWorld(true); }
}
const HAND0 = { Right: 0, Left: 0, gunHand: 'Right' };
const HANDS = {};
const handKey = () => S.char + ':' + (main?.clip?.name || '').replace(/_REBAKE_.*$/, '');
const handsOf = () => (HANDS[handKey()] ||= { ...HAND0 });
fetch('assets/hold/hand_poses.json', { cache: 'reload' }).then((r) => r.json()).catch(() => ({})).then((j) => {
  for (const [k, v] of Object.entries(j)) if (typeof v === 'object') HANDS[k] = { ...HAND0, ...v };
  try { for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem('handPoses') || '{}'))) HANDS[k] = { ...HAND0, ...v }; } catch { /* none */ }
  handsUI?.(); refresh?.();
});
function handPose(a) {
  const H = handsOf(), P = fistPose(a); if (!P) return;
  for (const side of ['Right', 'Left']) {
    const k = H[side]; if (!(k > 0)) continue;
    for (const [n, q] of Object.entries(P)) if (n.startsWith(side)) postRot(a, a.bones[n], (cur) => cur.slerp(q, k));
  }
  a.root.updateMatrixWorld(true);
}
let handsUI = null, handsSeen = '';
function buildHandsUI() {
  const box = $('handsGrp'); if (!box) return;
  const keep = () => { try { localStorage.setItem('handPoses', JSON.stringify(HANDS)); } catch { /* private window */ } };
  const row = (side) => `<span class="lbl">${side === 'Right' ? 'R hand' : 'L hand'}</span>` + [['open', 0], ['support', 0.5], ['closed', 1]].map(([t, v]) => `<button data-h="${side}" data-v="${v}">${t}</button>`).join('') +
    `<input type="range" min="0" max="100" step="5" data-hs="${side}" style="width:70px;vertical-align:middle"><span data-hv="${side}" style="display:inline-block;width:32px"></span>`;
  box.innerHTML = row('Right') + row('Left') + '<span class="lbl">pistol in</span><button data-g="Right">R</button><button data-g="Left">L</button><button id="handsSave">save hands</button>';
  handsUI = () => {
    const H = handsOf();
    for (const b of box.querySelectorAll('button[data-h]')) b.classList.toggle('on', Math.abs(H[b.dataset.h] - +b.dataset.v) < 0.01);
    for (const r of box.querySelectorAll('input[data-hs]')) r.value = Math.round(H[r.dataset.hs] * 100);
    for (const s of box.querySelectorAll('span[data-hv]')) s.textContent = Math.round(H[s.dataset.hv] * 100) + '%';
    for (const b of box.querySelectorAll('button[data-g]')) b.classList.toggle('on', H.gunHand === b.dataset.g);
  };
  for (const b of box.querySelectorAll('button[data-h]')) b.onclick = () => { handsOf()[b.dataset.h] = +b.dataset.v; keep(); handsUI(); refresh(); };
  for (const r of box.querySelectorAll('input[data-hs]')) r.oninput = () => { handsOf()[r.dataset.hs] = r.value / 100; keep(); handsUI(); refresh(); };
  for (const b of box.querySelectorAll('button[data-g]')) b.onclick = () => { handsOf().gunHand = b.dataset.g; keep(); handsUI(); refresh(); };
  $('handsSave').onclick = async () => { const r = await fetch('/__shot/hand_poses.json', { method: 'POST', body: JSON.stringify(HANDS, null, 1) }); $('handsSave').textContent = r.ok ? 'saved' : 'save failed'; setTimeout(() => { $('handsSave').textContent = 'save hands'; }, 1500); };
  handsUI();
}
function shotKick(a) {
  if (!a || weaponOf() !== 'pistol' || !a.action) return;
  const r = Math.max(SHOT.hold, SHOT.recoil), kick = r * r;
  if (kick < 0.001) return;
  kickC(a, 'Spine2', -0.09 * kick); if (kick > 0.01) { kickC(a, 'RightArm', -0.25 * kick); kickC(a, 'LeftArm', -0.25 * kick); }
}
// pistol fit sliders (the user, 2026-10-16): one fit per character (Yola 3.0 / Yola 2.0 / X Bot / the UAL mannequin), the
// saved ones in assets/hold/pistol_fit.json; edits are kept in this browser and "save" writes zombie/shots/pistol_fit.json
// (copied into assets/hold by Claude when the user says so)
const PFIT0 = { size: 100, fwd: 0, up: 0, side: 0, tilt: 0, turn: 0, roll: 0 };
const FITS = {};
const fitKey = (a) => (a === main ? S.char : a === refX ? 'xbot' : 'mannequin');
const fitOf = (a) => (FITS[fitKey(a)] ||= { ...PFIT0 });
// the other held weapons' fits (assets/hold/weapon_fit.json, render/holdfit.js: the game uses the same file and math)
const WFITS = {};
const FIT_WEAPONS = { pistol: 'Pistol', bat: 'Bat', axe: 'Axe', short: 'Shotgun' };
const fitW = (w, a) => (w === 'pistol' ? fitOf(a) : ((WFITS[w] ||= {})[fitKey(a)] ||= { ...PFIT0 }));
fetch('assets/hold/weapon_fit.json', { cache: 'reload' }).then((r) => r.json()).catch(() => ({})).then((j) => {
  for (const [w, v] of Object.entries(j)) if (typeof v === 'object') for (const [k, f] of Object.entries(v)) (WFITS[w] ||= {})[k] = { ...PFIT0, ...f };
  try { for (const [w, v] of Object.entries(JSON.parse(localStorage.getItem('weaponFits') || '{}'))) for (const [k, f] of Object.entries(v)) (WFITS[w] ||= {})[k] = { ...PFIT0, ...f }; } catch { /* none */ }
  pfitSync?.(); refresh?.();
});
const fitsReady = fetch('assets/hold/pistol_fit.json', { cache: 'reload' }).then((r) => r.json()).catch(() => ({})).then((j) => {
  for (const [k, v] of Object.entries(j)) if (typeof v === 'object') FITS[k] = { ...PFIT0, ...v };
  try { for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem('pistolFits') || '{}'))) FITS[k] = { ...PFIT0, ...v }; } catch { /* none */ }
  pfitSync?.(); refresh?.();
});
const PFIT_ROWS = [['size', 'size %', 60, 120, 1], ['fwd', 'forward / back (mm)', -60, 60, 1], ['up', 'up / down the grip (mm)', -60, 60, 1], ['side', 'left / right (mm)', -40, 40, 1],
  ['tilt', 'tilt muzzle up/down (deg)', -45, 45, 1], ['turn', 'turn muzzle left/right (deg)', -45, 45, 1], ['roll', 'roll (deg)', -45, 45, 1]];
let pfitWho = 'main', pfitSync = null;
// slider labels per weapon (the bat: its long axis runs through her fist from the little finger to the index knuckle;
// model +X points to the knuckles, +Y toward the wrist or the fingertips)
const FIT_LABELS = { short: ['size %', 'move sideways (mm)', 'move up / down (mm)', 'slide along the barrel (mm)', 'roll (deg)', 'turn muzzle left / right (deg)', 'tip muzzle up / down (deg)'], axe: ['size %', 'slide along the handle (mm)', 'move sideways (mm)', 'move toward the blade side (mm)', 'tilt (deg)', 'turn (deg)', 'roll the blade (deg)'], bat: ['size %', 'slide along the bat (mm)', 'move toward wrist / fingertips (mm)', 'move toward knuckles / palm (mm)', 'tip toward wrist / fingertips (deg)', 'tip toward knuckles / palm (deg)', 'roll the bat (deg)'] };
function buildPistolFit() {
  const box = document.createElement('div'); box.id = 'pfit';
  box.style.cssText = 'position:fixed;right:8px;top:200px;z-index:30;background:rgba(20,26,30,.85);color:#ddd;font:11px system-ui;padding:6px 8px;border-radius:8px;width:210px';
  box.innerHTML = '<b id="pfitTitle">Pistol fit</b> &nbsp;editing: <button id="pfitMain"></button><button id="pfitRef"></button><div id="pfitRows"></div>' +
    '<button id="pfitReset">reset this one</button> <button id="pfitSave">save</button><div id="pfitOut" style="opacity:.7;word-break:break-all;font-size:10px"></div>' +
    '<div id="pshot"><hr style="border:0;border-top:1px solid #456;margin:5px 0"><b>Shot (game recoil, both rigs)</b>' +
    '<div style="display:grid;grid-template-columns:1fr 34px"><label>shot kick (hold, %)</label><span id="pkickV">0</span><input id="pkick" type="range" min="0" max="100" step="1" value="0" style="grid-column:1/3"></div>' +
    '<button id="pfire">fire</button> <label><input id="pauto" type="checkbox"> keep firing</label></div>';
  document.body.appendChild(box);
  const rows = box.querySelector('#pfitRows'), out = box.querySelector('#pfitOut');
  const cur = () => fitW(weaponOf(), pfitWho === 'ref' ? ref : main);
  const keep = () => { try { localStorage.setItem('pistolFits', JSON.stringify(FITS)); localStorage.setItem('weaponFits', JSON.stringify(WFITS)); } catch { /* private window */ } };
  const set = [];
  for (const [k, label, lo, hi, st] of PFIT_ROWS) {
    const r = document.createElement('div'); r.style.cssText = 'display:grid;grid-template-columns:1fr 34px;gap:0;margin:1px 0';
    r.innerHTML = `<label>${label}</label><span></span><input type="range" min="${lo}" max="${hi}" step="${st}" style="grid-column:1/3">`;
    const inp = r.querySelector('input'), sp = r.querySelector('span');
    set.push(() => { inp.value = cur()[k]; sp.textContent = cur()[k]; });
    inp.oninput = () => { cur()[k] = +inp.value; sp.textContent = inp.value; keep(); pfitSync(); refresh(); };
    rows.appendChild(r);
  }
  const bm = box.querySelector('#pfitMain'), br = box.querySelector('#pfitRef');
  pfitSync = () => {
    const on = 'background:#2a7fd4;color:#fff', off = 'background:#333;color:#ccc';
    bm.textContent = CHARS[S.char]?.label || S.char; br.textContent = ref === refX ? 'X Bot' : 'mannequin';
    bm.style.cssText = pfitWho === 'main' ? on : off; br.style.cssText = pfitWho === 'ref' ? on : off;
    const w = weaponOf(); box.querySelector('#pfitTitle').textContent = (FIT_WEAPONS[w] || w) + ' fit';
    for (const [i, el] of [...rows.children].entries()) el.querySelector('label').textContent = (FIT_LABELS[w] || PFIT_ROWS.map((r) => r[1]))[i];
    box.querySelector('#pshot').style.display = w === 'pistol' ? '' : 'none';
    set.forEach((f) => f()); out.textContent = w + ' / ' + fitKey(pfitWho === 'ref' ? ref : main) + ' ' + JSON.stringify(cur());
  };
  bm.onclick = () => { pfitWho = 'main'; pfitSync(); }; br.onclick = () => { pfitWho = 'ref'; pfitSync(); };
  box.querySelector('#pfitReset').onclick = () => { Object.assign(cur(), PFIT0); keep(); pfitSync(); refresh(); };
  box.querySelector('#pfitSave').onclick = async () => {
    const r = await fetch('/__shot/pistol_fit.json', { method: 'POST', body: JSON.stringify(FITS, null, 1) });
    const r2 = await fetch('/__shot/weapon_fit.json', { method: 'POST', body: JSON.stringify(WFITS, null, 1) });
    out.textContent = r.ok && r2.ok ? 'saved (shots/pistol_fit.json, shots/weapon_fit.json)' : 'save failed';
  };
  const kv = box.querySelector('#pkickV');
  box.querySelector('#pkick').oninput = (e) => { SHOT.hold = Math.sqrt(+e.target.value / 100); kv.textContent = e.target.value; refresh(); }; // (% of the full kick)
  box.querySelector('#pfire').onclick = () => { SHOT.recoil = 1; refresh(); };
  box.querySelector('#pauto').onchange = (e) => { SHOT.auto = e.target.checked; SHOT.next = 0; };
  pfitSync();
  return box;
}
let pfitBox = null;
let pfitRefWas = null;
function updatePistolFitUI() {
  pfitBox ||= buildPistolFit(); const w = weaponOf();
  pfitBox.style.display = (w === 'pistol' && $('pistolFist')?.checked) || (FIT_WEAPONS[w] && w !== 'pistol') ? '' : 'none';
  if (w !== pfitBox.dataset.w) { pfitBox.dataset.w = w; pfitSync(); }
  const top = $('top').hidden ? 8 : $('top').getBoundingClientRect().bottom + 8; // (below the top bar, scrolling in a short window)
  pfitBox.style.top = top + 'px'; pfitBox.style.maxHeight = `calc(100vh - ${top + 8}px)`; pfitBox.style.overflowY = 'auto';
  if (ref !== pfitRefWas) { pfitRefWas = ref; pfitSync(); } // (the reference changes with the clip: X Bot / mannequin)
}
function placeHeldOn(a, o) {
  const w = weaponOf(), k = a.height / 1.62; o.visible = true; o.scale.setScalar(k);
  if (w === 'pistol' && $('pistolFist')?.checked && pistolInFist(a, o)) return;
  // the one-handed bat as the game holds it (render/holdfit.js): grip in her fist, shaft along the knuckles, the user's fit
  if (w === 'bat' && placeOneHanded(a.bones, a === main ? handsOf().gunHand : 'Right', o, BAT_DEF, fitW('bat', a), {}, k)) return;
  // the fire axe as the game holds it (render/clipchars.js placeWeapons): the handle through both fists' centres, the
  // blade facing her front (the game also turns it to lead a fast swing), then the user's fit. Which end is the head: the
  // fists' grip axes here (the game uses the handle direction it measured on X Bot)
  if (w === 'axe') {
    const B = a.bones, ax = (s) => B[s + 'HandIndex1'].getWorldPosition(new THREE.Vector3()).sub(B[s + 'HandPinky1'].getWorldPosition(_v3)).normalize();
    const L2 = B.LeftHandIndex1 && twoHandLine(B, ax('Right').add(ax('Left')).normalize(), { c: new THREE.Vector3(), d: new THREE.Vector3(), span: 0 });
    if (L2) {
      const fwd = a.root.getWorldDirection(new THREE.Vector3()); fwd.addScaledVector(L2.d, -fwd.dot(L2.d)).normalize();
      const x = fwd.negate(), y = new THREE.Vector3().crossVectors(L2.d, x);
      applyFit(o, L2.c, new THREE.Quaternion().setFromRotationMatrix(_m4.makeBasis(x, y, L2.d)), fitW('axe', a), new THREE.Vector3(), k, k);
      return;
    }
  }
  a.grip('Right', _v); a.grip('Left', _v2);
  let d, pos;
  if (w === 'pistol') { a.bones.RightForeArm.getWorldPosition(_v3); d = _v.clone().sub(_v3).normalize(); pos = _v.clone(); }
  else { d = _v.clone().sub(_v2); if (d.lengthSq() < 1e-8) { o.visible = false; return; } d.normalize(); pos = _v.clone().add(_v2).multiplyScalar(0.5); }
  const x = new THREE.Vector3().crossVectors(UP, d); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize();
  const y = new THREE.Vector3().crossVectors(d, x);
  o.quaternion.setFromRotationMatrix(_m4.makeBasis(x, y, d)); o.position.copy(pos);
}
function updateBat() {
  const w = weaponOf();
  for (const k in held) held[k].visible = false;
  for (const k in heldRef) heldRef[k].visible = false;
  if (!main?.action || !HELD[w] || !held[w] || $('batShow')?.checked === false) return;
  placeHeldOn(main, held[w]);
  if (ref?.root.visible && ref.action && $('gunref').checked && heldRef[w]) placeHeldOn(ref, heldRef[w]);
}
const vr = { panel: null, cv: null, label: null, cfg: null, imgs: {}, pose: null };
function vidRef(name) {
  vr.cfg = VIDREF[name] || null;
  if (!vr.panel) {
    vr.panel = document.createElement('div');
    vr.panel.style.cssText = 'position:fixed;right:8px;bottom:120px;width:min(44vw,520px);background:#111;border-radius:8px;overflow:hidden;z-index:20';
    vr.panel.innerHTML = '<canvas width="520" height="285" style="display:block;width:100%"></canvas><div style="color:#ddd;font:12px system-ui;padding:4px 8px"></div>';
    document.body.appendChild(vr.panel); vr.cv = vr.panel.querySelector('canvas'); vr.label = vr.panel.querySelector('div');
  }
  vr.panel.style.display = vr.cfg ? '' : 'none';
  if (!vr.cfg) return;
  if (!vr.pose) fetch(vr.cfg.dir + 'pose.json').then((r) => r.json()).then((p) => { vr.pose = p; refresh(); }).catch(() => {});
  for (let k = vr.cfg.first; k <= vr.cfg.last; k++) if (!vr.imgs[k]) { const im = new Image(); im.src = vr.cfg.dir + 'f' + String(k).padStart(4, '0') + '.jpg'; im.onload = () => { if (Math.round(S.frame) + vr.cfg.offset === k) refresh(); }; vr.imgs[k] = im; }
  setCam('left'); // (the reference films her left side)
}
const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [0, 11], [0, 12]];
function drawVidRef(f) {
  if (!vr.cfg) return;
  const rf = clamp(f + vr.cfg.offset, vr.cfg.first, vr.cfg.last), im = vr.imgs[rf], cv = vr.cv, cx = cv.getContext('2d');
  if (im && im.complete && im.naturalWidth) { cv.height = Math.round(520 * im.naturalHeight / im.naturalWidth); cx.drawImage(im, 0, 0, 520, cv.height); }
  const lm = vr.pose?.frames?.[rf];
  if (lm && $('vidSkel')?.checked !== false) { cx.lineWidth = 2; for (const [i, j] of EDGES) { cx.strokeStyle = i % 2 && j % 2 ? '#4f9' : '#fc4'; cx.beginPath(); cx.moveTo(lm[i][0] * 520, lm[i][1] * cv.height); cx.lineTo(lm[j][0] * 520, lm[j][1] * cv.height); cx.stroke(); } }
  vr.label.textContent = 'reference: clip 13 frame ' + rf + '   (Yola frame ' + f + ')';
}

// ---------------- UI ----------------
// each weapon's idle and attack clips in the game (render/clipchars.js, core/weapons.js): the axe holds the bat idle and
// chops; the one-handed bat is the Quaternius sword set; the guns shoot with a kick in code, not a clip
const WEAPON_CLIPS = {
  pistol: { label: 'Pistol', idle: 'pistol_idle', attack: 'kick' },
  short: { label: 'Shotgun', idle: 'sg_reload', attack: null }, // (the game holds sg_reload's hold frame; its kick is not in the Rig Lab yet)
  axe: { label: 'Axe', idle: 'bat_idle', attack: 'bat_swing' }, // (its combo: bat_swing, then t_chop)
  bat: { label: 'Bat', idle: 'ual1_Sword_Idle', attack: 'ual_Sword_Regular_Combo' },
  none: { label: 'None', idle: null, attack: null },
};
// the clip list grouped by weapon and kind of move, as the game plays them (the user, 2026-10-16: "this viewer isn't
// sorting the animations per weapon and per type"). The guns, axe and bat run on the pistol gait's LEGS under their own
// upper body (the bat's options: render/clipchars.js batRun); unarmed runs are the regular "plain" clips.
const PMOVE = ['pistol_walk', 'pistol_run', 'pistol_walk_back', 'pistol_run_back', 'pistol_strafe_left', 'pistol_strafe_right', 'pistol_strafe_run_left', 'pistol_strafe_run_right'];
const PLAIN = ['p_run_plain', 'p_run_back_plain', 'p_walk_strafe_left_plain', 'p_walk_strafe_right_plain', 'p_run_strafe_left_plain', 'p_run_strafe_right_plain'];
const GAME_CLIPS = {
  pistol: { Idle: ['pistol_idle'], Move: PMOVE, Reload: ['pistol_reload'], 'Hit (pistol)': ['pistol_hit'] },
  short: { 'Idle (its hold frame)': ['sg_reload'], 'Move (legs only, upper body = hold)': PMOVE, Reload: ['sg_reload'], 'Mixamo sources': ['rifle_aim_idle', 'reload_rifle_stand'] },
  axe: { 'Idle (upper body)': ['bat_idle'], 'Move (legs only)': PMOVE, 'Attack (swing, chop)': ['bat_swing', 't_chop'] },
  bat: { Idle: ['ual1_Sword_Idle'], 'Move, run "now" / "rebase" (legs only)': PMOVE, 'Move, run "plain"': PLAIN, 'Attack (4 strikes)': ['ual_Sword_Regular_Combo'] },
  none: { 'Idle (fists)': ['tripo_idle'], Move: PLAIN, 'Attack (jab, cross, kick)': ['t_box_01', 't_box_02', 't_kick_02'] },
};
const EVERYONE = { 'Everyone: hit, knockdown, death': ['hit_body', 'yola_knockdown', 'yola_getup', 'death_fall', 'death_defeat'], 'Everyone: scripted (the opening)': ['t_greet_01', 't_greet_04'] };
function fillClips() {
  const sel = $('clip'), keep = sel.value, anims = mainCache[S.char].gltf.animations, byN = Object.fromEntries(anims.map((c) => [c.name, c])), used = new Set();
  sel.innerHTML = '';
  const group = (label, list) => {
    const ok = list.filter((n) => byN[n]); if (!ok.length) return;
    const g = document.createElement('optgroup'); g.label = label;
    for (const n of ok) { g.appendChild(new Option(`${n}  (${clipFrames(byN[n])}f)`, n)); used.add(n); }
    sel.appendChild(g);
  };
  group('TEST RE-BAKES (not in the game)', anims.map((c) => c.name).filter((n) => /_REBAKE_/.test(n)));
  const ws = GAME_CLIPS[S.gun] ? [S.gun] : Object.keys(GAME_CLIPS);
  for (const w of ws) for (const [kind, list] of Object.entries(GAME_CLIPS[w])) group(`${(WEAPON_CLIPS[w].label === 'None' ? 'Fists / none' : WEAPON_CLIPS[w].label).toUpperCase()}: ${kind}`, list);
  for (const [kind, list] of Object.entries(EVERYONE)) group(kind, list);
  group(ws.length === 1 ? 'Other clips (other weapons, library picks, unused)' : 'Other clips (library picks, unused)', anims.map((c) => c.name).filter((n) => !used.has(n)).sort());
  if (byN[keep]) sel.value = keep;
}
function pickClip(name) {
  const sel = $('clip'); if (!name || ![...sel.options].some((o) => o.value === name)) return;
  if (sel.value !== name) { sel.value = name; sel.dispatchEvent(new Event('change')); }
}
function stopFiring() { SHOT.auto = false; SHOT.recoil = 0; const c = $('pauto'); if (c) c.checked = false; }
function weaponUI() {
  for (const b of $('weapons').children) b.classList.toggle('on', b.dataset.k === S.gun);
  const W = WEAPON_CLIPS[S.gun];
  $('wIdle').disabled = !W?.idle; $('wAttack').disabled = !W?.attack;
  $('wAttack').title = W?.attack === 'kick' ? 'the idle with the game\'s shot kick, firing every 0.24 s' : W?.attack || 'not in the Rig Lab yet';
}
function pausedUI(p) { S.playing = !p; $('play').textContent = S.playing ? 'Pause' : 'Play'; $('play').classList.toggle('on', S.playing); }
function buildUI() {
  for (const k in CHARS) { const b = document.createElement('button'); b.textContent = CHARS[k].label; b.dataset.k = k; b.onclick = () => setChar(k); $('chars').appendChild(b); }
  for (const k in GUNS) $('gun').add(new Option(GUNS[k], k));
  $('gun').value = S.gun;
  $('gun').onchange = (e) => { S.gun = e.target.value; fillClips(); applyGun(); refresh(); weaponUI(); };
  // weapon picker (top bar, the user 2026-10-16): what she holds, kept when the clip changes; Idle / Attack jump to
  // that weapon's own clips as the game plays them (pistol: the idle with the game's shot kick, see SHOT)
  for (const k of Object.keys(WEAPON_CLIPS)) {
    const b = document.createElement('button'); b.textContent = WEAPON_CLIPS[k].label; b.dataset.k = k;
    b.onclick = () => { S.gun = k; $('gun').value = k; fillClips(); pickClip(WEAPON_CLIPS[k].idle); applyGun(); refresh(); weaponUI(); };
    $('weapons').appendChild(b);
  }
  $('wIdle').onclick = () => { const W = WEAPON_CLIPS[S.gun]; if (W) { stopFiring(); pickClip(W.idle); } };
  $('wAttack').onclick = () => {
    const W = WEAPON_CLIPS[S.gun]; if (!W) return;
    if (W.attack === 'kick') { pickClip(W.idle); SHOT.auto = true; SHOT.next = 0; const c = $('pauto'); if (c) c.checked = true; } else if (W.attack) pickClip(W.attack);
  };
  weaponUI();
  $('clip').addEventListener('change', () => setTimeout(() => { applyGun(); refresh(); }, 0)); // auto follows the clip
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
  $('camYolaHands').onclick = () => camHands('main'); $('camRefHands').onclick = () => camHands('ref');
  $('fingerBones').onchange = () => updateFingers();
  $('pistolFist').onchange = refresh;
  $('fitReset').onclick = () => { Object.assign(fit, FIT0); for (const r of host.children) r._set(fit[r.dataset.k]); refresh(); };
  $('fitHere').onclick = () => { mainGun.calibrate(); refGun.calibrate(); refresh(); };
  $('clip').onchange = (e) => setClip(e.target.value);
  $('lay').onclick = () => { S.overlay = !S.overlay; layout(); refresh(); };
  $('match').onchange = () => { layout(); refresh(); };
  $('marks').onchange = refresh; $('posture').onchange = refresh; $('mags').onchange = refresh; buildHandsUI();
  $('batShow').onchange = refresh; $('vidSkel').onchange = refresh;
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

// ---------------- review captures (full-size close-ups without the window: WEAPON_HOLD_PROCESS.md 16) ----------------
// capView: one rig (who 'main' / 'ref'), looking at target ('hands', 'rhand', 'lhand', 'head', 'body', 'pair') from dir (world:
// she faces +Z, her right is +X) at dist metres. capSheet: a grid of such views (each cell may set clip / frame / gun /
// pre()) saved as shots/<name>.png through the dev server.
async function capView({ who = 'main', dir = [1, 0.3, 1], dist = 0.5, target = 'hands', w = 600, h = 450, solo = false }) {
  const a = who === 'ref' ? ref : main, cam = camera, c = new THREE.Vector3();
  if (target === 'hands') { a.grip('Right', _v); a.grip('Left', _v2); c.copy(_v).lerp(_v2, 0.5); }
  else if (target === 'rhand' || target === 'lhand') a.grip(target === 'rhand' ? 'Right' : 'Left', c);
  else if (target === 'pair') { main.bones.Hips.getWorldPosition(_v); ref.bones.Hips.getWorldPosition(_v2); c.copy(_v).lerp(_v2, 0.5); c.y = 0.9; }
  else if (target === 'head') a.bones.Neck.getWorldPosition(c);
  else { a.bones.Hips.getWorldPosition(c); c.y = 0.9 * a.height / 1.62; }
  const keep = { p: cam.position.clone(), t: controls.target.clone(), asp: cam.aspect, pr: renderer.getPixelRatio() };
  cam.position.copy(c).addScaledVector(_v3.set(...dir).normalize(), dist); cam.lookAt(c); cam.aspect = w / h; cam.updateProjectionMatrix();
  const other = solo ? (a === main ? ref : main) : null, vis = other?.root.visible; // (solo: the other rig hidden)
  const hidden = other ? [other.root, other === ref ? refGun?.obj : mainGun?.obj, ...Object.values(other === ref ? heldRef : held)].filter((o) => o && o.visible) : [];
  updateFingers(); for (const o of hidden) o.visible = false; if (other) other.fing.g.visible = false;
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.render(scene, cam);
  for (const o of hidden) o.visible = true; if (other) other.root.visible = vis;
  const bmp = await createImageBitmap(renderer.domElement);
  renderer.setPixelRatio(keep.pr); renderer.setSize(innerWidth, innerHeight, false); cam.aspect = keep.asp; cam.updateProjectionMatrix();
  cam.position.copy(keep.p); controls.target.copy(keep.t); controls.update();
  return bmp;
}
async function capSheet(name, cells, cols = 3, w = 520, h = 400) {
  const rows = Math.ceil(cells.length / cols), oc = new OffscreenCanvas(cols * w, rows * h), cx = oc.getContext('2d');
  cx.fillStyle = '#111'; cx.fillRect(0, 0, oc.width, oc.height);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.gun && S.gun !== c.gun) { S.gun = c.gun; $('gun').value = c.gun; fillClips(); applyGun(); weaponUI(); }
    if (c.clip && main.clip?.name !== c.clip) { $('clip').value = c.clip; await setClip(c.clip); applyGun(); }
    pausedUI(true); if (c.frame) S.frame = c.frame;
    c.pre?.(); refresh();
    const bmp = await capView({ ...c, w, h }), x = (i % cols) * w, y = Math.floor(i / cols) * h;
    cx.drawImage(bmp, x, y);
    cx.fillStyle = 'rgba(0,0,0,.6)'; cx.fillRect(x, y, w, 22); cx.fillStyle = '#fff'; cx.font = '15px sans-serif'; cx.fillText(c.label || '', x + 6, y + 16);
    cx.strokeStyle = '#444'; cx.strokeRect(x, y, w, h);
  }
  const r = await fetch('/__shot/' + name + '.png', { method: 'POST', body: await oc.convertToBlob({ type: 'image/png' }) });
  return r.status;
}

// ---------------- main ----------------
(async function init() {
  buildUI(); makeMarks();
  // reference: the Mixamo X Bot with skin (its own pistol-idle clip is replaced by the selected source clip)
  const xb = await loadF('assets/mixamo/reference/ref_xbot_pistol_idle.fbx');
  xb.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  ref = refX = new Actor(xb, 1.62); ref.root.visible = false; scene.add(ref.root, ref.helper);
  refGun = refGunX = new Gun(ref);
  for (const [k, f] of Object.entries(GUN_FILES)) {
    try { const g = await loadG(f); gunTemplates[k] = k === 'short' ? prepPumpShort(g) : prepShotgun(g); } catch { /* not built yet */ }
  }
  for (const k of ['short', 'old']) if (!gunTemplates[k]) $('gun').querySelector(`option[value=${k}]`).textContent += ' (not built yet)';
  try { const g = await loadG('assets/weapons/shell.glb'); shellTemplate = prepShell(g); shellObj = shellTemplate; shellObj.visible = false; scene.add(shellObj); } catch { /* not built yet */ }
  const want = new URLSearchParams(location.search).get('char');
  await setChar(want in CHARS ? want : 'yola');
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const kicking = SHOT.recoil > 0 || SHOT.auto;
    if (SHOT.auto && (SHOT.next -= dt) <= 0) { SHOT.recoil = 1; SHOT.next = 0.24; } // (tuning.pistolInterval)
    SHOT.recoil = Math.max(0, SHOT.recoil - dt * 7); // (core/player.js)
    if (S.playing && main?.action) {
      S.frame += dt * FPS * S.speed; // (frames of the current clip's own rate)
      if (S.frame >= S.frames + 1) S.frame = $('loop').checked ? 1 : S.frames;
      refresh();
    } else if (kicking) refresh();
    if (main?.hair?.ok) { main.hair.on = $('hairSway').checked; main.hair.update(dt * (S.playing ? S.speed : 1)); }
    updateFingers();
    controls.update(); renderer.render(scene, camera);
  });
  window.__lab = { view: capView, sheet: capSheet, postureC, ualRef, UAL_FILES, camHands, updateFingers, held, heldRef, renderer, PUMP, alignShell, gunObj: () => mainGun?.obj, shellFit, setShell: (o) => { Object.assign(shellFit, o); for (const r of $('fit2').children) r._set(shellFit[r.dataset.k]); refresh(); }, camera, controls, setCam, S, fit, get main() { return main; }, get ref() { return ref; }, scene, refresh, setChar, setClip, applyGun, setFrame: (f) => { pausedUI(true); S.frame = f; refresh(); } };
})();
