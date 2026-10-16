// Measure the Hospital Weapons Core pistol (assets/weapons/pistol_core.glb) for the game's hold data (core/weapons.js HOLD_DEFS):
// the named markers, the bounds, the barrel direction and the GRIP (where the closed fist's centre goes, the grip's long axis
// bottom->top, its width, depth and rake), first in the GLB's own frame (glTF: +Y up, barrel +X), then in the game's pistol
// frame (makePistol: barrel +Z, top +Y, +X = the gun's left). Plain Node, no dependencies: the GLB's JSON and binary chunks
// are read here directly.
//
// Usage: node tools/measure_pistol_core.mjs [file.glb] [--out file.json] [--slices]
//   default file: assets/weapons/pistol_core.glb; default out: tools/hold/pistol_core_hold.json; --slices prints the slice table.
//
// How the grip is found (all on the real triangles, not the vertices: the grip is an extruded profile, so its straight front
// and back straps have vertices only at their ends):
//  1. The slide is its own node (Pistol_Slide); the barrel direction is the slide's long axis (PCA of its vertices), signed
//     toward Muzzle. Up = GLB +Y made perpendicular to it; side = barrel x up (the gun's right).
//  2. The rest (Pistol_Body + Pistol_Magazine_Art) is cut by horizontal planes every 0.5 mm from the butt up to the slide. In
//     each cut the pieces are grouped along the barrel direction (gaps over 1 mm separate them); the rearmost group is the grip
//     (in front of it, at the same heights, are the trigger guard and the trigger).
//  3. The grip's top: where its front strap meets the trigger guard (the rear group's front edge jumps forward) and where its
//     back strap meets the tang (the back edge, which moves forward as it climbs the raked grip, turns back). Its top is the
//     mean of the two; its bottom is the butt (the magazine baseplate's underside).
//  4. The axis: a line fitted (PCA) through the centres of the grip's cuts between the baseplate and the trigger guard. The
//     plain PCA of the grip's vertices is reported too, for comparison (it leans more: a sheared block's long diagonal).
//  5. The fist centre: on that axis at the middle of the grip's height, then centred in the grip's cross-section cut
//     perpendicular to the axis; that cross-section gives the width (side to side) and the depth (front to back).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const outIx = args.indexOf('--out');
const OUT = outIx >= 0 ? path.resolve(args[outIx + 1]) : path.join(HERE, 'hold', 'pistol_core_hold.json');
const FILE = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') || path.join(ROOT, 'assets/weapons/pistol_core.glb'));
const SHOW_SLICES = args.includes('--slices');

// ---------------- small vector / matrix helpers (column-major 4x4, as glTF) ----------------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / len(a));
const DEG = 180 / Math.PI;
const angleDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * DEG;

function compose(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const xfPoint = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const xfDir = (m, d) => [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];

// principal axes of a point set (symmetric 3x3 eigen-decomposition by Jacobi rotations); axes sorted by variance, largest first
function pca(points, weights) {
  let W = 0; const c = [0, 0, 0];
  points.forEach((p, i) => { const w = weights ? weights[i] : 1; W += w; c[0] += p[0] * w; c[1] += p[1] * w; c[2] += p[2] * w; });
  c[0] /= W; c[1] /= W; c[2] /= W;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  points.forEach((p, i) => { const w = weights ? weights[i] : 1, d = sub(p, c); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) A[r][k] += (d[r] * d[k] * w) / W; });
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let r = 0; r < 3; r++) for (let k = r + 1; k < 3; k++) off += A[r][k] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = cs * akp - sn * akq; A[k][q] = sn * akp + cs * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = cs * apk - sn * aqk; A[q][k] = sn * apk + cs * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = cs * vkp - sn * vkq; V[k][q] = sn * vkp + cs * vkq; }
    }
  }
  const ax = [0, 1, 2].map((i) => ({ val: A[i][i], dir: norm([V[0][i], V[1][i], V[2][i]]) })).sort((a, b) => b.val - a.val);
  return { centre: c, axes: ax };
}

// ---------------- GLB reading ----------------
function readGLB(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= b.length) {
    const n = b.readUInt32LE(off), type = b.readUInt32LE(off + 4), data = b.subarray(off + 8, off + 8 + n);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + n;
  }
  if (!json) throw new Error(`${file}: no JSON chunk`);
  return { gl: json, bin, bytes: b.length };
}
const COMP = { 5120: [1, 'getInt8', 127], 5121: [1, 'getUint8', 255], 5122: [2, 'getInt16', 32767], 5123: [2, 'getUint16', 65535], 5125: [4, 'getUint32', 0], 5126: [4, 'getFloat32', 0] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAccessor(gl, bin, i) {
  const a = gl.accessors[i];
  if (a.sparse) throw new Error('sparse accessors are not supported');
  const n = NCOMP[a.type], [size, getter, nmax] = COMP[a.componentType], out = new Float64Array(a.count * n);
  if (a.bufferView === undefined) return out;
  const bv = gl.bufferViews[a.bufferView], stride = bv.byteStride || size * n;
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0));
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    let v = dv[getter](k * stride + c * size, true);
    if (a.normalized && nmax) v = Math.max(v / nmax, -1);
    out[k * n + c] = v;
  }
  return out;
}

// the scene: world matrices of every node, the markers (empties) and the meshes' triangles in the GLB root frame
function loadScene(file) {
  const { gl, bin, bytes } = readGLB(file);
  const nodes = {}, meshes = [];
  const walk = (ni, parentM, parentName) => {
    const n = gl.nodes[ni];
    const local = n.matrix ? n.matrix.slice() : compose(n.translation, n.rotation, n.scale);
    const M = matMul(parentM, local), name = n.name || `node${ni}`;
    nodes[name] = { index: ni, parent: parentName, matrix: M, position: xfPoint(M, [0, 0, 0]), mesh: n.mesh,
      axes: { x: norm(xfDir(M, [1, 0, 0])), y: norm(xfDir(M, [0, 1, 0])), z: norm(xfDir(M, [0, 0, 1])) } };
    if (n.mesh !== undefined) {
      for (const p of gl.meshes[n.mesh].primitives) {
        if ((p.mode ?? 4) !== 4) continue; // triangles only
        const P = readAccessor(gl, bin, p.attributes.POSITION), count = P.length / 3;
        const pts = []; for (let k = 0; k < count; k++) pts.push(xfPoint(M, [P[3 * k], P[3 * k + 1], P[3 * k + 2]]));
        const I = p.indices !== undefined ? readAccessor(gl, bin, p.indices) : Float64Array.from({ length: count }, (_, k) => k);
        const tris = []; for (let k = 0; k + 2 < I.length; k += 3) tris.push([pts[I[k]], pts[I[k + 1]], pts[I[k + 2]]]);
        meshes.push({ node: name, material: p.material !== undefined ? gl.materials[p.material].name : null, points: pts, tris });
      }
    }
    for (const c of n.children || []) walk(c, M, name);
  };
  const I4 = compose();
  for (const r of gl.scenes[gl.scene || 0].nodes) walk(r, I4, null);
  return { gl, nodes, meshes, bytes };
}

// ---------------- slicing ----------------
// the segments where the plane dot(n, p) = d cuts the triangles
function slice(tris, n, d) {
  const segs = [];
  for (const t of tris) {
    const s = t.map((p) => dot(n, p) - d), pts = [];
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3], sa = s[e], sb = s[(e + 1) % 3];
      if ((sa >= 0) !== (sb >= 0)) { const k = sa / (sa - sb); pts.push(add(a, mul(sub(b, a), k))); }
    }
    if (pts.length === 2) segs.push(pts);
  }
  return segs;
}
// the cut's pieces grouped along direction f (gaps over tol separate them), each with its extents along f and along s
function groups(segs, f, s, tol = 0.001) {
  const items = segs.map(([a, b]) => ({ f0: Math.min(dot(a, f), dot(b, f)), f1: Math.max(dot(a, f), dot(b, f)), s0: Math.min(dot(a, s), dot(b, s)), s1: Math.max(dot(a, s), dot(b, s)) }))
    .sort((a, b) => a.f0 - b.f0);
  const out = [];
  for (const it of items) {
    const g = out[out.length - 1];
    if (g && it.f0 <= g.f1 + tol) { g.f1 = Math.max(g.f1, it.f1); g.s0 = Math.min(g.s0, it.s0); g.s1 = Math.max(g.s1, it.s1); g.n++; }
    else out.push({ ...it, n: 1 });
  }
  return out;
}

// ---------------- measure ----------------
const S = loadScene(FILE);
const r4 = (v) => Math.round(v * 1e4) / 1e4, r6 = (v) => Math.round(v * 1e6) / 1e6;
const R4 = (a) => a.map(r4), R6 = (a) => a.map(r6), mm = (v) => Math.round(v * 10000) / 10;
const need = (n) => { if (!S.nodes[n]) throw new Error(`node ${n} not found`); return S.nodes[n]; };

const markers = {};
for (const n of ['GameGrip_R', 'GameGrip_L', 'Muzzle', 'SightLine']) {
  const N = need(n);
  markers[n] = { position: R6(N.position), parent: N.parent, x_axis: R4(N.axes.x), y_axis: R4(N.axes.y) };
}

// bounds
const bboxOf = (pts) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const p of pts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } return { min: mn, max: mx, size: sub(mx, mn) }; };
const allPts = S.meshes.flatMap((m) => m.points);
const BB = bboxOf(allPts);
const meshBoxes = {};
for (const name of [...new Set(S.meshes.map((m) => m.node))]) { const b = bboxOf(S.meshes.filter((m) => m.node === name).flatMap((m) => m.points)); meshBoxes[name] = { min: R4(b.min), max: R4(b.max), size: R4(b.size) }; }

// barrel: the slide's long axis, toward the muzzle
const slideMeshes = S.meshes.filter((m) => /slide/i.test(m.node));
if (!slideMeshes.length) throw new Error('no slide mesh');
const slidePts = slideMeshes.flatMap((m) => m.points), slideBB = bboxOf(slidePts), slideC = mul(add(slideBB.min, slideBB.max), 0.5);
const muzzle = need('Muzzle').position;
let barrel = pca(slidePts).axes[0].dir; if (dot(barrel, sub(muzzle, slideC)) < 0) barrel = mul(barrel, -1);
const muzzleFromSlide = norm(sub(muzzle, slideC)), muzzleX = need('Muzzle').axes.x;
// the slide's PCA leans a little (its rear face is slanted, its sides grooved): when the Muzzle node's +X (the pack's authored
// discharge direction, README) agrees with it within 2 degrees, that is the barrel; otherwise the slide's PCA is
const useMuzzleX = angleDeg(barrel, muzzleX) < 2;
const barrelSource = useMuzzleX ? 'Muzzle node +X (agrees with the slide PCA)' : 'slide PCA (the Muzzle node +X disagrees)';
// the gun's frame: f = barrel, u = up (GLB +Y made perpendicular to the barrel), s = f x u = the gun's right side
const f = useMuzzleX ? muzzleX : barrel, u = norm(sub([0, 1, 0], mul(f, dot([0, 1, 0], f)))), s = cross(f, u);
const F = (p) => dot(p, f), U = (p) => dot(p, u), SD = (p) => dot(p, s);
const slideBottomU = Math.min(...slidePts.map(U));
// the bore line: through the muzzle along the barrel; its height above GameGrip_R
const gripR = need('GameGrip_R').position, gripL = need('GameGrip_L').position;

// the frame + grip (everything but the slide)
const bodyTris = S.meshes.filter((m) => !slideMeshes.includes(m)).flatMap((m) => m.tris);
const bodyPts = S.meshes.filter((m) => !slideMeshes.includes(m)).flatMap((m) => m.points);
const uMin = Math.min(...bodyPts.map(U));

// horizontal cuts every 0.5 mm from the butt to the slide; the rearmost group in each cut is the grip
const STEP = 0.0005, cuts = [];
for (let h = uMin + 0.00013; h < slideBottomU; h += STEP) {
  const g = groups(slice(bodyTris, u, h), f, s);
  if (g.length) cuts.push({ h, groups: g, rear: g[0] });
}
// top of the front strap: the first cut (above the bottom 10 mm) where the rear group's front edge jumps forward > 3 mm
// (the trigger guard joins it); top of the back strap: where the back edge is furthest forward (above it the tang sweeps back)
let frontTop = null;
for (let i = 1; i < cuts.length; i++) {
  if (cuts[i].h < uMin + 0.01) continue;
  if (cuts[i].rear.f1 - cuts[i - 1].rear.f1 > 0.003) { frontTop = cuts[i - 1].h; break; }
}
if (frontTop === null) throw new Error('could not find where the grip meets the trigger guard');
let backTop = null, bestB = -Infinity;
for (const c of cuts) {
  if (c.h < uMin + 0.01) continue;
  if (c.rear.f0 > bestB + 1e-6) { bestB = c.rear.f0; backTop = c.h; } else if (c.rear.f0 < bestB - 0.002) break; // the tang
}
const gripTop = (frontTop + backTop) / 2, gripBottom = uMin, gripHeight = gripTop - gripBottom, uMid = (gripTop + gripBottom) / 2;

// the clean grip, for the axis: from 2 mm above the magazine baseplate (its own node; 10 mm above the butt without one) to 2 mm
// below the trigger guard
const magMeshes = S.meshes.filter((m) => /magazine/i.test(m.node));
const cleanFrom = magMeshes.length ? Math.max(...magMeshes.flatMap((m) => m.points).map(U)) + 0.002 : gripBottom + 0.01;
const clean = cuts.filter((c) => c.h >= cleanFrom && c.h <= frontTop - 0.002);
const centres = clean.map((c) => add(add(mul(f, (c.rear.f0 + c.rear.f1) / 2), mul(u, c.h)), mul(s, (c.rear.s0 + c.rear.s1) / 2)));
const lineFit = pca(centres);
let axis = lineFit.axes[0].dir; if (U(axis) < 0) axis = mul(axis, -1);
const axisPoint = lineFit.centre;
// the plain PCA of the grip's vertices (the body's vertices below the grip's top, in the rear group of their height), for comparison
const rearAt = (h) => { let best = cuts[0]; for (const c of cuts) if (Math.abs(c.h - h) < Math.abs(best.h - h)) best = c; return best.rear; };
const gripVerts = bodyPts.filter((p) => U(p) <= gripTop && F(p) <= rearAt(U(p)).f1 + 0.0005);
let vAxis = pca(gripVerts).axes[0].dir; if (U(vAxis) < 0) vAxis = mul(vAxis, -1);

// rake: the axis from vertical (+: its top leans toward the muzzle, the butt sweeps back), in the gun's side plane
const rake = (a) => Math.atan2(F(a), U(a)) * DEG;
// the fist centre: on the axis at the grip's mid height, centred in the cross-section cut perpendicular to the axis
const onAxisAtU = (h) => add(axisPoint, mul(axis, (h - U(axisPoint)) / U(axis)));
const depthDir = norm(sub(f, mul(axis, dot(f, axis))));
// convex hull perimeter of 2D points (monotone chain): the girth a hand wraps
function hullPerimeter(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => { const h = []; for (const q of list) { while (h.length >= 2 && cr(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  const H = [...half(P), ...half(P.reverse())];
  let L = 0; for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return L;
}
function crossSection(p) {
  const segs = slice(bodyTris, axis, dot(axis, p)), g = groups(segs, depthDir, s);
  const d = dot(p, depthDir), hit = g.find((x) => d >= x.f0 - 0.001 && d <= x.f1 + 0.001) || g[0];
  const pts2 = segs.flat().map((q) => [dot(q, depthDir), dot(q, s)]).filter(([qd]) => qd >= hit.f0 - 1e-6 && qd <= hit.f1 + 1e-6);
  return { depth: hit.f1 - hit.f0, width: hit.s1 - hit.s0, girth: hullPerimeter(pts2), centre: add(add(sub(p, add(mul(depthDir, d), mul(s, dot(p, s)))), mul(depthDir, (hit.f0 + hit.f1) / 2)), mul(s, (hit.s0 + hit.s1) / 2)), d0: hit.f0, d1: hit.f1, s0: hit.s0, s1: hit.s1 };
}
const p0 = onAxisAtU(uMid), X0 = crossSection(p0), fist = X0.centre, XS = crossSection(fist);
// the cross-section's size along the clean grip (its range shows how even the grip is)
const sizes = clean.filter((_, i) => i % 4 === 0).map((c) => crossSection(onAxisAtU(c.h)));
const range = (k) => [mm(Math.min(...sizes.map((x) => x[k]))), mm(Math.max(...sizes.map((x) => x[k])))];
const horizMid = rearAt(uMid);

// a marker relative to the grip: how far off the axis, how far along it from the fist centre, inside or on the surface
function relToGrip(p) {
  const v = sub(p, fist), along = dot(v, axis), offAxis = sub(v, mul(axis, along));
  const X = crossSection(add(fist, mul(axis, along)));
  const d = dot(p, depthDir), sd = dot(p, s);
  const toFront = X.d1 - d, toBack = d - X.d0, toRight = X.s1 - sd, toLeft = sd - X.s0;
  const inside = toFront > 0 && toBack > 0 && toRight > 0 && toLeft > 0, nearest = Math.min(toFront, toBack, toRight, toLeft);
  const verdict = !inside ? 'outside the grip' : len(offAxis) < 0.004 ? 'at the grip centre (on its axis)' : nearest < 0.003 ? 'on the grip surface' : 'inside the grip, off its axis';
  return { along_axis_from_fist_mm: mm(along), off_axis_mm: mm(len(offAxis)), off_axis_toward_muzzle_mm: mm(dot(offAxis, depthDir)), off_axis_side_mm: mm(dot(offAxis, s)),
    to_surface_mm: { front: mm(toFront), back: mm(toBack), right: mm(toRight), left: mm(toLeft) }, verdict };
}

// ---------------- the game's pistol frame ----------------
// makePistol: barrel +Z, top +Y, +X = the gun's left (= -side). game = R * glb, R's rows are the game axes in GLB coordinates.
const Rrows = [mul(s, -1), u, f];
const toGame = (v) => Rrows.map((r) => dot(r, v));
function quatFromRows(m) { // rotation matrix (rows) -> quaternion [x, y, z, w]
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m, tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; w = k / 4; x = (m21 - m12) / k; y = (m02 - m20) / k; z = (m10 - m01) / k; }
  else if (m00 > m11 && m00 > m22) { const k = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / k; x = k / 4; y = (m01 + m10) / k; z = (m02 + m20) / k; }
  else if (m11 > m22) { const k = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / k; x = (m01 + m10) / k; y = k / 4; z = (m12 + m21) / k; }
  else { const k = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / k; x = (m02 + m20) / k; y = (m12 + m21) / k; z = k / 4; }
  return [x, y, z, w];
}
const quat = quatFromRows(Rrows);
const pureY = Math.abs(quat[0]) < 1e-6 && Math.abs(quat[2]) < 1e-6;
const yAngle = pureY ? 2 * Math.atan2(quat[1], quat[3]) : null;
const gGrip = toGame(fist), gAxis = norm(toGame(axis)), gMuzzle = toGame(muzzle), gL = toGame(gripL);
const gRef = norm(sub([0, 0, 1], mul(gAxis, dot([0, 0, 1], gAxis)))); // toward the muzzle side, perpendicular to the grip (the knuckles)
const gBB = (() => { const c = []; for (let k = 0; k < 8; k++) c.push(toGame([k & 1 ? BB.max[0] : BB.min[0], k & 2 ? BB.max[1] : BB.min[1], k & 4 ? BB.max[2] : BB.min[2]])); return bboxOf(c); })();
const OLD = { grip_primary: [0, -0.03, -0.012], shaft_axis: [0, 0.9611, 0.2764], muzzle: [0, 0.058, 0.157], grip_block_mm: [30, 105, 46] };

const result = {
  _doc: 'Measured by tools/measure_pistol_core.mjs from the GLB (README: tools/hold/pistol_core_README.md). Metres unless a key ends in _mm or _deg. glb: the GLB\'s own frame (glTF, +Y up, barrel +X, +Z = the gun\'s right side, origin = GameGrip_R). game: the game\'s pistol frame (makePistol: barrel +Z, top +Y, +X = the gun\'s left), origin still GameGrip_R, reached by game.rotation_* (GLB -> game). game.HOLD_DEFS_pistol: grip_primary = where the closed right fist\'s centre goes, shaft_axis = the grip\'s axis bottom -> top (pinky -> index), support_point = GameGrip_L.',
  source: { file: path.relative(ROOT, FILE).replace(/\\/g, '/'), bytes: S.bytes, nodes: Object.keys(S.nodes) },
  glb: {
    markers,
    bbox: { min: R4(BB.min), max: R4(BB.max), size: R4(BB.size) },
    mesh_bbox: meshBoxes,
    barrel: {
      direction: R4(f), direction_source: barrelSource, up: R4(u), side_right: R4(s),
      from_slide_pca: R4(barrel), muzzle_minus_slide_centre: R4(muzzleFromSlide), muzzle_node_x_axis: markers.Muzzle.x_axis,
      disagreement_deg: { slide_pca_vs_muzzle_minus_slide_centre: Math.round(angleDeg(barrel, muzzleFromSlide) * 100) / 100, slide_pca_vs_muzzle_node_x: Math.round(angleDeg(barrel, need('Muzzle').axes.x) * 100) / 100 },
      slide_centre: R4(slideC), slide_bottom_y: r4(slideBottomU),
      muzzle_ahead_of_GameGrip_R: r4(F(sub(muzzle, gripR))), bore_above_GameGrip_R: r4(U(sub(muzzle, gripR))),
    },
    grip: {
      method: 'horizontal cuts every 0.5 mm, rearmost piece = grip; axis = PCA line through the cut centres between the baseplate and the trigger guard; fist centre = that axis at mid height, centred in the cross-section perpendicular to the axis',
      bottom_y: r4(gripBottom), top_front_strap_y: r4(frontTop), top_back_strap_y: r4(backTop), top_y: r4(gripTop),
      height_mm: mm(gripHeight), length_along_axis_mm: mm(gripHeight / U(axis)), mid_y: r4(uMid), axis_fit_from_y: r4(cleanFrom), axis_fit_to_y: r4(frontTop - 0.002), axis_fit_cuts: clean.length,
      fist_centre: R4(fist),
      axis_bottom_to_top: R4(axis), rake_deg: Math.round(rake(axis) * 10) / 10,
      axis_vertex_pca: R4(vAxis), rake_vertex_pca_deg: Math.round(rake(vAxis) * 10) / 10, vertex_count: gripVerts.length,
      cross_section_at_fist: { width_mm: mm(XS.width), depth_mm: mm(XS.depth), girth_mm: mm(XS.girth), note: 'cut perpendicular to the axis; width = side to side, depth = front strap to back strap, girth = the outline\'s convex perimeter (what the fingers wrap)' },
      cross_section_range_along_clean_grip: { width_mm: range('width'), depth_mm: range('depth') },
      horizontal_depth_at_mid_mm: mm(horizMid.f1 - horizMid.f0), horizontal_width_at_mid_mm: mm(horizMid.s1 - horizMid.s0),
      GameGrip_R: relToGrip(gripR), GameGrip_L: relToGrip(gripL),
    },
  },
  game: {
    rotation_rows: Rrows.map(R6), rotation_quaternion_xyzw: R6(quat), rotation_y_rad: yAngle === null ? null : r6(yAngle),
    three_js: pureY ? `wrap the GLB scene: inner.rotation.y = ${yAngle < 0 ? '-' : ''}Math.PI / 2 (${r4(yAngle)} rad); game = (-z, y, x) of the GLB` : 'not a pure Y rotation: use rotation_quaternion_xyzw',
    origin: 'GameGrip_R (the GLB origin), unchanged by the rotation',
    HOLD_DEFS_pistol: { grip_primary: R4(gGrip), shaft_axis: R4(gAxis), support_point: R4(gL) },
    ref_axis: R4(gRef), barrel_axis: [0, 0, 1], up_axis: [0, 1, 0],
    muzzle: R4(gMuzzle), sightline: R4(toGame(need('SightLine').position)), GameGrip_R: [0, 0, 0], GameGrip_L: R4(gL),
    muzzle_from_grip_primary: R4(sub(gMuzzle, gGrip)),
    bbox: { min: R4(gBB.min), max: R4(gBB.max), size: R4(gBB.size) },
    makePistol_for_comparison: { ...OLD, grip_girth_mm: mm(2 * (0.03 + 0.046) - 8 * 0.012 + 2 * Math.PI * 0.012), muzzle_from_grip_primary: R4(sub(OLD.muzzle, OLD.grip_primary)), rake_deg: Math.round(Math.atan2(OLD.shaft_axis[2], OLD.shaft_axis[1]) * DEG * 10) / 10 },
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
// (numeric arrays on one line)
fs.writeFileSync(OUT, JSON.stringify(result, null, 1).replace(/\[\s+([-\d.e,\s]+?)\s+\]/g, (_, a) => `[${a.split(/,\s*/).join(', ')}]`) + '\n');

// ---------------- print ----------------
const v3 = (a) => `(${a.map((x) => x.toFixed(4)).join(', ')})`;
console.log(`${result.source.file}  (${S.bytes} bytes)  nodes: ${result.source.nodes.join(', ')}`);
console.log('\nGLB frame (glTF, +Y up, barrel +X, +Z = the gun\'s right):');
for (const [n, m] of Object.entries(markers)) console.log(`  ${n.padEnd(11)} ${v3(m.position)}  parent ${m.parent}`);
console.log(`  bbox        min ${v3(BB.min)}  max ${v3(BB.max)}  size ${v3(BB.size)}`);
console.log(`  barrel      ${v3(f)} from the ${barrelSource}; slide PCA ${v3(barrel)} (${result.glb.barrel.disagreement_deg.slide_pca_vs_muzzle_node_x} deg off), muzzle - slide centre ${v3(muzzleFromSlide)}`);
console.log(`              muzzle ${mm(F(sub(muzzle, gripR)))} mm ahead of and ${mm(U(sub(muzzle, gripR)))} mm above GameGrip_R; slide bottom y ${slideBottomU.toFixed(4)}`);
const G = result.glb.grip;
console.log(`  grip        y ${G.bottom_y} (butt) .. ${G.top_y} (top: front strap meets the guard at ${G.top_front_strap_y}, back strap meets the tang at ${G.top_back_strap_y}); height ${G.height_mm} mm, ${G.length_along_axis_mm} mm along the axis`);
console.log(`              fist centre ${v3(fist)} (mid height y ${uMid.toFixed(4)})`);
console.log(`              axis bottom->top ${v3(axis)}  rake ${G.rake_deg} deg (butt back)   [vertex PCA ${v3(vAxis)}, ${G.rake_vertex_pca_deg} deg, ${gripVerts.length} vertices]`);
console.log(`              cross-section at the fist: ${G.cross_section_at_fist.width_mm} mm wide x ${G.cross_section_at_fist.depth_mm} mm deep, girth ${G.cross_section_at_fist.girth_mm} mm (along the clean grip: width ${G.cross_section_range_along_clean_grip.width_mm.join('-')}, depth ${G.cross_section_range_along_clean_grip.depth_mm.join('-')} mm)`);
console.log(`  GameGrip_R  ${G.GameGrip_R.verdict}: ${G.GameGrip_R.along_axis_from_fist_mm} mm along the axis from the fist centre, ${G.GameGrip_R.off_axis_mm} mm off it`);
console.log(`  GameGrip_L  ${G.GameGrip_L.verdict}: ${G.GameGrip_L.along_axis_from_fist_mm} mm along the axis, ${G.GameGrip_L.off_axis_mm} mm off it (${G.GameGrip_L.off_axis_toward_muzzle_mm} mm toward the muzzle); ${G.GameGrip_L.to_surface_mm.front} mm behind the front strap`);
const Gm = result.game;
console.log(`\nGame frame (barrel +Z, top +Y, +X = left), origin GameGrip_R: ${Gm.three_js}`);
console.log(`  rotation rows ${Rrows.map(v3).join(' ')}  quaternion xyzw ${v3(quat)}`);
console.log(`  HOLD_DEFS.pistol  grip_primary ${JSON.stringify(Gm.HOLD_DEFS_pistol.grip_primary)}  shaft_axis ${JSON.stringify(Gm.HOLD_DEFS_pistol.shaft_axis)}  support_point ${JSON.stringify(Gm.HOLD_DEFS_pistol.support_point)}`);
console.log(`  ref_axis ${JSON.stringify(Gm.ref_axis)}  muzzle ${JSON.stringify(Gm.muzzle)}  sightline ${JSON.stringify(Gm.sightline)}`);
console.log(`  muzzle from grip_primary ${JSON.stringify(Gm.muzzle_from_grip_primary)} (makePistol: ${JSON.stringify(Gm.makePistol_for_comparison.muzzle_from_grip_primary)})`);
console.log(`  bbox min ${v3(gBB.min)} max ${v3(gBB.max)}`);
if (SHOW_SLICES) {
  console.log('\nhorizontal cuts (y, then each piece front-to-back extent along the barrel and its width, mm):');
  for (const c of cuts.filter((_, i) => i % 4 === 0)) console.log(`  y ${c.h.toFixed(4)}  ` + c.groups.map((g) => `[${mm(g.f0)}..${mm(g.f1)} w${mm(g.s1 - g.s0)}]`).join(' '));
  console.log('\ncross-sections perpendicular to the axis along the clean grip (y of the axis point: width x depth, mm):');
  for (const c of clean.filter((_, i) => i % 4 === 0)) { const X = crossSection(onAxisAtU(c.h)); console.log(`  y ${c.h.toFixed(4)}  ${mm(X.width)} x ${mm(X.depth)}`); }
}
console.log(`\nwrote ${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
