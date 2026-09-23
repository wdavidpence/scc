// inspect: are spawned sprites actually rendering my textures? And what are the boxes?
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const info = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 8000));
    const bt = sm.getScene('Battle');
    const u = bt.units.find(x => x.kind === 'marine') || bt.units.find(x => !x.dead);
    if (!u) return { err: 'no natural units after 8s', unitCount: bt.units?.length };
    bt.cameras.main.centerOn(u.x, u.y); bt.cameras.main.setZoom(4);
    const src = u.sprite.texture.getSourceImage();
    // count display list children types in unit container
    const kids = u.container.list.map(c => ({ type: c.type, key: c.texture ? c.texture.key : undefined, w: src.width }));
    return { kind: u.kind, key: u.sprite.texture.key, naturalW: src.width, naturalH: src.height, complete: src.complete, kids, pos: [Math.round(u.x), Math.round(u.y)], alpha: u.sprite.alpha, visible: u.sprite.visible, scale: u.sprite.scaleX };
  });
  console.log(JSON.stringify(info, null, 1));
  await p.waitForTimeout(900);
  await p.screenshot({ path: '/tmp/v267-single-unit.png' });
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });