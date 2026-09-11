const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    await new Promise(r => setTimeout(r, 6000));
  });
  for (let i = 0; i < 10; i++) {
    const r = await p.evaluate(() => {
      const bs = window.__SCC2.scene.getScene('Battle');
      const m = bs.units.find(u => u.team === 1 && u.def.mcv && !u.dead);
      if (!m) return { dead: true, t: +bs.gameTime.toFixed(1) };
      let bd = 1e9;
      for (const mm of bs.minerals) { if (mm.amount <= 0) continue; const d = Math.hypot(mm.x - m.x, mm.y - m.y); if (d < bd) bd = d; }
      return { t: +bs.gameTime.toFixed(1), pos: [Math.round(m.x), Math.round(m.y)], order: m.order ? m.order.type : null, moving: m.moving, depT: m._depT, minDistPx: Math.round(bd), minDistT: +(bd / 16).toFixed(1), deployable: m.deployable, primary: bs.buildings.some(x => x.team === 1 && x.def.primary && !x.dead), gameOver: bs.gameOver };
    });
    console.log(JSON.stringify(r));
    await p.waitForTimeout(3000);
  }
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
