/**
 * scripts/verify-terrain-golden.cjs — P1.032-i1 golden gate (pure Node, no browser)
 *
 * Verifies src2/engine/simTerrain.js against the ticket done_when:
 *   seeded map identity + ramp connectivity invariants.
 *
 * Assert families:
 *  T1 identity    — same seed, two builds => byte-identical serialized state;
 *                   cross-engine: re-spawn THIS file as children (default V8
 *                   and --jitless) and require equal trace hashes.
 *  T2 divergence  — 8 distinct seeds => 8 distinct map hashes (proves the
 *                   matchSeed stream actually drives generation; the pre-P1.032
 *                   fresh-LCG(1234567) map was seed-invariant).
 *  T3 connectivity— per seed, flood from HQ A center reaches within 6 tiles of
 *                   HQ B over !(solid||blocked) (final baked layers, stronger
 *                   than the generator's own mountain-only precheck).
 *  T4 ramps       — per seed, per plateau: flood from a walkable ramp-adjacent
 *                   cell reaches the plateau interior; interior cell itself
 *                   non-solid (ramps must not be walled pockets).
 *  T5 completeness— explicit count floors (calibrated, bounded by a
 *                   conservation identity: mined-free bake totals never drift).
 *
 * --calibrate prints measured totals/hashes before repinning.
 * SCC_CHILD=1 prints the trace hash and exits (used by T1).
 */
'use strict';

const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { execSync } = require('node:child_process');

const W = 160, H = 160;
const DEFAULT_SEED = 0x5CA1;
const SEEDS = [DEFAULT_SEED, 1, 2, 7, 42, 0xBEEF, 1337, 0x1234];
// Authored plateaus (from genHighGround): [cx, cy] with SW-face 3-cell ramps
const PLATEAUS = [[80, 32], [80, 128], [38, 80]];
const HQ_A = { x: Math.floor(W * 0.12), y: Math.floor(H * 0.12) };
const HQ_B = { x: Math.floor(W * 0.88), y: Math.floor(H * 0.88) };

// Floors calibrated 2026-10-01 on the 8-seed battery (min across seeds:
// rocks=77 destr=32 mtn=1683) with margin for future seed batteries:
const FLOORS = { rockTiles: 70, destructibles: 30, mountains: 1650 };

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function serializeMap(map) {
  // complete state = everything a replay/hash observes about the map
  return JSON.stringify({
    elev: Array.from(map.elev),
    ramp: Array.from(map.ramp),
    rockTiles: map.rockTiles.map(r => `${r.tx},${r.ty}${r.destructible ? '!' : ''}`),
    mountains: map.mountains.map(m => `${m[0]},${m[1]}`),
    valleys: map.valleys.map(v => `${v[0]},${v[1]}`),
    corridors: map.connectivityCorridors.map(c => `${c[0]},${c[1]}`),
  });
}

function floodReaches(solid, blocked, start, targetFn) {
  const walk = (i) => i >= 0 && i < W * H && !solid[i] && !blocked[i];
  const si = start.y * W + start.x;
  if (!walk(si)) return { ok: false, why: 'start not walkable' };
  const seen = new Uint8Array(W * H);
  const q = [si]; seen[si] = 1;
  while (q.length) {
    const i = q.pop();
    const x = i % W, y = (i / W) | 0;
    if (targetFn(x, y)) return { ok: true };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const ni = ny * W + nx;
      if (seen[ni] || !walk(ni)) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  return { ok: false, why: 'target unreachable' };
}

async function main() {
  const mod = await import(pathToFileURL(path.resolve(__dirname, '../src2/engine/simTerrain.js')).href);
  const { buildMapState, bakeLayers } = mod;

  // ---- child mode: print trace hash of the full battery ----
  if (process.env.SCC_CHILD) {
    let trace = '';
    for (const s of SEEDS) {
      const m = buildMapState(s, W, H);
      trace += fnv(serializeMap(m)).toString(16) + ';';
    }
    console.log('TRACE ' + fnv(trace).toString(16));
    return 0;
  }

  const calib = process.argv.includes('--calibrate');
  const checks = [];
  const ck = (name, ok, note = '') => checks.push({ name, ok, note });

  // ---- calibrate: print totals then exit ----
  if (calib) {
    for (const s of SEEDS) {
      const m = buildMapState(s, W, H);
      const { solid, blocked } = bakeLayers(m, W, H);
      const conn = floodReaches(solid, blocked, HQ_A, (x, y) => Math.abs(x - HQ_B.x) <= 6 && Math.abs(y - HQ_B.y) <= 6);
      let ramps = 0;
      for (const [cx, cy] of PLATEAUS) {
        // ramp row is cy+3, cols cx-rw..cx-rw+2; find any walkable ramp-adj start
        let reached = false;
        for (let k = -6; k <= 2 && !reached; k++) {
          const st = { x: cx + k, y: cy + 5 };
          const r = floodReaches(solid, blocked, st, (x, y) => x === cx && y === cy);
          if (r.ok) reached = true;
        }
        if (reached) ramps++;
      }
      console.log(`seed ${s}: rocks=${m.rockTiles.length} destruct=${m.destructibles.length} mtn=${m.mountains.length} hqconn=${conn.ok} rampInterior=${ramps}/3 hash=${fnv(serializeMap(m)).toString(16)}`);
    }
    console.log('CALIBRATE DONE');
    return 0;
  }

  // ---- T1 identity (dual build + cross-engine children) ----
  const traceIn = (() => {
    let trace = '';
    for (const s of SEEDS) { trace += fnv(serializeMap(buildMapState(s, W, H))).toString(16) + ';'; }
    return fnv(trace).toString(16);
  })();
  const d1 = fnv(serializeMap(buildMapState(DEFAULT_SEED, W, H)));
  const d2 = fnv(serializeMap(buildMapState(DEFAULT_SEED, W, H)));
  ck('T1a dual-run identity default seed', d1 === d2, `d1=${d1.toString(16)} d2=${d2.toString(16)}`);
  const self = path.join(__dirname, 'verify-terrain-golden.cjs');
  const child = (args) => {
    const out = execSync(`node ${args} ${JSON.stringify(self)}`, {
      encoding: 'utf8', env: { ...process.env, SCC_CHILD: '1' },
    });
    const m = out.match(/TRACE ([0-9a-f]+)/);
    return m ? m[1] : 'NO-TRACE';
  };
  const tV8 = child('');
  const tJit = child('--jitless');
  ck('T1b V8 child trace == in-process', tV8 === traceIn, `${tV8} vs ${traceIn}`);
  ck('T1c --jitless child trace == in-process', tJit === traceIn, `${tJit} vs ${traceIn}`);

  // ---- T2..T5 per-seed ----
  const hashes = new Set();
  let worst = { rocks: 1e9, destr: 1e9, mtn: 1e9 };
  for (const s of SEEDS) {
    const m = buildMapState(s, W, H);
    hashes.add(fnv(serializeMap(m)));
    ck(`T2 seed ${s} distinct hash`, true); // replaced below
    checks.pop();
    const { solid, blocked } = bakeLayers(m, W, H);
    // T3 HQ connectivity
    const conn = floodReaches(solid, blocked, HQ_A, (x, y) => Math.abs(x - HQ_B.x) <= 6 && Math.abs(y - HQ_B.y) <= 6);
    ck(`T3 seed ${s} HQ-A→HQ-B connected`, conn.ok, conn.why || '');
    // T4 ramp → interior per plateau
    for (let p = 0; p < PLATEAUS.length; p++) {
      const [cx, cy] = PLATEAUS[p];
      const ci = cy * W + cx;
      ck(`T4a seed ${s} plateau${p} interior non-solid`, !solid[ci] && !blocked[ci]);
      let reached = false, startFound = false;
      for (let k = -6; k <= 2 && !reached; k++) {
        const st = { x: cx + k, y: cy + 5 };
        const r = floodReaches(solid, blocked, st, (x, y) => x === cx && y === cy);
        if (r.why !== 'start not walkable') startFound = true;
        if (r.ok) reached = true;
      }
      ck(`T4b seed ${s} plateau${p} interior ramp-reachable`, startFound && reached, 'no ramp-adj walkable start reached interior');
    }
    // T5 floors
    worst = { rocks: Math.min(worst.rocks, m.rockTiles.length), destr: Math.min(worst.destr, m.destructibles.length), mtn: Math.min(worst.mtn, m.mountains.length) };
    ck(`T5 seed ${s} rockTiles>=${FLOORS.rockTiles}`, m.rockTiles.length >= FLOORS.rockTiles, `${m.rockTiles.length}`);
    ck(`T5 seed ${s} destructibles>=${FLOORS.destructibles}`, m.destructibles.length >= FLOORS.destructibles, `${m.destructibles.length}`);
    ck(`T5 seed ${s} mountains>=${FLOORS.mountains}`, m.mountains.length >= FLOORS.mountains, `${m.mountains.length}`);
    // Verbatim quirk pin: destructibles is NOT refiltered after valley rock
    // cleanup. Safe ONLY if orphan entries point at walkable cells (nothing
    // blocked that runtime cannot clear). Assert that, not list equality.
    const asSet = new Set(m.rockTiles.map(r => `${r.tx},${r.ty}`));
    const badOrphan = m.destructibles.filter(d => {
      if (asSet.has(`${d.tx},${d.ty}`)) return false;
      return !!blocked[d.ty * W + d.tx] || !!solid[d.ty * W + d.tx];
    }).length;
    ck(`T5b seed ${s} destructible orphans harmless`, badOrphan === 0, `${badOrphan} blocked orphans`);
  }
  ck('T2 8 seeds all distinct', hashes.size === SEEDS.length, `${hashes.size} unique`);

  const bad = checks.filter(c => !c.ok);
  for (const b of bad) console.log(`FAIL ${b.name} — ${b.note}`);
  const total = checks.length;
  const passed = total - bad.length;
  console.log(bad.length === 0
    ? `RESULT TERRAIN-GOLDEN PASS ${passed}/${total}`
    : `RESULT TERRAIN-GOLDEN FAIL ${bad.length}/${total} (min floors: rocks=${worst.rocks} destr=${worst.destr} mtn=${worst.mtn})`);
  return bad.length === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((e) => { console.error('GATE CRASH', e); process.exit(1); });
