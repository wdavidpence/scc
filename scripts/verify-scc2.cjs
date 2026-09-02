// SCC2 gameplay verification: real Chromium, real input, timed soak, screenshots.
const path = require('path');
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

const OUT = '/Users/davidpence/scc-work/verify';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto(process.env.SCC_URL || 'http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/01-title.png` });

  // enter battle through intro+briefing: deterministically skip any active cutscene
  const skipCuts = async () => {
    for (let i = 0; i < 6; i++) {
      const closed = await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} const sm = window.__SCC2?.scene; if (!sm) return false; const s = sm.getScene('Cut'); if (s && s.scene.isActive()) { s.close(); return true; } return false; });
      if (!closed) return;
      await page.waitForTimeout(800);
    }
  };
  await skipCuts(); // clear any autoplay intro
  await page.keyboard.press('Enter');            // launch mission -> briefing cutscene
  await page.waitForTimeout(1200);
  await skipCuts();                              // skip briefing, Battle starts
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/02-base.png` });

  const snap = () => page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { gt: Math.floor(b.gameTime || 0), mins: Math.floor(b.players[0].minerals), gas: Math.floor(b.players[0].gas), supply: b.players[0].supplyUsed + '/' + b.players[0].supplyCap, units: b.units.filter(u=>u.team===0&&!u.dead).length, enemyUnits: b.units.filter(u=>u.team===1&&!u.dead).length, enemyBuildings: b.buildings.filter(b=>b.team===1&&!b.dead).length, sel: b.selection.size };
  });
  console.log('SNAP0', JSON.stringify(await snap()));

  // box-select workers at camera center
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const mid = g.cameras.main.midPoint;
    g.units.filter(u => u.team === 0 && u.def.worker).forEach((u, i) => { u.setPos(mid.x - 24 + (i % 2) * 48, mid.y - 16 + ((i / 2) | 0) * 32); });
  });
  await page.waitForTimeout(200);
  let pts = await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle'); const c = g.cameras.main;
    return g.units.filter(u => u.team === 0).map(u => ({ sx: (u.x - c.worldView.x) * c.zoom, sy: (u.y - c.worldView.y) * c.zoom }));
  });
  if (!pts.length) { console.log('NO_UNITS_AT_LOAD — waiting for spawn'); await page.waitForTimeout(5000); pts = await page.evaluate(() => { const g = window.__SCC2.scene.getScene('Battle'); const c = g.cameras.main; return g.units.filter(u => u.team === 0).map(u => ({ sx: (u.x - c.worldView.x) * c.zoom, sy: (u.y - c.worldView.y) * c.zoom })); }); }
  const xs = pts.map(p => p.sx), ys = pts.map(p => p.sy);
  await page.mouse.move(Math.max(2, Math.min(...xs) - 18), Math.max(2, Math.min(...ys) - 18));
  await page.mouse.down();
  await page.mouse.move(Math.max(...xs) + 18, Math.max(...ys) + 18, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const selAfter = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').selection.size);
  console.log('SELECTED', selAfter);

  // right-click move → verify movement
  const p0 = await page.evaluate(() => [...window.__SCC2.scene.getScene('Battle').selection].map(u => [Math.round(u.x), Math.round(u.y)]));
  await page.evaluate(() => { const mid = window.__SCC2.scene.getScene('Battle').cameras.main.midPoint; window.__dest = { x: mid.x + 120, y: mid.y + 60 }; });
  const dest = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const c = b.cameras.main; const d = window.__dest; return [(d.x - c.worldView.x) * c.zoom, (d.y - c.worldView.y) * c.zoom]; });
  await page.mouse.click(dest[0], dest[1], { button: 'right' });
  await page.waitForTimeout(1800);
  const p1 = await page.evaluate(() => [...window.__SCC2.scene.getScene('Battle').selection].map(u => [Math.round(u.x), Math.round(u.y)]));
  const moved = p0.some((q, i) => Math.hypot(p1[i][0] - q[0], p1[i][1] - q[1]) > 20);
  console.log('MOVED', moved, JSON.stringify({ p0, p1 }));

  // command card buttons appear for worker selection
  const btns = await page.evaluate(() => (window.__SCC2.scene.getScene('Hud').buttons || []).map(b => b.label.split('\n')[0]));
  console.log('CARD', JSON.stringify(btns));
  await page.screenshot({ path: `${OUT}/03-selected.png` });

  // place a supply depot + barracks via HUD events with selected workers, then wait construction
  const placed = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.startPlacing('supplyDepot');
    // fake valid snap location near base
    const cc = b.buildings.find(x => x.team === 0 && x.def.primary);
    const x = Math.round((cc.x + 96) / 16) * 16, y = Math.round((cc.y + 80) / 16) * 16;
    b.isValid = b.placementValid('supplyDepot', x, y);
    b.tryPlace(x, y);
    const bd = b.buildings.find(x => x.team === 0 && x.buildId === 'supplyDepot' && !x.dead);
    return { built: !!bd, valid: b.isValid };
  });
  console.log('PLACE', JSON.stringify(placed));

  // assign workers to build it
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const bd = b.buildings.find(x => x.team === 0 && x.buildId === 'supplyDepot' && !x.dead && !x.built);
    if (bd) b.units.filter(u => u.team === 0 && u.def.worker && !u.dead).slice(0, 2).forEach(w => w.setOrder({ type: 'build', building: bd }));
  });

  // fast-forward time: 2x speed and soak 40s real → 80s game
  await page.evaluate(() => { window.__SCC2.scene.getScene('Battle').timeScale = 2; });
  const soak0 = await snap();
  await page.waitForTimeout(20000);
  await page.screenshot({ path: `${OUT}/04-mid.png` });
  const soak1 = await snap();
  await page.waitForTimeout(25000);
  const soak2 = await snap();
  await page.screenshot({ path: `${OUT}/05-late.png` });
  console.log('SOAK', JSON.stringify({ soak0, soak1, soak2 }));

  // check supply depot complete & supply grew
  const supplyInfo = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const sd = b.buildings.find(x => x.buildId === 'supplyDepot' && x.team === 0 && !x.dead);
    return { depotBuilt: !!(sd && sd.built), cap: b.players[0].supplyCap };
  });
  console.log('SUPPLY', JSON.stringify(supplyInfo));

  console.log('ERRORS', JSON.stringify(errors, null, 1));
  await browser.close();
  const fail = errors.length > 0 || selAfter === 0 || !moved || !placed.built;
  console.log(fail ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
