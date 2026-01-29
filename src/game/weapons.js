import { clamp, len2, norm, randRange } from "../core/math.js";
import { CFG } from "./config.js";
import { createBullet } from "./entities.js";

export const WEAPON_MAX_LEVEL = 4;

function nearestEnemy(enemies, px, py) {
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const d2 = len2(e.x - px, e.y - py);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

function shoot(
  game,
  { tx, ty, speed, dmg, spread = 0, pierce = 0, ttl = 1.1, r = 3, knock = 0, bleedDps = 0, bleedT = 0, dotKind, kind },
) {
  if (game.bullets.length >= CFG.maxBullets) return;
  const dir = norm(tx - game.player.x, ty - game.player.y);
  const a = spread ? (Math.random() - 0.5) * spread : 0;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const rx = dir.x * cs - dir.y * sn;
  const ry = dir.x * sn + dir.y * cs;
  game.bullets.push(
    createBullet({
      x: game.player.x,
      y: game.player.y,
      vx: rx * speed,
      vy: ry * speed,
      dmg,
      ttl,
      r,
      pierce,
      knock,
      bleedDps,
      bleedT,
      dotKind,
      kind: kind || "bullet",
    }),
  );
}

export function weaponName(id) {
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

export function ensureWeapon(player, id) {
  const w = player.weapons.find((x) => x.id === id);
  if (w) return w;
  const nw = { id, cd: randRange(0, 0.4), lvl: 1 };
  player.weapons.push(nw);
  return nw;
}

export function upgradeWeapon(player, id) {
  const w = ensureWeapon(player, id);
  w.lvl = clamp((w.lvl || 1) + 1, 1, WEAPON_MAX_LEVEL);
  return w;
}

export function updateWeapons(dt, game) {
  const { player, enemies } = game;
  if (!enemies.length) return;

  const target = nearestEnemy(enemies, player.x, player.y);
  if (!target) return;

  // Keep player "orientation" in sync with the current aim target (for rendering).
  player.aimAngle = Math.atan2(target.y - player.y, target.x - player.x);

  for (let i = 0; i < player.weapons.length; i++) {
    const w = player.weapons[i];
    w.cd -= dt;
    if (w.cd > 0) continue;

    if (w.id === "pistol") {
      const rate = (6.2 + w.lvl * 0.65) * player.buffs.fireRateMul;
      const dmg = (18 + w.lvl * 4) * player.buffs.dmgMul;
      const speed = 430;
      game.audio?.shoot?.("pistol");
      // Level milestones: extra shots
      const shots = 1 + (w.lvl >= 3 ? 1 : 0) + (w.lvl >= 4 ? 1 : 0);
      if (shots === 1) {
        shoot(game, { tx: target.x, ty: target.y, speed, dmg, spread: 0.12, kind: "pistol" });
      } else {
        for (let s = 0; s < shots; s++) {
          shoot(game, { tx: target.x, ty: target.y, speed, dmg: dmg * 0.8, spread: 0.18, kind: "pistol" });
        }
      }
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "shotgun") {
      const rate = (1.2 + w.lvl * 0.12) * player.buffs.fireRateMul;
      const pellets = 3 + Math.floor(w.lvl / 2) + (w.lvl >= 4 ? 1 : 0);
      const dmg = (10 + w.lvl * 2.5) * player.buffs.dmgMul;
      const speed = 390;
      const spread = w.lvl >= 4 ? 0.62 : 0.75;
      game.audio?.shoot?.("shotgun");
      for (let p = 0; p < pellets; p++) {
        shoot(game, { tx: target.x, ty: target.y, speed, dmg, spread, knock: 22 + w.lvl * 3, kind: "shotgun" });
      }
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "lance") {
      // A slow, high damage piercing shot.
      const rate = (0.55 + w.lvl * 0.05) * player.buffs.fireRateMul;
      const dmg = (34 + w.lvl * 9) * player.buffs.dmgMul;
      const speed = 520;
      game.audio?.shoot?.("lance");
      const pierce = 2 + Math.floor((w.lvl - 1) / 2);
      const ttl = 1.2 + w.lvl * 0.03;
      shoot(game, {
        tx: target.x,
        ty: target.y,
        speed,
        dmg,
        spread: 0.06,
        pierce,
        ttl,
        bleedDps: 6 + w.lvl * 2,
        bleedT: 1.6,
        dotKind: "bleed",
        kind: "lance",
      });
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "flame") {
      // Short-range cone with burn DOT.
      const rate = (10.0 + w.lvl * 1.25) * player.buffs.fireRateMul;
      const dmg = (4.0 + w.lvl * 1.1) * player.buffs.dmgMul;
      const speed = 270;
      const ttl = 0.26 + w.lvl * 0.01;
      const spread = 1.05; // wide cone
      const puffs = 2 + Math.floor(w.lvl / 2); // more density with levels
      const pierce = w.lvl >= 4 ? 1 : 0;
      const burnDps = 5 + w.lvl * 1.6;
      const burnT = 1.2 + w.lvl * 0.08;
      game.audio?.shoot?.("flame");
      for (let p = 0; p < puffs; p++) {
        shoot(game, {
          tx: target.x,
          ty: target.y,
          speed,
          dmg,
          spread,
          ttl,
          r: 8,
          pierce,
          bleedDps: burnDps,
          bleedT: burnT,
          dotKind: "burn",
          kind: "flame",
        });
      }
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "laser") {
      // Hitscan beam (pierces) + applies burn DOT.
      const rate = (0.70 + w.lvl * 0.06) * player.buffs.fireRateMul;
      const dmg = (22 + w.lvl * 6) * player.buffs.dmgMul;
      const burnDps = 8 + w.lvl * 2.4;
      const burnT = 1.1 + w.lvl * 0.08;
      const dir = norm(target.x - player.x, target.y - player.y);
      game.audio?.shoot?.("lance");
      game.bullets.push(
        createBullet({
          x: player.x,
          y: player.y,
          // for laser we store a unit direction (not px/s)
          vx: dir.x,
          vy: dir.y,
          dmg,
          ttl: 0.08,
          r: 0,
          pierce: 999,
          kind: "laser",
          len: 520 + w.lvl * 18,
          width: 10,
          bleedDps: burnDps,
          bleedT: burnT,
          dotKind: "burn",
          didHit: false,
        }),
      );
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "mine") {
      // Place a mine near the player; arms then explodes in AoE.
      const rate = (0.32 + w.lvl * 0.03) * player.buffs.fireRateMul;
      const dmg = (46 + w.lvl * 12) * player.buffs.dmgMul;
      const explodeR = 56 + w.lvl * 5;
      const triggerR = 22;
      game.audio?.shoot?.("pistol");
      game.bullets.push(
        createBullet({
          x: player.x + randRange(-18, 18),
          y: player.y + randRange(-18, 18),
          vx: 0,
          vy: 0,
          dmg,
          ttl: 10.5,
          r: 0,
          pierce: 0,
          kind: "mine",
          armT: 0.35,
          triggerR,
          explodeR,
        }),
      );
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "boomerang") {
      // A returning projectile that can bounce on walls.
      const rate = (0.60 + w.lvl * 0.05) * player.buffs.fireRateMul;
      const dmg = (18 + w.lvl * 5.2) * player.buffs.dmgMul;
      const speed = 360 + w.lvl * 14;
      const ttl = 2.2 + w.lvl * 0.06;
      const pierce = 1 + Math.floor(w.lvl / 2);
      const dir = norm(target.x - player.x, target.y - player.y);
      game.audio?.shoot?.("shotgun");
      game.bullets.push(
        createBullet({
          x: player.x,
          y: player.y,
          vx: dir.x * speed,
          vy: dir.y * speed,
          dmg,
          ttl,
          r: 4,
          pierce,
          kind: "boomerang",
          speed,
          turnT: 0.42 + w.lvl * 0.02,
          returning: false,
        }),
      );
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "tesla") {
      // Chains between close enemies.
      const rate = (0.85 + w.lvl * 0.05) * player.buffs.fireRateMul;
      const dmg = (16 + w.lvl * 4.4) * player.buffs.dmgMul;
      const chains = 2 + Math.floor(w.lvl / 2);
      const chainR = 110 + w.lvl * 6;
      game.audio?.shoot?.("lance");
      game.bullets.push(
        createBullet({
          x: player.x,
          y: player.y,
          vx: 0,
          vy: 0,
          dmg,
          ttl: 0.10,
          r: 0,
          pierce: 0,
          kind: "tesla",
          chains,
          chainR,
          didHit: false,
          points: null,
        }),
      );
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "turret") {
      // Spawns a temporary turret that auto-fires.
      const rate = (0.20 + w.lvl * 0.015) * player.buffs.fireRateMul;
      const ttl = 6.8 + w.lvl * 0.45;
      const fireRate = 2.1 + w.lvl * 0.22;
      const dmg = (10 + w.lvl * 2.8) * player.buffs.dmgMul;
      if (!game.turrets) game.turrets = [];
      if (game.turrets.length < 4) {
        game.turrets.push({
          x: player.x + randRange(-26, 26),
          y: player.y + randRange(-26, 26),
          ttl,
          cd: randRange(0, 0.35),
          rate: fireRate,
          dmg,
          range: (player.range ?? 120) + 40,
        });
        game.floats.push({ x: player.x, y: player.y - 20, ttl: 1.0, text: "TURRET" });
      }
      w.cd = 1 / rate;
      continue;
    }
  }
}

