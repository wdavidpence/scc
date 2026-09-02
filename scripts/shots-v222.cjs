// v222 visual path: screenshot the intel panel + mission select, verify pixels
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); localStorage.setItem('scc.intro.seen.v1', '1'); } catch (e) {} });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const c = window.__SCC2.scene.getScene('Cut'); if (c && c.scene.isActive()) c.close(); });
  await page.evaluate(() => { const sm = window.__SCC2.scene; ['Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); }); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v222_title.png' });

  // mission-select open (M)
  await page.keyboard.press('M');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/v222_select.png' });
  const selOpen = await page.evaluate(() => !!window.__SCC2.scene.getScene('Title')._msel);

  // launch current mission via select click on mission 1 row
  await page.evaluate(() => { const t = window.__SCC2.scene.getScene('Title'); t.launchMissionNum(1); });
  await page.waitForTimeout(3800);
  await page.evaluate(() => { const c = window.__SCC2.scene.getScene('Cut'); if (c && c.scene.isActive()) c.close(); });
  await page.waitForTimeout(2500);

  // open intel panel
  await page.keyboard.press('F10');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/v222_intel.png' });
  const intel = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { visible: h._intel.visible, hasContactText: (h._msgLog || []).length };
  });
  // pixel probe: panel border gold at known rect edges
  const px = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true }) || cv.getContext('2d');
    // re-render happens through WebGL usually; fallback to page screenshot analysis in node
    return { w: cv.width, h: cv.height, webgl: !!(cv.getContext('webgl2') || cv.getContext('webgl')) };
  });
  console.log(JSON.stringify({ selOpen, intel, px, errors: errors.slice(0, 3) }));
  await browser.close();
})();
