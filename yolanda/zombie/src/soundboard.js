// The Sound Board (sounds.html): every recorded sound the game plays, grouped (Weapons, Zombies, World, Coming next),
// layer by layer and take by take. Listen solo or in the full in-game mix, or audition a whole layer in a row; per take:
// keep it, add a new option to the game, save it for a future weapon, or reject it; trim levels; compare with the old
// synthesised version. Choices are per sound ("also used by" shows a file shared by two sounds). Choices save to
// assets/sfx/selection.json (tools/serve.mjs; autosave on by default), which the game reads (src/sfx/samples.js). It plays
// through the game's own engine (src/audio.js): what you hear here is what the game plays.
import { CombatAudio, SYNTH_ALIAS } from './audio.js';
import { BANKS, takeLabel } from './sfx/banks.js';
import { SELECTION_URL } from './sfx/samples.js';

const $ = (id) => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem('soundboard_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('soundboard_' + k, JSON.stringify(v)); } catch { /* private window */ } } };
const audio = new CombatAudio();
window.soundBoard = { audio }; // (for checking the board from the console)
// the sounds with an old synthesised version (audio.js synth cases, or an alias to one): the rest are silent until picked
const CLASSIC = new Set([...String(audio.synth).matchAll(/case '(\w+)'/g)].map((m) => m[1]));
const hasClassic = (n) => CLASSIC.has(SYNTH_ALIAS[n] || n);
const S = audio.samples;
audio.setVolume(0.9);
S.preload({ selection: false }); // (the board loads the saved selection itself, below, so a restored draft is not overwritten)
let cur = BANKS[store.get('cur', '')] || store.get('cur', '') === '@later' ? store.get('cur', '') : Object.keys(BANKS)[0];
let dirty = false, query = '';
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
  // every voice the board starts (recorded takes, synth tones and noise), so Stop can end each one by name
  for (const m of ['createBufferSource', 'createOscillator']) {
    const make = c[m].bind(c);
    c[m] = (...a) => { const n = make(...a); live.add(n); n.addEventListener('ended', () => live.delete(n)); return n; };
  }
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

let timers = [];
const later = (fn, ms) => { const id = setTimeout(() => { timers = timers.filter((x) => x !== id); fn(); }, ms); timers.push(id); return id; };
function playFull(name, opts) { withAudio(() => playFullNow(name, opts)); }
function playFullNow(name, opts) {
  audio.recent.clear(); audio.active.length = 0;
  if (opts) audio.playBank(name, 1, audio.ctx.currentTime, sp(), opts);
  else audio.play(name, 1, pos());
  const then = BANKS[name].then;
  if (then) later(() => { audio.recent.clear(); audio.play(then.name, 1, pos()); }, then.at * 1000);
}
function burst(name) {
  const gap = (BANKS[name].cadence || 0.5) * 1000;
  for (let i = 0; i < 6; i++) later(() => playFull(name), i * gap);
}
function classic(name) { withAudio(() => { audio.recent.clear(); audio.setModern(false); audio.play(name, 1, pos()); audio.setModern(true); }); }
function solo(name, li, f) { withAudio(() => { audio.playBank(name, 1, audio.ctx.currentTime, sp(), { only: li, forceLayer: li, force: f }); playhead(name, li, f); }); }
function layerOnce(name, li) { withAudio(() => audio.playBank(name, 1, audio.ctx.currentTime, sp(), { only: li })); }
// Stop (Esc): every sound now playing or scheduled, any audition in progress
// (three ways at once, so it holds on every browser: each voice stopped, the buses swapped out from under anything left,
// and a brief pause of the whole context as a backstop; then every other open board tab is told to stop too)
const live = new Set();
let bc = null; try { bc = new BroadcastChannel('soundboard'); bc.onmessage = (e) => { if (e.data === 'stop') stopAll(false); }; } catch { /* old browser */ }
function stopAll(tell = true) {
  for (const id of timers) clearTimeout(id); timers = [];
  queue = null; document.querySelectorAll('.take.now').forEach((r) => r.classList.remove('now'));
  head = null;
  for (const n of live) { try { n.stop(); } catch { /* not started yet or already ended */ } try { n.disconnect(); } catch { /* ignore */ } }
  live.clear();
  audio.resetVoices?.();
  if (audio.reverbIn) applyRoom();
  const c = audio.ctx;
  if (c && c.state === 'running') c.suspend().then(() => setTimeout(() => c.resume().catch(() => {}), 60)).catch(() => {});
  $('stop').classList.remove('live');
  if (tell) bc?.postMessage('stop');
}

// ---------- the playhead: a line across the waveform of the take playing ----------
let head = null;
function playhead(name, li, f) {
  const b = S.buf.get(f); if (!b) return;
  head = { name, li, f, t0: performance.now(), dur: b.duration - (S.lead.get(f) || 0) };
  $('stop').classList.add('live');
  requestAnimationFrame(drawHead);
}
function drawHead() {
  document.querySelectorAll('.ph').forEach((e) => (e.style.opacity = 0));
  if (!head) return;
  const el = (performance.now() - head.t0) / 1000;
  if (el > head.dur + 0.05) { head = null; if (!queue) $('stop').classList.remove('live'); return; }
  const row = rowEl(head.name, head.li, head.f), cv = row?.querySelector('canvas');
  if (cv) { const ph = row.querySelector('.ph'); ph.style.opacity = 1; ph.style.left = Math.min(100, (el / +cv.dataset.span) * 100) + '%'; }
  requestAnimationFrame(drawHead);
}
const rowEl = (name, li, f) => $('main').querySelector(`.take[data-name="${name}"][data-li="${li}"][data-f="${CSS.escape(f)}"]`);

// ---------- audition: play the takes one after another (decide on each with the keys while it plays) ----------
let queue = null;
function audition(items) {
  stopAll(); if (!items.length) return;
  queue = { items, i: 0 }; $('stop').classList.add('live');
  const step = () => {
    if (!queue) return;
    if (queue.i >= queue.items.length) { stopAll(); return; }
    const it = queue.items[queue.i++], row = rowEl(it.name, it.li, it.f);
    document.querySelectorAll('.take.now').forEach((r) => r.classList.remove('now'));
    if (row) { row.classList.add('now'); row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    solo(it.name, it.li, it.f);
    const b = S.buf.get(it.f);
    later(step, Math.max(700, ((b?.duration || 0.5) + 0.45) * 1000));
  };
  withAudio(step);
}
const visibleRows = (sel) => [...$('main').querySelectorAll(sel || '.take')].map((r) => ({ name: r.dataset.name, li: +r.dataset.li, f: r.dataset.f }));

// ---------- the selection (S.sel is what the engine plays from: edits are heard at once) ----------
// a take's choice is per sound: takes['<sound>:<file>'] = { v: 'yes' | 'no' | 'later', for, note, db }
const sel = () => S.sel;
const takeSel = (name, f) => (sel().takes[name + ':' + f] ||= {});
const layerSel = (name, li) => (sel().layers[name + '#' + li] ||= {});
const soundSel = (name) => (sel().sounds[name] ||= {});
const FUTURE = ['Rifle', 'Revolver', 'Heavy pistol (.45 / .50)', 'Small pistol (.22 / .380)', 'SMG', 'Assault rifle', 'Hunting / bolt rifle', 'Double-barrel shotgun', 'Sawn-off shotgun', 'Something else (see note)'];
// undo: a snapshot before every change (Ctrl+Z or the Undo button)
const history = [];
function snapshot() { history.push(JSON.stringify(sel())); if (history.length > 80) history.shift(); $('undo').disabled = false; }
function undo() {
  const s = history.pop(); if (!s) return;
  S.setSelection(JSON.parse(s)); $('undo').disabled = !history.length; touch(); renderMain();
}
let saveTimer = 0;
function touch() {
  dirty = true; $('saveState').textContent = 'unsaved changes'; $('saveState').className = 'dirty';
  store.set('draft', pruned());
  renderSide(); renderProgress();
  if ($('autosave').checked) { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200); }
}
function pruned() {
  const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== 0 && x !== '' && x !== false))]).filter(([, v]) => Object.keys(v).length));
  return { version: 2, savedAt: new Date().toISOString(), takes: clean(sel().takes), layers: clean(sel().layers), sounds: clean(sel().sounds) };
}
async function save() {
  clearTimeout(saveTimer);
  $('saveState').textContent = 'saving…';
  try {
    const r = await fetch('/__sfx/selection.json', { method: 'POST', body: JSON.stringify(pruned(), null, 1) });
    if (!r.ok) throw new Error(r.status);
    dirty = false; $('saveState').textContent = 'saved ✓'; $('saveState').className = 'ok';
    store.set('draft', null);
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
const hit = (s) => !query || String(s).toLowerCase().includes(query);
const soundHit = (n) => { const b = BANKS[n]; return hit(b.label) || hit(b.sub || '') || hit(b.group || '') || hit(b.hook || '') || b.layers.some((l) => hit(l.label || '') || filesOf(l).some((f) => hit(takeLabel(f)))); };

// ---------- the sound list: groups > sub-groups > sounds, with progress; the phone gets a picker ----------
const ORDER = ['Weapons', 'Zombies', 'World', 'Coming next'];
function tree() {
  const t = {};
  for (const [n, b] of Object.entries(BANKS)) ((t[b.group || 'Other'] ||= {})[b.sub || ''] ||= []).push(n);
  return Object.entries(t).sort(([a], [b]) => (ORDER.indexOf(a) + 99 * (ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 99 * (ORDER.indexOf(b) < 0)));
}
const bar = (done, all) => `<span class="bar"><i style="width:${all ? (100 * done) / all : 0}%"></i></span>`;
function renderSide() {
  const open = store.get('open', {}), nl = laterList().length;
  let h = '', opts = '';
  for (const [g, subs] of tree()) {
    const names = Object.values(subs).flat(), shown = names.filter(soundHit);
    if (!shown.length) continue;
    let all = 0, rev = 0; for (const n of names) { const c = counts(n); all += c.all; rev += c.all - c.review; }
    h += `<details class="grp" data-g="${g}"${open[g] !== false || query ? ' open' : ''}><summary><b>${g}</b><span class="gp">${rev}/${all}</span>${bar(rev, all)}</summary>`;
    for (const [sub, ns] of Object.entries(subs)) {
      const sh = ns.filter(soundHit); if (!sh.length) continue;
      if (sub) h += `<h4>${sub}</h4>`;
      opts += `<optgroup label="${g}${sub ? ' › ' + sub : ''}">`;
      for (const n of sh) {
        const c = counts(n), b = BANKS[n];
        h += `<button class="snd${n === cur ? ' cur' : ''}" data-snd="${n}">${b.label}<small>${c.game} ${b.pending ? 'picked' : 'in game'}${c.review ? ` · <b class="todo">${c.review} to review</b>` : ' · all reviewed ✓'}</small></button>`;
        opts += `<option value="${n}"${n === cur ? ' selected' : ''}>${b.label}${c.review ? ` (${c.review} to review)` : ' ✓'}</option>`;
      }
      opts += '</optgroup>';
    }
    h += '</details>';
  }
  h += `<details class="grp" open><summary><b>Library</b></summary><button class="snd${cur === '@later' ? ' cur' : ''}" data-snd="@later">★ Saved for future weapons<small>${nl} take${nl === 1 ? '' : 's'}</small></button></details>`;
  opts += `<option value="@later"${cur === '@later' ? ' selected' : ''}>★ Saved for future weapons (${nl})</option>`;
  $('list').innerHTML = h || '<div class="help">No sound matches.</div>';
  $('pick').innerHTML = opts;
  for (const b of $('list').querySelectorAll('.snd')) b.onclick = () => go(b.dataset.snd);
  for (const d of $('list').querySelectorAll('details[data-g]')) d.ontoggle = () => { if (query) return; const o = store.get('open', {}); o[d.dataset.g] = d.open; store.set('open', o); };
}
function go(name) { stopAll(); cur = name; store.set('cur', cur); renderSide(); renderMain(); scrollTo(0, 0); }
function step(d) { const all = [...$('pick').options].map((o) => o.value), i = all.indexOf(cur); if (all.length) go(all[(i + d + all.length) % all.length]); }
function renderProgress() {
  let all = 0, rev = 0; for (const n of Object.keys(BANKS)) { const c = counts(n); all += c.all; rev += c.all - c.review; }
  $('prog').innerHTML = `${rev} of ${all} takes reviewed ${bar(rev, all)}`;
}
const dbText = (v) => `${v > 0 ? '+' : ''}${(+v || 0).toFixed(1)} dB`;
const trimHtml = (key, v) => `<span class="trim">level <input type="range" min="-12" max="6" step="0.5" value="${v || 0}" data-trim="${key}"><b>${dbText(v)}</b></span>`;
const esc = (s) => String(s || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// ---------- one take row ----------
function rowHtml(name, li, f, k, showFrom = false) {
  const ts = sel().takes[name + ':' + f] || {}, [cls, text] = KIND[k], b = BANKS[name];
  const also = alsoUsed(name, f);
  const where = b.pending ? (inGameKind(k) ? 'Picked: used as soon as this sound is wired into the game' : '')
    : inGameKind(k) ? `Part of the ${b.label.toLowerCase()} you hear in the game` : k === 'review-new' ? 'Try “Hear in mix” to hear it in the full sound' : '';
  let acts;
  if (k === 'review-in') acts = `<button class="yes" data-act="yes" title="K">✓ Keep</button><button class="lat" data-act="later" title="L">★ Save for later</button><button class="no" data-act="no" title="R">✗ Take out</button>`;
  else if (k === 'review-new') acts = `<button class="yes" data-act="yes" title="K">+ Add to game</button><button class="lat" data-act="later" title="L">★ Save for later</button><button class="no" data-act="no" title="R">✗ Reject</button>`;
  else acts = `<button data-act="undo" title="U">↺ Undo</button>${k === 'later' ? '<button class="yes" data-act="yes" title="K">+ Use it here after all</button>' : ''}`;
  const lat = k === 'later' ? `<div class="later"><select data-for>${['<option value="">For which weapon?</option>', ...FUTURE.map((t) => `<option${ts.for === t ? ' selected' : ''}>${t}</option>`)].join('')}</select><input type="text" data-lnote placeholder="note (optional)" value="${esc(ts.note)}"></div>` : '';
  const dur = S.buf.get(f)?.duration;
  return `<div class="take k-${k}" tabindex="0" data-name="${name}" data-li="${li}" data-f="${f}">
    <button class="play" data-act="solo" title="Play alone (Enter)">▶</button>
    <div class="wv"><canvas data-wave="${f}" data-kind="${cls}" width="440" height="68" title="Play alone"></canvas><i class="ph"></i></div>
    <div class="nm"><div class="lbl">${esc(takeLabel(f))}</div>
      <div><span class="chip ${cls}">${text}</span><span class="len" data-len="${f}">${dur ? dur.toFixed(1) + ' s' : ''}</span>${showFrom ? `<span class="from">from ${b.label}</span>` : ''}</div>
      ${where ? `<div class="use">${where}</div>` : ''}${also.length ? `<div class="use also">Also used by: ${also.join(', ')}</div>` : ''}
      ${lat}${showFrom ? '' : trimHtml('take:' + f, ts.db)}</div>
    <div class="vd">${acts}<button class="mix" data-act="mix" title="The whole sound with this take (M)">▶ Hear in mix</button></div>
  </div>`;
}

// ---------- a sound: its recipe (the parts that play together, drawn on a timeline), then the takes of one part ----------
let filter = store.get('filter', 'all');
// a sound's parts: its layers, where layers sharing the same takes (the four shells) are one part played several times
function parts(name) {
  const out = [];
  BANKS[name].layers.forEach((l, li) => {
    const key = l.synth ? `synth:${l.synth}:${li}` : filesOf(l).join('|');
    let p = out.find((q) => q.key === key);
    if (!p) out.push((p = { key, l, lis: [] }));
    p.lis.push(li);
  });
  for (const p of out) p.label = p.lis.length > 1 ? `${(p.l.label || 'Part').replace(/\s*\d+$/, '')} ×${p.lis.length}` : p.l.label || 'Part';
  return out;
}
const atOf = (l) => (Array.isArray(l.at) ? (l.at[0] + l.at[1]) / 2 : l.at || 0);
// a part right now, in plain words
function partState(name, p) {
  if (p.lis.every((li) => layerSel(name, li).off)) return { cls: 'off', text: 'Off: left out of the sound' };
  if (p.l.synth) return { cls: 'synth', text: 'Always plays (synthesised, no takes to pick)' };
  const n = S.active(name, p.l).length, all = filesOf(p.l).length;
  if (!n) return { cls: 'silent', text: `Silent until you keep one of its ${all} takes` };
  return { cls: 'on', text: n === 1 ? '1 take kept: plays every time' : `${n} takes kept: one plays each time, taking turns` };
}
function partDur(name, p) {
  if (p.l.synth) return 0.3;
  const fs = S.active(name, p.l).length ? S.active(name, p.l) : filesOf(p.l);
  const d = fs.map((f) => S.buf.get(f)?.duration || 0).filter(Boolean);
  return d.length ? d.reduce((a, x) => a + x, 0) / d.length : 0.4;
}
const partOf = store.get('part', {}); // which part's takes are shown, per sound
function partCounts(name, p) {
  const c = { all: 0, review: 0, game: 0, later: 0, out: 0 };
  for (const f of filesOf(p.l)) { const k = kind(name, p.l, f); c.all++; if (!reviewed(k)) c.review++; if (inGameKind(k)) c.game++; if (k === 'later') c.later++; if (k === 'out') c.out++; }
  return c;
}
function currentPart(name, ps) {
  if (partOf[name] !== undefined && ps[partOf[name]]) return partOf[name];
  const todo = ps.findIndex((p) => !p.l.synth && partCounts(name, p).review);
  return todo >= 0 ? todo : Math.max(0, ps.findIndex((p) => !p.l.synth));
}
function pickPart(name, i) { partOf[name] = i; store.set('part', partOf); renderMain(); }

function renderMain() {
  if (cur === '@later') return renderLater();
  const name = cur, b = BANKS[name], ss = soundSel(name), c = counts(name), ps = parts(name), pi = currentPart(name, ps), p = ps[pi];
  const where = b.pending ? '<div class="help pend">Not in the game yet: pick the takes you like now, and they go in when this sound is wired.</div>'
    : `<div class="help hook">In the game: plays when ${esc(b.hook || 'it happens')}.${!b.layers.some((l) => (l.files || []).length) && !ps.some((q) => !q.l.synth && S.active(name, q.l).length) ? (hasClassic(name) ? ' Until you keep takes, the game plays its old synthesised version.' : ' Nothing plays here until you keep takes.') : ''}</div>`;
  // the sound: what it is, play it, its level and notes
  let h = `<div class="card"><div class="crumb">${esc(b.group || '')}${b.sub ? ' › ' + esc(b.sub) : ''}</div>
    <div class="hd"><h2>${b.label}</h2><span class="prog1">${c.all - c.review} of ${c.all} takes reviewed</span><span class="sp"></span>
    <button class="big primary" data-act="full" title="Space">▶ Play in game</button>
    <button class="big" data-act="burst" title="Six times in a row: hear the takes take turns">Repeat ×6</button>
    ${b.pending || !hasClassic(name) ? '' : '<button class="big" data-act="classic">Old version</button>'}</div>
    ${where}
    <div class="hd" style="margin-top:8px">${trimHtml('sound', ss.db)}<span class="help">level of the whole sound</span></div>
    <textarea data-note placeholder="Notes for Claude about this sound (what's wrong, what you want instead)…">${esc(ss.note)}</textarea></div>`;
  // the recipe: every part on one timeline
  const total = Math.max(0.75, Math.ceil(Math.max(...ps.map((q) => Math.max(...q.lis.map((li) => atOf(BANKS[name].layers[li]))) + partDur(name, q))) * 4) / 4);
  const ticks = []; for (let t = 0; t <= total + 1e-6; t += 0.25) ticks.push(`<span style="left:${(t / total) * 100}%">${Math.abs(t * 2 - Math.round(t * 2)) < 1e-6 ? t.toFixed(1) + ' s' : ''}</span>`);
  h += `<div class="card recipe"><div class="hd"><h3>How it's built</h3><span class="help" style="margin:0">${ps.length > 1 ? `<b>${ps.length} parts play together</b>, each at the moment shown.` : 'One part.'} In a part, your kept takes take turns: one per play, never stacked. Tap a part to pick its takes.</span></div>
    <div class="lane ruler"><div></div><div class="track"><div class="ticks">${ticks.join('')}</div></div><div></div></div>`;
  ps.forEach((q, i) => {
    const st = partState(name, q), dur = partDur(name, q), ls = layerSel(name, q.lis[0]);
    const blocks = q.lis.map((li) => { const at = atOf(BANKS[name].layers[li]); return `<i style="left:${(at / total) * 100}%;width:${Math.max(1.5, (dur / total) * 100)}%"></i>`; }).join('');
    h += `<div class="lane st-${st.cls}${i === pi ? ' sel' : ''}" data-part="${i}" title="Tap to pick this part's takes">
      <div class="ln"><b>${i + 1}. ${esc(q.label)}</b><small>${st.text}</small></div>
      <div class="track">${blocks}</div>
      <div class="lc"><button data-act="ppart" data-part="${i}" title="This part on its own">▶</button>
        <label class="sw"><input type="checkbox" data-poff="${i}" ${st.cls === 'off' ? '' : 'checked'}> On</label>
        ${trimHtml('part:' + i, ls.db)}</div></div>`;
  });
  h += '</div>';
  // the takes of the chosen part
  if (p.l.synth) {
    h += `<div class="card"><div class="hd"><h3 class="pt">Part ${pi + 1}: ${esc(p.label)}</h3></div><div class="help">This part is synthesised: there are no takes to pick. Switch it on or off, or change its level, in the recipe above.</div></div>`;
  } else {
    const pc = partCounts(name, p);
    const tab = (id, label, n) => `<button class="tab${filter === id ? ' on' : ''}" data-filter="${id}">${label} <span>${n}</span></button>`;
    const shown = filesOf(p.l).map((f) => [f, kind(name, p.l, f)]).filter(([f, k]) => (!query || hit(takeLabel(f)) || hit(b.label) || hit(p.label)) &&
      (filter === 'all' || (filter === 'review' && !reviewed(k)) || (filter === 'game' && inGameKind(k)) || (filter === 'later' && k === 'later') || (filter === 'out' && k === 'out')));
    h += `<div class="card"><div class="hd"><h3 class="pt">Part ${pi + 1} of ${ps.length}: ${esc(p.label)} — its takes</h3><span class="prog1">${pc.all - pc.review} of ${pc.all} reviewed</span><span class="sp"></span>
      <button data-act="all" title="Play every take shown, one after another">▶▶ Play all</button>
      ${pc.review ? '<button class="next" data-act="aud" title="A: every take still to review, one after another (decide with the keys as each plays)">▶▶ Audition the rest</button>' : ''}
      ${pc.review ? `<span class="bulk">the ${pc.review} left: <button data-bulk="no">✗ reject</button><button data-bulk="later">★ later</button></span>` : ''}</div>
      <div class="tabs">${tab('all', 'All', pc.all)}${tab('review', 'To review', pc.review)}${tab('game', b.pending ? 'Picked' : 'In the game', pc.game)}${tab('later', 'Saved for later', pc.later)}${tab('out', 'Rejected', pc.out)}</div>
      <div class="takes">${shown.map(([f, k]) => rowHtml(name, p.lis[0], f, k)).join('') || '<div class="help">Nothing here in this view.</div>'}</div></div>`;
  }
  $('main').innerHTML = h;
  bindMain(ps, pi); bindRows(); drawWaves();
}

function renderLater() {
  const list = laterList();
  const byType = {};
  for (const it of list) (byType[sel().takes[it.name + ':' + it.f]?.for || 'Weapon not picked yet'] ||= []).push(it);
  let h = `<div class="card"><div class="hd"><h2>★ Saved for future weapons</h2><span class="prog1">${list.length} take${list.length === 1 ? '' : 's'}</span></div>
    <div class="help">Takes you liked that don't fit their current gun. They're not in the game. Pick which weapon each is for; when that weapon is built, Claude starts from these.</div></div>`;
  if (!list.length) h += '<div class="card help">Nothing saved yet. On any take, press ★ Save for later.</div>';
  for (const [t, items] of Object.entries(byType)) h += `<div class="card"><div class="hd"><h3 class="pt">${esc(t)}</h3></div><div class="takes">${items.map((it) => rowHtml(it.name, it.li, it.f, 'later', true)).join('')}</div></div>`;
  $('main').innerHTML = h;
  bindRows(); drawWaves();
}

function bindMain(ps, pi) {
  const name = cur, m = $('main'), p = ps[pi];
  m.querySelector('[data-act=full]').onclick = () => playFull(name);
  m.querySelector('[data-act=burst]').onclick = () => burst(name);
  m.querySelector('[data-act=classic]')?.addEventListener('click', () => classic(name));
  m.querySelector('[data-act=aud]')?.addEventListener('click', () => audition(visibleRows('.take.k-review-in, .take.k-review-new')));
  m.querySelector('[data-act=all]')?.addEventListener('click', () => audition(visibleRows('.take')));
  const note = m.querySelector('[data-note]'); note.onfocus = snapshot; note.oninput = (e) => { soundSel(name).note = e.target.value; touch(); };
  for (const el of m.querySelectorAll('[data-filter]')) el.onclick = () => { filter = el.dataset.filter; store.set('filter', filter); renderMain(); };
  // the recipe: tap a part to pick its takes; ▶ plays it alone; On and level act on every layer of the part
  for (const lane of m.querySelectorAll('.lane[data-part]')) lane.onclick = (e) => { if (!e.target.closest('button, input, label')) pickPart(name, +lane.dataset.part); };
  for (const el of m.querySelectorAll('[data-act=ppart]')) el.onclick = () => layerOnce(name, ps[+el.dataset.part].lis[0]);
  for (const el of m.querySelectorAll('[data-poff]')) el.onchange = () => { snapshot(); for (const li of ps[+el.dataset.poff].lis) layerSel(name, li).off = !el.checked; touch(); renderMain(); };
  for (const el of m.querySelectorAll('[data-bulk]')) el.onclick = () => {
    snapshot();
    for (const f of filesOf(p.l)) if (!reviewed(kind(name, p.l, f))) takeSel(name, f).v = el.dataset.bulk;
    touch(); renderMain();
  };
  for (const el of m.querySelectorAll('[data-trim]')) {
    if (el.closest('.take')) continue; // (a take's own level: bindRows)
    const key = el.dataset.trim;
    el.onpointerdown = snapshot;
    el.oninput = () => {
      const v = +el.value;
      if (key === 'sound') soundSel(name).db = v; else for (const li of ps[+key.slice(5)].lis) layerSel(name, li).db = v;
      el.nextElementSibling.textContent = dbText(v); touch();
    };
    el.onchange = () => (key === 'sound' ? playFull(name) : layerOnce(name, ps[+key.slice(5)].lis[0]));
  }
}

// the next take nobody has judged yet (after `from`, or from the top): focus it, bring it into view, play it; when this
// part has none left, the next part that has some is opened
function nextToReview(from, play) {
  const rows = [...$('main').querySelectorAll('.take')];
  const i0 = from ? rows.indexOf(from) + 1 : 0;
  const nx = [...rows.slice(i0), ...rows.slice(0, i0)].find((r) => r.className.includes('k-review'));
  if (!nx) {
    if (cur === '@later') return false;
    const ps = parts(cur), pi = currentPart(cur, ps), n = ps.length;
    for (let d = 1; d < n; d++) { const j = (pi + d) % n; if (!ps[j].l.synth && partCounts(cur, ps[j]).review) { pickPart(cur, j); return nextToReview(null, play); } }
    return false;
  }
  nx.focus({ preventScroll: true }); nx.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (play) solo(nx.dataset.name, +nx.dataset.li, nx.dataset.f);
  return true;
}

function bindRows() {
  for (const row of $('main').querySelectorAll('.take')) {
    const name = row.dataset.name, li = +row.dataset.li, f = row.dataset.f;
    const decide = (v) => {
      snapshot();
      const t = takeSel(name, f);
      if (v === 'undo') { t.v = undefined; t.for = undefined; t.note = undefined; } else t.v = v;
      touch(); renderMain();
      const again = rowEl(name, li, f);
      if (queue) { again?.classList.add('done'); return; } // (an audition carries on to the next take by itself)
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
    row.querySelector('[data-for]')?.addEventListener('change', (e) => { snapshot(); takeSel(name, f).for = e.target.value || undefined; touch(); if (cur === '@later') renderMain(); });
    const ln = row.querySelector('[data-lnote]'); if (ln) { ln.onfocus = snapshot; ln.oninput = (e) => { takeSel(name, f).note = e.target.value; touch(); }; }
    const tr = row.querySelector('[data-trim]');
    if (tr) { tr.onpointerdown = snapshot; tr.oninput = () => { takeSel(name, f).db = +tr.value; tr.nextElementSibling.textContent = dbText(+tr.value); touch(); }; tr.onchange = () => solo(name, li, f); }
    row.onkeydown = (e) => {
      if (e.target.closest('select, input, textarea')) return;
      const k = e.key.toLowerCase(), rk = row.className.match(/k-([\w-]+)/)[1];
      if (k === 'enter' || k === ' ') act('solo'); else if (k === 'm') act('mix');
      else if (k === 'k' && rk !== 'kept' && rk !== 'added') act('yes'); else if (k === 'l' && rk.startsWith('review')) act('later');
      else if (k === 'r' && rk.startsWith('review')) act('no'); else if (k === 'u' && !rk.startsWith('review')) act('undo');
      else if (k === 'n') nextToReview(row, true);
      else if (k === 'arrowdown' || k === 'arrowup') { const rows = [...$('main').querySelectorAll('.take')], i = rows.indexOf(row); rows[i + (k === 'arrowdown' ? 1 : -1)]?.focus(); }
      else return;
      e.preventDefault(); e.stopPropagation();
    };
  }
  if (queue) { const it = queue.items[queue.i - 1]; it && rowEl(it.name, it.li, it.f)?.classList.add('now'); }
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
    const spanS = Math.max(0.3, longest); cv.dataset.span = spanS; // one time scale per layer (its longest take), so lengths compare
    const lead = Math.floor((S.lead.get(f) || 0) * b.sampleRate), span = spanS * b.sampleRate;
    for (let x = 0; x < W; x++) {
      const a = lead + Math.floor(x / W * span), e = Math.min(d.length, lead + Math.floor((x + 1) / W * span)); let mx = 0;
      for (let i = a; i < e; i++) { const v = Math.abs(d[i]); if (v > mx) mx = v; }
      const hh = Math.max(1, Math.sqrt(mx) * H * 0.48); g.fillRect(x, H / 2 - hh, 1, hh * 2);
    }
    cv.dataset.drawn = 1;
    const len = row.querySelector('[data-len]'); if (len && !len.textContent) len.textContent = b.duration.toFixed(1) + ' s';
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
$('stop').onclick = () => stopAll();
$('undo').onclick = undo; $('undo').disabled = true;
$('autosave').checked = store.get('autosave', true);
$('autosave').onchange = (e) => { store.set('autosave', e.target.checked); if (e.target.checked && dirty) save(); };
$('pick').onchange = (e) => go(e.target.value);
$('prev').onclick = () => step(-1); $('next').onclick = () => step(1);
const onSearch = (e) => { query = e.target.value.trim().toLowerCase(); $('q').value = $('q2').value = e.target.value; renderSide(); renderMain(); };
$('q').oninput = onSearch; $('q2').oninput = onSearch;
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest?.('input[type=text], textarea')) { e.preventDefault(); undo(); return; }
  if (e.key === 'Escape') { stopAll(); return; }
  if (e.target.closest?.('select, input, textarea, .take, button')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' && cur !== '@later') { e.preventDefault(); playFull(cur); }
  else if (k === 'n' && cur !== '@later') nextToReview(null, true);
  else if (k === 'a' && cur !== '@later') audition(visibleRows('.take.k-review-in, .take.k-review-new'));
  else if (k === '/') { e.preventDefault(); (innerWidth < 760 ? $('q2') : $('q')).focus(); }
  else if (k === '[' || k === ']') step(k === ']' ? 1 : -1);
});
setInterval(() => {
  const all = S.files().length, have = S.buf.size;
  $('status').textContent = !audio.ctx || audio.ctx.state !== 'running' ? 'tap anywhere to turn sound on' : have < all ? `loading ${have}/${all}` : `${all} takes loaded`;
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
    const d = store.get('draft', null) || JSON.parse(localStorage.getItem('soundboard_draft') || 'null');
    if (d && confirm('You have unsaved Sound Board changes from before. Restore them?')) { S.setSelection(upgrade(d)); touch(); }
    else store.set('draft', null);
  } catch { /* ignore */ }
  renderSide(); renderMain(); renderProgress();
})();
