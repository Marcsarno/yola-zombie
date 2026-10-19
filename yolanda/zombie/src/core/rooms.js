// Room mechanics (2026-10-18 night, BUILD_PLAN.md: the combat chat makes them work, the maps chat places them on the floors):
//  - cracked walls (FLOORS_REDESIGN.html "the rules"): a wall segment that breaks to anything heavy: the sledgehammer, the
//    big lady's charge, the guard's slam, an oxygen cylinder's burst. Other blows only knock dust off it (a hint). Broken,
//    its collision goes (the zombies' routes follow) and the renderer throws its chunks.
//  - the flood (Floor 5's flooded ward, the user: "burst pipes, flooded part of the floor. The water slows the zombies, and
//    you ... the electrical panels spark in the water to fry anything standing in it. The trick is to lure zombies into the
//    water"): an area of water that slows everyone in it; its sparking panel, hit (a round into it, a blow beside it),
//    sends a jolt through the water: every zombie standing in it dies, Yola in it is hurt and floored; then it recharges.
//  - the MRI magnet (Floor 5's arena, the user: "your guns get stuck to it ... once you finish fighting everything in the
//    arena, you can shut it down"): it comes alive as Yola walks into its room: her guns are torn away and pinned to it
//    (she fights hand to hand), loose metal is dragged across the room hitting the zombies in its way, the guard's shield is
//    ripped off his arm onto it (he is open to his finisher at once). The big red button (step up to it) shuts it down once
//    the room is clear: the helium vents in a white blast, the magnet dies and her guns drop under it to pick up.
// Placing (the floors' data, or a practice scene): sim.addCrackedWall({ x0, z0, x1, z1 }), sim.addFlood({ minX, maxX, minZ,
// maxZ, panel: { x, z } }), sim.addMRI({ minX, maxX, minZ, maxZ, magnet: { x, z }, button: { x, z } }).
import { ZS } from './zombies.js';
import { tankPos } from './loose.js';

export const CRACK = { t: 0.26, h: 2.6, near: 0.45 };
export const FLOOD = { yola: 0.68, zombie: 0.55, recharge: 9, panelR: 0.4, panelReach: 1.1, jolt: 30 };
export const MRI = { pull: 14, maxV: 7, stick: 0.75, hurtV: 3.0, hurtDmg: 30, buttonR: 0.8, pickR: 1.4, gunsOf: ['pistol', 'shotgun'] };
let nextId = 1;
const inside = (R, x, z, pad = 0) => x > R.minX - pad && x < R.maxX + pad && z > R.minZ - pad && z < R.maxZ + pad;

// ---------------- cracked walls ----------------
export function addCrackedWall(sim, { x0, z0, x1, z1, t = CRACK.t, h = CRACK.h }) {
  const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0), W = sim.world;
  const b = horiz ? W.addBox(Math.min(x0, x1), Math.max(x0, x1), z0 - t / 2, z0 + t / 2, h, 'cracked') : W.addBox(x0 - t / 2, x0 + t / 2, Math.min(z0, z1), Math.max(z0, z1), h, 'cracked');
  b.off = true; W.setOff(b, false); // (the navigation learns it is there)
  const C = { id: nextId++, b, x0, z0, x1, z1, t, h, horiz, x: (x0 + x1) / 2, z: (z0 + z1) / 2, broken: false };
  (sim.cracked ||= []).push(C);
  return C;
}
// the cracked walls within r of a point (to the nearest point of the wall)
export function crackedNear(sim, x, z, r) {
  const out = [];
  for (const C of sim.cracked || []) { if (C.broken) continue; const b = C.b, qx = Math.max(b.minX, Math.min(x, b.maxX)), qz = Math.max(b.minZ, Math.min(z, b.maxZ)); if (Math.hypot(x - qx, z - qz) < r) out.push(C); }
  return out;
}
export function breakWall(sim, C, dirX = 0, dirZ = 0, by = '') {
  if (C.broken) return; C.broken = true; sim.world.setOff(C.b, true);
  sim.emit({ type: 'wallBreak', id: C.id, x: C.x, z: C.z, dirX, dirZ, by });
}
// a heavy impact at a point (the guard's slam, a cylinder's burst): any cracked wall within r gives way
export function heavyImpact(sim, x, z, r, by) { for (const C of crackedNear(sim, x, z, r)) { const dx = C.x - x, dz = C.z - z, d = Math.hypot(dx, dz) || 1; breakWall(sim, C, dx / d, dz / d, by); } }

// ---------------- the flood ----------------
export function addFlood(sim, { minX, maxX, minZ, maxZ, panel }) {
  const F = { id: nextId++, minX, maxX, minZ, maxZ, panel, recharge: 0, live: 0 };
  (sim.floods ||= []).push(F); return F;
}
export function wadeAt(sim, x, z) { for (const F of sim.floods || []) if (inside(F, x, z)) return F; return null; }
export function joltFlood(sim, F) {
  if (F.recharge > 0) { sim.emit({ type: 'panelSpark', id: F.id, x: F.panel.x, z: F.panel.z }); return; }
  F.recharge = FLOOD.recharge; F.live = 0.6;
  sim.emit({ type: 'floodJolt', id: F.id, minX: F.minX, maxX: F.maxX, minZ: F.minZ, maxZ: F.maxZ, x: F.panel.x, z: F.panel.z });
  for (const z of sim.zombies) {
    if (!z.alive || z.buried || !inside(F, z.x, z.z)) continue;
    z.zapped = true; z.takeHit(9999, 0, 0, 0.6, 'zap', sim, 'torso', 'zap');
  }
  const p = sim.player;
  if (!p.dead && inside(F, p.x, p.z) && p.hurt(FLOOD.jolt, F.panel.x, F.panel.z, sim) && !p.dead) p.knockDown(F.panel.x, F.panel.z, sim);
}
// a round or a blow at the panel? (a bullet: the closest point of its line within panelR of it; a blow: within panelReach of her strike)
export function panelHit(sim, ox, oz, dx, dz, t) {
  for (const F of sim.floods || []) {
    const px = F.panel.x - ox, pz = F.panel.z - oz, along = px * dx + pz * dz;
    if (along < 0 || along > t) continue;
    if (Math.hypot(px - dx * along, pz - dz * along) < FLOOD.panelR) return { F, t: along };
  }
  return null;
}

// ---------------- the MRI magnet ----------------
export function addMRI(sim, { minX, maxX, minZ, maxZ, magnet, button }) {
  const M = { id: nextId++, minX, maxX, minZ, maxZ, magnet, button, state: 'idle', pinned: [], dropped: false, hitSet: new Set() };
  (sim.mris ||= []).push(M); return M;
}
function mriOn(sim, M) {
  const p = sim.player; M.state = 'on';
  M.pinned = p.owned.filter((w) => MRI.gunsOf.includes(w));
  if (M.pinned.length) {
    p.owned = p.owned.filter((w) => !MRI.gunsOf.includes(w));
    if (MRI.gunsOf.includes(p.desired) || MRI.gunsOf.includes(p.equipped)) { p.desired = p.owned[0] || 'fists'; if (!p.owned.length) p.owned.push('fists'); }
  }
  sim.emit({ type: 'mriOn', id: M.id, x: M.magnet.x, z: M.magnet.z, guns: M.pinned.slice() });
  for (const L of sim.loose || []) if (inside(M, L.x, L.z, 1)) { L.owner = 0; L.held = false; L.magnet = M; } // (torn from their zombies)
  ripShields(sim, M);
}
// the guard's shield, ripped off his arm onto the magnet whenever he holds one in its room while it is alive: he is open at once
function ripShields(sim, M) {
  for (const z of sim.zombies) {
    if (z.kind !== 'guard' || !z.alive || !(z.shieldHp > 0) || z.planted || z.state === ZS.PICKUP || !inside(M, z.x, z.z, 2)) continue;
    const a = Math.atan2(M.magnet.x - z.x, M.magnet.z - z.z);
    z.planted = { x: M.magnet.x - Math.sin(a) * 0.55, z: M.magnet.z - Math.cos(a) * 0.55, yaw: a, gx: M.magnet.x - Math.sin(a) * 0.9, gz: M.magnet.z - Math.cos(a) * 0.9, magnet: true };
    z.set(ZS.STAGGER, 1.1); z.attackCd = 1.4;
    sim.emit({ type: 'mriShield', id: z.id, x: z.planted.x, z: z.planted.z });
    sim.openFinisher?.(z, 'magnet', 5);
  }
}
function mriQuench(sim, M) {
  M.state = 'off'; M.dropped = M.pinned.length > 0;
  for (const L of sim.loose || []) if (L.magnet === M) { L.magnet = null; L.vx *= 0.2; L.vz *= 0.2; }
  sim.emit({ type: 'mriQuench', id: M.id, x: M.magnet.x, z: M.magnet.z });
}

// once a step: the flood's slowing and recharge, the magnet's pull and its button, the guns under it
export function roomsStep(sim, dt) {
  const p = sim.player;
  p.wade = wadeAt(sim, p.x, p.z) ? FLOOD.yola : 1; // (core/player.js move)
  for (const F of sim.floods || []) { if (F.recharge > 0) F.recharge -= dt; if (F.live > 0) F.live -= dt; }
  for (const z of sim.zombies) z.wade = sim.floods?.length && wadeAt(sim, z.x, z.z) ? FLOOD.zombie : 1; // (core/zombies.js chase speed)
  for (const M of sim.mris || []) {
    if (M.state === 'idle' && !p.dead && inside(M, p.x, p.z)) mriOn(sim, M);
    if (M.state === 'on') {
      for (const L of sim.loose || []) { // the pull: dragged across the floor at the magnet, stuck to it at the end
        if (L.magnet !== M && !(inside(M, L.x, L.z, 1) && (L.magnet = M))) continue;
        if (L.owner) { L.owner = 0; L.held = false; }
        const q = tankPos(L, {}), dx = M.magnet.x - q.x, dz = M.magnet.z - q.z, d = Math.hypot(dx, dz);
        if (d < MRI.stick) { L.vx = L.vz = 0; continue; }
        L.vx += (dx / d) * MRI.pull * dt; L.vz += (dz / d) * MRI.pull * dt;
        const v = Math.hypot(L.vx, L.vz); if (v > MRI.maxV) { L.vx *= MRI.maxV / v; L.vz *= MRI.maxV / v; }
        if (v > MRI.hurtV) for (const z of sim.zombies) { // it hits whoever is in its way (once each)
          const key = L.id + ':' + z.id; if (!z.alive || M.hitSet.has(key) || Math.hypot(z.x - L.x, z.z - L.z) > z.r + L.r + 0.1) continue;
          M.hitSet.add(key); z.takeHit(MRI.hurtDmg, L.vx / v, L.vz / v, v * 0.8, 'bat', sim, 'torso', 'heavy'); if (z.alive && !z.down && z.kind === 'normal') z.knockDown(L.vx / v, L.vz / v, sim);
          sim.emit({ type: 'mriHit', id: z.id, x: z.x, z: z.z });
        }
      }
      ripShields(sim, M); // (one he takes back off it is torn away again)
      for (const z of sim.zombies) if (z.kind === 'guard' && z.alive && z.planted?.magnet && (z.gstage === 'shield' || z.gstage === 'shield2') && z.state !== ZS.PICKUP && !z.execLock) { z.executable = Math.max(z.executable || 0, sim.time + 1); z.openDur = 5; } // (his shield on the magnet: he stays open to his finisher)
      const clear = !sim.zombies.some((z) => z.alive && !z.passive && inside(M, z.x, z.z));
      if (Math.hypot(p.x - M.button.x, p.z - M.button.z) < MRI.buttonR && !p.dead) {
        if (clear) mriQuench(sim, M); else if (!M.nagT || sim.time > M.nagT) { M.nagT = sim.time + 2.5; sim.emit({ type: 'mriNotYet', id: M.id, x: M.button.x, z: M.button.z }); }
      }
    }
    if (M.state === 'off' && M.dropped && Math.hypot(p.x - M.magnet.x, p.z - M.magnet.z) < MRI.pickR + 0.8) { // her guns, off the floor under it
      M.dropped = false; for (const w of M.pinned) if (!p.owned.includes(w)) p.owned.push(w);
      sim.emit({ type: 'mriGuns', id: M.id, guns: M.pinned.slice() });
    }
  }
}
