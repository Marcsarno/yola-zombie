// Chapter 2: the people (survivors at the house, the looters at the clubhouse) and the girls.
// The survivors (2026-10-20, the user's Mixamo picks): Eve with the rifle; Remy, James, Sophie and Bryce with pistols
// (assets/survivors/*.glb: tools/anim/mixamo_zombie_prep.py, ~20k triangles, colour and normals at 2048, WebP, then tools/anim/build_survivor.py: Mixamo
// aim idles, a flinch, two falls). The looters' models are not made yet: each is a plain debug marker, a coloured capsule
// with a facing nub (the memory rule: no stand-in characters dressed up as finished).
// Their behaviour is real: the survivors shoot zombies through the game's own hit code; the looters are entries in the
// simulation's zombie list (so the player's swings and shots hit, cut and kill them as the game already does) that stand
// in cover, aim with a red sight line (the old build's readable tell) and fire at Marc.
import * as THREE from 'three';
import { companionStep, trailPoint } from './companion.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PISTOL_CORE_SCALE } from '../render/weaponModels.js';
import { characterLight } from './charlight.js';
import { groundY } from './layout.js';
import { BodyGore } from '../render/clipchars.js';
import { caseRig, casePose, casePlace, caseFit } from '../render/casecarry.js';

// who stands where: the rifle survivor first, then the pistol survivors in turn [file, height m]
const SURVIVORS = { rifle: [['eve', 1.7]], pistol: [['remy', 1.8], ['james', 1.8], ['sophie', 1.66], ['bryce', 1.78]] };
// the looters (2026-10-20, the user's roles: "James, Remy, maybe Brian, Bryce, David, Lewis ... looters, kind of bad guys"),
// one per spot in hood.js's order (the two on the portico, the two in cover, the leader), Brian the spare: their survivor
// builds plus assets/survivors/moves/<k>-looter.glb (tools/anim/test_zombie_clips.py: Quaternius UAL1 crouch cover, crouch
// enter / exit, pistol idle / aim / shoot / reload, three hits, two deaths)
const LOOTERS = [['bryce', 1.78], ['lewis', 1.8], ['james', 1.8], ['remy', 1.8], ['david', 1.8], ['brian', 1.8]];
// the story's people (the user's audio pack, HANDOFF_NEXT.md): Sophie (who follows Marc), Pete (the groundskeeper on the
// drive), James (the looter in Marc's house, as the looters plus his own moves): the survivor builds with the moves made for
// the chapter (assets/survivors/moves/<k>-hood.glb, Quaternius UAL through tools/anim/test_zombie_clips.py) [height m]
const STORY = { sophie: 1.66, pete: 1.8, adam: 1.78 };   // (Adam: Sophie's husband, the story reset v3; his turned skin below)
// Adam's skin as he turns (tools/anim/zombify_skin.py on his build, the base colour only, by material: the hair stays)
const TURNED = { Ch08_body: 'assets/survivors/zombified/adam_turned/Ch08_body.webp', Ch08_body1: 'assets/survivors/zombified/adam_turned/Ch08_body1.webp' };
const GUNS = { rifle: ['assets/neighborhood/props/security_rifle.glb', 1], pistol: ['assets/weapons/pistol_core.glb', PISTOL_CORE_SCALE] };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3();
// a bone turned about the world's up axis, on top of the move playing (the mixer sets the bone again next frame)
function turnBone(bone, ang) { bone.getWorldQuaternion(_q); _up.set(0, 1, 0).applyQuaternion(_q.invert()); bone.quaternion.multiply(_q2.setFromAxisAngle(_up, ang)); bone.updateMatrixWorld(true); }
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

// the left arm's bones for a case (render/casecarry.js) on a Mixamo build, and the left hand's grip: its fingers as a clip
// holds them on its first frame (the jog's loose fist)
const caseBones = (B) => Object.fromEntries(['LeftArm', 'LeftForeArm', 'LeftHand', ...['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3].map((i) => 'LeftHand' + f + i))].map((n) => [n, B(n)]).filter(([, b]) => b));
function clipFist(clip, B) {
  const out = []; if (!clip) return out;
  for (const t of clip.tracks) {
    const [bn, prop] = t.name.split('.'); if (prop !== 'quaternion' || !/LeftHand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(bn)) continue;
    const b = B(bn.replace(/^mixamorig:?/, '')); const v = t.values;
    if (b) out.push([b, new THREE.Quaternion(v[0], v[1], v[2], v[3])]);
  }
  return out;
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
      ...Object.entries(GUNS).map(([k, [f, s]]) => loader.loadAsync(f).then((g) => { this.guns[k] = { scene: g.scene, s }; }).catch((e) => console.warn('survivor gun', k, e))),
      ...LOOTERS.map(([k, h]) => Promise.all([loader.loadAsync('assets/survivors/' + k + '.glb'), loader.loadAsync('assets/survivors/moves/' + k + '-looter.glb'), k === 'james' ? loader.loadAsync('assets/survivors/moves/james-hood.glb') : null])
        .then(([g, mv, hm]) => { g.animations.push(...mv.animations, ...(hm?.animations || [])); (this.looterModels ||= {})[k] = { g, h }; }).catch((e) => console.warn('looter', k, e))),
      ...Object.entries(STORY).map(([k, h]) => Promise.all([loader.loadAsync('assets/survivors/' + k + '.glb'), loader.loadAsync('assets/survivors/moves/' + k + '-hood.glb')])
        .then(([g, mv]) => { g.animations.push(...mv.animations); (this.storyModels ||= {})[k] = { g, h }; }).catch((e) => console.warn('story', k, e)))]);
  }
  // a looter's body (the survivor's, with the looter moves): in cover he crouches (Crouch_Idle_Loop), pops up (Crouch_Exit)
  // to aim (Pistol_Aim_Neutral), fires (Pistol_Shoot), ducks back (Crouch_Enter); on the portico he stands (Pistol_Idle_Loop)
  // and raises the gun to aim. A hit plays one of the three hits, then back to what he was doing; dying, Death01 or 02.
  looterBody(i, standing) {
    const pick = LOOTERS[i % LOOTERS.length], M = this.looterModels?.[pick[0]]; if (!M) return null;
    const m = skClone(M.g.scene); m.scale.setScalar(pick[1]);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); characterLight(m);
    const turn = new THREE.Group(); turn.add(m);
    const obj = new THREE.Group(); obj.add(turn);
    const mixer = new THREE.AnimationMixer(m), clips = Object.fromEntries(M.g.animations.map((c) => [c.name, c]));
    const act = (n, once) => { const c = clips[n]; if (!c) return null; const a = mixer.clipAction(c); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = !!once; return a; };
    const len = (n) => clips[n]?.duration || 0.5;
    const B = (n) => m.getObjectByName('mixamorig' + n);
    const bones = { hand: B('RightHand'), mid: B('RightHandMiddle1'), sh: B('RightArm') };
    const G = this.guns?.pistol; const holder = G ? gunHolder(G.scene, G.s) : null; if (holder) this.group.add(holder);
    const palm = (h, mid, out) => out.copy(h.getWorldPosition(_v3)).lerp(mid.getWorldPosition(_v2), 0.55);
    const aimDir = (out) => { palm(bones.hand, bones.mid, out); return out.sub(bones.sh.getWorldPosition(_v)); };
    // the aim's own turn, measured once on Pistol_Aim_Neutral: the model turns so that aim lies down +z (as the survivors)
    const a0 = act('ual1_Pistol_Aim_Neutral'); if (a0) { a0.play(); mixer.update(0); obj.updateMatrixWorld(true); const d0 = aimDir(new THREE.Vector3()); turn.rotation.y = -Math.atan2(d0.x, d0.z); a0.stop(); }
    const aimTurn = turn.rotation.y, head = B('Head');
    const REST = standing ? 'ual1_Pistol_Idle_Loop' : 'ual1_Crouch_Idle_Loop', AIM = 'ual1_Pistol_Aim_Neutral';
    let cur = act(REST); cur.play();
    const go = (n, once, fade = 0.18) => { const a = act(n, once); if (!a) return; turn.rotation.y = /^hood_|_Jog_|_Sprint_/.test(n) ? 0 : aimTurn; if (a === cur) { if (once) a.reset().play(); return; } a.reset().play(); cur.crossFadeTo(a, fade, false); cur = a; }; // (the chapter's own moves and the runs face +z as made)
    const body = { obj, mixer, holder, clips, kick: 0, dead: false, deadT: 0, up: false, pose: REST, next: null, nextAt: 0, t: 0, gunOn: true,
      gore: new BodyGore(m, pick[1]), // (a head shot bursts his head: looterStep, jamesStep)
      then(at, n) { body.next = n; body.nextAt = body.t + at; }, // (after a one-shot: the pose to settle into)
      play(n, once = false, fade = 0.2) { body.next = null; body.pose = n; go(n, once, fade); return clips[n]?.duration || 0; },
      update(dt) {
        mixer.update(dt); body.t += dt; body.gore.update(dt);
        if (body.next && !body.dead && body.t >= body.nextAt) { const n = body.next; body.next = null; body.pose = n; go(n, false, 0.15); }
        obj.updateMatrixWorld(true);
        if (body.carry) { // (a case in his left hand, the gun in his right: the opening's looters; render/casecarry.js, as Marc carries his)
          const C = body.carryRig ||= { rig: caseRig(m, caseBones(B), clipFist(clips.ual1_Jog_Fwd_Loop, B)), fit: caseFit() };
          body.carry.visible = obj.visible && !body.dead;
          if (!body.dead) { casePose(C.rig, C.fit, 1, m.getWorldDirection(_v).setY(0).normalize(), pick[1]); casePlace(C.rig, body.carry, C.fit); }
        }
        if (!holder) return;
        if (body.dead) body.deadT += dt;
        holder.visible = obj.visible && body.gunOn && (!body.dead || body.deadT < 0.35); // (dropped as he goes down)
        palm(bones.hand, bones.mid, holder.position); holder.position.y -= 0.045;
        const d = aimDir(_v); d.y *= 0.3; d.normalize(); holder.quaternion.setFromUnitVectors(Z, d);
        if (body.kick > 0) { body.kick = Math.max(0, body.kick - dt * 6); holder.position.addScaledVector(d, -0.06 * body.kick); }
      },
      coverUp() { // out of cover to aim (or the gun raised, standing)
        if (body.dead || body.up) return; body.up = true;
        if (standing) { body.pose = AIM; body.next = null; go(AIM, false, 0.2); return; }
        go('ual1_Crouch_Exit', true, 0.12); body.then(len('ual1_Crouch_Exit') * 0.8, AIM);
      },
      fire() { if (body.dead) return; body.kick = 1; go('ual1_Pistol_Shoot', true, 0.06); body.then(len('ual1_Pistol_Shoot') * 0.9, AIM); },
      coverDown() { // back into cover (or the gun lowered)
        if (body.dead || !body.up) return; body.up = false;
        if (standing) { body.then(0, REST); return; }
        go('ual1_Crouch_Enter', true, 0.12); body.then(len('ual1_Crouch_Enter') * 0.8, REST);
      },
      hit() { if (body.dead) return; const n = ['ual1_Hit_Chest', 'ual1_Hit_Head', 'ual1_Hit_Stomach'][Math.floor(Math.random() * 3)]; go(n, true, 0.06); body.then(len(n) * 0.85, body.up ? AIM : REST); },
      fall() {
        if (body.dead) return; body.dead = true; body.deadT = 0; body.next = null;
        go(Math.random() < 0.5 ? 'ual1_Death01' : 'ual1_Death02', true, 0.12);
      },
      neck(out) { return head ? head.getWorldPosition(out) : out.set(obj.position.x, 1.55, obj.position.z); },
      dispose() { holder?.removeFromParent(); },
    };
    return body;
  }
  // a survivor's body: the model on the clip's own aim, the gun in the right palm along the aim (rifle: from hand to hand,
  // pistol: from the shoulder to the hand), the model turned so that aim points down the actor's facing
  survivorBody(gun, model = null) {
    const list = SURVIVORS[gun] || SURVIVORS.pistol, i = this.nPicked[gun] = (this.nPicked[gun] || 0) + 1, pick = list[(i - 1) % list.length];
    const M = model ? this.storyModels?.[model] : this.models?.[pick[0]]; if (!M) return null;
    const m = skClone(M.g.scene); m.scale.setScalar(model ? M.h : pick[1]);
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
      gore: new BodyGore(m, model ? M.h : pick[1]), // (Pete's arm in the zombie attack: survivor overwhelm)
      update(dt) {
        mixer.update(dt); body.gore.update(dt); obj.updateMatrixWorld(true);
        if (!holder) return;
        if (body.dead) body.deadT += dt;
        holder.visible = obj.visible && (!body.dead || body.deadT < 0.35); // (dropped as he goes down)
        palm(bones.hand, bones.mid, holder.position); if (gun !== 'rifle') holder.position.y -= 0.045; // (the pistol's grip down into the two-handed fist)
        const d = aimDir(_v); d.y *= 0.3; d.normalize(); holder.quaternion.setFromUnitVectors(Z, d);
        if (body.kick > 0) { body.kick = Math.max(0, body.kick - dt * 6); holder.position.addScaledVector(d, -0.06 * body.kick); }
      },
      fire() { body.kick = 1; },
      // any of the file's moves (Adam's: hood_IdleToLay, hood_Zombie_Spawn ...), cross-faded from what is playing
      play(n, { once = false, fade = 0.25, rate = 1 } = {}) {
        const c = clips[n]; if (!c) return 0;
        const a = mixer.clipAction(c); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once; a.timeScale = rate;
        a.reset().play(); (body.cur || idle).crossFadeTo(a, fade, false); body.cur = a; turn.rotation.y = n.startsWith('hood_') ? 0 : body.aimTurn;   // (the chapter's moves face +z as made)
        return c.duration / rate;
      },
      fall(forward) {
        if (body.dead) return; body.dead = true; body.deadT = 0;
        const c = clips[forward ? 'death_forward' : 'death_back']; if (!c) return;
        const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset().play(); idle.crossFadeTo(a, 0.2, false);
      },
      dispose() { holder?.removeFromParent(); },
    };
    // the clip's own aim, measured once on its first frame: the model turns so that aim lies down +z
    mixer.update(0); obj.updateMatrixWorld(true);
    const d0 = aimDir(new THREE.Vector3()); turn.rotation.y = body.aimTurn = -Math.atan2(d0.x, d0.z);
    body.model = m;
    return body;
  }
  // a body's skin blended toward another set of pictures (Adam turning): turnK 0 .. 1 mixes each named material's base colour
  // with its turned picture, in the shader (the character light's own hook kept, charlight.js)
  turnSkin(body, files) {
    const U = { value: 0 }, tl = new THREE.TextureLoader();
    body.model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map((m0) => {
        const f = files[m0.name]; if (!f || !m0.map) return m0;
        const m = m0.clone(), t = tl.load(f); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
        const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
        m.onBeforeCompile = (sh, r) => {
          prev?.call(m, sh, r);
          sh.uniforms.turnMap = { value: t }; sh.uniforms.turnK = U;
          sh.fragmentShader = 'uniform sampler2D turnMap;\nuniform float turnK;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, diffuse * texture2D(turnMap, vMapUv).rgb, turnK);');
        };
        m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|turn';
        return m;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    return U;
  }
  clear() { this.nPicked = {}; for (const a of this.list) { a.obj.removeFromParent(); a.body?.dispose(); } this.list.length = 0; for (const t of this.tracers) t.line.removeFromParent(); this.tracers.length = 0; }
  sound(name, x, z, vol = 1) { this.ctx.audio?.play(name, vol, { x, z }); }
  tracer(x0, z0, x1, z1, y = 1.3) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y * 0.85, z1)]);
    const line = new THREE.Line(g, this.tracerMat); this.group.add(line); this.tracers.push({ line, t: 0.07 });
  }

  // a friendly survivor at a spot, shooting the nearest zombie in sight every so often; overwhelm(): stops, falls
  survivor(at, { gun = 'pistol', model = null } = {}) {
    const body = this.survivorBody(gun, model), obj = body ? body.obj : marker(COL.survivor); obj.position.set(at.x, 0, at.z); obj.rotation.y = at.yaw || 0; this.group.add(obj);
    const a = { kind: 'survivor', obj, body, x: at.x, z: at.z, yaw: at.yaw || 0, cd: 0.5, down: false, gun };
    // (a.tear: what the zombies take as they bring him down, e.g. ['Forearm_L']; Pete's: one arm. A part: Forearm_L / _R,
    // LowerLeg_L / _R, Head)
    a.overwhelm = () => { a.down = true; body?.fall(Math.random() < 0.5); if (body) a.tear?.forEach((part, i) => { const t = a.yaw + Math.PI * (0.5 + Math.random()); body.gore.sever(part, Math.sin(t), Math.cos(t), 2.2 + i); }); };
    a.step = (dt, level) => {
      const sim = level.sim;
      if (a.down) { if (!body) obj.rotation.x = Math.min(Math.PI / 2, obj.rotation.x + dt * 3); return; }
      if ((a.cd -= dt) > 0) return;
      let best = null, bd = 15;
      for (const z of sim.zombies) { if (!z.alive || z.looter) continue; const d = Math.hypot(z.x - a.x, z.z - a.z); if (d < bd && sim.world.lineOfSight(a.x, a.z, z.x, z.z, 1.2)) { best = z; bd = d; } }
      if (!best) { a.cd = 0.3; return; }
      a.yaw = Math.atan2(best.x - a.x, best.z - a.z); obj.rotation.y = a.yaw;
      const dx = (best.x - a.x) / bd, dz = (best.z - a.z) / bd, rifle = a.gun === 'rifle';
      if (sim.rand() < (rifle ? 0.8 : 0.55)) best.takeHit((rifle ? 55 : 22) * (a.dmgK ?? 1), dx, dz, rifle ? 4 : 2.5, 'pistol', sim, 'torso');
      this.tracer(a.x, a.z, best.x, best.z); this.sound(rifle ? 'shotgun' : 'shot', a.x, a.z, 0.7); body?.fire();
      a.cd = (rifle ? 0.9 : 0.7) + sim.rand() * 0.6;
    };
    this.list.push(a); return a;
  }

  // the looters: a leader in the office with the boat keys, the others in cover; two step out onto the portico
  looters(level, spots) {
    const sim = level.sim, out = [];
    for (const [i, s] of spots.entries()) {
      const z = sim.spawnZombie(null, { x: s.x, z: s.z, yaw: 0, hp: s.leader ? 150 : 70 });
      z.passive = true; z.speedMul = 0; z.noView = true; z.looter = true; z.dormant = null;
      const body = this.looterBody(i, !!s.out), obj = body ? body.obj : marker(s.leader ? COL.leader : COL.looter); obj.position.set(s.x, 0, s.z); this.group.add(obj);
      const sight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), this.lineMat); sight.visible = false; this.group.add(sight);
      const a = { kind: 'looter', z, obj, body, hp: z.hp, sight, home: { x: s.x, z: s.z }, out: !!s.out, leader: !!s.leader, aim: 0, cd: 1 + sim.rand() * 1.5, wasAlive: true, calm: !!s.calm, face: s.face || null,
        get alive() { return z.alive; } };
      a.step = (dt, lv) => this.looterStep(a, dt, lv);
      this.list.push(a); out.push(a);
    }
    return out;
  }
  looterStep(a, dt, level) {
    const sim = level.sim, z = a.z, p = sim.player;
    const b = a.body;
    if (!z.alive) {
      a.sight.visible = false;
      if (a.wasAlive) { // (a head shot: his head bursts, in the pose he was shot in, before he drops)
        a.wasAlive = false;
        if (b && z.lastHitPart === 'Head') { const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz) || 1; b.gore.headBurst(dx / d, dz / d); }
        b?.fall(); a.onDeath?.();
      }
      if (!b) a.obj.rotation.x = Math.min(Math.PI / 2, a.obj.rotation.x + dt * 3);
      return;
    }
    if (a.crew) return this.crewStep(a, dt, level);
    const struck = z.hp < a.hp; if (struck) b?.hit(); a.hp = z.hp; // (a hit that does not kill: a flinch, then back to what he was doing)
    z.x = a.home.x; z.z = a.home.z; z.vx = z.vz = 0; // (they hold their cover: the zombie AI never walks them)
    const dx = p.x - z.x, dz = p.z - z.z, d = Math.hypot(dx, dz), los = !p.dead && d < 17 && sim.world.lineOfSight(z.x, z.z, p.x, p.z, 1.3);
    // (calm: two of them talking, the beat 1 sentries; no stealth system, they turn on him only if he gives himself away: a
    // hit, a shot near them, walking right up to them)
    if (a.calm) {
      const shot = sim.events.some((e) => (e.type === 'shot' || e.type === 'shotgun') && Math.hypot(p.x - z.x, p.z - z.z) < 28);
      if (struck || shot || (d < 5.5 && los)) { a.calm = false; a.cd = 0.6; for (const o of this.list) if (o.kind === 'looter' && o.calm && Math.hypot(o.home.x - a.home.x, o.home.z - a.home.z) < 8) { o.calm = false; o.cd = 1.1; } }
      else { const f = a.face || [p.x, p.z]; z.yaw = Math.atan2(f[0] - z.x, f[1] - z.z); a.obj.position.set(z.x, 0, z.z); a.obj.rotation.y = z.yaw; a.sight.visible = false; return; }
    }
    z.yaw = Math.atan2(dx, dz); a.obj.position.set(z.x, 0, z.z); a.obj.rotation.y = z.yaw;
    if (a.downIn > 0 && (a.downIn -= dt) <= 0) b?.coverDown(); // (after a shot: back into cover)
    if (!los) { a.aim = 0; a.sight.visible = false; a.cd = Math.max(a.cd, 0.4); b?.coverDown(); return; }
    if ((a.cd -= dt) > 0) { a.sight.visible = false; if (a.cd < 0.55) b?.coverUp(); return; } // (up out of cover just before he aims)
    b?.coverUp();
    a.aim += dt; // the tell: a red line on Marc for 0.75 s, then the shot
    a.sight.visible = true;
    a.sight.geometry.setFromPoints([new THREE.Vector3(z.x, 1.35, z.z), new THREE.Vector3(p.x, 1.1, p.z)]);
    if (a.aim < 0.75) return;
    a.aim = 0; a.sight.visible = false; a.cd = 1.3 + sim.rand() * 1.1;
    const moving = Math.hypot(p.vx, p.vz) > 1.5, hit = sim.rand() < (moving ? 0.38 : 0.62) * (d < 6 ? 1.2 : 1);
    this.tracer(z.x, z.z, p.x + (hit ? 0 : (sim.rand() - 0.5) * 2), p.z + (hit ? 0 : (sim.rand() - 0.5) * 2));
    this.sound('shot', z.x, z.z, 0.9); b?.fire(); a.downIn = 0.45;
    if (hit) p.hurt(a.leader ? 12 : 9, z.x, z.z, sim);
  }
  // the opening's two (Marc, 2026-10-22: "shoot a couple zombies .. and run both holding something in their hands ... the
  // same holding something in their hand and shooting with the other ... I want them to run off. I don't want to battle them
  // yet"): the story sets a.crew.mode: 'stand' (facing crew.face), 'shoot' (the nearest infected within crew.range, one-handed,
  // two rounds each: the body, then the head; crew.ammo: how many for now), 'run' (down crew.path at crew.speed, then gone).
  // They never turn on Marc.
  crewStep(a, dt, level) {
    const sim = level.sim, z = a.z, b = a.body, C = a.crew;
    z.vx = z.vz = 0; z.hp = Math.max(z.hp, 1);
    if (C.mode === 'gone') return;
    let yaw = C.yaw;
    if (C.mode === 'run') {
      const w = C.path[0];
      if (!w) { C.mode = 'gone'; a.obj.visible = false; if (b?.holder) b.holder.visible = false; if (b?.carry) b.carry.visible = false; return; }
      const dx = w.x - C.x, dz = w.z - C.z, d = Math.hypot(dx, dz), s = C.speed * dt;
      if (d <= s) { C.x = w.x; C.z = w.z; C.path.shift(); } else { C.x += (dx / d) * s; C.z += (dz / d) * s; }
      if (d > 0.05) yaw = Math.atan2(dx, dz);
      if (b && b.pose !== C.run) b.play(C.run, false, 0.3);
    } else {
      let tgt = null, bd = C.range || 14;
      if (C.mode === 'shoot') for (const q of sim.zombies) { if (!q.alive || q.looter) continue; const d = Math.hypot(q.x - C.x, q.z - C.z); if (d < bd) { bd = d; tgt = q; } }
      const f = tgt ? [tgt.x, tgt.z] : C.face;
      if (f) yaw = Math.atan2(f[0] - C.x, f[1] - C.z);
      if (!tgt) { b?.coverDown(); C.cd = Math.max(C.cd || 0, 0.25); }
      else {
        b?.coverUp();
        if ((C.cd = (C.cd ?? 0.3) - dt) <= 0 && !(C.ammo <= 0)) { // (ammo: rounds he may fire for now, the story's pacing; unset: any)
          C.cd = 0.55 + sim.rand() * 0.35; if (C.ammo !== undefined) C.ammo--;
          const dx = tgt.x - C.x, dz = tgt.z - C.z, d = Math.hypot(dx, dz) || 1, head = (tgt.crewHits = (tgt.crewHits || 0) + 1) >= 2;
          this.tracer(C.x + (dx / d) * 0.6, C.z + (dz / d) * 0.6, tgt.x, tgt.z, 1.35); this.sound('shot', C.x, C.z, 0.9); b?.fire();
          tgt.takeHit(head ? 400 : 30, dx / d, dz / d, 2.5, 'pistol', sim, head ? 'Head' : 'torso');
          this.ctx.fx?.bloodHit?.('pistol', tgt.x, head ? 1.6 : 1.2, tgt.z, dx / d, dz / d, head ? 1.5 : 1);
          this.sound(head ? 'bulletHit' : 'zombieHurt', tgt.x, tgt.z, 1);
        }
      }
    }
    // (turned toward where he goes or shoots, quickly but not snapped)
    const dy = Math.atan2(Math.sin(yaw - C.yaw), Math.cos(yaw - C.yaw)); C.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 9);
    z.x = C.x; z.z = C.z; z.yaw = C.yaw;
    a.obj.position.set(C.x, groundY(C.x, C.z), C.z); a.obj.rotation.y = C.yaw; a.sight.visible = false;
  }

  // a warning shot at Marc's feet from a doorway
  warnShot(from, p) { this.tracer(from.x, from.z, p.x + 1.2, p.z + 0.8, 1.5); this.sound('shot', from.x, from.z, 1); this.sound('ricochet', p.x, p.z, 0.8); }

  // ---------------------------------------------------------------- the story's people
  // a story body: the model on its own moves (hood_*), a cross-fade between them; no gun
  storyBody(k) {
    const M = this.storyModels?.[k]; if (!M) return null;
    const m = skClone(M.g.scene); m.scale.setScalar(M.h);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); characterLight(m);
    const obj = new THREE.Group(); obj.add(m);
    const mixer = new THREE.AnimationMixer(m), clips = Object.fromEntries(M.g.animations.map((c) => [c.name, c]));
    let cur = null, curName = '';
    const neck = m.getObjectByName('mixamorigNeck'), head = m.getObjectByName('mixamorigHead');
    // body.look: a point to turn her head to (neck and head share the turn, up to 72 degrees either side of her body), eased
    // in and out over a quarter second; null: back to the move's own head
    const body = { obj, mixer, clips, dead: false, look: null, lookW: 0, lookRel: 0,
      gore: new BodyGore(m, M.h), // (Sophie's arm when the zombies take her: sophie die)
      get clip() { return curName; },
      // play a move (looping unless once; rate: its speed), cross-faded from the last; its length in s
      play(n, { once = false, fade = 0.25, rate = 1 } = {}) {
        const c = clips[n]; if (!c) return 0;
        if (n === curName && !once) { cur.timeScale = rate; return c.duration / rate; }
        const a = mixer.clipAction(c); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once; a.timeScale = rate;
        a.reset().play(); if (cur && cur !== a) cur.crossFadeTo(a, fade, false); cur = a; curName = n;
        return c.duration / rate;
      },
      update(dt) {
        mixer.update(dt); body.gore.update(dt); obj.updateMatrixWorld(true);
        body.lookW += ((body.look && !body.dead ? 1 : 0) - body.lookW) * Math.min(1, dt * 4);
        if (body.lookW < 0.01 || !neck || !head) return;
        if (body.look) { head.getWorldPosition(_v); const y = Math.atan2(body.look.x - _v.x, body.look.z - _v.z) - obj.rotation.y; body.lookRel = Math.max(-1.25, Math.min(1.25, Math.atan2(Math.sin(y), Math.cos(y)))); }
        turnBone(neck, body.lookRel * body.lookW * 0.4); turnBone(head, body.lookRel * body.lookW * 0.6);
      },
      dispose() {},
    };
    return body;
  }

  // Sophie (the user's B03 - B12): unarmed and scared, she never fights and takes no harm (her death is the story's). The
  // story sets her mode: 'scared' (hugging herself where she is, facing Marc), 'follow' (the companion: companion.js, with a.lead
  // when she shows the way), 'goto' (to a.target, then a.after), 'pose' (a.pose, facing a.face), 'dead'. She walks, jogs or
  // sprints as the gap asks.
  sophie(at) {
    const body = this.storyBody('sophie'), obj = body ? body.obj : marker(0xe8c060);
    obj.position.set(at.x, 0, at.z); obj.rotation.y = at.yaw || 0; this.group.add(obj);
    const a = { kind: 'sophie', obj, body, x: at.x, z: at.z, yaw: at.yaw || 0, mode: 'scared', trail: [], speed: 0, gap: 3.3, cower: 0 };
    // (a.tear: what the zombies take as they kill her, as Pete's; hers: one arm)
    a.tear = ['Forearm_R'];
    a.die = () => { a.mode = 'dead'; if (body) body.look = null; body?.play('hood_Death01', { once: true, fade: 0.15 }); if (body) a.tear.forEach((part, i) => { const t = a.yaw + Math.PI * (0.5 + Math.random()); body.gore.sever(part, Math.sin(t), Math.cos(t), 2.2 + i); }); };
    a.step = (dt, level) => this.sophieStep(a, dt, level);
    body?.play('hood_Crouch_Idle_Loop');
    this.list.push(a); return a;
  }
  sophieStep(a, dt, level) {
    const sim = level.sim, p = sim.player, b = a.body;
    if (a.mode === 'dead') return;
    // the way Marc walked (her path round corners and through doorways, never across him)
    const tl = a.trail, last = tl[tl.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.45) { tl.push({ x: p.x, z: p.z }); if (tl.length > 80) tl.shift(); }
    let tx = a.x, tz = a.z, want = 0, face = null;
    // (sent somewhere far while out of his sight: she is there, unseen; the camera shows ~10 m round him)
    const dm0 = Math.hypot(p.x - a.x, p.z - a.z);
    if (a.mode === 'goto' && a.target && dm0 > 16 && Math.hypot(a.target.x - a.x, a.target.z - a.z) > 12 && Math.hypot(a.target.x - p.x, a.target.z - p.z) > 14) {
      const q = { x: a.target.x, z: a.target.z }; sim.world.resolveCircle(q, 0.3); a.x = q.x; a.z = q.z; a.speed = 0;
    }
    if (a.mode !== 'follow') { a.cower = Math.max(0, a.cower - dt * 2); if (b) b.look = null; }   // (a fight's cowering, a lead's glances: not into the story's scenes)
    // (the story's own look: her eyes on something for a while, the case in the glances, in any mode but dead)
    if (a.lookHold && (a.lookHold.t -= dt) <= 0) a.lookHold = null;
    if (a.mode === 'follow') {
      companionStep(a, dt, level, sim);
      a.obj.position.set(a.x, groundY(a.x, a.z), a.z); a.obj.rotation.y = a.yaw;
      // (leading: a glance back over her shoulder at Marc every few seconds as she walks ahead, her eyes on him while she waits)
      const leading = a.cs?.state === 'lead'; a.glance = leading ? (a.glance || 0) + dt : 0;
      // (and, standing by him while he has the case, now and then her eyes go to it a moment too long: the story's three
      // glances are the story's, these the player may or may not catch)
      a.covetT = (a.covetT ?? 9 + Math.random() * 8) - dt;
      if (a.covetT <= 0) { a.covetT = 15 + Math.random() * 10; const cp = level.api.view?.caseObj; if (level.flags.case === 'carried' && cp?.visible && a.speed < 0.3 && !leading && a.cower < 0.2) a.lookHold = { x: cp.position.x, z: cp.position.z, t: 1.4, live: () => cp.position }; }
      if (b) { b.look = a.lookHold ? (a.lookHold.live ? a.lookHold.live() : a.lookHold) : leading && (a.speed < 0.3 || a.glance % 3 > 1.8) ? { x: p.x, z: p.z } : null; this.sophieMoves(a, b); }
      return;
    } else if (a.mode === 'goto' && a.target) {
      tx = a.target.x; tz = a.target.z; const d = Math.hypot(tx - a.x, tz - a.z);
      want = d > 0.3 ? (a.target.run ? (a.sneak ? 2.0 : 4.6) : 1.5) : 0;
      // (no straight line to it: the way Marc walked, round the walls; still stuck after a while and out of his sight, she is
      // there: the camera shows ~10 m round him)
      if (d > 0.3 && !sim.world.lineOfSight(a.x, a.z, tx, tz, 0.5)) { const t = trailPoint(a, sim.world); if (t && Math.hypot(t.x - a.x, t.z - a.z) > 0.6) { tx = t.x; tz = t.z; } }
      const G = a.gotoProg ||= { x: a.x, z: a.z, t: 0 }; G.t += dt;
      if (G.t > 1.5) { const stuck = Math.hypot(a.x - G.x, a.z - G.z) < 0.3 && d > 0.6; a.gotoProg = null;
        if (stuck && (dm0 > 12 || !sim.world.lineOfSight(p.x, p.z, a.x, a.z, 0.9))) { const q = { x: a.target.x, z: a.target.z }; sim.world.resolveCircle(q, 0.3); a.x = q.x; a.z = q.z; a.speed = 0; } }
      if (d <= 0.3) { a.mode = a.after || 'scared'; a.target.done?.(); a.target = null; a.gotoProg = null; }
    } else face = a.face || { x: p.x, z: p.z };
    // move (the world's collision; slow down into the stop)
    a.speed += (want - a.speed) * Math.min(1, dt * 6);
    const d0 = Math.hypot(tx - a.x, tz - a.z);
    if (a.speed > 0.05 && d0 > 0.05) {   // (arrived: no turning toward an empty direction while she slows; the face below)
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, a.speed * dt);
      const q = { x: a.x + (dx / d) * st, z: a.z + (dz / d) * st }; sim.world.resolveCircle(q, 0.28);
      a.x = q.x; a.z = q.z;
      const y = Math.atan2(dx, dz); a.yaw += Math.atan2(Math.sin(y - a.yaw), Math.cos(y - a.yaw)) * Math.min(1, dt * 8);
    } else if (face) { const y = Math.atan2(face.x - a.x, face.z - a.z); a.yaw += Math.atan2(Math.sin(y - a.yaw), Math.cos(y - a.yaw)) * Math.min(1, dt * 4); }
    a.obj.position.set(a.x, groundY(a.x, a.z), a.z); a.obj.rotation.y = a.yaw;
    if (b) { if (a.lookHold && a.mode !== 'dead') b.look = a.lookHold.live ? a.lookHold.live() : a.lookHold; this.sophieMoves(a, b); }
  }
  // her moves, matched to her speed (the walk's rate to the ground she covers: no sliding feet); sneaking (a.sneak: by the
  // horde), a low crouched walk
  sophieMoves(a, b) {
    const v = a.speed;
    if (a.mode === 'pose' && a.pose) { if (!a.poseOnce) b.play(a.pose); else if (b.clip !== a.pose) b.play(a.pose, { once: true, fade: 0.3 }); }   // (once: played through and held at its end)
    else if (a.sneak && v > 0.3 && v < 2.6) b.play('hood_Crouch_Fwd_Loop', { rate: Math.max(0.5, v / 1.3) });
    else if (a.sneak && v <= 0.3) b.play('hood_Crouch_Idle_Loop', { fade: 0.35 });
    else if (v > 3.8) b.play('hood_Sprint_Loop', { rate: v / 5.2 });
    else if (v > 1.9) b.play('hood_Jog_Fwd_Loop', { rate: v / 3.1 });
    else if (v > 0.3) b.play('hood_Walk_Loop', { rate: Math.max(0.35, v / 1.4) });
    else if (a.mode === 'scared' || a.cower > 0.4) b.play('hood_Scared', { fade: 0.35 }); // (Tripo's scared_02: hugging herself, knees in; tools/anim/survivor_feelings.py)
    else b.play(a.idle || 'hood_Idle_Loop', { fade: 0.35 });
  }

  // Pete (B08): the groundskeeper with his pistol on the drive, shooting what comes at him until the story overwhelms him
  pete(at) { const a = this.survivor(at, { gun: 'pistol', model: 'pete' }); a.kind = 'pete'; a.dmgK = 0.15; a.tear = ['Forearm_L']; return a; } // (panicked: he slows them, he cannot stop them; they take his arm)

  // Adam (beat 5, the story reset v3): Sophie's husband in their front yard, his pistol on the infected that came for the
  // shooting, until the story has him bitten: down on his back (hood_IdleToLay), his gun gone from his hand. Then, in Sophie's
  // arms, he turns: his skin goes over to the turned one (turn(k)), he rises (hood_Zombie_Spawn) and goes for her
  // (hood_Zombie_Bite). From the rise he is an entry in the zombie list (one shot of Marc's puts him down; his head goes,
  // as James's); a.onDeath then.
  adam(at) {
    const a = this.survivor(at, { gun: 'pistol', model: 'adam' }); a.kind = 'adam'; a.dmgK = 0.35;
    const body = a.body, base = a.step;
    const U = body ? this.turnSkin(body, TURNED) : { value: 0 };
    a.phase = 'fight';
    a.bitten = () => { if (a.phase !== 'fight') return; a.phase = 'down'; a.down = true; if (body) { body.dead = true; body.deadT = 0; body.play('hood_IdleToLay', { once: true, fade: 0.2 }); } };
    a.turn = (k) => { U.value = Math.max(0, Math.min(1, k)); };
    // where his head lies once he is down (the kneeling shots frame her face over it), and the side of him to kneel on: across
    // his chest from the head-to-hips line, the side nearer Sophie
    const bone = (n) => { const o = body?.model?.getObjectByName('mixamorig' + n); if (!o) return null; o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return { x: e[12], z: e[14] }; };
    a.headAt = () => bone('Head') || { x: a.x, z: a.z };
    a.sideAt = () => { const h = bone('Head'), c = bone('Hips'); if (!h || !c) return null; const ax = h.x - c.x, az = h.z - c.z, s = this.list.find((q) => q.kind === 'sophie'), sx = s ? s.x - h.x : 1, sz = s ? s.z - h.z : 0; const k = -az * sx + ax * sz >= 0 ? 1 : -1; return Math.atan2(-az * k, ax * k); };
    a.rise = (level) => {
      const sim = level.sim; a.phase = 'rise';
      const zb = sim.spawnZombie(null, { x: a.x, z: a.z, yaw: a.yaw, hp: 1 });
      zb.passive = true; zb.speedMul = 0; zb.noView = true; zb.looter = true; zb.dormant = null; a.zb = zb; a.wasAlive = true;
      return body ? body.play('hood_Zombie_Spawn', { once: true, fade: 0.3 }) : 1.5;
    };
    // (at her: he closes the gap to 0.75 m while the bite plays)
    a.lunge = (to) => { a.phase = 'lunge'; a.lungeTo = to; a.yaw = Math.atan2(to.x - a.x, to.z - a.z); a.obj.rotation.y = a.yaw; return body ? body.play('hood_Zombie_Bite', { once: true, fade: 0.15 }) : 0.8; };
    a.step = (dt, level) => {
      if (a.phase === 'fight') return base(dt, level);
      const zb = a.zb; if (!zb) return;
      if (a.phase === 'lunge' && zb.alive && a.lungeTo) {
        const d = Math.min(dt * 1.6, Math.max(0, Math.hypot(a.lungeTo.x - a.x, a.lungeTo.z - a.z) - 0.75));
        a.x += Math.sin(a.yaw) * d; a.z += Math.cos(a.yaw) * d; a.obj.position.set(a.x, groundY(a.x, a.z), a.z);
      }
      if (zb.alive) { zb.x = a.x; zb.z = a.z; zb.vx = zb.vz = 0; return; }
      if (a.wasAlive) {
        a.wasAlive = false; a.phase = 'dead';
        const p = level.sim.player, dx = zb.x - p.x, dz = zb.z - p.z, d = Math.hypot(dx, dz) || 1;
        if (body) { body.gore.headBurst(dx / d, dz / d, 1.2); body.play('hood_Death01', { once: true, fade: 0.1 }); }
        a.onDeath?.();
      }
    };
    return a;
  }

  // James (B02): a looter going through the family's things at the dining table, his back to the door, headphones on. He
  // is an entry in the zombie list (Marc's shots hit him; one is enough); his body is the looters' with his own moves:
  // rummaging (hood_Counter_Idle_Loop), the turn (hood_Surprise), the shout (hood_Counter_Angry), then the gun up at Marc
  // (threat(): he fires after a.fireIn s). Dying: his head goes (the user: "you just shoot his head right off").
  james(level, at) {
    const sim = level.sim, i = LOOTERS.findIndex((q) => q[0] === 'james');
    const z = sim.spawnZombie(null, { x: at.x, z: at.z, yaw: at.yaw || 0, hp: 1 });
    z.passive = true; z.speedMul = 0; z.noView = true; z.looter = true; z.dormant = null;
    const body = this.looterBody(i, true), obj = body ? body.obj : marker(COL.looter);
    obj.position.set(at.x, groundY(at.x, at.z), at.z); obj.rotation.y = at.yaw || 0; this.group.add(obj);
    if (body) { body.gunOn = false; body.play('hood_Counter_Idle_Loop'); }
    const a = { kind: 'looter', james: true, z, obj, body, home: { x: at.x, z: at.z }, yaw: at.yaw || 0, phase: 'rummage', wasAlive: true, fireIn: Infinity, aim: 0,
      get alive() { return z.alive; } };
    a.turn = () => { if (a.phase !== 'rummage') return 0; a.phase = 'turn'; return body ? body.play('hood_Surprise', true, 0.15) : 0.6; };
    a.shout = () => { a.phase = 'shout'; return body ? body.play('hood_Counter_Angry', false, 0.25) : 0; };
    a.headPos = () => { const v = body ? body.neck(_v) : _v.set(z.x, 1.55, z.z); return [v.x, v.y, v.z]; };
    a.threat = (fireIn = 2.5) => { a.phase = 'threat'; a.fireIn = fireIn; if (body) { body.gunOn = true; body.up = false; body.coverUp(); } };
    a.step = (dt, lv) => this.jamesStep(a, dt, lv);
    this.list.push(a); return a;
  }
  jamesStep(a, dt, level) {
    const sim = level.sim, z = a.z, p = sim.player, b = a.body;
    if (!z.alive) {
      if (a.wasAlive) {
        a.wasAlive = false;
        const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz) || 1;
        if (b) { b.gore.headBurst(dx / d, dz / d, 1.2); b.fall(); } // (his head bursts: the looters' head shot, a little harder)
        else { this.ctx.fx?.bloodSpray?.(z.x, 1.55, z.z, dx / d, 0.8, dz / d, 46, 4.2); this.ctx.fx?.bloodPool?.(z.x + dx / d * 0.8, z.z + dz / d * 0.8, 1.1); }
        a.onDeath?.();
      }
      return;
    }
    z.x = a.home.x; z.z = a.home.z; z.vx = z.vz = 0;
    if (a.phase === 'rummage') { z.yaw = a.yaw; }
    else { const y = Math.atan2(p.x - z.x, p.z - z.z); a.yaw += Math.atan2(Math.sin(y - a.yaw), Math.cos(y - a.yaw)) * Math.min(1, dt * 7); z.yaw = a.yaw; }
    a.obj.position.set(z.x, groundY(z.x, z.z), z.z); a.obj.rotation.y = a.yaw;
    if (a.phase === 'threat' && (a.fireIn -= dt) <= 0) { // (he shoots, again and again, until he is put down)
      a.fireIn = 0.9 + sim.rand() * 0.5; b?.fire(); this.sound('shot', z.x, z.z, 1);
      const hit = sim.rand() < 0.7; this.tracer(z.x, z.z, p.x + (hit ? 0 : 0.8), p.z + (hit ? 0 : 0.6));
      if (hit) p.hurt(14, z.x, z.z, sim);
    }
  }

  // (kWorld: the world's time scale, kSubject: a cinematic's subjects', src/hood/cine.js; a.subject marks one)
  update(dt, kWorld = 1, kSubject = 1) {
    for (const a of this.list) a.body?.update(dt * (a.subject ? kSubject : kWorld));
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; if ((t.t -= dt) <= 0) { t.line.removeFromParent(); t.line.geometry.dispose(); this.tracers.splice(i, 1); } }
  }
}
