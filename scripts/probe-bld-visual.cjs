// v2.69.2 check: real base on screen. Deploy MCV, wait for CC, screenshot
// at PLAY zoom (1.6) wide + zoomed, dump CC texture pixels.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const r1 = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 3000));
    const bt = sm.getScene('Battle');
    const mcv = bt.units.find(u => u.def.mcv && u.team === 0 && !u.dead);
    const dep = bt.deployMCV(mcv, true);
    await new Promise(r => setTimeout(r, 2500));
    const cc = bt.buildings.find(b2 => b2.team === 0 && b2.def.primary);
    return { dep: !!dep, cc: !!cc, ccTex: cc ? cc.sprite.texture.key : null, built: cc ? cc.constructionProgress : null };
  });
  console.log('deploy:', JSON.stringify(r1));
  // let a worker finish construction if one exists, then shoot
  await p.waitForTimeout(20000);
  await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cc = bt.buildings.find(b2 => b2.team === 0 && b2.def.primary);
    if (cc) { bt.cameras.main.centerOn(cc.x, cc.y); bt.cameras.main.setZoom(3.2); }
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: '/tmp/bld3d-zoom.png' });
  await p.evaluate(() => { window.__SCC2.scene.getScene('Battle').cameras.main.setZoom(1.6); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/bld3d-play.png' });
  const dump = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const src = bt.textures.get('b-commandCenter-t0').getSourceImage();
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    return c.toDataURL('image/png');
  });
  require('fs').writeFileSync('/tmp/bld-texture2.png', Buffer.from(dump.split(',')[1], 'base64'));
  console.log('done');
  await b.close();
})();