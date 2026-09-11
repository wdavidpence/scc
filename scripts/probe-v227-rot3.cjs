// probe3: children census + vet chevron pipeline
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
    const battleCount = g.children.list.length;
    const total = window.__SCC2.scene.getScenes(true).map(s => s.scene.key + ':' + s.children.list.length);
    const out = { battleCount, total };
    // vet pipeline trace
    const mine = g.spawnUnit(0, 'marine', g.cameras.main.midPoint.x, g.cameras.main.midPoint.y, { arriveReady: true });
    const foe = g.units.find(x => !x.dead && x.team === 1);
    g.cameras.main.centerOn(mine.x, mine.y);
    mine._kills = 3;
    if (foe) g.applyHit(foe, 9999, 0, mine);
    await new Promise(r => setTimeout(r, 200));
    out.kills = mine._kills;
    out.dead = !!mine.dead;
    out.container = !!mine.container;
    out.camNear = g.camNear(mine.x, mine.y);
    out.gameTime = g.gameTime;
    g.polish.statusIcons(mine);
    out.d55 = g.children.list.filter(c => c.depth === 55 && c.text).map(c => c.text);
    out.stMap = g.polish._statIcons && g.polish._statIcons.get(mine.id) ? g.polish._statIcons.get(mine.id).key : null;
    await new Promise(r => setTimeout(r, 400));
    out.d55b = g.children.list.filter(c => c.depth === 55 && c.active && c.text).map(c => c.text);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error('CRASH', String(e).slice(0, 300)); process.exit(1); });
