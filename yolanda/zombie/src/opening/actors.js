// Opening actors: skinned characters (the hospital game's 20-joint Gumby rig, the visitors, the original
// segmented Yola) with simple scripted locomotion. Everything here is presentation only.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

let blobTex = null;
function blobMaterial() {
  if (!blobTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(20,30,34,.5)'); gr.addColorStop(1, 'rgba(20,30,34,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c); }
  return new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class Actor {
  // gltf: loaded glTF; opts.height: metres (scales the model); opts.walkSpeed: m/s the walk clip is tuned for
  constructor(gltf, { height = 0, walkSpeed = 1.15, name = 'actor', walkClip = 'Walk_InPlace', idleClip = 'Idle' } = {}) {
    this.name = name;
    this.root = new THREE.Group(); this.root.name = name;
    this.model = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.model);
    this.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
    // soft blob under the feet (the shadow map is static, so moving characters get a blob like the combat game)
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), blobMaterial()); this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.012; this.blob.renderOrder = 1; this.root.add(this.blob);
    if (height) {
      this.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.model);
      const k = height / (box.max.y - box.min.y);
      this.model.scale.multiplyScalar(k); this.model.position.y -= box.min.y * k;
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const c of gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
    this.bones = {}; this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.cur = null; this.curName = '';
    this.walkSpeed = walkSpeed; this.walkClip = walkClip; this.idleClip = idleClip;
    this.yaw = 0; this.targetYaw = null; this.path = []; this.speed = 0; this.moving = false; this.onArrive = null;
    this.timeScale = 1;
    this.seated = false; this.sitState = 'stand'; this.seat = null; // 'stand' | 'sitting' | 'seated' | 'rising'
    this.adj = {}; this._undo = []; this.lying = null;
  }

  place(x, z, yaw = this.yaw) { this.root.position.set(x, 0, z); this.yaw = yaw; this.root.rotation.y = yaw; return this; }
  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  play(name, { fade = 0.25, once = false, rate = 1, from = 0 } = {}) {
    const a = this.actions[name];
    if (!a) return null;
    if (this.cur === a && !once) return a;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.timeScale = rate;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (from) a.time = from;
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    a.play(); this.cur = a; this.curName = name;
    return a;
  }
  duration(name) { return this.actions[name]?.getClip().duration ?? 0; }

  // Walk along waypoints [[x,z],...] at speed m/s; then face endYaw (if given) and idle
  walk(points, { speed = this.walkSpeed, endYaw = null, onArrive = null } = {}) {
    this.path = points.map((p) => ({ x: p[0], z: p[1] })); this.speed = speed; this.endYaw = endYaw; this.onArrive = onArrive;
    this.moving = this.path.length > 0; this.seated = false;
    if (this.moving) this.play(this.walkClip, { rate: speed / this.walkSpeed });
  }
  stop() { this.path = []; this.moving = false; }

  update(dt) {
    if (this.frozen) return; // a held pose (the reveal's stills): nothing is re-evaluated, the last pose stays
    const d = dt * this.timeScale;
    for (const u of this._undo) u.bone.quaternion.copy(u.base); this._undo.length = 0; // undo last frame's adjustments before the mixer writes
    if (this.moving && this.path.length) {
      const t = this.path[0], dx = t.x - this.x, dz = t.z - this.z, L = Math.hypot(dx, dz), step = this.speed * d;
      if (L <= step + 1e-4) {
        this.root.position.x = t.x; this.root.position.z = t.z; this.path.shift();
        if (!this.path.length) { this.moving = false; if (this.endYaw != null) this.targetYaw = this.endYaw; this.play(this.idleClip); const cb = this.onArrive; this.onArrive = null; cb?.(); }
      } else {
        this.root.position.x += (dx / L) * step; this.root.position.z += (dz / L) * step;
        this.targetYaw = Math.atan2(dx, dz);
      }
    }
    if (this.targetYaw != null) {
      const e = angDiff(this.yaw, this.targetYaw);
      this.yaw += clamp(e, -d * 7, d * 7);
      if (Math.abs(angDiff(this.yaw, this.targetYaw)) < 1e-3 && !this.moving) this.targetYaw = null;
    }
    if (this.lying) this.root.rotation.set(-Math.PI / 2, this.yaw, 0, 'YXZ'); else this.root.rotation.y = this.yaw;
    if (this.seat && (this.sitState === 'sitting' || this.sitState === 'seated')) { this.root.position.x = this.seat.x + Math.sin(this.yaw) * this.seat.behind; this.root.position.z = this.seat.z + Math.cos(this.yaw) * this.seat.behind; }
    this.mixer.update(d);
    // additive pose adjustments (each is {bone, x, y, z} euler radians): applied on top of the clip's pose, undone next frame
    for (const k in this.adj) { const a = this.adj[k], b = this.bones[a.bone]; if (!b || !(a.w > 0)) continue; this._undo.push({ bone: b, base: b.quaternion.clone() }); b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(a.x * a.w, a.y * a.w, a.z * a.w, 'XYZ'))); }
  }
  adjust(key, bone, x, y, z, w = 1) { this.adj[key] = { bone, x, y, z, w }; }
  // lie supine on a surface: feet at (x, y, z), the body's long axis (head direction) along yawHead (0 = +z)
  lie(x, y, z, yawHead) {
    this.stop(); this.lying = { x, y, z, yawHead };
    this.root.rotation.order = 'YXZ'; this.root.position.set(x, y, z); this.yaw = yawHead; this.root.rotation.set(-Math.PI / 2, yawHead, 0, 'YXZ');
    if (this.blob) this.blob.visible = false;
  }
  unlie() { this.lying = null; this.root.rotation.set(0, this.yaw, 0, 'XYZ'); this.root.rotation.order = 'XYZ'; if (this.blob) this.blob.visible = true; }
  get busy() { return this.moving || this.targetYaw != null; }
  turnTo(yaw) { this.targetYaw = yaw; }

  // Sit on a chair whose seat centre is (cx, cz) with the character facing yaw. The visitor rigs' SitDown clip
  // expects the seat 0.45 m behind the standing origin (the source Blender contract), so stand 0.45 m in front.
  // The origin is placed by the caller's route (the sit anchor); this only plays the clip (instant = already seated).
  sitAt(cx, cz, yaw, { instant = false, behind = 0.45, seatTop = 0.47 } = {}) {
    this.stop(); this.targetYaw = null;
    this.seat = { x: cx, z: cz, behind }; this.yaw = yaw;
    // the clips sit onto a 0.47 m seat: a taller seat raises the whole body by the difference
    this.root.position.set(cx + Math.sin(yaw) * behind, Math.max(0, seatTop - 0.47), cz + Math.cos(yaw) * behind);
    this.seated = true;
    if (instant) { this.sitState = 'seated'; this.play('SeatedIdle', { fade: 0 }); return; }
    this.sitState = 'sitting';
    const a = this.play('SitDown', { once: true, fade: 0.1 });
    if (a) {
      const done = (e) => { if (e.action === a) { this.mixer.removeEventListener('finished', done); if (this.seated) { this.sitState = 'seated'; this.play('SeatedIdle', { fade: 0.15 }); } } };
      this.mixer.addEventListener('finished', done);
    }
  }
  standUp() {
    if (this.sitState === 'stand' || this.sitState === 'rising') return;
    this.seated = false; this.sitState = 'rising';
    const a = this.play('StandUp', { once: true, fade: 0.1 });
    if (a) {
      const done = (e) => { if (e.action === a) { this.mixer.removeEventListener('finished', done); this.sitState = 'stand'; this.seat = null; this.root.position.y = 0; this.play(this.idleClip, { fade: 0.15 }); } };
      this.mixer.addEventListener('finished', done);
    }
  }
  get settled() { return this.sitState === 'seated'; }
  get upright() { return this.sitState === 'stand'; }
  setVisible(v) { this.root.visible = v; }
  // swap clothing materials by name (map: material name -> colour), keeping the originals to restore
  setOutfit(map) {
    this._outfit ||= [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const one = (m) => { const c = map && m && map[m.name]; if (c === undefined) return m; const n = m.clone(); n.color.set(c); n.map = null; n.userData.outfitOf = m; return n; };
      if (!o.userData.matOrig) o.userData.matOrig = o.material;
      o.material = map ? (Array.isArray(o.userData.matOrig) ? o.userData.matOrig.map(one) : one(o.userData.matOrig)) : o.userData.matOrig;
    });
  }
}

// The original (management-game) Yola: segmented rig with named parts instead of a skinned body, and no wave clip.
// Her deliberately awkward wave is authored here on top of her idle by AIMING bones in world space (so it does not
// depend on the rig's local axes): an eager, hesitant, slightly-too-high raise of the right arm, a fast nervous
// wiggle of the forearm, a shy head tilt and shoulder shrug, then a sheepish drop back to idle.
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _id = new THREE.Quaternion();
export class OriginalYola extends Actor {
  constructor(gltf, opts = {}) {
    super(gltf, { walkClip: 'walk', idleClip: 'idle', ...opts });
    this.waveT = -1; this.rest = {}; this.pose = null;
    this.root.traverse((o) => { if (o.name === 'carry_tray' || (o.isMesh && !o.isSkinnedMesh && !o.name && o.parent === this.root.children[0])) o.visible = false; }); // the pill tray baked into the original model: nothing floats against her body
    this.keyed = new Set(); for (const c of gltf.animations) for (const tr of c.tracks) this.keyed.add(tr.name.split('.')[0]);
    for (const n of ['upperarm_r', 'forearm_r', 'upperarm_l', 'forearm_l', 'head', 'torso', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r']) if (this.bones[n]) this.rest[n] = this.bones[n].quaternion.clone();
    // length direction of the arm bones in their own frames, from the rest pose (the arms hang straight down)
    this.root.updateMatrixWorld(true);
    const B = this.bones, pos = (b) => b.getWorldPosition(new THREE.Vector3());
    this.armDir = {};
    for (const [n, c] of [['upperarm_r', 'forearm_r'], ['upperarm_l', 'forearm_l'], ['thigh_l', 'shin_l'], ['thigh_r', 'shin_r']]) {
      if (!B[n] || !B[c]) continue;
      const dir = pos(B[c]).sub(pos(B[n])).normalize();
      this.armDir[n] = dir.clone().applyQuaternion(B[n].getWorldQuaternion(new THREE.Quaternion()).invert());
      this.armDir[c] = dir.clone().applyQuaternion(B[c].getWorldQuaternion(new THREE.Quaternion()).invert());
    }
    // sitting (the rig has no seated clip): a controlled procedural pose. Measures at rest, relative to the floor.
    this.pelvisY0 = B.pelvis.getWorldPosition(new THREE.Vector3()).y - this.root.position.y;
    this.baseY = this.model.position.y; this.sitW = 0; this.sitTarget = 0; this.sitSeatTop = 0.5; this.sitDrop = 0;
  }
  startWave(rate = 1) { this.waveT = 0; this.waveRate = rate; } // rate > 1: the same awkward wave, compressed to fit the phrase
  update(dt) {
    if (this.frozen) return;
    super.update(dt);
    if (this.waveT >= 0) this.waveT += dt * this.timeScale * (this.waveRate || 1);
    const sd = (dt * this.timeScale) / 0.7;
    this.sitW = this.sitTarget > this.sitW ? Math.min(this.sitTarget, this.sitW + sd) : Math.max(this.sitTarget, this.sitW - sd);
    this.applyProcedural();
  }
  // sit on a seat of the given top height (m): lowers the pelvis onto it and folds the legs. The caller places root.
  sitDown(seatTop) { this.sitSeatTop = seatTop; this.sitTarget = 1; this.pose = 'sit'; this.seated = true; this.sitState = 'sitting'; }
  riseUp() { this.sitTarget = 0; this.seated = false; this.sitState = 'rising'; }
  get settled() { return this.sitTarget === 1 && this.sitW >= 1; }
  get upright() { return this.sitTarget === 0 && this.sitW <= 0; }
  // rotate the bone (in world space) so that its length axis points along 'target', by weight w
  aim(name, target, w) {
    const b = this.bones[name]; if (!b || w <= 1e-4) return;
    b.updateWorldMatrix(true, false);
    b.getWorldQuaternion(_q);
    const cur = _v.copy(this.armDir[name]).applyQuaternion(_q);
    const rot = _q2.setFromUnitVectors(cur, target);
    rot.premultiply(_id.identity()); // (no-op; keeps intent clear)
    const part = new THREE.Quaternion().identity().slerp(rot, w);
    const world = part.multiply(_q.clone());
    b.parent.getWorldQuaternion(_q2);
    b.quaternion.copy(_q2.invert().multiply(world));
    b.updateMatrixWorld(true);
  }
  // rotate a bone about a world axis
  rotW(name, axis, angle) {
    const b = this.bones[name]; if (!b || !angle) return;
    b.updateWorldMatrix(true, false); b.getWorldQuaternion(_q);
    const world = _id.setFromAxisAngle(axis, angle).multiply(_q.clone());
    b.parent.getWorldQuaternion(_q2); b.quaternion.copy(_q2.invert().multiply(world)); b.updateMatrixWorld(true);
  }
  applySit() {
    const w = this.sitW, B = this.bones, R = this.rest;
    // the legs are re-posed absolutely from rest while sitting (and once on the way out), never accumulated
    if (w > 1e-3 || this._wasSit) for (const n of ['thigh_l', 'thigh_r', 'shin_l', 'shin_r']) if (R[n]) B[n].quaternion.copy(R[n]);
    this._wasSit = w > 1e-3;
    if (w <= 1e-3) { this.model.position.y = this.baseY; this.sitDrop = 0; if (this.sitState === 'rising' && this.sitTarget === 0) { this.sitState = 'stand'; this.seated = false; this.pose = null; } return; }
    if (this.sitTarget === 1 && this.sitW >= 1) this.sitState = 'seated';
    this.root.updateMatrixWorld(true);
    const U = new THREE.Vector3(0, 1, 0), yawF = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // pelvis onto the seat (4 cm above its top), legs: thighs forward and down, shins nearly straight down
    const drop = (this.pelvisY0 - (this.sitSeatTop + 0.04)) * w; this.sitDrop = drop;
    const th = yawF.clone().multiplyScalar(0.82).add(U.clone().multiplyScalar(-0.57)).normalize();
    const sh = U.clone().multiplyScalar(-0.96).add(yawF.clone().multiplyScalar(0.18)).normalize();
    for (const side of ['l', 'r']) { this.aim('thigh_' + side, th, w); this.aim('shin_' + side, sh, w); }
    this.model.position.y = this.baseY - drop; this.model.updateMatrixWorld(true);
  }
  applyProcedural() {
    const t = this.waveT, B = this.bones, R = this.rest;
    // bones this procedure touches start from their rest pose each frame (the idle clip barely moves them, and a
    // relative rotation applied to a bone the mixer does not rewrite would pile up frame after frame)
    for (const n of ['head', 'upperarm_r', 'forearm_r']) if (R[n]) B[n].quaternion.copy(R[n]);
    for (const n in R) if (!this.keyed.has(n)) B[n].quaternion.copy(R[n]);
    const rot = (n, x, y, z) => { const b = B[n]; if (!b) return; if (!this.keyed.has(n)) b.quaternion.copy(R[n]); b.quaternion.multiply(_q.setFromEuler(new THREE.Euler(x, y, z, 'XYZ'))); };
    this.applySit();
    if (t < 0) return;
    this.root.updateMatrixWorld(true);
    const ease = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
    // timeline: hesitate (0.0-0.5), eager jerk up (0.5-1.0), wave 1.0-3.9, sheepish drop 3.9-4.7
    const lift = t < 0.5 ? ease(t / 0.5) * 0.35 : 0.35 + ease((t - 0.5) / 0.5) * 0.65;
    const up = lift * (1 - ease((t - 3.9) / 0.8));
    const wig = Math.sin(t * 16) * ease((t - 0.9) / 0.3) * (1 - ease((t - 3.7) / 0.5));
    const U = new THREE.Vector3(0, 1, 0);
    const right = _v.copy(B.upperarm_r.getWorldPosition(new THREE.Vector3())).sub(B.upperarm_l.getWorldPosition(new THREE.Vector3())); right.y = 0; right.normalize();
    const R3 = right.clone(), F3 = new THREE.Vector3().crossVectors(U, R3).normalize();
    // upper arm: out and (too) high; forearm: straight up with the wiggle swinging it side to side
    const du = R3.clone().multiplyScalar(0.78).add(U.clone().multiplyScalar(0.42)).add(F3.clone().multiplyScalar(0.22)).normalize(); // out and up: an eager arm
        this.aim('upperarm_r', du, up);
    const df = U.clone().add(R3.clone().multiplyScalar(0.1 + wig * 0.85)).add(F3.clone().multiplyScalar(0.3)).normalize();
    this.aim('forearm_r', df, up);
    // shy shrug and a head tilt that arrive a beat late; the other arm stays stiffly at the side
    const shy = ease((t - 0.9) / 0.5) * (1 - ease((t - 3.9) / 0.6));
    this.rotW('head', F3, -0.13 * shy); // a shy tilt toward the raised hand (about the forward axis)
  }
}
