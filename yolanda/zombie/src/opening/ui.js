// Overlay UI for the opening: title card, subtitles, objective chip, tier labels, assessment cards, flatline ECG,
// red alarm vignette, fade/letterbox, and the small always-available controls (skip, mute, reduced flash).
import { CARD_STATUS, CARD_FEEDBACK } from './content.js';

const CSS = `
#op { position: fixed; inset: 0; z-index: 20; pointer-events: none; font: 500 15px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff; display: none; }
#op.on { display: block; }
#op * { box-sizing: border-box; }
#op .fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity .5s ease; }
#op .bars::before, #op .bars::after { content: ''; position: absolute; left: 0; right: 0; height: 0; background: #000; transition: height .8s ease; z-index: 3; }
#op .bars::before { top: 0; } #op .bars::after { bottom: 0; }
#op.letter .bars::before, #op.letter .bars::after { height: 9vh; }
#op .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(255,0,0,0) 45%, rgba(190,10,10,.55) 100%); opacity: 0; mix-blend-mode: normal; }
#op .dark { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(0,0,0,.0) 30%, rgba(0,0,0,.8) 100%); opacity: 0; }
#op .title { position: absolute; left: 14px; top: calc(14px + env(safe-area-inset-top, 0px)); text-align: left; opacity: 0; transform: translateY(-6px); transition: opacity .9s ease, transform .9s ease; max-width: calc(100% - 200px); }
#op .title.show { opacity: 1; transform: none; }
#op .title h1 { margin: 0; font-size: 19px; line-height: 1.1; letter-spacing: .01em; color: #fff8ea; background: #2f9fa0; padding: 7px 12px 6px; border-radius: 12px 12px 12px 4px; font-weight: 850; box-shadow: 0 3px 0 #23787a, 0 6px 14px rgba(20,60,60,.3); display: inline-block; }
#op .title p { margin: 5px 0 0 4px; color: #1f5558; font-size: 12px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; text-shadow: 0 1px 0 rgba(255,255,255,.6); }
#op .sub { position: absolute; left: 16px; right: 16px; bottom: calc(14vh + env(safe-area-inset-bottom, 0px)); text-align: center; opacity: 0; transition: opacity .35s ease; }
#op .sub.show { opacity: 1; }
#op .sub span { display: inline-block; max-width: 520px; background: rgba(20, 34, 40, .78); padding: 10px 16px; border-radius: 14px; font-size: clamp(15px, 4.2vw, 19px); font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.5); backdrop-filter: blur(3px); }
#op .sub b { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9fe0d8; margin-bottom: 2px; font-weight: 800; }
#op .sub.alarm span { background: rgba(110, 14, 14, .85); }
#op .obj { position: absolute; top: calc(62px + env(safe-area-inset-top, 0px)); left: 14px; right: 14px; opacity: 0; transform: translateY(-8px); transition: all .5s ease; }
#op .obj.show { opacity: 1; transform: none; }
#op .obj div { display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 248, 234, .94); color: #20474a; padding: 8px 14px; border-radius: 12px; font-weight: 750; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
#op .obj div::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: #e07a5f; box-shadow: 0 0 0 4px rgba(224,122,95,.3); }
#op .reward { position: absolute; top: calc(108px + env(safe-area-inset-top, 0px)); left: 14px; opacity: 0; transition: opacity .5s; }
#op .reward.show { opacity: 1; }
#op .reward div { background: rgba(32, 71, 74, .9); padding: 5px 12px; border-radius: 10px; font-weight: 700; font-size: 13px; }
#op .chip { position: absolute; top: calc(64px + env(safe-area-inset-top, 0px)); left: 50%; transform: translate(-50%, -6px); opacity: 0; transition: all .45s ease; }
#op .chip.show { opacity: 1; transform: translate(-50%, 0); }
#op .chip div { background: #e07a5f; color: #fff; font-weight: 850; letter-spacing: .05em; text-transform: uppercase; font-size: 13px; padding: 7px 16px; border-radius: 999px; box-shadow: 0 4px 12px rgba(0,0,0,.25); white-space: nowrap; }
#op .status { position: absolute; top: calc(104px + env(safe-area-inset-top, 0px)); left: 50%; transform: translate(-50%, -6px); opacity: 0; transition: all .45s ease; }
#op .status.show { opacity: 1; transform: translate(-50%, 0); }
#op .status div { background: #2f9fa0; color: #fff; font-weight: 850; letter-spacing: .04em; font-size: 15px; padding: 9px 20px; border-radius: 14px; box-shadow: 0 4px 14px rgba(0,0,0,.3); white-space: nowrap; }
#op .status.alert div { background: #c9483f; }
#op .urgency { position: absolute; top: calc(150px + env(safe-area-inset-top, 0px)); left: 50%; width: min(60vw, 260px); height: 8px; transform: translateX(-50%); border-radius: 6px; background: rgba(0,0,0,.35); opacity: 0; transition: opacity .4s; overflow: hidden; }
#op .urgency.show { opacity: 1; }
#op .urgency i { display: block; height: 100%; width: 100%; background: #ff8a7a; }
#op .prev { position: absolute; left: 50%; bottom: calc(24vh + env(safe-area-inset-bottom, 0px)); transform: translate(-50%, 10px) scale(.96); width: min(70vw, 280px); opacity: 0; transition: opacity .3s ease, transform .3s ease; }
#op .prev.show { opacity: 1; transform: translate(-50%, 0) scale(1); }
#op .prev .sheet { background: #fff8ea; color: #20474a; border-radius: 14px; padding: 12px 14px 14px; box-shadow: 0 10px 28px rgba(0,0,0,.32); }
#op .prev h4 { margin: 0 0 8px; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; display: flex; justify-content: space-between; }
#op .prev h4 em { font-style: normal; color: #e07a5f; }
#op .prev .bar { height: 9px; border-radius: 5px; background: #cfe3df; margin: 7px 0; }
#op .prev .bar.s { width: 62%; } #op .prev .bar.m { width: 82%; }
#op .prev .opt { height: 28px; border-radius: 9px; border: 2px solid #bfe0dc; background: #fff; margin: 6px 0; padding: 4px 10px; font-weight: 700; font-size: 13px; }
#op .tag { position: absolute; transform: translate(-50%, -100%); background: rgba(255, 248, 234, .96); color: #20474a; padding: 6px 12px; border-radius: 12px; font-weight: 800; font-size: 13.5px; white-space: nowrap; box-shadow: 0 4px 14px rgba(0,0,0,.28); opacity: 0; transition: opacity .35s ease, margin-top .35s ease; margin-top: 8px; text-align: center; }
#op .tag small { display: block; font-weight: 700; color: #e07a5f; font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; }
#op .tag.show { opacity: 1; margin-top: 0; }
#op .ctl { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); right: 12px; display: flex; gap: 8px; pointer-events: auto; }
#op .ctl button { height: 38px; min-width: 38px; padding: 0 12px; border-radius: 12px; background: rgba(30,42,48,.78); color: #fff; font-weight: 700; border: 0; font-size: 13px; }
#op .ctl button.off { opacity: .55; }
#op .card { position: absolute; left: 50%; bottom: 8vh; transform: translate(-50%, 14px); width: min(92vw, 460px); background: #fff8ea; color: #20474a; border-radius: 18px; padding: 14px 14px 10px; box-shadow: 0 14px 40px rgba(0,0,0,.4); opacity: 0; pointer-events: none; transition: opacity .35s ease, transform .35s ease; }
#op .card.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
#op .card .st { font-size: 11px; font-weight: 800; letter-spacing: .02em; color: #fff; background: #c9483f; display: inline-block; border-radius: 6px; padding: 2px 8px; margin-bottom: 8px; }
#op .card h3 { margin: 0 0 10px; font-size: 16px; line-height: 1.3; }
#op .card button { display: block; width: 100%; text-align: left; margin: 0 0 7px; padding: 12px 14px; border-radius: 12px; border: 2px solid #bfe0dc; background: #fff; color: #20474a; font: 650 15px/1.3 system-ui, sans-serif; min-height: 46px; }
#op .card button:active, #op .card button.pick { background: #d6f0ec; border-color: #2f9fa0; }
#op .card button.cont { background: #2f9fa0; color: #fff; border-color: #2f9fa0; text-align: center; margin-top: 8px; }
#op .card .note { font-size: 11.5px; color: #6b8a8a; margin-top: 4px; }
#op .card .ok { font-weight: 750; color: #2a8f92; padding: 6px 2px; }
#op canvas.ecg { position: absolute; left: 6%; right: 6%; top: 22%; width: 88%; height: 90px; opacity: 0; transition: opacity .4s; }
#op canvas.ecg.show { opacity: 1; }
#op .gate { position: absolute; inset: 0; background: linear-gradient(#cfeae6, #f5e6c8); display: none; pointer-events: auto; z-index: 9; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; }
#op .gate.show { display: flex; }
#op .gate h1 { margin: 0 0 4px; font-size: clamp(34px, 10vw, 64px); line-height: 1.02; color: #2a8f92; font-weight: 900; text-shadow: 0 3px 0 #fff8ea; }
#op .gate p { color: #20474a; font-weight: 650; margin: 6px 0 22px; }
#op .gate button { font: 800 18px/1 system-ui, sans-serif; padding: 16px 34px; border-radius: 16px; border: 0; background: #e07a5f; color: #fff; box-shadow: 0 5px 0 #b95a42, 0 10px 24px rgba(0,0,0,.25); }
#op .gate .small { font-size: 12px; opacity: .7; margin-top: 18px; }
#op .gate .bar { width: min(60vw, 260px); height: 8px; border-radius: 6px; background: rgba(32,71,74,.2); margin: 14px 0 0; overflow: hidden; }
#op .gate .bar i { display: block; height: 100%; width: 0; background: #2f9fa0; transition: width .3s; }
`;

export class OpeningUI {
  constructor() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = this.el = document.createElement('div'); el.id = 'op';
    el.innerHTML = `
      <div class="fade"></div><div class="bars"></div><div class="vig"></div><div class="dark"></div>
      <canvas class="ecg" width="600" height="120"></canvas>
      <div class="title"><h1></h1><p></p></div>
      <div class="chip"><div></div></div><div class="prev"></div><div class="status"><div></div></div><div class="urgency"><i></i></div><div class="obj"><div></div></div><div class="reward"><div></div></div>
      <div class="sub"><span></span></div>
      <div class="card" role="dialog" aria-live="polite"></div>
      <div class="ctl"><button class="skipB" aria-label="Skip intro">Skip ▸▸</button><button class="flashB" aria-label="Reduced flash" title="Reduced flash">Soft light</button><button class="muteB" aria-label="Mute">♪</button></div>
      <div class="gate"><h1>Yola’s<br>Medical Center</h1><p>Your clinic opens today.</p><button class="go" disabled>Loading…</button><div class="bar"><i></i></div><div class="small"></div></div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.fade = q('.fade'); this.vig = q('.vig'); this.dark = q('.dark'); this.ecg = q('canvas.ecg'); this.titleEl = q('.title');
    this.subEl = q('.sub'); this.objEl = q('.obj'); this.rewardEl = q('.reward'); this.chipEl = q('.chip'); this.prevEl = q('.prev'); this.statusEl = q('.status'); this.urgEl = q('.urgency'); this.cardEl = q('.card'); this.gate = q('.gate');
    this.skipB = q('.skipB'); this.flashB = q('.flashB'); this.muteB = q('.muteB'); this.goB = q('.go'); this.bar = q('.bar i'); this.gateSmall = q('.gate .small');
    this.tags = new Map();
    this.cardResolve = null;
  }
  show(v) { this.el.classList.toggle('on', v); }
  letter(v) { this.el.classList.toggle('letter', v); }
  setFade(o, ms = 500) { this.fade.style.transition = `opacity ${ms}ms ease`; this.fade.style.opacity = o; }
  setFadeColor(c) { this.fade.style.background = c; }
  chip(text) { this.chipEl.querySelector('div').textContent = text || ''; this.chipEl.classList.toggle('show', !!text); }
  // brief tour previews (no clinical content: grey placeholder lines and generic option labels)
  preview(kind) {
    const el = this.prevEl;
    if (!kind) { el.classList.remove('show'); return; }
    el.innerHTML = kind === 'chart'
      ? '<div class="sheet"><h4>Patient chart <em>Preview</em></h4><div class="bar m"></div><div class="bar"></div><div class="bar s"></div><div class="bar m"></div><div class="bar s"></div></div>'
      : '<div class="sheet"><h4>Decision card <em>Preview</em></h4><div class="opt">Option A</div><div class="opt">Option B</div><div class="opt">Option C</div></div>';
    requestAnimationFrame(() => el.classList.add('show'));
  }
  status(text, alert = false) { this.statusEl.querySelector('div').textContent = text || ''; this.statusEl.classList.toggle('show', !!text); this.statusEl.classList.toggle('alert', alert); }
  urgency(p) { this.urgEl.classList.toggle('show', p != null); if (p != null) this.urgEl.querySelector('i').style.width = Math.max(0, Math.min(1, p)) * 100 + '%'; } // cosmetic only
  setVignette(o) { this.vig.style.opacity = o; }
  setDark(o) { this.dark.style.opacity = o; }
  title(h, p) { this.titleEl.querySelector('h1').textContent = h || ''; this.titleEl.querySelector('p').textContent = p || ''; this.titleEl.classList.toggle('show', !!h); }
  subtitle(text, { alarm = false, who = '' } = {}) {
    this.subEl.classList.toggle('alarm', alarm);
    if (!text) { this.subEl.classList.remove('show'); return; }
    const sp = this.subEl.querySelector('span'); sp.textContent = '';
    if (who) { const b = document.createElement('b'); b.textContent = who; sp.appendChild(b); }
    sp.appendChild(document.createTextNode(text)); this.subEl.classList.add('show');
  }
  objective(text) { this.objEl.querySelector('div').textContent = text || ''; this.objEl.classList.toggle('show', !!text); }
  reward(text) { this.rewardEl.querySelector('div').textContent = text || ''; this.rewardEl.classList.toggle('show', !!text); }
  // a label that follows a world point; screen position updated by place()
  tag(id, html, sub) {
    let t = this.tags.get(id);
    if (!t) { t = document.createElement('div'); t.className = 'tag'; this.el.appendChild(t); this.tags.set(id, t); }
    if (html == null) { t.classList.remove('show'); return null; }
    t.innerHTML = (sub ? `<small>${sub}</small>` : '') + html; t.classList.add('show');
    return t;
  }
  placeTag(id, x, y) { const t = this.tags.get(id); if (t) { t.style.left = x + 'px'; t.style.top = y + 'px'; } }
  clearTags() { for (const t of this.tags.values()) t.classList.remove('show'); }

  // Development placeholder card: shows the status label, the options, then explicit test feedback with a Continue
  // button. Resolves with the chosen option id only after Continue is tapped (no timer, no auto-selection).
  // Never marks an answer right or wrong.
  askCard(card, { where = '' } = {}) {
    const el = this.cardEl;
    el.innerHTML = `<span class="st"></span><h3></h3><div class="opts"></div><div class="note">Placeholder content: no clinical meaning. Every option continues the story.</div>`;
    el.querySelector('.st').textContent = CARD_STATUS;
    el.querySelector('h3').textContent = card.prompt;
    const box = el.querySelector('.opts');
    return new Promise((resolve) => {
      let chosen = null;
      this.cardResolve = resolve;
      for (const o of card.options) {
        const b = document.createElement('button'); b.textContent = o.text; b.dataset.id = o.id;
        b.addEventListener('click', () => {
          if (chosen) return; // repeated taps: the first one wins
          chosen = o; b.classList.add('pick');
          box.innerHTML = '';
          const ok = document.createElement('div'); ok.className = 'ok'; ok.textContent = CARD_FEEDBACK(o.text); box.appendChild(ok);
          const cont = document.createElement('button'); cont.className = 'cont'; cont.textContent = 'Continue';
          cont.addEventListener('click', () => { if (!this.cardResolve) return; const r = this.cardResolve; this.cardResolve = null; el.classList.remove('show'); r(chosen.id); });
          box.appendChild(cont);
        });
        box.appendChild(b);
      }
      requestAnimationFrame(() => el.classList.add('show'));
    });
  }
  get cardOpen() { return this.cardEl.classList.contains('show'); }
  closeCard() { this.cardEl.classList.remove('show'); this.cardResolve = null; }

  // flatline: a heart trace that flattens
  drawEcg(t, flat) {
    const c = this.ecg, g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,24,20,.55)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = flat ? '#ff6a5a' : '#59f0a0'; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const u = (x / W * 3 - t * 0.9) % 1, p = ((u % 1) + 1) % 1;
      let y = 0;
      if (!flat) { if (p > 0.1 && p < 0.14) y = -10; else if (p > 0.18 && p < 0.2) y = 9; else if (p > 0.2 && p < 0.235) y = -46; else if (p > 0.235 && p < 0.27) y = 14; else if (p > 0.4 && p < 0.5) y = -8 * Math.sin((p - 0.4) / 0.1 * Math.PI); }
      const yy = H / 2 + y + (flat ? Math.sin(x * 0.04 + t * 3) * 0.6 : 0);
      x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
    }
    g.stroke();
  }
  showEcg(v) { this.ecg.classList.toggle('show', v); }
}
