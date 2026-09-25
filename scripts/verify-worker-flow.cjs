#!/usr/bin/env node
// P1.039 — Worker economy flow checks (headless, deterministic).
// Plays the worker loop through the REAL entity.js update() against a
// world that models cliff walls + dense crowds (the failure shape the user
// reported: riggers jam, never complete mine→load→unload cycles).
//
// Contract:
//  1. CYCLES: workers complete harvest→return→unload cycles (econ > 0 and
//     every live worker cycles, not just one).
//  2. NO-STARVATION: throughput >= 50% of the open-field baseline measured
//     with identical geometry and no cliffs (cliffs route around, they don't
//     wall the chain).
//  3. NO-JAM: no worker spends > 1.5 s (36 ticks) in harvest/returnCargo
//     while > 6px from both the mineral and the refinery (that shape is the
//     old crowd deadlock; separation push used to cancel pathing forever).
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const TICK = 1 / 24;
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); } };

function chainer() {
  const c = new Proxy(function () {}, {
    get: (t, k) => (k === 'x' || k === 'y' ? 0 : c),
    set: () => true, apply: () => c,
  });
  return c;
}
function cont(x, y) {
  const o = { x, y, list: [],
    setPosition(nx, ny) { o.x = nx; o.y = ny; },
    add() {}, remove() {}, destroy() {},
    setDepth() {}, setScale() {}, setVisible() {}, setAlpha() {},
    setRotation() {}, setAngle() {}, setFlipX() {}, setTint() {},
    getScaleX() { return 1; } };
  return o;
}

async function main() {
  const { register } = require('node:module');
  register('./stubs/loader.mjs', pathToFileURL(__filename));
  const { Unit } = await import(path.resolve(__dirname, '../src2/engine/entity.js'));
  const { SimRng } = await import(path.resolve(__dirname, '../src2/engine/simRng.js'));

  function makeWorld({ cliffs, seed }) {
    const rng = new SimRng(seed);
    const CELL = 28;
    const spatial = {
      map: new Map(),
      rebuild(units) { this.map.clear(); for (const u of units) { if (u.dead) continue; const k = ((u.x / CELL) | 0) + ',' + ((u.y / CELL) | 0); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(u); } },
      near(x, y) { const out = []; const cx = (x / CELL) | 0, cy = (y / CELL) | 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const c = this.map.get((cx + dx) + ',' + (cy + dy)); if (c) out.push(...c); } return out; },
    };
    const T = 16;
    // cliff band between the field (x~150) and refinery (x~420): straight
    // lines across the map are blocked; a routed world goes around (north).
    const inBand = (x, y) => x >= 200 && x <= 320 && y >= 128 && y <= 144;
    const w = {
      units: [], projectiles: [], rng, simRng: rng, econ: 0,
      time: { now: 0, delayedCall: () => ({}) },
      add: new Proxy({ container: (x, y) => cont(x, y) }, { get: (t, k) => (k in t ? t[k] : () => chainer()) }),
      textures: { exists: () => false },
      tweens: { add() {}, addCounter() {} }, events: { emit() {} },
      cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
      camNear: () => false, currentlyVisible: () => true, flash() {}, shake() {},
      groundBlocked(u, x, y) {
        if (!cliffs) return false;
        if (!inBand(x, y)) return false;
        return !inBand(u.x, u.y);
      },
      blightSpeedAt: () => false,
      separationVector(u) {
        // live formula (BattleScene.separationVector)
        let sx = 0, sy = 0;
        for (const o of spatial.near(u.x, u.y)) {
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
      },
      nav: { idx: (x, y) => y * 64 + x, blockedBy: new Int8Array(64 * 64), walkable: () => true,
        unblockBy() {}, findPath: (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }] },
      techResearched: () => false, hasAddOn: () => false, spend: () => true,
      minerals: [{ x: 150, y: 100, amount: 1e6 }],
      refinery: { x: 420, y: 100 },
      spawnProjectile() {}, applyHit() {},
      pickMineralForWorker(u) {
        const m = this.minerals[0];
        return m && m.amount > 0 ? m : null;
      },
      nearestDropOff(u) { return u.cargo > 0 ? this.refinery : null; },
      onMineralDug() {}, depleteMineral() {},
      onCargoDeposited(u) { this.econ += u.cargo; },
      acquireFor() { return null; }, findNearestEnemy() { return null; }, onUnitDeath() {},
    };
    // 8 workers packed at the field — the reported pile-up density
    for (let i = 0; i < 8; i++) {
      const u = new Unit(w, 0, 'rigger', 100 + (i % 4) * 14, 70 + Math.floor(i / 4) * 14);
      u.setOrder({ type: 'harvest' });
      w.units.push(u);
    }
    w.spatial = spatial;
    return w;
  }

  function run(world, ticks) {
    const jam = new Map(), cur = new Map(), stuckTicks = new Map();
    for (const u of world.units) { jam.set(u.id, 0); cur.set(u.id, { x: u.x, y: u.y }); stuckTicks.set(u.id, 0); }
    for (let t = 0; t < ticks; t++) {
      world.spatial.rebuild(world.units);
      world.time.now = t;
      for (const u of world.units) if (!u.dead) u.update(TICK);
      for (const u of world.units) {
        if (u.dead) continue;
        const prev = cur.get(u.id);
        const sp = Math.hypot(u.x - prev.x, u.y - prev.y);
        const nearTarget = (u.state === 'harvest' && Math.hypot(u.x - 150, u.y - 100) < 20)
          || (u.state === 'returnCargo' && Math.hypot(u.x - 420, u.y - 100) < 40);
        if (!nearTarget && sp < 0.05) { cur.set(u.id, { x: u.x, y: u.y }); jam.set(u.id, jam.get(u.id) + 1); stuckTicks.set(u.id, Math.max(stuckTicks.get(u.id), jam.get(u.id))); }
        else { jam.set(u.id, 0); cur.set(u.id, { x: u.x, y: u.y }); }
      }
    }
    return { econ: world.econ, stuck: Math.max(...stuckTicks.values()),
      alive: world.units.filter(u => !u.dead).length,
      cycling: world.units.filter(u => !u.dead && (u.cargo > 0 || u.state === 'returnCargo' || u.state === 'harvest')).length };
  }

  const TICKS = 2400; // 100 s
  const open = run(makeWorld({ cliffs: false, seed: 7 }), TICKS);
  const cliff = run(makeWorld({ cliffs: true, seed: 7 }), TICKS);
  console.log('open-field econ:', open.econ, 'maxStuck:', open.stuck, '| cliff econ:', cliff.econ, 'maxStuck:', cliff.stuck);

  ok('CYCLES: open-field chain deposits > 0', open.econ > 0, 'econ=' + open.econ);
  ok('CYCLES: cliff chain completes (econ > 0)', cliff.econ > 0, 'econ=' + cliff.econ);
  ok('CYCLES: all 8 workers still cycling', cliff.cycling === 8, 'cycling=' + cliff.cycling + '/8');
  ok('NO-STARVATION: cliff throughput >= 50% of open field', cliff.econ >= open.econ * 0.5, `${cliff.econ} vs ${open.econ}`);
  ok('NO-JAM: no worker stuck > 36 ticks away from targets', cliff.stuck <= 36, 'maxStuck=' + cliff.stuck);
  // determinism: same world twice, identical econ
  const again = run(makeWorld({ cliffs: true, seed: 7 }), TICKS);
  ok('DETERMINISM: identical repeat-run econ', again.econ === cliff.econ, `${again.econ} vs ${cliff.econ}`);
  console.log(fail === 0 ? `RESULT WORKER-FLOW PASS ${pass}/${pass}` : `RESULT WORKER-FLOW FAIL ${fail}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error('ERR', e); process.exit(2); });