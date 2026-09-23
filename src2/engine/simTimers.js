// P1.028 — sim-clock deadline queue (PURE: no Phaser, no DOM).
// Replaces render-clock timed effects (time.delayedCall / tween onComplete
// chains) that mutate sim state. Contract:
//  - deadlines are in SIM TICKS, not wall ms; a paused/frozen clock drains
//    nothing (teardown/pause cannot skip or duplicate an effect)
//  - execution order is (deadline asc, then insertion seq) — a pure function
//    of the scheduled set, so identical schedules replay identically
//  - entries carry a string KEY + plain payload, never closures: the scene
//    dispatches keys through its own EXEC table, keeping the queue
//    serializable for replay/hash
'use strict';

const TICK_MS = 1000 / 24; // fixed 24 Hz sim tick (P1.026 kernel rate)

function createTimers() {
  return { now: 0, seq: 0, items: [] };
}

// ms (legacy render-clock constant) -> ticks, rounded up: a 1500ms boss
// timer becomes 36 sim ticks, etc. Deterministic across machines.
function msToTicks(ms) { return Math.max(1, Math.ceil(ms / TICK_MS)); }

function schedule(t, atTick, key, payload = null, seq = null) {
  const item = { at: atTick, key, payload, seq: seq == null ? t.seq++ : seq };
  t.items.push(item);
  return item;
}

// Add by legacy ms constant (migration helper).
function scheduleMs(t, nowTick, ms, key, payload = null) {
  return schedule(t, nowTick + msToTicks(ms), key, payload);
}

// Return due entries in canonical order and remove them. Frozen clock
// (t.now unchanged) always yields [].
function drain(t, nowTick) {
  t.now = nowTick;
  const due = [];
  const keep = [];
  for (const it of t.items) (it.at <= nowTick ? due : keep).push(it);
  due.sort((a, b) => a.at - b.at || a.seq - b.seq || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  t.items = keep;
  return due;
}

function cancel(t, predicate) {
  let n = 0;
  const keep = [];
  for (const it of t.items) { if (predicate(it)) n++; else keep.push(it); }
  t.items = keep;
  return n;
}

function serialize(t) {
  return t.items.map(it => `${it.at}:${it.seq}:${it.key}:${JSON.stringify(it.payload)}`).join(';');
}

export { createTimers, schedule, scheduleMs, drain, cancel, serialize, msToTicks, TICK_MS };
export default { createTimers, schedule, scheduleMs, drain, cancel, serialize, msToTicks, TICK_MS };
