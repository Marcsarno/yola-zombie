// Prints a GLB's node names (with their translation), meshes and materials. node tools/hood/glbnodes.mjs <file.glb>
import fs from 'fs';
const b = fs.readFileSync(process.argv[2]);
const len = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + len).toString());
for (const n of J.nodes || []) console.log('node', n.name, n.translation ? n.translation.map((v) => +v.toFixed(3)).join(',') : '', n.mesh !== undefined ? 'mesh' : '', n.children ? 'children ' + n.children.length : '');
console.log('materials', (J.materials || []).map((m) => m.name).join(' | '));
