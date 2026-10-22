// Chapter 2's music (Marc's audio direction, 2026-10-22: four tracks, all in D minor): A tension (the main loop), B grief, C
// action (the finale only), D leaving (once, to the end card). The story sets a cue for the beat the player has reached
// (level.js music()), never a timer, and every stop sets its own as it starts, so a death or a retry from a checkpoint
// comes back to the right one. Each track streams from an <audio> element through the music bus (a whole decoded track would
// hold ~80 MB of samples on a phone; src/music.js's lesson), and that bus ducks under every spoken line (audio.duck).
// A cue: a track at a level (a share of the music bus, everything kept low in the mix), or none. Cross-fades 2.5 s unless
// the cue is a cut. 'drone' is A at a whisper behind a low-pass (Sophie's "don't use your gun", the horde).
// Under it all a wind bed, always (beat 1 is that and a far shot only).
const DIR = 'assets/neighborhood/music/';
const TRACKS = { A: 'ch2_a_tension.mp3', B: 'ch2_b_grief.mp3', C: 'ch2_c_action.mp3', D: 'ch2_d_leaving.mp3' };
export const CUES = {
  none: null,
  A_low: ['A', 0.28], A: ['A', 0.4], A_up: ['A', 0.55], drone: ['A', 0.16, 420],
  B: ['B', 0.5], C: ['C', 0.62], D: ['D', 0.5],
};
const FADE = 2.5;

export class HoodMusic {
  constructor(audio) { this.audio = audio; this.t = {}; this.cue = 'none'; this.wind = null; }
  // the element and its chain (gain, low-pass) into the music bus, made when first wanted
  track(k) {
    const a = this.audio; if (this.t[k] || !a?.ctx) return this.t[k] || null;
    const el = new Audio(DIR + TRACKS[k]); el.loop = k !== 'D'; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.setAttribute('playsinline', '');
    try {
      const src = a.ctx.createMediaElementSource(el), lp = a.ctx.createBiquadFilter(), g = a.ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 20000; g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(a.musicBus || a.master);
      return (this.t[k] = { el, lp, g, on: false });
    } catch (e) { console.warn('hood music', k, e); return null; }
  }
  // iOS lets a media element start later only if it first played inside a tap: each one played silently and paused there
  prime() {
    if (this.primed || !this.audio?.ctx) return;
    this.primed = true;
    for (const k of Object.keys(TRACKS)) { const T = this.track(k); if (!T) continue; T.el.play()?.then?.(() => { if (!T.on) T.el.pause(); }).catch?.(() => { this.primed = false; }); }
    this.windOn();
  }
  // the beat's cue: `fade` s (0: a cut). A track coming in from silence starts where it left off, D from its start
  set(cue, fade = FADE) {
    if (!(cue in CUES)) return;
    const was = this.cue; this.cue = cue;
    if (!this.audio?.ctx) return;   // (no sound yet: the first frame after the first tap plays it: update)
    const C = CUES[cue], ctx = this.audio.ctx, t = ctx.currentTime, f = Math.max(0.03, fade);
    for (const k of Object.keys(TRACKS)) {
      const want = C && C[0] === k ? C[1] : 0, T = want ? this.track(k) : this.t[k]; if (!T) continue;
      const g = T.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(want, t + f);
      const lpF = C && C[0] === k && C[2] ? C[2] : 20000, q = T.lp.frequency; q.cancelScheduledValues(t); q.setValueAtTime(q.value, t); q.exponentialRampToValueAtTime(lpF, t + f);
      if (want) {
        if (!T.on) { T.on = true; if (k === 'D' && was !== 'D') T.el.currentTime = 0; T.el.play()?.catch?.(() => { T.on = false; }); }
      } else if (T.on) { T.on = false; const el = T.el; setTimeout(() => { if (!T.on) el.pause(); }, f * 1000 + 120); }
    }
  }
  // per frame: a cue set before the sound could start is played once it can; a track the browser refused is tried again
  update() {
    if (!this.audio?.ctx) return;
    if (!this.started) { this.started = true; this.windOn(); this.set(this.cue, 1.2); return; }
    const C = CUES[this.cue], T = C && this.t[C[0]];
    if (T && !T.on) { T.on = true; T.el.play()?.catch?.(() => { T.on = false; }); }
  }
  stopAll(fade = 0.6) { this.set('none', fade); }
  // the wind: brown-ish noise through a low band, its level drifting slowly; quiet, on the effects
  windOn() {
    const a = this.audio, c = a?.ctx; if (this.wind || !c) return;
    const n = c.sampleRate * 4, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let v = 0; for (let i = 0; i < n; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.06; d[i] = v; }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = c.createGain(); g.gain.value = 0.0;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.05; lfo.connect(lg); lg.connect(g.gain);
    s.connect(lp); lp.connect(g); g.connect(a.sfx || a.master); s.start(); lfo.start();
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(0.12, c.currentTime + 3);
    this.wind = { s, g };
  }
}
