// Hot-seat 1v1 gate: launch, TAB-swap, select+order enemy units, AI stands down
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
  const out = {};

  // Title hotseat button exists
  out.titleHotseat = await page.evaluate(() => !!window.__SCC2.scene.getScene('Title').launchHotseat);

  // launch hotseat battle
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    ['Title', 'Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); });
    sm.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal', hotseat: true, mission: { n: 0, name: 'DUEL', enemy: 'zerg', difficulty: 'normal', bonusMinerals: 0, brief: '' } });
    if (!sm.isActive('Hud')) sm.start('Hud');
  });
  await page.waitForTimeout(3000);
  out.hotseat = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { active: !!b.hotseat, team: b.activeTeam, p1Units: b.units.filter(u => u.team === 1 && !u.dead).length };
  });

  // TAB swaps commander
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  out.afterTab = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    return { team: b.activeTeam, badge: h._teamBadge ? h._teamBadge.text : null };
  });

  // commander B (team 1) can select its own zerg units
  out.selB = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const z = b.units.filter(u => u.team === 1 && !u.dead && !u.dead);
    b.clearSelection(); z.slice(0, 3).forEach(u => b.addToSelection(u));
    return { team: b.activeTeam, sel: b.selection.size };
  });

  // order them to attack player base
  out.orderB = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const pb = b.buildings.find(x => x.team === 0 && x.built);
    [...b.selection].forEach(u => u.issueMove(pb.x, pb.y, true));
    await new Promise(r => setTimeout(r, 1200));
    return { moving: [...b.selection].filter(u => u.moving).length };
  });

  // AI must NOT be spawning team-1 units (stands down in hotseat)
  await page.waitForTimeout(2500);
  out.aiDown = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const enBarr = b.buildings.find(x => x.team === 1 && x.buildId === 'barracks');
    return { enQueue: enBarr ? enBarr.queue.length : -1, gas1: Math.round(b.players[1].gas) };
  });

  // tab back: commander A regains control, can select marines
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  out.selA = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const ms = b.units.filter(u => u.team === 0 && !u.dead && !u.dead);
    b.clearSelection(); ms.slice(0, 3).forEach(u => b.addToSelection(u));
    return { team: b.activeTeam, sel: b.selection.size };
  });

  await page.waitForTimeout(2000);
  out.alive = await page.evaluate(() => window.__SCC2.scene.isActive('Battle'));
  out.pageErrors = errors;
  console.log(JSON.stringify(out, null, 1));
  await page.screenshot({ path: 'shots-v223-hotseat.png' });
  await browser.close();
  const fail = errors.length > 0 || !out.hotseat.active || out.afterTab.team !== 1 || out.selB.sel < 1 || out.orderB.moving < 1 || out.selA.team !== 0 || !out.alive;
  process.exit(fail ? 1 : 0);
})();
