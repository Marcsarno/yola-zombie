// The lift's light for the reveal (2026-10-19, the user: "The lighting in the elevator. It's not good... I want to play with
// that"): the failing light at the back of the car made visible. Built from the lighting lab's cheap pieces (render/atmos.js):
// no real light is added (the reveal's one spotlight stays the light), only what the eye reads as light in the fog:
//   beam    a soft shaft from the fitting at the back of the car out through the doors (two crossed planes, additive)
//   dust    motes drifting in the shaft, caught by each flash
//   halo    the fitting's own glow
//   sparks  a spit of sparks from the fitting on each flash (its own few points: the game's effects do not run in the opening)
// and the car's floor, which was one flat navy colour (it read as a white slab under the flash): a studded rubber floor.
// Everything is built once with zero opacity (its shaders compile behind the title screen); the opening sets the levels.
import * as THREE from 'three';

const glowTex = () => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
};
const beamTex = () => { // bright at the fitting (v = 1), gone at the far end, soft at the sides
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.5, 'rgba(255,255,255,0.35)'); v.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = v; g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = 'destination-in'; const h = g.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.35, 'rgba(0,0,0,1)'); h.addColorStop(0.65, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = h; g.fillRect(0, 0, 64, 128);
  return new THREE.CanvasTexture(c);
};
// a studded rubber lift floor: dark navy-graphite, round studs on a grid, scuffs; the same picture drives the bump (the studs
// catch a raking light)
function rubberFloor() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#20262d'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2200; i++) { const v = 22 + Math.random() * 22 | 0; g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.5)`; g.fillRect(Math.random() * N, Math.random() * N, 2, 2); }
  const step = N / 8;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const cx = (x + 0.5) * step, cy = (y + 0.5) * step, r = step * 0.3;
    const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r); gr.addColorStop(0, '#4a5560'); gr.addColorStop(0.75, '#2c343d'); gr.addColorStop(1, '#1a1f25');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(120,130,140,${0.04 + Math.random() * 0.06})`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); const x = Math.random() * N, y = Math.random() * N; g.moveTo(x, y); g.quadraticCurveTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 60, x + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 80); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const b = new THREE.CanvasTexture(c); b.wrapS = b.wrapT = THREE.RepeatWrapping;
  return { map: t, bump: b };
}

// (2026-10-19, the quality pass) the flash's light as a real beam through the fog: a cone from the light along its aim, its
// inside ray-marched (WebGL: the renderer is WebGL, three r180) through animated value noise: brighter near the light, soft
// at the cone's edge, fading at the floor, the fog drifting inside it. 12 steps per pixel, offset by a random jitter each
// frame so the steps never show as bands. Additive, never writes depth: anything solid in front hides it as it should.
const BEAM_V = 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const BEAM_F = `uniform vec3 uApex; uniform vec3 uAxis; uniform float uCos2; uniform float uLen; uniform float uTan; uniform float uK; uniform float uTime; uniform vec3 uColor;
  varying vec3 vW;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  void main() {
    vec3 ro = cameraPosition, rd = normalize(vW - ro); float tEnd = length(vW - ro);
    vec3 co = ro - uApex; float dv = dot(rd, uAxis), cv = dot(co, uAxis);
    float a = dv * dv - uCos2, b = 2.0 * (dv * cv - uCos2 * dot(rd, co)), c = cv * cv - uCos2 * dot(co, co);
    float tStart = 0.0, disc = b * b - 4.0 * a * c;
    if (disc > 0.0 && abs(a) > 1e-5) { float sq = sqrt(disc), t1 = (-b - sq) / (2.0 * a), t2 = (-b + sq) / (2.0 * a);
      float tn = min(t1, t2), tf = max(t1, t2);
      if (tn > 0.0 && tn < tEnd && dot(ro + rd * tn - uApex, uAxis) > 0.0) tStart = tn; else if (tf > 0.0 && tf < tEnd && dot(ro + rd * tf - uApex, uAxis) > 0.0) tStart = tf; }
    float dt = (tEnd - tStart) / 12.0, j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + fract(uTime * 60.0) * 0.6180339), acc = 0.0; // (2026-10-19: interleaved gradient noise, steady on phone GPUs; the old hash of the pixel's place broke into radial streaks on the iPhone)
    for (int i = 0; i < 12; i++) {
      vec3 p = ro + rd * (tStart + (float(i) + j) * dt), q = p - uApex; float h = dot(q, uAxis);
      if (h < 0.0 || h > uLen) continue;
      float r = length(q - uAxis * h), R = h * uTan + 0.001;
      float edge = 1.0 - smoothstep(R * 0.45, R, r), fall = 1.0 / (1.0 + h * h * 0.22);
      float n = vnoise(p * 2.4 + vec3(0.0, -uTime * 0.22, uTime * 0.1)) * 0.75 + vnoise(p * 5.3 + vec3(uTime * 0.18, 0.0, 0.0)) * 0.25;
      acc += edge * fall * (0.12 + n * n * n * 2.6) * smoothstep(0.0, 0.3, p.y) * dt; // (cubed: the fog in the beam breaks into rays and gaps)
    }
    gl_FragColor = vec4(uColor * acc * uK, 1.0);
  }`;

export class RevealFx {
  // L: the lift (core/chapter.js LIFTS[7]: x, z of the doors, cab: its car's bounds)
  constructor(scene, L) {
    this.scene = scene; this.L = L; this.t = 0;
    this.root = new THREE.Group(); this.root.name = 'revealFx'; scene.add(this.root);
    this.k = { beam: 0, dust: 0, halo: 0 }; // the steady levels (the phase's); flashes add on top
    this.volOn = true; this.volK = 1; this.spot = null; // (the volumetric beam: on, its strength, the spotlight it follows: set by the opening)
    this.src = new THREE.Vector3(L.x, 2.25, -14.35); // the fitting, at the back of the car (where RT.flash hangs the light)
    this.build();
  }
  build() {
    const add = (m) => { m.transparent = true; m.opacity = 0; m.depthWrite = false; m.blending = THREE.AdditiveBlending; m.toneMapped = false; return m; };
    // the shaft: from the fitting to the floor just outside the doors, two planes crossed along its axis
    const tex = beamTex(), S = this.src, end = new THREE.Vector3(this.L.x, 0.05, -10.2), w0 = 0.35, w1 = 1.9;
    this.beams = [];
    for (const tilt of [0, Math.PI / 2]) {
      const g = new THREE.BufferGeometry(), ax = new THREE.Vector3().subVectors(end, S).normalize();
      const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(ax, tilt);
      const p = [S.clone().addScaledVector(side, -w0 / 2), S.clone().addScaledVector(side, w0 / 2), end.clone().addScaledVector(side, w1 / 2), end.clone().addScaledVector(side, -w1 / 2)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap((v) => v.toArray()), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); g.setIndex([0, 2, 1, 0, 3, 2]);
      const m = new THREE.Mesh(g, add(new THREE.MeshBasicMaterial({ map: tex, color: 0xfff0d8, side: THREE.DoubleSide })));
      m.renderOrder = 3; m.frustumCulled = false; this.root.add(m); this.beams.push(m);
    }
    // the volumetric beam (BEAM_F): a unit cone, apex at the origin pointing down -y, scaled and turned onto the light each frame
    const cg = new THREE.ConeGeometry(1, 1, 28, 1, true); cg.translate(0, -0.5, 0); // (ConeGeometry's apex is at +y: moved to y = 0, the base at y = -1)
    this.vol = new THREE.Mesh(cg, new THREE.ShaderMaterial({ vertexShader: BEAM_V, fragmentShader: BEAM_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, toneMapped: false,
      uniforms: { uApex: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, -1, 0) }, uCos2: { value: 0.8 }, uLen: { value: 4 }, uTan: { value: 0.5 }, uK: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0xfff0dc) } } }));
    this.vol.frustumCulled = false; this.vol.renderOrder = 3; this.root.add(this.vol);
    // dust in the shaft
    const n = 90, pts = [];
    for (let i = 0; i < n; i++) pts.push(this.dustSpot({ ph: Math.random() * 6.28 }, Math.random()));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = { pts, geo, obj: new THREE.Points(geo, add(new THREE.PointsMaterial({ color: 0xfff4e0, size: 0.035, map: glowTex() }))) }; // (round soft motes: square points bloomed into white squares)
    this.dust.obj.frustumCulled = false; this.root.add(this.dust.obj);
    // the fitting's glow
    this.halo = new THREE.Sprite(add(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff1dc })));
    this.halo.position.copy(S); this.halo.scale.set(0.5, 0.5, 1); this.root.add(this.halo);
    this.halo.material.color.multiplyScalar(2); // (a light, brighter than anything it lights: the opening's bloom (revealpost.js) catches it and not a white badge in the flash; drawn directly it only saturates)
    // sparks
    const sn = 48; this.sparks = { p: Array.from({ length: sn }, () => ({ life: 0 })), geo: new THREE.BufferGeometry(), next: 0 };
    this.sparks.geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(sn * 3), 3));
    this.sparks.geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(sn * 3), 3));
    this.sparks.obj = new THREE.Points(this.sparks.geo, add(new THREE.PointsMaterial({ size: 0.04, vertexColors: true, map: glowTex() })));
    this.sparks.obj.material.opacity = 1; this.sparks.obj.frustumCulled = false; this.root.add(this.sparks.obj);
  }
  // a mote somewhere along the shaft (u: 0 at the fitting .. 1 at the doors), spread with the shaft's width
  dustSpot(p, u) {
    const S = this.src; p.u = u;
    p.x = this.L.x + (Math.random() - 0.5) * (0.3 + 1.5 * u); p.y = S.y * (1 - u) + 0.15 + Math.random() * 0.5 * u; p.z = S.z + (-10.2 - S.z) * u;
    return p;
  }
  // the car's floor: studded rubber (every lift kit: the same car on every floor)
  dressFloor(kits) {
    const T = this.floorTex ||= rubberFloor();
    for (const k of kits) {
      const f = k?.root?.getObjectByName('Cab_Floor'); if (!f || f.userData.dressed) continue; f.userData.dressed = true;
      const g = f.geometry, p = g.attributes.position;
      if (!g.userData.planarUV) { const uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 0.42; uv[i * 2 + 1] = p.getZ(i) / 0.42; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.userData.planarUV = true; } // (one stud tile per 42 cm)
      const m = f.material; m.map = T.map; m.bumpMap = T.bump; m.bumpScale = 1.2; m.color.set(0xffffff); m.roughness = 0.82; m.metalness = 0; m.needsUpdate = true;
    }
  }
  // a flash: the shaft, the dust and the fitting light up with it; k: its brightness
  flash(k, sparks) {
    if (sparks > 0) {
      const S = this.sparks, n = Math.round(6 + 10 * sparks * Math.min(1.5, k));
      for (let i = 0; i < n; i++) {
        const q = S.p[S.next]; S.next = (S.next + 1) % S.p.length;
        const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.6;
        Object.assign(q, { x: this.src.x + (Math.random() - 0.5) * 0.3, y: this.src.y - 0.02, z: this.src.z + 0.2, vx: Math.cos(a) * sp * 0.6, vz: Math.abs(Math.sin(a)) * sp + 0.4, vy: Math.random() * 0.8, life: 0.45 + Math.random() * 0.5, hot: Math.random() });
        q.max = q.life;
      }
    }
  }
  // per frame: f = the reveal light's current flash level (0..~1.5), F = the flash settings (RT.flash)
  update(d, f, F) {
    this.t += d;
    const beam = this.k.beam + f * F.beam * 0.45, dust = this.k.dust + f * F.dust, halo = this.k.halo + f * F.halo;
    const vol = !!(this.volOn && this.spot);
    for (const b of this.beams) { b.visible = !vol; b.material.opacity = Math.min(0.6, beam * 0.28); }
    this.vol.visible = vol;
    if (vol) { // the cone on the light: apex at the spotlight, along its aim, as wide as its cone, down to the floor
      const sp = this.spot, U = this.vol.material.uniforms, A = sp.position, ax = new THREE.Vector3().subVectors(sp.target.position, A).normalize();
      const len = Math.min(8, (A.y - 0.02) / Math.max(0.15, -ax.y)) * 1.05, ang = sp.angle * 0.95, tan = Math.tan(ang);
      U.uApex.value.copy(A); U.uAxis.value.copy(ax); U.uCos2.value = Math.cos(ang) ** 2; U.uLen.value = len; U.uTan.value = tan; U.uTime.value = this.t;
      U.uK.value = beam * this.volK * 1.7;
      this.vol.position.copy(A); this.vol.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), ax); this.vol.scale.set(len * tan * 1.02, len, len * tan * 1.02);
    }
    this.halo.material.opacity = Math.min(1, halo * 0.8); this.halo.scale.setScalar(0.35 + 0.3 * Math.min(1, f)); this.halo.position.set(this.L.x + 0.15, F.height, F.back + 0.08); // (on the light, wherever the Studio hangs it)
    this.dust.obj.material.opacity = Math.min(1, dust * 0.7);
    const a = this.dust.geo.attributes.position;
    this.dust.pts.forEach((p, i) => {
      p.y -= d * 0.035; p.x += Math.sin(this.t * 0.5 + p.ph) * d * 0.05; p.z += Math.cos(this.t * 0.37 + p.ph) * d * 0.04;
      if (p.y < 0.05) this.dustSpot(p, Math.random());
      a.setXYZ(i, p.x, p.y + Math.sin(this.t * 1.1 + p.ph) * 0.02, p.z);
    });
    a.needsUpdate = true;
    const S = this.sparks, sp = S.geo.attributes.position, sc = S.geo.attributes.color;
    S.p.forEach((q, i) => {
      if (q.life > 0) { q.life -= d; q.vy -= 9 * d; q.x += q.vx * d; q.y += q.vy * d; q.z += q.vz * d; if (q.y < 0.01) { q.y = 0.01; q.vy *= -0.3; q.vx *= 0.5; q.vz *= 0.5; } }
      const u = q.life > 0 ? q.life / q.max : 0;
      sp.setXYZ(i, q.x || 0, q.life > 0 ? q.y : -50, q.z || 0); sc.setXYZ(i, u * 4, u * (2.2 + 1.2 * q.hot), u * 1.1 * q.hot); // (hot: they bloom)
    });
    sp.needsUpdate = true; sc.needsUpdate = true;
  }
  set visible(v) { this.root.visible = v; }
}
