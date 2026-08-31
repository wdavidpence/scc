// Live smoke check: wdavidpence.github.io/scc — title boot, mission+boss, nuke, replay.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto(process.env.LIVE_URL || 'https://wdavidpence.github.io/scc/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const live = await page.evaluate(() => {
    const g = window.__SCC2;
    if (!g) return 'NOGAME';
    const t = g.scene.getScene('Title');
    return t && t.scene.isActive() ? 'TITLE_OK' : 'NO_TITLE';
  });
  console.log('LIVE', live);
  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/live-title.png' });

  if (live === 'TITLE_OK') {
    // Mission 6: boss modifier (battlecruiser champion)
    await page.evaluate(() => {
      window.__SCC2.scene.stop('Title');
      window.__SCC2.scene.start('Battle', {
        race: 'terran', enemyRace: 'terran', difficulty: 'hard',
        mission: { n: 6, name: 'IRON WALL', enemy: 'terran', difficulty: 'hard', bonusMinerals: 0, brief: 'boss test', mods: { boss: 'battlecruiser' } }
      });
    });
    await page.waitForTimeout(4500);
    const st = await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle');
      if (!b) return 'NOB';
      return { gt: Math.round(b.gameTime), boss: b.units.some(u => u.isBoss), objs: b.objectives.map(o => o.text), ult: Math.round(b.ultimateEnergy), cmds: b.cmdCount };
    });
    console.log('LIVEBOSS', JSON.stringify(st));
    await page.screenshot({ path: '/Users/davidpence/scc-work/verify/live-boss.png' });

    // Arm and fire nuke at boss position
    const tgt = await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle');
      b.ultimateEnergy = 100; b.armUltimate();
      const f = b.units.find(u => u.isBoss) || b.units.find(u => u.team === 1);
      return f ? [f.x, f.y] : null;
    });
    await page.evaluate((t) => { const b = window.__SCC2.scene.getScene('Battle'); b.cameras.main.centerOn(t[0], t[1]); }, tgt);
    await page.waitForTimeout(300);
    await page.mouse.click(640, 380, { button: 'left' });
    await page.waitForTimeout(3800);
    const nuke = await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle');
      return { ult: Math.round(b.ultimateEnergy), bossAlive: b.units.some(u => u.isBoss), ultMode: b.ultMode };
    });
    console.log('LIVENUKE', JSON.stringify(nuke));
    await page.screenshot({ path: '/Users/davidpence/scc-work/verify/live-nuke.png' });

    // replay persistence check
    const rep = await page.evaluate(() => { const r = localStorage.getItem('scc.replay.last'); return r ? JSON.parse(r).frames.length : 0; });
    console.log('LIVEREPLAY_FRAMES', rep);
  }
  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
  console.log('LIVE RESULT:', errors.length === 0 && live === 'TITLE_OK' ? 'PASS' : 'CHECK');
  await browser.close();
})().catch(e => { console.log('FATAL', (e.stack || e.message).split('\n').slice(0, 4).join(' | ')); process.exit(1); });
