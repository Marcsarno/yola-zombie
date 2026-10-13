// Career layer · simulation.
// Extends the hospital simulation class ($n) with reputation, endless demand, patient mood and
// walkouts, finances, research, staff skills and a hiring market, random events and star goals.
(function () {
  const YC = window.YC;
  const proto = $n.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DAY = YC.DAY_LENGTH;
  const TREAT_STAGES = ["Ready for procedure", "Waiting for recovery"];

  const blankToday = (c, t) => ({ income: 0, treated: 0, walkouts: 0, comps: 0, repStart: c ? c.rep : 25, startTime: t ? t.time : 0 });

  function newCareer() {
    return {
      v: 1,
      active: false,
      seed: 20261012,
      day: 1,
      dayStart: 0,
      rep: 25,
      happy: 80,
      stars: 0,
      cured: 0,
      walkouts: 0,
      complications: 0,
      surgeries: 0,
      caseCounts: {},
      prices: {},
      unlocked: ["upper", "colon", "intensive"],
      perks: {},
      research: { done: [], current: null, progress: 0, budget: 1 },
      ledger: [],
      today: blankToday(),
      marks: { income: 0, wages: 0, operating: 0, capital: 0 },
      market: { day: 0, list: [] },
      event: null,
      nextEvent: 260,
      pending: {},
      notices: [],
      noticeSerial: 0,
      surge: null,
      stats: { vipPaid: 0, emergencies: 0, inspections: 0 },
      upgrades: {},
    };
  }
  YC.newCareer = newCareer;

  // ---- lifecycle ---------------------------------------------------------------------------------
  proto.careerOn = function () {
    return !!this.state.career?.active;
  };
  // Timed modifiers granted by decision cards: {kind: {v, until}} stored on the career state.
  proto.buff = function (kind) {
    const b = this.state.career?.buffs?.[kind];
    return b && this.state.time < b.until ? b.v : null;
  };
  proto.addBuff = function (kind, v, seconds) {
    const c = this.state.career;
    (c.buffs ||= {})[kind] = { v, until: this.state.time + seconds };
  };
  proto.careerEnsure = function () {
    const t = this.state;
    if (!t.career) {
      const c = (t.career = newCareer());
      c.marks = { income: t.income, wages: this.totalWages(), operating: t.operating, capital: t.capital };
      c.today = blankToday(c, t);
      c.dayStart = t.time;
      const g = t.guide;
      const legacyFinished = !g || g.skipped || g.completedAt !== void 0;
      if (t.completed > 0 || t.star > 0) {
        c.cured = t.completed;
        c.rep = clamp(25 + Math.min(40, t.completed * 1.2), 0, 100);
      }
      c.active = !!legacyFinished && (t.completed > 0 || t.star > 0 || (g && g.skipped));
      if (c.active) c.stars = Math.min(t.star || 0, 2);
      c.nextEvent = t.time + DAY * 0.9;
    }
    const c = t.career;
    c.perks ||= {};
    c.research ||= { done: [], current: null, progress: 0, budget: 1 };
    c.upgrades ||= {};
    c.stats ||= { vipPaid: 0, emergencies: 0, inspections: 0 };
    for (const s of t.staff) this.ensureStaff(s);
    return c;
  };
  const baseRebuild = proto.rebuild;
  proto.rebuild = function () {
    if (this.state && !this.state.career) this.careerEnsure();
    return baseRebuild.apply(this, arguments);
  };
  const baseLoad = $n.load;
  $n.load = function (text) {
    const sim = baseLoad.call($n, text);
    sim.careerEnsure();
    return sim;
  };

  proto.activateCareer = function (opts = {}) {
    const t = this.state;
    const c = this.careerEnsure();
    c.active = true;
    t.continuePlaying = true;
    t.tutorialComplete = true;
    if (t.guide && !t.guide.skipped && t.guide.completedAt === void 0) t.guide.skipped = true;
    c.marks = { income: t.income, wages: this.totalWages(), operating: t.operating, capital: t.capital };
    c.today = blankToday(c, t);
    c.dayStart = t.time;
    c.nextEvent = t.time + DAY * 0.9;
    if (opts.rep !== void 0) c.rep = opts.rep;
    this.careerNotice("Career mode: demand now follows your reputation. Keep patients happy and the books balanced.", "info");
    this.refreshMarket(true);
    return c;
  };

  // ---- deterministic randomness -------------------------------------------------------------------
  proto.crand = function () {
    const c = this.state.career;
    c.seed = (c.seed + 0x6d2b79f5) >>> 0;
    let x = c.seed;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  proto.cpick = function (list) {
    return list[Math.floor(this.crand() * list.length)];
  };
  proto.careerNotice = function (text, kind = "info") {
    const c = this.state.career;
    if (!c) return;
    c.notices.unshift({ id: ++c.noticeSerial, t: Math.round(this.state.time), kind, text });
    c.notices.length = Math.min(c.notices.length, 40);
    if (kind !== "info" || text.length < 140) this.log(text);
  };

  // ---- staff ----------------------------------------------------------------------------------------
  proto.ensureStaff = function (s) {
    if (s.skill === void 0) {
      s.skill = s.name === "Yolanda" ? 3 : 2;
      s.xp = YC.SKILL.xp[s.skill - 1] ?? 0;
      s.trait ??= s.name === "Yolanda" ? "meticulous" : null;
    }
    this.applySkill(s);
  };
  proto.applySkill = function (s) {
    const tr = YC.TRAITS[s.trait] ?? {};
    const base = YC.SKILL.efficiency[s.skill - 1] ?? 1;
    s.efficiency = clamp(base * (1 + (tr.eff ?? 0)) * (s.name === "Yolanda" ? 1.04 : 1), 0.5, 1.9);
    s.wageMul = (YC.SKILL.wage[s.skill - 1] ?? 1) * (tr.wage ?? 1);
  };
  proto.wageOf = function (s) {
    return ct[s.role].salary * (s.wageMul ?? 1);
  };
  proto.totalWages = function () {
    return this.state.staff.reduce((n, s) => n + s.wagesPaid, 0);
  };
  proto.overheadPerMinute = function () {
    const rooms = this.build.rooms.length;
    return ht.operatingPerMinute + (this.careerOn() ? rooms * 0.9 : 0);
  };
  proto.skillAvg = function (ids) {
    const staff = this.state.staff.filter((s) => ids.includes(s.id));
    return staff.length ? staff.reduce((n, s) => n + (s.skill ?? 2), 0) / staff.length : 2;
  };

  const baseHire = proto.hire;
  proto.hire = function (role, roomId) {
    const before = this.state.staff.length;
    const err = baseHire.call(this, role, roomId);
    if (!err && this.state.staff.length > before) {
      const s = this.state.staff.at(-1);
      this.ensureStaff(s);
      if (this.careerOn()) s.name = this.staffName(s.name === "Yolanda");
    }
    return err;
  };
  proto.staffName = function (keep) {
    if (keep) return "Yolanda";
    return this.cpick(YC.FIRST) + " " + this.cpick(YC.LAST);
  };

  proto.refreshMarket = function (force) {
    const c = this.careerEnsure();
    if (!force && c.market.day === c.day && c.market.list.length) return c.market.list;
    const roles = ["receptionist", "crna", "crna", "proceduralist", "proceduralist", "procedureNurse", "procedureNurse", "pacuNurse", "pacuNurse", "janitor"];
    const maxSkill = clamp(2 + c.stars + (c.rep > 60 ? 1 : 0), 2, 5);
    const traits = Object.keys(YC.TRAITS);
    const list = [];
    for (let i = 0; i < 7; i++) {
      const role = i < 4 ? roles[Math.floor(this.crand() * roles.length)] : roles[(c.day + i) % roles.length];
      const skill = clamp(1 + Math.floor(this.crand() * this.crand() * maxSkill * 1.4 + (this.crand() < 0.35 ? 1 : 0)), 1, maxSkill);
      const trait = this.crand() < 0.5 ? this.cpick(traits) : null;
      const tr = YC.TRAITS[trait] ?? {};
      list.push({
        id: `cand-${c.day}-${i}-${Math.floor(this.crand() * 1e6)}`,
        name: this.staffName(false),
        role,
        skill,
        trait,
        hire: Math.round((ct[role].hire * YC.SKILL.hire[skill - 1]) / 5) * 5,
        wage: +(ct[role].salary * YC.SKILL.wage[skill - 1] * (tr.wage ?? 1)).toFixed(1),
      });
    }
    c.market = { day: c.day, list };
    return list;
  };
  proto.hireCandidate = function (id, roomId) {
    const c = this.careerEnsure();
    const cand = c.market.list.find((x) => x.id === id);
    if (!cand) return "That candidate has taken another job.";
    if (this.state.funds < cand.hire) return "Not enough funds to hire " + cand.name + ".";
    const saved = ct[cand.role].hire;
    ct[cand.role].hire = cand.hire;
    let err;
    const before = this.state.staff.length;
    try {
      err = this.hire(cand.role, roomId);
    } finally {
      ct[cand.role].hire = saved;
    }
    if (err) return err;
    const s = this.state.staff.at(-1);
    if (this.state.staff.length > before && s) {
      s.name = cand.name;
      s.skill = cand.skill;
      s.xp = YC.SKILL.xp[cand.skill - 1] ?? 0;
      s.trait = cand.trait;
      this.applySkill(s);
    }
    c.market.list = c.market.list.filter((x) => x.id !== id);
    this.careerNotice(`${cand.name} joined as ${ct[cand.role].name} (${YC.SKILL.names[cand.skill - 1]}).`, "good");
    return null;
  };
  proto.trainCost = function (s) {
    return 90 * (s.skill ?? 2);
  };
  proto.trainStaff = function (id) {
    const s = this.state.staff.find((x) => x.id === id);
    if (!s) return "Staff member not found.";
    if ((s.skill ?? 2) >= 5) return s.name + " is already a master.";
    const cost = this.trainCost(s);
    if (this.state.funds < cost) return "Not enough funds for this course.";
    this.state.funds -= cost;
    this.state.operating += cost;
    s.xp = (s.xp ?? 0) + 140;
    this.checkLevel(s);
    this.careerNotice(`${s.name} completed a certification course (-$${cost}).`, "info");
    return null;
  };
  proto.checkLevel = function (s) {
    while ((s.skill ?? 2) < 5 && s.xp >= YC.SKILL.xp[s.skill]) {
      s.skill++;
      this.applySkill(s);
      this.careerNotice(`${s.name} reached ${YC.SKILL.names[s.skill - 1]} level! Wage now $${this.wageOf(s).toFixed(1)}/min.`, "good");
    }
  };
  proto.dismiss = function (id) {
    const t = this.state;
    const s = t.staff.find((x) => x.id === id);
    if (!s) return "Staff member not found.";
    if (s.name === "Yolanda") return "Yolanda is the heart of the center, and cannot be let go.";
    if (t.patients.some((p) => p.staffIds.includes(id))) return "Wait until they finish with their patient.";
    if (s.bathroom) return "Wait until the bathroom service finishes.";
    const sev = Math.round(this.wageOf(s) * 2);
    if (t.funds < sev) return "Severance is $" + sev + ".";
    t.funds -= sev;
    t.operating += sev;
    t.staff = t.staff.filter((x) => x.id !== id);
    for (const o of t.staff) if (o.reliefId === id) this.cancelHandoff(o, "Relief colleague left.");
    this.careerNotice(`${s.name} left the team (severance $${sev}).`, "info");
    this.rebuild();
    return null;
  };
  proto.fatigueAssist = function (dt) {
    // Tireless staff tire more slowly.
    const busy = new Set(this.state.patients.flatMap((p) => p.staffIds));
    for (const s of this.state.staff) {
      if (s.trait !== "tireless" || s.breakPhase === "resting") continue;
      s.energy = Math.min(100, s.energy + dt * (busy.has(s.id) ? Dt.workDrain : Dt.idleDrain) * (1 - YC.TRAITS.tireless.drain));
    }
  };

  // ---- demand ----------------------------------------------------------------------------------------
  proto.careerCap = function () {
    const c = this.state.career;
    return Math.min(26, 8 + Math.floor(c.rep / 7) + c.stars * 2);
  };
  proto.avgPriceFactor = function () {
    const c = this.state.career;
    const ids = c.unlocked.filter((id) => Ci[id]);
    if (!ids.length) return 1;
    return ids.reduce((n, id) => n + (c.prices[id] ?? 1), 0) / ids.length;
  };
  proto.careerGap = function () {
    const t = this.state;
    const c = t.career;
    let gap = YC.ARRIVAL_BASE * (1.2 - (c.rep / 100) * 0.8);
    gap *= 0.8 + 0.25 * this.avgPriceFactor();
    if (c.surge && t.time < c.surge.until) gap *= 0.6;
    if (c.pressUntil && t.time < c.pressUntil) gap *= 0.8;
    gap *= 0.8 + this.crand() * 0.4;
    gap *= this.buff("arrivals") ?? 1;
    // opening rush: the first couple of minutes are busy so there is always something to react to
    if (t.time < YC.RUSH_UNTIL) gap = Math.min(gap, 14 + this.crand() * 10);
    return Math.max(10, gap);
  };
  proto.demandPerDay = function () {
    const c = this.state.career;
    return DAY / (YC.ARRIVAL_BASE * (1.2 - (c.rep / 100) * 0.8) * (0.8 + 0.25 * this.avgPriceFactor()));
  };
  proto.careerCanSpawn = function () {
    const t = this.state;
    return t.open && t.time >= t.nextArrival && t.patients.length < this.careerCap();
  };
  proto.treatable = function (id) {
    const need = Ci[id].requires;
    return this.rooms().some(
      (r) => r.department === "Endoscopy" && !r.missing.length && need.every((tok) => r.objects.some((o) => vh[o.asset]?.includes(tok))),
    );
  };
  proto.pickCase = function () {
    const c = this.state.career;
    const unlocked = c.unlocked.filter((id) => Ci[id]);
    const ok = unlocked.filter((id) => this.treatable(id));
    let pool = ok.length && this.crand() > 0.1 ? ok : unlocked;
    if (!pool.length) pool = ["upper"];
    const surgeCase = c.surge && this.state.time < c.surge.until ? c.surge.caseId : null;
    let total = 0;
    const w = pool.map((id) => {
      const x = (Ci[id].weight ?? 20) * (id === surgeCase ? 5 : 1);
      total += x;
      return x;
    });
    let r = this.crand() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= w[i];
      if (r <= 0) return pool[i];
    }
    return pool[0];
  };
  proto.patientName = function () {
    return this.cpick(YC.FIRST) + " " + this.cpick(YC.LAST);
  };
  proto.spawn = function (special) {
    if (!this.careerOn()) return this.spawnBase();
    const t = this.state;
    const c = t.career;
    const arrivals = t.arrivals;
    this.spawnBase();
    if (t.arrivals === arrivals) return;
    const p = t.patients.at(-1);
    const id = special?.caseId ?? this.pickCase();
    p.caseId = id;
    p.requirements = [...Ci[id].requires];
    p.name = this.patientName();
    p.visitReason = this.cpick(Ci[id].reasons ?? ["A scheduled procedure"]);
    p.career = true;
    if (special?.urgent) {
      p.urgent = true;
      p.visitReason = "Emergency transfer · " + p.visitReason.toLowerCase();
    } else if (c.pending.vip) {
      c.pending.vip = false;
      p.vip = true;
      p.name = "VIP · " + p.name;
      p.visitReason = "Important guest · expects exceptional service";
    }
  };

  // ---- mood ------------------------------------------------------------------------------------------
  proto.patienceOf = function (p) {
    const c = this.state.career;
    let s = 260 * (Ci[p.caseId]?.patience ?? 1);
    if (p.urgent) s *= 0.6;
    if (p.vip) s *= 0.75;
    if (c?.perks.comfort) s *= 1.2;
    return s;
  };
  proto.moodOf = function (p) {
    if (!this.careerOn()) return Math.max(20, Math.min(100, 100 - p.wait / 8 + (p.comfort?.relief ?? 0)));
    const c = this.state.career;
    let m = 100 - 85 * (p.wait / this.patienceOf(p)) + (p.comfort?.relief ?? 0) + (c.perks.comfort ? 6 : 0);
    if (Ri[p.stage]) m += this.lobbyComfort?.() ?? 0;
    if ((p.comfort?.toiletNeed ?? 0) >= Zi.needAt) m -= 10;
    if ((p.comfort?.boredom ?? 0) > 60) m -= 5;
    m += (this.buff("mood") ?? 0) + (YC.PLAN[p.plan]?.mood ?? 0);
    if (p.complication) m -= 15;
    if (p.introductory) m = Math.max(60, m);
    return clamp(m, 0, 100);
  };

  // ---- money -----------------------------------------------------------------------------------------
  proto.priceOf = function (id) {
    return this.state.career?.prices[id] ?? 1;
  };
  proto.setPrice = function (id, mult) {
    const c = this.careerEnsure();
    c.prices[id] = clamp(Math.round(mult * 20) / 20, YC.PRICE_RANGE[0], YC.PRICE_RANGE[1]);
  };
  proto.payFor = function (p) {
    if (p.walkout) return 0;
    const base = Ci[p.caseId].payment;
    if (!this.careerOn()) return base;
    const c = this.state.career;
    let pay = base * YC.PAY_SCALE * this.priceOf(p.caseId) * (0.75 + 0.35 * (p.satisfaction / 100));
    if (c.perks.billing) pay *= 1.08;
    if (p.urgent) pay *= 2;
    if (p.vip) pay *= p.satisfaction >= 70 ? 2.5 : 0.8;
    if (p.complication) pay *= 0.7;
    pay *= (this.buff("pay") ?? 1) * (YC.PLAN[p.plan]?.pay ?? 1);
    return Math.round(pay);
  };
  proto.onProcedureDone = function (p) {
    if (!this.careerOn()) return;
    const c = this.state.career;
    const staff = this.state.staff.filter((s) => p.staffIds.includes(s.id));
    let risk = (Ci[p.caseId].risk ?? 0.03) * (1.6 - 0.3 * this.skillAvg(p.staffIds));
    if (staff.some((s) => s.trait === "meticulous")) risk *= YC.TRAITS.meticulous.risk;
    if (staff.some((s) => s.energy < Dt.tiredAt)) risk *= 1.5;
    if (c.perks.handoff) risk *= 0.9;
    if (c.perks.safety) risk *= 0.7;
    risk *= (this.upgradeRiskFactor?.(p) ?? 1) * (YC.PLAN[p.plan]?.risk ?? 1);
    if (this.crand() < clamp(risk, 0, 0.5)) {
      p.complication = true;
      c.complications++;
      c.today.comps++;
      this.careerNotice(`${p.name ?? "A patient"} had a post-op complication. Recovery will take longer.`, "bad");
    }
  };
  const baseCaseDuration = proto.caseDuration;
  proto.caseDuration = function (p, stage) {
    let d = baseCaseDuration.call(this, p, stage);
    if (this.careerOn()) d *= YC.PACE; // everything in the care journey runs faster than the original build
    if (this.careerOn() && stage === "recovery") d *= (p.complication ? 1.5 : 1) * 0.8;
    if (this.careerOn() && stage === "procedure") d *= (this.upgradeSpeedFactor?.(p) ?? 1) * (YC.PLAN[p.plan]?.speed ?? 1);
    if (this.careerOn()) d *= this.buff("speed") ?? 1;
    return d;
  };
  proto.onDischarge = function (p, pay) {
    if (!this.careerOn()) return;
    const t = this.state;
    const c = t.career;
    const tier = Ci[p.caseId].tier ?? 1;
    c.today.income += pay;
    if (p.walkout) {
      c.walkouts++;
      c.today.walkouts++;
      let loss = 1.2 + (p.urgent ? 1.8 : 0) + (p.vip ? 2 : 0);
      c.rep = clamp(c.rep - loss, 0, 100);
      if (p.urgent || p.vip) this.careerNotice(`${p.name} left unhappy: reputation -${loss.toFixed(1)}.`, "bad");
      return;
    }
    c.cured++;
    c.today.treated++;
    c.caseCounts[p.caseId] = (c.caseCounts[p.caseId] ?? 0) + 1;
    if (Ci[p.caseId].kind === "Operating room") c.surgeries++;
    c.happy = c.happy * 0.92 + p.satisfaction * 0.08;
    let gain = 0.3 * (0.8 + 0.2 * tier) * Math.pow(p.satisfaction / 100, 1.5);
    if (p.complication) gain = -1.5;
    if (p.vip) {
      if (p.satisfaction >= 70) {
        gain += 3;
        c.stats.vipPaid++;
        this.careerNotice(`${p.name} left delighted. Reputation +3, fee x2.5.`, "good");
      } else {
        gain -= 2;
        this.careerNotice(`${p.name} was not impressed. Fee reduced.`, "bad");
      }
    }
    if (p.urgent) {
      gain += 1.2;
      c.stats.emergencies++;
    }
    c.rep = clamp(c.rep + gain, 0, 100);
  };

  // ---- loans -----------------------------------------------------------------------------------------
  proto.loanLimit = function () {
    const c = this.state.career;
    return c?.active ? 5000 + 5000 * (c.stars + 1) : ht.creditLimit;
  };
  const baseBorrow = proto.borrow;
  proto.borrow = function () {
    if (!this.careerOn()) return baseBorrow.call(this);
    const amt = Math.min(2000, this.loanLimit() - this.state.debt);
    if (amt <= 0) return "Loan limit reached. Treat patients, repay, or raise your star rating for a larger limit.";
    this.state.debt += amt;
    this.state.funds += amt;
    this.careerNotice(`Loan taken: +$${amt}. Interest is 1% per day.`, "info");
    return null;
  };
  const baseRepay = proto.repay;
  proto.repay = function () {
    if (!this.careerOn()) return baseRepay.call(this);
    const amt = Math.min(1000, this.state.debt);
    if (!amt) return "No loan outstanding.";
    if (this.state.funds < amt) return "Need $" + amt + " available to repay.";
    this.state.funds -= amt;
    this.state.debt -= amt;
    return null;
  };

  // ---- research --------------------------------------------------------------------------------------
  proto.researchList = function () {
    const c = this.state.career;
    return YC.RESEARCH.map((r) => ({ ...r, done: c.research.done.includes(r.id), locked: r.star > c.stars }));
  };
  proto.startResearch = function (id) {
    const c = this.careerEnsure();
    const r = YC.RESEARCH.find((x) => x.id === id);
    if (!r) return "Unknown project.";
    if (c.research.done.includes(id)) return "Already complete.";
    if (r.star > c.stars) return "Earn star " + r.star + " first.";
    if (c.research.current === id) return null;
    if (c.research.current) return "Finish or cancel the current project first.";
    if (this.state.funds < r.cost) return "Not enough funds. Project costs $" + r.cost + ".";
    this.state.funds -= r.cost;
    this.state.operating += r.cost;
    c.research.current = id;
    c.research.progress = 0;
    if (c.research.budget === 0) c.research.budget = 1;
    this.careerNotice(`Research started: ${r.name}.`, "info");
    return null;
  };
  proto.setResearchBudget = function (n) {
    const c = this.careerEnsure();
    c.research.budget = clamp(n | 0, 0, YC.RESEARCH_BUDGET.length - 1);
  };
  proto.researchBonus = function () {
    const c = this.state.career;
    return 1 + 0.12 * this.state.staff.filter((s) => s.role === "crna" && (s.skill ?? 2) >= 4).length;
  };
  proto.finishResearch = function (r) {
    const c = this.state.career;
    c.research.done.push(r.id);
    c.research.current = null;
    c.research.progress = 0;
    for (const id of r.unlock ?? []) if (!c.unlocked.includes(id)) c.unlocked.push(id);
    if (r.perk) c.perks[r.perk] = true;
    this.careerNotice(`Research complete: ${r.name}. ${r.unlock ? "New cases unlocked: " + r.unlock.map((id) => Ci[id].name).join(", ") + "." : ""}`, "good");
  };

  // ---- events ----------------------------------------------------------------------------------------
  proto.rollEvent = function () {
    const t = this.state;
    const c = t.career;
    const pool = Object.entries(YC.EVENTS).filter(([, e]) => e.minStar <= c.stars);
    let total = pool.reduce((n, [, e]) => n + e.weight, 0);
    let r = this.crand() * total;
    let kind = pool[0][0];
    for (const [k, e] of pool) {
      r -= e.weight;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    this.fireEvent(kind);
    c.nextEvent = t.time + DAY * (0.8 + this.crand() * 1.1);
  };
  proto.fireEvent = function (kind) {
    const t = this.state;
    const c = t.career;
    const name = YC.EVENTS[kind].name;
    c.event = { kind, at: t.time };
    switch (kind) {
      case "vip":
        c.pending.vip = true;
        this.careerNotice("VIP visit: an important guest is on the way. Keep their wait short for a x2.5 fee.", "event");
        break;
      case "emergency":
        c.pending.emergency = true;
        this.careerNotice("Emergency transfer inbound! Treat them quickly for double fee and a reputation boost.", "event");
        break;
      case "outbreak": {
        const ok = c.unlocked.filter((id) => this.treatable(id));
        const caseId = this.cpick(ok.length ? ok : c.unlocked);
        c.surge = { caseId, until: t.time + DAY };
        this.careerNotice(`Seasonal surge: many more "${Ci[caseId].name}" patients are booking today.`, "event");
        break;
      }
      case "inspection":
        c.pending.inspection = true;
        this.careerNotice("Board inspection scheduled for the end of today. Few walkouts, happy patients and clean restrooms score well.", "event");
        break;
      case "breakdown": {
        const rooms = this.rooms().filter((r) => r.department === "Endoscopy" || r.department === "Recovery");
        if (!rooms.length) break;
        const room = this.cpick(rooms);
        const cost = 120 + 40 * c.stars;
        t.turnovers[room.id] = Math.max(t.turnovers[room.id] ?? 0, t.time + 50);
        t.funds = Math.max(0, t.funds - cost);
        t.operating += cost;
        this.careerNotice(`Equipment fault in ${this.roomName(room.id)}. A technician fixes it (-$${cost}); the room is offline for 50s.`, "bad");
        break;
      }
      case "donation": {
        const amt = Math.round((300 + this.crand() * 600 + c.stars * 400) / 10) * 10;
        t.funds += amt;
        t.income += amt;
        c.today.income += amt;
        this.careerNotice(`A grateful family donated $${amt} to the center.`, "good");
        break;
      }
      case "press":
        c.pressUntil = t.time + DAY;
        c.rep = clamp(c.rep + 3, 0, 100);
        this.careerNotice("A local news feature praises the center: reputation +3 and more bookings today.", "good");
        break;
    }
  };

  // ---- day cycle --------------------------------------------------------------------------------------
  proto.endDay = function () {
    const t = this.state;
    const c = t.career;
    const wages = this.totalWages();
    const dIncome = t.income - c.marks.income;
    const dWages = wages - c.marks.wages;
    const dOverhead = Math.max(0, t.operating - c.marks.operating - dWages);
    const dCapital = t.capital - c.marks.capital;
    // inspection
    if (c.pending.inspection) {
      c.pending.inspection = false;
      c.stats.inspections++;
      const restroom = this.build.rooms.some((r) => r.function === "Restroom");
      const janitor = t.staff.some((s) => s.role === "janitor");
      let score = 0;
      if (c.today.walkouts <= 1) score++;
      if (c.happy >= 65) score++;
      if (c.today.comps === 0) score++;
      if (!restroom || janitor) score++;
      if (score >= 3) {
        const prize = 800 + 400 * c.stars;
        t.funds += prize;
        t.income += prize;
        c.rep = clamp(c.rep + 3, 0, 100);
        this.careerNotice(`Inspection passed (${score}/4)! Grant +$${prize}, reputation +3.`, "good");
      } else {
        const fine = 350;
        t.funds = Math.max(0, t.funds - fine);
        c.rep = clamp(c.rep - 2, 0, 100);
        this.careerNotice(`Inspection failed (${score}/4). Fine -$${fine}, reputation -2. Keep walkouts down and restrooms staffed.`, "bad");
      }
    }
    // interest and research
    const interest = Math.round(t.debt * 0.01);
    if (interest) {
      t.funds = Math.max(0, t.funds - interest);
      t.operating += interest;
    }
    const rb = YC.RESEARCH_BUDGET[c.research.budget] ?? YC.RESEARCH_BUDGET[0];
    let researchCost = 0;
    if (c.research.current && rb.cost && t.funds >= rb.cost) {
      researchCost = rb.cost;
      t.funds -= rb.cost;
      t.operating += rb.cost;
      c.research.progress += rb.points * this.researchBonus() * (c.perks.mentorship ? 1 : 1);
      const r = YC.RESEARCH.find((x) => x.id === c.research.current);
      if (r && c.research.progress >= r.points) this.finishResearch(r);
    }
    // reputation drift
    const drift = clamp((c.happy - 62) * 0.02, -0.8, 0.8);
    c.rep = clamp(c.rep + drift, 0, 100);
    c.ledger.push({
      day: c.day,
      income: Math.round(dIncome),
      wages: Math.round(dWages),
      overhead: Math.round(dOverhead + interest + researchCost),
      capex: Math.round(dCapital),
      net: Math.round(dIncome - dWages - dOverhead - interest - researchCost),
      rep: +c.rep.toFixed(1),
      treated: c.today.treated,
      walkouts: c.today.walkouts,
      funds: Math.round(t.funds),
    });
    if (c.ledger.length > 21) c.ledger.shift();
    const last = c.ledger.at(-1);
    this.careerNotice(`Day ${c.day} report: ${c.today.treated} treated, ${c.today.walkouts} walkouts, net ${last.net >= 0 ? "+" : "-"}$${Math.abs(last.net)}.`, "info");
    c.day++;
    c.dayStart = t.time;
    c.marks = { income: t.income, wages, operating: t.operating, capital: t.capital };
    c.today = blankToday(c, t);
    this.refreshMarket(true);
  };

  // ---- goals ------------------------------------------------------------------------------------------
  proto.careerGoals = function () {
    const t = this.state;
    const c = t.career;
    const fmt = (n) => "$" + Math.floor(n).toLocaleString("en-US");
    const done = c.research.done.length;
    const cases = Object.keys(c.caseCounts).length;
    const skilled = t.staff.filter((s) => (s.skill ?? 2) >= 3).length;
    const g = (ok, label, detail) => ({ done: !!ok, label, detail });
    const upg = this.upgradedCount ? this.upgradedCount(3) : 0;
    if (c.stars === 0)
      return [
        g(c.cured >= 15, "Treat 15 patients", `${Math.min(c.cured, 15)}/15 treated`),
        g(c.rep >= 40, "Earn a 40% reputation", `${Math.round(c.rep)}% now`),
        g(c.happy >= 65, "Keep patients happy (65%+)", `${Math.round(c.happy)}% average mood`),
        g(t.funds >= 2500 && t.debt === 0, "Cash reserve of $2,500, no loan", `${fmt(t.funds)} cash · ${fmt(t.debt)} loan`),
      ];
    if (c.stars === 1)
      return [
        g(c.cured >= 60, "Treat 60 patients", `${Math.min(c.cured, 60)}/60 treated`),
        g(c.rep >= 60, "Earn a 60% reputation", `${Math.round(c.rep)}% now`),
        g(c.surgeries >= 8, "Run the Operating room: 8 surgeries", `${Math.min(c.surgeries, 8)}/8 surgical cases`),
        g(done >= 3, "Complete 3 research projects", `${Math.min(done, 3)}/3 complete`),
        g(skilled >= 2, "Develop 2 skilled staff (level 3+)", `${Math.min(skilled, 2)}/2 skilled`),
        g(t.funds >= 8000 && t.debt === 0, "Cash reserve of $8,000, no loan", `${fmt(t.funds)} cash · ${fmt(t.debt)} loan`),
      ];
    if (c.stars === 2)
      return [
        g(c.cured >= 160, "Treat 160 patients", `${Math.min(c.cured, 160)}/160 treated`),
        g(c.rep >= 80, "Earn an 80% reputation", `${Math.round(c.rep)}% now`),
        g(cases >= 6, "Treat 6 different procedures", `${Math.min(cases, 6)}/6 types`),
        g(c.happy >= 75, "Average patient mood of 75%+", `${Math.round(c.happy)}% now`),
        g(upg >= 3, "Fully upgrade 3 pieces of equipment", `${Math.min(upg, 3)}/3 advanced`),
        g(t.funds >= 20000 && t.debt === 0, "Cash reserve of $20,000, no loan", `${fmt(t.funds)} cash · ${fmt(t.debt)} loan`),
      ];
    return [g(true, "Center of Excellence", "Every star earned. Keep running it your way.")];
  };
  const baseGoals = proto.goals;
  proto.goals = function () {
    return this.careerOn() ? this.careerGoals() : baseGoals.call(this);
  };
  proto.careerStarCheck = function () {
    const t = this.state;
    const c = t.career;
    if (c.stars >= YC.MAX_STARS) return;
    if (!this.careerGoals().every((g) => g.done)) return;
    const reward = YC.STAR_REWARD[c.stars];
    c.stars++;
    t.star = c.stars;
    t.funds += reward;
    t.income += reward;
    t.paused = true;
    c.celebrate = { star: c.stars, reward, time: t.time };
    const unlock = [
      "Star 1: the Operating room, regional research and larger loans are now available.",
      "Star 2: advanced cases, cardiac and spine research, and expert hires are available.",
      "Star 3: you are a Center of Excellence. Keep going: records are yours to beat.",
    ][c.stars - 1];
    this.careerNotice(`★ Star ${c.stars} earned: ${YC.STAR_TITLE[c.stars]}! +$${reward}. ${unlock}`, "good");
    this.refreshMarket(true);
  };

  // ---- one-time coaching tips ----------------------------------------------------------------------------
  proto.careerTips = function () {
    const t = this.state;
    const c = t.career;
    c.tips ||= {};
    const tip = (id, text) => {
      if (c.tips[id]) return false;
      c.tips[id] = true;
      this.careerNotice(text, "info");
      return true;
    };
    if (t.open && t.time > 6) tip("open", "Doors are open. Patients arrive on their own; more reputation brings more of them.");
    const q = zi.map((d) => [d, this.queue(d).length]).sort((a, b) => b[1] - a[1])[0];
    if (q && q[1] >= 3) tip("queue", `Queue building in ${q[0]}. Tap Hospital → Overview to see what limits it: add staff, equipment or another room.`);
    if (c.walkouts >= 1) tip("walkout", "A patient lost patience and left. Long waits cost reputation. Add capacity, or lower prices to slow bookings.");
    if (t.funds < 700 && t.debt === 0) tip("cash", "Cash is getting low. Hospital → Finance has a loan you can take at 1% per day.");
    if (c.complications >= 1) tip("comp", "Complications hurt reputation. Skilled staff, tired-free teams and upgraded equipment reduce them.");
    if (c.cured >= 3) tip("research", "Hospital → Research unlocks new procedures. Fund a project and set a daily budget.");
    if (c.cured >= 6) tip("team", "Hospital → Team lists today's hiring market. Staff level up as they work.");
    if (c.stars >= 1) tip("or", "Star earned! Build → Furnished room → Operating room to start surgical cases.");
  };

  // ---- main hook --------------------------------------------------------------------------------------
  proto.careerTick = function (dt) {
    if (!this.careerOn()) return;
    const t = this.state;
    const c = t.career;
    // experience for working staff
    const busy = new Set(t.patients.flatMap((p) => p.staffIds));
    const xpRate = 0.5 * (c.perks.mentorship ? 1.25 : 1) * (t.staff.some((s) => s.trait === "mentor") ? 1.2 : 1);
    for (const s of t.staff) {
      if (busy.has(s.id) && (s.skill ?? 2) < 5) {
        s.xp = (s.xp ?? 0) + dt * xpRate;
        if (s.xp >= YC.SKILL.xp[s.skill]) this.checkLevel(s);
      }
    }
    this.fatigueAssist(dt);
    // walkouts
    for (const p of t.patients) {
      if (p.walkout || p.introductory || p.bathroom) continue;
      if (Ri[p.stage] && p.satisfaction < 18 && p.wait > 45) {
        p.walkout = true;
        this.cancelReading(p);
        this.enqueue(p, "Leaving");
        p.staffIds = [];
        const door = this.build.entrance;
        door && this.go(p, door);
        this.log((p.name ?? "A patient") + " lost patience and left.");
      }
    }
    // pending special arrivals
    if (t.open && c.pending.emergency && t.patients.length < this.careerCap() + 2) {
      const ok = c.unlocked.filter((id) => this.treatable(id));
      const caseId = ok.length ? ok.sort((a, b) => (Ci[b].tier ?? 1) - (Ci[a].tier ?? 1))[0] : "upper";
      const before = t.arrivals;
      this.spawn({ urgent: true, caseId });
      if (t.arrivals > before) c.pending.emergency = false;
    }
    if (Math.floor(t.time / 2) !== c._tipTick) {
      c._tipTick = Math.floor(t.time / 2);
      this.careerTips();
    }
    // events and day rollover
    if (t.open && t.time >= c.nextEvent) this.rollEvent();
    if (t.time - c.dayStart >= DAY) this.endDay();
    if (c.stars < YC.MAX_STARS && Math.floor(t.time * 2) !== c._starCheck) {
      c._starCheck = Math.floor(t.time * 2);
      this.careerStarCheck();
    }
  };
  const baseTick = proto.tick;
  proto.tick = function (dt) {
    const before = this.state.time;
    baseTick.call(this, dt);
    if (this.state.time !== before) this.careerTick(dt);
  };

  // turnover speed perk
  const baseServiceStage = proto.service;
  proto.service = function (e, dt) {
    const wasProcedure = e.stage === "Procedure";
    baseServiceStage.call(this, e, dt);
    if (wasProcedure && (e.stage === "Waiting for recovery" || e.stage === "Handoff")) this.onProcedureDone(e);
    if (this.careerOn() && this.state.career.perks.turnover && e.stage === "Leaving" && e.fixtureId === void 0) {
      /* turnover shortening handled in stats; kept for symmetry */
    }
  };

  // Finishing (or skipping) the guided Opening Day hands over to career mode.
  const baseFinish = proto.finishOpening;
  proto.finishOpening = function (skipped) {
    baseFinish.call(this, skipped);
    this.activateCareer();
  };

  // ---- starting a career game -------------------------------------------------------------------------
  // Comfort plan chosen for each patient before their procedure: the player trades speed against comfort and risk.
  YC.PLAN = {
    comfort: { name: "Comfort-first", speed: 1.25, risk: 0.6, mood: 8, pay: 1.08 },
    standard: { name: "Standard", speed: 1, risk: 1, mood: 0, pay: 1 },
    fast: { name: "Fast-track", speed: 0.8, risk: 1.5, mood: -6, pay: 1 },
  };
  YC.ARRIVAL_BASE = 55; // seconds between bookings at 0% rep scale (was 110)
  YC.RUSH_UNTIL = 150; // opening rush window in sim seconds
  YC.PACE = 0.6; // care-journey duration multiplier (assessment, prep, procedure, recovery)
  YC.LAYOUT_VERSION = 2; // 1 = original four-bay plan, 2 = starter lobby / concourse plan
  YC.careerStart = function () {
    const base = YC.careerLayout();
    const plain = ya();
    const sim = jr(base, Gi(ni(base.config), base) - Gi(ni(plain.config), plain));
    sim.state.guide = void 0;
    const rec = sim.rooms().find((r) => r.department === "Recovery");
    rec && sim.hire("pacuNurse", rec.id);
    for (const s of sim.state.staff) s.anchor && ((s.cell = { ...s.anchor }), (s.x = s.anchor.x), (s.y = s.anchor.y), (s.route = []));
    sim.activateCareer({ rep: 25 });
    sim.state.nextArrival = 3; // first patient walks in right away
    if (!YC.fastWalk) {
      YC.fastWalk = true;
      for (const k of ["normal", "brisk", "tired"]) Xa[k] *= 1.45;
    }
    sim.state.career.layout = YC.LAYOUT_VERSION;
    sim.state.funds = 4500;
    sim.state.events = ["Career start: a furnished, staffed center ready to open. Press Open center."];
    sim.state.report = sim.newReport();
    sim.refreshMarket(true);
    sim.state.career.marks = { income: 0, wages: sim.totalWages(), operating: sim.state.operating, capital: sim.state.capital };
    return sim;
  };
})();
