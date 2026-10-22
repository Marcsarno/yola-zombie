// Chapter 2's test bot (the old build's lesson: "automated play-throughs caught most regressions. Build the bot early").
// hoodBot.run(): plays the story from wherever the level is: clears every zombie and looter as it appears, takes every
// pickup and uses every prompt in turn (teleporting the player beside them), fast-forwards the lines; logs each stop and
// objective. Runs on game.tick (no real time), so it works in a hidden test tab.
export async function runBot({ maxTicks = 60 * 60 * 12, chunk = 120, log = [] } = {}) {
  const g = window.game, H = window.hood;
  let lastStop = '', lastGoal = '', ticks = 0;
  const lv = () => H.level;
  while (ticks < maxTicks) {
    const L = lv(); if (!L) break;
    if (L.complete) { log.push('COMPLETE at ' + (ticks / 60).toFixed(0) + ' s game time'); break; }
    if (L.stop !== lastStop) { lastStop = L.stop; log.push('stop ' + L.stop); }
    if (L.objective !== lastGoal) { lastGoal = L.objective; log.push('  goal ' + L.objective); }
    H.subs.clear();
    const sim = g.sim, p = sim.player;
    p.hp = p.maxHp;
    for (const z of sim.zombies) if (z.alive) z.takeHit(9999, 0, 1, 1, 'pistol', sim, 'torso');
    // where to go: a pickup first, then a usable prompt, then the stop's next spot
    const target = L.pickups.find((q) => !q.when || q.when()) || L.interact.find((it) => !it.when || it.when());
    if (target) {
      p.x = p.px = target.x + 0.3; p.z = p.pz = target.z + 0.3;
      g.tick(2, 1 / 60, false);
      if (L.interact.includes(target)) { const ok = target.can ? target.can() : true; if (ok) target.use(); else log.push('  blocked: ' + target.id + ' (' + target.no + ')'); }
    } else {
      const go = BOT_SPOTS[L.stop + ':' + L.objective] || BOT_SPOTS[L.objective] || BOT_SPOTS[L.stop]; if (go) { p.x = p.px = go[0]; p.z = p.pz = go[1]; }   // ('help:follow': where the curve's barricade stood)
    }
    g.tick(chunk, 1 / 60, false); ticks += chunk;
    await new Promise((r) => setTimeout(r, 0));
  }
  if (ticks >= maxTicks) log.push('TIMED OUT in stop ' + lastStop + ' / ' + lastGoal);
  return log;
}
// where the bot walks to when a stop waits on the player being somewhere (by objective first, then by stop)
const BOT_SPOTS = { out: [38.4, 38.5], vaccines: [35.6, 38.4], home: [35.6, 38.4], help: [46, 8], 'help:follow': [30.2, 1.6], gate: [19, -12], club: [9.6, -45], pete: [24, -50], dock: [-20, -80], shed: [10.3, -99.6], horde: [-12, -96], leave: [-24, -80] };
