// Lighting looks to compare in play (the Look button cycles them; the choice is remembered on this device). Each one is a
// post-processing chain over the normal render, or a change to the shadows. Costs differ a lot on a phone: the toast shows
// the frame rate a moment after switching.
//  standard: the game as it is (no post-processing).
//  ao: ground-truth ambient occlusion (GTAO): soft contact shadows where things meet (feet on the floor, props against
//      walls, under the beds). The biggest visual change and the most expensive.
//  bloom: a soft glow around bright things (emergency lights, monitors, muzzle flashes, hit flashes). Cheap at half size.
//  aoBloom: both.
//  cinematic: both, plus a gentle grade (a little contrast, cool shadows / warm highlights) and a vignette.
//  crisp: no post-processing; the sun's shadow map at twice the resolution (sharper shadows).
//  lite: no shadows at all (the cheapest).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const LOOKS = [
  ['standard', 'Standard'],
  ['ao', 'Soft contact shadows (AO)'],
  ['bloom', 'Glow on lights (bloom)'],
  ['aoBloom', 'AO + glow'],
  ['cinematic', 'Cinematic (AO, glow, grade, vignette)'],
  ['crisp', 'Crisp shadows'],
  ['lite', 'Performance (no shadows)'],
];

// grade + vignette, in linear HDR before the tone mapping (OutputPass does tone mapping and sRGB)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.08 }, shadowTint: { value: new THREE.Color(0.93, 0.98, 1.06) }, highTint: { value: new THREE.Color(1.05, 1.0, 0.94) }, vignette: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast; uniform vec3 shadowTint; uniform vec3 highTint; uniform float vignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 g = c.rgb * mix(shadowTint, highTint, smoothstep(0.05, 0.6, l));
      g = pow(max(g, 0.0), vec3(contrast)) * pow(0.4, 1.0 - contrast); // contrast around mid-grey
      vec2 d = vUv - 0.5; float v = 1.0 - vignette * smoothstep(0.25, 0.75, length(d * vec2(1.0, 0.8)));
      gl_FragColor = vec4(g * v, c.a);
    }`,
};

// (2026-10-18, the user picked the plan's G and H) the floor's mood and a film finish in ONE screen pass over the normal render
// (before the tone mapping): lift (the shadows' colour) / gain (the lights' colour) / saturation / contrast, a soft vignette,
// fine animated grain, and colour draining with Yola's health. MOODS: one per floor (7 sterile teal, 6 sick sodium, 5 red)
export const MOODS = {
  teal: { lift: [-0.012, 0.012, 0.018], gain: [0.95, 1.03, 1.04], sat: 0.88, con: 1.07 },
  sodium: { lift: [0.012, 0.008, -0.012], gain: [1.08, 1.0, 0.82], sat: 0.8, con: 1.06 },
  red: { lift: [0.02, -0.006, -0.006], gain: [1.1, 0.9, 0.88], sat: 0.92, con: 1.1 },
  none: { lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, con: 1 },
};
const MoodShader = {
  uniforms: { tDiffuse: { value: null }, lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) }, sat: { value: 1 }, con: { value: 1 },
    vig: { value: 0 }, grain: { value: 0 }, time: { value: 0 }, drain: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 lift; uniform vec3 gain; uniform float sat; uniform float con; uniform float vig; uniform float grain; uniform float time; uniform float drain; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 g = c.rgb * gain + lift * (1.0 - clamp(c.rgb, 0.0, 1.0));
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      g = mix(vec3(l), g, sat * (1.0 - 0.75 * drain));
      g = max(g, 0.0); g = pow(g, vec3(con)) * pow(0.4, 1.0 - con);
      vec2 d = vUv - 0.5; g *= 1.0 - vig * smoothstep(0.3, 0.8, length(d * vec2(1.0, 0.85)));
      g += (h(vUv * 917.0 + time) - 0.5) * grain * (0.6 + 0.4 * (1.0 - l));
      gl_FragColor = vec4(g, c.a);
    }`,
};
export class Looks {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.key = 'standard'; this.composer = null; this.baseShadow = null;
  }
  build() {
    const r = this.renderer, size = r.getDrawingBufferSize(new THREE.Vector2());
    const c = (this.composer = new EffectComposer(r));
    c.setPixelRatio(1); c.setSize(size.x, size.y);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.2, thickness: 1.5, scale: 1.3, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    this.gtao.blendIntensity = 1.0;
    c.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.45, 0.82);
    c.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    this.moodPass2 = new ShaderPass(MoodShader); c.addPass(this.moodPass2); this.applyMood(); // (the floor's mood over the other looks too)
    c.addPass(new OutputPass());
  }
  setSize() {
    if (!this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y); this.gtao.setSize(size.x, size.y); this.bloom.setSize(size.x / 2, size.y / 2);
  }
  set(key) {
    this.key = key;
    const r = this.renderer, sun = this.findSun();
    if (this.baseShadow === null && sun) this.baseShadow = { enabled: r.shadowMap.enabled, map: sun.shadow.mapSize.x };
    // shadows: crisp doubles the sun's map, lite turns shadows off, every other look restores them
    if (sun && this.baseShadow) {
      const want = key === 'crisp' ? this.baseShadow.map * 2 : this.baseShadow.map;
      if (sun.shadow.mapSize.x !== want) { sun.shadow.mapSize.set(want, want); sun.shadow.map?.dispose(); sun.shadow.map = null; }
      const on = key !== 'lite' && this.baseShadow.enabled;
      if (r.shadowMap.enabled !== on) { r.shadowMap.enabled = on; this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); }
      r.shadowMap.needsUpdate = true;
    }
    const post = { ao: [1, 0, 0], bloom: [0, 1, 0], aoBloom: [1, 1, 0], cinematic: [1, 1, 1] }[key];
    if (post && !this.composer) this.build();
    if (this.composer) { this.gtao.enabled = !!post?.[0]; this.bloom.enabled = !!post?.[1]; this.grade.enabled = !!post?.[2]; }
    this.post = !!post;
  }
  findSun() { let s = null; this.scene.traverse((o) => { if (!s && o.isDirectionalLight && o.castShadow) s = o; }); return s; }
  // the mood pass (MoodShader): a preset (MOODS key or null: off) and the film finish (grain, vignette); drain: 0..1 health lost
  setMood(key, film) {
    this.moodKey = key; this.film = film;
    if (!key && !film) { this.moodOn = false; this.applyMood(); return; }
    if (!this.moodComposer) {
      const r = this.renderer, size = r.getDrawingBufferSize(new THREE.Vector2()), c = (this.moodComposer = new EffectComposer(r));
      c.setPixelRatio(1); c.setSize(size.x, size.y); c.addPass(new RenderPass(this.scene, this.camera));
      this.moodPass = new ShaderPass(MoodShader); c.addPass(this.moodPass); c.addPass(new OutputPass());
    }
    this.moodOn = true; this.applyMood();
  }
  applyMood() { // the preset and the film finish onto both mood passes (alone, or inside the other looks' chain)
    const M = MOODS[this.moodKey || 'none'];
    for (const P of [this.moodPass, this.moodPass2]) { if (!P) continue; const u = P.uniforms; u.lift.value.fromArray(M.lift); u.gain.value.fromArray(M.gain); u.sat.value = M.sat; u.con.value = M.con; u.vig.value = this.film ? 0.32 : 0; u.grain.value = this.film ? 0.035 : 0; }
    if (this.moodPass2) this.moodPass2.enabled = !!this.moodOn;
  }
  setDrain(k) { for (const P of [this.moodPass, this.moodPass2]) if (P) P.uniforms.drain.value = this.film ? k : 0; }
  render() {
    if (this.moodOn && !this.post) { const s = this.renderer.getDrawingBufferSize(new THREE.Vector2()); if (s.x !== this.mw || s.y !== this.mh) { this.mw = s.x; this.mh = s.y; this.moodComposer.setSize(s.x, s.y); } this.moodPass.uniforms.time.value = (performance.now() % 100000) / 1000; this.moodComposer.render(); return; }
    if (this.moodPass2) this.moodPass2.uniforms.time.value = (performance.now() % 100000) / 1000;
    if (this.post) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}
