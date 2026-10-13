// Career layer · decisions and situational awareness.
// 1. Decision cards: every minute or so something needs a call, with a visible cost and a real trade-off.
//    One of them is the comfort plan for each patient (the anesthesia-flavoured decision).
// 2. Pipeline strip: where patients are right now, which stage is backed up, tap to jump there.
(function () {
  const YC = window.YC;
  const ic = (n, c) => (YC.ic ? YC.ic(n, c) : "");

  // ---- helpers ------------------------------------------------------------------------------------------
  const PRE = new Set(["Reception queue", "To reception", "Registration", "Assessment queue", "To assessment", "Assessment", "Preparation"]);
  const unplanned = (sim) =>
    sim.state.patients
      .filter((p) => !p.plan && !p.walkout && Ci[p.caseId] && PRE.has(p.stage))
      .sort((a, b) => a.arrived - b.arrived);
  const pay = (sim, n) => {
    const t = sim.state;
    n = Math.min(n, t.funds);
    t.funds -= n;
    t.operating += n;
  };
  const canPay = (sim, n) => sim.state.funds >= n;
  const dueLabel = { Reception: "Check-in", Assessment: "Assessment", Endoscopy: "Procedure", Recovery: "Recovery" };
  const rep = (sim, d) => {
    const c = sim.state.career;
    c.rep = Math.max(0, Math.min(100, c.rep + d));
  };
  const allStaff = (sim, fn) => sim.state.staff.forEach(fn);

  // ---- card catalog -------------------------------------------------------------------------------------
  // make(sim) -> { icon, title, text, def, options:[{label, sub, ok?, run}] } | null. run returns the result line.
  const CARDS = [
    {
      id: "plan",
      weight: (sim) => (unplanned(sim).length ? 5 : 0),
      make(sim) {
        const p = unplanned(sim)[0];
        if (!p) return null;
        const pick = (key) => ({
          label: YC.PLAN[key].name,
          sub: { comfort: "Slower · happier · safest", standard: "Balanced", fast: "Quicker · riskier · less happy" }[key],
          run: () => {
            p.plan = key;
            return `${p.name}: ${YC.PLAN[key].name} plan.`;
          },
        });
        return { icon: "heart", title: p.name, text: `${Ci[p.caseId].name}. How should Yolanda look after them?`, def: 1, options: [pick("comfort"), pick("standard"), pick("fast")] };
      },
    },
    {
      id: "walkin",
      weight: (sim) => (sim.state.patients.length <= sim.careerCap() - 4 ? 2 : 0),
      make(sim) {
        // walk-ins stream in over a minute (patients cannot all spawn in the same instant)
        const take = (f, secs, msg) => () => {
          sim.addBuff("arrivals", f, secs);
          sim.state.nextArrival = Math.min(sim.state.nextArrival, sim.state.time + 2);
          return msg;
        };
        return {
          icon: "people",
          title: "Walk-ins at the door",
          text: "Four people want to be seen today.",
          def: 1,
          options: [
            { label: "Take all four", sub: "A rush for a minute", run: take(0.22, 70, "Walk-ins start pouring in.") },
            { label: "Take two", sub: "A smaller bump", run: take(0.45, 50, "A couple of walk-ins join.") },
            { label: "Turn them away", sub: "Reputation -1", run: () => (rep(sim, -1), "They left grumbling.") },
          ],
        };
      },
    },
    {
      id: "jam",
      weight: (sim) => (YC.worstQueue(sim)[1] >= 3 ? 4 : 0),
      make(sim) {
        const [dept, n] = YC.worstQueue(sim);
        const lab = dueLabel[dept] ?? dept;
        return {
          icon: "alert",
          title: `${lab} is backed up`,
          text: `${n} people are waiting.`,
          def: 2,
          options: [
            { label: "Free coffee for all", sub: "-$80 · patients calmer for 2 min", ok: canPay(sim, 80), run: () => (pay(sim, 80), sim.addBuff("mood", 12, 120), "Coffee all round. Moods lift.") },
            { label: "All hands on deck", sub: "Faster for 100s · staff tire", run: () => (sim.addBuff("speed", 0.85, 100), allStaff(sim, (s) => (s.energy = Math.max(5, s.energy - 12))), "Everyone hustles.") },
            { label: "Let it ride", sub: "No cost", run: () => "You wait it out." },
          ],
        };
      },
    },
    {
      id: "tired",
      weight: (sim) => (sim.state.staff.some((s) => s.energy < 45) ? 3 : 0),
      make(sim) {
        const s = sim.state.staff.filter((x) => x.energy < 45).sort((a, b) => a.energy - b.energy)[0];
        if (!s) return null;
        return {
          icon: "staff",
          title: `${s.name} is flagging`,
          text: `Energy ${Math.round(s.energy)}%.`,
          def: 2,
          options: [
            { label: "Send on a break", sub: "Recovers a lot", run: () => ((s.energy = Math.min(100, s.energy + 40)), `${s.name} takes five and comes back sharper.`) },
            { label: "Coffee bonus", sub: "-$60 · a boost", ok: canPay(sim, 60), run: () => (pay(sim, 60), (s.energy = Math.min(100, s.energy + 22)), `${s.name} perks up.`) },
            { label: "Push through", sub: "Faster 60s · more tired", run: () => (sim.addBuff("speed", 0.88, 60), (s.energy = Math.max(3, s.energy - 10)), `${s.name} grits their teeth.`) },
          ],
        };
      },
    },
    {
      id: "supplier",
      weight: (sim) => (sim.state.funds > 300 ? 1.5 : 0),
      make(sim) {
        return {
          icon: "coin",
          title: "A supplier is at reception",
          text: "Comfy chair covers, going cheap.",
          def: 2,
          options: [
            { label: "Buy them", sub: "-$200 · calmer waiting for 5 min", ok: canPay(sim, 200), run: () => (pay(sim, 200), sim.addBuff("mood", 8, 300), "Chairs look lovely.") },
            { label: "Haggle", sub: "50/50: free, or nothing", run: () => (sim.crand() < 0.5 ? (sim.addBuff("mood", 8, 300), "They caved! Free chair covers.") : "They hung up on you.") },
            { label: "No thanks", sub: "", run: () => "You wave them off." },
          ],
        };
      },
    },
    {
      id: "stream",
      weight: (sim) => (sim.state.patients.length >= 2 ? 1.5 : 0),
      make(sim) {
        const mood = Math.round(sim.state.career.happy);
        return {
          icon: "star",
          title: "A patient is livestreaming",
          text: "They are filming the waiting room.",
          def: 2,
          options: [
            { label: "Roll with it", sub: `Gamble: mood is ${mood}%`, run: () => (sim.state.career.happy >= 70 ? (rep(sim, 2.5), "Viral in a good way! Reputation up.") : (rep(sim, -2), "It went badly. Reputation down.")) },
            { label: "Ask them to stop", sub: "Safe", run: () => "They put the phone away." },
            { label: "Ignore it", sub: "", run: () => "Nothing happens." },
          ],
        };
      },
    },
    {
      id: "scope",
      weight: (sim) => (sim.rooms().some((r) => r.department === "Endoscopy") ? 1.5 : 0),
      make(sim) {
        const room = sim.rooms().find((r) => r.department === "Endoscopy");
        return {
          icon: "build",
          title: "The scope tower is rattling",
          text: "It sounds unhappy.",
          def: 1,
          options: [
            { label: "Repair now", sub: "-$140 · room off for 15s", ok: canPay(sim, 140), run: () => (pay(sim, 140), (sim.state.turnovers[room.id] = Math.max(sim.state.turnovers[room.id] ?? 0, sim.state.time + 15)), "Fixed before it got worse.") },
            { label: "Keep going", sub: "40% chance of a 50s shutdown", run: () => (sim.crand() < 0.4 ? (pay(sim, 120), (sim.state.turnovers[room.id] = Math.max(sim.state.turnovers[room.id] ?? 0, sim.state.time + 50)), "It gave out. -$120 and 50s offline.") : "It purred through. Lucky.") },
          ],
        };
      },
    },
    {
      id: "intern",
      weight: (sim) => (sim.state.career.research.current ? 1 : 0),
      make(sim) {
        const r = sim.state.career.research;
        return {
          icon: "research",
          title: "An intern has a shortcut",
          text: "It could speed up your research.",
          def: 1,
          options: [
            { label: "Try it", sub: "+8 points, or -4", run: () => (sim.crand() < 0.7 ? ((r.progress += 8), "It worked! Research jumps ahead.") : ((r.progress = Math.max(0, r.progress - 4)), "It did not work. A little lost.")) },
            { label: "Double-check it", sub: "+4 points, safe", run: () => ((r.progress += 4), "Careful and steady. A little progress.") },
          ],
        };
      },
    },
  ];

  YC.CARDS = CARDS;
  YC.worstQueue = (sim) => {
    let best = ["Reception", 0];
    for (const d of ["Reception", "Assessment", "Endoscopy", "Recovery"]) {
      const n = sim.queue(d).length;
      if (n > best[1]) best = [d, n];
    }
    return best;
  };

  // ---- scheduling ---------------------------------------------------------------------------------------
  const deck = { card: null, born: 0, left: 0, bornSim: 0 };
  YC.deck = deck;
  const LIFE = 30; // real seconds a card stays up

  function draw(sim) {
    const pool = CARDS.map((c) => [c, c.weight(sim)]).filter(([, w]) => w > 0);
    let total = pool.reduce((n, [, w]) => n + w, 0);
    if (!total) return null;
    let r = sim.crand() * total;
    for (const [c, w] of pool) {
      r -= w;
      if (r <= 0) return { def: c, card: c.make(sim) };
    }
    return null;
  }

  function resolve(ctrl, idx, auto) {
    const card = deck.card;
    if (!card) return;
    const sim = ctrl.sim;
    deck.card = null;
    el(ctrl).classList.remove("on");
    const o = card.options[idx];
    if (!o || o.ok === false) return;
    let msg = "";
    try {
      msg = o.run(sim);
    } catch (err) {
      console.warn("card", err);
    }
    const c = sim.state.career;
    c.nextCard = sim.state.time + 55 + sim.crand() * 50;
    if (msg) {
      ctrl.adapter.message((auto ? "Time ran out. " : "") + msg);
      sim.careerNotice?.(`${card.title}: ${msg}`, "info");
    }
    try {
      ctrl.audio?.play?.(auto ? "queue" : "deliver");
    } catch {}
    ctrl.render();
  }

  // ---- UI -----------------------------------------------------------------------------------------------
  const css = document.createElement("style");
  css.textContent = `
  #cx-card,#cx-pipe{display:none}
  #cx-alert{display:none!important}
  body.cx-modern:not(.build-mode) #cx-pipe{display:flex}
  body.cx-modern:not(.build-mode) #cx-card.on{display:block}
  #cx-pipe{position:absolute;z-index:8;top:calc(max(10px,env(safe-area-inset-top)) + 76px);left:404px;gap:5px;pointer-events:auto}
  #cx-pipe button{display:flex;align-items:center;gap:8px;padding:7px 11px;border-radius:13px;border:1px solid var(--cx-line);background:var(--cx-glass);backdrop-filter:blur(12px);color:#eaf7f3;font:600 12px/1 inherit;font-family:inherit;cursor:pointer;box-shadow:0 6px 16px #0a243038}
  #cx-pipe button:hover{background:var(--cx-glass2)}
  #cx-pipe b{font-size:15px;font-variant-numeric:tabular-nums}
  #cx-pipe i{width:9px;height:9px;border-radius:50%;background:#5cc79b;flex:none}
  #cx-pipe .warn i{background:var(--cx-gold)}#cx-pipe .bad i{background:var(--cx-coral);animation:cxPulseDot 1s ease-in-out infinite}
  #cx-pipe small{opacity:.7;font-size:10px;font-weight:600}
  #cx-pipe .arrow{align-self:center;opacity:.35;font-size:11px;margin:0 -1px}
  @keyframes cxPulseDot{50%{transform:scale(1.5)}}
  #cx-card{position:absolute;z-index:12;left:50%;transform:translateX(-50%);bottom:calc(max(14px,env(safe-area-inset-bottom)) + 88px);width:min(460px,calc(100vw - 20px));padding:12px;border-radius:20px;background:#fffdf6;color:#17414a;border:1px solid #fff;box-shadow:0 16px 40px #0a243080;animation:cxRise .22s ease-out;pointer-events:auto}
  #cx-card .top{display:flex;gap:10px;align-items:center;margin-bottom:9px}
  #cx-card .ico{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:12px;background:linear-gradient(145deg,#37c7b4,#1b8d94);color:#fff}
  #cx-card .ico .cx-ic{width:22px;height:22px}
  #cx-card .top b{display:block;font-size:15px;line-height:1.15}
  #cx-card .top small{display:block;font-size:12.5px;color:#4e6b66;margin-top:2px}
  #cx-card .opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:7px}
  #cx-card .opts button{display:grid;gap:3px;text-align:left;padding:9px 10px;border-radius:13px;border:1px solid #cfe2d9;background:#eef6f2;color:#17414a;font:inherit;cursor:pointer;min-height:0}
  #cx-card .opts button b{font-size:13.5px}
  #cx-card .opts button small{font-size:11px;color:#5b746e;line-height:1.2}
  #cx-card .opts button:hover:not(:disabled){background:#d9efe9;border-color:#8fcfc4}
  #cx-card .opts button:disabled{opacity:.45;cursor:not-allowed}
  #cx-card .opts button.def{border-color:#1f8a82}
  #cx-card .bar{height:4px;border-radius:9px;background:#dce9e2;margin-top:9px;overflow:hidden}
  #cx-card .bar i{display:block;height:100%;background:linear-gradient(90deg,#2fb3a5,#e0a93f);transition:width .4s linear}
  @media (min-width:761px){body.cx-modern.has-management-panel:not(.build-mode) #cx-card{left:calc((100% - 446px) / 2)}}
  @media (max-width:760px){
    #cx-pipe{top:calc(var(--cx-top) + 96px);left:6px;width:calc(100vw - 72px);gap:3px}
    #cx-pipe button{flex:1 1 0;min-width:0;padding:4px 4px;gap:0;flex-direction:column;justify-content:center;border-radius:11px;border-width:2px;border-color:#5cc79b66}
    #cx-pipe .warn{border-color:var(--cx-gold)!important}#cx-pipe .bad{border-color:var(--cx-coral)!important}
    #cx-pipe i,#cx-pipe small,#cx-pipe .arrow{display:none}
    #cx-pipe span{font-size:10px;opacity:.75;line-height:1.1}#cx-pipe b{font-size:15px;line-height:1.1}
    #cx-card{bottom:calc(var(--cx-bot) + 58px);padding:10px;border-radius:18px;width:calc(100vw - 12px)}
    #cx-card .top{margin-bottom:7px}#cx-card .top b{font-size:14px}#cx-card .top small{font-size:12px}
    #cx-card .opts{grid-template-columns:repeat(3,1fr);gap:5px}
    #cx-card .opts button{padding:7px 8px}#cx-card .opts button b{font-size:12.5px}#cx-card .opts button small{font-size:10.5px}
  }
  @media (max-width:760px) and (max-height:560px){#cx-pipe{display:none!important}}
  `;
  document.head.append(css);

  const el = (ctrl) => ctrl.cxCardEl;
  function mount(ctrl) {
    if (ctrl.cxCardEl) return;
    const card = document.createElement("div");
    card.id = "cx-card";
    ctrl.ui.append(card);
    ctrl.cxCardEl = card;
    const pipe = document.createElement("div");
    pipe.id = "cx-pipe";
    pipe.innerHTML = ["Reception", "Assessment", "Endoscopy", "Recovery"]
      .map((d, i) => (i ? '<span class="arrow">›</span>' : "") + `<button data-jump="${d}"><i></i><span>${dueLabel[d]}</span><b>0</b><small></small></button>`)
      .join("");
    ctrl.ui.append(pipe);
    ctrl.cxPipe = pipe;
    card.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-opt]");
      if (b && !b.disabled) resolve(ctrl, Number(b.dataset.opt), false);
    });
    pipe.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-jump]");
      if (b) ctrl.ui.querySelector(`[data-visit="${b.dataset.jump}"]`)?.click();
    });
  }

  function show(ctrl, made) {
    const card = made.card;
    deck.card = card;
    deck.left = LIFE;
    deck.bornSim = ctrl.sim.state.time;
    const e = el(ctrl);
    e.innerHTML = `<div class="top"><span class="ico">${ic(card.icon)}</span><div><b></b><small></small></div></div><div class="opts"></div><div class="bar"><i style="width:100%"></i></div>`;
    e.querySelector("b").textContent = card.title;
    e.querySelector("small").textContent = card.text;
    const opts = e.querySelector(".opts");
    card.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.dataset.opt = i;
      if (i === card.def) b.className = "def";
      b.disabled = o.ok === false;
      b.innerHTML = "<b></b><small></small>";
      b.querySelector("b").textContent = o.label;
      b.querySelector("small").textContent = o.sub || "";
      opts.append(b);
    });
    e.classList.add("on");
    try {
      ctrl.audio?.play?.("attention");
    } catch {}
  }

  const LAST = { t: 0 };
  setInterval(() => {
    const ctrl = YC.controller;
    const sim = ctrl?.sim;
    if (!ctrl || !sim?.careerOn?.()) return;
    mount(ctrl);
    const t = sim.state;
    const c = t.career;

    // pipeline strip
    const pills = ctrl.cxPipe.querySelectorAll("[data-jump]");
    pills.forEach((b) => {
      const d = b.dataset.jump;
      const total = t.patients.filter((p) => ry[p.stage] === d || Ri[p.stage] === d).length;
      const q = sim.queue(d).length;
      b.querySelector("b").textContent = String(total);
      const sm = b.querySelector("small");
      const txt = q ? `${q} waiting` : "";
      if (sm.textContent !== txt) sm.textContent = txt;
      b.className = q >= 4 ? "bad" : q >= 2 ? "warn" : "";
    });

    // cards
    if (t.paused || !t.open || ctrl.building || c.celebrate) return;
    const now = performance.now();
    const dt = Math.min(1, (now - (LAST.t || now)) / 1000);
    LAST.t = now;
    if (deck.card) {
      deck.left -= dt;
      const bar = el(ctrl).querySelector(".bar i");
      if (bar) bar.style.width = Math.max(0, (deck.left / LIFE) * 100) + "%";
      if (deck.left <= 0 || t.time - deck.bornSim > 260) resolve(ctrl, deck.card.def, true);
      return;
    }
    if (c.nextCard === void 0) c.nextCard = t.time + 25;
    if (t.time < c.nextCard) return;
    const made = draw(sim);
    if (made?.card) show(ctrl, made);
    else c.nextCard = t.time + 20;
  }, 400);
})();
