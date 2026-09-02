const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  page.on('pageerror', e => errs.push((e.stack || e.message).split('\n').slice(0, 4).join(' | ')));
  page.on('console', m => { errs.push('CONSOLE: ' + m.text().slice(0,250)); });
  await page.goto('http://127.0.0.1:5175/scc/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const c = window.__SCC2?.scene?.getScene('Cut'); if (c && c.scene.isActive()) c.close(); });
  await page.waitForTimeout(4000);
  const st = await page.evaluate(() => {
    const s = window.__SCC2.scene;
    const b = s.getScene('Battle');
    const active = [];
    s.getScenes(true).forEach(x => active.push(x.scene ? x.scene.key : String(x)));
    return {
      active,
      battleActive: s.isActive('Battle'),
      gt: Math.round(b.gameTime || -1),
      paused: b.paused,
      units: b.units ? b.units.length : -1,
      crates: (b.crates || []).length,
      critters: (b.critters || []).length,
      updateType: typeof b.update,
      hasUpdateHook: !!b.events.listenerCount('update'),
    };
  });
  console.log('STATE', JSON.stringify(st, null, 1));
  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/diag.png' });
  console.log('ERRORS', JSON.stringify(errs, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
