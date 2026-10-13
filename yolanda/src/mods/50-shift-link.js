// Links the anesthesia shift minigame to the hospital: a good shift pays a bonus, lifts
// reputation and trains Yolanda. Results travel through localStorage between the two modes.
(function () {
  const YC = window.YC;
  const KEY = "yolanda-shift-result";
  const COOLDOWN_DAYS = 2;

  $n.prototype.claimShift = function () {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      raw = null;
    }
    if (!raw || raw.claimed || !this.careerOn()) return null;
    const c = this.state.career;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...raw, claimed: true }));
    } catch {}
    const fresh = c.lastShiftDay === void 0 || c.day - c.lastShiftDay >= COOLDOWN_DAYS;
    const k = fresh ? 1 : 0.25;
    c.lastShiftDay = c.day;
    const cash = Math.round(raw.total * 14 * k);
    const rep = +((raw.total / 25) * k).toFixed(1);
    const xp = Math.round(raw.total * 3 * k);
    this.state.funds += cash;
    this.state.income += cash;
    c.today.income += cash;
    c.rep = Math.min(100, c.rep + rep);
    const yola = this.state.staff.find((s) => s.name === "Yolanda");
    if (yola) {
      yola.xp = (yola.xp ?? 0) + xp;
      this.checkLevel(yola);
    }
    this.careerNotice(
      `Yolanda's shift: ${raw.total}/100 · ${raw.grade}. Bonus +$${cash}, reputation +${rep}, Yolanda +${xp} xp${fresh ? "" : " (reduced: shifts need a couple of days between them)"}.`,
      "good",
    );
    return { cash, rep, xp, total: raw.total };
  };

  const baseReady = window.careerReady;
  window.careerReady = function (ctrl) {
    baseReady?.(ctrl);
    const r = ctrl.sim.claimShift?.();
    if (r) {
      ctrl.save();
      setTimeout(() => ctrl.adapter.message(`Shift bonus collected: +$${r.cash}, reputation +${r.rep}.`), 600);
    }
  };

  // Entry points: the title screen button and the Overview tab.
  // The shift minigame is on hold: nothing in the interface links to it.
  YC.startShift = function () {};
})();
