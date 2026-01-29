import { clamp, len2, norm, randRange } from "../core/math.js";
import { CFG } from "./config.js";
import { createBullet } from "./entities.js";

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

function shoot(game, { tx, ty, speed, dmg, spread = 0, pierce = 0, ttl = 1.1 }) {
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
      pierce,
    }),
  );
}

export function weaponName(id) {
  if (id === "pistol") return "Pistol";
  if (id === "shotgun") return "Shotgun";
  if (id === "lance") return "Lance";
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
  w.lvl = clamp((w.lvl || 1) + 1, 1, 7);
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
      const shots = 1 + (w.lvl >= 4 ? 1 : 0) + (w.lvl >= 7 ? 1 : 0);
      if (shots === 1) {
        shoot(game, { tx: target.x, ty: target.y, speed, dmg, spread: 0.12 });
      } else {
        for (let s = 0; s < shots; s++) {
          shoot(game, { tx: target.x, ty: target.y, speed, dmg: dmg * 0.8, spread: 0.18 });
        }
      }
      w.cd = 1 / rate;
      continue;
    }

    if (w.id === "shotgun") {
      const rate = (1.2 + w.lvl * 0.12) * player.buffs.fireRateMul;
      const pellets = 3 + Math.floor(w.lvl / 2) + (w.lvl >= 6 ? 2 : 0);
      const dmg = (10 + w.lvl * 2.5) * player.buffs.dmgMul;
      const speed = 390;
      const spread = w.lvl >= 5 ? 0.62 : 0.75;
      game.audio?.shoot?.("shotgun");
      for (let p = 0; p < pellets; p++) {
        shoot(game, { tx: target.x, ty: target.y, speed, dmg, spread });
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
      shoot(game, { tx: target.x, ty: target.y, speed, dmg, spread: 0.06, pierce, ttl });
      w.cd = 1 / rate;
      continue;
    }
  }
}

