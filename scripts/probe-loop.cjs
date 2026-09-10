const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 6000));
  });
  for (let i = 0; i < 3; i++) {
    const r = await p.evaluate(() => {
      const bs = window.__SCC2.scene.getScene('Battle');
      const seenCount = bs.seen ? bs.seen.reduce((a, v) => a + v, 0) : -1;
      return { t: +(bs.gameTime || 0).toFixed(1), seenCount, units: bs.units.length, mcvAlive: bs.units.some(u => u.def && u.def.mcv && !u.dead), active: bs.scene.isActive(), fogTimer: bs.fogTimer };
    });
    console.log(JSON.stringify(r));
    await p.waitForTimeout(1500);
  }
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
