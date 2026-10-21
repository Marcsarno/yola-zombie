// Chapter 2: the ground between the roads, the old Survive build's terrain (web/src/world/ground.js, which the user said
// was "pretty good") under stochastic tiling, all in world metres (no UVs). The lawn is Marc's texture pack (2026-10-21,
// blender/hood/make_lawn_tex.py): the kept house lawn everywhere, the neglected one along walls and over the rough common
// ground, the worn one where feet go, darker thicker clumps over them; worn dirt and litter where the masks put them.
// splat (optional): a top-down mask over `rect` [x0, z0, w, d]: r = worn dirt, g = leaf litter, b = extra dryness.
// lawn (optional), over the same rect (mask_hood.py OUT_LAWN): r = the uncut edge along walls (and the rough common ground),
// g = worn by feet, b = bare soil.
import * as THREE from 'three';
import { tex } from './materials.js';
import { cutawayPatch } from './cutaway.js';

const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
export function terrainMaterial({ splat = null, paths = null, lawn = null, rect = [-130, -130, 260, 260] } = {}) {
  const mat = new THREE.MeshStandardMaterial({ normalMap: tex('lawn_bl_normal.webp'), roughness: 0.95, metalness: 0 });
  const u = {
    lawnHouse: { value: tex('lawn_house_albedo.webp', { srgb: true }) }, lawnWorn: { value: tex('lawn_worn_albedo.webp', { srgb: true }) }, lawnEdge: { value: tex('lawn_edge_albedo.webp', { srgb: true }) },
    dirtMap: { value: tex('dirt_albedo.webp', { srgb: true }) }, dirtNrm: { value: tex('dirt_normal.webp') },
    litterMap: { value: tex('forest_floor_albedo.webp', { srgb: true }) }, sandMap: { value: tex('sandy_soil_albedo.webp', { srgb: true }) },
    macroTex: { value: tex('macro_noise.webp') }, lawnTex: { value: lawn || black }, splatTex: { value: splat || black }, pathsTex: { value: paths || black }, splatRect: { value: new THREE.Vector4(...rect) },
  };
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTW;
uniform sampler2D lawnHouse, lawnWorn, lawnEdge, dirtMap, dirtNrm, litterMap, sandMap, macroTex, lawnTex, splatTex, pathsTex;
uniform vec4 splatRect;
float gBlend, gTile; vec2 gOffA, gOffB;`)
      .replace('#include <map_fragment>', `
  vec2 wuv = vTW.xz;
  vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * wuv, ruv2 = mat2(0.28, 0.96, -0.96, 0.28) * wuv;
  float n1 = texture2D(macroTex, wuv * 0.021).r, n2 = texture2D(macroTex, ruv * 0.083 + 0.3).g, n3 = texture2D(macroTex, ruv2 * 0.31 + 0.7).b;
  float n4 = texture2D(macroTex, ruv2 * 0.0071 + 0.15).g, n5 = texture2D(macroTex, ruv * 0.9 + 0.45).r, n8 = texture2D(macroTex, ruv * 0.19 + 0.27).g;
  vec4 sp = texture2D(splatTex, (wuv - splatRect.xy) / splatRect.zw), lw = texture2D(lawnTex, (wuv - splatRect.xy) / splatRect.zw);
  // (stochastic tiling: two offset copies of a tile, the noise choosing between them, so the 9 m tile never shows its repeat)
  float ki = texture2D(macroTex, ruv * 0.046 + 0.61).r * 8.0, kf = fract(ki), ka = floor(ki);
  gOffA = sin(vec2(3.0, 7.0) * ka); gOffB = sin(vec2(3.0, 7.0) * (ka + 1.0));
  vec2 pUv = wuv / 9.0, pdx = dFdx(pUv), pdy = dFdy(pUv);   // (9 m a tile: its yellow-green patches read as broad patches, not a fine mush)
  vec3 ha = textureGrad(lawnHouse, pUv + gOffA, pdx, pdy).rgb, hb = textureGrad(lawnHouse, pUv + gOffB, pdx, pdy).rgb;
  gTile = smoothstep(0.2, 0.8, kf - 0.1 * dot(ha - hb, vec3(1.0)));
  #define TILE(t) mix(textureGrad(t, pUv + gOffA, pdx, pdy).rgb, textureGrad(t, pUv + gOffB, pdx, pdy).rgb, gTile)
  // a lawn nobody has kept perfect (Marc's goal picture, 2026-10-21: "a little more variety", "not perfectly groomed"): the
  // house lawn; the neglected one along the walls and fences and over the rough common ground (the lawn mask's r, and now
  // and then a broad patch of it anywhere), darker where it grows thickest by the walls; the worn one outside the patios'
  // doors, along the way people walk off them and round the playground (g); darker, thicker clumps a few metres across over
  // it all. (The scene's warm sun turns the pack's yellow-green yellow: back toward the green it is in the pictures.)
  vec3 lawn = mix(ha, hb, gTile);
  float rough = clamp(lw.r * 1.15 + smoothstep(0.62, 0.85, n2 * 0.6 + n8 * 0.4) * 0.35, 0.0, 1.0);
  lawn = mix(lawn, TILE(lawnEdge) * mix(1.0, 0.72, lw.r * lw.r), rough);
  lawn = mix(lawn, TILE(lawnWorn), clamp(lw.g * 1.1, 0.0, 1.0));
  lawn *= vec3(0.7, 0.86, 1.0);
  lawn *= mix(vec3(1.0), vec3(0.62, 0.76, 0.55), smoothstep(0.4, 0.7, n3 * 0.65 + n5 * 0.35) * 0.8);
  // worn dirt where the kerbs and walls wear it (the splat's r) and in rare small spots, bare soil round the AC units and the
  // patios' corners (the lawn mask's b) and through the grass where it is worn most; leaf litter under the trees (the
  // splat's g) and gathered along the walls
  float dirt = clamp(sp.r * 0.75 + smoothstep(0.8, 0.9, n1 * 0.6 + n2 * 0.5) * 0.8, 0.0, 1.0);
  dirt = smoothstep(0.45, 0.85, dirt + (n3 - 0.5) * 0.3 + (n5 - 0.5) * 0.2);
  dirt = max(dirt, smoothstep(0.25, 0.75, lw.b + (n5 - 0.5) * 0.3));
  dirt = max(dirt, smoothstep(0.55, 0.95, lw.g + (n5 - 0.5) * 0.35) * 0.6);
  vec3 d = texture2D(dirtMap, ruv / 5.3 + 0.37).rgb * vec3(1.18, 1.08, 0.92);   // (plain earth, not red clay)
  vec3 sd = mix(texture2D(sandMap, ruv2 / 3.7).rgb * vec3(1.05, 0.92, 0.74), d, 0.35);   // (the shore's sand, below)
  float litter = max(clamp(sp.g * (0.5 + n3 * 0.5), 0.0, 1.0) * 0.5, lw.r * smoothstep(0.5, 0.78, n5 * 0.6 + n3 * 0.4) * 0.55);
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
  }`);
    cutawayPatch(sh);
  };
  mat.customProgramCacheKey = () => 'hoodterrain';
  return mat;
}
