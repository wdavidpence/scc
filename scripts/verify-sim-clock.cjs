// P1.022 — Fixed 24 Hz simulation clock with render interpolation contract.
// Pure Node harness: the clock must produce EXACTLY 10,000 ticks when driven
// by render schedules of 30, 60, and 144 Hz (variable fps), with no tick
// duplication or skipping, and expose interpolation alpha in [0,1).
'use strict';
const path = require('path');
(async () => {
  let clock;
  try { clock = await import(path.resolve(__dirname, '../src2/engine/simClock.js')); }
  catch (e) { console.error('P1.022-RED: simClock.js missing:', e.message); process.exit(1); }
  const { SimClock, TICK_MS, TICK_HZ } = clock;
  let pass = 0, fail = 0;
  const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };

  ok('TICK_24HZ', TICK_HZ === 24 && TICK_MS === 1000 / 24, `${TICK_HZ}Hz/${TICK_MS}ms`);

  for (const fps of [30, 60, 144]) {
    const clk = new SimClock();
    const frameMs = 1000 / fps;
    let t = 0, ticks = 0, alphaBad = 0;
    const maxFrames = Math.ceil((10000 * TICK_MS) / frameMs) + 10;
    for (let f = 0; f < maxFrames && ticks < 10000; f++) {
      const consumed = clk.advance(frameMs);
      if (!Number.isInteger(consumed) || consumed < 0 || consumed > 4) { alphaBad++; break; }
      ticks += consumed;
      const a = clk.alpha();
      if (!(a >= 0 && a < 1.0000001)) alphaBad++;
      t += frameMs;
    }
    ok(`TICKS_10000_at_${fps}fps`, clk.tickIndex === 10000, `tickIndex=${clk.tickIndex} consumedTicks=${ticks}`);
    ok(`ALPHA_RANGE_at_${fps}fps`, alphaBad === 0);
    // catch-up clamp: one giant frame must not explode
    const before = clk.tickIndex;
    const c = clk.advance(5000);
    ok(`CLAMP_at_${fps}fps`, clk.tickIndex - before <= clk.maxCatchUp(), `${clk.tickIndex - before}<=${clk.maxCatchUp()}`);
  }

  // determinism: same frame-time sequence => same tick sequence
  const seq = Array.from({ length: 500 }, (_, i) => 8 + (i % 97) * 0.37);
  const a = new SimClock(), b = new SimClock();
  for (const dt of seq) { a.advance(dt); b.advance(dt); }
  ok('DETERMINISTIC_TICKS', a.tickIndex === b.tickIndex && a.tickIndex > 0, String(a.tickIndex));

  console.log(`\nRESULT SIM-CLOCK ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('P1.022-RED harness error:', String(e).slice(0, 200)); process.exit(1); });
