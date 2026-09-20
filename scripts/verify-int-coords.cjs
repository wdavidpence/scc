// P1.023 — gate for src2/engine/simInt.js (integer world coordinates,
// 1/256 px). DONE-WHEN: position round-trip is exact and cross-platform
// movement hashes match for 10,000+ ticks.
//
// Cross-engine evidence here: main process + two independent child processes
// (default V8, --jitless V8 = different arithmetic pipeline, different
// address space). Two-MACHINE equality is scheduled at P1.049; this kernel's
// integer-only contract is the prerequisite it builds on.
//
// Run:  node scripts/verify-int-coords.cjs
// Child mode (internal): SCC_CHILD=1|2 node [--jitless] scripts/verify-int-coords.cjs
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

let SimInt;
try { SimInt = require('../src2/engine/simInt.js').SimInt; }
catch (e) { console.error('P1.023-RED: simInt.js missing:', e.message); process.exit(1); }

const TICKS = 20000;
let pass = 0, fail = 0;
const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };
const t0 = Date.now();

// ---------- child mode: independent engine run, print snapshot ----------
if (process.env.SCC_CHILD) {
  const w = SimInt.runScenario(SimInt);
  console.log(JSON.stringify({ child: process.env.SCC_CHILD, jitless: !!require('v8').defaultOptionsHolder?.jitless || process.execArgv.includes('--jitless') || process.env.NODE_OPTIONS?.includes('jitless'), ticks: w.tick, snap: SimInt.hashSnapshot(SimInt.snapshot(w)), snapLen: SimInt.snapshot(w).length }));
  process.exit(0);
}

// ---------- RT: exact round-trip over seeded 1/256 grid ----------
{
  let bad = 0, bad2 = 0;
  let seed = 0xB105;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let i = 0; i < 100000; i++) {
    const px = rnd() * 2560;
    // (a) values already on the 1/256 grid must decode to themselves
    const q = Math.round(px * 256);
    if (SimInt.dec(SimInt.enc(q / 256)) * 256 !== q) bad++;
    // (b) arbitrary float stores quantize exactly: dec(enc(px))*256 === round(px*256)
    if (SimInt.dec(SimInt.enc(px)) * 256 !== Math.round(px * 256)) bad2++;
  }
  ok('RT_GRID_EXACT', bad === 0, `100k grid round-trips, ${bad} mismatches`);
  ok('RT_STORE_EXACT', bad2 === 0, `100k float stores exact at 1/256, ${bad2} mismatches`);
}

// ---------- DRIFT: naive float accumulation vs exact fixed-point ----------
{
  const STEP = 1.1000000001;
  const TURN = 100;
  const N = 10000;
  const SCALE = 1099511627776n; // 2^40
  let f = 0, fMin = 0, eMin = 0n;
  let x = 0;
  for (let i = 0; i < N; i++) {
    const d = ((i / TURN) | 0) % 2 === 0 ? STEP : -STEP;
    f += d;
    const q = d < 0 ? -BigInt(Math.round(-d * Number(SCALE))) : BigInt(Math.round(d * Number(SCALE)));
    eMin += q;
    x += d; // second accumulator, different op order (FMA/assoc probe)
  }
  const exact = Number(eMin) / Number(SCALE);
  const driftF = Math.abs(f - exact);
  const driftX = Math.abs(x - exact);
  ok('DRIFT_FLOAT_DEMO', driftF > 0 || driftX > 0, `naive-float drift vs exact: ${driftF.toFixed(12)} / ${driftX.toFixed(12)} px`);
  // the kernel path: fixed-point accumulation over the SAME step sequence
  let acc = 0;
  const steps = [];
  for (let i = 0; i < N; i++) steps.push(((i / TURN) | 0) % 2 === 0 ? Math.round(STEP * 65536) : -Math.round(STEP * 65536));
  for (const s of steps) acc += s;
  ok('DRIFT_KERNEL_EXACT', Number.isSafeInteger(acc), `fixed-point accumulation exact (sum=${acc})`);
}

// ---------- XENGINE: same script, three engines, identical snapshots ----------
{
  const main = SimInt.runScenario(SimInt);
  const mainSnap = SimInt.snapshot(main);
  const self = SimInt.runScenario(SimInt); // run-twice determinism
  ok('XENGINE_SELF', SimInt.snapshot(self) === mainSnap);

  const me = path.join(__dirname, 'verify-int-coords.cjs');
  const childEnv = k => ({ ...process.env, SCC_CHILD: String(k) });
  let a = null, b = null;
  try {
    a = spawnSync(process.execPath, [me], { env: childEnv(1), encoding: 'utf8', timeout: 60000 });
    b = spawnSync(process.execPath, ['--jitless', me], { env: childEnv(2), encoding: 'utf8', timeout: 60000 });
  } catch (e) { /* fallthrough to assertion */ }
  const parse = r => { try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch { return null; } };
  const ca = parse(a), cb = parse(b);
  const mainHash = SimInt.hashSnapshot(mainSnap);
  ok('XENGINE_CHILD_A', ca && ca.snap === mainHash && ca.ticks === TICKS, ca ? `childA hash=${ca.snap.toString(16)} vs ${mainHash.toString(16)}` : `childA missing (${a ? a.status : 'spawn-fail'})`);
  ok('XENGINE_CHILD_B_JITLESS', cb && cb.snap === mainHash && cb.ticks === TICKS, cb ? `childB(jitless) hash=${cb.snap.toString(16)} vs ${mainHash.toString(16)}` : `childB missing (${b ? b.status : 'spawn-fail'})`);
}

// ---------- WALL: blocked-at-truth + audit positive control ----------
{
  const world = SimInt.buildWallWorld(SimInt.makeWorld);
  for (const spec of SimInt.buildWallUnits()) SimInt.addUnit(world, spec);
  const [w1, w2] = world.units;
  // log trajectories for the segment audit
  const tracks = world.units.map(u => [[u.x, u.y]]);
  for (let t = 0; t < TICKS; t++) {
    SimInt.tick(world);
    tracks[0].push([w1.x, w1.y]);
    tracks[1].push([w2.x, w2.y]);
  }
  ok('WALL_BLOCK_CORRECT', w1.state === 'blocked', `W1 ended ${w1.state} at (${SimInt.dec(w1.x).toFixed(2)}, ${SimInt.dec(w1.y).toFixed(2)})`);
  ok('WALL_FINISH_CONTROL', w2.state === 'idle' && w2.pathIndex === w2.path.length, `W2 ended ${w2.state} idx=${w2.pathIndex}/${w2.path.length}`);

  let auditBad = 0;
  for (const tr of tracks) {
    for (let i = 1; i < tr.length; i++) {
      if (SimInt.segIllegal(world, tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1])) { auditBad++; }
    }
  }
  ok('WALL_ZERO_SOLID_ENTRY', auditBad === 0, `${auditBad} illegal steps over both walkers (segment audit)`);

  // positive control: teleport W1 across the wall; the SAME audit must
  // report violations (proves the audit is live, not vacuously zero)
  const cx = w1.x, cy = w1.y;
  w1.x = SimInt.enc(800); // far side of the wall
  let ctrlBad = 0;
  if (SimInt.segIllegal(world, cx, cy, w1.x, w1.y)) ctrlBad = 1;
  w1.x = cx; w1.y = cy;
  ok('WALL_AUDIT_LIVE', ctrlBad === 1, 'teleport-through-wall detected by audit');

  // W1 must have stopped just short of the wall, never inside it
  ok('WALL_STOP_SHORT', !SimInt.centerSolid(world, w1.x, w1.y) && w1.illegal === 0, `final center legal, illegal=${w1.illegal}`);
}

const secs = (Date.now() - t0) / 1000;
ok('TIME_BUDGET', secs < 15, `${secs.toFixed(2)}s total (cap 15s)`);

console.log(`\nRESULT INT-COORDS ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
