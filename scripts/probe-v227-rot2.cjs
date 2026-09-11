// probe2: cheap gate, census tallies, vignette timing, vetRank thresholds
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
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 6000));
  });
  const r = await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const p = g.polish;
    const out = {};
    out.cheap = typeof p._cheap === 'function' ? p._cheap(g) : 'no fn';
    out.cheapSrc = p._cheap ? String(p._cheap).slice(0, 200) : null;
    // vignette: reset throttle, call, read immediately
    p._hvAt = -10;
    p.hitVignette(200, 380, true);
    out.vigNow = g.children.list.filter(c => c.depth === 1880 && c.active).length;
    // dust: many calls
    const u = g.units.find(x => !x.dead && !x.def.worker && x.team === 0);
    if (u) {
      const before = g.children.list.filter(c => c.depth === 8 && c.active).length;
      for (let k = 0; k < 8; k++) p.moveDust(u);
      out.dust = { hasUnit: true, cheap: p._cheap ? p._cheap(g) : null, before, after: g.children.list.filter(c => c.depth === 8 && c.active).length };
    } else out.dust = 'no unit';
    // materialize centered
    const foe = g.units.find(x => !x.dead && x.team === 1);
    if (foe) {
      g.cameras.main.centerOn(foe.x, foe.y);
      await new Promise(r => setTimeout(r, 300));
      const near = g.camNear ? g.camNear(foe.x, foe.y) : 'no camNear';
      const before = g.children.list.filter(c => c.depth === 51 && c.active).length;
      p.materialize(foe);
      out.mat = { near, cheap: p._cheap ? p._cheap(g) : null, before, after: g.children.list.filter(c => c.depth === 51 && c.active).length };
    } else out.mat = 'no foe';
    // census tallies
    const sc = g.units.filter(x => !x.dead && x.team === (g.activeTeam ?? 0));
    out.censusUnits = sc.map(x => ({ kind: x.kind, id: x.def.id, worker: !!x.def.worker }));
    h.censusTick(g);
    await new Promise(r => setTimeout(r, 100));
    out.census = { has: !!h._census, rows: h._censusList ? h._censusList.length : -1, vis: h._census ? h._census.visible : null };
    // vetRank source
    const vrSrc = p.statusIcons ? String(p.statusIcons).slice(0, 900) : null;
    out.vetRankLine = vrSrc ? (vrSrc.match(/vetRank[^\n;]*/) || [null])[0] : null;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error('CRASH', String(e).slice(0, 300)); process.exit(1); });
