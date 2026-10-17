// The Sound Board (sounds.html): every recorded sound the game plays, layer by layer and take by take. Listen solo or
// in the full in-game mix; per take: keep it, add a new option to the game, save it for a future weapon, or reject it;
// trim levels; compare with the old synthesised version. Choices are per sound ("also used by" shows a file shared by
// two sounds). "Save choices" writes assets/sfx/selection.json (tools/serve.mjs), which the game reads
// (src/sfx/samples.js). It plays through the game's own engine (src/audio.js): what you hear here is what the game plays.
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
setTimeout(unlock, 0); // (make the context now, suspended until a tap: the takes decode and their waveforms draw straight away)
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
// a take's choice is per sound: takes['<sound>:<file>'] = { v: 'yes' | 'no' | 'later', for, note, db }
const sel = () => S.sel;
const takeSel = (name, f) => (sel().takes[name + ':' + f] ||= {});
const layerSel = (name, li) => (sel().layers[name + '#' + li] ||= {});
const soundSel = (name) => (sel().sounds[name] ||= {});
const FUTURE = ['Rifle', 'Revolver', 'Heavy pistol (.45 / .50)', 'Small pistol (.22 / .380)', 'SMG', 'Assault rifle', 'Hunting / bolt rifle', 'Double-barrel shotgun', 'Sawn-off shotgun', 'Something else (see note)'];
function touch() {
  dirty = true; $('saveState').textContent = 'unsaved changes'; $('saveState').className = 'dirty';
  try { localStorage.setItem(DRAFT, JSON.stringify(pruned())); } catch { /* private window */ }
  renderSide();
}
function pruned() {
  const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== 0 && x !== '' && x !== false))]).filter(([, v]) => Object.keys(v).length));
  return { version: 2, savedAt: new Date().toISOString(), takes: clean(sel().takes), layers: clean(sel().layers), sounds: clean(sel().sounds) };
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

// ---------- what a take is, in plain words ----------
const filesOf = (l) => [...new Set([...(l.files || []), ...(l.extra || [])])];
const isCand = (l, f) => (l.extra || []).includes(f) && !(l.files || []).includes(f);
// kind: review-in (in the game, not reviewed yet), review-new (a new option, not in the game), kept, added, later, out
function kind(name, l, f) {
  const v = S.verdict(name, f), cand = isCand(l, f);
  if (v === 'later') return 'later';
  if (v === 'no') return 'out';
  if (v === 'yes') return cand ? 'added' : 'kept';
  return cand ? 'review-new' : 'review-in';
}
const KIND = {
  'review-in': ['in', '● Already in the game'],
  'review-new': ['cand', '○ New option · not in the game'],
  kept: ['in', '✓ In the game · you kept it'],
  added: ['in', '✓ Added to the game'],
  later: ['later', '★ Saved for a future weapon'],
  out: ['out', '✗ Rejected · not used'],
};
const reviewed = (k) => !k.startsWith('review');
const inGameKind = (k) => k === 'review-in' || k === 'kept' || k === 'added';
// every other sound that uses this file, and whether it plays there
function alsoUsed(name, f) {
  const out = [];
  for (const [n, b] of Object.entries(BANKS)) {
    if (n === name) continue;
    const l = b.layers.find((q) => filesOf(q).includes(f));
    if (l) out.push(`${b.label}${S.inGame(n, l, f) ? ' (plays there)' : ''}`);
  }
  return out;
}
function counts(name) {
  const c = { all: 0, review: 0, game: 0, later: 0, out: 0 }, seen = new Set();
  for (const l of BANKS[name].layers) for (const f of filesOf(l)) {
    if (seen.has(f)) continue; seen.add(f); // (one take used by several layers, like the four shells, is one choice)
    const k = kind(name, l, f); c.all++;
    if (!reviewed(k)) c.review++; if (inGameKind(k)) c.game++; if (k === 'later') c.later++; if (k === 'out') c.out++;
  }
  return c;
}
function laterList() {
  const out = [];
  for (const [n, b] of Object.entries(BANKS)) b.layers.forEach((l, li) => { for (const f of filesOf(l)) if (S.verdict(n, f) === 'later') out.push({ name: n, li, f }); });
  return out;
}

// ---------- the sound list ----------
let filter = (() => { try { return localStorage.getItem('soundboard_filter') || 'all'; } catch { return 'all'; } })();
function renderSide() {
  const groups = {};
  for (const [name, b] of Object.entries(BANKS)) (groups[b.group || 'Other'] ||= []).push(name);
  const nl = laterList().length;
  $('side').innerHTML = Object.entries(groups).map(([g, names]) => `<div class="g"><h3>${g}</h3>${names.map((n) => {
    const c = counts(n);
    return `<button class="snd${n === cur ? ' cur' : ''}" data-snd="${n}">${BANKS[n].label}<small>${c.game} ${BANKS[n].pending ? 'picked' : 'in game'}${c.review ? ` · <b class="todo">${c.review} to review</b>` : ' · all reviewed ✓'}</small></button>`;
  }).join('')}</div>`).join('') + `<div class="g"><h3>Library</h3><button class="snd${cur === '@later' ? ' cur' : ''}" data-snd="@later">★ Saved for future weapons<small>${nl} take${nl === 1 ? '' : 's'}</small></button></div>`;
  for (const b of $('side').querySelectorAll('.snd')) b.onclick = () => { cur = b.dataset.snd; renderSide(); renderMain(); scrollTo(0, 0); };
}
const dbText = (v) => `${v > 0 ? '+' : ''}${(+v || 0).toFixed(1)} dB`;
const trimHtml = (key, v) => `<span class="trim">level <input type="range" min="-12" max="6" step="0.5" value="${v || 0}" data-trim="${key}"><b>${dbText(v)}</b></span>`;
const esc = (s) => String(s || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// ---------- one take row ----------
function rowHtml(name, li, f, k, showFrom = false) {
  const ts = sel().takes[name + ':' + f] || {}, [cls, text] = KIND[k];
  const also = alsoUsed(name, f);
  const where = BANKS[name].pending ? (inGameKind(k) ? 'Picked: used as soon as this sound is wired into the game' : '')
    : inGameKind(k) ? `Part of the ${BANKS[name].label.toLowerCase()} you hear in the game` : k === 'review-new' ? 'Try “Hear in mix” to hear it in the full sound' : '';
  let acts;
  if (k === 'review-in') acts = `<button class="yes" data-act="yes" title="K">✓ Keep</button><button class="lat" data-act="later" title="L">★ Save for later</button><button class="no" data-act="no" title="R">✗ Take out</button>`;
  else if (k === 'review-new') acts = `<button class="yes" data-act="yes" title="K">+ Add to game</button><button class="lat" data-act="later" title="L">★ Save for later</button><button class="no" data-act="no" title="R">✗ Reject</button>`;
  else acts = `<button data-act="undo" title="U">↺ Undo</button>${k === 'later' ? '<button class="yes" data-act="yes" title="K">+ Use it here after all</button>' : ''}`;
  const later = k === 'later' ? `<div class="later"><select data-for>${['<option value="">For which weapon?</option>', ...FUTURE.map((t) => `<option${ts.for === t ? ' selected' : ''}>${t}</option>`)].join('')}</select><input type="text" data-lnote placeholder="note (optional)" value="${esc(ts.note)}"></div>` : '';
  return `<div class="take k-${k}" tabindex="0" data-name="${name}" data-li="${li}" data-f="${f}">
    <button class="play" data-act="solo" title="Play alone (Enter)">▶</button>
    <canvas data-wave="${f}" data-kind="${cls}" width="440" height="68" title="Play alone"></canvas>
    <div class="nm"><div class="lbl">${takeLabel(f)}</div>
      <div><span class="chip ${cls}">${text}</span>${showFrom ? `<span class="from">from ${BANKS[name].label}</span>` : ''}</div>
      ${where ? `<div class="use">${where}</div>` : ''}${also.length ? `<div class="use also">Also used by: ${also.join(', ')}</div>` : ''}
      ${later}${showFrom ? '' : trimHtml('take:' + f, ts.db)}</div>
    <div class="vd">${acts}<button class="mix" data-act="mix" title="The whole sound with this take (M)">▶ Hear in mix</button></div>
  </div>`;
}

// ---------- a sound ----------
function renderMain() {
  if (cur === '@later') return renderLater();
  const name = cur, b = BANKS[name], ss = soundSel(name), c = counts(name);
  const tab = (id, label, n) => `<button class="tab${filter === id ? ' on' : ''}" data-filter="${id}">${label} <span>${n}</span></button>`;
  let h = `<div class="card"><div class="hd"><h2>${b.label}</h2><span class="prog">${c.all - c.review} of ${c.all} takes reviewed</span><span class="sp"></span>
    <button class="big primary" data-act="full" title="Space">▶ Play in game</button>
    <button class="big" data-act="burst">Repeat ×6</button>
    ${b.pending ? '' : '<button class="big" data-act="classic">Old version</button>'}
    ${c.review ? '<button class="big next" data-act="next" title="N">Next to review ▶</button>' : ''}</div>
    ${b.pending ? '<div class="help pend">Not in the game yet: pick the takes you like now, and they go in when this sound is wired (the next phases).</div>' : !b.layers[0].files?.length ? '<div class="help pend">The game plays its old synthesised version of this until you add takes here.</div>' : ''}
    <div class="hd" style="margin-top:8px">${trimHtml('sound', ss.db)}<span class="help">level of the whole sound</span></div>
    <textarea data-note placeholder="Notes for Claude about this sound (what's wrong, what you want instead)…">${esc(ss.note)}</textarea>
    <div class="tabs">${tab('all', 'All', c.all)}${tab('review', 'To review', c.review)}${tab('game', 'In the game', c.game)}${tab('later', 'Saved for later', c.later)}${tab('out', 'Rejected', c.out)}</div>
    <div class="help">Keys on a take: Enter play · M hear in mix · K keep/add · L save for later · R reject · U undo · N next to review · ↑↓ move</div></div>`;
  const seen = new Set();
  b.layers.forEach((l, li) => {
    const ls = layerSel(name, li);
    h += `<div class="card lyr${ls.off ? ' off' : ''}"><div class="hd"><h3>${l.label || 'Layer ' + (li + 1)}</h3><span class="chip ${l.synth ? 'cand' : 'in'}">${l.synth ? 'synthesised' : filesOf(l).length + ' takes'}</span><span class="sp"></span>
      <button data-act="layer" data-li="${li}">▶ ${l.synth ? 'Play' : 'Random take'}</button>
      ${trimHtml('layer:' + li, ls.db)}
      <label class="trim"><input type="checkbox" data-off="${li}" ${ls.off ? '' : 'checked'}> layer on</label></div>`;
    if (!l.synth) {
      const fresh = filesOf(l).filter((f) => !seen.has(f)); fresh.forEach((f) => seen.add(f));
      if (!fresh.length) { h += '<div class="help">Same take as above (one choice covers both).</div></div>'; return; }
      const rows = fresh.map((f) => [f, kind(name, l, f)]).filter(([, k]) =>
        filter === 'all' || (filter === 'review' && !reviewed(k)) || (filter === 'game' && inGameKind(k)) || (filter === 'later' && k === 'later') || (filter === 'out' && k === 'out'));
      h += `<div class="takes">${rows.map(([f, k]) => rowHtml(name, li, f, k)).join('') || '<div class="help">Nothing here in this view.</div>'}</div>`;
    }
    h += '</div>';
  });
  $('main').innerHTML = h;
  bindMain(); bindRows(); drawWaves();
}

function renderLater() {
  const list = laterList();
  const byType = {};
  for (const it of list) (byType[sel().takes[it.name + ':' + it.f]?.for || 'Weapon not picked yet'] ||= []).push(it);
  let h = `<div class="card"><div class="hd"><h2>★ Saved for future weapons</h2><span class="prog">${list.length} take${list.length === 1 ? '' : 's'}</span></div>
    <div class="help">Takes you liked that don't fit their current gun. They're not in the game. Pick which weapon each is for; when that weapon is built, Claude starts from these.</div></div>`;
  if (!list.length) h += '<div class="card help">Nothing saved yet. On any take, press ★ Save for later.</div>';
  for (const [t, items] of Object.entries(byType)) h += `<div class="card lyr"><div class="hd"><h3>${esc(t)}</h3></div><div class="takes">${items.map((it) => rowHtml(it.name, it.li, it.f, 'later', true)).join('')}</div></div>`;
  $('main').innerHTML = h;
  bindRows(); drawWaves();
}

function bindMain() {
  const name = cur, m = $('main');
  m.querySelector('[data-act=full]').onclick = () => playFull(name);
  m.querySelector('[data-act=burst]').onclick = () => burst(name);
  m.querySelector('[data-act=classic]')?.addEventListener('click', () => classic(name));
  m.querySelector('[data-act=next]')?.addEventListener('click', () => nextToReview(null, true));
  m.querySelector('[data-note]').oninput = (e) => { soundSel(name).note = e.target.value; touch(); };
  for (const el of m.querySelectorAll('[data-filter]')) el.onclick = () => { filter = el.dataset.filter; try { localStorage.setItem('soundboard_filter', filter); } catch { /* ignore */ } renderMain(); };
  for (const el of m.querySelectorAll('[data-act=layer]')) el.onclick = () => layerOnce(name, +el.dataset.li);
  for (const el of m.querySelectorAll('[data-off]')) el.onchange = () => { layerSel(name, +el.dataset.off).off = !el.checked; touch(); el.closest('.lyr').classList.toggle('off', !el.checked); };
  for (const el of m.querySelectorAll('.card > .hd [data-trim]')) {
    el.oninput = () => { const key = el.dataset.trim, v = +el.value; if (key === 'sound') soundSel(name).db = v; else layerSel(name, +key.slice(6)).db = v; el.nextElementSibling.textContent = dbText(v); touch(); };
    el.onchange = () => (el.dataset.trim === 'sound' ? playFull(name) : layerOnce(name, +el.dataset.trim.slice(6)));
  }
}

// the next take nobody has judged yet (after `from`, or from the top): focus it, bring it into view, play it
function nextToReview(from, play) {
  const rows = [...$('main').querySelectorAll('.take')];
  const i0 = from ? rows.indexOf(from) + 1 : 0;
  const nx = [...rows.slice(i0), ...rows.slice(0, i0)].find((r) => r.className.includes('k-review'));
  if (!nx) return false;
  nx.focus({ preventScroll: true }); nx.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (play) solo(nx.dataset.name, +nx.dataset.li, nx.dataset.f);
  return true;
}

function bindRows() {
  for (const row of $('main').querySelectorAll('.take')) {
    const name = row.dataset.name, li = +row.dataset.li, f = row.dataset.f;
    const decide = (v) => {
      const t = takeSel(name, f);
      if (v === 'undo') { t.v = undefined; t.for = undefined; t.note = undefined; } else t.v = v;
      touch(); renderMain();
      const again = $('main').querySelector(`.take[data-name="${name}"][data-li="${li}"][data-f="${CSS.escape(f)}"]`);
      if (v === 'later' && again) again.querySelector('[data-for]')?.focus(); // say which weapon
      else if (v !== 'undo' && cur !== '@later' && nextToReview(again, false)) { /* moved on to the next one to judge */ }
      else again?.focus();
    };
    const act = (a) => {
      if (a === 'solo') { solo(name, li, f); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
      else if (a === 'mix') playFull(name, { forceLayer: li, force: f });
      else decide(a);
    };
    for (const btn of row.querySelectorAll('[data-act]')) btn.onclick = (e) => { e.stopPropagation(); act(btn.dataset.act); };
    row.querySelector('canvas').onclick = () => act('solo');
    row.querySelector('[data-for]')?.addEventListener('change', (e) => { takeSel(name, f).for = e.target.value || undefined; touch(); if (cur === '@later') renderMain(); });
    row.querySelector('[data-lnote]')?.addEventListener('input', (e) => { takeSel(name, f).note = e.target.value; touch(); });
    const tr = row.querySelector('[data-trim]');
    if (tr) { tr.oninput = () => { takeSel(name, f).db = +tr.value; tr.nextElementSibling.textContent = dbText(+tr.value); touch(); }; tr.onchange = () => solo(name, li, f); }
    row.onkeydown = (e) => {
      if (e.target.closest('select, input, textarea')) return;
      const k = e.key.toLowerCase(), rk = row.className.match(/k-([\w-]+)/)[1];
      if (k === 'enter' || k === ' ') act('solo'); else if (k === 'm') act('mix');
      else if (k === 'k' && rk !== 'kept' && rk !== 'added') act('yes'); else if (k === 'l' && rk.startsWith('review')) act('later');
      else if (k === 'r' && rk.startsWith('review')) act('no'); else if (k === 'u' && !rk.startsWith('review')) act('undo');
      else if (k === 'n') nextToReview(row, true);
      else if (k === 'arrowdown' || k === 'arrowup') { const rows = [...$('main').querySelectorAll('.take')], i = rows.indexOf(row); rows[i + (k === 'arrowdown' ? 1 : -1)]?.focus(); }
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
    const row = cv.closest('.take'), l = BANKS[row.dataset.name].layers[+row.dataset.li];
    g.clearRect(0, 0, W, H); g.fillStyle = { in: '#2fb1b4', cand: '#ffb347', later: '#c9a4ff', out: '#ff6b5e' }[cv.dataset.kind];
    const longest = Math.max(...filesOf(l).map((q) => S.buf.get(q)?.duration || 0));
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
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); return; }
  if (e.target.closest?.('select, input, textarea, .take, button')) return;
  if (e.key === ' ' && cur !== '@later') { e.preventDefault(); playFull(cur); } else if (e.key.toLowerCase() === 'n' && cur !== '@later') nextToReview(null, true);
});
setInterval(() => {
  const all = S.files().length, have = S.buf.size;
  $('status').textContent = !audio.ctx || audio.ctx.state !== 'running' ? 'tap anywhere to turn sound on' : have < all ? `loading sounds ${have}/${all}` : `${all} takes loaded`;
}, 300);

// ---------- start: the saved selection, then any unsaved draft from this browser ----------
// (version 1 files keyed takes by file alone: those choices now apply to each sound that has the file)
function upgrade(j) {
  if (!j || j.version >= 2) return j;
  const takes = {};
  for (const [f, v] of Object.entries(j.takes || {})) for (const [n, b] of Object.entries(BANKS)) if (b.layers.some((l) => filesOf(l).includes(f))) takes[n + ':' + f] = v;
  return { ...j, version: 2, takes };
}
(async () => {
  try { const r = await fetch(SELECTION_URL + '?' + Date.now(), { cache: 'no-store' }); if (r.ok) S.setSelection(upgrade(await r.json())); } catch { /* none saved yet */ }
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (d && confirm('You have unsaved Sound Board changes from before. Restore them?')) { S.setSelection(upgrade(d)); dirty = true; $('saveState').textContent = 'unsaved changes'; $('saveState').className = 'dirty'; }
    else localStorage.removeItem(DRAFT);
  } catch { /* ignore */ }
  renderSide(); renderMain();
})();
