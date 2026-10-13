// Career starter hospital.
// A spine-and-concourse floor plan built from the game's own room templates, so every wall, door
// and route passes the same validation as the in-game builder.
//
//            spine (x14-17)
//   [OR pad]   |   [2nd suite pad]
//   Endoscopy  |   Recovery        y10-17
//   ---------- concourse y18-20 ----------
//   Janitor Restroom  LOBBY  Assessment    y21+
//                      |
//                   entrance
(function () {
  const YC = window.YC;

  // Starter lobby: a modest, mismatched waiting room with too few seats. Upgrading it is the point.
  const gt2 = (asset, x, y, rotation = 0) => ({ asset, x, y, rotation });
  Uh.push({
    id: "lobby-starter",
    name: "Starter lobby",
    function: "Reception",
    hidden: true,
    width: 8,
    depth: 8,
    door: 4,
    rearDoor: 1,
    floorStyle: "clinical",
    description: "A small, tired lobby: one desk and four mismatched chairs.",
    staff: "One receptionist",
    status: "Starter",
    objects: [
      gt2("reception-equipped", 5, 1, 0),
      gt2("waiting", 0, 3, 3),
      gt2("waiting", 0, 4, 3),
      gt2("waiting", 0, 5, 3),
      gt2("waiting", 0, 6, 3),
      gt2("broadleaf", 0, 0),
      gt2("broadleaf", 7, 7),
      gt2("water-cooler", 7, 1),
      gt2("magazines", 7, 4),
    ],
  });

  YC.placeTemplate = (state, templateId, origin, rotation = 0) => Dl(state, { templateId, origin, rotation });

  YC.careerLayout = function () {
    const base = ya();
    const e = ni(base.config);
    e.serial = 500;
    const paint = (x, y, w, h) => {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) e.floors.includes(i + "," + j) || e.floors.push(i + "," + j);
    };
    paint(4, 18, 24, 3); // concourse
    paint(14, 6, 4, 12); // spine
    paint(17, 29, 3, 5); // entrance approach
    e.entrance = { x: 16, y: 10 }; // placeholder inside the hall until the lobby exists
    let state = e;
    const put = (templateId, origin, rotation) => {
      const r = Dl(state, { templateId, origin, rotation });
      if (r.error) throw Error(templateId + " @" + origin.x + "," + origin.y + ": " + r.error);
      state = r.state;
    };
    put("lobby-starter", { x: 14, y: 21 }, 0);
    // single front doorway with canopy: keep only x=18 as the door
    for (const ed of state.edges.filter((s) => s.axis === "h" && s.y === 29 && s.x >= 14 && s.x < 22)) {
      ed.kind = ed.x === 18 ? "door" : "wall";
      delete ed.doorGroup;
      delete ed.navigationLane;
    }
    state.entrance = { x: 18, y: 33 };
    state.frontEntrance = { axis: "h", x: 18, y: 29, outward: 1 };
    put("assessment", { x: 22, y: 21 }, 2);
    put("restroom", { x: 8, y: 21 }, 2);
    put("utility-nook", { x: 4, y: 21 }, 2);
    put("endoscopy", { x: 6, y: 10 }, 0);
    put("recovery", { x: 18, y: 10 }, 0);
    return state;
  };
})();
