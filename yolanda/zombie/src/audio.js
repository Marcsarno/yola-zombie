import { Samples } from './sfx/samples.js';
import { BANKS } from './sfx/banks.js';

// Combat sounds: recorded banks (src/sfx, SOUND_PLAN.md) where they exist, synthesised for the rest; the pause menu's
// "Effects: classic" plays only the original synthesised set (same lazy-AudioContext pattern as the hospital game's sound class).
// Starts on the first user gesture; master volume + mute, and three buses under it (effects, music, dialogue), each
// with its own level and mute. Effects are capped: a swing through five zombies plays one crack, not five, and no more
// than MAX_VOICES effect sounds ring at once (the newest important ones win).
const MAX_VOICES = 14;

// a 0.1 s silent 8 kHz mono WAV (the iPhone media-session unlock)
const SILENT_WAV = (() => {
  const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  let str = ''; for (const x of b) str += String.fromCharCode(x);
  return 'data:audio/wav;base64,' + btoa(str);
})();

const MINOR = new Set(['groan', 'zombieHurt', 'bump', 'ricochet', 'batMiss', 'windup', 'empty', 'dry']); // dropped first when crowded
// names the game asks for that only the recorded banks know: the synth plays its older equivalent
const SYNTH_ALIAS = { pistolReload: 'reload', pistolReloadDone: 'reloadDone', shotgunReload: 'shellsStart' };
// the room's share of a synthesised sound in the new mix (the rest get 0.14)
const SYNTH_WET = { heal: 0.05, swap: 0.04, wave: 0.03, clear: 0.03, death: 0.05, liftDing: 0.2, power: 0.2, bang: 0.3, groan: 0.3, zombieDeath: 0.2, knockdown: 0.22, shieldBreak: 0.3 };

// a room's answer, generated (no file): a few early reflections, then a diffuse tail that loses its top faster than
// its body (hospital corridors: hard walls, ~1 s)
function makeRoomIR(ctx, secs = 1.05, pre = 0.009) {
  const sr = ctx.sampleRate, n = Math.floor(sr * (secs + pre)), ir = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch); let lo = 0;
    for (let i = Math.floor(pre * sr); i < n; i++) {
      const t = i / sr - pre, w = Math.random() * 2 - 1;
      lo += (w - lo) * 0.08; // one-pole split: the body ...
      const hi = w - lo;     // ... and the air
      d[i] = lo * 2.2 * Math.exp(-6.9 * t / secs) + hi * 0.5 * Math.exp(-6.9 * t / (secs * 0.35));
    }
    for (const [ms, a] of [[11, 0.5], [17, 0.38], [23, 0.33], [31, 0.27], [39, 0.2], [52, 0.16]]) { // early reflections, different per ear
      const i = Math.floor((pre + (ms + (ch ? 2.7 : 0)) / 1000) * sr); if (i < n) d[i] += a * (ch ? -1 : 1) * (0.8 + Math.random() * 0.4);
    }
  }
  return ir;
}

export class CombatAudio {
  constructor() {
    this.ctx = null; this.master = null; this.noiseBuf = null;
    this.volume = 0.8; this.muted = false;
    this.levels = { sfx: 1, music: 0.7, voice: 1 }; this.busMuted = { sfx: false, music: false, voice: false };
    this.recent = new Map(); this.active = []; this.duckK = 1;
    this.modern = true; this.samples = new Samples(); this.spatial = null;
  }
  preload() { this.samples.preload(); } // fetch the recorded banks while the game loads

  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      const c = this.ctx;
      // a brick-wall limiter last: big moments can be loud without clipping the phone's output
      this.limiter = c.createDynamicsCompressor();
      Object.entries({ threshold: -2.5, knee: 0, ratio: 20, attack: 0.002, release: 0.12 }).forEach(([k, v]) => (this.limiter[k].value = v));
      this.master = c.createGain(); this.master.connect(this.limiter); this.limiter.connect(c.destination);
      // the buses: effects (the one-shots), music (the opening's loop, the combat track), dialogue (voices)
      this.sfx = c.createGain(); this.musicBus = c.createGain(); this.voiceBus = c.createGain();
      for (const b of [this.musicBus, this.voiceBus]) b.connect(this.master);
      // effects glue (new mode): a gentle bus compressor so the hits sit together and the tails come up
      this.sfxComp = c.createDynamicsCompressor();
      Object.entries({ threshold: -16, knee: 8, ratio: 3, attack: 0.004, release: 0.18 }).forEach(([k, v]) => (this.sfxComp[k].value = v));
      this.sfxComp.connect(this.master);
      this.sfx.connect(this.modern ? this.sfxComp : this.master);
      // the room: one shared convolution reverb fed by each voice's send, returned into the effects bus
      try {
        this.reverbIn = c.createGain(); const conv = c.createConvolver(); conv.buffer = makeRoomIR(c);
        this.reverbIn.connect(conv); conv.connect(this.sfx);
      } catch { this.reverbIn = null; }
      this.samples.attach(c);
      this.applyVolume();
      const len = this.ctx.sampleRate * 0.6;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // iPhone: Web Audio follows the ring/silent switch unless the page is a media-playback session. Asking for
    // playback and starting a silent looping <audio> element inside the gesture moves it out of the ringer's control.
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    if (!this.keepAlive) {
      try {
        const el = new Audio(SILENT_WAV); el.loop = true; el.setAttribute('playsinline', ''); el.preload = 'auto';
        const p = el.play(); if (p && p.catch) p.catch(() => { this.keepAlive = null; });
        this.keepAlive = el;
      } catch { /* no media element: Web Audio alone */ }
    }
  }

  applyVolume() {
    if (!this.master) return;
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.sfx.gain.value = this.busMuted.sfx ? 0 : this.levels.sfx;
    this.voiceBus.gain.value = this.busMuted.voice ? 0 : this.levels.voice;
    const g = this.musicBus.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(this.musicTarget(), t);
  }
  musicTarget() { return this.busMuted.music ? 0 : this.levels.music * this.duckK; }
  setLevel(bus, v) { this.levels[bus] = v; this.applyVolume(); }
  setBusMuted(bus, m) { this.busMuted[bus] = m; this.applyVolume(); }
  // music dips under speech and comes back after it (a short ramp both ways, never a jump)
  duck(on, secs = 0.25) {
    this.duckK = on ? 0.38 : 1;
    if (!this.musicBus) return;
    const g = this.musicBus.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(this.musicTarget(), t + secs);
  }
  setVolume(v) { this.volume = v; this.applyVolume(); }
  setMuted(m) { this.muted = m; this.applyVolume(); }

  get ok() { return this.ctx && this.ctx.state === 'running' && !this.muted; }

  noise(t, dur, { type = 'bandpass', f = 1000, q = 1, f2, gain = 0.3, attack = 0.002 } = {}) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.out || this.sfx);
    src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
  }

  tone(t, dur, f, { type = 'sine', gain = 0.2, f2, attack = 0.004 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g); g.connect(this.out || this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }

  // the effect-voice cap: the same sound at most twice in 60 ms (a crowd hit is one sound, slightly louder), and at most
  // MAX_VOICES sounds started in the last 0.35 s (minor sounds are dropped first)
  admit(name, k) {
    const t = this.ctx.currentTime, r = this.recent.get(name) || [];
    while (r.length && t - r[0] > 0.06) r.shift();
    if (r.length >= 2) return false;
    r.push(t); this.recent.set(name, r);
    while (this.active.length && t - this.active[0] > 0.35) this.active.shift();
    const minor = MINOR.has(name);
    if (this.active.length >= (minor ? MAX_VOICES - 4 : MAX_VOICES)) return false;
    this.active.push(t);
    return true;
  }

  // pos: {x, z} in the world (panned and faded by distance through this.spatial, which main.js supplies); none = at Yola
  play(name, k = 1, pos = null) {
    if (!this.ok || !this.admit(name, k)) return;
    const t = this.ctx.currentTime;
    if (!this.modern) { this.out = null; this.synth(SYNTH_ALIAS[name] || name, k, t); return; }
    const sp = pos && this.spatial ? this.spatial(pos.x, pos.z) : null;
    if (this.samples.ready(name)) { this.playBank(name, k, t, sp); return; }
    this.out = this.chain(sp, SYNTH_WET[name] ?? 0.14); this.synth(SYNTH_ALIAS[name] || name, k, t); this.out = null;
  }

  // only: a layer index to play alone (the Sound Board); force: a take to play instead of a random one
  playBank(name, k, t, sp, { only = -1, forceLayer = -1, force = null, dry = false } = {}) {
    const s = this.samples, sg = s.soundGain(name);
    BANKS[name].layers.forEach((l, li) => {
      if (only >= 0 && li !== only) return;
      const lg = s.layerGain(name, li); if (!lg) return;
      const at = only >= 0 ? 0 : Array.isArray(l.at) ? l.at[0] + Math.random() * (l.at[1] - l.at[0]) : l.at || 0;
      const lsp = l.side && sp ? { ...sp, pan: Math.max(-0.9, Math.min(0.9, sp.pan + (Math.random() < 0.5 ? -0.18 : 0.18))) } : l.side ? { pan: Math.random() < 0.5 ? -0.18 : 0.18, d: 0 } : sp;
      const wet = dry ? 0 : l.wet ?? (l.synth ? 0 : 0.15), gain = (l.gain ?? 1) * lg * sg;
      if (l.synth) { this.out = this.chain(lsp, wet, gain); this.synth(l.synth, k, t + at); this.out = null; return; }
      const forced = li === forceLayer && force;
      const f = forced || s.pick(name + li, s.active(l)); if (!f) return;
      const jitter = forced ? 1 : Math.pow(10, (Math.random() * 2 - 1) * 1.2 / 20); // +-1.2 dB, take to take
      const semi = forced ? 0 : l.pitch ? l.pitch[0] + Math.random() * (l.pitch[1] - l.pitch[0]) : 0;
      this.playBuffer(f, t + at, this.chain(lsp, wet, gain * s.takeGain(f) * Math.min(1.6, k) * jitter), semi);
    });
  }
  playBuffer(f, t, dest, semi = 0) {
    const b = this.samples.buf.get(f); if (!b) return null;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = Math.pow(2, semi / 12);
    src.connect(dest); src.start(t, this.samples.lead.get(f) || 0);
    return src;
  }

  // one voice's route: level and distance -> air (far sounds lose their top) -> stereo position -> the effects bus,
  // plus a send into the room reverb that grows with distance (far away is mostly room)
  chain(sp, wet = 0, gain = 1) {
    const c = this.ctx, g = c.createGain(), d = sp?.d || 0, pan = sp?.pan || 0;
    g.gain.value = gain / (1 + Math.max(0, d - 2.5) * 0.16);
    let tail = g;
    if (d > 5) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(2400, 20000 * Math.exp(-(d - 5) * 0.08)); tail.connect(lp); tail = lp; }
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; tail.connect(p); tail = p; }
    tail.connect(this.sfx);
    if (wet > 0 && this.reverbIn) { const s = c.createGain(); s.gain.value = wet * (1 + Math.min(1.2, d / 12)); g.connect(s); s.connect(this.reverbIn); }
    return g;
  }

  // the classic (synthesised only) sounds or the new ones: recorded banks, panning, the room, the bus compressor
  setModern(on) {
    this.modern = on;
    if (!this.sfx) return;
    this.sfx.disconnect();
    this.sfx.connect(on ? this.sfxComp : this.master);
  }

  synth(name, k, t) {
    switch (name) {
      case 'subPistol': this.tone(t, 0.13, 125, { f2: 46, gain: 0.32 * k, type: 'sine', attack: 0.001 }); break; // headphone weight under the recorded crack
      case 'subShotgun': this.tone(t, 0.32, 92, { f2: 32, gain: 0.55 * k, type: 'sine', attack: 0.001 }); this.tone(t, 0.16, 180, { f2: 70, gain: 0.18 * k, type: 'triangle', attack: 0.001 }); break;
      case 'shot':
        this.noise(t, 0.12, { type: 'lowpass', f: 5200, f2: 600, gain: 0.55 * k });
        this.tone(t, 0.09, 150, { f2: 55, gain: 0.5 * k, type: 'triangle' });
        this.noise(t + 0.02, 0.18, { type: 'bandpass', f: 900, q: 0.7, gain: 0.08 }); // room tail
        break;
      case 'shotgun': // a deep boom with a long room tail
        this.noise(t, 0.22, { type: 'lowpass', f: 3800, f2: 300, gain: 0.8 });
        this.tone(t, 0.2, 110, { f2: 38, gain: 0.85, type: 'triangle' });
        this.tone(t, 0.12, 60, { f2: 30, gain: 0.6 });
        this.noise(t + 0.03, 0.5, { type: 'bandpass', f: 700, q: 0.6, gain: 0.12, attack: 0.02 });
        break;
      case 'shotgunClose': // point blank: the pellets land as one heavy body thump under the boom
        this.tone(t + 0.01, 0.28, 72, { f2: 34, gain: 0.8, type: 'sine' }); this.noise(t + 0.01, 0.16, { type: 'lowpass', f: 700, f2: 150, gain: 0.55 });
        break;
      case 'heal': // a soft rising chime
        this.tone(t, 0.35, 660, { type: 'triangle', gain: 0.14 }); this.tone(t + 0.1, 0.45, 990, { type: 'triangle', gain: 0.12 }); this.tone(t + 0.2, 0.6, 1320, { type: 'sine', gain: 0.08 });
        break;
      case 'power': // a relay clunk, then the hum coming up
        this.noise(t, 0.12, { type: 'lowpass', f: 900, gain: 0.5 }); this.tone(t, 0.1, 120, { type: 'square', gain: 0.18, f2: 60 });
        this.tone(t + 0.12, 1.2, 50, { type: 'sawtooth', gain: 0.06, f2: 100, attack: 0.4 }); this.tone(t + 0.5, 0.5, 880, { type: 'sine', gain: 0.08 }); this.tone(t + 0.62, 0.6, 1175, { type: 'sine', gain: 0.07 });
        break;
      case 'unbrace': // a steel beam lifted out of its receivers, scraped, set down
        this.noise(t, 0.3, { type: 'bandpass', f: 2400, q: 3, gain: 0.18 }); this.tone(t + 0.02, 0.4, 330, { type: 'triangle', gain: 0.1, f2: 310 });
        this.noise(t + 0.9, 0.6, { type: 'bandpass', f: 1600, q: 2, gain: 0.12, f2: 900, attack: 0.08 }); this.noise(t + 2.2, 0.25, { type: 'lowpass', f: 700, gain: 0.4 }); this.tone(t + 2.2, 0.3, 140, { type: 'triangle', gain: 0.2, f2: 90 });
        break;
      case 'doorOpen': this.noise(t, 0.5, { type: 'bandpass', f: 500, q: 1.2, gain: 0.12, attack: 0.05 }); this.tone(t, 0.4, 180, { type: 'triangle', gain: 0.06, f2: 140 }); break;
      case 'bang': // fists and shoulders against a braced door
        this.noise(t, 0.18, { type: 'lowpass', f: 420, gain: 0.7 * k }); this.tone(t, 0.16, 70, { type: 'triangle', gain: 0.45 * k, f2: 45 });
        this.noise(t + 0.22, 0.15, { type: 'lowpass', f: 380, gain: 0.5 * k }); this.tone(t + 0.22, 0.12, 64, { type: 'triangle', gain: 0.35 * k, f2: 42 });
        this.noise(t + 0.05, 0.12, { type: 'bandpass', f: 2600, q: 4, gain: 0.08 * k }); // the brace rattles
        break;
      case 'liftDing': this.tone(t, 0.9, 1046.5, { type: 'sine', gain: 0.16 }); this.tone(t + 0.28, 1.1, 784, { type: 'sine', gain: 0.14 }); this.noise(t + 0.1, 0.9, { type: 'bandpass', f: 400, q: 0.8, gain: 0.05, attack: 0.2 }); break;
      case 'liftClose': this.noise(t, 0.9, { type: 'bandpass', f: 380, q: 0.9, gain: 0.07, attack: 0.15 }); this.tone(t + 0.85, 0.15, 90, { type: 'triangle', gain: 0.25, f2: 60 }); break;
      case 'dry': this.noise(t, 0.04, { type: 'highpass', f: 3000, gain: 0.25 }); this.tone(t, 0.03, 1800, { type: 'square', gain: 0.05 }); break;
      case 'pump': // rack back, then forward
        this.noise(t, 0.06, { type: 'bandpass', f: 1300, q: 3, gain: 0.3 }); this.tone(t, 0.04, 420, { gain: 0.07, type: 'square' });
        this.noise(t + 0.17, 0.06, { type: 'bandpass', f: 1700, q: 4, gain: 0.35 }); this.tone(t + 0.17, 0.03, 560, { gain: 0.08, type: 'square' });
        break;
      case 'shellsStart': [0, 0.3, 0.6].forEach((d) => this.noise(t + d, 0.05, { type: 'bandpass', f: 2600, q: 5, gain: 0.2 })); break;
      case 'axeHit': // the blade bites: a dull thunk and a wet crunch
        this.noise(t, 0.03, { type: 'bandpass', f: 2200, q: 2, gain: 0.35 * k });
        this.tone(t, 0.2, 120, { f2: 45, gain: 0.8 * k });
        this.noise(t + 0.01, 0.18, { type: 'lowpass', f: 1000, f2: 200, gain: 0.6 * k, attack: 0.008 });
        break;
      case 'fistHit': // a flat meaty thump, no crack
        this.tone(t, 0.14, 120, { f2: 55, gain: 0.7 * k, type: 'sine' });
        this.noise(t, 0.09, { type: 'lowpass', f: 900, f2: 200, gain: 0.5 * k });
        this.noise(t, 0.02, { type: 'bandpass', f: 1800, q: 2, gain: 0.2 * k }); break;
      case 'bump': this.noise(t, 0.12, { type: 'lowpass', f: 500, gain: 0.35 * k }); this.tone(t, 0.1, 85, { f2: 50, gain: 0.25 * k }); break;
      case 'empty': this.tone(t, 0.03, 1800, { gain: 0.12, type: 'square' }); break;
      case 'reload':
        this.noise(t, 0.05, { f: 2400, q: 4, gain: 0.25 }); this.tone(t, 0.04, 700, { gain: 0.08, type: 'square' });
        break;
      case 'reloadDone':
        this.noise(t, 0.05, { f: 3200, q: 5, gain: 0.25 }); this.noise(t + 0.08, 0.06, { f: 1800, q: 3, gain: 0.3 });
        break;
      // whoosh builds through the load and peaks where the bat is fastest (~0.2 s after the press)
      case 'swing': this.noise(t + 0.04, 0.26, { type: 'bandpass', f: 380 / k, f2: 1900 / k, q: 1.6, gain: 0.26 * k, attack: 0.16 }); break;
      case 'batHit':
        this.noise(t, 0.025, { type: 'bandpass', f: 1500, q: 2.5, gain: 0.55 }); // wooden crack
        this.tone(t, 0.22, 95, { f2: 38, gain: 0.85, type: 'sine' }); // body thump
        this.noise(t, 0.12, { type: 'lowpass', f: 1200, f2: 220, gain: 0.65 });
        this.tone(t, 0.06, 330, { gain: 0.14, type: 'triangle', f2: 200 });
        break;
      case 'sever': // wet crunch: snap, then a short splatter
        this.noise(t, 0.03, { type: 'bandpass', f: 2400, q: 3, gain: 0.45 });
        this.noise(t + 0.02, 0.22, { type: 'lowpass', f: 900, f2: 250, gain: 0.5, attack: 0.01 });
        this.tone(t, 0.12, 140, { f2: 60, gain: 0.3 });
        break;
      case 'knockdown': // body slams the floor as the fall lands
        this.noise(t + 0.55, 0.16, { type: 'lowpass', f: 420, gain: 0.55 });
        this.tone(t + 0.55, 0.18, 70, { f2: 40, gain: 0.45 });
        break;
      case 'batMiss': this.noise(t, 0.12, { type: 'highpass', f: 2200, gain: 0.07, attack: 0.02 }); break;
      case 'shieldHit': // a hollow board knock with a rattle of the bed frame
        this.tone(t, 0.16, 190, { type: 'triangle', gain: 0.5 * k, f2: 120 }); this.noise(t, 0.08, { type: 'bandpass', f: 900, q: 1.5, gain: 0.45 * k });
        this.tone(t + 0.01, 0.22, 620, { type: 'square', gain: 0.05 * k, f2: 560 }); this.noise(t + 0.03, 0.18, { type: 'bandpass', f: 3200, q: 4, gain: 0.08 * k });
        break;
      case 'shieldBreak': // the panel splits: a crack, a splintering tail and the pieces landing
        this.noise(t, 0.04, { type: 'highpass', f: 1800, gain: 0.7 }); this.tone(t, 0.25, 140, { type: 'triangle', gain: 0.6, f2: 60 });
        this.noise(t + 0.02, 0.45, { type: 'bandpass', f: 1400, q: 1.2, f2: 600, gain: 0.35, attack: 0.01 });
        [0.35, 0.5, 0.62].forEach((d) => this.noise(t + d, 0.09, { type: 'lowpass', f: 700, gain: 0.3 }));
        break;
      case 'clank':
        this.tone(t, 0.18, 880, { gain: 0.15, type: 'square', f2: 840 }); this.tone(t, 0.25, 1320, { gain: 0.08 });
        this.noise(t, 0.06, { f: 3000, q: 2, gain: 0.25 });
        break;
      case 'bulletHit': this.noise(t, 0.08, { type: 'lowpass', f: 900, f2: 200, gain: 0.45 }); this.tone(t, 0.06, 90, { gain: 0.25 }); break;
      case 'ricochet': this.noise(t, 0.05, { f: 4000, q: 3, gain: 0.18 }); this.tone(t + 0.01, 0.12, 2400, { f2: 1600, gain: 0.04, type: 'sine' }); break;
      case 'groan': {
        const f = 90 + Math.random() * 40;
        this.tone(t, 0.55, f, { type: 'sawtooth', gain: 0.05 * k, f2: f * 0.7, attack: 0.08 });
        this.noise(t, 0.5, { type: 'bandpass', f: 400, q: 3, gain: 0.04 * k, attack: 0.1 });
        break;
      }
      case 'windup': this.tone(t, 0.3, 140, { type: 'sawtooth', gain: 0.07, f2: 220, attack: 0.05 }); break;
      case 'zombieHurt': this.tone(t, 0.18, 180 + Math.random() * 40, { type: 'sawtooth', gain: 0.07, f2: 110 }); break;
      case 'zombieDeath':
        this.tone(t, 0.45, 160, { type: 'sawtooth', gain: 0.08, f2: 60, attack: 0.02 });
        this.noise(t + 0.4, 0.15, { type: 'lowpass', f: 500, gain: 0.35 }); // body hits the floor
        break;
      case 'playerHurt': this.tone(t, 0.12, 320, { type: 'triangle', gain: 0.18, f2: 200 }); this.noise(t, 0.1, { type: 'lowpass', f: 800, gain: 0.3 }); break;
      case 'swap': this.noise(t, 0.06, { f: 1500, q: 2, gain: 0.15 }); this.tone(t + 0.03, 0.05, 520, { gain: 0.06, type: 'triangle' }); break;
      case 'wave': [392, 523].forEach((f, i) => this.tone(t + i * 0.09, 0.2, f, { type: 'triangle', gain: 0.08 })); break;
      case 'clear': [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.08, 0.25, f, { type: 'triangle', gain: 0.08 })); break;
      case 'death': [330, 262, 196].forEach((f, i) => this.tone(t + i * 0.16, 0.3, f, { type: 'triangle', gain: 0.1 })); break;
    }
  }
}
