// unit art inspection: boot Battle, spawn representative unit kinds, screenshot at zoom
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4178/scc/';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 6000));
    const bt = sm.getScene('Battle');
    const kinds = ['rigger', 'marine', 'incinerator', 'medic', 'ghost', 'tank', 'duster', 'ballista', 'wraith', 'dropship', 'battlecruiser', 'skarling', 'razor', 'tremor', 'skywarden', 'airstinger', 'burrower', 'artificer'];
    kinds.forEach((k, i) => { try { bt.spawnUnit(0, k, 300 + (i % 6) * 40, 300 + ((i / 6) | 0) * 40, { arriveReady: true }); } catch (e) {} });
    bt.cameras.main.centerOn(380, 340);
    bt.cameras.main.setZoom(2.5);
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: '/tmp/v266-units-z25.png' });
  await p.evaluate(() => { const bt = window.__SCC2.scene.getScene('Battle'); bt.cameras.main.setZoom(1.2); bt.cameras.main.centerOn(400, 360); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: '/tmp/v266-units-z12.png' });
  console.log('ERRORS', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'NONE');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
