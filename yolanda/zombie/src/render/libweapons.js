// The library weapons in the story game (2026-10-18, the user's part 3: "place every available usable weapon ... reuse the
// existing weapon assets and working setups"): the sledgehammer, the crowbar and the knife, built exactly as the weapon
// test arena builds them (src/arena/testarena.js): the weapon's own model and data sheet (assets/arena/weapons.json), the
// user's Rig Lab fit and holding hand (assets/hold/weapon_fit.json), the attack the user picked for it in the Move Library
// (assets/arena/selection.json: its speed, hand, roll), posed frame by frame in her hand (render/libattack.js), split into
// its strikes. Each weapon's attacks go into core/weapons.js LIB_ATTACKS and its hold into the view (YolaView.libHolds),
// which shows it through the arena's test-weapon path while it is in her hand. The chainsaw is left out (not ready).
import * as THREE from 'three';
import { LIB_ATTACKS } from '../core/weapons.js';
import { buildLibraryAttack } from './libattack.js';
import { makeKnife } from './weaponModels.js';
import { CARRY } from './holdfit.js';
import { PROFILE } from '../arena/testarena.js';

// which of the user's picks each weapon swings in the story (all "good" in assets/arena/selection.json, all in the game's
// own clip files): the sledgehammer the heavy combo, the crowbar and the knife the regular combo
export const LIB_PICKS = { sledgehammer: 'ual_Sword_Heavy_Combo', crowbar: 'ual_Sword_Regular_Combo', knife: 'ual_Sword_Regular_Combo' };
export const LIB_LABEL = { sledgehammer: 'Sledgehammer', crowbar: 'Crowbar', knife: 'Knife' };

async function json(url) { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } }

export async function setupLibWeapons({ yola, loader, scene, clips, who }) {
  const [wj, catalog, sel, fitsJ] = await Promise.all([json('assets/arena/weapons.json'), json('assets/arena/catalog.json'), json('assets/arena/selection.json'), json('assets/hold/weapon_fit.json')]);
  const WDEF = wj?.weapons || {}, meta = Object.fromEntries((catalog?.clips || []).map((c) => [c.clip, c]));
  const byName = Object.fromEntries(clips.map((c) => [c.name, c]));
  const fits = {}; for (const [k, v] of Object.entries(fitsJ || {})) if (v && typeof v === 'object' && v[who]) fits[k] = v[who];
  const holds = {};
  for (const [w, clip] of Object.entries(LIB_PICKS)) {
    const def = WDEF[w], c = byName[clip], P = PROFILE[w];
    if (!def || !c || !P) continue;
    let o = null;
    try { o = def.builder === 'knife' ? makeKnife() : def.file ? (await loader.loadAsync(def.file)).scene : null; } catch (e) { console.warn('lib weapon', w, e); }
    if (!o) continue;
    o.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
    const obj = new THREE.Group(); obj.add(o); obj.visible = false; scene.add(obj);
    const use = (sel?.moves?.[clip]?.uses || []).find((u) => u.weapon === w) || {};
    const fit = fits[w + '@' + clip] || fits[w] || null;
    const hold = { key: w, obj, w: def, hand: fit?.hand || use.hand || 'Right', roll: +use.roll || 0, slide: +use.slide || 0, flip: !!use.flip, two: def.hands === 'two', fingers: null, carry: CARRY[w] ? w : null, pack: false, fit };
    yola.setTestWeapon(hold);
    const As = buildLibraryAttack(yola, { clip: c, frames: meta[clip]?.frames, hold, P, speed: +use.speed || 1, name: LIB_LABEL[w], sound: w });
    if (!As?.length) continue;
    LIB_ATTACKS[w] = As; holds[w] = hold;
  }
  yola.setTestWeapon(null);
  yola.libHolds = holds;
  return Object.keys(holds);
}
