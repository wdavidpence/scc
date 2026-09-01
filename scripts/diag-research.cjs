// Diagnostic: why does enemy AI not research? Inspect labs, gas, affordability at depth
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4176/scc/';
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); if (b) b.timeScale = 8; });
  await page.waitForTimeout(40000);
  const out = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const eb = b.buildings.filter(x => x.team === 1 && !x.dead && x.built).map(x => x.buildId);
    const all = b.buildings.filter(x => x.team === 1 && !x.dead).map(x => `${x.buildId}:${x.built ? 'done' : Math.round(x.progress ?? x.buildProgress ?? -1)}`);
    const p = b.players[1];
    return { gt: Math.round(b.gameTime), race: b.enemyRace, eb, all, min: Math.round(p.minerals), gas: Math.round(p.gas), techs: Object.keys(p.techs || {}), up: p.upgrades };
  });
  console.log('DIAG', JSON.stringify(out));
  await browser.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
