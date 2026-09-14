// Probe: train-step diagnosis — why harvest off-block and barracks placement fail
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
  const poll = async (fn, ms = 300, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn()) return true; await page.waitForTimeout(ms); } return false; };
  const stepNow = () => page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return b.coach ? b.coach.step.id : 'DONE'; });

  // fast-forward: do steps via API clicks (world/screen mix) to reach harvest step
  // step select_mcv
  const screenOf = async (pickSrc) => {
    await page.evaluate((src) => { const b = window.__SCC2.scene.getScene('Battle'); try { b.tweens.getTweensOf(b.cameras.main).forEach(t => t.stop()); } catch (e) {} const t = eval(src)(b); if (t) b.cameras.main.centerOn(t.x, t.y); }, pickSrc);
    await page.waitForTimeout(400);
    return page.evaluate((src) => { const b = window.__SCC2.scene.getScene('Battle'); const t = eval(src)(b); if (!t) return null; const c = b.cameras.main; return { x: (t.x - c.worldView.x) * c.zoom, y: (t.y - c.worldView.y) * c.zoom, wx: t.x, wy: t.y }; }, pickSrc);
  };
  let sp = await screenOf('b=>b.units.find(u=>u.team===0&&!u.dead&&u.def.mcv)');
  await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
  await poll(async () => (await stepNow()) === 'deploy');
  // deploy button
  let dep = await page.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); const btn = h.buttons.find(x => !x.disabled && /DEPLOY/i.test(String(x.txt?.text || ''))); return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null; });
  console.log('DEP', dep);
  await page.mouse.click(dep.x + dep.w / 2, dep.y + dep.h / 2);
  await poll(async () => (await stepNow()) !== 'deploy');
  // select_base: click primary
  sp = await screenOf('b=>b.buildings.find(x=>x.team===0&&x.def.primary&&!x.dead)');
  await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
  await poll(async () => (await stepNow()) === 'train_worker');
  // worker btn
  let wk = await page.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); const btn = h.buttons.find(x => !x.disabled && /rigger/i.test(String(x.txt?.text || ''))); return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null; });
  await page.mouse.click(wk.x + wk.w / 2, wk.y + wk.h / 2);
  await poll(async () => await page.evaluate(() => window.__SCC2.scene.getScene('Battle').units.some(u => u.team === 0 && u.kind === 'rigger' && !u.dead)), 500, 40);
  await poll(async () => (await stepNow()) === 'select_worker', 300, 20);
  // select worker
  sp = await screenOf('b=>b.units.find(u=>u.team===0&&u.kind===\'rigger\'&&!u.dead)');
  await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
  await poll(async () => (await stepNow()) === 'harvest', 300, 20);
  console.log('STEP', await stepNow());

  // ==== HARVEST diag ====
  const diag1 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cc = b.buildings.find(x => x.team === 0 && x.def.primary);
    const m = b.minerals.filter(mm => cc && Math.hypot(mm.x - cc.x, mm.y - cc.y) < 16 * 24)[0] || b.minerals[0];
    const c = b.cameras.main;
    return { step: b.coach.step.id, mode: b.coach.step.mode, force: b.coach.step.force, min: m ? { x: m.x, y: m.y } : null,
      minScreen: m ? { x: (m.x - c.worldView.x) * c.zoom, y: (m.y - c.worldView.y) * c.zoom } : null,
      sel: [...b.selection].map(u => u.kind), orders: b.units.filter(u => u.team === 0 && !u.dead).map(u => ({ k: u.kind, o: u.order ? u.order.type : null })),
      mined: b.coach._minedClick, zoom: c.zoom, hint: b.coach.hintPulse };
  });
  console.log('DIAG-HARVEST', JSON.stringify(diag1));
  // off-target right click far from mineral screen pos
  await page.evaluate(() => { window.__SCC2.scene.getScene('Battle').coach.hintPulse = 0; window.__inLog.length = 0; });
  await page.mouse.click(200, 600, { button: 'right' });
  await page.waitForTimeout(300);
  const diag2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { hint: b.coach.hintPulse, mined: b.coach._minedClick, inLog: window.__inLog.slice(),
      orders: b.units.filter(u => u.team === 0 && !u.dead).map(u => ({ k: u.kind, o: u.order ? u.order.type : null })), barText: b.coach.bar.text };
  });
  console.log('DIAG-OFFCLICK', JSON.stringify(diag2));

  // correct right-click on mineral
  sp = await screenOf('b=>{const cc=b.buildings.find(x=>x.team===0&&x.def.primary);return b.minerals.filter(mm=>cc&&Math.hypot(mm.x-cc.x,mm.y-cc.y)<16*24)[0]||b.minerals[0];}');
  await page.mouse.click(Math.round(sp.x), Math.round(sp.y), { button: 'right' });
  await poll(async () => (await stepNow()) === 'click_build', 300, 20);
  console.log('STEP-after-harvest', await stepNow());

  // ==== BARRACKS diag ====
  let bar = await page.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); const btn = h.buttons.find(x => !x.disabled && /barracks/i.test(String(x.txt?.text || ''))); return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null; });
  console.log('BARBTN', JSON.stringify(bar));
  if (bar) {
    await page.mouse.click(bar.x + bar.w / 2, bar.y + bar.h / 2);
    await page.waitForTimeout(400);
    const placing = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return { placing: !!b.placing, placeBid: b.placing ? b.placing.buildId : null }; });
    console.log('PLACING', JSON.stringify(placing));
    const spot = await screenOf('b=>b.coach.buildSpot()');
    console.log('SPOT', JSON.stringify(spot));
    const why = await page.evaluate(([x, y]) => { const b = window.__SCC2.scene.getScene('Battle'); return { reason: b.placementReason('barracks', x, y) }; }, [spot.wx, spot.wy]);
    console.log('WHY', JSON.stringify(why));
    await page.mouse.click(Math.round(spot.x), Math.round(spot.y));
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return { placing: !!b.placing, bars: b.buildings.filter(x => x.team === 0 && x.buildId === 'barracks').length, step: b.coach.step.id, inLog: window.__inLog.slice(-8), alerts: '' }; });
    console.log('AFTER', JSON.stringify(after));
  }
  await page.screenshot({ path: '/tmp/probe-coach.png' });
  await browser.close();
})().catch(e => { console.log('PROBE ERR', e); process.exit(2); });
