// v2.63 audit: post-keycut residual sky in the edge ring of baked sprites.
// Flood removes corner-connected DARK; edgefade kills corners fully but mid-edge
// flanks survive at ~50% alpha. Metric: alpha census of a 2px border ring +
// blue-gray sky residual classification inside it.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
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
    const out = { keycutN: bt._keycutN || 0, tex: {} };
    for (const k of ['ai-rock0', 'ai-rock1', 'ai-rock2', 'ai-minerals', 'ai-geyser']) {
      if (!bt.textures.exists(k)) continue;
      const src = bt.textures.get(k).getSourceImage();
      const W = src.width, H = src.height;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
      const d = x.getImageData(0, 0, W, H).data;
      // ring = pixels within 2px of any border
      let ringN = 0, ringA = 0, ringMax = 0, skyN = 0, skyA = 0;
      const inRing = (px, py) => px < 2 || py < 2 || px >= W - 2 || py >= H - 2;
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        if (!inRing(px, py)) continue;
        const i = (py * W + px) * 4;
        const a = d[i + 3];
        ringN++; ringA += a; if (a > ringMax) ringMax = a;
        // sky residual: semi/opaque + cool blue-gray (b>spatter tan r)
        const r = d[i], g = d[i + 1], bb = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * bb;
        if (a > 40 && bb >= r && lum > 28) { skyN++; skyA += a; }
      }
      // mid-edge flank specifically: middle third of each edge
      let flankMax = 0;
      const edge = (px, py) => { const i = (py * W + px) * 4; if (d[i + 3] > flankMax) flankMax = d[i + 3]; };
      for (let px = (W / 3) | 0; px < (W * 2 / 3) | 0; px++) { edge(px, 0); edge(px, H - 1); }
      for (let py = (H / 3) | 0; py < (H * 2 / 3) | 0; py++) { edge(0, py); edge(W - 1, py); }
      out.tex[k] = { W, H, ringN, ringAvgA: +(ringA / ringN).toFixed(1), ringMaxA: ringMax,
        skyResidPct: +(100 * skyN / ringN).toFixed(1), flankMaxA: flankMax };
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  console.log('ERRS', JSON.stringify(errs.slice(0, 2)));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
