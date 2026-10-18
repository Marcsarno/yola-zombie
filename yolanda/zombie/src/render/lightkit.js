// The lighting upgrades the user picked from the lighting plan (2026-10-18: "i like upgrades a. b. c. d. e. f. g. h.. i like the
// muzzle flash.. the exit sign idea.. what i really like is also testing the light on the zombies eyes"), built as a test
// area in the lighting lab (combat.html?mode=calm&demo=lighting), each switchable on its own:
//   fixtures  C  the room's light as data (WING_LIGHTS): every fitting draws its glow on the floor, all of them in ONE draw
//                call (an instanced mesh; flicker = per-instance colour), with a state: steady, buzz, failing, dead
//   halos     F  a soft halo on every bright thing (tubes, monitors, EXIT signs) instead of a bloom pass
//   exit         EXIT signs over the doors, green, one of them failing; their green on the floor below
//   polish    D  polished vinyl: each lit fitting's reflection streak on the floor (stretched toward the camera, as a real
//                floor reflection is), and a glossier floor finish
//   contact   E  soft contact shadows under every piece of furniture and every body, pushed away from the nearest light
//   room      B  each character takes on the light of the room it stands in (blended as it crosses a doorway)
//   muzzle       a shot lights the wall it hits and the floor at her feet; the shotgun lights the whole room for a moment
//   baked     A  the fittings' light on the floor, baked in Cycles (assets/hospital/wing_floor_light.jpg, stored at half range)
//   yshadow      Yola alone casts a real shadow from one light that follows her; every other caster is switched off
//   eyes         zombies' eyes catch the light: a dim ember in the dark, bright in a pool of light, in the torch, in a shot's flash
// The mood grade and the film finish (G, H) are a screen pass: render/looks.js setMood. Baked light (A): bakeFloor.
import * as THREE from 'three';

export const LIGHTKIT = [ // [key, label, what it is, what it costs] (the lighting lab's switches)
  ['baked', 'A · Baked floor light', 'The fittings\' light baked once in Blender (blender/bake_wing_floor.py): soft pools, furniture shadows, the dead corner dark. Replaces C\'s floor glows (no flicker on the floor).', 'one 123 KB texture, free to draw'],
  ['fixtures', 'C · Light fittings as data', 'Every fitting draws its light on the floor: two in the theatre, the hall, the reception (failing), the lounge (warm, buzzing), the beds (dead). With A on, the bake draws the floor light instead; the tubes themselves show only with "Show the tubes".', 'one draw call for every floor glow'],
  ['halos', 'F · Halos', 'A soft halo on every bright thing: tubes, monitors, EXIT signs (the glow look without a bloom pass).', '~15 sprites'],
  ['exit', 'EXIT signs', 'Green EXIT signs over the doors, one failing; green spilling on the floor under them.', '3 boxes + 3 halos'],
  ['polish', 'D · Polished floor', 'Each lit fitting\'s reflection streaks on the floor toward the camera, and the floor gets a little glossier.', 'glows in the same draw call + material'],
  ['contact', 'E · Contact shadows', 'Soft shadows under every piece of furniture and every body, pushed away from the nearest light.', 'one draw call'],
  ['room', 'B · Room light on characters', 'Yola and the zombies take on the room\'s light: cold in the theatre, warm in the lounge, teal by the beds.', 'free (a colour each)'],
  ['muzzle', 'Muzzle flash light', 'A shot lights the wall it hits and the floor at her feet; the shotgun lights the room.', 'only on shots'],
  ['yshadow', 'Yola\'s shadow', 'Yola alone casts a real shadow from one light that follows her (a small 512 map, redrawn each frame with only her and her weapon in it). Nothing else casts: the room\'s shadows are baked.', '1 small shadow pass (her mesh only)'],
  ['eyes', 'Zombie eyes', 'Their eyes catch the light: an ember in the dark, bright in a light pool, in the torch, in a shot\'s flash.', '2 sprites per zombie'],
];
// the practice room's light brief (core/layout.js wing: the theatre z -11..-5, the hall below it). k: brightness on the floor
export const WING_LIGHTS = {
  rooms: [ // the light a character takes on in each area (B); the first that contains it wins
    { id: 'theatre', rect: [-7.3, 7.3, -11.3, -5.05], col: 0x9cc0ff, k: 0.16 },
    { id: 'lounge', rect: [-7.3, -1.6, 4.6, 11.3], col: 0xffb06a, k: 0.17 },
    { id: 'beds', rect: [3.2, 7.3, 3.0, 11.3], col: 0x7fe8d0, k: 0.14 },
    { id: 'hall', rect: [-7.3, 7.3, -5.05, 11.3], col: 0xc4ccd6, k: 0.07 },
  ],
  fixtures: [ // tube: a ceiling tube (bar + floor glow + halo + floor streak); state: steady | buzz | failing | dead
    { kind: 'tube', x: -3.2, z: -8.2, col: 0xdbe8ff, k: 0.55, state: 'steady' },
    { kind: 'tube', x: 3.2, z: -8.2, col: 0xdbe8ff, k: 0.55, state: 'buzz' },
    { kind: 'tube', x: 2.9, z: -0.6, col: 0xe6f0ff, k: 0.5, state: 'failing' },
    { kind: 'tube', x: -0.6, z: 4.4, col: 0xe6f0ff, k: 0.48, state: 'steady' },
    { kind: 'tube', x: -4.6, z: 8.4, col: 0xffd9a8, k: 0.55, state: 'buzz' },
    { kind: 'tube', x: 5.4, z: 6.8, col: 0xdbe8ff, k: 0.48, state: 'dead' },
  ],
  exits: [ // over the doors, on the wall's room face; dir: the way the sign faces
    { x: -4.4, z: -10.95, yaw: 0, state: 'steady' }, { x: 4.2, z: -10.95, yaw: 0, state: 'failing' }, { x: -6.95, z: 1.8, yaw: Math.PI / 2, state: 'steady' },
  ],
};

const glowTex = (() => { let t = null; return () => {
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (t = new THREE.CanvasTexture(c));
}; })();
const shadowTex = (() => { let t = null; return () => {
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (t = new THREE.CanvasTexture(c));
}; })();
const streakTex = (() => { let t = null; return () => { // D's reflection: bright where the tube's image sits, tapering toward the camera, soft at the sides
  if (t) return t;
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const g = c.getContext('2d'), im = g.createImageData(32, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) {
    const a = y / 127, u = (x - 15.5) / 15.5, along = Math.min(1, a / 0.08) * Math.pow(1 - a, 1.05), across = Math.exp(-u * u * 4 * (1 + 0.6 * a)), i = (y * 32 + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * along * across);
  }
  g.putImageData(im, 0, 0); return (t = new THREE.CanvasTexture(c));
}; })();
const exitTex = () => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48; const g = c.getContext('2d');
  g.fillStyle = '#0d6b2c'; g.fillRect(0, 0, 128, 48); g.fillStyle = '#d9ffe4'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 58, 25);
  g.beginPath(); g.moveTo(104, 16); g.lineTo(118, 24); g.lineTo(104, 32); g.closePath(); g.fill(); // (the arrow)
  return new THREE.CanvasTexture(c);
};
const FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const BAKE = { url: 'assets/hospital/wing_floor_light.jpg', x0: -7.6, x1: 7.6, z0: -11.6, z1: 11.6, k: 2.2, fill: 0.3 }; // (the bake's bounds: blender/bake_wing_floor.py; k: its strength, fill: the room's general light with it on, tuned by eye in the lab)
const YSH = { map: 512, half: 1.6, off: [-2.8, 5.5, -0.8], dark: 0.55, min: 0.55 }; // (Yola's shadow: map size, the window's half width (m), the light's place from her (the shadow falls the other way: to her right, a little toward the camera), how dark it is)
const CHAR = { base: 0.9, floor: 0.4 }; // (characters under A: their own ambient light = slider x base x (floor + the bake's light where they stand))
const DIM = 0.55; // the room's general light with the fittings on (they light the floor themselves)
const flick = (state, t, seed, S) => { // a fitting's brightness this frame (S: its own failing state)
  if (state === 'buzz') return 0.88 + 0.12 * Math.sin(t * 120 + seed) * Math.sin(t * 7.3 + seed);
  if (state === 'dead') return Math.random() < 0.006 ? 0.5 : 0;
  if (state === 'failing') {
    if (S.off > 0) { S.off -= 1 / 60; return Math.random() < 0.15 ? 0.6 : 0.02; }
    if (Math.random() < 0.015) S.off = Math.random() < 0.25 ? 0.6 + Math.random() * 1.2 : 0.08 + Math.random() * 0.18;
    return 1;
  }
  return 1;
};

export class LightKit {
  constructor(scene, fx, arena, camYaw) {
    this.scene = scene; this.fx = fx; this.arena = arena; this.camYaw = camYaw; this.on = {}; this.t = 0; this.built = {};
    this.root = new THREE.Group(); this.root.name = 'lightkit'; scene.add(this.root);
    this.flashK = 0; this.flashX = 0; this.flashZ = 0; this.flashR = 0; // (the last shot's light: muzzle, eyes)
  }
  set(key, v) {
    v = !!v; if (this.on[key] === v) return; this.on[key] = v;
    if (!v && !this.built[key]) return; // (never built: nothing to switch off)
    if (v && !this.built[key]) { this.built[key] = true; this['build_' + key]?.(); }
    this['toggle_' + key]?.(v);
  }

  // ---- the shared floor glows: one instanced mesh for every fitting's pool, every streak, every sign's spill ----
  glows() {
    if (this.G) return this.G;
    const max = 64, mesh = new THREE.InstancedMesh(FLAT, new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.renderOrder = 2; mesh.frustumCulled = false;
    mesh.setColorAt(0, new THREE.Color(0)); this.root.add(mesh);
    this.G = { mesh, items: [], m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color() };
    return this.G;
  }
  addGlow(x, z, sx, sz, yaw, col, owner) { const G = this.glows(); const it = { x, z, sx, sz, yaw, col: new THREE.Color(col), k: 0, owner, i: G.items.length }; G.items.push(it); G.mesh.count = G.items.length; this.placeGlow(it); return it; }
  placeGlow(it) { const G = this.G; G.p.set(it.x, 0.026, it.z); G.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw); G.s.set(it.sx, 1, it.sz); G.m.compose(G.p, G.q, G.s); G.mesh.setMatrixAt(it.i, G.m); G.mesh.instanceMatrix.needsUpdate = true; }
  tickGlows() {
    const G = this.G; if (!G) return;
    for (const it of G.items) { const on = this.on[it.owner]; G.c.copy(it.col).multiplyScalar(on ? it.k : 0); G.mesh.setColorAt(it.i, G.c); }
    if (G.mesh.instanceColor) G.mesh.instanceColor.needsUpdate = true;
  }

  // ---- C: the fittings ----
  // the fittings themselves (2026-10-18, the user: keep the polished floor, "we don't need to actually show the light fixtures
  // on the ceiling"): their places and flicker always run once anything uses them (C's pools, D's streaks, the halos, the
  // eyes); the tube bars show only with the lab's "Show the tubes" (this.tubes)
  fittings() {
    if (this.fix) return this.fix;
    return (this.fix = WING_LIGHTS.fixtures.map((f, i) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.04, 0.16), new THREE.MeshBasicMaterial({ color: f.col, transparent: true, toneMapped: false }));
      bar.position.set(f.x, 2.6, f.z); bar.visible = !!this.tubes; this.root.add(bar);
      return { ...f, bar, pool: this.addGlow(f.x, f.z, 4.6, 4.6, 0, f.col, 'fixtures'), seed: i * 13.7, S: { off: 0 }, b: 1 };
    }));
  }
  setTubes(v) { this.tubes = !!v; for (const F of this.fittings()) F.bar.visible = this.tubes; }
  build_fixtures() { this.fittings(); }
  // the fittings carry the room's light: the general fill and the sun come down (arena.lightScale), the pools stand out
  toggle_fixtures() { this.fill(); }
  fill() { if (this.arena) { this.arena.lightScale = this.on.baked ? BAKE.fill : this.on.fixtures ? DIM : 1; this.arena.coldOff = !!this.on.baked; } } // (A: the bake draws the rooms' light; the emergency look's cold pools would double it)

  // ---- A: the baked floor light: a lightMap on the wing's floors, uv1 from world x / z across the bake's bounds ----
  build_baked() {
    const O = this.arena?.ob; if (!O) return;
    this.bakeTex = new THREE.TextureLoader().load(BAKE.url); this.bakeTex.colorSpace = THREE.SRGBColorSpace; this.bakeTex.channel = 1;
    this.bakeFloors = [];
    for (const m of O.meshes) {
      const g = m.geometry, p = g.attributes.position; if (!g.isBufferGeometry || m.userData.bakeMat || Math.abs(p.getY(0)) > 0.01 || g.boundingBox?.max.y > 0.01) continue;
      let flat = true; for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i)) > 0.01) { flat = false; break; } if (!flat) continue;
      const uv1 = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv1[i * 2] = (p.getX(i) - BAKE.x0) / (BAKE.x1 - BAKE.x0); uv1[i * 2 + 1] = 1 - (p.getZ(i) - BAKE.z0) / (BAKE.z1 - BAKE.z0); }
      g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
      const bm = m.material.clone(); bm.lightMap = this.bakeTex; bm.lightMapIntensity = BAKE.k;
      m.userData.bakeMat = bm; m.userData.liveMat = m.material; this.bakeFloors.push(m);
    }
  }
  // the bake cannot flicker: under each buzzing / failing fitting a soft dark patch takes the light back off the floor
  // as the tube dips (normal blending, black, opacity = the light lost)
  bakeDips() {
    if (this.dips) return this.dips;
    this.dips = this.fittings().filter((F) => F.state === 'buzz' || F.state === 'failing').map((F) => {
      const m = new THREE.Mesh(FLAT, new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
      m.position.set(F.x, 0.022, F.z); m.scale.set(6.2, 1, 6.2); m.renderOrder = 1; m.visible = false; this.root.add(m); return { F, m };
    });
    return this.dips;
  }
  // the bake's light at a point (0 dark .. ~2 under a tube), read from the image itself (stored at half range, sRGB)
  bakeAt(x, z) {
    const im = this.bakeTex?.image; if (!im || !im.width) return 0.5;
    if (!this.bakePx) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); this.bakePx = { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; }
    const B = this.bakePx, u = Math.min(B.w - 1, Math.max(0, Math.round(((x - BAKE.x0) / (BAKE.x1 - BAKE.x0)) * (B.w - 1)))), v = Math.min(B.h - 1, Math.max(0, Math.round(((z - BAKE.z0) / (BAKE.z1 - BAKE.z0)) * (B.h - 1))));
    return Math.pow(B.d[(v * B.w + u) * 4] / 255, 2.2) * 2;
  }
  // the characters under A: the bake lights the floor, not them, and A turns the room's fill down to 0.3; each one takes its
  // own share of the room's soft ambient light (its materials hold the scene's environment map, so their intensity is
  // their own) from the lab's "Character light" slider and the baked light where it stands
  setCharLight(v) { this.charK = v; }
  charMats(root) {
    this.charCache ??= new WeakMap(); let L = this.charCache.get(root);
    if (!L) { L = []; root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial && !L.includes(m)) L.push(m); }); this.charCache.set(root, L); }
    return L;
  }
  lightChars(views, yv, p) {
    const env = this.scene.environment, k = this.charK ?? 1; if (!env) return;
    this.charLit ??= new Set();
    const put = (root, x, z) => { if (!root) return; const I = k * CHAR.base * (CHAR.floor + Math.min(1.3, this.bakeAt(x, z))); for (const m of this.charMats(root)) { if (m.envMap !== env) { m.userData.env0 = m.envMap; m.envMap = env; m.needsUpdate = true; this.charLit.add(m); } m.envMapIntensity = I; } };
    for (const v of views) if (v.view?.outer) put(v.view.outer, v.z.x, v.z.z);
    if (yv && p) for (const g of this.yshGear(yv)) put(g, p.x, p.z);
  }
  unlightChars() { for (const m of this.charLit || []) { m.envMap = m.userData.env0 ?? null; m.envMapIntensity = 1; m.needsUpdate = true; } this.charLit?.clear(); }
  toggle_baked(v) {
    if (!v) this.unlightChars();
    for (const d of this.bakeDips()) d.m.visible = v;
    for (const m of this.bakeFloors || []) { const L = m.userData.liveMat, B = m.userData.bakeMat; if (v) { B.roughness = L.roughness; B.envMapIntensity = L.envMapIntensity; } m.material = v ? B : L; }
    this.fill(); // (the bake carries the floor's light: the fill comes down further)
  }

  // the bake's input (dev only): every static opaque mesh over the wing as world triangles, the bounds, the fittings and the
  // EXIT signs, posted to shots/wing_bake_scene.json for blender/bake_wing_floor.py. Run game.lightkit.exportBake() in the lab
  // with no characters' props near (the wheelchair and the drip stand would bake in)
  async exportBake(extra = []) { // extra: more roots to leave out (main passes the loose drip stands and wheelchairs)
    const skip = new Set(); for (const r of [...(this.lastYola ? this.yshGear(this.lastYola) : []), ...(this.lastViews || []).map((v) => v.view?.outer), ...extra]) r?.traverse?.((o) => skip.add(o)); // (Yola, her weapons, the zombies: never baked)
    const out = [], V = new THREE.Vector3(); this.scene.updateMatrixWorld(true);
    this.scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || skip.has(o)) return;
      for (let q = o; q; q = q.parent) if (!q.visible) return;
      if ([].concat(o.material).some((m) => m.transparent || m.blending !== THREE.NormalBlending || m.isMeshBasicMaterial)) return;
      const g = o.geometry; g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (bb.max.x < BAKE.x0 || bb.min.x > BAKE.x1 || bb.max.z < BAKE.z0 || bb.min.z > BAKE.z1) return;
      const P = g.attributes.position, I = g.index, n = I ? I.count : P.count, f = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { V.fromBufferAttribute(P, I ? I.getX(k) : k).applyMatrix4(o.matrixWorld); f[k * 3] = V.x; f[k * 3 + 1] = V.y; f[k * 3 + 2] = V.z; }
      const u8 = new Uint8Array(f.buffer); let str = ''; for (let k = 0; k < u8.length; k += 8192) str += String.fromCharCode.apply(null, u8.subarray(k, k + 8192));
      out.push({ name: o.name || o.parent?.name || 'mesh', floor: bb.max.y < 0.02, tris: btoa(str) });
    });
    const data = { bounds: { x0: BAKE.x0, x1: BAKE.x1, z0: BAKE.z0, z1: BAKE.z1 }, meshes: out,
      fixtures: WING_LIGHTS.fixtures.map(({ x, z, k, state, col }) => ({ x, z, k, state, col })), exits: WING_LIGHTS.exits.map(({ x, z }) => ({ x, z })) };
    const r = await fetch('/__shot/wing_bake_scene.json', { method: 'POST', body: JSON.stringify(data) });
    return { status: r.status, meshes: out.length };
  }

  // ---- Yola's shadow: one light, one small map, only her (and what she holds) in it ----
  build_yshadow() {
    // the light gives no light (the room keeps its look; a shadow could not darken the baked floor anyway): it only casts,
    // and a shadow catcher under her (ShadowMaterial: transparent but for the shadow) shows it at YSH.dark
    const L = (this.ysh = new THREE.DirectionalLight(0xffffff, 1e-4)); L.castShadow = true; L.userData.notSun = true; // (the lab's looks leave it alone: they resize the sun's map)
    L.shadow.mapSize.set(YSH.map, YSH.map); const c = L.shadow.camera; c.left = c.bottom = -YSH.half; c.right = c.top = YSH.half; c.near = 0.5; c.far = 12;
    L.shadow.bias = -0.0015; L.shadow.normalBias = 0.03; L.shadow.radius = 4; L.visible = false;
    this.scene.add(L, L.target);
    const C = (this.yshCatch = new THREE.Mesh(new THREE.PlaneGeometry(YSH.half * 2, YSH.half * 2).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: 0x06080b, opacity: YSH.dark, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
    C.receiveShadow = true; C.renderOrder = 1; C.visible = false; this.root.add(C);
  }
  toggle_yshadow(v) {
    const r = this.arena?.renderer, sun = this.arena?.sun; if (!r) return;
    this.ysh.visible = v; this.yshCatch.visible = v;
    if (v) { // (the sun stops casting; the renderer's shadows come on if the lab's "Real shadows" had them off)
      this.yshWas = { sun: sun?.castShadow, enabled: r.shadowMap.enabled };
      if (sun) sun.castShadow = false;
      if (!r.shadowMap.enabled) r.shadowMap.enabled = true;
      this.yshScanT = 0;
    } else {
      for (const o of this.yshOff || []) o.castShadow = true; this.yshOff = null;
      if (sun && this.yshWas) sun.castShadow = this.yshWas.sun;
      if (this.yshWas) r.shadowMap.enabled = this.yshWas.enabled;
      if (this.yolaBlob) this.yolaBlob.visible = true;
    }
    this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); // (one light more or less: the shaders rebuild once)
    r.shadowMap.needsUpdate = true;
  }
  yshGear(yv) { return [yv.outer, yv.pistol, yv.shotgun, yv.melee, yv.shell, yv.test?.obj, yv.batLib?.obj, ...Object.values(yv.libHolds || {}).map((h) => h?.obj)].filter(Boolean); }
  tickYShadow(dt, p, yv) {
    const r = this.arena.renderer;
    if (!r.shadowMap.enabled) { this.yshCatch.visible = false; if (yv.blob) yv.blob.visible = true; return; } // (the Performance look: no shadows at all; her blob comes back)
    this.yshCatch.visible = true;
    if ((this.yshScanT -= dt) <= 0) { // (every second: anything new that casts (zombies, gibs, props) is switched off; hers on)
      this.yshScanT = 1; const mine = new Set(); for (const g of this.yshGear(yv)) g.traverse((o) => mine.add(o));
      this.yshOff ??= [];
      this.scene.traverse((o) => { if (!o.isMesh && !o.isSkinnedMesh) return; if (mine.has(o)) { o.castShadow = true; return; } if (o.castShadow) { o.castShadow = false; this.yshOff.push(o); } });
    }
    // the light it falls from: the nearest lit fitting (as if the tube itself cast it: short right under one, longer away from
    // it), eased so it swings round as she walks; out of every fitting's reach, a faint one from the fixed direction
    let best = null, bd = 1e9; for (const F of this.fittings()) { if (F.b < 0.2) continue; const d = Math.hypot(F.x - p.x, F.z - p.z); if (d < bd) { bd = d; best = F; } }
    let ox = YSH.off[0], oz = YSH.off[2], oy = YSH.off[1], k = YSH.min; // (never fainter than YSH.min: a faint one reads as no shadow at all)
    if (best && bd < 6.5) {
      const d = Math.max(0.45, Math.min(2.4, bd)), ux = (best.x - p.x) / (bd || 1), uz = (best.z - p.z) / (bd || 1);
      ox = ux * d; oz = uz * d; oy = 2.6 - 0.1; k = Math.max(YSH.min, best.b * Math.min(1, 1 - (bd - 2.2) / 4.3));
    }
    const S = (this.yshS ??= { x: ox, y: oy, z: oz, k }), e = Math.min(1, dt * 3);
    S.x += (ox - S.x) * e; S.y += (oy - S.y) * e; S.z += (oz - S.z) * e; S.k += (k - S.k) * Math.min(1, dt * 6);
    const len = Math.hypot(S.x, S.z) || 1, cx = p.x - (S.x / len) * Math.min(0.7, len * 0.3), cz = p.z - (S.z / len) * Math.min(0.7, len * 0.3); // (the window leans the way the shadow falls)
    const L = this.ysh, t = YSH.half * 2 / YSH.map, x = Math.round(cx / t) * t, z = Math.round(cz / t) * t; // (snapped to the map's texels: no shimmer as she walks)
    const sc = 5.5 / Math.hypot(S.x, S.y, S.z); // (the light kept ~5.5 m off along that direction)
    L.target.position.set(x, 0, z); L.position.set(x + S.x * sc, S.y * sc, z + S.z * sc); L.target.updateMatrixWorld(); L.updateMatrixWorld();
    this.yshCatch.position.set(x, 0.014, z); this.yshCatch.material.opacity = YSH.dark * S.k;
    if (yv.blob) { this.yolaBlob = yv.blob; yv.blob.visible = false; } // (the real shadow replaces her blob)
    r.shadowMap.needsUpdate = true;
  }

  // ---- F: halos on bright things ----
  halo(col, size, x, y, z) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.set(size, size, 1); s.position.set(x, y, z); this.root.add(s); return s; }
  build_halos() {
    this.halos = [];
    for (const F of this.fittings()) { const s = this.halo(F.col, 1.1, F.x, 2.58, F.z); s.scale.set(1.9, 0.55, 1); this.halos.push({ s, F, base: 0.6 }); }
    this.monSeen = new Set(); this.scanMonitors();
  }
  scanMonitors() { // the live screens' faces (render/screens.js): they appear once their models have loaded, so looked for again now and then
    if (!this.screensMat) return; const faces = []; this.scene.traverse((o) => { if (o.isMesh && o.material === this.screensMat && !this.monSeen.has(o)) faces.push(o); });
    for (const f of faces) { this.monSeen.add(f); const p = f.getWorldPosition(new THREE.Vector3()); const H = { s: this.halo(0x8fe8ff, 0.7, p.x, p.y, p.z), base: 0.32, mon: true }; H.s.visible = !!this.on.halos; this.halos.push(H); }
  }
  toggle_halos(v) { for (const H of this.halos || []) H.s.visible = v; }

  // ---- EXIT signs ----
  build_exit() {
    const tex = exitTex();
    this.exits = WING_LIGHTS.exits.map((e, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.17, 0.05), [0, 0, 0, 0, 1, 1].map((k) => (k ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }) : new THREE.MeshBasicMaterial({ color: 0x1d2a22 }))));
      m.position.set(e.x, 2.36, e.z); m.rotation.y = e.yaw; this.root.add(m);
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      const halo = this.halo(0x3cff7a, 0.9, e.x + fx * 0.05, 2.36, e.z + fz * 0.05); halo.scale.set(1.1, 0.55, 1);
      return { ...e, m, halo, spill: this.addGlow(e.x + fx * 0.9, e.z + fz * 0.9, 2.4, 2.4, 0, 0x2bff6a, 'exit'), seed: i * 5.1, S: { off: 0 } };
    });
  }
  toggle_exit(v) { for (const E of this.exits || []) E.m.visible = E.halo.visible = v; }

  // ---- D: polished floor ----
  build_polish() { // a reflection streak per fitting: from below it toward the camera, long and thin, brightest under the tube
    const cy = (this.camYaw * Math.PI) / 180, tx = Math.sin(cy), tz = Math.cos(cy), fix = this.fittings();
    const mesh = (this.streakMesh = new THREE.InstancedMesh(FLAT, new THREE.MeshBasicMaterial({ map: streakTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), fix.length));
    const M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cy);
    fix.forEach((F, i) => { M.compose(new THREE.Vector3(F.x + tx * 1.2, 0.027, F.z + tz * 1.2), q, new THREE.Vector3(0.62, 1, 3.8)); mesh.setMatrixAt(i, M); mesh.setColorAt(i, new THREE.Color(0)); });
    mesh.renderOrder = 2; mesh.frustumCulled = false; this.root.add(mesh);
    this.streaks = fix.map((F, i) => ({ F, i }));
  }
  toggle_polish(v) {
    const O = this.arena?.ob; if (!O?.floor) return;
    for (const m of Object.values(O.floor)) { if (m.userData.r0 == null) m.userData.r0 = m.roughness; m.roughness = v ? Math.max(0.28, m.userData.r0 - 0.3) : m.userData.r0; m.envMapIntensity = v ? 1.6 : 1; m.needsUpdate = true; }
    for (const fm of this.bakeFloors || []) { const B = fm.userData.bakeMat, L = fm.userData.liveMat; B.roughness = L.roughness; B.envMapIntensity = L.envMapIntensity; } // (A's own copies of the floor take the gloss too, whichever was ticked first)
    if (this.streakMesh) this.streakMesh.visible = v;
  }

  // ---- E: contact shadows ----
  build_contact() {
    const props = []; this.arena?.group?.traverse((o) => { if (o.userData?.prop && o.parent?.userData?.prop !== true) props.push(o); });
    const boxes = [];
    for (const o of props) { const b = new THREE.Box3().setFromObject(o); if (!isFinite(b.min.x) || b.min.y > 0.35 || b.max.y - b.min.y < 0.25) continue; boxes.push(b); } // (standing furniture, not wall-hung things)
    const mesh = new THREE.InstancedMesh(FLAT, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex(), transparent: true, opacity: 0.5, depthWrite: false }), Math.max(1, boxes.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    boxes.forEach((b, i) => {
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, h = b.max.y - b.min.y, [dx, dz] = this.awayFromLight(cx, cz);
      p.set(cx + dx * h * 0.12, 0.014, cz + dz * h * 0.12); s.set((b.max.x - b.min.x) * 1.25 + 0.2, 1, (b.max.z - b.min.z) * 1.25 + 0.2); m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
    });
    mesh.renderOrder = 1; this.root.add(mesh); this.contact = mesh;
  }
  toggle_contact(v) { if (this.contact) this.contact.visible = v; if (!v) for (const b of this.blobs || []) b.blob.scale.set(1, 1, 1); }
  awayFromLight(x, z) { // a unit vector from the nearest lit fitting through (x, z) (the way its shadow falls)
    let best = null, bd = 1e9; for (const F of WING_LIGHTS.fixtures) { if (F.state === 'dead') continue; const d = Math.hypot(x - F.x, z - F.z); if (d < bd) { bd = d; best = F; } }
    if (!best || bd < 1e-3) return [0, 0]; return [(x - best.x) / bd, (z - best.z) / bd];
  }

  // ---- B: the room's light on the characters ----
  roomAt(x, z) { for (const r of WING_LIGHTS.rooms) { const [x0, x1, z0, z1] = r.rect; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r; } return null; }

  // the light at a point (for the zombies' eyes): the fittings' pools, the shot's flash, the torch if Yola's is on
  lightAt(x, z) {
    let L = 0;
    if ((this.on.fixtures || this.on.baked) && this.fix) for (const F of this.fix) { const d = Math.hypot(x - F.x, z - F.z); if (d < 2.6) L += F.b * (1 - d / 2.6) * 0.9; }
    if (this.flashK > 0) { const d = Math.hypot(x - this.flashX, z - this.flashZ); if (d < this.flashR) L += this.flashK * (1 - d / this.flashR) * 1.6; }
    if (this.torch) { const t = this.torch, dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz); if (d > 0.3 && d < 6.5 && (dx * t.fx + dz * t.fz) / d > 0.9) L += 1.4 * (1 - d / 6.5) + 0.4; }
    return Math.min(1.6, L);
  }

  // ---- muzzle: the shot lights the wall it hits and the floor at her feet; the shotgun, the room ----
  build_muzzle() {
    this.wallFlash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.wallFlash.visible = false; this.root.add(this.wallFlash);
    this.feetFlash = this.addGlow(0, 0, 3.2, 3.2, 0, 0xffb060, 'muzzle'); this.feetFlash.k = 0;
  }
  onShot(e, p, shotgun) {
    const yaw = e.yaw ?? p.aimYaw;
    this.flashK = 1; this.flashX = p.x + Math.sin(yaw) * 1.5; this.flashZ = p.z + Math.cos(yaw) * 1.5; this.flashR = shotgun ? 9 : 5;
    if (!this.on.muzzle) return;
    this.feetFlash.x = p.x + Math.sin(yaw) * 0.6; this.feetFlash.z = p.z + Math.cos(yaw) * 0.6; this.feetFlash.sx = this.feetFlash.sz = shotgun ? 12 : 4; this.placeGlow(this.feetFlash); this.feetK = shotgun ? 0.9 : 0.55;
    if (e.hit === 'wall' || e.nx != null) { // (on the wall it hit, facing back out of it)
      const ex = e.ex, ez = e.ez, nx = e.nx || 0, nz = e.nz || 0;
      this.wallFlash.position.set(ex + nx * 0.03, 1.35, ez + nz * 0.03); this.wallFlash.lookAt(ex + nx, 1.35, ez + nz); this.wallFlash.scale.setScalar(shotgun ? 3.2 : 1.8); this.wallFlash.visible = true; this.wallK = 1;
    }
    if (this.fx?.flashLight && shotgun) { this.fx.flashLight.distance = 11; this.fx.flashLight.intensity = 30; } // (the room, for a moment)
  }

  update(dt, sim, views, yolaView) {
    this.lastViews = views; this.lastYola = yolaView;
    if (this.on.baked) this.lightChars(views, yolaView, sim?.player);
    this.t += dt;
    if (this.fix) for (const F of this.fix) { const k = flick(F.state, this.t, F.seed, F.S); F.b = k; F.pool.k = this.on.fixtures && !this.on.baked ? F.k * k : 0; /* (A on: the bake is the pool) */ F.bar.material.opacity = 0.15 + 0.85 * k; }
    if (this.halos && this.on.halos && (this.monScanT = (this.monScanT ?? 0) - dt) <= 0) { this.monScanT = 2; this.scanMonitors(); }
    if (this.halos) for (const H of this.halos) H.s.material.opacity = H.mon ? H.base * (0.85 + 0.15 * Math.sin(this.t * 9 + H.s.position.x)) : H.F ? (this.tubes ? H.base * H.F.b : 0) : H.base; // (a fitting's halo needs its tube on show)
    if (this.exits) for (const E of this.exits) { const k = flick(E.state, this.t, E.seed, E.S); E.halo.material.opacity = 0.5 * k; E.spill.k = 0.22 * k; for (const m of [].concat(E.m.material)) if (m.map) m.opacity = 0.35 + 0.65 * k; }
    if (this.streakMesh) { const c = new THREE.Color(); for (const S of this.streaks) this.streakMesh.setColorAt(S.i, c.set(S.F.col).multiplyScalar(0.27 * (S.F.b ?? 1))); this.streakMesh.instanceColor.needsUpdate = true; }
    if (this.dips && this.on.baked) for (const d of this.dips) d.m.material.opacity = Math.min(0.75, (1 - d.F.b) * 0.8);
    // the shot's light dies fast
    this.flashK = Math.max(0, this.flashK - dt * 9);
    if (this.feetFlash) { this.feetK = Math.max(0, (this.feetK || 0) - dt * 10); this.feetFlash.k = this.feetK; }
    if (this.wallFlash?.visible) { this.wallK -= dt * 9; this.wallFlash.material.opacity = Math.max(0, this.wallK) * 0.85; if (this.wallK <= 0) this.wallFlash.visible = false; }
    this.tickGlows();
    // E on bodies: the blobs under every character stretched and pushed away from the nearest light; B: the room's light
    const p = sim?.player;
    if (this.on.contact || this.on.room) for (const v of views) {
      const z = v.z; if (!z) continue;
      if (this.on.contact && v.blob) { const [dx, dz] = this.awayFromLight(z.x, z.z); v.blob.position.x = z.x + dx * 0.18; v.blob.position.z = z.z + dz * 0.18; v.blob.rotation.z = Math.atan2(dx, dz); v.blob.scale.set(1.05, 1.45, 1); v.blob.material.opacity = 1; }
      if (this.on.room && v.view) this.tint(v.view, z.x, z.z, dt);
    }
    if (yolaView && p) {
      if (this.on.yshadow && this.ysh) this.tickYShadow(dt, p, yolaView);
      if (this.on.contact && yolaView.blob) { const [dx, dz] = this.awayFromLight(p.x, p.z); yolaView.blob.position.x = p.x + dx * 0.16; yolaView.blob.position.z = p.z + dz * 0.16; yolaView.blob.rotation.z = Math.atan2(dx, dz); yolaView.blob.scale.set(1.05, 1.45, 1); }
      if (this.on.room) this.tint(yolaView, p.x, p.z, dt); else if (yolaView.roomTint) this.clearTint(yolaView);
    }
    // (this.torch stays until main sets the next one: the eyes read it before this runs)
  }
  tint(view, x, z, dt) { // B: an ambient in the room's colour, blended over ~0.4 s as it crosses a doorway
    const r = this.roomAt(x, z), want = new THREE.Color(r ? r.col : 0).multiplyScalar(r ? r.k : 0);
    view.roomTint ??= new THREE.Color(0); view.roomTint.lerp(want, Math.min(1, dt * 3));
    view.roomTintOn = true;
  }
  clearTint(view) { view.roomTint = null; view.roomTintOn = false; }
}
