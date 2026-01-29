import { clamp } from "./math.js";

export function createViewport() {
  return { w: 0, h: 0, dpr: 1, zoom: 1, cssW: 0, cssH: 0 };
}

export function resizeCanvasToViewport(canvas, ctx, viewport) {
  const rect = canvas.getBoundingClientRect();
  viewport.cssW = Math.max(0, rect.width);
  viewport.cssH = Math.max(0, rect.height);
  viewport.dpr = Math.max(1, window.devicePixelRatio || 1);
  const zoom = Math.max(0.5, Math.min(1.25, viewport.zoom || 1));
  viewport.w = Math.max(320, Math.floor(rect.width / zoom));
  viewport.h = Math.max(240, Math.floor(rect.height / zoom));

  // Keep the canvas buffer matching the displayed CSS size.
  const bw = Math.round(rect.width * viewport.dpr);
  const bh = Math.round(rect.height * viewport.dpr);

  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  // After this, all drawing coords are in "viewport pixels" (CSS pixels / zoom).
  ctx.setTransform(viewport.dpr * zoom, 0, 0, viewport.dpr * zoom, 0, 0);
  ctx.imageSmoothingEnabled = true;
}

export function dtFromMs(now, last) {
  let dt = (now - last) / 1000;
  return clamp(dt, 0, 0.04);
}

