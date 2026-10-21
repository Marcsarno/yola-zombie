// Chapter 2: the ground between the roads, the old Survive build's terrain (web/src/world/ground.js, which the user said
// was "pretty good"): Marc's Blender-modelled St. Augustine lawn tile (5 m) under stochastic tiling, recoloured to a plain
// neighbourhood lawn (2026-10-21) with a little worn dirt and litter where the splat puts it. All in world metres (no UVs).
// splat (optional): a top-down mask over `rect` [x0, z0, w, d]: r = worn dirt, g = leaf litter, b = extra dryness.
import * as THREE from 'three';
import { tex } from './materials.js';
import { cutawayPatch } from './cutaway.js';

const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
export function terrainMaterial({ splat = null, paths = null, rect = [-130, -130, 260, 260] } = {}) {
  const orm = tex('lawn_bl_orm.webp');
  const mat = new THREE.MeshStandardMaterial({ map: tex('lawn_bl_albedo.webp', { srgb: true }), normalMap: tex('lawn_bl_normal.webp'), roughnessMap: orm, roughness: 1, metalness: 0 });
  const u = {
    dirtMap: { value: tex('dirt_albedo.webp', { srgb: true }) }, dirtNrm: { value: tex('dirt_normal.webp') },
    litterMap: { value: tex('forest_floor_albedo.webp', { srgb: true }) }, sandMap: { value: tex('sandy_soil_albedo.webp', { srgb: true }) },
    macroTex: { value: tex('macro_noise.webp') }, splatTex: { value: splat || black }, pathsTex: { value: paths || black }, splatRect: { value: new THREE.Vector4(...rect) },
  };
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTW;
uniform sampler2D dirtMap, dirtNrm, litterMap, sandMap, macroTex, splatTex, pathsTex;
uniform vec4 splatRect;
float gBlend, gTile; vec2 gOffA, gOffB;`)
      .replace('#include <map_fragment>', `
  vec2 wuv = vTW.xz;
  vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * wuv, ruv2 = mat2(0.28, 0.96, -0.96, 0.28) * wuv;
  float n1 = texture2D(macroTex, wuv * 0.021).r, n2 = texture2D(macroTex, ruv * 0.083 + 0.3).g, n3 = texture2D(macroTex, ruv2 * 0.31 + 0.7).b;
  float n4 = texture2D(macroTex, ruv2 * 0.0071 + 0.15).g, n5 = texture2D(macroTex, ruv * 0.9 + 0.45).r;
  vec4 sp = texture2D(splatTex, (wuv - splatRect.xy) / splatRect.zw);
  float ki = texture2D(macroTex, ruv * 0.046 + 0.61).r * 8.0, kf = fract(ki), ka = floor(ki);
  gOffA = sin(vec2(3.0, 7.0) * ka); gOffB = sin(vec2(3.0, 7.0) * (ka + 1.0));
  vec2 gUv = wuv / 5.0, gdx = dFdx(gUv), gdy = dFdy(gUv);
  vec3 ga = textureGrad(map, gUv + gOffA, gdx, gdy).rgb, gb = textureGrad(map, gUv + gOffB, gdx, gdy).rgb;
  gTile = smoothstep(0.2, 0.8, kf - 0.1 * dot(ga - gb, vec3(1.0)));
  vec3 grass = mix(ga, gb, gTile);
  // a lived-in neighbourhood lawn (the user, 2026-10-21: "make it look like regular neighborhood grass ... a little bit of
  // dirt here and there", not "old water with algae"): the tile's own blades in a clean mid green, broad soft patches a shade
  // yellower or deeper, a few small sun-bleached spots; worn dirt only where feet and kerbs wear it (the splat's r, kept to a
  // thin edge) and in rare small spots; leaf litter only under the trees (the splat's g), light. (Colours linear.)
  float gl = dot(grass, vec3(0.3, 0.59, 0.11)), det = clamp(gl / 0.18, 0.45, 1.8);   // (the tile's blade light and dark)
  // (the scene's light about doubles these on screen: a mid lawn of about sRGB 110, 135, 70)
  vec3 lawn = mix(vec3(0.078, 0.121, 0.031), vec3(0.100, 0.130, 0.036), smoothstep(0.3, 0.85, n1 * 0.75 + n4 * 0.45 - 0.1));
  lawn = mix(lawn, vec3(0.050, 0.085, 0.022), smoothstep(0.58, 0.85, n2 * 0.6 + n3 * 0.45) * 0.45);
  lawn *= pow(det, 1.25);
  float straw = smoothstep(0.72, 0.82, n2 * 0.55 + n5 * 0.35 + n1 * 0.2) * (0.4 + sp.b * 0.5);
  lawn = mix(lawn, vec3(0.15, 0.13, 0.057) * det, straw * 0.5);
  float dirt = clamp(sp.r * 0.75 + smoothstep(0.8, 0.9, n1 * 0.6 + n2 * 0.5) * 0.8, 0.0, 1.0);
  dirt = smoothstep(0.45, 0.85, dirt + (n3 - 0.5) * 0.3 + (n5 - 0.5) * 0.2);
  vec3 d = texture2D(dirtMap, ruv / 5.3 + 0.37).rgb * vec3(1.18, 1.08, 0.92);   // (plain earth, not red clay)
  vec3 sd = mix(texture2D(sandMap, ruv2 / 3.7).rgb * vec3(1.05, 0.92, 0.74), d, 0.35);   // (the shore's sand, below)
  float litter = clamp(sp.g * (0.5 + n3 * 0.5), 0.0, 1.0) * 0.5;
  vec3 lit = texture2D(litterMap, ruv2 / 4.6 + 0.21).rgb * vec3(1.45, 1.25, 1.0);
  vec3 col = mix(lawn, d, dirt);
  col = mix(col, lit, litter * (1.0 - dirt));
  // the shore (the keep-off map's blue: highest at the water's edge): dry sand, then wet sand and mud at the waterline
  float shoreK = texture2D(pathsTex, (wuv - splatRect.xy) / splatRect.zw).b;
  col = mix(col, sd * mix(vec3(0.9, 0.85, 0.76), vec3(0.4, 0.38, 0.34), smoothstep(0.3, 0.95, shoreK)), smoothstep(0.1, 0.6, shoreK) * 0.92);
  col *= 0.95 + n4 * 0.1;   // (a whisper of broad light and dark, no blotches)
  gBlend = dirt;
  diffuseColor.rgb *= col;`)
      .replace('#include <normal_fragment_maps>', `
  {
    vec2 nUv = vTW.xz / 5.0, ndx = dFdx(nUv), ndy = dFdy(nUv);
    vec3 gn = mix(textureGrad(normalMap, nUv + gOffA, ndx, ndy).xyz, textureGrad(normalMap, nUv + gOffB, ndx, ndy).xyz, gTile) * 2.0 - 1.0;
    vec3 dn = texture2D(dirtNrm, (mat2(0.8, -0.6, 0.6, 0.8) * vTW.xz) / 5.3 + 0.37).xyz * 2.0 - 1.0;
    vec3 mapN = normalize(mix(gn, dn, gBlend));
    mapN.xy *= normalScale;
    normal = normalize( tbn * mapN );
  }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = 0.95;');
    cutawayPatch(sh);
  };
  mat.customProgramCacheKey = () => 'hoodterrain';
  return mat;
}
