// P1.034 — network-side deterministic command queue (PURE: no Phaser, no DOM).
//
// Problem this solves: cmdQueue.js (P1.027) coalesces by {layer,subject,player}
// with LAST-ARRIVAL-WINS. That is correct for a local mouse (a newer intent
// genuinely replaces an older one) but is arrival-order dependent — and a
// network is free to reorder. Feeding the same command SET to the local queue
// in two arrival permutations can execute different winners.
//
// Net streams are different: every command the sender issued is authoritative,
// in stream order. So this buffer executes ALL of them, ordered by the content
// triple (dueTick, player, seq) — never by arrival time. Arrival order can
// only delay a command (gap-hold), never reorder it. Same rule as TCP
// reassembly + frame-delay lockstep: jitter changes latency, not outcome.
//
// Contract:
//  - packet = {player, seq, tick, type, payload}. seq is the sender-stream
//    sequence number, dense and ascending (1,2,3,...); tick is the due tick
//    chosen at ISSUE time (sender clock), so it is content, not arrival.
//  - per player, execution is strictly in seq order: a command may execute
//    only once every smaller seq for that player has executed. A missing
//    smaller seq HOLDS the rest of that player's stream (late retransmit
//    resumes at the correct point; there is no "skip" mode — skipping would
//    make outcomes depend on when the gap fills, i.e. on network timing).
//  - a command executes at the first drain with tick <= current tick AND its
//    seq prefix complete. Cross-player ties at equal tick resolve by player
//    asc, then seq asc. All deterministic from content alone.
//  - duplicates (same player+seq) are dropped: safe for retransmits, and an
//    already-executed seq can never re-enter.
//
// This is the receive side only. It does NOT replace the local input path
// (matchCmds) — local coalescing stays last-wins. Harness/netcode code feeds
// this buffer; BattleScene drains it at the tick head right after matchCmds.
import { fnv } from './cmdQueue.js';

export function createNetBuf() {
  return {
    // player -> {next: nextSeqToExecute, hold: Map(seq -> pkt), dupes: 0}
    streams: new Map(),
    delivered: 0, // probes: packets accepted (incl. held)
    dropped: 0,   // probes: duplicates / already-executed seqs
  };
}

function stream(buf, player) {
  let s = buf.streams.get(player);
  if (!s) { s = { next: 1, hold: new Map(), }; buf.streams.set(player, s); }
  return s;
}

// Deliver one arriving packet. Any arrival order allowed. Idempotent:
// re-delivering an executed or buffered (player,seq) is counted as dropped.
export function deliver(buf, pkt) {
  const s = stream(buf, pkt.player);
  if (pkt.seq < s.next || s.hold.has(pkt.seq)) { buf.dropped++; return false; }
  s.hold.set(pkt.seq, pkt);
  buf.delivered++;
  return true;
}

// Drain everything READY at `tick`, in canonical (tick, player, seq) order.
// Per player: pop the contiguous seq prefix whose due tick has arrived,
// stopping at the first gap OR the first not-yet-due head (per-player seq
// order is also the causality order — a later seq may reference state the
// earlier one creates). Returned items are shaped for execCmd.
export function drainNet(buf, tick) {
  const due = [];
  for (const [player, s] of buf.streams) {
    while (true) {
      const pkt = s.hold.get(s.next);
      if (!pkt || pkt.tick > tick) break; // gap-hold / not-due-hold
      due.push({ player, seq: s.next, tick: pkt.tick, type: pkt.type, payload: pkt.payload });
      s.hold.delete(s.next);
      s.next++;
    }
  }
  // Canonical total order. Per-player order is already seq-ascending; this
  // sort only interleaves players. Contract guarantees per-player tick is
  // non-decreasing in seq, so the sort cannot violate causality.
  due.sort((a, b) => a.tick - b.tick || a.player - b.player || a.seq - b.seq);
  return due;
}

// Execution-log oracle for gates: full executed sequence + a stable digest.
export function execLog(buf) {
  // replay-free digest source: serialize executed history instead — gates
  // capture drain output themselves; this covers queue final state only.
  let out = [];
  for (const [player, s] of buf.streams) out.push(`${player}:${s.next}:${s.hold.size}`);
  return out.sort().join('|');
}

export function hashExecs(runs) {
  return fnv(runs.map(c => `${c.tick}:${c.player}:${c.seq}:${c.type}:${JSON.stringify(c.payload || null)}`).join(';'));
}

export default { createNetBuf, deliver, drainNet, execLog, hashExecs, fnv };