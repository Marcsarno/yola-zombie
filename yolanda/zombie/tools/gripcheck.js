// Yola's hold on every weapon, in the REAL game (combat.html?mode=calm, ?yola=2 for the new Yola), from the page console:
//   const C = await import('/zombie/tools/gripcheck.js?' + Date.now());
//   await C.sheet('pistol', 'idle')            close-ups around the hands (8 angles) + front / side, standing
//   await C.sheet('pistol', 'walk')            a walk cycle (8 frames) from the side and from the front three-quarter
//   await C.measure('pistol', 'walk')          numbers, every 4th 60 Hz frame of a cycle (see measure())
// Weapons: pistol, shotgun, axe, bat, fists. Gaits: idle, walk (stick 0.4), run (full stick), strafe, back.
// Sheets go to zombie/shots/grip_<weapon>_<gait>.png, numbers to shots/grip_<weapon>_<gait>.json.
const G = () => window.game;
const T = () => G().THREE;
const GAITS = { idle: [0, 0], walk: [0, 0.4], run: [0, 1], strafe: [0.45, 0], back: [0, -0.4] };
const eqKey = (w, y) => (w === 'bat' ? (y.batLib ? 'sword' : 'axe') : w);

// fresh calm room, zombies out of the way, holding `weapon` (already swapped in: no swap blend), standing
export function setup(weapon) {
  const g = G(); g.restart('calm');
  for (const z of g.sim.zombies) { z.x = 50; z.z = 50; z.solid = false; }
  g.sim.player.setLoadout([weapon]);
  const y = g.yola; for (const k in y.up) y.up[k] = 0; y.up[eqKey(weapon, y)] = 1;
  g.hudShow(false);
  drive('idle', 30);
}
// hold a gait for n 60 Hz frames, Yola pinned in place (the floor still scrolls under her feet as in play). The aim
// follows the travel (walk / run: facing the way she goes; strafe / back: facing the screen's up).
let face = null;
export function drive(gait, n) {
  const g = G(), p = g.sim.player, [mx, mz] = GAITS[gait];
  const ax = gait === 'walk' || gait === 'run' ? mx : 0, az = gait === 'walk' || gait === 'run' ? mz : 1;
  g.scriptInput = () => ({ moveX: mx, moveZ: mz, aimX: ax * 0.3, aimZ: az * 0.3, swapPresses: 0 });
  for (let i = 0; i < n; i++) { p.x = p.px = 0.4; p.z = p.pz = 0; g.tick(1, 1 / 60, false); }
  g.scriptInput = null;
  face = p.aimYaw;
}

// ---- rendering ----
function grip(side, out) { return G().yola.grip(side, out); }
function handsMid(out) { const a = grip('Right', new (T().Vector3)()), b = grip('Left', new (T().Vector3)()); return out.copy(a).add(b).multiplyScalar(0.5); }
// render from yaw (deg, 0 = in front of her) / pitch, looking at `at`, at distance d; returns a square crop
function view(at, yawDeg, pitchDeg, d, fov = 32) {
  const g = G(), cam = g.camera, yaw = face + yawDeg * Math.PI / 180, pi = pitchDeg * Math.PI / 180;
  const f0 = cam.fov; cam.fov = fov; cam.updateProjectionMatrix();
  cam.position.set(at.x + Math.sin(yaw) * Math.cos(pi) * d, at.y + Math.sin(pi) * d, at.z + Math.cos(yaw) * Math.cos(pi) * d);
  cam.lookAt(at);
  g.looks.render();
  cam.fov = f0; cam.updateProjectionMatrix();
  return g.renderer.domElement;
}
function tile(c2, cv, x, y, W, label, sub) {
  const s = Math.min(cv.width, cv.height);
  c2.drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, x, y, W, W);
  c2.fillStyle = 'rgba(0,0,0,0.55)'; c2.fillRect(x, y, W, 24);
  c2.fillStyle = '#ffe14d'; c2.font = 'bold 15px sans-serif'; c2.fillText(label, x + 6, y + 17);
  if (sub) { c2.fillStyle = '#fff'; c2.font = '13px sans-serif'; c2.fillText(sub, x + 6, y + W - 8); }
}
async function save(canvas, name) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  await fetch('/__shot/' + name, { method: 'POST', body: blob });
  return name;
}
// around the hands: 8 angles when they hold the weapon together, 4 around each hand when they are apart (the one-handed
// bat, empty hands). Views from behind look down over the shoulder (level, the camera would be inside her head).
const ANG8 = [['front', 0, 8], ['front-left', 45, 8], ['left', 90, 8], ['back-left', 135, 38], ['back', 180, 45], ['back-right', 225, 38], ['right', 270, 8], ['front-right', 315, 8]];
const ANG4 = { Right: [['front', 0, 8], ['outside', 270, 8], ['above', 200, 50], ['inside', 90, 10]], Left: [['front', 0, 8], ['outside', 90, 8], ['above', 160, 50], ['inside', 270, 10]] };
function closeups() {
  const V = T().Vector3, r = grip('Right', new V()), l = grip('Left', new V());
  if (r.distanceTo(l) < 0.3) return ANG8.map(([n, yaw, pitch]) => ({ label: 'hands ' + n, at: handsMid(new V()), yaw, pitch, d: 0.85 }));
  return ['Right', 'Left'].flatMap((s) => ANG4[s].map(([n, yaw, pitch]) => ({ label: `${s.toLowerCase()} hand ${n}`, at: grip(s, new V()), yaw, pitch, d: 0.6 })));
}
function header(c2, out, title) {
  c2.fillStyle = '#111'; c2.fillRect(0, 0, out.width, out.height);
  c2.fillStyle = '#fff'; c2.font = 'bold 20px sans-serif'; c2.fillText(title, 8, 22);
}

// idle: 8 close-ups around the hands + full front and side. Moving gaits: 8 frames over a stride, waist-up from the side
// and full body from the front three-quarter.
export async function sheet(weapon, gait = 'idle', { W = 360, tag = '', marks = true } = {}) {
  setup(weapon);
  const V = T().Vector3;
  const out = document.createElement('canvas'), c2 = out.getContext('2d');
  const title = `${weapon} - ${gait}  (Yola ${G().yolaModel})${tag ? '  ' + tag : ''}`;
  const sum = (r) => Object.entries(r).filter(([k]) => k !== 'marks').map(([k, v]) => `${k.replace(/Into/, '>').replace(/To/, '>')} ${v.mm}`).join('  ');
  if (gait === 'idle') {
    drive('idle', 90);
    const rep = frameReport(weapon, { marks }); showMarks(rep.marks);
    out.width = 5 * W; out.height = 2 * W + 52; header(c2, out, title);
    c2.font = '13px sans-serif'; c2.fillStyle = '#9fe'; c2.fillText('mm in (dots: yellow weapon>body, red arm>body, orange upper arm>torso, magenta skin>weapon; fist>weapon < 0 = handle in the fist):  ' + sum(rep), 8, 44);
    closeups().forEach((c, k) => tile(c2, view(c.at, c.yaw, c.pitch, c.d), (k % 4) * W, 52 + Math.floor(k / 4) * W, W, c.label));
    const body = new V(G().sim.player.x, 0.88, G().sim.player.z);
    tile(c2, view(body, 0, 4, 3.4), 4 * W, 52, W, 'body front');
    tile(c2, view(body, 90, 4, 3.4), 4 * W, 52 + W, W, 'body left side');
  } else {
    drive(gait, 120);
    const y = G().yola, cols = 4;
    out.width = cols * W; out.height = 4 * W + 30; header(c2, out, title);
    for (let k = 0; k < 8; k++) {
      if (k) drive(gait, 5);
      const rep = frameReport(weapon, { marks }); showMarks(rep.marks);
      const at = handsMid(new V()); at.y = Math.max(at.y, 0.95);
      const x = (k % cols) * W, y0 = 30 + Math.floor(k / cols) * 2 * W, worst = Object.entries(rep).filter(([kk]) => kk !== 'marks' && !kk.startsWith('fist')).sort((a, b) => b[1].mm - a[1].mm)[0];
      tile(c2, view(at, gait === 'strafe' ? 0 : 90, 6, 1.35), x, y0, W, `${gait === 'strafe' ? 'front' : 'side'}  phase ${y.phase.toFixed(2)}`, worst ? `worst ${worst[0]} ${worst[1].mm} mm` : '');
      tile(c2, view(new V(G().sim.player.x, 0.88, G().sim.player.z), 35, 6, 3.2), x, y0 + W, W, 'front 3/4');
    }
  }
  showMarks(null);
  return save(out, `grip_${weapon}_${gait}${tag ? '_' + tag : ''}.png`);
}

// ---- numbers: everything tested against her skinned mesh as rendered (vertices posed by the bones) ----
// region of each vertex: its strongest bone
const REGION = [[/^(Left|Right)Hand/, (m) => 'hand_' + m[1][0]], [/^(Left|Right)ForeArm/, (m) => 'forearm_' + m[1][0]], [/^(Left|Right)Arm$/, (m) => 'upperarm_' + m[1][0]],
  [/^(Left|Right)UpLeg/, (m) => 'thigh_' + m[1][0]], [/^(Left|Right)Leg/, (m) => 'shin_' + m[1][0]], [/^(Left|Right)(Foot|Toe)/, (m) => 'foot_' + m[1][0]],
  [/^(Left|Right)Shoulder/, (m) => 'shoulder_' + m[1][0]], [/^(Neck|Head)/, () => 'head'], [/^(Hips|Spine)/, () => 'torso']]; // (the deltoid's top overhangs the upper arm: the arm's own)
let BODY = null;
function body() {
  if (BODY) return BODY;
  const meshes = []; G().yola.model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const B = { meshes: [], tris: [], triRegion: [], vRegion: [] };
  for (const o of meshes) {
    const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index;
    const names = o.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
    const reg = new Array(pos.count), mixed = new Uint8Array(pos.count), bone = new Array(pos.count), sets = new Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      let best = 0, bw = -1; const rs = new Set();
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); }
        if (w > 0.05) { const n = names[si.getComponent(i, k)]; for (const [re, f] of REGION) { const m = re.exec(n); if (m) { rs.add(f(m)); break; } } }
      }
      const n = names[best]; reg[i] = 'other';
      for (const [re, f] of REGION) { const m = re.exec(n); if (m) { reg[i] = f(m); break; } }
      bone[i] = n; mixed[i] = rs.size > 1 ? 1 : 0; sets[i] = rs; // (a joint's blend ring: skin shared by two regions, never clipping itself)
    }
    const base = B.vRegion.length; B.vRegion.push(...reg); (B.vBone ||= []).push(...bone); (B.vSet ||= []).push(...sets); B.meshes.push({ o, base, count: pos.count, mixed });
    const nt = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < nt; t++) { const a = idx ? idx.getX(3 * t) : 3 * t, b = idx ? idx.getX(3 * t + 1) : 3 * t + 1, c = idx ? idx.getX(3 * t + 2) : 3 * t + 2; B.tris.push(base + a, base + b, base + c); }
  }
  B.nv = B.vRegion.length; B.P = new Float32Array(B.nv * 3);
  B.mixed = new Uint8Array(B.nv); for (const m of B.meshes) B.mixed.set(m.mixed, m.base);
  for (let t = 0; t < B.tris.length / 3; t++) B.triRegion.push(B.vRegion[B.tris[3 * t]]); // (a face's region: its first vertex's)
  // faces touching a blend ring: left out of the targets (the skin there is shared by both sides of the joint)
  // (only an arm's own skin: the hip-thigh blend stays, or the thigh's surface gets holes and points beside them read as inside)
  B.triArm = { R: new Uint8Array(B.tris.length / 3), L: new Uint8Array(B.tris.length / 3) };
  for (const s of ['R', 'L']) { const own = ['shoulder_' + s, 'upperarm_' + s, 'forearm_' + s, 'hand_' + s]; for (let t = 0; t < B.triArm[s].length; t++) for (let k = 0; k < 3; k++) if (own.some((r) => B.vSet[B.tris[3 * t + k]].has(r))) B.triArm[s][t] = 1; }
  // Tripo's inner layer under the clothes (faces looking at the inside of the outer layer, as tools/anim/yola2_bake.py
  // drops them): left out, or a point between the two layers would read as outside. Found once, at the bind pose.
  const bind = new Float32Array(B.nv * 3);
  for (const m of B.meshes) { const p = m.o.geometry.attributes.position; for (let i = 0; i < m.count; i++) { bind[3 * (m.base + i)] = p.getX(i); bind[3 * (m.base + i) + 1] = p.getY(i); bind[3 * (m.base + i) + 2] = p.getZ(i); } }
  const sc = bindScale(bind), grid = makeGrid(bind, B.tris, null, 0.03 * sc);
  B.inner = new Uint8Array(B.tris.length / 3);
  const n = [0, 0, 0], c = [0, 0, 0], m = [0, 0, 0];
  for (let t = 0; t < B.tris.length / 3; t++) {
    triNormal(bind, B.tris, t, n); triCentre(bind, B.tris, t, c);
    const hit = rayFirst(grid, bind, B.tris, [c[0] + n[0] * 2e-4 * sc, c[1] + n[1] * 2e-4 * sc, c[2] + n[2] * 2e-4 * sc], n, 0.08 * sc, t);
    if (hit >= 0) { triNormal(bind, B.tris, hit, m); if (m[0] * n[0] + m[1] * n[1] + m[2] * n[2] > 0.2) B.inner[t] = 1; }
  }
  B.vInner = new Uint8Array(B.nv); for (let t = 0; t < B.inner.length; t++) if (B.inner[t]) for (let k = 0; k < 3; k++) B.vInner[B.tris[3 * t + k]] = 1;
  console.log('gripcheck body', B.nv, 'verts', B.tris.length / 3, 'faces, inner', B.inner.reduce((a, b) => a + b, 0), 'bind scale', sc.toFixed(3));
  return (BODY = B);
}
// metres per bind-pose unit (Tripo meshes are 1 unit tall, scaled to her height in the game)
function bindScale(P) { let y0 = 1e9, y1 = -1e9; for (let i = 1; i < P.length; i += 3) { y0 = Math.min(y0, P[i]); y1 = Math.max(y1, P[i]); } return (y1 - y0) / G().yola.H; }
function posed() {
  const B = body(), v = new (T().Vector3)();
  G().yola.model.updateMatrixWorld(true);
  for (const m of B.meshes) for (let i = 0; i < m.count; i++) { m.o.getVertexPosition(i, v); m.o.localToWorld(v); B.P[3 * (m.base + i)] = v.x; B.P[3 * (m.base + i) + 1] = v.y; B.P[3 * (m.base + i) + 2] = v.z; }
  return B;
}
function triNormal(P, I, t, out) {
  const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
  const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l; return out;
}
function triCentre(P, I, t, out) { for (let k = 0; k < 3; k++) out[k] = (P[3 * I[3 * t] + k] + P[3 * I[3 * t + 1] + k] + P[3 * I[3 * t + 2] + k]) / 3; return out; }
// uniform grid over the faces passing keep(t)
function makeGrid(P, I, keep, h) {
  const cells = new Map(), key = (x, y, z) => (x + 512) + (y + 512) * 1024 + (z + 512) * 1048576;
  for (let t = 0; t < I.length / 3; t++) {
    if (keep && !keep(t)) continue;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let k = 0; k < 3; k++) { const j = 3 * I[3 * t + k]; x0 = Math.min(x0, P[j]); x1 = Math.max(x1, P[j]); y0 = Math.min(y0, P[j + 1]); y1 = Math.max(y1, P[j + 1]); z0 = Math.min(z0, P[j + 2]); z1 = Math.max(z1, P[j + 2]); }
    for (let x = Math.floor(x0 / h); x <= Math.floor(x1 / h); x++) for (let y = Math.floor(y0 / h); y <= Math.floor(y1 / h); y++) for (let z = Math.floor(z0 / h); z <= Math.floor(z1 / h); z++) {
      const k = key(x, y, z); let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(t);
    }
  }
  return { cells, h, key };
}
// first face hit along a ray within len (Moller-Trumbore), or -1
function rayFirst(grid, P, I, o, d, len, skip) {
  const seen = new Set(); let best = len, hit = -1;
  for (let s = 0; s <= len; s += grid.h * 0.5) {
    const k = grid.key(Math.floor((o[0] + d[0] * s) / grid.h), Math.floor((o[1] + d[1] * s) / grid.h), Math.floor((o[2] + d[2] * s) / grid.h));
    for (const t of grid.cells.get(k) || []) {
      if (t === skip || seen.has(t)) continue; seen.add(t);
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-14) continue;
      const tx = o[0] - P[a], ty = o[1] - P[a + 1], tz = o[2] - P[a + 2], u = (tx * px + ty * py + tz * pz) / det; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) / det; if (v < 0 || u + v > 1) continue;
      const dist = (e2x * qx + e2y * qy + e2z * qz) / det; if (dist > 1e-7 && dist < best) { best = dist; hit = t; }
    }
  }
  return hit;
}
// closest point on a triangle (Ericson, Real-Time Collision Detection 5.1.5)
function closestTri(p, P, I, t, out) {
  const A = 3 * I[3 * t], Bi = 3 * I[3 * t + 1], Ci = 3 * I[3 * t + 2];
  const a = [P[A], P[A + 1], P[A + 2]], b = [P[Bi], P[Bi + 1], P[Bi + 2]], c = [P[Ci], P[Ci + 1], P[Ci + 2]];
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const set = (q) => { out[0] = q[0]; out[1] = q[1]; out[2] = q[2]; return out; };
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return set(a);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return set(b);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return set([a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return set(c);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return set([a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]); }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return set([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return set([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}
// signed distance from p to the grid's surface within one cell (negative = inside). The sign comes from the normal averaged
// over every face sharing the closest point (on an edge or a corner: its neighbours' mean, a pseudo-normal). null: none near.
function signedDist(grid, P, I, p) {
  const h = grid.h, cx = Math.floor(p[0] / h), cy = Math.floor(p[1] / h), cz = Math.floor(p[2] / h), q = [0, 0, 0], n = [0, 0, 0];
  let best = 1e9, cand = [];
  for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
    for (const t of grid.cells.get(grid.key(x, y, z)) || []) {
      closestTri(p, P, I, t, q); const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d < best - 1e-6) { best = d; cand = [[t, q.slice()]]; } else if (d < best + 1e-6) cand.push([t, q.slice()]);
    }
  }
  if (best > h) return null;
  const nn = [0, 0, 0]; for (const [t] of cand) { triNormal(P, I, t, n); nn[0] += n[0]; nn[1] += n[1]; nn[2] += n[2]; }
  const c = cand[0][1], s = (p[0] - c[0]) * nn[0] + (p[1] - c[1]) * nn[1] + (p[2] - c[2]) * nn[2], nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
  // inside = straight behind the surface (against its normal); a point beside a hole the left-out skin leaves sees a far face's
  // edge side-on, never from behind
  const inside = best > 1e-9 && s / (best * nl) < -0.5;
  return { d: inside ? -best : best, t: cand[0][0] };
}
// the weapon in her hands as triangles (world), and points on its surface every ~1 cm
function weaponMesh() {
  const y = G().yola, objs = [y.pistol, y.shotgun, y.melee, y.batLib?.obj, y.test?.obj].filter((o) => o && o.visible);
  const P = [], I = [], pts = [], v = new (T().Vector3)();
  for (const root of objs) root.traverse((o) => {
    if (!o.isMesh) return;
    for (let a = o; a; a = a.parent) if (!a.visible) return;
    o.updateWorldMatrix(true, false);
    const g = o.geometry, pos = g.attributes.position, idx = g.index, base = P.length / 3;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z); }
    const nt = idx ? idx.count / 3 : pos.count / 3, i0 = I.length;
    for (let t = 0; t < nt; t++) I.push(base + (idx ? idx.getX(3 * t) : 3 * t), base + (idx ? idx.getX(3 * t + 1) : 3 * t + 1), base + (idx ? idx.getX(3 * t + 2) : 3 * t + 2));
    // faces wound inward (three's LatheGeometry: the bat) are turned out: the sign of the volume they enclose about their centre
    let cx = 0, cy = 0, cz = 0; for (let i = base; i < P.length / 3; i++) { cx += P[3 * i]; cy += P[3 * i + 1]; cz += P[3 * i + 2]; }
    const nv = P.length / 3 - base; cx /= nv; cy /= nv; cz /= nv;
    let vol = 0;
    for (let k = i0; k < I.length; k += 3) {
      const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
      const ax = P[a] - cx, ay = P[a + 1] - cy, az = P[a + 2] - cz, bx = P[b] - cx, by = P[b + 1] - cy, bz = P[b + 2] - cz, qx = P[c] - cx, qy = P[c + 1] - cy, qz = P[c + 2] - cz;
      vol += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
    }
    if (vol < 0) for (let k = i0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
  });
  for (let t = 0; t < I.length / 3; t++) {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const L = Math.max(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]), Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]), Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2]));
    const n = Math.max(1, Math.ceil(L / 0.01));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const u = i / n, w = j / n, z = 1 - u - w; pts.push([P[a] * z + P[b] * u + P[c] * w, P[a + 1] * z + P[b + 1] * u + P[c + 1] * w, P[a + 2] * z + P[b + 2] * u + P[c + 2] * w]); }
  }
  return { P: new Float32Array(P), I, pts };
}
const HANDS = { pistol: ['R', 'L'], shotgun: ['R', 'L'], axe: ['R', 'L'], bat: ['R'], fists: [] };
// The grip fit for each gripping hand (HOLD_DEFS palm / open), standing: first how far the handle sits from the closed fist's
// centre toward the fingers (palm, bisection: the palm at most target mm into the grip, the fingers held open meanwhile), then
// how far each finger opens from the clip's fist (each on its own: the weapon is placed from the closed fist; a finger that never
// gets there takes its best amount). Sets the game's live values; returns them for core/weapons.js HOLD_DEFS.
const FIT_HANDS = { pistol: ['R'], shotgun: ['R', 'L'], axe: ['R', 'L'], bat: ['R'] }; // (the pistol's left hand wraps the right fist, not the grip)
export function fitGrip(weapon, { target = 2.5 } = {}) {
  const H = G().HOLD_DEFS, y = G().yola, res = {};
  for (const s of FIT_HANDS[weapon]) {
    const side = s === 'R' ? 'Right' : 'Left', K = Object.fromEntries(FINGERS.map((f) => [f, 0.9]));
    const setPalm = (v) => { if (weapon === 'bat') y.batLib.palm = v; else H[weapon].palm[side] = v; };
    if (weapon === 'bat') y.batLib.open = K; else H[weapon].open[side] = K;
    const pen = () => { setup(weapon); drive('idle', 20); return frameReport(weapon, { perFinger: true })['fingers' + s]; };
    let lo = 0, hi = 0.04; setPalm(0);
    if (pen().Palm > target) { for (let it = 0; it < 7; it++) { const m = (lo + hi) / 2; setPalm(m); if (pen().Palm > target) lo = m; else hi = m; } setPalm(+hi.toFixed(4)); } else hi = 0;
    const out = { palm: +hi.toFixed(4) };
    for (const f of FINGERS) K[f] = 0;
    const p0 = pen();
    for (const f of FINGERS) {
      if (p0[f] <= target) { out[f] = [0, p0[f]]; continue; }
      let a = 0, b = 0.9, best = [0, p0[f]];
      for (let it = 0; it < 6; it++) { const m = (a + b) / 2; K[f] = m; const p = pen()[f]; if (p < best[1]) best = [m, p]; if (p > target) a = m; else b = m; }
      K[f] = b; const pb = pen()[f]; if (pb < best[1] || pb <= target) best = [b, pb];
      K[f] = +best[0].toFixed(2); out[f] = [K[f], +best[1].toFixed(1)];
    }
    out.after = pen();
    res[side] = out;
  }
  return res;
}
// one posed frame, depths in mm (positive = into): the weapon into her body (the gripping hands left out), each forearm and
// hand into the rest of her, the upper arms into the torso (sleeves: the first 1 cm allowed), the gripping hands' skin into
// the weapon, and each gripping fist's centre to the weapon's surface (negative: the handle passes through the fist)
// marks: collect every point more than 3 mm in (report.marks: [x, y, z, mm, kind]) for showMarks()
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
export function frameReport(weapon, { marks = false, perFinger = false } = {}) {
  const B = posed(), W = weaponMesh(), hands = HANDS[weapon] || [], out = {}, M = [];
  const deep = (grid, P, I, pts, regionOf, kind) => {
    let worst = 0, where = '', n = 0;
    for (const p of pts) {
      const r = signedDist(grid, P, I, p); if (!r || r.d >= 0) continue;
      const dep = -r.d * 1000; if (dep > 3) { n++; if (marks) M.push([p[0], p[1], p[2], dep, kind]); }
      if (dep > worst) { worst = dep; where = regionOf ? regionOf(r.t) : ''; }
    }
    return { mm: +worst.toFixed(1), at: where, n };
  };
  const reg = (t) => B.triRegion[t], vert = (i) => [B.P[3 * i], B.P[3 * i + 1], B.P[3 * i + 2]];
  if (W.pts.length) {
    const g = makeGrid(B.P, B.tris, (t) => !B.inner[t] && !hands.some((h) => B.triRegion[t] === 'hand_' + h), 0.03);
    out.weaponIntoBody = deep(g, B.P, B.tris, W.pts, reg, 'weapon');
  }
  for (const s of ['R', 'L']) {
    const o = s === 'R' ? 'L' : 'R', tgt = new Set(['torso', 'head', 'thigh_R', 'thigh_L', 'shin_R', 'shin_L', 'shoulder_' + o, 'hand_' + o, 'forearm_' + o, 'upperarm_' + o]);
    const g = makeGrid(B.P, B.tris, (t) => !B.inner[t] && !B.triArm[s][t] && tgt.has(B.triRegion[t]), 0.03);
    const pts = []; for (let i = 0; i < B.nv; i++) if (!B.vInner[i] && !B.mixed[i] && (B.vRegion[i] === 'hand_' + s || B.vRegion[i] === 'forearm_' + s)) pts.push(vert(i));
    out['arm' + s + 'IntoBody'] = deep(g, B.P, B.tris, pts, reg, 'arm');
    const gt = makeGrid(B.P, B.tris, (t) => !B.inner[t] && !B.triArm[s][t] && B.triRegion[t] === 'torso', 0.03);
    const up = []; for (let i = 0; i < B.nv; i++) if (!B.vInner[i] && !B.mixed[i] && B.vRegion[i] === 'upperarm_' + s) up.push(vert(i));
    out['upperArm' + s + 'IntoTorso'] = deep(gt, B.P, B.tris, up, reg, 'upper');
  }
  if (W.pts.length) {
    const gw = makeGrid(W.P, W.I, null, 0.03), F = { c: new (T().Vector3)(), a: new (T().Vector3)(), k: new (T().Vector3)() };
    for (const s of hands) {
      const pts = []; for (let i = 0; i < B.nv; i++) if (B.vRegion[i] === 'hand_' + s) pts.push(vert(i));
      const f = deep(gw, W.P, W.I, pts, null, 'fingers'); out['skin' + s + 'IntoWeapon'] = { mm: f.mm, n: f.n };
      if (perFinger) { const side = s === 'R' ? 'Right' : 'Left'; out['fingers' + s] = {}; for (const fn of [...FINGERS, 'Palm']) { const fp = []; for (let i = 0; i < B.nv; i++) if (fn === 'Palm' ? B.vBone[i] === side + 'Hand' : B.vBone[i].startsWith(side + 'Hand' + fn)) fp.push(vert(i)); out['fingers' + s][fn] = deep(gw, W.P, W.I, fp).mm; } }
      G().yola.fistFrame(s === 'R' ? 'Right' : 'Left', F);
      let best = 1e9; const q = [0, 0, 0], c = [F.c.x, F.c.y, F.c.z];
      for (let t = 0; t < W.I.length / 3; t++) { closestTri(c, W.P, W.I, t, q); const d = Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]); if (d < best) best = d; } // (the lathe's pole faces are degenerate: NaN never wins)
      const r = signedDist(gw, W.P, W.I, c);
      out['fist' + s + 'ToWeapon'] = { mm: +(((r && r.d < 0) ? -best : best) * 1000).toFixed(1) };
    }
  }
  if (marks) out.marks = M;
  return out;
}
// red dots (drawn over everything) at the points that went in: yellow = weapon into her, red = arm into her body, orange =
// upper arm into the torso, magenta = her fingers into the weapon. null clears them.
let MARKS = null;
export function showMarks(list) {
  const THREE = T(), scene = G().scene;
  if (MARKS) { scene.remove(MARKS); MARKS.geometry.dispose(); MARKS.material.dispose(); MARKS = null; }
  if (!list || !list.length) return;
  const col = { weapon: [1, 0.9, 0], arm: [1, 0, 0], upper: [1, 0.5, 0], fingers: [1, 0, 1] };
  const pos = new Float32Array(list.length * 3), c = new Float32Array(list.length * 3);
  list.forEach((m, i) => { pos.set(m.slice(0, 3), 3 * i); c.set(col[m[4]] || [1, 0, 0], 3 * i); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  MARKS = new THREE.Points(g, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true }));
  MARKS.renderOrder = 999; MARKS.frustumCulled = false; scene.add(MARKS);
}
// a gait's numbers over about one stride (every `every`th 60 Hz frame): the worst of each measure and its phase
export async function measure(weapon, gait = 'idle', { frames = 64, every = 4 } = {}) {
  setup(weapon); drive(gait, 60);
  const rows = [];
  for (let f = 0; f < frames; f += every) { drive(gait, every); const r = frameReport(weapon); r.phase = +G().yola.phase.toFixed(2); rows.push(r); await new Promise((res) => setTimeout(res, 0)); }
  const worst = {};
  for (const k of Object.keys(rows[0])) {
    if (k === 'phase') continue;
    let bi = 0; rows.forEach((r, i) => { if (r[k].mm > rows[bi][k].mm) bi = i; });
    worst[k] = { ...rows[bi][k], phase: rows[bi].phase };
  }
  const rep = { weapon, gait, yola: G().yolaModel, worst, rows };
  await fetch('/__shot/' + `grip_${weapon}_${gait}.json`, { method: 'POST', body: JSON.stringify(rep, null, 1) });
  return worst;
}
