// The threat cue (2026-10-18, the user: "during his attack wind-up, show a clear identifier above him ... make the cue
// understandable through its shape/motion as well as color"): over a special enemy winding up its big attack (core/sim.js
// dodgeThreat: the guard's leap-slam, the lady's charge) a sign that reads three ways at once.
//   WARN (winding up): an amber hazard triangle with "!", bobbing slowly; a ring around it closes as the moment nears.
//   NOW (dodge!): the triangle becomes a pair of white-on-red arrows pointing apart (the dodge glyph, the same one the
//   button shows), shaking, the ring full and flashing.
// One sprite and one ring sprite, drawn on top of everything (never hidden by a prop), sized in world metres.
import * as THREE from 'three';

function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, canvas: c, g };
}
// the hazard triangle (amber, dark border, "!")
function drawWarn(g, s) {
  g.clearRect(0, 0, s, s);
  const m = s * 0.12, top = s * 0.14, bot = s * 0.86;
  g.beginPath(); g.moveTo(s / 2, top); g.lineTo(s - m, bot); g.lineTo(m, bot); g.closePath();
  g.lineJoin = 'round'; g.lineWidth = s * 0.09; g.strokeStyle = '#1b1208'; g.stroke();
  g.fillStyle = '#ffb21f'; g.fill();
  g.fillStyle = '#1b1208'; g.font = `900 ${s * 0.5}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', s / 2, s * 0.6);
}
// the dodge glyph: two arrows pointing apart on a red disc
function drawNow(g, s) {
  g.clearRect(0, 0, s, s);
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); g.fillStyle = '#e8261a'; g.fill();
  g.lineWidth = s * 0.06; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff';
  const arrow = (dir) => {
    const cx = s / 2 + dir * s * 0.06, tip = s / 2 + dir * s * 0.33, y = s / 2, h = s * 0.17, w = s * 0.07;
    g.beginPath(); g.moveTo(tip, y); g.lineTo(cx + dir * s * 0.12, y - h); g.lineTo(cx + dir * s * 0.12, y - w); g.lineTo(cx, y - w);
    g.lineTo(cx, y + w); g.lineTo(cx + dir * s * 0.12, y + w); g.lineTo(cx + dir * s * 0.12, y + h); g.closePath(); g.fill();
  };
  arrow(-1); arrow(1);
}

export class ThreatCue {
  constructor(scene) {
    this.warn = canvasTex(drawWarn); this.now = canvasTex(drawNow);
    this.ringC = canvasTex(() => {}, 128);
    const mat = (map) => new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.icon = new THREE.Sprite(mat(this.warn.tex)); this.icon.renderOrder = 50;
    this.ring = new THREE.Sprite(mat(this.ringC.tex)); this.ring.renderOrder = 49;
    this.group = new THREE.Group(); this.group.add(this.ring, this.icon); this.group.visible = false;
    scene.add(this.group);
    this.lastP = -1; this.lastNow = null; this.t = 0; this.fade = 0;
  }
  // the ring: an arc closing clockwise from the top (p 0..1); full and white when it is time
  drawRing(p, now) {
    const { g, canvas: c, tex } = this.ringC, s = c.width;
    g.clearRect(0, 0, s, s);
    g.lineCap = 'round';
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2); g.lineWidth = s * 0.07; g.strokeStyle = 'rgba(20,12,6,.55)'; g.stroke();
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, p)); g.lineWidth = s * 0.07;
    g.strokeStyle = now ? '#ffffff' : '#ffb21f'; g.stroke();
    tex.needsUpdate = true;
  }
  // threat: core/sim.js dodgeThreat (special) or null; pos: the attacker's drawn position; h: its height (m)
  update(dt, threat, pos, h) {
    this.t += dt;
    this.fade = Math.max(0, Math.min(1, this.fade + (threat ? dt / 0.12 : -dt / 0.2)));
    if (!threat && this.fade <= 0) { this.group.visible = false; return; }
    this.group.visible = true;
    if (threat) { this.pos = pos; this.h = h; }
    const now = threat ? !!threat.now : !!this.lastNow, p = threat ? Math.min(1, now ? 1 : threat.u / (threat.kind === 'slam' ? 0.58 : 1)) : 1; // (fading out: the last sign stays)
    if (now !== this.lastNow) { this.icon.material.map = now ? this.now.tex : this.warn.tex; this.icon.material.needsUpdate = true; this.lastNow = now; }
    if (Math.abs(p - this.lastP) > 0.015 || (now && Math.floor(this.t * 10) !== Math.floor((this.t - dt) * 10))) { this.drawRing(p, now); this.lastP = p; }
    // motion: a slow bob while it winds up; NOW: a fast shake and a beat in its size
    const bob = now ? 0 : Math.sin(this.t * 4) * 0.06, shake = now ? Math.sin(this.t * 55) * 0.05 : 0, beat = now ? 1 + 0.16 * Math.abs(Math.sin(this.t * 12)) : 1;
    const P = this.pos || { x: 0, z: 0 }, yT = (P.y != null ? P.y + 0.62 : (this.h || 1.8) + 0.55);
    this.y = this.y == null || !this.group.visible ? yT : this.y + (yT - this.y) * Math.min(1, dt * 10); // (follows his head through the crouch and the leap)
    this.group.position.set(P.x + shake, this.y + bob, P.z);
    const s = 0.62 * beat * (0.6 + 0.4 * this.fade);
    this.icon.scale.set(s * 0.82, s * 0.82, 1); this.ring.scale.set(s * 1.25, s * 1.25, 1);
    this.icon.material.opacity = this.ring.material.opacity = this.fade * (now && Math.sin(this.t * 24) < -0.6 ? 0.65 : 1);
  }
}
