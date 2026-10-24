// Chapter 2's pictures as KTX2 (2026-10-24, Marc's three.js research: "KTX2 for textures"): a WebP or JPEG is unpacked to
// full size on the GPU (4 bytes a pixel, ~540 MB for the chapter); a KTX2 picture stays packed there (1 byte a pixel on an
// iPhone: ASTC; BC7 on a PC), mipmaps made here. Every model Chapter 2 loads from assets/neighborhood/opt/ (after
// optimize.mjs) is written again to opt/ktx/<same path>, and the zombies Chapter 2 uses to opt/ktx/zombies/; the game
// takes those when they are there (src/hood/ktx.js; ?ktx=0: the old files). Sources stay as they are.
//   node tools/hood/ktx2.mjs <dir holding node_modules with @gltf-transform, meshoptimizer and sharp> [only-this-substring]
// Needs KTX-Software 4.4 (toktx) in C:\Program Files\KTX-Software\bin or on PATH.
// Mode: UASTC for every picture (near the source). ETC1S makes the map ~30% smaller to download but blotched the house's
// pale stucco with green and pink (shots/ktx_house_3way.png, 2026-10-24); MAP=etc1s still writes the map's colour that way.
// The surface detail (normal, roughness...) is at half the colour's size, as texfit.js sized it at load.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const [, , modsDir, only] = process.argv;
const req = createRequire(path.join(modsDir, 'package.json'));
const imp = async (n) => import('file:///' + req.resolve(n).replace(/\\/g, '/'));
const { NodeIO } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRTextureBasisu } = await imp('@gltf-transform/extensions');
const { getTextureColorSpace } = await imp('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = await imp('meshoptimizer');
const sharp = (await imp('sharp')).default;
sharp.cache(false);

const TOKTX = ['C:\\Program Files\\KTX-Software\\bin\\toktx.exe', 'toktx'].find((p) => p === 'toktx' || fs.existsSync(p));
const here = path.dirname(fileURLToPath(import.meta.url)), Z = path.resolve(here, '../..'), R = path.join(Z, 'assets/neighborhood'), OPT = path.join(R, 'opt'), OUT = path.join(OPT, 'ktx');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ktx2-'));

// one picture -> KTX2 bytes. cap: its largest side (people 1024, as texfit.js did at load); sides kept to multiples of 4
async function encode(bytes, { srgb, mode, cap }) {
  const md = await sharp(bytes).metadata();
  let w = md.width, h = md.height; const s = Math.min(1, cap / Math.max(w, h));
  w = Math.max(4, Math.round((w * s) / 4) * 4); h = Math.max(4, Math.round((h * s) / 4) * 4);
  const png = path.join(TMP, 'in.png'), out = path.join(TMP, 'out.ktx2');
  await sharp(bytes).resize(w, h, { fit: 'fill' }).png().toFile(png);
  const args = ['--t2', '--genmipmap', '--assign_oetf', srgb ? 'srgb' : 'linear'];
  if (mode === 'uastc') args.push('--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', process.env.RDO || '0.5', '--zcmp', '18');
  else args.push('--encode', 'etc1s', '--clevel', '2', '--qlevel', '160');
  execFileSync(TOKTX, [...args, out, png], { stdio: ['ignore', 'ignore', 'pipe'] });
  return { data: fs.readFileSync(out), w, h };
}

// every picture in one model; kind: 'people' | 'map' (only the map can be ETC1S)
async function convert(src, dst, kind, cap) {
  const doc = await io.read(src);
  let n = 0;
  for (const t of doc.getRoot().listTextures()) {
    if (t.getMimeType() === 'image/ktx2' || !t.getImage()) continue;
    const srgb = getTextureColorSpace(t) === 'srgb';
    const mode = kind === 'map' && srgb && process.env.MAP === 'etc1s' ? 'etc1s' : 'uastc';
    const { data } = await encode(Buffer.from(t.getImage()), { srgb, mode, cap: srgb ? cap : cap / 2 });
    t.setImage(data).setMimeType('image/ktx2'); if (t.getURI()) t.setURI(t.getURI().replace(/\.\w+$/, '.ktx2')); n++;
  }
  if (n) doc.createExtension(KHRTextureBasisu).setRequired(true);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await io.write(dst, doc);
  return n;
}

const jobs = [];
// the map: every model optimize.mjs wrote (opt/<path>.glb; the kit's own pictures, tex/ and opt/tex/, stay WebP: materials.js)
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'ktx' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
for (const f of walk(OPT).filter((f) => f.endsWith('.glb'))) {
  const rel = path.relative(OPT, f).replace(/\\/g, '/');
  jobs.push({ src: f, dst: path.join(OUT, rel), kind: rel.startsWith('survivors/') ? 'people' : 'map', cap: rel.startsWith('survivors/') ? 1024 : 512, rel });
}
// the zombies Chapter 2 spawns (main.js ZOMBIE_TYPES with hood: true)
// (read from main.js: every ZOMBIE_TYPES line with hood: true; the game asks for opt/ktx/zombies/<file name>)
for (const m of fs.readFileSync(path.join(Z, 'src/main.js'), 'utf8').matchAll(/\{ file: '([^']+\.glb)'[^\n]*hood: true/g)) {
  const b = path.basename(m[1]); jobs.push({ src: path.join(Z, m[1]), dst: path.join(OUT, 'zombies', b), kind: 'people', cap: 1024, rel: 'zombies/' + b });
}

let before = 0, after = 0, pics = 0;
for (const j of jobs) {
  if (only && !j.rel.includes(only)) continue;
  if (!process.env.FORCE && fs.existsSync(j.dst) && fs.statSync(j.dst).mtimeMs > fs.statSync(j.src).mtimeMs) { before += fs.statSync(j.src).size; after += fs.statSync(j.dst).size; continue; }
  const n = await convert(j.src, j.dst, j.kind, j.cap); pics += n;
  const b0 = fs.statSync(j.src).size, b1 = fs.statSync(j.dst).size; before += b0; after += b1;
  if (n) console.log(`${j.rel}: ${n} pictures, ${(b0 / 1048576).toFixed(2)} -> ${(b1 / 1048576).toFixed(2)} MB`);
}
fs.rmSync(TMP, { recursive: true, force: true });
// the list the game reads (src/hood/ktx.js): only what has a copy, so no file is asked for twice
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(jobs.filter((j) => fs.existsSync(j.dst)).map((j) => j.rel).sort()));
console.log(`${pics} pictures; files ${(before / 1048576).toFixed(1)} -> ${(after / 1048576).toFixed(1)} MB`);
