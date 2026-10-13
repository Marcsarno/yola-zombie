// Syntax-checks the assembled game code (game.js + mods) without a browser.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let code = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');
const modDir = path.join(root, 'src', 'mods');
const mods = fs.readdirSync(modDir).filter((f) => f.endsWith('.js')).sort();
code = code.replace('/*@@MODS@@*/', () => mods.map((f) => fs.readFileSync(path.join(modDir, f), 'utf8')).join('\n'));
const out = path.join(root, 'dist', '.check.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, code);
try { execFileSync(process.execPath, ['--check', out], { stdio: 'pipe' }); console.log('syntax ok'); }
catch (e) { console.error(String(e.stderr || e)); process.exit(1); }
