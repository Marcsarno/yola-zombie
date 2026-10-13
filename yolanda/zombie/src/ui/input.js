// Two-thumb input. Each stick is owned by exactly one pointer id from touch-down to release;
// fingers crossing the screen centre never swap sticks. Everything clears on cancel / blur / hide / pause.
// Desktop fallback: WASD + mouse (hold left button to attack), Space / Q / right-click to swap.

const STICK_R = 58; // px of travel for full deflection

export class Input {
  constructor(root, { swapButton, getPlayerScreen }) {
    this.root = root;
    this.swapButton = swapButton;
    this.getPlayerScreen = getPlayerScreen;
    this.sticks = {
      move: { id: null, ox: 0, oy: 0, x: 0, y: 0, el: null },
      aim: { id: null, ox: 0, oy: 0, x: 0, y: 0, el: null },
    };
    this.swapPresses = 0;
    this.keys = new Set();
    this.mouse = { active: false, x: 0, y: 0, down: false };
    this.enabled = true;
    this.lastTouch = 0;
    this.makeStickVisuals();
    this.bind();
  }

  makeStickVisuals() {
    for (const k of ['move', 'aim']) {
      const base = document.createElement('div');
      base.className = 'stick ' + k;
      base.innerHTML = '<div class="knob"></div>';
      this.root.appendChild(base);
      this.sticks[k].el = base;
      this.sticks[k].knob = base.firstChild;
    }
  }

  bind() {
    const r = this.root;
    r.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    r.addEventListener('pointermove', (e) => this.moveEv(e), { passive: false });
    r.addEventListener('pointerup', (e) => this.up(e));
    r.addEventListener('pointercancel', (e) => this.up(e));
    r.addEventListener('lostpointercapture', (e) => this.up(e));
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    this.swapButton.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.enabled) this.swapPresses++;
      this.swapButton.classList.add('pressed');
      setTimeout(() => this.swapButton.classList.remove('pressed'), 120);
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if ((e.code === 'Space' || e.code === 'KeyQ') && this.enabled) { this.swapPresses++; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearAll(); });
    window.addEventListener('pagehide', () => this.clearAll());
  }

  down(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      if (performance.now() - this.lastTouch < 800) return; // ignore emulated mouse after touch
      this.mouse.active = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.swapPresses++;
      return;
    }
    e.preventDefault();
    this.lastTouch = performance.now();
    const w = this.root.clientWidth;
    const key = e.clientX < w * 0.5 ? 'move' : 'aim';
    const s = this.sticks[key];
    if (s.id !== null) return; // that thumb's stick is already owned
    s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = 0; s.y = 0;
    try { this.root.setPointerCapture(e.pointerId); } catch {}
    s.el.style.left = s.ox + 'px'; s.el.style.top = s.oy + 'px';
    s.el.classList.add('on');
    s.knob.style.transform = 'translate(-50%,-50%)';
  }

  moveEv(e) {
    if (e.pointerType === 'mouse') { this.mouse.active = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; return; }
    for (const s of Object.values(this.sticks)) {
      if (s.id !== e.pointerId) continue;
      e.preventDefault();
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const l = Math.hypot(dx, dy);
      if (l > STICK_R) {
        // drag the base along so reversing direction is instant (no dead travel back)
        const k = (l - STICK_R) / l; s.ox += dx * k; s.oy += dy * k; dx -= dx * k; dy -= dy * k;
        s.el.style.left = s.ox + 'px'; s.el.style.top = s.oy + 'px';
      }
      s.x = dx / STICK_R; s.y = dy / STICK_R;
      s.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }

  up(e) {
    if (e.pointerType === 'mouse' && e.type !== 'lostpointercapture') { if (e.button === 0) this.mouse.down = false; return; }
    for (const s of Object.values(this.sticks)) if (s.id === e.pointerId) this.release(s);
  }

  release(s) {
    s.id = null; s.x = 0; s.y = 0;
    s.el.classList.remove('on');
  }

  clearAll() {
    for (const s of Object.values(this.sticks)) this.release(s);
    this.keys.clear();
    this.mouse.down = false;
    this.swapPresses = 0;
  }

  // Returns world-plane vectors. camYaw rotates screen axes onto the ground (0: screen up = -z).
  sample(camYaw = 0) {
    let mx = this.sticks.move.x, my = this.sticks.move.y;
    let ax = this.sticks.aim.x, ay = this.sticks.aim.y;
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
    if (this.mouse.active && this.sticks.aim.id === null) {
      const ps = this.getPlayerScreen();
      if (ps) {
        const dx = this.mouse.x - ps.x, dy = this.mouse.y - ps.y, l = Math.hypot(dx, dy) || 1;
        const mag = this.mouse.down ? 1 : 0.3; // hovering aims without attacking
        ax = (dx / l) * mag; ay = (dy / l) * mag;
      }
    }
    const lm = Math.hypot(mx, my); if (lm > 1) { mx /= lm; my /= lm; }
    const la = Math.hypot(ax, ay); if (la > 1) { ax /= la; ay /= la; }
    const c = Math.cos(camYaw), s = Math.sin(camYaw);
    const out = {
      moveX: mx * c + my * s, moveZ: -mx * s + my * c,
      aimX: ax * c + ay * s, aimZ: -ax * s + ay * c,
      swapPresses: this.swapPresses,
    };
    this.swapPresses = 0;
    return out;
  }
}
