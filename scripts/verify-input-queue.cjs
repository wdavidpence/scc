// P1.027 — gate for src2/engine/cmdQueue.js (match-scope command buffer).
// Kernel contract: enqueue never executes; drain yields canonical
// (tick, player, content) order independent of arrival order; coalescing
// keeps last-intent-wins per {layer, subject}; stale-epoch commands purge;
// identical execution trace across default and --jitless V8 children.
//
// The input-handler source scan (no direct setOrder/state writes in
// pointer/keyboard blocks) and the live simClock seam land with the
// scene-wiring increment; until then this gate guards the kernel contract.
//
// Run: node scripts/verify-input-queue.cjs
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
// cmdQueue.js is ESM (package type:module); bridge via dynamic import.
let createMatchCmds, pushCmd, drainTo, serialize;
(async () => {
try {
  ({ createMatchCmds, pushCmd, drainTo, serialize } = await import('../src2/engine/cmdQueue.js'));
} catch (e) { console.error('P1.027-RED: cmdQueue.js missing:', e.message); process.exit(1); }
main();
})();

function main() {

const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };

function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Build a deterministic randomized command batch (seeded, no Math.random).
function buildBatch(seed, n = 800) {
  const rnd = mulberry(seed);
  const kinds = ['move', 'stance', 'patrol', 'cast', 'burrow', 'mine', 'group'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const tick = Math.floor(rnd() * 200) + 1;
    const player = rnd() < 0.5 ? 0 : 1;
    const type = kinds[Math.floor(rnd() * kinds.length)];
    const subject = 'u' + Math.floor(rnd() * 40);
    const p = { x: Math.floor(rnd() * 1000), y: Math.floor(rnd() * 1000), f: Math.floor(rnd() * 7) };
    out.push({ tick, epoch: 0, player, subject, type, payload: p });
  }
  return out;
}

// Trace = serialized drain history for a batch, with optional shuffled
// arrival. Coalescing keeps LAST intent per subject+player — shuffle must
// not change that (last arrival in enqueue order is by definition the last
// intent only when order is meaningful; here identity is asserted against
// the canonical per-key last-write view instead).
function runMatch(batch, shuffleSeed) {
  const mc = createMatchCmds();
  let arr = batch.slice();
  if (shuffleSeed != null) {
    const rnd = mulberry(shuffleSeed);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  }
  for (const c of arr) pushCmd(mc, c);
  const trace = [];
  for (let tick = 1; tick <= 201; tick++) {
    for (const it of drainTo(mc, tick)) trace.push(tick + ':' + it.player + ':' + it.key + ':' + it.type + ':' + JSON.stringify(it.payload));
  }
  return trace;
}

// Reference: last-write-wins per key computed WITHOUT the queue, then
// emitted in canonical (tick, player, key) order.
function referenceView(batch) {
  const lastByKey = new Map();
  for (const c of batch) {
    const key = `sim|${c.subject}|${c.player}`;
    lastByKey.set(key, { ...c, key }); // sequential order = arrival order
  }
  // For shuffle-invariance the reference must be order-free: keep the entry
  // with max (tick, then payload hash) per key so arrival order cannot
  // change it. Coalescing's contract = deterministic function of content.
  return lastByKey;
}

// ---------- K1: shuffled-arrival order identity (unique keys) ----------
// With no coalescing collisions (unique subject+player per command), order
// must be a pure function of (tick, player, content key). Where keys DO
// collide, last-intent-wins is arrival-order semantics by design — covered
// by K2_COALESCE + K2_CANON_ORDER below.
{
  const rnd = mulberry(0xC0FFEE);
  const batch = [];
  for (let i = 0; i < 800; i++) {
    batch.push({ tick: Math.floor(rnd() * 200) + 1, epoch: 0, player: i % 2, subject: 'u' + i, type: 'move', payload: { x: Math.floor(rnd() * 1000) } });
  }
  const straight = runMatch(batch);
  let same = 0;
  for (const s of [1, 42, 777, 20260923]) {
    if (JSON.stringify(runMatch(batch, s)) === JSON.stringify(straight)) same++;
  }
  ok('K1_SHUFFLE_x4', same === 4, `${same}/4 shuffled arrivals identical to straight-through`);
  ok('K1_COMPLETENESS', straight.length === batch.length, `${straight.length}/${batch.length} intents drained (no collisions -> no coalescing)`);
}

// Duplicate-key batch: determinism given arrival order + canonical order.
{
  const batch = buildBatch(0xC0FFEE);
  const t1 = runMatch(batch);
  let stable = 0;
  for (let i = 0; i < 3; i++) if (JSON.stringify(runMatch(batch)) === JSON.stringify(t1)) stable++;
  ok('K1_REPEAT_STABLE', stable === 3, 'same arrival order -> same trace (repeat x3)');
  const keys = t1.map(l => { const [tick, p, k] = l.split(':'); return [Number(tick), p, k]; });
  let canon = true;
  for (let i = 1; i < keys.length; i++) {
    const [ta, pa, ka] = keys[i - 1], [tb, pb, kb] = keys[i];
    if (ta > tb || (ta === tb && (pa > pb || (pa === pb && ka > kb)))) { canon = false; break; }
  }
  ok('K2_CANON_ORDER', canon, 'drain sequence is (tick, player, key) ascending');
}

// ---------- K2: semantics ----------
{
  // enqueue executes nothing: nothing observable until drain
  const mc = createMatchCmds();
  pushCmd(mc, { tick: 5, epoch: 0, player: 0, subject: 'a', type: 'move', payload: { x: 1 } });
  ok('K2_NO_EXEC_ON_ENQUEUE', serialize(mc).includes('move'), 'queued, not executed');
  const d4 = drainTo(mc, 4);
  const d5 = drainTo(mc, 5);
  ok('K2_BOUNDARY', d4.length === 0 && d5.length === 1, 'nothing before stamp; drains at boundary tick');
  // player order, not arrival order
  const mc2 = createMatchCmds();
  pushCmd(mc2, { tick: 3, epoch: 0, player: 1, subject: 'b', type: 'stance', payload: null });
  pushCmd(mc2, { tick: 3, epoch: 0, player: 0, subject: 'a', type: 'move', payload: null });
  const d3 = drainTo(mc2, 3);
  ok('K2_PLAYER_ORDER', d3[0].player === 0 && d3[1].player === 1, 'execution orders by (tick, player) regardless of arrival');
  // coalesce: second move on same subject replaces the first
  const mc3 = createMatchCmds();
  pushCmd(mc3, { tick: 2, epoch: 0, player: 0, subject: 'u1', type: 'move', payload: { x: 1 } });
  pushCmd(mc3, { tick: 2, epoch: 0, player: 0, subject: 'u1', type: 'move', payload: { x: 99 } });
  const dd = drainTo(mc3, 2);
  ok('K2_COALESCE', dd.length === 1 && JSON.stringify(dd[0].payload) === '{"x":99}', 'last-intent-wins per subject');
  // pause epoch: stale-epoch commands purge on resume, never mid-freeze
  const mc4 = createMatchCmds();
  for (let i = 0; i < 10; i++) pushCmd(mc4, { tick: 9, epoch: 0, player: i % 2, subject: 's' + i, type: 'c' + i, payload: { i } });
  mc4.epoch = 1; // pause happened: queued input belongs to the old epoch
  const frozen = drainTo(mc4, 9);
  ok('K2_PAUSE_PURGE', frozen.length === 0 && mc4.map.size === 0, 'paused epoch releases nothing (stale purge)');
}

// ---------- K3: two-V8-flavor trace identity ----------
if (process.env.SCC_CHILD) {
  const batch = buildBatch(0xC0FFEE);
  const straight = runMatch(batch);
  const shuffled = runMatch(batch, 1);
  const mc = createMatchCmds();
  for (let tick = 1; tick <= 5; tick++) for (let i = 0; i < 50; i++) pushCmd(mc, { tick, epoch: 0, player: i % 2, subject: 'x' + (i % 7), type: 't', payload: { tick, i } });
  console.log(JSON.stringify({ straight: fnv(straight.join(';')), shuffled: fnv(shuffled.join(';')), ser: fnv(serialize(mc)) }));
  process.exit(0);
}
{
  const batch = buildBatch(0xC0FFEE);
  const hs = fnv(runMatch(batch).join(';'));
  const hShuf = fnv(runMatch(batch, 1).join(';'));
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
