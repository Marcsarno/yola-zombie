// Chapter 2: the radio badge (Marc, 2026-10-22: "make the radio chatter small.. just the image of the person.. no subtitles ...
// so it doesn't block the view of the game"; it was the RADIO SIGNAL card, two faces with their lines). While Marc and Yola
// talk on the walkie-talkie, a small round face in the top-right corner: whoever is speaking, a ring round it that pulses with
// their voice (Voice.analyser) and the walkie-talkie's little icon. No words on screen. It comes in with the first radio line
// of a call and goes a moment after the last.
import { FACES } from './script.js';

const CSS = `
#hoodRadio{position:fixed;right:calc(env(safe-area-inset-right,0px) + 10px);top:calc(env(safe-area-inset-top,0px) + 54px);width:62px;height:62px;z-index:61;pointer-events:none;opacity:0;transform:scale(.85);transition:opacity .3s,transform .3s}
#hoodRadio.show{opacity:1;transform:scale(1)}
#hoodRadio .face{position:absolute;inset:0;border-radius:50%;background:#0c3a42 center/cover no-repeat;border:2px solid #3e8f99;box-shadow:0 2px 8px rgba(0,0,0,.55),0 0 0 var(--ring,0px) rgba(79,199,210,.45);transition:background-image .15s}
#hoodRadio .face.dim{border-color:#2b5a61;filter:saturate(.7) brightness(.8)}
#hoodRadio img{position:absolute;left:-7px;bottom:-4px;width:20px;height:27px;object-fit:cover;object-position:50% 40%;border-radius:4px;filter:drop-shadow(0 1px 2px #000)}
`;

export class RadioCard {
  constructor(voice) {
    this.voice = voice;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div'); el.id = 'hoodRadio'; el.className = 'hoodOverlay';
    el.innerHTML = '<div class="face dim"></div><img src="assets/ui/radio/walkie.png" alt="">';
    document.body.appendChild(el);
    this.el = el; this.face = el.querySelector('.face');
    this.who = null; this.hideIn = 0; this.wave = new Uint8Array(128); this.ring = 0;
  }
  // a radio line starts: `who` (MARC | YOLA) is the face (the words are heard, not shown)
  line(who) {
    if (!FACES[who]) return;
    this.face.style.backgroundImage = `url(${FACES[who]})`; this.face.classList.remove('dim');
    this.who = who; this.hideIn = 0; this.el.classList.add('show');
  }
  // the line ended: the face dims; the badge goes after `linger` s unless another radio line comes
  done(linger = 1.1) { this.face.classList.add('dim'); this.who = null; this.hideIn = linger; }
  hide() { this.el.classList.remove('show'); this.who = null; this.hideIn = 0; this.face.classList.add('dim'); this.face.style.setProperty('--ring', '0px'); }
  update(dt) {
    if (this.hideIn > 0 && (this.hideIn -= dt) <= 0) this.hide();
    const an = this.who && this.voice.analyser;
    let k = 0;
    if (an) { an.getByteTimeDomainData(this.wave); for (let i = 0; i < 128; i += 2) k = Math.max(k, Math.abs(this.wave[i] - 128) / 128); }
    this.ring += (Math.min(1, k * 2.4) - this.ring) * Math.min(1, dt * 14);
    this.face.style.setProperty('--ring', (this.ring * 6).toFixed(1) + 'px');
  }
}
