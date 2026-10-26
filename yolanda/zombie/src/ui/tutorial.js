// The first-play tutorial (2026-10-25, the user: the opening "is awesome ... but she didn't know how to move, she didn't know
// how to attack"). At the hand-off after the reveal, three short steps over the live game, the OR's zombies held still:
//  1 walk: the lower part of the screen's left half glows (below Yola's feet: the user, "we want them to use the bottom of
//    the phone"), a ghost thumb slides there, "Touch here. Slide to walk." Done once she has walked a couple of metres.
//  2 attack: the opening's first zombie (the patient at the table) wakes, the right half's lower part glows, the ghost thumb
//    drags out to the edge, "Push a little to aim. Push to the edge to attack." Done on the first hit.
//  3 hold: "Keep holding to keep swinging." Done on a second hit or the kill. The others wake as they would have, a beat apart.
// Only the first time (store 'tutorialDone'); Skip ends it; the pause menu's "Replay tutorial" and ?tutorial=1 run it again.
// The sticks themselves are unchanged (input.js: a touch anywhere on a half): the glow only shows where a thumb belongs.
// A computer gets the keys and the mouse in words, no glow. Soft pulses only (no flashing: under 1 a second).
// cue(): one-time pointers at a button when it first matters (main.js: the first dodge window, the pistol's weapon wheel).
const CSS = `
#tut { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .35s; }
#tut.on { opacity: 1; }
body:has(#hud .sheet.show) #tut { visibility: hidden; }
#tut .zone { position: absolute; bottom: 0; width: 50%; border-radius: 26px 26px 0 0; opacity: 0; transition: opacity .35s;
  background: linear-gradient(to top, rgba(84, 226, 132, .42), rgba(84, 226, 132, .16)); box-shadow: inset 0 3px 0 rgba(140, 255, 175, .55), 0 -10px 40px rgba(84, 226, 132, .18);
  animation: tutPulse 1.6s ease-in-out infinite; }
#tut .zone.l { left: 0; } #tut .zone.r { right: 0; }
#tut .zone.show { opacity: 1; }
@keyframes tutPulse { 0%, 100% { filter: brightness(.8); } 50% { filter: brightness(1.35); } }
#tut .ghost { position: absolute; width: 96px; height: 96px; margin: -48px 0 0 -48px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, .55); opacity: 0; transition: opacity .35s; }
#tut .ghost.show { opacity: 1; }
#tut .ghost i { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: rgba(255, 255, 255, .7); box-shadow: 0 2px 10px rgba(0, 0, 0, .35); }
#tut .ghost.walk i { animation: tutWalk 1.8s ease-in-out infinite; }
#tut .ghost.hit i { animation: tutHit 1.8s ease-in-out infinite; }
#tut .ghost.hold i { animation: tutHold 1.8s ease-in-out infinite; }
@keyframes tutWalk { 0%, 15% { transform: translate(0, 0); } 45%, 60% { transform: translate(34px, -24px); } 85%, 100% { transform: translate(0, 0); } }
@keyframes tutHit { 0%, 15% { transform: translate(0, 0); } 35%, 45% { transform: translate(12px, -14px); } 70%, 85% { transform: translate(30px, -34px); } 100% { transform: translate(0, 0); } }
@keyframes tutHold { 0%, 20% { transform: translate(0, 0); } 40%, 90% { transform: translate(30px, -34px); } 100% { transform: translate(0, 0); } }
#tut .say { position: absolute; left: 50%; transform: translateX(-50%); width: min(86vw, 420px); text-align: center; font-weight: 750; font-size: 21px;
  line-height: 1.25; color: #fff; text-shadow: 0 2px 6px rgba(0, 0, 0, .8), 0 0 2px rgba(0, 0, 0, .9); opacity: 0; transition: opacity .3s; }
#tut .say.show { opacity: 1; }
#tut .say small { display: block; font-size: 15px; font-weight: 600; color: #d8f7e2; margin-top: 4px; }
.tutCue { position: absolute; transform: translate(-50%, -100%); padding: 8px 13px; border-radius: 12px; background: rgba(20, 28, 32, .88); color: #fff;
  font-weight: 750; font-size: 16px; text-align: center; white-space: nowrap; pointer-events: none; box-shadow: 0 3px 12px rgba(0, 0, 0, .45); z-index: 3; }
.tutCue small { display: block; font-size: 13px; font-weight: 600; color: #d8f7e2; margin-top: 2px; }
.cuePulse { animation: cuePulse 1.1s ease-in-out infinite; }
@keyframes cuePulse { 50% { box-shadow: 0 0 0 9px rgba(84, 226, 132, .5), 0 3px 10px rgba(0, 0, 0, .35); } }
#tut .skip { position: absolute; top: calc(58px + var(--sat)); right: calc(12px + var(--sar)); pointer-events: auto; padding: 6px 12px; border-radius: 10px;
  background: rgba(20, 28, 32, .6); color: var(--ink2); font-size: 13px; }
`;

const WALK_M = 2.0, MIN_SHOW = 1.2, HOLD_MAX = 6;

export class Tutorial {
  constructor({ store, touch }) {
    this.store = store; this.touch = touch; this.step = null; this.held = []; this.cued = new Set();
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (this.el = document.createElement('div')); el.id = 'tut';
    el.innerHTML = '<div class="zone l"></div><div class="zone r"></div><div class="ghost"><i></i></div><div class="say"></div><button class="skip">Skip</button>';
    // (first in the HUD: its menus come later in the page, so they draw over it)
    const hud = document.getElementById('hud'); hud.insertBefore(el, hud.firstChild);
    [this.zl, this.zr, this.ghost, this.say, this.skipB] = el.children;
    this.skipB.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.finish(); });
  }
  get done() { return !!this.store.get('tutorialDone', false); }
  get active() { return !!this.step; }

  // at the hand-off: the OR's zombies held still (locked, woken by nothing but a hit) until the lesson lets them go
  start(sim) {
    if (this.step) this.release(sim);
    this.sim = sim; this.held = [];
    for (const z of sim.zombies) {
      if (!z.alive || z.group !== 'or') continue;
      if (z.dormant) { this.held.push({ z, wake: z.dormant.wake, locked: z.dormant.locked }); z.dormant.wake = Infinity; z.dormant.locked = true; }
      else if (z.state === 'chase' && !z.passive) { // (already up: Yola stands within its sense at the hand-off) standing still again
        this.held.push({ z, wake: sim.time, locked: false });
        z.dormant = { wake: Infinity, sense: 6, locked: true, group: z.group, speedMul: z.speedMul }; z.passive = true; z.speedMul = 0; z.vx = z.vz = 0;
      }
    }
    // the opening's first zombie: the one meant to wake first (the patient at the table)
    this.target = this.held.slice().sort((a, b) => a.wake - b.wake)[0]?.z || null;
    const p = sim.player; this.lastX = p.x; this.lastZ = p.z; this.walked = 0;
    this.go('walk');
    this.el.classList.add('on');
  }
  go(step) {
    this.step = step; this.t = 0; this.hits0 = this.target?.hitSeq || 0;
    const T = this.touch, ghost = this.ghost;
    const words = {
      walk: T ? ['Touch here. Slide to walk.', ''] : ['W A S D to walk', ''],
      attack: T ? ['Push a little to aim.', 'Push to the edge to attack.'] : ['Point the mouse to aim.', 'Hold the left button to attack.'],
      hold: ['Keep holding', 'to keep swinging.'],
      good: ['Good. Stay alive.', ''],
    }[step];
    this.say.innerHTML = words[0] + (words[1] ? `<small>${words[1]}</small>` : '');
    this.say.classList.add('show');
    this.zl.classList.toggle('show', T && step === 'walk');
    this.zr.classList.toggle('show', T && (step === 'attack' || step === 'hold'));
    ghost.className = 'ghost' + (T && step !== 'good' ? ' show ' + (step === 'walk' ? 'walk' : step === 'attack' ? 'hit' : 'hold') : '');
    if (step === 'attack' && this.target?.dormant) { const d = this.target.dormant; d.locked = false; d.wake = this.sim.time + 0.4; } // (it gets up and comes)
  }
  update(dt, sim, playerScreen) {
    if (!this.step) return;
    // (the game makes its world again right after the hand-off: the lesson moves to it; a later restart or a death ends it)
    if (sim !== this.sim && this.step === 'walk' && sim.time < 2 && sim.level?.floor === 7) { this.start(sim); return; }
    if (sim !== this.sim || sim.player.dead) { this.finish(); return; }
    this.t += dt;
    const p = sim.player, tg = this.target;
    this.walked += Math.hypot(p.x - this.lastX, p.z - this.lastZ); this.lastX = p.x; this.lastZ = p.z;
    // the glow from just below her feet to the bottom (at least the lower third, at most the lower 45%)
    const H = innerHeight, feet = playerScreen?.feetY != null ? playerScreen.feetY + 18 : H * 0.62, top = Math.min(Math.max(feet, H * 0.55), H * 0.67);
    if (Math.abs(top - (this.top ?? -1)) > 3) {
      this.top = top; for (const z of [this.zl, this.zr]) z.style.height = (H - top) + 'px';
      this.say.style.top = Math.max(H * 0.14, top - 128) + 'px';
    }
    const zone = this.step === 'walk' ? 0.25 : 0.75; this.ghost.style.left = zone * innerWidth + 'px'; this.ghost.style.top = (top + (H - top) * 0.5) + 'px';
    if (this.step === 'walk' && this.t > MIN_SHOW && this.walked >= WALK_M) this.go(tg && tg.alive ? 'attack' : 'good');
    else if (this.step === 'attack' && (!tg || !tg.alive || tg.hitSeq > this.hits0)) this.go(tg && tg.alive ? 'hold' : 'good');
    else if (this.step === 'hold' && (!tg || !tg.alive || tg.hitSeq > this.hits0 || this.t > HOLD_MAX)) this.go('good');
    else if (this.step === 'good' && this.t > 1.6) this.finish();
  }
  // a bubble over a button (and a soft pulse round it, pulse = false: the button pulses on its own) for secs, once ever
  cue(key, el, text, sub = '', secs = 4, pulse = true) {
    if (!el || this.cued.has(key)) return; this.cued.add(key);
    if (this.store.get('cue_' + key, false)) return; this.store.set('cue_' + key, true);
    const r = el.getBoundingClientRect(), c = document.createElement('div'); c.className = 'tutCue';
    c.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    c.style.left = Math.min(Math.max(r.left + r.width / 2, 120), innerWidth - 120) + 'px'; c.style.top = (r.top - 14) + 'px';
    document.getElementById('hud').appendChild(c); if (pulse) el.classList.add('cuePulse');
    setTimeout(() => { c.remove(); el.classList.remove('cuePulse'); }, secs * 1000);
  }
  // the others wake as they would have from the start, a beat apart (never all at once)
  release(sim = this.sim) {
    let k = 0;
    for (const h of this.held) if (h.z.alive && h.z.dormant && h.z !== this.target) { h.z.dormant.locked = h.locked; h.z.dormant.wake = (sim?.time || 0) + 1.2 + 1.6 * k++; }
    if (this.target?.dormant) { this.target.dormant.locked = false; this.target.dormant.wake = Math.min(this.target.dormant.wake, (sim?.time || 0) + 0.4); }
    this.held = [];
  }
  finish() {
    if (!this.step) return;
    this.release(); this.step = null; this.store.set('tutorialDone', true);
    this.el.classList.remove('on'); for (const e of [this.zl, this.zr, this.ghost, this.say]) e.classList.remove('show');
  }
}
