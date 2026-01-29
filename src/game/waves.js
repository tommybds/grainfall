import { pickWeighted, randRange } from "../core/math.js";
import { createEnemy } from "./entities.js";
import { CFG } from "./config.js";

export function waveIndexAtTime(t) {
  return 1 + Math.floor(t / CFG.waveSeconds);
}

export function isBossWave(wave) {
  return wave > 0 && wave % CFG.bossEvery === 0;
}

export function spawnEnemyAtEdge(game, kind) {
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

  enemies.push(createEnemy({ x, y, kind, wave: state.wave, diff: state.diff }));
}

export function spawnBoss(game) {
  // Spawn boss slightly off-screen
  spawnEnemyAtEdge(game, "boss");
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

  // boss trigger (once per boss wave)
  if (isBossWave(s.wave) && !s.bossAlive && s.bossWave !== s.wave) {
    spawnBoss(game);
    game.floats.push({ x: game.player.x, y: game.player.y - 34, ttl: 1.6, text: "BOSS" });
  }

  // spawn pacing: slightly calmer during boss
  const bossFactor = s.bossAlive ? 0.55 : 1;
  const spawnRate =
    Math.max(1.3, Math.min(11, 1.4 * s.difficulty)) * bossFactor * (s.diff?.spawnMul ?? 1); // enemies/s
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

