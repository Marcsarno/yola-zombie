// Chapter 2's character light (2026-10-20, the user comparing our Mixamo characters with Mixamo's own viewer: "so it's the
// lighting? lets fix the lighting"). Outdoors the sky light and the environment fill every shadow on a body, so clothes
// lose their folds and faces go flat. The characters keep only a share of that fill (the street keeps all of it): a
// one-pixel black ambient-occlusion map with aoMapIntensity = 1 - share scales a material's indirect light only (three.js
// applies aoMap to the hemisphere and environment light, never the sun), so the sun side stays lit and the far side
// darkens. No shader change; hood.charLight(share) retunes it live.
import * as THREE from 'three';

export const CHAR_LIGHT = { fill: 0.5 };
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK.needsUpdate = true;
const roots = new Set();
export function characterLight(root) {
  if (!root) return;
  roots.add(root);
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m || !('aoMap' in m) || (m.aoMap && m.aoMap !== BLACK)) continue; // (a real occlusion map is left alone)
      if (m.aoMap !== BLACK) { m.aoMap = BLACK; m.needsUpdate = true; }
      m.aoMapIntensity = 1 - CHAR_LIGHT.fill;
    }
  });
}
export function setCharacterFill(share) { CHAR_LIGHT.fill = share; for (const r of roots) characterLight(r); }
