// The finisher mark (2026-10-18 night, FINISHERS_PLAN.md 2, the user: "a prompt over his head sort of like God of War"):
// over every zombie open to a finisher (core/sim.js openFinisher: a perfect pounce dodge, the guard's slam, the lady's
// wall crash) one gold sign: a diamond with a blade glyph, bobbing, with a ring that drains as its window runs out. The
// centre button turns into FINISH while one is in reach (main.js). Drawn on top of everything, sized in world metres.
import * as THREE from 'three';

function tex(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, g, c };
}
function drawMark(g, s) {
  g.clearRect(0, 0, s, s);
  const m = s / 2, r = s * 0.36;
  g.beginPath(); g.moveTo(m, m - r); g.lineTo(m + r, m); g.lineTo(m, m + r); g.lineTo(m - r, m); g.closePath();
  g.fillStyle = '#ffcf3a'; g.fill(); g.lineWidth = s * 0.06; g.strokeStyle = '#2a1a04'; g.stroke();
  // the blade: a downward stroke with a cross-guard
  g.fillStyle = '#2a1a04';
  g.beginPath(); g.moveTo(m, m + r * 0.62); g.lineTo(m - s * 0.05, m - r * 0.2); g.lineTo(m + s * 0.05, m - r * 0.2); g.closePath(); g.fill();
  g.fillRect(m - s * 0.15, m - r * 0.32, s * 0.3, s * 0.055); g.fillRect(m - s * 0.025, m - r * 0.62, s * 0.05, s * 0.13);
}

export class FinishMarks {
  constructor(scene) {
    this.scene = scene; this.mark = tex(drawMark); this.pool = []; this.t = 0;
  }
  make() {
    const mat = (map) => new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const ring = tex(() => {}, 128), icon = new THREE.Sprite(mat(this.mark.tex)), rs = new THREE.Sprite(mat(ring.tex));
    icon.renderOrder = 53; rs.renderOrder = 52;
    const g = new THREE.Group(); g.add(rs, icon); g.visible = false; this.scene.add(g);
    return { g, icon, rs, ring, lastP: -1 };
  }
  drawRing(M, p) {
    const { g, c, tex: t } = M.ring, s = c.width; g.clearRect(0, 0, s, s); g.lineCap = 'round';
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2); g.lineWidth = s * 0.07; g.strokeStyle = 'rgba(30,18,4,.55)'; g.stroke();
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, p)); g.strokeStyle = '#ffcf3a'; g.stroke();
    t.needsUpdate = true; M.lastP = p;
  }
  // list: [{ pos (the head, world), left (s of its window), dur }]; inReach: the one the button would take (brighter)
  update(dt, list) {
    this.t += dt;
    while (this.pool.length < list.length) this.pool.push(this.make());
    this.pool.forEach((M, i) => {
      const o = list[i]; M.g.visible = !!o; if (!o) return;
      const p = Math.max(0, Math.min(1, o.left / Math.max(0.1, o.dur)));
      if (Math.abs(p - M.lastP) > 0.02) this.drawRing(M, p);
      const pulse = 1 + 0.08 * Math.sin(this.t * 9) + (o.inReach ? 0.14 : 0), s = 0.5 * pulse, low = p < 0.3 && Math.sin(this.t * 22) < 0;
      M.g.position.set(o.pos.x, o.pos.y + 0.55 + Math.sin(this.t * 3.5) * 0.05, o.pos.z);
      M.icon.scale.set(s * 0.9, s * 0.9, 1); M.rs.scale.set(s * 1.3, s * 1.3, 1);
      M.icon.material.opacity = M.rs.material.opacity = low ? 0.55 : 1; // (its last third blinks)
    });
  }
}
