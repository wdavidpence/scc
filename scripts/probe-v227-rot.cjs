// probe: polish method inventory + depths
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
    const p = g.polish || null;
    const inv = p ? ['smoothCenter', 'follow', 'stopFollow', 'anchorZoom', 'statusIcons', 'castRing', 'hitVignette', 'moveDust', 'materialize', 'flagWave', 'buildCountdown'].map(k => k + '=' + typeof p[k]) : 'NO POLISH';
    const z0 = g.cameras.main.zoom;
    let az = 'n/a';
    if (p && p.anchorZoom) { p.anchorZoom({ x: 640, y: 380 }, -240); await new Promise(r => setTimeout(r, 350)); az = z0 + '->' + g.cameras.main.zoom; }
    let sc = 'n/a';
    if (p && p.smoothCenter) { const s0 = g.cameras.main.scrollX; p.smoothCenter(s0 + 420, g.cameras.main.scrollY); await new Promise(r => setTimeout(r, 400)); sc = Math.abs(g.cameras.main.scrollX - s0) > 1; }
    let dv = 'n/a';
    if (p && p.hitVignette) { p.hitVignette(200, 380, true); const ds = g.children.list.filter(c => c.active).map(c => c.depth); dv = { has1880: ds.includes(1880), topDepths: [...new Set(ds)].filter(d => d >= 1800).sort((a, b) => a - b) }; }
    let dust = 'n/a';
    if (p && p.moveDust) { const u = g.units.find(x => !x.dead && !x.def.worker && x.team === 0); if (u) { const before = g.children.list.filter(c => c.depth === 8 && c.active).length; p.moveDust(u); await new Promise(r => setTimeout(r, 100)); dust = { before, after: g.children.list.filter(c => c.depth === 8 && c.active).length }; } else dust = 'no combat unit'; }
    let mat = 'n/a';
    if (p && p.materialize) { const foe = g.units.find(x => !x.dead && x.team === 1); if (foe) { const before = g.children.list.filter(c => c.depth === 51 && c.active).length; p.materialize(foe); await new Promise(r => setTimeout(r, 100)); mat = { before, after: g.children.list.filter(c => c.depth === 51 && c.active).length }; } else mat = 'no foe'; }
    return { inv, az, sc, dv, dust, mat };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error('CRASH', String(e).slice(0, 300)); process.exit(1); });
