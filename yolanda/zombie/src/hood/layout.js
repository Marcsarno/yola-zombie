// Chapter 2 (Marc's neighbourhood): the layout object the hospital game's simulation reads (core/layout.js useLevel('hood')).
// The world itself comes from the Blender export (view.js / world.js); this holds where play happens.
// World axes as everywhere in the game: x east, z south (toward the camera), metres; the clubhouse is to the north (-z).
import { HoodWorld } from './world.js';

export const HOOD = { cols: null, marks: {} }; // filled by hood.js from assets/neighborhood/hood_layout.json before the sim starts

// The gauntlet's stops (the plan map, 2026-10-19). bounds: the navigation area while that stop is played (zombies route
// inside it); the whole map stays drawn and collidable.
export const STAGES = {
  free: { bounds: { minX: -66, maxX: 106, minZ: -126, maxZ: 92 }, cell: 0.6 }, // (?hood=free: walk the whole map, no story)
  home: { bounds: { minX: 18, maxX: 72, minZ: -8, maxZ: 70 } },
  // (the polish brief's replay: the other stops had no navigation of their own, so past the house the infected only came
  // at Marc when they could see him within 7 m; each stop now routes them over its own area: level.js navFor)
  help: { bounds: { minX: 18, maxX: 72, minZ: -8, maxZ: 70 } },
  gate: { bounds: { minX: -12, maxX: 42, minZ: -45, maxZ: 30 }, cell: 0.5 },
  club: { bounds: { minX: -12, maxX: 45, minZ: -72, maxZ: -8 }, cell: 0.5 },
  pete: { bounds: { minX: 5, maxX: 95, minZ: -100, maxZ: -30 }, cell: 0.5 },
  dock: { bounds: { minX: -35, maxX: 95, minZ: -100, maxZ: -50 }, cell: 0.5 },
  shed: { bounds: { minX: -62, maxX: 20, minZ: -126, maxZ: 12 }, cell: 0.65 },  // (with the playground: its horde runs at the engine, level.js stopShed)
  horde: { bounds: { minX: -62, maxX: 20, minZ: -126, maxZ: -40 }, cell: 0.5 },  // (the horde is brought to the dock gate: no playground)
  leave: { bounds: { minX: -62, maxX: 20, minZ: -126, maxZ: -40 }, cell: 0.5 },
  // (?hood=grammy: Chapter 4's peninsula, blender/grammy/: walk it, no story yet)
  grammy: { bounds: { minX: -132, maxX: 168, minZ: -248, maxZ: 78 }, cell: 0.8, cam: { minX: -150, maxX: 185, minZ: -262, maxZ: 92 } },
};

// Buildings you go inside: while the player is in `rect`, everything above clipY inside `cut` disappears (cutaway.js).
// From the old build (its world.interiors): the clubhouse, and the two damaged end units' open garages.
export const INTERIORS = [
  // Marc's house (blender/hood/ch2_home.py, the user's plan in its real shell): the roof and the upper floor go once he is inside
  // (cineClip: the height cut in the cinematic shots inside: the rooms keep their ceiling)
  { id: 'home', rect: { cx: 32.575, cz: 39.1, hx: 3.5, hz: 6.18, yaw: 0 }, cut: { cx: 32.62, cz: 39.2, hx: 3.85, hz: 6.75, yaw: 0 }, clipY: 2.45, cineClip: 2.95 },
  { id: 'club', rect: { cx: 9.575, cz: -53.96, hx: 11, hz: 7.5, yaw: 0 }, cut: { cx: 9.575, cz: -52.2, hx: 13.6, hz: 11.4, yaw: 0 }, clipY: 3.3 },
  // (rows 5 and 6 turned and shifted by the map clean-up: blender/hood/ch2_map.py)
  { id: 'B05#4', rect: { cx: 54.339, cz: -3.153, hx: 3.7, hz: 6.375, yaw: -0.6203 }, clipY: 2.45 },
  { id: 'B06#4', rect: { cx: -1.114, cz: -11.881, hx: 3.7, hz: 6.375, yaw: 0.7358 }, clipY: 2.45 },
  // the groundskeeper's shed up the bank from the dock (blender/hood/ch2_dock.py): its roof goes once Marc is in the doorway
  { id: 'shed', rect: { cx: -8.6, cz: -109.6, hx: 2.2, hz: 2.4, yaw: 0 }, cut: { cx: -8.6, cz: -110, hx: 2.9, hz: 2.3, yaw: 0 }, clipY: 2.15, cineClip: 9 },
];

// Floors above the ground that people stand on (the user: feet "slipped right through the floor" on the old boat and in the
// clubhouse): inside `rect` characters are drawn standing at y, easing up from the ground over the first `ramp` m of the
// local -x end (the dock's shore end). The clubhouse floor is at 0.05 (nothing to do); the damaged units sink in Blender.
export const FLOORS = [
  // Marc's house: its floor 0.2 m up, and the step outside the front door under the canopy (0.18 m, up from its east edge)
  { id: 'home', cx: 32.69, cz: 39.1, hx: 3.6, hz: 6.2, yaw: Math.PI, y: 0.2, ramp: 0.05 },
  { id: 'stoop', cx: 37.04, cz: 38.4, hx: 0.76, hz: 1.58, yaw: Math.PI, y: 0.18, ramp: 0.3 },
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
  camBounds: { minX: -70, maxX: 110, minZ: -122, maxZ: 96 }, // (minZ: the shed and the fence by the trees, ch2_dock.py)
  playerStart: { x: 38.2, z: 40.6, yaw: Math.PI / 2 }, // Marc's side door (B01-H's east wall), facing the yard
  walls: [], doors: [], props: [],
  buildWorld(World) {
    const st = STAGES[HOOD.stage || 'home'] || STAGES.home;
    const w = new HoodWorld(st.bounds, HOOD.cols || []);
    w.buildNav(st.cell || 0.4, 0.3);
    return w;
  },
};
