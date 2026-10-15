// Bat hit registration in the real sim: one swing at a zombie placed at (distance, angle off the aim).
import fs from 'fs';
const R = 'file:///C:/Users/marc7/.claude/projects/Zombie Apoc/yolanda/zombie/';
const W = await import(R + 'src/core/weapons.js');
const { Sim, ZS } = await import(R + 'src/core/sim.js');
const { makeTuning } = await import(R + 'src/core/tuning.js');
const cd = JSON.parse(fs.readFileSync('C:/Users/marc7/.claude/projects/Zombie Apoc/yolanda/zombie/assets/clipdata.json', 'utf8'));
W.setMeleePaths(cd, 1.62 / cd.heights.YOLA, cd.hips_rest);
const weapon = process.argv[2] || 'bat';
const nearWall = process.argv[3] === 'wall';

function trial(d, angDeg, zState) {
  const sim = new Sim({ tuning: makeTuning(), mode: 'calm', seed: 7 });
  sim.director.update = () => {}; sim.zombies.length = 0;
  const p = sim.player;
  p.setLoadout([weapon]);
  // open floor (calm arena centre) unless testing beside a wall
  let px = 0, pz = 0;
  if (nearWall) sim.world.addBox(-4, 4, 0.9, 1.1, 2.6, 'wall'); // a corridor wall 0.9 m to her right (she faces +x)
  p.x = px; p.z = pz;
  const aim = nearWall ? Math.PI / 2 : 0; // along the wall
  p.aimYaw = p.aimTarget = aim;
  const a = aim + (angDeg * Math.PI) / 180;
  const z = sim.spawnZombie(null, { x: px + Math.sin(a) * d, z: pz + Math.cos(a) * d, yaw: a + Math.PI });
  z.set(zState || ZS.CHASE); z.passive = true; z.attackCd = 99; z.speedMul = 0;
  const inp = { moveX: 0, moveZ: 0, aimX: Math.sin(aim), aimZ: Math.cos(aim), swapPresses: 0, usePresses: 0 };
  let hit = false;
  for (let i = 0; i < 60; i++) {
    sim.step(i < 3 ? inp : { ...inp, aimX: 0, aimZ: 0 });
    for (const e of sim.events) if (e.type === 'batHit') hit = true;
    sim.events.length = 0;
  }
  return hit;
}
const ds = [0.7, 0.9, 1.1, 1.3, 1.5, 1.7], as = [-75, -50, -25, 0, 25, 50, 75];
console.log(`${weapon}${nearWall ? ' beside a wall' : ''}: rows = distance, cols = angle (+ = her left)`);
console.log('      ' + as.map((a) => String(a).padStart(4)).join(''));
let n = 0, h = 0;
for (const d of ds) {
  let row = d.toFixed(1).padStart(5) + ' ';
  for (const a of as) { const r = trial(d, a); n++; h += r; row += (r ? '   X' : '   .'); }
  console.log(row);
}
console.log(`hits ${h}/${n}`);
