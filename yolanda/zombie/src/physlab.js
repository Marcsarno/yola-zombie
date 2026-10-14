// Physics bake-off scenarios (test hooks: game.lab.kill / game.lab.pile). Run the page with
// ?physics=custom or ?physics=rapier; results are timings, and captures land in zombie/shots/.
const settle = () => new Promise((r) => setTimeout(r, 50)); // lets an async backend finish re-initialising

function quiet(sim, keep) { for (const o of sim.zombies) if (!keep.includes(o)) { o.x = 40; o.z = 40; } }

// One zombie killed from the front by the pistol or the bat; side-on frames.
export async function kill(g, tag, kind = 'pistol', frames = [0, 6, 12, 20, 30, 45, 70, 110]) {
  g.restart('calm'); await settle();
  const sim = g.sim, p = sim.player;
  sim.zombies.length = 0;
  p.x = p.px = 0.3; p.z = p.pz = 1.8; p.aimYaw = p.aimTarget = Math.PI;
  const z = sim.spawnZombie('NW', { x: 0.3, z: -1.6, yaw: 0 }); z.set('chase'); z.passive = true;
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -0.3, swapPresses: 0 });
  g.tick(30, 1 / 60, false);
  z.hp = 1;
  z.takeHit(kind === 'axe' ? 70 : 34, 0, -1, kind === 'axe' ? 5.2 : 1.6, kind, sim);
  const names = []; let f = 0;
  for (const at of frames) {
    g.tick(Math.max(1, at - f), 1 / 60, false); f = at; quiet(sim, [z]);
    g.cam({ target: z.id, yaw: -90, pitch: 15, dist: 3.2, h: 0.5 });
    names.push(await g.shot(`${tag}_${at}`));
  }
  g.scriptInput = null; g.cam(null);
  await g.sheet(names, 'sheet_' + tag, 4, 300);
  return { backend: g.physics?.name || 'off', msPerStep: g.perfReport().physicsMsPerStep };
}

// Sever chosen parts from one zombie (shots from the front), optionally killing it; side-on frames.
export async function sever(g, tag, parts = ['Forearm_R'], kill = false, frames = [0, 4, 10, 18, 30, 50, 90]) {
  g.restart('calm'); await settle();
  const sim = g.sim, p = sim.player;
  sim.zombies.length = 0;
  p.x = p.px = 0.3; p.z = p.pz = 1.8; p.aimYaw = p.aimTarget = Math.PI;
  const z = sim.spawnZombie('NW', { x: 0.3, z: -1.6, yaw: 0 }); z.set('chase'); z.passive = true;
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -0.3, swapPresses: 0 });
  g.tick(30, 1 / 60, false);
  for (const part of parts) { z.limbHp[part] = 1; z.takeHit(kill ? 999 : 5, 0, -1, 1.6, 'pistol', sim, part); }
  const names = []; let f = 0;
  for (const at of frames) {
    g.tick(Math.max(1, at - f), 1 / 60, false); f = at; quiet(sim, [z]);
    g.cam({ target: z.id, yaw: 40, pitch: 20, dist: 2.8, h: 0.75 });
    names.push(await g.shot(`${tag}_${at}`));
  }
  g.scriptInput = null; g.cam(null);
  await g.sheet(names, 'sheet_' + tag, 4, 300);
  return { severed: [...z.severed], state: z.state, crawling: z.crawling, pieces: g.pieces?.length };
}

// n zombies packed together, all killed at once in random directions; 4 s of piling up.
export async function pile(g, tag, n = 30, seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.restart('calm'); await settle();
  const sim = g.sim, p = sim.player;
  sim.zombies.length = 0;
  p.x = p.px = 0.3; p.z = p.pz = 4; p.aimYaw = p.aimTarget = Math.PI;
  const zs = [];
  for (let i = 0; i < n; i++) {
    const x = -2.4 + (i % 6) * 0.95 + (rnd() - 0.5) * 0.2, z = -3 + Math.floor(i / 6) * 0.9;
    const zz = sim.spawnZombie('NW', { x, z, yaw: rnd() * 6.28 }); zz.set('chase'); zz.passive = true; zs.push(zz);
  }
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -0.3, swapPresses: 0 });
  g.tick(20, 1 / 60, false);
  for (const z of zs) { z.hp = 1; const a = rnd() * 6.28; z.takeHit(70, Math.sin(a), Math.cos(a), 2 + rnd() * 4, rnd() < 0.5 ? 'axe' : 'pistol', sim); }
  const P = g.physics; P.stats.ms = 0; P.stats.steps = 0;
  const frameMs = [], names = []; let worstStep = 0;
  for (let i = 0; i < 240; i++) {
    const s0 = P.stats.ms, a = performance.now();
    g.tick(1, 1 / 60, i % 60 === 59); g.renderer.getContext().finish();
    frameMs.push(performance.now() - a); worstStep = Math.max(worstStep, P.stats.ms - s0);
    if ([10, 30, 60, 200].includes(i)) { g.cam({ target: 'yola', yaw: 180, pitch: 40, dist: 7.5, h: 0.3 }); names.push(await g.shot(`${tag}_${i}`)); g.cam(null); }
  }
  g.scriptInput = null;
  await g.sheet(names, 'sheet_' + tag, 4, 300);
  frameMs.sort((a, b) => a - b);
  return {
    backend: P.name, ragdolls: [...g.zviews.values()].filter((v) => v.rag).length,
    physMsPerStep: +(P.stats.ms / P.stats.steps).toFixed(3), worstStepMs: +worstStep.toFixed(2),
    frameAvgMs: +(frameMs.reduce((a, b) => a + b, 0) / frameMs.length).toFixed(2), frameP95: +frameMs[Math.floor(frameMs.length * 0.95)].toFixed(2),
  };
}

// Shotgun blast into a small group at a given distance (m): the front zombie takes most of the pellets,
// the spread catches the others. Frames from the side; reports who died, what was severed, who fell.
export async function blast(g, tag, dist = 2, n = 3, hp = 100, frames = [0, 4, 8, 14, 22, 34, 50, 80]) {
  g.restart('calm'); await settle();
  const sim = g.sim, p = sim.player;
  sim.zombies.length = 0;
  p.x = p.px = 0.3; p.z = p.pz = 2.4; p.aimYaw = p.aimTarget = Math.PI; p.equipped = p.desired = 'shotgun';
  const zs = [];
  for (let i = 0; i < n; i++) {
    const z = sim.spawnZombie('NW', { x: 0.3 + (i === 0 ? 0 : (i % 2 ? -0.75 : 0.75)), z: 2.4 - dist - (i === 0 ? 0 : 0.7), yaw: 0 });
    z.set('chase'); z.passive = true; z.hp = hp; zs.push(z);
  }
  const yaw0 = 0; for (const z of zs) z.yaw = yaw0;
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -0.3, swapPresses: 0 });
  g.tick(30, 1 / 60, false);
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, swapPresses: 0 });
  g.tick(1, 1 / 60, false);
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -0.3, swapPresses: 0 });
  const names = []; let f = 0;
  for (const at of frames) {
    g.tick(Math.max(1, at - f), 1 / 60, false); f = at;
    g.cam({ target: zs[0].id, yaw: 90, pitch: 16, dist: 4.4, h: 0.6 });
    names.push(await g.shot(`${tag}_${at}`));
  }
  g.scriptInput = null; g.cam(null);
  await g.sheet(names, 'sheet_' + tag, 4, 300);
  return zs.map((z) => ({ id: z.id, state: z.state, hp: Math.round(z.hp), severed: [...z.severed], moved: +Math.hypot(z.x - 0.3, z.z - (2.4 - dist)).toFixed(2) }));
}

// Axe combo: attack held on one zombie in reach (hp high so the whole combo lands, or low to see the
// finisher kill). Frames from the side every few ticks; reports each attack and whether it connected.
export async function combo(g, tag, hp = 400, every = 5, n = 16, camYaw = -60) {
  g.restart('calm'); await settle();
  const sim = g.sim, p = sim.player;
  sim.zombies.length = 0;
  p.x = p.px = 0.3; p.z = p.pz = 2.4; p.aimYaw = p.aimTarget = Math.PI; p.equipped = p.desired = 'axe';
  const z = sim.spawnZombie('NW', { x: 0.3, z: 1.35, yaw: 0 }); z.set('chase'); z.passive = true; z.hp = hp;
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -0.3, swapPresses: 0 });
  g.tick(30, 1 / 60, false);
  const log = [], names = [];
  const off = sim.events.length;
  g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, swapPresses: 0 });
  for (let i = 0; i < n; i++) {
    g.tick(every, 1 / 60, false);
    const a = p.action;
    log.push(a.type === 'swing' ? `${a.combo}:${a.st.toFixed(2)}${a.hits ? '*' : ''}` : a.type);
    g.cam({ target: 'yola', yaw: camYaw, pitch: 14, dist: 3.4, h: 0.9 });
    names.push(await g.shot(`${tag}_${i}`));
  }
  g.scriptInput = null; g.cam(null);
  await g.sheet(names, 'sheet_' + tag, 4, 300);
  return { log: log.join(' '), zombie: { state: z.state, hp: Math.round(z.hp), severed: [...z.severed] }, stats: sim.stats };
}
