// Chapter 2's test bot (the old build's lesson: "automated play-throughs caught most regressions. Build the bot early").
// hoodBot.run(): plays the story from wherever the level is: clears every zombie and looter as it appears, takes every
// pickup and uses every prompt in turn (teleporting the player beside them), fast-forwards the lines; logs each stop and
// objective. Runs on game.tick (no real time), so it works in a hidden test tab.
// shots: true (the camera check): the lines are heard out, only what is awake near Marc is cleared and never in a shot (the
// shots keep their infected), the one a shot hands Marc the trigger for is put down as it would be, and each shot is saved
// once its framing has settled (zombie/shots/<prefix>_<n>_<stop>.png; the list comes back in the log)
export async function runBot({ maxTicks = 60 * 60 * 12, chunk = 120, log = [], shots = false, prefix = 'v3' } = {}) {
  const g = window.game, H = window.hood;
  let lastStop = '', lastGoal = '', ticks = 0, lastShot = null, n = 0, ids = 0;
  const lv = () => H.level;
  if (shots) chunk = 6;
  while (ticks < maxTicks) {
    const L = lv(); if (!L) break;
    if (L.complete) { log.push('COMPLETE at ' + (ticks / 60).toFixed(0) + ' s game time'); break; }
    if (L.stop !== lastStop) { lastStop = L.stop; log.push('stop ' + L.stop); }
    if (L.objective !== lastGoal) { lastGoal = L.objective; log.push('  goal ' + L.objective); }
    const sim = g.sim, p = sim.player, C = H.cine;
    if (!shots) H.subs.clear();
    p.hp = p.maxHp;
    // (Sophie kept up with the bot's jumps: she walks the way he went, and the bot never walks)
    { const sp = L.sophie; if (sp && sp.mode === 'follow' && Math.hypot(sp.x - p.x, sp.z - p.z) > 12) { const q = { x: p.x + 1.4, z: p.z + 1.4 }; sim.world.resolveCircle(q, 0.3); sp.x = q.x; sp.z = q.z; } }
    if (C.active) {
      const Q = C.q, s = Q?.shots[Q.i];
      if (shots && s && Q.backT < 0 && Q.t >= (s.move || 0) + Math.min(0.6, (s.hold ?? 1.2) * 0.6)) {
        const key = (Q.shots.id ??= ++ids) + ':' + Q.i;
        if (key !== lastShot) { lastShot = key; const name = `${prefix}_${String(++n).padStart(2, '0')}_${L.stop}`; await g.shot(name); log.push('    shot ' + name); }
      }
      // (a shot that hands him the trigger: James, Adam)
      if (s?.aim && s.prompt) for (const z of sim.zombies) if (z.alive && z.looter && z.passive && Math.hypot(z.x - p.x, z.z - p.z) < 9) z.takeHit(9999, 0, 1, 1, 'pistol', sim, 'head');
    } else {
      for (const z of sim.zombies) if (z.alive && (!shots || ((!z.passive || z.dormant) && !z.looter && (z.hoodWave !== 'horde' || !z.dormant) && Math.hypot(z.x - p.x, z.z - p.z) < 30))) z.takeHit(9999, 0, 1, 1, 'pistol', sim, 'torso');   // (shots: not the scenes' own: the rings held still for their shot, the horde until it runs)
      // where to go: a pickup first, then a usable prompt, then the stop's next spot
      const target = L.pickups.find((q) => !q.when || q.when()) || L.interact.find((it) => !it.when || it.when());
      if (target) {
        p.x = p.px = target.x + 0.3; p.z = p.pz = target.z + 0.3;
        g.tick(2, 1 / 60, false);
        if (L.interact.includes(target)) { const ok = target.can ? target.can() : true; if (ok) target.use(); else log.push('  blocked: ' + target.id + ' (' + target.no + ')'); }
      } else {
        const go = BOT_SPOTS[L.stop + ':' + L.objective] || BOT_SPOTS[L.objective] || BOT_SPOTS[L.stop]; if (go && (!shots || (Math.hypot(go[0] - p.x, go[1] - p.z) > 1.5 && !H.subs.busy && L.time - (L.goalT0 || 0) > 3))) { p.x = p.px = go[0]; p.z = p.pz = go[1]; }   // (shots: left where he is once there, so the scenes play round him)   // (by stop:objective first)
      }
    }
    g.tick(chunk, 1 / 60, shots);
    ticks += chunk;
    await new Promise((r) => setTimeout(r, 0));
  }
  if (ticks >= maxTicks) log.push('TIMED OUT in stop ' + lastStop + ' / ' + lastGoal);
  return log;
}
// where the bot walks to when a stop waits on the player being somewhere (by stop:objective first, then objective, then stop)
const BOT_SPOTS = { sneak: [37.8, 39.6], 'house:house': [35.2, 41.6], house: [38.6, 38.5], help: [14.5, 58.5], save: [14.5, 58.5], 'gate:follow': [19, -12.5], gate: [19, -12.5], quiet: [19, -12.5], batteries: [19, -12.5],
  'club:follow': [12.5, -38], club: [11, -40.5], clear: [9.6, -50], pete: [60, -66], savePete: [70, -68], lot: [70, -68], 'dock:follow': [-22, -80.5], dock: [-22, -80.5],
  shed: [-17.2, -95.5], sophie: [-20, -84], horde: [-20, -84], caseBack: [-23.5, -80], after: [-23.5, -80], leave: [-24, -80] };
