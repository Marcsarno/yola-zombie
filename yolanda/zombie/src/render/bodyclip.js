// Arm-through-body check (2026-10-17, the user: "analyze any game clip where the arm clips through the body.. identify it
// to be for review"). Used by the Rig Lab (viewer.js __lab.bodyClipScan); no game code depends on it.
//
// Her body is her own mesh in its rest pose: the triangles whose corners all belong to her torso, neck, head or legs (each
// vertex belongs to the bone segment it is nearest to at rest, where her arms are away from her body). Each arm is a few
// hundred of its real vertices (the elbow end of the upper arm, the forearm, the hand and fingers), skinned to the frame
// being checked, then carried back to the rest pose through the body bone nearest to it (her torso barely bends around
// one bone). There it is inside her if rays from it cross her skin an odd number of times: two along her front-back
// axis, two along her side axis; both front-back rays, or three of the four, must agree (the body surface is open where
// the arms join it, which only a side ray at shoulder height can slip through). How deep: the distance to her nearest
// skin vertex.
// (2026-10-17: two quicker versions failed. A slice outline per bone rounded out the hollow between arm and chest, and
// the nearest skin's facing misled at the shoulder: every hanging arm read 10-14 cm "inside" her chest. Before that,
// sorting vertices by skin weight: Yola 2's auto-rig spreads her torso over many bones.)
import * as THREE from 'three';

const BODY = { Hips: 'hips', Spine: 'belly', Spine1: 'chest', Spine2: 'chest', Neck: 'neck', Head: 'head', LeftUpLeg: 'left thigh', RightUpLeg: 'right thigh', LeftLeg: 'left shin', RightLeg: 'right shin' };
const ARM = /^(Left|Right)(Arm|ForeArm|Hand)/;
const SEGS = [['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'], ['Head', null], ['LeftUpLeg', 'LeftLeg'], ['RightUpLeg', 'RightLeg'],
  ['LeftLeg', 'LeftFoot'], ['RightLeg', 'RightFoot'], ['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase'], ['LeftShoulder', 'LeftArm'], ['RightShoulder', 'RightArm'],
  ['LeftArm', 'LeftForeArm'], ['RightArm', 'RightForeArm'], ['LeftForeArm', 'LeftHand'], ['RightForeArm', 'RightHand'], ['LeftHand', 'LeftHandMiddle1'], ['RightHand', 'RightHandMiddle1'],
  ['LeftHandMiddle1', 'LeftHandMiddle3'], ['RightHandMiddle1', 'RightHandMiddle3'], ['LeftHandThumb1', 'LeftHandThumb3'], ['RightHandThumb1', 'RightHandThumb3'], ['LeftHandIndex1', 'LeftHandIndex3'], ['RightHandIndex1', 'RightHandIndex3'], ['LeftHandPinky1', 'LeftHandPinky3'], ['RightHandPinky1', 'RightHandPinky3']];

export function buildBodyClip(root, bones, perSide = 360) {
  root.updateMatrixWorld(true);
  let mesh = null; root.traverse((o) => { if (o.isSkinnedMesh && o.visible && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  if (!mesh) return null;
  const sk = mesh.skeleton, idx = new Map(sk.bones.map((b, i) => [b, i])), bindW = sk.boneInverses.map((m) => new THREE.Matrix4().copy(m).invert());
  const at = (n) => { const i = idx.get(bones[n]); return i === undefined ? null : new THREE.Vector3().setFromMatrixPosition(bindW[i]); };
  const segs = [];
  for (const [n0, n1] of SEGS) {
    const i = idx.get(bones[n0]); if (i === undefined) continue;
    const p0 = at(n0); let p1 = n1 && at(n1);
    if (!p1) p1 = p0.clone().add(new THREE.Vector3(0, 0.25, 0).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(bindW[i]))); // (the head: up its own axis)
    segs.push({ n: n0, n1, i, p0, d: p1.clone().sub(p0) });
  }
  const pos = mesh.geometry.attributes.position, nv = pos.count, P = new Float32Array(nv * 3), body = new Uint8Array(nv), all = { Left: [], Right: [] };
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let k = 0; k < nv; k++) {
    v.fromBufferAttribute(pos, k).applyMatrix4(mesh.bindMatrix); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
    let best = null, bd = Infinity, bt = 0;
    for (const S of segs) { const t = Math.max(0, Math.min(1, w.copy(v).sub(S.p0).dot(S.d) / S.d.lengthSq())); const dd = w.copy(S.p0).addScaledVector(S.d, t).distanceToSquared(v); if (dd < bd) { bd = dd; best = S; bt = t; } }
    if (!best) continue;
    if (BODY[best.n]) { body[k] = 1; continue; }
    const m = ARM.exec(best.n); if (!m) continue;
    if (m[2] === 'Arm' && bt < 0.6) continue; // (the armpit and the sleeve's underside lie against her side by design: only the elbow end of the upper arm)
    all[m[1]].push({ i: k, part: m[2] === 'Arm' ? 'upper arm' : m[2] === 'ForeArm' ? 'forearm' : 'hand' });
  }
  // her body's surface at rest, bucketed for rays along X (by y, z) and along Z (by x, y); and its vertices for the depth
  const sc = mesh.matrixWorld.getMaxScaleOnAxis(), cs = 0.02 / sc, ix = mesh.geometry.index ? mesh.geometry.index.array : Array.from({ length: nv }, (_, q) => q);
  const tri = [], gX = new Map(), gZ = new Map(), gV = new Map();
  const put = (g, key, t) => { let c = g.get(key); if (!c) g.set(key, (c = [])); c.push(t); };
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2]; if (!body[a] || !body[b] || !body[c]) continue;
    const ti = tri.length; tri.push(a, b, c);
    const xs = [P[a * 3], P[b * 3], P[c * 3]], ys = [P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]], zs = [P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]];
    const x0 = Math.floor(Math.min(...xs) / cs), x1 = Math.floor(Math.max(...xs) / cs), y0 = Math.floor(Math.min(...ys) / cs), y1 = Math.floor(Math.max(...ys) / cs), z0 = Math.floor(Math.min(...zs) / cs), z1 = Math.floor(Math.max(...zs) / cs);
    for (let y = y0; y <= y1; y++) { for (let z = z0; z <= z1; z++) put(gX, y + ',' + z, ti); for (let x = x0; x <= x1; x++) put(gZ, x + ',' + y, ti); }
  }
  const vs = 0.04 / sc;
  for (let k = 0; k < nv; k++) if (body[k]) put(gV, Math.floor(P[k * 3] / vs) + ',' + Math.floor(P[k * 3 + 1] / vs) + ',' + Math.floor(P[k * 3 + 2] / vs), k);
  const side = {};
  for (const s of ['Left', 'Right']) { const a = all[s], k = Math.max(1, Math.floor(a.length / perSide)); side[s] = a.filter((_, j) => j % k === 0); }
  return { mesh, bones, bindW, segs: segs.filter((S) => BODY[S.n]), P, tri, gX, gZ, gV, cs, vs, sc, side };
}

// crossings of her rest-pose skin by the two rays from s along X (u = 0) or Z (u = 2): [ +, - ]
function crossings(C, s, u) {
  const P = C.P, T = C.tri, g = u === 0 ? C.gX : C.gZ, a1 = u === 0 ? 1 : 0, a2 = u === 0 ? 2 : 1; // (the plane the ray pierces: y-z for X rays, x-y for Z rays)
  const key = u === 0 ? Math.floor(s[1] / C.cs) + ',' + Math.floor(s[2] / C.cs) : Math.floor(s[0] / C.cs) + ',' + Math.floor(s[1] / C.cs);
  const list = g.get(key); if (!list) return [0, 0];
  let pos = 0, neg = 0;
  for (const t of list) {
    const A = T[t] * 3, B = T[t + 1] * 3, D = T[t + 2] * 3;
    const ax = P[A + a1], ay = P[A + a2], bx = P[B + a1], by = P[B + a2], dx = P[D + a1], dy = P[D + a2], px = s[a1], py = s[a2];
    const den = (by - dy) * (ax - dx) + (dx - bx) * (ay - dy); if (Math.abs(den) < 1e-14) continue;
    const l1 = ((by - dy) * (px - dx) + (dx - bx) * (py - dy)) / den, l2 = ((dy - ay) * (px - dx) + (ax - dx) * (py - dy)) / den, l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    const hit = l1 * P[A + u] + l2 * P[B + u] + l3 * P[D + u];
    if (hit > s[u]) pos++; else neg++;
  }
  return [pos, neg];
}
function insideRest(C, s) {
  const [xp, xn] = crossings(C, s, 0), [zp, zn] = crossings(C, s, 2), votes = (xp & 1) + (xn & 1) + (zp & 1) + (zn & 1);
  return ((zp & 1) && (zn & 1)) || votes >= 3;
}
function nearestSkin(C, s) {
  const gx = Math.floor(s[0] / C.vs), gy = Math.floor(s[1] / C.vs), gz = Math.floor(s[2] / C.vs), P = C.P; let bd = Infinity;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
    const c = C.gV.get((gx + i) + ',' + (gy + j) + ',' + (gz + k)); if (!c) continue;
    for (const q of c) { const d = (P[q * 3] - s[0]) ** 2 + (P[q * 3 + 1] - s[1]) ** 2 + (P[q * 3 + 2] - s[2]) ** 2; if (d < bd) bd = d; }
  }
  return Math.sqrt(bd) * C.sc; // (metres)
}

// this frame's clip-throughs: [{ side, part, into, depth (m), at (world point) }], the deepest per arm part and body part
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();
export function bodyClipFrame(C, minDepth = 0.015) {
  if (!C) return [];
  const M = C.mesh, toRest = new Map(), segW = [];
  _mi.copy(M.matrixWorld).invert();
  for (const S of C.segs) {
    const b0 = C.bones[S.n], b1 = S.n1 && C.bones[S.n1]; b0.getWorldPosition(_a);
    segW.push({ S, p0: _a.clone(), d: (b1 ? b1.getWorldPosition(_b).clone() : _a.clone().add(new THREE.Vector3(0, 0.25, 0).applyQuaternion(b0.getWorldQuaternion(new THREE.Quaternion())))).sub(_a) });
    // world -> rest pose through this bone: world = meshWorld * bindMatrixInverse * boneNow * boneInverse * rest, so
    // rest = boneRest * inverse(boneNow) * inverse(bindMatrixInverse) * inverse(meshWorld) * world. (three's "attached" bind
    // mode keeps bindMatrixInverse = inverse(meshWorld) NOW, not at bind: the bind matrix itself put her 33 cm off)
    toRest.set(S, new THREE.Matrix4().copy(C.bindW[S.i]).multiply(_m.copy(b0.matrixWorld).invert()).multiply(new THREE.Matrix4().copy(M.bindMatrixInverse).invert()).multiply(_mi));
  }
  const best = new Map(), s = [0, 0, 0];
  for (const [sd, list] of Object.entries(C.side)) for (const p of list) {
    M.getVertexPosition(p.i, _v); _v.applyMatrix4(M.matrixWorld);
    let near = null, nd = Infinity;
    for (const G of segW) { const t = Math.max(0, Math.min(1, _a.copy(_v).sub(G.p0).dot(G.d) / G.d.lengthSq())); const dd = _a.copy(G.p0).addScaledVector(G.d, t).distanceToSquared(_v); if (dd < nd) { nd = dd; near = G.S; } }
    _a.copy(_v).applyMatrix4(toRest.get(near)); s[0] = _a.x; s[1] = _a.y; s[2] = _a.z;
    if (!insideRest(C, s)) continue;
    const d = nearestSkin(C, s); if (d < minDepth || !isFinite(d)) continue;
    const key = sd + '|' + p.part + '|' + BODY[near.n], cur = best.get(key);
    if (!cur || d > cur.depth) best.set(key, { side: sd, part: p.part, into: BODY[near.n], depth: d, at: _v.toArray() });
  }
  return [...best.values()].sort((a, b) => b.depth - a.depth);
}
// (debugging: the rest-pose point and its ray crossings for a world point, through the body bone named `via`)
export function bodyClipProbe(C, world, via) {
  const S = C.segs.find((x) => x.n === via), b0 = C.bones[via];
  const m = new THREE.Matrix4().copy(C.bindW[S.i]).multiply(new THREE.Matrix4().copy(b0.matrixWorld).invert()).multiply(new THREE.Matrix4().copy(C.mesh.bindMatrixInverse).invert()).multiply(new THREE.Matrix4().copy(C.mesh.matrixWorld).invert());
  const p = new THREE.Vector3(...world).applyMatrix4(m), s = [p.x, p.y, p.z];
  return { rest: s.map((x) => +x.toFixed(3)), x: crossings(C, s, 0), z: crossings(C, s, 2), inside: insideRest(C, s), skin: nearestSkin(C, s), tris: C.tri.length / 3, boneRest: new THREE.Vector3().setFromMatrixPosition(C.bindW[S.i]).toArray().map((x) => +x.toFixed(3)) };
}
