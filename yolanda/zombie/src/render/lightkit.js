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
//   eyes         zombies' eyes catch the light: a dim ember in the dark, bright in a pool of light, in the torch, in a shot's flash
// The mood grade and the film finish (G, H) are a screen pass: render/looks.js setMood. Baked light (A): bakeFloor.
import * as THREE from 'three';

export const LIGHTKIT = [ // [key, label, what it is, what it costs] (the lighting lab's switches)
  ['fixtures', 'C · Light fittings as data', 'Every fitting draws its light on the floor: two in the theatre, the hall, the reception (failing), the lounge (warm, buzzing), the beds (dead).', 'one draw call for every floor glow'],
  ['halos', 'F · Halos', 'A soft halo on every bright thing: tubes, monitors, EXIT signs (the glow look without a bloom pass).', '~15 sprites'],
  ['exit', 'EXIT signs', 'Green EXIT signs over the doors, one failing; green spilling on the floor under them.', '3 boxes + 3 halos'],
  ['polish', 'D · Polished floor', 'Each lit fitting\'s reflection streaks on the floor toward the camera, and the floor gets a little glossier.', 'glows in the same draw call + material'],
  ['contact', 'E · Contact shadows', 'Soft shadows under every piece of furniture and every body, pushed away from the nearest light.', 'one draw call'],
  ['room', 'B · Room light on characters', 'Yola and the zombies take on the room\'s light: cold in the theatre, warm in the lounge, teal by the beds.', 'free (a colour each)'],
  ['muzzle', 'Muzzle flash light', 'A shot lights the wall it hits and the floor at her feet; the shotgun lights the room.', 'only on shots'],
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
const exitTex = () => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48; const g = c.getContext('2d');
  g.fillStyle = '#0d6b2c'; g.fillRect(0, 0, 128, 48); g.fillStyle = '#d9ffe4'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 58, 25);
  g.beginPath(); g.moveTo(104, 16); g.lineTo(118, 24); g.lineTo(104, 32); g.closePath(); g.fill(); // (the arrow)
  return new THREE.CanvasTexture(c);
};
const FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
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
  build_fixtures() {
    this.fix = WING_LIGHTS.fixtures.map((f, i) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.04, 0.16), new THREE.MeshBasicMaterial({ color: f.col, transparent: true, toneMapped: false }));
      bar.position.set(f.x, 2.6, f.z); this.root.add(bar);
      return { ...f, bar, pool: this.addGlow(f.x, f.z, 4.6, 4.6, 0, f.col, 'fixtures'), seed: i * 13.7, S: { off: 0 }, b: 1 };
    });
  }
  // the fittings carry the room's light: the general fill and the sun come down (arena.lightScale), the pools stand out
  toggle_fixtures(v) { for (const F of this.fix || []) F.bar.visible = v; if (this.arena) this.arena.lightScale = v ? DIM : 1; }

  // ---- F: halos on bright things ----
  halo(col, size, x, y, z) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.set(size, size, 1); s.position.set(x, y, z); this.root.add(s); return s; }
  build_halos() {
    this.halos = [];
    for (const F of this.fix || WING_LIGHTS.fixtures) { const s = this.halo(F.col, 1.1, F.x, 2.58, F.z); s.scale.set(1.9, 0.55, 1); this.halos.push({ s, F, base: 0.6 }); }
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
  build_polish() { // a reflection streak per fitting: from below it toward the camera, long and thin
    const cy = (this.camYaw * Math.PI) / 180, tx = Math.sin(cy), tz = Math.cos(cy);
    this.streaks = (this.fix || WING_LIGHTS.fixtures).map((F) => ({ F, g: this.addGlow(F.x + tx * 1.1, F.z + tz * 1.1, 0.75, 3.4, cy, F.col, 'polish') }));
  }
  toggle_polish(v) {
    const O = this.arena?.ob; if (!O?.floor) return;
    for (const m of Object.values(O.floor)) { if (m.userData.r0 == null) m.userData.r0 = m.roughness; m.roughness = v ? Math.max(0.28, m.userData.r0 - 0.3) : m.userData.r0; m.envMapIntensity = v ? 1.6 : 1; m.needsUpdate = true; }
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
    if (this.on.fixtures) for (const F of this.fix) { const d = Math.hypot(x - F.x, z - F.z); if (d < 2.6) L += F.b * (1 - d / 2.6) * 0.9; }
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
    this.t += dt;
    if (this.fix) for (const F of this.fix) { const k = this.on.fixtures ? flick(F.state, this.t, F.seed, F.S) : 0; F.b = k; F.pool.k = F.k * k; F.bar.material.opacity = 0.15 + 0.85 * k; }
    if (this.halos && this.on.halos && (this.monScanT = (this.monScanT ?? 0) - dt) <= 0) { this.monScanT = 2; this.scanMonitors(); }
    if (this.halos) for (const H of this.halos) H.s.material.opacity = H.mon ? H.base * (0.85 + 0.15 * Math.sin(this.t * 9 + H.s.position.x)) : H.base * (H.F?.b ?? 1);
    if (this.exits) for (const E of this.exits) { const k = flick(E.state, this.t, E.seed, E.S); E.halo.material.opacity = 0.5 * k; E.spill.k = 0.22 * k; for (const m of [].concat(E.m.material)) if (m.map) m.opacity = 0.35 + 0.65 * k; }
    if (this.streaks) for (const S of this.streaks) S.g.k = 0.16 * (S.F.b ?? 1);
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
