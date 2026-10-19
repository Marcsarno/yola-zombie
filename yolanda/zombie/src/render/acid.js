// The lady's acid (core/sim.js hazards, PROGRESS.md gore plan). Redone 2026-10-18 night (the user: "it looks like a cartoon
// acid. Too much of a perfect circle. Doesn't look like a splatter. Doesn't have any sizzle ... make it truly look like
// something toxic"): each pool is its own splatter, drawn once on a canvas from the hazard's seed and flung along her death
// (hazard dirX / dirZ): a lumpy main body stretched along the throw, fingers running out of it, droplets beyond. Three
// layers: the floor etched dark under it (it stays a while after the acid is gone), the acid itself (sickly yellow-green
// to olive at the edges, its own glow), and a churning sheen over it (a second copy turning slowly against the first).
// It spreads out over SPREAD s, fizzes the whole time (bubbles welling up and popping, wisps of steam, a hiss, flecks
// spitting out), dissolves over its last FADE s; the etch fades over ETCH s after. It hurts Yola (the sim); zombies walk
// through it, steam rising round their feet.
import * as THREE from 'three';
import { cue } from '../sfx/cues.js';

const SPREAD = 0.55, FADE = 1.4, ETCH = 8;
const rnd = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

// the splatter's shape, in a 256 canvas, +x the throw: [{ x, y, r }] blobs and [{ x0, y0, x1, y1, w }] fingers
function shapeOf(seed) {
  const R = rnd(Math.floor(seed * 1e9) + 7), blobs = [], fingers = [];
  for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 46; blobs.push({ x: 112 + Math.cos(a) * d * 1.45 + 10, y: 128 + Math.sin(a) * d * 0.85, r: 14 + R() * 26 }); }
  for (let i = 0; i < 9; i++) { // fingers: mostly forward along the throw, a few to the sides
    const a = (R() - 0.5) * (i < 6 ? 1.3 : 3.6), L = 40 + R() * 70, x0 = 128 + Math.cos(a) * 30, y0 = 128 + Math.sin(a) * 22;
    fingers.push({ x0, y0, x1: x0 + Math.cos(a) * L, y1: y0 + Math.sin(a) * L * 0.8, w: 7 + R() * 9 });
  }
  const drops = []; for (let i = 0; i < 22; i++) { const a = (R() - 0.5) * 2.4, d = 70 + R() * 55; drops.push({ x: 128 + Math.cos(a) * d, y: 128 + Math.sin(a) * d * 0.8, r: 2 + R() * 6 }); }
  return { blobs, fingers, drops };
}
function paint(S, fill) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  fill(g);
  g.beginPath(); for (const b of S.blobs) { g.moveTo(b.x + b.r, b.y); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); } g.fill();
  g.lineCap = 'round'; for (const f of S.fingers) { // tapering: three strokes thinner toward the tip
    for (let k = 0; k < 3; k++) { const u0 = k / 3, u1 = (k + 1) / 3; g.lineWidth = f.w * (1 - u0 * 0.75); g.beginPath(); g.moveTo(f.x0 + (f.x1 - f.x0) * u0, f.y0 + (f.y1 - f.y0) * u0); g.lineTo(f.x0 + (f.x1 - f.x0) * u1, f.y0 + (f.y1 - f.y0) * u1); g.stroke(); }
  }
  g.beginPath(); for (const d of S.drops) { g.moveTo(d.x + d.r, d.y); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); } g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// the acid's own surface: a murky olive-to-bile body (not a flat neon fill), foam (a crowd of small bubbles, pale rims round
// dark cores), dark veins of sludge through it and a few wet glints, all cut to the splatter's shape
function acidTex(S, seed) {
  const R = rnd(Math.floor(seed * 1e9) + 99), c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(120, 128, 4, 128, 128, 160); gr.addColorStop(0, '#a9c82c'); gr.addColorStop(0.3, '#7d9a18'); gr.addColorStop(0.6, '#4d640c'); gr.addColorStop(1, '#283406');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.filter = 'blur(7px)'; // murk: soft darker and paler patches drifting through it (no hard lines)
  for (let i = 0; i < 40; i++) { const dark = R() < 0.55; g.fillStyle = dark ? `rgba(26,36,4,${0.2 + R() * 0.25})` : `rgba(196,226,80,${0.12 + R() * 0.18})`; g.beginPath(); g.ellipse(R() * 256, R() * 256, 8 + R() * 26, 5 + R() * 16, R() * Math.PI, 0, Math.PI * 2); g.fill(); }
  g.filter = 'none';
  for (let i = 0; i < 420; i++) { // foam: fine bubbles, gathered toward the edges where it froths
    const a = R() * Math.PI * 2, d = Math.pow(R(), 0.45) * 100, x = 122 + Math.cos(a) * d * 1.3, y = 128 + Math.sin(a) * d * 0.8, r = 0.5 + R() * R() * 3;
    g.fillStyle = `rgba(28,40,4,${0.12 + R() * 0.18})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(206,238,104,${0.18 + R() * 0.25})`; g.lineWidth = 0.5 + r * 0.2; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  }
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(245,255,210,${0.4 + R() * 0.4})`; g.beginPath(); g.arc(60 + R() * 140, 70 + R() * 116, 0.5 + R() * 1.2, 0, Math.PI * 2); g.fill(); } // (wet glints)
  const mask = paint(S, (m) => { m.fillStyle = '#fff'; m.strokeStyle = '#fff'; });
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mask.image, 0, 0); mask.dispose(); // (cut to the splatter)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function textures(seed) {
  const S = shapeOf(seed);
  const acid = acidTex(S, seed);
  const etch = paint(S, (g) => { g.filter = 'blur(5px)'; g.fillStyle = 'rgba(28,20,8,1)'; g.strokeStyle = 'rgba(28,20,8,1)'; });
  const sheen = paint(S, (g) => { const gr = g.createLinearGradient(0, 0, 256, 256); for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? 'rgba(255,255,200,0.0)' : 'rgba(240,255,170,0.9)'); g.fillStyle = gr; g.strokeStyle = gr; });
  return { acid, etch, sheen };
}

export class AcidPools {
  constructor(scene, fx, audio) {
    this.scene = scene; this.fx = fx; this.audio = audio; this.used = new Map(); this.etches = [];
    this.geo = new THREE.PlaneGeometry(1, 1); this.geo.rotateX(-Math.PI / 2);
  }
  make(h) {
    const T = textures(h.seed ?? Math.random()), g = new THREE.Group();
    const mat = (map, o, extra = {}) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: o, depthWrite: false, ...extra });
    const etch = new THREE.Mesh(this.geo, mat(T.etch, 0)); etch.position.y = 0.012; etch.renderOrder = 1;
    const acid = new THREE.Mesh(this.geo, mat(T.acid, 0)); acid.position.y = 0.02; acid.renderOrder = 2;
    const sheen = new THREE.Mesh(this.geo, mat(T.sheen, 0, { blending: THREE.AdditiveBlending })); sheen.position.y = 0.024; sheen.renderOrder = 3;
    g.add(etch, acid, sheen); g.userData = { etch, acid, sheen, T, hissT: 0 };
    g.rotation.y = Math.atan2(-(h.dirZ ?? 0), h.dirX ?? 1); // (the canvas's +x along her throw)
    this.scene.add(g); return g;
  }
  update(hazards, zombies, dt, listener) {
    const seen = new Set(), fx = this.fx;
    for (const h of hazards || []) {
      const key = h.id + ':' + h.x.toFixed(2); seen.add(key);
      let g = this.used.get(key); if (!g) { g = this.make(h); g.position.set(h.x, 0, h.z); this.used.set(key, g); }
      const U = g.userData, grow = Math.min(1, h.t / SPREAD), e = 1 - (1 - grow) * (1 - grow) * (1 - grow), fade = Math.max(0, Math.min(1, (h.dur - h.t) / FADE));
      const size = h.r * 2.9 * (0.4 + 0.6 * e); // (the canvas's main body fills about two thirds of it: the pool that hurts is h.r)
      U.acid.scale.set(size, 1, size); U.sheen.scale.set(size * 0.98, 1, size * 0.98); U.etch.scale.set(size * 1.04, 1, size * 1.04);
      U.acid.material.opacity = 0.9 * fade; U.etch.material.opacity = 0.6 * Math.min(1, h.t / 1.2);
      U.sheen.material.opacity = (0.06 + 0.04 * Math.sin(h.t * 3.1)) * fade; U.sheen.rotation.y = h.t * 0.35; // (the churn)
      U.etchT = 0;
      if (!fx || !dt) continue;
      const pt = () => { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * h.r * 0.85 * e; return [h.x + Math.cos(a) * r, h.z + Math.sin(a) * r]; };
      // the fizz: bubbles welling up and popping, steam wisps, flecks spitting out, the hiss
      if (Math.random() < dt * 26 * fade) { const [x, z] = pt(); fx.burst(x, 0.03, z, 1 + (Math.random() < 0.3 ? 1 : 0), Math.random() < 0.5 ? 0xe6ff6a : 0x9fd02a, 0.25 + Math.random() * 0.3, 1.4, 0.28); }
      if (Math.random() < dt * 2.5 * fade) { const [x, z] = pt(); fx.smoke(x, z, 1, 0.1, 0.12, 2.2, 1.2, 0xc9d6b0, 0.35); } // (thin wisps rising off it)
      if (Math.random() < dt * 3 * fade) { const [x, z] = pt(); fx.burst(x, 0.05, z, 3, 0xd2f550, 1.3, 1.6, 0.3); }
      if ((U.hissT -= dt) <= 0 && fade > 0.2) { U.hissT = 0.55 + Math.random() * 0.4; const d = listener ? Math.hypot(listener.x - h.x, listener.z - h.z) : 0; if (d < 12) cue(this.audio, 'hiss', 0.25 + 0.5 * Math.max(0, 1 - d / 12)); }
      for (const z of zombies) {
        if (!z.alive || Math.hypot(z.x - h.x, z.z - h.z) > h.r) continue;
        if (Math.random() < dt * 10) fx.burst(z.x + (Math.random() - 0.5) * 0.3, 0.08, z.z + (Math.random() - 0.5) * 0.3, 2, 0xeef5e6, 0.5, 2.2, 0.7);
      }
    }
    // a pool gone: its etch stays on the floor a while, then fades and is freed
    for (const [k, g] of this.used) if (!seen.has(k)) { this.used.delete(k); g.userData.acid.visible = g.userData.sheen.visible = false; this.etches.push(g); }
    for (let i = this.etches.length - 1; i >= 0; i--) {
      const g = this.etches[i], U = g.userData; U.etchT = (U.etchT || 0) + dt;
      U.etch.material.opacity = 0.6 * Math.max(0, 1 - U.etchT / ETCH);
      if (U.etchT >= ETCH) { this.scene.remove(g); for (const t of Object.values(U.T)) t.dispose(); for (const m of [U.etch, U.acid, U.sheen]) m.material.dispose(); this.etches.splice(i, 1); }
    }
  }
}
