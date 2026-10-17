// Chapter 1's on-screen layer (Floors 7, 6, 5): the radio/phone captions (draft lines: no recordings exist, so they are
// labelled as draft and play as captions while play goes on), the lift's floor picker, the ride between floors, the
// specimen case in Yola's off hand and its location when it is out of sight, the dispatch record, the chapter's end.
// The game state lives in core/level.js; this file only shows it and turns taps into level calls.
import * as THREE from 'three';
import { RADIO, DOCKET } from '../opening/content.js';
import { FLOORS, LIFTS } from '../core/chapter.js';

const CSS = `
#chRadio{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:min(92vw,520px);z-index:30;pointer-events:none;display:flex;flex-direction:column;gap:4px;align-items:center}
#chRadio .ln{background:rgba(12,20,24,.82);color:#eef6f4;font:600 15px/1.3 system-ui,sans-serif;padding:7px 12px;border-radius:10px;border-left:3px solid #7fd6c8;opacity:0;transition:opacity .25s;text-align:left}
#chRadio .ln.show{opacity:1}#chRadio .ln b{color:#7fd6c8;font-weight:800;margin-right:6px}#chRadio .ln.yola{border-left-color:#ffc27a}#chRadio .ln.yola b{color:#ffc27a}
#chRadio .ln i{display:block;font:500 10px system-ui;color:#9fb3b0;letter-spacing:.04em;text-transform:uppercase;margin-top:2px}
#chLift{position:fixed;left:50%;top:calc(132px + env(safe-area-inset-top));transform:translateX(-50%);z-index:31;display:none;gap:8px;flex-wrap:wrap;justify-content:center;max-width:94vw}
#chLift.show{display:flex}#chLift .hd{width:100%;text-align:center;font:700 12px system-ui;color:#dfe9e7;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 1px 2px #000}
#chLift button{font:800 17px system-ui;padding:12px 18px;border-radius:12px;border:2px solid #7fd6c8;background:rgba(14,30,34,.88);color:#eaf7f4;min-width:104px}
#chLift button.end{border-color:#ffc27a;color:#ffe2bd}
#chFade{position:fixed;inset:0;background:#0b1013;opacity:0;pointer-events:none;z-index:40;transition:opacity .45s;display:flex;align-items:center;justify-content:center}
#chFade.on{opacity:1}#chFade .ind{font:800 44px system-ui;color:#ffb347;letter-spacing:.06em;text-shadow:0 0 18px rgba(255,150,40,.55)}
#chCase{position:fixed;z-index:29;pointer-events:none;display:none;font:700 12px system-ui;color:#e8fbff;background:rgba(18,52,64,.85);border:1px solid #8fe8ff;border-radius:9px;padding:4px 8px;white-space:nowrap;transform:translate(-50%,-50%)}
#chCase .ar{display:inline-block;margin-right:5px;transition:transform .1s}
#chDocket{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:35;width:min(88vw,380px);background:#f7f3e8;color:#20262a;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:14px/1.35 system-ui;display:none;overflow:hidden}
#chDocket.show{display:block}#chDocket h3{margin:0;background:#1d6f8a;color:#fff;font:800 15px system-ui;padding:10px 14px;letter-spacing:.05em}
#chDocket table{width:100%;border-collapse:collapse;margin:6px 0}#chDocket td{padding:5px 14px;vertical-align:top}#chDocket td:first-child{color:#5b6a70;font-weight:700;width:36%}
#chDocket p{margin:4px 14px 10px;color:#1d6f8a;font-weight:700}#chDocket button{display:block;margin:0 14px 14px auto;font:800 14px system-ui;padding:8px 16px;border-radius:9px;border:0;background:#1d6f8a;color:#fff}
#chEnd{position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(8,12,14,.82)}
#chEnd.show{display:flex}#chEnd .card{max-width:min(88vw,420px);text-align:center;color:#eef6f4;font:15px/1.45 system-ui}
#chEnd h2{font:800 26px system-ui;margin:0 0 6px;color:#ffc27a}#chEnd button{margin:14px 6px 0;font:800 15px system-ui;padding:11px 18px;border-radius:11px;border:2px solid #7fd6c8;background:#10262b;color:#eaf7f4}
`;

export class ChapterUI {
  constructor(o) {
    Object.assign(this, o); // { scene, camera, arena, yola: () => yolaView, sim: () => sim, applyLevel, audio, hud, fx, onSave, input }
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
    this.radioEl = el('chRadio'); this.liftEl = el('chLift'); this.fadeEl = el('chFade', '<div class="ind"></div>'); this.caseEl = el('chCase', '<span class="ar">◆</span><span class="tx"></span>');
    this.docketEl = el('chDocket'); this.endEl = el('chEnd');
    this.queue = []; this.cur = null; this.liftKey = ''; this.busy = false; this.blink = 0;
  }
  get level() { return this.sim()?.level || null; }

  // ---- events from the simulation (main.js passes the ones it does not handle itself) ----
  onEvent(e) {
    switch (e.type) {
      case 'radio': this.playLines(e.id); break;
      case 'liftTravel': this.ride(e); break;
      case 'case': if (e.state === 'carried') { this.audio.play('reloadDone'); this.hud.toast(e.first ? 'The sealed case — carried in your other hand' : 'Case picked up'); } else if (e.state === 'placed') { this.audio.play('swap'); this.hud.toast('Case set down'); } else if (e.state === 'stored') { this.audio.play('power'); this.hud.toast('Case secured at intake'); } break;
      case 'partitionBreak': this.audio.play('shieldBreak'); this.audio.play('knockdown', 1.2); this.fx?.burst(e.x, 1.2, e.z, 26, 0xd9d2c0, 3.0, 1.0, 0.8); this.fx?.burst(e.x, 0.4, e.z, 14, 0x9a7a52, 2.4, 0.8, 0.7); this.hud.toast('The partition gave way'); break;
      case 'record': this.showDocket(); break;
      case 'sampleMatch': this.audio.play('clear'); break;
      case 'liftFault': this.audio.play('dry'); break;
      case 'chapterComplete': this.showEnd(); break;
      case 'doorOpened': if (e.door === 'x7door') this.hud.toast('The contractor store’s door is open'); break;
    }
  }

  // ---- the draft radio lines: one caption at a time, timed by length; movement and combat go on ----
  playLines(id) {
    const lines = RADIO[id]; if (!lines) return;
    for (const l of lines) this.queue.push(l);
    if (id.startsWith('f7_radio')) this.blink = 0;
  }
  tickLines(dt) {
    if (this.cur) {
      this.cur.t -= dt;
      if (this.cur.t <= 0) { const n = this.cur.node; n.classList.remove('show'); setTimeout(() => n.remove(), 300); this.cur = null; }
      return;
    }
    const l = this.queue.shift(); if (!l) return;
    const n = document.createElement('div'); n.className = 'ln' + (l.who === 'Yola' ? ' yola' : '');
    n.innerHTML = `<b>${l.who}</b>${l.text}<i>${l.who === 'TECH' ? 'radio · ' : ''}draft line — not recorded</i>`;
    this.radioEl.appendChild(n); requestAnimationFrame(() => n.classList.add('show'));
    if (l.who === 'TECH') this.audio.play('swap', 0.6); // a squelch-ish click under a radio line
    this.cur = { node: n, t: 1.1 + l.text.split(/\s+/).length * 0.32 };
  }

  // ---- the lift: a floor picker while Yola stands in the open cab; the ride rebuilds the next floor behind a fade ----
  tickLift() {
    const L = this.level?.lift, show = !!L?.choosing && !this.busy;
    const list = show ? this.level.floorsFrom() : [];
    const key = show ? list.map((f) => f.floor).join(',') : '';
    if (key !== this.liftKey) {
      this.liftKey = key;
      this.liftEl.innerHTML = show ? `<div class="hd">Lift · Floor ${this.level.floor}</div>` + list.map((f) => `<button data-f="${f.floor}" class="${f.end ? 'end' : ''}">${f.end ? '▼ ' : f.floor > this.level.floor ? '▲ ' : '▼ '}${f.label}</button>`).join('') : '';
      for (const b of this.liftEl.querySelectorAll('button')) b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.level?.chooseFloor(+b.dataset.f); this.audio.play('swap'); });
    }
    this.liftEl.classList.toggle('show', show);
  }
  ride(e) {
    if (this.busy) return; this.busy = true;
    const ind = this.fadeEl.querySelector('.ind');
    ind.textContent = `${e.from}`; this.fadeEl.classList.add('on'); this.input?.clearAll?.();
    this.onSave?.(e.save);
    const steps = []; for (let f = e.from; f !== e.to; f += e.to > e.from ? 1 : -1) steps.push(f + (e.to > e.from ? 1 : -1));
    let i = 0;
    const next = () => {
      if (i < steps.length) { ind.textContent = `${e.from > e.to ? '▼' : '▲'} ${steps[i++]}`; setTimeout(next, 650); return; }
      this.audio.play('liftDing');
      this.applyLevel(e.save); // the next floor: a fresh simulation on its world, Yola in the cab, the doors about to open
      setTimeout(() => { this.fadeEl.classList.remove('on'); this.busy = false; }, 120);
    };
    setTimeout(next, 500);
  }

  // ---- the specimen case: in Yola's off hand while carried; a marker when it lies out of sight ----
  tickCase() {
    const lv = this.level, A = this.arena, o = A?.caseObj; if (!lv || !o) { this.caseEl.style.display = 'none'; return; }
    const c = lv.case, Y = this.yola();
    if (c.state === 'carried') {
      const hand = Y?.bones?.LeftHand;
      if (hand && o.parent !== hand) { hand.add(o); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); }
      if (hand) { // hang it from the fist: the handle in the hand, the case below it, upright in the world whatever the arm does
        hand.updateMatrixWorld(true);
        const s = hand.getWorldScale(new THREE.Vector3()).x || 1, hp = hand.getWorldPosition(new THREE.Vector3());
        const yw = this.sim().player.aimYaw, side = 0.09; // (a little out from her hip, on her left: +x when she faces +z)
        const want = new THREE.Vector3(hp.x + Math.cos(yw) * side, hp.y - 0.05 - (A.caseSize?.y || 0.2) * 0.85, hp.z - Math.sin(yw) * side);
        o.position.copy(hand.worldToLocal(want)); o.scale.setScalar(0.85 / s);
        const pq = hand.getWorldQuaternion(new THREE.Quaternion()).invert(), yaw = this.sim().player.aimYaw;
        o.quaternion.copy(pq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI / 2)));
        o.visible = Y.root ? Y.root.visible !== false : true;
      }
      this.caseEl.style.display = 'none';
      return;
    }
    if (o.parent !== A.group) { A.group.add(o); o.scale.setScalar(1); }
    // out of sight: an arrow at the screen's edge (this floor), or a note of where it is (another floor)
    const p = this.sim().player, tx = this.caseEl.querySelector('.tx'), ar = this.caseEl.querySelector('.ar');
    if (!lv.flags.case_picked && c.state === 'home' && lv.floor !== 6) { this.caseEl.style.display = 'none'; return; }
    if (c.floor !== lv.floor) {
      this.caseEl.style.display = 'block'; ar.style.transform = 'none'; ar.textContent = '◆';
      tx.textContent = `Case: Floor ${c.floor}` + (c.state === 'stored' ? ' · intake' : '');
      this.caseEl.style.left = '50%'; this.caseEl.style.top = 'calc(118px + env(safe-area-inset-top))';
      return;
    }
    if (c.state === 'home' && !lv.flags.case_seen) { this.caseEl.style.display = 'none'; return; }
    const v = new THREE.Vector3(c.x, (c.y || 0) + 0.3, c.z).project(this.camera);
    const on = v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88;
    if (on || Math.hypot(p.x - c.x, p.z - c.z) < 2.5) { this.caseEl.style.display = 'none'; return; }
    let dx = v.x, dy = v.y; if (v.z > 1) { dx = -dx; dy = -dy; }
    const k = 1 / Math.max(Math.abs(dx) / 0.86, Math.abs(dy) / 0.8, 1e-3);
    const sx = (dx * k * 0.5 + 0.5) * innerWidth, sy = (-dy * k * 0.5 + 0.5) * innerHeight;
    this.caseEl.style.display = 'block'; this.caseEl.style.left = sx + 'px'; this.caseEl.style.top = sy + 'px';
    ar.textContent = '➤'; ar.style.transform = `rotate(${Math.atan2(-dy, dx)}rad)`; tx.textContent = 'Case';
  }

  showDocket() {
    this.docketEl.innerHTML = `<h3>${DOCKET.title}</h3><table>${DOCKET.rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table><p>${DOCKET.note}</p><button>Close</button>`;
    this.docketEl.classList.add('show');
    const close = () => this.docketEl.classList.remove('show');
    this.docketEl.querySelector('button').addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); close(); });
    clearTimeout(this.docketT); this.docketT = setTimeout(close, 9000);
  }
  showEnd() {
    this.endEl.innerHTML = `<div class="card"><h2>Chapter 1 complete</h2><div>The sealed sample is with Yola: a pre-procedure specimen from the patient upstairs. What it means is still unknown.</div><div style="margin-top:8px;color:#9fd8ce">Next: Floor 4 — then TECH, on three.</div><button data-a="replay">Play the chapter again</button></div>`;
    this.endEl.classList.add('show');
    this.endEl.querySelector('[data-a=replay]').addEventListener('click', () => { this.endEl.classList.remove('show'); this.onReplay?.(); });
  }

  update(dt) {
    const lv = this.level;
    if (!lv) { this.liftEl.classList.remove('show'); this.caseEl.style.display = 'none'; return; }
    this.tickLines(dt); this.tickLift(); this.tickCase();
    // the nurse-station radio blinks until it is answered
    const led = this.arena?.radioLed;
    if (led && lv.floor === 7) { this.blink += dt; led.material.emissiveIntensity = lv.flags.radio_heard ? 0.6 : lv.flags.phone_checked ? (Math.sin(this.blink * 9) > 0 ? 3.2 : 0.2) : 0.6; }
  }
  reset() { this.queue.length = 0; if (this.cur) { this.cur.node.remove(); this.cur = null; } this.radioEl.innerHTML = ''; this.endEl.classList.remove('show'); this.docketEl.classList.remove('show'); this.liftKey = '-'; }
}
export { FLOORS, LIFTS };
