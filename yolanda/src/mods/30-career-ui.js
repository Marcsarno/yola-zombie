// Career layer · interface.
// A tabbed career hub (overview, goals, team + hiring market, finance, research, prices), HUD
// reputation read-out, notice toasts, star celebration and the title / new-game screen.
(function () {
  const YC = window.YC;
  const proto = eu.prototype;
  try {
    YC.hadSave = !!localStorage.getItem(jl);
  } catch {
    YC.hadSave = false;
  }
  const stars = (n, max = 3) => "★".repeat(n) + "☆".repeat(Math.max(0, max - n));
  const skillStars = (n) => "●".repeat(n) + "○".repeat(5 - n);
  const pct = (n) => Math.round(n) + "%";
  const esc = He;

  // ---- styles ----------------------------------------------------------------------------------------
  const css = document.createElement("style");
  css.textContent = `
  #management-panel .cx-tabs{display:flex;gap:4px;overflow-x:auto;margin:2px 0 8px;padding-bottom:4px;scrollbar-width:none}
  #management-panel .cx-tabs::-webkit-scrollbar{display:none}
  #management-panel .cx-tabs button{flex:0 0 auto;min-height:34px;padding:5px 11px;font-size:12px;border-radius:999px;background:#e3eee8;color:#245a5a;border:1px solid #bcd5cb}
  #management-panel .cx-tabs button[aria-pressed=true]{background:#1f8a82;color:#fff;border-color:#1f8a82;font-weight:700}
  .cx-kpis{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}
  .cx-kpi{background:#f1f6f1;border:1px solid #c4d9cd;border-radius:10px;padding:7px 9px;color:#1c4650}
  .cx-kpi small{display:block;color:#5b746e;font-size:11px}
  .cx-kpi b{font-size:18px}
  .cx-bar{height:8px;border-radius:99px;background:#d7e5dd;overflow:hidden;margin:3px 0 6px}
  .cx-bar i{display:block;height:100%;background:linear-gradient(90deg,#2fb3a5,#e0a93f)}
  .cx-bar.bad i{background:#e07a68}
  .cx-card{background:#f4f8f3;border:1px solid #c4d9cd;border-radius:11px;padding:9px 10px;margin:7px 0;color:#1c4650}
  .cx-card h5{margin:0 0 3px;font-size:14px;color:#17414a}
  .cx-card .cx-row{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .cx-card .cx-meta{font-size:12px;color:#4e6b66;line-height:1.4}
  .cx-card select{width:100%;min-height:38px;border-radius:8px;background:#fff;color:#1c4650;border:1px solid #bcd5cb;padding:4px 8px;margin:6px 0;font-size:14px}
  .cx-card input[type=range]{width:100%;margin:6px 0;accent-color:#1f8a82}
  .cx-pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;background:#d9efe9;color:#1c5e57;border:1px solid #a9d6cc;margin:0 4px 3px 0}
  .cx-pill.warn{background:#f7ecd0;color:#765711;border-color:#e3cc8e}
  .cx-pill.bad{background:#f8dcd5;color:#8a3a2c;border-color:#e6b1a5}
  .cx-ok{color:#1f7a5c}.cx-no{color:#b0503f}
  .cx-note{border-left:3px solid #e0a93f;padding:6px 9px;margin:6px 0;font-size:12.5px;background:#f8f1de;border-radius:0 8px 8px 0;color:#4d3d12;line-height:1.4}
  .cx-note.event{border-color:#2fb3a5;background:#e3f4ef;color:#1c4f4a}
  .cx-note.good{border-color:#2fb3a5;background:#e3f4ef;color:#1c4f4a}
  .cx-note.bad{border-color:#e07a68;background:#fae6e1;color:#6e2f23}
  .cx-chart{width:100%;height:84px;display:block;background:#f1f6f1;border-radius:8px}
  .cx-actions{display:flex;gap:6px;flex-wrap:wrap}.cx-actions button{flex:1}
  .cx-actions button small{display:block;opacity:.75}
  #cx-celebrate,#cx-title{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:#0c2a36cc;backdrop-filter:blur(6px);color:#eef9f5}
  #cx-celebrate .cx-modal,#cx-title .cx-modal{width:min(440px,100%);max-height:94dvh;overflow:auto;background:#153e50f2;border:1px solid #b9e2dd70;border-radius:18px;padding:20px;box-shadow:0 12px 40px #0008}
  #cx-title h1{margin:0 0 2px;font-size:30px;letter-spacing:.3px}
  #cx-title .cx-sub{opacity:.8;margin:0 0 14px;font-size:13px}
  #cx-title button,#cx-celebrate button{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border-radius:12px;border:1px solid #b9e2dd55;background:#ffffff14;color:#eef9f5;font-size:15px;min-height:52px}
  #cx-title button b,#cx-celebrate button b{display:block}
  #cx-title button small,#cx-celebrate button small{display:block;opacity:.75;font-size:12px;margin-top:2px}
  #cx-title button.primary,#cx-celebrate button.primary{background:#74dccb;color:#0f3a40;border-color:#74dccb}
  #cx-celebrate .hint{color:#cfe9e3}
  .cx-big-star{font-size:42px;color:#d9a23a;text-align:center;letter-spacing:6px}
  `;
  document.head.append(css);

  // ---- helpers ---------------------------------------------------------------------------------------
  const careerOn = (ctrl) => ctrl.sim.careerOn();
  const roleRooms = (sim, role) => sim.rooms().filter((r) => ct[role].departments.includes(r.department));
  const bestRoomFor = (sim, role) => {
    const rooms = roleRooms(sim, role);
    const need = rooms.find((r) => !r.staff.some((s) => s.role === role));
    return (need ?? rooms[0])?.id ?? "";
  };
  const roomOptions = (sim, role, pick) =>
    (role === "janitor" ? '<option value="">Center services</option>' : '<option value="">Unassigned</option>') +
    roleRooms(sim, role)
      .map((r) => `<option value="${r.id}" ${r.id === pick ? "selected" : ""}>${esc(sim.roomName(r.id))}</option>`)
      .join("");
  const ROLE_HUE = { crna: "#1f8a82", nurse: "#3b82c4", receptionist: "#c47a3b", janitor: "#7a8a3b", pacu: "#8a5cc4", physician: "#c4503b", surgeon: "#c4503b" };
  const ava = (name, role) => `<div class="cx-ava" style="background:${ROLE_HUE[role] ?? "#5b746e"}">${esc(name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase())}</div>`;
  const pips = (n) => `<span class="cx-pips" title="Skill ${n}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
  const trait = (k) => (k ? `<span class="cx-pill" title="${esc(YC.TRAITS[k].desc)}">${esc(YC.TRAITS[k].name)}</span>` : "");

  // ---- tab bodies ------------------------------------------------------------------------------------
  const tabs = {
    overview(ctrl) {
      const sim = ctrl.sim, t = sim.state, c = t.career;
      const ic = YC.ic ?? (() => "");
      const notes = c.notices.slice(0, 3).map((n) => `<div class="cx-note ${n.kind}">${esc(n.text)}</div>`).join("");
      const surge = c.surge && t.time < c.surge.until ? `<span class="cx-pill warn">Surge: ${esc(Ci[c.surge.caseId].name)}</span>` : "";
      const fl = sim.flowConstraint();
      const rep = Math.max(0, Math.min(100, c.rep));
      const cap = sim.careerCap();
      const mood = Math.round(c.happy);
      const dept = (m) => {
        const util = m.capacity ? Math.min(100, (m.active.length / m.capacity) * 100) : 0;
        const kind = m.reason ? "bad" : m.queue > 1 ? "busy" : m.active.length ? "" : "idle";
        return `<button class="cx-dept" data-room="${m.id}"><div class="h"><span class="dot ${kind}"></span>${esc(sim.roomName(m.id))}</div>
          <div class="bar"><i style="width:${util}%"></i></div>
          <small>${m.active.length}/${m.capacity} in use${m.queue ? " · " + m.queue + " queued" : ""}${m.reason ? "<br>" + esc(m.reason) : ""}</small></button>`;
      };
      return `
      <div class="cx-hero">
        <div class="cx-bigring"><svg viewBox="0 0 92 92"><circle class="t" cx="46" cy="46" r="38"/><circle class="v" cx="46" cy="46" r="38" stroke-dasharray="${(rep / 100) * 238.76} 238.76"/></svg><div><b>${pct(rep)}</b><small>Reputation</small></div></div>
        <div class="side">
          <div class="cx-meter ${mood < 55 ? "bad" : ""}">${ic(mood >= 72 ? "happy" : mood >= 50 ? "meh" : "sad")}<div class="bar"><i style="width:${mood}%"></i></div><b>${mood}%</b></div>
          <div class="cx-meter">${ic("people")}<div class="bar"><i style="width:${Math.min(100, (t.patients.length / Math.max(1, cap)) * 100)}%"></i></div><b>${t.patients.length}/${cap}</b></div>
          <div class="cx-meter">${ic("star", "fill")}<div class="bar"><i style="width:${(c.stars / YC.MAX_STARS) * 100}%"></i></div><b>${esc(YC.STAR_TITLE[c.stars])}</b></div>
        </div>
      </div>
      <div class="cx-tiles">
        <div class="cx-tile">${ic("check")}<b>${c.cured}</b><small>Treated</small></div>
        <div class="cx-tile">${ic("sad")}<b>${c.walkouts}</b><small>Walkouts</small></div>
        <div class="cx-tile">${ic("coin")}<b>${kt(t.funds)}</b><small>Cash</small></div>
        <div class="cx-tile">${ic("finance")}<b>${kt(t.debt)}</b><small>Loan</small></div>
      </div>
      <p><span class="cx-pill">Day ${c.day}</span>${surge}</p>
      ${fl ? `<div class="cx-note bad"><b>${esc(fl.department)}</b> · ${fl.waiting} waiting. ${esc(fl.reason)}</div>${fl.roomId ? `<button data-room="${fl.roomId}">Inspect limiting department →</button>` : ""}` : '<div class="cx-note event">Patient flow is clear.</div>'}
      <h4>Departments</h4>
      <div class="cx-depts">${sim.rooms().map(dept).join("")}</div>
      <div class="cx-more-info"><h4>Demand</h4>
      <p class="hint">About ${sim.demandPerDay().toFixed(1)} new bookings per day. Bookings rise with reputation and fall as prices rise. Treatable: ${
        c.unlocked.filter((id) => sim.treatable(id)).map((id) => esc(Ci[id].name)).join(", ") || "none yet"
      }.</p>
      <h4>Latest</h4>${notes || "<p><small>Quiet so far.</small></p>"}</div>
      <div class="cx-actions"><button data-cx="open-tab" data-tab="log">Full log</button><button data-cx="toggle-admissions">${t.open ? "Hold new arrivals" : "Resume arrivals"}</button></div>
      <p><button data-cx="settings">Settings, saves &amp; new game →</button></p>`;
    },
    goals(ctrl) {
      const sim = ctrl.sim, c = sim.state.career;
      const ic = YC.ic ?? (() => "");
      const goals = sim.careerGoals();
      const done = goals.filter((g) => g.done).length;
      const frac = (g) => {
        if (g.done) return 1;
        let m = /^(\d+)\/(\d+)/.exec(g.detail);
        if (m) return +m[1] / +m[2];
        m = /(\d+)%/.exec(g.label);
        const v = /^(\d+)%/.exec(g.detail);
        if (m && v) return Math.min(1, +v[1] / +m[1]);
        m = /\$([\d,]+)/.exec(g.label);
        const cash = /^\$([\d,]+) cash/.exec(g.detail);
        if (m && cash) return Math.min(1, +cash[1].replace(/,/g, "") / +m[1].replace(/,/g, ""));
        return 0;
      };
      return `
      <div class="cx-startrack">${[1, 2, 3].map((i) => ic("star", i <= c.stars ? "fill on" : "")).join("")}</div>
      <p style="text-align:center"><b>${esc(YC.STAR_TITLE[c.stars])}</b>${c.stars < YC.MAX_STARS ? ` → <b>${esc(YC.STAR_TITLE[c.stars + 1])}</b>` : ""}</p>
      ${c.stars < YC.MAX_STARS ? `<p class="hint" style="text-align:center">Earn star ${c.stars + 1}: ${done}/${goals.length} goals · reward ${kt(YC.STAR_REWARD[c.stars])}</p>` : ""}
      ${goals.map((g) => `<div class="cx-goalrow ${g.done ? "done" : ""}"><span class="ck">${ic("check")}</span><div><b>${esc(g.label)}</b><small>${esc(g.detail)}</small>${g.done ? "" : `<div class="bar"><i style="width:${Math.round(frac(g) * 100)}%"></i></div>`}</div></div>`).join("")}
      <div class="cx-more-info"><h4>What each star unlocks</h4>
      <p class="hint">★ Operating room, regional blocks, billing and mentorship research, larger loans.<br>★★ Cardiac and spine cases, expert hires, advanced equipment upgrades.<br>★★★ Center of Excellence.</p></div>`;
    },
    team(ctrl) {
      const sim = ctrl.sim, t = sim.state;
      const market = t.career.market.list;
      const staff = t.staff
        .map((s) => {
          const nextXp = YC.SKILL.xp[s.skill] ?? s.xp;
          const prevXp = YC.SKILL.xp[s.skill - 1] ?? 0;
          const f = s.skill >= 5 ? 100 : clamp100(((s.xp - prevXp) / (nextXp - prevXp)) * 100);
          return `<div class="cx-card"><div class="cx-staff">${ava(s.name, s.role)}<div><div class="cx-row"><h5>${esc(s.name)}</h5><span class="cx-meta">${kt(sim.wageOf(s))}/min</span></div>
          <div class="cx-meta">${esc(ct[s.role].name)} · ${pips(s.skill)} ${esc(YC.SKILL.names[s.skill - 1])} ${trait(s.trait)}</div></div></div>
          <div class="cx-bar"><i style="width:${f}%"></i></div>
          <div class="cx-meta">${esc(sim.staffStatus(s))} · energy ${Math.round(s.energy)}%</div>
          <div class="cx-actions"><button data-cx="train" data-id="${s.id}" ${s.skill >= 5 || t.funds < sim.trainCost(s) ? "disabled" : ""}>Course ${kt(sim.trainCost(s))}</button><button data-cx="dismiss" data-id="${s.id}" ${s.name === "Yolanda" ? "disabled" : ""}>Let go</button></div></div>`;
        })
        .join("");
      const cands = market
        .map(
          (m) => `<div class="cx-card"><div class="cx-staff">${ava(m.name, m.role)}<div><div class="cx-row"><h5>${esc(m.name)}</h5><b>${kt(m.hire)}</b></div>
          <div class="cx-meta">${esc(ct[m.role].name)} · ${pips(m.skill)} ${esc(YC.SKILL.names[m.skill - 1])} ${trait(m.trait)}</div></div></div>
          <div class="cx-meta">${kt(m.wage)}/min · speed ${Math.round((YC.SKILL.efficiency[m.skill - 1] ?? 1) * 100)}%</div>
          <select data-cx-room="${m.id}" aria-label="Assign ${esc(m.name)}">${roomOptions(sim, m.role, bestRoomFor(sim, m.role))}</select>
          <button data-cx="hire" data-id="${m.id}" ${t.funds < m.hire ? "disabled" : ""}>Hire &amp; assign</button></div>`,
        )
        .join("");
      return `<p class="hint">Staff gain experience while treating patients and level up (higher speed, fewer complications, higher wages). Candidates refresh each day; better hires appear as your reputation and stars grow.</p>
      <h4>Hiring market · day ${t.career.day}</h4>${cands || "<p><small>No candidates today.</small></p>"}
      <h4>Your team (${t.staff.length})</h4>${staff}
      <p><button data-cx="open-tab" data-tab="staffrooms">Room assignments →</button></p>`;
    },
    finance(ctrl) {
      const sim = ctrl.sim, t = sim.state, c = t.career;
      const wagesNow = sim.totalWages() - c.marks.wages;
      const opNow = Math.max(0, t.operating - c.marks.operating - wagesNow);
      const incNow = t.income - c.marks.income;
      const led = c.ledger.slice(-14);
      const max = Math.max(500, ...led.map((l) => Math.abs(l.net)));
      const bars = led
        .map((l, i) => {
          const w = 100 / Math.max(led.length, 7);
          const h = (Math.abs(l.net) / max) * 38;
          return `<rect x="${i * w + 1}" y="${l.net >= 0 ? 42 - h : 42}" width="${w - 2}" height="${Math.max(1, h)}" rx="1.5" fill="${l.net >= 0 ? "#74dccb" : "#f08a7a"}"><title>Day ${l.day}: ${l.net >= 0 ? "+" : "-"}$${Math.abs(l.net)}</title></rect>`;
        })
        .join("");
      const limit = sim.loanLimit();
      return `<div class="cx-kpis">
        <div class="cx-kpi"><small>Cash</small><b>${kt(t.funds)}</b></div>
        <div class="cx-kpi"><small>Loan (1%/day)</small><b>${kt(t.debt)}</b></div>
        <div class="cx-kpi"><small>Today · income</small><b class="cx-ok">${kt(incNow)}</b></div>
        <div class="cx-kpi"><small>Today · wages + upkeep</small><b class="cx-no">${kt(wagesNow + opNow)}</b></div></div>
      <h4>Daily net result</h4>
      <svg class="cx-chart" viewBox="0 0 100 84" preserveAspectRatio="none" role="img" aria-label="Daily net result"><line x1="0" y1="42" x2="100" y2="42" stroke="#b9e2dd55" stroke-width=".4"/>${bars}</svg>
      <p class="hint">${led.length ? `Last day: ${led.at(-1).net >= 0 ? "+" : "-"}$${Math.abs(led.at(-1).net)} net · ${led.at(-1).treated} treated.` : "The first daily report arrives at the end of day 1."} Construction and hiring are one-off costs; wages and upkeep run every minute the clock does.</p>
      <h4>Working capital</h4>
      <p class="hint">Borrow up to ${kt(limit)} at 1% interest per day. The limit grows with each star.</p>
      <div class="cx-actions"><button data-cx="borrow">Borrow $2,000</button><button data-cx="repay" ${t.debt ? "" : "disabled"}>Repay $1,000</button></div>
      <h4>Recent days</h4>
      ${led.slice(-6).reverse().map((l) => `<div class="room-line"><b>Day ${l.day} · ${l.net >= 0 ? "+" : "-"}$${Math.abs(l.net)}</b><small>Income ${kt(l.income)} · wages ${kt(l.wages)} · other ${kt(l.overhead)}${l.capex ? " · built/hired " + kt(l.capex) : ""} · ${l.treated} treated, ${l.walkouts} walkouts</small></div>`).join("") || ""}`;
    },
    research(ctrl) {
      const sim = ctrl.sim, t = sim.state, c = t.career, r = c.research;
      const cur = YC.RESEARCH.find((x) => x.id === r.current);
      const rb = YC.RESEARCH_BUDGET;
      return `<p class="hint">Fund research to unlock new procedures and lasting improvements. Progress is earned each day at your chosen budget; skilled CRNAs speed the work up.</p>
      <div class="cx-card"><h5>Daily budget</h5>
        <div class="cx-actions">${rb.map((b, i) => `<button data-cx="budget" data-n="${i}" aria-pressed="${r.budget === i}" ${r.budget === i ? 'style="background:#74dccb;color:#0f3a40"' : ""}>${esc(b.name)}<small>${b.cost ? kt(b.cost) + "/day" : "free"}</small></button>`).join("")}</div>
        ${cur ? `<h5 style="margin-top:8px">${esc(cur.name)}</h5><div class="cx-bar"><i style="width:${clamp100((r.progress / cur.points) * 100)}%"></i></div><div class="cx-meta">${Math.floor(r.progress)}/${cur.points} points · +${Math.round(rb[r.budget].points * sim.researchBonus())}/day</div>` : '<div class="cx-meta">No active project. Choose one below.</div>'}
      </div>
      ${sim
        .researchList()
        .map(
          (p) => `<div class="cx-card"><div class="cx-row"><h5>${esc(p.name)}</h5><span class="cx-meta">${p.done ? '<span class="cx-ok">✓ done</span>' : p.points + " pts · " + kt(p.cost)}</span></div>
          <div class="cx-meta">${esc(p.text)}</div>
          ${p.done ? "" : p.locked ? `<span class="cx-pill warn">Needs ${stars(p.star, p.star)}</span>` : r.current === p.id ? '<span class="cx-pill">In progress</span>' : `<button data-cx="research" data-id="${p.id}" ${r.current || t.funds < p.cost ? "disabled" : ""}>Start project</button>`}</div>`,
        )
        .join("")}`;
    },
    prices(ctrl) {
      const sim = ctrl.sim, c = sim.state.career;
      return `<p class="hint">Set each treatment's price. Higher prices earn more per patient but slow new bookings; satisfied patients pay the full fee. Average price: ${Math.round(sim.avgPriceFactor() * 100)}%.</p>
      ${c.unlocked
        .map((id) => {
          const k = Ci[id], m = sim.priceOf(id), can = sim.treatable(id);
          return `<div class="cx-card"><div class="cx-row"><h5>${esc(k.name)}</h5><b data-price-out="${id}">${kt(k.payment * YC.PAY_SCALE * m)}</b></div>
          <div class="cx-meta"><span class="cx-pill">${esc(k.kind ?? "Endoscopy")}</span>${can ? '<span class="cx-pill">Room ready</span>' : '<span class="cx-pill bad">No suitable room</span>'} treated ${c.caseCounts[id] ?? 0}</div>
          <input type="range" min="${YC.PRICE_RANGE[0]}" max="${YC.PRICE_RANGE[1]}" step="0.05" value="${m}" data-cx-price="${id}" aria-label="Price for ${esc(k.name)}"></div>`;
        })
        .join("")}
      <h4>Locked treatments</h4><p class="hint">${Object.keys(Ci).filter((id) => !c.unlocked.includes(id)).map((id) => esc(Ci[id].name)).join(" · ") || "Everything is unlocked."} Unlock them through Research.</p>`;
    },
    log(ctrl) {
      const c = ctrl.sim.state.career;
      return c.notices.map((n) => `<div class="cx-note ${n.kind}"><small>${Yn(n.t)}</small> ${esc(n.text)}</div>`).join("") || "<p>Nothing yet.</p>";
    },
  };
  const clamp100 = (n) => Math.max(0, Math.min(100, n));
  const TAB_LABELS = [["overview", "Overview"], ["goals", "Goals"], ["team", "Team"], ["finance", "Finance"], ["research", "Research"], ["prices", "Prices"]];
  const TAB_ICON = { overview: "hospital", goals: "goals", team: "staff", finance: "finance", research: "research", prices: "prices" };
  YC.tabs = tabs;

  // ---- panel rendering -------------------------------------------------------------------------------
  const baseRenderPanel = proto.renderPanel;
  proto.renderPanel = function () {
    if (!careerOn(this)) return baseRenderPanel.call(this);
    if (this.panelType === "goals") this.cxTab = "goals";
    if (this.panelType === "overview" || this.panelType === "goals") {
      // keep the base class' bookkeeping via a recognised context, but render our own body
      const tab = (this.cxTab ||= "overview");
      if (!tabs[tab]) this.cxTab = "overview";
      const sim = this.sim;
      let body;
      try {
        body = tabs[this.cxTab](this);
      } catch (err) {
        console.error(err);
        body = "<p>Could not draw this view.</p>";
      }
      const titles = { overview: "Center overview", goals: "Goals & stars", team: "Team & hiring", finance: "Finances", research: "Research", prices: "Prices", log: "Activity log" };
      const nav = `<div class="cx-tabs" role="tablist">${TAB_LABELS.map(([k, l]) => `<button role="tab" data-cx="tab" data-tab="${k}" aria-pressed="${this.cxTab === k}">${YC.ic ? YC.ic(TAB_ICON[k]) : ""}<span>${l}</span></button>`).join("")}</div>`;
      const tpl = document.createElement("template");
      tpl.innerHTML = `<div class="panel-title"><div class="panel-mark">${es("overview")}</div><h3>${titles[this.cxTab] ?? "Hospital"}</h3><button id="panel-close" aria-label="Close panel">Close</button></div>${nav}${body}`;
      this.panel.dataset.context = "career";
      this.panel.classList.toggle("expanded", true);
      document.body.classList.add("has-management-panel");
      // preserve scroll position and open <details> between refreshes
      const scroll = this.panel.scrollTop;
      Qh(this.panel, tpl.content);
      this.panel.scrollTop = scroll;
      this.panel.querySelector("#panel-close").onclick = () => this.closePanel();
      bindCareerPanel(this);
      return;
    }
    return baseRenderPanel.call(this);
  };

  function say(ctrl, msg, bad) {
    if (msg) ctrl.adapter.message(msg, !!bad);
  }

  function bindCareerPanel(ctrl) {
    const sim = ctrl.sim;
    const root = ctrl.panel;
    const redraw = () => {
      ctrl.renderPanel();
      ctrl.render();
      ctrl.save();
    };
    root.querySelectorAll("[data-cx]").forEach((el) => {
      el.onclick = () => {
        const act = el.dataset.cx, id = el.dataset.id;
        switch (act) {
          case "tab":
          case "open-tab":
            ctrl.cxTab = el.dataset.tab === "staffrooms" ? "overview" : el.dataset.tab;
            if (el.dataset.tab === "staffrooms") {
              ctrl.show("staff");
              return;
            }
            ctrl.panelType = "overview";
            ctrl.renderPanel();
            root.scrollTop = 0;
            return;
          case "hire": {
            const sel = root.querySelector(`[data-cx-room="${id}"]`);
            const err = sim.hireCandidate(id, sel?.value || void 0);
            say(ctrl, err ?? "Hired. They are walking to their work position.", err);
            return redraw();
          }
          case "train": {
            const err = sim.trainStaff(id);
            say(ctrl, err ?? "Course complete.", err);
            return redraw();
          }
          case "dismiss": {
            const s = sim.state.staff.find((x) => x.id === id);
            if (!s || !confirm(`Let ${s.name} go? Severance is ${kt(sim.wageOf(s) * 2)}.`)) return;
            const err = sim.dismiss(id);
            say(ctrl, err, err);
            return redraw();
          }
          case "borrow":
            say(ctrl, sim.borrow() ?? "Loan added.", false);
            return redraw();
          case "repay": {
            const err = sim.repay();
            say(ctrl, err, err);
            return redraw();
          }
          case "budget":
            sim.setResearchBudget(Number(el.dataset.n));
            return redraw();
          case "research": {
            const err = sim.startResearch(id);
            say(ctrl, err ?? "Research project started.", err);
            return redraw();
          }
          case "toggle-admissions":
            if (sim.state.open) sim.state.open = false;
            else say(ctrl, sim.open(), true);
            return redraw();
          case "settings":
            return ctrl.navigate("settings");
          case "shift":
            return YC.startShift(ctrl);
        }
      };
    });
    root.querySelectorAll("[data-cx-price]").forEach((el) => {
      el.oninput = () => {
        const out = root.querySelector(`[data-price-out="${el.dataset.cxPrice}"]`);
        if (out) out.textContent = kt(Ci[el.dataset.cxPrice].payment * YC.PAY_SCALE * Number(el.value));
      };
      el.onchange = () => {
        sim.setPrice(el.dataset.cxPrice, Number(el.value));
        ctrl.save();
      };
    });
    root.querySelectorAll("[data-room]").forEach((el) => (el.onclick = () => ctrl.selectRoom(el.dataset.room, true)));
  }

  // The legacy staff panel gets a way into the hiring market.
  const baseQh = Qh;
  Qh = function (target, content) {
    if (target?.id === "management-panel" && target.dataset.context === "staff" && ctrlRef?.sim?.careerOn()) {
      const extra = document.createElement("div");
      extra.innerHTML = '<button data-cx-open="team" class="primary-action">Hiring market, skills &amp; training →</button>';
      const first = content.querySelector("h4, .room-line");
      content.insertBefore(extra.firstChild, first ?? null);
    }
    if (target?.id === "management-panel" && target.dataset.context === "settings" && ctrlRef?.sim?.careerOn()) {
      const extra = document.createElement("div");
      extra.innerHTML = '<button data-cx-open="newgame">New game / title screen →</button>';
      content.append(extra.firstChild);
    }
    return baseQh(target, content);
  };
  let ctrlRef = null;
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest?.("[data-cx-open]");
    if (!el || !ctrlRef) return;
    if (el.dataset.cxOpen === "team") {
      ctrlRef.cxTab = "team";
      ctrlRef.panelType = "overview";
      ctrlRef.navigate("overview");
    } else if (el.dataset.cxOpen === "newgame") YC.showTitle(ctrlRef);
  });

  // ---- HUD / frame hook --------------------------------------------------------------------------------
  const baseRender = proto.render;
  proto.render = function () {
    baseRender.call(this);
    if (!careerOn(this)) return;
    const t = this.sim.state, c = t.career;
    const mini = this.ui.querySelector("#mini-flow");
    if (mini) mini.textContent = `Day ${c.day} · ${stars(c.stars)} · Rep ${pct(c.rep)} · Mood ${pct(c.happy)}`;
    const goal = this.ui.querySelector("#flow-goal");
    if (goal && !goal.classList.contains("attention")) {
      const gs = this.sim.careerGoals();
      const done = gs.filter((g) => g.done).length;
      goal.textContent = c.stars >= YC.MAX_STARS ? "★★★ Center of Excellence" : `Star ${c.stars + 1} · ${done}/${gs.length} goals →`;
    }
    const open = this.ui.querySelector("#center-overview span");
    if (open) open.textContent = "Hospital";
    this.cxNotices();
    this.cxCelebrate();
  };
  proto.cxNotices = function () {
    const c = this.sim.state.career;
    if (this.cxSeen === void 0 || this.cxSim !== this.sim) {
      this.cxSeen = c.noticeSerial;
      this.cxSim = this.sim;
      return;
    }
    if (performance.now() < (this.cxNext ?? 0)) return;
    const fresh = c.notices.filter((n) => n.id > this.cxSeen).sort((a, b) => a.id - b.id);
    if (!fresh.length) return;
    const n = fresh.find((x) => x.kind !== "info") ?? fresh[0];
    this.cxSeen = Math.max(...fresh.map((x) => x.id));
    this.cxNext = performance.now() + 2500;
    this.adapter.message(n.text, n.kind === "bad");
  };
  proto.cxCelebrate = function () {
    const c = this.sim.state.career;
    if (!c.celebrate || document.getElementById("cx-celebrate")) return;
    const cel = c.celebrate;
    const el = document.createElement("div");
    el.id = "cx-celebrate";
    el.innerHTML = `${[...Array(28)].map((_, i) => `<i class="cx-confetti" style="left:${(i * 37) % 100}%;background:${["#f2c15b", "#3ed0bd", "#ef8a76", "#8be8d6"][i % 4]};animation-delay:${((i * 53) % 10) / 10}s;animation-duration:${2.2 + ((i * 7) % 10) / 8}s"></i>`).join("")}<div class="cx-modal"><div class="cx-startrack">${[1, 2, 3].map((i) => (YC.ic ? YC.ic("star", i <= cel.star ? "fill on" : "") : "")).join("")}</div><h2 style="text-align:center;margin:6px 0">${esc(YC.STAR_TITLE[cel.star])}</h2>
      <p style="text-align:center">Star ${cel.star} earned. A grant of <b>${kt(cel.reward)}</b> has been added to your funds.</p>
      <p class="hint" style="text-align:center">${esc(
        [
          "The Operating room, regional research and larger loans are unlocked.",
          "Cardiac and spine research, expert hires and advanced upgrades are open.",
          "You run a Center of Excellence. Keep growing: there is no ceiling.",
        ][cel.star - 1],
      )}</p>
      <button class="primary" id="cx-go"><b>Continue</b><small>Resume running the center</small></button></div>`;
    document.getElementById("app").append(el);
    this.audio?.play?.("complete");
    el.querySelector("#cx-go").onclick = () => {
      c.celebrate = void 0;
      this.sim.state.paused = false;
      el.remove();
      this.render();
      this.save();
    };
  };

  // ---- title screen ----------------------------------------------------------------------------------
  YC.showTitle = function (ctrl) {
    document.getElementById("cx-title")?.remove();
    let hasSave = false;
    hasSave = YC.hadSave;
    const el = document.createElement("div");
    el.id = "cx-title";
    const ic = YC.ic ?? (() => "");
    el.innerHTML = `<div class="cx-modal cx-titlecard">
      <div class="cx-logo">${ic("hospital")}</div>
      <h1>Yolanda’s</h1><p class="cx-sub">Specialty Medical Center</p>
      ${hasSave ? `<button class="primary big" id="cx-continue">${ic("play")}<span><b>Continue</b></span></button>` : ""}
      <button class="${hasSave ? "big" : "primary big"}" id="cx-career">${ic("star", "fill")}<span><b>New career</b><small>Build, hire, research, earn 3 stars</small></span></button>
      <div class="cx-grid3">
        <button id="cx-guided">${ic("goals")}<b>Tutorial</b><small>Opening day</small></button>
        <button id="cx-build">${ic("build")}<b>Sandbox</b><small>Build freely</small></button>
      </div>
      <p class="cx-fine">Entertainment only. Fictional cases, no clinical instruction.</p></div>`;
    document.getElementById("app").append(el);
    const done = () => el.remove();
    el.querySelector("#cx-continue")?.addEventListener("click", done);
    el.querySelector("#cx-career").onclick = () => {
      ctrl.save($r);
      ctrl.replace(YC.careerStart());
      ctrl.adapter.view.fit();
      done();
      ctrl.adapter.message("Career mode: press Open center when you are ready. Build, hire, research and keep patients happy.");
    };
    el.querySelector("#cx-guided").onclick = () => {
      ctrl.save($r);
      ctrl.replace(dm());
      done();
    };
    el.querySelector("#cx-build").onclick = () => (location.search = "?mode=builder");
  };

  YC.templateLock = (tpl) => {
    const sim = ctrlRef?.sim;
    if (!tpl.requiresStar || !sim?.careerOn()) return null;
    return sim.state.career.stars >= tpl.requiresStar ? null : "Unlocks at " + stars(tpl.requiresStar);
  };

  // ---- boot hook --------------------------------------------------------------------------------------
  window.careerReady = function (ctrl) {
    ctrlRef = ctrl;
    window.YC.controller = ctrl;
    YC.decorLoaded?.then(() => ctrl.adapter.view.refreshAssets());
    const params = new URLSearchParams(location.search);
    if (params.get("title") === "0") return;
    ctrl.sim.state.paused = true;
    YC.showTitle(ctrl);
  };
})();
