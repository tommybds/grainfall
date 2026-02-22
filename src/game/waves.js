import { clamp, pickWeighted } from "../core/math.js";
import { createEnemy } from "./entities.js";
import { CFG } from "./config.js";

export function waveIndexAtTime(t) {
  return 1 + Math.floor(t / CFG.waveSeconds);
}

export function isBossWave(wave) {
  return wave > 0 && wave % CFG.bossEvery === 0;
}

function bossLabel(bt) {
  const t = bt || "summoner";
  if (t === "summoner") return "INVOCATEUR";
  if (t === "rager") return "RAGEUR";
  if (t === "artillery") return "ARTILLERIE";
  if (t === "titan") return "TITAN";
  if (t === "sack") return "SAC A PV";
  return String(t).toUpperCase();
}

function rollAffixForSpawn(game, kind) {
  const s = game.state;
  const wave = s?.wave || 1;
  if (kind === "boss" || wave < 6) return null;

  let chance = 0.035 + Math.min(0.16, Math.max(0, wave - 6) * 0.008);
  if (kind === "tank" || kind === "shield" || kind === "charger" || kind === "summoner") chance += 0.05;
  if (game.selectedMapId === "hell") chance += 0.03;
  if (Math.random() > clamp(chance, 0, 0.34)) return null;

  const pool = [
    { item: "vampire", w: kind === "walker" || kind === "fast" || kind === "charger" ? 3.2 : 1.8 },
    { item: "frenzy", w: kind === "fast" || kind === "charger" ? 3.8 : 2.0 },
    { item: "armored", w: kind === "tank" || kind === "shield" ? 4.8 : 2.6 },
    { item: "explosive", w: kind === "exploder" ? 0.4 : 2.4 },
  ];
  return pickWeighted(pool);
}

function updateDirector(dt, game) {
  const s = game.state;
  const p = game.player;
  if (!p) return;

  s.directorPressure = clamp(Number(s.directorPressure) || 0, 0, 1);
  s.directorSpawnMul = clamp(Number(s.directorSpawnMul) || 1, 0.55, 1.45);
  s.directorBreatheCd = Math.max(0, (s.directorBreatheCd || 0) - dt);

  let nearCount = 0;
  const nearR2 = 210 * 210;
  for (let i = 0; i < game.enemies.length; i++) {
    const e = game.enemies[i];
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if ((dx * dx + dy * dy) <= nearR2) nearCount += 1;
  }

  const hpN = clamp((p.hp || 0) / Math.max(1, p.hpMax || 1), 0, 1);
  const densityN = clamp(game.enemies.length / Math.max(1, CFG.maxEnemies * 0.52), 0, 1);
  const nearN = clamp(nearCount / 11, 0, 1);
  const rawPressure = clamp((1 - hpN) * 0.50 + nearN * 0.30 + densityN * 0.20 + (s.bossAlive ? 0.10 : 0), 0, 1);
  s.directorPressure += (rawPressure - s.directorPressure) * clamp(dt * 1.9, 0, 1);

  s.directorTempoT = (s.directorTempoT || 0) + dt;
  if ((s.directorTempoT || 0) >= 0.8) {
    const prev = s.directorKillsPrev || 0;
    const nowKills = s.kills || 0;
    const dk = Math.max(0, nowKills - prev);
    const span = Math.max(0.2, s.directorTempoT || 0.8);
    const kps = dk / span;
    s.directorKps = (s.directorKps || 0) * 0.65 + kps * 0.35;
    s.directorKillsPrev = nowKills;
    s.directorTempoT = 0;
  }

  const kpsN = clamp((s.directorKps || 0) / 4.0, 0, 1);
  const flatness = clamp((1 - s.directorPressure) * 0.62 + (1 - kpsN) * 0.38, 0, 1);
  s.directorFlatness = flatness;

  let targetMul = 1.0;
  if (s.directorPressure > 0.84) targetMul = 0.64;
  else if (s.directorPressure > 0.72) targetMul = 0.78;
  else if (s.directorPressure < 0.28) targetMul = 1.30;
  else targetMul = 0.95 + (0.5 - s.directorPressure) * 0.30 + flatness * 0.10;
  if (s.bossAlive) targetMul *= 0.88;
  s.directorSpawnMul += (targetMul - s.directorSpawnMul) * clamp(dt * 1.3, 0, 1);
  s.directorSpawnMul = clamp(s.directorSpawnMul, 0.55, 1.45);

  // If pressure is too high, force a short breathing window.
  if (!s.bossAlive && s.directorPressure > 0.92 && (s.directorBreatheCd || 0) <= 0) {
    s.calmT = Math.max(s.calmT || 0, 1.8);
    s.directorBreatheCd = 7.2;
    game.floats.push({ x: p.x, y: p.y - 28, ttl: 1.1, text: "RESPIRER" });
    game.audio?.warning?.("danger");
  }

  // If combat is too flat, inject a short rush.
  if (!s.bossAlive && (s.calmT || 0) <= 0 && !s.eventType && flatness > 0.76 && Math.random() < (0.22 * dt)) {
    s.eventType = "rush";
    s.eventT = 6.2;
    game.floats.push({ x: p.x, y: p.y - 28, ttl: 1.1, text: "RUSH" });
    game.audio?.warning?.("rush");
  }
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
  let x;
  let y;
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

  const payload = { x, y, kind, wave: state.wave, diff: state.diff, ...(extra || {}) };
  if (!payload.affix && kind !== "boss") payload.affix = rollAffixForSpawn(game, kind);
  enemies.push(createEnemy(payload));
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
    // Pure HP sponge (very tanky, simpler pattern)
    { item: "sack", w: Math.max(0, w - 14) * 1.1 },
  ].filter((x) => x.w > 0);
  // Guarantee early variety.
  const forced =
    w === 5 ? "summoner" : w === 10 ? "rager" : w === 15 ? "artillery" : w === 20 ? "titan" : w === 25 ? "sack" : null;
  const bossType = forced || pickWeighted(pool);
  spawnEnemyAtEdge(game, "boss", { bossType });
  game.state.bossType = bossType;
  game.state.bossCount = (game.state.bossCount || 0) + 1;
  game.state.bossAlive = true;
  game.state.bossWave = game.state.wave;
  // Announce clearly: number + name
  game.floats.push({
    x: game.player.x,
    y: game.player.y - 34,
    ttl: 1.8,
    text: `BOSS #${game.state.bossCount} - ${bossLabel(bossType)}`,
  });
  game.audio?.warning?.("boss");
}

export function updateWaves(dt, game) {
  const s = game.state;
  const bossEntityAlive = game.enemies.some((e) => !!e.isBoss);
  const nextWave = waveIndexAtTime(s.waveClock ?? s.t);
  if (nextWave !== s.wave) {
    s.wave = nextWave;
    s.waveJustStarted = true;
    if (!bossEntityAlive) {
      s.bossAlive = false;
      s.bossWave = 0;
    }
  } else {
    s.waveJustStarted = false;
  }
  if (bossEntityAlive) {
    s.bossAlive = true;
    if (!s.bossWave) s.bossWave = s.wave;
  }

  // 100% combat mode: no exploration intermission.

  // Boss cadence: one major boss every N waves (deterministic and readable).
  const wv = s.wave || 1;
  let nextBossWave = Math.max(CFG.bossEvery, Math.ceil(wv / CFG.bossEvery) * CFG.bossEvery);
  if ((s.lastBossWave || 0) >= nextBossWave) nextBossWave += CFG.bossEvery;
  s.nextBossWave = nextBossWave;
  s.nextBossWavesLeft = Math.max(0, nextBossWave - wv);
  // Keep legacy field to avoid touching unrelated UI paths.
  s.nextBossKillsLeft = s.nextBossWavesLeft;
  s.bossCooldownT = 0;

  // base difficulty ramp
  s.difficulty = 1 + s.wave * 0.16;
  updateDirector(dt, game);

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
    const evBaseChance = Math.min(0.26, 0.10 + s.wave * 0.006);
    const evDirMul = (s.directorPressure || 0) > 0.78 ? 0.55 : (s.directorPressure || 0) < 0.35 ? 1.28 : 1;
    const evChance = clamp(evBaseChance * evDirMul, 0.06, 0.34);
    if (!isBossWave(s.wave) && (s.calmT || 0) <= 0 && s.wave >= 4 && Math.random() < evChance) {
      const evPool = [
        { item: "rush", w: 10 },
        { item: "elites", w: Math.max(0, s.wave - 6) * 0.8 + 4 },
      ];
      const ev = pickWeighted(evPool);
      s.eventType = ev;
      s.eventT = ev === "rush" ? (7.0 + (s.directorFlatness || 0) * 2.2) : 0.9;
      if (ev === "rush") {
        game.floats.push({ x: game.player.x, y: game.player.y - 28, ttl: 1.35, text: "RUSH" });
        game.audio?.warning?.("rush");
      } else if (ev === "elites") {
        game.floats.push({ x: game.player.x, y: game.player.y - 28, ttl: 1.35, text: "ELITES" });
        // Spawn a small elite pack immediately.
        const n = 2 + ((Math.random() * 2) | 0);
        for (let k = 0; k < n; k++) spawnEnemyAtEdge(game, Math.random() < 0.5 ? "tank" : "shield");
        if (Math.random() < 0.55) spawnEnemyAtEdge(game, "charger");
      }
    }
  }

  // boss trigger: once per boss-wave even if the fight starts a bit later.
  const shouldSpawnBoss = isBossWave(s.wave) && (s.lastBossWave || 0) !== s.wave;
  if (shouldSpawnBoss && !s.bossAlive && !bossEntityAlive) {
    s.lastBossWave = s.wave;
    s.eventType = "";
    s.eventT = 0;
    s.calmT = Math.min(s.calmT || 0, 0.8);
    spawnBoss(game);
  }

  // spawn pacing: slightly calmer during boss
  const bossFactor = s.bossAlive ? 0.55 : 1;
  const calmFactor = (s.calmT || 0) > 0 ? 0.12 : 1;
  const evFactor = s.eventType === "rush" && (s.eventT || 0) > 0 ? 1.55 : 1;
  const dirFactor = clamp(s.directorSpawnMul || 1, 0.55, 1.45);
  const spawnCap = Math.min(22, 12.5 + Math.max(0, (s.wave || 1) - 16) * 0.35);
  const spawnRate =
    Math.max(1.1, Math.min(spawnCap, 1.4 + (s.wave || 1) * 0.24)) *
    bossFactor *
    calmFactor *
    evFactor *
    dirFactor *
    (s.diff?.spawnMul ?? 1); // enemies/s
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
    // zone denial (arrive gradually)
    { item: "grenadier", w: Math.max(0, w - 7) * 0.9 },
    { item: "pyro", w: Math.max(0, w - 9) * 0.85 },
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
    if (!bossStill) {
      s.bossAlive = false;
      // Cooldown window after boss death (breathing room).
      s.bossCooldownT = 0;
      s.calmT = Math.max(s.calmT || 0, 3.2);
      game.floats.push({ x: game.player.x, y: game.player.y - 28, ttl: 1.3, text: "BOSS DOWN" });
    }
  }

  // Optional: small reward at wave start.
  if (s.waveJustStarted && !s.bossAlive) {
    if (Math.random() < 0.25) {
      game.floats.push({ x: game.player.x, y: game.player.y - 24, ttl: 1.2, text: `WAVE ${s.wave}` });
    }
  }
}
