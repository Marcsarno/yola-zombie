// Opening director: the cheerful hospital-management tour (Prompt 1), driven by one clock and a cue list so that
// play, seek (dev) and skip all reach the same state. Later prompts extend the state list; this file owns it.
//
// States: PRELOAD -> TOUR (the narrated tour, cue list) -> CHECK_IN -> SEATED_ASSESSMENT (lines 01-11, Card 1) ->
// the elevator to Floor 7 (12-16) -> FLOOR_7 (preparation, Card 2, the procedure, Card 3, recovery to 0.96, the
// handoff: 17-26; Yola walks the guard down to six) -> STABLE -> EMERGENCY (27-31) -> REVEAL (the 2026-10-16 Motion
// study's 13 beats: the lift returns 6 -> 7, the old toon silhouette becomes Yola 3.0 with the bat) -> COMBAT_READY ->
// ROOM1_PLAYABLE. After the tour, acts are coroutines that wait on dialogue completion, cards and arrivals.
import * as THREE from 'three';
import { ClinicStage, CLINIC, CLINIC_LIFT, liftDisplay } from './stage.js';
import { OpeningUI } from './ui.js';
import { OpeningAudio } from './opaudio.js';
import { TOUR, UPGRADE_PREVIEW, OBJECTIVES, LINE, LINES, SPEAKER, VOICE_DIR, CLINICAL_CARDS, READINESS, TIME_CARDS } from './content.js';
import { ROOM1 } from '../core/layout.js';
import { LIFTS } from '../core/chapter.js';
const LIFT7 = LIFTS[7]; // the OR's lift, on its back (north) wall: the reveal's doorway
import { Breakthrough } from './breakthrough.js';
import { ikArm } from '../render/ik.js';
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
const OFFICE_CLOSE = S(6.2, 0.9, -2.85, 22, 72, 3.2); // closer on the three of them for the bat talk
const OFFICE_GUARD = S(5.8, 0.9, -2.35, 24, 80, 3.8);
// the conversation's reverse angles (2026-10-16): over Yola's shoulder onto the patient, over the visitors onto Yola
// (from the east side of the desk: the sightlines clear every head)
const ON_PATIENT = { ...S(5.72, 0.95, -2.15, 14, 122, 3), dist: 2.6, fov: 38 }, ON_PATIENT_CLOSE = { ...S(5.72, 1.02, -2.15, 12, 126, 3), dist: 2.15, fov: 38 };
const ON_YOLA = { ...S(6.3, 0.98, -3.95, 13, 58, 3), dist: 2.8, fov: 38 }, ON_YOLA_CLOSE = { ...S(6.3, 1.02, -3.95, 11, 62, 3), dist: 2.25, fov: 38 }; // Yola turned to the guard (line 15): "he" is clear (from the east: the office's south wall would block a view from the south)
// the reveal: front-on to Yola's spot in the operating room (ROOM1.player), the table with the patient behind her. The
// old hospital's last frame is captured from exactly this camera, so the picture lines up with the room behind it.
const REVEAL_SHOT = { ...W(ROOM1.player.x, 1.02, ROOM1.player.z, 4, THREE.MathUtils.radToDeg(ROOM1.player.yaw), 3, 42), dist: 3.5 };
// the reveal swing: the game's bat finisher (BAT_ATTACKS[2], the spinning, rising strike), from its wind-up
// (sampled in the reveal camera: the bat sweeps low through the picture plane at 0.40-0.47 s, nearest the lens at 0.43 s;
// the spin and the ready pose follow; the strike frame is held a beat: the strongest frame)
const REVEAL_COMBO = 2, REVEAL_FROM = 0, REVEAL_RATE = 1, REVEAL_HIT = 0.44, REVEAL_END = 1.25, REVEAL_HOLD = 0.3, REVEAL_HOLD_RATE = 0.16;
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
    this.bt = new Breakthrough(this.renderer, this.scene, this.camera); this.lineLog = []; this.answers = {};
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
    this.narrLoaded = await this.sound.loadNarration(TOUR.audio); onProgress?.(0.85);
    this.voicesLoaded = await this.sound.loadVoices(LINES, VOICE_DIR, (n) => onProgress?.(0.85 + 0.1 * n / LINES.length)); onProgress?.(0.95);
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
    this.sound.stopLine(); this.line = null; this.lineLog.length = 0; this.cardDone = null;
    this.endRide(); this.stopEmptyChair(); if (this.leanedBat) this.leanedBat.visible = false; this.holdBat(null); this.cpr = null; this.revealSwing = null;
    this.revealPose = null; this.sweepT = null; if (this.rfx) { this.backlight(0); this.rfx.g.visible = false; this.rfx.smoke = this.rfx.smokeTarget = 0; } this.setOrLamp(true); this.talkers = null;
    this.silhouette(this.stage.actors.yola?.root, false); if (this.yola) { this.silhouette(this.yola.outer, false); this.silhouette(this.yola.batLib?.obj, false); }
    if (this.bt.state !== 'idle') this.bt.finish(); this.bt.state = 'idle';
    this.monitorOn = false; this.ui.showMonitor(false); this.ui.readiness(null); this.ui.timeCard(''); this.ui.monitor({ mode: 'normal', alarm: false, tof: null, bp: 'BP 118/74' });
    st.setLiftOpen(0); st.lift?.display.set('G'); this.setLift3(0); this.setLiftSign(true);
    if (st.wheelchair) { st.wheelchair.visible = false; if (st.wheelchair.parent !== st.root) st.root.add(st.wheelchair); }
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
    if (r.roll) c.rotateZ(r.roll); // (a slight unsettled tilt in the reveal)
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
    for (const k of Object.keys(a.to)) o[k] = lerp(a.from[k] ?? (k === 'roll' ? 0 : a.to[k]), a.to[k], u);
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

  setBlood(v) { for (const m of this.blood || []) m.visible = v; this.arena.setOutbreak?.(v); } // (with the blood: the floor's worn outbreak surfaces, render/arena.js)
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
    this.scene.background = new THREE.Color(0xcfe3df); // (the clean hospital's soft sky: the dark void belongs to the outbreak)
    this.arena.outPlane?.material.color.set(0xb9cdc9); // (and the ground beyond the walls)
    this.inOR = true; this.game?.().fxAim?.(false); // (the gameplay aim ring is not part of the story)
    this.ensureBelongings();
    this.belongings.visible = false;
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

  // ================================================================== the dialogue and the cards
  // A numbered line (content.js LINES, take B): the clip plays on the dialogue bus (the music ducks), the caption shows
  // if captions are on, and the scene moves on when the speech has actually played (the clip's playback position), plus a
  // deliberate pause. Without a playing clip (muted start before the gesture, a failed load, a silent seek) the line
  // runs its measured length on the story clock instead: the scene never waits on audio that will not come.
  *say(id, { pause = 0.32, alarm = false } = {}) {
    const L = LINE[id]; if (!L || L.omit) return;
    this.line = L; this.cueLog.push([+this.t.toFixed(2), 'line:' + id]);
    this.sub = L.text; this.ui.subtitle(L.text, { who: SPEAKER[L.who] || L.who, alarm });
    const playing = !this.silent && !this.storyClockLines && this.sound.playLine(L); // (storyClockLines: a test stepping frames faster than real time)
    const talker = this.talkers?.[L.who]; if (talker) this.gesture(talker, L.end);
    this.lineLog.push({ id, t: +this.t.toFixed(2), audio: playing });
    const t0 = this.t;
    yield () => { const pos = playing ? this.sound.linePos() : null; return pos !== null ? pos >= L.end : this.t - t0 >= L.end; };
    if (this.sub === L.text) { this.sub = ''; this.ui.subtitle(''); }
    this.line = null;
    if (pause > 0) yield pause;
  }
  // a clinical choice card: the scene holds (the coroutine waits) until the right answer is found and Continue tapped.
  // A silent run (seek / skip) answers it with the right choice.
  *card(key) {
    const C = CLINICAL_CARDS[key];
    this.mark('card:' + key);
    if (this.silent && this.runLabel !== 'card:' + key) { this.answers[key] = 1; return 1; }
    this.cardDone = null;
    this.ui.askCard(C).then((tries) => { this.cardDone = tries; });
    yield () => this.cardDone !== null;
    const tries = this.cardDone; this.cardDone = null; this.ui.closeCard();
    this.answers[key] = tries; this.mark('card-done:' + key);
    if (!this.silent) this.sound.confirm();
    return tries;
  }
  // a short time transition: a dip through dark with a caption that is always shown (it is staging, not dialogue)
  *timeCut(text, hold = 1.3) {
    if (!this.silent) { this.ui.setFadeColor('#0e1418'); this.ui.setFade(1, 380); }
    yield 0.42; if (text) this.ui.timeCard(text);
    yield hold;
    this.ui.timeCard(''); if (!this.silent) this.ui.setFade(0, 450);
    yield 0.2;
  }

  // ---- the wheelchair: the rider sits in it (seat centre 0.45 m behind his origin), the pusher walks behind it ----
  startRide(rider, pusher) {
    const wc = this.stage.wheelchair; wc.visible = true;
    if (wc.parent !== rider.root.parent) rider.root.parent.add(wc);
    this.ride = { rider, pusher, wc };
    rider.seat = null; rider.sitState = 'seated'; rider.seated = true; rider.play('SeatedIdle', { fade: 0 });
    rider.root.position.y = Math.max(0, 0.5 - 0.47); // the wheelchair's seat stands a little above the clip's 0.47 m seat
    this.tickRide(0);
  }
  endRide() {
    const r = this.ride; if (!r) return;
    r.wc.visible = false; this.ride = null;
  }
  // roll the rider along waypoints (his origin's path); the chair and the pusher follow
  roll(points, { speed = 0.85, endYaw = null } = {}) { this.ride.rider.walk(points, { speed, endYaw, clip: 'SeatedIdle', idle: 'SeatedIdle', keepSeat: true }); }
  tickRide() {
    const r = this.ride; if (!r) return;
    const a = r.rider, fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const sx = a.root.position.x - fx * 0.45, sz = a.root.position.z - fz * 0.45; // the seat centre
    r.wc.position.set(sx, 0, sz); r.wc.rotation.y = a.yaw; // (the clean chair: its origin under the seat, its front +z)
    if (r.pusher) {
      const p = r.pusher, moving = a.moving || a.targetYaw != null, back = r.wc.userData.pusherBack || 0.68;
      p.root.position.set(sx - fx * back, 0, sz - fz * back); p.yaw = a.yaw; p.root.rotation.y = a.yaw;
      if (moving && p.curName !== 'Walk_InPlace') p.play('Walk_InPlace', { fade: 0.15 });
      if (!moving && p.curName === 'Walk_InPlace') p.play('Idle', { fade: 0.25 });
      this.handsToGrips(p, r.wc);
    }
  }
  // the pusher's hands on the chair's push grips (a two-bone reach after the clip, every frame the chair is pushed)
  handsToGrips(p, wc) {
    const G = wc.userData.grips; if (!G?.L || !G?.R) return;
    wc.updateMatrixWorld(true); p.root.updateMatrixWorld(true);
    const B = p.bones;
    for (const [side, grip] of [['L', G.L], ['R', G.R]]) {
      const up = B['upper_arm' + side], lo = B['forearm' + side], hand = B['hand' + side];
      if (up && lo && hand) ikArm(up, lo, hand, grip.getWorldPosition(new THREE.Vector3()), 1);
    }
  }
  // the guard carries the bat in his right hand, pointing down along his leg (or puts it away: null)
  holdBat(actor) {
    const bat = this.stage.guardBat;
    if (!actor) { bat.visible = false; bat.parent?.remove(bat); return; }
    const hand = actor.bones.handR; if (!hand) return;
    // the static bat: its origin is the barrel end, the knob 0.6 m along +y (checked in a render). Set once in the current
    // pose: the knob in his fist, the barrel hanging down and a little forward along his leg; then it rides the hand bone.
    actor.root.updateMatrixWorld(true);
    const qh = hand.getWorldQuaternion(new THREE.Quaternion()), hp = hand.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw)), dir = new THREE.Vector3(0, -0.93, 0).addScaledVector(fwd, 0.36).normalize();
    const qd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    hand.add(bat); bat.visible = true; bat.scale.setScalar(1 / hand.getWorldScale(new THREE.Vector3()).x);
    bat.quaternion.copy(qh.clone().invert().multiply(qd));
    bat.position.copy(hand.worldToLocal(hp.clone().addScaledVector(dir, 0.52)));
  }

  // ================================================================== ACT 2: arrival, the seated assessment, the elevator
  *act2() {
    const st = this.stage, A = st.actors, an = st.anchors, bb = A.baseball, sg = A.security, rc = A.staff, yo = A.yola, co = A.teamB;
    const bat = bb.bat;
    this.state = 'CHECK_IN'; this.substate = 'ARRIVAL_HOLD'; this.mark('arrival-hold');
    // Yola was prepared off camera: seated in her chair behind the assessment desk, working through the chart
    yo.setVisible(true); yo.place(an.chairYola.x, an.chairYola.z, an.chairYola.yaw); yo.sitW = 1; yo.sitTarget = 1; yo.pose = 'sit'; yo.seated = true; yo.sitState = 'seated'; yo.sitSeatTop = an.chairYola.seatTop;
    yo.model.position.y = yo.baseY - (yo.pelvisY0 - (an.chairYola.seatTop + 0.04)); yo.play('chart', { fade: 0 });
    this.camTo(S(-6.3, 0.6, 0.8, 52, 30, 7.0), 0.01);
    yield 1.0;
    // 1. the athlete (favouring his knee: slower, the bat as his cane) and his guard walk in to the desk
    this.substate = 'WALK'; this.mark('walk-start');
    bb.walk([[-6.4, 0.9], [-5.2, -1.0], [an.queue.x, an.queue.z]], { endYaw: Math.PI, speed: 0.8 });
    yield 0.9;
    sg.walk([[-7.0, 1.5], [-5.6, -0.2], [-4.8, -1.4], [an.guardQueue.x, an.guardQueue.z]], { endYaw: Math.PI });
    this.camTo(S(-5.6, 0.8, -2.2, 50, 26, 6.2), 2.6);
    yield this.arrived(bb, sg);
    this.mark('queue');
    // 2. reception: she looks up from the computer, checks the booking, and sends them through (line 01)
    this.camTo(S(-5.3, 0.9, -3.5, 46, 26, 5.0), 1.0);
    yield 0.5; rc.turnTo(0.3); yield 1.1; rc.turnTo(-0.3); yield 0.5;
    this.mark('checkin');
    yield* this.say('01', { pause: 0.25 });
    if (!this.silent) this.sound.confirm();
    // 3. into the office: the athlete leads through the staff corridor, the guard follows; both take the visitor chairs
    this.substate = 'ASSESSMENT_ENTRY';
    const cp = an.chairPatient, cg = an.chairGuard, od = an.officeDoor;
    bb.walk([[-3.4, -1.7], [-1.0, -1.0], [an.doorway.x, an.doorway.z], [1.75, -1.0], [od.x, od.z], [4.4, -1.5], [cp.x - 0.6, cp.z - 0.45], [cp.x, cp.z - 0.45]], { endYaw: Math.PI, speed: 0.85 });
    this.camTo(S(-3.5, 0.7, -1.6, 46, 28, 8.0), 1.5, { actor: bb, dx: 0.8, dz: 0.5 });
    yield 1.4;
    sg.walk([[-4.2, -1.6], [-1.2, -1.1], [an.doorway.x, an.doorway.z], [1.75, -0.95], [od.x, od.z + 0.1], [4.6, -1.2], [7.55, -1.4], [7.55, cg.z - 0.45], [cg.x, cg.z - 0.45]], { endYaw: Math.PI });
    yield 1.6; // they head off toward the staff corridor...
    // ...a cut: they come in at the office door (the corridor walk is not shown; nothing about it matters)
    this.dip(0.25, 0.3); yield 0.28;
    bb.stop(); bb.place(od.x + 0.35, od.z, Math.PI / 2); bb.walk([[4.4, -1.5], [cp.x - 0.6, cp.z - 0.45], [cp.x, cp.z - 0.45]], { endYaw: Math.PI, speed: 0.85 });
    sg.stop(); sg.place(od.x - 0.55, od.z + 0.1, Math.PI / 2); sg.walk([[od.x + 0.4, od.z + 0.15], [4.6, -1.2], [7.55, -1.4], [7.55, cg.z - 0.45], [cg.x, cg.z - 0.45]], { endYaw: Math.PI });
    this.camTo(OFFICE_SHOT, 0.01);
    yield this.arrived(bb);
    this.state = 'SEATED_ASSESSMENT'; this.substate = 'SEATING';
    if (bat) bat.visible = false; this.leanBat(true); // (the skinned bat cannot follow a seated pose: it leans against his chair)
    bb.sitAt(cp.x, cp.z, cp.yaw, { seatTop: cp.seatTop });
    yield this.arrived(sg);
    sg.sitAt(cg.x, cg.z, cg.yaw, { seatTop: cg.seatTop });
    yield this.seated(bb); yield this.seated(sg);
    yield 0.5; this.mark('both-seated');
    // 4. the conversation (02-10): the office from the east, all three in profile across the desk
    this.substate = 'CONVERSATION';
    this.talkers = { Yola: yo, Patient: bb, Reception: rc };
    const cut = (a, b, secs = 2.6) => { this.camTo(a, 0.01); if (b) this.camTo(b, secs); }; // a hard cut, then a slow push through the line
    // the reverse angles, from each speaker's head and facing (always from the east side of the desk, where no head is in the way)
    const ON_PATIENT = this.headShot(bb, 42, 2.5, 10), ON_PATIENT_CLOSE = this.headShot(bb, 38, 2.0, 8);
    const ON_YOLA = this.headShot(yo, 28, 2.5, 25, -0.05), ON_YOLA_CLOSE = this.headShot(yo, 24, 2.1, 23, -0.05); // (from above the desk monitor)
    cut(ON_YOLA, ON_YOLA_CLOSE); yield* this.say('02');
    cut(ON_PATIENT, ON_PATIENT_CLOSE, 3.2); yield* this.say('03');
    cut(OFFICE_CLOSE); yield* this.say('04', { pause: 0.2 });
    cut(ON_PATIENT, ON_PATIENT_CLOSE, 4.0); yield* this.say('05');
    cut(ON_YOLA_CLOSE); yield* this.say('06', { pause: 0.2 });
    cut(ON_PATIENT_CLOSE); yield* this.say('07', { pause: 0.55 });
    cut(OFFICE_SHOT, OFFICE_CLOSE, 5.0); yield* this.say('08');
    cut(ON_PATIENT, ON_PATIENT_CLOSE, 4.0); yield* this.say('09');
    // "I see the test results here": her eyes go down to the chart
    cut(ON_YOLA, ON_YOLA_CLOSE, 3.0);
    yo.play('chart', { fade: 0.2 }); yo.adjust('chartLook', 'head', 0.38, 0, 0, 0); this.tween(0.5, (k) => { yo.adj.chartLook.w = ease(k); });
    yield* this.say('10', { pause: 0.4 });
    this.tween(0.6, (k) => { if (yo.adj.chartLook) yo.adj.chartLook.w = 1 - ease(k); }); this.later(0.65, () => delete yo.adj.chartLook);
    this.camTo(OFFICE_SHOT, 0.01);
    // 5. Card 1: the history changes the plan (the scene waits)
    this.substate = 'CARD_1'; this.mark('card-open');
    yield* this.card('assess');
    this.ui.objective(''); // (the chart is reviewed)
    yield 0.3;
    yield* this.say('11', { pause: 0.4 });
    // 6. upstairs: Yola stands; the colleague brings the wheelchair from the corridor
    this.substate = 'WHEELCHAIR';
    yield* this.say('12', { pause: 0.1 });
    yo.riseUp(); yield this.upright(yo); yo.play('idle', { fade: 0.3 });
    yo.walk([[5.15, -3.95], [4.55, -2.95]], { endYaw: 2.2 }); // around the desk to the visitors' side, turned to them
    st.toClinic(co); co.setVisible(true); co.place(1.9, -1.0, Math.PI / 2); co.play('Idle', { fade: 0 });
    // the empty chair rolls in ahead of her (she pushes it; nobody rides yet)
    this.emptyChair = true; this.startEmptyChair(co);
    co.walk([[od.x, od.z], [4.05, -1.25]], { endYaw: Math.PI / 2, speed: 0.95 });
    yield this.arrived(co, yo);
    this.mark('colleague-in');
    yield* this.say('13');
    yield* this.say('14', { pause: 0.2 });
    // line 15: Yola turns to the guard as she speaks: "he" is clear
    yo.turnTo(Math.atan2(cg.x - 4.55, cg.z - -2.95)); sg.adjust('nod', 'head', 0.18, 0, 0, 0); this.tween(0.6, (k) => { sg.adj.nod.w = Math.sin(k * Math.PI); });
    this.camTo(OFFICE_GUARD, 0.9);
    yield* this.say('15', { pause: 0.4 });
    delete sg.adj.nod;
    // 7. a clean cut: the athlete is in the wheelchair, the guard is carrying the bat (no transfer animation is faked)
    this.substate = 'TRANSFER_CUT'; this.talkers = null;
    this.dip(0.3, 0.35); yield 0.34;
    this.leanBat(false); this.stopEmptyChair();
    // the chair turned for the way out (facing west, the seat at 5.0, -1.25), the colleague behind it
    bb.stop(); bb.seat = null; bb.place(4.55, -1.25, -Math.PI / 2); bb.targetYaw = null;
    this.startRide(bb, co);
    sg.stop(); sg.sitState = 'stand'; sg.seated = false; sg.seat = null; sg.root.position.y = 0; sg.place(6.85, -0.75, -Math.PI / 2); sg.targetYaw = null; sg.play('Idle', { fade: 0 }); this.holdBat(sg);
    yo.stop(); yo.place(4.0, -2.2, -Math.PI / 2 - 0.35); yo.targetYaw = null; yo.play('idle', { fade: 0 });
    this.camTo(S(4.8, 0.8, -1.7, 40, 72, 5.2), 0.01); // (from the east, like the office shot: the south wall would hide them)
    this.mark('in-wheelchair');
    yield 1.2;
    // 8. to the elevator: Yola leads, the colleague wheels him, the guard follows with the bat
    this.substate = 'TO_ELEVATOR';
    const lf = an.liftFront;
    yo.walk([[od.x, od.z], [1.75, -1.05]]);
    yield 0.7;
    this.roll([[od.x + 0.4, od.z + 0.1], [1.75, -1.0]], { speed: 0.9 });
    yield 1.2;
    // a cut: they come out of the staff corridor into the reception, the elevator ahead
    this.dip(0.25, 0.3); yield 0.28;
    yo.stop(); yo.place(-0.45, -1.55, -2.4); yo.walk([[-1.0, -2.2], [lf.x - 0.9, lf.z + 0.6]], { endYaw: Math.PI });
    bb.stop(); bb.place(0.85, -1.0, -Math.PI / 2); this.roll([[-0.2, -1.4], [-1.1, -2.6], [lf.x, lf.z + 1.1]], { endYaw: Math.PI, speed: 0.9 });
    sg.stop(); sg.place(3.0, -1.1, -Math.PI / 2); this.later(0.6, () => sg.walk([[an.doorway.x, an.doorway.z + 0.15], [-0.3, -2.0], [lf.x + 1.0, lf.z + 0.7]], { endYaw: Math.PI })); // (a body length behind the colleague)
    this.camTo(S(-1.6, 0.8, -3.2, 44, 22, 6.8), 0.01);
    this.camTo(S(-2.2, 0.85, -3.9, 40, 18, 6.0), 3.5);
    yield this.arrived(yo, bb, sg);
    this.mark('at-elevator');
    // 9. the elevator: the doors open, they enter (chair first, turned to face the doors), the doors close
    this.substate = 'ELEVATOR';
    if (!this.silent) this.audio.play('liftDing');
    this.tween(1.0, (k) => st.setLiftOpen(ease(k)));
    const cx = CLINIC_LIFT.x;
    this.camTo(S(cx, 1.0, -5.6, 22, 8, 4.6), 1.1); // down to the doors: the cab interior shows as they go in
    yield 1.1;
    this.roll([[cx, -6.0], [cx, -8.35]], { speed: 0.8 });
    yield 0.5;
    yo.walk([[lf.x - 0.9, -6.1], [cx - 1.0, -7.0]], { endYaw: 0 });
    sg.walk([[lf.x + 1.0, -6.1], [cx + 1.05, -7.0]], { endYaw: 0 });
    yield this.arrived(bb);
    // the chair turns about its seat to face the doors
    { const sx = bb.x, sz = bb.z + 0.45; this.tween(1.1, (k) => { const yw = Math.PI + Math.PI * ease(k); bb.yaw = yw; bb.root.rotation.y = yw; bb.root.position.x = sx + Math.sin(yw) * 0.45; bb.root.position.z = sz + Math.cos(yw) * 0.45; }); }
    yield 1.15;
    yield this.arrived(yo, sg);
    this.mark('in-elevator');
    yield 0.3;
    if (!this.silent) this.audio.play('liftClose');
    this.tween(1.0, (k) => st.setLiftOpen(1 - ease(k)));
    yield 1.05;
    // the floor display climbs: G to 7 (a close shot of the doors and the display)
    this.camTo(S(cx, 2.05, -6.0, 6, 0, 1.6, 40), 0.01);
    const disp = st.lift.display;
    disp.set('G', '▲'); yield 0.55; for (const n of ['1', '2', '3', '4', '5', '6']) { disp.set(n, '▲'); yield 0.32; } disp.set('7'); if (!this.silent) this.audio.play('liftDing'); yield 0.55;
    this.mark('floor-7');
    yield* this.act3();
  }
  // the empty wheelchair, pushed by the colleague before anyone sits in it
  startEmptyChair(pusher) { const wc = this.stage.wheelchair; wc.visible = true; if (wc.parent !== pusher.root.parent) pusher.root.parent.add(wc); this.chairPush = pusher; }
  stopEmptyChair() { const p = this.chairPush; if (!p) return; this.chairPush = null; }
  tickEmptyChair() { const p = this.chairPush; if (!p) return; const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); const wc = this.stage.wheelchair, back = wc.userData.pusherBack || 0.68; wc.position.set(p.root.position.x + fx * back, 0, p.root.position.z + fz * back); wc.rotation.y = p.yaw; this.handsToGrips(p, wc); }
  // the athlete's bat while he sits: the static copy leans against his chair (continuity: it is never out of sight)
  leanBat(on) {
    const st = this.stage, an = st.anchors.chairPatient;
    if (!this.leanedBat) { this.leanedBat = st.guardBat.clone(true); st.root.add(this.leanedBat); }
    const b = this.leanedBat; b.visible = on; if (!on) return;
    b.scale.setScalar(1); b.position.set(an.x - 0.4, 0.01, an.z + 0.1); b.rotation.set(0, 0.3, -0.2); // (standing on its barrel, the knob up against the seat)
  }

  // ================================================================== ACT 3: Floor 7, preparation, the procedure, recovery
  *act3() {
    const st = this.stage, A = st.actors, bb = A.baseball, sg = A.security, yo = A.yola, co = A.teamB, su = A.surgeon, ta = A.teamA;
    this.state = 'FLOOR_7'; this.substate = 'ARRIVAL';
    // the operating suite on Floor 7 (the floor the game begins on), clean and bright before the outbreak
    this.enterOR(); this.arena.liftPowered?.(true); this.setLiftSign(false);
    const L = LIFT7; // the cab: x 1.44..4.36, z -14.45..-11.5; the doors on the OR's back wall, facing south
    const toWorld = (a, x, z, yaw) => st.actorToWorld(a, x, z, yaw);
    // in the cab, facing the doors (south): the chair in the middle, the colleague behind it, Yola and the guard either side
    toWorld(bb, L.x, -12.35, 0); toWorld(co, L.x, -13.8, 0); this.scene.add(st.wheelchair); this.tickRide();
    toWorld(yo, L.x - 1.0, -12.0, 0); yo.play('idle', { fade: 0 });
    toWorld(sg, L.x + 1.0, -12.0, 0); sg.play('Idle', { fade: 0 });
    for (const a of [su, ta]) a.setVisible(false); A.staff.setVisible(false);
    this.liftDisp3 ||= this.arena.doorKits.lift.display || liftDisplay(this.arena.doorKits.lift.root); this.liftDisp3.set('7');
    this.setLift3(0);
    this.camTo(W(L.x - 0.2, 1.0, -9.6, 26, 12, 6.0, 42), 0.01); // from the OR, up toward the lift doors on the back wall
    yield 0.45;
    if (!this.silent) this.audio.play('liftDing');
    this.tween(1.0, (k) => this.setLift3(ease(k)));
    yield 1.05;
    // out into the suite (the doors are open: nobody passes through them shut); line 16
    yo.walk([[L.x - 1.0, -10.2], [1.4, -7.2]], { endYaw: Math.PI });
    this.roll([[L.x, -10.0], [L.x, -6.6]], { speed: 0.85, endYaw: 0 });
    sg.walk([[L.x + 1.0, -10.2], [4.6, -6.0]], { endYaw: -Math.PI / 2 });
    this.camTo(W(2.4, 0.9, -7.6, 40, 30, 6.8), 2.2);
    yield 1.2;
    yield* this.say('16', { pause: 0.5 });
    yield this.arrived(bb, yo, sg);
    // the guard and the bat stay outside the operating area: he waits in Supply, by the OR's door
    sg.walk([[2.0, -4.2], [-3.0, -4.3], [-6.6, -4.1], [-9.0, -4.2]], { endYaw: Math.PI / 2 });
    yield 1.2;
    // changing happens off camera: a time cut to the prepared patient in plain white hospital clothing
    this.substate = 'PREPARED';
    yield* this.timeCut('', 0.6);
    this.endRide();
    sg.stop(); toWorld(sg, -9.4, -4.3, Math.PI / 2); sg.play('Idle', { fade: 0 }); // in Supply by the OR's door, the bat in his hand
    if (bb.capSkin) bb.capSkin.visible = false;
    if (bb.bat) bb.bat.visible = false;
    bb.setOutfit(PATIENT_OUTFIT); // white patient clothing (the later white-clothed zombie is the same man)
    bb.sitState = 'stand'; bb.seated = false; bb.root.position.y = 0; bb.play('Idle', { fade: 0 }); bb.lie(0.9, 1.07, -8.2, Math.PI / 2); // supine, head to the west (the anesthesia end)
    toWorld(yo, -1.45, -8.65, 1.0); yo.play('patient', { fade: 0 }) || yo.play('idle', { fade: 0 });
    toWorld(co, -0.45, -9.35, 0.2); co.play('Idle', { fade: 0 });
    toWorld(su, 0.5, -9.15, 0); su.play('Idle', { fade: 0 }); su.setVisible(true); // (the far side of the table: the camera side stays open)
    toWorld(ta, 1.4, -9.05, -0.35); ta.play('Idle', { fade: 0 }); ta.setVisible(true);
    this.ui.showMonitor(true); this.ui.monitor({ mode: 'normal', hr: 74, spo2: 99, status: 'SINUS', alarm: false, tof: null }); this.monitorOn = true;
    this.camTo(W(0.2, 0.95, -8.2, 48, 35, 6.2), 0.01);
    this.mark('or-prepared');
    yield 0.8;
    // 17-19: at his head; then Card 2 at the anesthesia workstation
    this.substate = 'PREP';
    this.camTo(W(-0.7, 1.0, -8.3, 34, 35, 3.6), 1.2);
    yield* this.say('17', { pause: 0.25 }); yield* this.say('18'); yield* this.say('19', { pause: 0.4 });
    this.camTo(W(-1.9, 1.05, -7.9, 36, 35, 4.2), 1.2);
    yo.walk([[-1.75, -8.35]], { endYaw: -0.69 }); yield this.arrived(yo); yo.play('machine', { fade: 0.25 }) || yo.play('idle');
    this.ui.tag('equip', 'Anesthesia workstation', 'Equipment'); this.pointAt('equip', -2.25, 1.8, -7.75);
    yield* this.card('equip');
    this.ui.tag('equip', null);
    this.ui.monitor({ tof: { ratio: null, twitches: [0, 0, 0, 0] } }); // the quantitative monitor on the adductor pollicis: connected, ready
    yield 0.3;
    yield* this.say('20', { pause: 0.2 });
    yo.walk([[-1.45, -8.65]], { endYaw: 1.0 }); yield this.arrived(yo); yo.play('patient', { fade: 0.25 }) || yo.play('idle');
    this.camTo(W(-0.7, 1.0, -8.3, 34, 35, 3.6), 1.0);
    yield* this.say('21', { pause: 0.5 });
    // later: the surgical team operates on the knee; Yola manages the anesthesia at his head
    this.substate = 'PROCEDURE';
    yield* this.timeCut(TIME_CARDS.later, 1.1);
    su.play('Work', { fade: 0 }) || su.play('Idle'); ta.play('Work', { fade: 0 }) || ta.play('Idle'); yo.play('monitor', { fade: 0 }) || yo.play('idle');
    this.camTo(W(0.2, 0.95, -8.2, 46, 35, 6.0), 0.01); this.camTo(W(0.1, 0.95, -8.2, 46, 35, 5.4), 3.5);
    yield 1.4;
    su.play('Idle', { fade: 0.4 }); ta.play('Idle', { fade: 0.4 });
    // 22 and Card 3: the quantitative reading after rocuronium
    this.substate = 'RECOVERY_CHECK';
    yield* this.say('22', { pause: 0.3 });
    this.ui.monitor({ tof: { ratio: 0.78, twitches: [1, 0.93, 0.86, 0.78] } });
    this.camTo(W(-0.6, 1.05, -9.2, 38, 35, 4.0), 1.0);
    yield 0.6;
    yield* this.card('monitor');
    yield* this.say('23', { pause: 0.4 });
    // complete reversal, a few minutes, check again: 0.96 and the other criteria, then extubation
    yield* this.timeCut(TIME_CARDS.reversal, 1.0);
    this.ui.monitor({ tof: { ratio: 0.96, twitches: [1, 0.99, 0.975, 0.96] } });
    this.camTo(W(-0.4, 1.0, -8.6, 42, 35, 4.6), 0.01);
    this.ui.readiness(READINESS, 0);
    for (let i = 1; i <= READINESS.length; i++) { yield 0.42; this.ui.readiness(READINESS, i); if (!this.silent) this.sound.monitorBeep(); }
    yield 0.35; this.ui.readiness(READINESS, READINESS.length, true); if (!this.silent) this.sound.confirm();
    this.mark('recovered');
    yield 1.6; this.ui.readiness(null); this.ui.monitor({ tof: null });
    // the handoff (24-26): the colleague takes over at the bedside (he stays with the patient); Yola thanks him and goes
    this.substate = 'HANDOFF';
    co.walk([[-0.95, -9.05]], { endYaw: -0.96 });
    yo.turnTo(2.18); yo.play('handoff', { fade: 0.3 }) || yo.play('idle');
    this.camTo(W(-0.9, 1.0, -8.9, 30, 35, 3.4), 1.0);
    yield* this.say('24'); yield* this.say('25'); yield* this.say('26', { pause: 0.2 });
    // (both leave between the head of the table and the workstation: no path through the furniture)
    su.walk([[-1.3, -9.4], [-1.6, -6.9], [-6.6, -4.6], [-8.0, -4.2]]); // the surgeon leaves too; the anesthesia colleague and the nurse stay
    yo.walk([[-1.6, -6.9], [-5.6, -4.6], [-7.6, -4.4]]);
    co.walk([[-0.85, -8.85]], { endYaw: 0.17 }); // back at his head, watching him and the monitor
    ta.walk([[0.55, -9.1]], { endYaw: 0 });
    this.camTo(W(-1.2, 0.95, -8.0, 46, 35, 7.2), 1.6);
    yield () => yo.x < -5.8;
    su.setVisible(false); yo.setVisible(false);
    // her brief absence happens off screen: she leaves with the guard (and the athlete's bat) and goes down to six; the
    // anesthesia colleague stays with the patient. The OR's lift sits at six, where she will call it from.
    A.security.setVisible(false); this.holdBat(null); this.liftDisp3?.set('6');
    this.mark('handoff-done'); this.mark('errand-done');
    yield* this.act4();
  }

  // Yola's brief absence (2026-10-16 brief A6): with the patient stable and his anesthesia colleague staying at his side, she
  // walks the guard (the athlete's bat in his care) down to six, out of the clinical area. A compact staging: the two of
  // them cross the OR to the lift, the doors close, the display counts down to 6. She will come back up with the bat.
  *errand() {
    const st = this.stage, A = st.actors, sg = A.security, yo = A.yola, L = LIFT7;
    this.substate = 'ERRAND';
    const toWorld = (a, x, z, yaw) => st.actorToWorld(a, x, z, yaw);
    // a short cut: Yola and the guard come back in from Supply together, and cross to the lift
    this.dip(0.25, 0.3); yield 0.28;
    yo.stop(); toWorld(yo, -6.4, -4.4, Math.PI / 2); yo.setVisible(true); yo.play('idle', { fade: 0 });
    sg.stop(); toWorld(sg, -6.9, -3.5, Math.PI / 2); sg.setVisible(true); sg.play('Idle', { fade: 0 });
    yo.walk([[-3.0, -5.0], [1.0, -8.6], [L.x - 0.55, -10.2], [L.x - 0.55, -12.6]], { endYaw: 0, speed: 1.1 });
    this.later(0.35, () => sg.walk([[-3.0, -4.0], [3.6, -8.4], [L.x + 0.55, -10.2], [L.x + 0.55, -12.6]], { endYaw: 0 }));
    this.camTo(W(0.6, 0.9, -8.0, 46, 35, 7.6), 0.01);
    if (!this.silent) this.later(2.6, () => { this.audio.play('liftDing'); this.tween(0.9, (k) => this.setLift3(ease(k))); });
    yield 2.6; yield 0.95;
    yield this.arrived(yo, sg);
    // inside, turned to the doors; the doors close; the display counts down to six
    yo.turnTo(0); sg.turnTo(0); yield 0.6;
    if (!this.silent) this.audio.play('liftClose');
    this.tween(1.0, (k) => this.setLift3(1 - ease(k)));
    this.camTo(W(L.x, 1.6, -10.4, 10, 0, 3.4, 40), 1.2);
    yield 1.1;
    yo.setVisible(false); sg.setVisible(false); this.holdBat(null);
    this.liftDisp3.set('7', '▼'); yield 0.8; this.liftDisp3.set('6');
    this.mark('errand-done');
  }

  // a medium shot of someone's face: the camera offDeg off their facing (on the east side), dist metres, a little above
  headShot(a, offDeg, dist, pitch, dy = -0.12) {
    a.root.updateMatrixWorld(true);
    const h = (a.bones.head || a.root).getWorldPosition(new THREE.Vector3()), off = THREE.MathUtils.degToRad(offDeg);
    const yA = a.yaw + off, yB = a.yaw - off, yw = Math.sin(yA) > Math.sin(yB) ? yA : yB; // (the east side)
    return { x: h.x, y: h.y + dy, z: h.z, pitch, yaw: THREE.MathUtils.radToDeg(yw), dist, fov: 38 };
  }
  // a speaker's hand comes up from the lap or desk and moves a little with the words, then settles (seated or standing)
  gesture(a, secs) {
    const up = a.bones.upper_armR ? 'upper_armR' : 'upperarm_r', lo = a.bones.forearmR ? 'forearmR' : 'forearm_r';
    if (!a.bones[up] || !a.bones[lo]) return;
    const key = 'talk' + (++this.gestureN || (this.gestureN = 1));
    for (const k of Object.keys(a.adj)) if (k.startsWith('talk')) delete a.adj[k];
    a.adjust(key + 'U', up, -0.45, 0, -0.12, 0); a.adjust(key + 'L', lo, -0.75, 0, 0, 0);
    const dur = Math.max(1.0, secs);
    this.tween(dur, (k) => { const w = Math.sin(Math.min(1, k * 1.25) * Math.PI) * (0.82 + 0.18 * Math.sin(k * dur * 7)); if (a.adj[key + 'U']) { a.adj[key + 'U'].w = w; a.adj[key + 'L'].w = w; } if (k >= 1) { delete a.adj[key + 'U']; delete a.adj[key + 'L']; } });
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

  // ================================================================== ACT 4: the crisis (reveal beats 1-4)
  // The OR starts close to the ordinary game view and grows unsettled; the staff were already responding when the
  // movement changes that response. Lines 27-31 (take B); "Behind me" (32) is never played.
  *act4() {
    const st = this.stage, A = st.actors, bb = A.baseball, co = A.teamB, ta = A.teamA;
    // a stable beat: everything as it should be (the anesthesia colleague at his head, the nurse beside him)
    this.state = 'STABLE'; this.substate = 'BEAT';
    this.setOrLamp(false); // (the ceiling lamp swung clear after the procedure: his head stays in view from every angle)
    this.camTo(W(0.3, 0.9, -7.7, 48, 35, 7.6), 2.0); // the OR's ordinary elevated view
    for (let i = 0; i < 3; i++) { if (!this.silent) this.sound.monitorBeep(); yield 0.75; }
    // BEAT 1 (about 4 s): the alarm; the staff check him and the equipment at once; the camera draws closer and lower
    this.state = 'EMERGENCY'; this.substate = 'B1_FLATLINE'; this.mark('beat1');
    this.ui.monitor({ mode: 'irregular', hr: '---', status: 'ALARM', alarm: true, bp: 'BP ---' }); // (no stale blood pressure beside a failing trace)
    this.setAlarm(0.35, 0.6);
    if (!this.silent) { this.sound.setMusicLevel(0, 1.2); this.sound.alarmOn(0.75); }
    co.turnTo(-Math.PI + 0.4);
    ta.walk([[0.05, -8.85]], { endYaw: Math.PI * 0.95 });
    this.camTo(W(-0.2, 0.95, -8.3, 34, 35, 4.4), 4.2);
    yield* this.say('27', { pause: 0.1 });
    // the nurse checks the pulse at his neck, the colleague checks the leads and the line; the spoken confirmation follows
    ta.adjust('chk', 'upper_armR', -0.9, 0, -0.2); ta.adjust('chkF', 'forearmR', -0.6, 0, 0); this.tween(0.5, (k) => { ta.adj.chk.w = ease(k); ta.adj.chkF.w = ease(k); });
    co.play('Work', { fade: 0.2 }) || co.play('Idle');
    yield 1.6;
    this.ui.monitor({ mode: 'flat', hr: 0, spo2: '--', status: 'NO PULSE', bp: 'BP ---' });
    if (!this.silent) { this.sound.alarmOff(); this.sound.flatlineOn(); }
    yield* this.say('28', { pause: 0.15 });
    // they respond at once: chest compressions begin; a readable beat before he moves
    this.substate = 'B1_RESPONSE';
    delete ta.adj.chk; delete ta.adj.chkF;
    ta.adjust('cprL', 'upper_armL', -1.25, 0, 0.3); ta.adjust('cprR', 'upper_armR', -1.25, 0, -0.3);
    this.cpr = { a: ta, t: 0 };
    yield 1.6;
    // BEAT 2 (about 4 s): near the foot of the bed, his upper body clear; he slowly sits up, his skin shifting
    this.substate = 'B2_MOVES'; this.mark('motion');
    this.camTo({ ...W(-0.6, 1.3, -8.2, 22, 76, 3, 40), dist: 3.4 }, 0.01); this.camTo({ ...W(-0.6, 1.4, -8.2, 18, 80, 3, 40), dist: 3.0, roll: 0.045 }, 4.0); // (from near the foot of the bed, over his legs; a slight tilt)
    bb.adjust('hand', 'forearmR', 0, 0, -0.5, 0);
    this.tween(0.9, (k) => { bb.adj.hand.w = Math.sin(k * Math.PI * 3) * 0.6 + ease(k) * 0.4; });
    yield 0.8;
    this.sitUp(bb, 2.6); this.greenTo(bb, 3.0);
    if (!this.silent) { this.sound.flatlineOff(1.2); this.audio.play('groan', 0.6); }
    yield 2.4;
    // BEAT 3 (about 4.5 s): the staff orient to the moving patient first, then speak, then back away on clear paths
    this.substate = 'B3_NOTICE';
    this.cpr = null; delete ta.adj.cprL; delete ta.adj.cprR;
    const pz = { x: 0, z: -8.2 }, face = (a) => Math.atan2(pz.x - a.x, pz.z - a.z);
    ta.turnTo(face(ta)); co.turnTo(face(co));
    this.camTo(W(0.1, 1.0, -8.5, 26, 35, 5.4), 1.4); // a slight pullback: the patient and both of them legible
    yield 0.8;
    yield* this.say('29', { pause: 0.1 });
    // backing away, eyes on him: the nurse round the foot end toward the lift side, the colleague toward the monitor corner
    this.backAway(ta, 1.35, -9.9, 1.3, pz); this.backAway(co, -1.55, -9.75, 1.3, pz);
    yield 1.0;
    // BEAT 4 (about 2.5 s): the call for Yola; red emergency light builds; his growl confirms it
    this.substate = 'B4_CALL';
    this.setAlarm(0.7, 0.55);
    if (!this.silent) this.audio.play('groan', 1.1);
    bb.adjust('look', 'head', 0, 0.42, 0, 0); this.tween(0.8, (k) => { bb.adj.look.w = ease(k); }); // (his head turns toward the room and the lift)
    yield* this.say('30', { pause: 0.1, alarm: true });
    yield* this.say('31', { pause: 0.0, alarm: true });
    this.mark('get-yola-done');
    yield* this.reveal();
  }

  // ================================================================== THE REVEAL (beats 5-13 of the Motion study)
  // The elevator framing is level, controlled and still; the strongest camera move is kept for Yola's entrance. The old toon
  // silhouette becomes Yola 3.0 (the game's own model and clips: nothing here changes how she animates), no intermediate
  // model, no wave, smash, slide, shot or kill. Light: slow red pulses, a few restrained accents (none with Soft light on).
  *reveal() {
    const st = this.stage, A = st.actors, L = LIFT7, g = this.game(), Y = this.yola, old = A.yola, bb = A.baseball;
    const toWorld = (a, x, z, yaw) => st.actorToWorld(a, x, z, yaw);
    const cabX = L.x, cabZ = -12.75; // where she stands in the cab, facing out (south)
    this.state = 'REVEAL'; this.ensureRevealFx();
    const doorShot = (dist = 4.3, y = 1.15) => ({ ...W(L.x, y, -11.3, 2, 0, 3, 40), dist }); // level, front-on, the doorway filling the frame
    // BEAT 5 (about 3 s): low and close on the closed doors; a light sweeps under them; tilt up to the indicator on 6
    this.substate = 'B5_ARRIVES'; this.mark('beat5');
    this.liftDisp3.set('6', '▲'); this.setLift3(0); this.scene.background = new THREE.Color(0x10161a);
    this.camTo({ ...W(L.x, 0.3, -11.1, 6, 0, 3, 40), dist: 1.7 }, 0.01);
    if (!this.silent) { this.sound.setMusicLevel(0, 0.6); this.audio.play('liftClose', 0.5); }
    this.sweepT = 0; // the cab's light passing the gap under the doors
    yield 1.3;
    this.camTo({ ...W(L.x, 2.45, -11.1, -14, 0, 3, 40), dist: 1.9 }, 1.5); // up to the floor indicator
    yield 1.6;
    // BEAT 6 (about 3 s): six, seven, ding; the alarm and the music drop away; deliberate stillness
    this.substate = 'B6_DING';
    this.liftDisp3.set('7'); if (!this.silent) { this.audio.play('liftDing'); this.sound.alarmOff(); }
    this.setAlarm(0.35, 0.45);
    yield 2.2;
    // BEAT 7 (about 4 s): the doors slide apart; backlight silhouettes the original toon Yola; soft smoke spills out
    this.substate = 'B7_SILHOUETTE'; this.mark('beat7');
    toWorld(old, cabX, cabZ, 0); old.setVisible(true); old.stop(); old.play('idle', { fade: 0 }); old.waveT = -1; this.silhouette(old.root, true);
    this.backlight(1); this.setLight(0.28);
    this.camTo(doorShot(), 0.01);
    if (!this.silent) this.audio.play('liftDing', 0.4);
    this.tween(1.3, (k) => this.setLift3(ease(k))); this.smoke(true);
    yield 3.2;
    // BEAT 8 (about 2 s): back to what she is walking into: the seated patient leans and growls (a quicker move)
    this.substate = 'B8_THREAT';
    this.camTo({ ...W(-0.6, 1.55, -8.2, 14, 70, 3, 40), dist: 3.6 }, 0.01); this.camTo({ ...W(-0.6, 1.6, -8.2, 11, 76, 3, 40), dist: 3.0, roll: -0.04 }, 1.0); // (head and shoulders, not his face filling the screen)
    if (!this.silent) this.audio.play('groan', 1.3);
    bb.adjust('growl', 'neck', -0.22, 0.15, 0, 0); this.tween(0.9, (k) => { bb.adj.growl.w = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * (1 + 0.15 * Math.sin(k * 40)); }); // (a lunge of the head and neck toward us)
    yield 1.9;
    // BEAT 9 (about 2.5 s): the same doorway; now the silhouette is Yola 3.0, the bat in her hand. A faint accent hints at the
    // change, a stronger one commits the hall to its outbreak look (same architecture, same props, new surfaces and light)
    this.substate = 'B9_CHANGE'; this.mark('beat9');
    this.silhouette(old.root, false); old.setVisible(false);
    this.revealWorld(); this.scene.background = new THREE.Color(0x10161a);
    Y.setShown(true); this.revealPose = { x: cabX, z: cabZ, yaw: 0, vx: 0, vz: 0 }; this.poseRevealYola(0);
    this.silhouette(Y.outer, true); if (Y.batLib?.obj) this.silhouette(Y.batLib.obj, true, true);
    this.camTo(doorShot(), 0.01);
    this.accent(0.35, 0.18);
    yield 1.0;
    this.accent(0.8, 0.3); if (!this.silent) this.sound.riser(1.0);
    yield 1.5;
    // BEAT 10 (about 2.5 s): the bat in low light: from her grip along its length
    this.substate = 'B10_BAT';
    { const h = Y.bones?.RightHand?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3(cabX - 0.3, 0.95, cabZ);
      const bb3 = Y.batLib?.obj ? new THREE.Box3().setFromObject(Y.batLib.obj) : null, mid = bb3 ? bb3.getCenter(new THREE.Vector3()) : h.clone().add(new THREE.Vector3(0.3, -0.1, 0.1));
      const tip = mid.clone().multiplyScalar(2).sub(h).lerp(mid, 0.35); // (from the grip, past the middle toward the barrel)
      this.silhouette(Y.outer, false); if (Y.batLib?.obj) this.silhouette(Y.batLib.obj, false); this.setLight(0.45); // (low light, but the grip and the bat read)
      this.camTo({ x: h.x, y: h.y, z: h.z, pitch: 6, yaw: -24, dist: 0.95, fov: 38 }, 0.01);
      this.camTo({ x: tip.x, y: tip.y, z: tip.z, pitch: 4, yaw: -30, dist: 1.05, fov: 38 }, 2.3); }
    this.later(0.7, () => this.accent(0.25, 0.12)); this.later(1.6, () => this.accent(0.2, 0.1));
    yield 2.4;
    // BEAT 11 (about 2 s): a broader frame; everything settles; one decisive footstep; a short dimming beat
    this.substate = 'B11_STEP';
    this.camTo(doorShot(5.4, 1.1), 0.01); this.silhouette(Y.outer, true); if (Y.batLib?.obj) this.silhouette(Y.batLib.obj, true, true);
    yield 0.8;
    if (!this.silent) this.audio.play('bump', 1.4);
    this.tween(0.6, (k) => { this.backlight(1 - 0.75 * ease(k)); this.setLight(0.28 - 0.16 * ease(k)); });
    yield 1.1;
    // BEAT 12 (about 7 s): the light comes up on her planted sneaker, rises to the bat, then a confident partial arc to her face
    // at a flattering medium framing; she walks out on her own feet as the camera pulls back and the hall opens around her
    this.substate = 'B12_ENTRANCE'; this.mark('beat12');
    this.tween(0.8, (k) => { this.backlight(0.25 + 0.75 * ease(k)); this.setLight(0.12 + 0.55 * ease(k)); });
    if (!this.silent) { g.musicStart?.('combat'); this.sound.revealCue?.(); }
    this.silhouette(Y.outer, false); if (Y.batLib?.obj) this.silhouette(Y.batLib.obj, false);
    const bw = (n, fb) => Y.bones?.[n]?.getWorldPosition(new THREE.Vector3()) || fb;
    const foot = bw('RightToeBase', bw('RightFoot', new THREE.Vector3(cabX - 0.12, 0.08, cabZ + 0.1))), hip = bw('Hips', new THREE.Vector3(cabX, 0.95, cabZ)), head = bw('Head', new THREE.Vector3(cabX, 1.5, cabZ));
    const batMid = Y.batLib?.obj ? new THREE.Box3().setFromObject(Y.batLib.obj).getCenter(new THREE.Vector3()) : hip;
    this.camTo({ x: foot.x, y: Math.max(0.1, foot.y), z: foot.z, pitch: 12, yaw: -18, dist: 1.25, fov: 40 }, 0.01);
    this.camTo({ x: (batMid.x + hip.x) / 2, y: (batMid.y + hip.y) / 2, z: (batMid.z + hip.z) / 2, pitch: 8, yaw: -24, dist: 1.7, fov: 40 }, 1.6);
    yield 1.6;
    this.camTo({ x: head.x, y: head.y - 0.18, z: head.z + 0.08, pitch: 6, yaw: 16, dist: 2.6, fov: 40 }, 1.7); // the arc round to her face (shoulder framing, not a close-up)
    yield 1.9;
    this.smoke(false);
    { const an = ROOM1.player, rp = this.revealPose, sp = 1.05, dx = an.x - rp.x, dz = an.z - rp.z, d = Math.hypot(dx, dz);
      rp.vx = (dx / d) * sp; rp.vz = (dz / d) * sp; rp.goal = { x: an.x, z: an.z, yaw: an.yaw };
      this.camTo({ x: an.x, y: 1.1, z: an.z - 0.4, pitch: 20, yaw: 18, dist: 3.8, fov: 40 }, d / sp + 0.4, null); }
    yield () => !this.revealPose.vx && !this.revealPose.vz;
    yield 0.5;
    // BEAT 13 (about 4 s): rise smoothly to the combat camera, Yola the anchor; the bars and overlays fade; real control
    this.state = 'COMBAT_READY'; this.substate = 'B13_RETURN';
    this.setCamera(); const fromPos = this.camera.position.clone(), fromQuat = this.camera.quaternion.clone(), fromFov = this.camera.fov;
    const an = ROOM1.player, pose = g.cameraPose(an.x, an.z, an.yaw);
    this.camera.position.copy(fromPos); this.camera.quaternion.copy(fromQuat); this.camera.fov = fromFov; this.camera.updateProjectionMatrix();
    this.poseAnim = { from: { pos: fromPos, quat: fromQuat, fov: fromFov }, to: pose, t: 0, dur: 2.2 };
    this.tween(2.0, (k) => { this.backlight(1 - ease(k)); this.setLight(0.67 + 0.33 * ease(k)); });
    yield 2.3;
    this.finalize('normal');
  }
  // Yola 3.0 in the reveal: the game's view, fed the same still/walking state the game feeds it (bat equipped)
  poseRevealYola(dt) {
    const r = this.revealPose; if (!r) return;
    const g = this.game();
    if (r.goal && (r.vx || r.vz)) {
      r.x += r.vx * dt; r.z += r.vz * dt; r.yaw = Math.atan2(r.vx, r.vz);
      if ((r.goal.x - r.x) * r.vx + (r.goal.z - r.z) * r.vz <= 0) { r.x = r.goal.x; r.z = r.goal.z; r.vx = r.vz = 0; r.turn = r.goal.yaw; }
    }
    if (r.turn !== undefined) { const d = Math.atan2(Math.sin(r.turn - r.yaw), Math.cos(r.turn - r.yaw)); r.yaw += d * Math.min(1, dt * 5); }
    const s = g.stillState(r.x, r.z, r.yaw);
    s.equipped = 'bat'; s.vx = r.vx; s.vz = r.vz;
    g.yolaPose?.(dt, s);
  }
  // the reveal's light: a warm panel and lamp at the back of the cab (the silhouette), a sweep of light under the shut doors,
  // a thin layer of mist at the threshold, and brief restrained accents (Soft light: gentle ramps, never a flash)
  ensureRevealFx() {
    if (this.rfx) return;
    const L = LIFT7, g = new THREE.Group(); g.name = 'revealFx'; this.scene.add(g);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 2.75), new THREE.MeshBasicMaterial({ color: 0xfff1d8, toneMapped: false, transparent: true, opacity: 0 }));
    panel.position.set(L.x, 1.38, L.cab.minZ + 0.06); g.add(panel); // (the whole back wall of the cab glows)
    const lamp = new THREE.PointLight(0xffe7c4, 0, 7, 1.6); lamp.position.set(L.x, 2.0, L.cab.minZ + 0.6); g.add(lamp);
    const fill = new THREE.PointLight(0xfff0dc, 0, 5, 1.8); fill.position.set(L.x, 0.5, -11.6); g.add(fill);
    const sweep = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ color: 0xfff2dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sweep.rotation.x = -Math.PI / 2; sweep.position.set(L.x, 0.012, -11.0); g.add(sweep);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(225,228,232,0.9)'); gr.addColorStop(1, 'rgba(225,228,232,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const smokeMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false });
    const puffs = []; for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(smokeMat.clone()); s.position.set(L.x + (i - 4) * 0.28, 0.25, -11.4); s.scale.setScalar(1.2); g.add(s); puffs.push({ s, seed: i * 1.7 }); }
    g.visible = false;
    this.rfx = { g, panel, lamp, fill, sweep, puffs, back: 0, smoke: 0, smokeTarget: 0, acc: 0, accT: 0 };
  }
  backlight(k) { const f = this.rfx; if (!f) return; f.back = k; f.g.visible = true; f.panel.material.opacity = 0.95 * k; f.lamp.intensity = 26 * k; f.fill.intensity = 2.2 * k; }
  smoke(on) { if (this.rfx) this.rfx.smokeTarget = on ? 1 : 0; }
  accent(k, secs) { const f = this.rfx; if (!f) return; if (this.reducedFlash) k *= 0.25; f.acc = k; f.accT = secs; f.accDur = secs; if (!this.silent) this.sound.flicker?.(true); }
  tickReveal(d) {
    const f = this.rfx; if (!f || !f.g.visible) return;
    if (this.sweepT !== undefined && this.sweepT !== null) { // the cab's light passing under the doors (about 1.2 s)
      this.sweepT += d; const u = this.sweepT / 1.2;
      f.sweep.material.opacity = u < 1 ? Math.sin(u * Math.PI) * 0.8 : 0; f.sweep.position.x = LIFT7.x - 1.0 + 2.0 * Math.min(1, u);
      if (u >= 1) this.sweepT = null;
    }
    f.smoke += (f.smokeTarget - f.smoke) * Math.min(1, d * 1.5);
    for (const p of f.puffs) { const t = (this.t * 0.25 + p.seed) % 1; p.s.position.z = -11.5 + t * 2.4; p.s.position.y = 0.2 + t * 0.35; p.s.scale.setScalar(1.0 + t * 1.6); p.s.material.opacity = f.smoke * 0.22 * Math.sin(t * Math.PI); }
    let a = 0; if (f.accT > 0) { f.accT -= d; const u = 1 - f.accT / f.accDur; a = f.acc * Math.sin(Math.min(1, u) * Math.PI); f.fill.intensity = 2.2 * f.back + 10 * a; this.redLight && (this.redLight.intensity += 4 * a); }
    if (this.silMat) this.silMat.color.setRGB(0.043 + 0.2 * a, 0.055 + 0.21 * a, 0.063 + 0.22 * a);
  }
  // the hospital after the outbreak, committed at beat 9 behind the doorway: the same architecture, worn surfaces, blood,
  // emergency light, the dead lift sign back; the opening's cast leaves and the floor's zombies stand where they will wake
  revealWorld() {
    const g = this.game(), A = this.stage.actors;
    for (const k of ['baseball', 'teamA', 'teamB', 'surgeon', 'security', 'staff']) A[k].setVisible(false);
    this.holdBat(null); this.cpr = null; this.ui.showMonitor(false); this.monitorOn = false;
    this.inOR = true; this.setBlood(true); this.scene.background = this.saved?.bg || new THREE.Color(0x27323a); this.arena.outPlane?.material.color.set(0x1d262c);
    g.applyRoom1(); this.room1Preview = true;
    this.arena.setEmergency?.(true, 0.4);
    if (this.spot) this.spot.intensity = 0;
    this.setOrLamp(true);
  }
  // a backlit silhouette: every mesh under root drawn in one dark, unlit colour (the accents lift it a little to hint at
  // the form); off puts the original materials back exactly. Purely a look for the reveal: no rig, clip or model changes.
  silhouette(root, on, keepDepth = false) {
    if (!root) return;
    this.silMat ||= new THREE.MeshBasicMaterial({ color: 0x0b0e10 });
    root.traverse((o) => {
      if (!o.isMesh || (!o.userData.silOrig && [].concat(o.material)[0]?.transparent)) return; // (not the soft shadow blob)
      if (on && !o.userData.silOrig) { o.userData.silOrig = o.material; o.material = o.isSkinnedMesh ? this.silSkinMat() : this.silMat; }
      else if (!on && o.userData.silOrig) { o.material = o.userData.silOrig; delete o.userData.silOrig; }
    });
    void keepDepth;
  }
  silSkinMat() { return this.silMat; }
  setOrLamp(v) { const o = this.arena.group.getObjectByName('orLight'); if (o) o.visible = v; }
  // staff stepping back from the table, eyes on the patient: the walk clip played backwards along a short clear path
  backAway(a, x, z, secs, look) {
    a.stop(); a.targetYaw = null; const x0 = a.root.position.x, z0 = a.root.position.z;
    a.play('Walk_InPlace', { fade: 0.15, rate: -0.75 }) || a.play('Walk', { fade: 0.15, rate: -0.75 });
    this.tween(secs, (k) => {
      const e = ease(k); a.root.position.x = x0 + (x - x0) * e; a.root.position.z = z0 + (z - z0) * e;
      const yw = Math.atan2(look.x - a.root.position.x, look.z - a.root.position.z); a.yaw = yw; a.root.rotation.y = yw;
      if (k >= 1) a.play('Idle', { fade: 0.25 });
    });
  }
  setLift3(k) { const L = this.arena.doorKits?.lift; if (!L) return; L.open.time = Math.max(0, Math.min(0.999, k)) * L.open.getClip().duration; L.mixer.update(0); L.last = -1; }
  // the printed "LIFT / Power fault" notice only makes sense after the outbreak
  setLiftSign(v) { for (const m of this.arena.signMeshes || []) if (/^LIFT$/.test(m.userData.sign || '')) m.visible = v; }

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
    this.sound.alarmOff(); this.sound.flatlineOff(0.2); this.sound.stopVoice(); this.sound.stopLine();
    this.ecg = null; this.ui.showEcg(false); this.ui.setVignette(0); this.ui.status(''); this.ui.urgency(null); this.ui.subtitle(''); this.ui.clearTags(); this.ui.closeCard();
    this.ui.title(''); this.ui.chip(''); this.ui.objective(''); this.ui.reward(''); this.ui.setDark(0); this.ui.fade.style.opacity = 0; this.ui.letter(false); this.ui.bossOff();
    // the world: clinic away, combat lighting back, the cast gone (no duplicate humans), the guard waiting at reception
    st.setActive(false); this.inOR = true; // (the OR is the world now)
    const Bk = this.saved || {};
    this.scene.background = Bk.bg || new THREE.Color(0x27323a); this.arena.outPlane?.material.color.set(0x1d262c);
    if (this.arena.sun && Bk.sun) { this.arena.sun.position.copy(Bk.sun); this.arena.sun.target.position.copy(Bk.tgt); this.arena.sun.target.updateMatrixWorld(true); }
    this.renderer.shadowMap.needsUpdate = true;
    for (const l of this.arena.lights) l.visible = true;
    this.animScale = 1; this.setLight(1); this.lightK = 1; if (this.spot) this.spot.intensity = 0; if (this.redLight) this.redLight.intensity = 0;
    if (this.doorway) this.doorway.visible = false; this.orTable(true); this.setLamp(0); this.ui.fade.style.opacity = 0;
    this.setBlood(true);
    this.ensureBelongings(); this.belongings.visible = false; // (Yola has the athlete's bat: no belongings table on Floor 7)
    this.revealPose = null; this.sweepT = null; if (this.rfx) { this.backlight(0); this.rfx.g.visible = false; }
    this.silhouette(A.yola?.root, false); this.silhouette(this.yola?.outer, false); this.silhouette(this.yola?.batLib?.obj, false);
    for (const k of ['yola', 'baseball', 'teamA', 'teamB', 'surgeon', 'staff']) A[k].setVisible(false);
    if (this.guardPool) this.guardPool.visible = true; else this.placeGuardPool(); // (his blood and his pistol remain; no body)
    this.endRide(); this.stopEmptyChair(); this.holdBat(null); this.cpr = null; this.revealSwing = null; this.monitorOn = false; this.ui.showMonitor(false); this.ui.readiness(null); this.ui.timeCard('');
    if (this.bt.state === 'flying') { const bt = this.bt; const tick = () => { if (bt.state !== 'flying') return; bt.update(1 / 60); requestAnimationFrame(tick); }; requestAnimationFrame(tick); } else if (this.bt.state !== 'idle') this.bt.finish();
    this.sound.stopLine(); this.sound.stopNarration(); this.sound.stopMusic(0.3);
    if (g.music?.state === 'off') g.musicStart?.('explore'); // (skip / continue / replay: the game's music from the floor's calm state)
    if (via === 'normal') this.later33();
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
  placeGuardPool() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    gr.addColorStop(0, 'rgba(70,6,8,.92)'); gr.addColorStop(0.55, 'rgba(92,10,12,.8)'); gr.addColorStop(1, 'rgba(92,10,12,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 62, 46, 0.4, 0, Math.PI * 2); g.fill();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(-16.35, 0.012, -0.45); m.renderOrder = 1; this.scene.add(m); this.guardPool = m;
  }
  // line 33, once, a moment after control returns (only after the opening was played through, never mid-fight noise)
  later33() {
    if (this.played33) return;
    const gen = (this.gen33 = (this.gen33 || 0) + 1);
    setTimeout(() => { if (gen !== this.gen33 || this.active || this.played33) return; this.played33 = true; this.sound.playLine(LINE['33']); }, 1600);
  }
  restoreBat() { this.batPicked = false; if (this.stage.batStatic) this.stage.batStatic.visible = true; }
  takeBat() { this.batPicked = true; this.stage.batStatic.visible = false; }
  // dev: replay the whole opening from the start, cleanly
  replay() {
    if (!this.started) return;
    this.finalized = false; this.batPicked = false; this.active = true; this.ui.show(true); this.beginSilent(); this.endSilent();
    this.sound.stopMusic(0.1); this.sound.stopAmbience(); this.started = true; this.resetTour(); this.sound.unlock();
    this.game?.().music?.stop(0.4); this.game?.().hudShow?.(false); this.setupScene();
    this.narrPlaying = this.sound.playNarration(); if (!this.narrPlaying) this.joinAudioLate(); // (the narrator starts over with the tour)
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
  skip() { // replay silently to the end of the story: the canonical Room 1 snapshot
    if (!this.started) return;
    this.sound.stopLine(); this.gen33 = (this.gen33 || 0) + 1;
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
    return this.marks[label];
  }
  beginSilent() { this.silent = true; this.sound.stopVoice(); this.sound.stopLine(); this.sound.stopNarration(); this.narrPlaying = false; this.resetTour(); this.started = true; this.state = 'TOUR'; this.ui.gate.classList.remove('show'); }
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
    this.tickRide(); this.tickEmptyChair();
    if (this.cpr) { this.cpr.t += da; const w = 0.72 + 0.28 * Math.sin(this.cpr.t * Math.PI * 2 * 1.8); for (const k of ['cprL', 'cprR']) if (this.cpr.a.adj[k]) this.cpr.a.adj[k].w = w; }
    if (this.monitorOn) this.ui.drawMonitor(this.t);
    if (this.revealPose) this.poseRevealYola(da);
    this.tickReveal(d);
    this.bt.update(d);
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
  report() { return { state: this.state, substate: this.substate, t: +this.t.toFixed(2), tier: this.stage.tier, sub: this.sub, line: this.line?.id || null, cues: this.cueLog.slice(-8), lines: this.lineLog.map((l) => l.id + (l.audio ? '' : '(silent)')).join(' '), answers: { ...this.answers } }; }
}
