// P1.037 — Desync reporting: locate the FIRST divergent tick, then the
// exact divergent fields at that tick. Pure module: no Phaser, no DOM,
// runs headless (same import seam as the sim kernels).
//
// Inputs are the P1.036 artifacts: per-tick hash rings (numbers) and
// serialized snapshots (exportSimState output / SimSchema.serialize).

export function firstDivergentTick(localRing, refRing) {
  // -1 = no divergence within the compared window. Rings must be same
  // origin (equal start tick); caller aligns offsets.
  const n = Math.min(localRing.length, refRing.length);
  for (let i = 0; i < n; i++) if (localRing[i] !== refRing[i]) return i;
  return -1;
}

function scalarEq(a, b) {
  if (a === b) return true;
  // Numbers: bit-identical or close-enough? NO — hashes proved divergence;
  // for FIELD location we want every changed field, exact compare is fine
  // and cannot false-negative on tiny drift.
  return false;
}

// Walks two parallel plain structures (post-serialize snapshots) and
// reports leaf divergences as dot/bracket paths. Arrays are positional
// (order IS state). Max paths guards pathological blowup; truncated flag
// tells the caller the report is a prefix, not the whole truth.
export function diffStates(a, b, { maxPaths = 64 } = {}) {
  const fields = [];
  let truncated = false;
  const push = (path, av, bv) => {
    if (fields.length >= maxPaths) { truncated = true; return; }
    const short = (v) => typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '…' : v;
    fields.push({ path, a: short(av), b: short(bv) });
  };
  const walk = (va, vb, path) => {
    if (truncated) return;
    if (scalarEq(va, vb)) return;
    const ta = va === null ? 'null' : typeof va;
    const tb = vb === null ? 'null' : typeof vb;
    if (ta !== tb) { push(path, va, vb); return; }
    if (ta === 'object') {
      const aArr = Array.isArray(va), bArr = Array.isArray(vb);
      if (aArr !== bArr) { push(path, aArr ? 'array' : 'object', bArr ? 'array' : 'object'); return; }
      if (aArr) {
        const n = Math.max(va.length, vb.length);
        for (let i = 0; i < n; i++) walk(va[i], vb[i], `${path}[${i}]`);
        return;
      }
      const keys = new Set([...Object.keys(va), ...Object.keys(vb)]);
      for (const k of [...keys].sort()) walk(va[k], vb[k], path ? `${path}.${k}` : k);
      return;
    }
    push(path, va, vb);
  };
  walk(a, b, '');
  return { fields, truncated };
}

// One-shot report against a reference: given local ring + reference ring,
// find tick; given snapshot accessors, attach field-level diff at tick.
// snapAt(side, tick) must return the snapshot recorded AT that tick (the
// P1.036 ring stores finished-tick hashes, so snapshot index === tick).
export function desyncReport(localRing, refRing, snapLocal, snapRef) {
  const tick = firstDivergentTick(localRing, refRing);
  if (tick < 0) return { diverged: false };
  const a = snapLocal(tick), b = snapRef(tick);
  if (a == null || b == null) return { diverged: true, tick, fields: null, note: 'snapshot missing at tick — field diff unavailable' };
  const { fields, truncated } = diffStates(a, b);
  return { diverged: true, tick, fields: fields.map(f => `${f.path} :: ${JSON.stringify(f.a)} -> ${JSON.stringify(f.b)}`), truncated };
}

export default { firstDivergentTick, diffStates, desyncReport };
