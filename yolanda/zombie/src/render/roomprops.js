// The room-mechanic props modelled in Blender (blender/make_room_props.py -> assets/props/room_mechanics/*.glb): the oxygen
// cylinder and its trolley, the flood's electrical panel, the MRI scanner and its magnet stop. Loaded once at start; a
// prop asked for before it has loaded falls back to the code-built stand-in (render/rooms.js, render/clipchars.js).
// Each clone gets its own copy of the materials the game lights at run time (MRI_Glow, Panel_LampGreen / Red, Button_Red).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const ROOMPROPS = {};
const NAMES = ['o2_cylinder', 'o2_trolley', 'flood_panel', 'mri_scanner', 'magnet_stop'];
const LIVE = /^(MRI_Glow|Panel_LampGreen|Panel_LampRed|Button_Red)/;

export function loadRoomProps(base = 'assets/props/room_mechanics/') {
  const L = new GLTFLoader();
  return Promise.all(NAMES.map((n) => L.loadAsync(base + n + '.glb').then((g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    ROOMPROPS[n] = g.scene;
  }).catch((e) => console.warn('room prop', n, e))));
}
export function propClone(n) {
  const s = ROOMPROPS[n]; if (!s) return null;
  const c = s.clone(true);
  c.traverse((o) => { if (o.isMesh && LIVE.test(o.material?.name || '')) o.material = o.material.clone(); });
  return c;
}
export function findMat(root, name) { let m = null; root.traverse((o) => { if (!m && o.isMesh && (o.material?.name || '').startsWith(name)) m = o.material; }); return m; }
