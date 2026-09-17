// P1.021 — Canonical simulation state schema (PURE: no Phaser, no DOM).
// Defines the serializable shape of the authoritative match state and a
// canonicalizer whose output is stable under key-insertion order. Foundation
// for fixed-tick determinism (P1.022+), replay hashing (P1.035), and
// render-adapter separation (P1.033). Floats stay floats here; P1.023
// converts world coords to integer 1/256-tile units in place.
'use strict';

const SECTIONS = ['tickIndex', 'rngState', 'terrain', 'players', 'units', 'buildings', 'projectiles', 'orders'];

const REQUIRED = {
  tickIndex: 'number', rngState: 'number', terrain: 'object', players: 'array',
  units: 'array', buildings: 'array', projectiles: 'array', orders: 'array'
};

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function validate(state) {
  validate.errors = [];
  if (typeOf(state) !== 'object') { validate.errors.push('state must be object'); return false; }
  for (const k of SECTIONS) {
    const want = REQUIRED[k];
    if (!(k in state)) { validate.errors.push(`missing section ${k}`); continue; }
    if (typeOf(state[k]) !== want) validate.errors.push(`section ${k} must be ${want}, got ${typeOf(state[k])}`);
  }
  if (state.tickIndex !== undefined && (!Number.isInteger(state.tickIndex) || state.tickIndex < 0)) validate.errors.push('tickIndex must be non-negative integer');
  if (Array.isArray(state.terrain?.solid) && Number.isInteger(state.terrain.w) && Number.isInteger(state.terrain.h)) {
    if (state.terrain.solid.length !== state.terrain.w * state.terrain.h) validate.errors.push(`terrain solid length ${state.terrain.solid.length} !== w*h ${state.terrain.w * state.terrain.h}`);
  } else validate.errors.push('terrain requires integer w,h and solid array');
  const need = {
    units: ['id', 'team', 'kind', 'x', 'y', 'hp', 'state'],
    buildings: ['id', 'team', 'buildId', 'x', 'y', 'hp', 'built'],
    projectiles: ['id', 'team', 'x', 'y', 'damage'],
    players: ['team', 'race', 'minerals', 'gas', 'supplyUsed', 'supplyCap'],
    orders: ['tick', 'team', 'seq', 'cmd']
  };
  for (const [sec, keys] of Object.entries(need)) {
    (state[sec] || []).forEach((row, i) => {
      for (const k of keys) if (row[k] === undefined) validate.errors.push(`${sec}[${i}] missing ${k}`);
    });
  }
  return validate.errors.length === 0;
}

// Field allowlist projection: strips render-only / derived junk so two states
// that differ only in decoration serialize identically.
function project(row, allow) {
  const out = {};
  for (const k of allow) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

const ALLOW = {
  unit: ['id', 'team', 'kind', 'x', 'y', 'hp', 'maxHp', 'shield', 'maxShield', 'state', 'order', 'cargo', 'facing', 'attackTimer', 'dead', 'speed', 'bonusDamage', 'bonusArmor'],
  building: ['id', 'team', 'buildId', 'x', 'y', 'hp', 'maxHp', 'built', 'queue', 'rally'],
  projectile: ['id', 'team', 'kind', 'x', 'y', 'vx', 'vy', 'damage', 'targetId', 'ttl', 'splash'],
  player: ['team', 'race', 'minerals', 'gas', 'supplyUsed', 'supplyCap', 'techs', 'upgrades'],
  order: ['tick', 'team', 'seq', 'cmd', 'unitIds', 'tx', 'ty', 'buildId', 'kind', 'targetId']
};

// Canonical JSON: recursively sorted object keys; arrays keep order (order IS state).
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

function serialize(state) {
  return {
    tickIndex: state.tickIndex,
    rngState: state.rngState,
    terrain: { w: state.terrain.w, h: state.terrain.h, tileSize: state.terrain.tileSize, solid: Array.from(state.terrain.solid), ramp: Array.from(state.terrain.ramp || []) },
    players: state.players.map(p => project(p, ALLOW.player)),
    units: state.units.map(u => project(u, ALLOW.unit)),
    buildings: state.buildings.map(b => project(b, ALLOW.building)),
    projectiles: state.projectiles.map(p => project(p, ALLOW.projectile)),
    orders: (state.orders || []).map(o => project(o, ALLOW.order))
  };
}

function deserialize(snap) { return JSON.parse(canonicalize(snap)); }

function hashState(snap) {
  // FNV-1a over canonical JSON; cheap, stable, sufficient for tick hashing (P1.036 will extend)
  const s = canonicalize(snap);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const SimSchema = { SECTIONS, validate, serialize, deserialize, canonicalize, hashState, ALLOW };
export { SimSchema, canonicalize, validate, serialize, deserialize, hashState };
export default SimSchema;
