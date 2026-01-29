// Musical "scores" used by audio music mode.
// Keep them simple: scale degrees + chord progression + per-weapon patterns.

export const MUSIC_SCORES = {
  a_minor_chill: {
    id: "a_minor_chill",
    name: "A Minor (Chill)",
    bpm: 96,
    // Natural minor: 1 2 b3 4 5 b6 b7
    scale: [0, 2, 3, 5, 7, 8, 10],
    rootMidi: 57, // A3
    // Degrees in the scale (0..6). Each entry is the chord root degree for 1 bar.
    // Use longer progressions to avoid feeling like a short 4-bar loop.
    chordProg: [0, 5, 3, 4, 0, 6, 5, 4], // Am, F, Dm, Em, Am, G, F, Em
    pad: { type: "triangle", detune: 10, attack: 0.10, filterBase: 850, filterVar: 520 },
    swing: 0.08,
    sectionBars: 8,
    drums: {
      kick: [0, 8],
      snare: [4, 12],
      hat: [2, 6, 10, 14],
      kickGain: 0.060,
      snareGain: 0.016,
      hatGain: 0.010,
    },
    bass: {
      // 16-step degrees relative to chord root (null = rest)
      pat: [0, null, 4, null, 0, null, 2, null, 0, null, 4, null, 0, null, 2, null],
      gain: 0.050,
    },
    fx: { leadDelayTime: 0.16, leadDelayFb: 0.22, leadDelayMix: 0.18 },
    patterns: {
      pistol: [0, 2, 4, 2, 5, 4, 2, 0],
      shotgun: [0, 0, 5, 0],
      lance: [4, 2, 6, 4],
      flame: [2, 2, 3, 2, 1, 0],
      // fallback for weapons that reuse "pistol"/"lance" sfx in code
      default: [0, 2, 4, 5, 4, 2],
    },
  },

  dorian_float: {
    id: "dorian_float",
    name: "Dorian (Float)",
    bpm: 108,
    // Dorian: 1 2 b3 4 5 6 b7
    scale: [0, 2, 3, 5, 7, 9, 10],
    rootMidi: 50, // D3
    chordProg: [0, 3, 4, 6, 0, 1, 3, 6], // longer, modal feel
    pad: { type: "sine", detune: 14, attack: 0.12, filterBase: 1050, filterVar: 720 },
    swing: 0.14,
    sectionBars: 8,
    drums: {
      kick: [0, 7, 8],
      snare: [4, 12],
      hat: [1, 3, 5, 7, 9, 11, 13, 15],
      kickGain: 0.052,
      snareGain: 0.014,
      hatGain: 0.008,
    },
    bass: {
      pat: [0, null, null, 2, 0, null, 4, null, 0, null, null, 2, 0, null, 4, null],
      gain: 0.045,
    },
    fx: { leadDelayTime: 0.22, leadDelayFb: 0.28, leadDelayMix: 0.22 },
    patterns: {
      pistol: [0, 2, 3, 5, 3, 2, 0, 6],
      shotgun: [0, 4, 0, 6],
      lance: [5, 3, 2, 0],
      flame: [2, 3, 4, 3, 2, 0],
      default: [0, 2, 3, 5, 4, 2],
    },
  },

  synthwave_minor: {
    id: "synthwave_minor",
    name: "Synthwave Minor",
    bpm: 120,
    scale: [0, 2, 3, 5, 7, 8, 10],
    rootMidi: 52, // E3
    chordProg: [0, 5, 6, 4, 0, 5, 3, 4], // 8 bars
    pad: { type: "sawtooth", detune: 6, attack: 0.06, filterBase: 650, filterVar: 900 },
    swing: 0.00,
    sectionBars: 8,
    drums: {
      // 4-on-the-floor kick
      kick: [0, 4, 8, 12],
      snare: [4, 12],
      hat: [2, 6, 10, 14],
      kickGain: 0.070,
      snareGain: 0.018,
      hatGain: 0.012,
    },
    bass: {
      pat: [0, 0, null, 2, 0, 4, null, 2, 0, 0, null, 2, 0, 4, null, 2],
      gain: 0.060,
    },
    fx: { leadDelayTime: 0.14, leadDelayFb: 0.32, leadDelayMix: 0.20 },
    patterns: {
      pistol: [0, 2, 4, 7, 4, 2, 0, 6],
      shotgun: [0, 0, 0, 5],
      lance: [7, 6, 4, 2],
      flame: [2, 4, 5, 4, 2, 0],
      default: [0, 2, 4, 5, 4, 2],
    },
  },

  pentatonic_dusk: {
    id: "pentatonic_dusk",
    name: "Pentatonic (Dusk)",
    bpm: 100,
    // Minor pentatonic: 1 b3 4 5 b7
    scale: [0, 3, 5, 7, 10],
    rootMidi: 45, // A2
    chordProg: [0, 3, 4, 0, 0, 4, 3, 0],
    pad: { type: "triangle", detune: 8, attack: 0.08, filterBase: 780, filterVar: 500 },
    swing: 0.10,
    sectionBars: 8,
    drums: {
      kick: [0, 8, 10],
      snare: [4, 12],
      hat: [2, 4, 6, 8, 10, 12, 14],
      kickGain: 0.056,
      snareGain: 0.015,
      hatGain: 0.009,
    },
    bass: {
      pat: [0, null, 2, null, 0, null, 4, null, 0, null, 2, null, 0, null, 4, null],
      gain: 0.048,
    },
    fx: { leadDelayTime: 0.18, leadDelayFb: 0.18, leadDelayMix: 0.14 },
    patterns: {
      pistol: [0, 1, 2, 3, 2, 1, 4, 2],
      shotgun: [0, 0, 3, 0],
      lance: [3, 2, 1, 0],
      flame: [1, 2, 3, 2, 1, 0],
      default: [0, 1, 2, 3, 2, 1],
    },
  },

  harmonic_minor_arcade: {
    id: "harmonic_minor_arcade",
    name: "Harmonic Minor (Arcade)",
    bpm: 112,
    // Harmonic minor: 1 2 b3 4 5 b6 7
    scale: [0, 2, 3, 5, 7, 8, 11],
    rootMidi: 55, // G3
    chordProg: [0, 5, 3, 4, 0, 6, 5, 4],
    pad: { type: "sawtooth", detune: 4, attack: 0.05, filterBase: 720, filterVar: 980 },
    swing: 0.06,
    sectionBars: 8,
    drums: {
      kick: [0, 6, 8, 14],
      snare: [4, 12],
      hat: [2, 6, 10, 14],
      kickGain: 0.062,
      snareGain: 0.017,
      hatGain: 0.011,
    },
    bass: {
      pat: [0, null, 4, null, 0, null, 6, null, 0, null, 4, null, 0, null, 6, null],
      gain: 0.055,
    },
    fx: { leadDelayTime: 0.12, leadDelayFb: 0.26, leadDelayMix: 0.18 },
    patterns: {
      pistol: [0, 2, 4, 2, 6, 4, 2, 0],
      shotgun: [0, 6, 0, 4],
      lance: [6, 4, 2, 0],
      flame: [2, 3, 4, 3, 2, 0],
      default: [0, 2, 4, 6, 4, 2],
    },
  },
};

export const MUSIC_SCORE_IDS = Object.keys(MUSIC_SCORES);

