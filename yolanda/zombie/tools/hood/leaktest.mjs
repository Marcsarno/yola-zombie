// Chapter 2's leak test: can the player (a 0.3 m circle) walk somewhere they shouldn't? Flood-fills a 0.25 m grid from a
// stop's start over the whole map against the exported collision (assets/neighborhood/hood_layout.json, the game's own
// HoodWorld), with the seals that are still shut at that point of the story shut, and checks every reached cell lies in
// the zones that stop allows. node tools/hood/leaktest.mjs [stop] [out leaks.json]
//   no stop: every stop in STOPS below; exit code 1 on any leak.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HoodWorld } from '../../src/hood/world.js';
import { ZONES, STOPS } from '../../src/hood/zones.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = JSON.parse(fs.readFileSync(path.resolve(here, '../../assets/neighborhood/hood_layout.json'), 'utf8'));
const [, , only, outFile] = process.argv;
const B = { minX: -75, maxX: 112, minZ: -130, maxZ: 100 }, CELL = 0.25, R = 0.3;
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const zoneOf = (x, z) => { for (const [id, P] of Object.entries(ZONES)) if (inPoly(x, z, P)) return id; return null; };

function flood(stop) {
  const w = new HoodWorld(B, L.cols);
  // seals still shut at this stop: every 'seal:<id>' whose id is not in stop.open (a seal is shut by default)
  for (const s of w.shapes) if (s.tag.startsWith('seal:') && (stop.open || []).includes(s.tag.slice(5))) s.off = true;
  const W = Math.ceil((B.maxX - B.minX) / CELL), H = Math.ceil((B.maxZ - B.minZ) / CELL);
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H);
  const idx = (x, z) => Math.floor((z - B.minZ) / CELL) * W + Math.floor((x - B.minX) / CELL);
  let head = 0, tail = 0; const s0 = idx(stop.start[0], stop.start[1]);
  if (w.blockedAt(stop.start[0], stop.start[1], R)) return { error: 'start is blocked' };
  seen[s0] = 1; q[tail++] = s0;
  const reach = {}, leaks = [];
  while (head < tail) {
    const c = q[head++], i = c % W, j = (c / W) | 0, x = B.minX + (i + 0.5) * CELL, z = B.minZ + (j + 0.5) * CELL;
    const zid = zoneOf(x, z) || 'OUTSIDE';
    reach[zid] = (reach[zid] || 0) + 1;
    if (!stop.zones.includes(zid)) leaks.push([+x.toFixed(2), +z.toFixed(2), zid]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni; if (seen[n]) continue; seen[n] = 1;
      if (!w.blockedAt(B.minX + (ni + 0.5) * CELL, B.minZ + (nj + 0.5) * CELL, R)) q[tail++] = n;
    }
  }
  // the points this stop needs: a reached cell within each one's radius
  const missing = [];
  for (const [name, rad] of stop.reach || []) {
    const m = L.marks[name]; if (!m) { missing.push(name + ' (no such mark)'); continue; }
    const [mx, , mz] = m; let ok = false;
    for (let dz = -rad; dz <= rad && !ok; dz += CELL) for (let dx = -rad; dx <= rad && !ok; dx += CELL) {
      if (dx * dx + dz * dz > rad * rad) continue;
      const x = mx + dx, z = mz + dz; if (x < B.minX || x >= B.maxX || z < B.minZ || z >= B.maxZ) continue;
      if (seen[idx(x, z)] && !w.blockedAt(x, z, R)) ok = true;
    }
    if (!ok) missing.push(name);
  }
  return { reach, leaks, cells: tail, missing };
}

let bad = 0; const report = {};
for (const [id, stop] of Object.entries(STOPS)) {
  if (only && only !== id) continue;
  const r = flood(stop);
  if (r.error) { console.log(id.padEnd(10), 'ERROR', r.error); bad++; continue; }
  const byZone = {}; for (const [, , z] of r.leaks) byZone[z] = (byZone[z] || 0) + 1;
  const ok = !r.leaks.length && !r.missing.length; if (!ok) bad++;
  console.log(id.padEnd(10), r.leaks.length ? 'LEAKS ' + JSON.stringify(byZone) : 'sealed', r.missing.length ? ' UNREACHABLE: ' + r.missing.join(', ') : ' all points reachable', ' reached', JSON.stringify(r.reach));
  if (!ok && r.leaks.length) { const first = r.leaks[0]; console.log('           first leak cell at', first[0], first[1]); }
  const metre = new Map(); for (const [x, z] of r.leaks) metre.set(Math.floor(x) + ',' + Math.floor(z), [Math.floor(x) + 0.5, Math.floor(z) + 0.5]);
  report[id] = { start: stop.start, cells: [...metre.values()], size: 1 };
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(only ? report[only] : report));
// the compressed copies the game loads (tools/hood/optimize.mjs): missing or older than their models means the game draws
// the original (missing) or an old version (stale) until optimize.mjs runs again
{
  const R = path.resolve(here, '../../assets/neighborhood'), t = (f) => fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0;
  const off = L.models.concat('hood_ground.glb').filter((f) => t(path.join(R, 'opt', f)) < t(path.join(R, f)));
  if (!L.opt) console.log('opt        OFF  the layout loads the originals: run node tools/hood/optimize.mjs <survive web/ dir>');
  else if (off.length) console.log('opt        STALE ' + off.length + ' compressed copies missing or old (' + off.slice(0, 4).join(', ') + (off.length > 4 ? ', ...' : '') + '): run node tools/hood/optimize.mjs <survive web/ dir>');
  else console.log('opt        ok   every compressed copy is current');
}
process.exit(bad ? 1 : 0);
