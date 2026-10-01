// P1.030 i1 — headless economy golden: 5 minutes of economy execution
// (7200 ticks @ 24 Hz) with NO DOM and NO Phaser.
//
// Contract (ticket done-when): "a five-minute economy replay runs headlessly
// with expected exact totals". The harness drives the REAL production chains:
//   - Unit.updateHarvest / updateHarvestGas / updateReturnCargo (entity.js)
//   - Building.update production-queue drain + spawnFromQueue (entity.js)
//   - simEconomy.js ledger + supply accounting — the SAME functions the live
//     BattleScene delegates to (single source; fork = bug, not drift)
// Fake world = flat terrain + seeded SimRng + scripted fixed queue source
// (deterministic "replay": same commands at same ticks every run).
//
// Proves: (1) byte-identical state traces across two identical runs,
// (2) cross-V8 identity (--jitless child), (3) NO-NaN over 7200 ticks,
// (4) conservation: mined == deposited + cargo-in-flight (both ledgers),
// (5) production actually ran (queue drained AND spawned), (6) supply
// accounting exact, (7) pinned exact ledger totals (calibrated, bounded by
// conservation so a no-op or collapsed run cannot pass).
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const TICK = 1 / 24;
const TICKS = 7200; // 5 minutes

let LOADED = null;
async function loadModules() {
  if (LOADED) return LOADED;
  const { register } = require('node:module');
  register('./stubs/loader.mjs', require('url').pathToFileURL(__filename));
  const entity = await import(path.resolve(__dirname, '../src2/engine/entity.js'));
  LOADED = {
    Unit: entity.Unit,
    Building: entity.Building,
    SimRng: (await import(path.resolve(__dirname, '../src2/engine/simRng.js'))).SimRng,
    EC: await import(path.resolve(__dirname, '../src2/engine/simEconomy.js')),
    SC: await import(path.resolve(__dirname, '../src2/engine/simCombat.js')),
    sc1: await import(path.resolve(__dirname, '../src2/data/sc1.js')),
  };
  return LOADED;
}

async function runWorld({ seed, ticks }) {
  const { Unit, Building, SimRng, EC, SC, sc1 } = await loadModules();
  const { UNITS, TILE } = sc1;

  // ---- fake world (no Phaser, no DOM) -------------------------------------
  const chainer = new Proxy(function () {}, {
    get: (t, k) => (k === 'x' || k === 'y' ? 0 : chainer),
    set: () => true,
    apply: () => chainer,
  });
  function cont(x, y) {
    const o = {
      x, y, list: [],
      setPosition(nx, ny) { o.x = nx; o.y = ny; },
      add() {}, remove() {}, destroy() {},
      setDepth() {}, setScale() {}, setVisible() {}, setAlpha() {},
      setRotation() {}, setAngle() {}, setFlipX() {}, setTint() {},
      getScaleX() { return 1; },
    };
    return o;
  }
  const rng = new SimRng(seed);
  let spawnBlocked = 0, spawnTotal = 0;
  const w = {
    units: [], buildings: [], projectiles: [], geysers: [], minerals: [],
    rng, simRng: rng, time: { now: 0, delayedCall: () => ({}) },
    players: [
      { team: 0, race: 'terran', minerals: 300, gas: 0, supplyUsed: 0, supplyCap: 0, techs: {}, upgrades: { weapons: 0, armor: 0 } },
      { team: 1, race: 'terran', minerals: 400, gas: 150, supplyUsed: 0, supplyCap: 0, techs: {}, upgrades: { weapons: 0, armor: 0 } },
    ],
    add: {
      container: (x, y) => cont(x, y),
      image: () => chainer, graphics: () => chainer, circle: () => chainer,
      rectangle: () => chainer, text: () => chainer,
    },
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} },
    events: { emit() {} },
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
    camNear: () => false,
    currentlyVisible: () => true,
    groundBlocked: () => false,
    blightSpeedAt: () => false,
    separationVector: () => ({ x: 0, y: 0 }),
    nav: {
      idx: (x, y) => y * 64 + x,
      blockedBy: new Int8Array(64 * 64),
      walkable: () => true,
      unblockBy() {}, blockRect() {},
      findPath: (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }],
    },
    techResearched: () => false, hasAddOn: () => false, hasBuilding: () => false,
    autoMine: true, coach: null,
    // ---- economy execution: SAME functions as the live scene ----
    canAfford(team, m, g = 0) { return EC.canAfford(this.players[team], m, g); },
    spend(team, m, g = 0) { EC.spend(this.players[team], m, g); },
    nearestDropOff(u) { return EC.nearestDropOff(this, u); },
    pickMineralForWorker(u, avoid) { return EC.pickMineralForWorker(this, u, avoid); },
    nearestMineralPatch(u, maxD) { return EC.nearestMineralPatch(this, u, maxD); },
    nearestGeyser(u) { return EC.nearestGeyser(this, u); },
    onCargoDeposited(u) { EC.depositCargo(this.players[u.team], u); },
    onMineralDug() {},
    depleteMineral(t) { const i = this.minerals.indexOf(t); if (i >= 0) this.minerals.splice(i, 1); },
    onBuildingComplete(b) {
      const p = this.players[b.team];
      p.supplyCap = EC.computeSupplyCap(p.race, b.team, this.buildings, this.units);
    },
    spawnUnit(team, kind, x, y, opts = {}) {
      const p = this.players[team];
      const def = UNITS[kind];
      if (!def) return null;
      if (!opts.arriveReady && !EC.canSpawn(p, def)) { spawnBlocked++; return null; }
      const u = new Unit(this, team, kind, x, y);
      this.units.push(u);
      EC.chargeSupply(p, def);
      // P1.031-i2: same spawn-bonus kernel as the live scene (upgrades are 0
      // in this scenario → bonuses 0 → hash unchanged; wired for single source)
      SC.applySpawnBonuses(u, p, id => this.techResearched(team, id));
      spawnTotal++;
      return u;
    },
    spawnProjectile(p) { this.projectiles.push({ x: p.from.x, y: p.from.y, ...p }); },
    applyHit(target, dmg) { if (target && !target.dead) target.takeDamage(dmg, null); },
    acquireFor(u, range) {
      let best = null, bd = range;
      for (const e of this.units) {
        if (e.team === u.team || e.dead || e.loaded || e.garrisonedIn) continue;
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    findNearestEnemy(x, y, range, air, ground, team) {
      let best = null, bd = range * TILE;
      for (const e of this.units) {
        if (e.team === team || e.dead) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    onUnitDeath(u) {
      EC.releaseSupply(this.players[u.team], u.def);
      this.units = this.units.filter(x => x !== u);
    },
  };

  // ---- scenario: terran economy vs terrain, 5 simulated minutes ----------
  const cc = new Building(w, 0, 'commandCenter', 200, 600, { instant: true });
  w.buildings.push(cc);
  const ref = new Building(w, 0, 'refinery', 150, 620, { instant: true });
  w.buildings.push(ref);
  w.players[0].supplyCap = EC.computeSupplyCap('terran', 0, w.buildings, w.units); // CC supply: 10

  w.minerals.push({ x: 70, y: 600, amount: 400 }, { x: 90, y: 630, amount: 400 }, { x: 50, y: 645, amount: 400 });
  const geyser = { x: 150, y: 660, gas: 300, building: ref, workers: [] };
  w.geysers.push(geyser);

  const startM = w.minerals.reduce((s, m) => s + m.amount, 0);
  const startG = geyser.gas;

  // starting roster: 6 mineral riggers + 2 gas riggers (arriveReady, like
  // the live mission seed path); supply charged through the same gate
  for (let i = 0; i < 6; i++) w.spawnUnit(0, 'rigger', 190 + i * 8, 610, { arriveReady: true });
  const g1 = w.spawnUnit(0, 'rigger', 240, 615, { arriveReady: true });
  const g2 = w.spawnUnit(0, 'rigger', 252, 615, { arriveReady: true });
  const initialSpawns = 8;
  for (const u of [g1, g2]) {
    u.gasTarget = geyser; geyser.workers.push(u);
    u.setOrder({ type: 'harvestGas' });
  }

  // command source = fixed replay script: CC re-queues a rigger every 120
  // ticks while minerals allow (queueUnit enforces cost itself)
  let queued = 0;
  const script = (t) => {
    if (t >= 24 && t < 6000 && t % 120 === 0) {
      if (cc.queueUnit('rigger')) queued++;
    }
  };

  const trace = [];
  for (let t = 0; t < ticks; t++) {
    script(t);
    w.time.now = t;
    for (const u of w.units) if (!u.dead) u.update(TICK);
    for (const b of w.buildings) b.update(TICK);
    trace.push(
      w.units.map(u => `${u.kind}:${u.x.toFixed(4)},${u.y.toFixed(4)},${u.state},${u.cargo},${u.dead ? 1 : 0}`).join('|')
      + `#${w.buildings.length}#${w.players[0].minerals.toFixed(3)}#${w.players[0].gas.toFixed(3)}#${w.players[0].supplyUsed}`
    );
  }

  const p0 = w.players[0];
  const minedM = startM - w.minerals.reduce((s, m) => s + (m.amount > 0 ? m.amount : 0), 0);
  const minedG = startG - geyser.gas;
  let flightM = 0, flightG = 0;
  for (const u of w.units) if (!u.dead && u.cargo > 0) { if (u.cargoGas) flightG += u.cargo; else flightM += u.cargo; }
  const full = trace.join('\n');
  const { createHash } = require('crypto');
  return {
    hash: createHash('sha256').update(full).digest('hex').slice(0, 16),
    nan: /NaN|Infinity/.test(full),
    minedM, minedG, flightM, flightG,
    queued, spawnTotal, spawnBlocked,
    supplyUsed: p0.supplyUsed, supplyCap: p0.supplyCap,
    finalM: p0.minerals, finalG: p0.gas,
    alive: w.units.filter(u => !u.dead).length,
    initialSpawns,
  };
}

(async () => {
  if (process.argv.includes('--child')) {
    const r = await runWorld({ seed: 42, ticks: TICKS });
    console.log(`CHILD-HASH ${r.hash}`);
    process.exit(0);
  }
  if (process.argv.includes('--calibrate')) {
    const r = await runWorld({ seed: 42, ticks: TICKS });
    console.log(JSON.stringify(r, null, 1));
    process.exit(0);
  }
  let pass = 0, fail = 0;
  const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };
  const t0 = Date.now();

  const A = await runWorld({ seed: 42, ticks: TICKS });
  const B = await runWorld({ seed: 42, ticks: TICKS });

  ok('DUAL-RUN-IDENTITY', A.hash === B.hash, `${A.hash} vs ${B.hash}`);
  ok('NO-NaN', !A.nan && !B.nan);

  // Conservation over the WHOLE 5-minute replay (ledger arithmetic is
  // integer-valued in this scenario, so exact reconciliation is possible):
  // minerals: mined = deposited + in-flight; ledger = +deposited - 50/queue
  const ledgerMRecon = 300 + (A.minedM - A.flightM) - 50 * A.queued;
  ok('CONSERVE-M', Math.abs(A.finalM - ledgerMRecon) < 1e-6 && A.minedM > 200,
    `finalM=${A.finalM} recon=${ledgerMRecon} mined=${A.minedM} flight=${A.flightM} queued=${A.queued}`);
  ok('CONSERVE-GAS', Math.abs(A.finalG - (A.minedG - A.flightG)) < 1e-6 && A.minedG > 10,
    `finalG=${A.finalG} mined=${A.minedG} flight=${A.flightG}`);

  // production chain ran end-to-end
  ok('PRODUCTION-RAN', A.queued >= 5 && A.spawnTotal > A.initialSpawns, `queued=${A.queued} spawnTotal=${A.spawnTotal} alive=${A.alive}`);
  // supply accounting: every spawn charged 1 (rigger), nothing died
  ok('SUPPLY-EXACT', A.supplyUsed === A.spawnTotal, `used=${A.supplyUsed} spawns=${A.spawnTotal} cap=${A.supplyCap}`);
  // production spawns bypass the supply cap via arriveReady — live
  // semantics pinned here (the cap only gates non-arriveReady spawns)
  ok('SUPPLY-OVERSHOOT-SEMANTICS', A.spawnTotal > 8 + 10 && A.spawnBlocked === 0, `spawns=${A.spawnTotal} blocked=${A.spawnBlocked}`);

  // exact 5-minute totals, calibrated from this scenario at this tree
  // (full field depletion 1200 M + 300 G mined; 30 queue successes; 38 spawns)
  const PIN_M = 0, PIN_G = 296;
  ok('TOTALS-PIN', A.minedM === 1200 && A.minedG === 300 && A.spawnTotal === 38 && A.queued === 30,
    `mined=${A.minedM}/${A.minedG} queued=${A.queued} spawns=${A.spawnTotal}`);
  ok('LEDGER-PIN-M', Math.abs(A.finalM - PIN_M) < 1e-9, `finalM=${A.finalM} pin=${PIN_M}`);
  ok('LEDGER-PIN-G', Math.abs(A.finalG - PIN_G) < 1e-9, `finalG=${A.finalG} pin=${PIN_G}`);

  const child = spawnSync(process.execPath, ['--jitless', __filename, '--child'], { encoding: 'utf8', timeout: 180000 });
  const m = /CHILD-HASH (\w+)/.exec(child.stdout || '');
  ok('CROSS-V8', !!m && m[1] === A.hash, `${m ? m[1] : 'no child hash'} vs ${A.hash}`);

  console.log(`RESULT ECONOMY-GOLDEN ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(fail === 0 ? 0 : 1);
})();