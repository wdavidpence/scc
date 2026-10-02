// P1.035 — replay format kernel (PURE: no Phaser, no DOM, no I/O).
//
// SCCR/1 envelope (single text file, LF-separated, trailing newline):
//   L0  SCCR/1 seed=<hex> ticks=<n> he=<n> map=<hex> data=<hex> nc=<n>
//   L1  U <unitsJson>            [[team,kind,x,y],...] spawn fixtures
//   L2. C <tick>|<player>|<type>|<subject>|<payloadJson>
//   ...one line per command, stream order = RECORDING order; runners that
//      need deterministic execution order feed these through netCmds (the
//      per-player seq prefix rule makes re-sequencing safe).
//   --  #(8-hex FNV-1a over every byte above)
//
// Two rejection classes, deliberately distinct:
//  - CHECKSUM covers header+units+commands: any corruption or edit anywhere
//    (seed, tick stamps, payloads) fails as CHECKSUM_MISMATCH. We do NOT
//    hand-decode tampered semantics — first defense is refuse.
//  - content hashes are COMPARED, not trusted: header carries the mapHash
//    (baked terrain layers) and dataHash (balance tables canonical form)
//    recorded at write time; loadReplay takes the LOCAL values and rejects
//    MAP_HASH_MISMATCH / DATA_HASH_MISMATCH. A replay must not silently
//    run against a map or a balance table it was not recorded on — that is
//    what makes golden replays (P1.050) guard rails instead of time bombs
//    when terrain gen or unit stats change.
//
// Losslessness contract: decode(encode(x)) === x and
// encode(decode(text)) === text for any text we produced. Payload floats
// survive via JSON's shortest-roundtrip number form; payload key order is
// preserved because we never re-key — stringify/parse only. A subject
// string must not contain '|'.
'use strict';
import { fnv } from './cmdQueue.js';

const VERSION = 'SCCR/1';

export function h32(str) { return ('00000000' + (fnv(str) >>> 0).toString(16)).slice(-8); }

// canonical form for data hashing: sorted keys everywhere, so two balance
// files that differ only in key order or formatting hash equal; values that
// differ (stat tweaks) hash different.
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

export function computeDataHash(data) { return h32(canonical(data)); }

// baked terrain layers (whatever bakeLayers emits — anything with .solid
// and optional .blocked iterables of per-cell flags)
export function computeMapHash(baked) {
  const s = Array.from(baked.solid || []).join('');
  const b = Array.from(baked.blocked || []).join('');
  return h32(s + '|' + b);
}

export function encodeReplay(r) {
  const head = `${VERSION} seed=${(r.seed >>> 0).toString(16)} ticks=${r.ticks} he=${r.hashEvery || 1} map=${r.mapHash} data=${r.dataHash} nc=${r.commands.length}`;
  const lines = [head, 'U ' + JSON.stringify(r.units || [])];
  for (const c of r.commands) {
    lines.push(`C ${c.tick}|${c.player}|${c.type}|${c.subject ?? ''}|${JSON.stringify(c.payload === undefined ? null : c.payload)}`);
  }
  const body = lines.join('\n') + '\n';
  return body + '#' + h32(body) + '\n';
}

export function decodeReplay(text, local = {}) {
  if (typeof text !== 'string' || !text.length) return { ok: false, error: 'TRUNCATED' };
  let body, ck;
  {
    const t = text.endsWith('\n') ? text.slice(0, -1) : text;
    const i = t.lastIndexOf('\n');
    if (i < 0 || t[i + 1] !== '#') return { ok: false, error: 'CHECKSUM_MISSING' };
    ck = t.slice(i + 2);
    body = t.slice(0, i + 1); // include trailing LF of last body line
  }
  if (h32(body) !== ck) return { ok: false, error: 'CHECKSUM_MISMATCH' };
  const lines = body.split('\n');
  lines.pop(); // trailing '' from the body-terminating LF
  const head = lines[0] || '';
  const sp = head.indexOf(' ');
  const ver = sp < 0 ? head : head.slice(0, sp);
  if (ver !== VERSION) return { ok: false, error: ver.startsWith('SCCR/') ? 'VERSION_UNSUPPORTED' : 'BAD_MAGIC' };
  const h = {};
  for (const kv of head.slice(sp + 1).split(' ')) {
    const e = kv.indexOf('=');
    if (e > 0) h[kv.slice(0, e)] = kv.slice(e + 1);
  }
  if (h.seed === undefined || h.ticks === undefined || h.map === undefined || h.data === undefined || h.nc === undefined) {
    return { ok: false, error: 'BAD_HEADER' };
  }
  const unitsLine = lines[1] || '';
  if (!unitsLine.startsWith('U ')) return { ok: false, error: 'BAD_UNITS' };
  let units;
  try { units = JSON.parse(unitsLine.slice(2)); } catch (e) { return { ok: false, error: 'BAD_UNITS' }; }
  const commands = [];
  for (let i = 2; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.startsWith('C ')) return { ok: false, error: 'BAD_CMD_LINE', detail: `line ${i}` };
    const f = [];
    let from = 2;
    for (let k = 0; k < 4; k++) {
      const j = ln.indexOf('|', from);
      if (j < 0) return { ok: false, error: 'BAD_CMD_LINE', detail: `line ${i} fields` };
      f.push(ln.slice(from, j));
      from = j + 1;
    }
    let payload;
    try { payload = JSON.parse(ln.slice(from)); } catch (e) { return { ok: false, error: 'BAD_PAYLOAD', detail: `line ${i}` }; }
    commands.push({ tick: +f[0], player: +f[1], type: f[2], subject: f[3], payload });
  }
  if (commands.length !== +h.nc) return { ok: false, error: 'CC_MISMATCH', detail: `body ${commands.length} vs header ${h.nc}` };
  // content-hash gates (compare against LOCAL engine state, if provided)
  if (local.mapHash !== undefined && local.mapHash !== h.map) return { ok: false, error: 'MAP_HASH_MISMATCH', detail: `replay ${h.map} local ${local.mapHash}` };
  if (local.dataHash !== undefined && local.dataHash !== h.data) return { ok: false, error: 'DATA_HASH_MISMATCH', detail: `replay ${h.data} local ${local.dataHash}` };
  return {
    ok: true,
    replay: {
      seed: parseInt(h.seed, 16) >>> 0,
      ticks: +h.ticks,
      hashEvery: +(h.he || 1),
      mapHash: h.map,
      dataHash: h.data,
      units,
      commands,
    },
  };
}

export default { VERSION, canonical, computeDataHash, computeMapHash, encodeReplay, decodeReplay, h32 };