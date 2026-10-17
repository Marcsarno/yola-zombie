// Ponytail sway (the new Yola, PONYTAIL_PLAN.md step 5). Her ponytail is skinned to three bones under the head
// (Hair1 at the hair tie -> Hair3 at the tips, tools: yola2_work.blend). After the mixer, each bone's tail is a
// damped spring pulled back toward the ponytail's modelled shape, pulled down by gravity, held to its bone length,
// limited to an angle from the modelled shape, and pushed out of a few spheres on her head, neck and upper back
// (sized in Blender so the ponytail at rest touches none of them: her rest look is unchanged). Only the three hair
// bones are rotated. Fixed sub-steps (STEP) make it behave the same at any frame rate; the head, the colliders and
// the modelled shape are interpolated across the sub-steps of a frame so a fast head move is not one jump.
import * as THREE from 'three';

// spheres in bone-local units (Blender rest, measured 2026-10-16): centre on the bone, radius just short of the hair
const COLLIDERS = [
  { bone: 'Head', at: [0, 0.057, 0], r: 0.0942 },
  { bone: 'Neck', at: [0, 0.0266, 0], r: 0.0708 },
  { bone: 'Spine2', at: [0, 0.0704, 0], r: 0.0655 },
  { bone: 'Spine2', at: [0, 0.0352, 0], r: 0.0768 },
  { bone: 'Spine2', at: [0, 0, 0], r: 0.0816 },
  { bone: 'Spine1', at: [0, 0.0334, 0], r: 0.0767 },
  // (no shoulder spheres: the shoulders rise into the ponytail whenever her arms go up, and shoved it sideways)
];
const HAIR3_RATIO = 0.0717 / 0.0758; // Hair3's length over Hair2's (Hair3 has no child to measure it by)
const STEP = 1 / 120;
const SETTLE = 1.0; // seconds of settling when (re)started; also caps the sub-steps of one long frame
const Y = new THREE.Vector3(0, 1, 0);
export const HAIR_DEFAULTS = {
  // (2026-10-16, the user: "let it hang more ... so it doesn't stick up when her head goes back")
  k: [100, 35, 20], // spring back to the modelled shape (1/s^2), firmer at the tie, loose at the tips
  zeta: 0.5, // damping ratio (1 = no bounce)
  g: 12, // gravity (m/s^2; more than real: the springs hold the modelled shape, gravity must win over them)
  drag: 0.4, // air drag on the tips (trails a little when she runs)
  maxDeg: [60, 90, 100], // furthest each bone may turn from the modelled shape (her head/neck/back spheres stop it first)
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

export class HairSway {
  // bones: name -> Bone with the 'mixamorig' prefix stripped (Hair1..3, Head, ...)
  constructor(bones, opt = {}) {
    this.chain = ['Hair1', 'Hair2', 'Hair3'].map((n) => bones[n]);
    this.ok = this.chain.every(Boolean) && !!bones.Head;
    if (!this.ok) return;
    this.cfg = { ...HAIR_DEFAULTS, ...opt };
    this.on = true;
    this.restQ = this.chain.map((b) => b.quaternion.clone()); // the clips only ever hold the hair at its rest pose
    this.restLen = [this.chain[1].position.length(), this.chain[2].position.length(), this.chain[2].position.length() * HAIR3_RATIO];
    this.cols = COLLIDERS.filter((c) => bones[c.bone]).map((c) => ({ b: bones[c.bone], at: new THREE.Vector3(...c.at), r: c.r, c0: new THREE.Vector3(), c1: new THREE.Vector3(), rw: 0, cs: new THREE.Vector3() }));
    this.p = [0, 1, 2].map(() => new THREE.Vector3());
    this.v = [0, 1, 2].map(() => new THREE.Vector3());
    this.dir0 = [0, 1, 2].map(() => new THREE.Vector3()); this.dir1 = [0, 1, 2].map(() => new THREE.Vector3());
    this.root0 = new THREE.Vector3(); this.root1 = new THREE.Vector3();
    this.len = [0, 0, 0];
    this.ready = false;
  }

  reset() { this.ready = false; }

  // the modelled ponytail for the current head pose: root position, each bone's direction, world lengths
  sampleAnimated() {
    const c = this.chain, parent = c[0].parent;
    parent.updateWorldMatrix(true, false);
    c[0].updateWorldMatrix(false, false);
    c[0].getWorldPosition(this.root1);
    parent.getWorldQuaternion(_q);
    const s = _a.setFromMatrixColumn(parent.matrixWorld, 0).length(); // (uniform scale)
    for (let i = 0; i < 3; i++) {
      _q.multiply(this.restQ[i]);
      this.dir1[i].copy(Y).applyQuaternion(_q);
      // each bone's own scale is 1, so world length = rest length x the parent's world scale
      this.len[i] = this.restLen[i] * s;
    }
    for (const k of this.cols) { k.b.updateWorldMatrix(true, false); k.c1.copy(k.at).applyMatrix4(k.b.matrixWorld); k.rw = k.r * _a.setFromMatrixColumn(k.b.matrixWorld, 0).length(); }
  }

  update(dt) {
    if (!this.ok) return;
    this.sampleAnimated();
    if (!this.on) { this.apply(true); this.ready = false; return; }
    // a paused game steps with dt 0 (the pause menu, a lost focus): hold the hair where it is. (A 0 step divided by 0 and
    // turned every hair bone NaN for good: the ponytail vanished after the first pause; the user, 2026-10-16.)
    if (!Number.isFinite(this.p[2].x + this.p[2].y + this.p[2].z)) this.ready = false; // (never draw a broken state: start over)
    if (this.ready && !(dt > 0)) { this.apply(false); return; }
    if (!this.ready || dt > 0.25) { // first frame, or a jump in time (pause, teleport): start from the modelled shape
      let h = this.root1;
      for (let i = 0; i < 3; i++) { this.p[i].copy(h).addScaledVector(this.dir1[i], this.len[i]); this.v[i].set(0, 0, 0); h = this.p[i]; }
      this.root0.copy(this.root1); for (let i = 0; i < 3; i++) this.dir0[i].copy(this.dir1[i]);
      for (const k of this.cols) k.c0.copy(k.c1);
      this.ready = true;
      this.integrate(SETTLE); // let it hang under gravity first (no drop on the first frames)
    }
    this.integrate(dt);
    this.root0.copy(this.root1); for (let i = 0; i < 3; i++) this.dir0[i].copy(this.dir1[i]);
    for (const k of this.cols) k.c0.copy(k.c1);
    this.apply(false);
  }

  // advance dt seconds in fixed sub-steps, the head and colliders moving from their last-frame to their current spots
  integrate(dt) {
    const C = this.cfg, n = Math.min(SETTLE / STEP, Math.max(1, Math.ceil(dt / STEP - 1e-6))), hdt = dt / n;
    const rootPrev = _e.copy(this.root0);
    for (let s = 1; s <= n; s++) {
      const u = s / n;
      const root = _d.copy(this.root0).lerp(this.root1, u);
      for (const k of this.cols) k.cs.copy(k.c0).lerp(k.c1, u);
      // the root's velocity over this sub-step (the springs damp relative to what they hang from)
      const rootV = _c.copy(root).sub(rootPrev).divideScalar(hdt); rootPrev.copy(root);
      let head = root, headV = rootV;
      for (let i = 0; i < 3; i++) {
        const p = this.p[i], v = this.v[i], L = this.len[i];
        const dir = _a.copy(this.dir0[i]).lerp(this.dir1[i], u).normalize();
        const k = C.k[i], c = 2 * C.zeta * Math.sqrt(k);
        // acceleration: spring to the modelled spot, damping relative to the head, air drag, gravity
        const tx = head.x + dir.x * L, ty = head.y + dir.y * L, tz = head.z + dir.z * L;
        const ax = k * (tx - p.x) - c * (v.x - headV.x) - C.drag * v.x;
        const ay = k * (ty - p.y) - c * (v.y - headV.y) - C.drag * v.y - C.g;
        const az = k * (tz - p.z) - c * (v.z - headV.z) - C.drag * v.z;
        const ox = p.x, oy = p.y, oz = p.z;
        v.x += ax * hdt; v.y += ay * hdt; v.z += az * hdt;
        p.x += v.x * hdt; p.y += v.y * hdt; p.z += v.z * hdt;
        // keep the bone length, and limit the turn from the modelled shape
        const w = _b.copy(p).sub(head); let wl = w.length(); if (wl < 1e-9) w.copy(dir); else w.divideScalar(wl);
        const cos = w.dot(dir), cmax = Math.cos(C.maxDeg[i] * Math.PI / 180);
        if (cos < cmax) { w.addScaledVector(dir, -cos); const pl = w.length(); if (pl < 1e-9) w.copy(dir); else w.divideScalar(pl).multiplyScalar(Math.sqrt(1 - cmax * cmax)).addScaledVector(dir, cmax); }
        p.copy(head).addScaledVector(w, L);
        // out of her head, neck and back, then the length again
        for (const K of this.cols) {
          const dx = p.x - K.cs.x, dy = p.y - K.cs.y, dz = p.z - K.cs.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < K.rw * K.rw && d2 > 1e-12) { const f = K.rw / Math.sqrt(d2); p.set(K.cs.x + dx * f, K.cs.y + dy * f, K.cs.z + dz * f); }
        }
        w.copy(p).sub(head); wl = w.length(); if (wl > 1e-9) p.copy(head).addScaledVector(w, L / wl);
        // velocity from what actually happened (the constraints take speed out, they never add it)
        v.set((p.x - ox) / hdt, (p.y - oy) / hdt, (p.z - oz) / hdt);
        head = p; headV = v;
      }
    }
  }

  // turn each hair bone (from its rest pose under the already placed parent) to point at its simulated tail
  apply(rest) {
    for (let i = 0; i < 3; i++) {
      const b = this.chain[i];
      if (rest) { b.quaternion.copy(this.restQ[i]); continue; }
      b.parent.updateWorldMatrix(false, false);
      b.parent.getWorldQuaternion(_q);
      _q2.copy(_q).multiply(this.restQ[i]); // the bone's modelled world rotation under this parent
      const from = _a.copy(Y).applyQuaternion(_q2);
      const bp = _c.copy(b.position).applyMatrix4(b.parent.matrixWorld); // this bone's world position
      const to = _d.copy(this.p[i]).sub(bp).normalize();
      _q3.setFromUnitVectors(from, to).multiply(_q2); // the new world rotation
      b.quaternion.copy(_q.invert().multiply(_q3));
      b.updateWorldMatrix(false, false);
    }
    this.chain[2].updateMatrixWorld(true);
  }
}
