// Flow-field pathfinding (SC1-style integrator fields) for SCC2.
// One BFS distance field per goal per tick-cohort (not per unit), then units
// descend the gradient. Massive armies share one field.
import { TILE } from '../data/sc1.js';

export class FlowField {
  constructor(nav, w, h) {
    this.nav = nav;
    this.w = w; this.h = h;
    this.dist = new Float32Array(w * h);
    this.dir = new Int8Array(w * h * 2); // dx,dy per tile in -1..1
    this.goalX = -1; this.goalY = -1;
  }

  // rebuild field toward a goal tile (blocked tiles = INF)
  build(goalX, goalY, ignoreId = -1, maxClearance = 0) {
    const { nav, w, h, dist } = this;
    dist.fill(Infinity);
    const ts = nav.tileSize;
    let gx = Math.floor(goalX / ts), gy = Math.floor(goalY / ts);
    if (!nav.inBounds(gx, gy)) return false;
    // snap goal to nearest walkable
    if (!nav.walkable(gx, gy, maxClearance, ignoreId)) {
      let found = false;
      for (let r = 1; r <= 4 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            const nx = gx + dx, ny = gy + dy;
            if (nav.inBounds(nx, ny) && nav.walkable(nx, ny, maxClearance, ignoreId)) { gx = nx; gy = ny; found = true; }
          }
        }
      }
      if (!found) return false;
    }
    const SQ2 = Math.SQRT2;
    const queue = [gy * w + gx];
    dist[gy * w + gx] = 0;
    let head = 0;
    const COST = { straight: 1, diag: SQ2 };
    // BFS-like Dijkstra with 8 dirs, corner-cutting blocked
    while (head < queue.length) {
      const cur = queue[head++];
      const cx = cur % w, cy = (cur / w) | 0;
      const cd = dist[cur];
      const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
      for (const [dx, dy, c] of D) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!nav.walkable(nx, ny, maxClearance, ignoreId)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!nav.walkable(cx + dx, cy, maxClearance, ignoreId) || !nav.walkable(cx, cy + dy, maxClearance, ignoreId)) continue;
        }
        const ni = ny * w + nx;
        const nd = cd + c;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          queue.push(ni);
        }
      }
    }
    // derive direction per tile: step toward lowest neighbor
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        const di = dist[i];
        let bx = 0, by = 0, best = di;
        if (!isFinite(di)) { this.dir[i * 2] = 0; this.dir[i * 2 + 1] = 0; continue; }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = tx + dx, ny = ty + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nd = dist[ny * w + nx];
            if (nd < best) { best = nd; bx = dx; by = dy; }
          }
        }
        this.dir[i * 2] = bx; this.dir[i * 2 + 1] = by;
      }
    }
    this.goalX = gx; this.goalY = gy;
    this.valid = true;
    return true;
  }

  // world-space steering vector at (x,y); returns {x,y} normalized or null
  flowAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return null;
    const i = ty * this.w + tx;
    const dx = this.dir[i * 2], dy = this.dir[i * 2 + 1];
    if (!dx && !dy) return null;
    const l = Math.hypot(dx, dy) || 1;
    // steer to tile center for smoother motion
    const cx = (tx + 0.5) * TILE + dx * TILE * 0.4, cy = (ty + 0.5) * TILE + dy * TILE * 0.4;
    const vx = cx - x, vy = cy - y;
    const vl = Math.hypot(vx, vy) || 1;
    return { x: vx / vl, y: vy / vl };
  }

  distAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return Infinity;
    return this.dist[ty * this.w + tx];
  }
}

// Cohort manager: reuse one field per goal key, throttled rebuilds.
export class FlowManager {
  constructor(nav, w, h) {
    this.nav = nav; this.w = w; this.h = h;
    this.fields = new Map(); // key -> {field, goal, lastBuild, ignoreId}
  }

  getField(goalKey, goalX, goalY, clearance = 0) {
    let rec = this.fields.get(goalKey);
    if (!rec) {
      rec = { field: new FlowField(this.nav, this.w, this.h), goalX, goalY, lastBuild: -99 };
      this.fields.set(goalKey, rec);
    }
    return rec;
  }

  // rebuild only if stale (call from scene update loop, gated externally)
  ensure(goalKey, goalX, goalY, gameTime, interval = 0.6, clearance = 0) {
    const rec = this.getField(goalKey, goalX, goalY, clearance);
    if (rec.goalX !== goalX || rec.goalY !== goalY) { rec.goalX = goalX; rec.goalY = goalY; rec.lastBuild = -99; }
    if (gameTime - rec.lastBuild >= interval || !rec.field.valid) {
      rec.field.build(goalX, goalY, -1, clearance);
      rec.lastBuild = gameTime;
    }
    return rec.field;
  }

  invalidateNear(x, y) {
    // cheap: mark all fields stale when buildings change
    for (const rec of this.fields.values()) rec.lastBuild = -99;
  }
}

// Spatial hash for unit separation
export class SpatialHash {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); }
  key(x, y) { return ((x / this.cell) | 0) + ',' + ((y / this.cell) | 0); }
  clear() { this.map.clear(); }
  insert(u) {
    const k = this.key(u.x, u.y);
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(u);
  }
  near(x, y) {
    const out = [];
    const cx = (x / this.cell) | 0, cy = (y / this.cell) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = this.map.get((cx + dx) + ',' + (cy + dy));
      if (a) out.push(...a);
    }
    return out;
  }
}
