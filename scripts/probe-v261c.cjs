// diag: is mm_shroud actually rendering? screenshot + texture state
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
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
  const st = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const bt = window.__SCC2.scene.getScene('Battle');
    const tex = h.textures.exists('mm_shroud') ? h.textures.get('mm_shroud') : null;
    const seenSum = bt.seen.reduce((s, v) => s + v, 0);
    return {
      hasTex: !!tex,
      texKey: tex ? tex.key : null,
      srcW: tex ? tex.width : 0, srcH: tex ? tex.height : 0,
      imgTex: h.mmShroud ? h.mmShroud.texture.key : null,
      imgAlpha: h.mmShroud ? h.mmShroud.alpha : null,
      imgVisible: h.mmShroud ? h.mmShroud.visible : null,
      imgDepth: h.mmShroud ? h.mmShroud.depth : null,
      terrDepth: h.mmTerrain ? h.mmTerrain.depth : null,
      seenSum,
    };
  });
  console.log('STATE', JSON.stringify(st));
  await p.screenshot({ path: '/tmp/mm-region.png', clip: { x: 1234, y: 32, width: 206, height: 206 } });
  console.log('SHOT /tmp/mm-region.png');
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
