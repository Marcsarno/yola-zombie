import fs from 'fs';
const R = 'file:///C:/Users/marc7/.claude/projects/Zombie Apoc/yolanda/zombie/';
const W = await import(R + 'src/core/weapons.js');
const { Sim, ZS } = await import(R + 'src/core/sim.js');
const { makeTuning } = await import(R + 'src/core/tuning.js');
const cd = JSON.parse(fs.readFileSync('C:/Users/marc7/.claude/projects/Zombie Apoc/yolanda/zombie/assets/clipdata.json', 'utf8'));
W.setMeleePaths(cd, 1.62 / cd.heights.YOLA, cd.hips_rest);
const sim = new Sim({ tuning: makeTuning(), mode: 'calm', seed: 9 }); sim.director.update = () => {}; sim.zombies.length = 0;
const p = sim.player; p.setLoadout(['bat']); p.x = 0; p.z = 0; p.hp = p.maxHp = 1e6;
for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = 2.5 + (i % 3) * 0.8; const z = sim.spawnZombie(null, { x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: a + Math.PI }); z.set(ZS.CHASE); }
let swings = 0, hitsPerSwing = {}, dup = 0, pauseBySwing = {}, maxStep = 0, px = 0, pz = 0, kills = 0, multi = 0, t0 = performance.now();
for (let i = 0; i < 600; i++) {
  // aim at the nearest zombie (as a player would), attack held
  let best = null, bd = 1e9; for (const z of sim.zombies) { if (!z.alive) continue; const d = Math.hypot(z.x - p.x, z.z - p.z); if (d < bd) { bd = d; best = z; } }
  const ax = best ? best.x - p.x : 0, az = best ? best.z - p.z : 1, al = Math.hypot(ax, az) || 1;
  sim.step({ moveX: 0, moveZ: 0, aimX: ax / al, aimZ: az / al, swapPresses: 0, usePresses: 0 });
  const id = p.swingId;
  for (const e of sim.events) {
    if (e.type === 'swing') swings++;
    if (e.type === 'batHit') { const k = id + ':' + e.id; if (hitsPerSwing[k]) dup++; hitsPerSwing[k] = 1; }
    if (e.type === 'hitPause') pauseBySwing[id] = Math.max(pauseBySwing[id] || 0, e.dur);
    if (e.type === 'zombieDeath') kills++;
  }
  sim.events.length = 0;
  maxStep = Math.max(maxStep, Math.hypot(p.x - px, p.z - pz)); px = p.x; pz = p.z;
}
const per = {}; for (const k of Object.keys(hitsPerSwing)) { const s = k.split(':')[0]; per[s] = (per[s] || 0) + 1; }
const counts = Object.values(per); multi = counts.filter((c) => c > 1).length;
console.log({ simSeconds: 10, swings, swingsThatHit: counts.length, swingsHittingSeveral: multi, mostInOneSwing: Math.max(...counts), duplicateHitsSameSwing: dup, kills, maxHitStopPerSwing: Math.max(...Object.values(pauseBySwing)).toFixed(3), largestMoveStepCm: (maxStep * 100).toFixed(1), hp: Math.round(p.hp), simMsPerStep: ((performance.now() - t0) / 600).toFixed(3) });
