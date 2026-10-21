// Chapter 2: the lines, heard and read. Each is the user's recording (voice.js) with its words on screen: at the top, the
// speaker's name in their colour; radio lines (Marc and Yola on the walkie-talkie) show on the radio card with the two faces
// instead (radio.js). Lines queue; a line waits up to WAIT s for its sound to decode, then plays (one with no sound stays up
// long enough to read, ~15 characters a second, at least 1.8 s). onLine(id, radio) and onQuiet() tell the hood when a
// line starts and when the queue runs dry (Marc raises the walkie-talkie for a call and lowers it after).
import { LINES, SPEAKER_COLOR } from './script.js';

const WAIT = 1.5, GAP = 0.28;

export class Subtitles {
  constructor(voice = null, radio = null) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 88px);transform:translateX(-50%);max-width:min(88vw,560px);z-index:60;pointer-events:none;' +
      'font:600 15px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;text-align:center;text-shadow:0 1px 3px #000,0 0 8px #000;' +
      'background:rgba(0,0,0,0.38);padding:7px 12px;border-radius:9px;opacity:0;transition:opacity .18s';
    el.className = 'hoodOverlay'; document.body.appendChild(el);
    this.el = el; this.voice = voice; this.radio = radio; this.queue = []; this.cur = null; this.t = 0; this.gap = 0; this.waited = 0;
  }
  say(id) { if (LINES[id]) { this.queue.push(id); this.voice?.load(id); } }
  get busy() { return !!this.cur || this.queue.length > 0; }
  clear() { const was = this.busy; this.queue.length = 0; this.cur = null; this.el.style.opacity = 0; this.radio?.hide(); this.voice?.stopAll(); if (was) this.onQuiet?.(); }
  update(dt) {
    this.radio?.update(dt);
    if (this.cur) {
      this.t -= dt; if (this.t > 0) return;
      if (LINES[this.cur][2] && this.radio) this.radio.done(); else this.el.style.opacity = 0;
      this.cur = null; this.gap = GAP;
      if (!this.queue.length) this.onQuiet?.();
    }
    if ((this.gap -= dt) > 0) return;
    const id = this.queue[0]; if (!id) return;
    if (this.voice?.state(id) === undefined && (this.waited += dt) < WAIT) return; // (still decoding: a moment's wait)
    this.queue.shift(); this.waited = 0;
    const [who, text, radio] = LINES[id];
    const dur = this.voice?.play(id, { radio });
    this.cur = id; this.t = dur ? dur + 0.05 : Math.max(1.8, text.length / 15 + 0.6);
    if (radio && this.radio) this.radio.line(who, text);
    else {
      this.el.innerHTML = `<span style="color:${SPEAKER_COLOR[who] || '#ddd'};letter-spacing:.06em;font-size:12px">${who}</span><br>${text}`;
      this.el.style.opacity = 1;
    }
    this.onLine?.(id, radio);
  }
}
