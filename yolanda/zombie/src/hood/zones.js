// Chapter 2: the gauntlet's areas as polygons (world x, z) and, for each point of the story, where the player may be.
// Used by the leak test (tools/hood/leaktest.mjs) and by the level (which area the player is in).
// Seals are collision in the Blender export tagged 'seal:<id>' (blender/hood/dress_hood.py): shut until the story opens them.

// B06's inner end unit (B06-L, the open garage with the bolt cutters): its four corners
const B06L = [[7.59, -3.44], [1.73, 1.08], [-6.07, -9.01], [-0.21, -13.53]];

export const ZONES = {
  // 1: Marc's yard and the loop's right arm, from the home row to the curve; B03 and B05 on either side
  home: [[28.9, -6.8], [47.5, 2.0], [55.0, 4.0], [71.5, 21.6], [59.6, 21.0], [59.6, 50.0], [36.3, 49.0], [36.3, 32.8], [28.9, 32.8]],
  // 1b: B05-L, the damaged end unit off Marc's yard (its garage stands open: a loot room, part of the home stop)
  b05l: [[47.43, 1.92], [54.13, 5.06], [59.53, -6.49], [52.83, -9.63]],
  // 2: the curve, the home row's back gardens, B06-L's garage and the gate yard up to the chained fence
  curve: [[-0.65, -13.7], [33.12, -19.3], [32.72, -19.04], [27.32, -7.49], [28.9, -6.8], [28.9, 32.8], [6.6, 32.8], ...B06L.slice(1), B06L[3]],
  // 3-5: beyond the gate: the roundabout, the club front, the drive and the parking lot (the courts fenced off)
  club: [[-0.65, -13.7], [33.12, -19.3], [33.6, -19.6], [33.6, -40.5], [41.5, -49.5], [105.5, -49.5], [105.1, -52], [93.1, -91], [28.6, -91], [26.1, -69.4],
    [20.7, -69.2], [20.5, -61.3], [20.4, -46.6], [-1.3, -46.6], [-1.0, -32.6], [-0.6, -13.9]],
  // 6: inside the clubhouse
  clubhouse: [[-1.27, -46.6], [20.4, -46.6], [20.4, -61.3], [-1.27, -61.3]],
  // 7-9: past the looters' roadblock: the pool, the lakeside, the pavilions, the playground and Grandma's front yard
  west: [[-0.6, -13.9], [-1.0, -32.6], [-1.3, -46.6], [-1.27, -61.3], [20.5, -61.3], [20.7, -69.2], [-12.6, -67.6], [-23.8, -67.6], [-75, -67.6], [-75, 7.4],
    [-58.2, 7.4], [-58.2, 18.4], [-45.3, 18.4], [-23.2, 19.4], [-22.9, 6.8], [-23.2, 4.3], [-0.21, -13.53]],
  // 10: the dock trail past the launch gate
  dock: [[-12.6, -67.6], [-23.8, -67.6], [-40, -67.6], [-40, -96], [-10, -96], [-12.4, -66.9]],
};

// each point of the story: where the player starts testing from, the areas allowed, the seals open by then
// reach: [mark, radius] the player must be able to get within (a pickup's or a prompt's radius), on foot from start
export const STOPS = {
  home: { start: [38.2, 40.6], zones: ['home', 'b05l'], open: [], reach: [['rifle_drop', 1.1], ['seal_home_use', 2.0]] },
  curve: { start: [24, 10.5], zones: ['home', 'b05l', 'curve'], open: ['home'], reach: [['cutters', 1.2], ['gate_use', 2.2]] },
  club: { start: [18.6, -21], zones: ['home', 'b05l', 'curve', 'club'], open: ['home', 'gate'], reach: [['gas_can', 1.6], ['club_warn', 7], ['roadblock_use', 2.0]] },
  clubhouse: { start: [9.6, -50], zones: ['home', 'b05l', 'curve', 'club', 'clubhouse'], open: ['home', 'gate', 'clubdoor'], reach: [['leader', 1.2], ['club_door', 2.5]] },
  west: { start: [-10, -30], zones: ['home', 'b05l', 'curve', 'club', 'clubhouse', 'west', 'dock'], open: ['home', 'gate', 'clubdoor', 'roadblock', 'dock'], reach: [['grandma_door', 2.0], ['playground', 7], ['pour_fuel', 2.4]] },
  dock: { start: [-18, -75], zones: ['home', 'b05l', 'curve', 'club', 'clubhouse', 'west', 'dock'], open: ['home', 'gate', 'clubdoor', 'roadblock', 'dock'], reach: [['pour_fuel', 2.4]] },
};
