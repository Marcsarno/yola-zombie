// In-game melee checks for the combat lab (combat.html?mode=calm&lab=bat), from the page console:
//   const G = await import('/zombie/tools/labgame.js'); await G.run({ scen: 'still', input: 'hold', frames: 200 })
// Steps the REAL game (simulation + renderer) one 60 Hz frame at a time and reports, per attack:
//   grip   left/right hand distance from the bat's axis (cm)
//   drift  rendered hips vs the gameplay position (cm, horizontal)
//   slide  a planted foot's travel over the floor in world space (cm per frame while its sole is within 2 cm of its lowest over the run)
//   simbat the simulation's bat tip (hit test) vs the rendered bat tip (cm)
const V = () => new window.game.THREE.Vector3();
// the shoes as rendered: skinned vertices weighted mostly to each foot
let FEET = null;
function soles() {
  const y = window.game.yola, v = V(), out = {};
  if (!FEET) {
    FEET = { Left: [], Right: [] };
    y.model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const bn = o.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, '')), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
      for (let i = 0; i < si.count; i += 2) {
        let best = 0, bw = 0;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        const m = /^(Left|Right)(Foot|ToeBase|Toe_End)$/.exec(bn[best]); if (m) FEET[m[1]].push([o, i]);
      }
    });
  }
  // [x, y, z]: x/z the shoe's centre (the lowest vertex hops heel <-> toe as the foot rolls), y the sole (lowest vertex)
  for (const sd of ['Left', 'Right']) { let lo = 1e9, cx = 0, cz = 0; for (const [o, i] of FEET[sd]) { o.getVertexPosition(i, v); o.localToWorld(v); if (v.y < lo) lo = v.y; cx += v.x; cz += v.z; } out[sd] = [cx / FEET[sd].length, lo, cz / FEET[sd].length]; }
  return out;
}
// contact sheet of the real game at the given lab frames (60 Hz steps from a reset), cropped around Yola, saved to
// shots/<name>.png: await G.frames([30, 60, 90], 'name', { cam: 'side', scen: 'still', input: 'hold' })
export async function frames(list, name, { cam = 'side', scen = 'still', input = 'hold', cols = 4, W = 420, crop = 0.62 } = {}) {
  const g = window.game, lab = window.lab;
  lab.S.scen = scen; lab.S.input = input; lab.reset(); lab.setCam(cam);
  const out = document.createElement('canvas'), rows = Math.ceil(list.length / cols);
  out.width = cols * W; out.height = rows * W;
  const c2 = out.getContext('2d'); c2.fillStyle = '#111'; c2.fillRect(0, 0, out.width, out.height);
  let at = 0;
  for (let k = 0; k < list.length; k++) {
    lab.stepFrames(list[k] - at); at = list[k];
    g.renderer.render(g.scene, g.camera);
    const cv = g.renderer.domElement, s = Math.min(cv.width, cv.height) * crop;
    c2.drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, (k % cols) * W, Math.floor(k / cols) * W, W, W);
    const p = g.sim.player;
    c2.fillStyle = '#ff0'; c2.font = 'bold 18px sans-serif';
    c2.fillText(`#${list[k]} ${p.action.type === 'swing' ? 'attack ' + (p.action.combo + 1) + ' f' + (g.yola.clipF ?? 0).toFixed(0) : p.action.type}`, (k % cols) * W + 8, Math.floor(k / cols) * W + 24);
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  await fetch('/__shot/' + name + '.png', { method: 'POST', body: blob });
  return `${out.width}x${out.height}`;
}
// recording: every `every`-th 60 Hz frame of a scenario from one camera, cropped around Yola -> shots/<prefix>_NNN.png
export async function record(prefix, { cam = 'side', scen = 'still', input = 'hold', frames = 180, every = 2, W = 480, crop = 0.62 } = {}) {
  const g = window.game, lab = window.lab;
  lab.S.scen = scen; lab.S.input = input; lab.reset(); lab.setCam(cam);
  lab.stepFrames(1);
  const c = document.createElement('canvas'); c.width = c.height = W; const c2 = c.getContext('2d');
  let n = 0;
  for (let i = 0; i < frames; i += every) {
    lab.stepFrames(every);
    g.renderer.render(g.scene, g.camera);
    const cv = g.renderer.domElement, s = Math.min(cv.width, cv.height) * crop;
    c2.drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, 0, 0, W, W);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await fetch(`/__shot/${prefix}_${String(n++).padStart(3, '0')}.png`, { method: 'POST', body: blob });
  }
  return n;
}
// side by side: columns = sets (e.g. before / after), rows = cameras; frame labels on top -> shots/<out>_NNN.png
export async function compose(cols, rows, out, n, { W = 480, labels = cols, rowLabels = rows } = {}) {
  const c = document.createElement('canvas'); c.width = cols.length * W; c.height = rows.length * W + 34; const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
    for (let a = 0; a < cols.length; a++) for (let b = 0; b < rows.length; b++) {
      try { const im = await createImageBitmap(await (await fetch(`/zombie/shots/${cols[a]}_${rows[b]}_${String(i).padStart(3, '0')}.png`)).blob()); g.drawImage(im, a * W, 34 + b * W, W, W); } catch (e) { /* missing frame */ }
      g.fillStyle = '#ffe14d'; g.font = 'bold 15px sans-serif'; g.fillText(rowLabels[b], a * W + 8, 34 + b * W + 22);
    }
    g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif';
    labels.forEach((l, a) => g.fillText(l, a * W + 10, 24));
    g.font = '14px sans-serif'; g.fillText(`frame ${i * 2} (60 Hz)`, c.width - 150, 24);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await fetch(`/__shot/${out}_${String(i).padStart(3, '0')}.png`, { method: 'POST', body: blob });
  }
  return n;
}
export async function run({ scen = 'still', input = 'hold', frames = 200, dt = 1 / 60 } = {}) {
  const g = window.game, lab = window.lab, y = g.yola;
  lab.S.scen = scen; lab.S.input = input; lab.reset();
  const rows = [], a = V(), b = V(), h = V(), L = V(), R = V(), LT = V(), RT = V();
  lab.stepFrames(1, dt); // (the frame after a reset is the lab moving her into place: not measured)
  for (let i = 0; i < frames; i++) {
    lab.stepFrames(1, dt);
    const p = g.sim.player, act = p.action;
    const c = lab.S.contact[lab.S.contact.length - 1] || {};
    y.bones.Hips.getWorldPosition(h);
    const so = soles();
    let simTip = null;
    let live = false;
    if (act.type === 'swing') { const s = g.simBat(act.st, act.combo); simTip = [s.tx, s.ty, s.tz]; const A = p.attacks[act.combo]; live = act.st >= A.activeStart && act.st <= A.activeEnd; }
    const d = V().set(0, 0, 1).applyQuaternion(y.melee.quaternion), tip = V().copy(y.melee.position).addScaledVector(d, 0.74);
    rows.push({ i, act: act.type, combo: act.combo, l: c.l, r: c.r, drift: Math.hypot(h.x - p.x, h.z - p.z),
      L: so.Left, R: so.Right, live, mL: y.fl?.L.mode, mR: y.fl?.R.mode, simTip, tip: [tip.x, tip.y, tip.z], px: p.x, pz: p.z });
  }
  const by = {};
  for (const r of rows) { const k = r.act === 'swing' ? 'attack ' + (r.combo + 1) : r.act; (by[k] ||= []).push(r); }
  const mx = (xs) => xs.length ? Math.max(...xs) : 0, md = (xs) => xs.length ? xs.slice().sort((p, q) => p - q)[xs.length >> 1] : 0;
  const out = [], floor = {};
  for (const f of ['L', 'R']) floor[f] = Math.min(...rows.map((r) => r[f][1])); // planted level: this shoe's lowest over the run
  out.push(`sole planted level L ${(floor.L * 100).toFixed(1)} R ${(floor.R * 100).toFixed(1)} cm`);
  for (const [k, rs] of Object.entries(by)) {
    const slide = [], slips = [], steps = { L: 0, R: 0 };
    for (const f of ['L', 'R']) {
      for (let j = 1; j < rs.length; j++) { const p = rs[j - 1][f], q = rs[j][f]; if (rs[j]['m' + f] === 'step' || rs[j - 1]['m' + f] === 'step') { steps[f]++; continue; }
        if (p[1] < floor[f] + 0.02 && q[1] < floor[f] + 0.02) { const d = Math.hypot(q[0] - p[0], q[2] - p[2]) * 100; slide.push(d); if (d > 0.8) slips.push(`${f}@${rs[j].i}:${d.toFixed(1)}`); } }
    }
    const sbl = rs.filter((r) => r.live).map((r) => Math.hypot(r.simTip[0] - r.tip[0], r.simTip[1] - r.tip[1], r.simTip[2] - r.tip[2]) * 100);
    const sb = rs.filter((r) => r.simTip).map((r) => Math.hypot(r.simTip[0] - r.tip[0], r.simTip[1] - r.tip[1], r.simTip[2] - r.tip[2]) * 100);
    out.push(`${k.padEnd(9)} frames ${String(rs.length).padStart(3)} | grip L max ${mx(rs.map((r) => r.l || 0) .map((v) => v * 100)).toFixed(1)} R max ${mx(rs.map((r) => r.r || 0).map((v) => v * 100)).toFixed(1)} cm | drift max ${(mx(rs.map((r) => r.drift)) * 100).toFixed(1)} cm | planted slide median ${md(slide).toFixed(2)} max ${mx(slide).toFixed(2)} cm/frame | sim vs rendered tip median ${md(sb).toFixed(1)} max ${mx(sb).toFixed(1)} cm (in the damage window: max ${mx(sbl).toFixed(1)} cm over ${sbl.length} frames) | foot-lock step frames L ${steps.L} R ${steps.R}` + (slips.length ? `
          slips > 0.8 cm (foot@frame:cm) ${slips.join(' ')}` : ''));
  }
  const steps = rows.slice(1).map((r, j) => Math.hypot(r.px - rows[j].px, r.pz - rows[j].pz) * 100);
  out.push(`largest gameplay step ${mx(steps).toFixed(1)} cm/frame; total travel ${(Math.hypot(rows.at(-1).px - rows[0].px, rows.at(-1).pz - rows[0].pz)).toFixed(2)} m`);
  window.__labRows = rows;
  return out.join('\n');
}
