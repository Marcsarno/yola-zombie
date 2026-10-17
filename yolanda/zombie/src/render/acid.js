// The lady's acid (core/sim.js hazards, PROGRESS.md gore plan): a green-yellow pool where she burst, spreading out over a
// moment, bubbling, glowing under the bloom looks, dissolving at the end (~5 s). It hurts Yola (the sim); zombies walk
// straight through it, steam rising around their feet as they do. One pool mesh per hazard, pooled.
import * as THREE from 'three';

export class AcidPools {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx; this.used = new Map(); this.pool = [];
    this.geo = new THREE.CircleGeometry(1, 40); this.geo.rotateX(-Math.PI / 2);
  }
  make() {
    const g = new THREE.Group();
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
    g.userData.base = new THREE.Mesh(this.geo, mat(0x7fae1a, 0)); // the pool
    g.userData.core = new THREE.Mesh(this.geo, mat(0xd9f25a, 0)); g.userData.core.position.y = 0.002; // its bright centre
    g.userData.base.renderOrder = g.userData.core.renderOrder = 2;
    g.add(g.userData.base, g.userData.core); this.scene.add(g);
    return g;
  }
  update(hazards, zombies, dt) {
    const seen = new Set(), fx = this.fx;
    for (const h of hazards || []) {
      const key = h.id + ':' + h.x.toFixed(2); seen.add(key);
      let g = this.used.get(key); if (!g) { g = this.pool.pop() || this.make(); this.used.set(key, g); }
      const grow = Math.min(1, h.t / 0.4), fade = Math.min(1, (h.dur - h.t) / 1.2);
      g.visible = true; g.position.set(h.x, 0.02, h.z);
      g.userData.base.scale.setScalar(h.r * (0.55 + 0.45 * grow)); g.userData.core.scale.setScalar(h.r * 0.55 * (0.5 + 0.5 * grow) * (0.95 + 0.05 * Math.sin(h.t * 6)));
      g.userData.base.material.opacity = 0.62 * fade; g.userData.core.material.opacity = 0.45 * fade;
      if (!fx || !dt) continue;
      // bubbles popping across it; steam round the feet of any zombie wading through
      if (Math.random() < dt * 14 * fade) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * h.r * 0.9; fx.burst(h.x + Math.cos(a) * r, 0.04, h.z + Math.sin(a) * r, 1, 0xc8f05a, 0.35, 1.6, 0.35); }
      for (const z of zombies) {
        if (!z.alive || Math.hypot(z.x - h.x, z.z - h.z) > h.r) continue;
        if (Math.random() < dt * 10) fx.burst(z.x + (Math.random() - 0.5) * 0.3, 0.08, z.z + (Math.random() - 0.5) * 0.3, 2, 0xeef5e6, 0.5, 2.2, 0.7);
      }
    }
    for (const [k, g] of this.used) if (!seen.has(k)) { g.visible = false; this.used.delete(k); this.pool.push(g); }
  }
}
