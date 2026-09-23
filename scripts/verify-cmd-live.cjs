// P1.027-i3 GATE (live, manual-clock): command-queue wiring in BattleScene.
// Proves the LIVE scene honors queue semantics: enqueue never executes;
// commands execute at the next fixed-tick drain; stop cancels a running
// move; pause purges the pre-pause backlog (epoch bump); during-pause
// commands survive and execute on resume; zero page errors.
// Run: SCC_URL=http://127.0.0.1:4177/scc/ node scripts/verify-cmd-live.cjs
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 250));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    const bs = sm.getScene('Battle');
    await new Promise(r => setTimeout(r, 250));
    bs.__manual = true;
    const step = (n) => { for (let i = 0; i < n; i++) bs.__step(1000 / 24); };
    const mk = (x) => bs.spawnUnit(0, 'marine', x, 300, { arriveReady: true });
    const m1 = mk(300), m2 = mk(320);
    const out = {};
    // T1 enqueue-never-executes + tick-boundary exec
    bs.__cmd('order', { wp: { x: 700, y: 300 }, shift: false, alt: false, sel: [m1.id, m2.id] });
    out.enqueuedNotRun = m1.state !== 'move';
    step(1);
    out.execAtTick = m1.state === 'move' && m2.state === 'move';
    step(240);
    out.marched = m1.x > 380;
    // T2 stance via queue
    bs.selection = new Set([m1, m2]);
    bs.__cmd('stance', { stance: 'hold', sel: [m1.id, m2.id] });
    step(1);
    out.stance = m1.stance === 'hold' && m2.stance === 'hold';
    // T3 stop cancels running move
    m1.issueMove(700, 600); step(5);
    const wasMoving = m1.state === 'move' && m1.moving;
    bs.__cmd('stop', { sel: [m1.id] });
    step(40);
    out.stopCancel = wasMoving && !m1.moving;
    // T4 pause purge: pre-pause backlog must NOT execute after resume
    const m3 = mk(200);
    bs.__cmd('order', { wp: { x: 640, y: 200 }, shift: false, alt: false, sel: [m3.id] });
    bs.togglePause(); // epoch bump purges backlog
    bs.paused = false;
    step(1); // one drain happens with the purged queue
    out.pausePurge = m3.state !== 'move';
    // T5 during-pause command executes on resume (new-epoch survives)
    const m4 = mk(210);
    bs.paused = true;
    bs.__cmd('order', { wp: { x: 650, y: 210 }, shift: false, alt: false, sel: [m4.id] });
    bs.paused = false;
    step(2);
    out.duringPauseExecOnResume = m4.state === 'move';
    return out;
  });
  let pass = 0, fail = 0;
  const ok = (id, cond) => { if (cond) { pass++; console.log(`PASS ${id}`); } else { fail++; console.log(`FAIL ${id}`); } };
  ok('ENQUEUED-NOT-RUN', r.enqueuedNotRun);
  ok('EXEC-AT-TICK', r.execAtTick);
  ok('MARCHED', r.marched);
  ok('STANCE', r.stance);
  ok('STOP-CANCEL', r.stopCancel);
  ok('PAUSE-PURGE', r.pausePurge);
  ok('DURING-PAUSE-EXEC', r.duringPauseExecOnResume);
  ok('NO-PAGE-ERRORS', errs.length === 0, errs.join(';').slice(0, 200));
  console.log(`RESULT CMD-LIVE ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();