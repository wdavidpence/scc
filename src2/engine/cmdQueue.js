// P1.027 — match-scope command buffer kernel (PURE: no Phaser, no DOM).
// Inputs never mutate sim state directly: handlers enqueue commands stamped
// with the arrival tick + epoch; the fixed-tick drain dequeues them in
// canonical (tick, player, content) order. Two mechanisms, per pack:
//
//  - epoch = pause generation. A command carries the epoch it was enqueued
//    in; the drain skips (and purges) commands from a stale epoch, so
//    "input during pause" queues instead of executing mid-freeze.
//  - coalescing: a newer intent for the same {layer, subject} replaces the
//    older queued intent (last-intent-wins), like the existing
//    coach.moveOverlay. Same-key re-enqueue at the same tick is idempotent.
//
// Execution NEVER happens in enqueue. Periodic effects (e.g. autoMine) are
// expressed as a durable state flag (put), not a per-tick repeat.
'use strict';

// fnv-1a (shared with P1.025 hash convention)
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function createMatchCmds() {
  // map key: `${layer}|${subject}|${player}` -> last queued intent
  return { tick: 0, epoch: 0, map: new Map(), order: [] };
}

export function pushCmd(mc, { tick, epoch, layer = 'sim', player = 0, subject = '', type = 'noop', payload = null }) {
  const key = `${layer}|${subject}|${player}`;
  const item = { tick, epoch, key, layer, player, subject, type, payload };
  const prev = mc.map.get(key);
  if (prev) {
    const oi = mc.order.indexOf(prev);
    if (oi >= 0) mc.order.splice(oi, 1);
  }
  mc.map.set(key, item);
  mc.order.push(item);
  return item;
}

// Canonical execution order within one drain: tick asc, then player asc,
// then content key asc. Independent of enqueue order by construction
// (sorting the snapshot, not consuming insertion order).
export function drainTo(mc, tick) {
  const due = [];
  const stale = [];
  for (const it of mc.map.values()) {
    if (it.tick > tick) continue;
    if (it.epoch < mc.epoch) { stale.push(it); continue; }
    due.push(it);
  }
  for (const it of stale) { mc.map.delete(it.key); mc.order.splice(mc.order.indexOf(it), 1); }
  due.sort((a, b) => a.tick - b.tick || a.player - b.player || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const it of due) { mc.map.delete(it.key); mc.order.splice(mc.order.indexOf(it), 1); }
  return due;
}

export function serialize(mc) {
  return mc.order.map(it => `${it.tick}:${it.player}:${it.key}:${it.type}:${JSON.stringify(it.payload)}`).join(';');
}

export default { fnv, createMatchCmds, pushCmd, drainTo, serialize };
