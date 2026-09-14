/**
 * scripts/verify-clearance.cjs - Deterministic clearance verifier for P0.009.
 */
const path = require('node:path'), { pathToFileURL } = require('node:url'), { performance } = require('node:perf_hooks');

const phaserPath = require.resolve('phaser');
require.cache[phaserPath] = { id: phaserPath, filename: phaserPath, loaded: true, exports: {} };

function createMockWorld(navGrid) {
  const alerts = [];
  return {
    add: {
      container: (x, y) => ({ x, y, setPosition(nx, ny) { this.x = nx; this.y = ny; }, setScale() {}, setDepth() {}, add() {}, setVisible() {} }),
      image: () => ({ setScale() {}, setAlpha() {}, setDepth() {}, destroy() {} }),
      graphics: () => ({ clear() {}, fillStyle() {}, fillRect() {}, setDepth() {}, lineStyle() {}, lineBetween() {} }),
      circle: () => ({ setDepth() {}, destroy() {} }),
      text: () => ({ setOrigin() {}, setDepth() {}, destroy() {} }),
    },
    textures: { exists: () => false },
    tweens: { add: () => {} },
    time: { now: 0, delayedCall: () => {} },
    nav: navGrid,
    events: { emit(e, ...a) { if (e === 'hud:alert') alerts.push({ event: e, args: a, time: performance.now() }); }, on() {}, once() {}, off() {} },
    alerts,
  };
}

function buildScenario(NavGrid, i) {
  const w = 32, h = 32, ts = 10, grid = new NavGrid(w, h, ts);
  if (i < 20) {
    if (i < 7) {
      const wx = 12 + (i % 3) * 2, gapY = 6 + i * 3;
      for (let y = 0; y < h; y++) if (y !== gapY) grid.solid[grid.hIdx(wx, y)] = 1;
      return { cat: 'gap', grid, sx: (wx - 5) * ts + 5, sy: gapY * ts + 5, gx: (wx + 5) * ts + 5, gy: gapY * ts + 5, ts };
    }
    if (i < 14) {
      const k = i - 7, wy = 12 + (k % 3) * 2, gapX = 6 + k * 3;
      for (let x = 0; x < w; x++) if (x !== gapX) grid.solid[grid.hIdx(x, wy)] = 1;
      return { cat: 'gap', grid, sx: gapX * ts + 5, sy: (wy - 5) * ts + 5, gx: gapX * ts + 5, gy: (wy + 5) * ts + 5, ts };
    }
    const k = i - 14, gap = 10 + k * 2, off = (k % 2 === 0) ? -2 : 2;
    for (let x = 0; x < w; x++) {
      if (x === gap) continue;
      const y0 = x + off, y1 = y0 + 1;
      if (y0 >= 0 && y0 < h) grid.solid[grid.hIdx(x, y0)] = 1;
      if (y1 >= 0 && y1 < h) grid.solid[grid.hIdx(x, y1)] = 1;
    }
    return { cat: 'gap', grid, sx: (gap - 4) * ts + 5, sy: (gap + off + 4) * ts + 5, gx: (gap + 4) * ts + 5, gy: (gap + off - 4) * ts + 5, ts };
  }
  if (i < 35) {
    const sub = i - 20, width = 3 + (sub % 3);
    if (sub < 5) {
      const y0 = 10 + (sub % 3) * 3, y1 = y0 + width - 1;
      for (let y = 0; y < h; y++) if (y < y0 || y > y1) for (let x = 0; x < w; x++) grid.solid[grid.hIdx(x, y)] = 1;
      const my = Math.floor((y0 + y1) / 2);
      return { cat: 'valley', grid, sx: 4 * ts + 5, sy: my * ts + 5, gx: 27 * ts + 5, gy: my * ts + 5, ts };
    }
    if (sub < 10) {
      const x0 = 10 + ((sub - 5) % 3) * 3, x1 = x0 + width - 1;
      for (let x = 0; x < w; x++) if (x < x0 || x > x1) for (let y = 0; y < h; y++) grid.solid[grid.hIdx(x, y)] = 1;
      const mx = Math.floor((x0 + x1) / 2);
      return { cat: 'valley', grid, sx: mx * ts + 5, sy: 4 * ts + 5, gx: mx * ts + 5, gy: 27 * ts + 5, ts };
    }
    const k = sub - 10, y0 = 8 + k * 3, y1 = y0 + width - 1;
    for (let y = 0; y < h; y++) if (y < y0 || y > y1) for (let x = 0; x < w; x++) grid.solid[grid.hIdx(x, y)] = 1;
    const my = Math.floor((y0 + y1) / 2);
    return { cat: 'valley', grid, sx: (3 + k) * ts + 5, sy: my * ts + 5, gx: (28 - k) * ts + 5, gy: my * ts + 5, ts };
  }
  if (i < 45) {
    const sub = i - 35, width = 3;
    if (sub < 4) {
      const y0 = 10 + sub * 3, y1 = y0 + width - 1;
      for (let y = 0; y < h; y++) if (y < y0 || y > y1) for (let x = 0; x < w; x++) grid.solid[grid.hIdx(x, y)] = 1;
      return { cat: 'ramp', grid, sx: 4 * ts + 5, sy: (y0 + 1) * ts + 5, gx: 27 * ts + 5, gy: (y0 + 1) * ts + 5, ts };
    }
    if (sub < 7) {
      const x0 = 10 + (sub - 4) * 4, x1 = x0 + width - 1;
      for (let x = 0; x < w; x++) if (x < x0 || x > x1) for (let y = 0; y < h; y++) grid.solid[grid.hIdx(x, y)] = 1;
      return { cat: 'ramp', grid, sx: (x0 + 1) * ts + 5, sy: 4 * ts + 5, gx: (x0 + 1) * ts + 5, gy: 27 * ts + 5, ts };
    }
    const k = sub - 7, y0 = 12 + k * 2, y1 = y0 + width - 1;
    for (let y = 0; y < h; y++) if (y < y0 || y > y1) for (let x = 0; x < w; x++) grid.solid[grid.hIdx(x, y)] = 1;
    return { cat: 'ramp', grid, sx: (5 + k * 2) * ts + 5, sy: (y0 + 1) * ts + 5, gx: (25 - k * 2) * ts + 5, gy: (y0 + 1) * ts + 5, ts };
  }
  const sub = i - 45, bx0 = 10 + sub, bx1 = 20 + sub, by0 = 8 + sub, by1 = 22 + sub;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) grid.solid[grid.hIdx(x, y)] = 1;
  return { cat: 'flying', grid, sx: 4 * ts + 5, sy: 16 * ts + 5, gx: 27 * ts + 5, gy: 16 * ts + 5, ts };
}

function runAll50Cases(NavGrid, Unit) {
  let smallGapPassCount = 0, largeGapRejectCount = 0, widePassCount = 0, flyingPassCount = 0;
  const caseRecords = [];

  for (let i = 0; i < 50; i++) {
    const { cat, grid, sx, sy, gx, gy, ts } = buildScenario(NavGrid, i);
    if (cat === 'gap') {
      const wSmall = createMockWorld(grid), marine = new Unit(wSmall, 0, 'marine', sx, sy);
      const resSmall = marine.repath(gx, gy);
      const smallOk = resSmall?.reachable === true && resSmall?.status === 'ok' && !marine.unreachable &&
        marine.path?.length >= 2 && Math.abs(marine.path.at(-1).x - gx) < 0.01 && Math.abs(marine.path.at(-1).y - gy) < 0.01;
      if (!smallOk) throw new Error(`Case ${i}: small ground failed gap`);
      for (const p of marine.path) if (!grid.walkable(Math.floor(p.x / ts), Math.floor(p.y / ts), 0)) throw new Error(`Case ${i}: small route illegal cell`);
      smallGapPassCount++;

      const wLarge = createMockWorld(grid), tank = new Unit(wLarge, 0, 'tank', sx, sy);
      const resLarge = tank.repath(gx, gy);
      const largeRejected = resLarge?.reachable === false && resLarge?.status === 'unreachable' && resLarge?.partial === true &&
        tank.unreachable === true && wLarge.alerts.some(a => a.event === 'hud:alert' && a.args[0] === 'DESTINATION UNREACHABLE');
      if (!largeRejected) throw new Error(`Case ${i}: large ground failed rejection`);
      if (!tank.path || tank.path.length === 0) throw new Error(`Case ${i}: large ground empty path`);
      for (const p of tank.path) if (!grid.walkable(Math.floor(p.x / ts), Math.floor(p.y / ts), 1)) throw new Error(`Case ${i}: large ground entered clearance-illegal cell`);
      for (let s = 0; s < tank.path.length - 1; s++) if (!grid.lineClear(tank.path[s].x, tank.path[s].y, tank.path[s + 1].x, tank.path[s + 1].y, 1)) throw new Error(`Case ${i}: large lineClear violation`);
      largeGapRejectCount++;

      caseRecords.push({ id: i, cat, sLen: marine.path.length, lLen: tank.path.length, end: tank.path.at(-1) });
    } else if (cat === 'valley' || cat === 'ramp') {
      const wSmall = createMockWorld(grid), marine = new Unit(wSmall, 0, 'marine', sx, sy);
      const resSmall = marine.repath(gx, gy);
      const smallOk = resSmall?.reachable === true && resSmall?.status === 'ok' && !marine.unreachable &&
        marine.path?.length >= 2 && Math.abs(marine.path.at(-1).x - gx) < 0.01 && Math.abs(marine.path.at(-1).y - gy) < 0.01;
      if (!smallOk) throw new Error(`Case ${i}: small ground failed ${cat}`);
      for (const p of marine.path) if (!grid.walkable(Math.floor(p.x / ts), Math.floor(p.y / ts), 0)) throw new Error(`Case ${i}: small illegal cell in ${cat}`);

      const wLarge = createMockWorld(grid), tank = new Unit(wLarge, 0, 'tank', sx, sy);
      const resLarge = tank.repath(gx, gy);
      const largeOk = resLarge?.reachable === true && resLarge?.status === 'ok' && !tank.unreachable &&
        tank.path?.length >= 2 && Math.abs(tank.path.at(-1).x - gx) < 0.01 && Math.abs(tank.path.at(-1).y - gy) < 0.01;
      if (!largeOk) throw new Error(`Case ${i}: large ground failed ${cat}`);
      for (const p of tank.path) if (!grid.walkable(Math.floor(p.x / ts), Math.floor(p.y / ts), 1)) throw new Error(`Case ${i}: large illegal cell in ${cat}`);
      for (let s = 0; s < tank.path.length - 1; s++) if (!grid.lineClear(tank.path[s].x, tank.path[s].y, tank.path[s + 1].x, tank.path[s + 1].y, 1)) throw new Error(`Case ${i}: large lineClear in ${cat}`);

      widePassCount++;
      caseRecords.push({ id: i, cat, sLen: marine.path.length, lLen: tank.path.length });
    } else {
      const wFly = createMockWorld(grid), wraith = new Unit(wFly, 0, 'wraith', sx, sy);
      const resFly = wraith.repath(gx, gy);
      const flyOk = resFly?.status === 'flying' && resFly?.reachable === true && !wraith.unreachable &&
        wraith.path?.length === 1 && wraith.path[0].x === gx && wraith.path[0].y === gy && wFly.alerts.length === 0;
      if (!flyOk) throw new Error(`Case ${i}: flying failed direct crossing`);
      flyingPassCount++;
      caseRecords.push({ id: i, cat, fLen: wraith.path.length });
    }
  }
  return { smallGapPassCount, largeGapRejectCount, widePassCount, flyingPassCount, caseRecords };
}

function assertSmoothLineClear(NavGrid) {
  const grid = new NavGrid(16, 16, 10);
  for (let y = 3; y <= 12; y++) grid.solid[grid.hIdx(8, y)] = 1;
  if (!grid.walkable(7, 7, 0)) throw new Error('walkable(7,7,0) expected true');
  if (grid.walkable(7, 7, 1)) throw new Error('walkable(7,7,1) expected false');
  if (!grid.lineClear(75, 25, 75, 135, 0)) throw new Error('lineClear(clearance=0) expected true');
  if (grid.lineClear(75, 25, 75, 135, 1)) throw new Error('lineClear(clearance=1) expected false');
  const smoothed = grid.smooth([{ x: 55, y: 25 }, { x: 55, y: 75 }, { x: 55, y: 125 }], 1);
  for (const wp of smoothed) if (!grid.walkable(Math.floor(wp.x / 10), Math.floor(wp.y / 10), 1)) throw new Error('smooth waypoint illegal');
}

function assertUnitRepathMapping(NavGrid, Unit) {
  const grid = new NavGrid(16, 16, 10), world = createMockWorld(grid);
  let seenClearance = null;
  const origFindPath = grid.findPath.bind(grid);
  grid.findPath = (sx, sy, gx, gy, clearance, id, maxNodes) => { seenClearance = clearance; return origFindPath(sx, sy, gx, gy, clearance, id, maxNodes); };
  new Unit(world, 0, 'marine', 25, 25).repath(85, 85);
  if (seenClearance !== 0) throw new Error(`marine clearance expected 0, got ${seenClearance}`);
  new Unit(world, 0, 'tank', 25, 25).repath(85, 85);
  if (seenClearance !== 1) throw new Error(`tank clearance expected 1, got ${seenClearance}`);
  grid.findPath = origFindPath;
}

async function main() {
  const { NavGrid } = await import(pathToFileURL(path.resolve(__dirname, '../src2/engine/pathfinding.js')).href);
  const { Unit } = await import(pathToFileURL(path.resolve(__dirname, '../src2/engine/entity.js')).href);

  for (const fn of ['walkable', 'findPath', 'smooth', 'lineClear']) if (typeof NavGrid.prototype[fn] !== 'function') throw new Error(`NavGrid.${fn} missing`);
  if (typeof Unit.prototype.repath !== 'function') throw new Error('Unit.repath missing');

  assertUnitRepathMapping(NavGrid, Unit);
  assertSmoothLineClear(NavGrid);

  const t0 = performance.now();
  const run1 = runAll50Cases(NavGrid, Unit);
  const runtimeMs = performance.now() - t0;
  const run2 = runAll50Cases(NavGrid, Unit);
  if (JSON.stringify(run1.caseRecords) !== JSON.stringify(run2.caseRecords)) throw new Error('Deterministic repeat mismatch');

  console.log(`Core 50-case runtime: ${runtimeMs.toFixed(2)}ms`);
  console.log(`Small 1-cell gap passes: ${run1.smallGapPassCount} / 20`);
  console.log(`Large 1-cell gap rejections: ${run1.largeGapRejectCount} / 20`);
  console.log(`Wide valley/ramp passes: ${run1.widePassCount} / 25`);
  console.log(`Flying passes: ${run1.flyingPassCount} / 5`);

  if (run1.smallGapPassCount !== 20 || run1.largeGapRejectCount !== 20 || run1.widePassCount !== 25 || run1.flyingPassCount !== 5 || runtimeMs >= 500) {
    throw new Error('Category counts or runtime threshold failed');
  }
  console.log('PASS: ALL 50 CLEARANCE CASES PASSED DETERMINISTICALLY UNDER 500ms');
  process.exit(0);
}

main().catch(err => { console.error('FAIL:', err.message || err); process.exit(1); });
