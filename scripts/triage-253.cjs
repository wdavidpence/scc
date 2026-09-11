// Clean boot screenshot for v2.53 glitch triage: no harness patches, natural RA start.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v253_triage.png';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  // natural RA start: click through title if present, else already in game
  const state = await p.evaluate(() => {
    const sm = window.__SCC2.scene;
    return { active: sm.getScenes(true).map(s => s.scene.key) };
  });
  console.log('SCENES', JSON.stringify(state));
  await p.waitForTimeout(6000);
  // report camera bounds/scroll so we know if edge-overhang is the bleed cause
  const cam = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    if (!bt) return null;
    const c = bt.cameras.main;
    return { sx: c.scrollX, sy: c.scrollY, zoom: c.zoom, bx: c._bounds ? { x: c._bounds.x, y: c._bounds.y, w: c._bounds.width, h: c._bounds.height } : null, mapPx: [window.__SCC2.MAP_W ? 1 : 0] };
  });
  console.log('CAM', JSON.stringify(cam));
  await p.screenshot({ path: shot });
  console.log('ERRS', errs.length ? errs.slice(0, 3).join('|') : 'NONE');
  await b.close();
})().catch(e => { console.error('FATAL', String(e)); process.exit(2); });
