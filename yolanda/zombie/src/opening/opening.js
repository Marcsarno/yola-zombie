// Opening director: the cheerful hospital-management tour (Prompt 1), driven by one clock and a cue list so that
// play, seek (dev) and skip all reach the same state. Later prompts extend the state list; this file owns it.
//
// States (brief): PRELOAD -> TOUR -> CHECK_IN -> SEATED_ASSESSMENT -> OR_CHOICES -> APPARENT_SUCCESS ->
// EMERGENCY_TOPDOWN -> FLATLINE_MOVEMENT -> GET_YOLA_SLOW -> MODEL_REVEAL -> SMOOTH_WAVE -> COMBAT_READY -> ROOM1_PLAYABLE.
// Implemented here: PRELOAD, TOUR (0:00-0:50) and the arrival hold (0:50-1:00, state CHECK_IN / ARRIVAL_HOLD).
import * as THREE from 'three';
import { ClinicStage, CLINIC } from './stage.js';
import { OpeningUI } from './ui.js';
import { OpeningAudio } from './opaudio.js';
import { NARRATION, UPGRADE_PREVIEW, OBJECTIVES, DIALOGUE, CARDS, EMERGENCY_LINES } from './content.js';
import { ROOM1 } from '../core/layout.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const L = (x, y, z) => new THREE.Vector3(x + CLINIC.x, y, z + CLINIC.z); // clinic-local -> world

// ---- camera shots: simulation-style rig (target, pitch, yaw, floor width across the screen) ----
// Each shot moves from `a` to `b` between t0 and t1 (eased) and holds b afterwards, until the next shot starts.
const S = (x, y, z, pitch, yaw, width, fov = 34) => ({ x: x + CLINIC.x, y, z: z + CLINIC.z, pitch, yaw, width, fov });
const W = (x, y, z, pitch, yaw, width, fov = 34) => ({ x, y, z, pitch, yaw, width, fov }); // world-space shot (the operating room)
const SHOTS = [
  // 0:00-0:12 above the reception entrance, gliding in toward the desk
  { t0: 0, t1: 11.6, a: S(-8.0, 0.8, 1.2, 66, 14, 8.4), b: S(-5.3, 0.9, -3.9, 49, 28, 8.4) },
  // 0:12-0:25 the treatment room: doorway and starter equipment in one composition, a slow push
  { t0: 12, t1: 25, a: S(4.0, 0.7, -1.9, 50, 30, 8.6), b: S(4.4, 0.8, -2.2, 49, 30, 7.6) },
  // 0:25-0:40 hold (the faintest drift so it breathes)
  { t0: 25, t1: 40, a: S(4.4, 0.8, -2.2, 49, 30, 7.6), b: S(4.45, 0.8, -2.25, 49, 30, 7.5) },
  // 0:40-0:50 reframe on original Yola: whole upper body and the waving hand
  { t0: 40, t1: 41.4, a: S(4.45, 0.8, -2.25, 49, 30, 7.5), b: S(6.0, 1.2, -3.9, 30, 16, 3.0) },
  { t0: 41.4, t1: 49.6, a: S(6.0, 1.2, -3.9, 30, 16, 3.0), b: S(6.0, 1.22, -3.9, 30, 16, 2.8) },
  // 0:50-1:00 back to the familiar simulation-height reception view: the entrance, the aisle and the desk
  { t0: 50, t1: 59.5, a: S(-6.6, 0.6, 0.9, 52, 30, 7.4), b: S(-6.5, 0.6, 0.85, 52, 30, 7.0) },
];

const LINES = {
  welcome: { t: 0.5, end: 11.8, text: NARRATION.welcome },
  essentials: { t: 12.4, end: 24.8, text: NARRATION.essentials },
  upgrades: { t: 25.3, end: 39.6, text: NARRATION.upgrades },
  yola: { t: 40.4, end: 49.6, text: NARRATION.yola },
  firstCase: { t: 50.5, end: 59.9, text: NARRATION.firstCase },
};

export class Opening {
  constructor(ctx) {
    Object.assign(this, ctx); // scene, camera, renderer, loader, audio, params, game(), arena, yola, getSim, tuning
    this.stage = new ClinicStage(this.scene, this.loader);
    this.ui = new OpeningUI();
    this.sound = new OpeningAudio(this.audio);
    this.active = false; this.started = false; this.state = 'PRELOAD'; this.sub = '';
    this.t = 0; this.END = 60; this.timeScale = 1; this.paused = false; this.silent = false;
    this.rig = { ...SHOTS[0].a };
    this.cues = []; this.cueIdx = 0;
    this.cueLog = [];
    this.co = null; this.wait = null; this.timers = []; this.marks = {}; this.runLabel = null; this.frozen = false; this.mode = 'cues'; this.camAnim = null; this.fx = null;
    this.answers = {}; this.animScale = 1; this.finalized = false; this.room1Preview = false; this.poseAnim = null; this.lightK = 1;
    this.fadeColor = '#fff6e6';
    this.reducedFlash = false;
    addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    addEventListener('blur', () => this.setPaused(true));
    addEventListener('focus', () => { if (!document.hidden) this.setPaused(false); });
    this.buildCues();
  }

  // ------------------------------------------------------------------ load
  async preload(onProgress) {
    this.state = 'PRELOAD';
    await this.stage.build(); onProgress?.(0.6);
    await this.stage.buildCast(); onProgress?.(0.9);
    this.stage.setActive(true);
    this.setupScene();
    this.resetTour();
    this.setCamera(); // frame the first shot so the shaders compile for it
    try { this.renderer.compile(this.scene, this.camera); } catch { /* ignore */ }
    this.warm();
    this.game?.().warmRoom1?.(); // compile the zombies and the unarmed Yola before the timed reveal (nothing visible changes)
    this.yola?.setShown?.(false); this.setupDone = true;
    onProgress?.(1);
  }

  // Render every distinct view once (the gate screen covers it), so the timed scene never hitches on first
  // draw: each shot, each equipment tier, each actor.
  warm() {
    const st = this.stage;
    for (const a of Object.values(st.actors)) a.setVisible(true);
    for (const s of st.tiers) for (const h of Object.values(s.layers || {})) h.visible = true;
    for (const sh of SHOTS) { this.rig = { ...sh.b }; this.setCamera(); this.renderer.render(this.scene, this.camera); }
    this.renderer.shadowMap.needsUpdate = true;
    this.resetTour();
  }

  setupScene() {
    // the sun and its (static) shadow follow us to the clinic; restored when the tour ends
    const A = this.arena;
    this.saved = { bg: this.scene.background?.clone?.(), sun: A.sun?.position.clone(), tgt: A.sun?.target.position.clone() };
    if (A.sun) {
      A.sun.target.position.set(CLINIC.x + 0.5, 0, CLINIC.z - 0.5);
      A.sun.position.set(CLINIC.x + 0.5 - 6, 14, CLINIC.z - 0.5 + 7);
      A.sun.target.updateMatrixWorld(true);
    }
    this.scene.background = new THREE.Color(0xcfe3df);
    // the combat wing's props carry dried-blood decals (the Blood_* materials): hidden for the innocent opening
    this.blood = []; A.group.traverse((o) => { if (o.isMesh && /^Blood_/i.test((o.material?.name) || '')) this.blood.push(o); });
    this.setBlood(false); this.yola?.setShown?.(false);
    for (const l of A.lights) l.visible = false; // the amber doorway lights belong to the combat wing
    document.getElementById('hud')?.style.setProperty('display', 'none');
    document.getElementById('touch')?.style.setProperty('pointer-events', 'none');
    this.renderer.shadowMap.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the cue list
  buildCues() {
    const c = this.cues, at = (t, name, fn) => c.push({ t, name, fn });
    const say = (k) => { const l = LINES[k]; at(l.t, 'say:' + k, () => { this.setSub(l.text); this.voice(l.text, l.end - l.t - 0.4); }); at(l.end, 'sub-off:' + k, () => this.setSub('')); };
    const st = this.stage, A = st.actors;
    // 0:00 reception
    at(0.0, 'music', () => this.music());
    at(0.2, 'title', () => this.ui.title('Yola’s Medical Center', 'Starter clinic'));
    say('welcome');
    at(10.2, 'title-off', () => this.ui.title(''));
    // 0:12 treatment room (a soft dip through cream hides the cut)
    at(11.55, 'dip-1', () => this.dip(0.45, 0.45));
    at(12.0, 'cut-treatment', () => { this.showRoom('treatment'); });
    say('essentials');
    // 0:25 / 0:32 equipment previews
    at(24.9, 'label-heading', () => this.ui.chip(UPGRADE_PREVIEW.heading));
    at(25.0, 'tier-standard', () => { st.setTier('standard', 1.0); this.chime(0); this.tierLabel(UPGRADE_PREVIEW.tiers[0].label, UPGRADE_PREVIEW.tiers[0].name); });
    say('upgrades');
    at(32.0, 'tier-advanced', () => { st.setTier('advanced', 1.0); this.chime(1); this.tierLabel(UPGRADE_PREVIEW.tiers[1].label, UPGRADE_PREVIEW.tiers[1].name); });
    at(39.0, 'tier-restore', () => { st.setTier('starter', 0.85); this.tierLabel(null); this.ui.chip(''); });
    // 0:40 original Yola's awkward wave
    say('yola');
    at(42.2, 'wave', () => { A.yola.startWave(); });
    at(47.1, 'wave-end', () => { A.yola.waveT = -1; A.yola.play('idle', { fade: 0.4 }); });
    // 0:50 the first arrival at reception
    at(49.55, 'dip-3', () => this.dip(0.45, 0.45));
    at(50.0, 'cut-reception', () => { this.showRoom('arrival'); });
    say('firstCase');
    at(50.9, 'objective', () => { this.ui.objective(OBJECTIVES.chart); this.ui.reward('First case reward: $250'); });
    // 1:00 hold
    at(60.0, 'act2', () => { this.mode = 'co'; this.co = this.act2(); });
    c.sort((a, b) => a.t - b.t);
  }

  fire(cue) { this.cueLog.push([+this.t.toFixed(2), cue.name]); cue.fn(); }

  // ------------------------------------------------------------------ staging
  resetTour() {
    const st = this.stage, A = st.actors;
    this.t = 0; this.cueIdx = 0; this.substate = ''; this.state = this.started ? 'TOUR' : 'PRELOAD';
    this.co = null; this.wait = null; this.timers.length = 0; this.marks = {}; this.frozen = false; this.mode = 'cues'; this.camAnim = null; this.fx = null; this.answers = {};
    this.ui.closeCard(); this.ui.letter(false);
    this.cueLog.length = 0; this.sub = '';
    st.tier = 'starter';
    for (const s of st.tiers) { s.fx = null; for (const [k, h] of Object.entries(s.layers || {})) { h.visible = k === 'starter'; st.setOpacity(h, 1); } }
    this.leaveOR(); this.alarmFx = null; this.ecg = null; this.tweens = []; this.tagPoints = null; this.urgencyTimer = 0; this.sound.alarmOff(); this.sound.flatlineOff(0.05);
    for (const a of Object.values(A)) { if (a.lying) a.unlie(); if (a.root.parent !== st.root) st.toClinic(a); a.adj = {}; a.stop(); a.timeScale = 1; a.setVisible(false); a.seated = false; }
    if (A.baseball.capSkin) A.baseball.capSkin.visible = true;
    this.ui.showEcg(false); this.ui.setVignette(0); this.ui.status(''); this.ui.urgency(null);
    this.animScale = 1; this.finalized = false; this.room1Preview = false; this.stillYola = false; this.poseAnim = null; this.restoreLook();
    // the receptionist sits at the desk (seat contract: the rig stands 0.45 m in front of the chair)
    A.staff.setVisible(true); A.staff.sitAt(-5.2, -5.5, 0, { instant: true });
    A.yola.waveT = -1; A.yola.pose = null;
    A.yola.place(6.0, -3.9, 0.5); A.yola.play('idle', { fade: 0 });
    // the visitors wait outside the shot until the arrival
    const bb = A.baseball, sg = A.security;
    bb.place(-7.7, 0.75, Math.PI / 2); bb.play('Idle', { fade: 0 }); if (bb.bat) bb.bat.visible = true; // bat in its supplied standing pose
    sg.place(-8.55, 1.55, Math.PI / 2); sg.play('Idle', { fade: 0 });
    st.batStatic.visible = false;
    for (const a of [A.staff, A.baseball, A.security]) { a.sitState = 'stand'; a.seat = null; }
    A.yola.sitW = 0; A.yola.sitTarget = 0; A.yola.sitState = 'stand'; A.yola.seat = null; A.yola.model.position.y = A.yola.baseY;
    this.ui.title(''); this.ui.objective(''); this.ui.reward(''); this.ui.chip(''); this.ui.clearTags(); this.ui.subtitle('');
    this.ui.setFade(0, 0); this.ui.setDark(0);
    this.rig = { ...SHOTS[0].a };
  }

  showRoom(which) {
    const A = this.stage.actors;
    if (which === 'treatment') { A.staff.setVisible(false); A.yola.setVisible(true); A.yola.play('idle', { fade: 0 }); }
    if (which === 'arrival') { A.yola.setVisible(false); A.staff.setVisible(true); A.baseball.setVisible(true); A.security.setVisible(true); }
  }

  // ------------------------------------------------------------------ camera
  shotAt(t) {
    let cur = null;
    for (const s of SHOTS) if (t >= s.t0) cur = s;
    if (!cur) cur = SHOTS[0];
    const u = ease((t - cur.t0) / (cur.t1 - cur.t0));
    const o = {};
    for (const k of Object.keys(cur.a)) o[k] = lerp(cur.a[k], cur.b[k], u);
    return o;
  }
  setCamera() {
    const r = this.rig, c = this.camera;
    const p = THREE.MathUtils.degToRad(r.pitch), y = THREE.MathUtils.degToRad(r.yaw);
    const fx = -Math.sin(y), fz = -Math.cos(y);
    c.fov = r.fov; c.updateProjectionMatrix();
    const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(r.fov) / 2) * c.aspect);
    const dist = clamp(r.width / (2 * Math.tan(hf / 2)), 2.5, 80); // metres of floor across the screen at the target
    c.position.set(r.x - fx * Math.cos(p) * dist, r.y + Math.sin(p) * dist, r.z - fz * Math.cos(p) * dist);
    c.lookAt(r.x, r.y, r.z);
  }

  // ------------------------------------------------------------------ helpers (audio is skipped in seek mode)
  setSub(text) { this.sub = text; this.ui.subtitle(text); }
  voice(text, secs) { if (!this.silent) this.sound.say(text, secs); }
  music() { if (!this.silent) this.sound.startMusic(0.5); }
  chime(step) { if (!this.silent) this.sound.chime(step); }
  dip(inS, outS) { // a soft dip through cream, driven by the story clock; reduced-flash keeps it gentler and slower
    if (this.silent) return;
    const k = this.reducedFlash ? 1.6 : 1;
    this.ui.setFadeColor(this.fadeColor); this.ui.fade.style.transition = 'none';
    this.fx = { t: 0, inS: inS * k, hold: 0.12, outS: outS * k };
  }
  tickFx(d) {
    const f = this.fx; if (!f) return;
    f.t += d;
    const a = f.t < f.inS ? ease(f.t / f.inS) : f.t < f.inS + f.hold ? 1 : 1 - ease((f.t - f.inS - f.hold) / f.outS);
    this.ui.fade.style.opacity = this.reducedFlash ? a * 0.85 : a;
    if (f.t >= f.inS + f.hold + f.outS) { this.ui.fade.style.opacity = 0; this.fx = null; }
  }
  tierLabel(text, name) { // preview-only label near the table
    if (!text) { this.ui.tag('tier', null); return; }
    this.ui.tag('tier', text, name);
  }

  // ------------------------------------------------------------------ story helpers
  later(sec, fn) { this.timers.push({ sec, fn }); }
  tickTimers(d) { for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.sec -= d; if (t.sec <= 0) { this.timers.splice(i, 1); t.fn(); } } }
  // a spoken line: subtitle (with the speaker) for secs, and the temporary voice if there is one
  speak(d, secs, pitch = 1.1) {
    this.sub = d.text; this.ui.subtitle(d.text, { who: d.who });
    if (!this.silent) this.sound.say(d.text, secs, pitch);
    const key = d.text; this.later(secs, () => { if (this.sub === key) { this.sub = ''; this.ui.subtitle(''); } });
  }
  mark(name) { this.marks[name] = +this.t.toFixed(2); this.cueLog.push([this.marks[name], 'mark:' + name]); if (this.runLabel === name) this.frozen = true; }
  // camera: glide to a shot; follow = { actor, dx, dz } keeps its target on that actor
  camTo(shot, secs = 1.2, follow = null) { this.camAnim = { from: { ...this.rig }, to: { ...shot }, t: 0, dur: Math.max(0.001, secs), follow }; }
  tickCamera(d) {
    const a = this.camAnim; if (!a) return;
    a.t += d; const u = ease(a.t / a.dur), o = {};
    for (const k of Object.keys(a.to)) o[k] = lerp(a.from[k], a.to[k], u);
    if (a.follow) {
      const fo = a.follow.actor.root.parent === this.scene ? 0 : CLINIC.x, foz = a.follow.actor.root.parent === this.scene ? 0 : CLINIC.z;
      const tx = a.follow.actor.x + fo + (a.follow.dx || 0), tz = a.follow.actor.z + foz + (a.follow.dz || 0);
      o.x = lerp(a.from.x, tx, u); o.z = lerp(a.from.z, tz, u);
      if (u >= 1) { const sm = Math.min(1, d * 5); o.x = this.rig.x + (tx - this.rig.x) * sm; o.z = this.rig.z + (tz - this.rig.z) * sm; }
    }
    this.rig = o;
  }
  // coroutine runner: act functions yield seconds (wait) or a predicate (wait until true)
  runCo(d) {
    let left = d, guard = 0;
    while (this.co && guard++ < 64 && !this.frozen) {
      const w = this.wait;
      if (w) {
        if (w.sec !== undefined) { w.sec -= left; left = 0; if (w.sec > 0) return; }
        else if (!w.fn()) return;
        this.wait = null;
      }
      const r = this.co.next();
      if (r.done) { this.co = null; return; }
      const v = r.value;
      this.wait = typeof v === 'number' ? { sec: v } : typeof v === 'function' ? { fn: v } : null;
    }
  }
  // wait predicates
  arrived(...actors) { return () => actors.every((a) => !a.busy); }
  seated(a) { return () => a.settled; }
  upright(a) { return () => a.upright; }

  setBlood(v) { for (const m of this.blood || []) m.visible = v; }
  // ---- the operating room (the real combat wing) as a story set ----
  setSun(x, z) { const A = this.arena; if (!A.sun) return; A.sun.target.position.set(x, 0, z); A.sun.position.set(x - 6, 14, z + 7); A.sun.target.updateMatrixWorld(true); this.renderer.shadowMap.needsUpdate = true; }
  enterOR() {
    const st = this.stage, A = this.arena;
    st.setActive(false);
    this.setSun(0, -7.5);
    this.scene.background = this.saved.bg || new THREE.Color(0x27323a);
    this.inOR = true;
    // the patient-belongings spot in the Supply Hall: the stowed bat and the cap, together; it stays for gameplay
    if (!this.belongings) {
      const g = new THREE.Group(); g.name = 'belongings';
      st.batStatic.visible = true; st.batStatic.parent?.remove(st.batStatic);
      const bat = st.batStatic; bat.rotation.set(0, 0.12, -Math.PI / 2); bat.position.set(-4.72, 0.86, -14.42); g.add(bat); // resting on the table top
      if (st.cap) { st.cap.visible = true; st.cap.position.set(-4.0, 0.84, -14.0); st.cap.rotation.y = 0.6; g.add(st.cap); }
      this.scene.add(g); this.belongings = g;
    }
    this.belongings.visible = true; st.batStatic.visible = true; if (st.cap) st.cap.visible = true;
    if (!this.spot) { this.spot = new THREE.SpotLight(0xfff0dc, 0, 14, 0.5, 0.75, 1.1); this.spot.position.set(ROOM1.player.x + 1.4, 4.0, ROOM1.player.z + 1.8); this.spot.target.position.set(ROOM1.player.x, 1.0, ROOM1.player.z); this.scene.add(this.spot, this.spot.target); }
    if (!this.redLight) { this.redLight = new THREE.PointLight(0xff2a2a, 0, 14, 1.5); this.redLight.position.set(0, 3.0, -7.0); this.scene.add(this.redLight); }
    if (!this.lightBase) this.lightBase = { hemi: A.hemi?.intensity ?? 0.85, sun: A.sun?.intensity ?? 1.45, env: this.scene.environmentIntensity ?? 0.32 };
  }
  leaveOR() {
    if (!this.inOR) return;
    this.inOR = false;
    if (this.belongings) this.belongings.visible = false;
    if (this.redLight) this.redLight.intensity = 0;
    this.stage.setActive(true); this.setSun(CLINIC.x + 0.5, CLINIC.z - 0.5); this.scene.background = new THREE.Color(0xcfe3df);
  }
  // the room's controlled light: k scales the whole wing's lighting (1 = the normal bright look)
  setLight(k) {
    const A = this.arena, b = this.lightBase; if (!b) return;
    k = Math.max(this.reducedFlash ? 0.32 : 0.02, k); this.lightK = k;
    if (A.hemi) A.hemi.intensity = b.hemi * k; if (A.sun) A.sun.intensity = b.sun * k; this.scene.environmentIntensity = b.env * k;
  }
  restoreLook() {
    this.setLight(1); this.lightK = 1;
    if (this.spot) this.spot.intensity = 0; if (this.redLight) this.redLight.intensity = 0;
    const Y = this.yola; Y?.setShown?.(false);
    this.game?.().hideZombieViews?.();
    this.sound.stopCombatAmbience(); this.setBlood(false);
    this.game?.().hudShow?.(false);
  }
  // alarm look: slow red pulses (amp 0..1) that never blackout and never exceed ~1 Hz; reduced flash softens them
  setAlarm(amp, hz = 0.8) { this.alarmFx = amp > 0 ? { amp, hz, t: 0 } : null; if (!amp) { if (this.redLight) this.redLight.intensity = 0; this.ui.setVignette(0); } }
  tickAlarm(d) {
    const a = this.alarmFx; if (!a) return;
    a.t += d; const p = 0.5 + 0.5 * Math.sin(a.t * Math.PI * 2 * a.hz - Math.PI / 2), k = this.reducedFlash ? 0.45 : 1;
    if (this.redLight) this.redLight.intensity = a.amp * k * (3 + 11 * p);
    this.ui.setVignette(a.amp * k * (0.15 + 0.45 * p));
  }
  tickEcg(d) { const e = this.ecg; if (!e) return; e.t += d; this.ui.drawEcg(e.t, e.flat); }

  // ================================================================== ACT 2: check-in, walk route, seated assessment
  *act2() {
    const st = this.stage, A = st.actors, an = st.anchors, bb = A.baseball, sg = A.security, rc = A.staff, yo = A.yola;
    const bat = bb.bat;
    this.state = 'CHECK_IN'; this.substate = 'ARRIVAL_HOLD'; this.mark('arrival-hold');
    // Yola was prepared off camera: seated in the staff chair behind the assessment desk (a controlled procedural seat:
    // the original rig has no seating clip), working through the chart
    yo.setVisible(true); yo.place(an.chairYola.x, an.chairYola.z, an.chairYola.yaw); yo.sitW = 1; yo.sitTarget = 1; yo.pose = 'sit'; yo.seated = true; yo.sitState = 'seated'; yo.sitSeatTop = an.chairYola.seatTop;
    yo.model.position.y = yo.baseY - (yo.pelvisY0 - (an.chairYola.seatTop + 0.04)); yo.play('chart', { fade: 0 });
    this.camTo(S(-6.3, 0.6, 0.8, 52, 30, 7.0), 0.01);
    // 1. arrival hold: the narrator line, then a cut to the receptionist's computer; the skinned bat is stowed during the cut
    this.speak(DIALOGUE.star, 8.0, 1.1);
    yield 2.4;
    this.dip(0.35, 0.35); yield 0.4;
    if (bat) bat.visible = false; // runtime logic: the bat cannot stay attached for walking or sitting
    this.camTo(S(-5.2, 1.05, -4.9, 30, 22, 3.3), 0.01); rc.turnTo(0.3);
    yield 3.0;
    this.dip(0.35, 0.35); yield 0.4;
    rc.turnTo(-0.3);
    this.camTo(S(-6.0, 0.5, 0.0, 52, 30, 9.4), 0.01);
    yield 1.9;
    // 2. walk to check-in: entrance -> public aisle -> queue anchor; the guard follows a body length behind, to the side
    this.substate = 'WALK'; this.mark('walk-start');
    bb.walk([[-6.4, 0.9], [-5.2, -1.0], [an.queue.x, an.queue.z]], { endYaw: Math.PI });
    yield 1.0;
    sg.walk([[-7.0, 1.5], [-5.6, -0.2], [-4.8, -1.4], [an.guardQueue.x, an.guardQueue.z]], { endYaw: Math.PI });
    yield this.arrived(bb, sg);
    this.mark('queue');
    // 3. visible check-in: the receptionist acknowledges, glances at the computer, looks back; the visitors wait three seconds
    this.camTo(S(-5.3, 0.9, -3.5, 50, 26, 5.4), 1.2);
    yield 0.7; // she acknowledges them (already turned toward the queue)
    rc.turnTo(0.3); yield 1.9; // turns to the computer for a brief check
    rc.turnTo(-0.3); yield 0.9; this.mark('checkin'); // and looks back
    this.speak(DIALOGUE.welcome, 4.8, 1.3);
    yield 0.3; if (!this.silent) this.sound.confirm();
    yield 4.8;
    // 4. assessment entry: the athlete leads, the guard follows to the doorway then goes to a waiting chair
    this.substate = 'ASSESSMENT_ENTRY';
    this.speak(DIALOGUE.takeChair, 3.0, 1.3);
    bb.walk([[-3.4, -1.7], [-1.0, -0.2], [an.doorway.x, an.doorway.z], [1.5, 0.6], [1.6, 3.4], [an.chairPatient.x, an.chairPatient.z - 0.45]], { endYaw: Math.PI });
    this.camTo(S(-3.5, 0.7, -1.6, 46, 28, 8.0), 1.5, { actor: bb, dx: 0.8, dz: 0.5 });
    yield 1.4;
    sg.walk([[-4.2, -1.6], [-1.4, -0.2]]);
    yield this.arrived(sg);
    this.mark('guard-at-door');
    sg.walk([[-2.8, 0.4], [-4.6, 1.9], [an.guardChair.x, an.guardChair.z - 0.45 - 0.5], [an.guardChair.x, an.guardChair.z - 0.45]], { endYaw: Math.PI });
    yield this.arrived(bb);
    this.mark('athlete-at-chair-anchor');
    // 5. seat, then ask: turn to face Yola, align, SitDown, SeatedIdle
    this.state = 'SEATED_ASSESSMENT'; this.substate = 'SEATING';
    this.camTo(S(2.7, 0.9, 2.65, 32, 78, 4.3), 1.6);
    yield this.arrived(bb);
    bb.sitAt(an.chairPatient.x, an.chairPatient.z, an.chairPatient.yaw);
    yield this.arrived(sg);
    sg.sitAt(an.guardChair.x, an.guardChair.z, an.guardChair.yaw);
    yield this.seated(bb);
    yield 0.9; this.mark('both-seated');
    this.speak(DIALOGUE.review, 3.0, 1.4);
    yield 3.4;
    // the first (development placeholder) card: only now, and it waits for the player indefinitely
    this.substate = 'CARD_OPEN';
    const card = CARDS[0];
    this.mark('card-open');
    const ans = yield* this.askCard(card);
    this.answers[card.id] = ans; this.mark('card-answered');
    // 6. departure: Yola stands first and steps clear, the athlete stands, Yola leads, the athlete follows; the guard stays seated
    this.substate = 'DEPARTURE';
    this.speak(DIALOGUE.toOR, 3.0, 1.4);
    yield 0.6;
    yo.riseUp(); yield this.upright(yo); yo.play('idle', { fade: 0.3 });
    yo.walk([[1.7, 1.3]]); yield this.arrived(yo);
    bb.standUp(); yield this.upright(bb);
    this.camTo(S(0.4, 0.9, 0.9, 46, 30, 7.4), 1.4, { actor: yo, dx: 0.4, dz: 0.2 });
    yo.walk([[1.3, 0.5], [an.doorway.x, an.doorway.z], [-1.0, -1.5], [an.orDoor.x, an.orDoor.z + 0.4]], { endYaw: Math.PI });
    yield 1.3;
    bb.walk([[1.6, 3.4], [1.4, 0.8], [an.doorway.x, an.doorway.z], [-1.0, -0.9], [an.orDoor.x + 0.1, an.orDoor.z + 1.7]], { endYaw: Math.PI });
    yield this.arrived(yo, bb);
    this.camTo(S(-1.4, 1.0, -3.6, 40, 30, 5.6), 1.2);
    yield 1.0;
    this.substate = 'OR_ENTRANCE_HOLD'; this.mark('or-entrance');
    yield* this.act3();
  }

  // ================================================================== ACT 3: OR choices, apparent success, impossible movement
  *act3() {
    const st = this.stage, A = st.actors, bb = A.baseball, yo = A.yola, ta = A.teamA, tb = A.teamB;
    this.state = 'OR_CHOICES'; this.substate = 'ENTER';
    // 1. enter and prepare: Yola leads through the OR doorway; the athlete follows after she clears it
    this.speak(DIALOGUE.settle, 3.0, 1.4);
    this.dip(0.4, 0.4); yield 0.45;
    this.enterOR();
    for (const a of [yo, bb, ta, tb]) a.setVisible(true);
    st.actorToWorld(ta, 0.6, -9.2, 0); ta.play('Idle', { fade: 0 }); // the team is already at the table
    st.actorToWorld(tb, 1.75, -8.2, -Math.PI / 2); tb.play('Idle', { fade: 0 });
    st.actorToWorld(yo, 0.3, -4.1, Math.PI); st.actorToWorld(bb, 0.35, -2.4, Math.PI); bb.play('Idle', { fade: 0 }); yo.play('walk', { fade: 0 });
    A.staff.setVisible(false); A.security.setVisible(false);
    this.camTo(W(0, 0.9, -6.4, 50, 35, 8.0), 0.01);
    yo.walk([[0.2, -5.6], [-0.9, -7.0], [-1.4, -8.2]], { endYaw: Math.PI / 2 });
    this.mark('or-enter');
    yield 1.5;
    bb.walk([[0.35, -5.5], [0.0, -6.6], [0.0, -7.35]], { endYaw: Math.PI });
    yield this.arrived(yo, bb);
    this.mark('or-standing');
    yield 0.6;
    // the athlete is moved onto the table behind a cut to the anesthesia equipment (three seconds); the cap comes off
    this.dip(0.35, 0.35); yield 0.4;
    this.camTo(W(-2.3, 1.15, -10.0, 28, 30, 3.6), 0.01);
    if (bb.capSkin) bb.capSkin.visible = false;
    bb.play('Idle', { fade: 0 }); bb.lie(0.9, 1.07, -8.2, Math.PI / 2); // supine, head to the west end (the anesthesia side), arms at his sides
    yo.place(-1.3, -8.2, Math.PI / 2); yo.play('idle', { fade: 0 });
    yield 3.0;
    // continuity insert: the belongings spot in the Supply Hall (the bat and the cap together)
    this.dip(0.3, 0.3); yield 0.35;
    this.camTo(W(-4.3, 0.8, -14.3, 56, 30, 3.0), 0.01);
    this.mark('belongings');
    yield 2.0;
    this.dip(0.3, 0.3); yield 0.35;
    // back to the OR wide shot: the athlete supported on the table, Yola attending at his head, the team around the table
    this.camTo(W(0, 0.95, -8.2, 52, 35, 7.6), 0.01);
    this.mark('or-wide');
    yield 1.8;

    // 2. first OR choice, player-paced
    this.substate = 'CHOICE_1';
    this.speak(DIALOGUE.equipment, 3.0, 1.4);
    this.camTo(W(-2.0, 1.0, -9.8, 38, 35, 5.4), 1.6);
    yield 1.8;
    this.camTo(W(-1.0, 0.9, -8.8, 50, 33, 5.8), 1.2);
    yield 1.4;
    this.ui.tag('equip', 'Check the equipment', 'Anesthesia workstation'); this.pointAt('equip', -2.3, 1.8, -10.4);
    this.mark('or-card-1');
    const a1 = yield* this.askCard(CARDS[1]);
    this.answers[CARDS[1].id] = a1; this.ui.tag('equip', null);
    if (!this.silent) this.sound.chime(0);
    yield 0.6;
    // 3. second OR choice and apparent success
    this.substate = 'CHOICE_2';
    this.speak(DIALOGUE.monitor, 3.0, 1.4);
    this.camTo(W(1.2, 0.95, -9.2, 46, 35, 5.8), 1.6);
    yield 1.8;
    this.ui.tag('monitor', 'Check the monitor', 'Patient monitor'); this.pointAt('monitor', 2.2, 1.9, -10.45);
    this.mark('or-card-2');
    const a2 = yield* this.askCard(CARDS[2]);
    this.answers[CARDS[2].id] = a2; this.ui.tag('monitor', null);
    if (!this.silent) this.sound.confirm();
    this.state = 'APPARENT_SUCCESS'; this.substate = 'SETUP_COMPLETE';
    this.ui.status(EMERGENCY_LINES.stable);
    this.camTo(W(0, 0.95, -8.2, 52, 35, 7.0), 1.6);
    this.mark('setup-complete');
    yield 4.0; // let the success land (the earlier case reward stays pending)

    // 4. something changes: slow red pulses, beeps, the music fades
    this.state = 'EMERGENCY_TOPDOWN'; this.substate = 'ALERT';
    this.ui.status(EMERGENCY_LINES.alert, true); this.ui.urgency(1);
    this.setAlarm(1, 0.8);
    if (!this.silent) { this.sound.setMusicLevel(0, 1.8); this.sound.alarmOn(0.75); }
    this.speak(DIALOGUE.somethingWrong, 3.2, 1.0);
    this.mark('alert');
    yo.walk([[-1.7, -9.2], [-2.0, -9.7]], { endYaw: Math.PI * 0.85 }); // she steps from the patient to the nearby workstation; the team stays
    let u = 1; this.urgencyTimer = 6; // a cosmetic bar only: nothing is lost when it empties
    yield 3.4;
    // 5. flatline, motion, and the call
    this.state = 'FLATLINE_MOVEMENT'; this.substate = 'FLATLINE';
    this.camTo(W(0.45, 1.0, -8.3, 48, 35, 3.9), 2.2); // eases toward the patient and the team; Yola's workstation drops out of the frame
    this.ecg = { t: 0, flat: true }; this.ui.showEcg(true);
    if (!this.silent) { this.sound.alarmOff(); this.sound.flatlineOn(); }
    this.ui.status('No heartbeat', true); this.ui.urgency(null);
    this.mark('flatline');
    yield 2.0;
    // one small, achievable movement: his head turns a little and a hand lifts
    this.substate = 'MOTION';
    bb.adjust('head', 'head', 0, 0.55, 0, 0); bb.adjust('hand', 'forearm.R', 0, 0, -0.45, 0);
    this.tween(1.4, (k) => { bb.adj.head.w = ease(k); bb.adj.hand.w = ease(k); });
    this.mark('motion');
    yield 1.6;
    ta.turnTo(Math.PI); tb.turnTo(Math.PI / 2);
    this.speak(DIALOGUE.stillMoving, 2.6, 1.0);
    this.recoil(tb, -0.28, 0.4); yield 2.8;
    // the tone falls away; a short quiet pause
    if (!this.silent) this.sound.flatlineOff(0.6);
    this.ui.status('', false);
    this.mark('quiet'); yield 1.6;
    // a brief scream; the staff recoil (modestly, away from the table)
    this.substate = 'SCREAM';
    if (!this.silent) this.sound.scream();
    this.recoil(ta, 0.45, 0.5); this.recoil(tb, 0.3, 0.5);
    this.mark('scream'); yield 1.3;
    this.speak(DIALOGUE.getYola, 3.0, 1.0);
    this.substate = 'GET_YOLA_LINE';
    this.mark('get-yola');
    yield 3.2; // line and subtitle finish
    this.substate = 'GET_YOLA_HOLD'; this.mark('get-yola-done');
    yield 0.05;
    yield* this.act4();
  }

  // gentle value animation on the story clock: fn(k) for k 0..1 over secs
  tween(secs, fn) { const o = { t: 0 }; fn(0); const tick = (d) => { o.t += d; const k = Math.min(1, o.t / secs); fn(k); return k >= 1; }; (this.tweens ||= []).push(tick); }
  tickTweens(d) { if (!this.tweens) return; this.tweens = this.tweens.filter((t) => !t(d)); }
  // a world-anchored tag
  pointAt(id, x, y, z) { this.tagPoints ||= {}; this.tagPoints[id] = new THREE.Vector3(x, y, z); }
  // a modest step back/away from the table (staff recoil): slide the actor along its facing axis while walking backwards
  recoil(a, dist, secs) {
    const dx = -Math.sin(a.yaw) * dist, dz = -Math.cos(a.yaw) * dist, x0 = a.root.position.x, z0 = a.root.position.z;
    this.tween(secs, (k) => { const e = ease(k); a.root.position.x = x0 + dx * e; a.root.position.z = z0 + dz * e; });
  }

  // ================================================================== ACT 4: the same-position reveal, the smooth wave, unarmed play
  *act4() {
    const st = this.stage, A = st.actors, yo = A.yola, an = ROOM1.player, Y = this.yola, g = this.game();
    const slow = (k) => { this.animScale = 1 - 0.65 * ease(k); };
    // 1. the call changes the scene: perceived time slows, the red pulses slow, only now the room darkens
    this.state = 'GET_YOLA_SLOW'; this.substate = 'CALL';
    this.tween(1.4, slow); this.setAlarm(1, 0.4);
    if (!this.silent) this.sound.revealCue();
    this.camTo(W(an.x + 0.45, 0.95, an.z + 0.3, 34, 28, 3.8), 2.0);
    yo.walk([[an.x, an.z]], { endYaw: an.yaw, speed: 0.9 }); // she turns toward the disturbance and settles at the anchor
    this.tween(2.0, (k) => this.setLight(1 - 0.6 * ease(k)));
    yield 2.0; yield this.arrived(yo);
    yo.place(an.x, an.z, an.yaw); // exactly the anchor and facing the improved model will take
    this.mark('call-settled');
    // 2. old Yola -> dim -> improved Yola at the same world anchor (a few slow changes, never a strobe)
    this.state = 'MODEL_REVEAL'; this.substate = 'HOLD_OLD';
    this.tween(0.9, (k) => { this.spot.intensity = 70 * ease(k); this.setLight(0.4 - 0.2 * ease(k)); });
    this.setAlarm(0);
    yield 1.5; // old Yola, clearly, for one beat
    this.substate = 'DIM';
    this.tween(0.8, (k) => { this.spot.intensity = 70 * (1 - ease(k)); this.setLight(0.2 - 0.17 * ease(k)); });
    yield 0.9;
    // in the dark: swap the models at the one anchor (the patient and team leave the frame's rendering; no duplicate humans remain)
    yo.setVisible(false); for (const a of [A.baseball, A.teamA, A.teamB]) a.setVisible(false);
    Y.reset(an.x, an.z, an.yaw); Y.setShown(true); this.stillYola = true; this.game().stillYola(0.016);
    this.mark('swapped');
    this.substate = 'IMPROVED_SILHOUETTE';
    this.tween(1.6, (k) => { const p = Math.sin(Math.PI * ease(k)); this.redLight.position.set(an.x + 1.2, 2.6, an.z + 1.0); this.redLight.intensity = (this.reducedFlash ? 0.5 : 1) * 16 * p; this.setLight(0.03 + 0.14 * ease(k)); });
    yield 1.7;
    this.substate = 'SETTLE';
    this.tween(1.3, (k) => { this.spot.intensity = 60 * ease(k); this.setLight(0.17 + 0.5 * ease(k)); this.redLight.intensity = 0; });
    yield 1.6; this.mark('reveal-settled');
    // 3. the smooth wave: her own existing clip, once, at its natural timing (a callback to the awkward wave)
    this.state = 'SMOOTH_WAVE'; this.substate = 'WAVE';
    this.animScale = 1; this.camTo(W(an.x + 0.05, 1.2, an.z, 22, 26, 2.3), 1.0);
    Y.playScript('t_greet_04', { fadeIn: 0.3, fadeOut: 0.5 });
    if (!this.silent) this.sound.payoff();
    this.tween(1.6, (k) => this.setLight(0.67 + 0.18 * ease(k)));
    yield Y.scriptLength('t_greet_04') + 1.0; this.mark('wave-done');
    // 4. return to the actual game: the combat framing, the room readable again, the zombies present once the camera widens
    this.state = 'COMBAT_READY'; this.substate = 'RETURN';
    this.ui.subtitle(''); this.sub = '';
    const pose = g.cameraPose(an.x, an.z, an.yaw); this.camera.fov = 34; this.camera.updateProjectionMatrix();
    this.setCamera(); this.poseTo(pose, 2.2);
    this.tween(2.0, (k) => this.setLight(0.85 + 0.15 * ease(k)));
    if (!this.silent) { this.sound.setMusicLevel(0, 0.2); this.sound.combatAmbience(); }
    yield 1.1;
    this.revealZombies(); // concealed until the camera is widening; no spawn effects
    yield 1.2;
    this.finalize('normal');
  }

  poseTo(pose, secs) { this.poseAnim = { from: { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov }, to: pose, t: 0, dur: Math.max(0.001, secs) }; }
  tickPose(d) {
    const a = this.poseAnim; if (!a) return;
    a.t += d; const u = ease(a.t / a.dur), c = this.camera;
    c.position.lerpVectors(a.from.pos, a.to.pos, u); c.quaternion.slerpQuaternions(a.from.quat, a.to.quat, u); c.fov = lerp(a.from.fov, a.to.fov, u); c.updateProjectionMatrix();
  }
  // the three preplaced zombies become visible (still, unaware) as the camera widens
  revealZombies() { const g = this.game(); this.setBlood(true); g.applyRoom1(); this.room1Preview = true; }

  // THE canonical Room 1 hand-off: normal completion, skip, replay and direct start all end here. Idempotent.
  finalize(via = 'normal') {
    if (this.finalized) return; this.finalized = true;
    const st = this.stage, A = st.actors, g = this.game(), an = ROOM1.player;
    // story state off: overlays, audio, timers, tweens, listeners that belong to the story
    this.co = null; this.wait = null; this.timers.length = 0; this.tweens = []; this.fx = null; this.camAnim = null; this.poseAnim = null; this.tagPoints = null;
    this.sound.alarmOff(); this.sound.flatlineOff(0.2); this.sound.stopVoice();
    this.ecg = null; this.ui.showEcg(false); this.ui.setVignette(0); this.ui.status(''); this.ui.urgency(null); this.ui.subtitle(''); this.ui.clearTags(); this.ui.closeCard();
    this.ui.title(''); this.ui.chip(''); this.ui.objective(''); this.ui.reward(''); this.ui.setDark(0); this.ui.fade.style.opacity = 0; this.ui.letter(false);
    // the world: clinic away, combat lighting back, the cast gone (no duplicate humans), the guard waiting at reception
    st.setActive(false); this.inOR = true; // (the OR is the world now)
    const Bk = this.saved || {};
    this.scene.background = Bk.bg || new THREE.Color(0x27323a);
    if (this.arena.sun && Bk.sun) { this.arena.sun.position.copy(Bk.sun); this.arena.sun.target.position.copy(Bk.tgt); this.arena.sun.target.updateMatrixWorld(true); }
    this.renderer.shadowMap.needsUpdate = true;
    for (const l of this.arena.lights) l.visible = true;
    this.animScale = 1; this.setLight(1); this.lightK = 1; if (this.spot) this.spot.intensity = 0; if (this.redLight) this.redLight.intensity = 0;
    this.setBlood(true);
    if (this.belongings) { this.belongings.visible = true; st.batStatic.visible = !this.batPicked; }
    for (const k of ['yola', 'baseball', 'teamA', 'teamB', 'staff']) A[k].setVisible(false);
    const sg = A.security; // the guard waits in a Waiting Area chair near reception (Room 2's pistol connection)
    st.actorToWorld(sg, 0, 0, Math.PI / 2); sg.setVisible(true); sg.sitAt(-6.45, -1.5, Math.PI / 2, { instant: true }); sg.play('SeatedIdle', { fade: 0 });
    // the game: the canonical snapshot
    g.applyRoom1(); g.previewRoom1(0);
    this.stillYola = false; this.room1Preview = false; this.active = false; this.state = 'ROOM1_PLAYABLE'; this.substate = via;
    this.ui.show(false); g.hudShow(true);
    this.mark('room1-playable');
  }
  ambient(dt) { const sg = this.stage.actors.security; if (this.finalized && sg.root.visible) sg.update(dt); }
  takeBat() { this.batPicked = true; this.stage.batStatic.visible = false; }
  // dev: replay the whole opening from the start, cleanly
  replay() {
    if (!this.started) return;
    this.finalized = false; this.batPicked = false; this.active = true; this.ui.show(true); this.beginSilent(); this.endSilent();
    this.sound.stopMusic(0.1); this.sound.stopAmbience(); this.started = true; this.resetTour(); this.sound.unlock();
  }


  // a development card: opens the UI, waits for the choice and for the feedback to be dismissed (no timer).
  // In a silent (seek/skip) run it answers itself with the first option unless the run is stopping here.
  *askCard(card) {
    if (this.silent && this.runLabel !== 'card-open') return card.options[0].id;
    this.cardDone = null;
    this.ui.askCard(card).then((id) => { this.cardDone = id; });
    yield () => this.cardDone !== null;
    const id = this.cardDone; this.cardDone = null; this.ui.closeCard();
    return id;
  }

  // ------------------------------------------------------------------ run
  begin() { // after preload: show the title gate, or start straight away (?auto=1)
    this.active = true; this.ui.show(true);
    this.setCamera();
    this.ui.gate.classList.add('show');
    this.ui.goB.disabled = false; this.ui.goB.textContent = 'Start';
    this.ui.bar.style.width = '100%';
    this.ui.goB.onclick = () => { this.sound.unlock(); this.start(); };
    this.ui.skipB.onclick = () => this.skip();
    this.ui.muteB.onclick = () => { const m = !this.audio.muted; this.audio.setMuted(m); this.ui.muteB.classList.toggle('off', m); if (m) this.sound.stopVoice(); };
    this.ui.flashB.onclick = () => { this.reducedFlash = !this.reducedFlash; this.ui.flashB.classList.toggle('off', !this.reducedFlash); };
    this.ui.flashB.classList.toggle('off', !this.reducedFlash);
    if (this.params.has('room1')) { this.started = true; this.beginSilent(); this.finalize('direct'); return; } // dev: straight to the canonical Room 1 snapshot
    if (this.params.has('reveal')) { this.ui.gate.classList.remove('show'); this.sound.unlock(); this.started = true; this.runTo('get-yola-done', { stopAtLabel: false }); return; } // dev: the reveal replay
    if (this.params.get('auto') === '1') this.start();
  }
  start() {
    if (this.started) return; // idempotent: repeated taps do nothing
    this.started = true; this.state = 'TOUR';
    this.ui.gate.classList.remove('show');
    this.resetTour();
  }
  setPaused(p) {
    if (!this.started || this.paused === p) return;
    this.paused = p; this.sound.suspend(p);
  }
  skip() { // replay silently to the end of the implemented story (later prompts extend this to the Room 1 snapshot)
    if (!this.started) return;
    this.runTo('room1-playable', { stopAtLabel: false, maxSec: 600 });
  }
  // dev/test: jump to time t by replaying the story silently from the start
  seek(t) {
    this.beginSilent();
    while (this.t < t - 1e-6) this.step(Math.min(1 / 20, t - this.t));
    this.endSilent();
  }
  // dev/test: replay silently until the named marker is reached (stopAtLabel keeps the scene frozen there, e.g. an open card)
  runTo(label, { stopAtLabel = true, maxSec = 400 } = {}) {
    this.beginSilent(); this.runLabel = stopAtLabel ? label : null;
    let guard = 0;
    while (!(label in this.marks) && this.t < maxSec && guard++ < 40000) this.step(1 / 20);
    const keep = stopAtLabel; this.endSilent(keep);
    if (keep && label === 'card-open') this.ui.askCard(CARDS[0]);
    return this.marks[label];
  }
  beginSilent() { this.silent = true; this.sound.stopVoice(); this.resetTour(); this.started = true; this.state = 'TOUR'; this.ui.gate.classList.remove('show'); }
  endSilent(keepFrozen = false) { this.silent = false; this.runLabel = null; if (!keepFrozen) this.frozen = false; this.ui.fade.style.opacity = 0; this.fx = null; this.ui.setFade(0, 0); }

  update(dt) {
    if (!this.active) return;
    if (this.started && !this.paused) this.step(dt);
    else this.stage.update(0); // keep the picture alive on the gate / while paused
    if (!this.poseAnim) this.setCamera();
  }
  step(dt) {
    const da = dt * this.animScale; // animations (and the preview) run on the slowed clock; the story clock and light tweens do not
    if (this.frozen) { this.stage.update(da); this.tickCamera(dt); this.tickFx(dt); this.tagsFollow(); return; }
    const d = dt * this.timeScale;
    this.t += d;
    this.tickTimers(d);
    if (this.mode === 'cues') {
      while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t <= this.t) this.fire(this.cues[this.cueIdx++]);
    } else this.runCo(d);
    this.stage.update(da);
    if (this.stillYola) this.game().stillYola?.(da);
    if (this.stage.tiers.some((s) => s.fx)) this.renderer.shadowMap.needsUpdate = true; // equipment fades change the shadows
    if (this.poseAnim) this.tickPose(d); else if (this.mode === 'cues' && !this.camAnim) this.rig = this.shotAt(this.t); else this.tickCamera(d);
    this.tickFx(d); this.tickAlarm(d); this.tickEcg(d); this.tickTweens(d);
    if (this.urgencyTimer > 0) { this.urgencyTimer -= d; this.ui.urgency(Math.max(0, this.urgencyTimer / 6)); }
    this.tagsFollow();
  }
  tagsFollow() {
    if (this.tagPoints) for (const id in this.tagPoints) { const t = this.ui.tags.get(id); if (t && t.classList.contains('show')) { const p = this.tagPoints[id].clone().project(this.camera); this.ui.placeTag(id, (p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight); } }
    const t = this.ui.tags.get('tier');
    if (t && t.classList.contains('show')) {
      const p = L(5.6, 1.9, -2.4).project(this.camera);
      this.ui.placeTag('tier', (p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight);
    }
  }
  // test hook: the checkpoint report
  report() { return { state: this.state, substate: this.substate, t: +this.t.toFixed(2), tier: this.stage.tier, sub: this.sub, cues: this.cueLog.slice(-8) }; }
}
