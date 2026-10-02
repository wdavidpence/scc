#!/usr/bin/env node
// P1.038 — Headless CLI match runner (upgraded by P1.038-i2 for SCCR/1).
// Executes a replay through the REAL engine modules (entity.js Units, real
// NavGrid pathfinding, real SimTerrain bake, seeded PRNG) with NO browser,
// canvas, audio, or GPU. 'phaser' is stubbed via scripts/stubs/loader.mjs;
// the fake world has no display surface that state can flow through
// (presentation hooks are no-ops; camNear=false).
//
// TWO REPLAY SOURCES:
//  1) legacy JSON  {seed,seconds,units:[{team,kind,x,y}],script:[...]}
//     — index-based script, kept for the P1.029-era golden harness.
//  2) SCCR/1 text  (src2/engine/replayFormat.js kernel):
//     header(seed,ticks,mapHash,dataHash,nc) + units + `C tick|player|
//     type|subject|payload` lines + checksum. The command stream executes
//     through the P1.034 netCmds receive queue: canonical (tick,player,seq)
//     order from CONTENT, so arrival/re-sequencing cannot change outcomes
//     (--shuffle-arrival proves it). Header mapHash/dataHash are CHECKED
//     against the locally built terrain bake and balance tables — a replay
//     for different content is REFUSED (exit 3), not silently reinterpreted.
//
// Usage:
//   node scripts/replay-runner.cjs --replay <file> [--hash-every N]
//     [--shuffle-arrival <seed>] [--fake-map <hex>] [--fake-data <hex>]
//   node scripts/replay-runner.cjs --generate <file.json>
//   node scripts/replay-runner.cjs --generate-sccr <file.sccr>
// Exit 0 = ran (prints wallMs + finalHash); 3 = refused (checksum/content
// hash); 1/2 = missing file / engine error.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const TICK = 1 / 24;

// P1.050: per-run module isolation. Each run loads the engine subtree with
// a fresh nonce query (?s=NONCE); stubs/loader.mjs propagates the nonce to
// every relative engine/data import, so NO module-level state (entity.js
// nextId, cached tables) is shared between two runs in one process. Math
// .random is pinned to a seed-derived stream during the run: any display-
// layer random draw that survives into the world stubs is deterministic
// per (file, seed), never per wall-clock. Set SCC_RUN_ISOLATED=0 to opt
// out (shared modules, unpinned rng) for A/B experiments.
let runNonce = 0;
const ISOLATED = process.env.SCC_RUN_ISOLATED !== '0';

async function loadEngine(nonce) {
  const { register } = require('node:module');
  if (!loadEngine._reg) { register('./stubs/loader.mjs', pathToFileURL(__filename)); loadEngine._reg = true; }
  const q = nonce ? '?s=' + nonce : '';
  const eng = (f) => import(pathToFileURL(path.resolve(__dirname, '../src2/engine', f)).href + q);
  return {
    Unit: (await import(pathToFileURL(path.resolve(__dirname, '../src2/engine/entity.js')) + q)).Unit,
    SimRng: (await eng('simRng.js')).SimRng,
    SimSchema: (await eng('simSchema.js')).SimSchema,
    NavGrid: (await eng('pathfinding.js')).NavGrid,
    SimTerrain: (await eng('simTerrain.js')).SimTerrain,
    rf: (await eng('replayFormat.js')),
    nc: (await eng('netCmds.js')).default || (await eng('netCmds.js')),
    sm: (await eng('simMatch.js')).default || (await eng('simMatch.js')),
    sc1: await import(pathToFileURL(path.resolve(__dirname, '../src2/data/sc1.js')) + q),
  };
}

// ---- headless world: no display surface; presentation hooks are no-ops ----
function makeWorld(E, seed, terrain) {
  const chainer = new Proxy(function () {}, {
    get: (t, k) => (k === 'x' || k === 'y' ? 0 : chainer),
    set: () => true, apply: () => chainer,
  });
  function cont(x, y) {
    const o = { x, y, list: [],
      setPosition(nx, ny) { o.x = nx; o.y = ny; },
      add() {}, remove() {}, destroy() {},
      setDepth() {}, setScale() {}, setVisible() {}, setAlpha() {},
      setRotation() {}, setAngle() {}, setFlipX() {}, setTint() {},
      getScaleX() { return 1; } };
    return o;
  }
  const rng = new E.SimRng(seed);
  const w = {
    units: [], projectiles: [], rng, simRng: rng, econ: 0,
    time: { now: 0, delayedCall: () => ({}) },
    add: new Proxy({ container: (x, y) => cont(x, y) }, {
      get: (t, k) => (k in t ? t[k] : () => chainer),
    }),
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} }, events: { emit() {} },
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
    camNear: () => false, currentlyVisible: () => true, flash() {}, shake() {},
    groundBlocked: () => false, blightSpeedAt: () => false,
    separationVector: () => ({ x: 0, y: 0 }),
    nav: terrain.nav,
    spawnProjectile(p) { this.projectiles.push({ x: p.from.x, y: p.from.y, ...p }); },
    applyHit(target, dmg) { if (target && !target.dead) target.takeDamage(dmg, null); },
    acquireFor(u, range) {
      let best = null, bd = range;
      for (const e of this.units) {
        if (e.team === u.team || e.dead || e.loaded || e.garrisonedIn) continue;
        if (u.def.targets === 'air' && !e.flying) continue;
        if (u.def.targets === 'ground' && e.flying) continue;
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    findNearestEnemy(u, r) { return this.acquireFor(u, r); },
    onUnitDeath() {},
  };
  return w;
}

// real terrain from the seed via the simTerrain kernel (same bake the
// scene writes into nav and verify-terrain-golden asserts); optional
// --fake-map/--fake-data let the gate prove content-hash REFUSAL paths.
function buildTerrain(E, seed) {
  const ms = E.SimTerrain.buildMapState(seed, E.sc1.MAP_W, E.sc1.MAP_H);
  const bake = E.SimTerrain.bakeLayers(ms, E.sc1.MAP_W, E.sc1.MAP_H);
  const nav = new E.NavGrid(E.sc1.MAP_W, E.sc1.MAP_H, E.sc1.TILE);
  nav.solid.set(bake.solid);
  nav.blocked.set(bake.blocked);
  nav.elev = ms.elev;
  nav.ramp = ms.ramp;
  return { nav, bake, ms };
}

function localDataHash(E) {
  return E.rf.computeDataHash({ units: E.sc1.UNITS, buildings: E.sc1.BUILDINGS, techs: E.sc1.TECHS, w: E.sc1.MAP_W, h: E.sc1.MAP_H, tile: E.sc1.TILE });
}

function stepProjectiles(w) {
  for (const p of w.projectiles) {
    if (!p.target || p.target.dead) { p.done = true; continue; }
    const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
    const step = (p.speed || 600) * TICK;
    if (d <= step) { p.target.takeDamage(p.damage, p.attacker || w.units.find(u => u.team === p.team)); p.done = true; }
    else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
  }
  w.projectiles = w.projectiles.filter(p => !p.done);
}

function snapshot(w, tick) {
  const q8 = (v) => Math.round(v * 256);
  return {
    tickIndex: tick,
    rngState: w.simRng.digest(),
    players: [], buildings: [],
    units: w.units.map((u, i) => ({ idx: i, team: u.team, kind: u.kind, x: q8(u.x), y: q8(u.y),
      hp: u.hp, shield: u.shield, state: u.state, dead: !!u.dead,
      targetIdx: u.target ? w.units.indexOf(u.target) : null })),
    projectiles: w.projectiles.map(p => ({ x: q8(p.x), y: q8(p.y) })),
    orders: [],
  };
}

// legacy index-based script (P1.029-era JSON replays)
function applyScriptEntry(w, s) {
  const unit = w.units[s.unit];
  if (!unit || unit.dead) return;
  switch (s.kind) {
    case 'move': unit.issueMove(s.x, s.y, false); break;
    case 'attackMove': unit.issueMove(s.x, s.y, true); break;
    case 'attackTarget': { const t = w.units[s.target]; if (t) unit.setOrder({ type: 'attackTarget', target: t }); break; }
    case 'patrol': unit.patrolPoints = [{ x: s.x, y: s.y }, { x: s.x2 ?? s.x + 200, y: s.y2 ?? s.y }]; unit.setOrder({ type: 'patrol' }); break;
    default: throw new Error('unknown script kind ' + s.kind);
  }
}

// SCCR command execution: headless equivalents of BattleScene.execCmd,
// verbatim field semantics where a headless counterpart exists; unknown
// types count as skipped (portability: a replay may hold types the
// headless world does not simulate). sel ids resolve against unit ids.
function execSccrCmd(w, idMap, cmd, stats) {
  const pl = cmd.payload || {};
  const sel = (pl.sel !== undefined ? pl.sel.map(id => idMap.get(id)).filter(u => u && !u.dead) : null);
  switch (cmd.type) {
    case 'order': {
      const wp = Array.isArray(pl.wp) ? pl.wp : (pl.wp && typeof pl.wp.x === 'number' ? [pl.wp] : null);
      if (!wp || !sel) { stats.skipped++; return; }
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
      if (!sel || !sel.length || !pl.a || !pl.b) { stats.skipped++; return; }
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

// Wrapper: sets up per-run isolation (fresh engine module subtree via
// loader nonce + seeded Math.random pin), then delegates. The pin is
// derived from the replay seed, so display-layer Math.random draws
// (spread, offsets) become a deterministic function of the match, not of
// wall-clock or draw history.
async function runReplay(file, opts = {}) {
  const text = fs.readFileSync(file, 'utf8');
  if (!ISOLATED) return runReplayIsolated(file, text, opts, null);
  const m0 = /^SCCR\/1 (\S+)/.exec(text);
  let seed = 0x9E3779B9;
  if (m0) { const sm = /(?:^| )seed=([0-9a-f]+)/.exec(m0[1]); if (sm) seed = parseInt(sm[1], 16) >>> 0; }
  else { try { const j = JSON.parse(text); if ((j.seed | 0) !== 0) seed = (j.seed | 0) >>> 0; } catch (e) { /* inner will error */ } }
  runNonce = (runNonce + 1) >>> 0;
  const real = Math.random;
  let s = (seed ^ 0x85ebca6b) >>> 0; if (!s) s = 1;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  try {
    return await runReplayIsolated(file, text, opts, runNonce.toString(16));
  } finally {
    Math.random = real;
  }
}

async function runReplayIsolated(file, text, { hashEvery = 0, shuffleSeed = 0, fakeMap = null, fakeData = null } = {}, nonce) {
  const E = await loadEngine(nonce);
  const isSccr = text.startsWith('SCCR/1');
  let rep, mode;

  if (isSccr) {
    // header carries seed + ticks; parse seed first to build local content
    const m0 = /^SCCR\/1 (\S+)/.exec(text);
    const h = {};
    for (const kv of (m0 ? m0[1].split(' ') : [])) { const e = kv.indexOf('='); if (e > 0) h[kv.slice(0, e)] = kv.slice(e + 1); }
    const seed = parseInt(h.seed, 16) >>> 0;
    const terrain = buildTerrain(E, seed);
    const localMap = fakeMap || E.rf.computeMapHash(terrain.bake);
    const localData = fakeData || localDataHash(E);
    const dec = E.rf.decodeReplay(text, { mapHash: localMap, dataHash: localData });
    if (!dec.ok) return { refused: dec.error, detail: dec.detail };
    rep = dec.replay;
    mode = 'sccr';
    // P1.056: the whole match runs on the SHARED kernel
    // (src2/engine/simMatch.js). The browser harness (verify-cross-engine)
    // calls the same runHeadlessMatch with the same decode — Node<->browser
    // forks are caught by the parity gate, impossible by construction.
    const t0 = process.hrtime.bigint();
    const he = hashEvery || rep.hashEvery || 0;
    const res = E.sm.runHeadlessMatch(rep, E, terrain, { shuffleSeed, hashEvery: he });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { mode, ticks: res.ticks, ms, finalHash: res.finalHash, alive: res.alive, total: res.total,
      cmds: res.cmds, executed: res.executed, skipped: res.skipped, drained: res.drained, shuffleSeed,
      lastHash: null, ringDigest: res.ringDigest };
  }

  // ---- legacy JSON mode (unchanged semantics; real terrain now) ----
  mode = 'json';
  const data = JSON.parse(text);
  const terrain = buildTerrain(E, data.seed);
  const w = makeWorld(E, data.seed, terrain);
  for (const s of data.units || []) {
    const u = new E.Unit(w, s.team, s.kind, s.x, s.y);
    w.units.push(u);
  }
  const byTick = new Map();
  for (const s of data.script) {
    if (!byTick.has(s.tick)) byTick.set(s.tick, []);
    byTick.get(s.tick).push(s);
  }
  const totalTicks = Math.round(data.seconds * 24);
  const he = hashEvery || data.hashEvery || 0;
  const t0 = process.hrtime.bigint();
  let lastHash = null;
  for (let t = 0; t < totalTicks; t++) {
    w.time.now = t;
    const script = byTick.get(t);
    if (script) for (const s of script) applyScriptEntry(w, s);
    for (const u of w.units) if (!u.dead) u.update(TICK);
    stepProjectiles(w);
    if (he && (t + 1) % he === 0) lastHash = E.SimSchema.hashState(snapshot(w, t + 1));
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const finalHash = E.SimSchema.hashState(snapshot(w, totalTicks));
  const alive = w.units.filter((u) => !u.dead).length;
  return { mode, ticks: totalTicks, ms, finalHash, alive, total: w.units.length, cmds: (data.script || []).length, lastHash };
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

    if (args[0] === '--generate') {
      const fs2 = fs;
      const out = args[1] || path.resolve(__dirname, '../replays/training-10min.json');
      // legacy writer kept byte-identical to the P1.038-i1 version
      const seed = 12345;
      const units = [];
      const kindsA = ['marine', 'marine', 'marine', 'tank', 'tank', 'incinerator', 'wraith', 'marine', 'tank'];
      const kindsB = ['skarnling', 'skarnling', 'razorspine', 'vexwing', 'skarnling', 'razorspine', 'skarnling', 'vexwing', 'skarnling'];
      kindsA.forEach((k, i) => units.push({ team: 0, kind: k, x: 240 + (i % 3) * 34, y: 280 + Math.floor(i / 3) * 30 }));
      kindsB.forEach((k, i) => units.push({ team: 1, kind: k, x: 700 - (i % 3) * 34, y: 280 + Math.floor(i / 3) * 30 }));
      const script = [];
      units.forEach((u, i) => {
        if (u.team === 0) script.push({ tick: 1, kind: 'attackMove', unit: i, x: 560, y: 290 + (i % 4) * 20 });
        else script.push({ tick: 1, kind: 'attackMove', unit: i, x: 420, y: 300 + (i % 4) * 16 });
      });
      let t = 200;
      let fl = 0;
      while (t < 14400 - 240) {
        const flippers = [1, 4, 7, 10, 13, 16];
        for (const idx of flippers) {
          const u = units[idx];
          if (!u) continue;
          const dir = (fl % 2 === 0 ? 1 : -1);
          script.push({ tick: t, kind: 'attackMove', unit: idx, x: 500 + dir * 180 + (idx % 3) * 25, y: 200 + ((fl + idx) % 5) * 60 });
        }
        script.push({ tick: t + 3, kind: 'attackTarget', unit: 2, target: 12 });
        t += 120; fl++;
      }
      const rep = { seed, seconds: 600, units, script, hashEvery: 0, note: 'P1.038 training replay: mirrored 9v9, full 10-min maneuver script' };
      fs2.mkdirSync(path.dirname(out), { recursive: true });
      fs2.writeFileSync(out, JSON.stringify(rep));
      console.log('GENERATED', out, 'units=' + units.length, 'script=' + script.length, 'seconds=600');
      process.exit(0);
    }

    if (args[0] === '--generate-sccr') {
      const out = args[1] || path.resolve(__dirname, '../replays/training-10min.sccr');
      const E = await loadEngine();
      // deterministic LCG (the arrival-permutation RNG family)
      let s = 0xC0FFEE;
      const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      const seed = 0xBEEF01;
      const terrain = buildTerrain(E, seed);
      // mirrored 9v9 fixture; ids are 1..18 (fresh Unit module per run)
      const kindsA = ['marine', 'marine', 'marine', 'tank', 'tank', 'incinerator', 'wraith', 'marine', 'tank'];
      const kindsB = ['skarnling', 'skarnling', 'razorspine', 'vexwing', 'skarnling', 'razorspine', 'skarnling', 'vexwing', 'skarnling'];
      const units = [];
      const idOf = [];
      kindsA.forEach((k, i) => { units.push([0, k, 240 + (i % 3) * 34, 280 + Math.floor(i / 3) * 30]); idOf.push(idOf.length + 1); });
      kindsB.forEach((k, i) => { units.push([1, k, 700 - (i % 3) * 34, 280 + Math.floor(i / 3) * 30]); idOf.push(idOf.length + 1); });
      const teamOf = idOf.map((_, i) => (i < 9 ? 0 : 1));
      const commands = [];
      const q = () => Math.round((80 + rnd() * 960) * 8) / 8;
      // opening engagement: attack-move sweeps at tick 1
      for (let i = 0; i < 18; i++) {
        const tx = teamOf[i] === 0 ? 420 + q() * 0.4 : 560 - q() * 0.4;
        commands.push({ tick: 1, player: teamOf[i], type: 'order', subject: 'move', payload: { wp: { x: tx, y: 200 + q() * 1.6 }, shift: false, alt: false, sel: [idOf[i]] } });
      }
      // flanks + focus fires through the full 10 minutes (real shapes,
      // 251 bursts incl. stops/stances; mixed same-tick two-player frames)
      let t = 240;
      while (t < 14400 - 240) {
        for (const idx of [0, 3, 6, 9, 12, 15]) {
          if (rnd() < 0.25) continue;
          const other = teamOf[idx] === 0 ? idOf.slice(9) : idOf.slice(0, 9);
          const pick = Math.floor(rnd() * 3);
          if (pick === 0) commands.push({ tick: t, player: teamOf[idx], type: 'order', subject: 'move', payload: { wp: { x: q(), y: q() }, shift: false, alt: false, sel: [idOf[idx], idOf[(idx + 1) % 18]] } });
          else if (pick === 1) commands.push({ tick: t, player: teamOf[idx], type: 'stop', subject: 'stop', payload: { sel: [idOf[idx]] } });
          else commands.push({ tick: t, player: teamOf[idx], type: 'attackTarget', subject: 'attackTarget', payload: { target: other[Math.floor(rnd() * other.length)], sel: [idOf[idx]] } });
        }
        if (rnd() < 0.3) commands.push({ tick: t + 2, player: 0, type: 'stance', subject: 'stance', payload: { stance: rnd() < 0.5 ? 'hold' : 'aggressive', sel: [1, 2, 3] } });
        if (rnd() < 0.3) commands.push({ tick: t + 2, player: 1, type: 'stance', subject: 'stance', payload: { stance: rnd() < 0.5 ? 'hold' : 'aggressive', sel: [10, 11, 12] } });
        t += 60 + Math.floor(rnd() * 90);
      }
      // a few known-unheadless types to prove skip-portability
      commands.push({ tick: 9000, player: 0, type: 'automine', subject: 'automine', payload: null });
      commands.push({ tick: 9500, player: 1, type: 'cloak', subject: 'cloak', payload: { sel: [13] } });
      const repl = {
        seed, ticks: 14400, hashEvery: 0,
        mapHash: E.rf.computeMapHash(terrain.bake),
        dataHash: localDataHash(E),
        units, commands,
      };
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, E.rf.encodeReplay(repl));
      console.log('GENERATED-SCCR', out, 'units=' + units.length, 'commands=' + commands.length, 'ticks=14400');
      process.exit(0);
    }

    const i = args.indexOf('--replay');
    const file = i >= 0 ? args[i + 1] : path.resolve(__dirname, '../replays/training-10min.json');
    if (!fs.existsSync(file)) { console.error('NO REPLAY FILE:', file, '— run with --generate first'); process.exit(1); }
    const he = flag('--hash-every') != null ? Number(flag('--hash-every')) : 0;
    const shuf = flag('--shuffle-arrival') != null ? Number(flag('--shuffle-arrival')) : 0;
    const fakeMap = flag('--fake-map');
    const fakeData = flag('--fake-data');
    const wall0 = Date.now();
    const r = await runReplay(file, { hashEvery: he, shuffleSeed: shuf, fakeMap, fakeData });
    const wall = Date.now() - wall0;
    if (r.refused) { console.log('REPLAY REFUSED', r.refused, r.detail || ''); process.exit(3); }
    console.log(`REPLAY ${path.basename(file)} mode=${r.mode} ticks=${r.ticks} simTime=${(r.ticks / 24).toFixed(0)}s wallMs=${wall.toFixed(0)} simMs=${r.ms.toFixed(0)} units ${r.alive}/${r.total} cmds=${r.cmds}${r.shuffleSeed ? ' shuffle=' + r.shuffleSeed : ''} finalHash=${r.finalHash}${r.ringDigest ? ' ring=' + r.ringDigest : ''}`);
    process.exit(0);
  })().catch((e) => { console.error('REPLAY ERROR:', e); process.exit(2); });
}

module.exports = { runReplay };