// External music playlist used by music mode.
// Place the actual audio files under src/audio/tracks/ (see CREDITS.md).

export const MUSIC_SCORES = {
  ascii_combat_synth: {
    id: "ascii_combat_synth",
    name: "ASCII Combat Synth",
    // Built-in fallback that never requires external assets.
    bpm: 108,
    rootMidi: 57,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chordProg: [0, 5, 3, 4],
    introBars: 2,
    sectionBars: 8,
    swing: 0.04,
    drums: {
      kick: [0, 8, 10],
      snare: [4, 12],
      hat: [2, 6, 10, 14],
      kickGain: 0.06,
      snareGain: 0.014,
      hatGain: 0.009,
    },
    bass: {
      pat: [0, null, 0, null, 3, null, 4, null, 0, null, 0, null, 5, null, 4, null],
      gain: 0.05,
    },
    patterns: {
      default: [0, 2, 4, 5, 4, 2],
      pistol: [0, 2, 4, 7, 5, 4],
      lance: [4, 5, 7, 9, 7, 5],
      shotgun: [0, 0, 3, 3, 4, 4],
      flame: [7, 5, 4, 2, 3, 2],
    },
  },
  oga_space_station: {
    id: "oga_space_station",
    name: "Space Station (OpenGameArt)",
    file: "./audio/tracks/space-station.mp3",
    rotate: true,
    license: "CC-BY 3.0",
    sourceUrl: "https://opengameart.org/content/space-station-1",
  },
  oga_nebulous: {
    id: "oga_nebulous",
    name: "Nebulous (OpenGameArt)",
    file: "./audio/tracks/nebulous.mp3",
    rotate: true,
    license: "CC-BY 3.0",
    sourceUrl: "https://opengameart.org/content/nebulous",
  },
  oga_space_scifi_ambient: {
    id: "oga_space_scifi_ambient",
    name: "Space / Scifi Ambient (OpenGameArt)",
    file: "./audio/tracks/space-scifi-ambient.mp3",
    rotate: true,
    license: "CC-BY 3.0",
    sourceUrl: "https://opengameart.org/content/space-scifi-ambient",
  },
  fma_space_sleep_meditation: {
    id: "fma_space_sleep_meditation",
    name: "Space Sleep Meditation (FMA)",
    file: "./audio/tracks/space-sleep-meditation.mp3",
    rotate: true,
    license: "CC0",
    sourceUrl: "https://freemusicarchive.org/music/holiznacc0/space-sleep-meditation",
  },
  pixabay_space_ambient_cinematic: {
    id: "pixabay_space_ambient_cinematic",
    name: "Space Ambient Cinematic (Pixabay)",
    // Pixabay CDN blocked from CLI (403 challenge): keep as synth placeholder for now.
    file: "",
    rotate: false,
    license: "Pixabay License",
    sourceUrl: "https://pixabay.com/music/ambient-space-ambient-cinematic-music-338203/",
  },
};

export const MUSIC_SCORE_IDS = Object.keys(MUSIC_SCORES);
