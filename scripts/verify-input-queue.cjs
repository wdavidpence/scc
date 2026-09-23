// P1.027 — gate for src2/engine/cmdQueue.js (tick-stamped command buffer).
// Increment 1 scope: kernel determinism. Order is a pure function of
// (tick, player, content key) — shuffled arrival must produce an identical
// execution trace; identical under in-process / default-V8 child / --jitless
// child (same pattern as verify-rng). Pause and latency semantics exercised
// in-process. The input-handler source scan (no direct setOrder/state writes
// in pointer/keyboard blocks) and the live simClock seam land with the
// scene-wiring increment; until then this gate guards the kernel contract.
//
// Run: node scripts/verify-input-queue.cjs
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
// cmdQueue.js is ESM (package type:module); bridge via dynamic import.
let createQueue, enqueue, drainTo, serialize;
(async () => {
try {
  ({ createQueue, enqueue, drainTo, serialize } = await import('../src2/engine/cmdQueue.js'));
} catch (e) { console.error('P1.027-RED: cmdQueue.js missing:', e.message); process.exit(1); }
main();
})();

function main() {

const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };

function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }

// Build a deterministic randomized command batch (seeded, no Math.random).
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function buildBatch(seed, n = 800) {
  const rnd = mulberry(seed);
  const kinds = ['move', 'stance', 'patrol', 'cast', 'burrow', 'mine', 'group'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const tick = Math.floor(rnd() * 200) + 1;
    const player = rnd() < 0.5 ? 0 : 1;
    const type = kinds[Math.floor(rnd() * kinds.length)];
    const p = { x: Math.floor(rnd() * 1000), y: Math.floor(rnd() * 1000), f: Math.floor(rnd() * 7) };
    out.push({ tick, player, cmd: { type, p } });
  }
  return out;
}

function runQueue(batch, shuffleSeed) {
  const q = createQueue();
  let arr = batch.slice();
  if (shuffleSeed != null) {
    const rnd = mulberry(shuffleSeed);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  }
  for (const c of arr) enqueue(q, c.tick, c.player, c.cmd);
  const trace = [];
  for (let tick = 1; tick <= 201; tick++) {
    for (const it of drainTo(q, tick)) trace.push(tick + ':' + it.player + ':' + it.content);
  }
  return trace;
}

// ---------- K1: shuffled-arrival order identity ----------
{
  const batch = buildBatch(0xC0FFEE);
  const straight = runQueue(batch);
  let same = 0;
  for (const s of [1, 42, 777, 20260923]) {
    const shuffled = runQueue(batch, s);
    if (JSON.stringify(shuffled) === JSON.stringify(straight)) same++;
  }
  ok('K1_SHUFFLE_x4', same === 4, `${same}/4 shuffled arrivals identical to straight-through`);
  const nonEmpty = straight.length === batch.length;
  ok('K1_COMPLETENESS', nonEmpty, `${straight.length}/${batch.length} commands drained`);
}

// ---------- K2: latency + pause semantics ----------
{
  const q = createQueue();
  enqueue(q, 5, 0, { type: 'move', p: { x: 1 } });
  enqueue(q, 5, 1, { type: 'stance', p: { s: 'hold' } });
  const d4 = drainTo(q, 4);
  const paused = drainTo(q, 5); // simulate paused freeze at tick 5 first? no: drain at boundary 5 executes
  ok('K2_BOUNDARY', d4.length === 0 && paused.length === 2, 'nothing drains before stamp; boundary tick drains');
  // ordering inside a tick: player order, not arrival order
  const q2 = createQueue();
  enqueue(q2, 3, 1, { type: 'stance', p: null });
  enqueue(q2, 3, 0, { type: 'move', p: null });
  const d3 = drainTo(q2, 3);
  ok('K2_PLAYER_ORDER', d3[0].player === 0 && d3[1].player === 1, 'execution orders by (tick, player) regardless of arrival');
  // pause: frozen tick releases nothing, resume releases all, order intact
  const q3 = createQueue();
  for (let i = 0; i < 10; i++) enqueue(q3, 10, i % 2, { type: 'c' + i, p: { i } });
  const frozen = drainTo(q3, 9); // paused at tick 9 for a long wall-time
  const resumed = drainTo(q3, 10);
  ok('K2_PAUSE', frozen.length === 0 && resumed.length === 10, 'pause (frozen tick) queues all, resume drains all');
}

// ---------- K3: three-engine trace identity ----------
if (process.env.SCC_CHILD) {
  const batch = buildBatch(0xC0FFEE);
  const straight = runQueue(batch);
  const shuffled = runQueue(batch, 1);
  const q = createQueue();
  for (let tick = 1; tick <= 5; tick++) for (let i = 0; i < 50; i++) enqueue(q, tick, i % 2, { type: 't', p: { tick, i } });
  console.log(JSON.stringify({ straight: fnv(straight.join(';')), shuffled: fnv(shuffled.join(';')), ser: fnv(serialize(q)) }));
  process.exit(0);
}
{
  const batch = buildBatch(0xC0FFEE);
  const straight = runQueue(batch);
  const hs = fnv(straight.join(';'));
  const hShuf = fnv(runQueue(batch, 1).join(';'));
  const me = path.join(__dirname, 'verify-input-queue.cjs');
  const env = { ...process.env, SCC_CHILD: '1' };
  const a = spawnSync(process.execPath, [me], { env, encoding: 'utf8', timeout: 60000 });
  const b = spawnSync(process.execPath, ['--jitless', me], { env, encoding: 'utf8', timeout: 60000 });
  const parse = (r) => { try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch { return null; } };
  const ca = parse(a), cb = parse(b);
  ok('XENGINE_child_default', ca && ca.straight === hs && ca.shuffled === hShuf, ca ? 'child trace == in-process' : 'child fail');
  ok('XENGINE_child_jitless', cb && cb.straight === hs && cb.shuffled === hShuf, cb ? 'jitless child trace == in-process' : 'jitless fail');
}

const secs = (Date.now() - t0) / 1000;
ok('TIME_BUDGET', secs < 30, `${secs.toFixed(2)}s`);
console.log(`\nRESULT INPUT-QUEUE ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
}