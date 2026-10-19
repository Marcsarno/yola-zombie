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
  const cracked = [];
  for (const d of def.doors) {
    const o = d.o, c = o === 'h' ? Z(d.c) : X(d.c), a = o === 'h' ? X(d.a) : Z(d.a), b = o === 'h' ? X(d.b) : Z(d.b);
    // (2026-10-19, FLOORS_REDESIGN.html) gaps that are no door: 'cracked' (a cracked wall fills it: core/rooms.js, placed by
    // the level), 'blocked' (rubble or a barricade: its props carry the collision), 'glass' (windowed partitions: the props)
    if (d.kind === 'cracked' || d.kind === 'blocked' || d.kind === 'glass') {
      addGap(o, c, a, b);
      if (d.kind === 'cracked') cracked.push(o === 'h' ? { id: d.id, x0: a, z0: c, x1: b, z1: c } : { id: d.id, x0: c, z0: a, x1: c, z1: b });
      continue;
    }
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
  // (2026-10-18, the user: "every bed in the hospital should have one of those old patients in it... they start from the laying
  // down position until you get close"): an old patient lying in each ward bed (core/zombies.js prop 'bed'), each on its own,
  // up out of it when Yola comes within sense m (the spare beds in store, RecoveryBed_standard, stay empty)
  // It gets off the side it faces (core/zombies.js BED_AT): the side with floor beside it, else mirrored (side -1) off the
  // other; that side's rail is off (blender/make_open_beds.py: _nx open on the bed's own -X side, _px on +X)
  const blocked = (x, z, r, self) => walls.some((w) => x > w[0] - r && x < w[1] + r && z > w[2] - r && z < w[3] + r)
    || props.some((o) => o !== self && !o.noCollide && !o.wall && o.fp && Math.abs(x - o.x) < o.fp[0] / 2 + r && Math.abs(z - o.z) < o.fp[1] / 2 + r);
  const bedPatients = props.filter((q) => /recovery_bed\.glb$/.test(q.m)).map((q, i) => {
    const yaw = (q.rot * Math.PI) / 180, out = (s, d) => [q.x - s * Math.cos(yaw) * d, q.z + s * Math.sin(yaw) * d]; // (side 1 gets off the bed's -X side)
    const free = (s) => !blocked(...out(s, 1.0), 0.3, q) && !blocked(...out(s, 1.6), 0.3, q);
    const side = free(1) || !free(-1) ? 1 : -1;
    q.m = q.m.replace(/recovery_bed\.glb$/, side > 0 ? 'recovery_bed_open_nx.glb' : 'recovery_bed_open_px.glb');
    { const [ex, ez] = out(side, 0.85), fx = Math.sin(yaw), fz = Math.cos(yaw); // (a loose chair where it slides down: moved up beside the bed's head end)
      for (const o of props) if (o !== q && o.noCollide && !o.wall && !(o.y > 1) && Math.hypot(o.x - (ex + fx * 0.35), o.z - (ez + fz * 0.35)) < 0.6) { o.x -= fx * 0.75; o.z -= fz * 0.75; } }
    return { id: 'bed' + i, sense: 3.0, zombies: [{ x: q.x, z: q.z, yaw: 0, look: 'patient', prop: 'bed', bed: { x: q.x, z: q.z, yaw, side } }] }; });
  const xs = rooms.flatMap((r) => r.rects.flatMap((q) => [q[0], q[1]])), zs = rooms.flatMap((r) => r.rects.flatMap((q) => [q[2], q[3]]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs, L.cab.minZ), maxZ = Math.max(...zs);
  return {
    name: 'chapter', floor: n, oz, rooms, walls, doors, props, signs, roomSigns, lift: L,
    bounds: { minX: minX - 0.6, maxX: maxX + 0.6, minZ: minZ - 0.6, maxZ: maxZ + 0.6 },
    camBounds: { minX: minX + 1.2, maxX: maxX - 1.0, minZ: minZ + 1.6, maxZ: maxZ - 0.6 },
    groups: [...def.groups(Z), ...bedPatients], pickups: def.pickups(Z), interact: def.interact(Z), lights: def.lights(Z), blood: def.blood?.(Z) || [],
    playerStart: def.start(Z), cutaway: true,
    cracked, flood: def.flood?.(Z) || null, mri: def.mri?.(Z) || null, tanks: def.tanks?.(Z) || [],
  };
}

// ================================================================================================ FLOOR 7: reopen the way down
// The opening's operating room (O7) at the top right, its lift on the back wall. Left, down, right, up to restore the lift's
// local power in lift service (P7); back north through the calm prep room (R7), whose north door unbars into the OR.
const F7 = buildFloor(7, {
  rooms: [
    { id: 'or', name: 'Operating Room', poly: [[963, 260], [1319, 260], [1319, 516], [1243, 516], [1243, 565], [963, 565]], floor: ['#e4d8bf', '#b9d3c8'], ob: ['clinical', 'clinical'] },
    { id: 's7', name: 'Endoscopy and Sterile Supply', poly: [[500, 260], [963, 260], [963, 565], [500, 565]], floor: ['#d9d6cc', '#c2c9c6'], ob: ['corridor', 'maintenance'] },
    { id: 'n7', name: 'Reception and Nurse Station', poly: [[120, 260], [500, 260], [500, 590], [120, 590]], floor: ['#efe2c8', '#d9c9a8'], ob: ['corridor', 'clinical'] },
    { id: 't7', name: 'Recovery Ward', poly: [[120, 590], [500, 590], [500, 930], [120, 930]], floor: ['#e2e8ea', '#bfd2da'], ob: ['corridor', 'clinical'] },
    { id: 'v7', name: 'Ward Refurbishment', poly: [[120, 930], [570, 930], [570, 1240], [120, 1240]], floor: ['#c9c4b8', '#b3ad9f'], ob: ['maintenance', 'maintenance'] },
    { id: 'c7', name: 'Staff Lounge', poly: [[570, 930], [963, 930], [963, 1240], [570, 1240]], floor: ['#f0dccb', '#d8a98c'], ob: ['corridor', 'maintenance'] },
    { id: 'p7', name: 'Lift Plant', poly: [[963, 930], [1319, 930], [1319, 1240], [963, 1240]], floor: ['#b9b8b0', '#a3a39a'], ob: ['maintenance', 'maintenance'] },
    { id: 'x7', name: 'Equipment Store', poly: [[570, 650], [963, 650], [963, 930], [570, 930]], floor: ['#c4c2b6', '#aeab9d'], ob: ['maintenance', 'maintenance'] },
    { id: 'r7', name: 'Pre-op Holding', poly: [[963, 565], [1243, 565], [1243, 516], [1319, 516], [1319, 930], [963, 930]], floor: ['#e6eef2', '#c4d6e2'], ob: ['clinical', 'clinical'] },
    // (2026-10-19, FLOORS_REDESIGN.html: the additions) the staff toilets and the janitor closet off Endoscopy and Sterile
    // Supply (the strip between it and the store), the blocked service corridor between the recovery ward and the store
    { id: 'wc7', name: 'Staff Toilets', poly: [[500, 565], [708, 565], [708, 650], [500, 650]], floor: ['#dfe7ea', '#b8c9cf'], ob: ['clinical', 'clinical'] },
    { id: 'jn7', name: 'Janitor and Linen', poly: [[708, 565], [963, 565], [963, 650], [708, 650]], floor: ['#c4c2b6', '#aeab9d'], ob: ['maintenance', 'maintenance'] },
    { id: 'sc7', name: 'Service Corridor', poly: [[500, 650], [570, 650], [570, 930], [500, 930]], floor: ['#c9c4b8', '#b3ad9f'], ob: ['maintenance', 'maintenance'] },
  ],
  doors: [
    { id: 'or_s7', o: 'v', c: 963, a: 385, b: 490 },
    { id: 's7_n7', o: 'v', c: 500, a: 395, b: 475 },
    { id: 'n7_t7', o: 'h', c: 590, a: 310, b: 400 },
    { id: 't7_v7', o: 'h', c: 930, a: 310, b: 400 },
    { id: 'v7_c7', o: 'v', c: 570, a: 1015, b: 1100, kind: 'cracked' }, // (the first cracked wall: temporary blockwork, the sledgehammer beside it)
    { id: 's7_wc7', o: 'h', c: 565, a: 570, b: 625 },
    { id: 's7_jn7', o: 'h', c: 565, a: 845, b: 900 },
    { id: 'sc7_top', o: 'h', c: 650, a: 500, b: 570, kind: 'blocked' }, // (a gurney barricade at each end: it reads as a hospital and stays shut)
    { id: 'sc7_bot', o: 'h', c: 930, a: 500, b: 570, kind: 'blocked' },
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
    // (2026-10-18, the user: "these rooms have tons and tons of decorations available that are being 100% unused ... it no
    // longer feels like a hospital ... use our assets and fill them with proper equipment, set up, and facing the correct
    // way ... wall decorations and most assets ... on the top angle of the screen, not hidden on the bottom wall"; never
    // furniture in front of a door. The layout is FLOOR7_LAYOUT_PROPOSAL.html. The route and the rooms are unchanged; each
    // room is now a part of a day-surgery floor, its camera wall (north) carries its identity, the bottom band stays low.
    // H = the Outbreak (damaged) set, C = clean props: rooms that were locked or calm keep clean stock.)
    const C = { bed: U + '05_recovery_bay/RecoveryBed_standard.glb', chair: U + '14_transport/transport_T1_wheelchair.glb', iv: U + '08_support_equipment/runtime/iv_stand_standard.glb',
      shelf: M + 'utility/Utility_Supply_Shelf.glb', cart: U + '08_support_equipment/runtime/supply_cart_standard.glb', visitor: U + '09_assessment_furniture/runtime/visitor_chair_standard.glb',
      bins: M + 'furnishings/Clinical_Storage_Bins.glb', board: M + 'furnishings/Endoscopy_Readiness_Board.glb', wshelf: U + '10_janitor_utility/standard/10_standard_wall_shelf.glb' };
    const bed = (x, z, rot, m = H + 'recovery_bed.glb') => p(m, x, z, rot, [1.25, 2.11], 0.87);
    // S7 | ENDOSCOPY AND STERILE SUPPLY, right off the theatre: sterile stock and case carts on the theatre side, the scope
    // room and its procedure bay on the far side, a waist-high island of sterile packs to fight round. The pistol and the
    // first-aid case keep their cart.
    p(H + 'supply_shelf.glb', -8.9, -10.57, 0, [1.39, 0.56], 2.0);
    p(H + 'supply_shelf.glb', -10.4, -10.57, 0, [1.39, 0.56], 2.0);
    p(H + 'clinical_storage_cabinet.glb', -12.3, -10.63, 0, [1.4, 0.74], 0.88);
    wp(H + 'wall_cupboard.glb', -12.3, -11.0, 's', 1.45);
    p(H + 'linen_cabinet.glb', -14.0, -10.68, 0, [0.95, 0.65], 1.84);
    wp(H + 'glove_dispenser.glb', -15.8, -11.0, 's', 1.2);
    wp(H + 'wall_sanitizer.glb', -15.2, -11.0, 's', 1.05);
    wp(H + 'wall_clock.glb', -16.6, -11.0, 's', 1.95);
    for (const z of [-9.7, -9.2, -8.7]) p(H + 'medical_gas_cylinder.glb', -7.5, z, 0, [0.39, 0.43], 1.15);
    p(C.cart, -10.2, -7.6, 0, [1.16, 1.1], 1.21); // (a case cart laid out for the next list: nobody got to it)
    p(H + 'supply_cart.glb', -11.6, -7.6, 0, [1.16, 1.1], 1.23);
    p(H + 'endoscopy_tower.glb', -24.6, -10.7, 0, [0.74, 0.6], 1.65);
    p(H + 'scopeair_vitadock.glb', -23.2, -10.7, 0, [0.98, 0.6], 1.67); // (the scope drying cabinet)
    p(H + 'utility_sink.glb', -21.6, -10.74, 0, [0.88, 0.51], 1.64); // (the scope wash sink)
    wp(H + 'towel_dispenser.glb', -20.9, -11.0, 's', 1.1);
    wp(H + 'soap_dispenser.glb', -22.3, -11.0, 's', 1.1);
    wp(H + 'clinical_sign_endoscopy.glb', -23.2, -11.0, 's', 2.05);
    wp(C.board, -19.4, -11.0, 's', 1.1);
    p(H + 'procedure_stretcher.glb', -21.4, -7.4, 0, [0.9, 1.66], 1.22);
    p(H + 'endoscopy_tower.glb', -22.6, -7.7, 0, [0.74, 0.6], 1.65);
    p(H + 'charting_workstation.glb', -19.9, -7.7, 0, [0.83, 0.62], 1.47);
    p(H + 'clinician_chair.glb', -19.9, -6.9, 180, [0.65, 0.61], 0.98, { noCollide: true });
    p(H + 'prep_storage.glb', -16.6, -4.45, 0, [1.51, 0.72], 1.09);
    p(H + 'prep_storage.glb', -16.6, -3.7, 180, [1.51, 0.72], 1.09);
    p(U + '08_support_equipment/runtime/supply_cart_starter.glb', -15.6, -1.0, 0, [0.78, 0.52], 1.01, { name: 's7cart' });
    p(H + 'storage_bins.glb', -24.05, 0.6, 0, [1.05, 0.3], 0.28, { noCollide: true }); // (clear of the toilets' doorway)
    p(H + 'laundry_hamper.glb', -24.9, 0.4, 0, [0.6, 0.57], 1.15);
    p(H + 'wheelchair.glb', -19.8, 0.3, 270, [0.76, 0.91], 0.97);
    p(H + 'lidded_waste_bin.glb', -9.2, 0.65, 0, [0.36, 0.4], 0.58);
    p(H + 'biohazard_bin.glb', -8.6, 0.65, 0, [0.39, 0.39], 0.69);
    // N7 | RECEPTION AND NURSE STATION: the station counter off the wall, its front to the camera, the staff side behind it
    // under the team station and the RECEPTION sign (the radio on the counter); waiting seats on the camera wall and the west
    // wall; the team desk island (the shotgun on it) in a middle kept open for the walker ring; a pre-assessment corner.
    p(H + 'reception_desk.glb', -36.6, -9.4, 0, [2.2, 0.9], 1.3, { name: 'n7desk' });
    raw({ m: H + 'desktop_computer.glb', x: -36.0, z: -9.45, rot: 0, y: 1.1, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ kind: 'radio', x: -37.2, z: -9.35, y: 1.1, fp: [0.1, 0.1], h: 0, noCollide: true, name: 'radio' });
    p(H + 'clinician_chair.glb', -37.3, -10.45, 180, [0.65, 0.61], 0.98, { noCollide: true });
    p(H + 'clinician_chair.glb', -35.9, -10.45, 180, [0.65, 0.61], 0.98, { noCollide: true });
    wp(H + 'team_wall_station.glb', -39.0, -11.0, 's', 0.75);
    wp(H + 'identity_nameplate_family.glb', -36.6, -11.0, 's', 1.85);
    p(H + 'biohazard_bin.glb', -40.0, -10.75, 0, [0.39, 0.39], 0.69);
    p(H + 'lidded_waste_bin.glb', -40.5, -10.75, 0, [0.36, 0.4], 0.58);
    wp(H + 'wall_clock.glb', -34.4, -11.0, 's', 1.95);
    wp(H + 'reception_poster_heart.glb', -33.3, -11.0, 's', 1.15);
    p(H + 'waiting_chair_section.glb', -31.2, -10.5, 0, [2.69, 0.97], 0.99);
    wp(H + 'lobby_t2_health_poster.glb', -30.0, -11.0, 's', 1.15);
    p(H + 'floor_planter.glb', -28.7, -10.75, 0, [1.12, 0.5], 1.52);
    p(H + 'water_cooler.glb', -27.6, -10.75, 0, [0.45, 0.49], 1.47);
    wp(H + 'lobby_t2_wayfinding.glb', -26.6, -11.0, 's', 1.55);
    wp(H + 'assessment_status_board.glb', -40.7, -6.2, 'e', 1.0);
    p(H + 'magazine_rack.glb', -40.4, -4.0, 90, [0.55, 0.43], 1.05);
    p(H + 'waiting_chair_section.glb', -40.2, -1.0, 90, [2.69, 0.97], 0.99);
    p(H + 'side_table.glb', -40.32, 1.15, 0, [0.74, 0.74], 0.55);
    p(H + 'check_in_kiosk.glb', -26.0, -7.6, 270, [0.39, 0.36], 1.46);
    p(H + 'team_desk.glb', -32.4, -5.0, 0, [1.13, 0.74], 1.16);
    p(H + 'team_stool.glb', -32.9, -4.3, 0, [0.36, 0.34], 0.5, { noCollide: true });
    p(H + 'team_stool.glb', -31.9, -4.3, 0, [0.36, 0.34], 0.5, { noCollide: true });
    p(H + 'consultation_desk.glb', -27.4, 0.6, 0, [1.5, 0.73], 0.81);
    p(H + 'visitor_chair.glb', -27.9, -0.2, 180, [0.47, 0.47], 0.98, { noCollide: true });
    p(H + 'visitor_chair.glb', -26.9, -0.2, 180, [0.47, 0.47], 0.98, { noCollide: true });
    // T7 | RECOVERY WARD (PACU): three curtained bays with their heads on the camera wall (headwall, monitor, cabinet, IV),
    // two more on the east wall, the PACU station watching them; the 3.6 m lane from door to door stays clear
    for (const bx of [-39.2, -35.9, -27.6]) {
      bed(bx, 3.3, 0);
      p(H + 'curtain_rail.glb', bx, 3.4, 0, [2.48, 2.28], 0.45, { y: 1.95, noCollide: true });
      wp(H + 'service_headwall.glb', bx, 2.2, 's', 1.24);
      p(H + 'bedside_cabinet.glb', bx - 1.0, 2.6, 0, [0.52, 0.63], 0.81);
      p(H + 'patient_monitor.glb', bx + 1.0, 2.6, 0, [0.62, 0.71], 1.49);
      p(H + 'iv_stand.glb', bx + 0.9, 4.2, 0, [0.73, 0.7], 2.03, { noCollide: true });
    }
    wp(H + 'recovery_bay_sign_01.glb', -39.2, 2.2, 's', 2.05);
    wp(H + 'recovery_bay_sign_02.glb', -35.9, 2.2, 's', 2.05);
    wp(H + 'recovery_bay_sign_01.glb', -27.6, 2.2, 's', 2.05);
    wp(H + 'room_sign_family.glb', -40.7, 7.0, 'e', 1.85); // (RECOVERY: the doorways have only a lintel above them)
    wp(H + 'wall_clock.glb', -33.7, 2.2, 's', 1.95);
    wp(H + 'sharps_container.glb', -37.55, 2.2, 's', 1.09);
    wp(H + 'glove_dispenser.glb', -34.3, 2.2, 's', 1.2);
    wp(H + 'wall_sanitizer.glb', -29.1, 2.2, 's', 1.05);
    for (const bz of [8.4, 12.2]) {
      bed(-26.85, bz, 270);
      p(H + 'curtain_rail.glb', -26.95, bz, 270, [2.48, 2.28], 0.45, { y: 1.95, noCollide: true });
      wp(H + 'service_headwall.glb', -25.79, bz, 'w', 1.24);
      p(H + 'bedside_cabinet.glb', -26.17, bz - 1.05, 270, [0.52, 0.63], 0.81);
      p(H + 'patient_monitor.glb', -26.17, bz + 1.1, 270, [0.62, 0.71], 1.49);
    }
    p(H + 'pacu_station.glb', -37.4, 9.4, 90, [0.75, 0.6], 1.82);
    p(H + 'charting_workstation.glb', -37.4, 10.6, 90, [0.83, 0.62], 1.47);
    p(H + 'team_stool.glb', -36.5, 10.0, 0, [0.36, 0.34], 0.5, { noCollide: true });
    p(H + 'thermanest.glb', -40.32, 7.0, 90, [0.86, 0.74], 1.26);
    p(H + 'airready.glb', -34.5, 5.6, 0, [0.94, 0.74], 1.37);
    wp(H + 'clinical_art_lungs.glb', -40.7, 5.0, 'e', 1.2);
    wp(H + 'clinical_art_airway.glb', -40.7, 9.4, 'e', 1.2);
    p(H + 'linen_cabinet.glb', -40.37, 11.9, 90, [0.95, 0.65], 1.84);
    for (const z of [13.1, 13.55]) p(H + 'medical_gas_cylinder.glb', -40.5, z, 0, [0.39, 0.43], 1.15);
    p(H + 'procedure_stretcher.glb', -39.0, 14.6, 90, [0.9, 1.66], 1.22);
    // V7 | THE WARD REFURBISHMENT (closed for works): the user's painted construction props on the camera wall (stand-ins
    // until their own files turn up: assets/props/standin_*, blender/make_standin_props.py), the old ward's beds pushed
    // aside, its bay sign taken down, a plastic-sheeted bay, and the floor taken up behind barriers: where they break through
    p(SI + 'standin_cable_workbench.glb', -38.2, 16.2, 0, [1.8, 0.76], 0.92, { name: 'v7bench' });
    p(SI + 'standin_tool_pegboard.glb', -38.2, 15.84, 180, [1.26, 0.06], 0.94, { y: 1.05, noCollide: true });
    wp(H + 'toolboard.glb', -35.6, 15.8, 's', 0.95);
    p(H + 'clinical_sign_bay02.glb', -34.6, 16.0, 0, [1.48, 0.12], 0.31, { noCollide: true }); // (taken down, leaning on the wall)
    raw({ kind: 'pipes', x: -32.0, z: 15.8, len: 9.0, y: 2.25, noCollide: true, fp: [0.1, 0.1], h: 0 });
    p(SI + 'standin_paint_shelf.glb', -27.4, 16.05, 0, [1.19, 0.44], 1.81);
    p(SI + 'standin_renovation_pallet.glb', -25.3, 16.4, 0, [1.25, 1.02], 0.61);
    p(H + 'laundry_hamper.glb', -23.5, 17.0, 0, [0.6, 0.57], 1.15); // (dust sheets)
    bed(-39.64, 19.6, 90); bed(-39.64, 20.95, 90); // (the old ward's beds, pushed against the wall)
    p(H + 'bedside_cabinet.glb', -40.38, 22.35, 90, [0.52, 0.63], 0.81);
    p('zombie/assets/props/drywall_pallet.glb', -35.6, 19.6, 0, [1.41, 1.69], 0.45);
    p('zombie/assets/props/sawhorse_barrier.glb', -31.4, 22.0, 0, [1.9, 0.73], 1.04);
    p('zombie/assets/props/sawhorse_barrier.glb', -33.9, 23.9, 90, [1.9, 0.73], 1.04);
    p('zombie/assets/props/sawhorse_barrier.glb', -28.9, 23.9, 90, [1.9, 0.73], 1.04);
    raw({ kind: 'hazard', x: -31.4, z: 24.2, size: [3.4, 1.4], noCollide: true, fp: [0.1, 0.1], h: 0 });
    p(K + 'isolation_windowed_partition.glb', -36.6, 25.5, 90, [2.0, 0.15], 2.4);
    p(K + 'isolation_windowed_partition.glb', -38.7, 24.45, 0, [2.0, 0.15], 2.4);
    p(H + 'janitor_cart.glb', -24.6, 26.8, 0, [0.83, 0.99], 1.23);
    p(H + 'mop_bucket.glb', -25.8, 27.3, 0, [0.46, 0.51], 0.65);
    p(H + 'wet_floor_sign.glb', -24.4, 24.3, 0, [0.48, 0.66], 0.64, { noCollide: true });
    // C7 | STAFF LOUNGE AND CANTEEN: the serving counter, vending and the coffee corner on the camera wall either side of
    // the store's powered door (still seen through), lockers and the water cooler on the east wall, a low sofa corner in the
    // south-west, four tables to circle the guard round; the lane from door to door stays open
    p(K + 'cafeteria_serving_counter.glb', -20.4, 16.28, 0, [2.46, 0.96], 1.53);
    p(K + 'cafeteria_tray_return.glb', -18.4, 16.08, 0, [0.68, 0.56], 1.0);
    wp(H + 'lounge_staff_room_sign.glb', -19.9, 15.8, 's', 2.05);
    p(K + 'cafeteria_vending_machine.glb', -12.0, 16.24, 0, [0.93, 0.87], 1.9);
    p(K + 'cafeteria_vending_machine.glb', -10.95, 16.24, 0, [0.93, 0.87], 1.9);
    p(H + 'coffee_counter.glb', -8.55, 16.21, 0, [1.33, 0.81], 1.0);
    raw({ m: H + 'coffee_machine.glb', x: -8.9, z: 16.15, rot: 0, y: 1.0, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: H + 'mug.glb', x: -8.2, z: 16.35, rot: 40, y: 1.0, fp: [0.1, 0.1], h: 0, noCollide: true });
    wp(H + 'wall_clock.glb', -9.6, 15.8, 's', 1.95);
    p(H + 'water_cooler.glb', -7.5, 17.6, 270, [0.45, 0.49], 1.47);
    p(H + 'pedal_bin.glb', -7.5, 23.3, 270, [0.37, 0.41], 0.66);
    p(H + 'locker_bank.glb', -7.62, 24.6, 270, [1.48, 0.66], 1.95);
    p(H + 'locker_bank.glb', -7.62, 26.1, 270, [1.48, 0.66], 1.95);
    p(H + 'floor_planter.glb', -22.35, 17.2, 90, [1.12, 0.5], 1.52);
    p(H + 'magazine_rack.glb', -22.4, 23.6, 90, [0.55, 0.43], 1.05);
    p(H + 'sofa.glb', -22.4, 25.4, 90, [2.05, 0.6], 0.92);
    p(H + 'side_table.glb', -22.3, 27.3, 0, [0.74, 0.74], 0.55);
    p(H + 'armchair.glb', -20.6, 26.9, 270, [1.01, 0.65], 0.92);
    for (const [tx, tz] of [[-17.4, 23.9], [-13.2, 23.9], [-15.3, 26.7], [-11.1, 26.7]]) {
      p(H + 'break_table.glb', tx, tz, 0, [0.95, 0.86], 0.85);
      p(H + 'break_chair.glb', tx - 0.85, tz, 90, [0.72, 0.62], 0.92, { noCollide: true });
      p(H + 'break_chair.glb', tx + 0.85, tz, 270, [0.72, 0.62], 0.92, { noCollide: true });
      raw({ m: K + 'cafeteria_meal_tray_set.glb', x: tx, z: tz, rot: 0, y: 0.85, fp: [0.1, 0.1], h: 0, noCollide: true });
    }
    // P7 | LIFT PLANT AND JANITOR: switchgear, the tool board and the lift reset on the camera wall; the janitor closet along
    // the side walls; the open bay is the big lady's lane. (The electrical cabinet that stood in front of the lounge doorway
    // is now south of it.)
    raw({ kind: 'box', x: -5.2, z: 16.3, size: [1.4, 0.7, 1.9], face: 's', color: 0x8f989b, fp: [1.4, 0.7], h: 1.9, name: 'switchgear' });
    wp(H + 'toolboard.glb', -3.4, 15.8, 's', 0.95);
    raw({ kind: 'hazard', x: -1.0, z: 16.9, size: [1.8, 0.9], noCollide: true, fp: [0.1, 0.1], h: 0 });
    p(H + 'utility_sink.glb', 6.6, 17.2, 270, [0.88, 0.51], 1.64);
    wp(H + 'wall_shelf.glb', 6.97, 18.6, 'w', 1.2);
    p(H + 'mop.glb', 6.82, 19.5, 270, [0.34, 0.25], 1.5, { noCollide: true });
    raw({ kind: 'box', x: 6.55, z: 21.5, size: [1.6, 0.6, 2.1], face: 'w', color: 0x7d878a, fp: [0.6, 1.6], h: 2.1, name: 'panelboard' });
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', 6.55, 26.4, 270, [0.82, 0.51], 1.82);
    p(SI + 'standin_janitor_cabinet.glb', -6.6, 23.7, 90, [0.9, 0.5], 1.9); // (stand-in: the user's painted janitor cabinet is missing)
    raw({ kind: 'box', x: -6.65, z: 25.3, size: [1.5, 0.6, 2.0], face: 'e', color: 0x8a9497, fp: [0.6, 1.5], h: 2.0 });
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -6.55, 27.35, 90, [0.82, 0.51], 1.82);
    // (the floor scrubber, the janitor's cart and bucket moved to the janitor closet, 2026-10-19)
    p(H + 'wet_floor_sign.glb', 0.6, 25.6, 0, [0.48, 0.66], 0.64, { noCollide: true });
    // R7 | PRE-OP HOLDING AND SCRUB: scrub sinks, the prep checklist and the PRE-OP sign on the camera wall either side of the
    // barred theatre door (kept clear), pre-op trolleys with a curtain and relatives' chairs on the west wall, the sedation,
    // airway and warming carts on the east wall; the centre stays open for the last push
    p(H + 'handwash_cabinet_base.glb', -5.6, 1.55, 0, [0.51, 0.7], 0.77);
    p(H + 'handwash_cabinet_base.glb', -4.5, 1.55, 0, [0.51, 0.7], 0.77);
    wp(H + 'handwash_basin.glb', -5.6, 1.2, 's', 0.77);
    wp(H + 'handwash_basin.glb', -4.5, 1.2, 's', 0.77);
    wp(H + 'towel_dispenser.glb', -6.5, 1.2, 's', 1.1);
    wp(H + 'soap_dispenser.glb', -5.05, 1.2, 's', 1.2);
    wp(H + 'clinical_art_preparation_checklist.glb', -3.5, 1.2, 's', 1.0);
    p(H + 'prep_counter.glb', 1.5, 1.55, 0, [1.51, 0.69], 1.06);
    wp(H + 'wall_sanitizer.glb', 0.5, 1.2, 's', 1.05);
    wp(H + 'clinical_sign_preop.glb', 1.6, 1.2, 's', 2.05);
    wp(H + 'wall_clock.glb', 3.3, 1.2, 's', 1.95);
    p(H + 'prep_storage.glb', 5.6, -0.4, 0, [1.51, 0.72], 1.09);
    p(H + 'procedure_stretcher.glb', -6.12, 5.6, 90, [0.9, 1.66], 1.22);
    p(H + 'procedure_stretcher.glb', -6.12, 9.4, 90, [0.9, 1.66], 1.22);
    p(H + 'curtain_panel.glb', -6.08, 7.5, 90, [0.22, 1.75], 2.18);
    p(C.visitor, -4.8, 5.6, 270, [0.47, 0.47], 0.98, { noCollide: true });
    p(C.visitor, -4.8, 9.4, 270, [0.47, 0.47], 0.98, { noCollide: true });
    p(H + 'iv_stand.glb', -5.0, 4.5, 0, [0.73, 0.7], 2.03, { noCollide: true });
    p(H + 'iv_stand.glb', -5.0, 10.6, 0, [0.73, 0.7], 2.03, { noCollide: true });
    p(H + 'sedaprep.glb', 6.55, 5.6, 270, [1.12, 0.72], 0.98);
    p(H + 'airready.glb', 6.58, 7.4, 270, [0.94, 0.74], 1.37);
    p(H + 'thermanest.glb', 6.58, 9.2, 270, [0.86, 0.74], 1.26);
    p(H + 'linen_cabinet.glb', 6.62, 11.4, 270, [0.95, 0.65], 1.84);
    p(H + 'supply_cart.glb', -6.4, 13.4, 90, [1.16, 1.1], 1.23);
    p(H + 'medical_gas_cylinder.glb', -6.76, 14.9, 0, [0.39, 0.43], 1.15);
    p(H + 'lidded_waste_bin.glb', -5.9, 15.2, 0, [0.36, 0.4], 0.58);
    // X7 | THE EQUIPMENT STORE (behind its powered door): locked when it fell, so its stock is clean: shelving on the camera
    // wall, spare beds still wrapped, nested wheelchairs, IV stands, the gas cylinder store, and the contractors' bench (the
    // axe) and spare barriers from the works next door
    p(C.shelf, -21.6, 4.88, 0, [1.39, 0.56], 2.0);
    p(C.shelf, -20.15, 4.88, 0, [1.39, 0.56], 2.0);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -17.6, 4.86, 0, [0.82, 0.51], 1.82);
    wp(C.wshelf, -15.0, 4.6, 's', 1.2);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -12.4, 4.86, 0, [0.82, 0.51], 1.82);
    p(C.shelf, -9.9, 4.88, 0, [1.39, 0.56], 2.0);
    p(C.shelf, -8.45, 4.88, 0, [1.39, 0.56], 2.0);
    bed(-21.62, 8.3, 90, C.bed); bed(-21.62, 9.65, 90, C.bed);
    for (const [x, z] of [[-22.2, 11.6], [-21.6, 11.95], [-22.1, 12.4]]) p(C.iv, x, z, 0, [0.73, 0.7], 2.03, { noCollide: true });
    for (const z of [7.4, 8.2, 9.0]) p(C.chair, -7.85, z, 270, [0.76, 0.91], 0.97);
    for (const [x, z] of [[-7.5, 11.2], [-7.5, 11.7], [-7.5, 12.2], [-7.95, 11.45]]) p(H + 'medical_gas_cylinder.glb', x, z, 0, [0.39, 0.43], 1.15);
    raw({ kind: 'bench', x: -15.0, z: 9.4, size: [2.0, 0.75, 0.92], color: 0x8c7a5c, fp: [2.0, 0.75], h: 0.92, name: 'x7bench' });
    p('zombie/assets/props/sawhorse_barrier.glb', -19.0, 6.6, 0, [1.9, 0.73], 1.04);
    raw({ kind: 'box', x: -19.6, z: 12.6, size: [1.2, 0.8, 0.9], face: 's', color: 0xa38f6c, fp: [1.2, 0.8], h: 0.9 });
    p(C.bins, -9.2, 13.8, 0, [1.05, 0.3], 0.28, { noCollide: true });
    // WC7 | STAFF TOILETS (off sterile supply): two cubicles and the wash stand on the camera wall, one of them holding a
    // resident who bangs inside it; the corridor's barricade shows through the open south-west corner
    const R13 = U + '13_restroom_fixtures/standard/13_standard_';
    for (const cx of [-19.9, -18.62]) { p(R13 + 'cubicle.glb', cx, 1.86, 0, [1.24, 1.87], 2.01, { noCollide: true }); if (cx < -19) raw({ kind: 'collider', x: cx, z: 2.13, fp: [1.24, 1.82], h: 2.0 }); p(R13 + 'toilet.glb', cx, 1.48, 0, [0.5, 0.79], 1.04, { noCollide: true }); }
    p(R13 + 'washstand.glb', -24.3, 1.51, 0, [1.18, 0.65], 1.22);
    wp(R13 + 'mirror.glb', -24.3, 1.2, 's', 1.25);
    wp(R13 + 'towel_dispenser.glb', -25.2, 1.2, 's', 1.15);
    wp(R13 + 'soap_dispenser.glb', -23.5, 1.2, 's', 1.15);
    p(M + 'rooms/Restroom_Pedal_Bin.glb', -23.2, 1.45, 0, [0.37, 0.41], 0.66, { noCollide: true });
    p(H + 'wet_floor_sign.glb', -21.0, 3.3, 20, [0.48, 0.66], 0.64, { noCollide: true });
    sign('WC', 'Staff', -23.64, 2.3, 1.2, 's', 0.6);
    // JN7 | JANITOR AND LINEN (out of lift plant): the mop sink and shelving on the camera wall, the cart, the scrubber, linen
    p(U + '10_janitor_utility/standard/10_standard_utility_sink.glb', -15.6, 1.56, 0, [1.06, 0.7], 1.32);
    wp(U + '10_janitor_utility/standard/10_standard_wall_shelf.glb', -14.2, 1.2, 's', 1.45);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -13.1, 1.46, 0, [0.82, 0.51], 1.82);
    p(H + 'linen_cabinet.glb', -8.0, 1.53, 0, [0.95, 0.65], 1.84);
    p(H + 'laundry_hamper.glb', -8.9, 3.9, 0, [0.6, 0.57], 1.15);
    p(H + 'janitor_cart.glb', -15.9, 3.6, 90, [0.83, 0.99], 1.23);
    p(H + 'floor_scrubber.glb', -13.4, 3.75, 90, [0.86, 1.52], 1.17);
    p(H + 'mop_bucket.glb', -11.4, 3.7, 30, [0.46, 0.51], 0.65);
    p(H + 'mop.glb', -16.95, 2.3, 90, [0.34, 0.25], 1.5, { noCollide: true });
    p(SI + 'standin_janitor_cabinet.glb', -16.88, 3.1, 90, [0.9, 0.5], 1.9);
    sign('JANITOR', 'Linen · cleaning', -12.94, 2.3, 1.2, 's', 0.9);
    // SC7 | THE SERVICE CORRIDOR (blocked): a gurney barricade at each end, dust sheets and spare stock between them
    for (const [z, rz] of [[5.0, 1], [15.1, -1]]) {
      raw({ kind: 'collider', x: -24.24, z: z - rz * 0.2, fp: [2.8, 0.4], h: 2.2 });
      p(H + 'procedure_stretcher.glb', -24.5, z, 90 + rz * 8, [0.9, 1.66], 1.22, { noCollide: true });
      p('zombie/assets/props/sawhorse_barrier.glb', -24.2, z + rz * 0.75, 0, [1.9, 0.73], 1.04, { noCollide: true });
    }
    p(H + 'procedure_stretcher.glb', -24.2, 8.6, 0, [0.9, 1.66], 1.22);
    p(SI + 'dust_sheet_small.glb', -24.25, 11.4, 90, [1.39, 0.92], 0.94);
    p(H + 'wheelchair.glb', -24.3, 13.3, 200, [0.76, 0.91], 0.97);
    sign('NO ACCESS', 'Service corridor', -24.24, 2.2, 4.6, 's', 0.9);
    // the first cracked wall (v7 | c7): its warning on the floor and the hammer at its foot
    raw({ kind: 'hazard', x: -23.8, z: 20.75, size: [1.2, 3.4], noCollide: true, fp: [0.1, 0.1], h: 0 });
    sign('TEMPORARY WALL', 'Cracked: do not lean', -22.99, 1.95, 23.5, 'w', 1.0);
    // wayfinding: printed signs and room plates on the walls the camera sees
    sign('LIFT PLANT →', 'Lift power · via the staff lounge', -25.8, 1.95, -1.4, 'w', 1.5);
    sign('LIFT', 'Power fault', X(1214) + 3.65, 2.3, -11.0, 's', 0.8, { lift: 7 });
    sign('BARRED', 'From the prep room side', 1.0, 1.75, 0.9, 'n', 0.86, { id: 'orbarSign' });
    sign('↓ RECOVERY · WARD WORKS', 'Lift plant →', -31.4, 2.3, -11.0, 's', 1.8);
    sign('WARD CLOSED', 'Refurbishment · keep out', -28.4, 1.45, 15.8, 's', 1.5); // (west of the service corridor's barricaded end) // (over the pallet: the pipes run along the wall's west half at 2.25 m)
    sign('LIFT PLANT →', 'via the staff lounge', -22.99, 2.0, 18.0, 'w', 1.3);
    sign('EQUIPMENT STORE', 'Powered door · lift circuit', -17.4, 2.15, 15.8, 's', 1.3);
    sign('EQUIPMENT STORE', '', -15.0, 2.35, 4.6, 's', 1.4);
    sign('LIFT RESET', 'Local power', -1.0, 2.2, 15.8, 's', 0.9);
    sign('OR · LIFT ↑', 'Through pre-op', 6.3, 2.0, 15.8, 's', 1.1);
    room('operating_room', -7.0, 2.48, -4.05, 'e', 1.3);
    room('maintenance', -3.4, 2.3, 15.8, 's', 1.4);
    room('elevator', X(1214) - 3.3, 2.75, -11.0, 's', 1.1);
  },
  // (2026-10-18, the user: the IV pole walker, the one in a wheelchair, a surgeon: prop on a group's zombie; core/zombies.js)
  groups: (Z) => [
    // the OR after the reveal: the patient at the table and three of the team, waking one at a time (the opening fight)
    { id: 'or', zombies: [{ x: OR_TABLE.x + 0.75, z: OR_TABLE.z - 1.0, yaw: 0.75, wake: 1.8, look: 'patient' }, { x: OR_TABLE.x - 0.85, z: OR_TABLE.z + 0.6, yaw: 1.2, wake: 3.4, look: 'nurse' }, { x: -1.4, z: -5.6, yaw: 0.9, wake: 5.5 }, { x: 5.9, z: -2.9, yaw: -2.4, wake: 8.0 }] },
    // (2026-10-18, the user's part 3: "more enemies ... treat each room as a small combat arena with its own flavor ... avoid
    // repeating the same crowd in every room". Floor spawns (from: 'floor') break up out of the floor a delay after their
    // group wakes (core/level.js floorStep: never right under Yola), the hole stays.)
    // supply: one straggler, then the first one through the floor, while she picks up the pistol (its first targets)
    { id: 's7', sense: 5.0, zombies: [{ x: -21.0, z: -5.5, yaw: 1.6, look: 'patient' }, { x: -20.0, z: -2.6, look: 'nurse', from: 'floor', delay: 2.4 }] },
    // nurse station: a crowd of walkers spread through the room (the ring that waits its turn and pounces), the shotgun on
    // the team desk in the middle of them
    { id: 'n7', sense: 6.0, zombies: [{ x: -38.6, z: -3.2, yaw: 1.2, look: 'nurse', prop: 'surgeon' }, { x: -31.0, z: 0.6, yaw: -2.6 }, { x: -35.6, z: -7.4, yaw: 0.6, look: 'patient' }, { x: -28.4, z: -2.2, yaw: -1.4 }, { x: -39.2, z: 0.6, yaw: 2.2, look: 'nurse' }] },
    // treatment ward: the crawlers' ward: two already down between the beds (crawl), one walker in each lane, and the floor
    // of the middle lane gives way behind her once it starts
    { id: 't7', sense: 6.5, zombies: [{ x: -36.2, z: 6.8, yaw: 0.4, look: 'patient', prop: 'iv' }, { x: -30.2, z: 8.6, yaw: -0.8 }, { x: -33.0, z: 12.6, yaw: 2.6, look: 'nurse' }, { x: -28.6, z: 13.8, yaw: -2.2 },
      { x: -35.0, z: 7.6, yaw: 0.3, look: 'patient', crawl: true }, { x: -29.6, z: 4.0, yaw: -2.8, crawl: true }, { x: -31.4, z: 6.0, look: 'nurse', from: 'floor', delay: 3.5 }] },
    // renovation: the runners' room: wide and open, two orange runners and a walker, and the half-built floor breaks under two more
    { id: 'v7', sense: 7.0, zombies: [{ x: -33.2, z: 26.2, yaw: 0.2 }, { x: -25.0, z: 21.4, yaw: -1.6, kind: 'runner' }, { x: -38.2, z: 25.6, yaw: 1.0, kind: 'runner' },
      { x: -29.4, z: 20.6, look: 'patient', from: 'floor', delay: 2.0 }, { x: -31.4, z: 23.8, kind: 'runner', from: 'floor', delay: 5.5 }] },
    // cafeteria: the shield carrier's introduction, with two walkers to read his front against (tables to circle him round)
    { id: 'c7', sense: 7.0, zombies: [{ x: -15.0, z: 24.6, yaw: Math.PI, kind: 'guard' }, { x: -19.6, z: 23.4, yaw: 1.0 }, { x: -10.4, z: 23.2, yaw: -1.0, look: 'nurse' }] },
    // lift service: the big lady across the open bay from the cafeteria door (her lane runs at the door; switchgear and racks
    // along the walls to trip her into), one walker by the switchgear
    { id: 'p7', sense: 9.0, zombies: [{ x: 4.6, z: 21.0, yaw: -Math.PI / 2, kind: 'sprinter' }, { x: -4.4, z: 24.6, yaw: 0.6, look: 'patient' }] },
    // (2026-10-19) the staff toilets: one banging in a cubicle; the janitor closet: one among the linen
    { id: 'wc7', sense: 4.0, zombies: [{ x: -18.62, z: 3.45, yaw: Math.PI, look: 'patient' }] },
    { id: 'jn7', sense: 4.0, zombies: [{ x: -10.2, z: 2.6, yaw: 2.4, look: 'nurse' }] },
    // the contractor store (behind its powered door): two lurking by the shelves, roused when the door opens on them
    { id: 'x7', sense: 4.0, locked: true, zombies: [{ x: -19.4, z: 9.0, yaw: 0.8, look: 'nurse' }, { x: -10.0, z: 11.6, yaw: -2.2 }] },
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
    { id: 'n7shotgun', kind: 'weapon', weapon: 'shotgun', x: -32.4, z: -5.0, r: 1.1, mag: 6, label: 'Pump shotgun', file: 'zombie/assets/weapons/pump_short.glb', len: 0.9, rot: 0.3, y: 1.16 },
    { id: 'n7shells', kind: 'ammo', weapon: 'shotgun', rounds: 12, x: -27.6, z: -9.9, r: 1.0, label: 'Shotgun shells', model: 'shells' },
    { id: 't7crowbar', kind: 'weapon', weapon: 'crowbar', x: -32.2, z: 10.2, r: 1.1, label: 'Crowbar', file: 'zombie/assets/weapons/hospital/crowbar.glb', len: 0.8, rot: 1.1 },
    { id: 'v7ammo', kind: 'health', amount: 50, x: -37.6, z: 16.25, r: 1.1, label: 'First-aid case', model: 'aid', y: 0.92 },
    { id: 'v7sledge', kind: 'weapon', weapon: 'sledgehammer', x: -24.3, z: 18.3, r: 1.2, label: 'Sledgehammer', file: 'zombie/assets/weapons/sledgehammer.glb', len: 0.95, rot: 1.2, y: 0.05 }, // (beside the cracked wall it breaks)
    { id: 'c7knife', kind: 'weapon', weapon: 'knife', x: -13.2, z: 23.9, r: 1.1, label: 'Knife', builder: 'knife', len: 0.3, rot: 0.8, y: 0.85 },
    { id: 'c7shells', kind: 'ammo', weapon: 'shotgun', rounds: 12, x: -12.4, z: 17.4, r: 1.0, label: 'Shotgun shells', model: 'shells' },
    { id: 'p7mags', kind: 'ammo', weapon: 'pistol', rounds: 24, x: 0.6, z: 17.2, r: 1.0, label: 'Pistol magazines', model: 'mag' },
    { id: 'axe', kind: 'weapon', weapon: 'axe', x: -15.0, z: 9.4, r: 1.2, label: 'Fire axe', model: 'axe', y: 0.95 },
  ],
  interact: () => [
    { id: 'radio', x: -37.2, z: -8.4, r: 1.7, label: 'Answer the radio' },
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

// ================================================================================================ FLOOR 6: cold dispatch
// (2026-10-19, FLOORS_REDESIGN.html, the user: "floors six and five ... at least as big as floor seven ... hallway ... blocked
// off ... reception desk like in the middle", Floor 6's thing: oxygen tanks) The surgical ward floor at Floor 7's footprint:
// a main corridor across it, cut in three by a fire door barred from the middle (the way back) and a collapsed ceiling; the
// nurse station in the middle of the floor. The way there: the lobby -> the corridor's east end -> Ward 6B (the sledgehammer
// on a contractor's trolley; its west door jammed, the wall beside it cracked) -> the on-call offices -> the corridor's west
// end -> Bay 6A -> Cold Dispatch (the case). The other way: the corridor -> the sample lab -> sterile services -> Ward 6C
// works, the big lady: dodge her into its cracked west wall and she breaks through into Cold Dispatch. The way back: Bay 6A
// -> the nurse station -> the corridor's middle -> unbar the fire door -> the lobby.
const F6 = buildFloor(6, {
  rooms: [
    { id: 'o6', name: "On-call and Doctors' Offices", poly: [[120, 260], [470, 260], [470, 535], [120, 535]], floor: ['#efe2c8', '#d9c9a8'], ob: ['corridor', 'clinical'] },
    { id: 'w6', name: 'Ward 6B Surgical', poly: [[470, 260], [820, 260], [820, 535], [470, 535]], floor: ['#e9eedf', '#c8dcc4'], ob: ['corridor', 'clinical'] },
    { id: 'wc6', name: 'Toilets', poly: [[820, 260], [920, 260], [920, 535], [820, 535]], floor: ['#dfe7ea', '#b8c9cf'], ob: ['clinical', 'clinical'] },
    { id: 'jn6', name: 'Janitor and Linen', poly: [[920, 260], [1020, 260], [1020, 535], [920, 535]], floor: ['#c4c2b6', '#aeab9d'], ob: ['maintenance', 'maintenance'] },
    { id: 'e6', name: 'Lift Lobby 6', poly: [[1020, 260], [1319, 260], [1319, 535], [1020, 535]], floor: ['#e4d8bf', '#cfc4ab'], ob: ['corridor', 'clinical'] },
    { id: 'cw6', name: 'Main Corridor (west)', poly: [[120, 535], [470, 535], [470, 610], [120, 610]], floor: ['#e2ded3', '#cbc6b8'], ob: ['corridor', 'clinical'] },
    { id: 'cm6', name: 'Main Corridor', poly: [[470, 535], [770, 535], [770, 610], [470, 610]], floor: ['#e2ded3', '#cbc6b8'], ob: ['corridor', 'clinical'] },
    { id: 'ce6', name: 'Main Corridor (east)', poly: [[770, 535], [1319, 535], [1319, 610], [770, 610]], floor: ['#e2ded3', '#cbc6b8'], ob: ['corridor', 'clinical'] },
    { id: 'b6', name: 'Bay 6A Orthopaedic', poly: [[120, 610], [470, 610], [470, 935], [120, 935]], floor: ['#e2e8ea', '#bfd2da'], ob: ['corridor', 'clinical'] },
    { id: 'n6', name: 'Nurse Station', poly: [[470, 610], [970, 610], [970, 935], [470, 935]], floor: ['#f3e2bf', '#d9c294'], ob: ['corridor', 'clinical'] },
    { id: 'p6', name: 'Sample Prep Lab', poly: [[970, 610], [1319, 610], [1319, 935], [970, 935]], floor: ['#e2e8ea', '#bfd2da'], ob: ['clinical', 'clinical'] },
    { id: 'k6', name: 'Cold Dispatch', poly: [[120, 935], [470, 935], [470, 1240], [120, 1240]], floor: ['#e6eef2', '#c4d6e2'], ob: ['clinical', 'clinical'] },
    { id: 'a6', name: 'Ward 6C Conversion Works', poly: [[470, 935], [970, 935], [970, 1240], [470, 1240]], floor: ['#c4c2b6', '#aeab9d'], ob: ['maintenance', 'maintenance'] },
    { id: 's6', name: 'Sterile Services', poly: [[970, 935], [1319, 935], [1319, 1240], [970, 1240]], floor: ['#d9d6cc', '#c2c9c6'], ob: ['clinical', 'maintenance'] },
  ],
  doors: [
    { id: 'e6_ce6', o: 'h', c: 535, a: 1095, b: 1195 },
    { id: 'wc6_ce6', o: 'h', c: 535, a: 845, b: 895 },
    { id: 'jn6_ce6', o: 'h', c: 535, a: 945, b: 995 },
    { id: 'w6_ce6', o: 'h', c: 535, a: 775, b: 815 },
    { id: 'firedoor6', o: 'v', c: 770, a: 535, b: 610, kind: 'barred', face: 'w', side: 'w' }, // the fire door: barred from the middle (the way back)
    { id: 'w6_crack', o: 'v', c: 470, a: 322, b: 422, kind: 'cracked' }, // Ward 6B -> on-call: the wall beside the jammed door
    { id: 'w6_jam', o: 'v', c: 470, a: 440, b: 515, kind: 'closed', face: 'e' }, // (jammed shut)
    { id: 'o6_cw6', o: 'h', c: 535, a: 245, b: 320 },
    { id: 'collapse6', o: 'v', c: 470, a: 535, b: 610, kind: 'blocked' }, // the collapsed ceiling (west | middle corridor)
    { id: 'cw6_b6', o: 'h', c: 610, a: 245, b: 320 },
    { id: 'b6_k6', o: 'h', c: 935, a: 245, b: 320 },
    { id: 'b6_n6', o: 'v', c: 470, a: 735, b: 810 },
    { id: 'n6_cm6', o: 'h', c: 610, a: 595, b: 670 },
    { id: 'n6_glass', o: 'v', c: 970, a: 672, b: 872, kind: 'glass' }, // the lab's glass wall onto the nurse station
    { id: 'ce6_p6', o: 'h', c: 610, a: 1120, b: 1195 },
    { id: 'p6_s6', o: 'h', c: 935, a: 1120, b: 1195 },
    { id: 's6_a6', o: 'v', c: 970, a: 1047, b: 1122 },
    { id: 'a6_crack', o: 'v', c: 470, a: 1010, b: 1135, kind: 'cracked' }, // Ward 6C -> Cold Dispatch: the lady's wall
  ],
  dress({ p, wp, raw, sign, room, X, Z }) {
    const NP = SI, R13 = U + '13_restroom_fixtures/standard/13_standard_', C = { visitor: U + '09_assessment_furniture/runtime/visitor_chair_standard.glb', shelf: M + 'utility/Utility_Supply_Shelf.glb',
      cart: U + '08_support_equipment/runtime/supply_cart_standard.glb', counter: U + '09_assessment_furniture/runtime/prep_storage_standard.glb', desk: U + '09_assessment_furniture/runtime/consultation_desk_standard.glb',
      chair: U + '09_assessment_furniture/runtime/clinician_chair_standard.glb', lockers: U + '11_staff_lounge/standard/11_standard_lockers.glb' };
    const bed = (x, z, rot) => p(H + 'recovery_bed.glb', x, z, rot, [1.25, 2.11], 0.87);
    // E6 | LIFT LOBBY 6: the floor directory and a cooler by the lift, seats on the east wall facing the doors, the guard's
    // pistol and open bag where he and Yola parted (pickups); the way on is the corridor door in the south wall
    wp(H + 'lobby_t2_wayfinding.glb', 6.55, -91.0, 's', 1.45);
    wp(NP + 'fire_extinguisher.glb', -0.4, -91.0, 's', 0.6);
    p(H + 'floor_planter.glb', 6.7, -89.6, 270, [1.12, 0.5], 1.52);
    p(H + 'waiting_chair_section.glb', 6.45, -86.0, 270, [2.69, 0.97], 0.99);
    wp(H + 'reception_poster_clinician.glb', 6.95, -86.0, 'w', 1.3);
    p(H + 'water_cooler.glb', 6.7, -82.6, 270, [0.45, 0.49], 1.47);
    wp(H + 'wall_sanitizer.glb', 6.95, -83.6, 'w', 1.05);
    p(H + 'magazine_rack.glb', -4.4, -88.6, 90, [0.55, 0.43], 1.05);
    p(H + 'wheelchair.glb', -2.6, -86.2, 200, [0.76, 0.91], 0.97); // (abandoned by the lift)
    p(H + 'side_table.glb', -4.3, -84.0, 0, [0.74, 0.74], 0.55);
    sign('WARD 6B · DISPATCH', 'Main corridor ↓', -2.6, 2.3, -91.0, 's', 1.3);
    // JN6 | JANITOR AND LINEN: the mop sink and shelving on the camera wall, the cart, the linen; one resident among them
    p(U + '10_janitor_utility/standard/10_standard_utility_sink.glb', -7.75, -90.64, 0, [1.06, 0.7], 1.32);
    wp(U + '10_janitor_utility/standard/10_standard_wall_shelf.glb', -6.0, -91.0, 's', 1.45);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -5.25, -88.4, 270, [0.82, 0.51], 1.82);
    p(H + 'janitor_cart.glb', -7.9, -87.4, 0, [0.83, 0.99], 1.23);
    p(H + 'linen_cabinet.glb', -8.36, -84.4, 90, [0.95, 0.65], 1.84);
    p(H + 'mop_bucket.glb', -6.0, -84.6, 30, [0.46, 0.51], 0.65);
    p(H + 'laundry_hamper.glb', -5.3, -82.3, 0, [0.6, 0.57], 1.15);
    sign('JANITOR', '', -6.84, 2.3, -80.0, 's', 0.7);
    // WC6 | TOILETS: two cubicles on the camera wall, the wash stands down the east wall with their mirrors
    for (const cx of [-12.05, -10.8]) { p(R13 + 'cubicle.glb', cx, -90.34, 0, [1.24, 1.87], 2.01, { noCollide: true }); raw({ kind: 'collider', x: cx, z: -90.07, fp: [1.24, 1.82], h: 2.0 }); p(R13 + 'toilet.glb', cx, -90.72, 0, [0.5, 0.79], 1.04, { noCollide: true }); }
    for (const z of [-86.6, -85.2]) { p(R13 + 'washstand.glb', -9.3, z, 270, [1.18, 0.65], 1.22); wp(R13 + 'mirror.glb', -8.99, z, 'w', 1.25); }
    p(M + 'rooms/Restroom_Pedal_Bin.glb', -9.2, -83.9, 270, [0.37, 0.41], 0.66, { noCollide: true });
    p(H + 'wet_floor_sign.glb', -11.0, -82.6, -20, [0.48, 0.66], 0.64, { noCollide: true });
    sign('WC', '', -10.84, 2.3, -80.0, 's', 0.5);
    // W6 | WARD 6B (SURGICAL): beds heads-on to the camera wall (headwall, cabinet, a relative's chair), one dragged into the
    // aisle; the contractor's trolley with the sledgehammer by the corridor door; the jammed west door, and the cracked wall
    // beside it (its approach kept clear)
    for (const [i, bx] of [-23.4, -19.8, -16.2].entries()) {
      bed(bx, -89.95, 0);
      wp(H + 'service_headwall.glb', bx, -91.0, 's', 1.24);
      p(H + 'bedside_cabinet.glb', bx - 0.95, -90.55, 0, [0.52, 0.63], 0.81);
      p(C.visitor, bx + 0.95, -89.6, 270, [0.47, 0.47], 0.98, { noCollide: true });
      wp(H + (i % 2 ? 'recovery_bay_sign_02.glb' : 'recovery_bay_sign_01.glb'), bx, -91.0, 's', 2.05);
    }
    p(NP + 'over_bed_table.glb', -19.8, -88.0, 0, [0.8, 0.44], 1.08);
    wp(H + 'wall_exam_set.glb', -21.6, -91.0, 's', 1.25);
    wp(H + 'sharps_container.glb', -18.0, -91.0, 's', 1.2);
    wp(H + 'glove_dispenser.glb', -14.6, -91.0, 's', 1.25);
    wp(H + 'wall_clock.glb', -13.6, -91.0, 's', 1.95);
    bed(-19.6, -84.6, 25); // (dragged out of its bay)
    p(H + 'iv_stand.glb', -21.4, -85.6, 0, [0.73, 0.7], 2.03, { noCollide: true });
    raw({ kind: 'bench', x: -15.2, z: -83.0, size: [1.8, 0.7, 0.92], color: 0x8c7a5c, fp: [1.8, 0.7], h: 0.92, name: 'w6trolley' }); // the contractor's trolley (the sledgehammer on it)
    p('zombie/assets/props/sawhorse_barrier.glb', -24.6, -82.4, 90, [1.9, 0.73], 1.04);
    raw({ kind: 'hazard', x: -25.9, z: -86.65, size: [1.4, 4.0], noCollide: true, fp: [0.1, 0.1], h: 0 });
    sign('WARD 6B', 'Surgical inpatients', -20.0, 2.35, -91.0, 's', 1.3);
    sign('DOOR JAMMED', 'Use the corridor', -26.69, 2.48, -82.45, 'e', 1.0);
    // O6 | ON-CALL AND DOCTORS' OFFICES: two desks on the camera wall behind a glass screen, lockers, the on-call couch, a
    // coffee corner; tight between them
    for (const dx of [-38.6, -35.2]) {
      p(C.desk, dx, -90.6, 0, [1.5, 0.72], 0.81);
      raw({ m: H + 'desktop_computer.glb', x: dx, z: -90.7, rot: 0, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true });
      p(C.chair, dx, -89.7, 180, [0.6, 0.6], 1.0, { noCollide: true });
    }
    wp(H + 'assessment_status_board.glb', -36.9, -91.0, 's', 1.45);
    p(K + 'isolation_windowed_partition.glb', -33.2, -89.9, 90, [2.0, 0.15], 2.4);
    p(C.lockers, -31.6, -90.73, 0, [1.4, 0.53], 1.95);
    p(C.lockers, -30.2, -90.73, 0, [1.4, 0.53], 1.95);
    wp(H + 'wall_clock.glb', -28.8, -91.0, 's', 1.95);
    p(H + 'coffee_counter.glb', -28.3, -90.6, 0, [1.33, 0.81], 1.0);
    raw({ m: H + 'coffee_machine.glb', x: -28.6, z: -90.65, rot: 0, y: 1.0, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(H + 'sofa.glb', -40.38, -86.0, 90, [2.05, 0.6], 0.92);
    p(H + 'side_table.glb', -40.3, -83.9, 0, [0.74, 0.74], 0.55);
    p(H + 'armchair.glb', -38.4, -83.2, 0, [1.01, 0.65], 0.92);
    p(U + '09_assessment_furniture/runtime/examination_couch_standard.glb', -30.0, -84.6, 90, [0.8, 2.34], 0.9);
    p(H + 'laundry_hamper.glb', -27.4, -87.6, 0, [0.6, 0.57], 1.15);
    sign("ON-CALL · DOCTORS", 'Staff only', -33.2, 2.35, -91.0, 's', 1.2);
    // the corridors: chairs and a parked trolley on the north side, signs; the collapsed ceiling between west and middle, the
    // barred fire door between middle and east; loose oxygen cylinders by the cylinder store's door
    p(H + 'wheelchair.glb', -39.6, -79.6, 90, [0.76, 0.91], 0.97);
    p(H + 'waiting_chair_section.glb', -30.4, -79.6, 0, [2.69, 0.97], 0.99);
    p(NP + 'ceiling_collapse.glb', -26.84, -78.65, 90, [3.0, 2.2], 1.4); // (the collapse: rubble, a fallen ceiling grid, a cable tray hanging)
    p(H + 'procedure_stretcher.glb', -22.4, -79.6, 90, [0.9, 1.66], 1.22);
    wp(NP + 'fire_extinguisher.glb', -17.6, -80.0, 's', 0.6);
    sign('FIRE DOOR', 'Lift the bar from this side', -16.4, 2.2, -80.0, 's', 1.0);
    p(H + 'waiting_chair_section.glb', -3.85, -79.6, 0, [2.69, 0.97], 0.99); // (between the janitor's door and the lobby's)
    p(H + 'linen_cabinet.glb', 5.8, -79.73, 0, [0.95, 0.65], 1.84);
    sign('← WARD 6B · OFFICES', 'Dispatch via Bay 6A', 4.6, 2.2, -80.0, 's', 1.4);
    // B6 | BAY 6A ORTHOPAEDIC: four traction beds heads-on to the camera wall (their overhead frames, weights hanging), a
    // monitor between; the lane from the corridor door down to dispatch kept open
    for (const bx of [-39.4, -37.4, -30.6, -28.5]) {
      bed(bx, -75.95, 0);
      p(NP + 'traction_frame.glb', bx, -75.95, 0, [1.0, 2.2], 2.2, { noCollide: true });
      wp(H + 'service_headwall.glb', bx, -77.0, 's', 1.24);
    }
    p(H + 'patient_monitor.glb', -36.3, -76.6, 0, [0.62, 0.71], 1.49);
    p(H + 'iv_stand.glb', -29.5, -74.2, 0, [0.73, 0.7], 2.03, { noCollide: true });
    wp(H + 'clinical_art_lungs.glb', -40.69, -70.4, 'e', 1.2);
    p(H + 'wheelchair.glb', -40.2, -67.6, 90, [0.76, 0.91], 0.97);
    p(H + 'procedure_stretcher.glb', -28.6, -66.6, 0, [0.9, 1.66], 1.22);
    sign('BAY 6A', 'Orthopaedic', -34.3, 2.45, -77.0, 's', 1.0);
    // N6 | THE NURSE STATION (the floor's heart): the central desk to circle, its counters facing out, a charting island; the
    // camera wall's board, clocks and cabinets; the lab's glass wall on the east side
    p(H + 'reception_desk.glb', -16.84, -71.6, 180, [2.2, 0.9], 1.3, { name: 'n6desk' });
    p(H + 'reception_desk.glb', -16.84, -69.7, 0, [2.2, 0.9], 1.3);
    p(H + 'team_desk.glb', -18.6, -70.65, 90, [1.13, 0.74], 1.16);
    p(H + 'team_desk.glb', -15.08, -70.65, 270, [1.13, 0.74], 1.16);
    raw({ m: H + 'desktop_computer.glb', x: -16.4, z: -71.7, rot: 180, y: 1.1, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: H + 'desktop_computer.glb', x: -17.3, z: -69.6, rot: 0, y: 1.1, fp: [0.1, 0.1], h: 0, noCollide: true });
    wp(H + 'assessment_status_board.glb', -24.6, -77.0, 's', 1.45);
    wp(H + 'team_wall_station.glb', -16.4, -77.0, 's', 0.75);
    wp(H + 'wall_clock.glb', -14.6, -77.0, 's', 1.95);
    p(H + 'linen_cabinet.glb', -12.6, -76.68, 0, [0.95, 0.65], 1.84);
    p(K + 'pharmacy_medicine_shelf.glb', -10.8, -76.73, 0, [1.39, 0.53], 1.95);
    p(K + 'pharmacy_locked_cupboard.glb', -9.2, -76.75, 0, [0.9, 0.5], 1.9);
    p(H + 'charting_workstation.glb', -23.6, -76.69, 0, [0.83, 0.62], 1.47);
    for (const gz of [-73.65, -71.65, -69.65, -67.65]) p(K + 'isolation_windowed_partition.glb', -6.84, gz, 90, [2.0, 0.15], 2.4);
    p(H + 'wheelchair.glb', -24.6, -65.0, 160, [0.76, 0.91], 0.97);
    p(H + 'waiting_chair_section.glb', -11.6, -64.7, 180, [2.69, 0.97], 0.99);
    sign('NURSE STATION', 'Floor 6', -20.6, 2.45, -77.0, 's', 1.2);
    // P6 | SAMPLE PREP LAB: benches with a centrifuge, a microscope and sample racks on the camera wall, the sink, an island
    p(H + 'prep_counter.glb', -5.4, -76.64, 0, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_centrifuge.glb', x: -5.75, z: -76.64, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: K + 'lab_microscope.glb', x: -5.0, z: -76.64, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(H + 'prep_counter.glb', -3.8, -76.64, 0, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_sample_rack.glb', x: -3.8, z: -76.6, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    wp(H + 'wall_cupboard.glb', -5.4, -77.0, 's', 1.45);
    p(H + 'handwash_cabinet_base.glb', 3.4, -76.64, 0, [0.51, 0.7], 0.77);
    wp(H + 'handwash_basin.glb', 3.4, -77.0, 's', 0.77);
    p(H + 'prep_counter.glb', 5.3, -76.64, 0, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_sample_rack.glb', x: 5.3, z: -76.6, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    wp(H + 'clinical_art_preparation_checklist.glb', 4.4, -77.0, 's', 1.0);
    p(H + 'prep_counter.glb', 1.6, -70.4, 0, [1.51, 0.69], 1.06);
    p(H + 'prep_counter.glb', 1.6, -69.71, 180, [1.51, 0.69], 1.06);
    p(H + 'charting_workstation.glb', 6.66, -71.0, 270, [0.83, 0.62], 1.47);
    p(H + 'biohazard_bin.glb', 6.8, -67.0, 0, [0.39, 0.39], 0.69);
    room('lab', -4.6, 2.38, -77.0, 's', 1.2);
    // S6 | STERILE SERVICES: the washer-disinfectors and the scope cabinets on the camera wall, the instrument tray shelving,
    // packing benches; the cylinder store's cylinders along the east wall (loose: they burst)
    p(H + 'utility_sink.glb', -5.6, -63.74, 0, [0.88, 0.51], 1.64);
    p(H + 'scopeair_vitadock.glb', -4.4, -63.64, 0, [0.98, 0.6], 1.67);
    p(H + 'scopeair_vitadock.glb', -3.3, -63.64, 0, [0.98, 0.6], 1.67);
    p(C.shelf, 3.6, -63.72, 0, [1.39, 0.56], 2.0);
    p(C.shelf, 5.1, -63.72, 0, [1.39, 0.56], 2.0);
    p(H + 'prep_storage.glb', -3.4, -54.4, 0, [1.51, 0.72], 1.09);
    p(H + 'prep_storage.glb', -3.4, -53.68, 180, [1.51, 0.72], 1.09);
    p(H + 'storage_bins.glb', -5.9, -52.5, 0, [1.05, 0.3], 0.28, { noCollide: true });
    p(C.cart, 4.4, -53.2, 0, [1.16, 1.1], 1.21);
    sign('STERILE SERVICES', 'Decontamination', 0.4, 2.4, -64.0, 's', 1.4);
    sign('O₂ STORE', 'No naked flames', 6.97, 2.1, -59.8, 'w', 0.9);
    // K6 | COLD DISPATCH (calm): specimen fridges, the dispatch counter with the sealed case on the camera wall (CASE_HOME),
    // the tube station, courier coolers; the cracked east wall and its approach kept clear
    p(NP + 'specimen_fridge.glb', -40.1, -63.62, 0, [0.75, 0.76], 1.9);
    p(NP + 'specimen_fridge.glb', -39.25, -63.62, 0, [0.75, 0.76], 1.9);
    p(C.counter, -30.0, -63.64, 0, [1.51, 0.72], 1.09, { name: 'k6table' });
    wp(H + 'assessment_status_board.glb', -30.0, -64.0, 's', 1.5);
    wp(NP + 'pneumatic_tube_station.glb', -31.4, -64.0, 's', 0.75);
    p(NP + 'courier_coolers.glb', -37.6, -63.8, 0, [0.64, 0.44], 0.94);
    p(C.shelf, -40.36, -58.4, 90, [1.39, 0.56], 2.0);
    p(C.shelf, -40.36, -56.9, 90, [1.39, 0.56], 2.0);
    wp(H + 'wall_clock.glb', -28.3, -64.0, 's', 1.95);
    p(C.cart, -36.0, -53.2, 0, [1.16, 1.1], 1.21);
    sign('COLD DISPATCH', 'Specimen hold', -38.4, 2.4, -64.0, 's', 1.2);
    // A6 | WARD 6C CONVERSION WORKS: the old ward under dust sheets, a scaffold tower and the bench on the camera wall, stud
    // framing, a pallet; the big lady's lane (z -61 to -56, east to the cracked west wall) stays open
    p(NP + 'dust_sheet_furniture.glb', -23.6, -63.4, 0, [1.88, 1.23], 1.07);
    p(NP + 'scaffold_tower.glb', -19.0, -63.55, 0, [1.82, 0.77], 2.4);
    p(SI + 'standin_cable_workbench.glb', -15.2, -63.6, 0, [1.8, 0.76], 0.92);
    p(SI + 'standin_tool_pegboard.glb', -15.2, -64.0, 180, [1.26, 0.06], 0.94, { y: 1.05, noCollide: true });
    p(SI + 'standin_paint_shelf.glb', -11.4, -63.74, 0, [1.19, 0.44], 1.81);
    p(NP + 'dust_sheet_small.glb', -9.0, -63.4, 0, [1.39, 0.92], 0.94);
    p(NP + 'stud_wall_frame.glb', -21.0, -54.0, 0, [0.12, 3.6], 2.6);
    p('zombie/assets/props/drywall_pallet.glb', -14.6, -53.2, 0, [1.41, 1.69], 0.45);
    p(SI + 'standin_renovation_pallet.glb', -10.6, -53.0, 0, [1.25, 1.02], 0.61);
    raw({ kind: 'hazard', x: -25.9, z: -58.65, size: [1.4, 5.0], noCollide: true, fp: [0.1, 0.1], h: 0 }); // (where a dodge sends her charge into the cracked wall)
    sign('WARD 6C · CONVERSION', 'Contractors only', -17.0, 2.45, -64.0, 's', 1.4);
    sign('TEMPORARY WALL', 'Weak · keep clear', -26.69, 2.3, -54.6, 'e', 1.0);
    // (the dressing pass, 2026-10-19: every room as full as Floor 7's; the lanes, the doorways and the cracked walls'
    // approaches stay clear)
    const box = (x, z, w, d, h, c = 0xa38f6c, face = 's') => raw({ kind: 'box', x, z, size: [w, d, h], face, color: c, fp: [w, d], h });
    // K6: a packing table in the middle, a fridge on the west wall, cool boxes waiting on the floor, a roll cage
    p(H + 'prep_counter.glb', -34.6, -58.8, 0, [1.51, 0.69], 1.06);
    p(H + 'prep_counter.glb', -34.6, -58.11, 180, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_sample_rack.glb', x: -34.9, z: -58.8, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(NP + 'specimen_fridge.glb', -40.3, -61.6, 90, [0.75, 0.76], 1.9);
    p(NP + 'courier_coolers.glb', -38.6, -55.0, 20, [0.64, 0.44], 0.94);
    p(NP + 'courier_coolers.glb', -31.6, -53.0, -10, [0.64, 0.44], 0.94);
    p(C.shelf, -33.0, -52.38, 0, [1.39, 0.56], 2.0);
    box(-29.2, -52.6, 0.8, 0.6, 0.6); box(-29.0, -53.4, 0.6, 0.5, 0.45, 0xb8a27a);
    p(H + 'biohazard_bin.glb', -40.4, -52.4, 0, [0.39, 0.39], 0.69);
    // P6: a second island with stools, a fridge and the locked cupboard on the east wall, the lab manager's desk
    p(H + 'prep_counter.glb', -2.6, -70.4, 0, [1.51, 0.69], 1.06);
    p(H + 'prep_counter.glb', -2.6, -69.71, 180, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_microscope.glb', x: -2.9, z: -70.4, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: K + 'lab_centrifuge.glb', x: 1.3, z: -69.7, rot: 180, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    for (const [x, z] of [[-3.2, -68.9], [-2.0, -68.9], [1.0, -68.9], [2.2, -68.9]]) p(H + 'team_stool.glb', x, z, 0, [0.36, 0.34], 0.5, { noCollide: true });
    p(NP + 'specimen_fridge.glb', 6.58, -74.4, 270, [0.75, 0.76], 1.9);
    p(K + 'pharmacy_locked_cupboard.glb', 6.7, -72.6, 270, [0.9, 0.5], 1.9);
    p(C.desk, 4.6, -65.0, 180, [1.5, 0.72], 0.81);
    raw({ m: H + 'desktop_computer.glb', x: 4.6, z: -64.9, rot: 180, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(H + 'laundry_hamper.glb', -6.3, -64.8, 0, [0.6, 0.57], 1.15);
    // S6: tray shelving in rows on the east side, the washer line extended, trolleys of dirty instruments
    for (const z of [-57.4, -55.9, -54.4]) p(C.shelf, 3.8, z, 90, [1.39, 0.56], 2.0);
    p(H + 'utility_sink.glb', -6.4, -61.4, 90, [0.88, 0.51], 1.64);
    p(H + 'supply_cart.glb', 0.4, -53.0, 0, [1.16, 1.1], 1.23);
    p(H + 'procedure_stretcher.glb', -5.9, -56.0, 0, [0.9, 1.66], 1.22);
    p(H + 'biohazard_bin.glb', 6.8, -52.4, 0, [0.39, 0.39], 0.69);
    p(H + 'lidded_waste_bin.glb', 6.3, -52.4, 0, [0.36, 0.4], 0.58);
    // A6: more of the works along the walls: a second scaffold, sawhorses, crates, cable reels, a bed under a sheet
    p(NP + 'scaffold_tower.glb', -25.0, -52.85, 0, [1.82, 0.77], 2.4);
    p('zombie/assets/props/sawhorse_barrier.glb', -17.4, -52.5, 0, [1.9, 0.73], 1.04);
    p(NP + 'dust_sheet_furniture.glb', -7.9, -53.0, 90, [1.88, 1.23], 1.07);
    box(-21.6, -63.6, 0.9, 0.7, 0.7); box(-12.8, -52.6, 0.8, 0.6, 0.5, 0xb8a27a); box(-12.0, -52.5, 0.5, 0.5, 0.9, 0x6f7a7f);
    raw({ kind: 'pipes', x: -16.8, z: -64.0, len: 14.0, y: 2.3, noCollide: true, fp: [0.1, 0.1], h: 0 });
    // N6: a medicines trolley and charts by the desk (its circuit kept clear), IV stands, bins, waiting chairs west
    p(H + 'supply_cart.glb', -21.8, -72.6, 90, [1.16, 1.1], 1.23);
    p(H + 'iv_stand.glb', -11.6, -71.8, 0, [0.73, 0.7], 2.03, { noCollide: true });
    p(H + 'iv_stand.glb', -22.2, -68.6, 0, [0.73, 0.7], 2.03, { noCollide: true });
    p(H + 'waiting_chair_section.glb', -26.2, -74.6, 90, [2.69, 0.97], 0.99);
    p(H + 'lidded_waste_bin.glb', -9.4, -64.6, 0, [0.36, 0.4], 0.58);
    p(H + 'procedure_stretcher.glb', -8.2, -69.4, 0, [0.9, 1.66], 1.22);
    p(H + 'magazine_rack.glb', -26.4, -66.4, 90, [0.55, 0.43], 1.05);
    // B6: cabinets between the traction beds, a frame-parts trolley, a hamper
    for (const x of [-38.4, -29.55]) p(H + 'bedside_cabinet.glb', x, -76.6, 0, [0.52, 0.63], 0.81);
    p(H + 'supply_cart.glb', -40.2, -71.0, 90, [1.16, 1.1], 1.23);
    p(H + 'laundry_hamper.glb', -27.3, -73.9, 0, [0.6, 0.57], 1.15);
    p(H + 'bedside_cabinet.glb', -27.3, -66.3, 270, [0.52, 0.63], 0.81);
    // the corridors: benches, a trolley and a cleaning cart left mid-shift
    p(H + 'waiting_chair_section.glb', -36.6, -79.6, 0, [2.69, 0.97], 0.99);
    p(H + 'janitor_cart.glb', -24.0, -77.75, 90, [0.83, 0.99], 1.23);
    p(H + 'wheelchair.glb', 2.6, -77.7, 250, [0.76, 0.91], 0.97);
    room('elevator', X(1214) - 3.3, 2.75, -91.0, 's', 1.1);
  },
  groups: (Z) => [
    // the corridor's east end: the first wheelchair with a cylinder on its back, and a walker by the store
    { id: 'ce6', sense: 7.0, zombies: [{ x: -9.6, z: -78.6, yaw: Math.PI / 2, kind: 'o2chair', look: 'patient' }, { x: 4.6, z: -78.3, yaw: -1.4 }] },
    // Ward 6B: the first fight (and its bed patients): walkers between the beds, an old one dragging a cylinder
    { id: 'w6', sense: 6.5, zombies: [{ x: -21.6, z: -82.6, yaw: 1.0, look: 'nurse' }, { x: -17.4, z: -86.2, yaw: -0.6, kind: 'o2walker', look: 'patient' }, { x: -24.4, z: -85.0, yaw: 0.6 }] },
    // the offices: three in a tight space
    { id: 'o6', sense: 5.5, zombies: [{ x: -37.0, z: -86.6, yaw: 0.8, look: 'nurse', prop: 'surgeon' }, { x: -31.4, z: -86.4, yaw: -0.8 }, { x: -35.0, z: -82.4, yaw: 2.6, look: 'patient' }] },
    // Bay 6A: a cylinder walker, a crawler between the beds, a walker by the dispatch door
    { id: 'b6', sense: 6.0, zombies: [{ x: -33.4, z: -71.6, yaw: 0.3, kind: 'o2walker', look: 'patient' }, { x: -38.0, z: -71.4, yaw: 1.2, crawl: true }, { x: -30.6, z: -67.6, yaw: -2.2, look: 'nurse' }] },
    // dispatch: one in the cold
    { id: 'k6', sense: 5.0, zombies: [{ x: -36.6, z: -56.4, yaw: 0.6, look: 'nurse' }] },
    // the nurse station: the heart's fight on the way back: two cylinder chairs either side of the desk, a runner, walkers,
    // one out of the floor
    { id: 'n6', sense: 7.0, zombies: [{ x: -24.2, z: -66.6, yaw: 0.6, kind: 'o2chair', look: 'patient' }, { x: -9.8, z: -66.2, yaw: -0.8, kind: 'o2chair' }, { x: -20.8, z: -74.4, yaw: 2.0, kind: 'runner' },
      { x: -12.6, z: -74.0, yaw: -2.2, look: 'nurse' }, { x: -16.8, z: -66.6, yaw: 3.0, look: 'patient' }, { x: -13.6, z: -68.4, look: 'nurse', from: 'floor', delay: 3.0 }] },
    { id: 'p6', sense: 5.5, zombies: [{ x: -3.4, z: -72.6, yaw: 0.6, look: 'nurse' }, { x: 4.4, z: -67.6, yaw: -2.0 }] },
    { id: 's6', sense: 6.0, zombies: [{ x: 2.6, z: -56.4, yaw: -1.6, kind: 'o2walker', look: 'patient' }, { x: -3.6, z: -55.2, yaw: 2.2 }] },
    // Ward 6C works: the big lady at the east end, her lane running west at the cracked wall; one walker by the pallets
    { id: 'a6', sense: 9.0, zombies: [{ x: -9.4, z: -58.65, yaw: -Math.PI / 2, kind: 'sprinter' }, { x: -19.6, z: -54.6, yaw: 1.4 }] },
    { id: 'wc6', sense: 3.5, zombies: [{ x: -10.8, z: -88.0, yaw: Math.PI, look: 'patient' }] },
    { id: 'jn6', sense: 3.5, zombies: [{ x: -6.6, z: -86.2, yaw: 2.6, look: 'nurse' }] },
  ],
  pickups: (Z) => [
    // the guard's pistol and his open bag in the lobby, where he and Yola parted before the call (no body: he went on down)
    { id: 'pistol', kind: 'weapon', weapon: 'pistol', x: -3.2, z: -83.4, r: 1.1, mag: 12, label: 'The guard’s pistol', model: 'pistol' },
    { id: 'ammo', kind: 'ammo', weapon: 'pistol', rounds: 24, x: -2.4, z: -82.8, r: 1.0, label: 'Guard’s bag: spare rounds', model: 'bag' },
    { id: 'w6sledge', kind: 'weapon', weapon: 'sledgehammer', x: -15.2, z: -83.0, r: 1.2, label: 'Sledgehammer', file: 'zombie/assets/weapons/sledgehammer.glb', len: 0.95, rot: 0.3, y: 0.95 },
    { id: 'p6aid', kind: 'health', amount: 40, x: 1.6, z: -70.4, r: 1.0, label: 'First-aid case', model: 'aid', y: 1.06 },
    { id: 'n6shells', kind: 'ammo', weapon: 'shotgun', rounds: 12, x: -16.84, z: -69.7, r: 1.2, label: 'Shotgun shells', model: 'shells', y: 1.3 },
    { id: 'k6aid', kind: 'health', amount: 30, x: -36.0, z: -53.2, r: 1.0, label: 'First-aid case', model: 'aid', y: 1.21 },
  ],
  interact: (Z) => [
    { id: 'bar:firedoor6', x: -15.8, z: -78.65, r: 1.6, side: { axis: 'x', max: -14.84 }, label: 'Lift the bar' },
  ],
  lights: (Z) => [{ x: X(1214), y: 2.3, z: -88.6 }, { x: -16.8, y: 2.4, z: -70.6 }, { x: -33.6, y: 2.4, z: -58.0 }],
  blood: (Z) => [
    { kind: 'drag', x: -0.4, z: -81.4, w: 0.7, l: 1.6, rot: 30 },
    { kind: 'splat', x: -20.4, z: -86.8, w: 1.0, l: 1.0, rot: -15 },
    { kind: 'hand', x: -26.69, z: -87.6, wall: 'e', y: 1.15, size: 0.32, tilt: 4 },
    { kind: 'drag', x: -34.3, z: -72.0, w: 0.55, l: 1.0, rot: 80 },
    { kind: 'splat', x: -12.0, z: -67.0, w: 0.9, l: 0.9, rot: 25 },
    { kind: 'splat', x: 1.8, z: -56.0, w: 1.1, l: 1.1, rot: 60 },
  ],
  tanks: (Z) => [[-11.0, -77.6], [-10.6, -77.7], [-23.4, -65.2], [6.6, -60.6], [6.6, -60.1], [6.62, -59.6], [6.6, -59.1]],
  start: (Z) => ({ x: LIFTS[6].x, z: LIFTS[6].z + 1.2, yaw: 0 }),
});

// ================================================================================================ FLOOR 5: match the sample
// (2026-10-19, FLOORS_REDESIGN.html, the user's picks: the MRI arena and the flood) One loop through the floor, every room
// new, at Floor 7's footprint: the lobby -> Diagnostic Intake (the case is secured here) -> the Main Reception (the round
// desk in the middle of a big waiting hall) -> the flooded Isolation Ward (ankle-deep water slows everyone; its sparking
// panel, hit, fries everything standing in it) -> Medical Records (the record) -> Imaging (the big lady's straight lane) ->
// the MRI Arena (the magnet tears her guns away and the guard's shield off; the big red button shuts it down once the room
// is clear) -> Radiology Reading -> back to Intake: the match, the case, the lift. Optional: the Pathology Lab behind a
// cracked wall in the flooded ward; the staff toilets and janitor off the ward, public toilets off the reception.
const F5 = buildFloor(5, {
  rooms: [
    { id: 'wt5', name: 'Staff Toilets', poly: [[120, 260], [295, 260], [295, 410], [120, 410]], floor: ['#dfe7ea', '#b8c9cf'], ob: ['clinical', 'clinical'] },
    { id: 'jn5', name: 'Janitor', poly: [[295, 260], [495, 260], [495, 410], [295, 410]], floor: ['#c4c2b6', '#aeab9d'], ob: ['maintenance', 'maintenance'] },
    { id: 'pa5', name: 'Pathology Lab', poly: [[495, 260], [1020, 260], [1020, 535], [495, 535]], floor: ['#e2e8ea', '#bfd2da'], ob: ['clinical', 'clinical'] },
    { id: 'e5', name: 'Lift Lobby 5', poly: [[1020, 260], [1319, 260], [1319, 535], [1020, 535]], floor: ['#e4d8bf', '#cfc4ab'], ob: ['corridor', 'clinical'] },
    { id: 'w5', name: 'Isolation Ward (flooded)', poly: [[120, 410], [495, 410], [495, 960], [120, 960]], floor: ['#e9eedf', '#c8dcc4'], ob: ['corridor', 'clinical'] },
    { id: 'h5', name: 'Main Reception', poly: [[495, 535], [1020, 535], [1020, 1035], [495, 1035]], floor: ['#f3e2bf', '#d9c294'], ob: ['corridor', 'clinical'] },
    { id: 'i5', name: 'Diagnostic Intake', poly: [[1020, 535], [1319, 535], [1319, 785], [1020, 785]], floor: ['#e6eef2', '#c4d6e2'], ob: ['clinical', 'clinical'] },
    { id: 'pt5', name: 'Public Toilets', poly: [[1020, 785], [1145, 785], [1145, 1010], [1020, 1010]], floor: ['#dfe7ea', '#b8c9cf'], ob: ['clinical', 'clinical'] },
    { id: 'rr5', name: 'Radiology Reading', poly: [[1145, 785], [1319, 785], [1319, 1010], [1145, 1010]], floor: ['#e2e8ea', '#bfd2da'], ob: ['clinical', 'clinical'] },
    { id: 'r5', name: 'Medical Records', poly: [[120, 960], [495, 960], [495, 1240], [120, 1240]], floor: ['#e2e8ea', '#bfd2da'], ob: ['clinical', 'clinical'] },
    { id: 'x5', name: 'Imaging', poly: [[495, 1035], [1020, 1035], [1020, 1240], [495, 1240]], floor: ['#c9c4b8', '#b3ad9f'], ob: ['maintenance', 'clinical'] },
    { id: 'm5', name: 'MRI Arena', poly: [[1020, 1010], [1319, 1010], [1319, 1240], [1020, 1240]], floor: ['#dfe6ee', '#b9c7d6'], ob: ['clinical', 'clinical'] },
  ],
  doors: [
    { id: 'e5_i5', o: 'h', c: 535, a: 1120, b: 1220 },
    { id: 'i5_h5', o: 'v', c: 1020, a: 597, b: 685 },
    { id: 'h5_pt5', o: 'v', c: 1020, a: 822, b: 885 },
    { id: 'i5_rr5', o: 'h', c: 785, a: 1195, b: 1270 },
    { id: 'rr5_m5', o: 'h', c: 1010, a: 1195, b: 1270 },
    { id: 'x5_m5', o: 'v', c: 1020, a: 1085, b: 1172 },
    { id: 'r5_x5', o: 'v', c: 495, a: 1085, b: 1172 },
    { id: 'h5_w5', o: 'v', c: 495, a: 747, b: 835 },
    { id: 'w5_r5', o: 'h', c: 960, a: 245, b: 332 },
    { id: 'w5_wt5', o: 'h', c: 410, a: 170, b: 245 },
    { id: 'w5_jn5', o: 'h', c: 410, a: 357, b: 432 },
    { id: 'pa5_crack', o: 'v', c: 495, a: 435, b: 510, kind: 'cracked' }, // the flooded ward -> the pathology lab (optional)
  ],
  dress({ p, wp, raw, sign, room, X, Z }) {
    const NP = SI, R13 = U + '13_restroom_fixtures/standard/13_standard_', C = { shelf: M + 'utility/Utility_Supply_Shelf.glb', counter: U + '09_assessment_furniture/runtime/prep_storage_standard.glb',
      desk: U + '09_assessment_furniture/runtime/consultation_desk_standard.glb', chair: U + '09_assessment_furniture/runtime/clinician_chair_standard.glb',
      station: U + '08_support_equipment/runtime/workstation_standard.glb', seats: M + 'decor/Reception_Linked_Seats_3.glb' };
    // E5 | LIFT LOBBY 5: the floor directory, seats and a cooler on the east wall; the intake door in the south wall
    wp(H + 'lobby_t2_wayfinding.glb', 6.55, -171.0, 's', 1.45);
    p(H + 'floor_planter.glb', 6.7, -169.6, 270, [1.12, 0.5], 1.52);
    p(H + 'waiting_chair_section.glb', 6.45, -166.0, 270, [2.69, 0.97], 0.99);
    p(H + 'water_cooler.glb', 6.7, -162.6, 270, [0.45, 0.49], 1.47);
    wp(NP + 'fire_extinguisher.glb', -4.69, -166.0, 'e', 0.6);
    wp(H + 'wall_sanitizer.glb', 6.95, -164.0, 'w', 1.05);
    p(H + 'wheelchair.glb', -3.0, -164.0, 160, [0.76, 0.91], 0.97);
    sign('DIAGNOSTIC INTAKE ↓', 'Main reception · imaging', -2.6, 2.3, -171.0, 's', 1.4);
    // I5 | DIAGNOSTIC INTAKE (the safe pocket): the intake station that takes the case (lamps IntakeLampAmber / Green)
    // between specimen fridges on the camera wall, the lab bench, the tube station; a sample-reception desk on the east side
    p(NP + 'specimen_fridge.glb', -4.3, -159.62, 0, [0.75, 0.76], 1.9);
    p(NP + 'intake_station.glb', -3.2, -159.65, 0, [1.04, 0.7], 1.55, { name: 'intake' }); // (INTAKE_SPOT follows its tray)
    wp(H + 'glove_dispenser.glb', -2.3, -160.0, 's', 1.3);
    p(C.counter, 4.6, -159.67, 0, [1.51, 0.66], 1.09);
    raw({ m: K + 'lab_centrifuge.glb', x: 4.25, z: -159.67, rot: 0, y: 1.09, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: K + 'lab_microscope.glb', x: 5.0, z: -159.67, rot: 0, y: 1.09, fp: [0.1, 0.1], h: 0, noCollide: true });
    wp(NP + 'pneumatic_tube_station.glb', 6.1, -160.0, 's', 0.75);
    p(C.station, 6.66, -156.6, 270, [0.83, 0.62], 1.47);
    p(C.desk, 5.6, -152.6, 270, [1.5, 0.72], 0.81);
    p(C.chair, 4.7, -152.6, 90, [0.6, 0.6], 1.0, { noCollide: true });
    p(K + 'pharmacy_medicine_shelf.glb', -4.43, -152.6, 90, [1.39, 0.53], 1.95);
    wp(H + 'wall_clock.glb', 3.4, -160.0, 's', 1.95);
    room('lab', 4.6, 2.62, -160.0, 's', 1.1);
    // PA5 | PATHOLOGY LAB (behind the cracked wall: optional, its stock untouched): benches with microscopes and racks on the
    // camera wall, fridges, a cut-up bench, an island; shells and a med case for whoever breaks in
    for (const [bx, k] of [[-22.8, 'lab_microscope'], [-21.2, 'lab_sample_rack'], [-16.4, 'lab_centrifuge'], [-14.8, 'lab_microscope']]) {
      p(H + 'prep_counter.glb', bx, -170.64, 0, [1.51, 0.69], 1.06);
      raw({ m: K + k + '.glb', x: bx, z: -170.64, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    }
    wp(H + 'wall_cupboard.glb', -22.0, -171.0, 's', 1.45);
    wp(H + 'clinical_art_digestive.glb', -18.8, -171.0, 's', 1.3);
    p(NP + 'specimen_fridge.glb', -12.6, -170.62, 0, [0.75, 0.76], 1.9);
    p(NP + 'specimen_fridge.glb', -11.75, -170.62, 0, [0.75, 0.76], 1.9);
    p(H + 'utility_sink.glb', -9.6, -170.74, 0, [0.88, 0.51], 1.64);
    wp(H + 'wall_clock.glb', -7.6, -171.0, 's', 1.95);
    p(H + 'operating_table.glb', -15.6, -165.6, 90, [0.78, 1.65], 0.94); // (the cut-up table)
    p(H + 'prep_counter.glb', -9.6, -165.2, 0, [1.51, 0.69], 1.06);
    p(H + 'prep_counter.glb', -9.6, -164.51, 180, [1.51, 0.69], 1.06);
    p(H + 'biohazard_bin.glb', -5.4, -160.6, 0, [0.39, 0.39], 0.69);
    sign('PATHOLOGY', 'Authorised staff', -18.8, 2.45, -171.0, 's', 1.2);
    // W5 | ISOLATION WARD (FLOODED): burst pipes along the camera wall, isolation bays down the west wall behind glass, the
    // PPE station; ankle-deep water over all of it (core/rooms.js flood), its sparking panel by the reception door
    raw({ kind: 'pipes', x: -32.0, z: -165.0, len: 12.0, y: 2.25, noCollide: true, fp: [0.1, 0.1], h: 0 });
    for (const bz of [-161.4, -156.6, -151.8]) {
      p(H + 'recovery_bed.glb', -39.63, bz, 90, [1.25, 2.11], 0.87);
      wp(H + 'service_headwall.glb', -40.69, bz, 'e', 1.24);
      p(H + 'patient_monitor.glb', -40.3, bz - 1.15, 90, [0.62, 0.71], 1.49);
    }
    for (const bz of [-159.0, -154.2, -149.4]) p(K + 'isolation_windowed_partition.glb', -39.3, bz, 0, [2.0, 0.15], 2.4);
    wp(K + 'isolation_ppe_sign.glb', -40.69, -147.0, 'e', 1.8);
    p(NP + 'ppe_trolley.glb', -30.6, -164.6, 0, [0.87, 0.57], 1.26);
    p(H + 'laundry_hamper.glb', -27.2, -164.6, 0, [0.6, 0.57], 1.15);
    p(H + 'wheelchair.glb', -33.0, -152.4, 70, [0.76, 0.91], 0.97);
    p(H + 'procedure_stretcher.glb', -30.4, -146.6, 15, [0.9, 1.66], 1.22);
    p(H + 'wet_floor_sign.glb', -27.4, -147.0, 0, [0.48, 0.66], 0.64, { noCollide: true });
    p(H + 'wet_floor_sign.glb', -27.6, -152.6, 30, [0.48, 0.66], 0.64, { noCollide: true });
    sign('ISOLATION', 'Gown and glove', -34.6, 2.4, -165.0, 's', 1.2);
    sign('DANGER', 'Live panel · standing water', -25.69, 2.0, -152.7, 'e', 0.9);
    // WT5 / JN5 | STAFF TOILETS and JANITOR (off the ward's camera wall)
    for (const cx of [-40.05, -38.8]) { p(R13 + 'cubicle.glb', cx, -170.34, 0, [1.24, 1.87], 2.01, { noCollide: true }); raw({ kind: 'collider', x: cx, z: -170.07, fp: [1.24, 1.82], h: 2.0 }); p(R13 + 'toilet.glb', cx, -170.72, 0, [0.5, 0.79], 1.04, { noCollide: true }); }
    p(R13 + 'washstand.glb', -34.3, -168.6, 270, [1.18, 0.65], 1.22);
    wp(R13 + 'mirror.glb', -33.99, -168.6, 'w', 1.25);
    p(U + '10_janitor_utility/standard/10_standard_utility_sink.glb', -32.6, -170.64, 0, [1.06, 0.7], 1.32);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -30.4, -170.74, 0, [0.82, 0.51], 1.82);
    p(H + 'janitor_cart.glb', -27.0, -169.6, 0, [0.83, 0.99], 1.23);
    p(H + 'linen_cabinet.glb', -26.3, -167.3, 270, [0.95, 0.65], 1.84);
    // H5 | THE MAIN RECEPTION (the floor's heart): the round desk in the middle to circle, rows of waiting seats facing it, the
    // check-in kiosks and the big sign on the camera wall, vending and a cooler; the south half open for the crowd
    p(NP + 'round_reception_desk.glb', -15.34, -150.4, 0, [3.6, 3.6], 1.15, { name: 'h5desk' });
    for (const [sx, sz, r] of [[-21.6, -156.8, 0], [-21.6, -155.2, 0], [-9.0, -156.8, 0], [-9.0, -155.2, 0], [-21.6, -144.6, 180], [-9.0, -144.6, 180]]) p(C.seats, sx, sz, r, [2.6, 0.63], 0.92);
    p(H + 'check_in_kiosk.glb', -19.0, -159.8, 0, [0.39, 0.36], 1.46);
    p(H + 'check_in_kiosk.glb', -11.6, -159.8, 0, [0.39, 0.36], 1.46);
    wp(H + 'reception_poster_heart.glb', -23.2, -160.0, 's', 1.2);
    wp(H + 'lobby_t2_health_poster.glb', -7.6, -160.0, 's', 1.2);
    wp(H + 'wall_clock.glb', -15.34, -160.0, 's', 2.0);
    p(K + 'cafeteria_vending_machine.glb', -25.2, -157.4, 90, [0.93, 0.87], 1.9);
    p(H + 'water_cooler.glb', -25.4, -155.6, 90, [0.45, 0.49], 1.47);
    p(H + 'floor_planter.glb', -5.4, -159.4, 270, [1.12, 0.5], 1.52);
    p(H + 'floor_planter.glb', -25.3, -141.0, 90, [1.12, 0.5], 1.52);
    p(H + 'magazine_rack.glb', -5.3, -142.0, 270, [0.55, 0.43], 1.05);
    p(H + 'wheelchair.glb', -11.0, -142.4, 200, [0.76, 0.91], 0.97);
    sign('MAIN RECEPTION', 'Welcome · Floor 5', -15.34, 2.45, -160.0, 's', 1.6);
    sign('← ISOLATION · RECORDS', 'Wards', -25.69, 2.3, -146.6, 'e', 1.2);
    sign('INTAKE · READING →', 'Imaging', -4.99, 2.3, -152.0, 'w', 1.2);
    // PT5 | PUBLIC TOILETS: cubicles down the east wall, wash stands on the camera wall
    for (const cz of [-149.3, -148.05, -146.8, -145.55]) { p(R13 + 'cubicle.glb', -0.65, cz, 270, [1.24, 1.87], 2.01, { noCollide: true }); raw({ kind: 'collider', x: -0.92, z: cz, fp: [1.82, 1.24], h: 2.0 }); }
    for (const sx of [-3.8, -2.5]) { p(R13 + 'washstand.glb', sx, -149.69, 0, [1.18, 0.65], 1.22); wp(R13 + 'mirror.glb', sx, -150.0, 's', 1.25); }
    p(M + 'rooms/Restroom_Pedal_Bin.glb', -4.4, -142.0, 0, [0.37, 0.41], 0.66, { noCollide: true });
    // RR5 | RADIOLOGY READING: the reading desks with their screens, the lightbox wall, a dark quiet room
    for (const [dx, dz, r] of [[5.6, -149.64, 0], [0.7, -146.6, 90], [0.7, -144.0, 90]]) {
      p(C.desk, dx, dz, r, [1.5, 0.72], 0.81);
      raw({ m: H + 'desktop_computer.glb', x: dx + (r ? -0.1 : -0.35), z: dz - (r ? 0.35 : 0.1), rot: r, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true });
      raw({ m: H + 'desktop_computer.glb', x: dx + (r ? -0.1 : 0.35), z: dz + (r ? 0.35 : -0.1), rot: r, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true });
    }
    p(C.chair, 5.6, -148.8, 180, [0.6, 0.6], 1.0, { noCollide: true });
    p(C.chair, 1.5, -144.0, 270, [0.6, 0.6], 1.0, { noCollide: true });
    wp(H + 'assessment_status_board.glb', 6.97, -146.0, 'w', 1.4);
    sign('READING', 'Radiology', 5.6, 2.4, -150.0, 's', 0.9);
    // R5 | MEDICAL RECORDS (the record): the docket desk on the camera wall, its lit screen facing the player; filing cabinets
    // along the wall, archive shelving in rows, the copier corner
    p(C.desk, -29.5, -142.64, 0, [1.5, 0.72], 0.81, { name: 'docket' });
    raw({ kind: 'screen', x: -29.5, z: -142.7, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true, name: 'docketScreen' });
    p(C.chair, -29.5, -141.7, 180, [0.6, 0.6], 1.0, { noCollide: true });
    wp(H + 'assessment_status_board.glb', -31.0, -143.0, 's', 1.4);
    for (const x of [-40.3, -39.75, -39.2, -38.65, -27.3, -26.75]) p(NP + 'filing_cabinet.glb', x, -142.56, 0, [0.47, 0.88], 1.32);
    for (const sx of [-38.6, -35.0]) { p(C.shelf, sx, -137.6, 90, [1.39, 0.53], 2.0); p(C.shelf, sx, -136.1, 90, [1.39, 0.53], 2.0); }
    for (const x of [-31.6, -28.6]) { p(C.desk, x, -134.4, 0, [1.5, 0.72], 0.81); raw({ m: H + 'desktop_computer.glb', x, z: -134.5, rot: 0, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true }); }
    wp(NP + 'fire_extinguisher.glb', -25.99, -141.0, 'w', 0.6);
    sign('MEDICAL RECORDS', 'Transfer dockets', -35.0, 2.4, -143.0, 's', 1.4);
    // X5 | IMAGING: the CT scanner on the camera wall with its table and controls, the mobile X-ray and the lead aprons, the
    // ultrasound cart; the long floor in front is the big lady's lane (z -138 to -134, east to west)
    p(K + 'ct_scanner_gantry.glb', -15.3, -139.56, 0, [2.13, 0.87], 2.26);
    p(K + 'ct_control_pedestal.glb', -18.4, -139.8, 0, [0.53, 0.49], 1.16);
    wp(K + 'sign_ct_imaging.glb', -15.3, -140.0, 's', 2.36);
    wp(NP + 'lead_apron_rack.glb', -12.2, -140.0, 's', 0.95);
    p(NP + 'mobile_xray.glb', -9.6, -139.3, 0, [0.67, 1.39], 1.68);
    p(H + 'endoscopy_tower.glb', -22.6, -139.7, 0, [0.74, 0.6], 1.65); // (the ultrasound cart)
    p(H + 'procedure_stretcher.glb', -24.0, -133.4, 0, [0.9, 1.66], 1.22);
    p(H + 'wheelchair.glb', -6.0, -132.6, 270, [0.76, 0.91], 0.97);
    sign('IMAGING', 'X-ray · CT · ultrasound', -20.4, 2.45, -140.0, 's', 1.3);
    // M5 | THE MRI ARENA: the magnet on the camera wall (core/rooms.js MRI, drawn by render/rooms.js), the big red shutdown
    // button on its post in the near corner, the control desk, warning signs; open floor round it for the hand-to-hand fight
    raw({ kind: 'collider', x: 1.2, z: -140.36, fp: [2.1, 1.1], h: 2.1 }); // (the scanner's ring)
    raw({ kind: 'collider', x: 1.2, z: -138.9, fp: [0.7, 1.9], h: 0.9 }); // (its bed)
    p(C.desk, -3.6, -140.6, 0, [1.5, 0.72], 0.81);
    raw({ m: H + 'desktop_computer.glb', x: -3.6, z: -140.7, rot: 0, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true });
    sign('MRI', 'Magnet always on', 5.7, 2.45, -141.0, 's', 0.9);
    sign('DANGER · STRONG MAGNET', 'No metal beyond this point', -4.69, 2.3, -133.2, 'e', 1.0);
    // (the dressing pass, 2026-10-19)
    const box = (x, z, w, d, h, c = 0xa38f6c, face = 's') => raw({ kind: 'box', x, z, size: [w, d, h], face, color: c, fp: [w, d], h });
    // H5: back-to-back seat rows in the south half, planters in the corners, vending on the east wall, a wheelchair line,
    // an abandoned stretcher; the desk's circuit stays open
    for (const sx of [-21.6, -9.0]) p(C.seats, sx, -145.2, 0, [2.6, 0.63], 0.92);
    p(K + 'cafeteria_vending_machine.glb', -5.44, -143.0, 270, [0.93, 0.87], 1.9);
    p(K + 'cafeteria_vending_machine.glb', -5.44, -141.95, 270, [0.93, 0.87], 1.9);
    p(H + 'floor_planter.glb', -25.3, -159.4, 90, [1.12, 0.5], 1.52);
    for (const x of [-24.6, -23.8, -23.0]) p(H + 'wheelchair.glb', x, -140.9, 180, [0.76, 0.91], 0.97);
    p(H + 'procedure_stretcher.glb', -11.6, -153.8, 30, [0.9, 1.66], 1.22);
    p(H + 'side_table.glb', -15.34, -144.0, 0, [0.74, 0.74], 0.55);
    p(H + 'lidded_waste_bin.glb', -5.4, -158.4, 0, [0.36, 0.4], 0.58);
    p(H + 'water_cooler.glb', -16.6, -159.74, 0, [0.45, 0.49], 1.47);
    // PA5: a second bench island, the sample fridges' third, a body under a sheet on a stretcher, the slide cabinets
    p(H + 'prep_counter.glb', -20.4, -165.6, 0, [1.51, 0.69], 1.06);
    p(H + 'prep_counter.glb', -20.4, -164.91, 180, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_microscope.glb', x: -20.7, z: -165.6, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: K + 'lab_sample_rack.glb', x: -20.0, z: -164.9, rot: 180, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(NP + 'specimen_fridge.glb', -10.9, -170.62, 0, [0.75, 0.76], 1.9);
    p(H + 'procedure_stretcher.glb', -13.0, -162.4, 90, [0.9, 1.66], 1.22);
    p(NP + 'dust_sheet_small.glb', -13.0, -162.4, 90, [1.39, 0.92], 0.94, { noCollide: true });
    for (const x of [-7.0, -6.45]) p(NP + 'filing_cabinet.glb', x, -170.56, 0, [0.47, 0.88], 1.32);
    // R5: archive boxes on the floor between the rows, a trolley of files, a copier stand-in
    box(-36.8, -133.4, 0.6, 0.45, 0.4, 0xcab48a); box(-37.4, -133.0, 0.6, 0.45, 0.8, 0xbfa77a); box(-33.0, -138.9, 0.6, 0.45, 0.4, 0xcab48a);
    p(H + 'supply_cart.glb', -26.8, -140.6, 90, [1.16, 1.1], 1.23);
    box(-40.2, -135.0, 0.9, 0.7, 1.05, 0xd9dcde, 'e');
    p(C.shelf, -38.6, -134.6, 90, [1.39, 0.53], 2.0);
    // X5: the near band: waiting chairs, the lead aprons' second rack, a wheelchair; the lane stays open
    p(H + 'waiting_chair_section.glb', -15.0, -132.6, 180, [2.69, 0.97], 0.99);
    p(H + 'lidded_waste_bin.glb', -11.4, -132.4, 0, [0.36, 0.4], 0.58);
    p(H + 'iv_stand.glb', -19.6, -132.6, 0, [0.73, 0.7], 2.03, { noCollide: true });
    // M5: the MRI-safe lockers and a gas cylinder rack (the magnet's danger), a plastic wheelchair parked by the desk
    p(U + '11_staff_lounge/standard/11_standard_lockers.glb', -4.43, -138.9, 90, [1.4, 0.53], 1.95);
    p(H + 'clinician_chair.glb', -3.6, -139.8, 180, [0.65, 0.61], 0.98, { noCollide: true });
    raw({ kind: 'hazard', x: 1.2, z: -136.6, size: [3.0, 0.3], noCollide: true, fp: [0.1, 0.1], h: 0 }); // (the 5-gauss line)
    // W5 (flooded): a floating trolley, a fallen IV stand, the PPE bins by the door
    p(H + 'supply_cart.glb', -33.6, -145.2, 20, [1.16, 1.1], 1.23);
    p(H + 'iv_stand.glb', -36.0, -155.0, 0, [0.73, 0.7], 2.03, { noCollide: true });
    p(H + 'biohazard_bin.glb', -26.4, -146.6, 0, [0.39, 0.39], 0.69);
    room('elevator', X(1214) - 3.3, 2.75, -171.0, 's', 1.1);
  },
  groups: (Z) => [
    // the main reception: the floor's crowd round the desk: walkers, a runner, a cylinder chair from upstairs, one through
    // the floor
    { id: 'h5', sense: 7.0, zombies: [{ x: -19.6, z: -150.4, yaw: 1.2, look: 'nurse' }, { x: -11.0, z: -152.6, yaw: -1.4 }, { x: -15.4, z: -145.6, yaw: 2.8, look: 'patient' },
      { x: -22.4, z: -147.6, yaw: 0.8, kind: 'runner' }, { x: -8.6, z: -146.8, yaw: -2.0, kind: 'o2chair', look: 'patient' }, { x: -15.2, z: -155.6, look: 'nurse', from: 'floor', delay: 3.0 }] },
    // the flooded ward: walkers standing in the water (and the isolation beds' patients): lure them in, step out, hit the panel
    { id: 'w5', sense: 7.0, zombies: [{ x: -34.4, z: -158.4, yaw: 1.0, look: 'patient' }, { x: -30.4, z: -154.6, yaw: 1.6 }, { x: -35.6, z: -148.0, yaw: 0.6, look: 'nurse' }, { x: -29.0, z: -160.6, yaw: 2.2 }] },
    { id: 'wt5', sense: 3.5, zombies: [{ x: -38.9, z: -168.2, yaw: Math.PI, look: 'patient' }] },
    { id: 'jn5', sense: 3.5, zombies: [{ x: -28.6, z: -167.6, yaw: 2.0, look: 'nurse' }] },
    { id: 'pa5', sense: 5.5, zombies: [{ x: -18.0, z: -165.0, yaw: -0.6, look: 'nurse', prop: 'surgeon' }, { x: -11.0, z: -163.0, yaw: 2.2, look: 'patient' }] },
    { id: 'r5', sense: 6.0, zombies: [{ x: -36.8, z: -138.6, yaw: 0.6, look: 'nurse' }, { x: -30.0, z: -137.4, yaw: -1.0 }] },
    // imaging: the big lady at the east end of her lane, one walker by the scanner
    { id: 'x5', sense: 9.0, zombies: [{ x: -7.0, z: -136.2, yaw: -Math.PI / 2, kind: 'sprinter' }, { x: -17.6, z: -137.6, yaw: 0.4, look: 'patient' }] },
    // the MRI arena: the guard (the magnet takes his shield), two walkers, an old one with a cylinder trolley (dragged in)
    { id: 'm5', sense: 8.0, zombies: [{ x: 1.4, z: -134.6, yaw: Math.PI, kind: 'guard' }, { x: -2.6, z: -136.6, yaw: 1.0, look: 'nurse' }, { x: 5.4, z: -137.0, yaw: -1.2 }, { x: 4.2, z: -133.4, yaw: -2.6, kind: 'o2walker', look: 'patient' }] },
    { id: 'rr5', sense: 5.0, zombies: [{ x: 3.6, z: -146.0, yaw: 0.4, look: 'nurse' }, { x: 5.6, z: -143.0, yaw: -2.4 }] },
    { id: 'pt5', sense: 3.5, zombies: [{ x: -2.4, z: -145.4, yaw: 1.6, look: 'patient' }] },
  ],
  pickups: (Z) => [
    { id: 'i5ammo', kind: 'ammo', weapon: 'pistol', rounds: 24, x: 5.6, z: -152.6, r: 1.0, label: 'Pistol magazines', model: 'mag', y: 0.81 },
    { id: 'h5aid', kind: 'health', amount: 40, x: -15.34, z: -148.72, r: 1.3, label: 'First-aid case', model: 'aid', y: 1.1 }, // (on the desk's front ledge)
    { id: 'jn5sledge', kind: 'weapon', weapon: 'sledgehammer', x: -28.9, z: -169.9, r: 1.2, label: 'Sledgehammer', file: 'zombie/assets/weapons/sledgehammer.glb', len: 0.95, rot: 0.4, y: 0.05 },
    { id: 'pa5shells', kind: 'ammo', weapon: 'shotgun', rounds: 18, x: -9.6, z: -164.85, r: 1.4, label: 'Shotgun shells', model: 'shells', y: 1.06 },
    { id: 'pa5aid', kind: 'health', amount: 60, x: -22.8, z: -170.5, r: 1.1, label: 'First-aid case', model: 'aid', y: 1.06 },
    { id: 'r5aid', kind: 'health', amount: 40, x: -28.6, z: -134.4, r: 1.0, label: 'First-aid case', model: 'aid', y: 0.81 },
    { id: 'x5mags', kind: 'ammo', weapon: 'pistol', rounds: 18, x: -24.0, z: -133.4, r: 1.0, label: 'Spare pistol rounds', model: 'mag', y: 1.0 },
  ],
  interact: (Z) => [
    { id: 'intake', x: -3.2, z: -158.3, r: 1.6, label: 'Secure the case' },
    { id: 'record', x: -29.5, z: -141.3, r: 1.6, label: 'Read the dispatch record' },
  ],
  lights: (Z) => [{ x: X(1214), y: 2.3, z: -168.6 }, { x: -3.2, y: 2.4, z: -157.6 }, { x: -29.5, y: 2.4, z: -140.6 }],
  blood: (Z) => [
    { kind: 'drag', x: -8.4, z: -155.6, w: 0.7, l: 1.5, rot: -30 },
    { kind: 'splat', x: -18.0, z: -146.4, w: 0.9, l: 0.9, rot: 10 },
    { kind: 'hand', x: -4.99, z: -137.0, wall: 'w', y: 1.2, size: 0.32, tilt: 6 },
    { kind: 'splat', x: -12.6, z: -134.2, w: 1.1, l: 1.1, rot: 40 },
    { kind: 'drag', x: -33.4, z: -136.8, w: 0.6, l: 1.2, rot: 70 },
  ],
  // the flood (the whole ward under water; the panel just inside the reception door, so a blow from the dry doorway reaches
  // it), the magnet (its room is the arena; the button in the near corner)
  flood: (Z) => ({ minX: -40.7, maxX: -26.0, minZ: -165.0, maxZ: -143.3, panel: { x: -26.9, z: -152.3 } }), // (in sight of the dry doorway)
  mri: (Z) => ({ minX: -4.84, maxX: 7.12, minZ: -141.15, maxZ: -131.95, magnet: { x: 1.2, z: -140.4 }, button: { x: 6.2, z: -133.0 } }),
  tanks: (Z) => [[-6.0, -134.0], [5.9, -139.6], [-25.0, -158.8]],
  start: (Z) => ({ x: LIFTS[5].x, z: LIFTS[5].z + 1.2, yaw: 0 }),
});

export const FLOORS = { 7: F7, 6: F6, 5: F5 };
// the case's home (cold dispatch, on the counter) and the intake's hold position
export const CASE_HOME = { floor: 6, x: -30.0, z: -63.64, y: 1.09 }; // (on the dispatch counter, on K6's camera wall)
export const INTAKE_SPOT = { floor: 5, x: -3.2, z: -159.7, y: 1.23 }; // (the intake station's tray, assets/props/intake_station.glb)
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
