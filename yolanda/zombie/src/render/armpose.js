// Arm adjustments (2026-10-17, the user: "I need more control for arms, wrists, hands.. everything"): per clip and per arm,
// laid over the clip after the posture fix and before the weapons (which follow her hands). The same in the game
// (render/clipchars.js) and the Rig Lab (viewer.js). Saved in assets/hold/arm_pose.json:
//   { "<character>:<clip>": { "Right": { <param>: value, ... }, "Left": { ... } } }
// Each joint turns about an axis taken from her body or the bones themselves, so a value means the same thing on any
// pose; the signs follow anatomy (measured on the pose, render/armfit.js), not the rig's own axes:
//   shUp     shoulder (collarbone) raised + / lowered -            deg
//   shFwd    shoulder forward + / back -                           deg
//   out      upper arm out from her body + / in -                  cm at the hand (before 2026-10-17: arm_spread.json)
//   fwd      upper arm forward + / back -                          cm at the hand
//   twist    upper arm turned about itself, the hand swinging out + / in -   deg
//   elbow    elbow bent more + / straightened -                    deg
//   fore     forearm turned palm-up + / palm-down -                deg
//   wristUp  wrist bent toward the palm + / the back of the hand -  deg
//   wristSide wrist bent toward the thumb + / the little finger -  deg
// limit (default on): an adjustment never takes the wrist past its anatomical range (render/armfit.js ANATOMY); it is cut
// back to the edge. A clip that is past the range by itself is left as it is.
import * as THREE from 'three';
import { armAnatomy } from './armfit.js';

export const ARM_PARAMS = [
  ['shUp', 'Shoulder', 'raise / lower', 'deg', -20, 25, 0.5],
  ['shFwd', 'Shoulder', 'forward / back', 'deg', -20, 20, 0.5],
  ['out', 'Upper arm', 'out / in', 'cm', -6, 15, 0.5],
  ['fwd', 'Upper arm', 'forward / back', 'cm', -15, 15, 0.5],
  ['twist', 'Upper arm', 'twist (hand swings out / in)', 'deg', -45, 45, 1],
  ['elbow', 'Elbow', 'bend more / less', 'deg', -45, 45, 1],
  ['fore', 'Forearm', 'twist (palm up / down)', 'deg', -60, 60, 1],
  ['wristUp', 'Wrist', 'toward palm / back of hand', 'deg', -45, 45, 1],
  ['wristSide', 'Wrist', 'toward thumb / little finger', 'deg', -30, 30, 1],
];
export const ARM0 = Object.fromEntries(ARM_PARAMS.map(([k]) => [k, 0]));
const D = Math.PI / 180, UP = new THREE.Vector3(0, 1, 0);
const _l = new THREE.Vector3(), _f = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _o = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();

function worldRot(bone, axis, ang) { // bone's world rotation := R(axis, ang) * current
  _q.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_qw); bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_q).multiply(_qw)); bone.updateMatrixWorld(true);
}
// turn `bone` about `axis` (through its own position) by `ang`, signed so that `pick()` (a measure of the pose) grows
function signedTurn(bone, axis, ang, pick) {
  if (!(Math.abs(ang) > 1e-6)) return;
  const q0 = bone.quaternion.clone(), m0 = pick();
  worldRot(bone, axis, 0.02); const m1 = pick(); bone.quaternion.copy(q0); bone.updateMatrixWorld(true);
  worldRot(bone, axis, (m1 >= m0 ? 1 : -1) * ang);
}
// the hand point (wrist) moved along a direction, by turning `bone` about `axis` through the shoulder: cm at the hand
function moveHand(bones, side, bone, axis, toward, cm) {
  if (!(Math.abs(cm) > 1e-3)) return;
  const s = bone.getWorldPosition(_a), h = bones[side + 'Hand'].getWorldPosition(_b);
  _d.copy(h).sub(s); _d.addScaledVector(axis, -_d.dot(axis)); const r = _d.length(); if (r < 0.05) return;
  _m.crossVectors(axis, _d); // (how a turn about the axis moves the hand)
  worldRot(bone, axis, (cm / 100) / r * (_m.dot(toward) >= 0 ? 1 : -1));
}

// HANDS AT HER HIPS (2026-10-17, the user: the attacks start and end in the same stance as Sword Block, hands in her hips
// again): a rule for every clip, its settings applied in the share an arm is "hanging at her hip" on the clip's own pose:
// the upper arm within 30 deg of straight down (none past 60) and the hand within 16 cm of her hip joint across the floor
// (none past 30 cm). Both ease in and out, so the arm moves smoothly; a swing that lifts the arm is left untouched.
const sm = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const COS30 = Math.cos(30 * D), COS60 = Math.cos(60 * D);
export function hipWeight(bones, side) {
  const U = bones[side + 'Arm'], L = bones[side + 'ForeArm'], H = bones[side + 'Hand'], Hip = bones[side + 'UpLeg'];
  if (!U || !L || !H || !Hip) return 0;
  const ud = L.getWorldPosition(_a).sub(U.getWorldPosition(_b)).normalize(), wa = sm((-ud.y - COS60) / (COS30 - COS60));
  const h = H.getWorldPosition(_a), hp = Hip.getWorldPosition(_b), d = Math.hypot(h.x - hp.x, h.z - hp.z);
  return wa * (1 - sm((d - 0.16) / (0.30 - 0.16)));
}
// p: { Right: {params}, Left: {params} } (this clip's); opts.hip: the hands-at-hips rule's { Right, Left } (weighted per arm
// by hipWeight on the clip's pose); opts.limit (default true)
export function adjustArms(bones, p, opts = {}) {
  if (!bones.LeftArm || !bones.RightArm) return;
  if (opts.hip) {
    const q = { Right: { ...(p?.Right || {}) }, Left: { ...(p?.Left || {}) } };
    for (const side of ['Right', 'Left']) {
      const h = opts.hip[side]; if (!h) continue;
      const w = hipWeight(bones, side); if (opts.weights) opts.weights[side] = w; if (w <= 1e-3) continue;
      for (const k in h) if (typeof h[k] === 'number') q[side][k] = (q[side][k] || 0) + w * h[k];
    }
    p = q;
  }
  if (!p) return;
  _l.copy(bones.LeftArm.getWorldPosition(_a)).sub(bones.RightArm.getWorldPosition(_b)); _l.y = 0; _l.normalize(); // (her left)
  _f.crossVectors(_l, UP); // (her front)
  const limit = opts.limit !== false;
  for (const side of ['Right', 'Left']) {
    const P = p[side]; if (!P) continue;
    const S = bones[side + 'Shoulder'], U = bones[side + 'Arm'], L = bones[side + 'ForeArm'], H = bones[side + 'Hand'];
    if (!U || !L || !H) continue;
    const out = _o.copy(_l).multiplyScalar(side === 'Right' ? -1 : 1).clone();
    // shoulder: raise about her front axis (the arm's root goes up), forward about the vertical (it goes forward)
    if (S) {
      if (P.shUp) signedTurn(S, _f.clone(), P.shUp * D, () => U.getWorldPosition(_c).y);
      if (P.shFwd) signedTurn(S, UP, P.shFwd * D, () => U.getWorldPosition(_c).dot(_f));
    }
    // upper arm: out / forward (cm at the hand), then its own twist (elbow out)
    if (P.out) moveHand(bones, side, U, _f.clone(), out, P.out);
    if (P.fwd) moveHand(bones, side, U, _l.clone(), _f.clone(), P.fwd);
    if (P.twist) {
      const ax = L.getWorldPosition(_c).sub(U.getWorldPosition(_a)).normalize().clone();
      signedTurn(U, ax, P.twist * D, () => H.getWorldPosition(_d).sub(U.getWorldPosition(_a)).dot(out));
    }
    // elbow: about its hinge (upper arm x forearm), bending more = the forearm turns away from the upper arm's line
    if (P.elbow) {
      const e = L.getWorldPosition(_a).clone(), ud = e.clone().sub(U.getWorldPosition(_b)).normalize(), fd = H.getWorldPosition(_c).sub(e).normalize();
      const hinge = new THREE.Vector3().crossVectors(ud, fd);
      if (hinge.lengthSq() > 1e-6) signedTurn(L, hinge.normalize(), P.elbow * D, () => -H.getWorldPosition(_d).sub(e).normalize().dot(ud));
    }
    const before = limit && (P.fore || P.wristUp || P.wristSide) ? armAnatomy(bones, side) : null;
    // forearm: its own twist, palm-up + (supination, as render/armfit.js measures it)
    if (P.fore) {
      const fd = H.getWorldPosition(_a).sub(L.getWorldPosition(_b)).normalize().clone();
      signedTurn(L, fd, P.fore * D, () => armAnatomy(bones, side).roll);
    }
    // wrist: toward the palm about the grip axis; toward the thumb about the palm's normal
    const hq = H.quaternion.clone();
    if (P.wristUp || P.wristSide) {
      const I = bones[side + 'HandIndex1'], K = bones[side + 'HandPinky1'], M = bones[side + 'HandMiddle1'];
      if (I && K && M) {
        const w = H.getWorldPosition(_a).clone(), aw = I.getWorldPosition(_b).sub(K.getWorldPosition(_c)).normalize().clone(), hd = M.getWorldPosition(_c).sub(w).normalize().clone();
        const palm = new THREE.Vector3().crossVectors(aw, hd).normalize();
        if (P.wristUp) signedTurn(H, aw, P.wristUp * D, () => armAnatomy(bones, side).flex);
        if (P.wristSide) signedTurn(H, palm, P.wristSide * D, () => armAnatomy(bones, side).dev);
      }
    }
    // the limit: the user's wrist adjustment cut back so the wrist stays inside its range (a clip already past it: untouched)
    if (before && before.wristR <= 1) {
      let after = armAnatomy(bones, side);
      if (after.wristR > 1) {
        const hq1 = H.quaternion.clone();
        let lo = 0, hi = 1; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; H.quaternion.slerpQuaternions(hq, hq1, m); H.updateMatrixWorld(true); if (armAnatomy(bones, side).wristR <= 1) lo = m; else hi = m; }
        H.quaternion.slerpQuaternions(hq, hq1, lo); H.updateMatrixWorld(true);
      }
    }
  }
}
// the arms' state for the readout: per side { wrist (% of range), forearm (% of range), elbow (deg) }
export function armReadout(bones) {
  const o = {};
  for (const side of ['Right', 'Left']) { const a = armAnatomy(bones, side); if (a) o[side] = { wrist: Math.round(a.wristR * 100), flex: Math.round(a.flex), dev: Math.round(a.dev), fore: Math.round(a.rollR * 100), roll: Math.round(a.roll), elbow: Math.round(a.elbow) }; }
  return o;
}
// blend: a weighted sum of settings (the game: by the playing clips' weights)
export function blendArms(list) {
  const o = { Right: { ...ARM0 }, Left: { ...ARM0 } }; let any = false;
  for (const [w, p] of list) for (const side of ['Right', 'Left']) { const P = p?.[side]; if (!P) continue; for (const k in ARM0) if (P[k]) { o[side][k] += w * P[k]; any = true; } }
  return any ? o : null;
}
