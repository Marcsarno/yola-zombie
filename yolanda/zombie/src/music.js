// The game's music: the user's supplied track (assets/music/agile_groove.mp3, "Agile Groove"), streamed from an <audio>
// element through the music bus (decoding the whole 3.6 MB file would hold ~80 MB of samples on a phone).
// Two states on the one track, never two tracks fighting:
//  explore: the groove low-passed and quieter (a listenable bed while walking the floor)
//  combat:  the full groove at full level
// The state follows the fight with hysteresis: combat starts when a woken zombie is close or attacking, and only ends
// after a calm spell; a switch is never sooner than COOLDOWN after the last, so enemies stepping in and out of range do
// not make it chatter. Crossfades are ramps on a gain and a filter (no restarts). The opening starts it on the reveal.
const SRC = 'assets/music/agile_groove.mp3';
const COOLDOWN = 3.0, CALM = 4.5; // s
const LEVEL = { explore: 0.42, combat: 1.0 }, CUTOFF = { explore: 900, combat: 20000 };

export class GameMusic {
  constructor(audio) { this.audio = audio; this.state = 'off'; this.since = 99; this.calm = 0; this.el = null; this.failed = false; }
  ensure() {
    const a = this.audio; if (this.node || this.failed || !a.ctx) return !!this.node;
    try {
      const el = new Audio(SRC); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.setAttribute('playsinline', '');
      const src = a.ctx.createMediaElementSource(el), f = a.ctx.createBiquadFilter(), g = a.ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = CUTOFF.explore; f.Q.value = 0.5; g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(a.musicBus);
      el.addEventListener('error', () => { this.failed = true; });
      this.el = el; this.node = { src, f, g };
      return true;
    } catch (e) { this.failed = true; console.warn('music unavailable', e); return false; }
  }
  // kind: 'combat' | 'explore'; fade seconds
  start(kind = 'explore', fade = 0.6) {
    if (!this.ensure()) return;
    if (this.el.paused) { const p = this.el.play(); p?.catch?.(() => { /* no gesture yet: retried on the next start/update */ }); }
    this.set(kind, fade);
  }
  set(kind, fade = 1.6) {
    if (!this.node) return;
    const c = this.audio.ctx, t = c.currentTime, { f, g } = this.node;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(LEVEL[kind], t + fade);
    f.frequency.cancelScheduledValues(t); f.frequency.setValueAtTime(f.frequency.value, t); f.frequency.exponentialRampToValueAtTime(CUTOFF[kind], t + fade * 1.2);
    this.state = kind; this.since = 0;
  }
  stop(fade = 0.8) {
    if (!this.node) return;
    const c = this.audio.ctx, t = c.currentTime, g = this.node.g;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
    const el = this.el; setTimeout(() => { if (this.state === 'off') el.pause(); }, fade * 1000 + 100);
    this.state = 'off';
  }
  // per frame: threat 'combat' (a woken zombie near or attacking) or 'calm'
  update(dt, fighting, paused) {
    if (this.state === 'off' || !this.node) return;
    if (paused) { if (!this.el.paused) this.el.pause(); return; }
    if (this.el.paused && this.audio.ctx?.state === 'running' && !this.audio.muted) this.el.play()?.catch?.(() => {}); // (waits for the first gesture)
    this.since += dt;
    this.calm = fighting ? 0 : this.calm + dt;
    if (this.since < COOLDOWN) return;
    if (this.state === 'explore' && fighting) this.set('combat', 1.0);
    else if (this.state === 'combat' && this.calm > CALM) this.set('explore', 2.4);
  }
}
