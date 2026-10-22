// Chapter 2's texture budget (2026-10-22: the neighbourhood reloaded itself on Marc's iPhone, about 1.1 GB of textures
// against the hospital's 0.17 GB; Safari drops a page that big). A texture bigger than its cap is drawn down onto a canvas of
// that size before the GPU gets it: the map's at 512 px (from the fixed camera a car or a house front is a few hundred
// pixels on a phone), the people's and weapons' at 1024, their surface detail (normal, roughness, metal and occlusion maps,
// hardly seen from that far) at half that. Cut-outs (alpha-tested or see-through materials) keep theirs: drawn through a
// canvas their clear edges darken. Each texture is done once; the pass runs after loading and again every few seconds for
// whatever the game adds later (zombies are clones and share their templates' textures). 1103 -> 492 MB on the map.
const done = new WeakSet();
const drawable = (im) => im && ((typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) || (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement) || (typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement));

function fit(t, cap) {
  if (done.has(t) || t.isDataTexture || t.isCompressedTexture || t.isVideoTexture || t.isRenderTargetTexture) return 0;
  const im = t.image; if (!drawable(im)) return 0;
  const w = im.width, h = im.height; if (!w || !h) return 0;   // (not loaded yet: the next pass)
  done.add(t);
  if (Math.max(w, h) <= cap) return 0;
  const s = cap / Math.max(w, h), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
  if (im.close) im.close();
  t.image = c; t.needsUpdate = true;
  return (w * h - c.width * c.height) * 4 * 1.33;
}

const COLOUR = new Set(['map', 'emissiveMap']);
// every texture on the materials under root, colour at cap px and the rest at half; returns the GPU bytes saved
export function fitTextures(root, cap) {
  let saved = 0;
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (!m || m.alphaTest > 0 || m.transparent) continue;
      for (const [k, v] of Object.entries(m)) if (v && v.isTexture) saved += fit(v, COLOUR.has(k) ? cap : cap / 2);
    }
  });
  return saved;
}
