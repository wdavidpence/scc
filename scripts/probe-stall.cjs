// Why does the AI dropship stall mid-unload? Sample order/path/pos per second.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    window.__SCC2.scene.stop('Title');
    window.__SCC2.scene.start('Battle', { race: 'zerg', enemyRace: 'terran', difficulty: 'normal' });
  });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const ebase = b.buildings.find(x => x.team === 1);
    const ds = b.spawnUnit(1, 'dropship', ebase.x - 100, ebase.y + 60, { arriveReady: true });
    for (let i = 0; i < 4; i++) b.spawnUnit(1, 'marine', ebase.x - 80 + i * 20, ebase.y + 80, { arriveReady: true });
    b.gameTime = 200;
    const victim = b.units.find(u => u.team === 0 && u.def.worker);
    b.aiState.lastSeenPlayerPos = victim ? { x: victim.x, y: victim.y } : null;
    window.__ds = ds;
  });
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle');
      const ds = window.__ds;
      return { gt: Math.round(b.gameTime), x: Math.round(ds.x), y: Math.round(ds.y), order: ds.order?.type || 'none', state: ds.state, pts: ds.path.length, pi: ds.pathIndex, ua: ds.unloadAt ? [Math.round(ds.unloadAt.x), Math.round(ds.unloadAt.y)] : null, carry: ds.carry.length, flying: ds.flying, spd: ds.speed };
    });
    console.log('T' + i, JSON.stringify(s));
  }
  console.log('ERRORS', errors.length ? errors.slice(0, 3) : 'NONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
