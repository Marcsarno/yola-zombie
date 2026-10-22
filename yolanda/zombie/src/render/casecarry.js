// The case in the left hand (Chapter 2: Marc carries the vaccine case): one hold for the game (render/clipchars.js
// carryArm) and the Rig Lab (its Case section, where the user sets it up), so the two always match.
// Whatever the body plays (the runs, the pistol, the crowbar), the left arm hangs straight with the case's handle in a
// closed fist, the palm toward the leg; it still swings as the clip swings that arm, by `swing` % of it (a pendulum from
// the shoulder, fore and aft), so the run keeps its rhythm while the arm carries the weight.
import * as THREE from 'three';
import { ikArm } from './ik.js';

// the case (props/hood_case.glb): lying flat, origin at its foot, 46 x 15 x 32 cm, the handle on its +Z edge running along
// X; HANDLE its middle (case units, before `size`)
export const CASE_FILE = 'assets/neighborhood/props/hood_case.glb';
const HANDLE = new THREE.Vector3(0, 0.07, 0.175);
// the settings (Rig Lab Case; saved per character in assets/hold/case_carry.json):
//   swing  % of the clip's own arm swing kept;  out / fwd  cm: the hand off his side / ahead of the shoulder;  lift  cm:
//   the hand raised (the elbow bends);  roll  deg: the forearm turned from palm-to-the-leg;  turn / tilt  deg: the case
//   turned round the upright / swung out round its handle;  curl / thumb  % of the closed fist;  size  % of the model
export const CASE0 = { size: 78, swing: 22, out: 5, fwd: 0, lift: 2, roll: 0, turn: 180, tilt: 0, curl: 100, thumb: 85 }; // (turn 180: the lid to his leg, its label reads from the handle's side)
export const caseFit = (f) => ({ ...CASE0, ...f });

const UP = new THREE.Vector3(0, 1, 0), D2R = Math.PI / 180;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3();
const _r = new THREE.Vector3(), _ax = new THREE.Vector3(), _p = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _c = new THREE.Vector3();

function rotW(b, axis, ang) {
  if (!b || Math.abs(ang) < 1e-6) return;
  _q.setFromAxisAngle(axis, ang); b.getWorldQuaternion(_q2); _q.multiply(_q2);
  b.parent.getWorldQuaternion(_q2); b.quaternion.copy(_q2.invert().multiply(_q)); b.updateMatrixWorld(true);
}
const signed = (a, b, axis) => { a.addScaledVector(axis, -a.dot(axis)); b.addScaledVector(axis, -b.dot(axis)); return a.lengthSq() > 1e-8 && b.lengthSq() > 1e-8 ? a.angleTo(b) * Math.sign(_x.crossVectors(a, b).dot(axis) || 1) : 0; };

// per model, once: the straight left wrist (the bind pose) and the left hand's closed fist (`fist`: [bone, quat] pairs)
const RIGS = new WeakMap();
export function caseRig(model, bones, fist = []) {
  let r = RIGS.get(model); if (r) return r;
  let sk = null; model.traverse((o) => { if (!sk && o.isSkinnedMesh && o.skeleton.bones.includes(bones.LeftHand)) sk = o.skeleton; });
  const bindQ = (b) => { const q = new THREE.Quaternion(); new THREE.Matrix4().copy(sk.boneInverses[sk.bones.indexOf(b)]).invert().decompose(_v, q, _v2); return q; };
  const wrist = sk ? bindQ(bones.LeftForeArm).invert().multiply(bindQ(bones.LeftHand)) : bones.LeftHand.quaternion.clone();
  r = { bones, wrist, fist: fist.filter(([b]) => /Left/.test(b.name)) };
  RIGS.set(model, r); return r;
}

// the carry over the pose the clips gave: weight w (0..1), fwd the body's facing (world, level), H his height (m)
export function casePose(rig, fit, w, fwd, H) {
  if (w <= 1e-3) return;
  const B = rig.bones, hs = H / 1.8, arm = [B.LeftArm, B.LeftForeArm, B.LeftHand];
  const touched = [...arm, ...rig.fist.map(([b]) => b)], before = touched.map((b) => b.quaternion.clone());
  const right = _r.crossVectors(fwd, UP).normalize();
  // the clip's own swing of this arm: its upper arm's lean fore (+) or aft from hanging straight
  const S = B.LeftArm.getWorldPosition(_s), E = B.LeftForeArm.getWorldPosition(_e), W = B.LeftHand.getWorldPosition(_w);
  const L = E.distanceTo(S) + W.distanceTo(E), d = _v.copy(E).sub(S);
  const lean = Math.atan2(d.dot(fwd), Math.max(1e-4, -d.dot(UP)));
  // hanging: the wrist straight under the shoulder, off his side, the elbow nearly straight and turned back
  const T = _t.copy(S).addScaledVector(UP, -(L * 0.985 - fit.lift * 0.01 * hs)).addScaledVector(right, -fit.out * 0.01 * hs).addScaledVector(fwd, fit.fwd * 0.01 * hs);
  ikArm(B.LeftArm, B.LeftForeArm, B.LeftHand, T, 1);
  { const a = B.LeftArm.getWorldPosition(_s), h = B.LeftHand.getWorldPosition(_w), ax = _ax.copy(h).sub(a).normalize();
    const ep = B.LeftForeArm.getWorldPosition(_e).sub(a); rotW(B.LeftArm, ax, signed(ep, _p.copy(fwd).negate(), ax)); }
  // the wrist locked straight, the forearm turned so the palm faces the leg (+ roll)
  B.LeftHand.quaternion.copy(rig.wrist); B.LeftHand.updateMatrixWorld(true);
  { const A = B.LeftHand.getWorldPosition(_w).sub(B.LeftForeArm.getWorldPosition(_e)).normalize();
    const F = B.LeftHandMiddle1.getWorldPosition(_v).sub(B.LeftHand.getWorldPosition(_c)).normalize();
    const Rd = B.LeftHandIndex1.getWorldPosition(_v2).sub(B.LeftHandPinky1.getWorldPosition(_c)); Rd.addScaledVector(F, -Rd.dot(F));
    const P = _p.crossVectors(F, Rd).normalize(); // (out of the palm: the left hand mirrors the right's R x F)
    rotW(B.LeftHand, A, signed(P, _y.copy(right), A) + fit.roll * D2R); }
  // the pendulum: the whole arm swung from the shoulder by part of the clip's swing
  rotW(B.LeftArm, right, lean * fit.swing / 100);
  for (const [b, q] of rig.fist) b.quaternion.slerp(q, (/Thumb/.test(b.name) ? fit.thumb : fit.curl) / 100);
  if (w < 1) touched.forEach((b, i) => { _q.copy(b.quaternion); b.quaternion.copy(before[i]).slerp(_q, w); });
  B.LeftArm.updateMatrixWorld(true);
}

// the case in the world (obj: position, quaternion, scale): its handle through the fist, along the knuckles (index to
// little finger), the case below it
export function casePlace(rig, obj, fit) {
  const B = rig.bones, H = 'LeftHand';
  const c = _c.set(0, 0, 0); let n = 0;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = B[H + f + i]; if (b) { c.add(b.getWorldPosition(_v)); n++; } }
  c.multiplyScalar(1 / Math.max(1, n));
  const X = _x.copy(B.LeftHandIndex1.getWorldPosition(_v)).sub(B.LeftHandPinky1.getWorldPosition(_v2)).normalize();
  const Z = _z.copy(B.LeftHand.getWorldPosition(_v)).sub(B.LeftHandMiddle1.getWorldPosition(_v2)); Z.addScaledVector(X, -Z.dot(X)).normalize(); // (up: knuckles to wrist)
  const Y = _y.crossVectors(Z, X).normalize();
  obj.quaternion.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
  obj.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), fit.turn * D2R)).multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), fit.tilt * D2R));
  const s = fit.size / 100; obj.scale.setScalar(s);
  obj.position.copy(c).sub(_v.copy(HANDLE).multiplyScalar(s).applyQuaternion(obj.quaternion));
}
