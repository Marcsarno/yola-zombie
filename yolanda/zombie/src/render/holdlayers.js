// The hold layers (2026-10-17, the user: "turn off the extra layers ... save the toggle for me to be able to jump back and
// forth ... if it's a great fix, I can just click the toggle, have it done, move on"): each correction laid on top of the
// clips can be switched off, in the game and the Rig Lab alike, to see what it does to a hold.
// Defaults: assets/hold/hold_layers.json. A change made in the Rig Lab is kept in this browser (localStorage, which the game
// shares on the same address), so the game test shows it at once; the Rig Lab's "save layers" writes shots/hold_layers.json
// (copied to assets/hold/hold_layers.json when the user says so: that file is what ships).
export const LAYERS = [
  ['posture', 'posture fix', "her head, neck, chest and pelvis turned onto the source rig's own lines (render/posture.js)"],
  ['handPoses', 'hand curls', 'the saved R / L hand curl per clip (assets/hold/hand_poses.json, the Rig Lab Hands controls)'],
  ['secondHand', 'second hand on handle', "the other hand pulled onto a two-handed weapon's second grip, and the axe's free fist kept on its handle (render/holdfit.js handOnto)"],
  ['carry', 'carry idles', 'the sledgehammer and chainsaw carried in front of her at rest (render/holdfit.js CARRY)'],
  ['armPose', 'arm adjustments', 'the per-clip arm, wrist and shoulder adjustments set in the Rig Lab sidebar (render/armpose.js, assets/hold/arm_pose.json)'],
];
export const HOLD_LAYERS = Object.fromEntries(LAYERS.map(([k]) => [k, true]));
const local = () => { try { return JSON.parse(globalThis.localStorage?.getItem('holdLayers') || '{}'); } catch { return {}; } };
Object.assign(HOLD_LAYERS, local());
// the shipped defaults, then this browser's own choice on top
export async function loadHoldLayers() {
  try { const j = await (await fetch('assets/hold/hold_layers.json', { cache: 'reload' })).json(); for (const [k] of LAYERS) if (typeof j[k] === 'boolean') HOLD_LAYERS[k] = j[k]; } catch { /* none yet: all on */ }
  Object.assign(HOLD_LAYERS, local());
  return HOLD_LAYERS;
}
export function keepHoldLayers() { try { globalThis.localStorage?.setItem('holdLayers', JSON.stringify(HOLD_LAYERS)); } catch { /* private window */ } }
