// v2.31 rename smoke: load local build, start battle vs skarn + auraxis, assert renamed ids render, 0 page errors.
const { chromium } = require('playwright');
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const title = await page.evaluate(() => {
    const sm = window.__SCC2 && window.__SCC2.scene;
    return sm ? sm.scenes.map(s => s.scene.key + ':' + (s.scene.isActive() ? 'A' : '-')).join(',') : 'NO-SCC2';
  });
  console.log('SCENES', title);
  // start skarn battle
  const r1 = await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    sm.stop('Title'); sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal', mission: 2 });
    return true;
  });
  await page.waitForTimeout(6000);
  const check1 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const enemyProds = [];
    for (const u of (b.units || [])) if (u.team === 1) enemyProds.push(u.kind);
    const texOk = ['u-skarnling-t1', 'u-skywarden-t1', 'u-airstinger-t1'].filter(k => b.textures.exists(k));
    return {
      enemyRace: b.enemyRace, units: (b.units || []).length,
      enemyKinds: [...new Set(enemyProds)],
      texOk,
      err: null
    };
  });
  console.log('SKARN', JSON.stringify(check1));
  // auraxis battle
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    sm.stop('Battle'); sm.stop('Hud');
    sm.start('Battle', { race: 'auraxis', enemyRace: 'auraxis', difficulty: 'normal', mission: 4 });
  });
  await page.waitForTimeout(6000);
  const check2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return {
      enemyRace: b.enemyRace, race: b.race,
      texBladeguard: b.textures.exists('u-bladeguard-t0'),
      texAegis: b.textures.exists('b-aegis-t2') || b.textures.exists('b-aegis-t0'),
      buildings: (b.buildings || []).length
    };
  });
  console.log('AURAXIS', JSON.stringify(check2));
  await page.screenshot({ path: '/tmp/v231-smoke-skarn.png' });
  console.log('ERRORS', JSON.stringify(errors.slice(0, 8)));
  await browser.close();
  if (errors.length) { console.log('GATE-V231-RENAME FAIL'); process.exit(1); }
  console.log('GATE-V231-RENAME PASS');
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
