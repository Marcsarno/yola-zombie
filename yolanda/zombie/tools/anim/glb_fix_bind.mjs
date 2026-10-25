// Repair a skinned GLB whose bone nodes were exported with no transforms (every joint at the origin) while the inverse
// bind matrices kept the real rest pose in a turned, Z-up frame (the dropped armature root). Found 2026-10-20 on
// "Arianna 3.0 survival.glb" (Tripo rig, mixamorig names): bind x = forward, y = her left, z = up, origin at the hips,
// while the mesh is glTF Y-up (x = her left, y = up, z = forward, feet at y 0). The repair puts that frame back:
//   joint world (mesh space) = T * inverse(IBM),  T = translate(0, c, 0) * R,  R: (x, y, z)bind -> (y, z, x)mesh
// c (the hips' lift) is solved: each bone's segment must run through the vertices it holds (weight > 0.9).
// Then every bone node gets its local translation / rotation from that rest, and the IBMs are rewritten to match.
// usage: node tools/anim/glb_fix_bind.mjs <in.glb> <out.glb>
import fs from 'fs';
import * as THREE from 'three';

const [IN, OUT] = process.argv.slice(2);
const b = fs.readFileSync(IN);
const jlen = b.readUInt32LE(12), J = JSON.parse(b.subarray(20, 20 + jlen).toString());
const binOff = 20 + jlen + 8, binLen = b.readUInt32LE(20 + jlen);
const bin = Buffer.from(b.subarray(binOff, binOff + binLen));
const view = (accI) => {
  const a = J.accessors[accI], bv = J.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const ctor = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array }[a.componentType];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * ctor.BYTES_PER_ELEMENT;
  const get = (i, k) => {
    const o = start + i * stride + k * ctor.BYTES_PER_ELEMENT;
    return ctor === Float32Array ? bin.readFloatLE(o) : ctor === Uint16Array ? bin.readUInt16LE(o) : ctor === Uint8Array ? bin.readUInt8(o) : bin.readUInt32LE(o);
  };
  return { count: a.count, n, get, start, stride, a };
};
const skin = J.skins[0], joints = skin.joints, ibmV = view(skin.inverseBindMatrices);
const ibm = joints.map((_, k) => new THREE.Matrix4().fromArray(Array.from({ length: 16 }, (_, i) => ibmV.get(k, i))));
const bindW = ibm.map((m) => m.clone().invert()); // rest in the bind frame
const R = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1); // (x,y,z) -> (y,z,x)
const prim = J.meshes[0].primitives[0], P = view(prim.attributes.POSITION), Jn = view(prim.attributes.JOINTS_0), W = view(prim.attributes.WEIGHTS_0);
const par = {}; J.nodes.forEach((nd, i) => (nd.children || []).forEach((c) => (par[c] = i)));
const kOf = new Map(joints.map((ji, k) => [ji, k]));
const childK = joints.map((ji) => (J.nodes[ji].children || []).map((c) => kOf.get(c)).filter((x) => x != null));
// the vertices each bone holds firmly
const held = joints.map(() => []);
for (let i = 0; i < P.count; i++) for (let s = 0; s < 4; s++) if (W.get(i, s) > 0.9) held[Jn.get(i, s)].push(new THREE.Vector3(P.get(i, 0), P.get(i, 1), P.get(i, 2)));
const worldAt = (c) => { const T = new THREE.Matrix4().makeTranslation(0, c, 0).multiply(R); return bindW.map((m) => T.clone().multiply(m)); };
const cost = (c) => {
  const Wm = worldAt(c); let sum = 0, n = 0;
  joints.forEach((_, k) => {
    if (!childK[k].length || held[k].length < 5) return;
    const h = new THREE.Vector3().setFromMatrixPosition(Wm[k]), t = new THREE.Vector3().setFromMatrixPosition(Wm[childK[k][0]]);
    const seg = new THREE.Line3(h, t), q = new THREE.Vector3();
    const cen = held[k].reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / held[k].length);
    seg.closestPointToPoint(cen, true, q); sum += q.distanceToSquared(cen); n++;
  });
  return sum / n;
};
let best = 0, bc = Infinity;
for (let c = 0.2; c <= 0.8; c += 0.0005) { const v = cost(c); if (v < bc) { bc = v; best = c; } }
console.log('hips lift c =', best.toFixed(4), 'rms bone-to-held-vertices', Math.sqrt(bc).toFixed(4));
const Wm = worldAt(best);
// node locals from the rest (parents first)
const kW = new Map(joints.map((ji, k) => [ji, Wm[k]]));
for (const [k, ji] of joints.entries()) {
  const p = par[ji], pw = kW.get(p) || new THREE.Matrix4();
  const L = pw.clone().invert().multiply(Wm[k]);
  const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); L.decompose(t, q, s);
  const nd = J.nodes[ji]; nd.translation = t.toArray(); nd.rotation = q.toArray(); delete nd.scale; delete nd.matrix;
  if (Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) > 1e-3) console.log('scale on', nd.name, s.toArray());
}
// the IBMs: the inverse of the new rest
for (const [k] of joints.entries()) {
  const m = Wm[k].clone().invert().elements;
  for (let i = 0; i < 16; i++) bin.writeFloatLE(m[i], ibmV.start + k * ibmV.stride + i * 4);
}
for (const k of [0, joints.length - 1]) console.log(J.nodes[joints[k]].name, new THREE.Vector3().setFromMatrixPosition(Wm[k]).toArray().map((x) => x.toFixed(3)).join(', '));
const js = Buffer.from(JSON.stringify(J)); const pad = (4 - (js.length % 4)) % 4; const jsP = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsP.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsP.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(OUT, Buffer.concat([head, jh, jsP, bh, bin]));
console.log('WROTE', OUT);
