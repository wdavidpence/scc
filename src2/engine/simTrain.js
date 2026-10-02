// P1.056-i2 — Training-match kernel: headless executor for TRAINING recipe
// streams (deploy-MCV, worker production, harvest steering, building
// placement, unit production, research, dummy spawn). The whole-chain golden
// (replays/training-recipe.json) runs HERE for the first time: until now the
// headless runners stubbed away every production/research/placement member
// (queueUnit could never fire, spawnUnit returned null), so a full training
// match was not executable headless. This file makes it executable; the live
// thin-delegator + cross-engine tier is i3 (see docs/P1.056-kernel-design.md).
//
// Fork-safety doctrine (same as simMatch.js): every function ported here is
// a VERBATIM port of the live BattleScene code it mirrors, including the
// scene's quirks, so the i3 live-parity gate has one code path to verify.
// Deliberate kernel-map fixture deviations (documented per ticket): no
// crates, no critters, no geyser, no blight, no fog (fogOff), no escape /
// convoy / updateAI-crippled behavior — the training recipe replaces them.
import * as EC from './simEconomy.js';
import { SpatialHash } from './flowfield.js';
import * as SM from './simMatch.js';
import * as SC from './simCombat.js';

const TICK = 1 / 24;

// ---------------- world (real production/economy/nav members) -------------
// Builds on createReplayWorld (vision + projectile + acquisition twins), then
// replaces the stubs the training chain needs with 1:1 scene ports.
export function createTrainingWorld(E, { seed, terrain }) {
  const w = SM.createReplayWorld({ seed, terrain });
  const { TILE, MAP_W, MAP_H } = E.sc1;
  const UNITS = E.sc1.UNITS;
  w.__BUILDINGS = E.sc1.BUILDINGS;
  w.__Building = E.Building;
  w._idTag = {}; // kind -> pending tag aliases (queue cmd id -> spawned unit)
  w.elev = terrain.ms.elev;
  w.ramp = terrain.ms.ramp;
  w.rockTiles = [];
  w.spatial = new SpatialHash(28);

  // training-match resource start, mirrored from BattleScene.create():
  // easy difficulty + the TRAINING mission's bonusMinerals 500 (300+500).
  w.players = [
    { team: 0, race: 'terran', minerals: 800, gas: 150, supplyUsed: 0, supplyCap: 0, techs: {}, upgrades: { weapons: 0, armor: 0 } },
    { team: 1, race: 'skarn', minerals: 400, gas: 150, supplyUsed: 0, supplyCap: 0, techs: {}, upgrades: { weapons: 0, armor: 0 } },
  ];
  // coach-park twin: while active+step && !_minedClick the fixed-tick loop
  // parks team-0 harvest orders (verbatim __step rule), and the default
  // idle-harvest grant is suppressed for team-0 workers (verbatim Unit
  // default-branch condition). The training recipe releases the park with a
  // 'harvest' command, so the harvest chain is stream-driven and
  // non-vacuous, exactly like the player issuing the order themselves.
  w.coach = { active: true, step: {}, _minedClick: false };

  // ---- nav twins (verbatim scene slices) ----
  w.groundBlocked = (unit, x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    const i = ty * MAP_W + tx;
    if (!w.elev) return false;
    const onCliff = w.elev[i] === 1;
    const fromCliff = w.elevAt(unit.x, unit.y) === 1;
    if (onCliff && !fromCliff) return !w.ramp[i];
    if (!onCliff && fromCliff) return !w.ramp[i];
    return false;
  };
  w.elevAt = (x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 0;
    return w.elev[ty * MAP_W + tx];
  };
  w.blightSpeedAt = () => 0; // training map carries no blight (deviation #4)
  w.separationVector = (u) => {
    let sx = 0, sy = 0;
    for (const o of w.spatial.near(u.x, u.y)) {
      if (o === u || o.dead) continue;
      if (o.flying !== u.flying) continue;
      const dx = u.x - o.x, dy = u.y - o.y;
      const d2 = dx * dx + dy * dy;
      const minD = (u.radius + o.radius) * 1.15;
      if (d2 > minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / minD;
      sx += (dx / d) * push; sy += (dy / d) * push;
    }
    return { x: sx, y: sy };
  };

  // ---- economy members (simEconomy single-source wrappers) ----
  w.canAfford = (team, m, g = 0) => EC.canAfford(w.players[team], m, g);
  w.spend = (team, m, g = 0) => EC.spend(w.players[team], m, g);
  w.pickMineralForWorker = (u, avoid) => EC.pickMineralForWorker(w, u, avoid);
  w.nearestMineralPatch = (u, maxD) => EC.nearestMineralPatch(w, u, maxD);
  w.nearestDropOff = (u) => EC.nearestDropOff(w, u);
  w.nearestGeyser = (u) => EC.nearestGeyser(w, u);
  w.totalDeposited = 0; // non-vacuity metric: cumulative harvested units
  w.onCargoDeposited = (u) => {
    EC.depositCargo(w.players[u.team], u);
    w.totalDeposited += Math.round(u.cargo);
  };
  w.depleteMineral = (m) => { w.minerals = w.minerals.filter((x) => x !== m); };

  // ---- production members ----
  w.techResearched = (team, techId) => !!w.players[team].techs[techId];
  w.hasBuilding = (bid, team) => w.buildings.some((b) => b.team === team && !b.dead && b.buildId === bid);
  w.hasAddOn = () => false; // no add-ons in training content
  w.completeResearch = (team, techId) => {
    const t = E.sc1.TECHS[techId];
    SC.researchBonuses(w.players[team], w.units, techId, t, team);
  };
  w.onBuildingComplete = (b) => {
    w.players[b.team].supplyCap = EC.computeSupplyCap(b.def.race, b.team, w.buildings, w.units);
    if (b.def.rally && b.team === 0 && !b.rallyPoint) {
      b.rallyPoint = { x: b.x, y: b.y + (b.def.h * TILE) / 2 + TILE * 1.2 };
    }
  };

  // ---- spawnUnit twin (verbatim state slice of scene spawnUnit) ----
  // supply gate: CHECK skipped for arriveReady, charge ALWAYS (simEconomy
  // header semantics); spawn-bonus + non-worker default attackMove included.
  w.spawnUnit = (team, kind, x, y, opts = {}) => {
    const p = w.players[team];
    const def = UNITS[kind];
    if (!def) return null;
    if (!opts.arriveReady && !EC.canSpawn(p, def)) return null;
    const u = new E.Unit(w, team, kind, x, y);
    if (opts.id) u.id = opts.id;
    w.units.push(u);
    EC.chargeSupply(p, def);
    SC.applySpawnBonuses(u, p, (id) => w.techResearched(team, id));
    if (!opts.arriveReady && def.worker === false && !def.weaponless) {
      u.setOrder({ type: 'attackMove', point: team === 1 ? { x: 1920 * 0.15, y: 1080 * 0.15 } : { x: 1920 * 0.85, y: 1080 * 0.85 } });
    }
    return u;
  };

  // ---- death twin (scene onUnitDeath state slice) ----
  w._deathIds = []; // observability: ids of units removed via onUnitDeath
  w.onUnitDeath = (u) => {
    EC.releaseSupply(w.players[u.team], u.def);
    if (u.id) w._deathIds.push(u.id);
    w.units = w.units.filter((x) => x !== u);
  };

  // deployment footprint twin (scene deploySpotValid state slice)
  w.deploySpotValid = (def, x, y, team) => {
    const wpx = def.w * TILE, hpx = def.h * TILE;
    if (x - wpx / 2 < TILE || y - hpx / 2 < TILE || x + wpx / 2 > 1920 - TILE || y + hpx / 2 > 1080 - TILE) return false;
    for (let ty = Math.floor((y - hpx / 2) / TILE); ty <= Math.ceil((y + hpx / 2) / TILE) - 1; ty++) {
      for (let tx = Math.floor((x - wpx / 2) / TILE); tx <= Math.ceil((x + wpx / 2) / TILE) - 1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
        if (w.nav.solid[w.nav.idx(tx, ty)]) return false;
        if (w.rockTiles.some((r) => r.tx === tx && r.ty === ty)) return false;
      }
    }
    return true;
  };
  return w;
}

// ---------------- one-tick step (mirror of __step tick body) --------------
// Order of ops is load-bearing: park rule BEFORE unit updates would change
// behavior, so it is kept AFTER — wait, no: in the scene the park rule runs
// in __step AFTER stepSim; the stepWorld here is stepSim + the state
// writers that __step runs at tick pace, in scene order.
export function stepTrainingWorld(w) {
  w.gameTime = w.tickIndex * TICK;
  w.time.now = w.tickIndex;

  // spatial hash rebuild (separation + neighbor queries) — stepSim head.
  w.spatial.clear();
  for (const u of w.units) if (!u.dead && !u.flying) w.spatial.insert(u);

  // autoMine re-claim (verbatim: `(gameTime % 2) < dt` cadence, team-0).
  if (w.autoMine && (w.gameTime % 2) < TICK) {
    for (const u of w.units) if (!u.dead && u.team === 0 && u.def.worker && !u.order) u.setOrder({ type: 'harvest' });
  }

  for (const u of w.units) if (!u.dead) u.update(TICK);
  for (const b of w.buildings) b.update(TICK); // buildings AFTER units (scene)
  SM.stepProjectiles(w, TICK);

  // coach-park rule (verbatim __step tail slice): park team-0 harvest
  // orders while the harvest lesson is un-taught.
  if (w.coach && w.coach.active && w.coach.step && !w.coach._minedClick) {
    for (const u of w.units) if (u.team === 0 && !u.dead && u.def.worker && u.order && u.order.type === 'harvest') { u.order = null; u.state = 'idle'; }
  }

  w.tickIndex++;
}

// ---------------- training-recipe command exec ----------------------------
// New cmd types exercise the production chain; everything else delegates to
// simMatch.execReplayCmd so order/stop/etc stay single-sourced. Team source:
// cmd.team ?? cmd.player. Return value is informational; stats count exec.
export function execTrainingCmd(w, idMap, cmd, stats) {
  const pl = cmd.payload || {};
  const team = cmd.team ?? cmd.player ?? 0;
  const sel = (pl.sel || []).map((id) => idMap.get(id)).filter((u) => u && !u.dead);
  switch (cmd.type) {
    case 'deploy': {
      const u = idMap.get(pl.uid);
      if (!u || u.dead || !u.def.mcv || u.team !== team) { stats.skipped++; return false; }
      const bid = u.def.deploysTo;
      const def = w.__BUILDINGS[bid];
      if (!w.deploySpotValid(def, u.x, u.y, u.team)) { stats.skipped++; return false; }
      // consume the vehicle, instant primary structure (scene deployMCV)
      u.dead = true;
      w.units = w.units.filter((x) => x !== u);
      idMap.delete(u.id);
      const b = new w.__Building(w, u.team, bid, u.x, u.y, { instant: true });
      w.buildings.push(b);
      // skarn deploy blight skipped: training enemy never deploys (dev #5)
      w.players[u.team].supplyCap = EC.computeSupplyCap(u.def.race, u.team, w.buildings, w.units);
      stats.executed++;
      return true;
    }
    case 'place': {
      const def = w.__BUILDINGS[pl.bid];
      if (!def) { stats.skipped++; return false; }
      const p = w.players[team];
      if (!EC.canAfford(p, def.minerals, def.gas)) { stats.skipped++; return false; }
      EC.spend(p, def.minerals, def.gas);
      const b = new w.__Building(w, team, pl.bid, pl.x, pl.y, {});
      w.buildings.push(b);
      // terran race branch: worker builders (sel first, auto-nearest fallback
      // — verbatim tryPlayability fallback of the scene tryPlace)
      let builders = sel.filter((u) => u.def.worker && !u.dead);
      if (builders.length === 0) {
        const cands = w.units.filter((u) => u.team === team && !u.dead && u.def.worker);
        builders = cands.filter((u) => !u.order || u.state === 'idle')
          .sort((a, c) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(c.x - pl.x, c.y - pl.y));
        if (builders.length === 0) builders = cands.sort((a, c) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(c.x - pl.x, c.y - pl.y)).slice(0, 1);
      }
      builders.forEach((u) => u.setOrder({ type: 'build', building: b }));
      stats.executed++;
      return true;
    }
    case 'queue': {
      const b = w.buildings.find((bb) => bb.team === team && !bb.dead && (bb.buildId === pl.bid || bb.morphedTo === pl.bid));
      if (!b || !b.queueUnit(pl.kind)) { stats.skipped++; return false; }
      if (pl.id) { (w._idTag[pl.kind] = w._idTag[pl.kind] || []).push(pl.id); }
      stats.executed++;
      return true;
    }
    case 'research': {
      const b = w.buildings.find((bb) => bb.team === team && !bb.dead && bb.buildId === pl.bid);
      if (!b || !b.queueResearch(pl.techId)) { stats.skipped++; return false; }
      stats.executed++;
      return true;
    }
    case 'harvest': {
      // training-lesson harvest command: releases the coach park (the player
      // issued harvest themselves) AND drives the sel workers toward the
      // mineral click point (rightClickOrder worker branch: enemy first, else
      // issueMove for every worker; here: enemy-at-point check + issueMove).
      w.coach._minedClick = true;
      const pt = Array.isArray(pl.wp) ? pl.wp[pl.wp.length - 1] : pl.wp;
      if (!pt || !sel.length) { stats.skipped++; return false; }
      for (const u of sel) if (!u.dead) u.issueMove(pt.x, pt.y, false);
      stats.executed++;
      return true;
    }
    case 'spawn': {
      // scripted enemy unit (kill_dummy conversion): id-aliasable, optional
      // training-dummy nerf mirrors coach.spawnDummy state slice exactly.
      // scripted:true keeps it out of the production tag FIFO.
      const opts = { arriveReady: true, scripted: true };
      if (pl.id) opts.id = pl.id;
      const u = w.spawnUnit(team, pl.kind, pl.x, pl.y, opts);
      if (!u) { stats.skipped++; return false; }
      if (pl.hpFrac) {
        u.maxHp = u.hp = Math.max(18, Math.round(u.maxHp * pl.hpFrac));
        u.bonusDamage = -Math.max(0, Math.floor((u.def.damage || 6) * 0.7));
        u._trainingDummy = true;
        if (pl.move) u.issueMove(pl.move.x, pl.move.y, false);
      }
      stats.executed++;
      return true;
    }
    default:
      SM.execReplayCmd(w, idMap, cmd, stats);
      return undefined;
  }
}

// ---------------- whole-training-match runner -----------------------------
// rep: { seed, ticks, minerals: [[x,y,amount],...], units: [[team,kind,x,y]],
//        commands: [{tick, player, type, payload}] }
// Deterministic from (rep, E, terrain) alone; same function is called by the
// CLI gate and (later) the in-browser parity harness.
export function runTrainingMatch(E, rep, opts = {}) {
  const terrain = (() => {
    const ms = E.SimTerrain.buildMapState(rep.seed, E.sc1.MAP_W, E.sc1.MAP_H);
    const bake = E.SimTerrain.bakeLayers(ms, E.sc1.MAP_W, E.sc1.MAP_H);
    const nav = new E.NavGrid(E.sc1.MAP_W, E.sc1.MAP_H, E.sc1.TILE);
    nav.solid.set(bake.solid);
    nav.blocked.set(bake.blocked);
    nav.elev = ms.elev;
    nav.ramp = ms.ramp;
    return { nav, bake, ms };
  })();
  const w = createTrainingWorld(E, { seed: rep.seed, terrain });
  w.simRng = new E.SimRng(rep.seed);
  w.rng = w.simRng;
  w._tKey = undefined;
  // kernel-map mineral fixture (deviation #1: crystals only, no crates/
  // critters/geysers). Loaded BEFORE any unit spawns so birth-harvest and
  // the recipe's harvest click see the same fixture on every run.
  w.minerals = (rep.minerals || []).map(([x, y, amount]) => ({ x, y, amount }));
  w.onMineralDug = () => {}; // scene: audio-only

  const idMap = new Map();
  // spawn twin wrapper: queue-tag aliasing (kind FIFO) + explicit ids +
  // idMap registration for EVERY birth path (fixture, production, scripted).
  const rawSpawn = w.spawnUnit;
  w.spawnUnit = (team, kind, x, y, opts2 = {}) => {
    let id = opts2.id || null;
    if (!id && !opts2.scripted && w._idTag[kind] && w._idTag[kind].length) {
      // production birth (no explicit id): take next queued tag for the kind.
      // Scripted spawns always carry an explicit id, so no tag shadowing.
      id = w._idTag[kind].shift();
    }
    const u = rawSpawn(team, kind, x, y, opts2);
    if (!u) return null;
    if (id) { u.id = id; idMap.set(id, u); }
    return u;
  };

  for (const f of rep.units || []) {
    const [team, kind, x, y, id] = f;
    // fixtures are reinforcements: arriveReady skips the supply-cap check
    // (starting teams predate any supplyCap-granting structure).
    const u = w.spawnUnit(team, kind, x, y, { arriveReady: true, ...(id ? { id } : {}) });
    if (!u) continue;
    idMap.set(u.id, u);
  }

  // command stream: same netCmds canonicalisation as runHeadlessMatch so a
  // shuffled-arrival probe proves (tick, player, seq) dominance here too.
  const seqN = new Map();
  const packets = rep.commands.map((c) => {
    const s = (seqN.get(c.player ?? 0) || 0) + 1;
    seqN.set(c.player ?? 0, s);
    return { player: c.player ?? 0, seq: s, tick: c.tick, type: c.type, subject: c.subject ?? c.type, payload: c.payload };
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
      execTrainingCmd(w, idMap, c, stats);
    }
    stepTrainingWorld(w);
    if (he && t % he === 0) { const hh = SM.hashStateFast(w, E); ring.push(hh); if (ring.length > 1200) ring.shift(); lastHash = hh; }
  }
  const finalHash = SM.hashStateFast(w, E);
  return {
    ticks: rep.ticks,
    finalHash,
    ringDigest: E.rf.h32(ring.join('|')),
    alive: w.units.filter((u) => !u.dead).length,
    total: w.units.length,
    cmds: packets.length,
    executed: stats.executed, skipped: stats.skipped, drained: stats.drained,
    shuffleSeed: opts.shuffleSeed || 0,
    world: w, // caller may assert milestones against live world refs
  };
}

export const SimTrain = { createTrainingWorld, stepTrainingWorld, execTrainingCmd, runTrainingMatch, TICK };
export default SimTrain;
