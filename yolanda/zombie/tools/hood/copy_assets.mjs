// Copies the neighbourhood's models and textures from the old "Survive: The Clubhouse" project (read-only) into
// assets/neighborhood/. Usage: node tools/hood/copy_assets.mjs <old web/public/assets> <placements.json> [extra names...]
// Copies every model the old level placed (+ its .colliders.json sidecar), the extra names given, and every texture.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const [, , oldAssets, placementsFile, ...extra] = process.argv;
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(here, '../../assets/neighborhood');
const { placements } = JSON.parse(fs.readFileSync(placementsFile, 'utf8'));
const files = new Set(placements.map((p) => p.src.replace(/^assets\//, '')));
for (const e of extra) files.add(e);
let bytes = 0, n = 0;
const copy = (rel) => {
  const from = path.join(oldAssets, rel), to = path.join(dest, rel);
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  bytes += fs.statSync(to).size; n++;
  return true;
};
for (const rel of files) {
  if (!copy(rel)) console.warn('missing', rel);
  copy(rel.replace(/\.glb$/, '.colliders.json'));
}
for (const t of fs.readdirSync(path.join(oldAssets, 'tex'))) copy('tex/' + t);
console.log(`${n} files, ${(bytes / 1048576).toFixed(1)} MB -> ${dest}`);
