// Arms out (2026-10-17, the user: "she has wider hips than the dummy... so her hands clip into her hips ... can we widen her
// arms out by a certain amount of cm just to get them not clipping .. but not over doing it"). Per clip and per arm, the
// upper arm swings out from the shoulder about her body's front-back axis so the hand moves out from her body by that many
// cm; the elbow's bend and everything below it (the hand, the weapon) come along unchanged. The same in the game
// (render/clipchars.js) and the Rig Lab. Saved in assets/hold/arm_spread.json: { "<character>:<clip>": { Right: cm, Left: cm } }.
import * as THREE from 'three';

const _l = new THREE.Vector3(), _s = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _o = new THREE.Vector3(), _m = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// cm: { Right, Left } (cm at the hand, outward from her body; 0 = untouched)
export function spreadArms(bones, cm) {
  if (!cm || !bones.LeftArm || !bones.RightArm) return;
  _l.copy(bones.LeftArm.getWorldPosition(_s)).sub(bones.RightArm.getWorldPosition(_h)); _l.y = 0; _l.normalize(); // (her left)
  _f.crossVectors(_l, UP); // (her front)
  for (const side of ['Right', 'Left']) {
    const c = cm[side]; if (!(Math.abs(c) > 1e-3)) continue;
    const U = bones[side + 'Arm'], H = bones[side + 'Hand']; if (!U || !H) continue;
    U.getWorldPosition(_s); H.getWorldPosition(_h);
    _d.copy(_h).sub(_s); _d.addScaledVector(_f, -_d.dot(_f)); const r = _d.length(); if (r < 0.05) continue;
    // the way a turn about her front moves the hand, and which way is out from her body for this arm
    _m.crossVectors(_f, _d); _o.copy(_l).multiplyScalar(side === 'Right' ? -1 : 1);
    const ang = (c / 100) / r * (_m.dot(_o) >= 0 ? 1 : -1);
    _q.setFromAxisAngle(_f, ang);
    U.getWorldQuaternion(_qw); U.parent.getWorldQuaternion(_qp);
    U.quaternion.copy(_qp.invert().multiply(_q).multiply(_qw)); U.updateMatrixWorld(true);
  }
}
