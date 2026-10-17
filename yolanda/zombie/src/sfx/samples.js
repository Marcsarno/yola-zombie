// Recorded sound effects: the files are fetched while the game loads (no AudioContext needed), decoded once the first
// tap has made the context, and kept as AudioBuffers. Each buffer remembers where its sound really starts (an MP3
// carries a few ms of encoder silence in front), so a transient lands on the frame that asked for it.
import { BANKS } from './banks.js';

export class Samples {
  constructor() { this.raw = new Map(); this.buf = new Map(); this.lead = new Map(); this.last = new Map(); this.decoding = false; }

  files() { const s = new Set(); for (const b of Object.values(BANKS)) for (const l of b.layers) for (const f of l.files || []) s.add(f); return [...s]; }

  preload() {
    if (this.started) return; this.started = true;
    for (const f of this.files()) fetch(f).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => { if (ab) { this.raw.set(f, ab); if (this.ctx) this.decode(f); } }).catch(() => {});
  }

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

  // a bank plays only when every file of its main layer is in (half a bank would repeat the same take)
  ready(name) { const b = BANKS[name]; return !!b && (b.layers[0].files || []).every((f) => this.buf.has(f)); }

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
