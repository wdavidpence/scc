// inspect marine texture pixels + find 404 resource
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const fails = [];
  page.on('requestfailed', r => fails.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) fails.push(r.status() + ' ' + r.url()); });
  await page.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => {
    const s = window.__SCC2.scene;
    s.stop('Title'); s.start('Battle', { race: 'terran', mission: 1 });
  });
  await page.waitForTimeout(4500);
  const res = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const src = b.textures.get('u-marine-t0').getSourceImage();
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const warm = [];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4, r = d[i], g = d[i+1], bl = d[i+2], a = d[i+3];
      if (a > 40 && r > bl + 18 && r > g && g >= bl && r > 110) warm.push([x, y, r, g, bl]);
    }
    return { w: c.width, h: c.height, warmCount: warm.length, sample: warm.slice(0, 12) };
  });
  console.log(JSON.stringify(res));
  console.log('FAILS:', [...new Set(fails)].slice(0, 10));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
