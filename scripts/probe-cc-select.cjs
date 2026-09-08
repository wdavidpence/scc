// probe: click command center with real mouse, confirm selectBuilding fires
// and worker-selection build card appears
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => {
    const s = window.__SCC2.scene;
    s.stop('Title'); s.start('Battle', { race: 'terran', mission: 1 });
    if (!s.isActive('Hud')) s.start('Hud', { race: 'terran' });
  });
  await page.waitForTimeout(5000);
  // center camera on CC, real-mouse click its center
  const cc = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0 && x.def.primary);
    b.cameras.main.centerOn(base.x, base.y);
    return { x: base.x, y: base.y, w: base.def.w, h: base.def.h };
  });
  await page.waitForTimeout(400);
  // camera centerOn gets clamped by bounds — compute true screen px from worldView
  const sp = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0 && x.def.primary);
    const cam = b.cameras.main;
    return { x: (base.x - cam.worldView.x) * cam.zoom, y: (base.y - cam.worldView.y) * cam.zoom };
  });
  await page.mouse.click(sp.x, sp.y);
  await page.waitForTimeout(400);
  const sel = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    return { selBld: b._selBld ? b._selBld.buildId : (b.selectedBuilding ? b.selectedBuilding.buildId : null), cardTitle: h && h.cardTitle ? h.cardTitle.text : null };
  });
  // now select all workers (drag-box over base area) and check build card
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.clearSelection();
    const w = b.units.filter(u => !u.dead && u.team === 0 && u.def.worker);
    w.forEach(u => b.addToSelection(u));
    b.events.emit('hud:selection', { count: w.length, units: w.map(u => ({ kind: u.def.kind, name: u.def.name, hp: u.hp, maxHp: u.maxHp })) });
  });
  await page.waitForTimeout(400);
  const wsel = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { cardTitle: h.cardTitle ? h.cardTitle.text : null, btnCount: h.children.list.filter(c => c.input && c.input.enabled).length };
  });
  await page.screenshot({ path: '/tmp/scc-cc-select.png' });
  console.log(JSON.stringify({ cc, sel, wsel, errs: errs.slice(0, 4) }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
