// Measure avg luminance + showcase screenshot at daytime
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4176/scc/';
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(3500);
  const out = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    if (b) b.timeScale = 3;
    return b ? Math.round(b.gameTime) : -1;
  });
  await page.waitForTimeout(20000);
  const lum = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    if (b && b._dayT !== undefined) b._dayT = 0.33;
    const src = b.scale.canvas;
    const oc = document.createElement('canvas'); oc.width = 320; oc.height = 190;
    const ox = oc.getContext('2d'); ox.drawImage(src, 0, 0, 320, 190);
    const d = ox.getImageData(0, 0, 320, 190).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
    return Math.round(s / n);
  });
  console.log('GT0', out, 'AVG_LUM', lum);
  await page.screenshot({ path: '/Users/davidpence/scc-work/shots/sc1-fidelity-8lanes.png' });
  await browser.close();
})().catch(e => { console.log('FATAL', String(e)); process.exit(1); });
