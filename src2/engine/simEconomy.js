// src2/engine/simEconomy.js
// P1.030 — Pure economy execution: resource ledger, supply accounting, and the
// harvest world-queries. No Phaser, no DOM, no scene/state access: functions
// take either a player-ledger object `p` ({minerals, gas, supplyUsed,
// supplyCap, ...}) or a duck-typed world `{buildings, units, minerals,
// geysers}`. BattleScene keeps thin delegators here, so the live match and
// the headless golden (scripts/verify-economy-golden.cjs) run the SAME
// ledger arithmetic — a live/headless fork is impossible by construction.
//
// Semantics are byte-identical ports of the scene code they replace:
// - supply is charged on EVERY spawn (arriveReady included); the supply-cap
//   CHECK is skipped only for arriveReady reinforcements;
// - the harvest occupancy cap (4 workers/patch) and the blacklisted/capped
//   fallbacks in pickMineralForWorker are load-bearing anti-jam machinery
//   (P0.39 / v2.70 #4), preserved verbatim.
import { TILE } from '../data/sc1.js';

// ---------------- resource ledger ----------------
export function canAfford(p, m, g = 0) { return p.minerals >= m && p.gas >= (g || 0); }
export function spend(p, m, g = 0) { p.minerals -= m; p.gas -= g || 0; }
export function income(p, m, g = 0) { p.minerals += m; p.gas += (g || 0); }

// Cargo deposit: whole cargo moves to the ledger (minerals or gas).
export function depositCargo(p, u) {
  const isGas = u.cargoGas;
  income(p, isGas ? 0 : u.cargo, isGas ? u.cargo : 0);
}

// ---------------- supply accounting ----------------
// Spawn gate (true = spawn allowed). Pair with chargeSupply — see header for
// the exact live semantics (check ≠ charge).
export function canSpawn(p, def) { return p.supplyUsed + (def.supply || 0) <= p.supplyCap; }
export function chargeSupply(p, def) {
  p.supplyUsed += def.supply || 0;
  if (def.supplyBonus) p.supplyCap += def.supplyBonus;
}
export function releaseSupply(p, def) {
  p.supplyUsed -= def.supply || 0;
  if (def.supplyBonus) p.supplyCap -= def.supplyBonus;
}
// Full supply-cap recount from standing structures (deploy/build/morph sites)
// — scene computeSupplyCap ported verbatim; race kept out of `this` reach.
export function computeSupplyCap(race, team, buildings, units) {
  let cap = 0;
  for (const b of buildings) {
    if (b.team !== team || b.dead || !b.built) continue;
    if (b.def.supply) cap += b.def.supply;
    if (b.buildId === 'supplyDepot') cap += 8;
  }
  if (race === 'skarn') {
    for (const u of units) if (!u.dead && u.team === team && u.kind === 'skywarden') cap += 8;
  }
  return cap;
}

// ---------------- harvest world-queries (1:1 scene ports) ----------------
export function nearestDropOff(w, u) {
  let best = null, bd = Infinity;
  for (const b of w.buildings) {
    if (b.team !== u.team || b.dead || !b.built) continue;
    if (b.def.produces?.includes(u.kind) || ['commandCenter', 'aegis', 'broodNest', 'refinery', 'gasSiphon', 'essenceTap'].includes(b.buildId)) {
      const d = Math.hypot(b.x - u.x, b.y - u.y);
      if (d < bd) { bd = d; best = b; }
    }
  }
  return best;
}

export function pickMineralForWorker(w, u, avoid) {
  if (u.gasTarget && u.gasTarget.gas > 0 && u.team === 1) return null; // handled separately
  // enemy AI gas assignment
  const gey = w.geysers.find(g => g.workers.includes(u));
  if (gey) { u.gasActive = true; return null; }
  // P0.39: load-aware pick (see entity updateHarvest for the anti-jam pair).
  // `avoid` is the worker's rotating blacklist of repeatedly-unreachable
  // crystals; if every candidate is blacklisted we ignore it (better a
  // retry than idling forever next to unmined minerals).
  let best = null, bs = Infinity, fb = null, fbs = Infinity;
  const load = new Map();
  for (const x of w.units) {
    if (!x.dead && x !== u && x.harvestTarget) load.set(x.harvestTarget, (load.get(x.harvestTarget) || 0) + 1);
  }
  // v2.70 #4: HARD occupancy cap — never ACQUIRE a patch already at 4 workers;
  // if every candidate is capped, fall back to best-scored (crowded-but-mining
  // beats idling next to minerals).
  let capped = null, cs = Infinity;
  for (const m of w.minerals) {
    if (m.amount <= 0) continue;
    const d = Math.hypot(m.x - u.x, m.y - u.y);
    if (d > 40 * TILE) continue;
    const l = load.get(m) || 0;
    const s = d + l * 40;
    if (avoid && avoid.includes(m)) { if (s < fbs) { fbs = s; fb = m; } continue; }
    if (l >= 4) { if (s < cs) { cs = s; capped = m; } continue; }
    if (s < bs) { bs = s; best = m; }
  }
  return best || capped || fb;
}

export function nearestMineralPatch(w, u, maxD) {
  let best = null, bd = maxD || Infinity;
  for (const m of w.minerals) {
    if (m.amount <= 0) continue;
    const d = Math.hypot(m.x - u.x, m.y - u.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

export function nearestGeyser(w, u) {
  const assigned = w.geysers.find(g => g.workers.includes(u));
  return assigned || null;
}