// The room mechanics drawn (core/rooms.js): cracked walls (a concrete slab with a jagged crack and dust trickling from it;
// broken: chunks thrown, a dust cloud), the flood (dark water with a moving ripple, splashes round anyone wading; the panel
// on its post sparking while it is live; the jolt: arcs crackling across the water and a cold flash), the MRI magnet (the
// scanner's ring and bed; alive: a blue glow and a hum, the guns it tore away pinned to its face; the big red button on its
// post, lit once the room is clear; the shutdown: helium blasting out of the vent in a white cloud).
import * as THREE from 'three';
import { cue } from '../sfx/cues.js';
import { propClone, findMat } from './roomprops.js';

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function crackTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b3a8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '70,66,60' : '230,226,218'},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    const bolt = (x, y, a, len, wd) => { g.lineWidth = wd; g.strokeStyle = 'rgba(30,26,22,.92)'; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 9; k++) { a += (Math.random() - 0.5) * 0.9; x += Math.cos(a) * len / 9; y += Math.sin(a) * len / 9; g.lineTo(x, y); if (Math.random() < 0.3 && wd > 1.2) { const s = g.lineWidth; bolt(x, y, a + (Math.random() < 0.5 ? 1 : -1) * 0.9, len * 0.4, wd * 0.5); g.lineWidth = s; g.beginPath(); g.moveTo(x, y); } } g.stroke(); };
    for (let i = 0; i < 6; i++) bolt(w * 0.5, h * 0.5, i * Math.PI / 3 + Math.random() * 0.6, 170, 9);
    g.fillStyle = 'rgba(40,36,30,.6)'; g.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, r = 22 + Math.random() * 16; g.lineTo(w * 0.5 + Math.cos(a) * r, h * 0.5 + Math.sin(a) * r); } g.closePath(); g.fill(); // (the blown-in centre)
  });
}
function waterTex() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#223a3c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${150 + Math.random() * 60},${200 + Math.random() * 40},${200 + Math.random() * 40},${0.06 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 30; g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export class RoomsView {
  constructor(scene, fx, audio) {
    this.scene = scene; this.fx = fx; this.audio = audio; this.walls = new Map(); this.floods = new Map(); this.mris = new Map(); this.t = 0;
    this.mats = { crack: null, steel: new THREE.MeshStandardMaterial({ color: 0x8e979c, roughness: 0.45, metalness: 0.6 }), white: new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.35 }), dark: new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5 }), red: new THREE.MeshStandardMaterial({ color: 0xc81e14, roughness: 0.3, emissive: 0x400000 }) };
    this.arcs = [];
  }
  reset(sim) {
    this.sim = sim;
    for (const V of this.walls.values()) this.scene.remove(V.m);
    for (const V of this.floods.values()) this.scene.remove(V.water, V.panel);
    for (const V of this.mris.values()) { this.scene.remove(V.g); if (V.stop) this.scene.remove(V.stop, V.ring); }
    this.walls.clear(); this.floods.clear(); this.mris.clear();
  }
  // a cracked wall: the slab, the crack painted on both faces
  makeWall(C) {
    this.mats.crack ||= new THREE.MeshStandardMaterial({ map: crackTex(), roughness: 0.9 });
    const len = C.horiz ? Math.abs(C.x1 - C.x0) : Math.abs(C.z1 - C.z0), m = new THREE.Mesh(new THREE.BoxGeometry(C.horiz ? len : C.t, C.h, C.horiz ? C.t : len), this.mats.crack);
    m.position.set(C.x, C.h / 2, C.z); m.castShadow = m.receiveShadow = true; this.scene.add(m); return { m, len, dustT: 0 };
  }
  makeFlood(F) {
    const w = F.maxX - F.minX, d = F.maxZ - F.minZ, tex = waterTex(); tex.repeat.set(w / 2.5, d / 2.5);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, color: 0x9fc4c4, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.78, depthWrite: false }));
    water.rotation.x = -Math.PI / 2; water.position.set((F.minX + F.maxX) / 2, 0.035, (F.minZ + F.maxZ) / 2); water.renderOrder = 1; water.receiveShadow = true; this.scene.add(water);
    const yaw = F.panel.yaw ?? Math.atan2((F.minX + F.maxX) / 2 - F.panel.x, (F.minZ + F.maxZ) / 2 - F.panel.z); // (facing the water)
    const model = propClone('flood_panel');
    if (model) { model.position.set(F.panel.x, 0, F.panel.z); model.rotation.y = yaw; this.scene.add(model); return { water, tex, panel: model, lampG: findMat(model, 'Panel_LampGreen'), lampR: findMat(model, 'Panel_LampRed'), yaw }; }
    const panel = new THREE.Group(); panel.position.set(F.panel.x, 0, F.panel.z); panel.rotation.y = yaw;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), this.mats.steel); post.position.y = 0.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.22), new THREE.MeshStandardMaterial({ color: 0x8c8f78, roughness: 0.6, metalness: 0.4 })); box.position.y = 1.35;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false })); lamp.position.set(0, 1.62, 0.12);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.26), new THREE.MeshBasicMaterial({ map: canvasTex(64, 56, (g) => { g.fillStyle = '#ffd21f'; g.beginPath(); g.moveTo(32, 2); g.lineTo(62, 54); g.lineTo(2, 54); g.closePath(); g.fill(); g.fillStyle = '#111'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('⚡', 32, 48); }), transparent: true })); sign.position.set(0, 1.3, 0.115);
    for (const o of [post, box]) { o.castShadow = true; panel.add(o); } panel.add(lamp, sign); this.scene.add(panel);
    return { water, tex, panel, lamp, yaw };
  }
  makeMRI(M) {
    const scan = propClone('mri_scanner'), stop = propClone('magnet_stop');
    if (scan && stop) {
      scan.position.set(M.magnet.x, 0, M.magnet.z); scan.rotation.y = M.yaw ?? 0; this.scene.add(scan);
      stop.position.set(M.button.x, 0, M.button.z); stop.rotation.y = Math.atan2(M.magnet.x - M.button.x, M.magnet.z - M.button.z) + Math.PI; this.scene.add(stop); // (its button facing away from the magnet: into the room)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 28), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(M.button.x, 0.03, M.button.z); this.scene.add(ring);
      const pins = [0, 1].map((i) => { const p = new THREE.Mesh(new THREE.BoxGeometry(i ? 0.75 : 0.24, 0.1, 0.06), this.mats.dark); p.position.set(i ? 0.3 : -0.55, i ? 1.62 : 1.42, 0.62); p.rotation.z = i ? 0.3 : -0.5; p.visible = false; scan.add(p); return p; }); // (her guns, stuck to its face)
      const drops = [0, 1].map((i) => { const p = new THREE.Mesh(new THREE.BoxGeometry(i ? 0.75 : 0.24, 0.08, 0.1), this.mats.dark); p.position.set(i ? 0.9 : -0.8, 0.05, 0.9); p.rotation.y = i ? 0.6 : -0.3; p.visible = false; scan.add(p); return p; });
      return { g: scan, stop, glowMat: findMat(scan, 'MRI_Glow'), capMat: findMat(stop, 'Button_Red'), ring, pins, drops, humT: 0 };
    }
    const g = new THREE.Group(); g.position.set(M.magnet.x, 0, M.magnet.z);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.0, 40, 1, true), this.mats.white); housing.rotation.x = Math.PI / 2; housing.position.y = 1.15;
    const face = new THREE.Mesh(new THREE.RingGeometry(0.42, 1.15, 40), this.mats.white); face.position.set(0, 1.15, 0.5);
    const back = face.clone(); back.position.z = -0.5; back.rotation.y = Math.PI;
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.4, side: THREE.BackSide, emissive: 0x0a2a4a, emissiveIntensity: 0 })); bore.rotation.x = Math.PI / 2; bore.position.y = 1.15;
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.43, 0.56, 40), new THREE.MeshBasicMaterial({ color: 0x55b8ff, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide })); glow.position.set(0, 1.15, 0.505);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 1.0), this.mats.white); base.position.y = 0.125;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 1.9), this.mats.white); bed.position.set(0, 0.85, 1.4); const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), this.mats.steel); leg.position.set(0, 0.4, 1.6);
    for (const o of [housing, face, back, bore, base, bed, leg]) { o.castShadow = o.receiveShadow = true; g.add(o); } g.add(glow); this.scene.add(g);
    const btn = new THREE.Group(); btn.position.set(M.button.x, 0, M.button.z);
    const bpost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.0, 12), new THREE.MeshStandardMaterial({ color: 0xf2c018, roughness: 0.5 })); bpost.position.y = 0.5;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.red); cap.position.y = 1.02;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 28), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    bpost.castShadow = cap.castShadow = true; btn.add(bpost, cap, ring); this.scene.add(btn);
    const pins = [0, 1].map((i) => { const p = new THREE.Mesh(new THREE.BoxGeometry(i ? 0.75 : 0.24, 0.1, 0.06), this.mats.dark); p.position.set(i ? 0.25 : -0.55, i ? 1.75 : 1.5, 0.53); p.rotation.z = i ? 0.3 : -0.5; p.visible = false; g.add(p); return p; }); // (her guns, stuck to its face)
    const drops = [0, 1].map((i) => { const p = new THREE.Mesh(new THREE.BoxGeometry(i ? 0.75 : 0.24, 0.08, 0.1), this.mats.dark); p.position.set(i ? 0.35 : -0.4, 0.05, 1.1); p.rotation.y = i ? 0.6 : -0.3; p.visible = false; g.add(p); return p; });
    return { g, glow, bore, ring, cap, pins, drops, state: 'idle', humT: 0 };
  }
  // per frame: build what is new, animate it, react to its events (main.js passes the sim's events through onEvent)
  update(sim, dt) {
    if (sim !== this.sim) this.reset(sim); // (a restart: a fresh simulation, fresh rooms)
    this.t += dt; const fx = this.fx;
    for (const C of sim.cracked || []) {
      let V = this.walls.get(C.id); if (!V) { V = this.makeWall(C); this.walls.set(C.id, V); }
      if (C.broken) { if (V.m.visible) V.m.visible = false; continue; }
      if (fx && (V.dustT -= dt) <= 0) { V.dustT = 0.5 + Math.random() * 0.9; fx.burst(C.x + (Math.random() - 0.5) * (C.horiz ? V.len * 0.5 : 0.1), 0.6 + Math.random() * 1.4, C.z + (Math.random() - 0.5) * (C.horiz ? 0.1 : V.len * 0.5), 2, 0xc9c2b4, 0.25, -0.4, 1.2); } // (dust trickling out of the crack)
    }
    for (const F of sim.floods || []) {
      let V = this.floods.get(F.id); if (!V) { V = this.makeFlood(F); this.floods.set(F.id, V); }
      V.tex.offset.set(Math.sin(this.t * 0.21) * 0.08, this.t * 0.02); // (the ripple drifting)
      const ready = !(F.recharge > 0);
      if (V.lamp) V.lamp.material.color.setHex(ready ? 0x40ff60 : 0xff3020);
      if (V.lampG) { V.lampG.emissive.setHex(0x38ff60); V.lampG.emissiveIntensity = ready ? 3 : 0.05; } if (V.lampR) { V.lampR.emissive.setHex(0xff3020); V.lampR.emissiveIntensity = ready ? 0.05 : 3 * (0.6 + 0.4 * Math.sin(this.t * 8)); }
      if (fx && ready && Math.random() < dt * 3) { const fx0 = Math.sin(V.yaw) * 0.2, fz0 = Math.cos(V.yaw) * 0.2; fx.burst(F.panel.x + fx0 + Math.sin(V.yaw) * 0.45, 0.06, F.panel.z + fz0 + Math.cos(V.yaw) * 0.45, 3, 0xfff1a0, 1.6, 0.6, 0.2); } // (live: the torn cable spits sparks into the water)
      if (fx) for (const b of [sim.player, ...sim.zombies]) { // splashes round anyone moving in it
        if (b.dead || b.alive === false) continue; const sp = Math.hypot(b.vx || 0, b.vz || 0);
        if (sp > 0.4 && b.x > F.minX && b.x < F.maxX && b.z > F.minZ && b.z < F.maxZ && Math.random() < dt * sp * 4) fx.burst(b.x, 0.05, b.z, 3, 0xcfe6ea, 0.9, 1.2, 0.35);
      }
    }
    for (const M of sim.mris || []) {
      let V = this.mris.get(M.id); if (!V) { V = this.makeMRI(M); this.mris.set(M.id, V); }
      const on = M.state === 'on', clear = on && !sim.zombies.some((z) => z.alive && !z.passive && z.x > M.minX && z.x < M.maxX && z.z > M.minZ && z.z < M.maxZ);
      if (V.glowMat) { V.glowMat.emissive.setHex(0x55b8ff); V.glowMat.emissiveIntensity = on ? 2.2 + 1.2 * Math.sin(this.t * 7) : 0; }
      if (V.glow) { V.glow.material.opacity = on ? 0.55 + 0.35 * Math.sin(this.t * 7) : 0; V.bore.material.emissiveIntensity = on ? 1.4 : 0; }
      V.ring.material.opacity = clear ? 0.5 + 0.4 * Math.sin(this.t * 6) : 0;
      if (V.capMat) { V.capMat.emissive.setHex(0xff2010); V.capMat.emissiveIntensity = clear ? 1.5 + Math.sin(this.t * 6) : 0; } else if (V.cap) V.cap.material.emissive.setHex(clear ? 0xff2010 : 0x400000);
      V.pins.forEach((p, i) => { p.visible = on && !!M.pinned[i]; }); V.drops.forEach((p, i) => { p.visible = M.state === 'off' && M.dropped && !!M.pinned[i]; });
      if (on && (V.humT -= dt) <= 0) { V.humT = 1.5; cue(this.audio, 'hum', 0.5); }
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) { const A = this.arcs[i]; A.t += dt; A.l.material.opacity = Math.max(0, 1 - A.t / 0.5) * (Math.random() < 0.5 ? 1 : 0.4); if (A.t > 0.5) { this.scene.remove(A.l); A.l.geometry.dispose(); A.l.material.dispose(); this.arcs.splice(i, 1); } }
  }
  onEvent(e, sim) {
    const fx = this.fx, a = this.audio;
    switch (e.type) {
      case 'wallBreak': { // chunks out along the blow, a dust cloud, the crumble
        const C = (sim.cracked || []).find((q) => q.id === e.id); if (!C) break;
        cue(a, 'crumble'); fx.burst(C.x, 1.2, C.z, 40, 0xb9b3a8, 4.5, 1.6, 0.9, e.dirX, e.dirZ); fx.burst(C.x, 0.8, C.z, 22, 0x6f6a62, 3.6, 1.2, 1.1, e.dirX, e.dirZ);
        fx.smoke(C.x, C.z, 12, 1.2, 1.0, 3.4, 2.6, 0xa8a196, 1.0); fx.ring(C.x, C.z, 0xd8cfbf, 1.6); return 'shake:0.5';
      }
      case 'wallClank': fx.burst(e.x, 1.2, e.z, 6, 0xc9c2b4, 1.2, 0.6, 0.6); return 'hint'; // (not heavy enough: dust off the crack)
      case 'floodJolt': { // arcs across the water, a cold flash, the buzz
        cue(a, 'zap', 1.2);
        for (let k = 0; k < 9; k++) {
          const pts = [], x0 = e.x, z0 = e.z, x1 = e.minX + Math.random() * (e.maxX - e.minX), z1 = e.minZ + Math.random() * (e.maxZ - e.minZ);
          for (let s = 0; s <= 10; s++) { const u = s / 10; pts.push(new THREE.Vector3(x0 + (x1 - x0) * u + (Math.random() - 0.5) * 0.35, 0.06 + Math.random() * 0.12 + (s === 0 ? 1.2 : 0), z0 + (z1 - z0) * u + (Math.random() - 0.5) * 0.35)); }
          const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending }));
          this.scene.add(l); this.arcs.push({ l, t: 0 });
        }
        fx.flashLight.position.set((e.minX + e.maxX) / 2, 1.0, (e.minZ + e.maxZ) / 2); fx.flashLight.distance = 16; fx.flashLight.color.setHex(0x8fd8ff); fx.flashLight.intensity = 45;
        for (let k = 0; k < 14; k++) fx.burst(e.minX + Math.random() * (e.maxX - e.minX), 0.1, e.minZ + Math.random() * (e.maxZ - e.minZ), 4, 0xd8f6ff, 2.2, 1.6, 0.3);
        return 'shake:0.35';
      }
      case 'panelSpark': fx.burst(e.x, 1.4, e.z + 0.12, 5, 0xfff1a0, 1.2, 0.3, 0.2); return 'hint';
      case 'mriOn': cue(a, 'hum', 1.2); fx.ring(e.x, e.z, 0x55b8ff, 2.6); fx.ring(e.x, e.z, 0x9fd8ff, 4.0); return 'shake:0.25';
      case 'mriShield': cue(a, 'free'); fx.burst(e.x, 1.1, e.z, 14, 0xe9e1cf, 2.8, 1.0, 0.5); return 'shake:0.3';
      case 'mriHit': fx.hitFlash?.(e.x, 1.1, e.z, 0, 0, 1.2); return '';
      case 'mriQuench': cue(a, 'quench', 1.2); for (let k = 0; k < 4; k++) fx.smoke(e.x + (Math.random() - 0.5) * 1.2, e.z + (Math.random() - 0.5) * 1.2, 10, 1.6, 1.4, 4.2, 3.4, 0xf2f6f8, 1.4 + k * 0.4); fx.burst(e.x, 2.4, e.z, 30, 0xffffff, 4.5, 2.4, 0.9); return 'shake:0.4';
      default: return null;
    }
  }
}
