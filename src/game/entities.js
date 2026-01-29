import { randRange } from "../core/math.js";
import { ensureWeapon } from "./weapons.js";

export function createPlayer(hero) {
  const p = {
    heroId: hero?.id ?? "runner",
    glyph: hero?.glyph ?? "@",
    range: hero?.range ?? 120,
    aimAngle: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    lastMoveX: 1,
    lastMoveY: 0,
    r: 8,
    hp: hero?.hpMax ?? 100,
    hpMax: hero?.hpMax ?? 100,
    speed: hero?.speed ?? 175,
    xp: 0,
    level: 1,
    // weapons are stored as instances
    weapons: [
      {
        id: "pistol",
        cd: 0,
        lvl: 1,
      },
    ],
    // temporary buffs
    buffs: {
      fireRateMul: hero?.buffs?.fireRateMul ?? 1,
      moveSpeedMul: hero?.buffs?.moveSpeedMul ?? 1,
      dmgMul: hero?.buffs?.dmgMul ?? 1,
      // gameplay perks (small, stackable)
      ricochetChanceAdd: 0, // added to base wall ricochet chance
      magnetMul: 1,
      dashCdMul: 1,
      dashPowMul: 1,
      // synergies
      critChance: 0,
      critMul: 1.6,
      critBurn: false,
      executeMul: 1,
      burnSpread: 0,
    },
  };
  // apply start weapons
  const ws = hero?.startWeapons || ["pistol"];
  for (let i = 0; i < ws.length; i++) ensureWeapon(p, ws[i]);
  // align hp
  p.hp = p.hpMax;
  return p;
}

export function createBullet({
  x,
  y,
  vx,
  vy,
  dmg,
  ttl = 1.1,
  r = 3,
  pierce = 0,
  knock = 0,
  bleedDps = 0,
  bleedT = 0,
  kind = "bullet",
  ...rest
}) {
  return { x, y, vx, vy, dmg, ttl, r, pierce, knock, bleedDps, bleedT, kind, ...rest };
}

export function createPickup({ x, y, kind, value = 1 }) {
  return { x, y, kind, value, ttl: 16 };
}

export function createEnemy({ x, y, kind, wave, diff }) {
  const mHp = diff?.enemyHpMul ?? 1;
  const mSp = diff?.enemySpeedMul ?? 1;
  if (kind === "fast") {
    const hpMax = (22 + wave * 4 + randRange(0, 10)) * mHp;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 8,
      hp: hpMax,
      hpMax,
      speed: (78 + wave * 3.4 + randRange(0, 12)) * mSp,
      dmgMul: 0.9,
      xp: 1,
      isBoss: false,
    };
  }
  if (kind === "tank") {
    const hpMax = (62 + wave * 10 + randRange(0, 20)) * mHp;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 11,
      hp: hpMax,
      hpMax,
      speed: (34 + wave * 1.4 + randRange(0, 6)) * mSp,
      dmgMul: 1.25,
      xp: 3,
      isBoss: false,
    };
  }
  if (kind === "spitter") {
    const hpMax = (36 + wave * 7 + randRange(0, 14)) * mHp;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 10,
      hp: hpMax,
      hpMax,
      speed: (46 + wave * 2.0 + randRange(0, 8)) * mSp,
      dmgMul: 1,
      xp: 2,
      isBoss: false,
      shootCd: randRange(0.2, 1.0),
      // telegraph before shooting
      windT: 0,
      windDx: 0,
      windDy: 0,
      windDmg: 0,
    };
  }
  if (kind === "shield") {
    const hpMax = (56 + wave * 9 + randRange(0, 18)) * mHp;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 12,
      hp: hpMax,
      hpMax,
      speed: (34 + wave * 1.6 + randRange(0, 6)) * mSp,
      dmgMul: 1.15,
      xp: 3,
      isBoss: false,
      shieldMul: 0.42, // frontal damage multiplier
    };
  }
  if (kind === "charger") {
    const hpMax = (40 + wave * 7 + randRange(0, 14)) * mHp;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 10,
      hp: hpMax,
      hpMax,
      speed: (52 + wave * 2.2 + randRange(0, 10)) * mSp,
      dmgMul: 1.1,
      xp: 2,
      isBoss: false,
      chargeCd: randRange(0.8, 1.8),
      chargeWindT: 0,
      chargeT: 0,
      chargeDx: 0,
      chargeDy: 0,
    };
  }
  if (kind === "exploder") {
    const hpMax = (26 + wave * 5 + randRange(0, 10)) * mHp;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 10,
      hp: hpMax,
      hpMax,
      speed: (66 + wave * 2.6 + randRange(0, 12)) * mSp,
      dmgMul: 1.0,
      xp: 2,
      isBoss: false,
      boomR: 42,
      boomDmg: 26 + wave * 1.2,
    };
  }
  if (kind === "summoner") {
    const hpMax = (44 + wave * 8 + randRange(0, 16)) * mHp;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 11,
      hp: hpMax,
      hpMax,
      speed: (30 + wave * 1.2 + randRange(0, 6)) * mSp,
      dmgMul: 1.0,
      xp: 3,
      isBoss: false,
      summonCd: randRange(1.2, 2.6),
    };
  }
  if (kind === "boss") {
    const hpMax = (520 + wave * 160) * mHp;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 18,
      hp: hpMax,
      hpMax,
      speed: (26 + wave * 0.9) * mSp,
      dmgMul: 2.0,
      xp: 20,
      isBoss: true,
      phase: 0,
      summonCd: 2.5,
    };
  }
  // default walker
  const hpMax = (32 + wave * 6 + randRange(0, 10)) * mHp;
  return {
    kind: "walker",
    x,
    y,
    vx: 0,
    vy: 0,
    r: 9,
    hp: hpMax,
    hpMax,
    speed: (46 + wave * 2.2 + randRange(0, 10)) * mSp,
    dmgMul: 1,
    xp: 1,
    isBoss: false,
  };
}

