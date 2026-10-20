// Chapter 2 (Marc's neighbourhood): the layout object the hospital game's simulation reads (core/layout.js useLevel('hood')).
// The world itself comes from the Blender export (view.js / world.js); this holds where play happens.
// World axes as everywhere in the game: x east, z south (toward the camera), metres; the clubhouse is to the north (-z).
import { HoodWorld } from './world.js';

export const HOOD = { cols: null, marks: {} }; // filled by hood.js from assets/neighborhood/hood_layout.json before the sim starts

// The gauntlet's stops (the plan map, 2026-10-19). bounds: the navigation area while that stop is played (zombies route
// inside it); the whole map stays drawn and collidable.
export const STAGES = {
  free: { bounds: { minX: -66, maxX: 106, minZ: -92, maxZ: 92 }, cell: 0.6 }, // (?hood=free: walk the whole map, no story)
  home: { bounds: { minX: 18, maxX: 72, minZ: -8, maxZ: 70 } },
};

// Buildings you go inside: while the player is in `rect`, everything above clipY inside `cut` disappears (cutaway.js).
// From the old build (its world.interiors): the clubhouse, and the two damaged end units' open garages.
export const INTERIORS = [
  { id: 'club', rect: { cx: 9.575, cz: -53.96, hx: 11, hz: 7.5, yaw: 0 }, cut: { cx: 9.575, cz: -52.2, hx: 13.6, hz: 11.4, yaw: 0 }, clipY: 3.3 },
  { id: 'B05#4', rect: { cx: 53.479, cz: -2.287, hx: 3.7, hz: 6.375, yaw: -0.4377 }, clipY: 2.45 },
  { id: 'B06#4', rect: { cx: 0.760, cz: -6.227, hx: 3.7, hz: 6.375, yaw: 0.6575 }, clipY: 2.45 },
];

// Floors above the ground that people stand on (the user: feet "slipped right through the floor" on the old boat and in the
// clubhouse): inside `rect` characters are drawn standing at y, easing up from the ground over the first `ramp` m of the
// local -x end (the dock's shore end). The clubhouse floor is at 0.05 (nothing to do); the damaged units sink in Blender.
export const FLOORS = [
  { id: 'dock', cx: -26.65, cz: -80.62, hx: 4.6, hz: 1.35, yaw: -3.0216, y: 0.39, ramp: 0.6 },
];
export function groundY(x, z) {
  for (const f of FLOORS) {
    const dx = x - f.cx, dz = z - f.cz, c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) > f.hx || Math.abs(lz) > f.hz) continue;
    const k = Math.min(1, Math.max(0, (lx + f.hx) / f.ramp));
    return f.y * k * k * (3 - 2 * k);
  }
  return 0;
}

export const HOOD_LAYOUT = {
  name: 'hood', hood: true,
  bounds: STAGES.home.bounds,
  camBounds: { minX: -70, maxX: 110, minZ: -96, maxZ: 96 },
  playerStart: { x: 38.2, z: 40.6, yaw: Math.PI / 2 }, // Marc's side door (B01-H's east wall), facing the yard
  walls: [], doors: [], props: [],
  buildWorld(World) {
    const st = STAGES[HOOD.stage || 'home'] || STAGES.home;
    const w = new HoodWorld(st.bounds, HOOD.cols || []);
    w.buildNav(st.cell || 0.4, 0.3);
    return w;
  },
};
