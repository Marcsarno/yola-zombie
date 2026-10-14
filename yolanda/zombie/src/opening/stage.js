// The cheerful "small hospital-management game" set for the opening: a clinic floor with a reception area and a
// treatment room, built from the hospital game's own models, plus the cast. It lives far from the combat wing in
// the same scene (so the reveal cuts to the real operating room), and is hidden once play starts.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Actor, OriginalYola } from './actors.js';

export const CLINIC = { x: 60, z: 0 }; // world offset of the clinic's local origin
const M = '../assets/models/';

const PAL = { wall: 0xf4ecdc, band: 0x7bbdb8, cap: 0xfff8ea, floorA: '#f2e6cc', floorB: '#cfe6dc', grout: '#e1d4b8', glass: 0xcfeaec, frame: 0x8fc1c4 };

function checkerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), s = 128;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { g.fillStyle = (i + j) % 2 ? PAL.floorB : PAL.floorA; g.fillRect(i * s, j * s, s, s); }
  g.strokeStyle = PAL.grout; g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function signTexture(text, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#2f9fa0'; g.beginPath(); g.roundRect(0, 0, 1024, 256, 40); g.fill();
  g.fillStyle = '#fff8ea'; g.beginPath(); g.roundRect(14, 14, 996, 228, 30); g.fill();
  g.fillStyle = '#2a8f92'; g.font = '800 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, sub ? 108 : 128);
  if (sub) { g.fillStyle = '#e07a5f'; g.font = '700 50px system-ui, sans-serif'; g.fillText(sub, 512, 190); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class ClinicStage {
  constructor(scene, loader) {
    this.scene = scene; this.loader = loader;
    this.root = new THREE.Group(); this.root.position.set(CLINIC.x, 0, CLINIC.z); this.root.visible = false;
    scene.add(this.root);
    this.cache = new Map();
    this.tiers = []; this.tier = 'starter';
    this.actors = {};
    this.anchors = {};
  }

  gltf(url) { if (!this.cache.has(url)) this.cache.set(url, this.loader.loadAsync(url)); return this.cache.get(url); }

  // place a static prop: centred on x/z, standing on the floor, rotated about Y (degrees); fit scales to a target height
  async prop(url, { x = 0, z = 0, y = 0, rot = 0, s = 1, h = 0, parent = this.root, name = '' } = {}) {
    const g = await this.gltf(url);
    const obj = g.scene.clone(true); obj.rotation.y = (rot * Math.PI) / 180;
    const holder = new THREE.Group(); holder.add(obj); holder.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    let k = s; if (h) k = h / (box.max.y - box.min.y);
    if (k !== 1) { obj.scale.multiplyScalar(k); holder.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(obj); }
    const c = box.getCenter(new THREE.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
    holder.position.set(x, y, z); holder.name = name;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    parent.add(holder);
    return holder;
  }

  box(w, h, d, x, y, z, color, { r = 0.04, shadow = true, rough = 0.8 } = {}) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, d / 2.2, h / 2.2)), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; this.root.add(m); return m;
  }
  wall(x0, x1, z0, z1, h, style = 'full') {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (style === 'glass') {
      this.box(w, 0.7, d + 0.04, cx, 0.35, cz, PAL.wall);
      const gm = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, h - 0.78, 0.03), new THREE.MeshStandardMaterial({ color: PAL.glass, roughness: 0.1, transparent: true, opacity: 0.24, depthWrite: false }));
      gm.position.set(cx, 0.72 + (h - 0.78) / 2, cz); this.root.add(gm);
      this.box(w + 0.02, 0.07, Math.max(d, 0.1), cx, h, cz, PAL.frame, { shadow: false });
      return;
    }
    this.box(w, h, d, cx, h / 2, cz, PAL.wall, { r: 0.05 });
    const bh = Math.min(0.34, h * 0.35);
    this.box(w + 0.02, bh, d + 0.02, cx, bh / 2 + 0.05, cz, PAL.band, { r: 0.02, shadow: false });
    this.box(w + 0.04, 0.05, d + 0.04, cx, h, cz, PAL.cap, { r: 0.02, shadow: false });
  }

  sign(id, x, y, z, w, ry = 0) {
    if (!this.signTex) this.signTex = new THREE.TextureLoader();
    const t = this.signTex.load(`assets/opening/signs/${id}.png`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, y, z); m.rotation.y = ry; this.root.add(m); this.signs[id] = m; return m;
  }

  async build() {
    const W = 9.2, Zn = -6, Zs = 5; // half-width; north (back) and south (front) edges, local
    // floor
    const tex = checkerTexture(); tex.repeat.set((W * 2 + 1) / 1.2, (Zs - Zn + 1) / 1.2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 1, Zs - Zn + 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Zn + Zs) / 2); floor.receiveShadow = true; this.root.add(floor);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ color: 0xcfe3df })); out.rotation.x = -Math.PI / 2; out.position.set(0, -0.03, 0); this.root.add(out);
    // reception rug and a teal inlay band
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshStandardMaterial({ color: 0xe9b8a4, roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; rug.position.set(-5.2, 0.006, 1.4); rug.receiveShadow = true; this.root.add(rug);
    const inlay = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 0.3), new THREE.MeshStandardMaterial({ color: 0x9fd4cc })); inlay.rotation.x = -Math.PI / 2; inlay.position.set(0, 0.005, -3.5); this.root.add(inlay);
    // walls: back (north) and west full, front (south) and east low cutaways (the camera looks in from the south-east)
    this.wall(-W, W, Zn - 0.3, Zn, 4.0, 'full');
    this.wall(-W - 0.3, -W, Zn - 0.3, -0.2, 4.0, 'full'); this.wall(-W - 0.3, -W, 2.0, Zs, 4.0, 'full'); // doorway in the west wall (z -0.2..2.0)
    this.wall(-W, W, Zs, Zs + 0.3, 0.95, 'low'); this.wall(W, W + 0.3, Zn - 0.3, Zs + 0.3, 0.95, 'low');
    // glass partition between reception and the treatment room, with a doorway
    this.wall(0.2, 0.45, Zn, -1.0, 2.3, 'glass'); this.wall(0.2, 0.45, 0.6, Zs, 2.3, 'glass');

    // ---- reception (x < 0.2)
    const R = 'reception/';
    const tasks = [];
    tasks.push(this.prop(M + 'upgrades/01_reception/reception_T1_desk.glb', { x: -5.2, z: -4.7, rot: 0, name: 'desk' }));
    tasks.push(this.prop(M + 'upgrades/01_reception/reception_T1_chair.glb', { x: -5.2, z: -5.55, rot: 0 }));
    // waiting chairs (mismatched, as a starter lobby): they face north into the room so someone can sit and look at the aisle
    tasks.push(this.prop(M + 'uploaded/waiting-chair.glb', { x: -7.3, z: 3.4, rot: 180, name: 'wchair1' }));
    tasks.push(this.prop(M + 'uploaded/staff-chair.glb', { x: -6.2, z: 3.45, rot: 180, name: 'wchair2' }));
    tasks.push(this.prop(M + 'furnishings/Lounge_Break_Chair.glb', { x: -5.0, z: 3.4, rot: 180, name: 'wchair3' }));
    tasks.push(this.prop(M + 'decor/Reception_Tall_Broadleaf_Plant.glb', { x: -8.2, z: -5.3 }));
    tasks.push(this.prop(M + 'decor/Reception_Water_Cooler.glb', { x: -3.4, z: -5.4 }));
    // the operating-room door in the north wall, with its 2D sign
    tasks.push(this.prop(M + 'entrance/Entrance_Double_Doorway.glb', { x: -1.4, z: -5.9, rot: 0, name: 'orDoor' }));
    tasks.push(this.prop(M + 'decor/Reception_Round_Side_Table.glb', { x: -3.2, z: 3.6 }));
    tasks.push(this.prop(M + 'decor/Reception_Magazine_Rack.glb', { x: -1.2, z: 3.7, rot: 0 }));
    tasks.push(this.prop(M + 'decor/Reception_Poster_Heart.glb', { x: -2.6, y: 1.35, z: -5.88 }));
    tasks.push(this.prop(M + 'decor/Reception_Wall_Sanitizer.glb', { x: -0.9, y: 1.2, z: -5.88 }));
    tasks.push(this.prop(M + 'entrance/Entrance_Double_Doorway.glb', { x: -9.05, z: 0.9, rot: 90, name: 'door' }));
    // room signs: the supplied 2D print faces (one flat quad each; no 3D sign meshes)
    this.signs = {};
    this.sign('reception', -5.2, 2.15, -5.94, 1.9);
    this.sign('assessment', 0.34, 2.05, -0.2, 1.25, Math.PI / 2); // over the treatment-room doorway, readable from the reception side
    this.sign('operating_room', -1.4, 2.7, -5.93, 1.7);

    // ---- treatment room (x > 0.45): equipment slots that can swap tier (starter / standard / advanced)
    const U = M + 'upgrades/';
    const slot = (key, files, opts) => { const s = { key, files, opts, holder: null }; this.tiers.push(s); return s; };
    const slots = [
      slot('workstation', { starter: U + '02_anesthesia_monitoring/anesthesia_workstation_starter.glb', standard: U + '02_anesthesia_monitoring/anesthesia_workstation_standard.glb', advanced: U + '02_anesthesia_monitoring/anesthesia_workstation_advanced.glb' }, { x: 6.9, z: -5.2, rot: 0 }),
      slot('monitor', { starter: U + '02_anesthesia_monitoring/patient_monitor_starter.glb', standard: U + '02_anesthesia_monitoring/patient_monitor_standard.glb', advanced: U + '02_anesthesia_monitoring/patient_monitor_advanced.glb' }, { x: 4.6, z: -5.3, rot: 0 }),
      slot('table', { starter: U + '04_surgery/operating_table_starter.glb', standard: U + '04_surgery/operating_table_standard.glb', advanced: U + '04_surgery/operating_table_advanced.glb' }, { x: 5.6, z: -2.4, rot: 90 }),
    ];
    for (const s of slots) for (const tier of ['starter', 'standard', 'advanced']) tasks.push(this.prop(s.files[tier], { ...s.opts, name: s.key + '_' + tier }).then((h) => { s.layers ||= {}; s.layers[tier] = h; this.fadeable(h); h.visible = tier === 'starter'; this.setOpacity(h, 1); }));
    tasks.push(this.prop(M + 'upgrades/07_warmth_teamwork/TeamDesk_starter.glb', { x: 2.7, z: 2.6, rot: 0, name: 'assessDesk' }));
    tasks.push(this.prop(M + 'uploaded/staff-chair.glb', { x: 2.7, z: 1.5, rot: 0, name: 'chairYola' })); // north side, faces south
    tasks.push(this.prop(M + 'uploaded/waiting-chair.glb', { x: 2.7, z: 3.85, rot: 180, name: 'chairPatient' })); // south side, faces north
    tasks.push(this.prop(M + 'utility/Utility_Supply_Shelf.glb', { x: 8.3, z: 1.4, rot: 270 }));
    tasks.push(this.prop(M + 'decor/Reception_Tall_Broadleaf_Plant.glb', { x: 1.2, z: -5.2 }));
    tasks.push(this.prop(M + 'decor2/Clinical_Art_Heart.glb', { x: 2.2, y: 1.5, z: -5.88 }));
    await Promise.all(tasks);
    // seat anchors for the sitting characters (seat centre on the floor plane, facing yaw)
    Object.assign(this.anchors, {
      queue: { x: -5.9, z: -3.55 }, guardQueue: { x: -4.6, z: -2.7 }, // public side of the reception desk (athlete, guard behind-right)
      doorway: { x: 0.33, z: -0.2 }, // the assessment doorway
      chairPatient: { x: 2.7, z: 3.85, yaw: Math.PI, seatTop: 0.47 }, // faces north (-z); the 0.47 m seat the rigs expect
      chairYola: { x: 2.7, z: 1.5, yaw: 0, seatTop: 0.51 }, // faces south (+z)
      guardChair: { x: -5.0, z: 3.4, yaw: Math.PI, seatTop: 0.47 }, // a waiting chair near reception
      receptionChair: { x: -5.2, z: -5.5, yaw: 0, seatTop: 0.5 },
      orDoor: { x: -1.4, z: -5.0 },
    });
  }

  // equipment tiers crossfade in place (same footprint, never stacked solid): materials are cloned per layer so
  // fading one tier never touches another
  fadeable(h) { h.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); for (const m of [].concat(o.material)) m.transparent = true; } }); }
  setOpacity(h, a) { h.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) m.opacity = a; }); }
  setTier(tier, fade = 1) {
    const prev = this.tier; this.tier = tier;
    for (const s of this.tiers) {
      if (!s.layers) continue;
      const from = s.layers[prev], to = s.layers[tier];
      if (from === to) continue;
      s.fx = { from, to, t: 0, dur: Math.max(0.001, fade) };
      to.visible = true; this.setOpacity(to, 0);
    }
  }
  tickTiers(dt) {
    for (const s of this.tiers) {
      const f = s.fx; if (!f) continue;
      f.t = Math.min(f.dur, f.t + dt); const u = f.t / f.dur, e = u * u * (3 - 2 * u);
      this.setOpacity(f.to, e); this.setOpacity(f.from, 1 - e);
      if (u >= 1) { f.from.visible = false; this.setOpacity(f.to, 1); s.fx = null; }
    }
  }

  // ---- cast ----
  async buildCast() {
    const load = (f) => this.loader.loadAsync(f);
    const [yolaOld, bb, sec, pat5, patOld, staff] = await Promise.all([
      load(M + 'blender/yola.glb'), load('assets/opening/Baseball_Visitor.glb'), load('assets/opening/Security_Visitor.glb'),
      load(M + 'people/patient-05.glb'), load(M + 'people/patient-older.glb'), load(M + 'people/staff-teal.glb'),
    ]);
    const batStatic = await load('assets/opening/Baseball_Bat_Static.glb');
    this.gltfs = { yolaOld, bb, sec, pat5, patOld, staff, batStatic };
    const A = this.actors;
    A.yola = new OriginalYola(yolaOld, { height: 1.62, name: 'yolaOld', walkSpeed: 1.0 });
    A.baseball = new Actor(bb, { name: 'baseball' });
    A.security = new Actor(sec, { name: 'security' });
    A.waiting1 = new Actor(pat5, { name: 'waiting1' });
    A.waiting2 = new Actor(patOld, { name: 'waiting2' });
    A.staff = new Actor(staff, { name: 'staff' });
    for (const a of Object.values(A)) { this.root.add(a.root); a.root.visible = false; }
    // the skinned bat and holster pistol stay in the visitors' rigs; the static bat is for belongings
    A.baseball.bat = A.baseball.model.getObjectByName('Baseball_Bat');
    A.baseball.bat0 = A.baseball.bat ? A.baseball.bat.visible : false;
    this.batStatic = batStatic.scene; this.batStatic.visible = false; this.root.add(this.batStatic);
    this.batStatic.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  setActive(v) { this.root.visible = v; }
  update(dt) {
    for (const a of Object.values(this.actors)) if (a.root.visible) a.update(dt);
    this.tickTiers(dt);
  }
  // clinic-local -> world
  toWorld(x, z) { return new THREE.Vector3(x + CLINIC.x, 0, z + CLINIC.z); }
}
