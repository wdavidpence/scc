// v2.22 gate: tabbed build menu, episode mission select (M), radio zone chatter
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.evaluate(() => { const c = window.__SCC2.scene.getScene('Cut'); if (c && c.scene.isActive()) c.close(); });
  await page.waitForTimeout(500);
  const out = {};

  // Title must be active; open episode mission select with M
  out.titleActive = await page.evaluate(() => window.__SCC2.scene.isActive('Title'));
  await page.keyboard.press('M');
  await page.waitForTimeout(300);
  out.msel = await page.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    const texts = [];
    if (t._msel) t._msel.list.forEach(k => { if (k.type === 'Text') texts.push(k.text); });
    return { open: !!t._msel, ep1: texts.some(x => x.includes('EPISODE I')), locked: texts.some(x => x.includes('LOCKED')), mission1: texts.some(x => x.includes('CLEANUP OP')) };
  });
  await page.evaluate(() => { window.__SCC2.scene.getScene('Title').closeMissionSelect(); });
  out.mselClosed = await page.evaluate(() => !window.__SCC2.scene.getScene('Title')._msel);

  // start battle directly (mission 1)
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    ['Title', 'Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); });
    sm.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal', mission: { n: 1, name: 'CLEANUP OP', enemy: 'zerg', difficulty: 'easy', bonusMinerals: 200, brief: '' } });
    if (!sm.isActive('Hud')) sm.start('Hud');
  });
  await page.waitForTimeout(3500);
  out.battleActive = await page.evaluate(() => window.__SCC2.scene.isActive('Battle'));

  // tabbed build menu via gateway selection (terran barracks has no tech; gateway has produces+tech)
  await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.race = 'protoss';
    h.onSelection({ building: { buildId: 'gateway', name: 'Gateway', hp: 500, maxHp: 500, queue: [], canProduce: [] } });
  });
  await page.waitForTimeout(150);
  out.tabsTrain = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const labels = h.buttons.map(x => x.txt.text);
    return { hasTrain: labels.includes('TRAIN'), hasUp: labels.includes('UPGRADE'), zealot: labels.some(l => l.toUpperCase().includes('ZEALOT')) };
  });
  await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    h._cardTab = 'up';
    h.onSelection({ building: { buildId: 'gateway', name: 'Gateway', hp: 500, maxHp: 500, queue: [], canProduce: [] } });
  });
  await page.waitForTimeout(150);
  out.tabsUp = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const labels = h.buttons.map(x => x.txt.text);
    return { hasTrain: labels.includes('TRAIN'), hasUp: labels.includes('UPGRADE'), warpRow: labels.some(l => l.toUpperCase().includes('WARP')) };
  });

  // zone chatter: park worker next to unclaimed geyser (clear orders so harvest doesn't yank it back)
  out.chatter = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const g = b.geysers.find(x => !x.building);
    const w = b.units.find(u => !u.dead && u.team === 0 && u.def.worker);
    if (!g || !w) return { skip: true };
    w.order = null; w.state = 'idle'; w.path = []; w.harvestTarget = null;
    w.setPos(g.x + 40, g.y + 40);
    b.updateFog(); // stamp shared vision at the worker's new spot
    const vis = b.currentlyVisible(g.x, g.y);
    b.updateZoneChatter();
    const radioLines = [];
    const rl = window.__SCC2.scene.getScene('Hud')._radioLog;
    if (rl) rl.list.forEach(k => { if (k.active !== false && k.text) radioLines.push(k.text); });
    return { vis, geyserFlag: !!b._chatter.geyser, radio: radioLines.some(l => l.includes('Vespene')) };
  });

  // creep chatter if creep cells exist for team 1
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cc = b.creepCanvases && b.creepCanvases[1];
    if (!cc) return;
    const idx = cc.cells.indexOf(1);
    if (idx < 0) return;
    const tx = idx % 96, ty = (idx / 96) | 0;   // cells are ty*MAP_W+tx; TILE=16
    const u = b.units.find(x => !x.dead && x.team === 0 && !x.flying);
    if (!u) return;
    u.order = null; u.state = 'idle'; u.path = [];
    u.setPos(tx * 16 + 8, ty * 16 + 8);
  });
  await page.waitForTimeout(50);
  out.creepDebug = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cc = b.creepCanvases[1];
    const idx = cc.cells.indexOf(1);
    const u = b.units.find(x => !x.dead && x.team === 0 && !x.flying);
    b.updateZoneChatter();
    return { idx, tx: idx % 96, ty: (idx / 96) | 0, ux: Math.round(u.x), uy: Math.round(u.y) };
  });
  out.creep = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { creepFlag: !!b._chatter.creep };
  });

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join(' ;; ') : 'none');
  const pass = out.titleActive && out.msel.open && out.msel.ep1 && out.msel.locked && out.msel.mission1
    && out.mselClosed && out.battleActive
    && out.tabsTrain.hasTrain && out.tabsTrain.hasUp && out.tabsTrain.zealot && out.tabsUp.hasTrain && out.tabsUp.hasUp && out.tabsUp.warpRow
    && (out.chatter.skip || (out.chatter.geyserFlag && out.chatter.radio))
    && (out.creep.skip || out.creep.creepFlag) && errors.length === 0;
  console.log(pass ? 'GATE-V222 PASS' : 'GATE-V222 FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
