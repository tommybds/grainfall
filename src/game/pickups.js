import { clamp } from "../core/math.js";
import { CFG } from "./config.js";
import { createPickup } from "./entities.js";
import { ensureWeapon, upgradeWeapon, weaponName } from "./weapons.js";

export function maybeDropPickup(game, x, y, enemy) {
  if (game.pickups.length >= CFG.maxPickups) return;

  // base drop chance; slightly higher for elites/boss
  const base = enemy.isBoss ? 0.95 : enemy.kind === "tank" ? 0.22 : 0.12;
  if (Math.random() > base) return;

  // weighted kinds
  const roll = Math.random();
  if (enemy.isBoss && roll < 0.55) {
    game.pickups.push(createPickup({ x, y, kind: "chest", value: 1 }));
    return;
  }
  if (roll < 0.45) {
    game.pickups.push(createPickup({ x, y, kind: "xp", value: enemy.isBoss ? 8 : enemy.xp }));
    return;
  }
  if (roll < 0.7) {
    game.pickups.push(createPickup({ x, y, kind: "heal", value: enemy.isBoss ? 35 : 18 }));
    return;
  }
  game.pickups.push(createPickup({ x, y, kind: "buff", value: 1 }));
}

export function applyPickup(game, p) {
  const player = game.player;
  if (game.discoveredPickups && !game.discoveredPickups[p.kind]) {
    game.discoveredPickups[p.kind] = true;
    const name = p.kind === "heal" ? "HEAL" : p.kind === "xp" ? "XP" : p.kind === "chest" ? "CHEST" : "BUFF";
    game.floats.push({ x: player.x, y: player.y - 30, ttl: 1.4, text: `NEW: ${name}` });
  }
  if (p.kind === "xp") {
    game.audio?.pickup?.("xp");
    player.xp += p.value;
    // simple leveling curve
    while (player.xp >= xpToNext(player.level)) {
      player.xp -= xpToNext(player.level);
      player.level += 1;
      game.floats.push({ x: player.x, y: player.y - 26, ttl: 1.2, text: `LVL ${player.level}` });
      game.audio?.levelUp?.();
      // on level-up, upgrade or unlock a weapon
      grantRandomUpgrade(game);
    }
    return;
  }
  if (p.kind === "heal") {
    game.audio?.pickup?.("heal");
    const before = player.hp;
    player.hp = clamp(player.hp + p.value, 0, player.hpMax);
    game.floats.push({ x: player.x, y: player.y - 18, ttl: 0.9, text: `+${Math.round(player.hp - before)}HP` });
    return;
  }
  if (p.kind === "buff") {
    game.audio?.pickup?.("buff");
    // buff OR weapon improvement (no UI, instant feedback)
    const which = Math.random();
    if (which < 0.34) {
      player.buffs.fireRateMul = clamp(player.buffs.fireRateMul + 0.12, 1, 2.2);
      game.floats.push({ x: player.x, y: player.y - 18, ttl: 1.1, text: "FIRE +" });
    } else if (which < 0.67) {
      player.buffs.dmgMul = clamp(player.buffs.dmgMul + 0.1, 1, 2.2);
      game.floats.push({ x: player.x, y: player.y - 18, ttl: 1.1, text: "DMG +" });
    } else if (which < 0.9) {
      player.buffs.moveSpeedMul = clamp(player.buffs.moveSpeedMul + 0.08, 1, 1.8);
      game.floats.push({ x: player.x, y: player.y - 18, ttl: 1.1, text: "SPD +" });
    } else {
      // small chance: direct weapon upgrade
      grantRandomUpgrade(game);
    }
    return;
  }
  if (p.kind === "chest") {
    game.audio?.pickup?.("chest");
    // guaranteed upgrade(s)
    grantRandomUpgrade(game);
    grantRandomUpgrade(game);
  }
}

function xpToNext(level) {
  // fast early game, slower later
  return Math.round(5 + level * 2.2 + level * level * 0.16);
}

function grantRandomUpgrade(game) {
  const player = game.player;
  const options = ["pistol", "shotgun", "lance"];

  // Prefer upgrading existing weapons (feels like "build" progress),
  // but still allow unlocking missing ones.
  const owned = options.filter((id) => player.weapons.some((w) => w.id === id));
  const missing = options.filter((id) => !player.weapons.some((w) => w.id === id));

  const roll = Math.random();
  const id =
    owned.length && (roll < 0.7 || !missing.length)
      ? owned[(Math.random() * owned.length) | 0]
      : missing[(Math.random() * missing.length) | 0];

  const has = player.weapons.some((w) => w.id === id);
  const w = has ? upgradeWeapon(player, id) : ensureWeapon(player, id);
  game.floats.push({
    x: player.x,
    y: player.y - 22,
    ttl: 1.25,
    text: `${weaponName(w.id)} ${has ? "UP" : "UNLOCK"}`,
  });
}

