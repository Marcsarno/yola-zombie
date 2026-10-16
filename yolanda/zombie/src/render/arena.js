// Hospital presentation built from LAYOUT: tiled floors, rounded cream/teal walls, glass partitions, doorways with
// amber emergency lamps, and the hospital-kit props. Two layouts share it: the combat wing (fixed low camera-side
// walls) and Floor 3 (every room walled on all sides: walls between the camera and Yola lower themselves, kit doors
// are cut at the same height, and the braced door, the CT bar and the lift animate from the level's state).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LAYOUT, doorBox } from '../core/layout.js';
import { SIGNS, ROOM_SIGNS, LIFT, PICKUPS } from '../core/floor3.js';
import { BRACE_TIME, DOOR_OPEN_TIME, roomAt } from '../core/level.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const isUnder = (o, name) => { for (let p = o.parent; p; p = p.parent) if (p.name === name) return true; return false; };
// a static model as one mesh per material (geometry baked into the model's own space): far fewer draw calls
// (roots: one or more objects; geometry is baked in world space, so a root at the origin bakes in model space)
function mergeStatic(roots, keep = () => true) {
  const byKey = new Map();
  const put = (material, g) => {
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
    const key = material.uuid + '|' + Object.keys(g.attributes).sort().join(',');
    if (!byKey.has(key)) byKey.set(key, { material, geos: [] });
    byKey.get(key).geos.push(g);
  };
  for (const root of [].concat(roots)) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || !keep(o)) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      const mats = [].concat(o.material);
      const g0 = o.geometry.clone().applyMatrix4(o.matrixWorld), g = g0.index ? g0.toNonIndexed() : g0;
      if (mats.length === 1 || !g0.groups.length) { put(mats[0], g); return; }
      for (const gr of g0.groups) { // a multi-material mesh: one piece per group (non-indexed: groups index vertices directly)
        const sub = new THREE.BufferGeometry();
        for (const [n, a] of Object.entries(g.attributes)) sub.setAttribute(n, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize, a.normalized));
        put(mats[gr.materialIndex], sub);
      }
    });
  }
  const out = [];
  for (const { material, geos } of byKey.values()) { const merged = mergeGeometries(geos, false); if (merged) out.push({ geometry: merged, material }); }
  return out;
}

const PAL = {
  floorA: '#e4d8bf', floorB: '#b9d3c8', grout: '#cdbfa3', wall: 0xece4d3, band: 0x6fa7a6, cap: 0xf5efe2,
  glass: 0xbfe0e2, frame: 0x8fb7bb, door: 0x2c3a42, amber: 0xffb347,
};
const LOW_H = 1.0; // a cut-away wall's height (m)
// ---- the Hospital Outbreak surface kit (Floor 3 after the reveal; see Arena.loadOutbreak) ----
const OB_TILE = 0.75; // one floor tile (m): the kit's floor images hold 4 x 4 tiles
// room -> [floor, wall] (the kit's START_HERE recipes): treatment rooms clinical, circulation the warmer corridor tiles,
// the service area concrete and petrol-blue paint, staff / storage rooms corridor tiles with the maintenance wall
const OB_ROOMS = {
  or: ['clinical', 'clinical'], ct: ['clinical', 'clinical'], waiting: ['corridor', 'clinical'], preop: ['corridor', 'clinical'],
  recovery: ['corridor', 'clinical'], supply: ['corridor', 'maintenance'], cafe: ['corridor', 'maintenance'], maint: ['maintenance', 'maintenance'],
};
// blood (floor: centre, width, length, turn in degrees; wall: point on the face, face, height of the mark's centre, size)
const OB_BLOOD = [
  // operating room: a handprint by each door at hand height, a drag from the stretcher toward the shut north door, cut short
  { kind: 'hand', x: -7.0, z: -3.15, wall: 'e', y: 1.2, size: 0.34, tilt: -6 },
  { kind: 'hand', x: 6.75, z: -11.0, wall: 's', y: 1.12, size: 0.32, tilt: 8 },
  { kind: 'drag', x: 2.55, z: -4.35, w: 0.9, l: 1.9, rot: 20 },
  { kind: 'drag', x: 3.75, z: -7.55, w: 0.6, l: 1.1, rot: 30 },
  { kind: 'splat', x: 5.7, z: -10.25, w: 1.05, l: 1.05, rot: 15 },
  // supply hall (storage): one smear at the exit to the waiting area
  { kind: 'drag', x: -12.05, z: -3.75, w: 0.6, l: 1.0, rot: -60 },
  // waiting area (circulation): small marks in a corner, one handprint, the travel lane clear
  { kind: 'splat', x: -24.9, z: -6.45, w: 0.65, l: 0.65, rot: 40 },
  { kind: 'hand', x: -24.3, z: -7.05, wall: 's', y: 1.0, size: 0.3, tilt: -4 },
  // pre-op: a smear beside the first bed
  { kind: 'drag', x: -34.75, z: -8.0, w: 0.55, l: 1.0, rot: 75 },
  // maintenance: one concentrated splatter where the encounter is
  { kind: 'splat', x: -31.4, z: -15.4, w: 1.35, l: 1.35, rot: -20 },
  { kind: 'drag', x: -29.2, z: -20.3, w: 0.7, l: 1.4, rot: 110 },
  // cafeteria (staff): light, a single smear at the braced exit
  { kind: 'drag', x: -24.65, z: -14.0, w: 0.6, l: 1.0, rot: -100 },
  // CT: a handprint on the barred door's CT side, a little spatter by the scanner
  { kind: 'hand', x: -2.55, z: -11.3, wall: 'n', y: 1.22, size: 0.33, tilt: 5 },
  { kind: 'splat', x: -7.6, z: -13.2, w: 0.7, l: 0.7, rot: 70 },
  // recovery: a smear beside the bed by the east door
  { kind: 'drag', x: -17.7, z: 6.1, w: 0.55, l: 0.95, rot: 10 },
];
// the combat wing (the weapon test arena): its operating room and its hall, a few marks clear of the dummies
const OB_WING_ROOMS = [{ id: 'or', floor: true, rects: [[-7.3, 7.3, -11.3, -5.05]] }, { id: 'waiting', floor: true, rects: [[-7.3, 7.3, -5.05, 11.3]] }];
const OB_BLOOD_WING = [
  { kind: 'hand', x: 5.6, z: -11.0, wall: 's', y: 1.15, size: 0.32, tilt: 6 },
  { kind: 'drag', x: -2.2, z: -6.6, w: 0.9, l: 1.8, rot: -25 },
  { kind: 'splat', x: 5.2, z: -9.6, w: 1.0, l: 1.0, rot: 20 },
  { kind: 'drag', x: -5.6, z: 3.2, w: 0.6, l: 1.0, rot: 70 },
  { kind: 'splat', x: 5.3, z: 2.4, w: 0.7, l: 0.7, rot: -40 },
  { kind: 'hand', x: -7.0, z: 0.4, wall: 'e', y: 1.05, size: 0.3, tilt: -5 },
];
const OB_FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), OB_UPRIGHT = new THREE.PlaneGeometry(1, 1);
const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

function floorTexture(a = PAL.floorA, b = PAL.floorB, grout = PAL.grout) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const n = 2, s = 256 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g.fillStyle = (i + j) % 2 ? b : a; g.fillRect(i * s, j * s, s, s);
  }
  g.strokeStyle = grout; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke(); }
  // faint speckle so the floor reads as material, not flat colour
  const img = g.getImageData(0, 0, 256, 256);
  for (let k = 0; k < img.data.length; k += 4) { const v = (Math.random() - 0.5) * 6; img.data[k] += v; img.data[k + 1] += v; img.data[k + 2] += v; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// a printed wayfinding sign in the hospital's teal-and-cream style
function signTexture(text, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 300; const g = c.getContext('2d');
  g.fillStyle = '#2f8f92'; g.beginPath(); g.roundRect(0, 0, 1024, 300, 38); g.fill();
  g.fillStyle = '#fff8ea'; g.beginPath(); g.roundRect(14, 14, 996, 272, 28); g.fill();
  g.fillStyle = '#1f6f72'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 104; g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(text).width > 940 && size > 40) { size -= 4; g.font = `800 ${size}px system-ui, sans-serif`; }
  g.fillText(text, 512, sub ? 118 : 150);
  if (sub) { g.fillStyle = '#c7553f'; let s2 = 56; g.font = `700 ${s2}px system-ui, sans-serif`; while (g.measureText(sub).width > 940 && s2 > 26) { s2 -= 3; g.font = `700 ${s2}px system-ui, sans-serif`; } g.fillText(sub, 512, 218); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const EM_SKY = new THREE.Color(0x8ea6b8), EM_GROUND = new THREE.Color(0x3a1c1e), EM_SUN = new THREE.Color(0xc9d8ff); // emergency grade

export class Arena {
  constructor(scene, quality, renderer) {
    this.scene = scene; this.quality = quality; this.renderer = renderer;
    this.group = new THREE.Group(); scene.add(this.group);
    this.lights = [];
    this.walls = []; // floor 3: { group, box, h, k, target, attach: [] }
    this.doorKits = {}; // floor 3: id -> { root, mixer, actions, clip plane, rect }
    this.cutObjs = []; // objects cut by a clipping plane when on the camera side
    this.f3 = LAYOUT.name === 'floor3';
    this.buildFloor();
    this.buildWalls();
    this.buildDoors();
    this.buildLights(renderer);
    if (this.f3) this.loadOutbreak();
  }

  buildFloor() {
    if (this.f3) {
      for (const r of LAYOUT.rooms) {
        if (!r.floor) continue;
        for (const [x0, x1, z0, z1] of r.rects) {
          const w = x1 - x0, d = z1 - z0, tex = floorTexture(r.floor[0], r.floor[1]); tex.repeat.set(w / 1.2, d / 1.2); tex.offset.set(x0 / 1.2, z0 / 1.2);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0 }));
          m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; this.group.add(m);
          (this.cuteFloors ||= []).push(m);
        }
      }
      // door thresholds: the floor carries through every doorway (the wall gap sits between two rooms' floors)
      const thMat = new THREE.MeshStandardMaterial({ color: 0xc9c2b0, roughness: 0.6 });
      for (const d of LAYOUT.doors) {
        if (d.kind === 'lift') continue;
        const [a, b, c, e] = doorBox(d);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a + (d.axis === 'z' ? 0.3 : 0), e - c + (d.axis === 'x' ? 0.3 : 0)), thMat);
        m.rotation.x = -Math.PI / 2; m.position.set((a + b) / 2, 0.003, (c + e) / 2); m.receiveShadow = true; this.group.add(m);
      }
      const out = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshBasicMaterial({ color: 0x1d262c })); // (stops short of the opening's clinic set at x 60)
      out.rotation.x = -Math.PI / 2; out.position.set(-13, -0.02, -6); this.group.add(out);
      return;
    }
    const w = 14.6, d = 22.6;
    const tex = floorTexture(); tex.repeat.set(w / 1.2, d / 1.2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.group.add(floor); this.cuteFloors = [floor];
    // teal border inlay (like the concept's floor bands)
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x9fc7c0, roughness: 0.6 });
    const band = (x0, x1, z0, z1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), bandMat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2); m.receiveShadow = true; this.group.add(m); this.cuteFloors.push(m); };
    band(-6.6, 6.6, -4.6, -4.35); band(-6.6, 6.6, 3.9, 4.15);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x27323a }));
    out.rotation.x = -Math.PI / 2; out.position.y = -0.02; this.group.add(out);
  }

  wallMats() {
    if (!this._wm) this._wm = {
      wall: new THREE.MeshStandardMaterial({ color: PAL.wall, roughness: 0.85 }), band: new THREE.MeshStandardMaterial({ color: PAL.band, roughness: 0.8 }),
      cap: new THREE.MeshStandardMaterial({ color: PAL.cap, roughness: 0.7 }), frame: new THREE.MeshStandardMaterial({ color: PAL.frame, roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: PAL.glass, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false }),
    };
    return this._wm;
  }

  // one wall: body, teal wainscot band and a soft cap (as its own group when it can be cut away)
  addWall(x0, x1, z0, z1, h, style, y0 = 0) {
    const M = this.wallMats();
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = new THREE.Group(); this.group.add(g);
    if (style === 'glass') {
      const base = new THREE.Mesh(new RoundedBoxGeometry(w, 0.75, d + 0.06, 2, 0.04), M.wall);
      base.position.set(cx, 0.375, cz); base.castShadow = base.receiveShadow = true; g.add(base);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, h - 0.8, 0.03), M.glass);
      glass.position.set(cx, 0.75 + (h - 0.8) / 2, cz); g.add(glass);
      const top = new THREE.Mesh(new RoundedBoxGeometry(w, 0.06, 0.1, 2, 0.025), M.frame);
      top.position.set(cx, h, cz); g.add(top);
      const n = Math.max(1, Math.round(w / 1.6));
      for (let i = 0; i <= n; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 0.75, 0.08), M.frame); p.position.set(x0 + (w * i) / n, 0.75 + (h - 0.75) / 2, cz); g.add(p); }
      return g;
    }
    if (this.f3) {
      const part = (geo, x, y, z, hex) => { const q = geo.toNonIndexed(); q.translate(x, y, z); const c = new THREE.Color(hex), n = q.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } q.setAttribute('color', new THREE.BufferAttribute(a, 3)); q.deleteAttribute('uv'); return q; };
      const parts = [part(new RoundedBoxGeometry(w, h - y0, d, 2, Math.min(0.06, d / 2.2, (h - y0) / 2.2)), cx, y0 + (h - y0) / 2, cz, PAL.wall)];
      if (!y0) { const bh = Math.min(0.32, h * 0.35); parts.push(part(new RoundedBoxGeometry(w + 0.02, bh, d + 0.02, 2, 0.02), cx, bh / 2 + 0.06, cz, PAL.band)); }
      parts.push(part(new RoundedBoxGeometry(w + 0.04, 0.05, d + 0.04, 2, 0.02), cx, h, cz, PAL.cap));
      if (!this._wallVC) this._wallVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
      const m = new THREE.Mesh(mergeGeometries(parts, false), this._wallVC); m.receiveShadow = true; g.add(m);
      return g;
    }
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h - y0, d, 2, Math.min(0.06, d / 2.2, (h - y0) / 2.2)), M.wall);
    m.position.set(cx, y0 + (h - y0) / 2, cz); m.castShadow = style === 'full' && !this.f3; m.receiveShadow = true;
    g.add(m);
    if (!y0) { // teal wainscot band
      const bh = Math.min(0.32, h * 0.35);
      const bandM = new THREE.Mesh(new RoundedBoxGeometry(w + 0.02, bh, d + 0.02, 2, 0.02), M.band);
      bandM.position.set(cx, bh / 2 + 0.06, cz); g.add(bandM);
    }
    const cap = new THREE.Mesh(new RoundedBoxGeometry(w + 0.04, 0.05, d + 0.04, 2, 0.02), M.cap);
    cap.position.set(cx, h, cz); g.add(cap);
    return g;
  }

  buildWalls() {
    for (const [x0, x1, z0, z1, h, style] of LAYOUT.walls) {
      const g = this.addWall(x0, x1, z0, z1, h, style);
      this.walls.push({ group: g, box: { minX: x0, maxX: x1, minZ: z0, maxZ: z1 }, h, y0: 0, k: 1, target: 1, attach: [], style }); // (the wing's are only used by the outbreak surfaces)
    }
    if (!this.f3) return;
    // lintels over the open doorways (signs and the cut-away read like real walls)
    for (const d of LAYOUT.doors) {
      if (d.kind !== 'open') continue;
      const [a, b, c, e] = doorBox(d);
      const g = this.addWall(a, b, c, e, 2.7, 'full', 2.48);
      this.walls.push({ group: g, box: { minX: a, maxX: b, minZ: c, maxZ: e }, h: 2.7, y0: 2.48, k: 1, target: 1, attach: [], lintel: true });
    }
  }

  buildDoors() {
    if (this.f3) { this.buildOpenFrames(); return; } // the kit doors load with the props
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x1a2328 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x6e9fa3, roughness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7fb0b3, roughness: 0.55 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: PAL.amber, emissiveIntensity: 2.2 });
    this.doorLamps = [];
    for (const d of LAYOUT.doors) {
      const g = new THREE.Group();
      const open = !!d.open;
      g.position.set(d.x, 0, d.z);
      // dark interior beyond the threshold (an open doorway shows the room behind it instead)
      if (!open) {
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(d.width, 2.3), darkMat);
        hole.position.set(0, 1.15, -0.2); g.add(hole);
        const floorDark = new THREE.Mesh(new THREE.PlaneGeometry(d.width, 0.6), darkMat); floorDark.rotation.x = -Math.PI / 2; floorDark.position.set(0, 0.006, -0.35); g.add(floorDark);
      }
      // frame
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new RoundedBoxGeometry(0.1, 2.35, 0.36, 2, 0.03), frameMat); p.position.set((sx * (d.width + 0.1)) / 2, 1.175, 0); g.add(p); }
      const head = new THREE.Mesh(new RoundedBoxGeometry(d.width + 0.3, 0.14, 0.36, 2, 0.03), frameMat); head.position.set(0, 2.38, 0); g.add(head);
      // door leaves swung back against the wall either side
      for (const sx of [-1, 1]) {
        const leaf = new THREE.Mesh(new RoundedBoxGeometry(0.05, 2.15, d.width / 2 - 0.06, 2, 0.02), leafMat);
        leaf.position.set(sx * (d.width / 2 + 0.03), 1.1, -0.18 - d.width / 4); g.add(leaf);
      }
      // amber emergency lamp over the door
      const lamp = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.12, 0.1, 2, 0.03), lampMat); lamp.position.set(0, 2.62, 0.22); g.add(lamp);
      this.doorLamps.push(lamp);
      this.group.add(g);
      const flip = d.axis === 'z' ? (d.x < 0 ? 1 : -1) : 1;
      g.rotation.y = d.axis === 'z' ? (Math.PI / 2) * flip : 0;
    }
  }

  // floor 3's open doorways: a teal frame (jambs and head), cut away with its wall
  buildOpenFrames() {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x6e9fa3, roughness: 0.6 });
    for (const d of LAYOUT.doors) {
      if (d.kind !== 'open') continue;
      const g = new THREE.Group(); g.position.set(d.x, 0, d.z); g.rotation.y = d.axis === 'z' ? Math.PI / 2 : 0;
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new RoundedBoxGeometry(0.1, 2.45, 0.38, 2, 0.03), frameMat); p.position.set((sx * (d.width - 0.1)) / 2, 1.225, 0); p.castShadow = true; g.add(p); }
      const head = new THREE.Mesh(new RoundedBoxGeometry(d.width + 0.1, 0.12, 0.38, 2, 0.03), frameMat); head.position.set(0, 2.43, 0); g.add(head);
      this.group.add(g);
      this.walls.push({ group: g, box: { minX: d.x - 0.2, maxX: d.x + 0.2, minZ: d.z - 0.2, maxZ: d.z + 0.2 }, h: 2.5, k: 1, target: 1, attach: [], frame: true, door: d });
    }
  }

  buildLights(renderer) {
    const s = this.scene;
    // soft image-based fill so matte sculpted materials read with gentle shading in every direction
    if (renderer) { const pm = new THREE.PMREMGenerator(renderer); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.32; pm.dispose(); }
    const hemi = new THREE.HemisphereLight(0xfff4e3, 0x7c9a96, this.f3 ? 0.8 : 0.85); s.add(hemi); this.hemi = hemi;
    const sun = new THREE.DirectionalLight(0xfff1dc, this.f3 ? 1.35 : 1.45);
    sun.position.set(-6, 14, 7); sun.target.position.set(0, 0, 0);
    s.add(sun, sun.target);
    if (this.quality !== 'low') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
      const c = sun.shadow.camera; c.left = -9; c.right = 9; c.top = 13; c.bottom = -13; c.near = 1; c.far = 40;
      if (this.f3) { c.left = -13; c.right = 13; c.top = 13; c.bottom = -13; }
      sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    }
    this.sun = sun;
    if (this.f3) { this.redHemi = new THREE.HemisphereLight(0xff3a24, 0x2a0000, 0); s.add(this.redHemi); return; } // (Floor 3: emergency look, see setEmergency)
    // selective amber emergency light (the rooms themselves stay readable)
    if (this.quality !== 'low') {
      const spots = this.f3 ? LAYOUT.lights : LAYOUT.doors.map((d) => ({ x: d.spawn.x, y: 2.2, z: d.spawn.z }));
      for (const p of spots) {
        const l = new THREE.PointLight(PAL.amber, this.f3 ? 2.6 : 3.2, this.f3 ? 6.5 : 5.5, 1.6);
        l.position.set(p.x, p.y, p.z);
        s.add(l); this.lights.push(l);
      }
    }
  }

  // ---- props (and, on floor 3, the kit doors, the lift, signs and pickups) ----
  async loadProps(loader, onProgress) {
    const cache = new Map();
    const get = (m) => { if (!cache.has(m)) cache.set(m, loader.loadAsync('../' + m)); return cache.get(m); };
    let done = 0;
    const total = LAYOUT.props.length + (this.f3 ? 4 : 0);
    const jobs = LAYOUT.props.map(async (p) => {
      if (p.kind) { this.procProp(p); onProgress?.(++done / total); return; }
      const gltf = await get(p.m);
      const obj = gltf.scene.clone(true);
      obj.rotation.y = (p.rot * Math.PI) / 180;
      const holder = new THREE.Group(); holder.add(obj); holder.userData.prop = true;
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      // centre on the footprint, sit on the floor (or at y); optionally fit to the authored footprint
      const size = box.getSize(new THREE.Vector3());
      if (p.fit) {
        const k = Math.min(p.fp[0] / size.x, p.fp[1] / size.z);
        if (k < 0.97 || k > 1.03) { obj.scale.multiplyScalar(k); holder.updateMatrixWorld(true); box.setFromObject(obj); }
      }
      const ctr = box.getCenter(new THREE.Vector3());
      obj.position.x -= ctr.x; obj.position.z -= ctr.z; obj.position.y -= box.min.y;
      holder.position.set(p.x, p.y || 0, p.z);
      if (p.wall) { // the back against the wall face
        const sz = box.getSize(new THREE.Vector3());
        if (p.wall === 's') holder.position.z = p.z + sz.z / 2 + 0.005; else if (p.wall === 'n') holder.position.z = p.z - sz.z / 2 - 0.005;
        else if (p.wall === 'e') holder.position.x = p.x + sz.x / 2 + 0.005; else holder.position.x = p.x - sz.x / 2 - 0.005;
        this.attachToWall(holder, p.x, p.z, p.wall, (p.y || 0) + sz.y); holder.userData.keep = true;
      }
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = !p.wall; o.receiveShadow = true; } });
      if (p.name) holder.name = p.name;
      this.group.add(holder);
      p._actual = box.getSize(new THREE.Vector3());
      onProgress?.(++done / total);
    });
    if (this.f3) {
      jobs.push(this.loadKits(get).then(() => onProgress?.(++done / total)));
      jobs.push(this.loadPickups(get).then(() => onProgress?.(++done / total)));
      this.buildSigns(); done += 2;
    }
    await Promise.all(jobs);
    if (this.f3) this.mergeRooms();
  }

  // Floor 3: each room's static props become one mesh per material (draw calls: one per material per room, not one per
  // part per prop). The operating room's props stay separate: the opening stages them individually.
  mergeRooms() {
    const rooms = new Map();
    for (const h of [...this.group.children]) {
      if (!h.userData.prop || h.userData.keep) continue;
      const id = roomAt(h.position.x, h.position.z);
      if (!id || id === 'or') continue;
      if (!rooms.has(id)) rooms.set(id, []);
      rooms.get(id).push(h);
    }
    for (const [id, hs] of rooms) {
      const g = new THREE.Group(); g.name = 'room:' + id;
      for (const { geometry, material } of mergeStatic(hs)) { const m = new THREE.Mesh(geometry, material); m.castShadow = m.receiveShadow = true; g.add(m); }
      for (const h of hs) this.group.remove(h);
      this.group.add(g);
    }
  }

  // procedural maintenance dressing (the kit has none): a workbench with tools, pipework along a wall, hazard striping
  procProp(p) {
    if (p.kind === 'box') return this.boxProp(p);
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.userData.prop = true; this.group.add(g);
    const mat = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    if (p.kind === 'bench') {
      const [w, d, h] = p.size, top = mat(p.color, 0.75), steel = mat(0x5d666a, 0.45, 0.5);
      add(new RoundedBoxGeometry(w, 0.06, d, 2, 0.02), top, 0, h - 0.03, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.05, h - 0.06, 0.05), steel, sx * (w / 2 - 0.06), (h - 0.06) / 2, sz * (d / 2 - 0.06));
      add(new THREE.BoxGeometry(w - 0.12, 0.03, d - 0.12), steel, 0, 0.18, 0);
      add(new RoundedBoxGeometry(0.42, 0.16, 0.2, 2, 0.02), mat(0xc9483f, 0.5), -0.5, h + 0.08, 0.05); // toolbox
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 10), mat(0xf2b134, 0.5), 0.1, h + 0.04, 0.12, 0).rotation.z = Math.PI / 2; // a torch
      add(new THREE.BoxGeometry(0.28, 0.02, 0.06), steel, 0.45, h + 0.01, -0.1, 0.4); // a spanner
      add(new THREE.BoxGeometry(0.22, 0.12, 0.16), mat(0x3d4549, 0.4), 0.62, h + 0.06, 0.12); // a meter
    } else if (p.kind === 'pipes') {
      const pm = mat(0x9aa4a8, 0.4, 0.55), rm = mat(0xc9483f, 0.5);
      for (const [dy, r, m] of [[0, 0.06, pm], [0.16, 0.04, rm], [-0.14, 0.035, pm]]) add(new THREE.CylinderGeometry(r, r, p.len, 12), m, 0, p.y + dy, 0.12, 0).rotation.z = Math.PI / 2;
      for (let i = 0; i <= 4; i++) add(new THREE.BoxGeometry(0.04, 0.4, 0.14), mat(0x6c7478, 0.5), -p.len / 2 + (p.len * i) / 4, p.y, 0.06);
      this.attachToWall(g, p.x, p.z, 's', p.y + 0.2); g.userData.keep = true;
    } else if (p.kind === 'hazard') {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#f2b134'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#23292c'; for (let i = -8; i < 16; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 16, 0); x.lineTo(i * 32 - 48, 128); x.lineTo(i * 32 - 64, 128); x.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const [w, d] = p.size, o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, transparent: true, opacity: 0.85 }));
      o.rotation.x = -Math.PI / 2; o.position.y = 0.006; o.receiveShadow = true; g.add(o);
    }
  }

  boxProp(p) { // procedural electrical cabinets (no kit asset): a body with vents and a warning stripe
    const [w, d, h] = p.size, g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.userData.prop = true;
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.03), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55, metalness: 0.25 }));
    body.position.y = h / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    const vent = new THREE.MeshStandardMaterial({ color: 0x4a5356, roughness: 0.7 });
    for (let i = 0; i < 4; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.03, 0.01), vent); v.position.set(0, h * 0.75 + i * 0.06, d / 2 + 0.002); g.add(v); }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.08, 0.01), new THREE.MeshStandardMaterial({ color: 0xf2b134, roughness: 0.5 }));
    stripe.position.set(0, h * 0.45, d / 2 + 0.002); g.add(stripe);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: 0xff5a2a, emissiveIntensity: 1.6 }));
    led.position.set(w * 0.3, h * 0.62, d / 2 + 0.004); g.add(led);
    g.rotation.y = FACE_ROT[p.face || 's']; // size: [front width, depth, height]; the front looks toward face
    this.group.add(g);
  }

  // ---- floor 3: kit doors (shut, braced, barred), the lift, the reset panel and the status lights ----
  async loadKits(get) {
    const [doorG, liftG, resetG, faultG, readyG] = await Promise.all(['zombie/assets/kit/Hospital_Braced_DoubleDoor.glb', 'zombie/assets/kit/Hospital_Elevator_Outbreak.glb',
      'zombie/assets/kit/Lift_Reset.glb', 'zombie/assets/kit/status_amber_fault.glb', 'zombie/assets/kit/status_green_ready.glb'].map(get));
    const own = (root) => { root.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); o.castShadow = true; o.receiveShadow = true; } }); return root; };
    for (const d of LAYOUT.doors) {
      if (d.kind === 'open') continue;
      if (d.kind === 'lift') {
        const root = own(liftG.scene.clone(true)); root.position.set(LIFT.x, 0, LIFT.z); root.rotation.y = LIFT.yaw;
        const roof = root.getObjectByName('Cab_Roof'); if (roof) roof.visible = false; // a cut-away cab (the camera looks down into it)
        this.group.add(root);
        const mixer = new THREE.AnimationMixer(root), open = mixer.clipAction(THREE.AnimationClip.findByName(liftG.animations, 'Doors_Open'));
        open.play(); open.paused = true; open.time = 0; mixer.update(0);
        this.doorKits.lift = { root, mixer, open, last: -1, rect: { minX: 6.9, maxX: 10.7, minZ: LIFT.z - 2.64, maxZ: LIFT.z + 2.64 } };
        this.cutable(root, this.doorKits.lift.rect, 1.5);
        continue;
      }
      if (d.kind === 'closed') { // a shut door, no brace: one merged mesh per material (it never moves), its own materials
        if (!this.shutTemplate) this.shutTemplate = mergeStatic(doorG.scene, (o) => o.name !== 'Brace_REMOVABLE' && !isUnder(o, 'Brace_REMOVABLE'));
        const root = new THREE.Group(); root.position.set(d.x, 0, d.z); root.rotation.y = FACE_ROT[d.face];
        for (const m of this.shutTemplate) { const o = new THREE.Mesh(m.geometry, m.material.clone()); o.castShadow = o.receiveShadow = true; root.add(o); }
        this.group.add(root);
        const [a, b, c, e] = doorBox(d);
        this.cutable(root, { minX: a, maxX: b, minZ: c, maxZ: e });
        continue;
      }
      const root = own(doorG.scene.clone(true)); root.position.set(d.x, 0, d.z); root.rotation.y = FACE_ROT[d.face];
      this.group.add(root);
      const kit = { root, kind: d.kind, last: -1, lastB: -1, shake: 0, L: root.getObjectByName('Door_L_HINGE'), R: root.getObjectByName('Door_R_HINGE') };
      {
        kit.mixer = new THREE.AnimationMixer(root);
        kit.brace = kit.mixer.clipAction(THREE.AnimationClip.findByName(doorG.animations, 'Brace_Remove'));
        kit.open = kit.mixer.clipAction(THREE.AnimationClip.findByName(doorG.animations, 'Doors_Open'));
        for (const a of [kit.brace, kit.open]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; a.time = 0; }
        kit.mixer.update(0);
        this.doorKits[d.id] = kit;
      }
      const [a, b, c, e] = doorBox(d);
      this.cutable(root, { minX: a, maxX: b, minZ: c, maxZ: e });
    }
    // the lift-reset panel on Maintenance's north wall, and the lift's FAULT / READY light by its call panel
    const panel = own(resetG.scene.clone(true)); panel.position.set(-29.5, 0.95, -22.75); panel.rotation.y = 0; this.group.add(panel);
    const pm = new THREE.AnimationMixer(panel);
    this.reset = { root: panel, mixer: pm, up: pm.clipAction(THREE.AnimationClip.findByName(resetG.animations, 'Reset_Handle_Up')), fault: panel.getObjectByName('Status_FAULT'), ready: panel.getObjectByName('Status_READY'), t: -1 };
    this.reset.up.setLoop(THREE.LoopOnce, 1); this.reset.up.clampWhenFinished = true;
    for (const n of [this.reset.fault, this.reset.ready]) if (n) n.scale.setScalar(1);
    if (this.reset.ready) this.reset.ready.visible = false;
    this.attachToWall(panel, -29.5, -22.75, 's', 1.6);
    const f = own(faultG.scene.clone(true)), r = own(readyG.scene.clone(true));
    for (const o of [f, r]) { o.position.set(6.99, 1.62, LIFT.z + 2.95); o.rotation.y = FACE_ROT.w; this.group.add(o); }
    r.visible = false; this.liftStatus = { fault: f, ready: r };
  }

  // the pickups that belong in this floor: the guard's pistol beside him, his open bag (spare rounds), the first-aid case
  async loadPickups(get) {
    this.pickupViz = {};
    const ring = (x, z) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 36), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.55, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.renderOrder = 2; this.group.add(m); return m; };
    const [pistolG, bagG, magG, aidG] = await Promise.all(['zombie/assets/pistol.glb', 'zombie/assets/kit/guard_duffel_open.glb', 'zombie/assets/kit/pistol_magazine_loaded.glb', 'zombie/assets/kit/first_aid_case_closed.glb'].map(get));
    const P = Object.fromEntries(PICKUPS.map((q) => [q.id, q]));
    const pistol = pistolG.scene.clone(true); pistol.position.set(P.pistol.x + 0.1, 0.03, P.pistol.z); pistol.rotation.set(0, 0.7, Math.PI / 2); pistol.scale.setScalar(1); this.group.add(pistol);
    const bag = bagG.scene.clone(true); bag.position.set(P.ammo.x, 0, P.ammo.z); bag.rotation.y = -0.3; this.group.add(bag);
    const mags = new THREE.Group(); for (let i = 0; i < 2; i++) { const m = magG.scene.clone(true); m.position.set(0.36 + i * 0.07, 0.004, -0.06 + i * 0.03); m.rotation.set(-Math.PI / 2, 0, 0.3 * i); mags.add(m); } mags.position.copy(bag.position); mags.rotation.y = bag.rotation.y; this.group.add(mags);
    const aid = aidG.scene.clone(true); aid.position.set(P.health.x, 0.81, P.health.z); aid.rotation.y = -Math.PI / 2; this.group.add(aid);
    for (const o of [pistol, bag, mags, aid]) o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.pickupViz = { pistol: [pistol, ring(P.pistol.x, P.pistol.z)], ammo: [mags, ring(P.ammo.x, P.ammo.z)], health: [aid, ring(P.health.x, P.health.z)], bat: [ring(P.bat.x, P.bat.z)] };
  }
  takePickup(id) { for (const o of this.pickupViz?.[id] || []) o.visible = false; }
  resetPickups(taken = []) { for (const [id, list] of Object.entries(this.pickupViz || {})) for (const o of list) o.visible = !taken.includes(id); }

  buildSigns() {
    const add = (mat, x, y, z, face, w, hk) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * hk), mat);
      const n = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[face];
      m.position.set(x + n[0] * 0.012, y, z + n[1] * 0.012); m.rotation.y = FACE_ROT[face];
      this.group.add(m); this.attachToWall(m, x, z, face, y + (w * hk) / 2);
      return m;
    };
    for (const s of SIGNS) add(new THREE.MeshBasicMaterial({ map: signTexture(s.text, s.sub) }), s.x, s.y, s.z, s.face, s.w, 300 / 1024);
    const tl = new THREE.TextureLoader();
    for (const s of ROOM_SIGNS) { const t = tl.load(`assets/opening/signs/${s.id}.png`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; add(new THREE.MeshBasicMaterial({ map: t }), s.x, s.y, s.z, s.face, s.w, 0.3); }
  }

  // ---- Floor 3 after the reveal: the Hospital Outbreak surface kit (v1) ----
  // The opening's clean, cute hospital keeps its own floors and walls; from the reveal on (setOutbreak, called with the
  // opening's blood) every room switches to the kit's worn surfaces by the kit's room recipes, and the blood decals are
  // placed by hand where the story happened. Colour maps only (no normal / roughness maps); one shared texture per role,
  // dimensions carried by world-scaled UVs (floors: one repeat = 4 tiles = OB_TILE * 4 m; walls: one square repeat per
  // wall height, horizontal only, the blue band at the same height everywhere).
  loadOutbreak() {
    const tl = new THREE.TextureLoader(), A = 'assets/hospital_outbreak/';
    const tex = (n, wall) => { const t = tl.load(A + n); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping; t.wrapT = wall ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; return t; };
    const std = (map, rough) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });
    const decal = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.45, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.ob = {
      on: false, built: false,
      floor: { clinical: std(tex('floor_clinical.jpg'), 0.62), corridor: std(tex('floor_corridor.jpg'), 0.66), maintenance: std(tex('floor_maintenance.jpg'), 0.8) },
      wall: { clinical: std(tex('wall_clinical.jpg', true), 0.86), maintenance: std(tex('wall_maintenance.jpg', true), 0.88) },
      cap: new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.85 }),
      blood: { hand: decal(tl.load(A + 'blood_handprint.webp')), drag: decal(tl.load(A + 'blood_drag.webp')), splat: decal(tl.load(A + 'blood_splatter.webp')) },
      meshes: [],
    };
    for (const m of Object.values(this.ob.blood)) m.map.colorSpace = THREE.SRGBColorSpace;
    this.buildOutbreak();
  }
  roomAt(x, z) { for (const r of this.obRooms) for (const [x0, x1, z0, z1] of r.rects) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r.id; return null; }
  buildOutbreak() {
    const O = this.ob, S = OB_TILE * 4, H = 2.7;
    this.obRooms = LAYOUT.rooms || OB_WING_ROOMS; // (the combat wing has no rooms: its operating room and its hall)
    // floors: the room's recipe, UVs from world position (one continuous grid across rooms)
    for (const r of this.obRooms) {
      if (!r.floor) continue;
      const mat = O.floor[OB_ROOMS[r.id]?.[0] || 'clinical'];
      for (const [x0, x1, z0, z1] of r.rects) {
        const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0.001, (z0 + z1) / 2);
        const p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / S, -p.getZ(i) / S);
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.visible = false; this.group.add(m); O.meshes.push(m);
      }
    }
    // walls: each face, in pieces of at most a metre, takes the wall recipe of the room it faces (a wall between two
    // rooms is painted for each); the top is a plain cap. Built inside the wall's own group, so it cuts away with it.
    const mats = [O.wall.clinical, O.wall.maintenance, O.cap], key = { clinical: 0, maintenance: 1 };
    for (const w of this.walls) {
      if (w.frame || w.style === 'glass') continue;
      const { minX: x0, maxX: x1, minZ: z0, maxZ: z1 } = w.box, y0 = w.y0 || 0, h = w.h;
      const buf = [[], [], []]; // per material: [pos, normal, uv] triangles
      const quad = (mi, BL, BR, TR, TL, n, u0, u1) => {
        const P = [BL, BR, TR, BL, TR, TL], U = [[u0, BL[1] / H], [u1, BR[1] / H], [u1, TR[1] / H], [u0, BL[1] / H], [u1, TR[1] / H], [u0, TL[1] / H]];
        for (let k = 0; k < 6; k++) buf[mi].push(P[k], n, U[k]);
      };
      // faces: outward normal, the along-face axis seen from outside (right), its extent
      const faces = [
        { n: [0, 0, 1], at: z1, r: [1, 0], a0: x0, a1: x1 }, { n: [0, 0, -1], at: z0, r: [-1, 0], a0: x0, a1: x1 },
        { n: [1, 0, 0], at: x1, r: [0, -1], a0: z0, a1: z1 }, { n: [-1, 0, 0], at: x0, r: [0, 1], a0: z0, a1: z1 },
      ];
      for (const F of faces) {
        const len = F.a1 - F.a0, nSeg = Math.max(1, Math.ceil(len / 1.0)), alongX = F.n[0] === 0;
        for (let s = 0; s < nSeg; s++) {
          let a = F.a0 + (len * s) / nSeg, b = F.a0 + (len * (s + 1)) / nSeg, c = (a + b) / 2;
          const sx = alongX ? c : F.at + F.n[0] * 0.25, sz = alongX ? F.at + F.n[2] * 0.25 : c;
          const room = this.roomAt(sx, sz);
          const mi = key[OB_ROOMS[room]?.[1] || 'clinical'];
          const pt = (t, y) => (alongX ? [t, y, F.at] : [F.at, y, t]);
          const rs = alongX ? F.r[0] : F.r[1]; // +1: right runs with the axis
          if (rs < 0) [a, b] = [b, a];
          quad(mi, pt(a, y0), pt(b, y0), pt(b, h), pt(a, h), F.n, (a * rs) / H, (b * rs) / H);
        }
      }
      buf[2].push([x0, h, z1], [0, 1, 0], [0, 0], [x1, h, z1], [0, 1, 0], [1, 0], [x1, h, z0], [0, 1, 0], [1, 1], [x0, h, z1], [0, 1, 0], [0, 0], [x1, h, z0], [0, 1, 0], [1, 1], [x0, h, z0], [0, 1, 0], [0, 1]);
      const pos = [], nor = [], uvs = [], g = new THREE.BufferGeometry(); let start = 0;
      buf.forEach((b, mi) => { for (let k = 0; k < b.length; k += 3) { pos.push(...b[k]); nor.push(...b[k + 1]); uvs.push(...b[k + 2]); } const cnt = b.length / 3; if (cnt) g.addGroup(start, cnt, mi); start += cnt; });
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const m = new THREE.Mesh(g, mats); m.receiveShadow = true; m.visible = false; w.group.add(m); w.cute = w.group.children.filter((c) => c !== m); w.ob = m;
    }
    // blood: deliberate, sparse placements (the kit's recipes); the main fighting lanes stay clear
    const D = new THREE.Group(); D.visible = false; this.group.add(D); O.decals = D;
    const flat = (kind, x, z, w, l, rot) => { const m = new THREE.Mesh(OB_FLAT, O.blood[kind]); m.position.set(x, 0.008, z); m.scale.set(w, 1, l); m.rotation.y = (rot * Math.PI) / 180; m.renderOrder = 1; D.add(m); };
    const onWall = (kind, x, z, face, y, size, tilt = 0) => { // (x, z) on the wall face; drips stay downward
      const m = new THREE.Mesh(OB_UPRIGHT, O.blood[kind]); m.scale.setScalar(size); m.rotation.set(0, FACE_ROT[face], (tilt * Math.PI) / 180);
      const o = { s: [0, 0.012], n: [0, -0.012], e: [0.012, 0], w: [-0.012, 0] }[face]; m.position.set(x + o[0], y, z + o[1]); m.renderOrder = 1; D.add(m);
      this.attachToWall(m, x, z, face, y + size / 2);
    };
    for (const d of this.f3 ? OB_BLOOD : OB_BLOOD_WING) d.wall ? onWall(d.kind, d.x, d.z, d.wall, d.y, d.size, d.tilt) : flat(d.kind, d.x, d.z, d.w, d.l, d.rot);
    O.built = true;
    if (O.on) this.setOutbreak(true);
  }
  // the reveal: the worn surfaces and the blood on (the opening calls this with its own blood; false restores the clean look)
  setOutbreak(on) {
    if (!this.ob && on) this.loadOutbreak(); // (built on first use outside Floor 3: the weapon test arena)
    const O = this.ob; if (!O) return;
    O.on = on; if (!O.built) return;
    for (const m of this.cuteFloors || []) m.visible = !on;
    for (const m of O.meshes) m.visible = on;
    for (const w of this.walls) if (w.ob) { w.ob.visible = on; for (const c of w.cute) c.visible = !on; }
    O.decals.visible = on;
    this.renderer.shadowMap.needsUpdate = true;
  }

  // wall-mounted things belong to the wall they hang on: they hide while that wall is cut away below them
  attachToWall(obj, x, z, face, top) {
    if (!this.f3) return;
    let best = null, bd = 0.35;
    for (const w of this.walls) {
      if (w.frame) continue;
      const b = w.box;
      const along = face === 's' || face === 'n' ? (x >= b.minX - 0.05 && x <= b.maxX + 0.05) : (z >= b.minZ - 0.05 && z <= b.maxZ + 0.05);
      if (!along) continue;
      const dist = face === 's' ? Math.abs(z - b.maxZ) : face === 'n' ? Math.abs(z - b.minZ) : face === 'e' ? Math.abs(x - b.maxX) : Math.abs(x - b.minX);
      if (dist < bd) { bd = dist; best = w; }
    }
    if (best && top > LOW_H + 0.05) best.attach.push(obj);
  }

  // a kit door (or the lift) standing between the camera and Yola is cut flat at `low` metres like the walls either side
  // of it (a clipping plane per object; high enough that a door's brace or bar still shows). The planes are attached on
  // the first gameplay frame: compiling clipped programs during the opening's warm-up render broke three's uniforms.
  cutable(root, rect, low = 1.45) { this.cutObjs.push({ root, rect, low, k: 1, target: 1, plane: null }); }
  armCuts() {
    this.renderer.localClippingEnabled = true;
    for (const c of this.cutObjs) {
      c.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 50);
      c.root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { m.clippingPlanes = [c.plane]; m.clipShadows = true; m.needsUpdate = true; } });
    }
    this.cutsArmed = true;
  }

  // the opening's operating-room scenes: cut the walls for a viewpoint at once (no kit-door clipping before play starts)
  cutWalls(px, pz, camYaw) {
    if (!this.f3) return;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    for (const w of this.walls) {
      const b = w.box, nx = Math.max(b.minX, Math.min(px, b.maxX)), nz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      w.target = w.k = (nx - px) * fx + (nz - pz) * fz < -0.3 ? 0 : 1;
      const low = w.lintel ? 0 : LOW_H / w.h;
      w.group.scale.y = low + (1 - low) * w.k; if (w.lintel) w.group.visible = w.k > 0.5;
      for (const at of w.attach) at.visible = w.k > 0.97;
    }
  }

  // ---- per frame (floor 3): the cut-away, the shadow window, the doors and the lift from the level state ----
  // ---- emergency lighting (Floor 3 after the outbreak), graded across the whole floor for almost nothing: the one
  //      shadowed sun turns a cold, dimmer emergency white, the fill goes cold blue over a dark red bounce, one red
  //      hemisphere light breathes like a rotating beacon, and glow pools lie on the floor under the fittings and at the
  //      doorways (unlit additive decals: red, and a few cold white tubes still working). No extra lights or shadows.
  setEmergency(on, fade = 1.6) {
    if (!this.f3 || !this.hemi) return;
    if (!this.em) this.buildEmergency();
    this.em.target = on ? 1 : 0; this.em.rate = fade > 0 ? 1 / fade : 1e9;
    if (fade <= 0) this.tickEmergency(0);
  }
  buildEmergency() {
    const s = this.scene;
    const e = this.em = { k: 0, t: 0, target: 0, rate: 1, base: { sky: this.hemi.color.clone(), ground: this.hemi.groundColor.clone(), hemiI: this.hemi.intensity, sunC: this.sun.color.clone(), sunI: this.sun.intensity, env: s.environmentIntensity } };
    const pool = (rgb) => { // a soft radial glow
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},0.5)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    };
    e.redMat = pool('255,40,24'); e.coldMat = pool('190,220,255');
    const grp = new THREE.Group(); grp.name = 'emergency'; grp.visible = false; s.add(grp); e.group = grp;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const put = (m, x, z, size) => { const p = new THREE.Mesh(geo, m); p.position.set(x, 0.02, z); p.scale.set(size, 1, size); p.renderOrder = 2; grp.add(p); };
    for (const l of LAYOUT.lights || []) put(e.redMat, l.x, l.z, 5.5);
    for (const d of LAYOUT.doors || []) if (d.kind !== 'lift') put(e.redMat, d.x, d.z, 2.6);
    for (const r of LAYOUT.rooms || []) for (const [x0, x1, z0, z1] of r.rects) { const w = x1 - x0, dd = z1 - z0; if (w * dd > 12) put(e.coldMat, (x0 + x1) / 2, (z0 + z1) / 2, Math.min(w, dd) * 0.8); }
  }
  tickEmergency(dt) {
    const e = this.em; if (!e) return;
    if (e.k === e.target && e.k === 0) return;
    e.k += Math.max(-dt * e.rate, Math.min(dt * e.rate, e.target - e.k)); if (dt === 0) e.k = e.target; e.t += dt;
    const k = e.k, beacon = 0.5 + 0.5 * Math.sin((e.t * Math.PI * 2) / 1.9); // one slow sweep of a rotating beacon
    this.hemi.color.copy(e.base.sky).lerp(EM_SKY, k); this.hemi.groundColor.copy(e.base.ground).lerp(EM_GROUND, k);
    this.hemi.intensity = e.base.hemiI + (0.52 - e.base.hemiI) * k;
    this.sun.color.copy(e.base.sunC).lerp(EM_SUN, k); this.sun.intensity = e.base.sunI + (0.72 - e.base.sunI) * k;
    this.scene.environmentIntensity = e.base.env + (0.17 - e.base.env) * k;
    if (this.redHemi) this.redHemi.intensity = k * (0.18 + 0.5 * beacon);
    e.group.visible = k > 0.005;
    e.redMat.opacity = k * (0.22 + 0.3 * beacon); e.coldMat.opacity = k * 0.16 * (0.92 + 0.08 * Math.sin(e.t * 37) * Math.sin(e.t * 5.3)); // (a tube that hums)
  }

  update(dt, px, pz, camYaw, level) {
    if (!this.f3) return;
    this.tickEmergency(dt);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw); // screen-up on the floor
    const side = (b) => { // signed screen-up distance of a rectangle's nearest point from Yola (negative: camera side)
      const nx = Math.max(b.minX, Math.min(px, b.maxX)), nz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      return (nx - px) * fx + (nz - pz) * fz;
    };
    const rate = Math.min(1, dt * 7);
    for (const w of this.walls) {
      const s = side(w.box);
      w.target = s < -0.3 ? 0 : 1;
      if (w.k !== w.target) {
        w.k += (w.target - w.k) * rate; if (Math.abs(w.k - w.target) < 0.01) w.k = w.target;
        const low = w.frame ? LOW_H / w.h : w.lintel ? 0 : LOW_H / w.h;
        w.group.scale.y = low + (1 - low) * w.k;
        if (w.lintel) w.group.visible = w.k > 0.5;
        for (const a of w.attach) a.visible = w.k > 0.97;
      }
    }
    if (!this.cutsArmed) this.armCuts();
    for (const c of this.cutObjs) {
      c.target = side(c.rect) < -0.3 ? 0 : 1;
      if (c.k !== c.target) { c.k += (c.target - c.k) * rate; if (Math.abs(c.k - c.target) < 0.01) c.k = c.target; }
      c.plane.constant = c.k >= 1 ? 50 : c.low + (3.1 - c.low) * c.k;
    }
    // the sun's shadow window follows Yola in steps (the shadow map is redrawn only when it moves or a door moves)
    if (this.sun && this.sun.castShadow) {
      const sx = Math.round(px / 4) * 4, sz = Math.round(pz / 4) * 4;
      if (sx !== this.shX || sz !== this.shZ) {
        this.shX = sx; this.shZ = sz;
        this.sun.target.position.set(sx, 0, sz); this.sun.position.set(sx - 6, 14, sz + 7); this.sun.target.updateMatrixWorld(true);
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    if (!level) return;
    let moved = false;
    for (const key of ['brace', 'ctbar']) {
      const k = this.doorKits[key], d = level.doors[key]; if (!k || !d) continue;
      if (d.brace !== k.lastB || d.open !== k.last) {
        k.lastB = d.brace; k.last = d.open; moved = true;
        k.brace.time = d.brace * BRACE_TIME * 0.999; k.open.time = d.open * DOOR_OPEN_TIME * 0.999;
        k.mixer.update(0);
        if (d.open >= 1 && k.root.getObjectByName('Brace_REMOVABLE')) k.root.getObjectByName('Brace_REMOVABLE').visible = false; // parked out of sight once the way is open
      }
      if (k.shake > 0) { k.shake = Math.max(0, k.shake - dt); const a = Math.sin(k.shake * 60) * 0.025 * (k.shake / 0.35); if (k.L) k.L.rotation.z = a; if (k.R) k.R.rotation.z = -a; if (!k.shake) { k.L && (k.L.rotation.z = 0); k.R && (k.R.rotation.z = 0); } }
    }
    const L = this.doorKits.lift;
    if (L && level.lift.open !== L.last) { L.last = level.lift.open; L.open.time = level.lift.open * 0.999; L.mixer.update(0); moved = true; }
    if (this.reset && this.reset.t >= 0) { this.reset.t += dt; this.reset.mixer.update(dt); if (this.reset.t > 0.7) this.reset.t = -1; }
    if (moved) this.renderer.shadowMap.needsUpdate = true;
  }
  // the brace rattles in its receivers: the residents on the other side pushing
  bang(door) { const k = this.doorKits[door]; if (k && !(k.last > 0)) k.shake = 0.35; }
  liftPowered(on) {
    const r = this.reset; if (!r) return;
    if (on) { r.up.reset(); r.up.play(); r.t = 0; } else { r.up.stop(); r.mixer.update(0); }
    if (r.fault) r.fault.visible = !on; if (r.ready) r.ready.visible = on;
    if (this.liftStatus) { this.liftStatus.fault.visible = !on; this.liftStatus.ready.visible = on; }
  }
  // restore every door and the lift to a level's state (a fresh floor, a retry)
  syncLevel(level) {
    if (!this.f3) return;
    for (const k of Object.values(this.doorKits)) { k.last = -1; k.lastB = -1; const b = k.root.getObjectByName('Brace_REMOVABLE'); if (b && k.kind !== 'closed') b.visible = true; }
    this.liftPowered(!!level?.flags.lift_power_restored);
    if (level?.flags.lift_power_restored && this.reset) { this.reset.up.reset(); this.reset.up.play(); this.reset.up.time = this.reset.up.getClip().duration; this.reset.mixer.update(0); this.reset.t = -1; }
    this.resetPickups(level ? [...level.taken] : []);
  }
}
