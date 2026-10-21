// Chapter 2: the recorded lines (assets/neighborhood/voice/, the user's audio pack) on the game's dialogue bus (src/audio.js
// voiceBus, under its master volume and mute; the music ducks while someone speaks). A line is fetched and decoded the
// first time it is wanted (prefetch(ids) a scene ahead); radio lines go through a walkie-talkie's band (300 - 3200 Hz, a
// little drive) with a squelch click at each end. One analyser follows whatever is speaking (the radio card's waveform).
import { LINES, CUES } from './script.js';

const DIR = 'assets/neighborhood/voice/';

export class Voice {
  constructor(audio) { this.audio = audio; this.buf = new Map(); this.loading = new Map(); this.playing = new Set(); }
  ctx() { const a = this.audio; if (!a) return null; if (!a.ctx) a.init?.(); return a.ctx || null; }
  file(id) { return LINES[id]?.[3] || CUES[id] || null; }
  load(id) {
    const f = this.file(id); if (!f) return Promise.resolve(null);
    if (this.buf.has(f)) return Promise.resolve(this.buf.get(f));
    if (this.loading.has(f)) return this.loading.get(f);
    const c = this.ctx(); if (!c) return Promise.resolve(null);
    const p = fetch(DIR + f + '.mp3').then((r) => r.arrayBuffer()).then((a) => c.decodeAudioData(a))
      .then((b) => { this.buf.set(f, b); return b; }).catch((e) => { console.warn('voice', f, e); this.buf.set(f, null); return null; });
    this.loading.set(f, p); return p;
  }
  prefetch(ids) { for (const id of ids) this.load(id); }
  // decoded (an AudioBuffer), not yet (undefined) or failed / no file (null)
  state(id) { const f = this.file(id); if (!f) return null; return this.buf.has(f) ? this.buf.get(f) : undefined; }
  get analyser() {
    const c = this.ctx(); if (!c) return null;
    if (!this.an) { this.an = c.createAnalyser(); this.an.fftSize = 256; this.an.connect(this.audio.voiceBus || this.audio.master); }
    return this.an;
  }
  // play a line or a cue now: its length (s), or null when it has no sound
  play(id, { radio = false, gain = 1 } = {}) {
    const b = this.state(id), c = this.ctx(); if (!b || !c) return null;
    const t = c.currentTime + 0.02, src = c.createBufferSource(); src.buffer = b;
    const g = c.createGain(); g.gain.value = gain * (radio ? 1.25 : 1);
    let head = src;
    if (radio) {
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = 0.7;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.9;
      const ws = c.createWaveShaper(); ws.curve = Voice.drive(); ws.oversample = '2x';
      src.connect(hp); hp.connect(lp); lp.connect(ws); head = ws;
      this.squelch(t, 0.06); this.squelch(t + b.duration + 0.02, 0.09);
    }
    head.connect(g); g.connect(this.analyser);
    src.start(t);
    this.playing.add(src); this.audio.duck?.(true);
    src.onended = () => { this.playing.delete(src); if (!this.playing.size) this.audio.duck?.(false); };
    return b.duration + (radio ? 0.12 : 0);
  }
  // James's headphones: music leaking tinny from them (no recording: a little four-bar loop made here, thin and quiet)
  tinny() {
    const c = this.ctx(); if (!c) return null;
    const sr = c.sampleRate, len = Math.floor(sr * 2.4), b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
    const notes = [64, 67, 71, 67, 62, 66, 69, 66, 60, 64, 67, 64, 62, 66, 69, 71], beat = len / notes.length;
    for (let i = 0; i < len; i++) {
      const k = Math.floor(i / beat), t = (i % beat) / sr, f = 440 * Math.pow(2, (notes[k] - 69) / 12);
      const env = Math.exp(-t * 9), sq = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.6 + Math.sin(2 * Math.PI * f * 2 * t) * 0.3;
      const kick = (k % 4 === 0) ? Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 30) * 0.5 : 0;
      d[i] = (sq * env + kick) * 0.5;
    }
    const src = c.createBufferSource(); src.buffer = b; src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const g = c.createGain(); g.gain.value = 0.035;
    src.connect(hp); hp.connect(g); g.connect(this.audio.sfx || this.audio.master); src.start();
    return { stop: () => { try { g.gain.setTargetAtTime(0, c.currentTime, 0.05); src.stop(c.currentTime + 0.3); } catch { /* stopped */ } } };
  }
  stopAll() { for (const s of this.playing) { try { s.stop(); } catch { /* ended */ } } this.playing.clear(); this.audio?.duck?.(false); }
  // the walkie-talkie's key-up / release: a short burst of band noise
  squelch(t, dur) {
    const a = this.audio; if (!a?.noise || !a.ok) return;
    try { a.noise(t, dur, { type: 'bandpass', f: 2400, q: 0.8, gain: 0.05 }); } catch { /* no noise buffer yet */ }
  }
  static drive() {
    if (Voice._curve) return Voice._curve;
    const n = 1024, k = 2.2, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return (Voice._curve = c);
  }
}
