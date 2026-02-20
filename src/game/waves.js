import { clamp, pickWeighted, randRange } from "../core/math.js";
import { createEnemy } from "./entities.js";
import { CFG } from "./config.js";
import { resolveCircleVsWalls, sampleTile, worldToCell } from "./world.js";

const EXPLORE_EVERY_WAVES = 5;
const EXPLORE_MIN_SEC = 30;
const EXPLORE_MAX_SEC = 42;
const EXPLORE_SITE_COUNT = 3;
const EXPLORE_PICK_RADIUS = 28;

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
  if (t === "sack") return "SAC À PV";
  return String(t).toUpperCase();
}

function isValidExploreSite(game, x, y) {
  const mapId = game.selectedMapId || "classic";
  const p = worldToCell(x, y);
  if (sampleTile(mapId, p.cx, p.cy).wall) return false;

  const r = 14;
  const pos = resolveCircleVsWalls({ mapId, x, y, r });
  const d2 = (pos.x - x) * (pos.x - x) + (pos.y - y) * (pos.y - y);
  if (d2 > 16) return false;

  const checks = [
    [r, 0], [-r, 0], [0, r], [0, -r],
  ];
  for (let i = 0; i < checks.length; i++) {
    const c = checks[i];
    const cp = worldToCell(pos.x + c[0], pos.y + c[1]);
    if (sampleTile(mapId, cp.cx, cp.cy).wall) return false;
  }
  return true;
}

function findExploreSitePos(game, originX, originY, baseAngle, existingSites) {
  for (let t = 0; t < 24; t++) {
    const a = baseAngle + randRange(-0.42, 0.42);
    const d = randRange(170, 340);
    const x = originX + Math.cos(a) * d;
    const y = originY + Math.sin(a) * d;
    if (!isValidExploreSite(game, x, y)) continue;
    let ok = true;
    for (let i = 0; i < existingSites.length; i++) {
      const s = existingSites[i];
      const dx = s.x - x;
      const dy = s.y - y;
      if ((dx * dx + dy * dy) < (120 * 120)) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }

  // Fallback near player safe area if random placement failed.
  for (let ring = 100; ring <= 220; ring += 40) {
    for (let k = 0; k < 8; k++) {
      const a = baseAngle + (k * Math.PI) / 4;
      const x = originX + Math.cos(a) * ring;
      const y = originY + Math.sin(a) * ring;
      if (isValidExploreSite(game, x, y)) return { x, y };
    }
  }

  return { x: originX + Math.cos(baseAngle) * 96, y: originY + Math.sin(baseAngle) * 96 };
}

function startExploration(game) {
  const s = game.state;
  const p = game.player;
  if (!p) return;

  s.phase = "exploration";
  s.exploreDuration = randRange(EXPLORE_MIN_SEC, EXPLORE_MAX_SEC);
  s.exploreT = s.exploreDuration;
  s.exploreThreat = 0;
  s.explorePicked = false;
  s.exploreCenterX = p.x;
  s.exploreCenterY = p.y;
  s.exploreAmbushCd = 2.4;
  s.spawnAcc = 0;

  // Make the transition explicit and clear.
  s.calmT = Math.max(s.calmT || 0, 2.4);
  s.eventType = "";
  s.eventT = 0;

  // Clear active pressure so exploration is truly a phase change.
  game.enemies.length = 0;
  game.enemyBullets.length = 0;

  const rewards = [
    { label: "SANCTUAIRE", reward: "heal" },
    { label: "ARMURERIE", reward: "upgrade2" },
    { label: "CAISSE", reward: "upgrade1" },
  ];
  for (let i = rewards.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = rewards[i];
    rewards[i] = rewards[j];
    rewards[j] = tmp;
  }

  const sites = [];
  const a0 = Math.random() * Math.PI * 2;
  for (let i = 0; i < EXPLORE_SITE_COUNT; i++) {
    const a = a0 + (i * Math.PI * 2) / EXPLORE_SITE_COUNT;
    const pos = findExploreSitePos(game, p.x, p.y, a, sites);
    sites.push({
      id: i + 1,
      x: pos.x,
      y: pos.y,
      taken: false,
      label: rewards[i]?.label || "POINT D'INTÉRÊT",
      reward: rewards[i]?.reward || "upgrade1",
    });
  }
  s.exploreSites = sites;

  game.floats.push({ x: p.x, y: p.y - 34, ttl: 1.5, text: `EXPLORATION ${Math.ceil(s.exploreDuration)}s` });
}

function giveExplorationReward(game, site) {
  const s = game.state;
  const p = game.player;
  const reward = site?.reward || "upgrade1";

  if (reward === "heal") {
    const before = p.hp || 0;
    const amount = 24 + ((s.wave || 1) * 2);
    p.hp = clamp(before + amount, 0, p.hpMax || before + amount);
    game.audio?.pickup?.("heal");
    game.floats.push({
      x: p.x,
      y: p.y - 24,
      ttl: 1.25,
      text: `+${Math.max(0, Math.round((p.hp || 0) - before))} HP`,
    });
    return;
  }

  if (reward === "upgrade2") {
    game.audio?.pickup?.("chest");
    game.openUpgradeMenu?.(2, "ARMURERIE");
    return;
  }

  game.audio?.pickup?.("buff");
  game.openUpgradeMenu?.(1, "CAISSE");
}

function endExploration(game, timeout = false) {
  const s = game.state;
  const p = game.player;

  if (timeout && !s.explorePicked) {
    const before = p.hp || 0;
    p.hp = clamp((p.hp || 0) + 12, 0, p.hpMax || 1);
    game.floats.push({ x: p.x, y: p.y - 30, ttl: 1.3, text: "EXPLORATION RATEE" });
    if ((p.hp || 0) > before) {
      game.audio?.pickup?.("heal");
      game.floats.push({ x: p.x, y: p.y - 18, ttl: 1.0, text: `+${Math.round((p.hp || 0) - before)} HP` });
    }
  } else {
    game.floats.push({ x: p.x, y: p.y - 30, ttl: 1.2, text: "COMBAT REPREND" });
  }

  s.phase = "combat";
  s.exploreT = 0;
  s.exploreDuration = 0;
  s.exploreThreat = 0;
  s.explorePicked = false;
  s.exploreSites = [];
  s.exploreAmbushCd = 0;
  s.calmT = Math.max(s.calmT || 0, 2.0);
}

function updateExploration(dt, game) {
  const s = game.state;
  if (s.phase !== "exploration") return false;

  s.exploreT = Math.max(0, (s.exploreT || 0) - dt);
  s.exploreAmbushCd = Math.max(0, (s.exploreAmbushCd || 0) - dt);
  if ((s.exploreT || 0) <= 0) {
    endExploration(game, !s.explorePicked);
    return true;
  }

  // If the run is paused (e.g. upgrade menu), keep timer ticking but freeze exploration logic.
  if (s.paused || s.upgradeMenu) return true;

  const dx = (game.player?.x || 0) - (s.exploreCenterX || 0);
  const dy = (game.player?.y || 0) - (s.exploreCenterY || 0);
  const dist = Math.hypot(dx, dy);
  const distN = clamp((dist - 32) / 360, 0, 1);
  const timeN = clamp(1 - (s.exploreT || 0) / Math.max(1, s.exploreDuration || 1), 0, 1);
  s.exploreThreat = clamp((distN * 0.62) + (timeN * 0.38), 0, 1);

  if (!s.explorePicked && Array.isArray(s.exploreSites)) {
    for (let i = 0; i < s.exploreSites.length; i++) {
      const site = s.exploreSites[i];
      if (!site || site.taken) continue;
      const sx = site.x - (game.player?.x || 0);
      const sy = site.y - (game.player?.y || 0);
      if ((sx * sx + sy * sy) <= EXPLORE_PICK_RADIUS * EXPLORE_PICK_RADIUS) {
        site.taken = true;
        s.explorePicked = true;
        giveExplorationReward(game, site);
        game.floats.push({ x: game.player.x, y: game.player.y - 34, ttl: 1.3, text: site.label || "POI" });
        // Leave a short breathing transition before combat resumes.
        s.exploreT = Math.min(s.exploreT || 0, 2.6);
        break;
      }
    }
  }

  // No regular wave spawn here; only scripted ambushes based on threat.
  if (!s.explorePicked && (s.exploreAmbushCd || 0) <= 0 && (s.exploreThreat || 0) >= 0.55) {
    const th = s.exploreThreat || 0;
    const count = 1 + (th >= 0.80 ? 2 : th >= 0.68 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      let kind = "fast";
      if ((s.wave || 1) >= 10 && Math.random() < 0.36) kind = "charger";
      else if ((s.wave || 1) >= 7 && Math.random() < 0.42) kind = "spitter";
      else if (Math.random() < 0.35) kind = "walker";
      spawnEnemyAtEdge(game, kind);
    }
    if (Math.random() < 0.55) {
      game.floats.push({ x: game.player.x, y: game.player.y - 24, ttl: 0.9, text: "EMBUSCADE" });
    }
    s.exploreAmbushCd = clamp(4.5 - th * 3.0, 1.3, 4.5);
  }

  return true;
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
    text: `BOSS #${game.state.bossCount} — ${bossLabel(bossType)}`,
  });
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

  // Exploration phase pauses regular wave pressure/spawn.
  if (updateExploration(dt, game)) return;

  // Boss pacing: based on enemies killed + cooldown.
  s.bossCooldownT = Math.max(0, (s.bossCooldownT || 0) - dt);
  const baseReq = 55 + (s.wave || 1) * 10;
  const grow = (s.bossCount || 0) * 14;
  s.bossKillsReq = Math.max(45, Math.round(baseReq + grow));
  s.nextBossKillsLeft = Math.max(0, (s.bossKillsReq || 0) - (s.bossKillsSince || 0));

  if (
    s.phase !== "exploration" &&
    !s.bossAlive &&
    !bossEntityAlive &&
    (s.wave || 0) >= EXPLORE_EVERY_WAVES &&
    (s.wave % EXPLORE_EVERY_WAVES) === 0 &&
    s.lastExploreWave !== s.wave
  ) {
    s.lastExploreWave = s.wave;
    startExploration(game);
    return;
  }

  // One-time warning when close (kills-based)
  if (!s.bossAlive && (s.bossCooldownT || 0) <= 0 && s.nextBossKillsLeft <= 12) {
    if (s._bossWarnKills !== s.bossKillsSince) {
      s._bossWarnKills = s.bossKillsSince;
      game.floats.push({ x: game.player.x, y: game.player.y - 30, ttl: 1.4, text: "BOSS BIENTÔT" });
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

  // boss trigger (kills + cooldown)
  if (!s.bossAlive && (s.bossCooldownT || 0) <= 0 && (s.bossKillsSince || 0) >= (s.bossKillsReq || 0)) {
    s.bossKillsSince = 0;
    spawnBoss(game);
  }

  // spawn pacing: slightly calmer during boss
  const bossFactor = s.bossAlive ? 0.55 : 1;
  const calmFactor = (s.calmT || 0) > 0 ? 0.12 : 1;
  const evFactor = s.eventType === "rush" && (s.eventT || 0) > 0 ? 1.55 : 1;
  const spawnCap = Math.min(22, 12.5 + Math.max(0, (s.wave || 1) - 16) * 0.35);
  const spawnRate =
    Math.max(1.1, Math.min(spawnCap, 1.4 + (s.wave || 1) * 0.24)) *
    bossFactor *
    calmFactor *
    evFactor *
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
      s.bossCooldownT = 10.0;
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
