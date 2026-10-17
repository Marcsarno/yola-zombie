// The modular zombies' clothes riding their arms (2026-10-17, the user: "why does the gown attach to his hands at times"):
// in their rest pose the hands hang beside the hips, so the auto-skinning gave gown / scrubs vertices near the hands arm
// weights; an earlier fix (ef9a693) took the hand and forearm weights off and those vertices fell back onto the upper arm.
// When the arms lift (attack, reactions) a flap of cloth lifts with them.
//
// This rewrites ONLY the body mesh's skin weights, in place inside the GLB (same buffers, same sizes: nothing else in the
// file changes). A body vertex counts as "off the sleeve" when it carries arm-chain weight but lies further than SLEEVE
// from the upper arm / forearm bones, or below the waist; it takes its weights instead from the nearest body vertices
// that carry no arm weight (inverse-distance blend). Vertices at the outer edge of the sleeve (BLEND band) are eased
// between their own weights and that blend so the armpit does not tear. Distances in model units (the files are 1 tall).
//   node tools/anim/fix_gown_weights.mjs <in.glb> <out.glb> <body mesh node name>
import fs from 'fs';

const [IN, OUT, BODY] = process.argv.slice(2);
const SLEEVE = 0.075, BLEND = 0.02, WAIST = 0.6, K = 8;
const buf = fs.readFileSync(IN);
const jlen = buf.readUInt32LE(12), J = JSON.parse(buf.slice(20, 20 + jlen).toString());
const binStart = 20 + jlen + 8;
const view = (acc) => { const a = J.accessors[acc], bv = J.bufferViews[a.bufferView]; return { a, off: binStart + (bv.byteOffset || 0) + (a.byteOffset || 0), stride: bv.byteStride }; };
const node = J.nodes.find((n) => n.name === BODY && n.mesh !== undefined); if (!node) throw new Error('no node ' + BODY);
const skin = J.skins[node.skin], jointName = skin.joints.map((i) => J.nodes[i].name.replace(/^mixamorig:?/, ''));
// the joints' bind positions: the translation of each inverse bind matrix's inverse
const ibm = view(skin.inverseBindMatrices), head = {};
const inv = (m) => { // 4x4 column-major inverse (affine)
  const [a, b, c, , d, e, f, , g, h, i, , tx, ty, tz] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  const r = [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  return [-(r[0] * tx + r[3] * ty + r[6] * tz), -(r[1] * tx + r[4] * ty + r[7] * tz), -(r[2] * tx + r[5] * ty + r[8] * tz)];
};
jointName.forEach((n, k) => { const m = []; for (let q = 0; q < 16; q++) m.push(buf.readFloatLE(ibm.off + (k * 16 + q) * 4)); head[n] = inv(m); });
const ARM = new Set(jointName.filter((n) => /^(Left|Right)(Arm|ForeArm|Hand)/.test(n)));
const SEG = [['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand']];
const segd = (p) => Math.min(...SEG.map(([x, y]) => {
  const a = head[x], c = head[y], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ac[0] + ap[1] * ac[1] + ap[2] * ac[2]) / (ac[0] ** 2 + ac[1] ** 2 + ac[2] ** 2)));
  return Math.hypot(ap[0] - ac[0] * t, ap[1] - ac[1] * t, ap[2] - ac[2] * t);
}));
// every vertex of the body mesh (all its primitives), with its weights
const V = [];
for (const prim of J.meshes[node.mesh].primitives) {
  const P = view(prim.attributes.POSITION), Jt = view(prim.attributes.JOINTS_0), W = view(prim.attributes.WEIGHTS_0);
  if (Jt.a.componentType !== 5121 || W.a.componentType !== 5126) throw new Error('expects ubyte joints, float weights');
  for (let i = 0; i < P.a.count; i++) {
    const p = [0, 1, 2].map((c) => buf.readFloatLE(P.off + (i * 3 + c) * 4)), w = {};
    for (let c = 0; c < 4; c++) { const wt = buf.readFloatLE(W.off + (i * 4 + c) * 4); if (wt > 0) { const n = jointName[buf[Jt.off + i * 4 + c]]; w[n] = (w[n] || 0) + wt; } }
    const armW = Object.entries(w).reduce((s, [n, x]) => s + (ARM.has(n) ? x : 0), 0);
    V.push({ p, w, armW, d: segd(p), jOff: Jt.off + i * 4, wOff: W.off + i * 16 });
  }
}
const donors = V.filter((v) => v.armW < 0.01);
const blendFrom = (v) => { // the nearest arm-free body vertices, inverse-distance
  const near = donors.map((q) => [Math.hypot(q.p[0] - v.p[0], q.p[1] - v.p[1], q.p[2] - v.p[2]), q]).sort((a, b) => a[0] - b[0]).slice(0, K), out = {};
  let s = 0; for (const [d, q] of near) { const k = 1 / (d + 0.004); s += k; for (const [n, x] of Object.entries(q.w)) out[n] = (out[n] || 0) + x * k; }
  for (const n in out) out[n] /= s; return out;
};
let off = 0, eased = 0;
for (const v of V) {
  if (v.armW < 0.001) continue;
  const offSleeve = v.d > SLEEVE || v.p[1] < WAIST;
  const edge = !offSleeve && v.d > SLEEVE - BLEND ? (v.d - (SLEEVE - BLEND)) / BLEND : 0;
  if (!offSleeve && !edge) continue;
  const b = blendFrom(v), k = offSleeve ? 1 : edge, w = {};
  for (const n of new Set([...Object.keys(v.w), ...Object.keys(b)])) w[n] = (v.w[n] || 0) * (1 - k) + (b[n] || 0) * k;
  const top = Object.entries(w).sort((a, b2) => b2[1] - a[1]).slice(0, 4), s = top.reduce((t, [, x]) => t + x, 0);
  for (let c = 0; c < 4; c++) { const [n, x] = top[c] || [jointName[0], 0]; buf[v.jOff + c] = jointName.indexOf(n); buf.writeFloatLE(top[c] ? x / s : 0, v.wOff + c * 4); }
  if (offSleeve) off++; else eased++;
}
fs.writeFileSync(OUT, buf);
console.log(`${BODY}: ${V.length} verts, ${V.filter((v) => v.armW >= 0.001).length} on the arms; re-weighted off the arms: ${off}; eased at the sleeve edge: ${eased} -> ${OUT}`);
