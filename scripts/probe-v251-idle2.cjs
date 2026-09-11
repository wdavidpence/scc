// probe2: idle pin + manual hud:tick + manual refresh
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERR', String(e)));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 6000));
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const w = b.spawnUnit(0, 'rigger', b.cameras.main.midPoint.x, b.cameras.main.midPoint.y + 60, { arriveReady: true });
    Object.defineProperty(w, 'order', { get: () => null, set: () => {}, configurable: true });
    Object.defineProperty(w, 'state', { get: () => 'idle', set: () => {}, configurable: true });
    await new Promise(r => setTimeout(r, 400));
    // manual recompute mirror + manual refresh call
    const mirror = b.units.filter(u => !u.dead && u.team === 0 && u.def.worker && u.state === 'idle' && !u.order).length;
    let refreshOK = true;
    try { h.refresh(); } catch (e) { refreshOK = String(e); }
    await new Promise(r => setTimeout(r, 200));
    return { mirror, idleWorkers: b.players[0].idleWorkers, refreshOK, plateVis: h._idlePlate ? h._idlePlate.visible : null, txtVis: h.idleTxt ? h.idleTxt.visible : null, txt: h.idleTxt ? h.idleTxt.text : null };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => { console.error('CRASH', e); process.exit(2); });
