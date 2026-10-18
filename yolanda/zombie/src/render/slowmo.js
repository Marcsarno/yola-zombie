// Cinematic slow motion (2026-10-18). The user: "a brief cinematic slowdown to help sell the wind-up and reaction. Preserve
// the attack's weight: anticipation, a little suspension near the jump's peak, then a forceful slam" and "a well-timed dodge
// ... slow-motion ... must feel intentional and responsive, not like the game is struggling or freezing".
// Time slows only at chosen moments; the frame rate never does (rendering, interpolation and the camera keep their full
// rate). It is marked on screen: letterbox bars and a cold edge come in with it (combat.html #slowmo, strength --slow), a
// low whoosh going in, a lift coming out (src/sfx/cues.js).
//  - the guard's leap: his own clip's frames (render/clipchars.js SLAM: crouch 34-40, takeoff 43, peak 61-64, float to 70,
//    lands 77) map to a curve: full speed through the crouch and the drive up, easing to PEAK over frames 50-57, held to
//    66, back to full speed by 72, so the drop and the smash land at full force. Only when he is near her.
//  - beats (beat): a perfect dodge, a finishing blow. One at a time (a new one merges into the one running), never sooner
//    than COOL after the last one ended; a critical blow ends one at once (end: the snap back is the punch).
import { cue } from '../sfx/cues.js';

export const SLOW = { PEAK: 0.3, COOL: 1.2 };

export class SlowMotion {
  constructor(audio) { this.audio = audio; this.k = 1; this.beatS = null; this.cool = 0; this.shown = 0; this.inCue = false; }
  beat(scale, dur) {
    const B = this.beatS;
    if (B) { B.scale = Math.min(B.scale, scale); B.dur = Math.max(B.dur, B.t + dur * 0.5); return; }
    if (this.cool > 0) return;
    this.beatS = { scale, dur, t: 0 };
  }
  end() { if (this.beatS) { this.beatS = null; this.cool = SLOW.COOL; } }
  static leap(f) { // the guard's leap, by his clip frame
    const ease = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    if (f < 50 || f > 72) return 1;
    return f < 57 ? 1 - (1 - SLOW.PEAK) * ease(50, 57, f) : f <= 66 ? SLOW.PEAK : SLOW.PEAK + (1 - SLOW.PEAK) * ease(66, 72, f);
  }
  // the time scale for this frame (dt: real seconds); off: an opening scene or Yola dead
  update(dt, sim, off) {
    let want = 1;
    const p = sim.player;
    if (!off && !p.dead) {
      for (const z of sim.zombies) {
        if (z.kind !== 'guard' || z.state !== 'windup' || z.attack !== 'slam' || Math.hypot(z.x - p.x, z.z - p.z) > 9) continue;
        want = Math.min(want, SlowMotion.leap(1 + (z.t / Math.max(0.05, z.stateDur)) * 76));
      }
      const B = this.beatS;
      if (B) {
        B.t += dt; // (real time: a beat lasts the same however slow it runs)
        const k = Math.min(1, B.t / 0.07) * Math.min(1, Math.max(0, (B.dur - B.t) / 0.18));
        want = Math.min(want, 1 - (1 - B.scale) * k);
        if (B.t >= B.dur) { this.beatS = null; this.cool = SLOW.COOL; }
      } else if (this.cool > 0) this.cool -= dt;
    } else this.beatS = null;
    this.k += (want - this.k) * Math.min(1, dt * (want < this.k ? 18 : 10));
    if (Math.abs(this.k - want) < 0.003) this.k = want;
    const shown = Math.round(Math.max(0, Math.min(1, (1 - this.k) / (1 - SLOW.PEAK))) * 50) / 50;
    if (shown !== this.shown) { this.shown = shown; document.documentElement.style.setProperty('--slow', shown); }
    if (!this.inCue && this.k < 0.7) { this.inCue = true; cue(this.audio, 'slowIn'); }
    else if (this.inCue && this.k > 0.92) { this.inCue = false; cue(this.audio, 'slowOut'); }
    return this.k;
  }
}
