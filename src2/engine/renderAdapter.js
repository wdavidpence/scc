// P1.033 render adapter (ticket: "render adapters that consume immutable
// tick snapshots").
//
// CONTRACT (determinism): every function here writes DISPLAY data only —
// local child offsets and per-unit display-history scalars. Sim truth is
// container-position backed and hash-observed (`get x(){return
// this.container.x}` in entity.js + exportSimState serializes q8(u.x)), so
// any future change here that touches container.x/y, order/target, or any
// allow-listed field is a determinism regression. scripts/
// verify-render-adapter.cjs compares byte-identical hash rings between
// render-on / render-off / 144 Hz-interpolated runs and must fail it.
//
// Model: classic entity interpolation — render one tick behind. The tail
// draws lerp(prevTickPos, lastTickPos, alpha) while alpha = the accumulator
// remainder (render-paced). At 60 Hz natural this is invisible; at 144 Hz it
// paints continuous motion from a 24 Hz world without writing one state byte.
export const RenderAdapter = {
  // Once per TICK, at tick end: shift the display lag pair. r1 = position at
  // the end of the finished tick (identical to what the state hash observes);
  // r0 = the one before. Pure scalar copies onto underscore-prefixed display
  // fields — never read back by sim logic.
  snapshotPair(units) {
    for (const u of units) {
      if (u.dead || !u.container) continue;
      u._r0x = u._r1x; u._r0y = u._r1y;
      u._r1x = u.container.x; u._r1y = u.container.y;
    }
  },
  // Once per render frame: shift the unit's CHILD visuals by the display
  // offset. The container (collision + hash truth) stays at sim position;
  // separation steering, gun arcs, and targeting all read undistorted state.
  // counters: optional {frames, painted, paintedMoving, maxOff} — non-vacuity
  // evidence for the gate.
  smoothPass(units, alpha, counters) {
    let a = alpha;
    if (!(a >= 0)) return;
    if (a > 1) a = 1;
    if (counters) counters.frames++;
    for (const u of units) {
      if (u.dead || !u.sprite || !u.container || !u.container.active || !u.sprite.active) continue;
      if (u._r0x === undefined || u._r1x === undefined) continue;
      if (u._o0 === undefined) {
        // local-space home positions captured once (sprite y is -8 for
        // fliers; shadow is a fixed side/under offset)
        u._o0 = { x: u.sprite.x, y: u.sprite.y, hx: u.shadow ? u.shadow.x : 0, hy: u.shadow ? u.shadow.y : 0 };
      }
      const dx = u._r0x + (u._r1x - u._r0x) * a - u.container.x;
      const dy = u._r0y + (u._r1y - u._r0y) * a - u.container.y;
      const m = Math.abs(dx) + Math.abs(dy);
      if (counters) {
        counters.painted++;
        if (m > 0.05) { counters.paintedMoving++; if (m > counters.maxOff) counters.maxOff = m; }
      }
      if (m < 0.02) {
        if (u.sprite.x !== u._o0.x || u.sprite.y !== u._o0.y) {
          u.sprite.x = u._o0.x; u.sprite.y = u._o0.y;
          if (u.shadow) { u.shadow.x = u._o0.hx; u.shadow.y = u._o0.hy; }
        }
        continue;
      }
      u.sprite.x = u._o0.x + dx;
      u.sprite.y = u._o0.y + dy;
      if (u.shadow) { u.shadow.x = u._o0.hx + dx; u.shadow.y = u._o0.hy + dy; }
    }
  },
};
