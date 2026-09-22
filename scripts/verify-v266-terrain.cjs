// v2.66 visual gate: hi-res mountain/rock sprites exist, ridges covered,
// screenshots taken at normal + zoomed views. Prints V266-GATE PASS/FAIL.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4178/scc/';
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
    await new Promise(r => setTimeout(r, 6000));
  });
  const checks = [];
  const info = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const mtnKeys = ['mtn-0', 'mtn-1', 'mtn-2', 'rock-hi0', 'rock-hi1', 'rock-hi2'];
    const out = { tex: {}, sprs: bt._mountainSprs ? bt._mountainSprs.length : -1, mtnCells: bt.mountains ? new Set(bt.mountains.map(m => m.join(','))).size : 0 };
    for (const k of mtnKeys) {
      if (!bt.textures.exists(k)) { out.tex[k] = 'MISSING'; continue; }
      const src = bt.textures.get(k).getSourceImage();
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
      const d = x.getImageData(0, 0, src.width, src.height).data;
      let opaque = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) opaque++;
      out.tex[k] = { w: src.width, h: src.height, opaquePct: +(100 * opaque / (d.length / 4)).toFixed(1) };
    }
    // pick ridge targets: a mountain cell near mid-map for screenshot
    const mid = bt.mountains.filter(m => m[1] > 44 && m[1] < 52 && m[0] > 40 && m[0] < 90);
    out.shots = [];
    if (mid.length) { const c = mid[(mid.length / 2) | 0]; out.shots.push({ name: 'wall', x: c[0] * 16 + 8, y: c[1] * 16 }); }
    const rt = bt.rockTiles[0]; if (rt) out.shots.push({ name: 'cluster', x: rt.tx * 16 + 8, y: rt.ty * 16 + 8 });
    out.shots.push({ name: 'field', x: bt.scene.scene.game.canvas.width / 2, y: 600, field: true });
    return out;
  });
  checks.push({ id: 'TEX', ok: Object.values(info.tex).every(v => v !== 'MISSING' && v.opaquePct > 25), info: info.tex });
  checks.push({ id: 'MTN_SPRITES', ok: info.sprs >= Math.floor(info.mtnCells / 3), info: { placed: info.sprs, cells: info.mtnCells } });
  for (const s of info.shots) {
    await p.evaluate((s) => {
      const bt = window.__SCC2.scene.getScene('Battle');
      bt.cameras.main.centerOn(s.x, s.y);
    }, s);
    await p.waitForTimeout(600);
    await p.screenshot({ path: `/tmp/v266-${s.name}-z1.png` });
    await p.evaluate(() => { window.__SCC2.scene.getScene('Battle').cameras.main.setZoom(2.2); });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `/tmp/v266-${s.name}-z22.png` });
    await p.evaluate(() => { window.__SCC2.scene.getScene('Battle').cameras.main.setZoom(1); });
  }
  const failed = checks.filter(c => !c.ok);
  console.log(JSON.stringify(checks, null, 1));
  console.log('ERRORS', errs.length ? JSON.stringify(errs.slice(0, 5)) : 'NONE');
  console.log(failed.length === 0 && errs.length === 0 ? 'V266-GATE PASS' : 'V266-GATE FAIL');
  await b.close();
  process.exit(failed.length === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
