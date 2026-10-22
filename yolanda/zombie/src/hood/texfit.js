// Chapter 2's texture budget (2026-10-22: the neighbourhood reloaded itself on Marc's iPhone, about 1.1 GB of textures
// against the hospital's 0.17 GB; Safari drops a page that big). A texture bigger than its cap is drawn down onto a canvas of
// that size before the GPU gets it: the map's at 512 px (from the fixed camera a car or a house front is a few hundred
// pixels on a phone), the people's and weapons' at 1024, their surface detail (normal, roughness, metal and occlusion maps,
// hardly seen from that far) at half that. Cut-outs (alpha-tested or see-through materials) keep their size: drawn through a
// canvas their clear edges darken. ?tex=256 (or any size) sets the map's cap, the people's at twice it.
// Each texture is done once. With a renderer (useRenderer) it goes to the GPU there and then, and with release its decoded
// copy in memory is let go once it is up there (Safari 17+ keeps every one as an ImageBitmap): model by model as they load,
// so the copies never pile up. Released textures cannot be uploaded again: hood.js reloads the page if the phone drops the
// 3D view. Not released: what the hospital's own code may read back (its zombies' scrubs are recoloured from their maps).
const done = new WeakSet(), mine = new WeakSet();   // (done: the images (Sources) seen; mine: the canvases made here)
let gl = null;
export function useRenderer(r) { gl = r; }
export const texStats = { images: 0, mb: 0, by: {} };   // (what the budget has sized: images and their GPU megabytes, mipmaps in)
export const TEX_CAP = Math.max(64, +new URLSearchParams(location.search).get('tex') || 512);
const drawable = (im) => im && ((typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) || (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement) || (typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement));

// one image (a three.js Source) can sit under several textures: drawn down once, every texture on it sent up, then let go
function fitSource(ts, cap, release, tag) {
  const t0 = ts[0], im = t0.image; if (!drawable(im)) return 0;
  const w = im.width, h = im.height; if (!w || !h) return 0;   // (not loaded yet: the next pass)
  done.add(t0.source);
  let saved = 0;
  if (Math.max(w, h) > cap) {
    const s = cap / Math.max(w, h), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
    if (im.close) im.close();
    mine.add(c); t0.source.data = c; for (const t of ts) t.needsUpdate = true;
    saved = (w * h - c.width * c.height) * 4 * 1.33;
  }
  const d = t0.source.data;
  const mb = d.width * d.height * 4 * 1.33 / 1048576; texStats.images++; texStats.mb += mb; texStats.by[tag] = (texStats.by[tag] || 0) + mb;
  if (release && gl && (d.close || mine.has(d))) {
    for (const t of ts) gl.initTexture(t);   // (up now, so its copy goes now)
    if (d.close) d.close(); else d.width = d.height = 1;
  }
  return saved;
}

const COLOUR = new Set(['map', 'emissiveMap']);
const skip = (t) => t.isDataTexture || t.isCompressedTexture || t.isVideoTexture || t.isRenderTargetTexture || t.isCanvasTexture || !t.source;
// every texture on the materials under root, colour at cap px and the rest at half (cut-outs as they are); release: their
// memory copies let go once they are on the GPU; returns the GPU bytes saved
export function fitTextures(root, cap, release = false, tag = 'other') {
  const by = new Map();
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (!m) continue;
      const cut = m.alphaTest > 0 || m.transparent;
      for (const [k, v] of Object.entries(m)) {
        if (!v || !v.isTexture || skip(v) || done.has(v.source)) continue;
        const e = by.get(v.source) || { ts: new Set(), cap: Infinity }; by.set(v.source, e);
        e.ts.add(v); e.cap = Math.min(e.cap, cut ? Infinity : COLOUR.has(k) ? cap : cap / 2);
      }
    }
  });
  let saved = 0;
  for (const e of by.values()) saved += fitSource([...e.ts], e.cap, release, tag);
  return saved;
}
