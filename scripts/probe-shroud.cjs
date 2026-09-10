const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const g = window.__SCC2; const sm = g.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 6000));
    const hd = sm.getScene('Hud'); const bs = sm.getScene('Battle');
    const seenCount = bs.seen.reduce((a, v) => a + v, 0);
    hd._shroudAt = -9; hd.drawShroud(bs);
    const src = g.textures.get('mm_shroud').getSourceImage();
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    const res = src.width / 160;
    let ax = -1, ay = -1;
    for (let i = 0; i < bs.seen.length; i++) if (bs.seen[i]) { ax = i % 160; ay = (i / 160) | 0; break; }
    const near = ax >= 0 ? x.getImageData(Math.floor(ax * res), Math.floor(ay * res), 1, 1).data : null;
    const far = x.getImageData(156, 156, 1, 1).data;
    const sameCanvas = src === hd._mmShroudCv;
    return { seenCount, ax, ay, res, srcW: src.width, sameCanvas, near: near ? [near[0], near[3]] : null, farA: far[3], cvA: x.getImageData(0, 0, 1, 1).data[3] };
  });
  console.log(JSON.stringify(r));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
