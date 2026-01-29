export const MAPS = [
  {
    id: "classic",
    name: "Classic (Noir & Blanc)",
    theme: {
      bg: "#000000",
      fg: "#f2f2f2",
      dim: "rgba(242,242,242,0.55)",
      grain: 0.2,
      vignette: 0.55,
    },
    // very few walls, mostly open
    tiles: { wall: 0.012, ice: 0.035 },
  },
  {
    id: "plains",
    name: "Plaine (Vert)",
    theme: {
      // visible green background
      bg: "#0b1a0b",
      fg: "#eaffea",
      dim: "rgba(234,255,234,0.55)",
      grain: 0.14,
      vignette: 0.42,
    },
    // no walls in plains
    tiles: { wall: 0.0, ice: 0.015 },
  },
  {
    id: "winter",
    name: "Hiver (Verglas)",
    theme: {
      // visible cold blue background
      bg: "#071420",
      fg: "#eef6ff",
      dim: "rgba(238,246,255,0.55)",
      grain: 0.12,
      vignette: 0.58,
    },
    // very slippery: lots of ice
    tiles: { wall: 0.02, ice: 0.19 },
  },
  {
    id: "hell",
    name: "Enfer (Rouge)",
    theme: {
      // visible red background
      bg: "#1a0505",
      fg: "#ffecec",
      dim: "rgba(255,236,236,0.55)",
      grain: 0.14,
      vignette: 0.66,
    },
    // some walls, but not overwhelming
    tiles: { wall: 0.045, ice: 0.09 },
  },
];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

