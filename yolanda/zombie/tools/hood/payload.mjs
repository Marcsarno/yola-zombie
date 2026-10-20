// What the chapter downloads (assets/neighborhood/ only): every model the layout places, the pickups and props the code
// loads, the ground, the light, and every texture the materials can ask for. node tools/hood/payload.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), R = path.resolve(here, '../../assets/neighborhood');
const L = JSON.parse(fs.readFileSync(path.join(R, 'hood_layout.json'), 'utf8'));
const size = (f) => { try { return fs.statSync(path.join(R, f)).size; } catch { return 0; } };
const rows = [];
let models = 0; for (const m of L.models) { const s = size(m); models += s; rows.push([s, m]); }
const extra = ['props/security_rifle.glb', 'models/boltcutters.glb', 'models/nb_fuel_can.glb', 'kit/military_crate.glb', 'models/loot_crate.glb', 'props/hospital_radio.glb', 'hood_ground.glb', 'hood_layout.json', 'hood_light.jpg'];
let ex = 0; for (const f of extra) { const s = size(f); ex += s; rows.push([s, f]); }
let tex = 0; for (const f of fs.readdirSync(path.join(R, 'tex'))) tex += size('tex/' + f);
const MB = (b) => (b / 1048576).toFixed(1) + ' MB';
console.log('models', MB(models), '| props/ground/light', MB(ex), '| textures (all sets)', MB(tex), '| total', MB(models + ex + tex));
rows.sort((a, b) => b[0] - a[0]); console.log('largest:'); for (const [s, f] of rows.slice(0, 12)) console.log('  ', MB(s).padStart(8), f);
