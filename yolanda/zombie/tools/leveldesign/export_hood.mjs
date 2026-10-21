// The level editor's copy of Chapter 2 (the private design repo, Marcsarno/yola-level-design: a phone editor on claude.ai).
// Writes <design repo>/levels/hood/: the layout (every placed model, the collision, the marks), the ground, the baked light,
// the textures, the game's own items (checkpoints, supplies, stops, zones), and every model again for the editor: the same
// diet as tools/hood/optimize.mjs but with no meshopt compression (its decoder is WebAssembly, which the claude.ai page may
// not run): positions quantised with KHR_mesh_quantization instead, which three.js reads natively. Also copies the game
// modules the editor reuses (materials, terrain shader, baked-light patch, collision world, leak-test zones) to
// <design repo>/editor/src/vendor/. Sources are never changed.
//   node tools/leveldesign/export_hood.mjs <design repo> <dir holding node_modules with @gltf-transform and sharp>
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { STOP_ORDER, STOP_STARTS, SUPPLIES } from '../../src/hood/level.js';
import { ZONES, STOPS } from '../../src/hood/zones.js';
import { GOALS, LINES } from '../../src/hood/script.js';

const [, , designDir, modsDir] = process.argv;
if (!designDir || !modsDir) { console.error('usage: export_hood.mjs <design repo> <node_modules dir>'); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url)), Z = path.resolve(here, '../..');
const R = path.join(Z, 'assets/neighborhood'), OUT = path.join(designDir, 'levels/hood'), VEND = path.join(designDir, 'editor/src/vendor');
const L = JSON.parse(fs.readFileSync(path.join(R, 'hood_layout.json'), 'utf8'));

// ---- the game modules the editor reuses (paths rewritten to the editor's files)
const vend = (from, to, fix = (s) => s) => { const s = fix(fs.readFileSync(path.join(Z, from), 'utf8')); fs.mkdirSync(path.dirname(path.join(VEND, to)), { recursive: true }); fs.writeFileSync(path.join(VEND, to), `// COPIED from the game (yola-zombie: yolanda/zombie/${from}) by tools/leveldesign/export_hood.mjs. Do not edit here.\n` + s); };
vend('src/hood/materials.js', 'hood/materials.js', (s) => s.replace("const TEX = 'assets/neighborhood/tex/';", "const TEX = 'levels/hood/tex/';"));
vend('src/hood/terrain.js', 'hood/terrain.js');
vend('src/hood/cutaway.js', 'hood/cutaway.js');
vend('src/hood/world.js', 'hood/world.js');
vend('src/hood/zones.js', 'hood/zones.js');
vend('src/core/world.js', 'core/world.js');

// ---- the models, for the editor
const req = createRequire(path.join(modsDir, 'package.json'));
const imp = async (n) => import('file:///' + req.resolve(n).replace(/\\/g, '/'));
const { NodeIO, PropertyType } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS } = await imp('@gltf-transform/extensions');
const { dedup, prune, weld, textureCompress, quantize } = await imp('@gltf-transform/functions');
const sharp = (await imp('sharp')).default; sharp.cache(false);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const PICKUPS = ['props/security_rifle.glb', 'models/boltcutters.glb', 'models/nb_fuel_can.glb', 'kit/military_crate.glb', 'models/loot_crate.glb', 'props/hospital_radio.glb'];
const files = [...new Set([...L.models, ...PICKUPS, 'hood_ground.glb'])];
let before = 0, after = 0;
for (const f of files) {
  const src = path.join(R, f), dst = path.join(OUT, f);
  if (!fs.existsSync(src)) { console.warn('missing', f); continue; }
  const b0 = fs.statSync(src).size; before += b0;
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(src).mtimeMs) { after += fs.statSync(dst).size; continue; }
  const doc = await io.read(src);
  const ground = f === 'hood_ground.glb';
  // (as optimize.mjs: never dedup materials, the kit's placeholders differ only by name; keep the empty marker nodes)
  const steps = [dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), prune({ keepLeaves: true, keepAttributes: true })];
  if (!ground) steps.push(weld());
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: b0 > 1.5 * 1048576 ? [1024, 1024] : [512, 512], quality: 80 }));
  if (!ground) steps.push(quantize({ pattern: /^POSITION$/, quantizePosition: 14 }));
  await doc.transform(...steps);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await io.write(dst, doc);
  after += fs.statSync(dst).size;
}
console.log(`models ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB (${files.length} files)`);

// ---- the textures and the light, as they are
fs.mkdirSync(path.join(OUT, 'tex'), { recursive: true });
for (const t of fs.readdirSync(path.join(R, 'tex'))) fs.copyFileSync(path.join(R, 'tex', t), path.join(OUT, 'tex', t));
fs.copyFileSync(path.join(R, 'hood_light.jpg'), path.join(OUT, 'hood_light.jpg'));

// ---- the layout (as exported from Blender) and the game's own items
const layout = { models: L.models, placed: L.placed, tags: L.tags, cols: L.cols, marks: L.marks };
fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layout));
const game = {
  stops: STOP_ORDER.map((id) => ({ id, start: STOP_STARTS[id] })),
  supplies: SUPPLIES, zones: ZONES, leak: STOPS, goals: GOALS,
  lines: Object.fromEntries(Object.entries(LINES).map(([k, v]) => [k, { who: v[0], text: v[1] }])),
  pickups: PICKUPS,
};
fs.writeFileSync(path.join(OUT, 'game.json'), JSON.stringify(game));

// ---- the version every edit is made against
let commit = 'unknown'; try { commit = execSync('git rev-parse --short HEAD', { cwd: Z }).toString().trim(); } catch { /* not a checkout */ }
const manPath = path.join(designDir, 'levels/manifest.json');
const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { levels: {} };
man.levels.hood = { name: "Chapter 2 · Marc's neighbourhood", kind: 'layout', game: commit, exported: new Date().toISOString() };
fs.writeFileSync(manPath, JSON.stringify(man, null, 2));
console.log('wrote', OUT, 'game', commit);
