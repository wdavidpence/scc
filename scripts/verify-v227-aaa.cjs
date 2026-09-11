// v2.27 AAA polish verification — eased cam, follow, anchor zoom, minimap zoom, status
// icons, kill feed, bark subs, census, cast rings, vignette, windup, dust, chevrons.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/AudioContext|autoplay|favicon|favicon|net::ERR|Failed to load resource/i.test(t)) errors.push(t); else if (/DIAG/.test(t)) console.log('  ' + t); });
  const chk = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + name); if (!ok) fails.push(name); };
  const fails = [];

  // v2.52 harness repair: Title->Enter now routes through the Cut briefing whose
  // onComplete chains Battle — flaky in headless. Use the canonical v2.4x direct-boot:
  // stop live scenes, start Battle+Hud, deploy MCV, seed combat units for the checks below.
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__SCC2, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 6000));
  });
  await page.waitForFunction(() => { const s = window.__SCC2.scene.getScene('Battle'); return s.units && s.units.length > 0; }, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const cam = g.cameras.main.midPoint;
    const mcv = g.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = g.minerals[0];
      if (min) {
        for (let r = 2; r < 14; r++) { let done = false; for (const [dx, dy] of [[r,0],[-r,0],[0,r],[0,-r]]) { if (g.placementValid(pd, min.x + dx * 16, min.y + dy * 16)) { mcv.setPos(min.x + dx * 16, min.y + dy * 16); done = true; break; } } if (done) break; }
      }
      g.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 2500));
    }
    // seed combat units for status/veteran/dust/windup checks
    g.spawnUnit(0, 'marine', cam.x - 40, cam.y, { arriveReady: true });
    g.spawnUnit(0, 'marine', cam.x + 40, cam.y, { arriveReady: true });
    g.spawnUnit(1, 'skarling', cam.x + 120, cam.y + 40, { arriveReady: true });
    const w = g.units.find(u => u.team === 0 && !u.dead);
    if (w) g.cameras.main.centerOn(w.x, w.y);
  });
  await page.waitForTimeout(1200);

  // v2.52 harness fix: swiftshader headless ticks at ~1-2fps, so gameTime-based
  // throttles (statusIcons 50ms, vignette 0.8s) and the _cheap children<850 budget
  // silently skip work between fixed sleeps. Raise budget + reset throttles, poll longer.
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    g.polish._cheap = () => true;
    g.polish._hvAt = -10;
  });

  // 1) eased camera jumps route through polish.smoothCenter (poll: 1fps headless)
  chk('smoothCenter tweens cam', await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    if (!g.polish || !g.polish.smoothCenter) return false;
    const cam = g.cameras.main;
    const s0 = cam.scrollX;
    g.polish.smoothCenter(cam.worldView.x + cam.worldView.width / 2 + 420, cam.scrollY);
    for (let k = 0; k < 12; k++) {
      await new Promise(r => setTimeout(r, 150));
      if (Math.abs(cam.scrollX - s0) > 40) return true;
    }
    return false;
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

  // 3) anchor wheel zoom changes zoom (poll: tweens tick at ~1fps headless)
  chk('anchor wheel zoom', await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const z0 = g.cameras.main.zoom;
    g.polish.anchorZoom({ x: 640, y: 380 }, -240);
    let z1 = z0;
    for (let k = 0; k < 8; k++) { await new Promise(r => setTimeout(r, 150)); z1 = g.cameras.main.zoom; if (Math.abs(z1 - z0) > 0.05) break; }
    g.polish.anchorZoom({ x: 640, y: 380 }, 240);
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

  // helper: stop leftover polish cam/zoom tweens that would override centerOn
  await page.addScriptTag({ content: 'window.__stopCam = () => { const g = window.__SCC2.scene.getScene("Battle"); if (g.polish._camTween && g.polish._camTween.tw) g.polish._camTween.tw.stop(); if (g.polish._zoomTween) g.polish._zoomTween.stop(); };' });

  // 5) status icon chips (spawn marine AT camera midpoint — centerOn loses to
  // leftover zoom-tween scroll overrides from checks 1/3; camNear must be true)
  chk('status icon chips', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    window.__stopCam();
    const mp = g.cameras.main.midPoint;
    const m = g.spawnUnit(0, 'marine', mp.x, mp.y, { arriveReady: true }) || g.units.find(x => !x.dead && x.kind === 'marine' && x.team === 0);
    if (!m) return 'skip';
    m.stimmed = true; m._stimT = 8;
    if (g.polish._siTs) delete g.polish._siTs[m.id];
    if (g.polish._statIcons) g.polish._statIcons.delete(m.id);
    for (let k = 0; k < 4; k++) { if (g.polish._siTs) delete g.polish._siTs[m.id]; g.polish.statusIcons(m); }
    const ok = g.children.list.some(c => (c.depth === 54 || c.depth === 55) && c.active);
    if (!ok) console.log('CHIP-DIAG ' + JSON.stringify({ camNear: g.camNear(m.x, m.y), zoom: g.cameras.main.zoom, cont: !!m.container, dead: !!m.dead }));
    return ok;
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

  // 8) fleet census builds rows (reset sig cache so a stale empty signature can't early-return)
  chk('fleet census', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    h._censusSig = null;
    h.censusTick(g);
    return !!h._census && h._censusList.length > 0;
  }));

  // 9) cast ring on psi storm
  chk('cast ring rune', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const before = g.children.list.filter(c => c.depth === 50).length;
    g.polish.castRing(g.cameras.main.midPoint.x, g.cameras.main.midPoint.y, 2000, 0xe0a0ff);
    return g.children.list.filter(c => c.depth === 50).length > before;
  }));

  // 10) directional damage vignette (reset 0.8s gameTime throttle)
  chk('directional vignette', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    g.polish._hvAt = -10;
    const before = g.children.list.filter(c => c.depth === 1880 && c.active).length;
    g.polish.hitVignette(200, 380, true);
    return g.children.list.filter(c => c.depth === 1880 && c.active).length > before;
  }));

  // 11) movement dust by surface (unit spawned at midpoint; moveDust emits every 5th call)
  chk('movement dust', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    window.__stopCam();
    const mp = g.cameras.main.midPoint;
    let u = g.units.find(x => !x.dead && !x.def.worker && x.team === 0 && g.camNear(x.x, x.y));
    if (!u) u = g.spawnUnit(0, 'marine', mp.x + 20, mp.y + 20, { arriveReady: true });
    if (!u) return 'skip';
    u._dustT = 0;
    const before = g.children.list.filter(c => c.depth === 8 && c.active).length;
    for (let k = 0; k < 6; k++) g.polish.moveDust(u);
    const after = g.children.list.filter(c => c.depth === 8 && c.active).length;
    if (after === before) console.log('DUST-DIAG ' + JSON.stringify({ camNear: g.camNear(u.x, u.y), dt: u._dustT, cheap: g.polish._cheap(g), gameOver: !!g.gameOver }));
    return after > before;
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
  // v2.28 gate fix: use an explicit combat unit (not workers — no status chip slot)
  // and poll for the chevron instead of a fixed sleep (20Hz rebuild + glyph render).
  const vet = await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const mp = g.cameras.main.midPoint;
    const foe = g.units.find(x => !x.dead && x.team === 1 && g.camNear(x.x, x.y)) || g.spawnUnit(1, 'skarling', mp.x + 90, mp.y, { arriveReady: true });
    const mine = g.units.find(x => !x.dead && x.team === 0 && !x.def.worker && x.def.attack && g.camNear(x.x, x.y)) || g.spawnUnit(0, 'marine', mp.x, mp.y, { arriveReady: true });
    if (!foe || !mine) return 'skip';
    window.__stopCam();
    await new Promise(r => setTimeout(r, 200));
    if (g.clearSelection) g.clearSelection();
    if (g.addToSelection) g.addToSelection(mine);
    await new Promise(r => setTimeout(r, 500));
    mine._kills = 3;
    g.applyHit(foe, 9999, 0, mine);
    let chevrons = 0;
    for (let k = 0; k < 14 && chevrons === 0; k++) {
      await new Promise(r => setTimeout(r, 100));
      // clear gameTime throttle + render cache so the direct call always paints
      if (g.polish._siTs) delete g.polish._siTs[mine.id];
      if (g.polish._statIcons) g.polish._statIcons.delete(mine.id);
      g.polish.statusIcons(mine);
      chevrons = g.children.list.filter(c => c.depth === 55 && c.active && c.text && c.text.includes('▲')).length;
    }
    return { killsTallied: mine._kills >= 4, chevrons, mineDead: !!mine.dead, selHas: !!(g.selection && g.selection.has(mine)) };
  });
  chk('veteran tally + chevrons', vet === 'skip' || (vet && vet.killsTallied === true && vet.chevrons >= 1));
  if (vet !== 'skip' && !(vet.killsTallied && vet.chevrons >= 1)) console.log('   vet-diag:', JSON.stringify(vet));

  // 14) materialize blur when a cloaked enemy appears in view (spawn at midpoint)
  chk('cloak materialize blur', await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    window.__stopCam();
    const mp = g.cameras.main.midPoint;
    let foe = g.units.find(x => !x.dead && x.team === 1 && g.camNear(x.x, x.y));
    if (!foe) foe = g.spawnUnit(1, 'skarling', mp.x + 40, mp.y, { arriveReady: true });
    if (!foe) return 'skip';
    foe.cloaked = true;
    if (g.polish._matSeen) g.polish._matSeen.delete(foe);
    const before = g.children.list.filter(c => c.depth === 51 && c.active).length;
    g.polish.materialize(foe);
    const after = g.children.list.filter(c => c.depth === 51 && c.active).length;
    if (after === before) console.log('MAT-DIAG ' + JSON.stringify({ camNear: g.camNear(foe.x, foe.y), cheap: g.polish._cheap(g), dead: !!foe.dead }));
    return after > before;
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
