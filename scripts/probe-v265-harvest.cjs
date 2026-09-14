// Focused probe: forced right-click on the harvest mineral marker
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
  await page.evaluate(() => {
    const g = window.__SCC2, sm = g.scene;
    for (const s of sm.getScenes(true)) { if (s.scene.key !== 'Boot' && s.scene.key !== 'Preload') sm.stop(s.scene.key); }
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', tutorial: true, difficulty: 'easy' });
  });
  await page.waitForFunction(() => { const b = window.__SCC2.scene.getScene('Battle'); return b && b.coach && b.coach.active; }, null, { timeout: 15000 });
  const poll = async (fn, ms = 250, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn()) return true; await page.waitForTimeout(ms); } return false; };
  const stepNow = () => page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return b.coach ? b.coach.step.id : 'DONE'; });
  const screenOf = async (pickSrc) => {
    await page.evaluate((src) => { const b = window.__SCC2.scene.getScene('Battle'); try { b.tweens.getTweensOf(b.cameras.main).forEach(t => t.stop()); } catch (e) {} const t = eval(src)(b); if (t) b.cameras.main.centerOn(t.x, t.y); }, pickSrc);
    await page.waitForTimeout(400);
    return page.evaluate((src) => { const b = window.__SCC2.scene.getScene('Battle'); const t = eval(src)(b); if (!t) return null; const c = b.cameras.main; return { x: (t.x - c.worldView.x) * c.zoom, y: (t.y - c.worldView.y) * c.zoom }; }, pickSrc);
  };
  const clickBtn = async (re) => {
    for (let i = 0; i < 20; i++) {
      const btn = await page.evaluate((src) => { const h = window.__SCC2.scene.getScene('Hud'); const btn = h.buttons.find(x => !x.disabled && new RegExp(src, 'i').test(String(x.txt?.text || ''))); return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null; }, re);
      if (btn) { await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2); return true; }
      await page.waitForTimeout(300);
    }
    return false;
  };
  // fast-forward through forced steps to 'harvest'
  let sp = await screenOf('b=>b.units.find(u=>u.team===0&&!u.dead&&u.def.mcv)');
  await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
  await poll(async () => (await stepNow()) === 'deploy');
  await clickBtn('DEPLOY');
  await poll(async () => (await stepNow()) !== 'deploy');
  sp = await screenOf('b=>b.buildings.find(x=>x.team===0&&x.def.primary&&!x.dead)');
  await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
  await poll(async () => (await stepNow()) === 'train_worker');
  await clickBtn('rigger');
  await poll(async () => await page.evaluate(() => window.__SCC2.scene.getScene('Battle').units.some(u => u.team === 0 && u.kind === 'rigger' && !u.dead)), 500, 40);
  await poll(async () => (await stepNow()) === 'select_worker', 300, 20);
  for (let i = 0; i < 12; i++) {
    sp = await screenOf('b=>b.units.find(u=>u.team===0&&u.kind===\'rigger\'&&!u.dead)');
    if (!sp) { await page.waitForTimeout(300); continue; }
    await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
    if (await poll(async () => (await stepNow()) === 'harvest', 250, 8)) break;
  }
  console.log('REACHED', await stepNow());
  const refreshMarker = () => page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    try { b.tweens.getTweensOf(b.cameras.main).forEach(t => t.stop()); } catch (e) {}
    b.cameras.main.centerOn(b.coach.markerTarget.x, b.coach.markerTarget.y);
    b.coach.stepAt = b.gameTime;
    return true;
  });
  const markerPos = () => page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const t = b.coach.step.target(); const c = b.cameras.main;
    const mp = b.coach.markerTarget;
    return { t: t ? { x: (t.x - c.worldView.x) * c.zoom, y: (t.y - c.worldView.y) * c.zoom } : null,
      tt: t ? { x: t.x, y: t.y } : null,
      mt: mp ? { x: (mp.x - c.worldView.x) * c.zoom, y: (mp.y - c.worldView.y) * c.zoom } : null,
      mined: b.coach._minedClick,
      orders: b.units.filter(u => u.team === 0 && !u.dead).map(u => ({ k: u.kind, o: u.order ? u.order.type : null })) };
  });
  await page.waitForTimeout(2500);
  console.log('START', JSON.stringify(await markerPos()));
  const offX = 1160, offY = 620; // gate's off-corner
  for (let i = 0; i < 5; i++) {
    await refreshMarker();
    await page.waitForTimeout(400);
    let mp = (await markerPos()).mt;
    // exact gate sequence: off-corner right click, then on-target right click
    await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); b.coach.hintPulse = 0; window.__inLog.length = 0; });
    await page.mouse.click(offX, offY, { button: 'right' });
    await page.waitForTimeout(300);
    console.log('afterOff', JSON.stringify({ mined: await page.evaluate(() => window.__SCC2.scene.getScene('Battle').coach._minedClick), hint: await page.evaluate(() => window.__SCC2.scene.getScene('Battle').coach.hintPulse) }));
    // re-read target screen pos AFTER off-click (like gate re-reads? gate does NOT — it clicks stale minPos; replicate BOTH)
    const staleClick = i % 2 === 0;
    if (!staleClick) { mp = (await markerPos()).mt; }
    await page.mouse.click(Math.round(mp.x), Math.round(mp.y), { button: 'right' });
    await page.waitForTimeout(350);
    const st = await markerPos();
    console.log('try', i, JSON.stringify({ mined: st.mined, mp: { x: Math.round(mp.x), y: Math.round(mp.y) }, step: await stepNow(), inLog: await page.evaluate(() => window.__inLog.slice(-6)) }));
    if (st.mined || (await stepNow()) !== 'harvest') { console.log('PASSED'); await browser.close(); process.exit(0); }
  }
  await page.screenshot({ path: '/tmp/probe-harvest.png' });
  await browser.close();
  process.exit(1);
})().catch(e => { console.log('PROBE ERR', e); process.exit(2); });
