// Grid pathfinding for SCC2 — A* with octile heuristic, clearance inflation,
// waypoint smoothing. Throttled callers (units request paths on command +
// re-path timers), never per-frame per-unit.

export class NavGrid {
  constructor(w, h, tileSize) {
    this.w = w;
    this.h = h;
    this.tileSize = tileSize;
    // occupancy per tile: 0 free, >0 blocked. Clearance counts stored separately.
    this.blocked = new Uint8Array(w * h);
    this.blockedBy = new Int32Array(w * h).fill(-1); // entity id owning block
    this.solid = new Uint8Array(w * h); // terrain cliffs
  }

  idx(tx, ty) { return ty * this.w + tx; }

  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }

  blockRect(id, x0, y0, x1, y1) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const i = this.idx(tx, ty);
        this.blocked[i] = 1;
        this.blockedBy[i] = id;
      }
    }
  }

  unblockBy(id) {
    for (let i = 0; i < this.blockedBy.length; i++) {
      if (this.blockedBy[i] === id) {
        this.blocked[i] = 0;
        this.blockedBy[i] = -1;
      }
    }
  }

  walkable(tx, ty, clearance = 0, ignoreId = -1) {
    for (let dy = -clearance; dy <= clearance; dy++) {
      for (let dx = -clearance; dx <= clearance; dx++) {
        const x = tx + dx, y = ty + dy;
        if (!this.inBounds(x, y)) return false;
        const i = this.idx(x, y);
        if (this.solid[i]) return false;
        if (this.blocked[i] && this.blockedBy[i] !== ignoreId) return false;
      }
    }
    return true;
  }

  // A* over tile centers. Returns array of world positions [{x,y}...] or null.
  findPath(startX, startY, goalX, goalY, clearance = 0, ignoreId = -1, maxNodes = 9000) {
    const ts = this.tileSize;
    const sx = Math.floor(startX / ts), sy = Math.floor(startY / ts);
    let gx = Math.floor(goalX / ts), gy = Math.floor(goalY / ts);
    if (!this.inBounds(gx, gy)) return null;

    // If goal blocked, snap to nearest free tile near goal (so units "attack move approach").
    if (!this.walkable(gx, gy, clearance, ignoreId)) {
      let found = false;
      for (let r = 1; r <= 3 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            const nx = gx + dx, ny = gy + dy;
            if (this.inBounds(nx, ny) && this.walkable(nx, ny, clearance, ignoreId)) {
              gx = nx; gy = ny; found = true;
            }
          }
        }
      }
      if (!found) return null;
    }
    // allow escape from a blocked start tile (unit standing on harvest block)
    if (this.solid[this.hIdx(sx, sy)]) return null;

    const w = this.w;
    const gScore = new Map();
    const cameFrom = new Map();
    const open = [[this.hIdx(sx, sy), 0]];
    const closed = new Set();
    const goal = this.hIdx(gx, gy);
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    gScore.set(this.hIdx(sx, sy), 0);

    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let nodes = 0;
    while (open.length && nodes < maxNodes) {
      nodes++;
      // pop lowest f (small maps: linear scan ok at our scale with throttling)
      let bi = 0, bf = Infinity;
      for (let i = 0; i < open.length; i++) { if (open[i][1] < bf) { bf = open[i][1]; bi = i; } }
      const [cur, f] = open.splice(bi, 1);
      const cx = cur % w, cy = (cur / w) | 0;
      if (cur === goal) {
        const path = [];
        let c = cur;
        while (c !== undefined) {
          const px = (c % w), py = (c / w) | 0;
          path.push({ x: (px + 0.5) * ts, y: (py + 0.5) * ts });
          c = cameFrom.get(c);
          if (c === cur) break;
        }
        path.reverse();
        return this.smooth(path, clearance, ignoreId);
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cg = gScore.get(cur) ?? Infinity;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (!this.walkable(nx, ny, clearance, ignoreId)) continue;
        // no corner cutting
        if (dx !== 0 && dy !== 0) {
          if (!this.walkable(cx + dx, cy, clearance, ignoreId) || !this.walkable(cx, cy + dy, clearance, ignoreId)) continue;
        }
        const nIdx = this.hIdx(nx, ny);
        const ng = cg + cost;
        if (ng < (gScore.get(nIdx) ?? Infinity)) {
          gScore.set(nIdx, ng);
          cameFrom.set(nIdx, cur);
          open.push([nIdx, ng + h(nx, ny)]);
        }
      }
    }
    return null;
  }

  hIdx(x, y) { return y * this.w + x; }

  // string-pull waypoints
  smooth(path, clearance, ignoreId) {
    if (path.length <= 2) return path;
    const out = [path[0]];
    let anchor = 0;
    for (let i = 2; i < path.length; i++) {
      if (!this.lineClear(path[anchor].x, path[anchor].y, path[i].x, path[i].y, clearance, ignoreId)) {
        out.push(path[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(path[path.length - 1]);
    return out;
  }

  lineClear(x0, y0, x1, y1, clearance, ignoreId) {
    const ts = this.tileSize;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (ts * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (!this.walkable(Math.floor(x / ts), Math.floor(y / ts), clearance, ignoreId)) return false;
    }
    return true;
  }
}
