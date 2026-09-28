// Smoke: replaySameMission via REAL R keypress on debrief.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const before = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 2500));
    const bt = sm.getScene('Battle');
    bt.tut = null;
    bt.endGame('defeat');
    await new Promise(r => setTimeout(r, 400));
    return { go: bt.gameOver, hasInitData: !!bt.__initData, hadUnits: bt.units.length };
  });
  await p.keyboard.press('KeyR');
  await p.waitForTimeout(1800);
  const after = await p.evaluate(() => {
    const sm = window.__SCC2.scene;
    const bt = sm.getScene('Battle');
    const hud = sm.getScene('Hud');
    return {
      battleActive: sm.isActive('Battle'),
      gameOver: bt ? bt.gameOver : 'GONE',
      units: bt ? bt.units.length : -1,
      timeFresh: bt ? Math.round(bt.gameTime) : -1,
      hudPanelGone: hud ? !hud.goPanel.visible : 'NO-HUD',
      pageErrs: window.__errs || null,
    };
  });
  console.log('before:', JSON.stringify(before));
  console.log('after-R:', JSON.stringify(after));
  console.log('pageerrors:', errs.length, errs.slice(0, 3));
  await p.screenshot({ path: '/tmp/replay-smoke.png' });
  await b.close();
})();
