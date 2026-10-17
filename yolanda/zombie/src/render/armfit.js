// A hand onto a handle within what a real arm can do (2026-10-17, the user: "use true anatomy to build those limits";
// the chainsaw carry bent her right wrist ~90 deg down). Shared by the game (render/clipchars.js) and the Rig Lab
// (viewer.js) through render/holdfit.js handOnto.
//
// The hand's grip axis (pinky -> index knuckle) goes along the handle and its grip point (between the wrist and the
// middle knuckle) onto `point`. Two things are still free and are chosen here: how far the hand turns AROUND the handle
// (a round handle can sit in the fist with the palm any way round) and where the elbow swings (the circle of elbow
// spots that put the wrist in the same place). Each candidate is scored against the anatomical ranges:
//   wrist: flexion (toward the palm) 75, extension 65, radial deviation (toward the thumb) 20, ulnar (toward the pinky)
//     30 deg; no twist of its own (turning the hand is the forearm's: the radius rolls round the ulna)
//   forearm: supination (palm up) 85, pronation (palm down) 80 deg from thumb-up, measured against the elbow's hinge
//   elbow: a hinge, bending only one way, 0-150 deg; the upper arm turns (it can) to put the hinge where the bend is needed
//   the elbow's direction: down and out from the shoulder-wrist line (where the clip has it); never up and in
// then the closest-to-the-clip candidate inside the ranges wins. If none is inside (a target no arm reaches comfortably),
// the wrist is held at its limit and the grip gives (diag.r > 1, the jump test flags it).
import * as THREE from 'three';

const D = Math.PI / 180;
export const ANATOMY = {
  wrist: { flex: 75, ext: 65, radial: 20, ulnar: 30 },
  forearm: { sup: 85, pro: 80 },
  elbow: { max: 150 },
  twistToForearm: 0.65, // of the hand's turn, the share the forearm bone takes (the rest stays at the wrist: a rig with no
  // twist bones pinches the wrist if it takes all of it, the elbow if the forearm does)
};

const V = () => new THREE.Vector3();
const _t = Array.from({ length: 24 }, () => new THREE.Vector3()), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
function worldRot(bone, R) { // bone's world rotation := R * current
  bone.getWorldQuaternion(_q2); bone.parent.getWorldQuaternion(_q3);
  bone.quaternion.copy(_q3.invert().multiply(R).multiply(_q2)); bone.updateMatrixWorld(true);
}
const perp = (out, v, n) => out.copy(v).addScaledVector(n, -v.dot(n)); // v without its n part

// the wrist's bend (deg): hd the hand's pointing direction, f the forearm's, palm the palm normal, aw the grip axis (toward
// the thumb). flex > 0 toward the palm, dev > 0 toward the thumb. r: 1 at the edge of the range (an ellipse).
// Measured in the FOREARM's frame: the hand unbent onto the forearm gives the palm and thumb directions the forearm carries
// (p0, a0); the bend's direction is split along those. (2026-10-17: splitting it along the bent hand's own axes read a
// 77 deg sideways bend as 6 deg, the grip axis lying along the forearm, and the limits let two broken wrists through)
const _qb = new THREE.Quaternion();
export function wristBend(hd, f, palm, aw, out = {}) {
  const th = Math.acos(clamp(hd.dot(f), -1, 1)) / D;
  _qb.setFromUnitVectors(hd, f);
  const a0 = (out.a0 ||= V()).copy(perp(_t[21], aw, hd).normalize()).applyQuaternion(_qb), p0 = _t[20].copy(perp(_t[20], palm, hd).normalize()).applyQuaternion(_qb);
  const b = perp(_t[19], hd, f), bl = b.length();
  if (bl < 1e-6) { out.flex = 0; out.dev = 0; } else { b.multiplyScalar(1 / bl); out.flex = th * b.dot(p0); out.dev = th * b.dot(a0); }
  out.bend = th;
  const W = ANATOMY.wrist, lf = out.flex > 0 ? W.flex : W.ext, ld = out.dev > 0 ? W.radial : W.ulnar;
  out.r = Math.hypot(out.flex / lf, out.dev / ld);
  return out;
}
// the forearm's roll (deg, > 0 supination) from thumb-up, about the elbow's hinge; k: how defined (0 with a straight elbow).
// a0: the thumb direction the forearm carries (wristBend's a0, not the bent hand's own axis)
export function forearmRoll(ud, f, a0, sgn, out = {}) {
  const h = _t[22].crossVectors(ud, f), s = h.length(); out.k = Math.min(1, s / 0.3);
  if (s < 1e-4) { out.roll = 0; out.r = 0; return out; }
  h.multiplyScalar(1 / s);
  const n0 = _t[23].crossVectors(h, f), A = perp(_t[20], a0, f).normalize();
  out.roll = Math.atan2(A.dot(h) * sgn, A.dot(n0)) / D;
  out.r = Math.abs(out.roll) / (out.roll > 0 ? ANATOMY.forearm.sup : ANATOMY.forearm.pro);
  return out;
}

// her body's frame (x her left, y up, z forward) from her shoulders: the same on every rig
function bodyFrame(bones) {
  const l = bones.LeftArm.getWorldPosition(V()).sub(bones.RightArm.getWorldPosition(V())); l.y = 0; l.normalize();
  const y = V().set(0, 1, 0), z = V().crossVectors(l, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(l, y, z));
}
// the arm's anatomy as posed now (for the jump test and the Rig Lab readout)
export function armAnatomy(bones, side) {
  const U = bones[side + 'Arm'], L = bones[side + 'ForeArm'], H = bones[side + 'Hand'], I = bones[side + 'HandIndex1'], P = bones[side + 'HandPinky1'], M = bones[side + 'HandMiddle1'];
  if (!U || !L || !H || !I || !P || !M) return null;
  const a = U.getWorldPosition(V()), e = L.getWorldPosition(V()), w = H.getWorldPosition(V());
  const ud = e.clone().sub(a).normalize(), f = w.clone().sub(e).normalize(), hd = M.getWorldPosition(V()).sub(w).normalize();
  const aw = I.getWorldPosition(V()).sub(P.getWorldPosition(V())).normalize(), palm = V().crossVectors(aw, hd).normalize().multiplyScalar(side === 'Right' ? 1 : -1);
  const wb = wristBend(hd, f, palm, aw), fr = forearmRoll(ud, f, wb.a0, side === 'Right' ? 1 : -1);
  return { bend: wb.bend, flex: wb.flex, dev: wb.dev, wristR: wb.r, roll: fr.roll, rollR: fr.r * fr.k, elbow: Math.acos(clamp(ud.dot(f), -1, 1)) / D };
}

// o: { w (blend 0..1), signFree (either way along the handle; false = the axis's own sign is the pinky -> index way),
//   back (world: where the back of the hand should face), backTol (deg), elbow ({ out, down, back }: where this grip
//   wants the elbow, her frame), body (her world quaternion: for the elbow's
//   down-and-out), seed: { psi, phi } (last frame's answer, kept unless something clearly better) }
// returns { psi, phi, flex, dev, r, roll, elbow, gap }
export function armToGrip(bones, side, point, axis, o = {}) {
  const w = o.w ?? 1; if (!(w > 1e-3)) return null;
  const U = bones[side + 'Arm'], L = bones[side + 'ForeArm'], H = bones[side + 'Hand'], I = bones[side + 'HandIndex1'], P = bones[side + 'HandPinky1'], M = bones[side + 'HandMiddle1'];
  if (!U || !L || !H || !I || !P || !M) return null;
  const sgn = side === 'Right' ? 1 : -1;
  const a = U.getWorldPosition(V()), e0 = L.getWorldPosition(V()), w0 = H.getWorldPosition(V());
  const L1 = a.distanceTo(e0), L2 = e0.distanceTo(w0), Lmax = (L1 + L2) * 0.999, Lmin = Math.abs(L1 - L2) + 0.02;
  const Hq = H.getWorldQuaternion(new THREE.Quaternion()), Hqi = Hq.clone().invert();
  const mW = M.getWorldPosition(V()).sub(w0), aW = I.getWorldPosition(V()).sub(P.getWorldPosition(V())).normalize();
  const hmL = mW.clone().normalize().applyQuaternion(Hqi), aL = aW.clone().applyQuaternion(Hqi), offL = mW.clone().multiplyScalar(0.5).applyQuaternion(Hqi);
  const palmL = V().crossVectors(aL, hmL).normalize().multiplyScalar(sgn);
  const ax = axis.clone().normalize(); if (o.signFree !== false && aW.dot(ax) < 0) ax.negate();
  const Q0 = new THREE.Quaternion().setFromUnitVectors(aW, ax).multiply(Hq); // turned onto the handle the shortest way
  // the elbow's natural side: down, out, a little back (her frame)
  const bq = o.body || bodyFrame(bones);
  const E = o.elbow, pref = (E ? V().set(-E.out * sgn, -E.down, -E.back) : V().set(-0.5 * sgn, -1, -0.3)).applyQuaternion(bq).normalize(), prefW = E ? 2 : 0.3; // (a grip's own elbow: firmly)
  const back = o.back ? perp(V(), o.back, ax).normalize() : null, backTol = (o.backTol ?? 90) * D;
  const Qh = new THREE.Quaternion(), hd = V(), palm = V(), wp = V(), u = V(), p = V(), q = V(), off = V(), e = V(), f = V(), ud = V(), tmp = V();
  const WB = {}, FR = {};
  const seed = o.seed;
  // the pose for (psi: turn around the handle from the shortest turn, phi: elbow swing from the clip's elbow)
  function pose(psi, phi) {
    Qh.setFromAxisAngle(ax, psi).multiply(Q0);
    hd.copy(hmL).applyQuaternion(Qh); palm.copy(palmL).applyQuaternion(Qh);
    wp.copy(offL).applyQuaternion(Qh).negate().add(point);
    u.copy(wp).sub(a); const d0 = u.length(); u.multiplyScalar(1 / d0);
    const d = clamp(d0, Lmin, Lmax), cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    perp(p, tmp.copy(e0).sub(a), u); if (p.lengthSq() < 1e-8) perp(p, pref, u); p.normalize(); q.crossVectors(u, p);
    off.copy(p).multiplyScalar(Math.cos(phi)).addScaledVector(q, Math.sin(phi));
    e.copy(a).addScaledVector(u, L1 * cosA).addScaledVector(off, L1 * sinA);
    f.copy(a).addScaledVector(u, d).sub(e).normalize(); ud.copy(e).sub(a).normalize();
    return d0 - d;
  }
  function cost(psi, phi) {
    const miss = pose(psi, phi);
    let c = 400 * miss * miss;
    wristBend(hd, f, palm, ax, WB); c += 0.8 * WB.r * WB.r + (WB.r > 1 ? 60 * (WB.r - 1) ** 2 : 0);
    forearmRoll(ud, f, WB.a0, sgn, FR); c += FR.k * (0.4 * FR.r * FR.r + (FR.r > 1 ? 60 * (FR.r - 1) ** 2 : 0));
    const bend = Math.acos(clamp(ud.dot(f), -1, 1)), bmax = ANATOMY.elbow.max * D; if (bend > bmax) c += 60 * (bend - bmax) ** 2;
    const pp = perp(tmp, pref, u); if (pp.lengthSq() > 1e-6) { const s = off.dot(pp.normalize()); c += prefW * (1 - s) + (s < -0.2 ? 10 * (s + 0.2) ** 2 : 0); } // (never up and in)
    if (back) { const g = Math.acos(clamp(perp(tmp, palm, ax).normalize().dot(back) * -1, -1, 1)); c += 0.15 * g * g + (g > backTol ? 40 * (g - backTol) ** 2 : 0); }
    c += 0.12 * psi * psi + 0.1 * phi * phi; // (as close to the clip's own hand and elbow as the ranges allow)
    if (seed) c += 0.6 * ((psi - seed.psi) ** 2 + (phi - seed.phi) ** 2); // (and to last frame's answer: no flicking between two equal poses)
    return c;
  }
  // coarse grid, then a shrinking pattern search from the best
  let bp = 0, bf = 0, bc = cost(0, 0);
  if (seed) { const c = cost(seed.psi, seed.phi); if (c < bc) { bc = c; bp = seed.psi; bf = seed.phi; } }
  for (let i = -9; i <= 9; i++) for (let j = -10; j <= 10; j++) { const ps = i * 20 * D, ph = j * 15 * D, c = cost(ps, ph); if (c < bc) { bc = c; bp = ps; bf = ph; } }
  for (const st of [8, 3, 1, 0.3]) {
    for (let it = 0; it < 12; it++) {
      let moved = false;
      for (const [dp, df] of [[st, 0], [-st, 0], [0, st], [0, -st]]) { const c = cost(bp + dp * D, bf + df * D); if (c < bc - 1e-9) { bc = c; bp += dp * D; bf += df * D; moved = true; } }
      if (!moved) break;
    }
  }
  const predC = cost(bp, bf), pred = { r: WB.r, flex: WB.flex, dev: WB.dev, roll: FR.roll, c: predC }; // (what the search expects: the jump test compares)
  pose(bp, bf);
  const Qbest = Qh.clone(), eB = e.clone(), wB = a.clone().addScaledVector(u, clamp(a.distanceTo(wp), Lmin, Lmax));
  // put the bones there: the upper arm at the elbow, turned so the forearm bends in its own hinge plane; the forearm bent
  // onto the wrist; part of the hand's turn rolled into the forearm; the hand turned onto the handle
  const qU = U.quaternion.clone(), qL = L.quaternion.clone(), qH = H.quaternion.clone();
  worldRot(U, _q.setFromUnitVectors(tmp.copy(e0).sub(a).normalize(), V().copy(eB).sub(a).normalize()));
  const udB = V().copy(eB).sub(a).normalize(), hc = H.getWorldPosition(V()), fcp = perp(V(), hc.sub(eB), udB), ftp = perp(V(), V().copy(wB).sub(eB), udB);
  if (fcp.lengthSq() > 1e-8 && ftp.lengthSq() > 1e-8) { fcp.normalize(); ftp.normalize(); worldRot(U, _q.setFromAxisAngle(udB, Math.atan2(V().crossVectors(fcp, ftp).dot(udB), fcp.dot(ftp)))); }
  const fc = H.getWorldPosition(V()).sub(L.getWorldPosition(V())).normalize(), fB = V().copy(wB).sub(L.getWorldPosition(V())).normalize();
  worldRot(L, _q.setFromUnitVectors(fc, fB));
  { // the hand's turn about the forearm, part of it rolled into the forearm
    const QL = L.getWorldQuaternion(new THREE.Quaternion()), hl = QL.clone().invert().multiply(Qbest), bl = H.position.clone().normalize();
    const tw = 2 * Math.atan2(hl.x * bl.x + hl.y * bl.y + hl.z * bl.z, hl.w);
    worldRot(L, _q.setFromAxisAngle(fB, tw * ANATOMY.twistToForearm));
  }
  H.parent.getWorldQuaternion(_q3); H.quaternion.copy(_q3.invert().multiply(Qbest)); H.updateMatrixWorld(true);
  if (w < 1) { U.quaternion.slerpQuaternions(qU, U.quaternion.clone(), w); L.quaternion.slerpQuaternions(qL, L.quaternion.clone(), w); H.quaternion.slerpQuaternions(qH, H.quaternion.clone(), w); U.updateMatrixWorld(true); }
  let an = armAnatomy(bones, side);
  if (an.wristR > 1) { // the hard stop: a wrist past its range is turned back to the edge of it (the grip gives a little instead)
    const w1 = H.getWorldPosition(V()), hd1 = M.getWorldPosition(V()).sub(w1).normalize(), f1 = w1.clone().sub(L.getWorldPosition(V())).normalize(), ax1 = V().crossVectors(hd1, f1);
    if (ax1.lengthSq() > 1e-10) { worldRot(H, _q.setFromAxisAngle(ax1.normalize(), an.bend * D * (1 - 1 / an.wristR))); an = armAnatomy(bones, side); }
  }
  const gp = H.getWorldPosition(V()).add(M.getWorldPosition(V())).multiplyScalar(0.5);
  return { pred, psi: bp, phi: bf, flex: an.flex, dev: an.dev, r: an.wristR, roll: an.roll, rollR: an.rollR, elbow: an.elbow, gap: gp.distanceTo(point) };
}
