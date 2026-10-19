// (PERF_AUDIT.md 6) every copy of the same image on the GPU once. The hospital props each carry their own copy of the kit's
// atlases (crna_shared_atlas was uploaded 30 times, reception_graphics_atlas 10, the steel / gunmetal / rubber maps several
// times: ~200 MB of copies). Two textures are the same image when their name, size and a 16x16 thumbnail match; the
// later one is pointed at the first one's Source (each texture keeps its own wrap / flip / repeat, so no material changes
// how it looks). Canvas, video, data and render-target textures are left alone (they can change). Then every texture is
// uploaded now (behind the loading screen) instead of on first sight, where an upload is a hitch.
import * as THREE from 'three';

const seen = new WeakSet(), canon = new Map();
let thumb = null;
const keyOf = (t) => {
  const im = t.image, w = im?.width, h = im?.height;
  if (!w || !h) return null;
  thumb ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  thumb.canvas.width = thumb.canvas.height = 16;
  try { thumb.clearRect(0, 0, 16, 16); thumb.drawImage(im, 0, 0, 16, 16); } catch { return null; }
  const d = thumb.getImageData(0, 0, 16, 16).data; let a = 2166136261 >>> 0;
  for (let i = 0; i < d.length; i++) a = Math.imul(a ^ d[i], 16777619) >>> 0;
  return `${t.name}|${w}x${h}|${a}`;
};
const shareable = (t) => {
  if (!t?.isTexture || t.isRenderTargetTexture || t.isDataTexture || t.isCompressedTexture || t.isVideoTexture || t.isCanvasTexture || t.isCubeTexture) return false;
  const im = t.image; return !!im && (im instanceof ImageBitmap || im instanceof HTMLImageElement);
};

export function shareTextures(root, renderer) {
  let shared = 0, uploaded = 0;
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (!m || seen.has(m)) continue; seen.add(m);
      for (const k in m) {
        const t = m[k]; if (!shareable(t) || seen.has(t)) continue; seen.add(t);
        const key = keyOf(t); if (!key) continue;
        const src = canon.get(key);
        if (!src) canon.set(key, t.source);
        else if (src !== t.source) { t.dispose(); t.source = src; shared++; }
        try { renderer.initTexture(t); uploaded++; } catch { /* uploads on first use instead */ }
      }
    }
  });
  return { shared, uploaded };
}
