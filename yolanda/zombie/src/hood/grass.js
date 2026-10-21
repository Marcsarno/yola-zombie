// Chapter 2, the look pass (HANDOFF_PC_START.md C2, the user: the grass "is just flat and you don't see anything ... if they
// can add something that sticks up that's very low on the processor to make it look better, I'd love it"): low tufts of grass,
// a few weeds and small flowers standing up out of the lawn.
//   - one tuft = three crossed quads (0.2 - 0.45 m) cut from a small atlas drawn here (grass, dry grass, a weed, flowers)
//   - in clusters, not a carpet: a world noise decides where they gather; more along the kerbs, the walls and fences and
//     under the trees (the ground's splat mask: blender/hood/mask_hood.py), thin on open lawn; never on the paving, in a
//     building or in the water (the keep-off map hood_paths.png beside it)
//   - one instanced mesh per 16 m cell: only the cells near Marc are drawn (the camera shows ~10 m round him)
//   - a little sway at their tips; the ground's baked light on them (cutaway.js), so they sit in the shadows they are in
import * as THREE from 'three';
import { cutawayPatch } from './cutaway.js';

const CELL = 16, NEAR = 30, STEP = 0.55;
function atlas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const blade = (x0, w, h, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, 128); const bend = (rnd() - 0.5) * 30; g.quadraticCurveTo(x0 + bend * 0.4, 128 - h * 0.6, x0 + bend, 128 - h); g.stroke(); };
  // tile 0: green grass, tile 1: dry grass, tile 2: a broad-leaved weed, tile 3: grass with small flowers
  for (const [t, cols] of [[0, ['#7a8243', '#868d4a', '#6c763b', '#939851', '#7b803f']], [1, ['#a39561', '#ad9f69', '#938556', '#86824c']], [3, ['#76803f', '#838b48', '#6b7539']]]) {
    for (let i = 0; i < 46; i++) blade(t * 128 + 14 + rnd() * 100, 2 + rnd() * 3, 40 + rnd() * 80, cols[i % cols.length]);
  }
  for (let i = 0; i < 9; i++) { // the weed: broad leaves from one root
    const a = -1.2 + i * 0.3 + (rnd() - 0.5) * 0.2, L = 50 + rnd() * 40;
    g.fillStyle = ['#6c7a3a', '#7a8743', '#606d33'][i % 3]; g.save(); g.translate(256 + 64, 124); g.rotate(a); g.beginPath(); g.ellipse(0, -L / 2, 9 + rnd() * 5, L / 2, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  for (let i = 0; i < 14; i++) { const x = 384 + 16 + rnd() * 96, y = 30 + rnd() * 60; g.fillStyle = ['#f2efe2', '#f4d34a', '#efe7f5'][i % 3]; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.26) * 3.2, y + Math.sin(k * 1.26) * 3.2, 2.6, 0, 7); g.fill(); } g.fillStyle = '#d8a520'; g.beginPath(); g.arc(x, y, 1.8, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t;
}
// three quads crossed at 60 degrees, origin at the base; uv x 0..0.25 (one tile: the instance offsets it)
function tuftGeometry() {
  const pos = [], uv = [], nrm = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); uv.push(0, 0, 0.25, 0, 0.25, 1, 0, 1);
    for (let i = 0; i < 4; i++) nrm.push(0, 1, 0); // (lit as the ground under them)
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx); return g;
}
// an image's pixels by world x / z (the masks: flipY off, row 0 at z0)
async function sampler(tex, rect) {
  if (!tex?.image) return () => [0, 0, 0, 0];
  const im = tex.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, im.width, im.height).data;
  return (x, z) => { const u = Math.floor(((x - rect[0]) / rect[2]) * im.width), v = Math.floor(((z - rect[1]) / rect[3]) * im.height); if (u < 0 || v < 0 || u >= im.width || v >= im.height) return [0, 0, 0, 0]; const i = (v * im.width + u) * 4; return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, d[i + 3] / 255]; };
}
const hash = (x, z) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); };
function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz); const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w; }

export class Grass {
  constructor(scene) { this.group = new THREE.Group(); this.group.name = 'hood-grass'; scene.add(this.group); this.cells = []; this.time = { value: 0 }; }
  async build(splat, paths, rect) {
    const S = await sampler(splat, rect), P = await sampler(paths, rect);
    const mat = new THREE.MeshStandardMaterial({ map: atlas(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    const time = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.gTime = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tile;\nuniform float gTime;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv.x += tile * 0.25;\n#endif')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = sin(gTime * 1.7 + wp.x * 0.7 + wp.z * 0.5) * 0.07 + sin(gTime * 3.1 + wp.x * 1.9) * 0.025; transformed.x += s * position.y; transformed.z += s * 0.6 * position.y; }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(0.62, 1.05, vMapUv.y); // (darker in at the foot)');
      cutawayPatch(sh);
    };
    mat.customProgramCacheKey = () => 'hoodgrass';
    const geo = tuftGeometry(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    let total = 0;
    for (let cx = rect[0]; cx < rect[0] + rect[2]; cx += CELL) for (let cz = rect[1]; cz < rect[1] + rect[3]; cz += CELL) {
      const pts = [];
      for (let x = cx; x < cx + CELL; x += STEP) for (let z = cz; z < cz + CELL; z += STEP) {
        const jx = x + (hash(x, z) - 0.5) * STEP, jz = z + (hash(z, x) - 0.5) * STEP;
        const [pave, wall, shore] = P(jx, jz); if (pave > 0.5 || wall > 0.5 || shore > 0.45) continue;
        const [dirt, litter, dry] = S(jx, jz); if (dirt > 0.55) continue;
        const clump = vnoise(jx * 0.35, jz * 0.35) * 0.7 + vnoise(jx * 1.3 + 7, jz * 1.3) * 0.3;
        const edge = Math.min(1, dry * 1.3 + litter * 0.8 + dirt * 0.9);
        const p = Math.max(0, clump - 0.5) * 2.4 + edge * 0.45 * (0.5 + clump) + 0.02;
        if (hash(jx * 3.1, jz * 1.7) > p) continue;
        const u = hash(jz, jx * 2.3), tile = u < 0.05 ? 3 : u < 0.11 ? 2 : (dry + 0.25 * (hash(jx, jz * 5) - 0.5)) > 0.45 ? 1 : 0;
        pts.push([jx, jz, tile, 0.2 + hash(jx * 7, jz) * 0.25 + edge * 0.08]);
      }
      if (!pts.length) continue;
      const im = new THREE.InstancedMesh(geo, mat, pts.length), tiles = new Float32Array(pts.length);
      pts.forEach(([x, z, t, h], i) => { _q.setFromAxisAngle(Y, hash(x, z * 3) * 6.28); _s.set(h * 1.3, h, h * 1.3); _p.set(x, 0.01, z); im.setMatrixAt(i, _m.compose(_p, _q, _s)); tiles[i] = t; });
      const g2 = geo.clone(); g2.setAttribute('tile', new THREE.InstancedBufferAttribute(tiles, 1)); im.geometry = g2;
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = false; im.frustumCulled = true;
      im.userData.c = [cx + CELL / 2, cz + CELL / 2]; im.visible = false;
      this.group.add(im); this.cells.push(im); total += pts.length;
    }
    this.count = total;
    return this;
  }
  update(dt, px, pz) {
    this.time.value += dt;
    for (const c of this.cells) { const [x, z] = c.userData.c; c.visible = Math.abs(x - px) < NEAR && Math.abs(z - pz) < NEAR; }
  }
}
