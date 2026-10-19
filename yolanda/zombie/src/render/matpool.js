// Pooled materials (2026-10-19, the floors' draw calls): props that differ only in colour, or are separate copies of the
// same material, share one material, their colour moved into the geometry's vertex colour; merged, they are one draw. Floor
// 6's rooms carried 719 materials, 145 distinct, 6 textures. Left alone: transparent and alpha-tested ones, and any material
// marked userData.noPool (or named in `keep`). The Blood_* decals pool among themselves only, under a Blood_ name: the
// opening finds and hides them by that name (opening.js setBlood).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const POOL = new Map();
const tq = (t) => (t ? [t.source?.uuid, t.offset.x, t.offset.y, t.repeat.x, t.repeat.y, t.rotation, t.wrapS, t.wrapT, t.flipY, t.channel].join(',') : '-');
export function pooled(m, keep = null) {
  if (!m?.isMeshStandardMaterial || m.transparent || m.alphaTest > 0 || m.userData?.noPool || keep?.test(m.name || '')) return null;
  const blood = /^Blood_/i.test(m.name || '');
  const q = (v, k) => Math.round((v ?? 0) / k) * k;
  const key = [blood, m.type, tq(m.map), tq(m.normalMap), tq(m.emissiveMap), tq(m.roughnessMap), tq(m.metalnessMap), tq(m.aoMap), q(m.roughness, 0.05), q(m.metalness, 0.1), m.emissive?.getHexString(), q(m.emissiveIntensity, 0.05), q(m.envMapIntensity, 0.1), m.side, m.flatShading, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.depthWrite, m.depthTest].join('|');
  let P = POOL.get(key);
  if (!P) { P = m.clone(); P.color.setRGB(1, 1, 1); P.vertexColors = true; P.name = blood ? 'Blood_pool' : 'pool:' + (m.name || ''); POOL.set(key, P); }
  return P;
}
// a geometry piece drawn with `material`: its colour into vertex colour (times any it had), the pooled material back (or
// the material itself, when it is left alone)
export function poolPiece(material, g, keep = null) {
  const P = pooled(material, keep);
  if (!P) { if (g.attributes.color && !material.vertexColors) g.deleteAttribute('color'); return material; }
  const n = g.attributes.position.count, c = new Float32Array(n * 3), src = material.vertexColors ? g.attributes.color : null, mc = material.color;
  for (let i = 0; i < n; i++) { c[i * 3] = mc.r * (src ? src.getX(i) : 1); c[i * 3 + 1] = mc.g * (src ? src.getY(i) : 1); c[i * 3 + 2] = mc.b * (src ? src.getZ(i) : 1); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!P.map && !P.normalMap && !P.emissiveMap && !P.roughnessMap && !P.metalnessMap && !P.aoMap) g.deleteAttribute('uv'); // (untextured: one attribute set)
  return P;
}
// a whole model as one mesh per pooled material (its own space: the root's transform is kept off): a prop template
export function mergeModel(root, keep = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4(), by = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const mats = [].concat(o.material); M.multiplyMatrices(inv, o.matrixWorld);
    const g0 = o.geometry.clone().applyMatrix4(M), g = g0.index ? g0.toNonIndexed() : g0;
    const pieces = mats.length === 1 || !g0.groups.length ? [[mats[0], g]] : g0.groups.map((gr) => { const sub = new THREE.BufferGeometry(); for (const [n, a] of Object.entries(g.attributes)) sub.setAttribute(n, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize, a.normalized)); return [mats[gr.materialIndex], sub]; });
    for (let [m, piece] of pieces) {
      m = poolPiece(m, piece, keep);
      for (const n of Object.keys(piece.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) piece.deleteAttribute(n);
      const key = m.uuid + '|' + Object.keys(piece.attributes).sort().join(',');
      if (!by.has(key)) by.set(key, { m, geos: [] }); by.get(key).geos.push(piece);
    }
  });
  const out = new THREE.Group(); out.name = root.name;
  for (const { m, geos } of by.values()) { const g = mergeGeometries(geos, false); if (!g) continue; const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; out.add(mesh); }
  return out;
}
