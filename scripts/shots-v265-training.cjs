// v2.65 training mode visual proof: screenshot mid-tutorial
const { chromium } = require('playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERR', String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 20000 });
  await page.screenshot({ path: '/tmp/train-title.png' });
  await page.evaluate(() => {
    const g = window.__SCC2, sm = g.scene;
    for (const s of sm.getScenes(true)) { if (s.scene.key !== 'Boot' && s.scene.key !== 'Preload') sm.stop(s.scene.key); }
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', tutorial: true, difficulty: 'easy' });
  });
  await page.waitForFunction(() => { const b = window.__SCC2.scene.getScene('Battle'); return b && b.coach && b.coach.active; }, null, { timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/train-step1.png' });
  // deploy to show mid-tutorial base shot
  const poll = async (fn, ms = 250, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn()) return true; await page.waitForTimeout(ms); } return false; };
  const sp = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const u = b.units.find(x => x.team === 0 && !x.dead && x.def.mcv); b.cameras.main.centerOn(u.x, u.y); const c = b.cameras.main; return { x: (u.x - c.worldView.x) * c.zoom, y: (u.y - c.worldView.y) * c.zoom }; });
  await page.waitForTimeout(400);
  const sp2 = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const u = b.units.find(x => x.team === 0 && !x.dead && x.def.mcv); const c = b.cameras.main; return { x: (u.x - c.worldView.x) * c.zoom, y: (u.y - c.worldView.y) * c.zoom }; });
  await page.mouse.click(Math.round(sp2.x), Math.round(sp2.y));
  await poll(async () => await page.evaluate(() => window.__SCC2.scene.getScene('Battle').coach.step.id === 'deploy'));
  const dep = await page.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); const btn = h.buttons.find(x => !x.disabled && /DEPLOY/i.test(String(x.txt?.text || ''))); return btn ? { x: btn.x + btn.w / 2, y: btn.y + btn.h / 2 } : null; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/train-step2-deploy.png' });
  await page.mouse.click(dep.x, dep.y);
  await poll(async () => await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return b.buildings.some(x => x.team === 0 && x.def.primary); }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/train-base-up.png' });
  console.log('SHOTS OK step=', await page.evaluate(() => window.__SCC2.scene.getScene('Battle').coach.step.id));
  await browser.close();
})().catch(e => { console.log('ERR', e); process.exit(2); });
