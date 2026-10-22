// Clip-driven characters (Tripo meshes on mixamorig skeletons, Mixamo + Tripo clips).
// Locomotion clips are blended by local velocity and played at the speed that matches actual travel
// (root motion stripped), so feet do not skate. Small additive corrections (aim alignment, recoil,
// hit flinch) are applied after the mixer in character ("container") space.
import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makePistol, makeBat, prepPumpShort, prepShell, prepAxe, prepPistolCore, PISTOL_CORE_SCALE } from './weaponModels.js';
import { ikArm as solveArm } from './ik.js';
import { AXE_ATTACKS, BAT_ATTACKS, FIST_ATTACKS, LEG_ATTACKS, attacksOf, attackFrame, attackEnd, SHOTGUN_SPEC, isMelee, groundAttack } from '../core/weapons.js';
import { describeRagdoll, RagdollDriver, SEVER_PART, frameQuat } from './physics/ragdoll.js';
import { ShieldController } from './ShieldController.mjs';
import { shieldState } from '../core/zombies.js';
import { tankPos } from '../core/loose.js';
import { propClone } from './roomprops.js';
import { HairSway } from './hairsway.js';
import { placeOneHanded, placeBat, twoHandLine, applyFit, magInsert, placeShell, SHELL_INSERT, handOnto, handleSpot, reachShoulder, CARRY, carryCalibrate, carryPlace, gripOpts } from './holdfit.js';
import { applyPosture, postureFamily, POSTURE_BONES } from './posture.js';
import { HOLD_LAYERS, AS_LIVE } from './holdlayers.js';
import { adjustArms, blendArms } from './armpose.js';
import { radioRig, radioPose, radioPlace, radioFit } from './radiohold.js';
import { caseRig, casePose, casePlace, caseFit } from './casecarry.js';
const FIT0 = { size: 100, fwd: 0, up: 0, side: 0, tilt: 0, turn: 0, roll: 0 };
function lerpFit(a, b, t) { // two weapon fits blended (the stance's own and the attacks')
  a ||= FIT0; b ||= FIT0; if (t <= 0) return a; if (t >= 1) return b;
  const o = { ...a }; for (const k in FIT0) o[k] = (a[k] ?? FIT0[k]) + ((b[k] ?? FIT0[k]) - (a[k] ?? FIT0[k])) * t; return o;
}
const AXE_AT = new THREE.Vector3(); // (the axe's and the shotgun's model origin is their grip point)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (u) => u * u * (3 - 2 * u);
const FIT_DEFAULTS = { size: 100, fwd: 0, up: 0, side: 0, tilt: 0, turn: 0, roll: 0, lDown: 0, lSide: 0 }; // (a weapon fit's fields: render/holdfit.js applyFit, + the shotgun's left-hand nudge)
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _ik = new THREE.Vector3(), _ikg = new THREE.Vector3(), _ikh = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const LOWER = /Hips|UpLeg|Leg|Foot|Toe/;
const HOLD_T = 1 / 30 + 2e-4; // the shotgun hold is frame 1 of its clip (evaluated at exactly the first key time it is skipped)
const PISTOL_MAGS = { drop: 6, grab: 13, insert: 23, seat: 28 }; // pistol_reload frames (see placeMags)
const MAG_SEAT = new THREE.Vector3(-0.008, -0.039, 0); // a seated magazine in the pistol model's own frame (the props' pistol_seated_translation)
const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4();
// the pistol model's grip (measured on pistol_core.glb, as the Rig Lab): the fist's point on it, its grip line, the barrel
const PG_AT = new THREE.Vector3(0, 0.005, 0.0026), PG_AXIS = new THREE.Vector3(0, 0.9509, 0.3094).normalize();
const PG_BARREL = new THREE.Vector3(0, 0, 1).addScaledVector(PG_AXIS, -PG_AXIS.z).normalize(); // (square to the grip line)
const _pf = new THREE.Vector3(), _pf2 = new THREE.Vector3(), _pf3 = new THREE.Vector3(), _pf4 = new THREE.Vector3();

function angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return d; }

// Remove horizontal root motion from the Hips position track (keep the vertical bob).
// Horizontal hips position is pinned to the skeleton's rest position (not the clip's first frame,
// which is off-centre in several Mixamo clips).
function stripRoot(clip, rest) {
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const v = t.values, x0 = rest ? rest.x : v[0], z0 = rest ? rest.z : v[2];
    // (the finishers keep their travel aside, in the hips' own units: the game moves her by it, render/newmoves.js; x too: the
    // shotgun slide bends 25 cm to her left as it passes the zombie. The model is X-mirrored from the hub: her left is +x here)
    if (/^hub_execution_/.test(clip.name) && !clip.travel) clip.travel = { times: Array.from(t.times), z: Array.from({ length: v.length / 3 }, (_, i) => v[i * 3 + 2]), x: Array.from({ length: v.length / 3 }, (_, i) => v[i * 3]) };
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
// three.js's mixer only writes a bone when its blended value differs from what it wrote last update (PropertyMixer.apply
// compares its two accumulation buffers). Yola's bones are put back to rest before each update (restQ), so a bone whose
// value held still (a constant track, a held frame: fingers, a shoulder) was never written again and stayed at REST: in
// the game her fingers were open and her right shoulder 10 deg off the clip (found 2026-10-17; the Rig Lab undoes its own
// changes instead, so it showed the clips right). Spoiling the "last written" buffers makes the next update write every
// bound value. (private: AnimationMixer._bindings, PropertyMixer.buffer = [incoming, accu0, accu1, original, ...])
export function mixerWritesAll(mixer) {
  for (const b of mixer._bindings) { const n = b.valueSize, buf = b.buffer; for (let i = n; i < 3 * n; i++) buf[i] = NaN; }
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
      // matte cotton (the new Yola's scrubs, tools/anim/yola2_cloth.py): the metal-roughness map's red channel says how
      // much shine each texel keeps (cloth 0.3, everything else 1), applied to the specular reflection and its rim
      if (m.userData?.clothSpec && m.roughnessMap) {
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_ROUGHNESSMAP\n  material.specularColor *= texelRoughness.r; material.specularF90 *= texelRoughness.r;\n#endif'); };
        m.customProgramCacheKey = () => 'clothSpec';
      }
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
// The dodge and the vault (core/player.js DODGE / VAULT): their clips (assets/yola2_ual.glb, Quaternius UAL1 / UAL2) and the
// frames played over the action (the side dodges start crouched and are standing by frame ~36 of 40; the roll is up by
// ~40 of 45; the vault is a running vault, 23 frames, its hips lifted ~0.75 m over the prop)
const OVERLAY_CLIPS = { left: { clip: 'ual1_Dodge_Left', f0: 1, f1: 36 }, right: { clip: 'ual1_Dodge_Right', f0: 1, f1: 36 }, roll: { clip: 'ual1_Roll', f0: 1, f1: 40 }, vault: { clip: 'ual_SafetyVault', f0: 1, f1: 23 } };
export const OVERLAY_NAMES = Object.values(OVERLAY_CLIPS).map((m) => m.clip);
// Locomotion clips: travel direction in character space (x = left, z = forward) and gait family.
const LOCO = {
  pistol_walk: { dir: [0, 1] }, pistol_run: { dir: [0, 1] },
  pistol_walk_back: { dir: [0, -1] }, pistol_run_back: { dir: [0, -1] },
  pistol_strafe_left: { dir: [1, 0] }, pistol_strafe_run_left: { dir: [1, 0] },
  pistol_strafe_right: { dir: [-1, 0] }, pistol_strafe_run_right: { dir: [-1, 0] },
};
// walk and run clip for each travel direction key (f, b, l = left, r = right)
// unarmed locomotion: the same gait slots played by gun-free Mixamo clips (arms swing like a normal run)
const UNARMED = { pistol_walk: 'p_run_plain', pistol_run: 'p_run_plain', pistol_walk_back: 'p_run_back_plain', pistol_run_back: 'p_run_back_plain',
  pistol_strafe_left: 'p_walk_strafe_left_plain', pistol_strafe_run_left: 'p_run_strafe_left_plain', pistol_strafe_right: 'p_walk_strafe_right_plain', pistol_strafe_run_right: 'p_run_strafe_right_plain' };
const GAIT = { f: ['pistol_walk', 'pistol_run'], b: ['pistol_walk_back', 'pistol_run_back'], l: ['pistol_strafe_left', 'pistol_strafe_run_left'], r: ['pistol_strafe_right', 'pistol_strafe_run_right'] };

export class YolaView extends ClipBody {
  constructor(scene, gltf, clipdata, weapons) {
    const H = weapons.height || 1.62; // (Yola 1.62 m; Marc 1.80, main.js)
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
    const unarmed = Object.values(UNARMED).every((n) => byName[n]);
    if (unarmed) for (const n in UNARMED) {
      const c = byName[UNARMED[n]].clone(); c.name = n + '_u'; loopClip(c); clips.push(c);
      const cl = subClip(c, (b) => LOWER.test(b), n + '_ul'); loopClip(cl); clips.push(cl); // (its legs only: the bat run option 'plainlegs')
    }
    { const tl = subClip(byName.tripo_idle, (b) => LOWER.test(b), 'tripo_idle_lower'); loopClip(tl); clips.push(tl); } // unarmed standing: Yola's own idle legs (front-on, not the pistol stance)
    clips.push(subClip(byName.bat_idle, (b) => !LOWER.test(b), 'bat_idle_upper'));
    clips.push(subClip(byName.pistol_reload, (b) => !LOWER.test(b), 'pistol_reload_upper'));
    // shotgun: held at the low ready (frame 1 of X Bot's rifle reload, retargeted straight onto her: 2026-10-17, the old
    // hand-made 52 deg spine twist is gone, kept in yola2_work.blend as sg_reload_twisted_OLD); the clip itself is the
    // reload. Its upper body keeps the clip's own heading over the legs (rebaseUpper), so the gun stays on the aim
    clips.push(subClip(byName.sg_reload, (b) => !LOWER.test(b), 'shotgun_hold_upper'));
    clips.push(subClip(byName.sg_reload, (b) => !LOWER.test(b), 'shotgun_reload_upper'));
    clips.push(subClip(byName.tripo_idle, (b) => !LOWER.test(b), 'fists_idle_upper')); // unarmed: Yola's own idle on the upper body
    const melee = [...new Set([...AXE_ATTACKS, ...BAT_ATTACKS, ...FIST_ATTACKS, LEG_ATTACKS.axe].map((A) => A.clip))].filter((n) => byName[n]); // (the new Yola has no reference-video bat combo)
    clips.push(...melee.map((n) => byName[n]), byName.death_fall, byName.death_defeat, byName.pistol_hit);
    const scriptNames = ['t_greet_01', 't_greet_04', ...Object.keys(byName).filter((n) => n.startsWith('hood_'))].filter((n) => byName[n]); // scripted full-body clips (the reveal's smooth wave; Chapter 2's hood_* moves: the radio, the fridge)
    for (const n of scriptNames) clips.push(byName[n]);
    super(scene, gltf.scene, H, clips);
    this.byName = byName; // (every clip of her file, root stripped: the carries' idles, setTestWeapon)
    this.H = H; this.scriptNames = scriptNames; this.unarmed = unarmed;
    // rest rotations: every frame starts from these, so the corrections applied after the mixer (aim,
    // hip turn, IK) never pile up on bones that the current clips do not key (constant tracks are
    // dropped at export, e.g. a spine bone the shotgun hold never moves)
    this.restQ = Object.values(this.bones).map((b) => [b, b.quaternion.clone()]);
    // her face's forward in the Head bone's own frame, from the bind pose (the model faces +Z): headLook turns it onto the aim
    if (this.bones.Head) { this.outer.updateMatrixWorld(true); this.container.getWorldQuaternion(_q2); this.bones.Head.getWorldQuaternion(_q3); this.faceFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q2.invert().multiply(_q3).invert()); }
    this.lookW = 0;
    const sufs = this.unarmed ? ['', '_lower', '_u', '_ul'] : ['', '_lower'];
    // how she runs with the one-handed bat (2026-10-16, options for the user to compare; ?batrun= or game.yola.batRun):
    //   'now'       the pistol jog's legs + the sword idle's upper body, as it was
    //   'rebase'    the same, the sword idle's spine re-based onto the running hips (as the shotgun / reload layers)
    //   'plain'     moving: the regular run / strafe clips in full (arms swing, the bat in her hand); standing: sword idle
    //   'plainlegs' the regular runs' legs + the sword idle's upper body, re-based
    const q = new URLSearchParams(globalThis.location?.search || '');
    this.batRun = q.get('batrun') || 'plain'; // (the user, 2026-10-16: "plain looks the best", the bat arm calmed below)
    this.batArmHold = q.has('batarm') ? +q.get('batarm') : 0.5; // 'plain': how much of the sword stance the bat arm keeps while running
    this.batWristHold = q.has('batwrist') ? +q.get('batwrist') : 0.9; // ... and the bat hand (the bat's angle)
    for (const n of loco) for (const suf of sufs) { if (n === 'pistol_idle' && (suf === '_u' || suf === '_ul')) continue; const a = this.act(n + suf); a.play(); a.setEffectiveWeight(0); }
    { const tl = this.act('tripo_idle_lower'); tl.play(); tl.setEffectiveWeight(0); }
    this.gait = this.measureGaits();
    this.gaitU = this.unarmed ? this.measureGaits('_u') : null;
    // moving clips are driven from one shared gait phase (see locoWeights), not by the mixer clock
    for (const n in LOCO) for (const suf of sufs) this.act(n + suf).timeScale = 0;
    this.phase = 0; this.sv = { x: 0, z: 0 };
    this.act('bat_idle_upper').play(); this.act('bat_idle_upper').setEffectiveWeight(0);
    { const fi = this.act('fists_idle_upper'); fi.play(); fi.setEffectiveWeight(0); }
    const rl = this.act('pistol_reload_upper'); rl.play(); rl.setEffectiveWeight(0); rl.timeScale = 0;
    this.reloadFrames = Math.round(byName.pistol_reload.duration * 30); // Blender frames 1..N
    for (const n of melee) { const sw = this.act(n); sw.play(); sw.setEffectiveWeight(0); sw.timeScale = 0; }
    this.meleeClips = melee;
    for (const n of ['shotgun_hold_upper', 'shotgun_reload_upper']) { const a = this.act(n); a.play(); a.setEffectiveWeight(0); a.timeScale = 0; a.time = HOLD_T; }
    this.shotgunReloadFrames = Math.round(byName.sg_reload.duration * 30);
    // upper-body layers ride on the legs' hips; each keeps the hip rotation of its own source clip so
    // the torso is not tipped by a running lean or a turned strafe pelvis (see rebaseUpper)
    const hipsTrack = (c) => c.tracks.find((t) => /Hips.quaternion$/.test(t.name));
    this.upperHips = {};
    for (const [n, src] of [['shotgun_reload_upper', 'sg_reload'], ['shotgun_hold_upper', 'sg_reload'], ['pistol_reload_upper', 'pistol_reload']]) {
      const t = hipsTrack(byName[src]); if (t) this.upperHips[n] = t.createInterpolant(new Float32Array(4));
    }
    this.pistol = weapons.pistol ? prepPistolCore(weapons.pistol) : makePistol(1); // (the pack pistol; the built-in one if it fails to load)
    // the pistol reload's magazines (the user's props, 2026-10-17; see placeMags): the empty one falls in the world, the
    // loaded one rides the pistol model (its frame and scale); the pistol's own magazine plate hides while they play
    const prepMag = (g) => { const o = g.scene; o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } }); o.visible = false; return o; };
    this.magEmpty = weapons.magEmpty ? prepMag(weapons.magEmpty) : null; if (this.magEmpty) scene.add(this.magEmpty);
    this.magLoaded = weapons.magLoaded ? prepMag(weapons.magLoaded) : null;
    this.magArt = this.pistol.children[0]?.getObjectByName?.('Pistol_Magazine_Art') || null;
    this.magFall = null; this.pistolReloadFrame = -1;
    this.pistolFit = weapons.pistolFit || null; // (the user's Rig Lab fit for this Yola; see pistolInFist)
    this.pistolPlace = new URLSearchParams(globalThis.location?.search || '').get('pistolplace') || 'fist';
    this.postureOff = new URLSearchParams(globalThis.location?.search || '').get('posture') === '0'; // (?posture=0: without the posture fix)
    this.sgOwnHeading = new URLSearchParams(globalThis.location?.search || '').get('sghead') !== 'legs'; // (see rebaseUpper)
    this.shotgun = prepPumpShort(weapons.shotgun);
    this.shell = prepShell(weapons.shell); this.shell.visible = false; scene.add(this.shell);
    this.melee = prepAxe(weapons.axe);
    this.melee.userData.axeInner = this.melee.children[0];
    this.batModel = makeBat(); this.batModel.visible = false; this.melee.add(this.batModel); // the picked-up bat shares the melee socket
    scene.add(this.pistol, this.shotgun, this.melee);
    for (const n of this.scriptNames) { const a = this.act(n); a.play(); a.setEffectiveWeight(0); a.timeScale = 0; }
    this.script = null;
    this.up = { pistol: 1, shotgun: 0, axe: 0, fists: 0, carry: 0 }; // upper-body hold weights, cross-faded through swaps (carry: a two-handed weapon at rest, render/holdfit.js CARRY)
    this.flinch = new Spring2(120, 13);
    this.prevHurt = 99; this.deathT = -1; this.yaw = Math.PI;
    this.muzzleWorld = new THREE.Vector3();
    this.batTip = new THREE.Vector3();
    this.weights = {};
    this.calibrateBatSocket(clipdata);
    this.calibratePistolSocket();
    this.calibrateShotgunSocket();
    this.calibrateMeleeSockets(clipdata);
    // planted-foot weights per clip frame (melee clips retargeted with them: tools/mocap), for footLock
    this.contacts = {};
    for (const [k, smp] of Object.entries(clipdata || {})) if (Array.isArray(smp) && smp[0]?.cL !== undefined) this.contacts[k] = { f0: smp[0].f, L: smp.map((q) => q.cL), R: smp.map((q) => q.cR) };
    this.bladeQ = new THREE.Quaternion(); this.prevTip = new THREE.Vector3(); this.bladeInit = false;
    this.hair = new HairSway(this.bones); // the new Yola's ponytail sway (no hair bones on the first Yola: does nothing)
  }

  // Axe socket for each attack: the handle direction sampled in Blender (clipdata[path].d at the attack's
  // first frame, character space; each clip family grips differently) expressed in this hand's frame.
  calibrateMeleeSockets(clipdata) {
    this.meleeSocket = {};
    for (const A of [...AXE_ATTACKS, ...BAT_ATTACKS, LEG_ATTACKS.axe]) {
      if (A.built) continue;
      const smp = clipdata?.[A.path]?.find((q) => q.f === A.f0);
      if (!smp?.d) continue;
      for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
      const act = this.act(A.clip); if (!act) continue; act.time = A.f0 / (A.fps || 30); act.setEffectiveWeight(1);
      this.container.rotation.y = 0; this.outer.position.set(0, 0, 0);
      this.mixer.update(0); this.container.updateMatrixWorld(true);
      this.container.getWorldQuaternion(_q2); this.bones[(A.hand || 'Right') + 'Hand'].getWorldQuaternion(_q3);
      const handC = _q2.invert().multiply(_q3);
      this.meleeSocket[A.sock || A.name] = new THREE.Vector3(...smp.d).applyQuaternion(handC.invert()).normalize();
      act.setEffectiveWeight(0);
    }
  }

  // Shotgun socket on the right hand: in the hold pose the barrel runs from the right hand to the left
  // (which cups the pump), kept level side to side. The left hand is put on the pump by IK each frame.
  calibrateShotgunSocket() {
    for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
    const h = this.act('shotgun_hold_upper'), id = this.act('pistol_idle_lower');
    h.time = HOLD_T; h.setEffectiveWeight(1); id.time = 0; id.setEffectiveWeight(1);
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

  // Two-bone arm IK (render/ik.js): the hand reaches the world-space target, weight w
  // `target` is where the palm grip point (wrist/knuckle midpoint) should land, so the wrist aims short of it.
  ikArm(side, target, w) {
    const hand = this.bones[side + 'Hand'], t = _ik.copy(target);
    this.grip(side, _ikg); hand.getWorldPosition(_ikh); t.sub(_ikg.sub(_ikh));
    solveArm(this.bones[side + 'Arm'], this.bones[side + 'ForeArm'], hand, t, w);
  }

  // A grip target beyond the straight arm: the clavicle swings the shoulder toward it first (at most 15 degrees, the
  // way a reach across the body rolls the shoulder forward), so the hand gets there instead of stopping short.
  reachClavicle(side, target) { reachShoulder(this.bones, side, target); } // (render/holdfit.js, shared with the Rig Lab)

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

  // a scripted full-body clip played once at its natural rate, blended in/out over the normal layers
  // (loop: held, wrapping, until endScript() fades it out)
  playScript(name, { fadeIn = 0.3, fadeOut = 0.5, rate = 1, loop = false } = {}) {
    const act = this.act(name); if (!act) return false;
    const clip = act.getClip(), t0 = Math.min(...clip.tracks.map((t) => t.times[0]));
    this.script = { act, t: 0, t0, len: clip.duration - t0, fadeIn, fadeOut, rate, loop }; this.scriptDone = false;
    return true;
  }
  endScript() { const S = this.script; if (S && S.endAt === undefined) S.endAt = S.t + S.fadeOut; }
  scriptLength(name) { const c = this.act(name)?.getClip(); return c ? c.duration - Math.min(...c.tracks.map((t) => t.times[0])) : 0; }
  setShown(v) { this.outer.visible = v; this.blob.visible = v; if (!v) for (const g of [this.pistol, this.shotgun, this.melee, this.shell, this.test?.obj, this.batLib?.obj, this.axeLib?.obj]) if (g) g.visible = false; } // (the weapons live in the scene, not under the body: a hidden Yola must not leave a gun hanging)
  reset(x, z, yaw) {
    this.script = null; for (const n of this.scriptNames || []) this.act(n).setEffectiveWeight(0);
    this.yaw = yaw; this.deathT = -1; this.outer.quaternion.identity();
    this.backMode = false; this.backBlend = 0; this.hipYaw = 0; this.sv.x = this.sv.z = 0; this.spS = 0; this.lw = null; this.fl = null;
    for (const n of ['death_fall', 'death_defeat']) { this.act(n).stop(); }
  }

  // Measure each locomotion clip on this skeleton: planted-foot speed (m/s, = travel speed with no
  // skating), stride per cycle, and the phase at which the left foot reaches furthest along travel.
  measureGaits(suf = '') {
    const out = {}, L = new THREE.Vector3(), LT = new THREE.Vector3(), R = new THREE.Vector3(), RT = new THREE.Vector3();
    const all = Object.values(this.actions);
    this.container.rotation.y = 0; this.outer.position.set(0, 0, 0);
    for (const n in LOCO) {
      for (const a of all) a.setEffectiveWeight(0);
      const a = this.act(n + suf); a.setEffectiveWeight(1); a.timeScale = 0;
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
      if (this.gaitU) { const u = this.gaitU[n]; this.act(n + '_u').time = this.act(n + '_ul').time = ((this.phase + u.lead) % 1) * u.dur; }
    }
    return lw;
  }

  update(dt, s) {
    this.dtNow = dt;
    this.outer.position.set(s.x, 0, s.z);
    this.blob.position.set(s.x, 0.012, s.z);
    if (s.dead) { this.die(dt, s); return; }
    // a library weapon in her hand (render/libweapons.js): shown and held through the test-weapon path
    const lib = this.libHolds?.[s.equipped];
    if (lib && this.test !== lib) this.setTestWeapon(lib);
    if (lib) s = Object.assign({}, s, { equipped: 'test' });
    this.yaw = s.aimYaw;
    this.container.rotation.y = this.yaw;

    const w = this.locoWeights(s, dt);
    // upper body: pistol / shotgun / axe holds, cross-faded through the swap
    const rate = dt / Math.max(0.05, s.swapDur * 0.6);
    // the bat is held like the axe (bat idle), with its own model; a test-arena weapon like the axe (two hands) or empty-handed
    // (the one-handed bat has its own stance: the sword idle)
    const eqKey = s.equipped === 'bat' ? (this.batLib ? 'sword' : 'axe') : s.equipped === 'axe' && this.axeLib ? 'sword' : s.equipped === 'test' ? (HOLD_LAYERS.carry && this.test?.carry && this.carryCal?.[this.test.carry] ? 'carry' : this.test?.two ? 'axe' : 'fists') : s.equipped;
    this.batMode = s.equipped === 'bat' || (s.equipped === 'axe' && !!this.axeLib); // (the axe is held and swung as the bat since 2026-10-19)
    for (const k in this.up) this.up[k] += clamp((eqKey === k ? 1 : 0) - this.up[k], -rate, rate);
    const uP0 = smooth(this.up.pistol), uS0 = smooth(this.up.shotgun), uA0 = smooth(this.up.axe), uF0 = smooth(this.up.fists), uW0 = smooth(this.up.sword || 0), uC0 = smooth(this.up.carry || 0), un = uP0 + uS0 + uA0 + uF0 + uW0 + uC0 || 1;
    const uP = uP0 / un, uS = uS0 / un, uA = uA0 / un, uF = uF0 / un, uW = uW0 / un, uC = uC0 / un;
    // axe attacks: full-body clips driven by the simulation's attack time (exact sync with the hit test)
    let sW = 0, turn = 0, prevW = 0; // (prevW: the previous attack's pose still fading out)
    const A = s.action === 'swing' ? (s.atk || (s.ground ? groundAttack(s.equipped) : attacksOf(s.equipped)[s.combo])) : null;
    // A strike's own recovery clip (2026-10-17, Quaternius UAL2 Sword_Regular_A_Rec etc.: A.rec): it takes over on the very
    // frame the strike ends (it starts from that pose) and plays out, also after the action is over, as the settle back to
    // the stance; moving, shooting or dodging fades it, and the next strike blends in from wherever it got to (recCur)
    let swingActW = -1, R = this.recCur;
    if (A) {
      const t = s.swingT, tEnd = attackEnd(A), act = this.act(A.clip);
      if (this.swingId !== s.swingId) {
        // next attack of the combo: the previous clip fades out under the new one
        this.fromRec = !!(R && R.w > 0.02);
        if (this.fromRec) { this.prevSwing = R.act; this.prevSwingW = R.w; this.prevSwingName = this.swingName; this.prevSwingHand = this.swingHand; this.recCur = R = null; }
        else if (this.swingAct && this.swingAct !== act) { this.prevSwing = this.swingAct; this.prevSwingW = this.swingW || 1; this.prevSwingName = this.swingName; this.prevSwingHand = this.swingHand; }
        else if (this.swingAct === act && A.f0 < (this.clipF ?? 0) - 1) {
          // the same clip starting over (the bat combo again before its finisher settled: A.restartFrom): its pose fades
          // out on a copy of the clip, held where it was, while the clip itself jumps back to the opener (no snap)
          const ghost = this.ghostOf(act); ghost.time = act.time; ghost.setEffectiveWeight(this.swingW || 1);
          this.prevSwing = ghost; this.prevSwingW = this.swingW || 1; this.prevSwingName = this.swingName; this.prevSwingHand = this.swingHand;
        }
        // a strike chained late (the last one had begun to settle back to the stance): carry on from that weight, not 1
        this.chainW0 = A.continuous && s.combo > 0 ? (this.swingW ?? 1) : 1;
        this.swingId = s.swingId; this.swingAct = act; this.swingName = A.sock || A.name; this.swingHand = A.hand || 'Right'; this.swingBlend = A.blendIn || 0.1;
        if (this.prevSwing?.getClip().name.endsWith('__ghost')) this.swingBlend = Math.max(this.swingBlend, 0.2); // (the restart carries her arm ~1 m back: 0.1 s whipped)
      }
      this.clipF = attackFrame(A, Math.min(t, tEnd));
      act.time = this.clipF / A.fps + ((this.swJit ^= 1) * 1e-6); // glTF time = blender frame / fps; a static time is only applied every other update (hit-pause froze the swing pose), so it alternates
      const cont = A.continuous && s.combo > 0 && !this.fromRec; // a chained strike of one continuous clip: already fully in
      const ramp = cont ? (this.chainW0 >= 0.999 ? 1 : this.chainW0 + (1 - this.chainW0) * smooth(clamp(t / 0.12, 0, 1))) : smooth(clamp(t / (this.prevSwing ? Math.max(this.swingBlend, this.fromRec ? 0.14 : 0) : A.enterBlend || 0.05), 0, 1));
      const rec = A.rec ? this.act(A.rec) : null, inRec = !!rec && t > tEnd;
      const out = inRec || t <= tEnd ? 1 : smooth(clamp(1 - (t - tEnd) / (A.duration - tEnd), 0, 1));
      sW = ramp * out;
      if (inRec) { // the strike is over: its recovery clip carries on from its last pose
        if (!R || R.id !== s.swingId) { const c = rec.getClip(), t0 = Math.min(...c.tracks.map((q) => q.times[0])); this.recCur = R = { act: rec, t0, dur: c.duration - t0, id: s.swingId, t: 0, w: 0 }; }
        R.t = t - tEnd; R.w = sW; swingActW = 0;
      }
      // step into the attack: turn so it lands on the aim, then turn back during recovery
      turn = A.yawOffset * smooth(clamp(t / (A.turnIn || 0.1), 0, 1)) * out; // (turnIn: a big turn eased over the wind-up)
      if (this.prevSwing) {
        const pw = this.prevSwingW * (1 - ramp);
        this.prevSwing.setEffectiveWeight(pw); prevW = pw;
        if (pw <= 1e-3) { this.prevSwing.setEffectiveWeight(0); this.prevSwing = null; }
      }
      // the turn carries over from the previous attack instead of snapping
      if (this.prevTurn != null && t < this.swingBlend) turn = this.prevTurn + (turn - this.prevTurn) * smooth(t / this.swingBlend);
      else this.prevTurn = null;
    } else {
      this.swingAct = null; this.swingId = -1;
      if (this.prevSwing) { this.prevSwing.setEffectiveWeight(0); this.prevSwing = null; }
      if (R) { // the settle after the action: plays on while she stands; fades out as she moves or does anything else
        R.t += dt;
        const busy = s.action !== 'ready' || Math.hypot(s.vx, s.vz) > 0.35;
        R.w = Math.min(busy ? R.w - dt / 0.15 : R.w, smooth(clamp((R.dur - R.t) / 0.25, 0, 1)));
        if (R.w <= 1e-3 || R.t >= R.dur) { R.act.setEffectiveWeight(0); this.recCur = R = null; } else sW = R.w;
      }
    }
    this.swingW = sW;
    if (A && s.swingT >= 0.1) this.lastTurn = turn;
    if (A && this.prevTurn == null && s.swingT < 0.02 && s.combo > 0) this.prevTurn = this.lastTurn || 0;
    for (const n of this.meleeClips) { const a = this.act(n); if (a !== this.swingAct && a !== this.prevSwing && a !== R?.act) a.setEffectiveWeight(0); }
    if (A) this.swingAct.setEffectiveWeight(swingActW >= 0 ? swingActW : sW);
    if (R) { R.act.time = R.t0 + Math.min(R.t, R.dur - 1e-3) + ((this.rcJit ^= 1) * 1e-6); R.act.setEffectiveWeight(R.w); }
    this.container.rotation.y = this.yaw + turn;
    // reloads: upper-body clips driven by the simulation's reload time, legs keep the locomotion
    let rW = 0; this.reloadFrame = -1; this.pistolReloadFrame = -1;
    if (s.action === 'reload') {
      const sg = s.equipped === 'shotgun', u = clamp(s.actionT / s.reloadDur, 0, 1);
      const rl = this.act(sg ? 'shotgun_reload_upper' : 'pistol_reload_upper');
      rl.time = (1 + u * ((sg ? this.shotgunReloadFrames : this.reloadFrames) - 1)) / 30 + ((this.rlJit ^= 1) * 1e-6);
      if (sg) this.reloadFrame = rl.time * 30; else this.pistolReloadFrame = rl.time * 30;
      rW = smooth(clamp(s.actionT / 0.08, 0, 1)) * smooth(clamp((1 - u) / 0.12, 0, 1));
    }
    this.reloadW = rW;
    const rP = s.equipped === 'pistol' ? rW : 0, rS = s.equipped === 'shotgun' ? rW : 0;
    const k = 1 - Math.min(1, sW + prevW); // (the fading attack counts too: else the idle came back under it, 50/50)
    this.act('pistol_reload_upper').setEffectiveWeight(rP * uP * k);
    this.act('shotgun_reload_upper').setEffectiveWeight(rS * uS * k);
    const hold = this.act('shotgun_hold_upper'); hold.setEffectiveWeight((1 - rS) * uS * k);
    hold.time = HOLD_T + ((this.holdJit ^= 1) * 1e-6); // a static time is only applied every other update, so it alternates
    this.act('bat_idle_upper').setEffectiveWeight(uA * k);
    this.actions.carry_upper?.setEffectiveWeight(uC * k); // (a two-handed weapon carried at rest: its idle's upper body, setupCarry)
    // the one-handed bat's run (see batRun): uWp = the bat's weight moved onto the regular runs (full, or legs only)
    const br = this.batRun, uWp = this.unarmed && (br === 'plain' || br === 'plainlegs') ? uW : 0;
    if (this.actions.sword_idle_upper) this.actions.sword_idle_upper.setEffectiveWeight((br === 'plain' && uWp ? uW * w.pistol_idle : uW) * k);
    if (this.swordHips) { if (br === 'rebase' || br === 'plainlegs') this.upperHips.sword_idle_upper = this.swordHips; else delete this.upperHips.sword_idle_upper; }
    // 'plain': the bat arm held part-way to the sword stance while moving (batArmHold = the share of the stance; the mixer
    // averages it with the run's arm, so weight h on top of the run's 1 gives h / (1 + h))
    const share = (f) => { f = Math.min(0.95, Math.max(0, f)); return f / (1 - f); };
    for (const [n, f] of [['sword_idle_rarm', this.batArmHold], ['sword_idle_rhand', this.batWristHold]]) {
      if (this.actions[n]) this.actions[n].setEffectiveWeight(br === 'plain' ? uWp * (1 - w.pistol_idle) * share(f) * k : 0);
    }
    // unarmed: the regular full-body run/walk/strafe clips (arms included), not the legs under a static upper-body pose
    const uni = this.unarmed ? uF : 0; // with the gun-free clips, moving unarmed uses them in full; standing still keeps the idle arms
    this.act('fists_idle_upper').setEffectiveWeight(uF * (this.unarmed ? w.pistol_idle : 1) * k);
    for (const n in w) {
      const mv = n !== 'pistol_idle';
      this.act(n).setEffectiveWeight(w[n] * (uP * (1 - rP) + (this.unarmed ? 0 : uF)) * k);
      this.act(n + '_lower').setEffectiveWeight(w[n] * (uS + uA + uW + uC - (mv ? uWp : 0) + uP * rP + (this.unarmed ? 0 : uF)) * k);
      if (this.unarmed && n === 'pistol_idle') this.act('tripo_idle_lower').setEffectiveWeight(w[n] * uF * k);
      if (this.unarmed && mv) {
        this.act(n + '_u').setEffectiveWeight(w[n] * (uni + (br === 'plain' ? uWp : 0)) * k);
        this.act(n + '_ul').setEffectiveWeight(w[n] * (br === 'plainlegs' ? uWp : 0) * k);
      }
    }
    // a scripted full-body clip (the reveal's wave) fades over the normal layers
    let scW = 0, sact = null, sact2 = null;
    if (s.action === 'down' && s.act?.kip && this.act('yola_knockdown') && this.act('ual_KipUp')) {
      // the kip-up (core/player.js KIP): the fall onto her back (frames 1-44), then the kip-up from lying (frames 1-36), a
      // 0.12 s cross-fade where the two lying poses meet
      const F = s.downFall, U = s.downUp, t = s.actionT, fa = this.act('yola_knockdown'), ka = this.act('ual_KipUp');
      this.act('yola_getup').setEffectiveWeight(0);
      const kw = smooth(clamp((t - F + 0.06) / 0.12, 0, 1));
      fa.time = (1 + Math.min(1, t / F) * 43) / 30 + ((this.dnJit ^= 1) * 1e-6); ka.time = (1 + clamp((t - F + 0.06) / U, 0, 1) * 35) / 30 + (this.dnJit * 1e-6);
      scW = smooth(clamp(t / 0.08, 0, 1)) * smooth(clamp((F + U - t) / 0.12, 0, 1));
      fa.setEffectiveWeight(scW * (1 - kw)); ka.setEffectiveWeight(scW * kw); sact = kw > 0.5 ? ka : fa; sact2 = kw > 0.5 ? fa : ka;
    } else if (s.action === 'down' && this.act('yola_knockdown')) { // knocked flat: the fall, then the get-up, over everything else
      const F = s.downFall || 1.15, U = s.downUp || 1.7, t = s.actionT, up = t >= F;
      const a = this.act(up ? 'yola_getup' : 'yola_knockdown'); this.act(up ? 'yola_knockdown' : 'yola_getup').setEffectiveWeight(0);
      a.time = (up ? 20 + Math.min(1, (t - F) / U) * 161 : 1 + Math.min(1, t / F) * 58) / 30 + ((this.dnJit ^= 1) * 1e-6);
      scW = smooth(clamp(t / 0.08, 0, 1)) * smooth(clamp((F + U - t) / 0.25, 0, 1)); sact = a; a.setEffectiveWeight(scW);
    } else if (this.act('yola_knockdown')) { this.act('yola_knockdown').setEffectiveWeight(0); this.act('yola_getup').setEffectiveWeight(0); this.act('ual_KipUp')?.setEffectiveWeight(0); }
    // the dodge and the vault (core/player.js DODGE / VAULT; Quaternius clips, OVERLAY_CLIPS): over everything else, as the
    // knockdown; cut short (an attack out of a dodge), the pose fades out over 0.15 s instead of snapping to the next one
    const OV = this.ov ||= { act: null, w: 0 };
    if (!sact && (s.action === 'dodge' || s.action === 'vault') && s.act) {
      const M = OVERLAY_CLIPS[s.action === 'vault' ? 'vault' : s.act.kind], oa = M && this.act(M.clip);
      if (oa) {
        if (OV.act && OV.act !== oa) OV.act.setEffectiveWeight(0);
        oa.time = (M.f0 + clamp(s.actionT / s.act.dur, 0, 1) * (M.f1 - M.f0)) / 30 + ((this.ovJit ^= 1) * 1e-6);
        OV.act = oa; OV.w = smooth(clamp(s.actionT / 0.06, 0, 1)) * smooth(clamp((s.act.dur - s.actionT) / 0.12, 0, 1));
        scW = OV.w; sact = oa; oa.setEffectiveWeight(scW);
      }
    } else if (OV.act) {
      OV.w = Math.max(0, OV.w - dt / 0.15); OV.act.setEffectiveWeight(OV.w);
      if (!sact && OV.w > 0) { scW = OV.w; sact = OV.act; }
      if (OV.w <= 0) OV.act = null;
    }
    if (this.script && !sact) {
      const S = this.script; S.t += dt;
      const len = S.endAt ?? (S.loop ? Infinity : S.len / S.rate), inW = clamp(S.t / S.fadeIn, 0, 1), outW = clamp((len - S.t) / S.fadeOut, 0, 1);
      scW = smooth(inW) * smooth(outW); sact = S.act;
      S.act.time = S.t0 + (S.loop ? (S.t * S.rate) % (S.len - 1e-3) : Math.min(S.t * S.rate, S.len - 1e-3)); S.act.setEffectiveWeight(scW);
      if (S.t >= len) { S.act.setEffectiveWeight(0); this.script = null; this.scriptDone = true; scW = 0; sact = null; }
    }
    // the bat drawn from her back (setupBatBack): Sword_Enter on the upper body as she takes it out; an attack, a fall or
    // another weapon cuts it, its pose fading out over 0.12 s
    const DC = this.drawClip;
    if (DC) {
      if (s.equipped === 'bat' && this.prevEquip && this.prevEquip !== 'bat' && s.action !== 'down') this.draw = { t: 0, f: 1, k: (DC.frames - 1) / (DC.dur * 30), w: 0 };
      this.prevEquip = s.equipped;
      const D = this.draw;
      if (D) {
        D.t += dt; D.f = 1 + D.t * 30 * D.k;
        const cut = s.action === 'swing' || s.action === 'down' || s.action === 'dodge' || s.equipped !== 'bat';
        if (D.f >= DC.frames || cut) { this.drawFade = { w: D.w, f: Math.min(D.f, DC.frames) }; this.draw = null; }
        else { D.w = smooth(clamp(D.t / 0.08, 0, 1)) * smooth(clamp((DC.frames - D.f) / (0.15 * 30 * D.k), 0, 1)); DC.act.time = DC.t0 + (D.f - 1) / 30 + ((this.drJit ^= 1) * 1e-6); DC.act.setEffectiveWeight(D.w * 8); }
      }
      if (!this.draw) {
        const F = this.drawFade;
        if (F && F.w > 0) { F.w = Math.max(0, F.w - dt / 0.12); DC.act.time = DC.t0 + (F.f - 1) / 30; DC.act.setEffectiveWeight(F.w * 8); } else DC.act.setEffectiveWeight(0);
      }
    }
    if (scW > 0) for (const a of Object.values(this.actions)) if (a !== sact && a !== sact2) a.setEffectiveWeight(a.getEffectiveWeight() * (1 - scW));
    for (const [b, q] of this.restQ) b.quaternion.copy(q);
    mixerWritesAll(this.mixer); // (the mixer must rewrite every bone it drives, held values included)
    this.mixer.update(dt);
    this.handPoses();
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
    if (!(this.ov?.w > 0)) this.footLock(dt, s, A, sW, w); // (not under a dodge or a vault: their clips place the feet)
    this.hair.update(dt);
    this.weaponShown = uF > 0.5 ? 'fists' : uW > 0.5 ? 'bat1' : uA > 0.5 ? 'axe' : uS > 0.5 ? 'shotgun' : 'pistol';
    if (s.action === 'down') { this.pistol.visible = this.shotgun.visible = this.melee.visible = this.shell.visible = false; if (this.test?.obj) this.test.obj.visible = false; if (this.batLib?.obj) this.batLib.obj.visible = false; if (this.axeLib?.obj) this.axeLib.obj.visible = false; this.posture(); return; } // (on the floor: weapons away)
    if (this.weaponShown === 'pistol') this.aimPistol(s, 1 - uP);
    else if (this.weaponShown === 'shotgun') this.aimShotgun(s, 1 - uS);
    this.posture(); // (before the weapons are placed: turning the pelvis shifts the arms ~4 mm, the weapons follow)
    this.headLook(s, dt);
    this.armPose(); // (the per-clip arm adjustments: before the weapons, which follow her hands)
    this.radioArm(dt);
    this.carryArm(dt); // (the case in his left hand: before the weapons, which follow the right hand)
    this.placeWeapons(s, dt); this.placeMags(dt);
  }

  // ---- the walkie-talkie in the right hand (Chapter 2's calls: src/hood/view.js sets radioMode 'talk' | 'listen' | null):
  // the hold is render/radiohold.js (the Rig Lab's Radio section uses the same), with this character's settings
  // (radioFit: assets/hold/radio_hold.json, the Lab's save), eased in and out over whatever the body plays
  radioArm(dt) {
    const R = this.rad ||= { w: 0, talk: 0 }, on = !!this.radioMode;
    R.w = clamp(R.w + (on ? dt / 0.35 : -dt / 0.4), 0, 1);
    R.talk = clamp(R.talk + (this.radioMode === 'talk' ? dt / 0.3 : -dt / 0.4), 0, 1);
    if (R.w <= 1e-3 || !this.bones.RightHandMiddle1) return;
    this.radRig ||= radioRig(this.model, this.bones, this.fist || []);
    this.container.getWorldQuaternion(_q); const fwd = _v.set(0, 0, 1).applyQuaternion(_q).setY(0).normalize();
    radioPose(this.radRig, this.radioFit ||= radioFit(), smooth(R.w), smooth(R.talk), fwd, this.H);
  }
  radioPlace(obj) { radioPlace(this.radRig ||= radioRig(this.model, this.bones, this.fist || []), obj, this.radioFit ||= radioFit()); }

  // ---- the case in the left hand (Chapter 2: src/hood/view.js sets caseCarry while Marc carries it and has a one-handed
  // weapon): render/casecarry.js (the Rig Lab's Case section uses the same), with this character's settings (caseFit:
  // assets/hold/case_carry.json), eased in and out over whatever the body plays
  carryArm(dt) {
    this.carryW = clamp((this.carryW || 0) + (this.caseCarry ? dt / 0.25 : -dt / 0.25), 0, 1);
    if (this.carryW <= 1e-3 || !this.bones.LeftHandMiddle1) return;
    this.caseRig ||= caseRig(this.model, this.bones, this.fist || []);
    this.container.getWorldQuaternion(_q); const fwd = _v.set(0, 0, 1).applyQuaternion(_q).setY(0).normalize();
    casePose(this.caseRig, this.caseFit ||= caseFit(), smooth(this.carryW), fwd, this.H);
  }
  casePlace(obj) { casePlace(this.caseRig ||= caseRig(this.model, this.bones, this.fist || []), obj, this.caseFit ||= caseFit()); }

  // HANDS (the user's Rig Lab Hands controls, assets/hold/hand_poses.json "<yola>:<clip>": { Right, Left } from 0 = the
  // clip's own fingers to 1 = her closed fist, her bat_idle frame 1 grip, as viewer.js handPose): each hand's curl is the
  // blend of the playing clips' settings, by their weights (only clips that carry finger keys count: a legs-only layer has
  // none). Nothing saved for a clip = 0.
  setHandPoses(json, who) {
    this.handSet = {};
    for (const [k, v] of Object.entries(json || {})) if (k.startsWith(who + ':') && typeof v === 'object') this.handSet[k.slice(who.length + 1)] = v;
    if (!Object.keys(this.handSet).length) { this.handSet = null; return; }
    const bi = this.act('bat_idle_upper')?.getClip(), FING = /Hand(Thumb|Index|Middle|Ring|Pinky)\d$/;
    this.fist = [];
    for (const t of bi?.tracks || []) {
      const bn = t.name.split('.')[0], b = Object.values(this.bones).find((x) => x.name === bn);
      if (!b || !FING.test(bn.replace(/^mixamorig:?/, '')) || !/quaternion$/.test(t.name)) continue;
      const v = t.createInterpolant(new Float32Array(4)).evaluate(bi.tracks[0].times[0]);
      this.fist.push([b, new THREE.Quaternion(v[0], v[1], v[2], v[3]), /Right/.test(bn) ? 'Right' : 'Left']);
    }
    // each action's source clip (for its setting) and whether it moves the fingers
    this.handActs = [];
    for (const [n, a] of Object.entries(this.actions)) {
      if (!a.getClip().tracks.some((t) => FING.test(t.name.split('.')[0].replace(/^mixamorig:?/, '')))) continue;
      const base = this.baseClip(n); if (base) this.handActs.push([a, base]);
    }
  }
  // a second action on the same clip (made once): carries a clip's last pose while the clip restarts (see the swing hand-over)
  ghostOf(act) {
    const n = act.getClip().name + '__ghost';
    if (!this.actions[n]) { const c = act.getClip().clone(); c.name = n; const g = this.mixer.clipAction(c); g.play(); g.timeScale = 0; g.setEffectiveWeight(0); this.actions[n] = g; this.postureActs = null; }
    return this.actions[n];
  }
  // the game clip an action plays (the derived layers: legs-only, upper-only, the unarmed copies)
  baseClip(n) {
    if (n.startsWith('sword_idle_')) return this.swordIdleBase || 'ual1_Sword_Idle'; // (the bat's stance clip: setOneHandedBat)
    const BASE = { shotgun_hold_upper: 'sg_reload', shotgun_reload_upper: 'sg_reload', pistol_reload_upper: 'pistol_reload', bat_idle_upper: 'bat_idle', bat_calib: 'bat_idle',
      fists_idle_upper: 'tripo_idle', sword_idle_upper: 'ual1_Sword_Idle', sword_idle_rarm: 'ual1_Sword_Idle', sword_idle_rhand: 'ual1_Sword_Idle', tripo_idle_lower: 'tripo_idle' };
    return n in BASE ? BASE[n] : n.endsWith('_u') ? UNARMED[n.slice(0, -2)] : n.replace(/_(lower|ul)$/, '').replace(/__ghost$/, '');
  }
  // the posture fix (render/posture.js), after the body's corrections, before the weapons: each bone turned by the shares of the clips driving
  // it, per source family (only her pelvis / chest / neck / head meshes change; arms, hands, weapons and feet stay put)
  // (2026-10-18, the user: "her head doesn't face where she is looking it's weird"): her body turns onto the aim, but the head
  // kept each clip's own (the gun clips look down the sight to one side, the strafes along the run). After the clip and the
  // posture fix, the neck (40%) and the head (60%) turn so her face points along the aim, up to LOOK_MAX either way; eased in
  // and out, half-weight through a swing, off for the dodge, the vault, a fall and on the floor
  headLook(s, dt) {
    if (!this.faceFwd || !this.bones.Neck) return;
    const off = s.action === 'down' || s.action === 'dodge' || s.action === 'vault' || s.dead || (this.ov?.w > 0) || this.script;
    const want = off ? 0 : s.action === 'swing' ? 0.5 : 1;
    this.lookW += (want - this.lookW) * Math.min(1, dt * (want > this.lookW ? 6 : 12));
    if (this.lookW < 0.01) return;
    this.container.getWorldQuaternion(_q2); this.bones.Head.getWorldQuaternion(_q3);
    const f = _v.copy(this.faceFwd).applyQuaternion(_q2.invert().multiply(_q3)); // her face's direction in the character's space (aim: +Z)
    if (f.x * f.x + f.z * f.z < 1e-4) return;
    const err = clamp(Math.atan2(f.x, f.z), -LOOK_MAX, LOOK_MAX) * this.lookW;
    _q4.setFromAxisAngle(UP, -err * 0.4); this.rotateC('Neck', _q4);
    _q4.setFromAxisAngle(UP, -err * 0.6); this.rotateC('Head', _q4);
  }
  posture() {
    if (this.postureOff || !HOLD_LAYERS.posture) return; // (the user's layer toggle, render/holdlayers.js)
    if (!this.postureActs) {
      this.postureActs = [];
      for (const [n, a] of Object.entries(this.actions)) {
        const keyed = new Set(a.getClip().tracks.filter((t) => /quaternion$/.test(t.name)).map((t) => t.name.split('.')[0].replace(/^mixamorig:?/, '')));
        const bones = POSTURE_BONES.filter((b) => keyed.has(b)); if (bones.length) this.postureActs.push([a, postureFamily(this.baseClip(n)), bones]);
      }
      this.postureW = Object.fromEntries(POSTURE_BONES.map((b) => [b, { xbot: 0, mannequin: 0, all: 0 }]));
    }
    const W = this.postureW;
    for (const b of POSTURE_BONES) { W[b].xbot = W[b].mannequin = W[b].all = 0; }
    for (const [a, fam, bones] of this.postureActs) {
      const w = a.getEffectiveWeight(); if (w <= 1e-3) continue;
      for (const b of bones) { W[b].all += w; if (fam) W[b][fam] += w; }
    }
    for (const b of POSTURE_BONES) if (W[b].all > 1e-3) { W[b].xbot /= W[b].all; W[b].mannequin /= W[b].all; }
    applyPosture(this.bones, W);
    this.container.updateMatrixWorld(true);
  }
  // ARM ADJUSTMENTS (render/armpose.js; the Rig Lab sidebar's Arms section per clip, assets/hold/arm_pose.json
  // "<yola>:<clip>": { Right: {...}, Left: {...} }): blended by the weights of the clips playing
  setArmPose(json, who) {
    this.poseSet = {};
    for (const [k, v] of Object.entries(json || {})) if (k.startsWith(who + ':') && typeof v === 'object') this.poseSet[k.slice(who.length + 1)] = v;
    if (!Object.keys(this.poseSet).length) this.poseSet = null;
    this.poseActs = null;
  }
  armPose() {
    if (!this.poseSet || !HOLD_LAYERS.armPose) return;
    const n = Object.keys(this.actions).length;
    if (!this.poseActs || this.poseN !== n) {
      this.poseN = n; this.poseActs = []; this.liveActs = [];
      // (only actions that move her arms: a legs-only layer such as pistol_idle_lower, under the shotgun's hold, would carry the
      // pistol's arm adjustments onto the shotgun)
      const arms = (act) => act.getClip().tracks.some((t) => /(Shoulder|Arm|ForeArm|Hand).quaternion$/.test(t.name));
      for (const [name, a] of Object.entries(this.actions)) { const base = this.baseClip(name); if (!base || !arms(a)) continue; if (AS_LIVE[base]) this.liveActs.push(a); else if (this.poseSet[base]) this.poseActs.push([a, base]); }
    }
    const list = []; let live = 0;
    const C = this.shotgunClip(), keepC = C ? 1 - C.share : 1; // (the shotgun slide finisher's arm adjustments fade out with its weapon position)
    for (const [a, base] of this.poseActs) { const w = Math.min(1, a.getEffectiveWeight()) * (base === C?.name ? keepC : 1); if (w > 1e-3) list.push([w, this.poseSet[base]]); }
    for (const a of this.liveActs) live += Math.min(1, a.getEffectiveWeight()); // (held as the live game: no adjustments)
    const p = list.length ? blendArms(list) : null, h0 = this.poseSet['*hips'], hk = Math.max(0, 1 - live) * keepC; // (*hips: the hands-at-her-hips rule, every clip)
    const hip = h0 && hk > 1e-3 ? Object.fromEntries(Object.entries(h0).map(([sd, P]) => [sd, Object.fromEntries(Object.entries(P).map(([q, v]) => [q, typeof v === 'number' ? v * hk : v]))])) : null;
    if (p || hip) { adjustArms(this.bones, p, { hip }); this.container.updateMatrixWorld(true); }
  }
  handPoses() {
    if (!this.handSet) return;
    const all = HOLD_LAYERS.handPoses; // (off: only the clips held as the live game, AS_LIVE)
    const k = { Right: 0, Left: 0 }; let W = 0;
    for (const [a, base] of this.handActs) {
      const w = a.getEffectiveWeight(); if (w <= 1e-3) continue;
      const h = this.handSet[base]; W += w; if (h && (all || AS_LIVE[base])) { k.Right += w * (h.Right || 0); k.Left += w * (h.Left || 0); }
    }
    if (W <= 1e-3) return;
    for (const [b, q, side] of this.fist) { const c = k[side] / W; if (c > 1e-3) b.quaternion.slerp(q, Math.min(1.5, c)); } // (> 1: a tighter fist than the grip)
  }

  // Foot lock (melee clips with planted-foot data: clipdata cL/cR, measured on her posed shoes in Blender). A planted
  // foot holds its spot on the floor while the body moves over it (leg IK after the blend), so it cannot skate when the
  // game shortens the clip's advance to stop short of a zombie, when she turns into a swing, or while the pose blends in
  // from / back out to the idle stance. When a held foot falls more than STEP_AT behind its animated spot it takes a
  // quick small step there (one foot at a time); a foot the animation lifts eases back onto the animation instead of
  // popping. Only the legs are touched (the hips stay where the animation put them).
  footLock(dt, s, A, sW, w) {
    const FL = (this.fl ||= { L: { mode: 'free', lock: new THREE.Vector3(), off: new THREE.Vector3(), from: new THREE.Vector3(), t: 0, dur: 0 },
      R: { mode: 'free', lock: new THREE.Vector3(), off: new THREE.Vector3(), from: new THREE.Vector3(), t: 0, dur: 0 }, settle: 0, at: new THREE.Vector3(s.x, 0, s.z) });
    const STEP_AT = 0.1, LIFT = 0.05;
    const C = A && this.contacts?.[A.path];
    // a jump of the body (restart, checkpoint, teleport) drops every hold
    if (FL.at.distanceToSquared(_v.set(s.x, 0, s.z)) > 0.25) for (const k of ['L', 'R']) { FL[k].mode = 'free'; FL[k].off.set(0, 0, 0); }
    FL.at.set(s.x, 0, s.z);
    const moving = Math.hypot(s.vx, s.vz) > 0.25;
    // every melee swing is locked (2026-10-16: the axe and the fists skated their planted feet as she turned into a strike):
    // the bat's clips carry measured contacts; the others are read from the pose (a foot down on the floor is planted)
    const swing = s.action === 'swing' && !!A && !s.dead;
    if (C || swing) FL.settle = 0.5; else FL.settle = moving ? 0 : Math.max(0, FL.settle - dt);
    const on = !s.dead && (C || swing || FL.settle > 0) && (this.batMode || swing || FL.settle > 0);
    const still = w.pistol_idle ?? 0; // standing (the idle stance is planted)
    const frozen = !!A && s.swingT >= attackEnd(A);
    for (const k of ['L', 'R']) {
      const st = FL[k], side = k === 'L' ? 'Left' : 'Right', foot = this.bones[side + 'Foot'];
      const anim = foot.getWorldPosition(_v6);
      let plant = 0;
      if (on) {
        const f = clamp(this.clipF ?? 0, C ? C.f0 : 0, C ? C.f0 + C[k].length - 1 : 0);
        let c = C ? C[k][Math.round(f) - C.f0] : 0;
        if (!C) { const toe = this.bones[side + 'ToeBase']?.getWorldPosition(this._toeV ||= new THREE.Vector3()).y ?? anim.y; c = anim.y < 0.15 && toe < 0.07 ? 1 : 0; } // (no measured contacts: down on the floor = planted)
        if (frozen && anim.y < 0.16) c = 1; // recovering: the clip's last pose is held while it blends to idle, so a foot on the floor stays put
        plant = C || swing ? sW * c + (1 - sW) * still : still;
      }
      const other = FL[k === 'L' ? 'R' : 'L'];
      if (st.mode === 'locked') {
        if (plant < 0.5) { st.mode = 'free'; st.off.set(st.lock.x - anim.x, 0, st.lock.z - anim.z); }
        else {
          const d = Math.hypot(st.lock.x - anim.x, st.lock.z - anim.z);
          if (d > STEP_AT && other.mode !== 'step') { st.mode = 'step'; st.from.copy(st.lock); st.t = 0; st.dur = clamp(d / 1.4, 0.12, 0.22); }
        }
      } else if (st.mode === 'free') {
        st.off.multiplyScalar(Math.exp(-dt / 0.08));
        if (plant >= 0.5) { st.mode = 'locked'; st.lock.set(anim.x + st.off.x, 0, anim.z + st.off.z); st.off.set(0, 0, 0); }
      }
      const tgt = _v7;
      if (st.mode === 'step') {
        st.t += dt; const u = smooth(clamp(st.t / st.dur, 0, 1));
        tgt.set(st.from.x + (anim.x - st.from.x) * u, anim.y + Math.sin(Math.PI * u) * LIFT, st.from.z + (anim.z - st.from.z) * u);
        if (st.t >= st.dur) { st.mode = plant >= 0.5 ? 'locked' : 'free'; st.lock.set(anim.x, 0, anim.z); st.off.set(0, 0, 0); }
      } else if (st.mode === 'locked') tgt.set(st.lock.x, anim.y, st.lock.z);
      else tgt.set(anim.x + st.off.x, anim.y, anim.z + st.off.z);
      st.err = Math.hypot(tgt.x - anim.x, tgt.z - anim.z);
      if (st.err > 1e-3 || st.mode === 'step') solveArm(this.bones[side + 'UpLeg'], this.bones[side + 'Leg'], foot, tgt.clone(), 1);
    }
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
      // the shotgun layers keep their clip's own heading (2026-10-17): X Bot's rifle clip already points the gun along the
      // character's forward, so the upper body stays on the aim whatever the legs' hips do. Turned onto the legs' heading
      // (as before, ?sghead=legs) the aim correction ran into its 46 deg limit and the left strafe aimed up to 59 deg off.
      if (!(this.sgOwnHeading && /^shotgun_/.test(n))) {
        const fc = _v.set(0, 0, 1).applyQuaternion(_q3), fn = _v2.set(0, 0, 1).applyQuaternion(H.quaternion);
        _q4.setFromAxisAngle(UP, Math.atan2(fn.x, fn.z) - Math.atan2(fc.x, fc.z));
        _q3.premultiply(_q4); // same heading as the hips now
      }
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
    let hx, hz;
    if (this.pistolPlace !== 'old' && this.pistolInFist()) {
      // the gun in her fist (pistolInFist): the BARREL is what turns onto the aim (2026-10-17: X Bot's own barrel sits ~8 deg
      // off his arms' midline, hers ~12, so aiming the arms left the shots' gun 5-8 deg off the target)
      const d = _v.set(0, 0, 1).applyQuaternion(this.pistol.quaternion); hx = d.x; hz = d.z;
    } else {
      this.grip('Right', _v); this.grip('Left', _v2);
      this.bones.RightArm.getWorldPosition(_v3); this.bones.LeftArm.getWorldPosition(_v4);
      hx = (_v.x + _v2.x) / 2 - (_v3.x + _v4.x) / 2; hz = (_v.z + _v2.z) / 2 - (_v3.z + _v4.z) / 2;
    }
    let live = clamp(angleDiff(Math.atan2(hx, hz), s.aimYaw), -0.6, 0.6);
    // eased (~0.1 s): the fist's barrel wobbles with the clips' wrists (the back run: 15 deg a stride with sharp turns);
    // followed exactly, every wobble jerked her whole upper body (gun hand 30-40 mm per frame^2)
    if (this.pistolPlace !== 'old') { const a = 1 - Math.exp(-(this.dtNow || 1 / 60) / 0.1); this.aimLive = this.aimLive == null ? live : this.aimLive + (live - this.aimLive) * a; live = this.aimLive; }
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
    const F = this.shotgunFit; // (the user's grip turns the gun in her hand: the aim must see the gun as it sits)
    if (F) _q.multiply(_q2.setFromEuler(_e.set((F.tilt || 0) * Math.PI / 180, (F.turn || 0) * Math.PI / 180, (F.roll || 0) * Math.PI / 180, 'YXZ')));
    return out.set(1, 0, 0).applyQuaternion(_q).applyQuaternion(_q3);
  }
  // Shotgun: the upper body keeps its clip's own heading (rebaseUpper), so the barrel already points near the aim in every
  // move; what is left here is the small residual and the user's grip turn, turned out over the spine (held through a
  // reload), and the kick: chest and arms thrown up and back.
  aimShotgun(s, ub) {
    const k = 1 - ub, rW = this.reloadW || 0;
    const b = this.shotgunBarrel(_v);
    const live = clamp(angleDiff(Math.atan2(b.x, b.z), 0), -0.8, 0.8); // character forward is +Z
    if (rW === 0) this.sgYaw = live;
    const ey = (live * (1 - rW) + (this.sgYaw || 0) * rW) * k;
    if (Math.abs(ey) > 1e-4) for (const n of ['Spine', 'Spine1', 'Spine2']) { _q4.setFromAxisAngle(UP, ey / 3); this.rotateC(n, _q4); }
    const kick = s.recoil * s.recoil * s.recoilScale;
    if (kick > 0.01) {
      this.rotateEulerC('Spine1', -0.1 * kick * k, 0, 0);
      this.rotateEulerC('Spine2', -0.14 * kick * k, 0, 0);
      this.rotateEulerC('RightArm', -0.22 * kick * k, 0, 0); this.rotateEulerC('LeftArm', -0.22 * kick * k, 0, 0);
    }
  }

  // Left hand on the shotgun: reaches the shell's loading port while it carries a shell, otherwise stays on
  // the pump wherever it slides. The weights fall off with the hand's distance, so the reload clip's own
  // reach to the belt and back is left alone.
  // THE SHOTGUN'S GRIP EXTRAS (2026-10-19, the user's Rig Lab setup; src/viewer.js does the same):
  // - the shotgun slide finisher (hub_execution_shotgun_slide_*): while one plays, its own weapon position (assets/hold/
  //   weapon_fit.json "short@<clip>": the kneel setup), faded to the everyday one over idleIn / idleOut (Rig Lab frames: it
  //   starts and ends in the everyday hold), and its left fist closed round the pump (pumpHand)
  // - the left hand nudged off the pump's grip point (fit.lDown / lSide, mm: down, toward her left)
  // - the left wrist untwisted (untwistWrist)
  shotgunClip() {
    if (!this.shotgunClipFits) return null;
    let best = null, bw = 0.01;
    for (const [n, fit] of Object.entries(this.shotgunClipFits)) { const a = this.actions[n], w = a ? a.getEffectiveWeight() : 0; if (w > bw) { bw = w; best = [a, fit]; } }
    if (!best) return null;
    const [a, fit] = best, f = a.time * 30 + 1, ramp = (r) => clamp((f - r[0]) / Math.max(1e-3, r[1] - r[0]), 0, 1);
    const own = Math.max(fit.idleIn ? 1 - smooth(ramp(fit.idleIn)) : 0, fit.idleOut ? smooth(ramp(fit.idleOut)) : 0);
    return { name: a.getClip().name, fit, share: 1 - (1 - own) * Math.min(1, bw) }; // (share: how much of the everyday hold)
  }
  shotgunFitNow(C) {
    const base = this.shotgunFit || {}, own = C.fit, out = { ...own };
    for (const [k, d] of Object.entries(FIT_DEFAULTS)) out[k] = (own[k] ?? d) + ((base[k] ?? d) - (own[k] ?? d)) * C.share;
    return out;
  }
  leftNudge(F, out) {
    const d = (F?.lDown || 0) / 1000, sd = (F?.lSide || 0) / 1000; out.set(0, -d, 0); if (!sd) return out;
    this.bones.LeftArm.getWorldPosition(_v7); this.bones.RightArm.getWorldPosition(_ikh);
    return out.add(_v7.sub(_ikh).setY(0).normalize().multiplyScalar(sd));
  }
  // The wrist's twist moved into the forearm: sg_reload's hold frame (X Bot's rifle reload, retargeted 2026-10-17) has her
  // left HAND bone turned -118 deg about its own length and her forearm 0, so her skin wrings at the wrist ("her wrist looks
  // completely whack"). Her hand keeps its world turn (the grip unchanged); the twist past keepDeg goes to the forearm.
  untwistWrist(side, keepDeg) {
    const H = this.bones[side + 'Hand'], F = this.bones[side + 'ForeArm'], M = this.bones[side + 'HandMiddle1']; if (!H || !F || !M) return;
    const ax = _v7.copy(M.position).normalize(), q = H.quaternion, d = q.x * ax.x + q.y * ax.y + q.z * ax.z;
    const tw = _q3.set(ax.x * d, ax.y * d, ax.z * d, q.w).normalize();
    let ang = 2 * Math.acos(Math.min(1, Math.abs(tw.w))); if ((d < 0) !== (tw.w < 0)) ang = -ang;
    const keep = keepDeg * Math.PI / 180, excess = ang - Math.sign(ang) * Math.min(Math.abs(ang), keep);
    if (Math.abs(excess) < 1e-3) return;
    H.updateWorldMatrix(true, false); H.getWorldQuaternion(_q4);
    F.quaternion.multiply(_q3.setFromAxisAngle(_v7.copy(H.position).normalize(), excess)); F.updateMatrixWorld(true);
    H.quaternion.copy(F.getWorldQuaternion(_q3).invert().multiply(_q4)); H.updateMatrixWorld(true);
  }
  shotgunLeftHand(rf, G, F = this.shotgunFit, C = null) {
    const U = G.userData, SP = SHOTGUN_SPEC, SH = SP.shell, smooth01 = (u) => smooth(clamp(u, 0, 1));
    const shellOn = rf >= SH.from && rf <= SH.to;
    this.grip('Left', _v);
    let wPort = 0;
    const tail = rf > SH.to && rf < SH.to + 5; // (after the shell is in: her hand eases off the port, it snapped back 14 cm)
    if (shellOn || tail) {
      _v3.copy(U.port.position).add(_v4.set(0, -SH.portDown, 0)); G.localToWorld(_v3);
      wPort = tail ? 0 : smooth01(1 - (_v.distanceTo(_v3) - 0.05) / 0.2);
      // at the end her thumb-index pinch (the shell, holdfit.js placeShell) goes to the port itself: the grip point is
      // aimed short of it by the pinch's offset, so she pushes the shell in (2026-10-17: it left her fingers ~10 cm short)
      const ins = tail ? smooth01(1 - (rf - SH.to) / 5) : smooth01((rf - (SH.to - SHELL_INSERT)) / SHELL_INSERT);
      if (ins > 0) {
        this.bones.LeftHandThumb2.getWorldPosition(_v4).lerp(this.bones.LeftHandIndex2.getWorldPosition(_v6), 0.5).sub(_v); // pinch - grip
        _v6.copy(U.port.position); G.localToWorld(_v6); _v6.sub(_v4); _v3.lerp(_v6, ins); wPort = Math.max(wPort, ins);
      }
      if (wPort > 0) { this.ikArm('Left', _v3, wPort); this.grip('Left', _v); }
    }
    _v2.set(U.pumpX, U.pump.position.y, U.pump.position.z); G.localToWorld(_v2); // the pump's rest hold point
    if (C?.fit.pumpHand && !shellOn && !tail) { // (the finisher: her fist round the pump's tube, turned where her wrist is most natural)
      U.gripL.getWorldPosition(_v3).add(this.leftNudge(F, _v4)); _v5.set(1, 0, 0).transformDirection(G.matrixWorld);
      reachShoulder(this.bones, 'Left', _v3, 25); handOnto(this.bones, 'Left', _v3, _v5, 1, solveArm, { signFree: true }); this.closeFist('Left', 1);
    } else {
      const wHold = smooth01(1 - (_v.distanceTo(_v2) - 0.03) / 0.12) * (1 - wPort);
      if (wHold > 0) this.ikArm('Left', U.gripL.getWorldPosition(_v3).add(this.leftNudge(F, _v4)), wHold);
    }
    // the shell rides the left hand
    const S = this.shell; S.visible = shellOn;
    if (shellOn) placeShell(this.bones, S, U.port.getWorldPosition(_v3), 'Left', smooth(clamp((rf - (SH.to - SHELL_INSERT)) / SHELL_INSERT, 0, 1))); // (in her fingers, toward the port, then in: holdfit.js)
  }

  // ---- the weapon test arena (src/arena/testarena.js) ----
  // Library attack clips (skeleton-only GLB, same bones): root pinned like every clip, driven by the attack clock.
  addAttackClips(clips) {
    const rest = hipsRest(this.model);
    for (const c of clips) {
      if (this.actions[c.name]) continue;
      const a = this.mixer.clipAction(stripRoot(c, rest)); this.actions[c.name] = a;
      a.play(); a.setEffectiveWeight(0); a.timeScale = 0; this.meleeClips.push(c.name);
    }
  }
  // test: { obj (holder group or null), w (assets/moves/weapons.json frame), hand, roll (deg), slide (m), flip, two, fingers }
  setTestWeapon(test) { if (this.test?.obj && this.test.obj !== test?.obj) this.test.obj.visible = false; this.test = test; if (test?.carry) this.setupCarry(test); }
  // A two-handed weapon carried at rest (render/holdfit.js CARRY): its idle's upper body as the hold layer, and the carry's
  // frame in her chest's frame, measured once on the idle's first frame
  setupCarry(T) {
    const C = CARRY[T.carry], clip = C && this.byName?.[C.clip]; if (!clip) return;
    if (!this.actions.carry_upper) {
      const up = subClip(clip, (b) => !LOWER.test(b), 'carry_upper'); loopClip(up);
      const a = this.mixer.clipAction(up); this.actions.carry_upper = a; a.play(); a.setEffectiveWeight(0);
    }
    if ((this.carryCal ||= {})[T.carry]) return;
    const acts = Object.values(this.actions), saved = acts.map((x) => [x, x.getEffectiveWeight(), x.time]), op = this.outer.position.clone(), ry = this.container.rotation.y;
    this.outer.position.set(0, 0, 0); this.container.rotation.y = 0; for (const x of acts) x.setEffectiveWeight(0);
    const full = clip.clone(), m = this.mixer.clipAction(full); m.play(); m.setEffectiveWeight(1); m.time = Math.min(...full.tracks.map((t) => t.times[0]));
    for (const [b, q] of this.restQ) b.quaternion.copy(q); mixerWritesAll(this.mixer); this.mixer.update(0); this.outer.updateMatrixWorld(true);
    this.carryCal[T.carry] = carryCalibrate(this.bones, new THREE.Matrix4().copy(this.container.matrixWorld), T.w, C, 1);
    m.stop(); this.mixer.uncacheAction(full);
    for (const [x, w, t] of saved) { x.setEffectiveWeight(w); x.time = t; }
    this.outer.position.copy(op); this.container.rotation.y = ry;
  }
  // fist centre, grip axis (pinky -> index) and knuckle direction from her finger joints (as in the move library)
  fistFrame(side, out) {
    const H = side + 'Hand', c = out.c.set(0, 0, 0); let n = 0;
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = this.bones[H + f + i]; if (b) { c.add(b.getWorldPosition(_v)); n++; } }
    c.multiplyScalar(1 / n);
    out.a.copy(this.bones[H + 'Index1'].getWorldPosition(_v)).sub(this.bones[H + 'Pinky1'].getWorldPosition(_v2)).normalize();
    out.k.copy(this.bones[H + 'Middle1'].getWorldPosition(_v)).sub(c); out.k.addScaledVector(out.a, -out.k.dot(out.a)).normalize();
    c.addScaledVector(out.k, -0.01); // the curled fingers' centroid sits on the knuckle side of the handle
    return out;
  }
  // a held weapon (the arena's test weapon, the one-handed bat): closed fists on it, its grip at the fist centre, its shaft
  // along the grip axis, its face toward the knuckles turned by roll, slid along the grip by slide. Sets heldGrip / heldTip
  // (world) for the attack builder's path sampling (src/render/libattack.js).
  placeTest() {
    const T = this.test; this.placeHeld(T); // (the hold in the hand: the attacks)
    // at rest: carried (CARRY), both fists closed on its grips; through an attack the carry gives way to the hand's hold
    const C = HOLD_LAYERS.carry && T.carry && this.carryCal?.[T.carry], o = T.obj;
    const cw = C && o ? smooth(clamp(this.up.carry || 0, 0, 1)) * (1 - Math.min(1, (this.swingW || 0) + (this.prevSwing ? this.prevSwing.getEffectiveWeight() : 0))) : 0;
    if (cw <= 1e-3) return;
    const p0 = o.position.clone(), q0 = o.quaternion.clone(), w = T.w;
    carryPlace(this.bones, o, w, C, T.fit, 1, this._cpo ||= { grip: new THREE.Vector3(), dir: new THREE.Vector3() });
    const q1 = o.quaternion.clone(); o.position.lerpVectors(p0, o.position, cw); o.quaternion.slerpQuaternions(q0, q1, cw); o.updateMatrixWorld(true); // (q1: slerpQuaternions overwrites the quaternion it writes into first)
    const g = o.localToWorld(new THREE.Vector3(...w.grip_primary)), d = new THREE.Vector3(...w.shaft_axis).transformDirection(o.matrixWorld);
    const o1 = gripOpts(T.key, w, 'primary', o); reachShoulder(this.bones, 'Right', g); handOnto(this.bones, 'Right', g, o1.axis, cw, solveArm, o1); this.closeFist('Right', cw);
    if (w.grip_secondary && !(this.carryW > 0)) { /* (not while the case is in that hand) */ const o2 = gripOpts(T.key, w, 'secondary', o), g2 = o2.point; reachShoulder(this.bones, 'Left', g2, 25); handOnto(this.bones, 'Left', g2, o2.axis, 1, solveArm, o2); this.closeFist('Left', 1); }
  }
  placeHeld(T) {
    if (T.fingers) {
      for (const [n, q] of T.fingers) if (T.two || n.startsWith(T.hand)) this.bones[n].quaternion.copy(q);
      for (const side of T.two ? ['Left', 'Right'] : [T.hand]) this.bones[side + 'Hand'].updateMatrixWorld(true);
    }
    const o = T.obj; if (!o) return;
    // (render/holdfit.js, the same math as the Rig Lab: grip in the fist, shaft along the knuckles, then T.fit, the user's
    // fit for this weapon on this Yola from assets/hold/weapon_fit.json)
    if (T.pack) { // (the wood bat, as the Rig Lab holds the pack's bat: through both fists or in the right one; its stance's own fit while she stands)
      const wi = Math.min(1, this.actions.sword_idle_upper?.getEffectiveWeight() || 0), ws = Math.min(1, this.swingAct?.getEffectiveWeight() || 0);
      const f = T.fitIdle ? lerpFit(T.fit, T.fitIdle, wi + ws > 1e-3 ? wi / (wi + ws) : 0) : T.fit;
      if (f?.hand === 'Left') placeOneHanded(this.bones, 'Left', o, T.w, f, {}); else placeBat(this.bones, o, T.w, f);
    } else placeOneHanded(this.bones, T.hand, o, T.w, T.fit, T);
    const w = T.w;
    // a two-handed weapon: the other hand on its second grip (the data sheet's grip_secondary; render/holdfit.js handOnto)
    if (T.two && w.grip_secondary && HOLD_LAYERS.secondHand) {
      const other = T.hand === 'Left' ? 'Right' : 'Left'; o.updateMatrixWorld(true);
      const go = gripOpts(T.key, w, 'secondary', o), pt = go.point;
      reachShoulder(this.bones, other, pt, 25); if (handOnto(this.bones, other, pt, go.axis, 1, solveArm, go)) this.closeFist(other, 1); // (25 deg: a second grip sits further out than the bat's)
    }
    o.visible = true; o.updateMatrixWorld(true);
    (this.heldGrip ||= new THREE.Vector3()).set(...w.grip_primary).applyMatrix4(o.matrixWorld);
    (this.heldTip ||= new THREE.Vector3()).set(...(w.impact_point || w.tip)).applyMatrix4(o.matrixWorld);
    this.testGrip = this.heldGrip; this.testTip = this.heldTip;
  }
  // The bat as a one-handed weapon (2026-10-16: Quaternius's Sword Regular Combo, split into its strikes; the user's pick
  // over the reference-video combo). hold: as placeHeld; idle: the Sword Idle clip, its upper body the bat's stance.
  // her closed fist (the bat idle's grip, setHandPoses) on one hand, by w
  closeFist(side, w) { for (const [b, q, sd] of this.fist || []) if (sd === side) b.quaternion.slerp(q, Math.min(1, w)); this.bones[side + 'Hand']?.updateMatrixWorld(true); }
  setOneHandedBat(hold, idle) {
    this.batLib = hold; if (idle) this.swordIdleBase = idle.name;
    if (idle && !this.actions.sword_idle_upper) {
      const full = stripRoot(idle, hipsRest(this.model)), ht = full.tracks.find((t) => /Hips.quaternion$/.test(t.name));
      if (ht) this.swordHips = ht.createInterpolant(new Float32Array(4)); // (its hip tilt, for the re-based bat run options)
      const c = subClip(full, (b) => !LOWER.test(b), 'sword_idle_upper'); loopClip(c);
      const a = this.mixer.clipAction(c); this.actions.sword_idle_upper = a; a.play(); a.setEffectiveWeight(0);
      // its bat arm alone (shoulder to fingers): calms the bat arm's swing in the 'plain' run (batArmHold)
      const r = subClip(full, (b) => /Right(Shoulder|Arm|ForeArm)$/.test(b.replace(/\..*$/, '')), 'sword_idle_rarm'); loopClip(r);
      const ra = this.mixer.clipAction(r); this.actions.sword_idle_rarm = ra; ra.play(); ra.setEffectiveWeight(0);
      // and its bat hand + fingers (the wrist sets the bat's angle: held, the bat stops flipping up with each swing)
      const h = subClip(full, (b) => /RightHand/.test(b), 'sword_idle_rhand'); loopClip(h);
      const ha = this.mixer.clipAction(h); this.actions.sword_idle_rhand = ha; ha.play(); ha.setEffectiveWeight(0);
    }
    this.up.sword ??= 0;
  }

  // The bat on her back (2026-10-17, the user: "Sword Enter ... when we are carrying a melee weapon on our back"): carried
  // and not in hand, it rides her upper back where Quaternius's Sword_Enter (UAL1) reaches for it; taking it out plays
  // Sword_Enter on her upper body (legs keep walking), the bat leaving her back on the frame her hand comes closest to its
  // handle (grab). An attack cuts the draw short. The back slot, set once here in her Spine2 bone's frame from her own
  // build: the handle a hand behind and above her right shoulder, the barrel diagonally down across her back to her left
  // hip (as a sword on the back; the first try, the bat as her fist holds it at the clip's furthest-back frame, stood
  // straight up over her head). (?batdraw=0: off)
  setupBatBack(enter) {
    if (!this.batLib?.obj || !enter || new URLSearchParams(globalThis.location?.search || '').get('batdraw') === '0') return false;
    const full = stripRoot(enter.clone(), hipsRest(this.model)), t0 = Math.min(...full.tracks.map((t) => t.times[0])), n = Math.round((full.duration - t0) * 30) + 1;
    const up = subClip(full, (b) => !LOWER.test(b), 'bat_draw_upper'), a = this.mixer.clipAction(up); this.actions.bat_draw_upper = a; a.play(); a.setEffectiveWeight(0); a.timeScale = 0;
    const acts = Object.values(this.actions), saved = acts.map((x) => [x, x.getEffectiveWeight(), x.time]);
    const op = this.outer.position.clone(), ry = this.container.rotation.y;
    this.outer.position.set(0, 0, 0); this.container.rotation.y = 0;
    for (const x of acts) x.setEffectiveWeight(0);
    // (measured on the whole clip: posed alone, the upper-body layer leaves the hips unwritten, NaN after mixerWritesAll)
    const meas = this.mixer.clipAction(full); meas.play(); meas.timeScale = 0;
    const pose = (f) => { for (const [b, q] of this.restQ) b.quaternion.copy(q); mixerWritesAll(this.mixer); meas.setEffectiveWeight(1); meas.time = t0 + (f - 1) / 30 + (f & 1) * 1e-6; this.mixer.update(0); this.outer.updateMatrixWorld(true); };
    // the slot, on her at rest (she faces +Z: her back is -Z)
    for (const [b, q] of this.restQ) b.quaternion.copy(q); this.outer.updateMatrixWorld(true);
    const B = this.bones, k = this.H / 1.62, wp = (n) => B[n].getWorldPosition(new THREE.Vector3());
    const grip = wp('RightArm').lerp(wp('RightShoulder'), 0.5).add(new THREE.Vector3(0, 0.1 * k, -0.15 * k)); // (the handle: behind and over the right shoulder)
    const hip = wp('LeftUpLeg').add(new THREE.Vector3(0.04 * k, 0.12 * k, -0.17 * k)); // (the barrel's end: behind the left hip)
    const w = this.batLib.w, size = (this.batLib.fit?.size ?? 100) / 100, dir = hip.clone().sub(grip).normalize();
    const o = this.batLib.obj;
    o.quaternion.setFromUnitVectors(new THREE.Vector3(...w.shaft_axis).normalize(), dir);
    o.scale.setScalar(size); o.position.copy(grip).sub(new THREE.Vector3(...w.grip_primary).multiplyScalar(size).applyQuaternion(o.quaternion));
    o.updateMatrixWorld(true);
    this.batBack = new THREE.Matrix4().copy(B.Spine2.matrixWorld).invert().multiply(o.matrixWorld);
    const gripS = B.Spine2.worldToLocal(grip.clone());
    // the grab: the frame her right fist comes closest to the handle (in her chest's frame), frames 6-32
    let grab = 20, best = 9;
    for (let f = 6; f <= Math.min(32, n); f++) { pose(f); const d = B.Spine2.worldToLocal(wp('RightHandMiddle1')).distanceTo(gripS); if (d < best) { best = d; grab = f; } }
    this.batGrabGap = best;
    meas.stop(); this.mixer.uncacheAction(full);
    for (const [x, w, t] of saved) { x.setEffectiveWeight(w); x.time = t; }
    a.setEffectiveWeight(0); this.outer.position.copy(op); this.container.rotation.y = ry; o.visible = false;
    this.drawClip = { act: a, t0, frames: n, grab, dur: 0.8 }; this.draw = null; this.prevEquip = null;
    return grab;
  }
  placeBatBack() {
    const o = this.batLib.obj; this.bones.Spine2.updateWorldMatrix(true, false);
    _m4.copy(this.bones.Spine2.matrixWorld).multiply(this.batBack); _m4.decompose(o.position, o.quaternion, o.scale);
    o.visible = this.outer.visible; o.updateMatrixWorld(true);
  }

  // Pistol reload magazines. Frames of pistol_reload (Quaternius Pistol_Reload with the support hand placed on the gun;
  // measured on her: gun tips up 4-7, left hand at the hip pouch 13-15, at the grip 28-37). The empty one leaves the grip
  // at `drop` and falls to the floor; the loaded one is held by its base between her left thumb and index finger from
  // `grab`, eases to its seat (MAG_SEAT, in the pistol model's own frame: its base plate over Pistol_Magazine_Art) from
  // `insert` and is seated at `seat`. The Rig Lab (viewer.js updateMags) plays the same rules.
  placeMags(dt) {
    const E = PISTOL_MAGS, f = this.pistolReloadFrame, inner = this.pistol.children[0];
    const playing = f >= 0 && this.pistol.visible && inner;
    if (this.magArt) this.magArt.visible = !(playing && f >= E.drop && f < E.seat);
    if (this.magLoaded && inner) {
      const on = playing && f >= E.grab && f < E.seat && !(this.carryW > 0); // (the case in his left hand: no fresh magazine in it)
      if (on) {
        if (this.magLoaded.parent !== inner) inner.add(this.magLoaded);
        inner.updateWorldMatrix(true, false);
        this.bones.LeftHandThumb2.getWorldPosition(_v4).lerp(this.bones.LeftHandIndex2.getWorldPosition(_v3), 0.5);
        const u = f <= E.insert ? 0 : clamp((f - E.insert) / (E.seat - E.insert), 0, 1);
        magInsert(this.magLoaded.position, inner.worldToLocal(_v4), smooth(u)); this.magLoaded.quaternion.identity();
      }
      this.magLoaded.visible = on;
    }
    if (this.magEmpty) {
      if (playing && f >= E.drop && (this.prevMagF ?? -1) < E.drop) { // it leaves the grip now: start its fall from the seated pose
        inner.updateWorldMatrix(true, false);
        const M = _m4.copy(inner.matrixWorld).multiply(_m4b.makeTranslation(MAG_SEAT.x, MAG_SEAT.y, MAG_SEAT.z));
        this.magFall = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), t: 0 }; M.decompose(this.magFall.p, this.magFall.q, this.magFall.s);
      }
      const F = this.magFall;
      if (F) {
        F.t += dt; const tHit = Math.sqrt(Math.max(0, 2 * (F.p.y - 0.02) / 9.8)), t = Math.min(F.t, tHit);
        this.magEmpty.position.copy(F.p); this.magEmpty.position.y -= 4.9 * t * t;
        _q3.setFromAxisAngle(_v3.set(0, 0, 1).applyQuaternion(F.q), 5 * t); this.magEmpty.quaternion.copy(_q3).multiply(F.q); this.magEmpty.scale.copy(F.s);
        this.magEmpty.visible = this.outer.visible && F.t < tHit + 4; // (lies on the floor for 4 s)
        if (!this.magEmpty.visible) this.magFall = null;
      } else this.magEmpty.visible = false;
    }
    this.prevMagF = playing ? f : -1;
  }

  // The pistol in her fist, as the Rig Lab places it (viewer.js pistolInFist, same math): the grip through the fist centre
  // (the centre of the curled index-pinky joints 1-3), the grip line along the knuckles (pinky -> index), the barrel toward
  // the forearm's direction; then the user's fit for this character (assets/hold/pistol_fit.json: size %, a move in mm
  // along the gun's axes, a turn in degrees), pivoting on the fist centre. Follows her hand in every clip, the reload too.
  pistolInFist() {
    const B = this.bones, P = this.pistolFit, o = this.pistol;
    if (!P || !o.userData.slide || !B.RightHandIndex1 || !B.RightHandPinky1) return false;
    const c = _pf.set(0, 0, 0); let n = 0;
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = B['RightHand' + f + i]; if (b) { c.add(b.getWorldPosition(_pf2)); n++; } }
    c.multiplyScalar(1 / n);
    const A = B.RightHandIndex1.getWorldPosition(_pf2).sub(B.RightHandPinky1.getWorldPosition(_pf3)).normalize();
    const F = B.RightHand.getWorldPosition(_pf3).sub(B.RightForeArm.getWorldPosition(_pf4)); F.addScaledVector(A, -F.dot(A)).normalize();
    _m4.makeBasis(PG_AXIS, PG_BARREL, _pf4.crossVectors(PG_AXIS, PG_BARREL));
    _m4b.makeBasis(A, F, _pf4.crossVectors(A, F)).multiply(_m4.transpose());
    _q.setFromRotationMatrix(_m4b);
    const d2r = Math.PI / 180, size = (P.size ?? 100) / 100;
    o.scale.setScalar(size);
    o.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set((P.tilt || 0) * d2r, (P.turn || 0) * d2r, (P.roll || 0) * d2r, 'YXZ')));
    o.position.copy(c).add(_pf2.set(P.side || 0, P.up || 0, P.fwd || 0).multiplyScalar(0.001).applyQuaternion(_q))
      .sub(_pf3.copy(PG_AT).multiplyScalar(size * PISTOL_CORE_SCALE).applyQuaternion(o.quaternion));
    return true;
  }

  placeWeapons(s, dt) {
    if (s.equipped === 'test' && this.test) { this.pistol.visible = this.shotgun.visible = this.melee.visible = this.shell.visible = false; if (this.batLib?.obj) this.batLib.obj.visible = false; if (this.axeLib?.obj) this.axeLib.obj.visible = false; this.placeTest(); return; }
    // the axe, held as the bat (2026-10-19): in her right fist with the user's packaxe fit; the bat stays on her back if she has it
    if (this.axeLib?.obj) {
      const held = s.equipped === 'axe' && this.weaponShown !== 'fists' && this.weaponShown !== 'pistol' && this.weaponShown !== 'shotgun';
      if (held) {
        this.pistol.visible = this.shotgun.visible = this.melee.visible = this.shell.visible = false;
        this.placeHeld(this.axeLib); this.batTip.copy(this.heldTip);
        if (this.batLib?.obj) { if (this.batBack && s.owned?.includes('bat')) this.placeBatBack(); else this.batLib.obj.visible = false; }
        return;
      }
      this.axeLib.obj.visible = false;
    }
    if (this.test?.obj) this.test.obj.visible = false;
    if (this.batLib?.obj) {
      const one = s.equipped === 'bat' && this.weaponShown !== 'fists' && this.weaponShown !== 'pistol' && this.weaponShown !== 'shotgun';
      const onBack = this.batBack && (this.draw ? this.draw.f < this.drawClip.grab : !one); // (drawing: on her back until her hand reaches it)
      if (one && !onBack) { this.pistol.visible = this.shotgun.visible = this.melee.visible = this.shell.visible = false; this.placeHeld(this.batLib); this.batTip.copy(this.heldTip); return; }
      if (onBack && (one || s.owned?.includes('bat'))) this.placeBatBack(); else this.batLib.obj.visible = false;
      if (one) { this.pistol.visible = this.shotgun.visible = this.melee.visible = this.shell.visible = false; return; } // (empty-handed while she reaches for it)
    }
    const shown = this.weaponShown;
    this.pistol.visible = shown === 'pistol'; this.shotgun.visible = shown === 'shotgun'; this.melee.visible = shown === 'axe'; this.shell.visible = false;
    if (this.melee.userData.axeInner) { this.melee.userData.axeInner.visible = !this.batMode; this.batModel.visible = !!this.batMode; }
    if (shown === 'pistol') {
      // pistol: in her fist with the user's Rig Lab fit (pistolInFist); the old placement (?pistolplace=old, or no fit):
      // barrel along the arms' line toward the target, during a reload following the right hand through the socket
      // calibrated in the aiming pose
      if (this.pistolPlace === 'old' || !this.pistolInFist()) {
        this.aimQuat(_q);
        const rW = this.reloadW || 0;
        if (rW > 0 && this.pistolSocket) { this.bones.RightHand.getWorldQuaternion(_q2); _q.slerp(_q2.multiply(this.pistolSocket), rW); }
        this.grip('Right', _v);
        this.pistol.position.copy(_v);
        this.pistol.quaternion.copy(_q); this.pistol.scale.setScalar(1);
      }
      this.pistol.updateMatrixWorld(true);
      this.pistol.userData.muzzle.getWorldPosition(this.muzzleWorld);
    } else if (shown === 'shotgun') {
      // shotgun: rides the right hand. The pump slides after each shot and at the end of a reload; the left
      // hand follows it (IK), and during the reload it carries a shell up into the loading port.
      const G = this.shotgun, U = G.userData, SP = SHOTGUN_SPEC;
      const C = this.shotgunClip(), F = C ? this.shotgunFitNow(C) : this.shotgunFit; // (the slide finisher's own setup while it plays)
      this.untwistWrist('Left', 45);
      this.bones.RightHand.getWorldQuaternion(_q).multiply(this.shotgunSocket);
      this.grip('Right', _v);
      G.position.copy(_v); G.quaternion.copy(_q);
      if (F) applyFit(G, _v, _q, F, AXE_AT); // (the user's shotgun fit, pivoting on the right grip)
      let slide = 0;
      if (s.action === 'shot') { const u = (s.actionT - SP.pumpStart) / (SP.pumpEnd - SP.pumpStart); if (u > 0 && u < 1) slide = Math.sin(Math.PI * u); }
      const rf = this.reloadFrame;
      if (rf >= SP.rackFrom && rf <= SP.rackTo) slide = Math.max(slide, Math.sin(Math.PI * (rf - SP.rackFrom) / (SP.rackTo - SP.rackFrom)));
      U.pump.position.x = U.pumpX - SP.pumpStroke * slide;
      G.updateMatrixWorld(true);
      U.muzzle.getWorldPosition(this.muzzleWorld);
      this.shotgunLeftHand(rf, G, F, C);
    } else {
      // axe: handle direction from the right-hand socket (as on the reference skeleton), grip between
      // the hands; the blade turns to lead the motion (edge first), resting toward the front
      this.grip('Right', _v); this.grip('Left', _v2);
      // socket: the idle grip, blended with the current (and fading) attack's grip
      let dir;
      if (this.batSocket) {
        const wA = this.swingAct ? this.swingW : 0, wP = this.prevSwing ? this.prevSwing.getEffectiveWeight() : 0, wI = Math.max(0, 1 - wA - wP);
        const ms = this.meleeSocket || {};
        const inHand = (v, hand) => { this.bones[(hand || 'Right') + 'Hand'].getWorldQuaternion(_q); return _v5.copy(v).applyQuaternion(_q); };
        dir = _v3.set(0, 0, 0).addScaledVector(inHand(this.batSocket, 'Right'), wI);
        if (wA) dir.addScaledVector(inHand(ms[this.swingName] || this.batSocket, ms[this.swingName] ? this.swingHand : 'Right'), wA);
        if (wP) dir.addScaledVector(inHand(ms[this.prevSwingName] || this.batSocket, ms[this.prevSwingName] ? this.prevSwingHand : 'Right'), wP);
        dir.normalize();
      } else dir = _v3.copy(_v).sub(_v2).normalize();
      const M = this.melee;
      if (this.batMode) {
        // the bat hangs from the right hand (its grip, along the socket); the LEFT hand is then put on the handle by
        // two-bone IK after the blend, at the clip's own spacing along the bat. The bat never follows the left hand, so
        // there is no loop; blends between clips (into a swing, back to idle) can no longer pull the hands apart.
        const span = clamp(_v6.copy(_v).sub(_v2).dot(dir), 0.07, 0.16);
        _v7.copy(_v).addScaledVector(dir, -span);
        this.reachClavicle('Left', _v7);
        this.ikArm('Left', _v7, 1);
        this.grip('Left', _v2);
        M.position.copy(_v).addScaledVector(dir, -span / 2);
      } else {
        // the handle through both fist centres, its head end from the socket direction (render/holdfit.js twoHandLine, as
        // the Rig Lab places it; before 2026-10-17 it ran from the palms' midpoint and passed behind her fists)
        const L2 = twoHandLine(this.bones, dir, this._l2 ||= { c: new THREE.Vector3(), d: new THREE.Vector3(), span: 0 }, this.swingAct ? this.swingHand : 'Right', this.axeDir);
        if (L2) { dir.copy(L2.d); M.position.copy(L2.c); (this.axeDir ||= new THREE.Vector3()).copy(dir); } else M.position.copy(_v).add(_v2).multiplyScalar(0.5);
      }
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
      if (!this.bladeInit || this.batMode) { this.bladeQ.copy(target); this.bladeInit = true; } // (a round bat has no edge to lead: it follows the hand exactly)
      else {
        this.bladeQ.slerp(target, 1 - Math.exp(-dt * (sp > 2 ? 30 : 10)));
        // (only the blade's roll is eased: the handle stays exactly on its line through her fists, it lagged 3 cm off them)
        _q.setFromUnitVectors(_v5.set(0, 0, 1).applyQuaternion(this.bladeQ), dir); this.bladeQ.premultiply(_q);
      }
      M.quaternion.copy(this.bladeQ);
      if (!this.batMode && this.axeFit) applyFit(M, _v5.copy(M.position), this.bladeQ, this.axeFit, AXE_AT); // (the user's axe fit)
      M.updateMatrixWorld(true);
      // the free fist kept on the handle (2026-10-17, the Blender hold check: in the leg chop's slash her hands part and the
      // handle ran under one wrist): when it drifts more than ~1 cm off, it is put back on at its own spot along the handle,
      // unless the hands have really let go (more than ~45 cm apart: a one-handed follow-through)
      if (!this.batMode) {
        const off = (this.swingAct ? this.swingHand : 'Right') === 'Right' ? 'Left' : 'Right', hd = _v5.set(0, 0, 1).applyQuaternion(M.quaternion);
        const gap = handleSpot(this.bones, off, M.position, hd, -0.12, 0.5, _v6), span = this._l2?.span ?? 0;
        const wOn = smooth(clamp((gap - 0.012) / 0.04, 0, 1)) * (1 - smooth(clamp((span - 0.45) / 0.15, 0, 1)));
        if (wOn > 0.01 && HOLD_LAYERS.secondHand) { this.reachClavicle(off, _v6); handOnto(this.bones, off, _v6, hd, wOn, solveArm); this.closeFist(off, wOn); }
      }
    }
  }


  die(dt, s) {
    if (this.deathT < 0) {
      this.deathT = 0;
      for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
      const d = this.act('death_fall'); d.reset(); d.setLoop(THREE.LoopOnce); d.clampWhenFinished = true; d.setEffectiveWeight(1); d.play();
      this.pistol.visible = this.shotgun.visible = this.melee.visible = this.shell.visible = false;
      if (this.test?.obj) this.test.obj.visible = false;
    }
    this.deathT += dt;
    for (const [b, q] of this.restQ) b.quaternion.copy(q); mixerWritesAll(this.mixer); // (as update: so the posture fix never piles up)
    this.mixer.update(dt);
    this.container.updateMatrixWorld(true); this.posture();
    this.hair.update(dt);
  }
}

// ----------------------------------------------------------------------------------------------
const SHARED_CLIPS = new WeakMap(); // gltf -> processed clips, shared by all views of a zombie type
const ONE_SHOTS = ['attack', 'hit_flinch', 'hit_stumble', 'death_back', 'death_forward', 'death_headshot_knees', 'death_chest_back',
  'react_large_front', 'react_large_back', 'react_large_left', 'react_large_right', 'knockdown', 'standup_stomach', 'scratch', 'stumble_fall', 'standup_back'];
// the sprinter's trip (core/zombies.js tumble): stumble_fall's stagger back and fall (frames 40-90, on her back by ~80),
// then standup_back from the floor (she sits up onto her backside around frames 30-45, then stands)
const TUMBLE = { f0: 40, f1: 90, up0: 1, up1: 94 };
const KIPUP = 1.05; // s: the lady's kip-up at the end of her get-up (ZombieView.ladyKipUp)
// the scratch (Quaternius UAL2 Zombie_Scratch, retargeted by tools/anim/zombie_clip.py): arms up over frames 1-16 (played
// over the wind-up), the rake 17-21 (the strike), back down 22-45 (the recovery; the clip's long settle is skipped)
const SCRATCH = { f0: 1, hit: 17, hitEnd: 21, end: 45 };
// the guard's leap-slam (2026-10-18, built in the Animation Hub from Quaternius clips, assets/zombie_moves/guard.glb
// guard_leap_slam; replaces the KayKit jump chop): over the wind-up (frames 1-77) he sinks behind his shield and holds the
// crouch (the tell), drives up (takeoff at 45), rises slowing to a float at the top, and drops; the shield hits the floor
// at 77; braced over it 77-81 (the strike), then rises back into his hold 81-114 (the recovery). The leap's height is in
// the clip (lift 1); it jumps in place: the sim moves him forward.
const SLAM = { f0: 1, hit: 77, hitEnd: 81, end: 114, lift: 1, clip: 'guard_leap_slam' };
// the pounce (core/zombies.js; Quaternius UAL2 Zombie_Bite, assets/zombie_moves): rears up over the wind-up (frames 1-10),
// the lunge and bite over the leap (10-19), down and back up over the recovery (19-46)
const POUNCE = { f0: 1, hit: 10, hitEnd: 19, end: 46, clip: 'ual_Zombie_Bite' };
const ATTACK_CLIPS = { scratch: SCRATCH, slam: SLAM, pounce: POUNCE, smash: { f0: 8, hit: 33, hitEnd: 40, end: 62, act: 'attack' } }; // (smash: the big lady's two-handed close attack, her Mixamo zombie attack)
// the guard after his arm tore off (core/zombies.js GUARD; assets/zombie_moves/guard-b.glb, Quaternius UAL2 on his skeleton):
// his one arm swung wildly (a hook, a backhand, a slash, in turn), then his torn arm swung as a club (the slashes, heavier)
const SWINGS = {
  hook: { f0: 1, hit: 7, hitEnd: 10, end: 15, act: 'ual_Melee_Hook' },
  slashA: { f0: 1, hit: 6, hitEnd: 9, end: 14, act: 'ual_Sword_Regular_A' },
  slashB: { f0: 1, hit: 7, hitEnd: 11, end: 17, act: 'ual_Sword_Regular_B' },
};
const attackClip = (z) => z.attack === 'flail' ? SWINGS[['hook', 'slashB', 'slashA'][(z.swingN || 0) % 3]] : z.attack === 'club' ? SWINGS[(z.swingN || 0) % 2 ? 'slashA' : 'slashB'] : ATTACK_CLIPS[z.attack];
const HEAVE = 0.5;
const LOOK_MAX = 1.1; // rad: the most her head is turned back onto the aim (YolaView.headLook) // s per heave at his planted shield (core/zombies.js GUARD.heave; main.js times the creak to it)
// the add-on one-shots (assets/zombie_moves/*-b.glb, 2026-10-18): the kip-up, the climb out of the floor, the knockback,
// the crawl's start, the scratch on the run
const EXTRA_ONCE = ['patient_bed_rise', 'ual_IdleToLay', 'ual1_Sitting_Exit', 'ual_KipUp', 'ual_Zombie_Spawn', 'ual_Hit_Knockback', 'ual1_Crawl_Enter', 'ual_Zombie_Scratch', 'ual_LayToIdle', 'ual_Melee_Hook', 'ual_Sword_Regular_A', 'ual_Sword_Regular_B', 'ual1_PickUp_Table', 'ual_Farm_Harvest'];
// how a standing zombie walks (core/zombies.js GAITS): Quaternius's zombie walk in eight directions / run in four, all
// played from one shared phase (the clips of a set are the same length, so the feet stay in step through a blend) at the
// rate that matches its travel. dir: [left, forward] travel; speed: the clip's own (m/s, its root motion, the mannequin at
// 1.69 m: scaled by the zombie's height)
// The hospital's own zombies (core/zombies.js prop; 2026-10-18, the user). IV: its drip stand rolls beside it on its castors,
// the stand's base on a spring to a spot ahead of its left hip (it lags and swings round, the pole tips against its
// motion), its left hand on the pole at grip (m up the pole): held by IK, let go through an attack or a fall and taken
// again if it is still in reach. CHAIR: the wheelchair under its hips (seat: the hips' height, m; fwd: the chair's centre
// ahead of the hips; yaw: the model's own front), its hands on the hand rims pushing (rim: centre ahead of the hips /
// up / out to the side, radius) one push each rimArc of wheel turn
const IV = { grip: 1.08, tilt: 0.05, maxTilt: 0.2 }; // (where it is and who holds it: core/loose.js)
// oxygen cylinders (core/loose.js O2): a medical cylinder (green body, white shoulder, a black valve and regulator with a
// gauge) standing on its own, behind a wheelchair, or strapped to a two-wheeled trolley whose handle the walker holds where
// a drip stand's pole would be (IV.grip: the same hand IK)
const _tp = {};
let O2MAT = null;
const o2Mats = () => (O2MAT ||= {
  body: new THREE.MeshStandardMaterial({ color: 0x2f7a46, roughness: 0.42, metalness: 0.35 }),
  collar: new THREE.MeshStandardMaterial({ color: 0xe9ece6, roughness: 0.35, metalness: 0.2 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1d1f21, roughness: 0.5, metalness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.35, metalness: 0.8 }),
  label: new THREE.MeshStandardMaterial({ color: 0xf0e7c8, roughness: 0.7 }),
});
function o2Cylinder(h = 0.95, r = 0.095) {
  const md = propClone('o2_cylinder'); if (md) return md; // (the Blender model, render/roomprops.js; else built here)
  const M = o2Mats(), g = new THREE.Group(), add = (geo, m, y, x = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(r, r, h * 0.78, 18), M.body, h * 0.39);
  add(new THREE.CylinderGeometry(r * 1.002, r * 1.002, h * 0.12, 18, 1, true), M.label, h * 0.42); // (the label band)
  const sh = add(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.collar, h * 0.78); sh.scale.y = 0.75; // (the white shoulder)
  add(new THREE.CylinderGeometry(r * 0.28, r * 0.32, h * 0.07, 10), M.dark, h * 0.87);
  add(new THREE.BoxGeometry(r * 0.9, h * 0.06, r * 0.55), M.dark, h * 0.92);
  add(new THREE.CylinderGeometry(r * 0.32, r * 0.32, r * 0.18, 14), M.steel, h * 0.92, r * 0.42).rotation.z = Math.PI / 2; // (the gauge)
  add(new THREE.CylinderGeometry(r * 0.5, r * 0.5, h * 0.025, 14), M.dark, h * 0.975); // (the valve's handwheel)
  return g;
}
function o2Trolley() {
  const md = propClone('o2_trolley'); if (md) return md; // (the Blender model; its handle at IV.grip on its post)
  const M = o2Mats(), g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.26, 0.02, 0.22), M.steel, 0, 0.07, 0.06); // (the foot plate)
  for (const s of [-1, 1]) { const w = add(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 14), M.dark, s * 0.15, 0.07, 0.1); w.rotation.z = Math.PI / 2; }
  add(new THREE.CylinderGeometry(0.012, 0.012, IV.grip + 0.04, 8), M.steel, 0, (IV.grip + 0.04) / 2, 0); // (the handle post: the grip at IV.grip)
  add(new THREE.BoxGeometry(0.22, 0.02, 0.02), M.steel, 0, IV.grip, 0);
  const c = o2Cylinder(0.9, 0.09); c.position.set(0, 0.08, 0.1); c.rotation.x = -0.18; g.add(c); // (leaning back in its cradle)
  for (const y of [0.35, 0.7]) add(new THREE.TorusGeometry(0.095, 0.008, 6, 16), M.dark, 0, 0.08 + y, 0.1 + y * 0.18).rotation.x = Math.PI / 2 - 0.18; // (its straps)
  return g;
}
const CHAIR = { seat: 0.62, fwd: 0.06, yaw: 0, rim: [-0.04, 0.36, 0.3], rimR: 0.27, rimArc: 1.6, h: 0.97 };
const GAIT_SETS = {
  ual: { idle: 'ual_Zombie_Idle_Loop', dur: 1.333, dirs: [['Fwd', 0, 1, 1.05], ['Fwd_L', 0.707, 0.707, 1.06], ['L', 1, 0, 0.75], ['Bwd_L', 0.707, -0.707, 1.06], ['Bwd', 0, -1, 1.2], ['Bwd_R', -0.707, -0.707, 1.06], ['R', -1, 0, 0.75], ['Fwd_R', -0.707, 0.707, 1.06]].map(([k, x, z, s]) => ({ n: `ual_Zombie_Walk_${k}_Loop`, x, z, s })) },
  run: { idle: 'ual_Zombie_Idle_Loop', dur: 0.733, dirs: [['Fwd', 0, 1, 4.1], ['L', 1, 0, 2.05], ['Bwd', 0, -1, 4.1], ['R', -1, 0, 2.05]].map(([k, x, z, s]) => ({ n: `ual_Zombie_Run_${k}_Loop`, x, z, s })) },
};
// the short hit flinches (Quaternius UAL1 Hit_*, assets/zombie_moves) for a bullet or a punch, by where it landed
const HIT_CLIPS = { Head: 'ual1_Hit_Head', Forearm_L: 'ual1_Hit_Shoulder_L', Forearm_R: 'ual1_Hit_Shoulder_R', torso: ['ual1_Hit_Chest', 'ual1_Hit_Stomach'], leg: 'ual1_Hit_Stomach' };
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
// a store zombie's own cut-apart body (2026-10-21, the Zombie Male AAB's BodyParts: tools/anim/unity_to_glb.py parts=), its
// cuts as the pack made them: pieces named Mod_<part>__<chunk>__<piece>, several to a part (forearm, hand and sleeve)
const MOD_PIECE = /^Mod_(Head|Forearm_L|Forearm_R|LowerLeg_L|LowerLeg_R)__/;
const GORE_NAME = /^GORE_(Head|Forearm_L|Forearm_R|LowerLeg_L|LowerLeg_R)_(Stump|Detached)/;
// bone the stump sits on (bleeds from), and the severed piece's two ends [from, to, extend] and radius (m at 1.7 m)
const STUMP_BONE = { Head: 'Neck', Forearm_L: 'LeftForeArm', Forearm_R: 'RightForeArm', LowerLeg_L: 'LeftLeg', LowerLeg_R: 'RightLeg' };
const PIECE_ENDS = {
  Head: ['Head', 'HeadTop_End', 0, 0.1], Forearm_L: ['LeftForeArm', 'LeftHand', 0.45, 0.045], Forearm_R: ['RightForeArm', 'RightHand', 0.45, 0.045],
  LowerLeg_L: ['LeftLeg', 'LeftFoot', 0.1, 0.06], LowerLeg_R: ['RightLeg', 'RightFoot', 0.1, 0.06],
};
const MAX_PIECES = 40;
// ---- cutting a zombie that has no cut model (the guard, the lady: PROGRESS.md gore plan, 2026-10-17) ----
// From its own skin weights: each vertex belongs to the chunk of its strongest bone (the chunk whose root bone is that bone
// or its nearest ancestor among the roots); each triangle to its first vertex's chunk. A chunk is baked in the pose on
// screen (as ZombieView.sever bakes a module). Not capped: the cut is open, blood covers it.
// the guard's cuts: his arms at the SHOULDER (the plan), his head; [chunk root bone, the piece's far end, radius at 1.7 m]
const CUT_ROOTS = { Forearm_L: ['LeftArm', 'LeftHand', 0.07], Forearm_R: ['RightArm', 'RightHand', 0.07], Head: ['Head', 'HeadTop_End', 0.1], LowerLeg_L: ['LeftLeg', 'LeftFoot', 0.06], LowerLeg_R: ['RightLeg', 'RightFoot', 0.06] };
const CUT_STUMP = { Forearm_L: 'LeftShoulder', Forearm_R: 'RightShoulder', Head: 'Neck', LowerLeg_L: 'LeftUpLeg', LowerLeg_R: 'RightUpLeg' };
// the lady's burst: her body in chunks [root bone, far end, radius]
const BURST_CHUNKS = { Head: ['Head', 'HeadTop_End', 0.11], ArmL: ['LeftArm', 'LeftForeArm', 0.07], ForeL: ['LeftForeArm', 'LeftHand', 0.06], ArmR: ['RightArm', 'RightForeArm', 0.07],
  ForeR: ['RightForeArm', 'RightHand', 0.06], Chest: ['Spine2', 'Neck', 0.17], Belly: ['Spine', 'Spine2', 0.18], Pelvis: ['Hips', 'Spine', 0.16], ThighL: ['LeftUpLeg', 'LeftLeg', 0.09],
  ThighR: ['RightUpLeg', 'RightLeg', 0.09], ShinL: ['LeftLeg', 'LeftFoot', 0.07], ShinR: ['RightLeg', 'RightFoot', 0.07] };
// chunk of each bone of a skeleton: walk up to the nearest chunk root (roots: bone name -> chunk)
function chunkOfBones(skeleton, roots) {
  return skeleton.bones.map((b) => { for (let n = b; n && n.isBone; n = n.parent) { const k = roots[n.name.replace(/^mixamorig:?/, '')]; if (k) return k; } return null; });
}
// bake the chunks of a skinned model: { chunk: THREE.Group of still meshes in world space, centred on c[chunk], turned by qi[chunk] }
function bakeChunks(model, roots, frames) {
  const out = {};
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    o.skeleton.update();
    const g = o.geometry, n = g.attributes.position.count, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const boneChunk = chunkOfBones(o.skeleton, roots), vChunk = new Array(n);
    for (let i = 0; i < n; i++) { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } vChunk[i] = boneChunk[bi]; }
    const idx = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
    const tris = {}; for (let t = 0; t < idx.length; t += 3) { const k = vChunk[idx[t]]; if (k) (tris[k] ||= []).push(idx[t], idx[t + 1], idx[t + 2]); }
    for (const [k, list] of Object.entries(tris)) {
      const F = frames[k]; if (!F) continue;
      const map = new Map(), pos = [], uv = [], index = [], uvs = g.attributes.uv;
      for (const vi of list) {
        let j = map.get(vi);
        if (j === undefined) { j = map.size; map.set(vi, j); o.getVertexPosition(vi, _bv); _bv.applyMatrix4(o.matrixWorld).sub(F.c).applyQuaternion(F.qi); pos.push(_bv.x, _bv.y, _bv.z); if (uvs) uv.push(uvs.getX(vi), uvs.getY(vi)); }
        index.push(j);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(index); geo.computeVertexNormals();
      const mat = o.material.clone(); if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
      (out[k] ||= new THREE.Group()).add(new THREE.Mesh(geo, mat));
    }
  });
  return out;
}
const _bv = new THREE.Vector3(), _bq = new THREE.Quaternion();
// The guard's torn arm, limp (ZombieView.buildLimpArm): its frame is the forearm's (Y from the wrist to the elbow, X the
// elbow's hinge); the upper arm's turn off it is limpQ(psi, th): th the elbow's bend (0 straight: the stop it whips against,
// only ever the way an elbow folds), psi a little twist about the forearm. LIMP: the joints' limits (rad), the upper arm's
// swinging mass (L: of its length from the elbow), damping (1/s), and the hand's flop off the wrist
const LIMP = { flex: 2.45, twist: 0.7, L: 0.72, damp: 1.3, handCone: 0.95, handL: 0.1, handDamp: 2.5, flick: 3.2 };
const _lx = new THREE.Vector3(1, 0, 0), _ly = new THREE.Vector3(0, 1, 0), _lqa = new THREE.Quaternion(), _lqb = new THREE.Quaternion();
const limpQ = (psi, th, out) => out.multiplyQuaternions(_lqa.setFromAxisAngle(_ly, psi), _lqb.setFromAxisAngle(_lx, -th));
const limpDir = (psi, th, out) => out.set(-Math.sin(th) * Math.sin(psi), Math.cos(th), -Math.sin(th) * Math.cos(psi));
function limpSolve(v, A) { // v: the upper arm's direction in the forearm's frame (unit) -> [psi, th] inside the elbow's limits
  let th = Math.acos(clamp(v.y, -1, 1)), psi = th > 1e-3 ? Math.atan2(-v.x, -v.z) : A.psi;
  if (Math.abs(psi) > LIMP.twist) { // bent the wrong way (or twisted past the joint): the nearest it can be; straight at worst
    const hh = Math.sin(th) * Math.cos(Math.abs(psi) - LIMP.twist);
    th = hh <= 0 ? 0 : Math.atan2(hh, v.y); psi = Math.sign(psi) * LIMP.twist;
  }
  return [psi, Math.min(th, LIMP.flex)];
}
const _lq = new THREE.Quaternion(), _lqi = new THREE.Quaternion(), _lE = new THREE.Vector3(), _lEi = new THREE.Vector3(), _lv = new THREE.Vector3(), _lw = new THREE.Vector3(), _lg = new THREE.Vector3();

// Stand-in for the guard's shield: a broken-off hospital-bed end panel (teal board in a grey frame, ~0.8 x 0.6 m).
// Replaced by the real model when it is ready.
function makeStandInShield(scene) {
  const g = new THREE.Group(), m = (c, r, mt = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.56, 0.04), m(0x2f8f92, 0.6)); g.add(board);
  const frame = m(0x9aa3a6, 0.4, 0.5);
  for (const y of [-0.3, 0.3]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.86, 10), frame); b.rotation.z = Math.PI / 2; b.position.set(0, y, 0); g.add(b); }
  for (const x of [-0.41, 0.41]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.7, 10), frame); b.position.set(x, -0.04, 0); g.add(b); }
  g.visible = false; scene.add(g);
  return g;
}

function shieldPhysics(P, fragments, dir) {
  const items = fragments.map((f, i) => {
    const o = f.object; o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? new THREE.Vector3(1, 0, 0) : size.y >= size.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const half = Math.max(size.x, size.y, size.z) * 0.38, r = THREE.MathUtils.clamp(Math.min(...[size.x, size.y, size.z].sort((a, b) => b - a).slice(0, 2)) * 0.32, 0.05, 0.14);
    const a = c.clone().addScaledVector(axis, -half), b = c.clone().addScaledVector(axis, half);
    const side = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar((i % 2 ? 1 : -1) * (0.6 + 0.3 * i / 4));
    const vel = dir.clone().multiplyScalar(1.6).add(side).add(new THREE.Vector3(0, 1.4 + (i % 3) * 0.4, 0));
    const q0 = f.worldQuaternion.clone(), s0 = f.worldScale.x;
    const off = c.clone().sub(f.worldPosition).applyQuaternion(q0.clone().invert()).divideScalar(s0); // the centre in the fragment's frame
    return { o, id: P.addPiece(a, b, r, vel, q0), off, s0, st: [] };
  });
  const tmp = new THREE.Vector3();
  return {
    update() { for (const it of items) { const st = P.read(it.id, it.st); if (!st) continue; it.o.quaternion.copy(st[0].quat); it.o.position.copy(st[0].pos).sub(tmp.copy(it.off).multiplyScalar(it.s0).applyQuaternion(st[0].quat)); } },
    dispose() { for (const it of items) P.remove(it.id); },
  };
}

export class ZombieView extends ClipBody {
  static physics = null; // shared physics backend (custom / Rapier); null = death clips only
  static fx = null;      // blood effects
  static scene = null;   // severed pieces live in the scene, independent of the (pooled) views
  static pieces = [];
  static shieldAsset = null; // { gltf, damageTextures }: the guard's bed-panel shield (loaded once, shared by every guard)
  static brokenShields = []; // shields in pieces: their controllers run the 5 s lifetime and the fade, then free themselves
  static ladyKipUp = true; // (the lady's kip-up experiment: off = her old get-up from her back)
  static planted = [];
  static propSrc = {}; // (main.js: the drip stand, the wheelchair, the surgeon's cap and mask)
  // (2026-10-18, the user: "what i really like is also testing the light on the zombies eyes"): two tiny glints at the eyes,
  // a dim ember in the dark, bright where light falls on the face (render/lightkit.js lightAt: the fittings' pools, a shot's
  // flash, Yola's torch). col: their colour; base: in the dark; gain: how much light lifts them; at: eye height / depth /
  // spread as fractions of the head bone's length, per zombie type (tuned by eye)
  static eyeCfg = { on: false, col: 0xffd890, base: 0.25, gain: 0.85, size: 0.075, light: null };
  static EYE_AT = { 0: [0.75, 0.58, 0.1], 1: [0.75, 0.58, 0.1], 2: [0.02, 0.55, 0.12], 3: [0.66, 0.55, 0.15], 4: [0.75, 0.58, 0.1] }; // (fitted on each face in the lab, 2026-10-18: nurse, patient, the lady, the guard; the runner is the nurse) // (main.js: the drip stand, the wheelchair, the surgeon's cap and mask)
  static props = []; // (the demo's bed)
  static looseMeshes = new Map(); // (core/loose.js id -> its drip stand / wheelchair on screen)
  static clubGrip = new THREE.Vector3(0, 0.075, 0); // (his palm, in his RightHand bone's frame, m: where his fist closes round the torn wrist)
  static clubRoll = 0; // (rad about clubAxis: which way the torn elbow can fold as he swings)
  static clubAxis = new THREE.Vector3(0, 0, 1); // (in his RightHand bone's frame: the club's direction out of the fist, across it: he holds the arm by its own hand, the shoulder end out) // the guards' shields stuck in the floor for good, and the arms torn off on them ({ shield, arm }): they stay until the level resets
  constructor(scene, gltf, height, speeds, opts = {}) {
    const model = skClone(gltf.scene);
    // (PERF_AUDIT.md 3) SkeletonUtils gives every body part its own Skeleton over the same bones: 12 parts on screen meant the
    // same 68 bone matrices computed and uploaded 12 times a frame. The parts share bones, inverses and bind matrix: one Skeleton.
    { let sk0 = null; model.traverse((o) => { if (!o.isSkinnedMesh) return; if (!sk0) { sk0 = o.skeleton; return; } const b = o.skeleton.bones; if (b.length === sk0.bones.length && b.every((x, i) => x === sk0.bones[i])) o.skeleton = sk0; }); }
    const mats = [];
    model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); } });
    // clips are processed once per zombie type and shared by every view (mixers can share clips;
    // cloning them per spawn copied megabytes of keyframes and stalled frames)
    let clips = SHARED_CLIPS.get(gltf);
    if (!clips) {
      const rest = hipsRest(gltf.scene);
      clips = gltf.animations.map((c) => stripRoot(c.clone(), rest));
      // (2026-10-18 fix: the nurse's and patient's scratch file names its one clip 'Animation', so the scratch was never found
      // and the close-in attack played the Mixamo lunge instead; it is the scratch)
      if (!clips.some((c) => c.name === 'scratch')) { const a = clips.find((c) => c.name === 'Animation'); if (a) a.name = 'scratch'; }
      // the runner's rake on the run (core/zombies.js dash): the scratch's upper body over its running legs
      { const s = clips.find((c) => c.name === 'ual_Zombie_Scratch'); if (s) clips.push(subClip(s, (b) => !LOWER.test(b), 'scratch_upper')); }
      for (const c of clips) if (['walk', 'idle', 'crawl', 'sprint', 'shield_idle'].includes(c.name) || /_Loop$/.test(c.name)) loopClip(c);
      { const b = clips.find((c) => c.name === POUNCE.clip); if (b) { const p = b.clone(); p.name = 'pounce'; clips.push(p); } } // (attack clips are played by the attack's name)
      { const s = clips.find((c) => c.name === SLAM.clip); if (s) { const p = s.clone(), i = clips.findIndex((c) => c.name === 'slam'); p.name = 'slam'; if (i >= 0) clips[i] = p; else clips.push(p); } } // (the leap-slam plays as 'slam')
      if (SLAM.lift !== 1) for (const c of clips) if (c.name === 'slam') for (const t of c.tracks) if (/Hips\.position$/.test(t.name)) { const v = t.values, y0 = v[1]; for (let i = 1; i < v.length; i += 3) v[i] = y0 + (v[i] - y0) * SLAM.lift; }
      // the guard holds his shield up: walk and idle on the legs only, the shield hold on the upper body
      if (opts.shield && clips.some((c) => c.name === 'shield_idle')) {
        const by = Object.fromEntries(clips.map((c) => [c.name, c]));
        const lower = (n) => { const c = subClip(by[n], (b) => LOWER.test(b), n); clips[clips.indexOf(by[n])] = c; };
        lower('walk'); lower('idle');
        clips.push(subClip(by.shield_idle, (b) => !LOWER.test(b), 'shield_upper'));
      }
      { const s = clips.find((c) => c.name === 'ual1_Sitting_Idle_Loop'); if (s) clips.push(subClip(s, (b) => LOWER.test(b), 'sit_lower')); } // (the wheelchair: seated legs under any upper body)
      SHARED_CLIPS.set(gltf, clips);
    }
    ZombieView.scene = scene;
    super(scene, model, height, clips);
    this.mats = mats;
    // (PERF_AUDIT.md 4) zombies off screen are not drawn: ClipBody turns frustum culling off (a skinned part's own bounds
    // are its rest pose), so every part gets one generous sphere round the whole body instead (centre at half height,
    // radius 1.25 x height: any pose, a pounce, a body on the floor), in that part's own space
    { this.outer.updateMatrixWorld(true); const C = new THREE.Vector3(0, height * 0.5, 0), ws = new THREE.Vector3();
      model.traverse((o) => { if (!o.isSkinnedMesh) return; o.getWorldScale(ws); const k = Math.max(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z)) || 1;
        o.boundingSphere = new THREE.Sphere(o.worldToLocal(C.clone()), (height * 1.25) / k); o.frustumCulled = true; }); }
    this.nativeWalk = (speeds?.speed || 0.17) * height;
    for (const n of ['walk', 'idle']) { this.act(n).play(); this.act(n).setEffectiveWeight(0); }
    for (const n of [...ONE_SHOTS, 'pounce', ...Object.values(HIT_CLIPS).flat(), ...EXTRA_ONCE]) {
      const a = this.act(n); if (!a) continue;
      a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true;
    }
    this.gaitSet = null; this.gw = {}; this.gPhase = 0;
    this.react = new Spring2(70, 9);
    this.oneShot = null; this.lastSeq = 0; this.lastState = ''; this.id = -1;
    this.height = height;
    // modular pieces (empty for the older single-mesh zombies)
    this.modules = {}; this.gore = {};
    const pieces = {};
    model.traverse((o) => {
      for (const [k, re] of Object.entries(MODULE_NAMES)) if (re.test(o.name)) this.modules[k] = o;
      const m = GORE_NAME.exec(o.name);
      if (m) (this.gore[m[1]] ||= {})[m[2].toLowerCase()] = o;
      if (/^GORE_Burst_/.test(o.name)) o.visible = false; // (a street zombie's torso cuts: capped for its burst only, tools/anim/cut_zombie.py)
      const p = MOD_PIECE.exec(o.name); if (p) (pieces[p[1]] ||= []).push(o);
    });
    // a part in several pieces goes into one group where they hang (a skinned piece draws the same under any parent)
    for (const [k, list] of Object.entries(pieces)) {
      if (list.length === 1) { this.modules[k] = list[0]; continue; }
      const g = new THREE.Group(); g.name = 'Mod_' + k; list[0].parent.add(g); for (const o of list) g.add(o); this.modules[k] = g;
    }
    this.modular = Object.keys(this.modules).length === 5;
    this.severed = new Set(); this.rag = null; this.bleed = {};
    this.hasCrawl = !!this.act('crawl');
    if (this.hasCrawl) { this.act('crawl').play(); this.act('crawl').setEffectiveWeight(0); }
    this.sprintNative = (opts.sprint || 4.3) * (height / 1.74); // m/s the sprint clip's feet travel at full rate
    this.girth = opts.girth || 1; // the ragdoll's body width against the slim standard zombie
    for (const n of ['sprint', 'shield_upper']) if (this.act(n)) { this.act(n).play(); this.act(n).setEffectiveWeight(0); }
    if (opts.shield) this.wantShield = true; // (the real shield is made per life in bind: a broken one is never reused)
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
    // (no end bone, as on a store skeleton without HeadTop_End: 0.2 m along the bone at 1.7 m)
    const b = this.bones[toB] ? this.bones[toB].getWorldPosition(new THREE.Vector3())
      : a.clone().add(new THREE.Vector3(0, 0.2 * (this.height / 1.7), 0).applyQuaternion(this.bones[fromB].getWorldQuaternion(_bq)));
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
  // the head burst apart (Chapter 2's pistol finisher, core/player.js startExecution headBurst): no head flies, it is gone
  // in a spray of blood, flesh, bone and brain along the shot; the neck's stump (its wound cap) left
  burstHead(z) {
    this.severed.add('Head'); this.container.updateMatrixWorld(true);
    const h = this.bones.Head.getWorldPosition(new THREE.Vector3()), fx = ZombieView.fx, dx = z.hitDirX || 0, dz = z.hitDirZ || 0, r = () => (Math.random() - 0.5) * 0.7;
    if (this.modules.Head) this.modules.Head.visible = false; else (this.collapsed ||= []).push(this.bones.Head);
    if (this.gore.Head?.stump) this.gore.Head.stump.visible = true;
    if (fx) {
      fx.bloodHit('shotgun', h.x, h.y, h.z, dx, dz, 2.4); // (the mist of it)
      for (let i = 0; i < 3; i++) fx.bloodSpray(h.x, h.y, h.z, dx * 0.9 + r(), 0.5 + 0.35 * i, dz * 0.9 + r(), 30, 4.4);
      fx.burst(h.x, h.y, h.z, 28, 0x5e0b0b, 4.8, 1.6, 0.9, dx * 0.8, dz * 0.8); // (flesh)
      fx.burst(h.x, h.y, h.z, 12, 0xe6dccb, 4.2, 1.4, 0.8, dx, dz); // (skull)
      fx.burst(h.x, h.y, h.z, 10, 0xc98a8a, 3.6, 1.2, 0.8, dx, dz); // (brain)
      fx.bloodPool(h.x + dx * 0.9, h.z + dz * 0.9, 1.3);
    }
    this.bleed.Head = 3;
  }
  // a cut on a zombie without a cut model (the guard's arms at the shoulder, his head; bakeChunks): the piece baked from
  // its own vertices and thrown, the limb's bone collapsed into its joint from now on (it vanishes), blood at the stump
  cutByWeights(part, z) {
    const R = CUT_ROOTS[part]; if (!R || !this.bones[R[0]]) return;
    this.container.updateMatrixWorld(true);
    const a = this.bones[R[0]].getWorldPosition(new THREE.Vector3()), b = (this.bones[R[1]] || this.bones[R[0]]).getWorldPosition(new THREE.Vector3());
    if (b.distanceTo(a) < 0.02) b.y += 0.15;
    const big = z.kind === 'guard' && z.hitStyle === 'tear' && part.startsWith('Forearm'); // (his finisher: "I want to see that arm go off like crazy")
    const bd = new THREE.Vector3(z.hitDirX, 0, z.hitDirZ);
    this.throwChunks({ [part]: { a, b, r: R[2], bone: R[0] } }, { [R[0]]: part }, z, isMelee(z.hitKind) ? 4.5 : 3.0, big ? () => bd.clone().multiplyScalar(7.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 3, 3.2 + Math.random() * 1.5, (Math.random() - 0.5) * 3)) : null);
    if (big && ZombieView.fx) { const fx = ZombieView.fx, sh = this.bones[CUT_STUMP[part]]?.getWorldPosition(new THREE.Vector3()) || a; for (let i = 0; i < 4; i++) fx.bloodSpray(sh.x, sh.y, sh.z, bd.x * 0.6 + (Math.random() - 0.5) * 0.6, 0.9, bd.z * 0.6 + (Math.random() - 0.5) * 0.6, 26, 4.2); fx.bloodPool(sh.x + bd.x * 1.2, sh.z + bd.z * 1.2, 1.4); }
    (this.collapsed ||= []).push(this.bones[R[0]]);
    const s = this.bones[CUT_STUMP[part]]?.getWorldPosition(new THREE.Vector3()) || a, fx = ZombieView.fx, dir = new THREE.Vector3(z.hitDirX, 0, z.hitDirZ);
    if (fx) { fx.bloodSpray(s.x, s.y, s.z, dir.x * 0.8, 0.5, dir.z * 0.8, part === 'Head' ? 34 : 26, 3.4); fx.bloodPool(s.x + dir.x * 0.4, s.z + dir.z * 0.4, part === 'Head' ? 1.1 : 0.9); }
    (this.stumpOf ||= {})[part] = CUT_STUMP[part]; this.bleed[part] = big ? 6 : 3;
  }
  // the guard's shield after his slam (FINISHERS_PLAN.md 3): wrenched back out of the floor (his finisher missed), or taken
  // in his other hand after the first finisher took his arm (guardSwap)
  guardShield(z) {
    if (z.planted?.magnet && this.shieldC && !this.plantedP) { // (the MRI magnet tore it off his arm: core/rooms.js) it flies to the scanner and sticks
      this.plantShield(z); const P = this.plantedP, o = P.shield.object3D, q = z.planted;
      o.position.set(q.x, 1.45, q.z); o.rotation.set(0, q.yaw + Math.PI, 0); o.updateMatrixWorld(true); // (over the bore, clear of the bed)
      P.grip = P.shield.grips.center.getWorldPosition(new THREE.Vector3()); P.gripR = P.grip.clone();
      ZombieView.fx?.burst(q.x, 1.15, q.z, 14, 0xe9e1cf, 2.4, 0.6, 0.45);
      return;
    }
    if (z.state !== 'pickup' || !this.plantedP) return;
    if (z.wrenching) { if (z.t >= z.stateDur * 0.45) this.retakeShield(); } // (wrenched free: back in the hand that held it)
    else if (z.mirrored && !this.mirG) this.guardSwap(z); // (core/zombies.js PICKUP: his other hand has it)
  }
  retakeShield() {
    const P = this.plantedP; if (!P) return;
    const i = ZombieView.planted.indexOf(P); if (i >= 0) ZombieView.planted.splice(i, 1);
    this.shieldC = P.shield; this.shieldFit = false; this.plantedP = null;
    this.container.updateMatrixWorld(true); this.fitShield(); // (back in his hand, from the pose he grabs it in)
    if (ZombieView.fx) { const g = P.grip; ZombieView.fx.burst(g.x, 0.1, g.z, 16, 0x8a8172, 2.2, 0.8, 0.6); ZombieView.fx.smoke?.(g.x, g.z, 4, 0.4, 0.4, 2.0, 1.0); }
  }
  // his other hand takes the shield: the guard is mirrored from now on (outer.scale.x -1) and his data-left arm (the one his
  // clips hold the shield with) becomes the intact one: the cut arm's collapse moves to his data-right arm, which the
  // mirror shows on the side the real cut was. His clips then hold, walk and slam left-handed in the mirror: right-handed.
  guardSwap(z) {
    const B = this.bones; if (!B.LeftArm || !B.RightArm) return;
    this.collapsed = (this.collapsed || []).filter((b) => b !== B.LeftArm); B.LeftArm.scale.set(1, 1, 1); this.collapsed.push(B.RightArm);
    this.severed.delete('Forearm_L'); this.severed.add('Forearm_R');
    if (this.stumpOf?.Forearm_L) { this.stumpOf.Forearm_R = 'RightShoulder'; delete this.stumpOf.Forearm_L; if (this.bleed.Forearm_L) { this.bleed.Forearm_R = this.bleed.Forearm_L; delete this.bleed.Forearm_L; } }
    this.mixer.update(0); this.retakeShield(); // (fitted unmirrored, then the whole of him and his shield mirror together)
    this.mirG = true; this.outer.scale.x = -Math.abs(this.outer.scale.x); this.container.rotation.y = -z.yaw; this.outer.updateMatrixWorld(true);
  }
  // bake and throw chunks: C = { chunk: { a, b (its two ends, world), r (radius at 1.7 m) } }, roots = { bone: chunk }
  throwChunks(C, roots, z, speed, extra = null) {
    const P = ZombieView.physics, frames = {};
    for (const [k, e] of Object.entries(C)) {
      const q0 = frameQuat(e.b.clone().sub(e.a), new THREE.Vector3(1, 0, 0).applyQuaternion(this.bones[e.bone].getWorldQuaternion(_bq)), new THREE.Quaternion());
      frames[k] = { c: e.a.clone().add(e.b).multiplyScalar(0.5), q0, qi: q0.clone().invert() };
    }
    const baked = bakeChunks(this.model, roots, frames), dir = new THREE.Vector3(z.hitDirX, 0, z.hitDirZ);
    for (const [k, obj] of Object.entries(baked)) {
      const F = frames[k], e = C[k]; obj.position.copy(F.c); obj.quaternion.copy(F.q0); ZombieView.scene.add(obj);
      const vel = (extra ? extra(k, F.c) : dir.clone().multiplyScalar(speed)).add(new THREE.Vector3(z.vx * 0.5, 2.2 + Math.random() * 1.2, z.vz * 0.5));
      const r = e.r * (this.height / 1.7);
      const piece = { obj, t: 0, id: P && P.ready ? P.addPiece(e.a, e.b, r, vel, F.q0) : 0, P: P && P.ready ? P : null, vel, r, states: [] };
      ZombieView.pieces.push(piece);
      if (ZombieView.pieces.length > MAX_PIECES) ZombieView.dropPiece(ZombieView.pieces[0]);
    }
  }
  // the lady pops (core/sim.js ladyBurst): her body in chunks thrown out from her belly (and along her momentum), a big
  // spray of blood and a pool; she is gone
  burstLady(z, e) {
    this.container.updateMatrixWorld(true);
    const C = {}, roots = {}, wp = (n) => this.bones[n]?.getWorldPosition(new THREE.Vector3());
    for (const [k, [r0, r1, rad]] of Object.entries(BURST_CHUNKS)) { const a = wp(r0); if (!a) continue; const b = wp(r1) || a.clone().add(new THREE.Vector3(0, 0.1, 0)); C[k] = { a, b, r: rad, bone: r0 }; roots[r0] = k; }
    const mid = wp('Spine1') || wp('Hips'), mv = new THREE.Vector3(e.vx || 0, 0, e.vz || 0).multiplyScalar(0.6);
    this.throwChunks(C, roots, z, 0, (k, c) => c.clone().sub(mid).setY(0).normalize().multiplyScalar(3 + Math.random() * 2.5).add(mv));
    const fx = ZombieView.fx;
    if (fx) {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; fx.bloodSpray(mid.x, mid.y, mid.z, Math.cos(a), 0.6, Math.sin(a), 22, 4.2); }
      fx.burst(mid.x, mid.y, mid.z, 26, 0x5a1414, 4.5, 1.2, 0.7); fx.bloodPool(mid.x, mid.z, 1.8);
    }
    this.outer.visible = false; this.blob.visible = false; this.popped = true;
  }
  bleeding(dt) {
    const fx = ZombieView.fx; if (!fx) return;
    for (const part in this.bleed) {
      if ((this.bleed[part] -= dt) <= 0) { delete this.bleed[part]; continue; }
      if (Math.random() < dt * 18) {
        const s = this.bones[this.stumpOf?.[part] || STUMP_BONE[part]].getWorldPosition(_bv);
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
  static clearPieces() {
    for (const pc of [...ZombieView.pieces]) ZombieView.dropPiece(pc);
    for (const P of ZombieView.planted) { P.shield?.dispose?.(); P.arm?.parent?.remove(P.arm); }
    for (const o of ZombieView.props) o.parent?.remove(o); ZombieView.props = [];
    for (const o of ZombieView.looseMeshes.values()) o.parent?.remove(o); ZombieView.looseMeshes.clear();
    ZombieView.planted = [];
  }

  bind(z) {
    this.id = z.id; this.lastSeq = z.hitSeq; this.lastState = ''; this.outer.visible = this.blob.visible = true; this.spawnPlayed = false;
    if (this.mirG) { this.mirG = false; this.outer.scale.x = Math.abs(this.outer.scale.x); }
    this.outer.position.y = 0; this.oneShot = null; this.deathYaw = null;
    this.endRagdoll();
    this.severed.clear();
    for (const b of this.collapsed || []) b.scale.set(1, 1, 1); this.collapsed = []; this.stumpOf = {}; this.popped = false; this.kindOf = z.kind; // (a pooled view: whole again)
    if (this.clubArm) { this.clubArm.parent?.remove(this.clubArm); this.clubArm = null; } this.plantedP = null; this.heaveN = -1;
    for (const m of Object.values(this.modules)) m.visible = true;
    for (const g of Object.values(this.gore)) { if (g.stump) g.stump.visible = false; if (g.detached) g.detached.visible = false; }
    for (const a of Object.values(this.actions)) { a.stop(); a.setEffectiveWeight(0); }
    for (const n of ['walk', 'idle']) { this.act(n).play(); this.act(n).time = Math.random() * this.act(n).getClip().duration; }
    if (this.hasCrawl) this.act('crawl').play();
    for (const n of ['sprint', 'shield_upper']) if (this.act(n)) this.act(n).play();
    // its walk (core/zombies.js gait): the Quaternius sets play from one phase, driven here (timeScale 0)
    const G = GAIT_SETS[z.gait];
    this.gaitSet = G && this.act(G.idle) && G.dirs.every((d) => this.act(d.n)) ? G : null; this.gw = {}; this.gPhase = Math.random();
    if (this.gaitSet) for (const n of [G.idle, ...G.dirs.map((d) => d.n)]) { const a = this.act(n); a.play(); a.setEffectiveWeight(0); a.timeScale = n === G.idle ? 1 : 0; }
    if (this.wantShield) this.freshShield();
    this.react.x = this.react.z = this.react.vx = this.react.vz = 0;
    this.bleed = {};
    this.bindProp(z);
  }
  // ---- the hospital's own zombies (IV, CHAIR, BED; core/zombies.js prop) ----
  bindProp(z) {
    this.iv = z.prop === 'iv'; this.chairO = z.prop === 'chair'; this.lying = null; this.ivW = 0;
    if (this.cap) this.cap.visible = z.prop === 'surgeon';
    if (this.chairO) {
      this.wheel = 0;
      for (const k of ['LowerLeg_L', 'LowerLeg_R']) { this.severed.add(k); if (this.modules[k]) this.modules[k].visible = false; if (this.gore[k]?.stump) this.gore[k].stump.visible = true; } // (no legs below the knee: its stumps)
      if (this.act('sit_lower')) { const a = this.act('sit_lower'); a.reset(); a.play(); a.setEffectiveWeight(0); }
    }
  }
  // the drip stands and wheelchairs (core/loose.js), drawn where the sim has them: the stand tips against its acceleration,
  // a tipped chair lies on its side
  static syncLoose(list, alpha, dt) {
    const S = ZombieView.propSrc, M = ZombieView.looseMeshes, seen = new Set();
    for (const L of list) {
      seen.add(L.id);
      let o = M.get(L.id);
      if (!o) {
        const src = L.kind === 'o2tank' ? o2Cylinder() : L.kind === 'iv' ? (L.o2 ? o2Trolley() : S.iv) : S.chair; if (!src) continue;
        o = src === S.iv || src === S.chair ? src.clone() : src; o.userData.l = { vx: 0, vz: 0, rx: 0, rz: 0 }; ZombieView.scene.add(o); M.set(L.id, o);
        if (L.o2 && L.kind === 'chair') { o.userData.tank = o2Cylinder(); ZombieView.scene.add(o.userData.tank); } // (its cylinder behind the backrest: placed below, in the world)
      }
      const x = L.px + (L.x - L.px) * alpha, z = L.pz + (L.z - L.pz) * alpha, u = o.userData.l;
      if (L.kind === 'o2tank') { o.position.set(x, 0, z); o.rotation.set(0, L.yaw, 0); }
      else if (L.kind === 'iv') {
        const ax = dt > 0 ? (L.vx - u.vx) / dt : 0, az = dt > 0 ? (L.vz - u.vz) / dt : 0; u.vx = L.vx; u.vz = L.vz;
        const tx = clamp(az * IV.tilt * 0.1, -IV.maxTilt, IV.maxTilt), tz = clamp(-ax * IV.tilt * 0.1, -IV.maxTilt, IV.maxTilt);
        u.rx += (-tx - u.rx) * Math.min(1, dt * 6); u.rz += (-tz - u.rz) * Math.min(1, dt * 6);
        o.position.set(x, 0, z); o.rotation.set(u.rx, 0, u.rz);
      } else if (L.tipped) { o.position.set(x, 0.3, z); o.rotation.set(0, L.yaw + CHAIR.yaw, L.tipSide * 1.45); }
      else { o.position.set(x, 0, z); o.rotation.set(0, L.yaw + CHAIR.yaw, 0); }
      // an oxygen cylinder (core/loose.js O2): a chair's rides behind its backrest; punctured, it shudders and screams out a jet of
      // gas until it bursts
      const tk = o.userData.tank || (L.o2 ? o : null);
      if (o.userData.tank) { const tp = tankPos(L, _tp); tk.position.set(tp.x - (L.x - x), L.tipped ? 0.2 : 0.18, tp.z - (L.z - z)); tk.rotation.set(L.tipped ? 1.4 : 0, L.yaw, 0); }
      if (tk && L.fuse != null && dt > 0) {
        tk.position.x += (Math.random() - 0.5) * 0.035; tk.position.z += (Math.random() - 0.5) * 0.035;
        if (ZombieView.fx && Math.random() < dt * 40) { const a = Math.random() * Math.PI * 2, top = L.kind === 'iv' ? 1.05 : tk.position.y + 0.95; ZombieView.fx.burst(tk.position.x, top, tk.position.z, 2, 0xf4f8ff, 2.4, 0.6, 0.25, Math.cos(a), Math.sin(a)); }
      }
    }
    for (const [id, o] of M) if (!seen.has(id)) { o.parent?.remove(o); o.userData.tank?.parent?.remove(o.userData.tank); M.delete(id); } // (a new level, or a cylinder that burst: gone)
  }
  // the eyes' glints (eyeCfg): two additive dots on the Head bone, placed from the head's rest pose (up the bone, out along the
  // face, either side), shown while it stands alive and lit by lightAt where its face is
  addEyes() {
    const hb = this.bones.Head, ht = this.bones.HeadTop_End; let sk = null; this.model.traverse((o) => { if (!sk && o.isSkinnedMesh) sk = o; });
    if (!hb || !ht || !sk) return;
    const rest = (b) => { const i = sk.skeleton.bones.indexOf(b); return i < 0 ? null : new THREE.Matrix4().multiplyMatrices(sk.matrixWorld, sk.bindMatrix).multiply(sk.skeleton.boneInverses[i].clone().invert()); };
    this.model.updateMatrixWorld(true);
    const RH = rest(hb), RT = rest(ht); if (!RH || !RT) return;
    const H = new THREE.Vector3().setFromMatrixPosition(RH), T = new THREE.Vector3().setFromMatrixPosition(RT), U = T.clone().sub(H), L = U.length(); U.normalize();
    const F = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion())); F.addScaledVector(U, -F.dot(U)).normalize();
    const R = new THREE.Vector3().crossVectors(U, F), [up, fw, sp] = ZombieView.EYE_AT[this.type] || ZombieView.EYE_AT[0], inv = RH.clone().invert();
    const ws = hb.getWorldScale(new THREE.Vector3()).x || 1;
    if (!ZombieView.eyeTex) { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); ZombieView.eyeTex = new THREE.CanvasTexture(c); }
    const mat = new THREE.SpriteMaterial({ map: ZombieView.eyeTex, color: ZombieView.eyeCfg.col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.eyes = [-1, 1].map((s) => {
      const E0 = H.clone().addScaledVector(U, up * L).addScaledVector(R, s * sp * L), f = onFace(E0);
      const e = new THREE.Sprite(mat); e.position.copy(E0.addScaledVector(F, f != null ? f + 0.004 : fw * L).applyMatrix4(inv));
      e.scale.setScalar(ZombieView.eyeCfg.size / ws); e.visible = false; e.renderOrder = 4; hb.add(e); return e;
    });
    this.eyeMat = mat; this.eyeWs = ws;
  }
  updateEyes(z, x, zz) {
    const C = ZombieView.eyeCfg;
    if (!C.on || !this.outer.visible) { if (this.eyes) for (const e of this.eyes) e.visible = false; return; }
    if (!this.eyes) this.addEyes(); if (!this.eyes) return;
    const on = z.alive && !this.severed.has('Head') && z.state !== 'emerge';
    for (const e of this.eyes) e.visible = on; if (!on) return;
    const L = C.light ? C.light(x, zz) : 0, k = Math.min(1, C.base + L * C.gain);
    this.eyeMat.opacity = k; this.eyeMat.color.setHex(C.col);
    const s = (C.size * (0.75 + 0.6 * k)) / this.eyeWs; for (const e of this.eyes) e.scale.setScalar(s);
  }
  // the surgeon's cap and mask (blender/make_surgeon_cap.py, built in the nurse's own model space): on her Head bone as it
  // sits at rest (from the skin's bind matrices: the pose on screen does not matter)
  wearSurgeonKit(src) {
    const hb = this.bones.Head; let sk = null; this.model.traverse((o) => { if (!sk && o.isSkinnedMesh) sk = o; });
    if (!hb || !sk || !src) return;
    const i = sk.skeleton.bones.indexOf(hb); if (i < 0) return;
    this.model.updateMatrixWorld(true);
    const rest = new THREE.Matrix4().multiplyMatrices(sk.matrixWorld, sk.bindMatrix).multiply(sk.skeleton.boneInverses[i].clone().invert()); // (the Head bone at rest, world)
    const cap = src.clone(); cap.matrixAutoUpdate = true;
    const capW = this.model.matrixWorld.clone(); // (the kit is in the model's own space)
    new THREE.Matrix4().copy(rest).invert().multiply(capW).decompose(cap.position, cap.quaternion, cap.scale);
    hb.add(cap); cap.visible = false; // (no shadow: the shadow map is drawn once, for the still scenery: main.js)
    this.cap = cap;
  }
  // before the mixer: the seated legs under the wheelchair, the lying pose in a bed
  propPose(z, dt) {
    if (this.chairO) this.act('sit_lower')?.setEffectiveWeight(z.chair && !z.crawling ? 8 : 0);
    // the bed patient: the hub's patient_bed_rise held on its first frame while it lies there, then played through its rise
    // in step with the sim (z.t); its own action (never the one-shot the state changes fade), the walk off under it
    const bedA = this.act('patient_bed_rise');
    if (z.bed && bedA) {
      if (!this.lying) { this.lying = bedA; bedA.reset(); bedA.setLoop(THREE.LoopOnce); bedA.clampWhenFinished = true; bedA.play(); }
      bedA.timeScale = 0; bedA.time = z.bedRise && z.state === 'emerge' ? Math.min(z.t, bedA.getClip().duration - 0.01) : 0; bedA.setEffectiveWeight(1);
      for (const n of ['walk', 'idle', 'attack', 'scratch']) this.act(n)?.setEffectiveWeight(0);
      if (this.gaitSet) for (const n of [this.gaitSet.idle, ...this.gaitSet.dirs.map((d) => d.n)]) this.act(n).setEffectiveWeight(0);
      if (this.oneShot) { this.oneShot.stop(); this.oneShot.setEffectiveWeight(0); this.oneShot = null; }
    } else if (this.lying) { this.lying.fadeOut(0.35); this.lying = null; }
  }
  // after the mixer: where the stand / the chair are, the hands on them, the body's height
  propPlace(z, dt) {
    const B = this.bones, y = z.yaw, f = _v5.set(Math.sin(y), 0, Math.cos(y)), l = _v6.set(Math.cos(y), 0, -Math.sin(y));
    const busy = z.state === 'windup' || z.state === 'strike' || z.state === 'recover' || z.state === 'stagger' || z.state === 'knockdown' || z.state === 'getup' || z.state === 'dying' || z.state === 'dead' || z.crawling;
    { const m = z.bed && (z.bed.side || 1) < 0 ? -1 : 1; // (the clip lifts it onto the mattress itself)
    // (2026-10-19, the user: the eyes "missed the actual eyes ... floating in front"): each glint sits ON the face, on the mesh
    // itself: of the skin's rest-pose vertices within a small disc round the table's eye spot (across the face), the frontmost
    // few give the surface there; the glint goes a few millimetres out from it. The table's own depth is the fallback.
    const verts = [], M = new THREE.Matrix4(), w = new THREE.Vector3();
    this.model.traverse((o) => { if (!o.isSkinnedMesh) return; M.multiplyMatrices(o.matrixWorld, o.bindMatrix); const pa = o.geometry.attributes.position; for (let i = 0; i < pa.count; i++) verts.push(w.fromBufferAttribute(pa, i).applyMatrix4(M).clone()); });
    const onFace = (E0) => {
      const r = 0.12 * L, near = [];
      for (const v of verts) { const d = v.clone().sub(E0), f = d.dot(F); d.addScaledVector(F, -f); if (d.length() < r && f > -0.5 * L) near.push(f); }
      if (near.length < 3) return null; near.sort((a, b) => b - a);
      const top = near.slice(0, Math.max(3, Math.ceil(near.length * 0.25))); return top.reduce((a, b) => a + b, 0) / top.length; // (the front surface there, not a stray brow vertex)
    };
      if (this.outer.scale.x !== m) this.outer.scale.x = m;
      if (m < 0) this.container.rotation.y = -z.yaw; }
    if (this.chairO) {
      const o = z.loose && ZombieView.looseMeshes.get(z.loose.id);
      if (o && z.chair && !z.crawling) {
        const hips = B.Hips?.getWorldPosition(_v7); if (hips) { this.outer.position.y += CHAIR.seat - hips.y; this.outer.updateMatrixWorld(true); }
        this.wheel += Math.hypot(z.vx, z.vz) * dt / CHAIR.rimR;
        const w = busy ? 0 : 1; this.rimW = (this.rimW ?? w) + (w - (this.rimW ?? w)) * Math.min(1, dt * 8);
        if (this.rimW > 0.01) for (const [s, side] of [[1, 'Left'], [-1, 'Right']]) { // (one push each rimArc of wheel turn: back to front along the rim, then back through the air)
          const ph = (this.wheel / CHAIR.rimArc + (s < 0 ? 0.08 : 0)) % 1, push = ph < 0.62, k = push ? ph / 0.62 : (ph - 0.62) / 0.38;
          const ang = push ? -0.75 + 1.5 * k : 0.75 - 1.5 * k, lift = push ? 0 : Math.sin(k * Math.PI) * 0.07; // (rim angle from the top: - back, + front)
          const R = CHAIR.rimR + (push ? 0 : 0.03), cx = o.position.x + f.x * CHAIR.rim[0] + l.x * s * CHAIR.rim[2], cz = o.position.z + f.z * CHAIR.rim[0] + l.z * s * CHAIR.rim[2];
          _v4.set(cx + f.x * Math.sin(ang) * R + l.x * s * lift * 0.5, CHAIR.rim[1] + Math.cos(ang) * R + lift, cz + f.z * Math.sin(ang) * R + l.z * s * lift * 0.5);
          if (B[side + 'Arm']) solveArm(B[side + 'Arm'], B[side + 'ForeArm'], B[side + 'Hand'], _v4, this.rimW);
        }
      }
    }
    if (this.iv) { // its left hand on the stand's pole while it holds it (the sim moves the stand: core/zombies.js carryLoose)
      const L = z.loose, o = L && ZombieView.looseMeshes.get(L.id), want = !!(o && L.owner === z.id && L.held && !busy) ? 1 : 0;
      this.ivW += (want - this.ivW) * Math.min(1, dt * (want ? 5 : 10));
      if (o && this.ivW > 0.01 && B.LeftArm) { o.updateMatrixWorld(true); _v4.set(0, IV.grip, 0); o.localToWorld(_v4); solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, _v4, this.ivW); }
    }
  }
  hide() { this.outer.visible = false; this.blob.visible = false; this.id = -1; this.mixer.stopAllAction(); this.endRagdoll(); if (this.shieldC && this.shieldC.state !== 'break') this.shieldC.object3D.visible = false; }

  // ---- the guard's shield (render/ShieldController.mjs: the package's controller, unchanged) ----
  // A new intact shield for each life (a damaged one is disposed; a broken one finishes its own fall and fade).
  freshShield() {
    const S = ZombieView.shieldAsset;
    if (this.shieldC && this.shieldC.state !== 'break' && !this.shieldC.disposed) this.shieldC.dispose();
    this.shieldC = null; this.shieldFit = false; this.split = false;
    if (!S) { this.shield ||= makeStandInShield(ZombieView.scene); this.shield.visible = true; return; } // (the asset failed to load: the stand-in)
    const c = new ShieldController({ gltf: S.gltf, scene: ZombieView.scene, damageTextures: S.damageTextures });
    c.object3D.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.shieldC = c;
  }
  get shieldUp() { const c = this.shieldC; return !!(c && !c.disposed && c.state !== 'break') || !!(this.shield && this.shield.visible); }
  // Fit once per life, in the hold pose: the centred rear grip (Grip_Center) in his left palm, the panel upright and
  // square to his facing; from then on the shield rides the hand bone, so the hand never slides on the grip.
  fitShield() {
    const c = this.shieldC, hand = this.bones.LeftHand, mid = this.bones.LeftHandMiddle1 || this.bones.LeftHandIndex1;
    if (!c || !hand) return;
    this.container.updateMatrixWorld(true);
    // the bar sits inside the closed fist: between the knuckle line (index and pinky bases) and the curled middle finger
    const B = this.bones, wp = (n) => B[n]?.getWorldPosition(new THREE.Vector3());
    const I = wp('LeftHandIndex1'), Pk = wp('LeftHandPinky1'), M3 = wp('LeftHandMiddle3');
    const palm = I && Pk && M3 ? I.add(Pk).multiplyScalar(0.25).addScaledVector(M3, 0.5) : hand.getWorldPosition(new THREE.Vector3()).lerp(mid.getWorldPosition(new THREE.Vector3()), 0.55);
    const qh = hand.getWorldQuaternion(new THREE.Quaternion()), qd = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.container.rotation.y);
    const ws = hand.getWorldScale(new THREE.Vector3()).x;
    c.object3D.position.set(0, 0, 0); c.object3D.quaternion.identity(); c.object3D.scale.setScalar(1); c.object3D.updateMatrixWorld(true);
    const grip = c.grips.center.getWorldPosition(new THREE.Vector3()); // the grip in the shield's own (unit) frame
    hand.add(c.object3D);
    c.object3D.scale.setScalar(1 / ws);
    c.object3D.quaternion.copy(qh.clone().invert().multiply(qd));
    c.object3D.position.copy(hand.worldToLocal(palm.clone().sub(grip.applyQuaternion(qd))));
    c.object3D.visible = true; this.shieldFit = true;
  }
  // his first slam (core/zombies.js slamShield): the panel splits along its own break lines but holds together, the
  // user's "large, unmistakable crack": the five pieces (the package's fragments, whose edges are the painted cracks)
  // shift apart a few centimetres in the panel's plane and turn a little, so the seams open dark across the frame and
  // the teal face; the heavy crack map goes on with it
  splitShield() {
    const c = this.shieldC; if (!c || c.state === 'break') return;
    this.split = true;
    c.root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(c.root.matrixWorld).invert();
    const cs = c.fragments.map((f) => new THREE.Box3().setFromObject(f).getCenter(new THREE.Vector3()).applyMatrix4(inv));
    const mid = cs.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / cs.length);
    c.fragments.forEach((f, i) => {
      const d = cs[i].clone().sub(mid); d.z = 0; const l = d.length() || 1;
      f.position.addScaledVector(d, 0.05 / l); f.position.z += i % 2 ? 0.015 : -0.015;
      f.rotateZ(Math.sign(d.x || 1) * Math.sign(d.y || 1) * -0.075); // (the corners droop outward)
    });
  }
  // the panel in pieces: the five fragments become capsules in the game's custom physics (thrown off along the blow),
  // never the baked clip at the same time; the hold stops at once
  breakShield(z) {
    const c = this.shieldC; if (!c || c.state === 'break' || c.disposed) return;
    const P = ZombieView.physics, dir = new THREE.Vector3(z.hitDirX || Math.sin(this.container.rotation.y + Math.PI), 0, z.hitDirZ || Math.cos(this.container.rotation.y + Math.PI));
    const useP = P && P.ready;
    c.object3D.visible = true;
    c.breakApart(useP ? { mode: 'physics', createPhysics: ({ fragments }) => shieldPhysics(P, fragments, dir) } : { mode: 'clip' });
    ZombieView.brokenShields.push(c);
    this.shieldC = null;
  }

  // ---- ragdoll: from the current animated pose, carrying the blow's momentum ----
  startRagdoll(z) {
    const P = ZombieView.physics;
    if (!P || !P.ready) return false;
    this.container.updateMatrixWorld(true);
    const missing = new Set([...this.severed].map((s) => SEVER_PART[s]));
    const desc = describeRagdoll(this.bones, this.height, missing, this.girth);
    const dir = new THREE.Vector3(z.hitDirX, 0, z.hitDirZ);
    // each weapon throws the body its own way:
    //  pistol: a slump along the shot (the head snaps back on a head shot)
    //  shotgun: lifted off the feet and thrown back, harder the closer the blast
    //  axe swing / heavy: thrown sideways along the blade; chop: driven down into a heap
    const kind = z.hitKind, style = z.hitStyle, melee = isMelee(kind), sg = kind === 'shotgun';
    const s = sg ? 1.2 + z.hitStrength * 0.55 : melee ? (style === 'chop' ? 1.4 : style === 'heavy' ? 5.2 : 4.2) : 2.0;
    const lift = sg ? 0.4 + z.hitStrength * 0.22 : melee && style === 'chop' ? -2.6 : 0;
    const heavy = Math.sqrt(z.K?.knock ?? 1); // a heavy body (the big guard) is thrown less far and less high
    const hitPart = !melee && !sg && z.lastHitPart === 'Head' ? 'head' : 'chest';
    const base = new THREE.Vector3(z.kx * 0.35, 0.2, z.kz * 0.35);
    const vels = desc.parts.map((p) => {
      const core = p.name === 'chest' || p.name === 'head';
      const k = p.name === hitPart ? 1 : core ? 0.6 : p.name === 'pelvis' ? (sg ? 0.7 : 0.3) : sg ? 0.45 : 0.25;
      const v = base.clone().addScaledVector(dir, s * k * heavy);
      if (lift > 0) v.y += lift * heavy * (core || p.name === 'pelvis' ? 1 : 0.6);
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

  update(dt, z, x, zz, now = 0) {
    if (this.rag) { if (this.shield) this.shield.visible = false; this.updateRagdoll(z); return; }
    // limbs the simulation took off this step: cut them from the pose that is on screen now
    if (z.severed.size !== this.severed.size) for (const part of z.severed) if (!this.severed.has(part) && !(this.mirG && part === 'Forearm_L')) { if (part === 'Head' && z.headBurst) this.burstHead(z); else if (this.modular) this.sever(part, z); else { this.severed.add(part); this.cutByWeights(part, z); } } // (a head shot apart: burstHead; no cut model: from its skin weights; the mirrored guard's 'Forearm_L' is his other arm now: guardSwap)
    if (z.kind === 'guard') this.guardShield(z);
    // the lady has popped (core/sim.js ladyBurst): her chunks are flying, she is gone
    if (this.popped) { this.outer.visible = this.blob.visible = false; return; }
    if (z.burst) { this.burstLady(z, { vx: z.vx + z.kx, vz: z.vz + z.kz }); return; }
    this.outer.position.x = x; this.outer.position.z = zz;
    // out of the floor (core/zombies.js FLOOR_EMERGE): nothing while the floor rumbles; when it breaks it claws its way out
    // of the breach (Quaternius UAL2 Zombie_Spawn: it starts with its hips 0.45 m under the floor, which hides the rest)
    if (z.floorSpawn && z.state === 'emerge') {
      const F = z.floorSpawn, sp = this.act('ual_Zombie_Spawn');
      if (z.t < F.rumble || !sp) { this.outer.visible = this.blob.visible = false; this.lastState = 'emerge'; return; }
      if (!this.spawnPlayed) {
        this.spawnPlayed = true; this.outer.visible = true; this.blob.visible = false;
        const c = sp.getClip(), t0 = Math.min(...c.tracks.map((q) => q.times[0]));
        this.playOnce('ual_Zombie_Spawn', t0, 0, 0); this.spT0 = t0; this.spLen = c.duration - t0;
      }
      // (2026-10-18) the climb paced by hand: its first 38% (the hands and head bursting up) in the first 15% of the time, so it
      // comes out with the tiles; then the haul out, easing into its stand
      { const u = clamp((z.t - F.rumble) / F.climb, 0, 1), c = u < 0.15 ? (u / 0.15) * 0.38 : 0.38 + 0.62 * (1 - Math.pow(1 - (u - 0.15) / 0.85, 1.6));
        sp.timeScale = 0; sp.time = this.spT0 + this.spLen * Math.min(0.999, c); }
    } else if (this.spawnPlayed && !this.blob.visible && z.state !== 'dead') this.blob.visible = true;
    // a crawler's lunge: the body lurches forward along the floor through the strike and draws back in the recovery
    if (z.crawling && this.hasCrawl && (z.state === 'strike' || z.state === 'recover')) {
      const u = Math.min(1, z.t / Math.max(0.05, z.stateDur)), k = Math.sin((z.state === 'strike' ? u : 1 - u) * Math.PI / 2) * 0.3;
      this.outer.position.x += Math.sin(z.yaw) * k; this.outer.position.z += Math.cos(z.yaw) * k;
    }
    // the pounce's leap: off the floor along an arc (the bite clip itself lunges in place)
    if (z.state !== 'dead' && !z.bed && !(z.chair && !z.crawling)) this.outer.position.y = z.attack === 'pounce' && z.state === 'strike' ? Math.sin(Math.PI * Math.min(1, z.t / Math.max(0.05, z.stateDur))) * 0.22 * (this.height / 1.7) : 0;
    this.blob.position.set(x, 0.012, zz);
    const dying = z.state === 'dying' || z.state === 'dead';
    if (z.state === 'dying' && this.lastState !== 'dying' && z.kind !== 'sprinter' && this.startRagdoll(z)) { this.lastState = 'dying'; this.updateRagdoll(z); return; }
    // state transitions -> clips (attack timed so the swipe lands at the end of the windup)
    if (z.state !== this.lastState) {
      const S = z.state;
      const AC = attackClip(z), scr = AC && this.act(AC.act || z.attack);
      const crawler = z.crawling && this.hasCrawl; // (a legless zombie never plays a standing clip: its attacks and flinches stay in the crawl)
      if (crawler && (S === 'windup' || S === 'strike' || S === 'recover' || S === 'stagger')) { /* the crawl itself coils and lunges (below) */ }
      else if (z.attack === 'dash' && this.act('scratch_upper') && (S === 'windup' || S === 'strike' || S === 'recover')) {
        // the runner's dash rake: the arms only (its legs keep their run, the gait below): up over the wind-up (frames 1-16),
        // the rake through the dash (16-30), down through the skid (30-45)
        const a = this.act('scratch_upper'), t0 = this.scrT0 ??= Math.min(...a.getClip().tracks.map((q) => q.times[0]));
        const [f0, f1] = S === 'windup' ? [1, 16] : S === 'strike' ? [16, 30] : [30, 45];
        if (S === 'windup') { a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.play(); }
        a.time = t0 + (f0 - 1) / 30; a.timeScale = (f1 - f0) / 30 / Math.max(0.05, z.stateDur); a.setEffectiveWeight(S === 'recover' ? 2 : 3);
        if (S === 'recover') a.fadeOut(z.stateDur);
        this.upperShot = a;
      }
      else if (S === 'windup') {
        if (scr) { const t0 = Math.min(...scr.getClip().tracks.map((t) => t.times[0])); this.playOnce(AC.act || z.attack, t0 + (AC.f0 - 1) / 30, (AC.hit - AC.f0) / 30 / Math.max(0.2, z.stateDur)); this.acT0 = t0; }
        else this.playOnce('attack', 8 / 30, (33 - 8) / 30 / Math.max(0.2, z.stateDur));
      } else if ((S === 'strike' || S === 'recover') && scr && this.oneShot === scr) { // the strike at its own pace, then back down
        scr.time = this.acT0 + ((S === 'strike' ? AC.hit : AC.hitEnd) - 1) / 30;
        scr.timeScale = (S === 'strike' ? AC.hitEnd - AC.hit : AC.end - AC.hitEnd) / 30 / Math.max(0.05, z.stateDur);
      } else if (S === 'pickup' && this.act('ual1_PickUp_Table')) { // the guard pulls his torn arm off the shield's grip (UAL1 PickUp_Table)
        const c = this.act('ual1_PickUp_Table').getClip(), t0 = Math.min(...c.tracks.map((q) => q.times[0])); this.playOnce('ual1_PickUp_Table', t0, (c.duration - t0) / Math.max(0.3, z.stateDur), 0.15);
      } else if (S === 'stagger' && (z.hitKind === 'slam' || z.hitKind === 'tear' || z.hitStyle === 'tear') && this.act('hit_stumble')) { // the guard reels back (his arm taken by the finisher)
        const len = this.act('hit_stumble').getClip().duration; this.playOnce('hit_stumble', 0.1, (len - 0.3) / Math.max(0.3, z.stateDur), 0.1);
      } else if (S === 'stagger') {
        if (isMelee(z.hitKind) || z.hitKind === 'shotgun' || z.hitKind === 'bump') {
          const n = this.reactClip(z), len = this.act(n).getClip().duration;
          this.playOnce(n, 2 / 30, (len - 2 / 30) / Math.max(0.3, z.stateDur));
        } else {
          // a bullet or a punch: the short flinch for where it landed (a head shot snaps the head back, an arm shot turns
          // that shoulder), over ~0.45 s; without the clips, the Mixamo flinch
          const P = z.lastHitPart, hc = HIT_CLIPS[P?.startsWith('LowerLeg') ? 'leg' : P] || HIT_CLIPS.torso, n = Array.isArray(hc) ? hc[z.hitSeq & 1] : hc;
          if (this.act(n)) { const c = this.act(n).getClip(), t0 = Math.min(...c.tracks.map((t) => t.times[0])); this.playOnce(n, t0, (c.duration - t0) / 0.45); }
          else this.playOnce('hit_flinch', 0.15, 1.6);
        }
      } else if (S === 'knockdown' && z.fall === 'tumble' && this.act('stumble_fall')) {
        this.deathYaw = null; // the sprinter tripped: staggers back and goes down on her backside
        this.playOnce('stumble_fall', TUMBLE.f0 / 30, (TUMBLE.f1 - TUMBLE.f0) / 30 / z.stateDur, 0.08);
      } else if (S === 'getup' && z.fall === 'tumble' && z.kind === 'sprinter' && this.act('ual_KipUp') && ZombieView.ladyKipUp) {
        // (2026-10-18, the user's experiment: "try that on the large female zombie when she has actually fallen onto her
        // back"): she stays down as long as before (the opening), stirring on her back (standup_back's lying frames 1-20),
        // then kips up (Quaternius UAL2 KipUp, on her own skeleton: assets/zombie_moves/sprinter-b.glb) in its last KIPUP s
        this.playOnce('standup_back', TUMBLE.up0 / 30, 19 / 30 / Math.max(0.2, z.stateDur - KIPUP), 0.15); this.kipAt = z.stateDur - KIPUP;
      } else if (S === 'getup' && z.fall === 'tumble' && this.act('standup_back')) {
        this.playOnce('standup_back', TUMBLE.up0 / 30, (TUMBLE.up1 - TUMBLE.up0) / 30 / z.stateDur, 0.15);
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
      if (this.upperShot && S !== 'windup' && S !== 'strike' && S !== 'recover') { this.upperShot.fadeOut(0.15); this.upperShot = null; }
      this.lastState = S;
    }
    if (this.kipAt != null && (z.state !== 'getup' || z.t >= this.kipAt)) { // the lady's kip-up
      if (z.state === 'getup') { const k = this.act('ual_KipUp'), t0 = Math.min(...k.getClip().tracks.map((q) => q.times[0])); this.playOnce('ual_KipUp', t0, 35 / 30 / KIPUP, 0.14); }
      this.kipAt = null;
    }
    // the guard's shield lodged in the floor (core/zombies.js STUCK): held braced over it (slam frames 79-82), heaving at it
    // every 0.55 s (each heave a pull up and a lean back, in time with the creak: main.js), then the recovery wrenches it out
    // (2026-10-18, the user: "make it seem like he is trying to pull it out of the ground... it stays completely stuck"): the
    // shield leaves his hand for the world the moment it lands (nothing he does moves it), his hands stay locked on its grip
    // (IK after the clip, below) and each heave is bigger than the last: he rises out of the crouch and leans back further
    if (z.state === 'stuck' && !this.plantedP && this.shieldC) this.plantShield(z);
    if (z.state === 'stuck' && this.oneShot && this.oneShot === this.act('slam')) {
      const a = this.oneShot, ph = (z.t + 0.2) / HEAVE, k = ph % 1, grow = Math.min(1, z.t / Math.max(0.5, z.stateDur)), pull = Math.sin(Math.min(1, k / 0.45) * Math.PI);
      a.timeScale = 0; a.time = (this.acT0 || 0) + (78.5 + pull * (3.2 + grow * 5) - 1) / 30;
      if (Math.floor(ph) !== this.heaveN) { this.heaveN = Math.floor(ph); this.react.kick(0, -0.6 - grow * 0.9); }
    }
    // facing (deaths turn quickly to align the fall with the hit)
    const mz = this.mirG ? -1 : 1; // (the mirrored guard: his container turns the other way inside the mirror)
    if (this.deathYaw != null) this.container.rotation.y += angleDiff(this.container.rotation.y, mz * this.deathYaw) * Math.min(1, dt * 14);
    else this.container.rotation.y = mz * z.yaw;

    // locomotion: walk at the rate that matches travel, idle when standing
    const sp = Math.hypot(z.vx, z.vz);
    const move = clamp(sp / 0.25, 0, 1);
    const one = this.oneShot ? this.oneShot.getEffectiveWeight() : 0;
    const crawl = z.crawling && this.hasCrawl ? 1 : 0; // legless: drags itself along
    // the sprinter's charge: the sprint clip takes over from the walk as she speeds up, played at the rate her feet travel
    const sprint = this.act('sprint') ? clamp((sp - 1.3) / 1.2, 0, 1) : 0;
    if (sprint || this.act('sprint')) { const a = this.act('sprint'); a.setEffectiveWeight(move * sprint * (1 - one) * (1 - crawl)); a.timeScale = clamp(sp / this.sprintNative, 0.5, 2.2); } // (she builds up to a flat-out run: the clip speeds with her)
    const G = this.gaitSet;
    this.act('walk').setEffectiveWeight(G ? 0 : move * (1 - sprint) * (1 - one) * (1 - crawl));
    this.act('idle').setEffectiveWeight(G ? 0 : (1 - move) * (1 - one) * (1 - crawl));
    this.act('walk').timeScale = clamp(sp / this.nativeWalk, 0.5, 3.2);
    if (G) { // its own walk / run: the two clips either side of its travel direction (relative to its facing), one phase
      const base = (1 - one) * (1 - crawl), sn = Math.sin(z.yaw), cs = Math.cos(z.yaw);
      const vF = z.vx * sn + z.vz * cs, vL = z.vx * cs - z.vz * sn, th = sp > 0.05 ? Math.atan2(vL, vF) : 0;
      const ang = (d) => Math.atan2(d.x, d.z), k = Math.min(1, dt * 8);
      let native = 0, wsum = 0;
      for (const d of G.dirs) { // linear in angle between the two neighbouring directions
        const gap = (Math.PI * 2) / G.dirs.length, w = Math.max(0, 1 - Math.abs(angleDiff(ang(d), th)) / gap);
        this.gw[d.n] = (this.gw[d.n] ?? w) + (w - (this.gw[d.n] ?? w)) * k; wsum += this.gw[d.n];
      }
      for (const d of G.dirs) { this.gw[d.n] /= wsum || 1; native += this.gw[d.n] * d.s * (this.height / 1.69); }
      const rate = clamp(sp / Math.max(0.1, native), 0.55, 1.6);
      if (move > 0.01) this.gPhase = (this.gPhase + (dt * rate) / G.dur) % 1;
      for (const d of G.dirs) { const a = this.act(d.n); a.time = this.gPhase * G.dur + ((this.gJit ^= 1) * 1e-6); a.setEffectiveWeight(move * base * this.gw[d.n]); }
      this.act(G.idle).setEffectiveWeight((1 - move) * base);
    }
    // the guard's shield hold over the legs, while he has it: it outweighs a hit reaction (the panel stays up and square while
    // he flinches behind it) but yields to his own attacks (the slam swings it)
    if (this.act('shield_upper')) { const own = z.state === 'windup' || z.state === 'strike' || z.state === 'recover' || z.state === 'stuck'; this.act('shield_upper').setEffectiveWeight(this.shieldUp ? (own ? 1 - one : 3) * (1 - crawl) : 0); }
    if (this.hasCrawl) {
      const c = this.act('crawl'); c.setEffectiveWeight(crawl * (1 - one)); c.timeScale = clamp(sp / (0.22 * this.height), 0.45, 2.5);
      if (crawl) { if (z.state === 'windup') c.timeScale = 0.25; else if (z.state === 'strike') c.timeScale = 2.6; else if (z.state === 'stagger') c.timeScale = 0.15; } // coils, lunges, flinches: still on the floor
    }
    if (this.chairO || z.bed || this.lying) this.propPose(z, dt);
    if (this.chairO && z.chair && !z.crawling) { this.act('walk').setEffectiveWeight(0); this.act('idle').setEffectiveWeight(1 - one); } // (seated: the arms' own idle; the hands go to the rims below)
    this.mixer.update(dt);
    if (this.iv || this.chairO || z.bed || (this.outer.scale.x < 0 && !this.mirG)) this.propPlace(z, dt);
    if (this.plantedP && (z.state === 'stuck' || (z.state === 'pickup' && !this.clubArm))) this.gripPlanted(z);
    if (z.club && !this.clubArm && this.plantedP?.arm) this.takeClub();
    if (this.clubArm) { if (z.armGone && !z.club) this.breakClub(z); else this.stepLimp(dt); }
    for (const b of this.collapsed || []) b.scale.setScalar(1e-4); // (a limb cut from a zombie without a cut model stays collapsed into its joint)
    // the lady swells as her health runs out (and in the beat before she pops): her belly (Spine1, its child turned back)
    const sw = z.kind === 'sprinter' ? (z.state === 'dying' ? (z.noBurst ? 0 : 1 + Math.min(1, z.t / 0.3)) : clamp(1 - z.hp / Math.max(1, z.maxHp) / 0.35, 0, 1)) : 0;
    if (z.kind === 'sprinter' && this.bones.Spine1 && this.bones.Spine2) { // (set, not multiplied: the mixer does not rewrite a scale that holds still)
      const k = sw > 0 ? 1 + 0.2 * sw * (1 + 0.07 * Math.sin(performance.now() * 0.014)) : 1; this.bones.Spine1.scale.setScalar(k); this.bones.Spine2.scale.setScalar(1 / k);
    }
    this.swell = sw;
    this.container.updateMatrixWorld(true);
    this.bleeding(dt);
    if (this.shieldC) {
      const st = shieldState(z);
      if (st === 'break' || !z.alive) this.breakShield(z); // (dead with it intact: it falls apart with him)
      else { if (!this.shieldFit) this.fitShield(); if (st !== this.shieldC.state && st !== 'none') this.shieldC.setDamageState(st); if (st === 'heavy' && z.slams >= 1 && !this.split) this.splitShield(); this.shieldC.object3D.visible = this.outer.visible; }
    } else if (this.shield) this.placeShield(z);

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
    // the attack tell: the body warms to red through the wind-up (with the floor wedge, render/telegraph.js)
    const tell = z.state === 'windup' ? Math.min(1, z.t / Math.max(0.05, z.stateDur)) : 0, tk = tell * tell * 0.3;
    const sg = (this.swell || 0) * (0.06 + 0.06 * Math.sin(performance.now() * 0.009)); // (swollen: a sickly green-yellow pulse)
    const ex = z.alive && z.executable > now ? (0.5 + 0.5 * Math.sin(performance.now() * 0.018)) * 0.45 : 0; // (open to an execution: a warm white pulse)
    const rt = this.roomTint && this.roomTintOn ? this.roomTint : null; // (the room's light: render/lightkit.js B)
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(fl * 0.4 + tk + sg * 0.5 + ex + (rt ? rt.r : 0), fl * 0.33 + tk * 0.05 + sg + ex * 0.62 + (rt ? rt.g : 0), fl * 0.27 + tk * 0.03 + ex * 0.3 + (rt ? rt.b : 0));
    this.updateEyes(z, x, zz);
    // corpse sinks away after a while
    if (z.state === 'dead' && z.corpseT > 4.5) this.outer.position.y = -Math.min(1, (z.corpseT - 4.5) / 2) * 0.6;
    this.blob.visible = z.state !== 'dead' || z.corpseT < 4.5;
  }

  // his slam has driven the shield into the floor for good: it leaves his hand for the world where it is (never moved again)
  plantShield(z) {
    const c = this.shieldC; if (!c) return;
    if (!this.shieldFit) this.fitShield();
    this.container.updateMatrixWorld(true);
    ZombieView.scene.attach(c.object3D); // (keeps its world pose)
    c.object3D.updateMatrixWorld(true);
    const grip = c.grips.center.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(Math.cos(z.yaw), 0, -Math.sin(z.yaw));
    this.plantedP = { shield: c, grip, gripR: grip.clone().addScaledVector(up, 0.16).addScaledVector(side, -0.2), arm: null };
    ZombieView.planted.push(this.plantedP);
    this.shieldC = null; this.shieldFit = false;
  }
  // both hands on the planted shield's grip, whatever the heave does with his body (two-bone IK after the clip); while he
  // reaches back down for his torn arm (the pick-up's first half), his right hand goes to it
  gripPlanted(z) {
    const B = this.bones, P = this.plantedP;
    if (z.state === 'stuck') {
      if (!this.severed.has('Forearm_L') && B.LeftArm) solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, P.grip, 1);
      if (B.RightArm) solveArm(B.RightArm, B.RightForeArm, B.RightHand, P.gripR, 0.85);
    } else if (z.state === 'pickup' && P.arm && B.RightArm) {
      const w = Math.min(1, z.t / Math.max(0.1, z.stateDur * 0.45)), tgt = P.arm.localToWorld(new THREE.Vector3(0, 0.06, 0)); // (round the torn arm's wrist)
      solveArm(B.RightArm, B.RightForeArm, B.RightHand, tgt, w);
    }
  }
  // the last heave: his shield arm tears off at the shoulder and stays as it was, gripping the shield (baked from his pose
  // now: the hand is on the grip), blood from the shoulder as he reels back off it, and from the arm's torn end
  tearOff(z) {
    const R = CUT_ROOTS.Forearm_L, B = this.bones; if (!B[R[0]]) return;
    this.container.updateMatrixWorld(true);
    const a = B[R[0]].getWorldPosition(new THREE.Vector3()), b = B[R[1]].getWorldPosition(new THREE.Vector3());
    this.plantedP.arm = this.buildLimpArm(); this.plantedP.armL = a.distanceTo(b);
    (this.collapsed ||= []).push(B[R[0]]);
    const s = B.LeftShoulder?.getWorldPosition(new THREE.Vector3()) || a, fx = ZombieView.fx, back = new THREE.Vector3(z.hitDirX, 0, z.hitDirZ);
    if (fx) {
      fx.bloodSpray(s.x, s.y, s.z, -back.x * 0.6, 0.8, -back.z * 0.6, 40, 3.8); // (out of the shoulder toward the shield he tore it from)
      fx.bloodSpray(a.x, a.y, a.z, back.x * 0.3, -0.2, back.z * 0.3, 18, 1.6); // (the arm's torn end)
      fx.bloodPool(a.x, a.z, 1.0); fx.bloodPool(s.x + back.x * 0.5, s.z + back.z * 0.5, 0.8);
    }
    (this.stumpOf ||= {}).Forearm_L = CUT_STUMP.Forearm_L; this.bleed.Forearm_L = 4;
  }
  // the torn arm in three pieces cut at its joints, as it is now (buildLimpArm: LIMP): a group at the wrist in the forearm's
  // frame holding the forearm, the hand on its wrist pivot and the upper arm on its elbow pivot; it stays as it tore,
  // gripping the shield, until he takes it (takeClub), then swings (stepLimp)
  buildLimpArm() {
    const B = this.bones, wp = (b) => b.getWorldPosition(new THREE.Vector3());
    const S = wp(B.LeftArm), E = wp(B.LeftForeArm), W = wp(B.LeftHand);
    const u = E.clone().sub(W).normalize(), s0 = S.clone().sub(E).normalize();
    // the elbow's hinge from the way it is bent now (an elbow only ever folds one way); nearly straight: the forearm's own axis
    let n = s0.clone().addScaledVector(u, -s0.dot(u));
    if (n.lengthSq() < 4e-3) n = new THREE.Vector3(0, 0, 1).applyQuaternion(B.LeftForeArm.getWorldQuaternion(_bq)).addScaledVector(u, -1e-9);
    n.addScaledVector(u, -n.dot(u)).normalize();
    const hinge = new THREE.Vector3().crossVectors(n, u).normalize();
    const qRoot = frameQuat(u, hinge, new THREE.Quaternion()), qRi = qRoot.clone().invert();
    const th0 = Math.acos(clamp(s0.dot(u), -1, 1)), qUp = qRoot.clone().multiply(limpQ(0, th0, new THREE.Quaternion()));
    const parts = bakeChunks(this.model, { LeftArm: 'upper', LeftForeArm: 'fore', LeftHand: 'hand' },
      { fore: { c: W, qi: qRi }, hand: { c: W, qi: qRi }, upper: { c: E, qi: qUp.clone().invert() } });
    const root = new THREE.Group(), elbow = new THREE.Group(), wrist = new THREE.Group();
    root.position.copy(W); root.quaternion.copy(qRoot);
    elbow.position.copy(E.clone().sub(W).applyQuaternion(qRi)); limpQ(0, th0, elbow.quaternion);
    if (parts.fore) root.add(parts.fore); if (parts.hand) wrist.add(parts.hand); if (parts.upper) elbow.add(parts.upper);
    root.add(wrist, elbow);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); // (it moves: no shadow in the once-drawn shadow map)
    ZombieView.scene.add(root);
    const tipB = B.LeftHandMiddle1 || B.LeftHandIndex1, tip = tipB ? wp(tipB) : W.clone().addScaledVector(u, -0.1);
    root.userData.limp = { elbow, wrist, parts, psi: 0, th: th0, thLast: th0, Lu: S.distanceTo(E), Lf: E.distanceTo(W),
      h0: tip.sub(W).applyQuaternion(qRi).normalize(), P: null, Pp: null, H: null, Hp: null, E0: null, flickT: 0 };
    return root;
  }
  // he has his torn arm: off the shield's grip and into his right fist round its wrist (2026-10-18, the user: "grab it by the
  // hand.. or wrist"), the forearm out of his fist along clubAxis, the elbow beyond it and the upper arm swinging off that
  takeClub() {
    const P = this.plantedP, arm = P.arm, hand = this.bones.RightHand; if (!arm || !hand) return;
    this.container.updateMatrixWorld(true);
    hand.attach(arm);
    const ws = hand.getWorldScale(new THREE.Vector3()).x, fwd = ZombieView.clubAxis.clone();
    arm.quaternion.setFromUnitVectors(_ly, fwd).premultiply(_q.setFromAxisAngle(fwd, ZombieView.clubRoll));
    arm.scale.setScalar(1 / ws);
    arm.position.copy(ZombieView.clubGrip).addScaledVector(fwd, -0.035).divideScalar(ws); // (the wrist just through his fist: the hand hangs out of its far side)
    arm.userData.limp.P = null;
    this.clubArm = arm; P.arm = null;
  }
  // the torn arm swinging in his fist (LIMP): the upper arm a weight on the elbow, the hand on the wrist, each moved by
  // gravity and by his fist's motion (a few substeps a frame, the elbow's travel shared out over them), each kept inside its
  // joint's limits. An elbow that slams straight at speed (the whip at the end of a swing) flicks blood off the torn end
  stepLimp(dt) {
    const R = this.clubArm, A = R.userData.limp; if (!A || dt <= 0) return;
    R.updateMatrixWorld(true); R.getWorldQuaternion(_lq); _lqi.copy(_lq).invert();
    const E = A.elbow.getWorldPosition(_lE), Wr = R.getWorldPosition(_lw.set(0, 0, 0)).clone(), Lc = A.Lu * LIMP.L;
    if (!A.P) {
      A.P = E.clone().add(limpDir(A.psi, A.th, _lv).applyQuaternion(_lq).multiplyScalar(Lc)); A.Pp = A.P.clone(); A.E0 = E.clone();
      A.H = Wr.clone().add(_lv.copy(A.h0).applyQuaternion(_lq).multiplyScalar(LIMP.handL)); A.Hp = A.H.clone(); A.W0 = Wr.clone();
    }
    const N = 3, st = Math.min(dt, 1 / 20) / N, damp = Math.exp(-st * LIMP.damp), dampH = Math.exp(-st * LIMP.handDamp), g = 9.8 * st * st;
    let sp = 0;
    for (let i = 1; i <= N; i++) {
      _lEi.lerpVectors(A.E0, E, i / N);
      _lv.subVectors(A.P, A.Pp).multiplyScalar(damp); A.Pp.copy(A.P); A.P.add(_lv); A.P.y -= g;
      _lv.subVectors(A.P, _lEi).applyQuaternion(_lqi).normalize();
      [A.psi, A.th] = limpSolve(_lv, A);
      A.P.copy(_lEi).add(limpDir(A.psi, A.th, _lv).applyQuaternion(_lq).multiplyScalar(Lc));
      sp = A.P.distanceTo(A.Pp) / st;
      // the hand off the wrist: a cone round the way it hung when it tore
      _lg.lerpVectors(A.W0, Wr, i / N);
      _lv.subVectors(A.H, A.Hp).multiplyScalar(dampH); A.Hp.copy(A.H); A.H.add(_lv); A.H.y -= g;
      _lv.subVectors(A.H, _lg).applyQuaternion(_lqi).normalize();
      const off = Math.acos(clamp(_lv.dot(A.h0), -1, 1));
      if (off > LIMP.handCone) { _lv.lerp(A.h0, 1 - LIMP.handCone / off).normalize(); }
      A.H.copy(_lg).add(_lv.applyQuaternion(_lq).multiplyScalar(LIMP.handL));
    }
    A.E0.copy(E); A.W0.copy(Wr);
    limpQ(A.psi, A.th, A.elbow.quaternion);
    _lv.subVectors(A.H, Wr).applyQuaternion(_lqi).normalize(); A.wrist.quaternion.setFromUnitVectors(A.h0, _lv);
    A.flickT -= dt;
    if (A.th < 0.08 && A.thLast > 0.3 && sp > LIMP.flick && A.flickT <= 0 && ZombieView.fx) { // (the whip: blood off the torn shoulder end, along its swing)
      const end = E.clone().add(limpDir(A.psi, A.th, _lv).applyQuaternion(_lq).multiplyScalar(A.Lu)), d = A.P.clone().sub(A.Pp).normalize();
      ZombieView.fx.bloodSpray(end.x, end.y, end.z, d.x, d.y + 0.2, d.z, 10 + Math.round(Math.min(10, sp * 1.5)), 2.2 + sp * 0.3);
      A.flickT = 0.25;
    }
    A.thLast = A.th;
  }
  // his torn arm comes apart on a blow (core/zombies.js guardClubBreak): its three pieces thrown on along the swing, blood
  breakClub(z) {
    const R = this.clubArm, A = R?.userData.limp; if (!A) return;
    this.container.updateMatrixWorld(true);
    const P = ZombieView.physics, fx = ZombieView.fx, dir = new THREE.Vector3(Math.sin(z.yaw), 0, Math.cos(z.yaw)), wp = (o, v) => o.localToWorld(v);
    const W = wp(R, new THREE.Vector3()), E = A.elbow.getWorldPosition(new THREE.Vector3()), S = wp(A.elbow, new THREE.Vector3(0, A.Lu, 0)), T = wp(A.wrist, A.h0.clone().multiplyScalar(0.16));
    for (const [k, a, b, r] of [['upper', E, S, 0.07], ['fore', W, E, 0.06], ['hand', W, T, 0.05]]) {
      const obj = A.parts[k]; if (!obj) continue;
      const q0 = frameQuat(b.clone().sub(a), new THREE.Vector3(1, 0, 0).applyQuaternion(R.getWorldQuaternion(_bq)), new THREE.Quaternion());
      const G = new THREE.Group(); G.position.copy(a).add(b).multiplyScalar(0.5); G.quaternion.copy(q0); ZombieView.scene.add(G); G.updateMatrixWorld(true); G.attach(obj);
      const vel = dir.clone().multiplyScalar(2.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1.8 + Math.random() * 1.5, (Math.random() - 0.5) * 2));
      const rr = r * (this.height / 1.7), piece = { obj: G, t: 0, id: P && P.ready ? P.addPiece(a, b, rr, vel, q0) : 0, P: P && P.ready ? P : null, vel, r: rr, states: [] };
      ZombieView.pieces.push(piece); if (ZombieView.pieces.length > MAX_PIECES) ZombieView.dropPiece(ZombieView.pieces[0]);
    }
    if (fx) { fx.bloodSpray(E.x, E.y, E.z, dir.x, 0.4, dir.z, 30, 3.6); fx.burst(E.x, E.y, E.z, 12, 0x5a1414, 3.2, 1.0, 0.6, dir.x, dir.z); fx.bloodPool(E.x + dir.x * 0.5, E.z + dir.z * 0.5, 0.9); }
    R.parent?.remove(R); this.clubArm = null;
  }
  // the guard's stand-in shield: in front of him at his left hand, upright and square to his facing (dropped when he dies)
  placeShield(z) {
    const S = this.shield, h = this.bones.LeftHand; if (!h) return;
    if (!z.alive) { S.visible = false; return; }
    h.getWorldPosition(_v); const yaw = this.container.rotation.y;
    S.position.set(_v.x + Math.sin(yaw) * 0.12, Math.max(0.35, _v.y), _v.z + Math.cos(yaw) * 0.12);
    S.rotation.set(0, yaw, 0); S.visible = this.outer.visible;
  }

  // (the broken shields' lifetimes run on the game clock with the severed pieces)
  static updateShields(dt) { const L = ZombieView.brokenShields; for (let i = L.length - 1; i >= 0; i--) { L[i].update(dt); if (L[i].disposed) L.splice(i, 1); } }
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

// ---- gore for the story's people (2026-10-21, the user: the looters' heads burst on a head shot; Pete and Sophie lose an
// arm, a leg or the head in the zombie attack) ----
// Cut from their own skin weights as the guard is (CUT_ROOTS: an arm at the shoulder, a leg at the knee, the head at the
// neck): the piece baked in the pose on screen and thrown with the zombies' pieces (ZombieView.pieces, the same physics), the
// limb's bone collapsed into its joint from then on, a wet wound with a bone end where it was, blood. headBurst: the head
// in pieces instead of whole. update(dt) after the body's mixer each frame.
const WOUND = new THREE.MeshStandardMaterial({ color: 0x320404, roughness: 0.42 }), WOUND_BONE = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.6 });
const WOUND_GEO = new THREE.SphereGeometry(1, 12, 8);
// a torn piece's inside, dark meat instead of the skin's own texture seen from behind (a burst head's shell read as paper)
const MEAT = new THREE.MeshStandardMaterial({ color: 0x3a0606, roughness: 0.45, side: THREE.BackSide });
function meaty(obj) { const add = []; obj.traverse((o) => { if (o.isMesh) add.push(o); }); for (const o of add) { o.material.side = THREE.FrontSide; const m = new THREE.Mesh(o.geometry, MEAT.clone()); m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale); o.parent.add(m); } }
export class BodyGore {
  constructor(model, height) {
    this.model = model; this.height = height; this.bones = {}; this.collapsed = []; this.bleed = []; this.cut = new Set();
    model.traverse((o) => { if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o; });
  }
  // the end of a cut piece: its end bone, or (none, as a head without HeadTop_End) 0.2 m on along the bone at 1.7 m
  end(from, to) {
    const B = this.bones;
    return B[to] ? B[to].getWorldPosition(new THREE.Vector3()) : B[from].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.2 * (this.height / 1.7), 0).applyQuaternion(B[from].getWorldQuaternion(_bq)));
  }
  // a limb or the head off (Forearm_L / Forearm_R / LowerLeg_L / LowerLeg_R / Head), thrown along (dx, dz)
  sever(part, dx, dz, speed = 3) {
    const R = CUT_ROOTS[part], B = this.bones; if (!R || !B[R[0]] || this.cut.has(part)) return false;
    this.cut.add(part); this.model.updateMatrixWorld(true);
    const a = B[R[0]].getWorldPosition(new THREE.Vector3()), b = this.end(R[0], R[1]);
    const q0 = frameQuat(b.clone().sub(a), new THREE.Vector3(1, 0, 0).applyQuaternion(B[R[0]].getWorldQuaternion(_bq)), new THREE.Quaternion());
    const F = { c: a.clone().add(b).multiplyScalar(0.5), q0, qi: q0.clone().invert() };
    const obj = bakeChunks(this.model, { [R[0]]: part }, { [part]: F })[part];
    if (obj) {
      meaty(obj); obj.position.copy(F.c); obj.quaternion.copy(q0); ZombieView.scene.add(obj);
      const vel = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(speed).add(new THREE.Vector3(0, 2.2 + Math.random() * 1.2, 0));
      this.addPiece(obj, a, b, R[2] * (this.height / 1.7), vel, q0);
    }
    this.wound(R[0], CUT_STUMP[part], R[2]);
    const s = B[CUT_STUMP[part]].getWorldPosition(new THREE.Vector3()), fx = ZombieView.fx;
    if (fx) { fx.bloodSpray(s.x, s.y, s.z, dx * 0.8, 0.5, dz * 0.8, part === 'Head' ? 34 : 26, 3.4); fx.bloodPool(s.x + dx * 0.4, s.z + dz * 0.4, part === 'Head' ? 1.1 : 0.9); }
    this.bleed.push({ bone: B[CUT_STUMP[part]], t: 3, up: part === 'Head' ? 0.6 : -0.1 });
    return true;
  }
  // the head bursts: its skin in eight pieces (four round the top, four round the jaw), thrown along the shot and out from
  // the middle, a red mist with chips of skull, the neck's wound pumping
  headBurst(dx, dz, power = 1) {
    const B = this.bones; if (!B.Head || this.cut.has('Head')) return false;
    this.cut.add('Head'); this.model.updateMatrixWorld(true);
    const d = new THREE.Vector3(dx, 0, dz).normalize(), c = B.Head.getWorldPosition(new THREE.Vector3()).lerp(this.end('Head', 'HeadTop_End'), 0.45);
    const isHead = (bone) => { for (let n = bone; n && n.isBone; n = n.parent) if (n === B.Head) return true; return false; };
    const frag = (p) => { const v = p.clone().sub(c); let ang = Math.atan2(v.x, v.z) - Math.atan2(d.x, d.z); ang = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return (v.y > 0 ? 0 : 4) + Math.floor(ang / (Math.PI / 2)) % 4; };
    const parts = []; // { k: fragment, mesh, ctr: its middle (world) }, one per skinned mesh and fragment
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return;
      o.skeleton.update();
      const g = o.geometry, n = g.attributes.position.count, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, hb = o.skeleton.bones.map(isHead);
      const vf = new Int8Array(n).fill(-1), wp = {};
      for (let i = 0; i < n; i++) { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } if (hb[bi]) { o.getVertexPosition(i, _bv); wp[i] = _bv.applyMatrix4(o.matrixWorld).clone(); vf[i] = frag(wp[i]); } }
      const idx = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i), uvs = g.attributes.uv;
      const tris = {}; for (let t = 0; t < idx.length; t += 3) { const k = vf[idx[t]]; if (k >= 0 && vf[idx[t + 1]] >= 0 && vf[idx[t + 2]] >= 0) (tris[k] ||= []).push(idx[t], idx[t + 1], idx[t + 2]); }
      for (const [k, list] of Object.entries(tris)) {
        const ctr = new THREE.Vector3(); for (const vi of list) ctr.add(wp[vi]); ctr.divideScalar(list.length);
        const map = new Map(), pos = [], uv = [], index = [];
        for (const vi of list) { let j = map.get(vi); if (j === undefined) { j = map.size; map.set(vi, j); const p = wp[vi]; pos.push(p.x - ctr.x, p.y - ctr.y, p.z - ctr.z); if (uvs) uv.push(uvs.getX(vi), uvs.getY(vi)); } index.push(j); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(index); geo.computeVertexNormals();
        const mat = o.material.clone(); if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
        parts.push({ k: +k, mesh: new THREE.Mesh(geo, mat), ctr });
      }
    });
    const byFrag = {}; for (const p of parts) (byFrag[p.k] ||= []).push(p);
    const r = 0.035 * (this.height / 1.7), side = new THREE.Vector3(-d.z, 0, d.x);
    for (const list of Object.values(byFrag)) {
      const ctr = list[0].ctr.clone(), obj = new THREE.Group(); obj.position.copy(ctr);
      for (const p of list) { p.mesh.position.copy(p.ctr).sub(ctr); obj.add(p.mesh); }
      meaty(obj); ZombieView.scene.add(obj);
      const out = ctr.clone().sub(c).setY(0); if (out.lengthSq() < 1e-6) out.copy(d); out.normalize();
      const vel = d.clone().multiplyScalar((2.5 + Math.random() * 2.5) * power).addScaledVector(out, 1.5 + Math.random() * 1.5).addScaledVector(side, (Math.random() - 0.5) * 2).setY((1.5 + Math.random() * 2) * Math.sqrt(power));
      this.addPiece(obj, ctr.clone().addScaledVector(_ly, -r), ctr.clone().addScaledVector(_ly, r), r, vel, new THREE.Quaternion());
    }
    this.wound('Head', 'Neck', 0.06);
    const fx = ZombieView.fx;
    if (fx) {
      fx.bloodSpray(c.x, c.y, c.z, d.x, 0.5, d.z, 50, 4.6 * power); fx.bloodSpray(c.x, c.y, c.z, d.x * 0.3, 1.4, d.z * 0.3, 24, 2.6);
      fx.burst(c.x, c.y, c.z, 28, 0x5a1414, 3.6, 1.2, 0.6, d.x * 0.8, d.z * 0.8); fx.burst(c.x, c.y, c.z, 10, 0xe9e2d2, 3.2, 1.6, 0.4, d.x * 0.8, d.z * 0.8); // (a red mist, chips of skull)
      fx.bloodPool(c.x + d.x * 0.9, c.z + d.z * 0.9, 1.0);
    }
    this.bleed.push({ bone: B.Neck || B.Head, t: 4, up: 0.8 });
    return true;
  }
  addPiece(obj, a, b, r, vel, q0) {
    const P = ZombieView.physics, live = P && P.ready;
    ZombieView.pieces.push({ obj, t: 0, id: live ? P.addPiece(a, b, r, vel, q0) : 0, P: live ? P : null, vel, r, states: [] });
    if (ZombieView.pieces.length > MAX_PIECES) ZombieView.dropPiece(ZombieView.pieces[0]);
  }
  // the cut bone collapsed into its joint; on the joint a wet wound with the bone's end in it, flattened along the limb
  wound(cutBone, onBone, rad) {
    const B = this.bones, cb = B[cutBone], ob = B[onBone] || cb?.parent; if (!cb || !ob) return;
    this.collapsed.push(cb);
    // (2026-10-21: first made 1.15 x the limb's radius, half as deep, it stood out of the shoulder like a red jelly bean: now
    // the limb's own width, a third as deep, sunk a little into the joint)
    const k = rad * 0.85 * (this.height / 1.7) / (ob.getWorldScale(_bv).x || 1), g = new THREE.Group();
    const w = new THREE.Mesh(WOUND_GEO, WOUND); w.scale.set(k, k * 0.32, k); g.add(w);
    const bn = new THREE.Mesh(WOUND_GEO, WOUND_BONE); bn.scale.setScalar(k * 0.28); bn.position.y = k * 0.18; g.add(bn);
    const dir = cb.position.clone().normalize();
    g.position.copy(cb.position).addScaledVector(dir, -k * 0.25); g.quaternion.setFromUnitVectors(_ly, dir); ob.add(g);
  }
  update(dt) {
    for (const b of this.collapsed) b.scale.setScalar(1e-4);
    const fx = ZombieView.fx;
    for (let i = this.bleed.length - 1; i >= 0; i--) {
      const s = this.bleed[i]; if ((s.t -= dt) <= 0) { this.bleed.splice(i, 1); continue; }
      if (fx && Math.random() < dt * 18) { const p = s.bone.getWorldPosition(_bv); fx.bloodSpray(p.x, p.y, p.z, 0, s.up, 0, 1, 0.8); }
    }
  }
}
