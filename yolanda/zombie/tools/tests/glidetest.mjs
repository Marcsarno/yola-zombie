// Glide/teleport probe: where does Yola's gameplay position go during melee? Per scenario: total travel while the
// attack clip owns the legs (that is sliding), the largest single-step jump, and the largest single-step facing change.
import fs from 'fs';
const R = 'file:///C:/Users/marc7/.claude/projects/Zombie Apoc/yolanda/zombie/';
const W = await import(R + 'src/core/weapons.js');
const { Sim, ZS } = await import(R + 'src/core/sim.js');
const { makeTuning } = await import(R + 'src/core/tuning.js');
const cd = JSON.parse(fs.readFileSync('C:/Users/marc7/.claude/projects/Zombie Apoc/yolanda/zombie/assets/clipdata.json', 'utf8'));
W.setMeleePaths(cd, 1.62 / cd.heights.YOLA, cd.hips_rest);
const weapon = process.argv[2] || 'bat';
function run(name, { stick = [0, 0], aim = [0, 1], zombie = [0, 1.6], wall = false, frames = 150, tap = false } = {}) {
  const sim = new Sim({ tuning: makeTuning(), mode: 'calm', seed: 3 });
  sim.director.update = () => {}; sim.zombies.length = 0;
  const p = sim.player; p.setLoadout([weapon]); p.x = 0; p.z = 0; p.aimYaw = p.aimTarget = Math.atan2(aim[0], aim[1]);
  if (wall) sim.world.addBox(-4, 4, 0.75, 0.95, 2.6, 'wall');
  if (zombie) { const z = sim.spawnZombie(null, { x: zombie[0], z: zombie[1], yaw: Math.PI }); z.set(ZS.CHASE); z.passive = true; z.attackCd = 99; z.speedMul = 0; }
  let slide = 0, maxStep = 0, maxTurn = 0, px = p.x, pz = p.z, py = p.aimYaw;
  for (let i = 0; i < frames; i++) {
    const held = tap ? i % 20 < 3 : true;
    sim.step({ moveX: stick[0], moveZ: stick[1], aimX: held ? aim[0] : 0, aimZ: held ? aim[1] : 0, swapPresses: 0, usePresses: 0 });
    sim.events.length = 0;
    const d = Math.hypot(p.x - px, p.z - pz), dy = Math.abs(((p.aimYaw - py + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (p.action.type === 'swing') slide += d;
    maxStep = Math.max(maxStep, d); maxTurn = Math.max(maxTurn, dy);
    px = p.x; pz = p.z; py = p.aimYaw;
  }
  console.log(`${name.padEnd(28)} travel during attacks ${slide.toFixed(2)} m   largest step ${(maxStep * 100).toFixed(1)} cm   largest turn/step ${(maxTurn * 57.3).toFixed(1)} deg   end (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
}
run('held, no stick');
run('held, stick forward', { stick: [0, 1] });
run('held, stick sideways', { stick: [1, 0] });
run('held, stick back', { stick: [0, -1] });
run('target off to the side', { zombie: [1.1, 1.0] });
run('miss (no target)', { zombie: null });
run('tapping', { tap: true });
run('beside a wall, stick in', { wall: true, stick: [0, 1], zombie: [0.0, 1.6] });
