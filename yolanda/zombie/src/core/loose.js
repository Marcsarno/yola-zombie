// Things the hospital's zombies bring with them that stay in the world (2026-10-18, the user: "i want the wheel chair and
// iv pole to have collision... even after the holder or sitter dies"): the drip stand an 'iv' zombie drags and the
// wheelchair a 'chair' zombie sits in. Each is a circle on the floor that Yola and the zombies cannot walk through.
// While its zombie has it (owner: the zombie's id), the zombie moves it (core/zombies.js) and it holds firm against
// everyone but its owner. Once let go (the stand dropped in a fight or left behind, the chair tipped over, its zombie
// dead) it is loose: it rolls on its castors, a body walking into it shoves it along (it gives most of the way), it
// slows to a stop and stops against walls. The renderer draws them from here (render/clipchars.js syncLoose).
export const LOOSE = {
  iv: { r: 0.26, roll: 2.2, give: 0.7 },        // r: m; roll: 1/s its speed dies away; give: how much of an overlap it takes
  chair: { r: 0.42, roll: 3.0, give: 0.6 },
  tipped: { r: 0.46, roll: 9.0, give: 0.25 },   // (a wheelchair on its side: it scrapes, barely moves)
};
// the drip stand on its zombie: its base on a spring (k, damp) to a spot ahead of the left hip (fwd, side, m), never further
// than `arm` from it; let go in a fight, taken again if within reach
export const IV_CARRY = { fwd: 0.32, side: 0.36, k: 16, damp: 7, arm: 0.35, reach: 0.75 };
let nextId = 1;

export function addLoose(sim, kind, x, z, yaw, owner) {
  const L = { id: nextId++, kind, x, z, px: x, pz: z, yaw, vx: 0, vz: 0, owner, held: true, tipped: false, tipSide: 1, r: LOOSE[kind].r };
  (sim.loose ||= []).push(L);
  return L;
}

// once a step, after everyone has moved: loose ones roll on, and no body stays inside any of them
export function looseStep(sim, dt) {
  const list = sim.loose; if (!list?.length) return;
  const p = sim.player;
  for (const L of list) {
    const P = L.tipped ? LOOSE.tipped : LOOSE[L.kind];
    const owned = L.owner && L.held;
    if (!owned) { // rolling on, slowing, stopped by the walls
      const f = Math.exp(-dt * P.roll); L.vx *= f; L.vz *= f;
      L.x += L.vx * dt; L.z += L.vz * dt;
      const bx = L.x, bz = L.z;
      if (sim.world.resolveCircle(L, L.r)) { const nx = L.x - bx, nz = L.z - bz, n = Math.hypot(nx, nz); if (n > 1e-6) { const vn = (L.vx * nx + L.vz * nz) / n; if (vn < 0) { L.vx -= (vn * nx) / n; L.vz -= (vn * nz) / n; } } }
    }
    const give = owned ? 0 : P.give;
    const push = (b, r, heavy) => { // b out of L (an owned one never gives; a loose one takes `give` of the overlap)
      const dx = b.x - L.x, dz = b.z - L.z, d = Math.hypot(dx, dz), rr = r + L.r;
      if (d >= rr || d < 1e-6) return;
      const o = rr - d, ux = dx / d, uz = dz / d, g = heavy ? give * 0.5 : give;
      b.x += ux * o * (1 - g); b.z += uz * o * (1 - g); sim.world.resolveCircle(b, r); // (never into a wall)
      if (g > 0) { // (shoved: it rolls on, at most a little slower than it was pushed, never faster: no speed piles up)
        L.x -= ux * o * g; L.z -= uz * o * g;
        const want = Math.min(2.5, ((o * g) / dt) * 0.6), away = -(L.vx * ux + L.vz * uz);
        if (away < want) { L.vx -= ux * (want - away); L.vz -= uz * (want - away); }
      }
    };
    if (!p.dead) push(p, p.r, false);
    for (const z of sim.zombies) {
      if (z.id === L.owner || !z.alive || !z.solid) continue;
      push(z, z.r, z.kind === 'guard' || z.kind === 'sprinter');
    }
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { // (two loose ones never overlap)
    const a = list[i], b = list[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), rr = a.r + b.r;
    if (d >= rr || d < 1e-6) continue;
    const o = (rr - d) / 2, ux = dx / d, uz = dz / d, fa = a.owner && a.held ? 0 : 1, fb = b.owner && b.held ? 0 : 1;
    if (!fa && !fb) continue;
    a.x -= ux * o * fa * (fb ? 1 : 2); a.z -= uz * o * fa * (fb ? 1 : 2); b.x += ux * o * fb * (fa ? 1 : 2); b.z += uz * o * fb * (fa ? 1 : 2);
  }
}
