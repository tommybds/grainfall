import { clamp } from "../core/math.js";
import { CFG } from "../game/config.js";
import { pickTerrainGlyph } from "./terrain.js";
import { sampleTile } from "../game/world.js";

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
    const col =
      p.kind === "heal"
        ? `rgba(60, 255, 160, ${a})`
        : p.kind === "xp"
          ? `rgba(90, 210, 255, ${a})`
          : p.kind === "chest"
            ? `rgba(255, 210, 90, ${a})`
            : `rgba(210, 120, 255, ${a})`; // buff

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
    const a = Math.atan2(b.vy || 0, b.vx || 0);
    const kind = b.kind || "bullet";
    const len = kind === "lance" ? 14 : kind === "shotgun" ? 8 : 10; // pistol/bullet
    const lw = kind === "lance" ? 3 : kind === "shotgun" ? 2.5 : 2;
    const col =
      kind === "pistol"
        ? "rgba(255, 220, 90, 0.95)" // warm yellow
        : kind === "shotgun"
          ? "rgba(255, 140, 90, 0.95)" // orange
          : kind === "lance"
            ? "rgba(140, 230, 255, 0.95)" // cyan
            : fgDim;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.globalAlpha = 0.78;
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

    // hp bar above elites/boss
    const elite = e.isBoss || e.kind === "tank" || e.kind === "spitter";
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
    `<span>HP <span class="v">${hpPct}%</span></span>`,
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
  if (startMenu) startMenu.hidden = !!state.running || !!state.paused || !!state.gameOver || !!state.upgradeMenu;
  if (pauseMenu) pauseMenu.hidden = !state.paused || !!state.upgradeMenu;
  if (upgradeMenu) upgradeMenu.hidden = !state.upgradeMenu;

  // Upgrade options UI
  if (state.upgradeMenu) {
    const btn0 = document.getElementById("btnUp0");
    const btn1 = document.getElementById("btnUp1");
    const btn2 = document.getElementById("btnUp2");
    const h = document.getElementById("upgradeHint");
    const opts = state.upgradeChoices || [];
    if (btn0) btn0.textContent = `1 — ${(opts[0]?.title ?? "…")} (${opts[0]?.desc ?? ""})`;
    if (btn1) btn1.textContent = `2 — ${(opts[1]?.title ?? "…")} (${opts[1]?.desc ?? ""})`;
    if (btn2) btn2.textContent = `3 — ${(opts[2]?.title ?? "…")} (${opts[2]?.desc ?? ""})`;
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

  if (state.upgradeMenu) {
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

