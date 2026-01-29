let ctx = null;
let master = null;
let unlocked = false;

function ensureCtx() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

function env(g, t0, a, d) {
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(a, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
}

function beep({ type = "sine", freq = 440, dur = 0.08, gain = 0.12, detune = 0 }) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(g);
  g.connect(master);
  const t0 = now();
  env(g, t0, gain, dur);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.05, gain = 0.08 }) {
  if (!ctx || !master) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  src.connect(g);
  g.connect(master);
  const t0 = now();
  env(g, t0, gain, dur);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export function createAudio() {
  let muted = false;
  const cd = {
    shoot: 0,
    hit: 0,
    pickup: 0,
    explode: 0,
  };

  function setMuted(v) {
    muted = !!v;
    if (master) master.gain.value = muted ? 0 : 0.35;
  }

  // iOS/Chrome: keep this synchronous (no await) to preserve "user gesture"
  function unlock() {
    try {
      ensureCtx();
      if (ctx.state === "suspended") {
        const p = ctx.resume();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }

      // Kick the audio graph once (silent) to reliably unlock on iOS.
      // (Some browsers resume() alone is not enough.)
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0;
        o.connect(g);
        g.connect(master);
        const t0 = now();
        o.start(t0);
        o.stop(t0 + 0.01);
      } catch {
        // ignore
      }
      unlocked = true;
    } catch {
      // ignore
    }
  }

  function can(key, dt) {
    const t = performance.now() / 1000;
    if (cd[key] && t < cd[key]) return false;
    cd[key] = t + dt;
    return true;
  }

  function shoot(kind = "pistol") {
    if (muted || !unlocked) return;
    if (!can("shoot", 0.03)) return;
    ensureCtx();
    if (kind === "shotgun") {
      noise({ dur: 0.03, gain: 0.08 });
      beep({ type: "square", freq: 160, dur: 0.06, gain: 0.06, detune: -20 });
      return;
    }
    if (kind === "lance") {
      beep({ type: "sawtooth", freq: 220, dur: 0.10, gain: 0.08, detune: -10 });
      return;
    }
    beep({ type: "square", freq: 420, dur: 0.05, gain: 0.06 });
  }

  function hit(isPlayer = false) {
    if (muted || !unlocked) return;
    if (!can("hit", 0.04)) return;
    ensureCtx();
    if (isPlayer) {
      noise({ dur: 0.045, gain: 0.10 });
      beep({ type: "sine", freq: 90, dur: 0.08, gain: 0.05 });
    } else {
      noise({ dur: 0.02, gain: 0.05 });
    }
  }

  function explode(isBoss = false) {
    if (muted || !unlocked) return;
    if (!can("explode", isBoss ? 0.12 : 0.06)) return;
    ensureCtx();
    if (isBoss) {
      noise({ dur: 0.16, gain: 0.10 });
      beep({ type: "sawtooth", freq: 120, dur: 0.22, gain: 0.08 });
      beep({ type: "sawtooth", freq: 70, dur: 0.28, gain: 0.06 });
      return;
    }
    noise({ dur: 0.06, gain: 0.07 });
    beep({ type: "square", freq: 140, dur: 0.08, gain: 0.05 });
  }

  function pickup(kind = "xp") {
    if (muted || !unlocked) return;
    if (!can("pickup", 0.06)) return;
    ensureCtx();
    if (kind === "heal") beep({ type: "triangle", freq: 520, dur: 0.10, gain: 0.06 });
    else if (kind === "chest") beep({ type: "triangle", freq: 330, dur: 0.14, gain: 0.07 });
    else if (kind === "buff") beep({ type: "triangle", freq: 610, dur: 0.10, gain: 0.06 });
    else beep({ type: "triangle", freq: 740, dur: 0.07, gain: 0.05 });
  }

  function levelUp() {
    if (muted || !unlocked) return;
    ensureCtx();
    beep({ type: "triangle", freq: 520, dur: 0.08, gain: 0.05 });
    beep({ type: "triangle", freq: 780, dur: 0.10, gain: 0.06 });
  }

  function death() {
    if (muted || !unlocked) return;
    ensureCtx();
    beep({ type: "sawtooth", freq: 160, dur: 0.14, gain: 0.08 });
    beep({ type: "sawtooth", freq: 90, dur: 0.20, gain: 0.07 });
    noise({ dur: 0.12, gain: 0.08 });
  }

  return { unlock, setMuted, shoot, hit, explode, pickup, levelUp, death, get muted() { return muted; } };
}

