// Chapter 2's download diet (polish pass 4): every model the layout places (and the pickups / props the code loads) is
// written again to assets/neighborhood/opt/<same path>: duplicates merged, unused data pruned, vertices welded, embedded
// textures resized to 1024 px (512 for small props) and stored as WebP (the game loads them
// from opt/: src/hood/view.js). Sources stay as they are. Run after export_layout.py:
//   node tools/hood/optimize.mjs <dir holding node_modules with @gltf-transform, meshoptimizer and sharp>
// (the old Survive project's web/ has all three: its tools/prepare-assets.mjs used them)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const [, , modsDir] = process.argv;
const req = createRequire(path.join(modsDir, 'package.json'));
const imp = async (n) => import('file:///' + req.resolve(n).replace(/\\/g, '/'));
const { NodeIO } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS } = await imp('@gltf-transform/extensions');
const { dedup, prune, weld, textureCompress, resample, meshopt } = await imp('@gltf-transform/functions');
const { PropertyType } = await imp('@gltf-transform/core');
const { MeshoptEncoder, MeshoptDecoder } = await imp('meshoptimizer');
const sharp = (await imp('sharp')).default;
sharp.cache(false);

const here = path.dirname(fileURLToPath(import.meta.url)), R = path.resolve(here, '../../assets/neighborhood'), OUT = path.join(R, 'opt');
const L = JSON.parse(fs.readFileSync(path.join(R, 'hood_layout.json'), 'utf8'));
const files = [...new Set([...L.models, 'props/security_rifle.glb', 'models/boltcutters.glb', 'models/nb_fuel_can.glb', 'kit/military_crate.glb', 'models/loot_crate.glb', 'props/hospital_radio.glb', 'hood_ground.glb'])];
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
let before = 0, after = 0;
for (const f of files) {
  const src = path.join(R, f), dst = path.join(OUT, f);
  if (!fs.existsSync(src)) continue;
  const b0 = fs.statSync(src).size; before += b0;
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(src).mtimeMs) { after += fs.statSync(dst).size; continue; }
  const doc = await io.read(src);
  const big = b0 > 1.5 * 1048576;
  // (the ground keeps its own vertices: no weld/meshopt on it, its UVs and kerb seams are exact)
  const ground = f === 'hood_ground.glb';
  // (dedup never merges materials: the kit's placeholders are identical but for their names, and the name is the paint)
  const steps = [dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), prune({ keepLeaves: true, keepAttributes: true }), resample()]; // (keepLeaves: the empty marker nodes the game reads: grips, muzzle, the gate's hinges)
  if (!ground) steps.push(weld());
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: big ? [1024, 1024] : [512, 512], quality: 82 }));
  // (meshopt quantises positions only (quantised normals turned a flat floor decal black): the kit's UVs are in texture tiles; quantised, they'd be rescaled
  // into a texture transform the swapped materials never read)
  if (!ground) steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium', pattern: /^POSITION$/ }));
  await doc.transform(...steps);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await io.write(dst, doc);
  const b1 = fs.statSync(dst).size; after += b1;
  if (b0 > 512 * 1024) console.log(`${f}: ${(b0 / 1048576).toFixed(1)} -> ${(b1 / 1048576).toFixed(2)} MB`);
}
L.opt = true; fs.writeFileSync(path.join(R, 'hood_layout.json'), JSON.stringify(L));
console.log(`models ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB (${files.length} files)`);
