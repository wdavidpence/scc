// P1.031-i1 — Pure combat execution kernel (no Phaser, no DOM).
// Single source for damage arithmetic and projectile flight, called by BOTH
// the live BattleScene and the headless combat golden gate
// (scripts/verify-combat-golden.cjs) — a fork between live and replay is a
// bug in this module, not harness drift.
//
// Extraction rule (same as simEconomy P1.030): every function here is moved
// VERBATIM from its original site; the scene/entity keeps only FX + event
// plumbing around the call. Semantics are frozen by the golden pins.

import { SIZE_MULT } from '../data/sc1.js';

export function sizeMult(attackType, size) {
  return SIZE_MULT[attackType]?.[size] ?? 1;
}

// verbatim entity.js effectiveDamage (was exported there; BattleScene and
// Unit.fireAt now call SC.effectiveDamage directly)
export function effectiveDamage(attacker, target) {
  const mult = SIZE_MULT[attacker.def.attackType]?.[target.def.size] ?? 1;
  const armor = target.def.armor + (target.bonusArmor || 0);
  let dmg = (attacker.def.damage + (attacker.bonusDamage || 0)) * mult - armor;
  // v2.34 SC1 high ground: +2 when attacker stands strictly higher
  if (attacker.world?.elevAt && attacker.world.elevAt(attacker.x, attacker.y) > attacker.world.elevAt(target.x, target.y)) dmg += 2;
  return Math.max(1, Math.round(dmg));
}

// shield-then-hp absorption, verbatim arithmetic from Unit/Building
// takeDamage. Mutates entity.shield/.hp; sets shieldRegenDelay=5 ONLY when
// the entity carries the property (units do, structures never did).
// Returns the amount absorbed by shields (FX branch condition).
export function absorb(entity, amount) {
  let s = 0;
  if (entity.shield > 0) {
    s = Math.min(entity.shield, amount);
    entity.shield -= s;
    amount -= s;
    if (entity.shieldRegenDelay !== undefined) entity.shieldRegenDelay = 5;
  }
  entity.hp -= amount;
  return s;
}

// splash falloff curves, verbatim from BattleScene.applyHit (unit + building)
export function unitSplashDamage(damage, sd, splash) {
  // SC1-style falloff: full damage at center -> ~40% at blast edge
  const falloff = Math.max(0.4, 1 - 0.6 * Math.min(1, sd / Math.max(1, splash)));
  return Math.ceil(damage * falloff);
}

export function bldgSplashDamage(damage, sd, splash) {
  return Math.ceil(damage * Math.max(0.3, 0.5 * (1 - 0.5 * Math.min(1, sd / Math.max(1, splash)))));
}

// one blast's secondary damage pass, verbatim loops from applyHit:
// units (skip dead, team-undefined, the blast target itself), buildings
// (skip dead, same-team-as-target). Range checks included.
export function splashPass(world, target, damage, splash, attacker) {
  for (const u of world.units) {
    if (u.dead || u.team === undefined) continue;
    if (u === target) continue;
    const sd = Math.hypot(u.x - target.x, u.y - target.y);
    if (sd <= splash + u.radius) {
      u.takeDamage(unitSplashDamage(damage, sd, splash), attacker);
    }
  }
  for (const b of world.buildings) {
    if (b.dead || b.team === target.team) continue;
    const sd = Math.hypot(b.x - target.x, b.y - target.y);
    if (sd <= splash + 16) b.takeDamage(bldgSplashDamage(damage, sd, splash), attacker);
  }
}

// turret / bunker-garrison shot math (no veterancy bonus — structure math)
export function structureShot(baseDamage, attackType, target) {
  const mult = SIZE_MULT[attackType]?.[target.def.size] ?? 1;
  return Math.max(1, Math.round(baseDamage * mult - target.def.armor));
}

// burrower strike secondary falloff (ring of 80% around the direct hit)
export function secondaryDamage(dmg) {
  return Math.round(dmg * 0.8);
}

// P1.028 single-source projectile flight, now callable headlessly.
// Flight state lives in world.projectiles[]; sprite mirrors (pr.spr) are
// optional — a missing sprite cannot skip or delay the hit tick.
// applyHit(target, damage, splash, attacker) is injected (scene OR fake
// world), so the LIVE damage landing chain and the replay run the same
// tick semantics.
export function stepProjectiles(world, dt, applyHit) {
  for (const pr of world.projectiles) {
    if (pr.dead) continue;
    if (!pr.target || pr.target.dead) { pr.dead = true; if (pr.spr && pr.spr.active !== false) pr.spr.destroy(); continue; }
    const dx = pr.target.x - pr.x, dy = pr.target.y - pr.y;
    const d = Math.hypot(dx, dy);
    const step = pr.speed * dt;
    if (d <= step + pr.target.radius) {
      applyHit(pr.target, pr.damage, pr.splash, pr.attacker);
      pr.dead = true;
      if (pr.spr && pr.spr.active !== false) pr.spr.destroy();
      continue;
    }
    pr.x += (dx / d) * step; pr.y += (dy / d) * step;
    if (pr.spr && pr.spr.active !== false) { pr.spr.x = pr.x; pr.spr.y = pr.y; }
  }
  if (world.projectiles.length && world.projectiles.some(pr => pr.dead)) world.projectiles = world.projectiles.filter(pr => !pr.dead);
}

export default { sizeMult, effectiveDamage, absorb, unitSplashDamage, bldgSplashDamage, splashPass, structureShot, secondaryDamage, stepProjectiles };