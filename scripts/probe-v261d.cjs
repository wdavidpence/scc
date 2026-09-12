// diag: does mm_shroud composite? paint it RED and check the framebuffer
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
  // paint entire shroud canvas RED
  await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const ctx = h._mmShroudCtx;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, h._mmShroudCv.width, h._mmShroudCv.height);
    h.textures.get('mm_shroud').refresh();
  });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const cx = Math.round(h.mmX + h.mmSize / 2), cy = Math.round(h.mmY + h.mmSize / 2);
    const i = (cy * cv.width + cx) * 4;
    return { red: [d[i], d[i + 1], d[i + 2]], mmX: h.mmX, mmY: h.mmY, mmSize: h.mmSize,
      imgTexKey: h.mmShroud.texture.key, srcIsCv: h.textures.get('mm_shroud').getSourceImage() === h._mmShroudCv };
  });
  console.log('REDTEST', JSON.stringify(r));
  await p.screenshot({ path: '/tmp/mm-red.png', clip: { x: 1234, y: 32, width: 206, height: 206 } });
  console.log('SHOT /tmp/mm-red.png');
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
