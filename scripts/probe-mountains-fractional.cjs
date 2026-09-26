// Verify: are this.mountains fractional coords?
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__SCC2.scene.start('Battle', { race: 'terran', enemyRace: 'skarn' }); });
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const m = bt.mountains || [];
    let frac = 0; const samples = [];
    for (const [tx, ty] of m) {
      if (!Number.isInteger(tx) || !Number.isInteger(ty)) {
        frac++;
        if (samples.length < 6) samples.push([tx, ty]);
      }
    }
    return { total: m.length, frac, samples };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();