// Where the player can step across a polygon's edge (the old playable boundary by default): flood from a start against the
// exported collision and print every reached cell outside the polygon that touches a reached cell inside it, merged into
// spots 2 m apart. node tools/hood/crossings.mjs <x> <z> [polygon.json]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HoodWorld } from '../../src/hood/world.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const L = JSON.parse(fs.readFileSync(path.resolve(here, '../../assets/neighborhood/hood_layout.json'), 'utf8'));
const [, , sx, sz, polyFile] = process.argv;
const POLY = polyFile ? JSON.parse(fs.readFileSync(polyFile, 'utf8')) : JSON.parse(fs.readFileSync(path.resolve(here, 'playable.json'), 'utf8'));
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const B = { minX: -75, maxX: 112, minZ: -100, maxZ: 100 }, CELL = 0.25, R = 0.3;
const w = new HoodWorld(B, L.cols);
const W = Math.ceil((B.maxX - B.minX) / CELL), H = Math.ceil((B.maxZ - B.minZ) / CELL);
const seen = new Uint8Array(W * H), q = new Int32Array(W * H);
const cx = (i) => B.minX + (i + 0.5) * CELL, cz = (j) => B.minZ + (j + 0.5) * CELL;
let head = 0, tail = 0; const s0 = Math.floor((+sz - B.minZ) / CELL) * W + Math.floor((+sx - B.minX) / CELL); seen[s0] = 1; q[tail++] = s0;
const spots = [];
while (head < tail) {
  const c = q[head++], i = c % W, j = (c / W) | 0, inside = inPoly(cx(i), cz(j), POLY);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
    const n = nj * W + ni; if (seen[n]) continue;
    if (w.blockedAt(cx(ni), cz(nj), R)) continue;
    seen[n] = 1; q[tail++] = n;
    if (inside && !inPoly(cx(ni), cz(nj), POLY)) { const p = [+cx(ni).toFixed(1), +cz(nj).toFixed(1)]; if (!spots.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 2)) spots.push(p); }
  }
}
console.log(spots.length + ' crossing spots:'); for (const s of spots) console.log('  ', s.join(', '));
