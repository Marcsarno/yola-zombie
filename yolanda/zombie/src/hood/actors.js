// Chapter 2: the people (survivors at the house, the looters at the clubhouse) and the girls.
// The survivors (2026-10-20, the user's Mixamo picks): Eve with the rifle; Remy, James, Sophie and Bryce with pistols
// (assets/survivors/*.glb: tools/anim/mixamo_zombie_prep.py, ~20k triangles, colour and normals at 2048, WebP, then tools/anim/build_survivor.py: Mixamo
// aim idles, a flinch, two falls). The looters' models are not made yet: each is a plain debug marker, a coloured capsule
// with a facing nub (the memory rule: no stand-in characters dressed up as finished).
// Their behaviour is real: the survivors shoot zombies through the game's own hit code; the looters are entries in the
// simulation's zombie list (so the player's swings and shots hit, cut and kill them as the game already does) that stand
// in cover, aim with a red sight line (the old build's readable tell) and fire at Marc.
import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PISTOL_CORE_SCALE } from '../render/weaponModels.js';
import { characterLight } from './charlight.js';

// who stands where: the rifle survivor first, then the pistol survivors in turn [file, height m]
const SURVIVORS = { rifle: [['eve', 1.7]], pistol: [['remy', 1.8], ['james', 1.8], ['sophie', 1.66], ['bryce', 1.78]] };
const GUNS = { rifle: ['assets/neighborhood/props/security_rifle.glb', 1], pistol: ['assets/weapons/pistol_core.glb', PISTOL_CORE_SCALE] };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
// a gun ready to hold: its grip (GameGrip_R) at the holder's origin, the muzzle down the holder's +z
function gunHolder(scene, scale) {
  const g = scene.clone(true); g.scale.setScalar(scale); g.updateMatrixWorld(true);
  const grip = g.getObjectByName('GameGrip_R')?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3();
  const muz = g.getObjectByName('Muzzle')?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3(1, 0, 0);
  const d = muz.clone().sub(grip); d.y = 0; d.normalize();
  const inner = new THREE.Group(); inner.quaternion.setFromUnitVectors(d, Z); inner.add(g); g.position.copy(grip).negate();
  const h = new THREE.Group(); h.add(inner); g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return h;
}
const COL = { survivor: 0x6fae5a, looter: 0xb2402f, leader: 0x7a1c12 };
function marker(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.1, 4, 10), m); body.position.y = 0.8; body.castShadow = true; g.add(body);
  const nub = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), m); nub.position.set(0, 1.25, 0.25); g.add(nub);
  return g;
}

export class Actors {
  constructor(scene, ctx) {
    this.scene = scene; this.ctx = ctx; // ctx: { sim: () => sim, audio, fx, hud }
    this.group = new THREE.Group(); this.group.name = 'hood-actors'; scene.add(this.group);
    this.list = []; this.tracers = [];
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.85 });
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9 });
  }
  // the survivors' models and guns (hood.js, at load); without them the markers stand in
  async loadModels(loader) {
    this.models = {}; this.guns = {}; this.nPicked = {};
    const all = [...SURVIVORS.rifle, ...SURVIVORS.pistol];
    await Promise.all([...all.map(([k, h]) => loader.loadAsync('assets/survivors/' + k + '.glb').then((g) => { this.models[k] = { g, h }; }).catch((e) => console.warn('survivor', k, e))),
      ...Object.entries(GUNS).map(([k, [f, s]]) => loader.loadAsync(f).then((g) => { this.guns[k] = { scene: g.scene, s }; }).catch((e) => console.warn('survivor gun', k, e)))]);
  }
  // a survivor's body: the model on the clip's own aim, the gun in the right palm along the aim (rifle: from hand to hand,
  // pistol: from the shoulder to the hand), the model turned so that aim points down the actor's facing
  survivorBody(gun) {
    const list = SURVIVORS[gun] || SURVIVORS.pistol, i = this.nPicked[gun] = (this.nPicked[gun] || 0) + 1, pick = list[(i - 1) % list.length];
    const M = this.models?.[pick[0]]; if (!M) return null;
    const m = skClone(M.g.scene); m.scale.setScalar(pick[1]);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); characterLight(m);
    const turn = new THREE.Group(); turn.add(m);
    const obj = new THREE.Group(); obj.add(turn);
    const mixer = new THREE.AnimationMixer(m), clips = Object.fromEntries(M.g.animations.map((c) => [c.name, c]));
    const idle = mixer.clipAction(clips[gun === 'rifle' ? 'rifle_idle' : 'pistol_idle'] || M.g.animations[0]); idle.play();
    const B = (n) => m.getObjectByName('mixamorig' + n);
    const bones = { hand: B('RightHand'), mid: B('RightHandMiddle1'), lhand: B('LeftHand'), lmid: B('LeftHandMiddle1'), sh: B('RightArm') };
    const G = this.guns?.[gun]; const holder = G ? gunHolder(G.scene, G.s) : null; if (holder) this.group.add(holder);
    const palm = (h, mid, out) => out.copy(h.getWorldPosition(_v3)).lerp(mid.getWorldPosition(_v2), 0.55);
    const aimDir = (out) => { if (gun === 'rifle') { palm(bones.lhand, bones.lmid, out); palm(bones.hand, bones.mid, _v); return out.sub(_v); } palm(bones.hand, bones.mid, out); return out.sub(bones.sh.getWorldPosition(_v)); };
    const body = { obj, mixer, holder, clips, idle, kick: 0, dead: false, deadT: 0,
      update(dt) {
        mixer.update(dt); obj.updateMatrixWorld(true);
        if (!holder) return;
        if (body.dead) body.deadT += dt;
        holder.visible = obj.visible && (!body.dead || body.deadT < 0.35); // (dropped as he goes down)
        palm(bones.hand, bones.mid, holder.position); if (gun !== 'rifle') holder.position.y -= 0.045; // (the pistol's grip down into the two-handed fist)
        const d = aimDir(_v); d.y *= 0.3; d.normalize(); holder.quaternion.setFromUnitVectors(Z, d);
        if (body.kick > 0) { body.kick = Math.max(0, body.kick - dt * 6); holder.position.addScaledVector(d, -0.06 * body.kick); }
      },
      fire() { body.kick = 1; },
      fall(forward) {
        if (body.dead) return; body.dead = true; body.deadT = 0;
        const c = clips[forward ? 'death_forward' : 'death_back']; if (!c) return;
        const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset().play(); idle.crossFadeTo(a, 0.2, false);
      },
      dispose() { holder?.removeFromParent(); },
    };
    // the clip's own aim, measured once on its first frame: the model turns so that aim lies down +z
    mixer.update(0); obj.updateMatrixWorld(true);
    const d0 = aimDir(new THREE.Vector3()); turn.rotation.y = -Math.atan2(d0.x, d0.z);
    return body;
  }
  clear() { this.nPicked = {}; for (const a of this.list) { a.obj.removeFromParent(); a.body?.dispose(); } this.list.length = 0; for (const t of this.tracers) t.line.removeFromParent(); this.tracers.length = 0; }
  sound(name, x, z, vol = 1) { this.ctx.audio?.play(name, vol, { x, z }); }
  tracer(x0, z0, x1, z1, y = 1.3) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y * 0.85, z1)]);
    const line = new THREE.Line(g, this.tracerMat); this.group.add(line); this.tracers.push({ line, t: 0.07 });
  }

  // a friendly survivor at a spot, shooting the nearest zombie in sight every so often; overwhelm(): stops, falls
  survivor(at, { gun = 'pistol' } = {}) {
    const body = this.survivorBody(gun), obj = body ? body.obj : marker(COL.survivor); obj.position.set(at.x, 0, at.z); obj.rotation.y = at.yaw || 0; this.group.add(obj);
    const a = { kind: 'survivor', obj, body, x: at.x, z: at.z, yaw: at.yaw || 0, cd: 0.5, down: false, gun };
    a.overwhelm = () => { a.down = true; body?.fall(Math.random() < 0.5); };
    a.step = (dt, level) => {
      const sim = level.sim;
      if (a.down) { if (!body) obj.rotation.x = Math.min(Math.PI / 2, obj.rotation.x + dt * 3); return; }
      if ((a.cd -= dt) > 0) return;
      let best = null, bd = 15;
      for (const z of sim.zombies) { if (!z.alive || z.looter) continue; const d = Math.hypot(z.x - a.x, z.z - a.z); if (d < bd && sim.world.lineOfSight(a.x, a.z, z.x, z.z, 1.2)) { best = z; bd = d; } }
      if (!best) { a.cd = 0.3; return; }
      a.yaw = Math.atan2(best.x - a.x, best.z - a.z); obj.rotation.y = a.yaw;
      const dx = (best.x - a.x) / bd, dz = (best.z - a.z) / bd, rifle = a.gun === 'rifle';
      if (sim.rand() < (rifle ? 0.8 : 0.55)) best.takeHit(rifle ? 55 : 22, dx, dz, rifle ? 4 : 2.5, 'pistol', sim, 'torso');
      this.tracer(a.x, a.z, best.x, best.z); this.sound(rifle ? 'shotgun' : 'shot', a.x, a.z, 0.7); body?.fire();
      a.cd = (rifle ? 0.9 : 0.7) + sim.rand() * 0.6;
    };
    this.list.push(a); return a;
  }

  // the looters: a leader in the office with the boat keys, the others in cover; two step out onto the portico
  looters(level, spots) {
    const sim = level.sim, out = [];
    for (const s of spots) {
      const z = sim.spawnZombie(null, { x: s.x, z: s.z, yaw: 0, hp: s.leader ? 150 : 70 });
      z.passive = true; z.speedMul = 0; z.noView = true; z.looter = true; z.dormant = null;
      const obj = marker(s.leader ? COL.leader : COL.looter); obj.position.set(s.x, 0, s.z); this.group.add(obj);
      const sight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), this.lineMat); sight.visible = false; this.group.add(sight);
      const a = { kind: 'looter', z, obj, sight, home: { x: s.x, z: s.z }, out: !!s.out, leader: !!s.leader, aim: 0, cd: 1 + sim.rand() * 1.5, wasAlive: true,
        get alive() { return z.alive; } };
      a.step = (dt, lv) => this.looterStep(a, dt, lv);
      this.list.push(a); out.push(a);
    }
    return out;
  }
  looterStep(a, dt, level) {
    const sim = level.sim, z = a.z, p = sim.player;
    if (!z.alive) {
      a.sight.visible = false;
      if (a.wasAlive) { a.wasAlive = false; a.onDeath?.(); }
      a.obj.rotation.x = Math.min(Math.PI / 2, a.obj.rotation.x + dt * 3);
      return;
    }
    z.x = a.home.x; z.z = a.home.z; z.vx = z.vz = 0; // (they hold their cover: the zombie AI never walks them)
    const dx = p.x - z.x, dz = p.z - z.z, d = Math.hypot(dx, dz), los = !p.dead && d < 17 && sim.world.lineOfSight(z.x, z.z, p.x, p.z, 1.3);
    z.yaw = Math.atan2(dx, dz); a.obj.position.set(z.x, 0, z.z); a.obj.rotation.y = z.yaw;
    if (!los) { a.aim = 0; a.sight.visible = false; a.cd = Math.max(a.cd, 0.4); return; }
    if ((a.cd -= dt) > 0) { a.sight.visible = false; return; }
    a.aim += dt; // the tell: a red line on Marc for 0.75 s, then the shot
    a.sight.visible = true;
    a.sight.geometry.setFromPoints([new THREE.Vector3(z.x, 1.35, z.z), new THREE.Vector3(p.x, 1.1, p.z)]);
    if (a.aim < 0.75) return;
    a.aim = 0; a.sight.visible = false; a.cd = 1.3 + sim.rand() * 1.1;
    const moving = Math.hypot(p.vx, p.vz) > 1.5, hit = sim.rand() < (moving ? 0.38 : 0.62) * (d < 6 ? 1.2 : 1);
    this.tracer(z.x, z.z, p.x + (hit ? 0 : (sim.rand() - 0.5) * 2), p.z + (hit ? 0 : (sim.rand() - 0.5) * 2));
    this.sound('shot', z.x, z.z, 0.9);
    if (hit) p.hurt(a.leader ? 12 : 9, z.x, z.z, sim);
  }

  // a warning shot at Marc's feet from a doorway
  warnShot(from, p) { this.tracer(from.x, from.z, p.x + 1.2, p.z + 0.8, 1.5); this.sound('shot', from.x, from.z, 1); this.sound('ricochet', p.x, p.z, 0.8); }

  update(dt) {
    for (const a of this.list) a.body?.update(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; if ((t.t -= dt) <= 0) { t.line.removeFromParent(); t.line.geometry.dispose(); this.tracers.splice(i, 1); } }
  }
}
