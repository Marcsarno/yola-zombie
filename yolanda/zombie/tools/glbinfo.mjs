// Measure GLB files without a browser: world-space bounds (glTF axes: +Y up), named nodes and animation clips.
// Usage: node tools/glbinfo.mjs file.glb [more.glb ...] [--nodes]
import fs from 'node:fs';
import * as THREE from 'three';

const showNodes = process.argv.includes('--nodes');
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const b = fs.readFileSync(f);
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + len).toString());
  const box = new THREE.Box3();
  const mats = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const m = new THREE.Matrix4();
    if (n.matrix) m.fromArray(n.matrix);
    else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
    const w = parent.clone().multiply(m);
    if (n.mesh !== undefined) {
      for (const p of j.meshes[n.mesh].primitives) {
        const a = j.accessors[p.attributes.POSITION];
        if (!a.min) continue;
        for (let k = 0; k < 8; k++) {
          const v = new THREE.Vector3(k & 1 ? a.max[0] : a.min[0], k & 2 ? a.max[1] : a.min[1], k & 4 ? a.max[2] : a.min[2]).applyMatrix4(w);
          box.expandByPoint(v);
        }
      }
    }
    if (showNodes) mats.push(`${'  '.repeat(depth(ni))}${n.name || '?'}${n.mesh !== undefined ? ' [mesh]' : ''} t=${(n.translation || [0, 0, 0]).map((x) => x.toFixed(3)).join(',')}`);
    for (const c of n.children || []) walk(c, w);
  };
  const parents = {}; j.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parents[c] = i)));
  const depth = (i) => { let d = 0; while (parents[i] !== undefined) { i = parents[i]; d++; } return d; };
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, new THREE.Matrix4());
  const s = box.getSize(new THREE.Vector3());
  const fmt = (v) => v.toArray().map((x) => x.toFixed(2)).join(', ');
  console.log(`${f.split(/[\\/]/).pop()}: size [${fmt(s)}] min [${fmt(box.min)}] max [${fmt(box.max)}]` + (j.animations?.length ? ` clips: ${j.animations.map((a) => a.name).join(', ')}` : ''));
  if (showNodes) console.log(mats.join('\n'));
}
