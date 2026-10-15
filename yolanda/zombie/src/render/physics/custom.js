// Custom lightweight physics: position-based (Verlet) particles with distance constraints.
// A ragdoll is 17 particles: rigid clusters for pelvis, chest and head, chains for arms and legs,
// plus a few minimum-distance limits that stop limbs folding through the body. Particles collide with
// the floor, the arena's boxes (walls, furniture) and each other (spatial hash), with friction.
// Part orientations: pelvis/chest from their particles (axis + hip/shoulder line); other parts carry
// their orientation by parallel transport (rotate by the change of their axis each step).
import * as THREE from 'three';
import { frameQuat } from './ragdoll.js';

const G = -9.81, ITER = 6, DAMP = 0.996, FRICTION = 0.55, BOUNCE = 0.15, CELL = 0.3;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

class Particle {
  constructor(p, r, invMass) { this.x = p.clone(); this.p = p.clone(); this.r = r; this.w = invMass; this.body = null; this.i = 0; this.ground = false; }
}

export class CustomPhysics {
  constructor() { this.name = 'custom'; this.syncInit = true; this.bodies = new Map(); this.nextId = 1; this.boxes = []; this.particles = []; this.stats = { steps: 0, ms: 0 }; }
  async init(world) {
    this.bodies.clear(); this.particles = [];
    this.boxes = world.boxes.filter((b) => b.kind !== 'doorSeal' && b.kind !== 'door').map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: b.h }));
  }

  _particle(body, pos, r, mass) {
    const pt = new Particle(pos, r, 1 / mass); pt.body = body; pt.i = body.pts.length; body.pts.push(pt); return pt;
  }
  _link(body, A, B, min = 0, max = null) { // max null: rigid at current length; min: only push apart
    const d = A.x.distanceTo(B.x);
    body.cons.push({ A, B, lo: min ? d * min : d, hi: max === null ? d : (max === Infinity ? Infinity : d * max) });
    body.adj.add(A.i * 64 + B.i); body.adj.add(B.i * 64 + A.i);
  }

  // desc from describeRagdoll; vels: per part THREE.Vector3 (m/s)
  addRagdoll(desc, vels) {
    const id = this.nextId++, body = { id, kind: 'ragdoll', pts: [], cons: [], adj: new Set(), desc, q: [], prevAxis: [], sleep: 0 };
    const P = {}, part = (n) => desc.parts[desc.idx[n]];
    const pt = (key, pos, r, m) => (P[key] = this._particle(body, pos, r, m));
    const pel = part('pelvis'), ch = part('chest');
    const S = pel.r / 0.075 / 1; // height-ish scale from the pelvis radius
    pt('hips', pel.a, pel.r * 0.9, 6); pt('spine1', pel.b, pel.r, 6);
    // hip joints: where the thighs start (or a guess if a leg is missing below the hip)
    const tl = part('thighL'), tr = part('thighR');
    pt('hipL', tl ? tl.a : pel.a.clone().addScaledVector(pel.ref, 0.5 * 0.1 * S), pel.r * 0.6, 3);
    pt('hipR', tr ? tr.a : pel.a.clone().addScaledVector(pel.ref, -0.5 * 0.1 * S), pel.r * 0.6, 3);
    const rig = (keys) => { for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) this._link(body, P[keys[i]], P[keys[j]]); };
    rig(['hips', 'spine1', 'hipL', 'hipR']);
    pt('neck', ch.b, ch.r * 0.7, 4);
    const ul = part('upperArmL'), ur = part('upperArmR');
    pt('shL', ul ? ul.a : ch.b.clone(), ch.r * 0.55, 2); pt('shR', ur ? ur.a : ch.b.clone(), ch.r * 0.55, 2);
    rig(['spine1', 'neck', 'shL', 'shR']);
    const hd = part('head');
    if (hd) { pt('head', hd.a, hd.r * 0.8, 2); pt('top', hd.b, hd.r, 2); rig(['neck', 'head', 'top']); this._link(body, P.top, P.spine1, 0.85, Infinity); }
    const limb = (up, lo, a, mid, end) => {
      const U = part(up); if (!U) return;
      pt(mid, U.b, U.r, U.mass); this._link(body, P[a], P[mid]);
      const L = part(lo);
      if (L) { pt(end, L.b, L.r, L.mass); this._link(body, P[mid], P[end]); this._link(body, P[a], P[end], 0.45, Infinity); }
    };
    limb('upperArmL', 'foreArmL', 'shL', 'elL', 'haL'); limb('upperArmR', 'foreArmR', 'shR', 'elR', 'haR');
    limb('thighL', 'shinL', 'hipL', 'knL', 'ftL'); limb('thighR', 'shinR', 'hipR', 'knR', 'ftR');
    // legs and arms may not fold up into the torso
    for (const k of ['knL', 'knR']) if (P[k]) this._link(body, P[k], P.spine1, 0.8, Infinity);
    for (const k of ['elL', 'elR']) if (P[k]) this._link(body, P[k], P.hips, 0.6, Infinity);
    // part -> particle pair
    const ends = { pelvis: ['hips', 'spine1'], chest: ['spine1', 'neck'], head: ['head', 'top'], upperArmL: ['shL', 'elL'], foreArmL: ['elL', 'haL'],
      upperArmR: ['shR', 'elR'], foreArmR: ['elR', 'haR'], thighL: ['hipL', 'knL'], shinL: ['knL', 'ftL'], thighR: ['hipR', 'knR'], shinR: ['knR', 'ftR'] };
    body.ends = desc.parts.map((p) => ends[p.name].map((k) => P[k]));
    body.side = { pelvis: [P.hipL, P.hipR], chest: [P.shL, P.shR] };
    body.q = desc.parts.map((p) => p.q0.clone());
    body.prevAxis = body.ends.map(([A, B]) => B.x.clone().sub(A.x).normalize());
    // initial velocities
    desc.parts.forEach((p, i) => { for (const e of body.ends[i]) e.p.copy(e.x).addScaledVector(vels[i], -1 / 60); });
    this.bodies.set(id, body); this.particles.push(...body.pts);
    return id;
  }

  // A severed piece: capsule from a to b.
  addPiece(a, b, r, vel, q0) {
    const id = this.nextId++, body = { id, kind: 'piece', pts: [], cons: [], adj: new Set(), sleep: 0 };
    const A = this._particle(body, a, r, 1), B = this._particle(body, b, r, 1);
    this._link(body, A, B);
    // give it a tumble: ends start with different velocities
    const spin = new THREE.Vector3(Math.random() - 0.5, 0.5, Math.random() - 0.5).multiplyScalar(1.6);
    A.p.copy(A.x).addScaledVector(vel.clone().sub(spin), -1 / 60); B.p.copy(B.x).addScaledVector(vel.clone().add(spin), -1 / 60);
    body.ends = [[A, B]]; body.q = [q0.clone()]; body.prevAxis = [b.clone().sub(a).normalize()];
    this.bodies.set(id, body); this.particles.push(...body.pts);
    return id;
  }

  // impulse (kg m/s) to the part's particles
  impulse(id, partIndex, imp) {
    const body = this.bodies.get(id); if (!body) return;
    body.sleep = 0;
    for (const e of body.ends[partIndex] || body.ends[0]) e.p.addScaledVector(imp, -e.w / 60);
  }

  remove(id) {
    const body = this.bodies.get(id); if (!body) return;
    this.bodies.delete(id);
    const set = new Set(body.pts); this.particles = this.particles.filter((p) => !set.has(p));
  }

  step(dt) {
    const t0 = performance.now();
    const pts = (this._active ||= []); pts.length = 0;
    for (const body of this.bodies.values()) if (body.sleep < 1.5) for (const p of body.pts) pts.push(p);
    // integrate
    for (const p of pts) {
      const vx = (p.x.x - p.p.x) * DAMP, vy = (p.x.y - p.p.y) * DAMP, vz = (p.x.z - p.p.z) * DAMP;
      p.p.copy(p.x);
      p.x.x += vx; p.x.y += vy + G * dt * dt; p.x.z += vz;
      // broadphase: the few boxes this particle can touch during this step
      const c = (p.cand ||= []); c.length = 0;
      const m = p.r + 0.25;
      for (const b of this.boxes) if (p.x.x > b.minX - m && p.x.x < b.maxX + m && p.x.z > b.minZ - m && p.x.z < b.maxZ + m && p.x.y - m < b.h) c.push(b);
    }
    // spatial hash for particle-particle contacts (different bodies, or non-linked within a body)
    const grid = (this._grid ||= new Map());
    for (const c of grid.values()) c.length = 0;
    for (const p of pts) {
      const k = Math.floor(p.x.x / CELL) * 73856093 ^ Math.floor(p.x.z / CELL) * 19349663;
      let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(p);
    }
    for (let it = 0; it < ITER; it++) {
      for (const body of this.bodies.values()) {
        if (body.sleep >= 1.5) continue;
        for (const c of body.cons) {
          const A = c.A, B = c.B;
          _a.subVectors(B.x, A.x);
          const d = _a.length() || 1e-6;
          let target = d < c.lo ? c.lo : d > c.hi ? c.hi : d;
          if (target === d) continue;
          const k = (d - target) / (d * (A.w + B.w));
          A.x.addScaledVector(_a, k * A.w); B.x.addScaledVector(_a, -k * B.w);
        }
      }
      if (it % 2 === 0) this._contacts(pts, grid);
      for (const p of pts) this._collide(p);
    }
    // friction against the floor
    for (const p of pts) {
      if (!p.ground) continue; // scale the horizontal velocity (x - p) down by the friction factor
      p.p.x = p.x.x - (p.x.x - p.p.x) * (1 - FRICTION); p.p.z = p.x.z - (p.x.z - p.p.z) * (1 - FRICTION);
    }
    // orientations + sleep
    for (const body of this.bodies.values()) {
      if (body.sleep >= 1.5) continue;
      let maxV = 0;
      for (const p of body.pts) maxV = Math.max(maxV, p.x.distanceTo(p.p) / dt);
      body.sleep = maxV < 0.08 ? body.sleep + dt : 0;
      body.ends.forEach(([A, B], i) => {
        const axis = _a.subVectors(B.x, A.x).normalize();
        const name = body.kind === 'ragdoll' ? body.desc.parts[i].name : '';
        if (name === 'pelvis' || name === 'chest') { // full frame from the hip / shoulder line
          const [L, R] = name === 'pelvis' ? body.side.pelvis : body.side.chest;
          frameQuat(axis, _b.subVectors(L.x, R.x), body.q[i]);
        } else {
          _q.setFromUnitVectors(body.prevAxis[i], axis);
          body.q[i].premultiply(_q).normalize();
        }
        body.prevAxis[i].copy(axis);
      });
    }
    this.stats.steps++; this.stats.ms += performance.now() - t0;
  }

  _contacts(pts, grid) {
    for (const p of pts) {
      const cx = Math.floor(p.x.x / CELL), cz = Math.floor(p.x.z / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const c = grid.get((cx + dx) * 73856093 ^ (cz + dz) * 19349663); if (!c) continue;
        for (const q of c) {
          if (q === p || q.body.id < p.body.id || (q.body === p.body && (q.i <= p.i || p.body.adj.has(p.i * 64 + q.i)))) continue;
          _a.subVectors(q.x, p.x);
          const d2 = _a.lengthSq(), rr = p.r + q.r;
          if (d2 >= rr * rr || d2 < 1e-10) continue;
          const d = Math.sqrt(d2), k = (rr - d) / (d * (p.w + q.w));
          p.x.addScaledVector(_a, -k * p.w); q.x.addScaledVector(_a, k * q.w);
        }
      }
    }
  }

  _collide(p) {
    p.ground = false;
    if (p.x.y < p.r) { // floor
      p.x.y = p.r; p.ground = true;
      if (p.p.y < p.x.y) p.p.y = p.x.y + (p.x.y - p.p.y) * BOUNCE;
    }
    for (const b of p.cand) {
      if (p.x.y - p.r > b.h) continue;
      const cx = Math.max(b.minX, Math.min(p.x.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.x.z, b.maxZ)), cy = Math.min(p.x.y, b.h);
      const dx = p.x.x - cx, dy = p.x.y - cy, dz = p.x.z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= p.r * p.r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2), k = (p.r - d) / d;
        p.x.x += dx * k; p.x.y += dy * k; p.x.z += dz * k;
        if (dy > 0 && dy * dy > dx * dx + dz * dz) p.ground = true; // resting on top
      } else { // centre inside: leave by the nearest face (top included)
        const m = [p.x.x - b.minX, b.maxX - p.x.x, p.x.z - b.minZ, b.maxZ - p.x.z, b.h - p.x.y];
        const i = m.indexOf(Math.min(...m));
        if (i === 0) p.x.x = b.minX - p.r; else if (i === 1) p.x.x = b.maxX + p.r; else if (i === 2) p.x.z = b.minZ - p.r; else if (i === 3) p.x.z = b.maxZ + p.r; else { p.x.y = b.h + p.r; p.ground = true; }
      }
    }
  }

  // [{pos, quat}] per part
  read(id, out = []) {
    const body = this.bodies.get(id); if (!body) return null;
    body.ends.forEach(([A, B], i) => {
      const s = out[i] || (out[i] = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
      s.pos.addVectors(A.x, B.x).multiplyScalar(0.5); s.quat.copy(body.q[i]);
    });
    return out;
  }
  sleeping(id) { const b = this.bodies.get(id); return !b || b.sleep >= 1.5; }
  count() { return this.bodies.size; }
}
