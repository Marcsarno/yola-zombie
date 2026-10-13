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
  constructor(scene, gltf, clipdata) {
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
    clips.push(byName.bat_swing, byName.death_fall, byName.death_defeat, byName.pistol_hit);
    super(scene, gltf.scene, H, clips);
    this.H = H;
    for (const n of loco) for (const suf of ['', '_lower']) { const a = this.act(n + suf); a.play(); a.setEffectiveWeight(0); }
    this.gait = this.measureGaits();
    // moving clips are driven from one shared gait phase (see locoWeights), not by the mixer clock
    for (const n in LOCO) for (const suf of ['', '_lower']) this.act(n + suf).timeScale = 0;
    this.phase = 0; this.sv = { x: 0, z: 0 };
    this.act('bat_idle_upper').play(); this.act('bat_idle_upper').setEffectiveWeight(0);
    const rl = this.act('pistol_reload_upper'); rl.play(); rl.setEffectiveWeight(0); rl.timeScale = 0;
    this.reloadFrames = Math.round(byName.pistol_reload.duration * 30); // Blender frames 1..N
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
    this.calibratePistolSocket();
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
    // reload: upper-body clip driven by the simulation's reload time, legs keep the locomotion
    let rW = 0;
    if (s.action === 'reload' && s.equipped === 'pistol') {
      const u = clamp(s.actionT / s.reloadDur, 0, 1), rl = this.act('pistol_reload_upper');
      rl.time = (1 + u * (this.reloadFrames - 1)) / 30;
      rW = smooth(clamp(s.actionT / 0.08, 0, 1)) * smooth(clamp((1 - u) / 0.12, 0, 1));
    }
    this.reloadW = rW;
    this.act('pistol_reload_upper').setEffectiveWeight(rW * (1 - ub) * (1 - sW));
    for (const n in w) {
      this.act(n).setEffectiveWeight(w[n] * (1 - ub) * (1 - rW) * (1 - sW));
      this.act(n + '_lower').setEffectiveWeight(w[n] * (ub + (1 - ub) * rW) * (1 - sW));
    }
    this.act('bat_idle_upper').setEffectiveWeight(ub * (1 - sW));
    this.mixer.update(dt);
    // keep the synced swing frame exact after the mixer advanced it
    this.container.updateMatrixWorld(true);

    // ---- corrections after the mixer ----
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

  placeWeapons(s, ub) {
    const showBat = ub > 0.5;
    this.pistol.visible = !showBat; this.bat.visible = showBat;
    if (!showBat) {
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
    } else {
      // bat: direction from the right-hand socket (as on the reference skeleton), origin between the hands
      this.grip('Right', _v); this.grip('Left', _v2);
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
    for (const c of clips) if (c.name === 'walk' || c.name === 'idle') loopClip(c);
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
