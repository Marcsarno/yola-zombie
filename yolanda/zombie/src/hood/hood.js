// Chapter 2 (Marc's neighbourhood): start-up and per-frame hooks for the hospital game (combat.html?mode=hood).
// main.js calls startHood() before the first sim is built (the world's collision comes from the Blender export) and
// hood.update() each frame after the camera has moved; every new sim (a start, a retry) gets the chapter's level through
// game.onRestart. Everything else (the player, zombies, combat, sound, HUD, the fixed camera) is the hospital game's own.
// URL: ?mode=hood (from the last checkpoint), &stop=<sneak|house|rescue|gate|club|lot|dock|shed|horde|after|leave>
// (start there), &hood=free (walk the whole map, no story), &hood=grammy (walk Chapter 4's peninsula: blender/grammy/, no story yet).
import * as THREE from 'three';
import { HoodView, useMap } from './view.js';
import { Grass } from './grass.js';
import { HOOD, STAGES, INTERIORS, FLOORS, groundY } from './layout.js';
import { setCutaway, setGroundLight, CUT } from './cutaway.js';
import { LAYOUT } from '../core/layout.js';
import { HoodLevel, STOP_ORDER, loadSave, clearSave } from './level.js';
import { Subtitles } from './subs.js';
import { Voice } from './voice.js';
import { RadioCard } from './radio.js';
import { Cine } from './cine.js';
import { LINES } from './script.js';
import { Actors } from './actors.js';
import { runBot } from './bot.js';
import { Hint } from './hint.js';
import { HoodMusic } from './music.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { characterLight, setCharacterFill, setRim, updateRim } from './charlight.js';
import { fitTextures, useRenderer, TEX_CAP, texStats } from './texfit.js';

const inRect = (r, x, z, m = 0) => { const dx = x - r.cx, dz = z - r.cz, c = Math.cos(r.yaw || 0), s = Math.sin(r.yaw || 0); return Math.abs(dx * c - dz * s) < r.hx + m && Math.abs(dx * s + dz * c) < r.hz + m; };

// golden hour (05_ART_DIRECTION.md: Marc picked it; "keep the low sun but less orange, slightly cool sky fill"), turned so
// the fixed camera (looking north-west) sees lit faces and the shadows fall across the screen, not toward the lens
const SUN_FROM = new THREE.Vector3(-0.55, 0.62, 0.56).normalize(); // (from the west-south-west, 38 deg up)
const SKY = 0xa9b9c4;
const LIGHT_VERSION = '2026-10-22c'; // (bump with every new bake of assets/neighborhood/hood_light.jpg)

export async function startHood({ scene, loader, arena, renderer, quality, params, audio, hud, fx, onProgress }) {
  const grammy = params.get('hood') === 'grammy';
  const free = params.get('hood') === 'free' || grammy;
  HOOD.stage = grammy ? 'grammy' : free ? 'free' : 'home';
  HOOD.map = grammy ? 'grammy' : 'hood'; const MAP = useMap(HOOD.map);
  if (STAGES[HOOD.stage]) LAYOUT.bounds = STAGES[HOOD.stage].bounds;
  arena.group.visible = false; // (the hospital's practice room: not drawn here)
  { const h = document.getElementById('hint'); if (h) { h.classList.add('gone'); h.style.display = 'none'; } } // (the practice room's control notes)
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 38, 90);
  scene.environmentIntensity = 0.7;
  renderer.toneMappingExposure = 1.05;
  if (arena.hemi) { arena.hemi.color.set(0xe4eef6); arena.hemi.groundColor.set(0x9a8c6c); arena.hemi.intensity = 1.6; }
  const sun = arena.sun;
  // the light on the ground is baked (blender/hood/bake_hood.py): the sun only shades faces now, it casts nothing (the
  // characters keep their contact shadows); ?bake=0 brings back the live shadow window to compare
  const baked = params.get('bake') !== '0';
  if (sun) {
    sun.color.set(0xffe6c8); sun.intensity = 3.0;
    if (baked) sun.castShadow = false;
    if (sun.castShadow) { const c = sun.shadow.camera; c.left = -16; c.right = 16; c.top = 16; c.bottom = -16; c.near = 1; c.far = 80; c.updateProjectionMatrix(); sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; }
    sun.position.set(SUN_FROM.x * 40, SUN_FROM.y * 40, SUN_FROM.z * 40); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(true);
  }
  // (the hospital's practice room starts in its red emergency look, which dims these every frame: off here, from this light)
  const outdoor = () => { if (!arena.hemi || !sun) return; if (!arena.em) arena.buildEmergency(); arena.em.base = { sky: arena.hemi.color.clone(), ground: arena.hemi.groundColor.clone(), hemiI: arena.hemi.intensity, sunC: sun.color.clone(), sunI: sun.intensity, env: scene.environmentIntensity }; arena.setEmergency(false, 0); };
  outdoor();
  // (?v=: a new bake must not meet a cached old one; on the dev server every load is fresh)
  const lightV = /localhost|127\.0\.0\.1|^192\.168\./.test(location.hostname) ? Date.now() : LIGHT_VERSION;
  CUT.lmRect.value.set(...MAP.rect);   // (where the map's bake lies: blender/hood/bake_hood.py)
  if (baked) new THREE.TextureLoader().load(MAP.root + MAP.light + '?v=' + lightV, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; t.anisotropy = 4; setGroundLight(t, 1, +(params.get('shade') || 0.42)); renderer.initTexture(t); });
  // the texture budget (texfit.js): what the hospital game has loaded already (Marc, the zombies, the weapons) drawn down
  // now; the map and the survivors as they load, sent up to the GPU and their copies in memory let go; a phone that drops
  // the 3D view gets the page again (the let-go copies cannot be sent up a second time)
  useRenderer(renderer);
  let texSaved = fitTextures(scene, TEX_CAP * 2, false, 'hospital'), texClock = 0;
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  const view = new HoodView(scene);
  await view.load(loader, onProgress);
  HOOD.cols = view.layout.cols; HOOD.marks = view.layout.marks || {};
  if (grammy) {
    // the peninsula: Marc steps off the boat onto the landing at the tip; Chapter 2's rooms and floors are not here; the
    // landing's deck is a floor (0.2 m over the ground)
    const m = HOOD.marks.landing, b = HOOD.marks.boat;
    if (m) LAYOUT.playerStart = { x: m[0], z: m[2], yaw: m[3] };
    LAYOUT.camBounds = STAGES.grammy.cam;
    INTERIORS.length = 0; FLOORS.length = 0;
    if (m && b) { const cx = (m[0] + b[0]) / 2, cz = (m[2] + b[2]) / 2, L = Math.hypot(b[0] - m[0], b[2] - m[2]); FLOORS.push({ id: 'deck', cx, cz, hx: L / 2, hz: 1.3, yaw: -Math.atan2(b[2] - m[2], b[0] - m[0]), y: 0.2, ramp: 0.8 }); }
  }
  // the look pass: tufts in the lawn (grass.js) only with ?grass=1 (Marc, 2026-10-21: "the random grass things sticking up look
  // cheap and take me out of the game"; never on Low quality), a soft vignette at the screen's edges (a page
  // overlay: nothing for the GPU)
  const grass = params.get('grass') !== '1' || quality === 'low' ? null : await new Grass(scene).build(view.splat, view.paths, view.rect).catch((e) => { console.warn('grass', e); return null; });
  if (params.get('vignette') !== '0') { const v = document.createElement('div'); v.className = 'hoodOverlay'; v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;background:radial-gradient(ellipse 85% 75% at 50% 46%, rgba(0,0,0,0) 58%, rgba(20,14,8,0.32) 100%)'; document.body.appendChild(v); }
  // the suppressor (beat 11): Marc's own pistol shots (the game plays them with no position) a soft cough from then on
  if (audio?.play && !audio.hoodWrapped) {
    const play = audio.play.bind(audio); audio.hoodWrapped = true;
    audio.play = (name, ...rest) => {
      if (name === 'shot' && !rest.length && level?.flags.silencer) return play('shot', 0.22);
      return play(name, ...rest);
    };
  }
  // the recorded lines, the radio card with the two faces, the cinematic moments (src/hood/voice.js, radio.js, cine.js)
  const voice = new Voice(audio), radio = new RadioCard(voice), subs = new Subtitles(voice, radio), cine = new Cine(window.game.camera);
  // the chapter's music by story beat (music.js); iOS lets each track start later only once it has played inside a tap
  const music = new HoodMusic(audio);
  if (!free) { const prime = () => { audio.init?.(); music.prime(); if (music.primed) for (const e of ['pointerdown', 'touchend', 'keydown']) removeEventListener(e, prime, true); }; for (const e of ['pointerdown', 'touchend', 'keydown']) addEventListener(e, prime, true); }
  const actors = new Actors(scene, { audio, fx });
  // (the survivors: Eve, Remy, James, Sophie, Bryce. actors.js loads a person's file once for each part they play: the second
  // and third loads take the first one's textures, in the same order in the same file, and their own pictures are let go)
  const firstTex = new Map();
  const texList = (root) => { const l = []; root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m) for (const [k, v] of Object.entries(m)) if (v && v.isTexture) l.push([m, k, v]); }); return l; };
  // (their files from the compressed copies, every picture at most 1024 px: tools/hood/optimize.mjs; the original if missing)
  const svOpt = view.layout?.opt && params.get('opt') !== '0';
  const svLoad = (u) => (svOpt && /^assets\/survivors\/[^/]+\.glb$/.test(u) ? loader.loadAsync(u.replace('assets/survivors/', 'assets/neighborhood/opt/survivors/')).catch(() => loader.loadAsync(u)) : loader.loadAsync(u));
  await actors.loadModels({ loadAsync: (u) => svLoad(u).then((g) => {
    if (!g.scene) return g;
    const l = texList(g.scene), f0 = firstTex.get(u);
    if (!f0) firstTex.set(u, l.map((x) => x[2]));
    else if (f0.length === l.length) l.forEach(([m, k, v], i) => { if (v !== f0[i]) { m[k] = f0[i]; v.source?.data?.close?.(); } });
    texSaved += fitTextures(g.scene, TEX_CAP * 2, true, 'survivors');
    g.parser = null;   // (actors.js keeps the file's scene and animations only: its whole binary would stay alive with the parser)
    return g;
  }) });
  const mk = (n) => { const m = HOOD.marks[n]; return m ? { x: m[0], z: m[2], yaw: m[3] } : null; };
  let level = null, titled = false;
  // a stop asked for in the URL starts there (a test hook); otherwise the last checkpoint, or the start
  const askStop = params.get('stop');
  if (askStop && STOP_ORDER.includes(askStop)) { clearSave(); }
  const firstSave = () => {
    if (!askStop || !STOP_ORDER.includes(askStop)) return loadSave();
    const i = STOP_ORDER.indexOf(askStop), at = (k) => STOP_ORDER.indexOf(k), open = [], flags = {};
    if (i > at('house')) { open.push('home_door'); flags.case = 'carried'; }
    if (i > at('gate')) { open.push('gate'); flags.crowbar = true; flags.batteries = true; flags.called = true; }
    if (i > at('club')) { open.push('clubdoor'); flags.silencer = true; }
    if (i > at('lot')) flags.key = 'sophie';
    if (i > at('dock')) { flags.key = true; flags.case = 'cooler'; }
    if (i > at('shed')) { open.push('shed'); flags.gun = 'shotgun'; flags.gas = 'carried'; }
    if (i > at('horde')) { open.push('dock'); flags.case = 'dead'; }
    if (i > at('after')) flags.case = 'carried';
    return { stop: askStop, flags, open, caseAt: flags.case === 'dead' ? { x: -24.4, z: -79.6, yaw: 0.6 } : null };
  };
  let save = firstSave();
  const api = {
    view, subs, hud, audio, fx, actors, cine, voice, music,
    hero: { script: (n, o) => window.game?.yola?.playScript(n, o), end: () => window.game?.yola?.endScript(),
      scriptState: () => { const S = window.game?.yola?.script; return S ? { name: S.act.getClip().name } : null; } },
    npc: (kind, at, opts) => { const a = actors.survivor(at, opts); level?.npcs.push(a); return a; },
    looters: (lv, given) => {
      if (given) { const L = actors.looters(lv, given); lv.npcs.push(...L); return L; }   // (the story's own spots: the sentries at the start)
      const spots = [{ ...mk('looter_d'), out: true }, { ...mk('looter_c'), out: true }, mk('looter_a'), mk('looter_b'), { ...mk('leader'), leader: true }].filter((s) => s && s.x !== undefined);
      const L = actors.looters(lv, spots); lv.npcs.push(...L);
      return L;
    },
    warnShot: (from, p) => actors.warnShot(from, p),
    rifleOn: () => view.rifleOn(window.game?.yola), rifleOff: () => view.rifleOff(),
    hideHero: (v) => { window.game?.yola?.setShown(!v); if (v) view.radio && (view.radio.visible = false); },
    onStop: (id) => { if (id === 'sneak' && !titled) { titled = true; titleCard(); } else if (STOP_TITLES[id]) hud.banner(STOP_TITLES[id]); },
    onComplete: () => endCard(),
  };
  // the level's view calls that need the game's own objects
  view.rifleOnLevel = api.rifleOn;
  const prevRifle = view.rifleOn.bind(view);
  view.rifleOn = (y) => prevRifle(y || window.game?.yola);
  const garage = mk('garage_light');
  const prevGlow = view.garageLight.bind(view);
  view.garageLight = (on) => prevGlow(on, garage);

  // Chapter 4's peninsula, walked before its beats exist (design/HANDOFF_GRANDMA_PENINSULA.md 7): at the guard gate the two bars
  // lift (the beat will hold them shut through a wave first); at the family car past it, where the chapter will end, a note
  let gateUp = false, carSeen = false;
  const grammyWalk = (px, pz, sim) => {
    const hold = HOOD.marks.gate_hold, car = HOOD.marks.family_car;
    if (!gateUp && hold && Math.hypot(px - hold[0], pz - hold[2]) < 7) {
      gateUp = true; view.openSeal('gate', true, true);
      for (const s of sim.world.shapes) if (s.tag === 'seal:gate') sim.world.setOff(s, true);
      sim.world.updateFlow?.(px, pz); hud.banner?.('The gate lifts');
    }
    if (!carSeen && car && Math.hypot(px - car[0], pz - car[2]) < 4.5) { carSeen = true; hud.banner?.('The family car: Chapter 4 ends here (its beats are still being written)'); }
  };

  // every new simulation (the start, a retry from the checkpoint) gets the chapter
  const attach = (sim) => {
    if (grammy) { gateUp = carSeen = false; view.openSeal('gate', false, false); }
    if (free) return;
    actors.clear(); subs.clear(); cine.stop(); view.radioHand = false; view.radioLow?.(false); if (view.beerObj) view.beerObj.visible = false;
    for (const list of Object.values(view.seals)) for (const s of list) { s.o.position.copy(s.p0); s.o.quaternion.copy(s.q0); }
    for (const k of [...view.pickups.keys()]) view.takePickup(k);
    if (view.gas) { view.gas.visible = false; view.gasRing.visible = false; view.gasMode = null; }
    for (const id of Object.keys(view.seals)) view.openSeal(id, false, false);
    const s = level ? loadSave() : save;
    level = new HoodLevel(sim, api, s);
    if (level.flags.gas && typeof level.flags.gas === 'object') level.setGasDown(level.flags.gas.x, level.flags.gas.z);
    else if (level.flags.gas === 'carried') view.carryGas();
    else if (level.flags.gas === 'boat') view.stowGas();
    if (level.flags.gun === 'rifle') api.rifleOn(); else api.rifleOff();
    view.showCase(level.flags.case === 'fridge' ? 'none' : ['ground', 'dead'].includes(level.flags.case) ? 'ground' : level.flags.case, level.caseAt);
    if (level.flags.case === 'ground' && level.caseAt && level.stop === 'club') level.setCaseDown(level.caseAt);
    if (level.flags.silencer) view.silencerOn?.(window.game?.yola); else if (view.silencer) { view.silencer.removeFromParent(); view.silencer = null; }
    view.showCooler?.(['cooler', 'boat'].includes(level.flags.case));
    sim.level = level; window.hoodLevel = level;
  };
  const prev = window.game?.onRestart;
  const hook = (sim) => { prev?.(sim); attach(sim); };

  let shX = NaN, shZ = NaN;
  // a radio call: Marc takes the walkie-talkie off his belt while he stands, up to his mouth for his lines and down to his
  // chest for Yola's, over his own idle (render/clipchars.js radioArm; the phone-call idle held a phone at the ear, its
  // hand open and his chin up); he puts it back when the call ends or he moves
  let onCall = false, callGun = null;
  const callUp = (on) => {
    const y = window.game?.yola; if (!y || on === onCall) return;
    onCall = on; view.radioHand = on;
    // (his hands free for it: whatever he holds goes away for the call, back after)
    const p = window.game?.sim?.player;
    if (on) { if (p) { callGun = p.desired; p.desired = 'fists'; } }
    else { if (p && callGun && p.owned.includes(callGun)) p.desired = callGun; callGun = null; }
  };
  subs.onLine = (id, isRadio) => { const who = LINES[id]?.[0]; if (isRadio && (who === 'MARC' || who === 'YOLA')) { view.radioTalk = who === 'MARC'; const p = window.game?.sim?.player; if (p && Math.hypot(p.vx || 0, p.vz || 0) < 0.4) callUp(true); } }; // (the radio to his mouth for his own lines, down while Yola talks)
  subs.onQuiet = () => callUp(false);
  const hint = new Hint();
  // ?cinecheck=1: each shot, once its framing has settled, a ray from the lens to what it looks at (and to Marc and Sophie when
  // they are in the frame): anything solid in the way is logged to hood.cineLog (the walls, roofs, trees and cars of the map)
  const cineLog = [], ray = new THREE.Raycaster(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  let lastShot = null;
  const cineCheck = params.get('cinecheck') === '1' ? () => {
    const Q = cine.q; if (!Q || Q.backT >= 0) return;
    const s = Q.shots[Q.i], key = Q.i + ':' + Q.shots.length + ':' + level?.stop + ':' + level?.objective; if (!s || Q.t < (s.move || 0) + 0.05 || lastShot === key) return; lastShot = key;
    const cam = window.game.camera, sp = level?.sophie, p = window.game.sim.player, tgt = [['look', cine.cur.look]];
    if (p) tgt.push(['marc', new THREE.Vector3(p.x, 1.3, p.z)]); if (sp) tgt.push(['sophie', new THREE.Vector3(sp.x, 1.2, sp.z)]);
    const hits = [], lk = cine.cur.look, room = INTERIORS.find((r) => inRect(r.cut || r.rect, lk.x, lk.z) || inRect(r.cut || r.rect, cam.position.x, cam.position.z)), cutY = room ? (room.cineClip ?? room.clipY) : Infinity;   // (inside: what the cutaway takes is not there)
    for (const [n, v] of tgt) {
      _a.copy(cam.position); _b.copy(v).sub(_a); const d = _b.length(); _b.normalize();
      if (n !== 'look') { const ndc = v.clone().project(cam); if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) continue; }
      ray.set(_a, _b); ray.far = d - 0.6; ray.near = 0.05;
      const h0 = ray.intersectObject(view.group, true).find((x) => x.object.visible && x.point.y < cutY && !/terrain|lake|roads|curb|sidewalk|marking|driveway|paver|grass/i.test(x.object.name));
      if (h0) hits.push(n + ' blocked by ' + h0.object.name + ' at ' + h0.distance.toFixed(1) + '/' + d.toFixed(1));
    }
    cineLog.push({ stop: level?.stop, goal: level?.objective, i: Q.i, n: Q.shots.length, cam: cam.position.toArray().map((x) => +x.toFixed(2)), hits });
    if (hits.length) console.warn('cinecheck', level?.stop, Q.i, hits.join('; '));
  } : null;
  // the chapter's start: from black, its title over Marc's yard as the light comes up (the radio call plays under it)
  function titleCard() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:65;pointer-events:none;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f2ead8;font:700 30px system-ui,sans-serif;letter-spacing:.18em;transition:background 2.2s ease, opacity 1.4s ease';
    el.innerHTML = '<div>CHAPTER 2</div><div style="font:600 14px system-ui,sans-serif;letter-spacing:.3em;margin-top:8px;color:#d9b77a">THE NEIGHBOURHOOD</div>';
    document.body.appendChild(el);
    setTimeout(() => { el.style.background = 'rgba(0,0,0,0)'; }, 900);
    setTimeout(() => { el.style.opacity = '0'; }, 3200);
    setTimeout(() => el.remove(), 4800);
  }
  function endCard() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:70;background:rgba(0,0,0,0.55);color:#fff;font:600 16px system-ui,sans-serif;text-align:center';
    el.innerHTML = '<div style="max-width:320px;padding:22px;background:rgba(15,20,24,0.92);border-radius:14px"><div style="font-size:24px;margin-bottom:8px">Chapter 2 complete</div><div style="opacity:.8">Marc is on the water with all four vials. The family is waiting.</div><button style="margin-top:16px;font:600 15px system-ui;padding:9px 16px;border-radius:9px;border:0;background:#3a7;color:#fff">Play again</button></div>';
    el.querySelector('button').onclick = () => { clearSave(); location.search = '?mode=hood'; };
    setTimeout(() => document.body.appendChild(el), 1800);
  }
  // (and once more before the first frame, then every few seconds, for what has joined the scene since)
  texSaved += fitTextures(view.group, TEX_CAP, false, 'map late') + fitTextures(scene, TEX_CAP * 2, false, 'scene late');
  return window.hood = {
    get texSavedMB() { return Math.round(texSaved / 1048576); }, texStats,
    view, subs, actors, voice, radio, cine, music, cineLog, get grass() { return grass; }, get level() { return level; }, onRestart: hook, attach, bot: runBot, CUT,
    charLight: setCharacterFill, rim: setRim, // (the characters' share of the sky light and their rim light: hood/charlight.js)
    // test hook (2026-10-20, the user's texture comparison): character files stood side by side, all on one clip at the same
    // time, facing +z; fill(true) adds a soft studio-like light from +z (it lights the ground too: for comparing only)
    lineup: { list: [], light: null,
      async show(files, { x = 42, z = 38, step = 1.15, h = 1.66, clip = 'pistol_idle' } = {}) {
        for (const q of this.list) q.obj.removeFromParent(); this.list = [];
        const gs = await Promise.all(files.map((f) => loader.loadAsync(f)));
        gs.forEach((g, i) => {
          const m = skClone(g.scene); m.scale.setScalar(h); m.position.set(x + (i - (gs.length - 1) / 2) * step, 0, z);
          m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); scene.add(m); characterLight(m);
          const mixer = new THREE.AnimationMixer(m), c = g.animations.find((a) => a.name === clip) || g.animations[0]; if (c) mixer.clipAction(c).play();
          this.list.push({ obj: m, mixer, file: files[i] });
        });
        return this.list.map((q) => [q.file, q.obj.position.x]);
      },
      fill(on, from = [0, 1.6, 6]) {
        if (!this.light) { this.light = new THREE.DirectionalLight(0xffffff, 1.6); this.amb = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8); scene.add(this.light, this.light.target, this.amb); }
        const c = this.list.length ? this.list[0].obj.position : new THREE.Vector3();
        this.light.position.set(c.x + from[0], from[1], c.z + from[2]); this.light.target.position.set(c.x, 1, c.z); this.light.visible = this.amb.visible = on;
      },
      update(dt) { for (const q of this.list) q.mixer.update(dt); },
    },
    // test hook: the player put at each spot, the camera settled, a capture each, then one contact sheet (zombie/shots/)
    async sheet(spots, out = 'hood_sheet', cols = 4, ticks = 40) {
      const g = window.game, names = [];
      for (const [k, [x, z]] of Object.entries(spots)) { const p = g.sim.player; p.x = p.px = x; p.z = p.pz = z; g.tick(ticks); await g.shot('hood_' + k); names.push('hood_' + k); }
      await g.sheet(names, out, cols, 240); this.sheetDone = out; return out;
    },
    update(dt, px, pz, camera, sim) {
      if ((texClock += dt) > 3) { texClock = 0; texSaved += fitTextures(view.group, TEX_CAP) + fitTextures(scene, TEX_CAP * 2); }
      if (arena.em && (arena.em.target !== 0 || arena.em.k !== 0)) arena.setEmergency(false, 0);
      if (grammy && sim) grammyWalk(px, pz, sim);
      const room = INTERIORS.find((r) => inRect(r.rect, px, pz));
      setCutaway(camera, px, pz, true, room ? { ...(room.cut || room.rect), clipY: room.clipY } : null);
      subs.update(dt); music.update();
      // (during a cinematic moment the people move with the world's slowed time, its subjects at their own)
      actors.update(dt, cine.active ? cine.k : 1, cine.active ? cine.subjectRate : 1);
      if (cine.active && level) for (const n of level.npcs) if (n.subject && n.step) n.step(dt * cine.subjectRate, level);
      view.update(dt, sim); window.hood?.lineup.update(dt); grass?.update(dt, px, pz);
      if (onCall && sim && Math.hypot(sim.player.vx || 0, sim.player.vz || 0) > 0.6) callUp(false);
      hint.update(camera, level, sim, dt);
      // standing on the dock: Yola (and her weapons, which live in the scene), the zombies' views, lifted onto the deck
      const g = window.game, y = g?.yola;
      updateRim(camera, SUN_FROM);
      // the characters' own light (hood/charlight.js): Marc once, each zombie view the first time it shows
      if (y?.model && !y.charLit) { y.charLit = true; characterLight(y.model); }
      if (g?.zviews) for (const v of g.zviews.values()) if (!v.charLit && v.model) { v.charLit = true; characterLight(v.model); }
      if (y?.outer) { const dy = level?.boating ? 0.32 : groundY(y.outer.position.x, y.outer.position.z); if (dy) { for (const o of [y.outer, y.blob, y.pistol, y.shotgun, y.melee, y.shell, y.test?.obj, y.batLib?.obj, y.axeLib?.obj]) if (o) { o.position.y += dy; o.updateMatrixWorld(true); } } }
      view.radioUpdate(y, sim); // (after the lift onto a step or the deck: the radio and the case go with his hands; the polish brief: 18 cm low on the front step)
      // (only the living: their view sets its height every frame; a corpse's is left as it is, a lift would pile up)
      if (g?.zviews && sim) for (const [id, v] of g.zviews) { const o = v.outer; if (!o?.visible) continue; const dy = groundY(o.position.x, o.position.z); if (!dy) continue; const z = sim.zombies.find((q) => q.id === id); if (!z || z.state === 'dead' || z.state === 'dying') continue; o.position.y += dy; if (v.blob) v.blob.position.y = 0.012 + dy; o.updateMatrixWorld(true); }
      for (const a of actors.list) if (a.kind === 'looter' && a.z.alive) { a.obj.position.set(a.z.x, groundY(a.z.x, a.z.z), a.z.z); }
      cine.update(dt, sim); // (last: its camera over the game's)
      if (cineCheck && cine.active) cineCheck();
      if (cine.active) setCutaway(camera, cine.cur.look.x, cine.cur.look.z, true, room ? { ...(room.cut || room.rect), clipY: room.cineClip ?? room.clipY } : null); // (the see-through hole toward what the shot looks at)
      // the sun's shadow window follows the player in 6 m steps (the shadow map is redrawn only then)
      if (sun?.castShadow) {
        const sx = Math.round(px / 6) * 6, sz = Math.round(pz / 6) * 6;
        if (sx !== shX || sz !== shZ) {
          shX = sx; shZ = sz;
          sun.target.position.set(sx, 0, sz); sun.position.set(sx + SUN_FROM.x * 40, SUN_FROM.y * 40, sz + SUN_FROM.z * 40);
          sun.target.updateMatrixWorld(true); sun.updateMatrixWorld(true);
          renderer.shadowMap.needsUpdate = true;
        }
      }
      if (view.anims.length) renderer.shadowMap.needsUpdate = true; // (a seal falling: its shadow moves)
    },
  };
}
const STOP_TITLES = { rescue: 'Help', gate: 'The gate', club: 'The clubhouse', lot: 'The lot', dock: 'The dock', shed: 'The shed', horde: 'The horde' };
