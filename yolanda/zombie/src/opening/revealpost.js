// The reveal's own picture finish (2026-10-19, the user: higher quality smoke, fog and lighting "just for the opening.. not
// for the whole game"): from the cut to the lift to the hand-off the opening draws through this chain instead of the game's
// (render/looks.js is untouched): the scene, a soft glow around the real lights only, then a film finish (a gentle grade,
// a vignette, fine animated grain), then the tone mapping.
// The glow is selective (three.js's selective-bloom method): the lights (the failing fitting, its sparks, the floor number,
// the EXIT signs: anything on BLOOM_LAYER) are drawn again alone, on black, blurred, and added over the scene. A plain
// brightness threshold could not work here: her badge in the flash measured 12x white, the fitting itself only 3x.
// Built once, compiled behind the title screen (warm), so the cut to the lift never stalls on it.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const BLOOM_LAYER = 11; // (the opening marks its lights with it: object.layers.enable(BLOOM_LAYER))

// the scene with the lights' glow added, then (in linear light, before the tone mapping) cool shadows / warm highlights, a
// vignette, grain stronger in the dark
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, tGlow: { value: null }, glow: { value: 1 }, time: { value: 0 }, grain: { value: 0.016 }, vig: { value: 0.32 }, film: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tGlow; uniform float glow; uniform float time; uniform float grain; uniform float vig; uniform float film; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 g = c.rgb + texture2D(tGlow, vUv).rgb * glow;
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      vec3 f = g * mix(vec3(0.94, 0.99, 1.05), vec3(1.05, 1.0, 0.95), smoothstep(0.04, 0.7, l));
      vec2 d = vUv - 0.5; f *= 1.0 - vig * smoothstep(0.28, 0.8, length(d * vec2(1.0, 0.85)));
      f += (h(vUv * 931.0 + fract(time) * 17.0) - 0.5) * grain * (0.5 + 0.5 * (1.0 - clamp(l * 2.0, 0.0, 1.0)));
      gl_FragColor = vec4(max(mix(g, f, film), 0.0), c.a);
    }`,
};

export class RevealPost {
  constructor(renderer, scene, camera) { this.renderer = renderer; this.scene = scene; this.camera = camera; this.c = null; }
  build() {
    const r = this.renderer, s = r.getDrawingBufferSize(new THREE.Vector2());
    // the lights alone, blurred (half size: cheap on a phone)
    const gc = (this.gc = new EffectComposer(r)); gc.renderToScreen = false; gc.setPixelRatio(1); gc.setSize(s.x / 2, s.y / 2);
    gc.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(s.x / 2, s.y / 2), 1, 0.55, 0); gc.addPass(this.bloom);
    // the scene, the glow over it, the finish
    const c = (this.c = new EffectComposer(r)); c.setPixelRatio(1); c.setSize(s.x, s.y); this.w = s.x; this.h = s.y;
    c.addPass(new RenderPass(this.scene, this.camera));
    this.finish = new ShaderPass(FinishShader); this.finish.uniforms.tGlow.value = gc.renderTarget2.texture; c.addPass(this.finish);
    c.addPass(new OutputPass());
  }
  // Q: RT.quality (the Studio's dials)
  render(Q) {
    if (!this.c) this.build();
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (s.x !== this.w || s.y !== this.h) { this.w = s.x; this.h = s.y; this.c.setSize(s.x, s.y); this.gc.setSize(s.x / 2, s.y / 2); this.bloom.setSize(s.x / 2, s.y / 2); }
    const u = this.finish.uniforms, glow = Q.bloom > 0;
    if (glow) { // the lights alone: only BLOOM_LAYER, on black
      const cam = this.camera, mask = cam.layers.mask, bg = this.scene.background, fog = this.scene.fog;
      cam.layers.set(BLOOM_LAYER); this.scene.background = null; this.scene.fog = null;
      this.bloom.strength = 1; this.bloom.radius = Q.bloomRadius; this.bloom.threshold = 0;
      this.gc.render();
      cam.layers.mask = mask; this.scene.background = bg; this.scene.fog = fog;
      u.tGlow.value = this.gc.readBuffer.texture; // (the bloom pass writes its result back into the composer's read buffer)
    }
    u.glow.value = glow ? Q.bloom : 0; u.film.value = Q.film ? 1 : 0; u.time.value = (performance.now() % 100000) / 1000; u.grain.value = Q.grain; u.vig.value = Q.vignette;
    this.c.render();
  }
}
