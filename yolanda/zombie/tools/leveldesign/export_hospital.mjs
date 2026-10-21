// The level editor's copy of Chapter 1 and the opening (after tools/leveldesign/capture.html, see capture.js):
// writes <design repo>/levels/floor7|floor6|floor5/ (shell.glb: the captured floor without its props; props.json: every
// prop's placement and the game's own data for it; level.json: rooms, the game's items and the collision) and
// levels/opening/shell.glb (the clinic, outside and in), plus levels/hospital/models/ (each prop model once, for the
// editor: textures to WebP, positions quantised, no meshopt). Sources are never changed.
//   node tools/leveldesign/export_hospital.mjs <design repo> <dir holding node_modules with @gltf-transform and sharp>
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { FLOORS } from '../../src/core/chapter.js';
import { liftBoxes } from '../../src/core/chapter.js';
import { doorBox } from '../../src/core/layout.js';

const [, , designDir, modsDir] = process.argv;
if (!designDir || !modsDir) { console.error('usage: export_hospital.mjs <design repo> <node_modules dir>'); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url)), Z = path.resolve(here, '../..'), Y = path.resolve(Z, '..');
const SHOTS = path.join(Z, 'shots'), OUT = path.join(designDir, 'levels');
const req = createRequire(path.join(modsDir, 'package.json'));
const imp = async (n) => import('file:///' + req.resolve(n).replace(/\\/g, '/'));
const { NodeIO, PropertyType } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS } = await imp('@gltf-transform/extensions');
const { dedup, prune, weld, textureCompress, quantize } = await imp('@gltf-transform/functions');
const sharp = (await imp('sharp')).default; sharp.cache(false);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function slim(src, dst, { big = false, keepVerts = false } = {}) {
  const doc = src.endsWith('.txt') ? await io.readBinary(new Uint8Array(fs.readFileSync(src))) : await io.read(src);
  const steps = [dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), prune({ keepLeaves: true, keepAttributes: true })];
  if (!keepVerts) steps.push(weld());
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: big ? [1024, 1024] : [512, 512], quality: 80 }));
  steps.push(quantize({ pattern: /^POSITION$/, quantizePosition: 14 }));
  await doc.transform(...steps);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await io.write(dst, doc);
  return fs.statSync(dst).size;
}
const MB = (b) => (b / 1048576).toFixed(1) + ' MB';

// ---- the shells
for (const n of [7, 6, 5]) {
  const s = await slim(path.join(SHOTS, `hosp_floor${n}_glb.txt`), path.join(OUT, `floor${n}/shell.glb`), { big: true, keepVerts: true });
  console.log('floor', n, 'shell', MB(s));
}
if (fs.existsSync(path.join(SHOTS, 'opening_glb.txt'))) console.log('opening shell', MB(await slim(path.join(SHOTS, 'opening_glb.txt'), path.join(OUT, 'opening/shell.glb'), { big: true, keepVerts: true })));

// ---- the props' models (once each)
const props = JSON.parse(fs.readFileSync(path.join(SHOTS, 'hosp_props.json'), 'utf8'));
const files = [...new Set(props.map((p) => p.m))];
let total = 0;
for (const m of files) {
  const src = path.join(Y, m), dst = path.join(OUT, 'hospital/models', m.replace(/^zombie\//, ''));
  if (!fs.existsSync(src)) { console.warn('missing', m); continue; }
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(src).mtimeMs) { total += fs.statSync(dst).size; continue; }
  total += await slim(src, dst, { big: fs.statSync(src).size > 1.5 * 1048576 });
}
console.log('prop models', files.length, MB(total));

// ---- each floor: its props, rooms, the game's items and the collision
const rnd = (v) => Math.round(v * 1000) / 1000;
for (const n of [7, 6, 5]) {
  const F = FLOORS[n];
  const mine = props.filter((p) => p.floor === n).map((p) => ({ ...p, file: p.m.replace(/^zombie\//, '') }));
  const items = [];
  for (const q of F.pickups || []) items.push({ id: 'pickup:' + q.id, kind: 'pickup', label: q.label || q.kind, icon: '🔫', x: q.x, y: q.y || 0, z: q.z });
  for (const g of F.groups || []) (g.zombies || []).forEach((zb, k) => items.push({ id: 'zombie:' + g.id + ':' + k, kind: 'zombie', label: 'Zombie (' + g.id + ')', icon: '🧟', x: zb.x, y: 0, z: zb.z }));
  for (const q of F.interact || []) items.push({ id: 'use:' + q.id, kind: 'interact', label: q.label, icon: '🚪', x: q.x, y: 0, z: q.z });
  if (F.playerStart) items.push({ id: 'start', kind: 'start', label: 'Player start', icon: '🚩', x: F.playerStart.x, y: 0, z: F.playerStart.z });
  if (F.lift) items.push({ id: 'lift', kind: 'lift', label: 'The lift', icon: '🛗', x: F.lift.x, y: 0, z: F.lift.z + 1 });
  const cols = [];
  for (const [x0, x1, z0, z1, h] of F.walls) cols.push(['b', 'wall', rnd((x0 + x1) / 2), rnd((z0 + z1) / 2), rnd((x1 - x0) / 2), rnd((z1 - z0) / 2), 0, h]);
  for (const d of F.doors) { if (d.kind === 'open' || d.kind === 'lift') continue; const [a, b, c, e] = doorBox(d); cols.push(['b', 'door:' + d.id, rnd((a + b) / 2), rnd((c + e) / 2), rnd((b - a) / 2), rnd((e - c) / 2), 0, 2.7]); }
  if (F.lift) { const LB = liftBoxes(F.lift); for (const [a, b, c, e] of [...LB.walls, LB.doors]) cols.push(['b', 'lift', rnd((a + b) / 2), rnd((c + e) / 2), rnd((b - a) / 2), rnd((e - c) / 2), 0, 2.7]); }
  const rooms = (F.rooms || []).filter((r) => r.floorN === n || r.floorN === undefined).map((r) => { const [x0, x1, z0, z1] = r.rects[0]; return { id: r.id, name: r.name, x: rnd((x0 + x1) / 2), z: rnd((z0 + z1) / 2) }; });
  const level = { floor: n, bounds: F.bounds, start: F.playerStart, rooms, items, cols };
  fs.mkdirSync(path.join(OUT, 'floor' + n), { recursive: true });
  fs.writeFileSync(path.join(OUT, `floor${n}/props.json`), JSON.stringify(mine));
  fs.writeFileSync(path.join(OUT, `floor${n}/level.json`), JSON.stringify(level));
  console.log('floor', n, mine.length, 'props,', rooms.length, 'rooms,', items.length, 'items,', cols.length, 'boxes');
}

let commit = 'unknown'; try { commit = execSync('git rev-parse --short HEAD', { cwd: Z }).toString().trim(); } catch { /* not a checkout */ }
const manPath = path.join(OUT, 'manifest.json');
const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { levels: {} };
const now = new Date().toISOString();
man.levels.opening = { name: 'The opening · Yola’s Medical Center', kind: 'shell', game: commit, exported: now };
for (const n of [7, 6, 5]) man.levels['floor' + n] = { name: 'Floor ' + n, kind: 'hospital', game: commit, exported: now };
fs.writeFileSync(manPath, JSON.stringify(man, null, 2));
console.log('done, game', commit);
