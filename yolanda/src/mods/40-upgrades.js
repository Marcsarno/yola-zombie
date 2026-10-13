// Equipment tiers.
// Everything starts as the shabby Starter model (tier 1). Money upgrades it to the Standard
// (tier 2) and Advanced (tier 3) models from the upgrade kits. Tiers change how a room performs.
(function () {
  const YC = window.YC;
  const K = "/models/upgrades/";
  const defs = [
    ["work", "Anesthesia workstation", K + "02_anesthesia_monitoring/anesthesia_workstation_%.glb"],
    ["endoscopy", "Endoscopy tower", K + "03_endoscopy/endoscopy_tower_%.glb"],
    ["patient", "Procedure stretcher", K + "03_endoscopy/procedure_stretcher_%.glb"],
    ["table", "Operating table", K + "04_surgery/operating_table_%.glb"],
    ["air", "AirReady", K + "06_prep_airway/AirReady_%.glb"],
    ["seda", "SedaPrep", K + "06_prep_airway/SedaPrep_%.glb"],
    ["warm", "ThermaNest", K + "07_warmth_teamwork/ThermaNest_%.glb"],
    ["iv", "IV stand", K + "08_support_equipment/runtime/iv_stand_%.glb"],
    ["supply", "Supply cart", K + "08_support_equipment/runtime/supply_cart_%.glb"],
  ];
  YC.UPGRADE_NAMES = {};
  for (const [asset, name, pattern] of defs) {
    const base = Ur[asset] ?? 200;
    xl["kit-" + asset] = {
      id: "kit-" + asset,
      assets: [asset],
      baseTier: 1,
      modelTier2: true,
      starterModel: true,
      tiers: {
        1: { name: "Starter " + name.toLowerCase(), url: pattern.replace("%", "starter"), investment: 0 },
        2: { name: "Standard " + name.toLowerCase(), url: pattern.replace("%", "standard"), investment: Math.round((base * 0.6) / 5) * 5 },
        3: { name: "Advanced " + name.toLowerCase(), url: pattern.replace("%", "advanced"), investment: Math.round((base * 1.2) / 5) * 5 },
      },
    };
    YC.UPGRADE_NAMES[asset] = name;
  }

  // Reception desk: the three saved lobby tiers (starter wooden desk, teal standard, curved advanced).
  const R = K + "01_reception/reception_T%_desk.glb";
  Object.assign(xl.reception, {
    baseTier: 1,
    modelTier2: true,
    starterModel: true,
    tiers: {
      1: { name: "Starter reception", url: R.replace("%", "1"), yaw: Math.PI, investment: 0, registrationFactor: 1.2 },
      2: { name: "Standard reception", url: R.replace("%", "2"), yaw: Math.PI, investment: 220, registrationFactor: 1 },
      3: { key: "upgrade-reception-3", name: "Advanced reception", url: R.replace("%", "3"), yaw: Math.PI, investment: 520, registrationFactor: 0.75 },
    },
  });
  // Lobby seating: mismatched starter chairs, then the standard teal chair; benches go sculpted.
  xl["kit-waiting"] = {
    id: "kit-waiting",
    assets: ["waiting"],
    baseTier: 1,
    modelTier2: true,
    starterModel: true,
    tiers: {
      1: { name: "Starter chair", urls: ["green", "orange", "cushion"].map((c) => K + `12_lobby/lobby_T1_waiting_chair_${c}.glb`), investment: 0 },
      2: { name: "Standard chair", url: K + "12_lobby/lobby_T2_waiting_chair_original.glb", investment: 50 },
    },
  };
  xl["kit-bench"] = {
    id: "kit-bench",
    assets: ["visitor-bench"],
    baseTier: 1,
    tiers: {
      1: { name: "Linked seats", investment: 0 },
      3: { name: "Sculpted bench", url: K + "12_lobby/lobby_T3_sculpted_bench.glb", investment: 180 },
    },
  };
  YC.UPGRADE_NAMES["reception-equipped"] = YC.UPGRADE_NAMES.reception = "Reception desk";
  YC.UPGRADE_NAMES.waiting = "Waiting chair";
  YC.UPGRADE_NAMES["visitor-bench"] = "Waiting bench";

  // What each tier does. speed/prep multiply stage durations, risk multiplies complication chance.
  // `mood` feeds the lobby comfort bonus for waiting patients.
  YC.UPGRADE_FX = {
    work: { 2: { risk: 0.88 }, 3: { risk: 0.75 } },
    endoscopy: { 2: { speed: 0.93 }, 3: { speed: 0.85 } },
    patient: { 2: { speed: 0.97, risk: 0.97 }, 3: { speed: 0.94, risk: 0.92 } },
    table: { 2: { speed: 0.94 }, 3: { speed: 0.88 } },
    seda: { 2: { prep: 0.88 }, 3: { prep: 0.75 } },
    air: { 2: { risk: 0.92 }, 3: { risk: 0.82 } },
    warm: { 2: { risk: 0.94 }, 3: { risk: 0.86 } },
    iv: { 2: { prep: 0.96 }, 3: { prep: 0.92 } },
    supply: { 2: { prep: 0.96 }, 3: { prep: 0.92 } },
    reception: { 2: {}, 3: {} },
    "reception-equipped": { 2: {}, 3: {} },
    waiting: { 2: {} },
    "visitor-bench": { 3: {} },
  };
  YC.UPGRADE_TEXT = {
    work: ["Safer anesthesia", "12% fewer complications", "25% fewer complications"],
    endoscopy: ["Faster scopes", "Scope cases 7% faster", "Scope cases 15% faster"],
    patient: ["Comfort and safety", "3% faster, slightly safer", "6% faster, 8% safer"],
    table: ["Surgical throughput", "Surgeries 6% faster", "Surgeries 12% faster"],
    seda: ["Quicker prep", "Prep 12% shorter", "Prep 25% shorter"],
    air: ["Airway safety", "8% fewer complications", "18% fewer complications"],
    warm: ["Patient warmth", "6% fewer complications", "14% fewer complications"],
    iv: ["Faster set-up", "Prep 4% shorter", "Prep 8% shorter"],
    supply: ["Faster set-up", "Prep 4% shorter", "Prep 8% shorter"],
    reception: ["Faster check-in", "Check-in 17% faster, calmer lobby", "Check-in 38% faster, calmest lobby"],
    "reception-equipped": ["Faster check-in", "Check-in 17% faster, calmer lobby", "Check-in 38% faster, calmest lobby"],
    waiting: ["Comfier seating", "Happier waiting patients", ""],
    "visitor-bench": ["Comfier seating", "", "Happier waiting patients, nicer lobby"],
  };
  const kitOf = (asset) => Object.values(xl).find((k) => k.assets.includes(asset));
  YC.kitOf = kitOf;

  const proto = $n.prototype;
  const roomOf = (sim, p) => (p.roomId ? sim.room(p.roomId) : null);
  const factor = (sim, p, key) => {
    const room = roomOf(sim, p);
    if (!room) return 1;
    let f = 1;
    for (const o of room.objects) {
      const fx = YC.UPGRADE_FX[o.asset]?.[o.tier];
      if (fx?.[key]) f *= fx[key];
    }
    return f;
  };
  proto.upgradeSpeedFactor = function (p) {
    return factor(this, p, "speed");
  };
  proto.upgradePrepFactor = function (p) {
    return factor(this, p, "prep");
  };
  proto.upgradeRiskFactor = function (p) {
    return factor(this, p, "risk");
  };
  const baseDuration = proto.caseDuration;
  proto.caseDuration = function (p, stage) {
    let d = baseDuration.call(this, p, stage);
    if (this.careerOn() && stage === "prep") d *= this.upgradePrepFactor(p);
    return d;
  };
  proto.upgradedCount = function (tier = 3) {
    return this.build.objects.filter((o) => o.tier === tier && Br(o)).length;
  };
  // Lobby comfort: nicer desk, chairs and benches make waiting less miserable (up to +9 mood).
  proto.lobbyComfort = function () {
    const rooms = this.build.rooms.filter((r) => r.function === "Reception");
    let desk = 1, chairs = [], bench = 0;
    for (const r of rooms) {
      for (const o of this.build.objects) {
        if (!r.cells.includes(F(o))) continue;
        if (o.asset === "reception-equipped" || o.asset === "reception") desk = Math.max(desk, o.tier ?? 1);
        else if (o.asset === "waiting") chairs.push(o.tier ?? 1);
        else if (o.asset === "visitor-bench" && o.tier === 3) bench = 3;
      }
    }
    const avgChair = chairs.length ? chairs.reduce((a, b) => a + b, 0) / chairs.length : 1;
    return 3 * (desk - 1) + 3 * (avgChair - 1) + bench;
  };

  // ---- UI: upgrade list injected into the room panel -----------------------------------------------------
  const baseQh = Qh;
  Qh = function (target, content) {
    const ctrl = YC.controller;
    if (target?.id === "management-panel" && target.dataset.context === "room" && ctrl?.sim) {
      const room = ctrl.sim.room(ctrl.selectedRoom);
      const items = (room?.objects ?? []).filter((o) => YC.UPGRADE_FX[o.asset]);
      if (items.length) {
        const box = document.createElement("div");
        box.className = "cx-upgrades";
        const rows = items
          .map((o) => {
            const kit = kitOf(o.asset);
            const tier = o.tier ?? 1;
            const nm = YC.UPGRADE_NAMES[o.asset];
            const info = YC.UPGRADE_TEXT[o.asset];
            const k = kit.tiers;
            const label = tier === 3 ? "Advanced" : tier === 2 ? "Standard" : "Starter";
            const nextTiers = [2, 3].filter((t) => t > tier && k[t]);
            const btn = (t) =>
              `<button data-cx-upg="${o.id}" data-tier="${t}" ${ctrl.sim.state.funds < k[t].investment - k[tier].investment ? "disabled" : ""}>${t === 2 ? "Standard" : "Advanced"} · ${kt(k[t].investment - k[tier].investment)}<small>${He(info[t - 1] || "")}</small></button>`;
            const state = nextTiers.length ? He(info[0]) : "✓ " + He(info[tier - 1] || info[0]);
            return `<div class="cx-card"><div class="cx-row"><h5>${He(nm)}</h5><span class="cx-pill">${label}</span></div>
              <div class="cx-meta">${tier > 1 && info[tier - 1] ? "✓ " + He(info[tier - 1]) : state}</div>
              ${nextTiers.length ? `<div class="cx-actions">${nextTiers.map(btn).join("")}</div>` : ""}</div>`;
          })
          .join("");
        box.innerHTML = `<h4>Equipment upgrades</h4>${rows}`;
        content.append(box);
      }
    }
    return baseQh(target, content);
  };

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest?.("[data-cx-upg]");
    const ctrl = YC.controller;
    if (!el || !ctrl) return;
    ev.preventDefault();
    const tier = Number(el.dataset.tier);
    const sim = ctrl.sim;
    const h = sim.build;
    const p = h.objects.find((o) => o.id === el.dataset.cxUpg);
    if (!p) return;
    const m = qn(h, { type: "place", object: { ...p, tier }, movingId: p.id }, Ni);
    const err = m.error ?? ctrl.protect(m.state) ?? ctrl.previewCost(h, m.state);
    if (err) return ctrl.adapter.message(err, true);
    ctrl.adapter.history.replace(m.state);
    ctrl.edited(h, m.state);
    ctrl.adapter.refresh();
    ctrl.renderPanel();
    const nm = YC.UPGRADE_NAMES[p.asset];
    const text = YC.UPGRADE_TEXT[p.asset][tier - 1] || "";
    sim.careerNotice?.(`${nm} upgraded to ${tier === 3 ? "Advanced" : "Standard"}${text ? ": " + text : ""}.`, "good");
    ctrl.adapter.message(`${nm} upgraded${text ? ": " + text : ""}.`);
  });
})();
