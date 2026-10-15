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
import { BOSS_CARD, TOUR, NARRATION, UPGRADE_PREVIEW, OBJECTIVES, DIALOGUE, CARDS, EMERGENCY_LINES } from './content.js';
import { ROOM1 } from '../core/layout.js';
const BELONG = ROOM1.belongings; // the patient-belongings table in the Supply Hall (bat and cap)
// the athlete's clothing after the change, by material: white top and trousers, the trims and lettering whitened too
const PATIENT_OUTFIT = { Jersey_Cream: 0xf2f1ec, Trousers_Gray: 0xebeae4, Uniform_Navy: 0xe4e3dd, Markings_OffWhite: 0xf2f1ec };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const L = (x, y, z) => new THREE.Vector3(x + CLINIC.x, y, z + CLINIC.z); // clinic-local -> world

// ---- camera shots: simulation-style rig (target, pitch, yaw, floor width across the screen) ----
// Each shot moves from `a` to `b` between t0 and t1 (eased) and holds b afterwards, until the next shot starts.
const S = (x, y, z, pitch, yaw, width, fov = 34) => ({ x: x + CLINIC.x, y, z: z + CLINIC.z, pitch, yaw, width, fov });
const W = (x, y, z, pitch, yaw, width, fov = 34) => ({ x, y, z, pitch, yaw, width, fov }); // world-space shot (the operating room)
const OFFICE_SHOT = S(6.3, 0.85, -3.0, 30, 72, 4.6); // the assessment office from the east: Yola and both visitors in profile across the desk
// the outside of the medical center: low and front-on to the entrance (the sign, the canopy, the glass doors and the
// planters), pushing slowly in toward the doors as they slide open
const EXT_A = { ...S(-9.7, 2.2, 0.9, 4, -95, 7.0, 46), fitH: 7.4 }, EXT_B = { ...S(-9.7, 1.8, 0.9, 0, -90, 4.0, 46), fitH: 4.4 };
const IN_A = S(-8.0, 0.8, 1.2, 66, 14, 8.4), IN_B = S(-5.3, 0.9, -3.9, 49, 28, 8.4);
const EXT_END = 5.6; // the cut through the doors into the reception
const SHOTS = [
  // 0:00-0:06 outside: the push in toward the entrance
  { t0: 0, t1: EXT_END, a: EXT_A, b: EXT_B },
  // 0:06-0:12 inside: above the reception entrance, gliding in toward the desk
  { t0: EXT_END, t1: 11.6, a: IN_A, b: IN_B },
  // 0:12-0:25 the treatment room: doorway and starter equipment in one composition, a slow push
  { t0: 12, t1: 25, a: S(4.50, 0.8, 2.45, 49, 30, 8.8), b: S(4.80, 0.8, 2.35, 49, 30, 7.8) },
  // 0:25-0:40 hold (the faintest drift so it breathes)
  { t0: 25, t1: 40, a: S(4.80, 0.8, 2.35, 49, 30, 7.8), b: S(4.85, 0.8, 2.35, 49, 30, 7.7) },
  // 0:40-0:50 reframe on original Yola: whole upper body and the waving hand
  { t0: 40, t1: 41.4, a: S(4.85, 0.8, 2.35, 49, 30, 7.7), b: S(5.0, 1.2, 3.7, 30, 16, 3.0) },
  { t0: 41.4, t1: 49.6, a: S(5.0, 1.2, 3.7, 30, 16, 3.0), b: S(5.0, 1.22, 3.7, 30, 16, 2.8) },
  // 0:50-1:00 back to the familiar simulation-height reception view: the entrance, the aisle and the desk
  { t0: 50, t1: 59.5, a: S(-6.6, 0.6, 0.9, 52, 30, 7.4), b: S(-6.5, 0.6, 0.85, 52, 30, 7.0) },
];


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
    await this.stage.buildCast(); onProgress?.(0.8);
    this.stage.onPop = () => { if (!this.silent) this.sound.pop?.(); };
    this.narrLoaded = await this.sound.loadNarration(TOUR.audio); onProgress?.(0.9);
    this.stage.setActive(true);
    this.setupScene();
    this.resetTour();
    this.setCamera(); // frame the first shot so the shaders compile for it
    try { this.renderer.compile(this.scene, this.camera); } catch { /* ignore */ }
    this.warm();
    for (const l of this.arena.lights) l.visible = true; // the combat configuration (amber door lights on) compiles too
    this.game?.().warmRoom1?.(); // compile the zombies and the unarmed Yola before the timed reveal (nothing visible changes)
    for (const l of this.arena.lights) l.visible = false;
    // the operating room with the reveal lights, in the opening's lighting
    this.setBlood(true); this.belongings.visible = true; this.rig = { ...W(0, 0.9, -8.0, 50, 35, 8.0) }; this.setCamera(); this.renderer.render(this.scene, this.camera); this.setBlood(false); this.belongings.visible = false;
    this.rig = { ...SHOTS[0].a }; this.setCamera();
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
    this.setBlood(false); this.yola?.setShown?.(false); this.ensureLights(); this.ensureBelongings(); this.belongings.visible = false;
    for (const l of A.lights) l.visible = false; // the amber doorway lights belong to the combat wing
    document.getElementById('hud')?.style.setProperty('display', 'none');
    document.getElementById('touch')?.style.setProperty('pointer-events', 'none');
    this.renderer.shadowMap.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the cue list
  buildCues() {
    const c = this.cues, at = (t, name, fn) => c.push({ t, name, fn });
    const st = this.stage, A = st.actors, K = TOUR.cues, P = TOUR.phrases;
    // subtitles follow the phrases of the recording
    for (const p of P) { at(p.t0, 'sub:' + p.id, () => this.setSub(p.text)); at(p.t1 + 0.25, 'subOff:' + p.id, () => { if (this.sub === p.text) this.setSub(''); }); }
    // 1. "Welcome ... extraordinary."  Reception: the desk, the waiting area, clear routes in
    at(0.0, 'music', () => this.music());
    // outside: the building front, a slow push in; the sliding doors part; through them into the reception
    at(0.0, 'exterior', () => { this.outside(true); this.camTo(EXT_A, 0.01); this.camTo(EXT_B, EXT_END - 0.05); });
    at(3.3, 'doors', () => this.tween(1.3, (k) => this.stage.setEntranceOpen(ease(k))));
    at(EXT_END - 0.25, 'dip-in', () => this.dip(0.22, 0.3));
    at(EXT_END, 'inside', () => { this.outside(false); this.camTo(IN_A, 0.01); this.camTo(IN_B, 11.6 - EXT_END); });
    at(EXT_END + 0.4, 'title', () => this.ui.title('Yola’s Medical Center', 'Starter clinic'));
    at(10.6, 'title-off', () => this.ui.title(''));
    // 2. "Turn empty rooms into places of possibility."  an empty room, then quick placements of its furniture
    at(K.furnishCut, 'dip-furnish', () => this.dip(0.22, 0.26));
    at(K.furnishCut + 0.24, 'room-empty', () => { this.showRoom('empty'); this.camTo(S(4.50, 0.8, 2.45, 50, 30, 8.8), 0.01); });
    at(K.furnishCut + 0.5, 'room-push', () => this.camTo(S(4.80, 0.8, 2.35, 49, 30, 8), 3.4));
    for (let i = 0; i < 9; i++) at(K.furnishFrom + i * K.furnishStep, 'pop' + i, () => { for (const h of st.furnishGroups()[i] || []) st.popIn(h); });
    // 3. staff at their stations -> a receptionist greeting someone -> Yola seated opposite a patient (previews)
    at(K.teamCut, 'dip-team', () => this.dip(0.2, 0.22));
    at(K.teamCut + 0.2, 'team', () => { this.showRoom('team'); this.camTo(S(4.6, 1.0, 2.3, 42, 26, 6.4), 0.01); this.camTo(S(4.7, 1.0, 2.3, 42, 26, 6.0), 2.2); });
    at(K.receptionCut, 'dip-greet', () => this.dip(0.2, 0.22));
    at(K.receptionCut + 0.2, 'greet', () => { this.showRoom('greet'); this.camTo(S(-5.4, 0.9, -3.2, 46, 26, 5.6), 0.01); });
    at(K.seatedCut, 'dip-seated', () => this.dip(0.15, 0.2));
    at(K.seatedCut + 0.18, 'seated', () => { this.showRoom('seated'); this.camTo(OFFICE_SHOT, 0.01); });
    // 4. chart and decision-card previews, then the equipment
    at(K.chartCut, 'dip-chart', () => this.dip(0.2, 0.25));
    at(K.chartCut + 0.2, 'chart-room', () => { this.showRoom('room'); this.camTo(S(4.60, 0.8, 2.40, 46, 30, 7.6), 0.01); this.camTo(S(4.70, 0.8, 2.40, 46, 30, 7.2), 5.0); });
    at(K.chartOn, 'chart-on', () => this.ui.preview('chart'));
    at(K.chartOff, 'chart-off', () => this.ui.preview(null));
    at(K.decisionOn, 'card-on', () => this.ui.preview('card'));
    at(K.decisionOff, 'card-off', () => this.ui.preview(null));
    at(K.equipmentCut, 'equipment', () => this.camTo(S(4.2, 1.0, 1.4, 34, 24, 5.0), 1.5));
    // 5. the camera holds steady; the equipment changes to the middle tier, then the advanced tier (restrained chimes in the pauses)
    at(K.holdCut, 'hold', () => { this.camTo(S(4.80, 0.8, 2.35, 49, 30, 7.8), 1.3); this.ui.chip(UPGRADE_PREVIEW.heading); });
    at(K.midTier, 'tier-mid', () => { st.setTier('standard', 0.9); this.chime(0); this.tierLabel(UPGRADE_PREVIEW.tiers[0].label, UPGRADE_PREVIEW.tiers[0].name); });
    at(K.advTier, 'tier-adv', () => { st.setTier('advanced', 0.9); this.chime(1); this.tierLabel(UPGRADE_PREVIEW.tiers[1].label, UPGRADE_PREVIEW.tiers[1].name); });
    // 6. original Yola, her awkward wave on the final phrase; the starter hospital is restored behind the cut
    at(K.restoreCut, 'dip-yola', () => this.dip(0.2, 0.22));
    at(K.restoreCut + 0.22, 'yola', () => { this.restoreStarter(); this.showRoom('yola'); this.camTo(S(5.0, 1.2, 3.7, 30, 16, 3.0), 0.01); this.camTo(S(5.0, 1.22, 3.7, 30, 16, 2.7), 6.0); });
    at(K.waveStart, 'wave', () => A.yola.startWave(2.2));
    at(K.waveStart + 2.3, 'wave-end', () => { A.yola.waveT = -1; A.yola.play('idle', { fade: 0.2 }); });
    // 7. the doors are open: the adult baseball player with his security guard, standing inside the entrance
    at(K.arrivalCut, 'dip-arrival', () => this.dip(0.2, 0.3));
    at(K.arrivalCut + 0.25, 'arrival', () => { this.showRoom('arrival'); this.camTo(S(-6.6, 0.6, 0.9, 52, 30, 7.4), 0.01); });
    at(K.objective - 0.4, 'push', () => this.camTo(S(-6.5, 0.7, 0.85, 50, 30, 6.4), 3.6));
    at(K.objective, 'objective', () => this.ui.objective(OBJECTIVES.chart));
    // 8. "Let's get to work."  settle into the simulation camera and hand off to check-in
    at(K.settle, 'settle', () => this.camTo(S(-6.0, 0.5, 0.0, 52, 30, 9.4), 1.2));
    at(K.handoff, 'act2', () => { this.mode = 'co'; this.co = this.act2(); });
    c.sort((a, b) => a.t - b.t);
  }

  outside(v) {
    const st = this.stage; if (st.exterior) st.exterior.visible = v;
    if (st.byName.door) st.byName.door.visible = !v; // the reception's own entrance frame would stand right behind the glass doors
    if (v) st.setEntranceOpen?.(0);
    this.scene.background = v && st.skyTex ? st.skyTex : new THREE.Color(0xcfe3df);
    this.renderer.shadowMap.needsUpdate = true;
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
    st.clearPops(); st.setRoomEmpty(false); this.ui.preview(null); this.ui.letter(false);
    for (const a of Object.values(A)) { a.frozen = false; if (a.lying) a.unlie(); if (a.root.parent !== st.root) st.toClinic(a); a.adj = {}; a.stop(); a.timeScale = 1; a.setVisible(false); a.seated = false; }
    if (A.baseball.capSkin) A.baseball.capSkin.visible = true;
    { const gp = A.security.model.getObjectByName('Security_Pistol'); if (gp) gp.visible = true; } if (this.guardPool) this.guardPool.visible = false;
    A.baseball.setOutfit(null); this.restoreGreen?.(); if (this.screens) this.screens.flat = false;
    this.ui.showEcg(false); this.ui.setVignette(0); this.ui.status(''); this.ui.urgency(null);
    this.animScale = 1; this.finalized = false; this.room1Preview = false; this.stillYola = false; this.poseAnim = null; this.restoreLook();
    // the receptionist sits at the desk (seat contract: the rig stands 0.45 m in front of the chair)
    A.staff.setVisible(true); A.staff.sitAt(-5.2, -5.5, 0, { instant: true });
    A.yola.waveT = -1; A.yola.waveRate = 1; A.yola.pose = null;
    { const yt = st.anchors.yolaTour; A.yola.place(yt.x, yt.z, yt.yaw); } A.yola.play('idle', { fade: 0 });
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
    this.camAnim = null;
  }

  showRoom(which) {
    const st = this.stage, A = st.actors, an = st.anchors, hideAll = () => { for (const a of Object.values(A)) a.setVisible(false); };
    const stations = () => { // staff at their stations in the treatment room
      A.teamA.setVisible(true); A.teamA.place(2.3, 2.85, 2.39); A.teamA.play('Work', { fade: 0 }) || A.teamA.play('Idle', { fade: 0 });
      A.teamB.setVisible(true); A.teamB.place(5.55, 2.95, 2.5); A.teamB.play('Work', { fade: 0 }) || A.teamB.play('Idle', { fade: 0 });
    };
    this.renderer.shadowMap.needsUpdate = true;
    if (which === 'empty') { hideAll(); st.setRoomEmpty(true); }
    if (which === 'team') { hideAll(); st.setRoomEmpty(false); stations(); }
    if (which === 'greet') { // a receptionist greeting someone (a preview, not the first patient)
      hideAll(); const rc = A.staff, w = A.waiting1;
      rc.setVisible(true); rc.seat = null; rc.sitState = 'stand'; rc.seated = false; rc.place(-5.2, -5.4, 0); rc.play('Talk', { fade: 0 });
      w.setVisible(true); w.place(-7.4, 0.9, Math.PI / 2); w.play('Idle', { fade: 0 }); w.walk([[-6.4, 0.9], [-5.6, -1.2], [-5.6, -3.6]], { endYaw: Math.PI });
    }
    if (which === 'seated') { // Yola seated opposite a patient (preview)
      hideAll(); const yo = A.yola, pt = A.waiting2, c1 = an.chairYola, c2 = an.chairPatient;
      yo.setVisible(true); yo.place(c1.x, c1.z, c1.yaw); yo.sitW = 1; yo.sitTarget = 1; yo.pose = 'sit'; yo.seated = true; yo.sitState = 'seated'; yo.sitSeatTop = c1.seatTop; yo.play('chart', { fade: 0 });
      yo.model.position.y = yo.baseY - (yo.pelvisY0 - (c1.seatTop + 0.04));
      pt.setVisible(true); pt.sitAt(c2.x, c2.z, c2.yaw, { instant: true, seatTop: c2.seatTop });
    }
    if (which === 'room') { hideAll(); st.setRoomEmpty(false); stations(); }
    if (which === 'yola') { hideAll(); A.yola.setVisible(true); A.yola.place(an.yolaTour.x, an.yolaTour.z, an.yolaTour.yaw); A.yola.play('idle', { fade: 0 }); }
    if (which === 'arrival') { hideAll(); A.staff.setVisible(true); A.baseball.setVisible(true); A.security.setVisible(true); }
  }
  // the starter hospital state, exactly as play begins: equipment at starter tier, furnished, preview people gone,
  // the receptionist seated at her desk
  restoreStarter() {
    const st = this.stage, A = st.actors;
    st.setTier('starter', 0.01); st.tickTiers(1); st.setRoomEmpty(false);
    this.tierLabel(null); this.ui.chip(''); this.ui.preview(null);
    for (const k of ['teamA', 'teamB', 'waiting1', 'waiting2']) { A[k].stop(); A[k].setVisible(false); }
    const yo = A.yola; yo.sitW = 0; yo.sitTarget = 0; yo.sitState = 'stand'; yo.seat = null; yo.pose = null; yo.model.position.y = yo.baseY; yo.seated = false;
    const rc = A.staff; rc.stop(); rc.sitAt(-5.2, -5.5, 0, { instant: true }); rc.play('SeatedIdle', { fade: 0 });
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
    let dist = r.dist ?? clamp(r.width / (2 * Math.tan(hf / 2)), 2.5, 80); // metres of floor across the screen at the target
    if (r.fitH && r.dist == null) dist = Math.max(dist, r.fitH / (2 * Math.tan(THREE.MathUtils.degToRad(r.fov) / 2))); // and at least this much height (wide screens)
    c.position.set(r.x - fx * Math.cos(p) * dist, r.y + Math.sin(p) * dist, r.z - fz * Math.cos(p) * dist);
    c.lookAt(r.x, r.y, r.z);
  }

  // ------------------------------------------------------------------ helpers (audio is skipped in seek mode)
  setSub(text) { this.sub = text; this.ui.subtitle(text); }
  voice(text, secs) { if (!this.silent) this.sound.say(text, secs); }
  music() { if (!this.silent) this.sound.startMusic(0.26); } // quiet, underneath the narration
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
  camTo(shot, secs = 1.2, follow = null) {
    if (secs <= 0.02) { this.rig = { ...shot }; this.camAnim = null; return; } // a cut: the rig jumps, so a glide queued right after starts from here
    this.camAnim = { from: { ...this.rig }, to: { ...shot }, t: 0, dur: Math.max(0.001, secs), follow }; }
  tickCamera(d) {
    const a = this.camAnim; if (!a) return;
    a.t += d; const u = ease(a.t / a.dur), o = {};
    for (const k of Object.keys(a.to)) o[k] = lerp(a.from[k] ?? a.to[k], a.to[k], u);
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
  // the patient-belongings spot in the Supply Hall: the stowed bat and the cap, together (it stays for gameplay)
  ensureLights() {
    if (!this.spot) { this.spot = new THREE.SpotLight(0xfff0dc, 0, 14, 0.5, 0.75, 1.1); this.spot.position.set(ROOM1.player.x + 1.4, 4.0, ROOM1.player.z + 1.8); this.spot.target.position.set(ROOM1.player.x, 1.0, ROOM1.player.z); this.scene.add(this.spot, this.spot.target); }
    if (!this.redLight) { this.redLight = new THREE.PointLight(0xff2a2a, 0, 14, 1.5); this.redLight.position.set(0, 3.0, -7.0); this.scene.add(this.redLight); }
    if (!this.lightBase) this.lightBase = { hemi: this.arena.hemi?.intensity ?? 0.85, sun: this.arena.sun?.intensity ?? 1.45, env: this.scene.environmentIntensity ?? 0.32 };
  }
  ensureBelongings() {
    const st = this.stage;
    if (!this.belongings) {
      const g = new THREE.Group(); g.name = 'belongings';
      st.batStatic.visible = true; st.batStatic.parent?.remove(st.batStatic);
      const bat = st.batStatic; bat.rotation.set(0, 0.12, -Math.PI / 2); bat.position.set(BELONG.x - 0.42, 0.86, BELONG.z - 0.22); g.add(bat); // resting on the table top
      if (st.cap) { st.cap.visible = true; st.cap.position.set(BELONG.x + 0.3, 0.84, BELONG.z + 0.2); st.cap.rotation.y = 0.6; g.add(st.cap); }
      this.scene.add(g); this.belongings = g;
    }
  }
  enterOR() {
    const st = this.stage, A = this.arena;
    st.setActive(false);
    this.setSun(0, -7.5);
    this.arena.cutWalls?.(0, -6.2, THREE.MathUtils.degToRad(35)); // the OR seen from the south-east, its near walls cut away
    this.scene.background = this.saved.bg || new THREE.Color(0x27323a);
    this.inOR = true;
    this.ensureBelongings();
    this.belongings.visible = true; st.batStatic.visible = true; if (st.cap) st.cap.visible = true;
    this.ensureLights();
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
    if (this.hallMat) this.hallMat.color.setRGB(0.66 * Math.min(1, k * 1.1), 0.74 * Math.min(1, k * 1.1), 0.75 * Math.min(1, k * 1.1));
    if (A.hemi) A.hemi.intensity = b.hemi * k; if (A.sun) A.sun.intensity = b.sun * k; this.scene.environmentIntensity = b.env * k;
  }
  restoreLook() {
    this.arena.setEmergency?.(false, 0);
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
    yield 1.3;
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
    // 4. assessment entry: the athlete leads through the staff corridor into the office, the guard follows him in;
    //    both take the visitor chairs opposite Yola (approached from the side, standing between chair and desk to sit)
    this.substate = 'ASSESSMENT_ENTRY';
    this.speak(DIALOGUE.takeChair, 3.0, 1.3);
    const cp = an.chairPatient, cg = an.chairGuard, od = an.officeDoor;
    bb.walk([[-3.4, -1.7], [-1.0, -1.0], [an.doorway.x, an.doorway.z], [1.75, -1.0], [od.x, od.z], [4.4, -1.5], [cp.x - 0.6, cp.z - 0.45], [cp.x, cp.z - 0.45]], { endYaw: Math.PI });
    this.camTo(S(-3.5, 0.7, -1.6, 46, 28, 8.0), 1.5, { actor: bb, dx: 0.8, dz: 0.5 });
    yield 1.4;
    sg.walk([[-4.2, -1.6], [-1.2, -1.1], [an.doorway.x, an.doorway.z], [1.75, -0.95], [od.x, od.z + 0.1], [4.6, -1.2], [7.55, -1.4], [7.55, cg.z - 0.45], [cg.x, cg.z - 0.45]], { endYaw: Math.PI });
    yield () => bb.x > 1.2; // into the corridor: cut inside the office as he arrives
    this.dip(0.25, 0.3); yield 0.28;
    this.camTo(OFFICE_SHOT, 0.01);
    this.mark('guard-at-door');
    yield this.arrived(bb);
    this.mark('athlete-at-chair-anchor');
    // 5. seat, then ask: turn to face Yola, align, SitDown, SeatedIdle
    this.state = 'SEATED_ASSESSMENT'; this.substate = 'SEATING';
    bb.sitAt(cp.x, cp.z, cp.yaw, { seatTop: cp.seatTop });
    yield this.arrived(sg);
    sg.sitAt(cg.x, cg.z, cg.yaw, { seatTop: cg.seatTop });
    yield this.seated(bb); yield this.seated(sg);
    yield 0.9; this.mark('both-seated');
    this.speak(DIALOGUE.review, 3.0, 1.4);
    yield 3.4;
    // the first (development placeholder) card: only now, and it waits for the player indefinitely
    this.substate = 'CARD_OPEN';
    const card = CARDS[0];
    this.mark('card-open');
    const ans = yield* this.askCard(card);
    this.answers[card.id] = ans; this.mark('card-answered');
    // 6. departure: Yola stands and steps clear around the desk, the athlete stands, Yola leads, the athlete follows;
    //    the guard stays in the office
    this.substate = 'DEPARTURE';
    this.speak(DIALOGUE.toOR, 3.0, 1.4);
    yield 0.6;
    yo.riseUp(); yield this.upright(yo); yo.play('idle', { fade: 0.3 });
    yo.walk([[5.15, -3.95]]); yield this.arrived(yo);
    bb.standUp(); yield this.upright(bb);
    yo.walk([[4.4, -1.6], [od.x, od.z], [1.75, -1.0], [an.doorway.x, an.doorway.z], [-1.0, -1.5], [an.orDoor.x, an.orDoor.z + 0.4]], { endYaw: Math.PI });
    yield 1.3;
    bb.walk([[cp.x - 0.6, cp.z - 0.45], [4.4, -1.5], [od.x, od.z], [1.75, -0.9], [an.doorway.x, an.doorway.z], [-1.0, -0.9], [an.orDoor.x + 0.1, an.orDoor.z + 1.7]], { endYaw: Math.PI });
    yield () => yo.x < 0.6; // out of the corridor: cut back to reception as they come through
    this.dip(0.25, 0.3); yield 0.28;
    this.camTo(S(-1.4, 1.0, -3.6, 40, 30, 5.6), 0.01);
    yield this.arrived(yo, bb);
    yield 1.0;
    this.substate = 'OR_ENTRANCE_HOLD'; this.mark('or-entrance');
    yield* this.act3();
  }

  // ================================================================== ACT 3: OR choices, apparent success, impossible movement
  *act3() {
    const st = this.stage, A = st.actors, bb = A.baseball, op = A.surgeon, ta = A.teamA, tb = A.teamB;
    this.state = 'OR_CHOICES'; this.substate = 'ENTER';
    // 1. enter and prepare: Yola leads through the OR doorway; the athlete follows after she clears it
    this.speak(DIALOGUE.settle, 3.0, 1.4);
    this.dip(0.4, 0.4); yield 0.45;
    this.enterOR();
    for (const a of [op, bb, ta, tb]) a.setVisible(true);
    st.actorToWorld(ta, 0.6, -9.2, 0); ta.play('Idle', { fade: 0 }); // the team is already at the table
    st.actorToWorld(tb, 1.75, -8.2, -Math.PI / 2); tb.play('Idle', { fade: 0 });
    st.actorToWorld(op, -8.1, -4.75, Math.PI / 2); st.actorToWorld(bb, -9.3, -4.35, Math.PI / 2); bb.play('Idle', { fade: 0 }); op.play('Walk_InPlace', { fade: 0 }); // they come in from the Supply Hall door
    A.staff.setVisible(false); A.security.setVisible(false);
    this.camTo(W(0, 0.9, -6.4, 50, 35, 8.0), 0.01);
    op.walk([[-6.2, -4.75], [-3.4, -6.4], [-1.4, -8.2]], { endYaw: Math.PI / 2 });
    this.mark('or-enter');
    yield 1.5;
    bb.walk([[-6.2, -4.4], [-2.6, -5.5], [0.0, -6.4], [0.0, -7.35]], { endYaw: Math.PI });
    yield this.arrived(op, bb);
    this.mark('or-standing');
    yield 0.6;
    // the athlete is moved onto the table behind a cut to the anesthesia equipment (three seconds); the cap comes off
    this.dip(0.35, 0.35); yield 0.4;
    this.camTo(W(-2.0, 1.15, -7.9, 28, 30, 3.6), 0.01);
    if (bb.capSkin) bb.capSkin.visible = false;
    if (bb.bat) bb.bat.visible = false;
    bb.setOutfit(PATIENT_OUTFIT); // plain white patient clothing (no lettering, team colour or cap): the later white-clothed zombie is the same man
    bb.play('Idle', { fade: 0 }); bb.lie(0.9, 1.07, -8.2, Math.PI / 2); // supine, head to the west end (the anesthesia side), arms at his sides
    op.place(-1.3, -8.2, Math.PI / 2); op.play('Idle', { fade: 0 });
    yield 3.0;
    // continuity insert: the belongings spot in the Supply Hall (the bat and the cap together)
    this.dip(0.3, 0.3); yield 0.35;
    this.camTo(W(BELONG.x, 0.8, BELONG.z + 0.1, 56, 30, 3.0), 0.01);
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
    this.camTo(W(-1.9, 1.0, -7.9, 38, 35, 5.4), 1.6);
    yield 1.8;
    this.camTo(W(-1.0, 0.9, -8.3, 50, 33, 5.8), 1.2);
    yield 1.4;
    this.ui.tag('equip', 'Check the equipment', 'Anesthesia workstation'); this.pointAt('equip', -2.25, 1.8, -7.75);
    this.mark('or-card-1');
    const a1 = yield* this.askCard(CARDS[1]);
    this.answers[CARDS[1].id] = a1; this.ui.tag('equip', null);
    if (!this.silent) this.sound.chime(0);
    yield 0.6;
    // 3. second OR choice and apparent success
    this.substate = 'CHOICE_2';
    this.speak(DIALOGUE.monitor, 3.0, 1.4);
    this.camTo(W(-0.4, 0.95, -9.3, 46, 35, 5.8), 1.6);
    yield 1.8;
    this.ui.tag('monitor', 'Check the monitor', 'Patient monitor'); this.pointAt('monitor', -0.7, 1.9, -10.0);
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
    op.walk([[-1.5, -8.6], [-1.45, -7.9]], { endYaw: -Math.PI / 2 }); // she steps from the patient's head to the workstation beside it; the team stays
    let u = 1; this.urgencyTimer = 6; // a cosmetic bar only: nothing is lost when it empties
    yield 3.4;
    // 5. flatline, motion, and the call
    this.state = 'FLATLINE_MOVEMENT'; this.substate = 'FLATLINE';
    this.camTo(W(0.45, 1.0, -8.3, 48, 35, 3.9), 2.2); // eases toward the patient and the team; Yola's workstation drops out of the frame
    this.ecg = { t: 0, flat: true }; this.ui.showEcg(true); if (this.screens) this.screens.flat = true; // the room's monitors flatline too
    if (!this.silent) { this.sound.alarmOff(); this.sound.flatlineOn(); }
    this.ui.status('No heartbeat', true); this.ui.urgency(null);
    this.mark('flatline');
    yield 2.0;
    // it starts small: the fingers of one hand twitch and his head rolls toward the room
    this.substate = 'MOTION';
    bb.adjust('head', 'head', 0, 0.55, 0, 0); bb.adjust('hand', 'forearmR', 0, 0, -0.5, 0);
    this.tween(0.9, (k) => { bb.adj.hand.w = Math.sin(k * Math.PI * 3) * 0.6 + ease(k) * 0.4; });
    this.later(0.7, () => this.tween(1.1, (k) => { bb.adj.head.w = ease(k); }));
    this.mark('motion');
    yield 1.6;
    // then he sits up - slowly, stiffly, from the hips - and his skin drains to a grey green. Everyone turns to him.
    this.substate = 'SIT_UP';
    this.sitUp(bb, 2.4); this.greenTo(bb, 3.2);
    const lookAt = (a) => a.turnTo(Math.atan2(-0.15 - a.x, -8.2 - a.z)); // (his chest, once he is up)
    for (const a of [ta, tb, op]) lookAt(a);
    this.speak(DIALOGUE.stillMoving, 2.6, 1.0);
    this.recoil(tb, -0.28, 0.4); this.later(0.6, () => this.recoil(op, -0.3, 0.5));
    this.mark('sit-up');
    yield 2.8;
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
  // the patient sits up on the table: the spine hinges up from the hips (his legs stay flat on the table)
  sitUp(a, secs) {
    a.adjust('sitS', 'spine', 0.95, 0, 0, 0); a.adjust('sitC', 'chest', 0.45, 0, 0, 0); a.adjust('sitN', 'neck', 0.2, 0, 0, 0); // (+x bends him up off the table: checked in a render)
    this.tween(secs, (k) => { const e = ease(k) * (1 - 0.06 * Math.sin(k * Math.PI * 5) * (1 - k)); for (const n of ['sitS', 'sitC', 'sitN']) a.adj[n].w = e; });
  }
  // his skin drains to a grey green (the material is cloned once; restoreGreen puts the original back)
  greenTo(a, secs) {
    const skins = []; a.model.traverse((o) => { if (!o.isMesh) return; const ms = [].concat(o.material); ms.forEach((m, i) => { if (/^Skin_/.test(m.name)) { const n = m.clone(); n.userData.orig = m; skins.push({ o, i, n, c0: m.color.clone() }); if (Array.isArray(o.material)) o.material[i] = n; else o.material = n; } }); });
    this.greened = skins; const green = new THREE.Color(0x8fa77c);
    this.tween(secs, (k) => { for (const s of skins) s.n.color.copy(s.c0).lerp(green, ease(k)); });
  }
  restoreGreen() { for (const s of this.greened || []) { if (Array.isArray(s.o.material)) s.o.material[s.i] = s.n.userData.orig; else s.o.material = s.n.userData.orig; } this.greened = null; }
  recoil(a, dist, secs) {
    const dx = -Math.sin(a.yaw) * dist, dz = -Math.cos(a.yaw) * dist, x0 = a.root.position.x, z0 = a.root.position.z;
    this.tween(secs, (k) => { const e = ease(k); a.root.position.x = x0 + dx * e; a.root.position.z = z0 + dz * e; });
  }

  // ================================================================== ACT 4: the same-position reveal, the smooth wave, unarmed play
  *act4() {
    const st = this.stage, A = st.actors, yo = A.yola, an = ROOM1.player, Y = this.yola, g = this.game();
    const slow = (k) => { this.animScale = 1 - 0.65 * ease(k); };
    // 1. the call: cut to the doorway frame (the concept's framing: full-length, low and front-on, in a doorway under a
    //    red emergency lamp). Original Yola already stands at the anchor, perfectly still; the operating-room overlays
    //    (the heart trace, the status, the urgency bar) are gone so nothing covers either Yola.
    this.state = 'GET_YOLA_SLOW'; this.substate = 'CALL';
    this.ecg = null; this.ui.showEcg(false); this.ui.status(''); this.ui.urgency(null); this.urgencyTimer = 0; this.ui.subtitle(''); this.sub = ''; this.ui.objective(''); this.ui.chip('');
    this.setAlarm(0); this.animScale = 1;
    if (!this.silent) { this.sound.alarmOff(); this.sound.flatlineOff(0.3); this.sound.revealCue(); }
    for (const a of [A.baseball, A.teamA, A.teamB, A.surgeon]) a.setVisible(false);
    const fy = an.yaw, fx = Math.sin(fy), fz = Math.cos(fy); // her facing at the anchor; the camera stands in front of it
    this.ensureDoorway(an, fy); this.doorway.visible = true; this.orTable(false); // (the operating table would stand between the camera and her)
    st.actorToWorld(yo, an.x, an.z, fy); yo.frozen = false; yo.setVisible(true); yo.waveT = -1; yo.play('idle', { fade: 0 }); yo.update(0.02); yo.frozen = true; // one pose, held
    this.camTo(this.frontShot(an, 3.1, 4, fy), 0.01);
    this.redLight.position.set(an.x - fx * 0.9, 2.9, an.z - fz * 0.9); this.setLamp(0.8);
    this.spot.intensity = 26; this.setLight(0.82); this.redLight.intensity = 2.5; // bright and neutral; only the lamp above the door is red
    this.mark('call-settled');
    // 2. original Yola in the light, then the light fails like a dying tube. It stutters, and in the stutter the figure
    //    in the doorway is not always the same one: a dark beat shows a shape in the red that is not quite her, a lit
    //    flash shows her again, a single bright frame shows someone else... then the light dies, and comes back on the
    //    new Yola. Both stand at the same world anchor, posed and still; each flicker shows one or the other.
    this.state = 'MODEL_REVEAL'; this.substate = 'HOLD_OLD';
    yield 1.5; // original Yola, clearly, for one beat
    Y.reset(an.x, an.z, an.yaw); Y.setShown(true);
    if (Y.up) { Y.up.pistol = Y.up.shotgun = Y.up.axe = 0; Y.up.fists = 1; } // she is unarmed from the first frame (no weapon swap on screen)
    for (let i = 0; i < 4; i++) this.game().stillYola(0.016); // settle one standing pose, then hold it (no idle motion)
    this.stillYola = false; Y.setShown(false);
    const showNew = (v) => { yo.setVisible(!v); Y.setShown(v); };
    // k: the room light (0 = only the red lamp over the door glows)
    const lit = (k) => { this.spot.intensity = 26 * k; this.setLight(0.03 + 0.79 * k); this.redLight.intensity = (this.reducedFlash ? 0.5 : 1) * (k > 0 ? 2.5 : 1.5); this.setLamp(k > 0 ? 0.8 : 0.5); }; // (dark: only a dim red, so the figure is hard to make out)
    this.substate = 'FLICKER';
    this.redLight.position.set(an.x - fx * 0.6, 2.8, an.z - fz * 0.6);
    const seq = this.reducedFlash || this.silent
      ? [[0.5, 0.35, 'old'], [0.6, 0, 'old'], [0.5, 0, 'new']] // reduced flash: one slow dip, no strobing
      : [[0.08, 0, 'old'], [0.07, 1, 'old'], [0.15, 0, 'old'], [0.05, 0.75, 'old'],
        [0.24, 0, 'new'], // dark: a shape in the red that is not quite her
        [0.07, 0.95, 'old'], // lit: it is her... isn't it
        [0.13, 0, 'old'], [0.045, 1, 'new'], // one bright frame of someone else
        [0.11, 0, 'new'], [0.05, 0.55, 'old'],
        [0.8, 0, 'new']]; // the light dies: only the red lamp
    let was = 1;
    for (const [sec, k, who] of seq) {
      showNew(who === 'new'); lit(k);
      if (!this.silent && (k > 0) !== (was > 0)) this.sound.flicker?.(k > 0);
      was = k; yield sec;
    }
    this.mark('swapped');
    // 3. the light catches and stays on: the new Yola, clearly, in the doorway
    this.substate = 'IMPROVED_REVEAL';
    if (!this.silent) this.sound.flicker?.(true);
    lit(0.7); yield 0.05; lit(0.15); yield 0.06;
    this.tween(0.45, (k) => { const e = ease(k); this.spot.intensity = 24 * e; this.setLight(0.12 + 0.72 * e); this.redLight.intensity = 1.5 * (1 - e) + 1.2 * e; this.setLamp(0.55 - 0.15 * e); });
    this.substate = 'SETTLE';
    yield 0.8; this.mark('reveal-settled');
    // 3. the boss card: a freeze frame, a hard punch-in on her face and torso, the name slammed across the screen
    this.state = 'BOSS_CARD'; this.substate = 'FREEZE';
    this.camTo({ ...this.frontShot(an, 1.45, 2, fy), y: 1.2 }, 0.22);
    if (!this.silent) { this.ui.bossCard(BOSS_CARD.name, BOSS_CARD.tagline, this.reducedFlash); this.sound.bossSting(); }
    yield 2.6; this.mark('boss-card');
    if (!this.silent) this.ui.bossOff();
    this.camTo(this.frontShot(an, 3.1, 5, fy), 0.5);
    yield 0.6; this.mark('wave-done');
    // 4. return to the actual game: the combat framing, the room readable again, the zombies present once the camera widens
    this.state = 'COMBAT_READY'; this.substate = 'RETURN';
    this.ui.subtitle(''); this.sub = '';
    const from = { pos: null };
    this.setCamera(); const fromPos = this.camera.position.clone(), fromQuat = this.camera.quaternion.clone(), fromFov = this.camera.fov;
    const pose = g.cameraPose(an.x, an.z, an.yaw); // (sets the camera to the game's own pose and field of view)
    this.camera.position.copy(fromPos); this.camera.quaternion.copy(fromQuat); this.camera.fov = fromFov; this.camera.updateProjectionMatrix();
    this.poseAnim = { from: { pos: fromPos, quat: fromQuat, fov: fromFov }, to: pose, t: 0, dur: 2.2 };
    this.tween(2.0, (k) => this.setLight(0.85 + 0.15 * ease(k)));
    if (!this.silent) { this.sound.setMusicLevel(0, 0.2); this.sound.combatAmbience(); }
    yield 1.1;
    this.revealZombies(); // concealed until the camera is widening; no spawn effects
    yield 1.2;
    this.finalize('normal');
  }

  // a front-on, low shot of a world anchor (the camera stands where the anchor's character faces)
  frontShot(an, dist, pitch = 4, yaw = an.yaw) { return { ...W(an.x, 0.88, an.z, pitch, THREE.MathUtils.radToDeg(yaw), 3, 44), dist }; }
  // the reveal doorway: frame, two open door leaves, a dark corridor and the red emergency lamp, built once behind the anchor
  ensureDoorway(an, fy = an.yaw) {
    if (this.doorway) return;
    const g = new THREE.Group(); g.name = 'doorway';
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    const box = (w, h, d, x, y, z, m, p = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };
    const trim = std(0x2f7b80), wall = std(0xe6e0d2), leaf = std(0xd9d2c2);
    box(0.12, 2.5, 0.24, -0.68, 1.25, 0, trim); box(0.12, 2.5, 0.24, 0.68, 1.25, 0, trim); box(1.48, 0.14, 0.24, 0, 2.5, 0, trim);
    box(2.6, 3.4, 0.2, -1.98, 1.7, -0.02, wall); box(2.6, 3.4, 0.2, 1.98, 1.7, -0.02, wall); box(1.4, 0.9, 0.2, 0, 3.0, -0.02, wall);
    this.hallMat = new THREE.MeshBasicMaterial({ color: 0xa9bcc0 });
    box(1.4, 2.45, 0.05, 0, 1.22, -0.5, this.hallMat); // the corridor beyond, lit (dims with the room light)
    box(1.4, 0.05, 0.6, 0, 0.0, -0.25, std(0x8d9a9c)); box(1.4, 0.04, 0.6, 0, 2.47, -0.25, new THREE.MeshBasicMaterial({ color: 0xdfe8e8 }));
    for (const sd of [-1, 1]) { // the leaves, swung open toward the camera
      const piv = new THREE.Group(); piv.position.set(sd * 0.62, 0, 0.12); piv.rotation.y = sd * -1.2; g.add(piv);
      box(0.64, 2.3, 0.07, -sd * 0.32, 1.15, 0, leaf, piv);
      box(0.1, 0.6, 0.06, -sd * 0.5, 1.55, 0.06, std(0x2f7b80), piv); // a handle plate
    }
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x300808 });
    box(0.56, 0.18, 0.14, 0, 2.78, 0.14, this.lampMat);
    g.position.set(an.x - Math.sin(fy) * 1.0, 0, an.z - Math.cos(fy) * 1.0); g.rotation.y = fy; g.visible = false;
    this.scene.add(g); this.doorway = g;
  }
  // the reveal doorway shows nothing but the doorway: the operating-room props near the anchor are hidden for the shot and restored after
  orTable(v) {
    if (!v) { const an = ROOM1.player; const actors = Object.values(this.stage.actors).map((a) => a.root); this.hiddenProps = (this.hiddenProps || []).concat(this.arena.group.children.filter((c) => c.isGroup && c.userData.prop && c.visible && !actors.includes(c) && c !== this.doorway && Math.hypot(c.position.x - an.x, c.position.z - an.z) < 6.0)); for (const c of this.hiddenProps) c.visible = false; }
    else { for (const c of this.hiddenProps || []) c.visible = true; this.hiddenProps = []; }
  }
  setLamp(k) { if (this.lampMat) this.lampMat.color.setRGB(0.2 + 0.8 * k, 0.03 + 0.06 * k, 0.03 + 0.06 * k); }
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
    if (this.finalized) return; this.finalized = true; if (this.screens) this.screens.flat = false;
    this.arena.setEmergency?.(true, via === 'normal' ? 1.6 : 0); // the floor after the outbreak: emergency lighting
    const st = this.stage, A = st.actors, g = this.game(), an = ROOM1.player;
    // story state off: overlays, audio, timers, tweens, listeners that belong to the story
    this.co = null; this.wait = null; this.timers.length = 0; this.tweens = []; this.fx = null; this.camAnim = null; this.poseAnim = null; this.tagPoints = null;
    this.sound.alarmOff(); this.sound.flatlineOff(0.2); this.sound.stopVoice();
    this.ecg = null; this.ui.showEcg(false); this.ui.setVignette(0); this.ui.status(''); this.ui.urgency(null); this.ui.subtitle(''); this.ui.clearTags(); this.ui.closeCard();
    this.ui.title(''); this.ui.chip(''); this.ui.objective(''); this.ui.reward(''); this.ui.setDark(0); this.ui.fade.style.opacity = 0; this.ui.letter(false); this.ui.bossOff();
    // the world: clinic away, combat lighting back, the cast gone (no duplicate humans), the guard waiting at reception
    st.setActive(false); this.inOR = true; // (the OR is the world now)
    const Bk = this.saved || {};
    this.scene.background = Bk.bg || new THREE.Color(0x27323a);
    if (this.arena.sun && Bk.sun) { this.arena.sun.position.copy(Bk.sun); this.arena.sun.target.position.copy(Bk.tgt); this.arena.sun.target.updateMatrixWorld(true); }
    this.renderer.shadowMap.needsUpdate = true;
    for (const l of this.arena.lights) l.visible = true;
    this.animScale = 1; this.setLight(1); this.lightK = 1; if (this.spot) this.spot.intensity = 0; if (this.redLight) this.redLight.intensity = 0;
    if (this.doorway) this.doorway.visible = false; this.orTable(true); this.setLamp(0); this.ui.fade.style.opacity = 0;
    this.setBlood(true);
    this.ensureBelongings(); this.belongings.visible = true; st.batStatic.visible = !this.batPicked; if (st.cap) st.cap.visible = true;
    for (const k of ['yola', 'baseball', 'teamA', 'teamB', 'surgeon', 'staff']) A[k].setVisible(false);
    this.placeGuardBody();
    // the game: the canonical snapshot
    g.applyRoom1(); g.previewRoom1(0);
    this.stillYola = false; this.room1Preview = false; this.active = false; this.state = 'ROOM1_PLAYABLE'; this.substate = via;
    this.ui.show(false); g.hudShow(true);
    try { localStorage.setItem('zc.introSeen', '1'); } catch { /* storage unavailable: the opening just plays next time */ }
    this.mark('room1-playable');
  }
  ambient() {} // (the level's people are still: the guard's body does not move)
  // the opening's guard, dead in the Waiting Area where the outbreak reached him: on his back by the reception seats, his
  // holster empty (the pistol lies beside him as the pickup), a dark pool under him. One body, never a living duplicate.
  placeGuardBody() {
    const sg = this.stage.actors.security;
    sg.frozen = false; sg.stop(); sg.seat = null; sg.seated = false; sg.sitState = 'stand';
    this.stage.actorToWorld(sg, 0, 0, 0); sg.setVisible(true); sg.play('Idle', { fade: 0 }); sg.update(0.02);
    sg.lie(-16.95, 0.13, -0.15, 1.95); sg.update(0.001); sg.frozen = true;
    for (const n of ['Security_Pistol']) { const o = sg.model.getObjectByName(n); if (o) o.visible = false; }
    if (!this.guardPool) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 6, 64, 64, 62);
      gr.addColorStop(0, 'rgba(70,6,8,.92)'); gr.addColorStop(0.55, 'rgba(92,10,12,.8)'); gr.addColorStop(1, 'rgba(92,10,12,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 62, 46, 0.4, 0, Math.PI * 2); g.fill();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(-16.35, 0.012, -0.45); m.renderOrder = 1; this.scene.add(m); this.guardPool = m;
    }
    this.guardPool.visible = true;
  }
  restoreBat() { this.batPicked = false; if (this.stage.batStatic) this.stage.batStatic.visible = true; }
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
    // returning players are never forced through the opening: once seen, the title screen offers to skip it
    let seen = false; try { seen = localStorage.getItem('zc.introSeen') === '1'; } catch { /* storage unavailable */ }
    this.ui.skipGateB.hidden = !seen;
    this.ui.skipGateB.onclick = () => { this.ui.gate.classList.remove('show'); this.sound.unlock(); this.started = true; this.beginSilent(); this.finalize('returning'); };
    // a Floor 3 checkpoint from an earlier session: continue straight from it
    const save = this.game?.().levelSave;
    this.ui.contB.hidden = !save;
    this.ui.contB.onclick = () => { this.ui.gate.classList.remove('show'); this.sound.unlock(); this.started = true; this.beginSilent(); this.finalize('continue'); this.game().applyLevel(save); };
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
    this.narrPlaying = this.sound.playNarration(); // false without audio permission: the subtitles run on the timestamps instead
    if (!this.narrPlaying) this.joinAudioLate();
  }
  // the audio context can come up a moment after the tap (iPhone resumes asynchronously): when it does, the
  // narration and music join the tour where the story clock is, instead of staying silent
  joinAudioLate() {
    const ctx = this.audio.ctx; if (!ctx) return;
    const tryJoin = () => {
      if (ctx.state !== 'running' || !this.started || this.mode !== 'cues' || this.silent) return;
      if (!this.sound.narr?.playing && this.t < TOUR.duration - 0.3) this.narrPlaying = this.sound.playNarration(this.t);
      if (!this.sound.musicOn && this.t > 0) this.music();
    };
    ctx.addEventListener?.('statechange', tryJoin);
    ctx.resume?.().then(tryJoin).catch(() => {});
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
    if (!this.active) return; // the hand-off happened inside step(): the game camera owns the view now
    if (!this.poseAnim) this.setCamera();
  }
  step(dt) {
    const da = dt * this.animScale; // animations (and the preview) run on the slowed clock; the story clock and light tweens do not
    if (this.frozen) { this.stage.update(da); this.tickCamera(dt); this.tickFx(dt); this.tagsFollow(); return; }
    const d = dt * this.timeScale;
    this.t += d;
    this.tickTimers(d);
    if (this.mode === 'cues') {
      const np = this.silent ? null : this.sound.narrationPos(); // the recording is the clock while it plays
      if (np !== null) this.t = Math.max(this.t - d, np);
      while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t <= this.t) this.fire(this.cues[this.cueIdx++]);
    } else this.runCo(d);
    this.stage.update(da);
    if (this.stillYola) this.game().stillYola?.(da);
    if (this.stage.tiers.some((s) => s.fx) || this.stage.pops.length) this.renderer.shadowMap.needsUpdate = true; // equipment fades and placements change the shadows
    if (this.poseAnim) this.tickPose(d); else this.tickCamera(d);
    this.tickFx(d); this.tickAlarm(d); this.tickEcg(d); this.tickTweens(d);
    if (this.urgencyTimer > 0) { this.urgencyTimer -= d; this.ui.urgency(Math.max(0, this.urgencyTimer / 6)); }
    this.tagsFollow();
  }
  tagsFollow() {
    if (this.tagPoints) for (const id in this.tagPoints) { const t = this.ui.tags.get(id); if (t && t.classList.contains('show')) { const p = this.tagPoints[id].clone().project(this.camera); this.ui.placeTag(id, (p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight); } }
    const t = this.ui.tags.get('tier');
    if (t && t.classList.contains('show')) {
      const p = L(5.0, 2.35, 1.4).project(this.camera);
      this.ui.placeTag('tier', (p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight);
    }
  }
  // test hook: the checkpoint report
  report() { return { state: this.state, substate: this.substate, t: +this.t.toFixed(2), tier: this.stage.tier, sub: this.sub, cues: this.cueLog.slice(-8) }; }
}
