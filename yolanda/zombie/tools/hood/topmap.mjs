// Top-down map of the neighbourhood's collision (from assets/neighborhood/hood_layout.json), for planning blockers and for
// the leak test's results. node tools/hood/topmap.mjs <out.svg> [x0 z0 x1 z1] [leaks.json]
// Boxes and circles coloured by tag; MARKS as dots; leak cells (if given) in red.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const L = JSON.parse(fs.readFileSync(path.resolve(here, '../../assets/neighborhood/hood_layout.json'), 'utf8'));
const [, , out, ...rest] = process.argv;
const [X0, Z0, X1, Z1] = rest.length >= 4 ? rest.slice(0, 4).map(Number) : [-70, -96, 110, 96];
const leaks = rest[4] ? JSON.parse(fs.readFileSync(rest[4], 'utf8')) : null;
const S = Math.min(2400 / (X1 - X0), 2400 / (Z1 - Z0));
const px = (x) => ((x - X0) * S).toFixed(1), pz = (z) => ((z - Z0) * S).toFixed(1);
const col = (tag) => /^bld|^safehere|^club/.test(tag) ? '#8a8a8a' : /^water/.test(tag) ? '#4a8fb0' : /^tree/.test(tag) ? '#3f8a3a' : /^boundary/.test(tag) ? '#b33' : /^prop:car|^prop:car3/.test(tag) ? '#d07a20' : /^fence|^gate/.test(tag) ? '#7a4a20' : /^seal|^block/.test(tag) ? '#e01060' : '#5a5a9a';
const o = [`<svg xmlns="http://www.w3.org/2000/svg" width="${((X1 - X0) * S).toFixed(0)}" height="${((Z1 - Z0) * S).toFixed(0)}" font-family="Arial"><rect width="100%" height="100%" fill="#e8e2cc"/>`];
for (let g = Math.ceil(X0 / 10) * 10; g <= X1; g += 10) o.push(`<line x1="${px(g)}" y1="0" x2="${px(g)}" y2="100%" stroke="#d4cdb4" stroke-width="1"/><text x="${+px(g) + 2}" y="12" font-size="10" fill="#998">${g}</text>`);
for (let g = Math.ceil(Z0 / 10) * 10; g <= Z1; g += 10) o.push(`<line x1="0" y1="${pz(g)}" x2="100%" y2="${pz(g)}" stroke="#d4cdb4" stroke-width="1"/><text x="2" y="${+pz(g) - 2}" font-size="10" fill="#998">${g}</text>`);
if (leaks) { const h = (leaks.size || 0.5) / 2; for (const [x, z] of leaks.cells || []) o.push(`<rect x="${px(x - h)}" y="${pz(z - h)}" width="${(2 * h * S).toFixed(1)}" height="${(2 * h * S).toFixed(1)}" fill="${leaks.color || '#ff0000'}" opacity="0.3"/>`); }
for (const [k, tag, cx, cz, a, b, yaw, h] of L.cols) {
  if (cx < X0 - 30 || cx > X1 + 30 || cz < Z0 - 30 || cz > Z1 + 30) continue;
  if (k === 'c') { o.push(`<circle cx="${px(cx)}" cy="${pz(cz)}" r="${(a * S).toFixed(1)}" fill="${col(tag)}" opacity="0.8"/>`); continue; }
  const deg = (-yaw * 180) / Math.PI; // (three.js yaw turns +x toward -z: on the map, counter-clockwise)
  o.push(`<rect x="${px(cx - a)}" y="${pz(cz - b)}" width="${(2 * a * S).toFixed(1)}" height="${(2 * b * S).toFixed(1)}" fill="${col(tag)}" opacity="${h < 1.0 ? 0.45 : 0.85}" transform="rotate(${deg.toFixed(2)} ${px(cx)} ${pz(cz)})"><title>${tag} h${h}</title></rect>`);
}
for (const [n, [x, , z]] of Object.entries(L.marks || {})) o.push(`<circle cx="${px(x)}" cy="${pz(z)}" r="4" fill="#0a0"/><text x="${+px(x) + 5}" y="${+pz(z) + 4}" font-size="11" fill="#060">${n}</text>`);
if (leaks?.start) o.push(`<circle cx="${px(leaks.start[0])}" cy="${pz(leaks.start[1])}" r="7" fill="#00f"/>`);
o.push('</svg>');
fs.writeFileSync(out, o.join('\n'));
console.log('wrote', out);
