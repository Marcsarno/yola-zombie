// Backend-independent ragdoll description and skeleton driver.
// A ragdoll is 11 capsule parts (pelvis, chest, head, upper/lower arms, thighs, shins) joined by ball
// joints (hips, shoulders, waist, neck) and hinges (elbows, knees). Both physics backends (custom and
// Rapier) receive the same description and report each part as {pos, quat} where the part frame has
// local +Y along the capsule (a -> b). The driver maps parts back onto the mixamorig bones.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// part: [name, bone it drives, from-bone, to-bone (or extension), radius (fraction of height), mass, parent part]
const PARTS = [
  ['pelvis', 'Hips', 'Hips', 'Spine1', 0.075, 12, null],
  ['chest', 'Spine2', 'Spine1', 'Neck', 0.085, 14, 'pelvis'],
  ['head', 'Head', 'Head', 'HEAD_TOP', 0.065, 5, 'chest'],
  ['upperArmL', 'LeftArm', 'LeftArm', 'LeftForeArm', 0.03, 2.2, 'chest'],
  ['foreArmL', 'LeftForeArm', 'LeftForeArm', 'LEFT_HAND_END', 0.027, 1.6, 'upperArmL'],
  ['upperArmR', 'RightArm', 'RightArm', 'RightForeArm', 0.03, 2.2, 'chest'],
  ['foreArmR', 'RightForeArm', 'RightForeArm', 'RIGHT_HAND_END', 0.027, 1.6, 'upperArmR'],
  ['thighL', 'LeftUpLeg', 'LeftUpLeg', 'LeftLeg', 0.045, 7, 'pelvis'],
  ['shinL', 'LeftLeg', 'LeftLeg', 'LEFT_FOOT_END', 0.035, 4, 'thighL'],
  ['thighR', 'RightUpLeg', 'RightUpLeg', 'RightLeg', 0.045, 7, 'pelvis'],
  ['shinR', 'RightLeg', 'RightLeg', 'RIGHT_FOOT_END', 0.035, 4, 'thighR'],
];
// which part each severable piece removes (and everything below it)
export const SEVER_PART = { Head: 'head', Forearm_L: 'foreArmL', Forearm_R: 'foreArmR', LowerLeg_L: 'shinL', LowerLeg_R: 'shinR' };
const HINGES = { foreArmL: 1, foreArmR: 1, shinL: 1, shinR: 1 };

function wpos(bones, name, out) {
  const ext = (a, b, k) => { bones[a].getWorldPosition(out); bones[b].getWorldPosition(_v2); return out.lerp(_v2, 1 + k); };
  switch (name) {
    case 'HEAD_TOP': return bones.HeadTop_End ? bones.HeadTop_End.getWorldPosition(out) : headTop(bones, out);
    case 'LEFT_HAND_END': return ext('LeftForeArm', 'LeftHand', 0.45);
    case 'RIGHT_HAND_END': return ext('RightForeArm', 'RightHand', 0.45);
    case 'LEFT_FOOT_END': return ext('LeftLeg', 'LeftFoot', 0.08);
    case 'RIGHT_FOOT_END': return ext('RightLeg', 'RightFoot', 0.08);
    default: return bones[name].getWorldPosition(out);
  }
}
function headTop(bones, out) {
  // top of the skull: from the head joint along the neck->head direction, ~1.6x the neck length
  bones.Neck.getWorldPosition(_v2); bones.Head.getWorldPosition(out);
  const d = out.clone().sub(_v2);
  return out.add(d.multiplyScalar(1.6));
}

// Frame with +Y along dir and +X as close as possible to ref.
export function frameQuat(dir, ref, out) {
  const y = _v.copy(dir).normalize();
  let x = _v2.copy(ref).addScaledVector(y, -ref.dot(y));
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(y, -y.x);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

// Build a ragdoll description from the current (animated) pose of a view's skeleton.
// missing: Set of part names that are severed (they and their children are left out).
export function describeRagdoll(bones, height, missing = new Set()) {
  const parts = [], idx = {};
  const skip = new Set();
  for (const p of PARTS) if (missing.has(p[0]) || skip.has(p[6])) skip.add(p[0]);
  bones.Hips.updateWorldMatrix(true, true);
  for (const [name, bone, from, to, rad, mass, parent] of PARTS) {
    if (skip.has(name)) continue;
    const a = wpos(bones, from, new THREE.Vector3()), b = wpos(bones, to, new THREE.Vector3());
    // reference axis for the part's twist: the bone's own world X axis
    const bq = bones[bone].getWorldQuaternion(new THREE.Quaternion());
    let ref = new THREE.Vector3(1, 0, 0).applyQuaternion(bq);
    if (name === 'pelvis' || name === 'chest') { // the hip / shoulder line, left minus right
      const l = wpos(bones, name === 'pelvis' ? 'LeftUpLeg' : 'LeftArm', new THREE.Vector3());
      const r = wpos(bones, name === 'pelvis' ? 'RightUpLeg' : 'RightArm', new THREE.Vector3());
      ref = l.sub(r);
    }
    const q0 = frameQuat(b.clone().sub(a), ref, new THREE.Quaternion());
    idx[name] = parts.length;
    parts.push({ name, bone, a, b, r: rad * height, mass, parent, q0, ref, boneQ0: bq, hinge: !!HINGES[name] });
  }
  // joints at the child's 'a' end
  const joints = [];
  for (const p of parts) {
    if (!p.parent || idx[p.parent] === undefined) continue;
    const par = parts[idx[p.parent]];
    let axis = null;
    if (p.hinge) { // elbow / knee: bend axis = normal of the limb plane, falling back to the bone X axis
      const u = par.b.clone().sub(par.a).normalize(), w = p.b.clone().sub(p.a).normalize();
      axis = new THREE.Vector3().crossVectors(u, w);
      if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0).applyQuaternion(par.boneQ0);
      axis.normalize();
    }
    joints.push({ parent: idx[p.parent], child: idx[p.name], at: p.a.clone(), type: p.hinge ? 'hinge' : 'ball', axis });
  }
  return { parts, joints, idx };
}

// Drives the skeleton from the simulated parts. offsets map part frame -> bone world orientation.
const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'RightShoulder', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'];
export class RagdollDriver {
  constructor(bones, desc) {
    this.bones = bones; this.desc = desc;
    this.off = desc.parts.map((p) => p.q0.clone().invert().multiply(p.boneQ0));
    // hips position relative to the pelvis part frame
    const pel = desc.parts[desc.idx.pelvis];
    const hp = bones.Hips.getWorldPosition(new THREE.Vector3());
    this.hipsLocal = hp.sub(pel.a.clone().add(pel.b).multiplyScalar(0.5)).applyQuaternion(pel.q0.clone().invert());
    this.byBone = {};
    desc.parts.forEach((p, i) => (this.byBone[p.bone] = i));
    this.want = {};
  }
  // states: [{pos, quat}] per part (same order as desc.parts)
  apply(states) {
    const B = this.bones, W = this.want;
    for (const k in W) delete W[k];
    this.desc.parts.forEach((p, i) => { W[p.bone] = states[i].quat.clone().multiply(this.off[i]); });
    // in-between spine and neck bones share the rotation between their neighbours
    const pel = W.Hips, ch = W.Spine2;
    if (pel && ch) { W.Spine = pel.clone().slerp(ch, 0.33); W.Spine1 = pel.clone().slerp(ch, 0.66); }
    if (ch && W.Head) W.Neck = ch.clone().slerp(W.Head, 0.5);
    // hips position
    const ps = states[this.desc.idx.pelvis];
    const hipW = this.hipsLocal.clone().applyQuaternion(ps.quat).add(ps.pos);
    for (const name of ORDER) {
      const b = B[name]; if (!b) continue;
      const parent = b.parent;
      if (name === 'Hips') {
        parent.updateWorldMatrix(true, false);
        b.position.copy(parent.worldToLocal(hipW.clone()));
      }
      if (W[name]) {
        parent.getWorldQuaternion(_q);
        b.quaternion.copy(_q.invert().multiply(W[name]));
      }
      b.updateWorldMatrix(false, false);
    }
    B.Hips.updateWorldMatrix(false, true);
  }
}
