// P1.056 — Shared match kernel: the state-bearing slice of the match
// world, extracted VERBATIM from the live paths (BattleScene) so headless
// and live are the same code — a fork is impossible by construction.
//
// Contract:
//  - NO Phaser, NO DOM, NO canvas. createReplayWorld() builds a duck-typed
//    world exposing exactly what entity.js reads from `world` (verified by
//    grep of world.* call sites).
//  - fogOff: replay/parity mode. currentlyVisible/visibleFor answer from
//    the same code as live when fogOn; when world.fogOff is true everything
//    is visible on BOTH engines so acquisition cannot fork on fog state.
//    (Live play keeps fog; only replay harnesses set fogOff.)
//  - presentation branches from the live scene were NOT carried over: the
//    live scene keeps its own display code; the kernel keeps only the
//    STATE decisions that display used to interleave with. Display randomness
//    (Math.random draws) is outside the state stream by the P1.033
//    presentation-stream contract.
//  - The scene delegates its acquireFor / findNearestEnemy /
//    spawnProjectile / applyHit to these functions (thin-delegator doctrine,
//    P1.030), so live == headless by construction. Until a delegation lands,
//    the page harness builds a kernel world directly and cross-engine
//    identity is still checked against these same functions.
import * as SC from './simCombat.js';
import { TILE } from '../data/sc1.js';
import SimNum from './simNum.js';

const TICK = 1 / 24;

// ---------------- vision (1:1 port of scene currentlyVisible/visibleFor) --
// scene: _tempReveals + team-0 (or hotseat active) unit/building sight.
export function currentlyVisible(world, x, y) {
  if (world.fogOff) return true;
  const VT = world.hotseat ? (world.activeTeam ?? 0) : 0;
  for (const rv of (world._tempReveals || [])) { if (world.gameTime < rv.until && Math.hypot(x - rv.x, y - rv.y) < rv.r) return true; }
  for (const u of world.units) { if (!u.dead && u.team === VT && Math.hypot(x - u.x, y - u.y) < u.def.sight * TILE) return true; }
  for (const b of world.buildings) { if (!b.dead && b.team === VT && Math.hypot(x - b.x, y - b.y) < (b.def.sight || 5) * TILE) return true; }
  return false;
}

export function visibleFor(world, x, y, team) {
  if (world.fogOff) return true;
  if (world.hotseat && (world.activeTeam ?? 0) === team) return true;
  // live fog: seen-array AND currentlyVisible — kernel worlds have no
  // exploredness map, so when fogOn without a seen array we degrade to
  // currentlyVisible (replay harnesses run fogOff anyway).
  if (world.seen) {
    const i = world.nav.idx(Math.floor(x / TILE), Math.floor(y / TILE));
    if (world.seen[i] !== 1) return false;
  }
  return currentlyVisible(world, x, y);
}

// ---------------- acquisition (1:1 port of scene acquireFor/findNearest) --
// NOTE: forAir/forGround only filter when === false (verbatim scene quirk:
// 'air' targets pass forAir=true which skips the filter entirely).
export function findNearestEnemy(world, x, y, range, forAir, forGround, fromTeam) {
  const home = fromTeam ?? 0;
  let best = null, bd = range;
  for (const u of world.units) {
    if (u.dead || u.team === undefined) continue;
    const hostile = u.team !== home;
    if (!hostile) continue;
    if (!visibleFor(world, u.x, u.y, home)) continue;
    if (forAir === false && u.flying) continue;
    if (forGround === false && !u.flying) continue;
    const d = Math.hypot(x - u.x, y - u.y);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

export function acquireFor(world, unit, range) {
  const t = unit.def.targets || 'both';
  return findNearestEnemy(world, unit.x, unit.y, range, t === 'air' ? true : undefined, t === 'air' ? false : t === 'ground' ? true : undefined, unit.team);
}

// ---------------- projectiles (state slice of scene spawnProjectile) -----
// Returns the carrier record when one is created, else null. Instant-hit
// kinds (incinerator, blades) apply damage here and create NO carrier.
export function spawnProjectile(world, { from, target, damage, splash, team, kind, speed, attacker }) {
  if (!target) return null;
  const rec = { id: (world._projSeq = (world._projSeq || 0) + 1), x: from.x, y: from.y, team, kind: kind || 'bullet', damage, splash, target, attacker, dead: false, shell: false };
  if (kind === 'tank' || kind === 'turret') {
    rec.y = from.y - 6; rec.speed = speed || 900; rec.shell = true;
    world.projectiles.push(rec);
    return rec;
  }
  if (kind === 'incinerator') {
    applyHit(world, target, damage, splash || 18, null);
    return null;
  }
  if (kind === 'bladeguard' || kind === 'nightblade' || kind === 'radiant') {
    applyHit(world, target, damage, splash, null);
    return null;
  }
  rec.speed = speed || 640;
  if (kind === 'duster' || kind === 'ballista') rec.shell = true;
  world.projectiles.push(rec);
  return rec;
}

// flight loop: SAME function the live scene calls (simCombat kernel).
export function stepProjectiles(world, dt) {
  SC.stepProjectiles(world, dt, (t, d, s, a) => applyHit(world, t, d, s, a));
}

// ---------------- applyHit (state slice of scene applyHit) ----------------
export function applyHit(world, target, damage, splash, attacker) {
  if (!target || target.dead) return;
  target._lastHitFrom = attacker ? { x: attacker.x, y: attacker.y } : null;
  target._lastHitBy = attacker || null;
  target.takeDamage(damage, attacker);
  target._lastHurtT = world.gameTime;
  if (world.hitRocksNear) world.hitRocksNear(target.x, target.y, damage, splash);
  if (splash > 0) SC.splashPass(world, target, damage, splash, attacker);
}

// ---------------- fixed-tick world ---------------------------------------
// The headless twin of BattleScene for replay parity: exactly the world
// surface entity.js reads (grep-verified), no display surface.
export function createReplayWorld({ seed, terrain, UNIT }) {
  const chainer = new Proxy(function () {}, {
    get: (t, k) => (k === 'x' || k === 'y' ? 0 : chainer),
    set: () => true, apply: () => chainer,
  });
  function cont(x, y) {
    const o = { x, y, list: [],
      setPosition(nx, ny) { o.x = nx; o.y = ny; },
      add() {}, remove() {}, destroy() {},
      setDepth() {}, setScale() {}, setVisible() {}, setAlpha() {},
      setRotation() {}, setAngle() {}, setFlipX() {}, setTint() {}, setTintFill() {}, clearTint() {},
      getScaleX() { return 1; } };
    return o;
  }
  // seeded sim rng: 1:1 with the scene match PRNG class (SimRng) — the
  // harness injects E to keep this file free of Node loader tricks.
  const w = {
    units: [], buildings: [], projectiles: [],
    minerals: [], geysers: [], crates: [], spiderMines: [],
    players: [],
    tickIndex: 0, gameTime: 0,
    fogOff: true, hotseat: false, activeTeam: 0,
    autoMine: true, coach: null,
    time: { now: 0, delayedCall: () => ({}) },
    add: new Proxy({ container: (x, y) => cont(x, y) }, {
      get: (t, k) => (k in t ? t[k] : () => chainer),
    }),
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} }, events: { emit() {} },
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080, worldView: { x: 0, y: 0 } } },
    camNear: () => false, currentlyVisible: (x, y) => currentlyVisible(w, x, y),
    flash() {}, shake() {},
    groundBlocked: () => false, blightSpeedAt: () => 0,
    separationVector: () => ({ x: 0, y: 0 }),
    nav: terrain.nav,
    spawnProjectile(p) { return spawnProjectile(w, p); },
    applyHit(t, d, s, a) { applyHit(w, t, d, s, a); },
    acquireFor(u, r) { return acquireFor(w, u, r); },
    findNearestEnemy(x, y, r, fa, fg, ft) { return findNearestEnemy(w, x, y, r, fa, fg, ft); },
    techResearched: () => false, hasAddOn: () => false,
    pickMineralForWorker: () => null, nearestMineralPatch: () => null, nearestDropOff: () => null,
    onCargoDeposited() {}, onBuildingComplete() {}, onUnitDeath() {},
    audio: undefined, polish: undefined,
  };
  w.world = w;
  return w;
}

// One fixed tick: units then projectiles — the state half of __simPassive
// (no blight, no AI, no coach, no critters — those need world state the
// replay world intentionally does not carry; replay content must not use
// them, and the cross-engine gate proves the used slice).
export function stepWorld(w) {
  w.gameTime = w.tickIndex * TICK;
  w.time.now = w.tickIndex;
  for (const u of w.units) if (!u.dead) u.update(TICK);
  stepProjectiles(w, TICK);
  w.tickIndex++;
}

// ---------------- command stream (replay-side exec) ----------------------
// Executes ONE drained packet. Semantics = the headless counterpart of
// scene execCmd for the slice types; single-sourced here so the CLI runner
// and the in-browser harness execute identical code (arrival order was
// already canonicalised by netCmds before this point).
export function execReplayCmd(w, idMap, cmd, stats) {
  const pl = cmd.payload || {};
  const sel = (pl.sel || []).map(id => idMap.get(id)).filter(u => u && !u.dead);
  switch (cmd.type) {
    case 'order': {
      const wp = Array.isArray(pl.wp) ? pl.wp : (pl.wp && typeof pl.wp.x === 'number' ? [pl.wp] : null);
      if (!wp || !sel.length) { stats.skipped++; return; }
      const last = wp[wp.length - 1];
      for (const u of sel) if (!u.dead) u.issueMove(last.x, last.y, !!pl.attackMove);
      break;
    }
    case 'stop':
      for (const u of sel) { u.order = null; u.state = 'idle'; u.path = []; u.waypoints = null; u.patrolPoints = null; }
      break;
    case 'stance':
      for (const u of sel) if (!u.dead) u.stance = pl.stance;
      break;
    case 'patrol': {
      if (!sel.length || !pl.a || !pl.b) { stats.skipped++; return; }
      for (const u of sel) { u.patrolPoints = [{ x: pl.a.x, y: pl.a.y }, { x: pl.b.x, y: pl.b.y }]; u._patrolIdx = 0; u.setOrder({ type: 'patrol' }); }
      break;
    }
    case 'attackTarget': {
      const t = idMap.get(pl.target);
      for (const u of sel) if (!u.dead && t && !t.dead) u.setOrder({ type: 'attackTarget', target: t });
      break;
    }
    default:
      stats.skipped++;
      return;
  }
  stats.executed++;
}

// ---------------- whole-match runner (CLI + page shared body) ------------
// Identical execution in Node and in the browser: same decode (caller),
// same world, same netCmds receive queue, same exec, same step, same
// digest. opts: { shuffleSeed, hashEvery }.
//
// digest channel: hashStateFast = canonicalize(dynamic slice) + cached
// terrain string. Terrain NEVER mutates during a replay, so it is hashed
// once and folded into every digest by reference to a precomputed string —
// 96% of the earlier wall time was re-canonicalizing 25,600 static terrain
// entries every ring sample (profiled 2026-10-02). Both engines call this
// SAME function, so the channel stays cross-engine identical.
function dynamicSlice(w) {
  const q8 = (v) => Math.round(v * 256);
  return {
    tickIndex: w.tickIndex,
    rngState: w.simRng ? w.simRng.digest() : 0,
    players: w.players.map(p => ({ team: p.team, race: p.race, minerals: p.minerals, gas: p.gas, supplyUsed: p.supplyUsed, supplyCap: p.supplyCap, techs: p.techs, upgrades: p.upgrades })),
    units: w.units.map(u => ({ id: u.id, team: u.team, kind: u.kind, x: q8(u.x), y: q8(u.y), hp: u.hp, maxHp: u.maxHp, shield: u.shield, maxShield: u.maxShield, state: u.state, dead: !!u.dead })),
    buildings: w.buildings.map(b => ({ id: b.id, team: b.team, buildId: b.buildId, x: q8(b.x), y: q8(b.y), hp: b.hp, maxHp: b.maxHp, built: !!b.built })),
    projectiles: (w.projectiles || []).map(p => ({ id: p.id, team: p.team, kind: p.kind || 'bullet', x: q8(p.x), y: q8(p.y), damage: p.damage ?? 0, targetId: p.target && !p.target.dead ? p.target.id : null })),
  };
}

export function hashStateFast(w, E) {
  if (w._tKey === undefined) {
    w._tKey = JSON.stringify({ w: w.nav.w, h: w.nav.h, t: w.nav.tileSize, s: Array.from(w.nav.solid), r: Array.from(w.ramp || []) });
  }
  return E.SimSchema.hashState(w._tKey + '|' + JSON.stringify(dynamicSlice(w)));
}

export function runHeadlessMatch(rep, E, terrain, opts = {}) {
  const w = createReplayWorld({ seed: rep.seed, terrain });
  w.simRng = new E.SimRng(rep.seed);
  w.rng = w.simRng;
  w._tKey = undefined;
  const idMap = new Map();
  for (const [team, kind, x, y] of rep.units) {
    const u = new E.Unit(w, team, kind, x, y);
    w.units.push(u);
    idMap.set(u.id, u);
  }
  const seqN = new Map();
  const packets = rep.commands.map(c => {
    const s = (seqN.get(c.player) || 0) + 1;
    seqN.set(c.player, s);
    return { player: c.player, seq: s, tick: c.tick, type: c.type, subject: c.subject, payload: c.payload };
  });
  let arrival = packets;
  if (opts.shuffleSeed) {
    arrival = packets.slice();
    let s = opts.shuffleSeed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = arrival.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arrival[i], arrival[j]] = [arrival[j], arrival[i]]; }
  }
  const buf = E.nc.createNetBuf();
  for (const p of arrival) E.nc.deliver(buf, p);
  const stats = { executed: 0, skipped: 0, drained: 0 };
  const he = opts.hashEvery || 0;
  const ring = [];
  let lastHash = null;
  for (let t = 1; t <= rep.ticks; t++) {
    for (const c of E.nc.drainNet(buf, t)) {
      stats.drained++;
      execReplayCmd(w, idMap, c, stats);
    }
    stepWorld(w);
    if (he && t % he === 0) { const hh = hashStateFast(w, E); ring.push(hh); if (ring.length > 1200) ring.shift(); lastHash = hh; }
  }
  const finalHash = hashStateFast(w, E);
  return {
    ticks: rep.ticks,
    finalHash,
    ringDigest: E.rf.h32(ring.join('|')),
    alive: w.units.filter(u => !u.dead).length,
    total: w.units.length,
    cmds: packets.length,
    executed: stats.executed, skipped: stats.skipped, drained: stats.drained,
    shuffleSeed: opts.shuffleSeed || 0,
  };
}

// ---------------- state export (1:1 mirror of exportSimState) ------------
export function exportSimState(world) {
  const q8 = SimNum.toQ8, tk = SimNum.toTicks, b256 = SimNum.octToBearing, oc = SimNum.orderToCanonical;
  return {
    tickIndex: world.tickIndex || 0,
    rngState: world.simRng ? world.simRng.digest() : 0,
    terrain: { w: world.nav.w, h: world.nav.h, tileSize: world.nav.tileSize, solid: Array.from(world.nav.solid), ramp: Array.from(world.ramp || []) },
    players: world.players.map(p => ({ team: p.team, race: p.race, minerals: p.minerals, gas: p.gas, supplyUsed: p.supplyUsed, supplyCap: p.supplyCap, techs: p.techs, upgrades: p.upgrades })),
    units: world.units.map(u => ({ id: u.id, team: u.team, kind: u.kind, x: q8(u.x), y: q8(u.y), hp: u.hp, maxHp: u.maxHp, shield: u.shield, maxShield: u.maxShield, state: u.state, order: oc(u.order), cargo: Math.round(u.cargo || 0), facing: b256(u._facing8 || 0), attackTimer: tk(u.attackTimer || 0), dead: !!u.dead })),
    buildings: world.buildings.map(b => ({ id: b.id, team: b.team, buildId: b.buildId, x: q8(b.x), y: q8(b.y), hp: b.hp, maxHp: b.maxHp, built: !!b.built, queue: (b.queue || []).map(q => ({ kind: q.kind, remaining: tk(q.remaining) })), rally: b.rally ? { x: q8(b.rally.x), y: q8(b.rally.y) } : null })),
    projectiles: (world.projectiles || []).map(p => ({ id: p.id, team: p.team, kind: p.kind || 'bullet', x: q8(p.x), y: q8(p.y), vx: Math.round(p.vx || 0), vy: Math.round(p.vy || 0), damage: p.damage ?? 0, targetId: p.targetId ?? p.target?.id ?? null, ttl: tk(p.ttl || 0) })),
    orders: (world.orderLog || [])
  };
}

export const SimMatch = { currentlyVisible, visibleFor, findNearestEnemy, acquireFor, spawnProjectile, stepProjectiles, applyHit, createReplayWorld, stepWorld, execReplayCmd, runHeadlessMatch, exportSimState, TICK };
export default SimMatch;