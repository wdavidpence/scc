// isolate layers: capture right-edge region with fog/mist hidden vs shown
const path = require('path');
const fs = require('fs');
const pwPath = '/Users/davidpence/.hermes/node/lib/node_modules';
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
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
    // park camera where the artifact showed: center of map but shift right
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.cameras.main.centerOn(bt.cameras.main.midPoint.x + 140, bt.cameras.main.midPoint.y);
  });
  await p.waitForTimeout(1200);
  const shot = async (name) => {
    const du = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(i => r(i.src))));
    fs.writeFileSync('qa-shots/wow257/' + name, Buffer.from(du.split(',')[1], 'base64'));
    console.log('shot', name);
  };
  await shot('iso-fog-on.png');
  await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.fogImg.setVisible(false);
    if (bt.fogMistImg) bt.fogMistImg.setVisible(false);
  });
  await p.waitForTimeout(500);
  await shot('iso-fog-off.png');
  // children census of right-edge world coords: anything rectangle-shaped
  const census = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const out = [];
    const walk = (o, parent) => {
      if (!o || o.visible === false) return;
      const t = o.type || '';
      if ((t === 'Image' || t === 'Rectangle' || t === 'Sprite') && o.width * (o.scaleX || 1) > 60 && o.height * (o.scaleY || 1) > 60) {
        const sx = (o.x - bt.cameras.main.scrollX) * bt.cameras.main.zoom + bt.cameras.main.width / 2 - (bt.cameras.main.midPoint.x - bt.cameras.main.scrollX) * 0;
        out.push({ t, key: o.texture && o.texture.key, w: Math.round(o.width * (o.scaleX || 1)), h: Math.round(o.height * (o.scaleY || 1)), depth: o.depth, a: o.alpha, sf: o.scrollFactorX, wx: Math.round(o.x), wy: Math.round(o.y), parent });
      }
      if (o.list) for (const c of o.list) walk(c, parent + '>' + t);
    };
    walk(bt.children, 'root');
    const hud = window.__SCC2.scene.getScene('Hud');
    if (hud) walk(hud.children, 'hud');
    return out.filter(o => o.sf !== 0).sort((a, b) => b.depth - a.depth).slice(0, 25);
  });
  console.log(JSON.stringify(census, null, 1));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
