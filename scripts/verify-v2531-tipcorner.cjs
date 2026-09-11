// v2.53.1 gate: hover tip must never overlap the top-left objectives block.
// Prints per-check JSON + GATE-V2531 PASS/FAIL, exit code reflects result.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v2531_tip.png';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 5000));
    const bt = window.__SCC2.scene.getScene('Battle');
    // spawn a test unit near the top-left of the current viewport
    const cam = bt.cameras.main;
    window.__tu = bt.spawnUnit(0, 'marine', cam.scrollX + 40, cam.scrollY + 70, { arriveReady: true });
  });
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });
  const overlap = (a, c) => !(a.right < c.x || a.x > c.right || a.bottom < c.y || a.top > c.bottom);

  // 1. corner-hover: tip visible and NOT overlapping objectives block
  await p.mouse.move(30, 60, { steps: 3 });
  await p.waitForTimeout(200);
  let r1 = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await p.evaluate(() => {
      const bt = window.__SCC2.scene.getScene('Battle');
      const ap = bt.input.activePointer;
      window.__tu.order = null; window.__tu.path = [];
      window.__tu.setPos(ap.worldX, ap.worldY);
    });
    await p.mouse.move(31, 60, { steps: 1 });
    await p.mouse.move(30, 60, { steps: 1 });
    await p.waitForTimeout(200);
    r1 = await p.evaluate(() => {
      const bt = window.__SCC2.scene.getScene('Battle');
      const h = window.__SCC2.scene.getScene('Hud');
      const tb = bt._hoverTip.getBounds();
      const ob = h.objText.getBounds();
      return { alpha: bt._hoverTip.alpha, tip: { x: Math.round(tb.x), y: Math.round(tb.y), right: Math.round(tb.right) }, ob: { x: Math.round(ob.x), right: Math.round(ob.right), y: Math.round(ob.y), bottom: Math.round(ob.bottom) } };
    });
    if (r1.alpha > 0) break;
  }
  const tipVisible = r1 && r1.alpha > 0;
  const t = r1 ? r1.tip : { x: 0, y: 0, right: 0 };
  const o = r1 ? r1.ob : { x: 0, y: 0, right: 0, bottom: 0 };
  const clearOb = tipVisible && !(t.right > o.x && t.x < o.right && t.y < o.bottom);
  chk('TIP_VISIBLE_CORNER', tipVisible === true, r1);
  chk('TIP_CLEAR_OF_OBJ', clearOb === true, r1);

  // 2. tip stays on-screen
  const r2 = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const tb = bt._hoverTip.getBounds();
    return { right: Math.round(tb.right), W: bt.scale.width, onscreen: tb.right <= bt.scale.width && tb.x >= 0 };
  });
  chk('TIP_ONSCREEN', r2.onscreen === true, r2);

  // 3. mid-screen hover still behaves (no flip needed, tip tracks cursor)
  const r3 = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cam = bt.cameras.main;
    window.__tu.setPos(cam.scrollX + 700 / cam.zoom, cam.scrollY + 400 / cam.zoom);
    bt.polish.hoverGlow(window.__tu);
    const tp = bt._tipPos(700, 394);
    return { x: Math.round(tp[0]), ok: tp[0] === 700 && tp[1] === 394 };
  });
  chk('TIP_MIDSCREEN_PASSTHRU', r3.ok === true, r3);

  await p.screenshot({ path: shot });
  console.log(out.map(o => JSON.stringify(o)).join('\n'));
  const fails = out.filter(o => !o.ok);
  const errFails = errs.filter(e => !/favicon|cursor/i.test(e));
  if (fails.length || errFails.length) { console.log('GATE-V2531 FAIL', JSON.stringify(errFails.slice(0, 3))); await b.close(); process.exit(1); }
  console.log('GATE-V2531 PASS ' + out.length + '/' + out.length);
  await b.close();
})().catch(e => { console.error('FATAL', String(e)); process.exit(2); });
