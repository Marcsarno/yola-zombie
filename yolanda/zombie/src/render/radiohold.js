// The walkie-talkie in the right hand: one hold for the game (render/clipchars.js radioArm: Chapter 2's calls) and the
// Rig Lab (its Radio section, where the user sets it up), so the two always match.
// The wrist is locked (the hand stays as straight on the forearm as in the bind pose): the radio's angle comes from the
// forearm, which is turned on its own axis so the grille faces the mouth (plus the user's roll). The arm reaches by IK so
// that the grille lands where it is wanted (a few passes: the grille moves as the forearm turns), the elbow swung down.
import * as THREE from 'three';
import { ikArm } from './ik.js';
import { reachShoulder } from './holdfit.js';

// the Hospital Radio (props/hospital_radio.glb): origin at its foot, +Y up, +Z its face, 10 x 6 x 25 cm with the antenna;
// BACK the middle of its back at the foot, MIC its grille (its own units, before `size`)
export const RADIO_FILE = 'assets/neighborhood/props/hospital_radio.glb';
const BACK = new THREE.Vector3(-0.002, 0, -0.024), MIC = new THREE.Vector3(-0.002, 0.1, 0.032);
// the settings (Rig Lab Radio; saved per character in assets/hold/radio_hold.json):
//   size   % of the model (72: a real handheld's 7 cm width, for a hand to close round)
//   slide  cm: how far up its body the hand is from its foot
//   grip   deg: the radio turned in the palm (0: across the palm like a handle, 90: along the fingers like a phone)
//   talk / listen: its grille from the mouth (cm: fwd, side = to his right, up) and roll (deg: the forearm turned more
//          than the turn that shows the grille to the mouth)
//   elbow  deg: swung out from straight down;  curl / thumb  % of the closed fist;  chin  deg below level
export const RADIO0 = { size: 72, slide: 4, grip: 55, elbow: 25, curl: 62, thumb: 30, chin: 6,
  talk: { fwd: 6, side: 6, up: -1, roll: 0 }, listen: { fwd: 8, side: 14, up: -14, roll: 0 } };
export const radioFit = (f) => ({ ...RADIO0, ...f, talk: { ...RADIO0.talk, ...f?.talk }, listen: { ...RADIO0.listen, ...f?.listen } });

const UP = new THREE.Vector3(0, 1, 0), D2R = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _r = new THREE.Vector3(), _mo = new THREE.Vector3(), _mt = new THREE.Vector3(), _wt = new THREE.Vector3();
const _a = new THREE.Vector3(), _e = new THREE.Vector3(), _h = new THREE.Vector3(), _s = new THREE.Vector3(), _mic = new THREE.Vector3(), _sp = new THREE.Vector3(), _sq = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _d = new THREE.Vector3();

// a bone turned by q about world axes (its children follow)
function rotW(b, axis, ang) {
  if (!b || Math.abs(ang) < 1e-6) return;
  _q.setFromAxisAngle(axis, ang); b.getWorldQuaternion(_q2); _q.multiply(_q2);
  b.parent.getWorldQuaternion(_q2); b.quaternion.copy(_q2.invert().multiply(_q)); b.updateMatrixWorld(true);
}

// per model, once: the straight wrist and the face's direction (from the bind pose; the model faces +Z), the hand's own
// axes (fingers F, thumb side R, palm normal P out of the palm), the right hand's closed fist (`fist`: [bone, quat] pairs)
const RIGS = new WeakMap();
export function radioRig(model, bones, fist = []) {
  let r = RIGS.get(model); if (r) return r;
  let sk = null; model.traverse((o) => { if (!sk && o.isSkinnedMesh && o.skeleton.bones.includes(bones.RightHand)) sk = o.skeleton; });
  const bindQ = (b) => { const q = new THREE.Quaternion(); new THREE.Matrix4().copy(sk.boneInverses[sk.bones.indexOf(b)]).invert().decompose(_v, q, _v2); return q; };
  const wrist = sk ? bindQ(bones.RightForeArm).invert().multiply(bindQ(bones.RightHand)) : bones.RightHand.quaternion.clone();
  const face = sk && bones.Head ? new THREE.Vector3(0, 0, 1).applyQuaternion(bindQ(bones.Head).invert()) : null;
  const F = bones.RightHandMiddle1.position.clone(), len = F.length(); F.normalize();
  const R = bones.RightHandIndex1.position.clone().sub(bones.RightHandPinky1.position); R.addScaledVector(F, -R.dot(F)).normalize();
  const P = new THREE.Vector3().crossVectors(R, F).normalize();
  r = { bones, wrist, face, F, R, P, len, fist: fist.filter(([b]) => /Right/.test(b.name)) };
  RIGS.set(model, r); return r;
}

// the radio in the hand: its turn (outQ) and its foot (outP, m) in the hand bone's rotation frame
function socket(rig, fit, outQ, outP) {
  const hand = rig.bones.RightHand, sw = hand.getWorldScale(_s).x, Lw = rig.len * sw, s = fit.size / 100, g = fit.grip * D2R;
  _y.copy(rig.R).multiplyScalar(Math.cos(g)).addScaledVector(rig.F, Math.sin(g)).normalize(); _z.copy(rig.P); _x.crossVectors(_y, _z).normalize();
  outQ.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  outP.copy(rig.F).multiplyScalar(Lw * 0.5).addScaledVector(rig.P, Lw * 0.11) // (the middle of the palm, on its skin)
    .sub(_v.copy(BACK).multiplyScalar(s).applyQuaternion(outQ)).addScaledVector(_y, -fit.slide * 0.01);
}
// the radio's place in the world (obj: position, quaternion, scale), from the hand as it is now
export function radioPlace(rig, obj, fit) {
  const hand = rig.bones.RightHand; socket(rig, fit, _sq, _sp);
  hand.getWorldQuaternion(_qh); hand.getWorldPosition(obj.position).add(_sp.applyQuaternion(_qh));
  obj.quaternion.copy(_qh).multiply(_sq); obj.scale.setScalar(fit.size / 100);
}
function micAt(rig, fit, out) {
  const hand = rig.bones.RightHand; socket(rig, fit, _sq, _sp); hand.getWorldQuaternion(_qh);
  return hand.getWorldPosition(out).add(_sp.applyQuaternion(_qh)).add(_v.copy(MIC).multiplyScalar(fit.size / 100).applyQuaternion(_sq.premultiply(_qh)));
}

// the hold over the pose the clips gave: weight w (0..1), talk (0 listening .. 1 talking), fwd the body's facing (world,
// level), H the character's height (m: the distances are set at 1.8 m)
export function radioPose(rig, fit, w, talk, fwd, H) {
  if (w <= 1e-3) return;
  const B = rig.bones, hs = H / 1.8, arm = [B.RightShoulder, B.RightArm, B.RightForeArm, B.RightHand].filter(Boolean);
  const touched = [...arm, B.Neck, B.Head, ...rig.fist.map(([b]) => b)].filter(Boolean), before = touched.map((b) => b.quaternion.clone());
  const right = _r.crossVectors(fwd, UP).normalize();
  // his face level, `chin` below it (the idles carry the chin up): over the neck and the head
  if (rig.face && B.Neck) {
    const f = _v.copy(rig.face).applyQuaternion(B.Head.getWorldQuaternion(_q2));
    const turn = -(fit.chin * D2R + Math.asin(clamp(f.y, -1, 1))); // (about his right: + lifts the face)
    rotW(B.Neck, right, turn * 0.4); rotW(B.Head, right, turn * 0.6);
  }
  const mouth = B.Head.getWorldPosition(_mo).addScaledVector(UP, -0.075 * hs).addScaledVector(fwd, 0.1 * hs);
  const mix = (k) => fit.listen[k] + (fit.talk[k] - fit.listen[k]) * talk;
  const micT = _mt.copy(mouth).addScaledVector(fwd, mix('fwd') * 0.01 * hs).addScaledVector(right, mix('side') * 0.01 * hs).addScaledVector(UP, mix('up') * 0.01 * hs);
  const roll = mix('roll') * D2R, el = fit.elbow * D2R;
  const arm0 = arm.map((b) => b.quaternion.clone()), wristT = _wt.copy(micT).addScaledVector(UP, -0.08 * hs);
  for (let k = 0; k < 4; k++) {
    arm.forEach((b, i) => b.quaternion.copy(arm0[i])); arm[0].updateMatrixWorld(true);
    reachShoulder(B, 'Right', wristT);
    ikArm(B.RightArm, B.RightForeArm, B.RightHand, wristT, 1);
    // the elbow swung round the shoulder-wrist line to hang `elbow` out from straight down
    const a = B.RightArm.getWorldPosition(_a), h = B.RightHand.getWorldPosition(_h), ax = _v2.copy(h).sub(a).normalize();
    const ep = B.RightForeArm.getWorldPosition(_e).sub(a); ep.addScaledVector(ax, -ep.dot(ax));
    const pp = _v.copy(UP).multiplyScalar(-Math.cos(el)).addScaledVector(right, Math.sin(el)); pp.addScaledVector(ax, -pp.dot(ax));
    if (ep.lengthSq() > 1e-8 && pp.lengthSq() > 1e-8) rotW(B.RightArm, ax, ep.angleTo(pp) * Math.sign(_x.crossVectors(ep, pp).dot(ax) || 1));
    // the wrist locked straight, then the forearm turned so the grille faces the mouth (aimed a little inside it, which
    // holds still as the grille moves past it), plus the roll
    B.RightHand.quaternion.copy(rig.wrist); B.RightHand.updateMatrixWorld(true);
    const A = B.RightHand.getWorldPosition(_h).sub(B.RightForeArm.getWorldPosition(_e)).normalize();
    const mic = micAt(rig, fit, _mic);
    socket(rig, fit, _sq, _sp); const Z = _z.set(0, 0, 1).applyQuaternion(_sq.premultiply(B.RightHand.getWorldQuaternion(_qh)));
    const D = _y.copy(mouth).addScaledVector(fwd, -0.08 * hs).sub(mic); Z.addScaledVector(A, -Z.dot(A)); D.addScaledVector(A, -D.dot(A));
    const face = Z.lengthSq() > 1e-8 && D.lengthSq() > 1e-8 ? Z.angleTo(D) * Math.sign(_x.crossVectors(Z, D).dot(A) || 1) : 0;
    rotW(B.RightHand, A, face + roll);
    const got = micAt(rig, fit, _mic); wristT.add(_d.copy(micT).sub(got)); // (the grille's miss moves the next pass's wrist)
  }
  // the fingers round it (the closed fist eased off: a radio is thicker than a handle; the thumb flatter, up its side)
  for (const [b, q] of rig.fist) b.quaternion.slerp(q, (/Thumb/.test(b.name) ? fit.thumb : fit.curl) / 100);
  // all of it at weight w over the clips' own pose
  if (w < 1) touched.forEach((b, i) => { _q.copy(b.quaternion); b.quaternion.copy(before[i]).slerp(_q, w); });
  touched[0].parent.updateMatrixWorld(true);
}
