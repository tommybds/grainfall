import { clamp } from "../core/math.js";
import { CFG } from "./config.js";
import { createPickup } from "./entities.js";
import { ensureWeapon, upgradeWeapon, weaponName } from "./weapons.js";

export function generateUpgradeChoices(game) {
  const player = game.player;
  const choices = [];

  function pushUnique(c) {
    if (choices.some((x) => x.key === c.key)) return false;
    choices.push(c);
    return true;
  }

  // Always include at least one weapon-related choice.
  {
    const options = ["pistol", "shotgun", "lance", "flame"];
    const owned = options.filter((id) => player.weapons.some((w) => w.id === id));
    const missing = options.filter((id) => !player.weapons.some((w) => w.id === id));
    const roll = Math.random();
    const id =
      owned.length && (roll < 0.65 || !missing.length)
        ? owned[(Math.random() * owned.length) | 0]
        : missing[(Math.random() * missing.length) | 0];
    const has = player.weapons.some((w) => w.id === id);
    pushUnique({
      key: `weapon:${id}`,
      kind: "weapon",
      id,
      title: `${has ? "UP" : "UNLOCK"} ${weaponName(id)}`,
      desc: has ? "Améliore l'arme" : "Débloque l'arme",
    });
  }

  // Fill remaining with buffs/perks.
  const pool = [
    { key: "buff:fire", kind: "buff", id: "fire", title: "FIRE +", desc: "+ cadence de tir" },
    { key: "buff:dmg", kind: "buff", id: "dmg", title: "DMG +", desc: "+ dégâts" },
    { key: "buff:spd", kind: "buff", id: "spd", title: "SPD +", desc: "+ vitesse" },
    { key: "perk:rico", kind: "perk", id: "rico", title: "RICOCHET +", desc: "+ chance de ricochet sur murs" },
    { key: "perk:hp", kind: "perk", id: "hp", title: "HP MAX +", desc: "+10 PV max (heal inclus)" },
    { key: "perk:mag", kind: "perk", id: "mag", title: "MAGNET +", desc: "Attire les bonus de plus loin" },
    { key: "perk:dash", kind: "perk", id: "dash", title: "DASH +", desc: "Dash plus souvent et plus loin" },
  ];

  while (choices.length < 3) {
    const c = pool[(Math.random() * pool.length) | 0];
    pushUnique(c);
  }

  return choices;
}

export function applyUpgradeChoice(game, choice) {
  const player = game.player;
  if (!choice) return;
  if (choice.kind === "weapon") {
    const has = player.weapons.some((w) => w.id === choice.id);
    const w = has ? upgradeWeapon(player, choice.id) : ensureWeapon(player, choice.id);
    game.floats.push({ x: player.x, y: player.y - 22, ttl: 1.25, text: `${weaponName(w.id)} ${has ? "UP" : "UNLOCK"}` });
    return;
  }
  if (choice.kind === "buff") {
    if (choice.id === "fire") player.buffs.fireRateMul = clamp(player.buffs.fireRateMul + 0.12, 1, 2.4);
    else if (choice.id === "dmg") player.buffs.dmgMul = clamp(player.buffs.dmgMul + 0.10, 1, 2.4);
    else if (choice.id === "spd") player.buffs.moveSpeedMul = clamp(player.buffs.moveSpeedMul + 0.08, 1, 1.9);
    game.floats.push({ x: player.x, y: player.y - 18, ttl: 1.1, text: choice.title });
    return;
  }
  if (choice.kind === "perk") {
    if (choice.id === "rico") {
      player.buffs.ricochetChanceAdd = clamp((player.buffs.ricochetChanceAdd || 0) + 0.05, 0, 0.35);
      game.floats.push({ x: player.x, y: player.y - 18, ttl: 1.1, text: "RICOCHET +" });
      return;
    }
    if (choice.id === "hp") {
      player.hpMax += 10;
      player.hp = clamp(player.hp + 10, 0, player.hpMax);
      game.floats.push({ x: player.x, y: player.y - 18, ttl: 1.1, text: "HP MAX +" });
      return;
    }
    if (choice.id === "mag") {
      player.buffs.magnetMul = clamp((player.buffs.magnetMul || 1) + 0.20, 1, 2.4);
      game.floats.push({ x: player.x, y: player.y - 18, ttl: 1.1, text: "MAGNET +" });
      return;
    }
    if (choice.id === "dash") {
      player.buffs.dashCdMul = clamp((player.buffs.dashCdMul || 1) - 0.10, 0.55, 1);
      player.buffs.dashPowMul = clamp((player.buffs.dashPowMul || 1) + 0.08, 1, 1.8);
      game.floats.push({ x: player.x, y: player.y - 18, ttl: 1.1, text: "DASH +" });
    }
  }
}

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
    let gained = 0;
    while (player.xp >= xpToNext(player.level)) {
      player.xp -= xpToNext(player.level);
      player.level += 1;
      gained += 1;
      game.floats.push({ x: player.x, y: player.y - 26, ttl: 1.2, text: `LVL ${player.level}` });
      game.audio?.levelUp?.();
    }
    if (gained > 0) {
      game.openUpgradeMenu?.(gained);
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
    // buff becomes an upgrade-choice trigger (more strategic).
    game.openUpgradeMenu?.(1);
    return;
  }
  if (p.kind === "chest") {
    game.audio?.pickup?.("chest");
    // guaranteed upgrades
    game.openUpgradeMenu?.(2);
  }
}

function xpToNext(level) {
  // fast early game, slower later
  return Math.round(5 + level * 2.2 + level * level * 0.16);
}

// legacy random upgrades removed (we now use upgrade menu choices)

