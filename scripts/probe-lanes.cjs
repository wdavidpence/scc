// Deep probe: verify expansion (~170s), AI research agenda, destructibles, high ground, cloak detection
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4176/scc/';
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const inBattle = await page.evaluate(() => !!window.__SCC2 && window.__SCC2.scene.isActive('Battle'));
  console.log('IN_BATTLE', inBattle);
  if (!inBattle) { console.log('ERRORS', JSON.stringify(errors)); await browser.close(); process.exit(2); }
  // terrain grid sanity
  const grid = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { elev: !!b.elev, ramp: !!b.ramp, elevatedTiles: b.elev ? b.elev.reduce((a, v) => a + v, 0) : 0, rampTiles: b.ramp ? b.ramp.reduce((a, v) => a + v, 0) : 0, destructibles: (b.destructibles || []).length };
  });
  console.log('GRID', JSON.stringify(grid));
  // run deep at 4x
  await page.evaluate(() => { window.__SCC2.scene.getScene('Battle').timeScale = 4; });
  await page.waitForTimeout(50000); // ~200 game-sec at 4x
  const deep = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const enemyPrim = b.buildings.filter(x => x.team === 1 && x.def.primary && !x.dead).length;
    const aiTechs = Object.keys(b.players[1].techs || {});
    return { gt: Math.floor(b.gameTime), enemyPrim, aiTechs, aiWeapons: b.players[1].upgrades.weapons, aiArmor: b.players[1].upgrades.armor, destructibles: (b.destructibles || []).length };
  });
  console.log('DEEP', JSON.stringify(deep));
  // destructible rock kill
  const rock = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const rk = (b.destructibles || [])[0];
    if (!rk) return { skipped: true };
    const before = b.destructibles.length;
    for (let k = 0; k < 40 && rk.hp > 0; k++) b.hitRocksNear(rk.tx * 16 + 8, rk.ty * 16 + 8, 20, 0);
    return { before, after: b.destructibles.length };
  });
  console.log('ROCK', JSON.stringify(rock));
  // cloak invisibility + detector reveal
  const cloak = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const u = b.spawnUnit(1, 'darkTemplar', 600, 600, { arriveReady: true });
    if (!u) return { skipped: true };
    u.cloaked = true; u.sprite.setAlpha(0.22);
    b.updateStealthVisibility();
    const hidden = !u.sprite.visible;
    const detB = b.buildings.find(x => x.team === 0 && x.def.detect && !x.dead);
    if (detB) { u.setPos(detB.x + 20, detB.y + 20); }
    b.updateStealthVisibility();
    const revealed = detB ? u.sprite.visible : null;
    u.dead = true; u.container.destroy();
    return { hidden, hasDetector: !!detB, revealed };
  });
  console.log('CLOAK', JSON.stringify(cloak));
  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/deep-lanes.png' });
  console.log('ERRORS', JSON.stringify(errors.slice(0, 6)));
  const expandOK = deep.enemyPrim >= 2 || deep.gt < 170;
  console.log(errors.length || !expandOK ? 'RESULT: FAIL' : 'RESULT: PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.log('FATAL', String(e)); process.exit(1); });
