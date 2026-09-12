// v2.63 probe: classify residual ring pixels AFTER the edge scrub runs.
// Replicates floodKey in-page, then dumps the surviving ring pixels' color stats
// and an alpha histogram so we can tune isSky.
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
    const out = {};
    // what applyAIKit recorded as the source key per ai-* texture
    out.map = window.__AIKIT_MAP || null;
    for (const k of ['ai-rock0', 'ai-rock2', 'ai-minerals']) {
      if (!bt.textures.exists(k)) continue;
      const src = bt.textures.get(k).getSourceImage();
      const W = src.width, H = src.height;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
      const d = x.getImageData(0, 0, W, H);
      const p = d.data;
      if (!p || p.length < W * H * 4) return out;
      // ring residual classification
      const buckets = {};
      const inRing = (px, py) => px < 2 || py < 2 || px >= W - 2 || py >= H - 2;
      let n = 0;
      const samples = [];
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        if (!inRing(px, py)) continue;
        const i = (py * W + px) * 4;
        const a = p[i + 3];
        if (a <= 40) continue;
        n++;
        const r = p[i], g = p[i + 1], bb = p[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * bb;
        const sat = Math.max(r, g, bb) - Math.min(r, g, bb);
        const tag = `a${Math.floor(a / 32) * 32} b${bb >= r ? 'ge' : 'lt'}r sat${sat < 26 ? 'lo' : 'hi'} lum${lum > 24 ? 'hi' : 'lo'}`;
        buckets[tag] = (buckets[tag] || 0) + 1;
        if (samples.length < 12) samples.push([px, py, r, g, bb, a]);
      }
      out[k] = { W, H, residN: n, buckets, samples };
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
