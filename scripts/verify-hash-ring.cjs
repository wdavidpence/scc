// P1.036 gate: per-tick canonical state hashing.
// T0 (Node): canonicalize/hashState are insertion-order invariant (ticket
//     DONE-WHEN) + content-sensitive, verified on the live module in Node.
// T1 (browser): the live ring records the FINISHED tick; byte-identical
//     across identical runs at two render granularities (1 tick/step and
//     2 half-steps/tick) — sim time equal, so hashes must be equal.
// T2 (browser): a mutation injected when simTickIndex hits 500 diverges at
//     EXACTLY ring index 500 (usable first-divergent-tick oracle for P1.037).
// Run: SCC_URL=http://127.0.0.1:4177/scc/ node scripts/verify-hash-ring.cjs
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));

const TICK_MS = 1000 / 24;

async function nodeT0() {
  const { canonicalize, hashState, serialize } = await import('./stubs/node-import-schem.mjs');
  const mk = (flip) => serialize({
    tickIndex: 7, rngState: 11,
    terrain: { w: 2, h: 2, tileSize: 2, solid: [0, 1, 0, 0], ramp: [0, 0, 0, 0] },
    players: [], buildings: [], projectiles: [], orders: [],
    units: flip
      ? [{ y: 20, hp: 5, x: 10, id: 1 }, { y: 40, hp: 6, x: 30, id: 2 }]
      : [{ id: 1, x: 10, y: 20, hp: 5 }, { id: 2, x: 30, y: 40, hp: 6 }],
  });
  const t = [mk(false), mk(true)];
  const other = mk(false); other.units[1].hp = 6.0001;
  return {
    canonEq: canonicalize(t[0]) === canonicalize(t[1]),
    hashEq: hashState(t[0]) === hashState(t[1]),
    neq: hashState(other) !== hashState(t[0]),
  };
}

async function ringRun(browser, { granularity, ticks, mutateAt }) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 160)); });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  const setup = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 300));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    const bs = sm.getScene('Battle');
    if (!bs) return { err: 'NO_BATTLE_INSTANCE' };
    bs.__manual = true;
    const t0 = performance.now();
    while (performance.now() - t0 < 15000) {
      if (bs.simRng && bs.units && bs.units.length) break;
      await new Promise(r => setTimeout(r, 25));
    }
    if (!bs.simRng) return { err: 'CREATE_STALL' };
    const mk = (team, kinds, x0, y0) => {
      kinds.forEach((k, i) => bs.spawnUnit(team, k, x0 + (i % 4) * 26, y0 + Math.floor(i / 4) * 24, { arriveReady: true }));
    };
    mk(0, ['marine', 'marine', 'tank', 'wraith', 'incinerator', 'ballista', 'tank', 'wraith'], 1180, 620);
    mk(1, ['skarnling', 'skarnling', 'razorspine', 'vexwing', 'skarnling', 'razorspine', 'vexwing', 'skarnling'], 1290, 620);
    return { ok: true };
  });
  if (setup.err) { await p.close(); return { err: setup.err, errs }; }
  const r = await p.evaluate(([gran, ticks, mutateAt]) => {
    const s = window.__SCC2.scene.getScene('Battle');
    s.__collectHashes = true; s.__hashEvery = 1; s.hashRing = [];
    const dbg = {};
    if (mutateAt != null) {
      let done = false;
      while (s.simTickIndex < ticks) {
        if (!done && s.simTickIndex >= mutateAt) {
          const u = s.units.find(u => !u.dead);
          dbg.aliveAtMutate = s.units.filter(u => !u.dead).length;
          // Unit.x is a GETTER over container.x (entity.js), so mutate the
          // container — u.x = ... is a silent no-op (no setter).
          if (u) { u.container.x += 0.5; u.container.y += 0.25; dbg.did = 'container.x+0.5'; }
          else { s.simRng.s[0] = (s.simRng.s[0] ^ 0x5f3759df) | 0; dbg.did = 'rng.perturb'; }
          done = true;
        }
        s.__step(gran);
      }
    } else {
      // drive by SIM TIME: half-granularity makes 2x the calls but covers
      // the same 720 ticks — pace-independence, not a speed difference.
      const steps = Math.round(ticks * (1000 / 24) / gran);
      for (let i = 0; i < steps; i++) s.__step(gran);
    }
    return { ring: s.hashRing, tick: s.simTickIndex, dbg };
  }, [granularity, ticks, mutateAt ?? null]);
  await p.close();
  return { ...r, errs };
}

(async () => {
  const t0 = await nodeT0();
  const b = await chromium.launch();
  const A = await ringRun(b, { granularity: TICK_MS, ticks: 720 });
  const B = await ringRun(b, { granularity: TICK_MS / 2, ticks: 720 });
  const C = await ringRun(b, { granularity: TICK_MS, ticks: 720, mutateAt: 500 });
  await b.close();

  let pass = 0, fail = 0;
  const ok = (id, cond, note) => { if (cond) { pass++; console.log(`PASS ${id}${note ? ' :: ' + note : ''}`); } else { fail++; console.log(`FAIL ${id}${note ? ' :: ' + note : ''}`); } };
  const full = (r) => r.ring && r.ring.length >= 700 && r.ring.every(h => typeof h === 'number');
  ok('CANON-INSERTION-INVARIANT', t0.canonEq);
  ok('HASH-INSERTION-INVARIANT', t0.hashEq);
  ok('HASH-CONTENT-SENSITIVE', t0.neq, '0.0001 hp diff must change hash');
  ok('RING-FULL-COVERAGE', full(A) && full(B) && full(C), `lens ${A.ring && A.ring.length}/${B.ring && B.ring.length}/${C.ring && C.ring.length}, ticks ${A.tick}/${B.tick}/${C.tick}`);
  ok('RING-DUAL-PACE-IDENTITY', JSON.stringify(A.ring) === JSON.stringify(B.ring), '720-deep ring identical at 1x and 0.5x render granularity');
  let i = 0; const T = A.ring, M = C.ring;
  if (T && M) while (i < Math.min(T.length, M.length) && T[i] === M[i]) i++;
  ok('MUTATION-FIRST-DIFF-AT-500', i === 500, `firstDiff=${i} (injected at tick 500)`);
  const errs = (A.errs || []).concat(B.errs || [], C.errs || []);
  ok('NO-PAGE-ERRORS', errs.length === 0, errs.slice(0, 2).join(';').slice(0, 160));
  console.log(`RESULT HASH-RING ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
