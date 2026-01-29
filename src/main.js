import { createGame, runGameLoop } from "./game/game.js";
import { MAPS } from "./game/maps.js";
import { DIFFICULTIES } from "./game/difficulty.js";
import { HEROES } from "./game/heroes.js";

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById("game");
/** @type {CanvasRenderingContext2D} */
const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
const hudEl = document.getElementById("hud");
const overlayEl = document.getElementById("overlay");

const game = createGame({ canvas, ctx, hudEl, overlayEl });
game.goToMenu();
runGameLoop(game);

// Unlock audio on first user gesture (required on mobile)
const unlockOnce = () => {
  game.audio?.unlock?.();
  // start unmuted after first gesture (user can toggle)
  game.audio?.setMuted?.(false);
};
window.addEventListener("pointerdown", unlockOnce, { passive: true, once: true });
window.addEventListener("keydown", unlockOnce, { passive: true, once: true });
window.addEventListener("touchstart", unlockOnce, { passive: true, once: true });

// --- Menu wiring (map + difficulty + hero) ---
function wireGroup({ selector, datasetKey, applyToGame, keys }) {
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
});

const heroGroup = wireGroup({
  selector: ".heroBtn",
  datasetKey: "hero",
  applyToGame: (id) => {
    game.selectedHeroId = id;
    updateHeroCard(id);
  },
  keys: { "7": 0, "8": 1, "9": 2 },
});

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

// Mobile-friendly pause button in the top bar
const btnPauseTop = document.getElementById("btnPauseTop");
btnPauseTop?.addEventListener("click", () => game.togglePause());

const btnSoundTop = document.getElementById("btnSoundTop");
btnSoundTop?.addEventListener("click", () => {
  game.audio?.unlock?.();
  const next = !game.audio?.muted;
  game.audio?.setMuted?.(next);
  btnSoundTop.textContent = next ? "SND" : "MUTE";
});

// Note: initial selection is taken from aria-selected="true" in the HTML buttons.
updateHeroCard(game.selectedHeroId);