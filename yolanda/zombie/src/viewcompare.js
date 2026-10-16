// Rig Lab "Before / After" (2026-10-16, the user: "show me a before and after in the animation viewer... label what is finished
// and what is not finished"): the new Yola twice, side by side, in step.
//   BEFORE: assets/source/yola_v2/yola2_before_grips.glb (her clips before this pass) held by the game's code before it:
//           each weapon at the wrist / knuckle midpoint, no finger fit, and the mixer bug that dropped every constant track
//           (the Mixamo clips' finger curls: flat hands in the game)
//   AFTER:  assets/yola2.glb held by the game's code now (render/holdsolve.js, core/weapons.js HOLD_DEFS)
// "Game hold" puts a weapon's hold over a gait the way the game layers them (the hold's upper body on the gait's legs);
// "Clip" plays one clip on both. Numbers and the full check: tools/gripcheck.js (in the game).
import * as THREE from 'three';
import { makePistol, makeBat, prepPumpShort, prepAxe } from './render/weaponModels.js';
import { ikArm } from './render/ik.js';
import { fistFrame, fitFist, openFingers, clearHead, gripAt, ikFist } from './render/holdsolve.js';
import { HOLD_DEFS, BAT_DEF } from './core/weapons.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const LOWER = /Hips|UpLeg|Leg|Foot|Toe/;
const UP = new THREE.Vector3(0, 1, 0);
const V = () => new THREE.Vector3();
const frame = () => ({ c: V(), a: V(), k: V() });

// what was checked, and where it stands (finished = checked in the game and in Blender, nothing left to fix)
export const STATUS = [
  { kind: 'hold', w: 'bat', label: 'Bat (one-handed)', done: true, note: 'Right fist wraps the handle (fingers fitted to it, 2 mm contact). Nothing enters her body standing, walking, running, strafing or backing up.' },
  { kind: 'hold', w: 'axe', label: 'Axe', done: true, note: 'Both fists closed on the handle (was: open flat hands, handle 6 cm off the fists). Kept off her head and hair (was 24 mm in while walking; now 0 standing, 3-6 mm hair contact moving).' },
  { kind: 'hold', w: 'fists', label: 'Unarmed', done: false, note: 'Standing, walking, running, strafing: hands no longer sink into her thighs (was 3-5 cm; now 0-6 mm). NOT FINISHED: running backwards still puts a hand ~17 mm into a thigh.' },
  { kind: 'hold', w: 'pistol', label: 'Pistol', done: false, note: 'Grip now inside her fist (was at her wrist, 9 cm off), grip rake fixed, nothing enters her body. NOT FINISHED: fingers still sink ~9 mm into this grip and her two hands overlap ~2 cm. The pistol MODEL is up for review (options sheet: the Hospital Weapons Core pistol).' },
  { kind: 'hold', w: 'shotgun', label: 'Shotgun', done: false, note: 'Grip and pump now in her fists (were 7-9 cm off), nothing enters her body. NOT FINISHED: this model\'s grip is thicker than her hand, fingers sink 9-14 mm (model change pending your choice).' },
  { kind: 'clip', clip: 'tripo_idle', label: 'Unarmed idle (clip)', done: true, note: 'Arms turned out ~9 deg at the shoulder: hands beside the pockets instead of inside her thighs. Clean every frame (Blender scan).' },
  { kind: 'clip', clip: 'p_run_plain', label: 'Unarmed run (clip)', done: true, note: 'Arms out 14-21 deg where they swung through her hips. Clean every frame.' },
  { kind: 'clip', clip: 'p_walk_strafe_left_plain', label: 'Unarmed strafes / back run (clips)', done: true, note: 'Arms out 5-11 deg. Clean every frame in Blender (in the game the back run still touches: see Unarmed).' },
  { kind: 'clip', clip: 'bat_idle', label: 'Axe stance (clip)', done: true, note: 'Right fist moved 8 mm off her cheek. Clean.' },
  { kind: 'clip', clip: 't_greet_01', label: 'Greeting wave 1 (clip)', done: true, note: 'Arms out ~10 deg. Clean.' },
  { kind: 'clip', clip: 't_chop', label: 'Axe chop (clip)', done: false, note: 'Played frames 52-74: raised fist taken out of her head. NOT FINISHED: right hand still 7 mm in at frame 67.' },
  { kind: 'clip', clip: 'ual_Sword_Regular_Combo', label: 'Bat combo (clip)', done: false, note: 'Hands moved out (max 6 cm). NOT FINISHED: left hand 35 mm into her thigh at frame 6, right 8 mm at 78; right upper arm into her chest in the swings.' },
  { kind: 'clip', clip: 't_box_01', label: 'Jab (clip)', done: true, note: 'Forearms taken out of her waist / chest (played frames 8-38). Clean.' },
  { kind: 'clip', clip: 't_box_02', label: 'Cross (clip)', done: false, note: 'Right hand out of her body. NOT FINISHED: right upper arm into her chest at frame 45.' },
  { kind: 'clip', clip: 't_kick_02', label: 'Kick (clip)', done: false, note: 'Left hand moved off her back. NOT FINISHED: still 14 mm in at frame 31.' },
  { kind: 'clip', clip: 'pistol_reload', label: 'Pistol reload (clip)', done: false, note: 'Hands moved out of her hip (max 6 cm). NOT FINISHED: left upper arm into her chest at frame 44.' },
  { kind: 'clip', clip: 'bat_swing', label: 'Axe swing (clip)', done: false, note: 'NOT FINISHED: upper arms press into her chest at the follow-through (frames 38-42).' },
  { kind: 'note', label: 'Not touched yet', done: false, note: 'Deaths, knockdown / get-up, hit reactions, greeting 2 (its hands meet her body on purpose). The first Yola is not yet re-checked with these grip changes (they are shared game code).' },
];
const GAITS = { idle: 'Idle', walk: 'Walk', run: 'Run', strafe: 'Strafe', back: 'Back' };
const GAIT_CLIP = { idle: 'pistol_idle', walk: 'pistol_walk', run: 'pistol_run', strafe: 'pistol_strafe_left', back: 'pistol_walk_back' };
const UNARMED = { idle: 'tripo_idle', walk: 'p_run_plain', run: 'p_run_plain', strafe: 'p_walk_strafe_left_plain', back: 'p_run_back_plain' };
const HOLD_UPPER = { shotgun: 'sg_reload', axe: 'bat_idle', bat: 'ual1_Sword_Idle' };
const weaponOfClip = (n) => /^ual_Sword|ual1_Sword/.test(n) ? 'bat' : /bat_|chop|gs_/.test(n) ? 'axe' : /^sg_/.test(n) ? 'shotgun' : /^pistol_/.test(n) ? 'pistol' : 'fists';

function subClip(clip, keep, name) { const c = clip.clone(); c.name = name; c.tracks = c.tracks.filter((t) => keep(t.name.split('.')[0])); return c; }
function pin(clip, rest) { // horizontal hips pinned (the game's stripRoot)
  for (const t of clip.tracks) { if (!/Hips\.position$/.test(t.name)) continue; const v = t.values; for (let i = 0; i < v.length; i += 3) { v[i] = rest.x; v[i + 2] = rest.z; } }
  return clip;
}
// every animated value written (the mixer skips a value equal to its last: bones put back to rest first would stay there)
function mixAll(m) { m.update(0); const k = m._accuIndex + 1; for (let i = 0; i < m._nActiveBindings; i++) { const pm = m._bindings[i]; pm.binding.setValue(pm.buffer, k * pm.valueSize); } }

class Body {
  constructor(gltf, legacy) {
    this.legacy = legacy; this.root = new THREE.Group(); this.model = gltf.scene; this.root.add(this.model);
    for (const ch of this.model.children) { ch.position.x = 0; ch.position.z = 0; }
    this.model.scale.setScalar(1.62); // (Tripo meshes are 1 unit tall: the game's height)
    this.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; const m = o.material; if (m.metalnessMap) m.metalnessMap = null; m.metalness = 0; m.roughness = Math.max(m.roughness, 0.6); } });
    this.bones = {}; this.model.traverse((o) => { if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o; });
    this.restQ = Object.values(this.bones).map((b) => [b, b.quaternion.clone()]);
    const hips = this.bones.Hips.position;
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, pin(c, hips)]));
    this.mixer = new THREE.AnimationMixer(this.model); this.acts = {};
  }
  act(name, part) { // part: 'full' | 'upper' | 'lower'
    const key = name + '|' + part; if (this.acts[key]) return this.acts[key];
    const c = this.clips[name]; if (!c) return null;
    const clip = part === 'full' ? c : subClip(c, (b) => (part === 'lower' ? LOWER.test(b) : !LOWER.test(b)), key);
    const a = this.mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); a.timeScale = 0;
    const t0 = Math.min(...clip.tracks.map((t) => t.times[0]));
    a.userData = { t0, frames: Math.round((clip.duration - t0) * 30) + 1, constant: new Set(clip.tracks.filter((t) => /quaternion$/.test(t.name) && isConst(t)).map((t) => t.name.split('.')[0])) };
    return (this.acts[key] = a);
  }
  // layers: [[action, frame (1-based, wraps)]]
  pose(layers) {
    for (const a of Object.values(this.acts)) a.setEffectiveWeight(0);
    for (const [b, q] of this.restQ) b.quaternion.copy(q);
    for (const [a, f] of layers) { const u = a.userData; a.time = u.t0 + ((((f - 1) % u.frames) + u.frames) % u.frames) / 30; a.setEffectiveWeight(1); }
    mixAll(this.mixer);
    if (this.legacy) { // the game before: every constant track (each clip's fixed finger curl) stayed at rest
      const rest = (this._restOf ||= new Map(this.restQ));
      const cons = new Set(); for (const [a] of layers) for (const n of a.userData.constant) cons.add(n);
      for (const n of cons) { const b = this.model.getObjectByName(n); if (b?.isBone && /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n)) b.quaternion.copy(rest.get(b)); }
    }
    this.root.updateMatrixWorld(true);
  }
  grip(side, out) { this.bones[side + 'Hand'].getWorldPosition(out); return out.add(this.bones[side + 'HandMiddle1'].getWorldPosition(V())).multiplyScalar(0.5); }
  ikArm(side, target, w) { const hand = this.bones[side + 'Hand'], t = target.clone(); const g = this.grip(side, V()); t.sub(g.sub(hand.getWorldPosition(V()))); ikArm(this.bones[side + 'Arm'], this.bones[side + 'ForeArm'], hand, t, w); }
  aimQuat(out) { // pistol orientation from the arms (the game's aimQuat)
    const r = this.grip('Right', V()), l = this.grip('Left', V()), mid = this.bones.RightArm.getWorldPosition(V()).add(this.bones.LeftArm.getWorldPosition(V())).multiplyScalar(0.5);
    const d = r.add(l).multiplyScalar(0.5).sub(mid).normalize(); this.root.getWorldQuaternion(_rq);
    const loc = d.applyQuaternion(_rq.clone().invert());
    out.setFromEuler(new THREE.Euler(-Math.asin(clamp(loc.y, -1, 1)), Math.atan2(loc.x, loc.z), 0, 'YXZ')); return out.premultiply(_rq);
  }
}
const _rq = new THREE.Quaternion();
function isConst(t) { const v = t.values, n = t.getValueSize(); for (let i = n; i < v.length; i++) if (Math.abs(v[i] - v[i % n]) > 1e-5) return false; return true; }

export class Compare {
  constructor({ scene, loadG, $ }) { this.scene = scene; this.loadG = loadG; this.$ = $; this.on = false; this.mode = 'hold'; this.weapon = 'axe'; this.gait = 'walk'; this.clip = 'tripo_idle'; this.frames = 60; }
  async load() {
    if (this.bodies) return;
    const [ga, gb, cd, sgA, sgB, axA, axB] = await Promise.all([this.loadG('assets/yola2.glb'), this.loadG('assets/source/yola_v2/yola2_before_grips.glb'), fetch('assets/clipdata_yola2.json').then((r) => r.json()),
      this.loadG('assets/weapons/pump_short.glb'), this.loadG('assets/weapons/pump_short.glb'), this.loadG('assets/weapons/fire_axe.glb'), this.loadG('assets/weapons/fire_axe.glb')]);
    const before = new Body(gb, true), after = new Body(ga, false);
    before.root.position.x = -0.55; after.root.position.x = 0.55;
    this.bodies = { before, after };
    const pistolOld = makePistol(1); pistolOld.children[0].rotation.x = -0.28; // (the grip's rake before it was fixed)
    const bat = () => { const h = new THREE.Group(), m = makeBat(0.84); h.add(m); return h; };
    before.w = { pistol: pistolOld, shotgun: prepPumpShort(sgB), axe: prepAxe(axB), bat: bat() };
    after.w = { pistol: makePistol(1), shotgun: prepPumpShort(sgA), axe: prepAxe(axA), bat: bat() };
    for (const b of [before, after]) { this.scene.add(b.root); for (const o of Object.values(b.w)) { o.visible = false; this.scene.add(o); } this.calibrate(b, cd); }
    this.labels = ['BEFORE', 'AFTER'].map((t, i) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = `position:fixed;z-index:15;font:800 15px system-ui;padding:3px 10px;border-radius:7px;pointer-events:none;transform:translate(-50%,-100%);background:${i ? '#2fb1b4' : '#c0574b'};color:#fff`; document.body.appendChild(d); return d; });
  }
  // the hand-relative sockets, as the game measures them at load (the same for both: the game's calibration did not change)
  calibrate(b, cd) {
    b.pose([[b.act('ual1_Sword_Idle', 'full'), 1]]);
    b.pose([[b.act('sg_reload', 'upper'), 1], [b.act('pistol_idle', 'lower'), 1]]); // the shotgun hold (frame 1)
    const r = b.grip('Right', V()), l = b.grip('Left', V()), x = l.sub(r).normalize(), z = V().crossVectors(x, UP).normalize(), y = V().crossVectors(z, x);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    b.sgSocket = b.bones.RightHand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q);
    const d = cd?.bat_idle?.[0]?.d; // the axe: the handle's direction in the bat stance, in the right hand's frame
    if (d) { b.pose([[b.act('bat_idle', 'full'), 1]]); b.batSocket = new THREE.Vector3(...d).applyQuaternion(b.bones.RightHand.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize(); }
  }
  setOn(v) { this.on = v; if (!this.bodies) return; for (const b of Object.values(this.bodies)) { b.root.visible = v; if (!v) for (const o of Object.values(b.w)) o.visible = false; } for (const l of this.labels) l.style.display = v ? '' : 'none'; }
  layers(b) {
    if (this.mode === 'clip') { const a = b.act(this.clip, 'full'); return a ? [[a, null]] : []; }
    const w = this.weapon, g = this.gait;
    if (w === 'fists') return [[b.act(UNARMED[g], 'full'), null]];
    if (w === 'pistol') return [[b.act(GAIT_CLIP[g], 'full'), null]];
    return [[b.act(HOLD_UPPER[w], 'upper'), w === 'shotgun' ? 1 : null], [b.act(GAIT_CLIP[g], 'lower'), null]];
  }
  // frames of the shown animation (the gait's, or the clip's)
  length() { const b = this.bodies?.after; if (!b) return 1; const L = this.layers(b); const main = L[L.length - 1]?.[0]; return main ? main.userData.frames : 1; }
  update(f, camera) {
    if (!this.on || !this.bodies) return;
    for (const b of Object.values(this.bodies)) {
      const L = this.layers(b); if (!L.length || L.some(([a]) => !a)) continue;
      b.pose(L.map(([a, fixed]) => [a, fixed ?? f]));
      const w = this.mode === 'clip' ? weaponOfClip(this.clip) : this.weapon;
      for (const [k, o] of Object.entries(b.w)) o.visible = k === w;
      if (w !== 'fists') (b.legacy ? holdBefore : holdAfter)(b, w);
    }
    if (camera) ['before', 'after'].forEach((k, i) => { const p = this.bodies[k].bones.Head.getWorldPosition(V()); p.y += 0.3; p.project(camera); this.labels[i].style.left = ((p.x + 1) / 2) * innerWidth + 'px'; this.labels[i].style.top = ((1 - p.y) / 2) * innerHeight + 'px'; });
  }
}

// ---- the game's hold code, BEFORE this pass (git 6675591, render/clipchars.js placeWeapons) ----
function holdBefore(b, w) {
  const o = b.w[w];
  if (w === 'pistol') { b.aimQuat(o.quaternion); o.position.copy(b.grip('Right', V())); }
  else if (w === 'shotgun') {
    b.bones.RightHand.getWorldQuaternion(o.quaternion).multiply(b.sgSocket); o.position.copy(b.grip('Right', V())); o.updateMatrixWorld(true);
    const U = o.userData, gl = b.grip('Left', V()), rest = o.localToWorld(new THREE.Vector3(U.pumpX, U.pump.position.y, U.pump.position.z));
    const wHold = smooth01(1 - (gl.distanceTo(rest) - 0.03) / 0.12);
    if (wHold > 0) b.ikArm('Left', U.gripL.getWorldPosition(V()), wHold);
  } else if (w === 'axe') {
    const dir = b.batSocket.clone().applyQuaternion(b.bones.RightHand.getWorldQuaternion(new THREE.Quaternion())).normalize();
    o.position.copy(b.grip('Right', V()).add(b.grip('Left', V())).multiplyScalar(0.5)); axeBlade(b, o, dir);
  } else if (w === 'bat') placeBat(b, o, false);
  o.updateMatrixWorld(true);
}
// ---- the game's hold code now (render/clipchars.js placeWeapons, standing / moving: no swing) ----
function holdAfter(b, w) {
  const o = b.w[w], F = frame(), q = new THREE.Quaternion();
  if (w === 'pistol') {
    const D = HOLD_DEFS.pistol; b.aimQuat(q);
    fitFist(b, 'Right', new THREE.Vector3(...D.shaft_axis).applyQuaternion(q)); fistFrame(b, 'Right', F);
    o.quaternion.copy(q); o.position.copy(gripAt(b, 'Right', F, D.palm.Right, V())).sub(new THREE.Vector3(...D.grip_primary).applyQuaternion(q));
    openFingers(b, 'Right', D.open.Right); openFingers(b, 'Left', D.open.Left);
  } else if (w === 'shotgun') {
    const D = HOLD_DEFS.shotgun; b.bones.RightHand.getWorldQuaternion(q).multiply(b.sgSocket);
    fitFist(b, 'Right', new THREE.Vector3(...D.shaft_axis).applyQuaternion(q)); fistFrame(b, 'Right', F);
    o.quaternion.copy(q); o.position.copy(gripAt(b, 'Right', F, D.palm.Right, V())).sub(new THREE.Vector3(...D.grip_primary).applyQuaternion(q)); o.updateMatrixWorld(true);
    openFingers(b, 'Right', D.open.Right);
    const t = o.userData.gripL.getWorldPosition(V()), pl = D.palm.Left;
    ikFist(b, 'Left', t, 1, pl); fitFist(b, 'Left', new THREE.Vector3(...D.support_axis).transformDirection(o.matrixWorld)); ikFist(b, 'Left', t, 1, pl);
    openFingers(b, 'Left', D.open.Left);
  } else if (w === 'axe') {
    const AX = HOLD_DEFS.axe, FL = frame();
    const dir = b.batSocket.clone().applyQuaternion(b.bones.RightHand.getWorldQuaternion(new THREE.Quaternion())).normalize();
    fitFist(b, 'Right', dir); fistFrame(b, 'Right', F); fistFrame(b, 'Left', FL);
    const top = gripAt(b, 'Right', F, AX.palm.Right, V());
    clearHead(b, top, dir, AX.reach, AX.clear, 'Right', AX.palm.Right);
    const span = clamp(top.clone().sub(FL.c).dot(dir), 0.07, 0.16), t = top.clone().addScaledVector(dir, -span);
    ikFist(b, 'Left', t, 1, AX.palm.Left); fitFist(b, 'Left', dir); ikFist(b, 'Left', t, 1, AX.palm.Left);
    openFingers(b, 'Right', AX.open.Right); openFingers(b, 'Left', AX.open.Left);
    o.position.copy(top).addScaledVector(dir, -span / 2); axeBlade(b, o, dir);
  } else if (w === 'bat') placeBat(b, o, true);
  o.updateMatrixWorld(true);
}
function axeBlade(b, o, dir) { // the blade toward her front (the game turns it to lead a swing; at rest it faces forward)
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.root.getWorldQuaternion(new THREE.Quaternion()));
  const want = fwd.addScaledVector(dir, -fwd.dot(dir)).normalize(), x = want.clone().negate(), y = V().crossVectors(dir, x);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, dir));
}
function placeBat(b, o, fitted) { // the game's placeHeld (the bat's data sheet, its grip in the right fist)
  const F = frame(); fistFrame(b, 'Right', F);
  const A = F.a.clone(), K = F.k.clone(), s = new THREE.Vector3(...BAT_DEF.shaft_axis).normalize(), r = new THREE.Vector3(...BAT_DEF.ref_axis); r.addScaledVector(s, -r.dot(s)).normalize();
  const M1 = new THREE.Matrix4().makeBasis(s, r, V().crossVectors(s, r)), M2 = new THREE.Matrix4().makeBasis(A, K, V().crossVectors(A, K));
  o.quaternion.setFromRotationMatrix(M2.multiply(M1.transpose()));
  o.position.copy(fitted ? gripAt(b, 'Right', F, HOLD_DEFS.bat.palm, V()) : F.c).sub(new THREE.Vector3(...BAT_DEF.grip_primary).applyQuaternion(o.quaternion));
  if (fitted) openFingers(b, 'Right', HOLD_DEFS.bat.open);
}
