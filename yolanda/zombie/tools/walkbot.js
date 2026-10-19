// The walkthrough bot (dev only, 2026-10-19: the map rebuild's "full walk through"). In the game page:
//   const B = await import('/zombie/tools/walkbot.js'); B.install(window.game)
// then: await bot.walk(x, z) (steers Yola along the simulation's own navigation grid, fighting whatever comes within
// reach), bot.use(id) (stands still pressing Use while that prompt is up), bot.swing(x, z, weapon, secs) (attacks toward a
// point: a cracked wall, the flood's panel), bot.equip(w), bot.report(). Health is held full (the user tests on infinite
// health), ammunition topped up. It drives game.scriptInput and game.tick (manual stepping: reload the page after).
export function install(game) {
  const out = { x: 0, z: 0 }, log = [];
  let goal = null, flow = null, want = { use: null, aim: null, attack: false, weapon: null }, kills0 = 0;
  const S = () => game.sim, P = () => game.sim.player;
  // our own distance field over the world's nav grid (the zombies' flow field is left alone)
  function field(gx, gz) {
    const w = S().world, n = w.nav, { w: W, h: H, blocked } = n, dist = new Float32Array(W * H).fill(1e9), q = new Int32Array(W * H);
    let g = w.cellOf(gx, gz); if (g < 0) return null; if (blocked[g]) g = w.nearestFree(g); if (g < 0) return null;
    let a = 0, b = 0; dist[g] = 0; q[b++] = g;
    while (a < b) {
      const c = q[a++], ci = c % W, cj = (c / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const nc = j * W + i; if (blocked[nc] || dist[nc] <= dist[c] + 1) continue; dist[nc] = dist[c] + 1; q[b++] = nc;
      }
    }
    return { dist, W, H };
  }
  function dirTo(x, z) {
    const w = S().world, n = w.nav; let c = w.cellOf(x, z); if (c < 0 || !flow) return null;
    if (flow.dist[c] >= 1e9) { c = w.nearestFree(c); if (c < 0) return null; }
    const ci = c % flow.W, cj = (c / flow.W) | 0; let best = flow.dist[c], bi = 0, bj = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= flow.W || j >= flow.H) continue; const d = flow.dist[j * flow.W + i] + Math.hypot(di, dj) * 0.01; if (d < best) { best = d; bi = di; bj = dj; } }
    if (!bi && !bj) return { x: goal.x - x, z: goal.z - z, d: 0 };
    return { x: bi, z: bj, d: flow.dist[c] * n.cell };
  }
  function target(p) {
    let best = null, bd = 5.2;
    for (const z of S().zombies) {
      if (!z.alive || z.buried) continue;
      if (z.kind === 'guard' && (z.shieldHp > 0) && !z.executable) continue; // (his shield: walked past; his fight is its own demo)
      const d = Math.hypot(z.x - p.x, z.z - p.z); if (d > bd) continue;
      if (z.dormant && d > 3.2) continue; // (sleeping ones only when they are close)
      if (!S().world.lineOfSight(p.x, p.z, z.x, z.z, 1.0)) continue;
      bd = d; best = z;
    }
    return best;
  }
  game.scriptInput = (sim) => {
    const p = sim.player; p.hp = p.maxHp; for (const k of ['pistol', 'shotgun']) p.reserve[k] = Math.max(p.reserve[k] || 0, 60);
    const inp = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, swapPresses: 0, usePresses: 0, dodgePresses: 0 };
    if (want.weapon && p.owned.includes(want.weapon) && p.desired !== want.weapon) p.desired = want.weapon;
    if (want.use) { if (!want.pressed && sim.level?.prompt?.id === want.use && sim.level.prompt.usable) { inp.usePresses = 1; want.pressed = true; } return inp; } // (one press: a frame can run two steps)
    if (want.aim) { const dx = want.aim.x - p.x, dz = want.aim.z - p.z, l = Math.hypot(dx, dz) || 1; inp.aimX = dx / l; inp.aimZ = dz / l; if (l > 1.15) { inp.moveX = dx / l * 0.6; inp.moveZ = dz / l * 0.6; } return inp; }
    const t = want.fight !== false ? target(p) : null;
    if (t) { const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz) || 1; inp.aimX = dx / l; inp.aimZ = dz / l; if (l < 1.0) { inp.moveX = -dx / l * 0.5; inp.moveZ = -dz / l * 0.5; } return inp; }
    if (goal) { const d = dirTo(p.x, p.z); if (d) { const l = Math.hypot(d.x, d.z) || 1; inp.moveX = d.x / l; inp.moveZ = d.z / l; } }
    return inp;
  };
  const run = async (secs, until) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i += 20) { game.tick(20, 1 / 60, i + 20 >= n || i % 120 === 0); if (until?.()) return true; await new Promise((r) => setTimeout(r, 0)); } return !!until?.(); };
  const bot = {
    log,
    equip(w) { want.weapon = w; },
    async walk(x, z, { maxT = 90, r = 0.9, fight = true } = {}) {
      goal = { x, z }; flow = field(x, z); want = { ...want, use: null, aim: null, fight };
      let lastRe = 0; const t0 = S().time;
      const ok = await run(maxT, () => { const p = P(); if (S().time - lastRe > 1.5) { flow = field(x, z); lastRe = S().time; } return Math.hypot(p.x - x, p.z - z) < r; });
      const p = P(); const e = { walk: [x, z], ok, at: [+p.x.toFixed(2), +p.z.toFixed(2)], t: +(S().time - t0).toFixed(1), room: S().level?.room }; log.push(e); goal = null; return e;
    },
    async clear(secs = 20) { // fight in place until nothing awake is near (or secs)
      goal = null; want = { ...want, use: null, aim: null, fight: true };
      const ok = await run(secs, () => !S().zombies.some((z) => z.alive && !z.dormant && Math.hypot(z.x - P().x, z.z - P().z) < 9));
      log.push({ clear: ok }); return ok;
    },
    async use(id, secs = 6) { want = { ...want, use: id, aim: null, pressed: false }; let fired = false; const ok = await run(secs, () => { if (S().level?.prompt?.id === id) fired = true; return fired && S().level?.prompt?.id !== id; }); want.use = null; const e = { use: id, ok, prompt: S().level?.prompt?.id }; log.push(e); return e; },
    async swing(x, z, weapon, secs = 3) { if (weapon) want.weapon = weapon; await run(0.6); want = { ...want, use: null, aim: { x, z } }; await run(secs); want.aim = null; const e = { swing: [x, z], weapon: P().equipped }; log.push(e); return e; },
    async idle(secs) { goal = null; want = { ...want, use: null, aim: null, fight: false }; await run(secs); want.fight = true; },
    report() { const s = S(), L = s.level; return { floor: L?.floor, room: L?.room, objective: L?.objective, prompt: L?.prompt?.id, flags: L && { ...L.flags }, alive: s.zombies.filter((z) => z.alive).length, kills: s.zombies.filter((z) => !z.alive).length, owned: s.player.owned, equipped: s.player.equipped, lift: L?.lift.state, case: L?.case.state }; },
    stop() { game.scriptInput = null; goal = null; },
  };
  window.bot = bot; return bot;
}
