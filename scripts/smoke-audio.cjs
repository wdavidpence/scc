// Audio-engine smoke: boot local build, drive the adaptive music engine,
// verify buses, intensity crossfade, boss mode, fanfare — 0 page errors.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  const url = process.env.SCC_URL || 'http://localhost:4176/scc/index.html';
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  // jump straight into battle with boss mission
  const r1 = await page.evaluate(() => {
    const g = window.__SCC2; if (!g) return 'NOGAME';
    const t = g.scene.getScene('Title'); if (t) g.scene.stop('Title');
    g.scene.start('Battle', {
      race: 'terran', enemyRace: 'zerg', difficulty: 'hard',
      mission: { n: 8, name: 'AUDIO TEST', enemy: 'zerg', difficulty: 'hard', bonusMinerals: 1000, brief: 'audio smoke', mods: { boss: 'ultralisk' } }
    });
    return 'BATTLE_STARTED';
  });
  console.log('boot:', r1);
  await page.waitForTimeout(4000);

  const r2 = await page.evaluate(() => {
    const g = window.__SCC2;
    const b = g.scene.getScene('Battle');
    const a = b.audio;
    a.init();
    a.startMusic({ boss: false });
    return {
      musicOn: !!a.musicOn,
      ctx: a.ctx ? a.ctx.state : 'none',
      buses: a.layerBuses ? Object.keys(a.layerBuses) : [],
      padG: a.layerBuses ? +a.layerBuses.pad.gain.value.toFixed(3) : -1,
      percG: a.layerBuses ? +a.layerBuses.perc.gain.value.toFixed(3) : -1,
    };
  });
  console.log('music:', JSON.stringify(r2));

  // create real engaged combat: patch 6 player units to target enemies so
  // the scene loop itself drives intensity -> markHeavyCombat
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const a = b.audio;
    a.bossTheme(true);
    const mine = b.units.filter(u => u.team === 0 && !u.dead && !u.def.worker).slice(0, 8);
    const foes = b.units.filter(u => u.team === 1 && !u.dead);
    mine.forEach((u, i) => { const f = foes[i % foes.length]; if (f) { u.target = f; } });
    // pull foes close so combatNow stays true
    const c = b.cameras.main.midPoint;
    foes.forEach((f, i) => { f.x = c.x + (i % 4) * 40 - 60; f.y = c.y + Math.floor(i / 4) * 40 - 20; });
  });
  await page.waitForTimeout(3500);
  const r3 = await page.evaluate(() => {
    const a = window.__SCC2.scene.getScene('Battle').audio;
    return {
      intensity: a._intensity,
      boss: !!a.bossMode,
      percG: +a.layerBuses.perc.gain.value.toFixed(3),
      leadG: +a.layerBuses.lead.gain.value.toFixed(3),
      padG: +a.layerBuses.pad.gain.value.toFixed(3),
    };
  });
  console.log('intense:', JSON.stringify(r3));

  // fanfare + end path
  const r4 = await page.evaluate(() => {
    const a = window.__SCC2.scene.getScene('Battle').audio;
    a.victoryFanfare();
    a.stopMusic();
    return { musicOn: !!a.musicOn, master: +a.musicBus.gain.value.toFixed(4) };
  });
  console.log('end:', JSON.stringify(r4));

  const pass = r1 === 'BATTLE_STARTED' && r2.musicOn && r2.buses.length === 3 && r3.intensity === 2 && r3.percG > 0.01 && r3.leadG > 0.01 && errors.length === 0;
  console.log('ERRORS:', errors.length, errors.slice(0, 3).join(' || '));
  console.log(pass ? 'AUDIO SMOKE: PASS' : 'AUDIO SMOKE: FAIL');
  await page.screenshot({ path: '/Users/davidpence/scc/verify-audio.png' });
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
