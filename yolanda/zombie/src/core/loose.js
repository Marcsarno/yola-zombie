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
  o2tank: { r: 0.17, roll: 2.6, give: 0.65 },   // a standing oxygen cylinder (O2)
};
// Oxygen cylinders (2026-10-18 night, Floor 6's thing: FLOORS_REDESIGN.html; the user: "the guys in wheelchairs ... have the
// oxygen tanks ... pretty quick ... when you shoot them, they explode ... if you're too close you get hurt ... if you can
// shoot them before they get close ... a lot of damage to a bunch of other zombies"; "some of the older guys walking with
// them"). A cylinder rides behind a wheelchair's backrest (an o2 chair zombie: it wheels itself at chairSpeed x the walk),
// on a trolley an old walker drags (the drip stand's carry: an o2 'iv'), or stands on its own ('o2tank'). Shot (a round
// into the cylinder, a round through its chair rider: through, or the one that kills a rider), it punctures: a scream of
// gas for fuse s, then it bursts. Zombies within kill m are blown apart, out to throw m thrown down and hurt; Yola is
// floored inside yolaKnock m, hurt to yolaHurt m; any cylinder within chain m goes off after it. A rider killed in melee
// leaves its cylinder whole (loose: shoot it later).
export const O2 = { hitR: 0.2, fuse: 0.32, chainFuse: [0.1, 0.28], kill: 1.9, burst: 1.25, throw: 3.8, push: 7.5, yolaKnock: 2.4, yolaHurt: 3.8, dmgNear: 38, dmgFar: 14, chain: 3.3, through: 0.3, chairSpeed: 1.85 };
// where a cylinder is (behind a chair's backrest, else where its loose object is)
export function tankPos(L, out = {}) {
  if (L.kind === 'chair' && !L.tipped) { out.x = L.x - Math.sin(L.yaw) * 0.34; out.z = L.z - Math.cos(L.yaw) * 0.34; } else { out.x = L.x; out.z = L.z; }
  return out;
}
export function punctureTank(sim, L, fuse = O2.fuse) {
  if (!L || !L.o2 || L.gone || L.fuse != null) return;
  L.fuse = fuse; const p = tankPos(L);
  sim.emit({ type: 'tankHiss', id: L.id, x: p.x, z: p.z });
}
// once a step: fuses burn down; a burst cylinder is gone from the world
export function o2Step(sim, dt) {
  const list = sim.loose; if (!list?.length) return;
  for (const L of list) if (L.o2 && !L.gone && L.fuse != null && (L.fuse -= dt) <= 0) tankBurst(sim, L);
  if (list.some((L) => L.gone)) sim.loose = list.filter((L) => !L.gone);
}
function tankBurst(sim, L) {
  L.gone = true; const c = tankPos(L), p = sim.player;
  sim.emit({ type: 'tankBoom', id: L.id, x: c.x, z: c.z });
  for (const z of sim.zombies) {
    if (!z.alive || z.buried) continue;
    const dx = z.x - c.x, dz = z.z - c.z, d = Math.hypot(dx, dz), ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
    const rider = z.loose === L; if (rider) { z.chair = false; z.loose = null; }
    if (d < O2.kill || rider) {
      if (d < O2.burst || rider) { z.executed = true; z.execWeapon = 'shotgun'; z.execDone = true; z.execNoHeal = true; } // (its rider, or right on it: blown apart, main.js zombieDeath)
      z.takeHit(9999, ux, uz, O2.push * 1.3, 'shotgun', sim, 'torso', 'heavy');
    } else if (d < O2.throw) {
      const k = 1 - (d - O2.kill) / (O2.throw - O2.kill);
      z.takeHit(z.maxHp * 0.5 * k, ux, uz, O2.push * k, 'shotgun', sim, 'torso', 'heavy');
      if (z.alive && !z.down && z.kind !== 'guard' && z.kind !== 'sprinter') z.knockDown(ux, uz, sim);
    }
  }
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  if (!p.dead && d < O2.yolaHurt && !sim.T.testNoBlast) {
    if (p.hurt(d < O2.yolaKnock ? O2.dmgNear : O2.dmgFar, c.x, c.z, sim) && d < O2.yolaKnock && !p.dead) p.knockDown(c.x, c.z, sim);
  }
  sim.heavyImpact?.(c.x, c.z, 2.6, 'blast'); // (a cracked wall close by gives way: core/rooms.js)
  for (const o of sim.loose) if (o !== L && o.o2 && !o.gone) { const q = tankPos(o); if (Math.hypot(q.x - c.x, q.z - c.z) < O2.chain) punctureTank(sim, o, O2.chainFuse[0] + sim.rand() * (O2.chainFuse[1] - O2.chainFuse[0])); }
}
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
