const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const g = window.__SCC2;
    const sm = g.scene;
    const hd = sm.getScene('Hud');
    return {
      hasNS: typeof g.add ? null : null,
      scenes: sm.scenes.map(s => s.scene.key + ':' + (s.scene.isActive() ? 'A' : s.scene.isPaused() ? 'P' : '-')),
      hud: !!hd,
      hasAddNS: hd ? typeof hd.add.nineSlice : 'nohud',
      topPanel: hd && hd.topPanel ? { native: hd.topPanel.native, type: hd.topPanel.obj.constructor.name } : null,
      cardPanel: hd && hd._cardPanel ? { native: hd._cardPanel.native, type: hd._cardPanel.obj.constructor.name } : null,
      chrPanel: g.textures.exists('chr-panel'),
      mmShroud: hd && hd.mmShroud ? { type: hd.mmShroud.constructor.name, tex: hd.mmShroud.texture.key } : null,
      shroudAt: hd ? hd._shroudAt : null,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  // second boot to reproduce duplicate-texture error
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 4000));
  });
  console.log('AFTER RESTART', await p.evaluate(() => window.__SCC2.scene.scenes.map(s => s.scene.key + ':' + (s.scene.isActive() ? 'A' : '-')).join(' ')));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
