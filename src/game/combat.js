import { clamp, len2, norm } from "../core/math.js";
import { CFG } from "./config.js";
import { createBullet } from "./entities.js";
import { maybeDropPickup } from "./pickups.js";

export function updateEnemies(dt, game) {
  const { enemies, player, state } = game;
  const spMul = state.difficulty;
  const dmgMul = state.diff?.enemyDmgMul ?? 1;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const toP = norm(player.x - e.x, player.y - e.y);
    const spd = e.speed * spMul;
    e.vx = toP.x * spd;
    e.vy = toP.y * spd;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    // special: spitter shoots low-dmg bullets
    if (e.kind === "spitter") {
      e.shootCd -= dt;
      if (e.shootCd <= 0) {
        e.shootCd = clamp(1.9 - state.wave * 0.08, 0.6, 1.9);
        // shoot towards player
        const dv = norm(player.x - e.x, player.y - e.y);
        game.enemyBullets.push(
          createBullet({
            x: e.x,
            y: e.y,
            vx: dv.x * 240,
            vy: dv.y * 240,
            dmg: 9 + state.wave * 0.6,
            ttl: 2.1,
            r: 3,
          }),
        );
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
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.ttl <= 0) {
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
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.ttl <= 0) {
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

