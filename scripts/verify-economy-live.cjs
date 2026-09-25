// ACCEPTANCE: the exact user complaint — "riggeres can't go back and forth
// and mine and load and unload; they run into each other and get stuck".
// Plays like a real player: start match, deploy MCV (D), queue 4 riggers
// from the command center (click-free: direct queueUnit, same as the panel),
// then WAIT 75 s of match time and assert the chain runs with zero micromanagement.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  const r1 = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 3000));
    const bt = sm.getScene('Battle');
    const mcv = bt.units.find(u => u.def.mcv && u.team === 0 && !u.dead);
    const dep = bt.deployMCV(mcv, true); // what the D key / Deploy button does
    await new Promise(r => setTimeout(r, 1500));
    const cc = bt.buildings.find(b2 => b2.team === 0 && b2.def.primary);
    let queued = 0;
    if (cc) for (let i = 0; i < 4; i++) if (cc.queueUnit('rigger')) queued++;
    return { deployed: !!dep, cc: !!cc, queued };
  });
  console.log('setup:', JSON.stringify(r1));
  const t0 = Date.now();
  await p.waitForTimeout(50000);
  const mid = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const ws = bt.units.filter(u => !u.dead && u.def.worker && u.team === 0);
    return { minerals: bt.players[0].minerals, workers: ws.length, states: ws.map(u => u.state + (u.cargo ? '+' + u.cargo : '')) };
  });
  console.log('after 50s:', JSON.stringify(mid));
  await p.waitForTimeout(50000); // hands-off again
  const r2 = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const ws = bt.units.filter(u => !u.dead && u.def.worker && u.team === 0);
    return {
      minerals: bt.players[0].minerals,
      workers: ws.length,
      states: ws.map(u => u.state + (u.cargo ? '+' + u.cargo : '')),
      moving: ws.map(u => !!u.moving).filter(Boolean).length,
      farFromAll: ws.filter(u => !u.order).length,
    };
  });
  console.log('after 100s:', JSON.stringify(r2));
  console.log('pageerrors:', errs.length, errs.slice(0, 2));
  await p.screenshot({ path: '/tmp/accept-base.png' });
  const pass = r1.deployed && mid.minerals > 100 && r2.minerals > mid.minerals + 60 && r2.workers >= 4;
  console.log(pass ? 'ACCEPTANCE PASS — chain runs hands-off' : 'ACCEPTANCE FAIL');
  await b.close();
  process.exit(pass ? 0 : 1);
})();