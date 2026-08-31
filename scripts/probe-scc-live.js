// Probe SCC live game: click Start, run 20s, capture gameplay screenshots.
const { chromium } = require('/Users/davidpence/scc-work/node_modules/playwright-core') 
  ?? require('playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('https://wdavidpence.github.io/scc/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/davidpence/scc-work/backups/probe-title.png' });

  // Try clicking any visible Start-ish control
  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button, [role=button], a, div, span')]
      .find(e => /start|play|begin/i.test(e.textContent || '') && e.textContent.length < 30);
    if (el) { el.click(); return el.textContent.trim(); }
    return null;
  });
  console.log('clicked:', clicked);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/Users/davidpence/scc-work/backups/probe-early.png' });

  // interact: drag-select in canvas center, right click to move
  const canvas = await page.$('canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.55);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/Users/davidpence/scc-work/backups/probe-select.png' });
    }
  }
  await page.waitForTimeout(15000);
  await page.screenshot({ path: '/Users/davidpence/scc-work/backups/probe-late.png' });
  console.log('console errors:', JSON.stringify(errors, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
