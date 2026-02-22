let ctx = null;
let master = null;
let limiter = null;
let unlocked = false;

import { MUSIC_SCORES, MUSIC_SCORE_IDS } from "./musicScores.js";

const SYNTH_FALLBACK_SCORE_ID = "ascii_combat_synth";

function ensureCtx() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  // Slightly louder by default; a limiter keeps it safe.
  master.gain.value = 0.62;
  limiter = ctx.createDynamicsCompressor();
  // Soft limiter/compressor (safe peaks, higher perceived loudness)
  limiter.threshold.value = -18;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;
  master.connect(limiter);
  limiter.connect(ctx.destination);
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

function env(g, t0, a, d, attack = 0.008) {
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(a, t0 + Math.max(0.001, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
}

function beep({ type = "sine", freq = 440, dur = 0.08, gain = 0.12, detune = 0, out = null, attack = 0.008 }) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(g);
  g.connect(out || master);
  const t0 = now();
  env(g, t0, gain, dur, attack);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.05, gain = 0.08, out = null, attack = 0.008 }) {
  if (!ctx || !master) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  src.connect(g);
  g.connect(out || master);
  const t0 = now();
  env(g, t0, gain, dur, attack);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function clamp01(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

export function createAudio() {
  const SCORE_ANTI_REPEAT = 2;
  const COMBAT_ROTATE_BARS = 16;
  const ACTION_DECAY_PER_SEC = 0.20;

  let muted = false;
  let mode = "sfx"; // "sfx" | "music"
  let scoreId =
    MUSIC_SCORES[SYNTH_FALLBACK_SCORE_ID]
      ? SYNTH_FALLBACK_SCORE_ID
      : (MUSIC_SCORE_IDS[0] || "a_minor_chill");
  let intensity = 0; // 0..1 from game progression
  let backgrounded = false; // page not focused / hidden
  // User-mix volumes (0..1)
  let musicVol = 0.85;
  let sfxVol = 0.85;

  let sfxBus = null;
  let musicBus = null;
  let padBus = null;
  let padFilter = null;
  let leadBus = null;
  let leadDelay = null;
  let leadDelayFb = null;
  let leadDelayWet = null;

  // Debug counters (anti-cacophony visibility)
  const dbg = {
    shotAttempts: 0,
    notesScheduled: 0,
    dropKind: 0,
    dropBudget: 0,
    dropPerKind: Object.create(null),
  };

  // Very small scheduler to build pads/bass over time
  const music = {
    timer: 0,
    step: 0,
    nextT: 0,
    startT: 0,
    stepDur: 0,
    // per-weapon pattern indices
    idx: Object.create(null),
    // anti-chaos: limit how many notes can trigger per 16th step
    lastStepAny: -1,
    stepTrigCount: 0,
    lastStepByKind: Object.create(null),
    // meta from game (weapons owned) to add layers progressively
    meta: {
      weapons: [],
      mask: Object.create(null),
      count: 0,
    },
    chordDegree: 0,
    // Intro bars: start with groove, then pads enter.
    introBars: 2,
    // Combat-only context for now: rotate loops regularly.
    context: "combat",
    barsPerLoop: COMBAT_ROTATE_BARS,
    loopPool: MUSIC_SCORE_IDS.filter((id) => MUSIC_SCORES[id]?.rotate !== false),
    recentScores: [],
    trackStartBar: 0,
    // Action intensity (shots/hits/explosions) drives stems.
    actionEnergy: 0,
    lastTickT: 0,
    stems: {
      drone: 0,
      bass: 0,
      perc: 0,
    },
    externalEl: null,
    externalNode: null,
    externalScoreId: "",
    externalEndedHandler: null,
    externalErrorHandler: null,
    failedScores: Object.create(null),
  };

  const cd = {
    shoot: 0,
    hitEnemy: 0,
    hitPlayer: 0,
    pickup: 0,
    explode: 0,
  };

  function ensureBuses() {
    if (!ctx || !master) return;
    if (sfxBus && musicBus) return;
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    padBus = ctx.createGain();
    padFilter = ctx.createBiquadFilter();
    leadBus = ctx.createGain();
    leadDelay = ctx.createDelay(0.35);
    leadDelayFb = ctx.createGain();
    leadDelayWet = ctx.createGain();
    padFilter.type = "lowpass";
    padFilter.Q.value = 0.7;
    padFilter.frequency.value = 900;
    sfxBus.gain.value = 1.0;
    musicBus.gain.value = 0.95;
    padBus.gain.value = 1.0;
    sfxBus.connect(master);
    // pad -> filter -> music bus -> master
    padBus.connect(padFilter);
    padFilter.connect(musicBus);
    // lead -> (dry + delay) -> music bus
    leadBus.connect(musicBus);
    leadBus.connect(leadDelay);
    leadDelay.connect(leadDelayWet);
    leadDelayWet.connect(musicBus);
    // feedback loop (subtle, safe)
    leadDelay.connect(leadDelayFb);
    leadDelayFb.connect(leadDelay);
    musicBus.connect(master);
  }

  function syncBusGains() {
    if (!sfxBus || !musicBus) return;
    // In music mode, keep SFX subtle (hits/explosions/pickups) so it doesn't fight the music.
    const sfxModeMul = mode === "music" ? 0.55 : 1.0;
    sfxBus.gain.value = clamp01(sfxVol) * sfxModeMul;
    musicBus.gain.value = clamp01(musicVol) * 0.95;
  }

  function syncMasterGain() {
    if (!master) return;
    master.gain.value = (muted || backgrounded) ? 0 : 0.62;
  }

  function setMuted(v) {
    muted = !!v;
    syncMasterGain();
    syncMusicScheduler();
  }

  // iOS/Chrome: keep this synchronous (no await) to preserve "user gesture"
  function unlock() {
    try {
      ensureCtx();
      ensureBuses();
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
      syncMusicScheduler();
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

  function currentScore() {
    return MUSIC_SCORES[scoreId] || MUSIC_SCORES[MUSIC_SCORE_IDS[0]] || null;
  }

  function isExternalScore(sc) {
    return !!(sc && typeof sc.file === "string" && sc.file.length > 0);
  }

  function fallbackScoreId() {
    if (MUSIC_SCORES[SYNTH_FALLBACK_SCORE_ID]) return SYNTH_FALLBACK_SCORE_ID;
    const synth = MUSIC_SCORE_IDS.find((id) => !isExternalScore(MUSIC_SCORES[id]));
    return synth || MUSIC_SCORE_IDS[0] || scoreId;
  }

  function scorePoolForRotation() {
    const sourcePool = Array.isArray(music.loopPool) && music.loopPool.length ? music.loopPool : MUSIC_SCORE_IDS;
    return sourcePool.filter((id) => {
      const sc = MUSIC_SCORES[id];
      if (!sc || sc.rotate === false) return false;
      if (isExternalScore(sc) && music.failedScores[id]) return false;
      return true;
    });
  }

  function rememberRecentScore(id, reset = false) {
    if (!id) return;
    if (reset) music.recentScores.length = 0;
    music.recentScores.push(id);
    const keep = Math.max(2, SCORE_ANTI_REPEAT + 1);
    while (music.recentScores.length > keep) music.recentScores.shift();
  }

  function pickNextCombatScoreId() {
    const pool = scorePoolForRotation();
    if (!pool.length) return fallbackScoreId();
    const recent = music.recentScores.slice(-SCORE_ANTI_REPEAT);

    let candidates = pool.filter((id) => id !== scoreId && !recent.includes(id));
    if (!candidates.length) candidates = pool.filter((id) => id !== scoreId);
    if (!candidates.length) candidates = pool.filter((id) => !recent.includes(id));
    if (!candidates.length) candidates = pool.slice();

    return candidates[(Math.random() * candidates.length) | 0] || scoreId;
  }

  function clearExternalTrack() {
    const el = music.externalEl;
    if (el) {
      try {
        if (music.externalEndedHandler) el.removeEventListener("ended", music.externalEndedHandler);
        if (music.externalErrorHandler) el.removeEventListener("error", music.externalErrorHandler);
        el.pause();
      } catch {
        // ignore
      }
    }
    if (music.externalNode) {
      try {
        music.externalNode.disconnect();
      } catch {
        // ignore
      }
    }
    music.externalEl = null;
    music.externalNode = null;
    music.externalScoreId = "";
    music.externalEndedHandler = null;
    music.externalErrorHandler = null;
  }

  function playExternalScore(sc, reset = false) {
    if (!ctx || !musicBus || !isExternalScore(sc)) return false;

    const needNew = !music.externalEl || music.externalScoreId !== sc.id;
    if (needNew) {
      clearExternalTrack();
      const el = new Audio(sc.file);
      el.preload = "auto";
      el.loop = false;
      el.crossOrigin = "anonymous";
      const onEnded = () => {
        if (!isMusicActive() || mode !== "music") return;
        rememberRecentScore(scoreId);
        const nextId = pickNextCombatScoreId();
        if (!nextId || !MUSIC_SCORES[nextId]) return;
        scoreId = nextId;
        rememberRecentScore(scoreId);
        const next = currentScore();
        if (next && isExternalScore(next)) {
          playExternalScore(next, true);
          return;
        }
        clearExternalTrack();
        if (isMusicActive()) startMusicScheduler();
      };
      const onError = () => {
        const failedId = music.externalScoreId || scoreId;
        if (failedId) music.failedScores[failedId] = true;
        rememberRecentScore(failedId);
        clearExternalTrack();
        const nextId = pickNextCombatScoreId();
        if (!nextId || !MUSIC_SCORES[nextId]) return;
        if (nextId === failedId) return;
        scoreId = nextId;
        rememberRecentScore(scoreId);
        const next = currentScore();
        if (next && isExternalScore(next)) {
          playExternalScore(next, true);
          return;
        }
        if (isMusicActive()) startMusicScheduler();
      };
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);

      let node = null;
      try {
        node = ctx.createMediaElementSource(el);
        node.connect(musicBus);
      } catch {
        // If creating the media source fails, bail out for this score.
        try {
          el.pause();
        } catch {
          // ignore
        }
        return false;
      }

      music.externalEl = el;
      music.externalNode = node;
      music.externalScoreId = sc.id;
      music.externalEndedHandler = onEnded;
      music.externalErrorHandler = onError;
      reset = true;
    }

    const el = music.externalEl;
    if (!el) return false;
    if (reset) {
      try {
        el.currentTime = 0;
      } catch {
        // ignore
      }
    } else if (!el.paused) {
      return true;
    }

    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    return true;
  }

  function maybeRotateCombatScore(bar) {
    if ((music.context || "combat") !== "combat") return null;
    const everyBars = Math.max(4, music.barsPerLoop | 0);
    if (bar <= 0 || (bar % everyBars) !== 0) return null;
    const nextId = pickNextCombatScoreId();
    if (!nextId || nextId === scoreId) return null;

    scoreId = nextId;
    rememberRecentScore(scoreId);
    // Reset melodic phrase when switching loop.
    music.idx = Object.create(null);
    music.trackStartBar = bar;

    const nextScore = currentScore();
    if (nextScore) {
      music.stepDur = (60 / (nextScore.bpm || 110)) / 4;
      music.introBars = 0;
    }
    return nextScore;
  }

  function bumpAction(amount = 0.08) {
    music.actionEnergy = clamp01((music.actionEnergy || 0) + Math.max(0, Number(amount) || 0));
  }

  function decayActionEnergy(tNow) {
    if (music.lastTickT > 0) {
      const dt = Math.max(0, tNow - music.lastTickT);
      music.actionEnergy = Math.max(0, (music.actionEnergy || 0) - (dt * ACTION_DECAY_PER_SEC));
    }
    music.lastTickT = tNow;
  }

  function currentStemMix() {
    const action = clamp01(music.actionEnergy || 0);
    const base = clamp01(intensity || 0);
    // Drone keeps a floor so combat music never collapses to silence.
    const drone = clamp01(Math.max(0.20, (base * 0.80) + (action * 0.35)));
    const bass = clamp01((base * 0.72) + (action * 0.78));
    const perc = clamp01((base * 0.62) + (action * 0.95));
    music.stems.drone = drone;
    music.stems.bass = bass;
    music.stems.perc = perc;
    return { action, drone, bass, perc };
  }

  function isMusicActive() {
    return !!(unlocked && !muted && !backgrounded && mode === "music");
  }

  function setBackgrounded(v) {
    backgrounded = !!v;
    syncMasterGain();
    // When hidden/unfocused, stop the scheduler to avoid a backlog/burst on return.
    if (backgrounded) stopMusicScheduler();
    else syncMusicScheduler();
  }

  function stopMusicScheduler() {
    if (music.timer) {
      clearInterval(music.timer);
      music.timer = 0;
    }
    if (music.externalEl) {
      try {
        music.externalEl.pause();
      } catch {
        // ignore
      }
    }
    music.lastTickT = 0;
  }

  function startMusicScheduler() {
    if (music.timer) return;
    let sc = currentScore();
    if (!sc) return;
    ensureCtx();
    ensureBuses();
    syncBusGains();
    // Prefer real tracks when available.
    if (isExternalScore(sc)) {
      if (!music.recentScores.length) rememberRecentScore(scoreId, true);
      const ok = playExternalScore(sc, false);
      if (ok) return;
      if (scoreId) music.failedScores[scoreId] = true;
      clearExternalTrack();
      scoreId = fallbackScoreId();
      sc = currentScore();
      if (!sc || isExternalScore(sc)) return;
      rememberRecentScore(scoreId, true);
    }
    const t = now();
    music.startT = t + 0.02;
    music.step = 0;
    music.nextT = music.startT;
    // 16th note grid
    music.stepDur = (60 / (sc.bpm || 110)) / 4;
    music.introBars = Math.max(0, (sc.introBars ?? 2) | 0);
    music.trackStartBar = 0;
    music.loopPool = MUSIC_SCORE_IDS.filter((id) => MUSIC_SCORES[id]?.rotate !== false);
    music.lastTickT = t;
    music.actionEnergy = Math.max(0.18, music.actionEnergy || 0);
    if (!music.recentScores.length) rememberRecentScore(scoreId, true);
    music.timer = setInterval(tickScheduler, 25);
  }

  function syncMusicScheduler() {
    if (isMusicActive()) startMusicScheduler();
    else stopMusicScheduler();
  }

  function tickScheduler() {
    if (!isMusicActive()) return;
    // Schedule a little ahead for stable timing
    const ahead = 0.14;
    const tNow = now();
    decayActionEnergy(tNow);
    while (music.nextT < tNow + ahead) {
      const sc = currentScore();
      if (!sc) break;
      scheduleMusicStep(sc, music.nextT, music.step);
      music.step += 1;
      music.nextT += music.stepDur;
    }
  }

  function scheduleChord(sc, t0, barDur, degree, barIndex, mix) {
    // Layer thresholds: pad appears first, then bass later.
    const droneLevel = mix?.drone ?? intensity;
    const bassLevel = mix?.bass ?? intensity;
    const padOn = droneLevel >= 0.18;
    const bassOn = bassLevel >= 0.44;
    if (!padOn) return;

    const scale = sc.scale || [0, 2, 3, 5, 7, 8, 10];
    const rootMidi = (sc.rootMidi || 57) + scale[degree % scale.length];
    let thirdMidi = rootMidi + (scale[2] - scale[0]); // scale degree +2
    let fifthMidi = rootMidi + (scale[4] - scale[0]); // scale degree +4

    // Simple voicing variation so pads don't feel identical every bar.
    const b = barIndex | 0;
    if ((b % 8) === 4) thirdMidi += 12; // lift third on bar 5
    if ((b % 8) === 6) fifthMidi -= 12; // drop fifth on bar 7

    // Per-score pad character (timbre + filter movement).
    const p = sc.pad || {};
    const padType = p.type || "sine";
    const det = typeof p.detune === "number" ? p.detune : 10;
    const atk = typeof p.attack === "number" ? p.attack : 0.08;
    const baseF = (typeof p.filterBase === "number" ? p.filterBase : (800 + 500 * droneLevel));
    const varF = (typeof p.filterVar === "number" ? p.filterVar : 650);
    // Slow drift per bar (keeps "âme" without becoming noisy)
    if (padFilter) {
      const drift = Math.sin((b || 0) * 0.55) * 0.5 + 0.5;
      const freq = Math.max(220, baseF + varF * drift);
      padFilter.frequency.setValueAtTime(freq, t0);
    }

    const padGain = 0.012 + 0.028 * droneLevel;
    dbg.notesScheduled += 3;
    beep({
      type: padType,
      freq: midiToFreq(rootMidi),
      dur: barDur * 0.98,
      gain: padGain,
      detune: -det,
      out: padBus || musicBus,
      attack: atk,
    });
    beep({
      type: padType,
      freq: midiToFreq(thirdMidi),
      dur: barDur * 0.98,
      gain: padGain * 0.92,
      detune: det * 0.55,
      out: padBus || musicBus,
      attack: atk,
    });
    beep({
      type: padType,
      freq: midiToFreq(fifthMidi),
      dur: barDur * 0.98,
      gain: padGain * 0.85,
      detune: det * 0.85,
      out: padBus || musicBus,
      attack: atk,
    });

    if (bassOn) {
      const bassGain = 0.024 + 0.040 * bassLevel;
      dbg.notesScheduled += 1;
      beep({
        type: "triangle",
        freq: midiToFreq(rootMidi - 24),
        dur: barDur * 0.60,
        gain: bassGain,
        detune: -4,
        out: musicBus,
        attack: 0.02,
      });
      // a small transient to lock the groove
      noise({ dur: 0.012, gain: 0.008 + 0.015 * bassLevel, out: musicBus, attack: 0.002 });
    }
  }

  function hasWeapon(id) {
    return !!music.meta.mask?.[id];
  }

  function scheduleKick(t0, gain) {
    if (!ctx || !musicBus) return;
    // simple synth kick: fast pitch drop sine
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.08);
    o.connect(g);
    g.connect(musicBus);
    env(g, t0, gain, 0.14, 0.004);
    o.start(t0);
    o.stop(t0 + 0.18);
    dbg.notesScheduled += 1;
  }

  function scheduleSnare(t0, gain) {
    noise({ dur: 0.030, gain, out: musicBus, attack: 0.002 });
  }

  function scheduleHat(t0, gain) {
    noise({ dur: 0.010, gain, out: musicBus, attack: 0.001 });
  }

  function scheduleBass(sc, t0, degOffset, gain) {
    const scale = sc.scale || [0, 2, 3, 5, 7, 8, 10];
    const chord = (music.chordDegree || 0) | 0;
    const di = ((chord + (degOffset | 0)) % scale.length + scale.length) % scale.length;
    const root = sc.rootMidi || 57;
    const midi = root + scale[di] - 24;
    beep({ type: "triangle", freq: midiToFreq(midi), dur: 0.10, gain, detune: -4, out: musicBus, attack: 0.004 });
    dbg.notesScheduled += 1;
  }

  function scheduleArp(sc, t0, kind, gainMul = 1, mix = null) {
    const scale = sc.scale || [0, 2, 3, 5, 7, 8, 10];
    const deg = noteForWeapon(sc, kind);
    const midi =
      (sc.rootMidi || 57) +
      scale[((deg % scale.length) + scale.length) % scale.length] +
      (deg >= scale.length ? 12 : 0);
    const droneLevel = mix?.drone ?? intensity;
    const g = (0.010 + 0.022 * droneLevel) * gainMul;
    beep({ type: "square", freq: midiToFreq(midi), dur: 0.05, gain: g, detune: 4, out: musicBus });
    dbg.notesScheduled += 1;
  }

  function scheduleLead(sc, t0, kind, gainMul = 1, mix = null) {
    const scale = sc.scale || [0, 2, 3, 5, 7, 8, 10];
    const deg = noteForWeapon(sc, kind);
    const midi =
      (sc.rootMidi || 57) +
      scale[((deg % scale.length) + scale.length) % scale.length] +
      12;
    const leadDyn = Math.max(mix?.bass ?? intensity, mix?.action ?? 0);
    const g = (0.010 + 0.026 * leadDyn) * gainMul;
    beep({ type: "sawtooth", freq: midiToFreq(midi), dur: 0.11, gain: g, detune: -6, out: leadBus || musicBus });
    dbg.notesScheduled += 1;
  }

  function swungTime(sc, t0, inBar) {
    const sw = Number(sc.swing || 0);
    if (!sw) return t0;
    // basic 16th swing: delay odd steps slightly
    return (inBar % 2 === 1) ? (t0 + music.stepDur * sw) : t0;
  }

  function scheduleMusicStep(sc, t0, step) {
    const stepsPerBar = 16;
    const bar = Math.floor(step / stepsPerBar);
    const inBar = step % stepsPerBar;
    if (inBar === 0) {
      const switched = maybeRotateCombatScore(bar);
      if (switched) sc = switched;
    }
    const mix = currentStemMix();
    const inIntro = bar < (music.introBars || 0);
    const relBar = Math.max(0, bar - (music.trackStartBar || 0));
    const fillBar = relBar > 0 && (relBar % 8 === 7);
    const breakBar = relBar > 0 && (relBar % 16 === 15);
    const breakWindow = breakBar && inBar >= 12 && inBar <= 14;
    // New bar -> chord / pad layer
    if (inBar === 0) {
      const prog = sc.chordProg || [0, 5, 3, 4];
      let degree = prog[bar % prog.length] || 0;
      // tiny turnaround so it doesn't feel like "same 4 bars"
      if ((prog.length || 0) <= 4 && (bar % 8) === 7) degree = prog[(bar + 1) % prog.length] || degree;
      music.chordDegree = degree | 0;
      // per-score lead delay
      if (leadDelay && leadDelayFb && leadDelayWet) {
        const fx = sc.fx || {};
        const dt = clamp01(Number(fx.leadDelayTime ?? 0.16)) * 0.35;
        const fb = clamp01(Number(fx.leadDelayFb ?? 0.22)) * 0.60;
        const mix = clamp01(Number(fx.leadDelayMix ?? 0.18)) * 0.70;
        leadDelay.delayTime.setValueAtTime(Math.max(0.04, dt), t0);
        leadDelayFb.gain.setValueAtTime(Math.min(0.45, fb), t0);
        leadDelayWet.gain.setValueAtTime(mix, t0);
      }
      // Do not start with a pad: skip chord/pad during intro bars.
      if (!inIntro) scheduleChord(sc, t0, music.stepDur * stepsPerBar, degree, bar, mix);
    }

    // Progressive layers based on owned weapons (decoupled from firing rate).
    // - pistol -> arp
    // - shotgun -> kick/snare groove
    // - tesla/lance/laser -> lead
    // - flame -> texture noise+short saw
    const wc = music.meta.count || 0;
    const arpOn = hasWeapon("pistol") && wc >= 1 && mix.drone >= 0.18;
    const drumOn = ((hasWeapon("shotgun") && wc >= 2) || mix.action >= 0.60) && mix.perc >= 0.20;
    const leadOn = (hasWeapon("tesla") || hasWeapon("lance") || hasWeapon("laser")) && (wc >= 2 || mix.action >= 0.70) && mix.bass >= 0.26;
    const texOn = (hasWeapon("flame") && wc >= 3 && mix.action >= 0.22) || mix.action >= 0.74;
    const bassOn = mix.bass >= 0.40;

    const tS = swungTime(sc, t0, inBar);
    const sectionBars = (sc.sectionBars || 8) | 0;
    const section = sectionBars > 0 ? Math.floor(relBar / sectionBars) % 2 : 0;

    // Intro groove: let drums/bass establish before pads (even without weapons).
    if (inIntro && sc.drums && !breakWindow) {
      const d = sc.drums;
      const mul = 0.45 + 0.35 * mix.perc;
      if (Array.isArray(d.kick) && d.kick.includes(inBar)) scheduleKick(t0, (d.kickGain || 0.06) * mul);
      if (Array.isArray(d.snare) && d.snare.includes(inBar)) scheduleSnare(t0, (d.snareGain || 0.014) * mul);
      if (Array.isArray(d.hat) && d.hat.includes(inBar)) scheduleHat(tS, (d.hatGain || 0.009) * mul);
    }

    // Drums from score (unique groove per track)
    if (drumOn && sc.drums && !breakWindow) {
      const d = sc.drums;
      if (Array.isArray(d.kick) && d.kick.includes(inBar)) scheduleKick(t0, (d.kickGain || 0.06) * (0.60 + 0.90 * mix.perc));
      if (Array.isArray(d.snare) && d.snare.includes(inBar)) scheduleSnare(t0, (d.snareGain || 0.014) * (0.55 + 0.85 * mix.perc));
      if (Array.isArray(d.hat) && d.hat.includes(inBar)) scheduleHat(tS, (d.hatGain || 0.009) * (0.50 + 0.95 * mix.perc));
      // Section B: slightly denser hats
      if (section === 1 && mix.perc >= 0.56 && (inBar % 2 === 1)) scheduleHat(tS, (d.hatGain || 0.009) * 0.55);
    }

    // Bassline from score (ties harmony + identity)
    if ((bassOn || inIntro) && sc.bass && Array.isArray(sc.bass.pat) && !breakWindow) {
      const deg = sc.bass.pat[inBar];
      if (deg !== null && deg !== undefined) {
        const mul = inIntro ? 0.55 : 1.0;
        scheduleBass(sc, (inBar % 2 === 1 ? tS : t0), deg, (sc.bass.gain || 0.05) * (0.55 + 0.95 * mix.bass) * mul);
      }
    }

    // Arp: on 8ths, swung if applicable
    if (arpOn && !breakWindow && (inBar % 2 === 0)) scheduleArp(sc, t0, "pistol", section === 1 ? 1.05 : 0.95, mix);

    // Lead: sparse, with delay (different per score)
    if (leadOn && !breakWindow && (inBar % 4 === 0)) scheduleLead(sc, t0, "lance", section === 1 ? 1.0 : 0.9, mix);

    // Texture: small bursts, very subtle
    if (texOn && (inBar % 8 === 2)) {
      noise({ dur: 0.020, gain: 0.004 + 0.008 * mix.action, out: musicBus, attack: 0.002 });
      beep({ type: "sawtooth", freq: midiToFreq((sc.rootMidi || 57) + 24), dur: 0.05, gain: 0.004 + 0.008 * mix.action, detune: 10, out: musicBus });
      dbg.notesScheduled += 1;
    }

    // Mini-variations:
    // - every 8 bars: short fill + filter sweep
    // - every 16 bars: brief break (mute 3 steps) then re-entry hit
    if (fillBar && inBar >= 12 && sc.drums) {
      const d = sc.drums;
      scheduleHat(tS, (d.hatGain || 0.009) * (0.80 + 0.60 * mix.perc));
      if (inBar === 14 || inBar === 15) scheduleSnare(t0, (d.snareGain || 0.014) * (0.70 + 0.65 * mix.perc));
      if (inBar === 15) scheduleKick(t0, (d.kickGain || 0.06) * (0.75 + 0.70 * mix.perc));
      if (inBar === 12 && padFilter) {
        const cur = Math.max(240, Number(padFilter.frequency.value) || 900);
        padFilter.frequency.cancelScheduledValues(t0);
        padFilter.frequency.setValueAtTime(cur, t0);
        padFilter.frequency.linearRampToValueAtTime(Math.max(260, cur * 0.55), t0 + (music.stepDur * 1.5));
        padFilter.frequency.linearRampToValueAtTime(Math.min(4200, cur * 1.25), t0 + (music.stepDur * 4));
      }
    }
    if (breakBar && inBar === 15 && sc.drums) {
      const d = sc.drums;
      scheduleKick(t0, (d.kickGain || 0.06) * (0.90 + 0.65 * mix.perc));
    }
  }

  function quantizeTime(t) {
    const sc = currentScore();
    if (!sc) return t;
    const stepDur = music.stepDur || (60 / (sc.bpm || 110)) / 4;
    const base = music.startT || (now() + 0.01);
    const n = Math.ceil((t - base) / stepDur);
    return base + Math.max(0, n) * stepDur;
  }

  function noteForWeapon(sc, kind) {
    const patterns = sc.patterns || {};
    const pat =
      patterns[kind] ||
      patterns[(kind === "laser" || kind === "tesla") ? "lance" : kind] ||
      patterns.default ||
      [0, 2, 4, 5, 4, 2];
    const i = (music.idx[kind] || 0) % pat.length;
    music.idx[kind] = (music.idx[kind] || 0) + 1;
    return pat[i] || 0;
  }

  function shoot(kind = "pistol") {
    if (muted || !unlocked) return;
    if (!can("shoot", 0.03)) return;
    ensureCtx();
    ensureBuses();

    if (mode === "music") {
      // Decoupled: shots do not trigger notes anymore (keeps music stable).
      // We only track attempts for debugging and drive stems from action.
      const pulse =
        kind === "shotgun" ? 0.14
          : kind === "lance" ? 0.11
            : kind === "flame" ? 0.10
              : 0.07;
      bumpAction(pulse);
      dbg.shotAttempts += 1;
      return;
    }

    if (kind === "shotgun") {
      noise({ dur: 0.03, gain: 0.08, out: sfxBus });
      beep({ type: "square", freq: 160, dur: 0.06, gain: 0.06, detune: -20, out: sfxBus });
      return;
    }
    if (kind === "flame") {
      noise({ dur: 0.03, gain: 0.05, out: sfxBus });
      beep({ type: "sawtooth", freq: 220, dur: 0.05, gain: 0.035, detune: 12, out: sfxBus });
      return;
    }
    if (kind === "lance") {
      beep({ type: "sawtooth", freq: 220, dur: 0.10, gain: 0.08, detune: -10, out: sfxBus });
      return;
    }
    beep({ type: "square", freq: 420, dur: 0.05, gain: 0.06, out: sfxBus });
  }

  function hit(isPlayer = false) {
    if (muted || !unlocked) return;
    // In music mode, hits are intentionally subtle and less frequent.
    // Also: separate cooldowns so enemy hit spam doesn't mask player feedback.
    const key = isPlayer ? "hitPlayer" : "hitEnemy";
    const cdSec =
      mode === "music"
        ? (isPlayer ? 0.11 : 0.16)
        : 0.04;
    if (!can(key, cdSec)) return;
    ensureCtx();
    ensureBuses();
    syncBusGains();
    if (mode === "music") bumpAction(isPlayer ? 0.22 : 0.10);
    if (isPlayer) {
      if (mode === "music") {
        noise({ dur: 0.035, gain: 0.055, out: sfxBus });
        beep({ type: "sine", freq: 90, dur: 0.07, gain: 0.028, out: sfxBus });
      } else {
        noise({ dur: 0.045, gain: 0.10, out: sfxBus });
        beep({ type: "sine", freq: 90, dur: 0.08, gain: 0.05, out: sfxBus });
      }
    } else {
      // Enemy hits: much quieter in music mode (and still readable in sfx mode).
      noise({ dur: 0.014, gain: mode === "music" ? 0.02 : 0.05, out: sfxBus });
    }
  }

  function explode(isBoss = false) {
    if (muted || !unlocked) return;
    if (!can("explode", isBoss ? 0.12 : 0.06)) return;
    ensureCtx();
    ensureBuses();
    if (mode === "music") bumpAction(isBoss ? 0.40 : 0.24);
    if (isBoss) {
      noise({ dur: 0.16, gain: 0.10, out: sfxBus });
      beep({ type: "sawtooth", freq: 120, dur: 0.22, gain: 0.08, out: sfxBus });
      beep({ type: "sawtooth", freq: 70, dur: 0.28, gain: 0.06, out: sfxBus });
      return;
    }
    noise({ dur: 0.06, gain: 0.07, out: sfxBus });
    beep({ type: "square", freq: 140, dur: 0.08, gain: 0.05, out: sfxBus });
  }

  function pickup(kind = "xp") {
    if (muted || !unlocked) return;
    if (!can("pickup", 0.06)) return;
    ensureCtx();
    ensureBuses();
    if (mode === "music") bumpAction(0.04);
    if (kind === "heal") beep({ type: "triangle", freq: 520, dur: 0.10, gain: 0.06, out: sfxBus });
    else if (kind === "chest") beep({ type: "triangle", freq: 330, dur: 0.14, gain: 0.07, out: sfxBus });
    else if (kind === "buff") beep({ type: "triangle", freq: 610, dur: 0.10, gain: 0.06, out: sfxBus });
    else beep({ type: "triangle", freq: 740, dur: 0.07, gain: 0.05, out: sfxBus });
  }

  function levelUp() {
    if (muted || !unlocked) return;
    ensureCtx();
    ensureBuses();
    if (mode === "music") bumpAction(0.18);
    beep({ type: "triangle", freq: 520, dur: 0.08, gain: 0.05, out: sfxBus });
    beep({ type: "triangle", freq: 780, dur: 0.10, gain: 0.06, out: sfxBus });
  }

  function death() {
    if (muted || !unlocked) return;
    ensureCtx();
    ensureBuses();
    if (mode === "music") bumpAction(0.24);
    beep({ type: "sawtooth", freq: 160, dur: 0.14, gain: 0.08, out: sfxBus });
    beep({ type: "sawtooth", freq: 90, dur: 0.20, gain: 0.07, out: sfxBus });
    noise({ dur: 0.12, gain: 0.08, out: sfxBus });
  }

  function warning(kind = "danger") {
    if (muted || !unlocked) return;
    const k = String(kind || "danger");
    const cd = k === "boss" ? 1.2 : k === "rush" ? 0.9 : 0.34;
    if (!can(`warn:${k}`, cd)) return;
    ensureCtx();
    ensureBuses();
    syncBusGains();
    if (mode === "music") bumpAction(k === "boss" ? 0.20 : 0.08);

    if (k === "boss") {
      beep({ type: "sawtooth", freq: 190, dur: 0.10, gain: 0.065, out: sfxBus });
      beep({ type: "sawtooth", freq: 130, dur: 0.14, gain: 0.060, out: sfxBus });
      return;
    }
    if (k === "charge") {
      beep({ type: "square", freq: 240, dur: 0.06, gain: 0.050, out: sfxBus });
      beep({ type: "square", freq: 180, dur: 0.07, gain: 0.055, out: sfxBus });
      return;
    }
    if (k === "aoe" || k === "explosive") {
      beep({ type: "triangle", freq: 310, dur: 0.06, gain: 0.055, out: sfxBus });
      beep({ type: "triangle", freq: 260, dur: 0.08, gain: 0.060, out: sfxBus });
      return;
    }
    if (k === "shot" || k === "bossShot") {
      beep({ type: "triangle", freq: 430, dur: 0.05, gain: 0.048, out: sfxBus });
      return;
    }
    beep({ type: "triangle", freq: 360, dur: 0.06, gain: 0.045, out: sfxBus });
  }

  function setMode(v) {
    mode = v === "music" ? "music" : "sfx";
    if (mode === "music") music.actionEnergy = Math.max(0.18, music.actionEnergy || 0);
    syncBusGains();
    syncMusicScheduler();
  }

  function setScore(id) {
    if (id && MUSIC_SCORES[id]) scoreId = id;
    delete music.failedScores[scoreId];
    rememberRecentScore(scoreId, true);
    music.trackStartBar = Math.floor((music.step || 0) / 16);
    const sc = currentScore();
    if (music.timer && sc) {
      music.stepDur = (60 / (sc.bpm || 110)) / 4;
      music.introBars = 0;
    }
    // reset phrase indices so it feels coherent when switching
    music.idx = Object.create(null);
    syncMusicScheduler();
  }

  function setIntensity(v) {
    const x = clamp01(Number(v) || 0);
    // Music mode should never start from total silence:
    // keep a small baseline so pads/texture are audible from the start of a run.
    intensity = mode === "music" ? Math.max(x, 0.22) : x;
  }

  function setMusicVolume(v) {
    musicVol = clamp01(Number(v));
    syncBusGains();
  }

  function setSfxVolume(v) {
    sfxVol = clamp01(Number(v));
    syncBusGains();
  }

  function setMusicMeta(meta) {
    const weps = meta?.weapons || [];
    music.meta.weapons = weps;
    music.meta.count = weps.length || 0;
    const mask = Object.create(null);
    for (let i = 0; i < weps.length; i++) mask[weps[i]?.id] = true;
    music.meta.mask = mask;
  }

  function getDebugInfo() {
    const mix = currentStemMix();
    const sc = currentScore();
    const sourceType = isExternalScore(sc) ? "track" : "synth";
    const padOn = mix.drone >= 0.18;
    const bassOn = mix.bass >= 0.40;
    const hatOn = mix.perc >= 0.72;
    const wc = music.meta.count || 0;
    const voices = {
      pad: padOn,
      bass: bassOn,
      hat: hatOn,
      arp: hasWeapon("pistol") && wc >= 1 && mix.drone >= 0.18,
      drums: ((hasWeapon("shotgun") && wc >= 2) || mix.action >= 0.60) && mix.perc >= 0.20,
      lead: (hasWeapon("tesla") || hasWeapon("lance") || hasWeapon("laser")) && (wc >= 2 || mix.action >= 0.70) && mix.bass >= 0.26,
      texture: (hasWeapon("flame") && wc >= 3 && mix.action >= 0.22) || mix.action >= 0.74,
    };
    return {
      mode,
      scoreId,
      intensity,
      backgrounded,
      volume: { music: musicVol, sfx: sfxVol, master: master?.gain?.value ?? 0 },
      layers: {
        pad: padOn,
        bass: bassOn,
        hat: hatOn,
        count: (padOn ? 1 : 0) + (bassOn ? 1 : 0) + (hatOn ? 1 : 0),
      },
      stems: {
        action: mix.action,
        drone: mix.drone,
        bass: mix.bass,
        percussion: mix.perc,
      },
      loop: {
        context: music.context,
        rotateEveryBars: music.barsPerLoop,
        recentScores: music.recentScores.slice(),
        sourceType,
        trackFile: sc?.file || null,
        failedScores: Object.keys(music.failedScores),
      },
      voices,
      clock: {
        step: music.step || 0,
        stepDur: music.stepDur || 0,
      },
      limiter: {
        maxPerStep: 2,
        lastStep: music.lastStepAny,
        stepTrigCount: music.stepTrigCount,
        dropKind: dbg.dropKind,
        dropBudget: dbg.dropBudget,
        shotAttempts: dbg.shotAttempts,
        notesScheduled: dbg.notesScheduled,
        dropPerKind: { ...dbg.dropPerKind },
      },
    };
  }

  return {
    unlock,
    setMuted,
    setBackgrounded,
    shoot,
    hit,
    explode,
    pickup,
    levelUp,
    death,
    warning,
    setMode,
    setScore,
    setIntensity,
    setMusicMeta,
    setMusicVolume,
    setSfxVolume,
    getDebugInfo,
    get muted() {
      return muted;
    },
    get mode() {
      return mode;
    },
    get scoreId() {
      return scoreId;
    },
    get scoreIds() {
      return MUSIC_SCORE_IDS.slice();
    },
  };
}
