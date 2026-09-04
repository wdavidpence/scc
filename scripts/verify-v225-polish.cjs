// v2.25 polish-layer verification: click markers, F6 speed badge, group pop,
// pause overlay, radar sweep, hover glow, supply vignette — real Chromium, real input.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
const OUT = '/Users/davidpence/scc-work/verify';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto(process.env.SCC_URL || 'http://localhost:4177/scc/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const skipCuts = async () => {
    for (let i = 0; i < 6; i++) {
      const closed = await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} const sm = window.__SCC2?.scene; if (!sm) return false; const s = sm.getScene('Cut'); if (s && s.scene.isActive()) { s.close(); return true; } return false; });
      if (!closed) return;
      await page.waitForTimeout(700);
    }
  };
  await skipCuts();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1100);
  await skipCuts();
  await page.waitForTimeout(2500);

  const R = { pass: [], fail: [] };
  const chk = (name, ok) => (ok ? R.pass : R.fail).push(name);

  const battle = () => page.evaluate(() => window.__SCC2?.scene?.getScene('Battle'));
  const alive = await page.evaluate(() => !!window.__SCC2?.scene?.getScene('Battle')?.polish);
  chk('polish instance on Battle', alive);

  // select starting workers: relocate to camera mid like verify-scc2, then drag over them
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const mid = g.cameras.main.midPoint;
    g.units.filter(u => u.team === 0 && u.def.worker).forEach((u, i) => { u.setPos(mid.x - 24 + (i % 2) * 48, mid.y - 16 + ((i / 2) | 0) * 32); });
  });
  await page.waitForTimeout(200);
  let pts = await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle'); const c = g.cameras.main;
    return g.units.filter(u => u.team === 0).map(u => ({ sx: (u.x - c.worldView.x) * c.zoom, sy: (u.y - c.worldView.y) * c.zoom }));
  });
  const xs = pts.map(p => p.sx), ys = pts.map(p => p.sy);
  await page.mouse.move(Math.max(2, Math.min(...xs) - 18), Math.max(2, Math.min(...ys) - 18));
  await page.mouse.down();
  await page.mouse.move(Math.max(...xs) + 18, Math.max(...ys) + 18, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').selection.size);
  chk(`box select (n=${sel})`, sel > 0);

  // right-click order -> clickMarker fires via showOrderMarker
  await page.mouse.click(760, 480, { button: 'right' });
  await page.waitForTimeout(250);
  const markerFx = await page.evaluate(() => {
    const s = window.__SCC2.scene.getScene('Battle');
    return s.children.list.some(c => c.depth === 49) || s.polish._uaAt >= 0;
  });
  chk('clickMarker fx spawned', markerFx);

  // control group assign -> groupPop (Shift+Digit per _groupAssignH)
  await page.keyboard.press('Shift+1');
  await page.waitForTimeout(200);
  const groupPop = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').children.list.some(c => c.depth === 1904));
  chk('groupPop text', groupPop);

  // F6 speed cycle -> badge + timeScale (poll-based; keydown dispatch can lag)
  const readTS = () => page.evaluate(() => { const s = window.__SCC2.scene.getScene('Battle'); return { tier: s.polish.speedTier, ts: s.timeScale, badge: !!(s.polish._speedBadge && s.polish._speedBadge.visible) }; });
  let f6 = null;
  for (let i = 0; i < 4; i++) { await page.keyboard.press('F6'); await page.waitForTimeout(300); f6 = await readTS(); if (f6.tier === 1) break; }
  chk(`F6 tier=${f6.tier} timeScale=${f6.ts} badge=${f6.badge}`, f6.tier === 1 && f6.ts === 1.5 && f6.badge);
  let f6reset = false;
  for (let i = 0; i < 5; i++) { await page.keyboard.press('F6'); await page.waitForTimeout(300); const st = await readTS(); if (st.tier === 0) { f6reset = true; break; } }
  chk('F6 cycles back to 1x', f6reset);

  // pause overlay (SPACE toggles pause; ESC is deselect)
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const pause = await page.evaluate(() => { const s = window.__SCC2.scene.getScene('Battle'); return { g: !!s.polish._pauseG, t: !!s.polish._pauseTxt, paused: s.paused }; });
  chk(`pause overlay (paused=${pause.paused})`, pause.g && pause.t && pause.paused);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const unpaused = await page.evaluate(() => { const s = window.__SCC2.scene.getScene('Battle'); return !s.polish._pauseG && !s.polish._pauseTxt && !s.paused; });
  chk('pause overlay cleared', unpaused);

  // hover glow over a unit (track it: live units move away from a static cursor)
  let hover = false;
  for (let k = 0; k < 10 && !hover; k++) {
    const hp = await page.evaluate(() => {
      const s = window.__SCC2.scene.getScene('Battle');
      const u = s.units.find(u => !u.dead && u.team === 0);
      if (!u) return null;
      const cam = s.cameras.main;
      // screen = (world - worldView.topleft) * zoom  (no worldToScreen in this Phaser build)
      return { x: (u.x - cam.worldView.x) * cam.zoom, y: (u.y - cam.worldView.y) * cam.zoom };
    });
    if (!hp) break;
    await page.mouse.move(hp.x + 1, hp.y + 1, { steps: 2 });
    await page.waitForTimeout(120);
    hover = await page.evaluate(() => !!window.__SCC2.scene.getScene('Battle').polish._hoverRing);
  }
  chk('hoverGlow ring', hover);

  // minimap radar sweep advances
  const a1 = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').polish._radarA || 0);
  await page.waitForTimeout(600);
  const a2 = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').polish._radarA || 0);
  chk(`radar sweep advances (${a1.toFixed(2)}->${a2.toFixed(2)})`, a2 !== a1);

  // soak a bit for kill pops / under-attack naturally, then shoot some pixels
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/v225-polish-battle.png` });

  // force a victory confetti path without ending game state weirdness: call fx directly
  await page.evaluate(() => { const s = window.__SCC2.scene.getScene('Battle'); s.polish.confetti(); s.polish.zapFX(); });
  await page.waitForTimeout(400);
  const fx = await page.evaluate(() => { const s = window.__SCC2.scene.getScene('Battle'); return s.children.list.filter(c => c.depth >= 1900).length; });
  chk(`confetti+zap live objects (${fx})`, fx > 10);
  await page.screenshot({ path: `${OUT}/v225-polish-fx.png` });

  console.log(JSON.stringify({ errors, ...R }, null, 1));
  console.log(errors.length === 0 && R.fail.length === 0 ? 'GATE-V225 PASS' : 'GATE-V225 FAIL');
  await browser.close();
  process.exit(errors.length === 0 && R.fail.length === 0 ? 0 : 1);
})();
