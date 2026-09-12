// control: core alpha census WITHOUT the v2.63 second flood (pass1+edgefade only)
// vs WITH it — proves BODY_INTACT floors are bake-natural, not scrub damage.
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
  const res = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    // source PNGs live under /scc/assets/ai/
    const out = {};
    const run = (key, src) => {
      const W = src.width, H = src.height;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
      const p = x.getImageData(0, 0, W, H).data;
      const lum = (i) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const seen = new Uint8Array(W * H); const stack = [];
      const push = (px, py) => {
        if (px < 0 || py < 0 || px >= W || py >= H) return;
        const i = py * W + px; if (seen[i]) return; if (lum(i * 4) > 30) return;
        seen[i] = 1; stack.push(i);
      };
      for (let px = 0; px < W; px++) { push(px, 0); push(px, H - 1); }
      for (let py = 0; py < H; py++) { push(0, py); push(W - 1, py); }
      while (stack.length) { const i = stack.pop(); const px = i % W, py = (i / W) | 0; push(px+1,py); push(px-1,py); push(px,py+1); push(px,py-1); }
      for (let i = 0; i < W * H; i++) if (seen[i]) p[i * 4 + 3] = 0;
      // edgefade (no scrub2)
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const i = py * W + px; if (p[i*4+3] === 0) continue;
        const nx = (px / (W - 1)) * 2 - 1, ny = (py / (H - 1)) * 2 - 1;
        const rr = Math.sqrt(nx * nx * 0.75 + ny * ny);
        const k = Math.min(1, Math.max(0, (rr - 0.55) / 0.45));
        p[i * 4 + 3] = Math.round(p[i * 4 + 3] * (1 - k * k));
      }
      let coreN = 0, coreTot = 0;
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        if (px > W * 0.25 && px < W * 0.75 && py > H * 0.25 && py < H * 0.75) { coreTot++; if (p[(py*W+px)*4+3] > 100) coreN++; }
      }
      return +(100 * coreN / Math.max(1, coreTot)).toFixed(1);
    };
    const map = { 'ai-rock0': 'rock0.png', 'ai-rock1': 'rock1.png', 'ai-rock2': 'rock2.png', 'ai-minerals': 'minerals.png', 'ai-geyser': 'geyser.png' };
    const load = (u) => new Promise((res2, rej) => { const im = new Image(); im.onload = () => res2(im); im.onerror = rej; im.src = u; });
    for (const [k, f] of Object.entries(map)) {
      try { const im = await load('/scc/assets/ai/' + f); out[k] = run(k, im); } catch (e) { out[k] = 'ERR ' + String(e).slice(0,60); }
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
