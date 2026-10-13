// Hospital combat wing. Plain data shared by the simulation (colliders, spawns) and the renderer (models).
// Ground plane: x -7..7 (left..right), z -11..11 (top of screen .. bottom). Camera looks toward -z.
// Props use 0/90/180/270 degree rotations only so their footprints stay axis-aligned.
// fp = collision footprint [w (x), d (z)] AFTER rotation; h = height (shots pass over anything below ~1.25 m).

const M = 'assets/models/';
export const LAYOUT = {
  bounds: { minX: -7.6, maxX: 7.6, minZ: -11.6, maxZ: 11.6 },
  playerStart: { x: 0.4, z: 2.2, yaw: Math.PI },
  // walls: [minX, maxX, minZ, maxZ, h, style]; style 'full' (back walls), 'low' (camera-side cutaway), 'glass'
  walls: [
    // north wall with two doorways (x -5.2..-3.6 and 3.4..5.0)
    [-7.3, -5.2, -11.3, -11, 2.7, 'full'], [-3.6, 3.4, -11.3, -11, 2.7, 'full'], [5.0, 7.3, -11.3, -11, 2.7, 'full'],
    // west wall, doorway z 1.0..2.6
    [-7.3, -7, -11, 1.0, 2.7, 'full'], [-7.3, -7, 2.6, 11.3, 2.7, 'full'],
    // east wall (camera side): low cutaway, doorway z -4.0..-2.4
    [7, 7.3, -11, -4.0, 0.95, 'low'], [7, 7.3, -2.4, 11.3, 0.95, 'low'],
    // south wall (camera side): low cutaway
    [-7.3, 7.3, 11, 11.3, 0.95, 'low'],
    // OR glass partitions with a 4.4 m central opening
    [-7, -2.2, -5.15, -4.95, 1.5, 'glass'], [2.2, 7, -5.15, -4.95, 1.5, 'glass'],
  ],
  doors: [
    { id: 'NW', x: -4.4, z: -11.15, axis: 'x', width: 1.6, spawn: { x: -4.4, z: -10.3 }, yaw: 0 },
    { id: 'NE', x: 4.2, z: -11.15, axis: 'x', width: 1.6, spawn: { x: 4.2, z: -10.3 }, yaw: 0 },
    { id: 'W', x: -7.15, z: 1.8, axis: 'z', width: 1.6, spawn: { x: -6.35, z: 1.8 }, yaw: Math.PI / 2 },
    { id: 'E', x: 7.15, z: -3.2, axis: 'z', width: 1.6, spawn: { x: 6.35, z: -3.2 }, yaw: -Math.PI / 2 },
  ],
  props: [
    // operating room (north)
    { m: M + 'upgrades/04_surgery/operating_table_standard.glb', x: 0, z: -8.2, rot: 90, fp: [1.7, 0.8], h: 0.95 },
    { m: M + 'upgrades/02_anesthesia_monitoring/anesthesia_workstation_standard.glb', x: -2.3, z: -10.35, rot: 0, fp: [0.9, 0.7], h: 1.6 },
    { m: M + 'upgrades/02_anesthesia_monitoring/patient_monitor_standard.glb', x: 2.2, z: -10.45, rot: 0, fp: [0.6, 0.5], h: 1.6 },
    { m: M + 'upgrades/08_support_equipment/runtime/supply_cart_standard.glb', x: -5.9, z: -7.4, rot: 90, fp: [0.65, 0.88], h: 1.2 },
    { m: M + 'upgrades/08_support_equipment/runtime/iv_stand_standard.glb', x: 1.6, z: -9.0, rot: 0, fp: [0.4, 0.4], h: 1.9, noCollide: true },
    { m: M + 'upgrades/08_support_equipment/runtime/supply_cart_standard.glb', x: 6.1, z: -7.0, rot: 270, fp: [0.65, 0.88], h: 1.2 },
    // central hall: nurse station island (circle around it), stretcher, plants
    { m: M + 'upgrades/01_reception/reception_T2_desk.glb', x: 2.9, z: -0.6, rot: 0, fp: [2.5, 1.0], h: 1.1, fit: true },
    { m: M + 'upgrades/03_endoscopy/procedure_stretcher_standard.glb', x: -3.4, z: -1.6, rot: 0, fp: [0.9, 2.1], h: 0.95, fit: true },
    { m: M + 'upgrades/12_lobby/lobby_T2_floor_planter.glb', x: -6.5, z: -4.3, rot: 0, fp: [0.6, 0.6], h: 1.2, fit: true },
    { m: M + 'upgrades/12_lobby/lobby_T2_floor_planter.glb', x: 6.5, z: -1.8, rot: 0, fp: [0.6, 0.6], h: 1.2, fit: true },
    // lounge (south, calm start area)
    { m: M + 'furnishings/Lounge_Sofa_2.glb', x: -4.6, z: 9.9, rot: 180, fp: [2.05, 0.65], h: 0.9 },
    { m: M + 'furnishings/Lounge_Break_Table.glb', x: -4.6, z: 7.9, rot: 0, fp: [1.0, 0.7], h: 0.75, fit: true },
    { m: M + 'furnishings/Lounge_Locker_Bank_3.glb', x: -6.65, z: 5.6, rot: 90, fp: [0.6, 1.45], h: 1.85 },
    { m: M + 'upgrades/11_staff_lounge/standard/11_standard_coffee_counter.glb', x: -1.2, z: 10.55, rot: 180, fp: [1.4, 0.6], h: 0.95, fit: true },
    // recovery bays (east)
    { m: M + 'upgrades/05_recovery_bay/RecoveryBed_standard.glb', x: 5.6, z: 5.0, rot: 90, fp: [2.11, 1.1], h: 0.9 },
    { m: M + 'upgrades/05_recovery_bay/RecoveryBed_standard.glb', x: 5.6, z: 8.6, rot: 90, fp: [2.11, 1.1], h: 0.9 },
    { m: M + 'upgrades/05_recovery_bay/BedsideCabinet_standard.glb', x: 6.55, z: 6.8, rot: 270, fp: [0.5, 0.5], h: 0.85, fit: true },
  ],
};

export function buildWorld(World) {
  const w = new World(LAYOUT.bounds);
  for (const [a, b, c, d, h, style] of LAYOUT.walls) w.addBox(a, b, c, d, h, style);
  for (const p of LAYOUT.props) {
    if (p.noCollide) continue;
    w.addBox(p.x - p.fp[0] / 2, p.x + p.fp[0] / 2, p.z - p.fp[1] / 2, p.z + p.fp[1] / 2, p.h, 'prop');
  }
  // seal the doorways so nothing walks out (zombies enter from just inside them)
  for (const d of LAYOUT.doors) {
    if (d.axis === 'x') w.addBox(d.x - d.width / 2, d.x + d.width / 2, d.z - 0.45, d.z - 0.15, 2.7, 'doorSeal');
    else if (d.x < 0) w.addBox(d.x - 0.45, d.x - 0.15, d.z - d.width / 2, d.z + d.width / 2, 2.7, 'doorSeal');
    else w.addBox(d.x + 0.15, d.x + 0.45, d.z - d.width / 2, d.z + d.width / 2, 2.7, 'doorSeal');
  }
  w.buildNav(0.25, 0.3);
  return w;
}
