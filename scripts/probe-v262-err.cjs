// diag: full stack of the drawImage-null error on Battle->Title return
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERR_FULL', String(e.stack || e).slice(0, 800)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 5000));
  });
  console.log('--- triggering gameover + click return ---');
  await p.evaluate(() => { window.__SCC2.scene.getScene('Battle').endGame('victory'); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); h.gameOver = h.gameOver || 'victory'; });
  await p.mouse.click(700, 450);
  await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({ scenes: window.__SCC2.scene.getScenes(true).map(s => s.scene.key) }));
  console.log('ACTIVE_AFTER', JSON.stringify(st));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
