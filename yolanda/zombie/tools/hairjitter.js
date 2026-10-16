// Ponytail sway jitter check (PONYTAIL_PLAN.md step 5). Run in the Rig Lab (viewer.html?char=yola2) console:
//   await (await import('/zombie/tools/hairjitter.js')).hairJitter()
// Plays each clip frame by frame at exactly 30, 60 and 120 fps (and 60 fps with +-25% random frame times), runs the
// sway, and reports for the ponytail tip: acceleration (99th percentile, m/s^2; compare with the head's), "zigzag" =
// % of frames whose acceleration reverses against the previous frame (jitter shows as + - + -), and how far (mm) the
// tip's path at 30 / 60 / jittery 60 fps strays from the 120 fps path (frame-rate independence).
export async function hairJitter(clips = ['bat_idle', 't_hit_head', 'p_run_strafe_left_plain', 'ual_Sword_Regular_Combo']) {
  const L = window.__lab, M = L.main, H = M.hair;
  let head = null; M.obj.traverse((o) => { if (o.isBone && /Head$/.test(o.name)) head = o; });
  const V = L.camera.position.constructor;
  const run = (fps, noise = 0) => {
    const rec = []; H.on = true; H.reset(); let t = 0, seed = 1;
    const T = (M.frames - 1) / 30, rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    while (t <= T + 1e-9) {
      const dt = (1 / fps) * (1 + noise * (rnd() * 2 - 1));
      M.setFrame(1 + t * 30); H.update(rec.length ? dt : 1 / fps);
      const hp = head.getWorldPosition(new V()); rec.push([t, H.p[2].x, H.p[2].y, H.p[2].z, hp.x, hp.y, hp.z]); t += dt;
    }
    return rec;
  };
  const acc = (rec, o) => {
    const a = [];
    for (let i = 1; i < rec.length - 1; i++) {
      const h1 = rec[i][0] - rec[i - 1][0], h2 = rec[i + 1][0] - rec[i][0]; let s = 0;
      for (let k = 0; k < 3; k++) { const d = ((rec[i + 1][o + k] - rec[i][o + k]) / h2 - (rec[i][o + k] - rec[i - 1][o + k]) / h1) / ((h1 + h2) / 2); s += d * d; }
      a.push(Math.sqrt(s));
    }
    a.sort((x, y) => x - y); return Math.round(a[Math.floor(a.length * 0.99)]);
  };
  const zig = (rec, o) => {
    let flips = 0, n = 0, prev = null;
    for (let i = 1; i < rec.length - 1; i++) {
      const d = [0, 1, 2].map((k) => rec[i + 1][o + k] - 2 * rec[i][o + k] + rec[i - 1][o + k]), m = Math.hypot(...d);
      if (m < 1e-7) { prev = null; continue; }
      if (prev) { if ((d[0] * prev[0] + d[1] * prev[1] + d[2] * prev[2]) / (m * Math.hypot(...prev)) < -0.5) flips++; n++; }
      prev = d;
    }
    return n ? +(flips / n * 100).toFixed(1) : 0;
  };
  const at = (rec, t) => {
    let i = rec.findIndex((r) => r[0] > t); if (i <= 0) i = rec.length - 1;
    const a = rec[i - 1], b = rec[i], u = Math.min(1, Math.max(0, (t - a[0]) / ((b[0] - a[0]) || 1)));
    return [1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * u);
  };
  const dev = (r1, r2) => { let m = 0; for (const r of r1) { const q = at(r2, r[0]); m = Math.max(m, Math.hypot(r[1] - q[0], r[2] - q[1], r[3] - q[2])); } return +(m * 1000).toFixed(1); };
  const out = {};
  for (const clip of clips) {
    await L.setClip(clip); L.S.playing = false;
    const r30 = run(30), r60 = run(60), r120 = run(120), rj = run(60, 0.25);
    out[clip] = {
      tipAcc: { f30: acc(r30, 1), f60: acc(r60, 1), f120: acc(r120, 1), jit60: acc(rj, 1) }, headAcc: { f60: acc(r60, 4), f120: acc(r120, 4) },
      tipZigzagPct: { f30: zig(r30, 1), f60: zig(r60, 1), f120: zig(r120, 1), jit60: zig(rj, 1) }, headZigzagPct: { f60: zig(r60, 4), f120: zig(r120, 4) },
      mmFrom120: { f30: dev(r30, r120), f60: dev(r60, r120), jit60: dev(rj, r120) },
    };
  }
  return out;
}
