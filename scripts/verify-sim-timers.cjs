// P1.028 — gate for src2/engine/simTimers.js (sim-clock deadline queue).
// Kernel contract: pause (frozen clock) drains nothing and never loses
// entries; canonical (deadline, seq) order is insertion-independent;
// teardown-before-due has the same effect outcome as full render (effects
// fire on sim clock only); dual-V8 trace identity.
//
// Run: node scripts/verify-sim-timers.cjs
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
let createTimers, schedule, scheduleMs, drain, cancel, serialize, msToTicks, TICK_MS;
(async () => {
try {
  ({ createTimers, schedule, scheduleMs, drain, cancel, serialize, msToTicks, TICK_MS } = await import('../src2/engine/simTimers.js'));
} catch (e) { console.error('P1.028-RED: simTimers.js missing:', e.message); process.exit(1); }
main();
})();

function main() {
const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function schedBatch(seed, n = 600) {
  const rnd = mulberry(seed);
  const keys = ['buff_revert', 'hatch', 'boss', 'endgame', 'fire'];
  const out = [];
  for (let i = 0; i < n; i++) out.push({ at: Math.floor(rnd() * 200) + 1, key: keys[Math.floor(rnd() * keys.length)], payload: { i, v: Math.floor(rnd() * 1000) } });
  return out;
}

function runTimers(batch, shuffleSeed, pausedTicks = null) {
  const t = createTimers();
  let arr = batch.slice();
  if (shuffleSeed != null) {
    const rnd = mulberry(shuffleSeed);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const c = arr[i]; arr[i] = arr[j]; arr[j] = c; }
  }
  // NOTE: insertion order varies but seq assignment varies with it too;
  // canonical order includes seq, so identity requires SAME insertion order.
  // Shuffle-invariance is asserted instead via key-unique + same-seq replay:
  // two queues fed the same batch in the same order but DRAINED under
  // different render pacing must match, and a queue where all deadlines are
  // unique must match even with shuffled insertion (seq never ties).
  for (const e of arr) schedule(t, e.at, e.key, e.payload);
  const trace = [];
  for (let tick = 1; tick <= 202; tick++) {
    if (pausedTicks && pausedTicks.has(tick)) continue; // frozen: no drain, no loss
    for (const it of drain(t, tick)) trace.push(tick + ':' + it.key + ':' + it.seq + ':' + JSON.stringify(it.payload));
  }
  return trace;
}

// ---------- T1: insertion-order invariance (unique deadlines) ----------
// With unique (at,key) pairs, the drain trace is a pure function of the
// scheduled SET: any insertion order yields identical execution. Direct
// form (no seq in trace) mirrors the P1.027 shuffle-identity contract.
{
  function buildT1(seed) {
    const rnd = mulberry(seed);
    const b = [];
    let at = 1;
    for (let i = 0; i < 400; i++) { at += 1 + Math.floor(rnd() * 3); b.push({ at, key: 'k' + i, payload: { v: i } }); }
    return b;
  }
  function runT1(arr, top = 810) {
    const t = createTimers();
    for (const e of arr) schedule(t, e.at, e.key, e.payload);
    const tr = [];
    for (let tick = 1; tick <= top; tick++) for (const it of drain(t, tick)) tr.push(tick + ':' + it.key + ':' + JSON.stringify(it.payload));
    return tr;
  }
  const batch = buildT1(0xBEEF);
  const straight = runT1(batch);
  let same = 0;
  for (const s of [7, 99, 20260923]) {
    const arr2 = batch.slice();
    const rr = mulberry(s);
    for (let i = arr2.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); const c = arr2[i]; arr2[i] = arr2[j]; arr2[j] = c; }
    if (JSON.stringify(runT1(arr2)) === JSON.stringify(straight)) same++;
  }
  ok('T1_INSERTION_INVAR_x3', same === 3, `${same}/3 shuffled-insertion traces identical (unique deadlines)`);
  ok('T1_COMPLETENESS', straight.length === 400, `${straight.length}/400 drained within full-clock bound`);
}

// ---------- T2: pause + teardown semantics ----------
{
  const batch = schedBatch(0xC0FFEE);
  const full = runTimers(batch);
  const paused = new Set();
  const rnd = mulberry(42);
  for (let i = 0; i < 60; i++) paused.add(Math.floor(rnd() * 200) + 1); // 60 frozen ticks
  const gappy = runTimers(batch, null, paused);
  // contract = effect SET identity under render-pacing gaps (fire late,
  // never skip, never duplicate): compare payloads + counts, not tick marks
  const stripTick = (a) => a.map(x => x.slice(x.indexOf(':') + 1)).sort();
  ok('T2_PAUSE_NO_LOSS', JSON.stringify(stripTick(full)) === JSON.stringify(stripTick(gappy)) && full.length === gappy.length && full.length > 0, `paused-clock gaps: ${full.length} vs ${gappy.length} effects, set-identical`);
  // teardown-before-due: effects never fired on render clock -> in a
  // render-teardown replay the sim clock still advances -> same drain set
  const t = createTimers();
  scheduleMs(t, 0, 12000, 'surge_revert', { n: 3 });
  const dueFast = drain(t, 300).length;  // 288 ticks needed, reached
  const t2 = createTimers();
  scheduleMs(t2, 0, 12000, 'surge_revert', { n: 3 });
  const frozenDrain = drain(t2, 5) /* paused long */;
  const afterResume = drain(t2, 288);
  ok('T2_FROZEN_YIELDS_EMPTY', frozenDrain.length === 0 && afterResume.length === 1 && dueFast === 1, 'frozen clock: nothing drains; resume: effect fires once');
  ok('T2_MSTICKS', msToTicks(12000) === 288 && msToTicks(1500) === 36 && msToTicks(2500) === 60, '12s=288t, 1.5s=36t, 2.5s=60t at 24Hz');
  // cancel removes pending (no orphan fire after teardown)
  const t3 = createTimers();
  scheduleMs(t3, 0, 100, 'a'); scheduleMs(t3, 0, 100, 'b');
  const nc = cancel(t3, (it) => it.key === 'a');
  const d = drain(t3, 50);
  ok('T2_CANCEL', nc === 1 && d.length === 1 && d[0].key === 'b', 'cancel purges only target key');
}

// ---------- T3: dual-V8 identity ----------
if (process.env.SCC_CHILD) {
  const batch = schedBatch(0xC0FFEE);
  const a = runTimers(batch);
  const b = runTimers(batch, 1, new Set([50, 51, 52]));
  const t = createTimers(); for (let tick = 1; tick <= 5; tick++) for (let i = 0; i < 40; i++) schedule(t, tick + 10, 'x' + (i % 6), { tick, i });
  console.log(JSON.stringify({ a: fnv(a.join(';')), b: fnv(b.join(';')), ser: fnv(serialize(t)) }));
  process.exit(0);
}
{
  const batch = schedBatch(0xC0FFEE);
  const ha = fnv(runTimers(batch).join(';'));
  const hb = fnv(runTimers(batch, 1, new Set([50, 51, 52])).join(';'));
  const me = path.join(__dirname, 'verify-sim-timers.cjs');
  const env = { ...process.env, SCC_CHILD: '1' };
  const a = spawnSync(process.execPath, [me], { env, encoding: 'utf8', timeout: 60000 });
  const b = spawnSync(process.execPath, ['--jitless', me], { env, encoding: 'utf8', timeout: 60000 });
  const parse = (r) => { try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch { return null; } };
  const ca = parse(a), cb = parse(b);
  ok('XENGINE_child_default', ca && ca.a === ha && ca.b === hb, ca ? 'child trace == in-process' : 'child fail');
  ok('XENGINE_child_jitless', cb && cb.a === ha && cb.b === hb, cb ? 'jitless child trace == in-process' : 'jitless fail');
}

const secs = (Date.now() - t0) / 1000;
ok('TIME_BUDGET', secs < 30, `${secs.toFixed(2)}s`);
console.log(`\nRESULT SIM-TIMERS ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
}
