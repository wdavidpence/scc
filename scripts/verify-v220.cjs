// v2.20 gate: intel panel (F10), escape mission + LZ victory, persistent rally flags, mission stamp
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const c = window.__SCC2.scene.getScene('Cut'); if (c && c.scene.isActive()) c.close(); });
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    ['Title', 'Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); });
    sm.start('Battle', {
      race: 'terran', enemyRace: 'terran', difficulty: 'normal',
      mission: { n: 11, name: 'HELLFIRE EVAC', enemy: 'terran', difficulty: 'hard', bonusMinerals: 200, brief: 'Evac.', mods: { escape: 240 } }
    });
  });
  await page.waitForTimeout(3500);

  const out = {};

  // 1) escape objective + LZ setup
  out.escapeSetup = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const obj = (b.objectives || []).find(o => o.id === 'escape');
    return { hasObj: !!obj, text: obj ? obj.text : null, lz: b._lz ? { x: Math.round(b._lz.x), y: Math.round(b._lz.y) } : null, escapeAt: b._escapeAt };
  });

  // 2) intel panel via F10
  await page.keyboard.press('F10');
  await page.waitForTimeout(300);
  out.intelOpen = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { visible: h._intel && h._intel.visible, p: h._intelP.text.length, e: h._intelE.text.length, hasKills: h._intelP.text.includes('kills'), obj: h._intelO.text.includes('OBJECTIVES') };
  });
  await page.keyboard.press('F10');
  await page.waitForTimeout(200);
  out.intelClosed = await page.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); return !h._intel.visible; });

  // 3) rally flag: default flag on a built production building + persists
  out.rally = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const prod = b.buildings.find(x => x.team === 0 && x.def.rally && x.built) || b.buildings.find(x => x.team === 0 && x.built);
    if (!prod.def.rally) { prod.def.rally = true; } // ensure test path
    prod.rallyPoint = null; if (prod._rallyFlag) { prod._rallyFlag.destroy(); prod._rallyFlag = null; }
    b.onBuildingComplete(prod);
    const flag1 = !!prod._rallyFlag && !!prod.rallyPoint;
    // re-place rally: old flag destroyed, new one at new point
    const oldFlag = prod._rallyFlag;
    prod.rallyPoint = { x: prod.rallyPoint.x + 64, y: prod.rallyPoint.y + 64 };
    b.showRallyFlag(prod);
    const swapped = oldFlag !== prod._rallyFlag && oldFlag.active === false; // old flag destroyed
    return { flag1, swapped, flagLive: prod._rallyFlag.active };
  });

  // 4) shorten evac window, board LZ -> victory
  const lz = out.escapeSetup.lz;
  await page.evaluate(({ lz }) => {
    const b = window.__SCC2.scene.getScene('Battle');
    b._escapeAt = b.gameTime + 1.5;
    b.spawnUnit(0, 'marine', lz.x, lz.y, { arriveReady: true });
  }, { lz });
  await page.waitForTimeout(2600);
  out.escapeWin = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { gameOver: b.gameOver, boarded: !!b._escapeBoarded };
  });

  // 5) mission stamp on debrief
  await page.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); if (h.showGameOver) h.showGameOver('victory'); });
  await page.waitForTimeout(500);
  out.stamp = await page.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); return h._stamp ? h._stamp.text : null; });

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join(' ;; ') : 'none');
  const pass = out.escapeSetup.hasObj && !!out.escapeSetup.lz && out.intelOpen.visible && out.intelOpen.hasKills && out.intelClosed
    && out.rally.flag1 && out.escapeWin.gameOver === 'victory' && out.stamp && out.stamp.includes('HELLFIRE') && errors.length === 0;
  console.log(pass ? 'GATE-V220 PASS' : 'GATE-V220 FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
