import fs from 'fs';
const R = 'file:///C:/Users/marc7/.claude/projects/Zombie Apoc/yolanda/zombie/';
const W = await import(R + 'src/core/weapons.js');
const { Sim, ZS } = await import(R + 'src/core/sim.js');
const { makeTuning } = await import(R + 'src/core/tuning.js');
const cd = JSON.parse(fs.readFileSync('C:/Users/marc7/.claude/projects/Zombie Apoc/yolanda/zombie/assets/clipdata.json', 'utf8'));
W.setMeleePaths(cd, 1.62 / cd.heights.YOLA, cd.hips_rest);
const weapon = process.argv[2] || 'bat';
for (const seed of [1, 2, 3, 4]) {
  const sim = new Sim({ tuning: makeTuning(), mode: 'calm', seed });
  sim.director.update = () => {}; sim.zombies.length = 0;
  const p = sim.player; p.setLoadout([weapon]); p.x = 0; p.z = 0; p.aimYaw = p.aimTarget = 0;
  const z = sim.spawnZombie(null, { x: 0, z: 1.1, yaw: Math.PI }); z.set(ZS.CHASE); z.attackCd = 99; z.passive = true;
  const log = [];
  for (let i = 0; i < 180; i++) {
    sim.step({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 1, swapPresses: 0, usePresses: 0 });
    if (p.action.type === 'swing' && p.action.combo === 1 && Math.abs(p.action.st - 0.3) < 0.009) log.push(`[chop st.45 d=${Math.hypot(z.x - p.x, z.z - p.z).toFixed(2)} ang=${(Math.atan2(z.x - p.x, z.z - p.z) - p.aimYaw).toFixed(2)} state=${z.state} lunge=${p.action.lunge.toFixed(2)}]`);
    for (const e of sim.events) if (['swing', 'batHit', 'zombieDeath', 'zombieKnockdown', 'batMiss'].includes(e.type)) log.push(`${e.t.toFixed(2)} ${e.type}${e.combo !== undefined ? ' c' + e.combo : ''}${e.type === 'batHit' ? ' hp' + Math.round(z.hp) : ''}`);
    sim.events.length = 0;
  }
  console.log(`seed ${seed}: ` + log.join(' | '));
}
