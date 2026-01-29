function inc(map, key, n = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + n;
}

export function createLifetimeStats() {
  return {
    v: 1,
    runs: 0,
    totalTime: 0,
    bestTime: 0,
    bestWave: 0,
    bestKills: 0,
    killsTotal: 0,
    killsByWeapon: {},
    killsByEnemy: {},
    // pickups / economy
    pickupsTotal: 0,
    pickupsByKind: {},
    coinsPicked: 0,
    coinsValueTotal: 0,
    achievements: {}, // id -> { unlocked: bool, unlockedAt: number|null }
  };
}

export function createRunStats() {
  return {
    kills: 0,
    killsByWeapon: {},
    killsByEnemy: {},
    pickupsTotal: 0,
    pickupsByKind: {},
    coinsPicked: 0,
    coinsValueTotal: 0,
  };
}

export function recordKill({ run, lifetime, weaponKind, enemyKind, enemyBossType }) {
  if (!run || !lifetime) return;
  run.kills += 1;
  lifetime.killsTotal += 1;
  inc(run.killsByWeapon, weaponKind || "unknown", 1);
  inc(run.killsByEnemy, enemyKind || "unknown", 1);
  inc(lifetime.killsByWeapon, weaponKind || "unknown", 1);
  inc(lifetime.killsByEnemy, enemyKind || "unknown", 1);
  // Boss subtypes (for boss variety achievements)
  if (enemyKind === "boss" && enemyBossType) {
    const k = `boss:${enemyBossType}`;
    inc(run.killsByEnemy, k, 1);
    inc(lifetime.killsByEnemy, k, 1);
  }
}

export function recordRunEnd({ run, lifetime, timeSec, wave, kills }) {
  if (!run || !lifetime) return;
  lifetime.runs += 1;
  lifetime.totalTime += Math.max(0, timeSec || 0);
  lifetime.bestTime = Math.max(lifetime.bestTime || 0, timeSec || 0);
  lifetime.bestWave = Math.max(lifetime.bestWave || 0, wave || 0);
  lifetime.bestKills = Math.max(lifetime.bestKills || 0, kills || 0);
}

export const ACHIEVEMENT_DEFS = [
  // basics
  { id: "first_kill", title: "First Blood", desc: "Faire 1 kill (total)", kind: "killsTotal", target: 1 },
  { id: "kills_100", title: "Centurion", desc: "Faire 100 kills (total)", kind: "killsTotal", target: 100 },
  { id: "kills_1000", title: "Grinder", desc: "Faire 1000 kills (total)", kind: "killsTotal", target: 1000 },

  // bosses
  { id: "boss_slayer", title: "Boss Slayer", desc: "Tuer 1 boss (total)", kind: "enemy", key: "boss", target: 1 },
  { id: "boss_5", title: "Boss Hunter", desc: "Tuer 5 boss (total)", kind: "enemy", key: "boss", target: 5 },
  { id: "boss_20", title: "Boss Nemesis", desc: "Tuer 20 boss (total)", kind: "enemy", key: "boss", target: 20 },
  { id: "boss_rager", title: "Rager Down", desc: "Tuer 1 boss RAGER", kind: "enemy", key: "boss:rager", target: 1 },
  { id: "boss_artillery", title: "Artillery Down", desc: "Tuer 1 boss ARTILLERY", kind: "enemy", key: "boss:artillery", target: 1 },
  { id: "boss_titan", title: "Titan Down", desc: "Tuer 1 boss TITAN", kind: "enemy", key: "boss:titan", target: 1 },
  { id: "boss_summoner", title: "Summoner Down", desc: "Tuer 1 boss SUMMONER", kind: "enemy", key: "boss:summoner", target: 1 },

  // survival / progression
  { id: "survive_5m", title: "Survivor", desc: "Survivre 5 minutes (best)", kind: "bestTime", target: 300 },
  { id: "survive_10m", title: "Hard to Kill", desc: "Survivre 10 minutes (best)", kind: "bestTime", target: 600 },
  { id: "survive_20m", title: "Unbreakable", desc: "Survivre 20 minutes (best)", kind: "bestTime", target: 1200 },
  { id: "best_wave_10", title: "Wave 10", desc: "Atteindre la wave 10 (best)", kind: "bestWave", target: 10 },
  { id: "best_wave_20", title: "Wave 20", desc: "Atteindre la wave 20 (best)", kind: "bestWave", target: 20 },
  { id: "best_kills_200", title: "200 Kills", desc: "Atteindre 200 kills sur une run (best)", kind: "bestKills", target: 200 },
  { id: "runs_10", title: "Regular", desc: "Jouer 10 runs", kind: "runs", target: 10 },

  // weapons (mastery)
  { id: "laser_100", title: "Laser Enjoyer", desc: "100 kills avec Laser", kind: "weapon", key: "laser", target: 100 },
  { id: "pistol_250", title: "Pistol Main", desc: "250 kills avec Pistol", kind: "weapon", key: "pistol", target: 250 },
  { id: "shotgun_250", title: "Shotgun Main", desc: "250 kills avec Shotgun", kind: "weapon", key: "shotgun", target: 250 },
  { id: "lance_250", title: "Lance Main", desc: "250 kills avec Lance", kind: "weapon", key: "lance", target: 250 },
  { id: "flame_250", title: "Pyro", desc: "250 kills avec Flamethrower", kind: "weapon", key: "flame", target: 250 },
  { id: "mine_250", title: "Demolition", desc: "250 kills avec Mine", kind: "weapon", key: "mine", target: 250 },
  { id: "boomerang_250", title: "Return To Sender", desc: "250 kills avec Boomerang", kind: "weapon", key: "boomerang", target: 250 },
  { id: "tesla_250", title: "Overcharge", desc: "250 kills avec Tesla", kind: "weapon", key: "tesla", target: 250 },
  { id: "turret_250", title: "Engineer", desc: "250 kills via Turret", kind: "weapon", key: "turret", target: 250 },

  // enemies (focus)
  { id: "charger_200", title: "Anti-Rush", desc: "Tuer 200 chargeurs", kind: "enemy", key: "charger", target: 200 },
  { id: "exploder_200", title: "Bomb Squad", desc: "Tuer 200 exploseurs", kind: "enemy", key: "exploder", target: 200 },
  { id: "summoner_200", title: "No Adds", desc: "Tuer 200 invocateurs", kind: "enemy", key: "summoner", target: 200 },
  { id: "shield_200", title: "Shield Breaker", desc: "Tuer 200 shields", kind: "enemy", key: "shield", target: 200 },

  // economy / pickups
  { id: "coins_500", title: "Coin Collector", desc: "Ramasser 500 pièces XP", kind: "coinsPicked", target: 500 },
  { id: "coins_2000", title: "Rich", desc: "Ramasser 2000 pièces XP", kind: "coinsPicked", target: 2000 },
  { id: "heals_50", title: "Medic", desc: "Ramasser 50 heals", kind: "pickup", key: "heal", target: 50 },
  { id: "chests_20", title: "Treasure Hunter", desc: "Ouvrir 20 chests", kind: "pickup", key: "chest", target: 20 },
  { id: "buffs_50", title: "Buff Addict", desc: "Ramasser 50 buffs", kind: "pickup", key: "buff", target: 50 },
];

export function updateAchievements(lifetime) {
  if (!lifetime) return;
  const now = Date.now();
  for (let i = 0; i < ACHIEVEMENT_DEFS.length; i++) {
    const a = ACHIEVEMENT_DEFS[i];
    const st = lifetime.achievements[a.id] || { unlocked: false, unlockedAt: null };
    if (st.unlocked) {
      lifetime.achievements[a.id] = st;
      continue;
    }
    let progress = 0;
    if (a.kind === "killsTotal") progress = lifetime.killsTotal || 0;
    else if (a.kind === "bestTime") progress = lifetime.bestTime || 0;
    else if (a.kind === "bestWave") progress = lifetime.bestWave || 0;
    else if (a.kind === "bestKills") progress = lifetime.bestKills || 0;
    else if (a.kind === "runs") progress = lifetime.runs || 0;
    else if (a.kind === "weapon") progress = lifetime.killsByWeapon?.[a.key] || 0;
    else if (a.kind === "enemy") progress = lifetime.killsByEnemy?.[a.key] || 0;
    else if (a.kind === "coinsPicked") progress = lifetime.coinsPicked || 0;
    else if (a.kind === "pickup") progress = lifetime.pickupsByKind?.[a.key] || 0;

    if (progress >= a.target) {
      lifetime.achievements[a.id] = { unlocked: true, unlockedAt: now };
    } else {
      lifetime.achievements[a.id] = st;
    }
  }
}

export function formatTimeMMSS(t) {
  const s = Math.max(0, Math.floor(t || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

