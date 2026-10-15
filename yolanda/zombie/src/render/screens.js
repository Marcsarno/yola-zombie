// Live monitor screens. Every display in the scene (a mesh whose material is a monitor "Screen") gets a glowing face
// in front of it showing a sweeping ECG, an oxygen pleth and a breathing trace with readouts; the static trace meshes
// that were modelled on top of it are hidden. All screens share one small canvas, redrawn ~12 times a second, so the
// cost is one texture upload however many monitors there are. `flat` turns the ECG into an alarmed flat line.
import * as THREE from 'three';

const W = 256, H = 192, FPS = 12;

export class LiveScreens {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.t = 0; this.acc = 1; this.flat = false; this.done = new WeakSet(); this.count = 0;
    this.draw();
  }

  // find displays under root (call again after more models load; a screen is only dressed once)
  scan(root) {
    const screens = [];
    const matName = (o) => [].concat(o.material).map((m) => m?.name || '').join('|');
    const merged = (o) => { for (let p = o.parent; p; p = p.parent) if (/^room:/.test(p.name)) return true; return false; }; // (a room's props merged into one mesh: many screens, no single front)
    root.traverse((o) => { if (o.isMesh && !this.done.has(o) && /^Screen/.test(matName(o)) && !merged(o)) screens.push(o); });
    for (const s of screens) {
      this.done.add(s);
      // the modelled (static) traces drawn on this display: its neighbours in trace colours (not the housing or buttons)
      for (const sib of s.parent?.children || []) if (sib !== s && sib.isMesh && /^(ECG|SignalBlue|Yellow|Green|Trace)/.test(matName(sib)) && sib.geometry) {
        sib.geometry.computeBoundingBox(); const bb = sib.geometry.boundingBox, w = bb.getSize(new THREE.Vector3());
        if (Math.max(w.x, w.z) > 0.1) sib.visible = false; // a stroke spans the glass (a knob or lamp is small)
      }
      s.geometry.computeBoundingBox();
      const b = s.geometry.boundingBox, sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      // the face lies on the screen's thin axis, on the side facing away from the device's body
      // the model's own front (+z of the loaded model, its root under the placed holder), in the screen's frame
      let top = s; while (top.parent && !top.parent.userData.prop && top.parent.parent && top.parent.parent.type !== 'Scene') top = top.parent;
      s.updateWorldMatrix(true, false); top.updateWorldMatrix(true, false);
      const front = new THREE.Vector3(0, 0, 1).transformDirection(top.matrixWorld);
      const inv = new THREE.Matrix4().copy(s.matrixWorld).invert(); front.transformDirection(inv);
      // the glass's real facing: the average of the vertex normals that point roughly to the model's front (a screen can
      // be modelled tilted inside its own frame), then the face is fitted to the glass rectangle in that orientation
      const pos = s.geometry.attributes.position, nor = s.geometry.attributes.normal;
      const n = new THREE.Vector3(), t = new THREE.Vector3();
      if (nor) for (let i = 0; i < nor.count; i++) { t.fromBufferAttribute(nor, i); if (t.dot(front) > 0.5) n.add(t); }
      if (n.lengthSq() < 1e-6) n.copy(front); n.normalize();
      const u = new THREE.Vector3(0, 1, 0).cross(n); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize();
      const v = new THREE.Vector3().crossVectors(n, u);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, d1 = -Infinity;
      for (let i = 0; i < pos.count; i++) { t.fromBufferAttribute(pos, i); const a = t.dot(u), bb = t.dot(v), dd = t.dot(n); u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, bb); v1 = Math.max(v1, bb); d1 = Math.max(d1, dd); }
      const face = new THREE.Mesh(new THREE.PlaneGeometry((u1 - u0) * 0.92, (v1 - v0) * 0.88), this.mat);
      face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
      face.position.copy(u).multiplyScalar((u0 + u1) / 2).addScaledVector(v, (v0 + v1) / 2).addScaledVector(n, d1 + 0.002);
      face.name = 'liveScreen';
      s.add(face); this.count++;
    }
    return screens.length;
  }

  update(dt) {
    this.t += dt; this.acc += dt;
    if (this.acc < 1 / FPS) return;
    this.acc = 0; this.draw(); this.tex.needsUpdate = true;
  }

  draw() {
    const g = this.g, t = this.t;
    g.fillStyle = '#071a1c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(80, 160, 150, 0.12)'; g.lineWidth = 1; // faint grid
    for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const tw = 178, sweep = (t * 70) % tw; // traces on the left, readouts on the right; the sweep bar moves right
    const trace = (y0, amp, col, fn, flat = false) => {
      g.strokeStyle = col; g.lineWidth = 2.4; g.shadowColor = col; g.shadowBlur = 6; g.beginPath();
      let pen = false;
      for (let x = 4; x < tw; x++) {
        if (Math.abs(x - sweep) < 7) { pen = false; continue; } // the gap the sweep erases
        const age = x <= sweep ? (sweep - x) / 70 : (sweep + tw - x) / 70; // seconds since the sweep drew this column
        const y = y0 - (flat ? 0 : amp * fn(t - age));
        if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
      }
      g.stroke(); g.shadowBlur = 0;
    };
    const beat = (s) => { const p = ((s % 0.83) + 0.83) % 0.83; return p < 0.03 ? -0.15 : p < 0.06 ? 1 : p < 0.09 ? -0.35 : p > 0.25 && p < 0.38 ? 0.22 * Math.sin(((p - 0.25) / 0.13) * Math.PI) : 0; };
    const pleth = (s) => { const p = ((s % 0.83) + 0.83) % 0.83 / 0.83; return p < 0.3 ? Math.sin((p / 0.3) * Math.PI * 0.5) : Math.max(0, 1 - (p - 0.3) / 0.7) * (0.85 + 0.15 * Math.sin(p * 12)); };
    const resp = (s) => Math.sin(s * 1.6);
    trace(52, 30, this.flat ? '#ff5a4f' : '#5cf08a', beat, this.flat);
    trace(112, 22, '#5cc8ff', pleth);
    trace(165, 12, '#ffd34f', resp);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    const read = (label, val, col, y) => { g.fillStyle = col; g.font = '700 11px system-ui, sans-serif'; g.fillText(label, W - 8, y - 18); g.font = '800 32px system-ui, sans-serif'; g.fillText(val, W - 8, y + 6); };
    const blink = this.flat && Math.floor(t * 2) % 2;
    read('HR', this.flat ? (blink ? '---' : '0') : String(72 + Math.round(Math.sin(t * 0.3) * 2)), this.flat ? '#ff5a4f' : '#5cf08a', 46);
    read('SpO2', '98', '#5cc8ff', 108);
    read('RR', '16', '#ffd34f', 162);
  }
}
