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
  render() {
    if (this.post) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}
