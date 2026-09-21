// Probe: what does a player see & have at mission start?
const { chromium } = require('playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4178/scc/';
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) { if (s.scene.key !== 'Boot' && s.scene.key !== 'Preload') sm.stop(s.scene.key); }
    sm.start('Hud', { race: 'terran' });
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'easy' });
  });
  await page.waitForFunction(() => { const b = window.__SCC2.scene.getScene('Battle'); return b && b.units && b.units.length > 0; }, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cam = b.cameras.main;
    const vw = { x: cam.worldView.x, y: cam.worldView.y, w: cam.worldView.width, h: cam.worldView.height, zoom: cam.zoom };
    const inView = (x, y) => x >= vw.x && x <= vw.x + vw.w && y >= vw.y && y <= vw.y + vw.h;
    const units = b.units.filter(u => !u.dead).map(u => ({ kind: u.kind, team: u.team, x: Math.round(u.x), y: Math.round(u.y), order: u.order && u.order.type, vis: inView(u.x, u.y) }));
    const blds = b.buildings.filter(x => !x.dead).map(x => ({ id: x.buildId, team: x.team, x: Math.round(x.x), y: Math.round(x.y), vis: inView(x.x, x.y) }));
    const minerals = (b.minerals || []).map(m => ({ x: Math.round(m.x), y: Math.round(m.y), vis: inView(m.x, m.y) }));
    return { vw, units, blds, minerals, camMid: { x: Math.round(cam.midPoint.x), y: Math.round(cam.midPoint.y) } };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: '/tmp/play-10-battle-start.png' });
  await browser.close();
})().catch(e => { console.error('ERR', String(e).slice(0, 300)); process.exit(1); });
