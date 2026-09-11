// v2.53 triage #2: gate-style direct boot, capture full + left-edge + top-right crops.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 5000));
    const bt = window.__SCC2.scene.getScene('Battle');
    const mcv = bt.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = bt.minerals[0];
      if (min) {
        for (let r = 2; r < 14; r++) { for (const dd of [[r,0],[-r,0],[0,r],[0,-r]]) { if (bt.placementValid(pd, min.x + dd[0]*16, min.y + dd[1]*16)) { mcv.setPos(min.x + dd[0]*16, min.y + dd[1]*16); r = 99; break; } } }
      }
      bt.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 2000));
    }
    // stop cam drift so crops are stable
    if (bt.polish._camTween && bt.polish._camTween.tw) bt.polish._camTween.tw.stop();
    if (bt.polish._zoomTween) bt.polish._zoomTween.stop();
  });
  const cam = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const c = bt.cameras.main;
    return { sx: Math.round(c.scrollX), sy: Math.round(c.scrollY), zoom: c.zoom, cw: c.width, ch: c.height, bx: c.bounds.x, by: c.bounds.y, bw: c.bounds.width, bh: c.bounds.height };
  });
  console.log('CAM', JSON.stringify(cam));
  await p.screenshot({ path: '/tmp/v253_triage.png' });
  await p.screenshot({ path: '/tmp/v253_leftedge.png', clip: { x: 0, y: 0, width: 90, height: 900 } });
  await p.screenshot({ path: '/tmp/v253_topright.png', clip: { x: 900, y: 0, width: 540, height: 320 } });
  console.log('ERRS', errs.length ? errs.slice(0, 3).join('|') : 'NONE');
  await b.close();
})().catch(e => { console.error('FATAL', String(e)); process.exit(2); });
