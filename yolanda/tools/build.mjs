#!/usr/bin/env node
// Packs yolanda/src + yolanda/assets into the single-file offline game.
//   node tools/build.mjs [out.html]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? path.join(root, 'dist', 'Yolanda-Specialty-Medical-Center.html'));
const mime = { '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.md': 'text/markdown', '.txt': 'text/plain' };

const cache = path.join(root, 'dist', '.assets.packed');
let packed;
const newest = Math.max(...fs.readdirSync(path.join(root, 'assets'), { recursive: true }).map((f) => fs.statSync(path.join(root, 'assets', f)).mtimeMs), fs.statSync(path.join(root, 'tools', 'asset-index.json')).mtimeMs);
if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs > newest && !process.argv.includes('--fresh')) {
  packed = fs.readFileSync(cache, 'utf8');
} else {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'asset-index.json'), 'utf8'));
  const records = {};
  for (const [url, type] of manifest) {
    const file = path.join(root, 'assets', url);
    if (!fs.existsSync(file)) throw new Error('Missing asset ' + url);
    records[url] = { type, data: fs.readFileSync(file).toString('base64') };
  }
  packed = zlib.gzipSync(Buffer.from(JSON.stringify(records)), { level: 9 }).toString('base64');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, packed);
}

// Game code: src/game.js followed by any src/mods/*.js (executed inside the same closure, see tools/inject.mjs)
let code = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');
const modDir = path.join(root, 'src', 'mods');
const mods = fs.existsSync(modDir) ? fs.readdirSync(modDir).filter((f) => f.endsWith('.js')).sort() : [];
const modCode = mods.map((f) => `/* ---- mod: ${f} ---- */\n` + fs.readFileSync(path.join(modDir, f), 'utf8')).join('\n');
if (!code.includes('/*@@MODS@@*/')) throw new Error('game.js is missing the /*@@MODS@@*/ marker');
code = code.replace('/*@@MODS@@*/', () => modCode);
if (/<\/script/i.test(code)) throw new Error('game code contains </script');

const head = fs.readFileSync(path.join(root, 'src', 'shell-head.html'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'src', 'loader.html'), 'utf8');
const html = `${head}\n<script id="offline-assets" type="application/octet-stream">${packed}</script>\n<script id="offline-code" type="application/octet-stream">${code}</script>\n${loader}`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1e6).toFixed(1)} MB)`);
