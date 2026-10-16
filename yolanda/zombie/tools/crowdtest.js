// Crowd melee stress test (paste into the page console, or run through the browser tools), in the real frame loop:
// N zombies crowd Yola in open floor, she holds the axe attack into them for `secs` seconds. Reports real frame times
// (the game's own perf samples), slow-motion hit-stop events, hits per swing, physics bodies and severed pieces.
//   await crowdTest({ n: 10, secs: 8, weapon: 'axe' })
window.crowdTest = async function crowdTest({ n = 10, secs = 8, weapon = 'axe', seed = 1 } = {}) {
  const g = window.game;
  g.restart('calm');
  await new Promise((r) => setTimeout(r, 300));
  const sim = g.sim, p = sim.player;
  p.x = 0; p.z = 1.5; p.aimYaw = p.aimTarget = Math.PI; p.setLoadout([weapon, 'fists'], weapon);
  sim.T.testInfiniteHealth = true;
  for (const z of sim.zombies) { z.hp = 0; z.x = 80; }
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (rnd() - 0.5) * 2.2, d = 1.3 + rnd() * 2.2;
    const z = sim.spawnZombie(null, { x: p.x + Math.sin(a) * d, z: p.z + Math.cos(a) * d, yaw: a + Math.PI });
    z.set('chase'); z.attackCd = rnd() * 1.5;
  }
  let hitPauses = 0, swings = 0, hits = 0, severs = 0;
  const origEmit = sim.emit.bind(sim);
  sim.emit = (e) => { if (e.type === 'hitPause') hitPauses++; if (e.type === 'swing') swings++; if (e.type === 'batHit') hits++; if (e.type === 'sever') severs++; return origEmit(e); };
  // hold the attack toward the middle of the crowd
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, swapPresses: 0, usePresses: 0 });
  // let the game's own perf sampler run in real time
  g.resume?.();
  const t0 = performance.now(), frames = [];
  let last = t0;
  await new Promise((resolve) => {
    const tick = (now) => { frames.push(now - last); last = now; if (now - t0 < secs * 1000) requestAnimationFrame(tick); else resolve(); };
    requestAnimationFrame(tick);
  });
  g.scriptInput = null; sim.emit = origEmit;
  frames.shift();
  const f = [...frames].sort((a, b) => a - b), avg = f.reduce((a, b) => a + b, 0) / f.length;
  return {
    n, weapon, frames: f.length, avgMs: +avg.toFixed(2), p50: +f[f.length >> 1].toFixed(1), p95: +f[Math.floor(f.length * 0.95)].toFixed(1), p99: +f[Math.floor(f.length * 0.99)].toFixed(1),
    maxMs: +f[f.length - 1].toFixed(1), over34: frames.filter((x) => x > 34).length, over50: frames.filter((x) => x > 50).length,
    hitPauseEvents: hitPauses, swings, hits, hitsPerSwing: swings ? +(hits / swings).toFixed(2) : 0, severs,
    alive: sim.zombies.filter((z) => z.alive).length, physicsBodies: g.physics?.count?.() ?? null, pieces: g.pieces?.length ?? null,
    renderScale: g.perfReport?.()?.renderScale, res: g.perfReport?.()?.res, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles,
  };
};
