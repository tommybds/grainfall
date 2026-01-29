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
    achievements: {}, // id -> { unlocked: bool, unlockedAt: number|null }
  };
}

export function createRunStats() {
  return {
    kills: 0,
    killsByWeapon: {},
    killsByEnemy: {},
  };
}

export function recordKill({ run, lifetime, weaponKind, enemyKind }) {
  if (!run || !lifetime) return;
  run.kills += 1;
  lifetime.killsTotal += 1;
  inc(run.killsByWeapon, weaponKind || "unknown", 1);
  inc(run.killsByEnemy, enemyKind || "unknown", 1);
  inc(lifetime.killsByWeapon, weaponKind || "unknown", 1);
  inc(lifetime.killsByEnemy, enemyKind || "unknown", 1);
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
  { id: "first_kill", title: "First Blood", desc: "Faire 1 kill (total)", kind: "killsTotal", target: 1 },
  { id: "boss_slayer", title: "Boss Slayer", desc: "Tuer 1 boss (total)", kind: "enemy", key: "boss", target: 1 },
  { id: "laser_100", title: "Laser Enjoyer", desc: "100 kills avec Laser", kind: "weapon", key: "laser", target: 100 },
  { id: "survive_5m", title: "Survivor", desc: "Survivre 5 minutes (best)", kind: "bestTime", target: 300 },
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
    else if (a.kind === "weapon") progress = lifetime.killsByWeapon?.[a.key] || 0;
    else if (a.kind === "enemy") progress = lifetime.killsByEnemy?.[a.key] || 0;

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

