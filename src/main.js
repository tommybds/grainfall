import { createGame, runGameLoop } from "./game/game.js";
import { MAPS } from "./game/maps.js";
import { DIFFICULTIES } from "./game/difficulty.js";
import { HEROES } from "./game/heroes.js";
import { loadSignedLocal, saveSignedLocal } from "./game/storage.js";
import { MUSIC_SCORES, MUSIC_SCORE_IDS } from "./audio/musicScores.js";

const APP_VERSION = (() => {
  try {
    // Replaced at build time (esbuild define). In dev (served from src/), fallback to "dev".
    return __APP_VERSION__;
  } catch (_e) {
    return "dev";
  }
})();

const appVersionEl = document.getElementById("appVersion");
if (appVersionEl) appVersionEl.textContent = `v${APP_VERSION}`;
const menuVersionEl = document.getElementById("menuVersion");
if (menuVersionEl) menuVersionEl.textContent = `v${APP_VERSION}`;

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById("game");
/** @type {CanvasRenderingContext2D} */
const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
const hudEl = document.getElementById("hud");
const overlayEl = document.getElementById("overlay");

const game = createGame({ canvas, ctx, hudEl, overlayEl });
game.goToMenu();
runGameLoop(game);

// --- Accessibility settings ---
const btnColorblind = document.getElementById("btnColorblind");
const btnColorblindPause = document.getElementById("btnColorblindPause");

function applyColorblind(enabled) {
  game.state.colorblind = !!enabled;
  document.body.dataset.colorblind = enabled ? "true" : "false";
  localStorage.setItem("sv_colorblind", enabled ? "1" : "0");
  const label = `Daltonien: ${enabled ? "ON" : "OFF"}`;
  if (btnColorblind) btnColorblind.textContent = label;
  if (btnColorblindPause) btnColorblindPause.textContent = label;
  btnColorblind?.classList?.toggle("isOn", !!enabled);
  btnColorblindPause?.classList?.toggle("isOn", !!enabled);
}

try {
  applyColorblind(localStorage.getItem("sv_colorblind") === "1");
} catch {
  // ignore
}

btnColorblind?.addEventListener("click", () => applyColorblind(!game.state.colorblind));
btnColorblindPause?.addEventListener("click", () => applyColorblind(!game.state.colorblind));

// --- Audio settings (signed localStorage) ---
const SETTINGS_KEY = "settings_v1";
const DEFAULT_SETTINGS = {
  muted: false,
  musicMode: false,
  // "random" means: pick a random score at run start / when enabling music.
  musicScoreChoice: "random",
  // last actually selected score id (used when choice is random)
  musicScoreId: MUSIC_SCORE_IDS[0] || "a_minor_chill",
};

/** @type {{muted:boolean, musicMode:boolean, musicScoreChoice:string, musicScoreId:string}} */
let settings = { ...DEFAULT_SETTINGS };

function scoreLabel(id) {
  return (MUSIC_SCORES[id] && MUSIC_SCORES[id].name) || id || "?";
}

function applySettingsToAudio() {
  game.audio?.setMuted?.(!!settings.muted);
  game.audio?.setMode?.(settings.musicMode ? "music" : "sfx");
  // Apply current/last score immediately (random picks are handled on enable/start).
  if (settings.musicScoreId) game.audio?.setScore?.(settings.musicScoreId);
}

function updateMusicButtons() {
  const onOff = settings.musicMode ? "ON" : "OFF";
  const tMode = `MUSIQUE: ${onOff}`;
  const bStart = document.getElementById("btnMusicModeStart");
  const bPause = document.getElementById("btnMusicModePause");
  bStart?.replaceChildren(document.createTextNode(tMode));
  bPause?.replaceChildren(document.createTextNode(tMode));
  bStart?.classList?.toggle("isOn", !!settings.musicMode);
  bPause?.classList?.toggle("isOn", !!settings.musicMode);

  const selStart = document.getElementById("selMusicScoreStart");
  const selPause = document.getElementById("selMusicScorePause");
  // When music is off, disable the selector to reduce ambiguity.
  if (selStart) selStart.disabled = !settings.musicMode;
  if (selPause) selPause.disabled = !settings.musicMode;
  selStart?.classList?.toggle("isOn", !!settings.musicMode);
  selPause?.classList?.toggle("isOn", !!settings.musicMode);
}

function pickRandomScore(exclude) {
  const ids = MUSIC_SCORE_IDS;
  if (!ids || !ids.length) return null;
  const pool = ids.length > 1 ? ids.filter((id) => id !== exclude) : ids;
  return pool[(Math.random() * pool.length) | 0] || ids[0];
}

function ensureMusicScoreSelectOptions() {
  const sels = [document.getElementById("selMusicScoreStart"), document.getElementById("selMusicScorePause")].filter(Boolean);
  if (!sels.length) return;
  for (const sel of sels) {
    // Build options only once.
    if (sel.dataset?.built === "1") continue;
    sel.replaceChildren();
    const optRnd = document.createElement("option");
    optRnd.value = "random";
    optRnd.textContent = "Aléatoire (au démarrage)";
    sel.appendChild(optRnd);
    for (const id of MUSIC_SCORE_IDS) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = scoreLabel(id);
      sel.appendChild(opt);
    }
    sel.dataset.built = "1";
  }
}

function syncMusicScoreSelects() {
  const v = settings.musicScoreChoice || "random";
  const sels = [document.getElementById("selMusicScoreStart"), document.getElementById("selMusicScorePause")].filter(Boolean);
  for (const sel of sels) sel.value = v;
}

function applyMusicChoiceOnEnableOrStart() {
  if (!settings.musicMode) return;
  const choice = settings.musicScoreChoice || "random";
  if (choice === "random") {
    const pick = pickRandomScore(settings.musicScoreId);
    if (pick) {
      settings.musicScoreId = pick;
      game.audio?.setScore?.(pick);
      persistSettings();
    }
    return;
  }
  if (MUSIC_SCORES[choice]) {
    settings.musicScoreId = choice;
    game.audio?.setScore?.(choice);
    persistSettings();
  }
}

function persistSettings() {
  try {
    saveSignedLocal(SETTINGS_KEY, settings);
  } catch {
    // ignore
  }
}

loadSignedLocal(SETTINGS_KEY, DEFAULT_SETTINGS).then((st) => {
  settings = { ...DEFAULT_SETTINGS, ...(st || {}) };
  // Migration: legacy boolean musicRandom -> musicScoreChoice
  if (!settings.musicScoreChoice) {
    settings.musicScoreChoice = (st && st.musicRandom) ? "random" : (settings.musicScoreId || "random");
  }
  if (settings.musicScoreChoice !== "random" && !MUSIC_SCORES[settings.musicScoreChoice]) {
    settings.musicScoreChoice = "random";
  }
  if (!MUSIC_SCORES[settings.musicScoreId]) settings.musicScoreId = DEFAULT_SETTINGS.musicScoreId;
  applySettingsToAudio();
  ensureMusicScoreSelectOptions();
  syncMusicScoreSelects();
  updateMusicButtons();
  const btnSoundTop = document.getElementById("btnSoundTop");
  if (btnSoundTop) btnSoundTop.textContent = settings.muted ? "SND" : "MUTE";
});

// If random is enabled, pick a new score at each run start.
// We wrap start here so it also works for keyboard/touch start.
{
  const origStart = game.start?.bind(game);
  if (origStart) {
    game.start = () => {
      applyMusicChoiceOnEnableOrStart();
      origStart();
    };
  }
}

// Unlock audio on first user gesture (required on mobile)
const unlockOnce = () => {
  game.audio?.unlock?.();
  // start unmuted after first gesture (user can toggle)
  game.audio?.setMuted?.(!!settings.muted);
};
window.addEventListener("pointerdown", unlockOnce, { passive: true, once: true });
window.addEventListener("keydown", unlockOnce, { passive: true, once: true });
window.addEventListener("touchstart", unlockOnce, { passive: true, once: true });

// --- Menu wiring (map + difficulty + hero) ---
function wireGroup({ selector, datasetKey, applyToGame, keys, enabledWhen }) {
  const btns = Array.from(document.querySelectorAll(selector));
  let idx = 0;
  const initialIdx = Math.max(
    0,
    btns.findIndex((b) => b.getAttribute("aria-selected") === "true"),
  );

  function applyByIndex(i) {
    idx = Math.max(0, Math.min(btns.length - 1, i));
    for (let k = 0; k < btns.length; k++) btns[k].setAttribute("aria-selected", k === idx ? "true" : "false");
    const id = btns[idx]?.dataset?.[datasetKey];
    if (id) applyToGame(id);
  }

  function applyById(id) {
    const i = btns.findIndex((b) => b.dataset?.[datasetKey] === id);
    if (i >= 0) applyByIndex(i);
  }

  function setEnabled(enabled) {
    for (let i = 0; i < btns.length; i++) btns[i].disabled = !enabled;
  }

  btns.forEach((b, i) => b.addEventListener("click", () => applyByIndex(i)));
  applyByIndex(initialIdx);

  window.addEventListener(
    "keydown",
    (e) => {
      if (enabledWhen && !enabledWhen()) return;
      const i = keys?.[e.key];
      if (i === undefined) return;
      applyByIndex(i);
      e.preventDefault();
    },
    { passive: false },
  );

  return { applyByIndex, applyById, setEnabled, btns };
}

function weaponLabel(id) {
  if (id === "pistol") return "Pistol";
  if (id === "shotgun") return "Shotgun";
  if (id === "lance") return "Lance";
  if (id === "flame") return "Flamethrower";
  if (id === "laser") return "Laser";
  if (id === "mine") return "Mine";
  if (id === "boomerang") return "Boomerang";
  if (id === "tesla") return "Tesla";
  if (id === "turret") return "Turret";
  return id;
}

function updateHeroCard(heroId) {
  const h = HEROES.find((x) => x.id === heroId) || HEROES[0];
  const elName = document.getElementById("heroName");
  const elDesc = document.getElementById("heroDesc");
  const elHp = document.getElementById("heroHp");
  const elSpd = document.getElementById("heroSpd");
  const elRange = document.getElementById("heroRange");
  const elWeps = document.getElementById("heroWeps");
  const elSkin = document.getElementById("heroSkin");

  if (elName) elName.textContent = h.name;
  if (elDesc) elDesc.textContent = h.desc;
  if (elHp) elHp.textContent = String(h.hpMax);
  if (elSpd) elSpd.textContent = String(h.speed);
  if (elRange) elRange.textContent = String(h.range);
  if (elWeps) elWeps.textContent = (h.startWeapons || []).map(weaponLabel).join(" + ");
  if (elSkin) elSkin.textContent = h.glyph || "@";
}

const diffGroup = wireGroup({
  selector: ".diffBtn",
  datasetKey: "diff",
  applyToGame: (id) => (game.selectedDifficultyId = id),
  keys: { "4": 0, "5": 1, "6": 2 },
  enabledWhen: () => !game.state.running,
});

const mapGroup = wireGroup({
  selector: ".mapBtn",
  datasetKey: "map",
  applyToGame: (id) => {
    game.selectedMapId = id;
    // Apply theme immediately so map preview updates in the menu
    game.theme = (MAPS.find((m) => m.id === id) || MAPS[0]).theme;
    // Hell forces Hard (sync UI + lock difficulty buttons)
    if (id === "hell") {
      diffGroup.applyById("hard");
      diffGroup.setEnabled(false);
    } else {
      diffGroup.setEnabled(true);
    }
  },
  keys: { "1": 0, "2": 1, "3": 2 },
  enabledWhen: () => !game.state.running,
});

const heroGroup = wireGroup({
  selector: ".heroBtn",
  datasetKey: "hero",
  applyToGame: (id) => {
    game.selectedHeroId = id;
    updateHeroCard(id);
  },
  keys: { "7": 0, "0": 1, "8": 2, "9": 3 },
  enabledWhen: () => !game.state.running,
});

// Upgrade menu (level-up choices)
const btnUp0 = document.getElementById("btnUp0");
const btnUp1 = document.getElementById("btnUp1");
const btnUp2 = document.getElementById("btnUp2");
btnUp0?.addEventListener("click", () => game.chooseUpgrade?.(0));
btnUp1?.addEventListener("click", () => game.chooseUpgrade?.(1));
btnUp2?.addEventListener("click", () => game.chooseUpgrade?.(2));

window.addEventListener(
  "keydown",
  (e) => {
    if (!game.state?.upgradeMenu) return;

    function setCursor(next) {
      const n = Math.max(0, Math.min(2, next | 0));
      game.state.upgradeCursor = n;
      document.getElementById(`btnUp${n}`)?.focus?.();
    }

    const code = e.code;
    const key = e.key;
    const cur = game.state.upgradeCursor || 0;

    // Direct pick (keeps existing behavior)
    if (key === "1") {
      setCursor(0);
      game.chooseUpgrade?.(0);
      e.preventDefault();
      return;
    }
    if (key === "2") {
      setCursor(1);
      game.chooseUpgrade?.(1);
      e.preventDefault();
      return;
    }
    if (key === "3") {
      setCursor(2);
      game.chooseUpgrade?.(2);
      e.preventDefault();
      return;
    }

    // Navigate (vertical)
    if (code === "ArrowUp" || code === "KeyW" || code === "KeyZ") {
      setCursor(cur - 1);
      e.preventDefault();
      return;
    }
    if (code === "ArrowDown" || code === "KeyS") {
      setCursor(cur + 1);
      e.preventDefault();
      return;
    }

    // Confirm
    if (key === "Enter" || code === "Space") {
      game.chooseUpgrade?.(cur);
      e.preventDefault();
      return;
    }
  },
  { passive: false },
);

// --- Pause/End menu buttons (touch-friendly) ---
const btnStart = document.getElementById("btnStart");
const btnResume = document.getElementById("btnResume");
const btnRestart = document.getElementById("btnRestart");
const btnMenu = document.getElementById("btnMenu");
const btnEndRestart = document.getElementById("btnEndRestart");
const btnEndMenu = document.getElementById("btnEndMenu");

btnStart?.addEventListener("click", () => game.start());
btnResume?.addEventListener("click", () => game.setPaused(false));
// "Recommencer" from pause returns to the start menu (so you can re-pick map/diff/hero)
btnRestart?.addEventListener("click", () => game.goToMenu());
btnMenu?.addEventListener("click", () => game.goToMenu());
btnEndRestart?.addEventListener("click", () => game.start());
btnEndMenu?.addEventListener("click", () => game.goToMenu());

// --- Stats / Achievements menu ---
const btnStats = document.getElementById("btnStats");
const btnStatsPause = document.getElementById("btnStatsPause");
const btnStatsBack = document.getElementById("btnStatsBack");

function openStatsMenu() {
  game.state.statsMenu = true;
  // keep overlay visible
  game.overlayEl.style.opacity = "1";
  game.overlayEl.dataset.active = "true";
  if (game.state.running) game.state.paused = true;
}

function closeStatsMenu() {
  game.state.statsMenu = false;
}

btnStats?.addEventListener("click", openStatsMenu);
btnStatsPause?.addEventListener("click", openStatsMenu);
btnStatsBack?.addEventListener("click", closeStatsMenu);

window.addEventListener(
  "keydown",
  (e) => {
    if (!game.state?.statsMenu) return;
    if (e.key === "Escape") {
      closeStatsMenu();
      e.preventDefault();
    }
  },
  { passive: false },
);

// --- Tutorial menu ---
const btnTutorial = document.getElementById("btnTutorial");
const btnTutorialBack = document.getElementById("btnTutorialBack");

function openTutorialMenu() {
  game.state.tutorialMenu = true;
  game.overlayEl.style.opacity = "1";
  game.overlayEl.dataset.active = "true";
  if (game.state.running) game.state.paused = true;
}

function closeTutorialMenu() {
  game.state.tutorialMenu = false;
}

btnTutorial?.addEventListener("click", openTutorialMenu);
btnTutorialBack?.addEventListener("click", closeTutorialMenu);

window.addEventListener(
  "keydown",
  (e) => {
    if (!game.state?.tutorialMenu) return;
    if (e.key === "Escape") {
      closeTutorialMenu();
      e.preventDefault();
    }
  },
  { passive: false },
);

// Mobile-friendly pause button in the top bar
const btnPauseTop = document.getElementById("btnPauseTop");
btnPauseTop?.addEventListener("click", () => game.togglePause());

const btnSoundTop = document.getElementById("btnSoundTop");
btnSoundTop?.addEventListener("click", () => {
  game.audio?.unlock?.();
  const next = !game.audio?.muted;
  game.audio?.setMuted?.(next);
  btnSoundTop.textContent = next ? "SND" : "MUTE";
  settings.muted = !!next;
  persistSettings();
});

const btnDashTop = document.getElementById("btnDashTop");
btnDashTop?.addEventListener("click", () => game.requestDash?.());

// --- Musical weapons option ---
function toggleMusicMode() {
  game.audio?.unlock?.();
  const next = !settings.musicMode;
  settings.musicMode = next;
  // When enabling, apply the current choice (random will pick now).
  if (next) applyMusicChoiceOnEnableOrStart();
  game.audio?.setMode?.(next ? "music" : "sfx");
  updateMusicButtons();
  persistSettings();
}

document.getElementById("btnMusicModeStart")?.addEventListener("click", toggleMusicMode);
document.getElementById("btnMusicModePause")?.addEventListener("click", toggleMusicMode);
updateMusicButtons();

// Music score dropdown (default: random)
ensureMusicScoreSelectOptions();
syncMusicScoreSelects();
document.getElementById("selMusicScoreStart")?.addEventListener("change", (e) => {
  const v = e?.target?.value || "random";
  settings.musicScoreChoice = v;
  syncMusicScoreSelects();
  // If user explicitly picks a concrete score while music is on, apply immediately.
  if (v !== "random" && MUSIC_SCORES[v]) {
    settings.musicScoreId = v;
    game.audio?.setScore?.(v);
  }
  persistSettings();
});
document.getElementById("selMusicScorePause")?.addEventListener("change", (e) => {
  const v = e?.target?.value || "random";
  settings.musicScoreChoice = v;
  syncMusicScoreSelects();
  if (v !== "random" && MUSIC_SCORES[v]) {
    settings.musicScoreId = v;
    game.audio?.setScore?.(v);
  }
  persistSettings();
});

// --- Debug overlay (toggle with K) ---
{
  const debugEl = document.getElementById("debugOverlay");
  let on = false;
  function renderDebug() {
    if (!on || !debugEl) return;
    const a = game.audio?.getDebugInfo?.() || {};
    const s = game.state || {};
    const p = game.player || {};
    const weps = (p.weapons || []).map((w) => `${w.id}:${w.lvl || 1}`).join("  ") || "-";
    const choice = settings.musicScoreChoice || "random";
    const chosen = a.scoreId ? scoreLabel(a.scoreId) : "-";
    const layers = a.layers ? `${a.layers.count} (pad:${a.layers.pad ? "1" : "0"} bass:${a.layers.bass ? "1" : "0"} hat:${a.layers.hat ? "1" : "0"})` : "-";
    const lim = a.limiter || null;
    const voices = a.voices
      ? Object.entries(a.voices)
          .filter(([, v]) => !!v)
          .map(([k]) => k)
          .join(", ")
      : "-";
    let drops = "-";
    if (lim) {
      const dpk = lim.dropPerKind || {};
      const top = Object.entries(dpk)
        .sort((aa, bb) => (bb[1] || 0) - (aa[1] || 0))
        .slice(0, 4)
        .map(([k, v]) => `${k}:${v}`)
        .join("  ");
      drops = top || "-";
    }
    debugEl.textContent =
      [
        `DEBUG  (toggle: K)`,
        ``,
        `run: ${s.running ? "on" : "off"}   paused: ${s.paused ? "yes" : "no"}   t: ${(s.t || 0).toFixed(1)}s`,
        `wave: ${s.wave || 1}   kills: ${s.kills || 0}   enemies: ${(game.enemies && game.enemies.length) || 0}`,
        `bullets: ${(game.bullets && game.bullets.length) || 0}   enemyBullets: ${(game.enemyBullets && game.enemyBullets.length) || 0}`,
        ``,
        `audio: mode=${a.mode || "-"}   muted=${game.audio?.muted ? "yes" : "no"}`,
        `music: choice=${choice}   playing=${chosen}`,
        `intensity: ${typeof a.intensity === "number" ? a.intensity.toFixed(2) : "-" }   layers: ${layers}`,
        `voices: ${voices}`,
        lim
          ? `music: notes=${lim.notesScheduled}  shots=${lim.shotAttempts}   max/step=${lim.maxPerStep}  used=${lim.stepTrigCount}  drop(kind)=${lim.dropKind}  drop(budget)=${lim.dropBudget}`
          : `limiter: -`,
        lim ? `drops(top): ${drops}` : ``,
        ``,
        `weapons: ${weps}`,
      ].join("\n");
  }
  if (debugEl) {
    setInterval(renderDebug, 140);
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "KeyK") {
          on = !on;
          debugEl.hidden = !on;
          if (on) renderDebug();
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }
}

// Note: initial selection is taken from aria-selected="true" in the HTML buttons.
updateHeroCard(game.selectedHeroId);