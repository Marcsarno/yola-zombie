// Chapter 2 (Marc's neighbourhood): start-up and per-frame hooks for the hospital game (combat.html?mode=hood).
// main.js calls startHood() before the first sim is built (the world's collision comes from the Blender export) and
// hood.update() each frame after the camera has moved; every new sim (a start, a retry) gets the chapter's level through
// game.onRestart. Everything else (the player, zombies, combat, sound, HUD, the fixed camera) is the hospital game's own.
// URL: ?mode=hood (from the last checkpoint), &stop=<home|curve|gate|club|lot|clubhouse|west|grandma|playground|dock>
// (start there), &hood=free (walk the whole map, no story).
import * as THREE from 'three';
import { HoodView } from './view.js';
import { HOOD, STAGES, INTERIORS, groundY } from './layout.js';
import { setCutaway, setGroundLight, CUT } from './cutaway.js';
import { LAYOUT } from '../core/layout.js';
import { HoodLevel, STOP_ORDER, loadSave, clearSave } from './level.js';
import { Subtitles } from './subs.js';
import { Actors } from './actors.js';
import { runBot } from './bot.js';
import { Hint } from './hint.js';

const inRect = (r, x, z, m = 0) => { const dx = x - r.cx, dz = z - r.cz, c = Math.cos(r.yaw || 0), s = Math.sin(r.yaw || 0); return Math.abs(dx * c - dz * s) < r.hx + m && Math.abs(dx * s + dz * c) < r.hz + m; };

// golden hour (05_ART_DIRECTION.md: Marc picked it; "keep the low sun but less orange, slightly cool sky fill"), turned so
// the fixed camera (looking north-west) sees lit faces and the shadows fall across the screen, not toward the lens
const SUN_FROM = new THREE.Vector3(-0.55, 0.62, 0.56).normalize(); // (from the west-south-west, 38 deg up)
const SKY = 0xa9b9c4;
const LIGHT_VERSION = '2026-10-20c'; // (bump with every new bake of assets/neighborhood/hood_light.jpg)

export async function startHood({ scene, loader, arena, renderer, quality, params, audio, hud, fx, onProgress }) {
  const free = params.get('hood') === 'free';
  HOOD.stage = free ? 'free' : 'home';
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
  if (baked) new THREE.TextureLoader().load('assets/neighborhood/hood_light.jpg?v=' + lightV, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; t.anisotropy = 4; setGroundLight(t, 1, +(params.get('shade') || 0.42)); renderer.initTexture(t); });
  const view = new HoodView(scene);
  await view.load(loader, onProgress);
  HOOD.cols = view.layout.cols; HOOD.marks = view.layout.marks || {};
  // the rifle rides on the shotgun's slot (level.js RIFLE): its shot is a rifle's crack, and there is no pump to rack
  if (audio?.play && !audio.hoodWrapped) {
    const play = audio.play.bind(audio); audio.hoodWrapped = true;
    audio.play = (name, ...rest) => {
      if (level?.flags.rifle) { if (name === 'pump') return; if (name === 'shotgun' || name === 'shotgunClose') return play('shot', ...rest); }
      return play(name, ...rest);
    };
  }
  const subs = new Subtitles();
  const actors = new Actors(scene, { audio });
  const mk = (n) => { const m = HOOD.marks[n]; return m ? { x: m[0], z: m[2], yaw: m[3] } : null; };
  let level = null, titled = false;
  // a stop asked for in the URL starts there (a test hook); otherwise the last checkpoint, or the start
  const askStop = params.get('stop');
  if (askStop && STOP_ORDER.includes(askStop)) { clearSave(); }
  const firstSave = () => {
    if (!askStop || !STOP_ORDER.includes(askStop)) return loadSave();
    const i = STOP_ORDER.indexOf(askStop), open = [], flags = {};
    if (i >= 1) open.push('home'); if (i >= 2) flags.cutters = true; if (i >= 3) open.push('gate');
    if (i >= 1) flags.rifle = true;
    if (i >= 5) flags.gas = 'carried'; if (i >= 6) { flags.keys = true; open.push('clubdoor'); }
    if (i >= 7) { open.push('roadblock', 'dock'); flags.gas = 'boat'; }
    if (i >= 9) flags.lilah = true;
    return { stop: askStop, flags, open };
  };
  let save = firstSave();
  const api = {
    view, subs, hud, audio, fx, actors,
    npc: (kind, at, opts) => { const a = actors.survivor(at, opts); level?.npcs.push(a); return a; },
    looters: (lv) => {
      const spots = [{ ...mk('looter_d'), out: true }, { ...mk('looter_c'), out: true }, mk('looter_a'), mk('looter_b'), { ...mk('leader'), leader: true }].filter((s) => s && s.x !== undefined);
      const L = actors.looters(lv, spots); lv.npcs.push(...L);
      const leader = L.find((q) => q.leader);
      if (leader) leader.onDeath = () => { const k = mk('keys') || leader.home; lv.addPickup({ id: 'keys', x: leader.home.x, z: leader.home.z, r: 1.2, model: 'keys', label: 'The boat keys', onTake: () => { lv.flags.keys = true; } }); void k; };
      return L;
    },
    warnShot: (from, p) => actors.warnShot(from, p),
    companion: () => {}, // (Arianna and Lilah: their models are not made yet; they follow in the story's lines only)
    rifleOn: () => view.rifleOn(window.game?.yola),
    hideHero: (v) => { window.game?.yola?.setShown(!v); if (v) view.radio && (view.radio.visible = false); },
    onStop: (id) => { if (id === 'home' && !titled) { titled = true; titleCard(); } else hud.banner(STOP_TITLES[id] || ''); },
    onComplete: () => endCard(),
  };
  // the level's view calls that need the game's own objects
  view.rifleOnLevel = api.rifleOn;
  const prevRifle = view.rifleOn.bind(view);
  view.rifleOn = (y) => prevRifle(y || window.game?.yola);
  const garage = mk('garage_light');
  const prevGlow = view.garageLight.bind(view);
  view.garageLight = (on) => prevGlow(on, garage);

  // every new simulation (the start, a retry from the checkpoint) gets the chapter
  const attach = (sim) => {
    if (free) return;
    actors.clear(); subs.clear();
    for (const list of Object.values(view.seals)) for (const s of list) { s.o.position.copy(s.p0); s.o.quaternion.copy(s.q0); }
    for (const k of [...view.pickups.keys()]) view.takePickup(k);
    if (view.gas) { view.gas.visible = false; view.gasRing.visible = false; view.gasMode = null; }
    for (const id of Object.keys(view.seals)) view.openSeal(id, false, false);
    const s = level ? loadSave() : save;
    level = new HoodLevel(sim, api, s);
    if (level.flags.gas && typeof level.flags.gas === 'object') level.setGasDown(level.flags.gas.x, level.flags.gas.z);
    else if (level.flags.gas === 'carried') view.carryGas();
    else if (level.flags.gas === 'boat') view.stowGas();
    if (level.flags.rifle) api.rifleOn();
    sim.level = level; window.hoodLevel = level;
  };
  const prev = window.game?.onRestart;
  const hook = (sim) => { prev?.(sim); attach(sim); };

  let shX = NaN, shZ = NaN;
  const hint = new Hint();
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
    el.innerHTML = '<div style="max-width:320px;padding:22px;background:rgba(15,20,24,0.92);border-radius:14px"><div style="font-size:24px;margin-bottom:8px">Chapter 2 complete</div><div style="opacity:.8">Marc, Arianna and Lilah are on the water. Yola is waiting.</div><button style="margin-top:16px;font:600 15px system-ui;padding:9px 16px;border-radius:9px;border:0;background:#3a7;color:#fff">Play again</button></div>';
    el.querySelector('button').onclick = () => { clearSave(); location.search = '?mode=hood'; };
    setTimeout(() => document.body.appendChild(el), 1800);
  }
  return window.hood = {
    view, subs, actors, get level() { return level; }, onRestart: hook, attach, bot: runBot, CUT,
    // test hook: the player put at each spot, the camera settled, a capture each, then one contact sheet (zombie/shots/)
    async sheet(spots, out = 'hood_sheet', cols = 4, ticks = 40) {
      const g = window.game, names = [];
      for (const [k, [x, z]] of Object.entries(spots)) { const p = g.sim.player; p.x = p.px = x; p.z = p.pz = z; g.tick(ticks); await g.shot('hood_' + k); names.push('hood_' + k); }
      await g.sheet(names, out, cols, 240); this.sheetDone = out; return out;
    },
    update(dt, px, pz, camera, sim) {
      if (arena.em && (arena.em.target !== 0 || arena.em.k !== 0)) arena.setEmergency(false, 0);
      const room = INTERIORS.find((r) => inRect(r.rect, px, pz));
      setCutaway(camera, px, pz, true, room ? { ...(room.cut || room.rect), clipY: room.clipY } : null);
      subs.update(dt); actors.update(dt); view.update(dt, sim);
      view.radioUpdate(window.game?.yola, sim);
      hint.update(camera, level, sim, dt);
      // standing on the dock: Yola (and her weapons, which live in the scene), the zombies' views, lifted onto the deck
      const g = window.game, y = g?.yola;
      if (y?.outer) { const dy = level?.boating ? 0.32 : groundY(y.outer.position.x, y.outer.position.z); if (dy) { for (const o of [y.outer, y.blob, y.pistol, y.shotgun, y.melee, y.shell, y.test?.obj, y.batLib?.obj, y.axeLib?.obj]) if (o) { o.position.y += dy; o.updateMatrixWorld(true); } } }
      // (only the living: their view sets its height every frame; a corpse's is left as it is, a lift would pile up)
      if (g?.zviews && sim) for (const [id, v] of g.zviews) { const o = v.outer; if (!o?.visible) continue; const dy = groundY(o.position.x, o.position.z); if (!dy) continue; const z = sim.zombies.find((q) => q.id === id); if (!z || z.state === 'dead' || z.state === 'dying') continue; o.position.y += dy; if (v.blob) v.blob.position.y = 0.012 + dy; o.updateMatrixWorld(true); }
      for (const a of actors.list) if (a.kind === 'looter' && a.z.alive) { a.obj.position.set(a.z.x, 0, a.z.z); }
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
const STOP_TITLES = { home: 'Home', curve: 'The curve', gate: 'The gate', club: 'The club', lot: 'The parking lot', clubhouse: 'The clubhouse', west: 'The roadblock', grandma: "Grandma's", playground: 'The playground', dock: 'The dock' };
