// The reveal's home run (2026-10-17): the patient zombie walks into Yola's swing and bursts. His burst model
// (assets/zombie-patient-burst.glb, tools/opening/make_zombie_burst.py) is the modular patient cut into chunks
// (head, chest, pelvis, upper arms, forearms, thighs, shins, guts, gibs), every cut capped with the gore kit, all skinned
// to his skeleton. Until the hit he is one intact zombie on his own clips (assets/zombie-patient-mod.glb); at the hit each
// chunk is baked to a still mesh in exactly the pose he stands in and thrown: pieces to either side of the frame, guts
// and gibs, blood sprayed and pooling, and the head flying straight into the lens. The lens crack is a screen overlay.
// Nothing here touches the game's zombies or effects; the opening drives it with its own (slow-motion) clock.
import * as THREE from 'three';

const HEIGHT = 1.68; // the game's patient zombie (src/main.js ZOMBIE list)
const G = 9.0;

function blobTexture(soft) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  if (soft) { const g = x.createRadialGradient(32, 32, 0, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
  else { // a splat: an irregular blob with a few droplets around it
    x.fillStyle = '#fff'; x.beginPath();
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, r = 17 + Math.random() * 9 + (i % 5 === 0 ? 6 : 0); x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    x.fill();
    for (let i = 0; i < 9; i++) { const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 5; x.beginPath(); x.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1 + Math.random() * 2.5, 0, Math.PI * 2); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class ZombieBurst {
  constructor(scene, loader) {
    this.scene = scene; this.loader = loader; this.ready = false; this.state = 'off'; this.chunks = []; this.timeScale = 1;
    this.bounds = null; // { x0, x1, z0, z1 }: the room's walls (pieces bounce off them, blood stops at them)
  }
  async load() {
    const [g, mod] = await Promise.all([this.loader.loadAsync('assets/zombie-patient-burst.glb'), this.loader.loadAsync('assets/zombie-patient-mod.glb')]);
    const root = this.root = g.scene;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const geo = o.geometry; // (the exporter writes the gore kit's colours as the second colour set)
      if (geo.attributes.color_1) { geo.setAttribute('color', geo.attributes.color_1); geo.deleteAttribute('color_1'); }
      if (geo.attributes.color) { o.material = o.material.clone(); o.material.vertexColors = true; }
    });
    const box = new THREE.Box3().setFromObject(root); this.scale = HEIGHT / Math.max(0.5, box.max.y - box.min.y);
    root.scale.setScalar(this.scale); root.visible = false; this.scene.add(root);
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = Object.fromEntries(mod.animations.map((a) => [a.name, a]));
    // the chunks: every mesh under a node named B__<chunk>__<part>
    const byChunk = new Map();
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      let n = o; while (n && !/^B__/.test(n.name)) n = n.parent;
      const chunk = n ? n.name.split('__')[1] : 'Chest';
      if (!byChunk.has(chunk)) byChunk.set(chunk, []); byChunk.get(chunk).push(o);
    });
    this.byChunk = byChunk;
    // the gore inside him (the cut caps with their bone stubs, guts, gibs) stays hidden while he is whole: skinned to single
    // bones, it poked out through his gown at the shoulders, chest and hip as he walked (the user, 2026-10-19: "all his bones
    // popping out"); the hit bakes it into the flying pieces as before
    this.inner = [];
    for (const ms of byChunk.values()) for (const m of ms) if (/^B__/.test(m.name)) { m.visible = false; this.inner.push(m); }
    // the head's own materials, lit from within as it nears the lens (set up now so nothing recompiles at the hit)
    this.headMats = [];
    for (const m of byChunk.get('Head') || []) { m.material = m.material.clone(); if (m.material.map && 'emissive' in m.material) { m.material.emissive = new THREE.Color(0xffd6c0); m.material.emissiveMap = m.material.map; m.material.emissiveIntensity = 0; this.headMats.push(m.material); } }
    this.headBone = root.getObjectByName('mixamorigHead') || root.getObjectByName('mixamorig:Head');
    this.chestBone = root.getObjectByName('mixamorigSpine2') || root.getObjectByName('mixamorig:Spine2');
    this.initBlood();
    this.ready = true;
  }

  // ---- the intact zombie ----
  place(x, z, yaw) {
    const r = this.root; if (!r) return;
    this.clearPieces(); r.visible = true; r.position.set(x, 0, z); r.rotation.set(0, yaw, 0); this.state = 'intact'; this.walkV = null;
  }
  play(name, { fade = 0.2, timeScale = 1, loop = true, at = 0 } = {}) {
    const clip = this.clips?.[name]; if (!clip) return null;
    const a = this.mixer.clipAction(clip); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.timeScale = timeScale;
    a.reset(); a.time = at; a.play(); if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false); this.cur = a; return a;
  }
  // walk toward (x, z), arriving in secs (the opening's clock)
  walkTo(x, z, secs) { const r = this.root; this.walkV = { vx: (x - r.position.x) / secs, vz: (z - r.position.z) / secs, t: secs }; }
  hide() { if (this.root) this.root.visible = false; this.clearPieces(); this.state = 'off'; this.mixer?.stopAllAction(); this.cur = null; }
  chestPoint() { this.root.updateMatrixWorld(true); return (this.chestBone || this.root).getWorldPosition(new THREE.Vector3()); }

  // ---- the hit: every chunk baked in the pose he stands in, then thrown ----
  // dir: the blow's direction (horizontal), cam: the camera (the head flies into it), headSecs: the head's flight on the
  // burst's own clock, right: the screen's right on the floor (pieces go to both sides of the frame)
  burst(hit, dir, cam, { headSecs = 0.42, lensDist = 0.42 } = {}) {
    const r = this.root; r.updateMatrixWorld(true);
    this.mixer.update(0);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cam.getWorldDirection(new THREE.Vector3()).negate()).normalize(); // screen right on the floor
    const v = new THREE.Vector3(), centre = this.chestPoint();
    for (const [name, meshes] of this.byChunk) {
      const grp = new THREE.Group(); let n = 0; const c = new THREE.Vector3(); const baked = [];
      for (const m of meshes) {
        m.skeleton.update();
        const src = m.geometry, pos = src.attributes.position, out = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; c.add(v); n++; }
        baked.push({ m, out });
      }
      c.divideScalar(Math.max(1, n));
      let rad = 0;
      for (const { m, out } of baked) {
        const geo = new THREE.BufferGeometry();
        for (let i = 0; i < out.length; i += 3) { out[i] -= c.x; out[i + 1] -= c.y; out[i + 2] -= c.z; rad = Math.max(rad, Math.hypot(out[i], out[i + 1], out[i + 2])); }
        geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
        for (const k of ['uv', 'color']) if (m.geometry.attributes[k]) geo.setAttribute(k, m.geometry.attributes[k]);
        if (m.geometry.index) geo.setIndex(m.geometry.index);
        for (const gr of m.geometry.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, m.material); mesh.castShadow = true; mesh.frustumCulled = false; grp.add(mesh);
      }
      grp.position.copy(c); this.scene.add(grp);
      const ch = { name, grp, rad: Math.min(rad, 0.35), low: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3(), rest: false, bleed: 0 };
      // where each piece goes: the blow carries everything, the pieces fan out to both sides of the frame
      const out = c.clone().sub(centre); out.y = 0; if (out.lengthSq() < 1e-4) out.copy(dir); out.normalize();
      const sideOf = (s) => right.clone().multiplyScalar(s);
      const R = (a, b) => a + Math.random() * (b - a);
      const kick = (sp, side, up) => ch.vel.copy(dir).multiplyScalar(sp).add(sideOf(side)).add(out.clone().multiplyScalar(0.8)).setY(up);
      if (name === 'Head') ch.head = true;
      else if (name === 'Chest') kick(3.2, -1.6, 2.6);
      else if (name === 'Pelvis') kick(1.6, 0.6, 1.2);
      else if (/UpperArm_L|Forearm_L/.test(name)) kick(R(2.5, 3.5), -4.2, R(2.6, 3.6));
      else if (/UpperArm_R|Forearm_R/.test(name)) kick(R(2.5, 3.5), 4.2, R(2.6, 3.6));
      else if (/Thigh|Shin/.test(name)) kick(R(1.0, 2.0), (/_L/.test(name) ? -1 : 1) * R(1.2, 2.2), R(0.8, 1.8));
      else kick(R(2.5, 5.0), R(-3.5, 3.5), R(1.5, 4.5)); // guts and gibs
      ch.spin.set(R(-9, 9), R(-9, 9), R(-9, 9)); if (/Gut|Gib/.test(name)) ch.spin.multiplyScalar(1.6);
      ch.bleed = /Gib/.test(name) ? 0.4 : 1.6;
      this.chunks.push(ch);
    }
    r.visible = false; this.state = 'burst'; this.t = 0;
    // the head: a tumbling arc that ends face-on, a hand's breadth from the lens
    const head = this.chunks.find((q) => q.head);
    if (head) {
      cam.updateMatrixWorld(true);
      const C = cam.getWorldPosition(new THREE.Vector3()), F = cam.getWorldDirection(new THREE.Vector3());
      const camR = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), camU = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const E = C.clone().addScaledVector(F, lensDist).addScaledVector(camR, lensDist * 0.2).addScaledVector(camU, lensDist * 0.09), S = head.grp.position.clone(); // (up and right of centre: the crack frames Yola in the freeze, not over her)
      const mid = S.clone().lerp(E, 0.5); mid.y += 0.35 + 0.15 * S.distanceTo(E);
      const face = new THREE.Vector3(Math.sin(r.rotation.y), 0, Math.cos(r.rotation.y)); // his face at the hit
      const endQ = new THREE.Quaternion().setFromUnitVectors(face, F.clone().negate());
      const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), E.clone().sub(S)).normalize();
      head.path = { S, mid, E, endQ, axis, secs: headSecs, t: 0, done: false };
    }
    // the blow itself: a burst of blood and mist where the bat lands
    this.spray(hit, dir, 90, 4.2, 1.4); this.mist(hit, 6);
    for (let i = 0; i < 4; i++) this.pool(hit.x + (Math.random() - 0.5) * 0.8 + dir.x * 0.6, hit.z + (Math.random() - 0.5) * 0.8 + dir.z * 0.6, 0.5 + Math.random() * 0.5);
    return head;
  }
  clearPieces() { for (const c of this.chunks) { this.scene.remove(c.grp); c.grp.traverse((o) => o.geometry?.dispose()); } this.chunks = []; }

  // dt: already slowed by the caller. Returns 'lens' on the frame the head reaches the lens.
  update(dt) {
    let ev = null;
    if (this.state === 'intact') {
      if (this.walkV && this.walkV.t > 0) { const w = this.walkV, s = Math.min(dt, w.t); this.root.position.x += w.vx * s; this.root.position.z += w.vz * s; w.t -= s; }
      this.mixer.update(dt);
    }
    if (this.state === 'burst') {
      this.t += dt;
      const q = new THREE.Quaternion(), dq = new THREE.Quaternion(), e = new THREE.Euler();
      for (const c of this.chunks) {
        const p = c.grp.position;
        if (c.path && !c.path.done) {
          const P = c.path; P.t += dt; const u = Math.min(1, P.t / P.secs), a = 1 - u;
          p.set(0, 0, 0).addScaledVector(P.S, a * a).addScaledVector(P.mid, 2 * a * u).addScaledVector(P.E, u * u);
          q.identity().slerp(P.endQ, u * u); dq.setFromAxisAngle(P.axis, -Math.PI * 2 * (1 - u) * (1 - u)); c.grp.quaternion.copy(dq).multiply(q);
          for (const hm of this.headMats) hm.emissiveIntensity = 0.55 * u * u;
          if (Math.random() < 0.6) this.drop(p, new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.4, (Math.random() - 0.5) * 0.6), 0.05);
          if (u >= 1) { P.done = true; ev = 'lens'; c.vel.copy(P.S).sub(P.E).setY(0).normalize().multiplyScalar(2.4).setY(-4.5); c.spin.set(4, 0, 7); } // (off the glass and down out of the frame)
          continue;
        }
        if (c.rest) continue;
        c.vel.y -= G * dt; p.addScaledVector(c.vel, dt);
        e.set(c.spin.x * dt, c.spin.y * dt, c.spin.z * dt); dq.setFromEuler(e); c.grp.quaternion.premultiply(dq);
        const B = this.bounds, m = c.rad * 0.4;
        if (B) { if (p.x < B.x0 + m) { p.x = B.x0 + m; c.vel.x = Math.abs(c.vel.x) * 0.3; } if (p.x > B.x1 - m) { p.x = B.x1 - m; c.vel.x = -Math.abs(c.vel.x) * 0.3; } if (p.z < B.z0 + m) { p.z = B.z0 + m; c.vel.z = Math.abs(c.vel.z) * 0.3; } if (p.z > B.z1 - m) { p.z = B.z1 - m; c.vel.z = -Math.abs(c.vel.z) * 0.3; } }
        const floor = Math.max(0.05, c.rad * 0.45);
        if (p.y < floor) {
          p.y = floor;
          if (c.vel.y < -1.2) { this.pool(p.x, p.z, 0.35 + c.rad); c.vel.y *= -0.28; c.vel.x *= 0.55; c.vel.z *= 0.55; c.spin.multiplyScalar(0.5); }
          else { c.vel.set(0, 0, 0); c.spin.set(0, 0, 0); c.rest = true; }
        }
        if (c.bleed > 0 && this.t < 1.2 && Math.random() < c.bleed * dt * 30) this.drop(p, c.vel.clone().multiplyScalar(0.3), 0.04);
      }
    }
    this.tickBlood(dt);
    return ev;
  }

  // ---- blood: droplets (points), mist puffs (sprites), pools (floor decals) ----
  initBlood() {
    const N = this.dropN = 900;
    this.drops = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, s: 0 }));
    this.dropNext = 0;
    const geo = this.dropGeo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    const mat = new THREE.PointsMaterial({ color: 0x9a0c0c, size: 0.05, map: blobTexture(true), transparent: true, depthWrite: false, alphaTest: 0.05 });
    this.dropPts = new THREE.Points(geo, mat); this.dropPts.frustumCulled = false; this.scene.add(this.dropPts);
    const mistTex = blobTexture(true);
    this.mists = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0x7a0606, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; this.scene.add(s); return { s, t: 9, v: new THREE.Vector3() }; });
    const splat = blobTexture(false);
    this.pools = Array.from({ length: 28 }, (_, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: splat, color: 0x3a0303, roughness: 0.25, metalness: 0, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - i * 0.05 })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; this.scene.add(m); return { m, t: 99, size: 1 }; });
    this.poolNext = 0;
  }
  drop(p, v, s = 0.045) {
    const d = this.drops[this.dropNext]; this.dropNext = (this.dropNext + 1) % this.dropN;
    d.p.copy(p); d.v.copy(v); d.life = 0.9 + Math.random() * 0.8; d.s = s * (0.6 + Math.random() * 0.9);
  }
  spray(p, dir, n, speed, up) {
    for (let i = 0; i < n; i++) {
      const s = speed * (0.25 + Math.random() * 0.9);
      this.drop(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2)),
        new THREE.Vector3(dir.x * s + (Math.random() - 0.5) * 2.6, up * Math.random() * 2.2 + (Math.random() - 0.3) * 1.2, dir.z * s + (Math.random() - 0.5) * 2.6), 0.06);
    }
  }
  mist(p, n) { let k = 0; for (const m of this.mists) { if (m.t < 1) continue; m.t = 0; m.s.visible = true; m.s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)); m.v.set((Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.8); if (++k >= n) break; } }
  pool(x, z, size) {
    const B = this.bounds; if (B) { x = Math.min(B.x1 - size * 0.3, Math.max(B.x0 + size * 0.3, x)); z = Math.min(B.z1 - size * 0.3, Math.max(B.z0 + size * 0.3, z)); }
    const q = this.pools[this.poolNext]; this.poolNext = (this.poolNext + 1) % this.pools.length;
    q.t = 0; q.size = size; q.m.position.set(x, 0.012 + this.poolNext * 0.0003, z); q.m.rotation.z = Math.random() * Math.PI * 2; q.m.visible = true;
  }
  tickBlood(dt) {
    const pos = this.dropGeo.attributes.position, sz = this.dropGeo.attributes.size; let k = 0;
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt; d.v.y -= G * dt; d.p.addScaledVector(d.v, dt);
      const B = this.bounds; if (B && (d.p.x < B.x0 || d.p.x > B.x1 || d.p.z < B.z0 || d.p.z > B.z1)) { d.life = 0; continue; } // (it hit a wall)
      if (d.p.y < 0.015) { d.life = 0; if (Math.random() < 0.08) this.pool(d.p.x, d.p.z, 0.1 + Math.random() * 0.15); continue; }
      pos.setXYZ(k, d.p.x, d.p.y, d.p.z); sz.setX(k, d.s); k++;
    }
    this.dropGeo.setDrawRange(0, k); pos.needsUpdate = true; sz.needsUpdate = true;
    for (const m of this.mists) if (m.t < 1) { m.t += dt / 1.4; m.s.position.addScaledVector(m.v, dt); const s = 0.25 + m.t * 1.1; m.s.scale.set(s, s, s); m.s.material.opacity = 0.55 * (1 - m.t); if (m.t >= 1) m.s.visible = false; }
    for (const q of this.pools) { if (q.t > 50) continue; q.t += dt; const g = Math.min(1, q.t / 1.2), s = q.size * (0.3 + 0.7 * (1 - (1 - g) * (1 - g))); q.m.scale.set(s, s, 1); q.m.material.opacity = 0.92; }
  }
  clearBlood() { for (const d of this.drops) d.life = 0; for (const m of this.mists) { m.t = 9; m.s.visible = false; } for (const q of this.pools) { q.t = 99; q.m.visible = false; } this.tickBlood(0); }
  reset() { this.hide(); this.clearBlood(); for (const hm of this.headMats || []) hm.emissiveIntensity = 0; }
}

// ---- the lens crack: drawn once on a full-screen canvas where the head hit (stays over the freeze card) ----
export function lensCrack(cx, cy) {
  const w = innerWidth, h = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr;
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:61;pointer-events:none;animation:opCrackIn .09s ease-out';
  const x = c.getContext('2d'); x.scale(dpr, dpr); x.lineCap = 'round'; x.lineJoin = 'round';
  const R = (a, b) => a + Math.random() * (b - a), M = Math.max(w, h);
  // a wet smear where it struck
  x.fillStyle = 'rgba(110,8,8,0.55)';
  x.beginPath(); for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 2, r = R(16, 34); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85); } x.fill();
  for (let i = 0; i < 4; i++) { const dx = R(-24, 24), len = R(30, 110); x.fillRect(cx + dx, cy, R(2, 5), len); x.beginPath(); x.arc(cx + dx + 2, cy + len, R(2.5, 4.5), 0, Math.PI * 2); x.fill(); }
  const stroke = (pts, wdt) => {
    x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = wdt + 1.6; x.stroke();
    x.strokeStyle = 'rgba(235,245,255,0.92)'; x.lineWidth = wdt; x.stroke();
  };
  // radial cracks, each jagged, a few branching
  const arms = 13, ends = [];
  for (let i = 0; i < arms; i++) {
    let a = (i / arms) * Math.PI * 2 + R(-0.2, 0.2), px = cx, py = cy; const len = R(0.12, 0.42) * M, pts = [[px, py]]; const steps = 9;
    for (let s = 1; s <= steps; s++) {
      a += R(-0.18, 0.18); const d = len / steps; px += Math.cos(a) * d; py += Math.sin(a) * d; pts.push([px, py]);
      if (s > 2 && Math.random() < 0.18) { let b = a + R(0.5, 0.9) * (Math.random() < 0.5 ? -1 : 1), bx = px, by = py; const bp = [[bx, by]]; for (let k = 0; k < 4; k++) { b += R(-0.2, 0.2); bx += Math.cos(b) * d * 0.7; by += Math.sin(b) * d * 0.7; bp.push([bx, by]); } stroke(bp, 0.9); }
    }
    stroke(pts, 1.6); ends.push(pts);
  }
  // the rings between the arms (the cone of shattered glass round the hit)
  for (const k of [2, 4]) for (let i = 0; i < arms; i++) { const A = ends[i][k], B = ends[(i + 1) % arms][k]; if (Math.random() < 0.8) stroke([A, [(A[0] + B[0]) / 2 + R(-6, 6), (A[1] + B[1]) / 2 + R(-6, 6)], B], 1.1); }
  // the white pit of crushed glass at the centre
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, 22); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 22, 0, Math.PI * 2); x.fill();
  if (!document.getElementById('opCrackCss')) { const st = document.createElement('style'); st.id = 'opCrackCss'; st.textContent = '@keyframes opCrackIn{from{transform:scale(1.04);opacity:0}to{transform:none;opacity:1}}'; document.head.appendChild(st); }
  document.body.appendChild(c);
  return c;
}
