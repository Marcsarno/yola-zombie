// Refresh the fittings and EXIT signs in the floors' bake inputs (shots/floor<n>_bake_scene.json) from the chapter's light
// plan (render/floorlights.js) without exporting the geometry again from the game; then rebake (blender/bake_floor.py).
// Run: node tools/bake_fixtures.mjs
import fs from 'fs';
import { chapterLightPlan } from '../src/render/floorlights.js';

const p = chapterLightPlan();
for (const n of [7, 6, 5]) {
  const file = `shots/floor${n}_bake_scene.json`, d = JSON.parse(fs.readFileSync(file, 'utf8')), B = d.bounds;
  const inB = (o) => o.x >= B.x0 && o.x <= B.x1 && o.z >= B.z0 && o.z <= B.z1;
  d.fixtures = p.fixtures.filter(inB).map(({ x, z, k, state, col }) => ({ x, z, k, state, col }));
  d.exits = p.exits.filter(inB).map(({ x, z }) => ({ x, z }));
  fs.writeFileSync(file, JSON.stringify(d));
  const st = {}; for (const f of d.fixtures) st[f.state] = (st[f.state] || 0) + 1;
  console.log(`floor ${n}: ${d.fixtures.length} fittings`, st);
}
