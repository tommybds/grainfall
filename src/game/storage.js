const COOKIE_NAME = "sv_hi";
const KEY_NAME = "sv_key_v1";
const SIGNED_PREFIX = "sv_signed:";

function base64UrlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[$()*+.?[\\\]^{|}-]/g, "\\$&")}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name, value, { maxAgeDays = 3650 } = {}) {
  const maxAge = Math.floor(maxAgeDays * 24 * 60 * 60);
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

async function getOrCreateDeviceKeyBytes() {
  const existing = localStorage.getItem(KEY_NAME);
  if (existing) {
    try {
      return base64UrlDecode(existing);
    } catch {
      // fallthrough to regenerate
    }
  }
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  localStorage.setItem(KEY_NAME, base64UrlEncode(key));
  return key;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes);
  return new Uint8Array(sig);
}

export async function loadHighScore() {
  const keyBytes = await getOrCreateDeviceKeyBytes();
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return { bestKills: 0, bestWave: 0 };

  // format: payloadB64.sigB64 (both base64url)
  const parts = raw.split(".");
  if (parts.length !== 2) return { bestKills: 0, bestWave: 0 };
  const [payloadB64, sigB64] = parts;

  try {
    const payloadBytes = base64UrlDecode(payloadB64);
    const sigBytes = base64UrlDecode(sigB64);
    const expected = await hmacSha256(keyBytes, payloadBytes);
    if (sigBytes.length !== expected.length) throw new Error("bad sig len");
    for (let i = 0; i < sigBytes.length; i++) {
      if (sigBytes[i] !== expected[i]) throw new Error("sig mismatch");
    }
    const json = new TextDecoder().decode(payloadBytes);
    const obj = JSON.parse(json);
    return {
      bestKills: Number(obj.bestKills) || 0,
      bestWave: Number(obj.bestWave) || 0,
    };
  } catch {
    // tampered or corrupted → reset/regenerate
    return { bestKills: 0, bestWave: 0 };
  }
}

export async function saveHighScore(score) {
  const keyBytes = await getOrCreateDeviceKeyBytes();
  const payload = JSON.stringify({
    bestKills: Number(score.bestKills) || 0,
    bestWave: Number(score.bestWave) || 0,
    v: 1,
  });
  const payloadBytes = new TextEncoder().encode(payload);
  const sig = await hmacSha256(keyBytes, payloadBytes);
  const value = `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(sig)}`;
  setCookie(COOKIE_NAME, value);
}

export async function loadSignedLocal(key, fallbackObj) {
  const keyBytes = await getOrCreateDeviceKeyBytes();
  const raw = localStorage.getItem(`${SIGNED_PREFIX}${key}`);
  if (!raw) return fallbackObj;
  const parts = raw.split(".");
  if (parts.length !== 2) return fallbackObj;
  const [payloadB64, sigB64] = parts;
  try {
    const payloadBytes = base64UrlDecode(payloadB64);
    const sigBytes = base64UrlDecode(sigB64);
    const expected = await hmacSha256(keyBytes, payloadBytes);
    if (sigBytes.length !== expected.length) throw new Error("bad sig len");
    for (let i = 0; i < sigBytes.length; i++) {
      if (sigBytes[i] !== expected[i]) throw new Error("sig mismatch");
    }
    const json = new TextDecoder().decode(payloadBytes);
    return JSON.parse(json);
  } catch {
    return fallbackObj;
  }
}

export async function saveSignedLocal(key, obj) {
  const keyBytes = await getOrCreateDeviceKeyBytes();
  const payload = JSON.stringify(obj ?? null);
  const payloadBytes = new TextEncoder().encode(payload);
  const sig = await hmacSha256(keyBytes, payloadBytes);
  const value = `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(sig)}`;
  localStorage.setItem(`${SIGNED_PREFIX}${key}`, value);
}

