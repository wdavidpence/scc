// v263b: why does left-edge sky column survive floodKey on ai-rock2?
// Replicate the exact floodKey pass on the live texture and trace seed at (0,34).
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
  const res = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const k = "ai-rock2";
    const src = bt.textures.get(k).getSourceImage();
    const W = src.width, H = src.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
    const d = x.getImageData(0, 0, W, H); const p = d.data;
    const isSky = (i) => {
      const r = p[i * 4], g = p[i * 4 + 1], bb = p[i * 4 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * bb;
      const sat = Math.max(r, g, bb) - Math.min(r, g, bb);
      return bb >= r - 4 && sat < 60 && lum > 24;
    };
    // sample the reported residual coords + neighbors
    const rows = [];
    for (const [px, py] of [[0,34],[1,34],[2,34],[3,34],[4,34],[0,38],[2,38],[0,20],[0,50]]) {
      const i = py * W + px;
      rows.push({ px, py, rgba: [p[i*4],p[i*4+1],p[i*4+2],p[i*4+3]], isSky: isSky(i) });
    }
    // count how many edge-column sky pixels exist at all in current texture
    let edgeSky = 0, edgeAny = 0;
    for (let py = 0; py < H; py++) {
      for (const px of [0, 1, W-2, W-1]) {
        const i = py * W + px;
        if (p[i*4+3] > 40) { edgeAny++; if (isSky(i)) edgeSky++; }
      }
    }
    return { W, H, rows, edgeAny, edgeSky };
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
