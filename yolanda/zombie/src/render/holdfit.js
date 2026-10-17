// Where a held weapon sits in her hand: ONE copy of the math, used by the game (render/clipchars.js) and the Rig Lab
// (viewer.js), so what the user fits beside the reference rig is exactly what the game plays (2026-10-17).
//   fistFrame: the fist's centre (the curled index-pinky joints, a cm toward the knuckles), its grip axis (pinky -> index
//     knuckle: a handle runs this way through a closed fist) and the knuckle direction.
//   placeOneHanded: a one-handed weapon (the bat) with its grip point at the fist centre, its shaft along the grip axis,
//     its reference side toward the knuckles; then the user's fit (assets/hold/weapon_fit.json, per weapon and character).
// A fit: size %, a move in mm along the weapon's own axes (fwd = its long axis, up = model +Y, side = model +X) and a turn
// in degrees (tilt about +X, turn about +Y, roll about the long axis), pivoting on the grip point.
import * as THREE from 'three';

export const FIT0 = { size: 100, fwd: 0, up: 0, side: 0, tilt: 0, turn: 0, roll: 0 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

export function fistFrame(bones, side, out) {
  const H = side + 'Hand', c = out.c.set(0, 0, 0); let n = 0;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = bones[H + f + i]; if (b) { c.add(b.getWorldPosition(_a)); n++; } }
  if (!n || !bones[H + 'Index1'] || !bones[H + 'Pinky1'] || !bones[H + 'Middle1']) return null;
  c.multiplyScalar(1 / n);
  out.a.copy(bones[H + 'Index1'].getWorldPosition(_a)).sub(bones[H + 'Pinky1'].getWorldPosition(_b)).normalize();
  out.k.copy(bones[H + 'Middle1'].getWorldPosition(_a)).sub(c); out.k.addScaledVector(out.a, -out.k.dot(out.a)).normalize();
  c.addScaledVector(out.k, -0.01); // the curled fingers' centroid sits on the knuckle side of the handle
  return out;
}

// the fit on top of a base orientation q0 and grip point c: o.quaternion = q0 * turn; o.position = c + q0 * move -
// o.quaternion * gripPoint * scale (gripPoint: the model point that sits in the fist, model units). k: rig size / 1.62 m
export function applyFit(o, c, q0, fit, gripPoint, baseScale = 1, k = 1) {
  const F = fit || FIT0, d2r = Math.PI / 180, s = baseScale * (F.size ?? 100) / 100;
  o.scale.setScalar(s);
  o.quaternion.copy(q0).multiply(_q.setFromEuler(_e.set((F.tilt || 0) * d2r, (F.turn || 0) * d2r, (F.roll || 0) * d2r, 'YXZ')));
  o.position.copy(c).add(_b.set(F.side || 0, F.up || 0, F.fwd || 0).multiplyScalar(0.001 * k).applyQuaternion(q0))
    .sub(_c.copy(gripPoint).multiplyScalar(s).applyQuaternion(o.quaternion));
}

// def: the weapon's data sheet (core/weapons.js BAT_DEF: grip_primary, shaft_axis, ref_axis). T: { roll, slide, flip }
// (the game's hold record). Returns false when the hand has no finger joints.
const FF = { c: new THREE.Vector3(), a: new THREE.Vector3(), k: new THREE.Vector3() };
export function placeOneHanded(bones, side, o, def, fit, T = {}, k = 1) {
  if (!fistFrame(bones, side, FF)) return false;
  const A = _a.copy(FF.a).multiplyScalar(T.flip ? -1 : 1), K = FF.k.clone().applyAxisAngle(A, THREE.MathUtils.degToRad(T.roll || 0));
  const s = new THREE.Vector3(...def.shaft_axis).normalize(), r = new THREE.Vector3(...def.ref_axis); r.addScaledVector(s, -r.dot(s)).normalize();
  _m1.makeBasis(s, r, new THREE.Vector3().crossVectors(s, r));
  _m2.makeBasis(A, K, new THREE.Vector3().crossVectors(A, K));
  const q0 = new THREE.Quaternion().setFromRotationMatrix(_m2.multiply(_m1.transpose()));
  const c = FF.c.clone().addScaledVector(A, T.slide || 0);
  applyFit(o, c, q0, fit, new THREE.Vector3(...def.grip_primary), 1, k);
  return true;
}

// A two-handed handle (the fire axe): through the centres of BOTH fists, its head end chosen by `toward` (the game's
// measured handle direction, render/clipchars.js batSocket / meleeSocket: which way the head points). When the hands part
// (a one-handed follow-through) or the fists' line turns across `toward`, the handle eases onto `toward` and stays in
// the `hold` hand (its fist centre). out: { c (the grip point), d (unit handle direction, toward the head), span (m) }
const F2 = { c: new THREE.Vector3(), a: new THREE.Vector3(), k: new THREE.Vector3() }, _cr = new THREE.Vector3(), _ar = new THREE.Vector3(), _ax = new THREE.Vector3();
const sm = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
export function twoHandLine(bones, toward, out, hold = 'Right', prev = null) {
  if (!fistFrame(bones, 'Right', F2)) return null;
  const cr = _cr.copy(F2.c), ar = _ar.copy(F2.a);
  if (!fistFrame(bones, 'Left', F2)) return null;
  const ch = hold === 'Left' ? F2.c : cr; // (the hand that keeps it when they part)
  out.c.copy(cr).add(F2.c).multiplyScalar(0.5);
  out.d.copy(cr).sub(F2.c); out.span = out.d.length(); out.d.normalize();
  // ...turned 70% toward the fists' own grip axes (pinky -> index: where a handle lies in a closed fist) while both hands
  // agree on it: the line between the fist centres alone ran the axe handle through her head in the batting idle (2.5 cm
  // from its centre; the axes clear it by 16 cm, the mix by ~13, each fist ~2.5 cm off the handle's centre line)
  const agree = ar.dot(F2.a), ax = _ax.copy(ar).add(F2.a).normalize();
  if (ax.dot(out.d) < 0) ax.negate();
  out.d.lerp(ax, 0.7 * sm(0.5, 0.85, agree) * sm(0.6, 0.8, ax.dot(out.d))).normalize(); // (not when the axes turn square to the line: a swing's blends)
  // the head end: continuous with the last frame's handle (prev) where there is one, `toward` breaking ties (re-choosing it
  // from `toward` alone each frame flipped the axe end over end in the swing's recovery)
  if (out.d.dot(_b.copy(toward).addScaledVector(prev || toward, 2)) < 0) out.d.negate();
  const ref = prev || toward;
  // the fists' line while it is a grip (the chop's wide grip is 25-34 cm); `toward` only picks the head end unless the line
  // turns square to it (X Bot's measured socket sits ~50 deg off her fists' line in the swing: trusting it put the handle
  // 3 cm beside her fists)
  const w = sm(0.15, 0.3, out.d.dot(ref)) * (1 - sm(0.36, 0.5, out.span));
  if (out.d.dot(toward) < 0 && w < 1) toward = _a.copy(toward).negate(); // (eases onto the socket line, same head end)
  out.d.multiplyScalar(w).addScaledVector(toward, 1 - w).normalize();
  out.c.lerp(ch, sm(0.36, 0.5, out.span)); // (apart: the grip is the holding fist)
  return out;
}

// ---- the pistol reload's loaded magazine (the user's props, assets/weapons/pistol_mag_*.glb) ----
// a seated magazine in the pistol model's own frame (the props' pistol_seated_translation)
export const MAG_SEAT = new THREE.Vector3(-0.008, -0.039, 0);
// the loaded magazine during the insert (pistol model frame; pinch = her thumb-index pinch there, s = 0..1 from insert to
// seat): it rises with her fingers along the grip (+Y), never past its seat, while it slides sideways into line
// (2026-10-17: easing all of it on a timer put it 3.5 cm ahead of her fingers). viewer.js updateMags plays the same rule.
export function magInsert(out, pinch, s) {
  return out.set(MAG_SEAT.x + (pinch.x - MAG_SEAT.x) * (1 - s), MAG_SEAT.y + Math.min(0, pinch.y - MAG_SEAT.y) * (s >= 1 ? 0 : 1), MAG_SEAT.z + (pinch.z - MAG_SEAT.z) * (1 - s));
}

// ---- the shotgun reload's shell (the user's prop, assets/weapons/shotgun_shell.glb, prepShell frame: axis +X, brass
// toward -X, centre at its HandAttach) ----
// held between her thumb and index finger (the middle of the shell at the pinch), pointing at the loading port it is
// about to go into. Before 2026-10-17 it rode fixed offsets from the palm and floated 5-8 cm behind her fingers.
const _sp = new THREE.Vector3(), _sd = new THREE.Vector3(), _sx = new THREE.Vector3(1, 0, 0);
export function placeShell(bones, o, portWorld, side = 'Left') {
  const t = bones[side + 'HandThumb2'], i = bones[side + 'HandIndex2']; if (!t || !i) return false;
  t.getWorldPosition(_sp).lerp(i.getWorldPosition(_sd), 0.5);
  _sd.copy(portWorld).sub(_sp); if (_sd.lengthSq() < 1e-8) return false;
  o.position.copy(_sp); o.quaternion.setFromUnitVectors(_sx, _sd.normalize());
  return true;
}
