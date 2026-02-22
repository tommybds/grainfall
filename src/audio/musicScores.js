// External music playlist used by music mode.
// Place the actual audio files under src/audio/tracks/ (see CREDITS.md).

export const MUSIC_SCORES = {
  oga_space_station: {
    id: "oga_space_station",
    name: "Space Station (OpenGameArt)",
    file: "./audio/tracks/space-station.mp3",
    license: "CC-BY 3.0",
    sourceUrl: "https://opengameart.org/content/space-station-1",
  },
  oga_nebulous: {
    id: "oga_nebulous",
    name: "Nebulous (OpenGameArt)",
    file: "./audio/tracks/nebulous.mp3",
    license: "CC-BY 3.0",
    sourceUrl: "https://opengameart.org/content/nebulous",
  },
  oga_space_scifi_ambient: {
    id: "oga_space_scifi_ambient",
    name: "Space / Scifi Ambient (OpenGameArt)",
    file: "./audio/tracks/space-scifi-ambient.mp3",
    license: "CC-BY 3.0",
    sourceUrl: "https://opengameart.org/content/space-scifi-ambient",
  },
  fma_space_sleep_meditation: {
    id: "fma_space_sleep_meditation",
    name: "Space Sleep Meditation (FMA)",
    file: "./audio/tracks/space-sleep-meditation.mp3",
    license: "CC0",
    sourceUrl: "https://freemusicarchive.org/music/holiznacc0/space-sleep-meditation",
  },
  pixabay_space_ambient_cinematic: {
    id: "pixabay_space_ambient_cinematic",
    name: "Space Ambient Cinematic (Pixabay)",
    file: "./audio/tracks/space-ambient-cinematic.mp3",
    license: "Pixabay License",
    sourceUrl: "https://pixabay.com/music/ambient-space-ambient-cinematic-music-338203/",
  },
};

export const MUSIC_SCORE_IDS = Object.keys(MUSIC_SCORES);
