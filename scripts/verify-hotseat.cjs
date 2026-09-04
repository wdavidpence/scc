// v2.24 split-screen hot-seat gate: dual viewports, half-click control, IJKL pan, orders on both sides
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const out = {};
  // launch hot-seat battle
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    ['Title', 'Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); });
    sm.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal', hotseat: true });
    if (!sm.isActive('Hud')) sm.start('Hud');
  });
  await page.waitForTimeout(3000);

  out.split = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return {
      hotseat: !!b.hotseat,
      cam2: !!b.cam2,
      mainWV: Math.round(b.cameras.main.worldView.width),
      cam2WV: b.cam2 ? Math.round(b.cam2.worldView.width) : 0,
      fullWV: Math.round(b.scale.width / b.cameras.main.zoom),
      mainX: Math.round(b.cameras.main.centerOn ? b.cameras.main.scrollX : 0),
      cam2X: b.cam2 ? Math.round(b.cam2.scrollX) : 0
    };
  });

  // B clicks own half near own base: should take command of team 1 and select own units
  const bPos = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const u = b.units.find(x => x.team === 1 && !x.dead);
    if (!u || !b.cam2) return null;
    const sp = b.cam2.getWorldPoint(b.cam2.width / 2, b.cam2.height / 2);
    // move cam2 so u is at screen center of right half
    b.cam2.centerOn(u.x, u.y);
    return { screenX: 640 + 320, screenY: 380, uid: u.id || u.name || u.x + ':' + u.y };
  });
  if (bPos) {
    await page.mouse.move(bPos.screenX, bPos.screenY);
    await page.waitForTimeout(120);
    await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
    await page.waitForTimeout(400);
    out.bClick = await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle');
      return { team: b.activeTeam, sel: b.selection.size };
    });
  }

  // B right-click attack-move toward center
  out.bOrder = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    if (b.activeTeam !== 1 || b.selection.size === 0) return { skipped: true };
    const unit = [...b.selection][0];
    const tgt = { x: unit.x + 120, y: unit.y + 60 };
    unit.issueMove(tgt.x, tgt.y, true);
    await new Promise(r => setTimeout(r, 900));
    return { moving: [...b.selection].some(u => u.moving || (u.path && u.path.length)) };
  });

  // IJKL pans cam2, not main
  const before = await page.evaluate(() => ({ x: Math.round(window.__SCC2.scene.getScene('Battle').cam2.scrollX), mx: Math.round(window.__SCC2.scene.getScene('Battle').cameras.main.scrollX) }));
  await page.keyboard.down('L');
  await page.waitForTimeout(600);
  await page.keyboard.up('L');
  await page.waitForTimeout(300);
  out.panB = await page.evaluate((bb) => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { cam2Moved: Math.round(b.cam2.scrollX) !== bb.x, mainUnmoved: Math.round(b.cameras.main.scrollX) === bb.mx, dx: Math.round(b.cam2.scrollX) - bb.x };
  }, before);

  // A clicks left half: control returns to team 0
  await page.mouse.move(320, 380);
  await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
  await page.waitForTimeout(400);
  out.aClick = await page.evaluate(() => ({ team: window.__SCC2.scene.getScene('Battle').activeTeam }));

  // TAB still works as fallback switch
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  out.tab = await page.evaluate(() => ({ team: window.__SCC2.scene.getScene('Battle').activeTeam }));

  out.singlePlayerRegression = await page.evaluate(async () => {
    const sm = window.__SCC2.scene;
    sm.stop('Hud'); sm.stop('Battle');
    sm.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal' });
    sm.start('Hud');
    await new Promise(r => setTimeout(r, 2000));
    const b = sm.getScene('Battle');
    return { hotseat: !!b.hotseat, cam2: !!b.cam2, units: b.units.length };
  });

  console.log(JSON.stringify(out, null, 1));
  const halfOK = out.split.cam2WV > 0 && Math.abs(out.split.mainWV - out.split.cam2WV) < 8 && out.split.cam2WV < out.split.fullWV * 0.6;
  const fail = errors.length > 0 || !out.split.cam2 || !halfOK ||
    (bPos && (out.bClick.team !== 1 || out.bClick.sel === 0)) ||
    !out.panB.cam2Moved || !out.panB.mainUnmoved || out.aClick.team !== 0 || out.tab.team !== 1 ||
    out.singlePlayerRegression.hotseat || out.singlePlayerRegression.cam2;
  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/split-hotseat.png' });
  console.log('ERRORS:', errors.length ? errors.join(' ;; ') : 'none');
  console.log(fail ? 'GATE-SPLIT FAIL' : 'GATE-SPLIT PASS');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('GATE-SPLIT CRASH', e.message); process.exit(1); });
