// v2.67 probe: boot Battle properly, spawn units, verify textures + screenshot
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
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
    if (!bt) return { err: 'no Battle scene' };
    const kinds = ['rigger', 'marine', 'incinerator', 'medic', 'ghost', 'tank', 'duster', 'ballista', 'wraith', 'dropship', 'battlecruiser', 'skarling', 'razor', 'tremor', 'skywarden', 'airstinger', 'burrower', 'artificer'];
    let spawned = 0, failed = [];
    kinds.forEach((k, i) => {
      try { const u = bt.spawnUnit(0, k, 200 + (i % 6) * 50, 200 + ((i / 6) | 0) * 50, { arriveReady: true }); if (u) spawned++; else failed.push(k + ':null'); } catch (e) { failed.push(k + ':' + e.message.slice(0, 40)); }
    });
    bt.cameras.main.centerOn(280, 260);
    bt.cameras.main.setZoom(2.5);
    const texs = {};
    for (const k of ['u-marine-t0', 'u-tank-t0', 'u-battlecruiser-t0', 'u-skarnling-t1', 'u-ghost-t0', 'mtn-0', 'mtn-1', 'rock-hi0', 'rock-hi1'])
      texs[k] = bt.textures.exists(k) ? (() => { const s = bt.textures.get(k).getSourceImage(); return s.width + 'x' + s.height; })() : 'MISSING';
    return { spawned, failed, texs, scene: bt.scene.key, active: bt.scene.isActive() };
  });
  console.log(JSON.stringify(info, null, 1));
  await p.waitForTimeout(1200);
  await p.screenshot({ path: '/tmp/v267-units-z25.png' });
  await p.evaluate(() => { const bt = window.__SCC2.scene.getScene('Battle'); bt.cameras.main.setZoom(1.3); bt.cameras.main.centerOn(280, 260); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: '/tmp/v267-units-z13.png' });
  console.log('ERRORS', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'NONE');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });