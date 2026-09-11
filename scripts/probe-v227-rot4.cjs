// probe4: is the scene loop alive? + statusIcons guard trace
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await page.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 6000));
  });
  const r = await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const out = {};
    const t0 = g.gameTime;
    const now0 = performance.now();
    await new Promise(r => setTimeout(r, 1000));
    out.loopAlive = { gameTime: [t0, g.gameTime], realMs: performance.now() - now0 };
    // guard trace by reimplementing the early-return checks
    const mine = g.spawnUnit(0, 'marine', g.cameras.main.midPoint.x, g.cameras.main.midPoint.y, { arriveReady: true });
    mine._kills = 3;
    out.guards = {
      gameOver: !!g.gameOver, dead: !!mine.dead, container: !!mine.container,
      camNear: g.camNear(mine.x, mine.y), id: mine.id, gameTimeMs: (g.gameTime || 0) * 1000,
      siTsHasId: g.polish._siTs ? !!g.polish._siTs[mine.id] : 'no _siTs',
      children: g.children.list.length, cheap: g.polish._cheap(g)
    };
    // call statusIcons twice with force: clear throttle + prev cache
    if (g.polish._siTs) delete g.polish._siTs[mine.id];
    if (g.polish._statIcons) g.polish._statIcons.delete(mine.id);
    g.polish.statusIcons(mine);
    out.d55 = g.children.list.filter(c => c.depth === 55 && c.text && c.active).map(c => c.text);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error('CRASH', String(e).slice(0, 300)); process.exit(1); });
