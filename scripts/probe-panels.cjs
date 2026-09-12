// probe world children in screen region x:1180-1440 y:270-675 (of 1440x900 cam)
const path = require('path');
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
  });
  const res = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cam = bt.cameras.main;
    const hits = [];
    const visit = (o, trail) => {
      if (!o || o.visible === false) return;
      const b = o.getBounds ? o.getBounds() : null;
      const wx = o.x, wy = o.y;
      const sp = cam.getWorldTransform ? null : null;
      const sx = (wx - cam.scrollX) * cam.zoom, sy = (wy - cam.scrollY) * cam.zoom;
      const wsc = o.scaleX || (o.width || 0);
      let sw = 0, sh = 0;
      if (o.width && o.height) { sw = o.width * (o.scaleX || 1) * cam.zoom; sh = o.height * (o.scaleY || 1) * cam.zoom; }
      if (sx > 1150 && sx < 1460 && sy > 250 && sy < 690 && sw > 40 && sh > 40) {
        hits.push({ type: o.type, key: o.texture ? o.texture.key : undefined, depth: o.depth, alpha: +((o.alpha || 0)).toFixed(2), blend: o.blendMode, sx: Math.round(sx), sy: Math.round(sy), sw: Math.round(sw), sh: Math.round(sh), sf: o.scrollFactorX, parent: trail });
      }
      if (o.list) for (const c of o.list) visit(c, trail + '>' + (o.type || '?'));
    };
    for (const o of bt.children.list) visit(o, 'bt');
    return hits.slice(0, 30);
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
