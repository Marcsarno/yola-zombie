// The full burst in the game (2026-10-17, the user's call after the opening's home run): a big finishing blow — the bat's
// finisher (its home-run swing), the shotgun at close range, the sledgehammer — blows a patient or nurse zombie apart.
// The burst models (assets/zombie-<type>-burst.glb, tools/opening/make_zombie_burst.py) are the modular zombies cut into
// head, chest, pelvis, upper arms, forearms, thighs, shins, guts and gibs, every cut capped, all skinned to the same
// skeleton as the game's zombie. At the blow the live view's pose is copied onto the burst skeleton, each chunk is baked to
// a still mesh in exactly that pose and thrown along the blow; walls stop them, the floor takes them, blood sprays and
// pools (the game's own fx). Normal kills keep the ordinary severing (render/clipchars.js); the sprinter and the guard are
// not cut yet (no burst model: they die as before).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const G = 9.0;
const MAX_KEEP = 4; // bursts whose pieces stay on the floor (the oldest is cleared when a fifth goes)
// the view's already-severed parts -> the burst chunk that is already gone
const SEVERED_CHUNK = { Head: 'Head', Forearm_L: 'Forearm_L', Forearm_R: 'Forearm_R', LowerLeg_L: 'Shin_L', LowerLeg_R: 'Shin_R' };

export class GibBurst {
  constructor(scene, loader, fx) { this.scene = scene; this.loader = loader; this.fx = fx; this.tpl = {}; this.bursts = []; this.world = null; }
  // files: { viewType: url } (the game's zombie types that have a burst model)
  async load(files) {
    await Promise.all(Object.entries(files).map(async ([type, url]) => {
      try {
        const g = await this.loader.loadAsync(url), root = g.scene, byChunk = new Map(), bones = {}, partOf = {};
        root.traverse((o) => {
          if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
          if (!o.isMesh) return;
          const geo = o.geometry; // (the exporter writes the gore kit's colours as the second colour set)
          if (geo.attributes.color_1) { geo.setAttribute('color', geo.attributes.color_1); geo.deleteAttribute('color_1'); }
          if (geo.attributes.color) { o.material = o.material.clone(); o.material.vertexColors = true; }
          if (!o.isSkinnedMesh) return;
          // (a store zombie's own cut-apart body is its own burst model: Mod_<part>__<chunk>__<piece>, 2026-10-21)
          let n = o; while (n && !/^(B|Mod_\w+?)__/.test(n.name)) n = n.parent;
          const chunk = n ? n.name.split('__')[1] : 'Chest';
          if (n && n.name.startsWith('Mod_')) partOf[chunk] = n.name.slice(4, n.name.indexOf('__'));
          if (!byChunk.has(chunk)) byChunk.set(chunk, []); byChunk.get(chunk).push(o);
        });
        this.tpl[type] = { root, byChunk, bones, partOf };
      } catch (e) { console.warn('gib burst model', url, e); }
    }));
  }
  has(type) { return !!this.tpl[type]; }

  // the view (a ZombieView in its last living pose) bursts along (dx, dz); power 1 = the bat, more for the shotgun
  burst(view, dx, dz, power = 1) {
    const T = this.tpl[view.type]; if (!T) return false;
    // the pose: the burst skeleton set exactly as the view's, its root where the view's model is
    view.container.updateMatrixWorld(true);
    for (const [n, b] of Object.entries(T.bones)) { const s = view.bones[n]; if (s) { b.position.copy(s.position); b.quaternion.copy(s.quaternion); b.scale.copy(s.scale); } }
    view.model.matrixWorld.decompose(T.root.position, T.root.quaternion, T.root.scale);
    T.root.updateMatrixWorld(true);
    const gone = new Set([...(view.severed || [])].map((p) => SEVERED_CHUNK[p]).filter(Boolean));
    const centre = (view.bones.Spine2 || view.bones.Hips).getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(dx, 0, dz).normalize(), side = new THREE.Vector3(-dz, 0, dx);
    const b = { chunks: [], t: 0 }, v = new THREE.Vector3();
    const R = (a, c) => a + Math.random() * (c - a);
    for (const [name, meshes] of T.byChunk) {
      if (gone.has(name) || view.severed?.has(T.partOf[name])) continue;
      const baked = []; const c = new THREE.Vector3(); let n = 0;
      for (const m of meshes) {
        m.skeleton.update();
        const pos = m.geometry.attributes.position, out = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; c.add(v); n++; }
        baked.push({ m, out });
      }
      c.divideScalar(Math.max(1, n));
      const grp = new THREE.Group(); let rad = 0;
      for (const { m, out } of baked) {
        for (let i = 0; i < out.length; i += 3) { out[i] -= c.x; out[i + 1] -= c.y; out[i + 2] -= c.z; rad = Math.max(rad, Math.hypot(out[i], out[i + 1], out[i + 2])); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
        for (const k of ['uv', 'color']) if (m.geometry.attributes[k]) geo.setAttribute(k, m.geometry.attributes[k]);
        if (m.geometry.index) geo.setIndex(m.geometry.index);
        for (const gr of m.geometry.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, m.material); mesh.castShadow = true; grp.add(mesh);
      }
      grp.position.copy(c); this.scene.add(grp);
      const out = c.clone().sub(centre).setY(0); if (out.lengthSq() < 1e-4) out.copy(dir); out.normalize();
      const ch = { name, grp, rad: Math.min(rad, 0.35), vel: new THREE.Vector3(), spin: new THREE.Vector3(R(-9, 9), R(-9, 9), R(-9, 9)), rest: false, bleed: /Gib/.test(name) ? 0.3 : 1.2 };
      // everything goes with the blow, fanned out to both sides; the light bits fly furthest, the legs mostly drop
      const k = power * (/Gut|Gib/.test(name) ? R(1.2, 2.0) : name === 'Head' ? R(1.1, 1.4) : /Thigh|Shin/.test(name) ? R(0.3, 0.6) : name === 'Pelvis' ? 0.5 : R(0.7, 1.1));
      ch.vel.copy(dir).multiplyScalar(3.2 * k).addScaledVector(side, R(-2.2, 2.2) * k).addScaledVector(out, 1.2 * k).setY((/Thigh|Shin|Pelvis/.test(name) ? R(0.5, 1.5) : R(1.8, 3.6)) * Math.sqrt(power));
      b.chunks.push(ch);
    }
    if (!b.chunks.length) return false;
    // the blow itself: a big spray along it and pools under where he stood
    const fx = this.fx;
    if (fx) {
      fx.bloodSpray(centre.x, centre.y, centre.z, dir.x, 0.5, dir.z, 46, 4.2 * Math.sqrt(power));
      fx.bloodSpray(centre.x, centre.y, centre.z, -dir.x * 0.3, 0.9, -dir.z * 0.3, 18, 2.4);
      fx.bloodPool(centre.x, centre.z, 1.1); fx.bloodPool(centre.x + dir.x * 0.9, centre.z + dir.z * 0.9, 0.8);
    }
    this.bursts.push(b);
    while (this.bursts.length > MAX_KEEP) this.remove(this.bursts.shift());
    return true;
  }

  update(dt) {
    if (!dt) return;
    const W = this.world, fx = this.fx, e = new THREE.Euler(), dq = new THREE.Quaternion();
    for (const b of this.bursts) {
      b.t += dt; if (b.t > 4 && b.chunks.every((c) => c.rest)) { if (!b.merged) this.settle(b); continue; }
      for (const c of b.chunks) {
        if (c.rest) continue;
        const p = c.grp.position, ox = p.x, oz = p.z;
        c.vel.y -= G * dt; p.addScaledVector(c.vel, dt);
        // walls and tall furniture stop it (taller than the piece is high): it bounces back off the face it hit
        if (W) { const h = W.raycast(ox, oz, p.x, p.z, Math.max(0.2, p.y)); if (h) { p.x = ox + (p.x - ox) * Math.max(0, h.t - 0.05); p.z = oz + (p.z - oz) * Math.max(0, h.t - 0.05); if (h.nx) c.vel.x = -c.vel.x * 0.3; if (h.nz) c.vel.z = -c.vel.z * 0.3; if (fx && b.t < 1.5 && Math.random() < 0.5) fx.bloodPool(p.x, p.z, 0.3); } }
        e.set(c.spin.x * dt, c.spin.y * dt, c.spin.z * dt); dq.setFromEuler(e); c.grp.quaternion.premultiply(dq);
        const floor = Math.max(0.05, c.rad * 0.45);
        if (p.y < floor) {
          p.y = floor;
          if (c.vel.y < -1.2) { if (fx) fx.bloodPool(p.x, p.z, 0.3 + c.rad); c.vel.y *= -0.28; c.vel.x *= 0.55; c.vel.z *= 0.55; c.spin.multiplyScalar(0.5); }
          else { c.vel.set(0, 0, 0); c.spin.set(0, 0, 0); c.rest = true; }
        }
        if (fx && c.bleed && b.t < 0.9 && Math.random() < c.bleed * dt * 12) fx.bloodSpray(p.x, p.y, p.z, c.vel.x * 0.1, 0.2, c.vel.z * 0.1, 2, 0.8);
      }
    }
  }
  // (2026-10-18, the user's phone run: draw calls 190 -> 403 as gore piled up) a burst lies still: its 60-90 chunk meshes
  // (each drawn again for its shadow) become one mesh per look, baked where they lie. Nothing moves or changes on screen.
  settle(b) {
    b.merged = true;
    const by = new Map(), keep = [];
    for (const c of b.chunks) {
      c.grp.updateMatrixWorld(true);
      c.grp.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material, g = o.geometry;
        if (Array.isArray(m) || g.groups.length > 1) { keep.push(o); return; } // (several looks in one mesh: left as it is)
        const attrs = Object.keys(g.attributes).sort().map((k) => { const a = g.attributes[k]; return `${k}:${a.array.constructor.name}:${a.itemSize}:${a.normalized}`; }).join();
        const key = [m.type, m.name, m.map?.uuid, m.vertexColors, m.color?.getHexString(), m.roughness, m.metalness, m.transparent, !!g.index, attrs].join('|');
        if (!by.has(key)) by.set(key, { m, geos: [], src: [] });
        const w = g.clone(); w.clearGroups(); w.applyMatrix4(o.matrixWorld); by.get(key).geos.push(w); by.get(key).src.push(o);
      });
    }
    const meshes = [];
    for (const { m, geos, src } of by.values()) {
      const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
      if (merged !== geos[0]) for (const g of geos) g.dispose();
      if (!merged) { keep.push(...src); continue; } // (could not be merged: those pieces stay as they were)
      const mesh = new THREE.Mesh(merged, m); mesh.castShadow = true; mesh.matrixAutoUpdate = false; meshes.push(mesh);
    }
    if (!meshes.length) return;
    for (const c of b.chunks) { const left = []; c.grp.traverse((o) => { if (keep.includes(o)) left.push(o); }); this.scene.remove(c.grp); c.grp.traverse((o) => { if (o.isMesh && !keep.includes(o)) o.geometry.dispose(); }); if (left.length) this.scene.add(c.grp); else c.grp = null; }
    b.chunks = b.chunks.filter((c) => c.grp);
    b.merged = meshes; for (const mesh of meshes) this.scene.add(mesh);
  }
  remove(b) {
    for (const c of b.chunks) { this.scene.remove(c.grp); c.grp.traverse((o) => o.geometry?.dispose()); }
    if (Array.isArray(b.merged)) for (const mesh of b.merged) { this.scene.remove(mesh); mesh.geometry.dispose(); }
  }
  clear() { for (const b of this.bursts) this.remove(b); this.bursts = []; }
}
