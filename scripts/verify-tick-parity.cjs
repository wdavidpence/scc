// P1.029 golden-replay harness — tick-split invariance for the LIVE scene.
// Contract: for identical seed + identical tick sequence, the live scene's
// full exportSimState digest must be byte-identical regardless of how
// render time is chopped (24/48/96 fps equivalents). Natural rAF is frozen
// (update() checks __manual; zero natural ticks can slip in) and the clock
// is driven through __step() synchronously inside one page task.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));

const TICK_MS = 1000 / 24;
const TOTAL_MS = 30000; // ~720 sim ticks — seeded skirmish resolves inside window
const paces = [
  { name: 'T1x', chunk: TICK_MS },
  { name: 'T0.5x', chunk: TICK_MS / 2 },
  { name: 'T0.25x', chunk: TICK_MS / 4 },
];

(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const runs = [];
  const allErrs = [];
  for (const pc of paces) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 160)); });
    await p.goto(url, { waitUntil: 'networkidle' });
    // freeze-on-create: set __manual the instant Battle exists, before its
    // first update call, so no natural-rAF ticks enter the compared window
    const setup = await p.evaluate(async () => {
      const sm = window.__SCC2.scene;
      for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
      await new Promise(r => setTimeout(r, 300));
      sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
      const bs = sm.getScene('Battle');
      if (!bs) return { err: 'NO_BATTLE_INSTANCE' };
      bs.__manual = true;
      // wait (async, rAF blocked from ticking by __manual) until create ran
      const t0 = performance.now();
      while (performance.now() - t0 < 15000) {
        if (bs.simRng && bs.units && bs.units.length) break;
        await new Promise(r => setTimeout(r, 25));
      }
      if (!bs.simRng) return { err: 'CREATE_STALL', has: false };
      // Seed a real skirmish: identical scripted call sequence for every
      // pace, so rng consumption is identical too (P1.029 requirement).
      const mk = (team, kinds, x0, y0) => {
        kinds.forEach((k, i) => bs.spawnUnit(team, k, x0 + (i % 4) * 26, y0 + Math.floor(i / 4) * 24, { arriveReady: true }));
      };
      mk(0, ['marine', 'marine', 'tank', 'wraith', 'incinerator', 'ballista', 'tank', 'wraith'], 1180, 620);
      mk(1, ['skarnling', 'skarnling', 'razorspine', 'vexwing', 'skarnling', 'razorspine', 'vexwing', 'skarnling'], 1290, 620);
      return { ok: true, units: bs.units.length };
    });
    if (setup.err) { runs.push({ pace: pc.name, err: setup }); await p.close(); continue; }
    const r = await p.evaluate(([chunkMs, totalMs]) => {
      const s = window.__SCC2.scene.getScene('Battle');
      let n = 0, acc = 0;
      while (acc < totalMs - 1e-9 && n < 1000000) { s.__step(chunkMs); acc += chunkMs; n++; }
      const st = s.exportSimState();
      const ser = typeof st === 'string' ? st : JSON.stringify(st);
      let h = 0x811c9dc5;
      for (let i = 0; i < ser.length; i++) { h ^= ser.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return { chunks: n, tick: s.simTickIndex, hash: ('00000000' + h.toString(16)).slice(-8), units: (s.units || []).length, alive: (s.units || []).filter(u => !u.dead).length };
    }, [pc.chunk, TOTAL_MS]);
    runs.push({ pace: pc.name, ...r, errs: errs.length, errsSample: errs.slice(0, 3) });
    allErrs.push(...errs);
    await p.close();
  }
  await b.close();
  for (const r of runs) console.log(JSON.stringify(r));
  const same = runs.length === paces.length && runs.every(r => r.hash === runs[0].hash) && runs.every(r => r.tick === runs[0].tick);
  const fought = runs.every(r => r.units <= 12); // seeded 18 units: deaths are culled from the array; <12 proves kills
  const clean = allErrs.length === 0;
  console.log(same && clean && fought ? 'RESULT TICK-PARITY PASS 3/3' : 'RESULT TICK-PARITY FAIL same=' + same + ' fought=' + fought + ' errs=' + allErrs.length);
  process.exit(same && clean && fought ? 0 : 1);
})();
