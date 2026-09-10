const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 6000));
    const bs = sm.getScene('Battle');
    const mcv = bs.units.find(u => u.def && u.def.mcv && !u.dead);
    const out = { mcvSight: mcv ? mcv.def.sight : 'nomcv', mcvPos: mcv ? [Math.round(mcv.x), Math.round(mcv.y)] : null };
    bs.updateFog();
    out.seenAfterManual = bs.seen.reduce((a, v) => a + v, 0);
    if (mcv) {
      out.idx = bs.nav.idx(Math.floor(mcv.x / 16), Math.floor(mcv.y / 16));
      out.seenAtMCV = bs.seen[out.idx];
      // manual stamp replicate
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const tx = Math.round(mcv.x / 16 + dx), ty = Math.round(mcv.y / 16 + dy);
        if (tx >= 0 && ty >= 0 && tx < 160 && ty < 160) bs.seen[bs.nav.idx(tx, ty)] = 1;
      }
      out.seenAfterReplicate = bs.seen.reduce((a, v) => a + v, 0);
    }
    return out;
  });
  console.log(JSON.stringify(r));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
