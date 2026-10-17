// Recorded sound effects: the files are fetched while the game loads (no AudioContext needed), decoded once the first
// tap has made the context, and kept as AudioBuffers. Each buffer remembers where its sound really starts (an MP3
// carries a few ms of encoder silence in front), so a transient lands on the frame that asked for it.
// The user's Sound Board choices (assets/sfx/selection.json) decide which takes play and at what level:
//   takes['<sound>:<file>'] = { v, db, for, note }  per sound (a file shared by two sounds is judged in each):
//       v 'yes' kept/added, 'no' rejected, 'later' saved for a future weapon (for: which), none = not reviewed;
//       a default take plays unless 'no'/'later', a candidate only when 'yes'
//   layers[key]   = { db, off }                            key = '<sound>#<layer index>'
//   sounds[name]  = { db, note }
import { BANKS } from './banks.js';

export const SELECTION_URL = 'assets/sfx/selection.json';
const dbk = (db) => Math.pow(10, (db || 0) / 20);

export class Samples {
  constructor() { this.raw = new Map(); this.buf = new Map(); this.lead = new Map(); this.last = new Map(); this.sel = { takes: {}, layers: {}, sounds: {} }; }

  files() { const s = new Set(); for (const b of Object.values(BANKS)) for (const l of b.layers) for (const f of [...(l.files || []), ...(l.extra || [])]) s.add(f); return [...s]; }

  // the game: the user's selection first, then only the takes it plays (the board's candidates stay on the server);
  // the Sound Board (selection: false): every take
  preload({ selection = true } = {}) {
    if (this.started) return; this.started = true;
    if (!selection) { this.fetchFiles(this.files()); return; }
    fetch(SELECTION_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) this.setSelection(j); })
      .catch(() => {}).finally(() => this.fetchFiles(this.used()));
  }
  fetchFiles(list) {
    for (const f of list) fetch(f).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => { if (ab) { this.raw.set(f, ab); if (this.ctx) this.decode(f); } }).catch(() => {});
  }
  used() { const s = new Set(); for (const [n, b] of Object.entries(BANKS)) for (const l of b.layers) for (const f of this.active(n, l)) s.add(f); return [...s]; }
  setSelection(j) { this.sel = { takes: j.takes || {}, layers: j.layers || {}, sounds: j.sounds || {} }; }

  // with the AudioContext: decode everything fetched so far (and anything still arriving, as it lands)
  attach(ctx) {
    if (this.ctx) return; this.ctx = ctx;
    for (const f of this.raw.keys()) this.decode(f);
  }

  decode(f) {
    const ab = this.raw.get(f); if (!ab || this.buf.has(f)) return; this.raw.delete(f);
    const done = (b) => { if (!b) return; this.buf.set(f, b); this.lead.set(f, onset(b)); };
    try { const p = this.ctx.decodeAudioData(ab, done, () => {}); p?.catch?.(() => {}); } catch { /* undecodable: the synth stands in */ }
  }

  // the takes a layer of a sound plays now: its defaults the user has not taken out + candidates the user added
  verdict(name, f) { return this.sel.takes[name + ':' + f]?.v; }
  inGame(name, l, f) { const v = this.verdict(name, f); return (l.extra || []).includes(f) && !(l.files || []).includes(f) ? v === 'yes' : v !== 'no' && v !== 'later'; }
  active(name, l) { return [...new Set([...(l.files || []), ...(l.extra || [])])].filter((f) => this.inGame(name, l, f)); }
  takeGain(name, f) { return dbk(this.sel.takes[name + ':' + f]?.db); }
  layerGain(name, li) { const s = this.sel.layers[name + '#' + li]; return s?.off ? 0 : dbk(s?.db); }
  soundGain(name) { return dbk(this.sel.sounds[name]?.db); }

  // a bank plays when any of its recorded layers has takes in use and every one of them is loaded (half a bank would
  // repeat the same take); with nothing kept (every take rejected, or none added yet) the synth plays instead
  ready(name) {
    const b = BANKS[name]; if (!b) return false;
    const a = b.layers.filter((l) => !l.synth).flatMap((l) => this.active(name, l));
    return a.length > 0 && a.every((f) => this.buf.has(f));
  }

  // a random take, never the one that played last time from this layer
  pick(key, files) {
    const have = files.filter((f) => this.buf.has(f)); if (!have.length) return null;
    let i = Math.floor(Math.random() * have.length);
    if (have.length > 1 && have[i] === this.last.get(key)) i = (i + 1 + Math.floor(Math.random() * (have.length - 1))) % have.length;
    this.last.set(key, have[i]);
    return have[i];
  }
}

// the first sample above -34 dB of the buffer's peak, less 1 ms
function onset(b) {
  const d = b.getChannelData(0); let pk = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
  const th = pk * 0.02;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > th) return Math.max(0, i / b.sampleRate - 0.001);
  return 0;
}
