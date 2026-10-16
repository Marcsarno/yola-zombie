// The painted-scene breakthrough (the reveal): the last frame of the cheerful hospital is captured, turns into a
// painting, and Yola's bat smashes through it. The upgraded hospital (the same room) is ready behind the picture.
//  capture(): renders the old scene once into a render target (no overlays: they are DOM). Rendering into a target skips
//    tone mapping, so the captured image is linear HDR and the shards are drawn tone-mapped once on screen (never twice).
//  paint(k): a light art treatment over the capture (k 0..1), in display space: Kuwahara brush smoothing, a richer warm
//    palette, soft outlines, a canvas weave and darker edges. Re-rendered into a second target only while k changes.
//  The intact picture is one quad filling the view (no seams); at the strike it is swapped for ten fragments cut from
//    the same image (continuous UVs, matching edges: a Voronoi split weighted toward the impact), which are thrown away
//    from the impact, spin, fall and fade. Choreographed, not simulated.
//  dispose() frees the targets and the geometry once the pieces are gone.
import * as THREE from 'three';

const PaintShader = {
  uniforms: { tSrc: { value: null }, k: { value: 0 }, texel: { value: new THREE.Vector2(1 / 512, 1 / 512) }, seed: { value: 0.37 }, exposure: { value: 0.92 }, display: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  // Everything happens in display space: the linear capture is tone-mapped (three's Neutral curve, the game's exposure)
  // first, painted, then written as sRGB (display = 1; the shards draw it untouched). With a post-processing look the
  // composer tone-maps the whole frame itself, so the painting is written back linear instead (display = 0).
  fragmentShader: `uniform sampler2D tSrc; uniform float k; uniform vec2 texel; uniform float seed; uniform float exposure; uniform float display; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    vec3 neutral(vec3 color) {
      const float sc = 0.8 - 0.04; const float desat = 0.15;
      color *= exposure;
      float x = min(color.r, min(color.g, color.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; color -= off;
      float peak = max(color.r, max(color.g, color.b)); if (peak < sc) return color;
      float d = 1.0 - sc; float np = 1.0 - d * d / (peak + d - sc); color *= np / peak;
      float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0); return mix(color, vec3(np), g);
    }
    vec3 D(vec2 uv) { return clamp(neutral(texture2D(tSrc, uv).rgb), 0.0, 1.0); }
    vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    vec3 lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
    void main() {
      vec3 src = D(vUv);
      // brush strokes: Kuwahara (4 sectors, radius 4): each pixel takes the mean of its calmest neighbourhood. The sampling
      // grid wobbles a little along a slow noise field so the strokes are irregular, not a grid.
      vec2 wob = (vec2(noise(vUv * 70.0), noise(vUv * 70.0 + 7.3)) - 0.5) * texel * 3.0;
      vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0), s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
      for (int j = 0; j <= 4; j++) for (int i = 0; i <= 4; i++) {
        vec2 o = vec2(float(i), float(j)) * texel * 1.25;
        vec3 a = D(vUv + wob + vec2(-o.x, -o.y)); m0 += a; s0 += a * a;
        vec3 b = D(vUv + wob + vec2(o.x, -o.y)); m1 += b; s1 += b * b;
        vec3 c = D(vUv + wob + vec2(-o.x, o.y)); m2 += c; s2 += c * c;
        vec3 e = D(vUv + wob + vec2(o.x, o.y)); m3 += e; s3 += e * e;
      }
      m0 /= 25.0; m1 /= 25.0; m2 /= 25.0; m3 /= 25.0;
      vec3 v0 = s0 / 25.0 - m0 * m0, v1 = s1 / 25.0 - m1 * m1, v2 = s2 / 25.0 - m2 * m2, v3 = s3 / 25.0 - m3 * m3;
      float w0 = v0.r + v0.g + v0.b, w1 = v1.r + v1.g + v1.b, w2 = v2.r + v2.g + v2.b, w3 = v3.r + v3.g + v3.b;
      vec3 p = m0; float bw = w0;
      if (w1 < bw) { bw = w1; p = m1; } if (w2 < bw) { bw = w2; p = m2; } if (w3 < bw) { bw = w3; p = m3; }
      // a gently richer, warmer palette (a painter's colour, not a filter)
      float l = dot(p, vec3(0.299, 0.587, 0.114));
      p = mix(vec3(l), p, 1.18); p *= vec3(1.04, 1.0, 0.93); p = mix(p, p * p * (3.0 - 2.0 * p), 0.25);
      // outlines where the picture changes sharply (a soft dark line, like a brush edge)
      float gx = dot(D(vUv + vec2(2.0, 0.0) * texel) - D(vUv - vec2(2.0, 0.0) * texel), vec3(0.33));
      float gy = dot(D(vUv + vec2(0.0, 2.0) * texel) - D(vUv - vec2(0.0, 2.0) * texel), vec3(0.33));
      p *= 1.0 - 0.3 * smoothstep(0.08, 0.3, length(vec2(gx, gy)));
      // canvas: a fine weave, a slow paper grain, diagonal brush drag
      vec2 w = vUv / texel;
      float weave = 0.5 + 0.5 * sin(w.x * 1.9) * sin(w.y * 1.9);
      float grain = noise(w * 0.18);
      float drag = noise(vec2(w.x * 0.05 + w.y * 0.05, (w.x - w.y) * 0.4));
      p *= 0.93 + 0.05 * weave + 0.04 * grain + 0.04 * (drag - 0.5);
      // an old painting's darker edges
      vec2 q = vUv - 0.5; p *= 1.0 - 0.22 * smoothstep(0.3, 0.75, length(q * vec2(1.0, 0.8)));
      vec3 outc = mix(src, clamp(p, 0.0, 1.0), k);
      gl_FragColor = vec4(display > 0.5 ? srgb(outc) : lin(outc) / max(exposure, 1e-3), 1.0);
    }`,
};

// the convex cell of seed i: the view rectangle clipped by the half-planes nearer to i than to each other seed
function cell(seeds, i) {
  let poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const [sx, sy] = seeds[i];
  for (let j = 0; j < seeds.length; j++) {
    if (j === i) continue;
    const [ox, oy] = seeds[j], nx = ox - sx, ny = oy - sy, mx = (ox + sx) / 2, my = (oy + sy) / 2;
    const side = (p) => (p[0] - mx) * nx + (p[1] - my) * ny; // <= 0: nearer seed i
    const out = [];
    for (let a = 0; a < poly.length; a++) {
      const p = poly[a], q = poly[(a + 1) % poly.length], dp = side(p), dq = side(q);
      if (dp <= 0) out.push(p);
      if ((dp <= 0) !== (dq <= 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    poly = out; if (poly.length < 3) break;
  }
  return poly;
}
// a small deterministic random (the same break for every replay)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export class Breakthrough {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.group = null; this.shards = []; this.t = 0; this.state = 'idle';
  }
  // render the current view once into a target (the old hospital, exactly as framed)
  capture({ post = false, exposure = 0.92 } = {}) {
    const r = this.renderer, size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, Math.round(size.x)), h = Math.max(2, Math.round(size.y));
    this.dispose();
    const opt = { type: THREE.HalfFloatType, depthBuffer: true };
    this.src = new THREE.WebGLRenderTarget(w, h, opt);
    // the painting is made at about half resolution (the brush pass is the costly bit; a canvas is soft anyway)
    const pw = Math.max(2, Math.round(w * 0.6)), ph = Math.max(2, Math.round(h * 0.6));
    this.dst = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, depthBuffer: false });
    const prevT = r.getRenderTarget(), prevS = r.shadowMap.autoUpdate;
    r.setRenderTarget(this.src); r.clear(); r.render(this.scene, this.camera); r.setRenderTarget(prevT);
    r.shadowMap.autoUpdate = prevS;
    this.paintMat = new THREE.ShaderMaterial({ ...PaintShader, uniforms: THREE.UniformsUtils.clone(PaintShader.uniforms), depthTest: false, depthWrite: false });
    this.paintMat.uniforms.tSrc.value = this.src.texture; this.paintMat.uniforms.texel.value.set(1 / w, 1 / h);
    this.paintMat.uniforms.exposure.value = exposure; this.paintMat.uniforms.display.value = post ? 0 : 1; this.post = post;
    if (!post) this.dst.texture.colorSpace = THREE.SRGBColorSpace; // (written as sRGB: the shards show it as it is)
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.paintMat); this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad); this.quadCam = new THREE.Camera();
    this.paint(0);
    this.aspect = w / h;
  }
  paint(k) {
    if (!this.paintMat) return;
    this.k = k; this.paintMat.uniforms.k.value = k;
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(this.dst); r.render(this.quadScene, this.quadCam); r.setRenderTarget(prev);
  }
  // the picture in front of the camera, filling the view exactly (distance d), as one seamless quad
  mount(d = 0.8) {
    const c = this.camera; c.updateMatrixWorld(true);
    const hh = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * d, hw = hh * c.aspect;
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(c.matrixWorld); g.matrixWorldNeedsUpdate = true;
    this.scene.add(g); this.group = g; this.d = d; this.hw = hw; this.hh = hh;
    this.mat = new THREE.MeshBasicMaterial({ map: this.dst.texture, depthTest: false, depthWrite: false, transparent: true, toneMapped: !!this.post, fog: false });
    this.back = new THREE.MeshBasicMaterial({ color: 0xe9dfc8, depthTest: false, depthWrite: false, transparent: true, side: THREE.BackSide, toneMapped: !!this.post });
    const whole = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 * 1.002, hh * 2 * 1.002), this.mat);
    whole.position.z = -d; whole.renderOrder = 50; whole.frustumCulled = false; g.add(whole); this.whole = whole;
    this.state = 'held';
  }
  // the strike: ndc impact point (x, y in -1..1) and the swing's screen direction (dx, dy); ten pieces fly
  shatter(ix = 0, iy = 0.1, dx = -1, dy = 0.25, n = 10, seed = 7) {
    if (!this.group) return;
    const R = rng(seed), seeds = [];
    // seeds: a ring of smaller cells around the impact and larger ones toward the edges
    for (let i = 0; i < n; i++) {
      const near = i < 4, a = (i / (near ? 4 : n - 4)) * Math.PI * 2 + R() * 0.8, rad = near ? 0.22 + R() * 0.2 : 0.75 + R() * 0.55;
      seeds.push([THREE.MathUtils.clamp(ix + Math.cos(a) * rad, -0.98, 0.98), THREE.MathUtils.clamp(iy + Math.sin(a) * rad * 1.15, -0.98, 0.98)]);
    }
    this.group.remove(this.whole); this.whole.geometry.dispose();
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    for (let i = 0; i < n; i++) {
      const poly = cell(seeds, i); if (poly.length < 3) continue;
      let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= poly.length; cy /= poly.length;
      const pos = [], uv = [], idx = [];
      pos.push(0, 0, 0); uv.push((cx + 1) / 2, (cy + 1) / 2);
      for (const p of poly) { pos.push((p[0] - cx) * this.hw * 1.002, (p[1] - cy) * this.hh * 1.002, 0); uv.push((p[0] + 1) / 2, (p[1] + 1) / 2); }
      for (let k = 1; k <= poly.length; k++) idx.push(0, k, (k % poly.length) + 1);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      const piece = new THREE.Group(); piece.position.set(cx * this.hw, cy * this.hh, -this.d);
      const front = new THREE.Mesh(geo, this.mat), back = new THREE.Mesh(geo, this.back);
      front.renderOrder = 51; back.renderOrder = 50; front.frustumCulled = back.frustumCulled = false;
      piece.add(back, front); this.group.add(piece);
      // away from the impact (and along the swing), toward the camera, a spin; pieces nearer the impact go first and fastest
      const ox = cx - ix, oy = cy - iy, od = Math.hypot(ox, oy) || 1, near = Math.max(0, 1 - od / 1.6);
      const sp = 0.9 + near * 2.2 + R() * 0.5; // (in picture half-widths per second: the pieces cross the frame, they do not vanish)
      const v = new THREE.Vector3((ox / od) * sp * this.hw + dx * 0.5 * near * this.hw, (oy / od) * sp * this.hh * 0.7 + dy * 0.4 * near * this.hh + 0.25 * this.hh, 0.25 + near * 0.7 + R() * 0.2);
      const w = new THREE.Vector3((R() - 0.5) * 5, (R() - 0.5) * 5, (R() - 0.5) * 4).multiplyScalar(0.5 + near);
      this.shards.push({ piece, v, w, delay: (1 - near) * 0.07 + R() * 0.03, life: 0 });
    }
    this.state = 'flying'; this.t = 0;
  }
  update(dt) {
    if (this.state !== 'flying') return;
    this.t += dt;
    let live = 0;
    for (const s of this.shards) {
      if (this.t < s.delay) { live++; continue; }
      s.life += dt;
      s.v.y -= 2.6 * this.hh * dt; // camera-space gravity: the view looks roughly level, so 'down' on screen is close enough
      s.piece.position.addScaledVector(s.v, dt);
      s.piece.rotation.x += s.w.x * dt; s.piece.rotation.y += s.w.y * dt; s.piece.rotation.z += s.w.z * dt;
      if (s.life < 1.05) live++;
    }
    const fade = THREE.MathUtils.clamp(1 - (this.t - 0.7) / 0.35, 0, 1);
    this.mat.opacity = this.back.opacity = fade;
    if (!live || fade <= 0) this.finish();
  }
  get done() { return this.state === 'done' || this.state === 'idle'; }
  finish() { this.state = 'done'; if (this.group) { this.scene.remove(this.group); this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); this.group = null; } this.shards.length = 0; this.dispose(); }
  dispose() {
    this.src?.dispose(); this.dst?.dispose(); this.paintMat?.dispose(); this.mat?.dispose(); this.back?.dispose(); this.quad?.geometry.dispose();
    this.src = this.dst = this.paintMat = this.mat = this.back = this.quad = null;
  }
}
