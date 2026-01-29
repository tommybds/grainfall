import { pickWeighted, randRange } from "../core/math.js";
import { createEnemy } from "./entities.js";
import { CFG } from "./config.js";

export function waveIndexAtTime(t) {
  return 1 + Math.floor(t / CFG.waveSeconds);
}

export function isBossWave(wave) {
  return wave > 0 && wave % CFG.bossEvery === 0;
}

export function spawnEnemyAtEdge(game, kind, extra) {
  const { viewport, camera, enemies, state } = game;
  if (enemies.length >= CFG.maxEnemies) return;

  const w = viewport.w;
  const h = viewport.h;
  const pad = 60;
  const cx = camera.x + w * 0.5;
  const cy = camera.y + h * 0.5;

  const side = (Math.random() * 4) | 0;
  let x, y;
  if (side === 0) {
    x = cx - w * 0.5 - pad;
    y = cy + (Math.random() - 0.5) * h;
  } else if (side === 1) {
    x = cx + w * 0.5 + pad;
    y = cy + (Math.random() - 0.5) * h;
  } else if (side === 2) {
    x = cx + (Math.random() - 0.5) * w;
    y = cy - h * 0.5 - pad;
  } else {
    x = cx + (Math.random() - 0.5) * w;
    y = cy + h * 0.5 + pad;
  }

  enemies.push(createEnemy({ x, y, kind, wave: state.wave, diff: state.diff, ...(extra || {}) }));
}

export function spawnBoss(game) {
  // Spawn boss slightly off-screen
  const w = game.state.wave || 1;
  // Unlock more boss types as the run advances.
  const pool = [
    { item: "summoner", w: 10 },
    { item: "rager", w: Math.max(0, w - 8) * 1.2 },
    { item: "artillery", w: Math.max(0, w - 12) * 1.1 },
    { item: "titan", w: Math.max(0, w - 18) * 0.9 },
  ].filter((x) => x.w > 0);
  // Guarantee early variety.
  const forced = w === 5 ? "summoner" : w === 10 ? "rager" : w === 15 ? "artillery" : w === 20 ? "titan" : null;
  const bossType = forced || pickWeighted(pool);
  spawnEnemyAtEdge(game, "boss", { bossType });
  game.state.bossType = bossType;
  game.state.bossAlive = true;
  game.state.bossWave = game.state.wave;
}

export function updateWaves(dt, game) {
  const s = game.state;
  const nextWave = waveIndexAtTime(s.t);
  if (nextWave !== s.wave) {
    s.wave = nextWave;
    s.waveJustStarted = true;
    s.bossAlive = false;
    s.bossWave = 0;
  } else {
    s.waveJustStarted = false;
  }

  // Boss telegraph
  const waveIn = s.t % CFG.waveSeconds;
  const waveLeft = Math.max(0, CFG.waveSeconds - waveIn);
  const nextBossWave = s.wave + (CFG.bossEvery - (s.wave % CFG.bossEvery || CFG.bossEvery));
  s.nextBossWave = nextBossWave;
  s.nextBossIn = (nextBossWave - s.wave) * CFG.waveSeconds + waveLeft;
  // one-time warning when boss is close
  if (s.nextBossIn <= 3.2 && !s.bossAlive) {
    if (s._bossWarnWave !== s.wave) {
      s._bossWarnWave = s.wave;
      game.floats.push({ x: game.player.x, y: game.player.y - 30, ttl: 1.4, text: "BOSS INCOMING" });
    }
  }

  // base difficulty ramp
  s.difficulty = 1 + s.wave * 0.16;

  // --- Rhythm: calm windows + lightweight events ---
  s.calmT = Math.max(0, (s.calmT || 0) - dt);
  s.eventT = Math.max(0, (s.eventT || 0) - dt);
  if ((s.eventT || 0) <= 0) s.eventType = "";

  if (s.waveJustStarted) {
    // Every few waves (but never on boss waves): short calm to breathe.
    if (!isBossWave(s.wave) && s.wave >= 3 && s.wave % 4 === 0) {
      s.calmT = 3.6;
      game.floats.push({ x: game.player.x, y: game.player.y - 28, ttl: 1.2, text: "CALME" });
    }

    // Random events (avoid stacking with calm; scale up slowly with wave).
    if (!isBossWave(s.wave) && (s.calmT || 0) <= 0 && s.wave >= 4 && Math.random() < Math.min(0.26, 0.10 + s.wave * 0.006)) {
      const evPool = [
        { item: "rush", w: 10 },
        { item: "elites", w: Math.max(0, s.wave - 6) * 0.8 + 4 },
      ];
      const ev = pickWeighted(evPool);
      s.eventType = ev;
      s.eventT = ev === "rush" ? 8.5 : 0.9;
      if (ev === "rush") {
        game.floats.push({ x: game.player.x, y: game.player.y - 28, ttl: 1.35, text: "RUSH" });
      } else if (ev === "elites") {
        game.floats.push({ x: game.player.x, y: game.player.y - 28, ttl: 1.35, text: "ELITES" });
        // Spawn a small elite pack immediately.
        const n = 2 + ((Math.random() * 2) | 0);
        for (let k = 0; k < n; k++) spawnEnemyAtEdge(game, Math.random() < 0.5 ? "tank" : "shield");
        if (Math.random() < 0.55) spawnEnemyAtEdge(game, "charger");
      }
    }
  }

  // boss trigger (once per boss wave)
  if (isBossWave(s.wave) && !s.bossAlive && s.bossWave !== s.wave) {
    spawnBoss(game);
    const bt = (game.state.bossType || "").toUpperCase();
    game.floats.push({ x: game.player.x, y: game.player.y - 34, ttl: 1.6, text: bt ? `BOSS: ${bt}` : "BOSS" });
  }

  // spawn pacing: slightly calmer during boss
  const bossFactor = s.bossAlive ? 0.55 : 1;
  const calmFactor = (s.calmT || 0) > 0 ? 0.12 : 1;
  const evFactor = s.eventType === "rush" && (s.eventT || 0) > 0 ? 1.55 : 1;
  const spawnRate =
    Math.max(1.1, Math.min(12.5, 1.4 * s.difficulty)) * bossFactor * calmFactor * evFactor * (s.diff?.spawnMul ?? 1); // enemies/s
  s.spawnAcc += dt * spawnRate;

  // per-wave spawn table
  const w = s.wave;
  const table = [
    { item: "walker", w: 10 },
    { item: "fast", w: Math.max(0, w - 1) * 1.4 },
    { item: "tank", w: Math.max(0, w - 2) * 0.9 },
    { item: "spitter", w: Math.max(0, w - 3) * 1.1 },
    { item: "shield", w: Math.max(0, w - 4) * 0.8 },
    { item: "charger", w: Math.max(0, w - 4) * 0.9 },
    { item: "exploder", w: Math.max(0, w - 5) * 1.0 },
    { item: "summoner", w: Math.max(0, w - 6) * 0.8 },
  ];

  while (s.spawnAcc >= 1) {
    s.spawnAcc -= 1;
    const kind = pickWeighted(table);
    // Slightly randomize spawns so waves feel less uniform.
    if (s.bossAlive && Math.random() < 0.35) continue;
    // Calm windows: let the player breathe.
    if ((s.calmT || 0) > 0 && Math.random() < 0.92) continue;
    spawnEnemyAtEdge(game, kind);
  }

  // boss check
  if (s.bossAlive) {
    const bossStill = game.enemies.some((e) => e.isBoss);
    if (!bossStill) s.bossAlive = false;
  }

  // optional: small reward at wave start
  if (s.waveJustStarted && !isBossWave(s.wave)) {
    if (Math.random() < 0.25) {
      game.floats.push({ x: game.player.x, y: game.player.y - 24, ttl: 1.2, text: `WAVE ${s.wave}` });
    }
  }
}

