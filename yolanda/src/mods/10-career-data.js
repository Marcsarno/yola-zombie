// Career layer · data tables.
// Runs inside the game closure, after the simulation module has initialised, so it can use the
// minified game globals directly:  ct (staff roles)  Ci (cases)  vh (equipment tokens)
// zi (core departments)  ht (hospital constants)  Dt (fatigue)  Zb (room requirements).
(function () {
  const YC = (window.YC = window.YC || {});

  YC.DAY_LENGTH = 300; // simulated seconds per hospital day
  YC.MAX_STARS = 3;
  YC.PAY_SCALE = 0.45; // career payouts relative to the case table (keeps the economy tight)

  // ---- Cases ---------------------------------------------------------------------------------
  // Existing cases keep their ids. New cases are fictional, CRNA-flavoured procedures. `requires`
  // are equipment tokens from `vh`; a case is only routed to a procedure room that has them all.
  const extra = {
    upper: { tier: 1, weight: 34, patience: 1.0, risk: 0.02, kind: "Endoscopy", reasons: ["Reflux that will not settle", "A routine scope screening", "Persistent stomach pain"] },
    colon: { tier: 1, weight: 30, patience: 1.0, risk: 0.025, kind: "Endoscopy", reasons: ["A screening colonoscopy", "Family history check", "Follow-up after a polyp"] },
    intensive: { tier: 2, weight: 18, patience: 0.9, risk: 0.04, kind: "Endoscopy", reasons: ["Complex prep needed before the scope", "Second-look procedure", "Needs extended preparation"] },
  };
  for (const [id, x] of Object.entries(extra)) Object.assign(Ci[id], x);

  const add = (id, c) => (Ci[id] = c);
  add("ercp", { name: "ERCP · deep sedation", prep: 18, procedure: 34, recovery: 100, payment: 1650, requires: ["anesthesia", "scope", "airway"], assessment: 24, tier: 3, weight: 14, patience: 0.85, risk: 0.06, kind: "Endoscopy", reasons: ["Bile-duct stone to clear", "Needs deep sedation with airway support"] });
  add("cataract", { name: "Cataract surgery · monitored care", prep: 8, procedure: 18, recovery: 50, payment: 900, requires: ["anesthesia", "procedureBed"], assessment: 16, tier: 1, weight: 30, patience: 1.1, risk: 0.015, kind: "Operating room", reasons: ["Blurry vision getting worse", "Cloudy lens in the left eye", "Wants to read the paper again"] });
  add("dental", { name: "Pediatric dental rehabilitation", prep: 14, procedure: 26, recovery: 70, payment: 1300, requires: ["anesthesia", "procedureBed", "airway"], assessment: 18, tier: 2, weight: 20, patience: 0.8, risk: 0.04, kind: "Operating room", reasons: ["Many cavities, one gentle visit", "Anxious little patient", "Dental work under sedation"] });
  add("ortho", { name: "Knee arthroscopy · block + sedation", prep: 12, procedure: 32, recovery: 90, payment: 1550, requires: ["anesthesia", "procedureBed", "supply"], assessment: 20, tier: 2, weight: 20, patience: 0.95, risk: 0.035, kind: "Operating room", reasons: ["Torn meniscus from a weekend match", "Clicking knee that locks", "Wants to run again"] });
  add("lap", { name: "Laparoscopic cholecystectomy", prep: 16, procedure: 44, recovery: 110, payment: 2100, requires: ["anesthesia", "procedureBed", "airway"], assessment: 22, tier: 3, weight: 16, patience: 0.9, risk: 0.05, kind: "Operating room", reasons: ["Gallstone attacks after meals", "Scheduled gallbladder removal"] });
  add("cardiac", { name: "Cardiac ablation", prep: 20, procedure: 54, recovery: 130, payment: 2950, requires: ["anesthesia", "procedureBed", "airway", "warming"], assessment: 26, tier: 4, weight: 10, patience: 0.8, risk: 0.07, kind: "Operating room", reasons: ["Racing heartbeat that will not quit", "Rhythm disorder needing a precise fix"] });
  add("spine", { name: "Spinal fusion · long case", prep: 24, procedure: 70, recovery: 150, payment: 3800, requires: ["anesthesia", "procedureBed", "airway", "warming", "supply"], assessment: 30, tier: 5, weight: 8, patience: 0.75, risk: 0.08, kind: "Operating room", reasons: ["Back pain that stops everything", "Complex multi-level repair"] });

  // ---- Staff -----------------------------------------------------------------------------------
  YC.SKILL = {
    names: ["Trainee", "Competent", "Skilled", "Expert", "Master"],
    efficiency: [0.92, 1.0, 1.1, 1.2, 1.32],
    wage: [0.85, 1.0, 1.25, 1.55, 1.95],
    hire: [0.8, 1.0, 1.35, 1.8, 2.4],
    xp: [0, 220, 600, 1300, 2400], // cumulative xp to reach level n+1
  };
  YC.TRAITS = {
    quick: { name: "Quick", desc: "Works 8% faster", eff: 0.08 },
    tireless: { name: "Tireless", desc: "Tires 30% slower", drain: 0.7 },
    frugal: { name: "Frugal", desc: "Wage 10% lower", wage: 0.9 },
    meticulous: { name: "Meticulous", desc: "40% fewer complications", risk: 0.6 },
    mentor: { name: "Mentor", desc: "Teammates learn 20% faster", mentor: 0.2 },
  };
  YC.FIRST = ["Ada", "Amir", "Beatriz", "Callum", "Dara", "Eli", "Farah", "Gabe", "Hana", "Ines", "Jamal", "Keiko", "Luca", "Mira", "Noor", "Omar", "Priya", "Quinn", "Rosa", "Sam", "Tariq", "Uma", "Vik", "Wren", "Xavi", "Yara", "Zane", "Marisol", "Dev", "Colette", "Tobias", "Lena", "Ravi", "Maya", "Jonas", "Anika", "Pedro", "Sienna"];
  YC.LAST = ["Alvarez", "Bennett", "Chen", "Dubois", "Eriksen", "Fofana", "Garcia", "Haddad", "Ibarra", "Jensen", "Kovacs", "Lindqvist", "Moreau", "Nakamura", "Okafor", "Petrov", "Quintero", "Rahman", "Silva", "Tanaka", "Uddin", "Vasquez", "Walsh", "Xu", "Yilmaz", "Zielinski", "Brooks", "Hughes", "Patel", "Romano"];

  // ---- Research ---------------------------------------------------------------------------------
  // unlock: a case id to add to the roster; perk: a flag read by the simulation.
  YC.RESEARCH = [
    { id: "airway", name: "Airway readiness protocols", star: 0, points: 60, cost: 400, unlock: ["ercp", "dental"], text: "Standardised airway checks. Unlocks ERCP deep sedation and pediatric dental cases." },
    { id: "mac", name: "Monitored anesthesia care pathways", star: 0, points: 45, cost: 300, unlock: ["cataract"], text: "Light, quick sedation pathways. Unlocks cataract surgery in the Operating room." },
    { id: "handoff", name: "Structured handoffs", star: 0, points: 50, cost: 350, perk: "handoff", text: "Scripted bedside handoffs: recovery transfers take half as long and complications drop 10%." },
    { id: "comfort", name: "Patient comfort programme", star: 0, points: 55, cost: 400, perk: "comfort", text: "Warm blankets, clear updates. Patients stay happier and wait 20% longer before leaving." },
    { id: "regional", name: "Regional block technique", star: 1, points: 90, cost: 700, unlock: ["ortho"], text: "Ultrasound-guided blocks. Unlocks knee arthroscopy." },
    { id: "billing", name: "Billing optimisation", star: 1, points: 80, cost: 600, perk: "billing", text: "Cleaner coding. All cases pay 8% more." },
    { id: "mentorship", name: "Mentorship programme", star: 1, points: 85, cost: 650, perk: "mentorship", text: "Staff earn experience 25% faster." },
    { id: "generalga", name: "Advanced general anesthesia", star: 1, points: 110, cost: 900, unlock: ["lap"], text: "Longer abdominal cases. Unlocks laparoscopic cholecystectomy." },
    { id: "turnover", name: "Rapid room turnover", star: 1, points: 95, cost: 750, perk: "turnover", text: "Rooms are ready 40% sooner after each patient." },
    { id: "cardiac", name: "Cardiac sedation suite", star: 2, points: 160, cost: 1500, unlock: ["cardiac"], text: "Precision care for rhythm procedures. Unlocks cardiac ablation (needs ThermaNest warming)." },
    { id: "spine", name: "Long-case anesthesia endurance", star: 2, points: 190, cost: 1900, unlock: ["spine"], text: "Teams trained for 4-hour cases. Unlocks spinal fusion." },
    { id: "safety", name: "Zero-harm culture", star: 2, points: 170, cost: 1600, perk: "safety", text: "Checklists everywhere. Complications drop another 30%." },
  ];
  YC.RESEARCH_BUDGET = [
    { name: "Paused", cost: 0, points: 0 },
    { name: "Lean", cost: 40, points: 9 },
    { name: "Focused", cost: 110, points: 24 },
    { name: "Institute", cost: 240, points: 55 },
  ];

  // ---- Events -----------------------------------------------------------------------------------
  YC.EVENTS = {
    vip: { name: "VIP visit", weight: 3, minStar: 0 },
    emergency: { name: "Emergency transfer", weight: 4, minStar: 0 },
    outbreak: { name: "Seasonal surge", weight: 3, minStar: 0 },
    inspection: { name: "Board inspection", weight: 2, minStar: 0 },
    breakdown: { name: "Equipment fault", weight: 3, minStar: 0 },
    donation: { name: "Community donation", weight: 2, minStar: 0 },
    press: { name: "Local news feature", weight: 2, minStar: 1 },
  };

  // ---- Objectives (stars) -----------------------------------------------------------------------
  YC.STAR_REWARD = [2000, 4500, 9000];
  YC.STAR_TITLE = ["Neighbourhood clinic", "Ambulatory center", "Regional surgical center", "Center of Excellence"];

  // ---- Equipment upgrade kits (see 40-upgrades.js) ----------------------------------------------
  YC.PRICE_RANGE = [0.6, 1.6];
})();
