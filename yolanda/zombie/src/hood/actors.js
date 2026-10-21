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
import { groundY } from './layout.js';

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
const STORY = { sophie: 1.66, pete: 1.8 };
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
    const go = (n, once, fade = 0.18) => { const a = act(n, once); if (!a) return; turn.rotation.y = n.startsWith('hood_') ? 0 : aimTurn; if (a === cur) { if (once) a.reset().play(); return; } a.reset().play(); cur.crossFadeTo(a, fade, false); cur = a; }; // (the chapter's own moves face +z as made)
    const body = { obj, mixer, holder, clips, kick: 0, dead: false, deadT: 0, up: false, pose: REST, next: null, nextAt: 0, t: 0, gunOn: true, headGone: false,
      then(at, n) { body.next = n; body.nextAt = body.t + at; }, // (after a one-shot: the pose to settle into)
      play(n, once = false, fade = 0.2) { body.next = null; body.pose = n; go(n, once, fade); return clips[n]?.duration || 0; },
      update(dt) {
        mixer.update(dt); body.t += dt;
        if (body.headGone && head) { head.scale.setScalar(0.001); obj.updateMatrixWorld(true); }
        if (body.next && !body.dead && body.t >= body.nextAt) { const n = body.next; body.next = null; body.pose = n; go(n, false, 0.15); }
        obj.updateMatrixWorld(true);
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
  survivor(at, { gun = 'pistol', model = null } = {}) {
    const body = this.survivorBody(gun, model), obj = body ? body.obj : marker(COL.survivor); obj.position.set(at.x, 0, at.z); obj.rotation.y = at.yaw || 0; this.group.add(obj);
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
      const a = { kind: 'looter', z, obj, body, hp: z.hp, sight, home: { x: s.x, z: s.z }, out: !!s.out, leader: !!s.leader, aim: 0, cd: 1 + sim.rand() * 1.5, wasAlive: true,
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
      if (a.wasAlive) { a.wasAlive = false; b?.fall(); a.onDeath?.(); }
      if (!b) a.obj.rotation.x = Math.min(Math.PI / 2, a.obj.rotation.x + dt * 3);
      return;
    }
    if (z.hp < a.hp) b?.hit(); a.hp = z.hp; // (a hit that does not kill: a flinch, then back to what he was doing)
    z.x = a.home.x; z.z = a.home.z; z.vx = z.vz = 0; // (they hold their cover: the zombie AI never walks them)
    const dx = p.x - z.x, dz = p.z - z.z, d = Math.hypot(dx, dz), los = !p.dead && d < 17 && sim.world.lineOfSight(z.x, z.z, p.x, p.z, 1.3);
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
    const body = { obj, mixer, clips, dead: false,
      get clip() { return curName; },
      // play a move (looping unless once; rate: its speed), cross-faded from the last; its length in s
      play(n, { once = false, fade = 0.25, rate = 1 } = {}) {
        const c = clips[n]; if (!c) return 0;
        if (n === curName && !once) { cur.timeScale = rate; return c.duration / rate; }
        const a = mixer.clipAction(c); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once; a.timeScale = rate;
        a.reset().play(); if (cur && cur !== a) cur.crossFadeTo(a, fade, false); cur = a; curName = n;
        return c.duration / rate;
      },
      update(dt) { mixer.update(dt); obj.updateMatrixWorld(true); },
      dispose() {},
    };
    return body;
  }

  // Sophie (the user's B03 - B12): unarmed and scared, she never fights and takes no harm (her death is the story's). The
  // story sets her mode: 'scared' (crouched where she is, facing Marc), 'follow' (3.3 m behind him along the way he walked;
  // she crouches when they come near unless he gets away from her), 'goto' (to a.target, then a.after), 'pose' (a.pose,
  // facing a.face), 'dead'. She walks, jogs or sprints as the gap asks.
  sophie(at) {
    const body = this.storyBody('sophie'), obj = body ? body.obj : marker(0xe8c060);
    obj.position.set(at.x, 0, at.z); obj.rotation.y = at.yaw || 0; this.group.add(obj);
    const a = { kind: 'sophie', obj, body, x: at.x, z: at.z, yaw: at.yaw || 0, mode: 'scared', trail: [], speed: 0, gap: 3.3, cower: 0 };
    a.die = () => { a.mode = 'dead'; body?.play('hood_Death01', { once: true, fade: 0.15 }); };
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
    // (out of his sight, far behind or far from where she is sent: she catches up unseen, beside the way he came, so a wall
    // between never strands her; the camera shows ~10 m round him)
    const dm0 = Math.hypot(p.x - a.x, p.z - a.z), dest = a.mode === 'goto' && a.target ? a.target : a.mode === 'follow' ? p : null;
    if (dest && dm0 > 16 && Math.hypot(dest.x - a.x, dest.z - a.z) > 12) {
      const back = tl.length > 8 ? tl[tl.length - 8] : null, q = a.mode === 'goto' ? { x: dest.x, z: dest.z } : back ? { x: back.x, z: back.z } : null;
      if (q && Math.hypot(q.x - p.x, q.z - p.z) > (a.mode === 'goto' ? 0 : 3)) { sim.world.resolveCircle(q, 0.3); a.x = q.x; a.z = q.z; a.speed = 0; }
    }
    const near = (x, z, r) => sim.zombies.some((q) => q.alive && !q.looter && Math.hypot(q.x - x, q.z - z) < r);
    if (a.mode === 'follow') {
      // the point a.gap back along the trail from Marc
      let need = a.gap, px = p.x, pz = p.z, found = null;
      for (let i = tl.length - 1; i >= 0; i--) { const d = Math.hypot(tl[i].x - px, tl[i].z - pz); if (d >= need) { const k = need / d; found = { x: px + (tl[i].x - px) * k, z: pz + (tl[i].z - pz) * k }; break; } need -= d; px = tl[i].x; pz = tl[i].z; }
      const dm = Math.hypot(p.x - a.x, p.z - a.z);
      a.cower = (near(a.x, a.z, 6) || near(p.x, p.z, 5)) && dm < 9 ? Math.min(1.5, a.cower + dt) : Math.max(0, a.cower - dt);
      if (found && a.cower <= 0.4) { tx = found.x; tz = found.z; const d = Math.hypot(tx - a.x, tz - a.z); want = d > 6 ? 5.2 : d > 2.2 ? 3.1 : d > 0.35 ? 1.4 : 0; }
      if (dm < 1.4) { want = 0; } // (never in his way)
      face = { x: p.x, z: p.z };
    } else if (a.mode === 'goto' && a.target) {
      tx = a.target.x; tz = a.target.z; const d = Math.hypot(tx - a.x, tz - a.z);
      want = d > 0.3 ? (a.target.run ? 4.6 : 1.5) : 0;
      if (d <= 0.3) { a.mode = a.after || 'scared'; a.target.done?.(); a.target = null; }
    } else face = a.face || { x: p.x, z: p.z };
    // move (the world's collision; slow down into the stop)
    a.speed += (want - a.speed) * Math.min(1, dt * 6);
    if (a.speed > 0.05) {
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, a.speed * dt);
      const q = { x: a.x + (dx / d) * st, z: a.z + (dz / d) * st }; sim.world.resolveCircle(q, 0.28);
      a.x = q.x; a.z = q.z;
      const y = Math.atan2(dx, dz); a.yaw += Math.atan2(Math.sin(y - a.yaw), Math.cos(y - a.yaw)) * Math.min(1, dt * 8);
    } else if (face) { const y = Math.atan2(face.x - a.x, face.z - a.z); a.yaw += Math.atan2(Math.sin(y - a.yaw), Math.cos(y - a.yaw)) * Math.min(1, dt * 4); }
    a.obj.position.set(a.x, groundY(a.x, a.z), a.z); a.obj.rotation.y = a.yaw;
    if (!b) return;
    const v = a.speed;
    if (a.mode === 'pose' && a.pose) b.play(a.pose);
    else if (v > 3.8) b.play('hood_Sprint_Loop', { rate: v / 5.2 });
    else if (v > 1.9) b.play('hood_Jog_Fwd_Loop', { rate: v / 3.1 });
    else if (v > 0.25) b.play('hood_Walk_Loop', { rate: Math.max(0.6, v / 1.4) });
    else if (a.mode === 'scared' || a.cower > 0.4) b.play('hood_Crouch_Idle_Loop', { fade: 0.35 });
    else b.play(a.idle || 'hood_Idle_Loop', { fade: 0.35 });
  }

  // Pete (B08): the groundskeeper with his pistol on the drive, shooting what comes at him until the story overwhelms him
  pete(at) { const a = this.survivor(at, { gun: 'pistol', model: 'pete' }); a.kind = 'pete'; a.dmgK = 0.15; return a; } // (panicked: he slows them, he cannot stop them)

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
        if (b) { b.headGone = true; b.fall(); }
        const n = b ? b.neck(_v) : _v.set(z.x, 1.55, z.z), dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz) || 1;
        this.ctx.fx?.bloodSpray?.(n.x, n.y, n.z, dx / d, 0.8, dz / d, 46, 4.2); this.ctx.fx?.bloodSpray?.(n.x, n.y, n.z, dx / d * 0.4, 1.6, dz / d * 0.4, 22, 2.4);
        this.ctx.fx?.bloodPool?.(z.x + dx / d * 0.8, z.z + dz / d * 0.8, 1.1);
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
