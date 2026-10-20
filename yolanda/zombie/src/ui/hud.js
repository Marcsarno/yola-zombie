// HUD + menus. Only buttons take pointer events; everything else lets touches reach the sticks.
import { TUNING_DEFAULTS } from '../core/tuning.js';
import { WEAPON_ORDER } from '../core/weapons.js';
const nextWeapon = (w, owned = WEAPON_ORDER) => owned[(owned.indexOf(w) + 1) % owned.length];

const $ = (id) => document.getElementById(id);

const TUNE_SPEC = [
  ['Movement', [
    ['moveSpeed', 'Move speed', 2, 7, 0.1, 'm/s'], ['accel', 'Acceleration', 6, 60, 1, 'm/s²'], ['decel', 'Deceleration', 6, 60, 1, 'm/s²'],
    ['turnRate', 'Turn response', 4, 30, 0.5, 'rad/s'], ['backpedalSpeed', 'Backpedal while aiming', 0.4, 1, 0.02, '×'], ['strafeSpeed', 'Strafe while aiming', 0.5, 1, 0.02, '×'],
  ]],
  ['Weapons', [
    ['attackThreshold', 'Attack threshold', 0.2, 0.9, 0.05, ''], ['pistolInterval', 'Pistol cadence', 0.1, 0.6, 0.01, 's'], ['pistolDamage', 'Pistol damage', 10, 100, 1, ''],
    ['pistolRecoil', 'Recoil', 0, 2, 0.1, '×'], ['pistolKnockback', 'Pistol impact', 0, 5, 0.1, 'm/s'], ['aimAssist', 'Aim assist', 0, 1, 0.05, ''],
    ['reloadTime', 'Reload time', 0.4, 2.5, 0.05, 's'], ['swapTime', 'Swap time', 0.1, 0.8, 0.02, 's'],
    ['shotgunDamage', 'Shotgun pellet damage', 4, 40, 1, ''], ['shotgunKnockback', 'Shotgun impact', 2, 16, 0.5, 'm/s'], ['shotgunInterval', 'Shotgun cadence', 0.4, 1.4, 0.05, 's'],
    ['shotgunReload', 'Shotgun reload', 0.8, 3, 0.05, 's'],
    ['axeDamage', 'Axe damage', 20, 150, 1, ''], ['axeKnockback', 'Axe impact', 1, 10, 0.1, 'm/s'], ['axeSpeed', 'Axe speed', 0.6, 1.6, 0.05, '×'],
    ['axeKnockdown', 'Axe knockdown chance', 0, 1, 0.05, ''], ['hitPause', 'Gun hit pause', 0, 0.16, 0.005, 's'], ['meleeHitPause', 'Melee hit pause', 0, 0.16, 0.005, 's'], ['shake', 'Camera shake', 0, 2, 0.1, '×'],
  ]],
  ['Enemies', [
    ['zombieSpeed', 'Approach speed', 0.5, 3.5, 0.05, 'm/s'], ['zombieHp', 'Zombie health', 30, 300, 5, ''], ['zombieDamage', 'Lunge damage', 0, 40, 1, ''],
    ['scratchDamage', 'Scratch damage', 0, 40, 1, ''], ['zombieEngage', 'Zombies attacking at once', 1, 6, 1, ''], ['zombieAttackGap', 'Gap between attacks', 0, 2, 0.05, 's'],
    ['zombieWindup', 'Lunge wind-up', 0.25, 1.2, 0.02, 's'], ['scratchWindup', 'Scratch wind-up', 0.2, 1, 0.02, 's'],
    ['sprinterSpeed', 'Sprinter charge speed', 2, 9, 0.1, 'm/s'], ['sprinterWindup', 'Orderly charge wind-up', 0.3, 1.5, 0.05, 's'],
  ]],
  ['Finishers', [['execCamPush', 'Camera in (0 = hard cut)', 0, 0.4, 0.01, 's'], ['execCamDist', 'Camera distance', 0.2, 1, 0.02, '×'],
    ['execCamPitch', 'Camera angle (down)', 8, 60, 1, '°'], ['execCamFov', 'Camera field of view', 0.6, 1.1, 0.01, '×'],
    ['execSlowLock', 'Time on the press', 0.05, 1, 0.01, '×'], ['execSlowWind', 'Time through the wind-up', 0.1, 1, 0.01, '×'], ['execWindTime', 'Wind-up length', 0.2, 1.5, 0.05, 's'],
    ['execFreeze', 'Freeze on the hit', 0, 0.3, 0.01, 's'], ['execHang', 'Hang after the hit', 0, 1.2, 0.05, 's'], ['execSlowHang', 'Time through the hang', 0.05, 1, 0.01, '×'],
    ['execRelease', 'Back to normal', 0.05, 1, 0.05, 's'], ['execReach', 'Reach', 1.5, 6, 0.1, 'm']]],
  ['Camera', [['lookAhead', 'Look-ahead', 0, 3, 0.1, 'm'], ['camPitch', 'Camera angle (down)', 30, 75, 1, '°'],
    ['camYaw', 'Camera turn', -45, 45, 1, '°'], ['camWidth', 'Camera width', 3.5, 9, 0.1, 'm']]],
];

export class Hud {
  constructor({ tuning, audio, store, onAction }) {
    this.T = tuning; this.audio = audio; this.store = store; this.act = onAction;
    this.bannerT = 0; this.hintT = 7;
    $('pauseBtn').addEventListener('click', () => this.act('pause'));
    $('resumeBtn').addEventListener('click', () => this.act('resume'));
    for (const b of document.querySelectorAll('[data-act]')) b.addEventListener('click', () => this.act(b.dataset.act, b.dataset.v ? (isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v) : undefined));
    $('restartDeath').addEventListener('pointerdown', (e) => { e.preventDefault(); this.act('restart'); });
    $('restartClear').addEventListener('click', () => this.act('restart'));
    $('tuneBtn').addEventListener('click', () => this.showTuning(true));
    $('tuneClose').addEventListener('click', () => this.showTuning(false));
    $('tuneReset').addEventListener('click', () => { Object.assign(this.T, TUNING_DEFAULTS); this.store.set('tuning', null); this.buildTuning(); });
    $('tuneCopy').addEventListener('click', () => { const s = JSON.stringify(this.T, null, 1); navigator.clipboard?.writeText(s).catch(() => {}); $('tuneCopy').textContent = 'Copied'; setTimeout(() => ($('tuneCopy').textContent = 'Copy values'), 1200); });
    const vol = $('volume'); vol.value = audio.volume;
    vol.addEventListener('input', () => { audio.setVolume(+vol.value); store.set('volume', +vol.value); });
    // the three buses (music, effects, dialogue) under the master volume: 0 silences one without touching the others
    for (const b of ['music', 'sfx', 'voice']) { const el = $('vol_' + b); if (!el) continue; el.value = audio.levels[b]; el.addEventListener('input', () => { audio.setLevel(b, +el.value); store.set('lvl_' + b, +el.value); }); }
    const mute = $('muteBtn');
    const syncMute = () => { mute.textContent = audio.muted ? 'Sound: off' : 'Sound: on'; $('muteTop').classList.toggle('off', audio.muted); };
    const toggleMute = () => { audio.init(); audio.setMuted(!audio.muted); store.set('muted', audio.muted); syncMute(); };
    mute.addEventListener('click', toggleMute); $('muteTop').addEventListener('click', toggleMute); syncMute();
    // A/B the sound work: the new recorded effects (SOUND_PLAN.md) or the classic synthesised set
    const sfxMode = $('sfxModeBtn');
    if (sfxMode) {
      const syncMode = () => { sfxMode.textContent = audio.modern ? 'Effects: new' : 'Effects: classic'; };
      sfxMode.addEventListener('click', () => { audio.setModern(!audio.modern); store.set('sfxModern', audio.modern); syncMode(); });
      syncMode();
    }
    for (const [id, key, def] of [['goreChk', 'gore', true], ['shakeChk', 'shake', true], ['debugChk', 'debug', false]]) {
      const el = $(id); el.checked = id === 'debugChk' ? new URLSearchParams(location.search).get('debug') === '1' : store.get(key, def);
      el.addEventListener('change', () => this.act(key, el.checked));
    }
    $('qualitySel').value = store.get('quality', 'auto');
    if ($('yolaSel')) { $('yolaSel').value = new URLSearchParams(location.search).get('yola') || store.get('yolaModel', '1'); $('yolaSel').addEventListener('change', (e) => this.act('yola', e.target.value)); }
    $('qualitySel').addEventListener('change', (e) => this.act('quality', e.target.value));
    $('perfBtn').addEventListener('click', () => { const r = this.perfReport?.(); $('perfOut').textContent = r ? JSON.stringify(r, null, 1) : '-'; });
    this.buildTuning();
  }

  loading(k) {
    const el = $('loading');
    el.style.display = k >= 1 ? 'none' : 'flex';
    $('loadBar').style.width = Math.round(k * 100) + '%';
  }
  error(msg) { $('loading').style.display = 'flex'; $('loadText').textContent = 'Could not start: ' + msg; }

  buildTuning() {
    const root = $('tuneBody'); root.innerHTML = '';
    for (const [group, rows] of TUNE_SPEC) {
      const h = document.createElement('h3'); h.textContent = group; root.appendChild(h);
      for (const [key, label, min, max, step, unit] of rows) {
        const row = document.createElement('label'); row.className = 'tune-row';
        row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><b></b>`;
        const inp = row.querySelector('input'), out = row.querySelector('b');
        inp.value = this.T[key];
        const show = () => (out.textContent = (+this.T[key]).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0) + (unit ? ' ' + unit : ''));
        show();
        inp.addEventListener('input', () => { this.T[key] = +inp.value; show(); this.store.set('tuning', this.T); });
        root.appendChild(row);
      }
    }
  }

  showTuning(v) { $('tuning').classList.toggle('show', v); $('menu').classList.toggle('show', !v); }

  setPaused(v) {
    $('menu').classList.toggle('show', v);
    if (!v) $('tuning').classList.remove('show');
  }

  onRestart(sim) {
    $('death').classList.remove('show'); $('clear').classList.remove('show'); $('levelDone').classList.remove('show'); this.setPrompt(null);
    $('restartDeath').textContent = sim.level ? 'Retry from checkpoint' : 'Restart';
    this.deathT = -1;
    if (sim.director.mode === 'room1') { this.setObjective(''); this.hintT = 0; $('hint').classList.add('gone'); } else this.setObjective('');
    if (sim.director.mode !== 'room1' && sim.director.mode !== 'hood') this.banner(sim.director.mode === 'calm' ? 'Practice' : sim.director.mode === 'arena' ? 'Weapon test' : sim.director.mode === 'bench' ? `Benchmark: ${sim.director.benchCount}` : 'Survive the ward', sim.director.mode === 'encounter' ? 'Four waves' : sim.director.mode === 'arena' ? 'Pick an attack: ⚔ Attacks' : '');
  }

  // the current objective (the opening hands over "Get out of the operating room.")
  // Floor 3: what Yola can use here (a Use button) or learn here (a short line); null clears both
  setPrompt(p) {
    const key = p ? p.id + (p.usable ? '+' : '-') : '';
    if (key === this.promptKey) return; this.promptKey = key;
    $('useBtn').classList.toggle('show', !!(p && p.usable)); $('useLabel').textContent = p && p.usable ? p.label : '';
    $('prompt').classList.toggle('show', !!(p && !p.usable)); $('prompt').querySelector('span').textContent = p && !p.usable ? p.label : '';
  }
  toast(text) { const t = $('toast'); t.querySelector('span').textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); this.toastT = 2.4; }
  levelDone(sim) { $('levelStats').textContent = this.stats(sim) + ` · ${sim.time.toFixed(0)} s`; setTimeout(() => $('levelDone').classList.add('show'), 1400); this.setPrompt(null); }
  setObjective(text) { const o = $('objective'); if (!o) return; $('objectiveText').textContent = text || ''; o.classList.toggle('show', !!text); }
  // the emergency-lighting edge glow (a CSS overlay: no rendering cost)
  setEmergency(v) { if (v === this.emOn) return; this.emOn = v; document.getElementById('emergency')?.classList.toggle('on', v); }
  // a quick punchy word over the fight (HEADSHOT): pops in big, fades on its own (CSS animation)
  popup(text) { const el = $('popup'); if (!el) return; el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  banner(title, sub = '') {
    $('bannerTitle').textContent = title; $('bannerSub').textContent = sub;
    $('banner').classList.add('show'); this.bannerT = 1.8;
  }

  flash(kind) { const b = $('swapBtn'); b.classList.remove('flash-' + kind); void b.offsetWidth; b.classList.add('flash-' + kind); }
  hurt() { const v = $('vignette'); v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit'); }
  // Yola hit (FINISHERS_PLAN.md 5): the red arc on the side the blow came from (ang: its screen angle, rad, 0 = up, clockwise)
  hurtFrom(ang) { const a = $('hurtArc'); if (!a) return this.hurt(); a.style.setProperty('--hx', (50 + Math.sin(ang) * 58).toFixed(1) + '%'); a.style.setProperty('--hy', (50 - Math.cos(ang) * 58).toFixed(1) + '%'); a.classList.remove('go'); void a.offsetWidth; a.classList.add('go'); }
  drain() { const d = $('drain'); if (!d) return; d.classList.remove('go'); void d.offsetWidth; d.classList.add('go'); }
  screenFlash() { const f = $('flash'); if (!f) return; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); } // (a perfect dodge)
  death(sim) { this.deathT = 0; $('deathStats').textContent = this.stats(sim); }
  cleared(sim) { $('clearStats').textContent = this.stats(sim) + ` · ${sim.time.toFixed(0)} s`; setTimeout(() => $('clear').classList.add('show'), 900); }
  stats(sim) {
    const s = sim.stats, acc = s.shots ? Math.round((100 * s.shotHits) / s.shots) : 0;
    return `${s.kills} down · guns ${acc}% · axe ${s.batHits}/${s.swings}`;
  }

  update(sim, dt) {
    const p = sim.player;
    $('hpFill').style.width = (100 * p.hp) / p.maxHp + '%';
    $('hp').classList.toggle('low', p.hp <= 30);
    $('wave').textContent = sim.director.label + (sim.director.state === 'breather' && !sim.director.cleared && sim.director.mode === 'encounter' ? ` · ${Math.max(0, sim.director.timer).toFixed(0)}` : '');
    // weapon button: current weapon big, the other small; pending swap pulses
    const b = $('swapBtn');
    b.dataset.weapon = p.equipped;
    b.classList.toggle('pending', p.desired !== p.equipped);
    b.dataset.next = p.desired === p.equipped ? nextWeapon(p.equipped, p.owned) : p.desired;
    b.classList.toggle('solo', p.owned.length < 2); // nothing to swap to
    const res = p.reserve?.[p.equipped];
    $('ammo').textContent = p.equipped in p.mags ? (p.action.type === 'reload' ? '…' : Number.isFinite(res) ? `${p.ammo} · ${res}` : p.ammo) : '';
    const ring = $('ring');
    let prog = 0;
    if (p.action.type === 'reload') prog = p.action.t / p.reloadTime();
    else if (p.action.type === 'swap') prog = p.action.t / this.T.swapTime;
    ring.style.strokeDashoffset = String(176 * (1 - Math.min(1, prog)));
    ring.style.opacity = prog > 0 ? 1 : 0;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.remove('show'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('show'); }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('hint').classList.add('gone'); }
    if (this.deathT >= 0) { this.deathT += dt; if (this.deathT > 0.8) $('death').classList.add('show'); }
  }
}
