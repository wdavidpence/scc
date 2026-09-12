// diag: does blinding stick? shroud canvas vs composite vs live seen count
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
  // A: stamp zeros, report immediately + shroud canvas pixel
  const a = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    for (let ty = 0; ty < 160; ty++) for (let tx = 0; tx < 160; tx++) bt.seen[bt.nav.idx(tx, ty)] = 0;
    h._shroudAt = -99; h.drawShroud(bt);
    const seenSum = bt.seen.reduce((s, v) => s + v, 0);
    const sx = h._mmShroudCtx.getImageData(53, 50, 1, 1).data;
    return { seenSumA: seenSum, shroudPx: [sx[0], sx[1], sx[2], sx[3]] };
  });
  console.log('A', JSON.stringify(a));
  // B: 2s later, without touching anything
  await p.waitForTimeout(2000);
  const bb = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const seenSum = bt.seen.reduce((s, v) => s + v, 0);
    const sx = h._mmShroudCtx.getImageData(53, 50, 1, 1).data;
    return { seenSumB: seenSum, shroudPx: [sx[0], sx[1], sx[2], sx[3]] };
  });
  console.log('B', JSON.stringify(bb));
  // C: force repaint + composite probe at rock tile
  const c = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    h._shroudAt = -99; h.drawShroud(bt); h.drawMinimap(bt);
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const sc = cv.width / window.innerWidth;
    const tile = h.mmSize / 160;
    const cx = Math.round((h.mmX + 53 * tile + tile / 2) * sc);
    const cy = Math.round((h.mmY + 50 * tile + tile / 2) * sc);
    const i = (cy * cv.width + cx) * 4;
    return { compPx: [d[i], d[i + 1], d[i + 2]], mmX: h.mmX, mmY: h.mmY, mmSize: h.mmSize, sc, tile };
  });
  console.log('C', JSON.stringify(c));
  await p.waitForTimeout(1500);
  const dd = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const bt = window.__SCC2.scene.getScene('Battle');
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const sc = cv.width / window.innerWidth;
    const tile = h.mmSize / 160;
    const cx = Math.round((h.mmX + 53 * tile + tile / 2) * sc);
    const cy = Math.round((h.mmY + 50 * tile + tile / 2) * sc);
    const i = (cy * cv.width + cx) * 4;
    const sx = h._mmShroudCtx.getImageData(53, 50, 1, 1).data;
    const seenSum = bt.seen.reduce((s, v) => s + v, 0);
    return { compPx: [d[i], d[i + 1], d[i + 2]], shroudPx: [sx[0], sx[1], sx[2], sx[3]], seenSumD: seenSum };
  });
  console.log('D', JSON.stringify(dd));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
