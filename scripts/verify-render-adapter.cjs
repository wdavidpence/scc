// P1.033 render-adapter GATE (live, manual-clock harness).
// Ticket done-when: "disabling render has no simulation effect and enabling
// 144 Hz interpolation adds no state writes".
//
// IDENTITY family: one scripted skirmish (identical seed + spawn sequence)
// driven at three render cadences that differ ONLY in render-side behavior:
//   A tail-on, 2 render frames/tick (60 Hz equivalent)
//   B __renderOff — the whole __step render tail skipped (render disabled)
//   C __interp — tail on + 144 Hz interpolation pass (6 frames/tick)
// Oracle: full per-tick hash rings AND final exportSimState must be BYTE
// equal across A/B/C. Any render-clock state write breaks the pair.
//
// NON-VACUITY family: in render-off mode (no tail at all), the three
// state-writers that MOVED tick-side for this ticket must still fire —
// coach worker-park, skywarden brood-nest refuel, hold-objective settle.
// Plus: interp counters must show the pass actually painted nonzero offsets
// (an inert adapter would vacuously satisfy identity).
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
const TICK_MS = 1000 / 24;

async function newBattlePage(browser, { chunkFactor, tail = true, interp = false, probe = false }) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 160)); });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  const setup = await p.evaluate(async ([tailOn, interpOn]) => {
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
    if (!tailOn) bs.__renderOff = true;
    if (interpOn) { bs.__interp = true; bs.__ra = { frames: 0, painted: 0, paintedMoving: 0, maxOff: 0 }; }
    return { ok: true };
  }, [tail, interp]);
  return { p, errs, setup };
}

(async () => {
  const b = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (id, cond, note) => { if (cond) { pass++; console.log(`PASS ${id}`); } else { fail++; console.log(`FAIL ${id}${note ? ' :: ' + note : ''}`); } };

  const runIdentity = async (opts) => {
    const { p, errs, setup } = await newBattlePage(b, opts);
    if (setup.err) { await p.close(); return { err: setup.err, errs }; }
    const r = await p.evaluate(async ([chunkMs, totalMs]) => {
      const s = window.__SCC2.scene.getScene('Battle');
      const mk = (team, kinds, x0, y0) => {
        kinds.forEach((k, i) => s.spawnUnit(team, k, x0 + (i % 4) * 26, y0 + Math.floor(i / 4) * 24, { arriveReady: true }));
      };
      mk(0, ['marine', 'marine', 'tank', 'wraith', 'incinerator', 'ballista', 'tank', 'wraith'], 1180, 620);
      mk(1, ['skarnling', 'skarnling', 'razorspine', 'vexwing', 'skarnling', 'razorspine', 'vexwing', 'skarnling'], 1290, 620);
      s.__collectHashes = true;
      await new Promise(r => setTimeout(r, 50)); // let spawn effects settle before the compared window
      const units0 = s.units.length;
      let n = 0, acc = 0;
      while (acc < totalMs - 1e-9 && n < 1000000) { s.__step(chunkMs); acc += chunkMs; n++; }
      const st = s.exportSimState();
      return {
        chunks: n, tick: s.simTickIndex,
        ring: (s.hashRing || []).join('|'),
        state: typeof st === 'string' ? st : JSON.stringify(st),
        units0, alive: (s.units || []).filter(u => !u.dead).length,
        tp: s.__tp || 0,
        ra: s.__ra ? { ...s.__ra } : null,
      };
    }, [TICK_MS * opts.chunkFactor, 30000]);
    await p.close();
    return { ...r, errs };
  };

  console.log('--- identity family (fresh page per cadence) ---');
  const A = await runIdentity({ chunkFactor: 0.5, tail: true });
  const B = await runIdentity({ chunkFactor: 0.5, tail: false });
  const C = await runIdentity({ chunkFactor: 1 / 6, tail: true, interp: true });

  ok('RUNS-COMPLETE', A.ring && B.ring && C.ring, `A:${A.err || (A.ring || '').length} B:${B.err || (B.ring || '').length} C:${C.err || (C.ring || '').length}`);
  if (!(A.ring && B.ring && C.ring)) { console.log('RESULT RENDER-ADAPTER FAIL (setup)'); await b.close(); process.exit(1); }
  ok('RING-TAIL-OFF', A.ring === B.ring, `len ${A.ring.length}/${B.ring.length}, first diff at ${[...A.ring].findIndex((c, i) => c !== B.ring[i])}`);
  ok('RING-INTERP144', A.ring === C.ring, `len ${A.ring.length}/${C.ring.length}, first diff at ${[...A.ring].findIndex((c, i) => c !== C.ring[i])}`);
  ok('STATE-TAIL-OFF', A.state === B.state, 'final exportSimState forked under render-off');
  ok('STATE-INTERP144', A.state === C.state, 'final exportSimState forked under 144 Hz interp');
  ok('ATTRITION', A.units0 >= 16 && (A.units0 - A.alive) >= 8, `units ${A.units0}->${A.alive} (identity would be vacuous without combat)`);
  ok('TAIL-SKIP-PROOF', A.tp > 0 && B.tp === 0 && C.tp > 0, `tail passes A:${A.tp} B:${B.tp} C:${C.tp}`);
  ok('INTERP-PAINTED', !!C.ra && C.ra.frames > 500 && C.ra.paintedMoving > 500 && C.ra.maxOff > 1.5, `counters ${JSON.stringify(C.ra)}`);

  console.log('--- render-off writer probes (no tail; writers must still fire tick-side) ---');
  // one fresh battle page, render-off, three sequential probes on it
  const { p, errs, setup } = await newBattlePage(b, { chunkFactor: 0, tail: false });
  if (setup.err) { ok('PROBE-SETUP', false, setup.err); }
  else {
    const probes = await p.evaluate(() => {
      const s = window.__SCC2.scene.getScene('Battle');
      const out = {};
      // P1 coach worker-park: active coach without the harvest lesson done
      const w = s.spawnUnit(0, 'rigger', 900, 700, { arriveReady: true });
      w.setOrder({ type: 'harvest' });
      s.coach = { active: true, step: { tip: 'probe' }, _minedClick: false };
      for (let i = 0; i < 4; i++) s.__step(1000 / 24);
      out.park = { beforeFired: true, orderAfter: w.order, stateAfter: w.state };
      s.coach = null;
      // P2 skywarden refuel: at-cap supply + built enemy brood nest.
      // Deploy the enemy MCV first (RA start has vehicles only, no primary)
      // so we can reach the real Building class via its constructor.
      const emcv = s.units.find(u => u.team === 1 && u.def.mcv && !u.dead);
      if (emcv) s.deployMCV(emcv, true);
      const cc = s.buildings.find(bb => bb.team === 1 && !bb.dead);
      if (cc) {
        const Ctor = cc.constructor;
        const bn = new Ctor(s, 1, 'broodNest', cc.x + 120, cc.y, { instant: true });
        s.buildings.push(bn);
        s.players[1].supplyUsed = s.players[1].supplyCap; // >= cap - 1
        for (let i = 0; i < 4; i++) s.__step(1000 / 24);
        out.sky = { queue: (bn.queue || []).slice(0, 3) };
      } else out.sky = { missingEnemyPrimary: true };
      // P3 hold-objective settle: deadline already inside the drive window
      s.objectives = [{ id: 'hold', text: 'HOLD', done: false }];
      s._holdUntil = s.gameTime + 1.0;
      s._holdDone = false;
      for (let i = 0; i < 80; i++) s.__step(1000 / 24);
      out.hold = { done: s._holdDone, over: !!s.gameOver };
      out.tp = s.__tp || 0;
      return out;
    });
    ok('PROBE-PARK-FIRES', probes.park && probes.park.orderAfter === null && probes.park.stateAfter === 'idle', JSON.stringify(probes.park));
    ok('PROBE-SKYWARDEN-FIRES', probes.sky && (probes.sky.queue || []).some(q => (typeof q === 'string' ? q : q.kind) === 'skywarden'), JSON.stringify(probes.sky));
    ok('PROBE-HOLD-SETTLES', probes.hold && probes.hold.done === true, JSON.stringify(probes.hold));
    ok('PROBE-TAIL-REALLY-OFF', probes.tp === 0, `tail passes ${probes.tp}`);
    ok('NO-PAGE-ERRORS', errs.length === 0, errs.slice(0, 3).join('; ').slice(0, 200));
    await p.close();
  }

  console.log(`RESULT RENDER-ADAPTER ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();