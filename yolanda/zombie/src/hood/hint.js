// Chapter 2: the guidance marker (Marc's polish brief, design/CH2_POLISH_BRIEF.md "Subtle guidance"). Sophie, the lit
// garage, the voices in the clubhouse guide first; this small marker only shows
//   - for a few seconds when the objective changes,
//   - when the player asks (a tap on the objective line at the top),
//   - when genuinely stuck: the same objective for 45 s, no fight going on, and no headway toward it for 25 s.
// Never while fighting (infected awake within 14 m), never for an objective that has no known place yet. It points at the
// next reachable step (the next point of the way Sophie knows, level.js ROUTES; else the objective's own spot), fades when
// Marc arrives or heads its way, and sits at the screen's edge when the spot is off screen. A white-ringed dark diamond with
// the distance (shape and contrast, not colour). The stronger setting (Settings: "Stronger guidance") shows it whenever the
// spot is more than 8 m away and nothing is being fought.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const FLASH = 4, ASKED = 7;
export class Hint {
  constructor() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:55;pointer-events:none;transform:translate(-50%,-50%);display:none;transition:opacity 0.4s;' +
      'font:700 11px system-ui,sans-serif;color:#fff;text-align:center;text-shadow:0 1px 2px #000';
    el.innerHTML = '<div style="width:14px;height:14px;margin:0 auto;border:2px solid #fff;background:rgba(10,10,10,0.55);box-shadow:0 0 0 1px rgba(0,0,0,0.6);transform:rotate(45deg)"></div><div class="d" style="margin-top:4px"></div>';
    el.className = 'hoodOverlay'; document.body.appendChild(el);
    this.el = el; this.d = el.querySelector('.d'); this.shown = false; this.goal = null; this.flashT = 0; this.askT = 0;
    this.best = 1e9; this.bestT = 0;
    // a tap on the objective line asks for the marker
    const obj = document.getElementById('objective');
    if (obj) { obj.style.pointerEvents = 'auto'; obj.addEventListener('click', () => { this.askT = ASKED; }); }
  }
  // (on unless turned off: Marc, 2026-10-22, "add a little indicator of where to go")
  get strong() { try { return JSON.parse(localStorage.getItem('zc.guide') ?? 'true') === true; } catch { return true; } }
  hide() { if (this.shown) { this.el.style.opacity = '0'; this.shown = false; } }
  update(camera, level, sim, dt) {
    const p = sim?.player;
    if (!level || !p || p.dead || level.complete || level.api?.cine?.active) { this.hide(); return; }
    const tgt = level.nextStep?.() || level.goalTarget?.();
    if (level.objective !== this.goal) { this.goal = level.objective; this.flashT = tgt ? FLASH : 0; this.best = 1e9; this.bestT = level.time; }
    this.flashT -= dt; this.askT -= dt;
    if (!tgt) { this.hide(); return; }
    const dist = Math.hypot(tgt.x - p.x, tgt.z - p.z);
    // headway: the nearest he has been to it lately
    if (dist < this.best - 1.5) { this.best = dist; this.bestT = level.time; }
    const fighting = sim.zombies.some((z) => z.alive && !z.passive && !z.dormant && Math.hypot(z.x - p.x, z.z - p.z) < 14);
    const stuck = level.time - (level.goalT0 ?? 0) > 45 && level.time - this.bestT > 25;
    const want = !fighting && dist > 3.5 && (this.flashT > 0 || this.askT > 0 || stuck || (this.strong && dist > 5));
    if (!want) { this.hide(); return; }
    _v.set(tgt.x, 1.4, tgt.z).project(camera);
    const W = innerWidth, H = innerHeight, m = 34;
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    if (_v.z > 1) { x = W - x; y = H - y; } // (behind the camera: mirror)
    x = Math.min(W - m, Math.max(m, x)); y = Math.min(H - m - 90, Math.max(m + 120, y));   // (below the objective and the radio's face badge)
    this.el.style.left = x + 'px'; this.el.style.top = y + 'px';
    this.d.textContent = Math.round(dist) + ' m';
    if (!this.shown) { this.el.style.display = 'block'; this.el.style.opacity = '0.9'; this.shown = true; }
    // (the flash fades out over its last second)
    const fade = this.askT > 0 || stuck || this.strong ? 0.9 : Math.min(0.9, Math.max(0, this.flashT));
    this.el.style.opacity = String(fade);
  }
}
