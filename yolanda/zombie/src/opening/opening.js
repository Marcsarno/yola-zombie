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
import { NARRATION, UPGRADE_PREVIEW, OBJECTIVES } from './content.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const L = (x, y, z) => new THREE.Vector3(x + CLINIC.x, y, z + CLINIC.z); // clinic-local -> world

// ---- camera shots: simulation-style rig (target, pitch, yaw, floor width across the screen) ----
// Each shot moves from `a` to `b` between t0 and t1 (eased) and holds b afterwards, until the next shot starts.
const S = (x, y, z, pitch, yaw, width, fov = 34) => ({ x: x + CLINIC.x, y, z: z + CLINIC.z, pitch, yaw, width, fov });
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
    at(60.0, 'hold', () => { this.state = 'CHECK_IN'; this.substate = 'ARRIVAL_HOLD'; this.hold = true; });
    c.sort((a, b) => a.t - b.t);
  }

  fire(cue) { this.cueLog.push([+this.t.toFixed(2), cue.name]); cue.fn(); }

  // ------------------------------------------------------------------ staging
  resetTour() {
    const st = this.stage, A = st.actors;
    this.t = 0; this.cueIdx = 0; this.hold = false; this.substate = ''; this.state = this.started ? 'TOUR' : 'PRELOAD';
    this.cueLog.length = 0; this.sub = '';
    st.tier = 'starter';
    for (const s of st.tiers) { s.fx = null; for (const [k, h] of Object.entries(s.layers || {})) { h.visible = k === 'starter'; st.setOpacity(h, 1); } }
    for (const a of Object.values(A)) { a.stop(); a.timeScale = 1; a.setVisible(false); a.seated = false; }
    // the receptionist sits at the desk (seat contract: the rig stands 0.45 m in front of the chair)
    A.staff.setVisible(true); A.staff.sitAt(-5.2, -5.5, 0, { instant: true });
    A.yola.waveT = -1; A.yola.pose = null;
    A.yola.place(6.0, -3.9, 0.5); A.yola.play('idle', { fade: 0 });
    // the visitors wait outside the shot until the arrival
    const bb = A.baseball, sg = A.security;
    bb.place(-7.7, 0.75, Math.PI / 2); bb.play('Idle', { fade: 0 }); if (bb.bat) bb.bat.visible = true; // bat in its supplied standing pose
    sg.place(-8.55, 1.55, Math.PI / 2); sg.play('Idle', { fade: 0 });
    st.batStatic.visible = false;
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
  dip(inS, outS) { // a soft dip through cream; reduced-flash keeps it gentle (longer, never white)
    if (this.silent) return;
    const k = this.reducedFlash ? 1.6 : 1;
    this.ui.setFadeColor(this.fadeColor); this.ui.setFade(1, inS * 1000 * k);
    setTimeout(() => this.ui.setFade(0, outS * 1000 * k), (inS * k + 0.12) * 1000);
  }
  tierLabel(text, name) { // preview-only label near the table
    if (!text) { this.ui.tag('tier', null); return; }
    this.ui.tag('tier', text, name);
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
  skip() { // Prompt 1 skip: straight to the arrival hold (the later prompts extend it to the Room 1 snapshot)
    if (!this.started) return;
    this.seek(this.END);
  }
  // dev/test: jump to time t by replaying the cue list silently from the start
  seek(t) {
    const wasSilent = this.silent; this.silent = true;
    this.sound.stopVoice();
    this.resetTour(); this.started = true; this.state = 'TOUR';
    this.ui.gate.classList.remove('show');
    while (this.t < t - 1e-6) this.step(Math.min(1 / 20, t - this.t));
    this.silent = wasSilent;
    this.ui.setFade(0, 0);
  }

  update(dt) {
    if (!this.active) return;
    if (this.started && !this.paused) this.step(dt);
    else this.stage.update(0); // keep the picture alive on the gate / while paused
    this.setCamera();
  }
  step(dt) {
    if (this.hold && this.t >= this.END) { this.stage.update(dt); this.tagsFollow(); return; } // the hold keeps idling
    const d = dt * this.timeScale;
    this.t = Math.min(this.END + 0.001, this.t + d);
    while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t <= this.t) this.fire(this.cues[this.cueIdx++]);
    this.stage.update(d);
    if (this.stage.tiers.some((s) => s.fx)) this.renderer.shadowMap.needsUpdate = true; // equipment fades change the shadows
    this.rig = this.shotAt(this.t);
    this.tagsFollow();
  }
  tagsFollow() {
    const t = this.ui.tags.get('tier');
    if (t && t.classList.contains('show')) {
      const p = L(5.6, 1.9, -2.4).project(this.camera);
      this.ui.placeTag('tier', (p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight);
    }
  }
  // test hook: the checkpoint report
  report() { return { state: this.state, substate: this.substate, t: +this.t.toFixed(2), tier: this.stage.tier, sub: this.sub, cues: this.cueLog.slice(-8) }; }
}
