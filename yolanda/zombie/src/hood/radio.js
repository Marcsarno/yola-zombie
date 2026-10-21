// Chapter 2: the radio card (the user's RADIO SIGNAL picture, 2026-10-20: "when I'm talking on the radio to Yola or she's
// talking to me ... we should see their faces as they're talking"). Two cards under a "02 / RADIO SIGNAL" header with the
// walkie-talkie: Marc above, Yola below, each a face, a name, ONLINE and their line; the one speaking lights up and its
// waveform follows the voice (Voice.analyser), the other dims and keeps their last line. It comes in with the first
// radio line of a call and goes a moment after the last.
import { FACES } from './script.js';

const CSS = `
#hoodRadio{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 58px);transform:translate(-50%,-12px);width:min(92vw,430px);z-index:61;pointer-events:none;opacity:0;transition:opacity .35s,transform .35s;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
#hoodRadio.show{opacity:1;transform:translate(-50%,0)}
#hoodRadio .hd{display:flex;align-items:center;gap:8px;margin:0 2px 6px;color:#8fc6cf;font:800 15px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.22em;text-shadow:0 1px 3px #000}
#hoodRadio .hd img{width:22px;height:30px;object-fit:cover;object-position:50% 40%;border-radius:4px;filter:drop-shadow(0 1px 2px #000)}
#hoodRadio .hd .no{color:#e9eef0;font-size:20px;letter-spacing:.02em}
#hoodRadio .hd .ln{flex:1;height:1px;background:linear-gradient(90deg,#2d5a61,transparent)}
#hoodRadio .card{display:flex;gap:10px;align-items:stretch;margin-bottom:7px;padding:7px;border:1px solid #23444a;border-radius:10px;background:rgba(10,16,21,.9);box-shadow:0 2px 10px rgba(0,0,0,.45);opacity:.55;transition:opacity .25s,border-color .25s,box-shadow .25s}
#hoodRadio .card.on{opacity:1;border-color:#3e8f99;box-shadow:0 0 0 1px rgba(62,143,153,.35),0 2px 14px rgba(0,0,0,.5)}
#hoodRadio .face{width:76px;height:76px;flex:none;border-radius:7px;border:1px solid #2d5a61;background:#0c3a42 center/cover no-repeat}
#hoodRadio .info{flex:1;min-width:0;display:flex;flex-direction:column}
#hoodRadio .row{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #23444a;padding-bottom:3px}
#hoodRadio .nm{color:#dfe5e8;font:800 19px/1.1 system-ui,sans-serif;letter-spacing:.06em}
#hoodRadio .st{color:#79cfa6;font:600 10px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.12em}
#hoodRadio .st::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#34d27f;margin-right:6px;box-shadow:0 0 6px #34d27f;vertical-align:-1px}
#hoodRadio .tx{color:#f1f4f5;font:500 14px/1.3 system-ui,sans-serif;margin-top:4px;min-height:2.6em;text-shadow:0 1px 2px #000}
#hoodRadio canvas{width:100%;height:16px;margin-top:auto}
`;

export class RadioCard {
  constructor(voice) {
    this.voice = voice;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div'); el.id = 'hoodRadio'; el.className = 'hoodOverlay';
    el.innerHTML = '<div class="hd"><img src="assets/ui/radio/walkie.png" alt=""><span class="no">02</span><span>/</span><span>RADIO SIGNAL</span><span class="ln"></span></div>' +
      ['MARC', 'YOLA'].map((w) => `<div class="card" data-who="${w}"><div class="face" style="background-image:url(${FACES[w]})"></div><div class="info"><div class="row"><span class="nm">${w}</span><span class="st">ONLINE</span></div><div class="tx"></div><canvas width="240" height="32"></canvas></div></div>`).join('');
    document.body.appendChild(el);
    this.el = el; this.cards = {};
    for (const c of el.querySelectorAll('.card')) this.cards[c.dataset.who] = { el: c, tx: c.querySelector('.tx'), cv: c.querySelector('canvas') };
    this.who = null; this.hideIn = 0; this.wave = new Uint8Array(128);
    for (const c of Object.values(this.cards)) this.flat(c.cv);
  }
  // a radio line starts: `who` (MARC | YOLA) lights up with `text`
  line(who, text) {
    const c = this.cards[who]; if (!c) return;
    if (!this.el.classList.contains('show')) for (const k of Object.values(this.cards)) k.tx.textContent = '';
    for (const [k, v] of Object.entries(this.cards)) v.el.classList.toggle('on', k === who);
    c.tx.textContent = text; this.who = who; this.hideIn = 0;
    this.el.classList.add('show');
  }
  // the line ended: dim it; the card goes after `linger` s unless another radio line comes
  done(linger = 1.1) { if (this.who) { this.flat(this.cards[this.who].cv); this.cards[this.who].el.classList.remove('on'); } this.who = null; this.hideIn = linger; }
  hide() { this.el.classList.remove('show'); this.who = null; this.hideIn = 0; for (const c of Object.values(this.cards)) { c.el.classList.remove('on'); this.flat(c.cv); } }
  update(dt) {
    if (this.hideIn > 0 && (this.hideIn -= dt) <= 0) this.hide();
    const c = this.who && this.cards[this.who], an = c && this.voice.analyser; if (!c || !an) return;
    an.getByteTimeDomainData(this.wave);
    const g = c.cv.getContext('2d'), W = c.cv.width, H = c.cv.height, n = 48;
    g.clearRect(0, 0, W, H); g.fillStyle = '#4fc7d2';
    for (let i = 0; i < n; i++) {
      let m = 0; for (let j = 0; j < 2; j++) m = Math.max(m, Math.abs(this.wave[(i * 2 + j) % 128] - 128));
      const h = Math.max(2, Math.min(H, (m / 128) * H * 2.6 * (1 - Math.abs(i - n / 2) / (n * 0.75))));
      g.fillRect(i * (W / n), (H - h) / 2, W / n * 0.45, h);
    }
  }
  flat(cv) { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#2b6a72'; for (let i = 0; i < 48; i++) g.fillRect(i * (cv.width / 48), cv.height / 2 - 1, cv.width / 48 * 0.45, 2); }
}
