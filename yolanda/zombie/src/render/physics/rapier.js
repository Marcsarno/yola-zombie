// Rapier backend (rigid capsules + impulse joints). Same interface as CustomPhysics.
// The Rapier library is a separate bundle (dist/rapier.js, ~2.2 MB with its wasm inlined) that is
// loaded only when this backend is selected.
// Every ragdoll body starts with identity rotation and carries its capsule rotated inside it, so all
// bodies share one frame at creation: hinge axes are then the same vector in both bodies' local space
// and hinge limits are measured from the pose at the moment of death.
import * as THREE from 'three';

let RAPIER = null;
async function loadRapier() {
  if (RAPIER) return RAPIER;
  if (!window.RAPIER_LIB) {
    await new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'dist/rapier.js'; s.onload = res; s.onerror = () => rej(new Error('rapier bundle failed to load'));
      document.head.appendChild(s);
    });
  }
  RAPIER = window.RAPIER_LIB;
  await RAPIER.init();
  return RAPIER;
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
const GROUP_WORLD = 0x0001, GROUP_BODY = 0x0002;
const groups = (member, filter) => (member << 16) | filter;

export class RapierPhysics {
  constructor() { this.name = 'rapier'; this.bodies = new Map(); this.nextId = 1; this.stats = { steps: 0, ms: 0 }; }

  async init(world) {
    const R = await loadRapier();
    if (this.world) this.world.free();
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.world.numSolverIterations = 4;
    this.bodies.clear();
    const fix = (desc) => this.world.createCollider(desc.setFriction(0.8).setCollisionGroups(groups(GROUP_WORLD, GROUP_BODY)));
    fix(R.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0));
    for (const b of world.boxes) {
      if (b.kind === 'doorSeal' || b.kind === 'door') continue;
      const hx = (b.maxX - b.minX) / 2, hz = (b.maxZ - b.minZ) / 2, hy = Math.max(0.02, b.h / 2);
      fix(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation((b.minX + b.maxX) / 2, hy, (b.minZ + b.maxZ) / 2));
    }
  }

  _capsuleBody(a, b, r, mass, q0, vel) {
    const R = RAPIER, mid = a.clone().add(b).multiplyScalar(0.5), half = Math.max(0.01, a.distanceTo(b) / 2 - r * 0.5);
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(mid.x, mid.y, mid.z)
      .setLinvel(vel.x, vel.y, vel.z).setLinearDamping(0.15).setAngularDamping(0.9).setCcdEnabled(false));
    const col = R.ColliderDesc.capsule(half, r).setRotation({ x: q0.x, y: q0.y, z: q0.z, w: q0.w })
      .setMass(mass).setFriction(0.7).setRestitution(0.05).setCollisionGroups(groups(GROUP_BODY, GROUP_WORLD | GROUP_BODY));
    this.world.createCollider(col, body);
    return body;
  }

  addRagdoll(desc, vels) {
    const R = RAPIER, id = this.nextId++;
    const rb = desc.parts.map((p, i) => this._capsuleBody(p.a, p.b, p.r, p.mass, p.q0, vels[i]));
    const joints = [];
    for (const j of desc.joints) {
      const P = rb[j.parent], C = rb[j.child];
      const pp = P.translation(), cp = C.translation();
      const a1 = { x: j.at.x - pp.x, y: j.at.y - pp.y, z: j.at.z - pp.z }, a2 = { x: j.at.x - cp.x, y: j.at.y - cp.y, z: j.at.z - cp.z };
      let jd;
      if (j.type === 'hinge') {
        jd = R.JointData.revolute(a1, a2, { x: j.axis.x, y: j.axis.y, z: j.axis.z });
        // from almost straight to fully bent, measured from the current bend
        const par = desc.parts[j.parent], ch = desc.parts[j.child];
        const bent = Math.acos(THREE.MathUtils.clamp(par.b.clone().sub(par.a).normalize().dot(ch.b.clone().sub(ch.a).normalize()), -1, 1));
        jd.limitsEnabled = true; jd.limits = [-bent + 0.05, 2.4 - bent];
      } else jd = R.JointData.spherical(a1, a2);
      const joint = this.world.createImpulseJoint(jd, P, C, true);
      joint.setContactsEnabled(false);
      joints.push(joint);
    }
    this.bodies.set(id, { id, kind: 'ragdoll', rb, joints, q0: desc.parts.map((p) => p.q0.clone()) });
    return id;
  }

  addPiece(a, b, r, vel, q0) {
    const id = this.nextId++;
    const body = this._capsuleBody(a, b, r, 1.5, q0, vel);
    body.setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 12 }, true);
    this.bodies.set(id, { id, kind: 'piece', rb: [body], joints: [], q0: [q0.clone()] });
    return id;
  }

  impulse(id, partIndex, imp) {
    const b = this.bodies.get(id); if (!b) return;
    (b.rb[partIndex] || b.rb[0]).applyImpulse({ x: imp.x, y: imp.y, z: imp.z }, true);
  }

  remove(id) {
    const b = this.bodies.get(id); if (!b) return;
    for (const j of b.joints) this.world.removeImpulseJoint(j, true);
    for (const r of b.rb) this.world.removeRigidBody(r);
    this.bodies.delete(id);
  }

  step() {
    const t0 = performance.now();
    this.world.step();
    this.stats.steps++; this.stats.ms += performance.now() - t0;
  }

  read(id, out = []) {
    const b = this.bodies.get(id); if (!b) return null;
    b.rb.forEach((r, i) => {
      const s = out[i] || (out[i] = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
      const t = r.translation(), q = r.rotation();
      s.pos.set(t.x, t.y, t.z);
      s.quat.set(q.x, q.y, q.z, q.w).multiply(b.q0[i]); // body rotation x capsule frame
    });
    return out;
  }
  sleeping(id) { const b = this.bodies.get(id); return !b || b.rb.every((r) => r.isSleeping()); }
  count() { return this.bodies.size; }
}
