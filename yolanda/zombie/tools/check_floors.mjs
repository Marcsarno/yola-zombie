// Floors check (2026-10-19, the map rebuild): for each chapter floor, build the simulation's own collision world and its
// navigation grid (core/layout.js buildWorld, core/world.js), then report:
//   - every open doorway whose middle is blocked (a prop in front of a door),
//   - every room the lift cannot reach, with the dynamic doors shut and the cracked walls standing (the first visit),
//     and with them all open or broken (the way back),
//   - props overlapping a wall.
// Run: node tools/check_floors.mjs
import { useLevel, buildWorld, LAYOUT } from '../src/core/layout.js';
import { World } from '../src/core/world.js';
import { FLOORS } from '../src/core/chapter.js';

let bad = 0;
for (const n of [7, 6, 5]) {
  useLevel('chapter', n);
  const F = FLOORS[n], out = [];
  const reach = (crackedUp, dynOpen) => {
    const w = buildWorld(World);
    if (crackedUp) for (const c of F.cracked) { const horiz = Math.abs(c.x1 - c.x0) >= Math.abs(c.z1 - c.z0); if (horiz) w.addBox(Math.min(c.x0, c.x1), Math.max(c.x0, c.x1), c.z0 - 0.13, c.z0 + 0.13, 2.6, 'cracked'); else w.addBox(c.x0 - 0.13, c.x0 + 0.13, Math.min(c.z0, c.z1), Math.max(c.z0, c.z1), 2.6, 'cracked'); }
    if (dynOpen) for (const [k, b] of Object.entries(w.dyn)) if (k !== 'liftDoors') b.off = true;
    w.buildNav(0.25, 0.3);
    const s = F.playerStart; w.updateFlow(s.x, s.z);
    const res = {};
    for (const r of F.rooms) {
      let best = 1e9;
      for (const [x0, x1, z0, z1] of r.rects) for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) { const c = w.cellOf(x0 + (x1 - x0) * i / 6, z0 + (z1 - z0) * j / 6); if (c >= 0 && !w.nav.blocked[c]) best = Math.min(best, w.nav.dist[c]); }
      res[r.id] = best < 1e8 ? Math.round(best * w.nav.cell) : null;
    }
    return { w, res };
  };
  const first = reach(true, false), all = reach(false, true);
  for (const r of F.rooms) if (all.res[r.id] == null) out.push(`room ${r.id} (${r.name}) unreachable even with every door open`);
  const firstMissing = F.rooms.filter((r) => first.res[r.id] == null).map((r) => r.id);
  // open doorways: the cell at the doorway's middle, and a step either side, must be free
  for (const d of F.doors) {
    if (d.kind !== 'open') continue;
    const w = all.w, pts = d.axis === 'x' ? [[d.x, d.z - 0.6], [d.x, d.z], [d.x, d.z + 0.6]] : [[d.x - 0.6, d.z], [d.x, d.z], [d.x + 0.6, d.z]];
    for (const [x, z] of pts) { const c = w.cellOf(x, z); if (c >= 0 && w.nav.blocked[c]) { out.push(`doorway ${d.id} blocked at (${x.toFixed(2)}, ${z.toFixed(2)})`); break; } }
  }
  // pickups and interactions: some free cell within reach (the player stands in free cells: radius ~0.3 is the nav's inflate)
  { const w = all.w, n = w.nav;
    const reachable = (x, z, r) => { for (let dx = -r; dx <= r; dx += 0.1) for (let dz = -r; dz <= r; dz += 0.1) { if (Math.hypot(dx, dz) > r - 0.05) continue; const c = w.cellOf(x + dx, z + dz); if (c >= 0 && !n.blocked[c] && n.dist[c] < 1e8) return true; } return false; };
    for (const q of F.pickups) if (!reachable(q.x, q.z, q.r)) out.push(`pickup ${q.id} at (${q.x}, ${q.z}) out of reach (r ${q.r})`);
    for (const it of F.interact) if (!reachable(it.x, it.z, it.r)) out.push(`interaction ${it.id} out of reach`); }
  // props overlapping walls (deeper than 5 cm)
  for (const p of F.props) {
    if (p.noCollide || !p.h || p.wall) continue;
    const a = [p.x - p.fp[0] / 2, p.x + p.fp[0] / 2, p.z - p.fp[1] / 2, p.z + p.fp[1] / 2];
    for (const w of F.walls) {
      const ox = Math.min(a[1], w[1]) - Math.max(a[0], w[0]), oz = Math.min(a[3], w[3]) - Math.max(a[2], w[2]);
      if (ox > 0.05 && oz > 0.05) { out.push(`prop ${String(p.m || p.kind).split('/').pop()} at (${p.x}, ${p.z}) cuts a wall by ${Math.min(ox, oz).toFixed(2)} m`); break; }
    }
  }
  console.log(`Floor ${n}: ${F.rooms.length} rooms; first visit reaches ${F.rooms.length - firstMissing.length}` + (firstMissing.length ? ` (not yet: ${firstMissing.join(', ')})` : ''));
  console.log('  walk distance from the lift (m):', JSON.stringify(all.res));
  for (const o of out) { console.log('  ! ' + o); bad++; }
}
console.log(bad ? `${bad} problem(s)` : 'all clear');
