// Clip-driven characters (Tripo meshes on mixamorig skeletons, Mixamo + Tripo clips).
// Locomotion clips are blended by local velocity and played at the speed that matches actual travel
// (root motion stripped), so feet do not skate. Small additive corrections (aim alignment, recoil,
// hit flinch) are applied after the mixer in character ("container") space.
import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makePistol, makeBat } from './weaponModels.js';
import { BAT_SWING } from '../core/weapons.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (u) => u * u * (3 - 2 * u);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const LOWER = /Hips|UpLeg|Leg|Foot|Toe/;

function angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return d; }

// Remove horizontal root motion from the Hips position track (keep the vertical bob).
// Horizontal hips position is pinned to the skeleton's rest position (not the clip's first frame,
// which is off-centre in several Mixamo clips).
function stripRoot(clip, rest) {
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const v = t.values, x0 = rest ? rest.x : v[0], z0 = rest ? rest.z : v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}
function hipsRest(root) {
  let h = null; root.traverse((o) => { if (!h && o.isBone && /Hips$/.test(o.name)) h = o; });
  return h ? { x: h.position.x, z: h.position.z } : null;
}
function subClip(clip, keep, name) {
  const c = clip.clone(); c.name = name;
  c.tracks = c.tracks.filter((t) => keep(t.name.split('.')[0]));
  return c;
}

function makeBlob(r) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(20,30,40,0.45)'); gr.addColorStop(0.6, 'rgba(20,30,40,0.2)'); gr.addColorStop(1, 'rgba(20,30,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1;
  return m;
}

class Spring2 {
  constructor(k = 90, c = 11) { this.k = k; this.c = c; this.x = 0; this.z = 0; this.vx = 0; this.vz = 0; }
  kick(x, z) { this.vx += x; this.vz += z; }
  step(dt) { this.vx += (-this.k * this.x - this.c * this.vx) * dt; this.vz += (-this.k * this.z - this.c * this.vz) * dt; this.x += this.vx * dt; this.z += this.vz * dt; }
}

// Shared base: model in a yaw container, bone lookup, container-space bone rotation.
class ClipBody {
  constructor(scene, model, height, clips) {
    this.outer = new THREE.Group(); this.container = new THREE.Group(); this.outer.add(this.container);
    scene.add(this.outer);
    this.model = model; this.container.add(model);
    // the character is centred on its own origin (ignore any layout offset baked into the armature node)
    for (const ch of model.children) { ch.position.x = 0; ch.position.z = 0; }
    model.scale.setScalar(height); // Tripo meshes are exported 1.0 unit tall
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false; o.frustumCulled = false;
      // Tripo exports a metallic map; these are painted, matte characters
      const m = o.material; if (m.metalnessMap) m.metalnessMap = null; m.metalness = 0; m.roughness = Math.max(m.roughness, 0.6); m.needsUpdate = true;
    });
    this.bones = {};
    model.traverse((o) => { if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o; });
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
    this.blob = makeBlob(0.4); scene.add(this.blob);
  }
  act(name) { return this.actions[name]; }
  bone(n) { return this.bones[n]; }
  // rotate bone n by D given in container axes, on top of its current (animated) pose
  rotateC(n, D) {
    const b = this.bones[n]; if (!b) return;
    this.container.getWorldQuaternion(_q2);
    b.getWorldQuaternion(_q3);
    const W = _q2.invert().multiply(_q3); // bone orientation in container space
    _q.copy(W).invert().multiply(D).multiply(W);
    b.quaternion.multiply(_q);
    b.updateMatrixWorld(true);
  }
  rotateEulerC(n, x, y, z) { _q.setFromEuler(new THREE.Euler(x, y, z, 'YXZ')); this.rotateC(n, _q.clone()); }
  worldPos(n, out) { return this.bones[n].getWorldPosition(out); }
}

// ----------------------------------------------------------------------------------------------
export class YolaView extends ClipBody {
  constructor(scene, gltf, speeds, clipdata) {
    const H = 1.62;
    const clips = [];
    const rest = hipsRest(gltf.scene);
    const byName = Object.fromEntries(gltf.animations.map((c) => [c.name, stripRoot(c, rest)]));
    const batCalib = byName.bat_idle.clone(); batCalib.name = 'bat_calib';
    clips.push(batCalib);
    const loco = ['pistol_idle', 'pistol_walk', 'pistol_run', 'pistol_walk_back', 'pistol_run_back', 'pistol_strafe_left', 'pistol_strafe_right'];
    for (const n of loco) {
      clips.push(byName[n]); // full body (pistol held)
      clips.push(subClip(byName[n], (b) => LOWER.test(b), n + '_lower')); // legs only (bat held)
    }
    clips.push(subClip(byName.bat_idle, (b) => !LOWER.test(b), 'bat_idle_upper'));
    clips.push(byName.bat_swing, byName.death_fall, byName.death_defeat, byName.pistol_hit);
    super(scene, gltf.scene, H, clips);
    this.H = H;
    // native travel speeds (m/s) of each locomotion clip, measured in Blender
    const sc = H / 1.0;
    this.native = {};
    for (const n of loco) this.native[n] = speeds[n] ? speeds[n].speed * sc : 1;
    for (const n of loco) for (const suf of ['', '_lower']) { const a = this.act(n + suf); a.play(); a.setEffectiveWeight(0); }
    this.act('bat_idle_upper').play(); this.act('bat_idle_upper').setEffectiveWeight(0);
    const sw = this.act('bat_swing'); sw.play(); sw.setEffectiveWeight(0); sw.timeScale = 0;
    this.pistol = makePistol(1); this.bat = makeBat(BAT_SWING.fullLength);
    scene.add(this.pistol, this.bat);
    this.upperBlend = 0; // 0 = pistol arms, 1 = bat arms
    this.flinch = new Spring2(120, 13);
    this.prevHurt = 99; this.deathT = -1; this.yaw = Math.PI;
    this.muzzleWorld = new THREE.Vector3();
    this.batTip = new THREE.Vector3();
    this.weights = {};
    this.calibrateBatSocket(clipdata);
  }

  // Weapon socket on the right hand: the bat direction measured on the Mixamo reference skeleton
  // (clipdata.bat_idle[0].d, character space) expressed in this hand bone's own frame.
  calibrateBatSocket(clipdata) {
    const s0 = clipdata?.bat_idle?.[0];
    this.batSocket = null;
    if (!s0?.d) return;
    for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
    const cal = this.act('bat_calib'); cal.reset(); cal.play(); cal.time = 1 / 30; cal.setEffectiveWeight(1); // blender frame 1
    this.container.rotation.y = 0;
    this.mixer.update(0);
    this.container.updateMatrixWorld(true);
    this.container.getWorldQuaternion(_q2);
    this.bones.RightHand.getWorldQuaternion(_q3);
    const handC = _q2.invert().multiply(_q3); // hand orientation in character space
    this.batSocket = new THREE.Vector3(...s0.d).applyQuaternion(handC.invert()).normalize();
    cal.stop(); cal.setEffectiveWeight(0);
  }

  reset(x, z, yaw) {
    this.yaw = yaw; this.deathT = -1; this.outer.quaternion.identity();
    for (const n of ['death_fall', 'death_defeat']) { this.act(n).stop(); }
  }

  locoWeights(s) {
    // velocity in the aim frame
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const vF = s.vx * sn + s.vz * cs, vL = s.vx * cs - s.vz * sn; // forward, left
    const sp = Math.hypot(vF, vL);
    const w = { pistol_idle: 0, pistol_walk: 0, pistol_run: 0, pistol_walk_back: 0, pistol_run_back: 0, pistol_strafe_left: 0, pistol_strafe_right: 0 };
    const move = clamp(sp / 0.35, 0, 1);
    w.pistol_idle = 1 - move;
    if (move > 0) {
      const th = Math.atan2(vL, vF); // 0 forward, +pi/2 left
      const dirs = [[0, 'f'], [Math.PI / 2, 'l'], [Math.PI, 'b'], [-Math.PI / 2, 'r'], [-Math.PI, 'b']];
      const run = clamp((sp - 2.0) / 0.8, 0, 1);
      const put = (key, k) => {
        if (key === 'f') { w.pistol_walk += k * (1 - run); w.pistol_run += k * run; }
        else if (key === 'b') { w.pistol_walk_back += k * (1 - run); w.pistol_run_back += k * run; }
        else if (key === 'l') w.pistol_strafe_left += k;
        else w.pistol_strafe_right += k;
      };
      for (let i = 0; i < dirs.length - 1; i++) {
        const [a0, k0] = dirs[i], [a1, k1] = dirs[i + 1];
        const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
        if (th >= lo && th <= hi) {
          const u = (th - a0) / (a1 - a0);
          put(k0, (1 - u) * move); put(k1, u * move); break;
        }
      }
    }
    // play each clip at the rate that matches actual travel speed
    for (const n in w) if (n !== 'pistol_idle' && w[n] > 0) this.rate(n, clamp(sp / this.native[n], 0.55, 1.9));
    return w;
  }
  rate(n, r) { this.act(n).timeScale = r; this.act(n + '_lower').timeScale = r; }

  update(dt, s) {
    this.outer.position.set(s.x, 0, s.z);
    this.blob.position.set(s.x, 0.012, s.z);
    if (s.dead) { this.die(dt, s); return; }
    this.yaw = s.aimYaw;
    this.container.rotation.y = this.yaw;

    const w = this.locoWeights(s);
    // upper body: pistol vs bat, cross-faded through the swap
    const wantBat = s.equipped === 'bat' ? 1 : 0;
    this.upperBlend += clamp(wantBat - this.upperBlend, -dt / Math.max(0.05, s.swapDur * 0.6), dt / Math.max(0.05, s.swapDur * 0.6));
    const ub = smooth(this.upperBlend);
    const swinging = s.action === 'swing';
    // swing: full-body clip driven by simulation time (exact sync with the hit test)
    const sw = this.act('bat_swing');
    let swingW = 0;
    let turn = 0;
    if (swinging) {
      const B = BAT_SWING, t = s.swingT, tEnd = (B.clipEndFrame - B.clipStartFrame) / (B.fps * B.rate);
      // clip frame follows the simulation's swing time exactly; it holds at the last two-handed frame
      sw.time = (B.clipStartFrame + Math.min(t, tEnd) * B.fps * B.rate) / B.fps; // glTF time = blender frame / fps
      swingW = clamp(t / 0.05, 0, 1) * (t <= tEnd ? 1 : smooth(clamp(1 - (t - tEnd) / (B.duration - tEnd), 0, 1)));
      // step into the swing: turn so the sweep lands on the aim, then turn back during recovery
      turn = B.yawOffset * smooth(clamp(t / 0.1, 0, 1)) * (t <= tEnd ? 1 : smooth(clamp(1 - (t - tEnd) / (B.duration - tEnd), 0, 1)));
    }
    this.container.rotation.y = this.yaw + turn;
    const sW = swingW;
    sw.setEffectiveWeight(sW);
    for (const n in w) {
      this.act(n).setEffectiveWeight(w[n] * (1 - ub) * (1 - sW));
      this.act(n + '_lower').setEffectiveWeight(w[n] * ub * (1 - sW));
    }
    this.act('bat_idle_upper').setEffectiveWeight(ub * (1 - sW));
    this.mixer.update(dt);
    // keep the synced swing frame exact after the mixer advanced it
    this.container.updateMatrixWorld(true);

    // ---- corrections after the mixer ----
    if (s.hurtT < this.prevHurt) { const l = this.toLocal(s.hurtDirX, s.hurtDirZ); this.flinch.kick(l.x * 3.5, l.z * 3.5); }
    this.prevHurt = s.hurtT;
    this.flinch.step(dt);
    const f = this.flinch;
    if (Math.abs(f.x) + Math.abs(f.z) > 1e-3) this.rotateEulerC('Spine1', f.z * 0.6, 0, -f.x * 0.5);
    if (!ub || ub < 1) this.aimPistol(s, ub);
    this.placeWeapons(s, ub);
  }

  toLocal(x, z) { const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw); return { x: x * cs - z * sn, z: x * sn + z * cs }; }

  grip(side, out) {
    // between the wrist and the middle-finger knuckle
    this.bones[side + 'Hand'].getWorldPosition(out);
    this.bones[side + 'HandMiddle1'].getWorldPosition(_v4);
    return out.add(_v4).multiplyScalar(0.5);
  }

  // Turn the chest so the gun points exactly along the simulation's aim, then add recoil.
  aimPistol(s, ub) {
    const k = 1 - ub;
    this.grip('Right', _v); this.grip('Left', _v2);
    this.bones.RightArm.getWorldPosition(_v3); this.bones.LeftArm.getWorldPosition(_v4);
    const hx = (_v.x + _v2.x) / 2 - (_v3.x + _v4.x) / 2, hz = (_v.z + _v2.z) / 2 - (_v3.z + _v4.z) / 2;
    const err = angleDiff(Math.atan2(hx, hz), s.aimYaw);
    const kick = s.recoil * s.recoil * s.recoilScale;
    const reload = s.action === 'reload' ? Math.sin(Math.PI * clamp(s.actionT / s.reloadDur, 0, 1)) : 0;
    this.rotateEulerC('Spine2', (-0.09 * kick + 0.35 * reload) * k, clamp(err, -0.6, 0.6) * k, 0);
    if (kick > 0.01) { this.rotateEulerC('RightArm', -0.25 * kick * k, 0, 0); this.rotateEulerC('LeftArm', -0.25 * kick * k, 0, 0); }
  }

  placeWeapons(s, ub) {
    const showBat = ub > 0.5;
    this.pistol.visible = !showBat; this.bat.visible = showBat;
    this.grip('Right', _v); this.grip('Left', _v2);
    if (!showBat) {
      // pistol: grip in the right hand, barrel along the arms' line toward the target
      this.bones.RightArm.getWorldPosition(_v3); this.bones.LeftArm.getWorldPosition(_v4);
      const mid = _v3.add(_v4).multiplyScalar(0.5);
      const dir = _v4.copy(_v).add(_v2).multiplyScalar(0.5).sub(mid).normalize();
      this.pistol.position.copy(_v);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      this.pistol.quaternion.copy(_q);
      // keep the slide upright (no roll)
      const yawOnly = Math.atan2(dir.x, dir.z), pitch = -Math.asin(clamp(dir.y, -1, 1));
      this.pistol.rotation.set(pitch, yawOnly, 0, 'YXZ');
      this.pistol.updateMatrixWorld(true);
      this.pistol.userData.muzzle.getWorldPosition(this.muzzleWorld);
    } else {
      // bat: direction from the right-hand socket (as on the reference skeleton), origin between the hands
      let dir;
      if (this.batSocket) { this.bones.RightHand.getWorldQuaternion(_q); dir = _v3.copy(this.batSocket).applyQuaternion(_q).normalize(); }
      else dir = _v3.copy(_v).sub(_v2).normalize();
      this.bat.position.copy(_v).add(_v2).multiplyScalar(0.5);
      this.bat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      this.bat.updateMatrixWorld(true);
      this.bat.userData.tip.getWorldPosition(this.batTip);
    }
  }

  die(dt, s) {
    if (this.deathT < 0) {
      this.deathT = 0;
      for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
      const d = this.act('death_fall'); d.reset(); d.setLoop(THREE.LoopOnce); d.clampWhenFinished = true; d.setEffectiveWeight(1); d.play();
      this.pistol.visible = this.bat.visible = false;
    }
    this.deathT += dt;
    this.mixer.update(dt);
  }
}

// ----------------------------------------------------------------------------------------------
export class ZombieView extends ClipBody {
  constructor(scene, gltf, height, speeds) {
    const model = skClone(gltf.scene);
    const mats = [];
    model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); } });
    const rest = hipsRest(gltf.scene);
    const clips = gltf.animations.map((c) => stripRoot(c.clone(), rest));
    super(scene, model, height, clips);
    this.mats = mats;
    this.nativeWalk = (speeds?.speed || 0.17) * height;
    for (const n of ['walk', 'idle']) { this.act(n).play(); this.act(n).setEffectiveWeight(0); }
    for (const n of ['attack', 'hit_flinch', 'hit_stumble', 'death_back', 'death_forward']) {
      const a = this.act(n); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true;
    }
    this.react = new Spring2(70, 9);
    this.oneShot = null; this.lastSeq = 0; this.lastState = ''; this.id = -1;
  }

  bind(z) {
    this.id = z.id; this.lastSeq = z.hitSeq; this.lastState = ''; this.outer.visible = this.blob.visible = true;
    this.outer.position.y = 0; this.oneShot = null; this.deathYaw = null;
    for (const a of Object.values(this.actions)) { a.stop(); a.setEffectiveWeight(0); }
    for (const n of ['walk', 'idle']) { this.act(n).play(); this.act(n).time = Math.random() * this.act(n).getClip().duration; }
    this.react.x = this.react.z = this.react.vx = this.react.vz = 0;
  }
  hide() { this.outer.visible = false; this.blob.visible = false; this.id = -1; this.mixer.stopAllAction(); }

  playOnce(name, from = 0, rate = 1) {
    if (this.oneShot && this.oneShot !== this.act(name)) this.oneShot.fadeOut(0.08);
    const a = this.act(name);
    a.reset(); a.time = from; a.timeScale = rate; a.setEffectiveWeight(1); a.fadeIn(0.08); a.play();
    this.oneShot = a;
  }

  update(dt, z, x, zz) {
    this.outer.position.x = x; this.outer.position.z = zz;
    this.blob.position.set(x, 0.012, zz);
    const dying = z.state === 'dying' || z.state === 'dead';
    // state transitions -> clips (attack timed so the swipe lands at the end of the windup)
    if (z.state !== this.lastState) {
      const S = z.state;
      if (S === 'windup') this.playOnce('attack', 8 / 30, (33 - 8) / 30 / Math.max(0.2, z.stateDur));
      else if (S === 'stagger') this.playOnce(z.hitKind === 'bat' ? 'hit_stumble' : 'hit_flinch', z.hitKind === 'bat' ? 0.1 : 0.15, z.hitKind === 'bat' ? 1.3 : 1.6);
      else if (S === 'dying') {
        // fall along the blow: face against the hit and fall back, or with it and fall forward
        const along = Math.cos(angleDiff(z.yaw, z.deathYaw));
        const back = along < 0;
        this.deathYaw = back ? z.deathYaw + Math.PI : z.deathYaw;
        this.playOnce(back ? 'death_back' : 'death_forward', back ? 0.25 : 0.35, 1.25);
      } else if ((S === 'chase' || S === 'emerge') && this.oneShot && this.lastState !== 'strike' && this.lastState !== 'windup') { this.oneShot.fadeOut(0.2); this.oneShot = null; }
      else if (S === 'chase' && this.oneShot) { this.oneShot.fadeOut(0.25); this.oneShot = null; }
      this.lastState = S;
    }
    // facing (deaths turn quickly to align the fall with the hit)
    if (this.deathYaw != null) this.container.rotation.y += angleDiff(this.container.rotation.y, this.deathYaw) * Math.min(1, dt * 14);
    else this.container.rotation.y = z.yaw;

    // locomotion: walk at the rate that matches travel, idle when standing
    const sp = Math.hypot(z.vx, z.vz);
    const move = clamp(sp / 0.25, 0, 1);
    const one = this.oneShot ? this.oneShot.getEffectiveWeight() : 0;
    this.act('walk').setEffectiveWeight(move * (1 - one));
    this.act('idle').setEffectiveWeight((1 - move) * (1 - one));
    this.act('walk').timeScale = clamp(sp / this.nativeWalk, 0.5, 3.2);
    this.mixer.update(dt);
    this.container.updateMatrixWorld(true);

    // small directional jolt on every hit (the clip gives the body reaction; this gives direction)
    if (z.hitSeq !== this.lastSeq) {
      this.lastSeq = z.hitSeq;
      const sn = Math.sin(this.container.rotation.y), cs = Math.cos(this.container.rotation.y);
      const lx = z.hitDirX * cs - z.hitDirZ * sn, lz = z.hitDirX * sn + z.hitDirZ * cs;
      const k = (z.hitKind === 'bat' ? 0.5 : 0.35) * Math.min(5, z.hitStrength);
      this.react.kick(lx * k, lz * k);
    }
    this.react.step(dt);
    if (!dying && Math.abs(this.react.x) + Math.abs(this.react.z) > 1e-3) this.rotateEulerC('Spine1', this.react.z * 0.7, 0, -this.react.x * 0.6);
    const fl = z.hitFlash;
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(fl * 0.5, fl * 0.45, fl * 0.38);
    // corpse sinks away after a while
    if (z.state === 'dead' && z.corpseT > 4.5) this.outer.position.y = -Math.min(1, (z.corpseT - 4.5) / 2) * 0.6;
    this.blob.visible = z.state !== 'dead' || z.corpseT < 4.5;
  }
}
