// Library attacks (one clip, one or several strikes) built on Yola at load, for the weapon test arena and for the game's
// own bat (Sword Regular Combo, 2026-10-16). The clip is posed frame by frame with the weapon placed in her fist exactly
// as it is drawn (YolaView.placeHeld), giving:
//   PATH     the weapon's grip and direction per frame (the swept hit test),
//   windows  its damaging windows, where the business end moves fast (a combo clip has several, each hits afresh),
//   ROOT     her forward travel (the hips' advance, applied by the game as root motion; she stops short of a target).
// A combo clip is then cut into one attack per strike (splitCombo), chained on the very frame the last one ends.
import * as THREE from 'three';
import { attackTime, attackEnd } from '../core/weapons.js';

export const FPS = 30;
const V = () => new THREE.Vector3();

// pose the clip on Yola frame by frame (her own state saved and put back): hips travel, and the weapon's grip / tip (or,
// unarmed, both fists and both feet)
function sample(Y, A, rawClip, hold) {
  const acts = Object.values(Y.actions), saved = acts.map((a) => [a, a.getEffectiveWeight(), a.time]);
  const op = Y.outer.position.clone(), ry = Y.container.rotation.y;
  Y.outer.position.set(0, 0, 0); Y.container.rotation.y = 0;
  for (const a of acts) a.setEffectiveWeight(0);
  const act = Y.act(A.clip), raw = Y.mixer.clipAction(rawClip); raw.play(); raw.timeScale = 0;
  const ff = { c: V(), a: V(), k: V() }, rows = [];
  const pose = (a, f) => { for (const [b, q] of Y.restQ) b.quaternion.copy(q); a.setEffectiveWeight(1); a.time = f / FPS + (f & 1) * 1e-6; Y.mixer.update(0); Y.outer.updateMatrixWorld(true); a.setEffectiveWeight(0); };
  // (two passes: posing the two copies alternately frame by frame leaves the mixer applying stale poses)
  const travel = [];
  for (let f = A.f0; f <= A.f1; f++) { pose(raw, f); travel.push(Y.bones.Hips.getWorldPosition(V())); } // unpinned: her travel
  for (let f = A.f0; f <= A.f1; f++) {
    const hips = travel[f - A.f0];
    pose(act, f); act.setEffectiveWeight(1);
    if (hold) Y.placeHeld(hold);
    const row = { f, hips, pin: Y.bones.Hips.getWorldPosition(V()) };
    if (hold?.obj) { row.grip = Y.heldGrip.clone(); row.tip = Y.heldTip.clone(); }
    else { row.l = Y.fistFrame('Left', ff).c.clone(); row.r = Y.fistFrame('Right', ff).c.clone(); row.lf = Y.bones.LeftToeBase.getWorldPosition(V()); row.rf = Y.bones.RightToeBase.getWorldPosition(V()); }
    act.setEffectiveWeight(0); rows.push(row);
  }
  raw.stop(); Y.mixer.uncacheAction(rawClip);
  for (const [a, wt, t] of saved) { a.setEffectiveWeight(wt); a.time = t; }
  Y.outer.position.copy(op); Y.container.rotation.y = ry;
  if (hold?.obj) hold.obj.visible = false;
  return rows;
}

// clip: the AnimationClip on Yola's skeleton; frames: its frame count (or null: from its duration); hold: { obj, w, hand,
// roll, slide, flip, two, fingers } (null: unarmed); P: the weapon's profile { kind, dmg, knock, style, sever, hitFrom,
// radius, reach }; speed: playback rate; name: shown in the arena; sound: the impact family; strikes: how many strikes the
// clip has, when known (the threshold for "fast" is lowered until that many windows are found: a slower swing among fast
// ones, like the Sword Regular Combo's third, is still its own strike)
export function buildLibraryAttack(Y, { clip, frames = null, hold = null, P, speed = 1, name, sound, recover = 0.3, splitRecover = 0.4, strikes = 0 }) {
  const t0 = Math.min(...clip.tracks.map((t) => t.times[0]));
  const play = clip.clone(); play.name = clip.name; Y.addAttackClips([play]);
  const w = hold?.w || null;
  const f0 = Math.round(t0 * FPS), f1 = f0 + (frames || Math.round((clip.duration - t0) * FPS) + 1) - 1;
  const A = { name, clip: clip.name, path: clip.name, f0, f1, fps: FPS, rate: speed, yawOffset: 0, chainFrom: 9, recover, stand: 0.9, assist: 1.9,
    lungeMax: 0.5, enterBlend: 0.12, minY: 0.45, kind: P.kind, dmg: P.dmg, knock: P.knock, style: P.style, sever: P.sever, sound, built: true };
  const hold2 = hold && w && P.reach === 'tip' && w.tip ? { ...hold, w: { ...w, impact_point: w.tip } } : hold;
  const rows = sample(Y, A, clip.clone(), hold2);
  // the striking point and the weapon (or limb) direction, character space
  let pts, dirs, L, geom;
  if (hold?.obj) {
    L = rows[0].tip.distanceTo(rows[0].grip);
    pts = rows.map((r) => r.grip); dirs = rows.map((r) => r.tip.clone().sub(r.grip).normalize());
    geom = { length: L, hitFrom: P.hitFrom, radius: P.radius };
  } else { // unarmed: the limb that moves fastest in this clip (a fist, or the foot for a kick)
    let best = 'r', bp = 0;
    for (const k of ['l', 'r', 'lf', 'rf']) for (let i = 1; i < rows.length; i++) { const v = rows[i][k].distanceTo(rows[i - 1][k]); if (v > bp) { bp = v; best = k; } }
    pts = rows.map((r) => r[best]); dirs = rows.map((r) => { const d = r[best].clone().sub(r.pin); d.y = 0; return d.normalize(); });
    L = 0.12; geom = { length: L, hitFrom: 0, radius: best.endsWith('f') ? 0.15 : 0.12 };
    if (best.endsWith('f')) { A.style = 'kick'; A.dmg = 2.2; A.knock = 1.0; }
    A.limb = best;
  }
  A.geom = geom;
  A.PATH = rows.map((r, i) => ({ t: attackTime(A, r.f), mx: pts[i].x, my: pts[i].y, mz: pts[i].z, dx: dirs[i].x, dy: dirs[i].y, dz: dirs[i].z }));
  // damaging windows: where the business end moves fast (each one hits afresh)
  const tip = (i) => pts[i].clone().addScaledVector(dirs[i], L);
  const sp = rows.map((r, i) => (i ? tip(i).distanceTo(tip(i - 1)) * FPS : 0));
  const peak = Math.max(...sp);
  const find = (frac) => {
    const thr = Math.max(hold?.obj ? 2.6 : 2.0, peak * frac), wins = []; let cur = null;
    sp.forEach((v, i) => { if (v >= thr) { if (cur && i - cur[1] <= 3) cur[1] = i; else { if (cur) wins.push(cur); cur = [i, i]; } } });
    if (cur) wins.push(cur);
    return wins.filter((x) => x[1] - x[0] >= 1);
  };
  let wins = find(0.42);
  for (let frac = 0.38; strikes && wins.length < strikes && frac >= 0.2; frac -= 0.02) wins = find(frac);
  let windows = wins.map(([a, b]) => [attackTime(A, rows[Math.max(0, a - 1)].f), attackTime(A, rows[Math.min(rows.length - 1, b + 1)].f)]);
  const end = attackEnd(A);
  if (!windows.length) windows = [[end * 0.3, end * 0.6]];
  A.windows = windows; A.activeStart = windows[0][0]; A.activeEnd = windows[windows.length - 1][1];
  A.duration = end + A.recover; A.swapPoint = end * 0.85;
  A.peak = peak;
  // her travel: the hips' forward advance through the clip (applied as root motion; she stops short of a target)
  const z0 = rows[0].hips.z, R = rows.map((r) => ({ t: attackTime(A, r.f), z: Math.max(0, r.hips.z - z0) }));
  for (let i = 1; i < R.length; i++) R[i].z = Math.max(R[i].z, R[i - 1].z); // never pulled back
  A.ROOT = R[R.length - 1].z > 0.3 ? R : null; // (a small shuffle: the game's own step toward the target instead)
  return splitCombo(A, splitRecover);
}

// A combo clip (several strikes) becomes a chain of attacks, one per strike, cut between strikes, so the combo can stop
// after any hit: tap once for one strike, keep tapping (or hold) for the next, which starts on the very frame the last
// one ends (one continuous clip: no blend between them). Stopping early blends that strike's last pose back to the idle.
export function splitCombo(A, splitRecover = 0.4) {
  const n = A.windows.length;
  if (n < 2) return [A];
  const toF = (t) => A.f0 + t * FPS * A.rate;
  const cuts = A.windows.slice(0, -1).map(([, e], i) => Math.round(toF(e) + (toF(A.windows[i + 1][0]) - toF(e)) * 0.45));
  const bounds = [A.f0, ...cuts, A.f1];
  return A.windows.map((win, i) => {
    const fa = bounds[i], fb = bounds[i + 1], t0 = (fa - A.f0) / (FPS * A.rate), t1 = (fb - A.f0) / (FPS * A.rate);
    const S = { ...A, name: `${A.name} ${i + 1}/${n}`, f0: fa, f1: fb, continuous: true, chainAlways: true, last: i === n - 1 };
    S.PATH = A.PATH.filter((q) => q.t >= t0 - 1e-6 && q.t <= t1 + 1e-6).map((q) => ({ ...q, t: q.t - t0 }));
    S.windows = [[Math.max(0, win[0] - t0), win[1] - t0]]; S.activeStart = S.windows[0][0]; S.activeEnd = S.windows[0][1];
    const end = attackEnd(S);
    S.duration = end + (S.last ? A.recover : splitRecover); S.swapPoint = end * 0.85; S.chainFrom = S.last ? 9 : end;
    if (A.ROOT) { const R = A.ROOT.filter((q) => q.t >= t0 - 1e-6 && q.t <= t1 + 1e-6), z0 = R[0]?.z || 0; S.ROOT = R.length > 1 && R[R.length - 1].z - z0 > 0.05 ? R.map((q) => ({ t: q.t - t0, z: q.z - z0 })) : null; }
    return S;
  });
}
