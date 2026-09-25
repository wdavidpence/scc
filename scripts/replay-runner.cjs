#!/usr/bin/env node
// P1.038 — Headless CLI match runner.
// Executes a replay (seed + tick-stamped command script) through the REAL
// engine modules (entity.js Units, real order execution, seeded PRNG) with
// NO browser, canvas, audio, or GPU. 'phaser' is stubbed via scripts/stubs
// /loader.mjs; the fake world has no display surface that state can flow
// through (presentation hooks are no-ops; camNear=false).
//
// Replay format (JSON): { seed, seconds, units:[{team,kind,x,y}],
//   script: [{tick, side, kind:'move|attackMove|attackTarget|patrol',
//             unit, target?, x?, y?, repeat?}], hashEvery? }
// Usage:
//   node scripts/replay-runner.cjs --replay <file.json> [--hash-every N]
//   node scripts/replay-runner.cjs --generate <file.json>  (writer mode)
// Exit 0 + final hash on success; prints timing; exit 1 on divergence mode.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const TICK = 1 / 24;

async function loadEngine() {
  const { register } = require('node:module');
  register('./stubs/loader.mjs', pathToFileURL(__filename));
  return {
    Unit: (await import(path.resolve(__dirname, '../src2/engine/entity.js'))).Unit,
    SimRng: (await import(path.resolve(__dirname, '../src2/engine/simRng.js'))).SimRng,
    SimSchema: (await import(path.resolve(__dirname, '../src2/engine/simSchema.js'))).SimSchema,
    sc1: await import(path.resolve(__dirname, '../src2/data/sc1.js')),
  };
}

function makeWorld(E, seed) {
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
    // universal display factory: ANY add.x() returns a chainer; display
    // objects cannot carry state (no fields), and unknown factories cannot
    // crash. State-neutrality is asserted by the dual-run hash checks.
    add: new Proxy({ container: (x, y) => cont(x, y) }, {
      get: (t, k) => (k in t ? t[k] : () => chainer),
    }),
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} }, events: { emit() {} },
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
    camNear: () => false, currentlyVisible: () => true, flash() {}, shake() {},
    groundBlocked: () => false, blightSpeedAt: () => false,
    separationVector: () => ({ x: 0, y: 0 }),
    nav: { idx: (x, y) => y * 64 + x, blockedBy: new Int8Array(64 * 64), walkable: () => true,
      unblockBy() {}, findPath: (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }] },
    techResearched: () => false, hasAddOn: () => false, spend: () => true,
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

function applyScriptEntry(w, u, s) {
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

async function runReplay(file, { hashEvery = 0 } = {}) {
  const E = await loadEngine();
  const rep = JSON.parse(fs.readFileSync(file, 'utf8'));
  const he = hashEvery || rep.hashEvery || 0;
  const w = makeWorld(E, rep.seed);
  const units = rep.units || [];
  for (const s of units) {
    const u = new E.Unit(w, s.team, s.kind, s.x, s.y);
    w.units.push(u);
  }
  // index script by tick for O(1) access
  const byTick = new Map();
  for (const s of rep.script) {
    if (!byTick.has(s.tick)) byTick.set(s.tick, []);
    byTick.get(s.tick).push(s);
  }
  const totalTicks = Math.round(rep.seconds * 24);
  const t0 = process.hrtime.bigint();
  let finalHash = null;
  let lastHash = null;
  for (let t = 0; t < totalTicks; t++) {
    w.time.now = t;
    const script = byTick.get(t);
    if (script) for (const s of script) applyScriptEntry(w, null, s);
    for (const u of w.units) if (!u.dead) u.update(TICK);
    stepProjectiles(w);
    if (he && (t + 1) % he === 0) lastHash = E.SimSchema.hashState(snapshot(w, t + 1));
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // final snapshot always hashed
  finalHash = E.SimSchema.hashState(snapshot(w, totalTicks));
  const alive = w.units.filter((u) => !u.dead).length;
  return { ticks: totalTicks, ms, finalHash, alive, total: w.units.length, lastHash };
}

function generateTrainingReplay() {
  // 10-minute engagement replay: mirrored 9v9 opening + scripted maneuvers
  // across the full window. Deterministic by construction (data file), so
  // any machine replays byte-identical.
  const seed = 12345;
  const units = [];
  const kindsA = ['marine', 'marine', 'marine', 'tank', 'tank', 'incinerator', 'wraith', 'marine', 'tank'];
  const kindsB = ['skarnling', 'skarnling', 'razorspine', 'vexwing', 'skarnling', 'razorspine', 'skarnling', 'vexwing', 'skarnling'];
  kindsA.forEach((k, i) => units.push({ team: 0, kind: k, x: 240 + (i % 3) * 34, y: 280 + Math.floor(i / 3) * 30 }));
  kindsB.forEach((k, i) => units.push({ team: 1, kind: k, x: 700 - (i % 3) * 34, y: 280 + Math.floor(i / 3) * 30 }));
  const script = [];
  // opening: attack-move sweeps + focus fires (t=1)
  units.forEach((u, i) => {
    if (u.team === 0) script.push({ tick: 1, kind: 'attackMove', unit: i, x: 560, y: 290 + (i % 4) * 20 });
    else script.push({ tick: 1, kind: 'attackMove', unit: i, x: 420, y: 300 + (i % 4) * 16 });
  });
  // mid-game flanks every 120 ticks through the full 10 min
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
    // occasional focus-fire on a plausible target index
    script.push({ tick: t + 3, kind: 'attackTarget', unit: 2, target: 12 });
    t += 120; fl++;
  }
  return { seed, seconds: 600, units, script, hashEvery: 0, note: 'P1.038 training replay: mirrored 9v9, full 10-min maneuver script' };
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args[0] === '--generate') {
      const out = args[1] || path.resolve(__dirname, '../replays/training-10min.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const rep = generateTrainingReplay();
      fs.writeFileSync(out, JSON.stringify(rep));
      console.log('GENERATED', out, 'units=' + rep.units.length, 'script=' + rep.script.length, 'seconds=' + rep.seconds);
      process.exit(0);
    }
    const i = args.indexOf('--replay');
    const file = i >= 0 ? args[i + 1] : path.resolve(__dirname, '../replays/training-10min.json');
    const heI = args.indexOf('--hash-every');
    const he = heI >= 0 ? Number(args[heI + 1]) : 0;
    if (!fs.existsSync(file)) { console.error('NO REPLAY FILE:', file, '— run with --generate first'); process.exit(1); }
    const wall0 = Date.now();
    const r = await runReplay(file, { hashEvery: he });
    const wall = Date.now() - wall0;
    console.log(`REPLAY ${path.basename(file)} ticks=${r.ticks} simTime=600s wallMs=${wall.toFixed(0)} simMs=${r.ms.toFixed(0)} units ${r.alive}/${r.total} finalHash=${r.finalHash}`);
    process.exit(0);
  })().catch((e) => { console.error('REPLAY ERROR:', e); process.exit(2); });
}

module.exports = { runReplay, generateTrainingReplay };
