// Combat sounds, synthesised (same lazy-AudioContext pattern as the hospital game's sound class).
// Starts on the first user gesture; master volume + mute.

export class CombatAudio {
  constructor() {
    this.ctx = null; this.master = null; this.noiseBuf = null;
    this.volume = 0.8; this.muted = false;
  }

  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.applyVolume();
      const len = this.ctx.sampleRate * 0.6;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolume() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; }
  setVolume(v) { this.volume = v; this.applyVolume(); }
  setMuted(m) { this.muted = m; this.applyVolume(); }

  get ok() { return this.ctx && this.ctx.state === 'running' && !this.muted; }

  noise(t, dur, { type = 'bandpass', f = 1000, q = 1, f2, gain = 0.3, attack = 0.002 } = {}) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
  }

  tone(t, dur, f, { type = 'sine', gain = 0.2, f2, attack = 0.004 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  play(name, k = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'shot':
        this.noise(t, 0.12, { type: 'lowpass', f: 5200, f2: 600, gain: 0.55 * k });
        this.tone(t, 0.09, 150, { f2: 55, gain: 0.5 * k, type: 'triangle' });
        this.noise(t + 0.02, 0.18, { type: 'bandpass', f: 900, q: 0.7, gain: 0.08 }); // room tail
        break;
      case 'empty': this.tone(t, 0.03, 1800, { gain: 0.12, type: 'square' }); break;
      case 'reload':
        this.noise(t, 0.05, { f: 2400, q: 4, gain: 0.25 }); this.tone(t, 0.04, 700, { gain: 0.08, type: 'square' });
        break;
      case 'reloadDone':
        this.noise(t, 0.05, { f: 3200, q: 5, gain: 0.25 }); this.noise(t + 0.08, 0.06, { f: 1800, q: 3, gain: 0.3 });
        break;
      // whoosh builds through the load and peaks where the bat is fastest (~0.2 s after the press)
      case 'swing': this.noise(t + 0.04, 0.26, { type: 'bandpass', f: 380, f2: 1900, q: 1.6, gain: 0.26, attack: 0.16 }); break;
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
