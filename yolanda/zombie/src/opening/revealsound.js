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
  // the user's picks on the Sound Board (src/sfx/banks.js, "Opening reveal"): when they have kept takes for a moment, those
  // play instead of its synthesised version (forceSynth: the board's "Old version" button)
  rec(name, k = 1) {
    const A = this.audio;
    if (this.forceSynth || !A.modern || !A.samples?.ready?.(name)) return false;
    A.play(name, k); return true;
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
    if (!this.ok || this.rec('revealPowerDown')) return; const t = this.now(), A = this.audio;
    A.tone(t, 1.3, 190, { type: 'sine', gain: 0.18, f2: 32, attack: 0.02 });
    A.tone(t, 1.0, 380, { type: 'triangle', gain: 0.05, f2: 60, attack: 0.02 });
    A.noise(t, 0.9, { type: 'lowpass', f: 900, f2: 90, gain: 0.25 });
    A.tone(t + 0.05, 0.4, 70, { type: 'sine', gain: 0.35, f2: 38 });
  }
  flash(k = 1) { // a breaker arcing outside the lift: a sharp crack, a sizzle, a low boom under it
    if (!this.ok || this.rec('revealFlash', k)) return; const t = this.now(), A = this.audio;
    A.noise(t, 0.04, { type: 'highpass', f: 3200, gain: 0.45 * k });
    A.noise(t + 0.01, 0.28, { type: 'bandpass', f: 5200, q: 2, f2: 2600, gain: 0.1 * k, attack: 0.005 });
    A.tone(t, 0.55, 78, { type: 'sine', gain: 0.3 * k, f2: 38 });
    A.tone(t, 0.12, 100, { type: 'sawtooth', gain: 0.06 * k, attack: 0.003 });
  }
  flashBoom() { // the last flash, the one that lands on her: a sub drop under a long crack, a cinematic impact
    if (!this.ok || this.rec('revealFlashBoom')) return; const t = this.now(), A = this.audio;
    A.tone(t, 2.2, 52, { type: 'sine', gain: 0.75, f2: 26, attack: 0.004 });
    A.tone(t, 0.9, 104, { type: 'triangle', gain: 0.28, f2: 40 });
    A.noise(t, 0.06, { type: 'highpass', f: 2600, gain: 0.6 });
    A.noise(t, 1.6, { type: 'lowpass', f: 1800, f2: 70, gain: 0.45, attack: 0.004 });
    A.noise(t + 0.02, 0.5, { type: 'bandpass', f: 4800, q: 2, f2: 1600, gain: 0.12 });
  }
  liftArrive() { // the car coming up the shaft: a motor rising under the doors, a soft clunk as it settles
    if (!this.ok || this.rec('revealLiftArrive')) return; const t = this.now(), A = this.audio;
    A.tone(t, 2.4, 82, { type: 'sawtooth', gain: 0.05, f2: 118, attack: 0.9 });
    A.noise(t, 2.4, { type: 'bandpass', f: 220, q: 1.2, f2: 360, gain: 0.08, attack: 1.0 });
    A.tone(t + 2.3, 0.25, 95, { type: 'triangle', gain: 0.22, f2: 52 });
    A.noise(t + 2.3, 0.18, { type: 'lowpass', f: 700, f2: 150, gain: 0.2 });
  }
  doorsOpen() { // the doors parting: a hydraulic hiss and the rumble of the leaves
    if (!this.ok || this.rec('revealDoorsOpen')) return; const t = this.now(), A = this.audio;
    A.noise(t, 1.3, { type: 'bandpass', f: 900, q: 0.9, f2: 380, gain: 0.12, attack: 0.15 });
    A.tone(t, 1.3, 60, { type: 'sawtooth', gain: 0.04, f2: 48, attack: 0.2 });
    A.noise(t + 1.2, 0.2, { type: 'lowpass', f: 500, f2: 120, gain: 0.18 });
  }
  // (2026-10-19, the launch and the cuts) a camera cut in the dark of the flashes: a deep thump under the flash's crack, so
  // each new angle lands as a beat
  cutHit(k = 1) {
    if (!this.ok || this.rec('revealCutHit', k)) return; const t = this.now(), A = this.audio;
    A.tone(t, 0.7, 44, { type: 'sine', gain: 0.55 * k, f2: 28, attack: 0.003 });
    A.noise(t, 0.25, { type: 'lowpass', f: 600, f2: 120, gain: 0.25 * k });
  }
  // she pushes off: a scuff of rubber on the floor, a short rising rush of air
  launchOff() {
    if (!this.ok || this.rec('revealLaunchOff')) return; const t = this.now(), A = this.audio;
    A.noise(t, 0.12, { type: 'bandpass', f: 1600, q: 1.2, f2: 700, gain: 0.3 });
    A.tone(t, 0.18, 70, { type: 'sine', gain: 0.4, f2: 45 });
    A.noise(t + 0.03, 0.45, { type: 'bandpass', f: 350, q: 0.8, f2: 1800, gain: 0.18, attack: 0.2 });
  }
  // the spin in slow motion: the bat through the air, stretched (a long, low, turning swish)
  spinSwish(secs = 0.9) {
    if (!this.ok || this.rec('revealSpinSwish')) return; const t = this.now(), A = this.audio;
    A.noise(t, secs, { type: 'bandpass', f: 260, q: 1.4, f2: 1500, gain: 0.3, attack: secs * 0.55 });
    A.noise(t + secs * 0.5, secs * 0.5, { type: 'bandpass', f: 1500, q: 1.6, f2: 420, gain: 0.2, attack: 0.02 });
    A.tone(t, secs, 90, { type: 'sine', gain: 0.18, f2: 60, attack: secs * 0.4 });
  }
  // the freeze: time stops (a sucked-in swell cut dead, a sub drop, a high ring that hangs over the card)
  freezeHit() {
    if (!this.ok || this.rec('revealFreezeHit')) return; const t = this.now(), A = this.audio;
    A.noise(t, 0.08, { type: 'highpass', f: 2400, gain: 0.55 });
    A.tone(t, 1.8, 50, { type: 'sine', gain: 0.8, f2: 26, attack: 0.003 });
    A.noise(t, 1.2, { type: 'lowpass', f: 1400, f2: 80, gain: 0.35, attack: 0.004 });
    for (const [hz, g] of [[1318.5, 0.035], [1975.5, 0.025]]) A.tone(t + 0.02, 2.4, hz, { type: 'sine', gain: g, attack: 0.01 });
  }
  heartbeat(k = 1) { if (!this.ok || this.rec('revealHeartbeat', k)) return; const t = this.now(), A = this.audio; A.tone(t, 0.14, 60, { gain: 0.34 * k, f2: 42 }); A.tone(t + 0.22, 0.14, 56, { gain: 0.26 * k, f2: 40 }); }
  slowWhoosh() { // into slow motion: a reversed swell that sucks in, a sub drop
    if (!this.ok || this.rec('revealSlowWhoosh')) return; const t = this.now(), A = this.audio;
    A.noise(t, 0.9, { type: 'bandpass', f: 400, q: 0.7, f2: 3000, gain: 0.2, attack: 0.82 });
    A.tone(t + 0.8, 1.4, 62, { type: 'sine', gain: 0.38, f2: 28 });
    A.noise(t + 0.8, 1.2, { type: 'lowpass', f: 300, f2: 60, gain: 0.25 });
  }
  footstep() { // a slowed footfall that lands like a bass hit: the heel's knock, a deep boom, a long dark tail
    if (!this.ok || this.rec('revealFootstep')) return; const t = this.now(), A = this.audio;
    A.noise(t, 0.09, { type: 'lowpass', f: 1400, f2: 300, gain: 0.32 });
    A.tone(t, 1.3, 48, { type: 'sine', gain: 0.7, f2: 27, attack: 0.006 });
    A.tone(t, 0.45, 96, { type: 'triangle', gain: 0.18, f2: 44 });
    A.noise(t + 0.03, 1.1, { type: 'lowpass', f: 260, f2: 60, gain: 0.22, attack: 0.02 });
  }
  smash() { // the bat through him: the crack of the swing, bone, a wet burst, a huge low hit
    if (!this.ok || this.rec('revealSmash')) return; const t = this.now(), A = this.audio;
    A.noise(t, 0.05, { type: 'highpass', f: 1800, gain: 0.7 });
    for (const dt of [0, 0.018, 0.04, 0.07]) A.noise(t + dt, 0.035, { type: 'bandpass', f: 2600 + Math.random() * 1800, q: 3, gain: 0.35 });
    A.noise(t + 0.01, 0.7, { type: 'bandpass', f: 700, q: 0.8, f2: 180, gain: 0.5 });
    A.tone(t, 1.8, 46, { type: 'sine', gain: 0.85, f2: 24, attack: 0.003 });
    A.tone(t, 0.5, 140, { type: 'triangle', gain: 0.25, f2: 50 });
    A.noise(t + 0.15, 1.6, { type: 'lowpass', f: 900, f2: 90, gain: 0.25 });
  }
  slowDown() { // time stretching: a falling, sucking whoosh
    if (!this.ok || this.rec('revealSlowDown')) return; const t = this.now(), A = this.audio;
    A.noise(t, 1.2, { type: 'bandpass', f: 2400, q: 0.8, f2: 220, gain: 0.22, attack: 0.05 });
    A.tone(t, 1.4, 180, { type: 'sawtooth', gain: 0.04, f2: 40 });
  }
  lensHit() { // the head against the lens: a hollow thunk and glass cracking, a few tiny ringing shards
    if (!this.ok || this.rec('revealLensHit')) return; const t = this.now(), A = this.audio;
    A.tone(t, 0.35, 120, { type: 'sine', gain: 0.6, f2: 55 });
    A.noise(t, 0.12, { type: 'lowpass', f: 900, f2: 200, gain: 0.5 });
    for (const dt of [0, 0.012, 0.03, 0.05, 0.085, 0.12]) A.noise(t + dt, 0.03, { type: 'highpass', f: 3000 + Math.random() * 3000, gain: 0.3 });
    for (const [dt, hz] of [[0.02, 4186], [0.06, 5274], [0.11, 6272]]) A.tone(t + dt, 0.5, hz, { type: 'sine', gain: 0.04 });
  }

  // ---- the walk-out cue: a low D-minor chord swelling, war drums on her steps, a string tremolo climbing to the freeze ----
  cueStart(secs = 4.5) {
    if (!this.ok || this.cue) return;
    const bus = this.audio.musicBus, c = this.ctx;
    this.cue = this.hold((g) => {
      const f = this.lp(420, g, 0.9), nodes = [f];
      for (const [hz, det] of [[36.71, 0], [73.42, 6], [110.0, -5], [146.83, 4], [174.61, -7]]) nodes.push(this.osc('sawtooth', hz, f, det)); // D1 D2 A2 D3 F3
      f.frequency.setValueAtTime(260, c.currentTime); f.frequency.linearRampToValueAtTime(1400, c.currentTime + secs); // the chord opens up as she walks
      return nodes;
    }, bus, 0.16, 1.6);
    this.strings = this.hold((g) => { // a high tremolo on A and D, getting louder and faster to the freeze
      const trem = c.createGain(); trem.gain.value = 0.5; trem.connect(g);
      const lfo = this.osc('sine', 7, null), lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(trem.gain);
      lfo.frequency.linearRampToValueAtTime(13, c.currentTime + secs);
      const f = this.lp(2600, trem), a = this.osc('sawtooth', 440, f, -4), d = this.osc('sawtooth', 587.33, f, 5);
      return [trem, lfo, lg, f, a, d];
    }, bus, 0.0, 0.1);
    this.fade(this.strings, 0.065, secs);
    this.sub = this.hold((g) => [this.osc('sine', 36.71, g)], bus, 0.22, 2.5); // a sub under the chord (felt more than heard)
  }
  drum(k = 1) { // a war drum under each footfall
    if (!this.ok || !this.cue || this.rec('revealDrum', k)) return; const t = this.now(), A = this.audio;
    A.tone(t, 0.9, 58, { type: 'sine', gain: 0.6 * k, f2: 34 });
    A.noise(t, 0.35, { type: 'lowpass', f: 1100, f2: 160, gain: 0.32 * k });
  }
  cueHit() { // the freeze: one huge hit, the cue cut dead behind it
    if (!this.ok) return;
    if (this.rec('revealCueHit')) { this.kill(this.cue, 0.08); this.kill(this.strings, 0.08); this.kill(this.sub, 0.08); this.cue = this.strings = this.sub = null; return; } const t = this.now(), A = this.audio;
    A.tone(t, 1.6, 55, { type: 'sine', gain: 0.6, f2: 30 });
    A.tone(t, 0.7, 110, { type: 'triangle', gain: 0.3, f2: 55 });
    A.noise(t, 0.9, { type: 'lowpass', f: 3200, f2: 140, gain: 0.5 });
    A.noise(t, 0.12, { type: 'highpass', f: 2600, gain: 0.3 });
    for (const hz of [146.83, 220.0, 293.66]) A.tone(t, 2.2, hz, { type: 'sawtooth', gain: 0.03, attack: 0.01 }); // a brass-like D chord ringing out
    this.kill(this.cue, 0.08); this.kill(this.strings, 0.08); this.kill(this.sub, 0.08); this.cue = this.strings = this.sub = null;
  }
  stopAll(secs = 0.3) { for (const h of [...this.live]) this.kill(h, secs); this.bed = this.cue = this.strings = this.sub = null; }
}
