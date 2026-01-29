export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function len2(x, y) {
  return x * x + y * y;
}

export function norm(x, y) {
  const l = Math.sqrt(x * x + y * y) || 1;
  return { x: x / l, y: y / l, l };
}

export function randRange(a, b) {
  return a + Math.random() * (b - a);
}

export function randInt(a, bInclusive) {
  return (a + Math.floor(Math.random() * (bInclusive - a + 1))) | 0;
}

export function pickWeighted(items) {
  // items: [{ item, w }]
  let sum = 0;
  for (let i = 0; i < items.length; i++) sum += items[i].w;
  if (sum <= 0) return items[0]?.item;
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= items[i].w;
    if (r <= 0) return items[i].item;
  }
  return items[items.length - 1]?.item;
}

// deterministic hash for terrain glyphs (no rng state dependency)
export function hash2i(xi, yi) {
  let x = (xi | 0) ^ ((yi | 0) * 374761393);
  x = (x ^ (x >> 13)) * 1274126177;
  x = x ^ (x >> 16);
  return x >>> 0;
}

