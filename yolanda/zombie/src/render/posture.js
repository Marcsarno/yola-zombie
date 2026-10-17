// POSTURE FIX (2026-10-17, measured in the Rig Lab: viewer.js postureC). blender/retarget.py points each of Yola's bones
// along the SOURCE bone's own axis, but a rig's bone axis is not always its real limb line: X Bot's Neck / Head axes sit
// 16.9 / 25.8 deg off his neck line, so her head was tipped back (chin up, eyes on the sky in the run) in every clip from
// Mixamo; her own Hips / Spine2 axes sit 4.1 / 1.6 deg off her lines (a tucked pelvis), in every retargeted clip. The cure
// is a constant turn per bone, in the bone's own frame: C = Rt^-1 A^-1 A' Rt (Rt her rest rotation, A axis->axis, A'
// line->line, between her rig and the source rig). The bone turns by C; its retargeted children turn back by C^-1 so they
// keep their own (correct) world rotations. The head's children (the ponytail root, the head-top marker) turn with it.
// The hands' ~4-5 deg is left out on purpose: the user's weapon fits were set on the hands as they are.
// Families: 'xbot' = clips retargeted from Mixamo (directly or through the first Yola), 'mannequin' = Quaternius UAL
// clips (its neck needs nothing; it has no head-top bone to measure the head), Tripo's own clips (t_*, tripo_idle) none.
import * as THREE from 'three';

export const POSTURE_C = {
  xbot: { Hips: [0, 0, -0.035646, 0.999364], Spine2: [-0.001196, 0, 0.014208, 0.999898], Neck: [-0.043254, 0, -0.140575, 0.989125], Head: [-0.065594, 0, -0.213182, 0.974808] },
  mannequin: { Hips: [0, 0, -0.035646, 0.999364], Spine2: [-0.001196, 0, 0.014208, 0.999898] },
};
export const POSTURE_BONES = ['Hips', 'Spine2', 'Neck', 'Head'];
const TURNS_CHILDREN = { Hips: true, Spine2: true, Neck: true, Head: false };
const Q = {}; for (const [f, m] of Object.entries(POSTURE_C)) { Q[f] = {}; for (const [n, v] of Object.entries(m)) Q[f][n] = new THREE.Quaternion(...v); }
const I = new THREE.Quaternion(), _c = new THREE.Quaternion(), _c2 = new THREE.Quaternion(), _ci = new THREE.Quaternion();

export function postureFamily(clip) {
  if (!clip) return null;
  if (/^ual1?_|^pistol_reload$/.test(clip)) return 'mannequin'; // (her reload is Quaternius Pistol_Reload since 2026-10-17)
  if (/^t_|^tripo_/.test(clip)) return null; // (authored on the Tripo rig itself)
  return 'xbot';
}

// w: { boneName: { xbot: weight share 0..1, mannequin: share } } (shares of the clips driving that bone). rot(b, fn): how
// a bone is turned (the Rig Lab records it to undo later); default: in place.
export function applyPosture(bones, w, rot = (b, fn) => fn(b.quaternion)) {
  for (const n of POSTURE_BONES) {
    const b = bones[n], s = w[n]; if (!b || !s) continue;
    _c.identity();
    for (const f of ['xbot', 'mannequin']) if (s[f] > 1e-3 && Q[f][n]) _c.multiply(_c2.copy(I).slerp(Q[f][n], Math.min(1, s[f])));
    if (Math.abs(_c.w) > 0.9999999) continue;
    const c = _c.clone(); rot(b, (q) => q.multiply(c));
    if (TURNS_CHILDREN[n]) { _ci.copy(c).invert(); const ci = _ci.clone(); for (const k of b.children) if (k.isBone) rot(k, (q) => q.premultiply(ci)); }
  }
}
