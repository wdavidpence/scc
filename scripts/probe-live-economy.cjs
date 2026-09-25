// Live-build evidence probe: what do player workers actually do in the
// shipped game? + what do buildings render as? Screenshot + worker states.
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
  const st = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 60000)); // 60 s of real match time
    const bt = sm.getScene('Battle');
    const workers = bt.units.filter(u => !u.dead && u.def.worker && u.team === 0);
    return {
      workerStates: workers.map(u => ({ kind: u.kind, state: u.state, cargo: u.cargo, order: u.order && u.order.type, x: Math.round(u.x), y: Math.round(u.y) })),
      mineralsLeft: bt.minerals.length,
      playerMinerals: bt.players[0].minerals,
      buildings: bt.buildings.map(b2 => ({ id: b2.buildId, team: b2.team, tex: b2.sprite.texture.key, shadow: !!b2.shadow })),
      aiKitLoaded: bt.textures.exists('b-refinery-t0'),
    };
  });
  console.log(JSON.stringify(st, null, 1));
  console.log('pageerrors:', errs.length, errs.slice(0, 3));
  await p.screenshot({ path: '/tmp/flow-60s.png' });
  await b.close();
})();