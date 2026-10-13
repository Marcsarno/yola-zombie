// Hospital wing presentation built from LAYOUT: tiled floor, rounded cream/teal walls, glass partitions,
// dark doorways with amber emergency lamps, and the existing hospital-kit props.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LAYOUT } from '../core/layout.js';

const PAL = {
  floorA: '#e4d8bf', floorB: '#b9d3c8', grout: '#cdbfa3', wall: 0xece4d3, band: 0x6fa7a6, cap: 0xf5efe2,
  glass: 0xbfe0e2, frame: 0x8fb7bb, door: 0x2c3a42, amber: 0xffb347,
};

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const n = 2, s = 256 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g.fillStyle = (i + j) % 2 ? PAL.floorB : PAL.floorA; g.fillRect(i * s, j * s, s, s);
  }
  g.strokeStyle = PAL.grout; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke(); }
  // faint speckle so the floor reads as material, not flat colour
  const img = g.getImageData(0, 0, 256, 256);
  for (let k = 0; k < img.data.length; k += 4) { const v = (Math.random() - 0.5) * 6; img.data[k] += v; img.data[k + 1] += v; img.data[k + 2] += v; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Arena {
  constructor(scene, quality, renderer) {
    this.scene = scene; this.quality = quality;
    this.group = new THREE.Group(); scene.add(this.group);
    this.lights = [];
    this.buildFloor();
    this.buildWalls();
    this.buildDoors();
    this.buildLights(renderer);
  }

  buildFloor() {
    const b = LAYOUT.bounds;
    const w = 14.6, d = 22.6;
    const tex = floorTexture(); tex.repeat.set(w / 1.2, d / 1.2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.group.add(floor);
    // teal border inlay (like the concept's floor bands)
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x9fc7c0, roughness: 0.6 });
    const band = (x0, x1, z0, z1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), bandMat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2); m.receiveShadow = true; this.group.add(m); };
    band(-6.6, 6.6, -4.6, -4.35); band(-6.6, 6.6, 3.9, 4.15);
    // dark surround outside the walls (hides the void, costs nothing)
    const out = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x27323a }));
    out.rotation.x = -Math.PI / 2; out.position.y = -0.02; this.group.add(out);
  }

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: PAL.wall, roughness: 0.85 });
    const bandMat = new THREE.MeshStandardMaterial({ color: PAL.band, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({ color: PAL.cap, roughness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({ color: PAL.glass, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
    const frameMat = new THREE.MeshStandardMaterial({ color: PAL.frame, roughness: 0.6 });
    for (const [x0, x1, z0, z1, h, style] of LAYOUT.walls) {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (style === 'glass') {
        const base = new THREE.Mesh(new RoundedBoxGeometry(w, 0.75, d + 0.06, 2, 0.04), wallMat);
        base.position.set(cx, 0.375, cz); base.castShadow = base.receiveShadow = true; this.group.add(base);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, h - 0.8, 0.03), glassMat);
        glass.position.set(cx, 0.75 + (h - 0.8) / 2, cz); this.group.add(glass);
        const top = new THREE.Mesh(new RoundedBoxGeometry(w, 0.06, 0.1, 2, 0.025), frameMat);
        top.position.set(cx, h, cz); this.group.add(top);
        const n = Math.max(1, Math.round(w / 1.6));
        for (let i = 0; i <= n; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 0.75, 0.08), frameMat); p.position.set(x0 + (w * i) / n, 0.75 + (h - 0.75) / 2, cz); this.group.add(p); }
        continue;
      }
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.06, d / 2.2)), wallMat);
      m.position.set(cx, h / 2, cz); m.castShadow = style === 'full'; m.receiveShadow = true;
      this.group.add(m);
      // teal wainscot band and a soft cap
      const bh = Math.min(0.32, h * 0.35);
      const bandM = new THREE.Mesh(new RoundedBoxGeometry(w + 0.02, bh, d + 0.02, 2, 0.02), bandMat);
      bandM.position.set(cx, bh / 2 + 0.06, cz); this.group.add(bandM);
      const cap = new THREE.Mesh(new RoundedBoxGeometry(w + 0.04, 0.05, d + 0.04, 2, 0.02), capMat);
      cap.position.set(cx, h, cz); this.group.add(cap);
    }
  }

  buildDoors() {
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x1a2328 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x6e9fa3, roughness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7fb0b3, roughness: 0.55 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: PAL.amber, emissiveIntensity: 2.2 });
    this.doorLamps = [];
    for (const d of LAYOUT.doors) {
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      // dark interior beyond the threshold
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(d.width, 2.3), darkMat);
      hole.position.set(0, 1.15, -0.2); g.add(hole);
      const floorDark = new THREE.Mesh(new THREE.PlaneGeometry(d.width, 0.6), darkMat); floorDark.rotation.x = -Math.PI / 2; floorDark.position.set(0, 0.006, -0.35); g.add(floorDark);
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

  buildLights(renderer) {
    const s = this.scene;
    // soft image-based fill so matte sculpted materials read with gentle shading in every direction
    if (renderer) { const pm = new THREE.PMREMGenerator(renderer); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.32; pm.dispose(); }
    const hemi = new THREE.HemisphereLight(0xfff4e3, 0x7c9a96, 0.85); s.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.45);
    sun.position.set(-6, 14, 7); sun.target.position.set(0, 0, 0);
    s.add(sun, sun.target);
    if (this.quality !== 'low') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
      const c = sun.shadow.camera; c.left = -9; c.right = 9; c.top = 13; c.bottom = -13; c.near = 1; c.far = 40;
      sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    }
    this.sun = sun;
    // selective amber emergency light at the doors (the hall itself stays readable)
    if (this.quality !== 'low') {
      for (const d of LAYOUT.doors) {
        const l = new THREE.PointLight(PAL.amber, 3.2, 5.5, 1.6);
        l.position.set(d.spawn.x, 2.2, d.spawn.z);
        s.add(l); this.lights.push(l);
      }
    }
  }

  async loadProps(loader, onProgress) {
    const cache = new Map();
    let done = 0;
    const jobs = LAYOUT.props.map(async (p) => {
      if (!cache.has(p.m)) cache.set(p.m, loader.loadAsync('../' + p.m));
      const gltf = await cache.get(p.m);
      const obj = gltf.scene.clone(true);
      obj.rotation.y = (p.rot * Math.PI) / 180;
      const holder = new THREE.Group(); holder.add(obj);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      // centre on the footprint, sit on the floor; optionally fit to the authored footprint
      const size = box.getSize(new THREE.Vector3());
      if (p.fit) {
        const k = Math.min(p.fp[0] / size.x, p.fp[1] / size.z);
        if (k < 0.97 || k > 1.03) { obj.scale.multiplyScalar(k); holder.updateMatrixWorld(true); box.setFromObject(obj); }
      }
      const ctr = box.getCenter(new THREE.Vector3());
      obj.position.x -= ctr.x; obj.position.z -= ctr.z; obj.position.y -= box.min.y;
      holder.position.set(p.x, 0, p.z);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(holder);
      p._actual = box.getSize(new THREE.Vector3());
      onProgress?.(++done / LAYOUT.props.length);
    });
    await Promise.all(jobs);
  }
}
