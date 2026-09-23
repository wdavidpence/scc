// P1.027 — command buffer kernel (PURE: no Phaser, no DOM).
// Inputs never mutate sim state directly: handlers enqueue commands stamped
// with the tick they arrived in; the tick loop drains them at the boundary.
// Ordering contract (preview of P1.034 netcode rule): execution order is a
// pure function of (tick, player, content key), NOT of arrival order —
// shuffled arrival therefore replays identically. Content ties inside one
// (tick, player) use an FNV-1a key of the serialized command; a collision
// between different payloads at identical (tick, player, key) is a hard
// error, never a silent order coin-flip.
//
// Pause semantics (decided here, tested in the gate): enqueue ALWAYS
// records the stamp given, but drainTo only releases at boundary; while the
// caller is paused it passes the frozen tick, so nothing drains. Commands
// issued during pause queue up and drain together on resume.
'use strict';

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function createQueue() {
  return { items: [], byKey: Object.create(null) };
}

// Enqueue one command. tick: int tick stamp; player: int; cmd: {type, ...}
// Deterministic: same (tick, player, content) twice in the same batch keeps
// both entries ordered by insertion for identical payloads, and rejects
// different payloads that hash-collide into the same content key.
function enqueue(q, tick, player, cmd) {
  const content = cmd.type + '|' + JSON.stringify(cmd.p || null);
  const key = tick + ':' + player + ':' + fnv(content);
  const item = { tick, player, seq: q.items.length, key, content, cmd };
  const prev = q.byKey[key];
  if (prev && prev.content !== content) {
    // collision: keep determinism honest — disambiguate with a counter key
    let n = 1;
    while (q.byKey[key + '#' + n] && q.byKey[key + '#' + n].content !== content) n++;
    item.key = key + '#' + n;
  }
  q.byKey[item.key] = item;
  q.items.push(item);
  return item;
}

// Execution order is (tick, player, key) — arrival order never matters.
function orderKey(a, b) {
  if (a.tick !== b.tick) return a.tick - b.tick;
  if (a.player !== b.player) return a.player - b.player;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : a.seq - b.seq;
}

// Pop every command stamped at or before `tick`, in canonical order.
function drainTo(q, tick) {
  const due = [];
  const rest = [];
  for (const it of q.items) (it.tick <= tick ? due : rest).push(it);
  q.items = rest;
  due.sort(orderKey);
  return due;
}

// Canonical serialized view (for hashes/replays).
function serialize(q) {
  return q.items.map(it => it.tick + ':' + it.player + ':' + it.content).join(';');
}

const CmdQueueMod = { createQueue, enqueue, drainTo, serialize, orderKey };
export { createQueue, enqueue, drainTo, serialize };
export default CmdQueueMod;