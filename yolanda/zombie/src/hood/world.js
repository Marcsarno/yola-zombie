// Chapter 2: the neighbourhood's collision world. The hospital's World (core/world.js) holds axis-aligned boxes only; the
// neighbourhood's rows stand at angles, the roundabout and the tree trunks are round. HoodWorld keeps the same interface
// (resolveCircle, raycast, lineOfSight, buildNav, updateFlow, flowDir, setOff) over oriented boxes and circles from the
// Blender export (blender/hood/export_layout.py: [kind, tag, cx, cz, hx|r, hz, yaw, h]), with a 4 m spatial grid.
// The navigation grid covers only `bounds` (the stage being played): the flow field stays small enough for a phone.
import { World } from '../core/world.js';

const G = 4; // grid cell (m)
export class HoodWorld extends World {
  constructor(bounds, cols, extra = []) {
    super(bounds);
    this.shapes = [];
    this.grid = new Map();
    for (const c of cols) this.addShape(c);
    for (const c of extra) this.addShape(c);
  }
  addShape(c) {
    const [k, tag, cx, cz, a, b, yaw, h] = c;
    const s = k === 'c'
      ? { type: 'c', tag, cx, cz, r: a, h, bound: a }
      : { type: 'b', tag, cx, cz, hx: a, hz: b, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), h, bound: Math.hypot(a, b) };
    // the AABB the hospital code reads (physics, debug lines): the shape's bounding box
    s.minX = cx - s.bound; s.maxX = cx + s.bound; s.minZ = cz - s.bound; s.maxZ = cz + s.bound; s.kind = tag;
    this.shapes.push(s);
    const x0 = Math.floor((cx - s.bound) / G), x1 = Math.floor((cx + s.bound) / G), z0 = Math.floor((cz - s.bound) / G), z1 = Math.floor((cz + s.bound) / G);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const key = i * 65536 + j; let l = this.grid.get(key); if (!l) this.grid.set(key, l = []); l.push(s); }
    return s;
  }
  near(x, z, r, out = []) {
    out.length = 0; const seen = this._seen || (this._seen = new Set()); seen.clear();
    const x0 = Math.floor((x - r) / G), x1 = Math.floor((x + r) / G), z0 = Math.floor((z - r) / G), z1 = Math.floor((z + r) / G);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const l = this.grid.get(i * 65536 + j); if (l) for (const s of l) if (!seen.has(s)) { seen.add(s); out.push(s); } }
    return out;
  }
  // to a box's own frame (three.js rotation.y = yaw: local x = (cos, -sin), local z = (sin, cos) in world x/z)
  static local(s, x, z) { const dx = x - s.cx, dz = z - s.cz; return [dx * s.cos - dz * s.sin, dx * s.sin + dz * s.cos]; }
  static world(s, lx, lz) { return [s.cx + lx * s.cos + lz * s.sin, s.cz - lx * s.sin + lz * s.cos]; }

  resolveCircle(p, r, skip = null) {
    let hit = false; const list = this.near(p.x, p.z, r + 0.1, this._n1 || (this._n1 = []));
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of list) {
        if (s.off || s === skip) continue;
        if (s.type === 'c') {
          const dx = p.x - s.cx, dz = p.z - s.cz, d = Math.hypot(dx, dz), m = s.r + r;
          if (d >= m) continue;
          if (d > 1e-6) { p.x = s.cx + (dx / d) * m; p.z = s.cz + (dz / d) * m; } else p.x = s.cx + m;
          hit = moved = true; continue;
        }
        const [lx, lz] = HoodWorld.local(s, p.x, p.z);
        const cx = Math.max(-s.hx, Math.min(lx, s.hx)), cz = Math.max(-s.hz, Math.min(lz, s.hz));
        let dx = lx - cx, dz = lz - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz;
        if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = cx + (dx / d) * r; nz = cz + (dz / d) * r; }
        else { // inside: leave by the nearest face
          const l = lx + s.hx, rr = s.hx - lx, t = lz + s.hz, b = s.hz - lz, m = Math.min(l, rr, t, b);
          nx = lx; nz = lz; if (m === l) nx = -s.hx - r; else if (m === rr) nx = s.hx + r; else if (m === t) nz = -s.hz - r; else nz = s.hz + r;
        }
        [p.x, p.z] = HoodWorld.world(s, nx, nz);
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  raycast(ax, az, bx, bz, minH = 0.5) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const list = this.near((ax + bx) / 2, (az + bz) / 2, len / 2 + 0.5, this._n2 || (this._n2 = []));
    let best = null;
    for (const s of list) {
      if (s.h < minH || s.off) continue;
      if (s.type === 'c') {
        const fx = ax - s.cx, fz = az - s.cz, A = dx * dx + dz * dz, B = fx * dx + fz * dz, Cc = fx * fx + fz * fz - s.r * s.r;
        if (Cc <= 0) { if (!best || best.t > 0) best = { t: 0, box: s, nx: -dx / (len || 1), nz: -dz / (len || 1) }; continue; }
        const disc = B * B - A * Cc; if (disc < 0 || A < 1e-12) continue;
        const t = (-B - Math.sqrt(disc)) / A; if (t < 0 || t > 1) continue;
        if (!best || t < best.t) { const hx = ax + dx * t - s.cx, hz = az + dz * t - s.cz, hl = Math.hypot(hx, hz) || 1; best = { t, box: s, nx: hx / hl, nz: hz / hl }; }
        continue;
      }
      const [lax, laz] = HoodWorld.local(s, ax, az), [lbx, lbz] = HoodWorld.local(s, bx, bz), ldx = lbx - lax, ldz = lbz - laz;
      let t0 = 0, t1 = 1, nx = 0, nz = 0, inside = true;
      const slab = (o, d, h, axis) => {
        if (Math.abs(d) < 1e-9) return o >= -h && o <= h;
        let ta = (-h - o) / d, tb = (h - o) / d, n = -1;
        if (ta > tb) { [ta, tb] = [tb, ta]; n = 1; }
        if (ta > t0) { t0 = ta; nx = axis === 0 ? n : 0; nz = axis === 1 ? n : 0; inside = false; }
        if (tb < t1) t1 = tb;
        return t0 <= t1;
      };
      if (!slab(lax, ldx, s.hx, 0) || !slab(laz, ldz, s.hz, 1)) continue;
      if (inside && Math.abs(lax) < s.hx && Math.abs(laz) < s.hz) { if (!best || best.t > 0) best = { t: 0, box: s, nx: -dx / (len || 1), nz: -dz / (len || 1) }; continue; }
      if (!best || t0 < best.t) { const [wx, wz] = [nx * s.cos + nz * s.sin, -nx * s.sin + nz * s.cos]; best = { t: t0, box: s, nx: wx, nz: wz }; }
    }
    return best;
  }

  blockedAt(x, z, inflate) {
    for (const s of this.near(x, z, inflate + 0.1, this._n3 || (this._n3 = []))) {
      if (s.off) continue;
      if (s.type === 'c') { if (Math.hypot(x - s.cx, z - s.cz) < s.r + inflate) return true; continue; }
      const [lx, lz] = HoodWorld.local(s, x, z);
      if (Math.abs(lx) < s.hx + inflate && Math.abs(lz) < s.hz + inflate) return true;
    }
    return false;
  }
  buildNav(cell = 0.4, inflate = 0.3) {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const w = Math.ceil((maxX - minX) / cell), h = Math.ceil((maxZ - minZ) / cell);
    const blocked = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.blockedAt(minX + (i + 0.5) * cell, minZ + (j + 0.5) * cell, inflate)) blocked[j * w + i] = 1;
    this.nav = { cell, w, h, blocked, dist: new Float32Array(w * h), queue: new Int32Array(w * h * 4), goal: -1, inflate };
  }
  // a rally point: the infected with no way to Marc (a shut gate between) head for it instead of standing still (the polish
  // brief's replay: the playground's horde "runs at the noise" of the engine, but the dock gate is shut until the next scene,
  // so they stood). A second distance field over the same grid, toward the point; rallyAt(null) clears it.
  rallyAt(x, z) {
    const n = this.nav; this.rally = null; if (!n || x == null) return;
    n.rdist ??= new Float32Array(n.w * n.h);
    const keep = n.dist, goal = n.goal; n.dist = n.rdist; super.updateFlow(x, z); n.dist = keep; n.goal = goal;
    this.rally = { x, z };
  }
  flowDir(x, z, out) {
    const rem = super.flowDir(x, z, out);
    if (rem < 1e7 || !this.rally || !this.nav?.rdist) return rem;   // (a new stop's grid has none: no rally)
    const n = this.nav, keep = n.dist; n.dist = n.rdist; const r2 = super.flowDir(x, z, out); n.dist = keep;
    return r2 < 1e7 ? 5e6 : r2;
  }
  setOff(s, off) {
    if (!s || !!s.off === !!off) return;
    s.off = !!off;
    const n = this.nav; if (!n) return;
    const { minX, minZ } = this.bounds, m = n.inflate + n.cell + s.bound;
    const i0 = Math.max(0, Math.floor((s.cx - m - minX) / n.cell)), i1 = Math.min(n.w - 1, Math.ceil((s.cx + m - minX) / n.cell));
    const j0 = Math.max(0, Math.floor((s.cz - m - minZ) / n.cell)), j1 = Math.min(n.h - 1, Math.ceil((s.cz + m - minZ) / n.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) n.blocked[j * n.w + i] = this.blockedAt(minX + (i + 0.5) * n.cell, minZ + (j + 0.5) * n.cell, n.inflate) ? 1 : 0;
  }
  get boxes() { return this.shapes; }
  set boxes(v) {}
  addBox(minX, maxX, minZ, maxZ, h = 2.6, kind = 'wall') { // (hospital code adding a plain box: a door, a barrier)
    return this.addShape(['b', kind, (minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2, 0, h]);
  }
}
