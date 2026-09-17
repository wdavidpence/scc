// P0.018 — 100 seeded mountain-crossing / valley-routing cases on real NavGrid.
// Oracle: independent BFS over the same solidity grid. Asserts zero solid-cell
// entries on every returned route and >=99% success on reachable pairs.
'use strict';
const path = require('path');

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

(async () => {
  const { NavGrid } = await import(path.resolve(__dirname, '../src2/engine/pathfinding.js'));
  const TILE = 16, W = 64, H = 64;
  let pass = 0, fail = 0; const fails = [];
  const ok = (id, cond, extra='') => { if (cond) pass++; else { fail++; fails.push(`${id}: ${extra}`); } };

  for (let seed = 1; seed <= 100; seed++) {
    const rnd = mulberry32(seed * 7919);
    const grid = new NavGrid(W, H, TILE);
    // carve mountain ridges with single-tile valley gaps (two ridges)
    const solid = Array.from({length: H}, () => new Array(W).fill(false));
    const ridges = [];
    for (let r = 0; r < 2; r++) {
      const x0 = 12 + r * 26 + Math.floor(rnd() * 8);          // near-vertical ridge column
      const gapY = 8 + Math.floor(rnd() * (H - 16));             // the one valley mouth
      ridges.push({ x0, gapY });
      for (let y = 2; y < H - 2; y++) {
        if (Math.abs(y - gapY) <= 0) continue;                   // valley: 1-tile gap
        if (rnd() < 0.06 && Math.abs(y - gapY) > 3) continue;   // scattered holes
        const x = x0 + Math.round(Math.sin(y * 0.35 + r) * 2);   // winding ridge
        if (x < W - 2) { solid[y][x] = true; }
      }
    }
    // stamp solid into NavGrid.solid (engine truth field, row-major)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid[y][x]) grid.solid[y * W + x] = 1;

    // oracle BFS on the ground-truth solid map (no corner cutting)
    const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !solid[y][x];
    const bfsReach = (sx, sy) => {
      const seen = new Set([sx + ',' + sy]); const q = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
          const nx = x+dx, ny = y+dy;
          if (!free(nx, ny)) continue;
          if (dx && dy && (!free(x+dx,y) || !free(x,y+dy))) continue; // no corner cut
          const k = nx+','+ny; if (!seen.has(k)) { seen.add(k); q.push([nx,ny]); }
        }
      }
      return seen;
    };
    const start = { x: 2 + Math.floor(rnd() * 8), y: 2 + Math.floor(rnd() * (H - 4)) };
    const goal  = { x: W - 3 - Math.floor(rnd() * 8), y: 2 + Math.floor(rnd() * (H - 4)) };
    if (!free(start.x, start.y)) start.y = ridges[0].gapY;
    if (!free(goal.x, goal.y)) goal.y = ridges[1] ? ridges[1].gapY : start.y;
    const reach = bfsReach(start.x, start.y);
    const reachable = reach.has(goal.x + ',' + goal.y);
    if (!reachable) continue; // pairs must be reachable; resample next seed

    const gx = Math.floor(goal.x), gy = Math.floor(goal.y);
    const route = grid.findPath(start.x, start.y, gx, gy, 0) || grid.findPath(start.x * TILE + 8, start.y * TILE + 8, gx * TILE + 8, gy * TILE + 8, 0);
    ok(`seed${seed}-route-exists`, Array.isArray(route) && route.length > 0, 'no route despite oracle-reachable');
    if (Array.isArray(route)) {
      let bad = null;
      for (const p of route) {
        const tx = p.x >= W ? Math.floor(p.x / TILE) : p.x;
        const ty = p.y >= H ? Math.floor(p.y / TILE) : p.y;
        if (solid[ty] && solid[ty][tx]) { bad = `${tx},${ty}`; break; }
      }
      ok(`seed${seed}-zero-solid-entry`, !bad, `crossed solid at ${bad}`);
    }
  }
  console.log(`ROUTING-SEEDED pass=${pass} fail=${fail}`);
  if (fails.length) console.error(fails.slice(0, 8).join('\n'));
  process.exit(fail === 0 ? 0 : 1);
})();
