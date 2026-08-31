// AAA pass 2 smoke: pause, tutorial, formation, voices, cinema, threats, perks.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  const URL = process.env.LIVE_URL || 'https://wdavidpence.github.io/scc/index.html';
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  // F10 tutorial launch via T key
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(2500);
  const tut = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { battle: !!b && b.scene.isActive(), tutActive: !!b.tut, step: b.tut && b.tut.i, text: b.tut && b.tut.text.text.slice(0, 40) };
  });
  console.log('TUTORIAL', JSON.stringify(tut));

  // step 1: click a worker (marker is at its screen pos)
  const wpos = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b._tutMarker;
    return m ? [m.x, m.y] : null;
  });
  if (wpos) { await page.mouse.click(Math.round(wpos[0]), Math.round(wpos[1])); }
  await page.waitForTimeout(800);
  const tut2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { step: b.tut && b.tut.i, sel: b.selection.size };
  });
  console.log('TUT_STEP1', JSON.stringify(tut2));

  // F8 pause: SPACE freezes gameTime
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const t1 = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').gameTime);
  await page.waitForTimeout(1200);
  const t2 = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').gameTime);
  console.log('PAUSE', JSON.stringify({ frozen: Math.abs(t2 - t1) < 0.05, paused: await page.evaluate(() => window.__SCC2.scene.getScene('Battle').paused) }));
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  const t3 = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').gameTime);
  console.log('RESUME', JSON.stringify({ running: t3 > t2 }));

  // F6 formation: select 4 combat units, move, measure spread
  await page.evaluate(() => window.__SCC2.scene.stop('Battle'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__SCC2.scene.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'easy' });
  });
  await page.waitForTimeout(2500);
  const form = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    // spawn 5 marines at a point and attack-move in formation
    for (let i = 0; i < 5; i++) b.spawnUnit(0, 'marine', 900 + (i % 2) * 10, 900 + ((i / 2) | 0) * 10, { arriveReady: true });
    const marines = b.units.filter(u => u.team === 0 && u.kind === 'marine');
    b.clearSelection(); marines.forEach(m => b.addToSelection(m));
    b.issueGroupMove(marines, 1500, 900, false);
    await new Promise(r => setTimeout(r, 4000));
    const xs = marines.filter(m => !m.dead).map(m => Math.round(m.y));
    const ys = new Set(xs);
    return { n: marines.length, spreadY: [...ys].sort((a, b2) => a - b2) };
  });
  console.log('FORMATION', JSON.stringify(form));

  // F6 stances
  const stance = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.setStance('hold');
    const held = b.units.filter(u => u.team === 0 && !u.def.worker && u.stance === 'hold').length;
    return { held };
  });
  console.log('STANCES', JSON.stringify(stance));

  // F3 threat engine: hand-place 3 visible enemy units offscreen near base
  const threat = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b._threatTimer = 0;
    const base = b.buildings.find(x => x.team === 0 && x.def.primary);
    const cam = b.cameras.main;
    // park camera far from base so the near-base cluster registers as offscreen threat
    cam.centerOn(base.x - 2000, base.y);
    for (let i = 0; i < 3; i++) {
      const x = base.x + 440 + i * 6, y = base.y + 440 + i * 6;
      b.spawnUnit(1, 'zergling', x, y, { arriveReady: true });
      const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
      try { b.seen[b.nav.idx(tx, ty)] = 1; } catch (e) { /* ignore */ }
    }
    // one huge-sight friendly covers cluster so isVisible passes
    const w = b.units.find(u => u.team === 0);
    let restore = null;
    if (w) { restore = w.def.sight; w.def.sight = 100; }
    b.updateThreats(0.016);
    if (w && restore != null) w.def.sight = restore;
    return { threats: b.threats.length, onscreen: (base.x + 420) > cam.worldView.x };
  });
  console.log('THREATS', JSON.stringify(threat));

  // F9 cinematic: kill enemy base directly, watch timeScale decay + board
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const eb = b.buildings.find(x => x.team === 1 && x.def.primary);
    if (eb) eb.completeConstruction(); // ensure alive
    b.endGame('victory');
  });
  await page.waitForTimeout(2600);
  const cinema = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    return { ts: b.timeScale, over: b.gameOver, boardVisible: h && h.goPanel && h.goPanel.visible, lbTop: h && h._lbTop && Math.round(h._lbTop.y) };
  });
  console.log('CINEMA', JSON.stringify(cinema));

  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
  console.log('RESULT:', errors.length === 0 ? 'PASS' : 'FAIL');
  await browser.close();
})().catch(e => { console.log('FATAL', (e.stack || e.message).split('\n').slice(0, 4).join(' | ')); process.exit(1); });
