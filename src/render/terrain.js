import { hash2i } from "../core/math.js";

export function pickTerrainGlyph(cx, cy) {
  const h = hash2i(cx, cy);
  const r = h % 1000;
  // less "stars", more "ground": denser, softer punctuation
  if (r < 620) return " ";
  if (r < 820) return ".";
  if (r < 940) return ",";
  if (r < 985) return ":";
  return "·";
}

