// Character checks for the Rig Lab (2026-10-20, the user: "optimize the workflow, and the rig lab ... we can do much
// better"; CHARACTER_RIG_PLAYBOOK.md): any Quaternius library clip played live on any character (no Blender bake), the
// skin weights drawn on the meshes as Blender draws them, a name over every figure, one skeleton colour per figure.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// ---------------- live retarget (blender/retarget.py's rule, in the browser) ----------------
// Each target bone takes the source bone's posed world rotation times a constant measured at rest,
//   off = Rs^-1 * Yf^-1 * A * Rt   (Rs, Rt: rest world rotations; Yf: the two rigs' facing difference; A turns the target's
//   rest bone line onto the source's),
// so the source's change from ITS rest lands on a target bone that starts along the same line. A line runs from a bone to
// its chain child (three.js bones have no tails), so the X Bot neck / head axis error (WEAPON_HOLD_PROCESS.md 17) does not
// arise here. The collarbones turn from the target's own rest relative to the chest (Marc, 2026-10-20: the chest "V").
// Bones the source lacks keep their rest pose under their parent. The hips move by the source's change from rest, scaled
// by hip height. Contacts (feet on the floor, hands on a weapon) are NOT applied: a preview of the motion on the body,
// not the game's baked clip.
const CHAIN = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End' };
for (const s of ['Left', 'Right']) {
  Object.assign(CHAIN, { [s + 'Shoulder']: s + 'Arm', [s + 'Arm']: s + 'ForeArm', [s + 'ForeArm']: s + 'Hand', [s + 'Hand']: s + 'HandMiddle1',
    [s + 'UpLeg']: s + 'Leg', [s + 'Leg']: s + 'Foot', [s + 'Foot']: s + 'ToeBase', [s + 'ToeBase']: s + 'Toe_End' });
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) CHAIN[`${s}Hand${f}${i}`] = `${s}Hand${f}${i + 1}`;
}
export const REST_RELATIVE = new Set(['LeftShoulder', 'RightShoulder']);

// every bone of an actor at its rest pose (the pose each redraw starts from: Actor.rest), world rotation and position;
// the actor's bones are put back exactly as they were
function restWorld(a) {
  const keep = a.rest.map(([b]) => [b, b.quaternion.clone(), b.position.clone(), b.scale.clone()]);
  for (const [b, q, p, s] of a.rest) { b.quaternion.copy(q); b.position.copy(p); b.scale.copy(s); }
  a.root.updateMatrixWorld(true);
  const out = new Map();
  for (const [b] of a.rest) out.set(b, { q: b.getWorldQuaternion(new THREE.Quaternion()), p: b.getWorldPosition(new THREE.Vector3()), local: a.root.worldToLocal(b.getWorldPosition(new THREE.Vector3())) });
  for (const [b, q, p, s] of keep) { b.quaternion.copy(q); b.position.copy(p); b.scale.copy(s); }
  a.root.updateMatrixWorld(true);
  return out;
}
// the feet's toe direction at rest, level (as retarget.py _facing)
function facing(a, R) {
  const d = new THREE.Vector3();
  for (const s of ['Left', 'Right']) { const f = a.bones[s + 'Foot'], t = a.bones[s + 'ToeBase']; if (f && t) d.add(R.get(t).p).sub(R.get(f).p); }
  d.y = 0; return d.lengthSq() > 1e-10 ? d.normalize() : null;
}
const outer = (b) => { while (b && b.parent?.isBone && b.parent.name === b.name) b = b.parent; return b; }; // (the X Bot FBX nests a same-named copy in each bone)

export class LiveRetarget {
  // src, tgt: Rig Lab actors ({ obj, root, bones (by mixamo short name), rest })
  constructor(src, tgt, { restRelative = REST_RELATIVE } = {}) {
    this.src = src; this.tgt = tgt;
    const RS = restWorld(src), RT = restWorld(tgt);
    const fs = facing(src, RS), ft = facing(tgt, RT);
    this.Yf = fs && ft ? new THREE.Quaternion().setFromUnitVectors(fs, ft) : new THREE.Quaternion();
    const YfInv = this.Yf.clone().invert();
    // the target's bones parent-first, each with its source bone (by name) and its constants
    const order = []; const walk = (b) => { if (b.isBone) order.push(b); for (const c of b.children) walk(c); }; walk(tgt.obj);
    const keyOf = new Map(Object.entries(tgt.bones).map(([k, b]) => [b, k]));
    const lineOf = (a, R, k) => { const b = a.bones[k], c = a.bones[CHAIN[k]]; return b && c ? R.get(c).p.clone().sub(R.get(b).p).normalize() : null; };
    const Aof = {};
    this.list = [];
    for (const tb of order) {
      const k = keyOf.get(tb), sb0 = k && src.bones[k], sb = sb0 && outer(sb0);
      if (!sb || !RS.has(sb) || !RT.has(tb)) { this.list.push({ tb, k }); continue; }
      const dt = lineOf(tgt, RT, k), ds = lineOf(src, RS, k);
      // A: the rest lines matched (a bone without a chain child, e.g. a finger tip, takes its parent's)
      let A = null;
      if (dt && ds) A = new THREE.Quaternion().setFromUnitVectors(dt, ds.clone().applyQuaternion(this.Yf));
      else { const pk = tb.parent && keyOf.get(tb.parent); A = (pk && Aof[pk]) || new THREE.Quaternion(); }
      Aof[k] = A;
      const Rs = RS.get(sb).q, Rt = RT.get(tb).q;
      const e = { tb, k, sb, off: Rs.clone().invert().multiply(YfInv).multiply(A).multiply(Rt), Rt: Rt.clone(), Rs: Rs.clone() };
      if (restRelative.has(k) && sb.parent && RS.has(sb.parent) && tb.parent && RT.has(tb.parent)) {
        e.rel = { sp: sb.parent, RpsInv: RS.get(sb.parent).q.clone().invert(), RptInv: RT.get(tb.parent).q.clone().invert(), RsInv: Rs.clone().invert() };
      }
      if (k === 'Hips') { e.hips = { srcRest: RS.get(sb).local.clone(), tgtRest: RT.get(tb).local.clone() }; }
      this.list.push(e);
    }
  }
  // pose the target from the source's current pose (the source already set to the frame)
  apply() {
    const { src, tgt, Yf } = this; const YfInv = _q3.copy(Yf).invert();
    src.root.updateMatrixWorld(true);
    for (const e of this.list) {
      const tb = e.tb;
      if (e.sb) {
        const Ws = e.sb.getWorldQuaternion(_q);
        let Wt;
        if (e.rel) { // its turn from rest relative to its parent's, laid on the target's parent: (Wpt Rpt^-1) Yf rel Yf^-1 Rt
          const Wps = e.rel.sp.getWorldQuaternion(_q2), relS = Wps.multiply(e.rel.RpsInv).invert().multiply(_q.clone().multiply(e.rel.RsInv));
          const Wpt = tb.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(e.rel.RptInv);
          Wt = Wpt.multiply(Yf.clone().multiply(relS).multiply(YfInv)).multiply(e.Rt);
        } else Wt = Yf.clone().multiply(Ws).multiply(e.off);
        tb.parent.getWorldQuaternion(_q2); tb.quaternion.copy(_q2.invert().multiply(Wt));
        if (e.hips) { // the source's hips change from rest (its own root's frame), turned by Yf, scaled by hip height
          const s = src.root.worldToLocal(e.sb.getWorldPosition(_v)).sub(e.hips.srcRest).multiplyScalar(src.root.scale.y);
          s.applyQuaternion(Yf).multiplyScalar((e.hips.tgtRest.y * tgt.root.scale.y) / Math.max(1e-6, e.hips.srcRest.y * src.root.scale.y));
          const w = tgt.root.localToWorld(_v2.copy(e.hips.tgtRest)).add(s);
          tb.parent.updateWorldMatrix(true, false); tb.position.copy(tb.parent.worldToLocal(w));
        }
      }
      tb.updateWorldMatrix(false, false);
    }
    tgt.root.updateMatrixWorld(true);
  }
}

// ---------------- skin weights drawn on the mesh (Blender's weight colours) ----------------
// mode 'bone': one bone's weight, blue 0 -> green 0.5 -> red 1 (dark blue: none at all). mode 'patch': every vertex
// coloured by the bones that hold it (a colour per bone, mixed by weight): borders and strays show at a glance (a pocket
// following a hand, a beard on the chest). norm: a skeleton bone's name -> the Rig Lab's short name (mixamo).
export function heatColor(w, out) {
  if (w <= 0.0005) return out.setRGB(0.04, 0.05, 0.32);
  const stops = [[0, 0, 0, 1], [0.25, 0, 1, 1], [0.5, 0, 1, 0], [0.75, 1, 1, 0], [1, 1, 0, 0]];
  for (let i = 1; i < stops.length; i++) if (w <= stops[i][0]) {
    const [a, r0, g0, b0] = stops[i - 1], [b, r1, g1, b1] = stops[i], u = (w - a) / (b - a);
    return out.setRGB(r0 + (r1 - r0) * u, g0 + (g1 - g0) * u, b0 + (b1 - b0) * u);
  }
  return out.setRGB(1, 0, 0);
}
const PATCH = new Map();
export function patchColor(name) { // a steady colour per bone name (golden-angle hues)
  if (!PATCH.has(name)) { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; PATCH.set(name, new THREE.Color().setHSL(((h % 997) * 0.618034) % 1, 0.7, 0.55)); }
  return PATCH.get(name);
}
export function setWeights(obj, mode, key, norm) {
  const c = new THREE.Color();
  obj.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry;
    if (!('__mat' in o)) o.__mat = o.material; // (the original material: shared with the viewer's ghost view)
    if (!('__col' in g)) g.__col = g.attributes.color || null;
    if (!mode) { // off: the original look back
      if (g.__col) g.setAttribute('color', g.__col); else g.deleteAttribute('color');
      if (o.material === o.__heatMat) o.material = o.__mat; return;
    }
    const tag = mode + ':' + key;
    o.material = (o.__heatMat ||= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    if (o.__heat === tag) { if (g.attributes.color !== o.__heatCol) g.setAttribute('color', o.__heatCol); return; }
    const n = g.attributes.position.count, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, names = o.skeleton.bones.map((b) => norm(b.name));
    const col = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      if (mode === 'bone') {
        let w = 0; for (let k = 0; k < 4; k++) if (names[si.getComponent(v, k)] === key) w += sw.getComponent(v, k);
        heatColor(w, c);
      } else {
        c.setRGB(0, 0, 0); let t = 0;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > 0) { const p = patchColor(names[si.getComponent(v, k)] || '?'); c.r += p.r * w; c.g += p.g * w; c.b += p.b * w; t += w; } }
        if (t > 0) c.multiplyScalar(1 / t);
      }
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    o.__heatCol = new THREE.BufferAttribute(col, 3); g.setAttribute('color', o.__heatCol);
    o.__heat = tag;
  });
}

// ---------------- a name over each figure (in the pictures too) ----------------
export function makeTag() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 96; // (wide: a long test label stays readable)
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  // (the same size on screen however close the camera is: a close-up of the hands is not covered by a giant name)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, sizeAttenuation: false }));
  s.renderOrder = 20; s.center.set(0.5, 0); s.userData = { cv, tex, text: '' }; s.visible = false;
  return s;
}
export function setTag(s, text, color) {
  const key = text + '|' + color;
  if (s.userData.text === key) return;
  s.userData.text = key;
  const { cv, tex } = s.userData, cx = cv.getContext('2d');
  cx.clearRect(0, 0, cv.width, cv.height);
  cx.font = '600 40px system-ui, "Segoe UI", sans-serif';
  const w = Math.min(cv.width - 8, cx.measureText(text).width + 36);
  cx.fillStyle = 'rgba(15,20,24,0.82)'; cx.beginPath(); cx.roundRect((cv.width - w) / 2, 14, w, 64, 14); cx.fill();
  cx.fillStyle = '#' + new THREE.Color(color).getHexString(); cx.fillRect((cv.width - w) / 2 + 12, 30, 10, 32);
  cx.fillStyle = '#eef2f0'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(text, cv.width / 2 + 8, 47, cv.width - 50);
  tex.needsUpdate = true;
}
export function placeTag(s, a, lift = 0) { // above the head (lift: metres more, to stack the names of figures on one spot)
  const k = a.height / 1.62, h = a.bones.HeadTop_End || a.bones.Head;
  if (!h) return;
  h.getWorldPosition(s.position); s.position.y += (a.bones.HeadTop_End ? 0.1 : 0.28) * k + lift;
  s.scale.set(0.36, 0.034, 1); // (a share of the view's height: about 5%)
}

// ---------------- one skeleton colour per figure ----------------
export function tintSkeleton(helper, color) {
  const c = new THREE.Color(color), at = helper.geometry.attributes.color; if (!at) return;
  for (let i = 0; i < at.count; i++) at.setXYZ(i, c.r, c.g, c.b);
  at.needsUpdate = true;
}

// ---------------- the range-of-motion list (Quaternius library clips: every rig plays them, the clothed dummies too) ----
// [library prefix, clip, what it tests]
export const ROM = [
  ['ual1_', 'A_TPose', 'Rest: arms out'],
  ['ual1_', 'Idle_Loop', 'Standing relaxed'],
  ['ual1_', 'Celebration', 'Arms overhead (armpits, shoulder caps)'],
  ['ual1_', 'Climb_Up_Loop', 'Reach up and knee up'],
  ['ual1_', 'Push_Loop', 'Arms forward (back, shoulder blades)'],
  ['ual_', 'Idle_FoldArms_Loop', 'Arms folded (chest, elbows)'],
  ['ual_', 'Bow_Aim_Neutral', 'Elbow back, arm across'],
  ['ual_', 'Sword_Heavy_Combo', 'Twists and big swings'],
  ['ual1_', 'Kick', 'High kick (hips, thighs)'],
  ['ual1_', 'Crouch_Idle_Loop', 'Deep crouch (knees, seat)'],
  ['ual1_', 'PickUp_Kneeling', 'Kneel and reach down'],
  ['ual1_', 'Sitting_Idle_Loop', 'Sitting (hips at 90 deg)'],
  ['ual1_', 'GroundSit_Idle_Loop', 'Sitting on the ground'],
  ['ual1_', 'Jog_Fwd_Loop', 'Jog'],
];
