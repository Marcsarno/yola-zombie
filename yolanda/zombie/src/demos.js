// Repeatable examples (2026-10-18, the user: "show short, repeatable examples of the first shield slam, second-slam break,
// post-break dismemberment, charger dodge, get-ups, and walker lunges ... check them in the actual Three.js game").
// combat.html?mode=calm&demo=<name>: the practice room with only that scene in it, set up the same way every time; the
// ↺ button (or R) sets it up again. You play it yourself; &auto=1 lets Yola dodge on her own at the moment and fight
// back, to watch it. Names: slam1, slam2, dismember, charger, kipup, ladykip, walkers, runner, floor, low.
const DEMOS = {
  slam1: { label: 'Guard: the slam (dodge it: the shield sticks for good)', weapon: 'bat', setup(sim) { const z = guard(sim, -0.4); z.slamCd = 0; } },
  tear: { label: 'Guard: stuck shield, his arm tears off, the flail, then his arm as a club', weapon: 'pistol', setup(sim) { const z = put(sim, -1.2, -0.4, 'guard', Math.PI / 2); z.attackCd = 0; z.slamShield(sim); } },
  charger: { label: 'The big lady charges (dodge left/right)', weapon: 'pistol', setup(sim) { const z = put(sim, 0.4, -5.6, 'sprinter'); z.attackCd = 0; } },
  kipup: { label: 'Yola knocked flat: the kip-up', weapon: 'bat', setup(sim) { const z = guard(sim, -0.2); z.slamCd = 0; sim.demoNoDodge = true; } },
  ladykip: { label: 'The lady trips into the wall: her kip-up', weapon: 'pistol', setup(sim) { const p = sim.player; p.z = 10.05; const z = put(sim, 0.4, 2.6, 'sprinter'); z.attackCd = 0; } },
  walkers: { label: 'Walkers: the ring, its pounces, the scratch', weapon: 'bat', setup(sim) { for (let i = 0; i < 6; i++) { const a = Math.PI + (i / 5 - 0.5) * 2.4; put(sim, 0.4 + Math.sin(a) * 6, 1.0 + Math.cos(a) * 6, 'normal', a + Math.PI); } sim.player.z = 1.0; } },
  runner: { label: 'The orange runner: the dash rake', weapon: 'bat', setup(sim) { put(sim, 0.4, -5.5, 'runner'); } },
  floor: { label: 'Out of the floor: the breach', weapon: 'pistol', setup(sim) { sim.spawnFromFloor(-0.8, -1.6, { look: 'patient' }); sim.spawnFromFloor(2.2, -0.6, { kind: 'runner' }); } },
  // (2026-10-18, the user: "show me 4 different clothing variations ... nurse scrub color ... keep the orange look") a
  // lineup, left to right: her own blue, the runner's orange, then the new colours (main.js SCRUBS)
  nurses: { label: 'Nurse scrubs: blue · navy · charcoal (and the runner\'s orange)', weapon: 'bat', setup(sim, game) {
    const keys = [null, 'navy', 'charcoal', 'orange'];
    const zs = keys.map((k, i) => { const z = sim.spawnZombie('placed', { x: -1.65 + i * 1.1, z: -0.4, yaw: 0, passive: true, speedMul: 0 }); z.look = 'nurse'; z.scrubs = k; return z; });
    sim.player.z = 3.6;
    const paint = () => { let ok = true; for (const z of zs) { const v = game.zviews.get(z.id); if (v) game.scrubs(v, z.scrubs); else ok = false; } if (!ok) setTimeout(paint, 100); };
    setTimeout(paint, 100);
  } },
  // (2026-10-18, the user: the IV pole walker, the legless one in a wheelchair, a surgeon, an old patient in every bed)
  hospital: { label: 'The hospital\'s own: drip stand, wheelchair, surgeon, a patient in bed (walk up to the bed)', weapon: 'bat', setup(sim, game) {
    put(sim, -2.6, -4.2, 'normal', 0, 'iv'); put(sim, 0.4, -5.0, 'normal', 0, 'chair'); put(sim, 3.0, -4.4, 'normal', 0, 'surgeon');
    const B = { x: 4.4, z: -1.8, yaw: 0, side: 1 }, b = sim.spawnZombie('placed', { x: B.x, z: B.z, yaw: 0, passive: true, speedMul: 0, prop: 'bed', bed: B });
    b.set('chase'); b.dormant = { wake: Infinity, sense: 3.2, speedMul: 0.9 };
    const S = game.propSrc?.bedOpen; if (S) { const o = S.clone(); o.position.set(B.x, 0, B.z); o.rotation.y = B.yaw; game.scene.add(o); game.propsAdd(o); }
  } },
  // (2026-10-18) the execution: a walker that pounces; dodge it at the last moment (Dodge / Shift), then attack it while it
  // glows (render/execution.js). Change weapons with Swap to see each finisher
  execute: { label: 'Finisher: perfect-dodge the pounce, then attack the glowing walker (Swap: each weapon)', weapon: 'bat', setup(sim) {
    for (const [x, z] of [[-1.6, -4.6], [2.4, -5.2]]) { const q = put(sim, x, z, 'normal', 0); q.pouncer = true; q.pounceCd = 0.5; }
  } },
  low: { label: 'Low targets: a crawler, a floored walker', weapon: 'axe', setup(sim) { const c = put(sim, 0.4, 0.6, 'normal'); c.crawling = true; c.broken = 'LowerLeg_L'; const k = put(sim, 1.6, 0.4, 'normal'); k.knockDown(0, 1, sim); } },
};
function put(sim, x, z, kind = 'normal', yaw = 0, prop) { const q = sim.spawnZombie('placed', { x, z, yaw, kind, prop }); q.set('chase'); return q; }
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
    D.setup(sim, game);
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
