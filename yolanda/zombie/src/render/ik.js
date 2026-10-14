// Two-bone arm IK shared by the game and the rig lab: the hand reaches `target` (world space, weight w),
// the elbow bends in its current plane, the hand keeps its world orientation.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const acos = (x) => Math.acos(clamp(x, -1, 1));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _hq = new THREE.Quaternion(), _w = new THREE.Quaternion(), _p = new THREE.Quaternion();

function worldRot(bone, R) { // bone world rotation := R * current
  bone.getWorldQuaternion(_w); bone.parent.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(R).multiply(_w)); bone.updateMatrixWorld(true);
}

export function ikArm(up, lo, hand, target, w) {
  if (w <= 1e-3) return;
  up.updateMatrixWorld(true);
  const a = up.getWorldPosition(_a).clone(), b = lo.getWorldPosition(_b).clone(), c = hand.getWorldPosition(_c).clone();
  const t = _t.copy(c).lerp(target, w).clone();
  hand.getWorldQuaternion(_hq); const handQ = _hq.clone();
  const lab = b.distanceTo(a), lcb = c.distanceTo(b), lat = clamp(t.distanceTo(a), 0.01, lab + lcb - 1e-3);
  const ac = c.clone().sub(a).normalize(), ab = b.clone().sub(a).normalize(), ba = a.clone().sub(b).normalize(), bc = c.clone().sub(b).normalize(), at = t.clone().sub(a).normalize();
  const ac_ab0 = acos(ac.dot(ab)), ba_bc0 = acos(ba.dot(bc)), ac_at0 = acos(ac.dot(at));
  const ac_ab1 = acos((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)), ba_bc1 = acos((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb));
  const ax0 = new THREE.Vector3().crossVectors(ac, ab);
  if (ax0.lengthSq() < 1e-8) ax0.set(0, 1, 0);
  ax0.normalize();
  const ax1 = new THREE.Vector3().crossVectors(ac, at);
  worldRot(lo, new THREE.Quaternion().setFromAxisAngle(ax0, ba_bc1 - ba_bc0));
  const r = new THREE.Quaternion().setFromAxisAngle(ax0, ac_ab1 - ac_ab0);
  if (ax1.lengthSq() > 1e-10) r.premultiply(new THREE.Quaternion().setFromAxisAngle(ax1.normalize(), ac_at0));
  worldRot(up, r);
  hand.parent.getWorldQuaternion(_p);
  hand.quaternion.copy(_p.invert().multiply(handQ)); hand.updateMatrixWorld(true);
}
