// Cheap lighting and atmosphere upgrades (2026-10-18, the user: "lets work on the lighting you talked about.. find a room that
// you can apply those different lighting upgrades so i can view them and understand them"). Each one can be switched on
// and off on its own (the lighting lab: combat.html?mode=calm&demo=lighting). None adds a real-time light or redraws the
// shadow map: additive floor glows, a few transparent planes, small particle clouds, material tweaks and CSS on the canvas.
// Placed for the practice room (the operating theatre up top, the hall below it); FX.spots says where.
import * as THREE from 'three';

export const ATMOS = [ // [key, label, what it is, what it costs]
  ['tubes', 'Flickering tubes', 'Ceiling tubes that light the floor under them: one steady, one buzzing, one failing, one dead.', '4 glow decals + 4 thin bars'],
  ['zones', 'Colour by room', 'Each area its own light: cold surgical white in the theatre, warm lamp-light in the lounge, clinical teal by the beds.', '3 big glow decals'],
  ['shafts', 'Light shafts + dust', 'Soft beams falling in through the theatre doors, dust drifting through them.', '2 planes + 80 dots'],
  ['gloss', 'Wet blood', 'Blood pools that catch the light like liquid; Yola leaves fading bloody footprints after she steps in one.', 'material swap + 40 small decals'],
  ['splatter', 'Wall splatter + ceiling dust', 'A kill next to a wall sprays it red; big hits shake dust down from the ceiling.', 'decals + 120 dots, only on hits'],
  ['sparks', 'Sparking fixture', 'A broken ceiling panel over the stretcher spits sparks now and then, flashing the floor under it.', '1 glow decal + sparks'],
  ['haze', 'Depth haze', 'A faint haze that thickens with distance: far corners sit back, the near fight pops.', 'free (built-in fog)'],
  ['impact', 'Impact frames', 'On the biggest hits, a split-second black-and-white comic frame (try a finisher, or Big hit).', 'CSS, only during the hit'],
  ['torch', 'Torch beam', 'A soft cone from Yola\'s torch along her aim and a pool of light where it lands (fake: no shadows).', '1 cone + 1 glow decal'],
];

// where things go in the practice room (core/layout.js wing): theatre x -7..7, z -11..-5; hall z -5..11
const SPOT = {
  tubes: [{ x: 0, z: -8.2, mode: 'steady', col: 0xdbe8ff }, { x: 2.9, z: -0.6, mode: 'failing', col: 0xe6f0ff }, { x: -4.6, z: 8.4, mode: 'buzz', col: 0xffe2b8 }, { x: 5.4, z: 6.8, mode: 'dead', col: 0xdbe8ff }],
  zones: [{ x: 0, z: -8.1, rx: 6.6, rz: 2.9, col: 0x8fb8ff, op: 0.26 }, { x: -4.4, z: 8.4, rx: 2.6, rz: 2.5, col: 0xffa040, op: 0.3 }, { x: 5.0, z: 6.8, rx: 2.0, rz: 3.6, col: 0x6fe0c8, op: 0.22 }], // (ellipses inside their own areas: never over a wall)
  shafts: [{ x: -4.4, z: -11.15 }, { x: 4.2, z: -11.15 }], // (the theatre's two doors, beams falling south into it)
  spark: { x: -3.4, z: -1.6, y: 2.45 },
};
const glowTex = (() => { let t = null; return () => {
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (t = new THREE.CanvasTexture(c));
}; })();
const beamTex = () => { // bright at the top (v = 1), gone at the floor, soft at the sides
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, 'rgba(255,255,255,0.9)'); v.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = v; g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = 'destination-in'; const h = g.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.3, 'rgba(0,0,0,1)'); h.addColorStop(0.7, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = h; g.fillRect(0, 0, 64, 128);
  return new THREE.CanvasTexture(c);
};
const printTex = () => { // a shoe print (sole and heel), white: tinted by the material
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(16, 20, 11, 17, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(16, 51, 9, 10, 0, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
};
const additive = (col, op = 0) => new THREE.MeshBasicMaterial({ map: glowTex(), color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export class Atmos {
  constructor(scene, fx, arena) {
    this.scene = scene; this.fx = fx; this.arena = arena; this.on = {}; this.t = 0; this.built = {};
    this.root = new THREE.Group(); this.root.name = 'atmos'; scene.add(this.root);
  }
  set(key, v) {
    v = !!v; if (this.on[key] === v) return; this.on[key] = v;
    if (!v && !this.built[key]) return; // (never built: nothing to switch off)
    if (v && !this.built[key]) { this.built[key] = true; this['build_' + key]?.(); }
    this['toggle_' + key]?.(v);
  }
  floorGlow(x, z, r, col, op) { const m = new THREE.Mesh(FLAT, additive(col, op)); m.position.set(x, 0.026, z); m.scale.set(r * 2, 1, r * 2); m.renderOrder = 2; this.root.add(m); return m; }

  // ---- flickering tubes: a thin glowing bar at the ceiling and its pool on the floor; each tube its own behaviour ----
  build_tubes() {
    this.tubes = SPOT.tubes.map((s) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.04, 0.16), new THREE.MeshBasicMaterial({ color: s.col, transparent: true, toneMapped: false }));
      bar.position.set(s.x, 2.6, s.z); this.root.add(bar);
      return { ...s, bar, pool: this.floorGlow(s.x, s.z, 2.4, s.col, 0), seed: Math.random() * 100, off: 0 };
    });
  }
  toggle_tubes(v) { for (const T of this.tubes || []) { T.bar.visible = T.pool.visible = v; } }
  tick_tubes(dt) {
    for (const T of this.tubes) {
      let k = 1;
      if (T.mode === 'buzz') k = 0.86 + 0.14 * Math.sin(this.t * 120 + T.seed) * Math.sin(this.t * 7.3); // (mains hum)
      else if (T.mode === 'failing') { // dropouts: off for a stutter now and then, a long dark gap rarely
        if (T.off > 0) { T.off -= dt; k = Math.random() < 0.15 ? 0.6 : 0.02; }
        else if (Math.random() < dt * 0.9) T.off = Math.random() < 0.25 ? 0.6 + Math.random() * 1.2 : 0.08 + Math.random() * 0.18;
      } else if (T.mode === 'dead') k = Math.random() < dt * 0.4 ? 0.5 : 0.0; // (a dead tube that ticks once in a while)
      T.bar.material.opacity = 0.15 + 0.85 * k; T.pool.material.opacity = 0.32 * k;
    }
  }

  // ---- colour by room: big soft glows on the floor, one colour per area ----
  build_zones() { this.zones = SPOT.zones.map((s) => { const m = this.floorGlow(s.x, s.z, 1, s.col, s.op); m.scale.set(s.rx * 2, 1, s.rz * 2); return m; }); }
  toggle_zones(v) { for (const m of this.zones || []) m.visible = v; }

  // ---- light shafts: a slanted beam from each theatre door to the floor, a pool where it lands, dust in it ----
  build_shafts() {
    const tex = beamTex(); this.shafts = []; const pts = [];
    for (const s of SPOT.shafts) {
      const w0 = 1.3, w1 = 2.3, len = 3.6, y0 = 2.3, z0 = s.z + 0.2, z1 = z0 + len; // (into the room: +z)
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([s.x - w0 / 2, y0, z0, s.x + w0 / 2, y0, z0, s.x + w1 / 2, 0.03, z1, s.x - w1 / 2, 0.03, z1], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); g.setIndex([0, 2, 1, 0, 3, 2]);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: 0xfff1d6, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.renderOrder = 3; this.root.add(m);
      const pool = this.floorGlow(s.x, z1 - 0.4, 1.4, 0xfff1d6, 0.22);
      this.shafts.push(m, pool);
      for (let i = 0; i < 40; i++) { const u = Math.random(); pts.push({ x: s.x + (Math.random() - 0.5) * (w0 + (w1 - w0) * u), y: y0 * (1 - u) + 0.1, z: z0 + len * u, ph: Math.random() * 6.28, s }); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pts.length * 3), 3));
    this.dust = { pts, geo, obj: new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff4e0, size: 0.035, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })) };
    this.root.add(this.dust.obj);
  }
  toggle_shafts(v) { for (const m of this.shafts || []) m.visible = v; if (this.dust) this.dust.obj.visible = v; }
  tick_shafts(dt) {
    const a = this.dust.geo.attributes.position;
    this.dust.pts.forEach((p, i) => {
      p.y -= dt * 0.05; p.x += Math.sin(this.t * 0.6 + p.ph) * dt * 0.06; p.z += Math.cos(this.t * 0.4 + p.ph) * dt * 0.04;
      if (p.y < 0.1) { const u = Math.random(); p.y = 2.3 * (1 - u) + 0.2; p.z = p.s.z + 0.2 + 3.6 * u; p.x = p.s.x + (Math.random() - 0.5) * (1.3 + u); }
      a.setXYZ(i, p.x, p.y + Math.sin(this.t * 1.3 + p.ph) * 0.03, p.z);
    });
    a.needsUpdate = true;
  }

  // ---- wet blood: the blood takes a glossy finish (the scene's own environment reflects in it); bloody footprints ----
  build_gloss() {
    this.prints = []; const tex = printTex();
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(FLAT, new THREE.MeshStandardMaterial({ map: tex, color: 0x8a0d0d, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.scale.set(0.11, 1, 0.26); m.visible = false; m.renderOrder = 1; this.root.add(m); this.prints.push({ m, t: 99 }); }
    this.printNext = 0; this.walked = 0; this.bloody = 0; this.lastX = null; this.foot = 1;
    this.wet = new Map();
  }
  toggle_gloss(v) {
    const fx = this.fx, O = this.arena?.ob;
    for (const q of fx.pools) { // (fx's pooled floor blood)
      if (v) { if (!this.wet.has(q)) { const b = q.m.material; this.wet.set(q, { b, s: new THREE.MeshStandardMaterial({ map: b.map, color: 0x7a0a0a, roughness: 0.16, metalness: 0, envMapIntensity: 1.1, transparent: true, opacity: b.opacity, depthWrite: false }) }); } q.m.material = this.wet.get(q).s; }
      else if (this.wet.has(q)) q.m.material = this.wet.get(q).b;
    }
    if (O?.blood) for (const m of Object.values(O.blood)) { m.roughness = v ? 0.16 : 0.45; m.envMapIntensity = v ? 1.1 : 1; m.needsUpdate = true; }
    for (const P of this.prints) if (!v) P.m.visible = false;
  }
  tick_gloss(dt, p) { // footprints: every step after she walks through blood, fading over her next steps; each print fades in time
    for (const q of this.fx.pools) { const W = this.wet.get(q); if (W && q.m.material === W.s) W.s.opacity = W.b.opacity; } // (fx animates the original's opacity)
    if (this.lastX == null) { this.lastX = p.x; this.lastZ = p.z; }
    const d = Math.hypot(p.x - this.lastX, p.z - this.lastZ); this.walked += d; this.lastX = p.x; this.lastZ = p.z;
    if (this.inBlood(p.x, p.z)) this.bloody = 10;
    if (this.walked > 0.62 && d > 0) {
      this.walked = 0;
      if (this.bloody > 0) {
        const P = this.prints[this.printNext]; this.printNext = (this.printNext + 1) % this.prints.length; this.foot = -this.foot;
        const yaw = Math.atan2(p.vx || 0.0001, p.vz || 0.0001), sx = Math.cos(yaw) * 0.1 * this.foot, sz = -Math.sin(yaw) * 0.1 * this.foot;
        P.m.position.set(p.x + sx, 0.012, p.z + sz); P.m.rotation.y = yaw; P.m.visible = true; P.t = 0; P.k = this.bloody / 10; this.bloody--;
      }
    }
    for (const P of this.prints) if (P.t < 30) { P.t += dt; P.m.material.opacity = 0.85 * P.k * Math.max(0, 1 - P.t / 30); if (P.t >= 30) P.m.visible = false; }
  }
  inBlood(x, z) {
    for (const q of this.fx.pools) if (q.t < 30 && q.m.visible && Math.hypot(x - q.m.position.x, z - q.m.position.z) < q.m.scale.x * 0.42) return true;
    const D = this.arena?.ob?.decals; if (D) for (const m of D.children) if (m.position.y < 0.05 && Math.hypot(x - m.position.x, z - m.position.z) < Math.max(m.scale.x, m.scale.z) * 0.42) return true;
    return false;
  }

  // ---- wall splatter (a kill by a wall sprays it) and ceiling dust (big hits shake it down) ----
  build_splatter() {
    const map = this.arena?.ob?.blood?.splat?.map;
    this.splats = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map, color: 0xd02020, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.visible = false; m.renderOrder = 1; this.root.add(m); this.splats.push({ m, t: 99 }); }
    this.splatNext = 0;
    const n = 120, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(-50), 3));
    this.fall = { geo, p: Array.from({ length: n }, () => ({ life: 0 })), obj: new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfc6b4, size: 0.04, transparent: true, opacity: 0.8, depthWrite: false })), next: 0 };
    this.fall.obj.frustumCulled = false; this.root.add(this.fall.obj);
  }
  toggle_splatter(v) { for (const S of this.splats || []) if (!v) S.m.visible = false; }
  onKill(x, z, dx, dz, reach = 1.5) { // a body dropping by a wall: blood up the wall it faces along the blow
    if (!this.on.splatter) return;
    let best = null, bd = reach;
    for (const w of this.arena?.walls || []) {
      if (w.frame || w.h < 1.4) continue; const b = w.box;
      const nx = Math.max(b.minX, Math.min(x, b.maxX)), nz = Math.max(b.minZ, Math.min(z, b.maxZ)), ex = nx - x, ez = nz - z, d = Math.hypot(ex, ez);
      if (d < 0.05 || d > bd) continue; if ((ex * dx + ez * dz) / d < 0.2) continue; bd = d; best = { nx, nz, ex: ex / d, ez: ez / d };
    }
    if (!best) return false;
    const S = this.splats[this.splatNext]; this.splatNext = (this.splatNext + 1) % this.splats.length;
    S.m.position.set(best.nx - best.ex * 0.015, 1.05 + Math.random() * 0.35, best.nz - best.ez * 0.015); S.m.lookAt(x, S.m.position.y, z); S.m.rotateZ(Math.random() * 6.28);
    const s = 0.9 + Math.random() * 0.6; S.m.scale.set(s, s, 1); S.m.visible = true; S.t = 0;
    this.fx.bloodSpray(best.nx - best.ex * 0.1, 1.2, best.nz - best.ez * 0.1, -best.ex * 0.4, -0.3, -best.ez * 0.4, 10, 1.4);
    return true;
  }
  onBigHit(x, z) { // ceiling dust shaken down round a big impact; the impact frame
    if (this.on.splatter) for (let i = 0; i < 70; i++) {
      const P = this.fall.p[this.fall.next]; this.fall.next = (this.fall.next + 1) % this.fall.p.length;
      const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 2.2;
      Object.assign(P, { x: x + Math.cos(a) * r, y: 2.6 + Math.random() * 0.2, z: z + Math.sin(a) * r, vy: -(0.25 + Math.random() * 0.5), life: 2.4 + Math.random() * 1.2, ph: Math.random() * 6 });
    }
    if (this.on.impact) this.impactFrame();
  }
  tick_splatter(dt) {
    for (const S of this.splats) if (S.t < 40) { S.t += dt; S.m.material.opacity = Math.min(1, S.t / 0.08) * (S.t < 32 ? 0.92 : Math.max(0, 0.92 - (S.t - 32) / 8)); if (S.t >= 40) S.m.visible = false; }
    const a = this.fall.geo.attributes.position;
    this.fall.p.forEach((P, i) => { if (P.life > 0) { P.life -= dt; P.y += P.vy * dt; P.x += Math.sin(this.t * 2 + P.ph) * dt * 0.08; if (P.y < 0.03) { P.y = 0.03; P.vy = 0; } a.setXYZ(i, P.x, P.y, P.z); } else a.setXYZ(i, 0, -50, 0); });
    a.needsUpdate = true;
  }

  // ---- the sparking fixture ----
  build_sparks() { const s = SPOT.spark; this.sparkPool = this.floorGlow(s.x, s.z, 1.6, 0xffd9a0, 0); this.sparkBar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), new THREE.MeshStandardMaterial({ color: 0x9aa2a2, roughness: 0.6 })); this.sparkBar.position.set(s.x + 0.15, 2.58, s.z); this.sparkBar.rotation.z = 0.35; this.root.add(this.sparkBar); this.sparkT = 1; this.sparkK = 0; }
  toggle_sparks(v) { if (this.sparkPool) this.sparkPool.visible = this.sparkBar.visible = v; }
  tick_sparks(dt) {
    const s = SPOT.spark;
    if ((this.sparkT -= dt) <= 0) {
      this.sparkT = 0.8 + Math.random() * 2.4; this.sparkK = 1;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) setTimeout(() => this.on.sparks && this.fx.burst(s.x, s.y, s.z, 10, i % 2 ? 0xfff2c0 : 0xffb050, 2.6, 0.15, 0.5), i * 70);
    }
    this.sparkK = Math.max(0, this.sparkK - dt * 6); this.sparkPool.material.opacity = 0.55 * this.sparkK * (0.6 + 0.4 * Math.random());
  }

  // ---- depth haze ----
  toggle_haze(v) { this.scene.fog = v ? new THREE.Fog(0x141b1e, 13, 27) : null; }

  // ---- impact frames: two frames of a stark black-and-white comic panel over the canvas ----
  impactFrame() {
    let el = document.getElementById('impactFrame');
    if (!el) { el = document.createElement('div'); el.id = 'impactFrame'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;display:none;backdrop-filter:grayscale(1) contrast(4.5) brightness(1.15);-webkit-backdrop-filter:grayscale(1) contrast(4.5) brightness(1.15)'; document.body.appendChild(el); }
    el.style.display = 'block'; clearTimeout(this.ifT); this.ifT = setTimeout(() => { el.style.display = 'none'; }, 70);
  }

  // ---- the torch: a soft cone along her aim, a pool where it lands ----
  build_torch() {
    const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
    const geo = new THREE.ConeGeometry(1.05, 4.2, 28, 1, true); geo.translate(0, -2.1, 0); geo.rotateX(-Math.PI / 2); // (tip at the origin, opening along +z)
    this.beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0xfff0d0, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.beam.renderOrder = 3; this.root.add(this.beam);
    this.beamPool = this.floorGlow(0, 0, 1, 0xfff0d0, 0.42);
  }
  toggle_torch(v) { if (this.beam) this.beam.visible = this.beamPool.visible = v; }
  tick_torch(dt, p, ix, iz, iyaw) {
    const fx = Math.sin(iyaw), fz = Math.cos(iyaw), fl = 0.95 + 0.05 * Math.sin(this.t * 23) * Math.sin(this.t * 3.1);
    this.beam.position.set(ix + fx * 0.25, 1.25, iz + fz * 0.25); this.beam.rotation.set(0.28, iyaw, 0, 'YXZ'); this.beam.material.opacity = 0.11 * fl;
    this.beamPool.position.set(ix + fx * 3.0, 0.027, iz + fz * 3.0); this.beamPool.rotation.y = iyaw; this.beamPool.scale.set(2.2, 1, 3.4); this.beamPool.material.opacity = 0.42 * fl;
  }

  update(dt, sim, ix, iz, iyaw) {
    this.t += dt;
    const p = sim?.player;
    if (this.on.tubes) this.tick_tubes(dt);
    if (this.on.shafts) this.tick_shafts(dt);
    if (this.on.gloss && p) this.tick_gloss(dt, p);
    if (this.built.splatter) this.tick_splatter(dt);
    if (this.on.sparks) this.tick_sparks(dt);
    if (this.on.torch && p) this.tick_torch(dt, p, ix, iz, iyaw);
  }
}
