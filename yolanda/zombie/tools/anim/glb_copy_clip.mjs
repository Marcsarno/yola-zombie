// Copy animation clips from one skeleton-only GLB into another, byte for byte, matching the animated nodes by name.
// node tools/anim/glb_copy_clip.mjs <from.glb> <into.glb> <clip> [<clip> ...]
// (2026-10-18: Quaternius UAL2 Sword_Block from the Rig Lab's test bake into assets/yola2_ual.glb, the bat's idle stance)
import fs from 'node:fs';

const [from, into, ...clips] = process.argv.slice(2);
if (!from || !into || !clips.length) { console.error('usage: glb_copy_clip.mjs <from.glb> <into.glb> <clip>...'); process.exit(1); }
const read = (f) => {
  const b = fs.readFileSync(f), jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl, bl = b.readUInt32LE(bo);
  return { json, bin: b.subarray(bo + 8, bo + 8 + bl) };
};
const A = read(from), B = read(into);
const byName = new Map(B.json.nodes.map((n, i) => [n.name, i]));
const chunks = [B.bin]; let len = B.bin.length;
const pad4 = () => { const p = (4 - (len % 4)) % 4; if (p) { chunks.push(Buffer.alloc(p)); len += p; } };
const accMap = new Map();
function copyAccessor(ai) {
  if (accMap.has(ai)) return accMap.get(ai);
  const acc = A.json.accessors[ai], bv = A.json.bufferViews[acc.bufferView];
  const comp = { 5126: 4, 5123: 2, 5121: 1, 5125: 4, 5122: 2, 5120: 1 }[acc.componentType];
  const ncomp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  const stride = bv.byteStride || comp * ncomp, start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = Buffer.alloc(acc.count * comp * ncomp);
  for (let i = 0; i < acc.count; i++) A.bin.copy(out, i * comp * ncomp, start + i * stride, start + i * stride + comp * ncomp);
  pad4();
  B.json.bufferViews.push({ buffer: 0, byteOffset: len, byteLength: out.length }); chunks.push(out); len += out.length;
  const na = { ...acc, bufferView: B.json.bufferViews.length - 1 }; delete na.byteOffset;
  B.json.accessors.push(na); accMap.set(ai, B.json.accessors.length - 1);
  return B.json.accessors.length - 1;
}
for (const name of clips) {
  const an = A.json.animations.find((a) => a.name === name); if (!an) { console.error('no clip', name, 'in', from); process.exit(1); }
  if (B.json.animations?.some((a) => a.name === name)) { console.log('already there:', name); continue; }
  const samplers = [], channels = [], sMap = new Map(); let skipped = 0;
  for (const ch of an.channels) {
    const nn = A.json.nodes[ch.target.node].name, ti = byName.get(nn);
    if (ti === undefined) { skipped++; continue; }
    if (!sMap.has(ch.sampler)) {
      const s = an.samplers[ch.sampler];
      samplers.push({ input: copyAccessor(s.input), output: copyAccessor(s.output), interpolation: s.interpolation || 'LINEAR' }); sMap.set(ch.sampler, samplers.length - 1);
    }
    channels.push({ sampler: sMap.get(ch.sampler), target: { node: ti, path: ch.target.path } });
  }
  (B.json.animations ||= []).push({ name, samplers, channels });
  console.log('copied', name, channels.length, 'channels', skipped ? `(${skipped} for nodes not in the target, skipped)` : '');
}
pad4();
const bin = Buffer.concat(chunks, len); B.json.buffers[0].byteLength = bin.length;
let js = Buffer.from(JSON.stringify(B.json), 'utf8'); const jp = (4 - (js.length % 4)) % 4; if (jp) js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(into, Buffer.concat([head, jh, js, bh, bin]));
console.log('wrote', into, fs.statSync(into).size, 'bytes');
