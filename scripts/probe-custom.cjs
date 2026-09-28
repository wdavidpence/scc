// Probe v3: C-key panel + boss timer, using only isActive (this Phaser build lacks getRunningScenes).
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const t1 = await p.evaluate(() => {
    const sm = window.__SCC2.scene;
    const ts = sm.getScene('Title');
    return { titleActive: sm.isActive('Title'), cutActive: sm.isActive('Cut'), hasTitle: !!ts, cmod: ts ? !!ts._cmod : 'NO-TITLE' };
  });
  console.log('start-state:', JSON.stringify(t1));
  await p.mouse.click(640, 400);
  await p.waitForTimeout(300);
  await p.keyboard.press('KeyC');
  await p.waitForTimeout(300);
  const t2 = await p.evaluate(() => {
    const ts = window.__SCC2.scene.getScene('Title');
    return { cmodAfterKey: ts ? !!ts._cmod : 'NO-TITLE', titleActive: window.__SCC2.scene.isActive('Title') };
  });
  console.log('after-C:', JSON.stringify(t2));
  const t3 = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    const ts = sm.getScene('Title');
    if (ts && ts._cmod) ts.closeCustomPanel();
    if (sm.isActive('Title')) sm.stop('Title');
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', mission: { n: 0, name: 'T', brief: 't', mods: { boss: 'custom' } } });
    await new Promise(r => setTimeout(r, 11000));
    const bt = sm.getScene('Battle');
    return { tick: bt.simTickIndex, time: Math.round(bt.gameTime), boss: bt.units.some(u => u.isBoss), timeScale: bt.timeScale, paused: bt.scene.isPaused('Battle') };
  });
  console.log('boss-window:', JSON.stringify(t3));
  await b.close();
})();
