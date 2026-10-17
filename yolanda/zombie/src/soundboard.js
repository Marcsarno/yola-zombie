// The Sound Board (sounds.html): every recorded sound the game plays, layer by layer and take by take. Listen solo or
// in the full in-game mix, approve or reject takes (candidates join the game only when approved), trim levels, compare
// with the classic synthesised version. "Save choices" writes assets/sfx/selection.json (tools/serve.mjs), which the
// game reads (src/sfx/samples.js). It plays through the game's own engine (src/audio.js), so what you hear here is
// what the game plays.
import { CombatAudio } from './audio.js';
import { BANKS, takeLabel } from './sfx/banks.js';
import { SELECTION_URL } from './sfx/samples.js';

const $ = (id) => document.getElementById(id);
const audio = new CombatAudio();
const S = audio.samples;
audio.setVolume(0.9);
S.preload({ selection: false }); // (the board loads the saved selection itself, below, so a restored draft is not overwritten)
const DRAFT = 'soundboard_draft';
let cur = Object.keys(BANKS)[0], dirty = false;
let pan = 0, dist = 0, phoneOn = false;

// ---------- audio plumbing ----------
const unlock = () => { audio.init(); if (audio.ctx && !audio._board) setupBoardAudio(); };
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });
function setupBoardAudio() {
  const c = audio.ctx; audio._board = true;
  // the phone speaker: no bass below ~350 Hz, a little honk around 2 kHz, little air above 9 kHz
  const hp1 = c.createBiquadFilter(), hp2 = c.createBiquadFilter(), pk = c.createBiquadFilter(), lp = c.createBiquadFilter();
  hp1.type = hp2.type = 'highpass'; hp1.frequency.value = hp2.frequency.value = 350; hp1.Q.value = 0.7; hp2.Q.value = 0.9;
  pk.type = 'peaking'; pk.frequency.value = 2200; pk.gain.value = 4; pk.Q.value = 0.8;
  lp.type = 'lowpass'; lp.frequency.value = 9000;
  hp1.connect(hp2); hp2.connect(pk); pk.connect(lp); lp.connect(c.destination);
  audio._phone = hp1;
  audio.spatial = () => ({ pan, d: dist });
  applyPhone(); applyRoom();
}
function applyPhone() {
  if (!audio._phone) return;
  audio.limiter.disconnect();
  audio.limiter.connect(phoneOn ? audio._phone : audio.ctx.destination);
}
function applyRoom() { if (audio.reverbIn) audio.reverbIn.gain.value = $('room').checked ? 1 : 0; }
const pos = () => (pan || dist ? { x: 0, z: 0 } : null);
const sp = () => (pan || dist ? { pan, d: dist } : null);
// run fn with sound on (the first tap makes the AudioContext; resuming it is async, so wait for it)
function withAudio(fn) {
  if (audio.ok) return fn();
  unlock(); audio.ctx?.resume().then(() => { if (audio.ok) fn(); }).catch(() => {});
}

function playFull(name, opts) { withAudio(() => playFullNow(name, opts)); }
function playFullNow(name, opts) {
  audio.recent.clear(); audio.active.length = 0;
  if (opts) audio.playBank(name, 1, audio.ctx.currentTime, sp(), opts);
  else audio.play(name, 1, pos());
  const then = BANKS[name].then;
  if (then) setTimeout(() => { audio.recent.clear(); audio.play(then.name, 1, pos()); }, then.at * 1000);
}
function burst(name) {
  const gap = (BANKS[name].cadence || 0.5) * 1000;
  for (let i = 0; i < 6; i++) setTimeout(() => playFull(name), i * gap);
}
function classic(name) { withAudio(() => { audio.recent.clear(); audio.setModern(false); audio.play(name, 1, pos()); audio.setModern(true); }); }
function solo(name, li, f) { withAudio(() => audio.playBank(name, 1, audio.ctx.currentTime, sp(), { only: li, forceLayer: li, force: f })); }
function layerOnce(name, li) { withAudio(() => audio.playBank(name, 1, audio.ctx.currentTime, sp(), { only: li })); }

// ---------- the selection (S.sel is what the engine plays from: edits are heard at once) ----------
const sel = () => S.sel;
const takeSel = (f) => (sel().takes[f] ||= {});
const layerSel = (name, li) => (sel().layers[name + '#' + li] ||= {});
const soundSel = (name) => (sel().sounds[name] ||= {});
function touch() {
  dirty = true; $('saveState').textContent = 'unsaved changes'; $('saveState').className = 'dirty';
  try { localStorage.setItem(DRAFT, JSON.stringify(pruned())); } catch { /* private window */ }
  renderSide();
}
function pruned() {
  const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== 0 && x !== '' && x !== false))]).filter(([, v]) => Object.keys(v).length));
  return { version: 1, savedAt: new Date().toISOString(), takes: clean(sel().takes), layers: clean(sel().layers), sounds: clean(sel().sounds) };
}
async function save() {
  $('saveState').textContent = 'saving…';
  try {
    const r = await fetch('/__sfx/selection.json', { method: 'POST', body: JSON.stringify(pruned(), null, 1) });
    if (!r.ok) throw new Error(r.status);
    dirty = false; $('saveState').textContent = 'saved ✓'; $('saveState').className = 'ok';
    try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
  } catch (e) { $('saveState').textContent = 'save failed (' + e.message + ')'; $('saveState').className = 'dirty'; }
}
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- view ----------
const isCand = (l, f) => (l.extra || []).includes(f);
function status(l, f) {
  const v = sel().takes[f]?.v;
  if (v === 'no') return ['out', 'Rejected'];
  if (isCand(l, f)) return v === 'yes' ? ['in', 'In game · approved'] : ['cand', 'Candidate'];
  return ['in', v === 'yes' ? 'In game · approved' : 'In game'];
}
function counts(name) {
  let inG = 0, cand = 0, ok = 0, no = 0;
  for (const l of BANKS[name].layers) for (const f of [...(l.files || []), ...(l.extra || [])]) {
    const v = sel().takes[f]?.v; const [k] = status(l, f);
    if (k === 'in') inG++; if (k === 'cand') cand++; if (v === 'yes') ok++; if (v === 'no') no++;
  }
  return { inG, cand, ok, no };
}
function renderSide() {
  const groups = {};
  for (const [name, b] of Object.entries(BANKS)) (groups[b.group || 'Other'] ||= []).push(name);
  $('side').innerHTML = Object.entries(groups).map(([g, names]) => `<div class="g"><h3>${g}</h3>${names.map((n) => {
    const c = counts(n);
    return `<button class="snd${n === cur ? ' cur' : ''}" data-snd="${n}">${BANKS[n].label}<small>${c.inG} in game${c.cand ? ` · ${c.cand} to review` : ''}${c.no ? ` · ${c.no} rejected` : ''}</small></button>`;
  }).join('')}</div>`).join('');
  for (const b of $('side').querySelectorAll('.snd')) b.onclick = () => { cur = b.dataset.snd; renderSide(); renderMain(); };
}
const dbText = (v) => `${v > 0 ? '+' : ''}${(+v || 0).toFixed(1)} dB`;
const trimHtml = (key, v) => `<span class="trim">level <input type="range" min="-12" max="6" step="0.5" value="${v || 0}" data-trim="${key}"><b>${dbText(v)}</b></span>`;

function renderMain() {
  const name = cur, b = BANKS[name], ss = soundSel(name);
  let h = `<div class="card"><div class="hd"><h2>${b.label}</h2><span class="sp"></span>
    <button class="big primary" data-act="full">▶ Play in game</button>
    <button class="big" data-act="burst">Repeat ×6</button>
    <button class="big" data-act="classic">Old version</button></div>
    <div class="hd" style="margin-top:8px">${trimHtml('sound', ss.db)}<span class="help">whole sound</span></div>
    <textarea data-note placeholder="Notes for Claude (what's wrong, what you want instead)…">${ss.note || ''}</textarea>
    <div class="help">▶ on a take plays it alone. "In mix" plays the whole sound using that take. ✓ approves a take (a candidate joins the game), ✗ takes it out. Keys on a selected row: Enter play · M in mix · A approve · R reject · ↑↓ move.</div></div>`;
  b.layers.forEach((l, li) => {
    const ls = layerSel(name, li);
    h += `<div class="card lyr${ls.off ? ' off' : ''}"><div class="hd"><h3>${l.label || 'Layer ' + (li + 1)}</h3><span class="chip ${l.synth ? 'cand' : 'in'}">${l.synth ? 'synthesised' : (l.files.length + (l.extra?.length || 0)) + ' takes'}</span><span class="sp"></span>
      <button data-act="layer" data-li="${li}">▶ ${l.synth ? 'Play' : 'Random take'}</button>
      ${trimHtml('layer:' + li, ls.db)}
      <label class="trim"><input type="checkbox" data-off="${li}" ${ls.off ? '' : 'checked'}> on</label></div>`;
    if (!l.synth) {
      const files = [...new Set([...(l.files || []), ...(l.extra || [])])];
      h += `<div class="takes">${files.map((f) => {
        const [k, t] = status(l, f), v = sel().takes[f]?.v;
        return `<div class="take${k === 'out' ? ' rej' : ''}" tabindex="0" data-li="${li}" data-f="${f}">
          <button class="play" data-act="solo" title="Play alone">▶</button>
          <canvas data-wave="${f}" width="440" height="68" title="Play alone"></canvas>
          <div class="nm"><div>${takeLabel(f)}</div><div><span class="chip ${k}">${t}</span>${trimHtml('take:' + f, sel().takes[f]?.db)}</div></div>
          <div class="vd"><button class="yes${v === 'yes' ? ' on' : ''}" data-act="yes" title="Approve">✓ Keep</button><button class="no${v === 'no' ? ' on' : ''}" data-act="no" title="Reject">✗ Reject</button><button class="mix" data-act="mix" title="The whole sound with this take">▶ In mix</button></div>
        </div>`;
      }).join('')}</div>`;
    }
    h += '</div>';
  });
  $('main').innerHTML = h;
  bindMain(); drawWaves();
}

function bindMain() {
  const name = cur, m = $('main');
  m.querySelector('[data-act=full]').onclick = () => playFull(name);
  m.querySelector('[data-act=burst]').onclick = () => burst(name);
  m.querySelector('[data-act=classic]').onclick = () => classic(name);
  m.querySelector('[data-note]').oninput = (e) => { soundSel(name).note = e.target.value; touch(); };
  for (const el of m.querySelectorAll('[data-act=layer]')) el.onclick = () => layerOnce(name, +el.dataset.li);
  for (const el of m.querySelectorAll('[data-off]')) el.onchange = () => { layerSel(name, +el.dataset.off).off = !el.checked; touch(); el.closest('.lyr').classList.toggle('off', !el.checked); };
  for (const el of m.querySelectorAll('[data-trim]')) {
    el.oninput = () => {
      const key = el.dataset.trim, v = +el.value;
      if (key === 'sound') soundSel(name).db = v; else if (key.startsWith('layer:')) layerSel(name, +key.slice(6)).db = v; else takeSel(key.slice(5)).db = v;
      el.nextElementSibling.textContent = dbText(v); touch();
    };
    el.onchange = () => { const row = el.closest('.take'); if (row) solo(name, +row.dataset.li, row.dataset.f); else if (el.dataset.trim.startsWith('layer:')) layerOnce(name, +el.dataset.trim.slice(6)); else playFull(name); };
  }
  for (const row of m.querySelectorAll('.take')) {
    const li = +row.dataset.li, f = row.dataset.f;
    const act = (a) => {
      if (a === 'solo') { solo(name, li, f); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
      if (a === 'mix') playFull(name, { forceLayer: li, force: f });
      if (a === 'yes' || a === 'no') { const t = takeSel(f); t.v = t.v === a ? undefined : a; touch(); renderMain(); m.querySelector(`.take[data-f="${CSS.escape(f)}"][data-li="${li}"]`)?.focus(); }
    };
    for (const btn of row.querySelectorAll('[data-act]')) btn.onclick = (e) => { e.stopPropagation(); act(btn.dataset.act); };
    row.querySelector('canvas').onclick = () => act('solo');
    row.onkeydown = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'enter' || k === ' ') act('solo'); else if (k === 'm') act('mix'); else if (k === 'a' || k === 'y') act('yes'); else if (k === 'r' || k === 'n' || k === 'x') act('no');
      else if (k === 'arrowdown' || k === 'arrowup') { const rows = [...m.querySelectorAll('.take')], i = rows.indexOf(row); rows[i + (k === 'arrowdown' ? 1 : -1)]?.focus(); }
      else return;
      e.preventDefault();
    };
  }
}

function drawWaves() {
  let missing = 0;
  for (const cv of $('main').querySelectorAll('canvas[data-wave]')) {
    if (cv.dataset.drawn) continue;
    const f = cv.dataset.wave, b = S.buf.get(f); if (!b) { missing++; continue; }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, d = b.getChannelData(0);
    const row = cv.closest('.take'), l = BANKS[cur].layers[+row.dataset.li], [k] = status(l, f);
    g.clearRect(0, 0, W, H); g.fillStyle = k === 'in' ? '#2fb1b4' : k === 'cand' ? '#ffb347' : '#ff6b5e';
    const longest = Math.max(...[...(l.files || []), ...(l.extra || [])].map((q) => S.buf.get(q)?.duration || 0));
    const lead = Math.floor((S.lead.get(f) || 0) * b.sampleRate), span = Math.max(0.3, longest) * b.sampleRate; // one time scale per layer (its longest take), so lengths compare
    for (let x = 0; x < W; x++) {
      const a = lead + Math.floor(x / W * span), e = Math.min(d.length, lead + Math.floor((x + 1) / W * span)); let mx = 0;
      for (let i = a; i < e; i++) { const v = Math.abs(d[i]); if (v > mx) mx = v; }
      const hh = Math.max(1, Math.sqrt(mx) * H * 0.48); g.fillRect(x, H / 2 - hh, 1, hh * 2);
    }
    cv.dataset.drawn = 1;
  }
  if (missing) setTimeout(drawWaves, 400);
}

// ---------- top bar ----------
$('phone').onchange = (e) => { phoneOn = e.target.checked; applyPhone(); };
$('room').onchange = applyRoom;
$('pan').oninput = (e) => { pan = +e.target.value; };
$('dist').oninput = (e) => { dist = +e.target.value; $('distV').textContent = dist + ' m'; };
$('vol').oninput = (e) => audio.setVolume(+e.target.value);
$('save').onclick = save;
addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });
setInterval(() => {
  const all = S.files().length, have = S.buf.size;
  $('status').textContent = !audio.ctx || audio.ctx.state !== 'running' ? 'tap anywhere to turn sound on' : have < all ? `loading sounds ${have}/${all}` : `${all} takes loaded`;
}, 300);

// ---------- start: the saved selection, then any unsaved draft from this browser ----------
(async () => {
  try { const r = await fetch(SELECTION_URL + '?' + Date.now(), { cache: 'no-store' }); if (r.ok) S.setSelection(await r.json()); } catch { /* none saved yet */ }
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (d && confirm('You have unsaved Sound Board changes from before. Restore them?')) { S.setSelection(d); dirty = true; $('saveState').textContent = 'unsaved changes'; $('saveState').className = 'dirty'; }
  } catch { /* ignore */ }
  renderSide(); renderMain();
})();
