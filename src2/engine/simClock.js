// P1.022 — Fixed 24 Hz simulation clock with render interpolation contract.
// PURE module (no Phaser/DOM): battle code advances the world in constant
// TICK_MS steps regardless of render fps; renderers read alpha() to
// interpolate between the last two simulation snapshots. Clamp prevents the
// "spiral of death": a frame longer than maxCatchUp ticks processes the cap
// and drops the rest of the wall-time debt (simulation slows visibly instead
// of freezing — SC1 parity behavior).
'use strict';

const TICK_HZ = 24;
const TICK_MS = 1000 / TICK_HZ; // exact 41.666...; stored as float but counted exactly

class SimClock {
  constructor() {
    this.tickIndex = 0;
    this.acc = 0;            // carried sub-tick remainder in ms
    this._catchUpTicks = 4; // hard cap per frame (harness enforces <=4)
  }

  maxCatchUp() { return this._catchUpTicks; }

  // Consume wall-ms since last advance; returns integer ticks to step now.
  advance(frameMs) {
    if (!(frameMs >= 0) || !Number.isFinite(frameMs)) return 0;
    this.acc += frameMs;
    let n = 0;
    while (this.acc >= TICK_MS && n < this._catchUpTicks) {
      this.acc -= TICK_MS;
      this.tickIndex += 1;
      n += 1;
    }
    if (this.acc >= TICK_MS * this._catchUpTicks) {
      // drop surplus debt, keep sub-tick remainder
      this.acc = this.acc % TICK_MS;
    }
    return n;
  }

  // Render interpolation factor for the pending partial tick, [0,1).
  alpha() { return Math.min(0.9999999, Math.max(0, this.acc / TICK_MS)); }

  reset() { this.tickIndex = 0; this.acc = 0; }
}

export { SimClock, TICK_HZ, TICK_MS };
export default SimClock;
