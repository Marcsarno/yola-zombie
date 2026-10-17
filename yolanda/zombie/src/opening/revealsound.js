// The reveal's sound (2026-10-17): synthesized in the browser, like the rest of the opening's cues (no recordings, nothing
// bought or generated). A dark drone bed under the failing room, the power dying, an electrical crack with each flash, the
// lift's motor and door hiss, then the walk-out: a slow-motion whoosh and a dramatic cue (a low chord swelling, war-drum
// hits on her footsteps, a string tremolo rising) that slams on the freeze frame. Effects go to the effects bus, the cue to
// the music bus (the player's music volume applies).
export class RevealSound {
  constructor(audio) { this.audio = audio; this.live = []; }
  get ok() { return !!(this.audio.ok && this.audio.ctx); }
  get ctx() { return this.audio.ctx; }
  now() { return this.ctx.currentTime + 0.01; }
  // a long tone or noise layer with its own gain (for beds and the cue), kept so it can be faded and stopped
  hold(build, bus, level, attack) {
    const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(level, c.currentTime + attack); g.connect(bus);
    const nodes = build(g); const h = { g, nodes }; this.live.push(h); return h;
  }
  fade(h, level, secs) { if (!h || !this.ok) return; const g = h.g.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(level, t + secs); }
  kill(h, secs = 0.4) {
    if (!h || !this.ok) return; this.fade(h, 0, secs);
    setTimeout(() => { for (const n of h.nodes) try { n.stop?.(); n.disconnect?.(); } catch { /* ignore */ } try { h.g.disconnect(); } catch { /* ignore */ } }, secs * 1000 + 80);
    this.live = this.live.filter((x) => x !== h);
  }
  osc(type, f, dest, detune = 0) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; if (dest) o.connect(dest); o.start(); return o; }
  lp(f, dest, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; }

  // ---- the bed: a low detuned drone and a sub rumble under the failing room and the dark lift ----
  bedStart(level = 0.4) {
    if (!this.ok || this.bed) return;
    this.bed = this.hold((g) => {
      const f = this.lp(150, g), o1 = this.osc('sawtooth', 41.2, f), o2 = this.osc('sawtooth', 41.7, f, 7);
      const src = this.ctx.createBufferSource(); src.buffer = this.audio.noiseBuf; src.loop = true; const nf = this.lp(80, g); src.connect(nf); src.start();
      return [o1, o2, src, f, nf];
    }, this.audio.sfx, 0.09 * level, 2.0);
  }
  bedLevel(level, secs = 1.5) { this.fade(this.bed, 0.09 * level, secs); }
  bedStop(secs = 1.2) { this.kill(this.bed, secs); this.bed = null; }

  // ---- one-shots ----
  powerDown() { // the room's power dying: a falling whine, a thud, the hum draining away
    if (!this.ok) return; const t = this.now(), A = this.audio;
    A.tone(t, 1.3, 190, { type: 'sine', gain: 0.18, f2: 32, attack: 0.02 });
    A.tone(t, 1.0, 380, { type: 'triangle', gain: 0.05, f2: 60, attack: 0.02 });
    A.noise(t, 0.9, { type: 'lowpass', f: 900, f2: 90, gain: 0.25 });
    A.tone(t + 0.05, 0.4, 70, { type: 'sine', gain: 0.35, f2: 38 });
  }
  flash(k = 1) { // a breaker arcing outside the lift: a sharp crack, a sizzle, a low boom under it
    if (!this.ok) return; const t = this.now(), A = this.audio;
    A.noise(t, 0.04, { type: 'highpass', f: 3200, gain: 0.45 * k });
    A.noise(t + 0.01, 0.28, { type: 'bandpass', f: 5200, q: 2, f2: 2600, gain: 0.1 * k, attack: 0.005 });
    A.tone(t, 0.55, 78, { type: 'sine', gain: 0.3 * k, f2: 38 });
    A.tone(t, 0.12, 100, { type: 'sawtooth', gain: 0.06 * k, attack: 0.003 });
  }
  liftArrive() { // the car coming up the shaft: a motor rising under the doors, a soft clunk as it settles
    if (!this.ok) return; const t = this.now(), A = this.audio;
    A.tone(t, 2.4, 82, { type: 'sawtooth', gain: 0.05, f2: 118, attack: 0.9 });
    A.noise(t, 2.4, { type: 'bandpass', f: 220, q: 1.2, f2: 360, gain: 0.08, attack: 1.0 });
    A.tone(t + 2.3, 0.25, 95, { type: 'triangle', gain: 0.22, f2: 52 });
    A.noise(t + 2.3, 0.18, { type: 'lowpass', f: 700, f2: 150, gain: 0.2 });
  }
  doorsOpen() { // the doors parting: a hydraulic hiss and the rumble of the leaves
    if (!this.ok) return; const t = this.now(), A = this.audio;
    A.noise(t, 1.3, { type: 'bandpass', f: 900, q: 0.9, f2: 380, gain: 0.12, attack: 0.15 });
    A.tone(t, 1.3, 60, { type: 'sawtooth', gain: 0.04, f2: 48, attack: 0.2 });
    A.noise(t + 1.2, 0.2, { type: 'lowpass', f: 500, f2: 120, gain: 0.18 });
  }
  heartbeat(k = 1) { if (!this.ok) return; const t = this.now(), A = this.audio; A.tone(t, 0.14, 60, { gain: 0.34 * k, f2: 42 }); A.tone(t + 0.22, 0.14, 56, { gain: 0.26 * k, f2: 40 }); }
  slowWhoosh() { // into slow motion: a reversed swell that sucks in, a sub drop
    if (!this.ok) return; const t = this.now(), A = this.audio;
    A.noise(t, 0.9, { type: 'bandpass', f: 400, q: 0.7, f2: 3000, gain: 0.2, attack: 0.82 });
    A.tone(t + 0.8, 1.4, 62, { type: 'sine', gain: 0.38, f2: 28 });
    A.noise(t + 0.8, 1.2, { type: 'lowpass', f: 300, f2: 60, gain: 0.25 });
  }
  footstep() { // a heavy, slowed footfall with a short room tail
    if (!this.ok) return; const t = this.now(), A = this.audio;
    A.tone(t, 0.3, 66, { type: 'sine', gain: 0.32, f2: 40 });
    A.noise(t, 0.16, { type: 'lowpass', f: 520, f2: 140, gain: 0.3 });
    A.noise(t + 0.14, 0.35, { type: 'lowpass', f: 380, f2: 120, gain: 0.08 });
  }

  // ---- the walk-out cue: a low D-minor chord swelling, war drums on her steps, a string tremolo climbing to the freeze ----
  cueStart(secs = 4.5) {
    if (!this.ok || this.cue) return;
    const bus = this.audio.musicBus, c = this.ctx;
    this.cue = this.hold((g) => {
      const f = this.lp(420, g, 0.9), nodes = [f];
      for (const [hz, det] of [[36.71, 0], [73.42, 6], [110.0, -5], [146.83, 4], [174.61, -7]]) nodes.push(this.osc('sawtooth', hz, f, det)); // D1 D2 A2 D3 F3
      f.frequency.setValueAtTime(260, c.currentTime); f.frequency.linearRampToValueAtTime(900, c.currentTime + secs); // the chord opens up as she walks
      return nodes;
    }, bus, 0.07, 1.6);
    this.strings = this.hold((g) => { // a high tremolo on A and D, getting louder and faster to the freeze
      const trem = c.createGain(); trem.gain.value = 0.5; trem.connect(g);
      const lfo = this.osc('sine', 7, null), lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(trem.gain);
      lfo.frequency.linearRampToValueAtTime(13, c.currentTime + secs);
      const f = this.lp(2600, trem), a = this.osc('sawtooth', 440, f, -4), d = this.osc('sawtooth', 587.33, f, 5);
      return [trem, lfo, lg, f, a, d];
    }, bus, 0.0, 0.1);
    this.fade(this.strings, 0.035, secs);
  }
  drum(k = 1) { // a war drum under each footfall
    if (!this.ok || !this.cue) return; const t = this.now(), A = this.audio;
    A.tone(t, 0.7, 58, { type: 'sine', gain: 0.42 * k, f2: 36 });
    A.noise(t, 0.3, { type: 'lowpass', f: 900, f2: 160, gain: 0.22 * k });
  }
  cueHit() { // the freeze: one huge hit, the cue cut dead behind it
    if (!this.ok) return; const t = this.now(), A = this.audio;
    A.tone(t, 1.6, 55, { type: 'sine', gain: 0.6, f2: 30 });
    A.tone(t, 0.7, 110, { type: 'triangle', gain: 0.3, f2: 55 });
    A.noise(t, 0.9, { type: 'lowpass', f: 3200, f2: 140, gain: 0.5 });
    A.noise(t, 0.12, { type: 'highpass', f: 2600, gain: 0.3 });
    for (const hz of [146.83, 220.0, 293.66]) A.tone(t, 2.2, hz, { type: 'sawtooth', gain: 0.03, attack: 0.01 }); // a brass-like D chord ringing out
    this.kill(this.cue, 0.08); this.kill(this.strings, 0.08); this.cue = this.strings = null;
  }
  stopAll(secs = 0.3) { for (const h of [...this.live]) this.kill(h, secs); this.bed = this.cue = this.strings = null; }
}
