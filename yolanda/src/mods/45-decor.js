// Clinical decor.
// Wall art, service headwalls, signs and the tiered lobby fittings. Assets come from the
// Assessment/Recovery Clinical Identity Kit (models/decor2) and the saved Lobby designs
// (models/upgrades/12_lobby). Placement works on any wall of any room, so rotated or rebuilt rooms
// keep their decor.
(function () {
  const YC = window.YC;
  const D2 = "/models/decor2/";
  const L = "/models/upgrades/12_lobby/";
  YC.DECOR = {
    Art_Heart: D2 + "Clinical_Art_Heart.glb",
    Art_Lungs: D2 + "Clinical_Art_Lungs.glb",
    Art_Airway: D2 + "Clinical_Art_Airway.glb",
    Headwall: D2 + "Clinical_Service_Headwall.glb",
    ExamSet: D2 + "Clinical_Wall_Exam_Set.glb",
    Sign_Assessment: D2 + "Clinical_Sign_Assessment.glb",
    Sign_Bay: D2 + "Clinical_Sign_Bay01.glb",
    Sign_Recovery: D2 + "Clinical_Sign_Recovery.glb",
  };
  const D3 = "/models/decor3/";
  Object.assign(YC.DECOR, {
    Art_Digestive: D3 + "Clinical_Art_Digestive.glb",
    Art_Checklist: D3 + "Clinical_Art_Preparation_Checklist.glb",
    Sign_Endoscopy: D3 + "Clinical_Sign_Endoscopy.glb",
    Sign_OR: D3 + "Clinical_Sign_OR.glb",
    Sign_PreOp: D3 + "Clinical_Sign_PreOp.glb",
    Sign_Bay2: D3 + "Clinical_Sign_Bay02.glb",
    Glove: D3 + "Clinical_Glove_Dispenser.glb",
    Sharps: D3 + "Clinical_Sharps_Container.glb",
    Biohazard: D3 + "Clinical_Biohazard_Bin.glb",
    Sanitizer: "/models/decor/Reception_Wall_Sanitizer.glb",
    SinkBase: "/models/rooms/Clinical_Handwash_Cabinet_Base.glb",
    SinkBasin: "/models/rooms/Clinical_Handwash_Basin.glb",
    Soap: "/models/rooms/Clinical_Soap_Dispenser.glb",
    Towel: "/models/rooms/Clinical_Towel_Dispenser.glb",
  });
  for (const t of [1, 2, 3]) {
    YC.DECOR["Lobby_Way_" + t] = L + `lobby_T${t}_wayfinding.glb`;
    YC.DECOR["Lobby_Poster_" + t] = L + `lobby_T${t}_health_poster.glb`;
  }

  YC.probeDecor = () => Promise.allSettled(Object.entries(YC.DECOR).map(async ([n, u]) => { const g = await Nt(u); return n + ':' + !!g.scene; })).then((r) => r.map((x) => x.status + ':' + (x.value ?? String(x.reason?.message ?? x.reason))));
  // The base decor set is loaded once at module start, so load ours separately and re-sync the scene.
  const loadExtra = () =>
    Promise.allSettled(Object.entries(YC.DECOR).map(async ([name, url]) => Os.set(name, (await Nt(url)).scene))).then(() => {
      try {
        YC.controller?.adapter.view.refreshAssets();
      } catch {}
    });
  YC.decorLoaded = loadExtra();

  const OPPOSITE = { N: "S", S: "N", W: "E", E: "W" };

  // Sides of a rectangular room: wall cells and door cells per side, in grid indices.
  function sides(a, room) {
    const cells = room.cells.map($e);
    const x0 = Math.min(...cells.map((c) => c.x)), x1 = Math.max(...cells.map((c) => c.x));
    const y0 = Math.min(...cells.map((c) => c.y)), y1 = Math.max(...cells.map((c) => c.y));
    const edge = (axis, x, y) => a.edges.find((e) => e.axis === axis && e.x === x && e.y === y);
    const out = {};
    const make = (name, axis, fixedX, fixedY, from, to) => {
      const walls = [], doors = [];
      for (let i = from; i <= to; i++) {
        const e = axis === "h" ? edge("h", i, fixedY) : edge("v", fixedX, i);
        if (e?.kind === "door") doors.push(i);
        else if (e?.kind === "wall") walls.push(i);
      }
      out[name] = { name, walls, doors };
    };
    make("N", "h", 0, y0, x0, x1);
    make("S", "h", 0, y1 + 1, x0, x1);
    make("W", "v", x0, 0, y0, y1);
    make("E", "v", x1 + 1, 0, y0, y1);
    return { out, x0, x1, y0, y1 };
  }

  // along: metres to slide the piece along the wall (positive = towards larger x or z)
  function place(a, geo, side, idx, asset, y = 0, push = 0, along = 0) {
    const t = a.config.cellSize, i = a.config.wallThickness / 2 + 0.006 + push;
    const mid = (idx + 0.5) * t + along;
    if (side === "N") return { asset, x: mid, y, z: geo.y0 * t + i, yaw: 0 };
    if (side === "S") return { asset, x: mid, y, z: (geo.y1 + 1) * t - i, yaw: Math.PI };
    if (side === "W") return { asset, x: geo.x0 * t + i, y, z: mid, yaw: Math.PI / 2 };
    return { asset, x: (geo.x1 + 1) * t - i, y, z: mid, yaw: -Math.PI / 2 };
  }

  const deskTier = (a, room) => {
    const d = a.objects.find((o) => (o.asset === "reception-equipped" || o.asset === "reception") && room.cells.includes(F(o)));
    return Math.max(1, Math.min(3, d?.tier ?? 1));
  };

  // Decor only goes on walls that stay full height in the default camera (north, and west when the
  // wall is not shared with the room next door); the near walls are cut away.
  const ROOMS = ["Assessment", "Recovery", "Reception", "Endoscopy"];
  const TEMPLATES = ["assessment", "recovery", "lobby-starter", "lobby-a", "lobby-b", "endoscopy", "surgery"];
  function clinicalDecor(a) {
    const items = [];
    for (const room of a.rooms) {
      const asm = a.assemblies?.find((m) => m.roomId === room.id);
      const fn = room.function;
      if (!ROOMS.includes(fn)) continue;
      if (asm && !TEMPLATES.includes(asm.templateId)) continue;
      const tid = asm?.templateId;
      const isOR = tid === "surgery";
      const { out: s, ...geo } = sides(a, room);
      const N = s.N;
      const put = (side, idx, asset, y = 0, push = 0, along = 0) => items.push(place(a, geo, side, idx, asset, y, push, along));
      // free floor cells (no equipment on them) for floor-standing props and the wash station
      const occ = new Set(a.objects.filter((o) => room.cells.includes(F(o))).flatMap((o) => Ht(o).map((c) => c.x + "," + c.y)));
      const nearDoor = (side, idx) => s[side].doors.some((d) => Math.abs(d - idx) <= 1);
      // wall cells on the north wall, taken one prop at a time in order of preference
      const usedN = new Set();
      const slotN = (...prefer) => {
        for (const i of prefer) {
          const idx = typeof i === "number" ? N.walls[i < 0 ? N.walls.length + i : i] : undefined;
          if (idx !== undefined && !usedN.has(idx)) return usedN.add(idx), idx;
        }
        const free = N.walls.find((w) => !usedN.has(w));
        return free === undefined ? void 0 : (usedN.add(free), free);
      };
      const wall = (i, ...rest) => i !== void 0 && put("N", i, ...rest);

      if (fn === "Assessment") {
        const w = N.walls;
        // narrow rooms trade the airway plaque for the preparation checklist
        const want = ["Art_Heart", "Art_Lungs", w.length > 4 ? "Art_Airway" : "Art_Checklist", "ExamSet"];
        const pick = w.length > 4 ? [w[0], w[1], w[w.length - 1], w[w.length - 2]] : w.slice(0, 4);
        pick.forEach((idx, n) => (usedN.add(idx), put("N", idx, want[n])));
        N.doors.length && put("N", N.doors.reduce((p, q) => p + q, 0) / N.doors.length, "Sign_Assessment");
        if (w.length > 4) wall(slotN(2, 3), "Art_Checklist");
        wall(slotN(-3, 4), "Sanitizer", 1.35);
        wall(slotN(-4, 5), "Glove");
      }
      if (fn === "Recovery") {
        let bed = 0;
        for (const o of a.objects.filter((o) => o.asset === "patient" && room.cells.includes(F(o)))) {
          const cs = Ht(o);
          if (Math.min(...cs.map((c) => c.y)) !== geo.y0) continue;
          const cx = cs.reduce((p, c) => p + c.x, 0) / cs.length;
          if (!N.walls.includes(Math.round(cx - 0.01))) continue;
          put("N", cx, "Headwall");
          if (bed < 2) put("N", cx, bed === 0 ? "Sign_Bay" : "Sign_Bay2");
          bed++;
        }
        N.doors.length && put("N", N.doors.reduce((p, q) => p + q, 0) / N.doors.length, "Sign_Recovery");
      }
      if (fn === "Reception") {
        const tier = deskTier(a, room);
        const desk = a.objects.find((o) => (o.asset === "reception-equipped" || o.asset === "reception") && room.cells.includes(F(o)));
        if (desk) {
          const cs = Ht(desk);
          const cx = cs.reduce((p, c) => p + c.x, 0) / cs.length;
          if (N.walls.includes(Math.round(cx - 0.01))) put("N", cx, "Lobby_Way_" + tier, 1.9, 0.01);
        }
        const west = s.W.walls.filter((y) => {
          const nb = a.rooms.find((r) => r.cells.includes(F({ x: geo.x0 - 1, y })));
          return !nb;
        });
        if (west.length >= 3) put("W", west[Math.floor(west.length / 2)], "Lobby_Poster_" + tier, 1.75, 0.01);
      }
      if (fn === "Endoscopy") {
        // procedure suites: anatomy art or OR sign, glove and sharps on the north wall, a bin in the corner, a wash station
        if (isOR) wall(slotN(1, 2), "Sign_OR");
        else {
          wall(slotN(1, 2), "Art_Digestive");
          wall(slotN(3, 4), "Sign_Endoscopy");
        }
        wall(slotN(-3, 5), "Glove");
        wall(slotN(-2, 6), "Sharps");
        wall(slotN(-1, 7), "Sanitizer", 1.35);
        for (const o of a.objects.filter((o) => o.asset === "patient" && room.cells.includes(F(o)))) {
          const cs = Ht(o);
          if (Math.min(...cs.map((c) => c.y)) !== geo.y0) continue;
          const cx = cs.reduce((p, c) => p + c.x, 0) / cs.length;
          if (N.walls.includes(Math.round(cx - 0.01))) put("N", cx, "Headwall");
        }
        // biohazard bin on the first free floor cell along the north wall
        const t = a.config.cellSize;
        const binX = [geo.x0, geo.x1, ...N.walls].find((x) => !occ.has(x + "," + geo.y0) && !nearDoor("N", x) && N.walls.includes(x));
        if (binX !== void 0) items.push({ asset: "Biohazard", x: (binX + 0.5) * t, y: 0, z: geo.y0 * t + 0.36, yaw: 0 });
        // wash station on the west wall when that wall is not shared and the floor cell is free
        const west = s.W.walls.filter((y) => !a.rooms.find((r) => r.cells.includes(F({ x: geo.x0 - 1, y }))) && !occ.has(geo.x0 + "," + y) && !nearDoor("W", y));
        if (west.length) {
          const y = west[Math.floor(west.length / 2)];
          put("W", y, "SinkBase", 0, 0.02);
          put("W", y, "SinkBasin", 0.92, 0.02);
          put("W", y, "Soap", 1.35, 0.02, 0.21);
          put("W", y, "Towel", 1.82, 0.02, -0.1);
        }
      }
    }
    return items;
  }

  YC.debugDecor = (build) => ({ items: clinicalDecor(build), loaded: Object.keys(YC.DECOR).filter((k) => Os.has(k)) });
  // Lobby floor follows the desk tier: plain beige starter, pale checker standard, blue checker advanced.
  const LOBBY_FLOOR = { 1: [0xd9d1ba, 0xd3cab2], 2: [0xc9e1ea, 0xece6d4], 3: [0x86c6de, 0xefe8d6] };
  YC.lobbyFloor = (a, asm) => {
    const room = a.rooms.find((r) => r.id === asm.roomId) ?? { cells: asm.cells };
    return LOBBY_FLOOR[deskTier(a, room)];
  };
  const baseFb = Fb;
  Fb = function (a) {
    let base = [];
    try {
      base = baseFb(a);
    } catch (err) {
      console.warn("decor", err);
    }
    try {
      return [...base, ...clinicalDecor(a)];
    } catch (err) {
      console.warn("clinical decor", err);
      return base;
    }
  };
})();
