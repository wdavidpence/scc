// v2.19 gate: hover tooltips (unit stats w/ kills, building stats, command-card tips)
// v2.52 harness repair: env-driven URL (default :4177 preview), canonical direct-boot,
// real skarn enemy id, defensive scene guards.
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.waitForFunction(() => window.__SCC2, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 6000));
    // deploy MCV so a team-0 building exists for the building/card tooltip checks
    const b = window.__SCC2.scene.getScene('Battle');
    const mcv = b.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = b.minerals[0];
      if (min) {
        for (let r = 2; r < 14; r++) { let done = false; for (const [dx, dy] of [[r,0],[-r,0],[0,r],[0,-r]]) { if (b.placementValid(pd, min.x + dx * 16, min.y + dy * 16)) { mcv.setPos(min.x + dx * 16, min.y + dy * 16); done = true; break; } } if (done) break; }
      }
      b.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 3000));
    }
  });
  await page.waitForTimeout(1000);

  const out = {};

  // place a marine with kills under the cursor (screen center area), hover it
  const unitTip = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cam = b.cameras.main;
    const m = b.spawnUnit(0, 'marine', cam.midPoint.x, cam.midPoint.y, { arriveReady: true });
    m.kills = 7; m.level = 1;
    return { sx: Math.round(cam.midPoint.x), sy: Math.round(cam.midPoint.y) };
  });
  // camera may clamp; re-read actual screen pos
  const pos = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cam = b.cameras.main;
    const m = b.units.find(u => u.kind === 'marine' && u.kills === 7);
    const wv = cam.worldView;
    return { x: (m.x - wv.x) * cam.zoom, y: (m.y - wv.y) * cam.zoom };
  });
  await page.mouse.move(pos.x, pos.y);
  await page.waitForTimeout(50);
  await page.mouse.move(pos.x + 1, pos.y + 1);
  await page.waitForTimeout(250);
  out.unitTip = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { alpha: b._hoverTip.alpha, text: b._hoverTip.text };
  });

  // building tooltip: hover own base (recenter so it isn't in the bottom suppress zone)
  await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const m = b.units.find(u => u.kind === 'marine' && u.kills === 7); if (m) { m.x += 900; m.y += 700; m.container.setPosition(m.x, m.y); } });
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const bu = b.buildings.find(x => x.team === 0);
    b.cameras.main.centerOn(bu.x, bu.y);
  });
  await page.waitForTimeout(150);
  const bpos = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const bu = b.buildings.find(x => x.team === 0);
    const cam = b.cameras.main;
    const wv = cam.worldView;
    return { x: (bu.x - wv.x) * cam.zoom, y: (bu.y - wv.y) * cam.zoom, name: bu.def.name };
  });
  await page.mouse.move(bpos.x - 20, bpos.y - 20);
  await page.waitForTimeout(150);
  await page.mouse.move(bpos.x, bpos.y);
  await page.waitForTimeout(300);
  out.buildTip = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { alpha: b._hoverTip.alpha, text: b._hoverTip.text };
  });

  // command-card tip: select base, hover first production button
  await page.mouse.click(bpos.x, bpos.y);
  await page.waitForTimeout(400);
  const btnPos = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const btn = h.buttons.find(x => x.y > h.H - 100);
    return btn ? { x: btn.x + btn.w / 2, y: btn.y + btn.h / 2, label: btn.label.split('\n')[0] } : null;
  });
  if (btnPos) {
    await page.mouse.move(btnPos.x - 10, btnPos.y - 10);
    await page.waitForTimeout(50);
    await page.mouse.move(btnPos.x, btnPos.y);
    await page.waitForTimeout(250);
    out.cardTip = await page.evaluate(() => {
      const h = window.__SCC2.scene.getScene('Hud');
      return { has: !!h._tipT, text: h._tipT ? h._tipT.text : null };
    });
    // pointer out hides
    await page.mouse.move(btnPos.x, 300);
    await page.waitForTimeout(200);
    out.cardTipHidden = await page.evaluate(() => ({ has: !!window.__SCC2.scene.getScene('Hud')._tipT }));
  } else { out.cardTip = { has: false, noButton: true }; }

  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/v219-tips.png' });
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', errors.length ? errors.slice(0, 4) : 'NONE');
  // v2.52: real pass/fail gate (was report-only, always exit 0)
  const ok = out.unitTip && out.unitTip.alpha > 0 && /Kills 7/.test(out.unitTip.text)
    && out.buildTip && out.buildTip.alpha > 0 && /Command Center/.test(out.buildTip.text)
    && out.cardTip && out.cardTip.has === true
    && errors.length === 0;
  console.log(ok ? 'GATE-V219 PASS' : 'GATE-V219 FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
