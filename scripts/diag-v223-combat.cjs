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
  const r = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const home = b.buildings.find(x => x.team === 0 && x.built);
    const m = b.spawnUnit(0, 'marine', home.x + 60, home.y + 60, { arriveReady: true });
    const e = b.spawnUnit(1, 'zergling', home.x + 140, home.y + 60, { arriveReady: true });
    if (!m || !e) return { spawn: false, m: !!m, e: !!e };
    e.hp = e.maxHp = 3000;
    m.setOrder({ type: 'attackTarget', target: e });
    const snap = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 250));
      snap.push({ ms: m.state, mt: Math.round(m.x) + ',' + Math.round(m.y), mh: Math.round(m.hp), eh: Math.round(e.hp), es: e.state, tgt: !!m.target, cd: +(m.attackTimer || 0).toFixed(2), range: m.def.range, sight: m.def.sight, vis: b.isVisible(e.x, e.y) });
    }
    return { snap, dmgTypes: typeof m.setOrder === 'function', hasAcquire: typeof b.acquireFor === 'function' };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
