import { clamp } from "./math.js";

// Minimal virtual joystick (no extra DOM):
// - drag on left/bottom area to move
// - keeps game usable on phone without covering screen

export function attachTouchJoystick({ canvas, viewport, input }) {
  const joy = {
    active: false,
    id: -1,
    sx: 0,
    sy: 0,
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
  };

  // Expose joystick state for rendering (thumb indicator)
  input.joy = joy;

  function resetInput() {
    input.up = false;
    input.down = false;
    input.left = false;
    input.right = false;
    input.ax = 0;
    input.ay = 0;
  }

  function inJoystickZone(x, y) {
    // Use CSS size (not zoomed logical size) so the zone stays consistent.
    const w = viewport.cssW || viewport.w;
    const h = viewport.cssH || viewport.h;
    return x < w * 0.55 && y > h * 0.45;
  }

  function applyVec(dx, dy) {
    // Convert drag into analog vector (with deadzone + smoothing)
    const dead = 10; // px
    const maxR = 70; // px
    const len = Math.hypot(dx, dy);

    let tx = 0;
    let ty = 0;
    if (len > dead) {
      // circular clamp
      const s = len > maxR ? maxR / len : 1;
      tx = dx * s;
      ty = dy * s;
    }

    // normalized analog values in [-1..1]
    const targetAx = tx / maxR;
    const targetAy = ty / maxR;

    // light smoothing so movement feels less "brutal"
    const k = 0.35;
    input.ax = input.ax * (1 - k) + targetAx * k;
    input.ay = input.ay * (1 - k) + targetAy * k;

    // keep digital flags for compatibility (UI/logic)
    const th = 0.35;
    input.left = input.ax < -th;
    input.right = input.ax > th;
    input.up = input.ay < -th;
    input.down = input.ay > th;
  }

  function onDown(e) {
    if (e.pointerType && e.pointerType !== "touch") return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!inJoystickZone(x, y)) return;

    joy.active = true;
    joy.id = e.pointerId;
    joy.sx = x;
    joy.sy = y;
    joy.x = x;
    joy.y = y;
    joy.dx = 0;
    joy.dy = 0;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    resetInput();
    e.preventDefault();
  }

  function onMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    joy.x = x;
    joy.y = y;
    // keep a circular joystick radius
    const dx0 = x - joy.sx;
    const dy0 = y - joy.sy;
    const len = Math.hypot(dx0, dy0) || 1;
    const maxR = 70;
    const s = len > maxR ? maxR / len : 1;
    joy.dx = dx0 * s;
    joy.dy = dy0 * s;
    applyVec(joy.dx, joy.dy);
    e.preventDefault();
  }

  function onUp(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    joy.active = false;
    joy.id = -1;
    joy.dx = 0;
    joy.dy = 0;
    resetInput();
    e.preventDefault();
  }

  canvas.addEventListener("pointerdown", onDown, { passive: false });
  canvas.addEventListener("pointermove", onMove, { passive: false });
  canvas.addEventListener("pointerup", onUp, { passive: false });
  canvas.addEventListener("pointercancel", onUp, { passive: false });

  // iOS Safari/Chrome: pointer events can be flaky depending on settings.
  // Provide a touch fallback.
  function txy(touch) {
    const rect = canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function onTouchStart(ev) {
    if (!ev.changedTouches || ev.changedTouches.length === 0) return;
    const touch = ev.changedTouches[0];
    const { x, y } = txy(touch);
    if (!inJoystickZone(x, y)) return;
    joy.active = true;
    joy.id = touch.identifier;
    joy.sx = x;
    joy.sy = y;
    joy.x = x;
    joy.y = y;
    joy.dx = 0;
    joy.dy = 0;
    resetInput();
    ev.preventDefault();
  }

  function onTouchMove(ev) {
    if (!joy.active) return;
    const t = Array.from(ev.changedTouches || []).find((tt) => tt.identifier === joy.id);
    if (!t) return;
    const { x, y } = txy(t);
    joy.x = x;
    joy.y = y;
    const dx0 = x - joy.sx;
    const dy0 = y - joy.sy;
    const len = Math.hypot(dx0, dy0) || 1;
    const maxR = 70;
    const s = len > maxR ? maxR / len : 1;
    joy.dx = dx0 * s;
    joy.dy = dy0 * s;
    applyVec(joy.dx, joy.dy);
    ev.preventDefault();
  }

  function onTouchEnd(ev) {
    if (!joy.active) return;
    const ended = Array.from(ev.changedTouches || []).some((tt) => tt.identifier === joy.id);
    if (!ended) return;
    joy.active = false;
    joy.id = -1;
    joy.dx = 0;
    joy.dy = 0;
    resetInput();
    ev.preventDefault();
  }

  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
  };
}

