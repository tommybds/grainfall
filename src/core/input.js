// Keyboard input using physical keys (`e.code`) so AZERTY/QWERTY works automatically.

export function createInput() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    // Analog movement in [-1..1] (used on touch)
    ax: 0,
    ay: 0,
  };
}

const CODE_DIR = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyA: "left",
  KeyS: "down",
  KeyD: "right",
};

// fallback
const KEY_DIR = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  z: "up",
  q: "left",
  W: "up",
  A: "left",
  S: "down",
  D: "right",
  Z: "up",
  Q: "left",
};

export function attachInputListeners({
  input,
  onTogglePause,
  onRestart,
  onStart,
}) {
  function onKeyDown(e) {
    const code = e.code;
    const key = e.key;

    if (code in CODE_DIR) {
      input[CODE_DIR[code]] = true;
      e.preventDefault();
      return;
    }
    if (key in KEY_DIR) {
      input[KEY_DIR[key]] = true;
      e.preventDefault();
      return;
    }

    if (key === "p" || key === "P") {
      onTogglePause?.();
      e.preventDefault();
      return;
    }
    if (key === "r" || key === "R") {
      onRestart?.();
      e.preventDefault();
      return;
    }
    if (key === "Enter") {
      onStart?.();
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    const code = e.code;
    const key = e.key;
    if (code in CODE_DIR) {
      input[CODE_DIR[code]] = false;
      e.preventDefault();
      return;
    }
    if (key in KEY_DIR) {
      input[KEY_DIR[key]] = false;
      e.preventDefault();
    }
  }

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}

