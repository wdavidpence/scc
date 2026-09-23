// v267 close-up: spawn a lineup of units in a row, camera on them, clip-shot
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const info = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 7000));
    const bt = sm.getScene('Battle');
    if (!bt) return { err: 'no Battle' };
    const kinds = ['marine', 'incinerator', 'tank', 'ballista', 'ghost', 'medic', 'rigger', 'battlecruiser', 'wraith', 'dropship', 'duster',
      'skarling', 'razorspine', 'tremorclaw', 'skywarden', 'airstinger', 'burrower', 'artificer', 'bladeguard', 'sentinel', 'stormcaller', 'radiant', 'atlaswalker', 'umbral', 'vexwing', 'voidlance', 'sporecaster', 'corroder'];
    const report = [];
    // find a real unit to anchor near valid terrain
    const anchor = bt.units.find(u => !u.dead);
    const bx = anchor ? anchor.x : 320, by = anchor ? anchor.y : 320;
    kinds.forEach((k, i) => {
      try {
        const u = bt.spawnUnit(0, k, bx + (i % 7) * 34, by + ((i / 7) | 0) * 34, { arriveReady: true });
        report.push(k + ' -> ' + (u ? (u.def ? u.def.icon : '?') + ' tex=' + (u.sprite && u.sprite.texture ? u.sprite.texture.key : '?') : 'NULL'));
      } catch (e) { report.push(k + ' ERR ' + e.message.slice(0, 30)); }
    });
    bt.cameras.main.centerOn(bx + 100, by + 50);
    bt.cameras.main.setZoom(3);
    return { report, zoom: bt.cameras.main.zoom };
  });
  console.log(info.report.join('\n'));
  await p.waitForTimeout(1000);
  await p.screenshot({ path: '/tmp/v267-lineup-z3.png' });
  await p.evaluate(() => { const bt = window.__SCC2.scene.getScene('Battle'); bt.cameras.main.setZoom(1.6); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: '/tmp/v267-lineup-z16.png' });
  console.log('ERRORS', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'NONE');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
