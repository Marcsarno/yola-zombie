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
  const edge = new Uint8Array(n), T = 0.3; // (only the strong edges: a light outline)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
    const gy = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
    if (gx * gx + gy * gy > T * T) edge[i] = 1;
  }
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (edge[i]) ink[i] = 1; // (one pixel: an outline, not a cartoon)
  // her true colours (2026-10-17: the flattened, saturated grade drowned them): a touch of contrast and a light ink line
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (ink[i]) { d[o] = d[o] * 0.35; d[o + 1] = d[o + 1] * 0.32; d[o + 2] = d[o + 2] * 0.34; continue; }
    for (let k = 0; k < 3; k++) d[o + k] = Math.max(0, Math.min(255, (d[o + k] - 128) * 1.08 + 128));
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
