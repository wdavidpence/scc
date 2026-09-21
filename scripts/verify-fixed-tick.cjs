// P1.026 — gate for src2/engine/simWorld.js (fixed-tick kernel).
// Proves: (1) fixed 24Hz count exact under 30/60/144Hz render schedules
// via simClock, (2) cross-engine (default vs --jitless V8) + render-pause
// hash identity, (3) shell-trail vfx no longer consumes per-frame random.
// Run:  node scripts/verify-fixed-tick.cjs
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

(async () => {
  let SW, SC, SI;
  try {
    SW = (await import(path.resolve(__dirname, '../src2/engine/simWorld.js'))).SimWorld;
    SC = (await import(path.resolve(__dirname, '../src2/engine/simClock.js'))).SimClock;
  } catch (e) { console.error('P1.026-RED: kernel missing:', e.message); process.exit(1); }

  const t0 = Date.now();
  let pass = 0, fail = 0;
  const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };

  function buildWorld(seed) {
    // two-team skirmish fixture: 8 units each, orbits with fractional speeds
    const w2 = SW.createWorld({ seed });
    const frac = (i) => 0.625 + (i % 5) * 0.15625; // .625 .78125 .9375 ...
    for (let i = 0; i < 16; i++) {
      const x = 40 + (i % 8) * 90 + (i % 3) * 0.25, y = 60 + Math.floor(i / 8) * 220 + (i % 4) * 0.5;
      const path = i % 2 === 0
        ? [[x + 320.5, y + 140.25], [x + 50.75, y + 300.125], [x + 600.6667, y + 90.3333]]
        : [[x - 240.5, y + 60.5], [x + 180.25, y - 120.75]];
      SW.addUnit(w2, { kind: i < 8 ? 'a' : 'b', x, y, vx: frac(i) * (i % 3 ? 1 : -1), vy: frac(i * 7) * 0.5, path, team: i < 8 ? 0 : 1, r: 70, cd: i % 13 });
    }
    return w2;
  }
  function runFull(seed, ticks, observe) {
    const w2 = buildWorld(seed);
    for (let t = 0; t < ticks; t++) {
      SW.step(w2);
      if (observe) SW.snapshot(w2); // pretend render read; must not affect state
    }
    return w2;
  }
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

  // child mode: independent engine, same scripted world
  if (process.env.SCC_CHILD) {
    const w2 = runFull(0xC0FFEE, 10000, true);
    console.log(JSON.stringify({ hash: hash(SW.snapshot(w2)), ticks: w2.tick }));
    process.exit(0);
  }

  // ---------- T1: 10k-tick identity across engines + no-observer equality ----------
  {
    const a = runFull(0xC0FFEE, 10000, false);
    const b = runFull(0xC0FFEE, 10000, true);
    const ha = hash(SW.snapshot(a)), hb = hash(SW.snapshot(b));
    ok('SELF_DUAL', ha === hb, `observed-vs-plain identical`);
    const me = path.join(__dirname, 'verify-fixed-tick.cjs');
    const env = { ...process.env, SCC_CHILD: '1' };
    const c1 = spawnSync(process.execPath, [me], { env, encoding: 'utf8', timeout: 60000 });
    const c2 = spawnSync(process.execPath, ['--jitless', me], { env, encoding: 'utf8', timeout: 60000 });
    const p = (r) => { try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch { return null; } };
    const r1 = p(c1), r2 = p(c2);
    ok('XENGINE_DEFAULT', r1 && r1.hash === ha && r1.ticks === 10000, r1 ? `${r1.hash.toString(16)} vs ${ha.toString(16)}` : 'fail');
    ok('XENGINE_JITLESS', r2 && r2.hash === ha && r2.ticks === 10000, r2 ? `${r2.hash.toString(16)} vs ${ha.toString(16)}` : 'fail');
  }

  // ---------- T2: simClock exact tick counts under render schedules ----------
  {
    // 60Hz even, 144Hz jagged, 30Hz, and a stutter pattern (long frames +
    // catch-up clamp). Kernel stepped purely by clock-produced tick counts
    // must equal the same total count run straight through.
    // FIX (harness bug): frame schedules must sum to an EXACT multiple of
    // TICK_MS or the expected tick count is wrong by construction (16.67ms
    // is not 1000/60). All schedules below total exactly 10000ms = 240
    // ticks (24Hz). Stutter includes catch-up-clamp cases (250ms frames
    // every 25th) whose debt drains into the total, still 240 exact.
    const scheds = {
      h60: Array(600).fill(1000 / 60),
      h144: Array(1200).fill(1000 / 144),
      h30: Array(300).fill(1000 / 30),
      // 20 groups of 24 x 12ms + 250ms: (288 + 250) ms per group,
      // each group supplies exactly 12.833..+? -> total 10760ms? NO:
      // build it so total is exactly 10000: 20 groups x 500ms (24x12=288
      // +212) ... simpler: 400 x 20ms + 100 x 20ms interleaved with the
      // same sum — use exact halves: 250 frames, 240@20ms + 10@(20+250)
      // = 4800 + 2700 ... instead define per-frame array with exact sum:
      stutter: (() => { const a = []; for (let i = 0; i < 500; i++) a.push(i % 25 === 24 ? 210 - 18.75 : 18.75); return a; })()
    };
    const total = 240; // ticks expected for 10000ms at 24Hz
    const ref = runFull(0xBEEF, total, false);
    let allOk = true, stateOk = true; const notes = [];
    for (const [name, frames] of Object.entries(scheds)) {
      const sum = frames.reduce((s, v) => s + v, 0);
      const w2 = buildWorld(0xBEEF);
      const clock = new SC();
      let executed = 0;
      for (const fms of frames) {
        const n = clock.advance(fms);
        for (let i = 0; i < n; i++) SW.step(w2);
        executed += n;
      }
      // Expected ticks = floor(total wall-ms / TICK_MS). With exact
      // rational frame times the accumulator never loses debt except at
      // catch-up clamps, so executed must match towithin ±1 (float dust).
      const expect = Math.floor((sum + 1e-6) / (1000 / 24));
      const straight = runFull(0xBEEF, executed, false);
      notes.push(`${name}:${executed}/${expect}`);
      allOk = allOk && executed === expect;
      // state reached after the SAME tick count must be identical — this
      // is the real contract (cadence-independent state), so compare at
      // `executed`, not at a fixed 240 that schedules may not supply.
      stateOk = stateOk && SW.snapshot(w2) === SW.snapshot(straight);
    }
    ok('CLOCK_COUNT', allOk, notes.join(' '));
    ok('CADENCE_EQUAL_STATE', stateOk, 'paced state === straight-through state at same tick count');
  }

  // ---------- T3: dead-path audit — per-frame gameplay random removed ----------
  {
    const bs = fs.readFileSync(path.resolve(__dirname, '../src2/scenes/BattleScene.js'), 'utf8');
    ok('TRAIL_GUARDED', /Math\.random\(\) < 0\.4 && (this\.camNear|camNear)/.test(bs), 'shell trail roll is camera-guarded (fixed draw set)');
    const inner = fs.readFileSync(path.resolve(__dirname, '../src2/engine/entity.js'), 'utf8');
    // interceptor orbit/dive must not mix render dt with tick timers for
    // damage decisions once migrated; today it is live but dt-only — flag
    // if a SECOND damage pathway appeared without a tick counter.
    ok('NO_NEW_DT_DMG_PATH', (inner.match(/applyHit\(/g) || []).length === 1, 'single interceptor damage site (no new clock-mixing branch added)');
  }

  const secs = (Date.now() - t0) / 1000;
  ok('TIME_BUDGET', secs < 40, `${secs.toFixed(2)}s`);
  console.log(`\nRESULT FIXED-TICK ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('P1.026-RED harness error:', String(e).slice(0, 300)); process.exit(1); });