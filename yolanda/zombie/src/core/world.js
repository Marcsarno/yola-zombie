// Static collision world on the ground plane (x, z) plus a navigation grid.
// Engine-agnostic: boxes are axis-aligned, heights are used only for "does a shot pass over it".

export class World {
  constructor(bounds) {
    this.bounds = bounds; // {minX,maxX,minZ,maxZ}
    this.boxes = []; // {minX,maxX,minZ,maxZ,h,kind}
    this.nav = null;
  }

  addBox(minX, maxX, minZ, maxZ, h = 2.6, kind = 'wall') {
    const b = { minX, maxX, minZ, maxZ, h, kind };
    this.boxes.push(b);
    return b;
  }

  // Push a circle out of all boxes (but `skip`: the prop Yola is vaulting over). Returns true if it collided.
  resolveCircle(p, r, skip = null) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (b.off || b === skip) continue;
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // centre inside the box: leave by the nearest face
          const l = p.x - b.minX, rr = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) p.x = b.minX - r; else if (m === rr) p.x = b.maxX + r;
          else if (m === t) p.z = b.minZ - r; else p.z = b.maxZ + r;
        }
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  // Segment (ax,az)->(bx,bz) against boxes taller than minH. Returns {t, box, nx, nz} for the first hit or null.
  raycast(ax, az, bx, bz, minH = 0.5) {
    const dx = bx - ax, dz = bz - az;
    let best = null;
    for (const b of this.boxes) {
      if (b.h < minH || b.off) continue;
      let t0 = 0, t1 = 1, nx = 0, nz = 0;
      // slab x
      if (Math.abs(dx) < 1e-9) { if (ax < b.minX || ax > b.maxX) continue; }
      else {
        let ta = (b.minX - ax) / dx, tb = (b.maxX - ax) / dx, n = -1;
        if (ta > tb) { [ta, tb] = [tb, ta]; n = 1; }
        if (ta > t0) { t0 = ta; nx = n; nz = 0; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (az < b.minZ || az > b.maxZ) continue; }
      else {
        let ta = (b.minZ - az) / dz, tb = (b.maxZ - az) / dz, n = -1;
        if (ta > tb) { [ta, tb] = [tb, ta]; n = 1; }
        if (ta > t0) { t0 = ta; nx = 0; nz = n; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      if (t0 === 0 && ax > b.minX && ax < b.maxX && az > b.minZ && az < b.maxZ) {
        // segment starts inside: blocked immediately
        if (!best || 0 < best.t) best = { t: 0, box: b, nx: -Math.sign(dx), nz: -Math.sign(dz) };
        continue;
      }
      if (!best || t0 < best.t) best = { t: t0, box: b, nx, nz };
    }
    return best;
  }

  lineOfSight(ax, az, bx, bz, minH = 1.0) {
    return !this.raycast(ax, az, bx, bz, minH);
  }

  // ---------- navigation grid + flow field toward a goal ----------
  buildNav(cell = 0.25, inflate = 0.3) {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const w = Math.ceil((maxX - minX) / cell), h = Math.ceil((maxZ - minZ) / cell);
    const blocked = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = minX + (i + 0.5) * cell, z = minZ + (j + 0.5) * cell;
      for (const b of this.boxes) {
        if (b.off) continue;
        if (x > b.minX - inflate && x < b.maxX + inflate && z > b.minZ - inflate && z < b.maxZ + inflate) {
          blocked[j * w + i] = 1; break;
        }
      }
    }
    this.nav = { cell, w, h, blocked, dist: new Float32Array(w * h), queue: new Int32Array(w * h * 4), goal: -1, inflate };
  }

  // switch a box (a door) on or off and re-test the navigation cells around it; the flow field follows next update
  setOff(b, off) {
    if (!b || !!b.off === !!off) return;
    b.off = !!off;
    const n = this.nav; if (!n) return;
    const { minX, minZ } = this.bounds, m = n.inflate + n.cell;
    const i0 = Math.max(0, Math.floor((b.minX - m - minX) / n.cell)), i1 = Math.min(n.w - 1, Math.ceil((b.maxX + m - minX) / n.cell));
    const j0 = Math.max(0, Math.floor((b.minZ - m - minZ) / n.cell)), j1 = Math.min(n.h - 1, Math.ceil((b.maxZ + m - minZ) / n.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = minX + (i + 0.5) * n.cell, z = minZ + (j + 0.5) * n.cell;
      let bl = 0;
      for (const q of this.boxes) if (!q.off && x > q.minX - n.inflate && x < q.maxX + n.inflate && z > q.minZ - n.inflate && z < q.maxZ + n.inflate) { bl = 1; break; }
      n.blocked[j * n.w + i] = bl;
    }
  }

  cellOf(x, z) {
    const n = this.nav;
    const i = Math.floor((x - this.bounds.minX) / n.cell), j = Math.floor((z - this.bounds.minZ) / n.cell);
    if (i < 0 || j < 0 || i >= n.w || j >= n.h) return -1;
    return j * n.w + i;
  }

  // Dijkstra-ish (8-neighbour, unit/sqrt2 costs) from the goal cell; done a few times a second.
  updateFlow(gx, gz) {
    const n = this.nav, { w, h, blocked, dist, queue } = n;
    let g = this.cellOf(gx, gz);
    if (g < 0) return;
    if (blocked[g]) g = this.nearestFree(g);
    if (g < 0) return;
    dist.fill(1e9);
    // bucketed relaxation (small grids: a simple FIFO with re-insertion is fast enough)
    let head = 0, tail = 0;
    dist[g] = 0; queue[tail++] = g;
    const cap = queue.length;
    while (head !== tail) {
      const c = queue[head]; head = (head + 1) % cap;
      const ci = c % w, cj = (c / w) | 0, dc = dist[c];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nc = nj * w + ni;
        if (blocked[nc]) continue;
        if (di && dj && (blocked[cj * w + ni] || blocked[nj * w + ci])) continue; // no corner cutting
        const nd = dc + (di && dj ? 1.4142 : 1);
        if (nd < dist[nc] - 1e-4) { dist[nc] = nd; queue[tail] = nc; tail = (tail + 1) % cap; }
      }
    }
    n.goal = g;
  }

  nearestFree(c) {
    const n = this.nav;
    const ci = c % n.w, cj = (c / n.w) | 0;
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= n.w || j >= n.h) continue;
      if (!n.blocked[j * n.w + i]) return j * n.w + i;
    }
    return -1;
  }

  // Direction of steepest descent of the flow field at (x,z). Writes into out {x,z}; returns remaining distance (m).
  flowDir(x, z, out) {
    const n = this.nav;
    let c = this.cellOf(x, z);
    if (c < 0) { out.x = 0; out.z = 0; return 1e9; }
    if (n.blocked[c] || n.dist[c] >= 1e9) { const f = this.nearestFree(c); if (f < 0) { out.x = out.z = 0; return 1e9; } c = f; }
    const ci = c % n.w, cj = (c / n.w) | 0;
    let best = n.dist[c], bi = 0, bj = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= n.w || j >= n.h) continue;
      const d = n.dist[j * n.w + i];
      if (d < best) { best = d; bi = di; bj = dj; }
    }
    if (!bi && !bj) {
      // at a free cell next to a blocked one: aim at the cell centre
      const cx = this.bounds.minX + (ci + 0.5) * n.cell, cz = this.bounds.minZ + (cj + 0.5) * n.cell;
      out.x = cx - x; out.z = cz - z;
    } else { out.x = bi; out.z = bj; }
    const l = Math.hypot(out.x, out.z) || 1;
    out.x /= l; out.z /= l;
    return n.dist[c] * n.cell;
  }
}

// Distance from point to segment in 2D; returns {d2, t}.
export function segPointDist2(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-12 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return { d2: qx * qx + qz * qz, t };
}

// Ray (origin o, unit dir d, max len) vs circle; returns distance along ray or -1.
export function rayCircle(ox, oz, dx, dz, len, cx, cz, r) {
  const fx = ox - cx, fz = oz - cz;
  const b = fx * dx + fz * dz, c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0; // origin inside
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= len ? t : -1;
}

// Small deterministic RNG (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function angleDiff(a, b) { // shortest signed b - a
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function approachAngle(a, b, maxStep) {
  const d = angleDiff(a, b);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}
