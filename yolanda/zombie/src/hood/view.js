// Chapter 2: draws the neighbourhood from its Blender export (blender/hood/export_layout.py):
//   assets/neighborhood/hood_layout.json   every placed model (file + world matrix), the collision, named marks, seal tags
//   assets/neighborhood/hood_ground.glb     the ground meshes (terrain, roads, kerbs, paths, water ...)
// Each model loads once; its placements become instanced meshes, one per mesh and material in each 32 m cell of the map
// so whatever is off screen is culled (the fixed camera sees ~8 x 15 m of a phone screen). Seal props (Blender tag
// 'seal:<id>') are drawn on their own: the story topples them aside when it opens the way (openSeal).
// Also here: the pickups (the rifle, the bolt cutters, the keys) and the gas can, the rifle in Marc's hands, the lit garage.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { initMaterials, swapMaterials, kitMaterial, texturesReady, shoreWater } from './materials.js';
import { terrainMaterial } from './terrain.js';
import { groundY } from './layout.js';

const _Y = new THREE.Vector3(0, 1, 0);

const HOOD_ROOT = 'assets/neighborhood/';
// the maps this view draws: Chapter 2's neighbourhood, and Chapter 4's peninsula (blender/grammy/export_grammy.py). Each has
// its ground masks (mask_hood.py) and baked light (bake_hood.py) over rect = [x0, z0, width, depth]
export const MAPS = {
  hood: { root: HOOD_ROOT, layout: 'hood_layout.json', ground: 'hood_ground.glb', splat: 'hood_splat.png', paths: 'hood_paths.png', lawn: 'hood_lawn.png', light: 'hood_light.jpg', rect: [-70, -130, 180, 226] },
  grammy: { root: 'assets/grammy/', layout: 'grammy_layout.json', ground: 'grammy_ground.glb', splat: 'grammy_splat.png', paths: 'grammy_paths.png', light: 'grammy_light.jpg', rect: [-135, -250, 310, 330] },
};
let MAP = MAPS.hood, ROOT = MAP.root;
export function useMap(id) { MAP = MAPS[id] || MAPS.hood; ROOT = MAP.root; return MAP; }
export const SPLAT_RECT = MAPS.hood.rect; // (Chapter 2's splat mask extents: bake_hood.py / mask_hood.py X0, Z0, width, depth)
const CELL = 32;
const NO_SHADOW = /^(nbt_|palm_|yard_|shrub_|nb_frond|trees|curb|by_ball|yardprop_dry)/; // (foliage and clutter cast no shadows: PERF lessons)
// (a path from assets/ is the game's own file: the shotgun the hero already loads)
const PICKUP_MODELS = { rifle: 'props/security_rifle.glb', cutters: 'models/boltcutters.glb', gas: 'models/nb_fuel_can.glb', ammo: 'kit/military_crate.glb', health: 'models/loot_crate.glb', radio: 'props/hospital_radio.glb',
  case: 'props/hood_case.glb', shotgun: 'assets/weapons/pump_short.glb', cooler: 'models/by_cooler.glb' };
const PICKUP_SCALE = { ammo: 0.55, health: 0.45 };

// the lake must not show inside the boat's open hull (Marc, 2026-10-21: "make sure the water doesn't clip through the boat"):
// an unseen cover over the hull at its waterline (the outline of the hull there, a little in), drawn after everything solid
// and writing only depth, so the water (drawn after it, see-through) is hidden under it. It rides with the boat.
const WATER_Y = 0.04;   // (the lake's surface: the lake mesh in blender/hood/hood.blend)
function hullMask(o) {
  o.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), v = new THREE.Vector3(), wl = (WATER_Y - o.position.y) / (o.scale.y || 1), pts = [];
  o.traverse((m) => {
    if (!m.isMesh) return; const pos = m.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(M); if (v.y > wl - 0.05 && v.y < wl + 0.25) pts.push([v.x, v.z]); }
  });
  if (pts.length < 3) return;
  // (the outline: the convex hull of the hull's points round its waterline, 3 cm in)
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o2, a, b) => (a[0] - o2[0]) * (b[1] - o2[1]) - (a[1] - o2[1]) * (b[0] - o2[0]);
  const lo = [], hi = [];
  for (const q of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of pts.slice().reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  const ring = lo.slice(0, -1).concat(hi.slice(0, -1)), cx = ring.reduce((a, q) => a + q[0], 0) / ring.length, cz = ring.reduce((a, q) => a + q[1], 0) / ring.length;
  const shape = new THREE.Shape(ring.map(([x, z]) => { const d = Math.hypot(x - cx, z - cz) || 1, k = Math.max(0, d - 0.03) / d; return new THREE.Vector2(cx + (x - cx) * k, -(cz + (z - cz) * k)); }));
  const mask = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  mask.rotation.x = -Math.PI / 2; mask.position.y = wl + 0.06; mask.renderOrder = 10; mask.name = 'hullMask'; mask.castShadow = mask.receiveShadow = false;
  o.add(mask);
}

export class HoodView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'hood'; scene.add(this.group);
    this.fxGroup = new THREE.Group(); this.fxGroup.name = 'hood-fx'; scene.add(this.fxGroup);
    this.layout = null; this.stats = { models: 0, placed: 0, draws: 0 };
    this.seals = {}; this.anims = []; this.pickups = new Map(); this.props = {};
  }

  async load(gameLoader, onProgress = () => {}) {
    initMaterials();
    // the ground's splat mask (blender/hood/mask_hood.py: dirt along the kerbs and walls, litter under trees, dry edges, the
    // shore), laid by world x / z over the bake's extents; the grass's keep-off map beside it (grass.js)
    const tl = new THREE.TextureLoader(), mask = (f) => tl.loadAsync(ROOT + f).then((t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; return t; }).catch(() => null);
    [this.splat, this.paths, this.lawn] = await Promise.all([mask(MAP.splat), mask(MAP.paths), MAP.lawn ? mask(MAP.lawn) : null]); this.rect = MAP.rect;
    this.layout = await fetch(ROOT + MAP.layout).then((r) => r.json());
    const L = this.layout;
    // (polish 4) the download diet: tools/hood/optimize.mjs wrote meshopt-compressed copies with WebP textures to opt/
    // (58.6 -> 20.9 MB); ?opt=0 loads the originals
    const useOpt = L.opt && new URLSearchParams(location.search).get('opt') !== '0';
    const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
    const loader = { loadAsync: (url) => gl.loadAsync(useOpt && url.startsWith(ROOT) && !url.endsWith('.json') ? url.replace(ROOT, ROOT + 'opt/') : url) };
    void gameLoader;
    let done = 0; const total = L.models.length + 4;
    const ground = loader.loadAsync(ROOT + MAP.ground).then((g) => { this.addGround(g.scene); onProgress(++done / total); });
    const props = Promise.all(Object.entries(PICKUP_MODELS).map(([k, f]) => loader.loadAsync(f.startsWith('assets/') ? f : HOOD_ROOT + f).then((g) => { swapMaterials(g.scene); this.props[k] = g.scene; onProgress(++done / total); }).catch((e) => console.warn('hood prop', f, e))));
    const tmpls = await Promise.all(L.models.map((f) => loader.loadAsync(ROOT + f).then((g) => { onProgress(++done / total); return g.scene; }).catch((e) => { console.warn('hood model', f, e); return null; })));
    await Promise.all([ground, props]);
    for (const root of tmpls) {
      if (!root) continue;
      const drop = []; root.traverse((o) => { if (/-(conv)?col(only)?$|colonly/i.test(o.name)) drop.push(o); }); for (const o of drop) o.removeFromParent(); // (Godot-style collision meshes are never drawn)
      swapMaterials(root); root.updateMatrixWorld(true);
    }
    const tagOf = new Map(); for (const [tag, list] of Object.entries(L.tags || {})) for (const i of list) tagOf.set(i, tag);
    const byModel = L.models.map(() => []);
    L.placed.forEach((p, i) => {
      const M = new THREE.Matrix4().fromArray(p, 1);
      if (!tagOf.has(i)) { byModel[p[0]].push(M); return; }
      const root = tmpls[p[0]]; if (!root) return;
      const o = root.clone(true); M.decompose(o.position, o.quaternion, o.scale);
      o.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; } });
      const tag = tagOf.get(i).replace(/^seal:/, '');
      (this.seals[tag] ||= []).push({ o, p0: o.position.clone(), q0: o.quaternion.clone(), file: L.models[p[0]] });
      this.group.add(o);
    });
    const _m = new THREE.Matrix4(), _p = new THREE.Vector3();
    L.models.forEach((file, i) => {
      const root = tmpls[i]; if (!root || !byModel[i].length) return;
      const name = file.split('/').pop().replace('.glb', ''), shadow = !NO_SHADOW.test(name);
      const meshes = []; root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
      const cells = new Map();
      for (const M of byModel[i]) {
        _p.setFromMatrixPosition(M);
        const k = Math.floor(_p.x / CELL) + ',' + Math.floor(_p.z / CELL);
        if (!cells.has(k)) cells.set(k, []); cells.get(k).push(M);
      }
      for (const list of cells.values()) for (const mesh of meshes) {
        const mats = [].concat(mesh.material);
        const im = new THREE.InstancedMesh(mesh.geometry, mats.length > 1 ? mats : mats[0], list.length);
        list.forEach((M, j) => im.setMatrixAt(j, _m.multiplyMatrices(M, mesh.matrixWorld)));
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox?.();
        im.castShadow = shadow; im.receiveShadow = true; im.name = name;
        this.group.add(im); this.stats.draws++;
      }
      this.stats.models++; this.stats.placed += byModel[i].length;
    });
    await texturesReady();
    this.group.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
    for (const list of Object.values(this.seals)) for (const s of list) s.o.traverse((q) => { q.matrixAutoUpdate = true; }); // (they move: the gate's leaves too)
    for (const s of this.seals.boat || []) hullMask(s.o);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color: 0x3dff72, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2;
    return this;
  }

  addGround(root) {
    swapMaterials(root);
    const terr = this.terrain = terrainMaterial({ splat: this.splat, paths: this.paths, lawn: this.lawn, rect: this.rect });
    if (this.paths) shoreWater(this.paths, this.rect);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const n = [].concat(o.material)[0]?.name || '';
      if (/^HOOD_terrain/.test(n)) o.material = terr;
      else if (/^HOOD_markings/.test(n)) o.material = kitMaterial('flat__offwhite');
      o.receiveShadow = true; o.castShadow = false;
      if (/^(terrain|lake)/.test(o.name)) o.renderOrder = -1;
    });
    this.group.add(root);
  }

  // ---- seals: open = the gate's leaves swing, everything else topples away from the line (or snaps there on a restore)
  openSeal(id, open = true, animate = true) {
    const list = this.seals[id]; if (!list) return;
    for (const s of list) {
      // Marc's front door (his row, drawn on its own: blender/hood/ch2_home.py) swings in; the fridge door swings out
      // (the shed's double doors: their swings as make_ch2_props.py SHED_OPEN)
      const hinges = /kit_row4_intact/.test(s.file) ? [[this.doorLeaf(s.o), 1.75]] : /hood_fridge/.test(s.file) ? [[s.o.getObjectByName('FridgeDoor'), -1.75]]
        : /hood_shed/.test(s.file) ? [[s.o.getObjectByName('DoorL'), -1.75], [s.o.getObjectByName('DoorR'), 0.85]] : null;
      if (hinges) {
        for (const [leaf, ang] of hinges) {
          if (!leaf) continue;
          leaf.userData.q0 ??= leaf.quaternion.clone();
          this.anim(animate ? 1.1 : 0, (k) => { leaf.quaternion.copy(leaf.userData.q0); leaf.rotateOnWorldAxis(_Y, ang * k); }, open);
        }
        continue;
      }
      // Chapter 4's guard gate: each lift bar turns up about its pivot (blender/grammy/make_gprops.py: the pole along the
      // node 'Bar''s x, lifted by turning it about its z)
      if (/grammy_gatebar/.test(s.file)) {
        let bar = null; s.o.traverse((o) => { if (!bar && /^Bar/.test(o.name)) bar = o; }); if (!bar) continue;   // (Blender may number it: Bar001)
        bar.userData.q0 ??= bar.quaternion.clone();
        this.anim(animate ? 2.2 : 0, (k) => { bar.quaternion.copy(bar.userData.q0); bar.rotateZ(1.42 * k * k * (3 - 2 * k)); }, open);
        continue;
      }
      const gate = /palisade_gate/.test(s.file);
      if (gate) {
        const L = s.o.getObjectByName('GateL_v2'), R = s.o.getObjectByName('GateR_v2');
        for (const n of ['Chain_v2', 'Padlock_v2']) { const c = s.o.getObjectByName(n); if (c) c.visible = !open; }
        this.anim(animate ? 1.4 : 0, (k) => { if (L) L.rotation.y = -1.75 * k; if (R) R.rotation.y = 1.75 * k; }, open);
        continue;
      }
      // fall over away from the player's side, a little apart, then rest flat (the barricade pushed over)
      const side = Math.random() < 0.5 ? -1 : 1, axis = new THREE.Vector3(1, 0, 0).applyQuaternion(s.q0), tilt = new THREE.Quaternion();
      const slide = new THREE.Vector3(0, 0, 1).applyQuaternion(s.q0).multiplyScalar(side * 0.6);
      this.anim(animate ? 0.7 + Math.random() * 0.4 : 0, (k) => {
        tilt.setFromAxisAngle(axis, side * 1.45 * k * k);
        s.o.quaternion.copy(s.q0).premultiply(tilt);
        s.o.position.copy(s.p0).addScaledVector(slide, k); s.o.position.y = s.p0.y - 0.12 * k;
      }, open);
    }
  }
  // the end unit's front door leaf (the row model has twelve: the one nearest Marc's doorway)
  doorLeaf(root) {
    if (root.userData.leaf !== undefined) return root.userData.leaf;
    let best = null, bd = 1e9; const p = new THREE.Vector3(); root.updateMatrixWorld(true);
    root.traverse((o) => { if (!/^Door_Leaf_Hinge/.test(o.name)) return; o.getWorldPosition(p); const d = Math.hypot(p.x - 36.25, p.z - 38.95); if (d < bd) { bd = d; best = o; } });
    return (root.userData.leaf = bd < 1.5 ? best : null);
  }
  anim(dur, fn, on = true) {
    if (!on) { fn(0); return; }
    if (dur <= 0) { fn(1); return; }
    this.anims.push({ t: 0, dur, fn });
  }

  // ---- pickups lying in the world: the model (or a key ring), a slow bob and a pulsing green ring
  showPickup(q) {
    const g = new THREE.Group(); g.position.set(q.x, q.y ?? groundY(q.x, q.z), q.z);
    const src = this.props[q.model];
    let m;
    if (src) { m = src.clone(true); if (q.model === 'shotgun') { m.rotation.set(0, 0, 0); m.position.y = 0.03; /* (across the rack's pegs, along the wall) */ } else if (q.model === 'rifle') { m.rotation.set(-Math.PI / 2, 0, 0.6); m.position.y = 0.05; } else if (q.model === 'cutters') { m.rotation.set(Math.PI / 2, 0, 0.4); m.position.y = 0.04; } }
    else { m = this.keyRing(); }
    if (PICKUP_SCALE[q.model]) { m.scale.setScalar(PICKUP_SCALE[q.model]); m.rotation.y = Math.random() * 3; }
    g.add(m);
    const r = this.ring.clone(); r.position.y = 0.03; g.add(r); if (q.y) r.visible = false; // (up on a rack: no ring in the air)
    this.fxGroup.add(g); this.pickups.set(q.id, { g, ring: r, item: m, t: Math.random() * 6 });
  }
  takePickup(id) { const p = this.pickups.get(id); if (p) { p.g.removeFromParent(); this.pickups.delete(id); } }
  keyRing() {
    const g = new THREE.Group(), metal = new THREE.MeshStandardMaterial({ color: 0xc9b57a, metalness: 0.8, roughness: 0.35 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 16), metal); ring.rotation.x = Math.PI / 2; g.add(ring);
    for (const a of [0.3, 1.1]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.07), metal); k.position.set(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05); k.rotation.y = -a; g.add(k); }
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.03), new THREE.MeshStandardMaterial({ color: 0xd94b2b })); tag.position.set(-0.05, 0, 0); g.add(tag);
    g.position.y = 0.02; g.scale.setScalar(2.2); // (bigger than life so it reads at this camera)
    return g;
  }

  // ---- the gas can: in the pickup's bed, on the ground where Marc set it, in his hand, or stowed in the boat
  gasObj() {
    if (!this.gas) { this.gas = this.props.gas ? this.props.gas.clone(true) : new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: 0xa22a1a })); this.gas.scale.setScalar(0.8); this.fxGroup.add(this.gas); this.gasRing = this.ring.clone(); this.fxGroup.add(this.gasRing); }
    return this.gas;
  }
  placeGas(x, z, inBed = false) { const g = this.gasObj(); this.gasMode = 'ground'; g.visible = true; g.position.set(x, inBed ? 0.95 : 0, z); g.rotation.set(0, 0.4, 0); this.gasRing.visible = true; this.gasRing.position.set(x, 0.03, z); }
  carryGas() { this.gasObj(); this.gasMode = 'carried'; this.gasRing.visible = false; }
  stowGas() { const g = this.gasObj(); this.gasMode = 'boat'; this.gasRing.visible = false; const b = this.layout.marks.boat; if (b) { g.position.set(b[0] + 0.4, 0.55, b[2]); } }

  // ---- the case of four vials: in the fridge, at Marc's left side once he has it, in the boat's cooler
  showCase(state, at = null) {
    if (!this.caseObj && this.props.case) { this.caseObj = this.props.case.clone(true); this.caseObj.scale.setScalar(0.78); this.caseObj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); this.fxGroup.add(this.caseObj); }
    const c = this.caseObj; if (!c) return;
    this.caseMode = state; c.visible = state === 'fridge' || state === 'carried';
    if (state === 'fridge' && at) { c.position.set(at.x, at.y, at.z); c.rotation.set(0, Math.PI / 2, 0); }
  }
  // the boat's cooler (by_cooler, on the boat's stern seat: it leaves with the boat)
  showCooler(on) {
    const b = this.seals.boat?.[0]; if (!b) return;
    if (!this.cooler && this.props.cooler) { this.cooler = this.props.cooler.clone(true); this.cooler.scale.setScalar(0.8); this.cooler.position.set(0.9, 0.42, 0.15); this.cooler.rotation.y = 0.3; b.o.add(this.cooler); }
    if (this.cooler) this.cooler.visible = on;
  }
  coolerAt() { if (!this.cooler) return null; const v = this.cooler.getWorldPosition(new THREE.Vector3()); return { x: v.x, y: v.y + 0.2, z: v.z }; }
  // the shed's shotgun takes the rifle's place in his hands: the pump's own mesh back
  rifleOff() {
    const sg = window.game?.yola?.shotgun; if (!sg || !this.rifleIn) return;
    this.rifleIn.removeFromParent(); this.rifleIn = null;
    for (const c of sg.children) c.visible = true;
    if (this.rifleKeep) Object.assign(sg.userData, this.rifleKeep);
  }

  // ---- the escape boat (tagged 'boat' in Blender, drawn on its own): its spot at the dock, then out over the water with a
  // gentle rock and a wake
  boatStart() {
    const b = this.seals.boat?.[0]; if (!b) return null;
    if (!this.wake) { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }); this.wake = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7), m); this.wake.rotation.x = -Math.PI / 2; this.fxGroup.add(this.wake); }
    return { x: b.p0.x, z: b.p0.z };
  }
  boatAt(x, z, t) {
    const b = this.seals.boat?.[0]; if (!b) return;
    b.o.position.set(x, b.p0.y + 0.04 * Math.sin(t * 2.3), z);
    b.o.quaternion.copy(b.q0); b.o.rotateZ(0.025 * Math.sin(t * 1.7));
    if (this.wake) { this.wake.position.set(x + 4.2, 0.06, z + 0.6); this.wake.rotation.z = Math.PI / 2 - 0.14; this.wake.material.opacity = Math.min(0.35, t * 0.08); }
  }

  // ---- Marc's radio (the user's Hospital Radio, the "07" display) on his belt at the right hip, all the way through
  radioUpdate(yola, sim) {
    if (!this.radio && this.props.radio) { this.radio = this.props.radio.clone(true); this.radio.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); this.fxGroup.add(this.radio); }
    const hips = yola?.bones?.Hips; if (!this.radio || !hips || !sim) return;
    const p = sim.player;
    if (this.radioHand && yola.bones.RightHand && yola.bones.LeftHand) {
      const R = yola.bones.RightHand.getWorldPosition(this._rh || (this._rh = new THREE.Vector3())), L = yola.bones.LeftHand.getWorldPosition(this._lh || (this._lh = new THREE.Vector3()));
      const h = R.y >= L.y ? R : L; this.radio.position.copy(h); this.radio.position.y -= 0.04;
      this.radio.rotation.set(0, p.aimYaw + Math.PI, R.y >= L.y ? -0.35 : 0.35); this.radio.visible = yola.outer.visible && !p.dead;
      this.caseUpdate(yola, p); return;
    }
    hips.getWorldPosition(this.radio.position);
    const y = p.aimYaw; this.radio.position.x -= Math.cos(y) * 0.2; this.radio.position.z += Math.sin(y) * 0.2; this.radio.position.y -= 0.2;
    this.radio.rotation.set(0, y - Math.PI / 2, 0); this.radio.visible = yola.outer.visible && !p.dead;
    this.caseUpdate(yola, p);
  }
  // the case at his left hip (slung), while he has it
  caseUpdate(yola, p) {
    const c = this.caseObj; if (!c || this.caseMode !== 'carried') return;
    yola.bones.Hips.getWorldPosition(c.position); const y = p.aimYaw;
    c.position.x += Math.cos(y) * 0.24 - Math.sin(y) * 0.05; c.position.z -= Math.sin(y) * 0.24 + Math.cos(y) * 0.05; c.position.y -= 0.3;
    c.rotation.set(Math.PI / 2, y + Math.PI / 2, 0); c.visible = yola.outer.visible && !p.dead;
  }

  // ---- the rifle in Marc's hands: the shotgun's hold (its grips are the same points), the rifle's mesh instead of the pump
  rifleOn(yola) {
    const sg = yola?.shotgun, src = this.props.rifle; if (!sg || !src || this.rifleIn) return;
    for (const c of sg.children) c.visible = false;
    const r = src.clone(true); r.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.rifleKeep = { pump: sg.userData.pump, gripL: sg.userData.gripL, muzzle: sg.userData.muzzle };
    sg.add(r); this.rifleIn = r;
    sg.userData.pump = new THREE.Object3D(); // (no pump to rack)
    sg.userData.gripL = r.getObjectByName('GameGrip_L') || sg.userData.gripL; sg.userData.muzzle = r.getObjectByName('Muzzle') || sg.userData.muzzle;
  }

  // ---- B06-L's lit garage (the clue to the bolt cutters): a warm pool on its floor and a glowing work lamp; no real light
  // (a light switched on mid-game recompiles every material on a phone)
  garageLight(on, at) {
    if (!this.glow && at) {
      const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,214,150,0.95)'); gr.addColorStop(0.45, 'rgba(255,190,110,0.35)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
      tex.colorSpace = THREE.SRGBColorSpace;
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: tex, color: 0xffb860, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(at.x, 0.04, at.z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a6, toneMapped: false })); bulb.position.set(at.x, 2.2, at.z);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.scale.set(3.2, 3.2, 1); halo.position.copy(bulb.position); // (polish: big enough to read in daylight from the curve)
      this.glow = new THREE.Group(); this.glow.add(pool, bulb, halo); this.fxGroup.add(this.glow);
    }
    if (this.glow) this.glow.visible = on;
  }

  update(dt, sim) {
    for (let i = this.anims.length - 1; i >= 0; i--) { const a = this.anims[i]; a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k * k * (3 - 2 * k)); if (k >= 1) this.anims.splice(i, 1); }
    for (const p of this.pickups.values()) { p.t += dt; p.ring.material.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(p.t * 5.5)); p.item.position.y = (p.item.userData.y0 ??= p.item.position.y) + 0.04 * (0.5 + 0.5 * Math.sin(p.t * 2.2)); }
    if (this.gasRing?.visible) this.gasRing.material.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(performance.now() / 180));
    if (this.gasMode === 'carried' && sim) { // hanging from his left hand by its handle (the can's top a few cm under the fist)
      // (the guns' and the bat's stances keep his left hand up at the chest: then it rides at his left side at carrying
      // height; a hand already down at his side carries it)
      const p = sim.player, hand = window.game?.yola?.bones?.LeftHand, a = p.aimYaw + 1.45;
      const hw = hand ? hand.getWorldPosition(this._hv || (this._hv = new THREE.Vector3())) : null;
      if (hw && hw.y < 0.95) this.gas.position.set(hw.x, Math.max(0.12, hw.y - 0.36), hw.z);
      else this.gas.position.set(p.x + Math.sin(a) * 0.34, 0.3, p.z + Math.cos(a) * 0.34);
      this.gas.rotation.set(0, p.aimYaw + Math.PI / 2, 0); this.gas.visible = !p.dead;
    }
  }
}
