// The execution beat (2026-10-18, the user: "use one of the already in game animations that is strong.. and just zoom the
// camera... slow it down slow motion.. and make it feel epic"; and "the slow down and camera change should be instant").
// Yola's own strongest move for the weapon in her hands (core/player.js startExecution); everything epic is timing and the
// camera, run here in REAL time (the world's time is what it bends):
//   lock     on the press: time drops at once (execSlowLock), the camera cuts in (or pushes in over execCamPush), she lunges
//            in at full speed (her boost undoes the slow)
//   windup   her strike's wind-up, the world and she at execSlowWind: heavy anticipation; the camera creeps a touch closer
//   impact   the hit (core/zombies.js execHit): frozen for execFreeze
//   hang     the pieces fly at execSlowHang for execHang
//   release  back to full speed and the camera back over execRelease
// A strike that never comes (an edge case) lets go after MAX_WAIT.
const MAX_WAIT = 2.2;

export class ExecDirector {
  constructor() { this.s = null; }
  get active() { return !!this.s; }
  start(e) { this.s = { id: e.id, weapon: e.weapon, x: e.x, z: e.z, phase: 'lock', t: 0, pt: 0, cam: 0 }; }
  hit(e) { const s = this.s; if (s && e.id === s.id && (s.phase === 'lock' || s.phase === 'windup')) { s.phase = 'impact'; s.pt = 0; } }
  cancel() { this.s = null; }
  // per real frame: { k: the world's time scale, boost: Yola's on top of it, cam: 0..1 how far into the execution camera,
  // creep: 0..1 the wind-up's slow push closer }
  update(dt, T, hitIn = 0) {
    const s = this.s; if (!s) return null;
    s.t += dt; s.pt += dt;
    let k = 1, boost = 1;
    const push = T.execCamPush ?? 0, camIn = push > 0 ? Math.min(1, s.t / push) : 1;
    switch (s.phase) {
      case 'lock':
        k = T.execSlowLock; boost = 1 / Math.max(0.05, k); // (she lunges in at real speed)
        s.cam = camIn;
        if (s.pt >= 0.12) { s.phase = 'windup'; s.pt = 0; s.wb = Math.max(1, (hitIn || 0) / (Math.max(0.05, T.execSlowWind) * (T.execWindTime ?? 0.55))); } // (her pace: her strike lands execWindTime s (real) into the wind-up, whatever the weapon)
        break;
      case 'windup':
        k = T.execSlowWind; boost = s.wb || 1; s.cam = camIn;
        if (s.t > MAX_WAIT) { s.phase = 'release'; s.pt = 0; }
        break;
      case 'impact':
        k = 0.0001; s.cam = 1;
        if (s.pt >= T.execFreeze) { s.phase = 'hang'; s.pt = 0; }
        break;
      case 'hang':
        k = T.execSlowHang; s.cam = 1;
        if (s.pt >= T.execHang) { s.phase = 'release'; s.pt = 0; s.k0 = k; }
        break;
      case 'release': {
        const u = Math.min(1, s.pt / Math.max(0.05, T.execRelease)), e = u * u * (3 - 2 * u);
        k = (s.k0 ?? T.execSlowWind) + (1 - (s.k0 ?? T.execSlowWind)) * e; s.cam = 1 - e;
        if (u >= 1) { this.s = null; return { k: 1, boost: 1, cam: 0, creep: 0, done: true }; }
        break;
      }
    }
    const creep = s.phase === 'windup' ? Math.min(1, s.pt / 0.5) : s.phase === 'lock' ? 0 : 1;
    return { k, boost, cam: s.cam, creep, phase: s.phase };
  }
}
