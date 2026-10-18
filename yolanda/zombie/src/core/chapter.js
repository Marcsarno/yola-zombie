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
    p(H + 'storage_bins.glb', -23.0, 0.6, 0, [1.05, 0.3], 0.28, { noCollide: true });
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
    p(H + 'floor_scrubber.glb', 2.6, 26.9, 90, [0.86, 1.52], 1.17);
    p(H + 'janitor_cart.glb', 4.6, 27.2, 0, [0.83, 0.99], 1.23);
    p(H + 'mop_bucket.glb', 5.6, 18.6, 30, [0.46, 0.51], 0.65);
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
    // wayfinding: printed signs and room plates on the walls the camera sees
    sign('LIFT PLANT →', 'Lift power · via the staff lounge', -25.8, 1.95, -1.4, 'w', 1.5);
    sign('LIFT', 'Power fault', X(1214) + 3.65, 2.3, -11.0, 's', 0.8, { lift: 7 });
    sign('BARRED', 'From the prep room side', 1.0, 1.75, 0.9, 'n', 0.86, { id: 'orbarSign' });
    sign('↓ RECOVERY · WARD WORKS', 'Lift plant →', -31.4, 2.3, -11.0, 's', 1.8);
    sign('WARD CLOSED', 'Refurbishment · keep out', -25.3, 1.45, 15.8, 's', 1.5); // (over the pallet: the pipes run along the wall's west half at 2.25 m)
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
    { id: 'v7sledge', kind: 'weapon', weapon: 'sledgehammer', x: -35.6, z: 19.6, r: 1.2, label: 'Sledgehammer', file: 'zombie/assets/weapons/sledgehammer.glb', len: 0.95, rot: -0.6, y: 0.47 },
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

// ================================================================================================ FLOOR 6: choose the approach
// A compact fork to cold dispatch (K6), south-west of the lift: the ward route (W6 -> P6) always open; the service passage
// down the east side to the charger bay (A6), whose weak left partition a committed charge can break into K6.
const F6 = buildFloor(6, {
  rooms: [
    { id: 'e6', name: 'Lift Lobby', poly: [[1140, 260], [1319, 260], [1319, 580], [1140, 580]], floor: ['#e4d8bf', '#cfc4ab'], ob: ['corridor', 'clinical'] },
    { id: 'j6', name: 'Ward Junction', poly: [[700, 300], [1140, 300], [1140, 580], [700, 580]], floor: ['#efe2c8', '#d9c9a8'], ob: ['corridor', 'clinical'] },
    { id: 'w6', name: 'Ward 6B', poly: [[180, 300], [700, 300], [700, 580], [620, 580], [620, 760], [180, 760]], floor: ['#e9eedf', '#c8dcc4'], ob: ['corridor', 'clinical'] },
    { id: 'p6', name: 'Sample Prep Lab', poly: [[180, 760], [620, 760], [620, 1030], [180, 1030]], floor: ['#e2e8ea', '#bfd2da'], ob: ['clinical', 'clinical'] },
    { id: 'k6', name: 'Cold Dispatch', poly: [[180, 1030], [710, 1030], [710, 1280], [180, 1280]], floor: ['#e6eef2', '#c4d6e2'], ob: ['clinical', 'clinical'] },
    { id: 'sp6', name: 'Service Corridor', poly: [[830, 580], [1000, 580], [1000, 800], [830, 800]], floor: ['#c9c4b8', '#b3ad9f'], ob: ['maintenance', 'maintenance'] },
    { id: 'a6', name: 'Ward 6C Works', poly: [[710, 800], [1140, 800], [1140, 1280], [710, 1280]], floor: ['#c4c2b6', '#aeab9d'], ob: ['maintenance', 'maintenance'] },
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
    // (2026-10-18, the user's layout pass, FLOORS_6_5_LAYOUT_PROPOSAL.html, approved: every room a purpose, its identity on
    // the north wall the locked camera sees, low things in the near band, nothing in front of a doorway. The route, the
    // rooms and the story beats are unchanged. NP = props modelled for these floors in Blender, blender/make_ward_gap_props.py)
    const C = { visitor: U + '09_assessment_furniture/runtime/visitor_chair_standard.glb', shelf: M + 'utility/Utility_Supply_Shelf.glb', cart: U + '08_support_equipment/runtime/supply_cart_standard.glb',
      counter: U + '09_assessment_furniture/runtime/prep_storage_standard.glb' };
    const NP = SI, bed = (x, z, rot) => p(H + 'recovery_bed.glb', x, z, rot, [1.25, 2.11], 0.87);
    // E6 | LIFT LOBBY 6: a floor directory beside the lift, seats along the east wall facing the doors, a cooler
    wp(H + 'lobby_t2_wayfinding.glb', 6.55, -91.0, 's', 1.45);
    wp(NP + 'fire_extinguisher.glb', 0.25, -91.0, 's', 0.6);
    p(H + 'floor_planter.glb', 6.7, -89.6, 270, [1.12, 0.5], 1.52);
    p(H + 'waiting_chair_section.glb', 6.45, -86.5, 270, [2.69, 0.97], 0.99);
    wp(H + 'reception_poster_clinician.glb', 6.95, -86.5, 'w', 1.3);
    p(H + 'water_cooler.glb', 6.7, -83.6, 270, [0.45, 0.49], 1.47);
    wp(H + 'wall_sanitizer.glb', 6.95, -84.6, 'w', 1.05);
    p(H + 'wheelchair.glb', 1.6, -80.0, 200, [0.76, 0.91], 0.97); // (abandoned by the lift)
    // J6 | WARD JUNCTION: the two ways signed on the camera wall over a parked trolley, seats, a charting station, wheelchairs;
    // the guard's bag and pistol where he and Yola parted (pickups)
    p(H + 'linen_cabinet.glb', -16.6, -89.08, 0, [0.95, 0.65], 1.84);
    p(H + 'procedure_stretcher.glb', -14.4, -88.95, 90, [0.9, 1.66], 1.22);
    wp(H + 'lobby_t2_health_poster.glb', -12.9, -89.4, 's', 1.2);
    wp(H + 'wall_sanitizer.glb', -12.2, -89.4, 's', 1.05);
    p(H + 'waiting_chair_section.glb', -9.65, -88.9, 0, [2.69, 0.97], 0.99);
    wp(H + 'wall_clock.glb', -7.4, -89.4, 's', 1.95);
    p(H + 'charting_workstation.glb', -5.9, -89.09, 0, [0.83, 0.62], 1.47);
    wp(H + 'team_wall_station.glb', -4.6, -89.4, 's', 0.75);
    p(H + 'wheelchair.glb', -1.6, -88.9, 0, [0.76, 0.91], 0.97);
    p(H + 'wheelchair.glb', -0.85, -88.9, 0, [0.76, 0.91], 0.97);
    wp(NP + 'fire_extinguisher.glb', -17.5, -86.6, 'e', 0.6);
    p(H + 'wheelchair.glb', -15.0, -79.6, 120, [0.76, 0.91], 0.97); // (tipped aside)
    // W6 | WARD 6B (SURGICAL): five beds heads-on to the camera (headwall, cabinet, a relative's chair), two dragged into the
    // aisle in the panic (cover), two more on the L's west wall, the nurse base and the ward sink in the L
    for (const [i, bx] of [-36.0, -32.4, -28.8, -25.2, -21.6].entries()) {
      bed(bx, -88.35, 0);
      wp(H + 'service_headwall.glb', bx, -89.4, 's', 1.24);
      p(H + 'bedside_cabinet.glb', bx - 0.95, -88.95, 0, [0.52, 0.63], 0.81);
      p(C.visitor, bx + 0.95, -88.4, 270, [0.47, 0.47], 0.98, { noCollide: true });
      if (i < 2) wp(H + (i ? 'recovery_bay_sign_02.glb' : 'recovery_bay_sign_01.glb'), bx, -89.4, 's', 2.05);
    }
    p(NP + 'over_bed_table.glb', -32.4, -86.7, 0, [0.8, 0.44], 1.08);
    p(NP + 'over_bed_table.glb', -25.2, -86.7, 0, [0.8, 0.44], 1.08);
    wp(H + 'wall_exam_set.glb', -34.6, -89.4, 's', 1.25);
    wp(H + 'sharps_container.glb', -31.0, -89.4, 's', 1.2);
    wp(H + 'glove_dispenser.glb', -27.4, -89.4, 's', 1.25);
    wp(H + 'wall_sanitizer.glb', -23.8, -89.4, 's', 1.1);
    wp(H + 'wall_clock.glb', -19.6, -89.4, 's', 1.95);
    bed(-30.4, -82.6, 25); bed(-23.0, -80.6, -15); // (dragged out of their bays)
    p(H + 'iv_stand.glb', -29.0, -84.4, 0, [0.73, 0.7], 2.03, { noCollide: true });
    bed(-37.25, -76.6, 90); bed(-37.25, -73.4, 90);
    wp(H + 'service_headwall.glb', -38.3, -76.6, 'e', 1.24);
    wp(H + 'service_headwall.glb', -38.3, -73.4, 'e', 1.24);
    p(H + 'team_desk.glb', -25.6, -76.4, 0, [1.13, 0.74], 1.16);
    p(H + 'charting_workstation.glb', -24.0, -76.5, 0, [0.83, 0.62], 1.47);
    p(H + 'clinician_chair.glb', -25.6, -75.6, 180, [0.65, 0.61], 0.98, { noCollide: true });
    p(H + 'handwash_cabinet_base.glb', -21.35, -74.0, 270, [0.51, 0.7], 0.77);
    wp(H + 'handwash_basin.glb', -21.0, -74.0, 'w', 0.77);
    wp(H + 'towel_dispenser.glb', -21.0, -74.7, 'w', 1.1);
    wp(H + 'soap_dispenser.glb', -21.0, -73.4, 'w', 1.2);
    p(H + 'laundry_hamper.glb', -21.3, -72.0, 0, [0.6, 0.57], 1.15);
    wp(NP + 'fire_extinguisher.glb', -17.8, -87.0, 'w', 0.6);
    // P6 | SAMPLE PREP LAB (why the route runs ward -> lab -> dispatch): benches with a centrifuge, a microscope and sample
    // racks on the camera wall, the sink, two islands for cover, the first-aid case on the cart by the west wall
    p(H + 'prep_counter.glb', -36.9, -70.65, 0, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_centrifuge.glb', x: -37.25, z: -70.65, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: K + 'lab_microscope.glb', x: -36.5, z: -70.65, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(H + 'prep_counter.glb', -35.3, -70.65, 0, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_sample_rack.glb', x: -35.3, z: -70.6, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    wp(H + 'wall_cupboard.glb', -36.9, -71.0, 's', 1.45);
    wp(H + 'wall_cupboard.glb', -35.3, -71.0, 's', 1.45);
    p(H + 'handwash_cabinet_base.glb', -33.8, -70.65, 0, [0.51, 0.7], 0.77);
    wp(H + 'handwash_basin.glb', -33.8, -71.0, 's', 0.77);
    wp(H + 'soap_dispenser.glb', -33.3, -71.0, 's', 1.2);
    wp(H + 'clinical_art_preparation_checklist.glb', -32.6, -71.0, 's', 1.0);
    p(H + 'prep_storage.glb', -26.2, -70.64, 0, [1.51, 0.72], 1.09);
    wp(H + 'glove_dispenser.glb', -26.6, -71.0, 's', 1.25);
    wp(H + 'sharps_container.glb', -25.8, -71.0, 's', 1.15);
    p(H + 'prep_counter.glb', -24.5, -70.65, 0, [1.51, 0.69], 1.06);
    raw({ m: K + 'lab_sample_rack.glb', x: -24.5, z: -70.6, rot: 0, y: 1.06, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(H + 'charting_workstation.glb', -22.8, -70.69, 0, [0.83, 0.62], 1.47);
    wp(H + 'wall_clock.glb', -22.0, -71.0, 's', 1.95);
    p(H + 'supply_cart.glb', -37.75, -66.4, 90, [1.16, 1.1], 1.23);
    p(H + 'linen_cabinet.glb', -37.97, -63.8, 90, [0.95, 0.65], 1.84);
    p(H + 'prep_counter.glb', -34.5, -65.8, 0, [1.51, 0.69], 1.06);
    p(H + 'prep_counter.glb', -34.5, -65.11, 180, [1.51, 0.69], 1.06);
    p(H + 'team_stool.glb', -35.4, -64.4, 0, [0.36, 0.34], 0.5, { noCollide: true });
    p(H + 'team_stool.glb', -33.6, -64.4, 0, [0.36, 0.34], 0.5, { noCollide: true });
    p(H + 'consultation_desk.glb', -24.8, -65.5, 0, [1.5, 0.73], 0.81);
    raw({ m: H + 'desktop_computer.glb', x: -24.8, z: -65.6, rot: 0, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(H + 'clinician_chair.glb', -24.8, -64.7, 180, [0.65, 0.61], 0.98, { noCollide: true });
    p(H + 'sedaprep.glb', -21.36, -66.5, 270, [1.12, 0.72], 0.98);
    wp(H + 'wall_sanitizer.glb', -21.0, -64.5, 'w', 1.05);
    p(H + 'biohazard_bin.glb', -21.25, -62.0, 0, [0.39, 0.39], 0.69);
    p(H + 'biohazard_bin.glb', -21.25, -62.5, 0, [0.39, 0.39], 0.69);
    // K6 | COLD DISPATCH (calm): specimen fridges, the dispatch counter with the sealed case on the camera wall (CASE_HOME),
    // the tube station, courier coolers and transport stock; the weak partition and its approach stay clear
    p(NP + 'specimen_fridge.glb', -37.7, -59.82, 0, [0.75, 0.76], 1.9);
    p(NP + 'specimen_fridge.glb', -36.85, -59.82, 0, [0.75, 0.76], 1.9);
    p(C.counter, -34.6, -59.84, 0, [1.51, 0.72], 1.09, { name: 'k6table' });
    wp(H + 'assessment_status_board.glb', -34.6, -60.2, 's', 1.5);
    wp(NP + 'pneumatic_tube_station.glb', -33.3, -60.2, 's', 0.75);
    p(NP + 'courier_coolers.glb', -26.6, -59.98, 0, [0.64, 0.44], 0.94);
    p(C.shelf, -24.6, -59.92, 0, [1.39, 0.56], 2.0);
    p(C.shelf, -23.1, -59.92, 0, [1.39, 0.56], 2.0);
    p(NP + 'specimen_fridge.glb', -21.4, -59.82, 0, [0.75, 0.76], 1.9);
    wp(H + 'wall_clock.glb', -19.5, -60.2, 's', 1.95);
    wp(NP + 'fire_extinguisher.glb', -18.6, -60.2, 's', 0.6);
    p(C.shelf, -38.02, -56.5, 90, [1.39, 0.56], 2.0);
    p(C.cart, -26.0, -51.4, 0, [1.16, 1.1], 1.21);
    // SP6 | SERVICE CORRIDOR: the cylinder store and the cleaners' sink against its walls; the doorways span it, so nothing
    // stands more than about 0.6 m off a wall
    for (const z of [-75.8, -75.35, -74.9, -74.45]) p(H + 'medical_gas_cylinder.glb', -12.08, z, 0, [0.39, 0.43], 1.15);
    p(H + 'supply_shelf.glb', -12.02, -72.6, 90, [1.39, 0.56], 2.0);
    wp(NP + 'fire_extinguisher.glb', -12.3, -77.0, 'e', 0.6);
    p(H + 'utility_sink.glb', -6.055, -75.4, 270, [0.88, 0.51], 1.64);
    p(H + 'mop.glb', -5.93, -74.6, 270, [0.34, 0.25], 1.5, { noCollide: true });
    wp(H + 'wall_shelf.glb', -5.8, -73.8, 'w', 1.2);
    p(H + 'janitor_cart.glb', -6.4, -72.4, 0, [0.83, 0.99], 1.23);
    // A6 | WARD 6C CONVERSION WORKS: an old ward being turned into something new; furniture under dust sheets, stud framing
    // either side of the weak partition, a scaffold tower, the user's painted bench; the clutter keeps to the north half and the
    // walls, the charger's run west to the partition (z -59 to -51) and its dodge space stay open
    p(NP + 'dust_sheet_furniture.glb', -15.6, -68.75, 0, [1.88, 1.23], 1.07);
    p(NP + 'dust_sheet_small.glb', -13.2, -68.9, 0, [1.39, 0.92], 0.94);
    p('zombie/assets/props/drywall_pallet.glb', -16.25, -66.0, 90, [1.41, 1.69], 0.45);
    p(NP + 'scaffold_tower.glb', -4.0, -68.95, 0, [1.82, 0.77], 2.4);
    p(SI + 'standin_cable_workbench.glb', -1.6, -68.95, 0, [1.8, 0.76], 0.92);
    p(SI + 'standin_tool_pegboard.glb', -1.6, -69.36, 180, [1.26, 0.06], 0.94, { y: 1.05, noCollide: true });
    p('zombie/assets/props/sawhorse_barrier.glb', -5.0, -63.0, 0, [1.9, 0.73], 1.04);
    raw({ kind: 'hazard', x: -5.0, z: -64.3, size: [2.6, 1.4], noCollide: true, fp: [0.1, 0.1], h: 0 });
    p(H + 'wet_floor_sign.glb', -6.6, -63.4, 0, [0.48, 0.66], 0.64, { noCollide: true });
    p(NP + 'stud_wall_frame.glb', -17.04, -60.1, 0, [0.12, 3.6], 2.6);
    p(NP + 'stud_wall_frame.glb', -17.04, -52.3, 0, [0.12, 3.6], 2.6);
    p(H + 'supply_shelf.glb', -0.48, -66.4, 270, [1.39, 0.56], 2.0);
    p(NP + 'dust_sheet_furniture.glb', -0.82, -63.6, 90, [1.88, 1.23], 1.07);
    p(SI + 'standin_paint_shelf.glb', -0.42, -61.2, 270, [1.19, 0.44], 1.81);
    p(K + 'isolation_windowed_partition.glb', -0.6, -58.0, 90, [2.0, 0.15], 2.4);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', -0.46, -54.35, 270, [0.82, 0.51], 1.82);
    raw({ kind: 'bench', x: X(1000), z: Z(1250), size: [1.8, 0.65, 0.92], color: 0x8c7a5c, fp: [1.8, 0.65], h: 0.92 });
    p(SI + 'standin_renovation_pallet.glb', -10.5, -51.4, 0, [1.25, 1.02], 0.61);
    raw({ kind: 'hazard', x: X(710) + 1.0, z: (Z(1095) + Z(1180)) / 2, size: [1.3, 3.2], noCollide: true, fp: [0.1, 0.1], h: 0 }); // (where a dodge sends her charge into the partition: about a metre out)
    // the weak partition itself (two windowed panels filling the opening; the level breaks them)
    raw({ kind: 'partition', x: X(710), z: (Z(1095) + Z(1180)) / 2, w: 3.0, fp: [0.1, 0.1], h: 0, noCollide: true, name: 'partition' });
    // wayfinding
    sign('← COLD DISPATCH', 'via the ward and the lab', X(920) - 0.6, 2.3, Z(300) + 0.15, 's', 1.5);
    sign('SERVICE ↓', 'Ward 6C works', X(1060), 2.3, Z(300) + 0.15, 's', 1.3);
    sign('WARD 6B', 'Surgical inpatients', -30.0, 2.35, -89.4, 's', 1.4);
    sign('RENOVATION', 'Temporary partition — weak', X(710) + 0.16, 2.35, (Z(1095) + Z(1180)) / 2 + 2.2, 'e', 1.2);
    sign('COLD DISPATCH ↓', 'Specimen hold', X(530), 2.3, Z(760) + 0.15, 's', 1.3);
    sign('WARD 6C · CONVERSION', 'Contractors only', -14.4, 2.2, -69.4, 's', 1.5);
    room('elevator', X(1214) + 3.5, 2.75, Z(260) + 0.15, 's', 1.1);
    room('lab', -36.1, 2.38, -71.0, 's', 1.3);
  },
  groups: (Z) => [
    // W6: a broad ward, four spread between the beds (a worthwhile regular route, not padded)
    { id: 'w6', sense: 6.5, zombies: [{ x: X(300), z: Z(470), yaw: 0.8, look: 'patient', prop: 'iv' }, { x: X(520), z: Z(500), yaw: -0.6, look: 'patient', prop: 'chair' }, { x: X(260), z: Z(660), yaw: 2.4, look: 'nurse' }, { x: X(470), z: Z(700), yaw: -2.0 }] },
    // P6: two in the preparation room
    { id: 'p6', sense: 5.5, zombies: [{ x: X(300), z: Z(840), yaw: 0.4, look: 'nurse', prop: 'surgeon' }, { x: X(480), z: Z(980), yaw: -2.4 }] },
    // A6: the big lady straight charger, at the far east of the bay: her lane runs west at the weak partition
    { id: 'a6', sense: 9.0, zombies: [{ x: X(1060), z: Z(1150), yaw: -Math.PI / 2, kind: 'sprinter' }] },
  ],
  pickups: (Z) => [
    { id: 'p6aid', kind: 'health', amount: 40, x: -34.9, z: -65.8, r: 1.0, label: 'First-aid case', model: 'aid', y: 1.06 },
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
    { id: 'd5', name: 'Porters’ Transfer Hub', poly: [[700, 580], [1140, 580], [1140, 900], [700, 900]], floor: ['#efe2c8', '#d9c9a8'], ob: ['corridor', 'clinical'] },
    { id: 'w5', name: 'Isolation Ward', poly: [[250, 580], [700, 580], [700, 1000], [250, 1000]], floor: ['#e9eedf', '#c8dcc4'], ob: ['corridor', 'clinical'] },
    { id: 'r5', name: 'Medical Records', poly: [[250, 1000], [700, 1000], [700, 1280], [250, 1280]], floor: ['#e2e8ea', '#bfd2da'], ob: ['clinical', 'clinical'] },
    { id: 't5', name: 'Imaging and Equipment Bay', poly: [[700, 900], [1250, 900], [1250, 1280], [700, 1280]], floor: ['#c9c4b8', '#b3ad9f'], ob: ['maintenance', 'maintenance'] },
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
    // (2026-10-18, the user's layout pass, FLOORS_6_5_LAYOUT_PROPOSAL.html, approved: as Floor 6. NP = the props modelled for
    // these floors in Blender, blender/make_ward_gap_props.py. The intake station and the docket desk are story anchors:
    // INTAKE_SPOT follows the station's tray, the record interaction follows the desk.)
    const NP = SI, C = { shelf: M + 'utility/Utility_Supply_Shelf.glb', counter: U + '09_assessment_furniture/runtime/prep_storage_standard.glb',
      desk: U + '09_assessment_furniture/runtime/consultation_desk_standard.glb', chair: U + '09_assessment_furniture/runtime/clinician_chair_standard.glb',
      station: U + '08_support_equipment/runtime/workstation_standard.glb' };
    // E5 | LIFT LOBBY 5: the floor directory, seats and a cooler on the east wall
    wp(H + 'lobby_t2_wayfinding.glb', 6.55, -171.0, 's', 1.45);
    p(H + 'floor_planter.glb', 6.7, -169.6, 270, [1.12, 0.5], 1.52);
    p(H + 'waiting_chair_section.glb', 6.45, -166.5, 270, [2.69, 0.97], 0.99);
    p(H + 'water_cooler.glb', 6.7, -163.4, 270, [0.45, 0.49], 1.47);
    wp(NP + 'fire_extinguisher.glb', 6.95, -161.2, 'w', 0.6);
    wp(H + 'wall_sanitizer.glb', 6.95, -164.4, 'w', 1.05);
    // I5 | DIAGNOSTIC INTAKE (the safe pocket): the intake station that takes the case (its lamp material IntakeLampAmber /
    // IntakeLampGreen) between specimen fridges, the lab benches, the tube station; a low sample-reception desk near the camera
    p(NP + 'specimen_fridge.glb', -15.25, -169.02, 0, [0.75, 0.76], 1.9);
    p(NP + 'specimen_fridge.glb', -14.4, -169.02, 0, [0.75, 0.76], 1.9);
    p(NP + 'intake_station.glb', X(830), -169.05, 0, [1.04, 0.7], 1.55, { name: 'intake' });
    wp(H + 'glove_dispenser.glb', -11.4, -169.4, 's', 1.3);
    wp(H + 'wall_sanitizer.glb', -10.75, -169.4, 's', 1.05);
    p(C.counter, -9.6, -169.07, 0, [1.51, 0.66], 1.09);
    raw({ m: K + 'lab_centrifuge.glb', x: -9.95, z: -169.07, rot: 0, y: 1.09, fp: [0.1, 0.1], h: 0, noCollide: true });
    raw({ m: K + 'lab_microscope.glb', x: -9.2, z: -169.07, rot: 0, y: 1.09, fp: [0.1, 0.1], h: 0, noCollide: true });
    wp(NP + 'pneumatic_tube_station.glb', -7.9, -169.4, 's', 0.75);
    p(C.counter, -6.2, -169.07, 0, [1.51, 0.66], 1.09);
    raw({ m: K + 'lab_sample_rack.glb', x: -6.2, z: -169.0, rot: 0, y: 1.09, fp: [0.1, 0.1], h: 0, noCollide: true });
    p(C.station, -4.4, -169.09, 0, [0.83, 0.62], 1.47);
    wp(H + 'wall_clock.glb', -3.0, -169.4, 's', 1.95);
    p(H + 'biohazard_bin.glb', -1.0, -169.1, 0, [0.39, 0.39], 0.69);
    p(K + 'pharmacy_medicine_shelf.glb', -17.24, -165.6, 90, [1.39, 0.53], 1.95);
    wp(H + 'clinical_art_digestive.glb', -17.5, -163.4, 'e', 1.3);
    p(C.desk, -13.5, -160.6, 0, [1.5, 0.72], 0.81);
    p(C.chair, -13.5, -161.4, 180, [0.6, 0.6], 1.0, { noCollide: true });
    p(U + '12_lobby/lobby_T2_floor_planter.glb', X(1085), Z(527), 0, [0.55, 0.86], 1.2, { fit: true });
    // D5 | PORTERS' TRANSFER HUB: the porters' desk and jobs board, wheelchairs and trolleys parked, a wayfinding sign: both ways
    // to the records read from the north door before the choice
    p(H + 'team_desk.glb', -15.0, -157.83, 0, [1.13, 0.74], 1.16);
    wp(H + 'assessment_status_board.glb', -15.0, -158.2, 's', 1.45);
    wp(H + 'team_wall_station.glb', -13.6, -158.2, 's', 0.75);
    p(H + 'charting_workstation.glb', -12.6, -157.89, 0, [0.83, 0.62], 1.47);
    wp(H + 'wall_clock.glb', -11.2, -158.2, 's', 1.95);
    for (const x of [-4.6, -3.85, -3.1]) p(H + 'wheelchair.glb', x, -157.7, 0, [0.76, 0.91], 0.97);
    wp(H + 'lobby_t2_wayfinding.glb', -1.4, -158.2, 's', 1.6);
    p(H + 'procedure_stretcher.glb', -0.7, -154.8, 0, [0.9, 1.66], 1.22);
    p(H + 'procedure_stretcher.glb', -0.7, -152.6, 0, [0.9, 1.66], 1.22);
    p(H + 'waiting_chair_section.glb', -0.69, -149.6, 270, [2.69, 0.97], 0.99);
    p(H + 'laundry_hamper.glb', -17.0, -156.0, 0, [0.6, 0.57], 1.15);
    p(H + 'lidded_waste_bin.glb', -17.3, -147.2, 0, [0.36, 0.4], 0.58);
    wp(NP + 'fire_extinguisher.glb', -17.5, -155.2, 'e', 0.6);
    p(U + '12_lobby/lobby_T2_floor_planter.glb', X(720), Z(880), 0, [0.55, 0.86], 1.2, { fit: true });
    // W5 | ISOLATION WARD (the shield carrier): three glass-divided isolation bays on the camera wall with PPE signs, the PPE
    // station; the open half south of them keeps its width, with a shoved bed and a trolley for controlled flanking
    for (const bc of [-33.4, -29.4, -25.4]) {
      p(H + 'recovery_bed.glb', bc, -157.14, 0, [1.25, 2.11], 0.87);
      wp(H + 'service_headwall.glb', bc, -158.2, 's', 1.24);
      p(H + 'patient_monitor.glb', bc + 1.1, -157.85, 0, [0.62, 0.71], 1.49);
      p(H + 'bedside_cabinet.glb', bc - 1.05, -157.88, 0, [0.52, 0.63], 0.81);
      wp(K + 'isolation_ppe_sign.glb', bc, -158.2, 's', 2.15);
    }
    for (const x of [-31.4, -27.4, -23.4]) for (const z of [-157.2, -155.2]) p(K + 'isolation_windowed_partition.glb', x, z, 90, [2.0, 0.15], 2.4);
    p(H + 'laundry_hamper.glb', -22.8, -157.8, 0, [0.6, 0.57], 1.15);
    p(NP + 'ppe_trolley.glb', -21.4, -157.9, 0, [0.87, 0.57], 1.26);
    wp(H + 'glove_dispenser.glb', -20.5, -158.2, 's', 1.25);
    wp(H + 'glove_dispenser.glb', -20.0, -158.2, 's', 1.25);
    wp(H + 'wall_sanitizer.glb', -19.5, -158.2, 's', 1.05);
    p(H + 'biohazard_bin.glb', -19.0, -157.9, 0, [0.39, 0.39], 0.69);
    p(H + 'biohazard_bin.glb', -18.5, -157.9, 0, [0.39, 0.39], 0.69);
    p(H + 'recovery_bed.glb', -30.0, -148.0, 90, [1.25, 2.11], 0.87);
    p(H + 'procedure_stretcher.glb', -22.5, -147.0, 0, [0.9, 1.66], 1.22);
    p(H + 'supply_cart.glb', -33.5, -145.5, 0, [1.16, 1.1], 1.23);
    p(H + 'linen_cabinet.glb', -35.17, -149.5, 90, [0.95, 0.65], 1.84);
    p(H + 'bedside_cabinet.glb', X(627), Z(930), 0, [0.52, 0.63], 0.81);
    // R5 | MEDICAL RECORDS (calm): the docket desk on the camera wall, its lit screen facing the player; filing cabinets,
    // archive shelving, two office desks
    p(C.desk, -32.05, -141.04, 0, [1.5, 0.72], 0.81, { name: 'docket' });
    raw({ kind: 'screen', x: -32.05, z: -141.1, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true, name: 'docketScreen' });
    p(C.chair, -32.05, -140.1, 180, [0.6, 0.6], 1.0, { noCollide: true });
    wp(H + 'assessment_status_board.glb', -33.6, -141.4, 's', 1.4);
    wp(H + 'wall_clock.glb', -30.4, -141.4, 's', 1.95);
    for (const x of [-29.9, -29.35, -28.8, -19.2, -18.65]) p(NP + 'filing_cabinet.glb', x, -140.96, 0, [0.47, 0.88], 1.32);
    p(C.shelf, -22.2, -141.13, 0, [1.39, 0.53], 2.0);
    p(C.shelf, -20.75, -141.13, 0, [1.39, 0.53], 2.0);
    p(K + 'pharmacy_medicine_shelf.glb', -35.24, -138.0, 90, [1.39, 0.53], 1.95);
    p(K + 'pharmacy_medicine_shelf.glb', -35.24, -136.5, 90, [1.39, 0.53], 1.95);
    p(H + 'water_cooler.glb', -35.25, -133.4, 90, [0.45, 0.49], 1.47);
    for (const x of [-30.5, -27.8]) {
      p(C.desk, x, -135.8, 0, [1.5, 0.72], 0.81);
      raw({ m: H + 'desktop_computer.glb', x, z: -135.9, rot: 0, y: 0.81, fp: [0.1, 0.1], h: 0, noCollide: true });
    }
    p(C.chair, -30.5, -135.0, 180, [0.6, 0.6], 1.0, { noCollide: true });
    wp(NP + 'fire_extinguisher.glb', -17.8, -139.6, 'w', 0.6);
    // T5 | IMAGING AND EQUIPMENT BAY (the charger): the CT scanner on the camera wall with its table, controls, sign and a
    // lead-apron rack; parked anaesthesia, endoscopy, airway and X-ray kit along the wall; the long open floor stays her lane
    p(K + 'ct_scanner_gantry.glb', -13.0, -144.96, 0, [2.13, 0.87], 2.26);
    p(K + 'ct_sliding_patient_table.glb', -13.0, -143.5, 0, [0.71, 2.05], 1.11);
    p(K + 'ct_control_pedestal.glb', -15.9, -145.1, 0, [0.53, 0.49], 1.16);
    wp(K + 'sign_ct_imaging.glb', -13.0, -145.4, 's', 2.36);
    wp(NP + 'lead_apron_rack.glb', -10.6, -145.4, 's', 0.95);
    wp(H + 'wall_clock.glb', -9.0, -145.4, 's', 1.95);
    p(H + 'anesthesia_workstation.glb', -3.6, -145.05, 0, [1.1, 0.7], 1.55);
    p(H + 'endoscopy_tower.glb', -2.4, -145.1, 0, [0.74, 0.6], 1.65);
    p(H + 'airready.glb', -1.2, -145.03, 0, [0.94, 0.74], 1.37);
    p(H + 'patient_monitor.glb', 0.0, -145.05, 0, [0.62, 0.71], 1.49);
    p(NP + 'mobile_xray.glb', 1.6, -144.7, 0, [0.67, 1.39], 1.68);
    for (const x of [3.3, 3.75]) p(H + 'medical_gas_cylinder.glb', x, -145.18, 0, [0.39, 0.43], 1.15);
    p(U + '10_janitor_utility/starter/10_starter_rack.glb', X(1218), Z(1005), 270, [0.82, 0.51], 1.82);
    p(H + 'wheelchair.glb', 3.75, -139.0, 270, [0.76, 0.91], 0.97);
    p(H + 'wheelchair.glb', 3.75, -138.2, 270, [0.76, 0.91], 0.97);
    p(H + 'supply_shelf.glb', X(1218), Z(1200), 270, [1.39, 0.53], 2.0);
    wp(NP + 'fire_extinguisher.glb', 4.2, -136.5, 'w', 0.6);
    p(H + 'procedure_stretcher.glb', -12.5, -131.2, 90, [0.9, 1.66], 1.22);
    // wayfinding
    sign('DIAGNOSTIC INTAKE', 'Specimen hold', X(920), 2.3, Z(300) + 0.15, 's', 1.4);
    sign('← RECORDS', 'via the isolation ward', X(700) + 0.16, 2.3, Z(745) - 1.8, 'e', 1.3);
    sign('RECORDS ↓', 'via the imaging bay', X(975) + 2.0, 2.3, Z(580) + 0.15, 's', 1.3);
    sign('TRANSFER RECORDS', 'Dispatch dockets', X(330), 2.3, Z(1000) + 0.15, 's', 1.4);
    sign('ISOLATION', 'Gown and glove', -21.0, 2.35, -158.2, 's', 1.3);
    sign('IMAGING · EQUIPMENT', '', -1.0, 2.35, -145.4, 's', 1.4);
    room('elevator', X(1214) + 3.5, 2.75, Z(260) + 0.15, 's', 1.1);
    room('lab', X(830), 2.62, Z(300) + 0.15, 's', 1.1);
  },
  groups: (Z) => [
    { id: 'd5', sense: 5.0, zombies: [{ x: X(950), z: Z(780), yaw: 2.6, look: 'patient', prop: 'chair' }] },
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
    { id: 'record', x: -32.05, z: -139.7, r: 1.6, label: 'Read the dispatch record' },
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
export const CASE_HOME = { floor: 6, x: -34.6, z: -59.84, y: 1.09 }; // (on the dispatch counter, on K6's camera wall; was a café table mid-room)
export const INTAKE_SPOT = { floor: 5, x: X(830), z: -169.1, y: 1.23 }; // (the intake station's tray, assets/props/intake_station.glb)
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
