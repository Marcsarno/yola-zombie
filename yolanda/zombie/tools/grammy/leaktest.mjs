// Chapter 4's leak test (Grammy's peninsula; as tools/hood/leaktest.mjs for Chapter 2): flood-fills a 0.5 m grid from the
// landing against the exported collision (assets/grammy/grammy_layout.json, the game's own HoodWorld), the guard gate shut
// and then open, and reports:
//   water     cells reached in the water (tools/grammy/water.json, written by blender/grammy/export_grammy.py): a leak
//   far       cells reached more than 20 m outside the plan's walkable area: a leak
//   outside   cells reached just outside it (the shore walk; for the eye)
//   missing   marks the story needs that can't be reached (her door, the gas can, the gate, the family car once it opens)
// node tools/grammy/leaktest.mjs [out.png [x0 z0 x1 z1 [run]]]   (the picture: reached green, leaks red, walls dark, water blue,
//   the zone yellow; a window of the map 4 px a cell; run 1 = the gate open)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { HoodWorld } from '../../src/hood/world.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = JSON.parse(fs.readFileSync(path.resolve(here, '../../assets/grammy/grammy_layout.json'), 'utf8'));
const WAT = JSON.parse(fs.readFileSync(path.resolve(here, 'water.json'), 'utf8'));
const [, , outPng, ...win] = process.argv;
const B = { minX: -150, maxX: 185, minZ: -265, maxZ: 95 }, CELL = 0.5, R = 0.3;
const Z = L.zone;
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
const zoneDist = (x, z) => { if (inPoly(x, z, Z)) return 0; let d = 1e9; for (let i = 0; i < Z.length; i++) d = Math.min(d, segD(x, z, Z[i], Z[(i + 1) % Z.length])); return d; };
const water = (x, z) => { const j = Math.floor((z - WAT.z0) / WAT.cell), i = Math.floor((x - WAT.x0) / WAT.cell); return WAT.rows[j]?.[i] === '1'; };

const onDeck = (x, z) => { const a = L.marks.landing, b = L.marks.boat; return a && b && segD(x, z, [a[0], a[2]], [b[0], b[2]]) < 2; };   // (the landing's deck, over the water)
function flood(open) {
  const w = new HoodWorld(B, L.cols);
  for (const s of w.shapes) if (s.tag.startsWith('seal:') && open.includes(s.tag.slice(5))) s.off = true;
  const W = Math.ceil((B.maxX - B.minX) / CELL), H = Math.ceil((B.maxZ - B.minZ) / CELL);
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H);
  const [sx, , sz] = L.marks.landing; const s0 = Math.floor((sz - B.minZ) / CELL) * W + Math.floor((sx - B.minX) / CELL);
  if (w.blockedAt(sx, sz, R)) return { error: 'the landing is blocked' };
  let head = 0, tail = 0; seen[s0] = 1; q[tail++] = s0;
  const out = { water: [], far: [], outside: 0, cells: 0, exits: new Map() };
  while (head < tail) {
    const c = q[head++], i = c % W, j = (c / W) | 0, x = B.minX + (i + 0.5) * CELL, z = B.minZ + (j + 0.5) * CELL;
    out.cells++; seen[c] = 2;
    if (water(x, z) && !onDeck(x, z)) out.water.push([x, z]);
    const d = zoneDist(x, z); if (d > 20) out.far.push([x, z]); else if (d > 0) out.outside++;
    if (d > 0 && d < 0.8 && !water(x, z)) { const k = Math.round(x / 6) * 6 + ',' + Math.round(z / 6) * 6; out.exits.set(k, (out.exits.get(k) || 0) + 1); }   // (where the walk crosses the zone's edge)
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni; if (seen[n]) continue; seen[n] = 1;
      if (!w.blockedAt(B.minX + (ni + 0.5) * CELL, B.minZ + (nj + 0.5) * CELL, R)) q[tail++] = n;
    }
  }
  const reach = (name, rad = 1.5) => {
    const m = L.marks[name]; if (!m) return false;
    for (let dz = -rad; dz <= rad; dz += CELL) for (let dx = -rad; dx <= rad; dx += CELL) {
      const x = m[0] + dx, z = m[2] + dz, i = Math.floor((x - B.minX) / CELL), j = Math.floor((z - B.minZ) / CELL);
      if (seen[j * W + i] === 2) return true;
    }
    return false;
  };
  out.reach = reach; out.seen = seen; out.W = W; out.H = H; out.world = w;
  return out;
}

let bad = 0;
const runs = [['gate shut', [], ['door_grandma', 'gas', 'beat_2', 'beat_3', 'beat_5', 'beat_6', 'gate_hold'], ['family_car']],
              ['gate open', ['gate'], ['family_car'], []]];
let pic = null;
for (const [name, open, need, mustNot] of runs) {
  const r = flood(open);
  if (r.error) { console.log(name.padEnd(10), 'ERROR', r.error); bad++; continue; }
  const missing = need.filter((m) => !r.reach(m, m === 'family_car' ? 3.5 : 1.5));
  const passed = mustNot.filter((m) => r.reach(m, 3.5));
  const ok = !r.water.length && !r.far.length && !missing.length && !passed.length; if (!ok) bad++;
  console.log(name.padEnd(10), ok ? 'sealed' : 'LEAKS', 'reached', r.cells, 'cells;', 'water', r.water.length, 'far', r.far.length, 'shore walk outside the zone', r.outside,
    missing.length ? '; UNREACHABLE: ' + missing.join(', ') : '', passed.length ? '; REACHED TOO EARLY: ' + passed.join(', ') : '');
  if (r.water.length) console.log('           first water cell', r.water[0]);
  if (r.far.length) console.log('           first far cell', r.far[0]);
  if (r.far.length || r.water.length) console.log('           the walk crosses the zone edge near', [...r.exits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ' (' + v + ')').join('  '));
  if (!pic || (win[4] === '1' && open.length)) pic = r;
}

// the picture (the first run): 1 px a cell
if (outPng && pic) {
  const { seen, world } = pic, SC = win.length >= 4 ? 4 : 1, [wx0, wz0, wx1, wz1] = win.length >= 4 ? win.slice(0, 4).map(Number) : [B.minX, B.minZ, B.maxX, B.maxZ];
  const PC = CELL / SC, W = Math.round((wx1 - wx0) / PC), H = Math.round((wz1 - wz0) / PC), px = Buffer.alloc((W * 3 + 1) * H);
  const cellOf = (x, z) => Math.floor((z - B.minZ) / CELL) * pic.W + Math.floor((x - B.minX) / CELL);
  for (let j = 0; j < H; j++) {
    px[j * (W * 3 + 1)] = 0;
    for (let i = 0; i < W; i++) {
      const x = wx0 + (i + 0.5) * PC, z = wz0 + (j + 0.5) * PC, o = j * (W * 3 + 1) + 1 + i * 3;
      let c = water(x, z) ? [90, 140, 190] : [226, 220, 200];
      if (world.blockedAt(x, z, 0)) c = [70, 70, 70];
      if (seen[cellOf(x, z)] === 2) c = water(x, z) || zoneDist(x, z) > 20 ? [230, 30, 30] : zoneDist(x, z) > 0 ? [150, 200, 110] : [120, 190, 90];
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
    }
  }
  const dot = (x, z, c, r = 3) => { const i0 = Math.floor((x - wx0) / PC), j0 = Math.floor((z - wz0) / PC); for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) if (i >= 0 && j >= 0 && i < W && j < H) { const o = j * (W * 3 + 1) + 1 + i * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; } };
  for (let k = 0; k < Z.length; k++) { const a = Z[k], b = Z[(k + 1) % Z.length], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / CELL); for (let t = 0; t <= n; t++) dot(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n, [230, 200, 0], SC > 1 ? 1 : 0); }
  for (const [, m] of Object.entries(L.marks)) dot(m[0], m[2], [20, 20, 160], 2);
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(t), d])) >>> 0, 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(outPng, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]));
  console.log('picture', outPng, W, 'x', H);
}
process.exit(bad ? 1 : 0);
