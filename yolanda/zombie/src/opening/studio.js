// The Reveal Studio (2026-10-19, the user: "I want more studio style control for the opening reveal... giving me dials and
// controls for when it's dark, and when it's casting some light to show the silhouette... how many times it flickers and the
// timing"). A panel over the real reveal (combat.html?intro=1&studio=1): play it from any beat, pause, slow it down, and turn
// every dial in revealtune.js while it plays. Save writes them to assets/opening/reveal_tuning.json (the dev server's
// /__reveal/tuning.json), which the opening reads at load: what is tuned here is what the game plays.
import { RT, PHASES, REVEAL_DEFAULTS, resetTuning, tuningJSON, generateFlashes } from './revealtune.js';

const BEATS = [ // [mark, label]: where "Play from" starts (the reveal plays live, with sound, from there)
  ['get-yola-done', 'From the top (shut doors)'],
  ['ding', 'The DING (floor 7)'],
  ['beat6', 'Doors open: fog, tilt up'],
  ['flashes', 'The flashes'],
  ['beat8', 'The patient, red-lit'],
  ['beat9', 'Walk-out (feet)'],
  ['beat11', 'The launch'],
];
const CSS = `
#revStudio{position:fixed;top:8px;right:8px;width:330px;max-height:calc(100vh - 16px);overflow:auto;z-index:90;background:rgba(14,18,22,.93);color:#dfe6ea;
 font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;border:1px solid #2c3640;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
#revStudio.min{width:auto;max-height:none;overflow:visible}
#revStudio.min .rsBody{display:none}
#revStudio header{display:flex;align-items:center;gap:6px;padding:8px 10px;position:sticky;top:0;background:#151b21;border-bottom:1px solid #2c3640;z-index:1}
#revStudio header b{flex:1;font-size:13px;letter-spacing:.02em}
#revStudio button{background:#26313a;color:#e8eef2;border:1px solid #3a4752;border-radius:6px;padding:4px 8px;font:inherit;cursor:pointer}
#revStudio button:hover{background:#31404c}
#revStudio button.hot{background:#c8562d;border-color:#e0703f}
#revStudio select,#revStudio input[type=number]{background:#1d252c;color:#e8eef2;border:1px solid #3a4752;border-radius:5px;font:inherit;padding:2px 4px}
#revStudio details{border-bottom:1px solid #26303a}
#revStudio summary{padding:8px 10px;cursor:pointer;font-weight:600;color:#f2c48d;list-style:none}
#revStudio summary::before{content:'▸ ';color:#7d8a95}
#revStudio details[open] summary::before{content:'▾ '}
#revStudio .rsSec{padding:2px 10px 10px}
#revStudio .row{display:grid;grid-template-columns:104px 1fr 44px;align-items:center;gap:6px;margin:3px 0}
#revStudio .row label{color:#aab6bf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#revStudio .row input[type=range]{width:100%;accent-color:#e0703f}
#revStudio .row output{text-align:right;color:#fff;font-variant-numeric:tabular-nums}
#revStudio .line{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:5px 0}
#revStudio .note{color:#8796a1;font-size:11px;margin:4px 0}
#revStudio .status{padding:6px 10px;color:#9fe0b5;font-variant-numeric:tabular-nums;border-bottom:1px solid #26303a}
#revStudio table{width:100%;border-collapse:collapse;margin-top:4px}
#revStudio td{padding:1px 2px}
#revStudio td input[type=number]{width:52px}
#revStudio .rsTime{padding:8px 10px 10px;border-bottom:1px solid #26303a;background:#1a2229}
#revStudio .tl-beats{position:relative;height:28px;font-size:10px;color:#f2c48d;line-height:1.05;margin:0 6px 4px;text-align:center}
#revStudio .msg{padding:6px 10px;color:#f2c48d;min-height:16px}
`;

export class RevealStudio {
  constructor(op) {
    this.op = op;
    if (!document.getElementById('revStudioCss')) { const st = document.createElement('style'); st.id = 'revStudioCss'; st.textContent = CSS; document.head.appendChild(st); }
    const el = this.el = document.createElement('div'); el.id = 'revStudio';
    el.innerHTML = `<header><b>Reveal Studio</b><button data-a="pause">Pause</button><button data-a="min" title="Hide / show">–</button></header>
      <div class="rsBody"><div class="status">ready</div><div class="msg"></div></div>`;
    document.body.appendChild(el);
    const body = el.querySelector('.rsBody');
    this.statusEl = el.querySelector('.status'); this.msgEl = el.querySelector('.msg');
    el.querySelector('[data-a=min]').onclick = () => el.classList.toggle('min');
    this.pauseB = el.querySelector('[data-a=pause]'); this.pauseB.onclick = () => this.togglePause();
    // stop the game's keys and taps reacting to the panel
    for (const ev of ['pointerdown', 'touchstart', 'keydown', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
    body.append(this.timeline(), this.transport(), this.lights(), this.quality(), this.flashes(), this.walk(), this.launch(), this.save());
    setInterval(() => this.tick(), 200);
  }
  // ---- building blocks ----
  sec(title, open = false) { const d = document.createElement('details'); d.open = open; d.innerHTML = `<summary>${title}</summary><div class="rsSec"></div>`; return [d, d.querySelector('.rsSec')]; }
  // a dial on obj[key]; live: the current phase's light is applied again at once
  slider(parent, obj, key, label, min, max, step, live = true) {
    const r = document.createElement('div'); r.className = 'row';
    const fmt = (v) => (Math.abs(step) >= 1 ? String(Math.round(v)) : (+v).toFixed(step < 0.01 ? 3 : 2));
    r.innerHTML = `<label title="${label}">${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const inp = r.querySelector('input'), out = r.querySelector('output');
    const sync = () => { inp.value = obj()[key]; out.textContent = fmt(obj()[key]); };
    inp.oninput = () => { obj()[key] = +inp.value; out.textContent = fmt(+inp.value); if (live) this.op.studioApply?.(); this.changed(); };
    sync(); this.syncs.push(sync); parent.appendChild(r); return r;
  }
  check(parent, obj, key, label, live = false) {
    const l = document.createElement('label'); l.className = 'line'; l.innerHTML = `<input type="checkbox"> ${label}`;
    const c = l.querySelector('input'), sync = () => { c.checked = !!obj()[key]; };
    c.onchange = () => { obj()[key] = c.checked; if (live) this.op.studioApply?.(); this.changed(); }; sync(); this.syncs.push(sync); parent.appendChild(l); return l;
  }
  choose(parent, obj, key, label, options, live = false, onChange = null) {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<label>${label}</label><select style="grid-column:span 2">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
    const s = r.querySelector('select'), sync = () => { s.value = String(obj()[key]); };
    s.onchange = () => { const v = s.value, cur = obj()[key]; obj()[key] = typeof cur === 'number' ? +v : v; if (live) this.op.studioApply?.(); onChange?.(); this.changed(); };
    sync(); this.syncs.push(sync); parent.appendChild(r); return r;
  }
  button(parent, text, fn, cls = '') { const b = document.createElement('button'); b.textContent = text; if (cls) b.className = cls; b.onclick = fn; parent.appendChild(b); return b; }
  get syncs() { return (this._syncs ||= []); }

  // ---- sections ----
  transport() {
    const [d, s] = this.sec('Play', true);
    const line = document.createElement('div'); line.className = 'line'; s.appendChild(line);
    const sel = document.createElement('select'); sel.innerHTML = BEATS.map(([m, t]) => `<option value="${m}">${t}</option>`).join(''); sel.value = 'beat6'; line.appendChild(sel);
    this.button(line, '▶ Play from here', () => this.play(sel.value), 'hot');
    const sp = document.createElement('div'); sp.className = 'line'; sp.innerHTML = '<span class="note">Speed</span>'; s.appendChild(sp);
    for (const r of [0.1, 0.25, 0.5, 1]) this.button(sp, r + '×', () => { this.op.studioRate = r; this.msg(`Playing at ${r}×`); });
    s.insertAdjacentHTML('beforeend', '<div class="note">Play from here replays the story silently up to that beat, then plays it live with sound. In the Studio the reveal holds its last frame instead of handing over to the game.</div>');
    return d;
  }
  lights() {
    const [d, s] = this.sec('Light (per part of the reveal)', true);
    this.phaseKey = 'cab';
    const top = document.createElement('div'); top.className = 'line'; s.appendChild(top);
    const sel = document.createElement('select'); sel.innerHTML = PHASES.map(([k, t]) => `<option value="${k}">${t}</option>`).join(''); sel.value = this.phaseKey; top.appendChild(sel);
    const follow = document.createElement('label'); follow.innerHTML = '<input type="checkbox" checked> follow the playback'; top.appendChild(follow);
    this.followC = follow.querySelector('input'); this.phaseSel = sel;
    sel.onchange = () => { this.phaseKey = sel.value; this.followC.checked = false; this.resync(); };
    const P = () => RT.light[this.phaseKey];
    s.insertAdjacentHTML('beforeend', '<div class="note">The game\x27s lighting (1 = exactly as in play)</div>');
    this.slider(s, P, 'amb', 'Room light', 0, 1.5, 0.01);
    this.slider(s, P, 'floor', 'Floor light (baked)', 0, 1.5, 0.01);
    this.slider(s, P, 'signs', 'EXIT signs', 0, 1.5, 0.01);
    this.slider(s, P, 'emRed', 'Emergency red', 0, 1.5, 0.01);
    this.slider(s, P, 'chars', 'Light on characters', 0, 2, 0.01);
    s.insertAdjacentHTML('beforeend', '<div class="note" style="margin-top:6px">The reveal\x27s own extras</div>');
    this.slider(s, P, 'red', 'Red pulse', 0, 2, 0.01);
    this.slider(s, P, 'key', 'Spotlight (steady)', 0, 2, 0.01);
    this.choose(s, P, 'spotAt', 'Spotlight from', [['flash', 'Behind her (rim / silhouette)'], ['key', 'In front of her (key)'], ['tube', 'Over the table']], true);
    this.slider(s, P, 'cab', 'Lift car lamps', 0, 1, 0.01);
    this.slider(s, P, 'exposure', 'Exposure', 0.3, 2, 0.01);
    this.slider(s, P, 'smoke', 'Fog', 0, 2, 0.01);
    this.slider(s, P, 'beam', 'Light shaft', 0, 2, 0.01);
    this.slider(s, P, 'dust', 'Dust in the shaft', 0, 2, 0.01);
    this.slider(s, P, 'secs', 'Fade in (s)', 0, 3, 0.05, false);
    s.insertAdjacentHTML('beforeend', '<div class="note" style="margin-top:8px"><b>The game\x27s lighting</b>: from the cut to the lift (the baked floor light, the fittings, EXIT signs, the polished floor, the emergency look)</div>');
    this.check(s, () => RT.game, 'on', 'Use the game\x27s lighting from the lift cut');
    this.check(s, () => RT.game, 'haze', 'Haze', true);
    this.check(s, () => RT.game, 'shadow', 'Yola\x27s own shadow', true);
    this.check(s, () => RT.game, 'impact', 'Impact frame at the hit');
    this.choose(s, () => RT, 'brighten', 'Lights come back', [['walk', 'As she steps out'], ['card', 'With the name card'], ['burst', 'At the hit'], ['return', 'As the camera returns']]);
    return d;
  }
  quality() {
    const [d, s] = this.sec('Picture quality (opening only)');
    const Q = () => RT.quality;
    s.insertAdjacentHTML('beforeend', '<div class="note">From the cut to the lift to the hand-off. The game keeps its own look.</div>');
    this.check(s, Q, 'beam', 'Light beam through the fog (3D)', true);
    this.slider(s, Q, 'beamK', 'Beam strength', 0, 3, 0.01);
    this.check(s, Q, 'softFog', 'Fog: rolling inside, soft edges', true);
    this.slider(s, Q, 'glow', 'Fog glowing from behind', 0, 3, 0.01);
    this.check(s, Q, 'flashShadow', 'Her shadow from the flash', true);
    this.check(s, Q, 'post', 'Glow on the lights, film finish', true);
    this.slider(s, Q, 'bloom', 'Glow strength', 0, 2, 0.01);
    this.slider(s, Q, 'bloomRadius', 'Glow spread', 0, 1, 0.01);
    this.check(s, Q, 'film', 'Film grain and vignette', true);
    this.slider(s, Q, 'grain', 'Grain', 0, 0.12, 0.002);
    this.slider(s, Q, 'vignette', 'Vignette', 0, 0.8, 0.01);
    return d;
  }
  flashes() {
    const [d, s] = this.sec('Flashes in the lift');
    const F = () => RT.flash;
    this.slider(s, F, 'power', 'Brightness', 0, 3, 0.01);
    this.slider(s, F, 'decay', 'Fade (s)', 0.03, 1.2, 0.01);
    this.slider(s, F, 'beam', 'Shaft per flash', 0, 2, 0.01);
    this.slider(s, F, 'dust', 'Dust per flash', 0, 2, 0.01);
    this.slider(s, F, 'halo', 'Fitting glow', 0, 2, 0.01);
    this.slider(s, F, 'sparks', 'Sparks', 0, 3, 0.05);
    this.slider(s, F, 'height', 'Light height', 2.2, 4.2, 0.05);
    this.slider(s, F, 'back', 'Light depth (z)', -14.6, -11.6, 0.05);
    this.slider(s, F, 'angle', 'Cone width', 0.2, 1.3, 0.01);
    this.slider(s, F, 'penumbra', 'Cone softness', 0, 1, 0.01);
    this.check(s, F, 'swap', 'Hall flips clean / outbreak with each flash');
    this.slider(s, () => RT, 'flashTail', 'Hold after last (s)', 0, 4, 0.05, false);
    s.insertAdjacentHTML('beforeend', '<div class="note" style="margin-top:8px"><b>Rhythm</b>: a few slow flashes, a burst that speeds up, slowing clicks, a held breath, the boom.</div>');
    const Rh = () => RT.rhythm;
    this.slider(s, Rh, 'first', 'Slow flashes', 0, 8, 1, false);
    this.slider(s, Rh, 'firstGap', 'Their gap (s)', 0.2, 2, 0.05, false);
    this.slider(s, Rh, 'burst', 'Burst flashes', 0, 16, 1, false);
    this.slider(s, Rh, 'burstFrom', 'Burst gap start', 0.04, 0.5, 0.01, false);
    this.slider(s, Rh, 'burstTo', 'Burst gap end', 0.03, 0.5, 0.01, false);
    this.slider(s, Rh, 'slow', 'Slowing clicks', 0, 8, 1, false);
    this.slider(s, Rh, 'slowFrom', 'Click gap start', 0.05, 1, 0.01, false);
    this.slider(s, Rh, 'slowTo', 'Click gap end', 0.05, 1.5, 0.01, false);
    this.slider(s, Rh, 'breath', 'Held breath (s)', 0, 3, 0.05, false);
    const gl = document.createElement('div'); gl.className = 'line'; s.appendChild(gl);
    this.button(gl, 'Generate the list', () => { RT.flashes = generateFlashes(RT.rhythm); this.drawList(); this.msg(`${RT.flashes.length} flashes`); });
    this.button(gl, '▶ Play the flashes', () => this.play('flashes'), 'hot');
    s.insertAdjacentHTML('beforeend', '<div class="note" style="margin-top:8px"><b>The list</b> (time from the doors opening, who shows, brightness, fade 0 = default, boom = the last, she stays)</div>');
    this.listEl = document.createElement('div'); s.appendChild(this.listEl); this.drawList();
    return d;
  }
  drawList() {
    const L = RT.flashes;
    this.listEl.innerHTML = `<table><tr class="note"><td>time</td><td>who</td><td>bright</td><td>fade</td><td>boom</td><td></td></tr>${L.map((f, i) => `<tr data-i="${i}">
      <td><input type="number" step="0.01" min="0" value="${f[0]}" data-k="0"></td>
      <td><select data-k="1"><option value="old"${f[1] === 'old' ? ' selected' : ''}>old</option><option value="new"${f[1] === 'new' ? ' selected' : ''}>new</option></select></td>
      <td><input type="number" step="0.05" min="0" value="${f[2]}" data-k="2"></td>
      <td><input type="number" step="0.05" min="0" value="${f[3] || 0}" data-k="3"></td>
      <td><input type="checkbox" data-k="4"${f[4] ? ' checked' : ''}></td>
      <td><button data-del>×</button></td></tr>`).join('')}</table>`;
    this.listEl.querySelectorAll('tr[data-i]').forEach((tr) => {
      const f = L[+tr.dataset.i];
      tr.querySelectorAll('[data-k]').forEach((c) => { c.onchange = () => { const k = +c.dataset.k; f[k] = k === 1 ? c.value : k === 4 ? c.checked : +c.value; this.changed(); }; });
      tr.querySelector('[data-del]').onclick = () => { L.splice(+tr.dataset.i, 1); this.drawList(); };
    });
    const add = document.createElement('div'); add.className = 'line'; this.listEl.appendChild(add);
    this.button(add, '+ Add a flash', () => { const t = L.length ? L[L.length - 1][0] + 0.3 : 0; L.push([+t.toFixed(2), 'old', 0.8, 0, false]); this.drawList(); });
    this.button(add, 'Sort by time', () => { L.sort((a, b) => a[0] - b[0]); this.drawList(); });
  }
  walk() {
    const [d, s] = this.sec('Walk-out');
    const W = () => RT.walk;
    this.check(s, W, 'bat', 'She carries the bat out');
    this.slider(s, W, 'slow', 'Slow motion', 0.2, 1, 0.01, false);
    this.slider(s, W, 'stopZ', 'Where she stops', -11, -8.5, 0.05, false);
    this.slider(s, W, 'secs', 'Shot length (s)', 1, 6, 0.05, false);
    this.slider(s, W, 'stepShake', 'Step jolt', 0, 0.05, 0.001, false);
    this.check(s, () => RT, 'batShot', 'Cut to the bat leaning by the doors');
    const l = document.createElement('div'); l.className = 'line'; s.appendChild(l);
    this.button(l, '▶ Play the walk-out', () => this.play('beat9'), 'hot');
    return d;
  }
  launch() {
    const [d, s] = this.sec('Launch, freeze, card, burst');
    const LA = () => RT.launch, C = () => RT.launch.cam;
    this.choose(s, LA, 'variant', 'Finisher', [['B_uppercut', 'B (uppercut crouch)'], ['C_uppercut_mirrored', 'C (mirrored)']]);
    this.choose(s, LA, 'jump', 'Jump', [['1.4', '1.4 m'], ['2.4', '2.4 m'], ['3.4', '3.4 m']]);
    this.slider(s, LA, 'reach', 'Travel (x the jump)', 0.3, 1.2, 0.01, false);
    this.slider(s, LA, 'turn', 'Her heading (°)', -60, 60, 1, false);
    this.slider(s, LA, 'gap', 'Zombie further back', 0, 1, 0.01, false);
    this.slider(s, LA, 'lunge', 'His lurch at her', 0, 3, 0.05, false);
    this.slider(s, LA, 'hold', 'Set before she goes', 0, 2, 0.05, false);
    this.slider(s, LA, 'rampSlow', 'Slow-mo in the air', 0.05, 1, 0.01, false);
    this.slider(s, LA, 'rampLen', 'Ease into slow-mo', 0.02, 0.6, 0.01, false);
    this.slider(s, LA, 'rampAt', 'Slow-mo starts (after lift-off)', -0.3, 0.3, 0.01, false);
    this.slider(s, LA, 'freezeLead', 'Freeze before hit', 0, 0.4, 0.01, false);
    this.slider(s, LA, 'boomToCard', 'Boom → card (s)', 0, 1, 0.01, false);
    this.slider(s, LA, 'cardHold', 'Card holds (s)', 0.5, 5, 0.05, false);
    this.slider(s, LA, 'slow', 'Slow-mo after hit', 0.05, 1, 0.01, false);
    this.slider(s, LA, 'headSecs', 'Head to lens (s)', 0.2, 1.2, 0.01, false);
    this.slider(s, LA, 'lensDist', 'Head stops at', 0.3, 1.5, 0.01, false);
    this.slider(s, LA, 'after', 'Hold after crack', 0, 2, 0.05, false);
    this.slider(s, LA, 'returnSecs', 'Camera return (s)', 0.5, 4, 0.05, false);
    s.insertAdjacentHTML('beforeend', '<div class="note" style="margin-top:8px"><b>Camera</b> (in front of her, across him)</div>');
    this.slider(s, C, 'yawOff', 'Angle off her line', -80, 80, 1, false);
    this.slider(s, C, 'dist', 'Distance', 1.5, 8, 0.05, false);
    this.slider(s, C, 'height', 'Aim height', 0.3, 2, 0.01, false);
    this.slider(s, C, 'pitch', 'Tilt', -15, 30, 0.5, false);
    this.slider(s, C, 'look', 'Aim: her ↔ him', 0, 1, 0.01, false);
    this.slider(s, C, 'fov', 'Lens (fov)', 20, 70, 1, false);
    this.slider(s, C, 'push', 'Push in', 0, 2, 0.05, false);
    const l = document.createElement('div'); l.className = 'line'; s.appendChild(l);
    this.button(l, '▶ Play the launch', () => this.play('beat11'), 'hot');
    return d;
  }
  save() {
    const [d, s] = this.sec('Save', true);
    const l = document.createElement('div'); l.className = 'line'; s.appendChild(l);
    this.button(l, 'Save to the game', () => this.saveFile(), 'hot');
    this.button(l, 'Copy settings', async () => { try { await navigator.clipboard.writeText(tuningJSON()); this.msg('Copied'); } catch { this.msg('Copy failed'); } });
    this.button(l, 'Reset to defaults', () => { if (!confirm('Reset every reveal dial to its default? (The saved file is only changed when you Save.)')) return; resetTuning(); this.resync(); this.drawList(); this.op.studioApply?.(); this.msg('Defaults restored (not saved)'); });
    s.insertAdjacentHTML('beforeend', '<div class="note">Save writes assets/opening/reveal_tuning.json: the opening reads it at load (on this machine\'s dev server).</div>');
    return d;
  }
  // ---- actions ----
  async saveFile() {
    try {
      const r = await fetch('/__reveal/tuning.json', { method: 'POST', body: tuningJSON(), headers: { 'Content-Type': 'application/json' } });
      this.msg(r.ok ? 'Saved: the game plays these settings now' : `Save failed (${r.status}): use Copy settings`);
    } catch { this.msg('Save failed: use Copy settings'); }
  }
  play(mark) {
    const o = this.op; if (o.paused) this.togglePause();
    this.msg('Rewinding to that beat…');
    setTimeout(() => { o.toReveal(mark); this.msg(''); }, 30);
  }
  togglePause() {
    const o = this.op;
    if (o.paused) o.studioPlayOn();
    else { o.studioHold = true; o.paused = true; o.sound?.suspend?.(true); if (o.revealT0 != null && this.tl) { this.at = o.t - o.revealT0; this.tl.value = this.at; this.tlT.textContent = this.at.toFixed(2) + ' s · ' + (o.substate || ''); } } // (the playhead stays where it stopped)
    this.showPaused();
  }
  showPaused() { const p = this.op.paused; this.pauseB.textContent = p ? '▶ Play' : 'Pause'; this.pauseB.classList.toggle('hot', p); }
  // ---- the timeline: drag through the reveal frame by frame (each position is the reveal replayed to that exact frame) ----
  timeline() {
    const d = document.createElement('div'); d.className = 'rsTime';
    d.innerHTML = `<div class="line"><b style="flex:1">Timeline</b><span class="tl-t">–</span></div>
      <input type="range" class="tl" min="0" max="26" step="0.0333" value="0" style="width:100%;accent-color:#e0703f">
      <div class="tl-beats"></div>
      <div class="line"><button data-s="-10">◀◀</button><button data-s="-1">◀ frame</button><button data-s="1">frame ▶</button><button data-s="10">▶▶</button>
        <button data-a="apply" class="hot">Apply</button></div>
      <label class="line"><input type="checkbox" class="tl-auto" checked> Update the still picture as I change things</label>
      <div class="note">Drag to any moment: the picture holds there. ▶ Play (top) carries on from it, live. Apply redraws the still with every change (the flashes, the timing and the launch too).</div>`;
    this.tl = d.querySelector('.tl'); this.tlT = d.querySelector('.tl-t'); this.tlBeats = d.querySelector('.tl-beats'); this.tlAuto = d.querySelector('.tl-auto');
    let pend = null, busy = false;
    const go = () => { pend = null; if (busy) return; busy = true; try { this.seek(+this.tl.value); } finally { busy = false; } };
    this.tl.addEventListener('pointerdown', () => this.ensureMeasured());
    this.tl.oninput = () => { this.ensureMeasured(); this.tlT.textContent = (+this.tl.value).toFixed(2) + ' s'; if (!pend) pend = setTimeout(go, 40); };
    d.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { this.ensureMeasured(); this.seek(Math.max(0, Math.min(+this.tl.max, (this.at ?? 0) + (+b.dataset.s) / 30))); }; });
    d.querySelector('[data-a=apply]').onclick = () => this.apply();
    return d;
  }
  // on load: straight to the reveal, held on its first beat (▶ Play is the tap that lets the sound start)
  open() { this.ensureMeasured(); this.seek(0.5); this.msg('Drag the timeline, or press ▶ Play'); }
  // the reveal's length and its beats (replayed once; again after Apply: the timing may have changed)
  ensureMeasured() { if (this.measured) return; this.remeasure(); }
  remeasure() {
    const m = this.op.studioMeasure(); this.measured = m;
    this.tl.max = m.length;
    const NAMES = { beat5: 'doors', ding: 'ding', beat6: 'open', flashes: 'flashes', beat8: 'patient', beat9: 'walk', beat10: 'bat', beat11: 'launch', beat12: 'freeze', hit: 'hit', return: 'return' };
    this.tlBeats.innerHTML = m.beats.filter(([k]) => NAMES[k]).map(([k, t], i) => `<span title="${NAMES[k]}: ${t} s (click to jump)" data-t="${t}" style="position:absolute;left:${(100 * t / m.length).toFixed(2)}%;top:${i % 2 ? 13 : 0}px;transform:translateX(-50%);cursor:pointer;white-space:nowrap">▲${NAMES[k]}</span>`).join(''); // (two rows: the late beats sit close together)
    this.tlBeats.querySelectorAll('[data-t]').forEach((e) => { e.onclick = () => this.seek(+e.dataset.t); });
  }
  seek(t) {
    const o = this.op; t = Math.max(0, Math.min(+this.tl.max - 1 / 30, t));
    const at = o.studioSeek(t); this.at = at; this.tl.value = at; this.tlT.textContent = at.toFixed(2) + ' s · ' + (o.substate || '');
    this.showPaused();
  }
  // a dial changed: the still picture is out of date (redrawn now when auto is on and the picture is held)
  changed() {
    this.op.scrubDirty = true;
    if (!this.tlAuto?.checked || !this.op.studioHold || this.at == null) return;
    clearTimeout(this.autoT); this.autoT = setTimeout(() => this.apply(), 350);
  }
  apply() {
    const t = this.at ?? +this.tl.value;
    this.remeasure(); this.op.scrubDirty = true; this.seek(t); this.msg('Applied');
  }
  resync() { for (const f of this.syncs) f(); }
  msg(t) { this.msgEl.textContent = t; }
  tick() {
    const o = this.op;
    if (!o.paused && o.revealT0 != null && this.measured && (o.state === 'REVEAL' || o.state === 'COMBAT_READY')) { const t = o.t - o.revealT0; this.tl.value = t; this.at = null; this.tlT.textContent = t.toFixed(2) + ' s · ' + (o.substate || ''); }
    this.showPaused?.();
    this.statusEl.textContent = `${o.state} · ${o.substate || ''} · ${(o.t || 0).toFixed(1)} s${o.paused ? ' · paused' : ''}${(o.studioRate ?? 1) !== 1 ? ' · ' + o.studioRate + '×' : ''}`;
    if (this.followC?.checked && o.curPhase && o.curPhase !== this.phaseKey && RT.light[o.curPhase]) { this.phaseKey = o.curPhase; this.phaseSel.value = o.curPhase; this.resync(); }
  }
}
export { REVEAL_DEFAULTS };
