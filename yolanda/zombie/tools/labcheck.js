// Rig Lab (viewer.html) measuring helpers for the bat combo, loaded from the page console:
//   const C = await import('/zombie/tools/labcheck.js');
//   C.measure()                     -> per-frame feet height, knee bends, lean, hips (bat_combo_mc, Yola units = metres)
//   await C.sheet([frames], 'name') -> Yola from her left side beside the reference frame, saved to shots/<name>.png
// Reference numbers (knees, lean) come from tools/mocap/data/pose13.json, measured in the image.
const L = () => window.__lab;
function bone(n) { let b = null; L().main.root.traverse((o) => { if (!b && o.isBone && o.name.replace(/^mixamorig:?/, '') === n) b = o; }); return b; }
const wp = (n) => { const v = L().camera.position.clone(); bone(n).getWorldPosition(v); return v; };
const knee = (s) => { const a = wp(s + 'UpLeg'), b = wp(s + 'Leg'), c = wp(s + 'Foot'); return 180 - a.sub(b).angleTo(c.sub(b)) * 180 / Math.PI; };

// the shoes as rendered: skinned vertices weighted mostly to each foot (sole height = the lowest one)
let FEET = null;
function shoeVerts() {
  if (FEET) return FEET;
  FEET = { Left: [], Right: [] };
  L().main.obj.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const bones = o.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) {
      let best = 0, bw = 0;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      const m = /^(Left|Right)(Foot|ToeBase|Toe_End)$/.exec(bones[best]);
      if (m) FEET[m[1]].push([o, i]);
    }
  });
  return FEET;
}
export function soles() { // lowest rendered shoe point of each foot (metres above the floor)
  const F = shoeVerts(), v = L().camera.position.clone(), out = {};
  for (const sd of ['Left', 'Right']) {
    let lo = 1e9;
    for (const [o, i] of F[sd]) { o.getVertexPosition(i, v); o.localToWorld(v); if (v.y < lo) lo = v.y; }
    out[sd] = lo;
  }
  return out;
}
export function measure(f0 = 1, f1 = 165) {
  const out = {};
  for (let f = f0; f <= f1; f++) {
    L().setFrame(f); L().main.root.updateMatrixWorld(true);
    const hip = wp('LeftUpLeg').add(wp('RightUpLeg')).multiplyScalar(0.5), sh = wp('LeftArm').add(wp('RightArm')).multiplyScalar(0.5);
    const t = sh.sub(hip);
    out[f] = {
      ...(() => { const so = soles(); return { footL: so.Left, footR: so.Right }; })(),
      kneeL: knee('Left'), kneeR: knee('Right'), lean: Math.atan2(t.z, t.y) * 180 / Math.PI, hipY: hip.y,
    };
  }
  return out;
}
let REF = null;
export async function reference() { // knee bends and lean from the reference image (side view, target on the left)
  if (REF) return REF;
  const d = await (await fetch('/zombie/tools/mocap/data/pose13.json')).json(), W = d.w, H = d.h; REF = {};
  const ang = (a, b, c) => { const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]]; return 180 - Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; };
  for (const fr of d.frames) {
    if (fr.f < 20 || fr.f > 184 || !fr.img) continue;
    const p = fr.img.map((q) => [q[0] * W, q[1] * H]);
    const hip = [(p[23][0] + p[24][0]) / 2, (p[23][1] + p[24][1]) / 2], sh = [(p[11][0] + p[12][0]) / 2, (p[11][1] + p[12][1]) / 2];
    REF[fr.f - 19] = { kneeL: ang(p[23], p[25], p[27]), kneeR: ang(p[24], p[26], p[28]), lean: Math.atan2(-(sh[0] - hip[0]), hip[1] - sh[1]) * 180 / Math.PI };
  }
  return REF;
}
export async function compare(step = 6) {
  const m = measure(), r = await reference(), rows = [];
  for (let f = 2; f <= 165; f += step) {
    const a = m[f], b = r[f] || {};
    rows.push(`${f}\tfeet ${a.footL.toFixed(3)} ${a.footR.toFixed(3)}\tknees ${a.kneeL.toFixed(0)}/${a.kneeR.toFixed(0)} ref ${b.kneeL?.toFixed(0)}/${b.kneeR?.toFixed(0)}\tlean ${a.lean.toFixed(0)} ref ${b.lean?.toFixed(0)}\thipY ${a.hipY.toFixed(3)}`);
  }
  const fl = Object.values(m), lowest = fl.map((q) => Math.min(q.footL, q.footR));
  rows.push(`(feet = lowest rendered shoe point, m) lowest foot: max ${Math.max(...lowest).toFixed(3)} min ${Math.min(...lowest).toFixed(3)}; frames with both feet > 5 cm: ${lowest.filter((v) => v > 0.05).length}; straight knees (<8 deg, both legs counted): ${fl.reduce((n, q) => n + (q.kneeL < 8) + (q.kneeR < 8), 0)}`);
  return rows.join('\n');
}
export async function sheet(frames, name, { cam = 'side', cols = 4, W = 450, crop = 0.75 } = {}) {
  const lab = L(), rows = Math.ceil(frames.length / cols);
  const out = document.createElement('canvas'); out.width = cols * W * 2; out.height = rows * W;
  const g = out.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, out.width, out.height);
  if (cam) lab.setCam(cam);
  const cv = lab.renderer.domElement;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]; lab.setFrame(f); lab.controls.update(); lab.renderer.render(lab.scene, lab.camera);
    const cx = (i % cols) * W * 2, cy = Math.floor(i / cols) * W, s = Math.min(cv.width, cv.height) * crop;
    g.drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, cx, cy, W, W);
    try { // (img.decode() never settles while the browser pane is hidden; createImageBitmap does)
      const img = await createImageBitmap(await (await fetch(`/zombie/assets/ref/bat13/f${String(f + 19).padStart(4, '0')}.jpg`)).blob());
      const sc = Math.min(W / img.width, W / img.height); g.drawImage(img, cx + W + (W - img.width * sc) / 2, cy + (W - img.height * sc) / 2, img.width * sc, img.height * sc);
    } catch (e) { /* no reference frame */ }
    g.fillStyle = '#ff0'; g.font = 'bold 22px sans-serif'; g.fillText('f' + f, cx + 8, cy + 26);
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  await fetch('/__shot/' + name + '.png', { method: 'POST', body: blob });
  return `${out.width}x${out.height}`;
}

// Grip sheet (tools/hold/gripsheet.py renders + holdcheck numbers): per frame one row = 8 views around the hands + front +
// side, captioned with the measurements. dir: under /zombie/shots/; out: shots/<out>.png
export async function gripSheet(dir, out, { W = 300, perFrame = false } = {}) {
  if (perFrame) return gripPages(dir, out);
  const idx = await (await fetch(`/zombie/shots/${dir}/index.json?${Date.now()}`)).json();
  const cols = 10, capH = 64, c = document.createElement('canvas'); c.width = cols * W; c.height = idx.length * (W + capH);
  const g = c.getContext('2d'); g.fillStyle = '#121416'; g.fillRect(0, 0, c.width, c.height);
  const views = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'front', 'side'];
  const vl = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left', 'full front', 'full side'];
  for (let r = 0; r < idx.length; r++) {
    const it = idx[r], y0 = r * (W + capH), ck = it.check || {};
    for (let k = 0; k < views.length; k++) {
      try { const im = await createImageBitmap(await (await fetch(`/zombie/shots/${dir}/${it.shot}_${views[k]}.png?${Date.now()}`)).blob()); g.drawImage(im, k * W, y0 + capH, W, W); } catch (e) { /* missing */ }
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(k * W, y0 + capH, 118, 20); g.fillStyle = '#fff'; g.font = '13px sans-serif'; g.fillText(vl[k], k * W + 5, y0 + capH + 15);
    }
    const j = ck.joints || {}, fl = (s) => (j[s]?.faults || []).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}°`).join(', ') || 'none';
    g.fillStyle = '#ffe14d'; g.font = 'bold 17px sans-serif'; g.fillText(it.shot, 8, y0 + 20);
    g.fillStyle = '#e8eef0'; g.font = '14px sans-serif';
    const sp = ck.support || {};
    g.fillText(`support fist: ${sp.off_shaft_cm} cm off the shaft, ${sp.along_err_cm} cm along, axis ${sp.axis_deg}°   |   bat inside body: ${ck.weapon_in_body_cm} cm${ck.weapon_in_body_at_m != null ? ' at ' + ck.weapon_in_body_at_m.toFixed(2) + ' m from the knob (red ring)' : ''}   |   arm skin inside body: L ${ck.arm_in_body_cm?.Left} R ${ck.arm_in_body_cm?.Right} cm`, 8, y0 + 40);
    g.fillText(`joint limits exceeded: left arm ${fl('Left')}; right arm ${fl('Right')}   |   finger curl L ${ck.curl?.Left}° R ${ck.curl?.Right}°`, 8, y0 + 58);
  }
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  await fetch('/__shot/' + out + '.png', { method: 'POST', body: blob });
  return `${c.width}x${c.height}`;
}

// one page per frame: 5 x 2 tiles of 440 px (readable at full size), captions on top -> shots/<out>_<shot>.png
async function gripPages(dir, out, W = 440) {
  const idx = await (await fetch(`/zombie/shots/${dir}/index.json?${Date.now()}`)).json();
  const views = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'front', 'side'];
  const vl = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left', 'full front', 'full side'];
  const made = [];
  for (const it of idx) {
    const capH = 70, c = document.createElement('canvas'); c.width = 5 * W; c.height = 3 * W + capH; const g = c.getContext('2d');
    g.fillStyle = '#121416'; g.fillRect(0, 0, c.width, c.height);
    for (let k = 0; k < 10; k++) {
      const x = (k % 5) * W, y = capH + Math.floor(k / 5) * W;
      try { const im = await createImageBitmap(await (await fetch(`/zombie/shots/${dir}/${it.shot}_${views[k]}.png?${Date.now()}`)).blob()); g.drawImage(im, x, y, W, W); } catch (e) { /* missing */ }
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y, 130, 22); g.fillStyle = '#fff'; g.font = '14px sans-serif'; g.fillText(vl[k], x + 6, y + 16);
    }
    // row 3: the skeleton (left blue, right red, spine yellow) over the faded body, same cameras
    const sk = [['a1', 'skel_a1', 'skeleton, front-right'], ['a5', 'skel_a5', 'skeleton, back-left'], ['a7', 'skel_a7', 'skeleton, front-left'], ['front', 'skel_front', 'skeleton, full front']];
    for (let k = 0; k < sk.length; k++) {
      const x = k * W, y = capH + 2 * W;
      try {
        const bg = await createImageBitmap(await (await fetch(`/zombie/shots/${dir}/${it.shot}_${sk[k][0]}.png?${Date.now()}`)).blob());
        const fg = await createImageBitmap(await (await fetch(`/zombie/shots/${dir}/${it.shot}_${sk[k][1]}.png?${Date.now()}`)).blob());
        g.globalAlpha = 0.3; g.drawImage(bg, x, y, W, W); g.globalAlpha = 1; g.drawImage(fg, x, y, W, W);
      } catch (e) { /* missing */ }
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y, 190, 22); g.fillStyle = '#fff'; g.font = '14px sans-serif'; g.fillText(sk[k][2], x + 6, y + 16);
    }
    g.fillStyle = '#9aa7ad'; g.font = '14px sans-serif';
    ['Close views: anything nearer than 16 cm', 'in front of the hands is cut away, so', 'nothing hides the grip (that is why', 'some arms look hollow).', '', 'Skeleton: left blue, right red,', 'spine and head yellow.'].forEach((l, i) => g.fillText(l, 4 * W + 12, capH + 2 * W + 30 + i * 20));
    const ck = it.check || {}, j = ck.joints || {}, fl = (s) => (j[s]?.faults || []).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}°`).join(', ') || 'none', sp = ck.support || {};
    g.fillStyle = '#ffe14d'; g.font = 'bold 18px sans-serif'; g.fillText(it.shot, 8, 22);
    g.fillStyle = '#e8eef0'; g.font = '15px sans-serif';
    g.fillText(`support (right) fist: ${sp.off_shaft_cm} cm off the shaft, ${sp.along_err_cm} cm along, axis ${sp.axis_deg}°  |  bat inside body: ${ck.weapon_in_body_cm} cm${ck.weapon_in_body_at_m != null ? ' at ' + ck.weapon_in_body_at_m.toFixed(2) + ' m from the knob (red ring)' : ''}  |  arm skin inside body: L ${ck.arm_in_body_cm?.Left} R ${ck.arm_in_body_cm?.Right} cm`, 8, 44);
    g.fillText(`beyond human limits: left arm ${fl('Left')}; right arm ${fl('Right')}  |  finger curl L ${ck.curl?.Left}° R ${ck.curl?.Right}°`, 8, 64);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    await fetch('/__shot/' + out + '_' + it.shot + '.png', { method: 'POST', body: blob }); made.push(out + '_' + it.shot);
  }
  return made;
}
