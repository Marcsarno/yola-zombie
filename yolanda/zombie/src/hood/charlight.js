// Chapter 2's character light (2026-10-20, the user comparing our Mixamo characters with Mixamo's own viewer: "so it's the
// lighting? lets fix the lighting"). Two parts, both on the characters' own materials only (the street is untouched):
// - less fill: outdoors the sky light and the environment fill every shadow on a body, so clothes lose their folds and
//   faces go flat. A one-pixel black ambient-occlusion map at aoMapIntensity = 1 - share scales a lit material's indirect
//   light only (three.js applies aoMap to the hemisphere and environment light, never the sun): the sun side stays lit,
//   the far side darkens.
// - a rim light (the user: "add the rim light"): a thin warm edge where the surface turns away from the camera, strongest
//   on the side away from the sun, so the figures stand off the street. A few lines added to the shader before its output
//   (any shader change already on a material, the scrubs' cloth sheen, runs first).
// hood.charLight(share) and hood.rim({ strength, power, color }) retune both live.
import * as THREE from 'three';

export const CHAR_LIGHT = { fill: 0.5 };
// (tuned on the lineup: a wide cool rim, power 2.6, greyed James's face; narrow and warm reads as an edge only)
export const RIM = { strength: { value: 0.55 }, power: { value: 4.5 }, color: { value: new THREE.Color(0xfff1e0) }, sunView: { value: new THREE.Vector3(0, 1, 0) } };
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK.needsUpdate = true;
const roots = new Set(), rimmed = new WeakSet();
const RIM_GLSL = `
  { vec3 rimV = normalize( vViewPosition ); float rimF = pow( 1.0 - saturate( dot( normal, rimV ) ), rimPower );
    float rimAway = 0.35 + 0.65 * saturate( -dot( normal, rimSunView ) ); // (brightest on the side away from the sun)
    outgoingLight += rimColor * ( rimF * rimAway * rimStrength ); }
  #include <opaque_fragment>`;
function addRim(m) {
  if (rimmed.has(m)) return; rimmed.add(m);
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.rimStrength = RIM.strength; sh.uniforms.rimPower = RIM.power; sh.uniforms.rimColor = RIM.color; sh.uniforms.rimSunView = RIM.sunView;
    sh.fragmentShader = 'uniform float rimStrength;\nuniform float rimPower;\nuniform vec3 rimColor;\nuniform vec3 rimSunView;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', RIM_GLSL);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|rim';
  m.needsUpdate = true;
}
export function characterLight(root) {
  if (!root) return;
  roots.add(root);
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m?.isMeshStandardMaterial) continue; // (lit materials only: an unlit eye glow or blood decal would darken)
      addRim(m);
      if (m.aoMap && m.aoMap !== BLACK) continue; // (a real occlusion map is left alone)
      if (m.aoMap !== BLACK) { m.aoMap = BLACK; m.needsUpdate = true; }
      m.aoMapIntensity = 1 - CHAR_LIGHT.fill;
    }
  });
}
export function setCharacterFill(share) { CHAR_LIGHT.fill = share; for (const r of roots) characterLight(r); }
export function setRim({ strength, power, color } = {}) { if (strength != null) RIM.strength.value = strength; if (power != null) RIM.power.value = power; if (color != null) RIM.color.value.set(color); return { strength: RIM.strength.value, power: RIM.power.value }; }
// each frame: the direction to the sun in the camera's space (the shader's normals are in view space)
export function updateRim(camera, sunFrom) { RIM.sunView.value.copy(sunFrom).transformDirection(camera.matrixWorldInverse); }
