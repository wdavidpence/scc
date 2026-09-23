// P1.024 — Canonical integer-number contract (PURE: no Phaser, no DOM).
// Declares the authoritative numeric formats for simulation state and the
// validator that rejects floats on those fields. Representation only:
// scene-side consumption lands in P1.026 (fixed-tick) / P1.029-031 (pure-sim
// extraction); the BattleScene export seam already quantizes through these
// helpers so canonical state is integer-only from here on.
//
// Formats (all integers after quantization):
//   pos     — Q8 px (1/256 px; tile 16 px = 4096 units), from float px
//   rate    — Q8 px/tick at 24 Hz; live px/sec converts via speedToQ8Tick
//   ticks   — integer tick count at 24 Hz; live seconds convert via toTicks
//   bearing — integer 0..255, 1/256 turn (octant facing = bearing >> 5)
//   int     — plain integer (resources, supply, cargo, ids, seqs)
//
// NOTE: quantization helpers are ONE-SHOT scene->canonical conversions.
// Never re-apply to already-canonical values (they carry no unit marker).
'use strict';

const Q8 = 256;
const TICK_HZ = 24;

const toQ8 = (px) => Math.round(px * Q8);
const fromQ8 = (q8) => q8 / Q8;
// Seconds remaining -> whole ticks (ceil: a timer never dies early).
const toTicks = (sec) => Math.ceil(sec * TICK_HZ);
// px/sec -> Q8 px/tick.
const speedToQ8Tick = (pxPerSec) => Math.round((pxPerSec / TICK_HZ) * Q8);
// 8-dir facing (0..7, from _facing8) -> 1/256-turn bearing.
const octToBearing = (o8) => ((Math.trunc(o8) % 8) + 8) % 8 * 32;
const isInt = (v) => Number.isInteger(v);

// Order payload -> canonical form: float {point:{x,y}} becomes Q8 {tx,ty}.
function orderToCanonical(o) {
  if (!o) return o;
  // P1.036: canonical order must be DATA ONLY. Orders carry live object
  // refs ({ type:'attackTarget', target: Unit } etc.); a shallow spread used
  // to leak them into the hash stream (cycle -> canonicalize blowup).
  // Rule: primitives and arrays-of-primitives pass through; object refs
  // become stable scalar descriptors ('#id' when known, dropped otherwise);
  // functions dropped. Equal states still hash equal; different targets
  // hash different (id distinguishes them).
  const c = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'function' || v === undefined) continue;
    if (v === null || typeof v !== 'object') { c[k] = v; continue; }
    if (Array.isArray(v)) {
      if (v.every(x => x === null || typeof x !== 'object')) { c[k] = v; continue; }
      const ids = v.map(x => (x && typeof x === 'object' && x.id !== undefined ? x.id : null));
      if (ids.every(x => x !== null)) { c[k] = ids; continue; } // refs -> ids
      const pts = v.every(x => x && typeof x === 'object' && typeof x.x === 'number' && typeof x.y === 'number');
      if (pts) c[k] = v.flatMap(p => [toQ8(p.x), toQ8(p.y)]); // waypoint arrays -> Q8 pairs (state preserved)
      // else: non-representable payload; drop
    }
    // object ref: point-like {x,y} converts; unit-like becomes '#id'
    if (k === 'point' && typeof v.x === 'number' && typeof v.y === 'number') {
      c.tx = toQ8(v.x); c.ty = toQ8(v.y); continue;
    }
    if (typeof v.id !== 'undefined') c[k] = '#' + v.id;
  }
  return c;
}

// Declared integer-only fields, per serialized-section. validate() calls
// checkNumbers and fails on any float here (P1.024 done-when).
// Deliberately NOT declared yet (own phases): hp/shield/damage/bonusDamage/
// bonusArmor/energy (Phase 4 combat-integer pass), rng internals.
const INT_FIELDS = {
  top: ['tickIndex', 'rngState'],
  unit: ['x', 'y', 'speed', 'facing', 'attackTimer', 'cargo'],
  unitOrder: ['tx', 'ty'],
  building: ['x', 'y'],
  buildingQueue: ['remaining'],
  buildingRally: ['x', 'y'],
  projectile: ['x', 'y', 'vx', 'vy', 'ttl'],
  player: ['minerals', 'gas', 'supplyUsed', 'supplyCap'],
  order: ['tick', 'tx', 'ty']
};

// Returns array of "path must be integer, got v" errors (empty = clean).
function checkNumbers(state) {
  const errs = [];
  const bad = (path, v) => {
    if (typeof v === 'number' && !Number.isInteger(v)) errs.push(`${path} must be integer, got ${v}`);
  };
  for (const k of INT_FIELDS.top) bad(k, state[k]);
  (state.units || []).forEach((u, i) => {
    const p = `units[${i}]`;
    for (const k of INT_FIELDS.unit) bad(`${p}.${k}`, u[k]);
    if (u.order) for (const k of INT_FIELDS.unitOrder) bad(`${p}.order.${k}`, u.order[k]);
  });
  (state.buildings || []).forEach((b, i) => {
    const p = `buildings[${i}]`;
    for (const k of INT_FIELDS.building) bad(`${p}.${k}`, b[k]);
    (b.queue || []).forEach((q, j) => { for (const k of INT_FIELDS.buildingQueue) bad(`${p}.queue[${j}].${k}`, q[k]); });
    if (b.rally) for (const k of INT_FIELDS.buildingRally) bad(`${p}.rally.${k}`, b.rally[k]);
  });
  (state.projectiles || []).forEach((pr, i) => {
    for (const k of INT_FIELDS.projectile) bad(`projectiles[${i}].${k}`, pr[k]);
  });
  (state.players || []).forEach((pl, i) => {
    for (const k of INT_FIELDS.player) bad(`players[${i}].${k}`, pl[k]);
  });
  (state.orders || []).forEach((o, i) => {
    for (const k of INT_FIELDS.order) bad(`orders[${i}].${k}`, o[k]);
  });
  return errs;
}

const SimNum = { Q8, TICK_HZ, toQ8, fromQ8, toTicks, speedToQ8Tick, octToBearing, isInt, orderToCanonical, INT_FIELDS, checkNumbers };
export { SimNum };
export default SimNum;