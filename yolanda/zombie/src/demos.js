// Repeatable examples (2026-10-18, the user: "show short, repeatable examples of the first shield slam, second-slam break,
// post-break dismemberment, charger dodge, get-ups, and walker lunges ... check them in the actual Three.js game").
// combat.html?mode=calm&demo=<name>: the practice room with only that scene in it, set up the same way every time; the
// ↺ button (or R) sets it up again. You play it yourself; &auto=1 lets Yola dodge on her own at the moment and fight
// back, to watch it. Names: slam1, slam2, dismember, charger, kipup, ladykip, walkers, runner, floor, low.
const DEMOS = {
  slam1: { label: 'Guard: the first slam (dodge: the shield sticks, cracked)', weapon: 'bat', setup(sim) { const z = guard(sim, -0.4); z.slamCd = 0; } },
  slam2: { label: 'Guard: the second slam (the shield shatters)', weapon: 'pistol', setup(sim) { const z = guard(sim, -0.4); z.slamCd = 0; z.slams = 1; z.shieldHp = z.shieldMax * 0.3; z.hp = z.maxHp * 0.3; } },
  dismember: { label: 'Guard after the break: arm, arm, head', weapon: 'pistol', setup(sim) { const z = guard(sim, -2.0); z.slams = 2; z.shieldHp = 0; z.hp = z.maxHp * 0.55; z.attackCd = 2; } },
  charger: { label: 'The big lady charges (dodge left/right)', weapon: 'pistol', setup(sim) { const z = put(sim, 0.4, -5.6, 'sprinter'); z.attackCd = 0; } },
  kipup: { label: 'Yola knocked flat: the kip-up', weapon: 'bat', setup(sim) { const z = guard(sim, -0.2); z.slamCd = 0; sim.demoNoDodge = true; } },
  ladykip: { label: 'The lady trips into the wall: her kip-up', weapon: 'pistol', setup(sim) { const p = sim.player; p.z = 10.05; const z = put(sim, 0.4, 2.6, 'sprinter'); z.attackCd = 0; } },
  walkers: { label: 'Walkers: the ring, its pounces, the scratch', weapon: 'bat', setup(sim) { for (let i = 0; i < 6; i++) { const a = Math.PI + (i / 5 - 0.5) * 2.4; put(sim, 0.4 + Math.sin(a) * 6, 1.0 + Math.cos(a) * 6, 'normal', a + Math.PI); } sim.player.z = 1.0; } },
  runner: { label: 'The orange runner: the dash rake', weapon: 'bat', setup(sim) { put(sim, 0.4, -5.5, 'runner'); } },
  floor: { label: 'Out of the floor: the breach', weapon: 'pistol', setup(sim) { sim.spawnFromFloor(-0.8, -1.6, { look: 'patient' }); sim.spawnFromFloor(2.2, -0.6, { kind: 'runner' }); } },
  low: { label: 'Low targets: a crawler, a floored walker', weapon: 'axe', setup(sim) { const c = put(sim, 0.4, 0.6, 'normal'); c.crawling = true; c.broken = 'LowerLeg_L'; const k = put(sim, 1.6, 0.4, 'normal'); k.knockDown(0, 1, sim); } },
};
function put(sim, x, z, kind = 'normal', yaw = 0) { const q = sim.spawnZombie('placed', { x, z, yaw, kind }); q.set('chase'); return q; }
function guard(sim, z) { const g = put(sim, 0.4, z, 'guard'); g.attackCd = 0; return g; }

export function startDemos(game, name, auto) {
  const D = DEMOS[name] || DEMOS.slam1;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:calc(58px + env(safe-area-inset-top));transform:translateX(-50%);z-index:30;display:flex;gap:8px;align-items:center;font:600 13px system-ui;color:#fff;background:rgba(20,26,30,.78);padding:6px 10px;border-radius:12px;max-width:92vw';
  el.innerHTML = `<span>${D.label}</span><button style="font:700 15px system-ui;border:0;border-radius:8px;padding:4px 10px">↺</button>`;
  document.body.appendChild(el);
  const setup = () => {
    game.restart('calm');
    const sim = game.sim, p = sim.player;
    sim.director.update = () => {}; sim.zombies = []; sim.T.testInfiniteHealth = true;
    p.x = 0.4; p.z = 2.2; p.aimYaw = p.aimTarget = Math.PI; p.setLoadout([D.weapon, 'pistol', 'shotgun', 'bat', 'axe', 'fists'].filter((w, i, a) => a.indexOf(w) === i), D.weapon);
    D.setup(sim);
    p.px = p.x; p.pz = p.z; game.yola.reset(p.x, p.z, p.aimYaw);
    if (auto) game.scriptInput = (s) => autoplay(s, game);
  };
  el.querySelector('button').onclick = setup;
  addEventListener('keydown', (e) => { if (e.code === 'KeyR') setup(); });
  setup();
}

// &auto=1: she dodges a special attack at its moment and fights whatever is nearest (to watch a scene play out)
function autoplay(sim) {
  const p = sim.player, r = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, swapPresses: 0, usePresses: 0, dodgePresses: 0 };
  if (sim.demoNoDodge) return r; // (the kip-up scene: she stands and takes the slam)
  const th = p.threat; if (th && th.now && th.soon) { r.dodgePresses = 1; return r; }
  let best = null, bd = 9;
  for (const z of sim.zombies) { if (!z.alive || z.buried) continue; const d = Math.hypot(z.x - p.x, z.z - p.z); if (d < bd) { bd = d; best = z; } }
  if (!best || (th && !th.now)) return r;
  const dx = best.x - p.x, dz = best.z - p.z, l = Math.hypot(dx, dz) || 1;
  const shielded = best.kind === 'guard' && best.shieldBlocks(dx / l, dz / l);
  if (!shielded) { r.aimX = dx / l; r.aimZ = dz / l; }
  if (shielded) { r.moveX = -dz / l; r.moveZ = dx / l; } // (round his shield)
  return r;
}
