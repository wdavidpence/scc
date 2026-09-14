// Probe: place_building step — click_build -> ghost -> spot click placement
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
    return page.evaluate((src) => { const b = window.__SCC2.scene.getScene('Battle'); const t = eval(src)(b); if (!t) return null; const c = b.cameras.main; return { x: (t.x - c.worldView.x) * c.zoom, y: (t.y - c.worldView.y) * c.zoom, wx: t.x, wy: t.y }; }, pickSrc);
  };
  const clickBtn = async (re) => {
    for (let i = 0; i < 20; i++) {
      const btn = await page.evaluate((src) => { const h = window.__SCC2.scene.getScene('Hud'); const btn = h.buttons.find(x => !x.disabled && new RegExp(src, 'i').test(String(x.txt?.text || ''))); return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null; }, re);
      if (btn) { await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2); return true; }
      await page.waitForTimeout(300);
    }
    return false;
  };
  // fast-forward to click_build
  let sp = await screenOf('b=>b.units.find(u=>u.team===0&&!u.dead&&u.def.mcv)');
  await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
  await poll(async () => (await stepNow()) === 'deploy');
  await clickBtn('DEPLOY');
  await poll(async () => (await stepNow()) !== 'deploy');
  sp = await screenOf('b=>b.buildings.find(x=>x.team===0&&x.def.primary&&!x.dead)');
  await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
  await poll(async () => (await stepNow()) === 'train_worker');
  await clickBtn('rigger');
  await poll(async () => (await stepNow()) === 'select_worker', 300, 40);
  for (let i = 0; i < 12; i++) {
    sp = await screenOf('b=>b.units.find(u=>u.team===0&&u.kind===\'rigger\'&&!u.dead)');
    if (!sp) { await page.waitForTimeout(300); continue; }
    await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
    if (await poll(async () => (await stepNow()) === 'harvest', 250, 8)) break;
  }
  // harvest lesson
  for (let k = 0; k < 6; k++) {
    sp = await screenOf('b=>b.coach.step.target()');
    if (!sp) { await page.waitForTimeout(300); continue; }
    await page.mouse.click(Math.round(sp.x), Math.round(sp.y), { button: 'right' });
    if (await poll(async () => (await stepNow()) === 'click_build', 250, 8)) break;
  }
  console.log('STEP', await stepNow());
  // click_build -> barracks button
  const bb = await clickBtn('barracks');
  console.log('BARBTN_CLICKED', bb, 'step', await stepNow());
  await page.waitForTimeout(500);
  const pl = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return { placing: !!b.placing, bid: b.placing && b.placing.buildId, isValid: b.isValid, step: b.coach.step.id }; });
  console.log('PLACING', JSON.stringify(pl));
  sp = await screenOf('b=>b.coach.buildSpot()');
  console.log('SPOT', JSON.stringify(sp));
  const why = await page.evaluate(([x, y]) => { const b = window.__SCC2.scene.getScene('Battle'); return { reason: b.placementReason('barracks', x, y) }; }, [sp.wx, sp.wy]);
  console.log('WHY', JSON.stringify(why));
  // spy snapGhost + pointermove
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    window.__snapLog = [];
    const orig = b.snapGhost.bind(b);
    b.snapGhost = (wp) => { window.__snapLog.push({ wp: { x: Math.round(wp.x), y: Math.round(wp.y) }, hasGhost: !!b.ghost }); const r = orig(wp); window.__snapLog.push({ after: { gx: b.ghost ? Math.round(b.ghost.x) : null, gy: b.ghost ? Math.round(b.ghost.y) : null, valid: b.isValid } }); return r; };
    b.input.on('pointermove', (p) => { window.__pm = { x: Math.round(p.x), y: Math.round(p.y), placing: !!b.placing, ghost: !!b.ghost }; });
  });
  // move ghost over spot then click
  await page.mouse.move(Math.round(sp.x), Math.round(sp.y));
  await page.waitForTimeout(300);
  const g1 = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return { isValid: b.isValid, gx: b.ghost ? Math.round(b.ghost.x) : 'NOGHOST', gy: b.ghost ? Math.round(b.ghost.y) : null, pm: window.__pm, snaps: (window.__snapLog || []).slice(-4) }; });
  console.log('GHOST@spot', JSON.stringify(g1));
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return { placing: !!b.placing, bars: b.buildings.filter(x => x.team === 0 && x.buildId === 'barracks').map(x => ({ x: x.x, y: x.y, built: x.built })), step: b.coach.step.id, mines: Math.round(b.players[0].minerals), inLog: (window.__inLog || []).slice(-4) }; });
  console.log('AFTER', JSON.stringify(after));
  await page.screenshot({ path: '/tmp/probe-place.png' });
  await browser.close();
})().catch(e => { console.log('PROBE ERR', e); process.exit(2); });
