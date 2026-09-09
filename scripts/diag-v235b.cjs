const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const URL = 'http://127.0.0.1:4177/scc/';
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERR', String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => { const s = window.__SCC2.scene; s.stop('Title'); s.start('Battle', { race: 'terran', mission: 1 }); const h = s.getScene('Hud'); if (!h.scene.isActive()) s.start('Hud', { race: 'terran' }); });
  await page.waitForTimeout(6000);
  const diag = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const mine = b.units.filter(u => !u.dead && u.team === 0);
    const m0 = mine[0];
    return {
      hudActive: h.scene.isActive(),
      units: mine.length,
      kind: m0 && m0.kind,
      defIcon: m0 && m0.def && m0.def.icon,
      team: m0 && m0.team,
      texExists: m0 ? b.textures.exists(`u-${m0.def?.icon || m0.kind}-t${m0.team > 2 ? 2 : m0.team}`) : null,
      hasUpdate: typeof h.update,
      busts: h._busts ? h._busts.length : 'undef',
      portraitG: !!h.portraitG,
    };
  });
  console.log(JSON.stringify(diag, null, 1));
  // manual call
  const manual = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const mine = b.units.filter(u => !u.dead && u.team === 0).slice(0, 4);
    h.onSelection({ units: mine, count: mine.length });
    await new Promise(r => setTimeout(r, 400));
    return { busts: h._busts ? h._busts.length : -1, first: h._busts && h._busts[0] ? h._busts[0].sp.texture.key : null };
  });
  console.log('MANUAL', JSON.stringify(manual));
  const cycle = await page.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    const t0 = h._busts && h._busts[0] && h._busts[0].sp.active ? h._busts[0].sp.texture.key : 'gone';
    await new Promise(r => setTimeout(r, 1200));
    const t1 = h._busts && h._busts[0] && h._busts[0].sp.active ? h._busts[0].sp.texture.key : 'gone';
    return { t0, t1 };
  });
  console.log('CYCLE', JSON.stringify(cycle));
  await page.screenshot({ path: '/tmp/v235b-diag.png' });
  await browser.close();
})();
