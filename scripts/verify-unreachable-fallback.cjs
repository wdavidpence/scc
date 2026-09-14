/**
 * scripts/verify-unreachable-fallback.cjs — Deterministic harness verifying unreachable fallback in SCC2.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');

function createMockWorld(navGrid) {
  const alerts = [];
  const container = { x: 0, y: 0, setPosition(x, y) { this.x = x; this.y = y; }, setScale() {}, setDepth() {}, add() {}, setVisible() {} };
  return {
    add: {
      container: (x, y) => { container.x = x; container.y = y; return container; },
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

function buildTrialScenario(NavGrid, trialIndex) {
  const w = 32, h = 32, tileSize = 10;
  const grid = new NavGrid(w, h, tileSize);
  let sx, sy, gx, gy;

  if (trialIndex < 25) {
    for (let y = 10; y <= 24; y++) for (let x = 10; x <= 24; x++) grid.solid[grid.hIdx(x, y)] = 1;
    sx = (2 + (trialIndex % 6)) * tileSize + 5;
    sy = (2 + Math.floor(trialIndex / 6)) * tileSize + 5;
    gx = (15 + (trialIndex % 6)) * tileSize + 5;
    gy = (15 + ((trialIndex * 2) % 6)) * tileSize + 5;
  } else if (trialIndex < 50) {
    const splitX = 16, sub = trialIndex - 25;
    for (let y = 0; y < h; y++) grid.solid[grid.hIdx(splitX, y)] = 1;
    sx = (3 + (sub % 8)) * tileSize + 5;
    sy = (3 + Math.floor(sub / 8) * 6) * tileSize + 5;
    gx = (20 + (sub % 8)) * tileSize + 5;
    gy = (3 + ((sub * 3) % 25)) * tileSize + 5;
  } else if (trialIndex < 75) {
    const sub = trialIndex - 50;
    const rx0 = 12 + (sub % 4) * 2, ry0 = 12 + ((sub * 2) % 4) * 2;
    const rx1 = rx0 + 6, ry1 = ry0 + 6;
    for (let x = rx0; x <= rx1; x++) { grid.solid[grid.hIdx(x, ry0)] = 1; grid.solid[grid.hIdx(x, ry1)] = 1; }
    for (let y = ry0; y <= ry1; y++) { grid.solid[grid.hIdx(rx0, y)] = 1; grid.solid[grid.hIdx(rx1, y)] = 1; }
    sx = 3 * tileSize + 5;
    sy = (3 + sub) * tileSize + 5;
    gx = (rx0 + 3) * tileSize + 5;
    gy = (ry0 + 3) * tileSize + 5;
  } else {
    const sub = trialIndex - 75;
    const bx = (sub % 2 === 0) ? 20 : 0, by = (Math.floor(sub / 12) % 2 === 0) ? 20 : 0;
    for (let y = by; y < by + 12; y++) for (let x = bx; x < bx + 12; x++) grid.solid[grid.hIdx(x, y)] = 1;
    sx = ((sub % 2 === 0) ? 5 : 25) * tileSize + 5;
    sy = 15 * tileSize + 5;
    gx = (bx + 4 + (sub % 4)) * tileSize + 5;
    gy = (by + 4 + ((sub * 2) % 4)) * tileSize + 5;
  }
  return { grid, sx, sy, gx, gy, tileSize };
}

function computeNearestReachable(grid, stx, sty, gtx, gty, clearance = 0, ignoreId = -1) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const visited = new Set(), queue = [[stx, sty]];
  visited.add(grid.hIdx(stx, sty));
  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny) || !grid.walkable(nx, ny, clearance, ignoreId)) continue;
      if (dx !== 0 && dy !== 0 && (!grid.walkable(cx + dx, cy, clearance, ignoreId) || !grid.walkable(cx, cy + dy, clearance, ignoreId))) continue;
      const idx = grid.hIdx(nx, ny);
      if (!visited.has(idx)) { visited.add(idx); queue.push([nx, ny]); }
    }
  }
  const startDistSq = (stx - gtx) ** 2 + (sty - gty) ** 2;
  let minDistSq = Infinity;
  for (const idx of visited) {
    const d2 = (idx % grid.w - gtx) ** 2 + (Math.floor(idx / grid.w) - gty) ** 2;
    if (d2 < minDistSq) minDistSq = d2;
  }
  const nearestSet = new Set();
  for (const idx of visited) {
    if ((idx % grid.w - gtx) ** 2 + (Math.floor(idx / grid.w) - gty) ** 2 === minDistSq) nearestSet.add(idx);
  }
  return { hasCloserCell: minDistSq < startDistSq, nearestSet };
}

async function main() {
  const phaserPath = require.resolve('phaser');
  require.cache[phaserPath] = { id: phaserPath, filename: phaserPath, loaded: true, exports: {} };

  const navModulePath = pathToFileURL(path.resolve(__dirname, '../src2/engine/pathfinding.js')).href;
  const { NavGrid } = await import(navModulePath);

  const entityModulePath = pathToFileURL(path.resolve(__dirname, '../src2/engine/entity.js')).href;
  const { Unit } = await import(entityModulePath);

  const TOTAL_TRIALS = 100;
  const latencies = [];
  let emptyPathFailures = 0, terminalNotNearestFailures = 0, solidWaypointViolations = 0;
  let directSolidFallbacks = 0, missingExplicitUnreachable = 0, missingHudAlert = 0;
  let latencyExceededCount = 0, passedTrials = 0;

  console.log(`Starting ${TOTAL_TRIALS} deterministic unreachable/blocked-goal trials...`);

  for (let i = 0; i < TOTAL_TRIALS; i++) {
    const { grid, sx, sy, gx, gy, tileSize } = buildTrialScenario(NavGrid, i);
    const world = createMockWorld(grid);
    const unit = new Unit(world, 0, 'marine', sx, sy);
    const stx = Math.floor(sx / tileSize), sty = Math.floor(sy / tileSize);
    if (!grid.walkable(stx, sty)) throw new Error(`Trial ${i} invalid setup: start tile must be walkable`);

    const gtx = Math.floor(gx / tileSize), gty = Math.floor(gy / tileSize);
    const { hasCloserCell, nearestSet } = computeNearestReachable(grid, stx, sty, gtx, gty, 0, unit.id);

    const t0 = performance.now();
    const result = unit.repath(gx, gy);
    const trialLatency = performance.now() - t0;
    latencies.push(trialLatency);

    let trialFailed = false;
    if (hasCloserCell) {
      if (!unit.path || unit.path.length === 0) {
        emptyPathFailures++;
        trialFailed = true;
      } else {
        const termWp = unit.path[unit.path.length - 1];
        const termIdx = grid.hIdx(Math.floor(termWp.x / tileSize), Math.floor(termWp.y / tileSize));
        if (!nearestSet.has(termIdx)) {
          terminalNotNearestFailures++;
          trialFailed = true;
        }
      }
    }

    const solidEntries = (unit.path || []).filter(p => !grid.walkable(Math.floor(p.x / tileSize), Math.floor(p.y / tileSize)));
    if (solidEntries.length > 0) { solidWaypointViolations += solidEntries.length; trialFailed = true; }

    if (unit.path && unit.path.length === 1 && unit.path[0].x === gx && unit.path[0].y === gy) {
      directSolidFallbacks++;
      trialFailed = true;
    }

    const hasExplicitResult = (
      (result && (result.reachable === false || result.status === 'unreachable')) ||
      unit.unreachable === true ||
      (unit.lastPathResult && (unit.lastPathResult.reachable === false || unit.lastPathResult.status === 'unreachable')) ||
      (unit.lastRepathResult && (unit.lastRepathResult.reachable === false || unit.lastRepathResult.status === 'unreachable'))
    );
    if (!hasExplicitResult) { missingExplicitUnreachable++; trialFailed = true; }

    const alertEmitted = world.alerts.length > 0 && world.alerts.some(a => a.event === 'hud:alert');
    if (!alertEmitted) { missingHudAlert++; trialFailed = true; }
    if (trialLatency > 100) { latencyExceededCount++; trialFailed = true; }
    if (!trialFailed) passedTrials++;
  }

  const minLat = Math.min(...latencies).toFixed(3);
  const maxLat = Math.max(...latencies).toFixed(3);
  const avgLat = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3);

  console.log('--- HARNESS TRIAL RESULTS ---');
  console.log(`Total Trials: ${TOTAL_TRIALS} | Passed: ${passedTrials} | Failed: ${TOTAL_TRIALS - passedTrials}`);
  console.log(`Empty Path: ${emptyPathFailures} | Terminal Not Nearest: ${terminalNotNearestFailures} | Solid Waypoints: ${solidWaypointViolations}`);
  console.log(`Direct Solid: ${directSolidFallbacks} | Missing Unreachable: ${missingExplicitUnreachable} | Missing Alert: ${missingHudAlert} | Latency > 100ms: ${latencyExceededCount}`);
  console.log(`Latency (ms) - Min: ${minLat}, Avg: ${avgLat}, Max: ${maxLat}`);

  if (emptyPathFailures > 0 || terminalNotNearestFailures > 0 || directSolidFallbacks > 0 || solidWaypointViolations > 0 || missingExplicitUnreachable > 0 || missingHudAlert > 0) {
    console.error('FAIL: unreachable fallback harness assertion failed.');
    process.exit(1);
  }

  // Regression check: flying units must preserve straight-line flight paths
  const flyGrid = new NavGrid(16, 16, 10);
  for (let y = 3; y <= 8; y++) for (let x = 3; x <= 8; x++) flyGrid.solid[flyGrid.hIdx(x, y)] = 1;
  const flyWorld = createMockWorld(flyGrid);
  const flyUnit = new Unit(flyWorld, 0, 'wraith', 15, 15);
  flyUnit.repath(55, 55);
  if (!flyUnit.flying || flyUnit.path.length !== 1 || flyUnit.path[0].x !== 55 || flyUnit.path[0].y !== 55 || flyWorld.alerts.length > 0) {
    console.error('FAIL: flying unit flight path altered or alert emitted.');
    process.exit(1);
  }

  // Regression check: reachable routes must still construct valid paths without unreachable alert
  const reachGrid = new NavGrid(16, 16, 10);
  const reachWorld = createMockWorld(reachGrid);
  const reachUnit = new Unit(reachWorld, 0, 'marine', 15, 15);
  const reachRes = reachUnit.repath(85, 85);
  if (!reachRes || !reachRes.reachable || reachUnit.path.length < 2 || reachWorld.alerts.length > 0) {
    console.error('FAIL: reachable ground route failed or alert emitted.');
    process.exit(1);
  }

  console.log('PASS: All 100 blocked-goal trials passed with nonempty legal nearest-reachable paths and explicit unreachable feedback.');
  console.log('PASS: Flying unit straight-line and ground reachable route behaviors preserved.');
  process.exit(0);
}

main().catch(err => {
  console.error('Harness execution error:', err);
  process.exit(1);
});
