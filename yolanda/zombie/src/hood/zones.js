// Chapter 2: the gauntlet's areas as polygons (world x, z) and, for each point of the story, where the player may be.
// Used by the leak test (tools/hood/leaktest.mjs) and by the level (which area the player is in).
// Seals are collision in the Blender export tagged 'seal:<id>' (blender/hood/dress_hood.py): shut until the story opens them.

// B06's inner end unit (B06-L, the open garage with the bolt cutters): its four corners (row 6 turned and shifted by the map
// clean-up, blender/hood/ch2_map.py; row 5 and row 3 as well, below)
const B06L = [[5.913, -9.637], [0.425, -4.673], [-8.141, -14.122], [-2.652, -19.086]];

export const ZONES = {
  // 1: Marc's yard and the loop's right arm, from the home row to the curve; B03 and B05 on either side
  home: [[28.9, -13.6], [30.0, -13.2], [47.4, -0.4], [55.0, 4.0], [71.5, 21.6], [56.62, 22.0], [59.93, 50.81], [36.3, 49.0], [36.3, 32.8], [28.9, 32.8]],
  // 1b: B05-L, the damaged end unit off Marc's yard (its garage stands open: a loot room, part of the home stop)
  b05l: [[47.627, -0.115], [53.645, 4.19], [61.053, -6.188], [55.034, -10.492]],
  // 2: the curve, the home row's back gardens, B06-L's garage and the gate yard up to the chained fence
  curve: [[1.86, -14.12], [34.6, -19.55], [30.0, -13.2], [28.9, -13.6], [28.9, 32.8], [6.6, 32.8], [1.75, 1.5], ...B06L.slice(1)],
  // 3-5: beyond the gate: the roundabout, the club front, the drive and the parking lot (the courts fenced off)
  club: [[1.86, -14.12], [34.6, -19.55], [33.6, -19.6], [33.6, -40.5], [41.5, -49.5], [105.5, -49.5], [105.1, -52], [93.1, -91], [27.0, -91.3], [27.6, -69.1],
    [20.7, -69.2], [20.5, -61.3], [20.4, -46.6], [-1.3, -46.6], [-1.0, -32.6], [-0.76, -16.7]],
  // 6: inside the clubhouse
  clubhouse: [[-1.27, -46.6], [20.4, -46.6], [20.4, -61.3], [-1.27, -61.3]],
  // 7-9: past the looters' roadblock: the pool, the lakeside, the pavilions, the playground and Grandma's front yard
  west: [[-0.76, -16.7], [-1.0, -32.6], [-1.3, -46.6], [-1.27, -61.3], [20.5, -61.3], [20.7, -69.2], [-12.6, -67.6], [-23.8, -67.6], [-75, -67.6], [-75, 7.4],
    [-58.2, 7.4], [-58.2, 18.4], [-45.3, 18.4], [-23.2, 19.4], [-23.47, 2.0], [-24.89, 0.45], [-2.65, -19.09]],
  // Marc's house, inside (blender/hood/ch2_home.py)
  house: [[29.0, 32.85], [36.3, 32.85], [36.3, 45.6], [29.0, 45.6]],
  // the dock (blender/hood/ch2_dock.py): from the club's back fence and the lake up to the fence by the trees, the service
  // road to the lot's west fence, the shed
  dock: [[-26.5, -67.0], [-12.6, -67.6], [26.3, -68.2], [27.6, -69.1], [27.0, -91.3], [28.8, -91.6], [20.0, -110.0], [8.0, -123.5], [-5.0, -124.0], [-19.0, -122.0],
    [-40.0, -110.5], [-58.0, -103.5], [-58.0, -100.0], [-27.6, -100.0]],
};

// each point of the story: where the player starts testing from, the areas allowed, the seals open by then
// reach: [mark, radius] the player must be able to get within (a pickup's or a prompt's radius), on foot from start
// (the story reset, 2026-10-20: level.js STOP_ORDER)
const H = ['home', 'b05l'];
export const STOPS = {
  home: { start: [37.5, 38.5], zones: H, open: [], reach: [['home_door_use', 1.4]] },
  house: { start: [35.3, 38.5], zones: [...H, 'house'], open: ['home_door'], reach: [['fridge_use', 1.4], ['james', 1.0]] },
  help: { start: [38.4, 34.5], zones: [...H, 'house'], open: ['home_door'], reach: [['seal_home_use', 2.0]] },
  gate: { start: [27.5, 9.5], zones: [...H, 'house', 'curve'], open: ['home_door', 'home'], reach: [['cutters', 1.3], ['gate_use', 2.2]] },
  club: { start: [18.6, -19.5], zones: [...H, 'house', 'curve', 'club'], open: ['home_door', 'home', 'gate'], reach: [['club_warn', 7], ['club_door', 2.6], ['dockroad_use', 2.2]] },
  clubhouse: { start: [9.6, -50], zones: [...H, 'house', 'curve', 'club', 'clubhouse'], open: ['home_door', 'home', 'gate', 'clubdoor'], reach: [['keys', 1.1]] },
  dock: { start: [36.5, -80.5], zones: [...H, 'house', 'curve', 'club', 'clubhouse', 'dock'], open: ['home_door', 'home', 'gate', 'clubdoor', 'dockroad'], reach: [['pour_fuel', 2.4], ['shed_door', 1.6]] },
  shed: { start: [-8.6, -108.2], zones: [...H, 'house', 'curve', 'club', 'clubhouse', 'dock'], open: ['home_door', 'home', 'gate', 'clubdoor', 'dockroad', 'shed'], reach: [['shed_gas', 1.3], ['shed_shotgun', 1.6]] },
  horde: { start: [-10.5, -100], zones: [...H, 'house', 'curve', 'club', 'clubhouse', 'dock', 'west'], open: ['home_door', 'home', 'gate', 'clubdoor', 'dockroad', 'shed', 'dock'], reach: [['pour_fuel', 2.4]] },
};
