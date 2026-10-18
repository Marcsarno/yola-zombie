// Small, pooled, bounded effects. Everything here is optional dressing: combat must read without it.
import * as THREE from 'three';

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,214,120,0.9)'); gr.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = gr; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 11 : 31; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  return new THREE.CanvasTexture(c);
}
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

const MAX_P = 320;
const MAX_POOLS = 32;

function splatTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,1)';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  blob(64, 64, 34);
  for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 28; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + Math.random() * 10); }
  return new THREE.CanvasTexture(c);
}

// a smashed floor (the guard's shield driven in): a dark crushed centre and cracks radiating out, branching
// tiles shattered by a heavy blow: a crushed, dusty centre with loose broken tile, and a few straight-ish fractures running
// out across the grout (glass-hard tile breaks in long, nearly straight runs with sharp turns, never organic branches)
function crackTexture() {
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), h = s / 2;
  const grd = g.createRadialGradient(h, h, 6, h, h, s * 0.17); grd.addColorStop(0, 'rgba(46,40,34,.85)'); grd.addColorStop(0.6, 'rgba(70,62,52,.45)'); grd.addColorStop(1, 'rgba(90,82,70,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9; i++) { // loose shards: small tilted polygons, pale tile tops with dark edges
    const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * s * 0.09, x = h + Math.cos(a) * d, y = h + Math.sin(a) * d, r = 6 + Math.random() * 10;
    g.beginPath(); for (let k = 0; k < 4; k++) { const b = a + k * 1.6 + Math.random() * 0.5; g.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); } g.closePath();
    g.fillStyle = Math.random() < 0.5 ? 'rgba(226,216,196,.9)' : 'rgba(186,208,200,.9)'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(30,26,22,.8)'; g.stroke();
  }
  g.lineCap = 'round'; g.lineJoin = 'miter';
  const crack = (x, y, a, len, w, depth) => {
    const pts = [[x, y]]; const n = 3 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) { a += (Math.random() - 0.5) * 0.55; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; pts.push([x, y]); }
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.lineWidth = w + 1.6; g.strokeStyle = 'rgba(240,232,214,.32)'; g.stroke(); // (a chipped pale lip along it)
    g.lineWidth = w; g.strokeStyle = 'rgba(28,24,20,.9)'; g.stroke();
    if (depth > 0) for (let i = 1; i < pts.length - 1; i++) if (Math.random() < 0.3) crack(pts[i][0], pts[i][1], a + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6), len * 0.35, w * 0.6, depth - 1);
  };
  for (let i = 0; i < 9; i++) crack(h + (Math.random() - 0.5) * 16, h + (Math.random() - 0.5) * 16, (i / 9) * Math.PI * 2 + Math.random() * 0.5, s * (0.2 + Math.random() * 0.22), 2.4, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.gore = true;
    // muzzle flash
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.scale.setScalar(0.42); this.flash.visible = false; scene.add(this.flash);
    this.flashT = 0;
    this.flashLight = new THREE.PointLight(0xffc070, 0, 4, 2); scene.add(this.flashLight);
    // tracers (pool of thin quads)
    this.tracers = [];
    const trMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 16; i++) { // a shotgun blast uses nine at once
      const g = new THREE.PlaneGeometry(1, 0.035); g.translate(0.5, 0, 0); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, trMat.clone()); m.visible = false; scene.add(m); this.tracers.push({ m, t: 0 });
    }
    // particles: one Points cloud, fixed capacity
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_P * 3); this.pCol = new Float32Array(MAX_P * 3);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 0.09, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false; scene.add(this.points);
    this.parts = []; for (let i = 0; i < MAX_P; i++) this.parts.push({ life: 0 });
    this.pNext = 0;
    // impact rings
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); this.rings.push({ m, t: 1 });
    }
    // swing arc: a ribbon over the outer part of the weapon, along its last ~0.14 s, bright at the weapon and fading to
    // nothing at its tail (vertex alpha), added on top of the scene; how strong it is follows how fast the weapon moves
    this.trailN = 18;
    this.trailGeo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(this.trailN * 2 * 3);
    this.trailCol = new Float32Array(this.trailN * 2 * 4);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    const idx = []; for (let i = 0; i < this.trailN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.trailGeo.setIndex(idx);
    this.trail = new THREE.Mesh(this.trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.trail.frustumCulled = false; this.trail.visible = false; scene.add(this.trail);
    this.trailPts = [];
    // aim marker: restrained chevron + arc on the floor
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.14); shape.lineTo(0.085, -0.02); shape.lineTo(0.035, -0.02); shape.lineTo(0, 0.06); shape.lineTo(-0.035, -0.02); shape.lineTo(-0.085, -0.02); shape.closePath();
    const chev = new THREE.ShapeGeometry(shape); chev.rotateX(-Math.PI / 2); chev.rotateY(Math.PI);
    this.aimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    this.aim = new THREE.Group();
    const c1 = new THREE.Mesh(chev, this.aimMat); c1.position.z = 1.05; c1.scale.setScalar(1.4);
    this.aim.add(c1);
    const arcGeo = new THREE.RingGeometry(0.72, 0.76, 32, 1, -0.45, 0.9); arcGeo.rotateX(-Math.PI / 2); arcGeo.rotateY(-Math.PI / 2);
    this.aim.add(new THREE.Mesh(arcGeo, this.aimMat));
    this.aim.position.y = 0.02; this.aim.renderOrder = 2; scene.add(this.aim);
    // blood pools: pooled floor decals that spread, then fade after a while
    const splat = splatTexture();
    this.pools = [];
    for (let i = 0; i < MAX_POOLS; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: splat, color: 0x4a0606, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; scene.add(m);
      this.pools.push({ m, t: 99, size: 1 });
    }
    this.poolNext = 0;
    // floor cracks (the guard's slam): pooled decals that stay a while, then fade
    const crackTex = crackTexture();
    this.cracks = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; scene.add(m); this.cracks.push({ m, t: 99 });
    }
    // hit flashes: a quick bright star where a blow lands (pooled sprites)
    const star = starTexture();
    this.hits = [];
    for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); s.visible = false; s.renderOrder = 5; scene.add(s); this.hits.push({ s, t: 1, k: 1 }); }
  }
  // a blow lands: the flash, a puff of dust and bits thrown along the blow (k: 1 normal, more for kills and heavy hits)
  hitFlash(x, y, z, dirX, dirZ, k = 1) {
    const h = this.hits.find((q) => q.t >= 1) || this.hits[0];
    h.s.position.set(x, y, z); h.t = 0; h.k = k; h.s.visible = true; h.s.material.rotation = Math.random() * Math.PI;
    this.burst(x, y, z, Math.round(5 * k), 0xfff3d6, 2.6 * k, 0.5, 0.16, dirX, dirZ); // bright sparks, short
    this.burst(x, y - 0.1, z, Math.round(4 * k), 0xcfc8b8, 1.2, 0.3, 0.5, dirX * 0.5, dirZ * 0.5); // dust
  }

  // Blood: dark particles thrown along (dx, dy, dz) and a pool spreading on the floor.
  bloodSpray(x, y, z, dx, dy, dz, n = 22, speed = 3.0) {
    if (!this.gore) return;
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.pNext]; this.pNext = (this.pNext + 1) % MAX_P;
      const s = speed * (0.35 + Math.random() * 0.75);
      p.x = x; p.y = y; p.z = z;
      p.vx = dx * s + (Math.random() - 0.5) * 1.4; p.vy = dy * s + Math.random() * 1.2; p.vz = dz * s + (Math.random() - 0.5) * 1.4;
      p.life = p.max = 0.5 + Math.random() * 0.5; p.r = 0.42; p.g = 0.02; p.b = 0.02; p.dark = true;
    }
  }
  bloodPool(x, z, size = 0.8) {
    if (!this.gore) return;
    const q = this.pools[this.poolNext]; this.poolNext = (this.poolNext + 1) % MAX_POOLS;
    q.t = 0; q.size = size * (0.8 + Math.random() * 0.4);
    q.m.position.set(x, 0.015 + this.poolNext * 0.0004, z); q.m.rotation.z = Math.random() * Math.PI * 2;
    q.m.visible = true;
  }

  floorCrack(x, z, size = 1.2) {
    const q = this.cracks.find((c) => c.t > 40) || this.cracks.reduce((a, b) => (a.t > b.t ? a : b));
    q.t = 0; q.m.position.set(x, 0.013, z); q.m.rotation.z = Math.random() * Math.PI * 2; q.m.scale.set(size * 2, size * 2, 1); q.m.visible = true;
  }

  clearCrackAt(x, z) { for (const q of this.cracks) if (q.t < 40 && Math.hypot(q.m.position.x - x, q.m.position.z - z) < 0.3) { q.t = 99; q.m.visible = false; } } // (a breach opened over it)

  muzzle(pos, k = 1) {
    this.flash.position.copy(pos); this.flash.visible = true; this.flashT = 0.055 * Math.sqrt(k);
    this.flash.scale.setScalar(0.42 * k);
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flashLight.position.copy(pos); this.flashLight.intensity = 6 * k;
    if (k > 1.2) this.burst(pos.x, pos.y, pos.z, 6, 0xb8b4ac, 0.9, 0.4, 0.5); // smoke
  }

  tracer(ox, oy, oz, ex, ez, op = 0.5) {
    const t = this.tracers.find((q) => q.t <= 0) || this.tracers[0];
    const dx = ex - ox, dz = ez - oz, l = Math.hypot(dx, dz);
    t.m.position.set(ox, oy, oz); t.m.scale.set(l, 1, 1); t.m.rotation.y = Math.atan2(-dz, dx); t.m.visible = true; t.t = 0.07;
    t.m.material.opacity = op;
  }

  burst(x, y, z, n, color, speed, up = 1, life = 0.45, dirX = 0, dirZ = 0) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.pNext]; this.pNext = (this.pNext + 1) % MAX_P;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * s * 0.6 + dirX * s; p.vz = Math.sin(a) * s * 0.6 + dirZ * s; p.vy = (0.5 + Math.random()) * up;
      p.life = p.max = life * (0.6 + Math.random() * 0.5); p.r = c.r; p.g = c.g; p.b = c.b; p.dark = false;
    }
  }

  impactZombie(x, z, dirX, dirZ, heavy) {
    if (this.gore) this.burst(x, 1.1, z, heavy ? 12 : 6, 0x6d3a3a, heavy ? 3.2 : 2.2, 1.2, 0.5, dirX, dirZ);
    this.burst(x, 1.15, z, heavy ? 6 : 3, 0xfff0d0, 1.5, 0.6, 0.18, dirX, dirZ);
    if (heavy) this.ring(x, z, 0xffffff);
  }
  impactWall(x, z, nx, nz) {
    this.burst(x + (nx || 0) * 0.05, 1.3, z + (nz || 0) * 0.05, 7, 0xe8e0cc, 1.6, 1.0, 0.35, nx || 0, nz || 0);
    this.burst(x, 1.3, z, 3, 0xffd890, 2.4, 0.8, 0.12, nx || 0, nz || 0);
  }
  ring(x, z, color) {
    const r = this.rings.find((q) => q.t >= 1) || this.rings[0];
    r.m.position.set(x, 0.03, z); r.m.material.color.set(color); r.t = 0; r.m.visible = true;
  }

  trailPush(hands, tip, active) {
    const prev = this.trailPts[0], sp = prev ? tip.distanceTo(prev.b) / Math.max(1e-3, 1 / 60) : 0; // tip speed (m/s, per frame)
    this.trailPts.unshift({ a: hands.clone(), b: tip.clone(), t: 0, active, k: Math.min(1, Math.max(0, (sp - 2) / 6)) });
    if (this.trailPts.length > this.trailN) this.trailPts.length = this.trailN;
  }
  trailClear() { this.trailPts.length = 0; this.trail.visible = false; }

  setAim(x, z, yaw, visible, strength) {
    this.aim.visible = visible;
    this.aim.position.x = x; this.aim.position.z = z; this.aim.rotation.y = yaw;
    this.aimMat.opacity = 0.35 + 0.45 * strength;
  }

  update(dt) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 120);
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; t.m.material.opacity = Math.max(0, t.t / 0.07) * 0.5; if (t.t <= 0) t.m.visible = false; }
    for (const r of this.rings) if (r.t < 1) { r.t += dt / 0.28; const s = 0.6 + r.t * 1.6; r.m.scale.set(s, s, s); r.m.material.opacity = (1 - r.t) * 0.7; if (r.t >= 1) r.m.visible = false; }
    // particles
    let k = 0;
    for (let i = 0; i < MAX_P; i++) {
      const p = this.parts[i];
      if (p.life > 0) {
        p.life -= dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.02) { p.y = 0.02; p.vx *= 0.5; p.vz *= 0.5; p.vy = 0; }
        const f = Math.max(0, p.life / p.max), to = p.dark ? 0.12 : 0.9; // blood darkens, dust pales
        this.pPos[k * 3] = p.x; this.pPos[k * 3 + 1] = p.y; this.pPos[k * 3 + 2] = p.z;
        this.pCol[k * 3] = p.r * f + (1 - f) * to; this.pCol[k * 3 + 1] = p.g * f + (1 - f) * to * (p.dark ? 0.1 : 1); this.pCol[k * 3 + 2] = p.b * f + (1 - f) * to * (p.dark ? 0.1 : 0.98);
        k++;
      }
    }
    this.pGeo.setDrawRange(0, k);
    for (const q of this.pools) {
      if (q.t > 40) continue;
      q.t += dt;
      const grow = Math.min(1, q.t / 0.9), s = q.size * (0.35 + 0.65 * (1 - (1 - grow) * (1 - grow)));
      q.m.scale.set(s, s, 1);
      q.m.material.opacity = 0.85 * (q.t < 25 ? 1 : Math.max(0, 1 - (q.t - 25) / 6));
      if (q.t > 31) { q.m.visible = false; q.t = 99; }
    }
    for (const q of this.cracks) { if (q.t > 40) continue; q.t += dt; q.m.material.opacity = Math.min(1, q.t / 0.08) * (q.t < 30 ? 0.9 : Math.max(0, 0.9 - (q.t - 30) / 6)); if (q.t > 36) { q.m.visible = false; q.t = 99; } }
    this.pGeo.attributes.position.needsUpdate = true; this.pGeo.attributes.color.needsUpdate = true;
    for (const h of this.hits) if (h.t < 1) { h.t += dt / 0.11; const u = Math.min(1, h.t); h.s.scale.setScalar((0.35 + 0.55 * u) * h.k); h.s.material.opacity = (1 - u) * 0.95; if (h.t >= 1) h.s.visible = false; }
    // swing arc
    for (const q of this.trailPts) q.t += dt;
    while (this.trailPts.length && this.trailPts[this.trailPts.length - 1].t > 0.14) this.trailPts.pop();
    const n = this.trailPts.length;
    this.trail.visible = n > 1;
    if (n > 1) {
      for (let i = 0; i < this.trailN; i++) {
        const q = this.trailPts[Math.min(i, n - 1)];
        // ribbon covers the outer half of the bat only
        const ax = q.a.x + (q.b.x - q.a.x) * 0.45, ay = q.a.y + (q.b.y - q.a.y) * 0.45, az = q.a.z + (q.b.z - q.a.z) * 0.45;
        this.trailPos.set([ax, ay, az, q.b.x, q.b.y, q.b.z], i * 6);
        const fade = i >= n ? 0 : (1 - i / (n - 1)) * (1 - q.t / 0.14) * (q.k ?? 1), a = 0.28 * fade; // (k: the weapon's speed)
        this.trailCol.set([0.9, 0.95, 1, a * 0.3, 0.95, 0.98, 1, a], i * 8); // fainter toward the hands
      }
      this.trailGeo.attributes.position.needsUpdate = true; this.trailGeo.attributes.color.needsUpdate = true;
      this.trailGeo.computeBoundingSphere();
    }
  }
}
