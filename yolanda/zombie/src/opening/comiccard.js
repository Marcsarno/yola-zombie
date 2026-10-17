// The reveal's freeze-frame card (2026-10-16, the user's "Borderlands treatment"): the frame Yola is caught in is redrawn
// as a comic panel (heavy ink outlines from the image's edges, flattened colour, a little hatching in the shadows) and her
// name lands on it in big hand-drawn letters with a scrawled tagline over a painted streak. Pure 2D canvas work on one
// frame, so it costs nothing while the game runs.

// source: the WebGL canvas, drawn in the same task as its render (its buffer is not preserved after that)
export function comicFrame(source) {
  const w = source.width, h = source.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data, n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  // ink: Sobel edges on the luminance, thickened by a pixel
  const edge = new Uint8Array(n), T = 0.16;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
    const gy = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
    if (gx * gx + gy * gy > T * T) edge[i] = 1;
  }
  const ink = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (edge[i] || edge[i - 1] || edge[i + w]) ink[i] = 1; }
  // flat colour: a little more contrast and saturation, warm, quantised to a few tones; hatching in the darks
  const q = (v) => Math.round(v * 5) / 5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    if (ink[i]) { d[o] = 18; d[o + 1] = 14; d[o + 2] = 16; continue; }
    let r = d[o] / 255, gg = d[o + 1] / 255, b = d[o + 2] / 255;
    const l = lum[i], sat = Math.max(r, gg, b) - Math.min(r, gg, b), s = 1 + 0.3 * Math.min(1, sat * 3); // (more colour where there is colour: no rainbow banding in the greys)
    r = l + (r - l) * s; gg = l + (gg - l) * s; b = l + (b - l) * s; // saturation
    r = (r - 0.5) * 1.15 + 0.53; gg = (gg - 0.5) * 1.15 + 0.5; b = (b - 0.5) * 1.15 + 0.45; // contrast, warm
    r = q(Math.min(1, Math.max(0, r))); gg = q(Math.min(1, Math.max(0, gg))); b = q(Math.min(1, Math.max(0, b)));
    if (l < 0.22 && (x + y) % 5 === 0) { r *= 0.35; gg *= 0.35; b *= 0.35; } // hatching
    d[o] = r * 255; d[o + 1] = gg * 255; d[o + 2] = b * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// the name card layer: a painted streak, the name, the tagline (w, h: the screen's pixel size)
export function nameCard(w, h, name, tagline) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), u = Math.min(w, h * 0.62);
  const cx = w * 0.5, cy = h * 0.83; // (low on the frame: her face and the bat stay clear)
  g.save(); g.translate(cx, cy); g.rotate(-0.09);
  // the streak: a rough brush stroke behind the letters
  g.fillStyle = '#e8902e'; g.beginPath();
  const L = u * 0.5, H = u * 0.17;
  g.moveTo(-L, -H * 0.5);
  for (let i = 0; i <= 12; i++) { const x = -L + (2 * L * i) / 12; g.lineTo(x, -H * 0.55 + Math.sin(i * 2.3) * H * 0.12); }
  g.lineTo(L * 1.04, H * 0.15);
  for (let i = 12; i >= 0; i--) { const x = -L + (2 * L * i) / 12; g.lineTo(x, H * 0.6 + Math.cos(i * 1.7) * H * 0.14); }
  g.closePath(); g.fill();
  g.globalAlpha = 0.35; g.fillStyle = '#b8541c'; g.fillRect(-L * 0.9, H * 0.25, L * 1.7, H * 0.12); g.globalAlpha = 1;
  // the name
  const fs = Math.round(u * 0.29);
  g.font = `900 ${fs}px Impact, "Arial Black", "Helvetica Neue", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = fs * 0.16; g.strokeStyle = '#141012'; g.strokeText(name, 0, -H * 0.05);
  g.fillStyle = '#fff8ec'; g.fillText(name, 0, -H * 0.05);
  // the tagline, scrawled under it
  const ts = Math.round(u * 0.058);
  g.rotate(0.05);
  g.font = `italic 700 ${ts}px "Segoe Print", "Bradley Hand", "Marker Felt", "Comic Sans MS", cursive`;
  g.lineWidth = ts * 0.32; g.strokeStyle = '#141012'; g.strokeText(tagline, 0, H * 1.1);
  g.fillStyle = '#ffffff'; g.fillText(tagline, 0, H * 1.1);
  g.restore();
  return c;
}
