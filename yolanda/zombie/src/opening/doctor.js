// The doctor in Floor 7's operating room (2026-10-22, the user: "add the doctor — I think Chad — hiding scared behind the
// surgery table ... after Yola kills the first couple of zombies in that room, a cut scene: the camera starts on the open
// vaccine case, he closes it, then he grabs it and runs off with it, carrying it in one hand"). The story's point: the
// doctor runs off with the hospital's vaccine (Chapter 2 is where Marc later finds the case).
// - Chad (the user's Mixamo pick) built by mixamo_zombie_prep.py + tools/opening/doctor_clips.py: assets/opening/doctor_chad.glb
//   (real clips only: Tripo's scared_02 while he hides, UAL Chest_Open played backwards to shut the lid, PickUp_Table, Sprint).
// - The case: the user's model with its inside (foam, four vials): assets/opening/vaccine_case_open.glb
//   (tools/opening/case_open_for_game.py); its Open_Lid_110deg action played backwards shuts it.
// - While he runs he carries it as Marc does: render/casecarry.js (the same hold the Rig Lab's Case section sets up).
// From the hand-off on (opening.ambient): he hides between the table and the anesthesia cart, the case lying open on the
// table. Once two of the OR's zombies are down (and their bodies have settled), the scene plays over the live game: the
// sim keeps running (bodies settle, Yola idles) but no input reaches her and the OR's other zombies stand still; the
// camera is the scene's. Then the game camera snaps back, and level flag doctor_fled keeps him gone for saves and retries.
import * as THREE from 'three';
import { ikArm } from '../render/ik.js';
import { caseRig, casePose, casePlace, caseFit } from '../render/casecarry.js';
import { OR_TABLE } from '../core/chapter.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TOP = 0.935; // the operating table's pad (measured: raycast in the OR)
// the staging, world metres (the table x -3.79..-3.01, z -9.58..-7.92; the anesthesia cart x -5.45..-4.75, z -10.25..-9.15)
export const DOC = {
  height: 1.78,
  hide: { x: -4.35, z: -8.6, yaw: Math.PI / 2 }, // on the table's far side from the game camera, facing across it (here the surgical lamp never hides his head from where Yola stands: measured)
  caseAt: { x: OR_TABLE.x - 0.12, y: TOP, z: -8.72, yaw: -Math.PI / 2 }, // open on the pad, its handle to him, the lid hinged on the far side
  path: [[-4.45, -7.5], [-5.2, -4.4], [-7.2, -3.7], [-10.5, -3.6], [-14.5, -3.9]], // round the table's foot, out of the west door into Sterile Supply
  speed: 4.4, // m/s (the sprint's feet: doc_Sprint covers ~3.1 strides of 1.4 m a second at his height)
  kills: 2, settle: 1.4, // two of the OR's zombies down, then the bodies' fall before the cut
  fit: { swing: 22, out: 6, lift: 2, turn: 0, size: 100 }, // the carry (render/casecarry.js CASE0, the true-size case)
  // the shots: camera, target, lens (held; hard cuts between them). A: the open case, B: the pick-up, C: out of the door
  step: 0.24, // (up from his hiding place he steps in to the table: the lid and the handle in his reach)
  shotA: { c: V(-4.25, 1.7, -7.75), t: V(-3.6, 0.97, -8.72), fov: 42 }, // (from his side, low over the table: the vials in their foam, the lid standing behind)
  shotB: { c: V(-2.2, 1.55, -7.0), t: V(-3.85, 1.0, -8.55), fov: 46 }, // (across the table: the shut case on the pad, then in his hand)
  shotC: { c: V(-3.0, 2.8, -8.4), t: V(-6.0, 0.1, -3.9), fov: 44 }, // (behind him, down on the west door: he runs into the frame and out through it; looking down, no sky over the cut-aways)
};
// the scene's clock (seconds): the close (Chest_Open backwards from CLOSE_FROM), the lid falling shut, the cut to B, the
// pick-up (PickUp_Table from PICK_FROM; the handle in his fist at GRAB), the turn into the run, the cut to C
const T = { close: 0.75, cutB: 1.8, pick: 1.85, run: 2.4, cutC: 2.75, end: 5.2 };
const CLOSE_FROM = 1.1, LID_SHUT = [0.12, 0.6], PICK_FROM = 0.08, GRAB = 0.33;

export class Doctor {
  constructor(op) { this.op = op; this.state = 'off'; }
  async load(loader) {
    const [g, c] = await Promise.all([loader.loadAsync('assets/opening/doctor_chad.glb'), loader.loadAsync('assets/opening/vaccine_case_open.glb')]);
    const m = (this.model = g.scene); m.scale.setScalar(DOC.height);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.root = new THREE.Group(); this.root.name = 'doctor'; this.root.add(m); this.root.visible = false; this.op.scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(m); this.clips = Object.fromEntries(g.animations.map((k) => [k.name, k]));
    const B = (n) => m.getObjectByName('mixamorig' + n); this.B = B;
    this.arm = [B('LeftArm'), B('LeftForeArm'), B('LeftHand')];
    const bones = Object.fromEntries(['LeftArm', 'LeftForeArm', 'LeftHand', ...['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3].map((i) => 'LeftHand' + f + i))].map((n) => [n, B(n)]).filter(([, b]) => b));
    this.rig = caseRig(m, bones, fistOf(this.clips.doc_Jog, B)); this.fit = caseFit(DOC.fit);
    // the case: its lid on its own mixer, held at any opening (0 shut .. 1 open)
    const cs = (this.case = c.scene); cs.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); cs.visible = false; this.op.scene.add(cs);
    this.lidMixer = new THREE.AnimationMixer(cs); const lc = c.animations.find((a) => /Open_Lid/.test(a.name)) || c.animations[0];
    this.lid = this.lidMixer.clipAction(lc); this.lid.play(); this.lid.paused = true; this.lidLen = lc.duration;
    // the lid's front edge (where his hand presses it shut), in the lid's own frame
    const lidMesh = cs.getObjectByName('CaseLid'), bb = new THREE.Box3(); // (one mesh per material under it: their boxes in its frame)
    lidMesh.updateMatrixWorld(true); const inv = lidMesh.matrixWorld.clone().invert();
    lidMesh.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
    this.lidMesh = lidMesh; this.lidPress = V((bb.min.x + bb.max.x) / 2, bb.max.y, bb.max.z - 0.05);
    this.grip = cs.getObjectByName('CarryGrip');
  }
  setLid(u) { this.lid.time = clamp(u, 0, 1) * this.lidLen * 0.999; this.lidMixer.update(0); this.case.updateMatrixWorld(true); }
  play(name, { fade = 0.3, once = false, from = 0, rate = 1 } = {}) {
    const c = this.clips[name]; if (!c) return null;
    const a = this.mixer.clipAction(c); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once;
    a.reset(); a.time = from; a.timeScale = rate; a.play();
    if (this.cur && this.cur !== a) this.cur.crossFadeTo(a, fade, false); this.cur = a; return a;
  }
  // the hiding pose and the open case: at the hand-off, and again whenever a new run of Floor 7 starts without him gone
  hideAgain() {
    const H = DOC.hide; this.state = 'hide'; this.t = 0; this.downAt = null; this.carryW = 0; this.att = null; this.closing = this.picking = this.running = false; this.shot = null;
    this.x = H.x; this.z = H.z; this.yaw = H.yaw; this.path = DOC.path.map(([x, z]) => ({ x, z }));
    this.mixer.stopAllAction(); this.cur = null; this.play('doc_Scared', { fade: 0 }); this.mixer.update(Math.random() * 2);
    const C = DOC.caseAt; this.case.position.set(C.x, C.y, C.z); this.case.quaternion.setFromAxisAngle(V(0, 1, 0), C.yaw); this.case.scale.setScalar(1);
    this.setLid(1); this.case.visible = true; this.root.visible = true; this.place();
  }
  gone() { this.state = 'gone'; this.root.visible = false; this.case.visible = false; }
  off() { if (this.state === 'scene') this.endScene(true); this.state = 'off'; this.root.visible = false; if (this.case) this.case.visible = false; this.simRef = null; }
  place() { this.root.position.set(this.x, 0, this.z); this.root.rotation.y = this.yaw; this.root.updateMatrixWorld(true); }

  // every frame after the hand-off (opening.ambient)
  tick(dt) {
    if (!this.model) return;
    const g = this.op.game(), sim = g?.sim, L = sim?.level;
    if (!L || L.floor !== 7) { if (this.state !== 'off') this.off(); return; }
    if (sim !== this.simRef) { this.simRef = sim; if (this.state === 'scene') this.endScene(true); if (L.flags.doctor_fled) this.gone(); else this.hideAgain(); } // (a new run of the floor: a retry, a save, the hand-off)
    if (this.state === 'gone' || this.state === 'off') return;
    if (document.getElementById('menu')?.classList.contains('show')) dt = 0; // (the pause menu stops his clock too)
    if (this.state === 'hide') {
      this.mixer.update(dt);
      const or = sim.zombies.filter((z) => z.group === 'or'), down = or.filter((z) => !z.alive).length;
      if (down >= DOC.kills && this.downAt == null) this.downAt = sim.time;
      if (this.downAt != null && sim.time - this.downAt >= DOC.settle && !g.execActive && !sim.player.dead && dt > 0) this.startScene(g, sim);
      return;
    }
    if (this.state === 'scene') this.tickScene(dt, g, sim);
  }

  startScene(g, sim) {
    this.state = 'scene'; this.t = 0; this.shot = null;
    // the world holds its breath: no input reaches Yola, the OR's other zombies stand where they are and do not attack
    // (held again every frame: one still dormant may wake on its timer meanwhile; endScene gives it its woken values)
    this.held = sim.zombies.filter((z) => z.alive && z.group === 'or').map((z) => ({ z, passive: z.passive, speedMul: z.speedMul, D: z.dormant }));
    this.hold();
    this.prevInput = g.scriptInput; g.scriptInput = () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, swapPresses: 0, usePresses: 0, dodgePresses: 0 });
    g.camFree = true; g.hudShow(false); this.op.ui.again(false);
    const db = document.getElementById('dodgeBtn'); if (db) db.style.visibility = 'hidden';
    const c = this.op.camera; this.cam0 = { fov: c.fov, near: c.near }; c.near = 0.05;
    this.play('doc_Idle', { fade: 0.55 }); // (he straightens out of his fright behind the table)
  }
  endScene(abort = false) {
    const g = this.op.game(), sim = g?.sim;
    for (const h of this.held || []) { const woke = h.D && !h.z.dormant; h.z.passive = woke ? false : h.passive; h.z.speedMul = woke ? h.D.speedMul : h.speedMul; } this.held = null;
    if (g) { g.scriptInput = this.prevInput || null; g.camFree = false; g.hudShow(true); }
    this.op.ui.again(true);
    const db = document.getElementById('dodgeBtn'); if (db) db.style.visibility = '';
    const c = this.op.camera; if (this.cam0) { c.fov = this.cam0.fov; c.near = this.cam0.near; c.updateProjectionMatrix(); }
    if (g && sim?.player) { const p = sim.player; g.cameraPose(p.x, p.z, p.aimYaw); }
    if (!abort) { if (sim?.level) sim.level.flags.doctor_fled = true; this.gone(); }
  }
  hold() { for (const h of this.held || []) { h.z.passive = true; h.z.speedMul = 0; } }
  cut(S) {
    if (this.shot === S) return; this.shot = S;
    const c = this.op.camera; c.position.copy(S.c); c.fov = S.fov; c.updateProjectionMatrix(); c.lookAt(S.t); c.updateMatrixWorld(true);
  }

  tickScene(dt, g, sim) {
    const t = (this.t += dt); this.hold();
    // the clips, by the scene's clock
    if (t >= T.close && !this.closing) { this.closing = true; this.play('doc_ChestOpen', { fade: 0.35, once: true, from: CLOSE_FROM, rate: -1 }); }
    if (t >= T.pick && !this.picking) { this.picking = true; this.play('doc_PickUp', { fade: 0.15, once: true, from: PICK_FROM }); }
    if (t >= T.run && !this.running) { this.running = true; this.play('doc_Sprint', { fade: 0.3 }); }
    this.mixer.update(dt);
    // the lid falls shut under his left hand; his hand on its front edge as it goes (and the handle when he takes it)
    const r = t - T.close;
    if (r > 0 && t < T.cutB) this.setLid(1 - ease((r - LID_SHUT[0]) / (LID_SHUT[1] - LID_SHUT[0])) ** 1.6);
    // the run: down the path, turned the way he goes
    if (this.running) {
      const w = this.path[0];
      if (w) { const dx = w.x - this.x, dz = w.z - this.z, d = Math.hypot(dx, dz), s = DOC.speed * Math.min(1, (t - T.run) / 0.35 + 0.25) * dt;
        if (d <= s) this.path.shift(); else { this.x += (dx / d) * s; this.z += (dz / d) * s; }
        if (d > 0.05) { const want = Math.atan2(dx, dz), dy = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)); this.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 7); } }
    } else if (t < T.close) { const u = ease(t / T.close), H = DOC.hide; this.x = H.x + Math.sin(H.yaw) * DOC.step * u; this.z = H.z + Math.cos(H.yaw) * DOC.step * u; }
    else if (this.picking && t > T.pick + 0.42) { const want = Math.atan2(DOC.path[0][0] - this.x, DOC.path[0][1] - this.z), dy = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)); this.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 5); }
    this.place();
    // the left hand: onto the lid's edge while it shuts, onto the handle as he takes it
    const tgt = V(0, 0, 0); let iw = 0;
    if (r > 0 && t < T.cutB) { iw = clamp(r / 0.2, 0, 1) * clamp((1.0 - r) / 0.3, 0, 1); this.lidMesh.localToWorld(tgt.copy(this.lidPress)); tgt.y += 0.02; }
    const pr = t - T.pick - (GRAB - PICK_FROM);
    if (this.picking && !this.att) { iw = clamp(1 + pr / 0.18, 0, 1); this.grip.getWorldPosition(tgt); }
    if (iw > 0) ikArm(this.arm[0], this.arm[1], this.arm[2], tgt, iw);
    // the case: lifted by its handle at the grab, then hanging in his fist as Marc carries it
    if (this.picking && !this.att && pr >= 0) { // (held as it lay: its place in the hand's frame, kept while the carry comes in)
      this.arm[2].updateMatrixWorld(true);
      this.att = new THREE.Matrix4().copy(this.arm[2].matrixWorld).invert().multiply(this.case.matrixWorld);
    }
    if (this.att) {
      this.carryW = this.running ? Math.min(1, this.carryW + dt / 0.35) : 0;
      this.root.updateMatrixWorld(true);
      if (this.carryW > 0) casePose(this.rig, this.fit, ease(this.carryW), this.root.getWorldDirection(V(0, 0, 0)).setY(0).normalize(), DOC.height);
      const held = new THREE.Matrix4().multiplyMatrices(this.arm[2].matrixWorld, this.att), p = V(0, 0, 0), q = new THREE.Quaternion(), s = V(1, 1, 1);
      held.decompose(p, q, s);
      if (this.carryW > 0) { const o = new THREE.Object3D(); casePlace(this.rig, o, this.fit); const k = ease(this.carryW); p.lerp(o.position, k); q.slerp(o.quaternion, k); }
      this.case.position.copy(p); this.case.quaternion.copy(q); this.case.scale.setScalar(this.fit.size / 100); this.case.updateMatrixWorld(true);
    }
    // the shots
    if (t < T.cutB) this.cut(DOC.shotA); else if (t < T.cutC) this.cut(DOC.shotB); else this.cut(DOC.shotC);
    // out of the door: once he is off the wide shot (or the path is done), back to the game
    if (t >= T.cutC && (t >= T.end || !this.path.length || (t > T.cutC + 0.6 && this.offScreen()))) this.endScene();
  }
  offScreen() { // (his head, hips and feet all off the frame, as the reveal's walk-out does)
    const c = this.op.camera; c.updateMatrixWorld(true);
    return ['Head', 'Hips', 'LeftFoot', 'RightFoot'].every((n) => { const p = this.B(n).getWorldPosition(V(0, 0, 0)).project(c); return Math.abs(p.x) > 1.02 || Math.abs(p.y) > 1.02 || p.z > 1; });
  }
}

// the left hand's loose fist: the finger rotations a clip starts on (as the neighbourhood's looters take theirs)
function fistOf(clip, B) {
  const out = []; if (!clip) return out;
  for (const t of clip.tracks) {
    const [bn, prop] = t.name.split('.'); if (prop !== 'quaternion' || !/LeftHand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(bn)) continue;
    const b = B(bn.replace(/^mixamorig:?/, '')), v = t.values;
    if (b) out.push([b, new THREE.Quaternion(v[0], v[1], v[2], v[3])]);
  }
  return out;
}
