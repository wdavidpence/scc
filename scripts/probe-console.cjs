// Capture Phaser console warnings during boot+create to see requested keys.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const msgs = [];
  p.on('console', m => { if (msgs.length < 60) msgs.push(m.type() + ': ' + m.text().slice(0, 160)); });
  const reqs = [];
  p.on('requestfailed', r => { if (reqs.length < 30) reqs.push('FAILED ' + r.url().slice(-70)); });
  p.on('response', r => { if (r.status() >= 400 && reqs.length < 40) reqs.push(r.status() + ' ' + r.url().slice(-70)); });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__SCC2.scene.start('Battle', { race: 'terran', enemyRace: 'skarn' }); });
  await p.waitForTimeout(7000);
  console.log('CONSOLE:', JSON.stringify(msgs.slice(0, 25), null, 1));
  console.log('BAD/FAILED NETWORK:', JSON.stringify(reqs, null, 1));
  await b.close();
})();