// P1.023 — Integer world coordinates at 1/256 tile precision.
// Pure fixed-point movement kernel: positions are stored as exact integers
// (Q8 subpixels = 1/256 px, i.e. 1/4096 tile). No Phaser, no DOM, no
// Math.random, no Math.sqrt.
// Determinism contract: identical script input => identical state hash on any
// engine running identical source. Cross-engine evidence in the P1.023 gate =
// independent child processes (default V8 vs --jitless V8: two genuinely
// different arithmetic pipelines of the same CPU) plus the in-process run.
// Two-machine proof is deferred to P1.049 (two-machine replay-hash runner)
// by PLAN dependency; the kernel's integer-only contract is what makes that
// deferral safe.
'use strict';

const FP_SCALE = 256; // storage: 1/256 px (tile = 16 px => 4096 units/tile)
const R_Q8 = 1024; // unit footprint probe radius: 4 px in Q8

// Encode float px -> exact Q8 integer.
function enc(px) { return Math.round(px * FP_SCALE); }
// Decode Q8 -> float px. Exact (power-of-two scale => lossless shift).
function dec(q8) { return q8 / FP_SCALE; }

// 4-corner footprint test against a row-major solid bitmap. Kernel-local
// truth predicate (no import of renderer-side NavGrid keeps the kernel pure;
// NavGrid/kernel agreement is gated separately by the routing suite).
function footprintIllegal(world, xq8, yq8) {
  const ts = enc(world.tileSize);
  const w = world.w, h = world.h;
  for (const [dx, dy] of [[-R_Q8, -R_Q8], [R_Q8, -R_Q8], [-R_Q8, R_Q8], [R_Q8, R_Q8]]) {
    const cx = Math.floor((xq8 + dx) / ts);
    const cy = Math.floor((yq8 + dy) / ts);
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return true;
    if (world.solid[cy * w + cx]) return true;
  }
  return false;
}

// Center-in-solid probe (violation audit — distinct from footprint probe).
function centerSolid(world, xq8, yq8) {
  const ts = enc(world.tileSize);
  const cx = Math.floor(xq8 / ts);
  const cy = Math.floor(yq8 / ts);
  if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) return true;
  return !!world.solid[cy * world.w + cx];
}

// Segment audit: fixed-count sampling (integer-derived count, therefore
// engine-invariant) with a footprint test per sample. Fast units cannot
// tunnel between samples: max sample gap 8 px < 16 px tile.
function segIllegal(world, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
  const SAMPLE = 2048; // 8 px in Q8
  const steps = Math.max(1, Math.ceil((adx + ady) / SAMPLE));
  for (let s = 1; s <= steps; s++) {
    const x = x0 + Math.trunc((dx * s) / steps);
    const y = y0 + Math.trunc((dy * s) / steps);
    if (footprintIllegal(world, x, y)) return true;
  }
  return footprintIllegal(world, x1, y1);
}

function makeWorld({ w, h, tileSize = 16, solid }) {
  if (!solid) solid = new Uint8Array(w * h);
  else if (!(solid instanceof Uint8Array)) solid = Uint8Array.from(solid);
  if (solid.length !== w * h) throw new Error(`solid length ${solid.length} !== w*h ${w * h}`);
  return { w, h, tileSize, solid, units: [], tick: 0 };
}

// Add a unit. path points are float px waypoints, quantized ONCE here;
// the kernel never stores float positions.
function addUnit(world, spec) {
  const u = {
    id: world.units.length,
    kind: spec.kind || 'u',
    x: enc(spec.x), y: enc(spec.y),
    vx: Math.round((spec.vx || 0) * FP_SCALE), // px/tick -> Q8 (one-time)
    vy: Math.round((spec.vy || 0) * FP_SCALE),
    path: (spec.path || []).map(p => [enc(p[0]), enc(p[1])]),
    pathIndex: 0,
    state: (spec.path && spec.path.length) ? 'move' : 'idle',
    illegal: 0, illegalTick: -1
  };
  world.units.push(u);
  return u;
}

// One tick for one unit. Velocity caps are Q8 px/tick (same unit as
// positions — no cross-scale comparisons anywhere). Per-axis integer step
// clamped to remaining distance; arrival snaps exactly to the waypoint
// (both axes clamped => squared distance <= squared cap, so convergence is
// guaranteed with no oscillation). A step whose footprint is illegal ends
// the order as 'blocked' at the current position — a blocked unit never
// tunnels and there is no straight-line fallback (matches the project
// movement contract).
function stepUnit(world, u) {
  if (u.state !== 'move') return;
  const capX = Math.abs(u.vx), capY = Math.abs(u.vy);
  const cap2 = capX * capX + capY * capY;
  for (;;) {
    if (u.pathIndex >= u.path.length) { u.state = 'idle'; return; }
    const [gx, gy] = u.path[u.pathIndex];
    const dx = gx - u.x, dy = gy - u.y;
    const adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
    if (adx * adx + ady * ady <= cap2) {
      u.x = gx; u.y = gy; // exact snap onto the waypoint
      u.pathIndex++;
      continue;
    }
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let nx = u.x + sx * Math.min(capX, adx);
    let ny = u.y + sy * Math.min(capY, ady);
    if (footprintIllegal(world, nx, ny)) {
      // Deterministic axis-priority slide: a single-axis alternative counts
      // only if it actually moves that axis (a zero-length alternative is
      // the current position, not an escape). Blocked is an order state,
      // not a violation — the unit never entered solid ground here.
      const mX = nx !== u.x, mY = ny !== u.y;
      if (mX && !footprintIllegal(world, nx, u.y)) {
        ny = u.y;
      } else if (mY && !footprintIllegal(world, u.x, ny)) {
        nx = u.x;
      } else {
        u.state = 'blocked';
        return;
      }
    }
    if (centerSolid(world, u.x, u.y) && !u.illegal) { u.illegal = 1; u.illegalTick = world.tick; }
    u.x = nx; u.y = ny;
    return;
  }
}

function tick(world) {
  world.tick++;
  for (const u of world.units) stepUnit(world, u);
  return world;
}

// Canonical snapshot: decimal integer text only; two engines agreeing on
// integer state produce byte-identical output.
function snapshot(world) {
  const rows = world.units.map(u => `${u.id},${u.kind},${u.x},${u.y},${u.state},${u.pathIndex},${u.illegal}`);
  return `t${world.tick}|${rows.join(';')}`;
}

function hashSnapshot(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// --- Deterministic test fixtures ------------------------------------------
// (owned by the P1.023 gate; scenario = pure scripted kinematics)

// S1 open 100x100: four units, long fractional walks for hash + drift tests.
function buildScenarioUnits() {
  return [
    // A: bouncing zig, repeating-fraction coordinates throughout
    { kind: 'mar', x: 32.5, y: 48.25, vx: 0.55, vy: 0.31, path: [[464.5, 120.5], [896.75, 220.25], [600.125, 96.125], [1400.6667, 340.3333], [900.5, 700.75], [300.25, 500.5], [50.75, 900.125], [700.3333, 1200.6667]] },
    // B: fine spiral of 1/3-precision waypoints
    { kind: 'drk', x: 180.125, y: 1180.9375, vx: 0.4, vy: -0.22, path: [[211.3333, 1135.6667], [242.6667, 1091.3333], [274, 1046], [305.3333, 1001.6667], [336.6667, 957.3333], [368, 912], [399.3333, 867.6667], [430.6667, 823.3333], [462, 778], [493.3333, 733.6667]] },
    // C: long diagonal sweeps
    { kind: 'zrg', x: 600, y: 200, vx: 0.62, vy: 0.18, path: [[1500.5, 480.25], [200.125, 900.875], [1300.5, 1400.25]] },
    // D: dense fractional chain (drift amplifier)
    { kind: 'sie', x: 1000.5, y: 1000.5, vx: 0.75, vy: -0.45, path: [[968.25, 970.75], [936, 941], [903.75, 911.25], [871.5, 881.5], [839.25, 851.75], [807, 822], [774.75, 792.25], [742.5, 762.5], [710.25, 732.75], [678, 703], [645.75, 673.25], [613.5, 643.5]] }
  ];
}

function buildOpenWorld(mkWorld) {
  return mkWorld({ w: 100, h: 100 });
}

// S2 wall fixture: horizontal wall at row 21, x 5..34, single gap at x=25.
// Two fast (2.5 px/tick) wall-crossers: one crosses the SOLID line at x=20
// (must be blocked + zero tunneling), one threads exactly through the GAP
// column x=25 and continues (must complete: legal-path control).
function buildWallWorld(mkWorld) {
  const W = 80;
  const solid = new Uint8Array(80 * W);
  for (let x = 5; x <= 34; x++) if (x !== 25) solid[21 * W + x] = 1;
  return mkWorld({ w: 80, h: 80, solid });
}

function buildWallUnits() {
  return [
    // W1: straight line through the SOLID wall (center line y=337.5 is
    // inside row 21 from x=80): must end 'blocked', zero solid entry.
    { kind: 'vmp', x: 60.5, y: 337.5, vx: 2.5, vy: 0, path: [[140, 337.5], [560, 337.5]] },
    // W2: legal-path control — starts inside the gap column x=25 (only
    // wall-row cell left open, index 21*80+25=1705), walks straight DOWN
    // the gap (footprint corners stay inside the open column), clears the
    // wall row at y=356, then exits right/below. Must complete to idle:
    // proves blocked is not a default and legal paths finish at real
    // (non-teleport) speed.
    { kind: 'sie', x: 408, y: 344, vx: 2.5, vy: 2.5, path: [[408, 356], [420, 360], [560.25, 400.25]] }
  ];
}

// 20,000-tick scripted run for cross-process/cross-engine hash comparison.
function runScenario(runner) {
  const world = buildOpenWorld(runner.makeWorld);
  for (const spec of buildScenarioUnits()) runner.addUnit(world, spec);
  for (let t = 0; t < 20000; t++) runner.tick(world);
  return world;
}

const SimInt = { FP_SCALE, R_Q8, enc, dec, footprintIllegal, centerSolid, segIllegal, makeWorld, addUnit, stepUnit, tick, snapshot, hashSnapshot, buildOpenWorld, buildScenarioUnits, buildWallWorld, buildWallUnits, runScenario };
export { SimInt };
export default SimInt;
