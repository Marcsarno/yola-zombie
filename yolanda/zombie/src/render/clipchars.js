// Clip-driven characters (Tripo meshes on mixamorig skeletons, Mixamo + Tripo clips).
// Locomotion clips are blended by local velocity and played at the speed that matches actual travel
// (root motion stripped), so feet do not skate. Small additive corrections (aim alignment, recoil,
// hit flinch) are applied after the mixer in character ("container") space.
import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makePistol, prepShotgun, prepAxe } from './weaponModels.js';
import { AXE_ATTACKS, SHOTGUN_SPEC, isMelee } from '../core/weapons.js';
import { describeRagdoll, RagdollDriver, SEVER_PART, frameQuat } from './physics/ragdoll.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (u) => u * u * (3 - 2 * u);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
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
// Exported clips start at Blender frame 1 = 1/30 s, so a looping clip played from 0 holds its first
// pose for a frame every cycle (a hitch at each loop). Shift looping clips to start at 0.
// (One-shot clips keep their frame-based timing: glTF time = Blender frame / 30.)
function loopClip(clip) {
  const t0 = Math.min(...clip.tracks.map((t) => t.times[0]));
  const done = new Set(); // the glTF loader shares one times array between tracks of a sampler
  if (t0 > 0) for (const t of clip.tracks) {
    if (done.has(t.times)) continue;
    done.add(t.times);
    for (let i = 0; i < t.times.length; i++) t.times[i] -= t0;
  }
  clip.resetDuration();
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
// Locomotion clips: travel direction in character space (x = left, z = forward) and gait family.
const LOCO = {
  pistol_walk: { dir: [0, 1] }, pistol_run: { dir: [0, 1] },
  pistol_walk_back: { dir: [0, -1] }, pistol_run_back: { dir: [0, -1] },
  pistol_strafe_left: { dir: [1, 0] }, pistol_strafe_run_left: { dir: [1, 0] },
  pistol_strafe_right: { dir: [-1, 0] }, pistol_strafe_run_right: { dir: [-1, 0] },
};
// walk and run clip for each travel direction key (f, b, l = left, r = right)
const GAIT = { f: ['pistol_walk', 'pistol_run'], b: ['pistol_walk_back', 'pistol_run_back'], l: ['pistol_strafe_left', 'pistol_strafe_run_left'], r: ['pistol_strafe_right', 'pistol_strafe_run_right'] };

export class YolaView extends ClipBody {
  constructor(scene, gltf, clipdata, weapons) {
    const H = 1.62;
    const clips = [];
    const rest = hipsRest(gltf.scene);
    const byName = Object.fromEntries(gltf.animations.map((c) => [c.name, stripRoot(c, rest)]));
    const batCalib = byName.bat_idle.clone(); batCalib.name = 'bat_calib';
    clips.push(batCalib);
    const loco = ['pistol_idle', ...Object.keys(LOCO)];
    for (const n of [...loco, 'bat_idle']) loopClip(byName[n]);
    for (const n of loco) {
      clips.push(byName[n]); // full body (pistol held)
      clips.push(subClip(byName[n], (b) => LOWER.test(b), n + '_lower')); // legs only (bat held)
    }
    clips.push(subClip(byName.bat_idle, (b) => !LOWER.test(b), 'bat_idle_upper'));
    clips.push(subClip(byName.pistol_reload, (b) => !LOWER.test(b), 'pistol_reload_upper'));
    // shotgun: held low-ready as the rifle reload starts (frame 1; the rifle aiming idle does not fit
    // Yola's shorter arms), and that clip is the reload
    clips.push(subClip(byName.reload_rifle_stand, (b) => !LOWER.test(b), 'shotgun_hold_upper'));
    clips.push(subClip(byName.reload_rifle_stand, (b) => !LOWER.test(b), 'shotgun_reload_upper'));
    const melee = [...new Set(AXE_ATTACKS.map((A) => A.clip))];
    clips.push(...melee.map((n) => byName[n]), byName.death_fall, byName.death_defeat, byName.pistol_hit);
    super(scene, gltf.scene, H, clips);
    this.H = H;
    // rest rotations: every frame starts from these, so the corrections applied after the mixer (aim,
    // hip turn, IK) never pile up on bones that the current clips do not key (constant tracks are
    // dropped at export, e.g. a spine bone the shotgun hold never moves)
    this.restQ = Object.values(this.bones).map((b) => [b, b.quaternion.clone()]);
    for (const n of loco) for (const suf of ['', '_lower']) { const a = this.act(n + suf); a.play(); a.setEffectiveWeight(0); }
    this.gait = this.measureGaits();
    // moving clips are driven from one shared gait phase (see locoWeights), not by the mixer clock
    for (const n in LOCO) for (const suf of ['', '_lower']) this.act(n + suf).timeScale = 0;
    this.phase = 0; this.sv = { x: 0, z: 0 };
    this.act('bat_idle_upper').play(); this.act('bat_idle_upper').setEffectiveWeight(0);
    const rl = this.act('pistol_reload_upper'); rl.play(); rl.setEffectiveWeight(0); rl.timeScale = 0;
    this.reloadFrames = Math.round(byName.pistol_reload.duration * 30); // Blender frames 1..N
    for (const n of melee) { const sw = this.act(n); sw.play(); sw.setEffectiveWeight(0); sw.timeScale = 0; }
    this.meleeClips = melee;
    for (const n of ['shotgun_hold_upper', 'shotgun_reload_upper']) { const a = this.act(n); a.play(); a.setEffectiveWeight(0); a.timeScale = 0; a.time = 1 / 30; }
    this.shotgunReloadFrames = Math.round(byName.reload_rifle_stand.duration * 30);
    // upper-body layers ride on the legs' hips; each keeps the hip rotation of its own source clip so
    // the torso is not tipped by a running lean or a turned strafe pelvis (see rebaseUpper)
    const hipsTrack = (c) => c.tracks.find((t) => /Hips.quaternion$/.test(t.name));
    this.upperHips = {};
    for (const [n, src] of [['shotgun_reload_upper', 'reload_rifle_stand'], ['pistol_reload_upper', 'pistol_reload']]) {
      const t = hipsTrack(byName[src]); if (t) this.upperHips[n] = t.createInterpolant(new Float32Array(4));
    }
    this.pistol = makePistol(1);
    this.shotgun = prepShotgun(weapons.shotgun);
    this.melee = prepAxe(weapons.axe);
    scene.add(this.pistol, this.shotgun, this.melee);
    this.up = { pistol: 1, shotgun: 0, axe: 0 }; // upper-body hold weights, cross-faded through swaps
    this.flinch = new Spring2(120, 13);
    this.prevHurt = 99; this.deathT = -1; this.yaw = Math.PI;
    this.muzzleWorld = new THREE.Vector3();
    this.batTip = new THREE.Vector3();
    this.weights = {};
    this.calibrateBatSocket(clipdata);
    this.calibratePistolSocket();
    this.calibrateShotgunSocket();
    this.calibrateMeleeSockets(clipdata);
    this.bladeQ = new THREE.Quaternion(); this.prevTip = new THREE.Vector3(); this.bladeInit = false;
  }

  // Axe socket for each attack: the handle direction sampled in Blender (clipdata[path].d at the attack's
  // first frame, character space; each clip family grips differently) expressed in this hand's frame.
  calibrateMeleeSockets(clipdata) {
    this.meleeSocket = {};
    for (const A of AXE_ATTACKS) {
      const smp = clipdata?.[A.path]?.find((q) => q.f === A.f0);
      if (!smp?.d) continue;
      for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
      const act = this.act(A.clip); act.time = A.f0 / 30; act.setEffectiveWeight(1);
      this.container.rotation.y = 0; this.outer.position.set(0, 0, 0);
      this.mixer.update(0); this.container.updateMatrixWorld(true);
      this.container.getWorldQuaternion(_q2); this.bones.RightHand.getWorldQuaternion(_q3);
      const handC = _q2.invert().multiply(_q3);
      this.meleeSocket[A.name] = new THREE.Vector3(...smp.d).applyQuaternion(handC.invert()).normalize();
      act.setEffectiveWeight(0);
    }
  }

  // Shotgun socket on the right hand: in the hold pose the barrel runs from the right hand to the left
  // (which cups the pump), kept level side to side. The left hand is put on the pump by IK each frame.
  calibrateShotgunSocket() {
    for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
    const h = this.act('shotgun_hold_upper'), id = this.act('pistol_idle_lower');
    h.time = 1 / 30; h.setEffectiveWeight(1); id.time = 0; id.setEffectiveWeight(1);
    this.container.rotation.y = 0; this.outer.position.set(0, 0, 0);
    this.mixer.update(0); this.outer.updateMatrixWorld(true);
    this.grip('Right', _v); this.grip('Left', _v2);
    const barrel = _v2.clone().sub(_v).normalize();
    this.shotgunQ(barrel, _q);
    this.bones.RightHand.getWorldQuaternion(_q2);
    this.shotgunSocket = _q2.invert().multiply(_q).clone();
    this.shotgunHoldSpan = _v2.distanceTo(_v);
    h.setEffectiveWeight(0); id.setEffectiveWeight(0);
  }
  // gun frame: local +X along the barrel, +Y up (no roll)
  shotgunQ(barrel, out) {
    const x = _v3.copy(barrel).normalize();
    const z = _v4.crossVectors(x, UP).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  // Two-bone IK (shoulder - elbow - hand) in world space: the hand reaches target (weight w), the
  // elbow bends in its current plane, the hand keeps its world orientation.
  ikArm(side, target, w) {
    if (w <= 1e-3) return;
    const up = this.bones[side + 'Arm'], lo = this.bones[side + 'ForeArm'], hand = this.bones[side + 'Hand'];
    const a = up.getWorldPosition(new THREE.Vector3()), b = lo.getWorldPosition(new THREE.Vector3()), c = hand.getWorldPosition(new THREE.Vector3());
    const t = c.clone().lerp(target, w);
    const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
    const lab = b.distanceTo(a), lcb = c.distanceTo(b), lat = clamp(t.distanceTo(a), 0.01, lab + lcb - 1e-3);
    const ac = c.clone().sub(a).normalize(), ab = b.clone().sub(a).normalize(), ba = a.clone().sub(b).normalize(), bc = c.clone().sub(b).normalize(), at = t.clone().sub(a).normalize();
    const acos = (x) => Math.acos(clamp(x, -1, 1));
    const ac_ab0 = acos(ac.dot(ab)), ba_bc0 = acos(ba.dot(bc)), ac_at0 = acos(ac.dot(at));
    const ac_ab1 = acos((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)), ba_bc1 = acos((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb));
    let ax0 = new THREE.Vector3().crossVectors(ac, ab);
    if (ax0.lengthSq() < 1e-8) ax0.set(0, 1, 0); ax0.normalize();
    const ax1 = new THREE.Vector3().crossVectors(ac, at);
    const worldRot = (bone, R) => { // bone world rotation R * W
      const W = bone.getWorldQuaternion(new THREE.Quaternion()), P = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(P.invert().multiply(R).multiply(W)); bone.updateMatrixWorld(true);
    };
    worldRot(lo, new THREE.Quaternion().setFromAxisAngle(ax0, ba_bc1 - ba_bc0));
    const r = new THREE.Quaternion().setFromAxisAngle(ax0, ac_ab1 - ac_ab0);
    if (ax1.lengthSq() > 1e-10) r.premultiply(new THREE.Quaternion().setFromAxisAngle(ax1.normalize(), ac_at0));
    worldRot(up, r);
    const P = hand.parent.getWorldQuaternion(new THREE.Quaternion());
    hand.quaternion.copy(P.invert().multiply(handQ)); hand.updateMatrixWorld(true);
  }

  // Pistol socket on the right hand: the gun's orientation in the aiming pose (barrel along the
  // arms, slide upright) expressed in the hand bone's frame, so the gun follows the hand when the
  // hands leave the aim (reload).
  calibratePistolSocket() {
    for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
    const id = this.act('pistol_idle'); id.time = 0; id.setEffectiveWeight(1);
    this.container.rotation.y = 0; this.outer.position.set(0, 0, 0);
    this.mixer.update(0); this.outer.updateMatrixWorld(true);
    this.aimQuat(_q);
    this.bones.RightHand.getWorldQuaternion(_q2);
    this.pistolSocket = _q2.invert().multiply(_q).clone();
    id.setEffectiveWeight(0);
  }
  // pistol orientation from the arms: barrel along shoulders -> hands, slide upright (no roll)
  aimQuat(out) {
    this.grip('Right', _v); this.grip('Left', _v2);
    this.bones.RightArm.getWorldPosition(_v3); this.bones.LeftArm.getWorldPosition(_v4);
    const mid = _v3.add(_v4).multiplyScalar(0.5);
    const dir = _v4.copy(_v).add(_v2).multiplyScalar(0.5).sub(mid).normalize();
    const yawOnly = Math.atan2(dir.x, dir.z), pitch = -Math.asin(clamp(dir.y, -1, 1));
    return out.setFromEuler(_e.set(pitch, yawOnly, 0, 'YXZ'));
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
    this.backMode = false; this.backBlend = 0; this.hipYaw = 0; this.sv.x = this.sv.z = 0; this.spS = 0; this.lw = null;
    for (const n of ['death_fall', 'death_defeat']) { this.act(n).stop(); }
  }

  // Measure each locomotion clip on this skeleton: planted-foot speed (m/s, = travel speed with no
  // skating), stride per cycle, and the phase at which the left foot reaches furthest along travel.
  measureGaits() {
    const out = {}, L = new THREE.Vector3(), LT = new THREE.Vector3(), R = new THREE.Vector3(), RT = new THREE.Vector3();
    const all = Object.values(this.actions);
    this.container.rotation.y = 0; this.outer.position.set(0, 0, 0);
    for (const n in LOCO) {
      for (const a of all) a.setEffectiveWeight(0);
      const a = this.act(n); a.setEffectiveWeight(1); a.timeScale = 0;
      const D = a.getClip().duration, N = 90, [dx, dz] = LOCO[n].dir, rows = [];
      for (let i = 0; i < N; i++) {
        a.time = (D * i) / N; this.mixer.update(0); this.outer.updateMatrixWorld(true);
        this.worldPos('LeftFoot', L); this.worldPos('LeftToeBase', LT); this.worldPos('RightFoot', R); this.worldPos('RightToeBase', RT);
        rows.push({ L: L.x * dx + L.z * dz, R: R.x * dx + R.z * dz, ly: Math.min(L.y, LT.y), ry: Math.min(R.y, RT.y) });
      }
      const vel = [];
      for (const [p, y] of [['L', 'ly'], ['R', 'ry']]) {
        const minY = Math.min(...rows.map((r) => r[y]));
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          if (rows[i][y] < minY + 0.02 && rows[j][y] < minY + 0.02) vel.push(-(rows[j][p] - rows[i][p]) / (D / N));
        }
      }
      vel.sort((p, q) => p - q);
      const speed = vel.length ? vel[vel.length >> 1] : 1;
      let lead = 0, best = -1e9;
      rows.forEach((r, i) => { if (r.L > best) { best = r.L; lead = i / N; } });
      out[n] = { speed, dur: D, stride: speed * D, lead };
    }
    for (const a of all) a.setEffectiveWeight(0);
    return out;
  }

  // Blend weights for the locomotion clips from velocity in the aim frame. All moving clips share one
  // gait phase (left-foot lead aligned), advanced by distance travelled / blended stride, so blended
  // clips never put the feet in different places and the planted foot stays planted.
  // Front half: forward and side clips are blended (the running strafes turn the pelvis toward travel,
  // like the forward run). Back half: the back clips play with the hips turned toward the travel
  // direction (torso counter-turned in update) - blending a back-run with a pelvis-turned strafe makes
  // the legs swing against each other. The switch between halves has hysteresis and a short crossfade.
  locoWeights(s, dt) {
    // smoothed speed and smoothed direction pick the blend (smoothed separately, so a quick reversal
    // does not dip to idle while the velocity vector passes through zero); raw speed drives the stride
    const k = Math.min(1, dt * 14), sp = Math.hypot(s.vx, s.vz);
    this.sv.x += (s.vx - this.sv.x) * k; this.sv.z += (s.vz - this.sv.z) * k;
    this.spS = (this.spS || 0) + (sp - (this.spS || 0)) * Math.min(1, dt * (sp > (this.spS || 0) ? 10 : 16));
    const svl = Math.hypot(this.sv.x, this.sv.z);
    if (svl > 0.05) { this.dirX = this.sv.x / svl; this.dirZ = this.sv.z / svl; }
    else if (sp > 0.05) { this.dirX = s.vx / sp; this.dirZ = s.vz / sp; }
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw), dx = this.dirX || 0, dz = this.dirZ || 1;
    const spS = this.spS, vF = (dx * sn + dz * cs) * spS, vL = (dx * cs - dz * sn) * spS; // forward, left
    const w = { pistol_idle: 0 };
    for (const n in LOCO) w[n] = 0;
    const move = clamp(spS / 0.35, 0, 1);
    w.pistol_idle = 1 - move;
    let hipYaw = 0;
    if (move > 0) {
      const th = Math.atan2(vL, vF), ath = Math.abs(th);
      if (!this.backMode && ath > 1.95) this.backMode = true; // ~112 deg
      else if (this.backMode && ath < 1.2) this.backMode = false; // ~69 deg
      this.backBlend = clamp((this.backBlend || 0) + (this.backMode ? dt : -dt) / 0.15, 0, 1);
      const mb = smooth(this.backBlend);
      const put = (key, kk) => {
        const [walk, run] = GAIT[key], g0 = this.gait[walk], g1 = this.gait[run];
        const r = smooth(clamp((spS - g0.speed) / Math.max(0.3, g1.speed - g0.speed), 0, 1));
        w[walk] += kk * (1 - r); w[run] += kk * r;
      };
      if (mb < 1) {
        // front half: clamp travel to the front arc and blend forward <-> side
        const tf = clamp(th, -Math.PI / 2, Math.PI / 2);
        const [a0, k0, a1, k1] = tf >= 0 ? [0, 'f', Math.PI / 2, 'l'] : [0, 'f', -Math.PI / 2, 'r'];
        const u = smooth((tf - a0) / (a1 - a0));
        put(k0, (1 - u) * move * (1 - mb)); put(k1, u * move * (1 - mb));
      }
      if (mb > 0) {
        put('b', move * mb);
        hipYaw = angleDiff(Math.PI, th) * mb; // turn the back clip's travel onto the actual travel
      }
    }
    // rate-limit every weight (a full swap takes >= 0.12 s) and the hip turn, so direction flips
    // (e.g. strafing right -> left) crossfade instead of snapping
    const lw = (this.lw ||= {}), maxW = dt / 0.12;
    let ws = 0, stride = 0;
    for (const n in w) {
      lw[n] = (lw[n] ?? w[n]) + clamp(w[n] - (lw[n] ?? w[n]), -maxW, maxW);
      if (LOCO[n] && lw[n] > 0) { ws += lw[n]; stride += lw[n] * this.gait[n].stride; }
    }
    const tot = Object.values(lw).reduce((a, b) => a + b, 0) || 1;
    for (const n in lw) lw[n] /= tot;
    this.hipYaw = (this.hipYaw || 0) + clamp(hipYaw - (this.hipYaw || 0), -dt * 9, dt * 9);
    if (ws > 1e-3) this.phase = (this.phase + (sp * dt) / (stride / ws)) % 1;
    for (const n in LOCO) {
      if (!lw[n]) continue;
      const g = this.gait[n], t = ((this.phase + g.lead) % 1) * g.dur;
      this.act(n).time = t; this.act(n + '_lower').time = t;
    }
    return lw;
  }

  update(dt, s) {
    this.outer.position.set(s.x, 0, s.z);
    this.blob.position.set(s.x, 0.012, s.z);
    if (s.dead) { this.die(dt, s); return; }
    this.yaw = s.aimYaw;
    this.container.rotation.y = this.yaw;

    const w = this.locoWeights(s, dt);
    // upper body: pistol / shotgun / axe holds, cross-faded through the swap
    const rate = dt / Math.max(0.05, s.swapDur * 0.6);
    for (const k in this.up) this.up[k] += clamp((s.equipped === k ? 1 : 0) - this.up[k], -rate, rate);
    const uP0 = smooth(this.up.pistol), uS0 = smooth(this.up.shotgun), uA0 = smooth(this.up.axe), un = uP0 + uS0 + uA0 || 1;
    const uP = uP0 / un, uS = uS0 / un, uA = uA0 / un;
    // axe attacks: full-body clips driven by the simulation's attack time (exact sync with the hit test)
    let sW = 0, turn = 0;
    const A = s.action === 'swing' ? AXE_ATTACKS[s.combo] : null;
    if (A) {
      const t = s.swingT, tEnd = (A.f1 - A.f0) / (A.fps * A.rate), act = this.act(A.clip);
      if (this.swingId !== s.swingId) {
        // next attack of the combo: the previous clip fades out under the new one
        if (this.swingAct && this.swingAct !== act) { this.prevSwing = this.swingAct; this.prevSwingW = this.swingW || 1; this.prevSwingName = this.swingName; }
        this.swingId = s.swingId; this.swingAct = act; this.swingName = A.name;
      }
      act.time = (A.f0 + Math.min(t, tEnd) * A.fps * A.rate) / A.fps; // glTF time = blender frame / fps
      const ramp = clamp(t / (this.prevSwing ? 0.1 : 0.05), 0, 1);
      const out = t <= tEnd ? 1 : smooth(clamp(1 - (t - tEnd) / (A.duration - tEnd), 0, 1));
      sW = ramp * out;
      // step into the attack: turn so it lands on the aim, then turn back during recovery
      turn = A.yawOffset * smooth(clamp(t / 0.1, 0, 1)) * out;
      if (this.prevSwing) {
        const pw = this.prevSwingW * (1 - ramp);
        this.prevSwing.setEffectiveWeight(pw);
        if (pw <= 1e-3) { this.prevSwing.setEffectiveWeight(0); this.prevSwing = null; }
      }
      // the turn carries over from the previous attack instead of snapping
      if (this.prevTurn != null && t < 0.1) turn = this.prevTurn + (turn - this.prevTurn) * smooth(t / 0.1);
      else this.prevTurn = null;
    } else {
      this.swingAct = null; this.swingId = -1;
      if (this.prevSwing) { this.prevSwing.setEffectiveWeight(0); this.prevSwing = null; }
    }
    this.swingW = sW;
    if (A && s.swingT >= 0.1) this.lastTurn = turn;
    if (A && this.prevTurn == null && s.swingT < 0.02 && s.combo > 0) this.prevTurn = this.lastTurn || 0;
    for (const n of this.meleeClips) { const a = this.act(n); if (a !== this.swingAct && a !== this.prevSwing) a.setEffectiveWeight(0); }
    if (A) this.swingAct.setEffectiveWeight(sW);
    this.container.rotation.y = this.yaw + turn;
    // reloads: upper-body clips driven by the simulation's reload time, legs keep the locomotion
    let rW = 0;
    if (s.action === 'reload') {
      const sg = s.equipped === 'shotgun', u = clamp(s.actionT / s.reloadDur, 0, 1);
      const rl = this.act(sg ? 'shotgun_reload_upper' : 'pistol_reload_upper');
      rl.time = (1 + u * ((sg ? this.shotgunReloadFrames : this.reloadFrames) - 1)) / 30;
      rW = smooth(clamp(s.actionT / 0.08, 0, 1)) * smooth(clamp((1 - u) / 0.12, 0, 1));
    }
    this.reloadW = rW;
    const rP = s.equipped === 'pistol' ? rW : 0, rS = s.equipped === 'shotgun' ? rW : 0;
    const k = 1 - sW;
    this.act('pistol_reload_upper').setEffectiveWeight(rP * uP * k);
    this.act('shotgun_reload_upper').setEffectiveWeight(rS * uS * k);
    this.act('shotgun_hold_upper').setEffectiveWeight((1 - rS) * uS * k);
    this.act('bat_idle_upper').setEffectiveWeight(uA * k);
    for (const n in w) {
      this.act(n).setEffectiveWeight(w[n] * uP * (1 - rP) * k);
      this.act(n + '_lower').setEffectiveWeight(w[n] * (uS + uA + uP * rP) * k);
    }
    for (const [b, q] of this.restQ) b.quaternion.copy(q);
    this.mixer.update(dt);
    this.container.updateMatrixWorld(true);

    // ---- corrections after the mixer ----
    this.rebaseUpper();
    // back-half locomotion: legs turned toward travel, torso turned back onto the aim
    const hy = this.hipYaw * (1 - sW);
    if (Math.abs(hy) > 1e-3) {
      _q4.setFromAxisAngle(UP, hy); this.rotateC('Hips', _q4);
      _q4.setFromAxisAngle(UP, -hy); this.rotateC('Spine', _q4);
    }
    if (s.hurtT < this.prevHurt) { const l = this.toLocal(s.hurtDirX, s.hurtDirZ); this.flinch.kick(l.x * 3.5, l.z * 3.5); }
    this.prevHurt = s.hurtT;
    this.flinch.step(dt);
    const f = this.flinch;
    if (Math.abs(f.x) + Math.abs(f.z) > 1e-3) this.rotateEulerC('Spine1', f.z * 0.6, 0, -f.x * 0.5);
    this.weaponShown = uA > 0.5 ? 'axe' : uS > 0.5 ? 'shotgun' : 'pistol';
    if (this.weaponShown === 'pistol') this.aimPistol(s, 1 - uP);
    else if (this.weaponShown === 'shotgun') this.aimShotgun(s, 1 - uS);
    this.placeWeapons(s, dt);
  }

  // Spine re-based onto each upper-body layer's own hip TILT: S' = inv(Hnow) * Hclip' * S, where Hclip'
  // is the source clip's hip rotation turned to the current hips' heading (the source clips stand turned,
  // e.g. the rifle stance ~130 degrees; the turn onto the aim is done by the aim correction). Blended
  // by the layer's weight. (Hips' parent is static, so local hip rotations compare directly.)
  rebaseUpper() {
    const H = this.bones.Hips, S = this.bones.Spine; if (!H || !S) return;
    const inv = _q2.copy(H.quaternion).invert();
    for (const n in this.upperHips) {
      const a = this.act(n), w = a.getEffectiveWeight();
      if (w < 1e-3) continue;
      const v = this.upperHips[n].evaluate(a.time);
      _q3.set(v[0], v[1], v[2], v[3]);
      const fc = _v.set(0, 0, 1).applyQuaternion(_q3), fn = _v2.set(0, 0, 1).applyQuaternion(H.quaternion);
      _q4.setFromAxisAngle(UP, Math.atan2(fn.x, fn.z) - Math.atan2(fc.x, fc.z));
      _q3.premultiply(_q4); // same heading as the hips now
      _q4.copy(inv).multiply(_q3); // inv(Hnow) * Hclip'
      _q.identity().slerp(_q4, Math.min(1, w));
      S.quaternion.premultiply(_q);
    }
    S.updateMatrixWorld(true);
  }

  toLocal(x, z) { const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw); return { x: x * cs - z * sn, z: x * sn + z * cs }; }

  grip(side, out) {
    // between the wrist and the middle-finger knuckle
    this.bones[side + 'Hand'].getWorldPosition(out);
    this.bones[side + 'HandMiddle1'].getWorldPosition(_v4);
    return out.add(_v4).multiplyScalar(0.5);
  }

  // Turn the chest so the gun points exactly along the simulation's aim, then add recoil.
  // During a reload the hands leave the aim, so the last aiming correction is held instead.
  aimPistol(s, ub) {
    const k = 1 - ub, rW = this.reloadW || 0;
    this.grip('Right', _v); this.grip('Left', _v2);
    this.bones.RightArm.getWorldPosition(_v3); this.bones.LeftArm.getWorldPosition(_v4);
    const hx = (_v.x + _v2.x) / 2 - (_v3.x + _v4.x) / 2, hz = (_v.z + _v2.z) / 2 - (_v3.z + _v4.z) / 2;
    const live = clamp(angleDiff(Math.atan2(hx, hz), s.aimYaw), -0.6, 0.6);
    if (rW === 0) this.aimErr = live;
    const err = live * (1 - rW) + (this.aimErr || 0) * rW;
    const kick = s.recoil * s.recoil * s.recoilScale;
    this.rotateEulerC('Spine2', -0.09 * kick * k, err * k, 0);
    if (kick > 0.01) { this.rotateEulerC('RightArm', -0.25 * kick * k, 0, 0); this.rotateEulerC('LeftArm', -0.25 * kick * k, 0, 0); }
  }

  // Shotgun barrel direction in character (container) space, from the right-hand socket.
  shotgunBarrel(out) {
    this.container.getWorldQuaternion(_q3).invert();
    this.bones.RightHand.getWorldQuaternion(_q).multiply(this.shotgunSocket);
    return out.set(1, 0, 0).applyQuaternion(_q).applyQuaternion(_q3);
  }
  // Shotgun: the hold pose rides on whatever the legs' clip does with the hips (the running strafes turn
  // the pelvis toward travel), so (1) turn the chest back onto the aim, spread over the three spine
  // bones, then (2) bring the barrel near level by turning the right arm at the shoulder. During a reload the last yaw is held
  // and the levelling fades out. Then the kick: chest and arms thrown up and back.
  aimShotgun(s, ub) {
    const k = 1 - ub, rW = this.reloadW || 0;
    let b = this.shotgunBarrel(_v);
    const live = clamp(angleDiff(Math.atan2(b.x, b.z), 0), -2.2, 2.2); // character forward is +Z
    if (rW === 0) this.sgYaw = live;
    const ey = (live * (1 - rW) + (this.sgYaw || 0) * rW) * k;
    if (Math.abs(ey) > 1e-4) for (const n of ['Spine', 'Spine1', 'Spine2']) { _q4.setFromAxisAngle(UP, ey / 3); this.rotateC(n, _q4); }
    b = this.shotgunBarrel(_v);
    const flat = _v2.set(b.x, 0, b.z);
    if (flat.lengthSq() > 1e-6) {
      flat.normalize(); flat.y = -0.36; flat.normalize(); // ~20 degrees below level: a low ready
      // raised from the right shoulder (the gun rides that hand; the left hand follows by IK), so the
      // torso stays upright instead of leaning back to lift the barrel
      _q4.setFromUnitVectors(b.normalize(), flat);
      _q4.slerp(_q.identity(), 1 - k * (1 - rW));
      this.rotateC('RightArm', _q4.clone());
    }
    const kick = s.recoil * s.recoil * s.recoilScale;
    if (kick > 0.01) {
      this.rotateEulerC('Spine1', -0.1 * kick * k, 0, 0);
      this.rotateEulerC('Spine2', -0.14 * kick * k, 0, 0);
      this.rotateEulerC('RightArm', -0.22 * kick * k, 0, 0); this.rotateEulerC('LeftArm', -0.22 * kick * k, 0, 0);
    }
  }

  placeWeapons(s, dt) {
    const shown = this.weaponShown;
    this.pistol.visible = shown === 'pistol'; this.shotgun.visible = shown === 'shotgun'; this.melee.visible = shown === 'axe';
    if (shown === 'pistol') {
      // pistol: barrel along the arms' line toward the target; during a reload it follows the
      // right hand through the socket calibrated in the aiming pose
      this.aimQuat(_q);
      const rW = this.reloadW || 0;
      if (rW > 0 && this.pistolSocket) { this.bones.RightHand.getWorldQuaternion(_q2); _q.slerp(_q2.multiply(this.pistolSocket), rW); }
      this.grip('Right', _v);
      this.pistol.position.copy(_v);
      this.pistol.quaternion.copy(_q);
      this.pistol.updateMatrixWorld(true);
      this.pistol.userData.muzzle.getWorldPosition(this.muzzleWorld);
    } else if (shown === 'shotgun') {
      // shotgun: rides the right hand; the pump racks after each shot and the left hand follows it
      const G = this.shotgun, U = G.userData;
      this.bones.RightHand.getWorldQuaternion(_q).multiply(this.shotgunSocket);
      this.grip('Right', _v);
      G.position.copy(_v); G.quaternion.copy(_q);
      let pump = 0;
      if (s.action === 'shot') { const u = (s.actionT - SHOTGUN_SPEC.pumpStart) / (SHOTGUN_SPEC.pumpEnd - SHOTGUN_SPEC.pumpStart); if (u > 0 && u < 1) pump = Math.sin(Math.PI * u); }
      U.pump.position.x = U.pumpX - 0.065 * pump;
      G.updateMatrixWorld(true);
      U.muzzle.getWorldPosition(this.muzzleWorld);
      this.ikArm('Left', U.gripL.getWorldPosition(_v2), 1 - (this.reloadW || 0));
    } else {
      // axe: handle direction from the right-hand socket (as on the reference skeleton), grip between
      // the hands; the blade turns to lead the motion (edge first), resting toward the front
      this.grip('Right', _v); this.grip('Left', _v2);
      // socket: the idle grip, blended with the current (and fading) attack's grip
      let dir;
      if (this.batSocket) {
        const wA = this.swingAct ? this.swingW : 0, wP = this.prevSwing ? this.prevSwing.getEffectiveWeight() : 0, wI = Math.max(0, 1 - wA - wP);
        const ms = this.meleeSocket || {};
        dir = _v3.copy(this.batSocket).multiplyScalar(wI);
        if (wA) dir.addScaledVector(ms[this.swingName] || this.batSocket, wA);
        if (wP) dir.addScaledVector(ms[this.prevSwingName] || this.batSocket, wP);
        this.bones.RightHand.getWorldQuaternion(_q); dir.applyQuaternion(_q).normalize();
      } else dir = _v3.copy(_v).sub(_v2).normalize();
      const M = this.melee;
      M.position.copy(_v).add(_v2).multiplyScalar(0.5);
      const tip = _v4.copy(M.position).addScaledVector(dir, 0.7);
      const vel = this.bladeInit && dt > 0 ? tip.clone().sub(this.prevTip).divideScalar(dt) : new THREE.Vector3();
      this.prevTip.copy(tip);
      const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const sp = vel.length();
      const want = vel.multiplyScalar(clamp((sp - 1) / 3, 0, 1)).addScaledVector(fwd, 0.8);
      want.addScaledVector(dir, -want.dot(dir));
      if (want.lengthSq() < 1e-6) want.set(1, 0, 0).addScaledVector(dir, -dir.x);
      want.normalize();
      const x = want.clone().negate(), y = new THREE.Vector3().crossVectors(dir, x); // local -X is the blade
      const target = _q2.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, dir));
      if (!this.bladeInit) { this.bladeQ.copy(target); this.bladeInit = true; }
      else this.bladeQ.slerp(target, 1 - Math.exp(-dt * (sp > 2 ? 30 : 10)));
      M.quaternion.copy(this.bladeQ);
      M.updateMatrixWorld(true);
    }
  }


  die(dt, s) {
    if (this.deathT < 0) {
      this.deathT = 0;
      for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
      const d = this.act('death_fall'); d.reset(); d.setLoop(THREE.LoopOnce); d.clampWhenFinished = true; d.setEffectiveWeight(1); d.play();
      this.pistol.visible = this.shotgun.visible = this.melee.visible = false;
    }
    this.deathT += dt;
    this.mixer.update(dt);
  }
}

// ----------------------------------------------------------------------------------------------
const SHARED_CLIPS = new WeakMap(); // gltf -> processed clips, shared by all views of a zombie type
const ONE_SHOTS = ['attack', 'hit_flinch', 'hit_stumble', 'death_back', 'death_forward', 'death_headshot_knees', 'death_chest_back',
  'react_large_front', 'react_large_back', 'react_large_left', 'react_large_right', 'knockdown', 'standup_stomach'];
// Death clips: [clip, start frame, frame the body is on the floor]. Played so the fall takes ~1.1-1.4 s.
const DEATHS = {
  back: [['death_back', 7, 53], ['death_chest_back', 20, 66]],
  forward: [['death_forward', 10, 67], ['death_headshot_knees', 18, 70]],
};

// Modular zombie pieces (nurse / patient naming) and gore pieces (GORE_<piece>_Stump / _Detached).
const MODULE_NAMES = {
  Head: /^(Nurse_Head|Patient_Head)$/, Forearm_L: /^(Nurse_Forearm_L|Patient_LeftForearm)$/, Forearm_R: /^(Nurse_Forearm_R|Patient_RightForearm)$/,
  LowerLeg_L: /^(Nurse_LowerLeg_L|Patient_LeftLowerLeg)$/, LowerLeg_R: /^(Nurse_LowerLeg_R|Patient_RightLowerLeg)$/,
};
const GORE_NAME = /^GORE_(Head|Forearm_L|Forearm_R|LowerLeg_L|LowerLeg_R)_(Stump|Detached)/;
// bone the stump sits on (bleeds from), and the severed piece's two ends [from, to, extend] and radius (m at 1.7 m)
const STUMP_BONE = { Head: 'Neck', Forearm_L: 'LeftForeArm', Forearm_R: 'RightForeArm', LowerLeg_L: 'LeftLeg', LowerLeg_R: 'RightLeg' };
const PIECE_ENDS = {
  Head: ['Head', 'HeadTop_End', 0, 0.1], Forearm_L: ['LeftForeArm', 'LeftHand', 0.45, 0.045], Forearm_R: ['RightForeArm', 'RightHand', 0.45, 0.045],
  LowerLeg_L: ['LeftLeg', 'LeftFoot', 0.1, 0.06], LowerLeg_R: ['RightLeg', 'RightFoot', 0.1, 0.06],
};
const MAX_PIECES = 40;
const _bv = new THREE.Vector3(), _bq = new THREE.Quaternion();

export class ZombieView extends ClipBody {
  static physics = null; // shared physics backend (custom / Rapier); null = death clips only
  static fx = null;      // blood effects
  static scene = null;   // severed pieces live in the scene, independent of the (pooled) views
  static pieces = [];
  constructor(scene, gltf, height, speeds) {
    const model = skClone(gltf.scene);
    const mats = [];
    model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); } });
    // clips are processed once per zombie type and shared by every view (mixers can share clips;
    // cloning them per spawn copied megabytes of keyframes and stalled frames)
    let clips = SHARED_CLIPS.get(gltf);
    if (!clips) {
      const rest = hipsRest(gltf.scene);
      clips = gltf.animations.map((c) => stripRoot(c.clone(), rest));
      for (const c of clips) if (c.name === 'walk' || c.name === 'idle' || c.name === 'crawl') loopClip(c);
      SHARED_CLIPS.set(gltf, clips);
    }
    ZombieView.scene = scene;
    super(scene, model, height, clips);
    this.mats = mats;
    this.nativeWalk = (speeds?.speed || 0.17) * height;
    for (const n of ['walk', 'idle']) { this.act(n).play(); this.act(n).setEffectiveWeight(0); }
    for (const n of ONE_SHOTS) {
      const a = this.act(n); if (!a) continue;
      a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true;
    }
    this.react = new Spring2(70, 9);
    this.oneShot = null; this.lastSeq = 0; this.lastState = ''; this.id = -1;
    this.height = height;
    // modular pieces (empty for the older single-mesh zombies)
    this.modules = {}; this.gore = {};
    model.traverse((o) => {
      for (const [k, re] of Object.entries(MODULE_NAMES)) if (re.test(o.name)) this.modules[k] = o;
      const m = GORE_NAME.exec(o.name);
      if (m) (this.gore[m[1]] ||= {})[m[2].toLowerCase()] = o;
    });
    this.modular = Object.keys(this.modules).length === 5;
    this.severed = new Set(); this.rag = null; this.bleed = {};
    this.hasCrawl = !!this.act('crawl');
    if (this.hasCrawl) { this.act('crawl').play(); this.act('crawl').setEffectiveWeight(0); }
  }

  // ---- dismemberment ----
  sever(part, z) {
    this.severed.add(part);
    this.container.updateMatrixWorld(true);
    const P = ZombieView.physics, fx = ZombieView.fx;
    const mod = this.modules[part], g = this.gore[part] || {};
    // the loose piece: the module and its wound cap baked in their current pose
    const [fromB, toB, ext, rad] = PIECE_ENDS[part];
    const a = this.bones[fromB].getWorldPosition(new THREE.Vector3());
    const b = this.bones[toB].getWorldPosition(new THREE.Vector3());
    b.add(b.clone().sub(a).multiplyScalar(ext));
    const q0 = frameQuat(b.clone().sub(a), new THREE.Vector3(1, 0, 0).applyQuaternion(this.bones[fromB].getWorldQuaternion(_bq)), new THREE.Quaternion());
    const c = a.clone().add(b).multiplyScalar(0.5), qi = q0.clone().invert();
    const obj = new THREE.Group();
    const bake = (src) => src && src.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      // bone matrices are only refreshed when the renderer draws the mesh: a view that has not been
      // drawn in this pose yet (just spawned, or reused from the pool) would bake a stretched piece
      o.skeleton.update();
      const sg = o.geometry, n = sg.attributes.position.count, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        o.getVertexPosition(i, _bv); _bv.applyMatrix4(o.matrixWorld).sub(c).applyQuaternion(qi);
        pos[i * 3] = _bv.x; pos[i * 3 + 1] = _bv.y; pos[i * 3 + 2] = _bv.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      for (const k of ['uv', 'color']) if (sg.attributes[k]) geo.setAttribute(k, sg.attributes[k]);
      if (sg.index) geo.setIndex(sg.index);
      geo.computeVertexNormals();
      const mat = o.material.clone(); if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
      obj.add(new THREE.Mesh(geo, mat));
    });
    bake(mod); bake(g.detached);
    obj.position.copy(c); obj.quaternion.copy(q0);
    ZombieView.scene.add(obj);
    mod.visible = false; if (g.stump) g.stump.visible = true;
    // thrown along the blow, up and spinning
    const dir = new THREE.Vector3(z.hitDirX, 0, z.hitDirZ);
    const sg = z.hitKind === 'shotgun';
    const vel = dir.clone().multiplyScalar(isMelee(z.hitKind) ? 4.5 : sg ? 3.5 + z.hitStrength * 0.4 : 2.6)
      .add(new THREE.Vector3(z.vx * 0.5, (sg ? 3 : 2.2) + Math.random() * 1.2, z.vz * 0.5));
    const r = rad * (this.height / 1.7);
    const piece = { obj, t: 0, id: P && P.ready ? P.addPiece(a, b, r, vel, q0) : 0, P: P && P.ready ? P : null, vel, r, states: [] };
    ZombieView.pieces.push(piece);
    if (ZombieView.pieces.length > MAX_PIECES) ZombieView.dropPiece(ZombieView.pieces[0]);
    // blood: spray from the stump along the blow, a pool below, then dripping for a while
    const s = this.bones[STUMP_BONE[part]].getWorldPosition(new THREE.Vector3());
    if (fx) { fx.bloodSpray(s.x, s.y, s.z, dir.x * 0.8, 0.5, dir.z * 0.8, part === 'Head' ? 30 : 20, 3.2); fx.bloodPool(s.x + dir.x * 0.4, s.z + dir.z * 0.4, part === 'Head' ? 1.0 : 0.7); }
    this.bleed[part] = 2.5;
  }
  bleeding(dt) {
    const fx = ZombieView.fx; if (!fx) return;
    for (const part in this.bleed) {
      if ((this.bleed[part] -= dt) <= 0) { delete this.bleed[part]; continue; }
      if (Math.random() < dt * 18) {
        const s = this.bones[STUMP_BONE[part]].getWorldPosition(_bv);
        fx.bloodSpray(s.x, s.y, s.z, 0, part === 'Head' ? 0.6 : -0.1, 0, 1, 0.8);
      }
    }
  }
  static updatePieces(dt) {
    for (const pc of [...ZombieView.pieces]) {
      pc.t += dt;
      if (pc.P) {
        const st = pc.P.read(pc.id, pc.states);
        if (st) { pc.obj.position.copy(st[0].pos); pc.obj.quaternion.copy(st[0].quat); }
      } else if (pc.obj.position.y > pc.r) { // no physics: simple fall
        pc.vel.y -= 9.81 * dt; pc.obj.position.addScaledVector(pc.vel, dt);
        if (pc.obj.position.y < pc.r) pc.obj.position.y = pc.r;
      }
      if (pc.t > 14) pc.obj.position.y -= dt * 0.25; // sink away
      if (pc.t > 16) ZombieView.dropPiece(pc);
    }
  }
  static dropPiece(pc) {
    const i = ZombieView.pieces.indexOf(pc); if (i >= 0) ZombieView.pieces.splice(i, 1);
    if (pc.P) pc.P.remove(pc.id);
    pc.obj.removeFromParent();
    pc.obj.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
  static clearPieces() { for (const pc of [...ZombieView.pieces]) ZombieView.dropPiece(pc); }

  bind(z) {
    this.id = z.id; this.lastSeq = z.hitSeq; this.lastState = ''; this.outer.visible = this.blob.visible = true;
    this.outer.position.y = 0; this.oneShot = null; this.deathYaw = null;
    this.endRagdoll();
    this.severed.clear();
    for (const m of Object.values(this.modules)) m.visible = true;
    for (const g of Object.values(this.gore)) { if (g.stump) g.stump.visible = false; if (g.detached) g.detached.visible = false; }
    for (const a of Object.values(this.actions)) { a.stop(); a.setEffectiveWeight(0); }
    for (const n of ['walk', 'idle']) { this.act(n).play(); this.act(n).time = Math.random() * this.act(n).getClip().duration; }
    if (this.hasCrawl) this.act('crawl').play();
    this.react.x = this.react.z = this.react.vx = this.react.vz = 0;
    this.bleed = {};
  }
  hide() { this.outer.visible = false; this.blob.visible = false; this.id = -1; this.mixer.stopAllAction(); this.endRagdoll(); }

  // ---- ragdoll: from the current animated pose, carrying the blow's momentum ----
  startRagdoll(z) {
    const P = ZombieView.physics;
    if (!P || !P.ready) return false;
    this.container.updateMatrixWorld(true);
    const missing = new Set([...this.severed].map((s) => SEVER_PART[s]));
    const desc = describeRagdoll(this.bones, this.height, missing);
    const dir = new THREE.Vector3(z.hitDirX, 0, z.hitDirZ);
    // each weapon throws the body its own way:
    //  pistol: a slump along the shot (the head snaps back on a head shot)
    //  shotgun: lifted off the feet and thrown back, harder the closer the blast
    //  axe swing / heavy: thrown sideways along the blade; chop: driven down into a heap
    const kind = z.hitKind, style = z.hitStyle, melee = isMelee(kind), sg = kind === 'shotgun';
    const s = sg ? 1.2 + z.hitStrength * 0.55 : melee ? (style === 'chop' ? 1.4 : style === 'heavy' ? 5.2 : 4.2) : 2.0;
    const lift = sg ? 0.4 + z.hitStrength * 0.22 : melee && style === 'chop' ? -2.6 : 0;
    const hitPart = !melee && !sg && z.lastHitPart === 'Head' ? 'head' : 'chest';
    const base = new THREE.Vector3(z.kx * 0.35, 0.2, z.kz * 0.35);
    const vels = desc.parts.map((p) => {
      const core = p.name === 'chest' || p.name === 'head';
      const k = p.name === hitPart ? 1 : core ? 0.6 : p.name === 'pelvis' ? (sg ? 0.7 : 0.3) : sg ? 0.45 : 0.25;
      const v = base.clone().addScaledVector(dir, s * k);
      if (lift > 0) v.y += lift * (core || p.name === 'pelvis' ? 1 : 0.6);
      else if (lift < 0 && core) v.y += lift;
      return v;
    });
    const id = P.addRagdoll(desc, vels);
    this.rag = { id, P, driver: new RagdollDriver(this.bones, desc), states: [], frozen: false };
    this.mixer.stopAllAction(); this.oneShot = null;
    return true;
  }
  endRagdoll() {
    if (this.rag && !this.rag.frozen) this.rag.P.remove(this.rag.id);
    this.rag = null;
  }

  playOnce(name, from = 0, rate = 1, fade = 0.08) {
    if (this.oneShot && this.oneShot !== this.act(name)) { if (fade > 0) this.oneShot.fadeOut(fade); else { this.oneShot.stop(); this.oneShot.setEffectiveWeight(0); } }
    const a = this.act(name);
    a.reset(); a.time = from; a.timeScale = rate; a.setEffectiveWeight(1); if (fade > 0) a.fadeIn(fade); a.play();
    this.oneShot = a;
  }

  // Big directional reaction: the clip that throws the body away from the blow.
  reactClip(z) {
    const sn = Math.sin(z.yaw), cs = Math.cos(z.yaw);
    const fwd = z.hitDirX * sn + z.hitDirZ * cs, left = z.hitDirX * cs - z.hitDirZ * sn;
    if (Math.abs(fwd) >= Math.abs(left)) return fwd < 0 ? 'react_large_front' : 'react_large_back';
    return left < 0 ? 'react_large_left' : 'react_large_right';
  }

  update(dt, z, x, zz) {
    if (this.rag) { this.updateRagdoll(z); return; }
    // limbs the simulation took off this step: cut them from the pose that is on screen now
    if (this.modular && z.severed.size !== this.severed.size) for (const part of z.severed) if (!this.severed.has(part)) this.sever(part, z);
    this.outer.position.x = x; this.outer.position.z = zz;
    this.blob.position.set(x, 0.012, zz);
    const dying = z.state === 'dying' || z.state === 'dead';
    if (z.state === 'dying' && this.lastState !== 'dying' && this.startRagdoll(z)) { this.lastState = 'dying'; this.updateRagdoll(z); return; }
    // state transitions -> clips (attack timed so the swipe lands at the end of the windup)
    if (z.state !== this.lastState) {
      const S = z.state;
      if (S === 'windup') this.playOnce('attack', 8 / 30, (33 - 8) / 30 / Math.max(0.2, z.stateDur));
      else if (S === 'stagger') {
        if (isMelee(z.hitKind) || z.hitKind === 'shotgun' || z.hitKind === 'bump') {
          const n = this.reactClip(z), len = this.act(n).getClip().duration;
          this.playOnce(n, 2 / 30, (len - 2 / 30) / Math.max(0.3, z.stateDur));
        } else this.playOnce('hit_flinch', 0.15, 1.6);
      } else if (S === 'knockdown') {
        this.deathYaw = null;
        this.playOnce('knockdown', 1 / 30, 59 / 30 / z.stateDur, 0.05); // thrown back, rolls onto the stomach
      } else if (S === 'getup') {
        // the get-up starts from the same lying pose (turned to match the sim's new facing): hard cut
        this.playOnce('standup_stomach', 20 / 30, 161 / 30 / z.stateDur, 0);
      } else if (S === 'dying') {
        if (z.downDeath) { this.deathYaw = null; } // killed on the floor: stay down
        else {
          // fall along the blow: face against the hit and fall back, or with it and fall forward
          const along = Math.cos(angleDiff(z.yaw, z.deathYaw));
          const back = along < 0;
          this.deathYaw = back ? z.deathYaw + Math.PI : z.deathYaw;
          const [n, f0, f1] = DEATHS[back ? 'back' : 'forward'][z.hitKind === 'pistol' ? z.id % 2 : 0];
          this.playOnce(n, f0 / 30, (f1 - f0) / 30 / 1.25);
        }
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
    const crawl = z.crawling && this.hasCrawl ? 1 : 0; // legless: drags itself along
    this.act('walk').setEffectiveWeight(move * (1 - one) * (1 - crawl));
    this.act('idle').setEffectiveWeight((1 - move) * (1 - one) * (1 - crawl));
    this.act('walk').timeScale = clamp(sp / this.nativeWalk, 0.5, 3.2);
    if (this.hasCrawl) { const c = this.act('crawl'); c.setEffectiveWeight(crawl * (1 - one)); c.timeScale = clamp(sp / (0.22 * this.height), 0.45, 2.5); }
    this.mixer.update(dt);
    this.container.updateMatrixWorld(true);
    this.bleeding(dt);

    // small directional jolt on every hit (the clip gives the body reaction; this gives direction)
    if (z.hitSeq !== this.lastSeq) {
      this.lastSeq = z.hitSeq;
      const sn = Math.sin(this.container.rotation.y), cs = Math.cos(this.container.rotation.y);
      const lx = z.hitDirX * cs - z.hitDirZ * sn, lz = z.hitDirX * sn + z.hitDirZ * cs;
      const k = (isMelee(z.hitKind) ? 0.5 : z.hitKind === 'shotgun' ? 0.4 : 0.35) * Math.min(5, z.hitStrength);
      this.react.kick(lx * k, lz * k);
    }
    this.react.step(dt);
    if (!dying && Math.abs(this.react.x) + Math.abs(this.react.z) > 1e-3) this.rotateEulerC('Spine1', this.react.z * 0.7, 0, -this.react.x * 0.6);
    const fl = z.hitFlash * z.hitFlash; // sharp: a bright first frame, gone within ~0.1 s
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(fl * 0.4, fl * 0.33, fl * 0.27);
    // corpse sinks away after a while
    if (z.state === 'dead' && z.corpseT > 4.5) this.outer.position.y = -Math.min(1, (z.corpseT - 4.5) / 2) * 0.6;
    this.blob.visible = z.state !== 'dead' || z.corpseT < 4.5;
  }

  // Ragdolled: the skeleton follows the physics parts. The body leaves the physics world once the
  // corpse starts sinking (the last pose is kept and sinks with the model).
  updateRagdoll(z, dt = 1 / 60) {
    const R = this.rag;
    this.bleeding(dt);
    if (!R.frozen) {
      const st = R.P.read(R.id, R.states);
      if (st) R.driver.apply(st);
      if (z.state === 'dead' && z.corpseT > 4.5) { R.P.remove(R.id); R.frozen = true; }
      const pel = st && st[0];
      if (pel) this.blob.position.set(pel.pos.x, 0.012, pel.pos.z);
    }
    const fl = z.hitFlash * z.hitFlash;
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(fl * 0.4, fl * 0.33, fl * 0.27);
    if (z.state === 'dead' && z.corpseT > 4.5) this.outer.position.y = -Math.min(1, (z.corpseT - 4.5) / 2) * 0.6;
    this.blob.visible = z.state !== 'dead' || z.corpseT < 4.5;
  }
}
