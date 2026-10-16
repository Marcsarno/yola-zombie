// LEVEL 1 | FLOOR 3 — "the hospital loop". Plain data shared by the simulation (colliders, nav, zombies, pickups,
// interactions) and the renderer (floors, walls, doors, props, signs). Built from the approved Floor 3 plan
// (Floor3_Layout_Reference: 5 m = 135 px) with the operating room kept where the opening stages it.
// World axes: x east, z south (north = -z, the top of the screen). Rotations: 0/90/180/270 only; a prop's front is +z.
// Plan px -> world: x = (px - 918) / 27 - 7, z = (py - 520) / 27 - 11.15.

const M = 'assets/models/';
const U = M + 'upgrades/';
const H = 'zombie/assets/hospital/';
const K = 'zombie/assets/kit/';
const T = 0.3; // wall thickness (walls are given by their centre lines)
const WH = 2.7; // wall height

// ---------------------------------------------------------------------------------------------- rooms (floor areas)
// rects [x0, x1, z0, z1]; floor palette per room (each room reads as its own place)
export const ROOMS = [
  { id: 'or', name: 'Operating Room', rects: [[-7.15, 7.15, -11.15, -1.35], [-7.15, 3.8, -1.35, 0.65]], floor: ['#e4d8bf', '#b9d3c8'] },
  { id: 'supply', name: 'Supply Hall', rects: [[-12.85, -7.15, -6.2, 1.65]], floor: ['#d9d6cc', '#c2c9c6'] },
  { id: 'waiting', name: 'Waiting Area', rects: [[-25.6, -12.85, -7.2, 1.65]], floor: ['#efe2c8', '#d9c9a8'] },
  { id: 'preop', name: 'Pre-Op Holding', rects: [[-37.4, -25.6, -11.15, 0.6]], floor: ['#e2e8ea', '#bfd2da'] },
  { id: 'maint', name: 'Maintenance', rects: [[-37.4, -25.6, -19.0, -11.15], [-33.5, -25.6, -22.9, -19.0]], floor: ['#b9b8b0', '#a3a39a'] },
  { id: 'cafe', name: 'Staff Cafeteria', rects: [[-25.6, -10.93, -22.9, -12.1], [-25.6, -14.8, -12.1, -10.15]], floor: ['#f0dccb', '#d8a98c'] },
  { id: 'ct', name: 'CT Imaging', rects: [[-10.93, 0.89, -22.9, -11.15]], floor: ['#e6eef2', '#c4d6e2'] },
  { id: 'recovery', name: 'Recovery Bay', rects: [[-27.6, -12.85, 1.65, 11.45]], floor: ['#e9eedf', '#c8dcc4'] },
  { id: 'lift', name: 'Lift', rects: [[7.3, 10.6, -6.85, -3.55]], floor: null },
];

// ---------------------------------------------------------------------------------------------- walls (centre lines)
// gaps are [from, to] along the wall; doors (below) fill some of them
const walls = [];
const hseg = (z, x0, x1, gaps = [], h = WH) => { // a wall running along x at z
  let a = x0 - T / 2;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > a) walls.push([a, g0, z - T / 2, z + T / 2, h, 'full']); a = g1; }
  if (x1 + T / 2 > a) walls.push([a, x1 + T / 2, z - T / 2, z + T / 2, h, 'full']);
};
const vseg = (x, z0, z1, gaps = [], h = WH) => { // a wall running along z at x
  let a = z0 - T / 2;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > a) walls.push([x - T / 2, x + T / 2, a, g0, h, 'full']); a = g1; }
  if (z1 + T / 2 > a) walls.push([x - T / 2, x + T / 2, a, z1 + T / 2, h, 'full']);
};
// operating room (+ the CT's south wall, one line): CT return door (barred from the CT side), a closed second door
hseg(-11.15, -10.93, 7.15, [[-6.0, -3.0], [3.3, 6.3]]); // (the closed door sits east of the table's head wall)
vseg(7.15, -11.15, -1.35, [[-7.84, -2.56]]); // east: the lift cassette fills the gap
hseg(-1.35, 3.8, 7.15); vseg(3.8, -1.35, 0.65); hseg(0.65, -7.15, 3.8); // the south-east notch, the south wall
vseg(-7.15, -11.15, 1.65, [[-5.6, -3.6]]); // west: the new door into the Supply Hall
// Supply Hall
hseg(-6.2, -12.85, -7.15); hseg(1.65, -27.6, -7.15, [[-24.8, -23.0], [-16.2, -14.4]]); // (the south line continues as the Waiting/Recovery wall)
vseg(-12.85, -7.2, 11.45, [[-5.6, -3.6], [-1.4, 0.4]]); // Supply|Waiting, then Recovery's east wall
// Waiting Area
hseg(-7.2, -25.6, -12.85);
vseg(-25.6, -22.9, 1.65, [[-20.9, -17.9], [-16.1, -13.1], [-6.6, -4.8], [-2.8, -0.8]]); // Maintenance|Cafeteria doors, then Pre-Op|Waiting doorways
// Pre-Op Holding
hseg(-11.15, -37.4, -25.6, [[-33.0, -31.2], [-28.2, -26.4]]); // Pre-Op|Maintenance doorways
vseg(-37.4, -19.0, 0.6); hseg(0.6, -37.4, -25.6);
// Maintenance (the north-west corner is cut away)
hseg(-19.0, -37.4, -33.5); vseg(-33.5, -22.9, -19.0); hseg(-22.9, -33.5, 0.89); // one north wall over Maintenance, Cafeteria and CT
// Cafeteria
hseg(-10.15, -25.6, -14.8); vseg(-14.8, -12.1, -10.15); hseg(-12.1, -14.8, -10.93);
vseg(-10.93, -22.9, -11.15, [[-21.0, -19.2], [-15.6, -13.6]]); // two open doorways into CT
// CT Imaging (east: the closed staff room)
vseg(0.89, -22.9, -11.15, [[-20.8, -17.8], [-16.9, -13.9]]);
// Recovery Bay (west: the closed lobby)
vseg(-27.6, 1.65, 11.45, [[3.57, 6.57], [7.46, 10.46]]); hseg(11.45, -27.6, -12.85);

// ---------------------------------------------------------------------------------------------- doors
// kind: open (frame only) | closed (a shut double door) | braced (the cafeteria brace, removable from `side`)
//       barred (the CT-side bar: removable only from `side`) | lift (the elevator kit)
// axis 'x': the wall runs along x (the door faces n/s); 'z': along z (faces e/w). face: the side the kit's front looks at.
export const DOORS = [
  { id: 'or_supply', kind: 'open', x: -7.15, z: -4.6, axis: 'z', width: 2.0 },
  { id: 'supply_wait_n', kind: 'open', x: -12.85, z: -4.6, axis: 'z', width: 2.0 },
  { id: 'supply_wait_s', kind: 'open', x: -12.85, z: -0.5, axis: 'z', width: 1.8 },
  { id: 'wait_preop_n', kind: 'open', x: -25.6, z: -5.7, axis: 'z', width: 1.8 },
  { id: 'wait_preop_s', kind: 'open', x: -25.6, z: -1.8, axis: 'z', width: 2.0 },
  { id: 'wait_rec_w', kind: 'open', x: -23.9, z: 1.65, axis: 'x', width: 1.8 },
  { id: 'wait_rec_e', kind: 'open', x: -15.3, z: 1.65, axis: 'x', width: 1.8 },
  { id: 'preop_maint_w', kind: 'open', x: -32.1, z: -11.15, axis: 'x', width: 1.8 },
  { id: 'preop_maint_e', kind: 'open', x: -27.3, z: -11.15, axis: 'x', width: 1.8 },
  { id: 'cafe_ct_n', kind: 'open', x: -10.93, z: -20.1, axis: 'z', width: 1.8 },
  { id: 'cafe_ct_s', kind: 'open', x: -10.93, z: -14.6, axis: 'z', width: 2.0 },
  { id: 'brace', kind: 'braced', x: -25.6, z: -14.6, axis: 'z', width: 3.0, face: 'w', side: 'w' }, // Maintenance -> Cafeteria
  { id: 'ctbar', kind: 'barred', x: -4.5, z: -11.15, axis: 'x', width: 3.0, face: 'n', side: 'n' }, // CT -> OR, from the CT side
  { id: 'maint_cafe_2', kind: 'closed', x: -25.6, z: -19.4, axis: 'z', width: 3.0, face: 'w' },
  { id: 'or_ct_2', kind: 'closed', x: 4.8, z: -11.15, axis: 'x', width: 3.0, face: 's' },
  { id: 'staff_1', kind: 'closed', x: 0.89, z: -19.3, axis: 'z', width: 3.0, face: 'w' },
  { id: 'staff_2', kind: 'closed', x: 0.89, z: -15.4, axis: 'z', width: 3.0, face: 'w' },
  { id: 'lobby_1', kind: 'closed', x: -27.6, z: 5.07, axis: 'z', width: 3.0, face: 'e' },
  { id: 'lobby_2', kind: 'closed', x: -27.6, z: 8.96, axis: 'z', width: 3.0, face: 'e' },
  { id: 'lift', kind: 'lift', x: 7.2, z: -5.2, axis: 'z', width: 5.28, face: 'w' },
];
// the elevator: root at the threshold, front facing the OR (west); the cab extends east
export const LIFT = {
  x: 7.2, z: -5.2, yaw: -Math.PI / 2,
  cab: { minX: 7.5, maxX: 10.45, minZ: -6.66, maxZ: -3.74 }, // finished cab floor (world)
  threshold: { minX: 6.55, maxX: 7.55, minZ: -6.4, maxZ: -4.0 },
  call: { x: 6.75, z: -3.9 }, // the call panel by the doors (the approach trigger)
};

// ---------------------------------------------------------------------------------------------- props
// p(m, x, z, rot, size [x, z] before rotation, h, extra): footprint follows the rotation
const props = [];
const p = (m, x, z, rot, size, h, extra = {}) => { const sw = rot % 180 === 90; props.push({ m, x, z, rot, fp: sw ? [size[1], size[0]] : [size[0], size[1]], h, ...extra }); };
// wall-mounted decoration: faces 'n'|'s'|'e'|'w'; (x, z) is the wall face it hangs on; y the bottom edge
const wp = (m, x, z, face, y, extra = {}) => props.push({ m, x, z, rot: { s: 0, n: 180, e: 90, w: 270 }[face], wall: face, y, fp: [0.1, 0.1], h: 0, noCollide: true, ...extra });

// 1 | operating room: one table (mid tier) under its ceiling light, the patient's head to the west at the anesthesia
//     workstation and monitor, an IV pole at the table's side; the head wall behind (north) carries gloves, sanitizer,
//     sharps and the clock; clear lanes all round. No door behind the table.
p(U + '04_surgery/operating_table_standard.glb', 0, -8.2, 90, [0.78, 1.65], 0.94);
p(U + '04_surgery/surgical_light_standard.glb', 0.75, -8.25, 0, [0.91, 0.85], 1.16, { y: 1.72, noCollide: true, name: 'orLight' }); // ceiling-mounted, over the knee (the operated end): never between the camera and his head
p(U + '02_anesthesia_monitoring/anesthesia_workstation_standard.glb', -2.25, -7.75, 90, [1.1, 0.7], 1.55, { name: 'orAnesthesia' }); // beside the head, facing the table (clear of Yola's spot at -1.6, -9.35)
p(U + '02_anesthesia_monitoring/patient_monitor_standard.glb', -0.7, -10.0, 0, [0.62, 0.71], 1.46, { name: 'orMonitor' });
p(U + '08_support_equipment/runtime/iv_stand_standard.glb', -1.25, -7.25, 0, [0.73, 0.7], 2.03, { noCollide: true }); // by the head, out of the line from the room to the patient
p(U + '08_support_equipment/runtime/supply_cart_standard.glb', 2.35, -10.6, 0, [0.88, 0.65], 1.21);
p(H + 'supply_cart.glb', -5.9, -7.4, 90, [1.16, 1.1], 1.23);
p(H + 'biohazard_bin.glb', -2.95, -10.7, 0, [0.39, 0.39], 0.69);
p(H + 'lidded_waste_bin.glb', 1.45, -10.75, 0, [0.36, 0.4], 0.58);
wp(M + 'furnishings/Endoscopy_Glove_Dispenser.glb', 0.35, -11.0, 's', 1.05);
wp(M + 'decor/Reception_Wall_Sanitizer.glb', 0.95, -11.0, 's', 1.1);
wp(M + 'decor3/Clinical_Sharps_Container.glb', -1.0, -11.0, 's', 1.1);
wp(M + 'decor/Recovery_Wall_Clock.glb', -0.3, -11.0, 's', 2.0);
p(M + 'furnishings/Clinical_Storage_Cabinet.glb', -6.75, -1.4, 90, [1.4, 0.62], 0.88);
p(H + 'procedure_stretcher.glb', 1.8, -2.6, 90, [0.9, 1.66], 1.22);
p(H + 'wheelchair.glb', -4.0, -0.3, 0, [0.76, 0.91], 0.97);
p(H + 'lidded_waste_bin.glb', 3.4, 0.2, 0, [0.36, 0.4], 0.58);
wp(M + 'furnishings/Clinical_Wall_Cupboard.glb', -6.75 - 0.25, -1.4, 'e', 1.45); // over the cabinet (west wall)
wp(M + 'decor3/Clinical_Sharps_Container.glb', -7.0, -2.9, 'e', 1.1);
wp(M + 'furnishings/Endoscopy_Glove_Dispenser.glb', -7.0, -6.6, 'e', 1.0);
// 2 | supply hall: shelving and carts on the walls, the patient-belongings table by the OR door, a clear lane
p(M + 'furnishings/Lounge_Break_Table.glb', -9.6, -5.55, 0, [0.9, 0.9], 0.74, { name: 'belongings' });
p(M + 'utility/Utility_Supply_Shelf.glb', -7.6, -0.9, 270, [1.39, 0.53], 2.0);
p(M + 'utility/Utility_Supply_Shelf.glb', -11.3, -5.75, 0, [1.39, 0.53], 2.0);
p(U + '08_support_equipment/runtime/supply_cart_starter.glb', -11.0, 1.05, 180, [0.78, 0.52], 1.01);
p(M + 'utility/Utility_Laundry_Hamper.glb', -8.0, 1.2, 0, [0.6, 0.54], 0.97);
p(H + 'lidded_waste_bin.glb', -7.6, -2.75, 0, [0.36, 0.4], 0.58);
p(M + 'utility/Utility_Wet_Floor_Sign.glb', -10.3, -2.2, 30 - 30, [0.36, 0.66], 0.67, { noCollide: true });
// 3 | waiting area / reception: the desk on the north wall, a grouped seating island, planters; open fighting lanes
p(U + '01_reception/reception_T2_desk.glb', -20.2, -5.3, 180, [2.2, 0.9], 1.1); // the staff side (+z of the model) to the north
p(U + '01_reception/reception_T2_chair.glb', -20.2, -6.35, 0, [0.63, 0.62], 0.99, { noCollide: true });
p(M + 'decor/Reception_Linked_Seats_3.glb', -19.6, -2.45, 180, [2.61, 0.62], 0.92); // a grouped, back-to-back seating island
p(M + 'decor/Reception_Linked_Seats_3.glb', -19.6, -1.75, 0, [2.61, 0.62], 0.92);
p(U + '12_lobby/lobby_T2_floor_planter.glb', -21.35, -2.1, 0, [0.55, 0.86], 1.2, { fit: true });
p(U + '12_lobby/lobby_T2_floor_planter.glb', -17.85, -2.1, 0, [0.55, 0.86], 1.2, { fit: true });
p(M + 'decor/Reception_Linked_Seats_3.glb', -23.4, -6.65, 0, [2.61, 0.62], 0.92);
p(M + 'decor/Reception_Water_Cooler.glb', -13.45, -6.7, 0, [0.44, 0.49], 1.47);
p(M + 'decor/Reception_Magazine_Rack.glb', -14.6, -6.75, 0, [0.55, 0.43], 1.05);
p(M + 'decor/Reception_Linked_Seats_3.glb', -21.0, 1.2, 180, [2.61, 0.62], 0.92);
wp(U + '12_lobby/lobby_T2_health_poster.glb', -17.4, -7.05, 's', 1.15);
wp(M + 'decor/Reception_Poster_Clinician.glb', -22.8, -7.05, 's', 1.15);
// 4 | pre-op holding: beds along the west wall with screens, gurneys parked mid-room, a clear route north
for (const [i, bz] of [-9.4, -6.4, -3.4].entries()) {
  p(H + 'recovery_bed.glb', -36.1, bz, 90, [1.25, 2.11], 0.87);
  p(H + 'bedside_cabinet.glb', -36.9, bz + 1.05, 90, [0.52, 0.63], 0.81);
  if (i < 2) p(H + 'privacy_screen.glb', -35.9, bz + 1.5, 90, [0.14, 1.84], 1.97);
  p(U + '08_support_equipment/runtime/iv_stand_starter.glb', -35.0, bz - 0.9, 0, [0.68, 0.65], 1.99, { noCollide: true });
}
p(H + 'procedure_stretcher.glb', -31.4, -6.6, 0, [0.9, 1.66], 1.22);
p(H + 'procedure_stretcher.glb', -30.0, -1.4, 90, [0.9, 1.66], 1.22);
p(H + 'patient_monitor.glb', -33.6, -10.55, 0, [0.62, 0.71], 1.49);
p(H + 'supply_cart.glb', -36.6, -0.1, 90, [1.16, 1.1], 1.23);
p(M + 'decor/Recovery_Linen_Cabinet.glb', -29.3, -10.7, 0, [0.95, 0.59], 1.84);
wp(M + 'decor3/Clinical_Sign_PreOp.glb', -35.4, -11.0, 's', 2.2);
// 5 | maintenance: electrical cabinets and racks on the walls, the janitor corner, the lift-reset panel on the north wall
p(U + '10_janitor_utility/starter/10_starter_rack.glb', -36.9, -12.6, 90, [0.82, 0.51], 1.82);
p(U + '10_janitor_utility/starter/10_starter_rack.glb', -36.9, -14.0, 90, [0.82, 0.51], 1.82);
p(M + 'utility/Utility_Janitor_Cart.glb', -35.0, -17.8, 0, [0.83, 0.94], 1.24);
p(M + 'utility/Utility_Mop_Bucket.glb', -33.9, -18.2, 0, [0.43, 0.51], 0.66);
p(U + '10_janitor_utility/starter/10_starter_steel_sink.glb', -27.5, -22.4, 0, [0.87, 0.63], 1.16);
p(M + 'utility/Utility_Supply_Shelf.glb', -26.05, -22.0, 270, [1.39, 0.53], 2.0);
p(M + 'utility/Utility_Laundry_Hamper.glb', -26.05, -12.9, 0, [0.6, 0.54], 0.97);
wp(M + 'utility/Utility_Toolboard.glb', -35.6, -18.85, 's', 1.0);
props.push({ kind: 'bench', x: -32.55, z: -22.35, size: [1.8, 0.65, 0.92], color: 0x8c7a5c, fp: [1.8, 0.65], h: 0.92, name: 'workbench' });
props.push({ kind: 'pipes', x: -29.6, z: -22.75, len: 7.6, y: 2.25, noCollide: true, fp: [0.1, 0.1], h: 0 });
props.push({ kind: 'hazard', x: -29.5, z: -21.95, size: [1.6, 0.9], noCollide: true, fp: [0.1, 0.1], h: 0 });
p(M + 'utility/Utility_Supply_Shelf.glb', -36.95, -17.9, 90, [1.39, 0.53], 2.0);
p(U + '10_janitor_utility/starter/10_starter_mop_bucket.glb', -36.6, -11.9, 0, [0.63, 0.54], 1.55);
p(M + 'utility/Utility_Mop.glb', -36.0, -11.6, 0, [0.21, 0.21], 1.5, { noCollide: true });
props.push({ kind: 'box', x: -30.2, z: -16.4, size: [1.4, 0.7, 1.9], face: 's', color: 0x8f989b, fp: [1.4, 0.7], h: 1.9, name: 'switchgear' }); // electrical switchgear (procedural)
props.push({ kind: 'box', x: -36.95, z: -16.2, size: [1.6, 0.6, 2.1], face: 'e', color: 0x7d878a, fp: [0.6, 1.6], h: 2.1, name: 'panelboard' });
// 6 | staff cafeteria: the serving counter and vending on the north wall, tables with chairs (movement shaped, not blocked)
p(K + 'cafeteria_serving_counter.glb', -17.5, -22.25, 0, [2.46, 0.96], 1.53);
p(K + 'cafeteria_tray_return.glb', -15.6, -22.4, 0, [0.68, 0.56], 1.0);
p(K + 'cafeteria_vending_machine.glb', -12.0, -22.25, 0, [0.93, 0.87], 1.9);
p(K + 'cafeteria_vending_machine.glb', -13.0, -22.25, 0, [0.93, 0.87], 1.9);
for (const [tx, tz] of [[-22.3, -18.4], [-19.0, -18.8], [-22.0, -14.8], [-18.6, -15.2], [-15.6, -17.0]]) {
  p(H + 'break_table.glb', tx, tz, 0, [0.95, 0.86], 0.85);
  p(H + 'break_chair.glb', tx - 0.85, tz, 90, [0.72, 0.62], 0.92, { noCollide: true });
  p(H + 'break_chair.glb', tx + 0.85, tz, 270, [0.72, 0.62], 0.92, { noCollide: true });
  props.push({ m: K + 'cafeteria_meal_tray_set.glb', x: tx, z: tz, rot: 0, y: 0.85, fp: [0.1, 0.1], h: 0, noCollide: true });
}
// 7 | CT imaging: the scanner in the middle (a loop around it), the control pedestal, the lab bench
p(K + 'ct_scanner_gantry.glb', -5.5, -18.0, 0, [2.13, 0.87], 2.26);
p(K + 'ct_sliding_patient_table.glb', -5.5, -16.45, 0, [0.71, 2.05], 1.11);
p(K + 'ct_control_pedestal.glb', -2.0, -20.6, 0, [0.53, 0.49], 1.16);
p(K + 'isolation_windowed_partition.glb', -1.3, -19.6, 0, [2.0, 0.15], 2.4);
p(K + 'pharmacy_medicine_shelf.glb', -9.6, -22.45, 0, [1.39, 0.53], 1.95);
p(M + 'furnishings/Lounge_Break_Table.glb', -0.2, -21.9, 0, [0.9, 0.9], 0.74);
props.push({ m: K + 'lab_microscope.glb', x: -0.35, z: -21.95, rot: 0, y: 0.74, fp: [0.1, 0.1], h: 0, noCollide: true });
props.push({ m: K + 'lab_centrifuge.glb', x: 0.05, z: -21.8, rot: 0, y: 0.74, fp: [0.1, 0.1], h: 0, noCollide: true });
p(H + 'procedure_stretcher.glb', -9.0, -12.3, 90, [0.9, 1.66], 1.22);
// recovery bay: beds on the back wall with headwalls and screens, a bed by the east door (health), the guard's bag
for (const bx of [-21.4, -18.4]) {
  wp(U + '05_recovery_bay/RecoveryHeadwall_standard.glb', bx, 1.8, 's', 0);
  p(U + '05_recovery_bay/RecoveryBed_standard.glb', bx, 3.15, 0, [1.1, 2.11], 0.87);
  p(U + '05_recovery_bay/BedsideCabinet_standard.glb', bx + 0.9, 2.3, 0, [0.52, 0.5], 0.81);
}
p(U + '05_recovery_bay/PrivacyCurtain_standard.glb', -19.9, 3.15, 0, [0.14, 1.84], 1.97);
p(U + '05_recovery_bay/RecoveryBed_standard.glb', -16.6, 7.2, 90, [1.1, 2.11], 0.87);
p(U + '05_recovery_bay/BedsideCabinet_standard.glb', -14.75, 7.2, 270, [0.52, 0.5], 0.81, { name: 'healthCab' });
p(U + '05_recovery_bay/RecoveryBed_standard.glb', -24.6, 9.9, 180, [1.1, 2.11], 0.87);
p(U + '05_recovery_bay/RecoveryBed_standard.glb', -21.8, 9.9, 180, [1.1, 2.11], 0.87);
p(U + '05_recovery_bay/PrivacyCurtain_standard.glb', -23.2, 9.9, 0, [0.14, 1.84], 1.97);
p(U + '02_anesthesia_monitoring/patient_monitor_standard.glb', -26.9, 2.3, 90, [0.62, 0.71], 1.46);
p(M + 'decor/Recovery_Linen_Cabinet.glb', -13.4, 10.7, 270, [0.95, 0.59], 1.84);
wp(M + 'decor/Recovery_Wall_Clock.glb', -19.9, 1.8, 's', 2.15);

// ---------------------------------------------------------------------------------------------- wayfinding (canvas print signs)
// text / sub lines; (x, y, z) centre on the wall face; face: the direction the sign looks; w metres wide
export const SIGNS = [
  { text: '← MAINTENANCE', sub: 'Lift reset', x: 2.5, y: 2.05, z: -11.0, face: 's', w: 1.5 },
  { text: 'LIFT', sub: 'Power fault', x: 6.99, y: 2.3, z: -1.9, face: 'w', w: 0.9 },
  { text: 'BARRED', sub: 'From the CT side', x: -2.55, y: 1.75, z: -11.0, face: 's', w: 0.82 },
  { text: '← MAINTENANCE', sub: 'via Waiting · Pre-Op', x: -9.9, y: 2.2, z: -6.05, face: 's', w: 1.6 },
  { text: '← PRE-OP · MAINTENANCE', sub: 'Recovery Bay ↓', x: -16.0, y: 2.25, z: -7.05, face: 's', w: 1.8 },
  { text: 'MAINTENANCE ↑', sub: 'Lift reset panel', x: -29.7, y: 2.25, z: -11.0, face: 's', w: 1.4 },
  { text: 'CT / LIFT RETURN', sub: 'Staff Cafeteria — keep shut', x: -25.75, y: 1.85, z: -12.1, face: 'w', w: 1.6 },
  { text: 'LIFT RESET', sub: 'Local power', x: -29.5, y: 2.2, z: -22.75, face: 's', w: 0.9 },
  { text: 'OR · LIFT ↓', sub: 'Remove the bar', x: -2.3, y: 2.3, z: -22.75, face: 's', w: 1.2 },
];
// the supplied 2D room-name prints over doorways, read from inside the room they name
export const ROOM_SIGNS = [
  { id: 'operating_room', x: 4.55, y: 2.1, z: -10.99, face: 's', w: 1.5 },
  { id: 'maintenance', x: -31.5, y: 2.2, z: -22.75, face: 's', w: 1.4 },
  { id: 'cafeteria', x: -20.5, y: 2.3, z: -22.75, face: 's', w: 1.6 },
  { id: 'imaging', x: -6.0, y: 2.3, z: -22.75, face: 's', w: 1.4 },
  { id: 'recovery', x: -15.3, y: 2.3, z: 1.82, face: 's', w: 1.3 },
  { id: 'reception', x: -20.2, y: 2.35, z: -7.05, face: 's', w: 1.6 },
  { id: 'elevator', x: 6.99, y: 2.75, z: -8.3, face: 'w', w: 1.1 },
];

// ---------------------------------------------------------------------------------------------- encounters
// Zombies stand where placed until they sense Yola (sense: metres with line of sight, or half that without), are hit,
// or their group is woken (a trigger: the bat pickup brings the Supply Hall group in; the brace releases the Cafeteria).
export const GROUPS = [
  { id: 'or', zombies: [{ x: -1.75, z: -9.05, yaw: 0.75, wake: 1.8, look: 'patient' }, { x: 1.45, z: -9.7, yaw: -0.2, wake: 3.4, look: 'nurse' }, { x: -4.5, z: -6.4, yaw: 0.9, wake: 5.5 }, { x: 4.6, z: -9.2, yaw: -1.2, wake: 8.0 }] },
  { id: 'supply', trigger: 'bat', sense: 4.5, zombies: [{ x: -14.0, z: -4.6, yaw: Math.PI / 2 }, { x: -15.0, z: -4.0, yaw: Math.PI / 2 }, { x: -14.2, z: -0.4, yaw: Math.PI / 2 }] },
  { id: 'waiting', sense: 6.5, zombies: [{ x: -21.6, z: -0.6, yaw: 1.2 }, { x: -16.8, z: -5.4, yaw: 2.4 }, { x: -23.6, z: -4.2, yaw: 1.6 }, { x: -14.4, z: -2.7, yaw: 0.4 }] },
  { id: 'preop', sense: 6.0, zombies: [{ x: -33.4, z: -8.0, yaw: 0.3 }, { x: -31.6, z: -3.2, yaw: 2.0 }, { x: -27.9, z: -8.6, yaw: -2.6 }] },
  { id: 'maint', sense: 5.5, zombies: [{ x: -34.6, z: -13.4, yaw: 1.4 }, { x: -28.2, z: -18.4, yaw: -0.6 }] },
  { id: 'cafe', locked: true, trigger: 'brace', sense: 6.5, zombies: [{ x: -23.2, z: -20.5, yaw: 1.0 }, { x: -17.3, z: -20.5, yaw: -1.0 }, { x: -21.7, z: -17.0, yaw: -1.6 }, { x: -22.9, z: -13.4, yaw: -1.4 }] },
  { id: 'ct', sense: 6.0, zombies: [{ x: -8.6, z: -14.4, yaw: 2.6 }, { x: -2.2, z: -15.8, yaw: -2.2 }] },
  { id: 'recovery', sense: 4.5, zombies: [{ x: -20.2, z: 6.4, yaw: 0.6 }] },
];

// ---------------------------------------------------------------------------------------------- pickups and interactions
export const PICKUPS = [
  { id: 'bat', kind: 'weapon', weapon: 'bat', x: -9.6, z: -5.45, r: 1.3 },
  { id: 'pistol', kind: 'weapon', weapon: 'pistol', x: -15.8, z: -0.75, r: 1.1, mag: 12, label: 'The guard’s pistol' },
  { id: 'ammo', kind: 'ammo', weapon: 'pistol', rounds: 24, x: -14.85, z: 3.25, r: 1.0, label: 'Guard’s bag: spare rounds' },
  { id: 'health', kind: 'health', amount: 50, x: -14.75, z: 7.2, r: 1.0, label: 'First-aid case' },
];
export const INTERACT = [
  { id: 'liftReset', x: -29.5, z: -22.3, r: 1.35, label: 'Reset the lift' },
  { id: 'brace', x: -26.25, z: -14.6, r: 1.5, side: { axis: 'x', max: -25.6 }, label: 'Remove the brace' },
  { id: 'ctBar', x: -4.5, z: -11.85, r: 1.6, side: { axis: 'z', max: -11.15 }, label: 'Lift the bar' },
];

// ---------------------------------------------------------------------------------------------- the level
export const FLOOR3 = {
  name: 'floor3',
  bounds: { minX: -37.8, maxX: 11.0, minZ: -23.3, maxZ: 11.8 },
  playerStart: { x: 0.75, z: -6.05, yaw: 0.61 },
  walls, doors: DOORS, props, rooms: ROOMS,
  cutaway: true, // walls between the camera and Yola lower themselves (every room has walls on all sides)
  camBounds: { minX: -36.5, maxX: 10, minZ: -21.2, maxZ: 10.5 },
  lights: [ // a few amber emergency points where the story happens (each point light costs every lit pixel)
    { x: 6.0, y: 2.3, z: -5.2 }, { x: -29.5, y: 2.3, z: -21.2 }, { x: -26.8, y: 2.3, z: -14.6 }, { x: -4.5, y: 2.3, z: -12.6 }, { x: -19.5, y: 2.4, z: -3.0 },
  ],
};
