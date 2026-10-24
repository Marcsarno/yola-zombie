// Chapter 2's KTX2 pictures (2026-10-24): tools/hood/ktx2.mjs writes the models again with their pictures as KTX2 to
// assets/neighborhood/opt/ktx/ (the map, the survivors, the street zombies) and lists them in manifest.json. A KTX2
// picture stays packed on the GPU (ASTC on an iPhone, about a quarter of an unpacked WebP's memory); the transcoder
// (three's Basis one, libs/basis/) unpacks the file into whichever packed format this device has. ?ktx=0: the old files.
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const OFF = new URLSearchParams(location.search).get('ktx') === '0';
export const KTX_ROOT = 'assets/neighborhood/opt/ktx/';
let ktx2 = null, have = new Set(), listP = null;
// the one KTX2 loader every GLTFLoader shares (its transcoder workers too); the renderer is needed once, to learn the formats
export function ktxLoader(renderer) {
  if (!ktx2 && renderer) ktx2 = new KTX2Loader().setTranscoderPath('libs/basis/').detectSupport(renderer);
  return ktx2;
}
// (fetched once, however many loaders ask)
export function loadKtxList() {
  if (OFF) return Promise.resolve();
  return (listP ??= fetch(KTX_ROOT + 'manifest.json').then((r) => (r.ok ? r.json() : [])).then((l) => { have = new Set(l); }).catch(() => { /* none: the old files */ }));
}
// a model's path under opt/ktx/ (as the manifest lists it) -> the URL of its KTX2 copy, or null
export const ktxPath = (rel) => (have.has(rel) ? KTX_ROOT + rel : null);
