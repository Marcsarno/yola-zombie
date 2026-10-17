// Overlay UI for the opening: title card, captions (off by default: the user's preference; the CC button turns them on),
// objective chip, tier labels, the three clinical choice cards, the small patient monitor, the readiness checklist, the
// time cards, red alarm vignette, fade/letterbox, and the small always-available controls (skip, captions, soft light,
// sound).
import { CARD_NOTE } from './content.js';

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
#op .card .st { font-size: 11px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; color: #fff; background: #2f9fa0; display: inline-block; border-radius: 6px; padding: 3px 8px; margin-bottom: 6px; }
#op .card .st em { font-style: normal; font-weight: 700; letter-spacing: .02em; text-transform: none; opacity: .9; margin-left: 6px; }
#op .card .ctx { font-size: 12.5px; line-height: 1.35; background: #eef6f3; border-left: 4px solid #2f9fa0; border-radius: 6px; padding: 7px 9px; margin: 0 0 8px; color: #2c5558; }
#op .card button.tried { opacity: .5; text-decoration: line-through; border-color: #e6c9c1; background: #fbf1ee; }
#op .card button.right { background: #d6f0ec; border-color: #2f9fa0; font-weight: 800; }
#op .card .hint { font-weight: 750; color: #b4513f; padding: 2px 2px 8px; }
#op .card .why { background: none; border: 0; color: #2a8f92; font-weight: 800; text-decoration: underline; padding: 4px 2px; min-height: 0; width: auto; display: inline-block; }
#op .card .explain { font-size: 13px; color: #2c5558; padding: 2px 2px 6px; }
#op .card { max-height: 74vh; overflow-y: auto; }
/* short phones (a 320 x 690 portrait was tested): a tighter card that clears the patient monitor at the top */
@media (max-height: 760px) {
  #op .card { bottom: 1.5vh; padding: 10px 11px 7px; border-radius: 16px; }
  #op .card h3 { font-size: 15px; margin-bottom: 7px; }
  #op .card button { padding: 8px 12px; min-height: 40px; font-size: 14px; margin-bottom: 6px; }
  #op .card .ctx { font-size: 11.5px; padding: 5px 8px; margin-bottom: 6px; }
  #op .card .note { font-size: 10.5px; }
}
#op .card h3 { margin: 0 0 10px; font-size: 16px; line-height: 1.3; }
#op .card button { display: block; width: 100%; text-align: left; margin: 0 0 7px; padding: 12px 14px; border-radius: 12px; border: 2px solid #bfe0dc; background: #fff; color: #20474a; font: 650 15px/1.3 system-ui, sans-serif; min-height: 46px; }
#op .card button:active, #op .card button.pick { background: #d6f0ec; border-color: #2f9fa0; }
#op .card button.cont { background: #2f9fa0; color: #fff; border-color: #2f9fa0; text-align: center; margin-top: 8px; }
#op .card .note { font-size: 11.5px; color: #6b8a8a; margin-top: 4px; }
#op .card .ok { font-weight: 750; color: #2a8f92; padding: 6px 2px; }
#op .mon { position: absolute; left: 12px; top: calc(60px + env(safe-area-inset-top, 0px)); width: 176px; background: rgba(10, 24, 22, .86); border-radius: 12px; padding: 7px 9px 8px; opacity: 0; transform: translateY(-6px); transition: opacity .35s, transform .35s; box-shadow: 0 4px 14px rgba(0,0,0,.35); font: 700 12px/1.2 ui-monospace, Menlo, Consolas, monospace; color: #7ef0b0; }
#op .mon.show { opacity: 1; transform: none; }
#op .mon .row { display: flex; justify-content: space-between; align-items: baseline; }
#op .mon .row b { font-size: 17px; }
#op .mon .row small { color: #9fd8c4; font-weight: 600; font-size: 10px; letter-spacing: .06em; }
#op .mon canvas { display: block; width: 100%; height: 40px; margin: 3px 0 2px; }
#op .mon .tof { display: none; margin-top: 4px; padding-top: 5px; border-top: 1px solid rgba(126,240,176,.25); color: #ffd36e; }
#op .mon .tof.show { display: block; }
#op .mon .tof .bars { display: flex; gap: 4px; align-items: flex-end; height: 18px; margin: 3px 0; }
#op .mon .tof .bars i { flex: 1; background: #ffd36e; border-radius: 2px; }
#op .mon.alarm { color: #ff8a7a; box-shadow: 0 0 0 2px rgba(255,90,80,.6), 0 4px 14px rgba(0,0,0,.35); }
#op .mon.alarm .row small { color: #ffb0a6; }
#op .ready { position: absolute; left: 50%; top: 30%; transform: translate(-50%, 8px); width: min(84vw, 330px); background: #fff8ea; color: #20474a; border-radius: 16px; padding: 12px 16px 10px; box-shadow: 0 12px 34px rgba(0,0,0,.35); opacity: 0; transition: opacity .35s, transform .35s; }
#op .ready.show { opacity: 1; transform: translate(-50%, 0); }
#op .ready h4 { margin: 0 0 6px; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: #2a8f92; }
#op .ready li { list-style: none; margin: 4px 0; font-weight: 700; font-size: 14.5px; opacity: .25; transition: opacity .3s; }
#op .ready li.ok { opacity: 1; }
#op .ready li::before { content: '✓'; display: inline-block; width: 22px; color: #2a8f92; font-weight: 900; }
#op .ready ul { margin: 0; padding: 0; }
#op .ready .rdone { margin-top: 6px; font-weight: 850; color: #e07a5f; opacity: 0; transition: opacity .3s; }
#op .ready .rdone.show { opacity: 1; }
#op .timecard { position: absolute; left: 0; right: 0; top: 44%; text-align: center; opacity: 0; transition: opacity .45s; z-index: 2; }
#op .timecard.show { opacity: 1; }
#op .timecard span { display: inline-block; font: 800 clamp(18px, 5.4vw, 26px)/1.1 system-ui, sans-serif; color: #fff8ea; letter-spacing: .02em; padding: 10px 20px; border-radius: 14px; background: rgba(20, 34, 40, .55); text-shadow: 0 2px 6px rgba(0,0,0,.4); }
#op .boss { position: absolute; inset: 0; overflow: hidden; opacity: 0; transition: opacity .25s ease; z-index: 4; }
#op .boss.show { opacity: 1; transition: none; }
#op .boss .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
#op .boss.show .flash { animation: bossFlash .32s ease-out; }
#op .boss.soft .flash { display: none; }
#op .boss .lines { position: absolute; inset: -20%; background: repeating-conic-gradient(from 0deg at 50% 38%, rgba(255,255,255,.0) 0deg 7deg, rgba(255,255,255,.11) 7deg 9deg); opacity: 0; }
#op .boss.show .lines { animation: bossLines 2.8s ease-out forwards; }
#op .boss .ink { position: absolute; left: -12%; right: -12%; top: 57%; height: 21vh; background: #14191c; transform: rotate(-7deg) scaleX(0); transform-origin: 0 50%; box-shadow: 0 -10px 0 #e07a5f, 0 10px 0 #2f9fa0; }
#op .boss.show .ink { animation: bossInk .24s cubic-bezier(.2,.9,.3,1.15) .05s forwards; }
#op .boss .name { position: absolute; left: 5vw; top: 55%; margin: 0; font: italic 900 clamp(84px, 30vw, 230px)/.86 Impact, 'Arial Black', 'Helvetica Neue', system-ui, sans-serif; color: #fff8ea; letter-spacing: .02em;
  -webkit-text-stroke: clamp(3px, .9vw, 6px) #14191c; paint-order: stroke fill; text-shadow: .06em .06em 0 #e07a5f, .1em .1em 0 #14191c; transform: rotate(-7deg) scale(2.8); opacity: 0; transform-origin: 30% 50%; }
#op .boss.show .name { animation: bossSlam .2s cubic-bezier(.2,1.5,.4,1) .12s forwards, bossDrift 2.6s linear .32s forwards; }
#op .boss .tagline { position: absolute; right: 4vw; top: calc(55% + clamp(80px, 27vw, 205px)); transform: rotate(-7deg) translateX(110%); background: #2f9fa0; color: #fff; padding: 8px 16px 7px; border-radius: 4px;
  font: 900 clamp(15px, 4.6vw, 26px)/1 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; box-shadow: 5px 5px 0 #14191c; white-space: nowrap; }
#op .boss.show .tagline { animation: bossTag .28s cubic-bezier(.2,1.2,.4,1) .34s forwards; }
@keyframes bossFlash { 0% { opacity: .95; } 100% { opacity: 0; } }
@keyframes bossLines { 0% { opacity: 0; transform: rotate(0deg) scale(1.15); } 15% { opacity: 1; } 100% { opacity: .55; transform: rotate(6deg) scale(1); } }
@keyframes bossInk { to { transform: rotate(-7deg) scaleX(1); } }
@keyframes bossSlam { 0% { opacity: 0; transform: rotate(-7deg) scale(2.8); } 100% { opacity: 1; transform: rotate(-7deg) scale(1); } }
@keyframes bossDrift { from { translate: 0 0; } to { translate: 3vw 0; } }
@keyframes bossTag { to { transform: rotate(-7deg) translateX(0); } }
#op .gate { position: absolute; inset: 0; background: linear-gradient(#cfeae6, #f5e6c8); display: none; pointer-events: auto; z-index: 9; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; }
#op .gate.show { display: flex; }
#op .gate h1 { margin: 0 0 4px; font-size: clamp(34px, 10vw, 64px); line-height: 1.02; color: #2a8f92; font-weight: 900; text-shadow: 0 3px 0 #fff8ea; }
#op .gate p { color: #20474a; font-weight: 650; margin: 6px 0 22px; }
#op .gate button { font: 800 18px/1 system-ui, sans-serif; padding: 16px 34px; border-radius: 16px; border: 0; background: #e07a5f; color: #fff; box-shadow: 0 5px 0 #b95a42, 0 10px 24px rgba(0,0,0,.25); }
#op .gate .skipGate { margin-top: 14px; background: none; color: #20474a; font: 700 14px system-ui, sans-serif; text-decoration: underline; padding: 8px 14px; border-radius: 10px; box-shadow: none; }
#op .gate .skipGate[hidden] { display: none; }
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
      <div class="mon"><div class="row"><small>HR</small><b class="hr">72</b><small>SpO₂</small><b class="spo2">98</b></div><canvas width="320" height="80"></canvas><div class="row"><small class="st">SINUS</small><small class="bp">BP 118/74</small></div><div class="tof"><div class="row"><small>TOF · ADDUCTOR POLLICIS</small></div><div class="bars"><i></i><i></i><i></i><i></i></div><div class="row"><small>RATIO</small><b class="ratio">—</b></div></div></div>
      <div class="ready"><h4>Ready for extubation?</h4><ul></ul><div class="rdone">Criteria met. Extubated, breathing well.</div></div>
      <div class="timecard"><span></span></div>
      <div class="title"><h1></h1><p></p></div>
      <div class="chip"><div></div></div><div class="prev"></div><div class="status"><div></div></div><div class="urgency"><i></i></div><div class="obj"><div></div></div><div class="reward"><div></div></div>
      <div class="sub"><span></span></div>
      <div class="boss"><div class="lines"></div><div class="ink"></div><h2 class="name"></h2><div class="tagline"></div><div class="flash"></div></div>
      <div class="card" role="dialog" aria-live="polite"></div>
      <div class="ctl"><button class="revealB" aria-label="Skip to reveal" title="Jump to the reveal">Reveal ▸</button><button class="skipB" aria-label="Skip intro">Skip ▸▸</button><button class="ccB off" aria-label="Captions" title="Captions">CC</button><button class="flashB" aria-label="Reduced flash" title="Reduced flash">Soft light</button><button class="muteB" aria-label="Mute">♪</button></div>
      <div class="gate"><h1>Yola’s<br>Medical Center</h1><p>Your clinic opens today.</p><button class="go" disabled>Loading…</button><button class="skipGate" hidden>Skip intro</button><button class="skipGate contGate" hidden>Continue from checkpoint</button><button class="skipGate revealGate">Skip to reveal ▸</button><div class="bar"><i></i></div><div class="small"></div></div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.fade = q('.fade'); this.vig = q('.vig'); this.dark = q('.dark'); this.monEl = q('.mon'); this.ecg = q('.mon canvas'); this.titleEl = q('.title'); this.readyEl = q('.ready'); this.timeEl = q('.timecard');
    this.ccB = q('.ccB');
    try { this.captions = localStorage.getItem('zc.captions') === '1'; } catch { this.captions = false; } // off by default (the user's preference)
    this.ccB.classList.toggle('off', !this.captions);
    this.ccB.addEventListener('click', () => { this.captions = !this.captions; this.ccB.classList.toggle('off', !this.captions); try { localStorage.setItem('zc.captions', this.captions ? '1' : '0'); } catch { /* no storage */ } if (!this.captions) this.subEl.classList.remove('show'); else if (this.lastSub) this.subtitle(this.lastSub.text, this.lastSub.opts); });
    this.subEl = q('.sub'); this.objEl = q('.obj'); this.rewardEl = q('.reward'); this.chipEl = q('.chip'); this.prevEl = q('.prev'); this.statusEl = q('.status'); this.urgEl = q('.urgency'); this.cardEl = q('.card'); this.gate = q('.gate');
    this.skipB = q('.skipB'); this.flashB = q('.flashB'); this.muteB = q('.muteB'); this.goB = q('.go'); this.skipGateB = q('.skipGate:not(.contGate)'); this.contB = q('.contGate'); this.revealGateB = q('.revealGate'); this.revealB = q('.revealB');
    // after the hand-off: one button to watch the reveal again (outside the opening's layer, which is hidden in play)
    this.againB = document.createElement('button'); this.againB.id = 'opAgain'; this.againB.textContent = '↺ Reveal'; this.againB.style.cssText = 'position:fixed;left:12px;top:calc(122px + env(safe-area-inset-top,0px));z-index:25;height:34px;padding:0 12px;border-radius:11px;border:0;background:rgba(30,42,48,.78);color:#fff;font:700 13px system-ui,sans-serif;display:none'; document.body.appendChild(this.againB); this.bar = q('.bar i'); this.gateSmall = q('.gate .small');
    this.bossEl = q('.boss');
    this.tags = new Map();
    this.cardResolve = null;
  }
  show(v) { this.el.classList.toggle('on', v); }
  again(v) { this.againB.style.display = v ? 'block' : 'none'; }
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
  // captions: shown only when the player turned them on (CC); the latest line is remembered so turning them on mid-line shows it
  subtitle(text, { alarm = false, who = '' } = {}) {
    this.lastSub = text ? { text, opts: { alarm, who } } : null;
    this.subEl.classList.toggle('alarm', alarm);
    if (!text || !this.captions) { this.subEl.classList.remove('show'); return; }
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

  // A clinical choice card (content.js CLINICAL_CARDS): the context, the question and three choices. A wrong choice is
  // struck through and its hint shown; the card stays open for another try (nothing is administered, nothing scored).
  // The right choice shows the success line, an optional "Why?" explanation, and Continue. Resolves with the number of
  // tries once Continue is tapped (no timer, no auto-selection).
  askCard(card) {
    const el = this.cardEl;
    el.innerHTML = `<span class="st"></span><div class="ctx" hidden></div><h3></h3><div class="hint" hidden></div><div class="opts"></div><div class="note"></div>`;
    const st = el.querySelector('.st'); st.textContent = card.title; if (card.sub) { const em = document.createElement('em'); em.textContent = card.sub; st.appendChild(em); }
    if (card.context) { const c = el.querySelector('.ctx'); c.hidden = false; c.textContent = card.context; }
    el.querySelector('h3').textContent = card.prompt;
    el.querySelector('.note').textContent = CARD_NOTE;
    const box = el.querySelector('.opts'), hint = el.querySelector('.hint');
    this.cardTries = 0;
    return new Promise((resolve) => {
      let done = false;
      this.cardResolve = resolve;
      const finish = (b) => {
        done = true; b.classList.add('right'); hint.hidden = true;
        for (const x of box.querySelectorAll('button')) if (x !== b) x.remove();
        const ok = document.createElement('div'); ok.className = 'ok'; ok.textContent = '✓ ' + card.success; box.appendChild(ok);
        if (card.explain) {
          const why = document.createElement('button'); why.className = 'why'; why.textContent = 'Why?';
          const ex = document.createElement('div'); ex.className = 'explain'; ex.textContent = card.explain; ex.hidden = true;
          why.addEventListener('click', () => { ex.hidden = !ex.hidden; why.textContent = ex.hidden ? 'Why?' : 'Hide'; });
          box.append(why, ex);
        }
        const cont = document.createElement('button'); cont.className = 'cont'; cont.textContent = 'Continue';
        cont.addEventListener('click', () => { if (!this.cardResolve) return; const r = this.cardResolve; this.cardResolve = null; el.classList.remove('show'); r(this.cardTries); });
        box.appendChild(cont);
      };
      for (const o of card.options) {
        const b = document.createElement('button'); b.textContent = o.text; b.dataset.id = o.id;
        b.addEventListener('click', () => {
          if (done || b.classList.contains('tried')) return; // repeated taps do nothing
          this.cardTries++;
          if (o.correct) { finish(b); return; }
          b.classList.add('tried'); hint.hidden = false; hint.textContent = card.retry;
        });
        box.appendChild(b);
      }
      requestAnimationFrame(() => el.classList.add('show'));
    });
  }
  // test hook: answer the open card (the option id), as a tap would
  pickCard(id) { const b = this.cardEl.querySelector(`.opts button[data-id="${id}"]`); b?.click(); return !!b; }
  continueCard() { const b = this.cardEl.querySelector('.cont'); b?.click(); return !!b; }

  // ---- the small patient monitor (2D): HR, SpO2, a trace, and the quantitative TOF reading when asked ----
  // mode: 'normal' | 'irregular' (the alarm) | 'flat' (asystole on the trace, shown only once the pulse is confirmed absent)
  showMonitor(v) { this.monEl.classList.toggle('show', v); }
  monitor({ mode, hr, spo2, tof, alarm, status, bp } = {}) {
    const m = this.monEl;
    if (bp !== undefined) m.querySelector('.bp').textContent = bp; // (a failing trace never sits beside a healthy, stale pressure)
    if (mode) this.monMode = mode;
    if (hr !== undefined) m.querySelector('.hr').textContent = hr;
    if (spo2 !== undefined) m.querySelector('.spo2').textContent = spo2;
    if (status !== undefined) m.querySelector('.st').textContent = status;
    if (alarm !== undefined) m.classList.toggle('alarm', alarm);
    if (tof !== undefined) {
      const t = m.querySelector('.tof'); t.classList.toggle('show', tof !== null);
      if (tof) { m.querySelector('.ratio').textContent = tof.ratio == null ? 'READY' : tof.ratio.toFixed(2); const bars = m.querySelectorAll('.tof i'); tof.twitches.forEach((h, i) => { bars[i].style.height = Math.round(h * 100) + '%'; }); }
    }
  }
  drawMonitor(t) {
    const c = this.ecg, g = c.getContext('2d'), W = c.width, H = c.height, mode = this.monMode || 'normal';
    g.clearRect(0, 0, W, H);
    g.strokeStyle = mode === 'normal' ? '#59f0a0' : '#ff7a6a'; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const rate = mode === 'irregular' ? 1.7 : 1.15, u = x / W * 2.2 - t * rate * 0.45, p = ((u % 1) + 1) % 1;
      let y = 0;
      if (mode === 'normal') { if (p > 0.1 && p < 0.14) y = -6; else if (p > 0.18 && p < 0.2) y = 6; else if (p > 0.2 && p < 0.235) y = -30; else if (p > 0.235 && p < 0.27) y = 9; else if (p > 0.4 && p < 0.5) y = -6 * Math.sin((p - 0.4) / 0.1 * Math.PI); }
      else if (mode === 'irregular') y = Math.sin(x * 0.09 + t * 9) * 9 + Math.sin(x * 0.23 - t * 5) * 6; // a chaotic, wide rhythm
      const yy = H / 2 + y + (mode === 'flat' ? Math.sin(x * 0.04 + t * 3) * 0.6 : 0);
      x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
    }
    g.stroke();
  }
  // the readiness checklist: items tick one by one (k: how many are ticked); done shows the result line
  readiness(items, k = 0, done = false) {
    const el = this.readyEl;
    if (!items) { el.classList.remove('show'); return; }
    const ul = el.querySelector('ul');
    if (ul.children.length !== items.length) { ul.innerHTML = ''; for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); } }
    [...ul.children].forEach((li, i) => li.classList.toggle('ok', i < k));
    el.querySelector('.rdone').classList.toggle('show', done);
    el.classList.add('show');
  }
  timeCard(text) { const el = this.timeEl; if (text) el.querySelector('span').textContent = text; el.classList.toggle('show', !!text); }
  get cardOpen() { return this.cardEl.classList.contains('show'); }
  closeCard() { this.cardEl.classList.remove('show'); this.cardResolve = null; }

  showEcg(v) { this.showMonitor(v); } // (the old name)
  // the boss-intro card: a freeze frame, a slammed name and a tagline (soft: no white flash, for reduced-flash mode)
  bossCard(name, tagline, soft = false) {
    const b = this.bossEl; b.classList.remove('show'); void b.offsetWidth;
    b.querySelector('.name').textContent = name; b.querySelector('.tagline').textContent = tagline;
    b.classList.toggle('soft', soft); b.classList.add('show');
    const view = document.getElementById('view'); if (view) { view.style.transition = 'filter .15s'; view.style.filter = 'contrast(1.22) saturate(1.45) brightness(1.04)'; }
  }
  bossOff() {
    this.bossEl.classList.remove('show');
    const view = document.getElementById('view'); if (view) { view.style.transition = 'filter .4s'; view.style.filter = ''; }
  }
}
