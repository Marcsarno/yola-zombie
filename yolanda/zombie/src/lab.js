// Combat lab (combat.html?lab=bat): the REAL game - simulation, attack states, root motion, blending, hit test - run
// frame by frame beside the reference footage, for comparing and diagnosing melee. Nothing here changes gameplay.
//   transport: play / pause, step one 60 Hz frame back (replays from the start) or forward, speed 1 / 0.5 / 0.25 / 0.1
//   scenario: one still zombie, one walking in, three in a row, or a miss; input: hold, three taps, one swing
//   overlays: skeleton, both grips + bat tip, the simulation's bat segment (red while it can damage), collision rings,
//             the rendered hips against the gameplay position (drift)
//   readout: attack, clip frame, hit window, hits, every animation action with weight > 0, hit-stop, frame time
//   reference: the source clip (clip 13) at the frame the combo is playing, with the detected skeleton drawn on it
import * as THREE from 'three';
import { attacksOf, attackFrame, BAT_ATTACKS, retimeBat } from './core/weapons.js';
import { ZS } from './core/zombies.js';
import { meleeWorldSegment } from './core/player.js';

const REF = { dir: 'assets/ref/bat13/', offset: 19, first: 20, last: 184, clip: 'bat_combo_mc' }; // clip frame + 19 = reference frame
const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const CAMS = { game: null, side: { target: 'yola', yaw: 90, pitch: 6, dist: 4.2, h: 0.95 }, front: { target: 'yola', yaw: 0, pitch: 8, dist: 4.2, h: 0.95 }, top: { target: 'yola', yaw: 0, pitch: 80, dist: 5, h: 0.4 } };

export function startLab(game, weapon = 'bat') {
  const g = game, scene = g.scene, T = THREE;
  const S = { playing: false, speed: 0.25, frame: 0, scen: 'still', input: 'hold', cam: 'side', skel: true, marks: true, rings: true, ref: true, weapon, log: [], contact: [] };
  // ---- UI
  const css = document.createElement('style');
  css.textContent = `#lab{position:fixed;left:6px;bottom:6px;z-index:50;background:rgba(14,20,24,.88);color:#e8eef0;font:12px/1.35 system-ui,sans-serif;padding:8px;border-radius:10px;max-width:min(560px,96vw)}
  #lab button,#lab select{font:inherit;background:#28363d;color:#e8eef0;border:1px solid #3d525b;border-radius:6px;padding:4px 7px;margin:1px}
  #lab button.on{background:#2f9fa0}#lab .row{margin:3px 0;display:flex;flex-wrap:wrap;align-items:center;gap:3px}
  #labRead{font:11px/1.3 ui-monospace,monospace;white-space:pre;max-height:30vh;overflow:auto;margin-top:4px}
  #labRef{position:fixed;right:6px;top:6px;z-index:50;width:min(46vw,480px);background:#111;border-radius:8px;overflow:hidden}
  #labRef canvas{display:block;width:100%}#menu,#hud,#touch,.sheet{display:none!important}#labRef div{color:#ddd;font:11px system-ui;padding:3px 6px}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'lab';
  box.innerHTML = `<div class="row"><b>Combat lab</b>
    <button id="lbPlay">Play</button><button id="lbBack">&#9664; 1</button><button id="lbStep">1 &#9654;</button><button id="lbRestart">Restart</button>
    <select id="lbSpeed"><option value="1">1x</option><option value="0.5">0.5x</option><option value="0.25" selected>0.25x</option><option value="0.1">0.1x</option></select></div>
    <div class="row"><select id="lbScen"><option value="still">1 zombie, still</option><option value="walk">1 zombie, walking in</option><option value="three">3 zombies</option><option value="miss">miss (no target)</option></select>
    <select id="lbInput"><option value="hold">hold attack</option><option value="taps">tap x3</option><option value="one">one swing</option></select>
    <select id="lbCam"><option value="side" selected>side (as clip 13)</option><option value="game">gameplay camera</option><option value="front">front</option><option value="top">top</option></select></div>
    <div class="row"><button id="lbSkel" class="on">skeleton</button><button id="lbMarks" class="on">grips + bat</button><button id="lbRings" class="on">collision</button><button id="lbRefT" class="on">reference</button></div>
    <div class="row" id="lbTiming"></div>
    <div id="labRead"></div>`;
  document.body.appendChild(box);
  const refBox = document.createElement('div'); refBox.id = 'labRef';
  refBox.innerHTML = '<canvas id="labRefC" width="480" height="263"></canvas><div id="labRefT">reference</div>';
  document.body.appendChild(refBox);
  const $ = (id) => document.getElementById(id);
  const tog = (id, key) => $(id).onclick = () => { S[key] = !S[key]; $(id).classList.toggle('on', S[key]); redraw(); };
  tog('lbSkel', 'skel'); tog('lbMarks', 'marks'); tog('lbRings', 'rings'); tog('lbRefT', 'ref');
  $('lbPlay').onclick = () => { S.playing = !S.playing; $('lbPlay').textContent = S.playing ? 'Pause' : 'Play'; $('lbPlay').classList.toggle('on', S.playing); };
  $('lbStep').onclick = () => { S.playing = false; stepFrames(1); };
  $('lbBack').onclick = () => { S.playing = false; const f = S.frame - 1; reset(); stepFrames(Math.max(0, f)); };
  $('lbRestart').onclick = () => { reset(); redraw(); };
  // transition timing, live: the blend in from idle, each wind-up's speed, the recovery blends (re-times the hit windows too)
  const tim = [['enter blend', 0, 'enterBlend', 0, 0.4, 0.02], ['wind-up 2', 1, 'windRate', 0.8, 2.5, 0.05], ['wind-up 3', 2, 'windRate', 0.8, 2.5, 0.05], ['recover 1', 0, 'recover', 0.1, 0.8, 0.02], ['recover 3', 2, 'recover', 0.1, 0.8, 0.02]];
  for (const [label, i, key, lo, hi, st] of tim) {
    const w = document.createElement('label');
    w.innerHTML = label + ' <input type="range" min="' + lo + '" max="' + hi + '" step="' + st + '" value="' + BAT_ATTACKS[i][key] + '" style="width:70px;vertical-align:middle"> <span>' + BAT_ATTACKS[i][key] + '</span>';
    const inp = w.querySelector('input'), sp = w.querySelector('span');
    inp.oninput = () => { sp.textContent = inp.value; retimeBat([{ i, [key]: +inp.value }]); reset(); redraw(); };
    $('lbTiming').appendChild(w);
  }
  $('lbSpeed').onchange = (e) => { S.speed = +e.target.value; };
  $('lbScen').onchange = (e) => { S.scen = e.target.value; reset(); redraw(); };
  $('lbInput').onchange = (e) => { S.input = e.target.value; reset(); redraw(); };
  $('lbCam').onchange = (e) => { S.cam = e.target.value; g.cam(CAMS[S.cam]); redraw(); };
  addEventListener('keydown', (e) => { if (e.code === 'Space') { $('lbPlay').click(); e.preventDefault(); } if (e.code === 'ArrowRight') $('lbStep').click(); if (e.code === 'ArrowLeft') $('lbBack').click(); });

  // ---- reference frames and the detected skeleton
  const refImgs = {}; let pose = null;
  fetch(REF.dir + 'pose.json').then((r) => r.json()).then((p) => { pose = p; }).catch(() => {});
  const refImg = (f) => { if (!refImgs[f]) { const im = new Image(); im.src = `${REF.dir}f${String(f).padStart(4, '0')}.jpg`; im.onload = () => redraw(); refImgs[f] = im; } return refImgs[f]; };
  for (let f = REF.first; f <= REF.last; f += 1) refImg(f); // (preload: 1.5 MB in all)

  // ---- overlays
  const ov = new T.Group(); ov.name = 'labOverlay'; scene.add(ov);
  const skel = new T.SkeletonHelper(g.yola.outer); skel.material.depthTest = false; skel.renderOrder = 10; scene.add(skel);
  const dot = (c, r = 0.035) => { const m = new T.Mesh(new T.SphereGeometry(r, 12, 8), new T.MeshBasicMaterial({ color: c, depthTest: false })); m.renderOrder = 11; ov.add(m); return m; };
  const gripR = dot(0xff3355), gripL = dot(0x33aaff), tip = dot(0xffee33, 0.04), hipsDot = dot(0xff66ff, 0.03);
  const segGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  const seg = new T.Line(segGeo, new T.LineBasicMaterial({ color: 0xff2222, depthTest: false })); seg.renderOrder = 12; ov.add(seg);
  const trailPts = []; const trail = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xff8844, depthTest: false })); trail.renderOrder = 12; ov.add(trail);
  const ring = (r, c) => { const m = new T.Mesh(new T.RingGeometry(r - 0.012, r, 40), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide, depthTest: false, transparent: true, opacity: 0.8 })); m.rotation.x = -Math.PI / 2; m.renderOrder = 9; ov.add(m); return m; };
  const pRing = ring(0.3, 0x44ff88); const zRings = [];

  // ---- scenario: the same start every time, scripted input
  function reset() {
    S.frame = 0; S.log.length = 0; S.contact.length = 0; trailPts.length = 0;
    g.setPaused(false); g.hideZombieViews(); const sim = g.sim;
    if (!sim._labEmit) { const em = sim.emit.bind(sim); sim.emit = (e) => { em(e); if (['swing', 'batHit', 'batMiss', 'hitPause', 'zombieDeath', 'zombieKnockdown'].includes(e.type)) S.log.push(`${(S.frame / 60).toFixed(2)}s ${e.type}${e.combo !== undefined ? ' c' + e.combo : ''}${e.dur ? ' ' + e.dur.toFixed(3) : ''}`); }; sim._labEmit = true; } sim.director.update = () => {}; sim.zombies.length = 0; sim.events.length = 0;
    const p = sim.player; p.setLoadout([S.weapon]); p.hp = p.maxHp = 9999; p.x = 0; p.z = 0; p.vx = p.vz = 0; p.aimYaw = p.aimTarget = 0; p.dead = false;
    const add = (x, z, walk) => { const zz = sim.spawnZombie(null, { x, z, yaw: Math.PI }); zz.set(ZS.CHASE); zz.passive = true; zz.attackCd = 99; zz.speedMul = walk ? 0.8 : 0; zz.hp = zz.maxHp = 99999; };
    if (S.scen === 'still') add(0, 1.15);
    if (S.scen === 'walk') add(0.2, 3.2, true);
    if (S.scen === 'three') { add(-0.55, 1.2); add(0.15, 1.35); add(0.75, 1.05); }
    for (const r of zRings) ov.remove(r); zRings.length = 0;
    for (let i = 0; i < sim.zombies.length; i++) zRings.push([ring(0.3, 0xffaa33), ring(0.2, 0xffdd66)]);
    g.scriptInput = (s) => {
      const t = S.frame / 60; let held = true;
      if (S.input === 'taps') held = [0, 0.5, 1.3].some((a) => t >= a && t < a + 0.08);
      if (S.input === 'one') held = t < 0.08;
      return { moveX: 0, moveZ: 0, aimX: 0, aimZ: held ? 1 : 0, swapPresses: 0, usePresses: 0 };
    };
    g.cam(CAMS[S.cam]);
  }
  function stepFrames(n, dt = 1 / 60) {
    for (let i = 0; i < n; i++) { g.tick(1, dt, i === n - 1); S.frame += dt * 60; collect(); }
    redraw();
  }
  function collect() {
    if (S.log.length > 14) S.log.splice(0, S.log.length - 14);
  }

  const _a = {}, v = new T.Vector3(), v2 = new T.Vector3();
  function redraw() {
    const sim = g.sim, p = sim.player, y = g.yola, a = p.action, A = a.type === 'swing' ? attacksOf(p.equipped)[a.combo] : null;
    skel.visible = S.skel; ov.visible = true;
    gripR.visible = gripL.visible = tip.visible = hipsDot.visible = S.marks;
    y.grip('Right', v); gripR.position.copy(v); y.grip('Left', v2); gripL.position.copy(v2);
    let offL = NaN, offR = NaN;
    if (y.melee) { const d = new T.Vector3(0, 0, 1).applyQuaternion(y.melee.quaternion); tip.position.copy(y.melee.position).addScaledVector(d, 0.74);
      const off = (q) => { const w = q.clone().sub(y.melee.position); return w.sub(d.clone().multiplyScalar(w.dot(d))).length(); };
      offL = off(v2); offR = off(v); S.contact.push({ t: S.frame / 60, l: offL, r: offR, act: p.action.type, combo: p.action.combo }); }
    y.bones.Hips.getWorldPosition(v); hipsDot.position.set(v.x, 0.02, v.z);
    // the simulation's bat segment and its tip trail (red while it can damage)
    let active = false;
    if (A && A.PATH) {
      const s = meleeWorldSegment(p, A, a.st, _a); active = a.st >= A.activeStart && a.st <= a.activeEnd;
      segGeo.setFromPoints([new T.Vector3(s.hx, s.hy, s.hz), new T.Vector3(s.tx, s.ty, s.tz)]); seg.visible = S.marks;
      seg.material.color.set(active ? 0xff2222 : 0x777777);
      if (active) { trailPts.push(new T.Vector3(s.tx, s.ty, s.tz)); trail.geometry.setFromPoints(trailPts); }
    } else seg.visible = false;
    trail.visible = S.marks && trailPts.length > 1;
    pRing.visible = S.rings; pRing.position.set(p.x, 0.02, p.z);
    sim.zombies.forEach((z, i) => { const [b, ar] = zRings[i] || []; if (!b) return; b.visible = ar.visible = S.rings && z.alive; b.position.set(z.x, 0.02, z.z); ar.position.set(z.x + Math.sin(z.yaw) * 0.36, 0.02, z.z + Math.cos(z.yaw) * 0.36); });
    g.renderer.render(scene, g.camera);
    // readout
    const fr = A ? attackFrame(A, Math.min(a.st, 99)) : null;
    const drift = Math.hypot(v.x - p.x, v.z - p.z);
    const acts = Object.entries(y.actions).map(([n, x]) => [n, x.getEffectiveWeight(), x.time]).filter((q) => q[1] > 0.01).sort((q, r) => r[1] - q[1]).map((q) => `  ${q[0].padEnd(24)} w ${q[1].toFixed(2)}  t ${q[2].toFixed(3)}`);
    $('labRead').textContent = [
      `t ${(S.frame / 60).toFixed(3)} s  (frame ${Math.round(S.frame)})   fps ${g.perfReport ? '' : ''}hit-stop ${(g.hitPause || 0).toFixed(3)}`,
      `action ${a.type}${A ? `  #${a.combo + 1} ${A.name}  st ${a.st.toFixed(3)}  clip frame ${fr.toFixed(1)}  ${active ? 'HIT WINDOW' : ''}  hits ${a.hits}` : ''}`,
      `grip contact: left hand ${(offL * 100).toFixed(1)} cm, right hand ${(offR * 100).toFixed(1)} cm from the bat axis`,
      `pos (${p.x.toFixed(2)}, ${p.z.toFixed(2)})  facing ${(p.aimYaw * 57.3).toFixed(1)} deg   rendered hips - gameplay pos: ${(drift * 100).toFixed(1)} cm`,
      'actions (weight, time):', ...acts, 'events:', ...S.log.map((l) => '  ' + l)].join('\n');
    // reference frame (only while the combo clip plays)
    const c = $('labRefC'), cx = c.getContext('2d');
    refBox.style.display = S.ref ? '' : 'none';
    if (S.ref && A && A.clip === REF.clip) {
      const rf = Math.max(REF.first, Math.min(REF.last, Math.round(fr + REF.offset))), im = refImg(rf);
      if (im.complete && im.naturalWidth) { c.height = Math.round(480 * im.naturalHeight / im.naturalWidth); cx.drawImage(im, 0, 0, 480, c.height); }
      const lm = pose?.frames?.[rf];
      if (lm) { cx.strokeStyle = '#3f6'; cx.lineWidth = 2; for (const [i, j] of EDGES) { cx.beginPath(); cx.moveTo(lm[i][0] * 480, lm[i][1] * c.height); cx.lineTo(lm[j][0] * 480, lm[j][1] * c.height); cx.stroke(); } }
      $('labRefT').textContent = `reference clip 13, frame ${rf}  (Yola clip frame ${fr.toFixed(1)})`;
    } else $('labRefT').textContent = 'reference: shown while the bat combo plays';
  }
  // ---- the lab's own clock (the game loop is stopped while the lab drives it)
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.playing) stepFrames(1, Math.min(1 / 60, dt * S.speed));
  }
  g.tick(1, 1 / 60); reset(); redraw(); requestAnimationFrame(loop);
  window.lab = { S, reset, stepFrames, redraw, setCam: (k) => { S.cam = k; g.cam(CAMS[k]); } }; // (scriptable, for recordings)
  return S;
}
