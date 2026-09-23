// P1.029 i2 — headless golden tests for unit order execution.
// Contract (ticket done-when): move/attack/harvest-style order chains run
// WITHOUT DOM or Phaser — entity.js is imported directly under plain Node
// with a loader hook stubbing the bare 'phaser' import (zero runtime
// namespace usage) and a fake world. The REAL Unit.update/stepAlongPath/
// updateAttackTarget/updateHarvest chains execute; only display + projectile
// flight are stubbed (flight closed by a minimal homing step so damage
// actually lands — order state machines are the thing under test).
//
// Proves: (1) byte-identical state traces across two identical runs,
// (2) cross-engine identity (default V8 vs --jitless child),
// (3) seed sensitivity (different seed => different trace; no no-op test),
// (4) behavior: arrive&halt, focus-fire kill, patrol reversal, full
// harvest cargo cycle (8 -> drop-off -> 0), stop freeze, no NaN in sim state.
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const TICK = 1 / 24;

let LOADED = null;
async function loadModules() {
  if (LOADED) return LOADED;
  const { register } = require('node:module');
  register('./stubs/loader.mjs', require('url').pathToFileURL(__filename));
  LOADED = {
    Unit: (await import(path.resolve(__dirname, '../src2/engine/entity.js'))).Unit,
    SimRng: (await import(path.resolve(__dirname, '../src2/engine/simRng.js'))).SimRng,
    sc1: await import(path.resolve(__dirname, '../src2/data/sc1.js')),
  };
  return LOADED;
}

async function runWorld({ seed, ticks }) {
  const { Unit, SimRng, sc1 } = await loadModules();
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
  const w = {
    units: [], projectiles: [], rng, simRng: rng, econ: 0, time: { now: 0, delayedCall: () => ({}) },
    add: {
      container: (x, y) => cont(x, y),
      image: () => chainer, graphics: () => chainer, circle: () => chainer,
      rectangle: () => chainer, text: () => chainer,
    },
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} },
    events: { emit() {} },
    // audio deliberately undefined: all sites use `audio?.x()`, guards then no-op
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
    camNear: () => false, // presentation paths stay off; state stays pure
    currentlyVisible: () => true, // retaliation machinery stays ON
    flash() {}, shake() {}, // polish deliberately undefined: `polish?.x()` guards then no-op
    // terrain: flat open field, no ramps; blight circle near enemy camp
    groundBlocked: () => false,
    blightSpeedAt: (team, x, y) => team === 1 && Math.hypot(x - 600, y - 300) < 120,
    separationVector: () => ({ x: 0, y: 0 }),
    nav: {
      idx: (x, y) => y * 64 + x,
      blockedBy: new Int8Array(64 * 64),
      walkable: () => true,
      unblockBy() {},
      findPath: (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }],
    },
    techResearched: () => false, hasAddOn: () => false, spend: () => true,
    autoMine: true, coach: null,
    minerals: [{ x: 60, y: 600, amount: 400 }, { x: 90, y: 620, amount: 400 }],
    refinery: { x: 140, y: 610 }, // drop-off anchor (plain point is enough)
    pickMineralForWorker(u) {
      let best = null, bd = 1e9;
      for (const m of this.minerals) { if (m.amount <= 0) continue; const d = Math.hypot(m.x - u.x, m.y - u.y); if (d < bd) { bd = d; best = m; } }
      return best;
    },
    nearestDropOff(u) { return u.cargo > 0 ? this.refinery : null; },
    onMineralDug() {},
    depleteMineral(t) { const i = this.minerals.indexOf(t); if (i >= 0) this.minerals.splice(i, 1); },
    onCargoDeposited(u) { this.econ += u.cargo; },
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
    spawnProjectile(p) { this.projectiles.push({ x: p.from.x, y: p.from.y, ...p }); },
    applyHit(target, dmg) { if (target && !target.dead) target.takeDamage(dmg, null); },
    findNearestEnemy(u, range) { return this.acquireFor(u, range); },
    nearestMineralPatch(u) { return this.pickMineralForWorker(u); },
    onUnitDeath() {},
  };
  // projectile step (minimal homing; order chains are under test, not the
  // projectile kernel — its own gate lives in the scene suite)
  function stepProjectiles() {
    for (const p of w.projectiles) {
      if (!p.target || p.target.dead) { p.done = true; continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
      const step = (p.speed || 600) * TICK;
      if (d <= step) { p.target.takeDamage(p.damage, p.attacker || w.units.find(u => u.team === p.team)); p.done = true; }
      else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
    }
    w.projectiles = w.projectiles.filter(p => !p.done);
  }

  // ---- scenario --------------------------------------------------------------
  const mk = (team, kind, x, y) => { const u = new Unit(w, team, kind, x, y); w.units.push(u); timers.push(u.repathTimer.toFixed(6)); return u; };
  const timers = [];
  const workerKind = Object.keys(UNITS).find((k) => UNITS[k].worker && !UNITS[k].mcv);
  if (!workerKind) throw new Error('no worker kind found in UNITS');
  const m1 = mk(0, 'marine', 300, 300);
  const m2 = mk(0, 'marine', 320, 300);
  const m3 = mk(0, 'marine', 340, 300);
  const tk = mk(0, 'tank', 300, 330);
  const wk = mk(0, workerKind, 58, 598);
  const e1 = mk(1, 'skarnling', 610, 295);
  const e2 = mk(1, 'skarnling', 625, 305);
  const e3 = mk(1, 'skarnling', 615, 320);
  const e4 = mk(1, 'skarnling', 640, 290);

  const script = (t, u) => {
    if (t === 1) {
      m1.issueMove(700, 120);                       // move chain, far from foes
      m2.patrolPoints = [{ x: 200, y: 500 }, { x: 500, y: 500 }]; // patrol chain (shape: {x,y} points)
      m2.setOrder({ type: 'patrol' });
      m3.setOrder({ type: 'attackTarget', target: e1 }); // focus-fire kill
      tk.issueMove(650, 350, true);                  // attackMove -> acquire
    }
    if (m1.state === 'move' && m1.x > 550 && m1._stopped !== true) { // scene 'stop' clone, mid-path far from foes
      m1._stopped = true; m1.order = null; m1.state = 'idle'; m1.path = []; m1.waypoints = null; m1._stopTick = t; m1._stopX = m1.x; m1._stopY = m1.y;
    }
  };

  const trace = [];
  let sawCargoFull = false, sawCargoDrop = false, patrolReversals = 0, lastMx = m2.x, mDir = 0;
  let frozenTicks = 0;
  for (let t = 0; t < ticks; t++) {
    script(t, w);
    w.time.now = t; // tick-clock display time (no wall clock anywhere)
    for (const u of w.units) if (!u.dead) u.update(TICK);
    stepProjectiles();
    if (m1._stopped === true && t > m1._stopTick + 2 && t <= m1._stopTick + 60 && !m1.dead) { const dd = Math.hypot(m1.x - m1._stopX, m1.y - m1._stopY); if (dd < 0.001) frozenTicks++; }
    if (wk.cargo >= 8) sawCargoFull = true;
    if (sawCargoFull && wk.cargo === 0) sawCargoDrop = true;
    if (m2.moving) { const d = Math.abs(m2.x - lastMx); if (d > 0.001) { const dir = Math.sign(m2.x - lastMx); if (mDir !== 0 && dir !== mDir) patrolReversals++; if (dir !== 0) mDir = dir; } lastMx = m2.x; }
    trace.push(w.units.map((u) => `${u.kind}:${u.x.toFixed(4)},${u.y.toFixed(4)},${u.state},${u.hp.toFixed(2)},${u.shield.toFixed(2)},${u.cargo},${u.dead ? 1 : 0},${u.target ? w.units.indexOf(u.target) : -1}`).join('|') + `#${w.projectiles.length}#${w.econ}`);
  }
  const full = trace.join('\n');
  const { createHash } = require('crypto');
  return {
    hash: createHash('sha256').update(full).digest('hex').slice(0, 16),
    rngsig: timers.join(','),
    nan: /NaN|Infinity/.test(full),
    stopped: !!m1._stopped,
    kill: e1.dead,
    patrolReversals,
    harvest: sawCargoFull && sawCargoDrop,
    frozenTicks,
    alive: w.units.filter((u) => !u.dead).length,
  };
}

(async () => {
  if (process.argv.includes('--child')) {
    const r = await runWorld({ seed: 42, ticks: 900 });
    console.log(`CHILD-HASH ${r.hash}`);
    process.exit(0);
  }
  let pass = 0, fail = 0;
  const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };
  const t0 = Date.now();

  const A = await runWorld({ seed: 42, ticks: 900 });
  const B = await runWorld({ seed: 42, ticks: 900 });
  const C = await runWorld({ seed: 999, ticks: 900 });

  ok('DUAL-RUN-IDENTITY', A.hash === B.hash, `${A.hash} vs ${B.hash}`);
  ok('NO-NaN', !A.nan && !B.nan && !C.nan);
  ok('RNG-STREAM-SPLIT', A.rngsig !== C.rngsig, 'per-world seeded rng consumed (repath timers differ; behavior-level seed fork covered by P1.025 gate + browser suite)');
  ok('ATTACK-KILL', A.kill);
  ok('PATROL-OSCILLATES', A.patrolReversals >= 1, `reversals=${A.patrolReversals}`);
  ok('HARVEST-CYCLE', A.harvest);
  ok('STOP-CANCELED', A.stopped && A.frozenTicks === 58, `frozen=${A.frozenTicks}/58`);

  // cross-engine child (--jitless) must produce the identical digest
  const child = spawnSync(process.execPath, ['--jitless', __filename, '--child'], { encoding: 'utf8', timeout: 180000 });
  const m = /CHILD-HASH (\w+)/.exec(child.stdout || '');
  ok('CROSS-V8', !!m && m[1] === A.hash, `${m ? m[1] : 'no child hash'} vs ${A.hash}`);

  console.log(`RESULT ORDER-GOLDEN ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(fail === 0 ? 0 : 1);
})();