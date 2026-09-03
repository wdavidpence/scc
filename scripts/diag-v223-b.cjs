const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.evaluate(() => { const c = window.__SCC2.scene.getScene('Cut'); if (c && c.scene.isActive()) c.close(); });
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    ['Title', 'Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); });
    sm.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal', mission: { n: 1, name: 'T', enemy: 'zerg', difficulty: 'easy', bonusMinerals: 200, brief: '' } });
    if (!sm.isActive('Hud')) sm.start('Hud');
  });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const blds = b.buildings.filter(x => x.team === 0).map(x => ({ id: x.buildId, built: x.built, dead: x.dead }));
    const raf = b.buildings.find(x => x.team === 0 && x.built && x.buildId === 'barracks');
    let q = null;
    if (raf) {
      b.players[0].minerals = 9999; b.players[0].gas = 9999;
      const can = raf.canProduce('marine');
      const afford = b.canAfford(0, 50, 10);
      q = { can, afford, ok: raf.queueUnit('marine') };
    }
    const home = b.buildings.find(x => x.team === 0 && x.built);
    const m = b.spawnUnit(0, 'marine', home.x + 60, home.y + 60, { arriveReady: true });
    const e = b.spawnUnit(1, 'zergling', home.x + 110, home.y + 66, { arriveReady: true });
    e.hp = e.maxHp = 3000;
    m.setOrder({ type: 'attackTarget', target: e });
    return { blds, q, m: !!m, e: !!e, dist: Math.round(Math.hypot(m.x - e.x, m.y - e.y)), mrange: m.def.range, tile: b.TILE || 16 };
  });
  // second pass: check hp drop after a moment
  await page.waitForTimeout(2000);
  const r2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.units.filter(u => u.team === 0 && u.kind === 'marine' && !u.dead).slice(-1)[0];
    const e = b.units.filter(u => u.team === 1 && u.kind === 'zergling' && !u.dead).slice(-1)[0];
    const shells = b.children.list.filter(c => c._proj?.shell && c.active).length;
    const brass = (b._brass || []).length;
    const gore = b.children.list.filter(c => c.active && /gore-|scorch/.test(c.texture?.key || '')).length;
    return { mh: Math.round(m?.hp), eh: Math.round(e?.hp), ms: m?.state, tx: Math.round(m?.x), ex: Math.round(e?.x), shells, brass, gore };
  });
  console.log(JSON.stringify({ ...r, ...r2 }, null, 1));
  await browser.close();
})();
