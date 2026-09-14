/**
 * scripts/verify-pathfinding.cjs
 *
 * Deterministic A* verification harness for NavGrid in SCC2.
 * Covers:
 *  1. OPEN_ROUTE_RECONSTRUCTION (open 8x8 route reconstructs non-null start-to-goal path)
 *  2. BLOCKED_GOAL_SNAP (blocked goal snaps to nearest legal endpoint)
 *  3. NO_CORNER_CUTTING (diagonal path cannot cut a corner when both orthogonal neighbors are solid)
 *  4. VALLEY_GAP_DETOUR (solid wall with one valley gap forces the path through that gap)
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

function testOpenRouteReconstruction(NavGrid) {
  const grid = new NavGrid(8, 8, 10);
  const sx = 5, sy = 5;
  const gx = 75, gy = 75;
  const route = grid.findPath(sx, sy, gx, gy);

  if (route === null) {
    return {
      passed: false,
      diag: 'findPath(5, 5, 75, 75) returned null; expected non-null route (open.splice destructure defect in pathfinding.js:94)',
    };
  }

  if (!Array.isArray(route) || route.length < 2) {
    return {
      passed: false,
      diag: `expected route array with >= 2 waypoints, got length ${route ? route.length : 'non-array'}`,
    };
  }

  const startPt = route[0];
  const endPt = route[route.length - 1];
  if (startPt.x !== sx || startPt.y !== sy || endPt.x !== gx || endPt.y !== gy) {
    return {
      passed: false,
      diag: `route endpoints mismatch: start=(${startPt.x},${startPt.y}) expected (${sx},${sy}), end=(${endPt.x},${endPt.y}) expected (${gx},${gy})`,
    };
  }

  if (!grid.lineClear(startPt.x, startPt.y, endPt.x, endPt.y)) {
    return {
      passed: false,
      diag: 'expected lineClear to be true for open route between start and goal',
    };
  }

  return { passed: true, diag: `reconstructed valid open route with ${route.length} waypoints` };
}

function testBlockedGoalSnap(NavGrid) {
  const grid = new NavGrid(8, 8, 10);
  grid.blockRect(1, 7, 7, 7, 7);

  if (grid.walkable(7, 7)) {
    return { passed: false, diag: 'tile (7, 7) expected to be blocked but walkable() returned true' };
  }

  const sx = 5, sy = 5;
  const gx = 75, gy = 75;
  const route = grid.findPath(sx, sy, gx, gy);

  if (route === null) {
    return {
      passed: false,
      diag: 'findPath returned null; expected route to snap to legal endpoint near blocked goal (7, 7)',
    };
  }

  const endPt = route[route.length - 1];
  const etx = Math.floor(endPt.x / 10);
  const ety = Math.floor(endPt.y / 10);

  if (!grid.walkable(etx, ety)) {
    return {
      passed: false,
      diag: `snapped goal endpoint (${endPt.x}, ${endPt.y}) tile (${etx}, ${ety}) is not walkable`,
    };
  }

  if (etx === 7 && ety === 7) {
    return {
      passed: false,
      diag: 'route ended at blocked tile (7, 7) instead of snapping to a legal neighbor',
    };
  }

  if (Math.abs(etx - 7) > 3 || Math.abs(ety - 7) > 3) {
    return {
      passed: false,
      diag: `snapped tile (${etx}, ${ety}) is outside snap radius (r <= 3) of target (7, 7)`,
    };
  }

  return {
    passed: true,
    diag: `blocked goal (7, 7) correctly snapped to legal endpoint (${etx}, ${ety})`,
  };
}

function testNoCornerCutting(NavGrid) {
  const grid = new NavGrid(8, 8, 10);
  grid.solid[grid.hIdx(2, 1)] = 1;
  grid.solid[grid.hIdx(1, 2)] = 1;

  if (grid.walkable(2, 1) || grid.walkable(1, 2)) {
    return { passed: false, diag: 'precondition failed: orthogonal tiles (2, 1) and (1, 2) must be solid' };
  }

  const sx = 15, sy = 15;
  const gx = 25, gy = 25;
  const route = grid.findPath(sx, sy, gx, gy);

  if (route === null) {
    return {
      passed: false,
      diag: 'findPath returned null; expected route navigating around solid corner (2,1)/(1,2)',
    };
  }

  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const t1x = Math.floor(p1.x / 10), t1y = Math.floor(p1.y / 10);
    const t2x = Math.floor(p2.x / 10), t2y = Math.floor(p2.y / 10);

    const isCutForward = (t1x === 1 && t1y === 1 && t2x === 2 && t2y === 2);
    const isCutBackward = (t1x === 2 && t1y === 2 && t2x === 1 && t2y === 1);

    if (isCutForward || isCutBackward) {
      return {
        passed: false,
        diag: `illegal corner cut detected directly between (${t1x}, ${t1y}) and (${t2x}, ${t2y})`,
      };
    }
  }

  const allWalkable = route.every(p => grid.walkable(Math.floor(p.x / 10), Math.floor(p.y / 10)));
  if (!allWalkable) {
    return { passed: false, diag: 'route contains non-walkable tile waypoints' };
  }

  return { passed: true, diag: `route of ${route.length} waypoints successfully avoids solid corner cut` };
}

function testValleyGapDetour(NavGrid) {
  const grid = new NavGrid(8, 8, 10);
  for (let y = 0; y < 8; y++) {
    if (y !== 3) {
      grid.solid[grid.hIdx(4, y)] = 1;
    }
  }

  if (!grid.walkable(4, 3) || grid.walkable(4, 2) || grid.walkable(4, 4)) {
    return { passed: false, diag: 'precondition failed: wall must be solid along x=4 except valley gap at y=3' };
  }

  const sx = 15, sy = 15;
  const gx = 65, gy = 65;
  const route = grid.findPath(sx, sy, gx, gy);

  if (route === null) {
    return {
      passed: false,
      diag: 'findPath returned null; expected detour route navigating through valley gap at (4, 3)',
    };
  }

  const passesThroughGap = route.some(p => Math.floor(p.x / 10) === 4 && Math.floor(p.y / 10) === 3);
  if (!passesThroughGap) {
    return {
      passed: false,
      diag: 'route crossed from west to east without passing through valley gap at tile (4, 3)',
    };
  }

  const allWalkable = route.every(p => grid.walkable(Math.floor(p.x / 10), Math.floor(p.y / 10)));
  if (!allWalkable) {
    return { passed: false, diag: 'detour route contains non-walkable waypoints' };
  }

  return { passed: true, diag: 'route correctly navigated through valley gap at tile (4, 3)' };
}

async function main() {
  const modulePath = pathToFileURL(path.resolve(__dirname, '../src2/engine/pathfinding.js')).href;
  const { NavGrid } = await import(modulePath);

  if (typeof NavGrid !== 'function') {
    throw new Error('NavGrid constructor missing from export');
  }
  if (typeof NavGrid.prototype.findPath !== 'function') {
    throw new Error('NavGrid.prototype.findPath interface missing');
  }
  if (typeof NavGrid.prototype.walkable !== 'function') {
    throw new Error('NavGrid.prototype.walkable interface missing');
  }
  if (typeof NavGrid.prototype.lineClear !== 'function') {
    throw new Error('NavGrid.prototype.lineClear interface missing');
  }

  const cases = [
    { id: 'OPEN_ROUTE_RECONSTRUCTION', run: testOpenRouteReconstruction },
    { id: 'BLOCKED_GOAL_SNAP', run: testBlockedGoalSnap },
    { id: 'NO_CORNER_CUTTING', run: testNoCornerCutting },
    { id: 'VALLEY_GAP_DETOUR', run: testValleyGapDetour },
  ];

  const results = [];
  for (const c of cases) {
    const res = c.run(NavGrid);
    results.push({ id: c.id, ...res });
    const statusStr = res.passed ? 'PASS' : 'FAIL';
    console.log(`${statusStr} ${c.id}: ${res.diag}`);
  }

  const openRouteRes = results.find(r => r.id === 'OPEN_ROUTE_RECONSTRUCTION');
  const allPassed = results.every(r => r.passed);

  if (allPassed) {
    console.log('ALL 4 PATHFINDING CASES PASSED');
    process.exit(0);
  }

  if (openRouteRes.passed) {
    console.error('FAIL: UNEXPECTED PASS - OPEN_ROUTE_RECONSTRUCTION passed on current HEAD (expected-red state required by DONE-WHEN)');
    process.exit(2);
  }

  console.log('GATE-P0.002 EXPECTED-RED');
  process.exit(1);
}

main().catch(err => {
  console.error('Harness error:', err);
  process.exit(1);
});
