// P1.032-i1 — Pure terrain/nav state generation for SCC (PURE: no Phaser, no DOM, no canvas).
// buildMapState(seed, W, H) returns the deterministic map state:
//   elev/ramp plateaus, seeded rock clusters + destructible flags, mountain
//   ridges (mid wall, ridge fingers, knolls), valley carve, HQ-connectivity
//   carve, ramp carve, valley rock cleanup.
//
// Determinism contract: identical output for identical (seed, W, H) on any
// engine (verified default-V8 vs --jitless in scripts/verify-terrain-golden.cjs).
// This replaces the pre-P1.032 world where terrain came from a fresh
// LCG(1234567) per call — the map NEVER varied with matchSeed. Now the map
// IS a function of matchSeed (one derived SimRng, fixed draw recipe).
//
// Stream recipe (state draws only — presentation must NOT consume it):
//   per cluster spot (5): 1 size draw + per attempt 2 cell draws
//   -> 1 flag draw per rock tile (destructible)
//   -> 14 knolls x 3 draws -> 1 corridor draw per carve iteration (cap 40).
// Scene keeps a SEPARATE presentation stream for blob/speckle/spatter/deco
// painting and sprite key/flip picks (render-rate coupled, hash-invisible).
//
// Verbatim-port invariants (pinned by the golden gate, do not "fix"):
// - destructibles are flagged BEFORE valley rock cleanup; rockTiles may lose
//   cells while destructibles keeps referencing them (runtime reads both).
// - mountains array may contain duplicate cells (ridges overlap); stamping
//   and paint dedupe via seenCells/Set, so duplicates are state-harmless.
// - flood/connectivity check runs over MOUNTAIN solidity only (matching the
//   live order: buildMountains before blockTerrain adds borders/elev edges).
'use strict';

import { SimRng } from './simRng.js';

// ---- rock clusters (verbatim port of buildTerrain placeCluster) ----
function genRocks(rng, W, H) {
  const clusters = [];
  const rockTiles = [];
  const spots = [
    [W * 0.35, H * 0.3], [W * 0.6, H * 0.7], [W * 0.5, H * 0.5],
    [W * 0.7, H * 0.25], [W * 0.28, H * 0.72],
  ];
  for (const [sx, sy] of spots) {
    const cx = sx | 0, cy = sy | 0;
    const size = 14 + rng.int(10);
    const kept = [];
    for (let i = 0; i < size; i++) {
      const tx = cx + rng.int(6) - 3;
      const ty = cy + rng.int(6) - 3;
      if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) continue;
      kept.push({ tx, ty });
    }
    clusters.push(kept);
    rockTiles.push(...kept);
  }
  return { clusters, rockTiles };
}

// ---- high ground: two plateaus + mid plateau, SW-face ramps (no rng) ----
function genHighGround(W, H) {
  const elev = new Uint8Array(W * H);
  const ramp = new Uint8Array(W * H);
  const plateau = (cx0, cy0, rw, rh) => {
    const cx = Math.round(cx0), cy = Math.round(cy0);
    for (let ty = cy - rh; ty <= cy + rh; ty++) for (let tx = cx - rw; tx <= cx + rw; tx++) {
      if (tx < 2 || ty < 2 || tx >= W - 2 || ty >= H - 2) continue;
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > rw + rh) continue;
      elev[ty * W + tx] = 1;
    }
    for (let k = 0; k < 3; k++) {
      const rx = cx - rw + k, ry = cy + rh;
      ramp[ry * W + rx] = 1;
    }
  };
  plateau(W * 0.5, H * 0.2, 6, 3);
  plateau(W * 0.5, H * 0.8, 6, 3);
  plateau(W * 0.24, H * 0.5, 4, 3);
  return { elev, ramp };
}

// ---- mountain ridges + corridors (verbatim port of buildMountains) ----
function genRidges(rng, W, H, elev, ramp, rockTilesIn) {
  const ridges = [];
  const allValleys = [];
  // 1) mid-map diagonal wall, broken into three passes
  const wall = [];
  for (let ty = 6; ty < H - 6; ty++) {
    const cx = Math.round(W * 0.5 + Math.sin(ty * 0.09 + 1.7) * 11);
    const c2 = cx + 12 + Math.round(Math.sin(ty * 0.13) * 4);
    if (ty > H * 0.42 && ty < H * 0.58) {
      for (let w = -2; w <= 2; w++) allValleys.push([cx + w, ty]);
      for (let w = -1; w <= 1; w++) allValleys.push([c2 + w, ty]);
      continue;
    }
    if (ty >= 44 && ty <= 52) {
      for (let w = -2; w <= 2; w++) allValleys.push([cx + w, ty]);
      for (let w = -1; w <= 1; w++) allValleys.push([c2 + w, ty]);
      continue; // north pass corridor
    }
    if (ty >= 110 && ty <= 118) {
      for (let w = -2; w <= 2; w++) allValleys.push([cx + w, ty]);
      for (let w = -1; w <= 1; w++) allValleys.push([c2 + w, ty]);
      continue; // south pass corridor (third band — verbatim)
    }
    for (let w = -2; w <= 2; w++) wall.push([cx + w, ty]);
    for (let w = -1; w <= 1; w++) wall.push([c2 + w, ty]);
  }
  ridges.push(wall);
  // 2) two horizontal ridge fingers per side, leaving two lanes each
  for (const side of [0, 1]) {
    for (const fy of side ? [0.30, 0.72] : [0.22, 0.64]) {
      const finger = [];
      const lanes = side ? [0.55, 0.85] : [0.12, 0.42];
      for (let tx = Math.round(side ? W * 0.58 : W * 0.08); tx < (side ? W - 6 : W * 0.46); tx++) {
        const ty = Math.round(H * fy + Math.sin(tx * 0.11 + fy * 9) * 5);
        if (lanes.some(L => tx > W * L - 4 && tx < W * L + 4)) continue;
        for (let h = -1; h <= 1; h++) finger.push([tx, ty + h]);
      }
      ridges.push(finger);
    }
  }
  // 3) scattered knolls through open center (seeded: 3 draws each)
  const knolls = [];
  for (let k = 0; k < 14; k++) {
    const kx = 14 + rng.int(W - 28);
    const ky = 14 + rng.int(H - 28);
    const kr = 2 + rng.int(3);
    for (let dy = -kr; dy <= kr; dy++) for (let dx = -kr; dx <= kr; dx++) {
      if (dx * dx + dy * dy > kr * kr) continue;
      knolls.push([kx + dx, ky + dy]);
    }
  }
  ridges.push(knolls);

  const valleyKeySet = new Set();
  const valleys = [];
  for (const [vx, vy] of allValleys) {
    const k = `${vx},${vy}`;
    if (!valleyKeySet.has(k)) { valleyKeySet.add(k); valleys.push([vx, vy]); }
  }

  const hqClear = [
    { x: Math.floor(W * 0.12), y: Math.floor(H * 0.12), r: 12 },
    { x: Math.floor(W * 0.88), y: Math.floor(H * 0.88), r: 12 },
  ];
  const inHqClear = (tx, ty) => hqClear.some(h => Math.abs(tx - h.x) <= h.r && Math.abs(ty - h.y) <= h.r);
  const valleySet = new Set(valleys.map(([vx, vy]) => `${vx},${vy}`));

  const solid = new Uint8Array(W * H);
  let mountains = [];
  for (const ridge of ridges) {
    for (const [tx, ty] of ridge) {
      if (tx < 3 || ty < 3 || tx >= W - 3 || ty >= H - 3) continue;
      if (inHqClear(tx, ty) || valleySet.has(`${tx},${ty}`)) continue;
      // P1.032-i1 ramp-connectivity invariant: mountains never stamp inside
      // authored high ground. Pre-fix, the mid wall + knolls sealed interior
      // pockets of plateau 1 (dead 3-wide wedge; verified in ASCII probe).
      // Elev cliff rule (NavGrid.elevBlockedPair) still gates hills to ramps
      // only, so opening the mountain layer on the hilltop adds no shortcut.
      if (elev[ty * W + tx]) continue;
      solid[ty * W + tx] = 1;
      mountains.push([tx, ty]);
    }
  }

  // connectivity flood from HQ A; carve passes until HQ B region reachable.
  // NOTE (verbatim): flood sees MOUNTAIN solidity only — borders/elev edges
  // arrive later via blockTerrain, same as the live scene order.
  const pass = () => {
    const seen = new Uint8Array(W * H);
    const q = [hqClear[0].x + hqClear[0].y * W];
    seen[q[0]] = 1;
    let touchedB = false;
    while (q.length) {
      const i = q.pop();
      const x = i % W, y = (i / W) | 0;
      if (Math.abs(x - hqClear[1].x) <= 6 && Math.abs(y - hqClear[1].y) <= 6) { touchedB = true; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const ni = nx + ny * W;
        if (seen[ni] || solid[ni]) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    return touchedB;
  };

  const corridors = [];
  let carveGuard = 0;
  while (!pass() && carveGuard++ < 40) {
    // P1.025→P1.032: corridor draw now comes from the matchSeed stream.
    const midY = Math.round(H * (0.15 + rng.u01() * 0.7));
    for (let tx = Math.floor(W * 0.15); tx <= Math.ceil(W * 0.85); tx++) {
      const ty = midY + Math.round(Math.sin(tx * 0.35 + carveGuard) * 2);
      solid[ty * W + tx] = 0;
      solid[(ty + 1) * W + tx] = 0;
      corridors.push([tx, ty], [tx, ty + 1]);
      mountains = mountains.filter(([mx, my]) => !(mx === tx && (my === ty || my === ty + 1)));
    }
  }

  // clear mountain overlap with authored ramp cells
  let rockTiles = rockTilesIn;
  const rampCarved = [];
  mountains = mountains.filter(([mx, my]) => {
    if (ramp[my * W + mx]) {
      solid[my * W + mx] = 0;
      rampCarved.push([mx, my]);
      return false;
    }
    return true;
  });
  corridors.push(...rampCarved);

  // clear rock blockers from valley cells (destructibles intentionally NOT
  // refiltered here — verbatim quirk: runtime reads both lists)
  if (rockTiles.length && valleys.length) {
    const removed = rockTiles.filter(r => valleySet.has(`${r.tx},${r.ty}`));
    if (removed.length) rockTiles = rockTiles.filter(r => !valleySet.has(`${r.tx},${r.ty}`));
  }

  return { mountains, valleys, corridors, rockTiles };
}

// ---- full map build (fixed recipe order = fixed stream) ----
function buildMapState(seed, W, H) {
  const rng = new SimRng(seed >>> 0);
  const { clusters, rockTiles } = genRocks(rng, W, H);
  // destructibles: 1 draw per rock tile BEFORE any cleanup
  const destructibles = [];
  for (const r of rockTiles) {
    const hit = rng.u01() < 0.45;
    if (hit && r.tx > 8 && r.ty > 8 && r.tx < W - 8 && r.ty < H - 8) {
      r.hp = 300; r.destructible = true;
      destructibles.push(r);
    }
  }
  const { elev, ramp } = genHighGround(W, H);
  const rid = genRidges(rng, W, H, elev, ramp, rockTiles);
  return {
    elev, ramp,
    rockClusters: clusters,
    rockTiles: rid.rockTiles,
    destructibles, // NOT refiltered after valley cleanup (verbatim quirk: runtime reads both lists)
    mountains: rid.mountains,
    valleys: rid.valleys,
    connectivityCorridors: rid.corridors,
  };
}

// ---- solid/blocked bake for headless gates (mirrors buildMountains stamp +
// blockTerrain): returns the FINAL walk-blocking layers. The scene writes the
// same layers into nav; the golden gate asserts connectivity on THIS bake.
function bakeLayers(map, W, H) {
  const solid = new Uint8Array(W * H);
  const blocked = new Uint8Array(W * H); // blockedBy -2 (rocks)
  for (const [tx, ty] of map.mountains) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    solid[ty * W + tx] = 1;
  }
  for (const r of map.rockTiles) {
    const i = r.ty * W + r.tx;
    if (i < 0 || i >= W * H) continue;
    if (!solid[i]) blocked[i] = 1;
  }
  for (let t = 0; t < W; t++) { solid[t] = 1; solid[(H - 1) * W + t] = 1; }
  for (let ty = 0; ty < H; ty++) { solid[ty * W] = 1; solid[ty * W + W - 1] = 1; }
  if (map.elev && map.ramp) {
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const i = ty * W + tx;
      if (map.elev[i] && !map.ramp[i]) {
        const isEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
          return map.elev[ny * W + nx] !== map.elev[i];
        });
        if (isEdge) solid[i] = 1;
      }
    }
    for (let i = 0; i < map.ramp.length; i++) if (map.ramp[i]) solid[i] = 0;
  }
  return { solid, blocked };
}

const SimTerrain = { buildMapState, bakeLayers };
export { SimTerrain, buildMapState, bakeLayers };
export default SimTerrain;
