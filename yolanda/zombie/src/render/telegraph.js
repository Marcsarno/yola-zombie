// Zombie attack telegraphs on the floor: a wedge in front of a zombie winding up, the exact reach and width of the strike
// it is about to make (core/zombies.js ZATTACKS). A faint outline appears at once, a red fill grows out from the zombie
// over the wind-up (full when it strikes), it flashes on the strike and fades through the recovery. Pooled, one draw
// each, unlit, drawn under the characters.
import * as THREE from 'three';
import { ZATTACKS } from '../core/zombies.js';

function sector(arc) { // unit-radius wedge lying on the floor, centred on +z, apex at the origin
  const g = new THREE.CircleGeometry(1, 28, -Math.PI / 2 - arc, arc * 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

export class Telegraphs {
  constructor(scene) {
    this.scene = scene;
    this.geo = Object.fromEntries(Object.entries(ZATTACKS).map(([k, A]) => [k, sector(A.arc)]));
    this.pool = []; this.used = new Map();
    this.enabled = true;
  }
  make() {
    const mat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const g = new THREE.Group();
    g.userData.base = new THREE.Mesh(this.geo.lunge, mat(0xff4a3a)); // the whole reach, faint
    g.userData.fill = new THREE.Mesh(this.geo.lunge, mat(0xff2a1a)); // grows with the wind-up
    g.userData.base.renderOrder = 3; g.userData.fill.renderOrder = 4; g.userData.fill.position.y = 0.002;
    g.add(g.userData.base, g.userData.fill);
    this.scene.add(g);
    return g;
  }
  update(zombies, alpha) {
    const seen = new Set();
    if (this.enabled) for (const z of zombies) {
      const s = z.state;
      if (s !== 'windup' && s !== 'strike' && !(s === 'recover' && z.t < 0.25)) continue;
      seen.add(z.id);
      let g = this.used.get(z.id);
      if (!g) { g = this.pool.pop() || this.make(); this.used.set(z.id, g); }
      const A = ZATTACKS[z.attack] || ZATTACKS.lunge, { base, fill } = g.userData;
      if (base.geometry !== this.geo[z.attack]) base.geometry = fill.geometry = this.geo[z.attack] || this.geo.lunge;
      g.visible = true;
      const px = z.px ?? z.x, pz = z.pz ?? z.z;
      g.position.set(px + (z.x - px) * alpha, 0.03, pz + (z.z - pz) * alpha);
      g.rotation.y = z.yaw;
      const r = A.range + 0.05;
      g.scale.setScalar(r);
      if (s === 'windup') {
        const u = Math.min(1, z.t / Math.max(0.05, z.stateDur));
        base.material.opacity = 0.16 + 0.1 * u;
        fill.scale.setScalar(0.15 + 0.85 * u); fill.material.opacity = 0.18 + 0.32 * u * u;
      } else if (s === 'strike') {
        base.material.opacity = 0.3; fill.scale.setScalar(1); fill.material.opacity = 0.75;
      } else { // recovering: fades out
        const k = 1 - z.t / 0.25;
        base.material.opacity = 0.2 * k; fill.scale.setScalar(1); fill.material.opacity = 0.5 * k;
      }
    }
    for (const [id, g] of this.used) if (!seen.has(id)) { g.visible = false; this.used.delete(id); this.pool.push(g); }
  }
}
