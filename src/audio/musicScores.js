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

