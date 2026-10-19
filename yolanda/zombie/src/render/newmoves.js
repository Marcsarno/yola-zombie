// The Quaternius UAL 1 + 2 moves on Yola (2026-10-17, UAL_PACKS.md; clips in assets/yola2_ual.glb), built at load on the
// Yola that plays (main.js setupBat calls setupNewMoves):
//   the bat combo from its own strikes: Sword_Regular_A, B, C (the old Sword_Regular_Combo clip is exactly A + B + C), so
//     stopping after a strike plays that strike's recovery clip (A_Rec, B_Rec: render/clipchars.js recCur) instead of a
//     blend from mid-swing; chained strikes still hand over on the very frame
//   the leg attacks (core/weapons.js LEG_ATTACKS): the bat's low diagonal (UAL1 Sword_Attack: the bat comes down to
//     8-27 cm off the floor ~1 m to her front-left, so she turns 67 deg right into it and that lands on the aim; measured
//     in the Rig Lab, 2026-10-17: Sword_Light_C, the "crouched sweep", never brings the bat below 0.52 m in front of her),
//     the fists' slide tackle (Slide_Start + Slide_Exit as one clip), the axe's low chop (gs_low_slash:
//     its hit path sampled here from the axe as it is drawn; the stored axe directions for that clip point the wrong way
//     through the low part of the slash)
//   the bat's own strike at a body on the floor (Sword_Heavy_D, its frames 10-34: overhead, into the floor)
//   the dodge and the vault clips (played by clipchars.js OVERLAY_CLIPS)
//   the bat on her back, drawn over her shoulder with UAL1 Sword_Enter (clipchars.js setupBatBack; an experiment, ?batdraw=0)
import * as THREE from 'three';
import { buildLibraryAttack } from './libattack.js';
import { mixerWritesAll, OVERLAY_NAMES } from './clipchars.js';
import { BAT_PROFILE, useBuiltBat, LEG_ATTACKS, GROUND_OWN, EXEC_LAUNCH, attackTime, attackEnd } from '../core/weapons.js';

const SETTLE = 0.45; // s after a strike before she is free again (the recovery clip plays on as the settle, clipchars.js)
const REC = ['ual_Sword_Regular_A_Rec', 'ual_Sword_Regular_B_Rec'];
const deg = Math.PI / 180;
// a built attack turned by a (its path in character space turned with it; the renderer turns her by yawOffset)
function turnAttack(S, a, turnIn) {
  const c = Math.cos(a), sn = Math.sin(a);
  for (const q of S.PATH) { const mx = q.mx * c + q.mz * sn, mz = -q.mx * sn + q.mz * c, dx = q.dx * c + q.dz * sn, dz = -q.dx * sn + q.dz * c; q.mx = mx; q.mz = mz; q.dx = dx; q.dz = dz; }
  S.yawOffset = a; S.turnIn = turnIn;
}
// a leg attack's damaging window: only where the weapon's end is below the knee (maxY) and moving (no hit on the way down
// through a body's chest: the swing has to be low when it lands)
function lowWindow(S, maxY = 0.6, minSpeed = 1.2) {
  const L = S.geom?.length || 0.74, P = S.PATH, tip = (q) => q.my + q.dy * L;
  let a0 = null, a1 = null;
  for (let i = 1; i < P.length; i++) {
    const v = Math.hypot(P[i].mx + P[i].dx * L - P[i - 1].mx - P[i - 1].dx * L, tip(P[i]) - tip(P[i - 1]), P[i].mz + P[i].dz * L - P[i - 1].mz - P[i - 1].dz * L) / (P[i].t - P[i - 1].t);
    if (tip(P[i]) < maxY && v > minSpeed) { a0 ??= P[i - 1].t; a1 = P[i].t; }
  }
  if (a0 == null) return false;
  S.windows = [[a0, a1 + 0.02]]; S.activeStart = a0; S.activeEnd = a1 + 0.02; return true;
}

// a clip cut to Blender frames f0..f1, its first kept frame at frame 1 (every track sampled on every frame: the export
// thins out tracks that hold still)
function cutClip(c, f0, f1, name) {
  const out = c.clone(); out.name = name;
  out.tracks = c.tracks.map((t) => {
    const n = t.getValueSize(), it = t.createInterpolant(), times = [], vals = [];
    for (let f = f0; f <= f1; f++) { times.push((f - f0 + 1) / 30); vals.push(...it.evaluate(f / 30)); }
    return new t.constructor(t.name, times, vals.slice(0, times.length * n));
  });
  out.resetDuration(); return out;
}
// two clips one after the other (the second starts the frame after the first ends)
function joinClips(a, b, name) {
  const out = a.clone(); out.name = name;
  const fa = Math.round(a.duration * 30);
  out.tracks = a.tracks.map((t) => {
    const u = b.tracks.find((q) => q.name === t.name); if (!u) return t.clone();
    const times = [...t.times, ...Array.from(u.times, (x) => x + fa / 30)];
    return new t.constructor(t.name, times, [...t.values, ...u.values]);
  });
  out.resetDuration(); return out;
}

export function setupNewMoves(yola, anims, hold) {
  const by = Object.fromEntries(anims.map((c) => [c.name, c])), made = [];
  yola.addAttackClips([...OVERLAY_NAMES, ...REC].map((n) => by[n]).filter(Boolean)); // (played by name: the dodge, the vault, the recoveries)
  if (hold) {
    // ---- the bat combo, strike by strike ----
    const A = by.ual_Sword_Regular_A, B = by.ual_Sword_Regular_B, C = by.ual_Sword_Regular_C;
    if (A && B && C) {
      const one = (clip, name, rec) => {
        const parts = buildLibraryAttack(yola, { clip, hold, P: BAT_PROFILE, name, sound: 'bat', strikes: 1, recover: SETTLE, split: false });
        for (const S of parts) { const end = attackEnd(S); Object.assign(S, { continuous: true, chainAlways: true, chainFrom: end, last: false, rec, duration: end + SETTLE, swapPoint: end * 0.85 }); }
        return parts;
      };
      const cFrames = Math.round(C.duration * 30) - 2; // (its last frames snap back to the loop pose, as the old combo's)
      // C is two strikes, its spin hit and its final blow, played 1.7x (2026-10-18, the user: the third hit "feels too
      // slow ... maybe it just needs to be faster"; kept as four hits after trying three)
      const strikes = [...one(A, 'bat 1', REC[0]), ...one(B, 'bat 2', REC[1]), ...buildLibraryAttack(yola, { clip: C, frames: cFrames, hold, P: BAT_PROFILE, name: 'bat 3', sound: 'bat', strikes: 2, speed: 1.7 })];
      useBuiltBat(strikes); made.push(`bat combo: ${strikes.length} strikes`);
    }
    // ---- the bat's low strike at the legs ----
    if (by.ual1_Sword_Attack) {
      const clip = cutClip(by.ual1_Sword_Attack, 1, 30, 'ual1_Sword_Attack_legs'); // (to where the bat leaves the floor)
      const [S] = buildLibraryAttack(yola, { clip, hold, P: { ...BAT_PROFILE, style: 'legs' }, name: 'bat legs', sound: 'bat', recover: 0.4, split: false });
      turnAttack(S, -67 * deg, 0.3);
      lowWindow(S);
      Object.assign(S, { legs: true, minY: 0, style: 'legs', dmg: 0.8, knock: 0.5, chainFrom: 9, stand: 0.95, kind: 'bat' });
      LEG_ATTACKS.bat = S; made.push(`bat legs ${S.activeStart.toFixed(2)}-${S.activeEnd.toFixed(2)} s`);
    }
    // ---- the bat's strike at a body on the floor ----
    if (by.ual_Sword_Heavy_D) {
      const clip = cutClip(by.ual_Sword_Heavy_D, 10, 34, 'ual_Sword_Heavy_D_ground'); // (into the floor at its frame 20; it rests there ~0.3 s, then blends back)
      const [S] = buildLibraryAttack(yola, { clip, hold, P: { ...BAT_PROFILE, style: 'chop', dmg: 1.4, knock: 0.6 }, name: 'bat ground', sound: 'bat', recover: 0.3, split: false });
      Object.assign(S, { ground: true, style: 'chop', minY: 0.05, chainFrom: 9, assist: 2.0, stand: 1.0, kind: 'bat', dmg: 1.4, knock: 0.6 });
      GROUND_OWN.bat = S; made.push('bat ground');
    }
  }
  // ---- the jump finishers (core/weapons.js EXEC_LAUNCH): sampled with the bat in her hand; every melee weapon's finisher
  // plays them with its own profile (core/player.js startExecution) ----
  if (hold) {
    EXEC_LAUNCH.length = 0;
    for (const v of ['B_uppercut', 'C_uppercut_mirrored']) for (const [dist, sfx] of [[1.4, ''], [2.4, '_2_4m'], [3.4, '_3_4m']]) {
      const clip = by['hub_execution_' + v + sfx]; if (!clip) continue;
      const [S] = buildLibraryAttack(yola, { clip, hold, P: { ...BAT_PROFILE, style: 'heavy' }, name: 'finisher ' + v, sound: 'bat', strikes: 1, recover: 0.3, split: false });
      // her travel (the game strips it from the clip at load: clipchars.js stripRoot keeps it aside), hips units to metres
      if (clip.travel) {
        const k = yola.bones.Hips.parent.getWorldScale(new THREE.Vector3()).z, z0 = clip.travel.z[0];
        let m = 0; S.ROOT = clip.travel.times.map((t, i) => ({ t: attackTime(S, Math.round(t * 30)), z: (m = Math.max(m, (clip.travel.z[i] - z0) * k)) }));
      }
      // the blow only (the coil and the jump move the bat fast too): the clip's last fast window
      const win = S.windows[S.windows.length - 1];
      Object.assign(S, { windows: [win], activeStart: win[0], activeEnd: win[1], stand: 0.9, chainFrom: 9, launch: true });
      EXEC_LAUNCH.push({ variant: v, dist, A: S });
    }
    if (EXEC_LAUNCH.length) made.push(`jump finishers: ${EXEC_LAUNCH.map((e) => e.variant[0] + e.dist + (e.A.ROOT ? ' ' + e.A.ROOT[e.A.ROOT.length - 1].z.toFixed(2) + 'm@' + e.A.activeStart.toFixed(2) : ' no ROOT')).join(', ')}`);
  }
  // ---- the bat on her back, drawn with Sword_Enter (clipchars.js setupBatBack) ----
  if (hold && by.ual1_Sword_Enter) { const g = yola.setupBatBack(by.ual1_Sword_Enter); if (g) made.push(`bat on the back (grab at frame ${g})`); }
  // ---- the fists' slide tackle ----
  if (by.ual_Slide_Start && by.ual_Slide_Exit) {
    const clip = joinClips(by.ual_Slide_Start, by.ual_Slide_Exit, 'ual_Slide_Tackle');
    const [S] = buildLibraryAttack(yola, { clip, P: { kind: 'fist', dmg: 1.4, knock: 1.2, style: 'legs', sever: {} }, name: 'slide', sound: 'fist', recover: 0.25, split: false });
    const end = attackEnd(S);
    // the travel: Quaternius's own root motion (UAL2 *_RM: 4 m into the slide in 0.83 s, 2 m getting up in 0.5 s), x 0.55
    const k = 0.55, st = [[0, 0], [0.208, 0.857], [0.417, 2.333], [0.625, 3.167], [0.833, 4]], ex = [[0.125, 0.286], [0.25, 0.688], [0.375, 1.25], [0.5, 2]];
    S.ROOT = [...st.map(([t, z]) => ({ t, z: z * k })), ...ex.map(([t, z]) => ({ t: 0.833 + t, z: (4 + z) * k }))].filter((q) => q.t <= end + 1e-6);
    // it hits while she is down and sliding (the feet sweep through whatever they reach), not on the drop
    Object.assign(S, { legs: true, minY: 0, style: 'legs', dmg: 1.4, knock: 1.2, stand: 0.25, chainFrom: 9, windows: [[0.25, 0.95]], activeStart: 0.25, activeEnd: 0.95, geom: { length: 0.35, hitFrom: 0, radius: 0.18 } });
    LEG_ATTACKS.fists = S; made.push('slide');
  }
  // ---- the axe's low chop: its path from the axe as drawn ----
  const L = LEG_ATTACKS.axe;
  if (L && yola.act(L.clip)) { sampleAxePath(yola, L); made.push(`axe legs ${L.activeStart.toFixed(2)}-${L.activeEnd.toFixed(2)} s`); }
  console.info('[newmoves]', made.join(', '));
}

// Pose the axe leg chop frame by frame and read the axe the renderer draws (render/clipchars.js placeWeapons: the handle
// through both fists): its grip and its head direction become the attack's path; its window is where the blade is low
// (below 0.7 m) and moving fast.
function sampleAxePath(Y, A) {
  const acts = Object.values(Y.actions), saved = acts.map((a) => [a, a.getEffectiveWeight(), a.time]);
  const op = Y.outer.position.clone(), ry = Y.container.rotation.y, keep = { weaponShown: Y.weaponShown, batMode: Y.batMode, swingAct: Y.swingAct, swingW: Y.swingW, swingName: Y.swingName, swingHand: Y.swingHand, prevSwing: Y.prevSwing, axeDir: Y.axeDir };
  Y.outer.position.set(0, 0, 0); Y.container.rotation.y = 0;
  for (const a of acts) a.setEffectiveWeight(0);
  const act = Y.act(A.clip), rows = [], q = new THREE.Quaternion(), d = new THREE.Vector3();
  Object.assign(Y, { weaponShown: 'axe', batMode: false, swingAct: act, swingW: 1, swingName: A.sock, swingHand: 'Right', prevSwing: null, axeDir: null });
  for (let f = A.f0; f <= A.f1; f++) {
    for (const [b, q0] of Y.restQ) b.quaternion.copy(q0);
    mixerWritesAll(Y.mixer); act.setEffectiveWeight(1); act.time = f / 30 + (f & 1) * 1e-6; Y.mixer.update(0); Y.outer.updateMatrixWorld(true);
    Y.posture(); Y.placeWeapons({ equipped: 'axe', action: 'swing' }, 0);
    const M = Y.melee; M.getWorldQuaternion(q); d.set(0, 0, 1).applyQuaternion(q);
    rows.push({ t: attackTime(A, f), mx: M.position.x, my: M.position.y, mz: M.position.z, dx: d.x, dy: d.y, dz: d.z });
  }
  for (const [a, w, t] of saved) { a.setEffectiveWeight(w); a.time = t; }
  Y.outer.position.copy(op); Y.container.rotation.y = ry; Object.assign(Y, keep);
  A.PATH = rows; A.built = true;
  // the window: the blade low and fast
  const L = 0.74, tip = (r) => [r.mx + r.dx * L, r.my + r.dy * L, r.mz + r.dz * L];
  let a0 = null, a1 = null;
  for (let i = 1; i < rows.length; i++) {
    const p = tip(rows[i]), o = tip(rows[i - 1]), v = Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]) / (rows[i].t - rows[i - 1].t);
    if (p[1] < 0.7 && v > 3) { a0 ??= rows[i - 1].t; a1 = rows[i].t; }
  }
  if (a0 != null) { A.activeStart = a0; A.activeEnd = a1 + 0.03; }
  A.lowY = Math.min(...rows.map((r) => tip(r)[1])); // (for the record: how low the blade gets)
}
