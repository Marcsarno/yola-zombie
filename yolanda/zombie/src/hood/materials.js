// Chapter 2 (the neighbourhood): shared materials for the old Survive kit's models, ported from its
// web/src/engine/materials.js. Models carry placeholder materials named M_<key> or M_<key>__<paint> with UVs in texture
// tiles; swapMaterials() replaces them with one cached MeshStandardMaterial per name, all keys sharing one texture set
// (assets/neighborhood/tex/<key>_albedo|_normal|_orm.webp). Albedo alpha is paint coverage: a paint tints it.
// Every material also gets the see-through hole (cutaway.js) so houses between the camera and the player open up.
import * as THREE from 'three';
import { cutawayPatch } from './cutaway.js';

const TEX = 'assets/neighborhood/tex/';
export const TILE_M = {
  asphalt: 4, concrete_slab: 3, dirt: 4, grass_ground: 4, forest_floor: 4, rock: 4, wood_raw: 2, wood_dark: 2, wood_end: 0.4,
  wood_siding: 2, wood_painted: 2, brick: 2, plaster: 3, concrete_rough: 2, roof_shingles: 2, metal_painted: 2, metal_rusty: 2,
  rubber: 1, fabric: 1, bark: 2, roof_tile_barrel: 2, roof_tile_flat: 2, stucco: 3, pavers: 2, sand: 4, tile_floor: 1.8,
  tile_wall: 1, wood_floor: 2, carpet: 1, countertop: 1, palm_bark: 1, stucco_ph: 2, shingles_ph: 3,
};
const P = (r, g, b) => new THREE.Color(r, g, b);
export const PAINTS = { // linear (the old game's values)
  white: P(0.578, 0.552, 0.479), offwhite: P(0.485, 0.440, 0.347), cream: P(0.584, 0.485, 0.296), red: P(0.270, 0.027, 0.019),
  darkred: P(0.112, 0.014, 0.010), blue: P(0.042, 0.102, 0.216), lightblue: P(0.159, 0.275, 0.381), green: P(0.048, 0.084, 0.037),
  olive: P(0.098, 0.102, 0.042), army: P(0.070, 0.082, 0.032), yellow: P(0.58, 0.44, 0.07), orange: P(0.468, 0.102, 0.019),
  grey: P(0.205, 0.205, 0.191), darkgrey: P(0.042, 0.042, 0.041), black: P(0.013, 0.013, 0.013), brown: P(0.105, 0.050, 0.023),
  tan: P(0.305, 0.223, 0.114), teal: P(0.047, 0.127, 0.127), sage: P(0.242, 0.301, 0.195), maroon: P(0.102, 0.019, 0.019),
  navy: P(0.017, 0.028, 0.060), tarpblue: P(0.018, 0.080, 0.254), sand: P(0.392, 0.296, 0.162), salmon: P(0.687, 0.352, 0.246),
  mint: P(0.397, 0.584, 0.434), peach: P(0.761, 0.485, 0.270), paleyellow: P(0.56, 0.35, 0.075), seafoam: P(0.332, 0.558, 0.509),
  coral: P(0.694, 0.262, 0.171), skyblue: P(0.386, 0.552, 0.672), lavender: P(0.479, 0.413, 0.571), beige: P(0.672, 0.571, 0.392),
  courtblue: P(0.95, 1.5, 1.72), courtgrey: P(0.72, 0.84, 0.84), silver: P(0.80, 0.87, 1.02), weathered: P(0.60, 1.03, 2.1),
  terracotta: P(0.2, 0.085, 0.045), roofbrown: P(0.27, 0.235, 0.2), lime: P(0.45, 1.0, 0.25), purple: P(0.32, 0.08, 0.42),
  villa: P(0.6, 0.61, 0.61), trim: P(0.76, 0.76, 0.74), bluegrey: P(0.34, 0.39, 0.44), tilesun: P(1.0, 1.2, 1.6), // (Chapter 4's villas: blender/grammy/make_villa.py)
};

const loader = new THREE.TextureLoader();
const texCache = new Map(), pending = new Set();
let maxAniso = 4;
export function setAnisotropy(a) { maxAniso = Math.min(8, a); }
export function texturesReady() { return Promise.all([...pending]); }
// the see-through pictures (leaves, the grime decal sheets) at half size from opt/tex/ when the layout's compressed copies are
// on (tools/hood/optimize.mjs; view.js switches it on): barely seen from the fixed camera. A missing copy loads the original.
const HALF = /^(leaves_.*|decal2?_atlas)\.webp$/;
let optTex = false;
export function useOptTex(on) { optTex = on; }
export function tex(file, { srgb = false, repeat = true } = {}) {
  const key = file + (srgb ? '|s' : '');
  if (texCache.has(key)) return texCache.get(key);
  let done; const p = new Promise((res) => { done = res; });
  const missing = () => { console.warn('hood texture missing', file); done(); };
  const half = optTex && HALF.test(file);
  const t = loader.load((half ? TEX.replace('/tex/', '/opt/tex/') : TEX) + file, () => done(), undefined,
    half ? () => loader.load(TEX + file, (o) => { t.image = o.image; t.needsUpdate = true; done(); }, undefined, missing) : missing);
  pending.add(p); p.then(() => pending.delete(p));
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.flipY = false; t.anisotropy = maxAniso;
  texCache.set(key, t);
  return t;
}

// ---- the kit shader patch: paint tint (albedo alpha), large-scale macro variation, grime at the foot of walls
const shared = { macroTex: { value: null } };
function patch(mat, opts) {
  const u = {
    paintColor: { value: (opts.paint || new THREE.Color(1, 1, 1)).clone() }, paintStrength: { value: opts.paint ? 1 : 0 },
    macroAmount: { value: opts.macro ?? 0.25 }, grimeAmount: { value: opts.grime ?? 0.35 }, tintColor: { value: (opts.tint || new THREE.Color(1, 1, 1)).clone() },
  };
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { macroTex: shared.macroTex });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKWPos;\nvarying vec3 vKWNrm;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
  {
    vec4 kwp = vec4(transformed, 1.0); vec3 kwn = objectNormal;
    #ifdef USE_INSTANCING
      kwp = instanceMatrix * kwp; kwn = mat3(instanceMatrix) * kwn;
    #endif
    kwp = modelMatrix * kwp; vKWPos = kwp.xyz; vKWNrm = normalize(mat3(modelMatrix) * kwn);
  }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vKWPos; varying vec3 vKWNrm;
uniform vec3 paintColor; uniform float paintStrength; uniform float macroAmount; uniform float grimeAmount; uniform vec3 tintColor;
uniform sampler2D macroTex;`)
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec3 kcol = sampledDiffuseColor.rgb;
  kcol = mix(kcol, kcol / 0.62 * paintColor, sampledDiffuseColor.a * paintStrength);
  diffuseColor.rgb *= kcol;
#endif
  diffuseColor.rgb *= tintColor;
  {
    float m1 = texture2D(macroTex, vKWPos.xz * 0.07 + vKWPos.y * 0.03).r;
    float m2 = texture2D(macroTex, vKWPos.xz * 0.259 + vec2(0.37, 0.71)).g;
    diffuseColor.rgb *= mix(1.0, (m1 * 0.65 + m2 * 0.35) * 1.4 + 0.3, macroAmount);
    float grime = (1.0 - smoothstep(0.0, 0.45, vKWPos.y + (m2 - 0.5) * 0.25)) * grimeAmount * (1.0 - abs(vKWNrm.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4 + vec3(0.16, 0.13, 0.10) * 0.15, clamp(grime, 0.0, 1.0));
  }`);
    cutawayPatch(sh);
  };
  mat.customProgramCacheKey = () => 'hoodkit';
}

const cache = new Map();
const NO_GRIME = new Set(['asphalt', 'concrete_slab', 'dirt', 'grass_ground', 'forest_floor', 'pavers', 'sand', 'tile_floor', 'wood_floor',
  'carpet', 'roof_shingles', 'roof_tile_barrel', 'roof_tile_flat', 'shingles_ph']);
export function initMaterials() { shared.macroTex.value = tex('macro_noise.webp'); }

function standard(base, variant) {
  const orm = tex(`${base}_orm.webp`);
  const m = new THREE.MeshStandardMaterial({ map: tex(`${base}_albedo.webp`, { srgb: true }), normalMap: tex(`${base}_normal.webp`),
    roughnessMap: orm, metalnessMap: orm, aoMap: orm, aoMapIntensity: 0.8, roughness: 1, metalness: 1 });
  m.normalScale.set(1, -1);
  let tint = null;
  if (variant === 'burnt') tint = new THREE.Color(0.18, 0.16, 0.15);
  if (base === 'bark') tint = new THREE.Color(1.9, 1.75, 1.55); // (the bark albedo is very dark: trunks read black otherwise)
  patch(m, { paint: PAINTS[variant], tint, grime: NO_GRIME.has(base) ? 0 : 0.35 });
  m.name = `M_${base}${variant ? '__' + variant : ''}`;
  return m;
}
const plain = (o) => { const m = new THREE.MeshStandardMaterial(o); m.onBeforeCompile = (sh) => cutawayPatch(sh); m.customProgramCacheKey = () => 'hoodplain'; return m; };
function special(base, variant) {
  switch (base) {
    case 'glass': return variant === 'car' ? plain({ color: new THREE.Color(0.035, 0.045, 0.05), roughness: 0.3, metalness: 0.1 })
      : plain({ color: new THREE.Color(0.06, 0.075, 0.08), roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.62, depthWrite: false });
    case 'screen': return plain({ color: 0x080808, transparent: true, opacity: 0.32, side: THREE.DoubleSide, roughness: 0.8, depthWrite: false });
    // (the villas' dark insides, behind their windows: they cut with the see-through hole too, else its black top shows
    // through a faded roof; right down to the villa's own plinth (0.12 m), wider and solid where the walls and roof only
    // dither at the hole's rim, and a little past Marc (a wall beside him cuts; the dark box behind it at his own depth too))
    case 'void': {
      const m = new THREE.MeshBasicMaterial({ color: 0x000000 });
      m.onBeforeCompile = (sh) => {
        cutawayPatch(sh);
        sh.fragmentShader = sh.fragmentShader.replace('vCutW.y > cutFloor', 'vCutW.y > 0.13').replace('float r = cutR * mix(0.75, 1.0, t);', 'float r = cutR * 1.5;')
          .replace('if (k > h * 0.999) discard;', 'if (d < r) discard;').replace('t < 0.985', 't < 1.12');
      };
      m.customProgramCacheKey = () => 'hoodvoid'; return m;
    }
    case 'plastic': return plain({ color: (PAINTS[variant] || P(0.03, 0.03, 0.03)).clone(), roughness: 0.38 });
    case 'paper': return plain({ color: P(0.55, 0.53, 0.48), roughness: 0.9 });
    case 'flat': return plain({ color: variant === 'leafcore' ? P(0.06, 0.085, 0.032) : (PAINTS[variant] || P(0.5, 0.5, 0.5)).clone(), roughness: 0.92 });
    case 'emissive': { const c = variant === 'amber' ? P(1, 0.6, 0.1) : (PAINTS[variant] || P(1, 0.6, 0.2)); return plain({ color: c, emissive: c, emissiveIntensity: 1.5 }); }
    case 'water': return waterMaterial();
    case 'leaves': { const m = plain({ map: tex(`leaves_${variant || 'broad'}_albedo.webp`, { srgb: true }), alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.85 }); m.userData.foliage = true; return m; }
    case 'decal': case 'decal2': return plain({ map: tex(base + '_atlas.webp', { srgb: true, repeat: false }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.95 });
    case 'yard': { const m = plain({ map: tex('yard_foliage_albedo.webp', { srgb: true }), roughness: 0.88, metalness: 0 }); m.userData.foliage = true; return m; }
    case 'chainlink': return plain({ map: chainlinkTex(), color: P(0.62, 0.62, 0.58), metalness: 0.6, roughness: 0.5, alphaTest: 0.5, side: THREE.DoubleSide });
  }
  return null;
}
// the chain-link diamond wire (the old build's): drawn once on a canvas, cut out by alpha (UVs tile every 0.5 m)
let _chain = null;
function chainlinkTex() {
  if (_chain) return _chain;
  const s = 256, n = 8, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = (x / s) * n, v = (y / s) * n, a = Math.abs((((u + v) % 1) + 1) % 1 - 0.5), b = Math.abs((((u - v) % 1) + 1) % 1 - 0.5);
    const i = (y * s + x) * 4; img.data[i] = 204; img.data[i + 1] = 204; img.data[i + 2] = 199; img.data[i + 3] = a > 0.44 || b > 0.44 ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  _chain = new THREE.CanvasTexture(c); _chain.wrapS = _chain.wrapT = THREE.RepeatWrapping; _chain.colorSpace = THREE.SRGBColorSpace;
  return _chain;
}
let _water = null;
export function waterMaterial() {
  if (_water) return _water;
  _water = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.035, 0.06, 0.045), roughness: 0.06, metalness: 0, normalMap: tex('rock_normal.webp'), normalScale: new THREE.Vector2(0.15, 0.15), transparent: true, opacity: 0.88, envMapIntensity: 0.5 });
  _water.userData.water = true;
  return _water;
}
// the lake shallowing toward its shore (the keep-off map's green in the water: its depth, blender/hood/mask_hood.py): browner, clearer
// over the last few metres, so the water meets the wet sand instead of a hard line
export function shoreWater(splat, rect) {
  const m = waterMaterial(); if (m.userData.shore) return; m.userData.shore = true;
  const u = { shoreTex: { value: splat }, shoreRect: { value: new THREE.Vector4(...rect) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW; uniform sampler2D shoreTex; uniform vec4 shoreRect;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  float depth = texture2D(shoreTex, (vWW.xz - shoreRect.xy) / shoreRect.zw).g;   // (0 at the edge, 1 a few metres out)
  diffuseColor.rgb = mix(vec3(0.15, 0.16, 0.11), diffuseColor.rgb, smoothstep(0.0, 0.9, depth));
  diffuseColor.a = mix(0.12, 0.96, smoothstep(0.0, 0.85, depth));`);
  };
  m.customProgramCacheKey = () => 'hoodwater';
  m.needsUpdate = true;
}
export function kitMaterial(key) {
  if (cache.has(key)) return cache.get(key);
  let base = key, variant = '';
  if (key.includes('__')) [base, variant] = key.split('__');
  let m = special(base, variant);
  if (!m && TILE_M[base] !== undefined) m = standard(base, variant);
  if (!m) { m = plain({ color: 0xff00ff }); console.warn('unknown kit material', key); }
  cache.set(key, m);
  return m;
}
// the kit rows' ivy (one flat material, Ivy_Olive, the user: "the vines on the houses kind of look like shit ... doesn't
// match the overall theme"): its colour varies in large irregular patches over each wall (world-space noise): deep green,
// dusty olive, sun-dried brown runs, a little darker toward the ground; muted so it sits with the weathered grey stucco
function ivyPatch(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vIvyW;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  { vec4 iw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      iw = instanceMatrix * iw;
    #endif
    vIvyW = (modelMatrix * iw).xyz; }`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vIvyW;
float ivyH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ivyN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ivyH(i), ivyH(i + vec2(1, 0)), f.x), mix(ivyH(i + vec2(0, 1)), ivyH(i + vec2(1, 1)), f.x), f.y); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 q = vec2(vIvyW.x + vIvyW.z, vIvyW.y * 1.3);
    float n = ivyN(q * 0.42) * 0.7 + ivyN(q * 1.7) * 0.3;
    float dry = smoothstep(0.62, 0.84, ivyN(q * 0.23 + 7.3));
    vec3 deep = vec3(0.075, 0.13, 0.055), dusty = vec3(0.15, 0.16, 0.08), brown = vec3(0.2, 0.13, 0.07);
    vec3 c = mix(deep, dusty, smoothstep(0.3, 0.75, n));
    c = mix(c, brown, dry * 0.9);
    c *= mix(0.7, 1.0, smoothstep(0.0, 2.5, vIvyW.y)) * (0.82 + 0.3 * ivyN(q * 3.1));
    diffuseColor.rgb = c * 1.6;
  }`);
}

/** Replace M_* placeholder materials under root with the shared kit materials; every other material gets the cutaway. */
export function swapMaterials(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const fix = (mat) => {
      const nm = mat?.name || '';
      if (nm.startsWith('M_') && !mat.map) return kitMaterial(nm.slice(2).replace(/\.\d+$/, ''));
      if (!seen.has(mat) && !mat.userData.hoodCut) {
        seen.add(mat); mat.userData.hoodCut = true; const prev = mat.onBeforeCompile, ivy = /^ivy/i.test(nm);
        if (ivy) mat.color?.setRGB(1, 1, 1);
        mat.onBeforeCompile = (sh, r) => { prev?.call(mat, sh, r); if (ivy) ivyPatch(sh); cutawayPatch(sh); };
        mat.customProgramCacheKey = prev ? () => 'hoodown' + mat.uuid : () => 'hoodown' + (ivy ? '-ivy' : ''); mat.needsUpdate = true;
      }
      return mat;
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
  return root;
}
