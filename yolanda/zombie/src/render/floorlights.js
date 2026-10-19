// The chapter's light plan (2026-10-19, the user: "bake it all in and apply the lighting through each level"): the lighting
// lab's picks (render/lightkit.js) on Floors 7, 6 and 5. Every room gets its ceiling fittings from its own size and kind
// (a grid about 6-7 m apart, a line down a corridor), the kind's colour and brightness, and its wear (an outbreak hospital:
// most tubes steady, some buzzing, some failing, a few dead; the flooded ward almost dark, the works and the plant warm and
// tired). EXIT signs over the doors that lead on. One baked floor image per floor (blender/bake_floor.py, Cycles), named
// assets/hospital/floor<n>_light.jpg, laid across the floor's own bounds.
import { FLOORS, CHAPTER } from '../core/chapter.js';

const KIND = { // [colour, brightness on the floor (lightkit's k), steady / buzz / failing / dead shares]
  clinical: [0xdbe8ff, 0.5, [0.64, 0.12, 0.12, 0.12]],
  corridor: [0xe6f0ff, 0.46, [0.5, 0.15, 0.17, 0.18]],
  hub: [0xfff1dc, 0.56, [0.8, 0.1, 0.06, 0.04]],
  works: [0xffd9a8, 0.48, [0.5, 0.2, 0.15, 0.15]],
  toilets: [0xe8fff4, 0.42, [0.5, 0.2, 0.2, 0.1]],
  cold: [0xcfe6ff, 0.5, [0.8, 0.1, 0.06, 0.04]],
  lab: [0xe2f0ff, 0.52, [0.75, 0.12, 0.08, 0.05]],
  lounge: [0xffe2b8, 0.52, [0.7, 0.18, 0.08, 0.04]],
  flood: [0xbfe2ff, 0.4, [0.25, 0.1, 0.3, 0.35]],
  mri: [0xcfe2ff, 0.55, [0.85, 0.1, 0.05, 0]],
  dim: [0xc8d8f0, 0.36, [0.6, 0.15, 0.15, 0.1]],
  safe: [0xe8f4ff, 0.52, [1, 0, 0, 0]], // (the story's safe rooms: every tube works)
};
const ROOM_KIND = {
  or: 'clinical', s7: 'clinical', n7: 'hub', t7: 'clinical', v7: 'works', c7: 'lounge', p7: 'works', x7: 'works', r7: 'clinical', wc7: 'toilets', jn7: 'works', sc7: 'dim',
  o6: 'lounge', w6: 'clinical', wc6: 'toilets', jn6: 'works', e6: 'hub', cw6: 'corridor', cm6: 'corridor', ce6: 'corridor', b6: 'clinical', n6: 'hub', p6: 'lab', k6: 'safe', a6: 'works', s6: 'lab',
  wt5: 'toilets', jn5: 'works', pa5: 'lab', e5: 'hub', w5: 'flood', h5: 'hub', i5: 'safe', pt5: 'toilets', rr5: 'dim', r5: 'clinical', x5: 'clinical', m5: 'mri',
};
const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
const stateOf = (w, u) => (u < w[0] ? 'steady' : u < w[0] + w[1] ? 'buzz' : u < w[0] + w[1] + w[2] ? 'failing' : 'dead');

function floorPlan(n) {
  const F = FLOORS[n], fixtures = [], rooms = [];
  for (const r of F.rooms) {
    const kind = ROOM_KIND[r.id] || 'clinical', [col, k, wear] = KIND[kind];
    for (const [x0, x1, z0, z1] of r.rects) {
      const w = x1 - x0, d = z1 - z0; if (w < 1.5 || d < 1.5) continue;
      const nx = Math.max(1, Math.floor(w / 6)), nz = Math.max(1, Math.floor(d / 6)); // (about one fitting per 40-70 m²: pools with dark between them, as in the lab's bake)
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = x0 + ((i + 0.5) * w) / nx, z = z0 + ((j + 0.5) * d) / nz;
        fixtures.push({ kind: 'tube', x: +x.toFixed(2), z: +z.toFixed(2), col, k, state: stateOf(wear, hash(x, z)), floor: n, room: r.id });
      }
      rooms.push({ id: r.id, rect: [x0, x1, z0, z1], col, k: k * 0.3 });
    }
  }
  // the lift's own light: the cab's lamp stays on (the way out)
  fixtures.push({ kind: 'tube', x: F.lift.x, z: F.lift.inside.z, col: 0xfff3e0, k: 0.5, state: 'steady', floor: n, room: 'lift' });
  const B = F.bounds;
  return { fixtures, rooms, bake: { floor: n, url: `assets/hospital/floor${n}_light.jpg`, x0: B.minX, x1: B.maxX, z0: B.minZ, z1: B.maxZ, k: 2.2, fill: 0.3 } };
}
// EXIT signs: on the wall over a door, on the face the camera sees, facing the room it leads out of (yaw 0: facing +z)
const EXITS = [
  { x: -7.27, z: -4.05, yaw: -Math.PI / 2, state: 'steady' }, { x: -31.56, z: 2.2, yaw: 0, state: 'failing' }, { x: 3.66, z: 15.8, yaw: 0, state: 'steady' }, { x: -21.74, z: 1.2, yaw: 0, state: 'steady' },
  { x: 0.16, z: -80.0, yaw: 0, state: 'steady' }, { x: -15.7, z: -80.0, yaw: 0, state: 'failing' }, { x: -34.34, z: -64.0, yaw: 0, state: 'steady' }, { x: 0.66, z: -64.0, yaw: 0, state: 'steady' },
  { x: 1.16, z: -160.0, yaw: 0, state: 'steady' }, { x: -25.69, z: -149.9, yaw: Math.PI / 2, state: 'steady' }, { x: -4.99, z: -136.4, yaw: -Math.PI / 2, state: 'failing' }, { x: -34.1, z: -143.0, yaw: 0, state: 'steady' },
].map((e) => ({ ...e, floor: e.z > -40 ? 7 : e.z > -120 ? 6 : 5 }));

export function chapterLightPlan() {
  const P = [7, 6, 5].map(floorPlan);
  return { fixtures: P.flatMap((p) => p.fixtures), rooms: P.flatMap((p) => p.rooms), exits: EXITS, bakes: P.map((p) => p.bake), chapter: CHAPTER.name };
}
