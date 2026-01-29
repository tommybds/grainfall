import { clamp, len2, norm } from "../core/math.js";
import { CFG } from "./config.js";
import { createBullet } from "./entities.js";
import { maybeDropPickup } from "./pickups.js";
import { sampleTile, worldToCell } from "./world.js";

function bulletHitWall(mapId, x, y) {
  const c = worldToCell(x, y);
  return sampleTile(mapId, c.cx, c.cy).wall;
}

function bounceOrDestroyBullet({
  bullet,
  prevX,
  prevY,
  mapId,
  ricochetChance = 0.35,
  dampMin = 0.72,
  dampMax = 0.90,
}) {
  if (!bulletHitWall(mapId, bullet.x, bullet.y)) return "none";

  // Usually destroy; sometimes ricochet.
  if (Math.random() > ricochetChance) return "destroy";

  // Bounce based on which grid cell we entered from.
  const c0 = worldToCell(prevX, prevY);
  const c1 = worldToCell(bullet.x, bullet.y);
  const dx = c1.cx - c0.cx;
  const dy = c1.cy - c0.cy;

  // Place bullet back outside the wall to avoid getting stuck inside it.
  bullet.x = prevX;
  bullet.y = prevY;

  const damp = dampMin + Math.random() * (dampMax - dampMin);

  if (dx !== 0 && dy === 0) {
    bullet.vx *= -damp;
    bullet.vy *= damp;
  } else if (dy !== 0 && dx === 0) {
    bullet.vy *= -damp;
    bullet.vx *= damp;
  } else if (dx !== 0 && dy !== 0) {
    // Corner / big dt: bounce on the dominant axis (or random tie-breaker)
    if (Math.abs(bullet.vx) > Math.abs(bullet.vy)) bullet.vx *= -damp;
    else if (Math.abs(bullet.vy) > Math.abs(bullet.vx)) bullet.vy *= -damp;
    else (Math.random() < 0.5 ? (bullet.vx *= -damp) : (bullet.vy *= -damp));
  } else {
    // Same cell but inside wall (rare): flip a random axis.
    (Math.random() < 0.5 ? (bullet.vx *= -damp) : (bullet.vy *= -damp));
  }

  // Small penalty so infinite wall-bouncing doesn't happen.
  bullet.ttl *= 0.92;
  if (bullet.pierce > 0) bullet.pierce = Math.max(0, bullet.pierce - 1);
  // Synergy: ricochet makes the bullet a bit stronger.
  bullet.dmg *= 1.08;

  return "bounce";
}

export function updateEnemies(dt, game) {
  const { enemies, player, state } = game;
  const spMul = state.difficulty;
  const dmgMul = state.diff?.enemyDmgMul ?? 1;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    // Bleed / DOT
    if ((e.bleedT || 0) > 0) {
      e.bleedT = Math.max(0, e.bleedT - dt);
      e.hp -= (e.bleedDps || 0) * dt;
      if (e.hp <= 0) {
        game.audio?.explode?.(!!e.isBoss);
        enemies.splice(i, 1);
        game.state.kills += 1;
        game.floats.push({ x: e.x, y: e.y - 18, ttl: 0.9, text: "+1" });
        maybeDropPickup(game, e.x, e.y, e);
        continue;
      }
    }
    const toP = norm(player.x - e.x, player.y - e.y);
    const spd = e.speed * spMul;
    e.vx = toP.x * spd;
    e.vy = toP.y * spd;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    // special: spitter shoots low-dmg bullets
    if (e.kind === "spitter") {
      // wind-up telegraph, then fire
      if ((e.windT || 0) > 0) {
        e.windT = Math.max(0, e.windT - dt);
        if (e.windT <= 0) {
          game.enemyBullets.push(
            createBullet({
              x: e.x,
              y: e.y,
              vx: (e.windDx || 0) * 240,
              vy: (e.windDy || 0) * 240,
              dmg: e.windDmg || (9 + state.wave * 0.6),
              ttl: 2.1,
              r: 3,
              kind: "spit",
            }),
          );
        }
      } else {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          e.shootCd = clamp(1.9 - state.wave * 0.08, 0.6, 1.9);
          const dv = norm(player.x - e.x, player.y - e.y);
          e.windT = 0.28;
          e.windDx = dv.x;
          e.windDy = dv.y;
          e.windDmg = 9 + state.wave * 0.6;
        }
      }
    }

    // special: boss summons
    if (e.isBoss) {
      e.summonCd -= dt;
      if (e.summonCd <= 0) {
        e.summonCd = clamp(2.6 - state.wave * 0.06, 1.2, 2.6);
        // spawn 2-4 minions near boss
        const n = 2 + ((Math.random() * 3) | 0);
        for (let k = 0; k < n; k++) {
          game.spawnEnemyNear(e.x, e.y, Math.random() < 0.55 ? "fast" : "walker");
        }
      }
    }

    // contact damage
    const rr = e.r + player.r;
    if (len2(e.x - player.x, e.y - player.y) <= rr * rr) {
      const dps = CFG.contactDpsBase * e.dmgMul * spMul * dmgMul;
      player.hp -= dps * dt;
      game.state.hitFlash = 0.12;
      game.state.damageAngle = Math.atan2(e.y - player.y, e.x - player.x);
      game.state.damageT = 0.8;
      game.audio?.hit?.(true);
      if (player.hp <= 0) {
        player.hp = 0;
        game.endGame();
        return;
      }
    }
  }
}

export function updateBullets(dt, game) {
  const { bullets, enemies } = game;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.ttl -= dt;
    const prevX = b.x;
    const prevY = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.ttl <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    // Walls: mostly destroy, sometimes ricochet.
    const baseRicochetChance = clamp(0.32 + (game.player?.buffs?.ricochetChanceAdd || 0), 0, 0.82);
    const ricochetChance = b.kind === "flame" ? 0 : baseRicochetChance;
    const wallRes = bounceOrDestroyBullet({
      bullet: b,
      prevX,
      prevY,
      mapId: game.selectedMapId,
      ricochetChance,
      dampMin: 0.70,
      dampMax: 0.88,
    });
    if (wallRes === "destroy") {
      bullets.splice(i, 1);
      continue;
    }

    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const rr = b.r + e.r;
      if (len2(b.x - e.x, b.y - e.y) <= rr * rr) {
        e.hp -= b.dmg;
        game.audio?.hit?.(false);
        game.floats.push({ x: e.x, y: e.y - 12, ttl: 0.8, text: `-${Math.round(b.dmg)}` });

        // Knockback (shotgun)
        if ((b.knock || 0) > 0) {
          const dv = norm(b.vx || 0, b.vy || 0);
          e.x += dv.x * (b.knock || 0) * 0.08;
          e.y += dv.y * (b.knock || 0) * 0.08;
        }
        // Bleed (lance)
        if ((b.bleedT || 0) > 0 && (b.bleedDps || 0) > 0) {
          e.bleedT = Math.max(e.bleedT || 0, b.bleedT || 0);
          e.bleedDps = Math.max(e.bleedDps || 0, b.bleedDps || 0);
        }

        if (b.pierce > 0) {
          b.pierce -= 1;
          // tiny deflect
          b.vx *= 0.98;
          b.vy *= 0.98;
        } else {
          bullets.splice(i, 1);
        }

        if (e.hp <= 0) {
          game.audio?.explode?.(!!e.isBoss);
          enemies.splice(j, 1);
          game.state.kills += 1;
          game.floats.push({ x: e.x, y: e.y - 18, ttl: 0.9, text: "+1" });
          maybeDropPickup(game, e.x, e.y, e);
        }
        break;
      }
    }
  }
}

export function updateEnemyBullets(dt, game) {
  const { enemyBullets, player } = game;
  const dmgMul = game.state.diff?.enemyDmgMul ?? 1;
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.ttl -= dt;
    const prevX = b.x;
    const prevY = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.ttl <= 0) {
      enemyBullets.splice(i, 1);
      continue;
    }

    // Enemy bullets are destroyed on walls (fairness/readability).
    if (bulletHitWall(game.selectedMapId, b.x, b.y) && !bulletHitWall(game.selectedMapId, prevX, prevY)) {
      enemyBullets.splice(i, 1);
      continue;
    }

    const rr = b.r + player.r;
    if (len2(b.x - player.x, b.y - player.y) <= rr * rr) {
      player.hp -= b.dmg * dmgMul;
      game.state.hitFlash = 0.18;
      game.state.damageAngle = Math.atan2(b.y - player.y, b.x - player.x);
      game.state.damageT = 0.9;
      game.audio?.hit?.(true);
      enemyBullets.splice(i, 1);
      game.floats.push({ x: player.x, y: player.y - 18, ttl: 0.8, text: `-${Math.round(b.dmg * dmgMul)}` });
      if (player.hp <= 0) {
        player.hp = 0;
        game.endGame();
        return;
      }
    }
  }
}

