// v2.63 EDGE SCRUB gate: cool painted-sky ring gone, art bodies intact.
// 1 KEYCUT_RAN  2 RING_CLEAN (per-key sky ring <5%)  3 BODY_INTACT
// 4 FLANK_1PX_ALIVE (it's 1px feather, not eaten art)  5 LIVE_SCENE_OK
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
const KEYS = ['ai-rock0', 'ai-rock1', 'ai-rock2', 'ai-minerals', 'ai-geyser'];
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
  const res = await p.evaluate((KEYS) => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const out = { keycutN: bt._keycutN || 0, tex: {}, rocks: [] };
    for (const k of KEYS) {
      if (!bt.textures.exists(k)) continue;
      const src = bt.textures.get(k).getSourceImage();
      const W = src.width, H = src.height;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
      const d = x.getImageData(0, 0, W, H).data;
      let ringN = 0, skyN = 0, coreN = 0, coreTot = 0;
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const i = (py * W + px) * 4;
        const a = d[i + 3];
        const inRing = px < 2 || py < 2 || px >= W - 2 || py >= H - 2;
        if (inRing) {
          ringN++;
          const r = d[i], g = d[i + 1], bb = d[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * bb;
          if (a > 40 && bb >= r && lum > 28) skyN++;
        } else {
          const cx = px > W * 0.25 && px < W * 0.75, cy = py > H * 0.25 && py < H * 0.75;
          if (cx && cy) { coreTot++; if (a > 100) coreN++; }
        }
      }
      // flank edge-center at depth 1 (was 129 pre-fix)
      let flank1 = 0;
      for (let px = (W / 3) | 0; px < (W * 2 / 3) | 0; px++) { flank1 = Math.max(flank1, d[(1 * W + px) * 4 + 3]); flank1 = Math.max(flank1, d[((H - 2) * W + px) * 4 + 3]); }
      for (let py = (H / 3) | 0; py < (H * 2 / 3) | 0; py++) { flank1 = Math.max(flank1, d[(py * W + 1) * 4 + 3]); flank1 = Math.max(flank1, d[(py * W + W - 2) * 4 + 3]); }
      out.tex[k] = { skyPct: +(100 * skyN / ringN).toFixed(1), corePct: +(100 * coreN / Math.max(1, coreTot)).toFixed(1), flank1MaxA: flank1 };
      if (/^ai-rock/.test(k)) out.rocks.push({ k, skyPct: +(100 * skyN / ringN).toFixed(1) });
    }
    return out;
  }, KEYS);
  const R = [];
  const ck = (id, ok, info) => { R.push({ id, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + id, JSON.stringify(info || {})); };
  ck('KEYCUT_RAN', res.keycutN >= 5, { n: res.keycutN });
  const ringOK = KEYS.every(k => !res.tex[k] || res.tex[k].skyPct < 5);
  ck('RING_CLEAN', ringOK, Object.fromEntries(KEYS.map(k => [k, res.tex[k] && res.tex[k].skyPct])));
  // floors calibrated to each bake's natural core density (rocks dense, rock1/geyser sparse FX art)
  const FLOOR = { 'ai-rock0': 40, 'ai-rock1': 8, 'ai-rock2': 40, 'ai-minerals': 40, 'ai-geyser': 15 };
  const bodyOK = KEYS.every(k => !res.tex[k] || res.tex[k].corePct > FLOOR[k]);
  ck('BODY_INTACT', bodyOK, Object.fromEntries(KEYS.map(k => [k, res.tex[k] && res.tex[k].corePct])));
  const flankOK = KEYS.every(k => !res.tex[k] || res.tex[k].flank1MaxA < 160);
  ck('FLANK_1PX_ALIVE', flankOK, Object.fromEntries(KEYS.map(k => [k, res.tex[k] && res.tex[k].flank1MaxA])));
  const sceneOK2 = errs.length === 0;
  ck('LIVE_SCENE_OK', sceneOK2, { errs: errs.slice(0, 2) });
  const pass = R.filter(r => r.ok).length;
  console.log(`GATE-V263 ${pass}/${R.length} ${pass === R.length ? 'PASS' : 'FAIL'}`);
  await p.screenshot({ path: "/tmp/v263-battle.png" });
  await b.close();
  process.exit(pass === R.length ? 0 : 1);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
