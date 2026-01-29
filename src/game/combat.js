import { clamp, len2, norm } from "../core/math.js";
import { CFG } from "./config.js";
import { createBullet } from "./entities.js";
import { maybeDropPickup } from "./pickups.js";
import { sampleTile, worldToCell } from "./world.js";
import { recordKill, updateAchievements } from "./stats.js";

function killEnemy(game, idx, sourceKind) {
  const e = game.enemies[idx];
  if (!e) return;
  const weaponKind = sourceKind || e.dotSourceKind || e.lastHitKind || "unknown";
  try {
    recordKill({ run: game.runStats, lifetime: game.lifetimeStats, weaponKind, enemyKind: e.kind || "unknown" });
    updateAchievements(game.lifetimeStats);
  } catch {
    // ignore
  }
  game.audio?.explode?.(!!e.isBoss);
  game.enemies.splice(idx, 1);
  game.state.kills += 1;
  game.floats.push({ x: e.x, y: e.y - 18, ttl: 0.9, text: "+1" });
  maybeDropPickup(game, e.x, e.y, e);
}

function dealEnemyDamage(game, e, dmg, dirX = 0, dirY = 0) {
  const p = game.player;
  let out = dmg;

  // Shield enemy: reduce frontal hits (enemy "front" faces the player)
  if (e.kind === "shield" && (e.shieldMul || 0) > 0 && (dirX || dirY)) {
    const face = norm(p.x - e.x, p.y - e.y); // enemy -> player
    const inc = norm(dirX, dirY); // projectile direction (approx)
    const dot = inc.x * face.x + inc.y * face.y;
    // Incoming from the player's side => dot is negative (since projectile travels player->enemy).
    if (dot < -0.25) out *= e.shieldMul || 0.42;
  }

  // Execute: bonus damage under 20% HP
  if ((p?.buffs?.executeMul || 1) > 1 && (e.hpMax || 0) > 0) {
    const pct = e.hp / e.hpMax;
    if (pct <= 0.2) out *= p.buffs.executeMul || 1;
  }
  // Crit: chance + multiplier
  let crit = false;
  const cc = p?.buffs?.critChance || 0;
  if (cc > 0 && Math.random() < cc) {
    crit = true;
    out *= p?.buffs?.critMul || 1.6;
  }

  e.hp -= out;
  game.audio?.hit?.(false);
  game.floats.push({ x: e.x, y: e.y - 12, ttl: 0.8, text: `-${Math.round(out)}${crit ? "!" : ""}` });

  // Crit burn: applies a small burn DOT
  if (crit && p?.buffs?.critBurn) {
    const burnDps = 10;
    const burnT = 1.2;
    e.bleedT = Math.max(e.bleedT || 0, burnT);
    e.bleedDps = Math.max(e.bleedDps || 0, burnDps);
    e.dotKind = "burn";
    e.dotSourceKind = e.lastHitKind || e.dotSourceKind || "unknown";
  }
}

function distPointToSegmentSq(px, py, x0, y0, x1, y1) {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const wx = px - x0;
  const wy = py - y0;
  const vv = vx * vx + vy * vy;
  const t = vv > 0.000001 ? clamp((wx * vx + wy * vy) / vv, 0, 1) : 0;
  const cx = x0 + vx * t;
  const cy = y0 + vy * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

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

      // Synergy: burn spreads to nearby enemies
      if ((game.player?.buffs?.burnSpread || 0) > 0 && e.dotKind === "burn") {
        e.burnSpreadCd = Math.max(0, (e.burnSpreadCd || 0) - dt);
        if ((e.burnSpreadCd || 0) <= 0) {
          e.burnSpreadCd = 0.55;
          const level = game.player?.buffs?.burnSpread || 0;
          const r = 56 + level * 14;
          const r2 = r * r;
          for (let k = 0; k < enemies.length; k++) {
            const o = enemies[k];
            if (o === e) continue;
            if (o.dotKind === "burn" && (o.bleedT || 0) > 0) continue;
            if (len2(o.x - e.x, o.y - e.y) > r2) continue;
            o.bleedT = Math.max(o.bleedT || 0, Math.min(0.9, e.bleedT || 0));
            o.bleedDps = Math.max(o.bleedDps || 0, (e.bleedDps || 0) * 0.7);
            o.dotKind = "burn";
            break;
          }
        }
      }

      if (e.hp <= 0) {
        killEnemy(game, i, e.dotSourceKind || e.lastHitKind);
        continue;
      }
    }
    const toP = norm(player.x - e.x, player.y - e.y);
    const spd = e.speed * spMul;
    // default steering movement (can be overridden by special kinds below)
    e.vx = toP.x * spd;
    e.vy = toP.y * spd;

    // special: charger (wind-up then dash)
    if (e.kind === "charger") {
      if ((e.chargeWindT || 0) > 0) {
        e.chargeWindT = Math.max(0, (e.chargeWindT || 0) - dt);
        // stop while telegraphing
        e.vx = 0;
        e.vy = 0;
        if ((e.chargeWindT || 0) === 0) e.chargeT = 0.22;
      } else if ((e.chargeT || 0) > 0) {
        e.chargeT = Math.max(0, (e.chargeT || 0) - dt);
        const dashSp = spd * 4.2;
        e.vx = (e.chargeDx || toP.x) * dashSp;
        e.vy = (e.chargeDy || toP.y) * dashSp;
      } else {
        e.chargeCd = (e.chargeCd || 0) - dt;
        if ((e.chargeCd || 0) <= 0) {
          e.chargeCd = clamp(2.4 - state.wave * 0.03, 1.4, 2.4);
          e.chargeWindT = 0.28;
          e.chargeDx = toP.x;
          e.chargeDy = toP.y;
        }
      }
    }

    // special: summoner (keeps some distance, periodically spawns adds)
    if (e.kind === "summoner") {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d2 = dx * dx + dy * dy;
      const keepAway = 150;
      const dir = d2 < keepAway * keepAway ? norm(-dx, -dy) : toP;
      e.vx = dir.x * spd;
      e.vy = dir.y * spd;
      e.summonCd = (e.summonCd || 0) - dt;
      if ((e.summonCd || 0) <= 0) {
        e.summonCd = clamp(3.0 - state.wave * 0.04, 1.6, 3.0);
        const n = 2 + ((Math.random() * 2) | 0);
        for (let k = 0; k < n; k++) {
          game.spawnEnemyNear(e.x, e.y, Math.random() < 0.6 ? "fast" : "walker");
        }
      }
    }

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
      // exploder: kamikaze burst, then despawn
      if (e.kind === "exploder") {
        const boom = (e.boomDmg || 28) * dmgMul;
        player.hp -= boom;
        game.state.hitFlash = 0.22;
        game.state.damageAngle = Math.atan2(e.y - player.y, e.x - player.x);
        game.state.damageT = 0.95;
        game.audio?.hit?.(true);
        enemies.splice(i, 1);
        if (player.hp <= 0) {
          player.hp = 0;
          game.endGame();
          return;
        }
        continue;
      }
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
    if (b.ttl <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    // Per-bullet cooldown (prevents multi-hit spam when overlapping).
    if (b.kind === "boomerang") {
      b.hitCd = Math.max(0, (b.hitCd || 0) - dt);
    }

    // Special bullets (not classic moving projectiles)
    if (b.kind === "laser") {
      if (!b.didHit) {
        b.didHit = true;
        const x0 = b.x;
        const y0 = b.y;
        const len = b.len || 520;
        const x1 = x0 + (b.vx || 0) * len;
        const y1 = y0 + (b.vy || 0) * len;
        const w = b.width || 10;

        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          const rr = (e.r || 0) + w;
          if (distPointToSegmentSq(e.x, e.y, x0, y0, x1, y1) <= rr * rr) {
            e.lastHitKind = "laser";
            dealEnemyDamage(game, e, b.dmg || 0, b.vx || 0, b.vy || 0);
            // burn DOT (stored in bleed fields for now)
            if ((b.bleedT || 0) > 0 && (b.bleedDps || 0) > 0) {
              e.bleedT = Math.max(e.bleedT || 0, b.bleedT || 0);
              e.bleedDps = Math.max(e.bleedDps || 0, b.bleedDps || 0);
              e.dotKind = b.dotKind || e.dotKind;
              e.dotSourceKind = "laser";
            }
            if (e.hp <= 0) killEnemy(game, j, "laser");
          }
        }
      }
      continue;
    }

    if (b.kind === "tesla") {
      if (!b.didHit) {
        b.didHit = true;
        const points = [];
        const hit = new Set();
        let curX = b.x;
        let curY = b.y;
        // Avoid splicing `enemies` during chaining (keeps indices stable).
        const pendingKills = [];

        // first target: nearest to (curX,curY)
        for (let step = 0; step < (b.chains || 1); step++) {
          let best = null;
          let bestD2 = Infinity;
          for (let j = 0; j < enemies.length; j++) {
            const e = enemies[j];
            if (hit.has(e)) continue;
            const dx = e.x - curX;
            const dy = e.y - curY;
            const d2 = dx * dx + dy * dy;
            if (step > 0 && d2 > (b.chainR || 110) * (b.chainR || 110)) continue;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = e;
            }
          }
          if (!best) break;
          const e = best;
          hit.add(e);
          points.push({ x: e.x, y: e.y });
          // diminishing damage along the chain
          const mul = 1 - step * 0.12;
          e.lastHitKind = "tesla";
          dealEnemyDamage(game, e, (b.dmg || 0) * clamp(mul, 0.35, 1));
          if (e.hp <= 0) pendingKills.push(e);
          curX = e.x;
          curY = e.y;
        }
        b.points = points;

        if (pendingKills.length) {
          for (let j = enemies.length - 1; j >= 0; j--) {
            if (pendingKills.includes(enemies[j])) killEnemy(game, j, "tesla");
          }
        }
      }
      continue;
    }

    if (b.kind === "mine") {
      b.armT = Math.max(0, (b.armT || 0) - dt);
      if ((b.armT || 0) > 0) continue;
      const tr = b.triggerR || 22;
      const tr2 = tr * tr;
      let triggered = false;
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (len2(e.x - b.x, e.y - b.y) <= (e.r + tr) * (e.r + tr)) {
          triggered = true;
          break;
        }
      }
      if (!triggered) continue;

      // explode
      const ex = b.x;
      const ey = b.y;
      const rr = b.explodeR || 60;
      const rr2 = rr * rr;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (len2(e.x - ex, e.y - ey) <= (e.r + rr) * (e.r + rr)) {
          e.lastHitKind = "mine";
          dealEnemyDamage(game, e, b.dmg || 0);
          if (e.hp <= 0) killEnemy(game, j, "mine");
        }
      }
      // fx ring (rendered in renderer)
      if (bullets.length < CFG.maxBullets) {
        bullets.push({ x: ex, y: ey, vx: 0, vy: 0, dmg: 0, ttl: 0.22, r: 0, kind: "explosionFx", radius: rr });
      }
      bullets.splice(i, 1);
      continue;
    }

    if (b.kind === "boomerang") {
      b.turnT = Math.max(0, (b.turnT || 0) - dt);
      if (!b.returning && (b.turnT || 0) <= 0) b.returning = true;
      if (b.returning) {
        const toP = norm(game.player.x - b.x, game.player.y - b.y);
        const sp = b.speed || 360;
        b.vx = toP.x * sp;
        b.vy = toP.y * sp;
        // catch: remove when back to player
        if (len2(b.x - game.player.x, b.y - game.player.y) <= 18 * 18) {
          bullets.splice(i, 1);
          continue;
        }
      }
    }

    // classic movement
    b.x += (b.vx || 0) * dt;
    b.y += (b.vy || 0) * dt;

    // Walls: mostly destroy, sometimes ricochet.
    const baseRicochetChance = clamp(0.32 + (game.player?.buffs?.ricochetChanceAdd || 0), 0, 0.82);
    const ricochetChance = b.kind === "flame" ? 0 : b.kind === "boomerang" ? 0.95 : baseRicochetChance;
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

    // Boomerang: if we're in hit cooldown, skip collision this frame.
    if (b.kind === "boomerang" && (b.hitCd || 0) > 0) continue;

    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const rr = b.r + e.r;
      if (len2(b.x - e.x, b.y - e.y) <= rr * rr) {
        e.lastHitKind = b.kind || "bullet";
        dealEnemyDamage(game, e, b.dmg, b.vx || 0, b.vy || 0);

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
          e.dotKind = b.dotKind || e.dotKind;
          e.dotSourceKind = b.kind || e.dotSourceKind;
        }

        if (b.kind === "boomerang") {
          // Keep boomerang alive: it should return to player instead of being destroyed on first hits.
          b.hitCd = 0.075;
          if ((b.pierce || 0) > 0) b.pierce -= 1;
          // Once out of pierce, force return so it doesn't stay in the enemy pack.
          if ((b.pierce || 0) <= 0) {
            b.pierce = 0;
            b.returning = true;
            b.turnT = 0;
            const toP = norm(game.player.x - b.x, game.player.y - b.y);
            const sp = b.speed || 360;
            b.vx = toP.x * sp;
            b.vy = toP.y * sp;
          } else {
            // small deflect so successive hits feel like "bounces"
            b.vx *= 0.92;
            b.vy *= 0.92;
          }
        } else if (b.pierce > 0) {
          b.pierce -= 1;
          // tiny deflect
          b.vx *= 0.98;
          b.vy *= 0.98;
        } else {
          bullets.splice(i, 1);
        }

        if (e.hp <= 0) {
          killEnemy(game, j, b.kind);
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

