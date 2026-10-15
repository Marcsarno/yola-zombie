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
    this.byName = {}; this.pops = []; this.rings = []; this.onPop = null; // the "empty room becomes furnished" placements
  }

  gltf(url) { if (!this.cache.has(url)) this.cache.set(url, this.loader.loadAsync(url)); return this.cache.get(url); }

  // place a static prop: centred on x/z, standing on the floor, rotated about Y (degrees); fit scales to a target height
  async prop(url, { x = 0, z = 0, y = 0, rot = 0, s = 1, h = 0, parent = this.root, name = '', wall = '' } = {}) {
    const g = await this.gltf(url);
    // wall: mount on a wall and face 's' (+z), 'n' (-z), 'e' (+x) or 'w' (-x); x/z give the wall face the item's back touches
    if (wall) rot = { s: 0, n: 180, e: 90, w: 270 }[wall];
    const obj = g.scene.clone(true); obj.rotation.y = (rot * Math.PI) / 180;
    const holder = new THREE.Group(); holder.add(obj); holder.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    let k = s; if (h) k = h / (box.max.y - box.min.y);
    if (k !== 1) { obj.scale.multiplyScalar(k); holder.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(obj); }
    const c = box.getCenter(new THREE.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
    holder.position.set(x, y, z); holder.name = name;
    if (wall) { const sz = box.getSize(new THREE.Vector3()); if (wall === 's') holder.position.z = z + sz.z / 2 + 0.005; if (wall === 'n') holder.position.z = z - sz.z / 2 - 0.005; if (wall === 'e') holder.position.x = x + sz.x / 2 + 0.005; if (wall === 'w') holder.position.x = x - sz.x / 2 - 0.005; }
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    parent.add(holder); if (name) this.byName[name] = holder;
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
    const inlay = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x9fd4cc })); inlay.rotation.x = -Math.PI / 2; inlay.position.set(-W / 2 + 0.1, 0.005, -3.5); this.root.add(inlay);
    // walls: back (north) and west full, front (south) and east low cutaways (the camera looks in from the south-east)
    this.wall(-W, W, Zn - 0.3, Zn, 4.0, 'full');
    this.wall(-W - 0.3, -W, Zn - 0.3, -0.2, 4.0, 'full'); this.wall(-W - 0.3, -W, 2.0, Zs, 4.0, 'full'); // doorway in the west wall (z -0.2..2.0)
    this.wall(-W, W, Zs, Zs + 0.3, 0.95, 'low'); this.wall(W, W + 0.3, Zn - 0.3, Zs + 0.3, 0.95, 'low');
    // ---- the east side: a staff corridor and a compact assessment office (north), the two-bay clinical room (south) ----
    // glass partition between reception and the east rooms: one doorway into the corridor/office, one into the two-bay room
    this.wall(0.2, 0.45, Zn, -1.6, 2.3, 'glass'); this.wall(0.2, 0.45, -0.4, 2.0, 2.3, 'glass'); this.wall(0.2, 0.45, 3.4, Zs, 2.3, 'glass');
    // the two-bay room's back wall (the office's south wall) and the office's west wall (a doorway from the corridor)
    this.wall(0.45, W, -0.05, 0.2, 3.0, 'full');
    this.wall(3.05, 3.3, Zn, -1.9, 3.0, 'full'); this.wall(3.05, 3.3, -0.6, -0.05, 3.0, 'full');

    // ---- reception (x < 0.2)
    const tasks = [];
    tasks.push(this.prop(M + 'upgrades/01_reception/reception_T1_desk.glb', { x: -5.2, z: -4.7, rot: 180, name: 'desk' }));
    tasks.push(this.prop(M + 'upgrades/01_reception/reception_T1_chair.glb', { x: -5.2, z: -5.55, rot: 0 }));
    // waiting chairs (mismatched, as a starter lobby): they face north into the room so someone can sit and look at the aisle
    tasks.push(this.prop(M + 'uploaded/waiting-chair.glb', { x: -7.3, z: 3.4, rot: 180, name: 'wchair1' }));
    tasks.push(this.prop(M + 'uploaded/staff-chair.glb', { x: -6.2, z: 3.45, rot: 0, name: 'wchair2' }));
    tasks.push(this.prop(M + 'furnishings/Lounge_Break_Chair.glb', { x: -5.0, z: 3.4, rot: 180, name: 'wchair3' }));
    tasks.push(this.prop(M + 'decor/Reception_Tall_Broadleaf_Plant.glb', { x: -8.2, z: -5.3 }));
    tasks.push(this.prop(M + 'decor/Reception_Water_Cooler.glb', { x: -3.85, z: -5.4 }));
    // the operating-room door in the north wall, with its 2D sign
    tasks.push(this.prop(M + 'entrance/Entrance_Double_Doorway.glb', { x: -1.4, z: -5.9, rot: 0, name: 'orDoor' }));
    tasks.push(this.prop(M + 'decor/Reception_Round_Side_Table.glb', { x: -3.2, z: 3.6 }));
    tasks.push(this.prop(M + 'decor/Reception_Magazine_Rack.glb', { x: -1.2, z: 3.7, rot: 0 }));
    tasks.push(this.prop(M + 'decor/Reception_Poster_Heart.glb', { x: -3.15, y: 1.35, z: -5.88 })); // clear of the OR doorway's frame (x -2.65..-0.15)
    tasks.push(this.prop(M + 'decor/Reception_Wall_Sanitizer.glb', { x: 0.02, y: 1.2, z: -5.88 })); // between the doorway and the glass partition
    tasks.push(this.prop(M + 'entrance/Entrance_Double_Doorway.glb', { x: -9.05, z: 0.9, rot: 90, name: 'door' }));
    // room signs: the supplied 2D print faces (one flat quad each; no 3D sign meshes)
    this.signs = {};
    this.sign('reception', -5.2, 2.15, -5.94, 1.9);
    this.sign('assessment', 0.15, 2.05, -1.0, 1.0, -Math.PI / 2); // over the corridor doorway, facing reception
    this.sign('recovery', 0.15, 2.05, 2.7, 1.0, -Math.PI / 2); // over the two-bay room doorway, facing reception
    this.sign('operating_room', -1.4, 2.7, -5.93, 1.7);

    // ---- the staff corridor (x 0.45..3.05, north): water, the notice board
    tasks.push(this.prop(M + 'furnishings/Assessment_Board.glb', { x: 1.75, y: 1.0, z: Zn, wall: 's' }));
    tasks.push(this.prop(M + 'decor/Reception_Water_Cooler.glb', { x: 2.65, z: -5.55 }));
    tasks.push(this.prop(M + 'decor/Reception_Tall_Broadleaf_Plant.glb', { x: 0.9, z: -5.45 }));

    // ---- the assessment office (x 3.3..9.2, z -6..-0.05). The camera looks in from the east, so its back walls are the
    //      north wall (supplies) and the west wall (medical information); the conversation sits in the middle.
    const AF = M + 'upgrades/09_assessment_furniture/runtime/';
    tasks.push(this.prop(AF + 'consultation_desk_standard.glb', { x: 6.3, z: -3.2, rot: 180, name: 'officeDesk' })); // drawers (the clinician's side) to the north
    tasks.push(this.prop(AF + 'clinician_chair_standard.glb', { x: 6.3, z: -3.95, rot: 0, name: 'chairYola' })); // behind the desk, facing south
    tasks.push(this.prop(AF + 'visitor_chair_standard.glb', { x: 5.72, z: -2.15, rot: 180, name: 'chairPatient' })); // opposite her, facing north
    tasks.push(this.prop(AF + 'visitor_chair_standard.glb', { x: 6.88, z: -2.15, rot: 180, name: 'chairGuard' }));
    // supplies along the north wall: storage cabinet with a wall cupboard over it, gloves and sanitizer, the clinical bin
    tasks.push(this.prop(M + 'furnishings/Clinical_Storage_Cabinet.glb', { x: 7.85, z: Zn, wall: 's' }));
    tasks.push(this.prop(M + 'furnishings/Clinical_Wall_Cupboard.glb', { x: 7.85, y: 1.45, z: Zn, wall: 's' }));
    tasks.push(this.prop(M + 'furnishings/Endoscopy_Glove_Dispenser.glb', { x: 6.55, y: 1.05, z: Zn, wall: 's' }));
    tasks.push(this.prop(M + 'decor/Reception_Wall_Sanitizer.glb', { x: 6.05, y: 1.1, z: Zn, wall: 's' }));
    tasks.push(this.prop(M + 'furnishings/Clinical_Lidded_Waste_Bin.glb', { x: 8.95, z: -5.65 }));
    // medical information on the west wall: anatomy posters, the clock, the room's own sign
    tasks.push(this.prop(M + 'furnishings/Assessment_Poster_Body.glb', { x: 3.3, y: 1.0, z: -4.6, wall: 'e' }));
    tasks.push(this.prop(M + 'furnishings/Assessment_Poster_Lungs.glb', { x: 3.3, y: 1.0, z: -3.75, wall: 'e' }));
    tasks.push(this.prop(M + 'decor/Recovery_Wall_Clock.glb', { x: 3.3, y: 2.0, z: -4.18, wall: 'e' }));
    this.sign('assessment', 3.32, 2.35, -2.75, 1.05, Math.PI / 2);
    // softening: a plant in the corner, a framed picture
    tasks.push(this.prop(M + 'decor/Reception_Tall_Broadleaf_Plant.glb', { x: 3.85, z: -5.5 }));
    tasks.push(this.prop(M + 'decor2/Clinical_Art_Heart.glb', { x: 4.75, y: 1.25, z: Zn, wall: 's' }));
    // the desk top: computer, keyboard, phone, clipboard, a tidy stack of paperwork (on the clinician's side)
    this.deskTop(6.3, 0.81, -3.2);

    // ---- the two-bay clinical room (x 0.45..9.2, z 0.2..5): two complete care stations against the back wall, facing the
    //      camera, with a privacy screen between them; each station's equipment changes tier in place
    const U = M + 'upgrades/';
    const T3 = (dir, name) => ({ starter: U + dir + name.replace('#', 'starter'), standard: U + dir + name.replace('#', 'standard'), advanced: U + dir + name.replace('#', 'advanced') });
    const slot = (key, files, opts) => { const sl = { key, files, opts, holder: null }; this.tiers.push(sl); return sl; };
    const BZ = 0.2; // the back wall's face
    const slots = [];
    for (const [k, cx] of [['A', 3.4], ['B', 6.6]]) {
      slots.push(slot('head' + k, T3('05_recovery_bay/', 'RecoveryHeadwall_#.glb'), { x: cx, z: BZ, wall: 's' }));
      slots.push(slot('bed' + k, T3('05_recovery_bay/', 'RecoveryBed_#.glb'), { x: cx, z: 1.62, rot: 0 })); // head to the headwall, foot toward the room
      slots.push(slot('mon' + k, T3('02_anesthesia_monitoring/', 'patient_monitor_#.glb'), { x: cx - 0.98, z: 0.75, rot: 0 }));
      slots.push(slot('iv' + k, T3('08_support_equipment/runtime/', 'iv_stand_#.glb'), { x: cx + 0.86, z: 0.8, rot: 0 }));
      slots.push(slot('cab' + k, T3('05_recovery_bay/', 'BedsideCabinet_#.glb'), { x: cx - 0.95, z: 2.15, rot: 90 }));
    }
    slots.push(slot('curtain', T3('05_recovery_bay/', 'PrivacyCurtain_#.glb'), { x: 5.0, z: 1.6, rot: 0 }));
    slots.push(slot('cart', T3('08_support_equipment/runtime/', 'supply_cart_#.glb'), { x: 8.55, z: 0.72, rot: 0 }));
    slots.push(slot('prep', T3('09_assessment_furniture/runtime/', 'prep_storage_#.glb'), { x: 1.35, z: BZ, wall: 's' }));
    for (const sl of slots) for (const tier of ['starter', 'standard', 'advanced']) tasks.push(this.prop(sl.files[tier], { ...sl.opts, name: sl.key + '_' + tier }).then((h) => { sl.layers ||= {}; sl.layers[tier] = h; this.fadeable(h); h.visible = tier === 'starter'; this.setOpacity(h, 1); }));
    // freestanding examination lights at each bed (the arm reaches over the bed)
    tasks.push(this.prop(U + '04_surgery/surgical_light_starter.glb', { x: 4.42, z: 2.45, rot: 180, name: 'lightA' }));
    tasks.push(this.prop(U + '04_surgery/surgical_light_starter.glb', { x: 7.62, z: 2.45, rot: 180, name: 'lightB' }));
    // the room's fixtures: gloves and sanitizer by the supply counter, the clinical bin, a clock over the screen, restrained art
    tasks.push(this.prop(M + 'furnishings/Endoscopy_Glove_Dispenser.glb', { x: 0.95, y: 1.3, z: BZ, wall: 's', name: 'glovesR' }));
    tasks.push(this.prop(M + 'decor/Reception_Wall_Sanitizer.glb', { x: 1.75, y: 1.35, z: BZ, wall: 's', name: 'saniR' }));
    tasks.push(this.prop(M + 'furnishings/Clinical_Lidded_Waste_Bin.glb', { x: 2.3, z: 0.5, name: 'binR' }));
    tasks.push(this.prop(M + 'decor/Recovery_Wall_Clock.glb', { x: 5.0, y: 2.25, z: BZ, wall: 's', name: 'clockR' }));
    tasks.push(this.prop(M + 'decor2/Clinical_Art_Lungs.glb', { x: 8.55, y: 1.45, z: BZ, wall: 's', name: 'artR' }));
    this.sign('recovery', 2.0, 2.45, BZ + 0.012, 1.0);
    tasks.push(this.buildExterior());
    await Promise.all(tasks);
    // seat anchors for the sitting characters (seat centre on the floor plane, facing yaw; seatTop: the chair's seat height)
    Object.assign(this.anchors, {
      queue: { x: -5.9, z: -3.55 }, guardQueue: { x: -4.6, z: -2.7 }, // public side of the reception desk (athlete, guard behind-right)
      doorway: { x: 0.33, z: -1.0 }, // reception -> the staff corridor
      officeDoor: { x: 3.18, z: -1.25 }, // corridor -> the assessment office
      bayDoor: { x: 0.33, z: 2.7 }, // reception -> the two-bay room
      chairPatient: { x: 5.72, z: -2.15, yaw: Math.PI, seatTop: 0.53 }, // faces north, toward Yola
      chairGuard: { x: 6.88, z: -2.15, yaw: Math.PI, seatTop: 0.53 },
      chairYola: { x: 6.3, z: -3.95, yaw: 0, seatTop: 0.53 }, // faces south, across the desk
      guardChair: { x: -5.0, z: 3.4, yaw: Math.PI, seatTop: 0.47 }, // a waiting chair near reception
      receptionChair: { x: -5.2, z: -5.5, yaw: 0, seatTop: 0.5 },
      orDoor: { x: -1.4, z: -5.0 },
      yolaTour: { x: 5.0, z: 3.7, yaw: 0.45 }, // original Yola in the two-bay room for the tour
    });
  }

  // ---- the outside of the medical center (the opening's first shot): the clinic's own front entrance in the west wall,
  //      dressed as a building front - cream stucco, the teal name sign over a canopy with downlights, teal-framed glass
  //      sliding doors (the real reception shows through them), planters, hedges, a sidewalk with leaf shadows, trees
  //      behind the roofline and a painted sky. Facade face at x = -9.5 (local); the doorway is z -0.2..2.0.
  async buildExterior() {
    const g = new THREE.Group(); g.name = 'exterior'; this.root.add(g); this.exterior = g;
    const std = (c, r = 0.85, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o });
    const box = (w, h, d, x, y, z, m, { r = 0.04, shadow = true, parent = g } = {}) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), m); b.position.set(x, y, z); b.castShadow = shadow; b.receiveShadow = true; parent.add(b); return b; };
    const bx = (x0, x1, y0, y1, z0, z1, m, o) => box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, m, o);
    const stucco = std(0xf1e5cc), stucco2 = std(0xe8d9bb), capM = std(0xf8f0de), teal = std(0x2a9a96, 0.55), tealDk = std(0x1f7f7c, 0.5);
    const glassM = new THREE.MeshStandardMaterial({ color: 0xcfeeee, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false });
    const winM = std(0x7fb4bb, 0.15, { metalness: 0.3 }), steel = std(0xd8dde0, 0.3, { metalness: 0.7 });
    // facade body: two wings either side of the entrance portal, a plinth, a parapet cap and a teal accent band
    for (const [z0, z1] of [[-8.6, -0.75], [2.55, 8.4]]) {
      bx(-9.85, -9.5, 0, 4.25, z0, z1, stucco, { r: 0.05 });
      bx(-9.9, -9.5, 0, 0.16, z0, z1, stucco2, { r: 0.02 });
      bx(-9.92, -9.5, 4.2, 4.32, z0 - 0.02, z1 + 0.02, capM, { r: 0.03 });
      bx(-9.88, -9.84, 3.0, 3.18, z0, z1, teal, { r: 0.01, shadow: false });
    }
    // windows in the wings (teal frames, tinted glass)
    for (const zc of [-5.3, 5.3]) {
      bx(-9.9, -9.84, 0.85, 2.65, zc - 1.3, zc + 1.3, tealDk, { r: 0.02, shadow: false });
      bx(-9.93, -9.88, 0.93, 2.57, zc - 1.22, zc + 1.22, winM, { r: 0.01, shadow: false });
      bx(-9.95, -9.88, 0.93, 2.57, zc - 0.03, zc + 0.03, tealDk, { r: 0.01, shadow: false });
      bx(-10.02, -9.84, 0.8, 0.88, zc - 1.36, zc + 1.36, capM, { r: 0.02 }); // sill
    }
    // the entrance portal: two pillars, the canopy with its downlights, the sign block above
    bx(-10.55, -9.5, 0, 3.0, -0.78, -0.2, stucco2, { r: 0.06 }); bx(-10.55, -9.5, 0, 3.0, 2.0, 2.58, stucco2, { r: 0.06 });
    bx(-10.8, -9.5, 2.95, 3.32, -1.0, 2.8, capM, { r: 0.06 });
    const lampM = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
    for (const zc of [-0.1, 0.9, 1.9]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), lampM); d.rotation.x = Math.PI / 2; d.position.set(-10.25, 2.945, zc); g.add(d); }
    bx(-10.2, -9.5, 3.32, 4.8, -3.0, 4.8, stucco, { r: 0.06 });
    bx(-10.24, -9.5, 4.75, 4.86, -3.04, 4.84, capM, { r: 0.03 });
    // the sign: a teal panel, the name in white
    bx(-10.32, -10.18, 3.5, 4.58, -2.55, 4.35, teal, { r: 0.08 });
    const sc = document.createElement('canvas'); sc.width = 1400; sc.height = 220; const sg = sc.getContext('2d');
    let fs0 = 150; do { sg.font = '800 ' + fs0 + 'px system-ui, "Segoe UI", sans-serif'; fs0 -= 4; } while (sg.measureText('Yola’s Medical Center').width > 1300 && fs0 > 60); sg.textAlign = 'center'; sg.textBaseline = 'middle'; // (fitted to the panel)
    sg.fillStyle = 'rgba(0,0,0,0.18)'; sg.fillText('Yola’s Medical Center', 706, 118); sg.fillStyle = '#ffffff'; sg.fillText('Yola’s Medical Center', 700, 110);
    const stx = new THREE.CanvasTexture(sc); stx.colorSpace = THREE.SRGBColorSpace; stx.anisotropy = 4;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.6, (6.6 * 220) / 1400), new THREE.MeshBasicMaterial({ map: stx, transparent: true }));
    sign.position.set(-10.33, 4.04, 0.9); sign.rotation.y = -Math.PI / 2; g.add(sign);
    // the doors: a teal frame and transom, two sliding glass leaves (they part into the pillars)
    bx(-9.64, -9.52, 2.42, 2.95, -0.2, 2.0, tealDk, { r: 0.02 });
    for (const [z0, z1] of [[-0.2, -0.12], [1.92, 2.0]]) bx(-9.64, -9.52, 0, 2.45, z0, z1, tealDk, { r: 0.01 });
    this.extDoors = [];
    for (const [zc, dir] of [[0.47, -1], [1.33, 1]]) {
      const leaf = new THREE.Group(); leaf.position.set(-9.6, 0, zc); g.add(leaf);
      const W = 0.84;
      bx(-0.035, 0.035, 0.02, 2.4, -W / 2, -W / 2 + 0.06, teal, { parent: leaf, r: 0.01 }); bx(-0.035, 0.035, 0.02, 2.4, W / 2 - 0.06, W / 2, teal, { parent: leaf, r: 0.01 });
      bx(-0.035, 0.035, 2.34, 2.4, -W / 2, W / 2, teal, { parent: leaf, r: 0.01 }); bx(-0.035, 0.035, 0.02, 0.14, -W / 2, W / 2, teal, { parent: leaf, r: 0.01 });
      bx(-0.01, 0.01, 0.14, 2.34, -W / 2 + 0.06, W / 2 - 0.06, glassM, { parent: leaf, r: 0.002, shadow: false });
      bx(-0.09, -0.05, 0.75, 1.6, -dir * (W / 2 - 0.14) - 0.02, -dir * (W / 2 - 0.14) + 0.02, steel, { parent: leaf, r: 0.015 }); // handle
      this.extDoors.push({ leaf, z0: zc, dir });
    }
    // planters either side of the entrance, each with a broadleaf plant and low shrubs around it
    const leafCols = [0x5f9e4a, 0x4f8c3e, 0x74b35a, 0x3f7a35];
    const leafMats = leafCols.map((c) => std(c, 0.9, { flatShading: true }));
    const shrub = (x, y, z, r, k = 0, parent = g) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[k % 4]); m.position.set(x, y, z); m.scale.y = 0.8; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const jobs = [];
    for (const zc of [-2.05, 3.85]) {
      bx(-11.55, -10.6, 0, 0.82, zc - 0.62, zc + 0.62, capM, { r: 0.08 });
      bx(-11.5, -10.65, 0.8, 0.83, zc - 0.57, zc + 0.57, std(0x5a4636, 1), { r: 0.01, shadow: false });
      jobs.push(this.prop(M + 'decor/Reception_Tall_Broadleaf_Plant.glb', { x: -11.08, y: 0.55, z: zc, rot: 90, s: 1.15, parent: g }));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; shrub(-11.08 + Math.cos(a) * 0.38, 0.95, zc + Math.sin(a) * 0.42, 0.2 + (i % 2) * 0.05, i); }
    }
    // hedges under the wing windows, a flower bed in the near foreground
    for (const zc of [-5.3, 5.3]) jobs.push(this.prop(M + 'campus/hedge.glb', { x: -10.4, z: zc, rot: 90, parent: g }));
    jobs.push(this.prop(M + 'campus/flowerbed.glb', { x: -15.6, z: -4.8, rot: 75, parent: g }));
    // trees: trunks and clustered low-poly crowns, behind the roofline at the sides and one in the near left
    const tree = (x, z, h, r) => {
      const t = new THREE.Group(); t.position.set(x, 0, z); g.add(t);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h * 0.55, 8), std(0x7a5a40, 0.9)); tr.position.y = h * 0.27; tr.castShadow = true; t.add(tr);
      for (let i = 0; i < 7; i++) { const a = i * 2.39, d = i ? r * 0.55 : 0; shrub(Math.cos(a) * d, h * 0.62 + (i % 3) * r * 0.28, Math.sin(a) * d, r * (i ? 0.62 : 0.8), i, t); }
    };
    tree(-8.1, -4.3, 7.4, 1.6); tree(-7.9, 6.1, 7.8, 1.7); tree(-7.6, -10.6, 6.6, 1.7); // (the first two rise over the roofline in a phone-width frame) tree(-6.4, 10.2, 7.0, 1.8); tree(-8.6, 12.2, 5.6, 1.4); tree(-7.0, -13.0, 6.0, 1.5); tree(-17.5, -9.6, 5.8, 1.6);
    // the ground: a sidewalk of large pale slabs in front of the building, a curb, a lawn beyond
    const pc = document.createElement('canvas'); pc.width = pc.height = 256; const pg = pc.getContext('2d');
    pg.fillStyle = '#ebe4d6'; pg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { pg.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(150,135,110,0.08)'; pg.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    pg.strokeStyle = 'rgba(160,145,120,0.55)'; pg.lineWidth = 3; pg.strokeRect(1.5, 1.5, 253, 253);
    const pt = new THREE.CanvasTexture(pc); pt.wrapS = pt.wrapT = THREE.RepeatWrapping; pt.colorSpace = THREE.SRGBColorSpace; pt.anisotropy = 8;
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 34), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.9 }));
    pt.repeat.set(15.5 / 1.8, 34 / 1.8); walk.rotation.x = -Math.PI / 2; walk.position.set(-9.5 - 7.75, 0.006, 0); walk.receiveShadow = true; g.add(walk);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(120, 160), std(0x9cc46c, 1)); lawn.rotation.x = -Math.PI / 2; lawn.position.set(-25.2 - 60, 0.004, 0); lawn.receiveShadow = true; g.add(lawn);
    bx(-25.25, -24.95, 0, 0.12, -17, 17, std(0xd9d2c4), { r: 0.03 }); // the curb
    // dappled leaf shadow on the walk (the trees' shade): soft dark blobs, no extra lights
    const dc = document.createElement('canvas'); dc.width = dc.height = 256; const dg = dc.getContext('2d');
    for (let i = 0; i < 70; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 22, gr = dg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,60,40,0.32)'); gr.addColorStop(1, 'rgba(40,60,40,0)'); dg.fillStyle = gr; dg.beginPath(); dg.arc(x, y, r, 0, Math.PI * 2); dg.fill(); }
    const dtex = new THREE.CanvasTexture(dc);
    for (const [zc, w] of [[-8.0, 6], [8.6, 6.5]]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(6, w), new THREE.MeshBasicMaterial({ map: dtex, transparent: true, depthWrite: false })); d.rotation.x = -Math.PI / 2; d.position.set(-13.2, 0.012, zc); g.add(d); }
    // the sky (the scene background for the outside shot)
    const kc = document.createElement('canvas'); kc.width = 512; kc.height = 512; const kg = kc.getContext('2d');
    const sky = kg.createLinearGradient(0, 0, 0, 512); sky.addColorStop(0, '#4f9fe6'); sky.addColorStop(0.55, '#8cc4f0'); sky.addColorStop(1, '#d8eef8');
    kg.fillStyle = sky; kg.fillRect(0, 0, 512, 512);
    const cloud = (x, y, w) => { for (let i = 0; i < 7; i++) { const cx = x + (i - 3) * w * 0.16, cy = y - Math.sin((i / 6) * Math.PI) * w * 0.12, r = w * (0.14 + 0.1 * Math.sin((i / 6) * Math.PI)), gr = kg.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); kg.fillStyle = gr; kg.beginPath(); kg.arc(cx, cy, r, 0, Math.PI * 2); kg.fill(); } };
    cloud(390, 120, 190); cloud(120, 210, 150); cloud(300, 300, 120);
    this.skyTex = new THREE.CanvasTexture(kc); this.skyTex.colorSpace = THREE.SRGBColorSpace;
    // seen through the doors, the reception needs a ceiling and a far wall (inside, the diorama has neither): both belong
    // to the outside shot only, with flush light panels like a real lobby
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 11.2), std(0xf4ecdc, 0.9, { side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(-4.4, 3.05, -0.5); g.add(ceil);
    const panelM = new THREE.MeshBasicMaterial({ color: 0xfff6e2 });
    for (const [x, z] of [[-7.2, -1.8], [-7.2, 2.4], [-4.4, -1.8], [-4.4, 2.4], [-1.6, -1.8], [-1.6, 2.4]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), panelM); p.rotation.x = Math.PI / 2; p.position.set(x, 3.04, z); g.add(p); }
    bx(0.25, 0.45, 0, 3.05, -6.0, 5.0, std(0xf4ecdc), { r: 0.02, shadow: false }); // the far wall (the glass partition's line)
    bx(0.2, 0.25, 0.05, 0.4, -6.0, 5.0, std(0x7bbdb8), { r: 0.01, shadow: false });
    await Promise.all(jobs);
    g.traverse((o) => { if (o.isMesh && o.material?.transparent) o.castShadow = false; });
  }
  // the sliding doors: k 0 shut .. 1 open
  setEntranceOpen(k) { for (const d of this.extDoors || []) d.leaf.position.z = d.z0 + d.dir * 0.82 * k; }

  // procedural desk-top dressing (the kit has no desk accessories): monitor and keyboard, a phone, a clipboard, paperwork
  deskTop(cx, y, cz) {
    const g = new THREE.Group(); g.position.set(cx, y, cz); this.root.add(g); this.byName.deskTop = g;
    const mat = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const add = (geo, m, x, yy, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, yy, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    const dark = mat(0x2a3238, 0.45), cream = mat(0xf2ead8), teal = mat(0x2f9fa0, 0.5);
    const scr = mat(0x7fb7c9, 0.3); scr.emissive = new THREE.Color(0x1d3d48);
    // monitor on a stand, turned toward the clinician (the north side of the desk)
    add(new RoundedBoxGeometry(0.5, 0.32, 0.035, 2, 0.012), dark, 0.18, 0.3, 0.05, 0.25);
    add(new THREE.BoxGeometry(0.44, 0.26, 0.004), scr, 0.18 - Math.sin(0.25) * 0.019, 0.3, 0.05 - Math.cos(0.25) * 0.019, 0.25);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 10), dark, 0.18, 0.08, 0.07);
    add(new RoundedBoxGeometry(0.2, 0.012, 0.14, 2, 0.005), dark, 0.18, 0.006, 0.07);
    add(new RoundedBoxGeometry(0.42, 0.018, 0.14, 2, 0.006), cream, 0.12, 0.009, -0.17, 0.12); // keyboard (clinician side)
    add(new RoundedBoxGeometry(0.07, 0.02, 0.1, 2, 0.008), cream, 0.42, 0.01, -0.2); // mouse
    // telephone
    add(new RoundedBoxGeometry(0.18, 0.06, 0.2, 2, 0.02), teal, -0.55, 0.03, -0.05, 0.4);
    add(new RoundedBoxGeometry(0.2, 0.035, 0.055, 2, 0.015), dark, -0.55, 0.075, -0.05, 0.4);
    // clipboard toward the visitors, and a squared stack of paperwork
    add(new RoundedBoxGeometry(0.24, 0.012, 0.32, 2, 0.004), mat(0x9a6b44, 0.7), -0.18, 0.006, 0.16, -0.15);
    add(new THREE.BoxGeometry(0.21, 0.004, 0.28), mat(0xfbfaf4, 0.9), -0.18, 0.014, 0.17, -0.15);
    add(new RoundedBoxGeometry(0.08, 0.02, 0.03, 2, 0.006), mat(0xb8c0c4, 0.3, 0.6), -0.18 + Math.sin(-0.15) * -0.13, 0.02, 0.17 - 0.13, -0.15);
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.21, 0.006, 0.29), mat(i % 2 ? 0xf6f3ea : 0xfdfcf6, 0.9), -0.52, 0.004 + i * 0.006, 0.2, 0.03 * ((i % 3) - 1));
  }

  // equipment tiers crossfade in place (same footprint, never stacked solid): materials are cloned per layer so
  // fading one tier never touches another
  fadeable(h) { h.traverse((o) => { if (o.isMesh && o.name !== 'liveScreen') { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); for (const m of [].concat(o.material)) m.transparent = true; } }); }
  setOpacity(h, a) { h.traverse((o) => { if (o.name === 'liveScreen') { o.visible = a > 0.5; return; } if (o.isMesh) for (const m of [].concat(o.material)) m.opacity = a; }); } // (a live screen face is shared by every monitor: it switches with the monitor instead of fading)
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

  // ---- an empty room that gets furnished: quick, satisfying placements of the room's existing furniture ----
  // the two-bay room's equipment arrives in groups: both headwalls, each bed, each station's monitor and IV pole,
  // each cabinet and light, the screen and clock, then the supply corner
  furnishGroups() {
    const t = (k) => this.tiers.find((sl) => sl.key === k)?.layers?.starter, n = this.byName;
    return [[t('headA'), t('headB')], [t('bedA')], [t('bedB')], [t('monA'), t('ivA')], [t('monB'), t('ivB')], [t('cabA'), n.lightA], [t('cabB'), n.lightB], [t('curtain'), n.clockR], [t('prep'), t('cart'), n.glovesR, n.saniR, n.binR, n.artR]].map((g) => g.filter(Boolean));
  }
  furnishList() { return this.furnishGroups().flat(); }
  setRoomEmpty(on) { for (const h of this.furnishList()) { h.visible = !on; h.scale.setScalar(1); } this.clearPops(); }
  clearPops() { this.pops.length = 0; for (const r of this.rings) this.root.remove(r.m); this.rings.length = 0; for (const h of this.furnishList()) h.scale.setScalar(1); }
  popIn(h, delay = 0) { h.visible = false; h.scale.setScalar(0.001); this.pops.push({ h, t: -delay, dur: 0.4, started: false }); }
  tickPops(dt) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.t += dt; if (p.t < 0) continue;
      if (!p.started) {
        p.started = true; p.h.visible = true; this.onPop?.();
        const m = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 40), new THREE.MeshBasicMaterial({ color: 0xfff3c9, transparent: true, opacity: 0.75, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(p.h.position.x, 0.03, p.h.position.z); m.renderOrder = 2; this.root.add(m); this.rings.push({ m, t: 0 });
      }
      const u = Math.min(1, p.t / p.dur), k = u < 1 ? 1 + Math.sin(u * Math.PI) * 0.13 * (1 - u) : 1; // a small overshoot
      p.h.scale.setScalar(Math.max(0.001, k * Math.min(1, u * 1.25)));
      if (u >= 1) { p.h.scale.setScalar(1); this.pops.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const u = Math.min(1, r.t / 0.55);
      r.m.scale.setScalar(1 + u * 2.6); r.m.material.opacity = 0.75 * (1 - u);
      if (u >= 1) { this.root.remove(r.m); this.rings.splice(i, 1); }
    }
  }

  // ---- cast ----
  async buildCast() {
    const load = (f) => this.loader.loadAsync(f);
    const [yolaOld, bb, sec, pat5, patOld, staff, staffB, staffC, staffL] = await Promise.all([
      load(M + 'blender/yola.glb'), load('assets/opening/Baseball_Visitor.glb'), load('assets/opening/Security_Visitor.glb'),
      load(M + 'people/patient-05.glb'), load(M + 'people/patient-older.glb'), load(M + 'people/staff-teal.glb'),
      load(M + 'people/staff-blue.glb'), load(M + 'people/staff-coral.glb'), load(M + 'people/staff-lilac.glb'),
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
    A.teamA = new Actor(staffB, { name: 'teamA' }); // the OR team (existing staff rigs)
    A.teamB = new Actor(staffC, { name: 'teamB' });
    A.surgeon = new Actor(staffL, { name: 'surgeon' }); // the clinician who operates: not Yola (she is called in afterwards)
    for (const a of Object.values(A)) { this.root.add(a.root); a.root.visible = false; }
    // the skinned bat and holster pistol stay in the visitors' rigs; the static bat is for belongings
    A.baseball.bat = A.baseball.model.getObjectByName('Baseball_Bat');
    A.baseball.bat0 = A.baseball.bat ? A.baseball.bat.visible : false;
    this.batStatic = batStatic.scene; this.batStatic.visible = false; this.root.add(this.batStatic);
    this.batStatic.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // the cap, as a static prop: the same geometry and materials as the worn cap, in its bind pose
    const capSkin = A.baseball.model.getObjectByName('Baseball_Cap');
    this.cap = null; A.baseball.capSkin = capSkin;
    if (capSkin) {
      const parts = []; capSkin.traverse((o) => { if (o.isMesh) parts.push(o); });
      const g = new THREE.Group(), box = new THREE.Box3();
      for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); g.add(new THREE.Mesh(p.geometry, p.material)); }
      const c = box.getCenter(new THREE.Vector3());
      for (const m of g.children) m.position.set(-c.x, -box.min.y, -c.z);
      g.visible = false; this.cap = g;
    }
  }

  // move an actor's root between the clinic group and the world (the OR lives in the world scene)
  actorToWorld(a, x, z, yaw) { this.scene.add(a.root); a.root.position.set(x, 0, z); if (yaw != null) { a.yaw = yaw; a.root.rotation.y = yaw; } }
  toClinic(a) { this.root.add(a.root); }
  setActive(v) { this.root.visible = v; }
  update(dt) {
    for (const a of Object.values(this.actors)) if (a.root.visible) a.update(dt);
    this.tickTiers(dt); this.tickPops(dt);
  }
  // clinic-local -> world
  toWorld(x, z) { return new THREE.Vector3(x + CLINIC.x, 0, z + CLINIC.z); }
}
