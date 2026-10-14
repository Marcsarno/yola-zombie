// Opening audio: an original cheerful 16-bit-style loop, room ambience, UI chimes and a temporary narrator voice.
// Everything is synthesised (no recorded assets exist). The voice is the browser's speech synthesis when it exists;
// otherwise the timed subtitles stand alone. Nothing here can block the sequence: if audio never starts, the
// clock still runs.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// C major, 4 bars of 4 beats; melody as [beat, midi, length] per bar
const BARS = [
  { chord: [48, 52, 55], bass: 36, mel: [[0, 72, .5], [.5, 76, .5], [1, 79, .5], [1.5, 76, .5], [2, 84, 1], [3, 79, 1]] },
  { chord: [45, 48, 52], bass: 33, mel: [[0, 76, .5], [.5, 79, .5], [1, 81, .5], [1.5, 79, .5], [2, 76, 1], [3, 72, 1]] },
  { chord: [41, 45, 48], bass: 29, mel: [[0, 77, .5], [.5, 81, .5], [1, 84, .5], [1.5, 81, .5], [2, 79, 1], [3, 77, 1]] },
  { chord: [43, 47, 50], bass: 31, mel: [[0, 79, .5], [.5, 83, .5], [1, 86, 1], [2, 83, .5], [2.5, 79, .5], [3, 74, 1]] },
];

export class OpeningAudio {
  constructor(audio) {
    this.audio = audio; // CombatAudio (owns the AudioContext, master gain and mute)
    this.musicOn = false; this.nextBeat = 0; this.beatIdx = 0; this.timer = null;
    this.bpm = 118; this.musicGain = null; this.ambGain = null; this.paused = false;
    this.voice = { ok: typeof speechSynthesis !== 'undefined', v: null };
    this.spoken = null;
  }
  get ctx() { return this.audio.ctx; }
  get ready() { return !!(this.audio.ctx && this.audio.master); }

  // call from a user gesture
  unlock() {
    this.audio.init();
    if (this.voice.ok) { try { speechSynthesis.getVoices(); this.pickVoice(); speechSynthesis.onvoiceschanged = () => this.pickVoice(); } catch { this.voice.ok = false; } }
  }
  pickVoice() {
    try {
      const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      this.voice.v = vs.find((v) => /natural|aria|jenny|samantha|google us english|zira/i.test(v.name)) || vs[0] || null;
    } catch { /* no voices */ }
  }
  // Read a line in about `seconds`; never blocks anything (subtitles carry the line regardless)
  say(text, seconds = 8) {
    this.stopVoice();
    if (!this.voice.ok || this.audio.muted) return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const words = text.split(/\s+/).length;
      u.rate = Math.min(1.5, Math.max(0.75, words / (2.6 * seconds * 0.92)));
      u.pitch = 1.12; u.volume = Math.min(1, this.audio.volume + 0.2);
      if (this.voice.v) u.voice = this.voice.v;
      this.spoken = u; speechSynthesis.speak(u);
      return true;
    } catch { return false; }
  }
  stopVoice() { try { if (this.voice.ok) speechSynthesis.cancel(); } catch { /* ignore */ } this.spoken = null; }
  pauseVoice(p) { try { if (this.voice.ok) p ? speechSynthesis.pause() : speechSynthesis.resume(); } catch { /* ignore */ } }

  // ---- music ----
  startMusic(vol = 0.5) {
    if (!this.ready || this.musicOn) return;
    const c = this.ctx;
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.audio.master);
    this.musicGain.gain.linearRampToValueAtTime(vol * 0.5, c.currentTime + 1.5);
    this.musicOn = true; this.nextBeat = c.currentTime + 0.1; this.beatIdx = 0;
    this.timer = setInterval(() => this.schedule(), 90);
    this.startAmbience();
  }
  setMusicLevel(v, secs = 1) { if (this.musicGain) this.musicGain.gain.linearRampToValueAtTime(v * 0.5, this.ctx.currentTime + secs); }
  stopMusic(secs = 0.8) {
    if (!this.musicOn) return;
    this.musicOn = false; clearInterval(this.timer);
    const g = this.musicGain, c = this.ctx;
    if (g) { g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(g.gain.value, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + secs); setTimeout(() => g.disconnect(), secs * 1000 + 100); }
  }
  schedule() {
    if (!this.ready || !this.musicOn || this.paused) return;
    const c = this.ctx, spb = 60 / this.bpm;
    while (this.nextBeat < c.currentTime + 0.35) {
      const bar = BARS[Math.floor(this.beatIdx / 4) % BARS.length], beat = this.beatIdx % 4, t = this.nextBeat;
      // bass on 1 and 3, chord stabs on the off-beats, hat on every half beat, melody by bar
      if (beat === 0 || beat === 2) this.note(t, mtof(bar.bass), spb * 0.9, 'triangle', 0.5);
      if (beat === 1 || beat === 3) for (const m of bar.chord) this.note(t, mtof(m + 12), spb * 0.35, 'square', 0.07);
      this.hat(t, 0.05); this.hat(t + spb / 2, 0.025);
      if (beat === 0 || beat === 2) this.kick(t);
      for (const [b, m, l] of bar.mel) if (Math.floor(b) === beat) this.note(t + (b % 1) * spb, mtof(m), l * spb * 0.85, 'square', 0.13, true);
      this.nextBeat += spb; this.beatIdx++;
    }
  }
  note(t, f, dur, type, gain, vibrato = false) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (vibrato) { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.value = f * 0.004; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + dur + 0.05);
  }
  hat(t, gain) { // short noise tick
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.audio.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500; const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.04);
    src.connect(f); f.connect(g); g.connect(this.musicGain); src.start(t, Math.random() * 0.3); src.stop(t + 0.05);
  }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.14);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.16);
  }

  // ---- room tone: a soft HVAC wash, very quiet ----
  startAmbience() {
    if (this.ambGain || !this.ready) return;
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.audio.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    this.ambGain = c.createGain(); this.ambGain.gain.value = 0; this.ambGain.gain.linearRampToValueAtTime(0.05, c.currentTime + 2);
    src.connect(f); f.connect(this.ambGain); this.ambGain.connect(this.audio.master); src.start();
    this.ambSrc = src;
  }
  stopAmbience() { if (!this.ambGain) return; const c = this.ctx; this.ambGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5); const s = this.ambSrc; setTimeout(() => { try { s.stop(); } catch { /* ignore */ } }, 700); this.ambGain = null; }

  // ---- one-shots ----
  chime(step = 0) { // a small two-note bell; the second tier chimes a little higher
    if (!this.audio.ok) return;
    const c = this.ctx, t = c.currentTime + 0.01, base = [784, 988][step % 2];
    this.audio.tone(t, 0.55, base, { type: 'sine', gain: 0.2 });
    this.audio.tone(t + 0.11, 0.7, base * 1.5, { type: 'triangle', gain: 0.13 });
    this.audio.tone(t, 0.3, base * 3, { type: 'sine', gain: 0.04 });
  }
  confirm() { if (!this.audio.ok) return; const t = this.ctx.currentTime + 0.01; this.audio.tone(t, 0.18, 660, { type: 'triangle', gain: 0.14 }); this.audio.tone(t + 0.1, 0.3, 880, { type: 'triangle', gain: 0.14 }); }

  suspend(v) { // background / foreground
    this.paused = v;
    try { if (this.ctx) v ? this.ctx.suspend() : this.ctx.resume(); } catch { /* ignore */ }
    this.pauseVoice(v);
    if (!v && this.ctx && this.musicOn) this.nextBeat = this.ctx.currentTime + 0.1;
  }
  dispose() { this.stopMusic(0.2); this.stopAmbience(); this.stopVoice(); }
}
