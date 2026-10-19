// The game's music: the user's supplied track (assets/music/agile_groove.mp3, "Agile Groove"), streamed from an <audio>
// element through the music bus (decoding the whole 3.6 MB file would hold ~80 MB of samples on a phone).
// ONE steady level once the zombie gameplay begins (the user, 2026-10-17: "keep it consistent"): the full groove, no
// quieter/muffled "explore" mix, no switching by room or by fight. The only changes left are a pause (the game paused,
// Yola down) and the brief duck under a spoken line (audio.duck, so the words are heard).
// The file is fetched while the game loads (preload), so the music is there the moment the reveal hands over.
// start(kind)/set(kind) still take 'combat' | 'explore' from their callers; both mean the same full level now.
const SRC = 'assets/music/agile_groove.mp3';
const LEVEL = 1.0;

export class GameMusic {
  constructor(audio) { this.audio = audio; this.state = 'off'; this.el = null; this.failed = false; }
  // the <audio> element, created and buffering as early as possible (no AudioContext needed yet)
  element() {
    if (this.el || this.failed) return this.el;
    const el = new Audio(SRC); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.setAttribute('playsinline', '');
    el.addEventListener('error', () => { this.failed = true; });
    try { el.load(); } catch { /* the browser fetches it on play instead */ }
    return (this.el = el);
  }
  preload() { this.element(); }
  // the element through the music bus (needs the AudioContext, made on the first gesture)
  ensure() {
    const a = this.audio; if (this.node || this.failed || !a.ctx) return !!this.node;
    try {
      const el = this.element(); if (!el) return false;
      const src = a.ctx.createMediaElementSource(el), g = a.ctx.createGain();
      g.gain.value = 0; src.connect(g); g.connect(a.musicBus);
      this.node = { src, g };
      return true;
    } catch (e) { this.failed = true; console.warn('music unavailable', e); return false; }
  }
  // (2026-10-19, the user: no music when the level starts, on the iPhone) iOS lets a media element start only inside a tap; the
  // track's first play() came ~25 s after the last tap (the reveal's hand-off) and was refused. On the first tap it is played
  // silently (its gain is 0 until start) and paused again: the element is then allowed to play later without a tap
  prime() {
    if (this.primed || this.failed || !this.ensure() || !this.el.paused) return;
    this.primed = true;
    const p = this.el.play(); p?.then?.(() => { if (this.state === 'off') this.el.pause(); }).catch?.(() => { this.primed = false; }); // (refused: the next tap tries again)
  }
  start(kind = 'combat', fade = 0.6) {
    if (!this.ensure()) { if (!this.failed) this.state = 'pending'; return; } // (no AudioContext yet: starts on the first frame after the first tap)
    if (this.el.paused) { const p = this.el.play(); p?.catch?.(() => { /* no gesture yet: retried on the next update */ }); }
    this.set(kind, fade);
  }
  set(kind, fade = 0.6) {
    if (!this.node) return;
    const t = this.audio.ctx.currentTime, g = this.node.g.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(LEVEL, t + fade);
    this.state = kind === 'off' ? 'off' : 'on';
  }
  stop(fade = 0.8) {
    if (!this.node) return;
    const t = this.audio.ctx.currentTime, g = this.node.g.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
    const el = this.el; setTimeout(() => { if (this.state === 'off') el.pause(); }, fade * 1000 + 100);
    this.state = 'off';
  }
  // per frame: keep it playing at its one level (paused while the game is paused or Yola is down)
  update(dt, fighting, paused) {
    if (this.state === 'pending') { if (this.audio.ctx?.state === 'running') this.start('combat'); return; }
    if (this.state === 'off' || !this.node) return;
    if (paused) { if (!this.el.paused) this.el.pause(); return; }
    if (this.el.paused && this.audio.ctx?.state === 'running' && !this.audio.muted) this.el.play()?.catch?.(() => {}); // (waits for the first gesture)
  }
}
