import { hash2i } from "../core/math.js";
import { CFG } from "./config.js";
import { mapById } from "./maps.js";

export function worldToCell(x, y) {
  return { cx: Math.floor(x / CFG.cellPx), cy: Math.floor(y / CFG.cellPx) };
}

export function cellToWorldCenter(cx, cy) {
  return { x: (cx + 0.5) * CFG.cellPx, y: (cy + 0.5) * CFG.cellPx };
}

function hash01(cx, cy, salt = 0) {
  const h = hash2i(cx + salt * 1013, cy - salt * 3251);
  return (h % 100000) / 100000;
}

export function sampleTile(mapId, cx, cy) {
  const map = mapById(mapId);
  const t = map.tiles || { wall: 0.06, ice: 0.04, mud: 0.05 };

  const rWall = hash01(cx, cy, 1);
  const rBiome = hash01(cx, cy, 2);
  const rDetail = hash01(cx, cy, 3);

  // keep a safe area near origin (spawn)
  if (Math.abs(cx) <= 2 && Math.abs(cy) <= 2) {
    return { wall: false, biome: "normal", glyph: " " };
  }

  const wall = rWall < t.wall;
  if (wall) {
    // keep wall glyph "thin" to avoid overwhelming the scene
    const g = rDetail < 0.7 ? "#" : "+";
    return { wall: true, biome: "normal", glyph: g };
  }

  // biomes: ice or mud (mutually exclusive)
  let biome = "normal";
  if (rBiome < t.ice) biome = "ice";
  else if (rBiome < t.ice + t.mud) biome = "mud";

  // subtle biome hint glyphs (sparse)
  let glyph = " ";
  if (biome === "ice" && rDetail < 0.25) glyph = "~";
  if (biome === "mud" && rDetail < 0.25) glyph = "_";

  return { wall: false, biome, glyph };
}

export function resolveCircleVsWalls({ mapId, x, y, r }) {
  // iterative push-out against neighboring wall cells
  let px = x;
  let py = y;
  const { cx, cy } = worldToCell(px, py);
  for (let it = 0; it < 2; it++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const tx = cx + ox;
        const ty = cy + oy;
        const tile = sampleTile(mapId, tx, ty);
        if (!tile.wall) continue;

        // AABB of the tile in world
        const minX = tx * CFG.cellPx;
        const minY = ty * CFG.cellPx;
        const maxX = minX + CFG.cellPx;
        const maxY = minY + CFG.cellPx;

        // closest point on AABB to circle center
        const qx = Math.max(minX, Math.min(maxX, px));
        const qy = Math.max(minY, Math.min(maxY, py));
        const dx = px - qx;
        const dy = py - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r * r && d2 > 0.000001) {
          const d = Math.sqrt(d2);
          const push = (r - d) + 0.25;
          px += (dx / d) * push;
          py += (dy / d) * push;
        } else if (d2 <= 0.000001) {
          // inside corner case: push out arbitrarily
          px += 0.5;
          py += 0.5;
        }
      }
    }
  }
  return { x: px, y: py };
}

