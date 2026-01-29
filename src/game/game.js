import { clamp, norm, randRange } from "../core/math.js";
import { createViewport, resizeCanvasToViewport, dtFromMs } from "../core/viewport.js";
import { createInput, attachInputListeners } from "../core/input.js";
import { attachTouchJoystick } from "../core/touch.js";
import { CFG } from "./config.js";
import { createPlayer, createEnemy } from "./entities.js";
import { updateWaves, spawnEnemyAtEdge } from "./waves.js";
import { updateWeapons } from "./weapons.js";
import { updateEnemies, updateBullets, updateEnemyBullets } from "./combat.js";
import { applyPickup, applyUpgradeChoice, generateUpgradeChoices } from "./pickups.js";
import { renderFrame } from "../render/renderer.js";
import { len2 } from "../core/math.js";
import { mapById } from "./maps.js";
import { difficultyById } from "./difficulty.js";
import { heroById } from "./heroes.js";
import { loadHighScore, saveHighScore } from "./storage.js";
import { createAudio } from "../audio/audio.js";
import { sampleTile, resolveCircleVsWalls, worldToCell } from "./world.js";

export function createGame({ canvas, ctx, hudEl, overlayEl }) {
  const viewport = createViewport();
  const input = createInput();

  const game = {
    canvas,
    ctx,
    hudEl,
    overlayEl,

    viewport,
    input,

    camera: { x: 0, y: 0 },
    state: {
      running: false,
      paused: false,
      gameOver: false,
      t: 0,
      lastMs: performance.now(),
      kills: 0,
      wave: 1,
      waveJustStarted: false,
      difficulty: 1,
      diff: difficultyById("normal"),
      spawnAcc: 0,
      bossAlive: false,
      bossWave: 0,
      hitFlash: 0,
      wallBumpT: 0,
      wallBumpX: 0,
      wallBumpY: 0,

      // upgrade menu (level-up choices)
      upgradeMenu: false,
      upgradeRemaining: 0,
      upgradeChoices: [],

      // lightweight objective per run
      objective: null,
    },

    player: createPlayer(heroById("runner")),
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    floats: [],
    discoveredPickups: { xp: false, heal: false, buff: false, chest: false },

    theme: mapById("classic").theme,
    selectedMapId: "classic",
    selectedDifficultyId: "normal",
    selectedHeroId: "runner",

    highScore: { bestKills: 0, bestWave: 0 },
    audio: createAudio(),
    audioMuted: true,

    detachInput: null,
    detachTouch: null,

    reset,
    start,
    endGame,
    goToMenu,
    setPaused,
    togglePause,
    spawnEnemyNear,
    openUpgradeMenu,
    chooseUpgrade,
    requestDash,
  };

  // Slight zoom-out on small screens so you see more of the world.
  function updateZoom() {
    const isMobile = window.matchMedia && window.matchMedia("(max-width: 560px)").matches;
    game.viewport.zoom = isMobile ? 0.90 : 1;
  }
  updateZoom();
  window.addEventListener("resize", updateZoom, { passive: true });
  window.addEventListener("orientationchange", updateZoom, { passive: true });

  // async init (cookie highscore)
  loadHighScore().then((hs) => {
    game.highScore = hs;
  });

  // start muted until user interaction unlocks audio
  game.audio.setMuted(true);

  function reset() {
    game.state.running = false;
    game.state.paused = false;
    game.state.gameOver = false;
    game.state.t = 0;
    game.state.lastMs = performance.now();
    game.state.kills = 0;
    game.state.wave = 1;
    game.state.spawnAcc = 0;
    game.state.difficulty = 1;
    game.state.bossAlive = false;
    game.state.bossWave = 0;
    game.state.hitFlash = 0;
    game.state.wallBumpT = 0;
    game.state.wallBumpX = 0;
    game.state.wallBumpY = 0;

    game.state.upgradeMenu = false;
    game.state.upgradeRemaining = 0;
    game.state.upgradeChoices = [];

    game.state.objective = createObjective();

    game.state.diff = difficultyById(game.selectedDifficultyId);
    game.player = createPlayer(heroById(game.selectedHeroId));
    game.enemies.length = 0;
    game.bullets.length = 0;
    game.enemyBullets.length = 0;
    game.pickups.length = 0;
    game.floats.length = 0;
    game.discoveredPickups = { xp: false, heal: false, buff: false, chest: false };
    game.camera.x = 0;
    game.camera.y = 0;
  }

  function start() {
    // use last selected map/theme
    game.theme = mapById(game.selectedMapId).theme;
    // Hell is always hard from the start
    if (game.selectedMapId === "hell") game.selectedDifficultyId = "hard";
    reset();
    game.state.running = true;
    game.overlayEl.style.opacity = "0";
    game.overlayEl.dataset.active = "false";
  }

  function goToMenu() {
    reset();
    game.overlayEl.style.opacity = "1";
    game.overlayEl.dataset.active = "true";
  }

  function setPaused(paused) {
    if (!game.state.running || game.state.gameOver) return;
    if (game.state.upgradeMenu) return;
    game.state.paused = !!paused;
    game.overlayEl.style.opacity = game.state.paused ? "1" : "0";
    game.overlayEl.dataset.active = game.state.paused ? "true" : "false";
  }

  async function endGame() {
    game.state.gameOver = true;
    game.state.running = false;
    game.overlayEl.style.opacity = "1";
    game.overlayEl.dataset.active = "true";

    const newBestKills = Math.max(game.highScore.bestKills || 0, game.state.kills || 0);
    const newBestWave = Math.max(game.highScore.bestWave || 0, game.state.wave || 0);
    if (newBestKills !== game.highScore.bestKills || newBestWave !== game.highScore.bestWave) {
      game.highScore = { bestKills: newBestKills, bestWave: newBestWave };
      await saveHighScore(game.highScore);
      game.floats.push({ x: game.player.x, y: game.player.y - 34, ttl: 1.6, text: "NEW HIGHSCORE" });
    }
    game.audio?.death?.();
  }

  function togglePause() {
    if (game.state.gameOver) return;
    setPaused(!game.state.paused);
  }

  function requestDash() {
    if (!game.state.running || game.state.paused || game.state.gameOver || game.state.upgradeMenu) return;
    game.state.dashReq = true;
  }

  function openUpgradeMenu(count = 1) {
    if (!count || count <= 0) return;
    game.state.upgradeMenu = true;
    game.state.upgradeRemaining = Math.max(1, (game.state.upgradeRemaining || 0) + count);
    game.state.upgradeChoices = generateUpgradeChoices(game);
    // freeze gameplay but keep overlay interaction
    game.state.paused = true;
    game.overlayEl.style.opacity = "1";
    game.overlayEl.dataset.active = "true";
  }

  function chooseUpgrade(index) {
    if (!game.state.upgradeMenu) return;
    const c = game.state.upgradeChoices?.[index];
    applyUpgradeChoice(game, c);
    game.state.upgradeRemaining = Math.max(0, (game.state.upgradeRemaining || 1) - 1);
    if (game.state.upgradeRemaining > 0) {
      game.state.upgradeChoices = generateUpgradeChoices(game);
      return;
    }
    game.state.upgradeMenu = false;
    game.state.upgradeChoices = [];
    game.state.paused = false;
    game.overlayEl.style.opacity = "0";
    game.overlayEl.dataset.active = "false";
  }

  function createObjective() {
    const roll = Math.random();
    if (roll < 0.34) return { type: "kills", label: "KILL", target: 50, progress: 0, done: false };
    if (roll < 0.67) return { type: "time", label: "SURVIVE", target: 60, progress: 0, done: false };
    return { type: "pickups", label: "PICK", target: 8, progress: 0, done: false };
  }

  function spawnEnemyNear(x, y, kind) {
    if (game.enemies.length >= CFG.maxEnemies) return;
    const a = Math.random() * Math.PI * 2;
    const d = randRange(24, 52);
    game.enemies.push(
      createEnemy({
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        kind,
        wave: game.state.wave,
        diff: game.state.diff,
      }),
    );
  }

  game.detachInput = attachInputListeners({
    input: game.input,
    onTogglePause: togglePause,
    onRestart: start,
    onStart: () => {
      if (!game.state.running) start();
    },
    onDash: requestDash,
  });

  game.detachTouch = attachTouchJoystick({ canvas: game.canvas, viewport: game.viewport, input: game.input });

  return game;
}

export function runGameLoop(game) {
  let rafId = 0;
  let suspended = document.hidden;

  function startLoop() {
    if (rafId) return;
    suspended = false;
    // Avoid a huge dt spike after being hidden.
    game.state.lastMs = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    suspended = true;
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function onBlur() {
    // When the window loses focus (alt-tab / click another window),
    // pause and stop rendering/updating to save CPU.
    try {
      game.setPaused?.(true);
    } catch {
      // ignore
    }
    stopLoop();
  }

  function onFocus() {
    if (!document.hidden) startLoop();
  }

  function tick() {
    if (suspended || document.hidden) {
      stopLoop();
      return;
    }
    resizeCanvasToViewport(game.canvas, game.ctx, game.viewport);

    const now = performance.now();
    let dt = dtFromMs(now, game.state.lastMs);
    game.state.lastMs = now;

    if (game.state.hitFlash > 0) game.state.hitFlash = Math.max(0, game.state.hitFlash - dt);
    if (game.state.damageT > 0) game.state.damageT = Math.max(0, game.state.damageT - dt);
    if (game.state.wallBumpT > 0) game.state.wallBumpT = Math.max(0, game.state.wallBumpT - dt);

    if (game.state.running && !game.state.paused && !game.state.gameOver) {
      update(dt, game);
    }

    renderFrame(game);
    rafId = requestAnimationFrame(tick);
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) stopLoop();
      else startLoop();
    },
    { passive: true },
  );

  // Also handle bfcache / tab restore.
  window.addEventListener("pagehide", stopLoop, { passive: true });
  window.addEventListener("pageshow", startLoop, { passive: true });
  window.addEventListener("blur", onBlur, { passive: true });
  window.addEventListener("focus", onFocus, { passive: true });

  if (document.hidden) stopLoop();
  else startLoop();
}

function update(dt, game) {
  const s = game.state;
  s.t += dt;

  // wave system (spawns + boss)
  updateWaves(dt, game);

  // player movement
  const usingAnalog = !!game.input?.joy?.active;
  const mx = usingAnalog
    ? (game.input.ax || 0)
    : (game.input.right ? 1 : 0) - (game.input.left ? 1 : 0);
  const my = usingAnalog
    ? (game.input.ay || 0)
    : (game.input.down ? 1 : 0) - (game.input.up ? 1 : 0);
  const mv = norm(mx, my);
  const mag = clamp(mv.l, 0, 1);
  if (mag > 0.02) {
    game.player.lastMoveX = mv.x;
    game.player.lastMoveY = mv.y;
  }

  // dash
  s.dashCd = Math.max(0, (s.dashCd || 0) - dt);
  s.dashT = Math.max(0, (s.dashT || 0) - dt);
  if (s.dashReq) {
    s.dashReq = false;
    if ((s.dashCd || 0) <= 0) {
      const dx = mag > 0.02 ? mv.x : (game.player.lastMoveX || 1);
      const dy = mag > 0.02 ? mv.y : (game.player.lastMoveY || 0);
      const dir = norm(dx, dy);
      s.dashT = 0.12;
      s.dashVx = dir.x;
      s.dashVy = dir.y;
      const cdBase = 1.15;
      s.dashCd = cdBase * (game.player.buffs?.dashCdMul || 1);
    }
  }

  // biome effects at player position
  const pc = worldToCell(game.player.x, game.player.y);
  const tile = sampleTile(game.selectedMapId, pc.cx, pc.cy);
  const isIce = tile.biome === "ice";

  const baseSp = game.player.speed * game.player.buffs.moveSpeedMul;

  if ((s.dashT || 0) > 0) {
    const pow = (560 * (game.player.buffs?.dashPowMul || 1)) * (isIce ? 1.08 : 1);
    game.player.vx = (s.dashVx || 0) * pow;
    game.player.vy = (s.dashVy || 0) * pow;
    game.player.x += game.player.vx * dt;
    game.player.y += game.player.vy * dt;
  } else if (isIce) {
    // slippery inertia
    const accel = 920;
    const maxV = baseSp * 1.15;
    const targetVx = (mx !== 0 || my !== 0) ? mv.x * maxV * mag : 0;
    const targetVy = (mx !== 0 || my !== 0) ? mv.y * maxV * mag : 0;
    // move velocity towards target
    game.player.vx += clamp(targetVx - game.player.vx, -accel * dt, accel * dt);
    game.player.vy += clamp(targetVy - game.player.vy, -accel * dt, accel * dt);
    // friction
    game.player.vx *= 1 - 0.06;
    game.player.vy *= 1 - 0.06;
    game.player.x += game.player.vx * dt;
    game.player.y += game.player.vy * dt;
  } else {
    // classic responsive movement
    game.player.vx = 0;
    game.player.vy = 0;
    if (mx !== 0 || my !== 0) {
      game.player.x += mv.x * baseSp * mag * dt;
      game.player.y += mv.y * baseSp * mag * dt;
    }
  }

  // walls collision
  {
    const ox = game.player.x;
    const oy = game.player.y;
    const res = resolveCircleVsWalls({
      mapId: game.selectedMapId,
      x: game.player.x,
      y: game.player.y,
      r: game.player.r,
    });
    game.player.x = res.x;
    game.player.y = res.y;

    const dx = res.x - ox;
    const dy = res.y - oy;
    if (dx * dx + dy * dy > 0.0004) {
      // small bonk feedback when pushed by a wall
      s.wallBumpT = 0.12;
      s.wallBumpX = res.x;
      s.wallBumpY = res.y;
    }
  }

  // camera follows player
  const targetCamX = game.player.x - game.viewport.w * 0.5;
  const targetCamY = game.player.y - game.viewport.h * 0.5;
  game.camera.x += (targetCamX - game.camera.x) * clamp(dt * 10, 0, 1);
  game.camera.y += (targetCamY - game.camera.y) * clamp(dt * 10, 0, 1);

  // weapons auto-fire
  updateWeapons(dt, game);

  // enemies + bullets
  updateEnemies(dt, game);
  // clamp enemies against walls (simple)
  for (let i = 0; i < game.enemies.length; i++) {
    const e = game.enemies[i];
    const res = resolveCircleVsWalls({ mapId: game.selectedMapId, x: e.x, y: e.y, r: e.r });
    e.x = res.x;
    e.y = res.y;
  }
  updateBullets(dt, game);
  updateEnemyBullets(dt, game);

  // pickups: lifetime + pickup radius
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const p = game.pickups[i];
    p.ttl -= dt;
    if (p.ttl <= 0) {
      game.pickups.splice(i, 1);
      continue;
    }
    // magnet: gently pull pickups toward player
    const magMul = game.player.buffs?.magnetMul || 1;
    const magR = 130 * magMul;
    const dx = game.player.x - p.x;
    const dy = game.player.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0.0001 && d2 < magR * magR) {
      const d = Math.sqrt(d2);
      const pull = (520 * magMul) * (1 - d / magR);
      p.x += (dx / d) * pull * dt;
      p.y += (dy / d) * pull * dt;
    }

    const rr = 16 + 10 * (magMul - 1);
    if (len2(p.x - game.player.x, p.y - game.player.y) <= rr * rr) {
      applyPickup(game, p);
      game.pickups.splice(i, 1);
      // objective tracking
      if (s.objective && !s.objective.done && s.objective.type === "pickups") {
        s.objective.progress += 1;
      }
    }
  }

  // objective tracking (kills/time) + reward
  if (s.objective && !s.objective.done) {
    if (s.objective.type === "kills") s.objective.progress = s.kills || 0;
    if (s.objective.type === "time") s.objective.progress = Math.floor(s.t || 0);
    if (s.objective.progress >= s.objective.target) {
      s.objective.done = true;
      // Reward: drop a chest near the player
      game.pickups.push({ x: game.player.x + 18, y: game.player.y - 18, kind: "chest", value: 1, ttl: 16 });
      game.floats.push({ x: game.player.x, y: game.player.y - 30, ttl: 1.4, text: "OBJECTIVE +" });
    }
  }

  // floats
  for (let i = game.floats.length - 1; i >= 0; i--) {
    const f = game.floats[i];
    f.ttl -= dt;
    f.y -= 18 * dt;
    if (f.ttl <= 0) game.floats.splice(i, 1);
  }

  // keep pressure even if player is too safe early: ensure at least a few enemies
  if (game.enemies.length < 3 && !s.bossAlive) {
    if (Math.random() < 0.05) spawnEnemyAtEdge(game, "walker");
  }
}

