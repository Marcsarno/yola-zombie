// Chapter 2: the cinematic moments (the user, 2026-10-20: "find areas where you can do cinematic passes and angles and
// shots ... the way the hospital opening is done ... with some cinematic moments and slowdown. But during those moments ...
// if it is zooming in on something, everything around you should kind of stop ... where you're not getting killed by a
// zombie while the camera's moving"). The story (level.js) hands it a list of shots; while they play:
//   - the world's time runs at the shot's `slow` (main.js reads timeScale; 0 holds everything still); the scene's subjects
//     (actors marked cine: Pete falling, Sophie at the cord) at its `rate`; Marc moves with the world unless `free`
//   - Marc takes no harm and the controls do nothing (game.inputFilter; `aim: true` leaves him his aim and trigger: the
//     shot at James), the HUD and the touch controls fade; letterbox bars come in
//   - the game camera gives way to the shots. The opening's rules (cinematic-feedback): a cut, then the frame holds; a slow
//     move only where the shot asks for one (`move` s from the last framing); never a camera inside a head
// A shot: { look: [x, y, z] | () => [x, y, z], from: { yaw, pitch, dist } (deg: yaw is the way the lens looks, the game
//   camera's is 35) | [x, y, z] | () => [x, y, z], fov (deg), hold (s, real), move (s), slow, rate, aim (true, or a target
//   {x, z}: a push of the aim stick swings it onto the target),
//   fn() (once, as the shot starts), until() (holds until true, after `hold`), max (s: gives up waiting) }
// The game camera comes back over `back` s (opts) at the end.
import * as THREE from 'three';

const _p = new THREE.Vector3(), _l = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);

export class Cine {
  constructor(camera) {
    this.camera = camera; this.q = null; this.k = 1; this.rate = 1; this.timers = [];
    this.cur = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: camera.fov };
    this.from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: camera.fov };
    const bars = document.createElement('div'); bars.className = 'hoodOverlay';
    bars.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:58';
    bars.innerHTML = '<i style="position:absolute;left:0;right:0;top:0;height:9vh;background:#000;transform:translateY(-100%);transition:transform .35s"></i><i style="position:absolute;left:0;right:0;bottom:0;height:9vh;background:#000;transform:translateY(100%);transition:transform .35s"></i>';
    document.body.appendChild(bars); this.bars = [...bars.children];
    // a word over the bottom bar when the shot hands Marc his trigger (the James shot: 'SHOOT')
    const tip = document.createElement('div'); tip.className = 'hoodOverlay';
    tip.style.cssText = 'position:fixed;left:0;right:0;bottom:calc(9vh + 14px);text-align:center;z-index:59;pointer-events:none;font:800 22px system-ui,sans-serif;letter-spacing:.3em;color:#fff;text-shadow:0 0 10px #c33,0 2px 4px #000;opacity:0;transition:opacity .2s';
    document.body.appendChild(tip); this.tip = tip;
  }
  get active() { return !!this.q; }
  say(t) { this.tip.textContent = t || ''; this.tip.style.opacity = t ? 1 : 0; }
  // the world's time scale while a shot plays (null: the game's own)
  get timeScale() { return this.q ? this.k : null; }
  get subjectRate() { return this.q ? this.rate : 1; }
  play(shots, opts = {}) {
    const g = window.game;
    this.q = { shots, i: -1, t: 0, opts, back: opts.back ?? 0.6, backT: -1, waited: 0 };
    this.cur.pos.copy(this.camera.position); this.camera.getWorldDirection(_l); this.cur.look.copy(this.camera.position).addScaledVector(_l, 10); this.cur.fov = this.camera.fov;
    this.fov0 = this.camera.fov;
    g?.hudShow?.(false); for (const b of this.bars) b.style.transform = 'translateY(0)';
    this.next();
  }
  // in the story: yield* cine.run(shots) (resumes when the camera is back)
  *run(shots, opts) { this.play(shots, opts); while (this.active) yield; }
  stop() { if (!this.q) return; this.q = null; this.end(); }
  // a call in real time while the shots play (the world's own clock may be all but stopped)
  after(s, fn) { this.timers.push({ t: s, fn }); }
  end() {
    const g = window.game; g && (g.inputFilter = null); g?.hudShow?.(true); this.say('');
    for (const [i, b] of this.bars.entries()) b.style.transform = i ? 'translateY(100%)' : 'translateY(-100%)';
    this.camera.fov = this.fov0; this.camera.updateProjectionMatrix();
  }
  next() {
    const Q = this.q; Q.i++; Q.t = 0; Q.waited = 0;
    const s = Q.shots[Q.i];
    if (!s) { Q.backT = 0; this.from.pos.copy(this.cur.pos); this.from.look.copy(this.cur.look); this.from.fov = this.cur.fov; return; }
    this.from.pos.copy(this.cur.pos); this.from.look.copy(this.cur.look); this.from.fov = this.cur.fov;
    this.k = s.slow ?? Q.opts.slow ?? 0.06; this.rate = s.rate ?? Q.opts.rate ?? 1;
    const g = window.game; g?.hudShow?.(!!s.aim); this.say(s.prompt || (s.aim ? '' : ''));
    if (g) g.inputFilter = (inp, sim) => {
      inp.moveX = inp.moveZ = 0; inp.usePresses = inp.swapPresses = inp.dodgePresses = 0;
      if (!s.aim) inp.aimX = inp.aimZ = 0;
      else if (s.aim.x !== undefined && Math.hypot(inp.aimX, inp.aimZ) > 0.3 && sim) { const p = sim.player, dx = s.aim.x - p.x, dz = s.aim.z - p.z, d = Math.hypot(dx, dz) || 1; inp.aimX = dx / d; inp.aimZ = dz / d; }
      return inp;
    };
    s.fn?.();
  }
  frame(s) {
    const look = typeof s.look === 'function' ? s.look() : s.look;
    _l.set(look[0], look[1], look[2]);
    this.focus = { x: look[0], z: look[2] };   // (what the shot looks at: main.js draws the far infected there too)
    const f = typeof s.from === 'function' ? s.from() : s.from;
    if (Array.isArray(f)) _p.set(f[0], f[1], f[2]);
    else {
      const y = THREE.MathUtils.degToRad(f.yaw ?? 35), pi = THREE.MathUtils.degToRad(f.pitch ?? 30), d = f.dist ?? 6;
      _p.set(_l.x + Math.sin(y) * Math.cos(pi) * d, _l.y + Math.sin(pi) * d, _l.z + Math.cos(y) * Math.cos(pi) * d);
    }
    return s.fov ?? this.fov0;
  }
  // per real frame, after the game camera has moved (hood.update): the shot's camera; sim: Marc kept from harm
  update(dt, sim) {
    for (let i = this.timers.length - 1; i >= 0; i--) { const T = this.timers[i]; if ((T.t -= dt) <= 0) { this.timers.splice(i, 1); T.fn(); } }
    const Q = this.q; if (!Q) return;
    const p = sim?.player; if (p) p.invuln = Math.max(p.invuln, 0.6);
    const s = Q.shots[Q.i];
    if (Q.backT >= 0) { // the game camera again: from the last framing back to where the game put it this frame
      Q.backT += dt; const k = ease(Math.min(1, Q.backT / Math.max(0.01, Q.back)));
      this.camera.getWorldDirection(_l); const gl = _l.clone().multiplyScalar(10).add(this.camera.position);
      this.camera.position.lerpVectors(this.from.pos, this.camera.position.clone(), k);
      _l.lerpVectors(this.from.look, gl, k); this.camera.lookAt(_l);
      this.camera.fov = this.from.fov + (this.fov0 - this.from.fov) * k; this.camera.updateProjectionMatrix();
      this.k = 1 - (1 - this.k) * (1 - Math.min(1, Q.backT / Math.max(0.01, Q.back)));
      if (Q.backT >= Q.back) { this.q = null; this.end(); }
      return;
    }
    Q.t += dt;
    const fov = this.frame(s), mv = s.move || 0, k = mv > 0 ? ease(Math.min(1, Q.t / mv)) : 1;
    this.cur.pos.lerpVectors(this.from.pos, _p, k); this.cur.look.lerpVectors(this.from.look, _l, k); this.cur.fov = this.from.fov + (fov - this.from.fov) * k;
    this.camera.position.copy(this.cur.pos); this.camera.lookAt(this.cur.look);
    if (this.camera.fov !== this.cur.fov) { this.camera.fov = this.cur.fov; this.camera.updateProjectionMatrix(); }
    const held = Q.t >= (s.hold ?? 1.2) + mv;
    if (held && (!s.until || s.until() || (Q.waited += dt) > (s.max ?? 12))) this.next();
  }
}
