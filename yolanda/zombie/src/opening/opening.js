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
import { LIFTS, OR_TABLE } from '../core/chapter.js';
const TX = OR_TABLE.x, TZ = OR_TABLE.z; // the operating table (head north at TZ - 0.82, feet south at TZ + 0.82)
const LIFT7 = LIFTS[7]; // the OR's lift, on its back (north) wall: the reveal's doorway
import { Breakthrough } from './breakthrough.js';
import { ikArm } from '../render/ik.js';
import { nameCard } from './comiccard.js';
import { RevealSound } from './revealsound.js';
import { splashCard } from './splash.js';
import { ZombieBurst, lensCrack } from './burst.js';
import { RT, loadTuning } from './revealtune.js';
import { RevealFx } from './revealfx.js';
import { RevealPost, BLOOM_LAYER } from './revealpost.js';
import { RevealStudio } from './studio.js';
import { EXEC_LAUNCH, attackEnd } from '../core/weapons.js';
import { Doctor } from './doctor.js';
const SLOW = 0.42;
// the athlete's bat in the reveal, leaning on the lift's right door housing: its knob against the housing's face (wallZ),
// its barrel on the floor out in front (lean: knob -> barrel)
const REV_BAT = { x: 4.62, wallZ: -10.99, lean: [-0.1, -0.95, 0.3] };
const _ = SLOW; void _; // the walk-out's slow motion (her walk at 42%: a heavy step about every second)
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
    this.near0 = this.camera.near; // (the reveal pulls the near plane in for the head at the lens, and puts it back)
    this.stage = new ClinicStage(this.scene, this.loader);
    this.ui = new OpeningUI();
    if (this.params?.has('splash')) this.splash = splashCard(); // (the test build's splash card: ?splash=1)
    this.sound = new OpeningAudio(this.audio); this.rs = new RevealSound(this.audio);
    this.active = false; this.started = false; this.state = 'PRELOAD'; this.sub = '';
    this.t = 0; this.END = 60; this.timeScale = 1; this.paused = false; this.silent = false;
    this.rig = { ...SHOTS[0].a };
    this.cues = []; this.cueIdx = 0;
    this.cueLog = [];
    this.co = null; this.wait = null; this.timers = []; this.marks = {}; this.runLabel = null; this.frozen = false; this.mode = 'cues'; this.camAnim = null; this.fx = null;
    this.answers = {}; this.animScale = 1; this.finalized = false; this.room1Preview = false; this.poseAnim = null; this.lightK = 1;
    this.fadeColor = '#fff6e6';
    this.reducedFlash = false; this.baseExposure = this.renderer.toneMappingExposure;
    this.bt = new Breakthrough(this.renderer, this.scene, this.camera); this.lineLog = []; this.answers = {};
    addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    addEventListener('blur', () => { if (!this.studio) this.setPaused(true); }); // (the Reveal Studio keeps playing while you click elsewhere)
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
    await loadTuning(); // (the reveal's numbers: revealtune.js, assets/opening/reveal_tuning.json)
    // (2026-10-19, phone checks) ?off=shadow,post,beam,fog,polish,bake,haze turns pieces of the reveal's look off, one link per
    // test on the phone: which one the iPhone draws wrong
    this.offs = new Set((this.params.get('off') || '').split(',').filter(Boolean));
    if (this.offs.has('shadow')) { RT.game.shadow = false; RT.quality.flashShadow = false; }
    if (this.offs.has('post')) RT.quality.post = false;
    if (this.offs.has('beam')) RT.quality.beam = false;
    if (this.offs.has('fog')) RT.quality.softFog = false;
    if (this.offs.has('haze')) RT.game.haze = false;

    this.RT = RT; // (dev/test handle: window.opening.RT)
    try { const rc = await this.loader.loadAsync('assets/opening/yola2_reveal.glb'); this.revClips = { walk: rc.animations.find((a) => a.name === 'reveal_walk') }; } catch (e) { console.warn('reveal clips', e); }
    try { this.burst = new ZombieBurst(this.scene, this.loader); this.burst.bounds = { x0: -7.0, x1: 7.0, z0: -11.05, z1: 0.95 }; await this.burst.load(); } /* (bounds: the OR's walls, core/chapter.js 'or' polygon) */ catch (e) { console.warn('zombie burst', e); this.burst = null; }
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
    // the game's lighting the reveal switches on at the lift (main.js warmStoryLight), compiled over the outbreak floor it lights
    if (this.game?.().warmStoryLight) { this.setBlood(true); await this.game().warmStoryLight(() => this.warmReveal()); this.setBlood(false); }
    this.warmLaunch();
    this.markGlow();
    this.warmByReplay();
    // the doctor hiding in the OR after the hand-off, and his scene with the vaccine case (src/opening/doctor.js): loaded and
    // compiled behind the title, under the game's lighting
    try { this.doctor = new Doctor(this); await this.doctor.load(this.loader); this.doctor.root.visible = this.doctor.case.visible = true; this.renderer.compile(this.doctor.root, this.camera, this.scene); this.renderer.compile(this.doctor.case, this.camera, this.scene); this.doctor.root.visible = this.doctor.case.visible = false; } catch (e) { console.warn('doctor', e); this.doctor = null; }
    this.yola?.setShown?.(false); this.setupDone = true;
    if (this.params.has('studio')) this.studio = new RevealStudio(this); // (the Reveal Studio: combat.html?intro=1&studio=1)
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
    this.setBlood(false); this.yola?.setShown?.(false); this.ensureLights(); this.ensureSmoke(); this.ensureDoorSweep(); this.ensureRevealFx(); this.ensureBelongings(); this.belongings.visible = false;
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
    this.heart = null; this.co = null; this.wait = null; this.timers.length = 0; this.marks = {}; this.frozen = false; this.mode = 'cues'; this.camAnim = null; this.fx = null; this.answers = {};
    this.ui.closeCard(); this.ui.letter(false);
    this.cueLog.length = 0; this.sub = '';
    st.tier = 'starter';
    for (const s of st.tiers) { s.fx = null; for (const [k, h] of Object.entries(s.layers || {})) { h.visible = k === 'starter'; st.setOpacity(h, 1); } }
    this.leaveOR(); this.alarmFx = null; this.ecg = null; this.tweens = []; this.tagPoints = null; this.urgencyTimer = 0; this.sound.alarmOff(); this.sound.flatlineOff(0.05);
    this.sound.stopLine(); this.line = null; this.lineLog.length = 0; this.cardDone = null;
    this.endRide(); this.stopEmptyChair(); if (this.leanedBat) this.leanedBat.visible = false; this.holdBat(null); this.cpr = null; this.revealSwing = null;
    this.revealPose = null; this.sweepT = null; this.setOrLamp(true); this.talkers = null;
    this.revLightOff(); this.standYola(null); this.hideCard(); this.camTrack = null; if (this.smoke) { this.smoke.target = 0; this.smoke.k = 0; this.tickSmoke(0); } this.rs?.stopAll(0.2); this.slowmo = 0; this.revBat?.(false); this.burst?.reset(); this.crackEl?.remove(); this.crackEl = null; this.burstScale = 1; this.shake = 0; this.stepShake = 0; this.patientDown = false; this.launch = null; this.handoff = null; this.brightened = false; this.gameLight = false; this.camera.near = this.near0 ?? 0.5; this.camera.updateProjectionMatrix();
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
    if (this.shake) { const k = this.shake; c.position.x += (Math.random() - 0.5) * k; c.position.y += (Math.random() - 0.5) * k; c.position.z += (Math.random() - 0.5) * k; c.rotateZ((Math.random() - 0.5) * k * 0.6); } // (a jolt: footfalls, the boom, the hit)
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
  // dry-ice smoke from the lift (2026-10-16): a low, thick fog that pours over the threshold and rolls out along the floor.
  // Sprites are unlit, so their brightness follows the reveal's light by hand: dark between flashes, lit by each flash,
  // tinged by the red pulse. Built at load with zero opacity so its shader compiles behind the gate.
  ensureSmoke() {
    if (this.smoke) return;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    for (let i = 0; i < 40; i++) { // a lumpy, wispy puff: many soft blobs of different sizes, densest low in the middle
      const px = 64 + (Math.random() - 0.5) * 70, py = 70 + (Math.random() - 0.5) * 30 - Math.random() * Math.random() * 30, r = 8 + Math.random() * 26;
      const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,255,255,' + (0.1 + Math.random() * 0.16).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    }
    x.globalCompositeOperation = 'destination-in'; const fall = x.createRadialGradient(64, 64, 20, 64, 64, 64); fall.addColorStop(0, 'rgba(0,0,0,1)'); fall.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = fall; x.fillRect(0, 0, 128, 128); // (no hard edge anywhere)
    const tex = new THREE.CanvasTexture(c);
    const g = new THREE.Group(); g.name = 'revealSmoke'; this.scene.add(g);
    const parts = [];
    for (let i = 0; i < 72; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0xffffff, rotation: (Math.random() - 0.5) * 0.3 }); // (a sprite turns after it is squashed: only a slight tilt)
      this.fogShader(m, i);
      const sp = new THREE.Sprite(m); sp.position.set(LIFT7.x, 0.2, -12); sp.center.set(0.5, 0.3); g.add(sp); // (anchored low: the puff sits on the floor instead of being cut by it)
      const wisp = i % 6 === 0; // (a few taller curls rising off the bank)
      parts.push({ sp, life: Math.random(), speed: 0.16 + Math.random() * 0.22, side: (Math.random() - 0.5) * 2.4, h: wisp ? 0.04 : Math.random() * 0.05, size: 0.45 + Math.random() * 0.6, aspect: wisp ? 0.9 : 1.4 + Math.random() * 0.9, flat: wisp ? 0.75 : 0.32 + Math.random() * 0.18, curl: Math.random() * 6.3, spin: (Math.random() - 0.5) * 0.06, wisp });
    }
    this.smoke = { g, parts, k: 0, target: 0 };
  }
  // (2026-10-19, the quality pass) each puff's own shader additions: a rolling noise inside it (two layers drifting at their own
  // speeds: the dry ice churns instead of a still picture sliding about), and soft edges: it fades out where it meets the
  // floor (the hard line where the floor cut it) and as the lens comes close (no puff popping through the low camera). The
  // same program for every puff; switched by uniforms (RT.quality.softFog), so turning it off recompiles nothing
  fogShader(m, i) {
    const U = this.fogU ||= { uTime: { value: 0 }, uNoise: { value: this.fogNoise() }, uSoft: { value: 1 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uSeed: { value: (i * 0.618) % 1 } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWy; varying float vCamD;')
        .replace('gl_Position = projectionMatrix * mvPosition;', 'gl_Position = projectionMatrix * mvPosition; vWy = (inverse(viewMatrix) * mvPosition).y; vCamD = -mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWy; varying float vCamD; uniform sampler2D uNoise; uniform float uTime; uniform float uSeed; uniform float uSoft;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float n1 = texture2D(uNoise, vMapUv * 0.9 + vec2(uTime * 0.035 + uSeed, -uTime * 0.021 + uSeed * 0.7)).r;
          float n2 = texture2D(uNoise, vMapUv * 1.9 + vec2(-uTime * 0.052, uTime * 0.031 + uSeed * 1.3)).r;
          float soft = mix(0.45, 1.4, n1 * 0.6 + n2 * 0.4) * smoothstep(0.0, 0.14, vWy) * smoothstep(0.1, 0.85, vCamD);
          diffuseColor.a = clamp(diffuseColor.a * mix(1.0, soft, uSoft), 0.0, 1.0);`); // (2026-10-19, the user's iPhone: dark green blotches over the floor under the fog) soft reaches 1.4: an alpha over 1 the PC's GPU clamps, the iPhone's blends with a negative (1 - alpha), subtracting the floor behind the puff
    };
    m.customProgramCacheKey = () => 'revealFog';
  }
  // a tileable value noise for the puffs' insides
  fogNoise() {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
    const grid = (cell) => { const n = N / cell, v = Array.from({ length: n * n }, () => Math.random()); return (x, y) => { const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, s = (t) => t * t * (3 - 2 * t), at = (a, b) => v[((b + n) % n) * n + ((a + n) % n)];
      return at(x0, y0) * (1 - s(tx)) * (1 - s(ty)) + at(x0 + 1, y0) * s(tx) * (1 - s(ty)) + at(x0, y0 + 1) * (1 - s(tx)) * s(ty) + at(x0 + 1, y0 + 1) * s(tx) * s(ty); }; };
    const A = grid(32), B = grid(16), C = grid(8);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = A(x, y) * 0.55 + B(x, y) * 0.3 + C(x, y) * 0.15, i = (y * N + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.round(v * 255); im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  smokeKick(x, z, k) { const S = this.smoke; if (!S) return; for (const p of S.parts) { const dx = p.sp.position.x - x, dz = p.sp.position.z - z, dd = Math.hypot(dx, dz); if (dd < 1.3 && dd > 1e-3) { p.ox = (p.ox || 0) + (dx / dd) * k * (1.3 - dd) * 0.5; p.oz = (p.oz || 0) + (dz / dd) * k * (1.3 - dd) * 0.5; p.oy = (p.oy || 0) + 0.06 * k; } } }
  tickSmoke(d) {
    const S = this.smoke; if (!S) return;
    const real = d; d *= this.slowmo || 1; // (slow motion slows the fog too)
    S.k += (S.target - S.k) * Math.min(1, real * (S.target > S.k ? 0.9 : 0.6));
    if (S.k < 0.003 && S.target === 0) { for (const p of S.parts) p.sp.material.opacity = 0; return; }
    const r = this.rl || {}, pulse = 0.5 + 0.5 * Math.sin((r.t || 0) * Math.PI * 2 * 0.55 - Math.PI / 2);
    const lit = 0.05 + 0.55 * Math.min(1, r.flash || 0) + 0.2 * (r.amb || 0) + 0.3 * (r.key || 0), red = RT.noRed ? 0 : 0.35 * (r.red || 0) * (0.4 + 0.6 * pulse);
    const Q = RT.quality; if (this.fogU) { this.fogU.uTime.value += d; this.fogU.uSoft.value = Q.softFog ? 1 : 0; }
    // the backlit glow: fog lying between the lens and the light (the flash behind her) scatters it toward the camera, as real
    // fog does (a forward-scattering lobe: brightest looking straight into the light)
    const sp = this.spot, glowK = Q.glow * (Math.min(1.5, r.flash || 0) + 0.6 * (r.key || 0)) * (sp && sp.intensity > 0 ? 1 : 0), cam = this.camera.position;
    const _v = this._fv ||= new THREE.Vector3(), _l = this._fl ||= new THREE.Vector3();
    const L = LIFT7, z0 = L.cab.minZ + 0.4;
    for (const p of S.parts) {
      p.life += d * p.speed / 3.2; if (p.life > 1) { p.life -= 1; p.side = (Math.random() - 0.5) * 2.4; }
      const t = p.life, out = t * 3.6; // it pours out of the cab and spreads over the floor just beyond the doors (never up to the camera)
      const spread = t < 0.42 ? 0.45 : 0.45 + (t - 0.42) * 3.2;
      // her feet part the fog: anything close is pushed aside and lifted a little, then it settles back
      const st = this.herAt(); const px = L.x + p.side * spread * 0.5, pz = z0 + out;
      if (st) { const dx = px + (p.ox || 0) - st.x, dz = pz + (p.oz || 0) - st.z, dd = Math.hypot(dx, dz); if (dd < 0.75 && dd > 1e-3) { p.ox = (p.ox || 0) + (dx / dd) * (0.75 - dd) * d * 3; p.oz = (p.oz || 0) + (dz / dd) * (0.75 - dd) * d * 3; p.oy = Math.min(0.25, (p.oy || 0) + d * 0.2); } }
      const decay = Math.max(0, 1 - d * 0.5); p.ox = (p.ox || 0) * decay; p.oz = (p.oz || 0) * decay; p.oy = (p.oy || 0) * decay;
      const curl = Math.sin(t * 5 + p.curl) * 0.12 * t; // (it rolls and curls as it spreads)
      p.sp.position.set(px + p.ox + curl, p.h * (1 - 0.5 * t) + p.oy + (p.wisp ? t * 0.25 : 0), pz + p.oz);

      const sz = p.size * (0.7 + t * 1.3); p.sp.scale.set(sz * p.aspect, sz * p.flat, 1); p.sp.material.rotation += p.spin * d; // (flat, low: dry ice hugs the floor)
      const fade = Math.sin(Math.min(1, t * 1.15) * Math.PI); // in, then thinning out as it spreads
      p.sp.material.opacity = S.k * (p.wisp ? 0.18 : 0.3) * fade;
      let sc = 0; if (glowK > 0) { _v.subVectors(p.sp.position, cam).normalize(); _l.subVectors(sp.position, p.sp.position); const ld = _l.length(); _l.divideScalar(ld || 1); const c = Math.max(0, _v.dot(_l)); sc = 0.22 * glowK * c * c * c * c * c * c / (1 + ld * ld * 0.12); }
      p.sp.material.color.setRGB(Math.min(1.6, lit + red + sc), Math.min(1.6, lit * 0.95 + red * 0.08 + sc * 0.93), Math.min(1.6, lit * 0.98 + red * 0.08 + sc * 0.82));
      if (sc > 0) p.sp.material.opacity = Math.min(0.9, p.sp.material.opacity * (1 + sc * 0.6));
    }
  }
  setSmoke(on) { if (this.smoke) { this.smoke.target = on === true ? 1 : on === false ? 0 : Math.max(0, +on || 0); if (this.smoke.target > 0) this.smoke.g.visible = true; } } // (true / false, or a level: the Studio's smoke dial)
  // Yola 3.0 where the fog should part round her: the standing / flashing model, or the game's view walking out
  herAt() { const s = this.stand; if (s?.shown) return s; const r = this.revealPose; return r && this.yola?.outer?.visible !== false && r.shown ? r : null; }
  // the lift's light made visible (revealfx.js): the shaft, dust, the fitting's glow, sparks; and the car's studded floor
  ensureRevealFx() {
    if (!this.rfx) this.rfx = new RevealFx(this.scene, LIFT7);
    this.rfx.dressFloor(Object.entries(this.arena.doorKits || {}).filter(([k]) => /^lift\d/.test(k)).map(([, v]) => v));
  }
  // the car's light passing the crack under the shut doors, left to right: a bright line along the gap and a soft pool
  // spilling onto the floor in front of it (built at load with zero opacity; run once as the car arrives)
  ensureDoorSweep() {
    if (this.sweepFx) return;
    const L = LIFT7, add = (mat) => { mat.transparent = true; mat.opacity = 0; mat.depthWrite = false; mat.blending = THREE.AdditiveBlending; mat.toneMapped = false; return mat; };
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(0.4, 'rgba(255,220,170,0.45)'); gr.addColorStop(1, 'rgba(255,210,160,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(c);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.022), add(new THREE.MeshBasicMaterial({ color: 0xfff3dc, map: glowTex })));
    line.position.set(L.x, 0.011, -11.085);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), add(new THREE.MeshBasicMaterial({ color: 0xffe2b8, map: glowTex })));
    pool.rotation.x = -Math.PI / 2; pool.position.set(L.x, 0.006, -10.9);
    this.scene.add(line, pool); this.sweepFx = { line, pool, t: -1, dur: 1.5 };
  }
  doorSweep() { if (this.sweepFx) this.sweepFx.t = 0; }
  tickDoorSweep(d) {
    const S = this.sweepFx; if (!S || S.t < 0) return;
    S.t += d; const u = S.t / S.dur, a = u < 1 ? Math.sin(Math.min(1, u) * Math.PI) : 0, x = LIFT7.x - 1.15 + 2.3 * Math.min(1, u);
    S.line.position.x = x; S.pool.position.x = x; S.line.material.opacity = a; S.pool.material.opacity = a * 0.55;
    if (u >= 1) { S.t = -1; S.line.material.opacity = S.pool.material.opacity = 0; }
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
    // Yola from behind the visitors, looking down between their heads (over the monitor; no head ever between the lens and her)
    const ON_YOLA = this.headShot(yo, 2, 2.6, 27, -0.05), ON_YOLA_CLOSE = this.headShot(yo, 2, 2.2, 25, -0.05);
    // held angles (2026-10-17: no push-in on every line): a cut, then the frame stays put
    cut(ON_YOLA); yield* this.say('02');
    cut(ON_PATIENT); yield* this.say('03');
    cut(OFFICE_CLOSE); yield* this.say('04', { pause: 0.2 });
    cut(ON_PATIENT); yield* this.say('05');
    cut(ON_YOLA_CLOSE); yield* this.say('06', { pause: 0.2 });
    cut(ON_PATIENT_CLOSE); yield* this.say('07', { pause: 0.55 });
    cut(OFFICE_SHOT); yield* this.say('08');
    cut(ON_PATIENT); yield* this.say('09');
    // "I see the test results here": her eyes go down to the chart
    cut(ON_YOLA_CLOSE);
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
    // (through the doorway, not its frame: in on the centre lines either side of the chair, then apart inside the cab)
    yo.walk([[cx - 0.45, -5.45], [cx - 0.45, -6.6], [cx - 0.95, -7.1]], { endYaw: 0 });
    sg.walk([[cx + 0.45, -5.55], [cx + 0.45, -6.6], [cx + 1.0, -7.1]], { endYaw: 0 });
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
    // (out through the doorway, not its frame: Yola and the guard step to the centre lines and go first, the chair follows)
    yo.walk([[L.x - 0.45, -11.7], [L.x - 0.45, -10.4], [1.4, -7.2]], { endYaw: Math.PI });
    sg.walk([[L.x + 0.45, -11.7], [L.x + 0.45, -10.4], [4.6, -6.0]], { endYaw: -Math.PI / 2 });
    this.later(0.9, () => this.roll([[L.x, -10.0], [L.x, -6.6]], { speed: 0.85, endYaw: 0 }));
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
    bb.sitState = 'stand'; bb.seated = false; bb.root.position.y = 0; bb.play('Idle', { fade: 0 }); bb.lie(TX, 1.07, TZ + 0.85, 0); // supine, head to the north (the anesthesia end, under the headwall)
    // Yola at his head on the workstation side (west), the anesthesia colleague at his head (east), the surgeon and the nurse
    // either side of the knee: the camera's side (south-east) stays open
    toWorld(yo, TX - 0.85, TZ - 0.95, Math.PI / 2 - 0.35); yo.play('patient', { fade: 0 }) || yo.play('idle', { fade: 0 });
    toWorld(co, TX + 0.85, TZ - 1.1, -Math.PI / 2 + 0.35); co.play('Idle', { fade: 0 });
    toWorld(su, TX + 0.85, TZ + 0.55, -Math.PI / 2); su.play('Idle', { fade: 0 }); su.setVisible(true);
    toWorld(ta, TX - 0.85, TZ + 0.65, Math.PI / 2); ta.play('Idle', { fade: 0 }); ta.setVisible(true);
    this.ui.showMonitor(true); this.ui.monitor({ mode: 'normal', hr: 74, spo2: 99, status: 'SINUS', alarm: false, tof: null }); this.monitorOn = true;
    this.camTo(W(TX + 0.4, 0.95, TZ, 46, 35, 6.0), 0.01);
    this.mark('or-prepared');
    yield 0.8;
    // 17-19: at his head; then Card 2 at the anesthesia workstation
    this.substate = 'PREP';
    this.camTo(W(TX, 1.0, TZ - 0.6, 30, 30, 3.6), 1.2);
    yield* this.say('17', { pause: 0.25 }); yield* this.say('18'); yield* this.say('19', { pause: 0.4 });
    this.camTo(W(TX - 1.1, 1.05, TZ - 0.6, 34, 30, 4.2), 1.2);
    yo.walk([[TX - 0.95, TZ - 0.5]], { endYaw: -Math.PI / 2 - 0.2 }); yield this.arrived(yo); yo.play('machine', { fade: 0.25 }) || yo.play('idle');
    this.ui.tag('equip', 'Anesthesia workstation', 'Equipment'); this.pointAt('equip', TX - 1.7, 1.8, TZ - 0.95);
    yield* this.card('equip');
    this.ui.tag('equip', null);
    this.ui.monitor({ tof: { ratio: null, twitches: [0, 0, 0, 0] } }); // the quantitative monitor on the adductor pollicis: connected, ready
    yield 0.3;
    yield* this.say('20', { pause: 0.2 });
    yo.walk([[TX - 0.85, TZ - 0.95]], { endYaw: Math.PI / 2 - 0.35 }); yield this.arrived(yo); yo.play('patient', { fade: 0.25 }) || yo.play('idle');
    this.camTo(W(TX, 1.0, TZ - 0.6, 30, 30, 3.6), 1.0);
    yield* this.say('21', { pause: 0.5 });
    // later: the surgical team operates on the knee; Yola manages the anesthesia at his head
    this.substate = 'PROCEDURE';
    yield* this.timeCut(TIME_CARDS.later, 1.1);
    su.play('Work', { fade: 0 }) || su.play('Idle'); ta.play('Work', { fade: 0 }) || ta.play('Idle'); yo.play('monitor', { fade: 0 }) || yo.play('idle');
    this.camTo(W(TX + 0.4, 0.95, TZ, 46, 35, 6.0), 0.01); this.camTo(W(TX + 0.3, 0.95, TZ, 46, 35, 5.4), 3.5);
    yield 1.4;
    su.play('Idle', { fade: 0.4 }); ta.play('Idle', { fade: 0.4 });
    // 22 and Card 3: the quantitative reading after rocuronium
    this.substate = 'RECOVERY_CHECK';
    yield* this.say('22', { pause: 0.3 });
    this.ui.monitor({ tof: { ratio: 0.78, twitches: [1, 0.93, 0.86, 0.78] } });
    this.camTo(W(TX + 0.6, 1.05, TZ - 0.9, 34, 30, 4.0), 1.0);
    yield 0.6;
    yield* this.card('monitor');
    yield* this.say('23', { pause: 0.4 });
    // complete reversal, a few minutes, check again: 0.96 and the other criteria, then extubation
    yield* this.timeCut(TIME_CARDS.reversal, 1.0);
    this.ui.monitor({ tof: { ratio: 0.96, twitches: [1, 0.99, 0.975, 0.96] } });
    this.camTo(W(TX + 0.2, 1.0, TZ - 0.4, 40, 30, 4.6), 0.01);
    this.ui.readiness(READINESS, 0);
    for (let i = 1; i <= READINESS.length; i++) { yield 0.42; this.ui.readiness(READINESS, i); if (!this.silent) this.sound.monitorBeep(); }
    yield 0.35; this.ui.readiness(READINESS, READINESS.length, true); if (!this.silent) this.sound.confirm();
    this.mark('recovered');
    yield 1.6; this.ui.readiness(null); this.ui.monitor({ tof: null });
    // the handoff (24-26): the colleague takes over at the bedside (he stays with the patient); Yola thanks him and goes
    this.substate = 'HANDOFF';
    co.walk([[TX + 0.6, TZ - 1.25]], { endYaw: -Math.PI / 2 - 0.6 });
    yo.turnTo(Math.PI / 2 + 0.3); yo.play('handoff', { fade: 0.3 }) || yo.play('idle');
    this.camTo(W(TX, 1.0, TZ - 1.0, 28, 30, 3.4), 1.0);
    yield* this.say('24'); yield* this.say('25'); yield* this.say('26', { pause: 0.2 });
    // (both leave between the head of the table and the workstation: no path through the furniture)
    su.walk([[TX + 1.1, TZ + 1.4], [-5.4, -5.0], [-8.0, -4.1]]); // the surgeon leaves too; the anesthesia colleague and the nurse stay
    yo.walk([[TX - 1.0, TZ + 1.4], [-5.6, -4.6], [-7.8, -4.2]]); // (round the foot of the table and out of the door to Supply)
    co.walk([[TX + 0.85, TZ - 1.1]], { endYaw: -Math.PI / 2 + 0.35 }); // back at his head, watching him and the monitor
    ta.walk([[TX - 0.85, TZ + 0.3]], { endYaw: Math.PI / 2 });
    this.camTo(W(TX + 0.3, 0.95, TZ + 0.5, 46, 35, 7.2), 1.6);
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

  // ================================================================== ACT 4 + THE REVEAL (the approved 2026-10-16 beat sheet)
  // The lights die with the patient: each alarm pulse takes some of the room's light, then it fails to red emergency light
  // and a flickering tube. The elevator is near black: flashes from a failing light outside the doors show a standing
  // silhouette, the original toon Yola and Yola 3.0 in the same standing pose, the hall's surfaces flipping clean / outbreak
  // with them. She walks out (the bat, her feet, all of her), the frame freezes into a comic card, and the game snaps back:
  // music, emergency light, control. Real light throughout (no painted shadows); Soft light swaps every flash for a swell.
  *act4() {
    const st = this.stage, A = st.actors, bb = A.baseball, co = A.teamB, ta = A.teamA;
    const head = { x: TX, z: TZ - 0.85 }, body = { x: TX, z: TZ - 0.3 }, face = (a, p = body) => Math.atan2(p.x - a.x, p.z - a.z);
    this.state = 'STABLE'; this.substate = 'BEAT';
    this.setOrLamp(false); this.revLight({ amb: 1, red: 0, tube: 0, exposure: 1, redAt: 'or', spotAt: 'tube' });
    this.camTo(W(TX + 0.5, 0.9, TZ + 0.3, 46, 35, 7.0), 2.0); // the OR's ordinary elevated view
    for (let i = 0; i < 3; i++) { if (!this.silent) this.sound.monitorBeep(); yield 0.75; }
    // BEAT 1: the alarm; the staff check him and the equipment at once; every pulse of the alarm takes some of the light
    this.state = 'EMERGENCY'; this.substate = 'B1_FLATLINE'; this.mark('beat1');
    this.ui.monitor({ mode: 'irregular', hr: '---', status: 'ALARM', alarm: true, bp: 'BP ---' }); // (no stale pressure beside a failing trace)
    if (!this.silent) { this.sound.setMusicLevel(0, 1.2); this.sound.alarmOn(0.75); }
    this.tween(4.2, (k) => { const step = Math.floor(k * 6) / 6, blip = (k * 6) % 1 < 0.12 ? 0.08 : 0; this.revLight({ amb: 1 - 0.5 * step - blip, red: 0.3 * k }); });
    co.turnTo(face(co, { x: TX + 1.45, z: TZ - 1.5 })); // to the monitor
    ta.walk([[TX - 0.6, TZ - 0.55]], { endYaw: face({ x: TX - 0.6, z: TZ - 0.55 }, head) });
    this.camTo(W(TX, 0.95, TZ - 0.4, 32, 30, 4.4), 4.2);
    yield* this.say('27', { pause: 0.1 });
    ta.adjust('chk', 'upper_armR', -0.9, 0, -0.2); ta.adjust('chkF', 'forearmR', -0.6, 0, 0); this.tween(0.5, (k) => { ta.adj.chk.w = ease(k); ta.adj.chkF.w = ease(k); });
    co.play('Work', { fade: 0.2 }) || co.play('Idle');
    yield 1.6;
    this.ui.monitor({ mode: 'flat', hr: 0, spo2: '--', status: 'NO PULSE', bp: 'BP ---' });
    if (!this.silent) { this.sound.alarmOff(); this.sound.flatlineOn(); }
    yield* this.say('28', { pause: 0.15 });
    this.substate = 'B1_RESPONSE';
    delete ta.adj.chk; delete ta.adj.chkF;
    ta.adjust('cprL', 'upper_armL', -1.25, 0, 0.3); ta.adjust('cprR', 'upper_armR', -1.25, 0, -0.3);
    this.cpr = { a: ta, t: 0 };
    yield 1.6; // (a readable beat before he moves)
    // BEAT 2: from the foot of the bed, the room half dark: he sits up, his skin going green (nothing but the sit-up)
    this.substate = 'B2_MOVES'; this.mark('motion');
    this.revLight({ amb: 0.42, red: 0.42 }, 0.4);
    this.camTo({ x: TX, y: 1.3, z: TZ - 0.35, pitch: 20, yaw: 12, dist: 4.1, fov: 40 }, 0.01);
    this.camTo({ x: TX, y: 1.38, z: TZ - 0.4, pitch: 16, yaw: 8, dist: 3.5, fov: 40, roll: 0.04 }, 4.0);
    bb.adjust('hand', 'forearmR', 0, 0, -0.5, 0); this.tween(0.9, (k) => { bb.adj.hand.w = Math.sin(k * Math.PI * 3) * 0.6 + ease(k) * 0.4; });
    yield 0.8;
    this.sitUp(bb, 2.6); this.greenTo(bb, 3.0);
    if (!this.silent) { this.sound.flatlineOff(1.2); this.audio.play('groan', 0.6); }
    yield 2.4;
    // BEAT 3: the staff turn to him first, then speak, then back away; the lights fail: red emergency light and a dying tube
    this.substate = 'B3_NOTICE';
    this.cpr = null; delete ta.adj.cprL; delete ta.adj.cprR;
    ta.turnTo(face(ta)); co.turnTo(face(co));
    this.camTo(W(TX + 0.3, 1.0, TZ, 26, 32, 5.4), 1.4);
    this.later(0.5, () => { this.scene.background = new THREE.Color(0x0b1013); this.arena.outPlane?.material.color.set(0x0b1013); });
    if (!this.silent) this.later(0.55, () => { this.rs.powerDown(); this.rs.bedStart(0.45); });
    this.tween(1.8, (k) => { const f = k < 0.25 ? 0.42 : k < 0.33 ? 0.06 : k < 0.45 ? 0.3 : k < 0.52 ? 0.02 : k < 0.62 ? 0.16 : 0.03; this.revLight({ amb: f, red: 0.42 + 0.3 * k, tube: k > 0.5 ? 1 : 0 }); if (k > 0.3 && k < 0.34 && !this.silent) this.sound.flicker?.(true); });
    yield 0.8;
    yield* this.say('29', { pause: 0.1 });
    this.backAway(ta, TX - 1.15, TZ + 1.1, 1.3, body); this.backAway(co, TX + 1.85, TZ - 0.5, 1.3, body);
    yield 1.0;
    // BEAT 4: the call for Yola; the red builds; his growl; a hard cut to black on the last word
    this.substate = 'B4_CALL';
    this.revLight({ amb: 0.03, red: 0.85, tube: 1 }); if (!this.silent) this.rs.bedLevel(0.75);
    if (!this.silent) this.audio.play('groan', 1.1);
    yield* this.say('30', { pause: 0.1, alarm: true });
    yield* this.say('31', { pause: 0.0, alarm: true });
    if (!this.silent) { this.ui.setFadeColor('#000000'); this.ui.setFade(1, 0); }
    this.ui.showMonitor(false); this.monitorOn = false; if (!this.silent) { this.sound.alarmOff(); this.sound.flatlineOff(0.1); }
    this.mark('get-yola-done');
    yield 0.45;
    yield* this.reveal();
  }

  *reveal() {
    const st = this.stage, A = st.actors, L = LIFT7, g = this.game(), old = A.yola, R = RT;
    const toWorld = (a, x, z, yaw) => st.actorToWorld(a, x, z, yaw);
    const cabX = L.x, cabZ = -12.7;
    const doorShot = (dist = 4.6) => ({ x: L.x, y: 1.15, z: -11.3, pitch: 2, yaw: 0, dist, fov: 40 }); // level, front-on: the doorway fills the frame
    this.state = 'REVEAL'; this.brightened = false; this.handoff = null; this.launch = null;
    // BEAT 5: out of black onto the shut doors, almost dark; a red pulse washes across them; up to the indicator: 6 -> 7
    this.substate = 'B5_DOORS'; this.mark('beat5');
    this.liftDisp3.set('6', '▲'); this.setLift3(0); this.scene.background = new THREE.Color(0x05080a);
    // (2026-10-19, the user: the better lighting "should begin the moment the camera cuts to the elevator"): from here the scene
    // runs on the game's own lighting (main.js revealLight: the baked floor light, the fittings, EXIT signs, the polished floor,
    // Yola's shadow, the emergency look, haze), each phase's dials a dimmer over it (1 = the game exactly)
    this.gameLight = !!RT.game.on; if (this.gameLight) this.arena.setEmergency?.(true, 0);
    this.phase('doors', { tube: 0, redAt: 'doors' });
    this.camTo({ x: L.x, y: 0.4, z: -11.0, pitch: 6, yaw: 0, dist: 1.9, fov: 40 }, 0.01);
    this.later(0.25, () => this.doorSweep());
    if (!this.silent) { this.ui.setFade(0, 600); this.rs.liftArrive(); this.rs.bedLevel(0.5); this.rs.cueStart(3.1, { k: RT.music.preLevel, attack: 1.2, open: 650, strings: 0.04 }); } // (the music under the whole reveal: low and dark on the shut doors; cut dead on the DING)
    this.camTo({ x: L.x, y: 0.45, z: -11.0, pitch: 5, yaw: 0, dist: 1.75, fov: 40 }, 3.1); // (a slow creep on the shut doors as the car comes up)
    yield 3.1;
    // (2026-10-19, the user: "a camera cut a close up to the number at the same time as the DING!.. hold a beat.. camera cut
    // to a low angle of the floor of the door opening.. lots of fog and smoke.. slowly pan up to old Yola.. before it moves
    // to the light flickers")
    // BEAT 5b: on the DING, a hard cut to the floor number: 7. Held.
    this.substate = 'B5_DING'; this.mark('ding');
    this.camTo(this.dingShot(), 0.01);
    this.liftDisp3.set('7'); if (!this.silent) { this.rs.cueCut(); this.audio.play('liftDing'); this.rs.cutHit(0.6); } // (a hard stop: the DING alone, then the doors and the crackles in silence)
    yield RT.open.dingHold;
    // BEAT 6: the doors part on a low lens at the floor: the fog pours out over the threshold; the camera tilts slowly up
    // through it to the old Yola standing in the dark car, a faint light behind her (the 'open' phase)
    this.substate = 'B6_OPEN'; this.mark('beat6');
    old.stop(); old.targetYaw = null; toWorld(old, cabX, cabZ, 0); old.play('idle', { fade: 0 }); old.waveT = -1; old.setVisible(true); // (no turn left over from the OR)
    this.standYola(cabX, cabZ, 0); this.yola.setShown(false);
    { const lk = this.game().lightkit; if (lk) lk.extraCasters = [old.root]; } // (the old Yola's shadow from the flash too)
    this.phase('open');
    this.camera.near = 0.05; this.camera.updateProjectionMatrix(); // (the lens sits on the floor: the floor right under it was clipped to black; restored at the hand-off)
    if (this.smoke) { this.smoke.g.visible = true; this.smoke.k = Math.max(this.smoke.k, 1.2); for (const q of this.smoke.parts) q.life = Math.random() * 0.8; } this.smokeKick(L.x, -11.6, 1.2); // (the fog was waiting behind the doors: it is already thick, pouring out as they part)
    if (!this.silent) this.rs.doorsOpen();
    this.tween(1.4, (k) => this.setLift3(ease(k)));
    this.heart = { next: this.t + RT.music.heartAt }; // (the user: "the consistent heartbeat" once the doors are about open and she is seen, to the last flash: tickHeart)
    { const O = RT.open, C = new THREE.Vector3(L.x + O.camX, O.camY, O.camZ), T0 = new THREE.Vector3(L.x, O.startY, O.startZ), T1 = new THREE.Vector3(cabX, O.endY, cabZ), t0 = this.t;
      this.camTrack = () => { const u = ease(Math.min(1, Math.max(0, (this.t - t0 - O.tiltDelay) / O.tiltSecs))); return this.lookRig(C, T0.clone().lerp(T1, u), O.fov); }; }
    yield RT.open.tiltDelay + RT.open.tiltSecs + RT.open.hold;
    this.camTrack = null;
    // BEAT 7: the flashes from the failing light at the back of the car show a standing silhouette, the old Yola and
    // Yola 3.0 in turn (the list and its rhythm: RT.flashes, tuned in the Studio), cut on the wide doorway
    this.substate = 'B6_FLASHES'; this.mark('flashes');
    this.camTo(doorShot(), 0.01);
    this.phase('cab');
    const seq = R.flashes.slice().sort((a, b) => a[0] - b[0]), last = seq[seq.length - 1];
    for (const [t, who, k, decay, boom] of seq) this.later(t, () => this.flashOn(who, k, decay || 0, boom));
    for (const [t, shot] of this.flashCuts(seq, cabX, cabZ)) this.later(t, () => { this.camTo(shot, 0.01); if (!this.silent) this.rs.cutHit(); });
    yield (last ? last[0] : 0) + R.flashTail;
    if (RT.music.backAt === 'flash') this.heart = null; // (no boom flash in the list: the heartbeat still stops here; the walk-out starts the music. backAt 'card': it beats on through the walk-out and the jump)
    // (2026-10-19, the user: no cut back to the patient any more, "I think that just doesn't work": the flashes go straight to
    // her walk-out)
    // the hall is the outbreak now (the same architecture): the cast leaves, the floor's zombies stand where they will wake
    this.revealWorld(); old.setVisible(false); this.setOutbreakLook(true);
    // BEAT 9: her feet only, from the floor in front of the cab: she walks out of the fog toward the lens, backlit from the
    // cab, each slowed step landing like a bass hit (the camera takes the jolt); the bat in her hand (R.walk.bat)
    this.substate = 'B9_FEET'; this.mark('beat9');
    const W = R.walk, stopZ = W.stopZ;
    // (the user, 2026-10-19: "the confident walk out.. not sprint out.. the walk from the original opening": her own walk clip,
    // the bat carried in her fist with the game's grip; the game's locomotion read as a run)
    this.revealPose = { stand: true, x: cabX, z: cabZ }; // (the reveal poses her; the game's preview leaves her alone)
    this.standVisible(true); this.stand.bat = W.bat ? 'hang' : 'none'; // ('hang': in her right fist, the barrel down along her leg: tickStand)
    this.standClipWalk(this.revClips?.walk, { x: cabX, z: stopZ }, W.slow, 0.8);
    this.slowmo = W.slow; this.stepShake = W.stepShake;
    if (!this.silent) { this.rs.slowWhoosh(); this.rs.bedStop(1.6); if (RT.music.backAt === 'flash') this.rs.cueStart(7.0); }
    this.phase('walk', { redAt: 'doors', em: true });
    if (R.brighten === 'walk') this.brightenNow();
    // (2026-10-19, the user: "once she walks out of frame, I think the camera should stay still, let her walk out of the frame
    // completely") the lens low on the floor beside her path, looking back into the cab; it never moves. She comes on out of
    // the fog and passes it; the shot holds an empty beat after she has gone (W.empty), W.secs at most
    { const WC = W.cam; this.camTo(this.lookRig(new THREE.Vector3(cabX + WC.side, WC.height, WC.z), new THREE.Vector3(cabX, WC.lookY, cabZ + 0.2), WC.fov), 0.01); }
    { const t0 = this.t; yield () => this.yolaGone() || this.t - t0 >= W.secs; }
    this.stepShake = 0;
    yield W.empty;
    this.camTrack = null;
    // BEAT 10 (optional, R.batShot): the athlete's bat, leaning against the housing beside the doors, red light sliding over it
    if (R.batShot) {
      this.substate = 'B10_BAT'; this.mark('beat10');
      this.phase('batShot');
      this.revBat(true);
      this.camTo({ x: REV_BAT.x - 0.05, y: 0.5, z: -10.6, pitch: 4, yaw: -28, dist: 1.6, fov: 40 }, 0.01);
      this.camTo({ x: REV_BAT.x - 0.05, y: 0.55, z: -10.6, pitch: 3, yaw: -24, dist: 1.25, fov: 40 }, 1.7);
      yield 1.7;
      this.revBat(false);
    }
    // BEAT 11: the launch (the game's jump finisher, core/weapons.js EXEC_LAUNCH): she springs at the lens, the patient
    // lurching at her out of the dark between her and the camera
    this.substate = 'B11_LAUNCH'; this.mark('beat11');
    this.slowmo = 0;
    const plan = this.planLaunch(), Z = this.burst?.ready ? this.burst : null;
    if (!plan) { yield 0.5; this.finalize('normal'); return; } // (no finisher clips loaded: straight to the game)
    const LA = R.launch, Lc = LA.cam, P = plan;
    this.camera.near = 0.05; this.camera.updateProjectionMatrix(); // (the head comes right up to the lens)
    this.phase('launch');
    // (2026-10-19, the user: "randomly he'll be on top of her... like he started walking too early"): he no longer walks on
    // his own clock. One clock for both: hers, from -hold (standing set) through the strike; his place on the way in is
    // worked out from it every frame (tickLaunch), so a stalled frame can never let him get ahead of her
    const t0 = (LA.coil.on ? LA.coil.from : 0) - LA.hold; // (the coil shot opens already going down: from, seconds into her clip)
    this.launch.t = t0; this.launch.rate = 1;
    for (let i = 0; i < 8; i++) this.poseRevealYola(1 / 30); // (the game blends from her walk into the finisher over ~0.12 s: done before the shot opens, so its first frame is the coil, not a stride)
    // (2026-10-19) a speed ramp into the freeze: full speed through the crouch, easing into slow motion as she leaves the
    // ground (rampAt after liftoff, over rampLen of her clip), the spin in slow motion (rampSlow), then the freeze
    this.launch.ramp = { from: P.liftoff + LA.rampAt, len: Math.max(0.02, LA.rampLen), slow: LA.rampSlow };
    // (2026-10-19, the user: "it shouldn't freeze but maybe slow for that moment.. and it should be at the peak of her jump")
    // the card comes at the top of her jump (peakLead moves it), time slowed to cardSlow, never stopped
    // the slow speed (cs, capped so the slowed swing covers at most 80% of what is left before the blow: it never lands under
    // the card) arrives at the top (tk); the easing starts before it (tIn), so she is already slowing as she rises
    const tk = Math.min(P.tc - 0.12, Math.max(P.liftoff, P.tpk + LA.peakLead));
    const cs = Math.max(0.005, Math.min(LA.cardSlow, (0.8 * (P.tc - tk)) / Math.max(0.1, LA.boomToCard + LA.cardHold)));
    const tIn = Math.max(P.liftoff, tk - 0.5 * (1 + cs) * Math.max(0.01, LA.slowIn)), tf = tIn;
    this.launch.card = { from: tIn, len: Math.max(0.005, tk - tIn), slow: cs }; // (on her clip's own clock, rampAt: exact whatever the frame rate)
    this.launch.sfx = { off: P.liftoff - 0.04, spin: P.liftoff + LA.rampAt, spinSecs: this.launchSecs(P.liftoff + LA.rampAt, tf) }; // (the push-off, then the swish over the spin to the card)
    if (Z) {
      const sx = P.zx + P.fwd.x * LA.lunge, sz = P.zz + P.fwd.z * LA.lunge;
      Z.place(sx, sz, P.zyaw); Z.walkV = null;
      Z.play('walk', { timeScale: 1.7, at: 1.2 });
      this.launch.zombie = { Z, sx, sz, ex: P.zx, ez: P.zz, T: LA.hold + P.tc, attackAt: P.tc - 0.7, attacked: false }; this.launch.t0c = P.tc;
      this.dropPatient(); // (the patient on the table is the one coming: he is not there any more)
    }
    // (2026-10-19, the user: "the next frame is her beginning to get low, like she's going to charge her power jump. And then
    // the camera cuts to the angle ... where she's going to hit the zombie") the coil on its own angle, the cut as she leaves
    // the ground (cutAt: seconds of her clip after lift-off), the push on the hit angle arriving with the card
    const tCut = Math.min(tIn - 0.02, Math.max(t0, P.liftoff + LA.coil.cutAt));
    if (LA.coil.on) {
      this.camTo(P.coil, 0.01); this.camTo({ ...P.coil, dist: P.coil.dist - LA.coil.push }, this.launchSecs(t0, tCut));
      this.launch.onCut = { at: tCut, fn: () => { this.camTo(P.cam, 0.01); this.camTo({ ...P.cam, dist: P.cam.dist - Lc.push }, this.launchSecs(tCut, tf)); if (!this.silent) this.rs.cutHit(0.6); } };
    } else { this.camTo(P.cam, 0.01); this.camTo({ ...P.cam, dist: P.cam.dist - Lc.push }, this.launchSecs(-LA.hold, tf)); } // (the push arrives with the card, in real seconds)
    if (!this.silent) this.rs.drum(1.1);
    yield () => this.launch.t >= 0;
    if (!this.silent) this.rs.drum(1.3);
    yield () => this.launch.t >= tIn;
    // BEAT 12: the top of her jump: time all but stopped (cs), the boom, her name card over it
    this.substate = 'B12_CARD'; this.launch.cap = P.tc - 0.03;
    yield () => this.launch.t >= tk - 1e-4;
    this.mark('beat12');
    this.heart = null; // (the heartbeat's last beat was before the boom)
    // (the user: "fake the motion with slow camera pan or slow camera zoom while she's up ... so it's not frozen") the camera
    // keeps drifting through the card: a slow push, a turn around her, a little rise
    { const c = this.rig, D = LA.drift; this.camTo({ ...c, dist: c.dist - D.push, yaw: c.yaw + D.orbit, y: c.y + D.rise }, LA.boomToCard + LA.cardHold + LA.slowOut); }
    this.shake = 0.05; if (this.rl) { this.rl.flash = 0.5; this.rl.flashDecay = 0.3; }
    if (!this.silent) this.rs.freezeHit();
    this.phase('card'); if (R.brighten === 'card') this.brightenNow();
    yield LA.boomToCard;
    this.shake = 0; this.tickRevLight(0);
    this.cardUp = true; // (the Studio's timeline shows it on a still frame too)
    if (!this.silent) { this.showCard(); this.rs.cueHit(); if (RT.music.backAt === 'card') this.rs.cueStart(RT.music.cardSecs, { attack: 0.05, open: 1700, strings: 0.075 }); } // (the user: the heartbeat "up until the big freeze where it shows the final reveal of new Yola. And then that's when the music cuts back on": in with her name, through the hit, out at the hand-off)
    yield LA.cardHold;
    // BEAT 13: the card snaps away, time catches up and the swing lands: the burst, slow motion, the head into the lens
    this.hideCard(); this.cardUp = false;
    this.phase('burst');
    { const L = this.launch, r0 = this.rampAt(L.t); L.card = L.ramp = null; L.cap = null; this.tween(Math.max(0.01, LA.slowOut), (u) => { if (this.substate !== 'B12_CARD') return; const k = r0 + (1 - r0) * ease(u); L.rate = k; this.burstScale = k; this.slowmo = k < 0.999 ? k : 0; }); }
    yield () => this.launch.t >= P.tc;
    this.substate = 'B13_HIT'; this.mark('hit');
    if (R.brighten === 'burst') this.brightenNow();
    if (Z) {
      const tip = this.batTip(), next = this.batTip(P.tc + 1 / 30);
      const swing = next.clone().sub(tip).setY(0); if (swing.lengthSq() < 1e-6) swing.copy(P.fwd); swing.normalize();
      const dir = swing.multiplyScalar(0.6).add(P.fwd.clone().multiplyScalar(0.7)).normalize(); // (he goes with the bat and away from her)
      this.shake = 0.07; this.camAnim = null; if (this.rl) { this.rl.flash = 0.45; this.rl.flashDecay = 0.25; }
      if (!this.silent) { this.rs.smash(); this.rs.slowDown(); if (RT.game.impact) this.game().atmos?.impactFrame?.(); } // (the game's impact frame: render/atmos.js)
      this.lensHit = false; this.setCamera();
      Z.burst(tip, dir, this.camera, { headSecs: LA.headSecs, lensDist: LA.lensDist });
      this.patientDown = true;
      this.launch.rate = 0; this.burstScale = 0;
      yield 0.08; // (a hit-stop)
      this.burstScale = LA.slow; this.launch.rate = LA.slow;
      yield () => this.lensHit;
      // the head hits the lens: the glass cracks, it bounces off and drops away
      this.substate = 'B13_LENS';
      { const sp = this.lensAt.clone().project(this.camera); this.crackEl?.remove(); if (Number.isFinite(sp.x + sp.y) && innerWidth > 0) this.crackEl = lensCrack((sp.x * 0.5 + 0.5) * innerWidth, (-sp.y * 0.5 + 0.5) * innerHeight); }
      this.shake = 0.03; const bs = this.burstScale; this.burstScale = 0;
      if (!this.silent) this.rs.lensHit();
      yield 0.06;
      this.burstScale = bs;
      yield LA.after;
    }
    // the camera rises back to the game as she finishes the strike; the music hits; control where she lands
    this.state = 'COMBAT_READY'; this.substate = 'B13_RETURN'; this.mark('return');
    this.launch.rate = 1; this.burstScale = 1;
    this.fadeCrack(); this.setSmoke(false);
    if (!this.silent) { this.rs.cueStop(0.6); g.musicStart?.('combat'); } // (the reveal's music out as the camera rises to the game: gone before the player has control)
    this.brightenNow();
    this.handoff = { x: P.landX, z: P.landZ, yaw: P.h };
    this.setCamera(); const fromPos = this.camera.position.clone(), fromQuat = this.camera.quaternion.clone(), fromFov = this.camera.fov;
    const pose = g.cameraPose(P.landX, P.landZ, P.h);
    this.camera.position.copy(fromPos); this.camera.quaternion.copy(fromQuat); this.camera.fov = fromFov; this.camera.near = 0.05; this.camera.updateProjectionMatrix();
    this.poseAnim = { from: { pos: fromPos, quat: fromQuat, fov: fromFov }, to: pose, t: 0, dur: LA.returnSecs };
    yield () => this.launch.t >= P.end && (!this.poseAnim || this.poseAnim.t >= this.poseAnim.dur); // (her strike played out and the camera arrived)
    this.rs.stopAll(0.05); this.heart = null; // (the moment the game takes over: nothing of the reveal's music left)
    if (this.studio) { this.mark('end'); yield () => false; } // (in the Reveal Studio the last frame holds: its timeline ends here, no hand-off)
    this.finalize('normal');
  }
  // (2026-10-19, the user: "something more cinematic during the flashes"; "a camera cut for every flash could be jarring")
  // three cuts, each in the dark just before the flash that starts a new phrase of the rhythm, so the camera is never seen
  // to move: the wide doorway for the slow exchanges, a low three-quarter for the burst, a closer medium for the slowing
  // clicks, a low hero angle looking up at her for the boom. Each holds (no push). Found from the list itself, so a retimed
  // or regenerated rhythm keeps its cuts: the burst = the first flash followed by a gap under 0.2 s; the clicks = the first
  // gap of 0.15 s or more after the burst at its quickest; the boom = the last flash
  flashCuts(seq, cx, cz) {
    const n = seq.length; if (n < 3) return [];
    const gap = (i) => (i + 1 < n ? seq[i + 1][0] - seq[i][0] : 9);
    let burst = -1; for (let i = 1; i < n - 1; i++) if (gap(i) < 0.2) { burst = i; break; }
    let fast = burst; if (burst > 0) for (let i = burst; i < n - 1 && gap(i) < 0.2; i++) if (gap(i) < gap(fast)) fast = i; // (the burst at its quickest)
    let clicks = -1; if (burst > 0) for (let i = fast + 1; i < n - 1; i++) if (gap(i - 1) >= 0.15) { clicks = i; break; }
    const shots = {
      burst: { x: cx, y: 1.0, z: cz + 0.2, pitch: -4, yaw: 28, dist: 3.6, fov: 38 }, // (low, her front right, through the doorway)
      clicks: { x: cx, y: 1.15, z: cz + 0.2, pitch: 2, yaw: -16, dist: 2.6, fov: 36 }, // (closer, from her front left)
      boom: { x: cx, y: 1.15, z: cz, pitch: -14, yaw: 8, dist: 2.0, fov: 40 }, // (low and close, looking up at her and the bat)
    };
    const at = (i) => Math.max(0, seq[i][0] - 0.02); // (the darkest moment: just before the flash)
    const out = [];
    if (burst > 0) out.push([at(burst), shots.burst]);
    if (clicks > burst && clicks < n - 1) out.push([at(clicks), shots.clicks]);
    out.push([at(n - 1), shots.boom]);
    return out;
  }
  // a camera at C looking at T (the opening's rig is a target, an angle and a distance)
  // (2026-10-19, the user's Floor Lab: combat.html?intro=1&studio=1&lab=1) the layers the user switches off to find what the
  // iPhone draws wrong on the floor: applied every frame over whatever the reveal set (main.js calls it before each picture)
  labApply() {
    const L = this.lab; if (!L) return;
    const g = this.game(), lk = g.lightkit, at = g.atmos, A = this.arena;
    if (this.smoke) this.smoke.g.visible = !L.fog;
    if (this.rfx && L.beam) this.rfx.visible = false;
    if (lk?.yshCatch && L.catcher) lk.yshCatch.visible = false;
    if (lk && lk.built?.baked && !!lk.on.baked === !!L.bake) lk.set('baked', !L.bake);
    if (lk && lk.built?.polish && !!lk.on.polish === !!L.polish) lk.set('polish', !L.polish);
    if (at && !!at.on.haze === !!L.haze) at.set('haze', !L.haze);
    if (A.em?.group && L.pools) A.em.group.visible = false;
    RT.noRed = !!L.red; RT.quality.post = !L.post;
    if (L.blood !== this.labBlood) { this.labBlood = L.blood; if (L.blood) this.setBlood(false); }
    if (L.blood) for (const m of this.blood || []) m.visible = false;
    let near = this.camera.near;
    if (L.near) { this.labNear0 ??= near; near = 0.5; } else if (this.labNear0 != null) { near = this.labNear0; this.labNear0 = null; } // (back to what the reveal had set)
    if (this.camera.near !== near) { this.camera.near = near; this.camera.updateProjectionMatrix(); }
  }
  // has she walked out of the shot? (her feet, middle and head, a shoulder's width either side, all off the rig's frame)
  yolaGone() {
    const s = this.stand, Y = this.yola; if (!s || !Y) return true;
    const c = (this.gonecam ||= new THREE.PerspectiveCamera()), r = this.rig, p = THREE.MathUtils.degToRad(r.pitch), y = THREE.MathUtils.degToRad(r.yaw);
    c.aspect = this.camera.aspect || 1; c.fov = r.fov; c.near = 0.05; c.far = 100; c.updateProjectionMatrix();
    c.position.set(r.x + Math.sin(y) * Math.cos(p) * r.dist, r.y + Math.sin(p) * r.dist, r.z + Math.cos(y) * Math.cos(p) * r.dist); c.lookAt(r.x, r.y, r.z); c.updateMatrixWorld(true);
    const hy = Y.bones?.Head ? (Y.outer.updateMatrixWorld(true), Y.bones.Head.getWorldPosition(new THREE.Vector3()).y + 0.12) : 1.7, v = new THREE.Vector3();
    for (const h of [0.05, 0.9, hy]) for (const o of [-0.35, 0, 0.35]) { v.set(s.x + o, h, s.z).project(c); if (v.z < 1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02) return false; }
    return true;
  }
  lookRig(C, T, fov = 40) { const d = C.clone().sub(T), dist = d.length(); return { x: T.x, y: T.y, z: T.z, yaw: THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)), pitch: THREE.MathUtils.radToDeg(Math.asin(d.y / dist)), dist, fov }; }
  // the floor number, close: the display filling most of the frame's width (further back on a narrow portrait screen)
  dingShot() {
    const P = new THREE.Vector3(LIFT7.x, 2.65, -10.93), fov = 32, asp = this.camera.aspect || 1, half = Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * asp);
    const dist = Math.max(0.7, (RT.open.dingWidth / 2) / Math.tan(half));
    return this.lookRig(P.clone().add(new THREE.Vector3(0, -dist * 0.12, dist)), P, fov);
  }
  // the lights that glow in the reveal's picture (revealpost.js, selective): the failing fitting, its sparks, the floor number,
  // the EXIT signs (built by warmStoryLight just before)
  markGlow() {
    const R = this.rfx; if (R) for (const o of [R.halo, R.sparks.obj]) o.layers.enable(BLOOM_LAYER);
    this.arena.doorKits?.lift?.root.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.width === 0.56 && Math.abs(o.position.y - 2.65) < 0.01) o.layers.enable(BLOOM_LAYER); }); // (stage.js liftDisplay: the floor number)
    for (const E of this.game?.().lightkit?.exits || []) { E.m.layers.enable(BLOOM_LAYER); E.halo.layers.enable(BLOOM_LAYER); }
  }
  // the reveal's own picture (revealpost.js: bloom, a film finish) from the cut to the lift to the hand-off; false: the game's
  renderFrame(force = false) {
    if (!force && !(this.active && this.gameLight && RT.quality.post)) return false;
    (this.post ||= new RevealPost(this.renderer, this.scene, this.camera)).render(RT.quality); return true;
  }
  // (2026-10-19, the quality pass) her shadow thrown by the flash: the game's own shadow light for Yola (render/lightkit.js:
  // one light that only casts, a catcher under her; no light added, nothing recompiles) swung round to come from the flash
  // behind her, its window widened along the floor toward the lens, the shadow as dark as the flash is bright
  aimFlashShadow(off = false) {
    const lk = this.game?.().lightkit, L = lk?.ysh, C = lk?.yshCatch, sp = this.spot, r = this.rl, her = this.herAt();
    if (!L || !C) return;
    const B = this.yshBase ||= { half: L.shadow.camera.right, map: L.shadow.mapSize.x, bias: L.shadow.bias, nb: L.shadow.normalBias };
    // (2026-10-19, the user: "why doesn't Yola cast a shadow anymore?") the failing light's shadow only while she is in the lift
    // and walking out of it; from the launch (she is metres out by then: from the back of the car it was a faint streak) the
    // game's own shadow, from the nearest ceiling fitting, short under her (lightkit.tickYShadow)
    const on = !off && !this.launch && !!(this.gameLight && RT.quality.flashShadow && lk.on.yshadow && r?.on && r.spotAt === 'flash' && sp && her);
    const H = on ? 4.5 : B.half, M = on ? 1024 : B.map, cam = L.shadow.camera;
    if (cam.right !== H) { cam.left = cam.bottom = -H; cam.right = cam.top = H; cam.updateProjectionMatrix(); }
    if (L.shadow.mapSize.x !== M) { L.shadow.mapSize.set(M, M); L.shadow.map?.dispose(); L.shadow.map = null; }
    // (2026-10-19, the user's iPhone screenshots: dark blotches over the floor) the flash's light skims the floor from the back
    // of the car: at that angle the phone's shadow depth was not precise enough (shadow acne); a larger bias while it is on
    const rev = !off && this.active; L.shadow.bias = on ? -0.004 : rev ? -0.003 : B.bias; L.shadow.normalBias = on ? 0.09 : rev ? 0.06 : B.nb; // (the game's light in the reveal too: rev)
    if (!on) { C.scale.set(1, 1, 1); return; }
    const to = new THREE.Vector3(sp.position.x - her.x, sp.position.y, sp.position.z - her.z).normalize(), fall = new THREE.Vector3(-to.x, 0, -to.z).normalize();
    const cx = her.x + fall.x * H * 0.7, cz = her.z + fall.z * H * 0.7;
    L.target.position.set(cx, 0, cz); L.position.set(cx + to.x * 6, to.y * 6, cz + to.z * 6); L.target.updateMatrixWorld(); L.updateMatrixWorld();
    C.position.set(cx, 0.014, cz); C.scale.set(H / B.half, 1, H / B.half);
    C.material.opacity = 0.62 * Math.min(1, (r.flash || 0) + (r.key || 0) * 2); // (between flashes the key holds it: at 0.8 it read as no shadow)
    this.renderer.shadowMap.needsUpdate = true;
  }
  // the lights back to the game's (R.brighten says when; once only)
  brightenNow() { if (this.brightened) return; this.brightened = true; this.phase('after', { tube: 0, em: true }); }
  // a phase's light (revealtune.js RT.light[name]): the room, the red, the spotlight and where it hangs, the car's lamps, the
  // exposure, the fog, the shaft and its dust. extra: the beat's own (where the red pulse sits, the emergency base)
  phase(name, extra = {}) {
    const P = RT.light[name]; if (!P) return;
    this.curPhase = name; this.curExtra = extra;
    if (name !== 'after' && this.brightened) return; // (the lights are back: later phases leave them)
    const secs = extra.secs ?? P.secs ?? 0;
    this.revLight({ amb: P.amb, red: P.red, key: P.key, cab: P.cab, exposure: P.exposure, spotAt: P.spotAt, floor: P.floor ?? 1, signs: P.signs ?? 1, emRed: P.emRed ?? 1, chars: P.chars ?? 1, ...extra }, secs);
    this.setSmoke(P.smoke);
    if (this.rfx) { this.rfx.k.beam = P.beam; this.rfx.k.dust = P.dust; this.rfx.k.halo = P.beam * 0.5; }
  }
  // the Studio changed a dial: the current phase again, at once
  studioApply() { if (!this.curPhase) return; const b = this.brightened; if (this.curPhase !== 'after') this.brightened = false; this.phase(this.curPhase, { ...this.curExtra, secs: 0 }); this.brightened = b;
    this.tickRevLight(0); if (this.paused && this.smoke) { this.smoke.k = this.smoke.target; this.tickSmoke(0); } } // (on a held frame too: the clock is stopped, so the light is applied now)
  // the reveal played once, silently, behind the loading screen, one frame drawn at each beat through its own picture chain with
  // the game's lighting as the reveal has it: every shader it will use compiled exactly as it will be used (a separate
  // compile of the scene missed them: the light count differed by one, ~40 compiles then stalled the reveal itself); then
  // the story put back at its start
  warmByReplay() {
    const g = this.game?.(); if (!g?.storyLight || !g.revealLight) return;
    const was = { active: this.active, started: this.started };
    this.active = true; this.beginSilent();
    let n = 0; const draw = () => { g.storyLight(!!this.gameLight); if (g.lightkit) g.lightkit.yshScanT = 0; /* (its casters rescanned now: the old Yola joins them at the doors) */ if (this.gameLight) g.revealLight(0); if (this.room1Preview) g.previewRoom1(0); if (!this.poseAnim) this.setCamera(); this.tickRevLight(0); if (!this.renderFrame(!!this.gameLight)) this.renderer.render(this.scene, this.camera); };
    for (const m of ['beat5', 'ding', 'beat6', 'flashes', 'beat9', 'beat11', 'beat12', 'hit', 'return']) {
      while (!(m in this.marks) && n++ < 40000) this.step(1 / 20);
      for (let k = 0; k < 6; k++) this.step(1 / 30);
      draw();
      for (let k = 0; k < 30; k++) this.step(1 / 30); draw(); // (a second later too: the fog thickened, sparks out)
      if (m === 'flashes') for (const who of ['old', 'new']) { this.flashOn(who, 1, 0, false); this.tickRevLight(0); draw(); } // (both Yolas, the clean and the outbreak hall, in the flash)
    }
    try { this.runFrameWarmDone = true; } finally {
      this.endSilent(); g.storyLight(false);
      this.resetTour(); this.setupScene(); this.active = was.active; this.started = was.started; this.state = 'PRELOAD';
      this.rig = { ...SHOTS[0].a }; this.setCamera(); this.renderer.render(this.scene, this.camera);
    }
  }
  // every material the reveal draws, compiled for the reveal's own picture chain too (revealpost.js draws the scene into an
  // off-screen image: each material needs a second shader for that, and compiling it on first sight stalled the reveal ~40
  // times): run while the game's lighting is on (main.js warmStoryLight), with everyone the reveal shows made visible
  warmReveal() {
    const R = this.renderer, A = this.stage.actors, Z = this.burst?.root, Y = this.yola;
    const shown = [[A.yola?.root, true], [Z, true], [this.rfx?.vol, true], [this.smoke?.g, true]].filter(([o]) => o).map(([o]) => [o, o.visible]);
    for (const [o] of shown) o.visible = true; const yWas = Y?.outer?.visible; Y?.setShown?.(true);
    const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
    try { R.setRenderTarget(rt); R.compile(this.scene, this.camera); } finally { R.setRenderTarget(null); rt.dispose(); }
    for (const [o, v] of shown) o.visible = v; if (!yWas) Y?.setShown?.(false);
  }
  // the launch's contact worked out now (planLaunch keeps it), so the launch's first frame does not pose her ~30 times
  warmLaunch() {
    const P = this.revealPose, L = this.launch;
    try { this.planLaunch(); } catch (e) { console.warn('warm launch', e); }
    this.revealPose = P; this.launch = L; this.yola?.setShown?.(false);
  }
  // the launch, worked out where she stands: the finisher (RT.launch variant + jump), her heading (straight out of the lift,
  // turned by RT.launch.turn), the moment the bat lands (the clip's blow window) and where its sweet spot is then, where the
  // patient stands to take it (RT.launch.gap further on), where she lands, and the camera in front of her across him
  planLaunch() {
    const LA = RT.launch, Y = this.yola, r = this.revealPose;
    const E = EXEC_LAUNCH.find((e) => e.variant === LA.variant && Math.abs(e.dist - LA.jump) < 0.05) || EXEC_LAUNCH.find((e) => e.variant === LA.variant) || EXEC_LAUNCH[0];
    if (!E || !Y?.batLib) return null;
    const A = E.A, total = A.ROOT ? A.ROOT[A.ROOT.length - 1].z : 0;
    const h = THREE.MathUtils.degToRad(LA.turn), fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    const x0 = r ? r.x : LIFT7.x, z0 = r ? r.z : RT.walk.stopZ;
    if (this.stand) this.standYola(null);
    this.revealPose = { x: x0, z: z0, yaw: h, shown: true }; this.yola.setShown(true);
    this.launch = { A, x0, z0, h, fwd, t: 0, rate: 0, scale: LA.reach, id: 9000 + (this.launchN = (this.launchN || 0) + 1) };
    this.revealPose.launch = this.launch;
    // the contact: inside the blow (the clip's last fast window), the moment the bat's sweet spot is furthest out in front of
    // her at his chest-to-head height (the strike is an overhead smash: at the window's start the bat is still behind her head)
    // (worked out relative to where she starts, once per finisher, jump, heading and travel, and kept: the search poses her ~30
    // times, a hitch in the launch's first frame; warmLaunch runs it behind the title screen)
    let liftoff = 0; if (A.ROOT) for (let i = 1; i < A.ROOT.length; i++) { const a = A.ROOT[i - 1], b = A.ROOT[i]; if ((b.z - a.z) / Math.max(1e-6, b.t - a.t) > 3) { liftoff = a.t; break; } } // (she leaves the ground: her travel jumps past 3 m/s; the crouch shuffles a few cm first)
    const key = [LA.variant, LA.jump, LA.turn, LA.reach].join('|'), C0 = (this.contactCache ||= {})[key];
    let tc, best, tipRel, tpk;
    if (C0) ({ tc, best, tipRel, tpk } = C0);
    else {
      tc = A.activeStart; best = -1;
      for (let t = A.activeStart - 0.05; t <= A.activeEnd + 0.05; t += 1 / 120) {
        const p = this.batTip(t), h0 = this.launchAt(t), reach = (p.x - h0.x) * fwd.x + (p.z - h0.z) * fwd.z;
        if (p.y > 0.95 && p.y < 1.75 && reach > best) { best = reach; tc = t; }
      }
      if (best < 0.6) tc = (A.activeStart + A.activeEnd) / 2; // (the search found nothing in reach: the middle of the blow)
      const tp = this.batTip(tc); tipRel = { x: tp.x - x0, y: tp.y, z: tp.z - z0 };
      tpk = this.jumpPeak(liftoff, tc);
      if (best >= 0.6) this.contactCache[key] = { tc, best, tipRel, tpk }; // (a failed search is not kept: behind the title screen her bat may not be in her hand yet)
    }
    const end = attackEnd(A), her = this.launchAt(tc), tip = new THREE.Vector3(x0 + tipRel.x, tipRel.y, z0 + tipRel.z);
    // he stands where the blow lands, pushed on along her heading by gap (his chest takes the bat, not her body), and never
    // nearer her than MIN_GAP (the bat's reach, measured: about a metre in front of her at the smash)
    const MIN_GAP = 0.95, reach = Math.max(MIN_GAP, best >= 0.6 ? best : 0) + LA.gap;
    const side = best >= 0.6 ? (tip.x - her.x) * fwd.z - (tip.z - her.z) * fwd.x : 0; // (how far to her side the bat lands)
    const zx = her.x + fwd.x * reach + fwd.z * side, zz = her.z + fwd.z * reach - fwd.x * side, zyaw = Math.atan2(her.x - zx, her.z - zz);
    const land = this.launchAt(end);
    const C = LA.cam, tx = her.x + (zx - her.x) * C.look, tz = her.z + (zz - her.z) * C.look; // (aimed between her where the bat lands and him)
    const asp = this.camera.aspect || 1, kd = asp < 1 ? Math.min(1.7, 0.72 / asp) : 1; // (a portrait phone sees less across: the camera stands back so she and he both fit)
    const cam = { x: tx, y: C.height, z: tz, pitch: C.pitch, yaw: THREE.MathUtils.radToDeg(h) + C.yawOff, dist: C.dist * kd, fov: C.fov };
    // the coil: low and ahead of her, to her side (+: the hit angle's side), close enough that her crouch fills the frame
    const K = LA.coil, sd = Math.sign(C.yawOff || 1), rx = fwd.z * sd, rz = -fwd.x * sd; // (sd: the hit angle's side)
    const coil = this.lookRig(new THREE.Vector3(x0 + rx * K.side + fwd.x * K.front, K.height, z0 + rz * K.side + fwd.z * K.front), new THREE.Vector3(x0 + fwd.x * 0.25, K.lookY, z0 + fwd.z * 0.25), K.fov);
    coil.dist *= kd;
    this.launch.t = 0; this.poseRevealYola(0);
    return { A, tc, end, fwd, h, zx, zz, zyaw, cam, coil, landX: land.x, landZ: land.z, liftoff, tpk };
  }
  // (2026-10-19, the user: the card "at the peak of her jump") the top of her jump: when her hips are highest between leaving
  // the ground and the blow (posed every 1/120 s, once per finisher and jump: planLaunch keeps it with the contact)
  jumpPeak(a, b) {
    const hips = this.yola?.bones?.Hips; if (!hips) return a + (b - a) * 0.5;
    const L = this.launch, t0 = L.t, p = new THREE.Vector3(); let best = -1e9, tp = a;
    for (let t = a; t <= b; t += 1 / 120) { L.t = t; this.poseRevealYola(0); this.poseRevealYola(0); hips.updateWorldMatrix(true, false); const y = hips.getWorldPosition(p).y; if (y > best) { best = y; tp = t; } }
    L.t = t0; this.poseRevealYola(0); this.poseRevealYola(0);
    return tp;
  }
  // where she stands at time t of the launch (its own travel, scaled by reach)
  launchAt(t) {
    const L = this.launch, R = L.A.ROOT; let z = 0;
    if (R) { if (t <= R[0].t) z = R[0].z; else if (t >= R[R.length - 1].t) z = R[R.length - 1].z; else for (let i = 1; i < R.length; i++) if (R[i].t >= t) { const a = R[i - 1], b = R[i], u = (t - a.t) / Math.max(1e-6, b.t - a.t); z = a.z + (b.z - a.z) * u; break; } }
    z *= L.scale;
    return { x: L.x0 + L.fwd.x * z, z: L.z0 + L.fwd.z * z };
  }
  // the bat's sweet spot (its ImpactPoint) at time t of the launch (default: now)
  batTip(t) {
    const L = this.launch, bat = this.yola?.batLib?.obj; if (!bat) return new THREE.Vector3();
    const t0 = L.t;
    if (t !== undefined) { L.t = t; this.poseRevealYola(0); this.poseRevealYola(0); }
    bat.updateMatrixWorld(true);
    const ip = bat.getObjectByName('ImpactPoint'), p = ip ? ip.getWorldPosition(new THREE.Vector3()) : (() => { const a = this.batAxis(bat); return a.axis.clone().multiplyScalar(a.len * 0.8).applyMatrix4(bat.matrixWorld); })();
    if (t !== undefined) { L.t = t0; this.poseRevealYola(0); this.poseRevealYola(0); }
    return p;
  }
  // a bat model's long axis in its own frame (toward the barrel), its length to the barrel's end and to the knob (the model
  // changed axis when its grip was refitted: never assume +z)
  batAxis(obj) {
    const AX = (this.batAxes ||= new WeakMap()); if (AX.has(obj)) return AX.get(obj); // (not in userData: a clone would copy it as a plain object)
    const p = obj.position.clone(), q = obj.quaternion.clone(), s = obj.scale.clone(), par = obj.parent;
    par?.remove(obj); obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.setScalar(1); obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj, true); obj.position.copy(p); obj.quaternion.copy(q); obj.scale.copy(s); par?.add(obj); obj.updateMatrixWorld(true);
    const sz = b.getSize(new THREE.Vector3()), k = sz.x > sz.y && sz.x > sz.z ? 'x' : sz.y > sz.z ? 'y' : 'z';
    const lo = b.min[k], hi = b.max[k], sign = Math.abs(hi) >= Math.abs(lo) ? 1 : -1, axis = new THREE.Vector3(); axis[k] = sign;
    const out = { axis, len: sign > 0 ? hi : -lo, knob: sign > 0 ? -lo : hi, radius: Math.max(...['x', 'y', 'z'].filter((a) => a !== k).map((a) => sz[a])) / 2 };
    AX.set(obj, out); return out;
  }
  // the speed ramp at time t of her clip (1: full speed)
  rampAt(t) { const L = this.launch, f = (R) => { if (!R || t <= R.from) return 1; const u = Math.min(1, (t - R.from) / R.len); return 1 - (1 - R.slow) * u * u * (3 - 2 * u); }; return L ? Math.min(f(L.ramp), f(L.card)) : 1; } // (ramp: the old slow-mo in the air; card: the slow-down to the card at the top of her jump)
  // real seconds from clip time a to b at the ramp's speeds (the camera's push lands on the freeze)
  launchSecs(a, b) { let s = 0; for (let t = a; t < b; t += 1 / 240) s += (1 / 240) / this.rampAt(t); return s; }
  tickLaunch(d) {
    const L = this.launch; if (!L) return;
    if (L.rate > 0) { const k = this.rampAt(L.t); L.t = Math.min(L.cap ?? attackEnd(L.A) + 0.5, L.t + d * L.rate * k); if (L.ramp || L.card) { this.slowmo = k < 0.999 ? k : 0; if (L.card) this.burstScale = k; } } // (the fog slows with her)
    if (L.onCut && L.t >= L.onCut.at) { const c = L.onCut; L.onCut = null; c.fn(); }
    const F = L.sfx; if (F && !this.silent) { if (F.off != null && L.t >= F.off) { F.off = null; this.rs.launchOff(); } if (F.spin != null && L.t >= F.spin) { F.spin = null; this.rs.spinSwish(Math.max(0.3, F.spinSecs)); } }
    const z = L.zombie; // (his way in, on her clock: from where he starts to where the bat meets him, arriving with it)
    if (z && z.Z.state === 'intact') {
      const u = Math.min(1, Math.max(0, (L.t + z.T - L.t0c) / z.T));
      z.Z.root.position.x = z.sx + (z.ex - z.sx) * u; z.Z.root.position.z = z.sz + (z.ez - z.sz) * u;
      if (!z.attacked && L.t >= z.attackAt) { z.attacked = true; z.Z.play('attack', { fade: 0.25, timeScale: 1.2, loop: false, at: 0.3 }); }
    }
  }

  // ---- the reveal's light: one controller, real lights only ----
  // amb: the room's light (0 dark .. 1 the normal look, against the clean or the emergency base), red: the emergency red
  // pulse (at the OR or the lift doors), tube: a dying cold tube over the table, flash: the failing light outside the lift,
  // cab: the cab's own lamps, exposure: the whole picture (unlit signs and screens dim with it)
  revLight(p, secs = 0) {
    const r = this.rl ||= { amb: 1, red: 0, tube: 0, cab: 1, exposure: 1, flash: 0, key: 0, em: false, redAt: 'or', t: 0, floor: 1, signs: 1, emRed: 1, chars: 1 };
    for (const k of ['amb', 'red', 'tube', 'cab', 'exposure', 'key', 'floor', 'signs', 'emRed', 'chars']) if (p[k] !== undefined) { if (secs > 0) { const a = r[k], b = p[k]; this.tween(secs, (u) => { r[k] = a + (b - a) * ease(u); }); } else r[k] = p[k]; }
    if (p.em !== undefined) r.em = p.em;
    if (p.redAt) { r.redAt = p.redAt; if (this.redLight) { if (p.redAt === 'doors') this.redLight.position.set(LIFT7.x - 1.6, 2.4, -9.6); else this.redLight.position.set(TX + 1.2, 2.8, TZ + 1.2); } }
    if (p.spotAt) r.spotAt = p.spotAt;
    if (p.spotAt && this.spot) { // 'tube': over the table; 'flash': outside the lift, into the cab
      const sp = this.spot, F = RT.flash; if (p.spotAt === 'key') { const a = this.stand || this.revealPose || ROOM1.player; /* (on her, wherever she stands) */ sp.position.set(a.x + 1.1, 2.5, a.z + 2.4); sp.target.position.set(a.x, 0.95, a.z); sp.angle = 0.3; sp.penumbra = 0.6; } else if (p.spotAt === 'tube') { sp.position.set(TX, 2.7, TZ + 0.3); sp.target.position.set(TX, 0.8, TZ - 0.2); sp.angle = 0.9; } else { sp.position.set(LIFT7.x + 0.15, F.height, F.back); sp.target.position.set(LIFT7.x, 0.2, -11.1); sp.angle = F.angle; sp.penumbra = F.penumbra; } // (above and behind her, at the back of the car (RT.flash): rims her, lights the floor in front, leaves her front dark)
      sp.distance = 12; sp.target.updateMatrixWorld(true);
    }
    r.on = true;
  }
  tickRevLight(d) {
    const r = this.rl; if (!r?.on) return;
    r.t += d;
    const A = this.arena, G = this.gameLight && A.em, b = r.em ? { hemi: 0.52, sun: 0.72, env: 0.17 } : this.lightBase || { hemi: 0.8, sun: 1.35, env: 0.32 };
    if (G) { // the game's own look (the emergency grade with the bake's fill: render/arena.js), dimmed: amb the room, emRed its red
      A.em.target = 1; A.tickEmergency(d); // (k = 1, the beacon turning: tickEmergency sets the lights from their base each time, never compounding)
      A.hemi.intensity *= r.amb; A.sun.intensity *= r.amb; this.scene.environmentIntensity *= r.amb;
      const e = A.em, emRed = RT.noRed ? 0 : r.emRed;
      // (2026-10-19, found with the user's Floor Lab: "light pools" off cured the iPhone's floor; a depth offset did not) the
      // emergency light pools painted on the floor are not drawn in the reveal at all (the user: "just remove that ... from the
      // opening"); the game draws them again from the hand-off (tickEmergency shows the group each frame)
      e.group.visible = false; e.redMat.opacity *= emRed; e.redHalf.opacity *= emRed; e.coldMat.opacity *= r.amb; // (RT.noRed: every red in the reveal off, the user's iPhone test)
      const lk = this.game().lightkit, at = this.game().atmos;
      if (lk) { lk.dim.floor = r.floor; lk.dim.signs = r.signs; lk.setCharLight(0.45 * r.chars * r.amb); /* (the game's fill on the characters ignores the scene's darkness: it follows the room light here, so a dark beat keeps its silhouettes) */ if (lk.built.yshadow && lk.on.yshadow !== RT.game.shadow) lk.set('yshadow', RT.game.shadow); }
      if (at && !!at.on.haze !== !!RT.game.haze) at.set('haze', RT.game.haze);
      if (lk && this.offs?.has('polish') && lk.on.polish) lk.set('polish', false); // (?off= phone checks: for the session)
      if (lk && this.offs?.has('bake') && lk.on.baked) lk.set('baked', false);
    } else { if (A.hemi) A.hemi.intensity = b.hemi * r.amb; if (A.sun) A.sun.intensity = b.sun * r.amb; this.scene.environmentIntensity = b.env * r.amb; }
    const pulse = 0.5 + 0.5 * Math.sin(r.t * Math.PI * 2 * 0.55 - Math.PI / 2), soft = this.reducedFlash ? 0.6 : 1;
    const red = RT.noRed ? 0 : r.red, emR = RT.noRed ? 0 : r.emRed;
    if (this.redLight) this.redLight.intensity = red * soft * (1.2 + 7 * pulse);
    if (A.redHemi) A.redHemi.intensity = G ? A.redHemi.intensity * emR * Math.min(1, r.amb * 2) + red * 0.045 * pulse : red * 0.045 * pulse; // (the game's beacon fades with the room light: alone in a dark beat it turned everything red)
    this.ui.setVignette(red * 0.35 * (0.4 + 0.6 * pulse));
    // the opening's spotlight is the dying tube over the table, or the failing light outside the lift (re-aimed per beat:
    // no extra lights in the scene, so gameplay pays nothing for the reveal)
    if (r.flash > 0) r.flash = Math.max(0, r.flash - d / (this.reducedFlash ? 0.7 : r.flashDecay || 0.16));
    const tube = r.tube > 0 ? r.tube * (Math.sin(r.t * 31) * Math.sin(r.t * 7.3) > 0.55 ? 0 : 6 + 3 * Math.sin(r.t * 53)) * soft : 0;
    const flash = 70 * RT.flash.power * (this.reducedFlash ? 0.4 * Math.sin(Math.min(1, r.flash) * Math.PI) : r.flash);
    if (this.spot) this.spot.intensity = tube + flash + (r.key || 0) * 16;
    this.renderer.toneMappingExposure = (this.baseExposure ?? 0.92) * r.exposure;
    // the cab's own lamps (the kit's Warm_Light material): off in the dark scene
    if (!this.cabLamps) { this.cabLamps = []; this.arena.doorKits?.lift?.root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (/Warm_Light/i.test(m.name) && m.emissive) this.cabLamps.push({ m, e: m.emissiveIntensity, c: m.color.clone() }); }); }
    for (const l of this.cabLamps) { l.m.emissiveIntensity = l.e * r.cab; l.m.color.copy(l.c).multiplyScalar(0.15 + 0.85 * r.cab); }
    if (this.rfx) { this.rfx.visible = true; this.rfx.spot = r.spotAt === 'flash' ? this.spot : null; this.rfx.volOn = RT.quality.beam; this.rfx.volK = RT.quality.beamK; this.rfx.update(d, this.reducedFlash ? r.flash * 0.4 : r.flash, RT.flash); } // (the shaft, its dust, the fitting, sparks: revealfx.js)
  }
  revLightOff() {
    const r = this.rl; if (!r) return; r.on = false;
    if (this.redLight) this.redLight.intensity = 0; if (this.spot) this.spot.intensity = 0;
    this.renderer.toneMappingExposure = this.baseExposure ?? 0.92;
    for (const l of this.cabLamps || []) { l.m.emissiveIntensity = l.e; l.m.color.copy(l.c); }
    if (this.rfx) { this.rfx.k.beam = this.rfx.k.dust = this.rfx.k.halo = 0; this.rfx.update(0, 0, RT.flash); this.rfx.visible = false; } // (nothing of it drawn in the game)
    this.aimFlashShadow(true); // (her shadow light back to the game's window and map)
    { const lk = this.game?.().lightkit, at = this.game?.().atmos; if (lk) { lk.dim.floor = lk.dim.signs = 1; lk.setCharLight(0.45); lk.extraCasters = []; if (lk.built.yshadow && this.gameLight) lk.set('yshadow', true); } if (at && this.gameLight) at.set('haze', true); } // (the game's lighting as the game has it)
    this.rl = null;
  }
  // a flash from the failing light outside the doors: one silhouette or the other, the surfaces clean or outbreak with it
  flashOn(who, k, decay, boom) {
    const old = this.stage.actors.yola;
    old.setVisible(who === 'old'); this.standVisible(who === 'new');
    if (RT.flash.swap || boom) this.setOutbreakLook(who === 'new');
    if (this.rl) { this.rl.flash = k; this.rl.flashDecay = decay || RT.flash.decay; } // (the last one fades slowly: she stays)
    this.rfx?.flash(k, this.silent ? 0 : RT.flash.sparks);
    if (boom) { this.shake = 0.05; this.smokeKick(LIFT7.x, -12.2, 1.6); if (RT.music.backAt === 'flash') { this.heart = null; if (!this.silent) this.rs.cueStart(RT.music.buildSecs, { attack: 0.06 }); } } // (backAt 'flash': the last flash, on her: the music slams back in and builds to the card; the walk-out's cueStart finds it running)
    if (!this.silent) { this.sound.flicker?.(true); if (boom) this.rs.flashBoom(); else this.rs.flash(k); }
  }
  setOutbreakLook(on) { this.setBlood(on); this.renderer.shadowMap.needsUpdate = true; }
  // Yola 3.0 standing (her own standing idle clip, the old Yola's standing pose: no combat stance) with the bat at her side;
  // driven on a separate mixer only while she stands, then handed back to the game's view for the walk
  standYola(x, z, yaw) {
    const Y = this.yola; if (!Y) return;
    if (x === null) { if (this.stand) { this.stand.mixer.stopAllAction(); this.stand = null; } return; }
    const clip = (this.game().yolaClips || []).find((c) => c.name === 'tripo_idle');
    const mixer = new THREE.AnimationMixer(Y.model), idle = clip ? mixer.clipAction(clip) : null; idle?.play();
    this.stand = { mixer, idle, x, z, yaw, shown: false };
    this.tickStand(0);
  }
  // the slow walk-out: her walk clip on the legs only, the standing idle above the hips (arms easy, the bat held low by
  // tickStand), moving at the clip's measured ground speed times the slow motion (no foot slide)
  standWalk(goal, slow) {
    const s = this.stand, Y = this.yola; if (!s) return;
    const all = this.game().yolaClips || [], walk = all.find((c) => c.name === 'pistol_walk'), idle = all.find((c) => c.name === 'tripo_idle');
    if (!walk || !idle) return;
    const low = (t) => /^mixamorig(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))\./.test(t.name);
    this.walkLayers ||= { legs: new THREE.AnimationClip('reveal_legs', walk.duration, walk.tracks.filter(low)), upper: new THREE.AnimationClip('reveal_upper', idle.duration, idle.tracks.filter((t) => !low(t))) };
    const legs = s.mixer.clipAction(this.walkLayers.legs), upper = s.mixer.clipAction(this.walkLayers.upper);
    legs.timeScale = slow; upper.timeScale = slow; legs.reset().play(); upper.reset().play(); if (s.idle) legs.crossFadeFrom(s.idle, 0.25, false); upper.setEffectiveWeight(1);
    const speed = (Y.gait?.pistol_walk?.speed || 2.11) * slow, dx = goal.x - s.x, dz = goal.z - s.z, d = Math.hypot(dx, dz) || 1;
    s.walk = { goal, legs, upper, vx: (dx / d) * speed, vz: (dz / d) * speed, dur: walk.duration, last: 0 };
    s.yaw = Math.atan2(dx, dz); s.turn = undefined;
  }
  // where in the walk cycle each heel lands (0..1): the lowest point of each foot, measured once on her rig
  heelStrikes(clip) {
    if (clip.userData?.heels) return clip.userData.heels;
    const Y = this.yola, B = Y?.bones; if (!B?.LeftFoot) return [0, 0.5];
    const mixer = new THREE.AnimationMixer(Y.model), act = mixer.clipAction(clip); act.play();
    const N = 60, L = [], R = [], v = new THREE.Vector3();
    for (let i = 0; i < N; i++) { act.time = (i / N) * clip.duration; mixer.update(0); Y.model.updateMatrixWorld(true); L.push(B.LeftFoot.getWorldPosition(v).y); R.push(B.RightFoot.getWorldPosition(v).y); }
    act.stop(); mixer.uncacheRoot(Y.model);
    const low = (a) => { const mn = Math.min(...a); for (let i = 0; i < N; i++) { const prev = a[(i + N - 1) % N]; if (a[i] <= mn + 0.012 && prev > mn + 0.012) return i / N; } return a.indexOf(mn) / N; }; // (the frame the foot comes down to the floor: the heel strike, not mid-step)
    const heels = [low(L), low(R)].sort((a, b) => a - b);
    (clip.userData ||= {}).heels = heels; return heels;
  }
  // the walk-out on her natural walk (UAL Walk_Loop on her rig: arms swinging, hands empty), at timeScale with the clip's
  // measured ground speed (speed1: metres a second at full speed), so her feet do not slide
  standClipWalk(clip, goal, timeScale, speed1) {
    const s = this.stand; if (!s || !clip) return;
    const act = s.mixer.clipAction(clip); act.timeScale = timeScale; act.reset().play(); if (s.idle) act.crossFadeFrom(s.idle, 0.2, false);
    const sp = speed1 * timeScale, dx = goal.x - s.x, dz = goal.z - s.z, d = Math.hypot(dx, dz) || 1;
    s.cw = { act, goal, vx: (dx / d) * sp, vz: (dz / d) * sp, dur: clip.duration, last: 0, contacts: this.heelStrikes(clip) };
    s.yaw = Math.atan2(dx, dz); s.turn = undefined;
  }
  // the athlete's bat leaning against the lift's right door housing (the opening's static bat: barrel down, knob up, the knob
  // touching the housing's face)
  revBat(on) {
    const src = this.yola?.batLib?.obj || this.stage.guardBat;
    if (!this.revBatObj && on) { this.revBatObj = src.clone(true); this.revBatObj.traverse((o) => { o.visible = true; if (o.isMesh) o.castShadow = true; }); this.scene.add(this.revBatObj); }
    const b = this.revBatObj; if (!b) return; b.visible = on; if (!on) return;
    const ax = this.batAxis(b), d = new THREE.Vector3(...REV_BAT.lean).normalize(); // (d: from the knob down to the barrel)
    b.scale.setScalar(1); b.quaternion.setFromUnitVectors(ax.axis, d);
    // the barrel's end on the floor (its radius up), the knob against the housing
    const y = ax.radius + 0.005 - d.y * ax.len, z = REV_BAT.wallZ + ax.radius + d.z * ax.knob;
    b.position.set(REV_BAT.x, y, z);
  }
  // the patient zombie on the OR table is the one she smashes: out of the game's room
  dropPatient() {
    const g = this.game(), sim = g.sim; if (!sim?.zombies) return;
    const z = sim.zombies.find((q) => q.group === 'or' && q.look === 'patient'); if (!z) return;
    sim.zombies.splice(sim.zombies.indexOf(z), 1);
    const v = g.zviews?.get(z.id); if (v) { v.hide(); g.zviews.delete(z.id); }
  }
  fadeCrack() { const el = this.crackEl; if (!el) return; this.crackEl = null; el.style.transition = 'opacity .7s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 800); }
  standVisible(v) { if (!this.stand) return; this.stand.shown = v; this.yola.setShown(v); if (v) this.tickStand(0); }
  tickStand(dt) {
    const s = this.stand, Y = this.yola; if (!s || !Y) return;
    if (s.walk) {
      const w = s.walk; s.x += w.vx * dt; s.z += w.vz * dt;
      const ph = (w.legs.time % w.dur) / w.dur; // a footfall at each half of the cycle: the step's sound, the drum, the fog kicked aside
      if ((w.last < 0.5 && ph >= 0.5) || ph < w.last) { if (!this.silent) { this.rs.footstep(); this.rs.drum(0.9); this.rs.stepBoom(RT.music.stepBass); } this.smokeKick(s.x, s.z, 0.9); }
      w.last = ph;
      if ((w.goal.x - s.x) * w.vx + (w.goal.z - s.z) * w.vz <= 0) { // arrived: standing again, turning to her mark
        s.x = w.goal.x; s.z = w.goal.z;
        if (s.idle) { s.idle.reset().play(); s.idle.crossFadeFrom(w.legs, 0.5, false); }
        w.upper.fadeOut(0.5); s.turn = w.goal.yaw; s.walk = null;
      }
    }
    if (s.cw) { // the natural walk: footsteps on the cycle's halves, the fog kicked aside
      const w = s.cw; s.x += w.vx * dt; s.z += w.vz * dt;
      const ph = (w.act.time % w.dur) / w.dur, C = w.contacts || [0, 0.5], hit = C.some((c) => (w.last < c && ph >= c) || (ph < w.last && (c > w.last || c <= ph)));
      if (hit) { if (!this.silent) { this.rs.footstep(); this.rs.drum(0.8); this.rs.stepBoom(RT.music.stepBass); } this.smokeKick(s.x, s.z, 0.9); if (this.stepShake) this.shake = Math.max(this.shake || 0, this.stepShake); }
      w.last = ph;
      if ((w.goal.x - s.x) * w.vx + (w.goal.z - s.z) * w.vz <= 0) { s.x = w.goal.x; s.z = w.goal.z; w.vx = w.vz = 0; }
    }
    if (s.turn !== undefined && dt > 0) { const e = Math.atan2(Math.sin(s.turn - s.yaw), Math.cos(s.turn - s.yaw)); s.yaw += e * Math.min(1, dt * 2.5); }
    if (this.revealPose) { this.revealPose.x = s.x; this.revealPose.z = s.z; }
    Y.outer.position.set(s.x, 0, s.z); Y.container.rotation.y = s.yaw; s.mixer.update(dt);

    const bat = Y.batLib?.obj, hand = Y.bones.RightHand;
    if (bat && s.bat === 'none') bat.visible = false;
    else if (bat && s.bat === 'held') { Y.outer.updateMatrixWorld(true); Y.placeHeld(Y.batLib); bat.visible = s.shown; } // (the game's own grip)
    else if (bat && s.bat === 'hang' && Y.batLib.fitWalk) { // (the walk's own grip, the user's in the Rig Lab: alubat@reveal_walk)
      Y.outer.updateMatrixWorld(true); Y.placeHeld(this.walkBat ||= { ...Y.batLib, fit: Y.batLib.fitWalk, fitIdle: null }); bat.visible = s.shown;
    }
    else if (bat && hand) { // in her right fist, the barrel hanging down along her leg, a little forward (the bat's origin is the grip, its barrel +z)
      Y.outer.updateMatrixWorld(true); const hp = hand.getWorldPosition(new THREE.Vector3()), fwd = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      const dir = new THREE.Vector3(0, -0.93, 0).addScaledVector(fwd, 0.36).normalize();
      bat.quaternion.setFromUnitVectors(this.batAxis(bat).axis, dir); bat.position.copy(hp).addScaledVector(dir, 0.02).addScaledVector(fwd, 0.015); bat.scale.setScalar(1); bat.visible = s.shown; // (along the model's own long axis)
    }
  }
  batCentre() { const b = this.yola?.batLib?.obj; return b ? new THREE.Box3().setFromObject(b).getCenter(new THREE.Vector3()) : new THREE.Vector3(this.revealPose.x, 0.8, this.revealPose.z); }
  feetCentre() { const B = this.yola?.bones || {}, a = B.LeftFoot?.getWorldPosition(new THREE.Vector3()), b = B.RightFoot?.getWorldPosition(new THREE.Vector3()); return a && b ? a.add(b).multiplyScalar(0.5) : new THREE.Vector3(this.revealPose.x, 0.1, this.revealPose.z); }
  // the comic freeze card over the frozen frame
  showCard() {
    this.hideCard();
    // (2026-10-19) the name only, over the live picture: the scene keeps moving under it (the slow motion and the camera's
    // drift at the top of her jump; it was a still of the frozen frame)
    const src = this.renderer.domElement;
    const name = nameCard(src.width, src.height, 'YOLA', 'Anesthesiologist. Off shift.');
    const wrap = document.createElement('div'); wrap.className = 'opCard';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:60;pointer-events:none;overflow:hidden';
    for (const [c, anim] of [[name, 'opCardName .22s cubic-bezier(.2,1.6,.4,1) .08s both']]) { c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;animation:${anim}`; wrap.appendChild(c); }
    if (!document.getElementById('opCardCss')) { const st = document.createElement('style'); st.id = 'opCardCss'; st.textContent = '@keyframes opCardIn{from{transform:scale(1.06);filter:brightness(2)}to{transform:none;filter:none}}@keyframes opCardName{from{transform:scale(1.9) rotate(-4deg);opacity:0}to{transform:none;opacity:1}}'; document.head.appendChild(st); }
    document.body.appendChild(wrap); this.freezeEl = wrap;
  }
  hideCard() { this.freezeEl?.remove(); this.freezeEl = null; }
  // Yola 3.0 walking out in the reveal: the game's view, fed the state the game feeds it (bat equipped, her plain walk)
  poseRevealYola(dt) {
    const r = this.revealPose; if (!r || this.stand) return;
    const g = this.game(), slow = r.slow || 1, wd = dt * slow; // (slow: the walk-out in slow motion: her clips and her pace both slowed)
    if (r.goal && (r.vx || r.vz)) {
      const sx = r.x, sz = r.z;
      r.x += r.vx * wd; r.z += r.vz * wd; r.yaw = Math.atan2(r.vx, r.vz);
      if ((r.goal.x - r.x) * r.vx + (r.goal.z - r.z) * r.vz <= 0) { r.x = r.goal.x; r.z = r.goal.z; r.vx = r.vz = 0; r.turn = r.goal.yaw; }
      // a footfall every half stride: the step's sound, the drum, the fog kicked aside, the camera's jolt
      r.stepAt = (r.stepAt || 0) + Math.hypot(r.x - sx, r.z - sz);
      if (r.stepAt >= 0.62) { r.stepAt -= 0.62; if (!this.silent) { this.rs.footstep(); this.rs.drum(0.8); this.rs.stepBoom(RT.music.stepBass); } this.smokeKick(r.x, r.z, 0.9); if (this.stepShake) this.shake = Math.max(this.shake || 0, this.stepShake); }
    }
    if (r.turn !== undefined) { const d = Math.atan2(Math.sin(r.turn - r.yaw), Math.cos(r.turn - r.yaw)); r.yaw += d * Math.min(1, wd * 5); }
    const L = r.launch;
    if (L) { const p = this.launchAt(L.t); r.x = p.x; r.z = p.z; r.yaw = L.h; } // (the launch: its own travel along her heading)
    const s = g.stillState(r.x, r.z, r.yaw);
    s.equipped = 'bat'; s.vx = r.vx || 0; s.vz = r.vz || 0;
    if (L) Object.assign(s, { action: 'swing', swingT: Math.max(0, L.t), swingId: L.id, atk: L.A, combo: 0, ground: false, vx: 0, vz: 0 }); // (the game's own finisher, as the game plays it: its grip, its fits)
    g.yolaPose?.(wd, s);
  }
  // the hospital after the outbreak, committed behind the patient's cut: the same architecture, worn surfaces, blood, the dead
  // lift sign back; the opening's cast leaves and the floor's zombies stand where they will wake
  revealWorld() {
    const g = this.game(), A = this.stage.actors;
    for (const k of ['baseball', 'teamA', 'teamB', 'surgeon', 'security', 'staff']) A[k].setVisible(false);
    this.holdBat(null); this.cpr = null; this.ui.showMonitor(false); this.monitorOn = false;
    this.inOR = true; this.setBlood(true); this.scene.background = new THREE.Color(0x05080a); this.arena.outPlane?.material.color.set(0x1d262c);
    g.applyRoom1(); this.room1Preview = true;
    this.arena.setEmergency?.(true, 0);
    if (this.spot) this.spot.intensity = 0;
    this.setOrLamp(true);
  }
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
    this.revealPose = null; this.sweepT = null;
    this.revLightOff(); this.standYola(null); this.hideCard(); this.camTrack = null; if (this.smoke) { this.smoke.target = 0; this.smoke.k = 0; this.tickSmoke(0); } this.rs?.stopAll(0.05); this.heart = null; this.slowmo = 0; this.revBat?.(false); if (this.burst?.state === 'burst') for (let i = 0; i < 240; i++) this.burst.update(1 / 60); this.crackEl?.remove(); this.crackEl = null; this.burstScale = 1; this.shake = 0; this.stepShake = 0; this.camera.near = this.near0 ?? 0.5; this.camera.updateProjectionMatrix();
    for (const k of ['yola', 'baseball', 'teamA', 'teamB', 'surgeon', 'staff']) A[k].setVisible(false);
    if (this.guardPool) this.guardPool.visible = true; else this.placeGuardPool(); // (his blood and his pistol remain; no body)
    this.endRide(); this.stopEmptyChair(); this.holdBat(null); this.cpr = null; this.revealSwing = null; this.monitorOn = false; this.ui.showMonitor(false); this.ui.readiness(null); this.ui.timeCard('');
    if (this.bt.state === 'flying') { const bt = this.bt; const tick = () => { if (bt.state !== 'flying') return; bt.update(1 / 60); requestAnimationFrame(tick); }; requestAnimationFrame(tick); } else if (this.bt.state !== 'idle') this.bt.finish();
    this.sound.stopLine(); this.sound.stopNarration(); this.sound.stopMusic(0.3);
    if (g.music?.state === 'off') g.musicStart?.('explore'); // (skip / continue / replay: the game's music from the floor's calm state)
    if (via === 'normal') this.later33();
    // the game: the canonical snapshot
    g.applyRoom1(); if (this.patientDown) this.dropPatient();
    const H = via === 'normal' ? this.handoff : null; // (the launch ends where she lands: control starts there, not on the mark)
    if (H && g.sim?.player) { const p = g.sim.player; p.x = p.px = H.x; p.z = p.pz = H.z; p.aimYaw = p.aimTarget = p.pyaw = H.yaw; g.yola?.reset?.(H.x, H.z, H.yaw); g.cameraPose(H.x, H.z, H.yaw); }
    this.handoff = null; this.launch = null;
    g.previewRoom1(0); // (the patient she smashed stays gone)
    this.stillYola = false; this.room1Preview = false; this.active = false; this.state = 'ROOM1_PLAYABLE'; this.substate = via;
    // (PERF_AUDIT.md 5) the reveal's 72 smoke puffs (opacity 0, still drawn every frame) hide once the game has it; setSmoke
    // shows them again for a replay. Its spot and red lights stay: taking a light out of the scene rebuilds every shader
    // (a 2.3 s freeze on the PC, measured), far worse than the ~6% of GPU time they cost at intensity 0
    if (this.smoke) this.smoke.g.visible = false;
    this.ui.show(false); g.hudShow(true);
    try { localStorage.setItem('zc.introSeen', '1'); } catch { /* storage unavailable: the opening just plays next time */ }
    this.mark('room1-playable');
    this.ui.again(true); // (watch the reveal again)
  }
  ambient(dt) { this.doctor?.tick(dt); } // (the level's people: the guard's body does not move; the doctor hides in the OR, then runs: doctor.js)
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
  // ---- the Reveal Studio's timeline: the reveal at time tr (seconds from its first beat), replayed silently from the
  // story's start (about a third of a second), with a fixed random sequence so the same frame looks the same every time;
  // a later frame with nothing changed just steps on from where it is. Held still there (studioHold) until Play.
  studioReset() {
    this.hideCard(); this.cardUp = false; this.crackEl?.remove(); this.crackEl = null; this.ui.again(false); window.chapterUI?.reset?.();
    this.finalized = false; this.batPicked = false; this.active = true; this.started = true; this.ui.show(true);
    this.sound.stopMusic(0.05); this.sound.stopAmbience(); this.rs?.stopAll(0.05); this.game?.().music?.stop(0.05); this.game?.().hudShow?.(false);
    this.setupScene(); this.ui.setFade(0, 0);
  }
  studioRandom(seed) { let a = seed >>> 0; this.scrubRnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  studioRun(fn) { const r = Math.random; Math.random = this.scrubRnd || r; try { this.silent = true; fn(); } finally { Math.random = r; this.silent = false; } }
  // the reveal's beats on the timeline and its length (it holds its last frame in the Studio: mark 'end')
  studioMeasure() {
    this.studioReset(); this.studioRandom(7); this.beginSilent();
    let g = 0; this.studioRun(() => { while (!('get-yola-done' in this.marks) && g++ < 40000) this.step(1 / 20); const t0 = this.t; let n = 0; while (!('end' in this.marks) && n++ < 4000) this.step(1 / 30); this.revealT0 = t0; });
    const t0 = this.revealT0, beats = Object.entries(this.marks).filter(([, t]) => t >= t0).map(([k, t]) => [k, +(t - t0).toFixed(2)]);
    this.endSilent(false); this.scrubT = null;
    return { beats, length: +((this.marks.end ?? t0 + 25) - t0).toFixed(2) };
  }
  studioSeek(tr) {
    const fresh = this.scrubT == null || tr < this.scrubT - 1e-4 || this.scrubDirty || !this.active;
    this.studioHold = true; this.paused = true; this.sound.suspend(true);
    if (fresh) {
      this.studioReset(); this.studioRandom(7); this.beginSilent(); this.cardUp = false;
      let g = 0; this.studioRun(() => { while (!('get-yola-done' in this.marks) && g++ < 40000) this.step(1 / 20); });
      this.revealT0 = this.t; this.scrubT = 0; this.scrubDirty = false;
    }
    this.hideCard();
    this.studioRun(() => { let n = 0; while (this.scrubT < tr - 1e-4 && n++ < 4000 && !('end' in this.marks)) { const d = Math.min(1 / 30, tr - this.scrubT); this.step(d); this.scrubT += d; } });
    this.endSilent(false); this.frozen = false; this.paused = true;
    if (!this.poseAnim) this.setCamera(); this.tickRevLight(0);
    if (this.cardUp) this.showCard();
    return this.scrubT;
  }
  studioPlayOn() { this.scrubT = null; this.studioHold = false; this.paused = false; this.sound.suspend(false); this.sound.unlock?.(); }
  // the reveal on demand: replay the story silently to the calm beat before the flatline (the patient on the table, his
  // colleague at his head, Yola gone down to six), then let it play live with its sound. Works from anywhere, any number of times.
  toReveal(mark = 'handoff-done') {
    this.ui.again(false); window.chapterUI?.reset?.();
    this.finalized = false; this.batPicked = false; this.active = true; this.started = true; this.ui.show(true);
    this.sound.stopMusic(0.1); this.sound.stopAmbience(); this.sound.unlock(); this.rs?.stopAll(0.1);
    this.game?.().music?.stop(0.3); this.game?.().hudShow?.(false); this.setupScene();
    this.runTo(mark, { stopAtLabel: false, maxSec: 900 }); // (the Studio starts later: at a beat of the reveal)
    this.ui.setFadeColor('#000000'); this.ui.setFade(1, 0); requestAnimationFrame(() => this.ui.setFade(0, 700)); // (in from black)
  }
  // dev: replay the whole opening from the start, cleanly
  replay() {
    if (!this.started) return;
    this.ui.again(false); this.finalized = false; this.batPicked = false; this.active = true; this.ui.show(true); this.beginSilent(); this.endSilent();
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
    if (this.splash) { this.splash.ready(() => this.ui.goB.click()); this.splash = null; } // (PLAY on the splash card starts the opening, inside the tap)
    // returning players are never forced through the opening: once seen, the title screen offers to skip it
    let seen = false; try { seen = localStorage.getItem('zc.introSeen') === '1'; } catch { /* storage unavailable */ }
    this.ui.skipGateB.hidden = !seen;
    this.ui.skipGateB.onclick = () => { this.ui.gate.classList.remove('show'); this.sound.unlock(); this.started = true; this.beginSilent(); this.finalize('returning'); };
    // a Floor 3 checkpoint from an earlier session: continue straight from it
    const save = this.game?.().levelSave;
    this.ui.contB.hidden = !save;
    this.ui.contB.onclick = () => { this.ui.gate.classList.remove('show'); this.sound.unlock(); this.started = true; this.beginSilent(); this.finalize('continue'); this.game().applyLevel(save); };
    this.ui.skipB.onclick = () => this.skip();
    // straight to the reveal (the calm beat before the patient flatlines), from the title, mid-opening, or again after play
    const toReveal = (ev) => { ev?.preventDefault?.(); this.ui.gate.classList.remove('show'); this.sound.unlock(); this.toReveal(); };
    this.ui.revealGateB.onclick = toReveal; this.ui.revealB.onclick = toReveal; this.ui.againB.onclick = toReveal;
    this.ui.muteB.onclick = () => { const m = !this.audio.muted; this.audio.setMuted(m); this.ui.muteB.classList.toggle('off', m); if (m) this.sound.stopVoice(); };
    this.ui.flashB.onclick = () => { this.reducedFlash = !this.reducedFlash; this.ui.flashB.classList.toggle('off', !this.reducedFlash); };
    this.ui.flashB.classList.toggle('off', !this.reducedFlash);
    if (this.studio) { this.ui.gate.classList.remove('show'); this.studio.open(); return; } // (the Reveal Studio opens on the reveal's timeline, not the title)
    if (this.params.has('room1')) { this.started = true; this.beginSilent(); this.finalize('direct'); return; } // dev: straight to the canonical Room 1 snapshot
    if (this.params.has('crisis')) { this.ui.gate.classList.remove('show'); this.sound.unlock(); this.toReveal(); return; } // dev: the reveal from just before the patient turns
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
    if (!p && this.studioHold) return; // (the Studio's pause: the window regaining focus does not start it)
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
    if (this.doctor && this.doctor.state !== 'off') this.doctor.off(); // (the opening playing again: the OR is its set, the doctor only after the hand-off)
    if (this.started && !this.paused) this.step(dt * (this.studioRate ?? 1)); // (studioRate: the Reveal Studio's playback speed)
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
    this.tickLaunch(d);
    if (this.heart && this.t >= this.heart.next) { this.heart.next += RT.music.heartEvery; if (!this.silent) this.rs.heartbeat(RT.music.heartK); } // (the steady heartbeat: story time, so the Studio's scrub stays in step)
    if (this.revealPose) this.poseRevealYola(da);
    this.tickStand(da); this.tickRevLight(d); this.tickSmoke(d); this.tickDoorSweep(d);
    if (this.burst && this.burst.state !== 'off') { if (this.burst.update(d * (this.burstScale ?? 1)) === 'lens') { this.lensHit = true; this.lensAt = this.burst.chunks.find((c) => c.head)?.path.E.clone() || new THREE.Vector3(); } }
    if (this.shake) this.shake = this.shake < 0.0005 ? 0 : this.shake * Math.exp(-dt * 9);
    if (this.camTrack) { this.rig = this.camTrack(); this.camAnim = null; }
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
