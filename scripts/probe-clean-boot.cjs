// Definitive real-play check: load page (real boot), then use scene.restart
// so preload runs, WAIT for load, then count __MISSING and screenshot wide.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const phase1 = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    // wait for Battle to pass preload into create+running
    for (let i = 0; i < 40 && !sm.isActive('Battle'); i++) await new Promise(r => setTimeout(r, 100));
    const bt = sm.getScene('Battle');
    return { battleActive: sm.isActive('Battle'), keys: sm.getScenes(false).map(s=>s.key) };
  });
  console.log('phase1 after start wait:', JSON.stringify(phase1));
  // let battle run and assets settle
  await p.waitForTimeout(25000);
  const r = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    let miss = 0, miss32 = 0, total = 0;
    const byKey = {};
    bt.children.list.forEach(go => {
      total++;
      const k = go.texture && go.texture.key;
      if (k === '__MISSING') { miss++; if (go.width===32 && go.height===32) miss32++; }
    });
    // does a real mtn-0 texture exist and have pixels?
    const hasMtn = bt.textures.exists('mtn-0');
    const mtnSrc = hasMtn ? (bt.textures.get('mtn-0').getSourceImage && (()=>{const s=bt.textures.get('mtn-0').getSourceImage();return s? (s.width+'x'+s.height):'none';})()) : 'no';
    const mtnSprs = (bt._mountainSprs||[]).length;
    const mtnMissing = (bt._mountainSprs||[]).filter(s=>s.texture && s.texture.key==='__MISSING').length;
    return { totalChildren: total, miss, miss32, hasMtn, mtnSrc, mtnSprs, mtnMissing };
  });
  console.log('MISSING CHECK:', JSON.stringify(r, null, 1));
  await p.evaluate(() => { const bt = window.__SCC2.scene.getScene('Battle'); bt.cameras.main.setZoom(0.85); bt.cameras.main.centerOn(720, 720); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: '/tmp/clean-wide.png' });
  await b.close();
})();