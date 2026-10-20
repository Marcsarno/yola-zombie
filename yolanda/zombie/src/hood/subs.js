// Chapter 2: subtitles (the user: "We'll just use subtitles for now"). One line at a time at the bottom of the screen above
// the controls: the speaker's name in their colour, a small radio mark on radio lines. Lines queue; each stays long enough to
// read (~15 characters a second, at least 1.8 s).
import { LINES, SPEAKER_COLOR } from './script.js';

export class Subtitles {
  constructor() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 88px);transform:translateX(-50%);max-width:min(88vw,560px);z-index:60;pointer-events:none;' +
      'font:600 15px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;text-align:center;text-shadow:0 1px 3px #000,0 0 8px #000;' +
      'background:rgba(0,0,0,0.38);padding:7px 12px;border-radius:9px;opacity:0;transition:opacity .18s';
    el.className = 'hoodOverlay'; document.body.appendChild(el);
    this.el = el; this.queue = []; this.cur = null; this.t = 0;
  }
  say(id) { if (LINES[id]) this.queue.push(id); }
  get busy() { return !!this.cur || this.queue.length > 0; }
  clear() { this.queue.length = 0; this.cur = null; this.el.style.opacity = 0; }
  update(dt) {
    if (this.cur) { this.t -= dt; if (this.t > 0) return; this.cur = null; this.el.style.opacity = 0; this.gap = 0.25; }
    if ((this.gap = (this.gap || 0) - dt) > 0) return;
    const id = this.queue.shift(); if (!id) return;
    const [who, text, radio] = LINES[id];
    this.cur = id; this.t = Math.max(1.8, text.length / 15 + 0.6);
    this.el.innerHTML = `<span style="color:${SPEAKER_COLOR[who] || '#ddd'};letter-spacing:.06em;font-size:12px">${radio ? '◉ ' : ''}${who}</span><br>${text}`;
    this.el.style.opacity = 1;
  }
}
