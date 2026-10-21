// Chapter 2: Sophie as a companion (Marc's polish brief, design/CH2_POLISH_BRIEF.md "Sophie: believable companion and subtle
// guide"). A frightened person with Marc, not a fixed offset: a small set of behaviours, chosen each step in this order
//   safety  a fight near them: to a spot behind Marc (away from the threats, out of his line of fire, not across it), cower
//   yield   Marc walking at her: a step aside, out of his way
//   lead    at a story beat (level.js sophieLead): a few metres ahead along the way she knows, then wait and look back; back
//           to following if he goes elsewhere; she never goes past the last point (she starts nothing ahead of him)
//   follow  in a band: she stops 2.5 - 3.5 m from him and only moves again once he is 5.6 m off; her spot is beside or behind
//           him (reachable, in his sight, out of his line of fire, readable in the fixed camera), keeping her side
// Ways round walls: she walks straight to her spot when she can see it, else along Marc's own trail (the last point of it
// she can see). Stuck (no headway for 1.4 s): she drops back to the trail. Only far off screen (16 m+) does she close up out
// of sight, onto his trail behind him (never past a gate he had to open: the trail is where he walked).
// The story's own moves (goto, pose, scared, dead) stay in actors.js and override all this.

const GAP = 3.0, FAR = 5.6, NEAR = 1.7, SAFE_R = 3.6;
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the fixed camera looks from the south-east (game +x, +z): how far a point is "down the screen" from Marc, and across it (a
// portrait phone shows about 3.5 m either side of him)
const down = (dx, dz) => dx * 0.57 + dz * 0.82;
const across = (dx, dz) => dx * 0.82 - dz * 0.57;
const offScreen = (dx, dz) => Math.abs(across(dx, dz)) > 3.0 || down(dx, dz) > 4.5 || down(dx, dz) < -7;
const screenCost = (dx, dz) => Math.max(0, Math.abs(across(dx, dz)) - 2.0) * 2.5 + Math.max(0, down(dx, dz) - 2) * 1.5;

export function threatsNear(sim, x, z, r) {
  const out = [];
  for (const q of sim.zombies) {
    if (!q.alive) continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (q.looter ? d < 17 : (!q.passive && d < r) || (!q.dormant && d < 5) || d < 2.5) out.push(q);   // (a sleeping one only when she is right by it)
  }
  return out;
}

// a spot she can stand on: free of walls (0.35 m), seen from Marc, not in a doorway (walls close on two opposite sides)
function standable(w, p, x, z) {
  if (w.blockedAt(x, z, 0.36)) return false;
  if (!w.lineOfSight(p.x, p.z, x, z, 0.9)) return false;
  return true;
}
function narrow(w, x, z) {
  let pairs = 0;
  for (const [dx, dz] of [[1, 0], [0, 1], [0.7, 0.7], [0.7, -0.7]]) if (w.blockedAt(x + dx * 0.75, z + dz * 0.75, 0.05) && w.blockedAt(x - dx * 0.75, z - dz * 0.75, 0.05)) pairs++;
  return pairs > 0;
}
// distance from point (px, pz) to the segment a -> b
function segD(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(px - ax - t * dx, pz - az - t * dz); }
// does the walk a -> b cross the line from Marc to the threats (his line of fire)?
function crosses(ax, az, bx, bz, cx, cz, dx, dz) {
  const s = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = s(cx, cz, dx, dz, ax, az), d2 = s(cx, cz, dx, dz, bx, bz), d3 = s(ax, az, bx, bz, cx, cz), d4 = s(ax, az, bx, bz, dx, dz);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function companionStep(a, dt, level, sim) {
  const p = sim.player, w = sim.world;
  const c = a.cs || (a.cs = { state: 'stand', spot: null, side: 1, pickT: 0, prog: { x: a.x, z: a.z, t: 0 }, yieldT: 0, safeT: 0, losT: 0, fireT: 0 });
  const dm = Math.hypot(p.x - a.x, p.z - a.z), fy = p.aimYaw, fx = Math.sin(fy), fz = Math.cos(fy);
  const pv = Math.hypot(p.vx || 0, p.vz || 0);
  let tx = a.x, tz = a.z, want = 0, face = { x: p.x, z: p.z }, cower = false;
  c.pickT -= dt; c.safeT -= dt; c.yieldT -= dt;

  // ---- safety: a fight near them
  const th = threatsNear(sim, p.x, p.z, 12).concat(threatsNear(sim, a.x, a.z, 8)).filter((q, i, l) => l.indexOf(q) === i);
  if (th.length) {
    let Tx = 0, Tz = 0; for (const q of th) { Tx += q.x; Tz += q.z; } Tx /= th.length; Tz /= th.length;
    const near = (x, z) => th.reduce((m, q) => Math.min(m, Math.hypot(q.x - x, q.z - z)), 1e9);
    const okHere = near(a.x, a.z) > 4 && dm < 4.5 && !offScreen(a.x - p.x, a.z - p.z) && (a.x - p.x) * (Tx - p.x) + (a.z - p.z) * (Tz - p.z) < 0 && Math.abs(ang(Math.atan2(a.x - p.x, a.z - p.z) - fy)) > 0.7;   // (already behind him, clear)
    // (he has moved on, away from her: she runs to keep with him, the way he went, rather than hide alone)
    if (dm > 4.8 || offScreen(a.x - p.x, a.z - p.z)) {
      c.state = 'safe'; c.safe = null; const t = w.lineOfSight(a.x, a.z, p.x, p.z, 0.6) ? { x: p.x - (p.x - a.x) / dm * 2.5, z: p.z - (p.z - a.z) / dm * 2.5 } : trailPoint(a, w);
      return finish(a, c, dt, sim, t ? t.x : p.x, t ? t.z : p.z, 4.6, { x: p.x, z: p.z }, false);
    }
    // (the walk there must not run through the fight: past an infected or through Marc)
    const pathCost = (x, z) => { let k = 0; for (const q of th) if (Math.hypot(q.x - a.x, q.z - a.z) > 2.2 && segD(q.x, q.z, a.x, a.z, x, z) < 2) k += 6; if (segD(p.x, p.z, a.x, a.z, x, z) < 1.6) k += 5; return k; };   // (not the one beside her: she can only get away from it)
    if (!c.safe || c.safeT <= 0 || near(c.safe.x, c.safe.z) < 2.4) {
      c.safeT = 0.9;
      const keep = c.safe && near(c.safe.x, c.safe.z) >= 2.4 ? { x: c.safe.x, z: c.safe.z, s: c.safe.s + 2 - pathCost(c.safe.x, c.safe.z) } : null;   // (no hopping between spots)
      let best = okHere ? { x: a.x, z: a.z, s: 2.5 } : keep;
      const away = Math.atan2(p.x - Tx, p.z - Tz);
      for (let k = 0; k < 12; k++) {
        const t = away + (k - 5.5) * 0.35, x = p.x + Math.sin(t) * SAFE_R, z = p.z + Math.cos(t) * SAFE_R;
        if (!standable(w, p, x, z)) continue;
        let s = Math.min(near(x, z), 8) * 0.5 - Math.abs(ang(t - away)) * 0.9 - Math.hypot(x - a.x, z - a.z) * 0.15;
        if (Math.abs(ang(t - fy)) < 0.6) s -= 3;                              // (his line of fire)
        if (crosses(a.x, a.z, x, z, p.x, p.z, Tx, Tz)) s -= 4;                 // (not across it)
        s -= pathCost(x, z);
        s -= screenCost(x - p.x, z - p.z) * 2;                               // (on the screen)
        if (!best || s > best.s) best = { x, z, s };
      }
      // (cornered: nowhere to go without running through it: she stays down where she is)
      c.safe = best && best.s > -4 ? best : { x: a.x, z: a.z, s: 0 };
    }
    c.state = 'safe';
    if (c.safe && Math.hypot(c.safe.x - a.x, c.safe.z - a.z) > 0.4) { tx = c.safe.x; tz = c.safe.z; want = 4.6; }
    else cower = true;
    face = { x: Tx, z: Tz };
    return finish(a, c, dt, sim, tx, tz, want, face, cower);
  }
  c.safe = null;
  if (c.state === 'safe') { c.state = 'move'; c.pickT = 0; }   // (the fight over: back to him)

  // ---- yield: Marc walking at her
  if (pv > 1.2 && dm < 3.2 && c.state !== 'lead') {
    const hx = p.vx / pv, hz = p.vz / pv, rx = a.x - p.x, rz = a.z - p.z, along = rx * hx + rz * hz, lat = -rx * hz + rz * hx;
    if (along > 0 && Math.abs(lat) < 1.0) {
      const sd = lat >= 0 ? 1 : -1;
      for (const s of [sd, -sd]) { const x = a.x - hz * s * 1.4, z = a.z + hx * s * 1.4; if (!w.blockedAt(x, z, 0.32)) { c.spot = { x, z }; c.state = 'yield'; c.yieldT = 0.9; break; } }
    }
  }
  if (c.state === 'yield') {
    if (c.yieldT <= 0 || !c.spot) c.state = 'stand';
    else { tx = c.spot.x; tz = c.spot.z; want = 2.2; return finish(a, c, dt, sim, tx, tz, want, face, false); }
  }

  // ---- lead: a few metres ahead along the way she knows, then wait and look back
  const L = a.lead;
  if (L && !L.done) {
    const end = L.pts[L.pts.length - 1], toEnd = (x, z) => Math.hypot(end[0] - x, end[1] - z);
    while (L.i < L.pts.length - 1 && toEnd(L.pts[L.i][0], L.pts[L.i][1]) > toEnd(p.x, p.z) - 1.5) L.i++;   // (points he has passed)
    if (toEnd(p.x, p.z) < toEnd(a.x, a.z) - 2 && L.i >= L.pts.length - 1) L.done = true;                   // (he went on past her)
    else if (dm < 11) {
      const P = L.pts[L.i], dP = Math.hypot(P[0] - a.x, P[1] - a.z);
      c.state = 'lead';
      const edge = dm > 5.5 || offScreen(a.x - p.x, a.z - p.z);   // (no further than he can see her: she waits there, looking back)
      if (dP > 0.45 && !edge) { tx = P[0]; tz = P[1]; want = 1.6; face = null; }                      // (slower when he lags)
      else if (dm < 4.5 && L.i < L.pts.length - 1) L.i++;                                                   // (he caught up: on)
      return finish(a, c, dt, sim, tx, tz, want, face, false);
    }
    // (he went elsewhere: she follows him, the lead waits)
  }

  // ---- follow, in a band
  if (c.state === 'lead') c.state = 'move';
  const lost = !w.lineOfSight(p.x, p.z, a.x, a.z, 0.9); c.losT = lost ? c.losT + dt : 0;
  // (in his line of fire for half a second, or by a prompt he needs: out of the way; a sweep of his aim past her is left alone)
  c.fireT = Math.abs(ang(Math.atan2(a.x - p.x, a.z - p.z) - fy)) < 0.5 && dm < 6 ? c.fireT + dt : 0;
  const byPrompt = (level.interact || []).some((it) => Math.hypot(it.x - a.x, it.z - a.z) < 1.5);
  c.offT = offScreen(a.x - p.x, a.z - p.z) ? (c.offT || 0) + dt : 0;
  if (c.state === 'stand' && (dm > FAR || c.losT > 1.2 || c.fireT > 0.5 || c.offT > 1.0 || byPrompt || dm < NEAR || narrow(w, a.x, a.z))) { c.state = 'move'; c.pickT = 0; }
  if (c.state === 'move') {
    if (c.pickT <= 0) { c.pickT = pv > 0.8 ? 0.3 : 0.6; c.spot = pickSpot(a, c, p, w, fy, level); }
    const S = c.spot || { x: p.x, z: p.z };
    let gx = S.x, gz = S.z;
    if (!w.lineOfSight(a.x, a.z, gx, gz, 0.6)) { const t = trailPoint(a, w); if (t) { gx = t.x; gz = t.z; } }   // (round the wall, his way)
    const dS = Math.hypot(S.x - a.x, S.z - a.z);
    if (((dS < 0.4 && pv < 0.8) || (dm < GAP + 0.4 && !lost)) && !narrow(w, a.x, a.z)) { c.state = 'stand'; }   // (while he walks on, she walks on)
    else {
      tx = gx; tz = gz;
      want = Math.min(5.2, Math.max(1.3, pv + (dm - GAP) * 0.9));   // (his pace, and a little more to close the gap: no lagging off the screen)
      if (dm < 2.2) want = 0.9;
      face = null;
    }
  }
  return finish(a, c, dt, sim, tx, tz, want, face, false);
}

// her follow spot: beside or behind Marc at GAP, where she can stand, he can see her, out of his line of fire, readable in the
// camera; the side she was on kept unless it is no good
function pickSpot(a, c, p, w, fy, level) {
  const pv = Math.hypot(p.vx || 0, p.vz || 0), head = pv > 0.8 ? Math.atan2(p.vx, p.vz) : fy;
  let best = null;
  for (const [off, side] of [[Math.PI, 0], [Math.PI - 0.6, 1], [Math.PI + 0.6, -1], [Math.PI / 2 + 0.25, 1], [-Math.PI / 2 - 0.25, -1], [Math.PI - 1.1, 1], [Math.PI + 1.1, -1]]) {
    const t = head + off, x = p.x + Math.sin(t) * GAP, z = p.z + Math.cos(t) * GAP;
    if (!standable(w, p, x, z)) continue;
    let s = -Math.hypot(x - a.x, z - a.z) * 0.35;
    if (side && side === c.side) s += 1.2;                                 // (her side: no switching back and forth)
    if (Math.abs(ang(t - fy)) < 0.6) s -= 4;                               // (his line of fire)
    s -= screenCost(x - p.x, z - p.z);                                     // (readable in the fixed camera: on the screen)
    if (narrow(w, x, z)) s -= 3;                                           // (a doorway, a gap)
    if ((level.interact || []).some((it) => Math.hypot(it.x - x, it.z - z) < 1.5)) s -= 3;   // (a prompt he needs)
    if (!best || s > best.s) best = { x, z, s, side };
  }
  if (best?.side) c.side = best.side;
  return best || trailPoint(a, w) || { x: p.x, z: p.z };
}
// the newest point of Marc's trail she can see (her way round corners and through doors, single file)
function trailPoint(a, w) {
  const tl = a.trail;
  for (let i = tl.length - 1; i >= Math.max(0, tl.length - 60); i--) if (w.lineOfSight(a.x, a.z, tl[i].x, tl[i].z, 0.6)) return tl[i];
  return tl[0] || null;
}

// move toward (tx, tz) at `want` m/s (smooth start and stop, smooth turns); headway check; the moves her speed asks for
function finish(a, c, dt, sim, tx, tz, want, face, cower) {
  const w = sim.world, p = sim.player;
  a.speed += (want - a.speed) * Math.min(1, dt * (want > a.speed ? 4 : 6));
  if (a.speed > 0.05) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      // (passing Marc: round him, never through him; 1.5 m clear)
      let ux = dx / d, uz = dz / d; const ex = a.x - p.x, ez = a.z - p.z, ed = Math.hypot(ex, ez);
      if (ed < 1.5 && ed > 1e-3) { const k = (1.5 - ed) * 2.2; ux += (ex / ed) * k; uz += (ez / ed) * k; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; }
      const st = Math.min(d, a.speed * dt), q = { x: a.x + ux * st, z: a.z + uz * st };
      w.resolveCircle(q, 0.28); a.x = q.x; a.z = q.z;
      const y = Math.atan2(dx, dz), e = ang(y - a.yaw); a.yaw += Math.sign(e) * Math.min(Math.abs(e), dt * 6.5);
    } else a.speed *= 0.5;
  } else if (face) {
    const y = Math.atan2(face.x - a.x, face.z - a.z), e = ang(y - a.yaw);
    if (Math.abs(e) > 0.18) a.yaw += Math.sign(e) * Math.min(Math.abs(e), dt * 2.6);  // (no fidgeting: small angles left as they are)
  }
  // headway: wanting to move but getting nowhere -> his trail; far off and unseen -> close up behind him, out of sight
  c.prog.t += dt;
  if (c.prog.t > 1.4) {
    const moved = Math.hypot(a.x - c.prog.x, a.z - c.prog.z);
    if (want > 0.8 && moved < 0.3) { const t = trailPoint(a, w); if (t) { c.spot = { x: t.x, z: t.z }; c.pickT = 1.2; c.stuck = (c.stuck || 0) + 1; } }
    else c.stuck = 0;
    c.prog = { x: a.x, z: a.z, t: 0 };
  }
  const dm = Math.hypot(p.x - a.x, p.z - a.z);
  if (dm > 16 && a.trail.length > 10) {   // (13 m+ back along his trail: off the screen, she walks in from there)
    const q = a.trail.slice().reverse().find((t) => Math.hypot(t.x - p.x, t.z - p.z) > 13 && Math.hypot(t.x - p.x, t.z - p.z) < dm - 2);
    if (q) { const r = { x: q.x, z: q.z }; w.resolveCircle(r, 0.3); a.x = r.x; a.z = r.z; a.speed = 0; c.state = 'move'; c.pickT = 0; a.recovered = (a.recovered || 0) + 1; }
  }
  a.cower = cower ? Math.min(1.5, a.cower + dt) : Math.max(0, a.cower - dt * 2);
}
