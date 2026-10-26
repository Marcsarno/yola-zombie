// The weapon wheel (2026-10-25, the user: the swap button "sometimes you tap it and nothing happens ... the Mass Effect where
// you hold it down and then you have like the circle select ... I like the slowdown idea"). On the weapon button:
// - a tap swaps to the next weapon, as it always did;
// - holding it (HOLD s), or sliding the thumb off it, opens a fan of the weapons she carries to the button's left; the world
//   slows to SLOW while it is open (main.js); the thumb points at one, letting go takes it (let go on the button: no change).
// The icons are the button's own pictures. A computer keeps Space / Q / right-click (input.js).
const HOLD = 0.22, DRAG = 24, R = 112, PICK_R = 34;
export const WHEEL_SLOW = 0.15;
const ICON = (w) => (w === 'sledgehammer' ? 'i-sledge' : 'i-' + w);
const NAME = { fists: 'Fists', bat: 'Bat', axe: 'Axe', pistol: 'Pistol', shotgun: 'Shotgun', sledgehammer: 'Sledgehammer', crowbar: 'Crowbar', knife: 'Knife' };
const CSS = `
#wheel { position: absolute; inset: 0; pointer-events: none; display: none; }
#wheel.on { display: block; }
#wheel .dim { position: absolute; inset: 0; background: radial-gradient(circle at var(--cx) var(--cy), rgba(10, 16, 20, .15) 60px, rgba(10, 16, 20, .55) 260px); }
#wheel .it { position: absolute; width: 66px; height: 66px; margin: -33px 0 0 -33px; border-radius: 50%; background: var(--panel);
  box-shadow: 0 3px 10px rgba(0, 0, 0, .4), inset 0 0 0 2px rgba(255, 255, 255, .14); display: grid; place-items: center; transition: transform .08s, box-shadow .08s; }
#wheel .it svg { width: 40px; height: 40px; display: block; position: static; }
#wheel .it.cur { box-shadow: 0 3px 10px rgba(0, 0, 0, .4), inset 0 0 0 2px rgba(127, 224, 200, .7); }
#wheel .it.sel { transform: scale(1.22); background: #f2c018; box-shadow: 0 0 0 3px #fff3, 0 4px 14px rgba(0, 0, 0, .5); }
#wheel .name { position: absolute; transform: translate(-50%, -100%); font-weight: 800; font-size: 18px; color: #fff; text-shadow: 0 2px 6px rgba(0, 0, 0, .85); white-space: nowrap; }
`;

export class WeaponWheel {
  constructor(btn, { getOwned, getCurrent }) {
    this.btn = btn; this.getOwned = getOwned; this.getCurrent = getCurrent;
    this.down = null; this.open = false; this.taps = 0; this.pick = null; this.sel = -1; this.items = [];
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (this.el = document.createElement('div')); el.id = 'wheel'; el.innerHTML = '<div class="dim"></div><div class="name"></div>';
    document.getElementById('hud').appendChild(el); this.nameEl = el.lastChild;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); if (this.down) return;
      try { btn.setPointerCapture(e.pointerId); } catch { /* fine */ }
      this.down = { id: e.pointerId, x: e.clientX, y: e.clientY }; btn.classList.add('pressed');
      clearTimeout(this.timer); this.timer = setTimeout(() => { if (this.down) this.show(); }, HOLD * 1000);
    });
    btn.addEventListener('pointermove', (e) => {
      const d = this.down; if (!d || e.pointerId !== d.id) return;
      e.preventDefault();
      if (!this.open && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG) this.show(); // (slid off it: open at once)
      if (this.open) this.point(e.clientX, e.clientY);
    });
    const up = (e) => {
      const d = this.down; if (!d || e.pointerId !== d.id) return;
      this.down = null; clearTimeout(this.timer); btn.classList.remove('pressed');
      if (!this.open) { if (e.type === 'pointerup') this.taps++; return; } // (a tap: the next weapon)
      if (e.type === 'pointerup' && this.sel >= 0) this.pick = this.items[this.sel].w;
      this.hide();
    };
    for (const k of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(k, up);
  }
  show() {
    const owned = this.getOwned() || []; if (owned.length < 2) return;
    const r = this.btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    this.cx = cx; this.cy = cy; this.open = true; this.sel = -1;
    for (const it of this.items) it.el.remove();
    // a fan to the left of the button, centred on straight left, at most 200 degrees across; kept on the screen
    const n = owned.length, span = Math.min(200, 46 * (n - 1)) * Math.PI / 180, cur = this.getCurrent();
    this.items = owned.map((w, i) => {
      const a = Math.PI + (n > 1 ? (i / (n - 1) - 0.5) * span : 0);
      let x = cx + Math.cos(a) * R, y = cy - Math.sin(a) * R;
      y = Math.min(Math.max(y, 50), innerHeight - 50); x = Math.min(Math.max(x, 40), innerWidth - 40);
      const el = document.createElement('div'); el.className = 'it' + (w === cur ? ' cur' : '');
      const ic = this.btn.querySelector('.' + ICON(w)); if (ic) { const c = ic.cloneNode(true); c.removeAttribute('class'); el.appendChild(c); } else el.textContent = NAME[w] || w;
      el.style.left = x + 'px'; el.style.top = y + 'px'; this.el.appendChild(el);
      return { w, el, x, y };
    });
    this.el.style.setProperty('--cx', cx + 'px'); this.el.style.setProperty('--cy', cy + 'px');
    this.nameEl.textContent = ''; this.el.classList.add('on');
  }
  // the weapon the thumb points at: the item whose direction from the button is nearest the thumb's (none near the button)
  point(x, y) {
    const dx = x - this.cx, dy = y - this.cy, t = Math.atan2(dy, dx); let best = -1, bd = Infinity;
    if (Math.hypot(dx, dy) > PICK_R) {
      for (let i = 0; i < this.items.length; i++) { const it = this.items[i], a = Math.atan2(it.y - this.cy, it.x - this.cx) - t, d = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); if (d < bd) { bd = d; best = i; } }
    }
    if (best === this.sel) return;
    this.sel = best; this.items.forEach((it, i) => it.el.classList.toggle('sel', i === best));
    const it = this.items[best];
    this.nameEl.textContent = it ? NAME[it.w] || it.w : '';
    if (it) { this.nameEl.style.left = it.x + 'px'; this.nameEl.style.top = (it.y - 40) + 'px'; }
  }
  hide() { this.open = false; this.el.classList.remove('on'); }
  // per frame (main.js): the taps and the pick since the last call, each delivered once
  takeTaps() { const n = this.taps; this.taps = 0; return n; }
  takePick() { const w = this.pick; this.pick = null; return w; }
}
