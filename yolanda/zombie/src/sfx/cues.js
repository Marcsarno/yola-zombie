// Combat cue sounds (2026-10-18): the threat warning, the dodge moment, slow motion in and out, a perfect dodge, a critical
// hit, the guard's shield lodged in the floor and wrenched free, the floor breaking under an emerging zombie. Synthesised
// with the audio engine's own tone / noise voices (src/audio.js), straight into its effects bus; the sound chat's recorded
// banks are untouched.
export function cue(audio, name, k = 1) {
  if (!audio?.ok) return;
  const t = audio.ctx.currentTime;
  audio.out = null;
  const T = (...a) => audio.tone(...a), N = (...a) => audio.noise(...a);
  switch (name) {
    case 'warn': // a low two-note horn: something big is coming
      T(t, 0.22, 196, { type: 'sawtooth', gain: 0.07 * k, f2: 185, attack: 0.02 }); T(t + 0.24, 0.3, 147, { type: 'sawtooth', gain: 0.08 * k, f2: 140, attack: 0.02 });
      break;
    case 'now': // the dodge moment: a sharp rising double ping
      T(t, 0.09, 880, { type: 'square', gain: 0.07 * k, f2: 1320 }); T(t + 0.1, 0.12, 1320, { type: 'square', gain: 0.07 * k, f2: 1760 });
      break;
    case 'slowIn': // time slows: a sub swell sliding down under a dark whoosh
      T(t, 0.7, 140, { type: 'sine', gain: 0.32 * k, f2: 45, attack: 0.05 }); N(t, 0.6, { type: 'bandpass', f: 1600, f2: 260, q: 0.9, gain: 0.16 * k, attack: 0.08 });
      break;
    case 'slowOut': // time snaps back
      N(t, 0.25, { type: 'bandpass', f: 300, f2: 2400, q: 1.2, gain: 0.12 * k, attack: 0.03 });
      break;
    case 'perfect': // a perfect dodge: a bright shimmer
      [1046, 1568, 2093].forEach((f, i) => T(t + i * 0.05, 0.5, f, { type: 'triangle', gain: 0.06 * k })); N(t, 0.4, { type: 'highpass', f: 5000, gain: 0.05 * k, attack: 0.02 });
      break;
    case 'crit': // the critical blow lands: a deep hit and a metallic ring
      T(t, 0.35, 70, { type: 'sine', gain: 0.6 * k, f2: 32, attack: 0.002 }); N(t, 0.2, { type: 'lowpass', f: 1400, f2: 200, gain: 0.5 * k });
      T(t + 0.01, 0.6, 1760, { type: 'triangle', gain: 0.05 * k }); T(t + 0.01, 0.5, 2637, { type: 'sine', gain: 0.035 * k });
      break;
    case 'lodge': // the shield driven into the floor: a splintering crack and the floor giving
      N(t, 0.05, { type: 'highpass', f: 2000, gain: 0.6 * k }); N(t + 0.02, 0.5, { type: 'bandpass', f: 900, f2: 300, q: 1.1, gain: 0.35 * k, attack: 0.01 });
      T(t, 0.4, 90, { type: 'triangle', gain: 0.5 * k, f2: 40 });
      break;
    case 'heave': // he wrenches at it: a grinding creak
      N(t, 0.32, { type: 'bandpass', f: 520, f2: 760, q: 6, gain: 0.16 * k, attack: 0.06 }); T(t, 0.3, 120, { type: 'sawtooth', gain: 0.04 * k, f2: 150, attack: 0.05 });
      break;
    case 'free': // torn out of the floor
      N(t, 0.18, { type: 'bandpass', f: 700, f2: 1800, q: 1.4, gain: 0.3 * k, attack: 0.01 }); [0.12, 0.22].forEach((d) => N(t + d, 0.08, { type: 'lowpass', f: 600, gain: 0.25 * k }));
      break;
    case 'rumble': // the floor about to break: a low rumble and grit
      T(t, 1.1, 42, { type: 'sawtooth', gain: 0.07 * k, f2: 55, attack: 0.3 }); N(t, 1.1, { type: 'lowpass', f: 260, gain: 0.22 * k, attack: 0.3 });
      N(t + 0.3, 0.8, { type: 'bandpass', f: 3200, q: 3, gain: 0.03 * k, attack: 0.2 });
      break;
    case 'breach': // tiles bursting up
      N(t, 0.06, { type: 'highpass', f: 1800, gain: 0.45 * k }); N(t + 0.02, 0.35, { type: 'lowpass', f: 900, f2: 200, gain: 0.45 * k });
      [0.18, 0.3, 0.41].forEach((d) => N(t + d, 0.05, { type: 'bandpass', f: 2600, q: 3, gain: 0.12 * k }));
      break;
  }
}
