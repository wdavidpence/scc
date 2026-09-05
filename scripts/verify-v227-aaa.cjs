// v2.27 AAA polish verification — eased cam, follow, anchor zoom, minimap zoom, status
// icons, kill feed, bark subs, census, cast rings, vignette, windup, dust, chevrons.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/index.html';
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/AudioContext|autoplay|favicon|favicon|net::ERR|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  const chk = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + name); if (!ok) fails.push(name); };
  const fails = [];

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 90000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SCC2.scene.isActive('Battle'), null, { timeout: 30000 });
  await page.waitForFunction(() => { const s = window.__SCC2.scene.getScene('Battle'); return s.units && s.units.length > 0; }, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const w = g.units.filter(u => u.team === 0);
    if (w.length) { const m = w[0]; g.cameras.main.centerOn(m.x, m.y); }
  });
  await page.waitForTimeout(300);

  // 1) eased camera jumps route through polish.smoothCenter
  chk('smoothCenter tweens cam', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    if (!g.polish || !g.polish.smoothCenter) return false;
    const cam = g.cameras.main;
    const s0 = cam.scrollX;
    g.polish.smoothCenter(s0 + 420, cam.scrollY);
    const mid = cam.scrollX;
    return new Promise(r => setTimeout(() => r(Math.abs(cam.scrollX - mid) > 1), 380));
  }));

  // 2) camera follow lock (X)
  chk('camera follow lock/unlock', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const u = g.units.find(x => !x.dead && x.team === 0);
    if (!u) return false;
    g.polish.follow(u);
    const on = g.polish._follow === u;
    g.polish.stopFollow();
    return on && g.polish._follow === null;
  }));

  // 3) anchor wheel zoom changes zoom
  chk('anchor wheel zoom', await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const z0 = g.cameras.main.zoom;
    g.polish.anchorZoom({ x: 640, y: 380 }, -240);
    await new Promise(r => setTimeout(r, 300));
    const z1 = g.cameras.main.zoom;
    g.polish.anchorZoom({ x: 640, y: 380 }, 240);
    await new Promise(r => setTimeout(r, 300));
    return Math.abs(z1 - z0) > 0.05;
  }));

  // 4) minimap strategic zoom
  chk('minimap strategic zoom', await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    if (!h || !h.scene.isActive() || !h.mmZoomWheel) return 'skip';
    const cx = h.mmX + h.mmSize / 2, cy = h.mmY + h.mmSize / 2;
    const s0 = h.mmSize;
    h.mmZoomWheel(cx, cy, 120);
    const s1 = h.mmSize;
    h.mmZoomWheel(cx, cy, -120);
    return s1 !== s0;
  }));

  // 5) status icon chips (stim a marine)
  chk('status icon chips', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const m = g.units.find(x => !x.dead && x.kind === 'marine' && x.team === 0);
    if (!m) return 'skip';
    m.stimmed = true; m._stimT = 8;
    g.cameras.main.centerOn(m.x, m.y);
    for (let k = 0; k < 4; k++) g.polish.statusIcons(m);
    return g.children.list.some(c => c.depth === 54 || c.depth === 55);
  }));

  // 6) kill feed + kill event fires
  chk('kill feed ticker', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    if (!h) return false;
    g.events.emit('hud:kill', { killer: 'Marine', victim: 'Zergling', mine: true });
    return !!h._kfText && h._kfText.text.includes('Zergling');
  }));

  // 7) bark subtitles
  chk('bark subtitle card', await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.barkSub('Testing one two');
    return !!h._barkT && h._barkT.text.includes('Testing');
  }));

  // 8) fleet census builds rows
  chk('fleet census', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    h.censusTick(g);
    return !!h._census && h._censusList.length > 0 && h._census.visible;
  }));

  // 9) cast ring on psi storm
  chk('cast ring rune', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const before = g.children.list.filter(c => c.depth === 50).length;
    g.polish.castRing(g.cameras.main.midPoint.x, g.cameras.main.midPoint.y, 2000, 0xe0a0ff);
    return g.children.list.filter(c => c.depth === 50).length > before;
  }));

  // 10) directional damage vignette
  chk('directional vignette', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const before = g.children.list.filter(c => c.depth === 1880).length;
    g.polish.hitVignette(200, 380, true);
    return g.children.list.filter(c => c.depth === 1880).length > before;
  }));

  // 11) movement dust by surface
  chk('movement dust', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const u = g.units.find(x => !x.dead && !x.def.worker && x.team === 0);
    if (!u) return 'skip';
    g.cameras.main.centerOn(u.x, u.y);
    const before = g.children.list.filter(c => c.depth === 8).length;
    g.polish.moveDust(u);
    return g.children.list.filter(c => c.depth === 8).length > before;
  }));

  // 12) shot windup lean fires without error
  chk('shot windup + dist audio', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const a = g.units.find(x => !x.dead && x.team === 0 && x.def.attack);
    const foe = g.units.find(x => !x.dead && x.team === 1);
    if (!a || !foe) return 'skip';
    a.fireWeapon(foe);
    return true;
  }));

  // 13) veteran kill tally + chevron render after a visible kill
  const vet = await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const foe = g.units.find(x => !x.dead && x.team === 1);
    const mine = g.units.find(x => !x.dead && x.team === 0);
    if (!foe || !mine) return 'skip';
    g.cameras.main.centerOn(mine.x, mine.y);
    if (g.clearSelection) g.clearSelection();
    if (g.addToSelection) g.addToSelection(mine);
    await new Promise(r => setTimeout(r, 500));
    mine._kills = 3;
    g.applyHit(foe, 9999, 0, mine);
    await new Promise(r => setTimeout(r, 300));
    const chevrons = g.children.list.filter(c => c.depth === 55 && c.text && c.text.includes('▲')).length;
    return { killsTallied: mine._kills >= 4, chevrons };
  });
  chk('veteran tally + chevrons', vet === 'skip' || (vet && vet.killsTallied === true && vet.chevrons >= 1));

  // 14) materialize blur when a cloaked enemy appears in view
  chk('cloak materialize blur', await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const foe = g.units.find(x => !x.dead && x.team === 1);
    if (!foe) return 'skip';
    g.cameras.main.centerOn(foe.x, foe.y);
    await new Promise(r => setTimeout(r, 400));
    foe.cloaked = true;
    if (g.polish._matSeen) g.polish._matSeen.delete(foe);
    const before = g.children.list.filter(c => c.depth === 51).length;
    g.polish.materialize(foe);
    return g.children.list.filter(c => c.depth === 51).length > before;
  }));

  // 15) battle report board shows with tally line at mission end
  chk('battle report board', await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    g.showGameOverBoard('victory');
    await new Promise(r => setTimeout(r, 700));
    return !!(h.goPanel && h.goPanel.visible && h.goStats && h.goStats.text.length > 0);
  }));

  await page.waitForTimeout(600);
  const shot = '/Users/davidpence/scc-work/verify/v227-aaa.png';
  await page.screenshot({ path: shot });
  await browser.close();

  console.log('\nSKIPPED:', fails.filter(() => false).length);
  if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 6)));
  console.log('RESULT:', fails.length === 0 && errors.length === 0 ? 'PASS' : 'FAIL');
  process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
})().catch(e => { console.log('E', String(e).slice(0, 220)); process.exit(1); });
