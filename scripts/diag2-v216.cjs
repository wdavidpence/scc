const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('console', m => console.log('C:', m.text().slice(0, 300)));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(async () => {
    const g = window.__SCC2;
    const T = g.scene.getScene('Title');
    g.scene.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'easy', campaign: T.camp, mission: { n: 1, name: 'TEST', waves: [], pool: 'basic', mods: {} } });
    await new Promise(r => setTimeout(r, 2500));
    const b = g.scene.getScene('Battle');
    return { active: g.scene.isActive('Battle'), units: b.units ? b.units.length : 'no-units', gt: b.gameTime };
  });
  console.log('OUT', JSON.stringify(out));
  await page.waitForTimeout(1000);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
