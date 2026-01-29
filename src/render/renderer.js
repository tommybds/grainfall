import { clamp } from "../core/math.js";
import { CFG } from "../game/config.js";
import { pickTerrainGlyph } from "./terrain.js";
import { sampleTile } from "../game/world.js";
import { ACHIEVEMENT_DEFS, formatTimeMMSS } from "../game/stats.js";
import { weaponName, WEAPON_MAX_LEVEL } from "../game/weapons.js";

function readRgbVars(state) {
  const key = state.colorblind ? "cb1" : "cb0";
  if (state._rgbKey === key && state._rgbVars) return state._rgbVars;
  const cs = getComputedStyle(document.body);
  const get = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
  const vars = {
    heal: get("--rgb-heal", "60, 255, 160"),
    xp: get("--rgb-xp", "90, 210, 255"),
    chest: get("--rgb-chest", "255, 210, 90"),
    buff: get("--rgb-buff", "210, 120, 255"),
    hpHeal: get("--rgb-hp-heal", "60, 255, 160"),
    hpDmg: get("--rgb-hp-dmg", "255, 90, 90"),
  };
  state._rgbKey = key;
  state._rgbVars = vars;
  return vars;
}

function rgba(hex, a) {
  // hex like #rrggbb
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function setTextStyle(ctx) {
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = `${CFG.fontSize}px ${CFG.fontFamily}`;
  ctx.fillStyle = CFG.fg;
  ctx.shadowColor = "rgba(242,242,242,0.18)";
  ctx.shadowBlur = 6;
}

function drawSoftDisc(ctx, sx, sy, r, alpha) {
  ctx.save();
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, `rgba(242,242,242,${alpha})`);
  g.addColorStop(1, "rgba(242,242,242,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEntityChar(ctx, sx, sy, ch, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 3;
  ctx.strokeText(ch, sx, sy);
  ctx.fillText(ch, sx, sy);
  ctx.globalAlpha = 1;
}

function drawRotatedChar(ctx, x, y, ch, angleRad, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  drawEntityChar(ctx, 0, 0, ch, alpha);
  ctx.restore();
}

export function renderFrame(game) {
  const { ctx, viewport, camera, player, enemies, bullets, enemyBullets, pickups, floats, hudEl, overlayEl, state } =
    game;

  const theme = game.theme || {
    bg: "#000000",
    fg: "#f2f2f2",
    dim: "rgba(242,242,242,0.55)",
    grain: 0.2,
    vignette: 0.55,
  };
  const fgDim = theme.dim || rgba(theme.fg || "#f2f2f2", 0.55);

  // background
  ctx.fillStyle = theme.bg || CFG.bg;
  ctx.fillRect(0, 0, viewport.w, viewport.h);

  // terrain grain (fixed to world: account for camera fractional offset)
  const cols = Math.ceil(viewport.w / CFG.cellPx) + 2;
  const rows = Math.ceil(viewport.h / CFG.cellPx) + 2;
  const startCx = Math.floor(camera.x / CFG.cellPx);
  const startCy = Math.floor(camera.y / CFG.cellPx);
  const offX = -(camera.x - startCx * CFG.cellPx);
  const offY = -(camera.y - startCy * CFG.cellPx);

  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(theme.fg || CFG.fg, theme.grain ?? 0.2);
  ctx.font = `${CFG.fontSize}px ${CFG.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Keep sampling parity stable in world coords to avoid "sparkle"/popping when moving.
  const step = 2;
  const x0 = ((startCx % step) + step) % step;
  const y0 = ((startCy % step) + step) % step;
  for (let y = y0; y < rows; y += step) {
    for (let x = x0; x < cols; x += step) {
      const cx = startCx + x;
      const cy = startCy + y;
      const g = pickTerrainGlyph(cx, cy);
      if (g === " ") continue;
      const sx = offX + x * CFG.cellPx + CFG.cellPx * 0.5;
      const sy = offY + y * CFG.cellPx + CFG.cellPx * 0.5;
      ctx.fillText(g, sx, sy);
    }
  }

  // walls + biome hints
  ctx.save();
  ctx.shadowBlur = 0;
  // walls should be readable but not dominant
  const drawWalls = game.selectedMapId !== "plains";
  ctx.fillStyle = theme.fg || CFG.fg;
  ctx.font = `${CFG.fontSize}px ${CFG.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = startCx + x;
      const cy = startCy + y;
      const t = sampleTile(game.selectedMapId, cx, cy);
      if (!t.wall && t.glyph === " ") continue;
      const sx = offX + x * CFG.cellPx + CFG.cellPx * 0.5;
      const sy = offY + y * CFG.cellPx + CFG.cellPx * 0.5;
      if (t.wall) {
        if (drawWalls) {
          // Blocking objects should be solid/opaque
          ctx.fillStyle = theme.fg || CFG.fg;
          ctx.fillText(t.glyph, sx, sy);
        }
      } else {
        // biome hint (subtle)
        ctx.fillStyle = rgba(theme.fg || CFG.fg, 0.18);
        ctx.fillText(t.glyph, sx, sy);
      }
    }
  }
  ctx.restore();

  // frame + vignette
  ctx.strokeStyle = "rgba(242,242,242,0.10)";
  ctx.strokeRect(8, 8, viewport.w - 16, viewport.h - 16);

  const v = ctx.createRadialGradient(
    viewport.w * 0.5,
    viewport.h * 0.5,
    Math.min(viewport.w, viewport.h) * 0.15,
    viewport.w * 0.5,
    viewport.h * 0.5,
    Math.max(viewport.w, viewport.h) * 0.62,
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, `rgba(0,0,0,${theme.vignette ?? 0.55})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, viewport.w, viewport.h);

  // entities
  setTextStyle(ctx);
  ctx.fillStyle = theme.fg || CFG.fg;

  // pickups
  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(theme.fg || CFG.fg, 0.92);
  const rgb = readRgbVars(state);
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i];
    const sx = p.x - camera.x;
    const sy = p.y - camera.y;
    if (sx < -40 || sy < -40 || sx > viewport.w + 40 || sy > viewport.h + 40) continue;
    const ch = p.kind === "heal" ? "+" : p.kind === "xp" ? "*" : p.kind === "chest" ? "¤" : "!";

    // draw pickup bigger + optional label for first-time discovery
    ctx.save();
    const t = state.t || 0;
    const pulse = 0.82 + 0.18 * Math.sin(t * 6 + i * 0.9);
    const a = 0.65 + 0.35 * pulse;

    // Inject a bit of color only for pickups (readability), keep world monochrome.
    // Palette is read from CSS vars (overridden by styles-colorblind.css when enabled).
    const col =
      p.kind === "heal"
        ? `rgba(${rgb.heal}, ${a})`
        : p.kind === "xp"
          ? `rgba(${rgb.xp}, ${a})`
          : p.kind === "chest"
            ? `rgba(${rgb.chest}, ${a})`
            : `rgba(${rgb.buff}, ${a})`; // buff

    // Halo + glyph
    drawSoftDisc(ctx, sx, sy, 14 + pulse * 10, 0.16 * pulse);
    ctx.fillStyle = col;
    ctx.font = `${CFG.fontSize + 10 + pulse * 3}px ${CFG.fontFamily}`;
    drawEntityChar(ctx, sx, sy, ch, 1);
    ctx.restore();

    if (game.discoveredPickups && !game.discoveredPickups[p.kind]) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(theme.fg || CFG.fg, 0.85);
      ctx.font = `12px ${CFG.fontFamily}`;
      const label =
        p.kind === "heal" ? "HEAL" : p.kind === "xp" ? "XP" : p.kind === "chest" ? "CHEST" : "BUFF";
      ctx.fillText(label, sx, sy - 18);
      ctx.restore();
    }
  }

  // bullets
  ctx.shadowBlur = 0;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    const sx = b.x - camera.x;
    const sy = b.y - camera.y;
    const kind = b.kind || "bullet";

    if (kind === "mine") {
      // small pulsing dot on the ground
      ctx.save();
      const t = state.t || 0;
      const pulse = 0.75 + 0.25 * Math.sin(t * 8 + i);
      ctx.globalAlpha = (b.armT || 0) > 0 ? 0.45 : 0.85;
      ctx.fillStyle = `rgba(255, 210, 90, ${0.4 + 0.4 * pulse})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 3 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (kind === "explosionFx") {
      const r = b.radius || 60;
      const t = clamp((b.ttl || 0) / 0.22, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.45 * (1 - t);
      ctx.strokeStyle = "rgba(255, 210, 90, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r * (1 - t), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    if (kind === "tesla" && Array.isArray(b.points) && b.points.length) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "rgba(140, 230, 255, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      for (let p = 0; p < b.points.length; p++) {
        const px = b.points[p].x - camera.x;
        const py = b.points[p].y - camera.y;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
      continue;
    }

    const a = Math.atan2(b.vy || 0, b.vx || 0);
    const len =
      kind === "laser"
        ? Math.max(80, b.len || 520)
        : kind === "lance"
          ? 14
          : kind === "shotgun"
            ? 8
            : kind === "boomerang"
              ? 16
            : kind === "flame"
              ? 6
              : 10; // pistol/bullet
    const lw =
      kind === "laser"
        ? 3.5
        : kind === "lance"
          ? 3
          : kind === "shotgun"
            ? 2.5
            : kind === "boomerang"
              ? 3
              : kind === "flame"
                ? 4
                : 2;
    const col =
      kind === "pistol"
        ? "rgba(255, 220, 90, 0.95)" // warm yellow
        : kind === "shotgun"
          ? "rgba(255, 140, 90, 0.95)" // orange
          : kind === "lance"
            ? "rgba(140, 230, 255, 0.95)" // cyan
            : kind === "laser"
              ? "rgba(255, 90, 90, 0.95)"
              : kind === "boomerang"
                ? "rgba(210, 170, 255, 0.95)" // purple-ish (readable)
              : kind === "turret"
                ? "rgba(255, 220, 90, 0.90)"
            : kind === "flame"
              ? `rgba(255, ${180 + ((Math.sin((state.t || 0) * 12 + i) * 25) | 0)}, 70, 0.92)` // flicker
            : fgDim;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.globalAlpha = kind === "laser" ? 0.62 : 0.78;
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.lineTo(len * 0.5, 0);
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();
  }

  // enemy bullets (dots)
  for (let i = 0; i < enemyBullets.length; i++) {
    const b = enemyBullets[i];
    const sx = b.x - camera.x;
    const sy = b.y - camera.y;
    ctx.fillStyle = b.kind === "spit" ? "rgba(255, 120, 90, 0.85)" : fgDim;
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // enemies
  ctx.fillStyle = theme.fg || CFG.fg;
  ctx.shadowBlur = 10;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const sx = e.x - camera.x;
    const sy = e.y - camera.y;
    if (sx < -80 || sy < -80 || sx > viewport.w + 80 || sy > viewport.h + 80) continue;

    drawSoftDisc(ctx, sx, sy, e.isBoss ? 40 : 22, e.isBoss ? 0.12 : 0.09);
    ctx.fillStyle = theme.fg || CFG.fg; // restore (halo uses gradients)
    let ch = "x";
    if (e.kind === "fast") ch = ">";
    else if (e.kind === "tank") ch = "#";
    else if (e.kind === "spitter") ch = "%";
    else if (e.kind === "shield") ch = "]";
    else if (e.kind === "charger") ch = "}";
    else if (e.kind === "exploder") ch = "*";
    else if (e.kind === "summoner") ch = "M";
    else if (e.isBoss) ch = "@";
    drawEntityChar(ctx, sx, sy, ch, e.isBoss ? 1 : 0.95);

    // Telegraphed spitter shot (small "!" above)
    if (e.kind === "spitter" && (e.windT || 0) > 0) {
      ctx.save();
      ctx.shadowBlur = 0;
      const t = clamp((e.windT || 0) / 0.28, 0, 1);
      ctx.globalAlpha = 0.35 + 0.55 * (1 - t);
      ctx.fillStyle = "rgba(255,160,90,0.95)";
      ctx.font = `18px ${CFG.fontFamily}`;
      drawEntityChar(ctx, sx, sy - 18, "!", 1);
      ctx.restore();
    }

    // Telegraphed charger dash
    if (e.kind === "charger" && (e.chargeWindT || 0) > 0) {
      ctx.save();
      ctx.shadowBlur = 0;
      const t = clamp((e.chargeWindT || 0) / 0.28, 0, 1);
      ctx.globalAlpha = 0.35 + 0.55 * (1 - t);
      ctx.fillStyle = "rgba(255,160,90,0.95)";
      ctx.font = `18px ${CFG.fontFamily}`;
      drawEntityChar(ctx, sx, sy - 18, "!", 1);
      ctx.restore();
    }

    // hp bar above elites/boss
    const elite = e.isBoss || e.kind === "tank" || e.kind === "spitter" || e.kind === "shield" || e.kind === "summoner";
    if (elite && (e.hpMax || 0) > 0) {
      const pct = clamp(e.hp / e.hpMax, 0, 1);
      const w = e.isBoss ? 48 : 34;
      const h = 6;
      const x0 = sx - w * 0.5;
      const y0 = sy - (e.isBoss ? 28 : 20);
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = rgba(theme.fg || CFG.fg, 0.45);
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, w, h);
      ctx.fillStyle = rgba(theme.fg || CFG.fg, 0.55);
      ctx.fillRect(x0, y0, w * pct, h);
      ctx.restore();
    }

    // small boss hp bar
    if (e.isBoss) {
      const pct = clamp(e.hp / (e.hpMax || 1), 0, 1);
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = "rgba(242,242,242,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 20, viewport.w - 40, 10);
      ctx.fillStyle = "rgba(242,242,242,0.55)";
      ctx.fillRect(20, 20, (viewport.w - 40) * pct, 10);
      ctx.globalAlpha = 1;
    }
  }

  // player + range ring
  {
    const sx = player.x - camera.x;
    const sy = player.y - camera.y;
    drawSoftDisc(ctx, sx, sy, 26, 0.10);
    ctx.strokeStyle = "rgba(242,242,242,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, player.range ?? 120, 0, Math.PI * 2);
    ctx.stroke();

    // small aim indicator line
    if (game.enemies.length > 0) {
      const ax = Math.cos(player.aimAngle ?? 0);
      const ay = Math.sin(player.aimAngle ?? 0);
      ctx.strokeStyle = "rgba(242,242,242,0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + ax * 10, sy + ay * 10);
      ctx.lineTo(sx + ax * 26, sy + ay * 26);
      ctx.stroke();
    }

    ctx.fillStyle = theme.fg || CFG.fg;
    ctx.shadowBlur = 14;
    // Keep hero skin glyph always visible.
    drawEntityChar(ctx, sx, sy, player.glyph ?? "@", 1);

    // Draw a small rotated chevron next to the player (so skin doesn't "flip").
    if (game.enemies.length > 0) {
      const ax = Math.cos(player.aimAngle ?? 0);
      const ay = Math.sin(player.aimAngle ?? 0);
      const ox = ax * 18;
      const oy = ay * 18;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(theme.fg || CFG.fg, 0.7);
      ctx.font = `16px ${CFG.fontFamily}`;
      // Use a single glyph and rotate it for smoother look than swapping ^v<>
      drawRotatedChar(ctx, sx + ox, sy + oy, ">", player.aimAngle ?? 0, 0.9);
      ctx.restore();
    }
  }

  // turrets (temporary spawns)
  if (Array.isArray(game.turrets) && game.turrets.length) {
    ctx.save();
    setTextStyle(ctx);
    ctx.shadowBlur = 0;
    for (let i = 0; i < game.turrets.length; i++) {
      const t = game.turrets[i];
      const sx = t.x - camera.x;
      const sy = t.y - camera.y;
      drawSoftDisc(ctx, sx, sy, 18, 0.08);
      ctx.fillStyle = rgba(theme.fg || CFG.fg, 0.92);
      ctx.font = `${CFG.fontSize}px ${CFG.fontFamily}`;
      drawEntityChar(ctx, sx, sy, "T", 0.95);
    }
    ctx.restore();
  }

  // floating texts
  ctx.shadowBlur = 0;
  ctx.fillStyle = CFG.fgDim;
  ctx.font = `12px ${CFG.fontFamily}`;
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i];
    const a = clamp(f.ttl / 1.2, 0, 1);
    const sx = f.x - camera.x;
    const sy = f.y - camera.y;
    ctx.globalAlpha = a;
    ctx.fillText(f.text, sx, sy);
    ctx.globalAlpha = 1;
  }

  // Touch joystick indicator (mobile): show where the thumb is + direction "knob"
  const joy = game?.input?.joy;
  if (joy && joy.active) {
    const z = game?.viewport?.zoom || 1;
    const baseX = (joy.sx ?? joy.x) / z;
    const baseY = (joy.sy ?? joy.y) / z;
    const curX = (joy.x ?? (joy.sx ?? 0)) / z;
    const curY = (joy.y ?? (joy.sy ?? 0)) / z;

    // Don't draw if coords are invalid
    if (Number.isFinite(baseX) && Number.isFinite(baseY) && Number.isFinite(curX) && Number.isFinite(curY)) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // base ring (where the finger started)
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = rgba(theme.fg || CFG.fg, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(baseX, baseY, 26, 0, Math.PI * 2);
      ctx.stroke();

      // direction line
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(curX, curY);
      ctx.stroke();

      // knob (current thumb position)
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = rgba(theme.fg || CFG.fg, 0.10);
      ctx.strokeStyle = rgba(theme.fg || CFG.fg, 0.80);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(curX, curY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // hit flash overlay
  if (state.hitFlash > 0) {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mul = reduce ? 0.08 : 0.18;
    ctx.globalAlpha = clamp(state.hitFlash / 0.18, 0, 1) * mul;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, viewport.w, viewport.h);
    ctx.globalAlpha = 1;
  }

  // HUD + overlay text
  const hpPct = Math.round((player.hp / player.hpMax) * 100);
  const hpBar = document.getElementById("hpBar");
  const hpFill = document.getElementById("hpFill");
  const hpText = document.getElementById("hpText");
  const hpRatio = clamp((player.hp || 0) / (player.hpMax || 1), 0, 1);
  if (hpFill) hpFill.style.transform = `scaleX(${hpRatio})`;
  if (hpText) hpText.textContent = `HP ${Math.round(player.hp || 0)}/${Math.round(player.hpMax || 0)}`;

  // HP bar feedback (flash on change)
  {
    const now = performance.now();
    const prevHp = state._hpPrev ?? (player.hp || 0);
    const curHp = player.hp || 0;
    if (Math.abs(curHp - prevHp) >= 0.5) {
      state._hpPrev = curHp;
      state._hpFlashUntil = now + 280;
      state._hpFlashDir = curHp > prevHp ? 1 : -1; // +1 heal, -1 damage
    }
    const rem = (state._hpFlashUntil || 0) - now;
    if (hpBar) {
      if (rem > 0) {
        const t = clamp(rem / 280, 0, 1);
        const a = (1 - t) * 0.55;
        const isHeal = (state._hpFlashDir || 0) > 0;
        // Palette is read from CSS vars (overridden by styles-colorblind.css when enabled).
        const col = isHeal ? `rgba(${rgb.hpHeal}, ${a})` : `rgba(${rgb.hpDmg}, ${a})`;
        hpBar.style.boxShadow = `0 0 0 1px ${col}, 0 0 22px ${col}`;
      } else {
        hpBar.style.boxShadow = "";
      }
    }
    if (hpFill) {
      if (rem > 0) {
        const t = clamp(rem / 280, 0, 1);
        const boost = 1 + (1 - t) * 0.35;
        hpFill.style.filter = `brightness(${boost})`;
      } else {
        hpFill.style.filter = "";
      }
    }
  }
  const waveLeft = Math.max(0, CFG.waveSeconds - (state.t % CFG.waveSeconds));
  const wmm = Math.floor(waveLeft / 60);
  const wss = Math.floor(waveLeft % 60);
  const waveLeftStr = `${wmm}:${String(wss).padStart(2, "0")}`;
  const extra = [];
  if (state.nextBossIn !== undefined && state.nextBossIn <= 12 && !state.bossAlive) {
    extra.push(`<span>BOSS <span class="v">${Math.ceil(state.nextBossIn)}s</span></span>`);
  }
  if (state.objective && !state.objective.done) {
    extra.push(
      `<span>${state.objective.label} <span class="v">${Math.min(state.objective.progress, state.objective.target)}/${state.objective.target}</span></span>`,
    );
  }
  if (state.running) {
    const cd = state.dashCd || 0;
    extra.push(`<span>DASH <span class="v">${cd > 0 ? cd.toFixed(1) : "OK"}</span></span>`);
  }

  hudEl.innerHTML = [
    `<span>LVL <span class="v">${player.level}</span></span>`,
    `<span>HERO <span class="v">${player.heroId ?? "?"}</span></span>`,
    `<span>ENEMIS <span class="v">${enemies.length}</span></span>`,
    `<span>KILLS <span class="v">${state.kills}</span></span>`,
    `<span>WAVE <span class="v">${state.wave}</span></span>`,
    `<span>T- <span class="v">${waveLeftStr}</span></span>`,
    `<span>BEST <span class="v">${game.highScore?.bestKills ?? 0}</span></span>`,
    ...extra,
  ].join("");

  // Highscore in menu (loaded from cookie in game.js -> game.highScore)
  const elBestKills = document.getElementById("bestKills");
  const elBestWave = document.getElementById("bestWave");
  if (elBestKills) elBestKills.textContent = String(game.highScore?.bestKills ?? 0);
  if (elBestWave) elBestWave.textContent = String(game.highScore?.bestWave ?? 0);
  const elBestKillsPause = document.getElementById("bestKillsPause");
  const elBestWavePause = document.getElementById("bestWavePause");
  if (elBestKillsPause) elBestKillsPause.textContent = String(game.highScore?.bestKills ?? 0);
  if (elBestWavePause) elBestWavePause.textContent = String(game.highScore?.bestWave ?? 0);

  // End menu stats
  const endStats = document.getElementById("endStats");
  if (endStats) {
    endStats.hidden = !state.gameOver;
    if (state.gameOver) {
      const t = Math.max(0, state.t || 0);
      const mm = Math.floor(t / 60);
      const ss = Math.floor(t % 60);
      const timeStr = `${mm}:${String(ss).padStart(2, "0")}`;
      const elKills = document.getElementById("statKills");
      const elWave = document.getElementById("statWave");
      const elTime = document.getElementById("statTime");
      const elBest = document.getElementById("statBest");
      if (elKills) elKills.textContent = String(state.kills || 0);
      if (elWave) elWave.textContent = String(state.wave || 1);
      if (elTime) elTime.textContent = timeStr;
      if (elBest) elBest.textContent = String(game.highScore?.bestKills ?? 0);
    }
  }

  // Menu visibility (start vs pause)
  const startMenu = document.getElementById("startMenu");
  const pauseMenu = document.getElementById("pauseMenu");
  const upgradeMenu = document.getElementById("upgradeMenu");
  const statsMenu = document.getElementById("statsMenu");
  const tutorialMenu = document.getElementById("tutorialMenu");
  const overlayMenuActive = !!state.statsMenu || !!state.tutorialMenu;
  if (startMenu)
    startMenu.hidden = !!state.running || !!state.paused || !!state.gameOver || !!state.upgradeMenu || overlayMenuActive;
  if (pauseMenu) pauseMenu.hidden = !state.paused || !!state.upgradeMenu || overlayMenuActive;
  if (upgradeMenu) upgradeMenu.hidden = !state.upgradeMenu || overlayMenuActive;
  if (statsMenu) statsMenu.hidden = !state.statsMenu;
  if (tutorialMenu) tutorialMenu.hidden = !state.tutorialMenu;

  // Ensure overlay is interactive whenever a menu is visible.
  // (Fixes cases where buttons look visible but are not clickable on some devices.)
  const shouldOverlayBeActive =
    !state.running || !!state.paused || !!state.gameOver || !!state.upgradeMenu || !!state.statsMenu || !!state.tutorialMenu;
  overlayEl.dataset.active = shouldOverlayBeActive ? "true" : "false";
  overlayEl.style.opacity = shouldOverlayBeActive ? "1" : "0";

  // Stats UI (only when menu is open)
  if (state.statsMenu) {
    const grid = document.getElementById("statsGrid");
    const ach = document.getElementById("achList");
    const st = game.lifetimeStats || {};

    if (grid) {
      const topWeapons = Object.entries(st.killsByWeapon || {})
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .slice(0, 4);
      const topWeaponsStr = topWeapons.length ? topWeapons.map(([k, v]) => `${k}:${v}`).join(" ") : "-";

      grid.innerHTML = [
        `<div class="stat"><span class="k">Runs</span> <span class="v">${st.runs ?? 0}</span></div>`,
        `<div class="stat"><span class="k">Kills</span> <span class="v">${st.killsTotal ?? 0}</span></div>`,
        `<div class="stat"><span class="k">Best time</span> <span class="v">${formatTimeMMSS(st.bestTime ?? 0)}</span></div>`,
        `<div class="stat"><span class="k">Best wave</span> <span class="v">${st.bestWave ?? 0}</span></div>`,
        `<div class="stat"><span class="k">Best kills</span> <span class="v">${st.bestKills ?? 0}</span></div>`,
        `<div class="stat"><span class="k">Top weps</span> <span class="v">${topWeaponsStr}</span></div>`,
      ].join("");
    }

    if (ach) {
      function progressFor(def) {
        if (def.kind === "killsTotal") return st.killsTotal || 0;
        if (def.kind === "bestTime") return st.bestTime || 0;
        if (def.kind === "weapon") return st.killsByWeapon?.[def.key] || 0;
        if (def.kind === "enemy") return st.killsByEnemy?.[def.key] || 0;
        return 0;
      }
      ach.innerHTML = ACHIEVEMENT_DEFS.map((def) => {
        const unlocked = !!st.achievements?.[def.id]?.unlocked;
        const prog = progressFor(def);
        const stateStr = unlocked ? "OK" : `${Math.min(prog, def.target)}/${def.target}`;
        return `
          <div class="achItem" data-unlocked="${unlocked ? "true" : "false"}">
            <div class="achTop">
              <div class="achTitle">${def.title}</div>
              <div class="achState">${stateStr}</div>
            </div>
            <div class="achDesc">${def.desc}</div>
          </div>
        `;
      }).join("");
    }
  }

  // Upgrade options UI
  if (state.upgradeMenu) {
    const btn0 = document.getElementById("btnUp0");
    const btn1 = document.getElementById("btnUp1");
    const btn2 = document.getElementById("btnUp2");
    const owned = document.getElementById("ownedWeps");
    const h = document.getElementById("upgradeHint");
    const opts = state.upgradeChoices || [];

    function tagFor(opt) {
      if (!opt) return "";
      if (opt.kind === "weapon") return "WEAPON";
      if (opt.kind === "buff") return "BUFF";
      if (opt.kind === "perk") return "PERK";
      return String(opt.kind || "").toUpperCase();
    }

    function setBtn(btn, idx) {
      if (!btn) return;
      const opt = opts[idx];
      const selected = (state.upgradeCursor || 0) === idx;
      btn.classList.toggle("isSelected", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
      btn.dataset.idx = String(idx);
      const key = String(idx + 1);
      const title = opt?.title ?? "…";
      const desc = opt?.desc ?? "";
      const tag = tagFor(opt);
      btn.innerHTML = `
        <span class="upKey">${key}</span>
        <span class="upBody">
          <span class="upTitle">${title}</span>
          <span class="upDesc">${desc}</span>
        </span>
        <span class="upTag">${tag}</span>
      `;
    }

    setBtn(btn0, 0);
    setBtn(btn1, 1);
    setBtn(btn2, 2);

    if (owned) {
      const ws = (game.player?.weapons || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const list = ws
        .map((w) => `${weaponName(w.id)} ${Math.min(w.lvl || 1, WEAPON_MAX_LEVEL)}/${WEAPON_MAX_LEVEL}`)
        .join(" · ");
      owned.innerHTML = `<span class="k">ARMES</span> <span class="v">${list || "-"}</span>`;
    }
    if (h) h.textContent = `Choisis 1–3. (${Math.max(1, state.upgradeRemaining || 1)} restant)`;
  }

  // Pause button enable/disable
  const btnPauseTop = document.getElementById("btnPauseTop");
  if (btnPauseTop) btnPauseTop.disabled = !state.running || state.gameOver;
  const btnDashTop = document.getElementById("btnDashTop");
  if (btnDashTop) btnDashTop.disabled = !state.running || state.gameOver || state.paused || state.upgradeMenu;

  // Wall bump FX (small "bonk" flash)
  if ((state.wallBumpT || 0) > 0) {
    const t = clamp(state.wallBumpT / 0.12, 0, 1);
    const sx = (state.wallBumpX ?? player.x) - camera.x;
    const sy = (state.wallBumpY ?? player.y) - camera.y;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.35 * t;
    ctx.strokeStyle = theme.fg || CFG.fg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 14 + (1 - t) * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.85 * t;
    ctx.fillStyle = theme.fg || CFG.fg;
    ctx.font = `18px ${CFG.fontFamily}`;
    drawEntityChar(ctx, sx, sy, "*", 1);
    ctx.restore();
  }

  // Incoming damage indicator (small arrow)
  if ((state.damageT || 0) > 0) {
    const t = state.damageT;
    const a = state.damageAngle ?? 0;
    const cx = viewport.w * 0.5;
    const cy = viewport.h * 0.5;
    const r = Math.min(viewport.w, viewport.h) * 0.42;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(theme.fg || CFG.fg, 0.65 * clamp(t, 0, 1));
    ctx.font = `22px ${CFG.fontFamily}`;
    drawRotatedChar(ctx, x, y, ">", a, 0.9);
    ctx.restore();
  }

  if (state.statsMenu) {
    overlayEl.querySelector(".title").textContent = "STATS";
    overlayEl.querySelector(".hint").textContent = "Esc pour revenir.";
  } else if (state.tutorialMenu) {
    overlayEl.querySelector(".title").textContent = "TUTORIEL";
    overlayEl.querySelector(".hint").textContent = "Esc pour revenir.";
  } else if (state.upgradeMenu) {
    overlayEl.querySelector(".title").textContent = "UPGRADE";
    overlayEl.querySelector(".hint").textContent = "Choisis 1–3 pour améliorer ton build.";
  } else if (state.gameOver) {
    overlayEl.querySelector(".title").textContent = "GAME OVER";
    overlayEl.querySelector(".hint").textContent = `Kills: ${state.kills} — Best: ${game.highScore?.bestKills ?? 0} — Appuie sur R.`;
  } else if (state.paused) {
    overlayEl.querySelector(".title").textContent = "PAUSE";
    overlayEl.querySelector(".hint").textContent = "Appuie sur P pour reprendre.";
  } else {
    if (!state.running) {
      overlayEl.querySelector(".title").textContent = "GRAINFALL (ASCII)";
      overlayEl.querySelector(".hint").textContent = "Choisis (1-9) puis Entrée. Sur mobile: touche/drag pour bouger.";
    } else {
      overlayEl.querySelector(".title").textContent = "GRAINFALL (ASCII)";
      overlayEl.querySelector(".hint").textContent =
        "Bonus: ramasse *, +, ! (lvl up → armes). Boss toutes les 5 vagues.";
    }
  }
}

