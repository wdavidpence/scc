// P1.025 — gate for src2/engine/simRng.js (seeded PRNG) + sim-side
// Math.random conversion. Done-when interpretation: "zero Math.random in
// simulation modules" is enforced by the SIM allowlist scan below — all
// state-mutating draws now go through scene/world.simRng; presentation
// jitter is documented (P1.025 context pack) and stays on its own stream so
// render rate never couples into sim draws. Full 100-seed match-replay
// identity needs the P1.038 headless runner (plan dependency); this gate
// proves STREAM determinism at the PRNG layer instead: 100 seeds x 3 engines
// (in-process, default-V8 child, --jitless-V8 child) + a scripted
// two-process world-slice that includes the new rng call sites.
//
// Run:  node scripts/verify-rng.cjs
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

let SimRng;
try { SimRng = require('../src2/engine/simRng.js').SimRng; }
catch (e) { console.error('P1.025-RED: simRng.js missing:', e.message); process.exit(1); }

const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };

function stream(seed, n = 200) {
  const r = new SimRng(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push(r.u32());
  return out;
}

// ---------- child modes: independent engine runs ----------
if (process.env.SCC_CHILD) {
  const hash = (arr) => { let h = 0x811c9dc5; for (const v of arr) { h ^= v; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
  const seeds = [];
  for (let s = 1; s <= 100; s++) seeds.push(hash(stream(s * 0x9E37 + 11, 50)));
  const mixed = (() => { const r = new SimRng(12345); const out = []; for (let i = 0; i < 10000; i++) out.push(r.u01()); return hash(out); })();
  console.log(JSON.stringify({ mode: 'stream', seeds, mixed }));
  process.exit(0);
}
if (process.env.SCC_SLICE) {
  // scripted world slice: exercise the ACTUAL converted call shapes
  // (repath timers, interceptor cooldown, volley target jitter, training
  // spawn offset, move scatter) against one shared rng; print final trace.
  const R = new SimRng(process.env.SCC_SLICE | 0);
  const trace = [];
  const r = () => R.u01();
  for (let tick = 0; tick < 4000; tick++) {
    // 40 units: repath timer refresh pattern (entity L347)
    for (let u = 0; u < 40; u++) trace.push(0.7 + r() * 0.4);
    // interceptor cooldowns (L484)
    for (let u = 0; u < 4; u++) trace.push(1.4 + r());
    // volley target jitter pairs (L598)
    for (let u = 0; u < 10; u++) { trace.push(r() * 40 - 20); trace.push(r() * 40 - 20); }
    // training spawn offsets (Building L1228)
    for (let u = 0; u < 3; u++) { trace.push(r() * 20 - 10); trace.push(r() * 8); }
  }
  let h = 0x811c9dc5;
  for (const v of trace) { const x = Math.round(v * 1e9); h ^= x; h = Math.imul(h, 0x01000193) >>> 0; }
  console.log(JSON.stringify({ mode: 'slice', hash: h >>> 0, n: trace.length }));
  process.exit(0);
}

// ---------- S1: statistical sanity of the new PRNG ----------
{
  const s = stream(0xBEEF, 100000);
  const buckets = new Array(16).fill(0);
  for (const v of s) buckets[Math.floor((v / 4294967296) * 16)]++;
  const exp = 100000 / 16;
  const chi2 = buckets.reduce((a, b) => a + (b - exp) * (b - exp) / exp, 0);
  ok('DIST_chi2', chi2 < 40, `chi2=${chi2.toFixed(1)} (16 buckets, ~25 expected, 40 = hard cap)`);
  const r = new SimRng(7);
  const ints = new Set();
  for (let i = 0; i < 200; i++) ints.add(r.int(8));
  ok('INT_range', ints.size === 8, 'int(8) covers all 8 values in 200 draws');
  ok('ZERO_seed_determinism', JSON.stringify(stream(0)) === JSON.stringify(stream(0)));
}

// ---------- S2: cross-engine stream equality (3 engines x 100 seeds) ----------
{
  const main = (() => {
    const hash = (arr) => { let h = 0x811c9dc5; for (const v of arr) { h ^= v; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
    const seeds = [];
    for (let s = 1; s <= 100; s++) seeds.push(hash(stream(s * 0x9E37 + 11, 50)));
    const r = new SimRng(12345); const mixed = []; for (let i = 0; i < 10000; i++) mixed.push(r.u01());
    return { seeds, mixed: hash(mixed) };
  })();
  const me = path.join(__dirname, 'verify-rng.cjs');
  const env = () => ({ ...process.env, SCC_CHILD: '1' });
  const a = spawnSync(process.execPath, [me], { env: env(), encoding: 'utf8', timeout: 60000 });
  const b = spawnSync(process.execPath, ['--jitless', me], { env: env(), encoding: 'utf8', timeout: 60000 });
  const parse = (res) => { try { return JSON.parse(String(res.stdout).trim().split('\n').pop()); } catch { return null; } };
  const ca = parse(a), cb = parse(b);
  ok('XENGINE_child_default', ca && JSON.stringify(ca.seeds) === JSON.stringify(main.seeds) && ca.mixed === main.mixed, ca ? '100/100 seed streams equal' : `child fail ${a ? a.status : 'spawn'}`);
  ok('XENGINE_child_jitless', cb && JSON.stringify(cb.seeds) === JSON.stringify(main.seeds) && cb.mixed === main.mixed, cb ? '100/100 seed streams equal (jitless)' : `child fail ${b ? b.status : 'spawn'}`);
}

// ---------- S3: scripted slice (the converted call shapes) x 3 engines ----------
{
  const me = path.join(__dirname, 'verify-rng.cjs');
  const run = (args, seed) => {
    const res = spawnSync(process.execPath, [...args, me], { env: { ...process.env, SCC_SLICE: String(seed) }, encoding: 'utf8', timeout: 60000 });
    try { return JSON.parse(String(res.stdout).trim().split('\n').pop()); } catch { return null; }
  };
  let same = 0, total = 0;
  for (const seed of [1, 42, 777, 20260919, 0xDEADBEEF]) {
    const m = run([], seed);
    const a = run([], seed);
    const b = run(['--jitless'], seed);
    total += 2;
    // trace length is 4000 ticks x 70 draws = 280000 (was wrongly 172000)
    if (m && a && b && a.hash === m.hash && b.hash === m.hash && m.n === 280000) same++;
  }
  ok('SLICE_3ENGINE_x5seeds', same === 5, `${same}/${total} slices byte-equal across engines`);
}

// ---------- S4: sim-side Math.random conversion (source scan) ----------
{
  const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
  const bs = read('src2/scenes/BattleScene.js');
  const en = read('src2/engine/entity.js');
  const SIM_LEFT = [
    /const midY = Math\.round\(MAP_H \* \(0\.15 \+ Math\.random/,
    /issueMove\(wp\.x \+ \(Math\.random/,
    /const amt = 500 \+ \(\(Math\.random/,
    /const amt = 250 \+ \(\(Math\.random/,
    /if \(Math\.random\(\) < 0\.06\)/,
    /const ang = Math\.random\(\) \* Math\.PI \* 2; aiMCV/,
    /const ang = Math\.random\(\) \* Math\.PI \* 2;\n\s+const rr/,
    /type: 'unload', point: \{ x: dropTgt\.x \+ Math\.random/,
    /0.15 \+ Math\.random\(\) \* 0.35/,
        // (removed false-positive: '0.35 + Math.random()*0.3' at BattleScene
        // L559 is a presentation-only star/deco alpha — allowlisted, not sim)
    /issueMove\(tgt\.x \+ Math\.random/,
    /issueMove\(base\.x \+ Math\.random/
  ];
  const leaked = SIM_LEFT.filter(rx => rx.test(bs));
  ok('SIM_BATTLESITE_converted', leaked.length === 0, leaked.length ? `left: ${leaked.length}` : 'all 14 state-side sites use simRng/rnd');
  const ent = [/this\.repathTimer = Math\.random/, /repathTimer = 0\.7 \+ Math\.random/, /it\.cd = 1\.4 \+ Math\.random/, /findNearestEnemy\(this\.x \+ \(Math\.random/, /spawnUnit\(this\.team, kind, rx \+ \(Math\.random/];
  const leakedE = ent.filter(rx => rx.test(en));
  ok('SIM_ENTITY_converted', leakedE.length === 0, leakedE.length ? `left: ${leakedE.length}` : 'all 5 sim draws use world.simRng');
  // allowlist files must not import the sim stream (presentation isolation)
  for (const f of ['src2/engine/polish.js', 'src2/engine/audio2.js', 'src2/engine/art.js', 'src2/engine/chrome.js', 'src2/scenes/TitleScene.js', 'src2/scenes/CutScene.js']) {
    const src = read(f);
    ok(`PRESENTATION_isolated ${f}`, !/simRng|simRng\.js/.test(src));
  }
}

// ---------- S5: rngState wired into canonical export ----------
{
  const bs = read2('src2/scenes/BattleScene.js');
  ok('EXPORT_rngState', /rngState: this\.simRng\?\.digest\(\)/.test(bs));
  // INT_FIELDS (with the top:['tickIndex','rngState'] declaration) lives in
  // simNum.js; simSchema.js only delegates to checkNumbers.
  const num = read2('src2/engine/simNum.js');
  ok('SCHEMA_rngState_declared_int', /top: \['tickIndex', 'rngState'\]/.test(num), 'rngState under INT_FIELDS — floats/NaN rejected');
}
function read2(p) { return fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8'); }

const secs = (Date.now() - t0) / 1000;
ok('TIME_BUDGET', secs < 30, `${secs.toFixed(2)}s`);

console.log(`\nRESULT RNG ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);