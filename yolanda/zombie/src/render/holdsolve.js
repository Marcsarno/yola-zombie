// How Yola holds things (shared by the game, render/clipchars.js, and the Rig Lab, viewer.js): her fist's frame from her own
// finger joints, the wrist turned along a handle, the fingers opened to a grip's thickness, the arm IK that puts a fist on a
// handle, and the safety net that keeps a held weapon out of her head. B: the body (bones: by name without 'mixamorig';
// restQ: [bone, rest quaternion] pairs; model: the skinned model). WEAPON_HOLD_PROCESS.md; data sheets: core/weapons.js HOLD_DEFS.
import * as THREE from 'three';
import { ikArm as solveArm } from './ik.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _fv = new THREE.Vector3(), _fv2 = new THREE.Vector3(), _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fq3 = new THREE.Quaternion(), _fq4 = new THREE.Quaternion();
const frame = () => ({ c: new THREE.Vector3(), a: new THREE.Vector3(), k: new THREE.Vector3() });

// fist centre, grip axis (pinky -> index) and knuckle direction from her finger joints (as in the move library)
export function fistFrame(B, side, out) {
  const H = side + 'Hand', c = out.c.set(0, 0, 0); let n = 0;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = B.bones[H + f + i]; if (b) { c.add(b.getWorldPosition(_fv)); n++; } }
  c.multiplyScalar(1 / n);
  out.a.copy(B.bones[H + 'Index1'].getWorldPosition(_fv)).sub(B.bones[H + 'Pinky1'].getWorldPosition(_fv2)).normalize();
  out.k.copy(B.bones[H + 'Middle1'].getWorldPosition(_fv)).sub(c); out.k.addScaledVector(out.a, -out.k.dot(out.a)).normalize();
  c.addScaledVector(out.k, -0.01); // the curled fingers' centroid sits on the knuckle side of the handle
  return out;
}
// The fist turned at the wrist so its grip axis (pinky -> index) lies along `axis` (world, unit): the hand closes along the
// handle instead of the handle crossing the fist. At most maxDeg (a bigger miss is the pose's to fix, never a broken wrist).
// Returns the miss in degrees before the turn.
export function fitFist(B, side, axis, w = 1, maxDeg = 35) {
  const F = (B._fitF ||= frame());
  fistFrame(B, side, F);
  _fq.setFromUnitVectors(F.a, axis);
  const ang = 2 * Math.acos(clamp(Math.abs(_fq.w), 0, 1)), lim = (maxDeg * Math.PI) / 180, k = w * (ang > lim ? lim / ang : 1);
  if (ang > 1e-4 && k > 0) {
    _fq2.identity().slerp(_fq, k);
    const hand = B.bones[side + 'Hand'];
    hand.getWorldQuaternion(_fq3); hand.parent.getWorldQuaternion(_fq4);
    hand.quaternion.copy(_fq4.invert().multiply(_fq2).multiply(_fq3)); hand.updateMatrixWorld(true);
  }
  return (ang * 180) / Math.PI;
}
// The fingers opened toward her relaxed hand by `k` (0 = the clip's fist): the mocap fists close on a ~2 cm handle, so on
// a thicker grip they would sink into it. k: one amount, or one per finger ({ Thumb, Index, ... }: the data sheet's, HOLD_DEFS
// open, measured by tools/gripcheck.js fitOpen), times w.
export function openFingers(B, side, k, w = 1) {
  if (!k || !(w > 0)) return;
  const rest = (B._restOf ||= new Map(B.restQ));
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
    const kf = (typeof k === 'number' ? k : k[f] || 0) * w; if (!(kf > 0)) continue;
    for (const i of [1, 2, 3]) { const b = B.bones[side + 'Hand' + f + i]; if (b) b.quaternion.slerp(rest.get(b), kf); }
  }
  B.bones[side + 'Hand'].updateMatrixWorld(true);
}
// A held weapon never through her head (2026-10-16: the axe stance loops while she walks, and at times her head and hair
// moved into the handle, 24 mm): the weapon's line, from `from` to `to` metres along dir from the fist at p, is turned away
// about the fist by the least angle that keeps it `clear` metres off every vertex of her head (her own skinned head: hair
// included, rigid on the Head bone), at most 15 degrees (WEAPON_HOLD_PROCESS.md section 5's safety net). dir is changed in
// place; returns the turn in degrees (counted in B.headTurns for the checker).
// Where the line is in her head right at the fist (turning about the fist cannot move it), the fist itself is moved out by
// arm IK (side, palm: the fist holding it; p follows).
export function clearHead(B, p, dir, [from, to], clear, side, palm) {
  const H = headPts(B); if (!H) return 0;
  const M = B.bones.Head.matrixWorld, q = _fv, v = _fv2;
  let turned = 0;
  for (let it = 0; it < 4; it++) {
    let worst = 0, wt = 0; const away = (B._chA ||= new THREE.Vector3());
    for (let i = 0; i < H.length; i += 3) {
      v.set(H[i], H[i + 1], H[i + 2]).applyMatrix4(M);
      const t = clamp((v.x - p.x) * dir.x + (v.y - p.y) * dir.y + (v.z - p.z) * dir.z, from, to);
      q.copy(p).addScaledVector(dir, t);
      const d = q.distanceTo(v);
      if (clear - d > worst) { worst = clear - d; wt = t; away.copy(q).sub(v); away.addScaledVector(dir, -away.dot(dir)); }
    }
    if (worst <= 1e-4 || away.lengthSq() < 1e-10) break;
    if (Math.abs(wt) < 0.12 && side) { // (at the fist: the fist moves out, the weapon with it)
      const t = (B._chT ||= new THREE.Vector3()).copy(p).addScaledVector(away.normalize(), worst + 0.002);
      ikFist(B, side, t, 1, palm);
      const F = (B._chF ||= frame());
      fistFrame(B, side, F); gripAt(B, side, F, palm, p);
      continue;
    }
    if (Math.abs(wt) < 0.05) break;
    const ang = Math.min(Math.atan2(worst + 0.002, Math.abs(wt)), (15 * Math.PI) / 180 - turned);
    if (ang <= 0) break;
    const axis = _fv.crossVectors(dir, away.normalize()).normalize(); if (wt < 0) axis.negate();
    dir.applyAxisAngle(axis, ang).normalize(); turned += ang;
  }
  if (turned > 1e-3) B.headTurns = (B.headTurns || 0) + 1;
  return (turned * 180) / Math.PI;
}
// her head's vertices (strongest bone Head, 90%+ on it: they move rigidly with it) in the Head bone's frame, found once
export function headPts(B) {
  if (B._headPts !== undefined) return B._headPts;
  const out = [], v = new THREE.Vector3(), inv = new THREE.Matrix4();
  B.model.updateMatrixWorld(true); inv.copy(B.bones.Head.matrixWorld).invert();
  B.model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const hi = o.skeleton.bones.indexOf(B.bones.Head); if (hi < 0) return;
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
      if (w < 0.9) continue;
      o.getVertexPosition(i, v); o.localToWorld(v); v.applyMatrix4(inv); out.push(v.x, v.y, v.z);
    }
  });
  return (B._headPts = out.length ? new Float32Array(out) : null);
}
// Where a handle's centre sits in this fist (F: its fistFrame): the closed fist's centre, moved `palm` metres away from the
// palm toward the fingers. A grip thicker than her closed fist (the guns' grips) rests against the palm with the fingers
// opened around it (HOLD_DEFS palm / open, measured by tools/gripcheck.js fitGrip).
export function gripAt(B, side, F, palm, out) {
  out.copy(F.c); if (!palm) return out;
  B.bones[side + 'Hand'].getWorldPosition(_fv);
  const p = _fv2.copy(F.c).sub(_fv); p.addScaledVector(F.a, -p.dot(F.a)).normalize();
  return out.addScaledVector(p, palm);
}
// two-bone arm IK putting the handle point of the fist (gripAt) on `target` (world); the hand keeps its orientation (render/ik.js)
export function ikFist(B, side, target, w = 1, palm = 0) {
  const F = (B._ikF ||= frame());
  fistFrame(B, side, F);
  const hand = B.bones[side + 'Hand'], g = gripAt(B, side, F, palm, B._ikG ||= new THREE.Vector3());
  hand.getWorldPosition(_fv); _fv2.copy(target).sub(g).add(_fv);
  solveArm(B.bones[side + 'Arm'], B.bones[side + 'ForeArm'], hand, _fv2, w);
}
