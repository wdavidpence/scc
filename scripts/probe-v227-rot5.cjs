// probe5: replicate v227 gate order with guard instrumentation on checks 5/11/13
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
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
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 6000));
    const g = window.__SCC2.scene.getScene('Battle');
    const cam = g.cameras.main.midPoint;
    g.spawnUnit(0, 'marine', cam.x - 40, cam.y, { arriveReady: true });
    g.spawnUnit(0, 'marine', cam.x + 40, cam.y, { arriveReady: true });
    g.spawnUnit(1, 'skarling', cam.x + 120, cam.y + 40, { arriveReady: true });
    g.polish._cheap = () => true;
    // simulate check 1's smoothCenter (the diff vs probe4)
    g.polish.smoothCenter(g.cameras.main.worldView.x + g.cameras.main.worldView.width / 2 + 420, g.cameras.main.scrollY);
  });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const out = {};
    const m = g.units.find(x => !x.dead && x.kind === 'marine' && x.team === 0);
    if (!m) return { err: 'no marine' };
    m.stimmed = true;
    g.cameras.main.centerOn(m.x, m.y);
    await new Promise(r => setTimeout(r, 200));
    out.beforeCall = {
      camNear: g.camNear(m.x, m.y), gameOver: !!g.gameOver, container: !!m.container,
      dead: !!m.dead, siTs: g.polish._siTs ? g.polish._siTs[m.id] : 'none',
      statIconsHas: g.polish._statIcons ? g.polish._statIcons.has(m.id) : 'none',
      camScroll: [Math.round(g.cameras.main.scrollX), Math.round(g.cameras.main.scrollY)],
      mPos: [Math.round(m.x), Math.round(m.y)],
      tweenLive: g.tweens.getTweensOf(g.polish._camTween ? g.polish._camTween.pan : {}).length
    };
    if (g.polish._siTs) delete g.polish._siTs[m.id];
    if (g.polish._statIcons) g.polish._statIcons.delete(m.id);
    g.polish.statusIcons(m);
    out.afterCall = g.children.list.filter(c => (c.depth === 54 || c.depth === 55) && c.active).length;
    out.statIconsMapAfter = g.polish._statIcons ? g.polish._statIcons.has(m.id) : null;
    // dust unit
    const u = g.units.find(x => !x.dead && !x.def.worker && x.team === 0 && x !== m);
    if (u) {
      g.cameras.main.centerOn(u.x, u.y);
      const b0 = g.children.list.filter(c => c.depth === 8 && c.active).length;
      const dt0 = u._dustT || 0;
      for (let k = 0; k < 6; k++) g.polish.moveDust(u);
      out.dust = { dt0, before: b0, after: g.children.list.filter(c => c.depth === 8 && c.active).length, dt1: u._dustT };
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error('CRASH', String(e).slice(0, 300)); process.exit(1); });
