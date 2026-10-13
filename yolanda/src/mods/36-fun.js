// Career layer · game feel.
// Sound effects and a soft background loop for the hospital, varied discharge lines, and a "next step"
// prompt that turns the long-term star goals into something to do right now.
(function () {
  const YC = window.YC;
  const sproto = $n.prototype;

  // ---- events raised by the simulation, consumed by the sound loop -------------------------------------
  const fx = (sim, kind, data) => {
    const q = (sim.fxq ||= []);
    q.push({ kind, ...data });
    if (q.length > 40) q.splice(0, q.length - 40);
  };
  const baseSpawn = sproto.spawn;
  sproto.spawn = function (opts) {
    const before = this.state.patients.length;
    const r = baseSpawn.call(this, opts);
    if (this.careerOn?.() && this.state.patients.length > before) fx(this, "arrive");
    return r;
  };
  const baseDischarge = sproto.onDischarge;
  sproto.onDischarge = function (p, pay) {
    const r = baseDischarge.call(this, p, pay);
    if (this.careerOn?.()) fx(this, p.walkout ? "walkout" : "cure", { name: p.name });
    return r;
  };

  // ---- discharge lines ------------------------------------------------------------------------------------
  const LINES = [
    "{n} strolled out grinning and asked if the hospital gown comes in other colours. +{a}",
    "{n} is already telling the car park how great you are. +{a}",
    "{n} says the waiting-room chairs were \"weirdly comfy\". +{a}",
    "{n} high-fived the receptionist on the way out. +{a}",
    "{n} left a five-star review before reaching the door. +{a}",
    "{n} wants to know when the next appointment is. A healthy attitude! +{a}",
    "{n} hummed the lift music all the way home. +{a}",
    "{n} tried to tip the vending machine. It does not take tips. +{a}",
    "{n} told the team \"best Tuesday ever\". It is not Tuesday. +{a}",
    "{n} waved goodbye to every plant in the lobby. +{a}",
    "{n} is heading home with a very smug smile. +{a}",
    "{n} gave the CRNA a thumbs up and a jelly bean. +{a}",
  ];
  let lineN = 0;
  YC.dischargeLine = (d) => {
    const s = LINES[lineN++ % LINES.length];
    return s.replace("{n}", d.name).replace("{a}", kt(d.amount));
  };

  // ---- sound ----------------------------------------------------------------------------------------------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("yolanda-" + k);
        return v === null ? d : v === "1";
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("yolanda-" + k, v ? "1" : "0");
      } catch {}
    },
  };
  YC.sound = { sfx: store.get("sfx", true), music: store.get("music", true) };
  YC.toggleSound = () => {
    const on = !(YC.sound.sfx || YC.sound.music);
    YC.sound.sfx = YC.sound.music = on;
    store.set("sfx", on);
    store.set("music", on);
    return on;
  };

  const SFX = {
    arrive: (a) => {
      a.note(988, 0.18, 0.03, "sine");
      a.note(784, 0.32, 0.03, "sine", 0.13);
    },
    cure: (a) => {
      [523, 659, 784, 1046].forEach((f, i) => a.note(f, 0.16, 0.035, "triangle", i * 0.06));
      a.note(2093, 0.18, 0.014, "sine", 0.26);
      a.note(1568, 0.08, 0.02, "square", 0.34);
    },
    walkout: (a) => {
      [392, 330, 262].forEach((f, i) => a.note(f, 0.22, 0.03, "triangle", i * 0.12));
    },
  };

  // gentle loop: bass + pad chords + a wandering chime, 96 bpm eighth notes
  const CHORDS = [
    [0, 4, 7, 11],
    [9, 0, 4, 7],
    [2, 5, 9, 0],
    [7, 11, 2, 5],
  ];
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
  const music = { next: 0, beat: 0 };
  function musicStep(audio, sim) {
    const ctx = audio.context;
    if (!ctx || !YC.sound.music || !sim || sim.state.paused || (!sim.state.open && sim.state.time === 0)) {
      music.next = 0;
      return;
    }
    if (!music.next || music.next < ctx.currentTime - 0.5) music.next = ctx.currentTime + 0.05;
    const step = 60 / 96 / 2;
    while (music.next < ctx.currentTime + 0.3) {
      const off = music.next - ctx.currentTime;
      const b = music.beat++;
      const bar = Math.floor(b / 8) % 4;
      const ch = CHORDS[bar];
      const hz = (semi, oct = 0) => 261.63 * Math.pow(2, (semi + oct * 12) / 12);
      if (b % 4 === 0) audio.note(hz(ch[0], -2), 0.5, 0.045, "triangle", off);
      if (b % 8 === 0) ch.forEach((s, i) => audio.note(hz(s, -1), 1.5, 0.012, "sine", off + i * 0.02));
      if (b % 2 === 1 || Math.random() < 0.25) {
        const n = PENTA[Math.floor(Math.random() * PENTA.length)];
        if (Math.random() < 0.6) audio.note(hz(n, 0), 0.4, 0.018, "triangle", off);
      }
      music.next += step;
    }
  }

  let lastCure = 0;
  setInterval(() => {
    const ctrl = YC.controller;
    if (!ctrl?.sim?.careerOn?.()) return;
    const audio = ctrl.audio;
    if (!audio) return;
    const q = ctrl.sim.fxq;
    if (q?.length) {
      const now = performance.now();
      for (const e of q.splice(0)) {
        if (!YC.sound.sfx || !audio.context || !SFX[e.kind]) continue;
        if (e.kind === "cure" && now - lastCure < 200) continue;
        if (e.kind === "cure") lastCure = now;
        SFX[e.kind](audio);
      }
    }
    try {
      musicStep(audio, ctrl.sim);
    } catch {}
  }, 120);

  // ---- next step prompt ------------------------------------------------------------------------------------
  // Short, concrete, and always something the player can do right now.
  YC.nextStep = function (sim) {
    const t = sim.state;
    const c = t.career;
    if (!t.open && t.time === 0) return "Press Open to welcome your first patient";
    const fl = sim.flowConstraint?.();
    if (fl && fl.waiting >= 3) {
      const dept = fl.department;
      if (/reception/i.test(dept)) return "Queue at reception: hire another receptionist";
      if (/assessment/i.test(dept)) return "Queue at assessment: add a CRNA or room";
      return `${dept} is backed up: ${fl.waiting} waiting`;
    }
    const tired = t.staff.filter((s) => s.energy < 35).length;
    if (tired && !sim.build.rooms.some((r) => r.function === "Staff lounge")) return `${tired} staff are worn out: build a lounge`;
    if (!c.research.current && sim.researchList?.().some((p) => !p.done && !p.locked && t.funds >= p.cost)) return "Start a research project";
    if (c.unlocked.length < 5 && t.funds > 1500) return "Unlock a new procedure in Research";
    return null;
  };
})();
