// CHAPTER 1 | FLOORS 7, 6 AND 5 — built from the user's Tiled v3 plans (Yola_Floors_7_6_5_Tiled_v3, source/*_Spatial_Data).
// Plain data shared by the simulation (colliders, nav, zombies, pickups, interactions) and the renderer (floors, walls,
// doors, props, signs). Room polygons and doorways are the plans' own pixel coordinates (25 px = 1 m), converted here.
// The three floors share one world, stacked apart along z (the renderer builds all three once; the simulation's world is
// the current floor only). Floor 7 keeps the opening's operating room exactly where the opening stages it.
// World axes: x east, z south (north = -z, the top of the screen). Prop rotations 0/90/180/270; a prop's front is +z.

const M = 'assets/models/';
const U = M + 'upgrades/';
const H = 'zombie/assets/hospital/';
const K = 'zombie/assets/kit/';
const SI = 'zombie/assets/props/'; // (the stand-in construction props, blender/make_standin_props.py)
const T = 0.3; // wall thickness (walls are given by their centre lines)
const WH = 2.7; // wall height
export const FLOOR_Z = { 7: 0, 6: -80, 5: -160 }; // each floor's z offset in the shared world
export const OR_TABLE = { x: -3.4, z: -8.75 }; // Floor 7's operating table (its head north, against the back wall): the opening stages around it
const r2 = (v) => Math.round(v * 20) / 20; // plans are drawn to 25 px = 1 m; positions to the nearest 5 cm
const X = (px) => r2((px - 1141) / 25); // the plans' px -> world x (the OR's centre line is x = 0)
const Zf = (oz) => (py) => r2((py - 260) / 25 - 11.15 + oz); // px -> world z on a floor (the OR's north wall is z = -11.15)

// ---------------------------------------------------------------------------------------------- the lift (one kit per floor)
// The elevator kit: its root at the threshold, its front looking south into the arrival room; the cab extends north.
// All three shafts align at the plans' (2,0): the top/back wall of the arrival room, x = 2.92.
function liftAt(floor) {
  const oz = FLOOR_Z[floor], x = X(1214), z = -11.2 + oz;
  return {
    floor, x, z, yaw: 0, wallZ: -11.15 + oz,
    cab: { minX: x - 1.46, maxX: x + 1.46, minZ: z - 3.25, maxZ: z - 0.3 }, // finished cab floor (world)
    threshold: { minX: x - 1.2, maxX: x + 1.2, minZ: z - 0.35, maxZ: z + 0.65 },
    call: { x: x + 1.3, z: z + 0.45 }, // the call panel beside the doors
    status: { x: x + 2.95, y: 1.62, z: -11.15 + oz }, // the FAULT / READY light on the wall by the call panel
    rect: { minX: x - 2.7, maxX: x + 2.7, minZ: z - 3.5, maxZ: z + 0.4 }, // the kit's cut-away rectangle
    inside: { x, z: z - 1.8 }, // where Yola stands in the cab (facing the doors)
  };
}
export const LIFTS = { 7: liftAt(7), 6: liftAt(6), 5: liftAt(5) };
// the lift kit's colliders: pocket housings either side of the aperture, the cab walls, the closed leaves (dynamic)
// (f: metres toward the front / the arrival room, s: across; mapped for a south-facing kit)
export function liftBoxes(L) {
  const box = (f0, f1, s0, s1) => [L.x + s0, L.x + s1, L.z + f0, L.z + f1]; // f along +z (toward the arrival room)
  return {
    walls: [box(-0.3, 0.21, -2.64, -1.2), box(-0.3, 0.21, 1.2, 2.64), box(-3.46, -0.3, -1.66, -1.5), box(-3.46, -0.3, 1.5, 1.66), box(-3.46, -3.3, -1.66, 1.66)],
    doors: box(-0.14, 0.1, -1.2, 1.2),
  };
}

// ---------------------------------------------------------------------------------------------- floor builder
// rooms: [id, name, polygon px, floor colours, outbreak recipe]; doors: openings from the plan (coordinate, from, to, v/h)
function buildFloor(n, def) {
  const oz = FLOOR_Z[n], Z = Zf(oz);
  const rooms = [], walls = [], doors = [], props = [], signs = [], roomSigns = [];
  // room polygons (axis-aligned) -> rects for the floor tiles; edges -> walls
  const edges = { h: new Map(), v: new Map() }; // coordinate -> [[a, b], ...]
  const addEdge = (o, c, a, b) => { const k = r2(c); if (!edges[o].has(k)) edges[o].set(k, []); edges[o].get(k).push([Math.min(a, b), Math.max(a, b)]); };
  for (const r of def.rooms) {
    const pts = r.poly.map(([px, py]) => [X(px), Z(py)]);
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      if (az === bz) addEdge('h', az, ax, bx); else addEdge('v', ax, az, bz);
    }
    // rects: slice the polygon into horizontal bands between its distinct z values
    const zs = [...new Set(pts.map((p) => p[1]))].sort((a, b) => a - b), rects = [];
    for (let i = 0; i < zs.length - 1; i++) {
      const zm = (zs[i] + zs[i + 1]) / 2, xs = [];
      for (let j = 0; j < pts.length; j++) { const [ax, az] = pts[j], [bx, bz] = pts[(j + 1) % pts.length]; if (ax === bx && Math.min(az, bz) < zm && Math.max(az, bz) > zm) xs.push(ax); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) rects.push([xs[k], xs[k + 1], zs[i], zs[i + 1]]);
    }
    rooms.push({ id: r.id, floorN: n, name: r.name, rects, floor: r.floor, ob: r.ob, area: r.area });
  }
  // doorways (gaps in the walls); kit doors fill exactly their kit width
  const gaps = { h: new Map(), v: new Map() };
  const addGap = (o, c, a, b) => { const k = r2(c); if (!gaps[o].has(k)) gaps[o].set(k, []); gaps[o].get(k).push([a, b]); };
  for (const d of def.doors) {
    const o = d.o, c = o === 'h' ? Z(d.c) : X(d.c), a = o === 'h' ? X(d.a) : Z(d.a), b = o === 'h' ? X(d.b) : Z(d.b);
    const mid = r2((a + b) / 2), width = d.kind && d.kind !== 'open' ? 3.0 : r2(b - a);
    const door = { id: d.id, floor: n, kind: d.kind || 'open', axis: o === 'h' ? 'x' : 'z', x: o === 'h' ? mid : c, z: o === 'h' ? c : mid, width, ...(d.face ? { face: d.face } : {}), ...(d.side ? { side: d.side } : {}) };
    doors.push(door);
    addGap(o, c, mid - width / 2, mid + width / 2);
  }
  const L = LIFTS[n];
  doors.push({ id: 'lift' + n, floor: n, kind: 'lift', axis: 'x', x: L.x, z: L.z, width: 5.28, face: 's' });
  addGap('h', L.wallZ, L.x - 2.64, L.x + 2.64);
  // walls: the union of every room edge on a line, minus the doorways on it
  for (const o of ['h', 'v']) for (const [c, list] of edges[o]) {
    list.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const [a, b] of list) { const m = merged[merged.length - 1]; if (m && a <= m[1] + 1e-6) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
    const gs = (gaps[o].get(c) || []).sort((p, q) => p[0] - q[0]);
    for (const [a0, b0] of merged) {
      let a = a0 - T / 2;
      const end = b0 + T / 2;
      for (const [g0, g1] of gs) { if (g1 <= a || g0 >= end) continue; if (g0 > a) push(o, c, a, g0); a = Math.max(a, g1); }
      if (end > a + 0.02) push(o, c, a, end);
    }
  }
  function push(o, c, a, b) { if (o === 'h') walls.push([a, b, c - T / 2, c + T / 2, WH, 'full']); else walls.push([c - T / 2, c + T / 2, a, b, WH, 'full']); }
  // props: p(m, x, z, rot, size [x, z] before rotation, h, extra) in world metres; wp() hangs a thing on a wall face
  const P = { p(m, x, z, rot, size, h, extra = {}) { const sw = rot % 180 === 90; props.push({ m, x, z: z, rot, fp: sw ? [size[1], size[0]] : [size[0], size[1]], h, floor: n, ...extra }); },
    wp(m, x, z, face, y, extra = {}) { props.push({ m, x, z, rot: { s: 0, n: 180, e: 90, w: 270 }[face], wall: face, y, fp: [0.1, 0.1], h: 0, noCollide: true, floor: n, ...extra }); },
    raw(o) { props.push({ floor: n, ...o }); },
    sign(text, sub, x, y, z, face, w, extra = {}) { signs.push({ text, sub, x, y, z, face, w, ...extra }); },
    room(id, x, y, z, face, w) { roomSigns.push({ id, x, y, z, face, w }); },
    X, Z };
  def.dress(P);
  const xs = rooms.flatMap((r) => r.rects.flatMap((q) => [q[0], q[1]])), zs = rooms.flatMap((r) => r.rects.flatMap((q) => [q[2], q[3]]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs, L.cab.minZ), maxZ = Math.max(...zs);
  return {
    name: 'chapter', floor: n, oz, rooms, walls, doors, props, signs, roomSigns, lift: L,
    bounds: { minX: minX - 0.6, maxX: maxX + 0.6, minZ: minZ - 0.6, maxZ: maxZ + 0.6 },
    camBounds: { minX: minX + 1.2, maxX: maxX - 1.0, minZ: minZ + 1.6, maxZ: maxZ - 0.6 },
    groups: def.groups(Z), pickups: def.pickups(Z), interact: def.interact(Z), lights: def.lights(Z), blood: def.blood?.(Z) || [],
    playerStart: def.start(Z), cutaway: true,
  };
}

// ================================================================================================ FLOOR 7: reopen the way down
// The opening's operating room (O7) at the top right, its lift on the back wall. Left, down, right, up to restore the lift's
// local power in lift service (P7); back north through the calm prep room (R7), whose north door unbars into the OR.
const F7 = buildFloor(7, {
  rooms: [
    { id: 'or', name: 'Operating Room', poly: [[963, 260], [1319, 260], [1319, 516], [1243, 516], [1243, 565], [963, 565]], floor: ['#e4d8bf', '#b9d3c8'], ob: ['clinical', 'clinical'] },
    { id: 's7', name: 'Supply', poly: [[500, 260], [963, 260], [963, 565], [500, 565]], floor: ['#d9d6cc', '#c2c9c6'], ob: ['corridor', 'maintenance'] },
    { id: 'n7', name: 'Nurse Station', poly: [[120, 260], [500, 260], [500, 590], [120, 590]], floor: ['#efe2c8', '#d9c9a8'], ob: ['corridor', 'clinical'] },
    { id: 't7', name: 'Treatment Ward', poly: [[120, 590], [500, 590], [500, 930], [120, 930]], floor: ['#e2e8ea', '#bfd2da'], ob: ['corridor', 'clinical'] },
    { id: 'v7', name: 'Renovation', poly: [[120, 930], [570, 930], [570, 1240], [120, 1240]], floor: ['#c9c4b8', '#b3ad9f'], ob: ['maintenance', 'maintenance'] },
    { id: 'c7', name: 'Staff Cafeteria', poly: [[570, 930], [963, 930], [963, 1240], [570, 1240]], floor: ['#f0dccb', '#d8a98c'], ob: ['corridor', 'maintenance'] },
    { id: 'p7', name: 'Lift Service', poly: [[963, 930], [1319, 930], [1319, 1240], [963, 1240]], floor: ['#b9b8b0', '#a3a39a'], ob: ['maintenance', 'maintenance'] },
    { id: 'x7', name: 'Contractor Store', poly: [[570, 650], [963, 650], [963, 930], [570, 930]], floor: ['#c4c2b6', '#aeab9d'], ob: ['maintenance', 'maintenance'] },
    { id: 'r7', name: 'Prep Room', poly: [[963, 565], [1243, 565], [1243, 516], [1319, 516], [1319, 930], [963, 930]], floor: ['#e6eef2', '#c4d6e2'], ob: ['clinical', 'clinical'] },
  ],
  doors: [
    { id: 'or_s7', o: 'v', c: 963, a: 385, b: 490 },
    { id: 's7_n7', o: 'v', c: 500, a: 395, b: 475 },
    { id: 'n7_t7', o: 'h', c: 590, a: 310, b: 400 },
    { id: 't7_v7', o: 'h', c: 930, a: 310, b: 400 },
    { id: 'v7_c7', o: 'v', c: 570, a: 1015, b: 1100 },
    { id: 'c7_p7', o: 'v', c: 963, a: 1015, b: 1100 },
    { id: 'p7_r7', o: 'h', c: 930, a: 1190, b: 1275 },
    { id: 'x7door', o: 'h', c: 930, a: 720, b: 810, kind: 'powered', face: 's' }, // the contractor store: opens when P7's power returns
    { id: 'orbar', o: 'h', c: 565, a: 1065, b: 1150, kind: 'barred', face: 's', side: 's' }, // OR south / R7 north: barred, released from R7 only
  ],
  dress({ p, wp, raw, sign, room, X, Z }) {
    // O7 | the operating room (2026-10-16 feedback): one table in a curtained surgical bay on the west side, well clear of
    //      the lift; its head against the back wall under a bay headwall (the treatment room's look), the anesthesia
    //      station at the head, the monitor and IV beside it; screens on the lift side close the bay off, the camera
    //      side stays open. OR_TABLE in chapter.js is the staging's reference.
    p(U + '04_surgery/operating_table_standard.glb', OR_TABLE.x, OR_TABLE.z, 0, [0.78, 1.65], 0.94, { name: 'orTable' });
    wp(U + '05_recovery_bay/RecoveryHeadwall_standard.glb', OR_TABLE.x, -11.0, 's', 0, { name: 'orHeadwall' });
    p(U + '04_surgery/surgical_light_standard.glb', OR_TABLE.x + 0.15, OR_TABLE.z + 0.55, 0, [0.91, 0.85], 1.16, { y: 1.72, noCollide: true, name: 'orLight' }); // over the knee: swung clear for the crisis
    p(U + '02_anesthesia_monitoring/anesthesia_workstation_standard.glb', OR_TABLE.x - 1.7, OR_TABLE.z - 0.95, 90, [1.1, 0.7], 1.55, { name: 'orAnesthesia' });
    p(U + '02_anesthesia_monitoring/patient_monitor_standard.glb', OR_TABLE.x + 1.45, OR_TABLE.z - 1.5, 0, [0.62, 0.71], 1.46, { name: 'orMonitor' });
    p(U + '08_support_equipment/runtime/iv_stand_standard.glb', OR_TABLE.x + 1.0, OR_TABLE.z - 0.55, 0, [0.73, 0.7], 2.03, { noCollide: true });
    p(U + '08_support_equipment/runtime/supply_cart_standard.glb', -6.5, -7.4, 90, [0.88, 0.65], 1.21);
    p(H + 'supply_cart.glb', -6.3, -5.3, 90, [1.16, 1.1], 1.23);
    p(H + 'biohazard_bin.glb', -6.6, -10.65, 0, [0.39, 0.39], 0.69);
    p(H + 'lidded_waste_bin.glb', -6.1, -10.7, 0, [0.36, 0.4], 0.58);
    p(U + '05_recovery_bay/PrivacyCurtain_standard.glb', -0.85, -9.75, 90, [0.14, 1.84], 1.97, { name: 'orCurtain' }); // the bay's screens on the lift side
    p(U + '05_recovery_bay/PrivacyCurtain_standard.glb', -0.85, -7.85, 90, [0.14, 1.84], 1.97);
    wp(M + 'furnishings/Endoscopy_Glove_Dispenser.glb', -5.6, -11.0, 's', 1.05);
    wp(M + 'decor/Reception_Wall_Sanitizer.glb', -1.45, -11.0, 's', 1.1);
    wp(M + 'decor3/Clinical_Sharps_Container.glb', -1.0, -11.0, 's', 1.1);
    wp(M + 'decor/Recovery_Wall_Clock.glb', -0.4, -11.0, 's', 2.0);
    wp(M + 'decor3/Clinical_Sign_OR.glb', -5.6, -11.0, 's', 2.15);
    p(M + 'furnishings/Clinical_Storage_Cabinet.glb', -6.75, -1.4, 90, [1.4, 0.62], 0.88);
    wp(M + 'furnishings/Clinical_Wall_Cupboard.glb', -7.0, -1.4, 'e', 1.45);
    p(H + 'procedure_stretcher.glb', 5.4, -4.6, 0, [0.9, 1.66], 1.22);
    p(H + 'lidded_waste_bin.glb', 6.6, -1.4, 0, [0.36, 0.4], 0.58);
    wp(M + 'decor3/Clinical_Sharps_Container.glb', -7.0, -6.9, 'e', 1.1);
    wp(M + 'furnishings/Endoscopy_Glove_Dispenser.glb', -7.0, -7.6, 'e', 1.0);
    // S7 | supply: shelving along the back wall, carts, a first-aid case on a cart; the western exit is obvious
    // (2026-10-18, the user's part 4: the Outbreak versions of the supplied props in every playable room except the opening's
    // operating room, which stays clean; assets/hospital/<name>.glb from the Outbreak runtime set, assets/source/hospital_123)
    p(H + 'supply_shelf.glb', -20.6, -10.6, 0, [1.39, 0.56], 2.0);
    p(H + 'supply_shelf.glb', -18.9, -10.6, 0, [1.39, 0.56], 2.0);
    p(K + 'pharmacy_medicine_shelf.glb', -12.2, -10.6, 0, [1.39, 0.53], 1.95);
    p(H + 'supply_shelf.glb', -10.2, -10.6, 0, [1.39, 0.56], 2.0);
    p(H + 'linen_cabinet.glb', -25.0, -9.6, 90, [0.95, 0.65], 1.84);
    p(U + '08_support_equipment/runtime/supply_cart_starter.glb', -15.6, -1.0, 0, [0.78, 0.52], 1.01, { name: 's7cart' });
    p(H + 'laundry_hamper.glb', -8.0, 0.4, 0, [0.6, 0.57], 1.15);
    p(H + 'wheelchair.glb', -21.6, 0.1, 270, [0.76, 0.91], 0.97);
    p(H + 'wet_floor_sign.glb', -17.4, -4.6, 0, [0.48, 0.66], 0.64, { noCollide: true });
    // a back-to-back shelving island mid-room (a loop to move around) and the carts of a store room
    p(H + 'supply_shelf.glb', -14.2, -6.9, 90, [1.39, 0.56], 2.0);
    p(H + 'supply_shelf.glb', -13.65, -6.9, 270, [1.39, 0.56], 2.0);
    p(H + 'supply_cart.glb', -10.4, -3.6, 0, [1.16, 1.1], 1.23);
    p(H + 'supply_cart.glb', -22.8, -4.8, 90, [1.16, 1.1], 1.23);
    p(H + 'laundry_hamper.glb', -24.9, 0.3, 0, [0.6, 0.57], 1.15);
    p(H + 'lidded_waste_bin.glb', -19.6, 0.55, 0, [0.36, 0.4], 0.58);
    wp(H + 'wall_cupboard.glb', -16.2, -11.0, 's', 1.45);
    // a store room's floor: tubs of stock pulled off the shelves, a biohazard bin by the door
    p(H + 'storage_bins.glb', -23.6, -8.9, 15, [1.05, 0.3], 0.28, { noCollide: true });
    p(H + 'storage_bins.glb', -11.4, -8.6, -10, [1.05, 0.3], 0.28, { noCollide: true });
    p(H + 'biohazard_bin.glb', -8.0, -2.2, 0, [0.39, 0.39], 0.69);
    // N7 | the nurse station: the desk on the back wall with the radio on it, the team desk, a few waiting chairs
    p(U + '01_reception/reception_T2_desk.glb', -37.2, -9.9, 180, [2.2, 0.9], 1.1, { name: 'n7desk' });
    p(U + '01_reception/reception_T2_chair.glb', -37.2, -10.75, 0, [0.63, 0.62], 0.99, { noCollide: true });
    raw({ kind: 'radio', x: -36.6, z: -9.75, y: 1.1, fp: [0.1, 0.1], h: 0, noCollide: true, name: 'radio' });
    p(M + 'decor/Reception_Linked_Seats_3.glb', -30.4, -10.65, 0, [2.61, 0.62], 0.92);
    p(H + 'water_cooler.glb', -26.4, -10.7, 0, [0.44, 0.49], 1.47);
    p(H + 'linen_cabinet.glb', -40.2, -0.4, 90, [0.95, 0.65], 1.84);
    p(H + 'patient_monitor.glb', -40.2, -2.6, 90, [0.62, 0.71], 1.49);
    p(H + 'floor_planter.glb', -28.0, -10.65, 0, [1.12, 0.5], 1.52);
    wp(H + 'reception_poster_clinician.glb', -33.6, -11.0, 's', 1.15);
    // the station's working island: a team desk with chairs, a monitor cart, the board on the west wall
    p(H + 'team_desk.glb', -33.0, -4.6, 0, [1.13, 0.74], 1.16);
    p(H + 'clinician_chair.glb', -33.0, -5.4, 180, [0.65, 0.61], 0.99, { noCollide: true });
    p(H + 'team_desk.glb', -31.6, -4.6, 0, [1.13, 0.74], 1.16);
    p(H + 'patient_monitor.glb', -29.2, -6.2, 0, [0.62, 0.71], 1.49);
    p(M + 'decor/Reception_Linked_Seats_3.glb', -36.6, 1.45, 180, [2.61, 0.62], 0.92);
    wp(H + 'assessment_status_board.glb', -40.7, -5.6, 'e', 1.0);
    // a station that was working when it fell: hand gel and gloves by the door, a notice board of the outbreak's posters
    wp(H + 'wall_sanitizer.glb', -26.0, -11.0, 's', 1.05);
    wp(H + 'glove_dispenser.glb', -35.4, -11.0, 's', 1.2);
    wp(H + 'medical_poster_family.glb', -38.6, -11.0, 's', 1.6);
    p(H + 'biohazard_bin.glb', -40.3, -8.9, 0, [0.39, 0.39], 0.69);
    // T7 | the treatment ward: two rows of beds with screens and IV stands, two clear lanes north-south (flanking, lane changes)
    for (const [bx, bz, rot] of [[-39.2, 5.0, 90], [-39.2, 9.0, 90], [-39.2, 13.0, 90], [-27.3, 6.2, 270], [-27.3, 10.6, 270]]) {
      p(H + 'recovery_bed.glb', bx, bz, rot, [1.25, 2.11], 0.87);
      p(H + 'bedside_cabinet.glb', bx + (rot === 90 ? -0.55 : 0.55), bz - 1.35, rot, [0.52, 0.63], 0.81);
      p(H + 'iv_stand.glb', bx + (rot === 90 ? 1.0 : -1.0), bz - 1.1, 0, [0.73, 0.7], 2.03, { noCollide: true });
      // each bed's service headwall (oxygen, suction, the call light) on the wall at its head: a ward, not a store room
      wp(H + 'service_headwall.glb', rot === 90 ? -40.75 : -25.75, bz, rot === 90 ? 'e' : 'w', 1.24);
    }
    // the ward's north wall (the one the camera sees): an exam set, hand gel and gloves by the door, a sharps bin
    wp(H + 'wall_exam_set.glb', -36.2, 2.15, 's', 0.9);
    wp(H + 'wall_sanitizer.glb', -29.4, 2.15, 's', 1.05);
    wp(H + 'glove_dispenser.glb', -28.6, 2.15, 's', 1.2);
    wp(H + 'sharps_container.glb', -34.6, 2.15, 's', 1.09);
    p(H + 'biohazard_bin.glb', -26.2, 3.0, 0, [0.39, 0.39], 0.69);
    p(H + 'privacy_screen.glb', -38.1, 7.0, 90, [0.14, 1.84], 1.97);
    p(H + 'privacy_screen.glb', -38.1, 11.0, 90, [0.14, 1.84], 1.97);
    p(H + 'procedure_stretcher.glb', -33.4, 8.4, 0, [0.9, 1.66], 1.22);
    p(H + 'supply_cart.glb', -26.3, 14.4, 0, [1.16, 1.1], 1.23);
    // V7 | the renovation area (lower left): a quiet turn, a bench of tools, stacked partitions, a reward on the bench
    // (2026-10-18) STAND-INS for the user's painted construction props, which are missing from this machine (assets/props/standin_*,
    // blender/make_standin_props.py): swap in the user's own files when they turn up (same spots, same footprints)
    p(SI + 'standin_cable_workbench.glb', -38.0, 17.0, 0, [1.8, 0.76], 0.92, { name: 'v7bench' });
    p(SI + 'standin_tool_pegboard.glb', -34.4, 15.89, 180, [1.26, 0.06], 0.94, { y: 1.0, noCollide: true });
    raw({ kind: 'hazard', x: -31.5, z: 24.0, size: [3.4, 1.4], noCollide: true, fp: [0.1, 0.1], h: 0 });
    raw({ kind: 'pipes', x: -32.0, z: 15.8, len: 9.0, y: 2.25, noCollide: true, fp: [0.1, 0.1], h: 0 });
    p(K + 'isolation_windowed_partition.glb', -36.0, 23.2, 90, [2.0, 0.15], 2.4);
    p(K + 'isolation_windowed_partition.glb', -36.0, 25.4, 90, [2.0, 0.15], 2.4);
    p(H + 'supply_shelf.glb', -40.25, 20.4, 90, [1.39, 0.56], 2.0);
    p(H + 'janitor_cart.glb', -26.2, 26.8, 0, [0.83, 0.99], 1.23);
    p(H + 'mop_bucket.glb', -27.3, 27.3, 0, [0.46, 0.51], 0.65);
    p(H + 'wet_floor_sign.glb', -30.2, 18.9, 0, [0.48, 0.66], 0.64, { noCollide: true });
    p(H + 'wet_floor_sign.glb', -28.9, 18.6, 0, [0.48, 0.66], 0.64, { noCollide: true });
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -40.3, 26.6, 90, [0.82, 0.51], 1.82);
    wp(H + 'toolboard.glb', -38.0, 15.8, 's', 1.0);
    // stacked renovation stock: boxed materials on pallets, a second bench, a laundry hamper of dust sheets
    p(SI + 'standin_renovation_pallet.glb', -27.2, 16.75, 0, [1.25, 1.02], 0.61);
    raw({ kind: 'box', x: -25.4, z: 16.7, size: [1.2, 0.9, 0.8], face: 's', color: 0x9c8a6a, fp: [1.2, 0.9], h: 0.8 });
    p(SI + 'standin_paint_shelf.glb', -33.6, 27.7, 180, [1.19, 0.44], 1.81);
    p(H + 'laundry_hamper.glb', -40.2, 23.6, 0, [0.6, 0.57], 1.15);
    // (2026-10-18) the works themselves, modelled in Blender (blender/make_construction_props.py; new pieces, not the user's
    // painted construction props, which are missing): a sawhorse barrier cordoning the open floor by the east wall, plasterboard
    // on a pallet with cement sacks and a paint pail by the west wall
    p('zombie/assets/props/sawhorse_barrier.glb', -26.4, 23.4, 90, [1.9, 0.73], 1.04);
    p('zombie/assets/props/drywall_pallet.glb', -39.6, 18.9, 90, [1.41, 1.69], 0.45);
    // C7 | the staff cafeteria: counters either side of the store door on the back wall, tables to circle around
    p(K + 'cafeteria_serving_counter.glb', -20.3, 16.25, 0, [2.46, 0.96], 1.53);
    p(K + 'cafeteria_tray_return.glb', -18.3, 16.1, 0, [0.68, 0.56], 1.0);
    p(K + 'cafeteria_vending_machine.glb', -11.2, 16.25, 0, [0.93, 0.87], 1.9);
    p(K + 'cafeteria_vending_machine.glb', -10.1, 16.25, 0, [0.93, 0.87], 1.9);
    // the staff side of it: a coffee counter with its machine in the corner by the lift-service door, the staff lockers on
    // the east wall, a water cooler and a pedal bin by the renovation door
    p(H + 'coffee_counter.glb', -8.6, 16.35, 0, [1.33, 0.81], 1.0);
    raw({ m: H + 'coffee_machine.glb', x: -8.95, z: 16.2, rot: 0, y: 1.0, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: H + 'mug.glb', x: -8.2, z: 16.45, rot: 40, y: 1.0, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(H + 'locker_bank.glb', -7.75, 25.6, 270, [1.48, 0.66], 1.95);
    p(H + 'water_cooler.glb', -22.4, 17.4, 90, [0.44, 0.49], 1.47);
    for (const [tx, tz] of [[-19.6, 20.6], [-15.0, 22.4], [-10.6, 20.6], [-19.0, 25.8], [-11.2, 25.8]]) {
      p(H + 'break_table.glb', tx, tz, 0, [0.95, 0.86], 0.85);
      p(H + 'break_chair.glb', tx - 0.85, tz, 90, [0.72, 0.62], 0.92, { noCollide: true });
      p(H + 'break_chair.glb', tx + 0.85, tz, 270, [0.72, 0.62], 0.92, { noCollide: true });
      raw({ m: K + 'cafeteria_meal_tray_set.glb', x: tx, z: tz, rot: 0, y: 0.85, fp: [0.1, 0.1], h: 0, noCollide: true });
    }
    // P7 | lift service: the lift-reset panel on the back wall (visible from the camera), switchgear and racks on the walls
    raw({ kind: 'box', x: -5.2, z: 16.3, size: [1.4, 0.7, 1.9], face: 's', color: 0x8f989b, fp: [1.4, 0.7], h: 1.9, name: 'switchgear' });
    raw({ kind: 'box', x: 6.55, z: 21.5, size: [1.6, 0.6, 2.1], face: 'w', color: 0x7d878a, fp: [0.6, 1.6], h: 2.1, name: 'panelboard' });
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -6.55, 26.6, 90, [0.82, 0.51], 1.82);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', 6.55, 26.4, 270, [0.82, 0.51], 1.82);
    raw({ kind: 'hazard', x: -1.0, z: 16.9, size: [1.8, 0.9], noCollide: true, fp: [0.1, 0.1], h: 0 });
    raw({ kind: 'box', x: -6.55, z: 20.6, size: [1.5, 0.6, 2.0], face: 'e', color: 0x8a9497, fp: [0.6, 1.5], h: 2.0 });
    p(SI + 'standin_janitor_cabinet.glb', -6.6, 23.2, 90, [0.9, 0.5], 1.9); // (stand-in: the user's painted janitor cabinet is missing)
    p(H + 'janitor_cart.glb', 4.6, 27.2, 0, [0.83, 0.99], 1.23);
    p(H + 'utility_sink.glb', 6.55, 17.2, 270, [0.88, 0.51], 1.64);
    wp(H + 'toolboard.glb', -3.6, 15.8, 's', 1.0);
    // a maintenance bay: the floor scrubber parked by the racks, a mop bucket left out
    p(H + 'floor_scrubber.glb', 2.6, 26.9, 90, [0.86, 1.52], 1.17);
    p(H + 'mop_bucket.glb', 5.6, 18.6, 30, [0.46, 0.51], 0.65);
    // R7 | the prep room under the OR: scrub sinks and linen along the walls, a clear walk from P7 to the barred door
    p(U + '10_janitor_utility/starter/10_starter_steel_sink.glb', -5.4, 1.55, 0, [0.87, 0.63], 1.16);
    p(U + '10_janitor_utility/starter/10_starter_steel_sink.glb', -4.3, 1.55, 0, [0.87, 0.63], 1.16);
    p(H + 'linen_cabinet.glb', -6.55, 8.0, 90, [0.95, 0.65], 1.84);
    p(H + 'supply_cart.glb', 6.5, 6.2, 270, [1.16, 1.1], 1.23);
    p(H + 'procedure_stretcher.glb', -5.6, 12.6, 90, [0.9, 1.66], 1.22);
    wp(H + 'clinical_sign_preop.glb', 4.6, 1.2, 's', 2.23);
    p(H + 'sedaprep.glb', 6.3, 10.6, 270, [1.12, 0.72], 0.98);
    p(H + 'supply_cart.glb', -6.3, 4.4, 90, [1.16, 1.1], 1.23);
    p(H + 'iv_stand.glb', -4.6, 11.8, 0, [0.73, 0.7], 2.03, { noCollide: true });
    wp(H + 'handwash_basin.glb', -2.9, 1.2, 's', 0.85);
    wp(H + 'wall_sanitizer.glb', 0.6, 1.2, 's', 1.05);
    // X7 | the contractor store: shelving on both side walls, the bench with the reward on it (seen through the door)
    p(H + 'supply_shelf.glb', -22.25, 7.4, 90, [1.39, 0.56], 2.0);
    p(H + 'supply_shelf.glb', -22.25, 10.4, 90, [1.39, 0.56], 2.0);
    p(H + 'supply_shelf.glb', -7.75, 7.4, 270, [1.39, 0.56], 2.0);
    p(H + 'supply_shelf.glb', -7.75, 10.4, 270, [1.39, 0.56], 2.0);
    p(H + 'storage_bins.glb', -9.2, 13.8, 0, [1.05, 0.3], 0.28, { noCollide: true });
    raw({ kind: 'bench', x: -15.0, z: 9.4, size: [2.0, 0.75, 0.92], color: 0x8c7a5c, fp: [2.0, 0.75], h: 0.92, name: 'x7bench' });
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -12.4, 5.0, 0, [0.82, 0.51], 1.82);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -17.8, 5.0, 0, [0.82, 0.51], 1.82);
    raw({ kind: 'box', x: -19.6, z: 12.4, size: [1.2, 0.8, 0.9], face: 's', color: 0xa38f6c, fp: [1.2, 0.8], h: 0.9 });
    p('zombie/assets/props/sawhorse_barrier.glb', -19.0, 6.6, 0, [1.9, 0.73], 1.04); // (the store's stock of the works)
    // wayfinding: printed signs on the back/left walls the camera sees
    sign('LIFT SERVICE →', 'Lift power · past the cafeteria', -25.8, 1.95, -1.4, 'w', 1.5);
    sign('LIFT', 'Power fault', X(1214) + 3.65, 2.3, -11.0, 's', 0.8, { lift: 7 });
    sign('BARRED', 'From the prep room side', 1.0, 1.75, 0.9, 'n', 0.86, { id: 'orbarSign' });
    sign('↓ TREATMENT · RENOVATION', 'Lift service →', -31.4, 2.3, -11.0, 's', 1.8);
    sign('LIFT SERVICE →', 'via Staff Cafeteria', -30.2, 2.25, 15.8, 's', 1.4);
    sign('CONTRACTOR STORE', 'Powered door · lift circuit', -17.4, 2.1, 15.8, 's', 1.3);
    sign('LIFT RESET', 'Local power', -1.0, 2.2, 15.8, 's', 0.9);
    sign('OR · LIFT ↑', 'Through the prep room', 6.3, 2.0, 15.8, 's', 1.1);
    room('operating_room', -7.0, 2.48, -4.05, 'e', 1.3);
    room('reception', -33.6, 2.35, -11.0, 's', 1.6);
    room('cafeteria', -14.6, 2.3, 15.8, 's', 1.6);
    room('maintenance', 5.6, 2.3, 15.8, 's', 1.4);
    room('elevator', X(1214) - 3.3, 2.75, -11.0, 's', 1.1);
  },
  groups: (Z) => [
    // the OR after the reveal: the patient at the table and three of the team, waking one at a time (the opening fight)
    { id: 'or', zombies: [{ x: OR_TABLE.x + 0.75, z: OR_TABLE.z - 1.0, yaw: 0.75, wake: 1.8, look: 'patient' }, { x: OR_TABLE.x - 0.85, z: OR_TABLE.z + 0.6, yaw: 1.2, wake: 3.4, look: 'nurse' }, { x: -1.4, z: -5.6, yaw: 0.9, wake: 5.5 }, { x: 5.9, z: -2.9, yaw: -2.4, wake: 8.0 }] },
    // (2026-10-18, the user's part 3: "more enemies ... treat each room as a small combat arena with its own flavor ... avoid
    // repeating the same crowd in every room". Floor spawns (from: 'floor') break up out of the floor a delay after their
    // group wakes (core/level.js floorStep: never right under Yola), the hole stays.)
    // supply: one straggler, then the first one through the floor, while she picks up the pistol (its first targets)
    { id: 's7', sense: 5.0, zombies: [{ x: -21.4, z: -6.2, yaw: 1.6, look: 'patient' }, { x: -20.0, z: -2.6, look: 'nurse', from: 'floor', delay: 2.4 }] },
    // nurse station: a crowd of walkers spread through the room (the ring that waits its turn and pounces), the shotgun on
    // the team desk in the middle of them
    { id: 'n7', sense: 6.0, zombies: [{ x: -38.6, z: -3.2, yaw: 1.2, look: 'nurse' }, { x: -31.0, z: 0.6, yaw: -2.6 }, { x: -35.6, z: -7.4, yaw: 0.6, look: 'patient' }, { x: -28.4, z: -2.2, yaw: -1.4 }, { x: -39.2, z: 0.6, yaw: 2.2, look: 'nurse' }] },
    // treatment ward: the crawlers' ward: two already down between the beds (crawl), one walker in each lane, and the floor
    // of the middle lane gives way behind her once it starts
    { id: 't7', sense: 6.5, zombies: [{ x: -36.2, z: 6.8, yaw: 0.4, look: 'patient' }, { x: -30.2, z: 8.6, yaw: -0.8 }, { x: -33.0, z: 12.6, yaw: 2.6, look: 'nurse' }, { x: -28.6, z: 13.8, yaw: -2.2 },
      { x: -36.8, z: 10.4, yaw: 0.3, look: 'patient', crawl: true }, { x: -29.6, z: 4.0, yaw: -2.8, crawl: true }, { x: -33.6, z: 4.6, look: 'nurse', from: 'floor', delay: 3.5 }] },
    // renovation: the runners' room: wide and open, two orange runners and a walker, and the half-built floor breaks under two more
    { id: 'v7', sense: 7.0, zombies: [{ x: -33.2, z: 26.2, yaw: 0.2 }, { x: -25.0, z: 21.4, yaw: -1.6, kind: 'runner' }, { x: -38.2, z: 25.6, yaw: 1.0, kind: 'runner' },
      { x: -29.4, z: 20.6, look: 'patient', from: 'floor', delay: 2.0 }, { x: -34.6, z: 19.6, kind: 'runner', from: 'floor', delay: 5.5 }] },
    // cafeteria: the shield carrier's introduction, with two walkers to read his front against (tables to circle him round)
    { id: 'c7', sense: 7.0, zombies: [{ x: -15.0, z: 24.6, yaw: Math.PI, kind: 'guard' }, { x: -19.6, z: 23.4, yaw: 1.0 }, { x: -10.4, z: 23.2, yaw: -1.0, look: 'nurse' }] },
    // lift service: the big lady across the open bay from the cafeteria door (her lane runs at the door; switchgear and racks
    // along the walls to trip her into), one walker by the switchgear
    { id: 'p7', sense: 9.0, zombies: [{ x: 4.6, z: 21.0, yaw: -Math.PI / 2, kind: 'sprinter' }, { x: -4.4, z: 24.6, yaw: 0.6, look: 'patient' }] },
    // the contractor store (behind its powered door): two lurking by the shelves, roused when the door opens on them
    { id: 'x7', sense: 4.0, locked: true, zombies: [{ x: -20.2, z: 9.0, yaw: 0.8, look: 'nurse' }, { x: -10.0, z: 11.6, yaw: -2.2 }] },
    // the prep room, the way back to the OR: once the lift has power, the floor's last push: a runner, two walkers, one
    // through the floor
    { id: 'r7', sense: 6.0, locked: true, zombies: [{ x: 4.6, z: 12.6, yaw: -2.6, kind: 'runner' }, { x: -3.0, z: 8.2, yaw: 2.6, look: 'nurse' }, { x: 3.4, z: 4.0, yaw: -1.2 }, { x: 0.4, z: 10.4, look: 'patient', from: 'floor', delay: 3.0 }] },
  ],
  // (2026-10-18, the user: "on Floor 7, place every available usable weapon around the level for testing. Leave out the
  // chainsaw ... include suitable ammunition ... keep the early pistol pickup". A test arrangement, not the final
  // progression: the bat in her hands, the pistol in Supply as before, the shotgun on the nurse station's desk, the crowbar
  // by the ward's stretcher, the sledgehammer in the renovation, the knife on a cafeteria table, the axe in the contractor
  // store as before; magazines and shells where those guns get used. file / builder + len: a weapon lying where it is
  // (render/arena.js loadPickups))
  pickups: () => [
    { id: 's7aid', kind: 'health', amount: 40, x: -15.6, z: -1.0, r: 1.0, label: 'First-aid case', model: 'aid', y: 1.01 },
    { id: 's7pistol', kind: 'weapon', weapon: 'pistol', x: -15.56, z: -1.0, r: 1.0, mag: 12, label: 'Pistol', model: 'pistol', y: 1.21 }, // (the user, 2026-10-17: a pistol with the first med pack, lying on the case's lid; the guard's on Floor 6 then refills it)
    { id: 's7mags', kind: 'ammo', weapon: 'pistol', rounds: 24, x: -12.8, z: -0.4, r: 1.0, label: 'Pistol magazines', model: 'mag' },
    { id: 'n7shotgun', kind: 'weapon', weapon: 'shotgun', x: -32.3, z: -4.6, r: 1.1, mag: 6, label: 'Pump shotgun', file: 'zombie/assets/weapons/pump_short.glb', len: 0.9, rot: 0.3, y: 1.15 },
    { id: 'n7shells', kind: 'ammo', weapon: 'shotgun', rounds: 12, x: -27.2, z: -9.6, r: 1.0, label: 'Shotgun shells', model: 'shells' },
    { id: 't7crowbar', kind: 'weapon', weapon: 'crowbar', x: -32.2, z: 10.2, r: 1.1, label: 'Crowbar', file: 'zombie/assets/weapons/hospital/crowbar.glb', len: 0.8, rot: 1.1 },
    { id: 'v7ammo', kind: 'health', amount: 50, x: -37.4, z: 17.0, r: 1.1, label: 'First-aid case', model: 'aid', y: 0.92 },
    { id: 'v7sledge', kind: 'weapon', weapon: 'sledgehammer', x: -30.6, z: 22.6, r: 1.2, label: 'Sledgehammer', file: 'zombie/assets/weapons/sledgehammer.glb', len: 0.95, rot: -0.6 },
    { id: 'c7knife', kind: 'weapon', weapon: 'knife', x: -10.6, z: 20.6, r: 1.1, label: 'Knife', builder: 'knife', len: 0.3, rot: 0.8, y: 0.85 },
    { id: 'c7shells', kind: 'ammo', weapon: 'shotgun', rounds: 12, x: -12.4, z: 17.4, r: 1.0, label: 'Shotgun shells', model: 'shells' },
    { id: 'p7mags', kind: 'ammo', weapon: 'pistol', rounds: 24, x: 0.6, z: 17.2, r: 1.0, label: 'Pistol magazines', model: 'mag' },
    { id: 'axe', kind: 'weapon', weapon: 'axe', x: -15.0, z: 9.4, r: 1.2, label: 'Fire axe', model: 'axe', y: 0.95 },
  ],
  interact: () => [
    { id: 'radio', x: -36.6, z: -8.9, r: 1.7, label: 'Answer the radio' },
    { id: 'liftReset', x: -1.0, z: 16.5, r: 1.5, label: 'Restore the lift circuit' },
    { id: 'orBar', x: -1.35, z: 1.8, r: 1.6, side: { axis: 'z', min: 1.05 }, label: 'Lift the bar' },
  ],
  lights: () => [{ x: 2.9, y: 2.3, z: -9.4 }, { x: -1.0, y: 2.3, z: 17.4 }, { x: -1.35, y: 2.3, z: 2.6 }, { x: -36.6, y: 2.4, z: -8.0 }, { x: -15.0, y: 2.4, z: 18.0 }],
  blood: () => [
    { kind: 'hand', x: -7.0, z: -2.9, wall: 'e', y: 1.2, size: 0.34, tilt: -6 },
    { kind: 'drag', x: 2.55, z: -4.35, w: 0.9, l: 1.9, rot: 20 },
    { kind: 'splat', x: 5.7, z: -9.6, w: 1.05, l: 1.05, rot: 15 },
    { kind: 'splat', x: OR_TABLE.x + 0.5, z: OR_TABLE.z - 1.15, w: 0.95, l: 0.95, rot: -35 },
    { kind: 'drag', x: -3.7, z: -5.75, w: 0.7, l: 1.7, rot: -55 },
    { kind: 'hand', x: 0.9, z: -11.0, wall: 's', y: 1.25, size: 0.33, tilt: 12 }, // a hand on the dead lift's frame
    { kind: 'drag', x: -12.05, z: -3.75, w: 0.6, l: 1.0, rot: -60 },
    { kind: 'hand', x: -24.0, z: -11.0, wall: 's', y: 1.15, size: 0.3, tilt: 7 },
    { kind: 'splat', x: -39.6, z: -5.9, w: 0.65, l: 0.65, rot: 40 },
    { kind: 'drag', x: -34.75, z: 9.0, w: 0.55, l: 1.0, rot: 75 },
    { kind: 'splat', x: -29.6, z: 12.4, w: 1.0, l: 1.0, rot: -20 },
    { kind: 'drag', x: -23.6, z: 21.0, w: 0.6, l: 1.0, rot: -100 },
    { kind: 'splat', x: -15.0, z: 26.6, w: 1.2, l: 1.2, rot: 30 },
    { kind: 'hand', x: -11.6, z: 15.8, wall: 's', y: 1.1, size: 0.3, tilt: -8 },
    { kind: 'drag', x: 1.2, z: 22.4, w: 0.7, l: 1.4, rot: 110 },
  ],
  start: () => ({ x: 0.75, z: -6.05, yaw: 0.61 }),
});

// ================================================================================================ FLOOR 6: choose the approach
// A compact fork to cold dispatch (K6), south-west of the lift: the ward route (W6 -> P6) always open; the service passage
// down the east side to the charger bay (A6), whose weak left partition a committed charge can break into K6.
const F6 = buildFloor(6, {
  rooms: [
    { id: 'e6', name: 'Lift Lobby', poly: [[1140, 260], [1319, 260], [1319, 580], [1140, 580]], floor: ['#e4d8bf', '#cfc4ab'], ob: ['corridor', 'clinical'] },
    { id: 'j6', name: 'Junction', poly: [[700, 300], [1140, 300], [1140, 580], [700, 580]], floor: ['#efe2c8', '#d9c9a8'], ob: ['corridor', 'clinical'] },
    { id: 'w6', name: 'Recovery Ward', poly: [[180, 300], [700, 300], [700, 580], [620, 580], [620, 760], [180, 760]], floor: ['#e9eedf', '#c8dcc4'], ob: ['corridor', 'clinical'] },
    { id: 'p6', name: 'Preparation', poly: [[180, 760], [620, 760], [620, 1030], [180, 1030]], floor: ['#e2e8ea', '#bfd2da'], ob: ['clinical', 'clinical'] },
    { id: 'k6', name: 'Cold Dispatch', poly: [[180, 1030], [710, 1030], [710, 1280], [180, 1280]], floor: ['#e6eef2', '#c4d6e2'], ob: ['clinical', 'clinical'] },
    { id: 'sp6', name: 'Service Passage', poly: [[830, 580], [1000, 580], [1000, 800], [830, 800]], floor: ['#c9c4b8', '#b3ad9f'], ob: ['maintenance', 'maintenance'] },
    { id: 'a6', name: 'Partition Works', poly: [[710, 800], [1140, 800], [1140, 1280], [710, 1280]], floor: ['#c4c2b6', '#aeab9d'], ob: ['maintenance', 'maintenance'] },
  ],
  doors: [
    { id: 'e6_j6', o: 'v', c: 1140, a: 420, b: 500 },
    { id: 'j6_w6', o: 'v', c: 700, a: 420, b: 500 },
    { id: 'w6_p6', o: 'h', c: 760, a: 350, b: 440 },
    { id: 'p6_k6', o: 'h', c: 1030, a: 350, b: 440 },
    { id: 'j6_sp6', o: 'h', c: 580, a: 850, b: 970 },
    { id: 'sp6_a6', o: 'h', c: 800, a: 850, b: 970 },
    { id: 'partition', o: 'v', c: 710, a: 1095, b: 1180, kind: 'partition' }, // the weak renovation partition (A6 | K6)
  ],
  dress({ p, wp, raw, sign, room, X, Z }) {
    const z = Z;
    // E6 | the lift lobby: a bench and a planter, the lift on the back wall
    p(M + 'decor/Reception_Linked_Seats_3.glb', 4.9, z(560) - 0.4, 180, [2.61, 0.62], 0.92);
    p(U + '12_lobby/lobby_T2_floor_planter.glb', 6.5, z(270) + 0.6, 0, [0.55, 0.86], 1.2, { fit: true });
    // J6 | the junction: a parked gurney, the two ways signed on the back wall
    p(H + 'procedure_stretcher.glb', X(780), z(330) + 0.3, 90, [0.9, 1.66], 1.22);
    p(H + 'wheelchair.glb', X(1100), z(330), 0, [0.76, 0.91], 0.97);
    p(M + 'decor/Reception_Linked_Seats_3.glb', X(900), z(300) + 0.4, 0, [2.61, 0.62], 0.92);
    p(U + '12_lobby/lobby_T2_floor_planter.glb', X(720), z(320), 0, [0.55, 0.86], 1.2, { fit: true });
    // W6 | the recovery ward: beds in a row on the back wall, two more mid-room (flanking choices)
    for (const bx of [X(242), X(397), X(577)]) { p(H + 'recovery_bed.glb', bx, z(378), 0, [1.25, 2.11], 0.87); p(H + 'bedside_cabinet.glb', bx + 0.95, z(320), 0, [0.52, 0.63], 0.81); }
    p(H + 'privacy_screen.glb', (X(242) + X(397)) / 2, z(378), 0, [0.14, 1.84], 1.97);
    p(H + 'recovery_bed.glb', X(367), z(577), 90, [1.25, 2.11], 0.87);
    p(H + 'recovery_bed.glb', X(557), z(620), 0, [1.25, 2.11], 0.87);
    p(H + 'iv_stand.glb', X(440), z(560), 0, [0.68, 0.65], 1.99, { noCollide: true });
    p(H + 'patient_monitor.glb', X(200), z(690), 90, [0.62, 0.71], 1.49);
    // P6 | preparation: counters along the walls, a prep trolley
    p(H + 'linen_cabinet.glb', X(270), z(790), 0, [0.95, 0.59], 1.84);
    p(H + 'sedaprep.glb', X(530), z(920), 0, [1.0, 0.6], 1.1);
    p(H + 'supply_cart.glb', X(260), z(895), 90, [1.16, 1.1], 1.23);
    p(U + '10_janitor_utility/starter/10_starter_steel_sink.glb', X(560), z(785), 0, [0.87, 0.63], 1.16);
    // K6 | cold dispatch: the specimen fridge cabinets on the back wall, the counter with the sealed case
    p(K + 'pharmacy_locked_cupboard.glb', X(260), z(1260) - 0.2, 180, [0.95, 0.55], 1.95);
    p(K + 'pharmacy_locked_cupboard.glb', X(370), z(1260) - 0.2, 180, [0.95, 0.55], 1.95);
    p(K + 'pharmacy_medicine_shelf.glb', X(640), z(1260) - 0.2, 180, [1.39, 0.53], 1.95);
    p(M + 'furnishings/Lounge_Break_Table.glb', X(305), z(1077), 0, [0.9, 0.9], 0.74, { name: 'k6table' });
    raw({ m: K + 'lab_sample_rack.glb', x: X(560), z: z(1077), rot: 0, y: 0.74, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(M + 'furnishings/Lounge_Break_Table.glb', X(560), z(1077), 0, [0.9, 0.9], 0.74);
    p(H + 'thermanest.glb', X(500), z(1260) - 0.35, 180, [0.81, 0.69], 1.26);
    p(H + 'supply_cart.glb', X(200), z(1180), 90, [1.16, 1.1], 1.23);
    // SP6 / A6 | the service passage and the partition works: shelving on the east wall, stacked boards, open floor for a charge
    p(H + 'supply_shelf.glb', X(1110), z(880), 270, [1.39, 0.53], 2.0);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', X(1110), z(1180), 270, [0.82, 0.51], 1.82);
    raw({ kind: 'hazard', x: X(710) + 1.0, z: (z(1095) + z(1180)) / 2, size: [1.3, 3.2], noCollide: true, fp: [0.1, 0.1], h: 0 }); // (where a dodge sends her charge into the partition: about a metre out)
    raw({ kind: 'bench', x: X(1000), z: z(1250), size: [1.8, 0.65, 0.92], color: 0x8c7a5c, fp: [1.8, 0.65], h: 0.92 });
    p(H + 'wet_floor_sign.glb', X(760), z(860), 0, [0.36, 0.66], 0.67, { noCollide: true });
    raw({ kind: 'box', x: X(1100), z: z(1010), size: [1.4, 0.8, 1.1], face: 'w', color: 0xa38f6c, fp: [0.8, 1.4], h: 1.1 });
    p(K + 'isolation_windowed_partition.glb', X(1110), z(1090), 90, [2.0, 0.15], 2.4);
    // the weak partition itself (two windowed panels filling the opening; the level breaks them)
    raw({ kind: 'partition', x: X(710), z: (z(1095) + z(1180)) / 2, w: 3.0, fp: [0.1, 0.1], h: 0, noCollide: true, name: 'partition' });
    sign('← COLD DISPATCH', 'via Recovery Ward', X(920) - 0.6, 2.3, z(300) + 0.15, 's', 1.5);
    sign('SERVICE ↓', 'Partition works', X(1060), 2.3, z(300) + 0.15, 's', 1.3);
    sign('RENOVATION', 'Temporary partition — weak', X(710) + 0.16, 2.35, (z(1095) + z(1180)) / 2 + 2.2, 'e', 1.2);
    sign('COLD DISPATCH ↓', 'Specimen hold', X(530), 2.3, z(760) + 0.15, 's', 1.3);
    room('elevator', X(1214) + 3.5, 2.75, z(260) + 0.15, 's', 1.1);
    room('recovery', X(445), 2.3, z(300) + 0.15, 's', 1.3);
    room('lab', X(530), 2.3, z(1030) + 0.15, 's', 1.3);
  },
  groups: (Z) => [
    // W6: a broad ward, four spread between the beds (a worthwhile regular route, not padded)
    { id: 'w6', sense: 6.5, zombies: [{ x: X(300), z: Z(470), yaw: 0.8, look: 'patient' }, { x: X(520), z: Z(500), yaw: -0.6 }, { x: X(260), z: Z(660), yaw: 2.4, look: 'nurse' }, { x: X(470), z: Z(700), yaw: -2.0 }] },
    // P6: two in the preparation room
    { id: 'p6', sense: 5.5, zombies: [{ x: X(300), z: Z(840), yaw: 0.4, look: 'nurse' }, { x: X(480), z: Z(980), yaw: -2.4 }] },
    // A6: the big lady straight charger, at the far east of the bay: her lane runs west at the weak partition
    { id: 'a6', sense: 9.0, zombies: [{ x: X(1060), z: Z(1150), yaw: -Math.PI / 2, kind: 'sprinter' }] },
  ],
  pickups: (Z) => [
    { id: 'p6aid', kind: 'health', amount: 40, x: X(260), z: Z(895), r: 1.0, label: 'First-aid case', model: 'aid', y: 1.23 },
    // the guard's pistol and his open bag in the junction, where he and Yola parted before the call (no body: he went on down)
    { id: 'pistol', kind: 'weapon', weapon: 'pistol', x: X(1010), z: Z(545), r: 1.1, mag: 12, label: 'The guard’s pistol', model: 'pistol' },
    { id: 'ammo', kind: 'ammo', weapon: 'pistol', rounds: 24, x: X(1060), z: Z(540), r: 1.0, label: 'Guard’s bag: spare rounds', model: 'bag' },
  ],
  interact: (Z) => [],
  lights: (Z) => [{ x: X(1214), y: 2.3, z: Z(300) }, { x: X(445), y: 2.4, z: Z(1150) }, { x: X(900), y: 2.4, z: Z(1050) }],
  blood: (Z) => [
    { kind: 'drag', x: X(800), z: Z(450), w: 0.7, l: 1.6, rot: 30 },
    { kind: 'splat', x: X(420), z: Z(520), w: 1.0, l: 1.0, rot: -15 },
    { kind: 'hand', x: X(700) + 0.16, z: Z(380), wall: 'e', y: 1.15, size: 0.32, tilt: 4 },
    { kind: 'drag', x: X(330), z: Z(900), w: 0.55, l: 1.0, rot: 80 },
    { kind: 'splat', x: X(950), z: Z(1000), w: 0.9, l: 0.9, rot: 25 },
  ],
  start: (Z) => ({ x: LIFTS[6].x, z: LIFTS[6].z + 1.2, yaw: 0 }),
});

// ================================================================================================ FLOOR 5: preserve and identify
// A small hub: the secured intake (I5) beside the lift holds the case; two genuinely different ways to the records (R5):
// the short ward (W5, the shield carrier) or the broad equipment bay (T5, the charger); back by either.
const F5 = buildFloor(5, {
  rooms: [
    { id: 'e5', name: 'Lift Lobby', poly: [[1140, 260], [1319, 260], [1319, 580], [1140, 580]], floor: ['#e4d8bf', '#cfc4ab'], ob: ['corridor', 'clinical'] },
    { id: 'i5', name: 'Diagnostic Intake', poly: [[700, 300], [1140, 300], [1140, 580], [700, 580]], floor: ['#e6eef2', '#c4d6e2'], ob: ['clinical', 'clinical'] },
    { id: 'd5', name: 'Transfer Hub', poly: [[700, 580], [1140, 580], [1140, 900], [700, 900]], floor: ['#efe2c8', '#d9c9a8'], ob: ['corridor', 'clinical'] },
    { id: 'w5', name: 'Short Ward', poly: [[250, 580], [700, 580], [700, 1000], [250, 1000]], floor: ['#e9eedf', '#c8dcc4'], ob: ['corridor', 'clinical'] },
    { id: 'r5', name: 'Transfer Records', poly: [[250, 1000], [700, 1000], [700, 1280], [250, 1280]], floor: ['#e2e8ea', '#bfd2da'], ob: ['clinical', 'clinical'] },
    { id: 't5', name: 'Equipment Bay', poly: [[700, 900], [1250, 900], [1250, 1280], [700, 1280]], floor: ['#c9c4b8', '#b3ad9f'], ob: ['maintenance', 'maintenance'] },
  ],
  doors: [
    { id: 'e5_i5', o: 'v', c: 1140, a: 420, b: 500 },
    { id: 'i5_d5', o: 'h', c: 580, a: 900, b: 990 },
    { id: 'd5_w5', o: 'v', c: 700, a: 700, b: 790 },
    { id: 'd5_t5', o: 'h', c: 900, a: 930, b: 1020 },
    { id: 'w5_r5', o: 'h', c: 1000, a: 450, b: 540 },
    { id: 't5_r5', o: 'v', c: 700, a: 1100, b: 1190 },
  ],
  dress({ p, wp, raw, sign, room, X, Z }) {
    const z = Z;
    // E5 | the lift lobby
    p(M + 'decor/Reception_Linked_Seats_3.glb', 4.9, z(560) - 0.4, 180, [2.61, 0.62], 0.92);
    // I5 | the secured intake: the preservation cabinet on the back wall (where the case is held), a counter, a plant
    p(H + 'thermanest.glb', X(830), z(300) + 0.45, 0, [1.0, 0.7], 1.6, { name: 'intake' });
    p(K + 'pharmacy_locked_cupboard.glb', X(760), z(300) + 0.4, 0, [0.95, 0.55], 1.95);
    p(U + '07_warmth_teamwork/TeamDesk_standard.glb', X(785), z(525), 0, [1.6, 0.8], 1.0);
    p(U + '12_lobby/lobby_T2_floor_planter.glb', X(1085), z(527), 0, [0.55, 0.86], 1.2, { fit: true });
    // D5 | the transfer hub: a parked bed and counter; both ways visible from here
    p(H + 'procedure_stretcher.glb', X(790), z(630), 90, [0.9, 1.66], 1.22);
    p(H + 'supply_cart.glb', X(1065), z(650), 0, [1.16, 1.1], 1.23);
    p(M + 'decor/Reception_Linked_Seats_3.glb', X(1110) - 0.2, z(780), 270, [2.61, 0.62], 0.92);
    p(U + '12_lobby/lobby_T2_floor_planter.glb', X(720), z(880), 0, [0.55, 0.86], 1.2, { fit: true });
    // W5 | the short ward: beds and a table for controlled flanking, width kept for touch movement
    p(H + 'recovery_bed.glb', X(330), z(650), 90, [1.25, 2.11], 0.87);
    p(H + 'recovery_bed.glb', X(325), z(895), 90, [1.25, 2.11], 0.87);
    p(H + 'break_table.glb', X(435), z(810), 0, [0.95, 0.86], 0.85);
    p(H + 'privacy_screen.glb', X(390), z(770), 0, [0.14, 1.84], 1.97);
    p(H + 'bedside_cabinet.glb', X(627), z(930), 0, [0.52, 0.63], 0.81);
    // R5 | transfer records: the docket station (a desk with its screen) on the back wall, shelving
    p(U + '09_assessment_furniture/runtime/consultation_desk_standard.glb', X(340), z(1255) - 0.45, 180, [1.5, 0.75], 0.78, { name: 'docket' });
    p(K + 'pharmacy_medicine_shelf.glb', X(620), z(1260) - 0.2, 180, [1.39, 0.53], 1.95);
    p(H + 'linen_cabinet.glb', X(280), z(1050), 90, [0.95, 0.59], 1.84);
    raw({ kind: 'screen', x: X(340), z: z(1255) - 0.55, y: 0.78, fp: [0.1, 0.1], h: 0, noCollide: true, name: 'docketScreen' });
    p(K + 'pharmacy_medicine_shelf.glb', X(470), z(1260) - 0.2, 180, [1.39, 0.53], 1.95);
    p(U + '09_assessment_furniture/runtime/clinician_chair_standard.glb', X(340), z(1255) - 1.05, 0, [0.6, 0.6], 1.0, { noCollide: true });
    // T5 | the broad equipment bay: long and open (lateral dodge room), a solid impact wall to the east, equipment at the edges
    p(K + 'ct_scanner_gantry.glb', X(970), z(1075), 0, [2.13, 0.87], 2.26);
    p(H + 'procedure_stretcher.glb', X(780), z(955), 90, [0.9, 1.66], 1.22);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', X(1218), z(1005), 270, [0.82, 0.51], 1.82);
    p(H + 'supply_shelf.glb', X(1218), z(1200), 270, [1.39, 0.53], 2.0);
    p(U + '03_endoscopy/endoscopy_tower_standard.glb', X(760), z(1250), 0, [0.7, 0.6], 1.6);
    sign('DIAGNOSTIC INTAKE', 'Specimen hold', X(920), 2.3, z(300) + 0.15, 's', 1.4);
    sign('← RECORDS', 'Short ward', X(700) + 0.16, 2.3, z(745) - 1.8, 'e', 1.3);
    sign('RECORDS ↓', 'Equipment bay', X(975) + 2.0, 2.3, z(580) + 0.15, 's', 1.3);
    sign('TRANSFER RECORDS', 'Dispatch dockets', X(330), 2.3, z(1000) + 0.15, 's', 1.4);
    room('elevator', X(1214) + 3.5, 2.75, z(260) + 0.15, 's', 1.1);
    room('lab', X(830), 2.62, z(300) + 0.15, 's', 1.1);
    room('recovery', X(420), 2.3, z(580) + 0.15, 's', 1.3);
  },
  groups: (Z) => [
    { id: 'd5', sense: 5.0, zombies: [{ x: X(950), z: Z(780), yaw: 2.6, look: 'patient' }] },
    // W5: the shield carrier with two walkers (the shorter, contained way)
    { id: 'w5', sense: 6.0, zombies: [{ x: X(560), z: Z(820), yaw: Math.PI / 2, kind: 'guard' }, { x: X(330), z: Z(760), yaw: 1.2, look: 'nurse' }, { x: X(470), z: Z(950), yaw: 0.4 }] },
    // T5: the charger at the east end (her lane runs the bay's length), two walkers by the scanner
    { id: 't5', sense: 9.0, zombies: [{ x: X(1150), z: Z(1200), yaw: -Math.PI / 2, kind: 'sprinter' }, { x: X(880), z: Z(1180), yaw: 1.2, look: 'nurse' }, { x: X(1080), z: Z(960), yaw: -2.4 }] },
  ],
  pickups: (Z) => [
    { id: 'w5aid', kind: 'health', amount: 40, x: X(627), z: Z(930), r: 1.0, label: 'First-aid case', model: 'aid', y: 0.81 },
    { id: 't5ammo', kind: 'ammo', weapon: 'pistol', rounds: 18, x: X(1180), z: Z(1140), r: 1.0, label: 'Spare pistol rounds', model: 'mag' },
  ],
  interact: (Z) => [
    { id: 'intake', x: X(830), z: Z(300) + 1.35, r: 1.6, label: 'Secure the case' },
    { id: 'record', x: X(340), z: Z(1255) - 1.4, r: 1.6, label: 'Read the dispatch record' },
  ],
  lights: (Z) => [{ x: X(1214), y: 2.3, z: Z(300) }, { x: X(830), y: 2.4, z: Z(330) }, { x: X(340), y: 2.4, z: Z(1200) }],
  blood: (Z) => [
    { kind: 'drag', x: X(900), z: Z(700), w: 0.7, l: 1.5, rot: -30 },
    { kind: 'splat', x: X(450), z: Z(700), w: 0.9, l: 0.9, rot: 10 },
    { kind: 'hand', x: X(1250) - 0.16, z: Z(1100), wall: 'w', y: 1.2, size: 0.32, tilt: 6 },
    { kind: 'splat', x: X(1000), z: Z(1220), w: 1.1, l: 1.1, rot: 40 },
  ],
  start: (Z) => ({ x: LIFTS[5].x, z: LIFTS[5].z + 1.2, yaw: 0 }),
});

export const FLOORS = { 7: F7, 6: F6, 5: F5 };
// the case's home (cold dispatch, on the counter) and the intake's hold position
export const CASE_HOME = { floor: 6, x: X(305), z: Zf(FLOOR_Z[6])(1077), y: 0.74 };
export const INTAKE_SPOT = { floor: 5, x: X(830), z: Zf(FLOOR_Z[5])(300) + 0.45, y: 1.6 };
// everything the renderer builds once: all three floors in one world
export const CHAPTER = {
  name: 'chapter',
  rooms: [...F7.rooms, ...F6.rooms, ...F5.rooms],
  walls: [...F7.walls, ...F6.walls, ...F5.walls],
  doors: [...F7.doors, ...F6.doors, ...F5.doors],
  props: [...F7.props, ...F6.props, ...F5.props],
  signs: [...F7.signs, ...F6.signs, ...F5.signs],
  roomSigns: [...F7.roomSigns, ...F6.roomSigns, ...F5.roomSigns],
  lights: [...F7.lights, ...F6.lights, ...F5.lights],
  blood: [...F7.blood, ...F6.blood, ...F5.blood],
  pickups: [...F7.pickups.map((q) => ({ ...q, floor: 7 })), ...F6.pickups.map((q) => ({ ...q, floor: 6 })), ...F5.pickups.map((q) => ({ ...q, floor: 5 }))],
  lifts: LIFTS,
};
export function floorAtZ(z) { return z > -40 ? 7 : z > -120 ? 6 : 5; }
export function roomAt(x, z) {
  const f = FLOORS[floorAtZ(z)];
  for (const r of f.rooms) for (const [x0, x1, z0, z1] of r.rects) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r.id;
  return null;
}
