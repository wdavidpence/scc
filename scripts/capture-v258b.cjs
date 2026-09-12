// v2.58b capture: combat squad close shot for crispness compare
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join('/Users/davidpence/.hermes/node/lib/node_modules', 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 5000));
    const bt = window.__SCC2.scene.getScene('Battle');
    if (bt.polish) bt.polish._cheap = () => true;
    const mid = bt.cameras.main.midPoint;
    for (let i = 0; i < 6; i++) bt.spawnUnit(0, 'marine', mid.x - 90 + i * 22, mid.y - 30 + (i % 2) * 18, { arriveReady: true });
    for (let i = 0; i < 5; i++) bt.spawnUnit(1, 'skarling', mid.x + 100 + i * 18, mid.y + 6 + (i % 3) * 12, { arriveReady: true });
    const mine = bt.units.filter(u => u && !u.dead && u.team === 0 && !u.def.worker);
    const foes = bt.units.filter(u => u && !u.dead && u.team === 1);
    for (const u of mine) { const f = foes[Math.floor(Math.random() * foes.length)]; if (f) bt.issueGroupMove([u], f.x, f.y, true); }
  });
  await p.waitForTimeout(3500);
  const du = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(i => r(i.src))));
  fs.writeFileSync('qa-shots/wow257/08-combat-v260.png', Buffer.from(du.split(',')[1], 'base64'));
  console.log('captured');
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 200)); process.exit(1); });
