// pixel forensics: heavy unit sprites must have rich palettes (>=12 distinct colors) — run after Battle boots
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    ['Title', 'Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); });
    sm.start('Battle', { race: 'terran', enemyRace: 'protoss', difficulty: 'normal' });
  });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const out = {};
    const b = window.__SCC2.scene.getScene('Battle');
    for (const kind of ['bc', 'carrier', 'ultra', 'goliath']) {
      const k = 'u-' + kind + '-t0';
      if (!b.textures.exists(k)) { out[kind] = { missing: true }; continue; }
      const src = b.textures.get(k).getSourceImage();
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const cx = c.getContext('2d');
      cx.drawImage(src, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set(); let opaque = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 40) { opaque++; colors.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)); } }
      out[kind] = { w: src.width, h: src.height, colors: colors.size, opaque };
    }
    return out;
  });
  console.log(JSON.stringify(r));
  const thin = Object.entries(r).filter(([k, v]) => v.missing || !v.colors || v.colors < 12);
  console.log('ERRORS:', errors.length ? errors[0] : 'none');
  console.log(thin.length || errors.length ? 'ART-CHECK THIN: ' + thin.map(t => t[0]).join(',') : 'ART-CHECK PASS');
  await browser.close();
  process.exit(thin.length || errors.length ? 1 : 0);
})().catch(e => { console.log('ART-CHECK CRASH', e.message); process.exit(1); });
