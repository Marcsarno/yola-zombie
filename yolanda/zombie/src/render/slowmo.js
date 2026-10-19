// Cinematic slow motion (2026-10-18). The user: "a brief cinematic slowdown to help sell the wind-up and reaction. Preserve
// the attack's weight: anticipation, a little suspension near the jump's peak, then a forceful slam" and "a well-timed dodge
// ... slow-motion ... must feel intentional and responsive, not like the game is struggling or freezing".
// Time slows only at chosen moments; the frame rate never does (rendering, interpolation and the camera keep their full
// rate). It is marked on screen: letterbox bars and a cold edge come in with it (combat.html #slowmo, strength --slow), a
// low whoosh going in, a lift coming out (src/sfx/cues.js).
//  - the dodge's cue (2026-10-18 night, FINISHERS_PLAN.md 1, the user: the cue and the slowdown are one moment, "when he's
//    up in the air getting ready to land"): while a special attack's dodge window is open and Yola hasn't moved yet, the
//    world runs at CUE (her window, 0.45 s of game time, is ~0.9 s for a thumb). The guard's old slow-motion at the top of
//    his leap is gone: it came before the moment to dodge.
//  - beats (beat): a perfect dodge (Witch Time, full: Yola at full speed while the world crawls), a finishing blow. One at
//    a time (a new one merges into the one running), never sooner than COOL after the last one ended (a perfect dodge
//    always gets its own); a critical blow ends one at once (end: the snap back is the punch).
import { cue } from '../sfx/cues.js';
import { expUp } from './execution.js';

export const SLOW = { PEAK: 0.3, COOL: 1.2, OUT: 0.3, CUE: 0.5 };

export class SlowMotion {
  constructor(audio) { this.audio = audio; this.k = 1; this.beatS = null; this.cool = 0; this.shown = 0; this.inCue = false; this.full = false; }
  beat(scale, dur, full = false) {
    const B = this.beatS;
    if (B) { B.scale = Math.min(B.scale, scale); B.dur = Math.max(B.dur, B.t + dur * (full ? 1 : 0.5)); B.full ||= full; return; }
    if (this.cool > 0 && !full) return;
    this.beatS = { scale, dur, t: 0, full };
  }
  end() { if (this.beatS) { this.beatS = null; this.cool = SLOW.COOL; } }
  // the time scale for this frame (dt: real seconds); off: an opening scene or Yola dead
  update(dt, sim, off, forced = null) {
    if (forced != null) { this.beatS = null; this.full = false; this.k = forced; return this.show(); } // (the execution sets time itself: render/execution.js)
    let want = 1; this.leapK = false; this.full = false;
    const p = sim.player;
    if (!off && !p.dead) {
      // the cue: a special attack's window open, Yola not yet dodging: in at once with the ping (the moment itself)
      if (p.dodgeTh?.special && p.action.type !== 'dodge') { want = Math.min(want, SLOW.CUE); this.leapK = true; }
      const B = this.beatS;
      if (B) {
        B.t += dt; // (real time: a beat lasts the same however slow it runs)
        // (2026-10-18, the user: the slow down "should be instant"; the speed-up "exponentially not gradually"): in at once; over its
        // last OUT s time creeps, then snaps back
        const r = Math.min(1, Math.max(0, 1 - (B.dur - B.t) / SLOW.OUT));
        want = Math.min(want, B.scale + (1 - B.scale) * expUp(r)); this.full = B.full;
        if (B.t >= B.dur) { this.beatS = null; this.cool = SLOW.COOL; }
      } else if (this.cool > 0) this.cool -= dt;
    } else this.beatS = null;
    if (want < this.k || this.beatS || !this.leapK) this.k = want; else this.k += (want - this.k) * Math.min(1, dt * 10); // (down at once; a beat's own curve back up; the cue eased)
    if (Math.abs(this.k - want) < 0.003) this.k = want;
    return this.show();
  }
  show() {
    const shown = Math.round(Math.max(0, Math.min(1, (1 - this.k) / (1 - SLOW.PEAK))) * 50) / 50;
    if (shown !== this.shown) { this.shown = shown; document.documentElement.style.setProperty('--slow', shown); }
    if (!this.inCue && this.k < 0.45) { this.inCue = true; cue(this.audio, 'slowIn'); }
    else if (this.inCue && this.k > 0.92) { this.inCue = false; cue(this.audio, 'slowOut'); }
    return this.k;
  }
}
