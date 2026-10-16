// Move Library (moves.html): Yola playing every library attack clip (assets/moves/yola_moves.glb, catalogue
// assets/moves/catalog.json), grouped by weapon, with any weapon in her hand. Each move can be sorted (good / maybe /
// no) and assigned to one or more weapons with a reason; the selection is saved to shots/move_selection.json.
// The weapon here is a rough placement for judging moves: its primary grip sits at the hand's fist centre (from her
// finger joints), its shaft along the fist's grip axis (pinky -> index), its reference axis toward the knuckles.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeBat, makePistol, prepAxe, prepShotgun, makeKnife } from './render/weaponModels.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SRC_FPS = 30, OUT_FPS = 60;

// ---------------- scene ----------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b2328);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x445055, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 3); scene.add(sun);
scene.add(new THREE.GridHelper(8, 32, 0x4b5f68, 0x33444c));
const controls = new OrbitControls(camera, canvas); controls.target.set(0, 0.85, 0); controls.enableDamping = true;
function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const CAMS = { front: [0, 1.0, 3.6], side: [3.6, 1.0, 0], three: [2.5, 1.6, 2.8], game: [3.2, 4.2, 5.6], top: [0, 5, 0.01] };
function setCam(k) { camera.position.set(...CAMS[k]); controls.target.set(0, 0.85, 0); controls.update(); }
setCam('three');
for (const b of document.querySelectorAll('[data-cam]')) b.onclick = () => setCam(b.dataset.cam);

// ---------------- weapons ----------------
// Defaults (model frames, metres); assets/moves/weapons.json overrides them when present.
const WEAPONS = {
  none: { label: 'None' },
  bat: { label: 'Bat', builder: 'makeBat', hands: 'two', grip_primary: [0, 0, -0.065], shaft_axis: [0, 0, 1], ref_axis: [1, 0, 0] },
  sledgehammer: { label: 'Sledgehammer', file: 'assets/weapons/sledgehammer.glb', hands: 'two', grip_primary: [0, 0, 0], shaft_axis: [0, 1, 0], ref_axis: [0, 0, 1] },
  axe: { label: 'Axe', file: 'assets/weapons/fire_axe.glb', prep: 'axe', hands: 'two', grip_primary: [0, 0, 0], shaft_axis: [0, 0, 1], ref_axis: [-1, 0, 0] },
  crowbar: { label: 'Crowbar', file: 'assets/weapons/crowbar.glb', hands: 'one', grip_primary: [0, 0, 0], shaft_axis: [0, 1, 0], ref_axis: [0, 0, 1] },
  chainsaw: { label: 'Chainsaw', file: 'assets/weapons/chainsaw.glb', hands: 'two', grip_primary: [0, 0, 0], shaft_axis: [0, 0, 1], ref_axis: [1, 0, 0] },
  knife: { label: 'Knife', builder: 'knife', hands: 'one', grip_primary: [0, 0, 0], shaft_axis: [0, 0, 1], ref_axis: [0, 1, 0] },
  pistol: { label: 'Pistol', builder: 'makePistol', hands: 'one', grip_primary: [0, -0.03, -0.012], shaft_axis: [0, 0.96, -0.28], ref_axis: [0, 0, 1] },
  shotgun: { label: 'Shotgun', file: 'assets/weapons/pump_shotgun.glb', prep: 'shotgun', hands: 'two', grip_primary: [0, 0, 0], shaft_axis: [0, 1, 0], ref_axis: [1, 0, 0] },
};
const gltfLoader = new GLTFLoader();
const loadG = (f) => new Promise((res, rej) => gltfLoader.load(f, res, undefined, rej));
const weaponObj = {};
async function weaponModel(key) {
  if (weaponObj[key] !== undefined) return weaponObj[key];
  const w = WEAPONS[key]; let o = null;
  try {
    if (w.builder === 'makeBat') o = makeBat(0.84);
    else if (w.builder === 'makePistol') o = makePistol(1);
    else if (w.builder === 'knife') o = makeKnife();
    else if (w.file) {
      const g = await loadG(w.file);
      o = w.prep === 'axe' ? prepAxe(g) : w.prep === 'shotgun' ? prepShotgun(g) : g.scene;
      o.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    }
  } catch (e) { $('clipInfo').textContent = `Couldn't load ${w.label}: ${e.message || e}`; o = null; }
  if (o) { const holder = new THREE.Group(); holder.add(o); holder.visible = false; scene.add(holder); o = holder; }
  weaponObj[key] = o; return o;
}

// ---------------- Yola ----------------
let actor = null, catalog = null, gripFingers = null;
const bones = {};
class Actor {
  constructor(obj) {
    this.root = new THREE.Group(); this.obj = obj; this.root.add(obj); scene.add(this.root);
    const box = new THREE.Box3().setFromObject(obj); this.root.scale.setScalar(1.62 / (box.max.y - box.min.y)); this.root.updateMatrixWorld(true);
    this.mixer = new THREE.AnimationMixer(obj);
    obj.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
    this.helper = new THREE.SkeletonHelper(obj); this.helper.visible = false; this.helper.material.depthTest = false; scene.add(this.helper);
  }
}
const clips = {};       // name -> AnimationClip (root pinned copy kept separately)
const clipPinned = {};
function pinned(clip) {  // horizontal hips motion pinned to the first frame (vertical kept)
  if (clipPinned[clip.name]) return clipPinned[clip.name];
  const c = clip.clone();
  for (const t of c.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const v = t.values; const x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  clipPinned[clip.name] = c; return c;
}
const useClip = (name) => (S.inPlace ? pinned(clips[name]) : clips[name]);
const t0Of = (c) => Math.min(...c.tracks.map((t) => t.times[0]));

// ---------------- state ----------------
const S = { weapon: 'none', hand: 'Right', roll: 0, slide: 0, flip: false, fists: true, inPlace: true, playing: true, speed: 1,
  mode: 'clip', clip: null, frame: 1, filter: 'all' };
let single = null;  // {action, clip, frames}

// ---------------- clip list ----------------
const openGroups = new Set(['Combos (built)', 'Two-handed: bat / sledgehammer / axe']);  // groups the user has open (kept across list rebuilds)
function markCurrent() {  // highlight the playing move without rebuilding the list (keeps folders open and the scroll)
  for (const e of $('list').querySelectorAll('.clip')) e.classList.toggle('cur', S.mode === 'clip' && e.dataset.clip === S.clip);
}
function buildList() {
  const q = $('search').value.trim().toLowerCase(), list = $('list'), scroll = list.scrollTop; list.innerHTML = '';
  const pass = (c) => { const v = SEL.moves[c.clip]?.verdict || null; return S.filter === 'all' || (S.filter === 'unsorted' ? !v : v === S.filter); };
  for (const g of catalog.groups) {
    const items = catalog.clips.filter((c) => c.group === g && pass(c) && (!q || (c.label + ' ' + c.source + ' ' + c.clip).toLowerCase().includes(q)));
    if (!items.length) continue;
    const d = document.createElement('details'); d.open = !!q || openGroups.has(g);
    d.ontoggle = () => { if (!q) { if (d.open) openGroups.add(g); else openGroups.delete(g); } };
    d.innerHTML = `<summary>${g} <span>(${items.length})</span></summary>`;
    for (const c of items) {
      const e = document.createElement('div'); e.className = 'clip' + (S.clip === c.clip && S.mode === 'clip' ? ' cur' : ''); e.dataset.clip = c.clip;
      const src = c.source.split(' - ')[0].replace(' (Adobe)', '');
      e.innerHTML = `<span>${c.label}<span class="tag">${src}</span><span class="badge"></span></span><small>${(c.frames / SRC_FPS).toFixed(1)}s</small>`;
      e.title = `${c.clip}\n${c.source}\nLicence: ${c.license}\n${c.frames} frames`;
      e.onclick = () => playClip(c.clip);
      d.appendChild(e);
    }
    list.appendChild(d);
  }
  list.scrollTop = scroll; refreshBadges();
}
$('filter').onchange = (e) => { S.filter = e.target.value; buildList(); };
$('search').oninput = buildList;
function playClip(name) {
  S.mode = 'clip'; S.clip = name; S.frame = 1;
  actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.obj);
  const c = useClip(name), a = actor.mixer.clipAction(c); a.play(); a.timeScale = 0; a.setEffectiveWeight(1);
  const cat = catalog.clips.find((x) => x.clip === name);
  single = { action: a, clip: c, frames: cat ? cat.frames : Math.round(c.duration * SRC_FPS) + 1, t0: t0Of(c) };
  $('clipInfo').textContent = cat ? `${cat.label}  |  ${cat.source}  |  licence: ${cat.license}  |  ${cat.frames} frames (${(cat.frames / SRC_FPS).toFixed(2)} s)` : name;
  markCurrent(); renderUse();
}

// ---------------- weapon placement ----------------
const _c = new THREE.Vector3(), _a = new THREE.Vector3(), _k = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const wp = (n, out) => bones[n].getWorldPosition(out);
function fistFrame(side) {  // fist centre, grip axis (pinky -> index), knuckle direction, all from her finger joints
  const H = side + 'Hand', pts = [];
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) if (bones[H + f + i]) pts.push(wp(H + f + i, new THREE.Vector3()));
  const c = new THREE.Vector3(); pts.forEach((p) => c.add(p)); c.multiplyScalar(1 / pts.length);
  const a = wp(H + 'Index1', new THREE.Vector3()).sub(wp(H + 'Pinky1', new THREE.Vector3())).normalize();
  const k = wp(H + 'Middle1', new THREE.Vector3()).sub(c); k.sub(a.clone().multiplyScalar(k.dot(a))).normalize();
  // the curled fingers' centroid sits on the knuckle side of the handle: move toward the palm by ~1 cm
  c.addScaledVector(k, -0.01);
  return { c, a, k };
}
function placeWeapon() {
  for (const [key, o] of Object.entries(weaponObj)) if (o) o.visible = key === S.weapon;
  const w = WEAPONS[S.weapon], o = weaponObj[S.weapon];
  if (!o || !w.shaft_axis) return;
  const F = fistFrame(S.hand);
  const A = F.a.clone().multiplyScalar(S.flip ? -1 : 1);
  const K = F.k.clone().applyAxisAngle(A, THREE.MathUtils.degToRad(S.roll));
  const s = new THREE.Vector3(...w.shaft_axis).normalize(), r0 = new THREE.Vector3(...w.ref_axis);
  const r = r0.sub(s.clone().multiplyScalar(r0.dot(s))).normalize();
  _m.makeBasis(s, r, new THREE.Vector3().crossVectors(s, r));
  _m2.makeBasis(A, K, new THREE.Vector3().crossVectors(A, K));
  _q.setFromRotationMatrix(_m2.multiply(_m.transpose()));
  o.quaternion.copy(_q);
  _p.set(...w.grip_primary).applyQuaternion(_q);
  o.position.copy(F.c).sub(_p).addScaledVector(A, S.slide);
}
function closeFists() {
  if (!S.fists || !gripFingers || S.weapon === 'none') return;
  const two = WEAPONS[S.weapon].hands === 'two';
  for (const [n, q] of Object.entries(gripFingers)) if (two || n.startsWith(S.hand)) bones[n].quaternion.copy(q);
}

// ---------------- use in game: verdicts and weapon assignments ----------------
// Each move gets a verdict (good / maybe / no) and any number of weapon uses, each with an optional reason ("breaking
// down a door", "boss: no combo") and the viewer settings it was judged with (speed, hand, roll, slide, flip).
// Saved on every change to shots/move_selection.json (dev server), with a copy in this browser's storage.
const ASSIGN = ['bat', 'sledgehammer', 'axe', 'crowbar', 'chainsaw', 'knife', 'pistol', 'shotgun', 'none'];  // 'none' = unarmed
const VERD = { good: 'Good for the game', maybe: 'Maybe', no: 'No' };
const wlabel = (k) => (k === 'none' ? 'Unarmed' : WEAPONS[k].label);
const lbl = (clip) => (catalog.clips.find((c) => c.clip === clip) || { label: clip }).label;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let SEL = { moves: {}, updated: null };
const selOf = (clip) => (SEL.moves[clip] ||= { verdict: null, note: '', uses: [] });
let saveTimer = 0;
function saveSel() {
  for (const [k, v] of Object.entries(SEL.moves)) if (!v.verdict && !v.note && !v.uses.length) delete SEL.moves[k];
  SEL.updated = new Date().toISOString();
  try { localStorage.setItem('moves_selection', JSON.stringify(SEL)); } catch { /* private mode */ }
  clearTimeout(saveTimer); $('saved').textContent = 'saving...';
  saveTimer = setTimeout(async () => {
    try { const r = await fetch('/__shot/move_selection.json', { method: 'POST', body: JSON.stringify(SEL, null, 1) }); $('saved').textContent = r.ok ? 'Saved' : 'Save failed'; }
    catch { $('saved').textContent = 'Save failed (is the dev server running?)'; }
  }, 300);
  renderOverview(); refreshBadges();
}
const settingsNow = () => ({ speed: S.speed, hand: S.hand, roll: S.roll, slide: S.slide, flip: S.flip });
const settingsText = (u) => `${u.speed}x · ${u.hand.toLowerCase()} hand · roll ${u.roll}° · slide ${(+u.slide).toFixed(2)} m${u.flip ? ' · flipped' : ''}`;
async function applySettings(u) {
  if (u.weapon && u.weapon !== S.weapon) await setWeapon(u.weapon);
  S.speed = u.speed; $('speed').value = String(u.speed);
  S.hand = u.hand; $('hand').value = u.hand;
  S.roll = u.roll; $('roll').value = u.roll; $('rollV').textContent = u.roll + '°';
  S.slide = u.slide; $('slide').value = u.slide; $('slideV').textContent = (+u.slide).toFixed(2) + ' m';
  S.flip = !!u.flip; $('flip').classList.toggle('on', S.flip);
}
function renderUse() {
  const box = $('use');
  if (!S.clip) { box.innerHTML = '<div class="hint">Pick a move on the left.</div>'; return; }
  const m = selOf(S.clip);
  box.innerHTML = `<div class="curname">${esc(lbl(S.clip))}</div>
    <div class="wrow verd">${Object.entries(VERD).map(([v, t]) => `<button data-v="${v}" class="${m.verdict === v ? 'on ' + v : ''}">${t}</button>`).join('')}</div>
    <h3>Use it with</h3>
    <div class="wrow">${ASSIGN.map((k) => `<button data-w="${k}" class="${m.uses.some((u) => u.weapon === k) ? 'on' : ''}">${wlabel(k)}</button>`).join('')}</div>
    <div id="uses">${m.uses.map((u, i) => `<div class="use"><div class="hd"><b>${wlabel(u.weapon)}</b><button data-del="${i}" title="Remove">&times;</button></div>
      <input type="text" data-why="${i}" value="${esc(u.why)}" placeholder="When / why (optional): e.g. breaking down a door, boss: no combo">
      <div class="hint">${settingsText(u)} <button data-cur="${i}">Use current settings</button> <button data-show="${i}">Show</button></div></div>`).join('')}</div>
    <h3>Note on this move</h3><textarea id="mnote" rows="2" placeholder="Anything else about this move">${esc(m.note)}</textarea>`;
  box.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { m.verdict = m.verdict === b.dataset.v ? null : b.dataset.v; renderUse(); saveSel(); }; });
  box.querySelectorAll('[data-w]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.w, i = m.uses.findIndex((u) => u.weapon === k);
      if (i >= 0) m.uses.splice(i, 1); else m.uses.push({ weapon: k, why: '', ...settingsNow() });
      renderUse(); saveSel();
    };
  });
  box.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { m.uses.splice(+b.dataset.del, 1); renderUse(); saveSel(); }; });
  box.querySelectorAll('[data-why]').forEach((inp) => { inp.onchange = () => { m.uses[+inp.dataset.why].why = inp.value; saveSel(); }; });
  box.querySelectorAll('[data-cur]').forEach((b) => { b.onclick = () => { Object.assign(m.uses[+b.dataset.cur], settingsNow()); renderUse(); saveSel(); }; });
  box.querySelectorAll('[data-show]').forEach((b) => { b.onclick = () => applySettings(m.uses[+b.dataset.show]); });
  $('mnote').onchange = (e) => { m.note = e.target.value; saveSel(); };
}
function renderOverview() {
  const box = $('overview'); if (!catalog) return;
  const n = { good: 0, maybe: 0, no: 0 }; for (const v of Object.values(SEL.moves)) if (v.verdict) n[v.verdict]++;
  const unsorted = catalog.clips.length - n.good - n.maybe - n.no;
  let h = `<div class="piles"><span class="good">Good ${n.good}</span><span class="maybe">Maybe ${n.maybe}</span><span class="no">No ${n.no}</span><span>Unsorted ${unsorted}</span></div>`;
  for (const k of ASSIGN) {
    const list = Object.entries(SEL.moves).flatMap(([clip, v]) => v.uses.filter((u) => u.weapon === k).map((u) => ({ clip, v, u })));
    const live = list.filter((x) => x.v.verdict !== 'no');
    h += `<div class="wsum ${live.length ? '' : 'none'}"><div class="hd"><b>${wlabel(k)}</b><span>${live.length ? (live.length > 1 ? `<span class="multi">${live.length} attacks</span>` : '1 attack') : '<span class="bad">no attack yet</span>'}</span></div>`;
    for (const x of list) h += `<div class="witem" data-clip="${x.clip}" data-w="${k}"><span class="dot ${x.v.verdict || ''}"></span>${esc(lbl(x.clip))}${x.u.why ? ` <i>- ${esc(x.u.why)}</i>` : ''}</div>`;
    h += '</div>';
  }
  box.innerHTML = h;
  box.querySelectorAll('.witem').forEach((e) => { e.onclick = async () => { playClip(e.dataset.clip); const u = selOf(e.dataset.clip).uses.find((q) => q.weapon === e.dataset.w); if (u) await applySettings(u); }; });
}
function refreshBadges() {
  for (const e of $('list').querySelectorAll('.clip')) {
    const v = SEL.moves[e.dataset.clip], b = e.querySelector('.badge');
    if (b) b.innerHTML = v ? `<span class="dot ${v.verdict || ''}"></span>${v.uses.map((u) => `<span class="wtag">${wlabel(u.weapon)}</span>`).join('')}` : '';
  }
}
async function loadSel() {
  let server = null, local = null;
  try { const r = await fetch('shots/move_selection.json?' + Date.now(), { cache: 'no-store' }); if (r.ok) server = await r.json(); } catch { /* none yet */ }
  try { local = JSON.parse(localStorage.getItem('moves_selection') || 'null'); } catch { /* none */ }
  SEL = [server, local].filter(Boolean).sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0] || { moves: {}, updated: null };
}

// ---------------- controls ----------------
async function setWeapon(key) {
  S.weapon = key; await weaponModel(key);
  const w = WEAPONS[key]; if (w.hands === 'one' && key !== 'none') { /* one-handed: keep chosen hand */ }
  for (const b of $('weapons').children) b.classList.toggle('on', b.dataset.w === key);
}
function buildWeaponButtons() {
  const box = $('weapons'); box.innerHTML = '';
  for (const [k, w] of Object.entries(WEAPONS)) { const b = document.createElement('button'); b.textContent = w.label; b.dataset.w = k; b.onclick = () => setWeapon(k); box.appendChild(b); }
  setWeapon('none');
}
$('hand').onchange = (e) => { S.hand = e.target.value; };
$('roll').oninput = (e) => { S.roll = +e.target.value; $('rollV').textContent = S.roll + '°'; };
$('slide').oninput = (e) => { S.slide = +e.target.value; $('slideV').textContent = S.slide.toFixed(2) + ' m'; };
$('flip').onclick = () => { S.flip = !S.flip; $('flip').classList.toggle('on', S.flip); };
$('fists').onclick = () => { S.fists = !S.fists; $('fists').classList.toggle('on', S.fists); };
$('skel').onclick = () => { actor.helper.visible = !actor.helper.visible; $('skel').classList.toggle('on', actor.helper.visible); };
$('inplace').onclick = () => { S.inPlace = !S.inPlace; $('inplace').classList.toggle('on', S.inPlace); if (S.clip) playClip(S.clip); };
$('play').onclick = () => { S.playing = !S.playing; $('play').textContent = S.playing ? 'Pause' : 'Play'; };
$('speed').onchange = (e) => { S.speed = +e.target.value; };
$('panels').onclick = () => document.body.classList.toggle('nopanels');  // hide the side panels to see her full size
$('scrub').oninput = (e) => {
  S.playing = false; $('play').textContent = 'Play';
  if (single) S.frame = 1 + (+e.target.value) * (single.frames - 1);
};
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === ' ') { e.preventDefault(); $('play').click(); }
  if (e.key === 'p' || e.key === 'P') $('panels').click();
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { S.playing = false; $('play').textContent = 'Play'; const d = e.key === 'ArrowRight' ? 1 : -1; S.frame += d; }
});

// ---------------- loop ----------------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (actor) {
    if (S.mode === 'clip' && single) {
      if (S.playing) { S.frame += dt * SRC_FPS * S.speed; if (S.frame > single.frames) S.frame = 1; }
      S.frame = clamp(S.frame, 1, single.frames);
      single.action.time = single.t0 + (S.frame - 1) / SRC_FPS;
      actor.mixer.update(0);
      $('scrub').value = (S.frame - 1) / Math.max(1, single.frames - 1);
      $('info').textContent = `frame ${Math.floor(S.frame)} / ${single.frames}`;
    }
    closeFists();
    actor.root.updateMatrixWorld(true);
    placeWeapon();
  }
  controls.update(); renderer.render(scene, camera);
}

// ---------------- boot ----------------
(async () => {
  try {
    const [yg, mg, cat] = await Promise.all([loadG('assets/yola.glb'), loadG('assets/moves/yola_moves.glb'), fetch('assets/moves/catalog.json', { cache: 'no-store' }).then((r) => r.json())]);
    catalog = cat;
    try { const wj = await (await fetch('assets/moves/weapons.json', { cache: 'no-store' })).json(); for (const [k, v] of Object.entries(wj.weapons || wj)) if (WEAPONS[k]) Object.assign(WEAPONS[k], v); } catch { /* defaults */ }
    yg.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    actor = new Actor(yg.scene);
    for (const c of mg.animations) clips[c.name] = c;
    // her closed-fist finger pose, from a frame of the built bat combo where both hands grip the bat
    const gc = clips.built_bat_combo_v4;
    if (gc) {
      const a = actor.mixer.clipAction(gc); a.play(); a.time = t0Of(gc) + 9 / SRC_FPS; actor.mixer.update(0);
      gripFingers = {};
      for (const [n, b] of Object.entries(bones)) if (/Hand(Thumb|Index|Middle|Ring|Pinky)\d/.test(n)) gripFingers[n] = b.quaternion.clone();
      a.stop(); actor.mixer.uncacheRoot(actor.obj);
    }
    await loadSel(); buildWeaponButtons(); buildList(); renderOverview();
    const first = catalog.clips.find((c) => c.group.startsWith('Two-handed')) || catalog.clips[0];
    playClip(first.clip);
    window.__moves = { S, catalog, clips, WEAPONS, setWeapon, playClip, fistFrame, get SEL() { return SEL; } };
  } catch (e) { $('clipInfo').textContent = 'Failed to load: ' + (e.message || e); console.error(e); }
  tick();
})();
