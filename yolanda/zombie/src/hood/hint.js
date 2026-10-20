// Chapter 2: the objective hint (polish pass 3). The brief: "discoveries should feel like discoveries, not following an arrow
// through a chain of chores" -- so the world's own clues guide first (the lit garage, the can in the pickup's bed, voices in
// the clubhouse) and this marker shows only when the player seems lost: the same objective for 35 s and its spot more than
// 10 m away. A small diamond over the spot with the distance; at the screen's edge, pointing, when the spot is off screen.
import * as THREE from 'three';

const _v = new THREE.Vector3();
export class Hint {
  constructor() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:55;pointer-events:none;transform:translate(-50%,-50%);display:none;' +
      'font:700 11px system-ui,sans-serif;color:#fff;text-align:center;text-shadow:0 1px 2px #000';
    el.innerHTML = '<div style="width:16px;height:16px;margin:0 auto;border:2px solid #ffd27a;background:rgba(255,190,90,0.35);transform:rotate(45deg)"></div><div class="d" style="margin-top:3px"></div>';
    el.className = 'hoodOverlay'; document.body.appendChild(el);
    this.el = el; this.d = el.querySelector('.d'); this.t = 0; this.shown = false;
  }
  hide() { if (this.shown) { this.el.style.display = 'none'; this.shown = false; } }
  update(camera, level, sim, dt) {
    const tgt = level?.goalTarget?.(), p = sim?.player;
    if (!tgt || !p || p.dead || level.complete) { this.hide(); return; }
    const dist = Math.hypot(tgt.x - p.x, tgt.z - p.z), since = level.time - (level.goalT0 ?? 0);
    if (since < 35 || dist < 10) { this.hide(); return; }
    _v.set(tgt.x, 1.4, tgt.z).project(camera);
    const W = innerWidth, H = innerHeight, m = 34;
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    if (_v.z > 1) { x = W - x; y = H - y; } // (behind the camera: mirror)
    x = Math.min(W - m, Math.max(m, x)); y = Math.min(H - m - 90, Math.max(m + 80, y));
    this.el.style.left = x + 'px'; this.el.style.top = y + 'px';
    this.d.textContent = Math.round(dist) + ' m';
    this.el.style.opacity = String(0.65 + 0.35 * Math.sin(level.time * 4));
    if (!this.shown) { this.el.style.display = 'block'; this.shown = true; }
  }
}
