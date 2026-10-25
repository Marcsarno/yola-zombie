// Per-hero move speed at full stick (m/s). A hero not listed moves at the tuning panel's moveSpeed (3.3).
// The game never slides feet (render/clipchars.js: the gait phase follows distance / the clip's stride on that body), so
// a short-legged hero at the shared speed only steps faster. Measured 2026-10-20 in the Rig Lab on the game's run
// (p_run_plain): natural speed Yola 2 3.72 m/s, Arianna 2.55, Lilah 1.45 (her hips sit at 0.41 of her 1.05 m).
// At 3.3 m/s that is 2.5 / 3.7 / 6.5 steps a second. The user (2026-10-20): Lilah gets her own slower speed, about
// 4 steps a second; Arianna keeps 3.3.
// Read by the Rig Lab's "game pace" playback now; the game reads it once these heroes are playable (main.js loads only
// Yola today).
export const HERO_MOVE_SPEED = {
  lilah: 2.05, // 2.05 / 1.45 = 1.41x her run clip: 4.0 steps a second
};
export const heroMoveSpeed = (key, base = 3.3) => HERO_MOVE_SPEED[key] ?? base;
