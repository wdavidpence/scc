const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
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
  });
  await p.mouse.move(30, 60, { steps: 2 });
  for (let i = 0; i < 6; i++) {
    await p.evaluate(() => { const bt = window.__SCC2.scene.getScene('Battle'); const ap = bt.input.activePointer; const u = bt.units.find(u => u.team === 0 && !u.dead); if (u) { u.order = null; u.path = []; u.setPos(ap.worldX, ap.worldY); } });
    await p.mouse.move(31, 60); await p.mouse.move(30, 60);
    await p.waitForTimeout(180);
    const st = await p.evaluate(() => {
      const bt = window.__SCC2.scene.getScene('Battle');
      const h = window.__SCC2.scene.getScene('Hud');
      const tb = bt._hoverTip.getBounds(); const ob = h.objText.getBounds();
      return { a: bt._hoverTip.alpha, tx: Math.round(tb.x), ty: Math.round(tb.y), tr: Math.round(tb.right), obx: Math.round(ob.x), obr: Math.round(ob.right), oby: Math.round(ob.y), obb: Math.round(ob.bottom) };
    });
    console.log('STATE', JSON.stringify(st));
    if (st.a > 0) {
      const clear = !(st.tr > st.obx && st.tx < st.obr && st.ty + 4 < st.obb && st.ty > st.oby - 20);
      console.log('NUMERIC_CLEAR', clear);
      break;
    }
  }
  await p.screenshot({ path: '/tmp/v2531_corner2.png', clip: { x: 0, y: 20, width: 480, height: 200 } });
  await b.close();
})().catch(e => { console.error('FATAL', String(e)); process.exit(2); });
