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
    case 'perfect': // a perfect dodge: a bright shimmer over a bass drop (Witch Time)
      [1046, 1568, 2093].forEach((f, i) => T(t + i * 0.05, 0.5, f, { type: 'triangle', gain: 0.06 * k })); N(t, 0.4, { type: 'highpass', f: 5000, gain: 0.05 * k, attack: 0.02 });
      T(t, 0.9, 92, { type: 'sine', gain: 0.45 * k, f2: 34, attack: 0.004 });
      break;
    case 'mark': // an enemy open to a finisher: a low gong and a bright chime
      T(t, 0.9, 110, { type: 'sine', gain: 0.22 * k, f2: 104, attack: 0.005 }); T(t, 0.7, 1760, { type: 'triangle', gain: 0.05 * k }); T(t + 0.06, 0.6, 2637, { type: 'sine', gain: 0.035 * k });
      break;
    case 'hiss': // a cylinder punctured: gas screaming out
      N(t, 0.5 * k, { type: 'highpass', f: 3500, f2: 5200, gain: 0.22, attack: 0.01 });
      break;
    case 'boom': // an oxygen cylinder bursting: a crack, a deep thump and a roll of debris
      N(t, 0.05, { type: 'highpass', f: 1500, gain: 0.7 * k }); T(t, 0.7, 64, { type: 'sine', gain: 0.8 * k, f2: 26, attack: 0.002 });
      N(t + 0.01, 0.9, { type: 'lowpass', f: 1200, f2: 120, gain: 0.55 * k, attack: 0.005 }); [0.25, 0.4, 0.58].forEach((d) => N(t + d, 0.07, { type: 'bandpass', f: 2200, q: 2, gain: 0.1 * k }));
      break;
    case 'zap': // the flooded floor live: a buzzing crackle
      T(t, 0.6, 60, { type: 'sawtooth', gain: 0.18 * k, f2: 62 }); T(t, 0.6, 120, { type: 'square', gain: 0.06 * k, f2: 118 });
      for (let i = 0; i < 7; i++) N(t + i * 0.08 + Math.random() * 0.04, 0.04, { type: 'highpass', f: 2500, gain: 0.3 * k });
      break;
    case 'hum': // the MRI magnet waking: a deep rising hum and a whine
      T(t, 1.6, 48, { type: 'sawtooth', gain: 0.1 * k, f2: 60, attack: 0.4 }); T(t, 1.6, 900, { type: 'sine', gain: 0.025 * k, f2: 1900, attack: 0.6 });
      break;
    case 'quench': // the magnet's emergency shutdown: helium blasting out of the vent
      N(t, 2.4, { type: 'lowpass', f: 2600, f2: 500, gain: 0.5 * k, attack: 0.03 }); N(t, 1.8, { type: 'highpass', f: 4000, f2: 2000, gain: 0.12 * k, attack: 0.05 });
      T(t, 1.2, 120, { type: 'sine', gain: 0.2 * k, f2: 30 });
      break;
    case 'crumble': // a cracked wall giving way
      N(t, 0.06, { type: 'highpass', f: 1200, gain: 0.6 * k }); N(t + 0.02, 0.8, { type: 'lowpass', f: 700, f2: 150, gain: 0.55 * k, attack: 0.01 });
      T(t, 0.5, 70, { type: 'sine', gain: 0.5 * k, f2: 35 }); [0.15, 0.3, 0.45, 0.62].forEach((d) => N(t + d, 0.06, { type: 'bandpass', f: 1500 + Math.random() * 1500, q: 2, gain: 0.15 * k }));
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
